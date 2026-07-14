'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import {
  activerPush,
  desactiverPush,
  etatPush,
} from '@/lib/push';

export default function NotificationsToggle() {
  const [etat, setEtat] = useState<
    'chargement' | 'non_supporte' | 'refuse' | 'actif' | 'inactif'
  >('chargement');
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    etatPush().then(setEtat);
  }, []);

  async function basculer() {
    setEnCours(true);
    setMessage(null);
    if (etat === 'actif') {
      await desactiverPush();
      setEtat('inactif');
    } else {
      const r = await activerPush();
      if (r.ok) {
        setEtat('actif');
        setMessage('Notifications activées sur cet appareil ✓');
      } else {
        setMessage(r.message ?? 'Activation impossible.');
        setEtat(await etatPush());
      }
    }
    setEnCours(false);
  }

  const actif = etat === 'actif';

  return (
    <section className="glass p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm text-slate-300">
            {actif ? <Bell size={15} /> : <BellOff size={15} />}
            Notifications
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            Reçois ton bilan flash du soir et les alertes de trésorerie.
          </p>
        </div>

        {etat === 'non_supporte' ? (
          <span className="shrink-0 text-[11px] text-slate-500">
            Indisponible ici
          </span>
        ) : etat === 'refuse' ? (
          <span className="shrink-0 text-[11px] text-rose-300">Bloqué</span>
        ) : (
          <button
            type="button"
            onClick={basculer}
            disabled={enCours || etat === 'chargement'}
            aria-pressed={actif}
            className={`relative h-7 w-12 shrink-0 rounded-full border transition ${
              actif
                ? 'border-accent-soft/50 bg-accent'
                : 'border-white/15 bg-white/10'
            } disabled:opacity-50`}
          >
            <span
              className={`absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow transition-all ${
                actif ? 'left-6' : 'left-1'
              }`}
            />
          </button>
        )}
      </div>

      {etat === 'refuse' && (
        <p className="mt-2 text-[11px] text-slate-500">
          Les notifications sont bloquées dans les réglages de ton navigateur —
          réautorise-les pour cette app.
        </p>
      )}
      {etat === 'non_supporte' && (
        <p className="mt-2 text-[11px] text-slate-500">
          Sur iPhone, installe d&apos;abord l&apos;app sur ton écran d&apos;accueil
          (Partager → « Sur l&apos;écran d&apos;accueil »), puis rouvre-la : les
          notifications deviendront disponibles.
        </p>
      )}
      {message && <p className="mt-2 text-[11px] text-emerald-300">{message}</p>}
    </section>
  );
}
