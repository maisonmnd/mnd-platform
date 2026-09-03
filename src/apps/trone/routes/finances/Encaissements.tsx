import { useMemo, useState, type CSSProperties } from 'react';
import { Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PageHead, WaLien } from '../_ui';
import { Button, Input, Modal, Segs, toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { useAppointments, appointmentsStore } from '../../../../shared/agenda';
import { useClients } from '../../../../shared/clients';
import { useStaff as useMonProfil } from '../../../../shared/auth';
import { autoriserLaPurge } from '../../../../shared/sync';
import { tipsStore, addTipPartage, PART_POURBOIRE_DEFAUT } from '../../../../shared/tips';
import {
  useInvoices, useDepensesComptees, invoiceReglements, sourcesDe,
  partsPrisesParRevenu, etatDuRevenu, LIBELLE_ETAT, type EtatRevenu,
} from '../../../../shared/finance';
import { staffStore } from '../equipe/data';
import {
  totalBy, receiptKindLabel, CAISSE_POURBOIRES, cibleDeLEncaissement,
  type Receipt, type ReceiptKind,
} from '../../../../shared/receipts';
import { invoicesStore, creditMovementsStore, paymentsStore } from '../../../../shared/finance';
import { subscribersStore } from '../../../../shared/abonnements';
import { apprenantsStore } from '../equipe/data';
import { todayISO, monthKey, monthTitle, MonthNav, downloadCsv, useRegistreEncaissements } from './_shared';
import { normName } from '../../../../shared/text';
import { receiptPdf } from '../../../../shared/pdf';
import { maisonNom } from '../../../../shared/identite';
import './finances.css';

/* Encaissements — le registre de TOUT ce qui entre, par toutes les portes :
   factures réglées au comptoir, acomptes (en ligne ou remis à la Maison),
   formations de l'Académie, règlements d'abonnement, dépôts d'avoir.

   C'est un registre de TRÉSORERIE, pas de chiffre d'affaires : il répond à
   « qu'est-ce qui est entré, quand, par quel moyen, dans quelle caisse, et sur
   quelle preuve ? ». La Synthèse, elle, répond à « qu'avons-nous gagné ? ».
   Les deux totaux diffèrent légitimement — le pourboire entre au tiroir sans
   être du revenu, l'avoir est du revenu sans être des billets. Ne jamais
   chercher à les faire coïncider.

   Tout est DÉRIVÉ (shared/receipts.ts) : aucun compteur n'est écrit, donc rien
   ne peut dériver de la réalité. */

const KINDS: { k: ReceiptKind | 'tous'; l: string }[] = [
  { k: 'tous', l: 'Tout' },
  { k: 'facture', l: 'Factures' },
  { k: 'acompte', l: 'Acomptes' },
  { k: 'formation', l: 'Formations' },
  { k: 'abonnement', l: 'Abonnements' },
  { k: 'avoir', l: 'Avoirs' },
  { k: 'pourboire', l: 'Pourboires' },
];

const frDay = (iso: string): string =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : '—';

/* ═══ LE POINTAGE DU RELEVÉ MoMo (13 août) ═══════════════════════════
   Le compte marchand MoMoPay reçoit des paiements que Le Trône ne voit
   pas naître (QR du salon, USSD composé par la cliente). Le relevé du
   portail marchand MTN est la SEULE vue complète de ce compte : on le
   colle ici tel quel, et chaque ligne est rapprochée du registre.

   Le lecteur est TOLÉRANT : il cherche montant, date et référence où
   qu'ils soient sur la ligne (export CSV, copie du portail, messages) —
   les formats de MTN varient et ne nous appartiennent pas. Une ligne
   sans montant lisible est comptée « illisible », jamais devinée. */

type LigneReleve = { brute: string; date?: string; montantXof: number; ref?: string };

const lireReleve = (texte: string): { lignes: LigneReleve[]; illisibles: number } => {
  const lignes: LigneReleve[] = [];
  let illisibles = 0;
  for (const brute of texte.split(/\r?\n/)) {
    const l = brute.trim();
    if (!l) continue;
    /* La date — ISO d'abord, sinon jj/mm/aaaa à la française. */
    let date: string | undefined;
    const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(l);
    const fr = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/.exec(l);
    if (iso) date = `${iso[1]}-${iso[2]}-${iso[3]}`;
    else if (fr) {
      const an = fr[3].length === 2 ? `20${fr[3]}` : fr[3];
      date = `${an}-${fr[2].padStart(2, '0')}-${fr[1].padStart(2, '0')}`;
    }
    /* Le montant — un nombre marqué F/FCFA/XOF d'abord ; sinon un nombre à
       séparateurs de milliers (15 000 · 15.000 · 15,000). */
    const marque = /([\d][\d\s .,]*)\s*(?:FCFA|XOF|F)\b/i.exec(l);
    const separe = /\b\d{1,3}(?:[\s .]\d{3})+\b/.exec(l);
    const brut = marque?.[1] ?? separe?.[0];
    const montantXof = brut ? parseInt(brut.replace(/[\s .,]/g, ''), 10) : NaN;
    if (!Number.isFinite(montantXof) || montantXof <= 0) { illisibles++; continue; }
    /* La référence — la plus longue suite d'au moins 9 chiffres qui n'est
       pas le montant (les identifiants de transaction MoMo sont longs). */
    const refs = (l.match(/\b\d{9,}\b/g) ?? []).filter((r) => parseInt(r, 10) !== montantXof);
    const ref = refs.sort((a, b) => b.length - a.length)[0];
    lignes.push({ brute: l, date, montantXof, ref });
  }
  return { lignes, illisibles };
};

const joursEntre = (a?: string, b?: string): number =>
  a && b ? Math.abs((new Date(`${a}T00:00:00`).getTime() - new Date(`${b}T00:00:00`).getTime()) / 86_400_000) : 99;

const estMomo = (moyen?: string): boolean => /momo|mtn|mobile/i.test(moyen ?? '');

export type VerdictReleve = {
  ligne: LigneReleve;
  etat: 'pointé' | 'autre-moyen' | 'acompte' | 'orphelin';
  /** Ce qu'on a trouvé en face — pour le dire en toutes lettres. */
  detail?: string;
  apptId?: string;
};

/** Rapproche chaque ligne du registre : un encaissement ne se consomme qu'UNE
    fois (deux paiements de 15 000 F le même jour = deux encaissements requis). */
const rapprocher = (
  lignes: LigneReleve[],
  receipts: Receipt[],
  acomptesEnAttente: { id: string; depositXof: number; clientName?: string; date: string }[],
): VerdictReleve[] => {
  const libres = new Set(receipts.map((r) => r.id));
  const acomptesLibres = new Set(acomptesEnAttente.map((a) => a.id));
  return lignes.map((ligne) => {
    /* Le meilleur encaissement encore libre : même montant, dates proches. */
    const candidats = receipts
      .filter((r) => libres.has(r.id) && r.amountXof === ligne.montantXof && joursEntre(ligne.date, r.date) <= 3)
      .sort((a, b) => joursEntre(ligne.date, a.date) - joursEntre(ligne.date, b.date));
    const elu = candidats.find((r) => estMomo(r.method)) ?? candidats[0];
    if (elu) {
      libres.delete(elu.id);
      const qui = `${elu.clientName} · ${frDay(elu.date)} · ${elu.method}`;
      return estMomo(elu.method)
        ? { ligne, etat: 'pointé' as const, detail: qui }
        : { ligne, etat: 'autre-moyen' as const, detail: qui };
    }
    /* Un acompte demandé, jamais confirmé, du même montant : la preuve
       attendue vient peut-être d'arriver par ce relevé. */
    const ac = acomptesEnAttente.find((a) => acomptesLibres.has(a.id) && a.depositXof === ligne.montantXof);
    if (ac) {
      acomptesLibres.delete(ac.id);
      return { ligne, etat: 'acompte' as const, detail: `${ac.clientName ?? 'Cliente'} · RDV ${frDay(ac.date)}`, apptId: ac.id };
    }
    return { ligne, etat: 'orphelin' as const };
  });
};

export default function Encaissements() {
  const { branch, currency } = useBranch();
  const navigate = useNavigate();

  /* ── SUPPRIMER UN ENCAISSEMENT — 29 août 2026 ────────────────────
     « Me permettre de supprimer des encaissements test » (Yéman).

     UNE LIGNE D'ENCAISSEMENT N'EXISTE PAS : elle est CALCULÉE depuis sept
     sources. La supprimer, c'est retirer le bon morceau de la bonne source, et
     rien d'autre — `cibleDeLEncaissement` (shared/receipts.ts) dit lequel.

     SI L'ORIGINE EST INCONNUE, ON N'EFFACE RIEN. Mieux vaut une ligne de trop
     qu'une suppression au hasard dans les comptes de la Maison. */
  const [aEffacer, setAEffacer] = useState<Receipt | null>(null);

  const effacer = (r: Receipt) => {
    const cible = cibleDeLEncaissement(r);
    if (!cible) { toast('Origine de cette ligne introuvable, rien n’a été touché.'); return; }
    switch (cible.source) {
      case 'facture':
        /* LE VERSEMENT S'EN VA, LA PIÈCE RESTE. Effacer la facture avec lui
           effacerait aussi ce qui est encore dû, et la créance disparaîtrait. */
        invoicesStore.set((prev) => prev.map((i) => (i.id === cible.invoiceId
          ? { ...i, payments: (i.payments ?? []).filter((x) => x.id !== cible.paymentId) }
          : i)));
        break;
      case 'pourboire':
        /* Le pourboire ET ses parts d'équipe : les laisser derrière ferait
           réapparaître la somme au partage sans jamais l'avoir reçue. */
        invoicesStore.set((prev) => prev.map((i) => (i.id === cible.invoiceId
          ? { ...i, tipXof: 0 } : i)));
        tipsStore.set((prev) => prev.filter((t) => t.invoiceId !== cible.invoiceId));
        break;
      case 'enligne':
        paymentsStore.set((prev) => prev.filter((x) => x.id !== cible.paymentId));
        break;
      case 'acompte':
        /* L'acompte se DÉPOSE, le rendez-vous demeure. */
        appointmentsStore.set((prev) => prev.map((a) => (a.id === cible.apptId
          ? { ...a, depositXof: 0, depositConfirmed: false, depositConfirmedAt: undefined }
          : a)));
        break;
      case 'formation':
        apprenantsStore.set((prev) => prev.map((ap) => ({
          ...ap, payments: (ap.payments ?? []).filter((x) => x.id !== cible.paymentId),
        })));
        break;
      case 'abonnement':
        subscribersStore.set((prev) => prev.map((sub) => ({
          ...sub, payments: (sub.payments ?? []).filter((x) => x.id !== cible.paymentId),
        })));
        /* LE MIROIR DE LA PIÈCE PART AVEC LUI. Un règlement d'abonnement s'écrit
           DEUX fois — dans le contrat et sur la facture, sous le même
           identifiant. N'en retirer qu'un laissait la pièce encaissée d'un
           argent que le contrat ne connaissait plus, et les deux écrans se
           contredisaient sans que rien ne le dise. */
        invoicesStore.set((prev) => prev.map((i) => ((i.payments ?? []).some((x) => x.id === cible.paymentId)
          ? { ...i, payments: (i.payments ?? []).filter((x) => x.id !== cible.paymentId) }
          : i)));
        break;
      case 'avoir':
        creditMovementsStore.set((prev) => prev.filter((m) => m.id !== cible.movementId));
        break;
      default:
        break;
    }
    setAEffacer(null);
    toast(`Encaissement de ${fmtMoney(r.amountXof, currency)} supprimé.`);
  };
  /* Ce que l'écran lit ENCORE en propre : les factures (pointage du relevé,
     reconstruction des parts) et les fiches (noms). Le reste de l'assemblage
     du registre est passé derrière `useRegistreEncaissements`. */
  const [invoices] = useInvoices();
  const [appointments] = useAppointments();
  const [clients] = useClients();
  /* Les dépenses disent quels revenus ont déjà servi — voir `etatDe`. */
  /* CE QUI ATTEND UN OUI N'EST PAS ENCORE UNE DÉPENSE — 31 août 2026.
     Voir `compteDansLesChiffres` dans `shared/finance.ts`. */
  const expenses = useDepensesComptees();

  const [month, setMonth] = useState(monthKey(todayISO()));
  const [kind, setKind] = useState<ReceiptKind | 'tous'>('tous');

  /* ── RECONSTRUIRE LES PARTS DEPUIS CETTE LISTE — 19 août 2026 ─────
     « Je n'ai pas beaucoup de pourboires, je préfère aller dans mes
     encaissements-pourboires et extraire la liste. » Les parts d'avant le
     lien (les doublons des encaissements refaits du 11 et du 14 août) ne
     peuvent pas être triées une à une : rien ne dit d'où chacune venait.
     Alors on ne trie pas — ON REPART DE LA VÉRITÉ : ce registre. Toutes
     les parts SANS pièce s'effacent, et chaque pourboire de la liste se
     repartage entre l'équipe, daté, nommé, LIÉ à sa facture. Les parts déjà
     liées ne bougent pas. Souverain seulement : ce geste réécrit l'argent
     des mains de toute l'équipe. */
  const monProfil = useMonProfil();
  const reconstruireLesParts = () => {
    const equipe = staffStore.get()
      .filter((m) => m.branchId === branch.id)
      .map((m) => ({ id: m.id, part: m.partPourboire ?? PART_POURBOIRE_DEFAUT }));
    /* SANS ÉQUIPE, ON NE TOUCHE À RIEN. Effacer d'abord et repartager entre
       personne aurait vidé « Mon mois » de tout le monde sans rien rendre. */
    if (equipe.filter((m) => m.part > 0).length === 0) {
      window.alert('Aucune fiche du personnel dans cette branche (Personnel & paie), rien n’a été touché : le repartage n’aurait crédité personne.');
      return;
    }
    const factures = invoices.filter((i) => i.branchId === branch.id && i.kind === 'facture' && (i.tipXof ?? 0) > 0);
    if (!window.confirm(
      `Reconstruire les parts de pourboire depuis ce registre ?\n\n`
      + `Toutes les parts SANS facture liée (celles d'avant le 19 août, doublons compris) seront effacées chez chacun, `
      + `puis les ${factures.length} pourboire(s) du registre seront repartagés entre l'équipe. `
      + `Les parts déjà liées à une facture ne bougent pas.`,
    )) return;
    const orphelines = tipsStore.get().filter((t) => !t.invoiceId).length;
    /* LA PURGE SE DÉCLARE — sans ce laissez-passer, le garde-fou des
       suppressions de masse prenait ce grand ménage pour un cache corrompu,
       le bloquait, et rechargeait les parts depuis le serveur : l'écran
       semblait ne rien faire. Un laissez-passer, une poussée. */
    autoriserLaPurge('tips');
    tipsStore.set((prev) => prev.filter((t) => !!t.invoiceId));
    let repartages = 0;
    for (const i of factures) {
      if (tipsStore.get().some((t) => t.invoiceId === i.id)) continue;
      const jour = invoiceReglements(i)[0]?.date ?? i.date;
      const nom = i.clientName ?? clients.find((c) => c.id === i.clientId)?.name;
      addTipPartage(equipe, i.tipXof!, jour, nom, i.id);
      repartages++;
    }
    toast(`${orphelines} ancienne(s) part(s) effacée(s) · ${repartages} pourboire(s) repartagé(s) depuis le registre.`);
  };
  const [q, setQ] = useState('');
  /* Un total ne vaut que si l'on peut l'ouvrir : cliquer « Espèces » ou
     « Caisse Principale » restreint le registre du dessous aux entrées qui le
     composent. Re-cliquer relâche. Les deux se cumulent — « Mobile Money » ×
     « Hors caisse » répond à une question qu'aucun des deux ne répond seul. */
  const [method, setMethod] = useState<string | null>(null);
  const [box, setBox] = useState<string | null>(null);
  /* L'ÉTAT D'UN REVENU — 21 août 2026, « où retrouver le bilan des revenus
     entamés et terminés ». Quatrième filtre, même grammaire que les trois
     autres : cliquer restreint, re-cliquer relâche, et tout se cumule. */
  const [etat, setEtat] = useState<EtatRevenu | null>(null);
  const boxOf = (r: Receipt) => r.cashbox ?? 'Hors caisse';

  /* Le registre vient de la porte commune — Dépenses lit exactement le même
     (voir `useRegistreEncaissements`). Deux assemblages auraient divergé. */
  const all = useRegistreEncaissements();

  const ofMonth = useMemo(() => all.filter((r) => monthKey(r.date) === month), [all, month]);

  /* CE QUI A DÉJÀ ÉTÉ PUISÉ, revenu par revenu — une seule passe sur toutes
     les dépenses de la Maison, jamais une relecture par ligne. */
  const prisParRevenu = useMemo(() => partsPrisesParRevenu(expenses), [expenses]);

  /* LES POURBOIRES N'ONT PAS D'ÉTAT. On ne peut pas les désigner pour payer
     une dépense — c'est l'argent des mains — donc ils paraîtraient « intacts »
     à jamais, ce qui laisserait croire à une réserve disponible. Ils restent
     hors du bilan, et leur ligne ne porte aucune pastille. */
  const aUnEtat = (r: Receipt) => r.kind !== 'pourboire' && (r.cashbox ?? '') !== CAISSE_POURBOIRES;
  const etatDe = (r: Receipt): EtatRevenu | null =>
    (aUnEtat(r) ? etatDuRevenu(r.amountXof, prisParRevenu.get(r.id) ?? 0) : null);
  const resteDe = (r: Receipt): number => Math.max(0, r.amountXof - (prisParRevenu.get(r.id) ?? 0));

  /* LE BILAN DU MOIS — combien de revenus dorment entiers, combien sont
     entamés (et ce qu'il en reste), combien ont entièrement servi. */
  const bilanEtats = useMemo(() => {
    const vide: Record<EtatRevenu, { n: number; total: number; reste: number }> = {
      intact: { n: 0, total: 0, reste: 0 },
      entame: { n: 0, total: 0, reste: 0 },
      epuise: { n: 0, total: 0, reste: 0 },
    };
    for (const r of ofMonth) {
      const e = etatDe(r);
      if (!e) continue;
      vide[e].n += 1;
      vide[e].total += r.amountXof;
      vide[e].reste += Math.max(0, r.amountXof - (prisParRevenu.get(r.id) ?? 0));
    }
    return vide;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ofMonth, prisParRevenu]);

  const shown = useMemo(() => {
    const needle = normName(q);
    return ofMonth
      .filter((r) => kind === 'tous' || r.kind === kind)
      .filter((r) => !method || r.method === method)
      .filter((r) => !box || boxOf(r) === box)
      .filter((r) => !etat || etatDe(r) === etat)
      .filter((r) => !needle || normName(r.clientName).includes(needle) || normName(r.ref ?? '').includes(needle));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ofMonth, kind, method, box, etat, q, prisParRevenu]);

  const total = shown.reduce((s, r) => s + r.amountXof, 0);
  /* Les deux cartes restent le partage du MOIS ENTIER, jamais du filtre en
     cours : c'est ce qui permet de garder la vue d'ensemble sous les yeux
     pendant qu'on consulte un moyen en particulier. */
  const byMethod = useMemo(() => totalBy(ofMonth, (r) => r.method), [ofMonth]);
  /* `boxOf` sert ICI et dans le filtre : le libellé de repli (« Hors caisse »)
     doit être le MÊME des deux côtés, sinon cliquer la ligne ne trouverait rien. */
  const byBox = useMemo(() => totalBy(ofMonth, boxOf), [ofMonth]);
  const filtered = method !== null || box !== null;

  /* Ouvre la pièce d'origine : la facture, ou le rituel. La traçabilité ne vaut
     que si l'on peut remonter à la source en un clic. */
  const openSource = (r: Receipt) => {
    if (r.invoiceId) navigate(`/factures?id=${r.invoiceId}`);
    else if (r.apptId) navigate('/carnet');
  };

  /* Le reçu — la preuve papier que la Maison a reçu cette somme. Son numéro est
     DÉRIVÉ de l'encaissement : réémettre le même reçu redonne le même numéro. */
  const [busy, setBusy] = useState<string | null>(null);
  const printReceipt = async (r: Receipt) => {
    setBusy(r.id);
    try {
      await receiptPdf({
        /* La ligne pourboire d'une facture partage ses 6 derniers caractères
           avec la ligne de la facture (même pièce d'origine) : sans le préfixe
           « RP », les deux reçus porteraient le MÊME numéro. */
        number: `${r.kind === 'pourboire' ? 'RP' : 'R'}-${r.date.replace(/-/g, '')}-${r.id.slice(-6).toUpperCase()}`,
        houseName: maisonNom(),
        houseSub: `${branch.name} · ${branch.city}`,
        date: new Date(`${r.date}T00:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }),
        clientName: r.clientName,
        label: r.label,
        kind: receiptKindLabel(r.kind),
        amount: fmtMoney(r.amountXof, currency),
        method: r.method,
        cashbox: r.cashbox,
        ref: r.ref,
      });
    } finally {
      setBusy(null);
    }
  };

  /* ── CE QUE CE REVENU A PAYÉ — 21 août 2026 ───────────────────────
     L'autre sens du lien posé dans Dépenses : « le mois de Ghislain a servi
     à quoi ? ». Rien de nouveau n'est saisi ici — c'est la même écriture,
     relue depuis l'argent qui est entré plutôt que depuis celui qui est
     sorti. Muet tant qu'aucune dépense n'a nommé ce revenu. */
  const AServi = ({ revenu }: { revenu: Receipt }) => {
    const dessus = expenses
      .filter((e) => sourcesDe(e).some((s) => s.ref === revenu.id))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    if (dessus.length === 0) return null;
    const pris = dessus.reduce(
      (s, e) => s + sourcesDe(e).filter((x) => x.ref === revenu.id).reduce((n, x) => n + x.xof, 0), 0,
    );
    const reste = revenu.amountXof - pris;
    return (
      <div className="trf-prov">
        <div className="trf-prov__titre">Cet argent a servi à</div>
        {dessus.map((e) => (
          <div className="trf-prov__ligne" key={e.id}>
            <span className="trf-prov__puce" />
            <span className="trf-prov__nom">
              <b>{e.label}</b>
              <span className="trf-prov__quand">· {frDay(e.date)}</span>
            </span>
            <span className="trf-prov__xof">
              {fmtMoney(sourcesDe(e).filter((x) => x.ref === revenu.id).reduce((n, x) => n + x.xof, 0), currency)}
            </span>
          </div>
        ))}
        <div className="trf-prov__ligne trf-prov__ligne--muette">
          <span className="trf-prov__puce" style={{ background: 'transparent' }} />
          <span className="trf-prov__nom">
            {reste <= 0 ? 'Ce versement est épuisé.' : 'Il reste de ce versement'}
          </span>
          {reste > 0 && <span className="trf-prov__xof">{fmtMoney(reste, currency)}</span>}
        </div>
      </div>
    );
  };

  const exportCsv = () =>
    downloadCsv(`encaissements-${month}`, [
      ['Date', 'Nature', 'Cliente', 'Objet', 'Moyen', 'Caisse', 'Référence', `Montant (${currency})`],
      ...shown.map((r) => [r.date, receiptKindLabel(r.kind), r.clientName, r.label, r.method, r.cashbox ?? '', r.ref ?? '', r.amountXof]),
    ]);

  /* ── Le pointage du relevé MoMo ─────────────────────────────────── */
  const [releveOuvert, setReleveOuvert] = useState(false);
  const [texteReleve, setTexteReleve] = useState('');
  const { lignes, illisibles } = useMemo(() => lireReleve(texteReleve), [texteReleve]);
  /* Les acomptes demandés jamais confirmés — la preuve arrive peut-être ici. */
  const acomptesEnAttente = useMemo(
    () => appointments
      .filter((a) => a.branchId === branch.id && (a.depositXof ?? 0) > 0 && !a.depositConfirmed && a.status !== 'annulé')
      .map((a) => ({ id: a.id, depositXof: a.depositXof ?? 0, clientName: a.clientName ?? clients.find((c) => c.id === a.clientId)?.name, date: a.date })),
    [appointments, branch.id, clients],
  );
  const verdicts = useMemo(() => rapprocher(lignes, all, acomptesEnAttente), [lignes, all, acomptesEnAttente]);
  const compte = (etat: VerdictReleve['etat']) => verdicts.filter((v) => v.etat === etat).length;
  /* Confirmer l'acompte depuis la ligne du relevé : la date de la preuve est
     celle du relevé — c'est ce jour-là que l'argent est entré. */
  const confirmerAcompte = (apptId: string, dateLigne?: string) =>
    appointmentsStore.set((prev) => prev.map((a) =>
      a.id === apptId ? { ...a, depositConfirmed: true, depositConfirmedAt: dateLigne ?? todayISO() } : a,
    ));
  const ETAT_META: Record<VerdictReleve['etat'], { l: string; couleur: string }> = {
    'pointé': { l: 'Pointé', couleur: 'var(--color-indigo)' },
    'autre-moyen': { l: 'Noté sous un autre moyen', couleur: 'var(--copper-700)' },
    'acompte': { l: 'Acompte à confirmer', couleur: 'var(--copper-700)' },
    'orphelin': { l: 'Orphelin, à regarder', couleur: '#8f3b30' },
  };

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="Finances · trésorerie"
        title="Encaissements."
        sub="Tout ce que la Maison reçoit, d’où que ça vienne, et la preuve de chaque entrée. Registre de trésorerie : il compte l’argent entré, quand la Synthèse compte ce qui est gagné."
        actions={
          <>
            <MonthNav month={month} onChange={setMonth} />
            <Button variant="ghost" onClick={exportCsv} disabled={shown.length === 0}>Exporter</Button>
            <Button variant={releveOuvert ? 'copper' : 'ghost'} onClick={() => setReleveOuvert((o) => !o)}>
              Pointer le relevé MoMo
            </Button>
          </>
        }
      />

      {/* ── Le pointage du relevé MoMo — la seule vue complète du compte
          marchand (QR du salon compris) rapprochée du registre, ligne à
          ligne. Rien ne s'écrit sans geste : seul « Confirmer l'acompte »
          modifie quelque chose, et il le dit. ── */}
      {releveOuvert && (
        <div className="trf-panel" style={{ marginBottom: 18 }}>
          <div className="mnd-eyebrow">Pointer le relevé MoMo</div>
          <div className="mnd-muted" style={{ fontSize: 12, marginTop: 4, lineHeight: 1.5, maxWidth: 680 }}>
            Colle le relevé du portail marchand MTN tel quel, export ou copie d’écran, une
            opération par ligne. Je lis montant, date et référence où qu’ils soient sur la ligne,
            et je rapproche chaque entrée du registre : encaissements, acomptes en attente.
          </div>
          <textarea
            value={texteReleve}
            onChange={(e) => setTexteReleve(e.target.value)}
            rows={6}
            placeholder={'12/08/2026  15 000 F  réf 123456789012  AKOSSIWA D.\n12/08/2026  40 000 F  réf 123456789013  …'}
            style={{ width: '100%', marginTop: 12, padding: '10px 12px', border: '1px solid var(--hairline)', borderRadius: 4, fontFamily: 'var(--font-sans)', fontSize: 13, background: 'var(--surface-card)', color: 'var(--ink)', resize: 'vertical' }}
            aria-label="Relevé MoMo à pointer"
          />
          {lignes.length > 0 && (
            <>
              <div className="mnd-muted" style={{ fontSize: 12.5, marginTop: 10 }}>
                {lignes.length} ligne{lignes.length > 1 ? 's' : ''} lue{lignes.length > 1 ? 's' : ''}
                {illisibles > 0 ? ` · ${illisibles} illisible${illisibles > 1 ? 's' : ''} (sans montant)` : ''}
                {' — '}
                {compte('pointé')} pointée{compte('pointé') > 1 ? 's' : ''} ·{' '}
                {compte('acompte')} acompte{compte('acompte') > 1 ? 's' : ''} à confirmer ·{' '}
                {compte('autre-moyen')} sous un autre moyen ·{' '}
                {compte('orphelin')} orpheline{compte('orphelin') > 1 ? 's' : ''}
              </div>
              <div style={{ marginTop: 8 }}>
                {verdicts.map((v, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderTop: i === 0 ? 'none' : '1px solid var(--hairline)', flexWrap: 'wrap' }}>
                    <span style={{ minWidth: 64, fontSize: 12.5 }}>{v.ligne.date ? frDay(v.ligne.date) : '—'}</span>
                    <span style={{ minWidth: 96, fontFamily: 'var(--font-serif)', fontSize: 15, color: 'var(--color-indigo)', textAlign: 'right' }}>
                      {fmtMoney(v.ligne.montantXof, currency)}
                    </span>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: ETAT_META[v.etat].couleur, minWidth: 150 }}>
                      {ETAT_META[v.etat].l}
                    </span>
                    <span className="mnd-muted" style={{ fontSize: 12, flex: 1, minWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {v.detail ?? (v.etat === 'orphelin' ? 'Aucune entrée du registre à ce montant, paiement hors salon, ou à enregistrer.' : '')}
                    </span>
                    {v.etat === 'acompte' && v.apptId && (
                      <Button size="sm" variant="copper" onClick={() => confirmerAcompte(v.apptId!, v.ligne.date)}>
                        Confirmer l’acompte
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 10, lineHeight: 1.5 }}>
                « Noté sous un autre moyen » : l’argent est arrivé en MoMo mais le registre dit
                autre chose (Espèces, carte…), à corriger sur la pièce d’origine. Le pointage ne
                s’enregistre pas : recolle le relevé pour le refaire, il retombe sur ses pieds.
              </div>
            </>
          )}
        </div>
      )}

      {/* ── LE BILAN DES REVENUS — 21 août 2026 ──────────────────────
          « Où retrouver le bilan des revenus entamés et terminés ? » Nulle
          part : l'état ne se lisait qu'une ligne à la fois. Le voici d'un
          regard, et chaque état ouvre la liste de ceux qui le portent. */}
      <div className="trf-panel" style={{ marginTop: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <div className="mnd-eyebrow" style={{ marginBottom: 0 }}>Ce que ces revenus sont devenus</div>
          <span className="mnd-muted" style={{ fontSize: 11 }}>
            Les pourboires n’en sont pas, ils appartiennent à l’équipe.
          </span>
        </div>
        <div className="tr-cols" style={{ '--cols': '1fr 1fr 1fr', gap: 12, marginTop: 10, alignItems: 'stretch' } as CSSProperties}>
          {(['intact', 'entame', 'epuise'] as EtatRevenu[]).map((e) => {
            const b = bilanEtats[e];
            return (
              <button
                type="button"
                key={e}
                className={`trf-etat trf-etat--${e} ${etat === e ? 'is-on' : ''}`}
                aria-pressed={etat === e}
                title={etat === e ? 'Relâcher ce filtre' : `Ne voir que les revenus ${LIBELLE_ETAT[e].toLowerCase()}s`}
                onClick={() => setEtat((prev) => (prev === e ? null : e))}
              >
                <span className="trf-etat__nom">{LIBELLE_ETAT[e]}</span>
                <span className="trf-etat__n">{b.n} revenu{b.n > 1 ? 's' : ''}</span>
                <span className="trf-etat__somme">{fmtMoney(b.total, currency)}</span>
                {/* Sur un revenu entamé, le chiffre qui sert vraiment est ce
                    qu'il RESTE — c'est lui qu'on peut encore dépenser. */}
                {e === 'entame' && b.n > 0 && (
                  <span className="trf-etat__reste">dont {fmtMoney(b.reste, currency)} encore disponibles</span>
                )}
                {e === 'intact' && b.n > 0 && (
                  <span className="trf-etat__reste">rien n’y a encore été puisé</span>
                )}
                {e === 'epuise' && b.n > 0 && (
                  <span className="trf-etat__reste">entièrement dépensés</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Totaux du mois — par moyen puis par caisse. */}
      <div className="tr-cols" style={{ '--cols': '1fr 1fr', gap: 18, alignItems: 'start' } as CSSProperties}>
        <div className="trf-panel">
          <div className="mnd-eyebrow">Par moyen de règlement</div>
          {byMethod.length === 0 ? (
            <div className="trf-empty" style={{ marginTop: 12 }}>Rien d’encaissé en {monthTitle(month)}.</div>
          ) : (
            byMethod.map((m) => (
              <button
                type="button"
                className="trf-linerow trf-linerow--split trf-linerow--btn trf-click"
                key={m.k}
                aria-pressed={method === m.k}
                title={method === m.k ? 'Relâcher ce filtre' : `Ne voir que les entrées en ${m.k}`}
                onClick={() => setMethod((prev) => (prev === m.k ? null : m.k))}
              >
                <span>{m.k}<span className="mnd-muted"> · {m.n} entrée{m.n > 1 ? 's' : ''}</span></span>
                <span>{fmtMoney(m.total, currency)}</span>
              </button>
            ))
          )}
        </div>
        <div className="trf-panel">
          <div className="mnd-eyebrow">Par caisse</div>
          {byBox.length === 0 ? (
            <div className="trf-empty" style={{ marginTop: 12 }}>—</div>
          ) : (
            byBox.map((b) => (
              <button
                type="button"
                className="trf-linerow trf-linerow--split trf-linerow--btn trf-click"
                key={b.k}
                aria-pressed={box === b.k}
                title={box === b.k ? 'Relâcher ce filtre' : `Ne voir que les entrées de ${b.k}`}
                onClick={() => setBox((prev) => (prev === b.k ? null : b.k))}
              >
                <span>{b.k}<span className="mnd-muted"> · {b.n} entrée{b.n > 1 ? 's' : ''}</span></span>
                <span>{fmtMoney(b.total, currency)}</span>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="trc-toolbar" style={{ marginTop: 20 }}>
        <Segs<ReceiptKind | 'tous'>
          options={KINDS.map((k) => ({ value: k.k, label: k.l }))}
          value={kind}
          onChange={setKind}
        />
        {filtered && (
          <button
            type="button"
            className="trf-chip"
            onClick={() => { setMethod(null); setBox(null); }}
            title="Revenir à tout le mois"
          >
            {[method, box].filter(Boolean).join(' · ')} ✕
          </button>
        )}
        <div className="trc-searchwrap">
          <Search size={17} aria-hidden="true" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher une cliente, une référence…"
            aria-label="Rechercher un encaissement"
          />
        </div>
      </div>

      <div className="trf-panel" style={{ marginTop: 14 }}>
        <div className="trf-linerow trf-linerow--split trf-linerow--head">
          {/* Le filtre s'écrit EN MOTS dans l'en-tête : un registre restreint qui
              ne le dit pas se lit comme le registre entier — et l'export porte
              le même sous-ensemble. */}
          <span>
            {shown.length} encaissement{shown.length > 1 ? 's' : ''} · {monthTitle(month)}
            {method && ` · ${method}`}{box && ` · ${box}`}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
            {kind === 'pourboire' && monProfil?.role === 'souverain' && (
              <Button size="sm" variant="ghost" onClick={reconstruireLesParts}>
                Reconstruire les parts de l’équipe
              </Button>
            )}
            {fmtMoney(total, currency)}
          </span>
        </div>
        {shown.length === 0 ? (
          <div className="trf-empty" style={{ marginTop: 14 }}>
            Aucun encaissement ne répond à ce filtre.
          </div>
        ) : (
          shown.map((r) => (
            <div key={r.id}>
            <div
              className="trf-linerow trf-linerow--split trf-linerow--click"
              role="button"
              tabIndex={0}
              onClick={() => openSource(r)}
              onKeyDown={(e) => { if (e.key === 'Enter') openSource(r); }}
              title={r.invoiceId ? 'Ouvrir la facture' : r.apptId ? 'Ouvrir le carnet' : undefined}
            >
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3, minWidth: 0 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <b style={{ fontWeight: 'var(--weight-medium)' }}>{r.clientName}</b>
                  {(() => {
                    const cli = clients.find((c) => c.id === r.clientId);
                    return cli?.phone
                      ? <span onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex' }}>
                          <WaLien phone={cli.phone} message={`Bonjour ${cli.name.split(' ')[0]}, la Maison MND vous remercie pour votre règlement. À très bientôt !`} style={{ fontSize: 11, fontWeight: 600, color: 'var(--copper-700)' }} />
                        </span>
                      : null;
                  })()}
                  <span className="trc-src">{receiptKindLabel(r.kind)}</span>
                  {r.ref && <span className="mnd-muted" style={{ fontSize: 11 }}>{r.ref}</span>}
                  {(() => {
                    const e = etatDe(r);
                    if (!e) return null;
                    return (
                      <span className={`trf-pastille trf-pastille--${e}`}>
                        {LIBELLE_ETAT[e]}
                        {e === 'entame' ? ` · reste ${fmtMoney(resteDe(r), currency)}` : ''}
                      </span>
                    );
                  })()}
                </span>
                <span className="mnd-muted" style={{ fontSize: 11.5, textAlign: 'left' }}>
                  {frDay(r.date)} · {r.label} · {r.method}{r.cashbox ? ` · ${r.cashbox}` : ''}
                </span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 'none' }}>
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--color-indigo)' }}>
                  {fmtMoney(r.amountXof, currency)}
                </span>
                {/* CORRIGER SE FAIT D’OÙ L’ON VOIT — 22 août 2026, « je veux lui
                    changer de caisse ». Le registre est en lecture seule, et
                    c’est bien ainsi : la correction mène au compte, chez elle,
                    plutôt que de dupliquer ici la modale des avoirs. */}
                {r.kind === 'avoir' && (
                  <button
                    type="button"
                    className="trf-rowbtn"
                    onClick={(e) => { e.stopPropagation(); navigate(`/comptes?avoir=${r.id.replace('r-cre-', '')}`); }}
                    title="Corriger ce dépôt d’avoir, caisse, date, moyen"
                  >
                    Corriger
                  </button>
                )}
                <button
                  type="button"
                  className="trf-rowbtn"
                  onClick={(e) => { e.stopPropagation(); void printReceipt(r); }}
                  disabled={busy === r.id}
                  title="Éditer le reçu de cet encaissement"
                >
                  {busy === r.id ? '…' : 'Reçu'}
                </button>
                {/* SUPPRIMER. Ce registre ne se corrigeait que par la « zone
                    sensible » des Paramètres, qui annule TOUT : un essai y
                    emportait les vrais encaissements avec lui. */}
                <button
                  type="button"
                  className="trf-rowbtn"
                  onClick={(e) => { e.stopPropagation(); setAEffacer(r); }}
                  title="Supprimer cet encaissement"
                >
                  Supprimer
                </button>
              </span>
            </div>
            <AServi revenu={r} />
            </div>
          ))
        )}
      </div>

      {aEffacer && (
        <Modal title="Supprimer cet encaissement ?" onClose={() => setAEffacer(null)} width={440}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="mnd-muted" style={{ fontSize: 13, lineHeight: 1.7 }}>
              <b style={{ color: 'var(--color-indigo)' }}>{fmtMoney(aEffacer.amountXof, currency)}</b>
              {' · '}{receiptKindLabel(aEffacer.kind)}
              {' · '}{aEffacer.clientName}
              {aEffacer.cashbox ? ` · caisse « ${aEffacer.cashbox} »` : ''}
              <div style={{ marginTop: 4 }}>{aEffacer.label}</div>
            </div>

            {/* CE QUI PART, ET CE QUI RESTE. La ligne est calculée : on retire
                le versement de sa source, jamais la source elle-même. */}
            <div className="mnd-muted" style={{ fontSize: 12.5, lineHeight: 1.7 }}>
              {aEffacer.kind === 'facture' && 'Le versement s’en va, la facture reste : ce qui était encore dû redevient dû.'}
              {aEffacer.kind === 'pourboire' && 'Le pourboire et les parts déjà réparties à l’équipe s’en vont ensemble.'}
              {aEffacer.kind === 'acompte' && 'L’acompte se dépose, le rendez-vous demeure et redevient à régler.'}
              {aEffacer.kind === 'abonnement' && 'Le règlement s’en va, l’abonnement reste : son échéancier redevient dû.'}
              {aEffacer.kind === 'formation' && 'Le règlement s’en va, l’inscription reste.'}
              {aEffacer.kind === 'avoir' && 'Le dépôt s’en va, et le solde d’avoir de ce compte baisse d’autant.'}
              <b style={{ color: 'var(--ink)' }}> Ce geste ne se défait pas.</b>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <Button variant="ghost" style={{ flex: 1 }} onClick={() => setAEffacer(null)}>Le garder</Button>
              <Button variant="copper" onClick={() => effacer(aEffacer)}>Supprimer</Button>
            </div>
          </div>
        </Modal>
      )}

      <p className="mnd-muted" style={{ fontSize: 11.5, marginTop: 14, lineHeight: 1.6 }}>
        Un acompte figure au jour où il est reçu ; la facture qui le solde n’encaisse alors que le reste.
        Le pourboire a sa propre ligne, créditée à la caisse Pourboires, l’argent des mains, jamais celui
        de la facture. L’avoir n’est pas compté (c’est un crédit, pas des billets),
        d’où l’écart normal avec le chiffre d’affaires de la Synthèse.
      </p>
    </div>
  );
}
