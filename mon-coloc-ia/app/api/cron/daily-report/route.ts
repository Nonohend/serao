import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { createServiceClient } from '@/lib/supabase/server';
import { arrondiVirtuel, formaterMontant } from '@/lib/calculs';
import type { Depense } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PushSub {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

// Configure Web Push si les clés VAPID sont présentes.
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

// Vercel Cron appelle cette route (voir vercel.json). Elle génère un bilan flash
// des dépenses de la journée par utilisateur et envoie une notification push.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
  }

  const supabase = createServiceClient();

  const debutJournee = new Date();
  debutJournee.setHours(0, 0, 0, 0);

  const [{ data: depensesData }, { data: subsData }] = await Promise.all([
    supabase
      .from('depenses')
      .select('*')
      .gte('date_transaction', debutJournee.toISOString()),
    supabase.from('push_subscriptions').select('*'),
  ]);

  const depenses = (depensesData ?? []) as Depense[];
  const subs = (subsData ?? []) as PushSub[];

  // Agrège les dépenses du jour par utilisateur.
  const parUtilisateur = new Map<
    string,
    { total: number; gaspillage: number; arrondis: number; nombre: number }
  >();
  for (const d of depenses) {
    const acc =
      parUtilisateur.get(d.user_id) ?? {
        total: 0,
        gaspillage: 0,
        arrondis: 0,
        nombre: 0,
      };
    acc.total += Number(d.montant);
    acc.nombre += 1;
    if (d.est_gaspillage) acc.gaspillage += Number(d.montant);
    acc.arrondis +=
      d.montant_arrondi_virtuel != null && d.montant_arrondi_virtuel > 0
        ? Number(d.montant_arrondi_virtuel)
        : arrondiVirtuel(Number(d.montant));
    parUtilisateur.set(d.user_id, acc);
  }

  // Regroupe les abonnements push par utilisateur.
  const subsParUtilisateur = new Map<string, PushSub[]>();
  for (const s of subs) {
    const liste = subsParUtilisateur.get(s.user_id) ?? [];
    liste.push(s);
    subsParUtilisateur.set(s.user_id, liste);
  }

  const webPushPret = configurerWebPush();
  let notificationsEnvoyees = 0;
  const abonnementsMorts: string[] = [];

  if (webPushPret) {
    for (const [userId, listeSubs] of subsParUtilisateur.entries()) {
      const s = parUtilisateur.get(userId);
      const corps = s
        ? `Aujourd'hui : ${s.nombre} dépense(s) pour ${formaterMontant(s.total)}.` +
          (s.gaspillage > 0
            ? ` Gaspillage : ${formaterMontant(s.gaspillage)}.`
            : '') +
          ` Cagnotte du jour : ${formaterMontant(s.arrondis)}.`
        : "Pense à noter tes dépenses et rentrées du jour pour garder ton solde à jour.";

      const payload = JSON.stringify({
        title: 'Bilan flash du soir',
        body: corps,
        url: '/',
      });

      for (const sub of listeSubs) {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payload,
          );
          notificationsEnvoyees += 1;
        } catch (err) {
          const code = (err as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) abonnementsMorts.push(sub.endpoint);
        }
      }
    }

    // Nettoie les abonnements expirés.
    if (abonnementsMorts.length > 0) {
      await supabase
        .from('push_subscriptions')
        .delete()
        .in('endpoint', abonnementsMorts);
    }
  }

  // Envoi webhook optionnel (Slack/Discord…).
  const webhook = process.env.DAILY_REPORT_WEBHOOK_URL;
  let webhookEnvoye = false;
  if (webhook && parUtilisateur.size > 0) {
    try {
      const texte = Array.from(parUtilisateur.values())
        .map(
          (s) =>
            `• ${s.nombre} dépense(s) — ${formaterMontant(s.total)} (gaspillage ${formaterMontant(s.gaspillage)})`,
        )
        .join('\n');
      await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `📊 Mon Coloc IA — bilan quotidien\n${texte}` }),
      });
      webhookEnvoye = true;
    } catch {
      webhookEnvoye = false;
    }
  }

  return NextResponse.json({
    genereLe: new Date().toISOString(),
    utilisateursAvecDepenses: parUtilisateur.size,
    abonnementsPush: subs.length,
    notificationsEnvoyees,
    abonnementsNettoyes: abonnementsMorts.length,
    webhookEnvoye,
    webPushConfigure: webPushPret,
  });
}
