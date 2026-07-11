'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { joursAvantPeremption } from '@/lib/calculs';
import type { InventaireItem, StatutInventaire } from '@/lib/types';

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
  const [recette, setRecette] = useState<string | null>(null);
  const [genereRecette, setGenereRecette] = useState(false);

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

  return (
    <div className="animate-fade-in space-y-4">
      <section className="glass p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-100">Inventaire du frigo</p>
            <p className="text-[11px] text-slate-500">
              Trié par urgence de péremption
            </p>
          </div>
          <button
            onClick={charger}
            className="text-xs text-slate-400 transition hover:text-white"
          >
            ↻
          </button>
        </div>

        <div className="mt-4">
          {chargement ? (
            <p className="text-sm text-slate-500">Chargement…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-slate-500">
              Inventaire vide. Ajoute des courses via le chat pour le remplir.
            </p>
          ) : (
            <ul className="space-y-2">
              {items.map((item) => {
                const jours = joursAvantPeremption(
                  item.date_achat,
                  item.jours_conservation_estimes,
                );
                const badge = badgePeremption(jours);
                return (
                  <li
                    key={item.id}
                    className="flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2.5"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`rounded-lg border px-2 py-0.5 text-[11px] font-medium ${badge.classe}`}
                      >
                        {badge.label}
                      </span>
                      <span className="text-sm text-slate-200">
                        {item.nom_produit}
                      </span>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => changerStatut(item.id, 'consomme')}
                        className="rounded-lg bg-emerald-500/15 px-2 py-1 text-[11px] text-emerald-300 transition hover:bg-emerald-500/25"
                        title="Marquer consommé"
                      >
                        Consommé
                      </button>
                      <button
                        onClick={() => changerStatut(item.id, 'gaspille')}
                        className="rounded-lg bg-rose-500/15 px-2 py-1 text-[11px] text-rose-300 transition hover:bg-rose-500/25"
                        title="Marquer gaspillé"
                      >
                        Gaspillé
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
        disabled={genereRecette || items.length === 0}
        className="glass-button-accent w-full"
      >
        {genereRecette ? 'Le chef réfléchit…' : "🍳 Qu'est-ce qu'on mange ?"}
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
