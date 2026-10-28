/* ═══════════════════════════════════════════════════════════════════
   FETE-DE-COURONNE — l'anniversaire de la couronne d'un enfant, chaque année.

   Le Club des Petites Couronnes (MND Kids), programme validé par Yéman le
   21 octobre 2026 au sélecteur, lot 5 « la fête de couronne » : « Chaque
   année, l'anniversaire de ta couronne : une photo, un diplôme, et une
   coiffure de fête si tu veux. » Côté parents : « Au jour anniversaire de sa
   Première Couronne, un mot sur WhatsApp. »

   L'ANNIVERSAIRE (contrat commun du Club) : le jour et le mois du PREMIER
   rendez-vous honoré qui porte la Première Couronne Kids (`sv-kids-vekpe`,
   ou le pack `sv-kids-naissance`), chaque année à partir d'un an. Sans
   Première Couronne Kids à la Maison, pas d'anniversaire. Un 29 février se
   fête le 28 les années communes.

   Réveillée par le cron plusieurs fois par jour, elle :
     ① lit les rendez-vous honorés qui portent une Première Couronne Kids ;
     ② à partir de 10 h, heure de Cotonou, pour chaque enfant dont la
        couronne a son anniversaire aujourd'hui (ou l'a eu dans les trois
        jours : un cron manqué se rattrape, une vieille fête ne ressort
        pas), écrit aux parents ;
     ③ DÉPOSE chaque message dans la salle d'attente des envois (le facteur
        `envois-partent` le porte, jamais pendant les heures calmes), à
        identifiant déterministe : un enfant, une année, un message. Le cron
        peut se réveiller vingt fois.

   À QUI : celle qui paie pour le foyer de l'enfant (la tête portée de son
   compte), appelée comme partout (`appelDe`, aucune civilité supposée) ;
   sinon le numéro de la fiche de l'enfant, à « Madame, Monsieur ». Jamais
   un numéro de pièce, jamais une date sans son année.

   RIEN NE PART SANS SON MODÈLE : le secret WA_TEMPLATE_FETE_DE_COURONNE
   nomme le modèle approuvé par Meta (`fete_de_couronne`). Sans lui, rien.

   AUCUN SECRET ICI. Tout vient de l'environnement de la fonction.
   Déploiement : Supabase → Edge Functions → New function
   « fete-de-couronne » → coller CE FICHIER ENTIER → Deploy, « Verify JWT »
   désactivé. Puis le cron (Integrations → Cron), `0 9,11,13,15,17 * * *`
   (10 h, 12 h, 14 h, 16 h et 18 h à Cotonou), SQL Snippet :
   select public.appelle_fonction_edge('fete-de-couronne');
   ═══════════════════════════════════════════════════════════════════ */

import { createClient } from 'npm:@supabase/supabase-js@2';

// ── DEBUT tournee (tout le juge et la tournée : scripts/verifie-la-fete-de-couronne les rejoue contre une base simulée)

const TZ = 'Africa/Porto-Novo'; // le fuseau de la Maison, pas celui du serveur

/** La version de ce fichier, rendue dans chaque réponse. */
const VERSION = '2026-10-28-a · M. et Mme devant le prénom';

/** Numéro béninois → format international sans « + » (copie de rappels-j1). */
const numeroIntl = (brut: string | undefined): string | null => {
  const d = (brut ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00229')) return d.slice(2);
  if (d.startsWith('229')) return d;
  if (d.length === 10 && d.startsWith('01')) return `229${d}`;
  if (d.length === 8) return `22901${d}`;
  return d;
};

/* La Maison écrit « Madame Naffi ». Recopié de `src/shared/civilite.ts` ;
   `verifie-civilite` tient la copie. */
const appelDe = (d: { name?: unknown; civilite?: unknown; auMasculin?: unknown } | null | undefined, repli?: unknown): string => {
  const civ = d?.civilite === 'monsieur' || d?.civilite === 'mademoiselle' || d?.civilite === 'madame'
    ? d.civilite : d?.auMasculin === true ? 'monsieur' : '';
  const prenom = String(d?.name ?? repli ?? '').trim().split(/\s+/)[0] ?? '';
  /* La civilité inconnue ne se suppose plus (13 octobre 2026) : le prénom seul. */
  if (!civ) return prenom || 'Madame, Monsieur';
  /* Abrégée devant le prénom (28 octobre 2026) : « M. Jean-Luc », « Mme Shadé » ; seule, en entier. */
  if (prenom) return `${civ === 'monsieur' ? 'M.' : civ === 'mademoiselle' ? 'Mlle' : 'Mme'} ${prenom}`;
  return civ === 'monsieur' ? 'Monsieur' : civ === 'mademoiselle' ? 'Mademoiselle' : 'Madame';
};

/* ══ LA SALLE D'ATTENTE — recopiée de rappels-j1 (src/shared/salle-des-envois.ts) ══ */
const DECALAGE_DU_SALON_H = 1;
type ReglesDeLaSalle = { salleMin: number; calmeDe: number; calmeA: number };
const REGLES_PAR_DEFAUT: ReglesDeLaSalle = { salleMin: 10, calmeDe: 20, calmeA: 8 };
const FACTEUR_VIVANT_MS = 5 * 60_000;
function reglesDepuis(cfg: { salleMin?: unknown; calmeDe?: unknown; calmeA?: unknown } | null | undefined): ReglesDeLaSalle {
  const n = (v: unknown, min: number, max: number, defaut: number): number => {
    const x = Number(v);
    return Number.isFinite(x) && x >= min && x <= max ? Math.round(x) : defaut;
  };
  return {
    salleMin: n(cfg?.salleMin, 1, 120, REGLES_PAR_DEFAUT.salleMin),
    calmeDe: n(cfg?.calmeDe, 0, 23, REGLES_PAR_DEFAUT.calmeDe),
    calmeA: n(cfg?.calmeA, 0, 23, REGLES_PAR_DEFAUT.calmeA),
  };
}
const heureDuSalon = (ms: number): number => {
  const d = new Date(ms + DECALAGE_DU_SALON_H * 3_600_000);
  return d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
};
function dansLesHeuresCalmes(ms: number, r: ReglesDeLaSalle): boolean {
  if (r.calmeDe === r.calmeA) return false;
  const h = heureDuSalon(ms);
  return r.calmeDe < r.calmeA ? (h >= r.calmeDe && h < r.calmeA) : (h >= r.calmeDe || h < r.calmeA);
}
function finDesHeuresCalmes(ms: number, r: ReglesDeLaSalle): number {
  const local = new Date(ms + DECALAGE_DU_SALON_H * 3_600_000);
  const fin = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), r.calmeA, 0, 0) - DECALAGE_DU_SALON_H * 3_600_000;
  return fin > ms ? fin : fin + 86_400_000;
}
function heureDeDepart(maintenantMs: number, r: ReglesDeLaSalle): { partA: number; calme: boolean } {
  const apresLaSalle = maintenantMs + r.salleMin * 60_000;
  if (!dansLesHeuresCalmes(apresLaSalle, r)) return { partA: apresLaSalle, calme: false };
  return { partA: finDesHeuresCalmes(apresLaSalle, r), calme: true };
}
const facteurVivant = (vuLe: string | undefined | null, maintenantMs: number): boolean => {
  const t = Date.parse(vuLe ?? '');
  return Number.isFinite(t) && maintenantMs - t <= FACTEUR_VIVANT_MS && t - maintenantMs <= FACTEUR_VIVANT_MS;
};
/* ── fin du calcul recopié ── */

const depot = (maintenantMs: number, r: ReglesDeLaSalle, colis: Record<string, unknown>, prenom?: string): Record<string, unknown> => {
  const { partA, calme } = heureDeDepart(maintenantMs, r);
  return {
    deposeLe: new Date(maintenantMs).toISOString(), partA: new Date(partA).toISOString(),
    ...(calme ? { calme: true } : {}), ...(prenom ? { prenom } : {}), colis,
  };
};

// ── DEBUT anniversaire (copie bornée de la règle du Club, src/shared/club-pur.ts ; scripts/verifie-la-fete-de-couronne la rejoue contre l'original)

/** Les prestations qui posent la Première Couronne d'un enfant (src/shared/kids.ts). */
const PREMIERE_COURONNE_KIDS: readonly string[] = ['sv-kids-vekpe', 'sv-kids-naissance'];

/** Ce qu'on lit d'un rendez-vous. */
type RdvLu = { id?: string; clientId?: string; date?: string; status?: string; serviceIds?: string[] };

const estIso = (s: string | null | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** LE JOUR DE LA PREMIÈRE COURONNE D'UN ENFANT : le premier rendez-vous
    honoré qui la porte. Aucun : null (pas d'anniversaire). */
function premiereCouronneKids(rdvs: readonly RdvLu[], clientId: string): string | null {
  let premier: string | null = null;
  for (const a of rdvs) {
    if (a.clientId !== clientId || a.status !== 'honoré' || !estIso(a.date)) continue;
    if (!(a.serviceIds ?? []).some((s) => PREMIERE_COURONNE_KIDS.includes(s))) continue;
    if (premier === null || a.date < premier) premier = a.date;
  }
  return premier;
}

/** L'ANNIVERSAIRE D'UNE ANNÉE DONNÉE : même jour, même mois ; un 29 février
    se fête le 28 les années communes. */
function anniversaireEn(premiereLe: string, annee: number): string {
  const [, m, j] = premiereLe.split('-').map(Number);
  const bissextile = (annee % 4 === 0 && annee % 100 !== 0) || annee % 400 === 0;
  const jour = m === 2 && j === 29 && !bissextile ? 28 : j;
  return `${String(annee).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
}

/** LA COURONNE A-T-ELLE SON ANNIVERSAIRE CE JOUR-LÀ ? Le nombre d'années
    (un et plus), sinon 0 : le jour même de la Première Couronne n'en est pas un. */
function anneesDeCouronne(premiereLe: string, jour: string): number {
  if (!estIso(premiereLe) || !estIso(jour)) return 0;
  const annee = Number(jour.slice(0, 4));
  const annees = annee - Number(premiereLe.slice(0, 4));
  if (annees < 1) return 0;
  return anniversaireEn(premiereLe, annee) === jour ? annees : 0;
}
// ── FIN anniversaire

// ── DEBUT phrases (ce que les parents lisent : l'année toujours, aucun numéro de pièce, aucune civilité supposée)

/** La fête ne part qu'à partir de 10 h, heure de Cotonou. */
const HEURE_DE_LA_FETE = 10;
/** Un cron manqué se rattrape dans les trois jours ; une vieille fête ne ressort pas. */
const JOURS_DE_RATTRAPAGE = 3;
/** Une borne par passage. */
const BORNE_DES_MESSAGES = 40;

const JOURS_DITS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS_DITS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
/** « mardi 21 octobre 2025 » : la date dite, toujours avec son année. */
const jourDitAvecLAnnee = (iso: string): string => {
  const [a, m, j] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1, j));
  return `${JOURS_DITS[d.getUTCDay()]} ${j === 1 ? '1er' : j} ${MOIS_DITS[m - 1]} ${a}`;
};
function decaleLeJour(jour: string, n: number): string {
  const [a, m, j] = jour.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, j + n)).toISOString().slice(0, 10);
}

const ANNEES_DITES = ['un an', 'deux ans', 'trois ans', 'quatre ans', 'cinq ans', 'six ans', 'sept ans', 'huit ans', 'neuf ans', 'dix ans',
  'onze ans', 'douze ans', 'treize ans', 'quatorze ans', 'quinze ans'];
/** « un an », « deux ans »… en lettres jusqu'à quinze, en chiffres au-delà. */
const anneesDites = (n: number): string => ANNEES_DITES[n - 1] ?? `${n} ans`;

/** Le prénom de l'enfant, tel qu'on le nomme à ses parents. */
const prenomDe = (fiche: { name?: unknown } | undefined): string =>
  String(fiche?.name ?? '').trim().split(/\s+/)[0] ?? '';

/** LES QUATRE VARIABLES DU MODÈLE `fete_de_couronne` : l'appel des parents,
    le prénom de l'enfant, ses années de couronne, le jour de sa Première
    Couronne avec l'année. */
const variablesDeLaFete = (o: { appel: string; enfant: string; annees: number; premiereLe: string }): string[] => [
  o.appel,
  o.enfant,
  anneesDites(o.annees),
  jourDitAvecLAnnee(o.premiereLe),
];
/** Ce qu'ils lisent, tel que le fil du Trône le garde : le texte du modèle, variables posées. */
const texteDeLaFete = (v: readonly string[]): string =>
  `Bonjour ${v[0]},\nIl y a ${v[2]}, le ${v[3]}, la couronne de ${v[1]} est née à la Maison MND. Joyeux anniversaire de couronne !\nÀ sa prochaine visite, une photo pour son carnet, un diplôme, et une coiffure de fête si le cœur lui en dit.`;
// ── FIN phrases

// ── DEBUT juge (qui reçoit quoi aujourd'hui ; pur, éprouvé par le banc)

/** Une fête à écrire : l'enfant, le jour de l'anniversaire, ses années. */
type Fete = { enfantId: string; premiereLe: string; leJour: string; annees: number };

/** LES FÊTES DU JOUR : chaque enfant dont la couronne a son anniversaire
    aujourd'hui, ou l'a eu dans les trois jours. */
function fetesDuJour(rdvs: readonly RdvLu[], aujourdhui: string): Fete[] {
  const enfants = [...new Set(rdvs.map((a) => a.clientId).filter((x): x is string => !!x))];
  const out: Fete[] = [];
  for (const enfantId of enfants) {
    const premiereLe = premiereCouronneKids(rdvs, enfantId);
    if (!premiereLe) continue;
    for (let d = 0; d <= JOURS_DE_RATTRAPAGE; d++) {
      const jour = decaleLeJour(aujourdhui, -d);
      const annees = anneesDeCouronne(premiereLe, jour);
      if (annees > 0) { out.push({ enfantId, premiereLe, leJour: jour, annees }); break; }
    }
  }
  return out;
}

/** L'identifiant au journal des envois : un enfant, une année, un message. */
const idDeLaFete = (f: Fete): string => `fc-${f.enfantId}-${f.leJour.slice(0, 4)}-whatsapp`;

/** À QUI ÉCRIRE : celle qui paie pour le foyer de l'enfant, si elle a un
    numéro ; sinon le numéro de la fiche de l'enfant, adressé à ses parents. */
type FicheLue = { id: string; name?: string; phone?: string; civilite?: string; auMasculin?: boolean; archived?: boolean; familyId?: string };
function destinataireDeLaFete(
  enfant: FicheLue | undefined, fiches: ReadonlyMap<string, FicheLue>, payeurDuFoyer: ReadonlyMap<string, string>,
): { fiche: FicheLue; appel: string } | null {
  if (!enfant || enfant.archived) return null;
  const payeur = enfant.familyId ? fiches.get(payeurDuFoyer.get(enfant.familyId) ?? '') : undefined;
  if (payeur && payeur.id !== enfant.id && !payeur.archived && numeroIntl(payeur.phone)) return { fiche: payeur, appel: appelDe(payeur) };
  if (numeroIntl(enfant.phone)) return { fiche: enfant, appel: appelDe(null) };
  return null;
}
// ── FIN juge

/** Les verdicts du journal qui ne comptent pas comme un message parti. */
const SE_RETENTE = new Set(['échec', 'périmé']);

const json = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), { status, headers: { 'content-type': 'application/json' } });

/** LA TOURNÉE : lit, juge, dépose. `sb` est le client service ; le banc lui
    passe une base simulée, et un faux `envoie`. */
// deno-lint-ignore no-explicit-any
async function tournee(sb: any, o: { maintenantMs: number; MODELE_FETE: string; WA_TOKEN: string; WA_PHONE_ID: string; envoie?: typeof fetch }): Promise<Record<string, unknown>> {
  const { maintenantMs, MODELE_FETE, WA_TOKEN, WA_PHONE_ID } = o;
  const envoie = o.envoie ?? fetch;
  const aujourdhui = new Date(maintenantMs).toLocaleDateString('en-CA', { timeZone: TZ });
  if (!MODELE_FETE) return { version: VERSION, jour: aujourdhui, messages: 'sans-modele' };
  if (heureDuSalon(maintenantMs) < HEURE_DE_LA_FETE) return { version: VERSION, jour: aujourdhui, messages: 'pas-encore' };

  const { data: docs } = await sb.from('documents').select('key, data')
    .in('key', ['mnd_auto_config', 'mnd_facteur']);
  const regles = reglesDepuis(docs?.find((d) => d.key === 'mnd_auto_config')?.data as Record<string, unknown> | undefined);
  const salleOuverte = facteurVivant((docs?.find((d) => d.key === 'mnd_facteur')?.data as { vuLe?: string } | undefined)?.vuLe, maintenantMs);
  if (!salleOuverte && (!WA_TOKEN || !WA_PHONE_ID)) return { version: VERSION, messages: 'sans-facteur' };

  /* ① LES PREMIÈRES COURONNES KIDS HONORÉES, par pages (une lecture plafonne à mille lignes). */
  const rdvs: RdvLu[] = [];
  const vus = new Set<string>();
  for (const sv of PREMIERE_COURONNE_KIDS) {
    for (let de = 0; ; de += 1000) {
      const { data, error } = await sb.from('appointments').select('id, data')
        .eq('data->>status', 'honoré').contains('data', { serviceIds: [sv] }).range(de, de + 999);
      if (error) return { version: VERSION, messages: 'lecture-refusee', motif: String(error.message ?? '').slice(0, 120) };
      for (const l of (data ?? []) as { id: string; data: RdvLu }[]) {
        if (vus.has(l.id)) continue;
        vus.add(l.id);
        rdvs.push({ ...l.data, id: l.id });
      }
      if ((data ?? []).length < 1000) break;
    }
  }

  /* ② LES FÊTES DU JOUR. */
  const fetes = fetesDuJour(rdvs, aujourdhui);
  if (fetes.length === 0) return { version: VERSION, jour: aujourdhui, messages: 0, couronnes: rdvs.length };

  /* Le journal : un message déjà posé ne se repose pas ; seul un échec se retente. */
  const deja = new Set<string>();
  for (let i = 0; i < fetes.length; i += 200) {
    const { data } = await sb.from('envois').select('id, data').in('id', fetes.slice(i, i + 200).map(idDeLaFete));
    for (const l of (data ?? []) as { id: string; data: { statut?: string } }[]) {
      if (!SE_RETENTE.has(l.data?.statut ?? '')) deja.add(l.id);
    }
  }
  const restent = fetes.filter((f) => !deja.has(idDeLaFete(f)));
  if (restent.length === 0) return { version: VERSION, jour: aujourdhui, messages: 0, deja: deja.size };

  /* Les fiches : l'enfant, et celle qui paie pour son foyer. */
  const fiches = new Map<string, FicheLue>();
  const litLesFiches = async (ids: string[]) => {
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await sb.from('clients').select('id, data').in('id', ids.slice(i, i + 200));
      for (const l of data ?? []) fiches.set(l.id as string, { id: l.id as string, ...(l.data as object) });
    }
  };
  await litLesFiches([...new Set(restent.map((f) => f.enfantId))]);
  const foyers = [...new Set([...fiches.values()].filter((x) => x.familyId).map((x) => x.familyId as string))];
  const payeurDuFoyer = new Map<string, string>();
  if (foyers.length) {
    const { data: lignesDesFoyers } = await sb.from('families').select('id, data').in('id', foyers);
    for (const l of (lignesDesFoyers ?? []) as { id: string; data: { payerClientId?: string } }[]) {
      if (l.data?.payerClientId) payeurDuFoyer.set(l.id, l.data.payerClientId);
    }
    await litLesFiches([...payeurDuFoyer.values()].filter((id) => !fiches.has(id)));
  }

  let parties = 0;
  let bornee = false;
  const sautes: Record<string, number> = {};
  const saute = (pourquoi: string) => { sautes[pourquoi] = (sautes[pourquoi] ?? 0) + 1; };

  for (const f of restent) {
    if (parties >= BORNE_DES_MESSAGES) { bornee = true; break; }
    const enfant = fiches.get(f.enfantId);
    if (!enfant) { saute('sans-fiche'); continue; }
    if (enfant.archived) { saute('archivee'); continue; }
    const dest = destinataireDeLaFete(enfant, fiches, payeurDuFoyer);
    const tel = numeroIntl(dest?.fiche.phone);
    if (!dest || !tel) { saute('sans-numero'); continue; }
    const prenom = prenomDe(enfant);
    if (!prenom) { saute('sans-prenom'); continue; }

    const id = idDeLaFete(f);
    const variables = variablesDeLaFete({ appel: dest.appel, enfant: prenom, annees: f.annees, premiereLe: f.premiereLe });
    const texteAuFil = texteDeLaFete(variables);
    const composants = [{ type: 'body', parameters: variables.map((text) => ({ type: 'text', text })) }];
    const maintenant = new Date(maintenantMs).toISOString();
    const branchId = (enfant as { branchId?: string }).branchId ?? null;
    const commun = {
      id, branchId, type: 'fete-de-couronne', canal: 'whatsapp', apptId: '', dateRdv: '',
      clientId: dest.fiche.id, teteId: enfant.id, numero: tel, quand: maintenant,
      anniversaire: f.leJour, premiereCouronneLe: f.premiereLe, annees: f.annees,
    };
    if (salleOuverte) {
      await sb.from('envois').upsert({
        id, branch_id: branchId,
        data: {
          ...commun, statut: 'en-attente',
          ...depot(maintenantMs, regles, { genre: 'whatsapp', numero: tel, modele: MODELE_FETE, parQui: 'la Maison, automatiquement', texteAuFil, composants }, dest.appel),
        },
      }, { onConflict: 'id' });
      parties++;
      continue;
    }
    /* Le facteur se tait : on envoie comme les rappels, hors des heures calmes seulement. */
    if (dansLesHeuresCalmes(maintenantMs, regles)) { saute('heures-calmes'); continue; }
    let statut = 'échec';
    let detail: string | undefined;
    let waId = '';
    try {
      const rep = await envoie(`https://graph.facebook.com/v20.0/${WA_PHONE_ID}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${WA_TOKEN}` },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: tel, type: 'template', template: { name: MODELE_FETE, language: { code: 'fr' }, components: composants } }),
        signal: AbortSignal.timeout(10_000),
      });
      const corps = await rep.json().catch(() => ({}));
      waId = String(corps?.messages?.[0]?.id ?? '');
      if (rep.ok) { statut = 'envoyé'; if (!waId) detail = 'accepté sans identifiant Meta'; }
      else detail = String(corps?.error?.message ?? `HTTP ${rep.status}`);
    } catch (e) {
      detail = String(e);
    }
    await sb.from('envois').upsert({
      id, branch_id: branchId,
      data: { ...commun, statut, ...(detail ? { detail: detail.slice(0, 300) } : {}), ...(waId ? { waMessageId: waId } : {}) },
    }, { onConflict: 'id' });
    if (statut !== 'envoyé') { saute('refus-meta'); continue; }
    parties++;
    if (waId) {
      const idFil = `wa-${waId}`;
      await sb.from('messages_wa').upsert({
        id: idFil, branch_id: branchId,
        data: {
          id: idFil, waId, branchId, sens: 'sortant', numero: tel, clientId: dest.fiche.id, texte: texteAuFil,
          type: 'text', quand: maintenant, etat: 'en-route', modele: MODELE_FETE, parQui: 'la Maison, automatiquement',
        },
      }, { onConflict: 'id' });
    }
  }

  return {
    version: VERSION, jour: aujourdhui, messages: parties, aEcrire: restent.length, salle: salleOuverte, sautes,
    ...(bornee ? { borne: BORNE_DES_MESSAGES } : {}),
  };
}
// ── FIN tournee

Deno.serve(async (req) => {
  const service = (Deno.env.get('CLE_SERVICE') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
  const urlBase = Deno.env.get('SUPABASE_URL') ?? '';
  const MODELE_FETE = (Deno.env.get('WA_TEMPLATE_FETE_DE_COURONNE') ?? '').trim();
  const WA_TOKEN = Deno.env.get('WA_TOKEN') ?? '';
  const WA_PHONE_ID = Deno.env.get('WA_PHONE_ID') ?? '';

  /* ⓪ LE CONTRÔLE DE SANTÉ : ouvrir l'adresse dans un navigateur ne lance
     RIEN. On dit la version et ce qui est posé, en longueurs seules. */
  if (req.method === 'GET') {
    return json({
      fonction: 'fete-de-couronne', version: VERSION,
      secrets: {
        WA_TEMPLATE_FETE_DE_COURONNE: MODELE_FETE.length,
        CLE_SERVICE: service.length, WA_TOKEN: WA_TOKEN.length, WA_PHONE_ID: WA_PHONE_ID.length,
      },
    });
  }

  /* Seul le cron (armé de la clé service) réveille la tournée. */
  const cleRecue = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!service || cleRecue !== service) {
    return json({ erreur: 'réservé au cron', attendueLg: service.length, recueLg: cleRecue.length }, 401);
  }
  if (!MODELE_FETE) return json({ version: VERSION, messages: 'sans-modele' });

  const sb = createClient(urlBase, service);
  try {
    const r = await tournee(sb, { maintenantMs: Date.now(), MODELE_FETE, WA_TOKEN, WA_PHONE_ID });
    return json(r, r.messages === 'lecture-refusee' ? 500 : 200);
  } catch (e) {
    return json({ version: VERSION, messages: 'echec', motif: String(e).slice(0, 200) }, 500);
  }
});
