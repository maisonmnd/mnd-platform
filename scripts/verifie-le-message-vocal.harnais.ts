/* LE MESSAGE VOCAL DU SITE, ÉPROUVÉ — `node scripts/verifie-le-message-vocal.mjs`.

   19 octobre 2026. Maquette HR7V2tMu… validée (« construis »), ses choix lus
   en base (maquette/vocal) : la page Contact et « Être rappelée » ; deux
   minutes au plus ; l'accusé d'une demande de rappel ; on écoute (aucune
   transcription) ; la voix gardée 90 jours, puis effacée, la demande reste.
   Les attentes viennent de ces choix, jamais du code. Le vrai code du
   serveur est rejoué sur une fausse base. Données d'exemple. */
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import {
  COFFRE_DES_VOIX, DUREE_MAX_DE_LA_VOIX_S, GARDE_DES_VOIX_JOURS, OCTETS_MAX_DE_LA_VOIX, OCTETS_MIN_DE_LA_VOIX, PROFIL_DU_VOCAL,
  cheminDeLaVoix, dureeBornee, dureeDite, formatDEnregistrement, formatDeLaVoix, limiteDeGarde, quandOnRappelle, voixAEffacer,
} from '../src/shared/message-vocal-pur';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else { ko++; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};
const lis = (f: string) => readFileSync(f, 'utf8').split(String.fromCharCode(13)).join('');
const sansCommentaires = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const SERVEUR = 'supabase/functions/demande-submit/index.ts';

/* ── 1. LA RÈGLE ──────────────────────────────────────────────────────── */
dit('deux minutes au plus, gardée 90 jours (ses choix)', [120, 90], [DUREE_MAX_DE_LA_VOIX_S, GARDE_DES_VOIX_JOURS]);
dit('les sons qu on sait garder : webm (Chrome, Android, même dit « video »), mp4 (iPhone), ogg, mp3 ; rien d autre',
  ['webm', 'webm', 'm4a', 'm4a', 'ogg', 'mp3', null, null, null],
  ['audio/webm;codecs=opus', 'video/webm', 'audio/mp4', 'audio/aac', 'audio/ogg;codecs=opus', 'audio/mpeg', 'image/png', '', 'application/pdf'].map((t) => formatDeLaVoix(t)?.ext ?? null));
dit('l enregistreur prend opus en webm d abord, mp4 sur l iPhone, sinon laisse le navigateur choisir', ['audio/webm;codecs=opus', 'audio/mp4', ''],
  [formatDEnregistrement(() => true), formatDEnregistrement((t) => t === 'audio/mp4'), formatDEnregistrement(() => false)]);
dit('la voix vit sous la branche puis la demande', 'br-maison/dem-1.webm', cheminDeLaVoix('br-maison', 'dem-1', 'webm'));
dit('la durée annoncée se borne, jamais crue au-delà du plafond', [42, 0, 125, 0], [dureeBornee('42'), dureeBornee('abc'), dureeBornee(9999), dureeBornee(-3)]);
dit('la durée se dit en minutes', ['0:42', '2:00', '0:05'], [dureeDite(42), dureeDite(120), dureeDite(5)]);
{
  const maintenant = Date.parse('2026-10-19T10:00:00Z');
  const jour = (n: number) => new Date(maintenant - n * 86_400_000).toISOString();
  const demandes = [
    { id: 'vieille', createdAt: jour(91), voix: { chemin: 'b/vieille.webm' } },
    { id: 'jeune', createdAt: jour(89), voix: { chemin: 'b/jeune.webm' } },
    { id: 'deja', createdAt: jour(200), voix: { chemin: 'b/deja.webm', effaceeLe: jour(100) } },
    { id: 'ecrite', createdAt: jour(300) },
  ];
  dit('à 90 jours la voix s efface ; avant, non ; déjà effacée ou sans voix, rien', ['vieille'], voixAEffacer(demandes, maintenant).map((d) => d.id));
  dit('la limite est 90 jours avant maintenant', jour(90), new Date(limiteDeGarde(maintenant)).toISOString());
}
dit('après l envoi : dans la journée si la Maison est ouverte, sinon dès l ouverture', ['dans la journée', 'dès l’ouverture', 'dès l’ouverture'],
  [quandOnRappelle(true), quandOnRappelle(false), quandOnRappelle(null)]);

/* ── 2. LE BLOC RECOPIÉ DANS LA FONCTION ─────────────────────────────── */
{
  const bloc = (t: string) => { const m = /\/\* ⟨message-vocal⟩ \*\/[\s\S]*?\/\* ⟨\/message-vocal⟩ \*\//.exec(t); return m ? m[0] : 'absent'; };
  dit('la fonction porte le bloc de la règle, caractère pour caractère', bloc(lis('src/shared/message-vocal-pur.ts')), bloc(lis(SERVEUR)));
}

/* ── 3. LE VRAI CODE DU SERVEUR, SUR UNE FAUSSE BASE ─────────────────── */
function extrais(f: string, nom: string): string {
  const src = lis(f);
  const debut = src.indexOf(`// ── DEBUT ${nom}`);
  const fin = src.indexOf(`// ── FIN ${nom}`);
  if (debut < 0 || fin < debut) throw new Error(`${f} : le bloc ${nom} a disparu`);
  return src.slice(debut, fin);
}
type Rendu = { status: number; obj: Record<string, unknown> };
type Journal = { uploads: { b: string; chemin: string; taille: number; type?: string; upsert?: boolean }[]; removes: { b: string; chemins: string[] }[];
  inserts: { table: string; row: Record<string, unknown> }[]; upserts: { table: string; row: Record<string, unknown> }[]; updates: { table: string; row: Record<string, unknown>; id: unknown }[];
  accuses: Record<string, unknown>[]; alertes: unknown[][]; seaux: unknown[][]; fonds: Promise<unknown>[] };
function monte(o: { memes?: { id: string }[]; lignes?: unknown[]; insertRefuse?: boolean; limite?: boolean } = {}) {
  const j: Journal = { uploads: [], removes: [], inserts: [], upserts: [], updates: [], accuses: [], alertes: [], seaux: [], fonds: [] };
  const requete = (table: string) => {
    const filtres: [string, unknown][] = [];
    const q: Record<string, unknown> = {};
    Object.assign(q, {
      select: () => q, gte: () => q, lt: () => q,
      eq: (k: string, v: unknown) => { filtres.push([k, v]); return q; },
      limit: () => Promise.resolve({ data: filtres.some(([k]) => k === 'data->>telephone') ? (o.memes ?? []) : (o.lignes ?? []), error: null }),
      insert: (row: Record<string, unknown>) => { j.inserts.push({ table, row }); return Promise.resolve({ error: o.insertRefuse ? { message: 'refus' } : null }); },
      upsert: (row: Record<string, unknown>) => { j.upserts.push({ table, row }); return Promise.resolve({ error: null }); },
      update: (row: Record<string, unknown>) => ({ eq: (_k: string, id: unknown) => { j.updates.push({ table, row, id }); return Promise.resolve({ error: null }); } }),
    });
    return q;
  };
  const admin = {
    from: requete,
    storage: { from: (b: string) => ({
      upload: (chemin: string, octets: Uint8Array, opts: { contentType?: string; upsert?: boolean }) => { j.uploads.push({ b, chemin, taille: octets.length, type: opts.contentType, upsert: opts.upsert }); return Promise.resolve({ error: null }); },
      remove: (chemins: string[]) => { j.removes.push({ b, chemins }); return Promise.resolve({ error: null }); },
    }) },
  };
  const env: Record<string, unknown> = {
    admin,
    json: (obj: Record<string, unknown>, status = 200): Rendu => ({ status, obj }),
    allowRate: (_ip: string, seau: string, plafond: number) => { j.seaux.push([seau, plafond]); return Promise.resolve(!o.limite); },
    telephoneNormalise: (brut: string) => { const c = String(brut).replace(/\D/g, ''); return c.length >= 8 ? `+229${c}` : ''; },
    texte: (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max),
    brancheParDefaut: () => Promise.resolve({ id: 'br-maison', maitres: [], ligne: { id: 'br-maison' } }),
    envoieLAccuse: (a: Record<string, unknown>) => { j.accuses.push(a); return Promise.resolve('envoyé'); },
    alerteLePersonnel: (...a: unknown[]) => { j.alertes.push(a); return Promise.resolve(1); },
    auPlus: <T>(p: Promise<T>) => p,
    enTacheDeFond: (p: Promise<unknown>) => { j.fonds.push(p); },
    COFFRE_DES_VOIX, OCTETS_MAX_DE_LA_VOIX, OCTETS_MIN_DE_LA_VOIX, PROFIL_DU_VOCAL,
    formatDeLaVoix, cheminDeLaVoix, dureeBornee, dureeDite, limiteDeGarde, voixAEffacer,
  };
  const js = transformSync(extrais(SERVEUR, 'messageVocal'), { loader: 'ts', format: 'cjs' }).code;
  const noms = Object.keys(env);
  // eslint-disable-next-line no-new-func
  const f = new Function(...noms, `${js}; return { messageVocal, effaceLesVieillesVoix };`)(...noms.map((k) => env[k])) as {
    messageVocal: (req: Request, ip: string) => Promise<Rendu>; effaceLesVieillesVoix: (b: string) => Promise<void>;
  };
  return { ...f, j };
}
const formulaire = (o: { consentement?: string; telephone?: string; type?: string; taille?: number; sansVoix?: boolean } = {}) => {
  const f = new FormData();
  f.append('civilite', 'madame'); f.append('prenom', 'Clarisse'); f.append('nom', 'Dossou');
  f.append('telephone', o.telephone ?? '01 97 00 00 00'); f.append('duree', '42'); f.append('page', '/contact/');
  f.append('consentement', o.consentement ?? 'oui');
  if (!o.sansVoix) f.append('voix', new Blob([new Uint8Array(o.taille ?? 6000)], { type: o.type ?? 'audio/webm;codecs=opus' }), 'message.webm');
  return new Request('https://exemple.bj/functions/v1/demande-submit', { method: 'POST', body: f });
};

const essais = async () => {
  {
    const s = monte();
    const r = await s.messageVocal(formulaire(), '1.2.3.4');
    const demande = (s.j.inserts[0]?.row?.data ?? {}) as Record<string, unknown> & { voix?: Record<string, unknown> };
    dit('un message valide : reçu, la voix au coffre privé sous la branche et la demande, jamais écrasée', [200, true, 1, COFFRE_DES_VOIX, true, 'audio/webm', false],
      [r.status, r.obj.ok, s.j.uploads.length, s.j.uploads[0]?.b, /^br-maison\/dem-[0-9a-f-]+\.webm$/.test(s.j.uploads[0]?.chemin ?? ''), s.j.uploads[0]?.type, s.j.uploads[0]?.upsert]);
    dit('la demande « Message vocal » : genre prospect (la table n en connaît pas d autre), civilité, prénom, nom, numéro, voix et durée, consentement',
      ['prospect', 'Message vocal', 'madame', 'Clarisse', 'Dossou', '+2290197000000', 42, 6000, 'nouvelle', true, 'site'],
      [s.j.inserts[0]?.row?.genre, demande.profil, demande.civilite, demande.prenom, demande.nom, demande.telephone, demande.voix?.dureeS, demande.voix?.octets, demande.statut, !!demande.consentementLe, demande.source]);
    dit('le fil des Conversations le dit, depuis le site', ['messages_wa', 'site', true], [s.j.upserts[0]?.table, (s.j.upserts[0]?.row?.data as Record<string, unknown>)?.canal,
      /Message vocal depuis le site \(0:42\)/.test(String((s.j.upserts[0]?.row?.data as Record<string, unknown>)?.texte))]);
    dit('l accusé d une demande de rappel part (sa décision), sans place, et dit « votre message vocal »', [1, false, 'votre message vocal', 'madame'],
      [s.j.accuses.length, s.j.accuses[0]?.avecPlace, s.j.accuses[0]?.quand, s.j.accuses[0]?.civilite]);
    dit('l équipe est prévenue, vers Les demandes', ['Message vocal depuis le site', 'Clarisse Dossou · 0:42', '/trone/#/demandes'], s.j.alertes[0]);
    dit('un seau de débit à lui : quatre messages par dix minutes', [['vocal', 4]], s.j.seaux);
    dit('les vieilles voix s effacent en tâche de fond', 1, s.j.fonds.length);
  }
  const refus = async (nom: string, o: Parameters<typeof monte>[0], f: Request, statut: number, erreur: string) => {
    const s = monte(o);
    const r = await s.messageVocal(f, '1.2.3.4');
    dit(`${nom} : refusé, rien au coffre, rien en base`, [statut, erreur, 0, 0], [r.status, r.obj.error, s.j.uploads.length, s.j.inserts.length]);
  };
  await refus('sans la case cochée', {}, formulaire({ consentement: '' }), 400, 'consentement');
  await refus('un numéro illisible', {}, formulaire({ telephone: '12' }), 400, 'telephone');
  await refus('sans voix', {}, formulaire({ sansVoix: true }), 400, 'voix');
  await refus('une image au lieu d un son', {}, formulaire({ type: 'image/png' }), 415, 'format');
  await refus('un toucher par erreur (trop court)', {}, formulaire({ taille: 400 }), 400, 'trop_court');
  await refus('plus lourd qu un message de deux minutes', {}, formulaire({ taille: OCTETS_MAX_DE_LA_VOIX + 10 }), 413, 'too_large');
  await refus('trop de messages d un coup', { limite: true }, formulaire(), 429, 'rate_limited');
  {
    const s = monte({ memes: [{ id: 'dem-premier' }] });
    const r = await s.messageVocal(formulaire(), '1.2.3.4');
    dit('touché deux fois : le premier envoi est rendu, rien ne se double', [true, 'dem-premier', true, 0, 0], [r.obj.ok, r.obj.id, r.obj.deja, s.j.uploads.length, s.j.accuses.length]);
  }
  {
    const s = monte({ insertRefuse: true });
    const r = await s.messageVocal(formulaire(), '1.2.3.4');
    dit('la base refuse la demande : la voix repart du coffre (une voix sans demande ne se retrouverait jamais), aucun accusé', [500, 1, s.j.uploads[0]?.chemin, 0],
      [r.status, s.j.removes.length, s.j.removes[0]?.chemins?.[0], s.j.accuses.length]);
  }
  {
    const vieux = new Date(Date.now() - 100 * 86_400_000).toISOString();
    const jeune = new Date(Date.now() - 10 * 86_400_000).toISOString();
    const s = monte({ lignes: [
      { id: 'dem-vieux', data: { createdAt: vieux, profil: PROFIL_DU_VOCAL, voix: { chemin: 'br-maison/dem-vieux.webm' } } },
      { id: 'dem-jeune', data: { createdAt: jeune, profil: PROFIL_DU_VOCAL, voix: { chemin: 'br-maison/dem-jeune.webm' } } },
    ] });
    await s.effaceLesVieillesVoix('br-maison');
    const maj = s.j.updates[0];
    dit('à 90 jours : la vieille voix part du coffre, la jeune reste ; la demande garde sa ligne et dit quand', [['br-maison/dem-vieux.webm'], 'dem-vieux', true, 'br-maison/dem-vieux.webm', 1],
      [s.j.removes[0]?.chemins, maj?.id, !!((maj?.row?.data as Record<string, unknown>)?.voix as Record<string, unknown>)?.effaceeLe,
        ((maj?.row?.data as Record<string, unknown>)?.voix as Record<string, unknown>)?.chemin, s.j.updates.length]);
  }
};

/* ── 4. LE CODE AUTOUR ────────────────────────────────────────────────── */
const ecrans = () => {
  const srv = lis(SERVEUR);
  const corps = srv.slice(srv.indexOf('Deno.serve('));
  dit('la voix passe AVANT la lecture JSON plafonnée à 5 000 caractères', true,
    corps.indexOf("startsWith('multipart/form-data')) return await messageVocal(req, ip)") > 0
    && corps.indexOf("startsWith('multipart/form-data')) return await messageVocal(req, ip)") < corps.indexOf('const corps = await req.text()'));
  dit('le serveur se dit 2026-10-19-a ou plus récent', true, (/const VERSION = '([^']+)'/.exec(srv)?.[1] ?? '') >= '2026-10-19-a');
  const sql = lis('supabase/migrations/0135_les_voix_du_site.sql').replace(/--.*$/gm, '');
  dit('le coffre des voix : privé, 3,5 Mo au plus, sons seuls ; l équipe écoute, la direction efface ; personne n y dépose depuis un navigateur', [true, true, true, true, false],
    [/'voix-du-site', 'voix-du-site', false, 3500000/.test(sql), /for select to authenticated[\s\S]{0,120}public\.is_staff\(\)/.test(sql),
      /for delete to authenticated[\s\S]{0,120}public\.est_direction\(\)/.test(sql), /array\['audio\/webm'/.test(sql), /for (insert|update|all)\b/.test(sql)]);
  const ilot = sansCommentaires(lis('src/apps/revelateur/ilots/MessageVocal.tsx'));
  dit('le site : la case avant l envoi, l arrêt seul à deux minutes, le micro refusé mène à WhatsApp, la voix part à demande-submit', [true, true, true, true, true],
    [/if \(!consent\) \{ setErreur\(/.test(ilot), /if \(s >= DUREE_MAX_DE_LA_VOIX_S\) arreter\(\);/.test(ilot), /microRefuse \? \([\s\S]{0,400}href=\{wa\}/.test(ilot),
      /supabase\.functions\.invoke\('demande-submit', \{ body: f \}\)/.test(ilot), /f\.append\('voix', voix,/.test(ilot)]);
  dit('le merci appelle comme la Maison (jamais « Madame » supposé) et ne promet pas plus que l heure', [true, true],
    [/appelDe\(civilite \? \{ name: prenom, civilite \} : \{ name: prenom \}\)/.test(ilot), /quandOnRappelle\(maisonOuverte\)/.test(ilot)]);
  dit('où : la carte « Nous écrire » de la page Contact, et la colonne de /rappel/ seulement (sa décision)', [true, true, true],
    [/<MessageVocal \/>/.test(sansCommentaires(lis('src/apps/revelateur/ilots/Joindre.tsx'))),
      /\$\{rappel \? '<div data-ilot="vocal" data-genre="carte"><\/div>' : ''\}/.test(lis('scripts/genere-revelateur.mjs')),
      /vocal: \(\) => import\('\.\/ilots\/MessageVocal'\)/.test(lis('src/apps/revelateur/monte.tsx'))]);
  dit('la page Confidentialité dit le message vocal et ses 90 jours', true, /<b>Le message vocal\.<\/b>[^<]*90 jours/.test(lis('scripts/genere-revelateur.mjs')));
  const voix = sansCommentaires(lis('src/apps/trone/routes/clients/VoixDeLaDemande.tsx'));
  const dem = sansCommentaires(lis('src/apps/trone/routes/clients/Demandes.tsx'));
  dit('le Trône : on écoute par une adresse signée de dix minutes ; la purge des 90 jours est à la direction ; supprimer emporte la voix', [true, true, true, true],
    [/createSignedUrl\(v\.chemin, 600\)/.test(voix), /if \(!estDirection \|\| purgee\.current/.test(dem), /voixAEffacer\(toutes, Date\.now\(\)\)/.test(dem),
      /if \(d\.voix\?\.chemin && !d\.voix\.effaceeLe && supabase\) void supabase\.storage\.from\(COFFRE_DES_VOIX\)\.remove\(\[d\.voix\.chemin\]\)/.test(dem)]);
};

await essais();
ecrans();
if (ko) { console.error(`\n${ko} controle(s) en echec.`); process.exit(1); }
console.log('\nLe message vocal tient.');
