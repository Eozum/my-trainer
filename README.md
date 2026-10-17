# Stride · my-trainer

MVP de planification de course à pied en français. Next.js App Router, fonctions serverless Vercel, authentification Supabase par email/mot de passe, PostgreSQL et Row Level Security.

## Démarrer

Node 24 et pnpm 11.25.0 (Corepack ou installation pnpm).

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Sans variables, le tableau de bord fonctionne en démonstration en mémoire. Aucune donnée réelle Garmin n’est fournie. Les modifications disparaissent au rechargement. La création de compte et les API privées exigent Supabase.

## Déployer sur Vercel via GitHub

1. Créer un projet Supabase dans la région souhaitée ; exécuter `supabase/schema.sql` dans l’éditeur SQL, une seule fois.
2. Activer Email dans Authentication / Providers. Garder la confirmation email activée ; définir Site URL sur le domaine Vercel final. Configurer SMTP pour un usage réel et les limites d’authentification Supabase.
3. Importer `Eozum/my-trainer` dans Vercel. Framework Next.js, racine du dépôt, Node 24, installation `pnpm install --frozen-lockfile`, build `pnpm build`.
4. Définir `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_URL` (origine HTTPS sans slash final), `CRON_SECRET` (secret aléatoire). Aucune clé serveur ne doit porter le préfixe NEXT_PUBLIC.
5. Déployer, créer deux comptes distincts et effectuer la recette ci-dessous. Les previews doivent utiliser un projet Supabase séparé. Ne pas réutiliser de données personnelles en preview.
6. Pour Strava, suivre la section Import Strava ci-dessous.

GitHub Actions vérifie les types, les tests et la compilation sur chaque push/PR. Vercel peut générer une preview pour chaque PR ; la production suit main après fusion. Aucune fusion automatique.

## Fonctionnement

- Course : nom, date (1 à 365 jours), distance (3 à 100 km), D+, trail/urban trail/route, intention, temps estimé, volume et 2 à 5 sorties/semaine.
- Historique : JSON normalisé, distances en kilomètres, durées en minutes. Exemple dans `public/example-activities.json`. Les identifiants dédupliquent les réimports. Une activité le même jour marque la séance réalisée ; l’utilisateur doit vérifier cette association.
- Volume de base : moyenne sur 28 jours si au moins quatre activités, plafonnée au volume déclaré. Sinon volume déclaré. Les semaines sans activités comptent dans la moyenne.
- Intention « finir » : 90 % du volume ; « progresser » et « chrono » : volume de référence. Le chrono est indicatif et ne force pas l’allure.
- Progression de 5 % par semaine, limitée à huit incréments, réduction de 20 % chaque quatrième semaine, puis 75 %/50 % dans les deux dernières semaines. Ce sont des heuristiques produit explicites, pas un modèle physiologique validé.
- Une séance passée encore prévue devient manquée. Chaque séance manquée dans les 14 derniers jours retire 12 % de volume (plancher 60 %) et supprime les séances soutenues. Pas de rattrapage.
- Les sorties récentes ajustent les durées par leur allure moyenne ; en terrain vallonné cette estimation reste grossière. Pas d’analyse FC, fatigue, sommeil ni prédiction de performance en V1.
- Les séances passées et les statuts explicites sont conservés. L’affichage recalcule à l’ouverture ; la tâche Vercel quotidienne persiste les mises à jour sans ouvrir l’app. Un import ou une modification recalcule aussi le plan.
- Les disponibilités sont des jours fixes selon le nombre de sorties. Ni choix fin des jours, ni gestion des blessures en V1. Pour une course proche ou un ultra, l’interface signale les limites.

## Import Strava

Créer une application sur https://www.strava.com/settings/api et renseigner son domaine de callback (sans chemin). Le retour OAuth est `https://votre-domaine/api/strava/callback`. Configurer `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `APP_URL` et `TOKEN_ENCRYPTION_KEY` (32 octets hexadécimaux). Ne jamais exposer les secrets au navigateur.

Pour une base existante, exécuter `supabase/migrations/20261018_strava.sql` ; pour une nouvelle base, utiliser `supabase/schema.sql`. Les anciennes connexions Garmin restent en base mais ne sont plus utilisées.

Dans Connexions : connecter Strava, accepter la lecture des activités privées, puis importer les sorties. L’import récupère les 90 derniers jours, uniquement Run/TrailRun/VirtualRun, convertit mètres/secondes en kilomètres/minutes et déduplique les identifiants. Les jetons chiffrés sont renouvelés avant expiration. Déconnecter supprime les jetons locaux ; la révocation complète se fait dans les paramètres Strava. Pas de tâche automatique ni de webhook dans cette version.

Pour les sorties Garmin, activer Garmin Connect → Strava. La synchronisation historique dépend de ces services. Aucun MCP nécessaire. Respecter les quotas, les conditions API et les exigences de marque Strava avant publication. Aucune donnée Strava n’est envoyée à OpenAI ; toute future utilisation IA doit faire l’objet d’une vérification des conditions applicables.

Recette réelle : connecter/refuser Strava, vérifier un retour falsifié ou expiré, importer deux fois sans doublons, tester le renouvellement après expiration et la déconnexion. Elle nécessite les clés réelles et n’est pas couverte par les tests unitaires.

## Sécurité et limites d’exploitation

L’API vérifie chaque JWT auprès de Supabase, utilise le rôle utilisateur avec RLS et n’accepte aucun identifiant utilisateur fourni dans le corps. Les tokens OAuth et le cron sont les seuls utilisateurs du rôle serveur. Le cron contrôle son secret et utilise une mise à jour conditionnée par updated_at pour éviter d’écraser une écriture concurrente.

Les données utilisateur sont validées par Zod ; import de 400 Ko et requête de 500 Ko maximum. Les jetons Supabase sont conservés par le SDK dans le navigateur : prévenir toute injection de scripts, ne pas ajouter de HTML brut. Le schéma n’inclut pas de clés publiques d’accès aux jetons Garmin. Ne pas journaliser les payloads santé ni les jetons.

Avant ouverture à d’autres personnes : vérifier la recette multi-compte, activer les protections Vercel contre les abus, ajouter politique de confidentialité, export/suppression de compte, supervision et sauvegardes. Les écritures utilisateur utilisent un document JSON par compte : deux onglets modifiant simultanément ce document peuvent se remplacer. Pas de granularité collaborative en V1. Le cron est prévu pour un usage personnel, traite jusqu’à 100 comptes par exécution ; au-delà, ajouter une file de tâches.

## Validation

```sh
pnpm typecheck
pnpm test
pnpm build
```

Tests automatisés : ancrage stable lors des recalculs quotidiens, calendrier, historique, baisse de volume après absence, adaptation au volume récent, affûtage, conservation des statuts, signature OAuth et rejet de cookie falsifié.

Recette avec secrets réels (à effectuer après configuration) :

- Compte A : générer une course, se reconnecter et retrouver la configuration.
- Compte B : aucun accès à l’état A via API ou requête Supabase directe.
- API sans token : 401. Entrées invalides : rejetées.
- Importer deux fois un fichier : aucune activité dupliquée.
- Passer une séance à manquée, recalculer, vérifier réduction et conservation du passé.
- Cron sans secret : 401 ; avec secret : mise à jour persistée.
- Strava : refus de consentement, callback expiré/falsifié, échange réussi et absence de jetons dans le navigateur.

## V2

Itinéraires selon distance, D+, terrain et point de départ, aperçu carte puis validation avant export GPX. Conserver la géolocalisation facultative. Aucune génération d’itinéraire en V1.
