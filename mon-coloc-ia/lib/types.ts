// Types partagés pour Mon Coloc IA, reflétant le schéma Supabase.

export interface ProfilUtilisateur {
  id: string;
  updated_at: string | null;
  budget_mensuel_cible: number;
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
  { slug: 'frigo', label: 'Frigo', emoji: '🧊' },
  { slug: 'epicerie', label: 'Épicerie', emoji: '🥫' },
  { slug: 'hygiene', label: 'Hygiène', emoji: '🧴' },
  { slug: 'menage', label: 'Ménage', emoji: '🧹' },
  { slug: 'autre', label: 'Autre', emoji: '📦' },
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
