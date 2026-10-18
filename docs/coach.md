# Adaptation OpenAI et carnet privé Supabase

Cette fonctionnalité est facultative. Le programme local et l’import Strava continuent de fonctionner sans OpenAI ni Supabase. Le backend utilise l’API OpenAI, pas l’abonnement ChatGPT.

## Configuration

1. Créer ou réutiliser un projet Supabase. Dans SQL Editor, exécuter **uniquement** `supabase/migrations/20261018_coach.sql` pour cette fonctionnalité. La migration est autonome, additive et réexécutable ; les anciennes tables ne sont pas supprimées.
2. Définir côté serveur (dans `.env.local` pour le développement, dans Vercel pour la production) :

| Variable | Rôle |
| --- | --- |
| `APP_URL` | Origine exacte de l’application, par exemple `https://mon-app.vercel.app` |
| `SUPABASE_URL` | URL HTTPS du projet Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé serveur Supabase, jamais une clé publique |
| `OPENAI_API_KEY` | Clé du projet API OpenAI avec facturation disponible |
| `OPENAI_COACH_MODEL` | Modèle compatible Responses et Structured Outputs ; défaut `gpt-4.1-mini` |
| `EOTRAINER_ACCESS_KEY` | Clé privée forte donnant accès au carnet personnel ; au moins 32 caractères |
| `TOKEN_ENCRYPTION_KEY` | 32 octets hexadécimaux pour les cookies signés et les jetons Strava |

Générer **séparément** les deux dernières clés avec `openssl rand -hex 32`. Si `TOKEN_ENCRYPTION_KEY` est déjà configurée pour Strava, la conserver. Ne pas committer les valeurs ni les partager dans le chat. Ne jamais préfixer les secrets par `NEXT_PUBLIC_`. Redéployer après modification de la configuration. Si le réseau de l’environnement est restreint, autoriser `api.openai.com` et le domaine exact du projet Supabase.

3. Dans « Adapter mes prochaines séances », ouvrir le carnet privé et saisir `EOTRAINER_ACCESS_KEY`. La clé n’est pas enregistrée en stockage local ; un cookie HttpOnly, Secure en production, SameSite Strict garde l’accès pendant sept jours. La rotation de la clé privée invalide les anciennes sessions.

Il s’agit d’une installation **personnelle** : tous les appareils possédant la clé accèdent au même carnet `personal`. Ce n’est pas un service multi-utilisateur et il ne faut pas distribuer la clé à des tiers. Aucun compte utilisateur n’est créé.

## Utilisation

- **Sauvegarder ce carnet** : envoie explicitement la course, les activités et les séances locales vers Supabase.
- **Charger la sauvegarde serveur** : remplace la copie locale par la dernière sauvegarde chargée depuis le serveur. Vérifier la sauvegarde permet de l’actualiser avant de choisir.
- **Proposer une adaptation avec OpenAI** : sauvegarde d’abord le carnet local, réserve un appel dans le quota, puis propose les séances des 14 prochains jours. Aucune séance n’est remplacée à cette étape.
- **Appliquer ce programme** : après lecture de la proposition, sauvegarde le nouveau programme en une transaction et actualise l’affichage local. Le serveur utilise sa proposition enregistrée, pas des séances renvoyées par le navigateur.
- **Garder mon programme actuel** : ferme la proposition sans modifier le programme. La sauvegarde initiale du carnet reste disponible.

Les données locales ne sont pas synchronisées automatiquement. Aucun cron ni import quotidien n’est ajouté. Si deux appareils sauvegardent simultanément, une révision obsolète est refusée ; vérifier et charger la sauvegarde avant de réessayer. Une proposition ne peut être appliquée qu’une fois, à sa révision d’origine et le jour UTC de sa création.

## Ce qui est envoyé à OpenAI

L’objectif numérique (distance, date, D+, terrain, volume déclaré, fréquence et intention), les totaux des activités admissibles sur 28 jours et le programme de référence des prochains jours. Ni noms d’activités/course, ni identifiants d’activités, ni notes libres, ni jetons ne sont envoyés. `store: false` est demandé à l’API ; cela ne remplace pas la vérification des conditions de traitement des données du fournisseur.

Les imports identifiés par un identifiant `strava:` sont **exclus**, y compris du calcul du programme de référence transmis au modèle. Les autres activités importées doivent être des données dont l’usage avec cette API est autorisé. Un JSON d’origine inconnue ne peut pas être identifié automatiquement : ne pas renommer les identifiants Strava pour contourner cette exclusion. En l’absence d’historique admissible, le volume déclaré sert de référence. Avant toute prise en compte des données Strava par l’IA, vérifier les conditions Strava applicables ; cette PR ne l’active pas.

## Contrôles et limites

La réponse JSON est validée côté serveur. Les dates du programme de référence sont fixes ; aucune séance supplémentaire n’est autorisée. La distance doit rester entre 50 % et 100 % de la référence, la durée entre 50 % et 125 %, le dénivelé ne peut pas augmenter et l’allure ne peut pas être accélérée. Un type de séance peut être conservé ou réduit à une endurance facile. Les notes générées restent à vérifier par l’utilisateur ; ce contrôle n’est pas une validation médicale ni physiologique.

L’historique, les séances réalisées/manquées et les séances existantes hors de la fenêtre sont conservés. Un programme approuvé ne sera pas écrasé par un rechargement, un import ou un changement de statut. « Enregistrer et adapter le programme » dans l’éditeur de course réactive explicitement le calcul déterministe ; une nouvelle adaptation IA passe à nouveau par la prévisualisation.

Le quota partagé est d’une génération par minute et dix par jour UTC, y compris les appels échoués après réservation. Définir aussi un budget/alertes dans le projet OpenAI ; ces quotas applicatifs ne sont pas un plafond de facturation garanti.

## Stockage

- `coach_notebooks` : instantané du carnet et numéro de révision.
- `coach_activities` : activités importées, consultables en lignes.
- `training_sessions` : séances et statuts, mis à jour transactionnellement avec l’instantané.
- `coach_plan_versions` : propositions, explication, état appliqué ou en attente et ancien carnet lors d’une application. Les versions sont conservées pour audit ; pas de bouton de restauration d’une ancienne version dans cette PR.

Les quatre tables ont RLS activé sans accès `anon`/`authenticated`. Les fonctions d’écriture ne sont exécutables que par `service_role`. Les routes imposent le cookie privé et contrôlent l’origine des écritures ; le modèle ne reçoit ni accès base, ni SQL libre. L’effacement du navigateur ne supprime pas la sauvegarde serveur. La rétention/suppression des données et versions reste sous le contrôle du propriétaire du projet Supabase.

## Vérification

`pnpm test`, `pnpm typecheck`, `pnpm build`.

Les tests PostgreSQL embarqués PGlite exécutent la vraie migration, les transactions, les limites, les conflits et les droits SQL. Les réponses OpenAI sont simulées dans les tests. Une recette avec vrais services reste nécessaire après configuration : sauvegarde/restauration sur deux appareils, génération réelle, lecture puis application, affichage des lignes `training_sessions` et refus d’une proposition obsolète. Aucune clé réelle n’est requise pour les tests automatisés.
