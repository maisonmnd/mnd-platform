import { useState } from 'react';
import { demande, toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { useToutesLesCaisses } from '../../../../shared/finance';
import { FUSION_DECIDEE } from '../../../../shared/decisions-des-caisses-pur';
import { TRI_DU_19_OCTOBRE, leTriEstFait, lesCaissesDuPlan, nomsDejaPris, renommagesDuPlan } from '../../../../shared/tri-des-caisses-pur';
import { leNomEstFait } from '../../../../shared/caisses-au-nom-pur';
import { useEstDirection } from '../_vie';
import { downloadBackup } from '../../backup';
import { useCaisses } from './tiroirs';
import { monthKey, todayISO } from './_shared';
import { lisLesLots } from './bascule';
import { appliqueLeTri, defaisLeTri, resteDuTri } from './tri';

/* ══ LE TRI DES CAISSES — 19 octobre 2026 ═══════════════════════════════
   Ses choix sur la page de tri (« Tout me va », puis « construis ») : ce
   panneau dit ce qui va changer, caisse par caisse, sous les vrais noms ; la
   sauvegarde d'abord, puis un geste ; on relit ensuite ce qui nomme encore
   une caisse qui a changé. Il se défait d'un geste. */
export function TriDesCaisses() {
  const { branch, currency } = useBranch();
  const [toutes] = useToutesLesCaisses();
  const estDirection = useEstDirection();
  const { boxBalance } = useCaisses(monthKey(todayISO()));
  const [sauvee, setSauvee] = useState(false);
  const [verdict, setVerdict] = useState<string | null>(null);
  if (!estDirection) return null;

  const plan = TRI_DU_19_OCTOBRE;
  const fait = leTriEstFait(toutes, branch.id, plan);
  /* LES CAISSES AU NOM DES PAIEMENTS (21 octobre 2026) font le tri qui
     attend, dans leur propre geste : ce panneau ne le propose plus. Leur
     geste fait, le tri ne se défait plus seul (il renommerait des caisses
     qui ont changé de nom depuis) : le retour passe par leur « Défaire ». */
  if (!fait || leNomEstFait(toutes, branch.id)) return null;
  const boite = { border: '1px solid var(--copper-300)', background: 'var(--copper-50)', borderRadius: 'var(--radius-md)', padding: '14px 16px', margin: '14px 0', display: 'grid', gap: 10 } as const;
  const petit = { fontFamily: 'var(--font-sans)', fontSize: 12.5, lineHeight: 1.55, color: 'var(--ink)' } as const;

  if (fait) {
    return (
      <div style={{ ...petit, margin: '10px 0', color: 'var(--ink-soft)' }} data-tri="fait">
        Le tri des caisses du 19 octobre 2026 est fait.{verdict ? ` ${verdict}` : ''}{' '}
        <button
          type="button"
          className="tre-link-btn"
          onClick={async () => {
            if (!await demande({
              quoi: 'Les caisses',
              titre: 'Défaire le tri des caisses ?',
              dit: 'Les noms d’avant reviennent, les virements du tri s’effacent, les caisses rangées par le tri reviennent, et la caisse fondue dans le tiroir reprend ses écritures. La fusion de Reprise 2025 garde son propre retour.',
              accepter: 'Défaire',
              refuser: 'Garder le tri',
            })) return;
            defaisLeTri(branch.id, plan);
            setVerdict(null);
            toast('Le tri est défait.');
          }}
        >
          Défaire
        </button>
      </div>
    );
  }

  const { trouvees, manquent } = lesCaissesDuPlan(toutes, branch.id, plan);
  if (trouvees.size === 0) return null;
  const pris = nomsDejaPris(toutes, lisLesLots(branch.id), branch.id, plan);
  const renommages = renommagesDuPlan(toutes, branch.id, plan);
  const recoit = trouvees.get(plan.vider.vers);
  const aVider = plan.vider.de.map((id) => trouvees.get(id)).filter((b): b is NonNullable<typeof b> => !!b);
  const fondue = trouvees.get(plan.fondre.de);
  const tiroir = plan.retouches.find((r) => r.id === plan.fondre.vers)?.nom ?? trouvees.get(plan.fondre.vers)?.name;
  const epargne = plan.retouches.filter((r) => r.horsEncaissement && trouvees.has(r.id) && !trouvees.get(r.id)!.horsEncaissement).map((r) => trouvees.get(r.id)!.name);
  const dejaAPart = plan.retouches.filter((r) => r.horsEncaissement && trouvees.has(r.id) && trouvees.get(r.id)!.horsEncaissement).map((r) => trouvees.get(r.id)!.name);
  const reprise = toutes.find((b) => b.branchId === branch.id && !b.archiveeLe && FUSION_DECIDEE.de.test(b.name));

  const appliquer = () => {
    const r = appliqueLeTri(branch.id, boxBalance, todayISO(), new Date().toISOString(), plan);
    if (!r.ok) { toast(r.raison); return; }
    toast(`Le tri est fait : ${r.fait.join(', ')}.`);
    setVerdict('Je vérifie que tout est passé…');
    /* La synchronisation envoie par tranches ; on relit après l'envoi. */
    window.setTimeout(() => {
      const reste = resteDuTri(branch.id, plan);
      setVerdict(reste === 0
        ? 'Vérifié : plus aucune écriture ne nomme une caisse qui a changé.'
        : `${reste} écriture${reste > 1 ? 's' : ''} nomme${reste > 1 ? 'nt' : ''} encore un ancien nom : défaites le tri et relancez-le.`);
    }, 9000);
  };

  return (
    <section style={boite} data-tri="a-faire">
      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--color-indigo)' }}>Le tri des caisses</div>
      <div style={petit}>Vos choix du 19 octobre 2026. Voici ce qui change :</div>
      <ul style={{ ...petit, margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
        {renommages.map((r) => <li key={r.de}>« {r.de} » devient « {r.vers} ».</li>)}
        {recoit && aVider.map((b) => {
          const s = Math.round(boxBalance(b.name));
          return (
            <li key={b.id}>
              « {b.name} » {s ? <>passe son solde ({fmtMoney(s, currency)}) dans « {recoit.name} »</> : <>(solde nul)</>}, puis elle est rangée.
            </li>
          );
        })}
        {fondue && tiroir && <li>« {fondue.name} » se fond dans « {tiroir} », avec son histoire et son solde.</li>}
        {epargne.length > 0 && <li>Ne paraissent plus au comptoir, pour personne : {epargne.map((n) => `« ${n} »`).join(', ')}.</li>}
        {dejaAPart.length > 0 && <li>Déjà à part, et plus jamais au comptoir : {dejaAPart.map((n) => `« ${n} »`).join(', ')}.</li>}
        {reprise && <li>« {reprise.name} » se fond dans « {FUSION_DECIDEE.vers} » (décidé le 17 octobre 2026).</li>}
        <li>Au rendez-vous : la carte et le virement se choisissent à chaque fois ; corriger la caisse d’un versement ne montre plus que le comptoir.</li>
      </ul>
      {manquent.length > 0 && (
        <div style={{ ...petit, color: 'var(--copper-700)' }}>
          {manquent.length} caisse{manquent.length > 1 ? 's' : ''} du tri introuvable{manquent.length > 1 ? 's' : ''} (déjà rangée{manquent.length > 1 ? 's' : ''} ou effacée{manquent.length > 1 ? 's' : ''}) : {manquent.length > 1 ? 'leurs pas sont sautés' : 'son pas est sauté'}.
        </div>
      )}
      {pris.length > 0 && (
        <div role="alert" style={{ ...petit, color: 'var(--color-brique, #96412E)' }}>
          « {pris.join(' », « ')} » existe déjà : renommez d’abord cette caisse, le tri ne renomme jamais vers un nom pris.
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          type="button"
          className={sauvee ? 'mnd-btn mnd-btn--ghost' : 'mnd-btn'}
          onClick={() => {
            try { downloadBackup(); setSauvee(true); toast('Sauvegarde téléchargée. Gardez le fichier.'); } catch { toast('La sauvegarde n’a pas pu se faire. Réessayez.'); }
          }}
        >
          1. Télécharger la sauvegarde
        </button>
        <button type="button" className="mnd-btn mnd-btn--copper" disabled={!sauvee || pris.length > 0} onClick={appliquer}>
          2. Appliquer le tri
        </button>
        {!sauvee && <span className="mnd-muted" style={{ fontSize: 12 }}>La sauvegarde d’abord.</span>}
      </div>
      {verdict && <div style={petit} aria-live="polite">{verdict}</div>}
    </section>
  );
}
