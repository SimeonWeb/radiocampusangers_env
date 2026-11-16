# Radio Campus Angers

WordPress en local avec Docker : Apache + PHP 8.4 (`web`) et MySQL 8.0 (`db`), comme sur l'hébergement OVH.

## Prérequis

Ajouter le projet WordPress dans le dossier `wordpress/`.

Le `wordpress/wp-config.php` local construit `WP_HOME` / `WP_SITEURL` à partir de l'hôte appelé
(`$_SERVER['HTTP_HOST']`) : c'est une config de développement, à ne pas déployer sur l'hébergement.

## Démarrage

```bash
docker compose up -d --build
```

Site : **http://localhost:3000** (avec hot reload, voir plus bas) ou http://localhost (Apache direct, sans hot reload).

## Assets du thème (SCSS, JS)

Le service `node` (Node 24 + yarn) remplace CodeKit. Il démarre avec `docker compose up -d`, installe les
dépendances puis surveille le thème `campus_v6` : à chaque sauvegarde,

- les `.scss` sont compilés en `.css` (compressé, autoprefixer) à côté de la source ;
- les `.js` sont minifiés en `.min.js` à côté de la source.

Rien à lancer à la main. Pour tout recompiler d'un coup (avant un déploiement par exemple) :

```bash
docker compose exec node yarn build
```

Logs du watch : `docker compose logs -f node`.

### Hot reload

Naviguer sur **http://localhost:3000** (proxy BrowserSync devant le site) :

- CSS régénéré : injection à chaud, sans rechargement de la page ;
- JS ou PHP du thème modifié : rechargement de la page.

### Où est la configuration

Tout l'outillage est dans `docker/node/` (`build.mjs`, `package.json`, `yarn.lock`) : le thème ne contient
que les sources et les fichiers générés. La liste des fichiers compilés est dans `build.mjs` ;
les navigateurs ciblés sont définis par `browserslist` dans `package.json`.
Pour ajouter un fichier SCSS ou JS à compiler, l'ajouter aux listes `scssEntries` / `jsEntries`.

## Importer le dump de la base

Placer le dump à la racine du projet (`murmuredumrcabdd_mysql_db.sql`), puis :

```bash
docker compose exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD"' < murmuredumrcabdd_mysql_db.sql
```

Le dump crée et utilise la base `murmuredumrcabdd`. L'import prend quelques minutes (~370 Mo).

Pour repartir d'une base vide : `docker compose down -v`, puis `docker compose up -d` et réimporter.

## Accès à la base

- Depuis l'hôte : `127.0.0.1:3307`
- Identifiants : voir `.env`
