/* ══ AUJOURD'HUI, LA VUE D'ENTRÉE DE L'ASSISTANT MAISON · 26 octobre 2026 ═══
   Spécification `docs/spec-assistant-maison.md` §5.1 et maquette validée
   `public/maquette-assistant-maison.html` (vue 1) : « ce qu'il va dire, à
   qui, pourquoi ; ce qui attend son oui ; ce qui attend un humain ; ce qui
   est parti ». Des chiffres, pas des phrases (Yéman, octobre 2026).

   CE FICHIER EST PUR : il ne lit aucun magasin. L'écran lui donne le plan du
   jour (`planDuJour`), la table `envois`, les fils, les signalements, les
   demandes et les appels ; il rend des lignes, des tuiles et des mots.
   Banc : `scripts/verifie-assistant-aujourdhui.mjs` (et `--prouve`).

   QUATRE RÈGLES QUI NE SE DISCUTENT PAS :
     · la ligne `envois` d'une situation se retrouve par son identifiant
       DÉTERMINISTE (`idDeLaLigne`), jamais par « le dernier envoi de cette
       cliente » : la ligne d'hier n'est pas celle d'aujourd'hui ;
     · un envoi écarté ou périmé n'est jamais « parti » ;
     · le jour se lit à l'heure de Cotonou (`jourDuSalon`), jamais sur un ISO
       UTC coupé à dix signes : à 0 h 30 à Cotonou, on est déjà demain ;
     · un fil WhatsApp n'a qu'un juge, `Fil.attendUneReponse` ; ici on le lit,
       on ne le refait pas.

   LES FRANCS EN JEU se disent en CALIBRE ET FOURCHETTE, jamais au franc près
   (mémoire « Fourchette du modèle », 16 octobre 2026 : la cliente ne voit plus
   son compte exact de locks). Un « 32 450 F » lirait comme une promesse, alors
   que la Caisse tranchera au fauteuil ; « de 28 000 F à 36 000 F » dit ce
   qu'on sait. */
import { canalDe, estUneQuestionFranche, idDeLaLigne, type CodeAFaire, type FicheDeGerard, type Situation } from './gerard-pur';
import {
  DEVENU_DIT, canalDit, compteDuJournal, devenuDe, envoisDeLaPeriode, estARegarder, jourDuSalon, motifEnClair, typeDit,
  type CompteDuJournal, type DevenuDeLEnvoi, type EnvoiLu,
} from './envois';
import { EN_ATTENTE, EN_ENVOI, RETENU, heureDuSalon, quandIlPart } from './salle-des-envois';
import { enRetard, niveauDe, souciDe, type Signalement } from './entre-deux-pur';
import type { Fil } from './conversations';
import { francs } from './ia-faits-pur';

/** Ce que la vue lit d'une ligne `envois` : le journal (`EnvoiLu`), plus les
    champs que l'Assistant y pose (`LigneDeGerard`) et ceux de la salle. */
export type EnvoiDuJour = EnvoiLu & {
  genre?: string; envie?: string; codePromo?: string; partA?: string; calme?: boolean; deposeLe?: string;
  /** La remise à faire au départ réel (lot 2), et ce que sa fabrication a dit (« jour passé, pas de remise »). */
  codeAFaire?: CodeAFaire; detailRemise?: string;
};

/* ── LES FRANCS EN JEU : un calibre, une fourchette ──────────────────────── */
export type SourceDesFrancs = 'rdv-pose' | 'dernier-rituel' | 'tarif-de-la-tete';
export type Fourchette = { calibre: number; de: number; a: number };
export type FrancsEnJeu = Fourchette & { source: SourceDesFrancs };
/** La marge de part et d'autre du calibre, en pour cent ; jamais moins d'un millier. */
export const MARGE_DES_FRANCS_PCT = 10;
export const PAS_DES_FRANCS = 1000;

/** Le calibre (arrondi au millier) et sa fourchette (dix pour cent, un millier
    au moins, de part et d'autre, arrondis au millier) : jamais le compte exact. */
export function fourchetteDesFrancs(xof: number): Fourchette {
  const brut = Math.max(0, Number.isFinite(xof) ? xof : 0);
  const calibre = Math.round(brut / PAS_DES_FRANCS) * PAS_DES_FRANCS;
  const marge = Math.max(PAS_DES_FRANCS, Math.ceil((brut * MARGE_DES_FRANCS_PCT) / 100 / PAS_DES_FRANCS) * PAS_DES_FRANCS);
  return { calibre, de: Math.max(0, calibre - marge), a: calibre + marge };
}

/** CE QUE SA VENUE PEUT RAPPORTER, dans cet ordre : le prix de son RDV posé
    (`apptTotalXof`), sinon le prix de son dernier rituel honoré (`priceXof`),
    sinon le tarif de sa tête (`tarifDeLaTeteXof`). L'écran calcule les trois
    candidats, le pur choisit et arrondit. Rien d'inventé : sans aucun des
    trois, pas de chiffre. */
export function francsEnJeu(o: { rdvPoseXof?: number | null; dernierRituelXof?: number | null; tarifDeLaTeteXof?: number | null }): FrancsEnJeu | null {
  const candidats: [SourceDesFrancs, number | null | undefined][] = [
    ['rdv-pose', o.rdvPoseXof], ['dernier-rituel', o.dernierRituelXof], ['tarif-de-la-tete', o.tarifDeLaTeteXof],
  ];
  const choisi = candidats.find(([, x]) => typeof x === 'number' && Number.isFinite(x) && x > 0);
  if (!choisi) return null;
  return { ...fourchetteDesFrancs(choisi[1] as number), source: choisi[0] };
}

/** La somme des fourchettes d'une liste : le total du jour reste une fourchette. */
export function sommeDesFrancs(liste: readonly (Fourchette | null | undefined)[]): Fourchette | null {
  const vrais = liste.filter((f): f is Fourchette => !!f);
  if (!vrais.length) return null;
  return vrais.reduce<Fourchette>((s, f) => ({ calibre: s.calibre + f.calibre, de: s.de + f.de, a: s.a + f.a }), { calibre: 0, de: 0, a: 0 });
}

/** « de 28 000 F à 36 000 F » : la fourchette dite ; rien sans chiffre. */
export const fourchetteDite = (f: Pick<Fourchette, 'de' | 'a'> | null | undefined): string =>
  (f ? `de ${francs(f.de)} à ${francs(f.a)}` : '');

/* ── LE PLAN FUSIONNÉ AVEC LA SALLE : la liste « Part aujourd'hui » ──────── */
export type EtatDeLaLigne =
  /** Rien en salle encore : le passage du matin n'a pas déposé (Ma Couronne, ou un modèle WhatsApp approuvé chez Meta). */
  | 'pas-encore'
  /** L'Assistant est en pause : rien ne part, le bouton WhatsApp se tait. */
  | 'en-pause'
  | 'en-salle' | 'retenue' | 'partie' | 'echec'
  /** WhatsApp : le message est écrit, il attend un toucher. */
  | 'a-son-toucher'
  /** WhatsApp : touché, noté au journal. */
  | 'a-la-main'
  | 'ecartee' | 'perimee';

export type LigneDuJour = {
  clientId: string;
  situation: Situation;
  canal: Situation['canal'];
  /** La ligne `envois` retrouvée par son identifiant déterministe, s'il y en a une. */
  envoi?: EnvoiDuJour;
  etat: EtatDeLaLigne;
  /** La colonne Départ : « part à 8 h 10 », « à son toucher », « remis »… */
  depart: string;
  /** « CREUX 15 % », « ANNIV 10 % » ; rien sans remise. */
  remise?: string;
  /** Le code fabriqué au départ réel, lu sur la ligne `envois` seule. */
  codePromo?: string;
  francs: FrancsEnJeu | null;
};

export type ResumeDuJour = {
  lignes: number; couronne: number; whatsapp: number;
  /** Les situations qui portent une remise (jour creux, anniversaire). */
  remises: number;
  enSalle: number; parties: number; aSonToucher: number; ecartees: number;
  francs: Fourchette | null;
};

export type FusionDuJour = { lignes: LigneDuJour[]; resume: ResumeDuJour };

const PARTIE: ReadonlySet<DevenuDeLEnvoi> = new Set(['lu', 'remis', 'en-route', 'non-remis', 'en-cours']);

/** Où en est la ligne d'une situation. Sans ligne : elle attend le passage
    (Ma Couronne, ou un modèle WhatsApp qui part seul) ou son toucher (WhatsApp
    pas encore approuvé), ou dort avec la pause. */
function etatDe(e: EnvoiDuJour | undefined, s: Situation, actif: boolean, seule: boolean): EtatDeLaLigne {
  if (!e) return !actif ? 'en-pause' : s.canal === 'whatsapp' && !seule ? 'a-son-toucher' : 'pas-encore';
  if (e.statut === EN_ATTENTE || e.statut === EN_ENVOI) return 'en-salle';
  if (e.statut === RETENU) return 'retenue';
  const d = devenuDe(e);
  if (d === 'ecarte') return 'ecartee';
  if (d === 'perime') return 'perimee';
  if (d === 'a-la-main') return 'a-la-main';
  return PARTIE.has(d) ? 'partie' : 'echec';
}

function departDe(e: EnvoiDuJour | undefined, etat: EtatDeLaLigne, maintenantMs: number, carte: boolean): string {
  /* La carte d'anniversaire attend 10 h en salle (`departDeLaCarte`, 28 octobre 2026) : son heure se dit. */
  if (etat === 'en-salle' && carte && e) return quandIlPart(e, maintenantMs) || 'part à l’instant';
  switch (etat) {
    case 'en-pause': return 'en pause';
    case 'pas-encore': return 'pas encore en salle';
    case 'a-son-toucher': return 'à son toucher';
    /* Le modèle approuvé chez Meta, déposé en salle par le passage du matin (ligne `-whatsapp`, lot 2) : le facteur le porte seul. */
    case 'en-salle': return e?.canal === 'whatsapp' ? 'part seul au passage du matin' : (e && quandIlPart(e, maintenantMs)) || 'part à l’instant';
    case 'retenue': return 'retenue à la main';
    default: return e ? DEVENU_DIT[devenuDe(e)] : '';
  }
}

/** La remise d'une situation, telle que la colonne la dit : « CREUX 15 % ». */
export const remiseDite = (s: Pick<Situation, 'code'>): string | undefined => (s.code ? `${s.code.mot} ${s.code.pct} %` : undefined);

/** LE PLAN DU JOUR, LIGNE PAR LIGNE, AVEC CE QUE LA SALLE EN SAIT. Pour chaque
    situation, la ligne `gerard-<jour>-<cliente>-push`, sinon `-whatsapp` (le
    modèle approuvé chez Meta, déposé par le passage du matin et porté seul par
    le facteur, lot 2), sinon `-wa-main` (`idDeLaLigne`). Le Départ : l'heure
    de la salle si elle attend, « part seul au passage du matin » pour un modèle
    déposé en salle, « à son toucher » pour un WhatsApp pas encore touché, le
    devenu sinon. */
export function fusionnePlanEtSalle(o: {
  plan: readonly Situation[];
  envois: readonly EnvoiDuJour[];
  aujourdhui: string;
  maintenantMs: number;
  /** Pause ou Actif (`estActif(reglages)`). */
  actif: boolean;
  /** Les francs en jeu d'une cliente (`francsEnJeu`), calculés par l'écran. */
  francsDe?: (clientId: string) => FrancsEnJeu | null;
  /** Cette situation part-elle seule sur WhatsApp (`partSeule(s, reglages)`, lot 2) ?
      Sans ligne encore, elle attend alors le passage du matin, pas un toucher. */
  partSeule?: (s: Situation) => boolean;
}): FusionDuJour {
  const parId = new Map(o.envois.map((e) => [e.id, e]));
  const ligneDe = (s: Situation): EnvoiDuJour | undefined =>
    parId.get(idDeLaLigne(o.aujourdhui, s.clientId, 'push')) ??
    parId.get(idDeLaLigne(o.aujourdhui, s.clientId, 'whatsapp')) ??
    parId.get(idDeLaLigne(o.aujourdhui, s.clientId, 'wa-main'));
  const lignes: LigneDuJour[] = o.plan.map((s) => {
    const envoi = ligneDe(s);
    const etat = etatDe(envoi, s, o.actif, o.partSeule ? o.partSeule(s) : false);
    const remise = remiseDite(s);
    return {
      clientId: s.clientId, situation: s, canal: s.canal,
      ...(envoi ? { envoi } : {}),
      etat, depart: departDe(envoi, etat, o.maintenantMs, s.genre === 'anniversaire'),
      ...(remise ? { remise } : {}),
      ...(envoi?.codePromo ? { codePromo: envoi.codePromo } : {}),
      francs: o.francsDe ? o.francsDe(s.clientId) : null,
    };
  });
  const compte = (f: (l: LigneDuJour) => boolean) => lignes.filter(f).length;
  return {
    lignes,
    resume: {
      lignes: lignes.length,
      couronne: compte((l) => l.canal === 'couronne'),
      whatsapp: compte((l) => l.canal === 'whatsapp'),
      remises: compte((l) => !!l.remise),
      enSalle: compte((l) => l.etat === 'en-salle' || l.etat === 'retenue'),
      parties: compte((l) => l.etat === 'partie' || l.etat === 'a-la-main'),
      aSonToucher: compte((l) => l.etat === 'a-son-toucher'),
      ecartees: compte((l) => l.etat === 'ecartee' || l.etat === 'perimee'),
      francs: sommeDesFrancs(lignes.map((l) => l.francs)),
    },
  };
}

/* ── LA PORTÉE : à qui il peut écrire aujourd'hui ───────────────────────── */
/** JOIGNABLE : ni écartée (passage, diaspora, locks défaits, archivée), ni
    enfant d'un foyer, et un canal pour une sollicitation (Ma Couronne, ou
    WhatsApp avec l'accord des nouvelles ; un « stop » ferme tout). C'est la
    définition de `canalDe` pour une envie : la même porte que le gardien. */
export const estJoignable = (f: FicheDeGerard): boolean => !f.ecartee && !f.enfantDuFoyer && canalDe(f, 'envie') !== null;
/** La portée du jour : le nombre de clientes joignables. */
export const portee = (fiches: readonly FicheDeGerard[]): number => fiches.filter(estJoignable).length;
/** La même, par canal (Ma Couronne d'abord, comme `canalDe`). */
export function porteeParCanal(fiches: readonly FicheDeGerard[]): { joignables: number; couronne: number; whatsapp: number } {
  const siennes = fiches.filter(estJoignable);
  const couronne = siennes.filter((f) => canalDe(f, 'envie') === 'couronne').length;
  return { joignables: siennes.length, couronne, whatsapp: siennes.length - couronne };
}

/* ── ATTEND UN HUMAIN ───────────────────────────────────────────────────── */
export type GenreDAttente = 'sante' | 'a-voir' | 'question-franche' | 'whatsapp' | 'site' | 'appel-wa' | 'appel';
const RANG_DE_L_ATTENTE: Record<GenreDAttente, number> = { sante: 0, 'a-voir': 1, 'question-franche': 2, whatsapp: 3, site: 4, 'appel-wa': 5, appel: 6 };
export const GENRE_D_ATTENTE_DIT: Record<GenreDAttente, string> = {
  sante: 'Santé', 'a-voir': 'À voir', 'question-franche': 'Question franche', whatsapp: 'WhatsApp', site: 'Site', 'appel-wa': 'Appel WhatsApp', appel: 'Appel',
};
/** Un fil dont le dernier mot est d'elle attend un humain au bout de tant d'heures (spec §5.1). */
export const FIL_SANS_REPONSE_H = 24;

export type LigneHumaine = {
  cle: string;
  genre: GenreDAttente;
  nom: string;
  clientId?: string;
  /** Le numéro réduit (`numeroWa`) quand il y en a un : c'est lui qui ouvre le fil. */
  numero?: string;
  /** Ses mots ou le motif, courts. */
  dit: string;
  depuisMs: number;
  /** « 25 min », « 1 h 48 », « 26 h », « 3 j ». */
  depuis: string;
  enRetard: boolean;
};
export type AttenteHumaine = { lignes: LigneHumaine[]; total: number; sante: number };

/** Ce que la vue lit d'un fil : le juge, le dernier mot qui compte. Un `Fil` de `filsDeLaMaison` s'y glisse tel quel. */
export type FilLu = Pick<Fil, 'numero' | 'clientId' | 'nom' | 'attendUneReponse'> & { dernierQuiCompte: { quand: string; texte?: string; sens?: string } };
/** Une demande du site ou de WhatsApp (`Demande`, demandes.ts), les champs lus. */
export type DemandeLue = { id: string; prenom?: string; nom?: string; telephone?: string; statut: string; archiveeLe?: string; createdAt: string; clientId?: string; genre?: string; mot?: string };
/** Un appel WhatsApp (`AppelWa`, appels-wa.ts), les champs lus. */
export type AppelWaLu = { id: string; clientId?: string; numero: string; nomProfil?: string; sens: string; etat: string; sonneLe: string; prisPar?: string; rappelId?: string };
/** Un appel noté au carnet (`AppelRecu`, appels.ts), les champs lus. */
export type AppelNote = { id: string; clientId?: string; nom: string; phone?: string; motif: string; fait: boolean; at: string };
export type SignalementLu = Pick<Signalement, 'id' | 'clientId' | 'soucis' | 'etat' | 'bien' | 'quand' | 'texte' | 'canal'>;

/** À TRAITER : la même règle que `dansLeFiltre(d, 'a-traiter')` (demandes.ts,
    qui lit un magasin et ne s'importe pas ici) ; le banc tient les deux ensemble. */
export const demandeATraiter = (d: Pick<DemandeLue, 'statut' | 'archiveeLe'>): boolean =>
  !d.archiveeLe && (d.statut === 'nouvelle' || d.statut === 'rappelee');
/** MANQUÉ : la même règle que `meriteUnRappel` (appels-wa.ts) ; un appel qui a
    déjà son rappel au carnet paraît comme appel noté, pas deux fois. */
export const appelWaManque = (a: Pick<AppelWaLu, 'sens' | 'etat' | 'prisPar' | 'rappelId'>): boolean =>
  a.sens === 'entrant' && !a.prisPar && !a.rappelId && (a.etat === 'manque' || a.etat === 'refuse' || a.etat === 'fini');

/** « 25 min », « 1 h 48 », « 26 h », « 3 j ». */
export function dureeDite(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) { const mm = min % 60; return mm ? `${h} h ${String(mm).padStart(2, '0')}` : `${h} h`; }
  if (h < 48) return `${h} h`;
  return `${Math.floor(h / 24)} j`;
}

const court = (t: string | undefined, n = 80): string => {
  const s = String(t ?? '').replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
};
const ageDe = (iso: string | undefined, maintenantMs: number): number => {
  const t = Date.parse(iso ?? '');
  return Number.isFinite(t) ? Math.max(0, maintenantMs - t) : 0;
};

/** CE QUI ATTEND UN HUMAIN : un souci Santé ou À voir ouvert (Entre deux
    séances) ; un fil dont le dernier mot est d'elle depuis plus de 24 h, ou
    tout de suite si elle demande franchement à qui elle parle ; une demande à
    traiter ; un appel WhatsApp manqué ; un appel noté pas encore fait. Santé
    d'abord, puis À voir, puis les questions franches, puis le reste, les plus
    anciens en tête. Chaque ligne ouvre Les conversations. */
export function attendUnHumain(o: {
  signalements: readonly SignalementLu[];
  /** Les fils non archivés (`filsQuiAttendent`, ou tous : le juge est dans le fil). */
  fils: readonly FilLu[];
  demandes: readonly DemandeLue[];
  appelsWa: readonly AppelWaLu[];
  appels: readonly AppelNote[];
  maintenantMs: number;
  /** Le nom d'une cliente d'après sa fiche, pour les soucis et les appels sans nom. */
  nomDe?: (clientId: string) => string;
}): AttenteHumaine {
  const maintenantIso = new Date(o.maintenantMs).toISOString();
  const nom = (clientId: string | undefined, sinon: string) => (clientId && o.nomDe ? o.nomDe(clientId) || sinon : sinon);
  const lignes: LigneHumaine[] = [];
  const pose = (l: Omit<LigneHumaine, 'depuis' | 'depuisMs'> & { depuisMs: number }) => lignes.push({ ...l, depuis: dureeDite(l.depuisMs) });

  for (const s of o.signalements) {
    if (s.etat !== 'ouvert' || s.bien) continue;
    const niveau = niveauDe(s.soucis ?? []);
    if (niveau === 'conseil') continue;
    const dits = (s.soucis ?? []).map((c) => souciDe(c)?.dit).filter((x): x is string => !!x);
    pose({
      cle: `souci-${s.id}`, genre: niveau === 'sante' ? 'sante' : 'a-voir', nom: nom(s.clientId, ''), clientId: s.clientId,
      dit: court(s.texte) || dits.join(', '), depuisMs: ageDe(s.quand, o.maintenantMs),
      enRetard: enRetard({ etat: s.etat, soucis: s.soucis ?? [], quand: s.quand }, maintenantIso),
    });
  }
  for (const f of o.fils) {
    if (!f.attendUneReponse) continue;
    const depuisMs = ageDe(f.dernierQuiCompte.quand, o.maintenantMs);
    const franche = estUneQuestionFranche(f.dernierQuiCompte.texte ?? '');
    const tard = depuisMs >= FIL_SANS_REPONSE_H * 3_600_000;
    if (!franche && !tard) continue;
    pose({
      cle: `fil-${f.numero}`, genre: franche ? 'question-franche' : 'whatsapp', nom: f.nom, clientId: f.clientId, numero: f.numero,
      dit: court(f.dernierQuiCompte.texte), depuisMs, enRetard: tard,
    });
  }
  for (const d of o.demandes) {
    if (!demandeATraiter(d)) continue;
    const quiDit = [d.prenom, d.nom].map((x) => String(x ?? '').trim()).filter(Boolean).join(' ');
    pose({
      cle: `demande-${d.id}`, genre: 'site', nom: nom(d.clientId, quiDit || d.telephone || ''), clientId: d.clientId,
      numero: d.telephone ? d.telephone.replace(/\D/g, '') : undefined,
      dit: d.genre === 'rdv' ? `place demandée${d.mot ? ` · ${court(d.mot, 60)}` : ''}` : court(d.mot) || 'demande du site',
      depuisMs: ageDe(d.createdAt, o.maintenantMs), enRetard: false,
    });
  }
  for (const a of o.appelsWa) {
    if (!appelWaManque(a)) continue;
    pose({
      cle: `appel-wa-${a.id}`, genre: 'appel-wa', nom: nom(a.clientId, a.nomProfil || a.numero), clientId: a.clientId, numero: a.numero,
      dit: 'appel WhatsApp manqué', depuisMs: ageDe(a.sonneLe, o.maintenantMs), enRetard: false,
    });
  }
  for (const a of o.appels) {
    if (a.fait) continue;
    pose({
      cle: `appel-${a.id}`, genre: 'appel', nom: nom(a.clientId, a.nom), clientId: a.clientId,
      numero: a.phone ? a.phone.replace(/\D/g, '') || undefined : undefined,
      dit: court(a.motif) || 'à rappeler', depuisMs: ageDe(a.at, o.maintenantMs), enRetard: false,
    });
  }
  lignes.sort((x, y) => RANG_DE_L_ATTENTE[x.genre] - RANG_DE_L_ATTENTE[y.genre] || y.depuisMs - x.depuisMs);
  return { lignes, total: lignes.length, sante: lignes.filter((l) => l.genre === 'sante').length };
}

/* ── ATTEND UN OUI ──────────────────────────────────────────────────────── */
export type AttenteDUnOui = {
  /** Le nombre de CARTES : les WhatsApp à un toucher font une carte, chaque offre flash, bilan, réponse ou remise la sienne. */
  total: number;
  whatsapp: { n: number; clientIds: string[]; francs: Fourchette | null };
  /** Aucune mécanique ne propose encore d'offre flash (`CodeAFaire.mot` ne connaît que CREUX et ANNIV) : l'écran dit « aucune proposition », jamais une carte factice. */
  offresFlash: number;
  bilans: number;
  avis: number;
  remises: number;
};

/** CE QUI ATTEND SON OUI : les WhatsApp à un toucher (si l'Assistant est
    actif), et ce que l'écran compte ailleurs : offres flash proposées, bilans à
    remettre (`seancesSansBilan`), réponses à un avis prêtes
    (`reponsesARelire`), remises à son nom demandées par la direction. */
export function attendUnOui(o: { fusion: FusionDuJour; actif: boolean; offresFlash?: number; bilans?: number; avis?: number; remises?: number }): AttenteDUnOui {
  const wa = o.actif ? o.fusion.lignes.filter((l) => l.etat === 'a-son-toucher') : [];
  const offresFlash = Math.max(0, o.offresFlash ?? 0);
  const bilans = Math.max(0, o.bilans ?? 0);
  const avis = Math.max(0, o.avis ?? 0);
  const remises = Math.max(0, o.remises ?? 0);
  return {
    total: (wa.length ? 1 : 0) + offresFlash + bilans + avis + remises,
    whatsapp: { n: wa.length, clientIds: wa.map((l) => l.clientId), francs: sommeDesFrancs(wa.map((l) => l.francs)) },
    offresFlash, bilans, avis, remises,
  };
}

/* ── LES CINQ TUILES ────────────────────────────────────────────────────── */
/** Le plafond de la semaine tel que `useCerveauDeGerard().plafond` le rend. */
export type PlafondLu = { faites: number; francs: number; restantes: number; remisesParSemaine: number; plafondFrancs: number };
export type TuilesDuJour = {
  /** Prêts aujourd'hui : le plan, si l'Assistant est actif ; en pause, le plan dort. */
  prets: { total: number; couronne: number; whatsapp: number; enPause: number };
  oui: AttenteDUnOui;
  humain: { total: number; sante: number };
  /** Remises de la semaine : les FAITES sur le nombre permis, et les francs sur le plafond (`plafondDeLaSemaine`). */
  remises: { faites: number; sur: number; francs: number; plafondFrancs: number; pct: number; pctFrancs: number };
  francs: Fourchette | null;
};

const pourCent = (n: number, sur: number): number => (sur > 0 ? Math.min(100, Math.max(0, Math.round((100 * n) / sur))) : 0);

/** LES CINQ CHIFFRES DU HAUT. La tuile des remises lit `plafond.faites`, le
    compte de la semaine tout compris, jamais « 8 moins ce qui reste » : au
    plafond en francs, il ne reste rien alors que trois seulement sont faites. */
export function tuilesDuJour(o: {
  fusion: FusionDuJour;
  actif: boolean;
  plafond: PlafondLu;
  humain: Pick<AttenteHumaine, 'total' | 'sante'>;
  oui?: { offresFlash?: number; bilans?: number; avis?: number; remises?: number };
}): TuilesDuJour {
  const r = o.fusion.resume;
  return {
    prets: o.actif
      ? { total: r.lignes, couronne: r.couronne, whatsapp: r.whatsapp, enPause: 0 }
      : { total: 0, couronne: 0, whatsapp: 0, enPause: r.lignes },
    oui: attendUnOui({ fusion: o.fusion, actif: o.actif, ...(o.oui ?? {}) }),
    humain: { total: o.humain.total, sante: o.humain.sante },
    remises: {
      faites: o.plafond.faites,
      sur: o.plafond.remisesParSemaine,
      francs: o.plafond.francs,
      plafondFrancs: o.plafond.plafondFrancs,
      pct: pourCent(o.plafond.faites, o.plafond.remisesParSemaine),
      pctFrancs: pourCent(o.plafond.francs, o.plafond.plafondFrancs),
    },
    francs: r.francs,
  };
}

/* ── PARTI AUJOURD'HUI ──────────────────────────────────────────────────── */
export type RangeeDuParti = {
  /** `<type>|<canal>` */
  cle: string;
  /** « Confirmation », « Assistant · garder, envie ». */
  quoi: string;
  parOu: string;
  /** « 8 h 10 », « 8 h à 11 h » (à l'heure de Cotonou). */
  heure: string;
  lignes: number;
  compte: CompteDuJournal;
  /** « remis 4, lu 3 », « remis 2, non remis 1 ». */
  devenu: string;
  /** Les motifs Meta en français de ce qui n'est pas arrivé, sans doublon. */
  motifs: string[];
  /** La colonne Code : les codes de la rangée (`codeDeLaLigne`), sans doublon ni vide. */
  codes: string[];
};
export type PartiDuJour = { jour: string; rangees: RangeeDuParti[]; lignes: number; compte: CompteDuJournal };

/** « 8 h 10 », à l'heure de Cotonou. */
export function heureDuSalonDite(ms: number): string {
  const h = heureDuSalon(ms);
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60 + 1e-6);
  return `${hh} h${mm ? ` ${String(mm).padStart(2, '0')}` : ''}`;
}

const AUTRES_DEVENUS: readonly DevenuDeLEnvoi[] = ['en-route', 'en-cours', 'non-remis', 'echec', 'personne', 'a-la-main', 'ecarte', 'perime'];
/** « remis 4, lu 3 » : les remis comptent les lus, comme la maquette ; puis chaque autre devenu présent. */
export function devenuDit(lignes: readonly EnvoiLu[]): string {
  const c = compteDuJournal(lignes);
  const parts: string[] = [];
  if (c.remis) parts.push(`remis ${c.remis}`);
  if (c.lus) parts.push(`lu ${c.lus}`);
  for (const d of AUTRES_DEVENUS) {
    const n = lignes.filter((e) => devenuDe(e) === d).length;
    if (n) parts.push(`${DEVENU_DIT[d]} ${n}`);
  }
  return parts.join(', ');
}

/** LA COLONNE CODE du journal (lot 2) : le code à son nom quand il est né ; ce
    que sa fabrication a dit sinon (« jour passé, pas de remise ») ; « à
    fabriquer au départ » tant qu'une ligne partie porte sa remise à faire sans
    code encore ; rien sans remise, rien pour une ligne écartée ou périmée, qui
    ne partira jamais. */
export function codeDeLaLigne(e: Pick<EnvoiDuJour, 'statut' | 'etat' | 'codePromo' | 'codeAFaire' | 'detailRemise'>): string {
  if (e.codePromo) return e.codePromo;
  if (e.detailRemise) return e.detailRemise;
  if (!e.codeAFaire) return '';
  const d = devenuDe(e);
  return d === 'ecarte' || d === 'perime' ? '' : 'à fabriquer au départ';
}

/** CE QUI EST PARTI AUJOURD'HUI, tous types : les lignes `envois` du jour à
    l'heure de Cotonou (`envoisDeLaPeriode`, qui laisse en salle ce qui attend
    encore), groupées par type et canal, avec leur devenu et, pour ce qui n'est
    pas arrivé, le motif de Meta en français. « Partis » exclut l'écarté et le
    périmé (`compteDuJournal`). */
export function partiAujourdhui(envois: readonly EnvoiDuJour[], maintenantMs: number): PartiDuJour {
  const jour = jourDuSalon(new Date(maintenantMs).toISOString());
  const duJour = envoisDeLaPeriode(envois, 'aujourdhui', jour);
  const groupes = new Map<string, EnvoiDuJour[]>();
  for (const e of duJour) {
    const cle = `${e.type}|${e.canal}`;
    const g = groupes.get(cle);
    if (g) g.push(e); else groupes.set(cle, [e]);
  }
  const rangees: RangeeDuParti[] = [...groupes.entries()].map(([cle, lignes]) => {
    const [type, canal] = cle.split('|');
    const instants = lignes.map((e) => Date.parse(e.quand)).filter((t) => Number.isFinite(t));
    const de = instants.length ? Math.min(...instants) : Number.NaN;
    const a = instants.length ? Math.max(...instants) : Number.NaN;
    const heure = !Number.isFinite(de) ? '' : Math.floor(de / 60_000) === Math.floor(a / 60_000) ? heureDuSalonDite(de) : `${heureDuSalonDite(de)} à ${heureDuSalonDite(a)}`;
    const genres = type === 'gerard' ? [...new Set(lignes.map((e) => e.genre).filter((g): g is string => !!g))] : [];
    return {
      cle,
      quoi: genres.length ? `${typeDit(type)} · ${genres.join(', ')}` : typeDit(type),
      parOu: canalDit(canal),
      heure,
      lignes: lignes.length,
      compte: compteDuJournal(lignes),
      devenu: devenuDit(lignes),
      motifs: [...new Set(lignes.filter((e) => estARegarder(devenuDe(e))).map(motifEnClair).filter(Boolean))],
      codes: [...new Set(lignes.map(codeDeLaLigne).filter(Boolean))],
      premier: de,
    };
  }).sort((x, y) => (x.premier || 0) - (y.premier || 0) || y.lignes - x.lignes)
    .map(({ premier: _p, ...r }) => r);
  return { jour, rangees, lignes: duJour.length, compte: compteDuJournal(duJour) };
}
