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

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { useClients } from '../../../../shared/clients';
import { useAppointments } from '../../../../shared/agenda';
import { useAuth, useMaTete } from '../../../../shared/auth';
import { supabase } from '../../../../shared/supabase';
import { appliqueCommeLeDirect } from '../../../../shared/sync';
import { heureLisible } from '../../../../shared/rappel';
import { typeDit, canalDit, jourDuSalon } from '../../../../shared/envois';
import {
  EN_ATTENTE, RETENU, ECARTE, reglesDepuis, retiens, relache, envoieMaintenant, ecarte,
  quandIlPart, departReel, facteurVivant, heureDuSalon, recolleLeColis, type ReglesDeLaSalle,
} from '../../../../shared/salle-des-envois';
import { programmeDansLaSalle } from '../../../../shared/envois-programmes-pur';
import { envoisStore, useEnvois, useAutoConfig, type Envoi } from '../equipe/data';

type Geste = 'retenir' | 'relacher' | 'envoyer' | 'ecarter';
type Verdict = 'fait' | 'trop-tard' | 'panne';

/** Le geste, écrit au serveur sous condition (voir l'en-tête). */
export async function gesteDeLaSalle(
  id: string, geste: Geste, qui: string, regles: ReglesDeLaSalle,
  /* CE QUE LE GESTE DIT EN PLUS (27 octobre 2026) : « Pas maintenant » de
     l'Assistant écarte la ligne ET y pose sa réponse (`reponse: 'non'`),
     dans la même écriture conditionnelle. */
  enPlus?: Record<string, unknown>,
): Promise<Verdict> {
  const ligne = envoisStore.get().find((e) => e.id === id);
  if (!ligne) return 'trop-tard';
  const maintenant = Date.now();
  const iso = new Date(maintenant).toISOString();
  const brut = geste === 'retenir' ? retiens(ligne, qui, iso)
    : geste === 'relacher' ? relache(ligne, maintenant, regles)
      : geste === 'envoyer' ? envoieMaintenant(ligne, maintenant)
        : ecarte(ligne, qui, iso);
  const apres = brut && enPlus ? { ...brut, ...enPlus } : brut;
  if (!apres) return 'trop-tard';
  if (!supabase) {
    /* Sans serveur (poste de démonstration), le magasin est la seule vérité. */
    envoisStore.set((prev) => prev.map((e) => (e.id === id ? apres : e)));
    return 'fait';
  }
  const { data, error } = await supabase.from('envois')
    .update({ data: apres }).eq('id', id).eq('data->>statut', ligne.statut).select('id, data, updated_at');
  if (error) return 'panne';
  const ecrite = (data ?? [])[0] as LigneDuServeur | undefined;
  /* LE GESTE SE VOIT TOUT DE SUITE (15 novembre 2026) : la ligne que le
     serveur vient d'écrire s'applique comme le direct l'apporterait. */
  if (ecrite) { appliqueCommeLeDirect('envois', ecrite); return 'fait'; }
  /* RIEN N'A ÉTÉ ÉCRIT : la ligne n'était plus dans l'état que l'écran
     montrait. On relit ce qu'elle est devenue, l'écran le montre, et si une
     autre main (ou un premier clic) a déjà fait le même geste, c'est fait. */
  const { data: relue } = await supabase.from('envois').select('id, data, updated_at').eq('id', id).limit(1);
  const vraie = (relue ?? [])[0] as LigneDuServeur | undefined;
  if (!vraie) return 'trop-tard';
  appliqueCommeLeDirect('envois', vraie);
  return gesteDejaFait(geste, vraie.data) ? 'fait' : 'trop-tard';
}

type LigneDuServeur = { id: string; data: Envoi; updated_at?: string };

/** Le geste voulu est-il déjà ce que porte la ligne ? */
const gesteDejaFait = (geste: Geste, l: Envoi | null | undefined): boolean => {
  if (!l) return false;
  if (geste === 'retenir') return l.statut === RETENU;
  if (geste === 'ecarter') return l.statut === ECARTE;
  if (geste === 'envoyer') return l.statut === EN_ATTENTE && l.parLaMain === true;
  return l.statut === EN_ATTENTE;
};

/* ══ LA CONFIRMATION SUIT SON RENDEZ-VOUS — 23 octobre 2026 ══════════════
   « Le message est figé sur la date initialement prévue » (Yéman). Dès que
   le Trône voit un rendez-vous déplacé alors que sa confirmation attend en
   salle, il réécrit le message à la nouvelle date (la règle :
   `recolleLeColis`). Écrit au serveur SOUS CONDITION, comme les gestes : la
   ligne doit attendre encore, à l'ancienne date ; un message parti ou déjà
   repris ailleurs n'est pas touché. Monté dans la pastille de la barre, qui
   vit sur tous les écrans : la salle n'a pas besoin d'être ouverte. Le
   facteur refait la même reprise avant de porter, si aucun Trône n'était
   ouvert. */
export function useRecolleLesEnvois(): void {
  const [envois] = useEnvois();
  const [appts] = useAppointments();
  const faits = useRef(new Set<string>());
  useEffect(() => {
    const parId = new Map(appts.map((a) => [a.id, a]));
    const maintenant = Date.now();
    for (const e of envois) {
      if (!e || !e.apptId || (e.statut !== EN_ATTENTE && e.statut !== RETENU)) continue;
      const rdv = parId.get(e.apptId);
      if (!rdv) continue;
      const repris = recolleLeColis(e, { date: rdv.date, time: rdv.time, status: rdv.status }, maintenant);
      if (!repris) continue;
      const cle = `${e.id}|${repris.dateRdv}|${repris.heure ?? ''}`;
      if (faits.current.has(cle)) continue;
      faits.current.add(cle);
      const apres: Envoi = { ...repris, recolleLe: new Date(maintenant).toISOString() };
      if (!supabase) { envoisStore.set((prev) => prev.map((x) => (x.id === e.id ? apres : x))); continue; }
      void supabase.from('envois').update({ data: apres })
        .eq('id', e.id).eq('data->>statut', e.statut).eq('data->>dateRdv', e.dateRdv ?? '')
        .select('id')
        .then(({ error }) => { if (error) faits.current.delete(cle); });
    }
  }, [envois, appts]);
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
/** « 7 h 57 » aujourd'hui, « 25 oct. 2026, 7 h 57 » un autre jour : un
    message retenu depuis trois semaines ne doit pas passer pour retenu ce
    matin. L'année toujours, comme partout où une date se dit. */
const momentDit = (iso: string | undefined, maintenantMs: number): string => {
  const heure = heureDite(iso);
  if (!heure) return '';
  const jour = jourDuSalon(iso ?? '');
  if (!jour || jour === jourDuSalon(new Date(maintenantMs).toISOString())) return heure;
  const [a, m, j] = jour.split('-').map(Number);
  const date = new Date(Date.UTC(a, m - 1, j, 12)).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return `${date}, ${heure}`;
};

/** Plusieurs gestes à la fois, six au plus en vol : « Tout effacer » sur
    quarante-huit lignes ne doit pas attendre quarante-huit allers-retours. */
async function parPaquets<T>(ids: readonly string[], fais: (id: string) => Promise<T>, enVol = 6): Promise<T[]> {
  const res: T[] = [];
  let i = 0;
  const ouvrier = async () => { while (i < ids.length) { const k = i++; res[k] = await fais(ids[k]); } };
  await Promise.all(Array.from({ length: Math.min(enVol, ids.length) }, ouvrier));
  return res;
}

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
  /* CHAQUE LIGNE SON GESTE (15 novembre 2026) : un geste en vol figeait TOUS
     les boutons de la salle, et un serveur lent faisait croire la salle
     morte. Seule la ligne touchée attend ; « tous » fige le reste. */
  const [enCours, setEnCours] = useState<ReadonlySet<string>>(() => new Set());
  const [toutEnCours, setToutEnCours] = useState(false);
  const [effacerTout, setEffacerTout] = useState(false);
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
      /* Un envoi programmé y paraît dans l'heure qui vient (13 novembre 2026) : la file des envois programmés les montre tous. */
      .filter((e): e is Envoi => !!e && (!e.branchId || e.branchId === branch.id) && (e.statut === EN_ATTENTE || e.statut === RETENU) && programmeDansLaSalle(e, Date.now()))
      .sort((a, b) => (a.statut === b.statut ? (a.partA ?? '').localeCompare(b.partA ?? '') : a.statut === EN_ATTENTE ? -1 : 1)),
    [envois, branch.id],
  );
  const attendent = enSalle.filter((e) => e.statut === EN_ATTENTE);
  const tenus = enSalle.filter((e) => e.statut === RETENU);
  const maintenant = Date.now();

  const fais = async (ids: string[], geste: Geste) => {
    const tous = ids.length > 1;
    if (tous) setToutEnCours(true);
    setEnCours((s) => new Set([...s, ...ids]));
    setMot('');
    let verdicts: Verdict[] = [];
    try {
      verdicts = await parPaquets(ids, (id) => gesteDeLaSalle(id, geste, qui, regles).catch((): Verdict => 'panne'));
    } finally {
      setEnCours((s) => { const n = new Set(s); for (const id of ids) n.delete(id); return n; });
      if (tous) { setToutEnCours(false); setEffacerTout(false); }
    }
    const tropTard = verdicts.filter((v) => v === 'trop-tard').length;
    const pannes = verdicts.filter((v) => v === 'panne').length;
    setMot(pannes > 0 ? `Le serveur n’a pas répondu${tous ? ` pour ${pannes} message${pannes > 1 ? 's' : ''}` : ''} : le geste n’est pas passé. Réessayez.`
      : tropTard > 0 ? (!tous ? 'Trop tard : ce message vient de partir.' : `${tropTard} message${tropTard > 1 ? 's étaient déjà partis' : ' était déjà parti'}.`)
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
        {(attendent.length > 1 || tenus.length > 1) && (
          <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
            {attendent.length > 1 && (
              <Button variant="ghost" size="sm" disabled={toutEnCours} onClick={() => void fais(attendent.map((e) => e.id), 'retenir')}>
                Tout retenir
              </Button>
            )}
            {/* EFFACER LES RETENUS (15 novembre 2026) : « quand j'ai des messages
                que j'ai retenus, me donner la possibilité de les effacer pour ne
                plus les voir » (Yéman). Ils ne partiront jamais ; le journal les
                garde, rangés « écartés ». */}
            {tenus.length > 1 && !effacerTout && (
              <Button variant="ghost" size="sm" disabled={toutEnCours} onClick={() => setEffacerTout(true)}>
                Effacer les {tenus.length} retenus
              </Button>
            )}
          </span>
        )}
      </div>

      {effacerTout && (
        <div
          role="alertdialog"
          aria-label="Effacer les messages retenus"
          style={{ marginTop: 12, padding: '12px 14px', border: '1px solid var(--copper-300)', borderRadius: 3, background: 'var(--color-ivoire, #F6F1E7)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}
        >
          <span style={{ fontSize: 13, color: 'var(--color-indigo)', lineHeight: 1.5, flex: '1 1 260px' }}>
            Les {tenus.length} messages retenus ne partiront jamais. Ils quittent la salle et restent au journal, rangés « écartés ».
          </span>
          <span style={{ display: 'inline-flex', gap: 8 }}>
            <Button variant="copper" size="sm" disabled={toutEnCours} onClick={() => void fais(tenus.map((e) => e.id), 'ecarter')}>
              {toutEnCours ? 'Effacement…' : `Effacer les ${tenus.length}`}
            </Button>
            <Button variant="ghost" size="sm" disabled={toutEnCours} onClick={() => setEffacerTout(false)}>Garder</Button>
          </span>
        </div>
      )}

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
        const occupe = toutEnCours || enCours.has(e.id);
        const depart = tenu ? null : departReel(e, maintenant, regles);
        return (
          <div
            key={e.id}
            data-envoi={e.id}
            style={{
              display: 'grid', gridTemplateColumns: 'minmax(96px, 124px) minmax(0, 1fr) auto', gap: 14, alignItems: 'center',
              padding: '12px 0', marginTop: 10, borderTop: '1px solid var(--copper-300)',
            }}
          >
            <div style={{ fontSize: 12.5, color: 'var(--copper-700)', fontVariantNumeric: 'tabular-nums' }}>
              {tenu ? (
                <>
                  <span style={{ display: 'inline-block', fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase', padding: '2px 8px', borderRadius: 999, background: 'var(--color-copper)', color: '#fff' }}>retenu</span>
                  <span style={{ display: 'block', marginTop: 3 }}>{e.retenuPar ? `par ${e.retenuPar}` : ''}{e.retenuLe ? `${e.retenuPar ? ', ' : ''}${momentDit(e.retenuLe, maintenant)}` : ''}</span>
                </>
              ) : (
                <>
                  <span style={{ display: 'block', fontFamily: 'var(--font-serif)', fontSize: 19, lineHeight: 1.1, color: 'var(--color-indigo)' }}>
                    {depart ? quandIlPart(depart, maintenant) : quandIlPart(e, maintenant)}
                  </span>
                  <span style={{ display: 'block', marginTop: 2 }}>
                    {e.parLaMain ? 'demandé à la main : le facteur passe chaque minute' : depart?.calme ? 'heures calmes' : `à ${heureDite(depart?.partA ?? e.partA)}`}
                  </span>
                </>
              )}
            </div>
            <div style={{ minWidth: 0 }}>
              <span style={{ fontWeight: 500, color: 'var(--color-indigo)' }}>{typeDit(e.type)} · {nom}</span>
              <span className="mnd-muted" style={{ display: 'block', fontSize: 12.5 }}>
                {canalDit(e.canal)}{e.dateRdv && e.type !== 'avis-google' ? ` · ${e.type === 'point-apres' || e.type === 'point-avant' ? 'séance' : 'rendez-vous'} du ${pourLeRdv(e.dateRdv, e.heure)}` : ''}
              </span>
              {e.recolleLe && (
                <span style={{ display: 'block', fontSize: 12, color: 'var(--copper-700)' }}>
                  Rendez-vous déplacé : le message dit maintenant la nouvelle date.
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {occupe ? (
                <span aria-live="polite" style={{ fontSize: 12.5, color: 'var(--copper-700)', padding: '6px 2px' }}>Un instant…</span>
              ) : tenu ? (
                <>
                  <Button variant="ghost" size="sm" onClick={() => void fais([e.id], 'relacher')}>Relâcher</Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    title="Il ne partira jamais. Il quitte la salle et reste au journal, rangé « écarté »."
                    onClick={() => void fais([e.id], 'ecarter')}
                  >
                    Effacer
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="copper" size="sm" onClick={() => void fais([e.id], 'retenir')}>Retenir</Button>
                  {!e.parLaMain && (
                    <Button variant="ghost" size="sm" onClick={() => void fais([e.id], 'envoyer')}>
                      {depart?.calme ? 'Envoyer quand même' : 'Envoyer maintenant'}
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
    </Card>
  );
}
