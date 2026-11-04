import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LA CARTE DU PROCHAIN RITUEL, EPROUVEE - 4 novembre 2026 (sur le modele de verifie-la-voix-du-numero).
   `node scripts/verifie-la-carte-du-prochain-rituel.mjs` : le banc, dans un
   processus fils (le paquet s'ecrit sous node_modules/.cache et s'efface).
   `--prouve` : chaque faute est remise une a une dans le vrai fichier (copie
   gardee, restauration dans un finally, empreintes comparees), et le banc
   doit crier a chacune. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

async function lanceLeBanc() {
  const dossier = path.join(racine, 'node_modules', '.cache', 'verifie-la-carte-du-prochain-rituel');
  mkdirSync(dossier, { recursive: true });
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-la-carte-du-prochain-rituel.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error', external: ['esbuild'],
      loader: { '.css': 'empty' },
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
      banner: {
        js: `const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k) };
globalThis.window = { addEventListener() {}, dispatchEvent() {}, location: { href: '' } };
globalThis.document = { body: { dataset: {} }, addEventListener() {} };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };`,
      },
    });
    return spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8' });
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

const PUR = 'src/shared/carte-du-prochain-rituel-pur.ts';
const PANNES = [
  ['la date se pose d office', PUR, "return { depart: o.depart, place: o.depart, rdvId: null, dejaLa: false, valide: false,", "return { depart: o.depart, place: o.depart, rdvId: null, dejaLa: false, valide: true,"],
  ['la confirmation part a chaque deplacement', PUR, "return { etat: { ...e, place: g.place, modif: false }, effets: [{ genre: 'deplacer', rdvId: e.rdvId, place: g.place }] };", "return { etat: { ...e, place: g.place, modif: false }, effets: [{ genre: 'deplacer', rdvId: e.rdvId, place: g.place }, { genre: 'confirmer', rdvId: e.rdvId }] };"],
  ['un second rendez-vous se pose au deplacement', PUR, "if (memePlace(e.place, g.place) || !e.rdvId) return { etat: { ...e, modif: false }, effets: [] };", "if (memePlace(e.place, g.place) || !e.rdvId) return { etat: { ...e, modif: false }, effets: [] };\n      return { etat: { ...e, place: g.place, modif: false, rdvId: g.id }, effets: [{ genre: 'poser', id: g.id, place: g.place }] };"],
  ['terminer sans valider ferme sans demander', PUR, "if (!e.valide && e.place && !e.retire) return { etat: { ...e, pied: 'demande-fin' }, effets: [] };", ""],
  ['le rendez-vous deja la se reconfirme', PUR, "const effets: EffetDeLaCarte[] = e.dejaLa ? [{ genre: 'fermer' }] : [", "const effets: EffetDeLaCarte[] = false ? [{ genre: 'fermer' }] : ["],
  ['le rendez-vous deja la se retire d ici', PUR, "if (e.dejaLa || e.retire) return rien;", "if (e.retire) return rien;"],
  ['le rendez-vous deja la se deplace d ici', PUR, "if (e.dejaLa && e.rdvId) return { etat: e, effets: [{ genre: 'ouvrir', rdvId: e.rdvId, place: g.place }] };", ""],
  ['retirer sans confirmation', PUR, "return { etat: { ...e, pied: 'demande-retrait' }, effets: [] };", "return { etat: { ...e, retire: true, valide: false, rdvId: null, pied: 'rien' }, effets: [{ genre: 'retirer', rdvId: e.rdvId ?? '' }] };"],
  ['un retire se confirme quand meme', PUR, "if (e.valide && e.rdvId && !e.retire) {", "if (e.rdvId || e.retire) {"],
  ['la carte termine accepte encore des gestes', PUR, "if (e.pied === 'termine') return rien;", ""],
  ['la date d office oublie son jour habituel', PUR, "return places.find((p) => p.cle === 'jour') ?? places.find((p) => p.cle === 'date') ?? places[0] ?? null;", "return places.find((p) => p.cle === 'date') ?? places[0] ?? null;"],
  ['l heure prise ne se dit pas', PUR, "if (o.heureHabituelle && o.place.heure !== o.heureHabituelle) {", "if (false) {"],
  ['la pastille ne dit pas le changement', PUR, "if (!e.dejaLa && e.depart && !memePlace(e.place, e.depart)) return { texte: 'Confirmé · changé', ton: 'change' };", ""],
  ['revenir ne deplace pas le rendez-vous pose', PUR, "if (e.valide && e.rdvId) return { etat: { ...e, place: e.depart, modif: false }, effets: [{ genre: 'deplacer', rdvId: e.rdvId, place: e.depart }] };", ""],
  ['une autre date garde les jours fermes', PUR, "if (!p.ferme && p.heures.length > 0) jours.push(iso);", "jours.push(iso);"],
];

const md5 = (f) => createHash('md5').update(readFileSync(path.join(racine, f))).digest('hex');

if (!prouve) {
  const r = await lanceLeBanc();
  process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
  process.exitCode = r.status ?? 1;
} else {
  const propre = await lanceLeBanc();
  if (propre.status !== 0) { console.log('Le banc ne passe pas sur le code propre :'); console.log(propre.stdout); console.log(propre.stderr); process.exit(1); }
  const fichiers = [...new Set(PANNES.map((p) => p[1]))];
  const avant = Object.fromEntries(fichiers.map((f) => [f, md5(f)]));
  const gardes = Object.fromEntries(fichiers.map((f) => [f, readFileSync(path.join(racine, f))]));
  let muettes = 0;
  try {
    for (const [nom, fichier, a, b] of PANNES) {
      const brut = gardes[fichier].toString('utf8');
      const crlf = brut.includes('\r\n');
      const texte = brut.replace(/\r\n/g, '\n');
      if (!texte.includes(a)) { console.log(`INTROUVABLE ${nom}`); muettes++; continue; }
      const casse = texte.replace(a, b);
      writeFileSync(path.join(racine, fichier), crlf ? casse.replace(/\n/g, '\r\n') : casse);
      try {
        const r = await lanceLeBanc();
        if (r.status === 0) { console.log(`MUETTE ${nom}`); muettes++; } else console.log(`CRIE  ${nom}`);
      } finally {
        writeFileSync(path.join(racine, fichier), gardes[fichier]);
      }
    }
  } finally {
    for (const f of fichiers) writeFileSync(path.join(racine, f), gardes[f]);
  }
  const intacts = fichiers.every((f) => md5(f) === avant[f]);
  console.log(intacts ? 'Fichiers rendus a l identique.' : 'ATTENTION : un fichier n est pas revenu a l identique.');
  console.log(muettes === 0 && intacts ? `\nLa preuve tient : ${PANNES.length} fautes, le banc crie a chacune.` : `\n${muettes} faute(s) sans cri.`);
  process.exitCode = muettes === 0 && intacts ? 0 : 1;
}
