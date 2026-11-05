import { bulletinsStore, type BulletinPublie } from '../../../../shared/rh';
import { calendrierDeLaPaie, depotDeLaLigne, detailDuBulletin, idDuBulletin, type FraisParEnvoi } from '../../../../shared/paie-du-5-pur';
import type { StaffMember } from './data';
import { asArray, ligneEstPayee, payrollRunsStore, type BulletinLink, type PayrollLine, type PayrollRun } from './payroll';

/* ══ LA PAIE DU 5, CE QUI S'ÉCRIT · 5 novembre 2026 (lot 1) ═════════════
   Les écritures partagées par la fiche du run (Paie.tsx) et le bloc de la
   paie du 5 (PaieDu5.tsx) : le dépôt des bulletins dans Mon espace, et la
   garde du fichier MTN en attente. Les règles sont dans
   `shared/paie-du-5-pur`. */

const nowIso = () => new Date().toISOString();

/** La ligne est-elle dans le fichier MTN téléchargé, en attente de son
    numéro de lot ? Elle ne se corrige plus : ce qui est parti au portail est
    ce qui se paiera. */
export const dansLeFichierEnAttente = (run: Pick<PayrollRun, 'paieDu5'>, employeeId: string): boolean =>
  !!run.paieDu5?.fichierMtn?.lignes.some((x) => x.employeeId === employeeId);

/** LE DÉPÔT DANS MON ESPACE (ce que l'agent des ressources humaines fera
    seul le 1er à 8 h, au lot 2). Chaque ligne d'un salarié, pas encore
    payée, reçoit son dépôt (la voie de sa fiche, les frais réglés ce jour) ;
    son bulletin part dans `bulletins`, que la personne lit chez elle. Une
    ligne déjà déposée telle quelle ne bouge pas : sa confirmation tient. */
export function deposeDansMonEspace(o: {
  runId: string;
  bulletinFor: (l: PayrollLine) => BulletinLink;
  fraisParEnvoi?: FraisParEnvoi;
  fiches: readonly StaffMember[];
  branchId: string;
  par?: string;
  /** Les seules lignes à déposer ; absent : toutes. */
  employeeIds?: readonly string[];
  /** Redéposer même une ligne à jour (nouveaux frais). */
  force?: boolean;
}): number {
  const run = asArray<PayrollRun>(payrollRunsStore.get()).find((r) => r.id === o.runId);
  if (!run) return 0;
  const cal = calendrierDeLaPaie(run.period);
  const le = nowIso();
  const fiche = new Map(o.fiches.map((m) => [m.id, m]));
  const deposes: BulletinPublie[] = [];
  const lignes = asArray<PayrollLine>(run.lines).map((l) => {
    if (l.prestataire || ligneEstPayee(l) || dansLeFichierEnAttente(run, l.employeeId)) return l;
    if (o.employeeIds && !o.employeeIds.includes(l.employeeId)) return l;
    const voie = fiche.get(l.employeeId)?.mobileMoney?.operateur;
    const d = depotDeLaLigne(l.result, voie, o.fraisParEnvoi, le, o.par);
    if (!o.force && l.depot && l.depot.cle === d.cle && l.depot.voie === d.voie) return l;
    const det = detailDuBulletin(l, d.voie, d.fraisXof);
    deposes.push({
      id: idDuBulletin(run.id, l.employeeId), branchId: run.branchId ?? o.branchId, runId: run.id, period: run.period,
      employeeId: l.employeeId, name: l.name, netXof: det.netXof, publieLe: '',
      lien: o.bulletinFor(l) as unknown as BulletinPublie['lien'],
      depot: {
        le, cle: d.cle, ...(d.voie ? { voie: d.voie } : {}), lignes: det.lignes, netXof: det.netXof, fraisXof: det.fraisXof,
        ...(det.especesXof > 0 ? { especesXof: det.especesXof } : {}),
        envoyeXof: det.envoyeXof, libelleDesFrais: det.libelleDesFrais,
        ...(cal ? { confirmerAvant: cal.finDesConfirmations.local, paieLe: cal.paie.local } : {}),
      },
    });
    return { ...l, depot: d };
  });
  if (deposes.length === 0) return 0;
  payrollRunsStore.set((prev) => prev.map((r) => (r.id === run.id ? { ...r, lines: lignes } : r)));
  const parId = new Map(deposes.map((b) => [b.id, b]));
  bulletinsStore.set((prev) => {
    const anciens = asArray<BulletinPublie>(prev);
    const gardes = anciens.filter((b) => !parId.has(b.id));
    /* Un bulletin déjà publié garde sa date de publication. */
    const neufs = deposes.map((b) => {
      const a = anciens.find((x) => x.id === b.id);
      return a?.publieLe ? { ...b, publieLe: a.publieLe } : b;
    });
    return [...neufs, ...gardes];
  });
  return deposes.length;
}

