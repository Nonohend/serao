// Types partagés pour Mon Coloc IA, reflétant le schéma Supabase.

export interface ProfilUtilisateur {
  id: string;
  updated_at: string | null;
  budget_mensuel_cible: number;
  solde_initial?: number;
  a_un_frigo: boolean;
  a_un_congelo: boolean;
  a_des_plaques: boolean;
  a_un_microondes: boolean;
  rythme_de_vie: string | null;
  niveau_energie_soir: number;
}

export interface Depense {
  id: string;
  user_id: string;
  montant: number;
  categorie: string;
  description: string | null;
  date_transaction: string;
  est_gaspillage: boolean;
  montant_arrondi_virtuel: number;
  projet_id?: string | null;
}

export interface Projet {
  id: string;
  user_id: string;
  nom: string;
  description: string | null;
  statut: 'actif' | 'termine' | 'pause';
  cree_le: string;
}

export interface Revenu {
  id: string;
  user_id: string;
  montant: number;
  source: string | null;
  description: string | null;
  date_reception: string;
  projet_id?: string | null;
}

// Photographie de la trésorerie — pensée pour des revenus irréguliers :
// on raisonne en solde disponible et en jours d'avance, pas en salaire mensuel.
export interface FluxTresorerie {
  soldeDisponible: number;
  entreesMois: number;
  sortiesMois: number;
  depenseMoyenneJour: number; // moyenne des 30 derniers jours
  runwayJours: number | null; // combien de jours le solde tient ; null si aucune dépense récente
  niveau: 'ok' | 'attention' | 'critique';
}

export interface Objectif {
  id: string;
  user_id: string;
  nom: string;
  montant_cible: number;
  montant_actuel: number;
  echeance: string | null;
  cree_le: string;
}

export type StatutInventaire = 'en_stock' | 'consomme' | 'gaspille';

export interface InventaireItem {
  id: string;
  user_id: string;
  depense_id: string | null;
  nom_produit: string;
  date_achat: string;
  jours_conservation_estimes: number;
  statut: StatutInventaire;
  categorie: string;
}

export interface JournalActivite {
  id: string;
  user_id: string;
  description: string;
  date_activite: string;
}

// Catégories de l'inventaire de la maison.
export const CATEGORIES_INVENTAIRE = [
  { slug: 'frigo', label: 'Frigo' },
  { slug: 'epicerie', label: 'Épicerie' },
  { slug: 'hygiene', label: 'Hygiène' },
  { slug: 'menage', label: 'Ménage' },
  { slug: 'autre', label: 'Autre' },
] as const;

export type CategorieInventaire = (typeof CATEGORIES_INVENTAIRE)[number]['slug'];

// Catégories considérées comme alimentaires (pour les recettes).
export const CATEGORIES_ALIMENTAIRES: string[] = ['frigo', 'epicerie'];

// Résultat des calculs de burn rate.
export interface BurnRate {
  depensesActuelles: number;
  joursEcoules: number;
  joursDansLeMois: number;
  rythmeReel: number; // €/jour dépensés
  rythmeCible: number; // €/jour autorisés
  ratio: number; // rythmeReel / rythmeCible
  projectionFinDeMois: number; // dépense projetée à ce rythme
  resteADepenser: number;
  alerte: 'ok' | 'attention' | 'critique';
}
