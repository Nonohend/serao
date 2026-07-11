# Mon Coloc IA

Outil **mobile-first** de gestion de budget, de lutte contre le gaspillage et
d'aide à la consommation. Design **glassmorphism** optimisé pour le Dark Mode.

Stack : **Next.js 14 (App Router) · Supabase · Vercel AI SDK (Claude) · Tailwind CSS**.

## Fonctionnalités

- **Tableau de bord** : reste à dépenser (couleur adaptative selon le _burn rate_),
  cagnotte des arrondis virtuels, « compteur de la honte » (gaspillage).
- **Chat en langage naturel** : « 50€ de courses à l'épicerie », « 15€ de resto ».
  L'IA crée la dépense, peuple l'inventaire et sait chercher des prix réels sur le
  web (outil Tavily). Interrupteur **Mode Roast** (IA sans filtre).
- **Inventaire du frigo** : aliments triés par urgence de péremption + bouton
  « Qu'est-ce qu'on mange ? » qui génère une recette à partir du stock, adaptée à
  l'équipement de cuisine et à l'énergie du soir.
- **Profil / onboarding** : budget cible, équipements, rythme de vie, énergie.
- **Bilan flash quotidien** via Vercel Cron (`/api/cron/daily-report`).

## Structure

```
mon-coloc-ia/
├── app/
│   ├── layout.tsx · page.tsx · globals.css
│   └── api/
│       ├── chat/route.ts            ← Vercel AI SDK + tool calling (Tavily + dépense)
│       ├── depenses/route.ts        ← CRUD dépenses
│       ├── recette/route.ts         ← génération de recette depuis l'inventaire
│       └── cron/daily-report/route.ts
├── components/  Dashboard · ChatInterface · InventaireFrigo · ProfilForm
├── lib/         calculs.ts (burn rate, arrondis) · types.ts · supabase/{client,server}.ts
├── supabase/migration.sql
├── middleware.ts · vercel.json · .env.example
```

## Démarrage

1. **Installer** : `npm install`
2. **Base de données** : coller `supabase/migration.sql` dans Supabase → SQL Editor → Run.
3. **Variables d'environnement** : copier `.env.example` vers `.env.local` et
   renseigner les clés (Supabase, `ANTHROPIC_API_KEY`, `TAVILY_API_KEY`, `CRON_SECRET`).
4. **Lancer** : `npm run dev` → http://localhost:3000

## Calculs clés (`lib/calculs.ts`)

- **Burn Rate** : `(dépenses du mois / jours écoulés)` comparé à
  `(budget / jours du mois)`. Alerte visuelle `ok` / `attention` / `critique`.
- **Arrondis virtuels** : différence de chaque dépense avec l'euro supérieur,
  cumulée dans une cagnotte globale.

## Déploiement Vercel

Le fichier `vercel.json` déclare un **Cron Job** quotidien (20h) appelant
`/api/cron/daily-report`. Protéger l'endpoint avec `CRON_SECRET` et, en option,
renseigner `DAILY_REPORT_WEBHOOK_URL` (Slack/Discord) pour l'envoi réel des bilans.

> Le modèle Claude par défaut est `claude-opus-4-8` via `@ai-sdk/anthropic`.
