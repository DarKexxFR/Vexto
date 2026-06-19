# Vexto

Application mobile pour réduire l'empreinte carbone : proposer des trajets
alternatifs moins polluants, avec gamification (points = CO₂ évité), classement
entre amis, et récompenses.

## Stack

- **Frontend** : React Native (Expo SDK 54, RN 0.81, React 19), TypeScript strict, NativeWind (Tailwind), React Navigation
- **Backend / DB** : Supabase (Postgres 17 + PostGIS) — anti-triche géo-spatial
- **APIs prévues** : Mapbox (cartes), ADEME (CO₂), Open Data transports (GTFS/SIRI)

> Note Node : Expo SDK 54 requiert **Node 20+**. Installez-le via
> `nvm install 20 && nvm use 20`. Le projet utilise `legacy-peer-deps=true`
> (`.npmrc`) pour lisser les pairs React 19.

## Démarrage

```bash
cd vexto
npm install
cp .env.example .env   # puis renseigne tes clés (Supabase, Mapbox)
npm start              # puis 'i' (iOS), 'a' (Android) ou 'w' (web)
npm run typecheck
npm test
```

## Carte & itinéraire (Mapbox)

L'écran **Trajet** affiche une carte interactive (Mapbox GL JS dans une
`WebView`, donc compatible **Expo Go** et **web**), avec recherche d'adresse
(départ + destination), bouton **position GPS**, tracé de l'itinéraire et calcul
des points selon la distance réelle.

1. Crée un token public Mapbox (gratuit) sur https://account.mapbox.com/ (il
   commence par `pk.`).
2. Renseigne-le dans `.env` → `MAPBOX_TOKEN=pk....` (voir `.env.example`).
3. Relance `npx expo start -c`.

Sans token, l'écran affiche un bandeau d'avertissement et la carte reste
désactivée. APIs utilisées : Mapbox Geocoding (recherche + reverse) et Mapbox
Directions (`src/lib/mapbox.ts`). Pour la prod, on pourra remplacer la WebView
par le SDK natif `@rnmapbox/maps` (nécessite un *development build*).

## Configuration Supabase

Les clés sont lues depuis `.env` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) par
`app.config.ts`, puis exposées via `expo.extra`. Copie `.env.example` vers
`.env` et remplis tes valeurs. Le projet Supabase lié : `diqwgkkpdpkhjwolcwiz`
(région eu-west-3).

Régénérer les types DB : utiliser l'outil MCP Supabase `generate_typescript_types`
et mettre à jour `src/types/database.ts`.

## Logique métier (ADEME)

Facteurs d'émission (kg CO₂e/km) dans `src/domain/carbon.ts` :

| Mode | FE (kg CO₂e/km) |
| --- | --- |
| Voiture thermique (autosolisme) | 0.218 |
| Transports collectifs | 0.010 |
| Vélo / marche | 0.0 |

- Économie nette voiture → transport : **ΔFE = 0.208 kg/km**
- Règle de points : **1 point = 100 g de CO₂e évité** ⇒ `points = km × 2.08` (cas transport)
- Le calcul CO₂/points est **recalculé côté serveur** (`verify_trip`) — jamais
  fait confiance au client.

## Anti-triche (PostGIS)

`validate_trip_geo(track, operator_id, 20m)` vérifie que la trace GPS reste dans
un buffer de **20 mètres** autour de la ligne de transport officielle
(`ST_DWithin` + `ST_Within`). Seuls les trajets `publicTransit` sont soumis au
contrôle géo.

## Structure

```
src/
  components/   UI réutilisable (Button, Card, ScoreRing, ScreenContainer)
  constants/    modes de transport, données d'exemple
  domain/       logique pure (carbon.ts + tests, format.ts)
  lib/          client Supabase, services (trips, profile), geo, config
  navigation/   bottom tabs (Accueil/Trajet/Classement/Récompenses/Profil)
  screens/      écrans
  store/        état global Zustand
  theme/        palette Sage-Tech
  types/        types DB stricts
supabase/migrations/  SQL (extensions, schéma, fonctions, RLS, hardening)
```

## Palette (Modern Sage-Tech)

| Rôle | Couleur |
| --- | --- |
| Forest (primaire) | `#102B19` |
| Leaf (succès / points) | `#2A804D` |
| Mineral (fond) | `#FAF9F5` |
| Bordures | `#E2E1D9` |
