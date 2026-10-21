/* LA FÊTE DE COURONNE, ÉPROUVÉE — `node scripts/verifie-la-fete-de-couronne.mjs`.

   Le Club des Petites Couronnes (MND Kids), validé par Yéman le 21 octobre
   2026, lot 5 : « Au jour anniversaire de sa Première Couronne, un mot sur
   WhatsApp aux parents. À sa visite suivante : une photo pour le carnet, une
   coiffure de fête s'il le veut, et un diplôme. » Contrat commun du Club :
   l'anniversaire est le jour et le mois du PREMIER rendez-vous honoré qui
   porte la Première Couronne Kids (`sv-kids-vekpe` ou `sv-kids-naissance`),
   chaque année à partir d'un an ; sans elle, pas d'anniversaire.

   On éprouve :
     1. la règle, telle qu'elle a été dite (jamais tirée du code) ;
     2. la VRAIE tournée de `fete-de-couronne`, extraite telle quelle et
        rejouée contre une base simulée ;
     3. la fonction : santé, clé du cron, modèle, date métier ;
     4. la copie bornée contre `src/shared/club-pur.ts`, quand le lot du
        Trône l'a écrite (sinon : SAUTE, dit tel quel).

   Tout est inventé : Ama, sa Première Couronne Kids le 21 octobre 2025 ;
   Abla paie pour son foyer.

   Sortie ASCII : la console de Windows ne connaît pas les accents. */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { transformSync } from 'esbuild';

let ko = 0;
let n = 0;
const ascii = (v: unknown): string =>
  (JSON.stringify(v) ?? 'undefined').replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  const nomAscii = nom.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '?');
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nomAscii}${ok ? '' : ` -> ${ascii(obtenu)}`}`);
  if (!ok) console.log(`       attendu ${ascii(attendu)}`);
};
const lis = (f: string) => readFileSync(f, 'utf8').split(String.fromCharCode(13)).join('');
const FETE = 'supabase/functions/fete-de-couronne/index.ts';
function extrais(nom: string): string {
  const src = lis(FETE);
  const debut = src.indexOf(`// ── DEBUT ${nom}`);
  const fin = src.indexOf(`// ── FIN ${nom}`);
  if (debut < 0 || fin < debut) throw new Error(`${FETE} : le bloc ${nom} a disparu`);
  return src.slice(debut, fin);
}
/* eslint-disable @typescript-eslint/no-explicit-any */
type Fn = (...a: any[]) => any;
const js = transformSync(extrais('tournee'), { loader: 'ts' }).code;
const F = new Function(`${js}; return { tournee, premiereCouronneKids, anneesDeCouronne, anniversaireEn, fetesDuJour, idDeLaFete,
  variablesDeLaFete, texteDeLaFete, anneesDites, destinataireDeLaFete, jourDitAvecLAnnee, HEURE_DE_LA_FETE, JOURS_DE_RATTRAPAGE };`)() as Record<string, Fn>;

/* ── 1. LA RÈGLE, TELLE QU'ELLE A ÉTÉ DITE ── */
type Rdv = { id: string; clientId: string; date: string; status: string; serviceIds: string[] };
const rdv = (id: string, clientId: string, date: string, serviceIds: string[], status = 'honoré'): Rdv => ({ id, clientId, date, status, serviceIds });
const AMA: Rdv[] = [
  rdv('r0', 'k-ama', '2025-09-30', ['sv-kids-vekpe'], 'annulé'),
  rdv('r1', 'k-ama', '2025-10-21', ['sv-kids-vekpe']),
  rdv('r2', 'k-ama', '2025-11-04', ['sv-kids-retouche']),
  rdv('r3', 'k-ama', '2026-01-10', ['sv-kids-naissance']),
];
dit('la Premiere Couronne : le PREMIER rendez-vous honore qui la porte (une annulee, une autre prestation ne comptent pas)', '2025-10-21', F.premiereCouronneKids(AMA, 'k-ama'));
dit('... le pack de naissance la porte aussi', '2026-01-10', F.premiereCouronneKids([rdv('x', 'k-b', '2026-01-10', ['sv-kids-naissance', 'sv-kids-kloklo'])], 'k-b'));
dit('... sans Premiere Couronne Kids a la Maison, pas d anniversaire', null, F.premiereCouronneKids([rdv('x', 'k-c', '2025-05-02', ['sv-kids-sinsin'])], 'k-c'));
dit('... un rendez-vous a venir (confirme) ne compte pas', null, F.premiereCouronneKids([rdv('x', 'k-d', '2026-12-02', ['sv-kids-vekpe'], 'confirmé')], 'k-d'));
dit('l anniversaire : un an le meme jour et le meme mois, rien la veille, deux ans l annee d apres, rien le jour meme de la pose',
  [1, 0, 2, 0], [F.anneesDeCouronne('2025-10-21', '2026-10-21'), F.anneesDeCouronne('2025-10-21', '2026-10-20'), F.anneesDeCouronne('2025-10-21', '2027-10-21'), F.anneesDeCouronne('2025-10-21', '2025-10-21')]);
dit('un 29 fevrier se fete le 28 les annees communes, le 29 les bissextiles',
  [1, 0, 4, 0], [F.anneesDeCouronne('2024-02-29', '2025-02-28'), F.anneesDeCouronne('2024-02-29', '2025-03-01'), F.anneesDeCouronne('2024-02-29', '2028-02-29'), F.anneesDeCouronne('2024-02-29', '2028-02-28')]);
dit('les annees dites en lettres jusqu a quinze', ['un an', 'deux ans', 'quinze ans', '16 ans'], [1, 2, 15, 16].map(F.anneesDites));
dit('la date dite porte son annee', 'mardi 21 octobre 2025', F.jourDitAvecLAnnee('2025-10-21'));
dit('la fete part a partir de 10 h, et un cron manque se rattrape dans les trois jours', [10, 3], [F.HEURE_DE_LA_FETE, F.JOURS_DE_RATTRAPAGE]);
dit('les fetes du jour : le jour meme, deux jours apres (rattrapage), rien quatre jours apres',
  [[{ enfantId: 'k-ama', premiereLe: '2025-10-21', leJour: '2026-10-21', annees: 1 }], [{ enfantId: 'k-ama', premiereLe: '2025-10-21', leJour: '2026-10-21', annees: 1 }], []],
  ['2026-10-21', '2026-10-23', '2026-10-25'].map((j) => F.fetesDuJour(AMA, j)));
dit('un enfant, une annee, un message : l identifiant porte l annee',
  ['fc-k-ama-2026-whatsapp', 'fc-k-ama-2027-whatsapp'],
  [F.idDeLaFete({ enfantId: 'k-ama', premiereLe: '2025-10-21', leJour: '2026-10-21', annees: 1 }), F.idDeLaFete({ enfantId: 'k-ama', premiereLe: '2025-10-21', leJour: '2027-10-21', annees: 2 })]);

/* ── 2. LA VRAIE TOURNÉE, CONTRE UNE BASE SIMULÉE ── */
type Ligne = { id?: string; key?: string; branch_id?: string | null; data: any };
function base(tables: Record<string, Ligne[]>) {
  const T = new Map<string, Ligne[]>(Object.entries(tables).map(([k, v]) => [k, structuredClone(v)]));
  const ecrit: { t: string; op: string; id?: string }[] = [];
  const lignes = (t: string) => { if (!T.has(t)) T.set(t, []); return T.get(t)!; };
  const val = (l: Ligne, c: string): string | null | undefined => {
    if (c === 'id') return l.id; if (c === 'key') return l.key;
    if (c.startsWith('data->>')) { const v = l.data?.[c.slice(7)]; return v == null ? null : String(v); }
    return undefined;
  };
  /* jsonb @> : chaque clé de l'objet attendu est contenue (tableaux : chaque élément présent). */
  const contient = (v: any, attendu: any): boolean => {
    if (Array.isArray(attendu)) return Array.isArray(v) && attendu.every((x) => v.some((y: unknown) => contient(y, x)));
    if (attendu && typeof attendu === 'object') return !!v && typeof v === 'object' && Object.entries(attendu).every(([k, x]) => contient(v[k], x));
    return v === attendu;
  };
  const sb = {
    from(t: string) {
      const requete = () => {
        const filtres: ((l: Ligne) => boolean)[] = [];
        let de = 0; let a = Infinity;
        const q = {
          select() { return q; },
          eq(c: string, v: unknown) { filtres.push((l) => val(l, c) === String(v)); return q; },
          in(c: string, vs: unknown[]) { const s = new Set(vs.map(String)); filtres.push((l) => s.has(String(val(l, c)))); return q; },
          contains(c: string, v: unknown) { filtres.push((l) => c === 'data' && contient(l.data, v)); return q; },
          range(x: number, y: number) { de = x; a = y; return q; },
          then(ok: (v: unknown) => unknown, ko2?: (e: unknown) => unknown) {
            const rows = lignes(t).filter((l) => filtres.every((f) => f(l))).slice(de, a + 1).map((l) => structuredClone(l));
            return Promise.resolve({ data: rows, error: null }).then(ok, ko2);
          },
        };
        return q;
      };
      return {
        select: () => requete(),
        upsert(l: Ligne) { const Lg = lignes(t); const i = Lg.findIndex((x) => x.id === l.id); if (i >= 0) Lg[i] = structuredClone(l); else Lg.push(structuredClone(l)); ecrit.push({ t, op: 'upsert', id: l.id }); return Promise.resolve({ error: null }); },
      };
    },
  };
  return { sb, T, ecrit, lignes };
}
const rdvL = (r: Rdv): Ligne => ({ id: r.id, branch_id: 'b1', data: r });
const ficheL = (id: string, data: Record<string, unknown>): Ligne => ({ id, branch_id: 'b1', data: { branchId: 'b1', ...data } });
const facteur = (ms: number, vivant = true): Ligne => ({ key: 'mnd_facteur', data: { vuLe: new Date(ms - (vivant ? 60_000 : 3_600_000)).toISOString() } });
/** Mercredi 21 octobre 2026, 10 h 05 à Cotonou. */
const JOUR_J = Date.parse('2026-10-21T09:05:00Z');
const MODELE = 'fete_de_couronne';
const ama = (extra: Record<string, unknown> = {}) => ficheL('k-ama', { name: 'Ama Essai', familyId: 'f1', birthday: '2018-03-02', ...extra });
const abla = (extra: Record<string, unknown> = {}) => ficheL('p-abla', { name: 'Abla Essai', civilite: 'madame', phone: '0197000001', familyId: 'f1', ...extra });
const monde = (ms = JOUR_J, extra: Partial<Record<string, Ligne[]>> = {}): Record<string, Ligne[]> => ({
  documents: [facteur(ms), { key: 'mnd_auto_config', data: { salleMin: 10, calmeDe: 20, calmeA: 8 } }],
  appointments: AMA.map(rdvL),
  clients: [ama(), abla()],
  families: [{ id: 'f1', data: { payerClientId: 'p-abla' } }],
  envois: [],
  ...extra,
});
const joue = async (tables: Record<string, Ligne[]>, o: { maintenantMs?: number; modele?: string; WA?: boolean; envoie?: unknown } = {}) => {
  const b = base(tables);
  const r = await F.tournee(b.sb, { maintenantMs: o.maintenantMs ?? JOUR_J, MODELE_FETE: o.modele ?? MODELE, WA_TOKEN: o.WA ? 't' : '', WA_PHONE_ID: o.WA ? 'p' : '', envoie: o.envoie });
  return { r: r as Record<string, any>, ...b };
};
const envois = (b: { lignes: (t: string) => Ligne[] }) => b.lignes('envois');

{
  const j = await joue(monde());
  const e = envois(j)[0]?.data;
  dit('le jour J a 10 h 05 : un message, depose « en-attente » dans la salle', [1, 1, 'en-attente'], [j.r.messages, envois(j).length, e?.statut]);
  dit('... a celle qui paie pour le foyer, sur son numero, au modele de la fete',
    ['p-abla', '22901970000' + '01', MODELE, 'fete-de-couronne', 'k-ama'], [e?.clientId, e?.colis?.numero, e?.colis?.modele, e?.type, e?.teteId]);
  dit('... les quatre variables : son appel, le prenom de l enfant, ses annees, le jour de sa Premiere Couronne avec l annee',
    ['Madame Abla', 'Ama', 'un an', 'mardi 21 octobre 2025'], e?.colis?.composants?.[0]?.parameters?.map((p: { text: string }) => p.text));
  const texte = String(e?.colis?.texteAuFil ?? '');
  dit('... le texte du fil : la fete, la prochaine visite, l annee ; ni tiret cadratin, ni « salon », ni « code », ni numero de piece',
    [true, true, true, false, false, false, false],
    [/Joyeux anniversaire de couronne/.test(texte), /une photo pour son carnet, un diplôme, et une coiffure de fête/.test(texte), /2025/.test(texte),
      /—/.test(texte), /salon/i.test(texte), /\bcode\b/i.test(texte), /\b(MND|F|ABO)-\d/.test(texte)]);
  dit('... l identifiant : un enfant, une annee', 'fc-k-ama-2026-whatsapp', envois(j)[0]?.id);
  dit('... le depot attend la salle (dix minutes), hors des heures calmes', [true, undefined],
    [Date.parse(e?.partA) - Date.parse(e?.deposeLe) === 10 * 60_000, e?.calme]);

  const deux = await joue({ ...monde(), envois: envois(j) });
  dit('un deuxieme passage le meme jour ne repose rien', [0, 1, 0], [deux.r.messages, deux.r.deja, deux.ecrit.length]);
  const rate = await joue({ ...monde(), envois: [{ id: 'fc-k-ama-2026-whatsapp', data: { statut: 'échec' } }] });
  dit('... seul un echec se retente', [1, 'en-attente'], [rate.r.messages, envois(rate)[0]?.data?.statut]);
}
{
  const tot = await joue(monde(), { maintenantMs: Date.parse('2026-10-21T08:30:00Z') });
  dit('a 9 h 30, rien encore : la fete part a partir de 10 h', ['pas-encore', 0], [tot.r.messages, tot.ecrit.length]);
  const sans = await joue(monde(), { modele: '' });
  dit('sans son modele (le secret), rien ne part', ['sans-modele', 0], [sans.r.messages, sans.ecrit.length]);
  const rattrape = await joue(monde(Date.parse('2026-10-23T09:05:00Z')), { maintenantMs: Date.parse('2026-10-23T09:05:00Z') });
  dit('un cron manque se rattrape deux jours apres, avec le jour de la fete', [1, '2026-10-21', 'fc-k-ama-2026-whatsapp'],
    [rattrape.r.messages, envois(rattrape)[0]?.data?.anniversaire, envois(rattrape)[0]?.id]);
  const trop = await joue(monde(Date.parse('2026-10-25T09:05:00Z')), { maintenantMs: Date.parse('2026-10-25T09:05:00Z') });
  dit('... mais quatre jours apres, la fete ne ressort pas', [0, 0], [trop.r.messages, trop.ecrit.length]);
  const anDeux = Date.parse('2027-10-21T09:05:00Z');
  const an2 = await joue({ ...monde(anDeux), envois: [{ id: 'fc-k-ama-2026-whatsapp', data: { statut: 'envoyé' } }] }, { maintenantMs: anDeux });
  dit('l annee d apres, une nouvelle fete : deux ans', [1, 'fc-k-ama-2027-whatsapp', 'deux ans'],
    [an2.r.messages, envois(an2).find((l) => l.id === 'fc-k-ama-2027-whatsapp')?.id, envois(an2).find((l) => l.id === 'fc-k-ama-2027-whatsapp')?.data?.colis?.composants?.[0]?.parameters?.[2]?.text]);
}
{
  const seul = await joue(monde(JOUR_J, { clients: [ama({ familyId: undefined, phone: '0197000002' })], families: [] }));
  dit('sans foyer mais avec un numero sur sa fiche : aux parents par ce numero, « Madame, Monsieur »',
    [1, '2290197000002', 'Madame, Monsieur'], [seul.r.messages, envois(seul)[0]?.data?.colis?.numero, envois(seul)[0]?.data?.colis?.composants?.[0]?.parameters?.[0]?.text]);
  const muet = await joue(monde(JOUR_J, { clients: [ama({ familyId: undefined })], families: [] }));
  dit('aucun numero nulle part : rien ne part, et la tournee le dit', [0, 1, 0], [muet.r.messages, muet.r.sautes?.['sans-numero'], muet.ecrit.length]);
  const archivee = await joue(monde(JOUR_J, { clients: [ama({ archived: true }), abla()] }));
  dit('une fiche d enfant archivee : rien', [0, 1], [archivee.r.messages, archivee.r.sautes?.archivee]);
  const payeurParti = await joue(monde(JOUR_J, { clients: [ama({ phone: '0197000002' }), abla({ archived: true })] }));
  dit('celle qui paie est archivee : le numero de la fiche de l enfant', [1, '2290197000002'], [payeurParti.r.messages, envois(payeurParti)[0]?.data?.colis?.numero]);
  const reprise = await joue(monde(JOUR_J, { appointments: [rdvL(rdv('z', 'k-ama', '2025-10-21', ['sv-kids-sinsin']))] }));
  dit('une reprise seule n est pas une Premiere Couronne : rien', [0, 0], [reprise.r.messages, reprise.ecrit.length]);
  const deux = await joue(monde(JOUR_J, {
    appointments: [...AMA.map(rdvL), rdvL(rdv('s1', 'k-sena', '2024-10-21', ['sv-kids-naissance']))],
    clients: [ama(), abla(), ficheL('k-sena', { name: 'Sena Essai', familyId: 'f1' })],
  }));
  const prenoms = envois(deux).map((l) => `${l.data?.colis?.composants?.[0]?.parameters?.[1]?.text} ${l.data?.colis?.composants?.[0]?.parameters?.[2]?.text}`).sort();
  dit('deux enfants du meme foyer le meme jour : deux messages, chacun nomme le sien', [2, ['Ama un an', 'Sena deux ans']], [deux.r.messages, prenoms]);
}
{
  const vus: { url: string; corps: any }[] = [];
  const faux = (async (url: string, init: { body: string }) => { vus.push({ url, corps: JSON.parse(init.body) }); return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.X' }] }) }; }) as unknown;
  const direct = await joue(monde(JOUR_J, { documents: [facteur(JOUR_J, false)] }), { WA: true, envoie: faux });
  dit('le facteur se tait : envoi direct au modele, quatre variables, journal « envoye » et fil du Trone',
    [1, MODELE, 4, 'envoyé', 1], [direct.r.messages, vus[0]?.corps?.template?.name, vus[0]?.corps?.template?.components?.[0]?.parameters?.length,
      envois(direct)[0]?.data?.statut, direct.lignes('messages_wa').length]);
  const nuit = await joue(monde(Date.parse('2026-10-21T20:05:00Z'), { documents: [facteur(Date.parse('2026-10-21T20:05:00Z'), false)] }), { maintenantMs: Date.parse('2026-10-21T20:05:00Z'), WA: true, envoie: faux });
  dit('... mais jamais pendant les heures calmes', [0, 1], [nuit.r.messages, nuit.r.sautes?.['heures-calmes']]);
  const sansRien = await joue(monde(JOUR_J, { documents: [facteur(JOUR_J, false)] }));
  dit('ni facteur ni jeton WhatsApp : rien', 'sans-facteur', sansRien.r.messages);
}
{
  const N = 45;
  const beaucoup = await joue(monde(JOUR_J, {
    appointments: Array.from({ length: N }, (_, i) => rdvL(rdv(`b${i}`, `k${i}`, '2025-10-21', ['sv-kids-vekpe']))),
    clients: Array.from({ length: N }, (_, i) => ficheL(`k${i}`, { name: `Enfant${i} Essai`, phone: `01970000${String(i).padStart(2, '0')}` })),
    families: [],
  }));
  dit('une borne de quarante messages par passage', [40, 40], [beaucoup.r.messages, beaucoup.r.borne]);
}

/* ── 3. LA FONCTION ── */
{
  const src = lis(FETE);
  const tournee = extrais('tournee');
  dit('la sante (GET) dit la version et la longueur du secret du modele, sans rien lancer', true,
    /if \(req\.method === 'GET'\)[\s\S]*WA_TEMPLATE_FETE_DE_COURONNE: MODELE_FETE\.length/.test(src));
  dit('seul le cron, arme de la cle service, la reveille', true, /if \(!service \|\| cleRecue !== service\) \{\s*return json\(\{ erreur: 'réservé au cron'/.test(src));
  dit('le modele vient du secret, jamais ecrit en dur dans la tournee', [true, false],
    [/Deno\.env\.get\('WA_TEMPLATE_FETE_DE_COURONNE'\)/.test(src), /'fete_de_couronne'/.test(tournee)]);
  dit('la date metier juge : la tournee ne lit jamais updated_at', false, /updated_at/.test(tournee));
  dit('la copie d appelDe et de la salle est celle de rappels-d-echeance, mot pour mot', true,
    (() => { const r = lis('supabase/functions/rappels-d-echeance/index.ts'); const a = r.indexOf('/** Numéro béninois'); const b = r.indexOf('// ── DEBUT echeances'); return src.includes(r.slice(a, b).trimEnd()); })());
  dit('aucune date affichee sans son annee : la seule date dite passe par jourDitAvecLAnnee', true, /jourDitAvecLAnnee\(o\.premiereLe\)/.test(src));
}

/* ── 4. LA COPIE BORNÉE CONTRE src/shared/club-pur.ts ── */
{
  const chemin = process.env.CLUB_PUR_PAQUET;
  if (!chemin) {
    console.log('SAUTE parite : src/shared/club-pur.ts absent (le lot du Trone l ecrit) ; la copie bornee suit le contrat du Club.');
  } else {
    const C = await import(pathToFileURL(chemin).href) as Record<string, unknown>;
    const releve = C.releveDuClub as Fn | undefined;
    if (typeof releve !== 'function') {
      console.log(`SAUTE parite : club-pur.ts n exporte pas releveDuClub (exports : ${Object.keys(C).join(', ')}) ; a aligner.`);
    } else {
      dit('parite : les prestations de la Premiere Couronne Kids sont les memes', [...(C.PREMIERE_COURONNE_KIDS as string[])].sort(), ['sv-kids-naissance', 'sv-kids-vekpe']);
      /* Ce que l'original dit de l'anniversaire, pour une fiche et un jour :
         le jour de sa Première Couronne, et ses années si c'est aujourd'hui. */
      const original = (r: readonly Rdv[], id: string, jour: string): [string | null, number] => {
        const a = (releve({ jour, fiche: { id }, appts: r, services: new Map() }) as { anniversaire?: { premiereCouronne: string; ans: number; aujourdhui: boolean } }).anniversaire;
        return [a?.premiereCouronne ?? null, a?.aujourdhui ? a.ans : 0];
      };
      const copie = (r: readonly Rdv[], id: string, jour: string): [string | null, number] => {
        const p = F.premiereCouronneKids(r, id);
        return [p, p ? F.anneesDeCouronne(p, jour) : 0];
      };
      const cas: [Rdv[], string, string][] = [];
      const fevrier = [rdv('f', 'k-f', '2024-02-29', ['sv-kids-vekpe'])];
      const naissance = [rdv('n', 'k-n', '2026-01-10', ['sv-kids-naissance'])];
      const reprise = [rdv('s', 'k-s', '2025-05-02', ['sv-kids-sinsin'])];
      for (const jour of ['2025-10-21', '2026-10-20', '2026-10-21', '2026-10-22', '2027-10-21', '2026-01-10', '2027-01-10', '2025-02-28', '2025-03-01', '2028-02-28', '2028-02-29']) {
        cas.push([AMA, 'k-ama', jour], [fevrier, 'k-f', jour], [naissance, 'k-n', jour], [reprise, 'k-s', jour]);
      }
      dit(`parite : la copie bornee dit ce que dit releveDuClub (${cas.length} cas : fiche, jour)`,
        cas.map(([r, id, j]) => original(r, id, j)), cas.map(([r, id, j]) => copie(r, id, j)));
    }
  }
}

console.log(ko === 0 ? `\nLa fete de couronne tient sa promesse (${n} epreuves).` : `\n${ko} echec(s).`);
if (ko) process.exit(1);
