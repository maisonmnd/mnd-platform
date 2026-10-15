import { useState, type FormEvent } from 'react';
import {
  AGE_DE_LA_PREPARATOIRE, ANNEE, CLASSES_PREP, LIENS, MIN_POURQUOI, NOM_DE_LA_PREPARATOIRE, RYTHME,
  ditLAgePrep, inscriptionVide, manqueALInscription, prixDit, type InscriptionPreparatoire,
} from '../../shared/preparatoire-pur';
import { deposeLInscription } from '../../shared/preparatoire';
import { dateLongue } from '../../shared/releve-pur';

/* ══ L'ANNÉE PRÉPARATOIRE, SUR LE SITE DE L'ACADÉMIE — 15 octobre 2026 ══
   Maquette Ak2z4MUF… validée et cochée. Des mineures : c'est le PARENT qui
   inscrit, et la page dit d'abord les règles qui les protègent. La voix de
   l'Académie (charte du 7 octobre 2026) : MND et l'atelier, jamais « la
   Maison ». Aucune photo. */

const PROGRAMME = [
  { quand: 'Janvier à mars', titre: 'Tenir sa place', gestes: ['La tenue, l’heure, la discrétion, la parole', 'L’hygiène des outils et du poste', 'Le cheveu afro, la racine, le cuir chevelu', 'Lire une fiche, écrire un message'] },
  { quand: 'Avril à juin', titre: 'Le soin', gestes: ['Le Lavage Rituel · KLƆKLƆ, sur tête d’étude', 'Le Soin Hydratant · DÀNDÀN, sans produit chimique', 'Le styling de sortie', 'Doser, rendre la monnaie, lire un prix'] },
  { quand: 'Juillet à septembre', titre: 'La passerelle', gestes: ['Assister un maître, observer un rituel complet', 'Un écrit et un pratique de fin d’année', 'Le bilan avec les parents'] },
];
const PROTECTION = [
  ['Les parents d’abord', 'L’inscription se fait par un parent ou un tuteur, qui vient à chaque bilan.'],
  ['Le matin seulement', 'Les cours ont lieu le matin. Personne ne reste à la fermeture.'],
  ['Aucun produit chimique', 'Ni défrisant, ni coloration, ni produit irritant avant 18 ans.'],
  ['Jamais seule sur une cliente', 'Des têtes d’étude, des exercices entre élèves, l’observation des maîtres.'],
  ['Une élève, pas une petite main', 'Elle ne balaie pas l’atelier et ne sert pas les clientes : elle apprend.'],
  ['Ses données à ses parents', 'Le dossier ne se lit que par la direction de l’Académie, et s’efface après l’année.'],
];

export default function Preparatoire({ branchId, onRetour, versLaReleve }: { branchId: string; onRetour: () => void; versLaReleve: () => void }) {
  const [i, setI] = useState<InscriptionPreparatoire>(inscriptionVide);
  const [erreur, setErreur] = useState('');
  const [etat, setEtat] = useState<'saisie' | 'envoi' | 'recue'>('saisie');
  const parent = (p: Partial<InscriptionPreparatoire['parent']>) => { setI((x) => ({ ...x, parent: { ...x.parent, ...p } })); setErreur(''); };
  const jeune = (p: Partial<InscriptionPreparatoire['jeune']>) => { setI((x) => ({ ...x, jeune: { ...x.jeune, ...p } })); setErreur(''); };
  const versLeFormulaire = () => document.getElementById('prep-inscription')?.scrollIntoView({ behavior: 'smooth' });

  const envoyer = async (e: FormEvent) => {
    e.preventDefault();
    if (etat !== 'saisie') return;
    const m = manqueALInscription(i);
    if (m) { setErreur(m); return; }
    setEtat('envoi');
    const ok = await deposeLInscription(i, { branchId });
    if (!ok) { setEtat('saisie'); setErreur('La demande n’a pas pu partir. Réessayez dans un moment : rien de ce que vous avez écrit n’est perdu.'); return; }
    setEtat('recue');
    versLeFormulaire();
  };
  const signes = i.pourquoi.trim().length;

  return (
    <main id="haut" className="rl">
      <section className="rl-ouverture">
        <p className="ac-eyebrow">{NOM_DE_LA_PREPARATOIRE} · rentrée le {dateLongue(ANNEE.rentree)}</p>
        <h1>Une année pour apprendre le métier, avant 18 ans.</h1>
        <p className="ac-chapeau">
          Pour les jeunes filles de {AGE_DE_LA_PREPARATOIRE.min} à {AGE_DE_LA_PREPARATOIRE.max} ans qui ont quitté l’école.
          {' '}{RYTHME}, de janvier à {ANNEE.finDit}, à l’atelier de Cotonou. Une classe de {ANNEE.places}.
        </p>
        <p className="rl-public">Une formation, comme une école : {prixDit()}. À 18 ans, elle passe directement à l’entretien de La Relève MND.</p>
        <div className="ac-gestes">
          <button type="button" className="ac-btn ac-btn--plein" onClick={versLeFormulaire}>Inscrire ma fille</button>
          <button type="button" className="ac-btn" onClick={onRetour}>Retour à l’Académie</button>
        </div>
      </section>

      <section className="rl-programme">
        <h2>L’année</h2>
        <div className="rl-semestres rl-semestres--trois">
          {PROGRAMME.map((s) => (
            <div key={s.quand} className="rl-semestre">
              <span className="rl-quand">{s.quand}</span>
              <b>{s.titre}</b>
              <ul>{s.gestes.map((g) => <li key={g}>{g}</li>)}</ul>
            </div>
          ))}
        </div>
        <p className="ac-legende">L’année enseigne le métier. Le CEP se prépare à part : La Relève le demandera à 18 ans.</p>
      </section>

      <section className="rl-inverse">
        <h2>Ce qui la protège</h2>
        <ul className="rl-dons">
          {PROTECTION.map(([t, d]) => <li key={t}><b>{t}</b><span>{d}</span></li>)}
        </ul>
      </section>

      <section className="rl-selection">
        <h2>Et après</h2>
        <ol className="rl-etapes">
          <li><b>Elle a 18 ans et le CEP</b><span>Elle passe directement à l’entretien de La Relève MND, l’apprentissage de deux ou trois ans. <button type="button" className="rl-lien" onClick={versLaReleve}>Découvrir La Relève</button></span></li>
          <li><b>Elle a moins de 18 ans</b><span>Une deuxième année, au même rythme, jusqu’à ses 18 ans.</span></li>
          <li><b>Elle n’a pas encore le CEP</b><span>Elle le passe en candidate libre ; La Relève l’attend.</span></li>
        </ol>
      </section>

      <section id="prep-inscription" className="rl-candidature">
        {etat === 'recue' ? (
          <div className="rl-recu">
            <p className="ac-eyebrow">Demande reçue</p>
            <h2>Merci. Nous vous appelons sur WhatsApp.</h2>
            <ol>
              <li>Sous dix jours, l’Académie vous appelle, vous, son parent.</li>
              <li>Un entretien à l’atelier, avec elle et avec vous.</li>
              <li>Si la place est à elle : l’inscription ({prixDit().split(',')[0]}), puis la rentrée du {dateLongue(ANNEE.rentree)}.</li>
            </ol>
          </div>
        ) : (
          <>
            <p className="ac-eyebrow">Inscription · {NOM_DE_LA_PREPARATOIRE}</p>
            <h2>Inscrire ma fille.</h2>
            <p className="ac-intro">Ce formulaire se remplit par le parent ou le tuteur. Seule la dernière question est écrite par elle.</p>
            <form className="rl-form" onSubmit={(e) => void envoyer(e)} noValidate>
              <fieldset className="rl-pas-form">
                <legend>Vous, son parent</legend>
                <div className="ac-form__deux">
                  <label className="ac-champ"><span>Votre prénom et votre nom</span><input id="prep-parent" autoComplete="name" value={i.parent.nom} onChange={(e) => parent({ nom: e.target.value })} /></label>
                  <label className="ac-champ"><span>Votre WhatsApp</span><input id="prep-tel" inputMode="tel" autoComplete="tel" value={i.parent.telephone} onChange={(e) => parent({ telephone: e.target.value })} placeholder="+229 01 00 00 00 00" /></label>
                </div>
                <div className="ac-champ"><span>Vous êtes</span>
                  <div className="rl-cases">{LIENS.map((l) => <button key={l} type="button" className={`rl-case${i.parent.lien === l ? ' est-choisie' : ''}`} aria-pressed={i.parent.lien === l} onClick={() => parent({ lien: l })}>{l}</button>)}</div>
                </div>
              </fieldset>
              <fieldset className="rl-pas-form">
                <legend>Elle</legend>
                <div className="ac-form__deux">
                  <label className="ac-champ"><span>Son prénom</span><input id="prep-prenom" value={i.jeune.prenom} onChange={(e) => jeune({ prenom: e.target.value })} /></label>
                  <label className="ac-champ"><span>Son nom</span><input id="prep-nom" value={i.jeune.nom} onChange={(e) => jeune({ nom: e.target.value })} /></label>
                  <label className="ac-champ"><span>Sa date de naissance</span><input id="prep-naissance" type="date" value={i.jeune.naissance} onChange={(e) => jeune({ naissance: e.target.value })} />{i.jeune.naissance && <small className="rl-dit">{ditLAgePrep(i.jeune.naissance)}</small>}</label>
                  <label className="ac-champ"><span>Sa dernière classe</span><select id="prep-classe" value={i.jeune.classe} onChange={(e) => jeune({ classe: e.target.value })}><option value="">Choisir</option>{CLASSES_PREP.map((c) => <option key={c}>{c}</option>)}</select></label>
                </div>
                <label className="ac-champ"><span>Ce qu’elle aime faire de ses mains (facultatif)</span><input id="prep-mains" value={i.mains} onChange={(e) => setI((x) => ({ ...x, mains: e.target.value }))} placeholder="tresser ses sœurs, coudre, dessiner…" /></label>
                <label className="ac-champ"><span>Pourquoi ce métier ? Quelques phrases, écrites par elle</span><textarea id="prep-pourquoi" rows={4} value={i.pourquoi} onChange={(e) => { setI((x) => ({ ...x, pourquoi: e.target.value })); setErreur(''); }} />
                  <span className={`rl-compteur${signes >= MIN_POURQUOI ? ' est-bon' : ''}`}>{signes >= MIN_POURQUOI ? `${signes} signes · c’est bien` : `${signes} signes, ${MIN_POURQUOI - signes} de plus au moins`}</span></label>
              </fieldset>
              <label className="rl-engagement"><input id="prep-consentement" type="checkbox" checked={i.consentement} onChange={(e) => setI((x) => ({ ...x, consentement: e.target.checked }))} /><span>Je suis son parent ou son tuteur. J’inscris ma fille, et l’Académie MND peut garder cette demande le temps de l’année pour l’étudier et me répondre, puis l’efface.</span></label>
              {erreur && <p className="ac-dit" role="alert">{erreur}</p>}
              <div className="ac-form__gestes">
                <button type="submit" className="ac-btn ac-btn--plein" disabled={etat === 'envoi'}>{etat === 'envoi' ? 'Envoi en cours' : 'Demander l’inscription'}</button>
              </div>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
