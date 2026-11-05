/* ══ CE QUI VA PARTIR — 5 novembre 2026 ═══════════════════════════════════
   « Est-ce possible d'avoir tous les modèles Meta qui doivent partir pour le
   Trône, quelque part dans le Trône, pour qu'on puisse contrôler chaque
   message qui part, à qui, et qu'on puisse arrêter le message au besoin ? »,
   puis « je ne vois pas les listes des modèles Meta : combien de fois chaque
   modèle a été utilisé… », puis « je veux qu'Opale puisse surveiller
   correctement tous les messages qui doivent être déclenchés au fur et à
   mesure » (Yéman, 4 novembre 2026). Maquette « Ce qui va partir » (v3)
   validée : un onglet « À venir » dans Conversations › Envois automatiques,
   7 jours, la fidélité dedans, « Ne pas envoyer » à la direction seule.

   UNE SOURCE, PAS UNE SECONDE VÉRITÉ. Chaque prévision reprend la règle de
   la fonction qui déposera le message, par son module pur :
     · le rappel de la veille (rappels-j1) : les heures réglées
       (`heures-des-rappels-pur`), « Oui, je viens » qui le tait, le message
       du foyer (`message-du-foyer-pur`), le numéro à prévenir, la salle
       (`salle-des-envois`) ;
     · l'Assistant Maison (Perle, assistant-maison) : le MÊME cerveau
       (`assistant-lecture-pur`, `gerard-pur`, `assistant-passage-pur`),
       rejoué jour par jour : « garder » deux jours avant, la carte
       d'anniversaire à 10 h, ses autres messages approuvés chez Meta ;
     · les relances de facture (relances-factures, 10 h) : `relanceDeLaPiece`
       de `relances-pur`, jamais le dimanche, un rappel par payeur.
   Les autres familles (la confirmation, la demande d'avis, le rappel
   d'échéance, la fête de couronne, la fin de paquet) naissent d'un geste
   ou d'un règlement : elles paraissent dans la salle d'attente dix minutes
   avant de partir, et la porte d'Opale les juge comme les autres.

   CHAQUE MESSAGE PORTE SA CLÉ (`cleDuMessage`, arret-d-avance-pur) : la même
   que le facteur lira sur la ligne en salle. « Ne pas envoyer » arrête cette
   clé ; la porte d'Opale et chaque fonction qui dépose la lisent.

   Module PUR : ni Supabase, ni DOM, ni horloge (l'heure se donne). */
import { DECALAGE_DU_SALON_H, heureDeDepart, heureDuMessage, type ReglesDeLaSalle } from './salle-des-envois';
import { rappelDeLaVeilleSeTait, type HeuresDesRappels } from './heures-des-rappels-pur';
import { appelDuFoyer, foyersAPrevenir, prenomDeLaTete, tetesNommees, type TeteAPrevenir } from './message-du-foyer-pur';
import { telDuRdv } from './numero-a-prevenir-pur';
import { numeroWa } from './numero-wa-pur';
import { appelDe } from './civilite';
import { jourDit } from './gerard-pur';
import {
  horsDuDimanche, idDeLaRelance, idDuRappelDuPoint, jourDeLaRelance, jourPlusR, relanceDeLaPiece,
  type LigneDeRelance, type PieceDeRelance, type ReglagesRelances, type TeteDeRelance,
} from './relances-pur';
import {
  arretEnVigueur, cleDuMessage, laPorteDAvance, serieDeNonRemis, veilleDuModele,
  type ArretDAvance, type PauseDuModele,
} from './arret-d-avance-pur';
import { lisLAssistant, type EntreesDeLAssistant } from './assistant-lecture-pur';
import { HEURE_DU_PASSAGE_A, HEURE_DU_PASSAGE_DE, planDuJour } from './gerard-pur';
import { lignesDuPassage } from './assistant-passage-pur';

/** Jusqu'où l'onglet regarde : sept jours, son choix du 4 novembre 2026. */
export const JOURS_A_VENIR = 7;
/** La tournée des relances (relances-factures) passe à 10 h. */
export const HEURE_DES_RELANCES = 10;

/* ── L'HEURE DE COTONOU (UTC + 1, sans heure d'été) ─────────────────────── */
export const jourDeCotonou = (ms: number): string => (Number.isFinite(ms) ? new Date(ms + DECALAGE_DU_SALON_H * 3_600_000).toISOString().slice(0, 10) : '');
export const heureDeCotonou = (ms: number): number => {
  const d = new Date(ms + DECALAGE_DU_SALON_H * 3_600_000);
  return d.getUTCHours() + d.getUTCMinutes() / 60;
};
/** L'instant d'un jour à une heure de Cotonou. */
export const instantDuSalon = (jour: string, heure: number, minute = 0): number =>
  Date.parse(`${jour}T00:00:00Z`) + (heure * 60 + minute) * 60_000 - DECALAGE_DU_SALON_H * 3_600_000;
/** « 18 h 10 » pour un instant. */
export function heureDite(ms: number): string {
  const d = new Date(ms + DECALAGE_DU_SALON_H * 3_600_000);
  const mi = d.getUTCMinutes();
  return `${d.getUTCHours()} h${mi ? ` ${String(mi).padStart(2, '0')}` : ''}`;
}
/** « Demain, jeudi 5 novembre 2026 », « Aujourd'hui, mercredi 4 novembre 2026 ». */
export function jourEnTitre(jour: string, aujourdhui: string): string {
  const dit = jourDit(jour);
  if (jour === aujourdhui) return `Aujourd’hui, ${dit}`;
  if (jour === jourPlusR(aujourdhui, 1)) return `Demain, ${dit}`;
  return dit.charAt(0).toUpperCase() + dit.slice(1);
}

/* ── CE QUE L'ÉCRAN MONTRE D'UN MESSAGE ─────────────────────────────────── */
export type SorteDeMessage = 'rdv' | 'avis' | 'argent' | 'fidelite';
export const SORTES_DITES: Record<SorteDeMessage, string> = {
  rdv: 'Rendez-vous', avis: 'Après la séance', argent: 'Argent', fidelite: 'Fidélité',
};

/** CHAQUE MODÈLE META QUE LE CODE CONNAÎT : son nom lisible, à quoi il sert, sa sorte. */
export const MODELES_CONNUS: Record<string, { dit: string; sert: string; sorte: SorteDeMessage }> = {
  confirmation_rdv: { dit: 'Confirmation du rendez-vous', sert: 'Confirmer un rendez-vous posé', sorte: 'rdv' },
  confirmation_rdv_liens: { dit: 'Confirmation à liens', sert: 'Confirmer, avec la référence et deux boutons', sorte: 'rdv' },
  rappel_rdv: { dit: 'Rappel de la veille', sert: 'Le rappel de la veille', sorte: 'rdv' },
  assistant_maison_garder: { dit: 'Petit rappel, deux jours avant', sert: 'Le petit rappel, deux jours avant', sorte: 'rdv' },
  reprise_proposee: { dit: 'Reprise proposée', sert: 'Proposer la reprise posée à la caisse', sorte: 'rdv' },
  point_avant_seance: { dit: 'Point d’avant séance', sert: 'Une semaine avant la séance suivante', sorte: 'rdv' },
  point_apres_seance: { dit: 'Point d’après séance', sert: 'Une semaine après la séance', sorte: 'avis' },
  avis_google: { dit: 'Demande d’avis Google', sert: 'Demander un avis après la séance', sorte: 'avis' },
  bilan_de_seance: { dit: 'Bilan de la séance', sert: 'Le bilan de la séance', sorte: 'avis' },
  recu_de_paiement: { dit: 'Reçu de paiement', sert: 'Le reçu après l’encaissement', sorte: 'argent' },
  facture_du_rituel: { dit: 'Facture du rituel', sert: 'La facture réglée', sorte: 'argent' },
  rappel_de_reglement: { dit: 'Relance de facture', sert: 'Relance d’une facture à régler', sorte: 'argent' },
  rappel_du_point: { dit: 'Rappel du point', sert: 'Un rappel pour plusieurs factures d’un payeur', sorte: 'argent' },
  paiement_en_attente: { dit: 'Paiement en attente', sert: 'Un paiement en ligne à finir', sorte: 'argent' },
  rappel_echeance_veille: { dit: 'Rappel d’échéance de la formule', sert: 'La veille d’une échéance ou d’une lune', sorte: 'argent' },
  prix_revu_apres_comptage: { dit: 'Prix revu après le comptage', sert: 'Le prix d’une formule revu après le comptage', sorte: 'argent' },
  versement_engagement: { dit: 'Versement d’engagement', sert: 'Un versement d’engagement', sorte: 'argent' },
  demande_recue: { dit: 'Accusé de demande', sert: 'Accuser une demande du site', sorte: 'rdv' },
  reservation_preparee: { dit: 'Réservation préparée', sert: 'La cliente qui revient : sa réservation préparée', sorte: 'rdv' },
  fin_de_paquet: { dit: 'Fin de paquet', sert: 'Prévenir que le paquet est fini', sorte: 'fidelite' },
  carte_marraine: { dit: 'Carte « De main en main »', sert: 'La carte « De main en main »', sorte: 'fidelite' },
  parrainage_merci: { dit: 'Merci à la marraine', sert: 'Le merci à la marraine', sorte: 'fidelite' },
  fete_de_couronne: { dit: 'Fête de couronne', sert: 'L’anniversaire de la première couronne d’un enfant', sorte: 'fidelite' },
  assistant_maison_carte_anniversaire: { dit: 'Carte d’anniversaire', sert: 'La carte d’anniversaire', sorte: 'fidelite' },
  assistant_maison_anniversaire: { dit: 'Anniversaire', sert: 'Le mot d’anniversaire', sorte: 'fidelite' },
  assistant_maison_carte_foyer: { dit: 'Carte du foyer', sert: 'La carte d’anniversaire d’un enfant, au parent', sorte: 'fidelite' },
  assistant_maison_avant: { dit: 'Le prochain soin approche', sert: 'Le prochain soin, quand sa cadence l’annonce', sorte: 'fidelite' },
  assistant_maison_envie: { dit: 'Une envie du fil', sert: 'Une envie dite dans la conversation', sorte: 'fidelite' },
  assistant_maison_place: { dit: 'Une place libre', sert: 'Une place libre un jour creux', sorte: 'fidelite' },
  assistant_maison_fetes: { dit: 'Les fêtes', sert: 'Les fêtes de fin d’année', sorte: 'fidelite' },
  assistant_maison_endormie: { dit: 'Une cliente endormie', sert: 'Une cliente qui n’est pas revenue', sorte: 'fidelite' },
  nouvelles_de_la_maison: { dit: 'Nouvelles de la Maison', sert: 'Les nouvelles de la Maison', sorte: 'fidelite' },
};
export const modeleDit = (nom: string): string => MODELES_CONNUS[nom]?.dit ?? nom;
export const sorteDuModele = (nom: string, repli: SorteDeMessage = 'fidelite'): SorteDeMessage => MODELES_CONNUS[nom]?.sorte ?? repli;

/** QUI, À L'ÉCRAN : le nom entier pour la direction, les initiales pour l'équipe. */
export function quiDit(nom: unknown, direction: boolean): string {
  const mots = String(nom ?? '').trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return 'Une cliente';
  if (direction) return mots.join(' ');
  return mots.map((m) => `${m.charAt(0).toUpperCase()}.`).join(' ');
}

export type EtatPrevu = 'prevu' | 'en-salle' | 'arrete' | 'en-pause' | 'repli';
export type MessagePrevu = {
  /** La clé que « Ne pas envoyer » arrête (`cleDuMessage`). */
  cle: string;
  /** L'identifiant de la ligne que la fonction déposera au journal des envois. */
  idDeLigne: string;
  /** L'instant où il partira (la fin de sa salle), en millisecondes. */
  partA: number;
  jour: string;
  sorte: SorteDeMessage;
  /** La famille de la porte d'Opale (rappel-j1, perle-garder, relance-facture…). */
  famille: string;
  /** Le nom technique chez Meta, et son nom lisible. */
  modele: string;
  modeleDit: string;
  /** La fiche qui reçoit (le parent pour un enfant, le payeur pour une facture). */
  clientId: string;
  /** Les fiches qu'il nomme (un foyer). */
  clientIds?: string[];
  apptId?: string;
  /** Pourquoi il part, en une phrase, l'année toujours. */
  raison: string;
  /** Le texte tel que la cliente le lira, quand on le connaît. */
  texte?: string;
  etat: EtatPrevu;
  /** Arrêté d'avance : par qui, quand. */
  arret?: { par: string; le: string };
  /** Le modèle en pause, ou le repli qui part à sa place. */
  pause?: string;
};

/* ── LES ENTRÉES ───────────────────────────────────────────────────────── */
export type RdvAVenir = {
  id: string; clientId: string; clientName?: string; date: string; time?: string; status?: string;
  numeroAPrevenir?: string; foyerId?: string; confirmeeParLaClienteLe?: unknown; branchId?: string;
};
export type FicheAVenir = { id: string; name?: string; phone?: string; civilite?: unknown; auMasculin?: unknown; archived?: boolean; familyId?: string };
export type LigneDuJournal = {
  id: string; type?: string; canal?: string; statut?: string; detail?: string; apptId?: string; apptIds?: unknown; clientId?: string;
  genre?: string; partA?: string; quand?: string; prenom?: string; dateRdv?: string; heure?: string; invoiceId?: string; rang?: unknown;
  arretDAvance?: { cle?: string; par?: string; le?: string }; colis?: { genre?: string; modele?: string; texteAuFil?: string; repli?: { modele?: string } };
  [k: string]: unknown;
};
/** Une ligne de Perle telle que `lignesDuPassage` la dépose. */
export type LigneDePerle = {
  id: string; type: 'gerard'; genre: string; clientId: string; pourId?: string; apptId?: string; dateRdv?: string; heure?: string;
  partA?: string; texte?: string; modele?: string;
  colis?: { genre: string; modele?: string; texteAuFil?: string } | null;
};

/** Une facture telle que les relances la lisent. */
export type PieceDeRelanceAVenir = PieceDeRelance;

export type EntreesDeCeQuiVaPartir = {
  maintenantMs: number;
  regles: ReglesDeLaSalle;
  heures: HeuresDesRappels;
  rdvs: readonly RdvAVenir[];
  fiches: readonly FicheAVenir[];
  /** Le journal des envois : ce qui est déjà déposé, parti, retenu ou écarté. */
  envois: readonly LigneDuJournal[];
  /** Le modèle du rappel de la veille (le secret WA_TEMPLATE, `rappel_rdv` par défaut). */
  modeleDuRappel?: string;
  /** Les relances : en service (allumées, Tap & Go en marche), et ce qu'elles lisent. */
  relances?: {
    enService: boolean;
    reglages: ReglagesRelances | undefined;
    pieces: readonly PieceDeRelance[];
    familles: readonly { id: string; payerClientId?: string }[];
    resteDe: (p: PieceDeRelance) => number;
    estFormule?: (p: PieceDeRelance) => boolean;
    /** Le modèle du rappel du point est-il nommé au serveur ? */
    modelePoint?: boolean;
  };
  /** Les lignes de Perle jour par jour, rejouées par son cerveau (`lignesDePerleAVenir`). */
  perle?: readonly { jour: string; lignes: readonly LigneDePerle[] }[];
  arrets?: readonly ArretDAvance[];
  pauses?: readonly PauseDuModele[];
  jours?: number;
};

/* ── LES RÈGLES ────────────────────────────────────────────────────────── */
const SE_RETENTE = new Set(['échec', 'périmé']);
const retenuParOpale = (l: { detail?: unknown }): boolean => String(l.detail ?? '').startsWith('retenu par Opale');
/** Une ligne qui verrouille : partie, en salle, retenue par une main ou par Opale, écartée. */
export const verrouille = (l: LigneDuJournal): boolean => !SE_RETENTE.has(l.statut ?? '') || retenuParOpale(l);

/** LES RAPPELS DE LA VEILLE À VENIR : un par rendez-vous des jours qui
    viennent (par foyer, au numéro du foyer), la veille à l'heure du passage
    réglé, après la salle. Le passage déjà fait aujourd'hui (son heure est
    passée) : le second, s'il y en a un ; sinon rien pour demain. */
export function rappelsDeLaVeille(e: EntreesDeCeQuiVaPartir): MessagePrevu[] {
  const aujourdhui = jourDeCotonou(e.maintenantMs);
  const jours = e.jours ?? JOURS_A_VENIR;
  const modele = e.modeleDuRappel || 'rappel_rdv';
  const fiches = new Map(e.fiches.map((f) => [f.id, f]));
  const out: MessagePrevu[] = [];
  /* Les rendez-vous de demain à J+7 : la veille tombe d'aujourd'hui à J+6. */
  for (let k = 0; k < jours; k++) {
    const veille = jourPlusR(aujourdhui, k);
    const jour = jourPlusR(veille, 1);
    /* L'heure du passage de cette veille : le premier ; aujourd'hui, passé
       son heure (le cron passe à l'heure pile), le second s'il y en a un. */
    const heureNow = heureDeCotonou(e.maintenantMs);
    let passage: number | null = e.heures.premier;
    if (veille === aujourdhui && heureNow >= e.heures.premier) passage = e.heures.second !== null && heureNow < e.heures.second ? e.heures.second : null;
    if (passage === null) continue;
    const depot = Math.max(instantDuSalon(veille, passage), veille === aujourdhui ? e.maintenantMs : 0);
    const { partA, calme } = heureDeDepart(depot, e.regles);
    /* Déposé ce soir, il partirait le jour même : rappels-j1 ne le dépose pas. */
    if (calme && jourDeCotonou(partA) >= jour) continue;
    const tetes: (TeteAPrevenir & { appel: string; prenomSeul: string; rdv: RdvAVenir })[] = [];
    for (const a of e.rdvs) {
      if (!a || a.date !== jour || a.status === 'annulé' || a.status === 'honoré') continue;
      if (rappelDeLaVeilleSeTait(a)) continue;
      const fiche = fiches.get(a.clientId);
      const numero = numeroWa(telDuRdv(a, fiche));
      if (!numero) continue;
      tetes.push({ id: a.id, clientId: a.clientId, foyerId: a.foyerId, date: a.date, time: a.time, status: a.status, numero,
        appel: appelDe((fiche ?? null) as Parameters<typeof appelDe>[0], a.clientName), prenomSeul: prenomDeLaTete(fiche?.name ?? a.clientName), rdv: a });
    }
    /* Une tête que couvre déjà une ligne qui verrouille n'est plus à rappeler. */
    const couvertes = new Set<string>();
    for (const l of e.envois) {
      if (!l || l.type !== 'rappel-j1' || l.canal !== 'whatsapp' || !verrouille(l)) continue;
      for (const id of tetesNommees(l)) couvertes.add(id);
    }
    for (const f of foyersAPrevenir(tetes.filter((t) => !couvertes.has(t.id)))) {
      const porteur = f.porteur;
      const appel = appelDuFoyer(f, (t) => t.appel, (t) => t.prenomSeul);
      const idDeLigne = `env-${porteur.id}-whatsapp`;
      const ligne = { id: idDeLigne, type: 'rappel-j1', apptId: porteur.id, colis: { genre: 'whatsapp', modele } };
      const noms = f.tetes.length > 1 ? ` (${f.tetes.length} rendez-vous du foyer)` : '';
      out.push({
        cle: cleDuMessage(ligne), idDeLigne, partA, jour: jourDeCotonou(partA), sorte: 'rdv', famille: 'rappel-j1', modele, modeleDit: modeleDit(modele),
        clientId: porteur.clientId ?? '', ...(f.tetes.length > 1 ? { clientIds: [...new Set(f.tetes.map((t) => t.clientId ?? ''))].filter(Boolean) } : {}),
        apptId: porteur.id,
        raison: `Son rendez-vous du ${jourDit(jour)} à ${heureDuMessage(porteur.time)}${noms}.`,
        texte: `Bonjour ${appel}, petit rappel de la maison : votre rendez-vous est prévu demain à ${heureDuMessage(porteur.time)}.`,
        etat: 'prevu',
      });
    }
  }
  return out;
}

/** LE CERVEAU DE PERLE, REJOUÉ JOUR PAR JOUR : la même lecture et le même
    passage que la fonction serveur `assistant-maison` (le Trône les partage),
    chaque jour à 8 h, l'heure de son passage. Le passage d'aujourd'hui déjà
    fait (ses lignes sont au journal), ou passé 20 h : aujourd'hui ne se
    rejoue pas. Seules les lignes WhatsApp comptent : ce sont des modèles Meta. */
export function lignesDePerleAVenir(o: {
  entrees: Omit<EntreesDeLAssistant, 'aujourdhui' | 'maintenantMs'>;
  maintenantMs: number;
  regles: ReglesDeLaSalle;
  jours?: number;
  /** Le jour du dernier passage de Perle (une ligne `gerard-<jour>-…` au journal). */
  passageFaitLe?: string | null;
}): { jour: string; lignes: LigneDePerle[] }[] {
  const aujourdhui = jourDeCotonou(o.maintenantMs);
  const out: { jour: string; lignes: LigneDePerle[] }[] = [];
  for (let k = 0; k < (o.jours ?? JOURS_A_VENIR); k++) {
    const jour = jourPlusR(aujourdhui, k);
    if (k === 0 && (o.passageFaitLe === aujourdhui || heureDeCotonou(o.maintenantMs) >= HEURE_DU_PASSAGE_A)) continue;
    const quand = Math.max(o.maintenantMs, instantDuSalon(jour, HEURE_DU_PASSAGE_DE));
    const cerveau = lisLAssistant({ ...o.entrees, aujourdhui: jour, maintenantMs: quand });
    const plan = planDuJour(cerveau.fiches, cerveau.ctx);
    const lignes = lignesDuPassage({ cerveau, plan, reglagesGerard: o.entrees.reglagesGerard, maintenantMs: quand, branchId: o.entrees.branche.id, regles: o.regles });
    out.push({ jour, lignes: lignes.filter((l) => l.colis?.genre === 'whatsapp') as unknown as LigneDePerle[] });
  }
  return out;
}

/** Le jour du dernier passage de Perle lu au journal : ses lignes portent `gerard-<jour>-`. */
export function dernierPassageDePerle(envois: readonly { id?: string }[]): string | null {
  let jour: string | null = null;
  for (const l of envois) {
    const m = /^gerard-(\d{4}-\d{2}-\d{2})-/.exec(String(l?.id ?? ''));
    if (m && (jour === null || m[1] > jour)) jour = m[1];
  }
  return jour;
}

/** LES MESSAGES DE PERLE À VENIR, tels que son cerveau les dépose jour par
    jour (`lignesDePerleAVenir`) : seuls ceux qui partent sur WhatsApp. Un
    même genre pour la même fiche ne se prévoit qu'une fois : parti, il
    taira les suivants. */
export function messagesDePerle(e: EntreesDeCeQuiVaPartir): MessagePrevu[] {
  const out: MessagePrevu[] = [];
  const vus = new Set<string>();
  for (const j of e.perle ?? []) {
    for (const l of j.lignes) {
      if (!l || l.colis?.genre !== 'whatsapp') continue;
      const deja = `${l.genre}|${l.clientId}|${l.genre === 'garder' ? l.apptId ?? '' : ''}`;
      if (vus.has(deja)) continue;
      vus.add(deja);
      const modele = String(l.colis?.modele ?? '');
      const partA = Date.parse(String(l.partA ?? '')) || instantDuSalon(j.jour, 8, e.regles.salleMin);
      const garder = l.genre === 'garder';
      out.push({
        cle: cleDuMessage(l), idDeLigne: l.id, partA, jour: jourDeCotonou(partA),
        sorte: garder ? 'rdv' : 'fidelite', famille: garder ? 'perle-garder' : l.genre === 'anniversaire' ? 'perle-carte' : 'perle',
        modele, modeleDit: modeleDit(modele), clientId: l.pourId || l.clientId, ...(l.pourId ? { clientIds: [l.clientId] } : {}),
        ...(l.apptId ? { apptId: l.apptId } : {}),
        raison: garder && l.dateRdv
          ? `Son rendez-vous du ${jourDit(l.dateRdv)}${l.heure ? ` à ${heureDuMessage(l.heure)}` : ''}, pas encore confirmé.`
          : l.genre === 'anniversaire' ? `Son anniversaire, ${jourDit(j.jour)}.` : `L’Assistant Maison, ${jourDit(j.jour)}.`,
        ...(l.colis?.texteAuFil || l.texte ? { texte: String(l.colis?.texteAuFil || l.texte) } : {}),
        etat: 'prevu',
      });
    }
  }
  return out;
}

/** LES RELANCES SONT-ELLES EN SERVICE ? La règle de la tournée
    (relances-factures) : allumées, un jour de lancement, et le bouton
    « Régler » (Tap & Go) en marche ; sans lui, elle ne dépose rien. */
export function relancesEnService(reglages: {
  relances?: { actives?: boolean; depuis?: string } | null;
  mndPay?: { actif?: boolean; tapgo?: { actif?: boolean } | null } | null;
} | null | undefined): boolean {
  const r = reglages?.relances;
  if (!r?.actives || !r.depuis) return false;
  return reglages?.mndPay?.actif === true && reglages?.mndPay?.tapgo?.actif !== false;
}

/** LES RELANCES DE FACTURE À VENIR : la suite de chaque facture (seule, ou
    le rappel de toutes celles d'un même payeur), à 10 h, jamais le
    dimanche, une par jour au plus, jugée par `relanceDeLaPiece`. */
export function relancesAVenir(e: EntreesDeCeQuiVaPartir): MessagePrevu[] {
  const r = e.relances;
  if (!r || !r.enService) return [];
  const aujourdhui = jourDeCotonou(e.maintenantMs);
  const fin = jourPlusR(aujourdhui, (e.jours ?? JOURS_A_VENIR) - 1);
  const tourneePassee = heureDeCotonou(e.maintenantMs) >= HEURE_DES_RELANCES + 1;
  const journal = e.envois.filter((l) => l.type === 'relance-facture') as unknown as LigneDeRelance[];
  const fiches = e.fiches as readonly TeteDeRelance[];
  const vus = new Set<string>();
  const out: MessagePrevu[] = [];
  for (const piece of r.pieces) {
    if (!piece || piece.kind !== 'facture' || piece.status === 'brouillon') continue;
    const rel = relanceDeLaPiece({
      piece, pieces: r.pieces, fiches, familles: r.familles, reglages: r.reglages, journal, aujourdhui,
      jourDe: (iso: string) => jourDeCotonou(Date.parse(iso)), resteDe: r.resteDe, ...(r.estFormule ? { estFormule: r.estFormule } : {}),
    });
    if (!rel || rel.forme === 'attend' || rel.enPause || !rel.destinataire || !numeroWa(rel.destinataire.phone)) continue;
    const groupe = rel.membres.map((p) => p.id).sort().join(',');
    if (vus.has(groupe)) continue;
    vus.add(groupe);
    const auPoint = rel.forme === 'point';
    const modele = auPoint ? 'rappel_du_point' : 'rappel_de_reglement';
    let derniere = rel.etat.derniereLe ?? '';
    for (let n = rel.etat.parties + 1; n <= rel.cadence.length; n++) {
      let jour = jourDeLaRelance(rel.depart, rel.cadence, n, rel.decalage) ?? aujourdhui;
      if (jour < aujourdhui) jour = aujourdhui;
      if (jour === aujourdhui && tourneePassee) jour = jourPlusR(aujourdhui, 1);
      if (derniere && jour <= derniere) jour = jourPlusR(derniere, 1);
      jour = horsDuDimanche(jour);
      if (jour > fin) break;
      const idDeLigne = rel.membres.length > 1 ? idDuRappelDuPoint(rel.destinataire.id, rel.depart, n) : idDeLaRelance(piece.id, n);
      const { partA } = heureDeDepart(Math.max(instantDuSalon(jour, HEURE_DES_RELANCES), e.maintenantMs), e.regles);
      const j = rel.cadence[n - 1];
      out.push({
        cle: cleDuMessage({ id: idDeLigne, type: 'relance-facture' }), idDeLigne, partA, jour, sorte: 'argent', famille: 'relance-facture',
        modele, modeleDit: `${modeleDit(modele)}, J+${j}`, clientId: rel.destinataire.id,
        raison: rel.membres.length > 1
          ? `${rel.membres.length} factures à régler, la plus récente du ${jourDit(rel.depart)} : il reste ${Math.round(rel.resteXof).toLocaleString('fr-FR')} F.`
          : `Facture du ${jourDit(piece.date)} : il reste ${Math.round(rel.resteXof).toLocaleString('fr-FR')} F.`,
        etat: 'prevu',
      });
      derniere = jour;
    }
  }
  return out;
}

/** CE QUI EST DÉJÀ EN SALLE pour les jours qui viennent (un modèle WhatsApp
    qui attend ou qu'une main retient), et ce qui a été arrêté d'avance et
    dont l'heure n'est pas passée. */
export function dejaAuJournal(e: EntreesDeCeQuiVaPartir): MessagePrevu[] {
  const out: MessagePrevu[] = [];
  for (const l of e.envois) {
    if (!l || l.colis?.genre !== 'whatsapp') continue;
    const partA = Date.parse(String(l.partA ?? ''));
    const enSalle = l.statut === 'en-attente' || l.statut === 'retenu';
    const arretee = l.statut === 'écarté' && !!l.arretDAvance && Number.isFinite(partA) && partA > e.maintenantMs;
    if (!enSalle && !arretee) continue;
    const modele = String(l.colis?.modele ?? '');
    const quand = Number.isFinite(partA) ? partA : e.maintenantMs;
    out.push({
      cle: cleDuMessage(l), idDeLigne: l.id, partA: quand, jour: jourDeCotonou(quand), sorte: sorteDuModele(modele), famille: String(l.type ?? ''),
      modele, modeleDit: modeleDit(modele), clientId: String(l.pourId ?? l.clientId ?? ''), ...(l.apptId ? { apptId: l.apptId } : {}),
      raison: l.dateRdv && l.type !== 'avis-google' ? `Son rendez-vous du ${jourDit(l.dateRdv)}${l.heure ? ` à ${heureDuMessage(l.heure)}` : ''}.` : 'Déposé dans la salle d’attente.',
      ...(l.colis?.texteAuFil ? { texte: l.colis.texteAuFil } : {}),
      etat: arretee ? 'arrete' : 'en-salle',
      ...(arretee ? { arret: { par: String(l.arretDAvance?.par ?? ''), le: String(l.arretDAvance?.le ?? '') } } : {}),
    });
  }
  return out;
}

/** CE QUI VA PARTIR : la liste entière des sept jours, triée par heure, chaque
    message une fois (par sa clé), avec ce que la porte d'avance en dira :
    arrêté par la direction, modèle en pause, repli. Une prévision dont la
    ligne verrouille déjà au journal (partie, retenue, écartée) n'y est plus ;
    celle qui attend en salle y est, marquée « en salle ». */
export function ceQuiVaPartir(e: EntreesDeCeQuiVaPartir): MessagePrevu[] {
  const auJournal = new Map(e.envois.filter(Boolean).map((l) => [l.id, l]));
  const fin = instantDuSalon(jourPlusR(jourDeCotonou(e.maintenantMs), e.jours ?? JOURS_A_VENIR), 0);
  const parCle = new Map<string, MessagePrevu>();
  const ajoute = (m: MessagePrevu) => { if (!parCle.has(m.cle)) parCle.set(m.cle, m); };
  for (const m of dejaAuJournal(e)) ajoute(m);
  for (const m of [...rappelsDeLaVeille(e), ...messagesDePerle(e), ...relancesAVenir(e)]) {
    const l = auJournal.get(m.idDeLigne);
    if (l && verrouille(l)) continue;
    ajoute(m);
  }
  return [...parCle.values()]
    .filter((m) => m.partA > e.maintenantMs - 60_000 && m.partA < fin)
    .map((m) => avecLaPorteDAvance(m, e))
    .sort((a, b) => a.partA - b.partA || a.cle.localeCompare(b.cle));
}

/** CE QUE LA PORTE D'AVANCE DIRA de ce message, à l'écran : la même règle
    que le facteur (`laPorteDAvance`). Arrêté par la direction ; modèle en
    pause (ou son repli qui part à sa place) ; sinon il partira. Une ligne
    déjà écartée par un arrêt garde son arrêt tant qu'elle n'est pas rendue. */
export function avecLaPorteDAvance(m: MessagePrevu, e: { arrets?: readonly ArretDAvance[]; pauses?: readonly PauseDuModele[] }): MessagePrevu {
  const arret = arretEnVigueur(m.cle, e.arrets);
  if (arret) return { ...m, etat: 'arrete', arret: { par: String(arret.arretePar ?? '') || 'la direction', le: String(arret.arreteLe ?? '') } };
  if (m.etat === 'arrete') return m;
  const v = laPorteDAvance({ id: m.idDeLigne, colis: { genre: 'whatsapp', modele: m.modele } }, { pauses: e.pauses });
  if (v?.verdict === 'en-pause') return { ...m, etat: 'en-pause', pause: m.modele };
  if (v?.verdict === 'repli') return { ...m, etat: 'repli', pause: v.modele };
  return m;
}

/** « 9 partiront · 1 arrêté » : le compte de l'en-tête. */
export function compteDeCeQuiVaPartir(liste: readonly MessagePrevu[]): { partiront: number; arretes: number; enPause: number } {
  let partiront = 0; let arretes = 0; let enPause = 0;
  for (const m of liste) {
    if (m.etat === 'arrete') arretes += 1;
    else if (m.etat === 'en-pause') enPause += 1;
    else partiront += 1;
  }
  return { partiront, arretes, enPause };
}

/** LES JOURS DE L'ONGLET : chacun avec ses messages, même vide. */
export function parJour(liste: readonly MessagePrevu[], maintenantMs: number, jours = JOURS_A_VENIR): { jour: string; titre: string; messages: MessagePrevu[] }[] {
  const aujourdhui = jourDeCotonou(maintenantMs);
  return Array.from({ length: jours }, (_, k) => jourPlusR(aujourdhui, k)).map((jour) => ({
    jour, titre: jourEnTitre(jour, aujourdhui), messages: liste.filter((m) => m.jour === jour),
  }));
}

/** « Remettre » se peut-il encore ? Tant que son heure n'est pas passée. */
export const peutSeRemettre = (m: Pick<MessagePrevu, 'etat' | 'partA'>, maintenantMs: number): boolean => m.etat === 'arrete' && m.partA > maintenantMs;

/** « Ne partira pas · arrêté par Yéman, mercredi 4 novembre 2026 à 21 h 40. » */
export function arretDit(a: { par?: string; le?: string } | undefined): string {
  if (!a) return 'Ne partira pas.';
  const t = Date.parse(String(a.le ?? ''));
  const quand = Number.isFinite(t) ? `, ${jourDit(jourDeCotonou(t))} à ${heureDite(t)}` : '';
  return `Ne partira pas · arrêté par ${a.par || 'la direction'}${quand}.`;
}

/* ══ LES MODÈLES META, COMBIEN DE FOIS ═══════════════════════════════════
   « Je ne vois pas les listes des modèles Meta : combien de fois chaque
   modèle a été utilisé » (Yéman). Lu du fil (`messages_wa`) : chaque message
   sortant qui porte un modèle, et ce que WhatsApp en a dit. Les
   notifications et les SMS n'y sont pas : ce ne sont pas des modèles Meta. */
export type MessageDuFil = { sens?: string; modele?: string; etat?: string; quand?: string };
export type ChiffresDuModele = {
  modele: string; envoyes: number; ceMois: number; lus: number; nonRemis: number; dernier: string | null;
  /** Les « non remis » de suite, du plus récent au plus ancien. */
  serie: number;
  veille: 'rien' | 'signale' | 'pause';
};
export function chiffresDesModeles(messages: readonly (MessageDuFil | null | undefined)[], maintenantMs: number, connus: readonly string[] = []): ChiffresDuModele[] {
  const mois = jourDeCotonou(maintenantMs).slice(0, 7);
  const parModele = new Map<string, MessageDuFil[]>();
  for (const m of messages) {
    if (!m || m.sens !== 'sortant' || !m.modele) continue;
    const l = parModele.get(m.modele);
    if (l) l.push(m); else parModele.set(m.modele, [m]);
  }
  for (const n of connus) if (n && !parModele.has(n)) parModele.set(n, []);
  return [...parModele.entries()].map(([modele, ms]) => {
    let dernier: string | null = null;
    let ceMois = 0; let lus = 0; let nonRemis = 0;
    for (const m of ms) {
      const t = Date.parse(String(m.quand ?? ''));
      if (Number.isFinite(t) && jourDeCotonou(t).slice(0, 7) === mois) ceMois += 1;
      if (m.etat === 'lu') lus += 1;
      if (m.etat === 'non-remis') nonRemis += 1;
      if (Number.isFinite(t) && (dernier === null || t > Date.parse(dernier))) dernier = new Date(t).toISOString();
    }
    const serie = serieDeNonRemis(ms);
    return { modele, envoyes: ms.length, ceMois, lus, nonRemis, dernier, serie, veille: veilleDuModele(serie) };
  }).sort((a, b) => b.envoyes - a.envoyes || a.modele.localeCompare(b.modele));
}

/** L'ÉTAT CHEZ META, dit en français. */
export const ETAT_META_DIT: Record<string, string> = {
  APPROVED: 'Approuvé', PAUSED: 'En pause chez Meta', REJECTED: 'Refusé', DISABLED: 'Désactivé', PENDING: 'En revue',
  IN_APPEAL: 'En appel', PENDING_DELETION: 'En suppression', DELETED: 'Supprimé', LIMIT_EXCEEDED: 'Limite atteinte',
};
export const QUALITE_DITE: Record<string, string> = { GREEN: 'bonne', YELLOW: 'moyenne', RED: 'basse', UNKNOWN: 'en attente' };
export const etatMetaDit = (statut: unknown): string => ETAT_META_DIT[String(statut ?? '').toUpperCase()] ?? (statut ? String(statut) : 'inconnu');

/** « Reprendre chez Meta » n'a de sens que pour un modèle que Meta a mis en pause. */
export const repriseChezMetaPossible = (statut: unknown): boolean => String(statut ?? '').toUpperCase() === 'PAUSED';
