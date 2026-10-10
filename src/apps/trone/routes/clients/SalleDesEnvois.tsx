/* ══ LA SALLE D'ATTENTE DES ENVOIS — 2 octobre 2026 ══════════════════════
   « Est-ce possible d'intercepter un message qui part vers chez un client ?
   D'arrêter l'envoi à cause de l'heure tardive ou autre raison, erreur…
   Besoin de voir immédiatement les nouveaux messages qui sont prêts à partir
   dans les 5 à 10 min à venir » (Yéman). Maquette `maquette-la-salle-d-
   attente-des-envois.html`, validée.

   CE QUI VA PARTIR, AVANT QUE ÇA PARTE. Chaque message automatique passe dix
   minutes ici. Une main peut le retenir, le relâcher, l'envoyer tout de suite
   ou l'écarter. Les règles vivent dans `shared/salle-des-envois.ts`,
   éprouvées ; cet écran ne fait que montrer et demander.

   LE GESTE S'ÉCRIT AU SERVEUR, SOUS CONDITION. Retenir un message qui vient
   de partir ne doit pas le faire passer pour retenu : l'écriture ne passe que
   si la ligne est encore dans l'état que l'écran montrait. Sinon l'écran le
   dit, « trop tard, il vient de partir ». On n'écrit PAS dans le magasin : sa
   poussée réécrirait la ligne entière un quart de seconde plus tard, et
   pourrait remettre « en attente » un message que le facteur vient de porter.
   L'écran se met à jour par le direct, comme pour le geste d'un autre poste. */

import { useEffect, useMemo, useState } from 'react';
import { Button, Card } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { useClients } from '../../../../shared/clients';
import { useAuth, useMaTete } from '../../../../shared/auth';
import { supabase } from '../../../../shared/supabase';
import { heureLisible } from '../../../../shared/rappel';
import { typeDit, canalDit } from '../../../../shared/envois';
import {
  EN_ATTENTE, RETENU, reglesDepuis, retiens, relache, envoieMaintenant, ecarte,
  quandIlPart, facteurVivant, heureDuSalon, type ReglesDeLaSalle,
} from '../../../../shared/salle-des-envois';
import { envoisStore, useEnvois, useAutoConfig, type Envoi } from '../equipe/data';

type Geste = 'retenir' | 'relacher' | 'envoyer' | 'ecarter';
type Verdict = 'fait' | 'trop-tard' | 'panne';

/** Le geste, écrit au serveur sous condition (voir l'en-tête). */
export async function gesteDeLaSalle(id: string, geste: Geste, qui: string, regles: ReglesDeLaSalle): Promise<Verdict> {
  const ligne = envoisStore.get().find((e) => e.id === id);
  if (!ligne) return 'trop-tard';
  const maintenant = Date.now();
  const iso = new Date(maintenant).toISOString();
  const apres = geste === 'retenir' ? retiens(ligne, qui, iso)
    : geste === 'relacher' ? relache(ligne, maintenant, regles)
      : geste === 'envoyer' ? envoieMaintenant(ligne, maintenant)
        : ecarte(ligne, qui, iso);
  if (!apres) return 'trop-tard';
  if (!supabase) {
    /* Sans serveur (poste de démonstration), le magasin est la seule vérité. */
    envoisStore.set((prev) => prev.map((e) => (e.id === id ? apres : e)));
    return 'fait';
  }
  const { data, error } = await supabase.from('envois')
    .update({ data: apres }).eq('id', id).eq('data->>statut', ligne.statut).select('id');
  if (error) return 'panne';
  return (data ?? []).length > 0 ? 'fait' : 'trop-tard';
}

/** « jeu. 8 oct. 2026 · 10 h ». L'année depuis le 10 octobre 2026, comme au
    journal des envois : un rendez-vous retenu ici peut tomber l'an prochain. */
const pourLeRdv = (date?: string, heure?: string): string => {
  if (!date) return '';
  const jour = new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  return heure ? `${jour} · ${heureLisible(heure)}` : jour;
};
const heureDite = (iso?: string): string => {
  const t = Date.parse(iso ?? '');
  if (!Number.isFinite(t)) return '';
  const h = heureDuSalon(t);
  const hh = Math.floor(h); const mm = Math.floor((h - hh) * 60 + 1e-6);
  return `${hh} h${mm > 0 ? ` ${String(mm).padStart(2, '0')}` : ''}`;
};

/** LE FACTEUR EST-IL VIVANT ? Lu directement, une fois par minute : c'est un
    signe de vie, pas une donnée de la Maison, il n'a rien à faire dans un
    magasin synchronisé. */
function useFacteur(): 'vivant' | 'absent' | 'inconnu' {
  const [etat, setEtat] = useState<'vivant' | 'absent' | 'inconnu'>('inconnu');
  useEffect(() => {
    const sb = supabase;
    if (!sb) return undefined;
    let vivant = true;
    const lis = async () => {
      const { data, error } = await sb.from('documents').select('data').eq('key', 'mnd_facteur').maybeSingle();
      if (!vivant || error) return;
      setEtat(facteurVivant((data?.data as { vuLe?: string } | null)?.vuLe, Date.now()) ? 'vivant' : 'absent');
    };
    void lis();
    const t = window.setInterval(() => { void lis(); }, 60_000);
    return () => { vivant = false; window.clearInterval(t); };
  }, []);
  return etat;
}

export function SalleDesEnvois() {
  const { branch } = useBranch();
  const { session } = useAuth();
  const { tete } = useMaTete();
  const [envois] = useEnvois();
  const [clients] = useClients();
  const [cfg] = useAutoConfig();
  const regles = useMemo(() => reglesDepuis(cfg), [cfg]);
  const facteur = useFacteur();
  const [enCours, setEnCours] = useState<string | null>(null);
  const [mot, setMot] = useState('');
  /* Le compte à rebours avance sans qu'aucun magasin ne bouge. */
  const [, bat] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => bat((n) => n + 1), 15_000);
    return () => window.clearInterval(t);
  }, []);

  const qui = ((tete as { name?: string } | null)?.name ?? '').trim().split(/\s+/)[0]
    || (session?.user?.email ?? '').split('@')[0] || 'le comptoir';
  const ficheDe = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const enSalle = useMemo(
    () => envois
      .filter((e): e is Envoi => !!e && (!e.branchId || e.branchId === branch.id) && (e.statut === EN_ATTENTE || e.statut === RETENU))
      .sort((a, b) => (a.statut === b.statut ? (a.partA ?? '').localeCompare(b.partA ?? '') : a.statut === EN_ATTENTE ? -1 : 1)),
    [envois, branch.id],
  );
  const attendent = enSalle.filter((e) => e.statut === EN_ATTENTE);
  const maintenant = Date.now();

  const fais = async (ids: string[], geste: Geste) => {
    setEnCours(ids.length === 1 ? ids[0] : 'tous');
    setMot('');
    let tropTard = 0; let pannes = 0;
    for (const id of ids) {
      const v = await gesteDeLaSalle(id, geste, qui, regles);
      if (v === 'trop-tard') tropTard += 1;
      if (v === 'panne') pannes += 1;
    }
    setEnCours(null);
    setMot(pannes > 0 ? 'Le serveur n’a pas répondu : le geste n’est pas passé. Réessayez.'
      : tropTard > 0 ? (ids.length === 1 ? 'Trop tard : ce message vient de partir.' : `${tropTard} message${tropTard > 1 ? 's étaient déjà partis' : ' était déjà parti'}.`)
        : '');
  };

  if (enSalle.length === 0 && facteur !== 'absent') return null;

  return (
    <Card style={{ padding: '16px 18px', marginBottom: 16, borderColor: 'var(--copper-300)', background: 'var(--copper-50)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--font-serif)', fontSize: 21, color: 'var(--color-indigo)' }}>La salle d’attente</span>
        <span className="mnd-muted" style={{ fontSize: 12.5 }}>
          Un message y reste {regles.salleMin} minutes. Passé ce délai, il part seul, sauf si une main l’a retenu.
        </span>
        {attendent.length > 1 && (
          <Button variant="ghost" size="sm" style={{ marginLeft: 'auto' }} disabled={enCours !== null} onClick={() => void fais(attendent.map((e) => e.id), 'retenir')}>
            Tout retenir
          </Button>
        )}
      </div>

      {facteur === 'absent' && (
        <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--copper-700)', lineHeight: 1.5 }}>
          <b style={{ fontWeight: 600 }}>La salle est fermée.</b> Le facteur ne répond pas depuis plus de cinq minutes :
          les messages partent comme avant, sans attendre. Vérifiez le réveil « envois-partent » chez Supabase.
        </div>
      )}
      {mot && <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--copper-700)' }}>{mot}</div>}

      {enSalle.map((e) => {
        const fiche = e.clientId ? ficheDe.get(e.clientId) : undefined;
        const nom = fiche?.name ?? e.prenom ?? 'Une cliente';
        const tenu = e.statut === RETENU;
        return (
          <div
            key={e.id}
            style={{
              display: 'grid', gridTemplateColumns: 'minmax(96px, 124px) minmax(0, 1fr) auto', gap: 14, alignItems: 'center',
              padding: '12px 0', marginTop: 10, borderTop: '1px solid var(--copper-300)',
            }}
          >
            <div style={{ fontSize: 12.5, color: 'var(--copper-700)', fontVariantNumeric: 'tabular-nums' }}>
              {tenu ? (
                <>
                  <span style={{ display: 'inline-block', fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase', padding: '2px 8px', borderRadius: 999, background: 'var(--color-copper)', color: '#fff' }}>retenu</span>
                  <span style={{ display: 'block', marginTop: 3 }}>{e.retenuPar ? `par ${e.retenuPar}` : ''}{e.retenuLe ? `, ${heureDite(e.retenuLe)}` : ''}</span>
                </>
              ) : (
                <>
                  <span style={{ display: 'block', fontFamily: 'var(--font-serif)', fontSize: 19, lineHeight: 1.1, color: 'var(--color-indigo)' }}>
                    {quandIlPart(e, maintenant)}
                  </span>
                  {e.calme ? <span style={{ display: 'block', marginTop: 2 }}>heures calmes</span> : <span style={{ display: 'block', marginTop: 2 }}>à {heureDite(e.partA)}</span>}
                </>
              )}
            </div>
            <div style={{ minWidth: 0 }}>
              <span style={{ fontWeight: 500, color: 'var(--color-indigo)' }}>{typeDit(e.type)} · {nom}</span>
              <span className="mnd-muted" style={{ display: 'block', fontSize: 12.5 }}>
                {canalDit(e.canal)}{e.dateRdv && e.type !== 'avis-google' ? ` · rendez-vous du ${pourLeRdv(e.dateRdv, e.heure)}` : ''}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {tenu ? (
                <>
                  <Button variant="ghost" size="sm" disabled={enCours !== null} onClick={() => void fais([e.id], 'relacher')}>Relâcher</Button>
                  <button
                    type="button"
                    disabled={enCours !== null}
                    onClick={() => void fais([e.id], 'ecarter')}
                    style={{ font: 'inherit', fontSize: 12.5, color: 'var(--copper-700)', background: 'transparent', border: 'none', padding: '6px 2px', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}
                  >
                    Ne jamais l’envoyer
                  </button>
                </>
              ) : (
                <>
                  <Button variant="copper" size="sm" disabled={enCours !== null} onClick={() => void fais([e.id], 'retenir')}>Retenir</Button>
                  <Button variant="ghost" size="sm" disabled={enCours !== null} onClick={() => void fais([e.id], 'envoyer')}>
                    {e.calme ? 'Envoyer quand même' : 'Envoyer maintenant'}
                  </Button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </Card>
  );
}
