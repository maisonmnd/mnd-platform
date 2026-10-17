import { useState } from 'react';
import { demande, toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { useToutesLesCaisses } from '../../../../shared/finance';
import { FUSION_DECIDEE } from '../../../../shared/decisions-des-caisses-pur';
import { useEstDirection } from '../_vie';
import { downloadBackup } from '../../backup';
import { casesDeLaCaisse, defaisLaFusion, fondsLaCaisse } from './fusion';

/* ══ LA FUSION DÉCIDÉE — 17 octobre 2026 ═════════════════════════════════
   « Reprise 2025 » : « tout fondre dans Années passées » (Yéman). Une réécriture
   de l'histoire ne part jamais seule : la direction la lance, d'un geste,
   après la sauvegarde (comme la bascule d'octobre). On relit ensuite ce qui
   nomme encore l'ancienne caisse : 0, c'est fait. Elle se défait d'un geste. */
export function FusionDesCaisses() {
  const { branch, currency } = useBranch();
  const [toutes] = useToutesLesCaisses();
  const estDirection = useEstDirection();
  const [sauvee, setSauvee] = useState(false);
  const [verdict, setVerdict] = useState<string | null>(null);
  if (!estDirection) return null;

  const aFondre = toutes.find((b) => b.branchId === branch.id && !b.archiveeLe && FUSION_DECIDEE.de.test(b.name));
  const fondue = toutes.find((b) => b.branchId === branch.id && !!b.fondueDans && FUSION_DECIDEE.de.test(b.name));
  if (!aFondre && !fondue) return null;

  const boite = { border: '1px solid var(--copper-300)', background: 'var(--copper-50)', borderRadius: 'var(--radius-md)', padding: '14px 16px', margin: '14px 0', display: 'grid', gap: 10 } as const;
  const petit = { fontFamily: 'var(--font-sans)', fontSize: 12.5, lineHeight: 1.55, color: 'var(--ink)' } as const;

  if (aFondre) {
    const n = casesDeLaCaisse(branch.id, aFondre.name);
    const vers = FUSION_DECIDEE.vers;
    const fondre = () => {
      fondsLaCaisse(branch.id, aFondre.name, vers);
      toast(`« ${aFondre.name} » fondue dans « ${vers} ».`);
      setVerdict('Je vérifie que tout est passé…');
      /* La synchronisation envoie par tranches ; on relit après l'envoi. */
      window.setTimeout(() => {
        const reste = casesDeLaCaisse(branch.id, aFondre.name);
        setVerdict(reste === 0
          ? `Vérifié : plus aucune écriture ne nomme « ${aFondre.name} ».`
          : `${reste} écriture${reste > 1 ? 's' : ''} la nomme${reste > 1 ? 'nt' : ''} encore : relancez la fusion.`);
      }, 9000);
    };
    return (
      <section style={boite} data-fusion="a-faire">
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--color-indigo)' }}>
          Fondre « {aFondre.name} » dans « {vers} »
        </div>
        <div style={petit}>
          Décidé le 17 octobre. {n} écriture{n > 1 ? 's' : ''} passer{n > 1 ? 'ont' : 'a'} à « {vers} »
          {(aFondre.openingXof ?? 0) !== 0 ? `, avec son solde d’ouverture (${fmtMoney(aFondre.openingXof, currency)})` : ''}, puis
          « {aFondre.name} » sera rangée. Chaque écriture garde son ancien nom à côté : la fusion se défait d’un geste.
        </div>
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
          <button type="button" className="mnd-btn mnd-btn--copper" disabled={!sauvee} onClick={fondre}>
            2. Fondre maintenant
          </button>
          {!sauvee && <span className="mnd-muted" style={{ fontSize: 12 }}>La sauvegarde d’abord.</span>}
        </div>
        {verdict && <div style={petit} aria-live="polite">{verdict}</div>}
      </section>
    );
  }

  /* Fondue : une ligne discrète, et le retour possible. */
  return (
    <div style={{ ...petit, margin: '10px 0', color: 'var(--ink-soft)' }} data-fusion="faite">
      « {fondue!.name} » est fondue dans « {fondue!.fondueDans} »{fondue!.archiveeLe ? ` depuis le ${new Date(fondue!.archiveeLe).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}.
      {verdict ? ` ${verdict}` : ''}{' '}
      <button
        type="button"
        className="tre-link-btn"
        onClick={async () => {
          if (!await demande({
            quoi: 'Les caisses',
            titre: `Défaire la fusion de « ${fondue!.name} » ?`,
            dit: `Ses écritures reviennent sous son nom, avec son solde d’ouverture, et « ${fondue!.fondueDans} » les rend.`,
            accepter: 'Défaire',
            refuser: 'Garder la fusion',
          })) return;
          defaisLaFusion(branch.id, fondue!.name);
          toast(`« ${fondue!.name} » est revenue.`);
        }}
      >
        Défaire
      </button>
    </div>
  );
}
