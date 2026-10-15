import { useState, type FormEvent } from 'react';
import { nombreEnChiffres } from '../../shared/lettres';
import {
  AGE_VISE, CLASSES, DIPLOMES, GARDE_DU_DOSSIER_MOIS, GESTES_DEJA, LANGUES, LETTRE, MINIMA, NOM_DE_LA_RELEVE, PAS_DU_DOSSIER, PROMOTION,
  SOURCES_DE_LA_RELEVE, candidaturesOuvertes, dateLongue, ditLAge, dossierVide, manqueAuDossier, manqueAuPas, motsDe, parcoursDEntree,
  type DossierReleve,
} from '../../shared/releve-pur';
import { deposeLeDossier } from '../../shared/releve';

/* ══ LA RELÈVE MND, SUR LE SITE DE L'ACADÉMIE — 15 octobre 2026 ═══════
   Maquette `maquette-les-apprenties.html`, validée et cochée. LA VOIX DE
   L'ACADÉMIE (charte du 7 octobre 2026) : le site ne parle jamais au nom de
   « la Maison » ; il dit MND, et l'atelier. La page dit
   le programme, la sélection, et porte le questionnaire en six pas. Les
   règles sont celles de `shared/releve-pur` (le Trône et le banc lisent les
   mêmes). Aucune photo : la page parle d'élèves à venir, pas de personnes
   qui ont dit oui à une image. Le public visé se DIT ; rien ne se refuse
   pour l'âge, et le sexe ne se demande pas (Code du travail, art. 4). */

const aujourdhui = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const PROGRAMME = [
  { quand: 'Semestre 1', titre: 'L’accueil et le soin', gestes: ['L’accueil, la tenue, l’heure, la discrétion', 'L’hygiène des outils et du poste', 'Le Lavage Rituel · KLƆKLƆ', 'Le Soin Hydratant · DÀNDÀN, la Purification · WÈWÈ'] },
  { quand: 'Semestre 2', titre: 'La vie des locks', gestes: ['La Vie · GBÈJÍ : l’entretien, la reprise des racines', 'La Reprise Frontale', 'Le styling signature'] },
  { quand: 'Semestre 3', titre: 'La naissance', gestes: ['La Naissance · VÈKPÈ : créer une couronne', 'Lire et respecter un calibre', 'Le Diagnostic · KÒKÒ, mené à deux'] },
  { quand: 'Semestre 4', titre: 'La lumière et la renaissance', gestes: ['La Lumière · YÈKPÈ', 'La Renaissance · FÍNFÍN, la reconstruction · GBÌGBÌ', 'Le Défaisage · GBÀTÀ'] },
  { quand: 'Semestres 5 et 6', titre: 'L’autonomie', gestes: ['Le Diagnostic seule', 'Ses propres clientes, sous l’œil d’une référente', 'Former la promotion suivante', 'La présentation au CQM'], trois: true },
];
/* LA FONDATION D'ABORD (15 octobre 2026) : après l'entretien, le parcours
   payant de l'Académie remplace la semaine d'immersion ; son prix vient de
   la semence des parcours, jamais d'un chiffre recopié ici. */
const FONDATION = parcoursDEntree();
const PRIX_DE_LA_FONDATION = FONDATION ? `${nombreEnChiffres(FONDATION.prixXof)} F` : '';
const SELECTION = [
  ['Le dossier en ligne', 'Ce questionnaire et votre lettre. Gratuit. Une réponse à chacune sous dix jours, retenue ou non.'],
  ['L’appel', 'Quinze minutes au téléphone.'],
  ['L’entretien et l’écrit', 'Une heure trente à l’atelier : lire une notice, calculer un dosage, écrire une page à la main, parler de vous.'],
  ['La Fondation à l’Académie', `Pour les candidates retenues à l’entretien : ${FONDATION?.duree ?? 'quatre semaines'}, ${PRIX_DE_LA_FONDATION}. C’est l’inscription de l’école, la seule étape payante.`],
  ['L’essai pratique', 'Il clôt la Fondation : une tête d’étude, devant deux maîtres MND.'],
  ['La décision et le contrat', 'Un contrat écrit, en quatre exemplaires, visé par le ministère du Travail.'],
];

export default function LaReleve({ branchId, onRetour }: { branchId: string; onRetour: () => void }) {
  const [d, setD] = useState<DossierReleve>(dossierVide);
  const [pas, setPas] = useState(0);
  const [erreur, setErreur] = useState('');
  const [etat, setEtat] = useState<'saisie' | 'envoi' | 'recue'>('saisie');
  const ouverte = candidaturesOuvertes(aujourdhui());

  const pose = (patch: Partial<DossierReleve>) => { setD((x) => ({ ...x, ...patch })); setErreur(''); };
  const bascule = (cle: 'langues' | 'gestes', v: string) =>
    pose({ [cle]: d[cle].includes(v) ? d[cle].filter((x) => x !== v) : [...d[cle], v] } as Partial<DossierReleve>);
  const versLeFormulaire = () => document.getElementById('rl-candidature')?.scrollIntoView({ behavior: 'smooth' });

  const suite = async (e: FormEvent) => {
    e.preventDefault();
    if (etat !== 'saisie') return;
    const m = manqueAuPas(d, pas);
    if (m) { setErreur(m); return; }
    if (pas < PAS_DU_DOSSIER.length - 1) { setPas(pas + 1); versLeFormulaire(); return; }
    const tout = manqueAuDossier(d);
    if (tout) { setErreur(tout); return; }
    setEtat('envoi');
    const ok = await deposeLeDossier(d, { branchId, page: '/academie/#la-releve' });
    if (!ok) { setEtat('saisie'); setErreur('Votre candidature n’a pas pu partir. Réessayez dans un moment : rien de ce que vous avez écrit n’est perdu.'); return; }
    setEtat('recue');
    versLeFormulaire();
  };

  const n = (cle: keyof typeof MINIMA, v: string) => {
    const s = v.trim().length;
    return <span className={`rl-compteur${s >= MINIMA[cle] ? ' est-bon' : ''}`}>{s >= MINIMA[cle] ? `${s} signes · c’est bien` : `${s} signes, ${MINIMA[cle] - s} de plus au moins`}</span>;
  };
  const mots = motsDe(d.lettre);

  return (
    <main id="haut" className="rl">
      <section className="rl-ouverture">
        <p className="ac-eyebrow">{NOM_DE_LA_RELEVE} · promotion {PROMOTION.dit}</p>
        <h1>Devenir apprentie chez MND.</h1>
        <p className="ac-chapeau">
          Deux ou trois ans à l’atelier, à temps plein, pour devenir spécialiste des locks.
          Une promotion de {PROMOTION.places} par an, un programme écrit, une allocation chaque mois.
          On entre par la Fondation de l’Académie ; ensuite, l’apprentissage ne vous coûte rien.
        </p>
        <p className="rl-public">
          {NOM_DE_LA_RELEVE} s’adresse aux jeunes femmes de {AGE_VISE.min} à {AGE_VISE.max} ans. Le CEP au moins est demandé.
          Candidatures jusqu’au {dateLongue(PROMOTION.jusquau)}, rentrée en {PROMOTION.dit}.
        </p>
        <div className="ac-gestes">
          {ouverte && <button type="button" className="ac-btn ac-btn--plein" onClick={versLeFormulaire}>Je candidate</button>}
          <button type="button" className="ac-btn" onClick={onRetour}>Retour à l’Académie</button>
        </div>
      </section>

      <section className="rl-inverse">
        <h2>Ce que La Relève vous donne</h2>
        <ul className="rl-dons">
          <li><b>Un vrai programme</b><span>Écrit semestre par semestre, sur les gestes de la carte MND. Chaque geste se valide : en formation, autonome, référente.</span></li>
          <li><b>Une journée de cours par semaine</b><span>À l’Académie : le français et le calcul du métier, les produits et le cuir chevelu, l’hygiène, l’accueil.</span></li>
          <li><b>Une allocation chaque mois</b><span>Elle monte chaque année. Pendant l’apprentissage, vous ne payez rien : ni formation, ni examen, ni libération.</span></li>
          <li><b>Un contrat écrit</b><span>En quatre exemplaires, visé par le ministère du Travail. Il protège les deux parties.</span></li>
          <li><b>Deux certificats</b><span>Le certificat de l’Académie MND, qui ne se donne pas, puis la présentation au CQM pour le titre national.</span></li>
          <li><b>Une place, peut-être</b><span>Les meilleures se voient proposer de rester à l’atelier.</span></li>
        </ul>
      </section>

      <section className="rl-programme">
        <h2>Le parcours</h2>
        <p className="ac-intro">Deux ans si vous avez déjà terminé un apprentissage ou obtenu un CQM, trois ans si vous commencez. La sélection décide de votre parcours.</p>
        <div className="rl-semestres">
          {PROGRAMME.map((s) => (
            <div key={s.quand} className={`rl-semestre${s.trois ? ' rl-semestre--trois' : ''}`}>
              <span className="rl-quand">{s.quand}</span>
              <b>{s.titre}</b>
              <ul>{s.gestes.map((g) => <li key={g}>{g}</li>)}</ul>
            </div>
          ))}
        </div>
        <p className="ac-legende">En pointillé : le parcours de trois ans seulement. Un écrit et un pratique ferment chaque semestre.</p>
      </section>

      <section className="rl-selection">
        <h2>Comment nous choisissons</h2>
        <ol className="rl-etapes">
          {SELECTION.map(([t, dit]) => <li key={t}><b>{t}</b><span>{dit}</span></li>)}
        </ol>
        <p className="rl-elimine">Une absence sans prévenir, un retard sans un mot, une lettre qui n’est pas de vous, un mensonge sur votre parcours écartent la candidature, à toute étape.</p>
      </section>

      <section id="rl-candidature" className="rl-candidature">
        {!ouverte ? (
          <div className="ac-recu"><b>Les candidatures de la promotion d’{PROMOTION.dit} sont closes.</b>La prochaine promotion s’annoncera ici.</div>
        ) : etat === 'recue' ? (
          <div className="rl-recu">
            <p className="ac-eyebrow">Candidature reçue</p>
            <h2>Merci, {d.prenom.trim()}. Nous lisons votre dossier.</h2>
            <ol>
              <li>Sous dix jours, MND vous répond sur WhatsApp, retenue ou non.</li>
              <li>Si votre dossier est retenu : un appel de quinze minutes.</li>
              <li>Puis l’entretien et l’écrit à l’atelier ; retenue, vous suivez la Fondation de l’Académie, que l’essai pratique clôt.</li>
              <li>La décision, et pour les retenues, le contrat.</li>
            </ol>
            <p className="ac-legende">La candidature est gratuite. Seule la Fondation, si vous êtes retenue à l’entretien, est payante{PRIX_DE_LA_FONDATION ? ` (${PRIX_DE_LA_FONDATION})` : ''}.</p>
          </div>
        ) : (
          <>
            <p className="ac-eyebrow">Candidature · {NOM_DE_LA_RELEVE}</p>
            <h2>Votre dossier, en six pas.</h2>
            <p className="ac-intro">Nous lisons chaque dossier. Prenez le temps : vingt minutes environ.</p>
            <div className="rl-pas" aria-label="Les étapes du questionnaire">
              {PAS_DU_DOSSIER.map((p, i) => <span key={p} className={i < pas ? 'est-fait' : i === pas ? 'est-ici' : ''}>{i + 1} · {p}</span>)}
            </div>
            <form className="rl-form" onSubmit={(e) => void suite(e)} noValidate>
              {pas === 0 && (
                <fieldset className="rl-pas-form">
                  <legend>Vous</legend>
                  <p className="rl-aide">Écrivez comme sur votre pièce d’identité.</p>
                  <div className="ac-form__deux">
                    <label className="ac-champ"><span>Prénom</span><input id="rl-prenom" autoComplete="given-name" value={d.prenom} onChange={(e) => pose({ prenom: e.target.value })} /></label>
                    <label className="ac-champ"><span>Nom</span><input id="rl-nom" autoComplete="family-name" value={d.nom} onChange={(e) => pose({ nom: e.target.value })} /></label>
                    <label className="ac-champ"><span>Date de naissance</span><input id="rl-naissance" type="date" value={d.naissance} onChange={(e) => pose({ naissance: e.target.value })} />{d.naissance && <small className="rl-dit">{ditLAge(d.naissance)}</small>}</label>
                    <label className="ac-champ"><span>Quartier et commune</span><input id="rl-quartier" value={d.quartier} onChange={(e) => pose({ quartier: e.target.value })} placeholder="Fidjrossè, Cotonou" /></label>
                    <label className="ac-champ"><span>WhatsApp</span><input id="rl-telephone" inputMode="tel" autoComplete="tel" value={d.telephone} onChange={(e) => pose({ telephone: e.target.value })} placeholder="+229 01 00 00 00 00" /></label>
                    <label className="ac-champ"><span>E-mail, si vous en avez un</span><input id="rl-email" type="email" autoComplete="email" value={d.email ?? ''} onChange={(e) => pose({ email: e.target.value })} /></label>
                  </div>
                  <div className="ac-champ"><span>Comment nous avez-vous connue ?</span>
                    <div className="rl-cases">{SOURCES_DE_LA_RELEVE.map((s) => <button key={s} type="button" className={`rl-case${d.source === s ? ' est-choisie' : ''}`} aria-pressed={d.source === s} onClick={() => pose({ source: s })}>{s}</button>)}</div>
                  </div>
                </fieldset>
              )}
              {pas === 1 && (
                <fieldset className="rl-pas-form">
                  <legend>Votre parcours scolaire</legend>
                  <p className="rl-aide">Le CEP au moins est demandé. Dites votre parcours tel qu’il est.</p>
                  <div className="ac-form__deux">
                    <label className="ac-champ"><span>Dernière classe suivie</span><select id="rl-classe" value={d.classe} onChange={(e) => pose({ classe: e.target.value })}><option value="">Choisir</option>{CLASSES.map((c) => <option key={c}>{c}</option>)}</select></label>
                    <label className="ac-champ"><span>Diplôme le plus haut</span><select id="rl-diplome" value={d.diplome} onChange={(e) => pose({ diplome: e.target.value })}><option value="">Choisir</option>{DIPLOMES.map((c) => <option key={c}>{c}</option>)}</select></label>
                    <label className="ac-champ"><span>L’année où vous avez arrêté</span><input id="rl-arret" inputMode="numeric" value={d.arretLe ?? ''} onChange={(e) => pose({ arretLe: e.target.value })} placeholder="2019" /></label>
                  </div>
                  <div className="ac-champ"><span>Les langues que vous parlez</span>
                    <div className="rl-cases">{LANGUES.map((l) => <button key={l} type="button" className={`rl-case${d.langues.includes(l) ? ' est-choisie' : ''}`} aria-pressed={d.langues.includes(l)} onClick={() => bascule('langues', l)}>{l}</button>)}</div>
                  </div>
                  <label className="ac-champ"><span>Pourquoi l’école s’est-elle arrêtée ? (facultatif)</span><textarea id="rl-arret-pourquoi" rows={3} value={d.pourquoiArret ?? ''} onChange={(e) => pose({ pourquoiArret: e.target.value })} /></label>
                </fieldset>
              )}
              {pas === 2 && (
                <fieldset className="rl-pas-form">
                  <legend>Votre expérience</legend>
                  <p className="rl-aide">Aucune expérience n’est exigée : nous formons. Dites-nous ce que vous savez déjà.</p>
                  <div className="ac-champ"><span>Avez-vous déjà appris chez une coiffeuse ?</span>
                    <div className="rl-cases">
                      {([['non', 'Non, jamais'], ['en-cours', 'Oui, je suis encore apprentie'], ['termine', 'Oui, j’ai terminé']] as const).map(([v, t]) => (
                        <button key={v} type="button" className={`rl-case${d.deja === v ? ' est-choisie' : ''}`} aria-pressed={d.deja === v} onClick={() => pose({ deja: v })}>{t}</button>
                      ))}
                    </div>
                  </div>
                  {d.deja && d.deja !== 'non' && (
                    <div className="ac-form__deux">
                      <label className="ac-champ"><span>Combien de temps ?</span><input id="rl-duree-exp" value={d.dureeExperience ?? ''} onChange={(e) => pose({ dureeExperience: e.target.value })} placeholder="2 ans et demi" /></label>
                      <label className="ac-champ"><span>Où, et chez qui ? (facultatif)</span><input id="rl-ou" value={d.ou ?? ''} onChange={(e) => pose({ ou: e.target.value })} /></label>
                    </div>
                  )}
                  <div className="ac-champ"><span>Les gestes que vous savez déjà faire</span>
                    <div className="rl-cases">{GESTES_DEJA.map((g) => <button key={g} type="button" className={`rl-case${d.gestes.includes(g) ? ' est-choisie' : ''}`} aria-pressed={d.gestes.includes(g)} onClick={() => bascule('gestes', g)}>{g}</button>)}</div>
                  </div>
                  <label className="ac-champ"><span>Avez-vous travaillé ailleurs ? Commerce, couture, garde d’enfants, études… (facultatif)</span><textarea id="rl-autre" rows={3} value={d.autreTravail ?? ''} onChange={(e) => pose({ autreTravail: e.target.value })} /></label>
                </fieldset>
              )}
              {pas === 3 && (
                <fieldset className="rl-pas-form">
                  <legend>Vos motivations</legend>
                  <p className="rl-aide">Quelques phrases pour chacune. Nous cherchons votre voix, pas de belles formules.</p>
                  <label className="ac-champ"><span>Pourquoi la coiffure, et pourquoi les locks ?</span><textarea id="rl-m1" rows={4} value={d.motivations.coiffure} onChange={(e) => pose({ motivations: { ...d.motivations, coiffure: e.target.value } })} />{n('coiffure', d.motivations.coiffure)}</label>
                  <label className="ac-champ"><span>Pourquoi MND, et pas une autre ?</span><textarea id="rl-m2" rows={4} value={d.motivations.maison} onChange={(e) => pose({ motivations: { ...d.motivations, maison: e.target.value } })} />{n('maison', d.motivations.maison)}</label>
                  <label className="ac-champ"><span>Où vous voyez-vous dans cinq ans ?</span><textarea id="rl-m3" rows={3} value={d.motivations.cinqAns} onChange={(e) => pose({ motivations: { ...d.motivations, cinqAns: e.target.value } })} />{n('cinqAns', d.motivations.cinqAns)}</label>
                </fieldset>
              )}
              {pas === 4 && (
                <fieldset className="rl-pas-form">
                  <legend>Pourquoi vous retenir</legend>
                  <p className="rl-aide">MND forme peu de personnes. Dites-nous pourquoi vous.</p>
                  <label className="ac-champ"><span>Une qualité que vous avez, et une preuve</span><textarea id="rl-r1" rows={3} value={d.raisons.qualite} onChange={(e) => pose({ raisons: { ...d.raisons, qualite: e.target.value } })} />{n('qualite', d.raisons.qualite)}</label>
                  <label className="ac-champ"><span>Une difficulté que vous avez surmontée</span><textarea id="rl-r2" rows={3} value={d.raisons.difficulte} onChange={(e) => pose({ raisons: { ...d.raisons, difficulte: e.target.value } })} />{n('difficulte', d.raisons.difficulte)}</label>
                  <div className="ac-champ"><span>Votre disponibilité</span>
                    <div className="rl-cases">
                      {/* DEUX RÉPONSES, PAS TROIS — 15 octobre 2026 (Yéman) : disponible
                          pour deux ans, ou pour trois ans ; ni « pas disponible »,
                          ni les jours de la semaine. */}
                      <button type="button" className={`rl-case${d.disponibilite === 'deux-ans' ? ' est-choisie' : ''}`} aria-pressed={d.disponibilite === 'deux-ans'} onClick={() => pose({ disponibilite: 'deux-ans' })}>Disponible pour deux ans</button>
                      <button type="button" className={`rl-case${d.disponibilite === 'trois-ans' ? ' est-choisie' : ''}`} aria-pressed={d.disponibilite === 'trois-ans'} onClick={() => pose({ disponibilite: 'trois-ans' })}>Disponible pour trois ans</button>
                    </div>
                  </div>
                  <label className="rl-engagement"><input id="rl-e1" type="checkbox" checked={d.engagements.tenue} onChange={(e) => pose({ engagements: { ...d.engagements, tenue: e.target.checked } })} /><span>Je m’engage, si je suis retenue, à tenir l’heure, la tenue et la discrétion de MND.</span></label>
                </fieldset>
              )}
              {pas === 5 && (
                <fieldset className="rl-pas-form">
                  <legend>Votre lettre</legend>
                  <p className="rl-aide">À MND, en vos mots : qui vous êtes, ce que vous voulez apprendre, ce que vous apporterez. Entre {LETTRE.min} et {LETTRE.max} mots. À l’entretien, vous en écrirez une page à la main.</p>
                  <label className="ac-champ"><span>Lettre de motivation</span><textarea id="rl-lettre" rows={12} value={d.lettre} onChange={(e) => pose({ lettre: e.target.value })} />
                    <span className={`rl-compteur${mots >= LETTRE.min && mots <= LETTRE.max ? ' est-bon' : ''}`}>{mots} mots · entre {LETTRE.min} et {LETTRE.max}</span></label>
                  <label className="rl-engagement"><input id="rl-e2" type="checkbox" checked={d.engagements.lettre} onChange={(e) => pose({ engagements: { ...d.engagements, lettre: e.target.checked } })} /><span>Cette lettre est de moi. Je sais qu’une lettre écrite par une autre personne écarte ma candidature.</span></label>
                  <label className="rl-engagement"><input id="rl-e3" type="checkbox" checked={d.engagements.garde} onChange={(e) => pose({ engagements: { ...d.engagements, garde: e.target.checked } })} /><span>MND peut garder ma candidature {GARDE_DU_DOSSIER_MOIS} mois pour l’étudier et me répondre, puis l’efface. Rien d’autre.</span></label>
                </fieldset>
              )}
              {erreur && <p className="ac-dit" role="alert">{erreur}</p>}
              <div className="ac-form__gestes">
                {pas > 0 && <button type="button" className="ac-btn" onClick={() => { setPas(pas - 1); setErreur(''); }}>Retour</button>}
                <button type="submit" className="ac-btn ac-btn--plein" disabled={etat === 'envoi'}>
                  {etat === 'envoi' ? 'Envoi en cours' : pas === PAS_DU_DOSSIER.length - 1 ? 'Envoyer ma candidature' : 'Continuer'}
                </button>
              </div>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
