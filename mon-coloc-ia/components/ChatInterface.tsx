'use client';

import { useChat } from '@ai-sdk/react';
import type { Attachment, Message } from 'ai';
import { Camera, Flame, SendHorizontal, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const LIBELLE_OUTIL: Record<string, string> = {
  rechercheWeb: 'Recherche web…',
  enregistrerDepense: 'Dépense enregistrée',
  enregistrerRevenu: 'Entrée d’argent enregistrée',
  gererObjectif: 'Objectif mis à jour',
  gererProjet: 'Projet mis à jour',
  enregistrerActivite: 'Activité notée',
};

// Clé de sauvegarde locale de la conversation (sur l'appareil).
const CLE_STOCKAGE = 'mon-coloc-ia-conversation';
const MAX_MESSAGES_SAUVEGARDES = 60;

function chargerConversation(): Message[] {
  if (typeof window === 'undefined') return [];
  try {
    const brut = window.localStorage.getItem(CLE_STOCKAGE);
    const anciens = brut ? (JSON.parse(brut) as Message[]) : [];
    return Array.isArray(anciens) ? anciens : [];
  } catch {
    return [];
  }
}

// Redimensionne une photo côté téléphone avant envoi (économise la 3G et
// respecte les limites de l'API). Retourne une data URL JPEG.
async function compresserImage(fichier: File, maxDim = 1600): Promise<string> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const lecteur = new FileReader();
    lecteur.onload = () => resolve(lecteur.result as string);
    lecteur.onerror = () => reject(new Error('Lecture du fichier impossible'));
    lecteur.readAsDataURL(fichier);
  });

  const img: HTMLImageElement = await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Image illisible'));
    image.src = dataUrl;
  });

  const ratio = Math.min(1, maxDim / Math.max(img.width, img.height));
  if (ratio === 1 && fichier.type === 'image/jpeg') return dataUrl;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * ratio));
  canvas.height = Math.max(1, Math.round(img.height * ratio));
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.82);
}

export default function ChatInterface() {
  const [modeRoast, setModeRoast] = useState(false);
  const [monte, setMonte] = useState(false);
  // La conversation sauvegardée est chargée AVANT le premier rendu, comme
  // messages initiaux du chat — elle survit aux rechargements et aux
  // changements d'onglet.
  const [messagesInitiaux] = useState<Message[]>(chargerConversation);
  const [pieceJointe, setPieceJointe] = useState<Attachment | null>(null);
  const [compression, setCompression] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputFichier = useRef<HTMLInputElement>(null);

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
    initialMessages: messagesInitiaux,
  });

  const enCours = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    setMonte(true);
  }, []);

  // Sauvegarde la conversation à chaque évolution (sans les photos, trop
  // lourdes pour le stockage local du téléphone).
  useEffect(() => {
    if (messages.length === 0) return;
    try {
      const aSauver = messages
        .slice(-MAX_MESSAGES_SAUVEGARDES)
        .map(({ experimental_attachments: _pj, ...reste }) => reste);
      window.localStorage.setItem(CLE_STOCKAGE, JSON.stringify(aSauver));
    } catch {
      // Stockage plein ou indisponible : non bloquant.
    }
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, monte]);

  function effacerConversation() {
    setMessages([]);
    try {
      window.localStorage.removeItem(CLE_STOCKAGE);
    } catch {
      // Non bloquant.
    }
  }

  async function surSelectionPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0];
    if (!fichier) return;
    setCompression(true);
    try {
      const url = await compresserImage(fichier);
      setPieceJointe({
        name: fichier.name || 'photo.jpg',
        contentType: 'image/jpeg',
        url,
      });
    } catch {
      setPieceJointe(null);
    } finally {
      setCompression(false);
      if (inputFichier.current) inputFichier.current.value = '';
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!input.trim() && !pieceJointe) return;
    handleSubmit(e, {
      body: { modeRoast },
      experimental_attachments: pieceJointe ? [pieceJointe] : undefined,
      allowEmptySubmit: Boolean(pieceJointe),
    });
    setPieceJointe(null);
  }

  // Évite un décalage entre le rendu serveur (conversation vide) et le rendu
  // téléphone (conversation restaurée) : on n'affiche le chat qu'une fois monté.
  if (!monte) {
    return <div className="h-full" />;
  }

  return (
    <div className="animate-fade-in flex h-full flex-col">
      {/* En-tête : effacement + interrupteur mode Roast */}
      <div className="glass-soft mb-3 flex items-center justify-between p-3">
        <div>
          <p className="text-sm font-medium text-slate-100">Ton coloc IA</p>
          <p className="text-[11px] text-slate-500">
            Dépense, photo de ticket, recette, prix…
          </p>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={effacerConversation}
              className="rounded-full border border-white/10 bg-white/5 p-2 text-slate-400 transition hover:text-white"
              title="Effacer la conversation"
            >
              <Trash2 size={14} strokeWidth={2} />
            </button>
          )}
          <button
            type="button"
            onClick={() => setModeRoast((v) => !v)}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              modeRoast
                ? 'border-rose-400/40 bg-rose-500/20 text-rose-300'
                : 'border-white/10 bg-white/5 text-slate-400'
            }`}
            aria-pressed={modeRoast}
          >
            <Flame
              size={13}
              strokeWidth={2.2}
              className={modeRoast ? 'text-rose-400' : 'text-slate-500'}
            />
            Roast
          </button>
        </div>
      </div>

      {/* Fil de discussion */}
      <div className="flex-1 space-y-3 overflow-y-auto pb-2">
        {messages.length === 0 && (
          <div className="glass-soft p-4 text-sm text-slate-400">
            <p className="mb-2 text-slate-300">Exemples :</p>
            <ul className="space-y-1.5 text-slate-400">
              <li>Colle ici ton SMS MVola / Orange Money / Airtel Money</li>
              <li className="flex items-center gap-1.5">
                <Camera size={13} className="shrink-0" />
                Capture d&apos;écran d&apos;un SMS ou d&apos;un ticket de caisse
              </li>
              <li>« J&apos;ai encaissé 200 000 Ar sur une vente »</li>
              <li>« Combien je peux dépenser aujourd&apos;hui ? »</li>
            </ul>
          </div>
        )}

        {messages.map((m) => {
          const outils =
            (m as { toolInvocations?: { toolName: string }[] }).toolInvocations ??
            [];
          const images =
            m.experimental_attachments?.filter((pj) =>
              pj.contentType?.startsWith('image/'),
            ) ?? [];
          return (
            <div
              key={m.id}
              className={`animate-pop-in flex ${
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
                {images.map((pj, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    src={pj.url}
                    alt={pj.name ?? 'photo envoyée'}
                    className="mb-2 max-h-48 w-auto rounded-xl"
                  />
                ))}
                {outils.length > 0 && (
                  <div className="mb-1 space-y-0.5">
                    {outils.map((t, i) => (
                      <p
                        key={i}
                        className="flex items-center gap-1.5 text-[11px] text-slate-400"
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        {LIBELLE_OUTIL[t.toolName] ?? `${t.toolName}…`}
                      </p>
                    ))}
                  </div>
                )}
                {m.content && <p className="whitespace-pre-wrap">{m.content}</p>}
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

      {/* Aperçu de la photo sélectionnée */}
      {pieceJointe && (
        <div className="mb-2 flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.05] p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={pieceJointe.url}
            alt="Aperçu"
            className="h-12 w-12 rounded-lg object-cover"
          />
          <p className="flex-1 truncate text-xs text-slate-400">
            Photo prête à envoyer
          </p>
          <button
            type="button"
            onClick={() => setPieceJointe(null)}
            className="rounded-full bg-white/10 p-1.5 text-slate-300"
            aria-label="Retirer la photo"
          >
            <X size={13} strokeWidth={2.4} />
          </button>
        </div>
      )}

      {/* Zone de saisie : photo + texte */}
      <form onSubmit={onSubmit} className="mt-2 flex items-end gap-2">
        <input
          ref={inputFichier}
          type="file"
          accept="image/*"
          onChange={surSelectionPhoto}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => inputFichier.current?.click()}
          disabled={enCours || compression}
          className="glass-button shrink-0 px-3"
          title="Envoyer une photo (ticket de caisse, produit…)"
          aria-label="Envoyer une photo"
        >
          {compression ? '…' : <Camera size={18} strokeWidth={2} />}
        </button>
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
          disabled={enCours || compression || (!input.trim() && !pieceJointe)}
          aria-label="Envoyer"
        >
          <SendHorizontal size={18} strokeWidth={2.2} />
        </button>
      </form>
    </div>
  );
}
