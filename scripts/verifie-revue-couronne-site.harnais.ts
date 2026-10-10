/* LA REVUE DU 10 OCTOBRE 2026, LOT « COURONNE-SITE », ÉPROUVÉE —
   `node scripts/verifie-revue-couronne-site.mjs` (et `--prouve`).

   Dix-huit constats de la revue de code, sur Ma Couronne, le site, la
   Consultation, l'Académie et deux pièces du ds. Chaque cas porte le numéro
   du constat : le lanceur, en `--prouve`, remet chaque faute une à une et
   exige que le cas de CE numéro crie.

   Les règles sont tenues sur le VRAI code : les juges purs sont appelés, le
   calendrier du site tourne contre un faux client (aucun réseau), et ce qui
   est un texte ou une garde d'écran se lit dans la source, commentaires
   effacés, motifs en String.raw. Les attendus sont écrits en dur ici, jamais
   tirés du code éprouvé. */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { heureHabituelle, naitConfirme, relisLesMurs } from '../src/apps/couronne/reservation-pure';
import { TABLES_DU_CARNET, ficheIntrouvable, lectureDesRdvEnEchec } from '../src/apps/couronne/fiche-pure';
import { agendaDeLaMaison, calendrierDuSite, jourDit, prochainsJours } from '../src/apps/revelateur/agenda';
import { raisonDuRefus } from '../src/apps/revelateur/refus-du-serveur';
import {
  ACCES_VIDE, accesApresDepot, accesApresLeWidget, accesSansVerdict, voieDAcces, type Access,
} from '../src/apps/consultation/acces-pur';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko += 1;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};
const brut = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
/** La source sans ses commentaires : un mot dans un commentaire ne s'affiche pas. */
const source = (f: string) => brut(f)
  /* « image/* » dans un attribut n'ouvre pas un commentaire. */
  .replace(/\/\*(["'`])/g, '$1')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');
const contient = (texte: string, motif: RegExp) => motif.test(texte);

/* ══ n94 · un RDV ne naît confirmé que sur des murs connus et une place libre ══ */
const base = { acompteVerifie: false, acompteDemande: false, mursConnus: true, seancesToujoursLibres: true };
dit('n94 sans acompte, murs connus, place libre : confirme', true, naitConfirme(base));
dit('n94 murs du serveur pas encore la (ou en erreur) : en attente', false, naitConfirme({ ...base, mursConnus: false }));
dit('n94 la seance n est plus libre au dernier mot : en attente', false, naitConfirme({ ...base, seancesToujoursLibres: false }));
dit('n94 acompte annonce, pas prouve : en attente', false, naitConfirme({ ...base, acompteDemande: true }));
dit('n94 acompte encaisse et verifie : confirme meme sans murs', true, naitConfirme({ ...base, acompteDemande: true, acompteVerifie: true, mursConnus: false }));
/* REPRISE DU 10 OCTOBRE : les murs se RELISENT au serveur au moment d'écrire.
   L'agenda du montage est périmé dès qu'une autre cliente réserve. */
{
  const mur = { jour: '2026-10-14', maitre: 'Team', debut: '14:00', duree: 60 };
  dit('n94 relisLesMurs : une reponse lisible rend les murs du moment', [mur], await relisLesMurs(async () => ({ data: [mur], error: null })));
  dit('n94 relisLesMurs : une erreur du serveur laisse les murs INCONNUS', null, await relisLesMurs(async () => ({ data: null, error: { message: 'reseau' } })));
  dit('n94 relisLesMurs : une exception aussi', null, await relisLesMurs(async () => { throw new Error('Failed to fetch'); }));
  dit('n94 relisLesMurs : une reponse illisible aussi', null, await relisLesMurs(async () => ({ data: { pas: 'une liste' }, error: null })));
  dit('n94 relisLesMurs : aucun mur ce jour-la', [], await relisLesMurs(async () => ({ data: null, error: null })));
  dit('n94 relisLesMurs : sans serveur du tout (demo), aucun mur', [], await relisLesMurs(null));
  let appels = 0;
  await relisLesMurs(async () => { appels += 1; return { data: [], error: null }; });
  dit('n94 relisLesMurs appelle vraiment le serveur, une fois', 1, appels);
}
{
  const b = source('src/apps/couronne/Booking.tsx');
  const finalize = /const finalize = async \(\) => \{[\s\S]*?\n {4}\};/.exec(b)?.[0] ?? '';
  dit('n94 settle juge par naitConfirme, sur les murs RELUS', true,
    contient(finalize, new RegExp(String.raw`const tenu = naitConfirme\(\{\s*acompteVerifie: !!online\?\.confirmed,\s*acompteDemande: hasDeposit,\s*mursConnus: mursFrais !== null,\s*seancesToujoursLibres,\s*\}\)`)));
  dit('n94 les murs se redemandent a creneaux_occupes sur les jours des seances', true,
    contient(finalize, new RegExp(String.raw`const mursFrais = peutNaitreConfirme\s*\? await relisLesMurs\(sb \? \(\) => sb\.rpc\('creneaux_occupes', \{\s*p_branch: branch\.id, p_du: joursDesSeances\[0\], p_au: joursDesSeances\[joursDesSeances\.length - 1\],\s*\}\) : null\)\s*: null;`)));
  dit('n94 ... seule une place qui peut naitre confirmee les attend', true,
    contient(finalize, new RegExp(String.raw`const peutNaitreConfirme = !online\?\.confirmed && !hasDeposit;`)));
  dit('n94 la place relue l est contre les murs frais, seance par seance', true,
    contient(finalize, new RegExp(String.raw`const seancesToujoursLibres = mursFrais !== null && sessionDates\.every\(\(sd\) =>\s*freeSlots\(sd\.iso, master, totalDuration, appts, tousServices, branch\.id, mursFrais\)\.includes\(sd\.time\)\)`)));
  dit('n94 ... la relecture vient AVANT le jugement', true,
    finalize.indexOf('await relisLesMurs(') > 0 && finalize.indexOf('await relisLesMurs(') < finalize.indexOf('const tenu = naitConfirme('));
  dit('n94 plus rien ne juge la place sur l agenda du montage', [false, false],
    [contient(finalize, /mursConnus: occupesCharges/), contient(finalize, /branch\.id, occupes\)\.includes\(sd\.time\)/)]);
  dit('n94 plus aucun tenu tire du seul acompte', false, contient(b, new RegExp(String.raw`const tenu = !!online\?\.confirmed \|\| !hasDeposit`)));
  dit('n94 un second appui pendant la relecture ne pose pas un second RDV', true,
    contient(b, new RegExp(String.raw`if \(ecritureEnCours\.current\) return;\s*ecritureEnCours\.current = true;\s*setPaying\(true\);\s*void finalize\(\)`))
      && contient(b, new RegExp(String.raw`\.finally\(\(\) => \{ ecritureEnCours\.current = false; \}\)`)));
  dit('n94 l ecran de fin dit le statut tel qu il est ne', true,
    contient(b, new RegExp(String.raw`onlinePaid\?\.ok \|\| \(!hasDeposit && neTenu\) \? t\('Confirmé'\)`)));
}

/* ══ n95 · une heure habituelle a la demi-heure ne se dit pas « prise » ══ */
const grille = ['09:00', '10:00', '11:00', '12:00'];
dit('n95 10:30 hors de la grille d une heure : hors-grille, pas prise', 'hors-grille', heureHabituelle('10:30', ['09:00', '11:00'], grille));
dit('n95 10:00 sur la grille mais occupee : prise', 'prise', heureHabituelle('10:00', ['09:00', '11:00'], grille));
dit('n95 11:00 libre : libre', 'libre', heureHabituelle('11:00', ['09:00', '11:00'], grille));
{
  const b = source('src/apps/couronne/Booking.tsx');
  dit('n95 le toast « vient d etre pris » ne part que si la grille portait l heure', true,
    contient(b, new RegExp(String.raw`heureHabituelle\(voulu, dayTimes, grilleDuJour\(prefIso\.iso, totalDuration\)\) === 'prise'\) \{\s*expressFait\.current = true;\s*toast\(t\('Ce moment vient d’être pris`)));
  dit('n95 plus de toast sur la seule absence des heures libres', false,
    contient(b, new RegExp(String.raw`if \(!pose && !dayTimes\.includes\(voulu\)\) \{\s*expressFait\.current = true;\s*toast\(`)));
}

/* ══ n96 · une fiche introuvable offre le retour a la liste ══ */
/* REPRISE DU 10 OCTOBRE : « plus au carnet » seulement sur une lecture
   reussie des trois tables qui font « les miens ». */
dit('n96 les miens se lisent dans trois tables', ['appointments', 'clients', 'families'], [...TABLES_DU_CARNET]);
dit('n96 une table pas encore lue (les fiches) : se charge', 'se-charge', ficheIntrouvable({ tablesResolues: false, lectureEnEchec: false, enLigne: true }));
dit('n96 une lecture echouee : injoignable, jamais « plus au carnet »', 'injoignable', ficheIntrouvable({ tablesResolues: true, lectureEnEchec: true, enLigne: true }));
dit('n96 hors ligne : injoignable', 'injoignable', ficheIntrouvable({ tablesResolues: true, lectureEnEchec: false, enLigne: false }));
dit('n96 tout lu, lecture reussie : plus au carnet', 'plus-au-carnet', ficheIntrouvable({ tablesResolues: true, lectureEnEchec: false, enLigne: true }));
const etatVide = { failedNames: [] as string[], reprises: [] as string[], ecartees: [] as string[] };
dit('n96 lecture des RDV en echec, en reprise, ou ecartee', [true, true, true, false, false], [
  lectureDesRdvEnEchec({ ...etatVide, failedNames: ['appointments'] }),
  lectureDesRdvEnEchec({ ...etatVide, reprises: ['appointments'] }),
  lectureDesRdvEnEchec({ ...etatVide, ecartees: ['appointments'] }),
  lectureDesRdvEnEchec({ ...etatVide, failedNames: ['payroll'] }),
  lectureDesRdvEnEchec(etatVide),
]);
{
  const m = source('src/apps/couronne/MesRendezVous.tsx');
  dit('n96 l ecran attend les trois tables', true,
    contient(m, new RegExp(String.raw`useState\(\(\) => TABLES_DU_CARNET\.every\(\(x\) => tablePrete\(x\)\)\)`))
      && contient(m, new RegExp(String.raw`for \(const x of TABLES_DU_CARNET\) quandTablePrete\(x, `)));
  dit('n96 l ecran juge par ficheIntrouvable, sur l etat publie de la synchro', true,
    contient(m, new RegExp(String.raw`const introuvable = ficheIntrouvable\(\{\s*tablesResolues: tablesLues,\s*lectureEnEchec: lectureDesRdvEnEchec\(etatSync\),\s*enLigne: etatSync\.online && `))
      && contient(m, new RegExp(String.raw`const etatSync = useSyncExternalStore\(subscribeSync, getSyncState, getSyncState\);`)));
  dit('n96 la fiche introuvable dit ce qui est vrai, et offre le retour a la liste', true,
    contient(m, new RegExp(String.raw`\) : ficheId \? \(\s*<div className="mc-stack"[^>]*>\s*<div className="mc-emptyline">\{introuvable === 'plus-au-carnet'\s*\? t\('Ce rendez-vous n’est plus au carnet\.'\)\s*: introuvable === 'injoignable'\s*\? t\('Ce rendez-vous ne se lit pas pour l’instant : la connexion manque\.'\)\s*: t\('Le rendez-vous se charge\.'\)\}</div>\s*<button className="mc-cta mc-cta--outline" onClick=\{\(\) => setFicheId\(null\)\}>`)));
  dit('n96 plus de « lus » tire de la seule table des RDV', false, contient(m, /tablePrete\('appointments'\)/));
  dit('n96 l en-tete offre « Mes rendez-vous » des qu une fiche est designee', true,
    contient(m, new RegExp(String.raw`\) : ficheId \? \(\s*<>\s*<button className="mc-linkback" onClick=\{\(\) => setFicheId\(null\)\}>`)));
  dit('n96 la phrase nouvelle a son anglais', true,
    brut('src/apps/couronne/i18n/en-rdv.ts').includes("'Ce rendez-vous ne se lit pas pour l’instant : la connexion manque.': '"));
}

/* ══ n97 · le total du panier suit le calibre ══ */
{
  const r = source('src/apps/revelateur/ilots/Reserver.tsx');
  dit('n97 les lignes du panier se recalculent quand le calibre change', true,
    contient(r, new RegExp(String.raw`const lignes = useMemo\(\s*\(\) => lignesDuCode\([\s\S]{0,260}?\[choisies, offreAppliquee, ctx\],\s*\);`)));
}

/* ══ n98 · l'annee sur toute date montree a la cliente ══ */
dit('n98 jourDit dit l annee', 'lundi 12 octobre 2026', jourDit('2026-10-12'));
dit('n98 ... et celle d un rendez-vous de l an prochain', 'vendredi 8 janvier 2027', jourDit('2027-01-08'));
{
  const r = source('src/apps/revelateur/ilots/Reserver.tsx');
  dit('n98 quandDit (les dates d un code) porte l annee', true,
    contient(r, new RegExp(String.raw`const quandDit = [\s\S]{0,200}?toLocaleDateString\('fr-FR', \{ day: 'numeric', month: 'long', year: 'numeric' \}\)`)));
}

/* LA RÈGLE, PAS LE CAS DU JOUR (reprise du 10 octobre) : « toujours
   l'année sur une date de cliente », demandée trois fois. Tout fichier du
   site (src/apps/revelateur, îlots compris, nouveaux fichiers compris) est
   lu : une date mise en forme par toLocale ou Intl qui dit le jour ou le
   mois dit aussi l'année ; un mois écrit par son nom (tableau indexé par
   getMonth) a son getFullYear sur la même ligne. */
{
  const fichiersDuSite = (d: string): string[] => readdirSync(d).flatMap((n) => {
    const c = `${d}/${n}`;
    if (statSync(c).isDirectory()) return fichiersDuSite(c);
    return /\.(ts|tsx)$/.test(n) ? [c] : [];
  });
  const site = fichiersDuSite('src/apps/revelateur');
  const formes: { f: string; o: string }[] = [];
  const sansAnnee: string[] = [];
  for (const f of site) {
    const s = source(f);
    for (const o of s.match(/(?:toLocaleDateString|toLocaleString|Intl\.DateTimeFormat)\([^{;)]*\{[^}]*\}/g) ?? []) {
      if (!/\b(day|month):/.test(o)) continue;
      formes.push({ f, o });
      if (!/\byear:/.test(o)) sansAnnee.push(`${f}: ${o.replace(/\s+/g, ' ')}`);
    }
    for (const o of s.match(/toLocaleDateString\([^)]*,\s*[A-Za-z_$][\w$]*\s*\)/g) ?? []) sansAnnee.push(`${f}: options hors de vue ${o}`);
    for (const ligne of s.split('\n')) {
      if (!/\[\s*[\w$.]+\.get(?:UTC)?Month\(\)\s*\]/.test(ligne)) continue;
      formes.push({ f, o: ligne });
      if (!/get(?:UTC)?FullYear\(\)/.test(ligne)) sansAnnee.push(`${f}: ${ligne.trim()}`);
    }
  }
  dit('n98 aucune date du site ne s ecrit « jour + mois » sans l annee', [], sansAnnee);
  /* Le controle doit VOIR des dates pour en juger, et lire les ilots. */
  dit('n98 ... et il en lit bien (au moins quatre, ilots compris)', [true, true, true],
    [formes.length >= 4, site.some((f) => f.includes('/ilots/')), site.length >= 15]);
}

/* ══ n101 · « demain » se compte a Cotonou ══ */
/* Le lanceur fait tourner ce banc a New York : sans cela, une machine reglee
   sur Cotonou ne verrait jamais la faute. */
dit('n101 le banc tourne bien hors de Cotonou (TZ du fils)', 10, new Date('2026-10-11T00:30:00Z').getDate());
dit('n101 20 h 30 a New York = 1 h 30 a Cotonou : le site commence au surlendemain local',
  ['2026-10-12', '2026-10-13', '2026-10-14'], prochainsJours(3, new Date('2026-10-11T00:30:00Z')));
dit('n101 a 17 h a New York, Cotonou est encore le 10 : demain = le 11',
  ['2026-10-11', '2026-10-12'], prochainsJours(2, new Date('2026-10-10T21:00:00Z')));
dit('n101 un mois qui change', ['2026-11-01'], prochainsJours(1, new Date('2026-10-31T12:00:00Z')));

/* ══ n102 · la raison d'un refus se lit dans le corps de la reponse ══ */
{
  const reponse = (corps: unknown) => ({ json: async () => corps });
  const erreur = (corps: unknown) => ({ message: 'Edge Function returned a non-2xx status code', context: reponse(corps) });
  dit('n102 un 409 creneau_pris se lit dans error.context', 'creneau_pris', await raisonDuRefus(null, erreur({ error: 'creneau_pris' })));
  dit('n102 un 429 rate_limited aussi', 'rate_limited', await raisonDuRefus(null, erreur({ error: 'rate_limited' })));
  dit('n102 une reponse 200 qui porte son refus dans data', 'telephone', await raisonDuRefus({ ok: false, error: 'telephone' }, null));
  dit('n102 un corps illisible rend le message generique', 'Edge Function returned a non-2xx status code',
    await raisonDuRefus(null, { message: 'Edge Function returned a non-2xx status code', context: { json: async () => { throw new Error('pas du json'); } } }));
  dit('n102 une panne reseau sans reponse rend son message', 'Failed to fetch', await raisonDuRefus(null, { message: 'Failed to fetch' }));
  for (const f of ['Reserver', 'Offrir', 'Demande', 'Triage']) {
    const s = source(`src/apps/revelateur/ilots/${f}.tsx`);
    dit(`n102 ${f} lit la raison par raisonDuRefus`, true, contient(s, new RegExp(String.raw`const code = await raisonDuRefus\(data, error\);`)));
    dit(`n102 ${f} ne lit plus data.error seul`, false, contient(s, new RegExp(String.raw`const code = r\.error \?\? \(error\?\.message`)));
  }
}

/* ══ n99 et n103 · l'agenda du site contre un faux client ══ */
type Rep = { data: unknown; error: { message: string } | null };
const journal: string[] = [];
const LIGNES_DE_MURS = 1003;
const fauxClient = (pannes: ReadonlySet<string>) => ({
  from(table: string) {
    const ops: string[] = [];
    const reponse = (): Rep => {
      if (pannes.has(table)) return { data: null, error: { message: 'reseau' } };
      if (table === 'catalog_services') return { data: [{ id: 's1', data: { id: 's1', name: 'Lavage', categoryId: 'c1', durationMin: 60 } }], error: null };
      if (table === 'catalog_categories') return { data: [{ id: 'c1', data: { id: 'c1', label: 'Lavages' } }], error: null };
      if (table === 'documents') return { data: [{ key: 'mnd_settings', data: { hours: [{ day: 'lun', open: '09:00', close: '19:00' }] } }], error: null };
      if (table === 'branches') return { data: [{ id: 'b1', data: { flagship: true, masters: ['Team'], seats: 2 } }], error: null };
      if (table === 'blocages') {
        /* Mille murs, puis trois : un seul select en aurait rendu mille. */
        const apres = ops.find((o) => o.startsWith('gt(id,'));
        const taille = Number(/limit\((\d+)\)/.exec(ops.join(' '))?.[1] ?? 1000);
        const tous = Array.from({ length: LIGNES_DE_MURS }, (_, i) => ({ id: `m${String(i).padStart(4, '0')}`, data: { branchId: 'b1', date: '2026-10-20' } }));
        const depuis = apres ? apres.slice(6, -1) : '';
        return { data: tous.filter((l) => l.id > depuis).slice(0, Math.min(taille, 1000)), error: null };
      }
      return { data: [], error: null };
    };
    const b: Record<string, unknown> = {};
    for (const verbe of ['select', 'in', 'gte', 'lte', 'order', 'limit', 'gt', 'eq']) {
      b[verbe] = (...a: unknown[]) => { ops.push(`${verbe}(${a.map((x) => (typeof x === 'object' ? '' : String(x))).filter(Boolean).join(',')})`); return b; };
    }
    b.then = (ok: (r: Rep) => unknown, ko2: (e: unknown) => unknown) => {
      journal.push(`${table}:${ops.join('.')}`);
      return Promise.resolve(reponse()).then(ok, ko2);
    };
    return b;
  },
  rpc: async () => ({ data: [], error: null }),
});
const g = globalThis as { __faux?: unknown };
const CLE_AGENDA = 'mnd_site_agenda_v1';
{
  g.__faux = fauxClient(new Set(['blocages']));
  const issue = await calendrierDuSite('2026-10-11', '2026-10-31').then(() => 'rendu', () => 'rejete');
  dit('n99 des murs illisibles : le calendrier rejette, il ne se croit pas libre', 'rejete', issue);
  dit('n99 ... et ce faux agenda n entre pas au cache', null, localStorage.getItem(CLE_AGENDA));
  g.__faux = fauxClient(new Set(['documents']));
  const issue2 = await agendaDeLaMaison().then(() => 'rendu', () => 'rejete');
  dit('n99 des reglages illisibles rejettent aussi (pas une semaine toute fermee)', 'rejete', issue2);
  g.__faux = fauxClient(new Set());
  const cal = await calendrierDuSite('2026-10-11', '2026-10-31').then((r) => r, () => null);
  dit('n99 l echec s oublie : le second appel relit et rend l agenda', 'b1', cal?.agenda?.branchId ?? null);
  dit('n99 ... et seul cet agenda complet entre au cache', true, (localStorage.getItem(CLE_AGENDA) ?? '').includes('"branchId":"b1"'));
  const a = await agendaDeLaMaison();
  dit('n103 les murs se lisent tous, page apres page (1003, pas 1000)', LIGNES_DE_MURS, a?.murs.length ?? 0);
  const lectures = journal.filter((l) => l.startsWith('blocages:'));
  dit('n103 ... depuis hier a Cotonou, par id croissant, mille par page', true,
    lectures.length > 0 && lectures.every((l) => /^blocages:select\(id,data\)\.gte\(data->>date,\d{4}-\d{2}-\d{2}\)\.order\(id\)\.limit\(1000\)/.test(l)));
  dit('n103 ... la seconde page reprend apres le dernier id lu', true, lectures.some((l) => l.endsWith('.gt(id,m0999)')));
  const r = source('src/apps/revelateur/ilots/Reserver.tsx');
  dit('n99 Reserver garde l agenda en cache quand le frais manque', true, contient(r, new RegExp(String.raw`setAgenda\(\(prec\) => a \?\? prec \?\? null\);`)));
}

/* ══ n100 · un essai manque ne depose pas une seconde carte ══ */
{
  const o = source('src/apps/revelateur/ilots/Offrir.tsx');
  const commander = /const commander = async[\s\S]*?\n {2}\};/.exec(o)?.[0] ?? '';
  dit('n100 commander reprend la commande deja deposee et la garde', true,
    contient(commander, new RegExp(String.raw`const deposee = commande \?\? await deposeLaCommande\('maison'\);\s*if \(deposee && deposee !== commande\) setCommande\(deposee\);`)));
  dit('n100 ... avant l appel a demande-submit', true,
    commander.indexOf('setCommande(deposee)') > 0 && commander.indexOf('setCommande(deposee)') < commander.indexOf("invoke('demande-submit'"));
  /* REPRISE DU 10 OCTOBRE : la commande gardée fige TOUT ce qu'elle porte, et
     une commande « à la Maison » ne se paie pas en ligne sous cette origine. */
  dit('n100 une commande posee fige le modele de la carte', true,
    contient(o, new RegExp(String.raw`<input type="radio" name="modele" value=\{m\} checked=\{modele === m\} onChange=\{\(\) => setModele\(m\)\} disabled=\{!!commande\} />`)));
  dit('n100 ... et le geste offert', true,
    contient(o, new RegExp(String.raw`<input type="radio" name="geste" value=\{g\} checked=\{geste === g\} onChange=\{\(\) => setGeste\(g\)\} disabled=\{!!commande\} />`)));
  dit('n100 ... comme tous les autres champs de la carte (aucun champ libre)', [],
    (o.match(/<(?:input|select|textarea)\b(?:=>|[^>])*>/g) ?? [])
      .filter((x) => !/type="checkbox"/.test(x) && !/disabled=\{!!commande\}/.test(x)));
  const regler = /const regler = async[\s\S]*?\n {2}\};/.exec(o)?.[0] ?? '';
  dit('n100 regler ne reprend qu une commande deja en ligne', true,
    contient(regler, new RegExp(String.raw`const c = \(commande\?\.origine === 'en-ligne' \? commande : null\) \?\? await deposeLaCommande\('en-ligne'\);`)));
  dit('n100 ... jamais une commande « a la Maison » telle quelle', false, contient(regler, /const c = commande \?\? /));
  dit('n100 « Rouvrir le paiement » seulement si un paiement a ete ouvert', true,
    contient(o, new RegExp(String.raw`\{envoi \? 'Paiement en cours' : commande\?\.origine === 'en-ligne' \? 'Rouvrir le paiement' : 'Régler maintenant'\}`)));
}

/* ══ n105 · le JSON ecrit dans la page ne ferme jamais son <script> ══ */
{
  /* La fonction est lue dans statique.tsx et evaluee telle quelle, types
     retires : empaqueter le module tirerait tout le contenu du site. */
  const s = brut('src/apps/revelateur/statique.tsx');
  const corps = /export function jsonPourLaPage\(valeur: unknown\): string \{([\s\S]*?)\n\}/.exec(s)?.[1] ?? 'return "";';
  // eslint-disable-next-line no-new-func
  const jsonPourLaPage = new Function('valeur', corps) as (v: unknown) => string;
  const offre = { title: 'Rentree', texte: `fin</script><script>alert(1)</script>${String.fromCharCode(0x2028)}ligne` };
  const sortie = jsonPourLaPage(offre);
  dit('n105 aucun « < » dans le JSON ecrit (une offre qui porte </script>)', false, sortie.includes('<'));
  dit('n105 ni separateur de ligne U+2028 brut', false, sortie.includes(String.fromCharCode(0x2028)));
  let relu: unknown = null;
  try { relu = JSON.parse(sortie); } catch { relu = 'illisible'; }
  dit('n105 ... et JSON.parse relit exactement l offre', offre, relu);
}

/* ══ n106 et n112 · pas de « salon » ni de tiret cadratin dans le texte montre ══ */
{
  /* Restent permis : la classe « au-salon », la valeur interne 'salon' du
     mode, l'etiquette interne 'Salon' de la feuille de route et sa classe
     « is-salon ». Tout autre « salon » est du texte lu par la cliente. */
  const affiches = (f: string) => source(f)
    .replace(/className=(?:"[^"]*"|\{`[^`]*`\})/g, '')
    .replace(/'salon'/g, '').replace(/'Salon'/g, '');
  for (const f of ['src/apps/revelateur/ilots/Reserver.tsx', 'src/apps/revelateur/ilots/Offres.tsx']) {
    const reste = affiches(f).match(/.{0,30}\bsalon\b.{0,20}/gi) ?? [];
    dit(`n106 ${f.split('/').pop()} ne dit plus « salon » a la cliente`, [], reste);
  }
  const c = affiches('src/apps/consultation/App.tsx');
  dit('n112 la Consultation ne dit plus « salon » a la cliente', [], c.match(/.{0,30}\bsalon\b.{0,20}/gi) ?? []);
  dit('n112 ... ni de tiret cadratin', [], c.match(/.{0,30}—.{0,20}/g) ?? []);
  dit('n112 l etiquette « Salon » de la feuille de route se dit « A la Maison »', true,
    contient(c, new RegExp(String.raw`\{etiquetteDeRoute\(r\.tag\)\}`))
      && contient(source('src/apps/consultation/App.tsx'), new RegExp(String.raw`tag === 'Salon' \? 'À la Maison'`)));
}

/* ══ n107 · payer.html : la devise du jour, sans tiret cadratin ══ */
{
  const p = brut('public/payer.html')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<style>[\s\S]*?<\/style>/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  dit('n107 payer.html n affiche aucun tiret cadratin', [], p.match(/.{0,30}—.{0,20}/g) ?? []);
  dit('n107 le pied porte la devise de la Maison', true, p.includes('<div class="pied">mi nyɔ́ ɖɛkpɛ, votre beauté est déjà là</div>'));
  dit('n107 plus de « la maison veille »', false, p.includes('la maison veille'));
}

/* ══ n108 · Echap ne ferme que la question de la Maison ══ */
{
  const d = source('src/ds/demande.tsx');
  dit('n108 l ecouteur Echap est pose en capture', true, contient(d, new RegExp(String.raw`window\.addEventListener\('keydown', auClavier, true\)`)));
  dit('n108 ... retire avec la meme capture', true, contient(d, new RegExp(String.raw`window\.removeEventListener\('keydown', auClavier, true\)`)));
  dit('n108 ... et l evenement s arrete la (la Modal ne le recoit pas)', true,
    contient(d, new RegExp(String.raw`if \(e\.key !== 'Escape'\) return;\s*e\.stopImmediatePropagation\(\);\s*e\.preventDefault\(\);\s*repond\(null\);`)));
}

/* ══ n109 et n110 · l'acces a la Consultation ══ */
{
  const vierge: Access = { ...ACCES_VIDE, consultationId: 'c-1' };
  const parti = accesApresLeWidget(vierge, 'c-1', 'tx-42', '2026-10-10T10:00:00Z');
  dit('n109 la reference du widget est gardee avant tout verdict', { ref: 'tx-42', paid: false, reglement: 'kkiapay' }, { ref: parti.ref, paid: parti.paid, reglement: parti.reglement });
  dit('n109 une reference sans verdict se revérifie, ne se repaie pas', 'a-reverifier', voieDAcces(parti));
  dit('n109 rien de parti : on paie', 'a-payer', voieDAcces(vierge));
  dit('n109 verdict du serveur : regle', 'regle', voieDAcces({ ...parti, paid: true, amountXof: 15000 }));
  dit('n109 poursuivre sans verdict garde la reference', { ref: 'tx-42', reglement: 'kkiapay', consultationId: 'c-1' },
    (({ ref, reglement, consultationId }) => ({ ref, reglement, consultationId }))(accesSansVerdict(parti, 'c-1', 'declare')));
  dit('n109 poursuivre sans rien de parti reste « declare »', { ref: null, reglement: 'declare' },
    (({ ref, reglement }) => ({ ref, reglement }))(accesSansVerdict(vierge, 'c-1', 'declare')));
  const c = source('src/apps/consultation/App.tsx');
  const payNow = /const payNow = async[\s\S]*?\n {2}\};/.exec(c)?.[0] ?? '';
  dit('n109 payNow garde la reference AVANT de verifier', true,
    payNow.indexOf('setAccess(accesApresLeWidget(') > 0 && payNow.indexOf('setAccess(accesApresLeWidget(') < payNow.indexOf('verifieLePaiement('));
  dit('n109 l ecran d acces offre « Revérifier » avant tout bouton de paiement', true,
    contient(c, new RegExp(String.raw`\{voieDAcces\(access\) === 'a-reverifier' \? \([\s\S]{0,200}?onClick=\{\(\) => void reverifie\(\)\}[\s\S]{0,600}?\) : kkiapayEnabled\(\) \? \(`)));
  const a = source('src/apps/academie/App.tsx');
  const verifie = /const verifieLAcompte = async[\s\S]*?\n {2}\};/.exec(a)?.[0] ?? '';
  dit('n109 Academie : une verification manquee mene a « a-verifier », jamais a « recue »', [false, 2],
    [verifie.includes("setEtat('recue')"), (verifie.match(/setEtat\('a-verifier'\)/g) ?? []).length]);
  const bloc = /etat === 'a-verifier' \? \([\s\S]*?\) : etat === 'recue'/.exec(a)?.[0] ?? '';
  dit('n109 Academie : l ecran « a-verifier » offre Revérifier, pas « Payer l acompte »', [true, false],
    [bloc.includes('Revérifier mon paiement'), bloc.includes('Payer l’acompte')]);

  const depot = accesApresDepot({ ...parti, paid: true, amountXof: 15000 });
  dit('n110 deposee, la consultation scelle son acces', { paid: true, ref: 'tx-42' }, { paid: depot.scelle.paid, ref: depot.scelle.ref });
  dit('n110 ... et l acces persiste redevient vide (un second rite aura un id neuf)', ACCES_VIDE, depot.suivant);
  const confirm = /const confirm = \(\) => \{[\s\S]*?\n {2}\};/.exec(c)?.[0] ?? '';
  dit('n110 confirm vide l acces juste apres le depot local', true,
    contient(confirm, new RegExp(String.raw`consultationsQueueStore\.set\([^\n]*\);\s*const \{ scelle: porte, suivant \} = accesApresDepot\(access\);\s*setScelle\(porte\);\s*setAccess\(suivant\);`)));
  dit('n110 l ecran de bienvenue relit l acces scelle', true, contient(c, new RegExp(String.raw`\{\(scelle \?\? access\)\.paid && <> Vos frais`)));
}

/* ══ n111 · la carte se dessine hors ecran, seul le dessin voulu est recopie ══ */
{
  const k = source('src/ds/CarteDeMarraine.tsx');
  dit('n111 le dessin se fait sur une toile hors ecran', true,
    contient(k, new RegExp(String.raw`const horsEcran = document\.createElement\('canvas'\);\s*dessineLaCarteDeMarraine\(horsEcran, face, donnees\)`)));
  dit('n111 ... jamais sur la toile visible', false, contient(k, new RegExp(String.raw`dessineLaCarteDeMarraine\(canvas,`)));
  dit('n111 ... recopiee seulement si ce dessin est encore voulu', true,
    contient(k, new RegExp(String.raw`if \(!vivant\) return;\s*canvas\.width = horsEcran\.width;\s*canvas\.height = horsEcran\.height;\s*canvas\.getContext\('2d'\)\?\.drawImage\(horsEcran, 0, 0\);`)));
}

if (ko) { console.log(`\n${ko} echec(s).`); process.exit(1); }
console.log('\nTout passe.');
