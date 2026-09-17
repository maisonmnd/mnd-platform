import { useEffect, useState } from 'react';
import { COMMUN } from '../contenu';
import { lienWhatsApp, maison } from '../maison';
import { mesure } from '../mesure';
import type { Besoin } from '../../../shared/qualification';

/* « JE NE SAIS PAS QUEL SERVICE CHOISIR » — trois questions, une porte.

   L'arbre vient de la maquette validée. Ce qui décide n'est pas l'état
   déclaré mais la sortie : création, réparation et « je ne sais pas » mènent
   au regard ; un geste régulier se réserve directement. La règle elle-même
   vit dans `shared/qualification.ts` (porteDuBesoin). */

type Sortie = {
  besoin: Besoin;
  sur: string;
  titre: string;
  texte: string;
  vers: string;
  bouton: string;
};

const SORTIES: Record<string, Sortie> = {
  creation: { besoin: 'creation', sur: 'Première Couronne', titre: 'Votre couronne commence ici.', texte: 'Une création débute par une consultation. Rien d’autre à décider aujourd’hui.', vers: '/premiere-couronne/', bouton: 'Voir la Première Couronne' },
  reparation: { besoin: 'reparation', sur: 'Réparation', titre: 'Regardons d’abord.', texte: 'Une réparation commence par un diagnostic, zone par zone. Ensuite seulement, nous proposons.', vers: '/reparation-locks/', bouton: 'Voir la Réparation' },
  regard: { besoin: 'reparation', sur: 'Réparation', titre: 'Regardons d’abord.', texte: 'Vous n’avez pas à mettre un nom sur ce que vous ressentez. Nous déciderons après avoir vu.', vers: '/reparation-locks/', bouton: 'Voir la Réparation' },
  entretien: { besoin: 'entretien', sur: 'Entretien', titre: 'Vos locks ont juste besoin de leur rendez-vous.', texte: 'Pas de consultation. Choisissez votre geste et votre créneau.', vers: '/entretien-locks/', bouton: 'Voir l’entretien' },
  kids: { besoin: 'enfant', sur: 'MND Kids', titre: 'Pour votre enfant, tout va plus doucement.', texte: 'Découvrez la séance, puis organisons votre visite.', vers: '/mnd-kids/', bouton: 'Voir MND Kids' },
  formation: { besoin: 'formation', sur: 'Formations', titre: 'Apprendre à faire, et à bien faire.', texte: 'La méthode, les gestes, la tenue d’un salon.', vers: '/formations/', bouton: 'Voir les formations' },
};

type Etape = 'q1' | 'q2' | 'q3';
type Reponse = { texte: string; detail?: string; vers: Etape | keyof typeof SORTIES };

const QUESTIONS: Record<Etape, { titre: string; reponses: Reponse[]; retour?: Etape }> = {
  q1: { titre: 'Où en êtes-vous avec les locks ?', reponses: [
    { texte: 'Je n’en ai pas encore', vers: 'creation' },
    { texte: 'J’en ai déjà', vers: 'q2' },
    { texte: 'C’est pour mon enfant', vers: 'kids' },
    { texte: 'Je veux en faire mon métier', vers: 'formation' },
  ] },
  q2: { titre: 'Comment se portent-elles ?', retour: 'q1', reponses: [
    { texte: 'Bien, je veux les entretenir', vers: 'q3' },
    { texte: 'Quelque chose m’inquiète', detail: 'Casse, amincissement, racines, locks perdues', vers: 'reparation' },
    { texte: 'Je ne sais pas trop, j’aimerais un avis', vers: 'regard' },
  ] },
  q3: { titre: 'Pour votre prochain rendez-vous ?', retour: 'q2', reponses: [
    { texte: 'Un geste régulier', detail: 'Lavage, resserrage, hydratation', vers: 'entretien' },
    { texte: 'Une coiffure', vers: 'entretien' },
    { texte: 'Un changement', detail: 'Couleur végétale, défaisage, nouvelle forme', vers: 'regard' },
  ] },
};

const base = (chemin: string): string => import.meta.env.BASE_URL.replace(/\/$/, '') + chemin;

export default function Triage() {
  const [etape, setEtape] = useState<Etape>('q1');
  const [sortie, setSortie] = useState<Sortie | null>(null);
  const [numero, setNumero] = useState('');
  useEffect(() => { void maison().then((m) => setNumero(m?.whatsapp ?? '')); }, []);

  const repond = (vers: Reponse['vers']) => {
    if (etape === 'q1' && !sortie) mesure('triage_commence');
    if (vers in QUESTIONS) { setEtape(vers as Etape); return; }
    const s = SORTIES[vers];
    setSortie(s);
    mesure('triage_termine', { sortie: vers, parcours: s.besoin });
  };
  const recommence = () => { setSortie(null); setEtape('q1'); };

  const rang = sortie ? 3 : ['q1', 'q2', 'q3'].indexOf(etape);
  if (sortie) {
    return (
      <div className="triage">
        <div className="etapes"><span className="fait" /><span className="fait" /><span className="fait" /></div>
        <div className="sortie">
          <p className="sur">{sortie.sur}</p>
          <h2>{sortie.titre}</h2>
          <p>{sortie.texte}</p>
          <div className="rangee">
            <a className="btn btn--plein" href={base(sortie.vers)} onClick={() => mesure('parcours_choisi', { parcours: sortie.besoin })}>{sortie.bouton}</a>
            <a className="btn btn--lien" href={lienWhatsApp(numero, COMMUN.messages[sortie.besoin])} target="_blank" rel="noopener" onClick={() => mesure('whatsapp_clique', { parcours: sortie.besoin })}>WhatsApp</a>
          </div>
        </div>
        <div className="rangee" style={{ marginTop: 26 }}><button type="button" className="btn btn--lien" onClick={recommence}>Recommencer</button></div>
      </div>
    );
  }
  const q = QUESTIONS[etape];
  return (
    <div className="triage">
      <div className="etapes">{[0, 1, 2].map((i) => <span key={i} className={i <= rang ? 'fait' : ''} />)}</div>
      <div className="question venir" key={etape}>
        <h2>{q.titre}</h2>
        <div className="reponses">
          {q.reponses.map((r) => (
            <button type="button" className="reponse" key={r.texte} onClick={() => repond(r.vers)}>
              <i /><span>{r.texte}{r.detail && <small>{r.detail}</small>}</span>
            </button>
          ))}
        </div>
        {q.retour && <button type="button" className="btn btn--lien retour" onClick={() => setEtape(q.retour!)}>Revenir</button>}
      </div>
    </div>
  );
}
