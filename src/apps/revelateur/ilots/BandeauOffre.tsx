import { useEffect, useState } from 'react';
import { offresDuSite, type OffreDuSite } from '../maison';
import { etatDeLOffre } from '../../../shared/offres-pur';

/* LE BANDEAU DE L'OFFRE EN COURS — 18 septembre 2026.

   « Un bandeau sur la page d'accueil qui annonce l'offre en cours et
   disparaît quand il n'y en a pas » (Yéman).

   IL NE REND RIEN, ET C'EST VOULU. Partout ailleurs sur ce site, un îlot qui
   ne peut pas se charger affiche une phrase plutôt qu'un vide : une page de
   réservation muette est un cul-de-sac. Ici c'est l'inverse. Le bandeau est
   une annonce, pas le propos de la page : une annonce absente est un
   résultat JUSTE, et un « chargement en cours » qui s'afficherait puis
   s'effacerait à chaque visite sans offre serait un clignotement pour rien.

   Le point de montage est donc VIDE dans la page servie, et le reste tant
   qu'il n'y a rien à dire : aucune offre, pas de base, réseau tombé, toutes
   ces situations se ressemblent du trottoir, et toutes méritent le silence.

   PAS DE HAUTEUR RESERVEE non plus. En réserver éviterait le décalage au
   chargement, mais laisserait un trou les jours sans offre, ce qui est
   exactement ce que la Maison ne veut pas. */

export default function BandeauOffre() {
  const [offre, setOffre] = useState<OffreDuSite | null>(null);

  useEffect(() => {
    let vivant = true;
    void offresDuSite()
      .then((tout) => {
        if (!vivant) return;
        /* La première qui court aujourd'hui. Le bandeau annonce, il ne
           dresse pas la liste : la page des offres s'en charge. */
        setOffre(tout.find((o) => etatDeLOffre(o) === 'cours') ?? null);
      })
      .catch(() => { /* silence : pas de bandeau vaut mieux qu'un bandeau faux */ });
    return () => { vivant = false; };
  }, []);

  if (!offre) return null;

  return (
    <aside className="bandeau-offre">
      <div className="conteneur bandeau-offre__dedans">
        <p className="bandeau-offre__dire">
          <span className="bandeau-offre__tag">{offre.tag}</span>
          <b>{offre.deal}</b>
          <span className="bandeau-offre__titre">{offre.title}</span>
        </p>
        <a className="btn btn--plein bandeau-offre__lien" href="les-offres/">
          Voir l’offre
        </a>
      </div>
    </aside>
  );
}
