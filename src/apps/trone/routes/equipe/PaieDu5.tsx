import { useEffect, useMemo, useState } from 'react';
import { Button, Field, Input, alerte, demande, toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { useAuth, useStaff as useMaTete } from '../../../../shared/auth';
import { bulletinsStore, useConfirmationsDePaie, type BulletinPublie } from '../../../../shared/rh';
import {
  ETAT_DIT, LIBELLE_DES_ESPECES, appliqueLeLot, calendrierDeLaPaie, detailDuBulletin, fichierMtn, heureDite,
  idDuBulletin, jourDit, libelleDesFrais, lignesDuFichierMtn, litLaLigne, lotsDejaNotes, moisDit, momentDit,
  netDuMoisDAvant, nomDuFichierMtn, numeroDit, phaseDuMois, phraseDuBlocage, pourquoiPasLeLot, quandDit,
  resumeDeLaPaie, totauxParVoie, valideLesLignes,
  type Blocage, type EtatDeLaPaie, type LectureDeLaLigne, type PaieDu5DuRun,
} from '../../../../shared/paie-du-5-pur';
import { todayISO } from '../clients/_shared';
import { adresseDe, staffStore, useStaff, type StaffMember } from './data';
import { factureDe, totalAccepte, useFacturesPrestataires } from './facture';
import {
  asArray, ligneEstPayee, parametersFor, payrollRunsStore, runEntierementVerse, usePayrollParameters, usePayrollRuns,
  type BulletinLink, type PayrollLine, type PayrollRun,
} from './payroll';
import { dansLeFichierEnAttente, deposeDansMonEspace } from './paie-du-5';
import PaieParMtn from './PaieParMtn';
import { programmeLeRun, useEnvoisMtn, useServeurMtn } from './paie-par-mtn';
import { ceQuiManque, heureDeDepart } from '../../../../shared/paie-par-mtn-pur';
import './paie-du-5.css';

/* ══ LA PAIE DU 5, L'ÉCRAN DE LA DIRECTION · 5 novembre 2026 (lot 1) ════
   Maquette VomoheW35Pi3E5CnhfjTvq, « l'écran du 5 à midi » : le résumé,
   les soldes par voie, les lignes repliées par état (une seule ouverte), puis
   « Valider et programmer ». La voie MTN : « Télécharger le fichier MTN »
   (les seules lignes MTN validées), elle le dépose au portail MTN
   entreprise, puis « C'est envoyé » avec le numéro de lot que le portail
   affiche une seule fois. Moov partira par FedaPay au lot 2 ; d'ici là, ses
   lignes se pointent à la main au Bordereau.

   LA CONFIRMATION SE FAIT DANS LA PAGE. L'entrée par l'empreinte
   (auth/Empreinte) ouvre une SESSION : sur un appareil partagé, toucher la
   clé d'un autre compte changerait de compte au lieu de confirmer. Elle ne
   se prête donc pas à « valider d'un toucher » ; la question de la Maison
   (`demande`) dit qui valide, quoi, et pour combien.

   Les règles vivent dans `shared/paie-du-5-pur` ; ici, seulement les
   gestes et ce qu'ils écrivent. */

const nowIso = () => new Date().toISOString();
const initiales = (nom: string) => nom.split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0]?.toUpperCase() ?? '').join('');

const ORDRE: { etat: EtatDeLaPaie; titre: string }[] = [
  { etat: 'payable', titre: 'Validées, prêtes à partir' },
  { etat: 'confirmee', titre: 'Confirmées, à valider' },
  { etat: 'erreur', titre: 'Erreur signalée' },
  { etat: 'bloquee', titre: 'Bloquées' },
  { etat: 'a-confirmer', titre: 'À confirmer' },
  { etat: 'payee', titre: 'Payées' },
];
const PILL: Record<EtatDeLaPaie, string> = {
  payable: 'p5-pill--fait', confirmee: 'p5-pill--fait', payee: 'p5-pill--fait',
  erreur: 'p5-pill--alerte', bloquee: 'p5-pill--alerte', 'a-confirmer': 'p5-pill--attente',
};
const COURT: Record<Blocage['code'], string> = {
  'net-nul': 'net nul', 'sans-numero': 'sans numéro mobile money', 'numero-illisible': 'numéro illisible',
  'voie-changee': 'opérateur changé depuis le dépôt', 'numero-recent': 'numéro changé depuis moins de 7 jours',
  plafond: 'au-dessus du plafond', 'frais-au-dela': 'frais au-delà du net',
};

export default function PaieDu5({ run, bulletinFor }: { run: PayrollRun; bulletinFor: (l: PayrollLine) => BulletinLink }) {
  const { branch, currency } = useBranch();
  const [runs] = usePayrollRuns();
  const [fiches] = useStaff();
  const [params] = usePayrollParameters();
  const confirmations = useConfirmationsDePaie();
  const [factures] = useFacturesPrestataires();
  const maTete = useMaTete();
  const { session } = useAuth();
  const qui = (maTete?.name ?? '').trim() || (session?.user?.email ?? '').trim();
  const [maintenant, setMaintenant] = useState(() => Date.now());
  useEffect(() => { const t = window.setInterval(() => setMaintenant(Date.now()), 60_000); return () => window.clearInterval(t); }, []);
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [lot, setLot] = useState('');
  const [erreurLot, setErreurLot] = useState('');
  /* LA PAIE PAR MTN (lot 2) : allumée quand le serveur a ses clés. */
  const serveur = useServeurMtn();
  const { envois: envoisMtn, relis: relisLeRegistre } = useEnvoisMtn({ runId: run.id, actif: serveur.pret });

  const F = (n: number) => fmtMoney(n, currency);
  const fige = run.status === 'cloture';
  const cal = calendrierDeLaPaie(run.period);
  const phase = cal ? phaseDuMois(cal, maintenant) : 'confirmation';
  const frais = parametersFor(run.period, params).fraisParEnvoiXof;
  const pd5: PaieDu5DuRun = run.paieDu5 ?? {};
  const lines = asArray<PayrollLine>(run.lines);
  const parFiche = useMemo(() => new Map(asArray(fiches).map((m) => [m.id, m])), [fiches]);

  const lues = useMemo(() => lines.map((l) => {
    const fiche = parFiche.get(l.employeeId);
    const lecture = litLaLigne({
      ligne: l,
      mobileMoney: fiche?.mobileMoney,
      confirmationLue: confirmations.find((c) => c.id === idDuBulletin(run.id, l.employeeId)),
      netAvantXof: netDuMoisDAvant(runs, run, l.employeeId),
      parFacture: l.prestataire ? totalAccepte(factureDe(factures, l.employeeId, run.period)) !== undefined : undefined,
      fraisParEnvoi: frais,
      calendrier: cal,
      maintenantMs: maintenant,
    });
    return { ligne: l, fiche, lecture };
  }), [lines, parFiche, confirmations, runs, run, factures, frais, cal, maintenant]);
  const lectures = useMemo(() => new Map(lues.map((x) => [x.ligne.employeeId, x.lecture])), [lues]);
  const resume = resumeDeLaPaie(lues.map((x) => x.lecture));
  const totaux = totauxParVoie(lues.map((x) => x.lecture));
  const aDeposer = lues.filter(({ ligne, lecture }) => !ligne.prestataire && !ligneEstPayee(ligne) && !dansLeFichierEnAttente(run, ligne.employeeId)
    && (!ligne.depot || !lecture.depotAJour || lecture.blocages.some((b) => b.code === 'voie-changee')));
  const deposees = lues.filter(({ ligne }) => !ligne.prestataire && !!ligne.depot).length;
  const salaries = lues.filter(({ ligne }) => !ligne.prestataire).length;
  const fichierPossible = lignesDuFichierMtn(lues);
  const fraisAJour = lues.filter(({ ligne, lecture }) => !ligne.prestataire && !!ligne.depot && !ligneEstPayee(ligne) && !dansLeFichierEnAttente(run, ligne.employeeId) && lecture.voie
    && (ligne.depot.fraisXof !== (frais?.[lecture.voie] ?? 0) || ligne.depot.fraisRenseignes !== (frais?.[lecture.voie] != null)));
  /* Les frais à renseigner, pour les seules voies qu'on paiera ce mois. */
  /* Par l'API MTN (lot 2), le contrat dit 0 % sur le versé : aucun frais MTN à renseigner. */
  const fraisNonRenseignes = (['MTN', 'Moov'] as const).filter((v) => !(v === 'MTN' && serveur.pret) && frais?.[v] == null && lues.some((x) => x.lecture.voie === v && x.lecture.etat !== 'payee'));

  const ecrisLeRun = (change: (r: PayrollRun) => PayrollRun) =>
    payrollRunsStore.set((prev) => prev.map((r) => (r.id === run.id ? change(r) : r)));
  const patchLigne = (employeeId: string, patch: Partial<PayrollLine>) =>
    ecrisLeRun((r) => ({ ...r, lines: asArray<PayrollLine>(r.lines).map((x) => (x.employeeId === employeeId ? { ...x, ...patch } : x)) }));

  /* ── Les gestes ── */
  const depose = (force = false, ids?: string[]) => {
    const n = deposeDansMonEspace({ runId: run.id, bulletinFor, fraisParEnvoi: frais, fiches: asArray(fiches), branchId: branch.id, par: qui || undefined, employeeIds: ids, force });
    toast(n === 0 ? 'Rien à déposer : chaque bulletin est déjà dans Mon espace.' : `${n} bulletin${n > 1 ? 's' : ''} déposé${n > 1 ? 's' : ''} dans Mon espace.`);
  };
  const redeposeAvecLesFrais = async () => {
    if (!await demande({
      quoi: 'Frais d’envoi',
      titre: `Redéposer ${fraisAJour.length} bulletin${fraisAJour.length > 1 ? 's' : ''} avec les frais réglés ?`,
      dit: 'Le montant envoyé change : chacun doit relire son bulletin et le confirmer à nouveau.',
      accepter: 'Redéposer avec les nouveaux frais',
      refuser: 'Garder les bulletins déposés',
    })) return;
    depose(true, fraisAJour.map((x) => x.ligne.employeeId));
  };

  const valide = async () => {
    const cibles = lues.filter((x) => x.lecture.etat === 'confirmee');
    if (!cibles.length) return;
    if (!qui) { alerte('La validation dit qui valide : ce compte n’a pas de nom. Reconnectez-vous.'); return; }
    const total = cibles.reduce((s, x) => s + x.lecture.envoyeXof, 0);
    const parVoie = totauxParVoie(cibles.map((x) => x.lecture), ['confirmee']);
    const avant = cal && maintenant < cal.paie.ms;
    if (!await demande({
      quoi: 'La paie du 5',
      titre: `Valider ${cibles.length} fiche${cibles.length > 1 ? 's' : ''} pour ${F(total)} ?`,
      dit: (avant && cal
        ? `Elles sont programmées pour le ${momentDit(cal.paie.local)}. Validé par ${qui}.`
        : `Elles sont payables dès maintenant. Validé par ${qui}.`)
        + (serveur.pret && parVoie.MTN.nombre ? ` Les lignes MTN partent par l’API MTN le ${quandDit(heureDeDepart(cal, Date.now()), true)}.` : ''),
      suite: `MTN : ${parVoie.MTN.nombre}, ${F(parVoie.MTN.envoyeXof)} · Moov : ${parVoie.Moov.nombre}, ${F(parVoie.Moov.envoyeXof)}${parVoie['sans-voie'].nombre ? ` · sans numéro : ${parVoie['sans-voie'].nombre}` : ''}.`,
      accepter: 'Valider et programmer',
      refuser: 'Pas encore',
    })) return;
    const le = nowIso();
    const courant = asArray<PayrollRun>(payrollRunsStore.get()).find((r) => r.id === run.id) ?? run;
    const r = valideLesLignes(asArray<PayrollLine>(courant.lines), lectures, qui, le);
    if (r.erreur) { alerte(r.erreur); return; }
    ecrisLeRun((x) => ({
      ...x, lines: r.lignes,
      paieDu5: { ...(x.paieDu5 ?? {}), validations: [...(x.paieDu5?.validations ?? []), { par: qui, le, employeeIds: r.validees }] },
    }));
    toast(`${r.validees.length} fiche${r.validees.length > 1 ? 's' : ''} validée${r.validees.length > 1 ? 's' : ''} par ${qui}.`);
    /* LA PAIE PAR MTN : le même toucher programme les lignes MTN validées. */
    if (!serveur.pret) return;
    const mtn = cibles.filter((x) => x.lecture.voie === 'MTN' && !x.ligne.prestataire && !!x.lecture.msisdn && r.validees.includes(x.ligne.employeeId));
    if (!mtn.length) return;
    const partA = heureDeDepart(cal, Date.now());
    const dejaProgramme = envoisMtn.filter((e) => e.etat === 'programme').reduce((s, e) => s + e.montant_xof, 0);
    const manque = ceQuiManque(pd5.lectureMtn?.soldeXof, dejaProgramme + mtn.reduce((s, x) => s + x.lecture.envoyeXof, 0));
    if (manque != null && manque > 0) {
      alerte(`Validées, mais pas programmées : le solde du compte de paie MTN ne couvre pas l’envoi (il manque ${F(manque)}). Alimentez le compte, lisez à nouveau chez MTN, puis touchez « Programmer l’envoi ».`, 12000);
      return;
    }
    const res = await programmeLeRun({
      runId: run.id, periode: run.period, partA, envois: envoisMtn, lecture: pd5.lectureMtn,
      items: mtn.map((x) => ({ employeeId: x.ligne.employeeId, nom: x.ligne.name, msisdn: x.lecture.msisdn as string, montantXof: x.lecture.envoyeXof })),
      vus: (id) => lines.find((l) => l.employeeId === id)?.nomMtnVu,
      /* L'équipe salariée : chacun est prévenu quand MTN dit reçu (0164). */
      prevenir: true,
    });
    relisLeRegistre();
    if (res.erreur) { alerte(res.erreur); return; }
    if (res.inscrits.length) toast(`${res.inscrits.length} envoi${res.inscrits.length > 1 ? 's' : ''} MTN programmé${res.inscrits.length > 1 ? 's' : ''} pour le ${quandDit(partA, true)}.`);
    const nom = res.tri.attendent.filter((a) => a.pourquoi === 'nom' || a.pourquoi === 'inactif');
    if (nom.length) alerte(`${nom.map((a) => a.nom).join(', ')} : le numéro attend votre mot (voir « MTN · par l’API »).`, 12000);
    if (res.refuses.length) alerte(`Le serveur a refusé ${res.refuses.length} envoi${res.refuses.length > 1 ? 's' : ''} : ${res.refuses.map((x) => x.erreur).join(' ; ')}.`, 12000);
  };

  const accorde = async (l: PayrollLine, lu: LectureDeLaLigne) => {
    const b = lu.blocages.find((x) => x.code === 'plafond');
    if (!b || !qui) return;
    if (!await demande({
      quoi: 'Le plafond du mois',
      titre: `Accorder ${F(lu.netXof)} à ${l.name} ?`,
      dit: phraseDuBlocage(b, F),
      suite: `Accordé par ${qui}, pour ce net seulement : un autre montant redemandera l’accord.`,
      accepter: 'Accorder ce net',
      refuser: 'Ne rien faire',
    })) return;
    patchLigne(l.employeeId, { accordPlafond: { par: qui, le: nowIso(), netXof: lu.netXof } });
  };

  const revalide = async (fiche: StaffMember) => {
    const mm = fiche.mobileMoney;
    if (!mm || !qui) return;
    if (!await demande({
      quoi: 'Numéro mobile money',
      titre: `Revalider le ${numeroDit(mm.numero)} (${mm.operateur}) de ${fiche.name} ?`,
      dit: `Il a changé le ${quandDit(mm.changeLe)}. Vous confirmez qu’il est bien le sien.`,
      suite: `Revalidé par ${qui}.`,
      accepter: 'Revalider ce numéro',
      refuser: 'Ne rien faire',
    })) return;
    staffStore.set((prev) => prev.map((m) => (m.id === fiche.id && m.mobileMoney
      ? { ...m, mobileMoney: { ...m.mobileMoney, revalidePar: qui, revalideLe: nowIso() } }
      : m)));
  };

  const telecharge = async () => {
    const f = fichierMtn(fichierPossible);
    if (f.erreur !== undefined) { alerte(f.erreur); return; }
    if (pd5.fichierMtn && !await demande({
      quoi: 'Fichier MTN',
      titre: 'Remplacer le fichier déjà téléchargé ?',
      dit: `Un fichier de ${pd5.fichierMtn.lignes.length} ligne${pd5.fichierMtn.lignes.length > 1 ? 's' : ''} attend son numéro de lot depuis le ${quandDit(pd5.fichierMtn.le)}.`,
      scelle: 'S’il est déjà déposé au portail MTN, ne le remplacez pas : notez d’abord son numéro de lot.',
      accepter: 'Remplacer le fichier',
      refuser: 'Garder le premier',
    })) return;
    const blob = new Blob([f.csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nomDuFichierMtn(run.period, f.nombre);
    document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    ecrisLeRun((x) => ({ ...x, paieDu5: { ...(x.paieDu5 ?? {}), fichierMtn: { le: nowIso(), par: qui, lignes: fichierPossible, totalXof: f.totalXof } } }));
    toast(`Fichier MTN prêt : ${f.nombre} ligne${f.nombre > 1 ? 's' : ''}, ${F(f.totalXof)}.`);
  };

  const cEstEnvoye = async () => {
    const fichier = pd5.fichierMtn;
    if (!fichier) return;
    const b = lot.trim();
    const refus = pourquoiPasLeLot(b, lotsDejaNotes(runs));
    if (refus) { setErreurLot(refus); return; }
    setErreurLot('');
    if (!await demande({
      quoi: 'Lot MTN',
      titre: `Noter le lot ${b} comme envoyé ?`,
      dit: `${fichier.lignes.length} ligne${fichier.lignes.length > 1 ? 's' : ''} passe${fichier.lignes.length > 1 ? 'nt' : ''} à payé ce jour, pour ${F(fichier.totalXof)}.`,
      scelle: 'À toucher seulement une fois le fichier déposé au portail MTN entreprise : la Maison croira ensuite avoir payé.',
      accepter: 'C’est envoyé',
      refuser: 'Pas encore',
    })) return;
    const jour = todayISO();
    const courant = asArray<PayrollRun>(payrollRunsStore.get()).find((r) => r.id === run.id) ?? run;
    const r = appliqueLeLot(asArray<PayrollLine>(courant.lines), fichier, b, jour);
    ecrisLeRun((x) => ({
      ...x, lines: r.lignes,
      paieDu5: {
        ...(x.paieDu5 ?? {}), fichierMtn: undefined,
        lotsMtn: [...(x.paieDu5?.lotsMtn ?? []), {
          batch: b, le: nowIso(), par: qui, employeeIds: fichier.lignes.map((y) => y.employeeId), totalXof: fichier.totalXof,
          ...(r.dejaPayees.length ? { dejaPayees: r.dejaPayees } : {}),
        }],
      },
    }));
    const payees = new Set(r.payees);
    bulletinsStore.set((prev) => asArray<BulletinPublie>(prev).map((x) => (x.runId === run.id && payees.has(x.employeeId) ? { ...x, payeLe: jour } : x)));
    setLot('');
    toast(`Lot ${b} noté : ${r.payees.length} ligne${r.payees.length > 1 ? 's' : ''} payée${r.payees.length > 1 ? 's' : ''}.`);
    if (r.dejaPayees.length) {
      const noms = lines.filter((l) => r.dejaPayees.includes(l.employeeId)).map((l) => l.name).join(', ');
      alerte(`${noms} étai${r.dejaPayees.length > 1 ? 'ent' : 't'} déjà payée${r.dejaPayees.length > 1 ? 's' : ''} avant ce lot : vérifiez chez MTN qu’aucun salaire n’est parti deux fois.`, 12000);
    }
  };

  const abandonne = async () => {
    if (!pd5.fichierMtn) return;
    if (!await demande({
      quoi: 'Fichier MTN',
      titre: 'Abandonner ce fichier ?',
      dit: 'Ses lignes redeviennent libres, sans numéro de lot.',
      scelle: 'S’il est déposé au portail MTN, n’abandonnez pas : notez son numéro de lot.',
      accepter: 'Abandonner le fichier',
      refuser: 'Le garder',
    })) return;
    ecrisLeRun((x) => ({ ...x, paieDu5: { ...(x.paieDu5 ?? {}), fichierMtn: undefined } }));
  };

  /* ── Ce qui se lit ── */
  const sourcil = !cal ? 'La paie du mois'
    : phase === 'avant-le-depot' ? `Bulletins dans Mon espace le ${momentDit(cal.depot.local)}`
      : phase === 'confirmation' ? `Confirmations jusqu’au ${momentDit(cal.finDesConfirmations.local)}`
        : phase === 'validation' ? `À valider avant le ${jourDit(cal.paie.local)}, ${heureDite(cal.paie.local)}`
          : `Paie partie le ${momentDit(cal.paie.local)} · les fiches en retard partent dès leur validation`;

  const quand = (l: PayrollLine, lu: LectureDeLaLigne): string => {
    const voie = lu.voie ?? 'sans numéro';
    /* Ce qui l'arrêtera une fois confirmée se dit dès maintenant. */
    const gardes = lu.blocages.length ? ` · puis ${lu.blocages.map((b) => COURT[b.code]).join(', ')}` : '';
    switch (lu.etat) {
      case 'payee': return `${l.payeMoyen ?? voie} · payée le ${jourDit(l.payeLe ?? '', false)}${l.lotMtn ? ` · lot ${l.lotMtn}` : ''}${l.transactionMtn ? ` · transaction ${l.transactionMtn}` : ''}`;
      case 'payable': return `${voie} · validée par ${l.validation?.par ?? ''} le ${quandDit(l.validation?.le)}`;
      case 'confirmee': return `${voie} · ${l.prestataire ? 'facture acceptée' : `confirmée le ${quandDit(lu.confirmation?.le)}${lu.enRetard ? ', en retard' : ''}`}`;
      case 'erreur': return `${voie} · erreur signalée le ${quandDit(lu.confirmation?.le)}${gardes}`;
      case 'bloquee': return `${voie} · bloquée : ${lu.blocages.map((b) => COURT[b.code]).join(', ')}`;
      default: return `${voie} · ${(lu.attente ?? 'à confirmer').replace(/\.$/, '')}${gardes}`;
    }
  };

  /* Le détail d'une ligne ouverte : une fonction, pas un composant (un
     composant déclaré ici renaîtrait à chaque minute de l'horloge). */
  const detail = (l: PayrollLine, lu: LectureDeLaLigne, fiche?: StaffMember) => {
    const det = detailDuBulletin(l, lu.voie, lu.fraisXof);
    const mm = fiche?.mobileMoney;
    const relie = !!fiche && !!adresseDe(fiche);
    return (
      <div className="p5-detail">
        {det.lignes.map((x, i) => (
          <div key={i} className="p5-detail__rang"><span>{x.libelle}</span><span>{x.retenue ? '− ' : ''}{F(x.montantXof)}</span></div>
        ))}
        <div className="p5-detail__rang p5-detail__rang--total"><span>Net</span><span>{F(det.netXof)}</span></div>
        {lu.fraisXof > 0 && <div className="p5-detail__rang"><span>{libelleDesFrais(lu.voie)}</span><span>− {F(lu.fraisXof)}</span></div>}
        {lu.especesXof > 0 && <div className="p5-detail__rang"><span>{LIBELLE_DES_ESPECES}</span><span>− {F(lu.especesXof)}</span></div>}
        <div className="p5-detail__rang p5-detail__rang--envoye"><span>Montant envoyé</span><span>{F(lu.envoyeXof)}</span></div>
        {!lu.fraisRenseignes && lu.voie && <p>Frais d’envoi {lu.voie} à renseigner : le montant envoyé est le net.</p>}
        <p>
          {mm ? <>Numéro {mm.operateur} <b>{numeroDit(mm.numero)}</b>{lu.numero?.revalide && mm.revalidePar ? `, revalidé par ${mm.revalidePar}` : ''}.</> : 'Aucun numéro mobile money sur sa fiche.'}{' '}
          {lu.plafond
            ? <>Plafond du mois : {F(lu.plafond.plafondXof)} (le net du mois d’avant, {F(lu.plafond.netAvantXof)}, plus 25 %){lu.plafond.accorde && l.accordPlafond ? `, dépassement accordé par ${l.accordPlafond.par} le ${quandDit(l.accordPlafond.le)}` : ''}.</>
            : 'Pas de mois d’avant : pas de plafond.'}
        </p>
        {lu.etat === 'a-confirmer' && lu.attente && <p>{lu.attente}</p>}
        {lu.etat === 'erreur' && lu.confirmation && (
          <p><b>Erreur signalée le {quandDit(lu.confirmation.le)}</b>{lu.confirmation.mot ? <> : « {lu.confirmation.mot} »</> : ''}. Corrigez la ligne (Modifier, sur un run en brouillon) : le bulletin corrigé repart dans Mon espace, à confirmer.</p>
        )}
        {lu.etat !== 'erreur' && lu.derniereReponse?.etat === 'erreur' && !lu.confirmation && (
          <p>Erreur signalée le {quandDit(lu.derniereReponse.le)}{lu.derniereReponse.mot ? <> : « {lu.derniereReponse.mot} »</> : ''}.</p>
        )}
        {lu.blocages.length > 0 && lu.etat !== 'payee' && lu.blocages.map((b, i) => <p key={i}>{phraseDuBlocage(b, F)}</p>)}
        {lu.confirmation?.etat === 'confirme' && !l.prestataire && <p>Confirmé dans Mon espace le {quandDit(lu.confirmation.le)}{lu.enRetard ? ', après midi le jour de paie : il part dès sa validation' : ''}.</p>}
        {l.validation && lu.etat !== 'payee' && <p>Validé par <b>{l.validation.par}</b> le {quandDit(l.validation.le)}{lu.etat !== 'payable' ? ', pour un bulletin qui a changé depuis' : ''}.</p>}
        {lu.etat === 'payee' && <p>Payée le {jourDit(l.payeLe ?? '', false)}{l.payeMoyen ? `, ${l.payeMoyen}` : ''}{l.lotMtn ? `, lot MTN ${l.lotMtn}` : ''}{l.envoyeXof != null ? `, ${F(l.envoyeXof)} envoyés` : ''}{l.validation ? `. Validée par ${l.validation.par} le ${quandDit(l.validation.le)}` : ''}.</p>}
        {lu.etat === 'payable' && lu.voie === 'Moov' && <p>Moov : par FedaPay, au lot 2. D’ici là, pointez-la à la main au Bordereau une fois le run validé.</p>}
        {!l.prestataire && !relie && lu.etat !== 'payee' && <p>Sa fiche n’est reliée à aucun compte : elle ne voit pas Mon espace. Posez l’adresse de son compte sur sa fiche.</p>}
        {!fige && lu.etat !== 'payee' && (
          <div className="p5-detail__gestes">
            {lu.blocages.some((b) => b.code === 'plafond') && <Button size="sm" variant="copper" onClick={() => void accorde(l, lu)}>Accorder ce net</Button>}
            {lu.blocages.some((b) => b.code === 'numero-recent') && fiche && <Button size="sm" variant="copper" onClick={() => void revalide(fiche)}>Revalider le numéro</Button>}
            {!l.prestataire && !dansLeFichierEnAttente(run, l.employeeId) && (!l.depot || !lu.depotAJour || lu.blocages.some((b) => b.code === 'voie-changee')) && (
              <Button size="sm" variant="ghost" onClick={() => depose(false, [l.employeeId])}>{l.depot ? 'Déposer à nouveau' : 'Déposer dans Mon espace'}</Button>
            )}
          </div>
        )}
      </div>
    );
  };

  /* Le fichier du portail MTN : la voie d'avant, gardée en secours. */
  const portailMtn = (
        <div className="p5__voie">
          <h4>MTN · portail MTN entreprise</h4>
          {pd5.fichierMtn ? (
            <>
              <p>
                Fichier téléchargé le {quandDit(pd5.fichierMtn.le)} par {pd5.fichierMtn.par || 'la direction'} : {pd5.fichierMtn.lignes.length} ligne{pd5.fichierMtn.lignes.length > 1 ? 's' : ''}, {F(pd5.fichierMtn.totalXof)}.
                {' '}Déposez-le au portail (Action, Transfers, Batch upload), puis collez ici le numéro de lot qu’il affiche une seule fois.
              </p>
              <div className="p5__lot">
                <Field label="Numéro de lot (batch ID)">
                  <Input value={lot} disabled={fige} autoComplete="off" spellCheck={false} onChange={(e) => { setLot(e.target.value); setErreurLot(''); }} />
                </Field>
                <Button variant="copper" disabled={fige || !lot.trim()} onClick={() => void cEstEnvoye()}>C’est envoyé</Button>
              </div>
              {erreurLot && <div className="p5__erreur" role="alert">{erreurLot}</div>}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <Button size="sm" variant="ghost" disabled={fige || fichierPossible.length === 0} onClick={() => void telecharge()}>Télécharger à nouveau</Button>
                <Button size="sm" variant="ghost" disabled={fige} onClick={() => void abandonne()}>Abandonner ce fichier</Button>
              </div>
            </>
          ) : (
            <>
              <p>
                {fichierPossible.length
                  ? `${fichierPossible.length} ligne${fichierPossible.length > 1 ? 's' : ''} MTN validée${fichierPossible.length > 1 ? 's' : ''}, ${F(fichierPossible.reduce((s, x) => s + x.montantXof, 0))}, frais retirés.${cal && maintenant < cal.paie.ms ? ` Le fichier se dépose le ${momentDit(cal.paie.local)}.` : ''}`
                  : 'Aucune ligne MTN validée à payer pour l’instant.'}
              </p>
              {fichierPossible.length > 0 && <Button variant="indigo" disabled={fige} onClick={() => void telecharge()}>Télécharger le fichier MTN</Button>}
            </>
          )}
          {(pd5.lotsMtn ?? []).length > 0 && (
            <ul className="p5__lots">
              {(pd5.lotsMtn ?? []).map((x) => (
                <li key={x.batch}>Lot {x.batch} · {x.employeeIds.length} ligne{x.employeeIds.length > 1 ? 's' : ''} · {F(x.totalXof)} · noté le {quandDit(x.le)} par {x.par}</li>
              ))}
            </ul>
          )}
        </div>
  );

  const validations = pd5.validations ?? [];
  const derniereValidation = validations[validations.length - 1];

  return (
    <section className="p5" aria-label="La paie du 5">
      <div className="p5__haut">
        <span className="p5__sourcil">{sourcil}</span>
        <h3 className="p5__titre">La paie du 5 · {moisDit(run.period)}</h3>
        {cal && (
          <p className="p5__doux">
            L’équipe, Maison MND. Bulletins dans Mon espace le {momentDit(cal.depot.local, false)} ; chacun confirme jusqu’au {momentDit(cal.finDesConfirmations.local)} ;
            {' '}vous ou Brice validez de 12 h à 18 h ; la paie part à 18 h.
            {cal.reporteAuLundi ? ' Le 5 tombe un dimanche : tout passe au lundi 6, aux mêmes heures.' : ''}
          </p>
        )}
      </div>

      <div className="p5__resume">
        <div><b>{resume.confirmees}</b><small>fiche{resume.confirmees > 1 ? 's' : ''} confirmée{resume.confirmees > 1 ? 's' : ''}{resume.payables ? `, dont ${resume.payables} validée${resume.payables > 1 ? 's' : ''}` : ''}</small></div>
        <div><b>{F(resume.aEnvoyerXof)}</b><small>à envoyer, frais retirés</small></div>
        <div><b>{resume.enAttente}</b><small>en attente, signalée{resume.enAttente > 1 ? 's' : ''} ou bloquée{resume.enAttente > 1 ? 's' : ''}{resume.payees ? ` · ${resume.payees} payée${resume.payees > 1 ? 's' : ''}` : ''}</small></div>
      </div>

      <div className="p5__soldes">
        <span><b>MTN</b> {F(totaux.MTN.envoyeXof)} à envoyer ({totaux.MTN.nombre})</span>
        <span><b>Moov</b> {F(totaux.Moov.envoyeXof)} à envoyer ({totaux.Moov.nombre})</span>
        {totaux['sans-voie'].nombre > 0 && <span>Sans numéro : {totaux['sans-voie'].nombre}</span>}
      </div>

      {fraisNonRenseignes.length > 0 && (
        <div className="p5__note p5__note--cuivre">
          <span>
            Frais d’envoi par envoi {fraisNonRenseignes.join(' et ')} : <b>à renseigner</b> dans les Paramètres de paie.
            Tant qu’ils manquent, le montant envoyé est le net, et la Maison paie les frais.
          </span>
        </div>
      )}

      {!fige && aDeposer.length > 0 && (
        <div className="p5__note">
          <span>
            Bulletins dans Mon espace : {deposees} sur {salaries}.
            {' '}Au lot 2, l’agent des ressources humaines les déposera seul le 1er à 8 h ; ce mois-ci, déposez-les d’ici.
          </span>
          <Button size="sm" variant="copper" onClick={() => depose(false)}>Déposer {aDeposer.length > 1 ? `les ${aDeposer.length} bulletins` : 'le bulletin'} dans Mon espace</Button>
        </div>
      )}
      {!fige && fraisAJour.length > 0 && (
        <div className="p5__note">
          <span>Les frais réglés ne sont pas ceux de {fraisAJour.length} bulletin{fraisAJour.length > 1 ? 's' : ''} déjà déposé{fraisAJour.length > 1 ? 's' : ''} : ils comptent au prochain dépôt.</span>
          <Button size="sm" variant="ghost" onClick={() => void redeposeAvecLesFrais()}>Redéposer avec les frais réglés</Button>
        </div>
      )}

      {ORDRE.map(({ etat, titre }) => {
        const liste = lues.filter((x) => x.lecture.etat === etat);
        if (!liste.length) return null;
        return (
          <div key={etat}>
            <div className="p5__groupe">{titre} · {liste.length}</div>
            {liste.map(({ ligne: l, lecture: lu, fiche }) => {
              const ouvert = ouverte === l.employeeId;
              return (
                <div key={l.employeeId} className="p5-ligne">
                  <button type="button" aria-expanded={ouvert} onClick={() => setOuverte(ouvert ? null : l.employeeId)}>
                    <span className="p5-ini" aria-hidden>{initiales(l.name)}</span>
                    <span className="p5-qui"><b>{l.name}{l.poste ? ` · ${l.poste}` : ''}</b><small>{quand(l, lu)}</small></span>
                    <span className="p5-droite"><span className="p5-net">{F(lu.etat === 'payee' ? (l.envoyeXof ?? lu.netXof) : lu.envoyeXof)}</span><span className={`p5-pill ${PILL[lu.etat]}`}>{ETAT_DIT[lu.etat]}</span></span>
                  </button>
                  {ouvert && detail(l, lu, fiche)}
                </div>
              );
            })}
          </div>
        );
      })}

      <div className="p5__pied">
        {!fige && resume.aValider > 0 && (
          <Button variant="copper" onClick={() => void valide()}>
            {cal && maintenant < cal.paie.ms ? 'Valider et programmer pour 18 h' : 'Valider et programmer'} · {resume.aValider} fiche{resume.aValider > 1 ? 's' : ''}
          </Button>
        )}
        {derniereValidation && (
          <div className="p5__programme" role="status">
            <b>Validé par {derniereValidation.par} le {quandDit(derniereValidation.le)}{cal && maintenant < cal.paie.ms ? `. Programmé pour le ${momentDit(cal.paie.local)}.` : '.'}</b>
            <span>
              {derniereValidation.employeeIds.length} fiche{derniereValidation.employeeIds.length > 1 ? 's' : ''} à ce toucher.
              {validations.length > 1 ? ` ${validations.length} validations ce mois : ${validations.map((v) => `${v.par}, ${quandDit(v.le)}`).join(' ; ')}.` : ''}
              {resume.enAttente > 0 ? ` ${resume.enAttente} autre${resume.enAttente > 1 ? 's' : ''} partir${resume.enAttente > 1 ? 'ont' : 'a'} dès qu’elle${resume.enAttente > 1 ? 's seront confirmées' : ' sera confirmée'} et validée${resume.enAttente > 1 ? 's' : ''}.` : ''}
            </span>
          </div>
        )}

        {serveur.pret && (
          <PaieParMtn run={run} lues={lues} cal={cal} qui={qui} F={F} fige={fige} envois={envoisMtn} relisLeRegistre={relisLeRegistre} ecrisLeRun={ecrisLeRun} />
        )}
        {serveur.pret ? (
          <details className="p5__secours">
            <summary>Le fichier du portail MTN, en secours</summary>
            {portailMtn}
          </details>
        ) : portailMtn}
        {!serveur.pret && serveur.charge && <p className="p5__doux">L’envoi par l’API MTN s’allume quand les six clés MTN sont posées. D’ici là, le fichier du portail.</p>}

        <div className="p5__voie">
          <h4>Moov · FedaPay</h4>
          <p>
            {totaux.Moov.nombre > 0 ? `${totaux.Moov.nombre} ligne${totaux.Moov.nombre > 1 ? 's' : ''} Moov, ${F(totaux.Moov.envoyeXof)}. ` : ''}
            Les lignes Moov partiront par FedaPay au lot 2. D’ici là, elles se pointent à la main au Bordereau, une fois le run validé (en haut de la fiche). Validez le run quand plus aucune erreur n’attend de correction : une ligne ne se corrige que sur un brouillon.
          </p>
        </div>

        {runEntierementVerse(run) && run.status !== 'paye' && run.status !== 'cloture' && (
          <div className="p5__note p5__note--cuivre" style={{ borderBottom: 0 }}>
            <span>Toutes les lignes sont payées. Passez le run à « Validé » puis « Payé », en haut de la fiche : les salaires s’inscrivent aux Dépenses et les bulletins se publient.</span>
          </div>
        )}
        <p className="p5__doux">{serveur.pret
          ? 'Heures de Cotonou. Rien ne part sans votre toucher : le Trône confie les envois au serveur de la Maison, qui les envoie par MTN à l’heure dite.'
          : 'Heures de Cotonou. Rien ne part seul : le Trône prépare le fichier, et vous le déposez au portail MTN.'}</p>
      </div>
    </section>
  );
}
