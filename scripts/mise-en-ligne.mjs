import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/* MET EN LIGNE SUR SUPABASE CE QUE LA MAISON COLLAIT À LA MAIN — 31 octobre 2026.

   POURQUOI CE SCRIPT EXISTE. Jusqu'au 30 octobre, chaque fonction Edge et
   chaque fichier SQL partait par un dossier « A recoller » posé sur le bureau :
   Yéman ouvrait la console Supabase, sélectionnait tout, collait, déployait.
   Le 31 octobre elle l'a dit nettement : elle ne veut plus le faire. Les
   sessions mettent tout en ligne elles-mêmes, aussitôt le code écrit.

   Il passe par l'API de gestion de Supabase (api.supabase.com), avec la clé
   personnelle qu'elle a posée une fois sur son poste. La clé ne vit jamais
   dans le dépôt : elle est lue dans SUPABASE_ACCESS_TOKEN, sinon dans
   ~/.supabase/access-token (là où la CLI Supabase la range aussi).

   LES GARDE-FOUS.
     ① Ce qui part est ce qui est COMMITÉ (HEAD, ou --commit <sha>), jamais
       l'arbre de travail : une sœur peut y avoir une modification en cours.
     ② Une fonction déjà en ligne garde son réglage verify_jwt ; le perdre
       couperait les webhooks (Meta, FedaPay, KkiaPay n'envoient pas de jeton).
       Une fonction NOUVELLE exige --jwt oui|non, on ne devine pas.
     ③ Après le déploiement, la fonction est relue : numéro de version chez
       Supabase, puis, si elle a un contrôle de santé (GET), la VERSION
       qu'elle dit elle-même, comparée à celle du fichier.
     ④ Un SQL qui efface des données (drop table, truncate, delete from,
       drop column) exige --destructif, posé seulement après une table repli_
       (avec RLS) qui garde ce qui va partir.
     ⑤ Une valeur de secret n'est jamais un argument : elle arrive par
       l'entrée standard, et rien ne l'affiche.
   Chaque geste s'écrit dans ~/.supabase/journal-mise-en-ligne.txt.

   Usage :
     node scripts/mise-en-ligne.mjs etat                   les fonctions en ligne, à jour ou en retard
     node scripts/mise-en-ligne.mjs fonction <nom> [<nom>…] [--commit <sha>] [--jwt oui|non]
     node scripts/mise-en-ligne.mjs sql <fichier.sql> [--commit <sha>] [--destructif] [--montre]
     node scripts/mise-en-ligne.mjs requete "<select …>" [--montre]   lecture seule
     node scripts/mise-en-ligne.mjs secret <NOM>          la valeur par l'entrée standard
     node scripts/mise-en-ligne.mjs secrets               les noms des secrets posés */

const racine = path.resolve(import.meta.dirname, '..');
const API = 'https://api.supabase.com/v1';
const journal = path.join(os.homedir(), '.supabase', 'journal-mise-en-ligne.txt');

const arrete = (message) => { console.error(`ARRÊT : ${message}`); process.exit(1); };

function laCle() {
  const env = (process.env.SUPABASE_ACCESS_TOKEN ?? '').trim();
  if (env) return env;
  const fichier = path.join(os.homedir(), '.supabase', 'access-token');
  if (existsSync(fichier)) {
    const lue = readFileSync(fichier, 'utf8').trim();
    if (lue) return lue;
  }
  arrete('aucune clé Supabase sur ce poste. Elle se pose une fois, par « Poser la cle Supabase » sur le bureau.');
}

/* L'adresse du projet vient de .env.local, comme pour le Trône ; une copie
   propre sans .env.local la reçoit par VITE_SUPABASE_URL. */
function leProjet() {
  let url = (process.env.VITE_SUPABASE_URL ?? '').trim();
  const env = path.join(racine, '.env.local');
  if (!url && existsSync(env)) url = (readFileSync(env, 'utf8').match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1] ?? '').trim();
  const ref = url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
  if (!ref) arrete('adresse du projet introuvable (VITE_SUPABASE_URL, ou .env.local).');
  return { ref, url: url.replace(/\/$/, '') };
}

function laClePublique() {
  const env = path.join(racine, '.env.local');
  const lue = existsSync(env) ? readFileSync(env, 'utf8').match(/^VITE_SUPABASE_ANON_KEY=(.+)$/m)?.[1] : undefined;
  return (process.env.VITE_SUPABASE_ANON_KEY ?? lue ?? '').trim();
}

async function api(methode, chemin, corps, enTetes = {}) {
  const r = await fetch(`${API}${chemin}`, {
    method: methode,
    headers: { authorization: `Bearer ${laCle()}`, ...enTetes },
    body: corps,
  });
  const texte = await r.text();
  let donnees;
  try { donnees = texte ? JSON.parse(texte) : null; } catch { donnees = texte; }
  return { ok: r.ok, statut: r.status, donnees };
}

const note = (ligne) => {
  try {
    mkdirSync(path.dirname(journal), { recursive: true });
    appendFileSync(journal, `${new Date().toISOString()}  ${ligne}\n`);
  } catch { /* le journal aide, il ne bloque jamais */ }
};

/* Le contenu COMMITÉ d'un fichier du dépôt. */
function commite(chemin, commit) {
  const relatif = path.relative(racine, path.resolve(racine, chemin)).split(path.sep).join('/');
  try {
    return execFileSync('git', ['show', `${commit}:${relatif}`], { cwd: racine, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch {
    arrete(`${relatif} n'existe pas au commit ${commit} (commitez d'abord).`);
  }
}

function differeDuCommit(chemin) {
  const relatif = path.relative(racine, path.resolve(racine, chemin)).split(path.sep).join('/');
  return execFileSync('git', ['status', '--porcelain', '--', relatif], { cwd: racine, encoding: 'utf8' }).trim() !== '';
}

const laVersion = (source) => source.match(/(?:const|var|let)\s+VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1];

/* Un GET n'est sûr que sur une fonction dont le GET est un contrôle de santé
   qui dit sa version : ailleurs, une fonction sans garde de méthode pourrait
   faire son travail (une sauvegarde, une tournée d'envois) sur un simple GET. */
function aUnControleDeSante(source) {
  const i = source.search(/method\s*===\s*['"]GET['"]/);
  return i >= 0 && /version/.test(source.slice(i, i + 1500));
}

async function laSanteDit(slug) {
  const { url } = leProjet();
  const cle = laClePublique();
  try {
    const r = await fetch(`${url}/functions/v1/${slug}?sonde=1`, {
      headers: cle ? { apikey: cle, authorization: `Bearer ${cle}` } : {},
    });
    const d = await r.json().catch(() => null);
    return d && typeof d.version === 'string' ? d.version : undefined;
  } catch {
    return undefined;
  }
}

const options = (args) => {
  const o = { libres: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--commit') o.commit = args[++i];
    else if (a === '--jwt') o.jwt = args[++i];
    else if (a === '--destructif') o.destructif = true;
    else if (a === '--montre') o.montre = true;
    else o.libres.push(a);
  }
  return o;
};

async function fonction(slug, o) {
  const { ref } = leProjet();
  const chemin = `supabase/functions/${slug}/index.ts`;
  const commit = o.commit ?? 'HEAD';
  const source = commite(chemin, commit);
  if (!o.commit && differeDuCommit(chemin)) console.log(`  (l'arbre de travail diffère de HEAD pour ${slug} : c'est HEAD qui part)`);
  const version = laVersion(source);

  const avant = await api('GET', `/projects/${ref}/functions/${slug}`);
  if (!avant.ok && avant.statut !== 404) arrete(`${slug} : lecture impossible (${avant.statut}) ${JSON.stringify(avant.donnees)}`);
  const nouvelle = avant.statut === 404;
  let verifyJwt;
  if (o.jwt === 'oui' || o.jwt === 'non') verifyJwt = o.jwt === 'oui';
  else if (o.jwt) arrete('--jwt prend oui ou non.');
  if (nouvelle && verifyJwt === undefined) arrete(`${slug} n'existe pas encore en ligne : dites --jwt oui (appelée par le Trône, avec une session) ou --jwt non (webhook, cron, page publique).`);
  if (!nouvelle) {
    if (verifyJwt !== undefined && verifyJwt !== avant.donnees.verify_jwt) console.log(`  ATTENTION : verify_jwt de ${slug} passe de ${avant.donnees.verify_jwt} à ${verifyJwt}.`);
    if (verifyJwt === undefined) verifyJwt = !!avant.donnees.verify_jwt;
  }

  const form = new FormData();
  form.append('metadata', JSON.stringify({ entrypoint_path: 'index.ts', name: slug, verify_jwt: verifyJwt }));
  form.append('file', new Blob([source], { type: 'application/typescript' }), 'index.ts');
  const envoi = await api('POST', `/projects/${ref}/functions/deploy?slug=${encodeURIComponent(slug)}`, form);
  if (!envoi.ok) arrete(`${slug} : déploiement refusé (${envoi.statut}) ${JSON.stringify(envoi.donnees)}`);

  const apres = await api('GET', `/projects/${ref}/functions/${slug}`);
  const n = apres.donnees?.version;
  const nAvant = nouvelle ? '—' : avant.donnees.version;
  if (!apres.ok || apres.donnees?.status !== 'ACTIVE') arrete(`${slug} : déployée mais pas active (${apres.donnees?.status ?? apres.statut}).`);
  if (!nouvelle && !(n > avant.donnees.version)) arrete(`${slug} : le numéro de version n'a pas bougé (${nAvant} → ${n}).`);

  let sante = 'pas de contrôle de santé';
  if (version && aUnControleDeSante(source)) {
    let dite;
    for (let essai = 0; essai < 6 && dite !== version; essai++) {
      if (essai) await new Promise((r) => setTimeout(r, 5000));
      dite = await laSanteDit(slug);
    }
    if (dite === version) sante = `le serveur dit « ${dite} »`;
    else if (dite) arrete(`${slug} : le serveur dit encore « ${dite} », le fichier dit « ${version} ».`);
    else sante = 'contrôle de santé muet (porte fermée au GET)';
  }
  const ligne = `fonction ${slug} : v${nAvant} → v${n}, verify_jwt ${verifyJwt}, ${version ?? 'sans VERSION'}, commit ${shortSha(commit)} ; ${sante}`;
  console.log(`EN LIGNE  ${ligne}`);
  note(ligne);
}

const shortSha = (commit) => {
  try { return execFileSync('git', ['rev-parse', '--short=8', commit], { cwd: racine, encoding: 'utf8' }).trim(); } catch { return commit; }
};

const DESTRUCTIF = /\b(drop\s+table|drop\s+schema|truncate|delete\s+from|drop\s+column)\b/i;
const sansCommentaires = (sql) => sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

async function sql(fichier, o) {
  const { ref } = leProjet();
  const commit = o.commit ?? 'HEAD';
  const texte = commite(fichier, commit);
  if (!o.commit && differeDuCommit(fichier)) console.log(`  (l'arbre de travail diffère de HEAD pour ${fichier} : c'est HEAD qui part)`);
  const efface = sansCommentaires(texte).match(DESTRUCTIF)?.[0];
  if (efface && !o.destructif) arrete(`${fichier} contient « ${efface} » : faites d'abord une table repli_ (RLS comprise), puis relancez avec --destructif.`);
  const r = await api('POST', `/projects/${ref}/database/query`, JSON.stringify({ query: texte }), { 'content-type': 'application/json' });
  if (!r.ok) arrete(`${fichier} : refusé par la base (${r.statut}) ${typeof r.donnees === 'string' ? r.donnees : r.donnees?.message ?? JSON.stringify(r.donnees)}`);
  const lignes = Array.isArray(r.donnees) ? r.donnees : [];
  const ligne = `sql ${fichier} : passé, ${lignes.length} ligne(s) rendue(s), commit ${shortSha(commit)}`;
  console.log(`EN LIGNE  ${ligne}`);
  if (o.montre) console.log(JSON.stringify(lignes, null, 2));
  note(ligne);
}

async function requete(texte, o) {
  const { ref } = leProjet();
  const r = await api('POST', `/projects/${ref}/database/query`, JSON.stringify({ query: texte, read_only: true }), { 'content-type': 'application/json' });
  if (!r.ok) arrete(`requête refusée (${r.statut}) ${typeof r.donnees === 'string' ? r.donnees : r.donnees?.message ?? JSON.stringify(r.donnees)}`);
  const lignes = Array.isArray(r.donnees) ? r.donnees : [];
  console.log(`${lignes.length} ligne(s)`);
  if (o.montre) console.log(JSON.stringify(lignes, null, 2));
}

async function secret(nom) {
  const { ref } = leProjet();
  if (!/^[A-Z][A-Z0-9_]*$/.test(nom ?? '')) arrete('le nom d\'un secret s\'écrit en MAJUSCULES_ET_SOULIGNÉS.');
  if (nom.startsWith('SUPABASE_')) arrete('les secrets SUPABASE_* sont posés par la plateforme.');
  const valeur = readFileSync(0, 'utf8').replace(/\r?\n$/, '');
  if (!valeur) arrete('valeur vide : elle arrive par l\'entrée standard.');
  const r = await api('POST', `/projects/${ref}/secrets`, JSON.stringify([{ name: nom, value: valeur }]), { 'content-type': 'application/json' });
  if (!r.ok) arrete(`${nom} : refusé (${r.statut}).`);
  const ligne = `secret ${nom} : posé (${valeur.length} signes)`;
  console.log(`EN LIGNE  ${ligne}`);
  note(ligne);
}

async function secrets() {
  const { ref } = leProjet();
  const r = await api('GET', `/projects/${ref}/secrets`);
  if (!r.ok) arrete(`lecture des secrets impossible (${r.statut}).`);
  for (const s of r.donnees ?? []) console.log(s.name);
}

async function etat() {
  const { ref } = leProjet();
  const r = await api('GET', `/projects/${ref}/functions`);
  if (!r.ok) arrete(`lecture des fonctions impossible (${r.statut}) ${JSON.stringify(r.donnees)}`);
  const enLigne = new Map((r.donnees ?? []).map((f) => [f.slug, f]));
  const locales = execFileSync('git', ['ls-tree', '--name-only', 'HEAD', 'supabase/functions/'], { cwd: racine, encoding: 'utf8' })
    .split('\n').filter(Boolean).map((p) => p.split('/').pop());
  for (const slug of [...new Set([...locales, ...enLigne.keys()])].sort()) {
    const f = enLigne.get(slug);
    if (!locales.includes(slug)) { console.log(`${slug.padEnd(22)} en ligne seulement (v${f.version})`); continue; }
    if (!f) { console.log(`${slug.padEnd(22)} JAMAIS MISE EN LIGNE`); continue; }
    const source = commite(`supabase/functions/${slug}/index.ts`, 'HEAD');
    const version = laVersion(source);
    let verdict = `v${f.version}, jwt ${f.verify_jwt ? 'oui' : 'non'}, ${new Date(f.updated_at).toISOString().slice(0, 16).replace('T', ' ')}`;
    if (version && aUnControleDeSante(source)) {
      const dite = await laSanteDit(slug);
      verdict += dite === version ? ' · À JOUR' : dite ? ` · EN RETARD : dit « ${dite} », le dépôt « ${version} »` : ' · santé muette';
    }
    console.log(`${slug.padEnd(22)} ${verdict}`);
  }
}

const [action, ...reste] = process.argv.slice(2);
const o = options(reste);
if (action === 'etat') await etat();
else if (action === 'fonction') {
  if (!o.libres.length) arrete('quelle fonction ?');
  for (const slug of o.libres) await fonction(slug, o);
} else if (action === 'sql') {
  if (!o.libres.length) arrete('quel fichier SQL ?');
  for (const f of o.libres) await sql(f, o);
} else if (action === 'requete') await requete(o.libres.join(' '), o);
else if (action === 'secret') await secret(o.libres[0]);
else if (action === 'secrets') await secrets();
else arrete('action inconnue : etat, fonction, sql, requete, secret, secrets.');
