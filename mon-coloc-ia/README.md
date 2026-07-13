# Mon Coloc IA

App **mobile-first** de gestion de trésorerie, d'anti-gaspillage et d'aide à la
consommation, pensée pour des **revenus irréguliers** (business) et les montants
en **Ariary (Ar)** 🇲🇬. Design glassmorphism sombre, animé, installable en PWA.

Stack : **Next.js 14 (App Router) · Supabase · Vercel AI SDK (Google Gemini) · Tailwind CSS · Lucide**.

## Fonctionnalités

### Trésorerie (onglet Budget)
- **Argent disponible** = solde de départ + entrées − sorties, avec
  **jours d'avance** (runway) calculés sur le rythme de dépense des 30 derniers jours.
- **Prédiction « Conseillé aujourd'hui »** : budget quotidien pour tenir 30 jours
  avec le solde libre, jauge de consommation du jour.
- **Entrées d'argent** (sources : business, vente, mobile money…), **dépenses**
  (catégories, gaspillage), date/heure précises, **édition** et suppression,
  liste groupée par jour, graphique 14 jours, top catégories.
- **Ajuster le solde** : recale l'app sur le solde réel sans toucher à l'historique.
- **Objectifs d'épargne** : réserves virtuelles (loyer, moto…) qui sortent du
  solde libre ; barres de progression.
- **Projets business** : rattachement des opérations, rentabilité
  investi / rapporté / net par projet.
- Cagnotte d'**arrondis virtuels** (au millier d'Ar supérieur) et
  « compteur de la honte » (gaspillage).

### Coloc IA (chat, Gemini)
- Langage naturel : « 50 000 Ar de courses », « j'ai encaissé 200 000 Ar »,
  « mets 100 000 Ar de côté pour le loyer », « nouveau projet : élevage ».
- **Photos** : tickets de caisse et **SMS mobile money** (MVola / Orange Money /
  Airtel Money) en capture ou copiés-collés — extraction montant/frais/sens,
  vérification du solde annoncé.
- Outils : dépense (+ inventaire), revenu, objectif, projet, activité,
  ajustement de solde, recherche web (Tavily).
- Le prompt système est **injecté dynamiquement** : profil, équipement cuisine,
  solde, prédiction, objectifs, projets, dernières dépenses/activités.
- Mode **Roast** (sans filtre), conversation **persistée** localement.

### Inventaire de la maison (onglet Stock)
- Catégories : frigo, épicerie, hygiène, ménage, autre ; tri par urgence de
  péremption ; ajout manuel ou via le chat ; consommé / gaspillé.
- **« Qu'est-ce qu'on mange ? »** : recette générée depuis les seuls
  ingrédients alimentaires en stock, adaptée à l'équipement et à l'énergie.

### Autres
- **PWA installable** (manifest + icônes générées), squelettes de chargement,
  écran d'erreur, fond animé « aurore », police Manrope à chiffres tabulaires.
- **Cron quotidien** (`vercel.json` → `/api/cron/daily-report`) : bilan flash
  des dépenses du jour (webhook optionnel).

## Démarrage

1. `npm install`
2. Exécuter les migrations dans Supabase → SQL Editor, **dans l'ordre** :
   `supabase/migration.sql` → `migration_v2.sql` → … → `migration_v6.sql`
3. Copier `.env.example` → `.env.local` et renseigner :
   Supabase (URL, anon, service_role), `GOOGLE_GENERATIVE_AI_API_KEY`,
   `CRON_SECRET`, `TAVILY_API_KEY` (optionnel).
4. `npm run dev` → http://localhost:3000

## Migrations

| Fichier | Contenu |
|---|---|
| `migration.sql` | Tables de base (profil, dépenses, inventaire), trigger `*_coloc`, RLS |
| `migration_v2.sql` | Catégories d'inventaire + journal d'activités |
| `migration_v3.sql` | Entrées d'argent (revenus) |
| `migration_v4.sql` | Objectifs d'épargne |
| `migration_v5.sql` | Projets + lien projet sur dépenses/revenus |
| `migration_v6.sql` | Solde de départ (recalage du solde réel) |

## Notes techniques

- Modèle IA : alias **`gemini-flash-latest`** (suit automatiquement le dernier
  modèle Flash gratuit) — surchargeable via `GEMINI_MODEL`.
- Les montants SMS malgaches sont lus avec la règle « espace/point = milliers,
  virgule = décimales » et cités tels quels pour vérification.
- Root Directory Vercel : `mon-coloc-ia` (le dépôt héberge aussi SERAO).
