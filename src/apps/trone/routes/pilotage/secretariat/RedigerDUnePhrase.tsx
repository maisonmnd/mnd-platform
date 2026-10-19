import { useEffect, useRef, useState } from 'react';
import { Button, Textarea, toast } from '../../../../../ds/components';
import { useStaff } from '../../../../../shared/auth';
import { useStore } from '../../../../../shared/store';
import { demandeAClaude, useSaitIaMaison } from '../../../../../shared/ia-maison';
import { peutDemander } from '../../../../../shared/ia-maison-pur';
import { pourClaude } from '../../../../../shared/ia-anonymise-pur';
import {
  champsDeLaLettre, consigneDeLaLettre, defautDeLaPhrase, EXEMPLE_DE_PHRASE, lectureDeLaLettre, MOT_DU_REFUS_FAMILLE, parleDeLaFamille, SCHEMA_DE_LA_LETTRE,
  type LettreProposee,
} from '../../../../../shared/ia-lettre-pur';
import { effaceLaPiece, metsAJour, pieces, secretariatStore } from '../../../../../shared/secretariat';
import { modifiable, supprimable, type Piece } from '../../../../../shared/secretariat-pur';
import { useEstDirection } from '../../_vie';
import { staffAccessStore } from '../../equipe/data';
import './rediger.css';

/* ══ RÉDIGER D'UNE PHRASE — 19 octobre 2026 (chantier 8, « lettre ») ═════
   Maquette NKQMiMMY… validée : une phrase, et la lettre sort au bon
   registre, sur le papier à en-tête, prête à signer comme aujourd'hui.
   Décision : la direction seule (Yéman et Brice).

   LE CHEMIN EXISTANT, REMPLI : la proposition de Claude devient un brouillon
   créé par `nouvellePiece` (Nouveau document), dont les champs sont remplis
   par `metsAJour`, teintés cuivre « à vérifier » dans l'éditeur. « Garder et
   numéroter » est le bouton « Signer » de l'éditeur ; « Retoucher », c'est
   éditer ; « Une autre » redemande avec la même phrase ; « Écarter »
   efface le brouillon. Ce fichier ne numérote rien et ne signe rien.

   TROIS PORTES AVANT L'APPEL : la direction (`useEstDirection`, et
   `peutDemander` du contrat, qui dit la même chose) ; la fonction posée
   (`useSaitIaMaison`) ; la phrase ne parle pas de la famille
   (`parleDeLaFamille`, sans appel). Puis `pourClaude` retire un numéro ou
   une adresse glissés dans la phrase ; les noms qu'elle a écrits restent. */

const aujourdhuiIso = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** La direction, et la fonction ia-maison posée : alors seulement le bouton se montre. */
export function usePeutRediger(): boolean {
  const direction = useEstDirection();
  const tete = useStaff();
  const [acces] = useStore(staffAccessStore);
  const sait = useSaitIaMaison();
  return direction && sait === true && peutDemander(tete?.role, 'lettre', acces[tete?.user_id ?? '']);
}

/** Demande la lettre à Claude. Rend la proposition relue, ou le mot à dire.
    Le garde-fou de la famille passe AVANT tout appel. */
export async function demandeLaLettre(o: { phrase: string; auNomDe: string; ville?: string; registreImpose?: string }): Promise<{ lettre: LettreProposee } | { message: string }> {
  const defaut = defautDeLaPhrase(o.phrase);
  if (defaut) return { message: defaut };
  if (parleDeLaFamille(o.phrase)) return { message: MOT_DU_REFUS_FAMILLE };
  const r = await demandeAClaude<unknown>({
    chantier: 'lettre',
    usage: 'texte',
    systeme: consigneDeLaLettre({ auNomDe: o.auNomDe, ville: o.ville, dateDuJour: aujourdhuiIso(), registreImpose: o.registreImpose }),
    messages: [{ role: 'user', content: pourClaude(o.phrase.trim()) }],
    schema: SCHEMA_DE_LA_LETTRE,
    maxTokens: 2500,
  });
  if (!r.ok) return { message: r.message };
  /* La phrase dit-elle une civilité ? Sinon, celle que Claude devine tombe. */
  const lettre = lectureDeLaLettre(r.data, o.phrase);
  if (!lettre) return { message: 'Claude n’a rien rendu de lisible : réessayez, ou écrivez la pièce à la main.' };
  if (lettre.refus) return { message: MOT_DU_REFUS_FAMILLE };
  return { lettre };
}

/** Remplit un brouillon avec la proposition (`metsAJour` : un brouillon seulement).
    `texteSeul` : « Une autre » garde le registre de la pièce et ne change que le texte. */
export function remplisLaPiece(p: Piece, lettre: LettreProposee, phrase: string, o: { texteSeul?: boolean } = {}): Piece {
  const champs = champsDeLaLettre(lettre);
  const patch: Partial<Piece> = o.texteSeul
    ? { destinataire: champs.destinataire, objet: champs.objet, corps: champs.corps, ...(champs.cloture !== undefined ? { cloture: champs.cloture } : {}) }
    : champs;
  return metsAJour(p, { ...patch, proposition: { par: 'claude', phrase: phrase.trim(), le: new Date().toISOString() } });
}

/* ── LE CHAMP, DANS « NOUVEAU DOCUMENT » ─────────────────────────────── */
export function RedigerDUnePhrase({ auNomDe, ville, surLettre }: { auNomDe: string; ville?: string; surLettre: (lettre: LettreProposee, phrase: string) => void }) {
  const peut = usePeutRediger();
  const [phrase, setPhrase] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [mot, setMot] = useState('');
  /* La fenêtre fermée pendant que Claude écrit : la réponse tombe, aucun
     brouillon ne naît d'une demande qu'on a quittée. */
  const vivant = useRef(true);
  useEffect(() => { vivant.current = true; return () => { vivant.current = false; }; }, []);
  if (!peut) return null;

  const redige = async () => {
    setMot('');
    setOccupe(true);
    try {
      const r = await demandeLaLettre({ phrase, auNomDe, ville });
      if (!vivant.current) return;
      if ('message' in r) { setMot(r.message); return; }
      surLettre(r.lettre, phrase);
    } finally { if (vivant.current) setOccupe(false); }
  };

  return (
    <div className="sec-rediger" role="group" aria-label="Rédiger d’une phrase">
      <div className="sec-rediger__titre">Rédiger d’une phrase</div>
      <div className="sec-rediger__ligne">
        <Textarea rows={2} value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder={EXEMPLE_DE_PHRASE} aria-label="La phrase" disabled={occupe} />
        <Button variant="copper" onClick={() => void redige()} disabled={occupe || !phrase.trim()}>{occupe ? 'Rédaction…' : 'Rédiger'}</Button>
      </div>
      {mot ? <p className="sec-rediger__mot">{mot}</p> : (
        <p className="sec-rediger__doux">Au nom de {auNomDe}. La pièce arrive en brouillon, ses champs teintés cuivre à vérifier ; rien n’est numéroté avant votre signature. Les papiers de la famille ne passent jamais par Claude.</p>
      )}
    </div>
  );
}

/* ── LE BANDEAU DE LA PROPOSITION, DANS L'ÉDITEUR ────────────────────── */
export function BandeauDeLaProposition({ p, auNomDe, ville, surEcarte }: { p: Piece; auNomDe: string; ville?: string; surEcarte?: () => void }) {
  const peut = usePeutRediger();
  const direction = useEstDirection();
  const [occupe, setOccupe] = useState(false);
  if (!p.proposition || !modifiable(p)) return null;

  const uneAutre = async () => {
    if (!p.proposition) return;
    const phrase = p.proposition.phrase;
    setOccupe(true);
    try {
      const r = await demandeLaLettre({ phrase, auNomDe, ville, registreImpose: p.modele });
      if ('message' in r) { toast(r.message, 6000); return; }
      /* La pièce telle qu'elle est MAINTENANT : ce qu'on a réglé pendant que
         Claude écrivait (signataires, tampon) reste ; signée entre-temps,
         elle ne bouge plus. */
      const actuelle = pieces(secretariatStore.get()).find((x) => x.id === p.id);
      if (!actuelle || !modifiable(actuelle)) { toast('La pièce a changé entre-temps : la nouvelle version n’est pas posée.'); return; }
      remplisLaPiece(actuelle, r.lettre, phrase, { texteSeul: true });
      toast('Une autre version : relisez-la, puis signez quand elle vous va.');
    } finally { setOccupe(false); }
  };

  /* Écarter : le brouillon s'efface, rien n'est gardé (la direction seule, comme « Supprimer le brouillon »). */
  const ecarte = () => {
    if (effaceLaPiece(p)) { toast('Proposition écartée : rien n’a été gardé.'); surEcarte?.(); }
  };

  return (
    <div className="sec-bandeau sec-bandeau--proposition">
      <span>Rédigée d’une phrase par Claude : lisez chaque ligne et retouchez ce qu’il faut, les champs cuivre sont à vérifier. Pour la garder et la numéroter, signez-la comme toute pièce : rien n’est numéroté avant.</span>
      {peut && <Button size="sm" variant="ghost" onClick={() => void uneAutre()} disabled={occupe}>{occupe ? 'Rédaction…' : 'Une autre'}</Button>}
      {direction && supprimable(p) && surEcarte && <Button size="sm" variant="ghost" onClick={ecarte} disabled={occupe}>Écarter</Button>}
    </div>
  );
}
