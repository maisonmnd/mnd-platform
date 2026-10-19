import { useState } from 'react';
import { supabase } from '../../../../shared/supabase';
import { COFFRE_DES_VOIX, GARDE_DES_VOIX_JOURS, dureeDite } from '../../../../shared/message-vocal-pur';
import type { Demande } from '../../../../shared/demandes';

/* ══ LA VOIX D'UNE DEMANDE — 19 octobre 2026 ═════════════════════════════
   Le message vocal laissé sur le site (maquette HR7V2tMu… validée). La voix
   vit dans le coffre privé `voix-du-site` (0135) : on l'écoute par une
   adresse signée de dix minutes, demandée au moment d'écouter, jamais
   gardée. Passés 90 jours elle est effacée (sa décision) ; la demande le dit. */
export function VoixDeLaDemande({ d }: { d: Demande }) {
  const [adresse, setAdresse] = useState('');
  const [etat, setEtat] = useState<'' | 'charge' | 'echec'>('');
  const v = d.voix;
  if (!v?.chemin) return null;
  const duree = v.dureeS ? dureeDite(v.dureeS) : '';

  if (v.effaceeLe) {
    return (
      <p className="trc-sub" style={{ margin: 0 }} data-voix="effacee">
        Message vocal{duree ? ` de ${duree}` : ''}, effacé le {new Date(v.effaceeLe).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} ({GARDE_DES_VOIX_JOURS} jours, comme promis sur le site).
      </p>
    );
  }

  const ecouter = async () => {
    if (!supabase || etat === 'charge') return;
    setEtat('charge');
    const { data, error } = await supabase.storage.from(COFFRE_DES_VOIX).createSignedUrl(v.chemin, 600);
    if (error || !data?.signedUrl) { setEtat('echec'); return; }
    setAdresse(data.signedUrl);
    setEtat('');
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }} data-voix="a-ecouter">
      {adresse ? (
        <audio controls autoPlay src={adresse} style={{ maxWidth: '100%', height: 36 }} aria-label={`Message vocal${duree ? ` de ${duree}` : ''}`} />
      ) : (
        <button type="button" className="mnd-btn mnd-btn--sm" onClick={() => void ecouter()} disabled={etat === 'charge'}>
          {etat === 'charge' ? 'Ouverture…' : `Écouter le message vocal${duree ? ` (${duree})` : ''}`}
        </button>
      )}
      {etat === 'echec' && <span className="trc-sub" role="alert">Le message ne s’ouvre pas : la migration 0135 est-elle collée ?</span>}
    </div>
  );
}
