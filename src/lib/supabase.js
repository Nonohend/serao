import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Missing Supabase env vars. Check .env.local');
}

// Fully-qualified site URL that includes Vite's base path.
// On GitHub Pages this resolves to https://nonohend.github.io/serao/
// In local dev (npm run dev) it resolves to http://localhost:5173/
// Used as redirectTo for every auth email so the link always lands at the right path.
export const SITE_URL = (() => {
  if (typeof window === 'undefined') return '';
  const base = import.meta.env.BASE_URL || '/';
  return window.location.origin + base;
})();

// One-time cleanup of legacy localStorage keys from pre-Supabase versions of
// the app. These keys are no longer read by anything, but they confuse
// debugging tools and Claude in Chrome's analysis. Safe to delete on every load.
if (typeof window !== 'undefined') {
  try {
    ['serao_users', 'serao_current_user', 'serao_products', 'serao_orders', 'serao_messages']
      .forEach((k) => { try { localStorage.removeItem(k); } catch {} });
  } catch {}
}

// Passthrough auth lock.
// supabase-js v2 defaults to a Web Locks (navigator.locks) based lock that
// serialises every auth operation across ALL tabs of the same origin. When one
// operation acquires that lock and fails to release it — a well-known class of
// bugs in Chromium and Safari — every later signIn / getSession / refresh,
// *including in other tabs*, hangs forever. Symptom: the login works once, then
// the modal stays stuck on the next attempt, and two tabs block each other.
// This app does not need cross-tab refresh coordination, so we bypass the lock
// entirely and just run the operation.
const passthroughLock = async (_name, _acquireTimeout, fn) => fn();

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'serao_auth',
    detectSessionInUrl: true,
    flowType: 'pkce',
    lock: passthroughLock,
  },
});

// Helper: wrap a promise with a timeout so the UI can never stay stuck in
// "loading" forever if the network or Supabase silently hangs.
// Clears the timer when the wrapped promise settles first, otherwise the
// callback keeps running in the background after the race already resolved.
export function withTimeout(promise, ms = 20000, label = 'Opération') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} : délai dépassé (réseau ?)`)),
      ms
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
