import { useEffect, useMemo, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Button, toast } from '../../../../ds/components';
import { useStaff } from '../../../../shared/auth';
import { useStore } from '../../../../shared/store';
import { jourCourtAn } from '../../../../shared/calendrier';
import { peutDemander } from '../../../../shared/ia-maison-pur';
import { jourLocalDe, langueDite, type BrouillonsDAvis } from '../../../../shared/ia-avis-pur';
import { annuleCollee, changeLeBrouillon, proposeUneReponse, useBrouillonsDAvis, usePrepareLesBrouillons } from '../../../../shared/ia-avis';
import { jourDeLAvis } from '../../../../shared/avis-fiches-pur';
import { poseLesAvisDuSite, vitrineConfigStore } from '../../../../shared/bridges';
import { avisAMontrer, avisDuSiteLus, basculeDansLeSite, cleDeLAvis, deplaceDansLeSite, mentionDuTri, type AvisDuSite } from '../../../../shared/avis-google-pur';
import { useAvisDeGoogle, useEtatDuPont, type EtatDuPont } from '../../../../shared/avis-google-pont';
import type { AvisDeGoogle } from '../../../../shared/avis-google-pont-pur';
import {
  anciensAApreter, avisDeLaRubrique, comptesDeLaRubrique, estRecent, etatDeLAvis,
  type AvisDeLaRubrique, type EtatDeLAvis, type FiltreDeLaRubrique,
} from '../../../../shared/avis-rubrique-pur';
import { staffAccessStore } from '../equipe/data';
import { FicheDeLAvis } from './FicheDeLAvis';
import { ReponseAUnAvis, usePeutRepondreAuxAvis } from './ReponseAUnAvis';
import { useReleveDesAvis, type ReleveDesAvis } from './releve-des-avis';
import './avis-google.css';
import './avis-google-rubrique.css';

/* ══ LES AVIS GOOGLE : LES PIÈCES DE LA VUE, ET L'ANCIENNE ADRESSE ═════════
   26 octobre 2026 : « Les avis Google doivent avoir leur espace sur la barre
   de navigation. Une maquette qui reçoit les avis, qui apprête les réponses,
   et ensuite que je puisse publier » (Yéman, maquette YaWfiqou…, « Tout me
   va »). La rubrique est née ici, à part, sous « Les vitrines ».

   27 OCTOBRE 2026, LOT 3 (`docs/spec-assistant-maison.md` §5.3, maquette
   `public/maquette-assistant-maison.html`, vue 3) : les avis deviennent la
   vue « Les avis » de l'Assistant Maison (`/gerard?vue=avis`, écran
   `LesAvis.tsx`). Ce fichier garde ce qui ne change pas de règle :

     - `useLesAvisGoogle` : les données de la rubrique (Make, le relevé de
       Places, le pont, les brouillons, le choix du site), la préparation des
       nouveaux à l'ouverture (cinq à la fois, UNE série par page) et « les
       dix suivants », un à la fois ;
     - `PanneauDeLAvis` : l'avis ouvert, sa traduction, la case « Montrer sur
       maisonmnd.com » et ses flèches, la fiche de l'avis, la réponse ;
     - `PiedDesAvisGoogle` : ce que Make a apporté, par où part la réponse ;
     - la route `/avis-google` (fiche cliente, Vitrines, alerte du relevé)
       mène à la vue, en gardant l'avis demandé (`?avis=<clé>`).

   Les règles vivent dans `avis-rubrique-pur` (la liste, l'état, l'ordre, les
   chiffres) et `avis-google-pur` (le choix du site, les copies). Rien ne
   part sur Google d'ici : la publication vit dans `ReponseAUnAvis`, après
   « Oui, publier ». */

/** Les étoiles : cuivre par défaut ; dans la vue, or, et terre pour 1 à 3 (« bas »). */
export const ETOILES = (n: number, ton?: 'or' | 'bas') => {
  const k = Math.max(0, Math.min(5, Math.round(n)));
  const style = ton === 'bas' ? { color: 'var(--am-terre, #A3402B)' } : ton === 'or' ? { color: 'var(--am-or, #C9A227)' } : undefined;
  return <span className="trc-avr__etoiles" style={style} aria-label={`${k} étoiles sur 5`}>{'★'.repeat(k)}<span className="trc-avr__etoiles-vides">{'★'.repeat(5 - k)}</span></span>;
};

/** Le mot de la ligne pour chaque état, et son ton. */
export const DIT_DE_L_ETAT: Record<EtatDeLAvis, { mot: string; ton: string }> = {
  publiee: { mot: 'Répondu', ton: 'publiee' },
  ecartee: { mot: 'Sans réponse, par choix', ton: '' },
  prepare: { mot: 'Claude prépare…', ton: 'prepare' },
  prete: { mot: 'Réponse prête', ton: 'prete' },
  nouveau: { mot: 'Sans réponse', ton: 'nouveau' },
};

export type SerieEnCours = { fait: number; sur: number };

/** Ce que la vue lit et fait des avis : un seul crochet, monté une fois par page. */
export type DonneesDesAvis = {
  releve: ReleveDesAvis | null;
  releveLe: string | undefined;
  deGoogle: AvisDeGoogle[] | null;
  pont: EtatDuPont | null;
  brouillons: BrouillonsDAvis;
  peutRepondre: boolean;
  peutRelier: boolean;
  /** L'horloge de la vue : le verrou d'une proposition tombe après deux minutes. */
  maintenant: number;
  avis: AvisDeLaRubrique[];
  comptes: Record<FiltreDeLaRubrique, number>;
  duSite: AvisDuSite[];
  rangSurLeSite: (cle: string) => number;
  basculeLeSite: (a: AvisDeLaRubrique) => void;
  /** Les avis arrivés de Make sans le nom de leur autrice. */
  sansNom: number;
  anciens: AvisDeLaRubrique[];
  anciensEnTout: number;
  serie: SerieEnCours | null;
  prepareLesDix: () => Promise<void>;
};

export function useLesAvisGoogle(): DonneesDesAvis {
  const releve = useReleveDesAvis();
  const deGoogle = useAvisDeGoogle();
  const pont = useEtatDuPont();
  const [brouillons] = useBrouillonsDAvis();
  const [cfg] = useStore(vitrineConfigStore);
  const staff = useStaff();
  const acces = useStore(staffAccessStore)[0];
  const peutRepondre = usePeutRepondreAuxAvis();
  const peutRelier = peutDemander(staff?.role, 'avis', acces[staff?.user_id ?? '']);
  const [serie, setSerie] = useState<SerieEnCours | null>(null);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  /* Le verrou d'une proposition tombe après deux minutes : l'horloge passe. */
  useEffect(() => { const t = setInterval(() => setMaintenant(Date.now()), 15_000); return () => clearInterval(t); }, []);

  const avis = useMemo(() => avisDeLaRubrique(deGoogle, releve?.avis), [deGoogle, releve]);
  const releveLe = releve?.le;

  /* LES NOUVEAUX S'APPRÊTENT À L'OUVERTURE (cinq à la fois, comme avant). */
  const recents = useMemo(() => avis.filter((a) => estRecent(a, Date.now())), [avis]);
  usePrepareLesBrouillons(recents.length > 0 ? recents : null, peutRepondre);

  /* LE CHOIX DU SITE : les copies ; à défaut, l'ancien choix par clés parmi
     les cinq de Places, repris en copies au premier geste. */
  const copies = avisDuSiteLus(cfg.avisDuSite);
  const ancien = avisAMontrer(releve?.avis ?? [], cfg.avisChoisis);
  const duSite: AvisDuSite[] = copies.length > 0 ? copies
    : ancien.mode === 'choix' ? ancien.avis.map((a) => ({ cle: cleDeLAvis(a), auteur: a.auteur, note: a.note, texte: a.texte, ...(a.quand ? { quand: a.quand } : {}) })) : [];
  const rangSurLeSite = (cle: string) => duSite.findIndex((c) => c.cle === cle);
  const copieDe = (a: AvisDeLaRubrique): AvisDuSite => {
    const jour = jourDeLAvis(a, releveLe);
    return { cle: a.cle, auteur: a.auteur.trim(), note: a.note, texte: a.texte, ...(jour ? { quand: jourCourtAn(jour) } : a.quand ? { quand: a.quand } : {}) };
  };
  const basculeLeSite = (a: AvisDeLaRubrique) => {
    if (rangSurLeSite(a.cle) < 0 && !a.auteur.trim()) {
      toast('Le nom de l’autrice n’est pas encore arrivé de Make : le site doit le montrer avec l’avis.');
      return;
    }
    poseLesAvisDuSite(basculeDansLeSite(duSite, copieDe(a)));
  };

  const comptes = useMemo(() => comptesDeLaRubrique(avis, brouillons, (c) => duSite.some((x) => x.cle === c), maintenant),
    [avis, brouillons, duSite, maintenant]);
  const sansNom = deGoogle && deGoogle.length > 0 ? deGoogle.filter((g) => !g.auteur).length : 0;
  const anciens = anciensAApreter(avis, brouillons, maintenant, 10);
  const anciensEnTout = avis.filter((a) => !estRecent(a, maintenant) && etatDeLAvis(a, brouillons[a.cle], maintenant) === 'nouveau').length;

  /* LES DIX SUIVANTS : un à la fois, et l'on s'arrête au premier refus de
     la porte (budget, fonction absente, réseau). */
  const prepareLesDix = async () => {
    if (serie || anciens.length === 0) return;
    setSerie({ fait: 0, sur: anciens.length });
    try {
      for (let i = 0; i < anciens.length; i++) {
        const r = await proposeUneReponse(anciens[i]);
        if (!r.ok && r.erreur !== 'lecture' && r.erreur !== 'claude') { toast(r.message); break; }
        setSerie({ fait: i + 1, sur: anciens.length });
      }
    } finally { setSerie(null); }
  };

  return {
    releve, releveLe, deGoogle, pont, brouillons, peutRepondre, peutRelier, maintenant,
    avis, comptes, duSite, rangSurLeSite, basculeLeSite, sansNom, anciens, anciensEnTout, serie, prepareLesDix,
  };
}

/** L'AVIS OUVERT, sous sa ligne : à gauche l'avis (le texte, sa traduction,
    la case du site et ses flèches, la fiche de la cliente), à droite la
    réponse de la Maison (publiée, ou proposée à relire). `edite` : la
    réponse publiée se retouche ; Google remplace l'ancienne par la nouvelle. */
export function PanneauDeLAvis({ a, donnees, edite, surModifier }: {
  a: AvisDeLaRubrique; donnees: DonneesDesAvis; edite: boolean; surModifier: (cle: string) => void;
}) {
  const { releve, releveLe, peutRelier, peutRepondre, pont, brouillons, maintenant, duSite, rangSurLeSite, basculeLeSite } = donnees;
  const b = brouillons[a.cle];
  const jour = jourDeLAvis(a, releveLe);
  const rang = rangSurLeSite(a.cle);
  const etat = etatDeLAvis(a, b, maintenant);
  const publieeIci = !!b?.parLeTrone && !!b.publieeLe;
  const repondu = typeof a.reponse === 'string' ? a.reponse : '';
  const bas = a.note > 0 && a.note <= 3;
  return (
    <div className="trc-ger__panneau">
      <div className="trc-ger__message">
        <div className="trc-avr__meta">
          {ETOILES(a.note, bas ? 'bas' : 'or')}
          <span>{jour ? jourCourtAn(jour) : a.quand}</span>
          {a.traduction && <span>· traduit par Google</span>}
          {(a.lien || releve?.fiche) && <a className="trc-c360-linkbtn" href={a.lien || releve?.fiche} target="_blank" rel="noreferrer">Voir sur Google</a>}
        </div>
        {a.texte
          ? <blockquote className="trc-avr__citation" style={{ margin: 0 }}>« {a.texte} »</blockquote>
          : <p className="trc-avr__citation trc-avr__citation--vide" style={{ margin: 0 }}>Une note, sans texte.</p>}
        {a.traduction && <p className="trc-avr__trad" style={{ margin: 0 }}>{`Traduit par Google : « ${a.traduction} »`}</p>}
        {bas && etat !== 'publiee' && (
          <p className="trc-avr__difficile" style={{ margin: 0 }}>Avis de {a.note} étoile{a.note > 1 ? 's' : ''} : la réponse reconnaît sans se justifier, et attend votre lecture. Elle ne part jamais seule.</p>
        )}
        <div className="trc-am__gestes">
          <label className="trc-avr__case">
            <input type="checkbox" checked={rang >= 0} onChange={() => basculeLeSite(a)} />
            {rang >= 0 ? `Sur maisonmnd.com, ${rang === 0 ? '1er' : `${rang + 1}e`} avis` : 'Montrer sur maisonmnd.com'}
          </label>
          {rang >= 0 && (
            <span className="trc-avr__fleches" style={{ flexDirection: 'row', padding: 0 }}>
              <button type="button" aria-label="Monter sur le site" disabled={rang <= 0} onClick={() => poseLesAvisDuSite(deplaceDansLeSite(duSite, a.cle, -1))}>↑</button>
              <button type="button" aria-label="Descendre sur le site" disabled={rang === duSite.length - 1} onClick={() => poseLesAvisDuSite(deplaceDansLeSite(duSite, a.cle, 1))}>↓</button>
            </span>
          )}
        </div>
        <FicheDeLAvis a={a} releveLe={releveLe} peutRelier={peutRelier} />
      </div>

      <div className="trc-ger__pourquoi" aria-label="La réponse de la Maison">
        <h4 className="trc-am__sous">La réponse de la Maison <span>{repondu && !edite ? 'publiée sur Google' : 'à relire avant de publier'}</span></h4>
        {repondu && !publieeIci && !edite && (
          <div className="trc-avr__publiee">
            <span className="trc-avr__publiee-dit">Publiée sur Google{a.reponduLe ? ` le ${jourCourtAn(jourLocalDe(a.reponduLe))}` : ''}{a.parLeTrone ? ', depuis le Trône' : ''}</span>
            <div className="trc-avr__publiee-texte">{repondu}</div>
            {peutRepondre && pont?.publie && (
              <span className="trc-avisg__gestes">
                <Button variant="ghost" size="sm" onClick={() => { changeLeBrouillon(a.cle, repondu); annuleCollee(a.cle); surModifier(a.cle); }}>Modifier la réponse</Button>
                <span className="mnd-muted" style={{ fontSize: 12 }}>Google remplace l’ancienne réponse par la nouvelle.</span>
              </span>
            )}
          </div>
        )}
        {(!repondu || publieeIci || edite) && (
          peutRepondre
            ? <ReponseAUnAvis avis={edite ? { ...a, reponse: undefined } : a} fiche={releve?.fiche} sansRetrait />
            : <p className="mnd-muted" style={{ fontSize: 12.5, margin: 0 }}>Répondre aux avis est ouvert à la direction, à la Clientèle et au Marketing.</p>
        )}
        {b?.reponse && b.langue && !publieeIci && <span className="mnd-muted" style={{ fontSize: 11.5 }}>{`Écrite en ${langueDite(b.langue)}.`}</span>}
      </div>
    </div>
  );
}

/** Le pied de la vue : ce que Make apporte, par où part la réponse, ce que le site écrit. */
export function PiedDesAvisGoogle({ donnees }: { donnees: DonneesDesAvis }) {
  const { deGoogle, pont, duSite } = donnees;
  return (
    <p className="trc-avr__pied">
      {deGoogle && deGoogle.length > 0
        ? `Make a apporté ${deGoogle.length} avis de la fiche, deux fois par jour ; ${deGoogle.filter((g) => g.reponse).length} ont déjà la réponse de la Maison. `
        : 'Make n’a encore rien apporté : la liste montre les cinq avis que Google juge « les plus pertinents ». '}
      {`Envoi à Google : ${pont?.publie ? 'par Make, après votre « Oui, publier »' : 'copier-coller, le pont n’est pas posé'}. `}
      {`Sous les avis, le site écrit : « ${mentionDuTri(duSite.length > 0 ? 'choix' : 'google')} »`}
    </p>
  );
}

/** L'ANCIENNE ADRESSE `/avis-google` (la fiche cliente, les Vitrines, l'alerte
    du relevé) mène à la vue « Les avis » de l'Assistant Maison, l'avis demandé
    avec elle. La route reste : ses liens d'avant restent vivants. */
export default function AvisGoogle() {
  const [params] = useSearchParams();
  const avis = params.get('avis');
  return <Navigate replace to={`/gerard?vue=avis${avis ? `&avis=${encodeURIComponent(avis)}` : ''}`} />;
}
