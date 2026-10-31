#!/usr/bin/env node
/* LA LIGNE DE COMMANDE D'UN ASSISTANT RELIÉ, 31 octobre 2026.

   Opale (chez Yéman) et Onyx (chez Brice) sont des sessions de Claude Code qui
   lisent un WhatsApp Web et parlent au Trône par UNE porte : la fonction Edge
   `assistants-maison`. Ce script est cette porte, vue de l'ordinateur de
   l'assistant : il lit `reglages.json` (l'identité et le jeton d'appareil),
   fabrique la requête, l'envoie avec l'en-tête `x-jeton-assistant`, et rend le
   JSON de la fonction sur la sortie standard. Code de sortie 0 si `ok`, 1 sinon.

   LE JETON N'APPARAÎT JAMAIS : ni en sortie, ni en erreur, ni dans l'aide, ni
   en `--essai`. Tout ce qui s'écrit passe par `masque()`, qui le remplace par
   « <jeton masqué> » s'il s'y glissait. Le contrat (types, genres, actions) est
   `src/shared/assistants-pur.ts` : les listes recopiées ici le disent en
   commentaire ; la fonction reste seule juge.

   Node 18 ou plus récent, aucune dépendance. `--aide` pour l'usage. */

import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const EN_TETE_DU_JETON_ASSISTANT = 'x-jeton-assistant'; // RECOPIÉ de assistants-pur.ts
const NOM_DE_LA_FONCTION = 'assistants-maison';
const JETON_MASQUE = '<jeton masqué>';
const DELAI_MS = 30_000;

// RECOPIÉ de assistants-pur.ts (GENRES_DE_RELAIS, GENRES_DE_DECISION) : la fonction vérifie à son tour.
const GENRES_DE_RELAIS = [
  'rdv-pose-pour-toi', 'rdv-deplace', 'rdv-annule',
  'place-tenue', 'place-confirmee', 'place-refusee',
  'fil-ouvert', 'hermine-a-prevenir', 'envie-lue', 'argent-a-trancher', 'assistant-endormi',
];
const GENRES_DE_DECISION = ['reponse', 'place-tenue', 'note', 'argent', 'cercle'];
const GENRES_DE_NOTIFICATION = [...GENRES_DE_RELAIS, 'decision', 'sommeil', 'empeche'];

/* ── Ce qui s'écrit : toujours masqué ─────────────────────────────────── */

let jetonLu = '';
const masque = (texte) => {
  const t = String(texte ?? '');
  return jetonLu && t.includes(jetonLu) ? t.split(jetonLu).join(JETON_MASQUE) : t;
};
const ecris = (objet) => process.stdout.write(masque(JSON.stringify(objet, null, 2)) + '\n');
const refus = (motif, detail) => { ecris({ ok: false, motif, ...(detail ? { detail } : {}) }); return 1; };

process.on('uncaughtException', (e) => { process.stdout.write(masque(JSON.stringify({ ok: false, motif: 'erreur', detail: e?.message ?? String(e) })) + '\n'); process.exit(1); });

/* ── L'aide ───────────────────────────────────────────────────────────── */

const AIDE = `assistants-maison.mjs : la ligne de commande d'un assistant relié (Opale, Onyx) vers la fonction ${NOM_DE_LA_FONCTION} du Trône.

Usage : node scripts/assistants-maison.mjs <sous-commande> [options]

Réglages : --reglages <chemin>, sinon ./reglages.json, sinon <dossier personnel>/Opale/reglages.json
  Forme : { "assistant": "opale", "nom": "Opale", "url": "https://<projet>.supabase.co", "jeton": "..." }
  (url : l'adresse du projet, ou celle de la fonction ; la fin /functions/v1/${NOM_DE_LA_FONCTION} se complète seule)
  Le jeton ne s'affiche jamais : ni en sortie, ni en erreur, ni ici.

Sous-commandes :
  sante                         GET de santé de la fonction (public, sans jeton)
  passage --chrome oui|non --lie oui|non --nonlus oui|non [--traites <n>] [--version <v>]
  relais deposer --pour <id d'assistant> --genre <genre> [--numero <n>] [--client <id>] [--rdv <id>] [--mot "..."] [--perime-dans <min>]
  relais traiter --id <id>
  decision deposer --genre <genre> --resume "..." [--proposition "..."] [--numero <n>] [--client <id>] [--rdv <id>] [--echeance <min>] [--notifier]
  decision executee --id <id>
  rdv poser --numero <n> --services <id,id> --date AAAA-MM-JJ --time HH:mm --pour <team id>
            [--client <id>] [--master <team id>] [--duree <min>] [--note "..."] [--tenue]
            [--idempotence <clé>] [--prevenir <numéro>] [--ajouter]
            (sans --idempotence : <assistant>:<numéro>:<date>T<heure> ; préférer l'heure du message lu)
  rdv deplacer --rdv <id> --date AAAA-MM-JJ --time HH:mm --updated-at <iso>
  rdv annuler --rdv <id> --updated-at <iso>
  note poser --rdv <id> --note "..."      (200 caractères au plus)
  notifier --pour moi|<id d'assistant> --genre <genre> [--heure "..."]

Options communes :
  --essai      affiche la requête qui partirait (jeton masqué), sans l'envoyer
  --aide       cette aide

Genres de relais   : ${GENRES_DE_RELAIS.join(', ')}
Genres de décision : ${GENRES_DE_DECISION.join(', ')}
Genres de notification : les genres de relais, puis decision, sommeil, empeche

Sortie : le JSON de la fonction sur la sortie standard ; code 0 si ok, 1 sinon.
Exemple (31 octobre 2026) :
  node scripts/assistants-maison.mjs rdv poser --numero 22900000000 --services svc-retwist --date 2026-11-04 --time 10:00 --pour st-5qduae5jef --idempotence opale:22900000000:2026-10-31T09:12
`;

/* ── Les arguments ────────────────────────────────────────────────────── */

const DRAPEAUX = new Set(['essai', 'aide', 'tenue', 'ajouter', 'notifier']);

function litLesArguments(argv) {
  const mots = []; const options = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { mots.push(a); continue; }
    const nom = a.slice(2);
    if (DRAPEAUX.has(nom)) { options[nom] = true; continue; }
    const suivant = argv[i + 1];
    if (suivant === undefined || (suivant.startsWith('--') && !/^--\d/.test(suivant))) { options[nom] = true; continue; }
    options[nom] = suivant; i += 1;
  }
  return { mots, options };
}

/* ── Les réglages ─────────────────────────────────────────────────────── */

function cheminDesReglages(options) {
  if (options.reglages === true) throw new Erreur('option-invalide', '--reglages attend un chemin');
  if (typeof options.reglages === 'string') return path.resolve(options.reglages);
  const local = path.resolve('reglages.json');
  if (existsSync(local)) return local;
  return path.join(os.homedir(), 'Opale', 'reglages.json');
}

/* Lit `{ assistant, nom, url, jeton }`. Aucune valeur n'est jamais rendue
   dans un message : seulement le chemin et le nom des clés qui manquent. */
function litLesReglages(options) {
  const chemin = cheminDesReglages(options);
  if (!existsSync(chemin)) throw new Erreur('reglages-absents', `aucun reglages.json : ${chemin}`);
  let lu;
  try { lu = JSON.parse(readFileSync(chemin, 'utf8')); } catch { throw new Erreur('reglages-illisibles', `reglages.json n'est pas du JSON lisible : ${chemin}`); }
  const manque = ['assistant', 'nom', 'url', 'jeton'].filter((k) => typeof lu?.[k] !== 'string' || !lu[k].trim());
  if (manque.length) throw new Erreur('reglages-incomplets', `il manque ${manque.join(', ')} dans ${chemin}`);
  jetonLu = lu.jeton.trim();
  return { assistant: lu.assistant.trim(), nom: lu.nom.trim(), url: lu.url.trim(), jeton: jetonLu };
}

function adresseDeLaFonction(url) {
  const u = String(url).trim().replace(/\/+$/, '');
  if (!/^https?:\/\//.test(u)) throw new Erreur('url-invalide', 'url des réglages : il faut une adresse https');
  if (u.endsWith(`/functions/v1/${NOM_DE_LA_FONCTION}`)) return u;
  if (u.endsWith('/functions/v1')) return `${u}/${NOM_DE_LA_FONCTION}`;
  return `${u}/functions/v1/${NOM_DE_LA_FONCTION}`;
}

class Erreur extends Error { constructor(motif, detail) { super(detail); this.motif = motif; } }

/* ── Les petites lectures ─────────────────────────────────────────────── */

const texte = (options, nom) => (typeof options[nom] === 'string' ? options[nom].trim() : '');
const exige = (options, nom, dit = `--${nom}`) => { const v = texte(options, nom); if (!v) throw new Erreur('option-manquante', `${dit} est obligatoire`); return v; };
const ouiNon = (options, nom) => {
  const v = exige(options, nom, `--${nom} oui|non`).toLowerCase();
  if (v === 'oui') return true; if (v === 'non') return false;
  throw new Erreur('option-invalide', `--${nom} attend oui ou non`);
};
const entier = (options, nom, min = 0) => {
  const v = texte(options, nom); if (!v) return undefined;
  if (!/^\d+$/.test(v) || Number(v) < min) throw new Erreur('option-invalide', `--${nom} attend un nombre entier (au moins ${min})`);
  return Number(v);
};
const dateISO = (options, nom = 'date') => {
  const v = exige(options, nom, `--${nom} AAAA-MM-JJ`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(`${v}T12:00:00Z`))) throw new Erreur('option-invalide', `--${nom} attend une date AAAA-MM-JJ`);
  return v;
};
const heure = (options, nom = 'time') => {
  const v = exige(options, nom, `--${nom} HH:mm`);
  const m = /^(\d{1,2}):(\d{2})$/.exec(v);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new Erreur('option-invalide', `--${nom} attend une heure HH:mm`);
  return `${m[1].padStart(2, '0')}:${m[2]}`;
};
// RECOPIÉ de assistants-pur.ts (numeroCle) : les chiffres d'un numéro international, sans +, 00 ni espaces.
const numeroCle = (t) => { const c = String(t ?? '').replace(/\D/g, '').replace(/^00/, ''); return c.length < 8 || c.length > 15 ? null : c; };
const numero = (options, nom, obligatoire) => {
  const v = texte(options, nom);
  if (!v) { if (obligatoire) throw new Erreur('option-manquante', `--${nom} est obligatoire`); return undefined; }
  const n = numeroCle(v);
  if (!n) throw new Erreur('option-invalide', `--${nom} : ce n'est pas un numéro (8 à 15 chiffres)`);
  return n;
};
const genreParmi = (options, liste, dit) => {
  const g = exige(options, 'genre');
  if (!liste.includes(g)) throw new Erreur('genre-inconnu', `--genre ${g} n'est pas ${dit} : ${liste.join(', ')}`);
  return g;
};
const sansVide = (objet) => Object.fromEntries(Object.entries(objet).filter(([, v]) => v !== undefined && v !== ''));

/* ── Les sous-commandes → le corps de la requête ──────────────────────── */

function corpsDe(mots, options, reglages) {
  const [a, b] = mots;
  const cle = b ? `${a} ${b}` : a;
  switch (cle) {
    case 'passage':
      return sansVide({
        action: 'passage',
        controles: { chrome: ouiNon(options, 'chrome'), lie: ouiNon(options, 'lie'), nonLus: ouiNon(options, 'nonlus') },
        traites: entier(options, 'traites'),
        version: texte(options, 'version') || undefined,
      });
    case 'relais deposer':
      return sansVide({
        action: 'relais.deposer',
        pour: exige(options, 'pour'),
        genre: genreParmi(options, GENRES_DE_RELAIS, 'un genre de relais'),
        numeroCle: numero(options, 'numero', false),
        clientId: texte(options, 'client') || undefined,
        rdvId: texte(options, 'rdv') || undefined,
        mot: texte(options, 'mot') || undefined,
        perimeDansMin: entier(options, 'perime-dans', 1),
      });
    case 'relais traiter':
      return { action: 'relais.traiter', id: exige(options, 'id') };
    case 'decision deposer':
      return sansVide({
        action: 'decision.deposer',
        genre: genreParmi(options, GENRES_DE_DECISION, 'un genre de décision'),
        resume: exige(options, 'resume'),
        proposition: texte(options, 'proposition') || undefined,
        numeroCle: numero(options, 'numero', false),
        clientId: texte(options, 'client') || undefined,
        rdvId: texte(options, 'rdv') || undefined,
        echeanceMin: entier(options, 'echeance', 1),
        notifier: options.notifier === true ? true : undefined,
      });
    case 'decision executee':
      return { action: 'decision.executee', id: exige(options, 'id') };
    case 'rdv poser': {
      const n = numero(options, 'numero', true);
      const date = dateISO(options); const time = heure(options);
      const serviceIds = exige(options, 'services', '--services <id,id>').split(',').map((s) => s.trim()).filter(Boolean);
      if (!serviceIds.length) throw new Erreur('option-invalide', '--services attend au moins un identifiant de prestation');
      const note = texte(options, 'note');
      return sansVide({
        action: 'rdv.poser',
        numeroCle: n,
        clientId: texte(options, 'client') || undefined,
        serviceIds, date, time,
        pourMaitre: exige(options, 'pour', '--pour <team id>'),
        master: texte(options, 'master') || undefined,
        dureeMin: entier(options, 'duree', 5),
        note: note || undefined,
        tenue: options.tenue === true ? true : undefined,
        idempotence: texte(options, 'idempotence') || `${reglages.assistant}:${n}:${date}T${time}`,
        numeroAPrevenir: numero(options, 'prevenir', false),
        ajouter: options.ajouter === true ? true : undefined,
      });
    }
    case 'rdv deplacer':
      return { action: 'rdv.deplacer', rdvId: exige(options, 'rdv'), date: dateISO(options), time: heure(options), updatedAt: exige(options, 'updated-at') };
    case 'rdv annuler':
      return { action: 'rdv.annuler', rdvId: exige(options, 'rdv'), updatedAt: exige(options, 'updated-at') };
    case 'note poser': {
      const note = exige(options, 'note');
      if (note.length > 200) throw new Erreur('option-invalide', '--note : 200 caractères au plus');
      return { action: 'note.poser', rdvId: exige(options, 'rdv'), note };
    }
    case 'notifier': {
      const h = texte(options, 'heure');
      return sansVide({
        action: 'notifier',
        pour: exige(options, 'pour', '--pour moi|<id d\'assistant>'),
        genre: genreParmi(options, GENRES_DE_NOTIFICATION, 'un genre de notification'),
        detail: h ? { heure: h } : undefined,
      });
    }
    default:
      throw new Erreur('sous-commande-inconnue', `${cle || '(rien)'} : voir --aide`);
  }
}

/* ── L'appel ──────────────────────────────────────────────────────────── */

async function appelle(reglages, corps, essai) {
  const url = adresseDeLaFonction(reglages.url);
  const methode = corps ? 'POST' : 'GET';
  const enTetes = corps ? { 'content-type': 'application/json', [EN_TETE_DU_JETON_ASSISTANT]: reglages.jeton } : {};
  if (essai) {
    ecris({ ok: true, essai: true, assistant: reglages.assistant, requete: { methode, url, enTetes: corps ? { ...enTetes, [EN_TETE_DU_JETON_ASSISTANT]: JETON_MASQUE } : {}, corps: corps ?? null } });
    return 0;
  }
  const arret = new AbortController();
  const minuterie = setTimeout(() => arret.abort(), DELAI_MS);
  let r;
  try {
    r = await fetch(url, { method: methode, headers: enTetes, body: corps ? JSON.stringify(corps) : undefined, signal: arret.signal });
  } catch (e) {
    clearTimeout(minuterie);
    return refus(e?.name === 'AbortError' ? 'delai-depasse' : 'reseau', e?.cause?.message ?? e?.message ?? String(e));
  }
  clearTimeout(minuterie);
  const brut = await r.text();
  let reponse;
  try { reponse = JSON.parse(brut); } catch { reponse = { ok: false, motif: 'reponse-illisible', statut: r.status, detail: brut.slice(0, 300) }; }
  if (reponse && typeof reponse === 'object' && !('ok' in reponse)) reponse = { ok: r.ok, statut: r.status, ...reponse };
  ecris(reponse);
  return reponse?.ok === true ? 0 : 1;
}

/* ── Le départ ────────────────────────────────────────────────────────── */

async function principal() {
  const { mots, options } = litLesArguments(process.argv.slice(2));
  if (options.aide === true || mots[0] === 'aide' || (!mots.length && Object.keys(options).length === 0)) { process.stdout.write(AIDE); return 0; }
  try {
    const reglages = litLesReglages(options);
    const corps = mots[0] === 'sante' ? null : corpsDe(mots, options, reglages);
    return await appelle(reglages, corps, options.essai === true);
  } catch (e) {
    if (e instanceof Erreur) return refus(e.motif, e.message);
    return refus('erreur', e?.message ?? String(e));
  }
}

/* Sortie naturelle : sous Windows, process.exit() pendant la fermeture des poignées réseau
   de fetch fait tomber Node (assertion UV_HANDLE_CLOSING) et rend 127 au lieu du code voulu. */
process.exitCode = await principal();
