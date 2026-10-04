import { useMemo, useState } from 'react';
import { Modal, Select, demande, toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { useSettings } from '../../../../shared/settings';
import { useToutesLesCaisses, type RoleDeCaisse } from '../../../../shared/finance';
import {
  ARCHIVE, JOUR_DE_DEPART, NEUVES, PIECES_D_OCTOBRE, casesDe, compteLaBascule, jourDe, planPropose,
  type Destin, type Plan, type Sorte,
} from '../../../../shared/bascule-des-caisses-pur';
import { appliqueLaBascule, annuleLaBascule, lisLesLots, resteAFaire } from './bascule';
import { downloadBackup } from '../../backup';

/* ══ LA BASCULE D'OCTOBRE, À L'ÉCRAN — 4 octobre 2026 ══════════════════
   Trois temps : la sauvegarde, ce qui va se faire (caisse par caisse, ce
   qu'elle devient, et où vont ses écritures d'octobre), puis le geste. Après
   le geste, l'écran vérifie que la synchronisation a tout gardé ; sinon il le
   dit, et la bascule se relance sans rien doubler. Faite, elle propose le
   retour en arrière. */

/** Les noms qu'une caisse existante peut prendre, et leur pièce. */
const RENOMMAGES: readonly { nom: string; role: RoleDeCaisse; horsBilan?: boolean }[] = [
  ...NEUVES.filter((n) => n.role !== 'archive').map((n) => ({ nom: n.nom, role: n.role, ...(n.horsBilan ? { horsBilan: true } : {}) })),
  { nom: 'Terrasse · MoMo MTN', role: 'terrasse' },
  { nom: 'Terrasse · Devises EUR', role: 'terrasse' },
  { nom: 'Terrasse · Devises USD', role: 'terrasse' },
  { nom: 'Foyer · Wells Fargo', role: 'foyer', horsBilan: true },
  { nom: 'Foyer · Scotiabank', role: 'foyer', horsBilan: true },
];

const valeurDe = (d: Destin): string => (d.sort === 'archiver' ? 'archiver' : d.sort === 'garder' ? `garder:${d.role}` : `renommer:${d.nom}`);
const destinDe = (v: string, ancien: Destin): Destin => {
  if (v === 'archiver') return { sort: 'archiver' };
  if (v.startsWith('garder:')) return { sort: 'garder', role: (v.slice(7) as RoleDeCaisse) || (ancien.sort !== 'archiver' ? ancien.role : 'terrasse') };
  const r = RENOMMAGES.find((x) => x.nom === v.slice(9));
  return r ? { sort: 'renommer', nom: r.nom, role: r.role, ...(r.horsBilan ? { horsBilan: true } : {}) } : { sort: 'archiver' };
};
const DIT_DU_ROLE: Record<RoleDeCaisse, string> = {
  terrasse: 'Terrasse', banque: 'Banque', mois: 'Caisse du mois', grenier: 'Grenier', cour: 'Cour', foyer: 'Foyer', archive: 'Archive',
};

export function BasculeDOctobre({ onClose }: { onClose: () => void }) {
  const { branch, currency } = useBranch();
  const [toutes] = useToutesLesCaisses();
  const [reglages] = useSettings();
  const faite = reglages.basculeDesCaisses;
  const vivantes = toutes.filter((c) => c.branchId === branch.id && !c.archiveeLe);
  const [plan, setPlan] = useState<Plan>(() => planPropose(toutes, branch.id, currency));
  const [sauvee, setSauvee] = useState(false);
  const [etat, setEtat] = useState<'' | 'en-cours' | 'complete' | 'incomplete'>('');

  /* Les écritures d'octobre de chaque caisse : celles qui demandent une pièce. */
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
  const nomsPris = new Set(Object.values(plan.destins).flatMap((d) => (d.sort === 'renommer' ? [d.nom] : [])));
  const neuvesCreees = NEUVES.filter((n) => !nomsPris.has(n.nom) && !vivantes.some((c) => c.name === n.nom));

  const poseDestin = (nom: string, v: string) => setPlan((p) => ({ ...p, destins: { ...p.destins, [nom]: destinDe(v, p.destins[nom]) } }));
  const poseOctobre = (nom: string, vers: string) => setPlan((p) => ({ ...p, octobreVers: { ...p.octobreVers, [nom]: vers } }));
  /* Où une écriture d'octobre peut aller : les pièces neuves et les noms que
     prennent les caisses renommées. */
  const destinationsOctobre = [...new Set([...PIECES_D_OCTOBRE, ...nomsPris])];

  const sauver = () => {
    try { downloadBackup(); setSauvee(true); toast('Sauvegarde téléchargée. Gardez le fichier.'); }
    catch { toast('La sauvegarde n’a pas pu se faire. Réessayez avant de basculer.'); }
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

  const basculer = async () => {
    if (!await demande({
      quoi: 'La bascule d’octobre',
      titre: 'Faire la bascule maintenant ?',
      dit: `${bilan.versLArchive} écritures d’avant octobre partent dans « ${ARCHIVE} », ${bilan.deplacees} écritures d’octobre changent de caisse.`,
      suite: 'Chaque ligne garde le nom de son ancienne caisse. Le retour en arrière reste possible depuis cet écran.',
      accepter: 'Faire la bascule',
      refuser: 'Pas maintenant',
    })) return;
    const r = appliqueLaBascule(plan, branch.id);
    if (!r.ok) { toast(r.pourquoi); return; }
    toast('Bascule faite. Vérification de la synchronisation…');
    verifier();
  };

  const revenir = async () => {
    if (!await demande({
      quoi: 'La bascule d’octobre',
      titre: 'Revenir à avant la bascule ?',
      dit: 'Chaque écriture reprend son ancienne caisse, les caisses leurs noms et leurs soldes d’ouverture.',
      suite: 'Les caisses neuves que plus rien ne nomme disparaissent ; celles qui ont reçu des écritures depuis restent.',
      accepter: 'Revenir en arrière',
      refuser: 'Garder la bascule',
      dur: true,
    })) return;
    annuleLaBascule(branch.id);
    toast('Retour fait : les caisses sont comme avant la bascule.');
    onClose();
  };

  const ligne = { display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1.4fr)', gap: 10, alignItems: 'center', padding: '9px 0', borderTop: '1px solid var(--hairline)' } as const;

  return (
    <Modal title="La bascule d’octobre" onClose={onClose} width={720}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {faite && etat === '' ? (
          <>
            <div className="mnd-muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
              La bascule a été faite le {new Date(faite.le).toLocaleString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}.
              Les caisses comptent depuis octobre 2026 ; tout l’avant est dans « {ARCHIVE} », chaque ligne avec le nom de son ancienne caisse.
            </div>
            {bilan.versLArchive + bilan.deplacees > 0 && (
              <div style={{ fontSize: 13, color: 'var(--copper-700)' }}>
                Elle n’est pas complète : {bilan.versLArchive + bilan.deplacees} écritures n’ont pas encore leur nouvelle caisse.
                <button className="mnd-btn" style={{ marginLeft: 10 }} onClick={() => { const r = appliqueLaBascule(plan, branch.id); if (r.ok) verifier(); else toast(r.pourquoi); }}>Relancer la bascule</button>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <button className="mnd-btn mnd-btn--ghost" style={{ color: 'var(--trv-error, #8E3B26)' }} onClick={() => void revenir()}>Revenir à avant la bascule</button>
              <button className="mnd-btn" onClick={onClose}>Fermer</button>
            </div>
          </>
        ) : etat !== '' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 14, lineHeight: 1.6 }}>
            {etat === 'en-cours' && <div>La synchronisation envoie les écritures, par tranches. Un instant…</div>}
            {etat === 'complete' && <div><b>La bascule est complète.</b> Toutes les écritures portent leur nouvelle caisse, et la synchronisation les a gardées.</div>}
            {etat === 'incomplete' && (
              <div style={{ color: 'var(--copper-700)' }}>
                Une partie des écritures n’a pas gardé sa nouvelle caisse (la synchronisation s’est réalignée sur le serveur).
                Rechargez la page (F5), revenez ici et relancez la bascule : elle reprend ce qui manque, sans rien doubler.
              </div>
            )}
            <button className="mnd-btn" style={{ alignSelf: 'flex-end' }} onClick={onClose} disabled={etat === 'en-cours'}>Fermer</button>
          </div>
        ) : (
          <>
            <div className="mnd-muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
              Les écritures datées d’avant le 1er octobre 2026 partent toutes dans « {ARCHIVE} », chacune avec le nom de sa caisse d’origine.
              Les caisses sont rangées en sept pièces (le manuel des caisses). Faites-la avec les autres appareils fermés ou synchronisés.
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className={sauvee ? 'mnd-btn mnd-btn--ghost' : 'mnd-btn'} onClick={sauver}>1. Télécharger la sauvegarde</button>
              <span className="mnd-muted" style={{ fontSize: 12 }}>{sauvee ? 'Sauvegarde faite.' : 'Obligatoire avant la bascule.'}</span>
            </div>

            <div>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 19, color: 'var(--color-indigo)', marginBottom: 4 }}>2. Ce que devient chaque caisse</div>
              {vivantes.map((c) => {
                const d = plan.destins[c.name] ?? { sort: 'archiver' as const };
                const oct = octobreParCaisse[c.name] ?? 0;
                return (
                  <div key={c.id} style={ligne}>
                    <span style={{ fontSize: 14 }}>
                      {c.glyph} {c.name}
                      {oct > 0 && <span className="mnd-muted" style={{ display: 'block', fontSize: 11.5 }}>{oct} écriture{oct > 1 ? 's' : ''} d’octobre</span>}
                    </span>
                    <span style={{ display: 'grid', gap: 6 }}>
                      <Select aria-label={`Ce que devient ${c.name}`} value={valeurDe(d)} onChange={(e) => poseDestin(c.name, e.target.value)} style={{ fontSize: 12.5 }}>
                        <option value="archiver">Ranger : son histoire va à l’archive</option>
                        {(['terrasse', 'banque', 'mois', 'grenier', 'cour', 'foyer'] as RoleDeCaisse[]).map((r) => (
                          <option key={r} value={`garder:${r}`}>Garder son nom, pièce {DIT_DU_ROLE[r]}</option>
                        ))}
                        {RENOMMAGES.map((x) => <option key={x.nom} value={`renommer:${x.nom}`}>Devient « {x.nom} »</option>)}
                      </Select>
                      {d.sort === 'archiver' && oct > 0 && (
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
              <b>3. En résumé.</b> {bilan.versLArchive} écritures d’avant octobre vers l’archive · {bilan.deplacees} écritures d’octobre changent de caisse.
              {neuvesCreees.length > 0 && <> Caisses créées : {neuvesCreees.map((n) => n.nom).join(', ')}.</>}
              {' '}Tous les soldes d’ouverture repartent de 0, le coffre aussi. Les cartes cadeaux payées gardent leur caisse (la base la fige) ; leur argent bascule avec leur avoir.
              {manquent.length > 0 && <span style={{ display: 'block', color: 'var(--copper-700)' }}>Il reste à choisir la pièce des écritures d’octobre de : {manquent.join(', ')}.</span>}
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button className="mnd-btn mnd-btn--ghost" onClick={onClose}>Annuler</button>
              <button className="mnd-btn" disabled={!sauvee || manquent.length > 0} onClick={() => void basculer()}>
                {faite ? 'Relancer la bascule' : 'Faire la bascule'}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
