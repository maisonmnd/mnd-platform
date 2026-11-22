/* ══ LA TRACE D'UN CHÈQUE OU D'UNE CARTE — 18 octobre 2026 ══════════════
   « Pour les chèques renseigner banque + numéro chèque ou une photo du chèque
   avant validation » (Yéman), puis « une maquette pour chèque et carte
   aussi ». Maquette « Chèque et carte » validée le même jour, ses huit choix
   lus en base `maquette/cheque-carte` :
     · chèque : la banque ET le numéro, OU une photo du chèque ;
     · la banque se choisit dans une liste (plus « Autre banque ») ;
     · « Au nom de », facultatif (un chèque signé par un autre) ;
     · carte : le n° d'autorisation du ticket du terminal, OU sa photo ;
     · partout : l'encaissement du rituel, la Caisse, « Marquer payée » ;
     · la photo : la direction, et qui l'a prise (un chèque porte un numéro
       de compte) ;
     · une liste « Chèques à déposer », et « Marquer déposé » ;
     · la facture de la cliente dit « Chèque », sans banque ni numéro.

   La trace vit sur le VERSEMENT de la pièce (`InvoicePayment.trace`) : c'est
   lui la vérité de l'argent. */

export type TraceDuMoyen = {
  /** Chèque : sa banque, son numéro, et le nom porté s'il n'est pas celui de la cliente. */
  banque?: string;
  numero?: string;
  auNomDe?: string;
  /** Carte : le n° d'autorisation du ticket du terminal, et les 4 derniers chiffres. */
  autorisation?: string;
  quatre?: string;
  /** Le TPE KkiaPay (22 novembre 2026) : la référence de la transaction, et ce
      que KkiaPay en a dit. `verifieeLe` : KkiaPay a confirmé (par la référence
      tapée, ou par le paiement choisi parmi ceux reçus). `injoignable` :
      KkiaPay n'a pas répondu, la référence est gardée et se pointe le soir. */
  kkiapay?: KkiapayDeLaTrace;
  /** La photo, dans le compartiment privé `traces-privees`. */
  photo?: { chemin: string; le: string; par?: string };
  /** Un chèque porté à la banque. */
  deposeLe?: string;
  deposePar?: string;
};

export type KkiapayDeLaTrace = {
  ref: string;
  /** Ce que KkiaPay a reçu pour la Maison, et ses frais (payés par la cliente). */
  montantXof?: number;
  fraisXof?: number;
  /** CARD, MOBILE_MONEY… comme KkiaPay le dit. */
  source?: string;
  verifieeLe?: string;
  injoignable?: boolean;
  /** Choisi parmi les paiements reçus (voie 1), plutôt que tapé (voie 2). */
  choisi?: boolean;
};

export type FamilleDeTrace = 'cheque' | 'carte' | 'kkiapay';

/** Le moyen qui demande une trace, ou null. Le TPE KkiaPay (« Carte · KkiaPay »)
    a la sienne : ni ticket, ni n° d'autorisation, ni 4 derniers chiffres ;
    la référence de KkiaPay (22 novembre 2026, « on ne peut pas saisir un
    numéro de ticket et 4 derniers chiffres », Yéman). */
export function familleDeTrace(methode: string | undefined): FamilleDeTrace | null {
  const m = (methode ?? '').trim().toLowerCase();
  if (/^ch[eè]que/.test(m)) return 'cheque';
  if (/^carte\s*·\s*kkiapay/.test(m)) return 'kkiapay';
  if (/^carte/.test(m)) return 'carte';
  return null;
}

/** Une référence KkiaPay plausible : lettres et chiffres, 6 au moins (sans espaces). */
export const refKkiapayPropre = (s: string | undefined): string => (s ?? '').replace(/\s+/g, '').trim();
export const refKkiapayPlausible = (s: string | undefined): boolean => /^[A-Za-z0-9_-]{6,64}$/.test(refKkiapayPropre(s));

/** Ce que KkiaPay a reçu couvre-t-il la part ? Un franc d'arrondi. Null tant
    que KkiaPay n'a rien dit du montant. */
export function kkiapayCouvre(k: KkiapayDeLaTrace | undefined, montantXof: number | undefined): boolean | null {
  if (!k?.verifieeLe || !(Number(k.montantXof) > 0) || !(Number(montantXof) > 0)) return null;
  return Math.round(Number(k.montantXof)) + 1 >= Math.round(Number(montantXof));
}

/** Les banques du Bénin proposées (liste à vérifier par la Maison) ; « Autre banque » en dernier. */
export const BANQUES_DU_BENIN: readonly string[] = [
  'BOA Bénin', 'Ecobank Bénin', 'Orabank Bénin', 'BIIC', 'UBA Bénin', 'NSIA Banque Bénin', 'Coris Bank Bénin',
  'BGFIBank Bénin', 'Banque Atlantique Bénin', 'CCEI Bank Bénin', 'BSIC Bénin', 'Société Générale Bénin',
];
export const AUTRE_BANQUE = 'Autre banque';

const propre = (s: string | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();

/** LA RÈGLE : ce qu'il faut avant d'encaisser. Une photo suffit toujours.
    Le TPE KkiaPay : une référence que KkiaPay a confirmée et dont le montant
    couvre la part (quand on la connaît), ou une référence gardée parce que
    KkiaPay n'a pas répondu ; jamais une référence pas encore vérifiée, ni
    celle qu'il dit inconnue ou échouée. */
export function traceSuffit(famille: FamilleDeTrace | null, t: TraceDuMoyen | undefined, montantXof?: number): boolean {
  if (!famille) return true;
  if (t?.photo?.chemin) return true;
  if (famille === 'kkiapay') {
    const k = t?.kkiapay;
    if (!k || !refKkiapayPlausible(k.ref)) return false;
    if (k.injoignable) return true;
    if (!k.verifieeLe) return false;
    return kkiapayCouvre(k, montantXof) !== false;
  }
  if (famille === 'cheque') {
    const banque = propre(t?.banque);
    return !!banque && banque !== AUTRE_BANQUE && /^\d{5,}$/.test((t?.numero ?? '').replace(/\s/g, ''));
  }
  return /^[A-Za-z0-9]{4,}$/.test(propre(t?.autorisation));
}

/** Ce que l'écran dit quand la trace manque. */
export const ditCeQuiManque = (famille: FamilleDeTrace): string => (famille === 'cheque'
  ? 'Renseignez la banque et le numéro du chèque, ou prenez-le en photo.'
  : famille === 'kkiapay'
    ? 'Choisissez son paiement reçu de KkiaPay, ou vérifiez la référence KkiaPay du reçu, ou prenez l’écran du TPE en photo.'
    : 'Notez le n° d’autorisation du ticket du terminal, ou prenez le ticket en photo.');

/** La trace nettoyée, prête à s'écrire sur le versement (rien de vide). */
export function traceAEcrire(famille: FamilleDeTrace, t: TraceDuMoyen | undefined): TraceDuMoyen | undefined {
  if (!t) return undefined;
  const o: TraceDuMoyen = {};
  if (famille === 'cheque') {
    if (propre(t.banque)) o.banque = propre(t.banque);
    if ((t.numero ?? '').replace(/\s/g, '')) o.numero = (t.numero ?? '').replace(/\s/g, '');
    if (propre(t.auNomDe)) o.auNomDe = propre(t.auNomDe);
  } else if (famille === 'kkiapay') {
    const k = t.kkiapay;
    if (k && refKkiapayPlausible(k.ref)) {
      const n = (x: unknown): number | undefined => (Number(x) > 0 ? Math.round(Number(x)) : undefined);
      o.kkiapay = {
        ref: refKkiapayPropre(k.ref),
        ...(n(k.montantXof) ? { montantXof: n(k.montantXof) } : {}),
        ...(n(k.fraisXof) ? { fraisXof: n(k.fraisXof) } : {}),
        ...(k.source ? { source: String(k.source) } : {}),
        ...(k.verifieeLe ? { verifieeLe: k.verifieeLe } : {}),
        ...(k.injoignable && !k.verifieeLe ? { injoignable: true } : {}),
        ...(k.choisi ? { choisi: true } : {}),
      };
    }
  } else {
    if (propre(t.autorisation)) o.autorisation = propre(t.autorisation).toUpperCase();
    if ((t.quatre ?? '').replace(/\D/g, '').length === 4) o.quatre = (t.quatre ?? '').replace(/\D/g, '');
  }
  if (t.photo?.chemin) o.photo = t.photo;
  return Object.keys(o).length ? o : undefined;
}

/** « BOA Bénin · n° 1234567 · au nom de K. Agossou » / « autorisation 4F7A21 · •••• 1234 ». Au Trône seulement. */
export function traceDite(t: TraceDuMoyen | undefined): string {
  if (!t) return '';
  const morceaux: string[] = [];
  if (t.banque) morceaux.push(t.banque);
  if (t.numero) morceaux.push(`n° ${t.numero}`);
  if (t.auNomDe) morceaux.push(`au nom de ${t.auNomDe}`);
  if (t.autorisation) morceaux.push(`autorisation ${t.autorisation}`);
  if (t.quatre) morceaux.push(`•••• ${t.quatre}`);
  if (t.kkiapay?.ref) morceaux.push(`KkiaPay ${t.kkiapay.ref}${t.kkiapay.verifieeLe ? ' · vérifiée' : t.kkiapay.injoignable ? ' · à pointer' : ''}`);
  if (t.photo?.chemin) morceaux.push('photo jointe');
  return morceaux.join(' · ');
}

/** Le dossier d'une photo : `<branche>/<compte>/…`. Le second segment porte la règle de lecture. */
export const cheminDeLaPhoto = (branchId: string, compte: string, jeton: string): string =>
  `${(branchId || 'maison').replace(/[^A-Za-z0-9_-]/g, '-')}/${compte}/${jeton}.jpg`;

/** La photo se montre à la direction, et à qui l'a prise (le compte au second segment). */
export const peutVoirLaPhoto = (chemin: string, o: { estDirection: boolean; compte?: string }): boolean =>
  o.estDirection || (!!o.compte && chemin.split('/')[1] === o.compte);

export type ChequeADeposer = { invoiceId: string; paymentId: string; date: string; montantXof: number; client: string; trace: TraceDuMoyen; cashbox?: string };

/** LES CHÈQUES À DÉPOSER : ceux qui portent leur trace et ne sont pas encore portés à la banque. */
export function chequesADeposer(
  pieces: readonly { id: string; branchId?: string; clientName?: string; clientId?: string; payments?: readonly { id: string; date: string; amountXof: number; method: string; cashbox?: string; trace?: TraceDuMoyen }[] }[],
  branchId: string, nomDe: (clientId?: string, repli?: string) => string,
): ChequeADeposer[] {
  const out: ChequeADeposer[] = [];
  for (const p of pieces) {
    if (p.branchId && p.branchId !== branchId) continue;
    for (const v of p.payments ?? []) {
      if (familleDeTrace(v.method) !== 'cheque' || !v.trace || v.trace.deposeLe || !(v.amountXof > 0)) continue;
      out.push({ invoiceId: p.id, paymentId: v.id, date: v.date, montantXof: v.amountXof, client: nomDe(p.clientId, p.clientName), trace: v.trace, ...(v.cashbox ? { cashbox: v.cashbox } : {}) });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** LE VIREMENT DU DÉPÔT (18 octobre 2026, sa décision) : les chèques entrés
    dans la caisse « Chèques à déposer » en sortent vers le compte choisi,
    leur total en une ligne. Un chèque encaissé ailleurs (avant cette caisse)
    se marque déposé sans rien virer. Rend null quand il n'y a rien à virer. */
export function virementDuDepot(o: {
  cheques: readonly ChequeADeposer[]; caisseDesCheques: string; vers: string; jour: string; branchId: string; id: string;
}): { id: string; branchId: string; date: string; de: string; vers: string; amountXof: number; note: string } | null {
  const viennent = o.cheques.filter((c) => c.cashbox === o.caisseDesCheques);
  const total = viennent.reduce((n, c) => n + c.montantXof, 0);
  if (!o.vers || o.vers === o.caisseDesCheques || !(total > 0)) return null;
  return {
    id: o.id, branchId: o.branchId, date: o.jour, de: o.caisseDesCheques, vers: o.vers, amountXof: total,
    note: `Dépôt de ${viennent.length} chèque${viennent.length > 1 ? 's' : ''} à la banque`,
  };
}
