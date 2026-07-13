'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  Bell,
  Briefcase,
  ChevronDown,
  ChevronUp,
  Download,
  Flame,
  Pencil,
  PiggyBank,
  Plus,
  RotateCw,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  arrondiVirtuel,
  budgetConseille,
  cagnotteArrondis,
  calculerFlux,
  compteurDeLaHonte,
  couleurFlux,
  depensesAujourdhui,
  depensesDuMois,
  depensesParJour,
  formaterDateHeure,
  formaterHeure,
  formaterMontant,
  historiqueMensuel,
  libelleJour,
  versDatetimeLocal,
} from '@/lib/calculs';
import type {
  Depense,
  Objectif,
  ProfilUtilisateur,
  Projet,
  Revenu,
} from '@/lib/types';

const CATEGORIES_DEPENSE = [
  'Courses',
  'Restaurant',
  'Transport',
  'Loisirs',
  'Santé',
  'Abonnement',
  'Autre',
];

const SOURCES_REVENU = [
  'Business',
  'Vente',
  'Service',
  'Mobile Money',
  'Salaire',
  'Cadeau',
  'Autre',
];

// Ligne unifiée pour la liste des opérations (dépenses + entrées).
interface Operation {
  id: string;
  table: 'depenses' | 'revenus';
  montant: number;
  libelle: string;
  sousLibelle: string;
  date: string;
  gaspillage: boolean;
}

// Montant qui « compte » en douceur vers sa nouvelle valeur.
function MontantAnime({
  valeur,
  className,
  prefixe = '',
}: {
  valeur: number;
  className?: string;
  prefixe?: string;
}) {
  const [affiche, setAffiche] = useState(valeur);
  const precedent = useRef(valeur);

  useEffect(() => {
    const depart = precedent.current;
    const delta = valeur - depart;
    if (delta === 0) return;
    const debut = performance.now();
    const duree = 650;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - debut) / duree);
      const ease = 1 - Math.pow(1 - p, 3);
      setAffiche(depart + delta * ease);
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        precedent.current = valeur;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [valeur]);

  return (
    <span className={className}>
      {prefixe}
      {formaterMontant(affiche)}
    </span>
  );
}

export default function Dashboard() {
  const supabase = createClient();
  const [depenses, setDepenses] = useState<Depense[]>([]);
  const [revenus, setRevenus] = useState<Revenu[]>([]);
  const [revenusDisponibles, setRevenusDisponibles] = useState(true);
  const [objectifs, setObjectifs] = useState<Objectif[]>([]);
  const [objectifsDisponibles, setObjectifsDisponibles] = useState(true);
  const [projets, setProjets] = useState<Projet[]>([]);
  const [projetsDisponibles, setProjetsDisponibles] = useState(true);

  // Formulaire projets.
  const [projFormOuvert, setProjFormOuvert] = useState(false);
  const [projNom, setProjNom] = useState('');
  const [projErreur, setProjErreur] = useState<string | null>(null);

  // Ajustement du solde réel.
  const [ajustOuvert, setAjustOuvert] = useState(false);
  const [ajustMontant, setAjustMontant] = useState('');
  const [ajustErreur, setAjustErreur] = useState<string | null>(null);
  const [profil, setProfil] = useState<ProfilUtilisateur | null>(null);
  const [chargement, setChargement] = useState(true);
  const [premierChargement, setPremierChargement] = useState(true);
  const [nbOperationsAffichees, setNbOperationsAffichees] = useState(8);

  // Formulaire objectifs.
  const [objFormOuvert, setObjFormOuvert] = useState(false);
  const [objNom, setObjNom] = useState('');
  const [objCible, setObjCible] = useState('');
  const [objErreur, setObjErreur] = useState<string | null>(null);
  const [alimId, setAlimId] = useState<string | null>(null);
  const [alimMontant, setAlimMontant] = useState('');

  // Formulaire d'ajout / modification (dépense OU entrée d'argent).
  const [formOuvert, setFormOuvert] = useState(false);
  const [editionId, setEditionId] = useState<string | null>(null);
  const [typeForm, setTypeForm] = useState<'depense' | 'revenu'>('depense');
  const [montantForm, setMontantForm] = useState('');
  const [categorieForm, setCategorieForm] = useState('Courses');
  const [sourceForm, setSourceForm] = useState('Business');
  const [descriptionForm, setDescriptionForm] = useState('');
  const [gaspillageForm, setGaspillageForm] = useState(false);
  const [dateForm, setDateForm] = useState('');
  const [projetForm, setProjetForm] = useState('');
  const [ajoutEnCours, setAjoutEnCours] = useState(false);
  const [erreurAjout, setErreurAjout] = useState<string | null>(null);
  const refForm = useRef<HTMLDivElement>(null);

  const charger = useCallback(async () => {
    setChargement(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setChargement(false);
      return;
    }

    const [depensesRes, revenusRes, objectifsRes, projetsRes, profilRes] =
      await Promise.all([
      supabase
        .from('depenses')
        .select('*')
        .eq('user_id', user.id)
        .order('date_transaction', { ascending: false }),
      supabase
        .from('revenus')
        .select('*')
        .eq('user_id', user.id)
        .order('date_reception', { ascending: false }),
      supabase
        .from('objectifs')
        .select('*')
        .eq('user_id', user.id)
        .order('cree_le', { ascending: true }),
      supabase
        .from('projets')
        .select('*')
        .eq('user_id', user.id)
        .order('cree_le', { ascending: true }),
      supabase.from('profil_utilisateur').select('*').eq('id', user.id).single(),
    ]);

    setDepenses((depensesRes.data ?? []) as Depense[]);
    setRevenus((revenusRes.data ?? []) as Revenu[]);
    setObjectifs((objectifsRes.data ?? []) as Objectif[]);
    setProjets((projetsRes.data ?? []) as Projet[]);
    // Tables absentes tant que les migrations v3/v4/v5 n'ont pas été exécutées.
    setRevenusDisponibles(!revenusRes.error);
    setObjectifsDisponibles(!objectifsRes.error);
    setProjetsDisponibles(!projetsRes.error);
    setProfil((profilRes.data ?? null) as ProfilUtilisateur | null);
    setChargement(false);
    setPremierChargement(false);
  }, [supabase]);

  useEffect(() => {
    charger();
  }, [charger]);

  function reinitialiserForm() {
    setEditionId(null);
    setMontantForm('');
    setDescriptionForm('');
    setGaspillageForm(false);
    setDateForm('');
    setProjetForm('');
    setErreurAjout(null);
  }

  function commencerEdition(op: Operation) {
    if (op.table === 'depenses') {
      const d = depenses.find((x) => x.id === op.id);
      if (!d) return;
      setTypeForm('depense');
      setMontantForm(String(Number(d.montant)));
      setCategorieForm(d.categorie);
      setDescriptionForm(d.description ?? '');
      setGaspillageForm(d.est_gaspillage);
      setDateForm(versDatetimeLocal(d.date_transaction));
      setProjetForm(d.projet_id ?? '');
    } else {
      const r = revenus.find((x) => x.id === op.id);
      if (!r) return;
      setTypeForm('revenu');
      setMontantForm(String(Number(r.montant)));
      setSourceForm(r.source ?? 'Business');
      setDescriptionForm(r.description ?? '');
      setDateForm(versDatetimeLocal(r.date_reception));
      setProjetForm(r.projet_id ?? '');
    }
    setEditionId(op.id);
    setErreurAjout(null);
    setFormOuvert(true);
    // Amène le formulaire à l'écran.
    setTimeout(() => {
      refForm.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }

  async function enregistrerOperation(e: React.FormEvent) {
    e.preventDefault();
    const montant = Number(montantForm);
    if (!Number.isFinite(montant) || montant <= 0) return;

    setAjoutEnCours(true);
    setErreurAjout(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setAjoutEnCours(false);
      return;
    }

    const dateIso = dateForm ? new Date(dateForm).toISOString() : null;

    let error: { message: string } | null = null;

    if (typeForm === 'depense') {
      const valeurs = {
        montant,
        categorie: categorieForm,
        description: descriptionForm.trim() || null,
        est_gaspillage: gaspillageForm,
        montant_arrondi_virtuel: arrondiVirtuel(montant),
        ...(projetsDisponibles ? { projet_id: projetForm || null } : {}),
        ...(dateIso ? { date_transaction: dateIso } : {}),
      };
      ({ error } = editionId
        ? await supabase.from('depenses').update(valeurs).eq('id', editionId)
        : await supabase.from('depenses').insert({ user_id: user.id, ...valeurs }));
    } else {
      const valeurs = {
        montant,
        source: sourceForm,
        description: descriptionForm.trim() || null,
        ...(projetsDisponibles ? { projet_id: projetForm || null } : {}),
        ...(dateIso ? { date_reception: dateIso } : {}),
      };
      ({ error } = editionId
        ? await supabase.from('revenus').update(valeurs).eq('id', editionId)
        : await supabase.from('revenus').insert({ user_id: user.id, ...valeurs }));
    }

    if (error) {
      setErreurAjout(
        typeForm === 'revenu' && !revenusDisponibles
          ? 'La table des entrées n’existe pas encore : exécute la migration v3 dans Supabase (SQL Editor).'
          : `Erreur : ${error.message}`,
      );
    } else {
      reinitialiserForm();
      setFormOuvert(false);
      await charger();
    }
    setAjoutEnCours(false);
  }

  async function supprimerOperation(op: Operation) {
    if (op.table === 'depenses') {
      setDepenses((prev) => prev.filter((d) => d.id !== op.id));
    } else {
      setRevenus((prev) => prev.filter((r) => r.id !== op.id));
    }
    await supabase.from(op.table).delete().eq('id', op.id);
  }

  async function creerObjectif(e: React.FormEvent) {
    e.preventDefault();
    const cible = Number(objCible);
    const nom = objNom.trim();
    if (!nom || !Number.isFinite(cible) || cible <= 0) return;

    setObjErreur(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from('objectifs').insert({
      user_id: user.id,
      nom,
      montant_cible: cible,
    });

    if (error) {
      setObjErreur(
        objectifsDisponibles
          ? `Erreur : ${error.message}`
          : 'La table des objectifs n’existe pas encore : exécute la migration v4 dans Supabase (SQL Editor).',
      );
    } else {
      setObjNom('');
      setObjCible('');
      setObjFormOuvert(false);
      await charger();
    }
  }

  async function alimenterObjectif(obj: Objectif, sens: 1 | -1) {
    const montant = Number(alimMontant);
    if (!Number.isFinite(montant) || montant <= 0) return;
    const nouveau = Math.max(0, Number(obj.montant_actuel) + sens * montant);
    await supabase
      .from('objectifs')
      .update({ montant_actuel: nouveau })
      .eq('id', obj.id);
    setAlimId(null);
    setAlimMontant('');
    await charger();
  }

  async function supprimerObjectif(id: string) {
    setObjectifs((prev) => prev.filter((o) => o.id !== id));
    await supabase.from('objectifs').delete().eq('id', id);
  }

  async function creerProjet(e: React.FormEvent) {
    e.preventDefault();
    const nom = projNom.trim();
    if (!nom) return;

    setProjErreur(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from('projets').insert({
      user_id: user.id,
      nom,
    });

    if (error) {
      setProjErreur(
        projetsDisponibles
          ? `Erreur : ${error.message}`
          : 'La table des projets n’existe pas encore : exécute la migration v5 dans Supabase (SQL Editor).',
      );
    } else {
      setProjNom('');
      setProjFormOuvert(false);
      await charger();
    }
  }

  async function changerStatutProjet(p: Projet) {
    const statut = p.statut === 'actif' ? 'termine' : 'actif';
    await supabase.from('projets').update({ statut }).eq('id', p.id);
    await charger();
  }

  async function supprimerProjet(id: string) {
    setProjets((prev) => prev.filter((p) => p.id !== id));
    await supabase.from('projets').delete().eq('id', id);
    await charger();
  }

  // Rentabilité par projet : investi (sorties), rapporté (entrées), net.
  const statsProjets = useMemo(
    () =>
      projets.map((p) => {
        const investi = depenses
          .filter((d) => d.projet_id === p.id)
          .reduce((acc, d) => acc + Number(d.montant), 0);
        const rapporte = revenus
          .filter((r) => r.projet_id === p.id)
          .reduce((acc, r) => acc + Number(r.montant), 0);
        return { projet: p, investi, rapporte, net: rapporte - investi };
      }),
    [projets, depenses, revenus],
  );

  const nomsProjets = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of projets) m.set(p.id, p.nom);
    return m;
  }, [projets]);

  const soldeInitial = Number(profil?.solde_initial ?? 0);

  async function ajusterSolde(e: React.FormEvent) {
    e.preventDefault();
    const soldeReel = Number(ajustMontant);
    if (!Number.isFinite(soldeReel)) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // Le solde calculé sans le solde de départ = entrées − sorties.
    const fluxBrut = flux.soldeDisponible - soldeInitial;
    const nouveauSoldeInitial = Math.round((soldeReel - fluxBrut) * 100) / 100;

    const { error } = await supabase
      .from('profil_utilisateur')
      .update({ solde_initial: nouveauSoldeInitial })
      .eq('id', user.id);

    setAjustErreur(
      error
        ? 'Impossible d’ajuster : exécute la migration v6 dans Supabase (SQL Editor).'
        : null,
    );
    if (!error) {
      setAjustOuvert(false);
      setAjustMontant('');
      await charger();
    }
  }

  const flux = calculerFlux(depenses, revenus, soldeInitial);
  const totalReserve = objectifs.reduce(
    (acc, o) => acc + Number(o.montant_actuel),
    0,
  );
  const soldeLibre =
    Math.round((flux.soldeDisponible - totalReserve) * 100) / 100;
  const duJour = depensesAujourdhui(depenses);
  const conseil = budgetConseille(soldeLibre, duJour);
  const partConseilUtilisee =
    conseil.parJour > 0
      ? Math.min(100, Math.round((duJour / conseil.parJour) * 100))
      : 0;
  const duMois = depensesDuMois(depenses);
  const cagnotte = cagnotteArrondis(duMois);
  const honte = compteurDeLaHonte(duMois);
  const graphique = useMemo(() => depensesParJour(depenses, 14), [depenses]);
  const maxJour = Math.max(1, ...graphique.map((j) => j.total));
  const objectif = Number(profil?.budget_mensuel_cible ?? 0);

  // Top 3 catégories du mois.
  const topCategories = useMemo(() => {
    const totaux = new Map<string, number>();
    for (const d of duMois) {
      totaux.set(d.categorie, (totaux.get(d.categorie) ?? 0) + Number(d.montant));
    }
    const total = Array.from(totaux.values()).reduce((a, b) => a + b, 0);
    return Array.from(totaux.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([categorie, montant]) => ({
        categorie,
        montant,
        part: total > 0 ? Math.round((montant / total) * 100) : 0,
      }));
  }, [duMois]);

  // Liste unifiée des opérations, la plus récente d'abord.
  const operations: Operation[] = useMemo(() => {
    const lignes: Operation[] = [
      ...depenses.map((d) => ({
        id: d.id,
        table: 'depenses' as const,
        montant: -Number(d.montant),
        libelle: d.description || d.categorie,
        sousLibelle:
          d.categorie +
          (d.projet_id && nomsProjets.has(d.projet_id)
            ? ` · ${nomsProjets.get(d.projet_id)}`
            : ''),
        date: d.date_transaction,
        gaspillage: d.est_gaspillage,
      })),
      ...revenus.map((r) => ({
        id: r.id,
        table: 'revenus' as const,
        montant: Number(r.montant),
        libelle: r.description || r.source || 'Entrée d’argent',
        sousLibelle:
          (r.source ?? 'Entrée') +
          (r.projet_id && nomsProjets.has(r.projet_id)
            ? ` · ${nomsProjets.get(r.projet_id)}`
            : ''),
        date: r.date_reception,
        gaspillage: false,
      })),
    ];
    return lignes.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
  }, [depenses, revenus, nomsProjets]);

  const couleurSolde =
    flux.soldeDisponible < 0 ? 'text-rose-400' : couleurFlux(flux.niveau);

  // Historique mensuel (6 mois).
  const historique = useMemo(
    () => historiqueMensuel(depenses, revenus, 6),
    [depenses, revenus],
  );
  const maxMois = Math.max(
    1,
    ...historique.map((m) => Math.max(m.entrees, m.sorties)),
  );

  // Alertes intelligentes affichées en haut du tableau de bord.
  const alertes: { ton: 'rouge' | 'ambre'; texte: string }[] = [];
  if (!chargement) {
    if (flux.soldeDisponible < 0) {
      alertes.push({
        ton: 'rouge',
        texte: `Ton solde est négatif (${formaterMontant(flux.soldeDisponible)}). Ajoute tes entrées manquantes ou ajuste ton solde réel.`,
      });
    } else if (flux.runwayJours !== null && flux.runwayJours < 7) {
      alertes.push({
        ton: 'rouge',
        texte: `Attention : il te reste ≈ ${flux.runwayJours} jour(s) d'avance. Lève le pied sur les dépenses.`,
      });
    } else if (flux.runwayJours !== null && flux.runwayJours < 21) {
      alertes.push({
        ton: 'ambre',
        texte: `Tes jours d'avance baissent (≈ ${flux.runwayJours}). Garde un œil sur ton rythme.`,
      });
    }
    if (conseil.parJour > 0 && duJour > conseil.parJour) {
      alertes.push({
        ton: 'ambre',
        texte: `Tu as dépassé ton budget conseillé du jour (${formaterMontant(duJour)} / ${formaterMontant(conseil.parJour)}).`,
      });
    }
  }

  // Export CSV de toutes les opérations.
  function exporterCsv() {
    const echap = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const lignes = [
      ['Date', 'Type', 'Montant (Ar)', 'Catégorie/Source', 'Description', 'Projet', 'Gaspillage'],
      ...operations.map((op) => {
        const d = op.table === 'depenses'
          ? depenses.find((x) => x.id === op.id)
          : revenus.find((x) => x.id === op.id);
        const projetNom =
          d?.projet_id && nomsProjets.has(d.projet_id)
            ? nomsProjets.get(d.projet_id)!
            : '';
        return [
          formaterDateHeure(op.date),
          op.montant >= 0 ? 'Entrée' : 'Dépense',
          String(Math.abs(op.montant)),
          op.table === 'depenses'
            ? (d as Depense | undefined)?.categorie ?? ''
            : (d as Revenu | undefined)?.source ?? '',
          (d as Depense | Revenu | undefined)?.description ?? '',
          projetNom ?? '',
          op.gaspillage ? 'oui' : '',
        ];
      }),
    ];
    const csv = '﻿' + lignes.map((l) => l.map(echap).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mon-coloc-ia-operations-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  let delaiCarte = 0;
  const prochainDelai = () => `${(delaiCarte += 55) - 55}ms`;

  // Premier chargement : squelettes animés plutôt qu'un texte brut.
  if (premierChargement) {
    return (
      <div className="space-y-4">
        <div className="glass p-5">
          <div className="skeleton h-4 w-36" />
          <div className="skeleton mt-3 h-10 w-52" />
          <div className="skeleton mt-3 h-3 w-64" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          {[0, 1].map((i) => (
            <div key={i} className="glass-soft p-4">
              <div className="skeleton h-3 w-24" />
              <div className="skeleton mt-2 h-7 w-28" />
            </div>
          ))}
        </div>
        <div className="glass p-5">
          <div className="skeleton h-4 w-48" />
          <div className="mt-3 flex h-24 items-end gap-1">
            {Array.from({ length: 14 }).map((_, i) => (
              <div
                key={i}
                className="skeleton flex-1"
                style={{ height: `${18 + ((i * 37) % 70)}%` }}
              />
            ))}
          </div>
        </div>
        <div className="glass p-5">
          <div className="skeleton h-4 w-40" />
          <div className="skeleton mt-3 h-11 w-full" />
          <div className="skeleton mt-2 h-11 w-full" />
          <div className="skeleton mt-2 h-11 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Alertes intelligentes */}
      {alertes.length > 0 && (
        <div className="space-y-2">
          {alertes.map((a, i) => (
            <div
              key={i}
              className={`animate-slide-down flex items-start gap-2.5 rounded-2xl border p-3 text-sm ${
                a.ton === 'rouge'
                  ? 'border-rose-400/30 bg-rose-500/15 text-rose-200'
                  : 'border-amber-400/30 bg-amber-500/15 text-amber-200'
              }`}
            >
              <Bell size={15} className="mt-0.5 shrink-0" />
              <p>{a.texte}</p>
            </div>
          ))}
        </div>
      )}

      {/* Solde disponible + jours d'avance */}
      <section
        className="glass animate-pop-in p-5"
        style={{ animationDelay: prochainDelai() }}
      >
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-400">Argent disponible</p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setAjustOuvert((v) => !v);
                setAjustMontant('');
                setAjustErreur(null);
              }}
              className="flex items-center gap-1.5 text-xs text-slate-400 transition hover:text-white"
              title="Recaler le solde affiché sur ton solde réel"
            >
              <Pencil size={12} strokeWidth={2} />
              Ajuster
            </button>
            <button
              onClick={charger}
              className="flex items-center gap-1.5 text-xs text-slate-400 transition hover:text-white"
              aria-label="Rafraîchir"
            >
              <RotateCw size={13} strokeWidth={2} />
              Actualiser
            </button>
          </div>
        </div>

        {ajustOuvert && (
          <form
            onSubmit={ajusterSolde}
            className="animate-slide-down mt-3 space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3"
          >
            <label className="block text-[11px] text-slate-500">
              Combien as-tu réellement en tout (mobile money + cash) ? L&apos;app
              se recale sans toucher à ton historique.
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                inputMode="numeric"
                value={ajustMontant}
                onChange={(e) => setAjustMontant(e.target.value)}
                placeholder="Solde réel actuel"
                className="glass-input flex-1"
                required
              />
              <span className="flex items-center text-slate-400">Ar</span>
            </div>
            {Number(ajustMontant) > 0 && (
              <p className="text-[11px] text-slate-500">
                = {formaterMontant(Number(ajustMontant))}
              </p>
            )}
            {ajustErreur && <p className="text-xs text-rose-300">{ajustErreur}</p>}
            <button type="submit" className="glass-button-accent w-full py-2 text-sm">
              Recaler mon solde
            </button>
          </form>
        )}
        {chargement ? (
          <p className="mt-1 text-4xl font-bold tracking-tight text-slate-500">…</p>
        ) : (
          <MontantAnime
            valeur={flux.soldeDisponible}
            className={`mt-1 block text-4xl font-bold tracking-tight ${couleurSolde}`}
          />
        )}
        <p className="mt-2 text-xs text-slate-400">
          {chargement ? (
            ' '
          ) : !revenusDisponibles ? (
            <span className="text-amber-300">
              Exécute la migration v3 dans Supabase pour activer les entrées
              d&apos;argent.
            </span>
          ) : flux.runwayJours !== null ? (
            <>
              À ton rythme ({formaterMontant(flux.depenseMoyenneJour)}/jour), tu
              as{' '}
              <span className={`font-semibold ${couleurFlux(flux.niveau)}`}>
                ≈ {flux.runwayJours} jours d&apos;avance
              </span>
              .
            </>
          ) : (
            'Enregistre tes entrées et dépenses pour voir tes jours d’avance.'
          )}
        </p>
        {totalReserve > 0 && (
          <p className="mt-1 text-xs text-slate-500">
            dont{' '}
            <span className="text-sky-300">{formaterMontant(totalReserve)}</span>{' '}
            réservés pour tes objectifs —{' '}
            <span className="text-slate-300">
              {formaterMontant(soldeLibre)} libres
            </span>
          </p>
        )}
      </section>

      {/* Prédiction : combien dépenser aujourd'hui */}
      {!chargement && conseil.parJour > 0 && (
        <section
          className="glass animate-pop-in p-5"
          style={{ animationDelay: prochainDelai() }}
        >
          <p className="flex items-center gap-1.5 text-sm text-slate-400">
            <Sparkles size={14} className="text-accent-soft" />
            Conseillé aujourd&apos;hui
          </p>
          <div className="mt-1 flex items-baseline justify-between">
            <MontantAnime
              valeur={conseil.resteAujourdhui}
              className={`text-3xl font-bold tracking-tight ${
                conseil.resteAujourdhui <= 0 ? 'text-rose-400' : 'text-slate-100'
              }`}
            />
            <span className="text-xs text-slate-500">
              encore dépensable aujourd&apos;hui
            </span>
          </div>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                partConseilUtilisee >= 100
                  ? 'bg-rose-400'
                  : partConseilUtilisee >= 75
                    ? 'bg-amber-400'
                    : 'bg-emerald-400'
              }`}
              style={{ width: `${partConseilUtilisee}%` }}
            />
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            Déjà dépensé aujourd&apos;hui : {formaterMontant(duJour)} · budget
            conseillé {formaterMontant(conseil.parJour)}/jour pour tenir{' '}
            {conseil.horizonJours} jours avec ton solde libre.
          </p>
        </section>
      )}

      {/* Entrées / Sorties du mois */}
      <div
        className="animate-pop-in grid grid-cols-2 gap-4"
        style={{ animationDelay: prochainDelai() }}
      >
        <section className="glass-soft p-4">
          <p className="flex items-center gap-1.5 text-xs text-slate-400">
            <TrendingUp size={13} className="text-emerald-400" />
            Entré ce mois
          </p>
          <MontantAnime
            valeur={flux.entreesMois}
            prefixe="+"
            className="mt-1 block text-xl font-bold text-emerald-300"
          />
        </section>
        <section className="glass-soft p-4">
          <p className="flex items-center gap-1.5 text-xs text-slate-400">
            <TrendingDown size={13} className="text-rose-400" />
            Sorti ce mois
          </p>
          <MontantAnime
            valeur={flux.sortiesMois}
            prefixe="−"
            className="mt-1 block text-xl font-bold text-rose-300"
          />
          {objectif > 0 && (
            <div className="mt-2">
              <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    flux.sortiesMois > objectif ? 'bg-rose-400' : 'bg-emerald-400'
                  }`}
                  style={{
                    width: `${Math.min(100, Math.round((flux.sortiesMois / objectif) * 100))}%`,
                  }}
                />
              </div>
              <p className="mt-1 text-[10px] text-slate-500">
                objectif : {formaterMontant(objectif)}
              </p>
            </div>
          )}
        </section>
      </div>

      {/* Graphique des 14 derniers jours */}
      <section
        className="glass animate-pop-in p-5"
        style={{ animationDelay: prochainDelai() }}
      >
        <p className="text-sm text-slate-400">Dépenses des 14 derniers jours</p>
        <div className="mt-3 flex h-24 items-end gap-1">
          {graphique.map((jour, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <div
                className={`bar-anim w-full rounded-t ${
                  jour.total > 0 ? 'bg-accent/70' : 'bg-white/5'
                }`}
                style={{
                  height: `${Math.max(3, Math.round((jour.total / maxJour) * 100))}%`,
                  animationDelay: `${150 + i * 35}ms`,
                }}
                title={`${jour.label} : ${formaterMontant(jour.total)}`}
              />
              {i % 2 === 1 && (
                <span className="text-[9px] text-slate-600">{jour.label}</span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Historique mensuel : entrées vs sorties sur 6 mois */}
      <section
        className="glass animate-pop-in p-5"
        style={{ animationDelay: prochainDelai() }}
      >
        <p className="flex items-center gap-1.5 text-sm text-slate-400">
          <BarChart3 size={14} className="text-accent-soft" />
          Historique — 6 derniers mois
        </p>
        <div className="mt-4 flex items-end justify-between gap-2">
          {historique.map((m, i) => (
            <div key={m.cle} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-24 w-full items-end justify-center gap-0.5">
                <div
                  className="bar-anim w-1/2 rounded-t bg-emerald-400/70"
                  style={{
                    height: `${Math.max(2, Math.round((m.entrees / maxMois) * 100))}%`,
                    animationDelay: `${120 + i * 45}ms`,
                  }}
                  title={`Entré : ${formaterMontant(m.entrees)}`}
                />
                <div
                  className="bar-anim w-1/2 rounded-t bg-rose-400/70"
                  style={{
                    height: `${Math.max(2, Math.round((m.sorties / maxMois) * 100))}%`,
                    animationDelay: `${140 + i * 45}ms`,
                  }}
                  title={`Sorti : ${formaterMontant(m.sorties)}`}
                />
              </div>
              <span className="text-[10px] capitalize text-slate-500">{m.label}</span>
              <span
                className={`text-[9px] font-medium ${
                  m.net >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {m.net >= 0 ? '+' : '−'}
                {Math.abs(m.net) >= 1000
                  ? `${Math.round(Math.abs(m.net) / 1000)}k`
                  : Math.round(Math.abs(m.net))}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-center gap-4 text-[10px] text-slate-500">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-400/70" /> Entrées
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-rose-400/70" /> Sorties
          </span>
        </div>
      </section>

      {/* Top catégories du mois */}
      {topCategories.length > 0 && (
        <section
          className="glass animate-pop-in p-5"
          style={{ animationDelay: prochainDelai() }}
        >
          <p className="mb-3 text-sm text-slate-400">Où part l&apos;argent ce mois</p>
          <div className="space-y-2.5">
            {topCategories.map((c) => (
              <div key={c.categorie}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-slate-300">{c.categorie}</span>
                  <span className="text-slate-400">
                    {formaterMontant(c.montant)} · {c.part}%
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-sky-400/80 transition-all duration-700"
                    style={{ width: `${c.part}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Projets business : rentabilité */}
      <section
        className="glass animate-pop-in p-5"
        style={{ animationDelay: prochainDelai() }}
      >
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-sm text-slate-400">
            <Briefcase size={14} className="text-accent-soft" />
            Mes projets
          </p>
          <button
            onClick={() => setProjFormOuvert((v) => !v)}
            className="flex items-center gap-1.5 rounded-full border border-accent-soft/40 bg-accent/20 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent/40"
          >
            {projFormOuvert ? (
              <>
                <X size={13} strokeWidth={2.4} /> Fermer
              </>
            ) : (
              <>
                <Plus size={13} strokeWidth={2.4} /> Nouveau projet
              </>
            )}
          </button>
        </div>

        {projFormOuvert && (
          <form
            onSubmit={creerProjet}
            className="animate-slide-down mt-3 space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3"
          >
            <input
              value={projNom}
              onChange={(e) => setProjNom(e.target.value)}
              placeholder="Nom du projet (ex : élevage, revente tel…)"
              className="glass-input"
              required
            />
            {projErreur && <p className="text-xs text-rose-300">{projErreur}</p>}
            <button type="submit" className="glass-button-accent w-full py-2 text-sm">
              Créer le projet
            </button>
          </form>
        )}

        <div className="mt-3">
          {statsProjets.length === 0 && !projFormOuvert ? (
            <p className="text-sm text-slate-500">
              Déclare tes business (élevage, revente…) : chaque dépense et
              chaque rentrée liée s&apos;y rattache, et tu vois ce que chaque
              projet te rapporte vraiment.
            </p>
          ) : (
            <ul className="space-y-3">
              {statsProjets.map(({ projet, investi, rapporte, net }, i) => (
                <li
                  key={projet.id}
                  className="animate-pop-in rounded-xl bg-white/[0.03] p-3"
                  style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
                >
                  <div className="flex items-center justify-between">
                    <p className="truncate text-sm font-medium text-slate-200">
                      {projet.nom}
                      {projet.statut !== 'actif' && (
                        <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-slate-400">
                          {projet.statut === 'termine' ? 'Terminé' : 'En pause'}
                        </span>
                      )}
                    </p>
                    <div className="ml-2 flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => changerStatutProjet(projet)}
                        className="rounded-md px-1.5 py-1 text-[10px] text-slate-500 transition hover:bg-white/10 hover:text-slate-200"
                        title={
                          projet.statut === 'actif'
                            ? 'Marquer terminé'
                            : 'Réactiver'
                        }
                      >
                        {projet.statut === 'actif' ? 'Terminer' : 'Réactiver'}
                      </button>
                      <button
                        onClick={() => supprimerProjet(projet.id)}
                        className="rounded-md p-1 text-slate-600 transition hover:bg-rose-500/20 hover:text-rose-300"
                        title="Supprimer le projet (les opérations restent)"
                      >
                        <X size={14} strokeWidth={2.2} />
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-[10px] text-slate-500">Investi</p>
                      <p className="text-sm font-semibold text-rose-300">
                        {formaterMontant(investi)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500">Rapporté</p>
                      <p className="text-sm font-semibold text-emerald-300">
                        {formaterMontant(rapporte)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500">Net</p>
                      <p
                        className={`text-sm font-bold ${
                          net >= 0 ? 'text-emerald-300' : 'text-rose-300'
                        }`}
                      >
                        {net >= 0 ? '+' : '−'}
                        {formaterMontant(Math.abs(net))}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Objectifs d'épargne */}
      <section
        className="glass animate-pop-in p-5"
        style={{ animationDelay: prochainDelai() }}
      >
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-sm text-slate-400">
            <Target size={14} className="text-accent-soft" />
            Mes objectifs
          </p>
          <button
            onClick={() => setObjFormOuvert((v) => !v)}
            className="flex items-center gap-1.5 rounded-full border border-accent-soft/40 bg-accent/20 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent/40"
          >
            {objFormOuvert ? (
              <>
                <X size={13} strokeWidth={2.4} /> Fermer
              </>
            ) : (
              <>
                <Plus size={13} strokeWidth={2.4} /> Nouvel objectif
              </>
            )}
          </button>
        </div>

        {objFormOuvert && (
          <form
            onSubmit={creerObjectif}
            className="animate-slide-down mt-3 space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3"
          >
            <input
              value={objNom}
              onChange={(e) => setObjNom(e.target.value)}
              placeholder="Nom (ex : loyer, moto, écolage…)"
              className="glass-input"
              required
            />
            <div className="flex gap-2">
              <input
                type="number"
                min={1}
                inputMode="numeric"
                value={objCible}
                onChange={(e) => setObjCible(e.target.value)}
                placeholder="Montant à atteindre"
                className="glass-input flex-1"
                required
              />
              <span className="flex items-center text-slate-400">Ar</span>
            </div>
            {objErreur && <p className="text-xs text-rose-300">{objErreur}</p>}
            <button type="submit" className="glass-button-accent w-full py-2 text-sm">
              Créer l&apos;objectif
            </button>
          </form>
        )}

        <div className="mt-3">
          {objectifs.length === 0 && !objFormOuvert ? (
            <p className="text-sm text-slate-500">
              Mets de côté pour un loyer, une moto, l&apos;écolage… Quand une
              grosse somme rentre, réserve-la ici : elle sort du « solde libre »
              et ton budget conseillé s&apos;adapte.
            </p>
          ) : (
            <ul className="space-y-3">
              {objectifs.map((obj, i) => {
                const actuel = Number(obj.montant_actuel);
                const cible = Math.max(1, Number(obj.montant_cible));
                const part = Math.min(100, Math.round((actuel / cible) * 100));
                const atteint = actuel >= cible;
                return (
                  <li
                    key={obj.id}
                    className="animate-pop-in rounded-xl bg-white/[0.03] p-3"
                    style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
                  >
                    <div className="flex items-center justify-between">
                      <p className="truncate text-sm font-medium text-slate-200">
                        {obj.nom}
                        {atteint && (
                          <span className="ml-2 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-300">
                            Atteint
                          </span>
                        )}
                      </p>
                      <div className="ml-2 flex shrink-0 items-center gap-1">
                        <button
                          onClick={() => {
                            setAlimId(alimId === obj.id ? null : obj.id);
                            setAlimMontant('');
                          }}
                          className="rounded-md p-1 text-slate-500 transition hover:bg-white/10 hover:text-slate-200"
                          title="Ajouter / retirer de l'argent"
                        >
                          <PiggyBank size={14} strokeWidth={2} />
                        </button>
                        <button
                          onClick={() => supprimerObjectif(obj.id)}
                          className="rounded-md p-1 text-slate-600 transition hover:bg-rose-500/20 hover:text-rose-300"
                          title="Supprimer l'objectif"
                        >
                          <X size={14} strokeWidth={2.2} />
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${
                          atteint ? 'bg-emerald-400' : 'bg-accent'
                        }`}
                        style={{ width: `${part}%` }}
                      />
                    </div>
                    <p className="mt-1.5 text-[11px] text-slate-500">
                      {formaterMontant(actuel)} / {formaterMontant(cible)} · {part}%
                    </p>

                    {alimId === obj.id && (
                      <div className="animate-slide-down mt-2 flex gap-2">
                        <input
                          type="number"
                          min={1}
                          inputMode="numeric"
                          value={alimMontant}
                          onChange={(e) => setAlimMontant(e.target.value)}
                          placeholder="Montant"
                          className="glass-input flex-1 py-2 text-sm"
                        />
                        <button
                          onClick={() => alimenterObjectif(obj, 1)}
                          className="rounded-xl bg-emerald-500/20 px-3 text-sm font-medium text-emerald-200 transition hover:bg-emerald-500/30"
                        >
                          ＋
                        </button>
                        <button
                          onClick={() => alimenterObjectif(obj, -1)}
                          className="rounded-xl bg-rose-500/20 px-3 text-sm font-medium text-rose-200 transition hover:bg-rose-500/30"
                        >
                          −
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* Cagnotte des arrondis + Compteur de la honte */}
      <div
        className="animate-pop-in grid grid-cols-2 gap-4"
        style={{ animationDelay: prochainDelai() }}
      >
        <section className="glass-soft p-4">
          <p className="flex items-center gap-1.5 text-xs text-slate-400">
            <PiggyBank size={13} className="text-sky-400" />
            Cagnotte arrondis
          </p>
          <p className="mt-1 text-2xl font-bold text-sky-300">
            {formaterMontant(cagnotte)}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">épargne indolore ce mois</p>
        </section>
        <section className="glass-soft p-4">
          <p className="flex items-center gap-1.5 text-xs text-slate-400">
            <Flame size={13} className="text-rose-400" />
            Compteur de la honte
          </p>
          <p className="mt-1 text-2xl font-bold text-rose-400">
            {formaterMontant(honte)}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">gaspillage assumé</p>
        </section>
      </div>

      {/* Ajout / modification d'une opération */}
      <section
        ref={refForm}
        className="glass animate-pop-in scroll-mt-24 p-4"
        style={{ animationDelay: prochainDelai() }}
      >
        <button
          onClick={() => {
            if (formOuvert) reinitialiserForm();
            setFormOuvert((v) => !v);
          }}
          className="flex w-full items-center justify-between text-sm"
        >
          <span className="flex items-center gap-2 font-semibold text-slate-100">
            {editionId ? (
              <>
                <Pencil size={15} strokeWidth={2.2} className="text-accent-soft" />
                Modifier l&apos;opération
              </>
            ) : (
              <>
                <Plus size={16} strokeWidth={2.4} className="text-accent-soft" />
                Ajouter une opération
              </>
            )}
          </span>
          {formOuvert ? (
            <ChevronUp size={16} className="text-slate-500" />
          ) : (
            <ChevronDown size={16} className="text-slate-500" />
          )}
        </button>

        {formOuvert && (
          <form onSubmit={enregistrerOperation} className="animate-slide-down mt-3 space-y-2">
            <div className="flex gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
              <button
                type="button"
                disabled={!!editionId}
                onClick={() => setTypeForm('depense')}
                className={`flex-1 rounded-lg py-2 text-sm transition disabled:opacity-60 ${
                  typeForm === 'depense'
                    ? 'bg-rose-500/25 font-medium text-rose-200'
                    : 'text-slate-400'
                }`}
              >
                − Dépense
              </button>
              <button
                type="button"
                disabled={!!editionId}
                onClick={() => setTypeForm('revenu')}
                className={`flex-1 rounded-lg py-2 text-sm transition disabled:opacity-60 ${
                  typeForm === 'revenu'
                    ? 'bg-emerald-500/25 font-medium text-emerald-200'
                    : 'text-slate-400'
                }`}
              >
                ＋ Entrée d&apos;argent
              </button>
            </div>

            <div>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={montantForm}
                  onChange={(e) => setMontantForm(e.target.value)}
                  placeholder="Montant"
                  className="glass-input flex-1"
                  required
                />
                <span className="flex items-center text-slate-400">Ar</span>
              </div>
              {Number(montantForm) > 0 && (
                <p className="mt-1 text-[11px] text-slate-500">
                  = {formaterMontant(Number(montantForm))}
                </p>
              )}
            </div>

            {typeForm === 'depense' ? (
              <select
                value={categorieForm}
                onChange={(e) => setCategorieForm(e.target.value)}
                className="glass-input"
              >
                {CATEGORIES_DEPENSE.map((c) => (
                  <option key={c} value={c} className="bg-slate-900">
                    {c}
                  </option>
                ))}
              </select>
            ) : (
              <select
                value={sourceForm}
                onChange={(e) => setSourceForm(e.target.value)}
                className="glass-input"
              >
                {SOURCES_REVENU.map((s) => (
                  <option key={s} value={s} className="bg-slate-900">
                    {s}
                  </option>
                ))}
              </select>
            )}

            <input
              value={descriptionForm}
              onChange={(e) => setDescriptionForm(e.target.value)}
              placeholder="Description (optionnel)"
              className="glass-input"
            />

            {projetsDisponibles && projets.length > 0 && (
              <select
                value={projetForm}
                onChange={(e) => setProjetForm(e.target.value)}
                className="glass-input"
              >
                <option value="" className="bg-slate-900">
                  Aucun projet (perso)
                </option>
                {projets.map((p) => (
                  <option key={p.id} value={p.id} className="bg-slate-900">
                    Projet : {p.nom}
                  </option>
                ))}
              </select>
            )}

            <div>
              <label className="mb-1 block text-[11px] text-slate-500">
                Date et heure {editionId ? '' : '(vide = maintenant)'}
              </label>
              <input
                type="datetime-local"
                value={dateForm}
                onChange={(e) => setDateForm(e.target.value)}
                className="glass-input"
              />
            </div>

            {typeForm === 'depense' && (
              <button
                type="button"
                onClick={() => setGaspillageForm((v) => !v)}
                aria-pressed={gaspillageForm}
                className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition ${
                  gaspillageForm
                    ? 'border-rose-400/40 bg-rose-500/20 text-rose-200'
                    : 'border-white/10 bg-white/[0.03] text-slate-400'
                }`}
              >
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded border ${
                    gaspillageForm
                      ? 'border-rose-300 bg-rose-400/80 text-white'
                      : 'border-slate-500'
                  }`}
                >
                  {gaspillageForm && <X size={11} strokeWidth={3} />}
                </span>
                Marquer comme gaspillage
              </button>
            )}

            {erreurAjout && <p className="text-xs text-rose-300">{erreurAjout}</p>}

            <button
              type="submit"
              disabled={ajoutEnCours}
              className="glass-button-accent w-full py-2.5 text-sm"
            >
              {ajoutEnCours
                ? 'Enregistrement…'
                : editionId
                  ? 'Enregistrer les modifications'
                  : 'Enregistrer'}
            </button>

            {editionId && (
              <button
                type="button"
                onClick={() => {
                  reinitialiserForm();
                  setFormOuvert(false);
                }}
                className="glass-button w-full py-2 text-sm text-slate-400"
              >
                Annuler la modification
              </button>
            )}
          </form>
        )}
      </section>

      {/* Dernières opérations */}
      <section
        className="glass animate-pop-in p-5"
        style={{ animationDelay: prochainDelai() }}
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm text-slate-400">Dernières opérations</p>
          {operations.length > 0 && (
            <button
              onClick={exporterCsv}
              className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-400 transition hover:text-white"
              title="Exporter toutes les opérations en CSV (Excel)"
            >
              <Download size={13} strokeWidth={2} />
              Exporter
            </button>
          )}
        </div>
        {chargement ? (
          <p className="text-sm text-slate-500">Chargement…</p>
        ) : operations.length === 0 ? (
          <p className="text-sm text-slate-500">
            Aucune opération. Ajoute une entrée ou une dépense ci-dessus, ou
            passe par le chat.
          </p>
        ) : (
          <>
            <div className="space-y-2">
              {(() => {
                let dernierJour = '';
                return operations.slice(0, nbOperationsAffichees).map((op, i) => {
                  const jour = libelleJour(op.date);
                  const nouvelleJournee = jour !== dernierJour;
                  dernierJour = jour;
                  return (
                    <div key={`${op.table}-${op.id}`}>
                      {nouvelleJournee && (
                        <p className="mb-1.5 mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500 first:mt-0">
                          {jour}
                        </p>
                      )}
                      <div
                        className="animate-pop-in flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2 transition hover:bg-white/[0.06]"
                        style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}
                      >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-slate-200">{op.libelle}</p>
                    <p className="text-[11px] text-slate-500">
                      {op.sousLibelle} · {formaterHeure(op.date)}
                      {op.gaspillage && (
                        <span className="ml-1 text-rose-400">· gaspillage</span>
                      )}
                    </p>
                  </div>
                  <div className="ml-3 flex shrink-0 items-center gap-1">
                    <span
                      className={`mr-1 font-medium ${
                        op.montant >= 0 ? 'text-emerald-300' : 'text-slate-100'
                      }`}
                    >
                      {op.montant >= 0 ? '+' : '−'}
                      {formaterMontant(Math.abs(op.montant))}
                    </span>
                    <button
                      onClick={() => commencerEdition(op)}
                      className="rounded-md p-1 text-slate-600 transition hover:bg-white/10 hover:text-slate-200"
                      title="Modifier cette opération"
                    >
                      <Pencil size={13} strokeWidth={2.2} />
                    </button>
                    <button
                      onClick={() => supprimerOperation(op)}
                      className="rounded-md p-1 text-slate-600 transition hover:bg-rose-500/20 hover:text-rose-300"
                      title="Supprimer cette opération"
                    >
                      <X size={14} strokeWidth={2.2} />
                    </button>
                  </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
            {operations.length > nbOperationsAffichees && (
              <button
                onClick={() => setNbOperationsAffichees((n) => n + 10)}
                className="mt-3 w-full text-center text-xs text-slate-400 transition hover:text-white"
              >
                Voir plus ({operations.length - nbOperationsAffichees} restantes)
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}
