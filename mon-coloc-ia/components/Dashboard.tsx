'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  arrondiVirtuel,
  cagnotteArrondis,
  calculerFlux,
  compteurDeLaHonte,
  couleurFlux,
  depensesDuMois,
  depensesParJour,
  formaterMontant,
} from '@/lib/calculs';
import type { Depense, ProfilUtilisateur, Revenu } from '@/lib/types';

const CATEGORIES_DEPENSE = [
  'Courses',
  'Restaurant',
  'Transport',
  'Loisirs',
  'Santé',
  'Abonnement',
  'Autre',
];

const SOURCES_REVENU = ['Business', 'Vente', 'Service', 'Salaire', 'Cadeau', 'Autre'];

// Ligne unifiée pour la liste des opérations (dépenses + entrées).
interface Operation {
  id: string;
  table: 'depenses' | 'revenus';
  montant: number;
  libelle: string;
  sousLibelle: string;
  date: string;
  gaspillage: boolean;
}

export default function Dashboard() {
  const supabase = createClient();
  const [depenses, setDepenses] = useState<Depense[]>([]);
  const [revenus, setRevenus] = useState<Revenu[]>([]);
  const [revenusDisponibles, setRevenusDisponibles] = useState(true);
  const [profil, setProfil] = useState<ProfilUtilisateur | null>(null);
  const [chargement, setChargement] = useState(true);
  const [nbOperationsAffichees, setNbOperationsAffichees] = useState(8);

  // Formulaire d'ajout rapide (dépense OU entrée d'argent).
  const [formOuvert, setFormOuvert] = useState(false);
  const [typeForm, setTypeForm] = useState<'depense' | 'revenu'>('depense');
  const [montantForm, setMontantForm] = useState('');
  const [categorieForm, setCategorieForm] = useState('Courses');
  const [sourceForm, setSourceForm] = useState('Business');
  const [descriptionForm, setDescriptionForm] = useState('');
  const [gaspillageForm, setGaspillageForm] = useState(false);
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

    const [depensesRes, revenusRes, profilRes] = await Promise.all([
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
      supabase.from('profil_utilisateur').select('*').eq('id', user.id).single(),
    ]);

    setDepenses((depensesRes.data ?? []) as Depense[]);
    setRevenus((revenusRes.data ?? []) as Revenu[]);
    // Table absente tant que la migration v3 n'a pas été exécutée.
    setRevenusDisponibles(!revenusRes.error);
    setProfil((profilRes.data ?? null) as ProfilUtilisateur | null);
    setChargement(false);
  }, [supabase]);

  useEffect(() => {
    charger();
  }, [charger]);

  async function ajouterOperation(e: React.FormEvent) {
    e.preventDefault();
    const montant = Number(montantForm);
    if (!Number.isFinite(montant) || montant <= 0) return;

    setAjoutEnCours(true);
    setErreurAjout(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setAjoutEnCours(false);
      return;
    }

    const { error } =
      typeForm === 'depense'
        ? await supabase.from('depenses').insert({
            user_id: user.id,
            montant,
            categorie: categorieForm,
            description: descriptionForm.trim() || null,
            est_gaspillage: gaspillageForm,
            montant_arrondi_virtuel: arrondiVirtuel(montant),
          })
        : await supabase.from('revenus').insert({
            user_id: user.id,
            montant,
            source: sourceForm,
            description: descriptionForm.trim() || null,
          });

    if (error) {
      setErreurAjout(
        typeForm === 'revenu' && !revenusDisponibles
          ? 'La table des entrées n’existe pas encore : exécute la migration v3 dans Supabase (SQL Editor).'
          : `Erreur : ${error.message}`,
      );
    } else {
      setMontantForm('');
      setDescriptionForm('');
      setGaspillageForm(false);
      setFormOuvert(false);
      await charger();
    }
    setAjoutEnCours(false);
  }

  async function supprimerOperation(op: Operation) {
    if (op.table === 'depenses') {
      setDepenses((prev) => prev.filter((d) => d.id !== op.id));
    } else {
      setRevenus((prev) => prev.filter((r) => r.id !== op.id));
    }
    await supabase.from(op.table).delete().eq('id', op.id);
  }

  const flux = calculerFlux(depenses, revenus);
  const duMois = depensesDuMois(depenses);
  const cagnotte = cagnotteArrondis(duMois);
  const honte = compteurDeLaHonte(duMois);
  const graphique = useMemo(() => depensesParJour(depenses, 14), [depenses]);
  const maxJour = Math.max(1, ...graphique.map((j) => j.total));
  const objectif = Number(profil?.budget_mensuel_cible ?? 0);

  // Top 3 catégories du mois.
  const topCategories = useMemo(() => {
    const totaux = new Map<string, number>();
    for (const d of duMois) {
      totaux.set(d.categorie, (totaux.get(d.categorie) ?? 0) + Number(d.montant));
    }
    const total = Array.from(totaux.values()).reduce((a, b) => a + b, 0);
    return Array.from(totaux.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([categorie, montant]) => ({
        categorie,
        montant,
        part: total > 0 ? Math.round((montant / total) * 100) : 0,
      }));
  }, [duMois]);

  // Liste unifiée des opérations, la plus récente d'abord.
  const operations: Operation[] = useMemo(() => {
    const lignes: Operation[] = [
      ...depenses.map((d) => ({
        id: d.id,
        table: 'depenses' as const,
        montant: -Number(d.montant),
        libelle: d.description || d.categorie,
        sousLibelle: d.categorie,
        date: d.date_transaction,
        gaspillage: d.est_gaspillage,
      })),
      ...revenus.map((r) => ({
        id: r.id,
        table: 'revenus' as const,
        montant: Number(r.montant),
        libelle: r.description || r.source || 'Entrée d’argent',
        sousLibelle: r.source ?? 'Entrée',
        date: r.date_reception,
        gaspillage: false,
      })),
    ];
    return lignes.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
  }, [depenses, revenus]);

  const couleurSolde =
    flux.soldeDisponible < 0 ? 'text-rose-400' : couleurFlux(flux.niveau);

  return (
    <div className="animate-fade-in space-y-4">
      {/* Solde disponible + jours d'avance */}
      <section className="glass p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-400">Argent disponible</p>
          <button
            onClick={charger}
            className="text-xs text-slate-400 transition hover:text-white"
            aria-label="Rafraîchir"
          >
            ↻ Actualiser
          </button>
        </div>
        <p className={`mt-1 text-4xl font-bold tracking-tight ${couleurSolde}`}>
          {chargement ? '…' : formaterMontant(flux.soldeDisponible)}
        </p>
        <p className="mt-2 text-xs text-slate-400">
          {chargement ? (
            ' '
          ) : !revenusDisponibles ? (
            <span className="text-amber-300">
              Exécute la migration v3 dans Supabase pour activer les entrées
              d&apos;argent.
            </span>
          ) : flux.runwayJours !== null ? (
            <>
              À ton rythme ({formaterMontant(flux.depenseMoyenneJour)}/jour), tu
              as{' '}
              <span className={`font-semibold ${couleurFlux(flux.niveau)}`}>
                ≈ {flux.runwayJours} jours d&apos;avance
              </span>
              .
            </>
          ) : (
            'Enregistre tes entrées et dépenses pour voir tes jours d’avance.'
          )}
        </p>
      </section>

      {/* Entrées / Sorties du mois */}
      <div className="grid grid-cols-2 gap-4">
        <section className="glass-soft p-4">
          <p className="text-xs text-slate-400">Entré ce mois</p>
          <p className="mt-1 text-xl font-bold text-emerald-300">
            +{formaterMontant(flux.entreesMois)}
          </p>
        </section>
        <section className="glass-soft p-4">
          <p className="text-xs text-slate-400">Sorti ce mois</p>
          <p className="mt-1 text-xl font-bold text-rose-300">
            −{formaterMontant(flux.sortiesMois)}
          </p>
          {objectif > 0 && (
            <div className="mt-2">
              <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full ${
                    flux.sortiesMois > objectif ? 'bg-rose-400' : 'bg-emerald-400'
                  }`}
                  style={{
                    width: `${Math.min(100, Math.round((flux.sortiesMois / objectif) * 100))}%`,
                  }}
                />
              </div>
              <p className="mt-1 text-[10px] text-slate-500">
                objectif : {formaterMontant(objectif)}
              </p>
            </div>
          )}
        </section>
      </div>

      {/* Graphique des 14 derniers jours */}
      <section className="glass p-5">
        <p className="text-sm text-slate-400">Dépenses des 14 derniers jours</p>
        <div className="mt-3 flex h-24 items-end gap-1">
          {graphique.map((jour, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <div
                className={`w-full rounded-t ${
                  jour.total > 0 ? 'bg-accent/70' : 'bg-white/5'
                }`}
                style={{
                  height: `${Math.max(3, Math.round((jour.total / maxJour) * 100))}%`,
                }}
                title={`${jour.label} : ${formaterMontant(jour.total)}`}
              />
              {i % 2 === 1 && (
                <span className="text-[9px] text-slate-600">{jour.label}</span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Top catégories du mois */}
      {topCategories.length > 0 && (
        <section className="glass p-5">
          <p className="mb-3 text-sm text-slate-400">Où part l&apos;argent ce mois</p>
          <div className="space-y-2.5">
            {topCategories.map((c) => (
              <div key={c.categorie}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-slate-300">{c.categorie}</span>
                  <span className="text-slate-400">
                    {formaterMontant(c.montant)} · {c.part}%
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-sky-400/80"
                    style={{ width: `${c.part}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Cagnotte des arrondis + Compteur de la honte */}
      <div className="grid grid-cols-2 gap-4">
        <section className="glass-soft p-4">
          <p className="text-xs text-slate-400">Cagnotte arrondis</p>
          <p className="mt-1 text-2xl font-bold text-sky-300">
            {formaterMontant(cagnotte)}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">épargne indolore ce mois</p>
        </section>
        <section className="glass-soft p-4">
          <p className="text-xs text-slate-400">Compteur de la honte</p>
          <p className="mt-1 text-2xl font-bold text-rose-400">
            {formaterMontant(honte)}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">gaspillage assumé</p>
        </section>
      </div>

      {/* Ajout rapide : dépense OU entrée d'argent */}
      <section className="glass p-4">
        <button
          onClick={() => setFormOuvert((v) => !v)}
          className="flex w-full items-center justify-between text-sm"
        >
          <span className="font-medium text-slate-100">＋ Ajouter une opération</span>
          <span className="text-slate-500">{formOuvert ? '▲' : '▼'}</span>
        </button>

        {formOuvert && (
          <form onSubmit={ajouterOperation} className="mt-3 space-y-2">
            <div className="flex gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
              <button
                type="button"
                onClick={() => setTypeForm('depense')}
                className={`flex-1 rounded-lg py-2 text-sm transition ${
                  typeForm === 'depense'
                    ? 'bg-rose-500/25 font-medium text-rose-200'
                    : 'text-slate-400'
                }`}
              >
                − Dépense
              </button>
              <button
                type="button"
                onClick={() => setTypeForm('revenu')}
                className={`flex-1 rounded-lg py-2 text-sm transition ${
                  typeForm === 'revenu'
                    ? 'bg-emerald-500/25 font-medium text-emerald-200'
                    : 'text-slate-400'
                }`}
              >
                ＋ Entrée d&apos;argent
              </button>
            </div>

            <div className="flex gap-2">
              <input
                type="number"
                min={1}
                inputMode="numeric"
                value={montantForm}
                onChange={(e) => setMontantForm(e.target.value)}
                placeholder="Montant"
                className="glass-input flex-1"
                required
              />
              <span className="flex items-center text-slate-400">Ar</span>
            </div>

            {typeForm === 'depense' ? (
              <select
                value={categorieForm}
                onChange={(e) => setCategorieForm(e.target.value)}
                className="glass-input"
              >
                {CATEGORIES_DEPENSE.map((c) => (
                  <option key={c} value={c} className="bg-slate-900">
                    {c}
                  </option>
                ))}
              </select>
            ) : (
              <select
                value={sourceForm}
                onChange={(e) => setSourceForm(e.target.value)}
                className="glass-input"
              >
                {SOURCES_REVENU.map((s) => (
                  <option key={s} value={s} className="bg-slate-900">
                    {s}
                  </option>
                ))}
              </select>
            )}

            <input
              value={descriptionForm}
              onChange={(e) => setDescriptionForm(e.target.value)}
              placeholder="Description (optionnel)"
              className="glass-input"
            />

            {typeForm === 'depense' && (
              <button
                type="button"
                onClick={() => setGaspillageForm((v) => !v)}
                className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition ${
                  gaspillageForm
                    ? 'border-rose-400/40 bg-rose-500/20 text-rose-200'
                    : 'border-white/10 bg-white/[0.03] text-slate-400'
                }`}
              >
                <span>{gaspillageForm ? '☑' : '☐'}</span>
                C&apos;était du gaspillage, j&apos;assume 😅
              </button>
            )}

            {erreurAjout && <p className="text-xs text-rose-300">{erreurAjout}</p>}
            <button
              type="submit"
              disabled={ajoutEnCours}
              className="glass-button-accent w-full py-2.5 text-sm"
            >
              {ajoutEnCours ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </form>
        )}
      </section>

      {/* Dernières opérations */}
      <section className="glass p-5">
        <p className="mb-3 text-sm text-slate-400">Dernières opérations</p>
        {chargement ? (
          <p className="text-sm text-slate-500">Chargement…</p>
        ) : operations.length === 0 ? (
          <p className="text-sm text-slate-500">
            Aucune opération. Ajoute une entrée ou une dépense ci-dessus, ou
            passe par le chat.
          </p>
        ) : (
          <>
            <ul className="space-y-2">
              {operations.slice(0, nbOperationsAffichees).map((op) => (
                <li
                  key={`${op.table}-${op.id}`}
                  className="flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-slate-200">{op.libelle}</p>
                    <p className="text-[11px] text-slate-500">
                      {op.sousLibelle}
                      {op.gaspillage && (
                        <span className="ml-1 text-rose-400">· gaspillage</span>
                      )}
                    </p>
                  </div>
                  <div className="ml-3 flex shrink-0 items-center gap-2">
                    <span
                      className={`font-medium ${
                        op.montant >= 0 ? 'text-emerald-300' : 'text-slate-100'
                      }`}
                    >
                      {op.montant >= 0 ? '+' : '−'}
                      {formaterMontant(Math.abs(op.montant))}
                    </span>
                    <button
                      onClick={() => supprimerOperation(op)}
                      className="rounded-md px-1.5 py-1 text-xs text-slate-600 transition hover:bg-rose-500/20 hover:text-rose-300"
                      title="Supprimer cette opération"
                    >
                      ✕
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {operations.length > nbOperationsAffichees && (
              <button
                onClick={() => setNbOperationsAffichees((n) => n + 10)}
                className="mt-3 w-full text-center text-xs text-slate-400 transition hover:text-white"
              >
                Voir plus ({operations.length - nbOperationsAffichees} restantes)
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}
