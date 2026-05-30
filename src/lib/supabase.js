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

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'serao_auth',
    flowType: 'pkce',
  },
});
