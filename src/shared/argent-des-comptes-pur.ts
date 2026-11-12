/* ══ L'ARGENT DES COMPTES · 12 novembre 2026 ════════════════════════════
   Maquette « Le choix du moyen » (DnRyTv95…), choix ⑥, « construis » de
   Yéman : « La paie du 5 d'abord (MTN Collection pour la paie MTN, FedaPay
   pour la paie Moov), le surplus à la banque chaque lundi. »

   CE QUE LA RÈGLE DIT, compte par compte (les caisses du Trône, à leur
   solde du jour) :
   · MTN COLLECTION garde d'abord ce qui manque au compte de paie MTN pour
     les bulletins pas encore versés (le net des bulletins, moins le solde lu
     chez MTN) ; le reste part à la banque. Le virement de la collecte vers
     le compte de paie se demande à MTN : le Trône dit combien, il ne le
     fait pas.
   · FEDAPAY garderait la paie Moov, mais FedaPay ne verse pas encore (lot 2
     de la paie) : la paie Moov se verse à la main, rien n'est gardé sur
     FedaPay, et la carte le dit.
   · KKIAPAY n'a rien à payer : tout part.
   · MTN MOMOPAY est à pointer sur le relevé d'abord : il ne compte pas dans
     le virement du lundi.

   ON GARDE UN PEU PLUS, JAMAIS MOINS : la paie à garder est le NET des
   bulletins pas encore versés (avant les frais d'envoi et les pourboires
   en espèces, qui le réduisent). Une paie qu'on ne peut pas lire (seul le
   souverain lit les bulletins) ne s'invente pas : le virement attend son
   poste.

   Pur : ni magasin ni horloge. `scripts/verifie-l-argent-des-comptes` le
   rejoue ; l'écran est `routes/finances/ArgentDesComptes.tsx`. */

export type CompteDuPrestataire = 'mtnCollection' | 'fedapay' | 'kkiapay' | 'momopay';
export const COMPTES: readonly CompteDuPrestataire[] = ['mtnCollection', 'fedapay', 'kkiapay', 'momopay'];
export const NOM_DU_COMPTE: Record<CompteDuPrestataire, string> = {
  mtnCollection: 'MTN Collection', fedapay: 'FedaPay', kkiapay: 'KkiaPay', momopay: 'MTN MoMoPay',
};

/** Un bulletin du mois, tel que la carte le lit. */
export type BulletinAGarder = { netXof: number; voie?: 'MTN' | 'Moov'; paye: boolean };
export type PaieAGarder = { mtnXof: number; moovXof: number; sansVoieXof: number; bulletins: number };

/** LA PAIE PAS ENCORE VERSÉE, par voie. Un bulletin payé ou à net nul ne
    compte pas. */
export function paieAGarder(bulletins: readonly BulletinAGarder[]): PaieAGarder {
  const p: PaieAGarder = { mtnXof: 0, moovXof: 0, sansVoieXof: 0, bulletins: 0 };
  for (const b of bulletins) {
    const net = Math.max(0, Math.round(Number(b.netXof) || 0));
    if (b.paye || net <= 0) continue;
    p.bulletins += 1;
    if (b.voie === 'MTN') p.mtnXof += net;
    else if (b.voie === 'Moov') p.moovXof += net;
    else p.sansVoieXof += net;
  }
  return p;
}

/** Les mois dont la paie peut être encore due : le mois d'avant (versé le
    5 de ce mois) et le mois en cours (versé le 5 du suivant, bulletins
    prêts le 1er). `mois` : AAAA-MM. */
export function moisDeLaPaie(aujourdhui: string): string[] {
  const [a, m] = aujourdhui.slice(0, 7).split('-').map(Number);
  const avant = m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
  return [avant, aujourdhui.slice(0, 7)];
}

/** LE LUNDI DU VIREMENT : aujourd'hui si c'est lundi, sinon le prochain. */
export function lundiDuVirement(aujourdhui: string): string {
  const d = new Date(`${aujourdhui}T12:00:00Z`);
  const j = d.getUTCDay();
  const decale = j === 1 ? 0 : (8 - j) % 7;
  d.setUTCDate(d.getUTCDate() + decale);
  return d.toISOString().slice(0, 10);
}

export type LigneDuCompte = {
  compte: CompteDuPrestataire;
  /** Le nom de la caisse au Trône ; absent : la caisse n'existe pas encore. */
  caisse?: string;
  soldeXof: number;
  /** Ce qui reste sur le compte (la paie). */
  garderXof: number;
  /** Ce qui part à la banque. */
  versBanqueXof: number;
  /** La phrase du compte. */
  dit: string;
  /** À pointer d'abord : n'entre pas dans le virement. */
  aPointer?: boolean;
};

export type ArgentDesComptes = {
  lignes: LigneDuCompte[];
  versLaBanqueXof: number;
  lundi: string;
  /** Ce qu'il faut demander à MTN : de la collecte vers le compte de paie. */
  versLaPaieMtnXof: number;
  /** Ce qui manquera encore au compte de paie MTN (la collecte n'y suffit pas). */
  manquePaieMtnXof: number;
  /** Le virement peut-il s'inscrire d'ici ? Sinon, pourquoi. */
  peutVirer: boolean;
  pourquoiPas?: string;
};

const F = (n: number) => `${Math.round(n).toLocaleString('fr-FR').replace(/[  ]/g, ' ')} F`;

/** L'ARGENT DES COMPTES. `soldes` : le solde du jour de chaque caisse
    (absente : `undefined`) ; `paie` : `null` quand ce poste ne lit pas les
    bulletins ; `soldePaieMtnXof` : le solde lu chez MTN, `null` s'il n'est
    pas lu (on garde alors toute la paie MTN). */
export function argentDesComptes(o: {
  aujourdhui: string;
  caisses: Partial<Record<CompteDuPrestataire, { nom: string; soldeXof: number }>>;
  paie: PaieAGarder | null;
  soldePaieMtnXof: number | null;
  /** FedaPay verse-t-il la paie Moov ? (lot 2 de la paie, pas encore.) */
  moovParFedaPay?: boolean;
}): ArgentDesComptes {
  const solde = (c: CompteDuPrestataire) => Math.max(0, Math.round(Number(o.caisses[c]?.soldeXof) || 0));
  const paie = o.paie;
  /* Un bulletin sans numéro connu ici (une entreprise, une fiche sans
     numéro) se garde avec la paie MTN : la paie part par MTN d'ordinaire,
     et l'on garde un peu plus, jamais moins. */
  const paieMtn = paie ? paie.mtnXof + paie.sansVoieXof : 0;
  const besoinMtn = paie ? Math.max(0, paieMtn - Math.max(0, Math.round(o.soldePaieMtnXof ?? 0))) : 0;
  const sCollecte = solde('mtnCollection');
  const versLaPaieMtnXof = Math.min(sCollecte, besoinMtn);
  const manquePaieMtnXof = Math.max(0, besoinMtn - versLaPaieMtnXof);

  const lignes: LigneDuCompte[] = [];
  const pose = (l: Omit<LigneDuCompte, 'caisse'>) => lignes.push({ ...l, ...(o.caisses[l.compte] ? { caisse: o.caisses[l.compte]!.nom } : {}) });

  pose({
    compte: 'mtnCollection', soldeXof: sCollecte, garderXof: versLaPaieMtnXof, versBanqueXof: sCollecte - versLaPaieMtnXof,
    dit: !paie
      ? 'La paie du mois ne se lit pas d’ici : rien n’est gardé.'
      : besoinMtn <= 0
        ? (paieMtn > 0 ? 'Le compte de paie MTN couvre déjà la paie : rien à garder.' : 'Aucune paie MTN à verser : rien à garder.')
        : `D’abord ${F(versLaPaieMtnXof)} vers le compte de paie MTN (à demander à MTN)${manquePaieMtnXof > 0 ? ` ; il manquera encore ${F(manquePaieMtnXof)}, à apporter par la banque` : ''}.`,
  });
  const sFeda = solde('fedapay');
  const moovGarde = paie && o.moovParFedaPay ? Math.min(sFeda, paie.moovXof) : 0;
  pose({
    compte: 'fedapay', soldeXof: sFeda, garderXof: moovGarde, versBanqueXof: sFeda - moovGarde,
    dit: !paie || paie.moovXof <= 0
      ? 'Rien à payer sur ce compte : tout part.'
      : o.moovParFedaPay
        ? `D’abord ${F(moovGarde)} pour la paie Moov.`
        : `La paie Moov (${F(paie.moovXof)}) se verse encore à la main : FedaPay ne verse pas encore. Rien n’est gardé ici.`,
  });
  const sKkia = solde('kkiapay');
  pose({ compte: 'kkiapay', soldeXof: sKkia, garderXof: 0, versBanqueXof: sKkia, dit: 'Rien à payer sur ce compte : tout part.' });
  const sMomo = solde('momopay');
  pose({ compte: 'momopay', soldeXof: sMomo, garderXof: sMomo, versBanqueXof: 0, aPointer: true, dit: 'À pointer sur le relevé d’abord ; il part ensuite avec le reste.' });

  /* MoMoPay n'envoie rien (sa ligne dit 0) : la seule garde est là. */
  const versLaBanqueXof = lignes.filter((l) => l.caisse).reduce((s, l) => s + l.versBanqueXof, 0);
  const peutVirer = !!paie && versLaBanqueXof > 0;
  return {
    lignes, versLaBanqueXof, lundi: lundiDuVirement(o.aujourdhui), versLaPaieMtnXof, manquePaieMtnXof, peutVirer,
    ...(peutVirer ? {} : { pourquoiPas: !paie ? 'Seul le souverain lit la paie : le virement du lundi se fait de son poste.' : 'Rien à virer.' }),
  };
}

/** L'identifiant d'un virement du lundi : un par compte et par jour, pour
    ne jamais l'inscrire deux fois. */
export const idDuVirement = (jour: string, compte: CompteDuPrestataire, branchId: string): string => `trf-lundi-${branchId}-${jour}-${compte}`;

/** LES VIREMENTS À INSCRIRE : un par compte qui envoie quelque chose, vers
    le compte de banque. */
export function virementsDuLundi(a: ArgentDesComptes, o: { jour: string; branchId: string; banque: string }): {
  id: string; branchId: string; date: string; de: string; vers: string; amountXof: number; note: string;
}[] {
  return a.lignes.filter((l) => l.caisse && l.versBanqueXof > 0).map((l) => ({
    id: idDuVirement(o.jour, l.compte, o.branchId), branchId: o.branchId, date: o.jour, de: l.caisse!, vers: o.banque, amountXof: l.versBanqueXof,
    note: `Le virement du lundi : « ${l.caisse} » passe à « ${o.banque} »${l.garderXof > 0 ? ` (${F(l.garderXof)} gardés pour la paie)` : ''}`,
  }));
}

/** Le virement de ce jour est-il déjà inscrit ? */
export const dejaVire = (transferts: readonly { id: string }[], jour: string, branchId: string): boolean =>
  COMPTES.some((c) => transferts.some((t) => t.id === idDuVirement(jour, c, branchId)));
