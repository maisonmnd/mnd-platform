import { useEffect, useRef, useState } from 'react';
import { Button, demande, toast } from '../../../../ds/components';
import { useStaff } from '../../../../shared/auth';
import { useStore } from '../../../../shared/store';
import { staffAccessStore } from '../equipe/data';
import { demandeAClaude, useSaitIaMaison } from '../../../../shared/ia-maison';
import { peutDemander } from '../../../../shared/ia-maison-pur';
import type { Fil } from '../../../../shared/conversations';
import { useContexteDeLaReponse } from './contexte-de-la-reponse';
import {
  SCHEMA_DE_LA_REPONSE, consigneDeLaReponse, etatDeLaZone, filOuvertAClaude, lectureDeLaReponse, zoneAProteger,
} from '../../../../shared/ia-reponse-wa-pur';
import './reponse-proposee.css';

/* ══ « PROPOSER UNE RÉPONSE » — 19 octobre 2026 ═══════════════════════════
   Chantier 4 des huit (maquette NKQMiMMY…) : dans le composeur du fil
   ouvert, un bouton. Claude lit le fil, sa fiche (civilité, prochain
   rendez-vous, reste dû) et le catalogue, et écrit dans la voix de la Maison
   (`ia-reponse-wa-pur`). La proposition REMPLIT la zone de saisie, où on la
   relit et la corrige ; « Envoyer » est le bouton qui existait déjà, et le
   seul chemin de départ : ce composant n'envoie rien, n'écrit rien.
   « Une autre » redemande, en disant à Claude ce qu'on a écarté ;
   « Écarter » vide la zone.

   LE BOUTON SE TAIT tant que la fonction `ia-maison` n'est pas posée
   (`useSaitIaMaison`), pour qui n'a pas le chantier (`peutDemander` : la
   direction, le département Clientèle), et sur un fil qui n'est pas celui
   d'une cliente ou qu'elle a marqué privé (`filOuvertAClaude`). L'automate
   de réservation ne change pas : il ne sait rien de ce bouton.

   REPRISE DU 19 OCTOBRE 2026, au soir :
     · le reste dû est celui de SA FICHE, du même juge (le rituel fait foi,
       `ecrituresDuCompte`, comme le panneau du compte) : les factures seules
       oubliaient un rituel honoré sans pièce et comptaient un prépayé. Depuis
       le 21 novembre 2026 ce contexte se compose dans
       `contexte-de-la-reponse.ts`, que Perle lit aussi : une seule source ;
     · la zone porte mot pour mot la proposition : elle se teinte cuivre,
       « à vérifier » ; ce que la main a écrit ou retouché ne se remplace
       qu'après lui avoir demandé ;
     · une réponse qui arrive après qu'on a changé de fil, ou pendant qu'on
       écrivait, ne se pose pas : elle irait dans la mauvaise zone. */
export function ReponseProposee({ fil, texte, occupe, surProposition }: {
  fil: Fil;
  /** Ce que la zone de saisie porte en ce moment. */
  texte: string;
  /** Un envoi est en cours : on ne redemande pas pendant ce temps. */
  occupe?: boolean;
  /** Pose un texte dans la zone de saisie (le parent la relit, puis envoie ou
      non) ; un texte vide la vide. */
  surProposition: (texte: string) => void;
}) {
  /* Les crochets, tous, AVANT le premier retour (banc verifie-l-ordre-des-crochets). */
  const moi = useStaff();
  const [acces] = useStore(staffAccessStore);
  const sait = useSaitIaMaison();
  /* Le fil, sa fiche, son compte et le catalogue : la même source que Perle. */
  const contexteDe = useContexteDeLaReponse();
  const [etat, setEtat] = useState<'' | 'cherche'>('');
  /** La dernière proposition posée dans la zone. */
  const [derniere, setDerniere] = useState<string | null>(null);
  /** Celle qu'on a écartée : « Une autre » la dit à Claude. */
  const [ecartee, setEcartee] = useState<string | null>(null);
  /* La zone telle qu'elle est À L'ARRIVÉE de la réponse, pas au départ. */
  const zoneVive = useRef(texte);
  zoneVive.current = texte;
  /* Un fil quitté (la clé change) ne reçoit plus rien de sa demande. */
  const vivant = useRef(true);
  useEffect(() => { vivant.current = true; return () => { vivant.current = false; }; }, []);
  /* La zone vidée (« Envoyer » l'a fait partir, ou la main l'a effacée) : la
     proposition n'y est plus, et ce qu'on écrira ensuite est à la main. */
  useEffect(() => { if (!texte.trim()) setDerniere(null); }, [texte]);
  /* Un nouveau message dans le fil (elle a écrit, la Maison a envoyé) : ce
     qu'on avait écarté répondait à la question d'avant. */
  const dernierMessage = fil.dernier?.id;
  useEffect(() => { setEcartee(null); }, [dernierMessage]);

  if (sait !== true || !filOuvertAClaude(fil) || !peutDemander(moi?.role, 'reponse-wa', acces[moi?.user_id ?? ''])) return null;

  const zone = etatDeLaZone(texte, derniere);

  const demander = async () => {
    if (etat === 'cherche' || occupe) return;
    if (zoneAProteger(texte, derniere) && !await demande({
      quoi: 'Proposition de Claude',
      titre: 'Remplacer ce que vous avez écrit ?',
      dit: 'La proposition de Claude prendrait la place du texte de la zone de saisie.',
      accepter: 'Remplacer par une proposition',
      refuser: 'Garder mon texte',
    })) return;
    const auDepart = zoneVive.current;
    const aEcarter = zone === 'proposee' || zone === 'retouchee' ? derniere : ecartee;
    setEtat('cherche');
    /* Sans agenda : le bouton du composeur ne passe aucune place, Claude n'en promet aucune. */
    const contexte = contexteDe(fil, { dejaProposee: aEcarter ?? undefined });
    const r = await demandeAClaude<{ reponse?: unknown }>({
      chantier: 'reponse-wa', usage: 'texte', systeme: consigneDeLaReponse(),
      messages: [{ role: 'user', content: contexte }],
      schema: SCHEMA_DE_LA_REPONSE,
      maxTokens: 300,
    });
    if (!vivant.current) return;
    setEtat('');
    if (!r.ok) { toast(`Pas de proposition : ${r.message}`); return; }
    const proposee = lectureDeLaReponse(r.data);
    if (!proposee) {
      toast('Claude n’a rien rendu d’envoyable (un numéro, un mot banni, ou rien du tout) : réessayez, ou écrivez vous-même.');
      return;
    }
    if (zoneVive.current !== auDepart && zoneAProteger(zoneVive.current, derniere)) {
      toast('Vous avez écrit pendant que Claude cherchait : votre texte reste, sa proposition ne le remplace pas.');
      return;
    }
    setDerniere(proposee);
    setEcartee(null);
    surProposition(proposee);
    toast('Proposition posée dans la zone : relisez, changez un mot, puis Envoyer.');
  };

  const ecarter = () => {
    setEcartee(derniere);
    setDerniere(null);
    surProposition('');
  };

  const libelle = etat === 'cherche' ? 'Claude écrit…'
    : zone === 'proposee' || zone === 'retouchee' ? 'Une autre' : 'Proposer une réponse';

  return (
    <span className="trc-reponse-proposee" data-reponse-proposee={etat === 'cherche' ? 'cherche' : zone === 'proposee' ? 'a-verifier' : 'prete'}>
      <Button
        variant="ghost"
        size="sm"
        disabled={etat === 'cherche' || !!occupe}
        title="Claude lit le fil, sa fiche et le catalogue, et propose une réponse dans la voix de la Maison. Rien ne part sans vous."
        onClick={() => void demander()}
      >
        {libelle}
      </Button>
      {zone === 'proposee' && etat !== 'cherche' && (
        <>
          <Button variant="ghost" size="sm" disabled={!!occupe} onClick={ecarter}>Écarter</Button>
          <span className="trc-pill trc-pill--attente trc-reponse-proposee__dit">Proposition de Claude, à vérifier avant d’envoyer.</span>
        </>
      )}
    </span>
  );
}
