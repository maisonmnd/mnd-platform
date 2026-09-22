import { useEffect, useState } from 'react';
import { COMMUN } from '../contenu';
import { etatDeLaMaison, semaineDite, type EtatDeLaMaison, type JourDit } from '../heures';
import { heuresDeLaMaison, lienWhatsApp, maison, type Maison } from '../maison';
import { mesure } from '../mesure';
import { numeroDit } from '../numero';

/* NOUS ÉCRIRE, NOUS TROUVER, QUAND VENIR — 21 septembre 2026.

   La page contact ne répondait à aucune des trois questions qu'on vient y
   poser : le numéro, l'adresse et le courriel étaient noyés dans le
   paragraphe du registre du commerce, rien n'était cliquable, et les heures
   d'ouverture n'y figuraient pas. Trois cartes, une par question.

   CE QUI VIT ET CE QUI NE VIT PAS. Le numéro, la fiche Google et les heures
   se lisent dans la base à chaque ouverture ; l'adresse et le courriel
   viennent de `COMMUN.editeur`, qui est aussi ce que lisent les mentions
   légales et Google. Rien n'est recopié à la main nulle part.

   LE REPLI EST DANS LA PAGE, PAS ICI : le générateur pose déjà l'adresse, le
   numéro et le courriel en HTML statique sous `data-ilot`. Si React ne monte
   pas, ou si la base ne répond pas, la visiteuse a de quoi joindre la Maison. */

const base = (chemin: string): string => import.meta.env.BASE_URL.replace(/\/$/, '') + chemin;

/** Le numéro tel que wa.me l'attend. Celui de la branche quand il est connu,
    sinon celui du registre : le bouton WhatsApp marche dans les deux cas. */
const numeroWa = (m: Maison | null): string =>
  m?.whatsapp || COMMUN.editeur.telephone.replace(/\D/g, '');

/* DEUX NUMÉROS VALENT MIEUX QU'UN MENSONGE — 21 septembre 2026. La Maison
   répond sur WhatsApp au numéro de sa branche, et le registre du commerce en
   porte un autre. Un seul affiché sous « Téléphone et WhatsApp » aurait
   promis que le bouton ouvre CE numéro là, ce qui est faux. Quand les deux
   coïncident, une seule ligne ; quand ils diffèrent, chacun est nommé. */
const numeros = (m: Maison | null): { numero: string; quoi: string }[] => {
  const registre = COMMUN.editeur.telephone;
  const branche = m?.telephone?.trim();
  if (!branche) return [{ numero: registre, quoi: 'Téléphone et WhatsApp' }];
  if (branche.replace(/\D/g, '') === registre.replace(/\D/g, '')) {
    return [{ numero: registre, quoi: 'Téléphone et WhatsApp' }];
  }
  return [
    { numero: numeroDit(branche), quoi: 'WhatsApp, celui du bouton' },
    { numero: registre, quoi: 'Téléphone' },
  ];
};

function Ecrire({ m }: { m: Maison | null }) {
  const wa = lienWhatsApp(numeroWa(m), COMMUN.messages.inconnu);
  return (
    <article className="jo-carte">
      <div className="jo-tete">
        <span className="jo-ic" aria-hidden="true">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-12.2 7.5L3 21l2-5.7A8.4 8.4 0 1 1 21 11.5z" /></svg>
        </span>
        <h3>Nous écrire</h3>
      </div>
      <p className="jo-msg">« {COMMUN.messages.inconnu} »</p>
      <p className="jo-note">Le message est déjà écrit. Vous n’avez qu’à l’envoyer.</p>
      {numeros(m).map((n) => (
        <div className="jo-lien" key={n.quoi}>
          <a href={`tel:${n.numero.replace(/\s/g, '')}`}>{n.numero}</a>
          <small>{n.quoi}</small>
        </div>
      ))}
      <div className="jo-lien">
        <a href={`mailto:${COMMUN.editeur.email}`}>{COMMUN.editeur.email}</a>
        <small>Pour les devis et les partenariats</small>
      </div>
      <a
        className="btn btn--plein jo-bt"
        href={wa}
        target="_blank"
        rel="noopener"
        onClick={() => mesure('whatsapp_clique', { parcours: 'inconnu' })}
      >
        Ouvrir WhatsApp
      </a>
    </article>
  );
}

function Trouver({ m }: { m: Maison | null }) {
  return (
    <article className="jo-carte">
      <div className="jo-tete">
        <span className="jo-ic" aria-hidden="true">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10.5c0 5.2-8 12-8 12s-8-6.8-8-12a8 8 0 1 1 16 0z" /><circle cx="12" cy="10.2" r="2.8" /></svg>
        </span>
        <h3>Nous trouver</h3>
      </div>
      {/* L'ADRESSE AVEC SON REPÈRE : ici on cherche la porte, pas le registre. */}
      <p className="jo-adresse">{COMMUN.editeur.adresseComplete}</p>
      {/* PAS DE NOM DE BRANCHE ICI — 21 septembre 2026. La ligne y a figuré
          une heure : la branche s'appelle « L'atelier MND » dans la base, et
          la page publique s'est mise à contredire l'enseigne au moment même
          où Meta examine le nom « Maison MND ». Le nom de la Maison se dit
          dans le titre du site, pas au fond d'une carte. */}
      {m?.fiche && (
        <div className="jo-lien">
          <a href={m.fiche} target="_blank" rel="noopener">Notre fiche Google</a>
          <small>Photos, avis, itinéraire</small>
        </div>
      )}
      {m?.fiche && (
        <a className="btn jo-bt" href={m.fiche} target="_blank" rel="noopener">Ouvrir l’itinéraire</a>
      )}
    </article>
  );
}

function Quand({ etat, jours }: { etat: EtatDeLaMaison | null; jours: JourDit[] }) {
  /* SANS HEURES DESCENDUES, LA CARTE NE PARAÎT PAS. Afficher « fermé » parce
     que la base n'a pas répondu fermerait la Maison aux yeux de qui passe. */
  if (!jours.length) return null;
  return (
    <article className="jo-carte">
      <div className="jo-tete">
        <span className="jo-ic" aria-hidden="true">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5.3l3.2 2" /></svg>
        </span>
        <h3>Quand venir</h3>
      </div>
      {etat && (
        <span className={`jo-badge${etat.ouvert ? '' : ' jo-badge--ferme'}`}>
          <i aria-hidden="true" />{etat.texte}
        </span>
      )}
      <dl className="jo-sem">
        {jours.map((j) => (
          <div key={j.clef} className={j.aujourdhui ? 'jo-auj' : undefined}>
            <dt>{j.jour}</dt>
            <dd>{j.texte}</dd>
          </div>
        ))}
      </dl>
      <a className="btn jo-bt" href={base('/reserver/')}>Voir les heures libres</a>
    </article>
  );
}

export default function Joindre() {
  const [m, setM] = useState<Maison | null>(null);
  const [jours, setJours] = useState<JourDit[]>([]);
  const [etat, setEtat] = useState<EtatDeLaMaison | null>(null);

  useEffect(() => { void maison().then(setM); }, []);
  useEffect(() => {
    void heuresDeLaMaison().then(({ semaine, exceptions }) => {
      const maintenant = new Date();
      setJours(semaineDite(semaine, exceptions, maintenant));
      setEtat(etatDeLaMaison(semaine, exceptions, maintenant));
    });
  }, []);

  return (
    <div className="jo-cartes">
      <Ecrire m={m} />
      <Trouver m={m} />
      <Quand etat={etat} jours={jours} />
    </div>
  );
}
