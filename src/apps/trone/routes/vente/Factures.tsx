import { asset } from '../../../../shared/asset';
import { useSearchParams } from 'react-router-dom';
import { MapPin, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { PageHead } from '../_ui';
import { Button, Select } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { useServices } from '../../../../shared/catalog';
import { useClients } from '../../../../shared/clients';
import { Avatar, ClientPicker, frDay } from '../clients/_shared';
import { rewindPaymentForDeletedInvoice } from '../clients/actions';
import { useInvoices, usePaymentMethods, invoiceTotal, type Invoice, type InvoiceLine, type PaymentMethod } from '../../../../shared/finance';
import { appointmentsStore, type Appointment } from '../../../../shared/agenda';
import { invoicePdf, type InvoicePdfData } from '../../../../shared/pdf';
import { uid } from '../../../../shared/store';
import './vente.css';

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
  Aube: { amb: 'Lumière naissante', verse: 'La beauté n’est pas un instant —\nc’est une habitude que l’on honore.', paths: ['M7 47h34', 'M13 47a11 11 0 0 1 22 0', 'M24 28v-7', 'M37 35l5-5', 'M11 35l-5-5', 'M24 47v9'] },
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

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

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

type EditState = { mode: 'new' | 'edit'; draft: Invoice };

export default function Factures() {
  const { branch, currency } = useBranch();
  const [invoices, setInvoices] = useInvoices();
  const [clients] = useClients();
  const [services] = useServices();
  const [methods] = usePaymentMethods();

  const [statusFilter, setStatusFilter] = useState<'tous' | Invoice['status']>('tous');
  /* Recherche — une cliente, un numéro. La maison cherche « Aïcha » sans accent
     ni majuscule : on compare des chaînes aplaties, sinon « Aicha » ne trouve rien. */
  const [q, setQ] = useState('');
  /* `?id=` ouvre une facture précise depuis ailleurs — Tableau de bord, Analytics,
     mouvements d'une caisse. On ne lit le paramètre qu'UNE fois (état initial) :
     le relire à chaque rendu reprendrait la main sur les clics de la liste. */
  const [params] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(() => params.get('id'));
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
  const filtered = branchDocs
    .filter((d) => statusFilter === 'tous' || d.status === statusFilter)
    .filter((d) => {
      const needle = fold(q);
      if (!needle) return true;
      const c = clients.find((x) => x.id === d.clientId);
      return [d.number, c?.name, d.clientName, c?.phone].some((v) => fold(v).includes(needle));
    });
  /* Les factures d'abord, les devis en dessous — deux registres, une seule feuille. */
  const factures = filtered.filter((d) => d.kind === 'facture');
  const devis = filtered.filter((d) => d.kind === 'devis');

  const selected = branchDocs.find((d) => d.id === selectedId) ?? filtered[0] ?? branchDocs[0] ?? null;

  /* Document affiché dans l’aperçu vivant : le brouillon en cours d’édition, sinon la sélection. */
  const active = editing ? editing.draft : selected;

  /* Position GPS partagée par la cliente (livraison Ma Couronne) — ouvre l'itinéraire. */
  const geoDest = selected ? geoDestFromNote(selected.note) : null;

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
      note: `Devis ${devis.number} accepté — à planifier${svcIds.length === 0 ? ' (prestations à préciser)' : ''}.`,
      source: 'trone',
    };
    appointmentsStore.set((prev) => [...prev, appt]);
    setInvoices((prev) => prev.map((i) => (i.id === devis.id ? { ...i, apptId: appt.id } : i)));
    setWaHint('Devis accepté → rendez-vous créé dans le Carnet. Planifiez le créneau, puis finalisez le paiement.');
  };

  const clientOf = (d: Invoice) => clients.find((c) => c.id === d.clientId);
  const clientNameOf = (d: Invoice) => clientOf(d)?.name ?? d.clientName ?? 'Walk-in';
  const prenomOf = (d: Invoice) => clientNameOf(d).split(' ')[0];

  /* Nom pour le PDF — la cliente au CRM, sinon un nom libre, sinon « Cliente de passage ». */
  const clientNameForPdf = (d: Invoice) => {
    const c = clientOf(d);
    if (c) return c.name;
    const n = d.clientName?.trim();
    return n && n.toLowerCase() !== 'walk-in' ? n : 'Cliente de passage';
  };

  /* Le mot du Maître par défaut, pour un document donné. */
  const defaultNoteFor = (d: Invoice) =>
    `${prenomOf(d)}, ce fut un honneur de veiller sur votre couronne. Elle vous va à merveille. — ${d.master ?? branch.masters[0] ?? 'la Maison'}`;

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
      clientPhone: clientOf(d)?.phone,
      master: d.master,
      lines: d.lines.map((l) => ({
        label: l.label,
        qty: l.qty,
        unit: fmtMoney(l.unitXof, currency),
        total: fmtMoney(Math.round(l.qty * l.unitXof * (1 - l.discountPct / 100)), currency),
      })),
      subtotal: fmtMoney(Math.round(gross), currency),
      discount: disc > 0 ? `− ${fmtMoney(Math.round(disc), currency)}` : undefined,
      total: fmtMoney(net, currency),
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

  const nextNumber = (kind: Invoice['kind']) => {
    const year = new Date().getFullYear();
    const max = invoices.reduce((m, i) => {
      const n = parseInt(i.number.replace(/\D/g, '').slice(-4), 10);
      return Number.isFinite(n) ? Math.max(m, n) : m;
    }, 1042);
    return kind === 'devis' ? `MND-D-${year}-${String(max + 1).padStart(4, '0')}` : `MND-${year}-${String(max + 1).padStart(4, '0')}`;
  };

  const blankDraft = (kind: Invoice['kind']): Invoice => ({
    id: uid(),
    branchId: branch.id,
    kind,
    number: nextNumber(kind),
    clientId: branchClients[0]?.id ?? '',
    date: todayIso(),
    lines: [],
    globalDiscountPct: 0,
    theme: 'Aube',
    status: 'brouillon',
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
    const d = editing.draft;
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
      ? `\n\nCette facture règle le rituel de ${clientNameOf(doc!)} du ${frDay(linked.date)} : sa suppression annule aussi l'encaissement — le rituel redevient impayé et les points Cercle attribués sont repris.`
      : '';
    if (!window.confirm(`Supprimer définitivement ${label} ?${warn} Cette action est irréversible.`)) return;
    if (doc && linked) rewindPaymentForDeletedInvoice(id, invoiceTotal(doc));
    setInvoices((prev) => prev.filter((i) => i.id !== id));
    if (editing?.draft.id === id) setEditing(null);
    if (selectedId === id) setSelectedId(null);
  };


  /* ----- Lignes (agissent sur le brouillon en cours d’édition) ----- */
  const patchLines = (fn: (lines: InvoiceLine[]) => InvoiceLine[]) =>
    setEditing((e) => (e ? { ...e, draft: { ...e.draft, lines: fn(e.draft.lines) } } : e));

  const addServiceLine = (svcId: string) => {
    const svc = services.find((s) => s.id === svcId);
    if (!svc) return;
    patchLines((ls) => [...ls, { id: uid(), label: svc.name, qty: 1, unitXof: svc.priceXof, discountPct: 0 }]);
  };
  const addFreeLine = () => {
    const amt = parseInt(freeAmount.replace(/[^0-9]/g, ''), 10) || 0;
    if (!freeLabel.trim() || amt <= 0) return;
    patchLines((ls) => [...ls, { id: uid(), label: freeLabel.trim(), qty: 1, unitXof: amt, discountPct: 0 }]);
    setFreeLabel('');
    setFreeAmount('');
  };
  const setLine = (id: string, patch: Partial<InvoiceLine>) =>
    patchLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const removeLine = (id: string) => patchLines((ls) => ls.filter((l) => l.id !== id));

  const totals = active
    ? (() => {
        const gross = active.lines.reduce((s, l) => s + l.qty * l.unitXof, 0);
        const afterLines = active.lines.reduce((s, l) => s + l.qty * l.unitXof * (1 - l.discountPct / 100), 0);
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
    const msg =
      `Maison MND · ${label} ${doc.number}\n` +
      `Pour ${prenomOf(doc)} — total ${fmtMoney(invoiceTotal(doc), currency)}.\n` +
      `Votre ${doc.kind === 'devis' ? 'devis' : 'facture'} ${doc.number} est en pièce jointe.\n` +
      `${(doc.note?.trim() || defaultNoteFor(doc))}\nRéglez d’un geste — MTN MoMo · Moov Money.`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
    setWaHint('PDF téléchargé — joignez-le à votre message.');
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
          {d.payment ? (
            <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{d.payment}</span>
          ) : (
            <span style={{ fontSize: 12, color: 'var(--ink-soft)', opacity: 0.5 }}>—</span>
          )}
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
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} style={{ fontSize: 12, maxWidth: 200 }}>
          <option value="tous">Tous les statuts</option>
          <option value="brouillon">Brouillon</option>
          <option value="envoyée">Envoyée</option>
          <option value="payée">Payée</option>
          <option value="acceptée">Acceptée</option>
        </Select>
      </div>

      {/* ===== La feuille — factures d'abord, devis en dessous ===== */}
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
                  <ClientPicker value={draft.clientId} onChange={(id) => patchDraft({ clientId: id })} allowWalkIn />
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
                  {draft.lines.map((l) => (
                    <div key={l.id} style={{ border: '1px solid var(--hairline)', borderRadius: 3, padding: '10px 12px', background: 'var(--surface-card)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <span style={{ minWidth: 0, fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--color-indigo)' }}>{l.label}</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
                          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--ink)' }}>{fmtMoney(Math.round(l.qty * l.unitXof * (1 - l.discountPct / 100)), currency)}</span>
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
                      Aucune prestation — ajoutez-en une ci-dessous.
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
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} · {fmtMoney(s.priceXof, currency)}</option>
                  ))}
                </select>
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <input className="mnd-input" style={{ flex: 1, padding: '8px 10px', fontSize: 12 }} placeholder="Ligne libre — libellé" value={freeLabel} onChange={(e) => setFreeLabel(e.target.value)} />
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
              <button className="trv-wa-btn" onClick={() => void sendWhatsApp()}>Adresser par WhatsApp</button>
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
              ) : (
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--trv-success)', textAlign: 'center' }}>
                  Payée · {selected.payment}
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
                  <div className="trv-doc__brand">Maison MND</div>
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
              <div className="trv-doc__sep">· — ✦ — ·</div>

              <div className="trv-doc__passage">
                Votre passage · {fmtDateFr(active.date)}{active.master ? ` · avec ${active.master}` : ''}
              </div>
              <div style={{ marginTop: 12 }}>
                {active.lines.map((l) => {
                  const net = l.qty * l.unitXof * (1 - l.discountPct / 100);
                  return (
                    <div key={l.id} className="trv-doc__item">
                      <div>
                        <div className="lbl">{l.qty > 1 ? `${l.label} ×${l.qty}` : l.label}</div>
                        {l.discountPct > 0 && <div className="temps">remise −{l.discountPct}%</div>}
                      </div>
                      <div style={{ textAlign: 'right', flex: 'none' }}>
                        {l.discountPct > 0 && <div className="orig">{fmtMoney(l.qty * l.unitXof, currency)}</div>}
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
                    <div className="trv-doc__totline disc"><span>Remise manuelle</span><span>− {fmtMoney(totals.manualDisc, currency)}</span></div>
                  )}
                </>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 14 }}>
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>Total</div>
                <div className="trv-doc__total">{fmtMoney(totals.net, currency)}</div>
              </div>

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

              {active.status === 'payée' && active.payment && (
                <div style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 12, borderTop: '1px solid var(--hairline)' }}>
                  <div style={{ fontFamily: 'var(--font-sans)', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>Réglé par</div>
                  <div style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--color-indigo)' }}>{active.payment}</div>
                </div>
              )}

              <div className="trv-doc__foot">
                <div className="trv-doc__fon">mi nyɔ́ ɖɛkpɛ</div>
                <div className="trv-doc__legal">Maison MND · RCCM CO-B-2024 · {branch.city} · merci de cultiver votre couronne avec nous.</div>
              </div>
            </div>
          </div>
        )}
      </div>

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
          <div className="trc-empty">{q || statusFilter !== 'tous' ? 'Aucune facture pour cette recherche.' : 'Aucune facture — la maison attend son premier encaissement.'}</div>
        )}
        {factures.map(renderRow)}

        <div className="trc-sheet__group">Devis ({devis.length})</div>
        {devis.length === 0 && (
          <div className="trc-empty">{q || statusFilter !== 'tous' ? 'Aucun devis pour cette recherche.' : 'Aucun devis en attente.'}</div>
        )}
        {devis.map(renderRow)}
      </div>

    </div>
  );
}
