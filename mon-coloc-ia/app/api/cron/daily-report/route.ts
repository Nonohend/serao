import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { arrondiVirtuel, formaterMontant } from '@/lib/calculs';
import type { Depense } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Vercel Cron appelle cette route (voir vercel.json). Elle génère un bilan flash
// des dépenses de la journée par utilisateur, et simule l'envoi d'une
// notification (webhook si configuré, sinon retour JSON).
export async function GET(req: Request) {
  // Protège l'endpoint : Vercel Cron envoie CRON_SECRET en Bearer.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
  }

  const supabase = createServiceClient();

  // Début de la journée courante (UTC).
  const debutJournee = new Date();
  debutJournee.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('depenses')
    .select('*')
    .gte('date_transaction', debutJournee.toISOString());

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const depenses = (data ?? []) as Depense[];

  // Agrège par utilisateur.
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

  const bilans = Array.from(parUtilisateur.entries()).map(([userId, s]) => ({
    userId,
    nombreDepenses: s.nombre,
    total: Math.round(s.total * 100) / 100,
    gaspillage: Math.round(s.gaspillage * 100) / 100,
    cagnotteArrondisDuJour: Math.round(s.arrondis * 100) / 100,
    message: `Bilan flash du jour : ${s.nombre} dépense(s) pour ${formaterMontant(
      s.total,
    )}. Gaspillage : ${formaterMontant(s.gaspillage)}. Cagnotte arrondis du jour : ${formaterMontant(
      s.arrondis,
    )}.`,
  }));

  // Simulation d'envoi : POST vers un webhook si configuré.
  const webhook = process.env.DAILY_REPORT_WEBHOOK_URL;
  let notificationEnvoyee = false;
  if (webhook && bilans.length > 0) {
    try {
      await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `📊 Mon Coloc IA — bilan quotidien\n${bilans
            .map((b) => `• ${b.message}`)
            .join('\n')}`,
        }),
      });
      notificationEnvoyee = true;
    } catch {
      notificationEnvoyee = false;
    }
  }

  return NextResponse.json({
    genereLe: new Date().toISOString(),
    utilisateursConcernes: bilans.length,
    notificationEnvoyee,
    bilans,
  });
}
