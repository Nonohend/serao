// =============================================================================
// Logique des graphiques & calculs — Burn Rate & Arrondis virtuels (Étape 3)
// Fonctions pures, testables, sans dépendance à Supabase ou React.
// =============================================================================

import type { BurnRate, Depense, FluxTresorerie, Revenu } from './types';

/** Nombre de jours dans le mois d'une date donnée. */
export function joursDansLeMois(date = new Date()): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

/** Numéro du jour courant dans le mois (1..31). */
export function jourCourant(date = new Date()): number {
  return date.getDate();
}

/** Filtre les dépenses appartenant au mois de la date de référence. */
export function depensesDuMois(depenses: Depense[], reference = new Date()): Depense[] {
  return depenses.filter((d) => {
    const t = new Date(d.date_transaction);
    return (
      t.getFullYear() === reference.getFullYear() &&
      t.getMonth() === reference.getMonth()
    );
  });
}

/**
 * Calcule l'arrondi virtuel d'un montant en Ariary : différence avec le
 * millier d'Ar supérieur. 12 500 Ar → 500 Ar ; 10 000 Ar → 0 Ar (déjà rond,
 * aucune mise en cagnotte).
 */
export function arrondiVirtuel(montant: number, pas = 1000): number {
  if (montant <= 0) return 0;
  const superieur = Math.ceil(montant / pas) * pas;
  const diff = superieur - montant;
  // Corrige les imprécisions de flottant.
  return Math.round(diff * 100) / 100;
}

/**
 * Somme la cagnotte des arrondis. Utilise le champ persisté quand il existe,
 * sinon recalcule à partir du montant (robustesse pour les anciennes données).
 */
export function cagnotteArrondis(depenses: Depense[]): number {
  const total = depenses.reduce((acc, d) => {
    const arrondi =
      d.montant_arrondi_virtuel != null && d.montant_arrondi_virtuel > 0
        ? Number(d.montant_arrondi_virtuel)
        : arrondiVirtuel(Number(d.montant));
    return acc + arrondi;
  }, 0);
  return Math.round(total * 100) / 100;
}

/** Total financier des dépenses tagguées gaspillage — « le compteur de la honte ». */
export function compteurDeLaHonte(depenses: Depense[]): number {
  const total = depenses
    .filter((d) => d.est_gaspillage)
    .reduce((acc, d) => acc + Number(d.montant), 0);
  return Math.round(total * 100) / 100;
}

/**
 * Burn Rate : compare le rythme de dépense réel au rythme cible.
 *   rythmeReel  = dépenses du mois / jours écoulés
 *   rythmeCible = budget total / jours dans le mois
 * Déclenche une alerte visuelle selon le ratio.
 */
export function calculerBurnRate(
  depenses: Depense[],
  budgetMensuelCible: number,
  reference = new Date(),
): BurnRate {
  const duMois = depensesDuMois(depenses, reference);
  const depensesActuelles =
    Math.round(duMois.reduce((acc, d) => acc + Number(d.montant), 0) * 100) / 100;

  const joursEcoules = jourCourant(reference);
  const totalJours = joursDansLeMois(reference);

  const rythmeReel = joursEcoules > 0 ? depensesActuelles / joursEcoules : 0;
  const rythmeCible = totalJours > 0 ? budgetMensuelCible / totalJours : 0;

  const ratio = rythmeCible > 0 ? rythmeReel / rythmeCible : 0;
  const projectionFinDeMois = Math.round(rythmeReel * totalJours * 100) / 100;
  const resteADepenser = Math.round((budgetMensuelCible - depensesActuelles) * 100) / 100;

  let alerte: BurnRate['alerte'] = 'ok';
  if (ratio >= 1.15) alerte = 'critique';
  else if (ratio >= 1.0) alerte = 'attention';

  return {
    depensesActuelles,
    joursEcoules,
    joursDansLeMois: totalJours,
    rythmeReel: Math.round(rythmeReel * 100) / 100,
    rythmeCible: Math.round(rythmeCible * 100) / 100,
    ratio: Math.round(ratio * 100) / 100,
    projectionFinDeMois,
    resteADepenser,
    alerte,
  };
}

/** Classe de couleur Tailwind adaptative selon le niveau d'alerte du burn rate. */
export function couleurBurnRate(alerte: BurnRate['alerte']): string {
  switch (alerte) {
    case 'critique':
      return 'text-rose-400';
    case 'attention':
      return 'text-amber-400';
    default:
      return 'text-emerald-400';
  }
}

/** Jours restants avant péremption estimée d'un article d'inventaire. */
export function joursAvantPeremption(
  dateAchat: string,
  joursConservation: number,
  maintenant = new Date(),
): number {
  const achat = new Date(dateAchat);
  const peremption = new Date(achat);
  peremption.setDate(peremption.getDate() + joursConservation);
  const diffMs = peremption.getTime() - maintenant.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/** Vrai si la date ISO appartient au mois de la date de référence. */
export function estDansLeMois(dateIso: string, reference = new Date()): boolean {
  const t = new Date(dateIso);
  return (
    t.getFullYear() === reference.getFullYear() &&
    t.getMonth() === reference.getMonth()
  );
}

/**
 * Trésorerie adaptée aux revenus irréguliers :
 *   solde = total des entrées − total des sorties (depuis le début) ;
 *   runway = combien de jours ce solde tient au rythme de dépense moyen
 *   des 30 derniers jours.
 */
export function calculerFlux(
  depenses: Depense[],
  revenus: Revenu[],
  reference = new Date(),
): FluxTresorerie {
  const totalEntrees = revenus.reduce((acc, r) => acc + Number(r.montant), 0);
  const totalSorties = depenses.reduce((acc, d) => acc + Number(d.montant), 0);
  const soldeDisponible = Math.round((totalEntrees - totalSorties) * 100) / 100;

  const entreesMois =
    Math.round(
      revenus
        .filter((r) => estDansLeMois(r.date_reception, reference))
        .reduce((acc, r) => acc + Number(r.montant), 0) * 100,
    ) / 100;
  const sortiesMois =
    Math.round(
      depenses
        .filter((d) => estDansLeMois(d.date_transaction, reference))
        .reduce((acc, d) => acc + Number(d.montant), 0) * 100,
    ) / 100;

  const ilYA30Jours = new Date(reference);
  ilYA30Jours.setDate(ilYA30Jours.getDate() - 30);
  const sorties30j = depenses
    .filter((d) => new Date(d.date_transaction) >= ilYA30Jours)
    .reduce((acc, d) => acc + Number(d.montant), 0);
  const depenseMoyenneJour = Math.round((sorties30j / 30) * 100) / 100;

  const runwayJours =
    depenseMoyenneJour > 0
      ? Math.floor(Math.max(0, soldeDisponible) / depenseMoyenneJour)
      : null;

  let niveau: FluxTresorerie['niveau'] = 'ok';
  if (soldeDisponible <= 0) niveau = 'critique';
  else if (runwayJours !== null && runwayJours < 7) niveau = 'critique';
  else if (runwayJours !== null && runwayJours < 21) niveau = 'attention';

  return {
    soldeDisponible,
    entreesMois,
    sortiesMois,
    depenseMoyenneJour,
    runwayJours,
    niveau,
  };
}

/** Total des dépenses par jour sur les N derniers jours (pour le graphique). */
export function depensesParJour(
  depenses: Depense[],
  nbJours = 14,
  reference = new Date(),
): { label: string; total: number }[] {
  const jours: { label: string; total: number }[] = [];
  for (let i = nbJours - 1; i >= 0; i--) {
    const jour = new Date(reference);
    jour.setDate(jour.getDate() - i);
    const total = depenses
      .filter((d) => {
        const t = new Date(d.date_transaction);
        return (
          t.getFullYear() === jour.getFullYear() &&
          t.getMonth() === jour.getMonth() &&
          t.getDate() === jour.getDate()
        );
      })
      .reduce((acc, d) => acc + Number(d.montant), 0);
    jours.push({ label: String(jour.getDate()), total });
  }
  return jours;
}

/** Classe de couleur selon le niveau de trésorerie. */
export function couleurFlux(niveau: FluxTresorerie['niveau']): string {
  switch (niveau) {
    case 'critique':
      return 'text-rose-400';
    case 'attention':
      return 'text-amber-400';
    default:
      return 'text-emerald-400';
  }
}

/** Formatage monétaire en Ariary (MGA) — ex : 1 250 000 Ar. */
export function formaterMontant(montant: number): string {
  const nombre = new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: 0,
  }).format(Math.round(montant));
  return `${nombre} Ar`;
}
