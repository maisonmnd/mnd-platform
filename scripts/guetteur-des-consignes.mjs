#!/usr/bin/env node
/* LE GUETTEUR DES CONSIGNES, 5 novembre 2026 (« Une consigne aux assistants », lot 1).

   La direction écrit une consigne à un assistant dans le Trône (Direction ›
   Les assistants). Sur le PC de l'assistant, ce guetteur regarde toutes les
   60 secondes, avec les réglages de la ligne de commande (reglages.json :
   l'assistant, l'adresse du Trône, le jeton d'appareil), et écrit UNE ligne
   courte par consigne nouvelle, puis continue :

     consigne <id> pour <assistant> : <début du texte>

   C'est tout ce qu'il écrit sur la sortie standard : l'outil Monitor de la
   session de l'assistant (Opale, Onyx) s'en sert comme d'un réveil. Il ne
   marque rien (`consigne.lire` avec `marquer: false`) : c'est la session,
   réveillée, qui lit la consigne (`consigne lire`), la marque « lue », fait
   et répond. Chaque consigne n'est dite qu'une fois par guetteur lancé (une
   consigne passée de nouveau à cet assistant se redit).

   LE JETON N'APPARAÎT JAMAIS. Les pannes (réseau, refus) s'écrivent sur la
   sortie d'erreur, une seule fois tant qu'elles durent, sans rien du jeton.

   Usage :
     node scripts/guetteur-des-consignes.mjs [--reglages <chemin>] [--intervalle <secondes>]
   Réglages : --reglages <chemin>, sinon ./reglages.json, sinon <dossier personnel>/Opale/reglages.json
   (comme scripts/assistants-maison.mjs). --intervalle : 60 par défaut.
   --tours <n> : s'arrête après n regards (le banc s'en sert). --aide : cette aide.

   Node 18 ou plus récent, aucune dépendance. */

import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const EN_TETE_DU_JETON_ASSISTANT = 'x-jeton-assistant'; // RECOPIÉ de assistants-pur.ts
const NOM_DE_LA_FONCTION = 'assistants-maison';
const JETON_MASQUE = '<jeton masqué>';
const DELAI_MS = 30_000;

let jetonLu = '';
const masque = (t) => { const s = String(t ?? ''); return jetonLu && s.includes(jetonLu) ? s.split(jetonLu).join(JETON_MASQUE) : s; };
const sortie = (ligne) => process.stdout.write(`${masque(ligne)}\n`);
const souci = (ligne) => process.stderr.write(`${masque(ligne)}\n`);

/* RECOPIÉ de consignes-pur.ts (debutDuTexte, ligneDuGuetteur) : le banc compare les deux lignes. */
const debutDuTexte = (t, auPlus = 60) => {
  const x = String(t ?? '').replace(/\s+/g, ' ').trim();
  return x.length > auPlus ? `${x.slice(0, auPlus - 1).trimEnd()}…` : x;
};
const ligneDuGuetteur = (c) => `consigne ${c.id} pour ${c.pour} : ${debutDuTexte(c.texte)}`;

const AIDE = `guetteur-des-consignes.mjs : une ligne par consigne nouvelle de la direction pour cet assistant.

Usage : node scripts/guetteur-des-consignes.mjs [--reglages <chemin>] [--intervalle <secondes>] [--tours <n>]
Réglages : --reglages <chemin>, sinon ./reglages.json, sinon <dossier personnel>/Opale/reglages.json
Sortie : « consigne <id> pour <assistant> : <début du texte> », une fois par consigne, rien d'autre.
Les pannes vont sur la sortie d'erreur. Le jeton ne s'affiche jamais.
`;

function litLesArguments(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const nom = a.slice(2);
    if (nom === 'aide') { o.aide = true; continue; }
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) { o[nom] = true; continue; }
    o[nom] = v; i += 1;
  }
  return o;
}

function litLesReglages(o) {
  const chemin = typeof o.reglages === 'string' ? path.resolve(o.reglages)
    : existsSync(path.resolve('reglages.json')) ? path.resolve('reglages.json') : path.join(os.homedir(), 'Opale', 'reglages.json');
  if (!existsSync(chemin)) throw new Error(`aucun reglages.json : ${chemin}`);
  let lu;
  try { lu = JSON.parse(readFileSync(chemin, 'utf8')); } catch { throw new Error(`reglages.json illisible : ${chemin}`); }
  const manque = ['assistant', 'url', 'jeton'].filter((k) => typeof lu?.[k] !== 'string' || !lu[k].trim());
  if (manque.length) throw new Error(`il manque ${manque.join(', ')} dans ${chemin}`);
  jetonLu = lu.jeton.trim();
  return { assistant: lu.assistant.trim(), url: lu.url.trim(), jeton: jetonLu };
}

function adresseDeLaFonction(url) {
  const u = String(url).trim().replace(/\/+$/, '');
  if (!/^https?:\/\//.test(u)) throw new Error('url des réglages : il faut une adresse https');
  if (u.endsWith(`/functions/v1/${NOM_DE_LA_FONCTION}`)) return u;
  if (u.endsWith('/functions/v1')) return `${u}/${NOM_DE_LA_FONCTION}`;
  return `${u}/functions/v1/${NOM_DE_LA_FONCTION}`;
}

/* Un regard : les consignes à lui, sans rien marquer. */
async function regarde(adresse, jeton) {
  const arret = new AbortController();
  const minuterie = setTimeout(() => arret.abort(), DELAI_MS);
  try {
    const r = await fetch(adresse, {
      method: 'POST', signal: arret.signal,
      headers: { 'content-type': 'application/json', [EN_TETE_DU_JETON_ASSISTANT]: jeton },
      body: JSON.stringify({ action: 'consigne.lire', marquer: false }),
    });
    const corps = await r.json().catch(() => null);
    if (!corps || corps.ok !== true) return { ok: false, motif: corps?.motif ?? `statut ${r.status}` };
    return { ok: true, consignes: Array.isArray(corps.consignes) ? corps.consignes : [], pour: corps.assistant?.id ?? '' };
  } catch (e) {
    return { ok: false, motif: e?.name === 'AbortError' ? 'delai-depasse' : 'reseau' };
  } finally {
    clearTimeout(minuterie);
  }
}

async function principal() {
  const o = litLesArguments(process.argv.slice(2));
  if (o.aide) { process.stdout.write(AIDE); return 0; }
  let reglages;
  try { reglages = litLesReglages(o); } catch (e) { souci(`guetteur : ${e.message}`); return 1; }
  let adresse;
  try { adresse = adresseDeLaFonction(reglages.url); } catch (e) { souci(`guetteur : ${e.message}`); return 1; }
  const intervalle = Math.max(1, Number(o.intervalle) || 60) * 1000;
  const tours = Number.isFinite(Number(o.tours)) && Number(o.tours) > 0 ? Math.floor(Number(o.tours)) : Infinity;
  const vues = new Set();
  let enPanne = '';
  for (let n = 0; n < tours; n++) {
    const r = await regarde(adresse, reglages.jeton);
    if (!r.ok) {
      if (enPanne !== r.motif) souci(`guetteur : la fonction ne répond pas (${r.motif}), je réessaie toutes les ${Math.round(intervalle / 1000)} s`);
      enPanne = r.motif;
    } else {
      if (enPanne) souci('guetteur : de nouveau en ligne');
      enPanne = '';
      for (const c of r.consignes) {
        if (!c || c.nouvelle !== true || typeof c.id !== 'string') continue;
        /* Une consigne repassée à cet assistant se redit : la clé porte l'heure du passage. */
        const cle = `${c.id}|${c.passeeLe ?? c.ecriteLe ?? ''}`;
        if (vues.has(cle)) continue;
        vues.add(cle);
        sortie(ligneDuGuetteur({ id: c.id, pour: r.pour || reglages.assistant, texte: c.texte }));
      }
    }
    if (n + 1 < tours) await new Promise((fin) => setTimeout(fin, intervalle));
  }
  return 0;
}

/* Sortie naturelle (voir assistants-maison.mjs) : process.exit() fait tomber Node sous Windows. */
process.exitCode = await principal();
