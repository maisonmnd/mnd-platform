/* LA QUESTION DE LA MAISON — 22 septembre 2026.
   Maquette `public/maquette-la-question-de-la-maison.html`, validée.

   POURQUOI ELLE EXISTE. Quatre-vingt-neuf `window.confirm` demandaient
   « êtes-vous sûr ? » dans Le Trône. Le navigateur propose, au bout de deux
   ou trois fenêtres, de « ne plus afficher de boîtes de dialogue sur cette
   page » : une case cochée par réflexe, et les quatre-vingt-neuf répondent
   « non » sans rien afficher. Rien ne se supprime, rien ne se clôture, et
   l'écran ne dit pas pourquoi. C'est la leçon d'Accès du 5 septembre.

   POURQUOI UNE FONCTION ET NON UN COMPOSANT. Les appels vivent au milieu de
   gestes déjà écrits (`if (!window.confirm(…)) return;`). Une fenêtre montée
   à la demande, qui rend une promesse, se substitue en UNE ligne par appel.
   Un composant à poser dans chaque écran aurait demandé un état, un rendu
   conditionnel et un rappel par site : autant d'occasions de se tromper.

   CE QU'ELLE EMPRUNTE À LA MODALE DE LA MAISON, et pourquoi : Échap ferme,
   le clic sur le voile NE ferme PAS. Au comptoir, un clic à cinq pixels de
   la modale effaçait un encaissement en cours de saisie (leçon du 9 août).
   Ici l'enjeu est le même à l'envers : un clic distrait ne doit pas valoir
   un refus silencieux sur une question qu'on n'a pas lue.

   LE REPOS EST DU CÔTÉ SÛR. C'est le bouton qui NE FAIT RIEN qui prend le
   foyer à l'ouverture. Entrée le déclenche donc, et refuse. Un clavier qui
   valide par réflexe ne doit jamais supprimer une cliente. Qui veut
   vraiment agir tabule jusqu'à l'autre bouton, ou clique : deux gestes
   délibérés, aucun réflexe.

   ── LA QUESTION À UNE LIGNE — 23 septembre 2026 ──────────────────────
   Seize `window.prompt` la rejoignent, les dernières fenêtres du navigateur
   de la Maison. Elles suivent les mêmes règles à UNE exception, assumée :
   c'est la LIGNE qui prend le foyer, et Entrée valide. Écrire un nom n'est
   pas détruire une fiche ; exiger de tabuler jusqu'au bouton après avoir
   tapé serait une punition sans raison. Échap annule toujours. */

import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  annonceDeLaDemande, libelleTropVague, libellesDeLaDemande, reponseValide,
  type DemandeDeLaMaison, type QuestionDeLaMaison,
} from '../shared/demande-pure';

export type { DemandeDeLaMaison, QuestionDeLaMaison };

/** Pose la question et rend la réponse. `true` = la personne a nommé l'acte
    et cliqué dessus. Toute autre issue, y compris Échap, rend `false`. */
export function demande(d: DemandeDeLaMaison): Promise<boolean> {
  return pose(d, undefined).then((r) => r !== null);
}

/** Pose une question à une ligne et rend ce qui a été écrit, détouré, ou
    `null` si la personne a renoncé. Une chaîne vide n'est rendue que si la
    question était `facultatif`. */
export function demandeUnTexte(q: QuestionDeLaMaison): Promise<string | null> {
  return pose(q, q);
}

function pose(d: DemandeDeLaMaison, champ?: QuestionDeLaMaison): Promise<string | null> {
  if (typeof document === 'undefined') return Promise.resolve(null);
  /* UN GARDE-FOU DE DÉVELOPPEMENT, PAS UNE SERRURE. Il rappelle la règle au
     moment où on écrit l'appel, et ne casse jamais un geste en production. */
  if (import.meta.env?.DEV && libelleTropVague(d.accepter)) {
    console.warn(
      `[mnd-demande] « ${d.accepter} » ne dit pas ce qui va se passer. `
      + 'Un bouton de la Maison nomme son acte : « Supprimer définitivement », « Marquer payé ».',
    );
  }

  return new Promise<string | null>((resolve) => {
    const hote = document.createElement('div');
    document.body.appendChild(hote);
    const racine = createRoot(hote);
    let tranche = false;
    const repond = (reponse: string | null) => {
      if (tranche) return;          // double clic, Échap pendant l'animation
      tranche = true;
      resolve(reponse);
      /* DÉMONTER AU TOUR SUIVANT : React interdit de démonter une racine
         pendant qu'elle rend, et le clic vient de son propre rendu. */
      window.setTimeout(() => { racine.unmount(); hote.remove(); }, 0);
    };
    racine.render(<Fenetre d={d} champ={champ} repond={repond} />);
  });
}

function Fenetre({ d, champ, repond }: {
  d: DemandeDeLaMaison;
  champ?: QuestionDeLaMaison;
  repond: (r: string | null) => void;
}) {
  const { accepter, refuser } = libellesDeLaDemande(d);
  const sur = useRef<HTMLButtonElement>(null);
  const ligne = useRef<HTMLInputElement>(null);
  const [ecrit, setEcrit] = useState(champ?.valeur ?? '');
  const peutAgir = !champ || reponseValide(ecrit, champ.facultatif);

  useEffect(() => {
    /* LE FOYER REVIENT D'OÙ IL VENAIT. Sans cela, après la fenêtre, le
       clavier repart du haut de la page : la personne qui travaille au
       clavier perd sa place à chaque question. */
    const avant = document.activeElement as HTMLElement | null;
    if (champ) {
      /* LA LIGNE PREND LE FOYER, ET SON CONTENU EST SÉLECTIONNÉ : un nom à
         corriger se remplace d'un mot, et un lien proposé à la recopie se
         copie d'un raccourci sans viser à la souris. */
      ligne.current?.focus();
      ligne.current?.select();
    } else {
      sur.current?.focus();
    }
    const auClavier = (e: KeyboardEvent) => { if (e.key === 'Escape') repond(null); };
    window.addEventListener('keydown', auClavier);
    return () => {
      window.removeEventListener('keydown', auClavier);
      avant?.focus?.();
    };
  }, [repond, champ]);

  const valide = () => {
    if (!peutAgir) return;
    repond(champ ? ecrit.trim() : '');
  };

  return (
    <div className="mnd-overlay">
      <div
        className={`mnd-dem${d.dur ? ' mnd-dem--dur' : ''}`}
        role="alertdialog"
        aria-modal="true"
        aria-label={annonceDeLaDemande(d)}
      >
        <div className="mnd-dem__haut" />
        <div className="mnd-dem__corps">
          <div className="mnd-dem__quoi">{d.quoi}</div>
          <div className="mnd-dem__titre">{d.titre}</div>
          {d.dit ? <p className="mnd-dem__dit">{d.dit}</p> : null}
          {d.suite ? <p className="mnd-dem__suite">{d.suite}</p> : null}
          {champ ? (
            <label className="mnd-dem__champ">
              <span>{champ.etiquette}</span>
              <input
                ref={ligne}
                type="text"
                value={ecrit}
                placeholder={champ.gabarit}
                onChange={(e) => setEcrit(e.target.value)}
                /* ENTRÉE VALIDE ICI, et seulement ici : écrire un nom n'est
                   pas détruire une fiche. */
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); valide(); } }}
              />
            </label>
          ) : null}
          {/* LE SCELLÉ NE PARAÎT QUE S'IL EST VRAI. Vingt-trois gestes sur
              quatre-vingt-neuf ne se défont pas. Un avertissement affiché
              partout cesse d'être lu, et ne protège plus le jour où il
              compte. */}
          {d.scelle ? <div className="mnd-dem__scelle">{d.scelle}</div> : null}
        </div>
        <div className="mnd-dem__pieds">
          <button ref={sur} type="button" className="mnd-dem__b mnd-dem__b--sur" onClick={() => repond(null)}>
            {refuser}
          </button>
          <button type="button" className="mnd-dem__b mnd-dem__b--fait" disabled={!peutAgir} onClick={valide}>
            {accepter}
          </button>
        </div>
      </div>
    </div>
  );
}
