import { useState } from 'react';
import { Button, toast } from '../../../../ds/components';
import { useStaff } from '../../../../shared/auth';
import { useStore } from '../../../../shared/store';
import { staffAccessStore } from '../equipe/data';
import { demandeAClaude, useSaitIaMaison } from '../../../../shared/ia-maison';
import { peutDemander } from '../../../../shared/ia-maison-pur';
import { useClients } from '../../../../shared/clients';
import { useAppointments } from '../../../../shared/agenda';
import { useCategories, useServices } from '../../../../shared/catalog';
import { invoiceResteXof, invoicesStore } from '../../../../shared/finance';
import type { Fil } from '../../../../shared/conversations';
import {
  SCHEMA_DE_LA_REPONSE, consigneDeLaReponse, contextePourClaude, derniereVenueDe, isoDuJourLocal,
  lectureDeLaReponse, lignesDuCataloguePourClaude, prochainRdvDe,
} from '../../../../shared/ia-reponse-wa-pur';

/* ══ « PROPOSER UNE RÉPONSE » — 19 octobre 2026 ═══════════════════════════
   Chantier 4 des huit (maquette NKQMiMMY…) : dans le composeur du fil
   ouvert, un bouton. Claude lit le fil, sa fiche (civilité, prochain
   rendez-vous, reste dû) et le catalogue, et écrit dans la voix de la Maison
   (`ia-reponse-wa-pur`). La proposition REMPLIT la zone de saisie, où on la
   relit et la corrige ; « Envoyer » est le bouton qui existait déjà, et le
   seul chemin de départ : ce composant n'envoie rien, n'écrit rien.
   « Une autre » redemande, en disant à Claude ce qu'on a écarté.

   LE BOUTON SE TAIT tant que la fonction `ia-maison` n'est pas posée
   (`useSaitIaMaison`) et pour qui n'a pas le chantier (`peutDemander` :
   la direction, le département Clientèle). L'automate de réservation ne
   change pas : il ne sait rien de ce bouton. */
export function ReponseProposee({ fil, occupe, surProposition }: {
  fil: Fil;
  /** Un envoi est en cours : on ne redemande pas pendant ce temps. */
  occupe?: boolean;
  /** Pose la proposition dans la zone de saisie (le parent la relit, puis envoie ou non). */
  surProposition: (texte: string) => void;
}) {
  /* Les crochets, tous, AVANT le premier retour (banc verifie-l-ordre-des-crochets). */
  const moi = useStaff();
  const [acces] = useStore(staffAccessStore);
  const sait = useSaitIaMaison();
  const [clients] = useClients();
  const [rendezVous] = useAppointments();
  const [services] = useServices();
  const [categories] = useCategories();
  const [factures] = useStore(invoicesStore);
  const [etat, setEtat] = useState<'' | 'cherche' | 'echec'>('');
  const [motif, setMotif] = useState('');
  /** La dernière proposition posée dans la zone : « Une autre » la dit à Claude. */
  const [derniere, setDerniere] = useState<string | null>(null);

  if (sait !== true || !peutDemander(moi?.role, 'reponse-wa', acces[moi?.user_id ?? ''])) return null;

  const demander = async () => {
    if (etat === 'cherche' || occupe) return;
    setEtat('cherche');
    setMotif('');
    const fiche = fil.clientId ? clients.find((c) => c.id === fil.clientId) : undefined;
    const aujourdhui = isoDuJourLocal(new Date());
    const nomDe = (id: string) => services.find((s) => s.id === id)?.name ?? '';
    /* Le reste dû : les factures (jamais les devis) qui ne sont pas soldées,
       les siennes et celles où elle est la tête soignée d'un compte famille. */
    const resteDu = fiche
      ? factures
        .filter((f) => f.kind === 'facture' && f.status !== 'brouillon' && (f.clientId === fiche.id || f.forClientId === fiche.id))
        .reduce((s, f) => s + invoiceResteXof(f), 0)
      : undefined;
    const contexte = contextePourClaude({
      fil: fil.messages,
      fiche,
      nomProfil: fil.sansFiche ? fil.nom : undefined,
      prochainRdv: fiche ? prochainRdvDe(rendezVous, fiche.id, aujourdhui, nomDe) : null,
      derniereVenue: fiche ? derniereVenueDe(rendezVous, fiche.id, aujourdhui, nomDe) : null,
      resteDu,
      /* Sans agenda : le Trône ne calcule pas les places libres (le serveur
         les juge pour le site et l'automate) ; Claude n'en promet aucune. */
      catalogue: lignesDuCataloguePourClaude(services, categories),
      aujourdhui,
      dejaProposee: derniere ?? undefined,
    });
    const r = await demandeAClaude<{ reponse?: unknown }>({
      chantier: 'reponse-wa', usage: 'texte', systeme: consigneDeLaReponse(),
      messages: [{ role: 'user', content: contexte }],
      schema: SCHEMA_DE_LA_REPONSE,
      maxTokens: 300,
    });
    if (!r.ok) { setEtat('echec'); setMotif(r.message); return; }
    const texte = lectureDeLaReponse(r.data);
    if (!texte) {
      setEtat('echec');
      setMotif('Claude n’a rien rendu d’envoyable (un numéro, un mot banni, ou rien du tout) : réessayez, ou écrivez vous-même.');
      return;
    }
    setDerniere(texte);
    setEtat('');
    surProposition(texte);
    toast('Proposition posée dans la zone : relisez, changez un mot, puis Envoyer.');
  };

  return (
    <span className="trc-reponse-proposee" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }} data-reponse-proposee={etat || (derniere ? 'posee' : 'prete')}>
      <Button
        variant="ghost"
        size="sm"
        disabled={etat === 'cherche' || !!occupe}
        title="Claude lit le fil, sa fiche et le catalogue, et propose une réponse dans la voix de la Maison. Rien ne part sans vous."
        onClick={() => void demander()}
      >
        {etat === 'cherche' ? 'Claude écrit…' : derniere ? 'Une autre' : 'Proposer une réponse'}
      </Button>
      {derniere && etat !== 'cherche' && (
        <span className="trc-pill trc-pill--attente" style={{ fontSize: 11 }}>Proposition de Claude dans la zone, à relire avant d’envoyer.</span>
      )}
      {etat === 'echec' && <span className="trc-sub" role="alert" style={{ fontSize: 11 }}>{motif}</span>}
    </span>
  );
}
