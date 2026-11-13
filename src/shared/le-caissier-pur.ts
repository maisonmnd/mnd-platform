import type { ConstatDuRdv, FicheLue, GesteSur, PieceLue, RdvLu } from './cloture-du-jour-pur';
import { aCotonouLe, acompteRecu, argentDuCarnet, francsDits, heureEnClair, resteDuRdv } from './cloture-du-jour-pur';

/* ══ LE CAISSIER DE LA MAISON — 13 novembre 2026 ════════════════════════
   « Le Trône n'a pas de caissier. J'aimerais créer un robot caissier qui se
   déclenche automatiquement pour finaliser un paiement ou une facture.
   Crée-le », puis « construis » (Yéman, 13 novembre 2026), sans maquette :
   les choix ci-dessous sont les propositions prudentes, à relire.

   LE CONSTAT (le 12 novembre 2026, lu en base) : deux rituels finis à
   10 h 15 et à 16 h 00 sont restés « pas encore encaissés » à la clôture de
   15 h, à celle de 19 h et au mot du lendemain matin ; la caisse du jour est
   restée à 0 F. Grenat les voyait, mais n'a le droit ni d'encaisser ni de
   réclamer : personne n'a tenu le comptoir.

   CE N'EST PAS UN AGENT DE PLUS. C'est GRENAT (l'argent, « Vente et Caisse,
   Finances » sur la carte de la Maison intelligente) qui tient aussi la
   caisse, entre ses deux clôtures : la fonction `cloture-du-jour` passe
   toutes les cinq minutes de 7 h à 23 h (`moment: 'caisse'`, cron 0207),
   avec LA MÊME RÈGLE que la clôture, et fait ceci :

     ① SEUL, DÈS QUE C'EST VRAI (au lieu d'attendre 15 h ou 19 h) : les
        gestes sûrs de la clôture. Passer « honoré » un rendez-vous réglé en
        entier, relier une facture à son seul rendez-vous, et envoyer le
        reçu d'une pièce payée qui n'a plus bougé depuis quinze minutes (la
        main du comptoir a eu le temps d'envoyer le sien, ou de l'écarter).
        La facture « à régler » d'une pièce que le comptoir a écrite reste
        l'affaire des clôtures de 15 h et 19 h, comme avant.

     ② LE COMPTOIR PRÉVENU : quinze minutes après la fin prévue d'un rituel
        (heure + durée) où rien n'est encaissé, une notification à la
        direction et aux comptes qui ont encaissé ce jour-là : « À encaisser
        · F. F. — Fini vers 16 h 00 · 15 000 F. Sans encaissement d'ici là,
        sa facture partira seule vers 17 h 00. » Une fois par rendez-vous
        (`caissier.demandeLe` sur sa ligne).

     ③ LA FACTURE QUI PART SEULE : une heure après la fin prévue (réglable :
        30 min, 1 h, 2 h, ou jamais), toujours rien d'encaissé, le caissier
        DEMANDE la pièce (`caissier.pieceDemandeeLe`) ; un Trône ouvert
        l'écrit au tarif de sa tête (`useLeCaissier`, la même écriture que
        « Terminer et régler » : le serveur ne connaît pas le tarif d'une
        tête), puis le passage suivant la dépose en salle d'attente (la
        facture avec son bouton de règlement, celle de Grenat). Jamais après
        23 h ; le soir, elle passe les heures calmes de la salle (« parfois
        nous sommes sur les clients jusqu'à 21 h 30 », Yéman, 13 novembre
        2026 : elle vient de quitter la Maison, sa facture ne la réveille
        pas ; `useLaMainDeGrenat` la pose « maintenant ») ; jamais pour une fiche « passe au
        comptoir », sans numéro, ou « pas de papiers par WhatsApp » ; jamais
        quand un acompte attend sa vérification ou qu'une partie est déjà
        encaissée (une main s'en occupe) ; jamais un rendez-vous que la
        cliente a terminé elle-même (sa porte a déjà sa pièce). « Retenir sa
        facture », à La journée, l'arrête pour ce rendez-vous.

   CE QU'IL NE FAIT JAMAIS : encaisser des espèces ou un MoMoPay (seule la
   main qui les a reçus le sait), dire venue, absente ou annulée, toucher
   un prix, une remise ou un versement, effacer. L'argent confirmé par un
   prestataire (MTN, FedaPay, KkiaPay) se pose déjà seul par leurs fonctions ;
   le caissier en finit les suites (honoré, reçu).

   CE MODULE EST PUR. Le bloc ⟨le-caissier⟩ est recopié À LA LETTRE dans la
   fonction `cloture-du-jour`, juste après le bloc ⟨cloture-du-jour⟩ dont il
   emploie les lectures (`aCotonouLe`, `resteDuRdv`, `argentDuCarnet`…) ;
   `node scripts/terminer-copie-serveur.mjs` le réécrit (la liste COPIES),
   le banc `verifie-le-caissier` et les douze lunes les comparent. Le Trône
   l'importe tel quel. */

/* ⟨le-caissier⟩ */
export const VERSION_DU_CAISSIER = '2026-11-13-b';

/** Le caissier passe toutes les cinq minutes (le cron de 0207). */
export const RYTHME_DU_CAISSIER_MIN = 5;
/** Le comptoir est prévenu quinze minutes après la fin prévue d'un rituel où rien n'est encaissé. */
export const COMPTOIR_PREVENU_APRES_MIN = 15;
/** La facture part seule une heure après la fin prévue, quand rien n'est réglé. */
export const FACTURE_SEULE_APRES_MIN_PAR_DEFAUT = 60;
/** Les délais que Paramètres propose ; 0 : jamais seule (le comptoir est seulement prévenu). */
export const DELAIS_DE_LA_FACTURE: readonly number[] = [0, 30, 60, 120];
/** Le reçu d'une pièce payée part quand la pièce n'a plus bougé depuis quinze minutes. */
export const RECU_APRES_MIN = 15;
/** LA DERNIÈRE FACTURE SEULE, 23 h (13 novembre 2026, d'abord 19 h 30) : « il
    faut que le caissier agisse à la fin de tous les RDV même si c'est après
    l'heure de fermeture car parfois nous sommes sur les clients jusqu'à
    21 h 30 » (Yéman). Un rituel fini à 21 h 30 a sa facture vers 22 h 30 ;
    après 23 h, rien ne part seul la nuit (le comptoir, lui, est prévenu
    jusqu'au dernier passage, 23 h 55). Le soir, la facture du caissier
    passe les heures calmes de la salle (20 h à 8 h). */
export const DERNIERE_FACTURE_SEULE_MIN = 23 * 60;
/** LA FENÊTRE DE LA FACTURE SEULE : trente minutes après son heure. Le
    caissier passe toutes les cinq minutes ; s'il n'a pas pu passer (éteint,
    rallumé le soir, appels de la base en panne), il ne rattrape pas une
    facture du matin le soir venu : le retard ne se voit pas, le comptoir a
    été prévenu et la clôture le redit. */
export const FENETRE_DE_LA_FACTURE_MIN = 30;

/** Les réglages du caissier (`mnd_settings.caissier`) : allumé par défaut, une heure par défaut. */
export type ReglagesDuCaissier = { actif: boolean; factureApresMin: number };

export function reglagesDuCaissier(brut: unknown): ReglagesDuCaissier {
  const r = (brut && typeof brut === 'object' ? brut : {}) as { actif?: unknown; factureApresMin?: unknown };
  const delai = Number(r.factureApresMin);
  return {
    actif: r.actif !== false,
    factureApresMin: r.factureApresMin !== undefined && DELAIS_DE_LA_FACTURE.includes(delai) ? delai : FACTURE_SEULE_APRES_MIN_PAR_DEFAUT,
  };
}

/** LA MARQUE DU CAISSIER sur un rendez-vous : ce qu'il a fait, et quand.
    `demandeLe` (le comptoir prévenu) et `pieceDemandeeLe` (la facture à
    écrire) sont posés par le serveur ; `pieceLe` par le poste qui l'écrit ;
    `retenueLe` par une main au comptoir. */
export type MarqueDuCaissier = {
  demandeLe?: string;
  pieceDemandeeLe?: string;
  pieceLe?: string;
  retenueLe?: string;
  retenuePar?: string;
};

/** Ce que le caissier lit d'un rendez-vous, en plus de ce que lit la clôture. */
export type RdvDuCaissier = RdvLu & { offertPar?: string; termineParElle?: unknown; caissier?: MarqueDuCaissier | null };
/** Une fiche, et la case « Passe au comptoir ». */
export type FicheDuCaissier = FicheLue & { passeAuComptoir?: boolean };
/** Une pièce, et l'heure de sa dernière écriture (`updated_at` de la base). */
export type PieceDuCaissier = PieceLue & { modifieeLe?: string };

export type FaitsDuCaissier = {
  jour: string;
  maintenantMs: number;
  /** Les constats de la clôture du même instant (`clotureDuJour(...).rdvs`). */
  constats: readonly ConstatDuRdv[];
  rdvs: readonly RdvDuCaissier[];
  fiches: readonly FicheDuCaissier[];
  pieces: readonly PieceDuCaissier[];
  reglages: ReglagesDuCaissier;
};

export type DecisionDuCaissier =
  | { genre: 'prevenir-le-comptoir'; cle: string; rdvId: string; titre: string; corps: string; factureVersMin: number | null }
  | { genre: 'demander-la-piece'; cle: string; rdvId: string; dit: string };

/** L'HEURE OÙ LA FACTURE D'UN RITUEL PART SEULE, en minutes depuis minuit à
    Cotonou ; `null` : jamais seule pour lui (caissier éteint, délai « jamais »,
    ou trop tard dans la journée). */
export function heureDeLaFactureSeule(finMin: number, reglages: ReglagesDuCaissier): number | null {
  if (!reglages.actif || !(reglages.factureApresMin > 0)) return null;
  const a = finMin + reglages.factureApresMin;
  return a <= DERNIERE_FACTURE_SEULE_MIN ? a : null;
}

/** POURQUOI SA FACTURE NE PART PAS SEULE, en clair ; `null` : elle peut
    partir. La destinataire est celle de la clôture : la payeuse si elle a un
    numéro, sinon la cliente du rituel. */
export function pourquoiPasDeFactureSeule(a: RdvDuCaissier, fiches: readonly FicheDuCaissier[]): string | null {
  if (a.caissier?.retenueLe) return 'retenue au comptoir';
  if (a.termineParElle) return 'elle a terminé elle-même : sa porte a sa pièce';
  const soignee = fiches.find((x) => x.id === a.clientId);
  const payeuse = a.offertPar ? fiches.find((x) => x.id === a.offertPar) : soignee;
  const destinataire = payeuse?.aUnNumero ? payeuse : soignee;
  if (!soignee || !destinataire) return 'sans fiche';
  if (soignee.passeAuComptoir || (payeuse && payeuse.passeAuComptoir)) return 'elle passe toujours au comptoir';
  if (destinataire.sansPapiersWa) return 'pas de facture par WhatsApp (sa fiche le dit)';
  if (!destinataire.aUnNumero) return 'pas de numéro sur sa fiche';
  if ((Number(a.depositXof) || 0) > 0 && !a.depositConfirmed) return 'un acompte attend d’être vérifié';
  if (argentDuCarnet(a) + acompteRecu(a) > 0) return 'une partie est déjà encaissée';
  return null;
}

/** LA NOTIFICATION DU COMPTOIR : des initiales et un montant, jamais un nom. */
export function notificationDuComptoir(c: Pick<ConstatDuRdv, 'qui' | 'finDite'>, resteXof: number, factureVersMin: number | null): { titre: string; corps: string } {
  const suite = factureVersMin === null
    ? 'Encaissez-la au comptoir, ou dites ce qui s’est passé dans La journée.'
    : `Sans encaissement d’ici là, sa facture partira seule vers ${heureEnClair(factureVersMin)}.`;
  return { titre: `À encaisser · ${c.qui || 'une cliente'}`, corps: `Fini vers ${c.finDite} · ${francsDits(resteXof)}. ${suite}` };
}

/** Le rituel que le caissier suit : passé, encore « confirmé », un reste dû,
    et pas terminé par elle (sa porte a déjà prévenu l'équipe et écrit sa pièce). */
function suivi(c: ConstatDuRdv, f: FaitsDuCaissier): { a: RdvDuCaissier; reste: number } | null {
  if (c.etat !== 'a-encaisser') return null;
  const a = f.rdvs.find((r) => r.id === c.id);
  if (!a || a.status !== 'confirmé' || a.termineParElle) return null;
  const reste = resteDuRdv(a);
  return typeof reste === 'number' && reste > 0 ? { a, reste } : null;
}

/** ② ET ③ : CE QUE LE CAISSIER DÉCIDE À CE PASSAGE. Seulement le jour
    même (un jour passé est l'affaire de la clôture et de la direction). */
export function decisionsDuCaissier(f: FaitsDuCaissier): DecisionDuCaissier[] {
  if (!f.reglages.actif) return [];
  const ici = aCotonouLe(f.maintenantMs);
  if (ici.jour !== f.jour) return [];
  const sorties: DecisionDuCaissier[] = [];
  for (const c of f.constats) {
    const s = suivi(c, f);
    if (!s) continue;
    const marque = s.a.caissier ?? {};
    const pourquoiPas = pourquoiPasDeFactureSeule(s.a, f.fiches);
    /* Une pièce existe déjà (écrite au comptoir, ou demandée par lui) : il ne la redemande pas. */
    const factureVers = pourquoiPas || c.pieceId ? null : heureDeLaFactureSeule(c.finMin, f.reglages);
    if (!marque.demandeLe && ici.minutes >= c.finMin + COMPTOIR_PREVENU_APRES_MIN) {
      const n = notificationDuComptoir(c, s.reste, c.pieceId || marque.pieceDemandeeLe ? null : factureVers);
      sorties.push({ genre: 'prevenir-le-comptoir', cle: `comptoir:${s.a.id}`, rdvId: s.a.id, ...n, factureVersMin: factureVers });
    }
    if (!marque.pieceDemandeeLe && factureVers !== null && ici.minutes >= factureVers
      && ici.minutes <= Math.min(factureVers + FENETRE_DE_LA_FACTURE_MIN, DERNIERE_FACTURE_SEULE_MIN)) {
      sorties.push({ genre: 'demander-la-piece', cle: `piece:${s.a.id}`, rdvId: s.a.id,
        dit: `${c.qui} · ${c.heure} : rien encaissé ${f.reglages.factureApresMin} min après la fin ; sa facture s’écrit au Trône, puis part.` });
    }
  }
  return sorties;
}

/** ① LES GESTES SÛRS DE LA CLÔTURE QUE LE CAISSIER FAIT ENTRE DEUX CLÔTURES.
    Honorer un rendez-vous réglé et relier une pièce : toujours. Le reçu
    d'une pièce payée : quand elle n'a plus bougé depuis quinze minutes. La
    facture à régler : seulement celle qu'il a fait écrire, à son heure. */
export function gesteDuCaissier(g: GesteSur, f: FaitsDuCaissier): boolean {
  if (!f.reglages.actif) return false;
  const ici = aCotonouLe(f.maintenantMs);
  if (ici.jour !== f.jour) return false;
  if (g.genre === 'passer-honore' || g.genre === 'relier-la-piece') return true;
  const p = f.pieces.find((x) => x.id === g.pieceId);
  if (!p) return false;
  if (g.papier === 'recu') {
    const calme = Date.parse(p.modifieeLe ?? '');
    return Number.isFinite(calme) && f.maintenantMs - calme >= RECU_APRES_MIN * 60_000;
  }
  const a = f.rdvs.find((r) => r.id === p.apptId);
  if (!a || a.id !== g.rdvId || !a.caissier?.pieceDemandeeLe || a.status !== 'confirmé') return false;
  if (pourquoiPasDeFactureSeule(a, f.fiches)) return false;
  const c = f.constats.find((x) => x.id === a.id);
  if (!c) return false;
  const factureVers = heureDeLaFactureSeule(c.finMin, f.reglages);
  return factureVers !== null && ici.minutes >= factureVers && ici.minutes <= DERNIERE_FACTURE_SEULE_MIN;
}

/** LA PIÈCE DEMANDÉE, AU TRÔNE : à écrire seulement si le rendez-vous la
    réclame encore (demandée, pas retenue, toujours « confirmé », pas terminé
    par elle) et qu'aucune pièce ne le porte déjà. */
export function pieceDuCaissierAEcrire(a: { status?: string; caissier?: MarqueDuCaissier | null; termineParElle?: unknown }, aDejaUnePiece: boolean): boolean {
  return !!a.caissier?.pieceDemandeeLe && !a.caissier.retenueLe && a.status === 'confirmé' && !a.termineParElle && !aDejaUnePiece;
}

/** CE QUE L'ÉCRAN DIT DU CAISSIER, rendez-vous par rendez-vous (La journée). */
export type LigneDuCaissier = {
  rdvId: string; qui: string; heure: string; finDite: string;
  etat: 'a-venir' | 'prevenu' | 'facture-ecrite' | 'retenue' | 'honore-seul';
  dit: string;
  /** « Retenir sa facture » a un sens : elle n'est ni partie, ni retenue. */
  peutRetenir: boolean;
};

export function lignesDuCaissier(f: FaitsDuCaissier & { facturesParties?: ReadonlySet<string> }): LigneDuCaissier[] {
  const lignes: LigneDuCaissier[] = [];
  const heureDe = (iso?: string): string => {
    const ms = Date.parse(iso ?? '');
    return Number.isFinite(ms) ? heureEnClair(aCotonouLe(ms).minutes) : '';
  };
  for (const c of f.constats) {
    const a = f.rdvs.find((r) => r.id === c.id);
    if (!a) continue;
    const base = { rdvId: a.id, qui: c.qui, heure: c.heure, finDite: c.finDite };
    const honore = a.honoreParGrenat as { le?: string; moment?: string } | null | undefined;
    if (honore?.moment === 'caisse') {
      lignes.push({ ...base, etat: 'honore-seul', dit: `Réglé en entier : passé honoré seul à ${heureDe(honore.le)}.`, peutRetenir: false });
      continue;
    }
    const s = suivi(c, f);
    if (!s) continue;
    const marque = a.caissier ?? {};
    if (marque.retenueLe) {
      lignes.push({ ...base, etat: 'retenue', dit: `Facture retenue${marque.retenuePar ? ` par ${marque.retenuePar}` : ''} à ${heureDe(marque.retenueLe)} : elle ne part pas seule.`, peutRetenir: false });
      continue;
    }
    const pourquoiPas = pourquoiPasDeFactureSeule(a, f.fiches);
    const factureVers = pourquoiPas ? null : heureDeLaFactureSeule(c.finMin, f.reglages);
    const partie = !!c.pieceId && !!f.facturesParties?.has(c.pieceId);
    if (marque.pieceDemandeeLe || (c.pieceId && marque.pieceLe)) {
      lignes.push({ ...base, etat: 'facture-ecrite', peutRetenir: !partie,
        dit: partie ? 'Sa facture est partie sur son WhatsApp, avec son bouton de règlement.'
          : c.pieceId ? `Sa facture est écrite${factureVers !== null ? ` ; elle part vers ${heureEnClair(Math.max(factureVers, aCotonouLe(f.maintenantMs).minutes))}` : ''}.`
            : 'Sa facture attend un Trône ouvert pour s’écrire au tarif de sa tête.' });
      continue;
    }
    const prevenuA = heureDe(marque.demandeLe);
    const suite = c.pieceId ? 'une facture est déjà écrite au comptoir' : factureVers !== null ? `sa facture partira seule vers ${heureEnClair(factureVers)}` : `pas de facture seule : ${pourquoiPas ?? (f.reglages.actif && f.reglages.factureApresMin > 0 ? 'trop tard dans la journée' : 'réglage « jamais »')}`;
    lignes.push({ ...base, etat: marque.demandeLe ? 'prevenu' : 'a-venir', peutRetenir: !c.pieceId && factureVers !== null,
      dit: marque.demandeLe ? `Comptoir prévenu à ${prevenuA} ; ${suite}.` : `Le comptoir sera prévenu vers ${heureEnClair(c.finMin + COMPTOIR_PREVENU_APRES_MIN)} ; ${suite}.` });
  }
  return lignes;
}
/* ⟨/le-caissier⟩ */
