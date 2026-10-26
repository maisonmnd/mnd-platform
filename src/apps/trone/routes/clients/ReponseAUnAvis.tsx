import { useRef, useState } from 'react';
import { Button, toast } from '../../../../ds/components';
import { useStaff } from '../../../../shared/auth';
import { useStore } from '../../../../shared/store';
import { jourCourtAn } from '../../../../shared/calendrier';
import { useSaitIaMaison } from '../../../../shared/ia-maison';
import { peutDemander } from '../../../../shared/ia-maison-pur';
import {
  annuleCollee, changeLeBrouillon, ecarteLeBrouillon, marqueCollee, marquePublieeParLeTrone, proposeUneReponse, reprendsLeBrouillon, useBrouillonsDAvis, usePrepareLesBrouillons,
} from '../../../../shared/ia-avis';
import { publieSurGoogle, useEtatDuPont } from '../../../../shared/avis-google-pont';
import { peutPublier } from '../../../../shared/avis-google-pont-pur';
import { compteSansReponse, estSansReponse, idDeLAvis, jourLocalDe, langueDite, lienDeLAvis, verrouTenu, type AvisAvecReponse } from '../../../../shared/ia-avis-pur';
import { staffAccessStore } from '../equipe/data';

/* ══ LA RÉPONSE PROPOSÉE SOUS UN AVIS GOOGLE — 19 octobre 2026 ══════════
   Chantier 5 (maquette NKQMiMMY…, « Tout me va ») : sous chaque avis sans
   réponse, la proposition de Claude dans sa langue, à relire et retoucher,
   puis « Copier », « Ouvrir l'avis sur Google », « Une autre ». Google
   exige que la réponse soit publiée par la Maison elle-même : on copie, on
   colle. Le Trône n'envoie RIEN à Google.

   Qui voit : la direction, la Clientèle et le Marketing (`peutDemander`),
   et seulement quand la porte `ia-maison` est posée (`useSaitIaMaison`).

   25 OCTOBRE 2026 : « PUBLIER SUR GOOGLE », PAR LE PONT DE MAKE. Quand la
   fonction `avis-google-pont` dit que son webhook est posé, la réponse part
   d'ici : « Publier sur Google », puis « Oui, publier » sous la question
   qui nomme l'autrice. Deux touchers, après lecture ; rien ne part seul.
   Sans le pont, le copier-coller reste, inchangé. */

/** La porte : la fonction posée, et le département qui a ce chantier. */
export function usePeutRepondreAuxAvis(): boolean {
  const staff = useStaff();
  const acces = useStore(staffAccessStore)[0];
  const sait = useSaitIaMaison();
  return sait === true && peutDemander(staff?.role, 'avis', acces[staff?.user_id ?? '']);
}

/** L'en-tête du bloc : « N sans réponse », et la préparation des brouillons
    (une fois par ouverture, cinq au plus, un à la fois). Sans la porte, rien :
    le relevé ne porte pas les réponses déjà publiées sur Google, le compte
    ne veut dire quelque chose qu'avec les « répondu » notés ici. */
export function EnTeteDesReponses({ avis }: { avis: AvisAvecReponse[] | null }) {
  const peut = usePeutRepondreAuxAvis();
  const [brouillons] = useBrouillonsDAvis();
  usePrepareLesBrouillons(avis, peut);
  if (!peut || !avis || avis.length === 0) return null;
  const n = compteSansReponse(avis, brouillons);
  return (
    <span style={{ fontSize: 12.5, color: n > 0 ? 'var(--copper-700)' : 'var(--trf-success, #4A6B52)' }}>
      {n === 0 ? 'Chaque avis a reçu sa réponse sur Google.' : n === 1 ? '1 avis sans réponse' : `${n} avis sans réponse`}
      {n > 0 ? <span className="mnd-muted">{' · Claude propose une réponse sous chacun : on copie, on colle sur Google.'}</span> : null}
    </span>
  );
}

const Petit = ({ onClick, children, disabled }: { onClick: () => void; children: string; disabled?: boolean }) => (
  <button type="button" className="trc-c360-linkbtn" onClick={onClick} disabled={disabled}>{children}</button>
);

/** Sous un avis : le brouillon, ses trois boutons, et le mot de Google.
    `sansRetrait` (20 octobre 2026) : dans l'onglet « Les avis Google », le
    bloc vit dans le panneau de l'avis, sans le retrait sous la case à cocher. */
export function ReponseAUnAvis({ avis, fiche, sansRetrait }: { avis: AvisAvecReponse; fiche?: string; sansRetrait?: boolean }) {
  const retrait = sansRetrait ? 0 : 26;
  const peut = usePeutRepondreAuxAvis();
  const [brouillons] = useBrouillonsDAvis();
  const [occupe, setOccupe] = useState(false);
  /* 25 octobre 2026 : « répondre depuis ici », aussi sans Claude. La zone
     s'ouvre vide, et ce qu'on y tape est le brouillon (Claude ne repasse
     pas sur un avis qui a déjà un texte). */
  const [aLaMain, setALaMain] = useState(false);
  const [confirme, setConfirme] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const pont = useEtatDuPont();
  const staff = useStaff();
  const acces = useStore(staffAccessStore)[0];
  const zone = useRef<HTMLTextAreaElement>(null);
  const id = idDeLAvis(avis);
  const b = brouillons[id];
  if (!peut) return null;
  /* Le pont posé, et un département qui publie (le même que la fonction juge). */
  const parLePont = pont?.publie === true && peutPublier(staff?.role, acces[staff?.user_id ?? '']);

  const lien = lienDeLAvis(avis, fiche);
  const enCours = occupe || verrouTenu(b, Date.now());

  /* « Collée » : l'avis a sa réponse, on le dit, et on peut se dédire. */
  if (!estSansReponse(avis, b)) {
    if (!b?.publieeLe) return null;
    if (b.parLeTrone) {
      return (
        <div style={{ marginLeft: retrait, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11.5, color: 'var(--trf-success, #4A6B52)' }}>Publié sur Google depuis le Trône, le {jourCourtAn(jourLocalDe(b.publieeLe))}</span>
          {b.reponse ? <span className="mnd-muted" style={{ fontSize: 12.5, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>« {b.reponse} »</span> : null}
        </div>
      );
    }
    return (
      <div style={{ marginLeft: retrait, marginTop: 4, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="mnd-muted" style={{ fontSize: 11.5 }}>Répondu sur Google, noté le {jourCourtAn(jourLocalDe(b.publieeLe))}</span>
        <Petit onClick={() => annuleCollee(id)}>Finalement non</Petit>
      </div>
    );
  }

  /* 19 octobre 2026 (reprise) : le relevé ne porte pas les réponses déjà
     publiées (Places ne les rend pas). Un avis auquel la Maison a répondu
     AVANT ce chantier se dit ici, d'une touche, sans brouillon. */
  const dejaRepondu = <Petit onClick={() => marqueCollee(id)} disabled={enCours}>Déjà répondu sur Google</Petit>;

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

  /* PUBLIER SUR GOOGLE : la fonction retrouve l'avis chez Google, Make pose
     la réponse. Rien ne se note « publié » sans le oui de la fonction. */
  const publier = async () => {
    if (envoi) return;
    setEnvoi(true);
    try {
      const r = await publieSurGoogle(
        { auteur: avis.auteur, texte: avis.texte, texteOriginal: avis.texteOriginal, publieLe: (avis as { publieLe?: string }).publieLe, name: avis.name },
        b?.reponse ?? '',
      );
      if (r.ok) {
        marquePublieeParLeTrone(id, r.le);
        setConfirme(false);
        toast('Publié sur Google. Google peut mettre quelques minutes à l’afficher.');
      } else toast(r.message);
    } finally { setEnvoi(false); }
  };

  if (b?.ecarte) {
    return (
      <div style={{ marginLeft: retrait, marginTop: 4, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="mnd-muted" style={{ fontSize: 11.5 }}>Sans réponse, par choix de la Maison</span>
        <Petit onClick={() => { reprendsLeBrouillon(id); void demande(); }} disabled={enCours}>Proposer une réponse</Petit>
        {dejaRepondu}
      </div>
    );
  }

  if (!b?.reponse && !aLaMain) {
    return (
      <div style={{ marginLeft: retrait, marginTop: 4, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="mnd-muted" style={{ fontSize: 11.5 }}>{enCours ? 'Claude écrit une proposition…' : 'Pas encore de proposition.'}</span>
        {!enCours && <Petit onClick={() => void demande()}>Proposer une réponse</Petit>}
        {!enCours && <Petit onClick={() => setALaMain(true)}>Écrire moi-même</Petit>}
        {dejaRepondu}
      </div>
    );
  }
  const texte = b?.reponse ?? '';
  /* `le` n'est posé que par une proposition de Claude. */
  const deClaude = !!b?.le;

  return (
    <div style={{ marginLeft: retrait, marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--copper-700)' }}>
          {deClaude ? `Réponse proposée, en ${langueDite(b?.langue)}, à vérifier` : 'Votre réponse'}
          {b?.le ? <span className="mnd-muted">{` · ${jourCourtAn(jourLocalDe(b.le))}`}</span> : null}
        </span>
        <Petit onClick={() => { setALaMain(false); ecarteLeBrouillon(id); }} disabled={enCours}>Écarter</Petit>
      </div>
      <textarea
        className="mnd-textarea"
        ref={zone}
        value={texte}
        onChange={(e) => changeLeBrouillon(id, e.target.value)}
        disabled={enCours || envoi}
        autoFocus={aLaMain && !texte}
        placeholder="Merci pour votre avis…"
        rows={Math.min(8, Math.max(3, texte.split('\n').length + 1))}
        aria-label={`Réponse à l’avis de ${avis.auteur || 'sans nom'}`}
        style={{ background: 'var(--copper-50, #FAF1E9)', border: '1px solid var(--copper-300, #E3C9AE)', fontSize: 13, lineHeight: 1.45 }}
      />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {parLePont && !confirme && (
          <Button variant="copper" size="sm" onClick={() => setConfirme(true)} disabled={enCours || envoi || !texte.trim()}>Publier sur Google</Button>
        )}
        <Button variant={parLePont ? 'ghost' : 'copper'} size="sm" onClick={() => void copier()} disabled={enCours}>Copier</Button>
        <a className="mnd-btn mnd-btn--ghost mnd-btn--sm" href={lien} target="_blank" rel="noreferrer">Ouvrir l’avis sur Google</a>
        {(deClaude || enCours || !texte.trim()) && (
          <Button variant="ghost" size="sm" onClick={() => void demande()} disabled={enCours}>{enCours ? 'Claude écrit…' : 'Une autre'}</Button>
        )}
      </div>
      {parLePont && confirme && (
        <div className="trc-avisg__cadre trc-avisg__cadre--site" role="group" aria-label="Publier sur Google">
          <span>Publier cette réponse sous l’avis de <b>{avis.auteur || 'sans nom'}</b> ? Elle sera visible de tous, sur Google.</span>
          <span className="trc-avisg__gestes">
            <Button variant="copper" size="sm" disabled={envoi || !texte.trim()} onClick={() => void publier()}>{envoi ? 'Publication…' : 'Oui, publier'}</Button>
            <Button variant="ghost" size="sm" disabled={envoi} onClick={() => setConfirme(false)}>Annuler</Button>
          </span>
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="mnd-muted" style={{ fontSize: 11.5, lineHeight: 1.45 }}>
          {parLePont
            ? 'La réponse part sur Google par Make, après votre « Oui, publier ». Google peut mettre quelques minutes à l’afficher.'
            : 'Google exige que la réponse soit publiée par vous : on copie, on colle.'}
        </span>
        <Petit onClick={() => marqueCollee(id)} disabled={enCours}>J’ai collé la réponse sur Google</Petit>
      </div>
    </div>
  );
}
