# EoTrainer

Un carnet de course personnel : une course à préparer, les séances de la semaine et les sorties réalisées. Sans inscription ni compte dans l’application.

## Démarrer

Node 24 et pnpm 11.25.0.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Le programme et l’import JSON fonctionnent sans configuration serveur. La course et l’historique sont enregistrés dans le stockage local du navigateur. Par défaut, il n’y a pas de sauvegarde cloud ni de transfert entre appareils. Le carnet privé facultatif ajoute une sauvegarde/restauration manuelle ; aucune tâche en arrière-plan n’est exécutée. Le programme déterministe est recalculé à l’ouverture et à chaque modification/import ; un programme IA approuvé reste conservé jusqu’à son adaptation explicite. Effacer le stockage du navigateur efface sa copie locale. En navigation privée, il peut disparaître à la fermeture.

## Connecter Garmin (facultatif)

1. Générer une [clé API personnelle Garmin Connect](https://connect.garmin.com/app/settings/personalApiToken) pour son propre compte.
2. Dans « Mes sorties », choisir « Connecter Garmin », saisir la clé et enregistrer la connexion.
3. Cliquer sur « Importer depuis Garmin » pour récupérer les courses des 90 derniers jours. Les sorties sont intégrées au carnet et les imports répétés de la même activité Garmin sont dédupliqués.

La clé personnelle est validée auprès de Garmin, puis chiffrée dans un cookie HttpOnly lié au navigateur. MyTrainer obtient un jeton auprès de Garmin à chaque import. En cas d’expiration, générer une nouvelle clé dans Garmin Connect et utiliser « Modifier la clé Garmin ». « Déconnecter Garmin » efface la clé de ce navigateur.

Le serveur utilise `TOKEN_ENCRYPTION_KEY` et l’origine configurée par `APP_URL` ou, en son absence, le domaine de production Vercel. Conserver la clé de chiffrement existante si elle est déjà configurée. Les activités Garmin servent au programme local et aux statistiques. Le coach OpenAI exclut ces imports. Les activités déjà importées depuis Strava ont des identifiants distincts et peuvent apparaître deux fois si la même sortie est importée depuis les deux services.

## Connecter Strava (facultatif)

1. Créer ou ouvrir une application dans les [paramètres API Strava](https://www.strava.com/settings/api).
2. Définir son domaine de rappel avec le nom d’hôte affiché dans le formulaire, par exemple `mon-app.vercel.app` ou `localhost`, sans protocole ni chemin. Strava redirige vers `/api/strava/callback`.
3. Dans « Mes sorties », cliquer sur « Connect with Strava ». Si le serveur ne fournit pas d’identifiants Strava, saisir le Client ID et le Client Secret de son application. Si le serveur en fournit, le bouton lance directement l’autorisation et « Utiliser ma propre application Strava » donne accès au formulaire.
4. Autoriser la lecture des activités privées sur Strava, puis cliquer sur « Importer depuis Strava » au retour.

Pour héberger l’intégration, renseigner `TOKEN_ENCRYPTION_KEY` avec une clé générée par `openssl rand -hex 32`. Utiliser `APP_URL` pour l’origine de l’application, notamment si elle utilise un domaine personnalisé. Sans `APP_URL`, l’intégration Strava utilise le domaine de production fourni par la variable système Vercel `VERCEL_PROJECT_PRODUCTION_URL` lorsqu’elle est disponible. Pour activer le parcours en un clic, renseigner aussi `STRAVA_CLIENT_ID` et `STRAVA_CLIENT_SECRET` sur le serveur. Copier `.env.example` vers `.env.local` en local, ou renseigner les variables dans Vercel puis redéployer.

L’import récupère les courses Run/TrailRun/VirtualRun des 90 derniers jours. Les unités sont converties et les identifiants dédupliqués ; une course le même jour qu’une séance la marque réalisée, à vérifier manuellement. Les autres sports et les activités sans distance/durée sont ignorés. Le carnet est limité à 1 000 activités. L’import JSON normalisé reste disponible (`public/example-activities.json`, 400 Ko maximum).

Les jetons Strava et les identifiants renseignés dans l’interface sont chiffrés côté serveur dans un cookie HttpOnly, SameSite=Lax, Secure en production. Ils ne sont pas accessibles au JavaScript du navigateur, ni placés dans le stockage local. Les routes d’écriture contrôlent l’origine de la requête ; les jetons expirés sont renouvelés côté serveur avec les identifiants de la connexion. Cette connexion est propre au navigateur, pas un compte EoTrainer. Un changement de clé de chiffrement nécessite une reconnexion. Déconnecter supprime le cookie ; révoquer complètement l’autorisation dans les paramètres Strava si souhaité.

L’import Strava n’effectue aucun appel OpenAI ; les activités identifiées Strava sont exclues de la fonctionnalité IA facultative. Vérifier les conditions et règles de marque Strava avant publication, et particulièrement avant toute future utilisation des données avec une IA.

## Depuis l’ancienne version

Cette version ne demande plus de compte Supabase et ne lit plus les anciennes tables. Les données existantes en base restent intactes ; elles ne sont pas migrées automatiquement vers le navigateur. Avant de quitter l’ancienne version, récupérer les activités au format JSON si nécessaire ; noter la course et les statuts des séances, qui doivent être ressaisis. Les anciens fichiers SQL sont conservés comme historique ; seule la migration facultative du carnet privé est nécessaire pour la nouvelle fonctionnalité IA. Les anciennes routes privées et la tâche cron ont été retirées. Retirer les anciens secrets Garmin/cron et les variables Supabase devenues inutiles du déploiement après migration et révoquer les autorisations devenues inutiles.

## Adapter le programme avec OpenAI (facultatif)

Le carnet privé ajoute une sauvegarde manuelle dans Supabase et une proposition IA des 14 prochains jours, à prévisualiser puis appliquer. Aucun compte à créer : l’accès est protégé par une clé privée propre à cette installation personnelle. Les activités identifiées comme Garmin ou Strava sont exclues de l’envoi à OpenAI. Voir [la configuration et le fonctionnement](docs/coach.md) pour la migration SQL et les variables serveur.

## Statistiques

La navigation de gauche permet de passer du programme aux statistiques (sur mobile, elle est placée en haut). La page présente les kilomètres cumulés, le nombre de courses, la distance moyenne, l’allure moyenne, la durée et le dénivelé positif. Choisir les 7 ou 30 derniers jours (aujourd’hui inclus) ou tout l’historique importé. Les séances planifiées et les dates futures sont exclues.

L’allure globale est la durée cumulée divisée par la distance cumulée, et non la moyenne des allures de chaque sortie. Les 20 dernières courses de la période sont affichées avec leur date, distance, durée, allure et D+. Le nom Strava est conservé lors des nouveaux imports ; les anciennes activités sans nom restent compatibles et apparaissent comme « Sortie à pied ». Les chiffres reposent uniquement sur les activités disponibles dans le navigateur ; l’import Strava reste limité aux 90 derniers jours.

## Programme

Dans le formulaire de la course, choisir « Finir », « Progresser » ou « Viser un chrono », puis cliquer sur « Générer mon programme ». Les séances tiennent compte de la distance, du terrain, du dénivelé, du nombre de sorties souhaité, du volume des 28 derniers jours et des séances manquées. Le travail soutenu est réservé aux objectifs de progression ou de chrono quand le temps de préparation et le volume le permettent. Pour le chrono sur route, une allure est proposée sur les fractions spécifiques lorsqu’elle est cohérente avec les sorties récentes. Le volume s’allège avant la course et la veille est libre. Les données utilisées sont indiquées dans « Comprendre le programme ».

Les statuts explicites et les séances déjà réalisées sont conservés. Les imports Garmin et Strava alimentent ce calcul dans le navigateur. « Recalculer mon programme » permet de revenir au programme par objectif après avoir validé une proposition du coach OpenAI.

## Vérifier

```sh
pnpm test
pnpm typecheck
pnpm build
```

Recette navigateur : modifier une course, recharger et retrouver le programme ; importer deux fois le même JSON sans doublon ; modifier un statut ; tester sur mobile. Avec les clés Strava réelles : connexion/refus, import, renouvellement du jeton et déconnexion. Les tests automatisés couvrent le moteur, le stockage normalisé, les imports et les protocoles Garmin et Strava avec réponses simulées. Un essai avec tes comptes reste nécessaire pour vérifier l’autorisation et l’import réels.

Déploiement Vercel : framework Next.js, Node 24, `pnpm install --frozen-lockfile`, `pnpm build`. Supabase n’est requis que pour le carnet privé et la fonctionnalité IA facultative.
