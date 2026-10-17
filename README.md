# EoTrainer

Un carnet de course personnel : une course à préparer, les séances de la semaine et les sorties réalisées. Sans inscription ni compte dans l’application.

## Démarrer

Node 24 et pnpm 11.25.0.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Le programme et l’import JSON fonctionnent sans configuration serveur. La course et l’historique sont enregistrés dans le stockage local du navigateur. Il n’y a pas de sauvegarde cloud, de transfert entre appareils ni de tâche en arrière-plan. Le programme est recalculé à l’ouverture et à chaque modification/import. Effacer le stockage du navigateur efface le carnet. En navigation privée, il peut disparaître à la fermeture.

## Connecter Strava (facultatif)

1. Créer une application sur https://www.strava.com/settings/api.
2. Configurer son domaine de callback, par exemple `mon-app.vercel.app` (sans protocole ni chemin). Le retour OAuth utilisé est `https://mon-app.vercel.app/api/strava/callback`.
3. Copier `.env.example` vers `.env.local` et renseigner `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `APP_URL` (origine de l’application) et `TOKEN_ENCRYPTION_KEY` (générée avec `openssl rand -hex 32`). En production, utiliser les variables d’environnement Vercel et redéployer. Ne jamais committer les secrets.
4. Cliquer sur « Connect with Strava », autoriser la lecture des activités, puis « Importer depuis Strava ».

L’import récupère les courses Run/TrailRun/VirtualRun des 90 derniers jours. Les unités sont converties et les identifiants dédupliqués ; une course le même jour qu’une séance la marque réalisée, à vérifier manuellement. Les autres sports et les activités sans distance/durée sont ignorés. Le carnet est limité à 1 000 activités. L’import JSON normalisé reste disponible (`public/example-activities.json`, 400 Ko maximum).

Les jetons Strava sont chiffrés dans un cookie HttpOnly, SameSite=Lax, Secure en production. Ils ne sont pas accessibles au JavaScript du navigateur, ni placés dans le stockage local. Les routes d’écriture contrôlent l’origine de la requête ; les jetons expirés sont renouvelés côté serveur. Cette connexion est propre au navigateur, pas un compte EoTrainer. Un changement de clé de chiffrement nécessite une reconnexion. Déconnecter supprime le cookie ; révoquer complètement l’autorisation dans les paramètres Strava si souhaité.

Pour les activités Garmin, activer la synchronisation Garmin Connect → Strava. Ni accès partenaire Garmin ni MCP ne sont nécessaires. Aucun appel OpenAI n’est effectué. Vérifier les conditions et règles de marque Strava avant publication, et particulièrement avant toute future utilisation des données avec une IA.

## Depuis l’ancienne version

Cette version ne demande plus de compte Supabase et ne lit plus les anciennes tables. Les données existantes en base restent intactes ; elles ne sont pas migrées automatiquement vers le navigateur. Avant de quitter l’ancienne version, récupérer les activités au format JSON si nécessaire ; noter la course et les statuts des séances, qui doivent être ressaisis. Les fichiers SQL sont conservés comme historique et ne sont pas requis pour une nouvelle installation. Les anciennes routes privées et la tâche cron ont été retirées. Retirer les anciens secrets Supabase/Garmin/cron du déploiement après migration et révoquer les autorisations devenues inutiles.

## Programme

Le moteur conserve les règles existantes : volume récent sur 28 jours, progression bornée, semaines allégées, affûtage et réduction après séances manquées. Les statuts explicites et l’ancrage du programme sont conservés. Ces heuristiques ne sont pas un modèle physiologique ; elles ne prennent pas en compte les blessures ou l’état de santé. Le détail des ajustements est disponible sous le programme, sans rubrique « coach ».

## Vérifier

```sh
pnpm test
pnpm typecheck
pnpm build
```

Recette navigateur : modifier une course, recharger et retrouver le programme ; importer deux fois le même JSON sans doublon ; modifier un statut ; tester sur mobile. Avec les clés Strava réelles : connexion/refus, import, renouvellement du jeton et déconnexion. Les tests automatisés couvrent le moteur, le stockage normalisé, les imports et le protocole Strava avec réponses simulées ; ils ne prouvent pas une connexion réelle à Strava.

Déploiement Vercel : framework Next.js, Node 24, `pnpm install --frozen-lockfile`, `pnpm build`. Aucun service Supabase requis.
