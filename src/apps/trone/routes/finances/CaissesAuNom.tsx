import { useState } from 'react';
import { demande, toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { useToutesLesCaisses } from '../../../../shared/finance';
import { CAISSES_DES_PAIEMENTS, caissesDesCaissiers, laCaisseDuPaiement, type FamilleDeCaisse } from '../../../../shared/caisses-des-caissiers-pur';
import { leNomEstFait, nomsDejaPrisAuNom, renommagesAuNom, rienAFaireAuNom } from '../../../../shared/caisses-au-nom-pur';
import { TRI_DU_19_OCTOBRE, lesCaissesDuPlan, leTriEstFait, renommagesDuPlan } from '../../../../shared/tri-des-caisses-pur';
import { useEstDirection } from '../_vie';
import { downloadBackup } from '../../backup';
import { useCaisses } from './tiroirs';
import { monthKey, todayISO } from './_shared';
import { lisLesLots } from './bascule';
import { appliqueLeNom, defaisLeNom, resteDuNom } from './au-nom';

/* ══ LES CAISSES AU NOM DES PAIEMENTS — 21 octobre 2026 ══════════════════
   « Les caisses doivent porter les mêmes noms que les paiements » (Yéman) ;
   au sélecteur : « Les renommer », leur solde et leur historique suivant le
   nom ; « une seule Espèces ». Ce panneau dit ce qui va changer, caisse par
   caisse, sous les vrais noms ; la sauvegarde d'abord, puis un geste ; on
   relit ensuite ce qui nomme encore un nom d'avant. Il se défait d'un geste,
   le tri du 19 octobre compris s'il passe avec lui. */
const NEES: readonly FamilleDeCaisse[] = ['carte', 'momoPrive', 'autre'];

export function CaissesAuNom() {
  const { branch, currency } = useBranch();
  const [toutes] = useToutesLesCaisses();
  const estDirection = useEstDirection();
  const { boxBalance } = useCaisses(monthKey(todayISO()));
  const [sauvee, setSauvee] = useState(false);
  const [verdict, setVerdict] = useState<string | null>(null);
  if (!estDirection) return null;

  const petit = { fontFamily: 'var(--font-sans)', fontSize: 12.5, lineHeight: 1.55, color: 'var(--ink)' } as const;
  const boite = { border: '1px solid var(--copper-300)', background: 'var(--copper-50)', borderRadius: 'var(--radius-md)', padding: '14px 16px', margin: '14px 0', display: 'grid', gap: 10 } as const;

  if (leNomEstFait(toutes, branch.id)) {
    return (
      <div style={{ ...petit, margin: '10px 0', color: 'var(--ink-soft)' }} data-au-nom="fait">
        Les caisses portent le nom des paiements.{verdict ? ` ${verdict}` : ''}{' '}
        <button
          type="button"
          className="tre-link-btn"
          onClick={async () => {
            if (!await demande({
              quoi: 'Les caisses',
              titre: 'Rendre aux caisses leurs noms d’avant ?',
              dit: 'Les noms d’avant reviennent sur les caisses et sur toutes leurs écritures, les caisses des caissiers reviennent avec leur solde, et le tri du 19 octobre 2026 se défait s’il était passé avec ce geste. Les caisses nées (Carte, MoMo Privé, Autres) restent.',
              accepter: 'Défaire',
              refuser: 'Garder les noms',
            })) return;
            defaisLeNom(branch.id);
            setVerdict(null);
            toast('Les caisses ont repris leurs noms d’avant.');
          }}
        >
          Défaire
        </button>
      </div>
    );
  }

  const triAttend = !leTriEstFait(toutes, branch.id) && lesCaissesDuPlan(toutes, branch.id).trouvees.size > 0;
  if (!triAttend && rienAFaireAuNom(toutes, branch.id) && NEES.every((f) => laCaisseDuPaiement(toutes, branch.id, f))) return null;

  /* Ce que le tri ferait d'abord, puis ce que le geste renomme : les noms
     sont lus comme ils seront après le tri (le tiroir s'appelle alors
     « Tiroir espèces »), pour que l'écran dise le vrai chemin. */
  const renommagesDuTri = triAttend ? renommagesDuPlan(toutes, branch.id) : [];
  const renommages = renommagesAuNom(toutes, branch.id).map((r) => {
    const parLeTri = triAttend ? TRI_DU_19_OCTOBRE.retouches.find((t) => t.id === r.id)?.nom : undefined;
    return { ...r, de: parLeTri ?? r.de };
  });
  const pris = nomsDejaPrisAuNom(toutes, lisLesLots(branch.id), branch.id, renommages);
  const caissiers = caissesDesCaissiers(toutes, branch.id);
  const tiroir = laCaisseDuPaiement(toutes, branch.id, 'especes');
  const nees = NEES.filter((f) => !laCaisseDuPaiement(toutes, branch.id, f)).map((f) => CAISSES_DES_PAIEMENTS[f].nom);

  const appliquer = () => {
    const r = appliqueLeNom(branch.id, boxBalance, todayISO());
    if (!r.ok) { toast(r.raison); return; }
    toast(`C’est fait : ${r.fait.join(', ')}.`);
    setVerdict('Je vérifie que tout est passé…');
    /* La synchronisation envoie par tranches ; on relit après l'envoi. */
    window.setTimeout(() => {
      const reste = resteDuNom(branch.id);
      setVerdict(reste === 0
        ? 'Vérifié : plus aucune écriture ne nomme un nom d’avant.'
        : `${reste} écriture${reste > 1 ? 's' : ''} nomme${reste > 1 ? 'nt' : ''} encore un nom d’avant : défaites le geste et relancez-le.`);
    }, 9000);
  };

  return (
    <section style={boite} data-au-nom="a-faire">
      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--color-indigo)' }}>Les caisses au nom des paiements</div>
      <div style={petit}>Votre décision du 21 octobre 2026 : chaque paiement a sa caisse, à son nom, choisie d’office. Voici ce qui change :</div>
      <ul style={{ ...petit, margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
        {triAttend && (
          <li>
            D’abord le tri du 19 octobre 2026, qui n’avait pas été appliqué
            {renommagesDuTri.length > 0 && <> ({renommagesDuTri.map((t) => `« ${t.de} » devient « ${t.vers} »`).join(', ')})</>}
            , avec ses virements et ses fusions.
          </li>
        )}
        {caissiers.map((b) => {
          const s = Math.round(boxBalance(b.name));
          return (
            <li key={b.id}>
              « {b.name} » {s ? <>passe son solde ({fmtMoney(s, currency)}) dans les espèces</> : <>(solde nul)</>}, puis elle est rangée : une seule caisse des espèces pour toute la Maison.
            </li>
          );
        })}
        {renommages.map((r) => <li key={r.id}>« {r.de} » devient « {r.vers} », avec tout son historique.</li>)}
        {nees.length > 0 && <li>Naissent à leur nom : {nees.map((n) => `« ${n} »`).join(', ')}.</li>}
        <li>Au rendez-vous, à la caisse et sur les factures : choisir le paiement choisit la caisse. « Reprise d’une année passée », parmi les autres moyens, va dans « Années passées ».</li>
      </ul>
      {!tiroir && (
        <div style={{ ...petit, color: 'var(--copper-700)' }}>
          Aucun tiroir des espèces trouvé : la caisse « Espèces » naîtra au premier encaissement en espèces.
        </div>
      )}
      {pris.length > 0 && (
        <div role="alert" style={{ ...petit, color: 'var(--color-brique, #96412E)' }}>
          « {pris.join(' », « ')} » existe déjà : renommez d’abord cette caisse, le geste ne renomme jamais vers un nom pris.
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
          2. Renommer les caisses
        </button>
        {!sauvee && <span className="mnd-muted" style={{ fontSize: 12 }}>La sauvegarde d’abord.</span>}
      </div>
      {verdict && <div style={petit} aria-live="polite">{verdict}</div>}
    </section>
  );
}
