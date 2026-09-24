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

/* LE PARCOURS D'UNE OFFRE CHOISIT SON BOUTON ET SA PORTE — 22 septembre 2026.
   Comme les cinq portes de l'accueil : un entretien se réserve en ligne, tout
   le reste passe par le rappel, parce qu'une création ou une réparation
   commence par une consultation, qui se prend de vive voix. */
const PARCOURS: Record<string, { sur: string; bouton: string; porte: 'reserver' | 'rappel' }> = {
  creation: { sur: 'Première Couronne', bouton: 'Réserver ma consultation', porte: 'rappel' },
  reparation: { sur: 'Réparation', bouton: 'Faire diagnostiquer ma couronne', porte: 'rappel' },
  entretien: { sur: 'Entretien', bouton: 'Réserver mon entretien', porte: 'reserver' },
  enfant: { sur: 'MND Kids', bouton: 'Organiser notre visite', porte: 'rappel' },
  formation: { sur: 'Formations', bouton: 'Voir le programme', porte: 'rappel' },
};

/* LA PORTE SE DIT DEPUIS LA RACINE DU SITE, JAMAIS EN RELATIF — 24 septembre
   2026, « quand on appuie le bouton J'en profite ce n'est branché à rien »
   (Yéman).

   Ce n'était pas un bouton sans destination, c'était une destination fausse,
   et seulement sur l'accueil. L'îlot écrivait `../reserver/`. Depuis
   /revelateur/les-offres/, ce chemin tombe juste ; depuis /revelateur/, il
   remonte d'un cran de trop et sort du site, sur une page qui répond 404.
   UN ÎLOT NE CONNAÎT PAS LA PROFONDEUR DE LA PAGE QUI LE MONTE : le même
   composant sert l'accueil et la page des offres, donc aucun `../` ne peut
   être juste pour les deux. D'où `base()`, comme Contact, Demande et Joindre,
   qui lit la base posée à la construction.

   Et comme l'îlot se monte par script, son lien n'existe dans aucun HTML
   généré : le harnais, qui lit les pages servies, ne pouvait pas l'attraper.
   Il lit désormais la SOURCE des îlots pour cette règle-là. */
const base = (chemin: string): string => import.meta.env.BASE_URL.replace(/\/$/, '') + chemin;

/* SANS PARCOURS, LE CALENDRIER : il pose lui-même la porte quand le besoin
   est inconnu (Reserver.tsx), donc aucune impasse. */
const laPorte = (o: OffreDuSite): string => {
  const p = o.parcours ? PARCOURS[o.parcours] : undefined;
  /* LE BOUTON EMPORTE LE CODE — 24 septembre 2026. « Du coup le code se
     remplit automatiquement lors de la réservation » (Yéman) : c'est cette
     adresse qui le porte. Une cliente qui arrive autrement le tape, il est
     écrit en toutes lettres sur la carte juste au-dessus. */
  const code = o.code ? `&code=${encodeURIComponent(o.code)}` : '';
  if (!p) return base(`/reserver/?besoin=inconnu${code}`);
  return base(`/${p.porte}/?besoin=${o.parcours}${code}`);
};

/* LES OFFRES SONT DANS LA PAGE AVANT LE SCRIPT — 24 septembre 2026. L'état
   des lieux l'a mesuré : la page des offres servait 175 mots, le titre et sa
   phrase, et un partage WhatsApp ne voyait qu'une page vide. La construction
   lit maintenant les offres et écrit ce même composant dans le HTML
   (`statique.tsx`), avec les données en JSON à côté. Au montage, l'îlot
   repart de ces `initiales` (rien ne clignote), puis relit la base : une
   offre activée au Trône après la construction apparaît quand même, et une
   offre retirée disparaît. Sans réponse de la base, les initiales restent. */
export default function Offres({ genre, initiales }: { genre?: string; initiales?: OffreDuSite[] }) {
  const accueil = genre === 'accueil';
  const [offres, setOffres] = useState<OffreDuSite[] | null | undefined>(initiales);
  const [onglet, setOnglet] = useState<'cours' | 'venir'>(() => {
    if (accueil || !initiales) return 'cours';
    const cours = initiales.some((o) => etatDeLOffre(o) === 'cours');
    const venir = initiales.some((o) => etatDeLOffre(o) === 'venir');
    return !cours && venir ? 'venir' : 'cours';
  });

  useEffect(() => {
    let vivant = true;
    void offresDuSite()
      .then((o) => { if (vivant) setOffres(o); })
      .catch(() => { if (vivant) setOffres((avant) => avant ?? null); });
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
    if (!accueil && offres && enCours.length === 0 && aVenir.length > 0) setOnglet('venir');
  }, [accueil, offres, enCours.length, aVenir.length]);

  if (offres === undefined) {
    return <div className="offres-site"><p className="corps">Les offres se chargent.</p></div>;
  }

  /* SUR L'ACCUEIL, LES OFFRES EN COURS SEULEMENT, sans onglets : la datée du
     moment d'abord (elle porte la pastille), puis les permanentes. */
  const vues = accueil
    ? [...enCours].sort((a, b) => Number(!!b.du || !!b.au) - Number(!!a.du || !!a.au))
    : (onglet === 'cours' ? enCours : aVenir);

  const vide = offres === null
    ? 'Les offres de la Maison se disent au salon. Écrivez-nous, nous vous les présentons.'
    : accueil
      ? 'La Maison prépare ses prochaines offres. Les cinq portes ci-dessus vous ouvrent la Maison.'
      : onglet === 'cours'
        ? 'La Maison prépare la suite : regardez le second onglet.'
        : 'Les saisons se suivent : revenez bientôt.';

  return (
    <div className="offres-site">
      {!accueil && (
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
      )}

      <div className="offres-volet">
        {vues.length === 0 ? (
          <p className="corps offres-vide">{vide}</p>
        ) : (
          vues.map((o) => {
            const par = o.parcours ? PARCOURS[o.parcours] : undefined;
            const datee = !!(o.du || o.au);
            /* LES CONDITIONS VIENNENT DE LA MAISON ; la période et « dans la
               Maison, non cumulable » restent, elles sont vraies de toutes.

               UNE SEULE FOIS PAR PERSONNE — 24 septembre 2026, règle posée par
               Yéman. Elle s'annonce ICI, sur la carte, AVANT que la promesse
               soit faite : le serveur seul peut la tenir, puisqu'il faut
               connaître le numéro pour savoir si le code a déjà servi, et une
               règle qu'on n'apprend qu'au refus se vit comme un revirement. */
            const conditions = [laPeriode(o), o.conditions?.trim() || 'Dans la Maison, au règlement. Une seule fois par personne, et une offre à la fois.']
              .filter(Boolean).join('. ').replace(/\.\./g, '.');
            return (
              <article className={`offre-site${datee && accueil ? ' est-moment' : ''}`} key={o.id}>
                {datee && accueil ? <span className="offre-site__moment">Offre du moment</span> : null}
                <div className="offre-site__sceau">
                  <span>{par ? `${par.sur} · ${o.tag}` : o.tag}</span>
                  <b>{o.deal}</b>
                </div>
                <div className="offre-site__dire">
                  <h3>{o.title}</h3>
                  {o.sub ? <p>{o.sub}</p> : null}
                  {/* LE CODE SE LIT SUR LA CARTE, et pas seulement dans le
                      lien : il se recopie sur une affiche, se dit au
                      téléphone, et se retape si la cliente revient plus tard
                      par un autre chemin. */}
                  {o.code ? (
                    <p className="offre-site__code"><span>avec le code</span><b>{o.code}</b></p>
                  ) : null}
                  <a className="btn btn--plein" href={laPorte(o)}>{o.bouton?.trim() || par?.bouton || 'J’en profite'}</a>
                  <details className="offre-site__cond">
                    <summary>Voir les conditions</summary>
                    <p>{conditions}</p>
                  </details>
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
