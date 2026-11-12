import { useEffect, useRef, useState } from 'react';
import { Button, Input } from '../../../../ds/components';
import { fmtMoney } from '../../../../shared/currency';
import { estUnNumeroMtn, msisdnDe, raisonDiteALaCliente } from '../../../../shared/collecte-mtn-pur';
import { SANS_SERVEUR, demandeDuTrone, statutDeLaCollecte } from '../finances/collecte-mtn';

/* ══ « PAYER PAR MTN » DANS LA FENÊTRE ENCAISSER — 11 novembre 2026 ═════
   « Il faut mettre Payer par MTN » (Yéman, devant « Encaisser le rituel »).
   La demande part du Trône vers le numéro MTN de la cliente, pour CE
   rendez-vous : la fonction collecte-mtn calcule le reste de la pièce au
   serveur, la cliente valide avec son code secret, et l'argent se pose sur
   la pièce à la réponse de MTN, caisse « MTN Collection ». Le Trône
   n'écrit rien lui-même : il émet la pièce si elle manque, attend qu'elle
   soit au serveur, puis relit MTN jusqu'à la réponse. */

type Etat =
  | { k: 'pret' }
  | { k: 'piece' }
  | { k: 'envoi' }
  | { k: 'attente'; reference: string; montantXof: number }
  | { k: 'recu'; montantXof: number }
  | { k: 'refuse'; dit: string }
  | { k: 'delai'; reference: string }
  | { k: 'erreur'; dit: string };

const ERREURS: Record<string, string> = {
  fermee: 'Le règlement par MTN est fermé aux clientes : il s’ouvre dans Finances › Encaissements.',
  indisponible: 'MTN ne répond pas pour l’instant. Réessayez, ou encaissez autrement.',
  numero: 'Ce numéro ne se lit pas : dix chiffres, commençant par 01.',
  annule: 'Ce rendez-vous est annulé.',
  deja_reglee: 'Cette séance est déjà réglée.',
  en_cours: 'Une demande MTN attend déjà sa validation pour ce rendez-vous.',
  personnel: 'Votre session ne permet pas d’envoyer la demande. Reconnectez-vous au Trône.',
  introuvable: 'Le rendez-vous n’est pas encore au serveur. Réessayez dans un instant.',
  trop: 'Trop de demandes d’un coup. Patientez une minute.',
  registre: 'Le registre MTN n’a pas pu être écrit. Réessayez.',
};

const ATTENTE_PIECE_MS = 2500;
const ESSAIS_PIECE = 16;
const RELECTURE_MS = 4000;
const RELECTURES = 60;

const numeroDeDepart = (tel: string | undefined): string => {
  const m = msisdnDe(tel ?? '');
  if (!m || !estUnNumeroMtn(m)) return '';
  const local = m.slice(3);
  return local.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
};

/** LE CHOIX DU MOYEN (12 novembre 2026) : un serveur muet ou « indisponible »
    est une panne, le choix passe alors à FedaPay ; « fermée » dit que le
    règlement par MTN n'est pas ouvert. Un refus de la cliente n'est ni l'un
    ni l'autre. */
const PANNES_MTN = new Set(['indisponible', SANS_SERVEUR]);

export function PayerParMtnAuTrone({ rdvId, telephone, resteXof, pourboireXof, currency, emetLaPiece, onRegle, onOccupe, onPanne, onFerme, onReussite }: {
  rdvId: string;
  telephone?: string;
  resteXof: number;
  pourboireXof: number;
  currency: string;
  /** Émet la pièce du rendez-vous si elle manque ; faux quand elle ne peut pas naître. */
  emetLaPiece: () => { ok: boolean; erreur?: string };
  onRegle: () => void;
  /** Une demande est partie (ou part) : on ne bascule plus. */
  onOccupe?: (occupe: boolean) => void;
  onPanne?: () => void;
  onFerme?: () => void;
  onReussite?: () => void;
}) {
  const [numero, setNumero] = useState(() => numeroDeDepart(telephone));
  const [etat, setEtat] = useState<Etat>({ k: 'pret' });
  const vivant = useRef(true);
  useEffect(() => () => { vivant.current = false; }, []);
  const occupeLa = etat.k === 'piece' || etat.k === 'envoi' || etat.k === 'attente' || etat.k === 'delai' || etat.k === 'recu';
  useEffect(() => { onOccupe?.(occupeLa); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [occupeLa]);

  const lu = msisdnDe(numero);
  const mtn = !!lu && estUnNumeroMtn(lu);
  const occupe = etat.k === 'piece' || etat.k === 'envoi' || etat.k === 'attente';
  const total = resteXof + Math.max(0, pourboireXof);

  const relis = async (reference: string) => {
    for (let i = 0; i < RELECTURES && vivant.current; i++) {
      await new Promise((ok) => window.setTimeout(ok, RELECTURE_MS));
      const s = await statutDeLaCollecte(reference);
      if (!vivant.current) return;
      if (s.etat === 'recu') { setEtat({ k: 'recu', montantXof: s.montantXof ?? total }); return; }
      if (s.etat === 'refuse') { setEtat({ k: 'refuse', dit: raisonDiteALaCliente(s.raison) }); return; }
    }
    if (vivant.current) setEtat({ k: 'delai', reference });
  };

  const envoie = async () => {
    if (!lu) { setEtat({ k: 'erreur', dit: ERREURS.numero }); return; }
    const p = emetLaPiece();
    if (!p.ok) { setEtat({ k: 'erreur', dit: `La facture ne peut pas être émise : ${p.erreur ?? 'raison inconnue'}.` }); return; }
    setEtat({ k: 'piece' });
    /* LA PIÈCE MONTE AU SERVEUR PAR LA SYNCHRO : on redemande tant qu'elle
       n'y est pas, quelques secondes au plus. */
    for (let i = 0; i < ESSAIS_PIECE && vivant.current; i++) {
      const r = await demandeDuTrone(rdvId, lu, pourboireXof);
      if (!vivant.current) return;
      if (r.reference) {
        onReussite?.();
        if (r.etat === 'refuse') { setEtat({ k: 'refuse', dit: raisonDiteALaCliente(r.raison) }); return; }
        setEtat({ k: 'attente', reference: r.reference, montantXof: r.montantXof ?? total });
        void relis(r.reference);
        return;
      }
      const code = r.erreur ?? '';
      if (code !== 'sans_piece' && code !== 'introuvable') {
        setEtat({ k: 'erreur', dit: ERREURS[code] ?? code ?? 'La demande n’a pas pu partir.' });
        if (PANNES_MTN.has(code)) onPanne?.();
        if (code === 'fermee') onFerme?.();
        return;
      }
      setEtat({ k: 'envoi' });
      await new Promise((ok) => window.setTimeout(ok, ATTENTE_PIECE_MS));
    }
    if (vivant.current) setEtat({ k: 'erreur', dit: 'La facture n’est pas encore arrivée au serveur. Vérifiez « Synchronisé » en haut, puis réessayez.' });
  };

  const BLOC = { background: 'var(--color-indigo)', color: 'var(--color-ivoire)', borderRadius: 'var(--radius-md)', padding: 12, fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: 1.5, display: 'grid', gap: 8 } as const;

  if (etat.k === 'recu') {
    return (
      <div style={BLOC} role="status">
        <span>Réglé par MTN · {fmtMoney(etat.montantXof, currency)} → caisse « MTN Collection ». La pièce est soldée, rien d’autre à encaisser.</span>
        <Button variant="copper" onClick={onRegle}>Fermer</Button>
      </div>
    );
  }

  return (
    <div style={BLOC}>
      <span>
        La demande part sur son téléphone : <b>{fmtMoney(total, currency)}</b>
        {pourboireXof > 0 ? `, dont ${fmtMoney(pourboireXof, currency)} de pourboire` : ''}. Elle valide avec son code secret ; aucun frais pour elle.
      </span>
      {(etat.k === 'pret' || etat.k === 'erreur' || etat.k === 'refuse' || etat.k === 'delai') && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Input value={numero} onChange={(e) => setNumero(e.target.value)} inputMode="tel" placeholder="Son numéro MTN, 01 …" aria-label="Numéro MTN de la cliente" style={{ maxWidth: 200 }} />
          <Button variant="copper" disabled={occupe || !lu} onClick={() => { void envoie(); }}>
            {etat.k === 'pret' ? 'Envoyer la demande MTN' : 'Renvoyer la demande'}
          </Button>
        </div>
      )}
      {lu && !mtn && etat.k === 'pret' && <span style={{ color: 'var(--copper-200)' }}>Ce numéro ne semble pas MTN : vérifiez-le avant d’envoyer.</span>}
      {etat.k === 'piece' && <span aria-live="polite">La facture se prépare…</span>}
      {etat.k === 'envoi' && <span aria-live="polite">La facture monte au serveur, la demande part dans un instant…</span>}
      {etat.k === 'attente' && <span aria-live="polite">Demande envoyée : {fmtMoney(etat.montantXof, currency)}. Qu’elle valide sur son téléphone ; rien ne s’affiche ? *880# puis « Mes approbations ».</span>}
      {etat.k === 'delai' && <span>Pas encore de réponse de MTN. Le Trône continue de relire tout seul : la ligne apparaîtra dans Finances › Encaissements dès que MTN confirme.</span>}
      {etat.k === 'refuse' && <span role="alert">Refusé : {etat.dit}</span>}
      {etat.k === 'erreur' && <span role="alert">{etat.dit}</span>}
    </div>
  );
}
