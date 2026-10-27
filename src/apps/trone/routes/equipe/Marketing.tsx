import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHead } from '../_ui';
import { Button } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { useSegments } from '../../../../shared/clients';
import { cleDuSegment, estUneAudienceConnue } from '../../../../shared/audiences-pur';
import type { Campagne } from '../../../../shared/campagnes-pur';
import { OngletAudience, OngletAutomatisations, OngletCampagnes, campagneNeuve } from './MarketingBranche';
import { useAbonnesAuxNotifications } from './useAudiences';
import EditeurDesOffres from './EditeurDesOffres';
import { Tabs } from './ui';
import './equipe.css';

type Tab = 'campagnes' | 'offres' | 'auto' | 'audience';

/* L'ONGLET DES OFFRES VIT DANS `EditeurDesOffres` (27 octobre 2026, lot 3 de
   l'Assistant Maison) : la vue « Offres et remises » le montre aussi, et la
   logique n'existe qu'une fois. Ici ne restent que les campagnes, les
   automatisations et l'audience, avec ce qui les relie. */

export default function Marketing() {
  const { branch } = useBranch();
  /* ?tab=auto : permet d'arriver droit sur les automatisations depuis ailleurs
     (bouton des Paramètres). Onglet inconnu → on retombe sur les campagnes. */
  const [params, setParams] = useSearchParams();
  const asked = params.get('tab');
  const [tab, setTab] = useState<Tab>(
    asked === 'auto' || asked === 'offres' || asked === 'audience' ? asked : 'campagnes',
  );
  /* LE MARKETING BRANCHÉ (21 octobre 2026) : les automatisations, l'audience
     et les campagnes vivent dans `MarketingBranche`. Ici, seulement ce qui les
     relie : la campagne ouverte, et « Écrire » depuis l'Audience qui la
     prépare déjà adressée. Les notifications se lisent une fois pour tous. */
  const [segmentList] = useSegments();
  const abonnes = useAbonnesAuxNotifications();
  const [brouillon, setBrouillon] = useState<Campagne | null>(null);
  const ecrireA = (cle: string) => {
    setTab('campagnes');
    setBrouillon(campagneNeuve(branch.id, cle));
  };
  const nouvelleCampagne = () => ecrireA(segmentList[0] ? cleDuSegment(segmentList[0]) : 'dormantes');
  /* ?ecrire=<audience> : « Préparer la campagne des dormantes » depuis Les
     prévisions (26 octobre 2026) : la campagne s'ouvre déjà adressée. Elle
     reste un brouillon ; déposée, elle attend retenue le feu vert. */
  const aEcrire = params.get('ecrire');
  useEffect(() => {
    if (!aEcrire) return;
    if (estUneAudienceConnue(aEcrire)) ecrireA(aEcrire);
    setParams((p) => { p.delete('ecrire'); return p; }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aEcrire]);

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="Intelligence · Marketing & IA"
        title="L’intelligence."
        sub="Campagnes · offres de saison · automatisations · audience."
        actions={
          tab === 'campagnes' ? <Button variant="copper" onClick={nouvelleCampagne}>+ Campagne</Button>
          : undefined
        }
      />

      <Tabs<Tab>
        tabs={[
          { k: 'campagnes', l: 'Campagnes' },
          { k: 'offres', l: 'Offres de saison' },
          { k: 'auto', l: 'Automatisations' },
          { k: 'audience', l: 'Audience' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'campagnes' && (
        <OngletCampagnes abonnes={abonnes} brouillon={brouillon} onBrouillon={setBrouillon} />
      )}

      {tab === 'offres' && <EditeurDesOffres abonnes={abonnes} />}

      {tab === 'auto' && <OngletAutomatisations />}

      {tab === 'audience' && <OngletAudience abonnes={abonnes} onEcrire={ecrireA} />}
    </div>
  );
}
