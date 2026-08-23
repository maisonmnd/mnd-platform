/* LES TIROIRS DE LA MAISON — les calculs d'une caisse, à UNE seule source.

   Extraits de Depenses.tsx le 22 août 2026. Ils y sont nés, mais une caisse
   n'appartient pas aux dépenses : c'est le tiroir par lequel TOUT passe. Le
   jour où les caisses ont mérité leur propre écran, recopier ces deux cents
   lignes aurait fabriqué deux soldes pour un seul tiroir — et l'un des deux
   aurait fini par mentir. C'est exactement ce qui était arrivé au registre des
   encaissements.

   LE FICHIER NE S'APPELLE PAS « caisses » : sur Windows,  et
    sont le MÊME fichier, et l'écran écraserait le module sans un
   mot. Un nom distinct vaut mieux qu'une casse à laquelle on se fie. */

import { useMemo, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '../../../../ds/components';
import { createStore, useStore } from '../../../../shared/store';
import { useBranch } from '../../../../shared/branches';
import { fmtIn, rateToXof } from '../../../../shared/currency';
import {
  useCashboxes, useExpenses, useInvoices, useCoffre, useCredits, useTransferts,
  cashboxCurrency, expenseTotal, invoiceReglements, transfertSurCaisse,
  caisseDiscrete, empreinteDuCode, caissesHorsBilan, surLeTiroir, montantMuet,
  type Cashbox,
  type Invoice, type Expense, type CoffreMovement, type CreditMovement,
} from '../../../../shared/finance';
import { usePrets } from '../../../../shared/foyer';
import { useClients, useFamilies } from '../../../../shared/clients';
import { fmtDay, monthKey, monthLabel, monthShort, shiftMonth, todayISO } from './_shared';

/* ── LES CAISSES OUVERTES DE LA SÉANCE — 22 août 2026 ──────────────
   Une caisse discrète se déverrouille pour la SÉANCE, jamais au-delà : ce
   registre vit en mémoire et rien ne l'écrit. Fermer l'onglet, recharger la
   page, revenir demain — elle est refermée. Le retenir sur le disque
   reviendrait à laisser la clé sur la porte. */
/* LE REGISTRE SE REMPLACE, IL NE SE MODIFIE PAS — 22 août 2026. « Le bouton
   refermer marche une fois sur deux. » C'était un Set modifié SUR PLACE : sa
   référence ne changeait jamais, et `useSyncExternalStore` compare justement
   les références. React ne redessinait donc que lorsqu'un autre état l'y
   forçait — une fois sur deux, au hasard. Chaque geste produit désormais un
   ensemble NEUF, et l'écran suit à tous les coups. */
let ouvertes: ReadonlySet<string> = new Set<string>();
const veilleurs = new Set<() => void>();
const prevenir = () => veilleurs.forEach((f) => f());

/* Le verrou de l'ÉCRAN — même registre, une clé réservée : il se lève et
   retombe comme une caisse, et le rechargement le repose. */
/* ── L’ORDRE DES CAISSES, CHOISI À LA MAIN — 23 août 2026 ──────────
   « Déplacez l’ordre des caisses. » Elles sortaient dans leur ordre de
   création : la caisse posée le premier jour restait en tête pour toujours,
   et celle du comptoir — la plus servie — finissait au bas des listes.

   MÊME MÉCANIQUE QUE LE MENU (Shell.tsx, 22 août) : un ordre voulu par
   branche, gardé à part de la caisse elle-même. Rien à changer au modèle,
   rien à synchroniser de plus — et ce qui n’a pas été rangé suit à la fin,
   à sa place d’origine. Une caisse créée demain ne DISPARAÎT donc jamais
   parce qu’un rangement d’hier ne la connaissait pas.

   L’ORDRE VAUT PARTOUT : il est appliqué dans `useCaisses`, la seule porte
   par laquelle les deux écrans lisent leurs tiroirs. */
export const ordreCaissesStore = createStore<Record<string, string[]>>('mnd_caisses_ordre', {});
export const useOrdreCaisses = () => useStore(ordreCaissesStore);

/** L’ordre de la main, puis celui du code. */
export const selonLOrdre = <T extends { id: string }>(voulu: string[] | undefined, items: T[]): T[] => {
  if (!voulu || voulu.length === 0) return items;
  const rang = new Map(voulu.map((id, i) => [id, i]));
  const connus = items.filter((it) => rang.has(it.id)).sort((a, b) => rang.get(a.id)! - rang.get(b.id)!);
  return [...connus, ...items.filter((it) => !rang.has(it.id))];
};

export const CLE_ECRAN = '@ecran-caisses';
export const CLE_COFFRE = '@ecran-coffre';
export const CLE_PRETS = '@ecran-prets';

export const ouvreLaCaisse = (id: string): void => {
  ouvertes = new Set([...ouvertes, id]);
  prevenir();
};
export const refermeLaCaisse = (id: string): void => {
  const n = new Set(ouvertes);
  n.delete(id);
  ouvertes = n;
  prevenir();
};

/* TOUTES D'UN GESTE — 22 août 2026, demande de Yéman. Deux listes EXPLICITES,
   jamais un vidage : le registre porte aussi les clés des écrans (CLE_ECRAN,
   CLE_COFFRE). Tout effacer refermerait la porte sur la Souveraine au moment
   même où elle range ses tiroirs. */
export const ouvreLesCaisses = (ids: readonly string[]): void => {
  if (ids.length === 0) return;
  ouvertes = new Set([...ouvertes, ...ids]);
  prevenir();
};
export const refermeLesCaisses = (ids: readonly string[]): void => {
  if (ids.length === 0) return;
  const n = new Set(ouvertes);
  for (const id of ids) n.delete(id);
  ouvertes = n;
  prevenir();
};

/** Le code donné ouvre-t-il cette caisse ? La comparaison porte sur les
    empreintes : le code enregistré n'existe nulle part pour être comparé. */
export async function leCodeOuvre(c: { id: string; codeHash?: string }, code: string): Promise<boolean> {
  if (!c.codeHash) return true;
  return (await empreinteDuCode(c.id, code)) === c.codeHash;
}

/** S'abonne au registre : l'écran se redessine quand une caisse s'ouvre. */
export function useCaissesOuvertes(): ReadonlySet<string> {
  return useSyncExternalStore(
    (cb) => { veilleurs.add(cb); return () => { veilleurs.delete(cb); }; },
    () => ouvertes,
    () => ouvertes,
  );
}

/** Le solde de cette caisse se montre-t-il ? */
export const soldeVisible = (c: { id: string; codeHash?: string }, ouvertes: ReadonlySet<string>): boolean =>
  !c.codeHash || ouvertes.has(c.id);


/** TOUT CE QU'UNE CAISSE SAIT D'ELLE-MÊME. Une seule porte, deux écrans. */
export function useCaisses(month: string) {
  const { branch, currency } = useBranch();
  const [cashboxes] = useCashboxes();
  const [expenses] = useExpenses();
  const [invoices] = useInvoices();
  const [coffre] = useCoffre();
  const [creditMvts] = useCredits();
  const [prets] = usePrets();
  const [transferts] = useTransferts();
  const [clientes] = useClients();
  const [familles] = useFamilies();

  /* L’ORDRE VOULU S’APPLIQUE ICI, une seule fois : cartes, pastilles des
     dépenses, listes déroulantes des transferts et rapport PDF lisent tous
     `branchBoxes`. Ranger une fois range partout. */
  const [ordreVoulu] = useOrdreCaisses();
  const branchBoxes = useMemo(
    () => selonLOrdre(ordreVoulu[branch.id], cashboxes.filter((c) => c.branchId === branch.id)),
    [cashboxes, branch.id, ordreVoulu],
  );

  /* Ce qu'un transfert fait à une caisse — négatif au départ, positif à
     l'arrivée. Il appartient à la caisse, donc il vit ici. */
  const transfertsDeCaisse = (name: string, keep: (mk: string) => boolean): number =>
    transferts
      .filter((t) => t.branchId === branch.id && keep(monthKey(t.date)))
      .reduce((s, t) => s + transfertSurCaisse(t, name), 0);

  /* LA DEVISE SE LIT AU VERSEMENT — les 100 € de Stevie A., 18 août. Le
     tiroir lisait `i.fx`, posé sur la pièce à sa création seulement : un
     second versement en euros sur une pièce existante n'y entrait JAMAIS.
     Chaque versement porte désormais sa devise (`p.fx`), et le repli de
     `invoiceReglements` descend le `fx` des pièces d'avant sur leur versement
     unique — une seule forme à lire. */
  const boxCredit = (i: Invoice, name: string, boxCur: string, foreign: boolean, keep: (mk: string) => boolean): number =>
    foreign
      ? invoiceReglements(i)
          .filter((p) => p.fx && p.fx.code === boxCur
            /* La caisse du versement fait foi ; les versements d'avant le champ
               `cashbox` suivent la pièce, qui nommait le tiroir. */
            && (p.cashbox ?? i.cashbox) === name
            && keep(monthKey(p.date ?? i.date)))
          .reduce((n, p) => n + p.fx!.amount, 0)
      : invoiceReglements(i)
          .filter((p) => p.cashbox === name && p.method !== 'Avoir' && p.method !== 'Acompte' && keep(monthKey(p.date ?? '')))
          .reduce((n, p) => n + p.amountXof, 0);

  /* LA DEVISE DU TIROIR — 22 août 2026. Chaque somme ci-dessous doit se dire
     dans la monnaie de SA caisse : un tiroir en dollars ne connaît que des
     dollars, et y verser des francs fausserait son solde. `surLeTiroir` porte
     la règle une seule fois. */
  const deviseDuTiroir = (name: string): string => {
    const b = branchBoxes.find((x) => x.name === name);
    return b ? cashboxCurrency(b) : currency;
  };

  /* CE QUE CETTE CAISSE A VERSÉ AU COFFRE — 17 août 2026, « le coffre comme
     caisse ». Un dépôt qui nomme sa caisse en SORT : sans cette soustraction,
     les mêmes francs vivraient dans le tiroir et dans le coffre, et la
     trésorerie les compterait deux fois.

     Seuls les mouvements qui NOMMENT une caisse comptent. Ceux d'avant n'en
     portent pas : ils ont été saisis comme une mise de côté symbolique, et les
     rendre débiteurs après coup ferait bouger des soldes déjà arrêtés. */
  const verseAuCoffre = (name: string, keep: (mk: string) => boolean): number =>
    coffre
      .filter((m: CoffreMovement) => m.branchId === branch.id && m.kind === 'depot' && m.cashbox === name && keep(monthKey(m.date)))
      .reduce((s: number, m: CoffreMovement) => s + surLeTiroir(m, deviseDuTiroir(name), currency), 0);

  /* LES AVOIRS DE LA CAISSE — 19 août 2026, « verser un avoir doit aller dans
     une caisse et être retracé ». Un dépôt d'avoir qui nomme sa caisse y
     ENTRE (les billets sont dans le tiroir, même si le service n'a pas encore
     eu lieu) ; un remboursement en SORT. L'USAGE ne bouge rien — c'est le
     crédit qui se consomme, pas des billets qui passent. Les mouvements
     d'avant, sans caisse, ne comptent pas : leurs soldes sont arrêtés. */
  const avoirsDeCaisse = (name: string, keep: (mk: string) => boolean): number =>
    creditMvts
      .filter((m) => m.branchId === branch.id && m.cashbox === name
        && (m.kind === 'depot' || m.kind === 'remboursement') && keep(monthKey(m.date)))
      .reduce((s, m) => {
        const v = surLeTiroir(m, deviseDuTiroir(name), currency);
        return s + (m.kind === 'depot' ? v : -v);
      }, 0);
  /* LES PRÊTS DE LA CAISSE — 22 août 2026. Un prêt qui NOMME sa caisse en
     SORT ; un remboursement y RENTRE. Sans cela, prêter 200 000 F ne les
     retirait d'aucun tiroir : les mêmes francs vivaient dans la caisse et chez
     l'emprunteur, et la trésorerie les comptait deux fois — exactement le mal
     réparé pour le coffre le 17 août et pour les avoirs le 19.
     Les prêts d'avant ne nomment aucune caisse : ils ne bougent rien, leurs
     soldes sont arrêtés, et les rendre débiteurs après coup ferait bouger des
     trésoreries déjà closes. */
  const pretsDeCaisse = (name: string, keep: (mk: string) => boolean): number =>
    prets
      .filter((p) => p.branchId === branch.id && p.cashbox === name && keep(monthKey(p.date)))
      .reduce((s, p) => {
        const v = surLeTiroir(p, deviseDuTiroir(name), currency);
        return s + (p.type === 'pret' ? -v : v);
      }, 0);
  const pretsMouvements = (name: string, keep: (mk: string) => boolean) =>
    prets.filter((p) => p.branchId === branch.id && p.cashbox === name && keep(monthKey(p.date)));

  const avoirsMouvements = (name: string, keep: (mk: string) => boolean) =>
    creditMvts.filter((m) => m.branchId === branch.id && m.cashbox === name
      && (m.kind === 'depot' || m.kind === 'remboursement') && keep(monthKey(m.date)));
  const porteurDe = (m: CreditMovement): string =>
    m.holderType === 'family'
      ? familles.find((f) => f.id === m.holderId)?.name ?? 'Compte famille'
      : clientes.find((c) => c.id === m.holderId)?.name ?? 'Cliente';

  const boxOf = (name: string) => branchBoxes.find((b) => b.name === name);
  const boxInvoices = (name: string) =>
    invoices.filter((i) => i.branchId === branch.id && i.kind === 'facture'
      && invoiceReglements(i).some((p) => p.cashbox === name && p.method !== 'Avoir' && p.method !== 'Acompte'));
  const boxExpenses = (name: string) =>
    expenses.filter((e) => e.branchId === branch.id && !e.stopped && e.cashbox === name);

  /** Solde cumulé d'une caisse — ouverture + tous les flux dont le mois passe `keep`. */
  const boxBalanceWhere = (name: string, keep: (mk: string) => boolean) => {
    const box = boxOf(name);
    const boxCur = box ? cashboxCurrency(box) : currency;
    const foreign = boxCur !== currency;
    const inn = boxInvoices(name).reduce((s, i) => s + boxCredit(i, name, boxCur, foreign, keep), 0);
    /* LA DÉPENSE AUSSI COMPTE DANS LA MONNAIE DU TIROIR — 22 août 2026. Cet
       écran ne filtrait PAS les caisses en devise : une dépense en francs
       imputée à un tiroir en dollars lui retirait des francs, et son solde
       s’en trouvait faux. */
    const out = boxExpenses(name).filter((e) => keep(monthKey(e.date)))
      .reduce((s, e) => s + surLeTiroir({ amountXof: expenseTotal(e), fx: e.fx }, boxCur, currency), 0);
    return (box?.openingXof ?? 0) + inn - out - verseAuCoffre(name, keep) + avoirsDeCaisse(name, keep) + pretsDeCaisse(name, keep) + transfertsDeCaisse(name, keep);
  };
  /** Solde à la FIN du mois affiché (c'est « à ce jour » quand on est sur le mois courant). */
  const boxBalance = (name: string) => boxBalanceWhere(name, (mk) => mk <= month);
  /** Solde au DÉBUT du mois affiché — le point de départ du relevé. */
  const boxBalanceStart = (name: string) => boxBalanceWhere(name, (mk) => mk < month);
  /** Entrées / sorties du SEUL mois affiché — le flux du mois, par caisse. */
  const boxMonthFlux = (name: string) => {
    const box = boxOf(name);
    const boxCur = box ? cashboxCurrency(box) : currency;
    const foreign = boxCur !== currency;
    const avoirs = avoirsMouvements(name, (mk) => mk === month);
    const p = pretsMouvements(name, (mk) => mk === month);
    /* Le flux se dit dans la monnaie du tiroir, comme le solde : la carte
       affiche « + X · − Y en août » juste sous un solde en dollars. */
    const dans = (e: { amountXof: number; fx?: { code: string; rate: number; amount: number } }) =>
      surLeTiroir(e, boxCur, currency);
    const inn = boxInvoices(name).reduce((s, i) => s + boxCredit(i, name, boxCur, foreign, (mk) => mk === month), 0)
      + avoirs.filter((m) => m.kind === 'depot').reduce((s, m) => s + dans(m), 0)
      + p.filter((x) => x.type === 'remboursement').reduce((s, x) => s + dans(x), 0);
    const out = boxExpenses(name).filter((e) => monthKey(e.date) === month)
      .reduce((s, e) => s + dans({ amountXof: expenseTotal(e), fx: e.fx }), 0)
      + verseAuCoffre(name, (mk) => mk === month)
      + avoirs.filter((m) => m.kind === 'remboursement').reduce((s, m) => s + dans(m), 0)
      + p.filter((x) => x.type === 'pret').reduce((s, x) => s + dans(x), 0);
    return { inn, out };
  };
  /* La trésorerie ne somme QUE les caisses de la maison : additionner des euros
     à des francs donnerait un nombre qui ne veut rien dire. Les caisses en
     devise se lisent séparément, chacune dans son unité. */
  const treasury = branchBoxes
    .filter((b) => cashboxCurrency(b) === currency)
    .reduce((s, b) => s + boxBalance(b.name), 0);

  /* Ce qu'il y a DERRIÈRE le solde d'une caisse. Mêmes règles que `boxBalance`,
     au mot près : solde au début du mois + mouvements du mois = solde affiché.
     Si la liste ne tombe pas sur le chiffre, c'est l'un des deux qui ment. */
  const boxMoves = (name: string, periode?: { de: string; a: string }) => {
    /* UNE PÉRIODE LIBRE, POUR LE RAPPORT — 22 août 2026. Tout ici filtre par
       CLÉ DE MOIS : on prend donc les mois entiers que la période touche, puis
       on coupe aux deux dates. Le solde de départ, lui, se reprend au début du
       premier mois et se laisse pousser par ce qui précède la date de début —
       sinon un rapport du 15 partirait du solde du 1er. */
    const mDe = periode ? monthKey(periode.de) : month;
    const mA = periode ? monthKey(periode.a) : month;
    const dansLaPeriode = (mk: string) => (periode ? mk >= mDe && mk <= mA : mk === month);
    const box = boxOf(name);
    const boxCur = box ? cashboxCurrency(box) : currency;
    const foreign = boxCur !== currency;

    /* LA LIGNE SE DATE DU JOUR OÙ L’ARGENT BOUGE — 22 août 2026. Elle portait
       la date de la FACTURE : une pièce du 20 juin réglée en août s’inscrivait
       « 20 juin » au milieu du livre d’août, et le solde courant remontait le
       temps sous les yeux. Le compte était juste, la lecture mentait. On prend
       le dernier versement retenu — celui qui a fini de remplir le tiroir. */
    const jourDuCredit = (i: Invoice): string => {
      const jours = (foreign
        ? invoiceReglements(i).filter((p) => p.fx && p.fx.code === boxCur
          && (p.cashbox ?? i.cashbox) === name && dansLaPeriode(monthKey(p.date ?? i.date)))
        : invoiceReglements(i).filter((p) => p.cashbox === name
          && p.method !== 'Avoir' && p.method !== 'Acompte' && dansLaPeriode(monthKey(p.date ?? ''))))
        .map((p) => p.date ?? i.date)
        .sort();
      return jours.at(-1) ?? i.date;
    };

    const inn = boxInvoices(name)
      .filter((i) => boxCredit(i, name, boxCur, foreign, dansLaPeriode) > 0)
      .map((i) => ({
        date: jourDuCredit(i),
        label: i.clientName?.trim() || 'Cliente de passage',
        sub: [
          i.number,
          (() => {
            /* Les billets étrangers se lisent au versement — même source que le solde. */
            const dev = invoiceReglements(i).filter((p) => p.fx && p.fx.code === boxCur);
            const total = dev.reduce((n, p) => n + p.fx!.amount, 0);
            return total > 0 ? `${total.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${boxCur}` : null;
          })(),
          !foreign && (i.avoirXof ?? 0) > 0 ? `avoir −${fmtIn(i.avoirXof!, boxCur)}` : null,
          /* Le pourboire se DIT sans se compter : il explique pourquoi la
             cliente a remis plus que ce que la caisse inscrit. */
          !foreign && (i.tipXof ?? 0) > 0 ? `pourboire ${fmtIn(i.tipXof!, boxCur)} → Pourboires` : null,
        ].filter(Boolean).join(' · '),
        delta: boxCredit(i, name, boxCur, foreign, dansLaPeriode),
        invoiceId: i.id, // la ligne s'ouvre sur la facture
        transfertId: undefined as string | undefined,
        expense: undefined as Expense | undefined,
      }));

    const out = boxExpenses(name)
      .filter((e) => dansLaPeriode(monthKey(e.date)))
      .map((e) => ({
        date: e.date,
        label: e.label,
        sub: [
          e.subcategory ? `${e.category} · ${e.subcategory}` : e.category,
          /* CE QUI NE PEUT PAS ÊTRE COMPTÉ SE DIT — une dépense imputée à un
             tiroir en devise sans montant dans cette devise ne pèse rien sur
             lui. La taire ferait chercher un écart introuvable. */
          montantMuet({ amountXof: expenseTotal(e), fx: e.fx }, boxCur, currency)
            ? `montant en ${boxCur} non renseigné` : null,
          /* UNE LIGNE QUI A SA PREUVE LE DIT — 23 août 2026 : sinon il faut
             ouvrir chaque fiche pour savoir laquelle porte le reçu. */
          e.fichier ? 'pièce jointe' : null,
        ].filter(Boolean).join(' · '),
        delta: -surLeTiroir({ amountXof: expenseTotal(e), fx: e.fx }, boxCur, currency),
        invoiceId: undefined as string | undefined, // une dépense n'a pas de facture
        /* …mais elle a sa fiche : le relevé d'une caisse est l'endroit où l'on
           repère une ligne fausse, il doit donc y mener. */
        expense: e as Expense | undefined,
        transfertId: undefined as string | undefined,
      }));

    /* Les avoirs du mois — l'entrée dit son porteur, la sortie aussi : « être
       retracé », c'est pouvoir répondre « c'est l'avoir de qui ? » en lisant. */
    const avoirs = avoirsMouvements(name, dansLaPeriode).map((m) => ({
      date: m.date,
      label: m.kind === 'depot' ? `Avoir versé · ${porteurDe(m)}` : `Avoir remboursé · ${porteurDe(m)}`,
      sub: [m.method, m.note, montantMuet(m, boxCur, currency) ? `montant en ${boxCur} non renseigné` : null]
        .filter(Boolean).join(' · ') || 'Comptes & Avoirs',
      delta: m.kind === 'depot' ? surLeTiroir(m, boxCur, currency) : -surLeTiroir(m, boxCur, currency),
      invoiceId: undefined as string | undefined,
      expense: undefined as Expense | undefined,
      transfertId: undefined as string | undefined,
    }));

    /* LE COFFRE MANQUAIT À L'APPEL — 21 août 2026. `boxBalanceWhere` retranche
       les versements au coffre depuis le 17 août, mais aucune ligne ne les
       disait : dès qu'un dépôt nommait la caisse dans le mois affiché,
       « solde au début + mouvements » ne tombait plus sur le solde affiché —
       exactement ce que le commentaire d'en-tête annonce comme impossible.
       Le relevé et le solde lisent désormais la même chose. */
    const versements = coffre
      .filter((m: CoffreMovement) => m.branchId === branch.id && m.kind === 'depot'
        && m.cashbox === name && dansLaPeriode(monthKey(m.date)))
      .map((m: CoffreMovement) => ({
        date: m.date,
        label: 'Versé au coffre',
        sub: [m.note, 'Le Coffre', montantMuet(m, boxCur, currency) ? `montant en ${boxCur} non renseigné` : null]
          .filter(Boolean).join(' · '),
        delta: -surLeTiroir(m, boxCur, currency),
        invoiceId: undefined as string | undefined,
        expense: undefined as Expense | undefined,
        transfertId: undefined as string | undefined,
      }));

    /* Le relevé DIT ce que le solde compte — sinon « solde au début +
       mouvements » ne tomberait plus sur le solde affiché, la faute même
       corrigée le 21 août pour les versements au coffre. */
    const lesPrets = pretsMouvements(name, dansLaPeriode).map((p) => ({
      date: p.date,
      label: p.type === 'pret' ? `Prêté à ${p.associe}` : `Remboursé par ${p.associe}`,
      sub: [p.method, p.motif, montantMuet(p, boxCur, currency) ? `montant en ${boxCur} non renseigné` : null]
        .filter(Boolean).join(' · ') || 'Comptes & Avoirs · prêts',
      delta: p.type === 'pret' ? -surLeTiroir(p, boxCur, currency) : surLeTiroir(p, boxCur, currency),
      invoiceId: undefined as string | undefined,
      expense: undefined as Expense | undefined,
      transfertId: undefined as string | undefined,
    }));

    const lesTransferts = transferts
      .filter((t) => t.branchId === branch.id && dansLaPeriode(monthKey(t.date)) && (t.de === name || t.vers === name))
      .map((t) => ({
        date: t.date,
        label: t.de === name
          ? (t.vers ? `Transféré vers ${t.vers}` : 'Sortie hors Maison')
          : (t.de ? `Reçu de ${t.de}` : 'Apport — hors revenu'),
        sub: [t.note || 'Transfert entre caisses', t.fichier ? 'pièce jointe' : null].filter(Boolean).join(' · '),
        delta: transfertSurCaisse(t, name),
        invoiceId: undefined as string | undefined,
        expense: undefined as Expense | undefined,
        /* UN APPORT AUSSI SE CORRIGE — 23 août 2026. « Il faut mettre les dates
           d’origine pour ces transactions. » Les dates SONT enregistrées telles
           que saisies ; ce qui manquait, c’est le chemin pour les reprendre :
           facture, dépense, avoir et prêt menaient à leur fiche, un transfert
           ne menait nulle part. Une ligne qu’on ne peut pas rouvrir est une
           faute qu’on ne peut pas réparer. */
        transfertId: t.id as string | undefined,
      }));

    const bruts = [...inn, ...out, ...avoirs, ...versements, ...lesPrets, ...lesTransferts]
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    if (periode) {
      const dedans = bruts.filter((m) => m.date >= periode.de && m.date <= periode.a);
      const debutDeLaPeriode = boxBalanceWhere(name, (mk) => mk < mDe)
        + bruts.filter((m) => m.date < periode.de).reduce((s, m) => s + m.delta, 0);
      return {
        boxCur,
        startBalance: debutDeLaPeriode,
        moves: dedans,
        balance: debutDeLaPeriode + dedans.reduce((s, m) => s + m.delta, 0),
      };
    }
    const moves = bruts;
    return { boxCur, startBalance: boxBalanceStart(name), moves, balance: boxBalance(name) };
  };
  /* LA TRÉSORERIE TRAHIRAIT LE SECRET. Si elle sommait tout, il suffirait de
     retrancher les caisses visibles pour lire celle qu'on masque. Les caisses
     discrètes encore fermées en sortent donc, et l'écran le DIT — un total
     amputé sans explication vaudrait pire qu'un total complet. */
  const ouvertesMaintenant = useCaissesOuvertes();
  const tresorerieVisible = branchBoxes
    .filter((b) => cashboxCurrency(b) === currency && !b.horsBilan && soldeVisible(b, ouvertesMaintenant))
    .reduce((s, b) => s + boxBalance(b.name), 0);
  const horsBilan = branchBoxes.filter((b) => b.horsBilan).length;
  const discretesFermees = branchBoxes.filter((b) => caisseDiscrete(b) && !ouvertesMaintenant.has(b.id)).length;

  return {
    branch, currency, branchBoxes,
    boxOf, boxBalance, boxBalanceStart, boxMonthFlux, boxMoves, treasury,
    tresorerieVisible, discretesFermees, horsBilan, ouvertes: ouvertesMaintenant,
    exclues: caissesHorsBilan(branchBoxes, branch.id),
  };
}

/* ── LE NOM ET LE SOLDE D’UNE CAISSE, EN LISTE — 23 août 2026 ──────
   « Ne pas afficher le solde des caisses masquées par un code, depuis leur
   source à la caisse. » Le verrou d’une caisse discrète ne tient que si elle
   se tait PARTOUT : il était posé sur sa carte et son relevé, mais les listes
   déroulantes des Dépenses et des transferts annonçaient tranquillement
   « Caisse Pilia · 15 000 $ » à qui ouvrait le menu. Un secret qui fuit par
   une liste n’est plus un secret. */
export const nomEtSolde = (
  c: Cashbox,
  solde: number,
  ouvertes: ReadonlySet<string>,
  /* HORS DE L’ÉCRAN DES CAISSES, UN TIROIR À CODE NE DIT JAMAIS SON SOLDE —
     23 août 2026. « Leur solde ne doit être visible nulle part où il n’y a pas
     d’autorisation. » Le code s’ouvre POUR LA SÉANCE, et cette ouverture
     suivait la Souveraine partout : la caisse déverrouillée aux Caisses
     annonçait son solde dans le menu des Dépenses, à qui passait derrière
     elle. L’autorisation vaut là où elle a été donnée, pas dans toute la
     maison. */
  horsDesCaisses = false,
): string => {
  const montre = horsDesCaisses ? !caisseDiscrete(c) : soldeVisible(c, ouvertes);
  return montre
    ? `${c.name} · ${fmtIn(solde, cashboxCurrency(c))}`
    : `${c.name} · ••• •••`;
};

/* ── LE RELEVÉ D'UNE CAISSE ─────────────────────────────────────────
   Ce qu'il y a DERRIÈRE le solde : solde de départ + mouvements = solde
   affiché, au mot près. Si la liste ne tombe pas sur le chiffre, c'est l'un
   des deux qui ment — et c'est arrivé deux fois (les versements au coffre le
   21 août, les prêts le 22).

   TOUT L'HISTORIQUE, PAR DÉFAUT — 23 août 2026. « Quand je clique une caisse,
   j'aimerais toujours voir tout son historique sans avoir à aller à une
   période précise. » Il n'ouvrait que le mois affiché : chercher un versement
   de mai depuis août demandait de deviner le mois, puis de naviguer. Un relevé
   qu'on doit chasser ne sert à rien. Le mois reste accessible d'un bouton, mais
   il n'est plus la porte.

   LE SOLDE COURT À CHAQUE LIGNE, et la liste se lit du plus récent au plus
   ancien : on cherche presque toujours quelque chose de proche. Le solde de
   départ ferme donc la marche, en bas — c'est le point d'où tout est parti.

   Il vit ici parce que DEUX écrans l'ouvrent : les Dépenses depuis la pastille
   de caisse d'une ligne, et les Caisses depuis la carte du tiroir. */
export function ReleveCaisse({
  nom, month, onClose, onExpense, onRapport, onTransfert,
}: {
  nom: string;
  month: string;
  onClose: () => void;
  onExpense?: (e: Expense) => void;
  /* LE RAPPORT NE VIT PAS ICI, ET C'EST VOLONTAIRE — 22 août 2026 : Rapport.tsx
     lit déjà ce module, l'importer en retour fabriquerait un cycle que React ne
     pardonne pas au montage. L'écran qui ouvre le relevé passe le geste. */
  onRapport?: () => void;
  /* UN APPORT SE CORRIGE DEPUIS SA LIGNE — 23 août 2026 : le relevé est
     l’endroit où l’on repère une date fausse, il doit donc y mener. */
  onTransfert?: (id: string) => void;
}) {
  const navigate = useNavigate();
  const { currency, boxMoves, branchBoxes, ouvertes } = useCaisses(month);
  const monthName = monthLabel(month);
  /* UNE CAISSE DISCRÈTE NE S'OUVRE PAS SANS SON CODE — et le relevé est
     précisément ce qu'elle cache : ses mouvements disent son solde ligne à
     ligne. On le refuse donc AVANT de le calculer. */
  const laCaisse = branchBoxes.find((b) => b.name === nom);
  const fermee = !!laCaisse && !soldeVisible(laCaisse, ouvertes);
  const openEdit = onExpense ?? (() => {});

  /* La portée : tout, ou le seul mois affiché. « Tout » est la porte. */
  const [portee, setPortee] = useState<'tout' | 'mois'>('tout');
  const [cherche, setCherche] = useState('');

  /* DEPUIS TOUJOURS : une borne assez basse pour qu'aucune écriture ne lui
     échappe. Le solde de départ devient alors l'ouverture de la caisse — le
     seul chiffre qui ne vient d'aucun mouvement. */
  const depuisToujours = { de: '1900-01-01', a: todayISO() };
  const vu = boxMoves(nom, portee === 'tout' ? depuisToujours : undefined);
  const { boxCur, startBalance, moves, balance } = vu;

  /* Le solde qui court, calculé du plus ANCIEN au plus récent — puis la liste
     se retourne pour l'affichage. L'inverse donnerait des soldes à l'envers. */
  const avecSolde = useMemo(() => {
    let courant = startBalance;
    return moves.map((m) => {
      courant += m.delta;
      return { ...m, solde: courant };
    });
  }, [moves, startBalance]);

  const q = cherche.trim().toLowerCase();
  const affichees = (q
    ? avecSolde.filter((m) => `${m.label} ${m.sub} ${m.date}`.toLowerCase().includes(q))
    : avecSolde
  ).slice().reverse();

  const entrees = moves.filter((m) => m.delta > 0).reduce((s, m) => s + m.delta, 0);
  const sorties = moves.filter((m) => m.delta < 0).reduce((s, m) => s - m.delta, 0);

  /* SIX MOIS D'UN COUP D'ŒIL. Deux barres par mois — ce qui entre, ce qui
     sort — dessinées à la main : la Maison ne charge pas de librairie de
     graphiques pour six paires de rectangles. */
  const sixMois = useMemo(() => {
    const fin = monthKey(todayISO());
    const cles: string[] = [];
    for (let i = 5; i >= 0; i--) cles.push(shiftMonth(fin, -i));
    const par = new Map(cles.map((k) => [k, { inn: 0, out: 0 }]));
    for (const m of moves) {
      const c = par.get(monthKey(m.date));
      if (!c) continue;
      if (m.delta > 0) c.inn += m.delta; else c.out -= m.delta;
    }
    const lignes = cles.map((k) => ({ k, ...par.get(k)! }));
    const haut = Math.max(1, ...lignes.map((l) => Math.max(l.inn, l.out)));
    return { lignes, haut };
  }, [moves]);

  if (fermee) {
    return (
      <Modal title={`${nom} · caisse discrète`} onClose={onClose} width={420}>
        <div className="mnd-muted" style={{ fontSize: 13, lineHeight: 1.7 }}>
          Cette caisse est fermée. Son relevé dirait son solde ligne à ligne —
          il faut donc l’ouvrir d’abord, depuis l’écran des Caisses.
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
          <button className="mnd-btn" onClick={onClose}>Fermer</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`${nom} · mouvements`} onClose={onClose} width={640}>
      {/* LES TROIS CHIFFRES DE LA PORTÉE LUE — le solde ne bouge pas avec elle
          (c’est celui d’aujourd’hui), les deux flux, si. */}
      <div className="trf-releve-stats">
        <div>
          <div className="trf-releve-stats__l">Solde · à ce jour</div>
          <div className="trf-releve-stats__v">{fmtIn(balance, boxCur)}</div>
        </div>
        <div>
          <div className="trf-releve-stats__l">Entrées {portee === 'tout' ? '· depuis toujours' : `· ${monthName}`}</div>
          <div className="trf-releve-stats__v trf-releve-stats__v--vert">+ {fmtIn(entrees, boxCur)}</div>
        </div>
        <div>
          <div className="trf-releve-stats__l">Sorties {portee === 'tout' ? '· depuis toujours' : `· ${monthName}`}</div>
          <div className="trf-releve-stats__v trf-releve-stats__v--cuivre">− {fmtIn(sorties, boxCur)}</div>
        </div>
      </div>

      <div className="trf-releve-barre">
        <div style={{ display: 'flex', gap: 7 }}>
          {([['tout', 'Tout l’historique'], ['mois', monthName]] as const).map(([k, mot]) => (
            <button
              key={k}
              type="button"
              className={`trf-pret-puce ${portee === k ? 'is-on' : ''}`}
              onClick={() => setPortee(k)}
            >
              {mot}
            </button>
          ))}
        </div>
        <input
          className="mnd-input trf-releve-cherche"
          value={cherche}
          placeholder="Chercher un libellé, une facture…"
          onChange={(e) => setCherche(e.target.value)}
        />
      </div>

      {portee === 'tout' && moves.length > 0 && (
        <div className="trf-releve-graphe">
          <div className="trf-releve-graphe__l">Six derniers mois · entrées et sorties</div>
          <div className="trf-releve-graphe__bandes">
            {sixMois.lignes.map((l) => (
              <div className="trf-releve-graphe__mois" key={l.k}>
                <div className="trf-releve-graphe__paire">
                  <i style={{ height: `${Math.round((l.inn / sixMois.haut) * 100)}%`, background: 'var(--trf-success, #4A6B52)' }} />
                  <i style={{ height: `${Math.round((l.out / sixMois.haut) * 100)}%`, background: 'var(--color-copper)' }} />
                </div>
                <span>{monthShort(l.k)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mnd-muted" style={{ fontSize: 11.5, margin: '12px 0 4px', lineHeight: 1.5 }}>
        {boxCur !== currency ? `Caisse en ${boxCur} — ` : ''}
        encaissements crédités (avoir déduit, pourboire inclus), dépenses vivantes débitées.
        {q ? ` ${affichees.length} ligne${affichees.length > 1 ? 's' : ''} trouvée${affichees.length > 1 ? 's' : ''}.` : ''}
      </div>

      <div style={{ maxHeight: '46vh', overflowY: 'auto' }}>
        {affichees.length === 0 && (
          <div className="trf-empty" style={{ marginTop: 10 }}>
            {q
              ? 'Rien qui corresponde à cette recherche.'
              : portee === 'mois'
                ? `Aucun mouvement en ${monthName} — ni encaissement, ni dépense.`
                : 'Aucun mouvement depuis l’ouverture de cette caisse.'}
          </div>
        )}

        {affichees.map((m, i) => {
          const body = (
            <>
              <div style={{ minWidth: 0, display: 'flex', gap: 10, alignItems: 'baseline' }}>
                <span className="trf-datepill" style={{ flex: 'none' }}>{fmtDay(m.date)}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, color: 'var(--ink)' }}>{m.label}</div>
                  <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 2 }}>{m.sub}</div>
                </div>
              </div>
              <div style={{ flex: 'none', textAlign: 'right' }}>
                <div
                  className="mnd-serif"
                  style={{ fontSize: 15, color: m.delta >= 0 ? 'var(--trf-success, #4A6B52)' : 'var(--color-copper)' }}
                >
                  {m.delta >= 0 ? '+' : '−'} {fmtIn(Math.abs(m.delta), boxCur)}
                </div>
                {/* LE SOLDE APRÈS CE GESTE — c’est lui qu’on cherche quand on
                    remonte un relevé : « combien restait-il ce jour-là ? » */}
                <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                  {fmtIn(m.solde, boxCur)}
                </div>
              </div>
            </>
          );
          /* `border: none` d'abord, puis la seule bordure qu'on garde :
             l'inverse annulerait le trait sur les lignes-boutons. */
          const rowStyle = {
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            gap: 12, padding: '9px 0',
            width: '100%', textAlign: 'left' as const, background: 'none',
            border: 'none', borderBottom: '1px solid var(--hairline)',
            font: 'inherit', color: 'inherit',
          };
          /* Un encaissement s'ouvre sur sa facture, une dépense sur sa fiche.
             Seule une ligne qui ne mène nulle part reste inerte. */
          return m.invoiceId ? (
            <button
              key={`${m.date}-${m.label}-${i}`}
              style={{ ...rowStyle, cursor: 'pointer' }}
              title="Ouvrir la facture"
              onClick={() => { onClose(); navigate(`/factures?id=${m.invoiceId}`); }}
            >
              {body}
            </button>
          ) : m.expense ? (
            <button
              key={`${m.date}-${m.label}-${i}`}
              style={{ ...rowStyle, cursor: 'pointer' }}
              title="Modifier cette dépense"
              onClick={() => { const e = m.expense!; onClose(); openEdit(e); }}
            >
              {body}
            </button>
          ) : (m.transfertId && onTransfert) ? (
            <button
              key={`${m.date}-${m.label}-${i}`}
              style={{ ...rowStyle, cursor: 'pointer' }}
              title="Corriger ce mouvement — date, montant, motif"
              onClick={() => { const id = m.transfertId!; onClose(); onTransfert(id); }}
            >
              {body}
            </button>
          ) : (
            <div key={`${m.date}-${m.label}-${i}`} style={rowStyle}>{body}</div>
          );
        })}

        {/* LE POINT DE DÉPART FERME LA MARCHE. En haut il ne veut rien dire ;
            en bas, il est ce d’où tout est parti — et la somme des lignes
            au-dessus doit retomber sur le solde affiché en tête. */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, padding: '11px 0 2px' }}>
          <div>
            <div style={{ fontSize: 13.5, color: 'var(--ink-soft)' }}>
              {portee === 'tout' ? 'Solde d’ouverture' : `Solde au début de ${monthName}`}
            </div>
            <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 2 }}>
              {portee === 'tout' ? 'ce que la caisse contenait à sa création' : 'ouverture + tout l’historique antérieur'}
            </div>
          </div>
          <div className="mnd-serif" style={{ fontSize: 15, color: 'var(--ink-soft)' }}>{fmtIn(startBalance, boxCur)}</div>
        </div>
      </div>

      {onRapport && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="trf-act trf-act--ghost" onClick={onRapport}>Rapport PDF</button>
        </div>
      )}
    </Modal>
  );
}

/* ── LE MONTANT SUIT LE TIROIR — 23 août 2026 ───────────────────────
   « Quand j'ai choisi la caisse, ça dit toujours montant XOF, qui devrait
   normalement suivre le montant $ de la caisse choisie. »

   ELLE A RAISON, ET J'AVAIS MIS LES DEUX CHAMPS DANS LE MAUVAIS ORDRE. Ce
   qu'on connaît, quand on sort de l'argent d'un tiroir en dollars, c'est le
   nombre de DOLLARS. Le franc n'est qu'une valorisation. Le champ principal se
   dit donc dans la monnaie du tiroir, et la contrepartie en francs se remplit
   toute seule au taux indicatif de la Maison.

   LE TAUX EST UN POINT DE DÉPART, PAS UNE VÉRITÉ. `rateToXof` est figé dans le
   code et le dit lui-même : le change se négocie au comptoir. La contrepartie
   reste donc MODIFIABLE, et dès qu'on y touche elle cesse de suivre — on ne
   réécrit pas par-dessus un chiffre saisi à la main. Ce qui est inscrit, in
   fine, ce sont les deux montants réellement convenus, jamais une conversion
   rejouée plus tard. */

export type DeuxMontants = {
  devise: string;
  enDevise: boolean;
  /** Ce qui bouge dans le tiroir (dans SA monnaie si elle diffère). */
  saisi: number;
  /** La base comptable de la Maison. */
  xof: number;
  /** Ce que le taux indicatif propose — avant toute correction à la main. */
  suggestion: number;
  fx?: { code: string; rate: number; amount: number };
};

/** Les deux nombres d'une écriture, depuis ce qui est tapé dans les deux champs. */
export function montantsDuTiroir(
  caisse: Cashbox | undefined,
  maison: string,
  saisie: string,
  contrepartie: string,
): DeuxMontants {
  const devise = caisse ? cashboxCurrency(caisse) : maison;
  const enDevise = devise !== maison;
  const saisi = parseFloat((saisie ?? '').replace(',', '.')) || 0;
  if (!enDevise) {
    const xof = Math.round(saisi);
    return { devise, enDevise, saisi: xof, xof, suggestion: xof };
  }
  const suggestion = Math.round(saisi * rateToXof(devise));
  const corrige = parseInt((contrepartie ?? '').replace(/[^0-9]/g, ''), 10) || 0;
  const xof = corrige > 0 ? corrige : suggestion;
  return {
    devise,
    enDevise,
    saisi,
    xof,
    suggestion,
    fx: saisi > 0 ? { code: devise, rate: saisi > 0 ? xof / saisi : 0, amount: saisi } : undefined,
  };
}

/** Ce qu'un champ de montant doit annoncer, une fois la caisse choisie. */
export const libelleDuMontant = (caisse: Cashbox | undefined, maison: string): string =>
  `Montant · ${caisse ? cashboxCurrency(caisse) : maison}`;

/** Ce qu'on tape dans le champ principal : des centimes existent en devise. */
export const nettoieLeMontant = (v: string, enDevise: boolean): string =>
  (enDevise ? v.replace(/[^0-9.,]/g, '') : v.replace(/[^0-9]/g, ''));

/* ── QUAND LE FRANC EST DÉJÀ FIXÉ ─────────────────────────────────
   Une mission de prestataire est convenue en francs : on ne la renégocie pas
   au moment de la payer. Il ne reste alors qu’à dire ce qui sort du tiroir —
   l’inverse exact du prêt, où c’est le montant en devise qu’on connaît. Deux
   situations, deux champs ; les confondre ferait mentir l’un des deux. */
export function MontantDuTiroir({
  caisse, maison, valeur, montantXof, onChange, sortant,
}: {
  caisse?: Cashbox;
  maison: string;
  valeur: string;
  montantXof: number;
  onChange: (v: string) => void;
  sortant: boolean;
}) {
  const devise = caisse ? cashboxCurrency(caisse) : maison;
  if (devise === maison) return null;
  const saisi = parseFloat((valeur ?? '').replace(',', '.')) || 0;
  const taux = saisi > 0 && montantXof > 0 ? Math.round(montantXof / saisi) : 0;
  return (
    <label className="mnd-field">
      <span className="mnd-field__label">
        {sortant ? `Ce qui sort du tiroir · ${devise}` : `Ce qui entre dans le tiroir · ${devise}`}
      </span>
      <input
        className="mnd-input"
        inputMode="decimal"
        value={valeur}
        placeholder="0"
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.,]/g, ''))}
      />
      <span className="mnd-muted" style={{ fontSize: 10.5, marginTop: 5, display: 'block', lineHeight: 1.5 }}>
        {caisse?.name} compte ses billets en {devise} ; le montant en {maison} est déjà convenu.
        {taux > 0 && ` Soit ${taux.toLocaleString('fr-FR')} ${maison} par ${devise}.`}
        {saisi <= 0 && ` Laissé vide, cette écriture ne pèsera rien sur le tiroir — et le relevé le dira.`}
      </span>
    </label>
  );
}

/* La contrepartie en francs — n'apparaît QUE si le tiroir tient une autre
   monnaie. Sans elle, la Maison ne saurait pas ce que cette écriture pèse dans
   ses comptes ; avec elle imposée, on inventerait un taux du jour. */
export function ContrepartieMaison({
  caisse, maison, saisie, contrepartie, onChange, sortant,
}: {
  caisse?: Cashbox;
  maison: string;
  saisie: string;
  contrepartie: string;
  onChange: (v: string) => void;
  /** L'argent quitte le tiroir (prêt, dépense) ou y entre (avoir, remboursement). */
  sortant: boolean;
}) {
  const m = montantsDuTiroir(caisse, maison, saisie, contrepartie);
  if (!m.enDevise) return null;
  const taux = m.saisi > 0 ? Math.round(m.xof / m.saisi) : rateToXof(m.devise);
  return (
    <label className="mnd-field">
      <span className="mnd-field__label">Ce que cela vaut pour la Maison · {maison}</span>
      <input
        className="mnd-input"
        inputMode="numeric"
        value={contrepartie || (m.saisi > 0 ? String(m.suggestion) : '')}
        placeholder={String(m.suggestion || 0)}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ''))}
      />
      <span className="mnd-muted" style={{ fontSize: 10.5, marginTop: 5, display: 'block', lineHeight: 1.5 }}>
        {caisse?.name} {sortant ? 'perd' : 'gagne'} {m.saisi > 0 ? `${m.saisi.toLocaleString('fr-FR')} ${m.devise}` : `des ${m.devise}`}.
        {' '}Rempli au taux indicatif de la Maison ({Math.round(rateToXof(m.devise)).toLocaleString('fr-FR')} {maison}
        {' '}pour 1 {m.devise}) — corrigez-le au taux réellement pratiqué, il fait foi.
        {taux > 0 && m.saisi > 0 && ` Ici : ${taux.toLocaleString('fr-FR')} ${maison} par ${m.devise}.`}
      </span>
    </label>
  );
}

/* ── LE TROUSSEAU — 22 août 2026 ─────────────────────────────────────
   « Un bouton pour ouvrir toutes les caisses qui ont un code simultanément,
   et les refermer toutes simultanément » (Yéman). Ouvrir six tiroirs un à un,
   six fois le même code, six fois la même modale : le verrou finissait par
   coûter plus que ce qu'il protège, et un verrou qui coûte trop finit par être
   ôté.

   UN CODE N'OUVRE QUE CE QU'IL OUVRE. Les empreintes sont salées par
   l'identifiant de chaque caisse : deux tiroirs au même code n'ont pas la même
   empreinte, et rien ici ne contourne cela. Le code saisi est essayé sur
   CHACUNE des caisses encore fermées ; celles qu'il ouvre s'ouvrent, les
   autres gardent le leur — ET ON LE DIT. Un trousseau qui laisserait croire
   qu'il a tout ouvert serait pire qu'aucun trousseau.

   REFERMER NE DEMANDE RIEN. Fermer une porte n'a jamais eu besoin de clé. */
export function LeTrousseau({
  boxes, onClose,
}: {
  boxes: readonly Cashbox[];
  onClose: () => void;
}) {
  const ouvertesMaintenant = useCaissesOuvertes();
  const [code, setCode] = useState('');
  const [mot, setMot] = useState('');
  const [enCours, setEnCours] = useState(false);

  const discretes = boxes.filter(caisseDiscrete);
  const fermees = discretes.filter((c) => !soldeVisible(c, ouvertesMaintenant));
  const ouvertes = discretes.filter((c) => soldeVisible(c, ouvertesMaintenant));

  const essayer = async () => {
    if (!code.trim()) return;
    setEnCours(true);
    try {
      const ouvre: Cashbox[] = [];
      for (const c of fermees) {
        if (await leCodeOuvre(c, code)) ouvre.push(c);
      }
      ouvreLesCaisses(ouvre.map((c) => c.id));
      const restent = fermees.length - ouvre.length;
      setMot(ouvre.length === 0
        ? 'Ce code n’ouvre aucune des caisses encore fermées.'
        : `${ouvre.length} caisse${ouvre.length > 1 ? 's' : ''} ouverte${ouvre.length > 1 ? 's' : ''}`
          + (restent > 0
            ? ` — ${restent} garde${restent > 1 ? 'nt' : ''} son propre code. Essayez-le ici.`
            : ' — plus rien de fermé.'));
      setCode('');
    } finally {
      setEnCours(false);
    }
  };

  const toutRefermer = () => {
    refermeLesCaisses(ouvertes.map((c) => c.id));
    setMot(`${ouvertes.length} caisse${ouvertes.length > 1 ? 's' : ''} refermée${ouvertes.length > 1 ? 's' : ''}.`);
  };

  return (
    <Modal title="Le trousseau" onClose={onClose} width={430}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="mnd-muted" style={{ fontSize: 12.5, lineHeight: 1.7 }}>
          Un code essayé sur toutes les caisses encore fermées : celles qu’il ouvre s’ouvrent
          d’un geste. Les caisses ne partagent pas leur empreinte — si vos codes diffèrent,
          entrez-les l’un après l’autre. Tout se referme au prochain chargement de la page.
        </div>

        <div style={{ border: '1px solid var(--hairline)', borderRadius: 3 }}>
          {discretes.map((c, i) => {
            const dedans = soldeVisible(c, ouvertesMaintenant);
            return (
              <div
                key={c.id}
                style={{
                  display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                  gap: 12, padding: '9px 12px',
                  borderTop: i === 0 ? 'none' : '1px solid var(--hairline)',
                }}
              >
                <span style={{ fontSize: 13.5, color: 'var(--ink)' }}>{c.glyph} {c.name}</span>
                <span
                  className="mnd-muted"
                  style={{
                    fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase',
                    color: dedans ? 'var(--trf-success, #4A6B52)' : 'var(--ink-soft)',
                  }}
                >
                  {dedans ? 'ouverte' : 'fermée'}
                </span>
              </div>
            );
          })}
        </div>

        {fermees.length > 0 && (
          <label className="mnd-field">
            <span className="mnd-field__label">Code</span>
            <input
              className="mnd-input" type="password" autoFocus autoComplete="off"
              value={code}
              onChange={(e) => { setCode(e.target.value); setMot(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') void essayer(); }}
            />
          </label>
        )}

        {mot && (
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, lineHeight: 1.6, color: 'var(--copper-700)' }}>
            {mot}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <button
            className="mnd-btn mnd-btn--ghost"
            onClick={toutRefermer}
            disabled={ouvertes.length === 0}
          >
            Tout refermer
          </button>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="mnd-btn mnd-btn--ghost" onClick={onClose}>Fermer</button>
            {fermees.length > 0 && (
              <button className="mnd-btn" onClick={() => void essayer()} disabled={enCours || !code.trim()}>
                {enCours ? 'Un instant…' : 'Tout ouvrir'}
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}


/* ── LE VERROU D'UN ÉCRAN — 22 août 2026 ────────────────────────────
   Posé d'abord sur les caisses, demandé ensuite sur le coffre : deux écrans,
   une seule mécanique. Le recopier aurait fait deux verrous à corriger le jour
   où l'un d'eux se révèle troué.

   SANS CODE POSÉ, LA PORTE EST OUVERTE : une mise à jour ne doit enfermer
   personne dehors. Le verrou vaut pour la SÉANCE — recharger le repose. Et il
   ne remplace pas les droits : un compte sans accès aux finances ne verra
   jamais l'écran, code ou pas. */
export function EcranVerrouille({
  titre, cle, hash,
}: {
  titre: string;
  cle: string;
  hash?: string;
}) {
  const [code, setCode] = useState('');
  const [faux, setFaux] = useState(false);
  const essayer = async () => {
    if (await leCodeOuvre({ id: cle, codeHash: hash }, code)) {
      ouvreLaCaisse(cle);
      setCode(''); setFaux(false);
    } else setFaux(true);
  };
  return (
    <div className="mnd-rise">
      <div className="trf-verrou">
        <div className="trf-verrou__titre">{titre}</div>
        <p className="trf-verrou__mot">
          Cet écran demande le code de la Maison. Il se refermera de lui-même au prochain
          chargement de la page.
        </p>
        <input
          className="mnd-input"
          type="password"
          autoFocus
          autoComplete="off"
          placeholder="Code"
          value={code}
          onChange={(e) => { setCode(e.target.value); setFaux(false); }}
          onKeyDown={(e) => { if (e.key === 'Enter') void essayer(); }}
          style={{ maxWidth: 260 }}
        />
        {faux && <div className="trf-verrou__faux">Ce code n’ouvre pas cet écran.</div>}
        <button className="mnd-btn" style={{ marginTop: 14 }} onClick={() => void essayer()}>Ouvrir</button>
      </div>
    </div>
  );
}

/** Poser, changer ou retirer le code d'un écran. Vider le champ le retire. */
export function ReglerLeVerrou({
  cle, hash, onClose, onPose,
}: {
  cle: string;
  hash?: string;
  onClose: () => void;
  onPose: (hash: string | undefined) => void;
}) {
  const [code, setCode] = useState('');
  const enregistrer = async () => {
    const c = code.trim();
    const h = c ? await empreinteDuCode(cle, c) : undefined;
    onPose(h);
    if (h) ouvreLaCaisse(cle);
    onClose();
  };
  return (
    <Modal title={hash ? 'Le code de cet écran' : 'Protéger cet écran'} onClose={onClose} width={430}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="mnd-muted" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
          Un code demandé à l’ouverture de l’écran. Seule son <b>empreinte</b> est enregistrée —
          il n’existe en clair nulle part.
          <br />
          <b style={{ color: 'var(--copper-700)' }}>Ce que cela protège :</b> un écran laissé ouvert, un regard au comptoir.
          {' '}<b style={{ color: 'var(--copper-700)' }}>Ce que cela ne protège pas :</b> qui a accès à la base. Les droits du
          compte restent la vraie barrière.
        </div>
        <label className="mnd-field">
          <span className="mnd-field__label">
            {hash ? 'Nouveau code — vider pour retirer le verrou' : 'Code'}
          </span>
          <input
            className="mnd-input" type="password" autoFocus autoComplete="new-password"
            value={code}
            placeholder={hash ? 'Laisser vide et enregistrer = plus de verrou' : ''}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void enregistrer(); }}
          />
        </label>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="mnd-btn mnd-btn--ghost" onClick={onClose}>Annuler</button>
          <button className="mnd-btn" onClick={() => void enregistrer()}>
            {code.trim() ? 'Enregistrer le code' : (hash ? 'Retirer le verrou' : 'Enregistrer')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
