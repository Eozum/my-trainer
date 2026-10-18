# EoTrainer

Un carnet de course personnel : une course à préparer, les séances de la semaine et les sorties réalisées. Sans inscription ni compte dans l’application.

## Démarrer

Node 24 et pnpm 11.25.0.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Le programme et l’import JSON fonctionnent sans configuration serveur. La course et l’historique sont enregistrés dans le stockage local du navigateur. Par défaut, il n’y a pas de sauvegarde cloud ni de transfert entre appareils. Le carnet privé facultatif ajoute une sauvegarde/restauration manuelle ; aucune tâche en arrière-plan n’est exécutée. Le programme déterministe est recalculé à l’ouverture et à chaque modification/import ; un programme IA approuvé reste conservé jusqu’à son adaptation explicite. Effacer le stockage du navigateur efface sa copie locale. En navigation privée, il peut disparaître à la fermeture.

## Connecter Strava (facultatif)

1. Créer une application sur https://www.strava.com/settings/api.
2. Configurer son domaine de callback, par exemple `mon-app.vercel.app` (sans protocole ni chemin). Le retour OAuth utilisé est `https://mon-app.vercel.app/api/strava/callback`.
3. Copier `.env.example` vers `.env.local` et renseigner `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `APP_URL` (origine de l’application) et `TOKEN_ENCRYPTION_KEY` (générée avec `openssl rand -hex 32`). En production, utiliser les variables d’environnement Vercel et redéployer. Ne jamais committer les secrets.
4. Cliquer sur « Connect with Strava », autoriser la lecture des activités, puis « Importer depuis Strava ».

L’import récupère les courses Run/TrailRun/VirtualRun des 90 derniers jours. Les unités sont converties et les identifiants dédupliqués ; une course le même jour qu’une séance la marque réalisée, à vérifier manuellement. Les autres sports et les activités sans distance/durée sont ignorés. Le carnet est limité à 1 000 activités. L’import JSON normalisé reste disponible (`public/example-activities.json`, 400 Ko maximum).

Les jetons Strava sont chiffrés dans un cookie HttpOnly, SameSite=Lax, Secure en production. Ils ne sont pas accessibles au JavaScript du navigateur, ni placés dans le stockage local. Les routes d’écriture contrôlent l’origine de la requête ; les jetons expirés sont renouvelés côté serveur. Cette connexion est propre au navigateur, pas un compte EoTrainer. Un changement de clé de chiffrement nécessite une reconnexion. Déconnecter supprime le cookie ; révoquer complètement l’autorisation dans les paramètres Strava si souhaité.

Pour les activités Garmin, activer la synchronisation Garmin Connect → Strava. Ni accès partenaire Garmin ni MCP ne sont nécessaires. L’import Strava n’effectue aucun appel OpenAI ; les activités identifiées Strava sont exclues de la fonctionnalité IA facultative. Vérifier les conditions et règles de marque Strava avant publication, et particulièrement avant toute future utilisation des données avec une IA.

## Depuis l’ancienne version

Cette version ne demande plus de compte Supabase et ne lit plus les anciennes tables. Les données existantes en base restent intactes ; elles ne sont pas migrées automatiquement vers le navigateur. Avant de quitter l’ancienne version, récupérer les activités au format JSON si nécessaire ; noter la course et les statuts des séances, qui doivent être ressaisis. Les anciens fichiers SQL sont conservés comme historique ; seule la migration facultative du carnet privé est nécessaire pour la nouvelle fonctionnalité IA. Les anciennes routes privées et la tâche cron ont été retirées. Retirer les anciens secrets Garmin/cron et les variables Supabase devenues inutiles du déploiement après migration et révoquer les autorisations devenues inutiles.

## Adapter le programme avec OpenAI (facultatif)

Le carnet privé ajoute une sauvegarde manuelle dans Supabase et une proposition IA des 14 prochains jours, à prévisualiser puis appliquer. Aucun compte à créer : l’accès est protégé par une clé privée propre à cette installation personnelle. Les données identifiées comme Strava ne sont pas envoyées à OpenAI. Voir [la configuration et le fonctionnement](docs/coach.md) pour la migration SQL et les variables serveur.

## Statistiques

La navigation de gauche permet de passer du programme aux statistiques (sur mobile, elle est placée en haut). La page présente les kilomètres cumulés, le nombre de courses, la distance moyenne, l’allure moyenne, la durée et le dénivelé positif. Choisir les 7 ou 30 derniers jours (aujourd’hui inclus) ou tout l’historique importé. Les séances planifiées et les dates futures sont exclues.

L’allure globale est la durée cumulée divisée par la distance cumulée, et non la moyenne des allures de chaque sortie. Les 20 dernières courses de la période sont affichées avec leur date, distance, durée, allure et D+. Le nom Strava est conservé lors des nouveaux imports ; les anciennes activités sans nom restent compatibles et apparaissent comme « Sortie à pied ». Les chiffres reposent uniquement sur les activités disponibles dans le navigateur ; l’import Strava reste limité aux 90 derniers jours.

## Programme

Le moteur conserve les règles existantes : volume récent sur 28 jours, progression bornée, semaines allégées, affûtage et réduction après séances manquées. Les statuts explicites et l’ancrage du programme sont conservés. Ces heuristiques ne sont pas un modèle physiologique ; elles ne prennent pas en compte les blessures ou l’état de santé. Le détail des ajustements est disponible sous le programme, sans rubrique « coach ».

## Vérifier

```sh
pnpm test
pnpm typecheck
pnpm build
```

Recette navigateur : modifier une course, recharger et retrouver le programme ; importer deux fois le même JSON sans doublon ; modifier un statut ; tester sur mobile. Avec les clés Strava réelles : connexion/refus, import, renouvellement du jeton et déconnexion. Les tests automatisés couvrent le moteur, le stockage normalisé, les imports et le protocole Strava avec réponses simulées ; ils ne prouvent pas une connexion réelle à Strava.

Déploiement Vercel : framework Next.js, Node 24, `pnpm install --frozen-lockfile`, `pnpm build`. Supabase n’est requis que pour le carnet privé et la fonctionnalité IA facultative.
