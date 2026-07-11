'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  calculerBurnRate,
  cagnotteArrondis,
  compteurDeLaHonte,
  couleurBurnRate,
  depensesDuMois,
  formaterEuros,
} from '@/lib/calculs';
import type { BurnRate, Depense, ProfilUtilisateur } from '@/lib/types';

const LIBELLE_ALERTE: Record<BurnRate['alerte'], string> = {
  ok: 'Rythme maîtrisé',
  attention: 'Rythme un peu rapide',
  critique: 'Rythme trop élevé !',
};

export default function Dashboard() {
  const supabase = createClient();
  const [depenses, setDepenses] = useState<Depense[]>([]);
  const [profil, setProfil] = useState<ProfilUtilisateur | null>(null);
  const [chargement, setChargement] = useState(true);

  const charger = useCallback(async () => {
    setChargement(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setChargement(false);
      return;
    }

    const [{ data: dep }, { data: prof }] = await Promise.all([
      supabase
        .from('depenses')
        .select('*')
        .eq('user_id', user.id)
        .order('date_transaction', { ascending: false }),
      supabase.from('profil_utilisateur').select('*').eq('id', user.id).single(),
    ]);

    setDepenses((dep ?? []) as Depense[]);
    setProfil((prof ?? null) as ProfilUtilisateur | null);
    setChargement(false);
  }, [supabase]);

  useEffect(() => {
    charger();
  }, [charger]);

  const budget = profil?.budget_mensuel_cible ?? 1000;
  const burn = calculerBurnRate(depenses, budget);
  const cagnotte = cagnotteArrondis(depensesDuMois(depenses));
  const honte = compteurDeLaHonte(depensesDuMois(depenses));
  const couleurReste =
    burn.resteADepenser < 0 ? 'text-rose-400' : couleurBurnRate(burn.alerte);

  const pourcentageBudget = Math.min(
    100,
    Math.round((burn.depensesActuelles / Math.max(budget, 1)) * 100),
  );

  return (
    <div className="animate-fade-in space-y-4">
      {/* Reste à dépenser — couleur adaptative selon le burn rate */}
      <section className="glass p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-400">Reste à dépenser ce mois</p>
          <button
            onClick={charger}
            className="text-xs text-slate-400 transition hover:text-white"
            aria-label="Rafraîchir"
          >
            ↻ Actualiser
          </button>
        </div>
        <p className={`mt-1 text-4xl font-bold tracking-tight ${couleurReste}`}>
          {chargement ? '…' : formaterEuros(burn.resteADepenser)}
        </p>
        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              burn.alerte === 'critique'
                ? 'bg-rose-400'
                : burn.alerte === 'attention'
                  ? 'bg-amber-400'
                  : 'bg-emerald-400'
            }`}
            style={{ width: `${pourcentageBudget}%` }}
          />
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
          <span>
            {formaterEuros(burn.depensesActuelles)} / {formaterEuros(budget)}
          </span>
          <span className={couleurBurnRate(burn.alerte)}>
            {LIBELLE_ALERTE[burn.alerte]}
          </span>
        </div>
      </section>

      {/* Burn rate détaillé */}
      <section className="glass p-5">
        <p className="text-sm text-slate-400">Burn Rate</p>
        <div className="mt-3 grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-slate-500">Rythme réel</p>
            <p className={`text-xl font-semibold ${couleurBurnRate(burn.alerte)}`}>
              {formaterEuros(burn.rythmeReel)}
              <span className="text-sm text-slate-500">/j</span>
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Rythme cible</p>
            <p className="text-xl font-semibold text-slate-200">
              {formaterEuros(burn.rythmeCible)}
              <span className="text-sm text-slate-500">/j</span>
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-400">
          Projection fin de mois à ce rythme :{' '}
          <span className={couleurBurnRate(burn.alerte)}>
            {formaterEuros(burn.projectionFinDeMois)}
          </span>{' '}
          (jour {burn.joursEcoules}/{burn.joursDansLeMois})
        </p>
      </section>

      {/* Cagnotte des arrondis + Compteur de la honte */}
      <div className="grid grid-cols-2 gap-4">
        <section className="glass-soft p-4">
          <p className="text-xs text-slate-400">Cagnotte arrondis</p>
          <p className="mt-1 text-2xl font-bold text-sky-300">
            {formaterEuros(cagnotte)}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            épargne indolore ce mois
          </p>
        </section>

        <section className="glass-soft p-4">
          <p className="text-xs text-slate-400">Compteur de la honte</p>
          <p className="mt-1 text-2xl font-bold text-rose-400">
            {formaterEuros(honte)}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">gaspillage assumé</p>
        </section>
      </div>

      {/* Dernières dépenses */}
      <section className="glass p-5">
        <p className="mb-3 text-sm text-slate-400">Dernières dépenses</p>
        {chargement ? (
          <p className="text-sm text-slate-500">Chargement…</p>
        ) : depenses.length === 0 ? (
          <p className="text-sm text-slate-500">
            Aucune dépense. Décris-en une dans le chat pour commencer.
          </p>
        ) : (
          <ul className="space-y-2">
            {depenses.slice(0, 6).map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-slate-200">
                    {d.description || d.categorie}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {d.categorie}
                    {d.est_gaspillage && (
                      <span className="ml-1 text-rose-400">· gaspillage</span>
                    )}
                  </p>
                </div>
                <span className="ml-3 shrink-0 font-medium text-slate-100">
                  {formaterEuros(Number(d.montant))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
