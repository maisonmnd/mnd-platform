import { build } from 'esbuild';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';

/* LE LOT « SERVEUR-SITE » DE LA REVUE, EPROUVE — `node scripts/verifie-revue-serveur-site.mjs`.

   10 octobre 2026, revue de nuit. Le banc (`verifie-revue-serveur-site.harnais.ts`)
   charge les vraies fonctions Edge sur un faux Supabase et un faux reseau,
   dans un processus fils ; le dossier temporaire s'efface dans un `finally`.

   `--prouve` remet chaque faute, une a une, dans le fichier sur le disque
   (les fonctions Edge et la migration se lisent la), lance le banc, et
   RESTAURE le fichier octet pour octet dans un `finally`. Le banc doit crier
   a l'endroit attendu pour chaque faute. Avant et apres, l'empreinte md5 de
   chaque fichier du lot doit etre la meme : la preuve ne laisse rien. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');
const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-revue-serveur-site-'));
const sortie = path.join(dossier, 'harnais.mjs');

const F = (n) => `supabase/functions/${n}/index.ts`;
const M = 'supabase/migrations/0126_la_revue_de_nuit.sql';
const LOT = ['kkiapay-verify', 'kkiapay-webhook', 'confirmation-rdv', 'rappels-j1', 'envois-partent', 'push-notify', 'avis-google-releve'].map(F).concat([M]);
const SIGNAL_8 = 'signal: AbortSignal.timeout(ENVOI_MAX_MS),\n';

/* LES FAUTES : le code d'avant (ou son effet), remis a sa place. `tous` :
   le motif se remplace partout ou il est (au moins une fois). */
const FAUTES = [
  { n: 15, nom: 'deux cibles acceptees', crie: [/ECHEC 15 : un rendez-vous ET une carte/], subs: [
    [F('kkiapay-verify'), 'if (cibles.length !== 1)', 'if (cibles.length < 1)'],
  ] },
  { n: 15, nom: 'la carte ne regarde pas sa transaction', crie: [/ECHEC 15 : \.\.\. ni par le filet/], subs: [
    [F('kkiapay-verify'), "  if (String(inscrit?.data?.partnerId ?? '') !== o.carteId) return null;\n", ''],
    [F('kkiapay-webhook'), "  if (String(inscrit?.data?.partnerId ?? '') !== o.carteId) return null;\n", ''],
  ] },
  { n: 15, nom: 'un rejeu pose l effet sur n importe quelle cible', crie: [/ECHEC 17 : \.\.\. mais pas sur une AUTRE inscription/], subs: [
    [F('kkiapay-verify'), "    if (String(inscrit?.data?.partnerId ?? '') !== opts.partnerId) return false;\n", ''],
  ] },
  { n: 16, nom: 'une inscription sans acompte retombe sur zero', crie: [/ECHEC 16 : une inscription sans acompte/], subs: [
    [F('kkiapay-verify'), "      expected = Math.round(Number(dem?.data?.acompteXof ?? 0));\n      if (expected <= 0) return json({ error: 'cible_sans_montant', version: VERSION }, 404);\n", "      expected = Math.round(Number(dem?.data?.acompteXof ?? 0));\n"],
  ] },
  { n: 16, nom: 'un rendez-vous sans acompte se confirme pour ce qui est paye', crie: [/ECHEC 16 : un rendez-vous sans acompte demande/], subs: [
    [F('kkiapay-verify'), "        if (expected <= 0) return json({ error: 'cible_sans_montant', version: VERSION }, 404);\n      }\n    }\n", '      }\n    }\n'],
    [F('kkiapay-verify'), 'if (appt && d.depositConfirmed !== true && couvre(Math.round(Number(d.depositXof ?? 0)))) {', 'if (appt) {'],
  ] },
  { n: 17, nom: 'le filet ignore l Academie', crie: [/ECHEC 17 : le filet seul confirme/], subs: [
    [F('kkiapay-webhook'), '            inscriptionId = partnerId;\n', ''],
  ] },
  { n: 17, nom: 'un rejeu s arrete au registre', crie: [/ECHEC 17 : deja au registre/], subs: [
    [F('kkiapay-verify'), "    if (insErr.code !== '23505') throw new Error(insErr.message);\n", "    if (insErr.code === '23505') return true;\n"],
  ] },
  { n: 18, nom: 'la rafale compte les rendez-vous deja confirmes', crie: [/ECHEC 18 : six confirmations deja parties/], subs: [
    [F('confirmation-rdv'), 'if (aEnvoyer.length > RAFALE_MAX) {', 'if (rdvs.length > RAFALE_MAX) {'],
  ] },
  { n: 19, nom: 'le passage de 21 h depose quand meme', crie: [/ECHEC 19 : 21 h, salle ouverte/], subs: [
    [F('rappels-j1'), '    if (partiraitLeJourMeme) {', '    if (false) {'],
  ] },
  { n: 20, nom: 'une ligne prise reste prise', crie: [/ECHEC 20 : une ligne prise depuis quinze minutes/], subs: [
    [F('envois-partent'), ".eq('data->>statut', 'en-envoi').limit(100);", ".eq('data->>statut', 'jamais-pris').limit(100);"],
  ] },
  { n: 20, nom: 'le facteur sans duree maximale', crie: [/ECHEC 20 : le message du jour part, avec une duree maximale/], subs: [
    [F('envois-partent'), SIGNAL_8, '', true],
  ] },
  { n: 21, nom: 'le journal ecrit d un seul geste, a la fin', crie: [/ECHEC 21 : Meta pend sur la deuxieme cliente/], subs: [
    [F('confirmation-rdv'), '    const lignes = aInserer.splice(0);', '    const lignes = aInserer.splice(0, 0);'],
    [F('confirmation-rdv'), '  return new Response(\n    JSON.stringify({ version: VERSION, vus: rdvs.length, ecartes:', "  if (aInserer.length > 0) await sb.from('envois').upsert(aInserer, { onConflict: 'id' });\n  return new Response(\n    JSON.stringify({ version: VERSION, vus: rdvs.length, ecartes:"],
  ] },
  { n: 21, nom: 'confirmation-rdv sans duree maximale', crie: [/ECHEC 21 : chaque appel de confirmation-rdv porte une duree maximale/], subs: [
    [F('confirmation-rdv'), SIGNAL_8, '', true],
  ] },
  { n: 22, nom: 'le rappel push en graphie machine', crie: [/ECHEC 22 : la veille, la notification dit la date en clair/], subs: [
    [F('push-notify'), 'Rendez-vous le ${jourEnClair(date)} à ${heureLisible(time)}, la Maison vous attend.', 'Rendez-vous le ${date} à ${time} — la maison vous attend.'],
  ] },
  { n: 22, nom: 'le soir compte le foyer hors bilan', crie: [/ECHEC 22 : a 21 h, le foyer hors bilan se tait/], subs: [
    [F('push-notify'), '    if (horsBilan.has(`${b}|${tiroir}`)) return;\n', ''],
  ] },
  { n: 22, nom: 'le soir ignore les mouvements hors activite', crie: [/ECHEC 22 : a 21 h, le foyer hors bilan se tait/], subs: [
    [F('push-notify'), "  for (const row of await toutes('entrees_hors_activite', 'id,branch_id,data')) {", "  for (const row of [] as any[]) {"],
  ] },
  { n: 23, nom: 'le releve ouvert sans CRON_SECRET', crie: [/ECHEC 23 : sans CRON_SECRET, la cle publique seule/], subs: [
    [F('avis-google-releve'), "  if (!porteLaCle(req)) return json({ error: 'forbidden', version: VERSION }, 403);", "  if (CRON_SECRET && req.headers.get('x-cron-secret') !== CRON_SECRET) return json({ error: 'forbidden', version: VERSION }, 403);"],
  ] },
  { n: 24, nom: 'un geste se regle en ligne', crie: [/ECHEC 24 : un geste a montant glisse/, /ECHEC 24 : \.\.\. ni par le filet/], subs: [
    [F('kkiapay-verify'), "      if (cc?.data?.objet !== 'montant' || expected <= 0)", '      if (expected <= 0)'],
    [F('kkiapay-verify'), "    if (c.objet !== 'montant') return null;\n", ''],
    [F('kkiapay-webhook'), "    if (c.objet !== 'montant') return null;\n", ''],
    [F('kkiapay-webhook'), "      if (!cc || cc.data?.objet !== 'montant' || attendu <= 0", '      if (!cc || attendu <= 0'],
  ] },
  { n: 15, nom: 'migration : pas d index sur la transaction', crie: [/ECHEC 15 : une transaction, une carte \(index unique\)/], subs: [
    [M, '    create unique index cartes_cadeaux_transaction_unique', '    create index cartes_cadeaux_transaction_unique'],
  ] },
  { n: 24, nom: 'migration : le geste garde un montant libre', crie: [/ECHEC 24 : le geste se depose SANS montant/], subs: [
    [M, "(data->>'objet' = 'geste' and data->'montantXof' is null)", "data->>'objet' = 'geste'"],
  ] },
  { n: 31, nom: 'migration : depot sans borne de taille', crie: [/ECHEC 31 : le depot pese moins de 4 000 signes/], subs: [
    [M, '    and length(data::text) < 4000\n', ''],
  ] },
  { n: 25, nom: 'migration : la garde croit l ancien genre', crie: [/ECHEC 25 : la garde ne croit pas/], subs: [
    [M, '    avant := null;', '    avant := avant;'],
  ] },
  { n: 26, nom: 'migration : emprunts sans horodatage', crie: [/ECHEC 26 : emprunts, hors activite et messages/], subs: [
    [M, "array['entrees_hors_activite', 'emprunts', 'messages_wa']", "array['entrees_hors_activite', 'messages_wa']"],
  ] },
  { n: 27, nom: 'migration : l equipe range a chaque ecriture', crie: [/ECHEC 27 : l equipe ne range ses fils/], subs: [
    [M, "when (pg_trigger_depth() = 0 and old.data->>'phone' is distinct from new.data->>'phone')", 'when (pg_trigger_depth() = 0)'],
  ] },
  { n: 29, nom: 'migration : un « for all » sur les appels', crie: [/ECHEC 29 : appels_wa sans/], subs: [
    [M, 'create policy appel_insere on public.appels_wa for insert to authenticated', 'create policy appel_insere on public.appels_wa for all to authenticated'],
  ] },
  { n: 30, nom: 'migration : tete_du_numero repond a une cliente', crie: [/ECHEC 30 : a qui est ce numero/], subs: [
    [M, "  if auth.uid() is not null and not public.is_staff() then\n    return jsonb_build_object('tiroir', 'clientes');\n  end if;\n", ''],
  ] },
];

const md5 = (f) => createHash('md5').update(readFileSync(path.join(racine, f))).digest('hex');
const lanceLeBanc = (n) => {
  const r = spawnSync(process.execPath, [sortie], {
    cwd: racine, encoding: 'utf8', maxBuffer: 64e6,
    env: { ...process.env, BANC_DOSSIER: path.join(dossier, `fonctions-${n}`) },
  });
  return { status: r.status, texte: `${r.stdout ?? ''}${r.stderr ?? ''}` };
};

/* La faute, ecrite sur le disque : chaque motif doit y etre (une fois, sauf
   `tous`), sinon la preuve refuse de conclure. Les fins de ligne du fichier
   sont gardees. */
const ecrisLaFaute = (fichier, subs) => {
  const brut = readFileSync(path.join(racine, fichier), 'utf8');
  const crlf = brut.includes('\r\n');
  let t = brut.replace(/\r\n/g, '\n');
  for (const [, avant, apres, tous] of subs) {
    const k = t.split(avant).length - 1;
    if (tous ? k < 1 : k !== 1) throw new Error(`${fichier} : motif trouve ${k} fois : ${avant.slice(0, 70)}`);
    t = tous ? t.split(avant).join(apres) : t.replace(avant, () => apres);
  }
  writeFileSync(path.join(racine, fichier), crlf ? t.replace(/\n/g, '\r\n') : t);
};

try {
  await build({
    entryPoints: [path.join(racine, 'scripts/verifie-revue-serveur-site.harnais.ts')],
    bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error',
  });
  if (!prouve) {
    const r = lanceLeBanc('net');
    process.stdout.write(r.texte);
    process.exitCode = r.status ?? 1;
  } else {
    const avant = Object.fromEntries(LOT.map((f) => [f, md5(f)]));
    const net = lanceLeBanc('net');
    let tient = net.status === 0;
    console.log(`banc sur le code corrige : ${net.status === 0 ? 'il tient' : 'IL ECHOUE DEJA'}`);
    if (net.status !== 0) process.stdout.write(net.texte);
    for (const [i, faute] of FAUTES.entries()) {
      const fichiers = [...new Set(faute.subs.map((s) => s[0]))];
      const copies = new Map(fichiers.map((f) => [f, readFileSync(path.join(racine, f))]));
      let r = { status: 0, texte: '' };
      try {
        for (const f of fichiers) ecrisLaFaute(f, faute.subs.filter((s) => s[0] === f));
        r = lanceLeBanc(`faute-${i}`);
      } catch (e) {
        r = { status: 0, texte: `FAUTE NON APPLIQUEE : ${e.message}` };
      } finally {
        for (const [f, octets] of copies) writeFileSync(path.join(racine, f), octets);
      }
      const crie = r.status !== 0 && faute.crie.every((re) => re.test(r.texte));
      if (!crie) tient = false;
      console.log(`${crie ? 'CRIE ' : 'MUET '} constat ${faute.n} · ${faute.nom}`);
      if (!crie) console.log(r.texte.split('\n').filter((l) => /ECHEC|FAUTE|Error/.test(l)).slice(0, 8).join('\n') || r.texte.slice(0, 600));
    }
    const apres = Object.fromEntries(LOT.map((f) => [f, md5(f)]));
    const intacts = LOT.every((f) => avant[f] === apres[f]);
    console.log(`\nempreintes md5 du lot, avant et apres : ${intacts ? 'identiques' : 'DIFFERENTES'}`);
    for (const f of LOT) console.log(`  ${avant[f]}  ${f}`);
    if (!intacts) tient = false;
    console.log(tient ? `\nLa preuve tient : ${FAUTES.length} fautes remises, le banc crie a chacune.` : '\nLA PREUVE NE TIENT PAS.');
    process.exitCode = tient ? 0 : 1;
  }
} finally {
  rmSync(dossier, { recursive: true, force: true });
}
