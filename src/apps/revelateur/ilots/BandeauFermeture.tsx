import { useEffect, useState } from 'react';
import { heuresDeLaMaison } from '../maison';
import { fermetureAnnoncee, phraseDeLaFermeture } from '../../../shared/fermeture-pur';

/* LE BANDEAU DE LA FERMETURE — 6 novembre 2026.

   « Il faut notifier sur le site internet [...] que le salon est fermé »
   (Yéman). Le calendrier de réservation se ferme seul ces jours-là (les
   journées exceptionnelles de toute la Maison) ; le bandeau le DIT, sur
   l'accueil et en tête de la réservation, avant qu'on le découvre en cherchant
   une place. La règle vit dans `shared/fermeture-pur.ts`, la même que Ma
   Couronne.

   COMME LE BANDEAU DE L'OFFRE, IL SE TAIT quand il n'a rien à dire : pas de
   fermeture proche, pas de base, réseau tombé. Le point de montage reste vide
   et sans hauteur réservée. */

/** Aujourd'hui à Cotonou, AAAA-MM-JJ, quel que soit le fuseau du téléphone. */
const aujourdhuiAlaMaison = (): string => {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Porto-Novo' }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
};

export default function BandeauFermeture() {
  const [dit, setDit] = useState<{ tag?: string; ferme: string; reprise: string | null } | null>(null);

  useEffect(() => {
    let vivant = true;
    void heuresDeLaMaison()
      .then(({ semaine, exceptions }) => {
        if (!vivant) return;
        const aujourdhui = aujourdhuiAlaMaison();
        const f = fermetureAnnoncee({ aujourdhui, semaine, exceptions });
        setDit(f ? { ...phraseDeLaFermeture(f, aujourdhui), tag: f.note } : null);
      })
      .catch(() => { /* silence : pas de bandeau vaut mieux qu'un bandeau faux */ });
    return () => { vivant = false; };
  }, []);

  if (!dit) return null;

  return (
    <aside className="bandeau-fermeture" role="note">
      <div className="conteneur bandeau-fermeture__dedans">
        {dit.tag && <span className="bandeau-fermeture__tag">{dit.tag}</span>}
        <p className="bandeau-fermeture__dire">
          <b>{dit.ferme}</b>
          {dit.reprise && <span>{dit.reprise}</span>}
        </p>
      </div>
    </aside>
  );
}
