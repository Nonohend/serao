import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

function configurerWebPush(): boolean {
  const publique = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privee = process.env.VAPID_PRIVATE_KEY;
  if (!publique || !privee) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:contact@moncolocia.app',
    publique,
    privee,
  );
  return true;
}

// POST — enregistre (ou met à jour) l'abonnement push de l'utilisateur.
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const { subscription } = await req.json();
  const endpoint = subscription?.endpoint;
  const p256dh = subscription?.keys?.p256dh;
  const auth = subscription?.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: 'Abonnement invalide' }, { status: 400 });
  }

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      { user_id: user.id, endpoint, p256dh, auth },
      { onConflict: 'endpoint' },
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Notification de bienvenue pour confirmer que tout fonctionne.
  if (configurerWebPush()) {
    try {
      await webpush.sendNotification(
        { endpoint, keys: { p256dh, auth } },
        JSON.stringify({
          title: 'Notifications activées 🎉',
          body: 'Tu recevras désormais ton bilan flash du soir et les alertes.',
          url: '/',
        }),
      );
    } catch {
      // Non bloquant : l'abonnement est enregistré même si le test échoue.
    }
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}

// DELETE — supprime l'abonnement de cet appareil.
export async function DELETE(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const { endpoint } = await req.json();
  if (!endpoint) {
    return NextResponse.json({ error: 'endpoint requis' }, { status: 400 });
  }

  await supabase
    .from('push_subscriptions')
    .delete()
    .eq('user_id', user.id)
    .eq('endpoint', endpoint);

  return NextResponse.json({ ok: true });
}
