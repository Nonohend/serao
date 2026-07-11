import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

type CookieToSet = { name: string; value: string; options?: CookieOptions };

// Client Supabase pour les Server Components et Route Handlers.
// Respecte les sessions utilisateur via les cookies (donc la RLS s'applique).
export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Appelé depuis un Server Component : ignorable, le middleware
            // rafraîchit la session.
          }
        },
      },
    },
  );
}

// Client "service role" — contourne la RLS. À n'utiliser QUE côté serveur
// dans des contextes de confiance (ex : cron). Ne jamais exposer au client.
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}
