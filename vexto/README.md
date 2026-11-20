# Vexto 🌿

Application mobile **et site web** pour réduire son empreinte carbone : comparer
les trajets bas-carbone, connaître les **horaires RATP / IDFM en temps réel**,
être guidé, gagner des points (1 point = 100 g de CO₂ évité), se mesurer à ses
amis, échanger ses crédits contre des récompenses… et faire pousser sa forêt.

## Fonctionnalités

| | |
| --- | --- |
| 🧭 **Trajets intelligents** | 5 modes comparés avec leurs vraies distances et durées (voiture avec trafic, vélo, trottinette, marche, transports), étiquettes *le plus rapide / le plus vert / recommandé* (tient compte de la météo et de vos véhicules), favoris Maison / Travail, recherches récentes, inversion départ ↔ arrivée. |
| 🚇 **Horaires temps réel IDFM** | Onglet **Horaires** : prochains passages autour de vous, arrêts favoris, recherche de lignes et d'arrêts (bus, métro, RER, tram, Transilien), fiche ligne avec **tracé officiel** et arrêts, retards en direct. Dans **Trajet** : vrais itinéraires en transports avec heures de départ (« Métro 1 à 08:42, partez dans 4 min »). |
| 🗣️ **Navigation guidée** | Virage par virage avec **voix en français**, recalcul automatique si vous déviez, détection d'arrivée, pause, écran maintenu allumé ; en transports, guidage étape par étape (marche → montez dans le RER A direction… → descendez à…). |
| 🏆 **Gamification** | Points calculés et vérifiés côté serveur (anti-triche), niveaux, série de jours 🔥, 16 succès, classement général / amis / semaine, code ami, récompenses avec bons de réduction. |
| 🎁 **Surprise du chef : Ma Forêt Vexto** | Une forêt vivante qui pousse avec le CO₂ évité (1 arbre = 25 kg, 5 stades de croissance), saisons et ciel selon l'heure, faune qui revient, équivalences concrètes (km en voiture, repas, jeans…), partage. Plus un **coach météo** qui conseille le meilleur mode du moment. |
| 🚲 **Vélib' en temps réel** | Stations proches dans Horaires ; en mode vélo, où prendre un vélo au départ (mécaniques / électriques) et où le reposer à l'arrivée (places libres), aussi sur la carte. Données ouvertes Paris / Vélib' Métropole, sans clé. |
| 🌐 **Site web / PWA** | La même app dans le navigateur, installable sur l'écran d'accueil, déployée automatiquement sur GitHub Pages. |

## Stack

- **App** : React Native (Expo SDK 54, RN 0.81, React 19), TypeScript strict, NativeWind, React Navigation, Zustand, react-native-svg — tourne sur iOS, Android et **web**.
- **Backend** : Supabase (Postgres + PostGIS, RLS, fonctions SQL, Edge Function `transit`).
- **APIs** : Mapbox (carte, recherche, itinéraires, voix), **Île-de-France Mobilités PRIM** (Navitia : horaires et itinéraires temps réel), Open-Meteo (météo, sans clé), facteurs d'émission **ADEME**.

> Expo SDK 54 requiert **Node 20+** (`nvm install 20 && nvm use 20`). Le projet
> utilise `legacy-peer-deps=true` (`.npmrc`).

## Démarrage (local)

```bash
cd vexto
npm install
cp .env.example .env   # renseigne SUPABASE_URL, SUPABASE_ANON_KEY, MAPBOX_TOKEN
npm start              # puis 'i' (iOS), 'a' (Android) ou 'w' (web)
npm run typecheck
npm test
```

Sans clés Supabase, l'app affiche un écran « Configuration requise » au lieu de
planter ; sans token Mapbox, la carte et la recherche d'adresse sont désactivées.

## Mise en production — checklist

### 1. Base de données (obligatoire)

Appliquez les migrations `supabase/migrations/0001` → `0007` (éditeur SQL de
Supabase, ou `npx supabase db push`). La **0006** corrige des failles importantes
(voir *Sécurité*) ; la **0007** prépare les tracés officiels IDFM.

### 2. Horaires temps réel (Île-de-France et SNCF)

La fonction `supabase/functions/transit` choisit la source selon le lieu :

| Zone | Source | Secret Supabase | Clé gratuite |
| --- | --- | --- | --- |
| Île-de-France (RATP, RER, Transilien, bus…) | IDFM PRIM | `PRIM_API_KEY` | [prim.iledefrance-mobilites.fr](https://prim.iledefrance-mobilites.fr) › s'abonner à « Calculateur IDFM – Accès générique (v2) » › Mes clés d'API |
| Reste de la France, trajets entre villes (TER, TGV, Intercités…) | API SNCF | `SNCF_API_KEY` | [numerique.sncf.com › API](https://numerique.sncf.com/startup/api/) |

Un trajet dont le départ et l'arrivée sont en Île-de-France utilise PRIM ;
sinon il passe par l'API SNCF. Seules les sources dont la clé est renseignée
sont actives.

1. Ajoutez les clés dans Supabase › **Edge Functions › Secrets** (elles ne
   quittent jamais le serveur).
2. Déployez la fonction : `npx supabase functions deploy transit`, ou dans le
   tableau de bord **Edge Functions › Deploy a new function › Via Editor**
   (nom `transit`, collez `supabase/functions/transit/index.ts`).

La fonction n'accepte que les utilisateurs connectés et met les réponses en
cache pour ménager les quotas. Variables optionnelles : `PRIM_NAVITIA_BASE`,
`SNCF_NAVITIA_BASE`.

Tant que la fonction n'est pas déployée, l'app l'indique et estime la durée en
transports.

> Anti-triche : les tracés officiels importés (étape 3) ne couvrent que
> l'Île-de-France ; un trajet en transports ailleurs est refusé tant que ses
> lignes ne sont pas importées.

### 3. Tracés officiels des lignes (anti-triche transports)

```bash
node scripts/import-idfm-lines.mjs        # télécharge les tracés open data IDFM (ODbL)
# → supabase/seed/idfm_lines.sql à exécuter dans l'éditeur SQL
# ou directement : SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/import-idfm-lines.mjs --upload
```

Par défaut : métro, RER, train, tram, câble. Les **bus** sont exclus car ils
roulent sur la route (un trajet en voiture le long d'une ligne de bus passerait
le contrôle) ; ajoutez-les avec `--modes=metro,rer,train,tram,bus` si vous
acceptez ce compromis. Sans tracés importés, les trajets en transports sont
refusés (« trace hors du réseau officiel »).

### 4. Site web (GitHub Pages) 🌐

Le workflow `.github/workflows/deploy-web.yml` publie l'app sur
**https://darkexxfr.github.io/Vexto/** à chaque push sur `main` :

1. GitHub › **Settings › Pages** › *Build and deployment* › Source : **GitHub Actions**.
2. GitHub › **Settings › Secrets and variables › Actions** : ajoutez
   `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `MAPBOX_TOKEN` (clés publiques côté client).
3. Fusionnez sur `main` (ou lancez le workflow à la main : onglet *Actions* › *Run workflow*).
4. Supabase › **Authentication › URL Configuration** : ajoutez
   `https://darkexxfr.github.io/Vexto/` aux *Redirect URLs* (connexion Google,
   mot de passe oublié). Si votre token Mapbox est restreint par URL, ajoutez ce domaine.

Sur mobile, ouvrez le site puis « Ajouter à l'écran d'accueil » : Vexto s'installe
comme une app. Le workflow `ci.yml` vérifie typecheck, tests et build web à chaque push.

### 5. Récompenses

Ajoutez vos offres dans la table `rewards` (`brand_name`, `title`, `voucher_code`,
`points_cost`). Tant qu'elle est vide, un catalogue de démonstration (non
échangeable) est affiché.

## Sécurité & anti-triche

- Les points ne sont **jamais** calculés par le client : `verify_trip` recalcule
  le CO₂ (ADEME), prend la distance **depuis la trace GPS** (pas celle déclarée),
  vérifie la vitesse moyenne selon le mode, est idempotente et plafonne à 500 pts/jour.
- Transports : la trace doit suivre à ≥ 60 % une ligne officielle (PostGIS,
  tolérance 30 m), ligne détectée automatiquement.
- Les clients ne peuvent plus modifier leurs points / trajets, lire les emails des
  autres, voir les codes promo sans les payer, ni s'ajouter des amis sans
  consentement. Échanges de récompenses atomiques (`redeem_reward`).
- Tests : `supabase/tests/run.sh` rejoue 39 scénarios d'attaque sur une base
  Postgres+PostGIS **jetable** (voir l'en-tête du script).

## Logique métier (ADEME)

| Mode | FE (kg CO₂e/km) |
| --- | --- |
| Voiture thermique (autosolisme) | 0.218 |
| Transports collectifs | 0.010 |
| Trottinette électrique | 0.025 |
| Vélo / marche | 0.0 |

- Économie nette voiture → transports : **ΔFE = 0.208 kg/km**.
- **1 point = 100 g de CO₂e évité** ⇒ `points = km × 2.08` en transports.
- Forêt : 1 arbre = 25 kg de CO₂ évité (≈ absorption annuelle d'un arbre).

## Structure

```
vexto/
  App.tsx                     écran de config / splash / auth / navigation
  src/
    components/               UI (ui.tsx, Button, Card…), map/ (Mapbox natif + web),
                              transit/ (badges de lignes, départs, itinéraires),
                              forest/ (scène SVG), NavigationOverlay, TripCelebration…
    domain/                   logique pure testée : carbon, routing, navigation,
                              transit (Navitia), stats, achievements, forest,
                              levels, equivalences, weather, format
    hooks/                    session, GPS filtré, stats utilisateur
    lib/                      Supabase, Mapbox, transit (PRIM), météo, trajets,
                              profils, amis, récompenses, erreurs, partage…
    navigation/               onglets (Accueil, Horaires, Trajet, Classement,
                              Récompenses) + pages (Profil, Forêt, Arrêt, Ligne…)
    screens/                  écrans
    store/                    Zustand : app, préférences (persistées), météo
  supabase/
    migrations/               SQL (schéma, RLS, anti-triche, social, IDFM)
    functions/transit/        Edge Function proxy PRIM (Deno)
    tests/                    tests SQL d'attaque + fixtures
  scripts/import-idfm-lines.mjs   import des tracés officiels IDFM
  public/                     index.html, manifeste PWA, icônes
.github/workflows/            CI + déploiement GitHub Pages
```

## Palette (Modern Sage-Tech)

| Rôle | Couleur |
| --- | --- |
| Forest (primaire) | `#102B19` |
| Leaf (succès / points) | `#2A804D` |
| Mineral (fond) | `#FAF9F5` |
| Bordures | `#E2E1D9` |
