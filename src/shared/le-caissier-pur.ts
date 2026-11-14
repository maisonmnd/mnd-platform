import type { ConstatDuRdv, FicheLue, GesteSur, PieceLue, RdvLu } from './cloture-du-jour-pur';
import { aCotonouLe, acompteRecu, argentDuCarnet, francsDits, heureEnClair, resteDuRdv } from './cloture-du-jour-pur';

/* ══ LE CAISSIER DE LA MAISON — 13 novembre 2026 ════════════════════════
   « Le Trône n'a pas de caissier. J'aimerais créer un robot caissier qui se
   déclenche automatiquement pour finaliser un paiement ou une facture.
   Crée-le », puis « construis » (Yéman, 13 novembre 2026), sans maquette.

   LE CONSTAT (le 12 novembre 2026, lu en base) : deux rituels finis à
   10 h 15 et à 16 h 00 sont restés « pas encore encaissés » à la clôture de
   15 h, à celle de 19 h et au mot du lendemain matin ; la caisse du jour est
   restée à 0 F. Grenat les voyait, mais n'a le droit ni d'encaisser ni de
   réclamer : personne n'a tenu le comptoir.

   CE N'EST PAS UN AGENT DE PLUS. C'est GRENAT (l'argent, « Vente et Caisse,
   Finances » sur la carte de la Maison intelligente) qui tient aussi la
   caisse, entre ses deux clôtures : la fonction `cloture-du-jour` passe
   toutes les cinq minutes de 7 h à 23 h 55 (`moment: 'caisse'`, cron 0207),
   avec LA MÊME RÈGLE que la clôture, après la fermeture aussi (« parfois
   nous sommes sur les clients jusqu'à 21 h 30 »), et fait ceci :

     ① SEUL, DÈS QUE C'EST VRAI (au lieu d'attendre 15 h ou 19 h) : les
        gestes sûrs de la clôture. Passer « honoré » un rendez-vous réglé en
        entier, relier une facture à son seul rendez-vous, et envoyer le
        REÇU d'une pièce payée qui n'a plus bougé depuis quinze minutes (la
        main du comptoir a eu le temps d'envoyer le sien, ou de l'écarter) ;
        le soir, ce reçu passe les heures calmes de la salle (elle vient de
        régler).

     ② LE COMPTOIR PRÉVENU : quinze minutes après la fin prévue d'un rituel
        (heure + durée) où rien n'est encaissé, une notification à la
        direction et aux comptes qui ont encaissé ce jour-là : « À encaisser
        · F. F. — Fini vers 16 h 00 · 15 000 F. Encaissez-la ; sa facture ne
        part qu'avec l'accord de la direction (La journée). » Une fois par
        rendez-vous (`caissier.demandeLe` sur sa ligne).

   AUCUNE FACTURE NON RÉGLÉE NE PART SEULE — 14 novembre 2026, Yéman :
   « non aucune facture part s'il n'est pas encaissé je dois autoriser
   cela », puis au sélecteur « Oui, toutes ». Le 13 au soir, le caissier
   demandait la facture au Trône une heure après la fin et la déposait en
   salle ; c'est retiré, comme l'envoi des factures à régler par les
   clôtures de 15 h et 19 h (règle 4 de cloture-du-jour-pur : « à
   autoriser »). La facture part d'un toucher de la direction, « Envoyer sa
   facture », dans La journée (le chemin exprès `aRegler` du Trône).

   CE QU'IL NE FAIT JAMAIS : encaisser des espèces ou un MoMoPay (seule la
   main qui les a reçus le sait), envoyer une facture non réglée, dire
   venue, absente ou annulée, toucher un prix, une remise ou un versement,
   effacer. L'argent confirmé par un prestataire (MTN, FedaPay, KkiaPay) se
   pose déjà seul par leurs fonctions ; le caissier en finit les suites
   (honoré, reçu).

   CE MODULE EST PUR. Le bloc ⟨le-caissier⟩ est recopié À LA LETTRE dans la
   fonction `cloture-du-jour`, juste après le bloc ⟨cloture-du-jour⟩ dont il
   emploie les lectures (`aCotonouLe`, `resteDuRdv`, `argentDuCarnet`…) ;
   `node scripts/terminer-copie-serveur.mjs` le réécrit (la liste COPIES),
   le banc `verifie-le-caissier` et les douze lunes les comparent. Le Trône
   l'importe tel quel. */

/* ⟨le-caissier⟩ */
export const VERSION_DU_CAISSIER = '2026-11-14-a';

/** Le caissier passe toutes les cinq minutes (le cron de 0207). */
export const RYTHME_DU_CAISSIER_MIN = 5;
/** Le comptoir est prévenu quinze minutes après la fin prévue d'un rituel où rien n'est encaissé. */
export const COMPTOIR_PREVENU_APRES_MIN = 15;
/** Le reçu d'une pièce payée part quand la pièce n'a plus bougé depuis quinze minutes. */
export const RECU_APRES_MIN = 15;

/** Les réglages du caissier (`mnd_settings.caissier`) : allumé par défaut. */
export type ReglagesDuCaissier = { actif: boolean };

export function reglagesDuCaissier(brut: unknown): ReglagesDuCaissier {
  const r = (brut && typeof brut === 'object' ? brut : {}) as { actif?: unknown };
  return { actif: r.actif !== false };
}

/** LA MARQUE DU CAISSIER sur un rendez-vous : le comptoir prévenu, et quand
    (posée par le serveur, sous condition). */
export type MarqueDuCaissier = { demandeLe?: string };

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

export type DecisionDuCaissier = { genre: 'prevenir-le-comptoir'; cle: string; rdvId: string; titre: string; corps: string };

/** LA FACTURE PEUT-ELLE PARTIR QUAND LA DIRECTION L'AUTORISE ? `null` : oui ;
    sinon pourquoi pas, en clair. La destinataire est celle de la clôture : la
    payeuse si elle a un numéro, sinon la cliente du rituel. */
export function pourquoiPasDeFacture(a: RdvDuCaissier, fiches: readonly FicheDuCaissier[]): string | null {
  const soignee = fiches.find((x) => x.id === a.clientId);
  const payeuse = a.offertPar ? fiches.find((x) => x.id === a.offertPar) : soignee;
  const destinataire = payeuse?.aUnNumero ? payeuse : soignee;
  if (!soignee || !destinataire) return 'sans fiche';
  if (destinataire.sansPapiersWa) return 'pas de facture par WhatsApp (sa fiche le dit)';
  if (!destinataire.aUnNumero) return 'pas de numéro sur sa fiche';
  return null;
}

/** CE QU'IL FAUT SAVOIR AVANT D'AUTORISER, en clair (rien ne l'empêche). */
export function aSavoirAvantDEnvoyer(a: RdvDuCaissier, fiches: readonly FicheDuCaissier[]): string[] {
  const soignee = fiches.find((x) => x.id === a.clientId);
  const payeuse = a.offertPar ? fiches.find((x) => x.id === a.offertPar) : undefined;
  const dits: string[] = [];
  if (soignee?.passeAuComptoir || payeuse?.passeAuComptoir) dits.push('elle règle d’habitude au comptoir');
  if ((Number(a.depositXof) || 0) > 0 && !a.depositConfirmed) dits.push('un acompte attend d’être vérifié');
  if (argentDuCarnet(a) + acompteRecu(a) > 0) dits.push('une partie est déjà encaissée');
  return dits;
}

/** LA NOTIFICATION DU COMPTOIR : des initiales et un montant, jamais un nom. */
export function notificationDuComptoir(c: Pick<ConstatDuRdv, 'qui' | 'finDite'>, resteXof: number): { titre: string; corps: string } {
  return {
    titre: `À encaisser · ${c.qui || 'une cliente'}`,
    corps: `Fini vers ${c.finDite} · ${francsDits(resteXof)}. Encaissez-la ; sa facture ne part qu’avec l’accord de la direction (La journée).`,
  };
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

/** ② : CE QUE LE CAISSIER DÉCIDE À CE PASSAGE. Seulement le jour même (un
    jour passé est l'affaire de la clôture et de la direction). */
export function decisionsDuCaissier(f: FaitsDuCaissier): DecisionDuCaissier[] {
  if (!f.reglages.actif) return [];
  const ici = aCotonouLe(f.maintenantMs);
  if (ici.jour !== f.jour) return [];
  const sorties: DecisionDuCaissier[] = [];
  for (const c of f.constats) {
    const s = suivi(c, f);
    if (!s || s.a.caissier?.demandeLe) continue;
    if (ici.minutes < c.finMin + COMPTOIR_PREVENU_APRES_MIN) continue;
    sorties.push({ genre: 'prevenir-le-comptoir', cle: `comptoir:${s.a.id}`, rdvId: s.a.id, ...notificationDuComptoir(c, s.reste) });
  }
  return sorties;
}

/** ① LES GESTES SÛRS DE LA CLÔTURE QUE LE CAISSIER FAIT ENTRE DEUX CLÔTURES.
    Honorer un rendez-vous réglé et relier une pièce : toujours. Le reçu
    d'une pièce payée : quand elle n'a plus bougé depuis quinze minutes.
    Une facture à régler : JAMAIS (la direction l'autorise). */
export function gesteDuCaissier(g: GesteSur, f: FaitsDuCaissier): boolean {
  if (!f.reglages.actif) return false;
  const ici = aCotonouLe(f.maintenantMs);
  if (ici.jour !== f.jour) return false;
  if (g.genre === 'passer-honore' || g.genre === 'relier-la-piece') return true;
  if (g.papier !== 'recu') return false;
  const p = f.pieces.find((x) => x.id === g.pieceId);
  const calme = Date.parse(p?.modifieeLe ?? '');
  return !!p && Number.isFinite(calme) && f.maintenantMs - calme >= RECU_APRES_MIN * 60_000;
}

/** CE QUE L'ÉCRAN DIT DU CAISSIER, rendez-vous par rendez-vous (La journée). */
export type LigneDuCaissier = {
  rdvId: string; qui: string; heure: string; finDite: string;
  etat: 'a-venir' | 'prevenu' | 'facture-partie' | 'honore-seul';
  dit: string;
  /** La facture peut partir quand la direction l'autorise. */
  peutEnvoyer: boolean;
  /** Ce qu'il faut savoir avant d'autoriser. */
  aSavoir: string[];
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
      lignes.push({ ...base, etat: 'honore-seul', dit: `Réglé en entier : passé honoré seul à ${heureDe(honore.le)}.`, peutEnvoyer: false, aSavoir: [] });
      continue;
    }
    const s = suivi(c, f);
    if (!s) continue;
    if (c.pieceId && f.facturesParties?.has(c.pieceId)) {
      lignes.push({ ...base, etat: 'facture-partie', dit: 'Sa facture est partie sur son WhatsApp, avec son bouton de règlement.', peutEnvoyer: false, aSavoir: [] });
      continue;
    }
    const pourquoiPas = pourquoiPasDeFacture(s.a, f.fiches);
    const marque = s.a.caissier ?? {};
    const prevenu = marque.demandeLe ? `Comptoir prévenu à ${heureDe(marque.demandeLe)}` : `Le comptoir sera prévenu vers ${heureEnClair(c.finMin + COMPTOIR_PREVENU_APRES_MIN)}`;
    const suite = pourquoiPas ? `sa facture ne peut pas partir (${pourquoiPas})` : 'sa facture attend votre « Envoyer »';
    lignes.push({ ...base, etat: marque.demandeLe ? 'prevenu' : 'a-venir', dit: `${prevenu} ; ${francsDits(s.reste)} à encaisser, ${suite}.`,
      peutEnvoyer: !pourquoiPas, aSavoir: aSavoirAvantDEnvoyer(s.a, f.fiches) });
  }
  return lignes;
}
/* ⟨/le-caissier⟩ */
