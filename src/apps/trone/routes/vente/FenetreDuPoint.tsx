import { useMemo, useState } from 'react';
import { Button, Modal, toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { useClients, useFamilies } from '../../../../shared/clients';
import { useInvoices, invoiceResteXof, type Invoice } from '../../../../shared/finance';
import { invoicePdf } from '../../../../shared/pdf';
import { payeurDuCompte, phraseDuPoint, piecesDuPoint, SEUIL_DU_POINT } from '../../../../shared/point-du-compte-pur';
import { frShortAn } from '../clients/_shared';
import { pdfDuFoyer, useLaPieceEnPdf } from './pdf-de-la-piece';
import { useEnvoiDeLaPiece } from './envoi-de-la-piece';

/* ══ LE POINT DU COMPTE — 28 octobre 2026 ════════════════════════════════
   « Comment envoyer le point à leur père, avec un lien de paiement ? J'ai
   plusieurs clients qui accumulent 4 ou 5 factures avant de payer »
   (Yéman). Une seule fenêtre, ouverte de trois endroits (la fiche, le menu
   ⋯ du Carnet, une facture dans Factures) : toutes les factures que le
   compte doit encore, au payeur d'aujourd'hui, en un PDF et un message, avec
   un seul lien. Elle remplace « Un seul lien pour le foyer », qui ne valait
   que pour les comptes famille. Les règles : shared/point-du-compte-pur.ts ;
   l'envoi : envoi-de-la-piece.ts (`point`). */

/** LE POINT D'UNE TÊTE : le payeur de son compte et les factures qu'il doit encore. */
export function usePointDuCompte(teteId: string | undefined): { payeurId: string; pieces: Invoice[]; totalXof: number; ouvert: boolean } {
  const { branch } = useBranch();
  const [clients] = useClients();
  const [families] = useFamilies();
  const [invoices] = useInvoices();
  return useMemo(() => {
    if (!teteId) return { payeurId: '', pieces: [], totalXof: 0, ouvert: false };
    const payeurId = payeurDuCompte(teteId, clients, families);
    const pieces = piecesDuPoint({ payeurId, tetes: clients, comptes: families, pieces: invoices, branchId: branch.id, resteDe: invoiceResteXof });
    return { payeurId, pieces, totalXof: pieces.reduce((n, p) => n + invoiceResteXof(p), 0), ouvert: pieces.length >= SEUIL_DU_POINT };
  }, [teteId, clients, families, invoices, branch.id]);
}

export function FenetreDuPoint({ teteId, onClose }: { teteId: string; onClose: () => void }) {
  const { currency } = useBranch();
  const [clients] = useClients();
  const [families] = useFamilies();
  const { payeurId, pieces } = usePointDuCompte(teteId);
  const { clientNameOf, contenuDeLaLigne, sousLeVerrou, reglagesMnd } = useLaPieceEnPdf();
  const envoi = useEnvoiDeLaPiece();
  const [decochees, setDecochees] = useState<string[]>([]);
  const [enCours, setEnCours] = useState(false);

  const payeur = clients.find((c) => c.id === payeurId);
  const famille = families.find((f) => f.payerClientId === payeurId) ?? families.find((f) => f.id === payeur?.familyId);
  const prises = pieces.filter((p) => !decochees.includes(p.id));
  const total = prises.reduce((n, p) => n + invoiceResteXof(p), 0);
  const numero = payeur?.phone?.trim() ?? '';
  const sansRdv = prises.filter((p) => !p.apptId).length;
  const bascule = (id: string) => setDecochees((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));

  /* LE PDF D'ABORD, SI ELLE VEUT LE VOIR : le même papier que celui qui part. */
  const voirLePdf = async () => {
    if (prises.length === 0 || !payeur) return;
    const t = new Date();
    const jour = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    await invoicePdf(pdfDuFoyer({
      titre: 'POINT DU COMPTE', nomDuFichier: 'Point-du-compte', pieces: prises, jourIso: jour,
      client: { name: famille?.name ?? payeur.name, phone: payeur.phone }, houseSub: sousLeVerrou,
      nomDe: clientNameOf, contenuDe: contenuDeLaLigne, fmt: (n) => fmtMoney(n, currency), reglages: reglagesMnd,
      note: `${phraseDuPoint(prises)}. Ce point ne réclame rien de plus que les factures qu’il résume.`,
    }));
    toast('Point du compte téléchargé.');
  };

  /* EN UN TOUCHER : le PDF et le lien partent ensemble. La clé est à la
     minute (renvoi) : renvoyer le point plus tard le refait, un double toucher
     n'en envoie qu'un, et le bouton se tait pendant l'envoi. */
  const envoyer = async () => {
    if (enCours) return;
    setEnCours(true);
    try {
      const r = await envoi.point(payeurId, prises.map((p) => p.id), { renvoi: true });
      if (r?.ok) onClose();
    } finally {
      setEnCours(false);
    }
  };

  return (
    <Modal title="Le point du compte" onClose={onClose} width={540}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', fontSize: 13, borderBottom: '1px solid var(--hairline)', paddingBottom: 11 }}>
          <span>
            Pour <b style={{ fontWeight: 500, color: 'var(--color-indigo)' }}>{payeur?.name ?? 'personne'}</b>
            {famille ? <>, payeur du compte {famille.name}</> : ''}
          </span>
          <span className="mnd-muted">{numero || 'pas de numéro'}</span>
        </div>

        {!numero && (
          <div className="tre-inline-note">
            <span className="mark">!</span>
            <span>Le payeur du compte n’a pas de numéro. Ajoutez-le sur sa fiche, ou désignez un autre payeur dans Finances › Comptes.</span>
          </div>
        )}

        <div style={{ border: '1px solid var(--hairline)', borderRadius: 3 }}>
          {pieces.map((i) => {
            const prise = !decochees.includes(i.id);
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
                    {frShortAn(i.date)} · {i.number}{i.apptId ? '' : ' · sans rendez-vous'}
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
          <span className="mnd-eyebrow" style={{ fontSize: 9.5 }}>À régler en une fois</span>
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 26, color: 'var(--color-indigo)' }}>{fmtMoney(total, currency)}</span>
        </div>

        {/* CE QUE LE LIEN FERA SE DIT. « Régler » encaisse et solde chaque
            facture ; le code Tap & Go du total réclame, et se pointe à la main. */}
        <div className="mnd-muted" style={{ fontSize: 11.5, lineHeight: 1.55 }}>
          {sansRdv > 0
            ? <>{sansRdv > 1 ? `${sansRdv} factures n’ont` : 'Une facture n’a'} pas de rendez-vous : le lien sera le code Tap & Go du total. Quand l’argent arrive, pointez chaque facture à son montant.</>
            : <>Le lien mène à la page « Régler » (KkiaPay, Mobile Money ou carte) quand la fonction du serveur la sait ; payé, chaque facture est soldée à son montant. Sinon, le code Tap & Go du total, à pointer à la main.</>}
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Button variant="ghost" style={{ flex: 1 }} disabled={prises.length === 0} onClick={() => void voirLePdf()}>Voir le PDF</Button>
          <Button style={{ flex: 1 }} disabled={prises.length < 1 || !numero || enCours} onClick={() => void envoyer()}>
            {enCours ? 'Envoi…' : 'Envoyer sur WhatsApp'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** LE BOUTON DU POINT : il ne paraît que si le compte doit au moins deux
    factures ; sur une seule, il doublerait l'envoi de la facture. */
export function BoutonDuPoint({ teteId, onOpen, className = 'trv-act', libelle = 'Le point du compte', court = false }: {
  teteId?: string; onOpen: (teteId: string) => void; className?: string; libelle?: string;
  /** Le libellé seul, là où le montant se lit déjà à côté (la fiche). */
  court?: boolean;
}) {
  const { currency } = useBranch();
  const { pieces, totalXof, ouvert } = usePointDuCompte(teteId);
  if (!teteId || !ouvert) return null;
  return (
    <button type="button" className={className} onClick={() => onOpen(teteId)}>
      {court ? libelle : `${libelle} · ${pieces.length} factures · ${fmtMoney(totalXof, currency)}`}
    </button>
  );
}
