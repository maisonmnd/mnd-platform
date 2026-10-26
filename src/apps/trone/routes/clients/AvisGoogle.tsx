import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, toast } from '../../../../ds/components';
import { useStaff } from '../../../../shared/auth';
import { useStore } from '../../../../shared/store';
import { jourCourtAn } from '../../../../shared/calendrier';
import { peutDemander } from '../../../../shared/ia-maison-pur';
import { jourLocalDe, langueDite } from '../../../../shared/ia-avis-pur';
import { annuleCollee, changeLeBrouillon, proposeUneReponse, useBrouillonsDAvis, usePrepareLesBrouillons } from '../../../../shared/ia-avis';
import { jourDeLAvis } from '../../../../shared/avis-fiches-pur';
import { poseLesAvisDuSite, vitrineConfigStore } from '../../../../shared/bridges';
import { avisAMontrer, avisDuSiteLus, basculeDansLeSite, cleDeLAvis, deplaceDansLeSite, mentionDuTri, type AvisDuSite } from '../../../../shared/avis-google-pur';
import { useAvisDeGoogle, useEtatDuPont } from '../../../../shared/avis-google-pont';
import {
  anciensAApreter, avisDeLaRubrique, comptesDeLaRubrique, estRecent, etatDeLAvis, passeLeFiltreDeLaRubrique,
  type AvisDeLaRubrique, type EtatDeLAvis, type FiltreDeLaRubrique,
} from '../../../../shared/avis-rubrique-pur';
import { staffAccessStore } from '../equipe/data';
import { PageHead } from '../_ui';
import { FicheDeLAvis } from './FicheDeLAvis';
import { ReponseAUnAvis, usePeutRepondreAuxAvis } from './ReponseAUnAvis';
import { useReleveDesAvis } from './releve-des-avis';
import './avis-google.css';
import './avis-google-rubrique.css';

/* ══ LES AVIS GOOGLE, UNE RUBRIQUE À PART — 26 octobre 2026 ═════════════
   « Les avis Google doivent avoir leur espace sur la barre de navigation.
   Une maquette qui reçoit les avis, qui apprête les réponses, et ensuite
   que je puisse publier. Très propre, très professionnel » (Yéman).
   Maquette YaWfiqou…, « Tout me va » :
     - la rubrique vit à Marketing & fidélité, sous « Les vitrines », dont
       l'onglet des avis devient un lien vers elle ;
     - TOUS les avis, apportés par Make (les 299, deux fois par jour) ;
     - les nouveaux (30 jours) s'apprêtent à l'ouverture, cinq à la fois ;
       les anciens par dix, sur « Préparer les dix suivants » ;
     - le départ toujours à la main : « Publier sur Google », puis la
       question qui nomme l'autrice, puis « Oui, publier ».

   LE MOTIF VEDETTE : les trois temps (reçoit, apprête, publie), en bande ;
   dessous, deux volets, la liste et l'avis ouvert (règle des écrans en
   liste : un seul ouvert, la ligne porte son état).

   Les règles vivent dans `avis-rubrique-pur` (la liste, l'état, les filtres)
   et `avis-google-pur` (le choix du site, les copies). */

const ETOILES = (n: number) => {
  const k = Math.max(0, Math.min(5, Math.round(n)));
  return <span className="trc-avr__etoiles" aria-label={`${k} étoiles sur 5`}>{'★'.repeat(k)}<span className="trc-avr__etoiles-vides">{'★'.repeat(5 - k)}</span></span>;
};

const PAS = 60;

const DIT_DE_L_ETAT: Record<EtatDeLAvis, { mot: string; ton: string }> = {
  publiee: { mot: 'Répondu', ton: 'publiee' },
  ecartee: { mot: 'Sans réponse, par choix', ton: '' },
  prepare: { mot: 'Claude prépare…', ton: 'prepare' },
  prete: { mot: 'Réponse prête', ton: 'prete' },
  nouveau: { mot: 'Sans réponse', ton: 'nouveau' },
};

const AIDE: Partial<Record<FiltreDeLaRubrique, string>> = {
  sans: 'Tous les avis qui n’ont pas encore de réponse sur Google : ceux que Claude prépare, ceux à relire, et ceux que la Maison a choisi de laisser.',
  relire: 'Les réponses que Claude a préparées : relisez, retouchez, publiez.',
  recus: 'Les avis sans réponse ni proposition encore. Les nouveaux reçoivent la leur à l’ouverture de la rubrique.',
  site: 'Ce que maisonmnd.com montre, dans cet ordre. Cochez « Site » sur n’importe quel avis pour l’ajouter ; les flèches changent l’ordre. Rien de coché : le site montre ceux de Google.',
};

export default function AvisGoogle() {
  const releve = useReleveDesAvis();
  const deGoogle = useAvisDeGoogle();
  const pont = useEtatDuPont();
  const [brouillons] = useBrouillonsDAvis();
  const [cfg] = useStore(vitrineConfigStore);
  const staff = useStaff();
  const acces = useStore(staffAccessStore)[0];
  const peutRepondre = usePeutRepondreAuxAvis();
  const peutRelier = peutDemander(staff?.role, 'avis', acces[staff?.user_id ?? '']);
  const [params, setParams] = useSearchParams();
  const demande = params.get('avis');
  const [filtre, setFiltre] = useState<FiltreDeLaRubrique>('sans');
  const [ouvert, setOuvert] = useState<string | null>(demande);
  const [cherche, setCherche] = useState('');
  const [difficiles, setDifficiles] = useState(false);
  const [combien, setCombien] = useState(PAS);
  const [enModification, setEnModification] = useState<string | null>(null);
  const [serie, setSerie] = useState<{ fait: number; sur: number } | null>(null);
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
  const q = cherche.trim().toLowerCase();
  const base = filtre === 'site'
    ? duSite.map((c) => avis.find((a) => a.cle === c.cle)).filter((a): a is AvisDeLaRubrique => !!a)
    : avis;
  const vus = base.filter((a) => passeLeFiltreDeLaRubrique(a, filtre, brouillons[a.cle], rangSurLeSite(a.cle) >= 0, maintenant)
    && (!difficiles || a.note <= 3)
    && (!q || `${a.auteur} ${a.texte} ${a.traduction ?? ''}`.toLowerCase().includes(q)));

  /* L'avis demandé d'un lien (la fiche cliente, l'alerte) s'ouvre, même
     hors du filtre du moment. */
  useEffect(() => {
    if (!demande) return;
    setOuvert(demande);
    if (avis.length > 0 && !vus.some((a) => a.cle === demande)) setFiltre('tous');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demande, avis.length]);
  const ouvre = (cle: string | null) => {
    setOuvert(cle);
    setEnModification(null);
    if (params.get('avis')) setParams((p) => { p.delete('avis'); return p; }, { replace: true });
  };

  const choisi = avis.find((a) => a.cle === ouvert) ?? null;
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

  const note = releve?.note ?? 0;
  const nombre = releve?.nombre ?? (deGoogle?.length ?? 0);
  const repondus = comptes.publiees;
  const taux = avis.length > 0 ? Math.round((repondus / avis.length) * 100) : 0;

  return (
    <div className="mnd-rise trc-avr">
      <PageHead
        eyebrow="Marketing & fidélité · ce que disent les clientes"
        title="Les avis Google."
        actions={(
          <div className="trc-avr__chiffres">
            {note > 0 && <span className="trc-avr__chiffre"><b>{note.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} <i>★</i></b><small>{nombre} avis sur Google</small></span>}
            {avis.length > 0 && <span className="trc-avr__chiffre"><b>{taux} %</b><small>ont leur réponse</small></span>}
            <span className="trc-avr__chiffre"><b>{duSite.length}</b><small>avis sur maisonmnd.com</small></span>
          </div>
        )}
      />

      {/* LES TROIS TEMPS */}
      <section className="trc-avr__temps" aria-label="Les trois temps d’un avis">
        {([
          ['recus', 1, 'Reçoit', 'Make apporte chaque avis, deux fois par jour', comptes.recus, 'sans proposition'],
          ['relire', 2, 'Apprête', 'Claude prépare la réponse, dans la langue de l’avis', comptes.relire, 'à relire'],
          ['publiees', 3, 'Publie', 'Un toucher, après votre lecture', comptes.publiees, 'répondus'],
        ] as const).map(([f, n, nom, dit, c, unite]) => (
          <button key={f} type="button" className={`trc-avr__pas${filtre === f ? ' est-choisi' : ''}`} onClick={() => { setFiltre(f); setCombien(PAS); }}>
            <span className="trc-avr__num">{n}</span>
            <span className="trc-avr__nom">{nom}</span>
            <span className="trc-avr__compte"><b>{c}</b><small>{unite}</small></span>
            <span className="trc-avr__dit">{dit}</span>
          </button>
        ))}
      </section>

      {sansNom > 0 && (
        <p className="trc-avr__alerte-make">
          {sansNom === deGoogle?.length ? 'Les noms des autrices n’arrivent pas encore de Make' : `${sansNom} avis sont arrivés sans le nom de leur autrice`} :
          {' '}le champ <b>auteur</b> du scénario « Avis vers le Trône » est à corriger, puis l’import à relancer. Sans nom, un avis ne peut pas aller sur le site.
        </p>
      )}

      <section className={`trc-avr__volets${choisi ? ' montre-avis' : ''}`}>
        <div className="trc-avr__liste">
          <div className="trc-avr__onglets" role="tablist" aria-label="Quels avis">
            {([['sans', 'Sans réponse'], ['publiees', 'Répondus'], ['site', 'Sur le site'], ['tous', 'Tous']] as const).map(([f, mot]) => (
              <button key={f} type="button" role="tab" aria-selected={filtre === f} className={`trc-avr__onglet${filtre === f ? ' est-choisi' : ''}${f === 'sans' ? ' trc-avr__onglet--sans' : ''}`}
                onClick={() => { setFiltre(f); setCombien(PAS); }}>
                {mot}<b>{comptes[f]}</b>
              </button>
            ))}
          </div>
          <div className="trc-avr__outils">
            <input className="mnd-input trc-avr__cherche" type="search" value={cherche} placeholder="Chercher un nom, un mot" aria-label="Chercher un avis"
              onChange={(e) => { setCherche(e.target.value); setCombien(PAS); }} />
            <button type="button" className={`trc-avr__puce${difficiles ? ' est-choisie' : ''}`} onClick={() => setDifficiles((v) => !v)}>1 à 3 étoiles</button>
          </div>
          {AIDE[filtre] && <div className="trc-avr__aide">{AIDE[filtre]}</div>}
          {(filtre === 'sans' || filtre === 'recus') && peutRepondre && anciensEnTout > 0 && (
            <div className="trc-avr__serie">
              <span>{serie ? `Claude prépare ${serie.fait + 1} sur ${serie.sur}…` : `${anciensEnTout} ancien${anciensEnTout > 1 ? 's' : ''} avis sans réponse ni proposition.`}</span>
              <Button variant="ghost" size="sm" disabled={!!serie || anciens.length === 0} onClick={() => void prepareLesDix()}>Préparer les dix suivants</Button>
            </div>
          )}

          <div role="list">
            {!releve && !deGoogle && <p className="trc-avr__vide">Les avis ne sont pas encore arrivés.</p>}
            {(releve || deGoogle) && vus.length === 0 && (
              <p className="trc-avr__vide">{q || difficiles ? 'Aucun avis ne correspond.' : filtre === 'site' ? 'Rien de coché : le site montre les avis de Google.' : filtre === 'sans' ? 'Chaque avis a sa réponse.' : 'Rien ici.'}</p>
            )}
            {vus.slice(0, combien).map((a) => {
              const e = etatDeLAvis(a, brouillons[a.cle], maintenant);
              const rang = rangSurLeSite(a.cle);
              const jour = jourDeLAvis(a, releveLe);
              const dit = DIT_DE_L_ETAT[e];
              return (
                <div key={a.cle} role="listitem" className={`trc-avr__rangee${a.cle === ouvert ? ' est-ouverte' : ''}`}>
                  <label className={`trc-avr__site${rang >= 0 ? ' est-on' : ''}`} title="Montrer sur maisonmnd.com">
                    <input type="checkbox" checked={rang >= 0} onChange={() => basculeLeSite(a)} aria-label={`Montrer l’avis de ${a.auteur || 'sans nom'} sur le site`} />
                    <span aria-hidden="true">{rang >= 0 ? `Site · ${rang + 1}` : 'Site'}</span>
                  </label>
                  <button type="button" className="trc-avr__ligne" onClick={() => ouvre(a.cle === ouvert ? null : a.cle)} aria-expanded={a.cle === ouvert}>
                    <span className="trc-avr__qui">{ETOILES(a.note)}<b>{a.auteur || 'Sans nom'}</b><span>{jour ? jourCourtAn(jour) : a.quand}</span></span>
                    <span className={`trc-avr__etat${a.note <= 3 && e !== 'publiee' ? ' trc-avr__etat--difficile' : dit.ton ? ` trc-avr__etat--${dit.ton}` : ''}`}>
                      {a.note <= 3 && e === 'prete' ? 'À lire d’abord' : dit.mot}
                    </span>
                    <span className="trc-avr__extrait">{a.texte || <em>Une note, sans texte.</em>}</span>
                  </button>
                  {filtre === 'site' && (
                    <span className="trc-avr__fleches">
                      <button type="button" aria-label="Monter" disabled={rang <= 0} onClick={() => poseLesAvisDuSite(deplaceDansLeSite(duSite, a.cle, -1))}>↑</button>
                      <button type="button" aria-label="Descendre" disabled={rang < 0 || rang === duSite.length - 1} onClick={() => poseLesAvisDuSite(deplaceDansLeSite(duSite, a.cle, 1))}>↓</button>
                    </span>
                  )}
                </div>
              );
            })}
            {vus.length > combien && (
              <button type="button" className="trc-avr__plus" onClick={() => setCombien((n) => n + PAS)}>
                Voir {Math.min(PAS, vus.length - combien)} avis de plus · {vus.length - combien} restent
              </button>
            )}
          </div>
        </div>

        <article className="trc-avr__avis" aria-live="polite">
          {!choisi && <p className="trc-avr__vide">Choisissez un avis dans la liste.</p>}
          {choisi && (() => {
            const a = choisi;
            const b = brouillons[a.cle];
            const jour = jourDeLAvis(a, releveLe);
            const rang = rangSurLeSite(a.cle);
            const publieeIci = !!b?.parLeTrone && !!b.publieeLe;
            const edite = enModification === a.cle;
            const repondu = typeof a.reponse === 'string' ? a.reponse : '';
            return (
              <>
                <button type="button" className="mnd-btn mnd-btn--ghost mnd-btn--sm trc-avr__retour" onClick={() => ouvre(null)}>← Les avis</button>
                <div className="trc-avr__tete">
                  <div>
                    <div className="trc-avr__nom">{a.auteur || 'Sans nom'}</div>
                    <div className="trc-avr__meta">{ETOILES(a.note)}<span>{jour ? jourCourtAn(jour) : a.quand}</span>{a.traduction && <span>· traduit par Google</span>}</div>
                  </div>
                  {(a.lien || releve?.fiche) && <a className="trc-c360-linkbtn" href={a.lien || releve?.fiche} target="_blank" rel="noreferrer">Voir sur Google</a>}
                </div>
                {a.texte
                  ? <blockquote className="trc-avr__citation">« {a.texte} »</blockquote>
                  : <p className="trc-avr__citation trc-avr__citation--vide">Une note, sans texte.</p>}
                {a.traduction && <p className="trc-avr__trad">{`Traduit par Google : « ${a.traduction} »`}</p>}
                {a.note <= 3 && etatDeLAvis(a, b, maintenant) !== 'publiee' && (
                  <p className="trc-avr__difficile">Avis de {a.note} étoile{a.note > 1 ? 's' : ''} : la réponse reconnaît sans se justifier, et attend votre lecture.</p>
                )}
                <div className="trc-avr__liens">
                  <label className="trc-avr__case">
                    <input type="checkbox" checked={rang >= 0} onChange={() => basculeLeSite(a)} />
                    {rang >= 0 ? `Sur maisonmnd.com, ${rang === 0 ? '1er' : `${rang + 1}e`} avis` : 'Montrer sur maisonmnd.com'}
                  </label>
                </div>
                <div className="trc-avr__fiche"><FicheDeLAvis a={a} releveLe={releveLe} peutRelier={peutRelier} /></div>

                <section className="trc-avr__reponse" aria-label="La réponse de la Maison">
                  {repondu && !publieeIci && !edite && (
                    <div className="trc-avr__publiee">
                      <span className="trc-avr__publiee-dit">Publiée sur Google{a.reponduLe ? ` le ${jourCourtAn(jourLocalDe(a.reponduLe))}` : ''}{a.parLeTrone ? ', depuis le Trône' : ''}</span>
                      <div className="trc-avr__publiee-texte">{repondu}</div>
                      {peutRepondre && pont?.publie && (
                        <span className="trc-avisg__gestes">
                          <Button variant="ghost" size="sm" onClick={() => { changeLeBrouillon(a.cle, repondu); annuleCollee(a.cle); setEnModification(a.cle); }}>Modifier la réponse</Button>
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
                </section>
              </>
            );
          })()}
        </article>
      </section>

      <p className="trc-avr__pied">
        {deGoogle && deGoogle.length > 0
          ? `Make a apporté ${deGoogle.length} avis de la fiche, deux fois par jour ; ${deGoogle.filter((g) => g.reponse).length} ont déjà la réponse de la Maison. `
          : 'Make n’a encore rien apporté : la liste montre les cinq avis que Google juge « les plus pertinents ». '}
        {`Envoi à Google : ${pont?.publie ? 'par Make, après votre « Oui, publier »' : 'copier-coller, le pont n’est pas posé'}. `}
        {`Sous les avis, le site écrit : « ${mentionDuTri(duSite.length > 0 ? 'choix' : 'google')} »`}
      </p>
    </div>
  );
}
