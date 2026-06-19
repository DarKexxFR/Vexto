# CLAUDE.md

Ce fichier guide Claude Code (et autres agents) lorsqu'ils travaillent dans ce dépôt.

## Présentation

**Vexto** est une application mobile (et web) pour réduire l'empreinte carbone :
elle propose des trajets alternatifs moins polluants, avec gamification (points =
CO₂ évité), classement entre amis et récompenses. Le code applicatif vit dans le
sous-dossier [`vexto/`](.) — toutes les commandes ci-dessous se lancent depuis ce
dossier.

## Stack technique

- **Frontend** : React Native via Expo SDK 54 (RN 0.81, React 19), TypeScript
  **strict**, NativeWind (Tailwind), React Navigation (bottom tabs).
- **État global** : Zustand (`src/store/useAppStore.ts`).
- **Backend / DB** : Supabase (Postgres 17 + PostGIS). Projet lié :
  `diqwgkkpdpkhjwolcwiz` (région `eu-west-3`).
- **APIs** : Mapbox (cartes/itinéraires via WebView + Mapbox GL JS), ADEME
  (facteurs CO₂), Open Data transports prévu (GTFS/SIRI).

> **Node 20+ requis** (Expo SDK 54). Le projet utilise `legacy-peer-deps=true`
> (`.npmrc`) pour lisser les pairs React 19.

## Commandes

```bash
cd vexto
npm install            # installer les dépendances
cp .env.example .env   # renseigner les clés (Supabase, Mapbox)
npm start              # Expo : 'i' (iOS), 'a' (Android), 'w' (web)
npm run android        # ouvrir directement sur Android
npm run ios            # ouvrir directement sur iOS
npm run web            # ouvrir sur le web
npm run typecheck      # tsc --noEmit (TypeScript strict)
npm test               # jest (preset jest-expo)
```

Après modification de code, lancer **`npm run typecheck`** et **`npm test`**
avant de considérer la tâche terminée.

## Architecture du code

```
src/
  components/   UI réutilisable (Button, Card, ScoreRing, ScreenContainer,
                MapWebView, AddressSearchInput, NavigationOverlay)
  constants/    modes de transport, données d'exemple
  domain/       logique pure + tests (carbon.ts, format.ts)
  hooks/        hooks React (useAuthSession, useCurrentLocation, useTripTracker)
  lib/          client Supabase, services (trips, profile, auth), geo, mapbox, config
  navigation/   RootNavigator (Accueil/Trajet/Classement/Récompenses/Profil)
  screens/      écrans (un par onglet + AuthScreen)
  store/        état global Zustand
  theme/        palette "Modern Sage-Tech" (colors.ts)
  types/        types DB stricts (database.ts, générés depuis Supabase)
supabase/migrations/  SQL (extensions, schéma, fonctions, RLS, hardening)
```

Flux d'authentification : `App.tsx` → `Gate` lit `useAuthSession()` et affiche
soit `AuthScreen` (déconnecté), soit `RootNavigator` (connecté).

## Conventions

- **Imports** : utiliser l'alias `@/*` → `src/*` (voir `tsconfig.json` +
  `babel-plugin-module-resolver`). Pas d'imports relatifs profonds.
- **TypeScript strict** avec `noUncheckedIndexedAccess`. Pas de `any` implicite.
- **Styles** : NativeWind/Tailwind (`className`) ; les couleurs de thème
  viennent de `@/theme/colors`, pas de valeurs en dur.
- **Secrets** : jamais commités. Lues via `.env` → `app.config.ts` (`expo.extra`)
  → `@/lib/config`. Ajouter toute nouvelle clé dans `.env.example`.
- **Langue** : l'UI et les libellés de navigation sont en français.

## Règles métier critiques (sécurité / anti-triche)

- **Le client ne calcule jamais le score définitif.** CO₂ et points sont
  **recalculés côté serveur** par la fonction Postgres `verify_trip`. Côté client
  (`src/lib/trips.ts`), un trajet est inséré en état `pending` sans points, puis
  vérifié via `supabase.rpc("verify_trip", ...)`.
- **Anti-triche géo (PostGIS)** : `validate_trip_geo(track, operator_id, 20m)`
  vérifie que la trace GPS reste dans un buffer de 20 m autour de la ligne de
  transport officielle. Seuls les trajets `publicTransit` sont soumis au contrôle.
- **Facteurs ADEME** (kg CO₂e/km) dans `src/domain/carbon.ts` : voiture thermique
  `0.218`, transports collectifs `0.010`, vélo/marche `0.0`. Règle de points :
  **1 point = 100 g de CO₂e évité** ⇒ `points = km × 2.08` (cas transport).

Toute modification de la logique CO₂/points doit rester cohérente entre
`src/domain/carbon.ts` (client, pour l'affichage) et les migrations SQL
(`supabase/migrations/0003_functions.sql`, source de vérité serveur).

## Supabase

- Client typé dans `src/lib/supabase.ts` (auth PKCE, session persistée via
  AsyncStorage sur natif).
- **Régénérer les types DB** : utiliser l'outil MCP Supabase
  `generate_typescript_types` puis mettre à jour `src/types/database.ts`
  (le script `npm run gen:types` ne fait que le rappeler).
- Les changements de schéma passent par de nouvelles migrations dans
  `supabase/migrations/` (ne pas éditer les migrations déjà appliquées).

## Mapbox

L'écran **Trajet** utilise Mapbox GL JS dans une `WebView` (compatible Expo Go et
web). Sans token (`MAPBOX_TOKEN` dans `.env`, commence par `pk.`), la carte est
désactivée et un bandeau d'avertissement s'affiche (`isMapboxConfigured` dans
`@/lib/config`). Géocodage et itinéraires : `src/lib/mapbox.ts`.
