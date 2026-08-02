#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   EXPORT FIRESTORE → JSON  (ancien ERP « MND Admin » → Le Trône)

   Aspire chaque collection de la base Firestore dans un fichier JSON
   local, sans rien installer : ni firebase-admin, ni gcloud, ni bucket
   Cloud Storage. Node 18+ suffit (fetch + crypto natifs).

   USAGE
     node scripts/firestore-export.mjs <cle-service-account.json> [dossier-sortie]

   LA CLÉ
     Console Firebase → ⚙ Paramètres du projet → onglet « Comptes de
     service » → « Générer une nouvelle clé privée ». Le fichier JSON
     téléchargé contient une clé privée : il reste sur ce poste, ne se
     colle nulle part, et se révoque après l'import (même écran).

   SORTIE
     <dossier>/<collection>.json  — un tableau d'objets, `_id` = id du
                                    document Firestore
     <dossier>/_resume.json       — volumes, champs vus, sous-collections
   ═══════════════════════════════════════════════════════════════════ */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createSign } from 'node:crypto';
import { resolve, join } from 'node:path';

const [, , keyPathArg, outArg] = process.argv;
if (!keyPathArg) {
  console.error('Usage : node scripts/firestore-export.mjs <cle-service-account.json> [dossier-sortie]');
  process.exit(1);
}
const keyPath = resolve(keyPathArg);
const outDir = resolve(outArg ?? 'firestore-export');

const sa = JSON.parse(readFileSync(keyPath, 'utf8'));
const projectId = sa.project_id;
if (!projectId || !sa.client_email || !sa.private_key) {
  console.error('Ce fichier n\'est pas une clé de compte de service Firebase (project_id / client_email / private_key attendus).');
  process.exit(1);
}

/* ---------- Jeton d'accès : JWT signé RS256, échangé chez Google ---------- */
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');

async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: sa.token_uri ?? 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(claim)}`;
  const sig = createSign('RSA-SHA256').update(unsigned).sign(sa.private_key.replace(/\\n/g, '\n'), 'base64url');
  const res = await fetch(claim.aud, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${sig}`,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`OAuth : ${JSON.stringify(json)}`);
  return json.access_token;
}

/* ---------- Traduction du format REST Firestore vers du JSON nu ---------- */
function plain(v) {
  if (v == null) return null;
  if ('nullValue' in v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return v.timestampValue; // ISO — tronqué au jour plus tard si besoin
  if ('bytesValue' in v) return `«bytes:${String(v.bytesValue).length}»`;
  if ('referenceValue' in v) return String(v.referenceValue).split('/documents/')[1] ?? v.referenceValue;
  if ('geoPointValue' in v) return { lat: v.geoPointValue.latitude, lng: v.geoPointValue.longitude };
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(plain);
  if ('mapValue' in v) return fields(v.mapValue.fields ?? {});
  return v;
}
const fields = (f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, plain(v)]));

/* ---------- Appels ---------- */
const BASE = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
let token;
async function api(url, init) {
  const res = await fetch(url, { ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init?.headers ?? {}) } });
  const json = await res.json();
  if (!res.ok) throw new Error(`${url}\n${JSON.stringify(json)}`);
  return json;
}

async function listCollections(parent = '') {
  const url = `${BASE}${parent}:listCollectionIds`;
  const out = [];
  let pageToken;
  do {
    const r = await api(url, { method: 'POST', body: JSON.stringify({ pageSize: 100, pageToken }) });
    out.push(...(r.collectionIds ?? []));
    pageToken = r.nextPageToken;
  } while (pageToken);
  return out;
}

async function dumpCollection(name) {
  const docs = [];
  let pageToken;
  do {
    const u = new URL(`${BASE}/${encodeURIComponent(name)}`);
    u.searchParams.set('pageSize', '300');
    if (pageToken) u.searchParams.set('pageToken', pageToken);
    const r = await api(u.toString());
    for (const d of r.documents ?? []) {
      docs.push({ _id: d.name.split('/').pop(), _createdAt: d.createTime, _updatedAt: d.updateTime, ...fields(d.fields ?? {}) });
    }
    pageToken = r.nextPageToken;
  } while (pageToken);
  return docs;
}

/* ---------- Marche ---------- */
token = await accessToken();
mkdirSync(outDir, { recursive: true });

const collections = await listCollections();
if (!collections.length) {
  console.error('Aucune collection à la racine. La base est peut-être une Realtime Database (URL en …firebaseio.com) et non Firestore — dis-le moi, la marche à suivre diffère.');
  process.exit(2);
}

const resume = { projet: projectId, exportéLe: new Date().toISOString(), collections: {} };

for (const col of collections) {
  const docs = await dumpCollection(col);
  writeFileSync(join(outDir, `${col}.json`), JSON.stringify(docs, null, 2), 'utf8');

  /* Champs réellement rencontrés (union sur tous les documents) et
     sous-collections du premier document — c'est ce qui dit si des données
     se cachent sous une fiche (historique, notes…). */
  const champs = new Map();
  for (const d of docs) for (const [k, v] of Object.entries(d)) {
    if (!champs.has(k)) champs.set(k, new Set());
    champs.get(k).add(Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);
  }
  let sous = [];
  if (docs.length) {
    try { sous = await listCollections(`/${col}/${docs[0]._id}`); } catch { /* droit refusé : sans importance */ }
  }
  resume.collections[col] = {
    documents: docs.length,
    champs: Object.fromEntries([...champs].map(([k, s]) => [k, [...s].join('|')])),
    sousCollections: sous,
    exemple: docs[0] ?? null,
  };
  console.log(`${col.padEnd(24)} ${String(docs.length).padStart(5)} document(s)${sous.length ? `  ↳ sous-collections : ${sous.join(', ')}` : ''}`);
}

writeFileSync(join(outDir, '_resume.json'), JSON.stringify(resume, null, 2), 'utf8');
console.log(`\n✔ Export terminé → ${outDir}`);
