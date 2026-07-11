import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { joursAvantPeremption } from '@/lib/calculs';
import type { InventaireItem, ProfilUtilisateur } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 30;

// POST — génère une recette instantanée à partir des ingrédients en stock,
// en tenant compte de l'équipement de cuisine et de l'énergie de l'utilisateur.
export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const [{ data: inventaire }, { data: profil }] = await Promise.all([
    supabase
      .from('inventaire_courses')
      .select('*')
      .eq('user_id', user.id)
      .eq('statut', 'en_stock'),
    supabase.from('profil_utilisateur').select('*').eq('id', user.id).single(),
  ]);

  const items = (inventaire ?? []) as InventaireItem[];
  if (items.length === 0) {
    return NextResponse.json({
      recette:
        "Ton frigo est vide côté inventaire. Ajoute des courses via le chat (ex : « 30€ de courses : poulet, riz, courgettes ») pour que je te concocte une recette.",
    });
  }

  const p = profil as ProfilUtilisateur | null;
  const equipements: string[] = [];
  if (p?.a_un_frigo) equipements.push('frigo');
  if (p?.a_un_congelo) equipements.push('congélateur');
  if (p?.a_des_plaques) equipements.push('plaques de cuisson');
  if (p?.a_un_microondes) equipements.push('micro-ondes');

  // Trie les ingrédients par urgence de péremption pour prioriser l'anti-gaspillage.
  const ingredientsTries = [...items]
    .map((i) => ({
      nom: i.nom_produit,
      jours: joursAvantPeremption(i.date_achat, i.jours_conservation_estimes),
    }))
    .sort((a, b) => a.jours - b.jours);

  const listeIngredients = ingredientsTries
    .map((i) => `- ${i.nom} (à consommer sous ${i.jours} jour(s))`)
    .join('\n');

  const { text } = await generateText({
    model: google('gemini-2.0-flash'),
    system: `Tu es un chef anti-gaspillage. Tu proposes UNE recette réalisable uniquement avec les ingrédients fournis (des basiques comme sel, poivre, huile, eau sont autorisés).
Équipement disponible : ${equipements.join(', ') || 'aucun (recette sans cuisson exigée)'}.
Énergie de l'utilisateur ce soir : ${p?.niveau_energie_soir ?? 3}/5 (adapte le temps de préparation en conséquence).
Priorise les ingrédients qui périment le plus vite. Réponds en français avec : un titre, le temps de préparation, la liste des ingrédients utilisés, puis les étapes numérotées. Sois concret et bref.`,
    prompt: `Voici mon inventaire, trié par urgence de péremption :\n${listeIngredients}\n\nQu'est-ce qu'on mange ?`,
  });

  return NextResponse.json({ recette: text });
}
