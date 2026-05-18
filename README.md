# SERAO — Marketplace Malagasy

Projet React converti depuis un fichier HTML monolithique vers une vraie structure
**Vite + React 18**, prêt à être ouvert et modifié dans **VS Code**.

## Structure

```
serao/
├── index.html          ← shell HTML + couche d'arrière-plan (#root au-dessus)
├── package.json
├── vite.config.js
├── .gitignore
└── src/
    ├── main.jsx        ← point d'entrée (montage React)
    ├── App.jsx         ← toute l'app (composants, pages, routing interne)
    └── styles.css      ← CSS extraite (glassmorphism, animations, responsive)
```

## Lancer le projet

Prérequis : **Node.js 18+** (vérifier avec `node -v`).

Dans un terminal, depuis ce dossier :

```bash
npm install      # installe react, react-dom, leaflet et vite (≈ 30 s)
npm run dev      # démarre le serveur de dev sur http://localhost:5173
```

Le navigateur s'ouvre automatiquement. Tout changement dans `src/` est rechargé à chaud.

Pour générer un build de production :

```bash
npm run build    # produit dist/
npm run preview  # sert dist/ pour vérification locale
```

## Ouvrir dans VS Code

```bash
code .
```

Extensions recommandées :

- **ES7+ React/Redux/React-Native snippets** (rfc, useState, etc.)
- **Prettier** (formatage)
- **Simple React Snippets**

## Comptes de démo

L'auth est simulée via `localStorage` :

- `vendeur@sava.mg` / `vendeur123` (rôle vendeur)
- `ravo@gmail.com` / `acheteur123` (rôle acheteur)
- `admin@serao.mg` / `serao2026` (admin — accès via 5 clics sur le logo)

## Notes techniques

- React et ReactDOM sont maintenant importés (plus de CDN ni de Babel-standalone).
- Leaflet est installé en dépendance ; le CSS est importé dans `main.jsx`.
- Les fonts Google et la couche d'arrière-plan animée (blobs, mesh, emoji flottants)
  restent dans `index.html` — c'est le `#root` React qui se monte par-dessus.
- Deux typos CSS de l'original (`..chat-send:disabled` et `justify-content:center.chat-av-fix`)
  ont été corrigées dans `src/styles.css`.

## Prochains chantiers conseillés

- Découper `App.jsx` (≈ 860 lignes) en `src/components/` et `src/pages/`.
- Remplacer le routing manuel par **react-router-dom**.
- Migrer `localStorage` vers une vraie API (Express, Fastify, Next.js).
- Ajouter ESLint + Prettier en devDependencies.
