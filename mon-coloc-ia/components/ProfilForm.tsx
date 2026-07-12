'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Check,
  Flame,
  LogOut,
  Microwave,
  Minus,
  Refrigerator,
  Snowflake,
  type LucideIcon,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { ProfilUtilisateur } from '@/lib/types';

const EQUIPEMENTS: {
  cle: keyof ProfilUtilisateur;
  label: string;
  Icone: LucideIcon;
}[] = [
  { cle: 'a_un_frigo', label: 'Frigo', Icone: Refrigerator },
  { cle: 'a_un_congelo', label: 'Congélateur', Icone: Snowflake },
  { cle: 'a_des_plaques', label: 'Plaques', Icone: Flame },
  { cle: 'a_un_microondes', label: 'Micro-ondes', Icone: Microwave },
];

const defautProfil: Partial<ProfilUtilisateur> = {
  budget_mensuel_cible: 500000,
  a_un_frigo: true,
  a_un_congelo: true,
  a_des_plaques: true,
  a_un_microondes: true,
  rythme_de_vie: '',
  niveau_energie_soir: 3,
};

export default function ProfilForm({ onLogout }: { onLogout?: () => void }) {
  const supabase = createClient();
  const [profil, setProfil] = useState<Partial<ProfilUtilisateur>>(defautProfil);
  const [chargement, setChargement] = useState(true);
  const [enregistrement, setEnregistrement] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const charger = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setChargement(false);
      return;
    }
    const { data } = await supabase
      .from('profil_utilisateur')
      .select('*')
      .eq('id', user.id)
      .single();
    if (data) setProfil(data as ProfilUtilisateur);
    setChargement(false);
  }, [supabase]);

  useEffect(() => {
    charger();
  }, [charger]);

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    setEnregistrement(true);
    setMessage(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setEnregistrement(false);
      return;
    }

    const { error } = await supabase.from('profil_utilisateur').upsert({
      id: user.id,
      budget_mensuel_cible: Number(profil.budget_mensuel_cible) || 0,
      a_un_frigo: !!profil.a_un_frigo,
      a_un_congelo: !!profil.a_un_congelo,
      a_des_plaques: !!profil.a_des_plaques,
      a_un_microondes: !!profil.a_un_microondes,
      rythme_de_vie: profil.rythme_de_vie ?? null,
      niveau_energie_soir: Number(profil.niveau_energie_soir) || 3,
      updated_at: new Date().toISOString(),
    });

    setMessage(error ? `Erreur : ${error.message}` : 'Profil enregistré ✓');
    setEnregistrement(false);
  }

  if (chargement) {
    return <p className="text-sm text-slate-500">Chargement du profil…</p>;
  }

  return (
    <form onSubmit={enregistrer} className="animate-fade-in space-y-4">
      <section className="glass p-5">
        <label className="text-sm text-slate-300">
          Objectif de dépenses par mois
        </label>
        <p className="mt-1 text-[11px] text-slate-500">
          Indicatif seulement — tes revenus étant irréguliers, l&apos;app
          raisonne surtout en solde disponible et jours d&apos;avance.
        </p>
        <div className="mt-2 flex items-center gap-2">
          <input
            type="number"
            min={0}
            step={50000}
            value={profil.budget_mensuel_cible ?? 0}
            onChange={(e) =>
              setProfil((p) => ({
                ...p,
                budget_mensuel_cible: Number(e.target.value),
              }))
            }
            className="glass-input"
          />
          <span className="text-slate-400">Ar</span>
        </div>
      </section>

      <section className="glass p-5">
        <p className="text-sm text-slate-300">Équipement de cuisine</p>
        <p className="mb-3 mt-1 text-[11px] text-slate-500">
          Touche pour activer/désactiver, puis « Enregistrer » en bas.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {EQUIPEMENTS.map(({ cle, label, Icone }) => {
            const actif = !!profil[cle];
            return (
              <button
                key={cle}
                type="button"
                onClick={() => setProfil((p) => ({ ...p, [cle]: !actif }))}
                aria-pressed={actif}
                className={`flex items-center justify-between rounded-xl border px-3 py-3 text-sm transition ${
                  actif
                    ? 'border-accent-soft/60 bg-accent text-white shadow-lg shadow-accent/30'
                    : 'border-white/10 bg-white/[0.03] text-slate-500 opacity-70'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Icone size={16} strokeWidth={2} />
                  {label}
                </span>
                {actif ? (
                  <Check size={14} strokeWidth={2.6} />
                ) : (
                  <Minus size={14} strokeWidth={2} />
                )}
              </button>
            );
          })}
        </div>
      </section>

      <section className="glass p-5">
        <label className="text-sm text-slate-300">Rythme de vie</label>
        <input
          type="text"
          value={profil.rythme_de_vie ?? ''}
          onChange={(e) =>
            setProfil((p) => ({ ...p, rythme_de_vie: e.target.value }))
          }
          placeholder="ex : étudiant, télétravail, horaires décalés…"
          className="glass-input mt-2"
        />

        <label className="mt-4 block text-sm text-slate-300">
          Énergie le soir : {profil.niveau_energie_soir}/5
        </label>
        <input
          type="range"
          min={1}
          max={5}
          value={profil.niveau_energie_soir ?? 3}
          onChange={(e) =>
            setProfil((p) => ({
              ...p,
              niveau_energie_soir: Number(e.target.value),
            }))
          }
          className="mt-2 w-full accent-[#7c5cff]"
        />
        <div className="mt-1 flex justify-between text-[11px] text-slate-500">
          <span>Épuisé</span>
          <span>En forme</span>
        </div>
      </section>

      {message && (
        <p
          className={`text-center text-sm ${
            message.startsWith('Erreur') ? 'text-rose-400' : 'text-emerald-400'
          }`}
        >
          {message}
        </p>
      )}

      <button
        type="submit"
        disabled={enregistrement}
        className="glass-button-accent w-full"
      >
        {enregistrement ? 'Enregistrement…' : 'Enregistrer le profil'}
      </button>

      {onLogout && (
        <button
          type="button"
          onClick={onLogout}
          className="glass-button flex w-full items-center justify-center gap-2 text-slate-300"
        >
          <LogOut size={15} strokeWidth={2} />
          Se déconnecter
        </button>
      )}
    </form>
  );
}
