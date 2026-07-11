import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { arrondiVirtuel } from '@/lib/calculs';

export const runtime = 'nodejs';

// GET — liste les dépenses de l'utilisateur courant (mois en cours et précédent).
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('depenses')
    .select('*')
    .eq('user_id', user.id)
    .order('date_transaction', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ depenses: data });
}

// POST — crée une dépense manuellement (saisie directe hors chat).
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const body = await req.json();
  const montant = Number(body.montant);
  const categorie = String(body.categorie ?? '').trim();

  if (!Number.isFinite(montant) || montant <= 0 || !categorie) {
    return NextResponse.json(
      { error: 'Montant et catégorie requis.' },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from('depenses')
    .insert({
      user_id: user.id,
      montant,
      categorie,
      description: body.description ?? null,
      est_gaspillage: Boolean(body.est_gaspillage),
      montant_arrondi_virtuel: arrondiVirtuel(montant),
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ depense: data }, { status: 201 });
}
