// =============================================================================
// Logique des graphiques & calculs — Burn Rate & Arrondis virtuels (Étape 3)
// Fonctions pures, testables, sans dépendance à Supabase ou React.
// =============================================================================

import type { BurnRate, Depense } from './types';

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
 * Calcule l'arrondi virtuel d'un montant : différence avec l'euro supérieur.
 * 3.40 → 0.60 ; 10.00 → 0.00 (déjà rond, aucune mise en cagnotte).
 */
export function arrondiVirtuel(montant: number): number {
  const superieur = Math.ceil(montant);
  const diff = superieur - montant;
  // Corrige les imprécisions de flottant (ex : 0.5999999999).
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

/** Formatage monétaire en Ariary (MGA) — ex : 1 250 000 Ar. */
export function formaterMontant(montant: number): string {
  const nombre = new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: 0,
  }).format(Math.round(montant));
  return `${nombre} Ar`;
}
