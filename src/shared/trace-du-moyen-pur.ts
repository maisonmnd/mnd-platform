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
  /** La photo, dans le compartiment privé `traces-privees`. */
  photo?: { chemin: string; le: string; par?: string };
  /** Un chèque porté à la banque. */
  deposeLe?: string;
  deposePar?: string;
};

export type FamilleDeTrace = 'cheque' | 'carte';

/** Le moyen qui demande une trace, ou null. */
export function familleDeTrace(methode: string | undefined): FamilleDeTrace | null {
  const m = (methode ?? '').trim().toLowerCase();
  if (/^ch[eè]que/.test(m)) return 'cheque';
  if (/^carte/.test(m)) return 'carte';
  return null;
}

/** Les banques du Bénin proposées (liste à vérifier par la Maison) ; « Autre banque » en dernier. */
export const BANQUES_DU_BENIN: readonly string[] = [
  'BOA Bénin', 'Ecobank Bénin', 'Orabank Bénin', 'BIIC', 'UBA Bénin', 'NSIA Banque Bénin', 'Coris Bank Bénin',
  'BGFIBank Bénin', 'Banque Atlantique Bénin', 'CCEI Bank Bénin', 'BSIC Bénin',
];
export const AUTRE_BANQUE = 'Autre banque';

const propre = (s: string | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();

/** LA RÈGLE : ce qu'il faut avant d'encaisser. Une photo suffit toujours. */
export function traceSuffit(famille: FamilleDeTrace | null, t: TraceDuMoyen | undefined): boolean {
  if (!famille) return true;
  if (t?.photo?.chemin) return true;
  if (famille === 'cheque') {
    const banque = propre(t?.banque);
    return !!banque && banque !== AUTRE_BANQUE && /^\d{5,}$/.test((t?.numero ?? '').replace(/\s/g, ''));
  }
  return /^[A-Za-z0-9]{4,}$/.test(propre(t?.autorisation));
}

/** Ce que l'écran dit quand la trace manque. */
export const ditCeQuiManque = (famille: FamilleDeTrace): string => (famille === 'cheque'
  ? 'Renseignez la banque et le numéro du chèque, ou prenez-le en photo.'
  : 'Notez le n° d’autorisation du ticket du terminal, ou prenez le ticket en photo.');

/** La trace nettoyée, prête à s'écrire sur le versement (rien de vide). */
export function traceAEcrire(famille: FamilleDeTrace, t: TraceDuMoyen | undefined): TraceDuMoyen | undefined {
  if (!t) return undefined;
  const o: TraceDuMoyen = {};
  if (famille === 'cheque') {
    if (propre(t.banque)) o.banque = propre(t.banque);
    if ((t.numero ?? '').replace(/\s/g, '')) o.numero = (t.numero ?? '').replace(/\s/g, '');
    if (propre(t.auNomDe)) o.auNomDe = propre(t.auNomDe);
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
  if (t.photo?.chemin) morceaux.push('photo jointe');
  return morceaux.join(' · ');
}

/** Le dossier d'une photo : `<branche>/<compte>/…`. Le second segment porte la règle de lecture. */
export const cheminDeLaPhoto = (branchId: string, compte: string, jeton: string): string =>
  `${(branchId || 'maison').replace(/[^A-Za-z0-9_-]/g, '-')}/${compte}/${jeton}.jpg`;

/** La photo se montre à la direction, et à qui l'a prise (le compte au second segment). */
export const peutVoirLaPhoto = (chemin: string, o: { estDirection: boolean; compte?: string }): boolean =>
  o.estDirection || (!!o.compte && chemin.split('/')[1] === o.compte);

export type ChequeADeposer = { invoiceId: string; paymentId: string; date: string; montantXof: number; client: string; trace: TraceDuMoyen };

/** LES CHÈQUES À DÉPOSER : ceux qui portent leur trace et ne sont pas encore portés à la banque. */
export function chequesADeposer(
  pieces: readonly { id: string; branchId?: string; clientName?: string; clientId?: string; payments?: readonly { id: string; date: string; amountXof: number; method: string; trace?: TraceDuMoyen }[] }[],
  branchId: string, nomDe: (clientId?: string, repli?: string) => string,
): ChequeADeposer[] {
  const out: ChequeADeposer[] = [];
  for (const p of pieces) {
    if (p.branchId && p.branchId !== branchId) continue;
    for (const v of p.payments ?? []) {
      if (familleDeTrace(v.method) !== 'cheque' || !v.trace || v.trace.deposeLe || !(v.amountXof > 0)) continue;
      out.push({ invoiceId: p.id, paymentId: v.id, date: v.date, montantXof: v.amountXof, client: nomDe(p.clientId, p.clientName), trace: v.trace });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
