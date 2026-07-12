import { convertToCoreMessages, streamText, tool } from 'ai';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { modeleGemini } from '@/lib/ia';
import {
  arrondiVirtuel,
  budgetConseille,
  calculerFlux,
  depensesAujourdhui,
  formaterMontant,
} from '@/lib/calculs';
import type {
  Depense,
  JournalActivite,
  Objectif,
  ProfilUtilisateur,
  Revenu,
} from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 30;

// Construit dynamiquement le system prompt à partir du profil de l'utilisateur
// et de son contexte récent (dépenses, activités), pour que l'IA connaisse
// son équipement, son mode de vie et ce qu'il a fait dernièrement.
function construireSystemPrompt(
  profil: ProfilUtilisateur | null,
  modeRoast: boolean,
  depenses: Depense[],
  revenus: Revenu[],
  objectifs: Objectif[],
  dernieresActivites: JournalActivite[],
): string {
  const dernieresDepenses = depenses.slice(0, 5);
  const flux = calculerFlux(depenses, revenus);
  const totalReserve = objectifs.reduce(
    (acc, o) => acc + Number(o.montant_actuel),
    0,
  );
  const soldeLibre = flux.soldeDisponible - totalReserve;
  const conseil = budgetConseille(soldeLibre, depensesAujourdhui(depenses));

  const resumeObjectifs = objectifs.length
    ? objectifs
        .map(
          (o) =>
            `- ${o.nom} : ${formaterMontant(Number(o.montant_actuel))} / ${formaterMontant(Number(o.montant_cible))}`,
        )
        .join('\n')
    : '- aucun objectif défini pour le moment';
  const equipements: string[] = [];
  if (profil?.a_un_frigo) equipements.push('un frigo');
  if (profil?.a_un_congelo) equipements.push('un congélateur');
  if (profil?.a_des_plaques) equipements.push('des plaques de cuisson');
  if (profil?.a_un_microondes) equipements.push('un micro-ondes');
  const listeEquipements = equipements.length
    ? equipements.join(', ')
    : 'aucun équipement de cuisine déclaré (privilégie des recettes sans cuisson)';

  const energie = profil?.niveau_energie_soir ?? 3;
  const budget = profil?.budget_mensuel_cible ?? 500000;

  const resumeDepenses = dernieresDepenses.length
    ? dernieresDepenses
        .map(
          (d) =>
            `- ${formaterMontant(Number(d.montant))} (${d.categorie}${
              d.description ? ` : ${d.description}` : ''
            })`,
        )
        .join('\n')
    : '- aucune dépense enregistrée pour le moment';

  const resumeActivites = dernieresActivites.length
    ? dernieresActivites.map((a) => `- ${a.description}`).join('\n')
    : '- aucune activité notée pour le moment';

  const base = `Tu es "Mon Coloc IA", l'assistant personnel de gestion de budget, d'anti-gaspillage et d'aide à la consommation de l'utilisateur, qui vit à Madagascar.

PROFIL DE L'UTILISATEUR :
- Revenus IRRÉGULIERS (business) : l'argent rentre parfois chaque jour, parfois rien pendant un mois. Raisonne TOUJOURS en solde disponible et en jours d'avance, jamais en salaire mensuel.
- Objectif de dépenses mensuel indicatif : ${budget} Ar (Ariary, la monnaie de Madagascar)
- Équipement de cuisine disponible : ${listeEquipements}
- Rythme de vie : ${profil?.rythme_de_vie ?? 'non précisé'}
- Niveau d'énergie le soir (1 = épuisé, 5 = en forme) : ${energie}/5

SITUATION FINANCIÈRE ACTUELLE :
- Solde disponible : ${formaterMontant(flux.soldeDisponible)}${
    totalReserve > 0
      ? ` (dont ${formaterMontant(totalReserve)} réservés pour les objectifs → ${formaterMontant(soldeLibre)} libres)`
      : ''
  }
- Entrées ce mois : ${formaterMontant(flux.entreesMois)} / Sorties ce mois : ${formaterMontant(flux.sortiesMois)}
- Rythme de dépense moyen : ${formaterMontant(flux.depenseMoyenneJour)}/jour${
    flux.runwayJours !== null
      ? ` (soit ≈ ${flux.runwayJours} jours d'avance)`
      : ''
  }
- PRÉDICTION : pour tenir 30 jours, budget conseillé ${formaterMontant(conseil.parJour)}/jour ; encore dépensable aujourd'hui : ${formaterMontant(conseil.resteAujourdhui)}

OBJECTIFS D'ÉPARGNE :
${resumeObjectifs}

DERNIÈRES DÉPENSES :
${resumeDepenses}

DERNIÈRES ACTIVITÉS NOTÉES :
${resumeActivites}

MOBILE MONEY (MVola, Orange Money, Airtel Money) :
- L'utilisateur stocke son argent sur son compte mobile money. Il te transmet ses SMS de confirmation (texte collé ou capture d'écran) : c'est ta source principale d'information sur ses opérations.
- Pour chaque SMS ou capture : détermine le SENS (argent reçu → outil "enregistrerRevenu" ; paiement, achat, envoi → outil "enregistrerDepense"), le MONTANT, les FRAIS éventuels (ajoute-les au montant de la dépense et mentionne-les), le correspondant et la date si présente.
- Un RETRAIT d'espèces (cash-out) ou un dépôt (cash-in) est un transfert interne, pas un revenu ni une dépense : ne l'enregistre pas, sauf si l'utilisateur précise à quoi sert l'argent.
- Si le SMS affiche le NOUVEAU SOLDE du compte, compare-le au solde calculé par l'app (ci-dessus) et signale tout écart important — propose d'ajouter l'opération manquante.

RÈGLES :
- Tous les montants sont en Ariary (Ar).
- Adapte TOUJOURS tes conseils et recettes à l'équipement réellement disponible. S'il n'a pas de frigo, ne propose rien qui doive être conservé au froid. S'il n'a pas de plaques, propose des repas sans cuisson.
- Tiens compte de son énergie du soir : s'il est épuisé (1-2/5), propose des solutions ultra-rapides (< 10 min).
- Quand l'utilisateur mentionne une dépense en langage naturel (ex : "50 000 Ar de courses à l'épicerie", "15 000 Ar de resto"), utilise l'outil "enregistrerDepense". Déduis la catégorie, le montant et une description courte. Pour les achats de produits (nourriture, hygiène, ménage…), remplis aussi la liste des produits pour peupler l'inventaire de la maison.
- Si l'utilisateur envoie une PHOTO (ticket de caisse, courses posées sur la table, produit…), analyse-la : identifie le montant total et les produits achetés, puis enregistre la dépense avec l'outil "enregistrerDepense" en listant les produits reconnus. Si le montant total n'est pas lisible, demande-le.
- Quand l'utilisateur dit avoir GAGNÉ, ENCAISSÉ ou REÇU de l'argent (ex : "j'ai encaissé 200 000 Ar sur une vente", "un client m'a payé 50 000 Ar"), utilise l'outil "enregistrerRevenu".
- Quand l'utilisateur raconte ce qu'il fait ou a fait (sortie, sport, cuisine, projet, événement…), note-le avec l'outil "enregistrerActivite" pour t'en souvenir, puis réagis normalement.
- Quand l'utilisateur demande combien il peut/devrait dépenser, appuie-toi sur la PRÉDICTION ci-dessus (budget conseillé par jour et reste du jour).
- Quand l'utilisateur veut mettre de côté, créer une réserve ou épargner pour quelque chose (ex : "mets 100 000 Ar de côté pour le loyer"), utilise l'outil "gererObjectif".
- Félicite les bonnes rentrées, alerte gentiment quand les jours d'avance baissent dangereusement (< 7 jours), et conseille de mettre de côté quand une grosse somme rentre.
- Quand l'utilisateur demande des prix réels, des promotions locales, ou des informations d'actualité, utilise l'outil "rechercheWeb".
- Réponds en français, de façon concise et actionnable.`;

  if (modeRoast) {
    return (
      base +
      `\n\nMODE ROAST ACTIVÉ : sois sans filtre, cash et sarcastique. Charrie l'utilisateur sur ses dépenses inutiles et son gaspillage, avec un humour mordant. Reste néanmoins utile : après la vanne, donne toujours un vrai conseil.`
    );
  }
  return base;
}

// Outil de recherche web via l'API Tavily.
async function rechercheTavily(query: string): Promise<string> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    return "La recherche web n'est pas configurée (clé Tavily manquante).";
  }

  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'basic',
      max_results: 5,
      include_answer: true,
    }),
  });

  if (!res.ok) {
    return `Erreur de recherche web (${res.status}).`;
  }

  const data = (await res.json()) as {
    answer?: string;
    results?: { title: string; url: string; content: string }[];
  };

  const resume = data.answer ? `Résumé : ${data.answer}\n\n` : '';
  const sources = (data.results ?? [])
    .map((r, i) => `${i + 1}. ${r.title} — ${r.content}\n   (${r.url})`)
    .join('\n');

  return `${resume}Sources :\n${sources}`;
}

const CATEGORIES_VALIDES = ['frigo', 'epicerie', 'hygiene', 'menage', 'autre'];

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response('Non authentifié', { status: 401 });
  }

  const { messages, modeRoast = false } = await req.json();

  const [
    { data: profil },
    { data: toutesDepenses },
    { data: tousRevenus },
    { data: tousObjectifs },
    { data: dernieresActivites },
  ] = await Promise.all([
    supabase.from('profil_utilisateur').select('*').eq('id', user.id).single(),
    supabase
      .from('depenses')
      .select('*')
      .eq('user_id', user.id)
      .order('date_transaction', { ascending: false }),
    supabase
      .from('revenus')
      .select('*')
      .eq('user_id', user.id)
      .order('date_reception', { ascending: false }),
    supabase
      .from('objectifs')
      .select('*')
      .eq('user_id', user.id)
      .order('cree_le', { ascending: true }),
    supabase
      .from('journal_activites')
      .select('*')
      .eq('user_id', user.id)
      .order('date_activite', { ascending: false })
      .limit(5),
  ]);

  const result = streamText({
    model: modeleGemini(),
    system: construireSystemPrompt(
      profil as ProfilUtilisateur | null,
      modeRoast,
      (toutesDepenses ?? []) as Depense[],
      (tousRevenus ?? []) as Revenu[],
      (tousObjectifs ?? []) as Objectif[],
      (dernieresActivites ?? []) as JournalActivite[],
    ),
    messages: convertToCoreMessages(messages),
    maxSteps: 5,
    onError: ({ error }) => {
      console.error('[api/chat] streamText error:', error);
    },
    tools: {
      rechercheWeb: tool({
        description:
          'Recherche des informations en temps réel sur Internet (prix réels, promotions locales, actualités, comparateurs). À utiliser dès que la réponse dépend de données actuelles.',
        parameters: z.object({
          query: z.string().describe('La requête de recherche en langage naturel.'),
        }),
        execute: async ({ query }) => rechercheTavily(query),
      }),
      enregistrerDepense: tool({
        description:
          "Enregistre une dépense de l'utilisateur (montant en Ariary). Pour les achats de produits, fournis aussi les produits pour peupler l'inventaire de la maison.",
        parameters: z.object({
          montant: z.number().describe('Montant de la dépense en Ariary (Ar).'),
          categorie: z
            .string()
            .describe('Catégorie, ex : Courses, Restaurant, Transport, Loisirs, Abonnement.'),
          description: z
            .string()
            .describe('Courte description libre (chaîne vide si rien à préciser).'),
          est_gaspillage: z
            .boolean()
            .describe('true si cette dépense est clairement un gaspillage assumé, sinon false.'),
          produits: z
            .array(z.string())
            .describe(
              "Noms des produits achetés, pour peupler l'inventaire (liste vide si aucun).",
            ),
          jours_conservation: z
            .array(z.number())
            .describe(
              'Durée de conservation estimée en jours pour chaque produit, dans le même ordre que "produits" (liste vide si aucun).',
            ),
          categories_produits: z
            .array(z.string())
            .describe(
              `Catégorie de chaque produit, dans le même ordre que "produits", parmi : ${CATEGORIES_VALIDES.join(', ')} (liste vide si aucun).`,
            ),
        }),
        execute: async ({
          montant,
          categorie,
          description,
          est_gaspillage,
          produits,
          jours_conservation,
          categories_produits,
        }) => {
          const { data: depense, error } = await supabase
            .from('depenses')
            .insert({
              user_id: user.id,
              montant,
              categorie,
              description: description || null,
              est_gaspillage: est_gaspillage,
              montant_arrondi_virtuel: arrondiVirtuel(montant),
            })
            .select()
            .single();

          if (error || !depense) {
            return `Impossible d'enregistrer la dépense : ${error?.message ?? 'erreur inconnue'}.`;
          }

          let nbProduits = 0;
          if (produits && produits.length > 0) {
            const lignes = produits.map((nom, i) => ({
              user_id: user.id,
              depense_id: depense.id,
              nom_produit: nom,
              jours_conservation_estimes:
                jours_conservation && jours_conservation[i] ? jours_conservation[i] : 5,
              statut: 'en_stock',
              categorie:
                categories_produits && CATEGORIES_VALIDES.includes(categories_produits[i])
                  ? categories_produits[i]
                  : 'frigo',
            }));
            const { error: invError } = await supabase
              .from('inventaire_courses')
              .insert(lignes);
            if (!invError) nbProduits = lignes.length;
          }

          const arrondi = arrondiVirtuel(montant);
          return `Dépense enregistrée : ${formaterMontant(montant)} (${categorie}). Arrondi virtuel ajouté à la cagnotte : ${formaterMontant(arrondi)}.${
            nbProduits ? ` ${nbProduits} produit(s) ajouté(s) à l'inventaire.` : ''
          }`;
        },
      }),
      enregistrerRevenu: tool({
        description:
          "Enregistre une entrée d'argent de l'utilisateur (business, vente, service rendu, salaire ponctuel, cadeau…). Montant en Ariary.",
        parameters: z.object({
          montant: z.number().describe("Montant de l'entrée d'argent en Ariary (Ar)."),
          source: z
            .string()
            .describe('Source, ex : Business, Vente, Service, Salaire, Cadeau, Autre.'),
          description: z
            .string()
            .describe('Courte description libre (chaîne vide si rien à préciser).'),
        }),
        execute: async ({ montant, source, description }) => {
          const { error } = await supabase.from('revenus').insert({
            user_id: user.id,
            montant,
            source,
            description: description || null,
          });
          if (error) {
            return `Impossible d'enregistrer l'entrée d'argent : ${error.message}.`;
          }
          return `Entrée d'argent enregistrée : ${formaterMontant(montant)} (${source}).`;
        },
      }),
      gererObjectif: tool({
        description:
          "Gère les objectifs d'épargne (réserves virtuelles) : créer un objectif, y ajouter de l'argent mis de côté, ou en retirer. Montants en Ariary.",
        parameters: z.object({
          action: z
            .enum(['creer', 'alimenter', 'retirer'])
            .describe(
              "'creer' = nouvel objectif (montant = cible à atteindre) ; 'alimenter' = mettre de côté ; 'retirer' = reprendre de l'argent.",
            ),
          nom: z.string().describe("Nom de l'objectif, ex : Loyer, Moto, Écolage."),
          montant: z.number().describe('Montant en Ariary (Ar).'),
        }),
        execute: async ({ action, nom, montant }) => {
          if (action === 'creer') {
            const { error } = await supabase.from('objectifs').insert({
              user_id: user.id,
              nom,
              montant_cible: montant,
            });
            if (error) return `Impossible de créer l'objectif : ${error.message}.`;
            return `Objectif « ${nom} » créé, cible : ${formaterMontant(montant)}.`;
          }

          const { data: existants } = await supabase
            .from('objectifs')
            .select('*')
            .eq('user_id', user.id)
            .ilike('nom', `%${nom}%`)
            .limit(1);
          const objectif = (existants ?? [])[0] as Objectif | undefined;
          if (!objectif) {
            return `Aucun objectif ne correspond à « ${nom} ». Propose à l'utilisateur de le créer.`;
          }

          const sens = action === 'alimenter' ? 1 : -1;
          const nouveau = Math.max(
            0,
            Number(objectif.montant_actuel) + sens * montant,
          );
          const { error } = await supabase
            .from('objectifs')
            .update({ montant_actuel: nouveau })
            .eq('id', objectif.id);
          if (error) return `Impossible de mettre à jour l'objectif : ${error.message}.`;
          return `Objectif « ${objectif.nom} » : ${formaterMontant(nouveau)} / ${formaterMontant(Number(objectif.montant_cible))} mis de côté.`;
        },
      }),
      enregistrerActivite: tool({
        description:
          "Note une activité ou un événement de la vie de l'utilisateur (sortie, sport, cuisine, projet, rendez-vous…) pour t'en souvenir et personnaliser tes conseils.",
        parameters: z.object({
          description: z
            .string()
            .describe("Description courte de l'activité, ex : « Footing 5 km ce matin »."),
        }),
        execute: async ({ description }) => {
          const { error } = await supabase.from('journal_activites').insert({
            user_id: user.id,
            description,
          });
          if (error) {
            return `Impossible de noter l'activité : ${error.message}.`;
          }
          return `Activité notée : ${description}`;
        },
      }),
    },
  });

  return result.toDataStreamResponse({
    getErrorMessage: (error) => {
      if (error instanceof Error) return error.message;
      return String(error);
    },
  });
}
