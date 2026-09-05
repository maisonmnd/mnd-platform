import { asset } from '../../../../shared/asset';
import { useSearchParams } from 'react-router-dom';
import { CalendarClock, MapPin, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { OptionsPrestations, PageHead } from '../_ui';
import { Button, Select } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { maisonNom, maisonRaison, signeLeMessage, DEVISE_COMPLETE } from '../../../../shared/identite';
import { useServices } from '../../../../shared/catalog';
import { useClients, useFamilies } from '../../../../shared/clients';
import { payerClientIdOf } from '../../../../shared/accounts';
import { Avatar, ClientPicker, RdvModal, alignerFacturesDuRituel, frDay, tarifsDuRituel, useServicesById, type EcartDeConformite } from '../clients/_shared';
import { useModelBands, useBandSets } from '../../../../shared/pricing';
import { useCategories, useProducts } from '../../../../shared/catalog';
import { Modal, toast, Field, Input } from '../../../../ds/components';
import { rewindPaymentForDeletedInvoice } from '../clients/actions';
import { detacheLesVersementsDeLaPiece } from '../../../../shared/abonnements';
import { retirerPourboiresDesFactures, repointerPourboires } from '../../../../shared/tips';
import { adresseDe, lienPaiementMomo, paiementMomoDeLaMaison } from '../equipe/data';
import { filStore, nouveauMessage } from '../../../../shared/fil';
import { useAuth } from '../../../../shared/auth';
import { useSubscribers, usePlans, libellesInclus } from '../../../../shared/abonnements';
import { useStaff } from '../equipe/data';
import { coffreStore, useCashboxes, useInvoices, usePaymentMethods, invoiceTotal, ligneNetXof, invoiceReglements, invoiceRegleXof, invoiceResteXof, invoiceSoldee, type Invoice, type InvoiceLine, type PaymentMethod , nextInvoiceNumber, nouvelleFacture, ligneFacture, invoicesStore } from '../../../../shared/finance';
import { detailDuForfait } from '../../../../shared/kids';
import { appointmentsStore, useAppointments, type Appointment, estampilleLaPose } from '../../../../shared/agenda';
import { invoicePdf, summaryPdf, type InvoicePdfData } from '../../../../shared/pdf';
import { uid } from '../../../../shared/store';
import './vente.css';
import { retirerParReferences } from '../../../../shared/stock';
import { detacherFacture } from '../../../../shared/laboratoire';

/* Factures & devis — documents de marque à âme. Six thèmes émotionnels,
   remises par ligne et globale, conversion devis → facture, impression.
   Édition complète : chaque document se rouvre dans l’éditeur (création & modification
   partagent le même formulaire) ; l’enregistrement met à jour le document existant. */

/** Extrait « lat,lng » de la position GPS glissée dans la note d'un devis
   (« Position GPS : https://maps.google.com/?q=6.37,2.42 » — partagée par la cliente
   depuis Ma Couronne). Renvoie null si aucune position n'est présente. */
function geoDestFromNote(note?: string): string | null {
  if (!note) return null;
  const m = note.match(/[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  return m ? `${m[1]},${m[2]}` : null;
}

type ThemeKey = Invoice['theme'];

const THEMES: Record<ThemeKey, { amb: string; verse: string; paths: string[] }> = {
  Rose: { amb: 'Parfum de rose', verse: 'Ce qui prend le temps d’éclore\nen garde le parfum plus longtemps.', paths: ['M24 11c7 0 12 5 12 11 0 6-5 10-10 10s-9-4-9-8 3-7 7-7 6 3 6 6-2 4-4 4', 'M24 32v22', 'M24 43c-5 0-9-3-10-8', 'M24 48c5 0 9-3 10-8'] },
  Arbre: { amb: 'Force tranquille', verse: 'Vos racines tiennent\nce que vos pointes promettent.', paths: ['M24 55V30', 'M24 36l-7-6', 'M24 41l7-6', 'M24 22m-13 0a13 13 0 1 0 26 0a13 13 0 1 0 -26 0'] },
  Oiseau: { amb: 'Élan léger', verse: 'On ne couronne pas la hâte.\nOn couronne la constance.', paths: ['M5 32c8-10 12-10 19 0', 'M24 32c8-10 12-10 19 0', 'M22 33l2 4 2-4'] },
  Voyage: { amb: 'Horizon ouvert', verse: 'Chaque retour ici\nest un pas de plus sur votre chemin.', paths: ['M5 44h38', 'M24 30m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0', 'M11 55c6-6 20-6 26 0'] },
  Aube: { amb: 'Lumière naissante', verse: 'La beauté n’est pas un instant, \nc’est une habitude que l’on honore.', paths: ['M7 47h34', 'M13 47a11 11 0 0 1 22 0', 'M24 28v-7', 'M37 35l5-5', 'M11 35l-5-5', 'M24 47v9'] },
  Souffle: { amb: 'Calme profond', verse: 'Respirez.\nVotre couronne se bâtit, mèche après mèche.', paths: ['M24 41c-12 0-18-9-18-9s6-9 18-9 18 9 18 9-6 9-18 9z', 'M24 32m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0'] },
};

function Motif({ theme, size, color }: { theme: ThemeKey; size: number; color: string }) {
  return (
    <svg width={size} height={Math.round(size * 1.18)} viewBox="0 0 48 64" fill="none" stroke={color} strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round">
      {THEMES[theme].paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

const DISC_OPTIONS = [0, 5, 10, 15, 20, 25, 30];
const STATUSES: Invoice['status'][] = ['brouillon', 'envoyée', 'payée', 'acceptée'];

const fmtDateFr = (iso: string) => {
  const d = new Date(iso + 'T00:00:00');
  const s = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  return s.replace(/^1 /, '1ᵉʳ ');
};

/** Aplati pour la recherche : sans casse, sans accent — « Aicha » doit trouver « Aïcha ». */
const fold = (s?: string) =>
  (s ?? '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

/** Colonnes de la feuille — proportions du Carnet. */
const GRID = '92px 1fr 1.2fr 1fr 0.9fr 128px';

/* ── LE REGISTRE SE RANGE PAR MOIS ─────────────────────────────────
   Une liste de plusieurs centaines de pièces sans repère oblige à lire chaque
   date pour savoir où l'on est. Les documents arrivent déjà triés du plus
   récent au plus ancien : il suffit d'ouvrir un intertitre quand le mois
   change, et d'y porter le compte et le total du mois.

   La clé est le préfixe ISO `YYYY-MM` — pas un objet Date. Un mois construit
   par `new Date(iso)` bascule d'un jour selon le fuseau, et le 1ᵉʳ août
   tomberait en juillet pour les pièces du matin. */
const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const moisCle = (iso: string) => (iso ?? '').slice(0, 7);
const moisLabel = (cle: string) => {
  const [an, m] = cle.split('-');
  return `${MOIS_FR[Number(m) - 1] ?? cle} ${an}`;
};

type EditState = { mode: 'new' | 'edit'; draft: Invoice };

export default function Factures() {
  const { branch, currency } = useBranch();
  const [invoices, setInvoices] = useInvoices();
  const [clients] = useClients();
  /* LA PAYEUSE DU FOYER, pour le lien commun : c'est elle qui règle. */
  const [families] = useFamilies();
  const [services] = useServices();
  /* ══ CE QUE PORTE UNE LIGNE D'ABONNEMENT — 1er septembre 2026 ══════
     Les pièces écrites À PARTIR D'AUJOURD'HUI portent leur contenu (`detail`).
     Celles d'AVANT ne portent rien : la facture de septembre existait déjà
     quand la demande est arrivée, et la laisser muette aurait réglé le problème
     pour les factures futures seulement — c'est-à-dire pour personne dans
     l'immédiat. On retrouve donc leur contenu par l'abonnement qui les a fait
     naître, faute de mieux, et jamais à la place de ce qui est écrit. */
  const [abonnes] = useSubscribers();
  const [formules] = usePlans();
  const nomDuService = (id: string) => services.find((sv) => sv.id === id)?.name ?? 'Prestation retirée';
  const contenuDeLaLigne = (piece: Invoice, l: InvoiceLine): string[] => {
    if (l.detail?.length) return l.detail;
    /* UN FORFAIT ÉMIS AVANT LE 4 SEPTEMBRE NE PORTE RIEN. On retrouve son
       contenu par la prestation qui porte le même nom, faute de mieux, et
       jamais à la place de ce qui est écrit. */
    const forfait = services.find((sv) => sv.name === l.label && (sv.includes?.length ?? 0) > 0);
    if (forfait) return detailDuForfait(forfait, services, (x) => fmtMoney(x, currency));
    const abo = abonnes.find((a) => a.invoiceId === piece.id);
    if (!abo || piece.lines.length !== 1) return [];
    return libellesInclus(abo, formules.find((f) => f.id === abo.planId), nomDuService);
  };
  const [methods] = usePaymentMethods();

  const [statusFilter, setStatusFilter] = useState<'tous' | Invoice['status']>('tous');
  /* Le mois choisi, ou « tous ». Il coupe le registre avant le rangement :
     choisir août ne laisse qu'août, et le total en tête devient celui d'août. */
  const [moisFilter, setMoisFilter] = useState('tous');
  /* Recherche — une cliente, un numéro. La maison cherche « Aïcha » sans accent
     ni majuscule : on compare des chaînes aplaties, sinon « Aicha » ne trouve rien. */
  const [q, setQ] = useState('');
  /* `?id=` ouvre une facture précise depuis ailleurs — Tableau de bord, Analytics,
     mouvements d'une caisse, la recherche globale (Trouver). On réagit au
     CHANGEMENT du paramètre, jamais à chaque rendu : les clics de la liste
     gardent la main, et chercher une pièce QUAND ON EST DÉJÀ ICI l'ouvre
     aussi — la lecture unique à l'état initial l'ignorait. */
  const [params] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(() => params.get('id'));
  useEffect(() => {
    const pid = params.get('id');
    if (pid) setSelectedId(pid);
  }, [params]);
  const [payChoice, setPayChoice] = useState<PaymentMethod>('MTN MoMo');
  const [freeLabel, setFreeLabel] = useState('');
  const [freeAmount, setFreeAmount] = useState('');
  const [editing, setEditing] = useState<EditState | null>(null);
  const [waHint, setWaHint] = useState<string | null>(null);
  /* Sélection multiple — cocher des documents pour les supprimer d'un geste. */

  const branchDocs = useMemo(
    () => invoices.filter((i) => i.branchId === branch.id).sort((a, b) => b.date.localeCompare(a.date)),
    [invoices, branch.id],
  );
  /* Les mois où la maison a réellement écrit quelque chose — pas une plage de
     douze mois dont dix seraient vides. Les documents sont déjà triés du plus
     récent au plus ancien, l'ordre des clés suit donc tout seul. */
  const moisDisponibles = useMemo(() => {
    const vus: string[] = [];
    branchDocs.forEach((d) => {
      const cle = moisCle(d.date);
      if (cle && !vus.includes(cle)) vus.push(cle);
    });
    return vus;
  }, [branchDocs]);

  const filtered = branchDocs
    .filter((d) => statusFilter === 'tous' || d.status === statusFilter)
    .filter((d) => moisFilter === 'tous' || moisCle(d.date) === moisFilter)
    .filter((d) => {
      const needle = fold(q);
      if (!needle) return true;
      const c = clients.find((x) => x.id === d.clientId);
      return [d.number, c?.name, d.clientName, c?.phone].some((v) => fold(v).includes(needle));
    });
  /* Les factures d'abord, les devis en dessous — deux registres, une seule feuille. */
  const factures = filtered.filter((d) => d.kind === 'facture');
  const devis = filtered.filter((d) => d.kind === 'devis');

  /* AUCUN document par défaut : on arrive sur le registre nu. Un repli sur la
     première facture affichait un document que personne n'avait demandé, et
     poussait la liste vers le bas dès l'ouverture de l'écran. Un document ne
     s'ouvre que sur un geste — un clic, ou une arrivée par `?id=`. */
  const selected = selectedId ? branchDocs.find((d) => d.id === selectedId) ?? null : null;

  /* Document affiché dans l’aperçu vivant : le brouillon en cours d’édition, sinon la sélection. */
  const active = editing ? editing.draft : selected;

  /* Position GPS partagée par la cliente (livraison Ma Couronne) — ouvre l'itinéraire. */
  const geoDest = selected ? geoDestFromNote(selected.note) : null;

  /* ── LE RITUEL DERRIÈRE LA PIÈCE ────────────────────────────────
     Le lien se lit des DEUX CÔTÉS, jamais d'un seul : la pièce mémorise son
     rendez-vous (`apptId`, posé quand un devis est accepté), et le rendez-vous
     mémorise sa dernière facture (`invoiceId`, posé à l'encaissement). Une
     facture née par le second chemin — le cas courant au comptoir — n'a PAS
     d'`apptId` : ne lire que celui-là la laisserait orpheline, et c'est
     exactement le défaut qui rendait l'alignement aveugle en août. */
  const [appointments] = useAppointments();
  const rituelDe = (d: Invoice | null | undefined): Appointment | null => {
    if (!d) return null;
    if (d.apptId) {
      const parLaPiece = appointments.find((a) => a.id === d.apptId);
      if (parLaPiece) return parLaPiece;
    }
    return appointments.find((a) => a.invoiceId === d.id) ?? null;
  };
  const rituelLie = rituelDe(selected);

  /* On retient l'IDENTIFIANT, pas l'objet : après un enregistrement dans la
     modale, l'objet capturé serait périmé et la fiche rouvrirait sur l'état
     d'avant. On le relit dans le magasin à chaque rendu. */
  const [rdvOuvertId, setRdvOuvertId] = useState<string | null>(null);
  const rdvOuvert = rdvOuvertId ? appointments.find((a) => a.id === rdvOuvertId) ?? null : null;

  /* ── LE JOUR DU PASSAGE N'EST PAS LA DATE DE LA PIÈCE ───────────
     Une pièce porte DEUX dates, et elles ne coïncident que par hasard. La
     sienne est comptable : elle range la facture dans son mois et date
     l'argent. Celle de la VENUE appartient au rendez-vous — c'est le jour où
     la cliente est venue.

     Une facture éditée le 17 pour un rituel du 13 écrivait « votre passage ·
     17 août » : une phrase fausse, adressée à quelqu'un qui sait très bien
     quand elle est venue. On lit donc le rituel quand il existe, et on ne
     retombe sur la date de la pièce que faute de mieux. La date comptable,
     elle, ne bouge pas — la déplacer changerait le mois du chiffre. */
  const jourDuPassage = (d: Invoice) => rituelDe(d)?.date ?? d.date;

  /* ── METTRE UNE PIÈCE AU COFFRE ─────────────────────────────────
     « Dans factures et devis je peux envoyer des montants directement au
     coffre ? » (Yéman, 17 août) — et, sur la façon de compter : « le coffre
     comme caisse ».

     L'argent SE DÉPLACE, il ne se duplique pas : le dépôt nomme la caisse d'où
     il sort, et cette caisse baisse d'autant. Sans ce lien, les mêmes francs
     vivraient dans le tiroir et dans le coffre, et chaque écran dirait vrai
     séparément — l'erreur qu'on ne voit jamais.

     On propose ce qui a été REÇU sur la pièce, et la caisse de son premier
     versement : neuf fois sur dix c'est ce qu'on met de côté, et le reste se
     corrige d'un champ. */
  /* Le jour local — jamais `toISOString()`, qui bascule d'un jour selon le
     fuseau et daterait un dépôt de la veille. */
  const jourLocalIso = () => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  };
  const [caisses] = useCashboxes();
  const boxesBranche = caisses.filter((c) => c.branchId === branch.id);
  /* ── DEMANDER QU'ON S'EN OCCUPE — 18 août 2026 ──────────────────
     La porte qui compte le plus, et celle qu'on oublie de construire : on ne
     pense pas « j'ouvre le fil », on est DEVANT une facture et l'on veut que
     quelqu'un s'en charge. La demande naît donc ici, déjà accompagnée de sa
     pièce, et va se poser dans Le Fil. */
  const { session: maSession } = useAuth();
  const [equipeFil] = useStaff();
  const monMailFil = (maSession?.user?.email ?? '').trim().toLowerCase();
  const monNomFil = equipeFil.find((m) => (m.email ?? '').trim().toLowerCase() === monMailFil)?.name
    || monMailFil.split('@')[0] || 'La maison';
  const [demandePour, setDemandePour] = useState<Invoice | null>(null);
  const [demandeQui, setDemandeQui] = useState('');
  const [demandeQuoi, setDemandeQuoi] = useState('');
  const envoyerLaDemande = () => {
    if (!demandePour) return;
    const dest = equipeFil.find((m) => m.id === demandeQui);
    if (!dest) return;
    const reste = invoiceResteXof(demandePour);
    filStore.set((prev) => [...prev, nouveauMessage({
      branchId: branch.id,
      canal: 'maison',
      auteurMail: monMailFil,
      auteurNom: monNomFil,
      texte: demandeQuoi.trim() || `Traiter la facture ${demandePour.number}.`,
      piece: {
        kind: 'facture',
        id: demandePour.id,
        label: `${demandePour.number} · ${demandePour.clientName ?? clientOf(demandePour)?.name ?? 'Cliente'} · ${fmtMoney(invoiceTotal(demandePour), currency)}${reste > 0 ? ` · reste ${fmtMoney(reste, currency)}` : ''}`,
      },
      demandePour: adresseDe(dest),
      demandePourNom: dest.name,
      argent: true,
    })]);
    toast(`Demande adressée à ${dest.name}, elle se fermera quand la facture sera réglée.`);
    setDemandePour(null); setDemandeQui(''); setDemandeQuoi('');
  };

  const [auCoffre, setAuCoffre] = useState<Invoice | null>(null);
  const [coffreMontant, setCoffreMontant] = useState('');
  const [coffreCaisse, setCoffreCaisse] = useState('');
  const ouvrirLeCoffre = (d: Invoice) => {
    setCoffreMontant(String(invoiceRegleXof(d)));
    setCoffreCaisse(invoiceReglements(d).find((p) => p.cashbox)?.cashbox ?? boxesBranche[0]?.name ?? '');
    setAuCoffre(d);
  };
  const verserAuCoffre = () => {
    if (!auCoffre) return;
    const montant = Math.max(0, Math.round(Number(coffreMontant.replace(/[^\d]/g, '')) || 0));
    if (montant <= 0) return;
    coffreStore.set((prev) => [...prev, {
      id: uid(), branchId: branch.id, kind: 'depot', amountXof: montant, date: jourLocalIso(),
      clientId: auCoffre.clientId || undefined,
      clientName: auCoffre.clientName ?? clientOf(auCoffre)?.name,
      cashbox: coffreCaisse || undefined,
      note: `Facture ${auCoffre.number}`,
    }]);
    toast(`${fmtMoney(montant, currency)} au coffre${coffreCaisse ? `, sortis de ${coffreCaisse}` : ''}.`);
    setAuCoffre(null);
  };

  /* ── LA CONFORMITÉ AU RITUEL ────────────────────────────────────
     Des pièces portent des lignes VENTILÉES AU PRORATA du total au lieu du
     prix de chaque geste — 26 597 / 24 179 / 30 224 pour un rituel qui vaut
     28 000 / 28 000 / 25 000. Le total est juste, la ventilation ne l'est pas,
     et la facture ne ressemble plus au rendez-vous qu'elle atteste.

     La cause est corrigée à la source (la caisse ignorait la longueur figée du
     rituel), mais les pièces déjà émises gardent leurs lignes. On les répare
     avec LA MÊME mécanique qui les aligne quand on réenregistre un rituel —
     jamais une seconde règle écrite pour l'occasion, qui divergerait à son
     tour. Elle simule d'abord : on montre, puis on écrit.

     LA RÈGLE D'OR TIENT : une pièce PAYÉE garde son total au franc près, seules
     ses lignes se reconforment (l'écart part en remise ou en ajustement). Une
     pièce non payée se réécrit entièrement — elle ne réclamait pas ce qui est dû. */
  const [bands] = useModelBands();
  const [sets] = useBandSets();
  const [cats] = useCategories();
  const [produits] = useProducts();
  const byId = useServicesById();
  const [ecarts, setEcarts] = useState<EcartDeConformite[] | null>(null);
  /* ══ UN SEUL LIEN POUR TOUT LE FOYER — 3 septembre 2026 ════════════
     « Je voudrais émettre un lien de paiement unique pour le foyer. Les RDV du
     8 et du 9 septembre. Total 75 000 F en un lien de paiement » (Yéman).

     UNE MÈRE NE PAIE PAS TROIS FOIS. Le lien se posait par PIÈCE : trois têtes
     d'un même foyer venues le même week-end faisaient trois messages, trois
     codes à composer, trois fois la même conversation. Et rien ne disait à la
     payeuse que les trois allaient ensemble.

     LE LIEN NE FAIT QU'UNE CHOSE : il porte un montant. C'est donc à l'écran de
     dire ce que ce montant couvre, pièce par pièce, dans le message. */
  const [lienFoyer, setLienFoyer] = useState<{ pieces: Invoice[]; prises: string[] } | null>(null);
  /* ══ UN LIEN POUR UN MONTANT, SANS PIÈCE DERRIÈRE — 4 septembre 2026 ═
     « Pose un endroit où taper simplement 45 000 et obtenir un lien, et
     l'envoi WhatsApp d'un geste » (Yéman).

     TOUS LES LIENS DE LA MAISON PENDAIENT À UN DOCUMENT : une facture, un
     rituel, un foyer. C'est juste neuf fois sur dix, et infirme la dixième :
     un acompte convenu au téléphone, un flacon qu'on met de côté, une avance
     avant la pose. Il fallait fabriquer une pièce pour rien, ou dicter le code
     à composer par message.

     IL RÉCLAME, IL N'ENCAISSE PAS, et rien ici ne le rattache à quoi que ce
     soit : c'est pourquoi l'écran le DIT, et rappelle que l'argent arrivé se
     pointe à la main. Un lien qui laisserait croire à une trace serait pire
     que pas de lien du tout. */
  const [lienLibre, setLienLibre] = useState<
    { montant: string; clientId: string; tel: string; motif: string } | null
  >(null);
  const [scanEnCours, setScanEnCours] = useState(false);

  /* LES PIÈCES DU FOYER QUI RÉCLAMENT ENCORE. Toutes les têtes rattachées au
     même compte, la payeuse comprise, et seulement ce qui n'est pas soldé : on
     ne redemande pas ce qui est déjà entré. */
  const piecesDuFoyer = (inv: Invoice): Invoice[] => {
    const tete = clients.find((c) => c.id === inv.clientId);
    if (!tete?.familyId) return [];
    const membres = new Set(clients.filter((c) => c.familyId === tete.familyId && !c.archived).map((c) => c.id));
    return invoices
      .filter((i) => i.branchId === branch.id && i.kind === 'facture'
        && !!i.clientId && membres.has(i.clientId) && invoiceResteXof(i) > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
  };

  const parcourirLesRituels = (simuler: boolean): EcartDeConformite[] => {
    const trouves: EcartDeConformite[] = [];
    for (const a of appointments) {
      if (a.branchId !== branch.id) continue;
      const t = tarifsDuRituel(a, {
        client: clients.find((c) => c.id === a.clientId),
        bands, sets, cats, byId,
        tousServices: services,
        produits,
      });
      if (t.chosen.length === 0) continue;
      trouves.push(...alignerFacturesDuRituel(a, byId, t.prixPlein, produits, t.gesteDe, { simuler, argent: (x) => fmtMoney(x, currency) }));
    }
    return trouves;
  };

  /* ── FUSIONNER LES PIÈCES D'UN MÊME RITUEL ──────────────────────
     Avant le journal des versements, chaque règlement partiel ouvrait SA
     facture : Hermine a deux pièces du 12 août, 30 000 en espèces et 51 000 en
     Mobile Money, chacune réduite à un bloc « Règlement · A + B + C ».

     On les rassemble sur la PLUS ANCIENNE — c'est elle que la cliente a reçue
     en premier, et un numéro déjà remis ne se réattribue pas. La pièce
     survivante prend les lignes du rituel, détaillées, et le journal reçoit
     tous les versements des pièces fondues, chacun avec sa date et son moyen.

     L'INVARIANT : la somme reçue ne bouge pas d'un franc. L'aperçu le montre
     colonne contre colonne, et c'est le seul chiffre qui interdit d'appliquer
     s'il diffère. */
  type FusionProposee = {
    apptId: string;
    garde: Invoice;
    fondues: Invoice[];
    apres: Invoice;
    recuAvant: number;
    recuApres: number;
  };
  const [fusions, setFusions] = useState<FusionProposee[] | null>(null);

  const chercherLesFusions = (): FusionProposee[] => {
    const parRituel = new Map<string, Invoice[]>();
    for (const i of invoices) {
      if (i.branchId !== branch.id || i.kind !== 'facture') continue;
      const r = rituelDe(i);
      if (!r) continue;
      parRituel.set(r.id, [...(parRituel.get(r.id) ?? []), i]);
    }
    const out: FusionProposee[] = [];
    for (const [apptId, pieces] of parRituel) {
      if (pieces.length < 2) continue;
      const a = appointments.find((x) => x.id === apptId);
      if (!a) continue;
      /* La plus ancienne d'abord — par date, puis par numéro à date égale. */
      const ordre = [...pieces].sort((x, y) => x.date.localeCompare(y.date) || x.number.localeCompare(y.number));
      const garde = ordre[0];
      const fondues = ordre.slice(1);
      const t = tarifsDuRituel(a, {
        client: clients.find((c) => c.id === a.clientId),
        bands, sets, cats, byId, tousServices: services, produits,
      });
      const lignes = t.chosen.map((sv) => ({
        id: `il-${uid()}`, label: sv.name, qty: 1,
        unitXof: t.prixPlein(sv), discountPct: t.gesteDe(sv),
      }));
      const journal = ordre.flatMap((p) => invoiceReglements(p));
      const recuAvant = ordre.reduce((s, p) => s + invoiceRegleXof(p), 0);
      const brut = lignes.reduce((s, l) => s + l.unitXof * (1 - l.discountPct / 100), 0);
      const apresBase: Invoice = {
        ...garde,
        lines: lignes.length > 0 ? lignes : garde.lines,
        globalDiscountPct: 0,
        /* Le rituel ne peut pas valoir moins que ce qui a été encaissé : si
           l'écart penchait dans ce sens, la remise effacerait de l'argent
           réellement reçu. On ne remise donc que le surplus. */
        globalDiscountXof: brut > recuAvant ? Math.round(brut - recuAvant) : undefined,
        payments: journal,
        payment: journal[0]?.method ?? garde.payment,
        cashbox: journal[0]?.cashbox ?? garde.cashbox,
        note: [garde.note, ...fondues.map((f) => f.note)].filter(Boolean).join(' · ') || undefined,
        apptId,
      };
      const apres: Invoice = { ...apresBase, status: invoiceSoldee(apresBase) ? 'payée' : 'envoyée' };
      out.push({ apptId, garde, fondues, apres, recuAvant, recuApres: invoiceRegleXof(apres) });
    }
    return out;
  };

  const appliquerLesFusions = () => {
    const liste = fusions ?? [];
    if (liste.length === 0) { setFusions(null); return; }
    const aSupprimer = new Set(liste.flatMap((f) => f.fondues.map((x) => x.id)));
    /* Le pourboire SUIT la pièce survivante — il ne meurt pas avec la pièce
       fondue : l'argent a bien été remis, seule la pièce change de nom. */
    for (const fu of liste) repointerPourboires(fu.fondues.map((x) => x.id), fu.apres.id);
    const remplacees = new Map(liste.map((f) => [f.garde.id, f.apres]));
    setInvoices((prev) => prev
      .filter((i) => !aSupprimer.has(i.id))
      .map((i) => remplacees.get(i.id) ?? i));
    /* Le rituel doit pointer la pièce SURVIVANTE — sinon le carnet mènerait à
       une facture qui n'existe plus, et l'alignement la chercherait en vain. */
    appointmentsStore.set((prev) => prev.map((a) => {
      const f = liste.find((x) => x.apptId === a.id);
      if (!f) return a;
      return {
        ...a,
        invoiceId: f.apres.id,
        payments: (a.payments ?? []).map((p) => (p.invoiceId && aSupprimer.has(p.invoiceId)
          ? { ...p, invoiceId: f.apres.id } : p)),
      };
    }));
    const n = liste.reduce((s, f) => s + f.fondues.length, 0);
    setFusions(null);
    toast(`${liste.length} rituel${liste.length > 1 ? 's' : ''} rassemblé${liste.length > 1 ? 's' : ''}, ${n} pièce${n > 1 ? 's' : ''} fondue${n > 1 ? 's' : ''}.`);
  };

  const ouvrirLaConformite = () => {
    setScanEnCours(true);
    /* Le parcours est synchrone : on laisse le rendu poser l'état d'attente
       avant de bloquer le fil, sinon le bouton reste muet sur 400 rituels. */
    setTimeout(() => {
      setEcarts(parcourirLesRituels(true));
      setScanEnCours(false);
    }, 0);
  };

  const appliquerLaConformite = () => {
    const faits = parcourirLesRituels(false);
    setEcarts(null);
    toast(faits.length > 0
      ? `${faits.length} pièce${faits.length > 1 ? 's' : ''} reconformée${faits.length > 1 ? 's' : ''} au rituel.`
      : 'Rien à reconformer.');
  };

  /* Écrit le document sélectionné (déjà enregistré) dans le magasin. */
  const patchSelected = (patch: Partial<Invoice>) => {
    if (!selected) return;
    setInvoices((prev) => prev.map((i) => (i.id === selected.id ? { ...i, ...patch } : i)));
    if (patch.status === 'acceptée' && selected.kind === 'devis' && !selected.apptId) {
      convertDevisToAppt({ ...selected, ...patch });
    }
  };
  /* Écrit le brouillon local en cours d’édition (rien n’est enregistré avant « Enregistrer »). */
  const patchDraft = (patch: Partial<Invoice>) =>
    setEditing((e) => (e ? { ...e, draft: { ...e.draft, ...patch } } : e));

  /* Devis accepté → rendez-vous dans le Carnet. Les lignes dont le libellé correspond
     à une prestation du catalogue deviennent les services du RDV (qté comprise) ; il
     est posé à un créneau par défaut (aujourd’hui 09:00, « en attente » à planifier).
     Idempotent : le devis mémorise l’apptId créé, on ne convertit jamais deux fois. */
  const convertDevisToAppt = (devis: Invoice) => {
    if (!devis.clientId) { setWaHint('Rattachez une cliente au devis pour créer le rendez-vous.'); return; }
    const svcIds: string[] = [];
    devis.lines.forEach((l) => {
      const svc = services.find((s) => s.name === l.label);
      if (svc) for (let n = 0; n < Math.max(1, l.qty); n++) svcIds.push(svc.id);
    });
    const t = new Date();
    const todayIso = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    const appt: Appointment = {
      id: `apt-${uid()}`,
      branchId: devis.branchId || branch.id,
      clientId: devis.clientId,
      clientName: devis.clientName ?? clientOf(devis)?.name,
      serviceIds: svcIds,
      date: todayIso,
      time: '09:00',
      master: devis.master ?? branch.masters[0] ?? '',
      status: 'en attente',
      discountPct: devis.globalDiscountPct || undefined,
      discountXof: devis.globalDiscountXof || undefined, // la remise en CFA suit le devis
      note: `Devis ${devis.number} accepté, à planifier${svcIds.length === 0 ? ' (prestations à préciser)' : ''}.`,
      source: 'trone',
    };
    appointmentsStore.set((prev) => [...prev, estampilleLaPose(appt)]);
    setInvoices((prev) => prev.map((i) => (i.id === devis.id ? { ...i, apptId: appt.id } : i)));
    setWaHint('Devis accepté → rendez-vous créé dans le Carnet. Planifiez le créneau, puis finalisez le paiement.');
  };

  /* ── LA TÊTE SOIGNÉE ET CELLE QUI RÈGLE — 28 août 2026 ─────────────
     « Comment garder le nom des enfants sur la facture mais dire que c'est
     Merine le parent qui paye ? Sinon cela sème la confusion : le parent
     oublie si le service lui appartient » (Yéman).

     La pièce nommait la PAYEUSE (`clientId`) et perdait la tête servie : la
     mère lisait son propre nom sur le rituel de sa fille, et ne savait plus à
     qui la couronne appartenait. `forClientId` porte la tête réellement
     soignée depuis toujours — il n'était simplement affiché nulle part.

     LA FACTURE NOMME LA TÊTE SOIGNÉE. La payeuse se dit dessous, en petit :
     deux noms, deux rôles. Le reçu, lui, garde la payeuse en tête — c'est
     d'elle que l'argent est venu. */
  const payeurDe = (d: Invoice) => clients.find((c) => c.id === d.clientId);
  const clientOf = (d: Invoice) => clients.find((c) => c.id === (d.forClientId ?? d.clientId));
  const clientNameOf = (d: Invoice) => clientOf(d)?.name ?? d.clientName ?? 'Walk-in';
  const prenomOf = (d: Invoice) => clientNameOf(d).split(' ')[0];
  /** Le nom de la payeuse, seulement quand ce n'est pas la tête soignée. */
  const payeurAutreQue = (d: Invoice): string | undefined => {
    if (!d.forClientId || d.forClientId === d.clientId) return undefined;
    return payeurDe(d)?.name;
  };

  /* Nom pour le PDF — la cliente au CRM, sinon un nom libre, sinon « Cliente de passage ». */
  const clientNameForPdf = (d: Invoice) => {
    const c = clientOf(d);
    if (c) return c.name;
    const n = d.clientName?.trim();
    return n && n.toLowerCase() !== 'walk-in' ? n : 'Cliente de passage';
  };

  /* Le mot du Maître par défaut, pour un document donné. */
  const defaultNoteFor = (d: Invoice) =>
    `${prenomOf(d)}, ce fut un honneur de veiller sur votre couronne. Elle vous va à merveille.\n${d.master ?? branch.masters[0] ?? 'la Maison'}`;

  /* Construit les données du vrai PDF de marque à partir d'un document. */
  const buildPdfData = (d: Invoice): InvoicePdfData => {
    const gross = d.lines.reduce((s, l) => s + l.qty * l.unitXof, 0);
    const net = invoiceTotal(d);
    const disc = gross - net;
    return {
      kind: d.kind,
      number: d.number,
      houseName: branch.name,
      houseSub: branch.city ? `${branch.city} · l'art de la couronne` : undefined,
      date: fmtDateFr(d.date),
      clientName: clientNameForPdf(d),
      ...(payeurAutreQue(d) ? { payeurName: payeurAutreQue(d) } : {}),
      clientPhone: clientOf(d)?.phone,
      master: d.master,
      /* DE QUOI PAYER — seulement s'il reste à régler : une facture soldée
         n'invite pas à payer. Un devis non plus : rien n'est dû avant l'accord.
         Le QR porte l'identifiant marchand MoMo (celui de l'affiche du comptoir,
         que l'app reconnaît), le code à composer porte le montant. */
      momo: d.kind === 'facture' && invoiceResteXof(d) > 0
        ? paiementMomoDeLaMaison(invoiceResteXof(d))
        : undefined,
      /* Le papier dit QUAND, pas seulement COMMENT — un versement par ligne,
         avec sa date et sa part. */
      reglements: invoiceReglements(d)
        .filter((p) => p.amountXof > 0)
        .map((p) => ({
          date: fmtDateFr(p.date),
          /* Le versement en devise se dit sur le papier aussi — la cliente
             doit retrouver les billets qu'elle a tendus. */
          method: p.fx
            ? `${p.method} · ${p.fx.amount.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${p.fx.code} reçus (1 ${p.fx.code} = ${p.fx.rate} ${currency})`
            : p.method,
          amount: fmtMoney(p.amountXof, currency),
        })),
      lines: d.lines.map((l) => {
        /* LE GESTE SE DIT SUR LE PAPIER AUSSI (16 août) : la pièce écran
           montrait « remise −100 % », le PDF affichait un 0 F sans raison.
           Un cadeau qu'on ne voit pas n'est pas reçu. 18 août : même dette
           pour la remise en FRANCS — le PDF l'ignorait jusque dans le calcul
           de la ligne. */
        const remise = [
          l.discountPct > 0 ? `−${l.discountPct} %` : '',
          (l.discountXof ?? 0) > 0 ? `−${fmtMoney(l.discountXof!, currency)}` : '',
        ].filter(Boolean).join(' puis ');
        const contenu = contenuDeLaLigne(d, l);
        return {
          label: remise ? `${l.label} · remise ${remise}` : l.label,
          qty: l.qty,
          unit: fmtMoney(l.unitXof, currency),
          total: fmtMoney(ligneNetXof(l), currency),
          /* LE PDF EST LA PIÈCE QU'ELLE GARDE — c'est celui-là, pas l'écran,
             qu'elle ressortira dans six mois. */
          ...(contenu.length > 0 ? { detail: contenu } : {}),
        };
      }),
      subtotal: fmtMoney(Math.round(gross), currency),
      discount: disc > 0 ? `− ${fmtMoney(Math.round(disc), currency)}` : undefined,
      total: fmtMoney(net, currency),
      /* Le pourboire remis avec le règlement — hors total, il appartient aux
         mains. La pièce doit dire TOUT ce que la cliente a tendu. */
      tip: (d.tipXof ?? 0) > 0 ? fmtMoney(d.tipXof!, currency) : undefined,
      /* Le PDF porte la devise reçue et son taux — c'est la pièce que la cliente
         garde ; elle doit y retrouver ce qu'elle a tendu. */
      payment: d.fx
        ? `${d.payment} · ${d.fx.amount.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${d.fx.code} (1 ${d.fx.code} = ${d.fx.rate} ${currency})`
        : d.payment,
      status: d.status,
      note: d.note?.trim() || defaultNoteFor(d),
    };
  };

  /* Génère & télécharge le vrai PDF du document sélectionné. */
  const downloadPdf = async () => {
    if (!selected) return;
    await invoicePdf(buildPdfData(selected));
    setWaHint('PDF téléchargé.');
  };

  const branchClients = clients.filter((c) => c.branchId === branch.id && !c.archived);

  /* UN SEUL ALGORITHME DE NUMEROTATION POUR TOUTE LA MAISON. Celui qui vivait
     ici etait l'ancien : aucun controle d'unicite, un socle arbitraire a 1042
     qui creusait mille numeros de trou dans une serie neuve, et un slice(-4)
     qui cassait au-dela de 9999 (« MND-2026-10000 » redonnait 0, donc un numero
     deja remis a une cliente). `nextInvoiceNumber` tient un compteur par serie
     et saute les numeros deja pris. */
  /* Ne sert plus qu'à RENUMÉROTER une pièce existante (devis → facture) — la
     création passe par `nouvelleFacture`. Le magasin en direct, jamais une
     liste de rendu qui peut dater. */
  const nextNumber = (kind: Invoice['kind']) =>
    nextInvoiceNumber(invoicesStore.get(), kind === 'devis' ? 'MND-D' : 'MND');

  const blankDraft = (kind: Invoice['kind']): Invoice =>
    nouvelleFacture({
      branchId: branch.id,
      serie: kind === 'devis' ? 'MND-D' : 'MND',
      status: 'brouillon',
      /* AUCUNE TÊTE PAR DÉFAUT — 2 septembre 2026. La première cliente du
         registre se posait toute seule sur chaque devis et chaque facture
         neuve : il suffisait d'oublier de la changer pour facturer une autre,
         et le document avait l'air rempli correctement. */
      clientId: '',
      master: branch.masters[0],
    });

  /* Ouvre l’éditeur — mode création (document neuf, non enregistré). */
  const openNew = (kind: Invoice['kind']) => {
    setEditing({ mode: 'new', draft: blankDraft(kind) });
    setStatusFilter('tous');
    setQ('');
  };
  /* Ouvre le MÊME éditeur pré-rempli avec un document existant — mode modification.
     On amène l'éditeur à l'écran (comme un clic sur la ligne), sinon « Modifier »
     depuis la liste ouvrait l'éditeur hors du champ de vision — l'impression que le
     bouton ne faisait rien. */
  const openEdit = (d: Invoice) => {
    setSelectedId(d.id);
    setEditing({ mode: 'edit', draft: { ...d, lines: d.lines.map((l) => ({ ...l })) } });
    revealDetail();
  };
  const cancelEdit = () => setEditing(null);

  /* Enregistre : ajoute (création) ou remplace par id (modification). */
  const saveDraft = () => {
    if (!editing) return;
    /* UN REFUS SE DIT. Une pièce sans personne ne se retrouve dans aucune
       recherche, n'entre dans aucun compte de cliente, et ne se réclame à
       personne. Le passage, lui, porte un nom même sans fiche. */
    if (editing.mode === 'new' && !editing.draft.clientId && !editing.draft.clientName?.trim()) {
      toast('Choisissez la tête couronnée, ou marquez un passage.');
      return;
    }
    /* LE FANTÔME NE TRAVERSE PAS. « walkin » est un marqueur d'écran, pas une
       cliente : écrit tel quel dans la pièce, `useReconcileClients` le prenait
       pour un identifiant orphelin et ouvrait UNE fiche « walkin » où toutes
       les ventes au comptoir venaient s'empiler. La Caisse, elle, le traduit
       depuis toujours (`clientId: ''` + `clientName`) — on fait pareil ici.
       Une cliente de passage, elle, a désormais une vraie fiche. */
    const d = editing.draft.clientId === 'walkin'
      ? { ...editing.draft, clientId: '', clientName: editing.draft.clientName ?? 'Walk-in' }
      : editing.draft;
    if (editing.mode === 'new') setInvoices((prev) => [d, ...prev]);
    else setInvoices((prev) => prev.map((i) => (i.id === d.id ? d : i)));
    setSelectedId(d.id);
    setEditing(null);
    /* Un devis accepté sans RDV encore rattaché → Carnet. L'idempotence tient à
       `apptId` (pas à la transition de statut) : si la conversion a été sautée faute
       de cliente, elle se rattrape dès qu'on ré-enregistre avec une cliente. */
    if (d.kind === 'devis' && d.status === 'acceptée' && !d.apptId) {
      convertDevisToAppt(d);
    }
  };

  const deleteDoc = (id: string, label: string) => {
    /* Une facture qui règle un RITUEL porte deux registres : la pièce comptable
       (elle) et l'état du RDV (paidXof, honoré, points). Supprimer l'une sans
       rembobiner l'autre laissait le rituel « payé » à jamais — on rembobine. */
    const doc = invoices.find((i) => i.id === id);
    const linked = doc ? appointmentsStore.get().find((a) => a.invoiceId === id) : undefined;
    const warn = linked
      ? `\n\nCette facture règle le rituel de ${clientNameOf(doc!)} du ${frDay(linked.date)} : sa suppression annule aussi l'encaissement, le rituel redevient impayé. Il reste HONORÉ et garde ses points : supprimer une pièce n'efface que de l'argent.`
      : '';
    if (!window.confirm(`Supprimer définitivement ${label} ?${warn} Cette action est irréversible.`)) return;
    if (doc && linked) rewindPaymentForDeletedInvoice(id, invoiceTotal(doc));
    /* UNE PIÈCE D'ABONNEMENT EMPORTE SON VERSEMENT. Le rembobinage ci-dessus ne
       connaît que les RITUELS : une pièce d'abonnement n'a pas de rendez-vous,
       elle passait donc entre les mailles et laissait le contrat payé pour une
       facture qui n'existait plus. */
    if (doc) {
      const rendus = detacheLesVersementsDeLaPiece(id, (doc.payments ?? []).map((p) => p.id));
      if (rendus > 0) {
        toast(`${rendus} règlement(s) retiré(s) de son abonnement avec la pièce.`);
      }
    }
    setInvoices((prev) => prev.filter((i) => i.id !== id));
    /* La pièce emporte ses ventes de produits (sorties référencées sur son
       numéro) et libère la préparation du Laboratoire qu'elle réglait. */
    if (doc) retirerParReferences([doc.number]);
    detacherFacture([id]);
    /* « Quand je supprime une facture de pourboire, ça doit supprimer le
       pourboire inscrit chez chacun » — 19 août. Les parts LIÉES partent avec
       la pièce ; celles d'avant le lien restent : on ne devine pas à qui
       appartenait un pourboire sans pièce. */
    const partsRetirees = retirerPourboiresDesFactures([id]);
    if (partsRetirees > 0) toast(`${partsRetirees} part(s) de pourboire retirée(s) avec la pièce.`);
    if (editing?.draft.id === id) setEditing(null);
    if (selectedId === id) setSelectedId(null);
  };


  /* ----- Lignes (agissent sur le brouillon en cours d’édition) ----- */
  const patchLines = (fn: (lines: InvoiceLine[]) => InvoiceLine[]) =>
    setEditing((e) => (e ? { ...e, draft: { ...e.draft, lines: fn(e.draft.lines) } } : e));

  const addServiceLine = (svcId: string) => {
    const svc = services.find((s) => s.id === svcId);
    if (!svc) return;
    patchLines((ls) => [...ls, ligneFacture(svc.name, svc.priceXof)]);
  };
  const addFreeLine = () => {
    const amt = parseInt(freeAmount.replace(/[^0-9]/g, ''), 10) || 0;
    if (!freeLabel.trim() || amt <= 0) return;
    patchLines((ls) => [...ls, ligneFacture(freeLabel.trim(), amt)]);
    setFreeLabel('');
    setFreeAmount('');
  };
  const setLine = (id: string, patch: Partial<InvoiceLine>) =>
    patchLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const removeLine = (id: string) => patchLines((ls) => ls.filter((l) => l.id !== id));

  /* Ordre des prestations sur le document — l'ordre des lignes EST celui du
     document imprimé. La maison veut souvent le rituel principal en tête et le
     shampoing dessous ; sans ce geste il fallait retirer les lignes et les
     ressaisir dans le bon ordre. */
  const moveLine = (id: string, dir: -1 | 1) =>
    patchLines((ls) => {
      const i = ls.findIndex((l) => l.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= ls.length) return ls;
      const next = [...ls];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const totals = active
    ? (() => {
        const gross = active.lines.reduce((s, l) => s + l.qty * l.unitXof, 0);
        /* ligneNetXof — la remise de ligne en FRANCS comptait pour zéro ici :
           l'écran annonçait des remises qui ne se recoupaient pas avec le total. */
        const afterLines = active.lines.reduce((s, l) => s + ligneNetXof(l), 0);
        const lineDisc = gross - afterLines;
        const globalDisc = afterLines * (active.globalDiscountPct / 100);
        const manualDisc = active.globalDiscountXof ?? 0;
        return { gross, lineDisc, globalDisc, manualDisc, net: invoiceTotal(active) };
      })()
    : null;

  const theme = active ? THEMES[active.theme] : THEMES.Aube;
  const defaultNote = active ? defaultNoteFor(active) : '';

  const printDoc = () => {
    document.body.classList.add('trv-print-doc');
    window.print();
    window.setTimeout(() => document.body.classList.remove('trv-print-doc'), 400);
  };

  const sendWhatsApp = async () => {
    if (!selected) return;
    const doc = selected;
    /* 1) Un lien wa.me ne peut PAS joindre de fichier : on télécharge d'abord le vrai PDF… */
    await invoicePdf(buildPdfData(doc));
    /* 2) …puis on ouvre le chat pré-rempli, en signalant la pièce jointe. */
    const label = doc.kind === 'devis' ? 'Devis' : 'Facture';
    const phone = clientOf(doc)?.phone.replace(/\D/g, '') ?? '';
    /* LA DEVISE FERME, ET ELLE SEULE — 22 août 2026. Le rappel MoMo tenait
       la dernière ligne : une consigne de paiement n'est pas une formule
       d'adieu, et elle poussait la Maison hors de son propre message. Le mot
       du maître reste, lui — c'est une parole, pas une chute. */
    /* LA RÉFÉRENCE NE COIFFE PLUS LE MESSAGE — 2 septembre 2026. Elle y
       paraissait DEUX FOIS, dont une en première ligne où elle prend la place du
       montant, et où WhatsApp la colore en la prenant pour un numéro de
       téléphone. Le corps la dit déjà, à l'endroit où elle sert : le nom de la
       pièce jointe. */
    const msg = signeLeMessage(
      `${maisonNom()} · ${label}\n` +
      `Pour ${prenomOf(doc)}, total ${fmtMoney(invoiceTotal(doc), currency)}.\n` +
      `Votre ${doc.kind === 'devis' ? 'devis' : 'facture'} ${doc.number} est en pièce jointe.\n` +
      `${(doc.note?.trim() || defaultNoteFor(doc))}`,
    );
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
    setWaHint('PDF téléchargé, joignez-le à votre message.');
    if (doc.status === 'brouillon') patchSelected({ status: 'envoyée' });
  };

  const statusClass = (s: Invoice['status']) =>
    s === 'payée' ? 'trv-status--payee' : s === 'envoyée' ? 'trv-status--envoyee' : s === 'acceptée' ? 'trv-status--acceptee' : '';

  const draft = editing?.draft ?? null;

  /* Le document vit AU-DESSUS du registre — sur 340 factures, l'ouvrir en dessous
     obligeait à traverser toute la liste, et la page, arrivée au bout, ne pouvait
     même plus le remonter en haut de l'écran. On vise le document lui-même, pas
     la grille : le haut de la grille, c'est la colonne d'édition. */
  const detailRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<HTMLDivElement>(null);
  const revealDetail = () => {
    const el = docRef.current ?? detailRef.current;
    if (!el) return;
    /* Déjà à l'œil ? On ne rejoue rien — la page sautillerait à chaque clic sur
       une ligne déjà ouverte. */
    const { top } = el.getBoundingClientRect();
    if (top >= 0 && top < 140) return;
    /* Depuis une ligne du fond du registre, une animation ferait défiler des
       centaines de lignes sous les yeux : au-delà de deux hauteurs d'écran, on
       saute d'un coup. En deçà, le glissement montre d'où l'on vient. */
    const far = Math.abs(top) > window.innerHeight * 2;
    el.scrollIntoView({ behavior: far ? 'auto' : 'smooth', block: 'start' });
  };

  /* Le défilement attend que le document soit RENDU : déclenché depuis le clic,
     il visait un élément qui n'existait pas encore (ou l'ancien). Un effet sur
     l'identifiant choisi s'exécute après la mise à jour de l'écran — c'est le
     seul moment où l'on peut mesurer la vraie position de la facture.
     Couvre aussi l'arrivée par `?id=` (Tableau de bord, Analytics, relevé de
     caisse) : la facture demandée est déjà choisie, on la montre sans chercher. */
  useEffect(() => {
    if (selectedId) revealDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const selectDoc = (d: Invoice) => {
    /* Recliquer la ligne ouverte la referme : on retrouve le registre nu sans
       chercher un bouton. (Pas en cours d'édition — on ne jette pas un
       brouillon d'un clic distrait.) */
    if (d.id === selectedId && !editing) { setSelectedId(null); return; }
    setSelectedId(d.id);
    if (editing) setEditing(null);
    /* Le défilement est déclenché par l'effet ci-dessus, une fois le document
       rendu — l'appeler ici viserait l'écran d'avant. */
  };

  /* Une ligne de la feuille — le geste du Carnet : on clique, le document s'ouvre
     en dessous ; « Modifier » entre directement dans l'éditeur. */
  const renderRow = (d: Invoice) => {
    const c = clientOf(d);
    const isActive = (editing?.draft.id ?? selected?.id) === d.id;
    return (
      <div
        className={`trc-sheet__row ${isActive ? 'is-active' : ''}`}
        style={{ gridTemplateColumns: GRID, cursor: 'pointer' }}
        key={d.id}
        onClick={() => selectDoc(d)}
        title={`Ouvrir ${d.kind === 'devis' ? 'ce devis' : 'cette facture'}`}
      >
        <span className="trc-date">{frDay(d.date)}</span>
        <span className="trv-row__no">{d.number}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          {c && <Avatar client={c} size={30} />}
          <span className="trc-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {clientNameOf(d)}
          </span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flexWrap: 'wrap' }}>
          {/* LE MOYEN SE LIT DANS LE JOURNAL À DÉFAUT DU MIROIR. `payment` est le
              reflet du PREMIER versement, et il n'est pas toujours posé : une
              pièce d'abonnement naît de son règlement sans jamais l'écrire. La
              colonne affichait alors « — » sur une facture pourtant réglée par
              chèque. Le journal, lui, sait toujours. */}
          {(() => {
            const regles = invoiceReglements(d);
            const moyen = d.payment ?? regles[0]?.method;
            const recu = invoiceRegleXof(d);
            const partiel = recu > 0 && recu < invoiceTotal(d);
            if (!moyen) return <span style={{ fontSize: 12, color: 'var(--ink-soft)', opacity: 0.5 }}>—</span>;
            return (
              <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                {moyen}
                {/* CE QUI EST ENTRÉ SE DIT SUR LA LIGNE. Une pièce à moitié
                    réglée se lisait « envoyée », comme si rien n'était venu. */}
                {partiel && <em style={{ fontStyle: 'normal', color: 'var(--copper-700)' }}> · {fmtMoney(recu, currency)} reçus</em>}
              </span>
            );
          })()}
          {/* La devise reçue se lit dès la feuille : un euro encaissé ne doit pas
              se cacher derrière un montant en francs. */}
          {d.fx && (
            <span className="trv-fx-chip">
              {d.fx.amount.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} {d.fx.code}
            </span>
          )}
        </span>
        <span style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--color-indigo)' }}>
          {fmtMoney(invoiceTotal(d), currency)}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
          <span className={`trv-status ${statusClass(d.status)}`}>{d.status}</span>
          <button className="trv-minibtn" title="Modifier ce document" onClick={(e) => { e.stopPropagation(); openEdit(d); }}>
            Modifier
          </button>
        </span>
      </div>
    );
  };

  /* CE QUI EST RÉELLEMENT ENTRÉ sur une pièce : son total si elle est soldée,
     sinon le seul acompte déjà reçu. Une facture envoyée n'a rien rapporté tant
     qu'elle n'est pas réglée — la compter au total gonflerait le mois d'un
     argent qui n'est pas là. `depositCreditXof` est la part encaissée AVANT le
     comptoir : elle est entrée, elle compte, même si la pièce reste ouverte. */
  /* ══ UN VERSEMENT PARTIEL EST DE L'ARGENT REÇU — 3 septembre 2026 ══
     « Sur la facture 0012 de Mylène, elle a payé 100 000 F. Je vois le montant
     de la facture envoyée 168 000 F, mais dans les montants reçus en septembre
     je dois avoir la trace du montant payé de 100 000 F » (Yéman).

     LE COMPTE NE CONNAISSAIT QUE DEUX ÉTATS : soldée, donc tout ; pas soldée,
     donc rien. Une pièce à moitié réglée comptait pour ZÉRO au perçu du mois,
     et pour son TOTAL au reste dû. Cent mille francs encaissés par chèque le
     28 août n'apparaissaient nulle part, et le reste annonçait une dette de
     168 000 F là où la Maison n'attend que 68 000.

     LE JOURNAL DES VERSEMENTS FAIT FOI quand il existe : c'est lui qui porte
     les dates, les moyens et les caisses. À défaut — les pièces d'avant le
     journal, une facture marquée payée à la main — on retombe sur l'ancienne
     lecture, pour ne rien perdre de ce qui était juste. */
  const percuDe = (d: Invoice) => {
    const recu = invoiceRegleXof(d);
    if (recu > 0) return recu;
    return d.status === 'payée' ? invoiceTotal(d) : (d.depositCreditXof ?? 0);
  };

  /* Le registre rangé par mois. Les documents arrivent triés du plus récent au
     plus ancien : on ouvre un intertitre quand le mois change, et on y porte le
     compte, ce qui est entré, et ce qui reste dû. Les totaux se comptent sur la
     liste AFFICHÉE — filtrer sur « payée » donne le perçu du filtre, pas celui
     du mois entier, et c'est bien ce qu'on veut lire. */
  const renderParMois = (docs: Invoice[], avecArgent = true) => {
    const parMois = new Map<string, { n: number; percu: number; du: number }>();
    docs.forEach((d) => {
      const cle = moisCle(d.date);
      const m = parMois.get(cle) ?? { n: 0, percu: 0, du: 0 };
      m.n += 1;
      m.percu += percuDe(d);
      m.du += Math.max(0, invoiceTotal(d) - percuDe(d));
      parMois.set(cle, m);
    });
    const out: ReactNode[] = [];
    let courant = '';
    docs.forEach((d) => {
      const cle = moisCle(d.date);
      if (cle !== courant) {
        courant = cle;
        const m = parMois.get(cle) ?? { n: 0, percu: 0, du: 0 };
        out.push(
          <div key={`mois-${cle}`} className="trv-mois">
            <span className="trv-mois__nom">{moisLabel(cle)}</span>
            <span className="trv-mois__n">{m.n} pièce{m.n > 1 ? 's' : ''}</span>
            {avecArgent ? (
              <span className="trv-mois__chiffres">
                <span className="trv-mois__percu">
                  <em>perçu</em> {fmtMoney(m.percu, currency)}
                </span>
                {m.du > 0 && (
                  <span className="trv-mois__du">
                    <em>reste</em> {fmtMoney(m.du, currency)}
                  </span>
                )}
              </span>
            ) : (
              <span className="trv-mois__chiffres">
                <span className="trv-mois__percu">
                  <em>total</em> {fmtMoney(m.percu + m.du, currency)}
                </span>
              </span>
            )}
          </div>,
        );
      }
      out.push(renderRow(d));
    });
    return out;
  };

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="Vente · documents de marque"
        title="Factures & devis."
        actions={
          <>
            <Button variant="ghost" onClick={() => openNew('devis')}>+ Devis</Button>
            <Button onClick={() => openNew('facture')}>+ Nouvelle facture</Button>
          </>
        }
      />

      {/* ===== Chercher une cliente ===== */}
      <div className="trv-search">
        <span className="trv-search__field">
          <Search size={15} strokeWidth={1.75} aria-hidden />
          <input
            className="trv-search__input"
            type="search"
            placeholder="Chercher une cliente, un numéro de document…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {q && (
            <button className="trv-search__clear" title="Effacer la recherche" onClick={() => setQ('')}>✕</button>
          )}
        </span>
        <Button variant="ghost" size="sm" onClick={ouvrirLaConformite} disabled={scanEnCours}>
          {scanEnCours ? 'Lecture des rituels…' : 'Conformité au rituel'}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setFusions(chercherLesFusions())}>
          Rassembler les pièces d'un rituel
        </Button>
        {/* LE LIEN SANS PIÈCE. Il vit ici, avec les autres gestes d'argent, et
            non dans un coin de réglages : on le cherche au moment où l'on
            réclame, pas au moment où l'on configure. */}
        <Button variant="ghost" size="sm" onClick={() => setLienLibre({ montant: '', clientId: '', tel: '', motif: '' })}>
          Un lien de paiement
        </Button>
        <Select value={moisFilter} onChange={(e) => setMoisFilter(e.target.value)} style={{ fontSize: 12, maxWidth: 180 }}>
          <option value="tous">Tous les mois</option>
          {moisDisponibles.map((cle) => (
            <option key={cle} value={cle}>{moisLabel(cle)}</option>
          ))}
        </Select>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} style={{ fontSize: 12, maxWidth: 200 }}>
          <option value="tous">Tous les statuts</option>
          <option value="brouillon">Brouillon</option>
          <option value="envoyée">Envoyée</option>
          <option value="payée">Payée</option>
          <option value="acceptée">Acceptée</option>
        </Select>
      </div>

      {/* ===== Le document ouvert, AU-DESSUS du registre — rien tant que rien
           n'est choisi : l'écran s'ouvre sur la liste nue. ===== */}
      {(active || draft) && (
      <div className="trv-fac-grid" ref={detailRef}>
        {/* ===== Colonne gauche — éditeur & actions ===== */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* ===== Éditeur (création & modification — même formulaire) ===== */}
          {draft ? (
            <>
              <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                <div>
                  <div className="trv-sec-label trv-sec-label--copper" style={{ marginBottom: 2 }}>
                    {editing?.mode === 'new' ? 'Nouveau document' : 'Modifier le document'}
                  </div>
                  <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--ink-soft)' }}>
                    {draft.kind === 'devis' ? 'Devis' : 'Facture'} · {draft.number}
                  </div>
                </div>
                <span className={`trv-status ${statusClass(draft.status)}`}>{draft.status}</span>
              </div>

              <div>
                <div className="trv-sec-label">Tête couronnée & maître</div>
                <div className="tr-grid tr-grid--2" style={{ gap: 8 }}>
                  <ClientPicker value={draft.clientId} onChange={(id) => patchDraft({ clientId: id })} allowWalkIn allowPassage />
                  <Select value={draft.master ?? ''} onChange={(e) => patchDraft({ master: e.target.value })} style={{ fontSize: 12 }}>
                    {[...new Set([draft.master ?? '', ...branch.masters])].filter(Boolean).map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </Select>
                </div>
              </div>

              <div>
                <div className="trv-sec-label">Prestations & remises</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {draft.lines.map((l, li) => (
                    <div key={l.id} style={{ border: '1px solid var(--hairline)', borderRadius: 3, padding: '10px 12px', background: 'var(--surface-card)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <span style={{ minWidth: 0, fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--color-indigo)' }}>
                          {l.label}
                          {(l.detail ?? []).length > 0 && (
                            <span className="mnd-muted" style={{ display: 'block', fontSize: 10.5, marginTop: 3 }}>
                              {l.detail!.join(' · ')}
                            </span>
                          )}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
                          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--ink)' }}>{fmtMoney(Math.round(l.qty * l.unitXof * (1 - l.discountPct / 100)), currency)}</span>
                          {/* Monter / descendre — l'ordre des lignes est celui
                              du document imprimé. Grisé aux extrémités. */}
                          {draft.lines.length > 1 && (
                            <>
                              <button
                                className="trv-sq trv-sq--ghost"
                                style={{ width: 20, height: 20, color: 'var(--ink-soft)' }}
                                title="Monter cette prestation"
                                aria-label="Monter cette prestation"
                                disabled={li === 0}
                                onClick={() => moveLine(l.id, -1)}
                              >
                                ▲
                              </button>
                              <button
                                className="trv-sq trv-sq--ghost"
                                style={{ width: 20, height: 20, color: 'var(--ink-soft)' }}
                                title="Descendre cette prestation"
                                aria-label="Descendre cette prestation"
                                disabled={li === draft.lines.length - 1}
                                onClick={() => moveLine(l.id, 1)}
                              >
                                ▼
                              </button>
                            </>
                          )}
                          <button
                            className="trv-sq trv-sq--ghost"
                            style={{ width: 20, height: 20, color: 'var(--ink-soft)' }}
                            title="Retirer la ligne"
                            onClick={() => removeLine(l.id)}
                          >
                            ✕
                          </button>
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                        <span className="trv-stepper">
                          <button className="trv-sq" title="Moins" onClick={() => setLine(l.id, { qty: Math.max(1, l.qty - 1) })}>−</button>
                          <span className="val">{l.qty}</span>
                          <button className="trv-sq" title="Plus" onClick={() => setLine(l.id, { qty: l.qty + 1 })}>+</button>
                        </span>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                          <input
                            className="mnd-input"
                            style={{ width: 92, padding: '5px 8px', fontSize: 11.5 }}
                            inputMode="numeric"
                            title="Prix unitaire"
                            value={l.unitXof}
                            onChange={(e) => setLine(l.id, { unitXof: parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0 })}
                          />
                          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 10, color: 'var(--ink-soft)' }}>F/u</span>
                        </label>
                        <select
                          className="mnd-select"
                          style={{ padding: '5px 8px', fontSize: 10.5, color: 'var(--copper-700)' }}
                          value={l.discountPct}
                          onChange={(e) => setLine(l.id, { discountPct: +e.target.value })}
                        >
                          {DISC_OPTIONS.map((v) => (
                            <option key={v} value={v}>{v === 0 ? 'Aucune remise' : `Remise −${v}%`}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                  {draft.lines.length === 0 && (
                    <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 13, color: 'var(--ink-soft)', padding: '4px 0' }}>
                      Aucune prestation, ajoutez-en une ci-dessous.
                    </div>
                  )}
                </div>
                <select
                  className="mnd-select"
                  style={{ width: '100%', marginTop: 8, borderStyle: 'dashed', fontSize: 11.5, color: 'var(--copper-700)' }}
                  value=""
                  onChange={(e) => { addServiceLine(e.target.value); e.target.value = ''; }}
                >
                  <option value="" disabled>+ Ajouter une prestation…</option>
                  <OptionsPrestations services={services} prix devise={currency} />
                </select>
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <input className="mnd-input" style={{ flex: 1, padding: '8px 10px', fontSize: 12 }} placeholder="Ligne libre, libellé" value={freeLabel} onChange={(e) => setFreeLabel(e.target.value)} />
                  <input className="mnd-input" style={{ width: 90, padding: '8px 10px', fontSize: 12 }} placeholder="F CFA" inputMode="numeric" value={freeAmount} onChange={(e) => setFreeAmount(e.target.value)} />
                  <button className="trv-minibtn" onClick={addFreeLine}>Ajouter</button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                  <span style={{ fontFamily: 'var(--font-sans)', fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>Remise globale</span>
                  <select
                    className="mnd-select"
                    style={{ padding: '6px 10px', fontSize: 11.5, color: 'var(--copper-700)' }}
                    value={draft.globalDiscountPct}
                    onChange={(e) => patchDraft({ globalDiscountPct: +e.target.value })}
                  >
                    {DISC_OPTIONS.map((v) => (
                      <option key={v} value={v}>{v === 0 ? 'Aucune' : `−${v}%`}</option>
                    ))}
                  </select>
                </div>
                {/* LA REMISE EN FRANCS SE COMMANDE ICI, ET S'EFFACE.
                    Elle s'affichait sur le document sans qu'aucun champ ne
                    puisse la reprendre : posée depuis le rendez-vous, elle
                    restait prisonnière de la pièce. Une remise qu'on ne peut
                    pas retirer n'est pas une remise, c'est une erreur figée.

                    Elle porte parfois un NOM — « Remise famille » pour
                    l'avantage d'un compte famille. On l'affiche, pour qu'on
                    sache ce qu'on efface ; et l'effacer emporte le nom avec le
                    montant, un intitulé sans somme ne voulant rien dire. */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 10 }}>
                  <span style={{ fontFamily: 'var(--font-sans)', fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>
                    {draft.discountLabel ?? 'Remise manuelle'}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      className="mnd-input"
                      style={{ width: 96, padding: '6px 10px', fontSize: 11.5, textAlign: 'right' }}
                      placeholder="0"
                      inputMode="numeric"
                      value={draft.globalDiscountXof ?? ''}
                      onChange={(e) => {
                        const n = Math.max(0, Math.round(Number(e.target.value.replace(/[^\d]/g, '')) || 0));
                        patchDraft(n > 0
                          ? { globalDiscountXof: n }
                          : { globalDiscountXof: undefined, discountLabel: undefined });
                      }}
                    />
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: 10.5, color: 'var(--ink-soft)' }}>F</span>
                    <button
                      className="trv-minibtn"
                      title="Retirer la remise manuelle"
                      disabled={!draft.globalDiscountXof}
                      style={{ opacity: draft.globalDiscountXof ? 1 : 0.35 }}
                      onClick={() => patchDraft({ globalDiscountXof: undefined, discountLabel: undefined })}
                    >
                      Retirer
                    </button>
                  </span>
                </div>
                {/* D'OÙ VIENT CETTE REMISE. Quand elle est née du rendez-vous,
                    `alignerFacturesDuRituel` la REPOSE à chaque enregistrement
                    du rituel. La retirer ici ne vaut donc que pour cette pièce,
                    jusqu'au prochain enregistrement — et l'écran doit le dire,
                    sans quoi on croit à une panne quand elle revient. */}
                {(() => {
                  const r = rituelDe(draft);
                  if (!r || !(r.discountXof || r.remiseFamille)) return null;
                  return (
                    <div className="trv-pdf-hint" style={{ marginTop: 6 }}>
                      Cette remise vient du rendez-vous : la retirer ici ne vaut que pour cette pièce,
                      et le prochain enregistrement du rituel la reposera. Pour la retirer à la source,
                      ouvre le rendez-vous.
                    </div>
                  );
                })()}
              </div>

              <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 16 }}>
                <div className="trv-sec-label trv-sec-label--copper">L’âme du document</div>
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 10.5, color: 'var(--ink-soft)', marginBottom: 7 }}>Le motif & le vers</div>
                <div className="tr-cols" style={{ '--cols': 'repeat(3,1fr)', '--cols-md': 'repeat(3,1fr)', gap: 7 } as CSSProperties}>
                  {(Object.keys(THEMES) as ThemeKey[]).map((k) => (
                    <button key={k} title={THEMES[k].amb} className={`trv-theme-btn ${draft.theme === k ? 'is-active' : ''}`} onClick={() => patchDraft({ theme: k })}>
                      <span style={{ height: 34, display: 'flex', alignItems: 'center' }}>
                        <Motif theme={k} size={24} color={draft.theme === k ? '#9E6238' : '#B97A4A'} />
                      </span>
                      <span className="l">{k}</span>
                    </button>
                  ))}
                </div>
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 10.5, color: 'var(--ink-soft)', margin: '14px 0 6px' }}>Le mot du Maître</div>
                <textarea
                  className="mnd-textarea"
                  style={{ width: '100%', minHeight: 74, fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 15, lineHeight: 1.5 }}
                  placeholder={defaultNote}
                  value={draft.note ?? ''}
                  onChange={(e) => patchDraft({ note: e.target.value })}
                />
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 10.5, color: 'var(--ink-soft)', marginTop: 6 }}>
                  Ambiance · <span style={{ color: 'var(--copper-700)' }}>{theme.amb}</span>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 16 }}>
                <div className="trv-sec-label">Statut & règlement</div>
                {/* LA DATE DE LA PIÈCE SE CORRIGE ICI. Elle n'avait aucun champ :
                    une facture mal datée l'était pour toujours. Or c'est elle
                    qui range la pièce dans son mois — donc qui décide de quel
                    mois est le chiffre. Sur un carnet en retard, c'est la
                    différence entre un mois de juin vide et un mois d'août
                    gonflé de prestations qui n'y ont pas eu lieu. */}
                <div className="tr-grid tr-grid--2" style={{ gap: 8, marginBottom: 8 }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>Date de la pièce</span>
                    <input
                      className="mnd-input"
                      type="date"
                      style={{ padding: '7px 10px', fontSize: 12 }}
                      value={draft.date}
                      onChange={(e) => patchDraft({ date: e.target.value || draft.date })}
                    />
                  </label>
                  {(() => {
                    const r = rituelDe(draft);
                    if (!r || !r.date || r.date === draft.date) return null;
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, justifyContent: 'flex-end' }}>
                        <button
                          className="trv-minibtn"
                          style={{ alignSelf: 'flex-start' }}
                          onClick={() => patchDraft({ date: r.date })}
                        >
                          Dater du rituel · {frDay(r.date)}
                        </button>
                        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 10, color: 'var(--ink-soft)', lineHeight: 1.4 }}>
                          Le rituel a eu lieu un autre jour que la pièce.
                        </span>
                      </div>
                    );
                  })()}
                </div>
                <div className="tr-grid tr-grid--2" style={{ gap: 8 }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>Statut</span>
                    <Select value={draft.status} onChange={(e) => patchDraft({ status: e.target.value as Invoice['status'] })} style={{ fontSize: 12 }}>
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </Select>
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>Moyen de paiement</span>
                    <Select value={draft.payment ?? ''} onChange={(e) => patchDraft({ payment: (e.target.value || undefined) as PaymentMethod | undefined })} style={{ fontSize: 12 }}>
                      <option value="">—</option>
                      {methods.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </Select>
                  </label>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="trv-doc-actions__row" style={{ display: 'flex', gap: 8 }}>
                  <Button variant="copper" style={{ flex: 1 }} onClick={saveDraft}>
                    {editing?.mode === 'new' ? 'Créer le document' : 'Enregistrer les modifications'}
                  </Button>
                  <Button variant="ghost" onClick={cancelEdit}>Annuler</Button>
                </div>
                {editing?.mode === 'edit' && (
                  <button
                    className="trv-linkbtn trv-linkbtn--muted"
                    style={{ alignSelf: 'flex-start', color: 'var(--trv-error)' }}
                    onClick={() => deleteDoc(draft.id, `${draft.kind === 'devis' ? 'ce devis' : 'cette facture'} ${draft.number}`)}
                  >
                    Supprimer ce document
                  </button>
                )}
              </div>
            </>
          ) : selected ? (
            /* ===== Actions du document sélectionné (hors édition) ===== */
            <div className="trv-doc-actions" style={{ borderTop: '1px solid var(--hairline)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="trv-doc-actions__row" style={{ display: 'flex', gap: 8 }}>
                <Button variant="copper" style={{ flex: 1 }} size="sm" onClick={() => openEdit(selected)}>Modifier</Button>
                <Button
                  variant="ghost"
                  size="sm"
                  style={{ color: 'var(--trv-error)' }}
                  onClick={() => deleteDoc(selected.id, `${selected.kind === 'devis' ? 'ce devis' : 'cette facture'} ${selected.number}`)}
                >
                  Supprimer
                </Button>
              </div>
              {/* LE RITUEL S'OUVRE ICI, PAS DANS UN AUTRE ÉCRAN. Corriger une
                  prestation obligeait à quitter la pièce pour le Carnet, à y
                  retrouver la cliente, puis à revenir vérifier ce que la facture
                  était devenue. La modale du Carnet est le MÊME composant :
                  l'enregistrer réaligne les pièces liées, et celle qui est
                  ouverte se réécrit sous les yeux — on ne change pas d'écran. */}
              {rituelLie && (
                <button className="trv-rdv-btn" onClick={() => setRdvOuvertId(rituelLie.id)}>
                  <CalendarClock size={14} strokeWidth={1.75} />
                  <span>
                    Ouvrir le rendez-vous
                    <em>{frDay(rituelLie.date)} · {rituelLie.time}</em>
                  </span>
                </button>
              )}
              <Button variant="ghost" size="sm" onClick={() => { setDemandePour(selected); setDemandeQui(''); setDemandeQuoi(''); }}>
                Demander à quelqu'un de la traiter
              </Button>
              {invoiceRegleXof(selected) > 0 && (
                <Button variant="ghost" size="sm" onClick={() => ouvrirLeCoffre(selected)}>
                  Mettre au coffre, {fmtMoney(invoiceRegleXof(selected), currency)}
                </Button>
              )}
              <button className="trv-wa-btn" onClick={() => void sendWhatsApp()}>Adresser par WhatsApp</button>
              {/* LE LIEN DE PAIEMENT, EN UN CLIC — la page payer.html au montant
                  exact du reste dû, envoyée sur le WhatsApp de la cliente. Le
                  message de facture, lui, reste sobre (décision du 22 août) :
                  ceci est un geste séparé, pour quand on RÉCLAME un règlement. */}
              {selected.kind === 'facture' && invoiceResteXof(selected) > 0 && (() => {
                const lien = lienPaiementMomo(invoiceResteXof(selected));
                const tel = clientOf(selected)?.phone.replace(/\D/g, '') ?? '';
                if (!lien || !tel) return null;
                /* ══ LA RÉFÉRENCE N'EST QU'UNE RÉFÉRENCE — 2 septembre 2026 ══
                   « Sur le message de lien de paiement il ne faut pas mettre en
                   gras la référence de facture, car ce n'est qu'une référence »
                   (Yéman).

                   ELLE OUVRAIT LE MESSAGE, ET WHATSAPP LA COLORAIT. « Facture
                   MND-2026-0013 » en première ligne : le numéro y prenait la
                   place du montant, et WhatsApp le reconnaît en plus comme un
                   numéro de téléphone — huit chiffres séparés d'un tiret — donc
                   l'affiche en bleu et tapable. La cliente lisait d'abord une
                   référence qu'elle ne peut ni composer ni comprendre.

                   LE MONTANT ET LE LIEN D'ABORD, la référence en pied de
                   message : elle sert à retrouver la pièce si l'on écrit à la
                   Maison, jamais à décider quoi que ce soit. */
                const msg = signeLeMessage(
                  `${maisonNom()}\n` +
                  `Bonjour ${prenomOf(selected)}, pour régler ${fmtMoney(invoiceResteXof(selected), currency)} par Mobile Money, ouvrez cette page : le code à composer s'y affiche, montant compris.\n${lien}\n` +
                  `Référence ${selected.number}`,
                );
                return (
                  <a className="trv-wa-btn" style={{ textDecoration: 'none' }} href={`https://wa.me/${tel}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer">
                    Envoyer le lien de paiement
                  </a>
                );
              })()}
              {/* ══ UN SEUL LIEN POUR TOUT LE FOYER ═══════════════════════════
                  Une mère ne paie pas trois fois. Le bouton ne paraît que si le
                  foyer a plus d'une pièce qui réclame : sur une seule, il ne
                  ferait que doubler celui du dessus. */}
              {selected.kind === 'facture' && (() => {
                const duFoyer = piecesDuFoyer(selected);
                if (duFoyer.length < 2) return null;
                return (
                  <button
                    type="button" className="trv-act"
                    onClick={() => setLienFoyer({ pieces: duFoyer, prises: duFoyer.map((i) => i.id) })}
                  >
                    Un seul lien pour le foyer · {duFoyer.length} pièces
                  </button>
                );
              })()}
              {geoDest && (
                <a
                  className="trv-route-btn"
                  href={`https://www.google.com/maps/dir/?api=1&destination=${geoDest}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MapPin size={14} strokeWidth={1.75} /> Itinéraire vers la cliente
                </a>
              )}
              <div className="trv-doc-actions__row" style={{ display: 'flex', gap: 8 }}>
                <Button style={{ flex: 1 }} size="sm" onClick={printDoc}>Imprimer</Button>
                <Button variant="ghost" style={{ flex: 1 }} size="sm" onClick={() => void downloadPdf()}>PDF</Button>
              </div>
              {waHint && <div className="trv-pdf-hint">{waHint}</div>}
              {selected.kind === 'devis' ? (
                <Button
                  variant="copper"
                  size="sm"
                  onClick={() => patchSelected({ kind: 'facture', number: nextNumber('facture'), status: 'envoyée' })}
                >
                  Convertir en facture
                </Button>
              ) : selected.status !== 'payée' ? (
                /* ══ UNE PIÈCE À ZÉRO NE SE PAIE PAS, ELLE SE SOLDE — 4 sept. 2026
                   « Comment solder une facture à 0 F ? » (Yéman).

                   LE GESTE EXISTAIT, MAIS IL DEMANDAIT UN MOYEN DE PAIEMENT.
                   « Payée · MTN MoMo » sur une pièce à zéro est un mensonge
                   poli : aucun argent n'est passé par ce canal, et la ligne
                   remonterait au registre d'une caisse qui n'a rien reçu. Un
                   rituel entièrement couvert par un abonnement, ou offert, se
                   FERME — il ne s'encaisse pas.

                   Le moyen de paiement disparaît donc quand il n'y a rien à
                   encaisser, et le bouton dit ce qu'il fait. */
                invoiceTotal(selected) <= 0 ? (
                  <Button variant="copper" size="sm" style={{ width: '100%' }}
                    onClick={() => patchSelected({ status: 'payée', payment: undefined })}>
                    Solder · rien à encaisser
                  </Button>
                ) : (
                <div className="trv-doc-actions__row" style={{ display: 'flex', gap: 8 }}>
                  <Select value={payChoice} onChange={(e) => setPayChoice(e.target.value as PaymentMethod)} style={{ flex: 1, fontSize: 12 }}>
                    {methods.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </Select>
                  <Button variant="copper" size="sm" onClick={() => patchSelected({ status: 'payée', payment: payChoice })}>
                    Marquer payée
                  </Button>
                </div>
                )
              ) : (
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--trv-success)', textAlign: 'center' }}>
                  {/* SOLDÉE N'EST PAS PAYÉE. Sans moyen et sans montant, la pièce
                      est close, pas encaissée — et l'écran ne prétend pas le
                      contraire. */}
                  {selected.payment
                    ? <>Payée · {selected.payment}</>
                    : invoiceTotal(selected) <= 0 ? 'Soldée · rien à encaisser' : 'Payée'}
                  {selected.fx && ` · ${selected.fx.amount.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${selected.fx.code}`}
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* ===== Le document vivant ===== */}
        {active && totals && (
          <div className="trv-doc-stage" ref={docRef}>
            <div className="trv-doc">
              <div className="trv-doc__motif" aria-hidden="true">
                <Motif theme={active.theme} size={60} color="#B97A4A" />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <img src={asset("/assets/monograms/mono-copper.png")} alt="" style={{ width: 30 }} />
                <div>
                  <div className="trv-doc__brand">{maisonNom()}</div>
                  <div className="trv-doc__brand-sub">{branch.city} · l’art de la couronne</div>
                </div>
              </div>
              <div className="trv-doc__filet" />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div className="trv-doc__kind">{active.kind === 'devis' ? 'Devis' : 'Facture'} · {active.number}</div>
                <span className={`trv-status ${statusClass(active.status)}`}>{active.status}</span>
              </div>

              <div className="trv-doc__pour">Pour {prenomOf(active)},</div>
              <div className="trv-doc__verse">{theme.verse}</div>
              <div className="trv-doc__sep">·, ✦, ·</div>

              <div className="trv-doc__passage">
                Votre passage · {fmtDateFr(jourDuPassage(active))}{active.master ? ` · avec ${active.master}` : ''}
              </div>
              <div style={{ marginTop: 12 }}>
                {active.lines.map((l) => {
                  /* LA REMISE EN FRANCS SE VOIT SUR SA LIGNE — 18 août 2026 :
                     « les 60 000 F barrés, la vraie remise, puis le nouveau
                     montant ». Seul le pourcentage se disait ; une remise de
                     20 000 F laissait la ligne intacte et le total inexpliqué. */
                  const net = ligneNetXof(l);
                  const remisee = l.discountPct > 0 || (l.discountXof ?? 0) > 0;
                  const ditLaRemise = [
                    l.discountPct > 0 ? `−${l.discountPct}%` : '',
                    (l.discountXof ?? 0) > 0 ? `−${fmtMoney(l.discountXof!, currency)}` : '',
                  ].filter(Boolean).join(' puis ');
                  return (
                    <div key={l.id} className="trv-doc__item">
                      <div>
                        <div className="lbl">{l.qty > 1 ? `${l.label} ×${l.qty}` : l.label}</div>
                        {/* SANS PRIX EN FACE : la somme des prestations incluses
                            ne tombe pas sur le total d'un abonnement, et deux
                            chiffres qui ne se rejoignent pas sur un même papier
                            se lisent comme une erreur. */}
                        {contenuDeLaLigne(active, l).map((t) => (
                          <div className="temps" key={t}>· {t}</div>
                        ))}
                        {remisee && <div className="temps">remise {ditLaRemise}</div>}
                      </div>
                      <div style={{ textAlign: 'right', flex: 'none' }}>
                        {remisee && <div className="orig">{fmtMoney(l.qty * l.unitXof, currency)}</div>}
                        <div className="amt">{fmtMoney(Math.round(net), currency)}</div>
                      </div>
                    </div>
                  );
                })}
                {active.lines.length === 0 && (
                  <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 14, color: 'var(--ink-soft)', padding: '12px 0' }}>
                    Le document attend sa première prestation.
                  </div>
                )}
              </div>

              {/* La remise manuelle SEULE doit aussi montrer le bloc : sans lui, le
                  document affichait une ligne à 25 000 F et un total à 22 500 F sans
                  la moindre explication — litige assuré. */}
              {(totals.lineDisc > 0 || totals.globalDisc > 0 || totals.manualDisc > 0) && (
                <>
                  <div className="trv-doc__totline"><span>Sous-total</span><span>{fmtMoney(Math.round(totals.gross), currency)}</span></div>
                  {totals.lineDisc > 0 && (
                    <div className="trv-doc__totline disc"><span>Remises par prestation</span><span>− {fmtMoney(Math.round(totals.lineDisc), currency)}</span></div>
                  )}
                  {totals.globalDisc > 0 && (
                    <div className="trv-doc__totline disc"><span>Remise globale · −{active.globalDiscountPct}%</span><span>− {fmtMoney(Math.round(totals.globalDisc), currency)}</span></div>
                  )}
                  {totals.manualDisc > 0 && (
                    <div className="trv-doc__totline disc"><span>{active.discountLabel ?? 'Remise manuelle'}</span><span>− {fmtMoney(totals.manualDisc, currency)}</span></div>
                  )}
                </>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 14 }}>
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>Total</div>
                <div className="trv-doc__total">{fmtMoney(totals.net, currency)}</div>
              </div>

              {/* LE POURBOIRE SE DIT, HORS TOTAL. Il était enregistré sur la
                  pièce (tipXof) mais muet partout : une cliente remettait 5 000 F
                  et le document n'en gardait aucune trace lisible. Il ne
                  s'additionne pas au total — c'est un merci aux mains, pas une
                  ligne de la Maison (demande de Yéman, 11 août). */}
              {(active.tipXof ?? 0) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--hairline)' }}>
                  <div style={{ fontFamily: 'var(--font-sans)', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--copper-700)' }}>
                    Pourboire, merci
                  </div>
                  <div className="mnd-serif" style={{ fontSize: 20, color: 'var(--color-copper)' }}>
                    {fmtMoney(active.tipXof!, currency)}
                  </div>
                </div>
              )}

              {/* Réglé en devise — la cliente doit lire ce qu'elle a réellement
                  tendu, et à quel taux. Sans cette ligne, le document affirme un
                  montant en {currency} qui n'est jamais passé par ses mains. */}
              {active.fx && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--hairline)' }}>
                  <div style={{ fontFamily: 'var(--font-sans)', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--copper-700)' }}>
                    Réglé en {active.fx.code} · 1 {active.fx.code} = {active.fx.rate} {currency}
                  </div>
                  <div className="mnd-serif" style={{ fontSize: 20, color: 'var(--color-copper)' }}>
                    {active.fx.amount.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} {active.fx.code}
                  </div>
                </div>
              )}

              <div className="trv-doc__note">
                <span className="q">“</span>
                <div className="txt">{active.note?.trim() || defaultNote}</div>
              </div>

              {/* LE RÈGLEMENT DIT AUSSI QUAND — 17 août 2026, demande de Yéman :
                  « reporte la date du règlement sur la facture ». La pièce
                  annonçait le moyen sans le jour. Or c'est la DATE qui prouve :
                  une cliente qui demande quand elle a payé, un rapprochement de
                  caisse, un litige — tous cherchent le jour, pas le canal.

                  Plusieurs versements se disent un par un, chacun avec sa date,
                  son moyen et sa part : c'est ce que la pièce porte désormais,
                  et le taire reviendrait à la faire mentir par omission. */}
              {(() => {
                const journal = invoiceReglements(active).filter((p) => p.amountXof > 0);
                if (journal.length === 0) return null;
                return (
                  <div style={{ marginTop: 18, paddingTop: 12, borderTop: '1px solid var(--hairline)' }}>
                    <div style={{ fontFamily: 'var(--font-sans)', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', marginBottom: 7 }}>
                      {journal.length > 1 ? 'Règlements' : 'Réglé par'}
                    </div>
                    {/* LA PAYEUSE APPARTIENT AU BLOC DU RÈGLEMENT — 28 août.
                        Elle vivait sous le nom de la tête soignée, en tête de
                        pièce : deux informations de nature différente collées
                        l'une à l'autre. Le haut dit POUR QUI l'on a travaillé,
                        le bas dit COMMENT et PAR QUI c'est réglé. */}
                    {payeurAutreQue(active) && (
                      <div className="trv-doc__payeur">Au compte de {payeurAutreQue(active)}</div>
                    )}
                    {journal.map((p) => (
                      <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
                        <span style={{ fontFamily: 'var(--font-serif)', fontSize: 15, color: 'var(--color-indigo)' }}>
                          {p.method}
                          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--ink-soft)', marginLeft: 8 }}>
                            le {fmtDateFr(p.date)}
                          </span>
                          {/* Le versement en devise se dit SUR SA LIGNE — les
                              100 € de Stevie A. n'apparaissaient nulle part :
                              la pièce ne portait la devise qu'à sa création. */}
                          {p.fx && (
                            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--copper-700)', marginLeft: 8 }}>
                              {p.fx.amount.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} {p.fx.code} reçus · 1 {p.fx.code} = {p.fx.rate} {currency}
                            </span>
                          )}
                        </span>
                        {journal.length > 1 && (
                          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 15, color: 'var(--color-indigo)' }}>
                            {fmtMoney(p.amountXof, currency)}
                          </span>
                        )}
                      </div>
                    ))}
                    {invoiceResteXof(active) > 0 && (
                      <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--copper-700)', marginTop: 6 }}>
                        Reste dû · {fmtMoney(invoiceResteXof(active), currency)}
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="trv-doc__foot">
                <div className="trv-doc__fon">{DEVISE_COMPLETE}</div>
                {/* LA LIGNE LÉGALE VIENT DES PARAMÈTRES (13 août). Un RCCM codé
                    en dur ici contredisait celui de l'identité — deux numéros
                    pour une seule maison, et c'est la pièce OFFICIELLE. */}
                <div className="trv-doc__legal">{maisonRaison()} · {branch.city} · merci de cultiver votre couronne avec nous.</div>
              </div>
            </div>
          </div>
        )}
      </div>
      )}

      <div className="trc-sheet trv-sheet">
        <div className="trc-sheet__head" style={{ gridTemplateColumns: GRID }}>
          <span>Date</span>
          <span>Numéro</span>
          <span>Cliente</span>
          <span>Règlement</span>
          <span>Montant</span>
          <span style={{ textAlign: 'right' }}>Statut</span>
        </div>

        <div className="trc-sheet__group">Factures ({factures.length})</div>
        {factures.length === 0 && (
          <div className="trc-empty">{q || statusFilter !== 'tous' ? 'Aucune facture pour cette recherche.' : 'Aucune facture, la maison attend son premier encaissement.'}</div>
        )}
        {renderParMois(factures)}

        <div className="trc-sheet__group">Devis ({devis.length})</div>
        {devis.length === 0 && (
          <div className="trc-empty">{q || statusFilter !== 'tous' ? 'Aucun devis pour cette recherche.' : 'Aucun devis en attente.'}</div>
        )}
        {renderParMois(devis, false)}
      </div>

      {/* LA MODALE DU CARNET, OUVERTE DEPUIS LA PIÈCE. Même composant, mêmes
          gardes : enregistrer réaligne les factures liées (une pièce payée
          garde son total, les lignes seules se reconforment), et le registre
          au-dessus se réécrit sans qu'on ait rien à recharger. */}
      {rdvOuvert && (
        <RdvModal appt={rdvOuvert} onClose={() => setRdvOuvertId(null)} />
      )}

      {demandePour && (
        <Modal title="Demander qu'on s'en occupe." onClose={() => setDemandePour(null)} width={480}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, lineHeight: 1.6, color: 'var(--ink-soft)' }}>
              La demande part dans <b style={{ color: 'var(--color-indigo)' }}>Le Fil</b> avec la facture
              attachée, et <b style={{ color: 'var(--color-indigo)' }}>se referme d'elle-même</b> quand
              elle sera réglée, personne n'aura à s'en souvenir.
            </div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>À qui</span>
              <Select value={demandeQui} onChange={(e) => setDemandeQui(e.target.value)} style={{ fontSize: 12 }}>
                <option value="">Choisir…</option>
                {equipeFil.filter((m) => m.branchId === branch.id).map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </Select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>Ce qu'il faut faire</span>
              <textarea
                className="mnd-input"
                rows={2}
                value={demandeQuoi}
                onChange={(e) => setDemandeQuoi(e.target.value)}
                placeholder={`Traiter la facture ${demandePour.number}.`}
                style={{ padding: '8px 10px', fontSize: 13, resize: 'vertical' }}
              />
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="copper" style={{ flex: 1 }} disabled={!demandeQui} onClick={envoyerLaDemande}>Demander</Button>
              <Button variant="ghost" onClick={() => setDemandePour(null)}>Annuler</Button>
            </div>
          </div>
        </Modal>
      )}

      {auCoffre && (
        <Modal title="Mettre au coffre." onClose={() => setAuCoffre(null)} width={460}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, lineHeight: 1.6, color: 'var(--ink-soft)' }}>
              Facture <b style={{ color: 'var(--color-indigo)' }}>{auCoffre.number}</b> · {auCoffre.clientName ?? clientOf(auCoffre)?.name ?? 'Cliente'}
              {' — '}{fmtMoney(invoiceRegleXof(auCoffre), currency)} reçus.
            </div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>Montant mis de côté</span>
              <input
                className="mnd-input"
                inputMode="numeric"
                value={coffreMontant}
                onChange={(e) => setCoffreMontant(e.target.value)}
                style={{ padding: '8px 10px', fontSize: 13, textAlign: 'right' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>De quelle caisse sort cet argent ?</span>
              <Select value={coffreCaisse} onChange={(e) => setCoffreCaisse(e.target.value)} style={{ fontSize: 12 }}>
                {boxesBranche.map((c) => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
                <option value="">Hors caisse, reçu ailleurs</option>
              </Select>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 10.5, color: 'var(--ink-soft)' }}>
                Elle baissera d'autant : l'argent se déplace, il ne se duplique pas.
              </span>
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="copper" style={{ flex: 1 }} onClick={verserAuCoffre}>Verser au coffre</Button>
              <Button variant="ghost" onClick={() => setAuCoffre(null)}>Annuler</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ══ LE LIEN DU FOYER ══════════════════════════════════════════════
          Le lien ne fait qu'une chose : il porte un MONTANT. C'est donc au
          message de dire ce que ce montant couvre, pièce par pièce — sans quoi
          la payeuse reçoit un chiffre rond sans savoir de quoi il répond. */}
      {lienLibre && (() => {
        const montant = Math.max(0, Math.round(parseInt(lienLibre.montant.replace(/[^0-9]/g, ''), 10) || 0));
        const tete = clients.find((c) => c.id === lienLibre.clientId);
        /* LE NUMÉRO DE LA FICHE, MODIFIABLE. Une cliente donne parfois celui de
           son mari, ou paie depuis un autre téléphone : imposer la fiche
           obligerait à la corriger pour un seul envoi. */
        const tel = (lienLibre.tel || tete?.phone || '').replace(/\D/g, '');
        const lien = montant > 0 ? lienPaiementMomo(montant) : null;
        const prenom = (tete?.name ?? '').split(' ')[0];
        const motif = lienLibre.motif.trim();
        const msg = lien ? signeLeMessage(
          `${maisonNom()}\n`
          + `${prenom ? `Bonjour ${prenom}, pour` : 'Pour'} régler ${fmtMoney(montant, currency)} par Mobile Money, `
          + `ouvrez cette page : le code à composer s'y affiche, montant compris.\n${lien}`
          + (motif ? `\n${motif}` : ''),
        ) : '';
        return (
          <Modal title="Un lien de paiement" onClose={() => setLienLibre(null)} width={480}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
              <div className="mnd-muted" style={{ fontSize: 12.5, lineHeight: 1.65 }}>
                Un montant, un lien, et le message part. Sans facture ni rendez-vous derrière :
                pour un acompte convenu au téléphone, un flacon mis de côté, une avance.
              </div>

              <Field label="Le montant à réclamer">
                <Input
                  inputMode="numeric"
                  autoFocus
                  value={lienLibre.montant}
                  onChange={(e) => setLienLibre({ ...lienLibre, montant: e.target.value.replace(/[^0-9]/g, '') })}
                  placeholder="45000"
                  style={{ textAlign: 'right', fontSize: 20, fontFamily: 'var(--font-serif)' }}
                />
              </Field>

              {/* LA TÊTE EST FACULTATIVE : le lien vaut par son montant, pas par
                  son destinataire. La nommer sert au message et au numéro. */}
              <Field label="Pour qui · facultatif">
                <ClientPicker
                  value={lienLibre.clientId}
                  onChange={(id) => {
                    const c = clients.find((x) => x.id === id);
                    setLienLibre({ ...lienLibre, clientId: id, tel: c?.phone ?? lienLibre.tel });
                  }}
                />
              </Field>

              <Field label="Le numéro qui reçoit">
                <Input
                  inputMode="tel"
                  value={lienLibre.tel}
                  onChange={(e) => setLienLibre({ ...lienLibre, tel: e.target.value })}
                  placeholder="+229…"
                />
              </Field>

              {/* CE QUE LE MONTANT PAIE, EN TROIS MOTS. Un lien nu se lit comme
                  une réclamation sans cause, et c'est ce qui fait appeler la
                  Maison pour comprendre. */}
              <Field label="Ce que cela règle · facultatif">
                <Input
                  value={lienLibre.motif}
                  onChange={(e) => setLienLibre({ ...lienLibre, motif: e.target.value })}
                  placeholder="Acompte sur la pose du 12 septembre"
                />
              </Field>

              {montant > 0 && !lien && (
                <div className="tre-inline-note">
                  <span className="mark">!</span>
                  <span>Le paiement Mobile Money n’est pas réglé pour cette Maison. Paramètres → Automatisations.</span>
                </div>
              )}

              {lien && (
                <div style={{ border: '1px solid var(--hairline)', borderRadius: 3, padding: '11px 13px', background: 'var(--surface-card)' }}>
                  <div className="mnd-eyebrow" style={{ fontSize: 9.5, marginBottom: 6 }}>Ce qu’elle recevra</div>
                  <div style={{ fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'var(--ink-soft)' }}>{msg}</div>
                </div>
              )}

              {/* IL RÉCLAME, IL N'ENCAISSE PAS — et sans pièce derrière, rien ne
                  suivra tout seul. On le dit ici, là où le geste se fait. */}
              <div className="mnd-muted" style={{ fontSize: 11.5, lineHeight: 1.55 }}>
                Ce lien <b>réclame</b>, il n’encaisse pas, et aucune pièce ne le suit. Quand l’argent
                arrive, écrivez-le vous-même : c’est ce qui garde la caisse juste.
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Button variant="ghost" style={{ flex: 1 }} onClick={() => setLienLibre(null)}>Fermer</Button>
                {lien && tel && (
                  <a
                    className="trv-wa-btn" style={{ textDecoration: 'none', flex: 1, textAlign: 'center' }}
                    href={`https://wa.me/${tel}?text=${encodeURIComponent(msg)}`}
                    target="_blank" rel="noreferrer"
                  >
                    {prenom ? `Adresser à ${prenom}` : 'Adresser par WhatsApp'}
                  </a>
                )}
                {lien && (
                  <Button onClick={() => { void navigator.clipboard?.writeText(lien); toast('Lien copié.'); }}>
                    Copier le lien
                  </Button>
                )}
              </div>
            </div>
          </Modal>
        );
      })()}

      {lienFoyer && (() => {
        const prises = lienFoyer.pieces.filter((i) => lienFoyer.prises.includes(i.id));
        const total = prises.reduce((n, i) => n + invoiceResteXof(i), 0);
        const lien = lienPaiementMomo(total);
        /* LA PAYEUSE DU FOYER, PAS LA DERNIÈRE TÊTE SERVIE. C'est elle qui
           règle, et c'est son téléphone qu'on ouvre. */
        const premiere = clientOf(prises[0] ?? lienFoyer.pieces[0]);
        const payeur = premiere ? clients.find((c) => c.id === payerClientIdOf(premiere, families)) ?? premiere : undefined;
        const tel = payeur?.phone.replace(/\D/g, '') ?? '';
        const msg = signeLeMessage(
          `${maisonNom()}\n`
          + `Bonjour ${(payeur?.name ?? '').split(' ')[0]}, pour régler ${fmtMoney(total, currency)} par Mobile Money, ouvrez cette page : le code à composer s'y affiche, montant compris.\n${lien ?? ''}\n`
          + `Ce règlement couvre :\n${prises.map((i) => `· ${clientNameOf(i)} · ${frDay(i.date)} · ${fmtMoney(invoiceResteXof(i), currency)}`).join('\n')}\n`
          + `Références ${prises.map((i) => i.number).join(', ')}`,
        );
        /* ══ LE RÉCAPITULATIF DU FOYER — 4 septembre 2026 ══════════════
           « Je veux un PDF qui résume leurs 3 RDV avant que j'envoie le lien de
           paiement » (Yéman).

           TROIS PIÈCES SÉPARÉES NE FONT PAS UNE DEMANDE. Envoyer trois PDF puis
           un montant unique oblige la payeuse à additionner elle-même pour
           vérifier ce qu'on lui réclame, et une mère qui additionne de tête
           devant trois papiers finit par appeler la Maison. Le récapitulatif
           dit d'un seul tenant : qui est venue, quel jour, ce qu'elle a reçu,
           ce que cela vaut, et la somme au bas.

           IL NE RÉCLAME RIEN DE PLUS QUE LES PIÈCES QU'IL RÉSUME. Chaque ligne
           porte le montant ÉCRIT sur sa facture, et le total est la somme des
           restes dus, celui-là même que le lien va porter. Deux chiffres qui ne
           se rejoignent pas sur un même envoi se lisent comme une erreur. */
        const recapDuFoyer = async () => {
          if (prises.length === 0) return;
          const foyer = payeur?.familyId
            ? families.find((f) => f.id === payeur.familyId)
            : undefined;
          const sections = prises.map((i) => {
            const regle = invoiceRegleXof(i);
            const rows: { label: string; value?: string; strong?: boolean; sub?: boolean }[] = [];
            for (const l of i.lines) {
              rows.push({
                label: l.qty > 1 ? `${l.label} ×${l.qty}` : l.label,
                value: fmtMoney(Math.round(ligneNetXof(l)), currency),
              });
              /* CE QUE LE FORFAIT CONTIENT SUIT SUR LE RÉCAPITULATIF AUSSI :
                 c'est là que la Maison montre ce qu'elle donne, et c'est ce
                 papier-là que le parent lit avant de payer. */
              for (const t of contenuDeLaLigne(i, l)) rows.push({ label: t, sub: true });
            }
            if (regle > 0) rows.push({ label: 'Déjà réglé', value: `− ${fmtMoney(regle, currency)}` });
            rows.push({ label: 'Reste à régler', value: fmtMoney(invoiceResteXof(i), currency), strong: true });
            return { heading: `${clientNameOf(i)} · ${frDay(jourDuPassage(i))} · ${i.number}`, rows };
          });
          await summaryPdf({
            eyebrow: 'Avant règlement',
            title: foyer?.name ?? `Le foyer de ${(payeur?.name ?? '').split(' ')[0]}`,
            houseName: maisonNom(),
            meta: [
              `${prises.length} rituels · ${branch.name}`,
              `Références ${prises.map((i) => i.number).join(', ')}`,
            ],
            sections,
            total: { label: 'À régler pour le foyer', value: fmtMoney(total, currency) },
            footer: 'Ce récapitulatif ne réclame rien de plus que les pièces qu’il résume.',
            filename: `recapitulatif-foyer-${prises.map((i) => i.number).join('-')}.pdf`,
          });
          toast('Récapitulatif téléchargé.');
        };

        const bascule = (id: string) => setLienFoyer((prev) => (prev ? {
          ...prev,
          prises: prev.prises.includes(id) ? prev.prises.filter((x) => x !== id) : [...prev.prises, id],
        } : prev));
        return (
          <Modal title="Un seul lien pour le foyer" onClose={() => setLienFoyer(null)} width={520}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
              <div className="mnd-muted" style={{ fontSize: 12.5, lineHeight: 1.65 }}>
                Cochez ce que ce règlement couvre. Un seul code à composer, un seul montant, et le
                message dit à qui appartient chaque ligne.
              </div>
              <div style={{ border: '1px solid var(--hairline)', borderRadius: 3 }}>
                {lienFoyer.pieces.map((i) => {
                  const prise = lienFoyer.prises.includes(i.id);
                  return (
                    <label
                      key={i.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 11, padding: '10px 13px',
                        borderTop: '1px solid var(--hairline)', cursor: 'pointer', fontSize: 13,
                        opacity: prise ? 1 : 0.55,
                      }}
                    >
                      <input type="checkbox" checked={prise} onChange={() => bascule(i.id)} style={{ accentColor: 'var(--color-copper)' }} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <b style={{ fontWeight: 500, color: 'var(--color-indigo)' }}>{clientNameOf(i)}</b>
                        <span className="mnd-muted" style={{ display: 'block', fontSize: 11 }}>
                          {frDay(i.date)} · {i.number}
                        </span>
                      </span>
                      <span style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--color-indigo)', fontVariantNumeric: 'tabular-nums' }}>
                        {fmtMoney(invoiceResteXof(i), currency)}
                      </span>
                    </label>
                  );
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, borderTop: '1px solid var(--hairline)', paddingTop: 12 }}>
                <span className="mnd-eyebrow" style={{ fontSize: 9.5 }}>Un seul règlement</span>
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 26, color: 'var(--color-indigo)' }}>{fmtMoney(total, currency)}</span>
              </div>
              {!lien && (
                <div className="tre-inline-note">
                  <span className="mark">!</span>
                  <span>Le paiement Mobile Money n’est pas réglé pour cette Maison. Paramètres → Automatisations.</span>
                </div>
              )}
              {/* CE QUI RESTE À FAIRE À LA MAIN SE DIT. Le lien porte un montant,
                  il ne solde rien : l'argent arrivé se pointe pièce par pièce. */}
              <div className="mnd-muted" style={{ fontSize: 11.5, lineHeight: 1.55 }}>
                Ce lien <b>réclame</b>, il n’encaisse pas. Quand l’argent arrive, pointez chaque
                pièce à son montant : c’est ce qui garde les comptes de chaque tête justes.
              </div>
              {/* LE RÉCAPITULATIF PART AVANT LE LIEN, et le bouton est donc
                  AVANT lui : l'ordre des gestes à l'écran est l'ordre de la
                  conversation avec la payeuse. */}
              <Button variant="ghost" disabled={prises.length === 0} onClick={() => void recapDuFoyer()}>
                Récapitulatif des {prises.length} rituels · PDF
              </Button>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Button variant="ghost" style={{ flex: 1 }} onClick={() => setLienFoyer(null)}>Fermer</Button>
                {lien && tel && (
                  <a
                    className="trv-wa-btn" style={{ textDecoration: 'none', flex: 1, textAlign: 'center' }}
                    href={`https://wa.me/${tel}?text=${encodeURIComponent(msg)}`}
                    target="_blank" rel="noreferrer"
                  >
                    Adresser à {(payeur?.name ?? '').split(' ')[0]}
                  </a>
                )}
                {lien && (
                  <Button onClick={() => { void navigator.clipboard?.writeText(lien); toast('Lien copié.'); }}>
                    Copier le lien
                  </Button>
                )}
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* L'APERÇU DE LA FUSION. « Reçu avant » et « reçu après » doivent être
          ÉGAUX sur chaque ligne : c'est l'argent de la cliente, il ne peut ni
          apparaître ni disparaître parce qu'on range des pièces. */}
      {fusions && (
        <Modal title="Rassembler les pièces d'un même rituel." onClose={() => setFusions(null)} width={720}>
          {fusions.length === 0 ? (
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, lineHeight: 1.6 }}>
              Aucun rituel ne porte deux factures. Rien à rassembler.
            </div>
          ) : (
            <>
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, lineHeight: 1.6, marginBottom: 12 }}>
                <strong>{fusions.length} rituel{fusions.length > 1 ? 's' : ''}</strong> portent plusieurs factures.
                Les règlements seront réunis sur la pièce la plus ancienne, détaillée prestation par prestation ;
                les autres numéros disparaîtront du registre.
              </div>
              <div className="trv-conf">
                <div className="trv-conf__head">
                  <span>Pièce gardée</span><span>Fondues</span><span>Reçu avant</span><span>Reçu après</span><span>Versements</span>
                </div>
                {fusions.map((f) => {
                  const bouge = f.recuAvant !== f.recuApres;
                  return (
                    <div key={f.apptId} className={`trv-conf__row${bouge ? ' is-move' : ''}`}>
                      <span>{f.garde.number}</span>
                      <span>{f.fondues.map((x) => x.number).join(', ')}</span>
                      <span>{fmtMoney(f.recuAvant, currency)}</span>
                      <span>{fmtMoney(f.recuApres, currency)}</span>
                      <span>{(f.apres.payments ?? []).length}</span>
                    </div>
                  );
                })}
              </div>
              {fusions.some((f) => f.recuAvant !== f.recuApres) && (
                <div className="trv-pdf-hint" style={{ marginTop: 10, color: 'var(--trv-error)' }}>
                  Une ligne voit l'argent reçu changer, ça ne devrait jamais arriver.
                  N'applique pas, et signale-le-moi.
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <Button variant="copper" style={{ flex: 1 }} onClick={appliquerLesFusions}>
                  Rassembler {fusions.length} rituel{fusions.length > 1 ? 's' : ''}
                </Button>
                <Button variant="ghost" onClick={() => setFusions(null)}>Ne rien changer</Button>
              </div>
            </>
          )}
        </Modal>
      )}

      {/* L'APERÇU AVANT D'ÉCRIRE. La colonne « total » est le contrôle qui
          compte : sur une pièce payée elle doit être IDENTIQUE des deux côtés.
          Une seule ligne où elle bouge, et il faut s'arrêter. */}
      {ecarts && (
        <Modal title="Conformité des pièces au rituel." onClose={() => setEcarts(null)} width={720}>
          {ecarts.length === 0 ? (
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, lineHeight: 1.6 }}>
              Toutes les pièces liées à un rituel disent déjà ce que le rituel dit.
              Rien à corriger.
            </div>
          ) : (
            <>
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, lineHeight: 1.6, marginBottom: 12 }}>
                <strong>{ecarts.length} pièce{ecarts.length > 1 ? 's' : ''}</strong> ne détaille{ecarts.length > 1 ? 'nt' : ''} pas
                le rituel comme le rendez-vous l'écrit. Leurs lignes vont se reconformer.
                Sur une pièce payée, <strong>le total ne bouge pas</strong>, l'écart part en remise ou en ajustement.
              </div>
              <div className="trv-conf">
                <div className="trv-conf__head">
                  <span>Pièce</span><span>Statut</span><span>Total avant</span><span>Total après</span><span>Lignes</span>
                </div>
                {ecarts.map(({ avant, apres }) => {
                  const tAvant = invoiceTotal(avant);
                  const tApres = invoiceTotal(apres);
                  const bouge = tAvant !== tApres;
                  return (
                    <div key={avant.id} className={`trv-conf__row${bouge ? ' is-move' : ''}`}>
                      <span>{avant.number}</span>
                      <span>{avant.status}</span>
                      <span>{fmtMoney(tAvant, currency)}</span>
                      <span>{bouge ? fmtMoney(tApres, currency) : ', inchangé'}</span>
                      <span>{avant.lines.length} → {apres.lines.length}</span>
                    </div>
                  );
                })}
              </div>
              {ecarts.some(({ avant, apres }) => avant.status === 'payée' && invoiceTotal(avant) !== invoiceTotal(apres)) && (
                <div className="trv-pdf-hint" style={{ marginTop: 10, color: 'var(--trv-error)' }}>
                  Une pièce PAYÉE verrait son total changer, ça ne devrait jamais arriver.
                  N'applique pas, et signale-le-moi.
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <Button variant="copper" style={{ flex: 1 }} onClick={appliquerLaConformite}>
                  Reconformer {ecarts.length} pièce{ecarts.length > 1 ? 's' : ''}
                </Button>
                <Button variant="ghost" onClick={() => setEcarts(null)}>Ne rien changer</Button>
              </div>
            </>
          )}
        </Modal>
      )}

    </div>
  );
}
