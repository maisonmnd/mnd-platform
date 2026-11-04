import { Card, toast } from '../../../../ds/components';
import { useSettings } from '../../../../shared/settings';
import { useStaff as useMaTete } from '../../../../shared/auth';
import { HEURES_DE_LA_CLOTURE_PAR_DEFAUT, heuresDeLaCloture } from '../../../../shared/cloture-du-jour-pur';

/* ══ LES HEURES DE LA CLÔTURE DE GRENAT — 4 novembre 2026 ═══════════════
   Maquette 9KCMgAb1… : « 15 h et 19 h, réglables dans Paramètres ». Deux
   heures au plus, de 8 h à 23 h, dans la tuile « Heures et jours ». La
   fonction `cloture-du-jour` les lit à chaque passage du cron (chaque heure
   du salon) et ne travaille qu'à celles-ci. Un rendez-vous fini après la
   dernière se relit au mot de 7 h, pour le Conseil de Saphir.

   LA DIRECTION SEULE (souverain) : le reste du personnel lit, les boutons
   sont éteints. */
const CHOIX = Array.from({ length: 16 }, (_, i) => i + 8);

export function CarteClotureDeGrenat() {
  const [settings, setSettings] = useSettings();
  const me = useMaTete();
  const direction = me?.role === 'souverain';
  const heures = heuresDeLaCloture(settings.cloture?.heures);

  const ecris = (suivantes: number[]) => {
    if (!direction) { toast('Ce réglage appartient à la direction.'); return; }
    const bornees = heuresDeLaCloture(suivantes);
    setSettings({ ...settings, cloture: { ...(settings.cloture ?? {}), heures: bornees } });
    toast(`Grenat clôturera à ${bornees.map((h) => `${h} h`).join(' et à ')}.`);
  };
  const bascule = (h: number) => {
    if (heures.includes(h)) {
      if (heures.length === 1) { toast('Il faut au moins une heure de clôture.'); return; }
      ecris(heures.filter((x) => x !== h));
      return;
    }
    if (heures.length >= 2) { toast('Deux heures au plus : retirez-en une d’abord.'); return; }
    ecris([...heures, h]);
  };

  return (
    <Card className="sys-section" data-carte="cloture-de-grenat">
      <div className="sys-section__title">La clôture de Grenat</div>
      <div className="sys-section__cap">
        Aux heures choisies, Grenat relit chaque rendez-vous et chaque facture du jour, fait ses trois gestes sûrs et prévient la direction et la personne au comptoir. Deux heures au plus ; par défaut {HEURES_DE_LA_CLOTURE_PAR_DEFAUT.map((h) => `${h} h`).join(' et ')}. Un rendez-vous fini après la dernière se relit au mot de 7 h.
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }} role="group" aria-label="Les heures de la clôture">
        {CHOIX.map((h) => (
          <button
            key={h}
            type="button"
            className={`trv-pill ${heures.includes(h) ? 'is-active' : ''}`}
            aria-pressed={heures.includes(h)}
            disabled={!direction}
            title={direction ? '' : 'La direction règle les heures de la clôture.'}
            onClick={() => bascule(h)}
            style={direction ? undefined : { cursor: 'not-allowed', opacity: heures.includes(h) ? 1 : 0.55 }}
          >
            {h} h
          </button>
        ))}
      </div>
      <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 10 }}>
        En ce moment : {heures.map((h) => `${h} h`).join(' et ')}.{direction ? '' : ' La direction seule les change.'}
      </div>
    </Card>
  );
}
