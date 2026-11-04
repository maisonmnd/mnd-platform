import { useEffect, useMemo, useState } from 'react';
import { Card, Input, toast } from '../../../../ds/components';
import { Toggle } from '../equipe/ui';
import { useBranch } from '../../../../shared/branches';
import { useOffers } from '../../../../shared/offers';
import { useAppointments } from '../../../../shared/agenda';
import { jourCourtAn } from '../../../../shared/calendrier';
import { useEstDirection } from '../_vie';
import { isoDuJour, jourDeLaSemaine, occupationDuJour, placesRestantes } from '../../../../shared/offres-pur';
import {
  BORNES_DES_PLACES, CODE_DES_PLACES, ID_DES_PLACES, JOURS_REGLABLES, borne, offresApresLeReglage, reglageDesPlaces,
  type ReglageDesPlaces,
} from '../clients/places-au-trone-pur';

/* ══ LES PLACES LIMITÉES, LEUR RÉGLAGE · 4 novembre 2026 ═══════════════════
   « J'aimerais avoir les jours des 15 % réglables sur le Trône avec le nombre
   de places » (Yéman ; maquette « Places limitées » AhFRNqiggFoaiR725iKSQe,
   « construis »). L'allumage, les jours (mardi à samedi), les places par jour
   (1 à 10), les jours à l'avance (1 à 60) et le pourcentage (5 à 50) s'écrivent
   sur l'offre `of-places-limitees` du magasin des offres, jamais en dur. Si
   l'offre n'existe pas encore, le premier enregistrement la crée avec les
   défauts et les gestes de l'ancienne offre du mercredi (offresApresLeReglage).

   Réservé à la direction, comme les autres réglages sensibles : le reste du
   personnel le lit, ses commandes sont grisées. */

const NOMS: Record<string, string> = { Mar: 'Mardi', Mer: 'Mercredi', Jeu: 'Jeudi', Ven: 'Vendredi', Sam: 'Samedi' };

/** Un nombre qui se tape en entier, puis se borne : le valider à chaque
    frappe ferait de « 14 » un « 1 » ramené au minimum avant le « 4 ». */
function ChampNombre({ valeur, min, max, suffixe, libelle, actif, onValide }: {
  valeur: number; min: number; max: number; suffixe: string; libelle: string; actif: boolean; onValide: (n: number) => void;
}) {
  const [saisie, setSaisie] = useState(String(valeur));
  useEffect(() => { setSaisie(String(valeur)); }, [valeur]);
  const valide = () => {
    const n = borne(saisie.replace(/[^0-9]/g, ''), { min, max }, valeur);
    setSaisie(String(n));
    if (n !== valeur) onValide(n);
  };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <Input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={saisie}
        disabled={!actif}
        aria-label={libelle}
        onChange={(e) => setSaisie(e.target.value)}
        onBlur={valide}
        onKeyDown={(e) => { if (e.key === 'Enter') valide(); }}
        style={{ width: 84, textAlign: 'center', ...(actif ? {} : { cursor: 'not-allowed' }) }}
      />
      <span className="mnd-muted" style={{ fontSize: 12 }}>{suffixe}</span>
    </span>
  );
}

export function CartePlacesLimitees() {
  const estDirection = useEstDirection();
  const { branch } = useBranch();
  const [offres, setOffres] = useOffers();
  const [rdvs] = useAppointments();
  const r = reglageDesPlaces(offres);

  const ecris = (changes: Partial<ReglageDesPlaces>, dit: string) => {
    if (!estDirection) { toast('Ce réglage appartient à la direction.'); return; }
    setOffres((prev) => offresApresLeReglage(prev, changes, { branchId: branch?.id ?? '' }));
    toast(dit);
  };
  const basculeJour = (j: string) => {
    const jours = r.jours.includes(j) ? r.jours.filter((x) => x !== j) : [...r.jours, j];
    ecris({ jours }, r.jours.includes(j) ? `${NOMS[j]} décoché : plus de places ce jour-là.` : `${NOMS[j]} coché : ses places s’ouvrent les jours vides.`);
  };

  /* LES JOURS QUI S'OUVRENT, d'après le carnet : ce que le site, Ma Couronne
     et le comptoir montrent en ce moment. */
  const aujourdhui = isoDuJour(new Date());
  const apercu = useMemo(() => {
    const o = offresApresLeReglage(offres, {}, { branchId: branch?.id ?? '' }).find((x) => x.id === ID_DES_PLACES);
    if (!o || !o.active) return [];
    const jours: { iso: string; reste: number }[] = [];
    for (let k = 0; k <= r.horizon; k += 1) {
      const d = new Date(`${aujourdhui}T12:00:00`);
      d.setDate(d.getDate() + k);
      const iso = isoDuJour(d);
      if (!r.jours.includes(jourDeLaSemaine(iso) ?? '')) continue;
      const reste = placesRestantes(o, iso, occupationDuJour(o, rdvs, iso, { branchId: o.branchId || branch?.id }), aujourdhui);
      if (reste !== null) jours.push({ iso, reste });
    }
    return jours;
  }, [offres, rdvs, r.horizon, r.jours, aujourdhui, branch?.id]);
  const ouverts = apercu.filter((j) => j.reste > 0);

  return (
    <Card className="sys-section" style={{ marginTop: 18 }} data-places="reglages">
      <div className="sys-section__title">Places limitées</div>
      <div className="sys-section__cap" style={{ maxWidth: 680 }}>
        Un jour encore vide ouvre {r.places} place{r.places > 1 ? 's' : ''} à −{r.pct} % sur les shampoings, les lavages
        et les soins ({r.gestes} geste{r.gestes > 1 ? 's' : ''}). Le site les décompte : « Remise : il reste 3 places »,
        « il reste 2 places », « il reste une place », puis plus rien ce jour-là. Une réservation au plein tarif ferme
        les places restantes ; une place prise est gardée. La remise se pose d’elle-même avec la place, sans code à
        taper (code interne {CODE_DES_PLACES}). Une seule remise : jamais pour une cliente aux prix convenus, abonnée
        ou qui a déjà une remise ; le Rituel Sówà™ n’en prend aucune.
      </div>
      <div className="mnd-muted" style={{ fontSize: 12, lineHeight: 1.55, maxWidth: 680, marginTop: 4 }}>
        Le site, Ma Couronne, la fenêtre du rendez-vous et la Caisse lisent ce réglage : un changement vaut partout.
        {!r.existe && ' L’offre n’est pas encore posée : le premier réglage la crée, éteinte tant que vous ne l’allumez pas.'}
        {!estDirection && ' Ce réglage appartient à la direction.'}
      </div>

      <div className="sys-row">
        <div>
          <div className="sys-row__label">La remise des places limitées</div>
          <div className="sys-row__sub">
            {r.active ? 'Allumée : les jours vides ouvrent leurs places.' : 'Éteinte : aucune place ne s’ouvre, nulle part.'}
          </div>
        </div>
        <Toggle
          on={r.active}
          onToggle={() => ecris({ active: !r.active }, r.active ? 'Places limitées éteintes : plus aucune remise de ce genre.' : 'Places limitées allumées : les jours vides ouvrent leurs places.')}
        />
      </div>

      <div className="sys-row" style={{ alignItems: 'flex-start' }}>
        <div>
          <div className="sys-row__label">Les jours</div>
          <div className="sys-row__sub">
            {r.jours.length === 0 ? 'Aucun jour coché : la remise ne se pose nulle part.' : 'Seulement un jour où personne d’autre n’a réservé.'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }} role="group" aria-label="Les jours des places limitées">
          {JOURS_REGLABLES.map((j) => (
            <button
              key={j}
              type="button"
              className={`sys-acces__chip${r.jours.includes(j) ? ' is-on' : ''}`}
              aria-pressed={r.jours.includes(j)}
              disabled={!estDirection}
              style={!estDirection ? { cursor: 'not-allowed' } : undefined}
              onClick={() => basculeJour(j)}
            >
              {NOMS[j]}
            </button>
          ))}
        </div>
      </div>

      <div className="sys-row">
        <div>
          <div className="sys-row__label">Places par jour</div>
          <div className="sys-row__sub">De {BORNES_DES_PLACES.places.min} à {BORNES_DES_PLACES.places.max}. À la dernière, la remise disparaît de ce jour-là.</div>
        </div>
        <ChampNombre
          valeur={r.places} min={BORNES_DES_PLACES.places.min} max={BORNES_DES_PLACES.places.max}
          suffixe={r.places > 1 ? 'places' : 'place'} libelle="Places par jour" actif={estDirection}
          onValide={(n) => ecris({ places: n }, `${n === 1 ? 'Une place' : `${n} places`} par jour vide, à −${r.pct} %.`)}
        />
      </div>

      <div className="sys-row">
        <div>
          <div className="sys-row__label">Jours à l’avance</div>
          <div className="sys-row__sub">De {BORNES_DES_PLACES.horizon.min} à {BORNES_DES_PLACES.horizon.max}. Au-delà, un jour vide n’ouvre pas encore ses places.</div>
        </div>
        <ChampNombre
          valeur={r.horizon} min={BORNES_DES_PLACES.horizon.min} max={BORNES_DES_PLACES.horizon.max}
          suffixe="jours" libelle="Jours à l’avance" actif={estDirection}
          onValide={(n) => ecris({ horizon: n }, `Les places s’ouvrent ${n} jours à l’avance.`)}
        />
      </div>

      <div className="sys-row">
        <div>
          <div className="sys-row__label">Le pourcentage</div>
          <div className="sys-row__sub">De {BORNES_DES_PLACES.pct.min} à {BORNES_DES_PLACES.pct.max} %. Le net monte au millier, comme tous les codes : pas de monnaie.</div>
        </div>
        <ChampNombre
          valeur={r.pct} min={BORNES_DES_PLACES.pct.min} max={BORNES_DES_PLACES.pct.max}
          suffixe="%" libelle="Le pourcentage" actif={estDirection}
          onValide={(n) => ecris({ pct: n }, `La remise des places passe à −${n} %.`)}
        />
      </div>

      {r.active && r.existe && (
        <div className="mnd-muted" style={{ fontSize: 12, lineHeight: 1.6, marginTop: 10, maxWidth: 680 }} data-places="apercu">
          {ouverts.length === 0
            ? `Dans les ${r.horizon} jours à venir, aucun jour vide n’a de place ouverte en ce moment.`
            : <>Ouverts en ce moment : {ouverts.slice(0, 8).map((j) => `${jourCourtAn(j.iso)}, ${j.reste === 1 ? 'une place' : `${j.reste} places`}`).join(' · ')}{ouverts.length > 8 ? ` · et ${ouverts.length - 8} autres` : ''}.</>}
        </div>
      )}
    </Card>
  );
}
