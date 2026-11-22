import { useEffect, useRef, useState } from 'react';
import { Button, toast } from '../../../../ds/components';
import { fmtMoney } from '../../../../shared/currency';
import { useAppointments } from '../../../../shared/agenda';
import { useInvoices } from '../../../../shared/finance';
import { adresseDuLien, poseLeLienDeReglement } from '../../../../shared/regler-la-seance';
import { lisLeLien, regleLeLien, type PageDuLien } from '../../../../shared/regler-la-seance-serveur';
import { etatDuLien, laPieceDuRdv, type PieceLue } from '../../../../shared/regler-la-seance-pur';
import { estUnePanneDeKkiapay, payWithKkiapay } from '../../../../shared/kkiapay-widget';
import { QrDuPaiement } from '../vente/MndPay';

/* ══ KKIAPAY DANS LA FENÊTRE ENCAISSER — 22 novembre 2026 ════════════════
   « Il reste le QR code du TPE ou de la carte, et KkiaPay MTN, Moov et
   Celtiis en paiement API » (Yéman), puis au sélecteur « après Payer par
   MTN » et « le QR de son rendez-vous ».

   LES DEUX PASSENT PAR LE LIEN « RÉGLER » DE SON RENDEZ-VOUS, comme la page
   que reçoit la cliente : le Trône émet la pièce si elle manque, pose le
   jeton du rendez-vous (`poseLeLienDeReglement`), attend que la fonction
   `regler-la-seance` les voie au serveur, puis :
     · KKIAPAY (Mobile money) : la fenêtre de KkiaPay s'ouvre ICI, sur le
       Trône ; la caissière tape son numéro (MTN, Moov ou Celtiis), la
       demande part sur son téléphone. KkiaPay ne publie pas d'API qui
       demande l'argent depuis un serveur : sa fenêtre est le chemin. Son
       numéro de transaction part à la fonction, qui redemande la vérité à
       KkiaPay et pose l'argent sur la pièce, caisse KkiaPay ;
     · LE QR (Carte) : l'adresse du lien, à scanner ; la page « Régler »
       s'ouvre sur SON téléphone, elle paie par KkiaPay (carte ou mobile
       money), et le serveur pose l'argent pareil. Le Trône le voit sur la
       pièce et le dit.
   Le Trône n'écrit jamais l'argent lui-même : la part ne s'encaisse pas
   ici, comme « Payer par MTN ». Les frais de KkiaPay s'ajoutent pour elle,
   chez KkiaPay. */

type Commun = {
  rdvId: string;
  currency: string;
  /** Émet la pièce du rendez-vous si elle manque ; faux quand elle ne peut pas naître. */
  emetLaPiece: () => { ok: boolean; erreur?: string };
  onRegle: () => void;
  onOccupe?: (occupe: boolean) => void;
};

const ATTENTE_PIECE_MS = 2500;
const ESSAIS_PIECE = 16;
const RELECTURE_MS = 5000;
const attends = (ms: number) => new Promise((ok) => { window.setTimeout(ok, ms); });

/** LA PIÈCE ÉMISE, LE LIEN POSÉ, PUIS LA PAGE LUE AU SERVEUR : la pièce et
    le jeton montent par la synchro, on relit quelques secondes au plus. */
async function prepareLeLien(rdvId: string, emetLaPiece: Commun['emetLaPiece'], vivant: () => boolean):
  Promise<{ jeton: string; page: PageDuLien } | { erreur: string }> {
  const p = emetLaPiece();
  if (!p.ok) return { erreur: `La facture ne peut pas être émise : ${p.erreur ?? 'raison inconnue'}.` };
  const jeton = poseLeLienDeReglement(rdvId);
  if (!jeton) return { erreur: 'Le rendez-vous est introuvable sur ce poste.' };
  for (let i = 0; i < ESSAIS_PIECE && vivant(); i++) {
    const r = await lisLeLien(jeton);
    if (r.page?.etat === 'a-regler' && r.page.resteXof > 0) return { jeton, page: r.page };
    if (r.page?.etat === 'reglee') return { erreur: 'Cette séance est déjà réglée.' };
    if (r.page?.etat === 'annule') return { erreur: 'Ce rendez-vous est annulé.' };
    if (r.error === 'hors_ligne' || r.error === 'reseau') return { erreur: 'Le Trône est hors ligne : KkiaPay demande le réseau.' };
    await attends(ATTENTE_PIECE_MS);
  }
  return { erreur: 'La facture n’est pas encore arrivée au serveur. Vérifiez « Synchronisé » en haut, puis réessayez.' };
}

const BLOC = {
  background: 'var(--color-indigo)', color: 'var(--color-ivoire)', borderRadius: 'var(--radius-md)', padding: 12,
  fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: 1.5, display: 'grid', gap: 8,
} as const;

/* ── KKIAPAY, LA FENÊTRE OUVERTE SUR LE TRÔNE ── */
type EtatKkia =
  | { k: 'pret' }
  | { k: 'prepare' }
  | { k: 'fenetre'; montantXof: number }
  | { k: 'verifie'; montantXof: number }
  | { k: 'recu'; montantXof: number; aVoir?: boolean }
  | { k: 'erreur'; dit: string };

export function PayerParKkiapayAuTrone({ rdvId, currency, emetLaPiece, onRegle, onOccupe, telephone, nom, resteXof, pourboireXof, onPanne, onReussite }: Commun & {
  telephone?: string;
  nom?: string;
  resteXof: number;
  pourboireXof: number;
  onPanne?: () => void;
  onReussite?: () => void;
}) {
  const [etat, setEtat] = useState<EtatKkia>({ k: 'pret' });
  const vivant = useRef(true);
  /* Chaque ouverture a son numéro : la réponse d'une fenêtre remplacée ne touche plus l'écran. */
  const tour = useRef(0);
  useEffect(() => () => { vivant.current = false; }, []);
  const occupe = etat.k === 'prepare' || etat.k === 'fenetre' || etat.k === 'verifie' || etat.k === 'recu';
  useEffect(() => { onOccupe?.(occupe); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [occupe]);
  const pourboire = Math.max(0, Math.round(pourboireXof) || 0);

  const ouvre = async () => {
    const n = ++tour.current;
    const encore = () => vivant.current && tour.current === n;
    setEtat({ k: 'prepare' });
    const prep = await prepareLeLien(rdvId, emetLaPiece, encore);
    if (!encore()) return;
    if ('erreur' in prep) { setEtat({ k: 'erreur', dit: prep.erreur }); return; }
    const montant = prep.page.resteXof + pourboire;
    setEtat({ k: 'fenetre', montantXof: montant });
    let transactionId = '';
    try {
      transactionId = (await payWithKkiapay({
        amountXof: montant, partnerId: prep.page.reference, branchId: prep.page.branchId,
        ...(telephone ? { phone: telephone } : {}), ...(nom ? { name: nom } : {}),
      })).transactionId;
    } catch (e) {
      if (!encore()) return;
      if (estUnePanneDeKkiapay(e)) onPanne?.();
      setEtat({ k: 'erreur', dit: e instanceof Error ? e.message : 'Le paiement n’a pas abouti.' });
      return;
    }
    if (!encore()) return;
    setEtat({ k: 'verifie', montantXof: montant });
    const r = await regleLeLien(prep.jeton, transactionId);
    if (!encore()) return;
    if (r.ok) { onReussite?.(); setEtat({ k: 'recu', montantXof: montant }); return; }
    /* L'argent est chez KkiaPay ; son filet le posera sur la pièce dès que le serveur le verra. */
    if (r.error === 'reseau' || r.error === 'hors_ligne') { setEtat({ k: 'recu', montantXof: montant, aVoir: true }); return; }
    setEtat({ k: 'erreur', dit: r.error === 'deja_reglee'
      ? 'La séance était déjà réglée : ce paiement est à lui rendre.'
      : 'Le paiement est enregistré chez KkiaPay et la Maison le vérifie. Ne faites pas payer une seconde fois.' });
  };

  if (etat.k === 'recu') {
    return (
      <div style={BLOC} role="status" data-kkiapay-au-trone="recu">
        <span>
          {etat.aVoir
            ? <>Payé chez KkiaPay · {fmtMoney(etat.montantXof, currency)}. Le réseau a coupé avant la réponse du serveur : la pièce se soldera seule dès qu’il verra le paiement (caisse KkiaPay).</>
            : <>Réglé par KkiaPay · {fmtMoney(etat.montantXof, currency)} → caisse « KkiaPay ». La pièce est soldée, rien d’autre à encaisser.</>}
        </span>
        <Button variant="copper" onClick={onRegle}>Fermer</Button>
      </div>
    );
  }
  const total = resteXof + pourboire;
  return (
    <div style={BLOC} data-kkiapay-au-trone={etat.k}>
      <span>
        KkiaPay s’ouvre ici : tapez son numéro (MTN, Moov ou Celtiis), la demande part sur son téléphone et elle confirme.
        {' '}<b>{fmtMoney(total, currency)}</b>{pourboire > 0 ? `, dont ${fmtMoney(pourboire, currency)} de pourboire` : ''} ; KkiaPay ajoute ses frais pour elle.
      </span>
      {(etat.k === 'pret' || etat.k === 'erreur') && (
        <Button variant="copper" onClick={() => { void ouvre(); }}>{etat.k === 'pret' ? `Ouvrir KkiaPay · ${fmtMoney(total, currency)}` : 'Rouvrir KkiaPay'}</Button>
      )}
      {etat.k === 'prepare' && <span aria-live="polite">La facture monte au serveur, KkiaPay s’ouvre dans un instant…</span>}
      {etat.k === 'fenetre' && (
        <span style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
          <span aria-live="polite">KkiaPay est ouvert : {fmtMoney(etat.montantXof, currency)}. Qu’elle confirme sur son téléphone.</span>
          <button type="button" className="tre-link-btn" style={{ color: 'var(--copper-200)' }} onClick={() => { tour.current += 1; setEtat({ k: 'pret' }); }}>
            KkiaPay fermé sans payer
          </button>
        </span>
      )}
      {etat.k === 'verifie' && <span aria-live="polite">Payé : le serveur le vérifie chez KkiaPay…</span>}
      {etat.k === 'erreur' && <span role="alert">{etat.dit}</span>}
    </div>
  );
}

/* ── LE QR DE SON RENDEZ-VOUS : elle paie sur son téléphone ── */
type EtatQr =
  | { k: 'pret' }
  | { k: 'prepare' }
  | { k: 'qr'; jeton: string; adresse: string; resteXof: number }
  | { k: 'erreur'; dit: string };

export function QrDuReglementEnLigne({ rdvId, currency, emetLaPiece, onRegle, onOccupe, resteXof }: Commun & { resteXof: number }) {
  const [etat, setEtat] = useState<EtatQr>({ k: 'pret' });
  const [regleEnLigne, setRegleEnLigne] = useState<number | null>(null);
  const vivant = useRef(true);
  useEffect(() => () => { vivant.current = false; }, []);
  const occupe = etat.k === 'prepare' || etat.k === 'qr';
  useEffect(() => { onOccupe?.(occupe); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [occupe]);

  /* LE TRÔNE LE VOIT SUR LA PIÈCE : le serveur y pose le règlement, la synchro l'apporte. */
  const [rdvs] = useAppointments();
  const [pieces] = useInvoices();
  const rdv = rdvs.find((a) => a.id === rdvId) ?? null;
  const piece = laPieceDuRdv(pieces as unknown as PieceLue[], rdvId);
  const lu = etatDuLien(rdv as unknown as Parameters<typeof etatDuLien>[0], piece);
  useEffect(() => {
    if (etat.k === 'qr' && lu.etat === 'reglee' && regleEnLigne === null) setRegleEnLigne(lu.recuXof);
  }, [etat.k, lu.etat, lu.recuXof, regleEnLigne]);
  /* Et la fonction, relue doucement : la synchro peut avoir du retard. */
  useEffect(() => {
    if (etat.k !== 'qr' || regleEnLigne !== null) return;
    const jeton = etat.jeton;
    const t = window.setInterval(() => {
      void lisLeLien(jeton).then((r) => {
        if (vivant.current && r.page?.etat === 'reglee') setRegleEnLigne(r.page.recuXof);
      });
    }, RELECTURE_MS);
    return () => window.clearInterval(t);
  }, [etat, regleEnLigne]);

  const montre = async () => {
    setEtat({ k: 'prepare' });
    const prep = await prepareLeLien(rdvId, emetLaPiece, () => vivant.current);
    if (!vivant.current) return;
    if ('erreur' in prep) { setEtat({ k: 'erreur', dit: prep.erreur }); return; }
    setEtat({ k: 'qr', jeton: prep.jeton, adresse: adresseDuLien(prep.jeton), resteXof: prep.page.resteXof });
  };
  const copie = async (adresse: string) => {
    try { await navigator.clipboard.writeText(adresse); toast('Lien copié.'); } catch { toast('Le lien n’a pas pu être copié.'); }
  };

  if (regleEnLigne !== null) {
    return (
      <div style={BLOC} role="status" data-qr-du-reglement="regle">
        <span>Réglé en ligne par KkiaPay · {fmtMoney(regleEnLigne, currency)} → caisse « KkiaPay ». La pièce est soldée, rien d’autre à encaisser.</span>
        <Button variant="copper" onClick={onRegle}>Fermer</Button>
      </div>
    );
  }
  if (etat.k === 'qr') {
    return (
      <div style={{ ...BLOC, background: 'var(--surface-card)', color: 'var(--color-indigo)', border: '1px solid var(--hairline)' }} data-qr-du-reglement="qr">
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <QrDuPaiement valeur={etat.adresse} />
          <div style={{ display: 'grid', gap: 8, flex: '1 1 200px', minWidth: 0 }}>
            <span>Elle scanne : la page « Régler » de son rendez-vous s’ouvre sur son téléphone. Elle paie <b>{fmtMoney(etat.resteXof, currency)}</b> par KkiaPay, carte ou mobile money ; KkiaPay ajoute ses frais pour elle.</span>
            <Button variant="ghost" size="sm" style={{ justifySelf: 'start' }} onClick={() => { void copie(etat.adresse); }}>Copier le lien</Button>
          </div>
        </div>
        <span aria-live="polite" style={{ color: 'var(--ink-soft)' }}>Elle paie sur son téléphone… le Trône le verra seul.</span>
      </div>
    );
  }
  return (
    <div style={BLOC} data-qr-du-reglement={etat.k}>
      <span>Un QR à l’écran : elle paie <b>{fmtMoney(resteXof, currency)}</b> sur son téléphone, par KkiaPay (carte ou mobile money), et le serveur pose le règlement sur sa pièce.</span>
      {(etat.k === 'pret' || etat.k === 'erreur') && (
        <Button variant="copper" onClick={() => { void montre(); }}>{etat.k === 'pret' ? 'Montrer le QR' : 'Réessayer'}</Button>
      )}
      {etat.k === 'prepare' && <span aria-live="polite">La facture monte au serveur, le QR arrive dans un instant…</span>}
      {etat.k === 'erreur' && <span role="alert">{etat.dit}</span>}
    </div>
  );
}
