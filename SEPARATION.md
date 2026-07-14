# Séparation SERAO ↔ Mon Coloc IA

Les deux projets vivent dans ce dépôt mais sont désormais **totalement isolés** :

| | SERAO (marketplace) | Mon Coloc IA |
|---|---|---|
| Code | racine du dépôt (`src/`, `android/`…) | `mon-coloc-ia/` |
| Hébergement | GitHub Pages (`deploy.yml`) + APK (`build-android.yml`) | Vercel |
| Base Supabase | projet **SERAO** (`ieydodwzccskavzgyrnz`) | projet **Mon coloc IA** (`upjusqrcqejrsmicgbwl`) |
| CI/CD | ignore `mon-coloc-ia/**` (paths-ignore) | Vercel build sur le dossier `mon-coloc-ia` |

## Pourquoi cette séparation ?

Les migrations de Mon Coloc IA avaient été exécutées **dans la base SERAO** :
les tables `depenses`, `revenus`, `projets`, `profil_utilisateur`, etc.
cohabitaient avec les tables du marketplace, et le trigger
`on_auth_user_created_coloc` s'exécutait pour chaque inscription SERAO.
C'est la source des « conflits de connexion ».

## Étapes de bascule (à faire une fois)

1. **Créer le schéma dans le nouveau projet** : Supabase → projet
   *Mon coloc IA* → SQL Editor → coller
   `mon-coloc-ia/supabase/migration_complete.sql` → Run.
2. **Mettre à jour Vercel** (projet Mon Coloc IA → Settings → Environment
   Variables) :
   - `NEXT_PUBLIC_SUPABASE_URL` → `https://upjusqrcqejrsmicgbwl.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → clé *publishable* du projet Mon coloc IA
     (Supabase → Settings → API Keys)
   - `SUPABASE_SERVICE_ROLE_KEY` → clé *service role* du projet Mon coloc IA
   - Redéployer.
3. **Recréer ton compte** dans l'app Mon Coloc IA (nouvelle base = nouveaux
   comptes) et re-saisir le solde initial dans le profil.
4. **Nettoyer la base SERAO** : Supabase → projet *SERAO* → SQL Editor →
   coller `supabase/cleanup_coloc.sql` → Run.

## Séparation complète des dépôts (recommandé, plus tard)

L'idéal reste de déplacer `mon-coloc-ia/` dans son propre dépôt GitHub :
créer un dépôt `mon-coloc-ia`, y copier le contenu du dossier, connecter
Vercel à ce nouveau dépôt, puis supprimer le dossier d'ici.
