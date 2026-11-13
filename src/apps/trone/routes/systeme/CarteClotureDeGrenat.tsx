import { Card, toast } from '../../../../ds/components';
import { useSettings } from '../../../../shared/settings';
import { useStaff as useMaTete } from '../../../../shared/auth';
import { HEURES_DE_LA_CLOTURE_PAR_DEFAUT, heuresDeLaCloture } from '../../../../shared/cloture-du-jour-pur';
import { DELAIS_DE_LA_FACTURE, reglagesDuCaissier } from '../../../../shared/le-caissier-pur';

/** Un délai dit : « 30 min », « 1 h », « 2 h », « Jamais seule ». */
const delaiDit = (m: number): string => (m <= 0 ? 'Jamais seule' : m % 60 === 0 ? `${m / 60} h` : `${m} min`);

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

  /* LE CAISSIER (13 novembre 2026) : allumé ou éteint, et le délai de la facture seule. */
  const caissier = reglagesDuCaissier(settings.caissier);
  const ecrisLeCaissier = (suivant: { actif?: boolean; factureApresMin?: number }, dit: string) => {
    if (!direction) { toast('Ce réglage appartient à la direction.'); return; }
    setSettings({ ...settings, caissier: { ...caissier, ...suivant } });
    toast(dit);
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

      <div className="sys-section__title" style={{ marginTop: 18 }} data-carte="le-caissier">Le caissier</div>
      <div className="sys-section__cap">
        Entre deux clôtures, Grenat passe toutes les cinq minutes. Seul : il honore un rendez-vous réglé en entier, relie une facture, envoie le reçu quinze minutes après l’encaissement. Quinze minutes après la fin d’un rituel où rien n’est encaissé, il prévient le comptoir ; au délai choisi, la facture s’écrit au tarif de sa tête et part sur son WhatsApp, jamais après 19 h 30, jamais à une cliente « passe au comptoir ». Il n’encaisse jamais d’espèces.
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }} role="group" aria-label="Le caissier">
        <button
          type="button"
          className={`trv-pill ${caissier.actif ? 'is-active' : ''}`}
          aria-pressed={caissier.actif}
          disabled={!direction}
          onClick={() => ecrisLeCaissier({ actif: !caissier.actif }, caissier.actif ? 'Le caissier est éteint : Grenat garde ses clôtures.' : 'Le caissier passe de nouveau toutes les cinq minutes.')}
        >
          {caissier.actif ? 'Allumé' : 'Éteint'}
        </button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }} role="group" aria-label="La facture part seule après">
        {DELAIS_DE_LA_FACTURE.map((m) => (
          <button
            key={m}
            type="button"
            className={`trv-pill ${caissier.factureApresMin === m ? 'is-active' : ''}`}
            aria-pressed={caissier.factureApresMin === m}
            disabled={!direction || !caissier.actif}
            onClick={() => ecrisLeCaissier({ factureApresMin: m }, m > 0 ? `La facture partira seule ${delaiDit(m)} après la fin du rituel.` : 'La facture ne partira jamais seule : le comptoir est seulement prévenu.')}
          >
            {delaiDit(m)}
          </button>
        ))}
      </div>
      <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 10 }}>
        En ce moment : {caissier.actif ? `allumé ; la facture ${caissier.factureApresMin > 0 ? `part seule ${delaiDit(caissier.factureApresMin)} après la fin` : 'ne part jamais seule'}` : 'éteint'}.{direction ? '' : ' La direction seule le règle.'}
      </div>
    </Card>
  );
}
