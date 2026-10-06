import type { Client } from './clients';
import {
  FORME_DU_CODE, RANGS, prenomDuNom, rangDe,
  type ClassementAmbassade, type EtatDeLaFilleule, type ResumeParrainage, type SoinOffert,
} from './parrainage-pur';

/* ══ LES AMBASSADRICES DE LA MAISON — 28 septembre 2026 ══════════════════
   Maquette validée (canvas « La carte de marraine MND », page « Les
   ambassadrices ») : « construits » (Yéman).

   CHAQUE CLIENTE EST UNE AMBASSADRICE. Ce module est PUR : il lit les
   fiches, les demandes du site et le carnet, et dit ce qui doit être. Le
   Trône l'applique (`useParrainageVivant`), Ma Couronne et la caisse le
   lisent, `verifie-le-parrainage` l'éprouve.

   ── UNE AMIE, DEUX CHEMINS. Elle réserve sur le site avec le code (la
   demande porte `parrainDe`), ou le Trône la rattache à la main (« Vient de
   la part de », `parraineePar` sur sa fiche). Les deux se rejoignent sur SA
   fiche dès que son rendez-vous y est rattaché : une amie ne compte qu'une
   fois.

   ── UNE AMIE COMPTE QUAND ELLE EST VENUE : sa première visite HONORÉE. Une
   réservation seule ne rend rien.

   ── DEUX GÉNÉRATIONS, JAMAIS D'ARGENT. L'amie vaut une récompense au choix
   (soin offert ou remise sur un produit) ; l'amie d'une amie vaut un écho
   (une remise plus petite) ; l'arbre s'arrête là. Des soins et des remises,
   rien à payer pour entrer : c'est un programme de fidélité, pas une vente
   pyramidale. */

export type RdvLu = { id: string; status: string; date: string; clientId?: string };

export type FicheAmb = Pick<Client, 'id' | 'name' | 'phone' | 'since'>
  & Partial<Pick<Client, 'codeParrain' | 'archived' | 'soinsOfferts' | 'parrainage' | 'parraineePar' | 'parraineeLe' | 'choixRecompenses'>>;

export type DemandeLue = {
  id: string; prenom: string; telephone: string; createdAt: string;
  codeParrain?: string; codeRaison?: string; parrainDe?: string; apptId?: string;
  cadeauMarraineRemisLe?: string;
};

export type ReglageAmbassade = {
  soinMarraineServiceId?: string;
  /** La remise « au choix », sur un produit de la Gamme (20 % par défaut). */
  remisePct?: number;
  /** L'écho, deuxième génération (10 % par défaut). */
  echoPct?: number;
  validiteMois?: number;
  /** Le soin offert une fois, au rang atteint. Sans prestation : rien. */
  bonusRangs?: Partial<Record<'tresse' | 'couronne' | 'reine', string>>;
  defi?: { actif: boolean; objectif: number; serviceId?: string };
  merciParWhatsApp?: boolean;
};

export const REMISE_PAR_DEFAUT = 20;
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
  code: string;
  /** La fiche de l'ambassadrice ; absente pour une marraine du site pas encore cliente. */
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

/** LES LIGNÉES : pour chaque code, l'ambassadrice et ses amies. */
export function lignees(clients: readonly FicheAmb[], demandes: readonly DemandeLue[], rdvs: readonly RdvLu[]): Map<string, Lignee> {
  const parId = new Map(clients.map((c) => [c.id, c]));
  const res = new Map<string, Lignee>();
  for (const c of clients) {
    if (!c || c.archived || !c.codeParrain || !FORME_DU_CODE.test(c.codeParrain)) continue;
    res.set(c.codeParrain, { code: c.codeParrain, clientId: c.id, prenom: prenomDuNom(c.name), telephone: c.phone, depuis: c.since, filleules: [] });
  }
  for (const d of demandes) {
    if (!d?.codeParrain || !FORME_DU_CODE.test(d.codeParrain) || res.has(d.codeParrain)) continue;
    res.set(d.codeParrain, { code: d.codeParrain, demandeId: d.id, prenom: prenomDuNom(d.prenom), telephone: d.telephone, depuis: d.createdAt, filleules: [] });
  }
  /* ① Les fiches rattachées à la main (ou depuis leur réservation). */
  for (const c of clients) {
    if (!c || c.archived || !c.parraineePar) continue;
    const l = res.get(c.parraineePar);
    if (!l || l.clientId === c.id) continue;
    l.filleules.push({ cle: `c:${c.id}`, prenom: prenomDuNom(c.name) || 'Une amie', clientId: c.id, ...etatDeLaFiche(c.id, rdvs), recompenseId: `parr-c-${c.id}` });
  }
  /* ② Les réservations du site faites avec le code. */
  for (const d of demandes) {
    if (!d || d.codeRaison !== 'parrainage' || !d.parrainDe) continue;
    const l = res.get(d.parrainDe);
    if (!l) continue;
    const appt = d.apptId ? rdvs.find((r) => r.id === d.apptId) : undefined;
    const cid = appt?.clientId && parId.has(appt.clientId) ? appt.clientId : undefined;
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

/** L'écho : les amies VENUES de ses amies, avec l'amie par qui elles viennent. */
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

/** CE QUI DOIT ÊTRE POSÉ. Chaque récompense porte un identifiant tiré de ce
    qui l'a gagnée : la reposer ne la double jamais, deux postes n'en font
    qu'une. */
export function recompensesAPoser(
  clients: readonly FicheAmb[], L: Map<string, Lignee>, reglage: ReglageAmbassade, aujourdhui: string,
  nomDuService: (id: string) => string | undefined = () => undefined,
): Poses {
  const poses: Poses = { parFiche: new Map(), demandesMarquees: [], mercis: [] };
  const expireLe = ajouteMois(aujourdhui, Math.max(1, reglage.validiteMois ?? 6));
  const remise = borne(reglage.remisePct, REMISE_PAR_DEFAUT);
  const echo = borne(reglage.echoPct, ECHO_PAR_DEFAUT);
  const parCodeDeFiche = new Map(clients.filter((c) => c?.codeParrain).map((c) => [c.id, c.codeParrain as string]));
  for (const c of clients) {
    if (!c || c.archived || !c.codeParrain) continue;
    const l = L.get(c.codeParrain);
    if (!l) continue;
    const deja = new Set((c.soinsOfferts ?? []).map((s) => s.id));
    const neuves: SoinOffert[] = [];
    const pose = (s: SoinOffert) => { if (!deja.has(s.id)) { deja.add(s.id); neuves.push(s); } };
    const venues = venuesDe(l);
    for (const f of venues) {
      if (f.remisALaMain || deja.has(f.recompenseId)) continue;
      const merci = !!reglage.merciParWhatsApp;
      pose({
        id: f.recompenseId, genre: 'a-choisir', libelle: 'Une récompense à choisir',
        raison: `Pour la venue de ${f.prenom}`, poseLe: aujourdhui, expireLe, source: 'amie', pct: remise,
        ...(reglage.soinMarraineServiceId ? { serviceId: reglage.soinMarraineServiceId } : {}),
        ...(merci ? { merciLe: aujourdhui } : {}),
      });
      if (f.demandeId) poses.demandesMarquees.push(f.demandeId);
      if (merci) poses.mercis.push({ clientId: c.id, telephone: c.phone, prenomMarraine: prenomDuNom(c.name), prenomFilleule: f.prenom, libelle: 'un soin offert ou une remise, à votre choix' });
    }
    for (const { f, via } of echosDe(l, L, parCodeDeFiche)) {
      pose({
        id: `echo-${f.recompenseId}`, genre: 'remise', pct: echo, libelle: `−${echo} % sur un produit`,
        raison: `Écho : ${f.prenom}, venue grâce à ${via.prenom}`, poseLe: aujourdhui, expireLe, source: 'echo',
      });
    }
    for (const r of RANGS) {
      const service = r.id === 'tresse' || r.id === 'couronne' || r.id === 'reine' ? reglage.bonusRangs?.[r.id] : undefined;
      if (!service || venues.length < r.seuil) continue;
      pose({
        id: `rang-${r.id}-${c.id}`, genre: 'soin', serviceId: service, libelle: nomDuService(service) ?? 'Un soin offert',
        raison: `Rang ${r.nom} atteint`, poseLe: aujourdhui, expireLe, source: 'rang',
      });
    }
    const defi = reglage.defi;
    if (defi?.actif && defi.objectif > 0 && defi.serviceId) {
      const mois = aujourdhui.slice(0, 7);
      if (venues.filter((f) => f.venueLe!.startsWith(mois)).length >= defi.objectif) {
        pose({
          id: `defi-${mois}-${c.id}`, genre: 'soin', serviceId: defi.serviceId, libelle: nomDuService(defi.serviceId) ?? 'Un soin offert',
          raison: `Défi de ${moisDit(mois)} relevé`, poseLe: aujourdhui, expireLe, source: 'defi',
        });
      }
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

/** LE RATTACHEMENT DEPUIS LE SITE : l'amie qui a réservé avec un code et dont
    le rendez-vous a trouvé sa fiche porte désormais ce code sur sa fiche. */
export function rattachementsDuSite(clients: readonly FicheAmb[], demandes: readonly DemandeLue[], rdvs: readonly RdvLu[]): { clientId: string; code: string; le: string }[] {
  const parId = new Map(clients.map((c) => [c.id, c]));
  const sortie: { clientId: string; code: string; le: string }[] = [];
  const vus = new Set<string>();
  for (const d of demandes) {
    if (d?.codeRaison !== 'parrainage' || !d.parrainDe || !d.apptId) continue;
    const cid = rdvs.find((r) => r.id === d.apptId)?.clientId;
    const c = cid ? parId.get(cid) : undefined;
    if (!c || c.parraineePar || c.codeParrain === d.parrainDe || vus.has(c.id)) continue;
    vus.add(c.id);
    sortie.push({ clientId: c.id, code: d.parrainDe, le: d.createdAt });
  }
  return sortie;
}

/** POURQUOI LE TRÔNE REFUSE « Vient de la part de ». Rend `null` si c'est bon. */
export function pourquoiPasDeMarraine(
  fiche: FicheAmb, code: string, clients: readonly FicheAmb[], rdvs: readonly RdvLu[], demandes: readonly DemandeLue[] = [],
): string | null {
  const marraine = clients.find((c) => c.codeParrain === code && !c.archived);
  if (!marraine) return 'Ce code ne correspond à aucune cliente.';
  if (marraine.id === fiche.id) return 'C’est son propre code : il se partage avec une amie.';
  const venues = rdvs.filter((r) => r.clientId === fiche.id && r.status === 'honoré').length;
  if (venues > 1) return 'Elle est déjà venue plusieurs fois : le parrainage accueille les nouvelles clientes.';
  /* LA MARRAINE ACTUELLE a-t-elle déjà reçu sa récompense pour elle ? Par
     la fiche (`parr-c-…`) ou par sa réservation du site (`parr-<demande>`). */
  if (fiche.parraineePar) {
    const actuelle = clients.find((c) => c.codeParrain === fiche.parraineePar);
    const ids = new Set([`parr-c-${fiche.id}`, ...demandes
      .filter((d) => d.codeRaison === 'parrainage' && d.apptId && rdvs.find((r) => r.id === d.apptId)?.clientId === fiche.id)
      .map((d) => `parr-${d.id}`)]);
    if ((actuelle?.soinsOfferts ?? []).some((s) => ids.has(s.id))) return 'Sa marraine a déjà reçu sa récompense pour elle : on ne la déplace plus.';
  }
  return null;
}

/** CE QUE MA COURONNE MONTRE à l'ambassadrice : des prénoms, des états, son
    rang, son défi. Rien d'autre ne quitte le Trône. */
export function resumeDeLAmbassade(
  l: Lignee, L: Map<string, Lignee>, clients: readonly FicheAmb[], reglage: ReglageAmbassade, aujourdhui: string,
  nomDuService: (id: string) => string | undefined = () => undefined,
): ResumeParrainage {
  const parCodeDeFiche = new Map(clients.filter((c) => c?.codeParrain).map((c) => [c.id, c.codeParrain as string]));
  const venues = venuesDe(l);
  const mois = aujourdhui.slice(0, 7);
  const defi = reglage.defi;
  return {
    filleules: l.filleules.map((f) => ({ prenom: f.prenom, etat: f.etat, ...((f.venueLe ?? f.dateRdv) ? { date: f.venueLe ?? f.dateRdv } : {}) })),
    echos: echosDe(l, L, parCodeDeFiche).map(({ f, via }) => ({ prenom: f.prenom, via: via.prenom, ...(f.venueLe ? { date: f.venueLe } : {}) })),
    venues: venues.length,
    rang: rangDe(venues.length).id,
    ...(defi?.actif && defi.objectif > 0 && defi.serviceId ? {
      defi: {
        mois, objectif: defi.objectif,
        fait: Math.min(defi.objectif, venues.filter((f) => f.venueLe!.startsWith(mois)).length),
        libelle: nomDuService(defi.serviceId) ?? 'Un soin offert',
      },
    } : {}),
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
