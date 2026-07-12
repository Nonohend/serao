'use client';

import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  Home,
  MessageCircle,
  Package,
  Settings,
  Wallet,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import Dashboard from '@/components/Dashboard';
import ChatInterface from '@/components/ChatInterface';
import InventaireFrigo from '@/components/InventaireFrigo';
import ProfilForm from '@/components/ProfilForm';

type Onglet = 'dashboard' | 'chat' | 'frigo' | 'profil';

const ONGLETS: { cle: Onglet; label: string; Icone: typeof Wallet }[] = [
  { cle: 'dashboard', label: 'Budget', Icone: Wallet },
  { cle: 'chat', label: 'Coloc', Icone: MessageCircle },
  { cle: 'frigo', label: 'Stock', Icone: Package },
  { cle: 'profil', label: 'Profil', Icone: Settings },
];

function Logo({ taille = 'sm' }: { taille?: 'sm' | 'lg' }) {
  const classes =
    taille === 'lg'
      ? 'h-16 w-16 rounded-2xl'
      : 'h-8 w-8 rounded-xl';
  const icone = taille === 'lg' ? 32 : 16;
  return (
    <div
      className={`${classes} flex items-center justify-center bg-gradient-to-br from-accent to-sky-500 shadow-lg shadow-accent/30`}
    >
      <Home size={icone} strokeWidth={2.2} className="text-white" />
    </div>
  );
}

function Auth() {
  const supabase = createClient();
  const [mode, setMode] = useState<'connexion' | 'inscription'>('connexion');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    setEnCours(true);
    setMessage(null);

    const { error } =
      mode === 'connexion'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    if (error) {
      setMessage(error.message);
    } else if (mode === 'inscription') {
      setMessage('Compte créé. Vérifie tes emails si la confirmation est activée.');
    }
    setEnCours(false);
  }

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center p-6">
      <div className="mb-8 flex flex-col items-center text-center">
        <Logo taille="lg" />
        <h1 className="mt-4 text-2xl font-bold tracking-tight">Mon Coloc IA</h1>
        <p className="mt-1 text-sm text-slate-400">
          Budget, anti-gaspillage &amp; bons plans
        </p>
      </div>

      <form onSubmit={soumettre} className="glass w-full space-y-3 p-6">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="glass-input"
          autoComplete="email"
        />
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mot de passe"
          className="glass-input"
          autoComplete={mode === 'connexion' ? 'current-password' : 'new-password'}
        />

        {message && <p className="text-sm text-amber-300">{message}</p>}

        <button type="submit" disabled={enCours} className="glass-button-accent w-full">
          {enCours
            ? '…'
            : mode === 'connexion'
              ? 'Se connecter'
              : 'Créer un compte'}
        </button>

        <button
          type="button"
          onClick={() =>
            setMode((m) => (m === 'connexion' ? 'inscription' : 'connexion'))
          }
          className="w-full text-center text-sm text-slate-400 transition hover:text-white"
        >
          {mode === 'connexion'
            ? 'Pas de compte ? Inscris-toi'
            : 'Déjà un compte ? Connecte-toi'}
        </button>
      </form>
    </div>
  );
}

export default function Page() {
  const supabase = createClient();
  const [session, setSession] = useState<Session | null>(null);
  const [chargement, setChargement] = useState(true);
  const [onglet, setOnglet] = useState<Onglet>('dashboard');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChargement(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));

    return () => subscription.unsubscribe();
  }, [supabase]);

  async function deconnexion() {
    await supabase.auth.signOut();
    setSession(null);
  }

  if (chargement) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center text-slate-400">
        Chargement…
      </div>
    );
  }

  if (!session) {
    return <Auth />;
  }

  const titres: Record<Onglet, string> = {
    dashboard: 'Tableau de bord',
    chat: 'Mon Coloc IA',
    frigo: 'Inventaire de la maison',
    profil: 'Mon profil',
  };

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="sticky top-0 z-10 px-4 pb-3 pt-5">
        <div className="glass-soft flex items-center justify-between px-4 py-3">
          <h1 className="text-lg font-bold tracking-tight">{titres[onglet]}</h1>
          <Logo />
        </div>
      </header>

      <main className="flex-1 px-4 pb-24">
        {onglet === 'dashboard' && <Dashboard />}
        {onglet === 'chat' && (
          <div className="h-[calc(100dvh-11rem)]">
            <ChatInterface />
          </div>
        )}
        {onglet === 'frigo' && <InventaireFrigo />}
        {onglet === 'profil' && <ProfilForm onLogout={deconnexion} />}
      </main>

      {/* Navigation basse — mobile first */}
      <nav className="fixed inset-x-0 bottom-0 z-10 mx-auto w-full max-w-md px-4 pb-4">
        <div className="glass flex items-center gap-1 p-1.5">
          {ONGLETS.map(({ cle, label, Icone }) => {
            const actif = onglet === cle;
            return (
              <button
                key={cle}
                onClick={() => setOnglet(cle)}
                className={`nav-pill ${actif ? 'nav-pill-active' : ''}`}
                aria-current={actif ? 'page' : undefined}
              >
                <Icone
                  size={20}
                  strokeWidth={actif ? 2.4 : 1.8}
                  className={actif ? 'text-white' : 'text-slate-500'}
                />
                <span className={actif ? 'font-semibold' : ''}>{label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
