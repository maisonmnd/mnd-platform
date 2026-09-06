import { useMemo, useState, type ReactNode } from 'react';
import { PageHead } from '../_ui';
import { Button, Card, Modal, toast } from '../../../../ds/components';
import { Tabs } from '../equipe/ui';
import { maisonNom, maisonVille } from '../../../../shared/identite';
import { useStaff } from '../equipe/data';
import {
  aChange, aRappeler, aTravailler, enVigueur, motDeLEtat, ouEnEst, prochaineVersion,
  useFichesDePoste, useReglement,
} from '../../../../shared/textes';
import {
  LES_DEGRES, LE_JOUR, gardesDeLArticle, gardesPerdues, type SourceDuReglement,
} from '../../../../shared/reglement-interieur';
import { cleNeuve, type FicheDePoste } from '../../../../shared/postes';
import type { ArticleSansNumero, Contrat } from '../../../../shared/contrats';
import {
  aChangeDe, aTravaillerDe, enVigueurDe, prochaineVersionDe, publieDe,
  type Publie, type Versionne,
} from '../../../../shared/textes';
import {
  CE_QUE_LA_VERSION_NE_FAIT_PAS, FORMATION_V1, IMAGE_V1, PRESTATAIRE_V1,
  contratsStore, pourquoiFormationImpossible, pourquoiImageImpossible,
  pourquoiPrestataireImpossible, useReglagesContrats,
  type EtatDesContrats, type ReglageFormation, type ReglageImage, type ReglagePrestataire,
} from '../../../../shared/reglages-contrats';
import { texteDuContrat } from '../../../../shared/droit-image';
import { texteContratPrestataire } from '../../../../shared/contrat-prestataire';
import { texteContratFormation } from '../../../../shared/contrat-formation';
import { DEVISE_COMPLETE, useHouseIdentity } from '../../../../shared/identite';
import { useClients } from '../../../../shared/clients';
import { useEnrollments } from '../equipe/academy';
import { providersStore } from '../equipe/Prestataires';
import { useStore } from '../../../../shared/store';
import { ficheDePostePdf } from '../equipe/Evaluation';
import './systeme.css';
import './textes.css';

/* ══ LES TEXTES DE LA MAISON — 6 septembre 2026 ══════════════════════

   « Comment modifier la fiche de poste et le règlement intérieur ? » (Yéman),
   puis « construis ».

   UN SEUL ÉCRAN, DEUX RÈGLES. Une fiche de poste décrit un métier et n'engage
   personne : elle se corrige quand on veut. Un règlement engage et se signe :
   il ne se corrige jamais en place, il PUBLIE UNE VERSION. Mettre les deux
   sous le même bouton « Enregistrer » aurait fait modifier un texte signé sans
   que personne s'en aperçoive.

   POURQUOI LES DEUX ENSEMBLE malgré cela : ce sont les deux papiers qu'on
   remet à l'embauche, et on les relit le même jour. Séparés, le second se
   serait oublié.

   LE JUGEMENT EST DANS `shared/textes` ET `shared/reglement-interieur`, jamais
   ici : cet écran ne fait que montrer et poser. */

type Onglet = 'fiches' | 'reglement' | 'contrats' | 'identite';

const jourLisible = (iso: string) => iso.split('-').reverse().join('/');

/* ── UNE LISTE DE LIGNES QU'ON MODIFIE ──────────────────────────────
   La même mécanique pour six rubriques : la recopier six fois aurait donné six
   comportements différents au premier correctif. */
function Lignes(o: {
  titre: string; aide?: string; lignes: string[]; invite: string;
  onChange: (l: string[]) => void;
}) {
  const pose = (i: number, v: string) => o.onChange(o.lignes.map((l, k) => (k === i ? v : l)));
  return (
    <div className="txt-rub">
      <div className="txt-rub__t">{o.titre}</div>
      {o.aide && <div className="txt-rub__aide">{o.aide}</div>}
      {o.lignes.map((l, i) => (
        <div key={i} className="txt-li">
          <input className="mnd-input" value={l} onChange={(e) => pose(i, e.target.value)} />
          <button
            className="txt-x" type="button" title="Retirer cette ligne"
            onClick={() => o.onChange(o.lignes.filter((_, k) => k !== i))}
          >
            ✕
          </button>
        </div>
      ))}
      <button className="txt-plus" type="button" onClick={() => o.onChange([...o.lignes, ''])}>
        + {o.invite}
      </button>
    </div>
  );
}

/* ══════════════ ① LES FICHES DE POSTE ══════════════ */

function OngletFiches() {
  const [fiches, setFiches] = useFichesDePoste();
  const [staff] = useStaff();
  const [i, setI] = useState(0);
  const [brouillon, setBrouillon] = useState<FicheDePoste | null>(null);

  const fiche = brouillon ?? fiches[i];

  /* CE QUI EST DÉJÀ COCHÉ, par clé. C'est ce qui fait la différence entre une
     ligne qu'on peut retirer sans conséquence et une ligne qui porte des
     entretiens signés. */
  const usage = useMemo(() => {
    const n: Record<string, number> = {};
    for (const m of staff) {
      for (const ev of m.evaluations ?? []) {
        for (const cle of new Set([...Object.keys(ev.parElle ?? {}), ...Object.keys(ev.parLaMaison ?? {})])) {
          n[`${ev.poste}·${cle}`] = (n[`${ev.poste}·${cle}`] ?? 0) + 1;
        }
      }
    }
    return n;
  }, [staff]);

  const entretiensDu = (poste: string) =>
    staff.reduce((n, m) => n + (m.evaluations ?? []).filter((e) => e.poste === poste).length, 0);

  if (!fiche) {
    return <p className="mnd-muted" style={{ padding: 20 }}>Aucune fiche de poste.</p>;
  }

  const pose = (patch: Partial<FicheDePoste>) => setBrouillon({ ...fiche, ...patch });
  const modifiee = !!brouillon && JSON.stringify(brouillon) !== JSON.stringify(fiches[i]);

  /* LE NOM ENREGISTRÉ, PAS CELUI QU'ON EST EN TRAIN DE TAPER. Les entretiens
     signés portent le poste tel qu'il s'appelait ce jour-là : compter l'usage
     sur le brouillon ferait dire « jamais cochée » à une ligne qui porte trois
     entretiens, et on l'effacerait de bonne foi. */
  const nomEnregistre = fiches[i]?.poste ?? fiche.poste;

  /* ══ RENOMMER UNE FICHE LA DÉTACHE DE SES PERSONNES ═══════════════
     Une fiche se trouve par le nom de la FONCTION portée sur la fiche de
     personnel. Renommer l'une sans l'autre ne casse rien bruyamment : l'écran
     d'entretien dit simplement « aucune fiche n'existe pour ce poste », et
     personne ne fait le lien. Ici, on le dit avant. */
  const orphelines = fiche.poste !== nomEnregistre
    ? staff.filter((m) => {
      const noms = [fiche.poste, ...(fiche.aussi ?? [])].map((t) => t.trim().toLowerCase());
      return m.role.trim().toLowerCase() === nomEnregistre.trim().toLowerCase()
        && !noms.includes(m.role.trim().toLowerCase());
    })
    : [];

  const enregistre = () => {
    if (!brouillon) return;
    setFiches(fiches.map((f, k) => (k === i ? brouillon : f)));
    setBrouillon(null);
    toast('Fiche enregistrée.');
  };

  const choisis = (k: number) => {
    if (modifiee && !window.confirm('Cette fiche a des modifications non enregistrées. Les abandonner ?')) return;
    setBrouillon(null);
    setI(k);
  };

  const posteNeuf = () => {
    const neuve: FicheDePoste = {
      poste: 'Nouveau poste', mission: '', fait: [], mesure: [], neFaitPas: [],
      decide: [], demandeAvant: [], competences: [], objectifs: [],
      rendCompteA: 'à la gérance.',
    };
    setFiches([...fiches, neuve]);
    setBrouillon(null);
    setI(fiches.length);
  };

  const auFauteuil = fiches.filter((f) => f.auFauteuil);
  const horsFauteuil = fiches.filter((f) => !f.auFauteuil);
  const rangee = (f: FicheDePoste) => {
    const k = fiches.indexOf(f);
    const n = entretiensDu(f.poste);
    return (
      <button
        key={f.poste} type="button"
        className={`txt-rail__a${k === i ? ' is-on' : ''}${n === 0 ? ' is-vide' : ''}`}
        onClick={() => choisis(k)}
      >
        <span>{f.poste}</span>
        <em>{n === 0 ? 'jamais évalué' : `${n} entretien${n > 1 ? 's' : ''}`}</em>
      </button>
    );
  };

  return (
    <div className="txt-deux">
      <div className="txt-rail">
        <u>Au fauteuil</u>
        {auFauteuil.map(rangee)}
        <u>Hors fauteuil</u>
        {horsFauteuil.map(rangee)}
        <button className="txt-plus" style={{ margin: '10px 16px' }} type="button" onClick={posteNeuf}>
          + Un poste
        </button>
      </div>

      <div className="txt-corps">
        <div className="txt-titre">
          <input
            className="mnd-input txt-titre__nom" value={fiche.poste}
            aria-label="Le nom du poste"
            onChange={(e) => pose({ poste: e.target.value })}
          />
          <label className="txt-coche">
            <input
              type="checkbox" checked={!!fiche.auFauteuil}
              onChange={(e) => pose({ auFauteuil: e.target.checked })}
            />
            Au fauteuil · touche une tête
          </label>
          <span className="txt-titre__dr">
            <Button variant="ghost" style={{ flex: 'none' }} onClick={() => void ficheDePostePdf(fiche)}>
              Aperçu du PDF
            </Button>
            <Button variant="copper" style={{ flex: 'none' }} disabled={!modifiee} onClick={enregistre}>
              Enregistrer
            </Button>
          </span>
        </div>

        {orphelines.length > 0 && (
          <div className="txt-garde txt-garde--ko">
            <u>Ce renommage détacherait {orphelines.length} personne(s)</u>
            {orphelines.map((m) => m.name).join(', ')} {orphelines.length > 1 ? 'portent' : 'porte'} la
            fonction « {nomEnregistre} » sur leur fiche de personnel. Une fiche de poste se trouve par
            ce nom : renommée ici seulement, elle cesserait de leur répondre, et leur entretien dirait
            « aucune fiche n’existe pour ce poste ». Ajoutez « {nomEnregistre} » aux autres écritures
            ci-dessous, ou renommez aussi leur fonction dans Personnel & paie.
          </div>
        )}

        <div className="txt-bloc">
          <div className="txt-rub__t">Les autres écritures du poste</div>
          <div className="txt-rub__aide">
            Le féminin, le masculin. Un poste n’a qu’une fiche : deux fiches pour un métier
            finiraient par dire deux choses du même travail. Séparez par une virgule.
          </div>
          <input
            className="mnd-input" value={(fiche.aussi ?? []).join(', ')}
            placeholder="Maîtresse"
            onChange={(e) => pose({
              aussi: e.target.value.split(',').map((t) => t.trim()).filter(Boolean),
            })}
          />
        </div>

        <div className="txt-bloc">
          <div className="txt-rub__t">La mission</div>
          <div className="txt-rub__aide">Une phrase, celle qu’on répète à l’embauche.</div>
          <textarea
            className="mnd-textarea" value={fiche.mission}
            onChange={(e) => pose({ mission: e.target.value })}
          />
        </div>

        <div className="txt-quatre">
          <Lignes
            titre="Ce qu’elle fait" lignes={fiche.fait} invite="Une ligne"
            onChange={(fait) => pose({ fait })}
          />
          <Lignes
            titre="Ce qui se mesure"
            aide="Un poste sans mesure ne se discute qu’à l’humeur, et c’est là que les injustices commencent."
            lignes={fiche.mesure} invite="Une ligne"
            onChange={(mesure) => pose({ mesure })}
          />
          <Lignes
            titre="Ce qu’elle ne fait pas"
            aide="La rubrique la plus utile : les conflits d’atelier naissent presque toujours d’une frontière que personne n’avait tracée."
            lignes={fiche.neFaitPas} invite="Une ligne"
            onChange={(neFaitPas) => pose({ neFaitPas })}
          />
          <div className="txt-rub">
            <div className="txt-rub__t">Elle rend compte</div>
            <input
              className="mnd-input" value={fiche.rendCompteA}
              onChange={(e) => pose({ rendCompteA: e.target.value })}
            />
          </div>
        </div>

        {/* ══ LES POUVOIRS DE DÉCISION ══════════════════════════════
            « Rajoute les pouvoirs de décision : ce qu'il peut décider et ce
            qui a besoin d'être approuvé avant de faire » (Yéman). La frontière
            du métier n'est pas la frontière de l'autorité. */}
        <div className="txt-pouvoirs">
          <Lignes
            titre="Ce qu’elle décide seule"
            aide="Sans demander, sans attendre. Ce qui n’est pas écrit ici se demande, et une cliente attend pendant ce temps-là."
            lignes={fiche.decide} invite="Un pouvoir"
            onChange={(decide) => pose({ decide })}
          />
          <div className="txt-rub">
            <div className="txt-rub__t">Ce qui s’approuve avant</div>
            <div className="txt-rub__aide">
              Dire à qui est la moitié utile de la ligne : « demander l’accord » sans nommer
              personne se traduit au fauteuil par « demander à celui qui passe », et deux
              personnes finissent par accorder des choses contraires le même jour.
            </div>
            {fiche.demandeAvant.map((d, k) => (
              <div key={k} className="txt-li txt-li--paire">
                <input
                  className="mnd-input" value={d.quoi} placeholder="Ce qui ne se fait pas seul"
                  onChange={(e) => pose({
                    demandeAvant: fiche.demandeAvant.map((x, j) => (j === k ? { ...x, quoi: e.target.value } : x)),
                  })}
                />
                <span className="txt-li__mot">auprès de</span>
                <input
                  className="mnd-input" value={d.a} placeholder="la gérance"
                  onChange={(e) => pose({
                    demandeAvant: fiche.demandeAvant.map((x, j) => (j === k ? { ...x, a: e.target.value } : x)),
                  })}
                />
                <button
                  className="txt-x" type="button"
                  onClick={() => pose({ demandeAvant: fiche.demandeAvant.filter((_, j) => j !== k) })}
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              className="txt-plus" type="button"
              onClick={() => pose({ demandeAvant: [...fiche.demandeAvant, { quoi: '', a: '' }] })}
            >
              + Une approbation
            </button>
          </div>
        </div>

        {/* ══ LA GRILLE ══════════════════════════════════════════════ */}
        <div className="txt-bloc">
          <div className="txt-rub__t">Ce qui se coche à l’entretien</div>
          <div className="txt-rub__aide">
            Des gestes qu’on peut voir, jamais des qualités. « Ponctuel » ne se coche pas :
            ça se discute. « Prévient d’un retard avant le jour même » se coche.
          </div>
          <table className="txt-table">
            <thead>
              <tr>
                <th>Le geste</th><th style={{ width: 110 }}>Sa clé</th>
                <th style={{ width: 150 }}>Déjà coché</th><th style={{ width: 90 }} />
              </tr>
            </thead>
            <tbody>
              {fiche.competences.map((c, k) => {
                const n = usage[`${nomEnregistre}·${c.cle}`] ?? 0;
                return (
                  <tr key={c.cle} className={c.retiree ? 'is-retiree' : ''}>
                    <td>
                      <input
                        className="mnd-input" value={c.mot} disabled={c.retiree}
                        onChange={(e) => pose({
                          competences: fiche.competences.map((x, j) => (j === k ? { ...x, mot: e.target.value } : x)),
                        })}
                      />
                    </td>
                    <td><span className="txt-cle">{c.cle}</span></td>
                    <td>
                      <span className="txt-usage">
                        {n === 0 ? 'jamais cochée' : <><b>{n}</b> entretien{n > 1 ? 's' : ''}</>}
                      </span>
                    </td>
                    <td>
                      {c.retiree ? (
                        <button
                          className="txt-lien" type="button"
                          onClick={() => pose({
                            competences: fiche.competences.map((x, j) => (j === k ? { ...x, retiree: undefined } : x)),
                          })}
                        >
                          Remettre
                        </button>
                      ) : (
                        <button
                          className="txt-lien" type="button"
                          title={n > 0
                            ? 'Elle cesse d’être proposée, et reste lisible sur les entretiens signés'
                            : 'Jamais cochée : elle s’efface'}
                          onClick={() => pose({
                            /* JAMAIS COCHÉE, ELLE S'EFFACE. Déjà cochée, elle se
                               retire seulement : sans son énoncé, l'entretien de
                               l'an dernier afficherait des cases muettes. */
                            competences: n === 0
                              ? fiche.competences.filter((_, j) => j !== k)
                              : fiche.competences.map((x, j) => (j === k ? { ...x, retiree: true } : x)),
                          })}
                        >
                          {n === 0 ? 'Effacer' : 'Retirer'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <button
            className="txt-plus" type="button"
            onClick={() => pose({
              competences: [...fiche.competences, {
                cle: cleNeuve('geste', fiche.competences.map((c) => c.cle)), mot: '',
              }],
            })}
          >
            + Un geste
          </button>
          <div className="txt-garde">
            <u>Ce que l’écran fait pour vous</u>
            Le libellé se reformule quand vous voulez : un entretien signé garde la <b>clé</b>,
            pas la phrase. Une ligne jamais cochée s’efface ; une ligne déjà cochée se
            <b> retire</b> et reste lisible sur les entretiens signés.
          </div>
        </div>

        <div className="txt-bloc">
          <div className="txt-rub__t">Ce qui se vise</div>
          <div className="txt-rub__aide">
            Le standard du poste. Il s’ajuste ensuite pour chaque personne, à son entretien :
            celle qui débute ne vise pas ce que vise celle qui a trois ans.
          </div>
          <table className="txt-table">
            <thead>
              <tr>
                <th>L’objectif</th><th style={{ width: 230 }}>La cible du poste</th>
                <th style={{ width: 130 }}>Déjà visé</th><th style={{ width: 90 }} />
              </tr>
            </thead>
            <tbody>
              {fiche.objectifs.map((ob, k) => {
                const n = usage[`${nomEnregistre}·${ob.cle}`] ?? 0;
                const posé = (patch: Partial<typeof ob>) => pose({
                  objectifs: fiche.objectifs.map((x, j) => (j === k ? { ...x, ...patch } : x)),
                });
                return (
                  <tr key={ob.cle} className={ob.retiree ? 'is-retiree' : ''}>
                    <td>
                      <input
                        className="mnd-input" value={ob.mot} disabled={ob.retiree}
                        onChange={(e) => posé({ mot: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="mnd-input" value={ob.cible} disabled={ob.retiree}
                        onChange={(e) => posé({ cible: e.target.value })}
                      />
                    </td>
                    <td><span className="txt-usage">{n === 0 ? 'jamais' : <><b>{n}</b> fois</>}</span></td>
                    <td>
                      {ob.retiree
                        ? <button className="txt-lien" type="button" onClick={() => posé({ retiree: undefined })}>Remettre</button>
                        : (
                          <button
                            className="txt-lien" type="button"
                            onClick={() => (n === 0
                              ? pose({ objectifs: fiche.objectifs.filter((_, j) => j !== k) })
                              : posé({ retiree: true }))}
                          >
                            {n === 0 ? 'Effacer' : 'Retirer'}
                          </button>
                        )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <button
            className="txt-plus" type="button"
            onClick={() => pose({
              objectifs: [...fiche.objectifs, {
                cle: cleNeuve('objectif', fiche.objectifs.map((c) => c.cle)), mot: '', cible: '',
              }],
            })}
          >
            + Un objectif
          </button>
          <div className="txt-garde">
            <u>Ce que l’écran ne touche pas</u>
            Changer la cible du poste ne déplace pas celles qui ont été ajustées pour quelqu’un
            à son entretien. Elle garde son écart, comme une tête garde sa cadence quand la
            Maison change la sienne.
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════ ② LE RÈGLEMENT INTÉRIEUR ══════════════ */

function OngletReglement() {
  const [etat, setEtat] = useReglement();
  const [staff] = useStaff();
  const [ouvert, setOuvert] = useState<number | null>(null);
  const [publier, setPublier] = useState(false);
  const [versions, setVersions] = useState(false);

  const jour = new Date().toISOString().slice(0, 10);
  const vigueur = enVigueur(etat);
  const source = aTravailler(etat);
  const change = aChange(etat);
  const rappeler = aRappeler(staff, prochaineVersion(etat, jour));
  const dejaSignee = staff.filter((m) => ouEnEst(m.reglement, vigueur.version) === 'a-jour');

  const poseSource = (s: SourceDuReglement) => setEtat({ ...etat, brouillon: s });
  const poseArticle = (k: number, a: ArticleSansNumero) =>
    poseSource({ ...source, articles: source.articles.map((x, j) => (j === k ? a : x)) });

  const bouge = (k: number, sens: -1 | 1) => {
    const j = k + sens;
    if (j < 0 || j >= source.articles.length) return;
    const a = [...source.articles];
    [a[k], a[j]] = [a[j], a[k]];
    poseSource({ ...source, articles: a });
    setOuvert(ouvert === k ? j : ouvert === j ? k : ouvert);
  };

  const perdues = gardesPerdues(source);

  const publie = () => {
    setEtat({
      publies: [...etat.publies, {
        version: prochaineVersion(etat, jour), leIso: jour,
        articles: source.articles, degres: source.degres,
      }],
      brouillon: undefined,
    });
    setPublier(false);
    toast(`Version publiée. ${rappeler.length} personne${rappeler.length > 1 ? 's' : ''} à faire signer.`);
  };

  return (
    <div>
      <div className="txt-ver">
        <b>{vigueur.version}</b>
        <u>
          en vigueur depuis le {jourLisible(vigueur.leIso)} · <b>{dejaSignee.length}</b> décharge
          {dejaSignee.length > 1 ? 's' : ''} signée{dejaSignee.length > 1 ? 's' : ''}
          {staff.length - dejaSignee.length > 0
            && ` · ${staff.length - dejaSignee.length} personne(s) ne l’ont pas signée`}
        </u>
        <span className="txt-ver__dr">
          <Button variant="ghost" style={{ flex: 'none' }} onClick={() => setVersions(true)}>
            Voir les versions
          </Button>
          {etat.brouillon && (
            <Button
              variant="ghost" style={{ flex: 'none' }}
              onClick={() => { setEtat({ ...etat, brouillon: undefined }); toast('Brouillon abandonné.'); }}
            >
              Abandonner le brouillon
            </Button>
          )}
          <Button variant="copper" style={{ flex: 'none' }} disabled={!change} onClick={() => setPublier(true)}>
            {change ? `Publier ${prochaineVersion(etat, jour).split(' ')[0]}` : 'Rien à publier'}
          </Button>
        </span>
      </div>

      {etat.brouillon && (
        <div className="txt-garde">
          <u>Brouillon en cours</u>
          Ce que vous écrivez ici ne s’applique à personne. <b>{vigueur.version}</b> reste en vigueur
          tant que vous n’avez pas publié.
        </div>
      )}

      {source.articles.map((a, k) => {
        const gardes = gardesDeLArticle(a);
        return (
          <div className="txt-art" key={k}>
            <div className="txt-art__t">
              <button
                className="txt-art__pli" type="button"
                onClick={() => setOuvert(ouvert === k ? null : k)}
                aria-expanded={ouvert === k}
              >
                {ouvert === k ? '⌄' : '›'}
              </button>
              <span className="txt-art__n">{k + 1}</span>
              <input
                className="mnd-input txt-art__titre" value={a.titre}
                aria-label={`Titre de l’article ${k + 1}`}
                onChange={(e) => poseArticle(k, { ...a, titre: e.target.value })}
              />
              <em>{a.lignes.length} ligne{a.lignes.length > 1 ? 's' : ''}</em>
              {gardes.length > 0 && (
                <span className="txt-pas" title={gardes.join(' · ')}>garde de la Maison</span>
              )}
              <span className="txt-art__dr">
                <button className="txt-x" type="button" title="Monter" onClick={() => bouge(k, -1)}>↑</button>
                <button className="txt-x" type="button" title="Descendre" onClick={() => bouge(k, 1)}>↓</button>
                <button
                  className="txt-x" type="button" title="Retirer l’article"
                  onClick={() => {
                    if (!window.confirm(`Retirer l’article « ${a.titre} » ?`)) return;
                    poseSource({ ...source, articles: source.articles.filter((_, j) => j !== k) });
                  }}
                >
                  ✕
                </button>
              </span>
            </div>

            {ouvert === k && (
              <div className="txt-art__c">
                {a.lignes.map((l, j) => {
                  /* LES DEUX REPÈRES NE SE TAPENT PAS. L'échelle et la date de
                     remise vivent chacune à un seul endroit ; les montrer comme
                     du texte modifiable ferait deux vérités pour une notion. */
                  if (l === LES_DEGRES) {
                    return (
                      <div key={j} className="txt-degres">
                        <div className="txt-rub__t">L’échelle des sanctions</div>
                        {source.degres.map((d, n) => (
                          <div key={n} className="txt-deg">
                            <span>{n + 1}</span>
                            <input
                              className="mnd-input" value={d}
                              onChange={(e) => poseSource({
                                ...source,
                                degres: source.degres.map((x, m) => (m === n ? e.target.value : x)),
                              })}
                            />
                            <button
                              className="txt-x" type="button"
                              onClick={() => poseSource({
                                ...source, degres: source.degres.filter((_, m) => m !== n),
                              })}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        <button
                          className="txt-plus" type="button"
                          onClick={() => poseSource({ ...source, degres: [...source.degres, ''] })}
                        >
                          + Un degré
                        </button>
                      </div>
                    );
                  }
                  if (l === LE_JOUR) {
                    return (
                      <div key={j} className="txt-repere">
                        La date de remise, écrite le jour où le document est signé.
                      </div>
                    );
                  }
                  return (
                    <div key={j} className="txt-li">
                      <textarea
                        className="mnd-textarea txt-ligne" value={l}
                        onChange={(e) => poseArticle(k, {
                          ...a, lignes: a.lignes.map((x, m) => (m === j ? e.target.value : x)),
                        })}
                      />
                      <button
                        className="txt-x" type="button"
                        onClick={() => poseArticle(k, { ...a, lignes: a.lignes.filter((_, m) => m !== j) })}
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
                <button
                  className="txt-plus" type="button"
                  onClick={() => poseArticle(k, { ...a, lignes: [...a.lignes, ''] })}
                >
                  + Une ligne
                </button>
              </div>
            )}
          </div>
        );
      })}

      <button
        className="txt-plus" style={{ margin: '14px 0' }} type="button"
        onClick={() => {
          poseSource({ ...source, articles: [...source.articles, { titre: 'Nouvel article', lignes: [''] }] });
          setOuvert(source.articles.length);
        }}
      >
        + Un article
      </button>

      {/* ══ LES GARDES DE LA MAISON ═══════════════════════════════════
          L'écran prévient, il n'interdit pas (décision de Yéman) : interdire
          ferait du texte de la Maison un texte que la Maison ne peut plus
          corriger, et la première phrase mal tournée y resterait pour toujours. */}
      <div className={`txt-garde${perdues.length ? ' txt-garde--ko' : ''}`}>
        <u>{perdues.length ? `Ce texte a perdu ${perdues.length} garde(s)` : 'Les gardes de la Maison'}</u>
        {perdues.length ? (
          <>
            {perdues.join(' · ')}. Ce sont les phrases qui protègent quelqu’un, et qui font tenir
            le règlement le jour où il sert. Vous pouvez publier sans elles, l’écran vous le
            rappellera une dernière fois. Un règlement qui n’engage qu’un côté se lit comme une
            liste de menaces, et ne se respecte pas.
          </>
        ) : (
          <>
            Cinq phrases protègent quelqu’un dans ce texte : l’écart déclaré qui n’est pas une
            faute, la personne entendue avant toute sanction, la sanction non écrite qui n’existe
            pas, le harcèlement qui ne se règle pas à l’amiable, et celle qui signale qui ne peut
            en être inquiétée. Elles sont toutes là.
          </>
        )}
      </div>

      {publier && (
        <Modal title={`Publier ${prochaineVersion(etat, jour)} ?`} onClose={() => setPublier(false)} width={640}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, lineHeight: 1.7 }}>
              Cette version entre en vigueur aujourd’hui et remplace <b>{vigueur.version}</b>.
            </p>
            {perdues.length > 0 && (
              <div className="txt-garde txt-garde--ko" style={{ margin: 0 }}>
                <u>Avant de publier</u>
                Le texte a perdu : {perdues.join(' · ')}. Ce sont les phrases qui protègent
                quelqu’un. Publier reste possible, c’est votre décision.
              </div>
            )}
            <p style={{ margin: 0, lineHeight: 1.7 }}>
              Les {dejaSignee.length} décharges de {vigueur.version} restent au dossier, datées et
              lisibles. {rappeler.length > 0
                ? <>Ces {rappeler.length} personnes repassent en <b>« nouvelle version à signer »</b> :</>
                : 'Personne n’est à rappeler.'}
            </p>
            {rappeler.length > 0 && (
              <div className="txt-qui">
                {rappeler.map((m) => <span key={m.id}>{m.name}</span>)}
              </div>
            )}
            <p className="mnd-muted" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.7 }}>
              Elles gardent le bénéfice de {vigueur.version} tant qu’elles n’ont pas signé la
              nouvelle : on n’oppose pas à quelqu’un une règle qu’il n’a pas encore lue.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Button variant="ghost" style={{ flex: 'none' }} onClick={() => setPublier(false)}>
                Annuler
              </Button>
              <Button variant="copper" style={{ flex: 'none' }} onClick={publie}>
                Publier et rappeler {rappeler.length > 0 ? `les ${rappeler.length}` : ''}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {versions && (
        <Modal title="Les versions du règlement" onClose={() => setVersions(false)} width={620}>
          <p className="mnd-muted" style={{ marginTop: 0, lineHeight: 1.7 }}>
            Aucune ne s’efface : une décharge signée désigne la sienne, et sans elle on ne saurait
            plus à quoi cette personne a dit oui.
          </p>
          {[...etat.publies].reverse().map((v, k) => (
            <div key={v.version} className="txt-vligne">
              <b>{v.version}</b>
              <span className="mnd-muted">
                {v.articles.length} articles · {v.degres.length} degrés · depuis le {jourLisible(v.leIso)}
              </span>
              {k === 0 && <span className="txt-pas">en vigueur</span>}
              <span className="mnd-muted">
                {staff.filter((m) => m.reglement?.version === v.version).length} signature(s)
              </span>
            </div>
          ))}
        </Modal>
      )}
    </div>
  );
}

/* ══════════════ ③ LES CONTRATS ══════════════

   « Dans les textes de la Maison il manque les contrats et identité » (Yéman).

   UN CONTRAT NE SE RAPPELLE PAS, CONTRAIREMENT AU RÈGLEMENT, et c'est la seule
   chose que cet onglet doit faire comprendre. Un règlement est imposé par une
   seule partie : le modifier oblige à faire resigner tout le monde. Un contrat
   est signé par deux, il est exécuté : la Maison ne peut pas en changer les
   termes après coup, et personne n'est à rappeler. Publier une version ne
   touche que les contrats à venir.

   LE TEXTE NE S'ÉCRIT PAS ICI. Ce qui se règle vraiment tient en quatre
   nombres ; le reste se relit à l'écran, entier, avant de faire signer. Rendre
   modifiable la moindre phrase d'un contrat serait offrir à la Maison de casser
   ses propres protections sans que rien ne l'en avertisse — ce que le règlement
   accepte parce qu'il est unilatéral, et qu'un contrat n'accepte pas. */

function CarteContrat<T>(o: {
  titre: string;
  quoi: string;
  etat: Versionne<T>;
  secours: Publie<T>;
  signes: number;
  motSigne: string;
  champs: (v: T, pose: (t: T) => void) => ReactNode;
  apercu: (v: T) => Contrat;
  refus: (v: T) => string | undefined;
  onEtat: (e: Versionne<T>) => void;
}) {
  const [publier, setPublier] = useState(false);
  const [lire, setLire] = useState(false);
  const jour = new Date().toISOString().slice(0, 10);
  const vigueur = enVigueurDe(o.etat, o.secours);
  const projet = aTravaillerDe(o.etat, o.secours);
  const change = aChangeDe(o.etat, o.secours);
  const manque = o.refus(projet);

  return (
    <div className="txt-contrat">
      <div className="txt-contrat__t">
        <b>{o.titre}</b>
        <span className="txt-pas">{vigueur.version}</span>
        <em>{o.signes} {o.motSigne}{o.signes > 1 ? 's' : ''}</em>
      </div>
      <div className="txt-rub__aide">{o.quoi}</div>

      <div className="txt-contrat__champs">
        {o.champs(projet, (t) => o.onEtat({ ...o.etat, brouillon: t }))}
      </div>

      {manque && (
        <div className="txt-garde txt-garde--ko" style={{ margin: '10px 0 0' }}>
          <u>Ce nombre ne peut pas être posé</u>
          {manque}
        </div>
      )}

      <div className="txt-contrat__dr">
        <Button variant="ghost" style={{ flex: 'none' }} onClick={() => setLire(true)}>
          Lire le texte
        </Button>
        {o.etat.brouillon && (
          <Button
            variant="ghost" style={{ flex: 'none' }}
            onClick={() => { o.onEtat({ ...o.etat, brouillon: undefined }); toast('Brouillon abandonné.'); }}
          >
            Revenir à {vigueur.version}
          </Button>
        )}
        <Button
          variant="copper" style={{ flex: 'none' }} disabled={!change || !!manque}
          onClick={() => setPublier(true)}
        >
          {change ? `Publier ${prochaineVersionDe(o.etat, jour, o.secours).split(' ')[0]}` : 'Rien à publier'}
        </Button>
      </div>

      {lire && (
        <Modal title={o.titre} onClose={() => setLire(false)} width={860}>
          <p className="mnd-muted" style={{ marginTop: 0, fontSize: 12.5, lineHeight: 1.7 }}>
            Le texte tel qu’il sera imprimé, avec les termes en cours. Les noms sont des exemples.
          </p>
          <LeTexte contrat={o.apercu(projet)} />
        </Modal>
      )}

      {publier && (
        <Modal title={`Publier ${prochaineVersionDe(o.etat, jour, o.secours)} ?`} onClose={() => setPublier(false)} width={620}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, lineHeight: 1.7 }}>
              {o.titre} · cette version remplace <b>{vigueur.version}</b> à partir d’aujourd’hui.
            </p>
            {/* CE QU'UNE VERSION NE FAIT PAS — l'inverse exact du règlement, et
                le confondre ferait soit rappeler des gens pour rien, soit croire
                qu'un terme signé s'est allongé tout seul. */}
            <div className="txt-garde" style={{ margin: 0 }}>
              <u>Ce que cette version ne fait pas</u>
              {CE_QUE_LA_VERSION_NE_FAIT_PAS}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Button variant="ghost" style={{ flex: 'none' }} onClick={() => setPublier(false)}>Annuler</Button>
              <Button
                variant="copper" style={{ flex: 'none' }}
                onClick={() => {
                  o.onEtat(publieDe(o.etat, o.secours, jour));
                  setPublier(false);
                  toast('Version publiée. Les contrats à venir la porteront.');
                }}
              >
                Publier
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** LE TEXTE D'UN CONTRAT, À L'ÉCRAN. Le même rendu que dans la modale de
    signature : lire ici autre chose que ce qu'on fait signer là-bas ne servirait
    qu'à se rassurer. */
function LeTexte({ contrat }: { contrat: Contrat }) {
  return (
    <div className="txt-lecture">
      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--color-indigo)' }}>
        {contrat.titre}
      </div>
      {contrat.sousTitre && (
        <div style={{ fontSize: 11.5, color: 'var(--copper-700)', marginBottom: 8 }}>{contrat.sousTitre}</div>
      )}
      {contrat.entete.map((l) => <p key={l} style={{ margin: '0 0 6px' }}>{l}</p>)}
      {contrat.articles.map((a) => (
        <div key={a.n} style={{ marginTop: 10 }}>
          <div style={{ fontWeight: 500, color: 'var(--color-indigo)' }}>Article {a.n} · {a.titre}</div>
          {a.lignes.map((l, i) => (
            <p key={i} style={{ margin: '4px 0 0', paddingLeft: l.startsWith('·') ? 12 : 0 }}>{l}</p>
          ))}
        </div>
      ))}
      <div className="mnd-muted" style={{ marginTop: 12, fontSize: 11 }}>{contrat.pied}</div>
    </div>
  );
}

function Nombre(o: { mot: string; aide?: string; valeur: number; unite: string; onChange: (n: number) => void }) {
  return (
    <label className="txt-nombre">
      <span className="txt-rub__t">{o.mot}</span>
      <span>
        <input
          className="mnd-input" type="number" value={String(o.valeur)}
          onChange={(e) => o.onChange(parseInt(e.target.value, 10))}
        />
        <em>{o.unite}</em>
      </span>
      {o.aide && <span className="txt-rub__aide">{o.aide}</span>}
    </label>
  );
}

function OngletContrats() {
  const [etat, setEtat] = useReglagesContrats();
  const [clients] = useClients();
  const [providers] = useStore(providersStore);
  const [inscriptions] = useEnrollments();
  const maison = { maison: maisonNom(), ville: maisonVille() };
  const jour = new Date().toISOString().slice(0, 10);
  const pose = <K extends keyof EtatDesContrats>(cle: K, v: EtatDesContrats[K]) =>
    setEtat({ ...etat, [cle]: v });

  return (
    <div>
      <div className="txt-garde">
        <u>Ce qui se règle ici, et ce qui ne s’y règle pas</u>
        Les trois contrats de la Maison. <b>Leur texte se lit, il ne s’écrit pas</b> : ce qui se
        décide vraiment tient en quatre nombres, et rendre modifiable la moindre phrase serait
        offrir de casser ses propres protections sans qu’aucun écran n’en avertisse. Le règlement
        intérieur, lui, s’écrit : il est imposé par une seule partie, et c’est pour cela qu’il a
        son propre onglet.
      </div>

      <CarteContrat<ReglageImage>
        titre="Droit à l’image"
        quoi="Ce que la cliente accorde, pour quels usages et pour combien de temps. Signé à l’écran, au doigt, sur sa fiche."
        etat={etat.image} secours={IMAGE_V1}
        signes={clients.filter((c) => c.accordImage?.signature).length}
        motSigne="accord signé"
        refus={pourquoiImageImpossible}
        champs={(v, set) => (
          <Nombre
            mot="La durée de l’autorisation" unite="mois" valeur={v.mois}
            aide="Cinq ans (60 mois) depuis le 6 septembre. Au-delà de trois ans, le texte ajoute de lui-même une phrase qui invite la personne à retenir ce terme."
            onChange={(mois) => set({ mois })}
          />
        )}
        apercu={(v) => texteDuContrat({
          ...maison, tete: 'Nom de la cliente', signataire: 'Nom de la cliente',
          usages: ['vitrine', 'reseaux'], jourIso: jour, mois: v.mois,
          version: enVigueurDe(etat.image, IMAGE_V1).version,
        })}
        onEtat={(e) => pose('image', e)}
      />

      <CarteContrat<ReglagePrestataire>
        titre="Contrat de prestation"
        quoi="Ce qui lie un maître ou une main extérieure à la Maison : la mission, le règlement, la tenue, la clientèle."
        etat={etat.prestataire} secours={PRESTATAIRE_V1}
        signes={providers.filter((p) => p.contrat).length}
        motSigne="contrat signé"
        refus={pourquoiPrestataireImpossible}
        champs={(v, set) => (
          <>
            <Nombre
              mot="Le non-démarchage après la fin" unite="mois" valeur={v.moisNonDemarchage}
              aide="Il protège la clientèle de la Maison sans interdire d’exercer. Au-delà de deux ans, ce qui est excessif tombe en entier, et la Maison perd la protection qu’elle croyait acheter."
              onChange={(moisNonDemarchage) => set({ ...v, moisNonDemarchage })}
            />
            <Nombre
              mot="Le délai de règlement" unite="jours" valeur={v.joursDeReglement}
              aide="À compter de la remise de la note. Au-delà de soixante jours, ce n’est plus un délai, c’est une avance de trésorerie qu’on lui demande."
              onChange={(joursDeReglement) => set({ ...v, joursDeReglement })}
            />
          </>
        )}
        apercu={(v) => texteContratPrestataire({
          ...maison, nom: 'Nom du prestataire', specialite: 'Maître de rituel',
          mode: 'prestation', jourIso: jour,
          joursDeReglement: v.joursDeReglement, moisNonDemarchage: v.moisNonDemarchage,
          version: enVigueurDe(etat.prestataire, PRESTATAIRE_V1).version,
        })}
        onEtat={(e) => pose('prestataire', e)}
      />

      <CarteContrat<ReglageFormation>
        titre="Contrat de formation"
        quoi="Ce qui lie une apprenante à l’Académie : le parcours, le prix et ses échéances, le certificat, la licence d’enseigner."
        etat={etat.formation} secours={FORMATION_V1}
        signes={inscriptions.filter((e) => e.contrat).length}
        motSigne="contrat signé"
        refus={pourquoiFormationImpossible}
        champs={(v, set) => (
          <Nombre
            mot="Avant de pouvoir demander la licence" unite="mois" valeur={v.moisAvantLicence}
            aide="Une certifiée à jour de son règlement peut demander la licence d’enseigner sous le nom de la Maison passé ce délai."
            onChange={(moisAvantLicence) => set({ moisAvantLicence })}
          />
        )}
        apercu={(v) => texteContratFormation({
          ...maison, apprenante: 'Nom de l’apprenante', formation: 'Parcours de l’Académie',
          prixXof: 0, echeances: 1, jourIso: jour,
          moisAvantLicence: v.moisAvantLicence,
          version: enVigueurDe(etat.formation, FORMATION_V1).version,
        })}
        onEtat={(e) => pose('formation', e)}
      />
    </div>
  );
}

/* ══════════════ ④ L'IDENTITÉ ══════════════

   CE QUI SIGNE CHAQUE PAPIER. Les mêmes champs qu'à Paramètres · La Maison,
   LE MÊME MAGASIN — une copie aurait donné deux identités à la même Maison, et
   c'est le défaut qu'on corrige ici depuis une semaine. Ce que cet onglet
   ajoute, et que l'autre écran n'a pas : on voit où chaque mot atterrit sur le
   papier. Un champ qu'on règle sans savoir ce qu'il imprime se règle à
   l'aveugle, et l'on découvre l'erreur sur un contrat déjà signé. */
function OngletIdentite() {
  const [id, setId] = useHouseIdentity();

  return (
    <div>
      <div className="txt-garde">
        <u>Le même réglage qu’à Paramètres · La Maison</u>
        Ce ne sont pas deux identités : c’est le même champ, montré ici à l’endroit où l’on écrit
        les textes, avec ce qu’il imprime. Le modifier ici le modifie partout, à la frappe.
      </div>

      <div className="txt-identite">
        <label className="txt-nombre">
          <span className="txt-rub__t">Le nom de la Maison</span>
          <input className="mnd-input" value={id.nom} onChange={(e) => setId({ ...id, nom: e.target.value })} />
          <span className="txt-rub__aide">
            En tête de chaque contrat, sur les factures, les reçus, et au centre du tampon.
          </span>
        </label>
        <label className="txt-nombre">
          <span className="txt-rub__t">La raison sociale</span>
          <input className="mnd-input" value={id.raison} onChange={(e) => setId({ ...id, raison: e.target.value })} />
          <span className="txt-rub__aide">
            La ligne légale, RCCM compris. Elle nomme la partie qui s’engage dans « entre les
            parties » : sans elle, un contrat lie un nom commercial, pas une société.
          </span>
        </label>
        <label className="txt-nombre">
          <span className="txt-rub__t">La ville du siège</span>
          <input className="mnd-input" value={id.ville} onChange={(e) => setId({ ...id, ville: e.target.value })} />
          <span className="txt-rub__aide">
            Celle qui signe le tampon. Distincte de la branche : l’atelier est à Suru-Léré, la
            Maison signe Cotonou. Un tampon porte un siège, pas l’adresse du fauteuil.
          </span>
        </label>
      </div>

      {/* OÙ CHAQUE MOT ATTERRIT. Un aperçu, pas le PDF : il dit la place, pas
          la police. Le montrer évite de régler à l'aveugle. */}
      <div className="txt-rub__t" style={{ marginTop: 22 }}>Ce que porte le papier</div>
      <div className="txt-papier">
        <div className="txt-papier__tete">
          <span>{(id.nom || 'Maison').toUpperCase()}</span>
          <span>CONTRAT</span>
        </div>
        <div className="txt-papier__corps">
          Entre la Maison {id.nom || '…'}
          {id.raison ? `, ${id.raison}` : ''}, dont le siège est à {id.ville || '…'}, ci-après « la
          Maison », et Nom de la personne, ci-après « le prestataire ».
        </div>
        <div className="txt-papier__bas">
          <span>Fait à {id.ville || '…'}, le …</span>
          <span className="txt-papier__tampon">
            {(id.nom || 'Maison').toUpperCase()}
            <em>{(id.ville || '…').toUpperCase()}</em>
          </span>
        </div>
        <div className="txt-papier__pied">{DEVISE_COMPLETE}</div>
      </div>
      <div className="txt-rub__aide" style={{ marginTop: 8 }}>
        La devise ne se règle pas : elle a une seule source, et chaque copie faite à la main
        a fini par diverger.
      </div>
    </div>
  );
}

export default function Textes() {
  const [tab, setTab] = useState<Onglet>('fiches');
  const [etat] = useReglement();
  const [staff] = useStaff();
  const enRetard = staff.filter((m) => ouEnEst(m.reglement, enVigueur(etat).version) !== 'a-jour').length;

  return (
    <div>
      <PageHead
        eyebrow="Paramètres"
        title="Les textes de la Maison"
        sub={
          <>
            Les fiches de poste disent le métier, le règlement dit les règles. Une fiche se corrige
            quand vous voulez ; le règlement publie une version, parce qu’il se signe.
            {enRetard > 0 && ` ${enRetard} personne(s) n’ont pas signé la version en vigueur.`}
          </>
        }
      />
      <Tabs
        tabs={[
          { k: 'fiches' as Onglet, l: 'Fiches de poste' },
          { k: 'reglement' as Onglet, l: 'Règlement intérieur' },
          { k: 'contrats' as Onglet, l: 'Contrats' },
          { k: 'identite' as Onglet, l: 'Identité' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <Card className="sys-section" style={{ marginTop: 18, padding: tab === 'fiches' ? 0 : undefined }}>
        {tab === 'fiches' && <OngletFiches />}
        {tab === 'reglement' && <OngletReglement />}
        {tab === 'contrats' && <OngletContrats />}
        {tab === 'identite' && <OngletIdentite />}
      </Card>
    </div>
  );
}
