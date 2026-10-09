import type { Client } from './clients';
import {
  FORME_DU_CODE, prenomDuNom, rangDe,
  type ClassementAmbassade, type EtatDeLaFilleule, type ResumeParrainage, type SoinOffert,
} from './parrainage-pur';
import { codeActifDe } from './douze-lunes-pur';

/* ══ LES AMBASSADRICES DE LA MAISON — 28 septembre 2026 ══════════════════
   Maquette validée (canvas « La carte de marraine MND », page « Les
   ambassadrices ») : « construits » (Yéman).

   Ce module est PUR : il lit les fiches, les demandes du site et le
   carnet, et dit ce qui doit être. Le Trône l'applique
   (`useParrainageVivant`), Ma Couronne et la caisse le lisent,
   `verifie-le-parrainage` l'éprouve.

   ── DE MAIN EN MAIN (9 octobre 2026). Chaque cliente n'est plus
   ambassadrice d'office : la carte se gagne, à la Nᵉ visite honorée depuis
   le 1er janvier (la GRAINE, shared/douze-lunes-pur). Une lignée ne naît
   que d'une fiche Graine, par son code actif (`codeActifDe`) ; les
   marraines du site (demandes « Marraine ») n'en font plus. Une amie
   invitée AVANT le lancement avec l'ancien code de la même fiche la
   retrouve (l'archive garde cet ancien code), et vaut son merci si elle est
   venue APRÈS le lancement. L'écho, les rangs récompensés et le défi du
   mois sont retirés du code : un réglage resté dans le document n'y peut
   plus rien. Les échos restent une ligne d'honneur dans Ma Couronne.

   ── UNE AMIE, DEUX CHEMINS. Elle réserve sur le site avec le code (la
   demande porte `parrainDe`), ou le Trône la rattache à la main (« Vient de
   la part de », `parraineePar` sur sa fiche). Les deux se rejoignent sur SA
   fiche dès que son rendez-vous y est rattaché : une amie ne compte qu'une
   fois.

   ── UNE AMIE COMPTE QUAND ELLE EST VENUE : sa première visite HONORÉE. Une
   réservation seule ne rend rien.

   ── JAMAIS D'ARGENT. L'amie vaut une récompense au choix (soin offert ou
   remise sur un produit) ; les amies de ses amies grandissent l'arbre, sans
   rien rapporter. Des soins et des remises, rien à payer pour entrer : c'est
   un programme de fidélité, pas une vente pyramidale. */

export type RdvLu = { id: string; status: string; date: string; clientId?: string };

export type FicheAmb = Pick<Client, 'id' | 'name' | 'phone' | 'since'>
  & Partial<Pick<Client, 'codeParrain' | 'archived' | 'soinsOfferts' | 'parrainage' | 'parraineePar' | 'parraineeLe' | 'choixRecompenses' | 'graine' | 'avantLesDouzeLunes'>>;

export type DemandeLue = {
  id: string; prenom: string; telephone: string; createdAt: string;
  codeParrain?: string; codeRaison?: string; parrainDe?: string; apptId?: string;
  cadeauMarraineRemisLe?: string;
  /** La fiche que le Trône a ouverte en la convertissant (« En faire une
      cliente ») : le seul lien d'une demande de RAPPEL, qui n'a pas de
      rendez-vous (9 octobre 2026). */
  clientId?: string;
};

export type ReglageAmbassade = {
  soinMarraineServiceId?: string;
  /** La remise « au choix », sur un produit de la Gamme (20 % par défaut). */
  remisePct?: number;
  /** ÉTEINT depuis le 9 octobre 2026 : l'écho ne se pose plus. */
  echoPct?: number;
  validiteMois?: number;
  /** ÉTEINTS depuis le 9 octobre 2026 : ni bonus de rang, ni défi du mois. */
  bonusRangs?: Partial<Record<'tresse' | 'couronne' | 'reine', string>>;
  defi?: { actif: boolean; objectif: number; serviceId?: string };
  merciParWhatsApp?: boolean;
  /** LE JOUR DU LANCEMENT de « De main en main » (AAAA-MM-JJ, heure du
      Bénin), tiré de `mnd_douze_lunes` par le Trône. Absent : aucun merci.
      Une amie venue avant ce jour ne pose rien : c'est la date métier. */
  lanceLe?: string;
};

/** LE RÉGLAGE QUE LE MOTEUR LIT (9 octobre 2026) : celui du document
    `mnd_parrainage` (soin, remise, validité), le jour du lancement, et le
    remerciement WhatsApp de `mnd_douze_lunes`, jamais celui de l'ancien
    programme que le geste a éteint. Le crochet du Trône et les écrans qui
    comptent les mercis à venir passent par lui : une seule lecture. */
export const reglageDuMoteur = (
  reglage: ReglageAmbassade, lunes: { merciParWhatsApp?: boolean } | null | undefined, lanceLe: string | undefined,
): ReglageAmbassade => ({ ...reglage, merciParWhatsApp: lunes?.merciParWhatsApp === true, lanceLe });

export const REMISE_PAR_DEFAUT = 20;
/** L'ancien écho (éteint) : gardé pour l'écran qui montre l'ancien réglage. */
export const ECHO_PAR_DEFAUT = 10;
/** Une remise de parrainage reste une remise : jamais plus que la moitié. */
export const REMISE_MAX = 50;
const borne = (v: number | undefined, defaut: number) => Math.max(1, Math.min(REMISE_MAX, Math.round(v ?? defaut)));

export type FilleuleAmb = {
  /** `c:<fiche>` ou `d:<demande>` : une amie, une seule fois. */
  cle: string;
  prenom: string;
  clientId?: string;
  demandeId?: string;
  etat: EtatDeLaFilleule;
  /** Sa première visite honorée. */
  venueLe?: string;
  dateRdv?: string;
  /** L'identifiant de la récompense qu'elle vaut à sa marraine. */
  recompenseId: string;
  /** Le cadeau a déjà été remis à la main (écran Parrainages d'avant). */
  remisALaMain?: boolean;
};

export type Lignee = {
  /** Le code ACTIF de la Graine. */
  code: string;
  /** La fiche de l'ambassadrice. (Une marraine du site sans fiche n'a plus
      de lignée depuis le 9 octobre 2026 ; le champ reste facultatif.) */
  clientId?: string;
  demandeId?: string;
  prenom: string;
  telephone: string;
  depuis: string;
  filleules: FilleuleAmb[];
};

function premiereVisite(clientId: string, rdvs: readonly RdvLu[]): string | undefined {
  let d: string | undefined;
  for (const r of rdvs) if (r.clientId === clientId && r.status === 'honoré' && (!d || r.date < d)) d = r.date;
  return d;
}
function etatDeLaFiche(clientId: string, rdvs: readonly RdvLu[]): { etat: EtatDeLaFilleule; venueLe?: string; dateRdv?: string } {
  const venueLe = premiereVisite(clientId, rdvs);
  if (venueLe) return { etat: 'venue', venueLe, dateRdv: venueLe };
  const prochain = rdvs.filter((r) => r.clientId === clientId && r.status !== 'annulé').sort((a, b) => a.date.localeCompare(b.date))[0];
  return prochain ? { etat: 'a-venir', dateRdv: prochain.date } : { etat: 'sans-rdv' };
}

/** LES CODES QUI MÈNENT À UNE GRAINE, vers son code actif : ce code-là, et
    l'ancien code de la MÊME fiche, gardé dans son archive (décision 5 : une
    amie invitée avant le lancement retrouve sa marraine). L'ancien code
    d'une fiche qui n'est pas Graine ne mène nulle part, celui d'une
    demande « Marraine » du site non plus. */
function cheminsDesCodes(clients: readonly FicheAmb[]): Map<string, string> {
  const vers = new Map<string, string>();
  for (const c of clients) {
    const actif = codeActifDe(c);
    if (actif) vers.set(actif, actif);
  }
  for (const c of clients) {
    const actif = codeActifDe(c);
    const ancien = c?.avantLesDouzeLunes?.codeParrain;
    if (actif && ancien && FORME_DU_CODE.test(ancien) && !vers.has(ancien)) vers.set(ancien, actif);
  }
  return vers;
}

/** Le code actif de chaque fiche Graine, par fiche. */
const codesActifsParFiche = (clients: readonly FicheAmb[]): Map<string, string> => {
  const m = new Map<string, string>();
  for (const c of clients) {
    const code = codeActifDe(c);
    if (code) m.set(c.id, code);
  }
  return m;
};

/** LA GRAINE QU'UN CODE DÉSIGNE (son code actif, ou son ancien code gardé
    dans l'archive), ou rien. Pour les écrans qui montrent « Vient de la
    part de » sur une amie rattachée par l'ancien code. */
export function ficheDuCode(code: string | undefined, clients: readonly FicheAmb[]): FicheAmb | undefined {
  if (!code) return undefined;
  const actif = cheminsDesCodes(clients).get(code);
  return actif ? clients.find((c) => codeActifDe(c) === actif) : undefined;
}

/** LES LIGNÉES : pour chaque Graine, son code actif et ses amies. */
export function lignees(clients: readonly FicheAmb[], demandes: readonly DemandeLue[], rdvs: readonly RdvLu[]): Map<string, Lignee> {
  const parId = new Map(clients.map((c) => [c.id, c]));
  const vers = cheminsDesCodes(clients);
  const res = new Map<string, Lignee>();
  for (const c of clients) {
    const code = codeActifDe(c);
    if (!c || !code) continue;
    res.set(code, { code, clientId: c.id, prenom: prenomDuNom(c.name), telephone: c.phone, depuis: c.since, filleules: [] });
  }
  /* ① Les fiches rattachées à la main (ou depuis leur réservation), par le
     code actif ou par l'ancien code de la même fiche. */
  for (const c of clients) {
    if (!c || c.archived || !c.parraineePar) continue;
    const l = res.get(vers.get(c.parraineePar) ?? '');
    if (!l || l.clientId === c.id) continue;
    l.filleules.push({ cle: `c:${c.id}`, prenom: prenomDuNom(c.name) || 'Une amie', clientId: c.id, ...etatDeLaFiche(c.id, rdvs), recompenseId: `parr-c-${c.id}` });
  }
  /* ② Les réservations du site faites avec le code (actif, ou ancien code
     de la même fiche : l'amie invitée avant le lancement). Une demande de
     RAPPEL (une consultation, une création : pas de rendez-vous) rejoint
     sa fiche quand le Trône la convertit (9 octobre 2026). */
  for (const d of demandes) {
    if (!d || d.codeRaison !== 'parrainage' || !d.parrainDe) continue;
    const l = res.get(vers.get(d.parrainDe) ?? '');
    if (!l) continue;
    const appt = d.apptId ? rdvs.find((r) => r.id === d.apptId) : undefined;
    const cid = appt?.clientId && parId.has(appt.clientId) ? appt.clientId
      : !d.apptId && d.clientId && parId.has(d.clientId) ? d.clientId : undefined;
    if (cid && cid === l.clientId) continue;
    const cle = cid ? `c:${cid}` : `d:${d.id}`;
    const deja = l.filleules.find((f) => f.cle === cle);
    if (deja) {
      /* La même amie, par les deux chemins : la réservation donne son nom à
         la récompense (identifiant d'avant les ambassadrices). */
      deja.demandeId = d.id;
      deja.recompenseId = `parr-${d.id}`;
      if (d.cadeauMarraineRemisLe && !deja.remisALaMain) deja.remisALaMain = !!d.cadeauMarraineRemisLe;
      continue;
    }
    const etat = cid
      ? etatDeLaFiche(cid, rdvs)
      : appt?.status === 'honoré' ? { etat: 'venue' as const, venueLe: appt.date, dateRdv: appt.date }
        : appt && appt.status !== 'annulé' ? { etat: 'a-venir' as const, dateRdv: appt.date }
          : { etat: (appt ? 'annulee' : 'sans-rdv') as EtatDeLaFilleule, dateRdv: appt?.date };
    l.filleules.push({
      cle, prenom: prenomDuNom(cid ? parId.get(cid)?.name : d.prenom) || 'Une amie',
      ...(cid ? { clientId: cid } : {}), demandeId: d.id, ...etat, recompenseId: `parr-${d.id}`,
      ...(d.cadeauMarraineRemisLe ? { remisALaMain: true } : {}),
    });
  }
  for (const l of res.values()) l.filleules.sort((a, b) => (b.venueLe ?? b.dateRdv ?? '').localeCompare(a.venueLe ?? a.dateRdv ?? ''));
  return res;
}

/** Les amies venues d'une lignée. */
export const venuesDe = (l: Lignee | undefined): FilleuleAmb[] => (l?.filleules ?? []).filter((f) => !!f.venueLe);

/** L'écho : les amies VENUES de ses amies, avec l'amie par qui elles
    viennent. Une ligne d'honneur depuis le 9 octobre 2026 : plus aucune
    récompense. */
export function echosDe(l: Lignee, tout: Map<string, Lignee>, parCodeDeFiche: Map<string, string>): { f: FilleuleAmb; via: FilleuleAmb }[] {
  const sortie: { f: FilleuleAmb; via: FilleuleAmb }[] = [];
  for (const via of l.filleules) {
    if (!via.clientId) continue;
    const code = parCodeDeFiche.get(via.clientId);
    const sous = code ? tout.get(code) : undefined;
    for (const f of venuesDe(sous)) if (f.clientId !== l.clientId) sortie.push({ f, via });
  }
  return sortie;
}

export const ajouteMois = (iso: string, mois: number): string => {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + mois);
  return d.toISOString().slice(0, 10);
};
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const moisDit = (aaaaMm: string): string => MOIS[Number(aaaaMm.slice(5, 7)) - 1] ?? aaaaMm;

export type Poses = {
  /** Les récompenses NEUVES, par fiche d'ambassadrice. */
  parFiche: Map<string, SoinOffert[]>;
  /** Les demandes du site dont la récompense vient d'être posée. */
  demandesMarquees: string[];
  /** Les remerciements à envoyer (seulement si la Maison l'a allumé). */
  mercis: { clientId: string; telephone: string; prenomMarraine: string; prenomFilleule: string; libelle: string }[];
};

/** CE QUI DOIT ÊTRE POSÉ : un merci par amie venue, sur la fiche de sa
    Graine, et rien d'autre (ni écho, ni rang, ni défi, depuis le 9 octobre
    2026). Chaque récompense porte un identifiant tiré de ce qui l'a gagnée,
    et un identifiant déjà vu (sur la fiche, ou dans son archive) ne se pose
    plus : la reposer ne la double jamais, deux postes n'en font qu'une, une
    récompense retirée au lancement ne revient pas. */
export function recompensesAPoser(
  clients: readonly FicheAmb[], L: Map<string, Lignee>, reglage: ReglageAmbassade, aujourdhui: string,
  nomDuService: (id: string) => string | undefined = () => undefined,
): Poses {
  const poses: Poses = { parFiche: new Map(), demandesMarquees: [], mercis: [] };
  const lance = reglage.lanceLe?.slice(0, 10);
  if (!lance) return poses;
  const expireLe = ajouteMois(aujourdhui, Math.max(1, reglage.validiteMois ?? 6));
  const remise = borne(reglage.remisePct, REMISE_PAR_DEFAUT);
  for (const c of clients) {
    const code = codeActifDe(c);
    if (!c || !code) continue;
    const l = L.get(code);
    if (!l) continue;
    const deja = new Set([...(c.soinsOfferts ?? []), ...(c.avantLesDouzeLunes?.soinsRetires ?? [])].map((s) => s?.id));
    const neuves: SoinOffert[] = [];
    for (const f of venuesDe(l)) {
      if (f.remisALaMain || deja.has(f.recompenseId)) continue;
      /* LA DATE MÉTIER : l'amie venue avant le lancement ne pose rien. */
      if (!f.venueLe || f.venueLe.slice(0, 10) < lance) continue;
      deja.add(f.recompenseId);
      /* LA BORNE ANTI-RAFALE DU REMERCIEMENT (9 octobre 2026) : le message
         ne part que pour une amie venue depuis que sa marraine est Graine.
         Venue AVANT (invitée par l'ancien code, décision 5), elle vaut
         toujours son merci, posé EN SILENCE : poser d'un geste quinze
         Graines, ou baisser N, enverrait sinon quinze messages d'un coup. */
      const merci = !!reglage.merciParWhatsApp && f.venueLe.slice(0, 10) >= (c.graine?.le ?? '9999-12-31');
      neuves.push({
        id: f.recompenseId, genre: 'a-choisir', libelle: 'Une récompense à choisir',
        raison: `Pour la venue de ${f.prenom}`, poseLe: aujourdhui, expireLe, source: 'amie', pct: remise,
        ...(reglage.soinMarraineServiceId ? { serviceId: reglage.soinMarraineServiceId } : {}),
        ...(merci ? { merciLe: aujourdhui } : {}),
      });
      if (f.demandeId) poses.demandesMarquees.push(f.demandeId);
      if (merci) poses.mercis.push({ clientId: c.id, telephone: c.phone, prenomMarraine: prenomDuNom(c.name), prenomFilleule: f.prenom, libelle: 'un soin offert ou une remise, à votre choix' });
    }
    if (neuves.length) poses.parFiche.set(c.id, neuves);
  }
  return poses;
}

/** LE CHOIX DE LA CLIENTE, REPORTÉ sur la récompense : un soin (sa
    prestation), ou une remise (son produit). Seules les récompenses « à
    choisir » encore à utiliser changent. */
export function choixReportes(
  c: FicheAmb, nomDuService: (id: string) => string | undefined = () => undefined, nomDuProduit: (id: string) => string | undefined = () => undefined,
): SoinOffert[] | null {
  const choix = c.choixRecompenses ?? {};
  let change = false;
  const soins = (c.soinsOfferts ?? []).map((s) => {
    const ch = choix[s.id];
    if (!ch || s.genre !== 'a-choisir' || s.utiliseLe) return s;
    change = true;
    if (ch.genre === 'soin') return { ...s, genre: 'soin' as const, libelle: (s.serviceId && nomDuService(s.serviceId)) || 'Un soin offert' };
    const pct = s.pct ?? REMISE_PAR_DEFAUT;
    const produit = ch.produitId ? nomDuProduit(ch.produitId) : undefined;
    return { ...s, genre: 'remise' as const, ...(ch.produitId ? { produitId: ch.produitId } : {}), libelle: `−${pct} % sur ${produit ?? 'un produit de la Gamme'}` };
  });
  return change ? soins : null;
}

/** LE RATTACHEMENT DEPUIS LE SITE : l'amie qui a réservé avec le code d'une
    Graine (actif, ou l'ancien code de la même fiche) et dont le rendez-vous
    a trouvé sa fiche porte désormais ce code sur sa fiche. Un code éteint
    ne rattache personne. */
export function rattachementsDuSite(clients: readonly FicheAmb[], demandes: readonly DemandeLue[], rdvs: readonly RdvLu[]): { clientId: string; code: string; le: string }[] {
  const parId = new Map(clients.map((c) => [c.id, c]));
  const vers = cheminsDesCodes(clients);
  const sortie: { clientId: string; code: string; le: string }[] = [];
  const vus = new Set<string>();
  for (const d of demandes) {
    if (d?.codeRaison !== 'parrainage' || !d.parrainDe || (!d.apptId && !d.clientId)) continue;
    const actif = vers.get(d.parrainDe);
    if (!actif) continue;
    /* Une demande de rappel n'a pas de rendez-vous : sa fiche est celle de
       sa conversion (9 octobre 2026). */
    const cid = d.apptId ? rdvs.find((r) => r.id === d.apptId)?.clientId : d.clientId;
    const c = cid ? parId.get(cid) : undefined;
    if (!c || c.parraineePar || c.codeParrain === d.parrainDe || codeActifDe(c) === actif || vus.has(c.id)) continue;
    vus.add(c.id);
    sortie.push({ clientId: c.id, code: d.parrainDe, le: d.createdAt });
  }
  return sortie;
}

/** POURQUOI LE TRÔNE REFUSE « Vient de la part de ». Rend `null` si c'est
    bon. La marraine est une Graine : la fiche dont le code ACTIF est ce
    code. */
export function pourquoiPasDeMarraine(
  fiche: FicheAmb, code: string, clients: readonly FicheAmb[], rdvs: readonly RdvLu[], demandes: readonly DemandeLue[] = [],
): string | null {
  const marraine = clients.find((c) => codeActifDe(c) === code);
  if (!marraine) return 'Ce code n’est celui d’aucune Graine : seule une Graine parraine une amie.';
  if (marraine.id === fiche.id) return 'C’est son propre code : il se partage avec une amie.';
  /* Une visite est un jour (décision du 9 octobre 2026). */
  const jours = new Set(rdvs.filter((r) => r.clientId === fiche.id && r.status === 'honoré').map((r) => String(r.date).slice(0, 10)));
  if (jours.size > 1) return 'Elle est déjà venue plusieurs fois : le parrainage accueille les nouvelles clientes.';
  /* LA MARRAINE ACTUELLE a-t-elle déjà reçu sa récompense pour elle ? Par
     la fiche (`parr-c-…`) ou par sa réservation du site (`parr-<demande>`),
     dans ses récompenses ou dans celles que le lancement a rangées. */
  if (fiche.parraineePar) {
    const p = fiche.parraineePar;
    const actuelle = clients.find((c) => c.codeParrain === p || codeActifDe(c) === p || c.avantLesDouzeLunes?.codeParrain === p);
    const ids = new Set([`parr-c-${fiche.id}`, ...demandes
      .filter((d) => d.codeRaison === 'parrainage' && d.apptId && rdvs.find((r) => r.id === d.apptId)?.clientId === fiche.id)
      .map((d) => `parr-${d.id}`)]);
    const recues = [...(actuelle?.soinsOfferts ?? []), ...(actuelle?.avantLesDouzeLunes?.soinsRetires ?? [])];
    if (recues.some((s) => ids.has(s?.id))) return 'Sa marraine a déjà reçu sa récompense pour elle : on ne la déplace plus.';
  }
  return null;
}

/** CE QUE MA COURONNE MONTRE à la Graine : des prénoms, des états, ses
    échos (une ligne d'honneur), son rang. Plus de défi depuis le 9 octobre
    2026. Rien d'autre ne quitte le Trône. (`reglage`, `aujourdhui` et
    `nomDuService` restent dans la signature, que d'autres appellent.) */
export function resumeDeLAmbassade(
  l: Lignee, L: Map<string, Lignee>, clients: readonly FicheAmb[], reglage: ReglageAmbassade, aujourdhui: string,
  nomDuService: (id: string) => string | undefined = () => undefined,
): ResumeParrainage {
  const parCodeDeFiche = codesActifsParFiche(clients);
  const venues = venuesDe(l);
  return {
    filleules: l.filleules.map((f) => ({ prenom: f.prenom, etat: f.etat, ...((f.venueLe ?? f.dateRdv) ? { date: f.venueLe ?? f.dateRdv } : {}) })),
    echos: echosDe(l, L, parCodeDeFiche).map(({ f, via }) => ({ prenom: f.prenom, via: via.prenom, ...(f.venueLe ? { date: f.venueLe } : {}) })),
    venues: venues.length,
    rang: rangDe(venues.length).id,
  };
}

/** LE CLASSEMENT DU MOIS : les ambassadrices qui ont fait venir une amie ce
    mois, puis depuis toujours. Dix lignes, un prénom chacune. */
export function classementDuMois(L: Map<string, Lignee>, aujourdhui: string): ClassementAmbassade {
  const mois = aujourdhui.slice(0, 7);
  const lignes = [...L.values()]
    .filter((l) => l.clientId)
    .map((l) => {
      const venues = venuesDe(l);
      return { prenom: l.prenom || 'Une cliente', rang: rangDe(venues.length).id, ceMois: venues.filter((f) => f.venueLe!.startsWith(mois)).length, amies: venues.length };
    })
    .filter((x) => x.amies > 0)
    .sort((a, b) => b.ceMois - a.ceMois || b.amies - a.amies || a.prenom.localeCompare(b.prenom))
    .slice(0, 10);
  return { mois, lignes };
}

/** LES CHIFFRES DU TABLEAU : nouvelles clientes du mois (première visite
    honorée), dont celles venues par une amie. */
export function chiffresDuMois(clients: readonly FicheAmb[], L: Map<string, Lignee>, rdvs: readonly RdvLu[], aujourdhui: string): { nouvelles: number; parUneAmie: number } {
  const mois = aujourdhui.slice(0, 7);
  const nouvelles = new Set(clients.filter((c) => (premiereVisite(c.id, rdvs) ?? '').startsWith(mois)).map((c) => c.id));
  const parUneAmie = new Set<string>();
  for (const l of L.values()) for (const f of venuesDe(l)) if (f.venueLe!.startsWith(mois)) parUneAmie.add(f.cle);
  return { nouvelles: Math.max(nouvelles.size, parUneAmie.size), parUneAmie: parUneAmie.size };
}

/* ══ LE FOYER, DANS LE CERCLE — 29 septembre 2026 ══════════════════════
   Le Cercle et les ambassadrices réunis (maquette « Le Cercle réuni »,
   validée). Un SCEAU DU FOYER atteint (la dépense cumulée de la maisonnée
   passe son seuil) devient une récompense comme les autres : posée sur la
   fiche de celle qui règle le foyer, visible dans Ma Couronne, offerte à la
   caisse en un geste. Avant ce jour, le Trône disait seulement « à offrir ».
   Un sceau par palier et par foyer, jamais deux (son identifiant le dit). */
export type FoyerLu = { famId: string; nom: string; payeurId: string; depense: number };
export type SceauLu = { id: string; seuilXof: number; serviceId: string; desc?: string };

export function sceauxDuFoyerAPoser(
  foyers: readonly FoyerLu[], sceaux: readonly SceauLu[], clients: readonly FicheAmb[], aujourdhui: string,
  validiteMois = 6, nomDuService: (id: string) => string | undefined = () => undefined,
): Map<string, SoinOffert[]> {
  const sortie = new Map<string, SoinOffert[]>();
  const expireLe = ajouteMois(aujourdhui, Math.max(1, validiteMois));
  for (const f of foyers) {
    const payeur = clients.find((c) => c.id === f.payeurId);
    if (!payeur || payeur.archived) continue;
    const deja = new Set((payeur.soinsOfferts ?? []).map((s) => s.id));
    for (const t of sceaux) {
      if (!t.serviceId || f.depense < t.seuilXof) continue;
      const id = `foyer-${t.id}-${f.famId}`;
      if (deja.has(id)) continue;
      deja.add(id);
      const liste = sortie.get(payeur.id) ?? [];
      liste.push({
        id, genre: 'soin', serviceId: t.serviceId, libelle: nomDuService(t.serviceId) ?? 'Un soin offert',
        raison: `Sceau du Foyer${f.nom ? ` · ${f.nom}` : ''}`, poseLe: aujourdhui, expireLe, source: 'foyer',
      });
      sortie.set(payeur.id, liste);
    }
  }
  return sortie;
}
