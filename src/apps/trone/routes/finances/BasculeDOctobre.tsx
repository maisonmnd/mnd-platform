import { useMemo, useState } from 'react';
import { Modal, Select, demande, toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { useSettings } from '../../../../shared/settings';
import { useToutesLesCaisses, type RoleDeCaisse } from '../../../../shared/finance';
import {
  JOUR_DE_DEPART, NEUVES, PIECES_D_OCTOBRE, casesDe, compteLaBascule, jourDe, planPropose, rolesTenus,
  type Destin, type Plan, type Sorte,
} from '../../../../shared/bascule-des-caisses-pur';
import { appliqueLaBascule, annuleLaBascule, lisLesLots, resteAFaire } from './bascule';
import { downloadBackup } from '../../backup';

/* ══ OUVRIR OCTOBRE, À L'ÉCRAN — 4 octobre 2026 ════════════════════════
   « Je ne veux pas que les caisses rangées disparaissent, parce que je mets
   toujours de l'ordre dans les anciens points. […] Mais en attendant, bien
   continuer la suite à partir du 1er octobre » (Yéman).

   Trois temps : la sauvegarde, ce que devient chaque caisse (ancienne, avec
   ou sans suite, ou gardée dans une pièce), le geste. Rien de ce qui précède
   le 1er octobre ne bouge. Après le geste, l'écran vérifie que la
   synchronisation a tout gardé ; sinon il le dit, et la relance reprend ce
   qui manque. Faite, elle propose le retour en arrière. Ranger l'avant dans
   une seule archive viendra plus tard, quand elle le dira. */

/** Les suites possibles d'une caisse ancienne, et leur pièce. */
const SUITES: readonly { nom: string; role: RoleDeCaisse; horsBilan?: boolean }[] = [
  { nom: 'Terrasse · MoMo MTN', role: 'terrasse' },
  { nom: 'Terrasse · Devises EUR', role: 'terrasse' },
  { nom: 'Terrasse · Devises USD', role: 'terrasse' },
  { nom: 'Foyer · Wells Fargo', role: 'foyer', horsBilan: true },
  { nom: 'Foyer · Scotiabank', role: 'foyer', horsBilan: true },
];
const DIT_DU_ROLE: Record<RoleDeCaisse, string> = {
  terrasse: 'Terrasse', banque: 'Banque', mois: 'Caisse du mois', grenier: 'Grenier', cour: 'Cour', foyer: 'Foyer', archive: 'Archive',
};

const valeurDe = (d: Destin): string => (d.sort === 'ancienne' ? 'ancienne' : d.sort === 'garder' ? `garder:${d.role}` : `suite:${d.nom}`);
const destinDe = (v: string): Destin => {
  if (v.startsWith('garder:')) return { sort: 'garder', role: v.slice(7) as RoleDeCaisse };
  const s = SUITES.find((x) => x.nom === v.slice(6));
  if (v.startsWith('suite:') && s) return { sort: 'suite', nom: s.nom, role: s.role, ...(s.horsBilan ? { horsBilan: true } : {}) };
  return { sort: 'ancienne' };
};

export function BasculeDOctobre({ onClose }: { onClose: () => void }) {
  const { branch, currency } = useBranch();
  const [toutes] = useToutesLesCaisses();
  const [reglages] = useSettings();
  const faite = reglages.basculeDesCaisses;
  const lesSiennes = toutes.filter((c) => c.branchId === branch.id && !c.archiveeLe && !c.creeeParLaBascule);
  const [plan, setPlan] = useState<Plan>(() => planPropose(toutes.filter((c) => !c.creeeParLaBascule), branch.id, currency));
  const [sauvee, setSauvee] = useState(false);
  const [etat, setEtat] = useState<'' | 'en-cours' | 'complete' | 'incomplete'>('');

  /* Les écritures d'octobre de chaque caisse. */
  const octobreParCaisse = useMemo(() => {
    const n: Record<string, number> = {};
    for (const [sorte, liste] of Object.entries(lisLesLots(branch.id)) as [Sorte, unknown[]][]) {
      for (const e of liste) for (const c of casesDe(sorte, e)) {
        const j = jourDe(c.date);
        if (typeof c.nom === 'string' && c.nom && j && j >= JOUR_DE_DEPART) n[c.nom] = (n[c.nom] ?? 0) + 1;
      }
    }
    return n;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch.id, toutes]);
  const bilan = useMemo(() => compteLaBascule(plan, lisLesLots(branch.id)), [plan, branch.id]);
  const manquent = Object.keys(bilan.manquantes);
  const suitesChoisies = Object.values(plan.destins).flatMap((d) => (d.sort === 'suite' ? [d.nom] : []));
  const tenues = rolesTenus(plan);
  const neuves = [...NEUVES.filter((n) => n.role !== 'archive' && (n.role === 'terrasse' || !tenues.has(n.role))).map((n) => n.nom), ...suitesChoisies]
    .filter((n) => !toutes.some((c) => c.branchId === branch.id && c.name === n));
  /* Où une écriture d'octobre d'une ancienne peut aller : les pièces neuves
     et les suites choisies. */
  const gardees = Object.entries(plan.destins).flatMap(([nom, d]) => (d.sort === 'garder' ? [nom] : []));
  const destinationsOctobre = [...new Set([
    ...PIECES_D_OCTOBRE.filter((n) => { const r = NEUVES.find((x) => x.nom === n)?.role; return !r || r === 'terrasse' || !tenues.has(r); }),
    ...suitesChoisies, ...gardees,
  ])];

  const poseDestin = (nom: string, v: string) => setPlan((p) => ({ ...p, destins: { ...p.destins, [nom]: destinDe(v) } }));
  const poseOctobre = (nom: string, vers: string) => setPlan((p) => ({ ...p, octobreVers: { ...p.octobreVers, [nom]: vers } }));

  const sauver = () => {
    try { downloadBackup(); setSauvee(true); toast('Sauvegarde téléchargée. Gardez le fichier.'); }
    catch { toast('La sauvegarde n’a pas pu se faire. Réessayez avant d’ouvrir octobre.'); }
  };

  const verifier = () => {
    setEtat('en-cours');
    /* La synchronisation envoie par tranches ; un garde-fou peut défaire une
       table. On relit après l'envoi : ce qui reste à faire dit la vérité. */
    window.setTimeout(() => {
      const r = resteAFaire(plan, branch.id);
      setEtat(r.versLArchive + r.deplacees === 0 ? 'complete' : 'incomplete');
    }, 9000);
  };

  const ouvrir = async () => {
    if (!await demande({
      quoi: 'Ouvrir octobre',
      titre: 'Ouvrir octobre maintenant ?',
      dit: `${bilan.deplacees} écriture${bilan.deplacees > 1 ? 's' : ''} d’octobre change${bilan.deplacees > 1 ? 'nt' : ''} de caisse. Rien de ce qui précède le 1er octobre ne bouge.`,
      suite: 'Les anciennes caisses restent visibles partout, avec tout leur passé. Le retour en arrière reste possible depuis cet écran.',
      accepter: 'Ouvrir octobre',
      refuser: 'Pas maintenant',
    })) return;
    const r = appliqueLaBascule(plan, branch.id);
    if (!r.ok) { toast(r.pourquoi); return; }
    toast('Octobre est ouvert. Vérification de la synchronisation…');
    verifier();
  };

  const revenir = async () => {
    if (!await demande({
      quoi: 'Ouvrir octobre',
      titre: 'Revenir à avant ?',
      dit: 'Chaque écriture d’octobre reprend son ancienne caisse, les anciennes redeviennent des caisses ordinaires.',
      suite: 'Les caisses neuves que plus rien ne nomme disparaissent ; celles qui ont reçu des écritures depuis restent.',
      accepter: 'Revenir en arrière',
      refuser: 'Garder octobre ouvert',
      dur: true,
    })) return;
    annuleLaBascule(branch.id);
    toast('Retour fait : les caisses sont comme avant.');
    onClose();
  };

  const ligne = { display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1.4fr)', gap: 10, alignItems: 'center', padding: '9px 0', borderTop: '1px solid var(--hairline)' } as const;

  return (
    <Modal title="Ouvrir octobre" onClose={onClose} width={720}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {faite && etat === '' ? (
          <>
            <div className="mnd-muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
              Octobre est ouvert depuis le {new Date(faite.le).toLocaleString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}.
              Les pièces neuves comptent depuis le 1er octobre 2026 ; les anciennes caisses gardent tout leur passé pour que vous finissiez le travail jusqu’au 30 septembre.
            </div>
            {bilan.deplacees > 0 && (
              <div style={{ fontSize: 13, color: 'var(--copper-700)' }}>
                {bilan.deplacees} écriture{bilan.deplacees > 1 ? 's' : ''} d’octobre {bilan.deplacees > 1 ? 'sont' : 'est'} encore sur une ancienne caisse.
                <button className="mnd-btn" style={{ marginLeft: 10 }} onClick={() => { const r = appliqueLaBascule(plan, branch.id); if (r.ok) verifier(); else toast(r.pourquoi); }}>Les déplacer</button>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <button className="mnd-btn mnd-btn--ghost" style={{ color: 'var(--trv-error, #8E3B26)' }} onClick={() => void revenir()}>Revenir à avant</button>
              <button className="mnd-btn" onClick={onClose}>Fermer</button>
            </div>
          </>
        ) : etat !== '' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 14, lineHeight: 1.6 }}>
            {etat === 'en-cours' && <div>La synchronisation envoie les écritures, par tranches. Un instant…</div>}
            {etat === 'complete' && <div><b>Octobre est ouvert.</b> Les écritures d’octobre sont dans leurs nouvelles caisses, et la synchronisation les a gardées.</div>}
            {etat === 'incomplete' && (
              <div style={{ color: 'var(--copper-700)' }}>
                Une partie des écritures n’a pas gardé sa nouvelle caisse (la synchronisation s’est réalignée sur le serveur).
                Rechargez la page (F5), revenez ici : un bouton déplace ce qui manque, sans rien doubler.
              </div>
            )}
            <button className="mnd-btn" style={{ alignSelf: 'flex-end' }} onClick={onClose} disabled={etat === 'en-cours'}>Fermer</button>
          </div>
        ) : (
          <>
            <div className="mnd-muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
              Les pièces neuves naissent à 0 au 1er octobre 2026. Vos caisses d’avant deviennent <b>anciennes</b> : elles restent visibles partout,
              avec tout leur passé, pour finir le travail jusqu’au 30 septembre. Seules les écritures datées du 1er octobre ou après changent de caisse.
              Faites-le avec les autres appareils fermés ou synchronisés.
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className={sauvee ? 'mnd-btn mnd-btn--ghost' : 'mnd-btn'} onClick={sauver}>1. Télécharger la sauvegarde</button>
              <span className="mnd-muted" style={{ fontSize: 12 }}>{sauvee ? 'Sauvegarde faite.' : 'Obligatoire avant d’ouvrir octobre.'}</span>
            </div>

            <div>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 19, color: 'var(--color-indigo)', marginBottom: 4 }}>2. Ce que devient chaque caisse</div>
              {lesSiennes.map((c) => {
                const d = plan.destins[c.name] ?? { sort: 'ancienne' as const };
                const oct = octobreParCaisse[c.name] ?? 0;
                return (
                  <div key={c.id} style={ligne}>
                    <span style={{ fontSize: 14 }}>
                      {c.glyph} {c.name}
                      {oct > 0 && <span className="mnd-muted" style={{ display: 'block', fontSize: 11.5 }}>{oct} écriture{oct > 1 ? 's' : ''} d’octobre</span>}
                    </span>
                    <span style={{ display: 'grid', gap: 6 }}>
                      <Select aria-label={`Ce que devient ${c.name}`} value={valeurDe(d)} onChange={(e) => poseDestin(c.name, e.target.value)} style={{ fontSize: 12.5 }}>
                        <option value="ancienne">Ancienne : elle garde son passé</option>
                        {SUITES.map((x) => <option key={x.nom} value={`suite:${x.nom}`}>Ancienne, sa suite s’appelle « {x.nom} »</option>)}
                        {(['terrasse', 'banque', 'mois', 'grenier', 'cour', 'foyer'] as RoleDeCaisse[]).map((r) => (
                          <option key={r} value={`garder:${r}`}>Elle continue telle quelle, pièce {DIT_DU_ROLE[r]}</option>
                        ))}
                      </Select>
                      {d.sort === 'ancienne' && oct > 0 && (
                        <Select aria-label={`Où vont les écritures d'octobre de ${c.name}`} value={plan.octobreVers[c.name] ?? ''} onChange={(e) => poseOctobre(c.name, e.target.value)} style={{ fontSize: 12.5, borderColor: plan.octobreVers[c.name] ? undefined : 'var(--color-copper)' }}>
                          <option value="">Ses écritures d’octobre vont vers…</option>
                          {destinationsOctobre.map((n) => <option key={n} value={n}>{n}</option>)}
                        </Select>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>

            <div style={{ fontSize: 13, lineHeight: 1.6, background: 'var(--surface-sunken, rgba(185,122,74,.08))', padding: '10px 12px', borderRadius: 3 }}>
              <b>3. En résumé.</b> {bilan.deplacees} écriture{bilan.deplacees > 1 ? 's' : ''} d’octobre change{bilan.deplacees > 1 ? 'nt' : ''} de caisse ; rien d’avant octobre ne bouge.
              {neuves.length > 0 && <> Caisses créées, à 0 : {neuves.join(', ')}.</>}
              {' '}Le coffre repart du 1er octobre. Les cartes cadeaux payées gardent leur caisse (la base la fige).
              {manquent.length > 0 && <span style={{ display: 'block', color: 'var(--copper-700)' }}>Il reste à choisir où vont les écritures d’octobre de : {manquent.join(', ')}.</span>}
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button className="mnd-btn mnd-btn--ghost" onClick={onClose}>Annuler</button>
              <button className="mnd-btn" disabled={!sauvee || manquent.length > 0} onClick={() => void ouvrir()}>Ouvrir octobre</button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
