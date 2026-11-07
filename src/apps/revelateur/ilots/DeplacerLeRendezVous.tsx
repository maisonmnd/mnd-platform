import { useEffect, useRef, useState } from 'react';
import { client } from '../maison';
import { jourDit } from '../agenda';
import {
  LETTRES_DE_LA_SEMAINE, dateDite, etatDuJour, flechesDuMois, grilleDuMois, libelleDuJour, moisAMontrer, moisApres, moisDeLHorizon, sensDuGlisse, titreDuMois,
} from '../calendrier-du-site-pur';
import { dureeDite, heureDite, jetonDeLAdresse, type RendezVousLu } from '../reservation-du-site-pure';
import {
  FONCTION_DES_PLACES, MOTS_DU_DEPLACEMENT, deplacementLu, placesLues, refusDuDeplacementDit, type PlacesDuDeplacement,
} from '../deplacer-du-site-pur';

/* DÉPLACER SON RENDEZ-VOUS AVEC LE CALENDRIER — 7 novembre 2026. « Déplacer
   son RDV depuis le site, ouvrir le calendrier et changer de date » (Yéman),
   maquette validée par « construis » : « Déplacer » ouvre ICI, dans la page,
   le calendrier en mois de la réservation (mêmes classes `.mois-du-site*`,
   même règle pure `calendrier-du-site-pur`, mêmes flèches, même glissé), puis
   les heures libres de SON maître pour SA durée, puis « Déplacer à ce
   moment ». Le serveur (demande-submit) donne les places et déplace aussitôt,
   sous verrou ; la page ne décide de rien : elle montre ce qu'il rend, et
   dit calmement quand une place vient d'être prise. Aucune remise ici : le
   rendez-vous garde son prix. */

type Etat = { etat: 'charge' } | { etat: 'pret'; places: PlacesDuDeplacement } | { etat: 'dit'; texte: string };

/** L'appel à `demande-submit`, avec le statut d'un refus (comme `demandeALaFin`). */
async function appelle(corps: Record<string, unknown>): Promise<{ data: unknown; statut?: number }> {
  const supabase = await client();
  if (!supabase) return { data: null };
  const { data, error } = await supabase.functions.invoke(FONCTION_DES_PLACES, { body: corps });
  return error ? { data: null, statut: (error as { context?: { status?: number } } | null)?.context?.status } : { data };
}

export default function DeplacerLeRendezVous({ rdv, surDeplace, surGarder, wa }: {
  rdv: RendezVousLu;
  /** Le rendez-vous est à sa nouvelle place : l'écran « Rendez-vous déplacé ». */
  surDeplace: (rdv: RendezVousLu, confirmation: 'envoyee' | 'plus-tard' | 'sans' | 'deja') => void;
  surGarder: () => void;
  /** Le WhatsApp de la Maison, pour les cas où la page ne peut pas déplacer. */
  wa: string;
}) {
  const M = MOTS_DU_DEPLACEMENT;
  /* Le jeton signé, relu dans l'adresse comme la page le fait : jamais montré. */
  const [jeton] = useState(() => jetonDeLAdresse(typeof location === 'undefined' ? '' : location.search));
  const [lu, setLu] = useState<Etat>({ etat: 'charge' });
  const [essai, setEssai] = useState(0);
  const [jour, setJour] = useState<string | null>(null);
  const [heure, setHeure] = useState<string | null>(null);
  const [moisVu, setMoisVu] = useState<string | null>(null);
  const [sens, setSens] = useState<-1 | 0 | 1>(0);
  const [enCours, setEnCours] = useState(false);
  const [dit, setDit] = useState('');
  const glisse = useRef<{ x: number; y: number } | null>(null);

  /* Les places, à l'ouverture et à chaque « Réessayer » ou place prise. */
  useEffect(() => {
    let vivant = true;
    setLu({ etat: 'charge' });
    void (async () => {
      try {
        const { data, statut } = await appelle({ rdv: 'places', v: jeton });
        if (!vivant) return;
        const r = placesLues(data, statut);
        if (r.etat === 'pret') setLu({ etat: 'pret', places: r.places });
        else setLu({ etat: 'dit', texte: r.etat === 'ferme' ? (r.raison === 'trop_tard' ? M.trop_tard : refusDuDeplacementDit(r.raison)) : r.etat === 'trop' ? M.trop : r.etat === 'lien' ? refusDuDeplacementDit('lien') : M.panne });
      } catch {
        if (vivant) setLu({ etat: 'dit', texte: M.panne });
      }
    })();
    return () => { vivant = false; };
  }, [jeton, essai, M.trop_tard, M.trop, M.panne]);

  const envoie = async () => {
    if (enCours || !jour || !heure) return;
    setEnCours(true);
    setDit('');
    try {
      const { data, statut } = await appelle({ rdv: 'deplacer', v: jeton, date: jour, time: heure });
      const r = deplacementLu(data, statut);
      if (r.etat === 'deplace') { surDeplace(r.rdv, r.confirmation); return; }
      if (r.etat === 'trop') { setDit(M.trop); setEnCours(false); return; }
      setDit(refusDuDeplacementDit(r.raison));
      /* Une place prise : on relit les places, et on garde le jour choisi pour qu'elle en prenne une autre. */
      if (r.raison === 'place_prise') { setHeure(null); setEssai((n) => n + 1); }
    } catch {
      setDit(refusDuDeplacementDit('panne'));
    }
    setEnCours(false);
  };

  if (lu.etat === 'charge') {
    return (
      <div className="rdv-page__deplacer" aria-busy="true">
        <p className="sur">{M.sur}</p>
        <p className="legende" role="status">{M.charge}</p>
      </div>
    );
  }
  if (lu.etat === 'dit') {
    return (
      <div className="rdv-page__deplacer">
        <p className="sur">{M.sur}</p>
        <p className="legende" role="alert">{lu.texte}</p>
        <p className="rangee">
          <button type="button" className="btn" onClick={() => setEssai((n) => n + 1)}>{M.reessayer}</button>
          <a className="btn btn--lien" href={wa} target="_blank" rel="noopener">Écrire à la Maison sur WhatsApp</a>
          <button type="button" className="btn btn--lien" onClick={surGarder}>{M.garder}</button>
        </p>
      </div>
    );
  }

  const { places } = lu;
  const mois = moisDeLHorizon(places.du, places.au);
  const premierMois = mois[0] ?? places.du.slice(0, 7);
  const dernierMois = mois[mois.length - 1] ?? premierMois;
  const premierJour = Object.keys(places.jours).sort()[0] ?? null;
  const moisMontre = moisAMontrer({ vu: moisVu, jour, premierePlace: premierJour, premier: premierMois, dernier: dernierMois });
  const fleches = flechesDuMois(moisMontre, premierMois, dernierMois);
  const fermes = new Set(places.fermes);
  const tourne = (k: -1 | 1) => {
    const cible = moisApres(moisMontre, k);
    if (!cible || cible < premierMois || cible > dernierMois) return;
    setSens(k);
    setMoisVu(cible);
  };
  const heuresDuJour = jour ? places.jours[jour] ?? [] : [];
  const duree = dureeDite(places.dureeMin || rdv.dureeMin);

  return (
    <div className="rdv-page__deplacer">
      <p className="sur">{M.sur}</p>
      <h3>{M.titre}</h3>
      <p className="legende">{`Mêmes soins, même durée (${duree}). ${M.jusqua}`}</p>
      {premierJour === null && <p className="legende" role="status">{M.aucune}</p>}
      <div
        className="mois-du-site"
        onTouchStart={(e) => { const t = e.touches[0]; glisse.current = t ? { x: t.clientX, y: t.clientY } : null; }}
        onTouchEnd={(e) => {
          const d = glisse.current;
          glisse.current = null;
          const t = e.changedTouches[0];
          if (!d || !t) return;
          const k = sensDuGlisse(t.clientX - d.x, t.clientY - d.y);
          if (k) tourne(k);
        }}
        onKeyDown={(e) => {
          if (e.key === 'PageDown') { e.preventDefault(); tourne(1); }
          else if (e.key === 'PageUp') { e.preventDefault(); tourne(-1); }
        }}
      >
        <div className="mois-du-site__tete">
          <button type="button" className="mois-du-site__fleche" aria-label="Mois précédent" disabled={!fleches.precedent} onClick={() => tourne(-1)}>‹</button>
          <p className="mois-du-site__titre" aria-live="polite">{titreDuMois(moisMontre)}</p>
          <button type="button" className="mois-du-site__fleche" aria-label="Mois suivant" disabled={!fleches.suivant} onClick={() => tourne(1)}>›</button>
        </div>
        <div className="mois-du-site__semaine" aria-hidden="true">
          {LETTRES_DE_LA_SEMAINE.map((l, i) => <span key={i}>{l}</span>)}
        </div>
        <div key={moisMontre} className={`mois-du-site__grille${sens > 0 ? ' vient-de-droite' : sens < 0 ? ' vient-de-gauche' : ''}`} role="group" aria-label={`Les jours de ${titreDuMois(moisMontre)}`}>
          {grilleDuMois(moisMontre).cases.map((iso, i) => {
            if (!iso) return <span key={`vide-${i}`} className="mois-du-site__vide" aria-hidden="true" />;
            const leJour = etatDuJour({ iso, du: places.du, au: places.au, ferme: fermes.has(iso), heures: places.jours[iso]?.length ?? 0 });
            const libre = leJour.etat === 'libre';
            const sienne = iso === places.actuel.date;
            return (
              <button
                type="button"
                key={iso}
                className={`mois-du-site__jour est-${leJour.etat}${leJour.peu ? ' est-peu' : ''}${jour === iso ? ' est-choisi' : ''}${sienne ? ' est-actuel' : ''}`}
                disabled={!libre}
                aria-pressed={libre ? jour === iso : undefined}
                aria-label={`${libelleDuJour({ iso, du: places.du, jour: leJour })}${sienne ? ', la date de votre rendez-vous' : ''}`}
                onClick={() => { setJour(iso); setHeure(null); setDit(''); }}
              >
                <b>{Number(iso.slice(8))}</b>
              </button>
            );
          })}
        </div>
        <p className="mois-du-site__legende">
          <span><i className="mois-du-site__l-libre" aria-hidden="true" />libre</span>
          <span><i className="mois-du-site__l-peu" aria-hidden="true" />peu de places</span>
          <span><i className="mois-du-site__l-plein" aria-hidden="true" />complet ou fermé</span>
          <span><i className="mois-du-site__l-actuel" aria-hidden="true" />votre date</span>
        </p>
        <p className="mois-du-site__horizon">Déplacement possible jusqu’au {dateDite(places.au)}.</p>
      </div>
      {jour && (
        <div className="rdv-page__heures" id="heures-du-deplacement">
          <p className="legende">{jourDit(jour)} : {M.heures}</p>
          <div className="heures">
            {heuresDuJour.map((h) => (
              <button type="button" key={h} className={`heure${heure === h ? ' est-choisie' : ''}`} aria-pressed={heure === h} onClick={() => { setHeure(h); setDit(''); }}>
                {heureDite(h)}
              </button>
            ))}
          </div>
        </div>
      )}
      {dit && <p className="legende" role="alert">{dit}</p>}
      <p className="rangee">
        <button type="button" className="btn btn--plein" disabled={!jour || !heure || enCours} onClick={() => { void envoie(); }}>{enCours ? M.encours : M.bouton}</button>
        <button type="button" className="btn btn--lien" disabled={enCours} onClick={surGarder}>{M.garder}</button>
      </p>
    </div>
  );
}
