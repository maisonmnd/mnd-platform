import { useEffect, useMemo, useState } from 'react';
import { offresDuSite, type OffreDuSite } from '../maison';
import { etatDeLOffre } from '../../../shared/offres-pur';

/* LES OFFRES DE LA MAISON, EN COURS ET À VENIR — 18 septembre 2026.

   « J'aimerais avoir un onglet sur les offres instantanées, à venir ou les
   offres en cours » (Yéman). Deux onglets, comme le modèle qu'il a montré.

   RIEN N'EST ÉCRIT ICI, et rien n'est inventé : les offres viennent de
   `mnd_offers`, composées au Trône. Seules celles que la Maison a ACTIVÉES
   et DATÉES sortent jusqu'ici (voir `offresDuSite`). Une saison qui dort
   reste dans la Maison.

   LA PAGE NE SE VIDE JAMAIS : sans offre, sans base, ou si le réseau tombe,
   elle dit ce qui est plutôt que de montrer un écran blanc. */

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
  'août', 'septembre', 'octobre', 'novembre', 'décembre'];

const ditLaDate = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`;
};

const laPeriode = (o: OffreDuSite): string => {
  if (o.du && o.au) return `Du ${ditLaDate(o.du)} au ${ditLaDate(o.au)} inclus`;
  if (o.du) return `À partir du ${ditLaDate(o.du)}`;
  if (o.au) return `Jusqu’au ${ditLaDate(o.au)} inclus`;
  return '';
};

export default function Offres() {
  const [offres, setOffres] = useState<OffreDuSite[] | null | undefined>(undefined);
  const [onglet, setOnglet] = useState<'cours' | 'venir'>('cours');

  useEffect(() => {
    let vivant = true;
    void offresDuSite()
      .then((o) => { if (vivant) setOffres(o); })
      .catch(() => { if (vivant) setOffres(null); });
    return () => { vivant = false; };
  }, []);

  const { enCours, aVenir } = useMemo(() => {
    const tout = offres ?? [];
    return {
      enCours: tout.filter((o) => etatDeLOffre(o) === 'cours'),
      aVenir: tout.filter((o) => etatDeLOffre(o) === 'venir'),
    };
  }, [offres]);

  /* L'onglet s'ouvre sur ce qui a quelque chose à dire : inutile de poser la
     visiteuse devant un volet vide quand l'autre est plein. */
  useEffect(() => {
    if (offres && enCours.length === 0 && aVenir.length > 0) setOnglet('venir');
  }, [offres, enCours.length, aVenir.length]);

  if (offres === undefined) {
    return <div className="offres-site"><p className="corps">Les offres se chargent.</p></div>;
  }

  const vues = onglet === 'cours' ? enCours : aVenir;

  return (
    <div className="offres-site">
      <div className="offres-onglets" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={onglet === 'cours'}
          className={`offres-onglet${onglet === 'cours' ? ' est-choisi' : ''}`}
          onClick={() => setOnglet('cours')}
        >
          Votre offre en cours
          {enCours.length > 1 ? <small>{enCours.length}</small> : null}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={onglet === 'venir'}
          className={`offres-onglet${onglet === 'venir' ? ' est-choisi' : ''}`}
          onClick={() => setOnglet('venir')}
        >
          Vos offres à venir
          {aVenir.length > 1 ? <small>{aVenir.length}</small> : null}
        </button>
      </div>

      <div className="offres-volet">
        {vues.length === 0 ? (
          <p className="corps offres-vide">
            {offres === null
              ? 'Les offres de la Maison se disent au salon. Écrivez-nous, nous vous les présentons.'
              : onglet === 'cours'
                ? 'Aucune offre en cours en ce moment. Regardez le second onglet, la Maison prépare la suite.'
                : 'Aucune offre annoncée pour l’instant. Revenez bientôt, les saisons se suivent.'}
          </p>
        ) : (
          vues.map((o) => (
            <article className="offre-site" key={o.id}>
              <div className="offre-site__sceau">
                <b>{o.deal}</b>
                <span>{o.tag}</span>
              </div>
              <div className="offre-site__dire">
                <h3>{o.title}</h3>
                {o.sub ? <p>{o.sub}</p> : null}
                {laPeriode(o) ? <p className="offres-conditions">{laPeriode(o)}, dans la Maison, non cumulable avec toute promotion en cours.</p> : null}
                <a className="btn btn--plein" href="../reserver/">J’en profite</a>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
