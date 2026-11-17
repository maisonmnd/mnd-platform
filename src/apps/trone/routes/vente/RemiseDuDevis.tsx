/* ══ LA REMISE DU DEVIS, AUX FACTURES — 17 novembre 2026 ═══════════════════
   « Il ne faut pas permettre d'avoir des bilans sans prendre de RDV sinon
   tout le monde nous trichera » (Yéman). Un devis ne sort de la Maison qu'AU
   rendez-vous : visio tenue, consultation privée faite, ou une cliente déjà
   venue. Le juge est `peutEtreRemis` (shared/devis-remis-pur).

   TOUT CE QUE LES FACTURES FONT DE LA REMISE VIT ICI, pour que `Factures.tsx`
   n'en porte que les appels :
     · `useLaPorteDeLaRemise` : la porte par où sort un devis (« Remettre le
       devis », « Adresser par WhatsApp », Imprimer, PDF), qui le marque
       remis ; ce qui ferme « Confirmer » et « Convertir en facture » ; ce
       qui refuse un enregistrement ;
     · `useUnDevisParConsultation` : la pièce déjà née d'une consultation se
       rouvre, plutôt qu'un second devis ;
     · la pastille du registre, le mot de l'éditeur, le panneau de la pièce,
       et la ligne « Valable jusqu'au » du document.
   Une facture, une commande de la Boutique : rien de tout cela ne les regarde. */
import { useLayoutEffect, type CSSProperties } from 'react';
import { Button } from '../../../../ds/components';
import { demandeUnTexte } from '../../../../ds/demande';
import { consultationsQueueStore } from '../../../../shared/bridges';
import { invoicesStore, type Invoice } from '../../../../shared/finance';
import { deductionDeLaConsultation, motDuDevisEstime, motDuDevisFerme } from '../../../../shared/devis-de-la-consultation-pur';
import { useContexteDeLaRemise } from '../../../../shared/devis-remis';
import {
  dernierJourValable, estPerime, horsRegle, jourDeLInstant, jourEnClair, pastilleDeLaRemise, pieceDeLaConsultation,
  porteDeLaRemise, renouvele, rouvreLaPieceDeLaConsultation, validiteDite, VALIDITE_DU_DEVIS_JOURS, type MarqueDeLaRemise,
  acompteAEnvoyer, motDuLienDeLAcompte,
} from '../../../../shared/devis-remis-pur';
import { frDay, todayISO } from '../clients/_shared';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { maisonNom, signeLeMessage } from '../../../../shared/identite';
import { cheminDeLaConversation } from '../../../../shared/conversations';
import { lienPaiementMomo } from '../equipe/data';
import type { Appointment } from '../../../../shared/agenda';

/** La porte des Factures : la règle pure (`porteDeLaRemise`), avec ce que le Trône lit et l'heure qu'il est. */
export function useLaPorteDeLaRemise(o: {
  /** Écrit la marque de la remise sur la pièce. */
  ecris: (id: string, marque: MarqueDeLaRemise) => void;
  /** Qui remet : le nom de la personne connectée. */
  qui?: string;
  /** Dit un refus à l'écran. */
  dit: (mot: string) => void;
}) {
  return porteDeLaRemise<Invoice>(useContexteDeLaRemise(), todayISO(), { ...o, maintenant: () => new Date().toISOString() });
}

export type PorteDeLaRemise = ReturnType<typeof useLaPorteDeLaRemise>;

/* ── UN DEVIS PAR CONSULTATION ────────────────────────────────────────────
   L'éditeur vient de s'ouvrir sur un devis NEUF préparé depuis une
   consultation (file A : estimé ; file C : ferme). Si cette consultation a
   déjà sa pièce, c'est elle qui s'ouvre, avant que l'écran se peigne. La
   règle est pure (`rouvreLaPieceDeLaConsultation`). */
export function useUnDevisParConsultation(o: {
  /** Le brouillon NEUF en cours, ou null (une modification ne se remplace pas). */
  neuf: Invoice | null;
  argent: (xof: number) => string;
  ouvre: (piece: Invoice, enEdition: boolean, mot: string) => void;
}): void {
  const { neuf } = o;
  useLayoutEffect(() => {
    if (!neuf || neuf.kind !== 'devis' || !neuf.consultationId) return;
    const deja = pieceDeLaConsultation(invoicesStore.get(), neuf.consultationId, neuf.id);
    if (!deja) return;
    const c = consultationsQueueStore.get().find((x) => x.id === neuf.consultationId);
    const r = rouvreLaPieceDeLaConsultation(deja, {
      ferme: neuf.status === 'à valider' && neuf.aValiderPar === 'cliente',
      deduction: c ? deductionDeLaConsultation(c) : null,
      motEstime: c ? motDuDevisEstime(c, o.argent) : '',
      motFerme: c ? motDuDevisFerme(c, o.argent) : (neuf.note ?? ''),
    });
    o.ouvre({ ...r.piece, lines: r.piece.lines.map((l) => ({ ...l })) }, r.enEdition, r.mot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [neuf?.id, neuf?.consultationId]);
}

/* ── CE QUI SE VOIT ───────────────────────────────────────────────────── */

/** La pastille du registre : « à remettre au rendez-vous », « à remettre », « périmé ». */
export function PastilleDeLaRemise({ d, porte }: { d: Invoice; porte: PorteDeLaRemise }) {
  if (horsRegle(d)) return null;
  const e = porte.etatDe(d);
  const mot = estPerime(d, porte.aujourdhui) ? 'périmé' : pastilleDeLaRemise(d, e);
  return mot ? <span className="trv-status trv-status--avalider" title={e.etat === 'attend' ? e.raison : undefined}>{mot}</span> : null;
}

/** Dans l'éditeur : le brouillon se travaille librement ; ce qu'il lui manque pour sortir se dit. */
export function RemiseDuBrouillon({ d, porte }: { d: Invoice; porte: PorteDeLaRemise }) {
  if (d.kind !== 'devis' || horsRegle(d)) return null;
  const e = porte.etatDe(d);
  if (e.etat !== 'attend' && e.etat !== 'a-remettre') return null;
  return (
    <div className="trv-pdf-hint" style={{ textAlign: 'left' }}>
      {e.etat === 'attend'
        ? <>À remettre au rendez-vous. {e.raison} Le devis se travaille ; il ne sortira qu’ensuite.</>
        : <>Le rendez-vous est tenu : une fois créé, ce devis pourra être remis.</>}
    </div>
  );
}

/** Sur le document : jusqu'à quand le devis vaut. */
export function ValiditeDuDevis({ d }: { d: Invoice }) {
  const v = validiteDite(d);
  return v ? <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--ink-soft)', marginTop: 8 }}>{v}.</div> : null;
}

const cadre = (vif: boolean): CSSProperties => ({
  border: '1px solid var(--hairline)', borderLeft: `2px solid ${vif ? 'var(--copper-500)' : 'var(--hairline)'}`, borderRadius: 3,
  background: 'var(--surface-card)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6,
});
const titre: CSSProperties = { fontFamily: 'var(--font-sans)', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--copper-800)', fontWeight: 600 };
const texte: CSSProperties = { fontFamily: 'var(--font-sans)', fontSize: 12, lineHeight: 1.45, color: 'var(--ink)' };

/** Le panneau de la pièce : « Remettre le devis » reste fermé tant que le
    rendez-vous n'a pas eu lieu, et la raison se lit. La direction peut passer
    outre, avec un motif. Remis, il vaut quinze jours ; périmé, il se renouvelle. */
export function PanneauDeLaRemise({ d, porte, estDirection, dit, surRenouveler }: {
  d: Invoice;
  porte: PorteDeLaRemise;
  estDirection: boolean;
  /** Dit ce qui vient de se faire, sous les boutons. */
  dit: (mot: string) => void;
  /** Rouvre le devis renouvelé dans l'éditeur. */
  surRenouveler: (renouvele: Invoice) => void;
}) {
  if (d.kind !== 'devis' || horsRegle(d)) return null;
  const e = porte.etatDe(d);
  const perime = estPerime(d, porte.aujourdhui);

  const remet = () => {
    if (porte.sortLeDevis(d)) dit(`Devis remis : il paraît dans Ma Couronne, et il vaut ${VALIDITE_DU_DEVIS_JOURS} jours.`);
  };
  const passeOutre = async () => {
    if (!estDirection) return;
    const motif = await demandeUnTexte({
      quoi: 'Devis',
      titre: `Remettre ${d.number} sans rendez-vous tenu ?`,
      dit: 'La règle de la Maison : un devis se remet au rendez-vous. Vous pouvez passer outre ; le motif reste écrit sur le devis.',
      etiquette: 'Le motif, en une phrase',
      gabarit: 'Cliente de longue date, vue à la Maison en octobre',
      accepter: 'Remettre le devis',
      refuser: 'Attendre le rendez-vous',
    });
    if (!motif || !motif.trim()) return;
    if (porte.sortLeDevis(d, motif.trim())) dit('Devis remis par la direction, hors règle : le motif est écrit sur le devis.');
  };
  const renouvelle = () => {
    surRenouveler({ ...d, ...renouvele(porte.aujourdhui, new Date().toISOString()) });
    dit(`Devis rouvert, daté d’aujourd’hui : relisez les prix, puis enregistrez. Il repart pour ${VALIDITE_DU_DEVIS_JOURS} jours.`);
  };

  if (e.etat === 'attend') {
    return (
      <div className="trv-remise" style={cadre(true)}>
        <span style={titre}>À remettre au rendez-vous</span>
        <span style={texte}>{e.raison}</span>
        <Button variant="ghost" size="sm" disabled title={e.raison}>Remettre le devis</Button>
        {estDirection && (
          <button className="trv-linkbtn trv-linkbtn--muted" style={{ alignSelf: 'flex-start' }} onClick={() => void passeOutre()}>
            Passer outre, avec un motif
          </button>
        )}
      </div>
    );
  }
  if (e.etat === 'a-remettre') {
    return (
      <div className="trv-remise" style={cadre(true)}>
        <span style={titre}>Le rendez-vous est tenu</span>
        <span style={texte}>Ce devis peut être remis : il paraîtra dans Ma Couronne, et vaudra {VALIDITE_DU_DEVIS_JOURS} jours.</span>
        <Button variant="copper" size="sm" onClick={remet}>Remettre le devis</Button>
      </div>
    );
  }
  if (e.etat !== 'remis') return null;
  const validite = validiteDite(d);
  return (
    <div className="trv-remise" style={cadre(perime)}>
      <span style={titre}>{perime ? 'Devis périmé' : 'Devis remis'}</span>
      <span style={texte}>
        {e.le ? `Remis le ${frDay(jourDeLInstant(e.le))}${e.par ? ` par ${e.par}` : ''}.` : 'Remis avant le 17 novembre 2026.'}
        {e.horsRegle ? ` Hors règle, par la direction : ${e.horsRegle}` : ''}
        {perime
          ? ` Il valait jusqu’au ${jourEnClair(dernierJourValable(d))} : il ne s’envoie plus et ne se confirme plus tel quel.`
          : validite ? ` ${validite}.` : ''}
      </span>
      {perime && <Button variant="copper" size="sm" onClick={renouvelle}>Renouveler le devis</Button>}
    </div>
  );
}

/** L'ACOMPTE DU DEVIS CONFIRMÉ, SON LIEN — 17 novembre 2026. Le rendez-vous né
    du devis porte un acompte demandé ; son lien part d'ici vers la
    conversation de la cliente, par la page Mobile Money de la Maison (le code
    à composer, montant compris). Le comptoir le reconnaît reçu, comme tout
    acompte. */
export function LienDeLAcompte({ d, rdvs, appel, telephone }: { d: Invoice; rdvs: readonly Appointment[]; appel: string; telephone?: string }) {
  const { currency } = useBranch();
  const acompte = acompteAEnvoyer(d, rdvs);
  const tel = String(telephone ?? '').replace(/\D/g, '');
  const lien = acompte > 0 ? lienPaiementMomo(acompte) : null;
  if (!lien || !tel) return null;
  const mot = signeLeMessage(`${maisonNom()}\n${motDuLienDeLAcompte(appel, fmtMoney(acompte, currency), lien)}`);
  return (
    <a className="trv-wa-btn" style={{ textDecoration: 'none' }} href="#" role="button"
      title="La page Mobile Money de la Maison, au montant de l’acompte. Le comptoir le reconnaît reçu."
      onClick={(e) => { e.preventDefault(); window.location.hash = `#${cheminDeLaConversation(tel, mot) ?? '/conversations'}`; }}>
      Envoyer le lien de l’acompte · {fmtMoney(acompte, currency)}
    </a>
  );
}
