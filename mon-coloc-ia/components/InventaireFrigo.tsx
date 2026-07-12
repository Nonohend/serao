'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Brush,
  Check,
  ChefHat,
  Droplets,
  Plus,
  Refrigerator,
  RotateCw,
  ShoppingBasket,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { joursAvantPeremption } from '@/lib/calculs';
import {
  CATEGORIES_INVENTAIRE,
  type InventaireItem,
  type StatutInventaire,
} from '@/lib/types';

const ICONES_CATEGORIE: Record<string, LucideIcon> = {
  frigo: Refrigerator,
  epicerie: ShoppingBasket,
  hygiene: Droplets,
  menage: Brush,
  autre: Box,
};

function IconeCategorie({ slug, taille = 14 }: { slug: string; taille?: number }) {
  const Icone = ICONES_CATEGORIE[slug] ?? Box;
  return <Icone size={taille} strokeWidth={2} className="text-slate-400" />;
}

function badgePeremption(jours: number): { label: string; classe: string } {
  if (jours < 0)
    return { label: 'Périmé', classe: 'bg-rose-500/20 text-rose-300 border-rose-400/30' };
  if (jours === 0)
    return { label: "Aujourd'hui", classe: 'bg-rose-500/20 text-rose-300 border-rose-400/30' };
  if (jours <= 2)
    return { label: `${jours} j`, classe: 'bg-amber-500/20 text-amber-300 border-amber-400/30' };
  return { label: `${jours} j`, classe: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30' };
}


export default function InventaireFrigo() {
  const supabase = createClient();
  const [items, setItems] = useState<InventaireItem[]>([]);
  const [chargement, setChargement] = useState(true);
  const [filtre, setFiltre] = useState<string>('tous');
  const [recette, setRecette] = useState<string | null>(null);
  const [genereRecette, setGenereRecette] = useState(false);

  // Formulaire d'ajout manuel.
  const [formOuvert, setFormOuvert] = useState(false);
  const [nomProduit, setNomProduit] = useState('');
  const [categorieForm, setCategorieForm] = useState<string>('frigo');
  const [joursForm, setJoursForm] = useState('5');
  const [ajoutEnCours, setAjoutEnCours] = useState(false);
  const [erreurAjout, setErreurAjout] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setChargement(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setChargement(false);
      return;
    }
    const { data } = await supabase
      .from('inventaire_courses')
      .select('*')
      .eq('user_id', user.id)
      .eq('statut', 'en_stock');

    const tries = ((data ?? []) as InventaireItem[]).sort(
      (a, b) =>
        joursAvantPeremption(a.date_achat, a.jours_conservation_estimes) -
        joursAvantPeremption(b.date_achat, b.jours_conservation_estimes),
    );
    setItems(tries);
    setChargement(false);
  }, [supabase]);

  useEffect(() => {
    charger();
  }, [charger]);

  async function ajouterProduit(e: React.FormEvent) {
    e.preventDefault();
    const nom = nomProduit.trim();
    const jours = Number(joursForm);
    if (!nom || !Number.isFinite(jours) || jours <= 0) return;

    setAjoutEnCours(true);
    setErreurAjout(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setAjoutEnCours(false);
      return;
    }

    const { error } = await supabase.from('inventaire_courses').insert({
      user_id: user.id,
      nom_produit: nom,
      jours_conservation_estimes: jours,
      statut: 'en_stock',
      categorie: categorieForm,
    });

    if (error) {
      setErreurAjout(
        error.message.includes('categorie')
          ? "La colonne « categorie » n'existe pas encore : exécute la migration v2 dans Supabase (SQL Editor)."
          : `Erreur : ${error.message}`,
      );
    } else {
      setNomProduit('');
      setJoursForm('5');
      await charger();
    }
    setAjoutEnCours(false);
  }

  async function changerStatut(id: string, statut: StatutInventaire) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    await supabase.from('inventaire_courses').update({ statut }).eq('id', id);
  }

  async function genererRecette() {
    setGenereRecette(true);
    setRecette(null);
    try {
      const res = await fetch('/api/recette', { method: 'POST' });
      const data = await res.json();
      setRecette(data.recette ?? data.error ?? 'Aucune recette générée.');
    } catch {
      setRecette('Erreur lors de la génération de la recette.');
    } finally {
      setGenereRecette(false);
    }
  }

  const compteParCategorie = new Map<string, number>();
  for (const item of items) {
    const cat = item.categorie ?? 'frigo';
    compteParCategorie.set(cat, (compteParCategorie.get(cat) ?? 0) + 1);
  }

  const itemsAffiches =
    filtre === 'tous'
      ? items
      : items.filter((i) => (i.categorie ?? 'frigo') === filtre);

  return (
    <div className="animate-fade-in space-y-4">
      <section className="glass p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-100">
              Inventaire de la maison
            </p>
            <p className="text-[11px] text-slate-500">
              Trié par urgence de péremption
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFormOuvert((v) => !v)}
              className="flex items-center gap-1.5 rounded-full border border-accent-soft/40 bg-accent/20 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent/40"
            >
              {formOuvert ? (
                <>
                  <X size={13} strokeWidth={2.4} /> Fermer
                </>
              ) : (
                <>
                  <Plus size={13} strokeWidth={2.4} /> Ajouter
                </>
              )}
            </button>
            <button
              onClick={charger}
              className="p-1 text-slate-400 transition hover:text-white"
              aria-label="Rafraîchir"
            >
              <RotateCw size={14} strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* Formulaire d'ajout manuel */}
        {formOuvert && (
          <form
            onSubmit={ajouterProduit}
            className="animate-slide-down mt-4 space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3"
          >
            <input
              value={nomProduit}
              onChange={(e) => setNomProduit(e.target.value)}
              placeholder="Nom du produit (ex : riz, savon…)"
              className="glass-input"
              required
            />
            <div className="flex gap-2">
              <select
                value={categorieForm}
                onChange={(e) => setCategorieForm(e.target.value)}
                className="glass-input flex-1"
              >
                {CATEGORIES_INVENTAIRE.map((c) => (
                  <option key={c.slug} value={c.slug} className="bg-slate-900">
                    {c.label}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={1}
                  value={joursForm}
                  onChange={(e) => setJoursForm(e.target.value)}
                  className="glass-input w-20"
                  required
                />
                <span className="text-xs text-slate-500">jours</span>
              </div>
            </div>
            {erreurAjout && (
              <p className="text-xs text-rose-300">{erreurAjout}</p>
            )}
            <button
              type="submit"
              disabled={ajoutEnCours}
              className="glass-button-accent w-full py-2 text-sm"
            >
              {ajoutEnCours ? 'Ajout…' : 'Ajouter au stock'}
            </button>
          </form>
        )}

        {/* Filtres par catégorie */}
        <div className="mt-4 flex gap-1.5 overflow-x-auto pb-1">
          <button
            onClick={() => setFiltre('tous')}
            className={`shrink-0 rounded-full border px-3 py-1 text-xs transition ${
              filtre === 'tous'
                ? 'border-accent-soft/50 bg-accent/30 text-white'
                : 'border-white/10 bg-white/[0.04] text-slate-400'
            }`}
          >
            Tous ({items.length})
          </button>
          {CATEGORIES_INVENTAIRE.map((c) => (
            <button
              key={c.slug}
              onClick={() => setFiltre(c.slug)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition ${
                filtre === c.slug
                  ? 'border-accent-soft/50 bg-accent/30 text-white'
                  : 'border-white/10 bg-white/[0.04] text-slate-400'
              }`}
            >
              <IconeCategorie slug={c.slug} taille={12} />
              {c.label} ({compteParCategorie.get(c.slug) ?? 0})
            </button>
          ))}
        </div>

        <div className="mt-3">
          {chargement ? (
            <p className="text-sm text-slate-500">Chargement…</p>
          ) : itemsAffiches.length === 0 ? (
            <p className="text-sm text-slate-500">
              {filtre === 'tous'
                ? 'Inventaire vide. Utilise « ＋ Ajouter » ou raconte tes courses au chat.'
                : 'Rien dans cette catégorie pour le moment.'}
            </p>
          ) : (
            <ul className="space-y-2">
              {itemsAffiches.map((item, i) => {
                const jours = joursAvantPeremption(
                  item.date_achat,
                  item.jours_conservation_estimes,
                );
                const badge = badgePeremption(jours);
                return (
                  <li
                    key={item.id}
                    className="animate-pop-in flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2.5 transition hover:bg-white/[0.06]"
                    style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="shrink-0">
                        <IconeCategorie slug={item.categorie ?? 'frigo'} />
                      </span>
                      <span
                        className={`shrink-0 rounded-lg border px-2 py-0.5 text-[11px] font-medium ${badge.classe}`}
                      >
                        {badge.label}
                      </span>
                      <span className="truncate text-sm text-slate-200">
                        {item.nom_produit}
                      </span>
                    </div>
                    <div className="ml-2 flex shrink-0 gap-1.5">
                      <button
                        onClick={() => changerStatut(item.id, 'consomme')}
                        className="rounded-lg bg-emerald-500/15 p-1.5 text-emerald-300 transition hover:bg-emerald-500/25"
                        title="Marquer utilisé / consommé"
                      >
                        <Check size={13} strokeWidth={2.6} />
                      </button>
                      <button
                        onClick={() => changerStatut(item.id, 'gaspille')}
                        className="rounded-lg bg-rose-500/15 p-1.5 text-rose-300 transition hover:bg-rose-500/25"
                        title="Marquer gaspillé"
                      >
                        <Trash2 size={13} strokeWidth={2.2} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <button
        onClick={genererRecette}
        disabled={genereRecette}
        className="glass-button-accent flex w-full items-center justify-center gap-2"
      >
        <ChefHat size={17} strokeWidth={2.2} />
        {genereRecette ? 'Le chef réfléchit…' : "Qu'est-ce qu'on mange ?"}
      </button>

      {recette && (
        <section className="glass animate-fade-in p-5">
          <p className="mb-2 text-sm font-medium text-slate-100">
            Recette anti-gaspillage
          </p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">
            {recette}
          </p>
        </section>
      )}
    </div>
  );
}
