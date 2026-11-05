import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Field, Input, Modal, Select, alerte, demande, toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { useAuth, useStaff as useMaTete } from '../../../../shared/auth';
import { bulletinsStore, useConfirmationsDePaie, type BulletinPublie } from '../../../../shared/rh';
import { useTips } from '../../../../shared/tips';
import { providersStore, useProviders, type Provider } from '../../../../shared/prestataires';
import { missionsStore, useMissionsDesPrestataires, type MissionDuPrestataire } from '../../../../shared/missions-prestataires';
import { CHARGE_CATEGORY, ID_CATEGORIE_CHARGE, chargeDeLaMission } from '../../../../shared/missions-prestataires-pur';
import { expenseCategoriesStore, expensesStore, type Expense } from '../../../../shared/finance';
import { projectionDeLaRetenue, soldesParEmprunteur, usePrets } from '../../../../shared/foyer';
import { fournisseursStore, useFournisseurs, type Fournisseur } from '../../../../shared/fournisseurs';
import { uid } from '../../../../shared/store';
import {
  aCotonou, calendrierDeLaPaie, detailDuBulletin, heureDite, idDuBulletin, jourDit as jourEntierDit, libelleDesFrais, lisLeNumero, litLaLigne,
  moisDit, moisPrecedent, moisSuivant, momentDit, netDuMoisDAvant, numeroDeLaFiche, numeroDit, phaseDuMois, phraseDuBlocage, quandDit,
  valideLesLignes, type LectureDeLaLigne,
} from '../../../../shared/paie-du-5-pur';
import {
  ETAT_DE_L_ENVOI_DIT, MONTANT_ESSAI_MAX, appliqueLesRecus, bilanDeLEssai, ceQuiManque, depenseDeLEssai, heureDeDepart, idDeLEssai,
  raisonDite, type EnvoiMtn, type LectureMtn, type NomMtnVu,
} from '../../../../shared/paie-par-mtn-pur';
import {
  ETAT_DIT, JOURS_POSSIBLES, JOUR_PAR_DEFAUT, arretDeLEntreprise, chiffresDuMois, cleDeLigne, dateDePaie, departDeLaLigne,
  depenseDeLEntreprise, echeancierDuPret, entreprisesDuCarnet, etatDuNumero, factureDuMois, itemDeLaLigne, jourDit, jourLu, ligneADate,
  ligneDeLEquipe, lignesDuTest, numeroPropose, periodeParDefaut, peutAnnuler, peutPrendre, pointsARegarder, pourboiresDuMois,
  pourquoiPasLeTest, runDesEntreprises, runDesPrestataires, seRelanceA500, seValideAPart, testReussi, totalDuTest, validationDe,
  type FactureDEntreprise, type JourDePaie, type LigneDuMois, type PointARegarder, type SourceDuNumero,
} from '../../../../shared/les-paiements-pur';
import { staffStore, useStaff, type StaffMember } from './data';
import { factureDe, totalAccepte, useFacturesPrestataires } from './facture';
import {
  asArray, jourLocalDe, ligneEstPayee, parametersFor, payrollRunsStore, usePayrollParameters, usePayrollRuns,
  type PayrollLine, type PayrollRun,
} from './payroll';
import { annule, lisChezMtn, renvoie, teste, useEnvoisMtn, useServeurMtn } from './paie-par-mtn';
import { derniersParPersonne } from './PaieParMtn';
import { ChampPieceJointe } from '../finances/_shared';
import {
  ecrisLeMois, ecrisLeRegistre, facturesDEntreprisesStore, leMois, programmeLesLignes, useFacturesDEntreprises, useRegistreDesPaiements,
} from './les-paiements';
import './les-paiements.css';

/* ══ ÉQUIPE › LES PAIEMENTS · 5 novembre 2026 ═════════════════════════════
   Maquette public/maquette-les-paiements.html (v5), validée par Yéman :
   « construis ». Un mois, un tableau, un toucher. Tout ce qui sort vers
   l'équipe et ceux qui travaillent pour la Maison : les salaires nets du run
   du mois (la paie du 5), les retenues de prêt, les pourboires (en espèces,
   le 5), les prestataires et les entreprises, chacun à sa date.

   CE QU'IL RASSEMBLE, SANS RIEN RETIRER. Les runs, les variables, la
   production, les paramètres, le test de 100 F, les prêts et les
   prestataires gardent leurs écrans (« Réglages ») ; celui-ci les lit et
   pose, d'un toucher, ce que la paie du 5 pose déjà : la validation de
   chaque bulletin (`valideLesLignes`), puis les envois par MTN (fonction
   `paie-mtn`), le salaire à 18 h le 5, les autres à leur date.

   LA DIRECTION SEULE : le souverain, comme la paie (la base garde les runs
   au souverain). La famille n'apparaît jamais : le Trône ne connaît que
   l'équipe de la Maison MND (`GROUPES_DE_PAIE`), et les prêts ne montrent
   que ceux de l'équipe.

   Les règles vivent dans `shared/les-paiements-pur` ; ici, les gestes. */

/** Le compte d'où part la paie : le compte Disbursement MTN de la Maison. */
const COMPTE_DE_PAIE = 'compte de paie MTN';
const DEUX_HEURES = 2 * 60 * 60 * 1000;
const nowIso = () => new Date().toISOString();
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const moisCourt = (periode: string) => MOIS_COURTS[Number(periode.slice(5, 7)) - 1] ?? periode;
const JOURS_COURTS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
/** « sam. 5 déc. » d'un AAAA-MM-JJ. */
const jourCourt = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (!m) return '';
  const j = Number(m[3]);
  return `${JOURS_COURTS[new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, j)).getUTCDay()]} ${j === 1 ? '1er' : j} ${MOIS_COURTS[Number(m[2]) - 1]}`;
};
/** « sam. 5 déc. 18 h 03 » d'un instant ISO, à l'heure de Cotonou. */
const aLaMinute = (iso?: string | null): string => {
  const ms = Date.parse(iso ?? '');
  if (!Number.isFinite(ms)) return '';
  const ici = aCotonou(ms);
  return `${jourCourt(ici)} ${heureDite(ici)}`;
};
/** « 01 •• •• •• 73 » : l'écran ne montre que la fin du numéro. */
const numeroMasque = (msisdn?: string): string => {
  const c = String(msisdn ?? '').replace(/\D/g, '');
  return c.length >= 2 ? `01 •• •• •• ${c.slice(-2)}` : '–';
};
const capitale = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** D'où vient le numéro MTN d'une fiche. */
function numeroDeFiche(f?: { mobileMoney?: { numero: string; operateur: string }; phone?: string }): { source: SourceDuNumero; msisdn?: string } {
  const mm = f?.mobileMoney;
  if (mm) {
    if (mm.operateur !== 'MTN') return { source: 'autre-voie' };
    const lu = lisLeNumero(mm.numero);
    return lu.msisdn ? { source: 'fiche', msisdn: lu.msisdn } : { source: 'sans' };
  }
  const p = numeroPropose(f?.phone);
  return p ? { source: 'repris', msisdn: p } : { source: 'sans' };
}

type Contexte = {
  /** La fiche du personnel (équipe, prestataire du run). */
  fiche?: StaffMember;
  provider?: Provider;
  /** L'entreprise : un fournisseur avec son bloc `paiement`, et sa facture du mois. */
  fournisseur?: Fournisseur;
  facture?: FactureDEntreprise;
  ligne?: PayrollLine;
  lecture?: LectureDeLaLigne;
  /** Le numéro proposé (téléphone de la fiche), pas encore pris. */
  propose?: string;
  missions?: MissionDuPrestataire[];
  /** Les pourboires que porte le bulletin (partis en espèces). */
  pourboiresDuNet?: number;
};

export default function LesPaiements() {
  const navigate = useNavigate();
  const { branch, currency } = useBranch();
  const F = (n: number) => fmtMoney(n, currency);
  const maTete = useMaTete();
  const { session } = useAuth();
  const qui = (maTete?.name ?? '').trim() || (session?.user?.email ?? '').trim();
  const estSouverain = maTete?.role === 'souverain';

  const [maintenant, setMaintenant] = useState(() => Date.now());
  useEffect(() => { const t = window.setInterval(() => setMaintenant(Date.now()), 60_000); return () => window.clearInterval(t); }, []);
  const [periode, setPeriode] = useState(() => periodeParDefaut(Date.now()));
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [prixAPoser, setPrixAPoser] = useState<{ missionId: string; valeur: string } | null>(null);
  /** La saisie ouverte : l'entreprise (un fournisseur), ou la facture du mois. */
  const [saisie, setSaisie] = useState<{ quoi: 'entreprise'; fournisseur?: Fournisseur } | { quoi: 'facture'; fournisseur: Fournisseur; facture?: FactureDEntreprise } | null>(null);
  const [part, setPart] = useState(false);

  const [runs] = usePayrollRuns();
  const [fichesBrutes] = useStaff();
  const [params] = usePayrollParameters();
  const confirmations = useConfirmationsDePaie();
  const [factures] = useFacturesPrestataires();
  const [tips] = useTips();
  const [providersBruts] = useProviders();
  const [missionsBrutes] = useMissionsDesPrestataires();
  const [prets] = usePrets();
  const [registre] = useRegistreDesPaiements();
  const [carnet] = useFournisseurs();
  const [facturesBrutes] = useFacturesDEntreprises();

  const serveur = useServeurMtn();
  const fiches = useMemo(() => asArray<StaffMember>(fichesBrutes).filter((m) => m && m.branchId === branch.id), [fichesBrutes, branch.id]);
  const parFiche = useMemo(() => new Map(fiches.map((m) => [m.id, m])), [fiches]);
  const run: PayrollRun | undefined = useMemo(() => asArray<PayrollRun>(runs)
    .filter((r) => r && r.period === periode && (!r.branchId || r.branchId === branch.id))
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))[0], [runs, periode, branch.id]);
  const fige = run?.status === 'cloture';
  const cal = calendrierDeLaPaie(periode);
  const mois = leMois(registre, periode);
  const lecture: LectureMtn | undefined = mois.lectureMtn;
  const runPresta = runDesPrestataires(periode);
  const runEnt = runDesEntreprises(periode);
  const { envois: envoisEquipe, relis: relisEquipe } = useEnvoisMtn({ runId: run?.id, actif: serveur.pret && !!run });
  const { envois: envoisPresta, relis: relisPresta } = useEnvoisMtn({ runId: runPresta, actif: serveur.pret });
  const { envois: envoisEnt, relis: relisEnt } = useEnvoisMtn({ runId: runEnt, actif: serveur.pret });
  const { envois: envoisEssai, relis: relisEssai } = useEnvoisMtn({ essais: true, actif: serveur.pret });
  const relisTout = () => { relisEquipe(); relisPresta(); relisEnt(); };
  const envoisDe = (runId: string): EnvoiMtn[] => (runId === runPresta ? envoisPresta : runId === runEnt ? envoisEnt : envoisEquipe);

  /* ── LES LIGNES DU MOIS ─────────────────────────────────────────────── */
  const { lignes, ctx, lectures } = useMemo(() => {
    const ctx = new Map<string, Contexte>();
    const lectures = new Map<string, LectureDeLaLigne>();
    const out: LigneDuMois[] = [];
    const jours = registre?.jours ?? {};
    const validations = mois.validations ?? {};
    const vusDuRegistre = registre?.nomsVus ?? {};

    /* L'équipe : les lignes du run, sinon (pas encore de run) les fiches
       qui ont des pourboires à recevoir. */
    if (run) {
      const frais = parametersFor(run.period, params).fraisParEnvoiXof;
      for (const l of asArray<PayrollLine>(run.lines)) {
        const fiche = parFiche.get(l.employeeId);
        const lu = litLaLigne({
          ligne: l, mobileMoney: fiche?.mobileMoney,
          confirmationLue: confirmations.find((c) => c.id === idDuBulletin(run.id, l.employeeId)),
          netAvantXof: netDuMoisDAvant(runs, run, l.employeeId),
          parFacture: l.prestataire ? totalAccepte(factureDe(factures, l.employeeId, run.period)) !== undefined : undefined,
          fraisParEnvoi: frais, calendrier: cal, maintenantMs: maintenant,
        });
        lectures.set(l.employeeId, lu);
        const n = numeroDeFiche(fiche);
        if (l.prestataire) {
          /* Une prestataire de l'équipe : payée sur sa facture, à sa date. */
          const cle = cleDeLigne('prestataire', l.employeeId);
          const numero = etatDuNumero({ nom: l.name, msisdn: n.msisdn, source: n.source, lecture, vu: l.nomMtnVu });
          /* Sa facture acceptée tient lieu de confirmation (litLaLigne) ; le
             numéro, lui, se juge ici comme pour tout prestataire. */
          const accepte = !!l.payeLe || totalAccepte(factureDe(factures, l.employeeId, run.period)) !== undefined;
          out.push(ligneADate({
            genre: 'prestataire', id: l.employeeId, nom: l.name, detail: 'Sa facture du mois', periode,
            montantXof: accepte ? lu.envoyeXof : 0, arret: accepte ? undefined : 'facture pas encore acceptée',
            msisdn: n.source === 'fiche' ? n.msisdn : undefined, numero, jour: jourLu(jours[cle]),
            validation: validations[cle], payeLe: l.payeLe, envois: envoisPresta,
          }));
          ctx.set(cle, { fiche, ligne: l, lecture: lu, ...(n.source === 'repris' ? { propose: n.msisdn } : {}) });
          continue;
        }
        const numero = etatDuNumero({ nom: l.name, msisdn: n.msisdn, source: n.source, lecture, vu: l.nomMtnVu });
        const ligne = ligneDeLEquipe({
          employeeId: l.employeeId, nom: l.name, runId: run.id, lecture: lu, ligne: l,
          pourboiresDuMoisXof: pourboiresDuMois(asArray(tips), l.employeeId, periode), numero, envois: envoisEquipe,
        });
        out.push(ligne);
        ctx.set(ligne.cle, { fiche, ligne: l, lecture: lu, pourboiresDuNet: Math.max(0, Math.round(l.gains?.pourboires ?? 0)), ...(n.source === 'repris' ? { propose: n.msisdn } : {}) });
      }
    } else {
      for (const f of fiches) {
        if (f.archiveeLe || f.contractType === 'prestataire') continue;
        const pb = pourboiresDuMois(asArray(tips), f.id, periode);
        if (pb <= 0) continue;
        const n = numeroDeFiche(f);
        const ligne = ligneDeLEquipe({
          employeeId: f.id, nom: f.name, runId: '', pourboiresDuMoisXof: pb,
          numero: etatDuNumero({ nom: f.name, msisdn: n.msisdn, source: n.source, lecture }), envois: [],
        });
        out.push(ligne);
        ctx.set(ligne.cle, { fiche: f });
      }
    }

    /* Les prestataires extérieurs : leurs missions du mois, à leur prix. */
    const providers = asArray<Provider>(providersBruts).filter((p) => p && p.branchId === branch.id && !p.archived);
    const missions = asArray<MissionDuPrestataire>(missionsBrutes);
    for (const p of providers) {
      const cle = cleDeLigne('prestataire', p.id);
      const v = validations[cle];
      const siennes = missions.filter((m) => m && m.providerId === p.id && m.branchId === branch.id && String(m.date ?? '').slice(0, 7) === periode
        && (!m.paidAt || m.method === 'MTN' || !!v?.missions?.includes(m.id)));
      if (!siennes.length) continue;
      const sansPrix = siennes.some((m) => !(m.amountXof > 0));
      const total = siennes.reduce((s, m) => s + Math.max(0, Math.round(m.amountXof || 0)), 0);
      const n = numeroDeFiche({ mobileMoney: p.mobileMoney, phone: p.phone });
      const numero = etatDuNumero({ nom: p.name, msisdn: n.msisdn, source: n.source, lecture, vu: vusDuRegistre[cle] });
      const detail = siennes.length === 1 ? `${siennes[0].label} · ${jourCourt(siennes[0].date)}` : `${siennes.length} missions · ${moisCourt(periode)}`;
      out.push(ligneADate({
        genre: 'prestataire', id: p.id, nom: p.name, detail, periode,
        montantXof: sansPrix ? null : total, msisdn: n.source === 'fiche' ? n.msisdn : undefined, numero,
        jour: jourLu(jours[cle] ?? JOUR_PAR_DEFAUT), validation: v,
        payeLe: siennes.every((m) => m.paidAt && m.method === 'MTN') ? siennes[0].paidAt : undefined,
        envois: envoisPresta,
      }));
      ctx.set(cle, { provider: p, missions: siennes, ...(n.source === 'repris' ? { propose: n.msisdn } : {}) });
    }

    /* Les entreprises : des fournisseurs avec leur bloc `paiement`, payées
       sur leur facture du mois, à leur date. */
    const lesFactures = asArray<FactureDEntreprise>(facturesBrutes).filter((x) => x && x.branchId === branch.id);
    for (const f of entreprisesDuCarnet(asArray<Fournisseur>(carnet), branch.id)) {
      const pmt = f.paiement;
      if (!pmt) continue;
      const cle = cleDeLigne('entreprise', f.id);
      const fac = factureDuMois(lesFactures, f.id, periode);
      const msisdn = lisLeNumero(pmt.msisdn).msisdn;
      const numero = etatDuNumero({ nom: f.nom, msisdn, source: msisdn ? 'saisi' : 'sans', lecture, vu: vusDuRegistre[cle] });
      out.push(ligneADate({
        genre: 'entreprise', id: f.id, nom: f.nom,
        detail: [pmt.agent, fac ? `facture ${fac.facture || 'sans numéro'}${fac.piece ? ' · jointe' : ''}` : 'pas de facture ce mois'].filter(Boolean).join(' · '),
        periode, montantXof: fac?.montantXof ?? 0, arret: arretDeLEntreprise(fac, msisdn), msisdn, numero, jour: jourLu(pmt.jour),
        validation: validations[cle], envois: envoisEnt,
      }));
      ctx.set(cle, { fournisseur: f, ...(fac ? { facture: fac } : {}) });
    }
    return { lignes: out, ctx, lectures };
  }, [run, runs, params, parFiche, fiches, confirmations, factures, cal, maintenant, lecture, tips, periode, envoisEquipe, envoisPresta, envoisEnt,
    providersBruts, missionsBrutes, carnet, facturesBrutes, branch.id, registre, mois.validations]);

  const equipe = lignes.filter((l) => l.genre === 'equipe');
  const prestataires = lignes.filter((l) => l.genre === 'prestataire');
  const entreprises = lignes.filter((l) => l.genre === 'entreprise');
  const remis = mois.remis ?? {};
  const c = chiffresDuMois(lignes, remis);
  const aValider = lignes.filter((l) => l.aValider);
  /* Sans le serveur MTN, rien ne se programme : une ligne validée attend le fichier du portail (Réglages). */
  const aProgrammer = serveur.pret ? lignes.filter((l) => l.aProgrammer) : [];
  const programmes = [...envoisEquipe, ...envoisPresta, ...envoisEnt].filter((e) => e.etat === 'programme');
  const dejaProgrammeXof = programmes.reduce((s, e) => s + e.montant_xof, 0);
  const aCouvrir = dejaProgrammeXof + [...aValider, ...aProgrammer].filter((l) => l.viaMtn && l.genre === 'equipe').reduce((s, l) => s + l.parMtnXof, 0);
  const ecartsDePourboires = equipe.filter((l) => run && (ctx.get(l.cle)?.pourboiresDuNet ?? 0) !== l.pourboiresXof).map((l) => l.cle);
  const points = pointsARegarder({ lignes, lectures, soldeXof: lecture?.soldeXof ?? null, aCouvrirXof: aCouvrir || c.parMtnXof - c.partisXof, ecartsDePourboires });
  const touchers = (mois.touchers ?? []).filter((t) => !t.annuleLe);
  const dernierToucher = touchers[touchers.length - 1];
  const tousPartis = c.virements > 0 && lignes.filter((l) => l.viaMtn).every((l) => l.etat === 'paye');

  /* ── Lire chez MTN : le solde, et le nom de chaque numéro ── */
  const numerosALire = useMemo(() => [...new Set([
    ...lignes.filter((l) => l.etat !== 'paye').map((l) => l.msisdn ?? ctx.get(l.cle)?.propose).filter((x): x is string => !!x),
  ])].slice(0, 40), [lignes, ctx]);
  const lire = async (dire = true) => {
    if (!serveur.pret) { if (dire) alerte('Le serveur MTN n’est pas encore prêt : les clés MTN ne sont pas posées.'); return; }
    const r = await lisChezMtn(numerosALire);
    if (r.erreur || !r.le) { if (dire) alerte(r.erreur ?? 'MTN n’a pas répondu.'); return; }
    ecrisLeMois(periode, (m) => ({ ...m, lectureMtn: { le: r.le as string, soldeXof: r.soldeXof ?? null, numeros: { ...(m.lectureMtn?.numeros ?? {}), ...(r.numeros ?? {}) } } }));
    if (dire) toast('Solde et noms lus chez MTN.');
  };
  const luUneFois = useRef<string | null>(null);
  useEffect(() => {
    if (!serveur.pret || !numerosALire.length || luUneFois.current === periode) return;
    const age = lecture ? Date.now() - Date.parse(lecture.le) : Infinity;
    if (age < DEUX_HEURES) return;
    luUneFois.current = periode;
    void lire(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serveur.pret, numerosALire.length, periode]);

  /* ── Les réponses de MTN : chaque reçu paie sa ligne ── */
  const ecrisLeRun = (change: (r: PayrollRun) => PayrollRun) => {
    if (!run) return;
    payrollRunsStore.set((prev) => asArray<PayrollRun>(prev).map((r) => (r.id === run.id ? change(r) : r)));
  };
  useEffect(() => {
    if (!run || fige) return;
    const lignesDuRun = asArray<PayrollLine>(run.lines);
    const a = appliqueLesRecus(lignesDuRun, run.id, envoisEquipe);
    const b = appliqueLesRecus(a.lignes, runPresta, envoisPresta);
    const payees = [...a.payees, ...b.payees];
    if (!payees.length) return;
    ecrisLeRun((x) => ({ ...x, lines: appliqueLesRecus(appliqueLesRecus(asArray<PayrollLine>(x.lines), x.id, envoisEquipe).lignes, runPresta, envoisPresta).lignes }));
    const parId = new Map(b.lignes.map((l) => [l.employeeId, l]));
    const ids = new Set(payees);
    bulletinsStore.set((prev) => asArray<BulletinPublie>(prev).map((x) => {
      const l = parId.get(x.employeeId);
      return x.runId === run.id && ids.has(x.employeeId) && l ? { ...x, payeLe: l.payeLe, ...(l.transactionMtn ? { transactionMtn: l.transactionMtn } : {}) } : x;
    }));
    toast(`${payees.length} paiement${payees.length > 1 ? 's' : ''} reçu${payees.length > 1 ? 's' : ''} chez MTN.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envoisEquipe, envoisPresta, run?.id, fige]);

  /* Les missions payées par MTN, et leur dépense (Sous-traitance). */
  useEffect(() => {
    const recus = envoisPresta.filter((e) => e.etat === 'recu');
    if (!recus.length) return;
    const validations = mois.validations ?? {};
    const missions = asArray<MissionDuPrestataire>(missionsStore.get());
    const charges: Expense[] = [];
    const payees = new Map<string, { paidAt: string; byName: string; expenseId: string }>();
    for (const e of recus) {
      const v = validations[cleDeLigne('prestataire', e.employee_id)];
      const p = asArray<Provider>(providersStore.get()).find((x) => x.id === e.employee_id);
      if (!v?.missions?.length || !p) continue;
      const jour = aCotonou(Date.parse(e.repondu_le ?? e.envoye_le ?? e.programme_le)).slice(0, 10);
      for (const id of v.missions) {
        const m = missions.find((x) => x.id === id);
        if (!m || m.paidAt) continue;
        const charge = chargeDeLaMission(m, p.name, '', jour);
        charges.push(charge as Expense);
        payees.set(m.id, { paidAt: e.repondu_le ?? nowIso(), byName: e.programme_par, expenseId: charge.id });
      }
    }
    if (!payees.size) return;
    missionsStore.set((prev) => prev.map((m) => { const x = payees.get(m.id); return x ? { ...m, ...x, method: 'MTN' } : m; }));
    const ids = new Set(charges.map((x) => x.id));
    expensesStore.set((prev) => [...charges, ...asArray<Expense>(prev).filter((x) => !ids.has(x.id))]);
    expenseCategoriesStore.set((prev) => (prev.some((x) => x.name === CHARGE_CATEGORY) ? prev : [...prev, { id: ID_CATEGORIE_CHARGE, name: CHARGE_CATEGORY, subs: [] }]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envoisPresta]);

  /* L'entreprise payée : sa dépense de fournisseur, une fois. */
  useEffect(() => {
    const neuves: Expense[] = [];
    const deja = new Set(asArray<Expense>(expensesStore.get()).map((x) => x.id));
    for (const e of envoisEnt.filter((x) => x.etat === 'recu')) {
      const f = asArray<Fournisseur>(fournisseursStore.get()).find((x) => x.id === e.employee_id);
      const fac = f && e.periode ? factureDuMois(asArray<FactureDEntreprise>(facturesDEntreprisesStore.get()), f.id, e.periode) : undefined;
      const d = f && fac ? depenseDeLEntreprise(f, fac, e) : null;
      if (d && !deja.has(d.id)) neuves.push(d as Expense);
    }
    if (!neuves.length) return;
    expensesStore.set((prev) => [...neuves, ...asArray<Expense>(prev)]);
    expenseCategoriesStore.set((prev) => (prev.some((x) => x.name === CHARGE_CATEGORY) ? prev : [...prev, { id: ID_CATEGORIE_CHARGE, name: CHARGE_CATEGORY, subs: [] }]));
    toast(`${neuves.length} facture${neuves.length > 1 ? 's' : ''} d’entreprise payée${neuves.length > 1 ? 's' : ''} : en Dépenses.`);
  }, [envoisEnt]);

  /* ── LES GESTES ─────────────────────────────────────────────────────── */
  const vusDe = (genre: 'equipe' | 'prestataire' | 'entreprise') => (id: string): NomMtnVu | undefined => {
    const l = genre !== 'entreprise' && run ? asArray<PayrollLine>(run.lines).find((x) => x.employeeId === id) : undefined;
    return l?.nomMtnVu ?? registre?.nomsVus?.[cleDeLigne(genre, id)];
  };

  /** Confie au serveur ce qui peut partir parmi ces lignes, chacune à son heure. */
  const programmeCes = async (cibles: readonly LigneDuMois[]): Promise<string[]> => {
    const dits: string[] = [];
    if (!serveur.pret || !cibles.length) return dits;
    const departEquipe = heureDeDepart(cal, Date.now());
    for (const genre of ['equipe', 'prestataire', 'entreprise'] as const) {
      const siennes = cibles.filter((l) => l.genre === genre && l.viaMtn);
      if (!siennes.length) continue;
      const runId = genre === 'equipe' ? run?.id : genre === 'prestataire' ? runPresta : runEnt;
      if (!runId) continue;
      if (genre === 'equipe') {
        const manque = ceQuiManque(lecture?.soldeXof, dejaProgrammeXof + siennes.reduce((s, l) => s + l.parMtnXof, 0));
        if (manque != null && manque > 0) {
          dits.push(`Salaires validés, mais pas programmés : le solde du ${COMPTE_DE_PAIE} ne couvre pas l’envoi (il manque ${F(manque)}). Alimentez le compte, lisez à nouveau chez MTN, puis touchez « Valider le mois ».`);
          continue;
        }
      }
      const items = siennes.map((l) => { const it = itemDeLaLigne(l); return it ? { ...it, partA: departDeLaLigne(l, departEquipe, Date.now()) } : null; })
        .filter((x): x is NonNullable<typeof x> => !!x);
      const r = await programmeLesLignes({
        runId, periode, items, envois: envoisDe(runId), lecture, vus: vusDe(genre), prevenir: genre === 'equipe',
      });
      if (r.erreur) { dits.push(r.erreur); continue; }
      const attendent = r.tri.attendent.filter((a) => a.pourquoi === 'nom' || a.pourquoi === 'inactif');
      if (attendent.length) dits.push(`${attendent.map((a) => a.nom).join(', ')} : le numéro attend votre mot.`);
      if (r.refuses.length) dits.push(`Le serveur a refusé ${r.refuses.length} envoi${r.refuses.length > 1 ? 's' : ''} : ${r.refuses.map((x) => x.erreur).join(' ; ')}.`);
    }
    relisTout();
    return dits;
  };

  const validerLeMois = async () => {
    if (!qui) { alerte('La validation dit qui valide : ce compte n’a pas de nom. Reconnectez-vous.'); return; }
    const cibles = [...aValider, ...aProgrammer];
    if (!cibles.length) return;
    const parMtn = cibles.filter((l) => l.viaMtn);
    const total = parMtn.reduce((s, l) => s + l.parMtnXof, 0);
    const nE = cibles.filter((l) => l.genre === 'equipe').length;
    const nP = cibles.filter((l) => l.genre === 'prestataire').length;
    const nEnt = cibles.filter((l) => l.genre === 'entreprise').length;
    if (!await demande({
      quoi: 'Les paiements du mois',
      titre: `Valider ${moisDit(periode)} : ${F(total)} par MTN ?`,
      dit: [
        nE ? `${nE} salaire${nE > 1 ? 's' : ''}${cal ? ` le ${momentDit(cal.paie.local)}` : ''}` : '',
        nP ? `${nP} prestataire${nP > 1 ? 's' : ''} à leur date, à 18 h` : '',
        nEnt ? `${nEnt} entreprise${nEnt > 1 ? 's' : ''} à leur date, à 18 h` : '',
      ].filter(Boolean).join(' ; ') + `. Depuis le ${COMPTE_DE_PAIE}. Validé par ${qui}.`,
      suite: `Pourboires en espèces le 5 : ${F(c.pourboiresXof)}.${cal ? ` Annulable jusqu’au ${jourEntierDit(cal.paie.local, false)} à 17 h 59.` : ''}`,
      accepter: 'Valider le mois',
      refuser: 'Pas encore',
    })) return;
    const le = nowIso();
    /* ① L'équipe : la validation de la paie du 5, telle quelle. */
    const equipeAValider = cibles.filter((l) => l.genre === 'equipe' && l.aValider).map((l) => l.id);
    if (run && equipeAValider.length) {
      const courant = asArray<PayrollRun>(payrollRunsStore.get()).find((r) => r.id === run.id) ?? run;
      const lu = new Map([...lectures].filter(([id]) => equipeAValider.includes(id)));
      const r = valideLesLignes(asArray<PayrollLine>(courant.lines), lu, qui, le);
      if (r.erreur) { alerte(r.erreur); return; }
      ecrisLeRun((x) => ({
        ...x, lines: r.lignes,
        paieDu5: { ...(x.paieDu5 ?? {}), validations: [...(x.paieDu5?.validations ?? []), { par: qui, le, employeeIds: r.validees }] },
      }));
    }
    /* ② Les prestataires et les entreprises : leur validation, à leur date. */
    const aDate = cibles.filter((l) => l.genre !== 'equipe' && l.aValider);
    ecrisLeMois(periode, (m) => {
      const v = { ...(m.validations ?? {}) };
      for (const l of aDate) {
        const val = validationDe(l, qui, le, ctx.get(l.cle)?.missions?.map((x) => x.id));
        if (val) v[l.cle] = val;
      }
      return { ...m, validations: v, touchers: [...(m.touchers ?? []), { par: qui, le, cles: cibles.map((l) => l.cle) }] };
    });
    toast(`${moisDit(periode)} validé par ${qui}.`);
    if (!serveur.pret) {
      alerte('Validé. L’envoi par l’API MTN s’allume quand les clés MTN sont posées : d’ici là, les salaires passent par le fichier du portail (Réglages).', 12000);
      return;
    }
    const dits = await programmeCes(cibles.map((l) => (l.aValider ? { ...l, etat: 'valide' as const } : l)));
    if (dits.length) alerte(dits.join(' '), 14000);
  };

  const validerALaLigne = async (l: LigneDuMois) => {
    if (!qui || !seValideAPart(l)) return;
    if (!await demande({
      quoi: l.etat === 'toucher-a-part' ? 'Toucher à part' : 'Nouveau toucher',
      titre: `Valider ${F(l.parMtnXof)} pour ${l.nom} ?`,
      dit: `${l.date ? `Part le ${jourCourt(l.date.jour)} à 18 h` : 'Part à sa date'}, par MTN, sur le ${numeroDit(l.msisdn ?? '')}. Validé par ${qui}.`,
      accepter: 'Valider cette ligne',
      refuser: 'Pas encore',
    })) return;
    const vivant = l.envoi && l.envoi.etat === 'programme' ? l.envoi : undefined;
    if (vivant) {
      const r = await annule([vivant.reference]);
      if (r.erreur) { alerte(r.erreur); return; }
    }
    const val = validationDe(l, qui, nowIso(), ctx.get(l.cle)?.missions?.map((x) => x.id));
    if (!val) return;
    ecrisLeMois(periode, (m) => ({ ...m, validations: { ...(m.validations ?? {}), [l.cle]: { ...val, aPart: true } } }));
    const dits = await programmeCes([{ ...l, etat: 'valide', envoi: undefined }]);
    if (dits.length) alerte(dits.join(' '), 12000);
    else toast(`${l.nom} : validé${serveur.pret ? ', programmé' : ''}.`);
  };

  const annulerLeMois = async () => {
    if (!programmes.length && !touchers.length) return;
    if (!await demande({
      quoi: 'Les paiements du mois',
      titre: `Annuler le toucher de ${moisDit(periode)} ?`,
      dit: `${programmes.length} envoi${programmes.length > 1 ? 's' : ''} programmé${programmes.length > 1 ? 's' : ''} (${F(dejaProgrammeXof)}) ne partiront pas. Ce qui est déjà parti ne change pas.`,
      suite: 'Les lignes reviennent à valider.',
      accepter: 'Annuler le toucher',
      refuser: 'Garder',
    })) return;
    if (programmes.length) {
      const r = await annule(programmes.map((e) => e.reference));
      if (r.erreur) { alerte(r.erreur); return; }
    }
    const partis = new Set([...envoisEquipe, ...envoisPresta, ...envoisEnt].filter((e) => e.etat !== 'programme' && e.etat !== 'annule' && e.etat !== 'refuse').map((e) => `${e.run_id}:${e.employee_id}`));
    if (run) {
      ecrisLeRun((x) => ({
        ...x,
        lines: asArray<PayrollLine>(x.lines).map((l) => (l.validation && !ligneEstPayee(l) && !partis.has(`${x.id}:${l.employeeId}`) ? { ...l, validation: undefined } : l)),
      }));
    }
    ecrisLeMois(periode, (m) => {
      const v = { ...(m.validations ?? {}) };
      for (const cle of Object.keys(v)) {
        const [genre, id] = [cle.slice(0, cle.indexOf(':')), cle.slice(cle.indexOf(':') + 1)];
        const runId = genre === 'prestataire' ? runPresta : runEnt;
        if (!partis.has(`${runId}:${id}`)) delete v[cle];
      }
      const t = [...(m.touchers ?? [])];
      for (let i = t.length - 1; i >= 0; i -= 1) if (!t[i].annuleLe) { t[i] = { ...t[i], annuleLe: nowIso(), annulePar: qui }; break; }
      return { ...m, validations: v, touchers: t };
    });
    relisTout();
    toast('Toucher annulé : rien de programmé ne part.');
  };

  const changeLeJour = async (l: LigneDuMois, jour: JourDePaie) => {
    if (l.jour === jour) return;
    const vivant = l.envoi && l.envoi.etat === 'programme' ? l.envoi : undefined;
    if (vivant) {
      if (!await demande({
        quoi: 'Date de paie',
        titre: `Changer la date de ${l.nom} ?`,
        dit: `L’envoi programmé (${F(vivant.montant_xof)}) est annulé ; la ligne attend votre toucher, elle seule.`,
        accepter: 'Changer la date',
        refuser: 'Garder la date',
      })) return;
      const r = await annule([vivant.reference]);
      if (r.erreur) { alerte(r.erreur); return; }
      relisTout();
    }
    if (l.genre === 'entreprise') {
      fournisseursStore.set((prev) => asArray<Fournisseur>(prev).map((f) => (f.id === l.id && f.paiement ? { ...f, paiement: { ...f.paiement, jour } } : f)));
    } else ecrisLeRegistre((r) => ({ ...r, jours: { ...(r.jours ?? {}), [l.cle]: jour } }));
  };

  const basculeRemis = (l: LigneDuMois) => {
    ecrisLeMois(periode, (m) => {
      const r = { ...(m.remis ?? {}) };
      if (r[l.id]) delete r[l.id]; else r[l.id] = { par: qui || 'La direction', le: nowIso(), montantXof: l.pourboiresXof };
      return { ...m, remis: r };
    });
  };

  /** « Prendre » : le numéro proposé devient celui de la fiche (la garde des
      sept jours part de ce jour, inchangée). */
  type Cible = { cle: string; nom: string; propose: string; fiche?: StaffMember; provider?: Provider };
  const ciblesDe = (cles: string[]): Cible[] => cles.flatMap((k) => {
    const l = lignes.find((x) => x.cle === k);
    const x = ctx.get(k);
    return l && x?.propose ? [{ cle: k, nom: l.nom, propose: x.propose, fiche: x.fiche, provider: x.provider }] : [];
  });
  const prendre = async (cibles: Cible[], avecMot = false) => {
    if (!cibles.length || !qui) return;
    if (!await demande({
      quoi: 'Les numéros MTN',
      titre: cibles.length > 1 ? `Prendre les ${cibles.length} numéros ?` : `Prendre le ${numeroDit(cibles[0].propose)} pour ${cibles[0].nom} ?`,
      dit: avecMot ? `MTN dit un autre nom : ${cibles.map((y) => `${y.nom}, ${lecture?.numeros?.[y.propose]?.nom ?? 'nom inconnu'}`).join(' ; ')}. Vous confirmez que ce numéro est bien le sien.`
        : `Le téléphone de la fiche devient son numéro MTN : ${cibles.map((y) => y.nom).join(', ')}.`,
      suite: 'Garde de 7 jours : un numéro posé ce jour reçoit après sept jours, ou après sa revalidation.',
      accepter: cibles.length > 1 ? `Prendre les ${cibles.length}` : 'Prendre ce numéro',
      refuser: 'Je vérifie d’abord',
    })) return;
    const le = nowIso();
    let pris = 0;
    for (const y of cibles) {
      const nomMtn = lecture?.numeros?.[y.propose]?.nom;
      const vu: NomMtnVu | undefined = avecMot && nomMtn ? { par: qui, le, msisdn: y.propose, nomMtn } : undefined;
      if (y.fiche) {
        const fiche = y.fiche;
        const r = numeroDeLaFiche(fiche.mobileMoney, y.propose, 'MTN', le, qui);
        if (r.erreur || !r.mobileMoney) { alerte(`${fiche.name} : ${r.erreur ?? 'numéro illisible'}`); continue; }
        const mm = r.mobileMoney;
        staffStore.set((prev) => prev.map((m) => (m.id === fiche.id ? { ...m, mobileMoney: mm } : m)));
        if (vu && run) ecrisLeRun((z) => ({ ...z, lines: asArray<PayrollLine>(z.lines).map((w) => (w.employeeId === fiche.id ? { ...w, nomMtnVu: vu } : w)) }));
        pris += 1;
      } else if (y.provider) {
        const p = y.provider;
        const r = numeroDeLaFiche(p.mobileMoney, y.propose, 'MTN', le, qui);
        if (r.erreur || !r.mobileMoney) { alerte(`${p.name} : ${r.erreur ?? 'numéro illisible'}`); continue; }
        const mm = r.mobileMoney;
        providersStore.set((prev) => prev.map((z) => (z.id === p.id ? { ...z, mobileMoney: mm } : z)));
        if (vu) ecrisLeRegistre((reg) => ({ ...reg, nomsVus: { ...(reg.nomsVus ?? {}), [y.cle]: vu } }));
        pris += 1;
      }
    }
    if (pris) toast(`${pris} numéro${pris > 1 ? 's' : ''} pris.`);
  };

  const cEstBienSonNumero = async (l: LigneDuMois) => {
    if (!qui || !l.msisdn || !l.nomMtn) return;
    if (!await demande({
      quoi: 'Les numéros MTN',
      titre: `Le ${numeroDit(l.msisdn)} est-il bien celui de ${l.nom} ?`,
      dit: `MTN dit que ce numéro est au nom de ${l.nomMtn}.`,
      suite: `Vérifié par ${qui}, pour ce numéro et ce nom seulement.`,
      accepter: 'C’est bien son numéro',
      refuser: 'Je vérifie d’abord',
    })) return;
    const vu: NomMtnVu = { par: qui, le: nowIso(), msisdn: l.msisdn, nomMtn: l.nomMtn };
    if (l.genre !== 'entreprise' && run && asArray<PayrollLine>(run.lines).some((x) => x.employeeId === l.id)) ecrisLeRun((y) => ({ ...y, lines: asArray<PayrollLine>(y.lines).map((z) => (z.employeeId === l.id ? { ...z, nomMtnVu: vu } : z)) }));
    else ecrisLeRegistre((r) => ({ ...r, nomsVus: { ...(r.nomsVus ?? {}), [l.cle]: vu } }));
  };

  const accorde = async (l: LigneDuMois) => {
    const lu = lectures.get(l.id);
    const b = lu?.blocages.find((x) => x.code === 'plafond');
    if (!b || !lu || !qui) return;
    if (!await demande({
      quoi: 'Le plafond du mois',
      titre: `Accepter ${F(lu.netXof)} pour ${l.nom} ?`,
      dit: phraseDuBlocage(b, F),
      suite: `Accepté par ${qui}, pour ce net seulement : un autre montant redemandera l’accord.`,
      accepter: 'Accepter ce net',
      refuser: 'Ne rien faire',
    })) return;
    ecrisLeRun((x) => ({ ...x, lines: asArray<PayrollLine>(x.lines).map((y) => (y.employeeId === l.id ? { ...y, accordPlafond: { par: qui, le: nowIso(), netXof: lu.netXof } } : y)) }));
  };

  const revalide = async (l: LigneDuMois) => {
    const fiche = ctx.get(l.cle)?.fiche;
    const mm = fiche?.mobileMoney;
    if (!fiche || !mm || !qui) return;
    if (!await demande({
      quoi: 'Numéro mobile money',
      titre: `Revalider le ${numeroDit(mm.numero)} de ${fiche.name} ?`,
      dit: `Il a changé le ${quandDit(mm.changeLe)}. Vous confirmez qu’il est bien le sien.`,
      suite: `Revalidé par ${qui}.`,
      accepter: 'Revalider ce numéro',
      refuser: 'Ne rien faire',
    })) return;
    staffStore.set((prev) => prev.map((m) => (m.id === fiche.id && m.mobileMoney ? { ...m, mobileMoney: { ...m.mobileMoney, revalidePar: qui, revalideLe: nowIso() } } : m)));
  };

  const poseLePrix = () => {
    if (!prixAPoser) return;
    const v = Number.parseInt(prixAPoser.valeur.replace(/\D/g, ''), 10);
    if (!(v > 0)) { alerte('Le prix est un nombre entier de francs, plus grand que zéro.'); return; }
    missionsStore.set((prev) => prev.map((m) => (m.id === prixAPoser.missionId
      ? { ...m, amountXof: v, note: [m.note && !/^Montant à écrire/.test(m.note) ? m.note : '', `Prix posé par ${qui || 'la direction'} le ${quandDit(nowIso())}.`].filter(Boolean).join(' ') }
      : m)));
    setPrixAPoser(null);
    toast(`${F(v)} posés.`);
  };

  const renvoyer = async (l: LigneDuMois) => {
    const e = l.envoi;
    if (!e || e.etat !== 'refuse') return;
    if (!await demande({
      quoi: 'La paie par MTN',
      titre: `Renvoyer ${F(e.montant_xof)} à ${l.nom} ?`,
      dit: `MTN avait refusé : ${raisonDite(e.raison)}. Le renvoi part tout de suite, avec une nouvelle référence ; l’ancienne reste notée.`,
      scelle: 'Vérifiez d’abord le numéro.',
      accepter: 'Renvoyer',
      refuser: 'Ne rien faire',
    })) return;
    const r = await renvoie(e.reference, l.msisdn);
    if (r.erreur) { alerte(r.erreur); return; }
    relisTout();
  };

  /* ── LE TEST MTN ────────────────────────────────────────────────────── */
  const montantsDuTest = registre?.test?.montants ?? {};
  const lignesTest = lignesDuTest(fiches, montantsDuTest);
  const dernierEssai = envoisEssai[0]?.essai_id ?? null;
  const duDernierEssai = useMemo(() => derniersParPersonne(envoisEssai.filter((e) => e.essai_id === dernierEssai)), [envoisEssai, dernierEssai]);
  const bilan = bilanDeLEssai(duDernierEssai);
  const reussi = testReussi(bilan);
  useEffect(() => {
    if (!dernierEssai) return;
    const d = depenseDeLEssai({ essaiId: dernierEssai, branchId: branch.id, bilan, jour: jourLocalDe() });
    if (!d || asArray<Expense>(expensesStore.get()).some((x) => x.id === d.id)) return;
    expensesStore.set((prev) => [d as Expense, ...asArray<Expense>(prev)]);
    toast(`Dépense inscrite : ${d.label}, ${F(d.amountXof)}.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dernierEssai, bilan.fini, bilan.recuXof, branch.id]);

  const changeMontantDuTest = (prenom: string, v: string) => {
    const n = Number.parseInt(v.replace(/\D/g, ''), 10);
    ecrisLeRegistre((r) => ({ ...r, test: { ...(r.test ?? {}), montants: { ...(r.test?.montants ?? {}), [prenom]: Number.isFinite(n) ? n : 0 } } }));
  };
  const envoyerLeTest = async () => {
    const refus = pourquoiPasLeTest(lignesTest);
    if (refus) { alerte(refus); return; }
    if (!qui) { alerte('Le test dit qui l’envoie : ce compte n’a pas de nom. Reconnectez-vous.'); return; }
    const items = lignesTest.filter((l) => l.ficheId && l.msisdn && !l.repris && l.montantXof > 0)
      .map((l) => ({ employeeId: l.ficheId as string, nom: l.nom as string, msisdn: l.msisdn as string, montantXof: l.montantXof }));
    if (!await demande({
      quoi: 'Le test MTN',
      titre: `Envoyer le test : ${F(totalDuTest(lignesTest))} ?`,
      dit: `${items.map((x) => `${x.nom}, ${F(x.montantXof)}`).join(' ; ')}. Tout de suite, depuis le ${COMPTE_DE_PAIE}.`,
      suite: 'Offerts par la Maison : dépense « Essai de paie MTN ». Les bulletins ne bougent pas.',
      accepter: 'Envoyer le test',
      refuser: 'Pas maintenant',
    })) return;
    setPart(true);
    try {
      const lu = await lisChezMtn(items.map((x) => x.msisdn));
      if (lu.erreur || !lu.le) { alerte(lu.erreur ?? 'MTN n’a pas répondu : rien n’est parti.'); return; }
      const numeros = lu.numeros ?? {};
      ecrisLeMois(periode, (m) => ({ ...m, lectureMtn: { le: lu.le as string, soldeXof: lu.soldeXof ?? null, numeros: { ...(m.lectureMtn?.numeros ?? {}), ...numeros } } }));
      const partent = items.filter((x) => numeros[x.msisdn]?.actif !== false);
      const total = partent.reduce((s, x) => s + x.montantXof, 0);
      if (lu.soldeXof != null && lu.soldeXof < total) { alerte(`Le ${COMPTE_DE_PAIE} n’a que ${F(lu.soldeXof)} : il faut ${F(total)}. Rien n’est parti.`); return; }
      if (!partent.length) { alerte('MTN dit qu’aucun de ces numéros n’a de compte MoMo actif. Rien n’est parti.'); return; }
      const r = await teste(idDeLEssai(Date.now()), partent);
      if (r.erreur) { alerte(r.erreur); return; }
      toast(`Test parti : ${r.inscrits?.length ?? 0} envoi${(r.inscrits?.length ?? 0) > 1 ? 's' : ''}.`);
      if (r.refuses?.length) alerte(`Le serveur a refusé ${r.refuses.length} envoi${r.refuses.length > 1 ? 's' : ''} : ${r.refuses.map((x) => x.erreur).join(' ; ')}.`, 12000);
    } finally {
      setPart(false);
      relisEssai();
    }
  };
  const relancerA500 = async (e: EnvoiMtn) => {
    if (!e.essai_id || !seRelanceA500(e)) return;
    if (!await demande({
      quoi: 'Le test MTN',
      titre: `Relancer à ${F(MONTANT_ESSAI_MAX)} pour ${e.nom} ?`,
      dit: `MTN avait refusé ${F(e.montant_xof)} : ${raisonDite(e.raison)}. Le test repart tout de suite, à ${F(MONTANT_ESSAI_MAX)}.`,
      accepter: `Relancer à ${F(MONTANT_ESSAI_MAX)}`,
      refuser: 'Ne rien faire',
    })) return;
    const r = await teste(e.essai_id, [{ employeeId: e.employee_id, nom: e.nom, msisdn: e.msisdn, montantXof: MONTANT_ESSAI_MAX }]);
    if (r.erreur) alerte(r.erreur);
    relisEssai();
  };

  /* ── LES PRÊTS DE L'ÉQUIPE (jamais ceux du foyer ni des associés) ── */
  const pretsDeLEquipe = useMemo(() => {
    const lignesPrets = asArray(prets).filter((p) => p && p.branchId === branch.id && p.genre === 'equipe');
    return soldesParEmprunteur(lignesPrets, branch.id).filter((s) => s.reste > 0).map((s) => {
      const l = run ? asArray<PayrollLine>(run.lines).find((x) => (s.personneId && x.employeeId === s.personneId) || x.name.trim().toLowerCase() === s.nom.trim().toLowerCase()) : undefined;
      const siennes = lignesPrets.filter((p) => p.associe.trim().toLowerCase() === s.nom.trim().toLowerCase());
      const premier = siennes.filter((p) => p.type === 'pret').sort((a, b) => a.date.localeCompare(b.date))[0];
      const retenue = Math.max(0, Math.round(l?.deductions?.retenuePret ?? 0));
      const resteAvant = l?.pret?.resteAvantXof ?? s.reste;
      const mens = l?.pret?.prevuXof ?? retenue;
      const faites = new Map<string, number>();
      for (const p of siennes.filter((x) => x.type === 'remboursement')) faites.set(p.date.slice(0, 7), (faites.get(p.date.slice(0, 7)) ?? 0) + p.amountXof);
      const e = echeancierDuPret({
        preteXof: s.prete, resteAvantXof: resteAvant, periode, retenueDuMoisXof: retenue,
        faites: [...faites].map(([m, n]) => ({ mois: m, montantXof: n })).sort((a, b) => a.mois.localeCompare(b.mois)),
        avenir: projectionDeLaRetenue(Math.max(0, resteAvant - retenue), mens, moisSuivant(periode)),
      });
      return { nom: s.nom, prete: s.prete, premier: premier?.date, mens, ...e };
    });
  }, [prets, branch.id, run, periode]);

  /* ── LA GARDE DE L'ÉCRAN ────────────────────────────────────────────── */
  if (!estSouverain) {
    return (
      <div className="lp mnd-rise">
        <div className="lp-tete"><div><span className="lp-sourcil">Équipe · Les paiements</span><h1>Les paiements.</h1><span className="lp-doux">Réservés à la direction.</span></div></div>
      </div>
    );
  }

  /* ── CE QUI SE LIT ──────────────────────────────────────────────────── */
  const phase = cal ? phaseDuMois(cal, maintenant) : 'confirmation';
  const confirmees = equipe.filter((l) => l.etat !== 'attend' && l.etat !== 'erreur' && !!lectures.get(l.id)).length;
  const valide = !!dernierToucher || (equipe.some((l) => l.etat === 'valide' || l.etat === 'programme' || l.etat === 'envoi' || l.etat === 'paye') && !equipe.some((l) => l.etat === 'confirme'));
  const etatDuMois = tousPartis
    ? { fait: true, texte: `Payé · ${F(c.partisXof)} partis` }
    : !aValider.length && (dernierToucher || programmes.length)
      ? { fait: true, texte: cal ? `Validé · part le ${jourEntierDit(cal.paie.local, false).replace(/ \d{4}$/, '')} à 18 h` : 'Validé' }
      : { fait: false, texte: points.length ? `À valider · ${points.length} point${points.length > 1 ? 's' : ''}` : 'Prêt à valider' };
  const annulable = (programmes.length > 0 || touchers.length > 0) && peutAnnuler(cal?.paie.ms, maintenant) && !fige;
  const jourDeLaPaie = cal ? jourCourt(cal.jourDePaie) : '';
  const pas = (atteint: boolean, ici: boolean) => `lp-pas${atteint ? ' lp-pas--passe' : ''}${ici ? ' lp-pas--ici' : ''}`;
  const aDateTousPayes = [...prestataires, ...entreprises].filter((l) => l.viaMtn).every((l) => l.etat === 'paye');
  const ligneParCle = (cle: string) => lignes.find((l) => l.cle === cle);
  const noms = (p: PointARegarder) => p.cles.map((k) => ligneParCle(k)?.nom).filter(Boolean).join(', ');

  const pastille = (l: LigneDuMois) => {
    const e = l.envoi;
    switch (l.etat) {
      case 'paye': return <span className="lp-pastille lp-pastille--paye">Payé{e?.repondu_le ? ` · ${aLaMinute(e.repondu_le)}` : ''}</span>;
      case 'envoi': return <span className="lp-pastille lp-pastille--envoi">Envoi…</span>;
      case 'programme': return <span className="lp-pastille lp-pastille--ok">Programmé{e ? ` · ${aLaMinute(e.part_a)}` : ''}</span>;
      case 'refuse': return <span className="lp-pastille lp-pastille--attend" title={raisonDite(e?.raison)}>Refusé par MTN</span>;
      case 'valide': return <span className="lp-pastille lp-pastille--ok">Validé{serveur.pret ? '' : ' · envoi à brancher'}</span>;
      case 'confirme': return <span className="lp-pastille lp-pastille--ok">{l.genre === 'equipe' ? 'Confirmé' : `Prêt · ${l.date ? jourCourt(l.date.jour) : ''}${l.date?.decaleAuLundi ? ' (dimanche → lundi)' : ''}`}</span>;
      case 'toucher-a-part': return <span className="lp-pastille lp-pastille--attend">Toucher à part · {l.date ? jourCourt(l.date.jour) : ''}</span>;
      case 'ne-part-pas': return <span className="lp-pastille lp-pastille--non">Ne part pas{l.pourquoi ? ` · ${l.pourquoi}` : ''}</span>;
      default: return <span className="lp-pastille lp-pastille--attend">{ETAT_DIT[l.etat]}</span>;
    }
  };
  const numero = (l: LigneDuMois) => {
    const propose = ctx.get(l.cle)?.propose;
    if (l.numero === 'repris') return <span className="lp-numero">{numeroMasque(propose)}<span className="lp-numero__p">repris de la fiche</span></span>;
    if (l.numero === 'sans') return <span className="lp-numero lp-vide">sans numéro</span>;
    if (l.numero === 'autre-voie') return <span className="lp-numero lp-vide">Moov</span>;
    return (
      <span className="lp-numero">{numeroMasque(l.msisdn)}
        {l.numero === 'verifie' && <span className="lp-numero__v" title="Nom vérifié chez MTN">✓</span>}
        {l.numero === 'non-lu' && <span className="lp-numero__p">nom pas encore lu</span>}
        {l.numero === 'differe' && <span className="lp-numero__p">MTN : {l.nomMtn}</span>}
        {l.numero === 'inactif' && <span className="lp-numero__p">sans MoMo</span>}
      </span>
    );
  };
  const choixDuJour = (l: LigneDuMois) => (
    <Select
      className="lp-jour" aria-label={`Date de paie de ${l.nom}`} value={String(l.jour ?? JOUR_PAR_DEFAUT)}
      disabled={fige || l.etat === 'paye' || l.etat === 'envoi'}
      onChange={(e) => void changeLeJour(l, jourLu(e.target.value))}
    >
      {JOURS_POSSIBLES.map((j) => <option key={String(j)} value={String(j)}>{jourDit(j)}</option>)}
    </Select>
  );

  const bulletin = (l: LigneDuMois) => {
    const x = ctx.get(l.cle);
    const pl = x?.ligne;
    const lu = x?.lecture;
    if (!pl || !lu) return <div className="lp-bulletin"><p>Pas encore de bulletin ce mois : le run se crée dans Réglages.</p></div>;
    const det = detailDuBulletin(pl, lu.voie, lu.fraisXof);
    const avant = run ? netDuMoisDAvant(runs, run, l.id) : undefined;
    return (
      <div className="lp-bulletin">
        <div className="lp-bulletin__grille">
          {det.lignes.map((d, i) => <div key={i}><span>{d.libelle}</span><span>{d.retenue ? '− ' : ''}{F(d.montantXof)}</span></div>)}
          <div className="lp-bulletin__net"><span>Net du bulletin</span><span>{F(det.netXof)}</span></div>
          {lu.fraisXof > 0 && <div><span>{libelleDesFrais(lu.voie)}</span><span>− {F(lu.fraisXof)}</span></div>}
          {(x?.pourboiresDuNet ?? 0) > 0 && <div><span>Dont pourboires, en espèces</span><span>− {F(x?.pourboiresDuNet ?? 0)}</span></div>}
          <div className="lp-bulletin__mtn"><span>Par MTN</span><span>{l.viaMtn ? F(l.parMtnXof) : '–'}</span></div>
          <div><span>Pourboires du mois · espèces le 5</span><span>{F(l.pourboiresXof)}</span></div>
          <div><span>{avant != null ? moisDit(moisPrecedent(periode)) : 'Mois d’avant'}</span><span>{avant != null ? F(avant) : '–'}</span></div>
          {l.envoi && <div><span>Référence MTN</span><span>{l.envoi.reference.slice(0, 8)}</span></div>}
        </div>
        {lu.blocages.length > 0 && l.etat !== 'paye' && lu.blocages.map((b, i) => <p key={i}>{phraseDuBlocage(b, F)}</p>)}
        {lu.etat === 'a-confirmer' && lu.attente && <p>{lu.attente}</p>}
        {lu.derniereReponse?.etat === 'erreur' && <p>Erreur signalée le {quandDit(lu.derniereReponse.le)}{lu.derniereReponse.mot ? ` : « ${lu.derniereReponse.mot} »` : ''}.</p>}
        {l.envoi && <p>MTN : {ETAT_DE_L_ENVOI_DIT[l.envoi.etat]}{l.envoi.transaction_mtn ? ` · transaction ${l.envoi.transaction_mtn}` : ''}{l.envoi.etat === 'refuse' ? ` · ${raisonDite(l.envoi.raison)}` : ''}.</p>}
        {!fige && l.etat !== 'paye' && (
          <div className="lp-gestes">
            {lu.blocages.some((b) => b.code === 'plafond') && <Button size="sm" variant="copper" onClick={() => void accorde(l)}>Accepter ce net</Button>}
            {lu.blocages.some((b) => b.code === 'numero-recent') && <Button size="sm" variant="copper" onClick={() => void revalide(l)}>Revalider le numéro</Button>}
            {l.etat === 'refuse' && <Button size="sm" variant="ghost" onClick={() => void renvoyer(l)}>Renvoyer avec votre toucher</Button>}
          </div>
        )}
      </div>
    );
  };

  const point = (p: PointARegarder, i: number) => {
    const ls = p.cles.map(ligneParCle).filter((l): l is LigneDuMois => !!l);
    let corps: ReactNode;
    let gestes: ReactNode = null;
    switch (p.code) {
      case 'numero-repris': {
        const prenables = ls.filter((l) => peutPrendre(l.nom, ctx.get(l.cle)?.propose, lecture) === 'oui');
        const aSonMot = ls.filter((l) => peutPrendre(l.nom, ctx.get(l.cle)?.propose, lecture) === 'son-mot');
        const lus = ls.filter((l) => lecture?.numeros?.[ctx.get(l.cle)?.propose ?? '']?.nom);
        corps = <><strong>{ls.length} numéro{ls.length > 1 ? 's' : ''} repris des fiches</strong> · {noms(p)} · <span className="lp-doux">{lus.length ? `MTN : ${prenables.length} nom${prenables.length > 1 ? 's' : ''} conforme${prenables.length > 1 ? 's' : ''}${aSonMot.length ? `, ${aSonMot.length} différent${aSonMot.length > 1 ? 's' : ''}` : ''}` : 'nom pas encore lu chez MTN'}</span></>;
        gestes = <>{prenables.length > 0 && <Button size="sm" variant="copper" onClick={() => void prendre(ciblesDe(prenables.map((l) => l.cle)))}>{prenables.length > 1 ? `Prendre les ${prenables.length}` : 'Prendre'}</Button>}
          {aSonMot.map((l) => <Button key={l.cle} size="sm" variant="ghost" onClick={() => void prendre(ciblesDe([l.cle]), true)}>{l.nom} : c’est bien son numéro</Button>)}</>;
        break;
      }
      case 'nom-differe':
        corps = <><strong>Nom différent chez MTN</strong> · {ls.map((l) => `${l.nom} : MTN dit ${l.nomMtn}`).join(' · ')} · <span className="lp-doux">ne part pas sans votre mot</span></>;
        gestes = <>{ls.map((l) => <Button key={l.cle} size="sm" variant="copper" onClick={() => void cEstBienSonNumero(l)}>{ls.length > 1 ? `${l.nom} : c’est bien son numéro` : 'C’est bien son numéro'}</Button>)}</>;
        break;
      case 'numero-inactif':
        corps = <><strong>Sans compte MoMo MTN</strong> · {noms(p)} · <span className="lp-doux">corrigez le numéro sur la fiche</span></>;
        break;
      case 'plafond':
        corps = <>{ls.map((l) => { const lu = lectures.get(l.id); const pct = lu?.plafond && lu.plafond.netAvantXof > 0 ? Math.round(((lu.netXof - lu.plafond.netAvantXof) / lu.plafond.netAvantXof) * 100) : null; return <span key={l.cle}><strong>{l.nom} · net {pct != null ? `+ ${pct} %` : 'au-dessus'}</strong> sur {moisDit(moisPrecedent(periode))} · <span className="lp-doux">plafond + 25 %</span> </span>; })}</>;
        gestes = <>{ls.map((l) => <Fragment key={l.cle}><Button size="sm" variant="ghost" onClick={() => setOuverte(l.cle)}>Voir</Button><Button size="sm" variant="copper" onClick={() => void accorde(l)}>Accepter</Button></Fragment>)}</>;
        break;
      case 'numero-garde':
        corps = <><strong>Numéro changé depuis moins de 7 jours</strong> · {noms(p)} · <span className="lp-doux">part après sa revalidation</span></>;
        gestes = <>{ls.map((l) => <Button key={l.cle} size="sm" variant="copper" onClick={() => void revalide(l)}>{ls.length > 1 ? `Revalider ${l.nom}` : 'Revalider'}</Button>)}</>;
        break;
      case 'sans-prix': {
        const m = ls.flatMap((l) => (ctx.get(l.cle)?.missions ?? []).filter((x) => !(x.amountXof > 0)).map((x) => ({ l, x })))[0];
        corps = <><strong>{noms(p)} · mission sans prix</strong>{m ? <> · {m.x.label} · {jourCourt(m.x.date)}</> : null} · <span className="lp-doux">ne part pas sans prix</span></>;
        gestes = m ? (prixAPoser?.missionId === m.x.id
          ? <><Input className="lp-prix" inputMode="numeric" autoFocus value={prixAPoser.valeur} aria-label="Prix de la mission" onChange={(e) => setPrixAPoser({ missionId: m.x.id, valeur: e.target.value })} /><Button size="sm" variant="copper" onClick={poseLePrix}>Poser</Button></>
          : <Button size="sm" variant="copper" onClick={() => setPrixAPoser({ missionId: m.x.id, valeur: '' })}>Poser le prix</Button>) : null;
        break;
      }
      case 'sans-facture':
        corps = <><strong>{noms(p)} · facture manquante</strong> · <span className="lp-doux">sans facture jointe, rien ne part</span></>;
        gestes = <>{ls.map((l) => { const x = ctx.get(l.cle); return x?.fournisseur ? <Button key={l.cle} size="sm" variant="copper" onClick={() => setSaisie({ quoi: 'facture', fournisseur: x.fournisseur as Fournisseur, facture: x.facture })}>{x.facture ? `Joindre la facture${ls.length > 1 ? ` · ${l.nom}` : ''}` : `+ Facture${ls.length > 1 ? ` · ${l.nom}` : ''}`}</Button> : null; })}</>;
        break;
      case 'confirmation': {
        const depot = ls.some((l) => /déposé|dépôt|déposez/.test(lectures.get(l.id)?.attente ?? ''));
        corps = <><strong>{ls.length} confirmation{ls.length > 1 ? 's' : ''} attendue{ls.length > 1 ? 's' : ''}</strong> · {noms(p)} · <span className="lp-doux">{depot ? 'bulletin à déposer dans Mon espace (Réglages)' : 'dans Mon espace, jusqu’au 5 à 12 h'}</span></>;
        if (depot) gestes = <Button size="sm" variant="ghost" onClick={() => navigate('/personnel')}>Réglages</Button>;
        break;
      }
      case 'erreur':
        corps = <><strong>Erreur signalée</strong> · {noms(p)} · <span className="lp-doux">corrigez la ligne dans Réglages, le bulletin repart à confirmer</span></>;
        gestes = <Button size="sm" variant="ghost" onClick={() => navigate('/personnel')}>Réglages</Button>;
        break;
      case 'refuse':
        corps = <><strong>Refusé par MTN</strong> · {ls.map((l) => `${l.nom} : ${raisonDite(l.envoi?.raison)}`).join(' · ')}</>;
        gestes = <>{ls.map((l) => <Button key={l.cle} size="sm" variant="ghost" onClick={() => void renvoyer(l)}>Renvoyer{ls.length > 1 ? ` ${l.nom}` : ''}</Button>)}</>;
        break;
      case 'avant-le-5':
        corps = <><strong>Date avant le 5</strong> · {ls.map((l) => `${l.nom}, ${l.date ? jourCourt(l.date.jour) : ''}`).join(' · ')} · <span className="lp-doux">un toucher à part ce jour-là</span></>;
        gestes = <>{ls.map((l) => <Button key={l.cle} size="sm" variant="copper" onClick={() => void validerALaLigne(l)}>{ls.length > 1 ? `Valider ${l.nom}` : 'Valider à part'}</Button>)}</>;
        break;
      case 'date-changee':
      case 'change':
        corps = <><strong>{p.code === 'date-changee' ? 'Date changée après votre toucher' : 'Montant ou numéro changé après votre toucher'}</strong> · {noms(p)} · <span className="lp-doux">l’envoi programmé est annulé, la ligne attend votre toucher</span></>;
        gestes = <>{ls.map((l) => <Button key={l.cle} size="sm" variant="copper" onClick={() => void validerALaLigne(l)}>{ls.length > 1 ? `Valider ${l.nom}` : 'Valider'}</Button>)}</>;
        break;
      case 'sans-numero':
        corps = <><strong>Sans numéro MTN</strong> · {noms(p)} · <span className="lp-doux">à poser sur la fiche</span></>;
        break;
      case 'pourboires-ecart':
        corps = <><strong>Pourboires : le bulletin et le mois diffèrent</strong> · {ls.map((l) => `${l.nom} : bulletin ${F(ctx.get(l.cle)?.pourboiresDuNet ?? 0)}, mois ${F(l.pourboiresXof)}`).join(' · ')} · <span className="lp-doux">le virement retire ceux du bulletin ; les espèces disent ceux du mois</span></>;
        break;
      case 'solde-inconnu':
        corps = <><strong>Compte de paie MTN · solde inconnu</strong> · il faut <span className="lp-num">{F(aCouvrir || c.parMtnXof - c.partisXof)}</span>{cal ? ` le ${jourDeLaPaie} avant 18 h` : ''} · <span className="lp-doux">{lecture ? 'MTN ne l’a pas donné' : 'pas encore lu chez MTN'} ; sinon rien ne part</span></>;
        gestes = serveur.pret ? <Button size="sm" variant="ghost" onClick={() => void lire()}>Lire chez MTN</Button> : null;
        break;
      case 'solde-court':
        corps = <><strong>Compte de paie MTN · solde {F(lecture?.soldeXof ?? 0)}</strong> · il manque <span className="lp-num">{F(p.manqueXof ?? 0)}</span>{cal ? ` le ${jourDeLaPaie} avant 18 h` : ''} · <span className="lp-doux">sinon rien ne part</span></>;
        gestes = serveur.pret ? <Button size="sm" variant="ghost" onClick={() => void lire()}>Lire à nouveau</Button> : null;
        break;
      default:
        corps = <></>;
    }
    return (
      <div key={`${p.code}-${i}`} className={`lp-point${p.bloque ? ' lp-point--bloque' : ''}`}>
        <span className="lp-point__marque" aria-hidden />
        <div>{corps}</div>
        <div className="lp-point__gestes">{gestes}</div>
      </div>
    );
  };

  const totalEquipe = equipe.filter((l) => l.viaMtn).reduce((s, l) => s + l.parMtnXof, 0);
  const total = (ls: LigneDuMois[]) => ls.filter((l) => l.viaMtn).reduce((s, l) => s + l.parMtnXof, 0);

  return (
    <div className="lp mnd-rise">
      <header className="lp-tete">
        <div>
          <span className="lp-sourcil">Équipe · Les paiements</span>
          <h1>
            <button type="button" className="lp-mois" aria-label="Mois précédent" onClick={() => setPeriode(moisPrecedent(periode))}>‹</button>
            {capitale(moisDit(periode))}.
            <button type="button" className="lp-mois" aria-label="Mois suivant" onClick={() => setPeriode(moisSuivant(periode))}>›</button>
          </h1>
          <span className="lp-doux">
            {cal ? `Versé le ${jourDeLaPaie}${cal.reporteAuLundi ? ' (le 5 est un dimanche)' : ''}` : ''} · prestataires et entreprises à leur date · par MTN depuis le {COMPTE_DE_PAIE} · pourboires en espèces
          </span>
        </div>
        <div className="lp-tete__droite">
          <span className={`lp-etat${etatDuMois.fait ? ' lp-etat--fait' : ''}`}><i />{etatDuMois.texte}</span>
          <button type="button" className="lp-lien" onClick={() => navigate('/personnel')}>Réglages</button>
        </div>
      </header>

      {!serveur.pret && serveur.charge && (
        <div className="lp-bandeau">L’envoi par l’API MTN s’allume quand les clés MTN sont posées. D’ici là, la validation se garde ici, et les salaires passent par le fichier du portail (Réglages).</div>
      )}

      {/* Les cinq chiffres, en pont : salaires nets − prêts + prestataires et entreprises = par MTN. */}
      <section aria-label="Les chiffres du mois">
        <div className="lp-chiffres">
          <div className="lp-chiffre"><span className="lp-sourcil">Par MTN</span><b>{F(c.parMtnXof)}</b><span className="lp-op">{c.virements} virement{c.virements > 1 ? 's' : ''} · frais MTN 0 F</span></div>
          <div className="lp-chiffre"><span className="lp-sourcil">Salaires nets</span><b>{F(c.salairesNetsXof)}</b><span className="lp-op">{c.bulletins} bulletin{c.bulletins > 1 ? 's' : ''}{run ? '' : ' · pas encore de run'}</span></div>
          <div className="lp-chiffre"><span className="lp-sourcil">Retenues de prêt</span><b className="lp-moins">{c.pretsXof ? `− ${F(c.pretsXof)}` : F(0)}</b><span className="lp-op">{c.nbPrets} prêt{c.nbPrets > 1 ? 's' : ''} en cours</span></div>
          <div className="lp-chiffre"><span className="lp-sourcil">Prestataires · entreprises</span><b>+ {F(c.prestatairesXof + c.entreprisesXof)}</b><span className="lp-op">{c.nbPrestataires} prestataire{c.nbPrestataires > 1 ? 's' : ''} sur {c.nbPrestatairesTotal} · {c.nbEntreprises} facture{c.nbEntreprises > 1 ? 's' : ''}</span></div>
          <div className="lp-chiffre lp-chiffre--hors"><span className="lp-sourcil">Pourboires · espèces</span><b>{F(c.pourboiresXof)}</b><span className="lp-op">remis le 5 · {c.pourboiresRemis} / {c.pourboiresATotal} cochés</span></div>
        </div>
        {c.horsMtn > 0 && <p className="lp-doux lp-petit">{c.horsMtn} ligne{c.horsMtn > 1 ? 's' : ''} hors MTN (Moov, sans numéro, sans prix ou sans facture) : hors du total.</p>}
      </section>

      {/* Le mois en cinq temps. */}
      {cal && (
        <section aria-label="Le calendrier du mois" className="lp-frise">
          <div className={pas(maintenant >= cal.depot.ms, phase === 'avant-le-depot')}><b>1er · 8 h</b><span>Bulletins prêts</span></div>
          <div className={pas(maintenant >= cal.finDesConfirmations.ms, phase === 'confirmation')}><b>1er → {cal.reporteAuLundi ? '6' : '5'} · 12 h</b><span>Chacun confirme · {confirmees} / {equipe.length}</span></div>
          <div className={pas(valide, !valide && phase !== 'avant-le-depot')}><b>{cal.reporteAuLundi ? '6' : '5'} · 12 h → 18 h</b><span>Votre toucher</span></div>
          <div className={pas(maintenant >= cal.paie.ms, valide && maintenant < cal.paie.ms)}><b>{cal.reporteAuLundi ? '6' : '5'} · 18 h</b><span>Salaires par MTN · pourboires en espèces</span></div>
          <div className={pas([...prestataires, ...entreprises].length > 0 && aDateTousPayes, maintenant >= cal.paie.ms && !aDateTousPayes)}><b>À leur date · 18 h</b><span>Prestataires · entreprises</span></div>
        </section>
      )}

      {/* Le test MTN, avant le premier mois par l'API. */}
      {reussi ? (
        <section className="lp-test lp-test--replie">
          <span><b>Le test MTN</b> · réussi le {quandDit(duDernierEssai[0]?.repondu_le ?? undefined)} · {bilan.recus} / {bilan.nombre} · {F(bilan.recuXof)} en dépense « Essai de paie MTN »</span>
        </section>
      ) : (
        <section>
          <div className="lp-titre-de-bloc"><h2>Le test MTN</h2><span className="lp-doux lp-petit">Avant le 5 · depuis le {COMPTE_DE_PAIE}</span></div>
          <div className="lp-test">
            {lignesTest.map((t) => {
              const e = duDernierEssai.find((x) => x.employee_id === t.ficheId);
              return (
                <div key={t.prenom} className="lp-test__ligne">
                  <strong>{t.nom ?? t.prenom}</strong>
                  <span className="lp-numero">{t.msisdn ? numeroMasque(t.msisdn) : '–'}{t.repris && <span className="lp-numero__p">repris</span>}</span>
                  <span><Input inputMode="numeric" value={String(t.montantXof)} disabled={part || !!e && e.etat !== 'refuse'} aria-label={`Montant du test pour ${t.prenom}`} onChange={(x) => changeMontantDuTest(t.prenom, x.target.value)} /> F</span>
                  <span className="lp-test__etat">
                    {e ? (
                      e.etat === 'recu' ? <span className="lp-pastille lp-pastille--paye">Reçu · {quandDit(e.repondu_le ?? undefined)}</span>
                        : e.etat === 'refuse' ? <><span className="lp-pastille lp-pastille--attend">{raisonDite(e.raison)}</span>{seRelanceA500(e) && <Button size="sm" variant="ghost" onClick={() => void relancerA500(e)}>Relancer à {F(MONTANT_ESSAI_MAX)}</Button>}</>
                          : <span className="lp-pastille lp-pastille--envoi">Envoi…</span>
                    ) : t.repris && t.ficheId ? (
                      <Button size="sm" variant="ghost" onClick={() => void prendre([{ cle: cleDeLigne('equipe', t.ficheId as string), nom: t.nom ?? t.prenom, propose: t.msisdn as string, fiche: parFiche.get(t.ficheId as string) }], peutPrendre(t.nom ?? t.prenom, t.msisdn, lecture) === 'son-mot')}>Prendre le numéro</Button>
                    ) : t.pourquoi ? <span className="lp-pastille lp-pastille--non">{t.pourquoi}</span> : <span className="lp-pastille lp-pastille--ok">Prêt</span>}
                  </span>
                </div>
              );
            })}
            <div className="lp-test__pied">
              <span><b>{F(totalDuTest(lignesTest))}</b> <span className="lp-doux lp-petit">offerts par la Maison · dépense « Essai de paie MTN » · bulletins inchangés</span></span>
              <Button variant="copper" disabled={part || !serveur.pret || (bilan.enCours > 0)} onClick={() => void envoyerLeTest()}>
                {part ? 'Envoi…' : !serveur.pret ? 'Le test attend les clés MTN' : bilan.enCours > 0 ? `En cours · ${bilan.recus} / ${bilan.nombre}` : 'Envoyer le test'}
              </Button>
            </div>
          </div>
          <p className="lp-doux lp-petit">MTN refuse un montant : « Relancer à {F(MONTANT_ESSAI_MAX)} ». Pas de test réussi : le 5, la paie passe par le fichier du portail (Réglages).</p>
        </section>
      )}

      {/* Ce que le Trône a repéré. */}
      <section>
        <div className="lp-titre-de-bloc">
          <h2>À regarder</h2>
          <span className="lp-doux lp-petit">
            {points.length ? `${points.length} point${points.length > 1 ? 's' : ''}${points.some((p) => p.bloque) ? '' : ' · rien ne bloque l’envoi'}` : 'Tout est vu'}
            {serveur.pret && <> · <button type="button" className="lp-lien" onClick={() => void lire()}>Lire chez MTN</button></>}
          </span>
        </div>
        {points.length > 0 && <div className="lp-points">{points.map(point)}</div>}
      </section>

      {/* Qui reçoit quoi. */}
      <section>
        <div className="lp-titre-de-bloc"><h2>Qui reçoit quoi</h2><span className="lp-doux lp-petit">Touchez une ligne de l’équipe : son bulletin</span></div>
        <div className="lp-defile">
          <table className="lp-table">
            <thead><tr><th>Personne</th><th className="lp-n">Net</th><th className="lp-n">Prêt</th><th className="lp-n">Par MTN</th><th>Numéro MTN</th><th>État</th><th className="lp-n">Pourboires · espèces</th></tr></thead>
            <tbody>
              <tr className="lp-groupe"><td colSpan={7}>L’équipe<span>{cal ? `le ${jourDeLaPaie} à 18 h` : ''} · {F(totalEquipe)}</span></td></tr>
              {!equipe.length && <tr><td colSpan={7} className="lp-vide">{run ? 'Aucune ligne dans le run.' : `Pas encore de run pour ${moisDit(periode)} : il se crée dans Réglages.`}</td></tr>}
              {equipe.map((l) => {
                const o = ouverte === l.cle;
                return (
                  <Fragment key={l.cle}>
                    <tr className={`lp-ligne${o ? ' lp-ligne--ouverte' : ''}`} onClick={() => setOuverte(o ? null : l.cle)}>
                      <td><span className="lp-chev" aria-hidden>›</span>{l.nom}</td>
                      <td className="lp-n">{F(l.netXof)}</td>
                      <td className={`lp-n ${l.pretXof ? 'lp-moins' : 'lp-vide'}`}>{l.pretXof ? `− ${F(l.pretXof)}` : '–'}</td>
                      <td className="lp-n"><b>{l.viaMtn ? F(l.parMtnXof) : '–'}</b></td>
                      <td>{numero(l)}</td>
                      <td>
                        {/* Sa réponse au WhatsApp de la paie (0165), si elle existe. */}
                        <span className="lp-etat-ligne">{pastille(l)}{l.envoi?.reponse_employe === 'bien-recu' ? <span className="lp-reponse">Bien reçu ✓</span> : l.envoi?.reponse_employe === 'pas-encore' ? <span className="lp-reponse lp-reponse--pas">Pas encore reçu</span> : null}</span>
                      </td>
                      <td className="lp-n">
                        {l.pourboiresXof > 0
                          ? <button type="button" className={`lp-remis${remis[l.id] ? ' lp-remis--oui' : ''}`} onClick={(e) => { e.stopPropagation(); basculeRemis(l); }}>{F(l.pourboiresXof)} · {remis[l.id] ? 'Remis ✓' : 'À remettre'}</button>
                          : <span className="lp-vide">–</span>}
                      </td>
                    </tr>
                    {o && <tr className="lp-detail"><td colSpan={7}>{bulletin(l)}</td></tr>}
                  </Fragment>
                );
              })}

              <tr className="lp-groupe"><td colSpan={7}>Prestataires<span>chacun à sa date · {F(total(prestataires))}</span></td></tr>
              {!prestataires.length && <tr><td colSpan={7} className="lp-vide">Aucune mission ni facture de prestataire pour {moisDit(periode)}.</td></tr>}
              {prestataires.map((l) => (
                <tr key={l.cle}>
                  <td className="lp-nom">{l.nom}</td>
                  <td className="lp-doux" colSpan={2}>{l.detail}</td>
                  <td className="lp-n">{l.netXof > 0 ? <b>{F(l.netXof)}</b> : <span className="lp-vide">{l.pourquoi === 'sans prix' ? 'sans prix' : '–'}</span>}</td>
                  <td>{numero(l)}</td>
                  <td><span className="lp-etat-ligne">{choixDuJour(l)}{pastille(l)}{seValideAPart(l) && !fige && <Button size="sm" variant="copper" onClick={() => void validerALaLigne(l)}>Valider</Button>}</span></td>
                  <td className="lp-n lp-vide">–</td>
                </tr>
              ))}

              <tr className="lp-groupe">
                <td colSpan={7}>Entreprises<span>chacune à sa date · payées à l’entreprise, sur facture · {F(total(entreprises))}</span>
                  <button type="button" className="lp-lien lp-ajoute" onClick={() => setSaisie({ quoi: 'entreprise' })}>+ Entreprise</button>
                </td>
              </tr>
              {!entreprises.length && <tr><td colSpan={7} className="lp-vide">Aucune entreprise payée sur facture : « + Entreprise ».</td></tr>}
              {entreprises.map((l) => {
                const x = ctx.get(l.cle);
                const libre = l.etat !== 'paye' && l.etat !== 'envoi' && !fige;
                return (
                  <tr key={l.cle}>
                    <td className="lp-nom">{l.nom}
                      {x?.fournisseur && libre && <button type="button" className="lp-lien lp-modifie" onClick={() => setSaisie({ quoi: 'entreprise', fournisseur: x.fournisseur })}>modifier</button>}
                    </td>
                    <td className="lp-doux" colSpan={2}>
                      {l.detail}
                      {x?.fournisseur && libre && <button type="button" className="lp-lien lp-modifie" onClick={() => setSaisie({ quoi: 'facture', fournisseur: x.fournisseur as Fournisseur, facture: x.facture })}>{x.facture ? 'la facture' : '+ Facture'}</button>}
                    </td>
                    <td className="lp-n">{l.netXof > 0 ? <b>{F(l.netXof)}</b> : <span className="lp-vide">–</span>}</td>
                    <td>{numero(l)}</td>
                    <td><span className="lp-etat-ligne">{choixDuJour(l)}{pastille(l)}{seValideAPart(l) && !fige && <Button size="sm" variant="copper" onClick={() => void validerALaLigne(l)}>Valider</Button>}</span></td>
                    <td className="lp-n lp-vide">–</td>
                  </tr>
                );
              })}

              <tr className="lp-total">
                <td>Total</td>
                <td className="lp-n">{F(c.salairesNetsXof)}</td>
                <td className="lp-n lp-moins">{c.pretsXof ? `− ${F(c.pretsXof)}` : '–'}</td>
                <td className="lp-n">{F(c.parMtnXof)}</td>
                <td colSpan={2}>{c.virements} virement{c.virements > 1 ? 's' : ''} · frais 0 F</td>
                <td className="lp-n">{F(c.pourboiresXof)} · {c.pourboiresRemis} / {c.pourboiresATotal}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="lp-doux lp-petit">Date d’un prestataire ou d’une entreprise : le 10 par défaut, 1 à 28 ou dernier jour, sur sa ligne. Dimanche : le lundi. Avant le 5 : un toucher à part ce jour-là. Changée après votre toucher : la ligne attend votre toucher.</p>
      </section>

      {/* Les prêts de l'équipe. */}
      <section>
        <div className="lp-titre-de-bloc"><h2>Les prêts</h2><button type="button" className="lp-lien" onClick={() => navigate('/prets-personnel')}>+ Prêter à un membre</button></div>
        {!pretsDeLEquipe.length && <p className="lp-doux lp-petit">Aucun prêt en cours dans l’équipe.</p>}
        {pretsDeLEquipe.map((p) => (
          <div key={p.nom} className="lp-pret">
            <div className="lp-pret__qui"><strong>{p.nom}</strong><span className="lp-doux lp-petit">{F(p.prete)} prêtés{p.premier ? ` le ${jourCourt(p.premier)}` : ''}{p.mens ? ` · ${F(p.mens)} par bulletin` : ''}</span></div>
            <div>
              <div className="lp-pret__chiffres">
                <span>Retenu <b>{F(p.retenuXof)}</b></span><span>Reste après ce mois <b>{F(p.resteApresXof)}</b></span>
                <span>Dernière retenue <b>{p.derniereRetenue ? moisDit(p.derniereRetenue) : '–'}</b></span>
              </div>
              <div className="lp-jauge" aria-label={`${Math.round(p.partRemboursee * 100)} % remboursés`}><i style={{ width: `${Math.round(p.partRemboursee * 100)}%` }} /></div>
              <div className="lp-echeances">
                {p.echeances.map((e) => <span key={e.mois} className={e.etat === 'faite' ? 'lp-faite' : e.etat === 'ce-mois' ? 'lp-cemois' : ''}>{moisCourt(e.mois)} {F(e.montantXof)}</span>)}
              </div>
            </div>
            <div><Button size="sm" variant="ghost" onClick={() => navigate('/prets-personnel')}>Le prêt</Button></div>
          </div>
        ))}
      </section>

      {/* La validation, en pied collant. */}
      <div className="lp-pied" role="region" aria-label="Validation du mois">
        <div className="lp-pied__resume">
          <b>{F(c.parMtnXof)} · {c.virements} virement{c.virements > 1 ? 's' : ''}</b>
          <span>
            {dernierToucher
              ? `Validé par ${dernierToucher.par} le ${quandDit(dernierToucher.le)}${cal && maintenant < cal.paie.ms ? ` · part le ${jourDeLaPaie} à 18 h` : ''}`
              : `Votre toucher ou celui de Brice${cal ? ` · annulable jusqu’au ${jourDeLaPaie} à 17 h 59` : ''}`}
          </span>
        </div>
        <div className="lp-pied__actions">
          {annulable && <Button size="sm" variant="ghost-invert" onClick={() => void annulerLeMois()}>Annuler jusqu’à 17 h 59</Button>}
          {!fige && (aValider.length > 0 || aProgrammer.length > 0) && (
            <Button variant="copper" onClick={() => void validerLeMois()}>
              {dernierToucher ? `Valider ${aValider.length + aProgrammer.length} ligne${aValider.length + aProgrammer.length > 1 ? 's' : ''} de plus` : 'Valider le mois'}
            </Button>
          )}
        </div>
      </div>

      {saisie?.quoi === 'entreprise' && (
        <SaisieDeLEntreprise
          branchId={branch.id} fournisseur={saisie.fournisseur}
          ligne={saisie.fournisseur ? ligneParCle(cleDeLigne('entreprise', saisie.fournisseur.id)) : undefined}
          onClose={() => setSaisie(null)}
        />
      )}
      {saisie?.quoi === 'facture' && (
        <SaisieDeLaFacture
          fournisseur={saisie.fournisseur} facture={saisie.facture} periode={periode} qui={qui}
          ligne={ligneParCle(cleDeLigne('entreprise', saisie.fournisseur.id))}
          onClose={() => setSaisie(null)}
        />
      )}
    </div>
  );
}

/** Un changement après le toucher annule l'envoi programmé : la ligne attend
    alors son toucher, elle seule. */
async function annuleSiProgramme(ligne: LigneDuMois | undefined): Promise<boolean> {
  if (!ligne?.envoi || ligne.envoi.etat !== 'programme') return true;
  const r = await annule([ligne.envoi.reference]);
  if (r.erreur) { alerte(r.erreur); return false; }
  toast('Changé après votre toucher : l’envoi programmé est annulé, la ligne attend votre toucher.');
  return true;
}

/** « + ENTREPRISE » : une entreprise payée sur facture EST un fournisseur.
    On choisit une maison du carnet des fournisseurs, ou on en crée une, et
    on lui pose son bloc `paiement` : numéro MTN, agent, jour de paie. Tout
    s'écrit au carnet (`fournisseursStore`). */
function SaisieDeLEntreprise({ branchId, fournisseur, ligne, onClose }: { branchId: string; fournisseur?: Fournisseur; ligne?: LigneDuMois; onClose: () => void }) {
  const [carnet] = useFournisseurs();
  const lesFournisseurs = asArray<Fournisseur>(carnet).filter((x) => x && x.branchId === branchId && !x.archived);
  const [choisi, setChoisi] = useState(fournisseur?.id ?? '');
  const [f, setF] = useState({
    nom: fournisseur?.nom ?? '', numero: fournisseur?.paiement?.msisdn ? numeroDit(fournisseur.paiement.msisdn) : '',
    agent: fournisseur?.paiement?.agent ?? '', jour: (fournisseur?.paiement?.jour ?? JOUR_PAR_DEFAUT) as JourDePaie,
  });
  const [souci, setSouci] = useState('');
  const choisis = (id: string) => {
    setChoisi(id);
    const x = lesFournisseurs.find((y) => y.id === id);
    if (x) setF({ nom: x.nom, numero: x.paiement?.msisdn ? numeroDit(x.paiement.msisdn) : (x.telephone ?? ''), agent: x.paiement?.agent ?? '', jour: x.paiement?.jour ?? JOUR_PAR_DEFAUT });
  };
  const enregistre = async () => {
    const lu = lisLeNumero(f.numero);
    if (!f.nom.trim()) { setSouci('Le nom de l’entreprise.'); return; }
    if (lu.erreur !== undefined) { setSouci(`Le numéro MTN de l’entreprise : ${lu.erreur}`); return; }
    const paiement = { msisdn: lu.msisdn, jour: f.jour, ...(f.agent.trim() ? { agent: f.agent.trim() } : {}) };
    const avant = lesFournisseurs.find((x) => x.id === choisi);
    if (avant?.paiement && (avant.paiement.msisdn !== paiement.msisdn || avant.paiement.jour !== paiement.jour) && !await annuleSiProgramme(ligne)) return;
    if (avant) fournisseursStore.set((prev) => asArray<Fournisseur>(prev).map((x) => (x.id === avant.id ? { ...x, nom: f.nom.trim() || x.nom, paiement } : x)));
    else fournisseursStore.set((prev) => [...asArray<Fournisseur>(prev), { id: `fr-${uid()}`, branchId, nom: f.nom.trim(), famille: 'Entreprise', paiement }]);
    toast(`${f.nom.trim()} : au carnet des fournisseurs, payée sur facture.`);
    onClose();
  };
  const retire = async () => {
    const avant = lesFournisseurs.find((x) => x.id === choisi);
    if (!avant?.paiement) return;
    if (!await demande({ quoi: 'Les entreprises', titre: `Ne plus payer ${avant.nom} ici ?`, dit: 'Elle reste au carnet des fournisseurs, sans numéro de paie.', accepter: 'Retirer de Les paiements', refuser: 'Garder' })) return;
    if (!await annuleSiProgramme(ligne)) return;
    fournisseursStore.set((prev) => asArray<Fournisseur>(prev).map((x) => (x.id === avant.id ? { ...x, paiement: undefined } : x)));
    onClose();
  };
  const date = dateDePaie(periodeParDefaut(Date.now()), f.jour);
  return (
    <Modal title={fournisseur ? fournisseur.nom : 'Une entreprise payée sur facture'} onClose={onClose} width={520}>
      <div className="lp-form">
        <p className="lp-doux lp-petit">L’entreprise est payée, pas son agent : sur sa facture, par MTN, sur son numéro. Elle vit au carnet des fournisseurs ; sa dépense y tombe, jamais en « Salaires ».</p>
        {!fournisseur && lesFournisseurs.length > 0 && (
          <Field label="Au carnet des fournisseurs">
            <Select value={choisi} onChange={(e) => choisis(e.target.value)}>
              <option value="">Une nouvelle entreprise</option>
              {lesFournisseurs.map((x) => <option key={x.id} value={x.id}>{x.nom}{x.paiement ? ' · déjà payée ici' : ''}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Entreprise"><Input value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} /></Field>
        <Field label="Son numéro MTN (au nom de l’entreprise)"><Input inputMode="tel" value={f.numero} placeholder="01 00 00 00 00" onChange={(e) => setF({ ...f, numero: e.target.value })} /></Field>
        <Field label="Son agent chez nous"><Input value={f.agent} onChange={(e) => setF({ ...f, agent: e.target.value })} placeholder="agent D." /></Field>
        <Field label="Jour de paie">
          <Select value={String(f.jour)} onChange={(e) => setF({ ...f, jour: jourLu(e.target.value) })}>
            {JOURS_POSSIBLES.map((j) => <option key={String(j)} value={String(j)}>{jourDit(j)}</option>)}
          </Select>
        </Field>
        {date && <p className="lp-doux lp-petit">Le mois prochain : {jourCourt(date.jour)} à 18 h{date.decaleAuLundi ? ' (dimanche, passé au lundi)' : ''}{date.avantLe5 ? ' · avant le 5 : un toucher à part' : ''}.</p>}
        {souci && <div className="lp-souci" role="alert">{souci}</div>}
        <div className="lp-gestes">
          <Button variant="copper" onClick={() => void enregistre()}>Enregistrer</Button>
          {fournisseur?.paiement && <Button variant="ghost" onClick={() => void retire()}>Ne plus payer ici</Button>}
        </div>
      </div>
    </Modal>
  );
}

/** « + FACTURE » : la facture du mois d'une entreprise, son n°, son montant
    et sa pièce. Sans pièce jointe, rien ne part. */
function SaisieDeLaFacture({ fournisseur, facture, periode, qui, ligne, onClose }: {
  fournisseur: Fournisseur; facture?: FactureDEntreprise; periode: string; qui: string; ligne?: LigneDuMois; onClose: () => void;
}) {
  const [f, setF] = useState({ numero: facture?.facture ?? '', montant: facture?.montantXof ? String(facture.montantXof) : '', piece: facture?.piece });
  const [souci, setSouci] = useState('');
  const enregistre = async () => {
    const montant = Number.parseInt(f.montant.replace(/\D/g, ''), 10);
    if (!f.numero.trim()) { setSouci('Le n° de la facture.'); return; }
    if (!(montant > 0)) { setSouci('Le montant de la facture, en francs.'); return; }
    if (facture && facture.montantXof !== montant && !await annuleSiProgramme(ligne)) return;
    const neuve: FactureDEntreprise = facture
      ? { ...facture, facture: f.numero.trim(), montantXof: montant, piece: f.piece }
      : { id: `fe-${uid()}`, branchId: fournisseur.branchId, fournisseurId: fournisseur.id, periode, facture: f.numero.trim(), montantXof: montant, ...(f.piece ? { piece: f.piece } : {}), creeLe: new Date().toISOString(), creePar: qui || 'La direction' };
    facturesDEntreprisesStore.set((prev) => (facture ? asArray<FactureDEntreprise>(prev).map((x) => (x.id === neuve.id ? neuve : x)) : [...asArray<FactureDEntreprise>(prev), neuve]));
    onClose();
  };
  const retire = async () => {
    if (!facture) return;
    if (!await demande({ quoi: 'Les entreprises', titre: `Retirer la facture ${facture.facture} de ${fournisseur.nom} ?`, dit: `Elle ne sera pas payée pour ${moisDit(periode)}.`, accepter: 'Retirer la facture', refuser: 'Garder' })) return;
    if (!await annuleSiProgramme(ligne)) return;
    facturesDEntreprisesStore.set((prev) => asArray<FactureDEntreprise>(prev).filter((x) => x.id !== facture.id));
    onClose();
  };
  return (
    <Modal title={`${fournisseur.nom} · facture de ${moisDit(periode)}`} onClose={onClose} width={480}>
      <div className="lp-form">
        <Field label="N° de facture"><Input value={f.numero} onChange={(e) => setF({ ...f, numero: e.target.value })} /></Field>
        <Field label="Montant (F)"><Input inputMode="numeric" value={f.montant} onChange={(e) => setF({ ...f, montant: e.target.value.replace(/[^\d ]/g, '') })} /></Field>
        <ChampPieceJointe branchId={fournisseur.branchId} dossier="facture-entreprise" valeur={f.piece} onChange={(p) => setF({ ...f, piece: p })} />
        {!f.piece && <p className="lp-doux lp-petit">Sans facture jointe, rien ne part.</p>}
        {souci && <div className="lp-souci" role="alert">{souci}</div>}
        <div className="lp-gestes">
          <Button variant="copper" onClick={() => void enregistre()}>Enregistrer</Button>
          {facture && <Button variant="ghost" onClick={() => void retire()}>Retirer la facture</Button>}
        </div>
      </div>
    </Modal>
  );
}
