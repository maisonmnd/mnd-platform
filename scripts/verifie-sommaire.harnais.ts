/* LE SOMMAIRE DES PARAMÈTRES, ÉPROUVÉ — `node scripts/verifie-sommaire.mjs`.

   « Il y a plus de grandes rubriques dans les Paramètres, j'ai rajouté des
   choses au fur et à mesure » (Yéman, 6 septembre 2026).

   C'EST LA DÉRIVE QUI SE RÉPARE ICI, PAS SON RÉSULTAT. Sept familles avaient
   été taillées pour quatorze cartes ; la page en portait vingt, et deux
   réglages n'apparaissaient plus nulle part dans le sommaire — on les
   découvrait en défilant, ou jamais. Un sommaire incomplet est pire qu'aucun :
   il fait croire qu'on a vu la page.

   RIEN N'EST IMPORTÉ ICI : on lit le fichier tel qu'il est écrit. Importer
   l'écran ferait entrer React et vingt magasins pour vérifier une table des
   matières, et le harnais casserait au premier réglage sans rapport. */
import { readFileSync } from 'node:fs';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

const src = readFileSync('src/apps/trone/routes/systeme/Parametres.tsx', 'utf8');

/* ── ① CE QUE DIT LE SOMMAIRE ──────────────────────────────────────── */
const bloc = src.slice(src.indexOf('const FAMILLES_SOMMAIRE = ['));
const table = bloc.slice(0, bloc.indexOf('];'));
const annoncees = [...table.matchAll(/\{\s*id:\s*'([^']+)',\s*l:\s*'([^']+)'\s*\}/g)]
  .map((m) => ({ id: m[1], l: m[2] }));

/* ── ② CE QUE PORTE LA PAGE ────────────────────────────────────────── */
const corps = src.slice(src.indexOf('export default function Parametres()'));
const posees = [...corps.matchAll(/<Intertitre id="([^"]+)">([^<]+)<\/Intertitre>/g)]
  .map((m) => ({ id: m[1], l: m[2] }));

dit('le sommaire n’est pas vide', true, annoncees.length >= 5);
/* UNE FAMILLE SANS ENTRÉE NE SE TROUVE QU'EN DÉFILANT, et une entrée sans
   famille renvoie dans le vide : le clic ne fait rien, et l'on croit l'écran
   cassé. Les deux se voient ici, jamais à l'usage. */
dit('chaque famille de la page est annoncée', [],
  posees.filter((f) => !annoncees.some((a) => a.id === f.id)).map((f) => f.id));
dit('chaque entrée du sommaire existe dans la page', [],
  annoncees.filter((a) => !posees.some((f) => f.id === a.id)).map((a) => a.id));
/* LE MÊME MOT DES DEUX CÔTÉS : un sommaire qui dit « Données » pour une
   famille intitulée « Les données » fait douter d'avoir cliqué au bon endroit. */
dit('le même libellé des deux côtés', [],
  annoncees.filter((a) => posees.find((f) => f.id === a.id)?.l !== a.l).map((a) => a.id));
/* L'ORDRE AUSSI : le sommaire est une carte, et une carte qui range autrement
   que le terrain se lit deux fois. */
dit('le sommaire suit l’ordre de la page',
  posees.map((f) => f.id), annoncees.map((a) => a.id));
dit('aucune famille en double', annoncees.length, new Set(annoncees.map((a) => a.id)).size);

/* ── ③ AUCUNE FAMILLE VIDE ─────────────────────────────────────────── */
const bornes = [...corps.matchAll(/<Intertitre id="([^"]+)">/g)].map((m) => ({ id: m[1], at: m.index! }));
const contenu = (k: number) => {
  const debut = bornes[k].at;
  const fin = k + 1 < bornes.length ? bornes[k + 1].at : corps.length;
  const tranche = corps.slice(debut, fin);
  /* Une carte écrite sur place, ou un composant appelé — les deux comptent :
     la moitié des réglages de cette page vivent dans leur propre fonction. */
  return (tranche.match(/sys-section__title/g) ?? []).length
    + (tranche.match(/\n\s+<[A-Z][A-Za-z]+(?:\s[^>]*)?\/>/g) ?? []).length;
};
dit('aucune famille vide', [], bornes.filter((_, k) => contenu(k) === 0).map((b) => b.id));

/* ── ④ CE QUI DÉTRUIT RESTE À LA FIN ───────────────────────────────
   On ne croise pas « réinitialiser toute la Maison » en cherchant un horaire.
   Cette règle a tenu depuis le 13 août parce qu'elle était écrite dans un
   commentaire ; elle tient mieux ici. */
const derniere = bornes[bornes.length - 1];
const queue = corps.slice(derniere.at);
for (const carte of ['ResetEncaissementsCard', 'ViderRdvCard', 'FactoryResetCard']) {
  dit(`${carte} est dans la dernière famille`, true, queue.includes(`<${carte} />`));
}
/* ET LA DERNIÈRE FAMILLE NE PORTE QUE ÇA : y ranger une sauvegarde ferait
   revenir tout le monde dans la zone dangereuse pour un geste ordinaire. */
dit('la dernière famille ne porte rien d’ordinaire', false,
  queue.includes('<SauvegardeCard />') || queue.includes('<CalibresCard />'));

/* ── ⑤ CHAQUE RÉGLAGE EST SOUS UNE FAMILLE ─────────────────────────
   Une carte posée avant le premier intertitre n'appartient à rien, et le
   sommaire ne la ramène jamais. */
const avant = corps.slice(0, bornes[0].at);
dit('aucun réglage avant la première famille', 0, (avant.match(/sys-section__title/g) ?? []).length);

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} ÉCHEC(S).`);
process.exit(ko === 0 ? 0 : 1);
