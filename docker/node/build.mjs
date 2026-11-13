// Build des assets du thème (remplace CodeKit).
//   yarn build  : compile tout une fois
//   yarn dev    : compile tout, puis surveille les fichiers (watch)
//
// - SCSS → CSS compressé + autoprefixer (browserslist dans package.json)
// - JS   → x.min.js à côté de x.js (terser)

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as sass from 'sass';
import postcss from 'postcss';
import autoprefixer from 'autoprefixer';
import { minify } from 'terser';

// Dossier du thème à compiler (monté dans le conteneur, voir docker-compose.yml)
if (!process.env.THEME_DIR) {
	console.error('Variable THEME_DIR manquante : lancer le build depuis le conteneur (docker compose exec node yarn build).');
	process.exit(1);
}
const root = path.resolve(process.env.THEME_DIR);
const watch = process.argv.includes('--watch');

// Fichiers SCSS racines (les partials _*.scss sont importés par ceux-ci), sortie dans le même dossier en .css
const scssEntries = [
	'style.scss',
	'assets/css/admin.scss',
	'assets/css/editor-style.scss',
	'assets/css/mediaelementplayer.scss',
	'assets/css/program-grid.scss',
	'assets/css/sharing.scss',
	'assets/css/wp-mediaelement.scss',
	'inc/rca-events-grid/assets/css/admin-grid.scss',
];

// Fichiers JS à minifier, sortie x.min.js à côté de x.js
const jsEntries = [
	'assets/js/admin-media-upload.js',
	'assets/js/admin-powerpress-addons.js',
	'assets/js/admin.js',
	'assets/js/ajaxify.js',
	'assets/js/customize-preview.js',
	'assets/js/global.js',
	'assets/js/infinity.js',
	'assets/js/mediaelement.js',
	'assets/js/navigation.js',
	'assets/js/program-grid.js',
	'assets/js/sharing.js',
	'inc/rca-events-grid/assets/js/admin-grid.js',
	'inc/smn-shortcodes/smn-shortcodes-buttons.js',
];

// Sass (mode compressed) remplace les échappements CSS ("\f154") par le caractère brut.
// Sans @charset ni BOM, on préfère garder le CSS en ASCII dans les déclarations
// (les commentaires, comme l'en-tête du thème, restent en UTF-8).
const escapeNonAscii = {
	postcssPlugin: 'escape-non-ascii',
	Declaration(decl) {
		if (!/[^\x00-\x7f]/.test(decl.value)) return;
		decl.value = decl.value.replace(/\P{ASCII}(?=([0-9a-fA-F\s])?)/gu, (char, next) => {
			return `\\${char.codePointAt(0).toString(16)}${next ? ' ' : ''}`;
		});
	},
};

const prefixer = postcss([autoprefixer, escapeNonAscii]);

async function buildScss(entry) {
	const input = path.join(root, entry);
	const output = input.replace(/\.scss$/, '.css');
	const { css } = sass.compile(input, {
		style: 'compressed',
		charset: false,
		sourceMap: false,
		quietDeps: true,
		// _content.scss est inclus à la racine d'editor-style.scss avec des sélecteurs "> h2:first-child".
		// Le CSS généré est inchangé depuis CodeKit ; à corriger séparément si besoin.
		silenceDeprecations: ['bogus-combinators'],
	});
	const result = await prefixer.process(css, { from: undefined });
	await writeFile(output, result.css);
	log('css', entry);
}

async function buildJs(entry) {
	const input = path.join(root, entry);
	const output = input.replace(/\.js$/, '.min.js');
	const code = await readFile(input, 'utf8');
	const result = await minify(code, {
		ecma: 5,
		compress: { passes: 1 },
		mangle: { reserved: ['$'] },
	});
	await writeFile(output, result.code);
	log('js ', entry);
}

function log(type, entry) {
	console.log(`[${new Date().toLocaleTimeString('fr-FR')}] ${type} ${entry}`);
}

// Un build qui échoue ne doit pas arrêter le watch ; en mode build il fait échouer la commande.
async function safely(fn, label) {
	try {
		await fn();
		return true;
	} catch (error) {
		console.error(`\n✖ ${label}\n${error.message ?? error}\n`);
		return false;
	}
}

async function buildAllScss() {
	const results = await Promise.all(scssEntries.map((e) => safely(() => buildScss(e), e)));
	return results.every(Boolean);
}

async function buildAllJs() {
	const results = await Promise.all(jsEntries.map((e) => safely(() => buildJs(e), e)));
	return results.every(Boolean);
}

const ok = (await Promise.all([buildAllScss(), buildAllJs()])).every(Boolean);

if (!watch) {
	process.exit(ok ? 0 : 1);
}

const { default: chokidar } = await import('chokidar');

console.log('\nSurveillance des fichiers… (Ctrl+C pour arrêter)\n');

// Debounce : une sauvegarde peut émettre plusieurs évènements
let scssTimer;
const pendingJs = new Set();
let jsTimer;

chokidar
	.watch(root, {
		ignored: (p) => /(^|[\\/])(node_modules|vendor|\.git)([\\/]|$)/.test(p),
		ignoreInitial: true,
		usePolling: Boolean(process.env.WATCH_POLLING),
	})
	.on('all', (event, absolute) => {
		if (!['add', 'change'].includes(event)) return;
		const file = path.relative(root, absolute);
		if (file.endsWith('.scss')) {
			clearTimeout(scssTimer);
			scssTimer = setTimeout(buildAllScss, 100);
		} else if (jsEntries.includes(file.split(path.sep).join('/'))) {
			pendingJs.add(file);
			clearTimeout(jsTimer);
			jsTimer = setTimeout(() => {
				const files = [...pendingJs];
				pendingJs.clear();
				files.forEach((f) => safely(() => buildJs(f), f));
			}, 100);
		}
	});
