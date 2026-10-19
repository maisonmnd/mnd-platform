import { useRef, useState } from 'react';
import { Button, toast } from '../../../../ds/components';
import { useStaff } from '../../../../shared/auth';
import { useStore } from '../../../../shared/store';
import { jourCourtAn } from '../../../../shared/calendrier';
import { useSaitIaMaison } from '../../../../shared/ia-maison';
import { peutDemander } from '../../../../shared/ia-maison-pur';
import {
  annuleCollee, changeLeBrouillon, ecarteLeBrouillon, marqueCollee, proposeUneReponse, reprendsLeBrouillon, useBrouillonsDAvis, usePrepareLesBrouillons,
} from '../../../../shared/ia-avis';
import { compteSansReponse, estSansReponse, idDeLAvis, langueDite, lienDeLAvis, verrouTenu, type AvisAvecReponse } from '../../../../shared/ia-avis-pur';
import { staffAccessStore } from '../equipe/data';

/* ══ LA RÉPONSE PROPOSÉE SOUS UN AVIS GOOGLE — 19 octobre 2026 ══════════
   Chantier 5 (maquette NKQMiMMY…, « Tout me va ») : sous chaque avis sans
   réponse, la proposition de Claude dans sa langue, à relire et retoucher,
   puis « Copier », « Ouvrir l'avis sur Google », « Une autre ». Google
   exige que la réponse soit publiée par la Maison elle-même : on copie, on
   colle. Le Trône n'envoie RIEN à Google.

   Qui voit : la direction, la Clientèle et le Marketing (`peutDemander`),
   et seulement quand la porte `ia-maison` est posée (`useSaitIaMaison`). */

/** La porte : la fonction posée, et le département qui a ce chantier. */
export function usePeutRepondreAuxAvis(): boolean {
  const staff = useStaff();
  const acces = useStore(staffAccessStore)[0];
  const sait = useSaitIaMaison();
  return sait === true && peutDemander(staff?.role, 'avis', acces[staff?.user_id ?? '']);
}

/** L'en-tête du bloc : « N sans réponse », et la préparation des brouillons
    (une fois par ouverture, cinq au plus, un à la fois). */
export function EnTeteDesReponses({ avis }: { avis: AvisAvecReponse[] | null }) {
  const peut = usePeutRepondreAuxAvis();
  const [brouillons] = useBrouillonsDAvis();
  usePrepareLesBrouillons(avis, peut);
  if (!avis || avis.length === 0) return null;
  const n = compteSansReponse(avis, brouillons);
  return (
    <span style={{ fontSize: 12.5, color: n > 0 ? 'var(--copper-700)' : 'var(--trf-success, #4A6B52)' }}>
      {n === 0 ? 'Chaque avis a reçu sa réponse sur Google.' : n === 1 ? '1 avis sans réponse' : `${n} avis sans réponse`}
      {peut && n > 0 ? <span className="mnd-muted">{' · Claude propose une réponse sous chacun : on copie, on colle sur Google.'}</span> : null}
    </span>
  );
}

const Petit = ({ onClick, children, disabled }: { onClick: () => void; children: string; disabled?: boolean }) => (
  <button type="button" className="trc-c360-linkbtn" onClick={onClick} disabled={disabled}>{children}</button>
);

/** Sous un avis : le brouillon, ses trois boutons, et le mot de Google. */
export function ReponseAUnAvis({ avis, fiche }: { avis: AvisAvecReponse; fiche?: string }) {
  const peut = usePeutRepondreAuxAvis();
  const [brouillons] = useBrouillonsDAvis();
  const [occupe, setOccupe] = useState(false);
  const zone = useRef<HTMLTextAreaElement>(null);
  const id = idDeLAvis(avis);
  const b = brouillons[id];
  if (!peut) return null;

  const lien = lienDeLAvis(avis, fiche);
  const enCours = occupe || verrouTenu(b, Date.now());

  /* « Collée » : l'avis a sa réponse, on le dit, et on peut se dédire. */
  if (!estSansReponse(avis, b)) {
    if (!b?.publieeLe) return null;
    return (
      <div style={{ marginLeft: 26, marginTop: 4, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="mnd-muted" style={{ fontSize: 11.5 }}>Réponse collée sur Google le {jourCourtAn(b.publieeLe.slice(0, 10))}</span>
        <Petit onClick={() => annuleCollee(id)}>Finalement non</Petit>
      </div>
    );
  }

  const demande = async () => {
    setOccupe(true);
    try {
      const r = await proposeUneReponse(avis);
      if (!r.ok) toast(r.message);
    } finally { setOccupe(false); }
  };

  const copier = async () => {
    const texte = b?.reponse ?? '';
    if (!texte.trim()) return;
    try {
      await navigator.clipboard.writeText(texte);
      toast('Réponse copiée : collez-la sous l’avis, sur Google.');
    } catch {
      /* Le presse-papiers est fermé (vieux navigateur, page non sécurisée) :
         on sélectionne le texte, et on copie par la commande du navigateur. */
      const z = zone.current;
      if (z) {
        z.focus();
        z.select();
        try {
          if (document.execCommand('copy')) { toast('Réponse copiée : collez-la sous l’avis, sur Google.'); return; }
        } catch { /* on passe au mot */ }
      }
      toast('Le presse-papiers est fermé : le texte est sélectionné, copiez-le vous-même.');
    }
  };

  if (b?.ecarte) {
    return (
      <div style={{ marginLeft: 26, marginTop: 4, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="mnd-muted" style={{ fontSize: 11.5 }}>Sans réponse, par choix de la Maison</span>
        <Petit onClick={() => { reprendsLeBrouillon(id); void demande(); }} disabled={enCours}>Proposer une réponse</Petit>
      </div>
    );
  }

  if (!b?.reponse) {
    return (
      <div style={{ marginLeft: 26, marginTop: 4, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="mnd-muted" style={{ fontSize: 11.5 }}>{enCours ? 'Claude écrit une proposition…' : 'Pas encore de proposition.'}</span>
        {!enCours && <Petit onClick={() => void demande()}>Proposer une réponse</Petit>}
      </div>
    );
  }

  return (
    <div style={{ marginLeft: 26, marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--copper-700)' }}>
          Réponse proposée, en {langueDite(b.langue)}, à vérifier
          {b.le ? <span className="mnd-muted">{` · ${jourCourtAn(b.le.slice(0, 10))}`}</span> : null}
        </span>
        <Petit onClick={() => ecarteLeBrouillon(id)} disabled={enCours}>Écarter</Petit>
      </div>
      <textarea
        className="mnd-textarea"
        ref={zone}
        value={b.reponse}
        onChange={(e) => changeLeBrouillon(id, e.target.value)}
        disabled={enCours}
        rows={Math.min(8, Math.max(3, b.reponse.split('\n').length + 1))}
        aria-label={`Réponse proposée à l’avis de ${avis.auteur || 'sans nom'}`}
        style={{ background: 'var(--copper-50, #FAF1E9)', border: '1px solid var(--copper-300, #E3C9AE)', fontSize: 13, lineHeight: 1.45 }}
      />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button variant="copper" size="sm" onClick={() => void copier()} disabled={enCours}>Copier</Button>
        <a className="mnd-btn mnd-btn--ghost mnd-btn--sm" href={lien} target="_blank" rel="noreferrer">Ouvrir l’avis sur Google</a>
        <Button variant="ghost" size="sm" onClick={() => void demande()} disabled={enCours}>{enCours ? 'Claude écrit…' : 'Une autre'}</Button>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="mnd-muted" style={{ fontSize: 11.5, lineHeight: 1.45 }}>Google exige que la réponse soit publiée par vous : on copie, on colle.</span>
        <Petit onClick={() => marqueCollee(id)} disabled={enCours}>J’ai collé la réponse sur Google</Petit>
      </div>
    </div>
  );
}
