/* LA CARTE DE LIEN, ÉPROUVÉE — `node scripts/verifie-carte-lien.mjs`.

   « Quand j'envoie le lien de MND, ça doit se présenter comme celui de
   Claude » (Yéman, 7 septembre 2026) : la carte compacte, vignette à gauche.
   WhatsApp ne la fait que si l'image est PETITE (sous ~300 px) : une vignette
   regénérée trop grande ramènerait la grande affiche blanche sans qu'aucun
   écran ne le dise — ça ne se voit que sur le téléphone d'une cliente. */
import { readFileSync, readdirSync } from 'node:fs';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

/* ── ① LA VIGNETTE EST PETITE, ET C'EST UN CHOIX ─────────────────────
   Une par marque : celle de la Maison, et depuis le 7 octobre 2026 celle de
   l'Académie MND (sa tuile verte). Les mêmes règles pour chacune. */
const CARTES = ['carte-lien.png', 'academie.png'];
for (const c of CARTES) {
  const png = readFileSync(`public/assets/og/${c}`);
  dit(`${c} : c’est bien un PNG`, true, png.subarray(1, 4).toString() === 'PNG');
  const largeur = png.readUInt32BE(16);
  const hauteur = png.readUInt32BE(20);
  dit(`${c} : la vignette reste sous 300 px`, true, largeur < 300 && hauteur < 300);
  dit(`${c} : … et carrée`, true, largeur === hauteur);
  dit(`${c} : … et légère, elle voyage sur un téléphone`, true, png.length < 30_000);
}

/* ── ② CHAQUE ENTRÉE PORTE SA CARTE ────────────────────────────────
   Une entrée ajoutée sans balises partagerait un lien nu : titre d'onglet,
   pas de phrase, pas de vignette. */
const entrees = readdirSync('.').filter((f) => f.endsWith('.html'));
dit('les neuf entrées sont là', true, entrees.length >= 9);
for (const f of entrees) {
  const h = readFileSync(f, 'utf8');
  dit(`${f} porte sa carte`, true,
    h.includes('og:title') && h.includes('og:description')
    && CARTES.some((c) => h.includes(`__LIEN_DU_SITE__assets/og/${c}`))
    && h.includes('__LIEN_DE_LA_PAGE__')
    && h.includes('"twitter:card" content="summary"'));
  /* AUCUN DOMAINE EN DUR : c'est le composeur qui pose l'adresse, depuis
     l'origine du dépôt. Un domaine écrit ici survivrait à un changement de
     compte GitHub — en pointant sur l'ancien. */
  dit(`… et ${f} n’écrit aucun domaine en dur`, false, /github\.io/.test(h));
}

/* ── ③ LE COMPOSEUR SAIT REMPLACER ─────────────────────────────────── */
const compose = readFileSync('scripts/build-sites.mjs', 'utf8');
dit('le composeur remplace les deux repères', true,
  compose.includes('__LIEN_DE_LA_PAGE__') && compose.includes('__LIEN_DU_SITE__'));
dit('… et lit le compte depuis le dépôt, jamais en dur', true,
  compose.includes('git remote get-url origin'));

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} ÉCHEC(S).`);
process.exit(ko === 0 ? 0 : 1);
