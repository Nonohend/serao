'use client';

import { useChat } from '@ai-sdk/react';
import type { Message } from 'ai';
import { useRef, useState, useEffect } from 'react';

const LIBELLE_OUTIL: Record<string, string> = {
  rechercheWeb: '🔎 Recherche web…',
  enregistrerDepense: '💸 Enregistrement de la dépense…',
};

// Clé de sauvegarde locale de la conversation (sur l'appareil).
const CLE_STOCKAGE = 'mon-coloc-ia-conversation';
const MAX_MESSAGES_SAUVEGARDES = 60;

export default function ChatInterface() {
  const [modeRoast, setModeRoast] = useState(false);
  const [restaure, setRestaure] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    setMessages,
    input,
    handleInputChange,
    handleSubmit,
    status,
    error,
  } = useChat({
    api: '/api/chat',
  });

  // Restaure la conversation sauvegardée (survit aux rechargements et aux
  // changements d'onglet).
  useEffect(() => {
    try {
      const brut = window.localStorage.getItem(CLE_STOCKAGE);
      if (brut) {
        const anciens = JSON.parse(brut) as Message[];
        if (Array.isArray(anciens) && anciens.length > 0) {
          setMessages(anciens);
        }
      }
    } catch {
      // Sauvegarde corrompue : on repart d'une conversation vide.
    }
    setRestaure(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sauvegarde la conversation à chaque évolution (une fois restaurée,
  // pour ne pas écraser l'historique avec une liste vide au montage).
  useEffect(() => {
    if (!restaure) return;
    try {
      window.localStorage.setItem(
        CLE_STOCKAGE,
        JSON.stringify(messages.slice(-MAX_MESSAGES_SAUVEGARDES)),
      );
    } catch {
      // Stockage plein ou indisponible : non bloquant.
    }
  }, [messages, restaure]);

  function effacerConversation() {
    setMessages([]);
    try {
      window.localStorage.removeItem(CLE_STOCKAGE);
    } catch {
      // Non bloquant.
    }
  }

  const enCours = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!input.trim()) return;
    handleSubmit(e, { body: { modeRoast } });
  }

  return (
    <div className="animate-fade-in flex h-full flex-col">
      {/* En-tête + interrupteur mode Roast */}
      <div className="glass-soft mb-3 flex items-center justify-between p-3">
        <div>
          <p className="text-sm font-medium text-slate-100">Ton coloc IA</p>
          <p className="text-[11px] text-slate-500">
            Décris une dépense, demande une recette ou un prix…
          </p>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={effacerConversation}
              className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-slate-400 transition hover:text-white"
              title="Effacer la conversation"
            >
              🗑️
            </button>
          )}
          <button
            type="button"
            onClick={() => setModeRoast((v) => !v)}
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition ${
              modeRoast
                ? 'border-rose-400/40 bg-rose-500/20 text-rose-300'
                : 'border-white/10 bg-white/5 text-slate-400'
            }`}
            aria-pressed={modeRoast}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                modeRoast ? 'bg-rose-400' : 'bg-slate-500'
              }`}
            />
            Mode Roast
          </button>
        </div>
      </div>

      {/* Fil de discussion */}
      <div className="flex-1 space-y-3 overflow-y-auto pb-2">
        {messages.length === 0 && (
          <div className="glass-soft p-4 text-sm text-slate-400">
            <p className="mb-2 text-slate-300">Exemples :</p>
            <ul className="space-y-1 text-slate-400">
              <li>« 50 000 Ar de courses à l&apos;épicerie : poulet, riz, tomates »</li>
              <li>« 15 000 Ar de resto ce midi »</li>
              <li>« Trouve le prix du beurre en promo près de chez moi »</li>
            </ul>
          </div>
        )}

        {messages.map((m) => {
          const outils =
            (m as { toolInvocations?: { toolName: string }[] }).toolInvocations ??
            [];
          return (
            <div
              key={m.id}
              className={`flex ${
                m.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-accent/80 text-white'
                    : 'glass-soft text-slate-100'
                }`}
              >
                {outils.length > 0 && (
                  <div className="mb-1 space-y-0.5">
                    {outils.map((t, i) => (
                      <p key={i} className="text-[11px] text-slate-400">
                        {LIBELLE_OUTIL[t.toolName] ?? `🔧 ${t.toolName}…`}
                      </p>
                    ))}
                  </div>
                )}
                <p className="whitespace-pre-wrap">{m.content}</p>
              </div>
            </div>
          );
        })}

        {error && (
          <div className="flex justify-start">
            <div className="max-w-[90%] rounded-2xl border border-rose-400/30 bg-rose-500/15 px-4 py-2.5 text-sm text-rose-200">
              <p className="font-medium">Le coloc IA n&apos;a pas pu répondre.</p>
              <p className="mt-1 text-[12px] text-rose-300/90">{error.message}</p>
            </div>
          </div>
        )}

        {enCours && (
          <div className="flex justify-start">
            <div className="glass-soft px-4 py-2.5 text-sm text-slate-400">
              <span className="inline-flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.2s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.1s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Zone de saisie */}
      <form onSubmit={onSubmit} className="mt-2 flex items-end gap-2">
        <input
          value={input}
          onChange={handleInputChange}
          placeholder="Écris en langage naturel…"
          className="glass-input"
          disabled={enCours}
        />
        <button
          type="submit"
          className="glass-button-accent shrink-0 px-4"
          disabled={enCours || !input.trim()}
        >
          Envoyer
        </button>
      </form>
    </div>
  );
}
