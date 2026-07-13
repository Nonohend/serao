'use client';

import { RotateCw, TriangleAlert } from 'lucide-react';

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center p-6">
      <div className="glass animate-pop-in w-full max-w-sm p-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/15">
          <TriangleAlert size={22} className="text-rose-300" />
        </div>
        <h1 className="mt-4 text-lg font-bold text-slate-100">
          Un problème est survenu
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Rien de grave : tes données sont en sécurité. Réessaie, et si ça
          persiste, recharge la page.
        </p>
        <button
          onClick={reset}
          className="glass-button-accent mt-5 flex w-full items-center justify-center gap-2"
        >
          <RotateCw size={15} strokeWidth={2.2} />
          Réessayer
        </button>
      </div>
    </div>
  );
}
