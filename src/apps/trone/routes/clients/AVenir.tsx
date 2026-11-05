/* ══ CE QUI VA PARTIR — 5 novembre 2026 ═══════════════════════════════════
   « Est-ce possible d'avoir tous les modèles Meta qui doivent partir pour le
   Trône, quelque part dans le Trône, pour qu'on puisse contrôler chaque
   message qui part, à qui, et qu'on puisse arrêter le message au besoin ? »
   (Yéman, 4 novembre 2026). Maquette « Ce qui va partir » (v3) validée :
   Conversations › Envois automatiques › À venir, sept jours, jour par jour.

   CHAQUE MESSAGE META que la Maison enverra d'elle-même : l'heure, à qui (le
   nom pour la direction, les initiales pour l'équipe), le modèle (son nom
   lisible et son nom chez Meta), pourquoi. « Voir le message » montre ce que
   la cliente lira. « Ne pas envoyer » (la direction seule) l'arrête d'avance :
   la porte d'Opale et la fonction qui dépose le sautent ; « Remettre » le rend
   tant que son heure n'est pas passée. La règle vit dans
   `shared/ce-qui-va-partir-pur.ts`, la clé et la porte d'avance dans
   `shared/arret-d-avance-pur.ts` ; cet écran ne fait que montrer et demander. */

import { useMemo, useState } from 'react';
import { useAuth, useMaTete } from '../../../../shared/auth';
import { useBranch } from '../../../../shared/branches';
import { useClients } from '../../../../shared/clients';
import { supabase } from '../../../../shared/supabase';
import { arreteLeMessage, remetLeMessage } from '../../../../shared/arrets-d-avance';
import { heureDeDepart, reglesDepuis } from '../../../../shared/salle-des-envois';
import {
  SORTES_DITES, arretDit, compteDeCeQuiVaPartir, heureDite, parJour, peutSeRemettre, quiDit,
  type MessagePrevu, type SorteDeMessage,
} from '../../../../shared/ce-qui-va-partir-pur';
import { envoisStore, useAutoConfig, type Envoi } from '../equipe/data';
import { useEstDirection } from '../_vie';
import { useCeQuiVaPartir } from './ce-qui-va-partir-donnees';

/** « Remettre » une ligne déjà écartée par l'arrêt : elle repart en salle,
    à son heure, si elle attend encore d'être portée (écriture sous condition,
    comme les gestes de la salle). */
async function rendsLaLigne(cle: string, maintenantMs: number, salleMin: number): Promise<void> {
  const ligne = envoisStore.get().find((e) => (e as { arretDAvance?: { cle?: string } }).arretDAvance?.cle === cle && e.statut === 'écarté');
  if (!ligne || !(ligne as { colis?: unknown }).colis) return;
  const partA = Date.parse(String(ligne.partA ?? ''));
  if (!Number.isFinite(partA) || partA <= maintenantMs) return;
  const regles = reglesDepuis({ salleMin });
  const depart = Math.max(partA, heureDeDepart(maintenantMs, regles).partA);
  const { ecartePar: _p, ecarteLe: _l, arretDAvance: _a, detail: _d, ...reste } = ligne as Envoi & { ecartePar?: string; ecarteLe?: string; arretDAvance?: unknown };
  const rendue = { ...reste, statut: 'en-attente', partA: new Date(depart).toISOString(), remisLe: new Date(maintenantMs).toISOString() } as Envoi;
  if (!supabase) { envoisStore.set((prev) => prev.map((e) => (e.id === ligne.id ? rendue : e))); return; }
  await supabase.from('envois').update({ data: rendue }).eq('id', ligne.id).eq('data->>statut', 'écarté');
}

export function AVenir() {
  const { branch } = useBranch();
  const { session } = useAuth();
  const { tete } = useMaTete();
  const direction = useEstDirection();
  const [clients] = useClients();
  const [cfg] = useAutoConfig();
  const { liste, maintenantMs } = useCeQuiVaPartir(true);
  const [filtre, setFiltre] = useState<'' | SorteDeMessage>('');
  const [ouverts, setOuverts] = useState<Record<string, boolean>>({});
  const nomDe = useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients]);
  const qui = ((tete as { name?: string } | null)?.name ?? '').trim().split(/\s+/)[0]
    || (session?.user?.email ?? '').split('@')[0] || 'la direction';

  const visibles = filtre ? liste.filter((m) => m.sorte === filtre) : liste;
  const compte = compteDeCeQuiVaPartir(visibles);
  const jours = parJour(visibles, maintenantMs);
  const calmeDe = Number(cfg.calmeDe ?? 20);
  const calmeA = Number(cfg.calmeA ?? 8);

  const arrete = (m: MessagePrevu) => arreteLeMessage({ cle: m.cle, par: qui, branchId: branch.id, quoi: `${m.modeleDit} · ${m.jour}` });
  const remets = (m: MessagePrevu) => {
    remetLeMessage({ cle: m.cle, par: qui });
    void rendsLaLigne(m.cle, Date.now(), Number(cfg.salleMin ?? 10));
  };
  const nomPour = (m: MessagePrevu): string => {
    const noms = [m.clientId, ...(m.clientIds ?? [])].filter((x, i, t) => !!x && t.indexOf(x) === i).map((id) => quiDit(nomDe.get(id), direction));
    return noms.join(', ') || 'Une cliente';
  };

  return (
    <div>
      <div className="trc-avenir">
        <div className="trc-avenir__tete">
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 21, color: 'var(--color-indigo)' }}>Ce qui va partir</div>
          <div className="trc-avenir__compte" data-banc="compte">
            <span><b>{compte.partiront}</b> partiront</span>
            <span><b>{compte.arretes}</b> arrêté{compte.arretes > 1 ? 's' : ''}</span>
            {compte.enPause > 0 && <span><b>{compte.enPause}</b> en pause</span>}
            <span>des 7 jours à venir</span>
          </div>
          <div className="trc-avenir__filtres" role="group" aria-label="Sorte de message">
            {([['', 'Tout'], ...Object.entries(SORTES_DITES)] as [string, string][]).map(([k, mot]) => (
              <button key={k || 'tout'} type="button" aria-pressed={filtre === k} onClick={() => setFiltre(k as '' | SorteDeMessage)}>{mot}</button>
            ))}
          </div>
        </div>

        {jours.map((j, i) => (
          <div key={j.jour}>
            <div className="trc-avenir__jour">
              <span>{j.titre}</span>
              <span>{j.messages.length} message{j.messages.length > 1 ? 's' : ''}</span>
            </div>
            {i === 0 && calmeDe !== calmeA && (
              <p className="trc-avenir__calme">Rien ne part seul de {calmeDe} h à {calmeA} h : les heures calmes.</p>
            )}
            {j.messages.length === 0 && <p className="trc-avenir__vide">Rien de prévu.</p>}
            {j.messages.map((m) => {
              const arretee = m.etat === 'arrete';
              const ouvert = !!ouverts[m.cle];
              return (
                <div key={m.cle} className={`trc-avenir__envoi${arretee ? ' trc-avenir__envoi--arrete' : ''}`} data-cle={m.cle}>
                  <div className="trc-avenir__heure">{heureDite(m.partA)}</div>
                  <div style={{ minWidth: 0 }}>
                    <span className="trc-avenir__qui">{nomPour(m)}</span>
                    {m.etat === 'en-salle' && <span className="trc-avenir__pastille">en salle</span>}
                    <span className="trc-avenir__modele">{m.modeleDit} · <code>{m.modele}</code></span>
                    <span className="trc-avenir__pourquoi">{m.raison}</span>
                    {m.etat === 'en-pause' && (
                      <span className="trc-avenir__pourquoi" style={{ color: 'var(--color-brique, #96412E)' }}>Modèle en pause : il ne partira pas tant qu’il n’est pas repris.</span>
                    )}
                    {m.etat === 'repli' && (
                      <span className="trc-avenir__pourquoi">Modèle en pause : <code>{m.pause}</code> partira à sa place.</span>
                    )}
                  </div>
                  <div className="trc-avenir__gestes">
                    {m.texte && (
                      <button type="button" className="trc-avenir__lire" onClick={() => setOuverts((o) => ({ ...o, [m.cle]: !o[m.cle] }))}>
                        {ouvert ? 'Fermer' : 'Voir le message'}
                      </button>
                    )}
                    {direction && !arretee && m.etat !== 'en-pause' && (
                      <button type="button" className="trc-avenir__stop" onClick={() => arrete(m)}>Ne pas envoyer</button>
                    )}
                    {direction && arretee && peutSeRemettre(m, maintenantMs) && (
                      <button type="button" className="trc-avenir__remettre" onClick={() => remets(m)}>Remettre</button>
                    )}
                  </div>
                  {ouvert && m.texte && <p className="trc-avenir__texte">{m.texte}</p>}
                  {arretee && <p className="trc-avenir__dit">{arretDit(m.arret)}</p>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <p className="mnd-muted trc-avenir__note">
        Dedans : le rappel de la veille, le petit rappel deux jours avant et la carte d’anniversaire de l’Assistant Maison, ses autres messages
        approuvés chez Meta, les relances de facture (jamais le dimanche). La confirmation, la demande d’avis, le rappel d’échéance, la fête de
        couronne et la fin de paquet naissent d’un geste ou d’un règlement : ils paraissent dans la salle d’attente dix minutes avant de partir.
        Les réponses dans une conversation ouverte et les messages écrits à la main ne passent pas par ici.
        {direction ? '' : ' Seule la direction arrête un message.'}
      </p>
    </div>
  );
}
