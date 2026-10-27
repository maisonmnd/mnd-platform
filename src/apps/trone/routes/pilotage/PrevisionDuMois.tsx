import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { useInvoices, invoiceReglements, type Invoice } from '../../../../shared/finance';
import { predictNextVisit, tauxDeRealisation } from '../../../../shared/cadence';
import { openingForIso } from '../../../../shared/settings';
import { useBlocages, plagesBloquees } from '../../../../shared/blocages';
import { PRISE_NOTEE_DEPUIS } from '../../../../shared/previsions-pur';
import { useApprenants, useSubscribers } from '../equipe/data';
import {
  addDaysISO, apptDueXof, apptDurationMin, apptNetXof, revenuDuMois, revenusProjetesDuMois, timeToMin, todayISO,
  useBranchAppointments, useBranchClients, useClefDuTarif, useServicesById,
} from '../clients/_shared';
import {
  avecLaFourchette, calculDeLaPrevision, ceQuiFaitLaPrevision, cumulDuMois, ecartDecompose, fourchetteMesuree, leviersDuMois,
  objectifDuMois, prevoisLeMois,
  type Fourchette, type LigneDeLaPrevision, type MoisRejoueEnArgent, type Prevision,
} from '../../../../shared/prevision-du-mois-pur';
import { fixeLObjectif, useObjectifsDuMois } from '../../../../shared/objectifs-du-mois';
import { useStaff as useMonProfil } from '../../../../shared/auth';
import { demandeAClaude, versionDeIaMaison } from '../../../../shared/ia-maison';
import { saitLeTableauIntelligent } from '../../../../shared/ia-maison-pur';
import { demandeDExplication, explicationLisible, type ExplicationDeLaPrevision } from '../../../../shared/ia-tableau-pur';
import './prevision-du-mois.css';

/* ═══════════════════════════════════════════════════════════════════
   LA PRÉVISION DU MOIS, AU TABLEAU DE BORD — 24 octobre 2026, maquette
   VJ5PJEGUPDbYKUgEdMUNbS (vue 1). Le Trône calcule (shared/prevision-du-
   mois-pur.ts), et chaque part se dit en clair à côté du dessin. Ce bloc
   ne lit que ce que la Maison a déjà : les règlements, les rendez-vous, la
   Cadence. Rien n'est envoyé nulle part.

   27 OCTOBRE 2026, « LA PRÉVISION QUI DÉCIDE » (maquette
   Q9Nkir2cdF4jSP6QDTH3cG) : « le graphe doit être professionnel avec les
   calculs, chaque jour cliquable ; c'est quoi bas et haut, d'où viennent
   les écarts ; que chaque bouton serve à décider : la finalité est de
   grandir » (Yéman). Au sélecteur : la fourchette MESURÉE sur les mois
   rejoués (les règles tant qu'il n'y a pas trois mois jugés), le détail
   d'un jour sous le graphe, un objectif qu'elle fixe chaque mois. */

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const dernierJourDu = (mk: string): string => {
  const [a, m] = mk.split('-').map(Number);
  return `${mk}-${String(new Date(a, m, 0).getDate()).padStart(2, '0')}`;
};
/** Le même mois, k mois plus tôt. */
const moisAvant = (mk: string, k: number): string => {
  const [a, m] = mk.split('-').map(Number);
  const d = new Date(a, m - 1 - k, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
/** Un pas d'axe lisible : 1, 2 ou 5 fois une puissance de dix. */
const pasLisible = (max: number): number => {
  const brut = max / 4;
  const p = 10 ** Math.floor(Math.log10(Math.max(1, brut)));
  return [1, 2, 5, 10].map((k) => k * p).find((k) => k >= brut) ?? p * 10;
};
const jourDit = (iso: string): string => {
  const d = new Date(`${iso}T12:00:00`);
  const n = Number(iso.slice(8, 10));
  return `${JOURS[d.getDay()]} ${n === 1 ? '1er' : n} ${MOIS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
};
const majuscule = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
/** Une durée de rituel ordinaire, pour compter les places libres d'un jour. */
const DUREE_D_UNE_PLACE = 120;

export type RdvDuJour = { id: string; heure: string; nom: string; clientId: string; soins: string; duXof: number };
export type RepriseDuJour = { clientId: string; nom: string; valeurXof: number; semaines: number | null };
export type DetailDuJour = {
  iso: string; ferme: boolean; passe: boolean; entreXof: number;
  rdvXof: number; reprisesXof: number; rdvs: RdvDuJour[]; reprises: RepriseDuJour[]; places: number;
};

export type DonneesDeLaPrevision = {
  /** La prévision, sa fourchette posée (mesurée, ou ses règles). */
  prevision: Prevision;
  lignes: LigneDeLaPrevision[];
  nomDuMois: string;
  today: string;
  mk: string;
  dernierJour: string;
  /** Les trois mois passés, entiers, pour l'explication (« septembre 2026 : 3 120 000 F »). */
  moisPasses: string[];
  fmt: (x: number) => string;
  fourchette: Fourchette;
  details: Record<string, DetailDuJour>;
  placesLibres: number;
  rdvAGarder: number;
  objectif: number | null;
};

/** Les créances d'un mois, rejouées : ce qui est rentré après le même jour,
    les six mois d'avant, sur des pièces datées de ce jour ou d'avant. */
function creancesDesSixMois(factures: readonly Invoice[], mk: string, jour: number): number[] {
  const out: number[] = [];
  for (let k = 1; k <= 6; k++) {
    const m = moisAvant(mk, k);
    const fin = dernierJourDu(m);
    const cut = `${m}-${String(Math.min(jour, Number(fin.slice(8, 10)))).padStart(2, '0')}`;
    if (!factures.some((i) => (i.date ?? '').slice(0, 7) <= m)) continue; // la Maison n'existait pas encore
    const anciennes = factures.filter((i) => (i.date ?? '').slice(0, 10) <= cut);
    out.push(anciennes.reduce((s, i) => s + invoiceReglements(i)
      .filter((p) => (p.date ?? '') > cut && (p.date ?? '') <= fin)
      .reduce((n, p) => n + p.amountXof, 0), 0));
  }
  return out;
}

/** LE CALCUL, UNE FOIS POUR TOUT LE TABLEAU DE BORD : le bloc de la
    prévision et « Demander à la Maison » lisent le même. */
export function usePrevisionDuMois(): DonneesDeLaPrevision {
  const { branch, currency } = useBranch();
  const [invoices] = useInvoices();
  const appts = useBranchAppointments();
  const clients = useBranchClients();
  const byId = useServicesById();
  const clefDuTarif = useClefDuTarif();
  const [apprenants] = useApprenants();
  const [abonnes] = useSubscribers();
  const [blocages] = useBlocages();
  const [objectifs] = useObjectifsDuMois();
  const today = todayISO();
  const mk = today.slice(0, 7);
  const dernierJour = dernierJourDu(mk);

  const calcul = useMemo(() => {
    const args = { invoices, appts, byId, apprenants, abonnes, branchId: branch.id };
    /* ① L'argent entré, jour par jour, avec la règle des « Revenus du mois ». */
    const encaisseParJour: { iso: string; xof: number }[] = [];
    let cumul = 0;
    for (let d = `${mk}-01`; d <= today; d = addDaysISO(d, 1)) {
      const c = revenuDuMois(args, mk, { cut: d });
      encaisseParJour.push({ iso: d, xof: c - cumul });
      cumul = c;
    }
    /* ② Les rendez-vous posés, pour ce qu'ils doivent encore. */
    const aVenir = appts
      .filter((a) => a.branchId === branch.id && a.status !== 'annulé' && a.status !== 'honoré' && a.date >= today && a.date <= dernierJour);
    const rdvs = aVenir.map((a) => ({ date: a.date, duXof: apptDueXof(a, byId) }));
    const ilYAUnAn = addDaysISO(today, -365);
    const passes = appts.filter((a) => a.branchId === branch.id && a.date >= ilYAUnAn && a.date < today);
    const honneur = { honores: passes.filter((a) => a.status === 'honoré').length, annules: passes.filter((a) => a.status === 'annulé').length };
    /* ③ Les reprises : la Cadence, chez celles qui n'ont pas de rendez-vous. */
    /* Le juge ne lit que les rendez-vous de la cliente et sa fiche : on les
       lui donne déjà triés par cliente, sans balayer toute la Maison pour
       chacune (le tableau de bord est le premier écran ouvert). */
    const parCliente = new Map<string, typeof appts>();
    for (const a of appts) { const l = parCliente.get(a.clientId); if (l) l.push(a); else parCliente.set(a.clientId, [a]); }
    const reprises: { iso: string; valeurXof: number }[] = [];
    const reprisesDuJour = new Map<string, RepriseDuJour[]>();
    for (const c of clients) {
      const siens = parCliente.get(c.id);
      if (!siens) continue;
      const cad = predictNextVisit(siens, [c], c.id, today);
      if (!cad.predicted || !cad.iso || cad.iso > dernierJour) continue;
      const valeurXof = cad.template ? apptNetXof(cad.template, byId) : 0;
      reprises.push({ iso: cad.iso, valeurXof });
      const l = reprisesDuJour.get(cad.iso) ?? [];
      l.push({ clientId: c.id, nom: c.name ?? '', valeurXof, semaines: cad.avgDays ? Math.round(cad.avgDays / 7) : null });
      reprisesDuJour.set(cad.iso, l);
    }
    const venues = appts.filter((a) => a.status === 'honoré' && !(a.seriesIndex && a.seriesIndex > 1));
    const juste = tauxDeRealisation(venues);
    /* ④ Les créances : ce qui est rentré après le même jour, les six derniers
       mois, sur des pièces datées de ce jour ou d'avant. */
    const jour = Number(today.slice(8, 10));
    const factures = invoices.filter((i) => i.branchId === branch.id && i.kind === 'facture');
    const brute = prevoisLeMois({
      aujourdhui: today, dernierJour, encaisseParJour, rdvs, honneur, reprises,
      justesse: juste ? juste.dans14 / 100 : null,
      creancesPassees: creancesDesSixMois(factures, mk, jour),
      versementsAVenirXof: revenusProjetesDuMois(args, mk, today).versements,
    });

    /* ⑤ LA FOURCHETTE MESURÉE : chaque mois passé, rejoué au même jour du
       mois avec ce que le Trône savait ce jour-là (les rendez-vous déjà pris,
       la Cadence d'alors), face à ce qui est réellement rentré ensuite. Un
       mois ne se juge que si les dates de prise se notaient déjà. */
    const rejeux: MoisRejoueEnArgent[] = [];
    for (let k = 1; k <= 12; k++) {
      const m = moisAvant(mk, k);
      const fin = dernierJourDu(m);
      const cut = `${m}-${String(Math.min(jour, Number(fin.slice(8, 10)))).padStart(2, '0')}`;
      if (cut <= PRISE_NOTEE_DEPUIS) continue;
      if (!factures.some((i) => (i.date ?? '').slice(0, 7) <= m)) continue;
      const entreXof = revenuDuMois(args, m, { cut });
      const connus = appts.filter((a) => a.branchId === branch.id && a.date >= cut && a.date <= fin && !!a.creeLe && a.creeLe.slice(0, 10) < cut);
      const rdvsAlors = connus.map((a) => ({
        date: a.date,
        duXof: Math.max(0, apptNetXof(a, byId) - (a.payments ?? []).filter((p) => (p.date ?? '') <= cut).reduce((s, p) => s + (Number(p.amountXof) || 0), 0)),
      }));
      const passesAlors = appts.filter((a) => a.branchId === branch.id && a.date >= addDaysISO(cut, -365) && a.date < cut);
      const reprisesAlors: { iso: string; valeurXof: number }[] = [];
      for (const c of clients) {
        const siens = (parCliente.get(c.id) ?? []).filter((a) => a.date < cut || (!!a.creeLe && a.creeLe.slice(0, 10) < cut));
        if (!siens.length) continue;
        const cad = predictNextVisit(siens, [c], c.id, cut);
        if (!cad.predicted || !cad.iso || cad.iso > fin) continue;
        reprisesAlors.push({ iso: cad.iso, valeurXof: cad.template ? apptNetXof(cad.template, byId) : 0 });
      }
      const justeAlors = tauxDeRealisation(venues.filter((a) => a.date < cut));
      const alors = prevoisLeMois({
        aujourdhui: cut, dernierJour: fin, encaisseParJour: [{ iso: cut, xof: entreXof }], rdvs: rdvsAlors,
        honneur: { honores: passesAlors.filter((a) => a.status === 'honoré').length, annules: passesAlors.filter((a) => a.status === 'annulé').length },
        reprises: reprisesAlors, justesse: justeAlors ? justeAlors.dans14 / 100 : null,
        creancesPassees: creancesDesSixMois(factures, m, jour),
        versementsAVenirXof: revenusProjetesDuMois(args, m, cut).versements,
      });
      rejeux.push({ mois: m, resteprevuXof: alors.centraleXof - entreXof, resteRealiseXof: revenuDuMois(args, m) - entreXof });
    }
    const fourchette = fourchetteMesuree(rejeux);
    const prevision = avecLaFourchette(brute, fourchette);

    /* ⑥ LE DÉTAIL DE CHAQUE JOUR, pour le panneau sous le graphe. */
    const sieges = Math.max(1, branch.seats ?? 1);
    const maintenantMin = (() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); })();
    const details: Record<string, DetailDuJour> = {};
    let placesLibres = 0;
    for (const j of prevision.jours) {
      const ouverture = openingForIso(j.iso);
      const passe = j.iso < today;
      const sesRdv = aVenir.filter((a) => a.date === j.iso).sort((x, y) => x.time.localeCompare(y.time));
      const rdvsDuJour: RdvDuJour[] = sesRdv.map((a) => ({
        id: a.id, heure: a.time, clientId: a.clientId, nom: a.clientName ?? clients.find((c) => c.id === a.clientId)?.name ?? '',
        soins: (a.serviceIds ?? []).map((id) => byId.get(id)?.name ?? '').filter(Boolean).join(', '), duXof: apptDueXof(a, byId),
      }));
      const repDuJour = reprisesDuJour.get(j.iso) ?? [];
      let places = 0;
      if (!ouverture.closed && !passe) {
        const debut = j.iso === today ? Math.max(ouverture.openMin, maintenantMin) : ouverture.openMin;
        const occupe = appts.filter((a) => a.branchId === branch.id && a.date === j.iso && a.status !== 'annulé'
          && timeToMin(a.time) + apptDurationMin(a, byId) > debut)
          .reduce((s, a) => s + Math.min(apptDurationMin(a, byId), timeToMin(a.time) + apptDurationMin(a, byId) - Math.max(debut, timeToMin(a.time))), 0);
        const murs = plagesBloquees(blocages, branch.id, j.iso, '').reduce((s, [a, b]) => s + Math.max(0, Math.min(b, ouverture.closeMin) - Math.max(a, debut)), 0);
        places = Math.max(0, Math.floor((sieges * Math.max(0, ouverture.closeMin - debut - murs) - occupe) / DUREE_D_UNE_PLACE));
        placesLibres += places;
      }
      details[j.iso] = {
        iso: j.iso, ferme: ouverture.closed, passe, entreXof: j.encaisseXof,
        rdvXof: Math.round(rdvsDuJour.reduce((s, r) => s + r.duXof, 0) * prevision.rdv.taux),
        reprisesXof: Math.round(repDuJour.reduce((s, r) => s + r.valeurXof, 0) * prevision.reprises.taux),
        rdvs: rdvsDuJour, reprises: repDuJour, places,
      };
    }
    return { prevision, fourchette, details, placesLibres, rdvAGarder: rdvs.filter((r) => r.duXof > 0).length };
  }, [invoices, appts, clients, byId, apprenants, abonnes, blocages, branch.id, branch.seats, today, mk, dernierJour, clefDuTarif]);

  const moisPasses = useMemo(() => {
    const args = { invoices, appts, byId, apprenants, abonnes, branchId: branch.id };
    return [1, 2, 3].map((k) => {
      const m = moisAvant(mk, k);
      return `${MOIS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)} : ${fmtMoney(revenuDuMois(args, m), currency)}`;
    });
  }, [invoices, appts, byId, apprenants, abonnes, branch.id, mk, currency]);

  const fmt = (x: number) => fmtMoney(x, currency);
  const lignes = ceQuiFaitLaPrevision(calcul.prevision, fmt, `le ${Number(dernierJour.slice(8, 10))}`);
  const nomDuMois = `${MOIS[Number(mk.slice(5, 7)) - 1]} ${mk.slice(0, 4)}`;
  return {
    prevision: calcul.prevision, lignes, nomDuMois, today, mk, dernierJour, moisPasses, fmt,
    fourchette: calcul.fourchette, details: calcul.details, placesLibres: calcul.placesLibres, rdvAGarder: calcul.rdvAGarder,
    objectif: objectifDuMois(objectifs, mk),
  };
}

/* L'EXPLICATION DE CLAUDE, gardée le temps de la journée : rouvrir le
   tableau de bord ne la redemande pas (et ne la repaie pas). */
const explicationsDuJour = new Map<string, ExplicationDeLaPrevision>();

type CleDuCalcul = 'encaisse' | 'rdv' | 'reprises' | 'creances' | 'versements';

export function PrevisionDuMois({ donnees }: { donnees: DonneesDeLaPrevision }) {
  const navigate = useNavigate();
  const monProfil = useMonProfil();
  const { prevision, lignes, nomDuMois, today, mk, dernierJour, moisPasses, fmt, fourchette, details, placesLibres, rdvAGarder, objectif } = donnees;
  /* CLAUDE EXPLIQUE (choix du sélecteur) : la direction seule, et seulement
     quand la fonction posée connaît le chantier `prevision`. */
  const peutDemander = monProfil?.role === 'souverain' || monProfil?.role === 'gerant';
  const direction = peutDemander;
  const [claude, setClaude] = useState(false);
  useEffect(() => { let v = true; void versionDeIaMaison().then((x) => { if (v) setClaude(saitLeTableauIntelligent(x)); }); return () => { v = false; }; }, []);
  const cle = `${today}|${prevision.centraleXof}`;
  const [explication, setExplication] = useState<ExplicationDeLaPrevision | null>(() => explicationsDuJour.get(cle) ?? null);
  const [enCours, setEnCours] = useState(false);
  const [refus, setRefus] = useState('');
  const expliquer = async () => {
    setEnCours(true); setRefus('');
    const r = await demandeAClaude(demandeDExplication({
      mois: nomDuMois, aujourdhui: today, centrale: fmt(prevision.centraleXof), bas: fmt(prevision.basXof), haut: fmt(prevision.hautXof),
      parts: lignes.map((l) => ({ cle: l.cle, dit: l.dit })), moisPasses,
    }));
    setEnCours(false);
    if (!r.ok) { setRefus(r.message); return; }
    const e = explicationLisible(r.data);
    if (!e) { setRefus('L’assistant a répondu de travers ; réessayez.'); return; }
    explicationsDuJour.set(cle, e);
    setExplication(e);
  };

  const [jourChoisi, setJourChoisi] = useState(today);
  const [ligneOuverte, setLigneOuverte] = useState<CleDuCalcul | null>(null);
  /* L'objectif s'écrit avec ses espaces (3 000 000) ; la saisie se relit en chiffres seuls. */
  const ecrit = (v: number | null) => (v ? v.toLocaleString('fr-FR') : '');
  const [saisie, setSaisie] = useState(ecrit(objectif));
  useEffect(() => { setSaisie(ecrit(objectif)); }, [objectif]);

  const nombre = (x: number) => fmt(x).replace(/\s*F\s*$/, '').replace(/\s*FCFA\s*$/, '');
  const pct = (x: number) => `${Math.round(x * 100)} %`;
  const calcul = calculDeLaPrevision(prevision);
  const ecart = ecartDecompose(prevision);
  const leviers = leviersDuMois(prevision, { placesLibres, rdvAGarder });
  const cumul = cumulDuMois(prevision, today);
  const jours = prevision.jours;
  const n = jours.length;
  const encorAttendu = prevision.centraleXof - prevision.encaisseXof;
  const partEntree = prevision.centraleXof > 0 ? Math.min(1, prevision.encaisseXof / prevision.centraleXof) : 0;
  const aCombler = objectif ? objectif - prevision.centraleXof : 0;
  const leviersEnArgent = leviers.filter((l) => l.cle === 'reprises' || l.cle === 'creances').reduce((s, l) => s + l.gainXof, 0);

  /* LE DESSIN — en haut le cumul du mois (entré, prévu, fourchette, objectif),
     en bas l'argent de chaque jour ; chaque jour est un bouton. */
  const hautCumul = Math.max(prevision.hautXof, objectif ?? 0, 10000);
  const pasC = pasLisible(hautCumul);
  const maxC = Math.ceil((hautCumul * 1.04) / pasC) * pasC;
  const yC = (v: number) => 100 - (v / maxC) * 100;
  const plusHautJour = Math.max(10000, ...jours.map((j) => j.encaisseXof + j.prevuXof));
  const pasJ = pasLisible(plusHautJour);
  const maxJ = Math.ceil(plusHautJour / pasJ) * pasJ;
  const x = (i: number) => i * 10 + 5;
  const reelle = ['0,100', ...cumul.map((c, i) => (c.entreXof === null ? '' : `${x(i)},${yC(c.entreXof).toFixed(2)}`)).filter(Boolean)].join(' ');
  const iAuj = jours.findIndex((j) => j.iso === today);
  const departC = iAuj > 0 ? cumul[iAuj - 1].entreXof ?? 0 : 0;
  const prevue = iAuj >= 0
    ? [`${x(iAuj - 1)},${yC(departC).toFixed(2)}`, ...cumul.slice(iAuj).map((c, k) => `${x(iAuj + k)},${yC(c.prevuXof ?? 0).toFixed(2)}`)].join(' ')
    : '';
  const bande = iAuj >= 0
    ? [`${x(iAuj - 1)},${yC(departC).toFixed(2)}`, ...cumul.slice(iAuj).map((c, k) => `${x(iAuj + k)},${yC(c.hautXof ?? 0).toFixed(2)}`),
      ...cumul.slice(iAuj).map((c, k) => `${x(iAuj + k)},${yC(c.basXof ?? 0).toFixed(2)}`).reverse()].join(' ')
    : '';
  const gradC = Array.from({ length: Math.round(maxC / pasC) + 1 }, (_, i) => i * pasC);
  const gradJ = Array.from({ length: Math.round(maxJ / pasJ) + 1 }, (_, i) => i * pasJ);
  const court = (v: number) => (v >= 1_000_000 ? `${(v / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M` : v >= 1000 ? `${Math.round(v / 1000)} k` : String(v));

  const d = details[jourChoisi];
  const joursOuvertsPasses = jours.filter((j) => j.iso < today && !details[j.iso]?.ferme);
  const moyenneOuvert = joursOuvertsPasses.length ? Math.round(prevision.encaisseXof / joursOuvertsPasses.length) : 0;
  const plusCreux = jours.filter((j) => j.iso >= today && details[j.iso] && !details[j.iso].ferme && details[j.iso].places > 0)
    .sort((a, b) => (a.prevuXof - b.prevuXof) || (details[b.iso].places - details[a.iso].places))[0];

  const ouvreLaLigne = (c: CleDuCalcul) => { setLigneOuverte(c); document.getElementById('trd-mois-calcul')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const choisirJour = (iso: string) => { setJourChoisi(iso); document.getElementById('trd-mois-jour')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); };
  const fiche = (id: string) => navigate(`/customers?id=${id}`);

  const toutesReprises = Object.values(details).flatMap((x2) => x2.reprises.map((r) => ({ ...r, iso: x2.iso })));
  const tousRdv = Object.values(details).flatMap((x2) => x2.rdvs.map((r) => ({ ...r, iso: x2.iso })));

  const explicationDe: Record<CleDuCalcul, string> = {
    encaisse: `L’argent réellement encaissé depuis le 1er, toutes caisses (la règle des Revenus du mois). Il ne bouge plus : bas et haut le comptent pareil.`,
    rdv: `Ce que les ${prevision.rdv.nombre} rendez-vous posés d’ici le ${Number(dernierJour.slice(8, 10))} doivent encore, acomptes déduits, comptés à ${pct(prevision.rdv.taux)}${prevision.rdv.peuDHistoire ? ' (trop peu d’historique : 90 % par défaut)' : ', votre part de venues tenues sur douze mois'}.`,
    reprises: `${prevision.reprises.nombre} clientes dont le rythme tombe d’ici la fin du mois, sans rendez-vous posé. Leur rituel vaut ${fmt(prevision.reprises.valeurXof)} ; on n’en compte que ${pct(prevision.reprises.taux)}, la part des retours qui tombent à deux semaines près.`,
    creances: prevision.creances.mois
      ? `Ce qui rentre d’habitude après aujourd’hui sur des pièces plus anciennes : ${fmt(prevision.creances.medianeXof)} au milieu des ${prevision.creances.mois} derniers mois, de ${fmt(prevision.creances.basXof)} à ${fmt(prevision.creances.hautXof)}. C’est la part la plus incertaine.`
      : 'Pas encore d’historique pour les créances de fin de mois.',
    versements: 'Des versements déjà inscrits, datés plus tard ce mois.',
  };

  return (
    <section className="trd-mois" aria-label={`La prévision de ${nomDuMois}`} id="le-mois">
      {/* ── L'EN-TÊTE : où va le mois, ce qui est entré, l'objectif ── */}
      <div className="trd-mois__tete">
        <div className="trd-mois__chiffre">
          <span className="trd-mois__sur">Fin {nomDuMois.split(' ')[0]}, si le rythme tient</span>
          <span className="trd-mois__gros">{fmt(prevision.centraleXof)}</span>
          <span className="trd-mois__dit">
            Entre {fmt(prevision.basXof)} (bas) et {fmt(prevision.hautXof)} (haut).{' '}
            <a href="#trd-mois-bas-haut" className="trd-mois__lien">Ce que veulent dire bas et haut</a>
          </span>
        </div>
        <div className="trd-mois__avance">
          <div className="trd-mois__avance-ligne"><span>Déjà entré</span><b>{fmt(prevision.encaisseXof)} · {pct(partEntree)}</b></div>
          <div className="trd-mois__barre" aria-hidden="true"><i style={{ width: `${partEntree * 100}%` }} /></div>
          <div className="trd-mois__avance-ligne"><span>Encore attendu d’ici le {Number(dernierJour.slice(8, 10))}</span><b>{fmt(encorAttendu)}</b></div>
        </div>
        <div className="trd-mois__objectif">
          <label htmlFor="trd-mois-objectif" className="trd-mois__sur">Objectif de {nomDuMois}</label>
          {direction ? (
            <form className="trd-mois__objectif-champ" onSubmit={(e) => { e.preventDefault(); const v = Number(saisie.replace(/\D/g, '')); fixeLObjectif(mk, v > 0 ? v : null); }}>
              <input id="trd-mois-objectif" inputMode="numeric" placeholder="À fixer" value={saisie} onChange={(e) => setSaisie(e.target.value)} />
              <button type="submit" className="trd-mois__btn trd-mois__btn--plein">Enregistrer</button>
              <button type="button" className="trd-mois__btn" onClick={() => { setSaisie(ecrit(prevision.hautXof)); fixeLObjectif(mk, prevision.hautXof); }}>Viser le haut</button>
            </form>
          ) : (
            <span className="trd-mois__gros trd-mois__gros--petit">{objectif ? fmt(objectif) : 'Pas fixé'}</span>
          )}
          <span className={`trd-mois__ecart${!objectif ? '' : aCombler > 0 ? ' est-manque' : ' est-atteint'}`}>
            {!objectif
              ? 'Fixez un objectif : l’écart à combler s’affiche ici, et sur la courbe.'
              : aCombler > 0
                ? `Il manque ${fmt(aCombler)} à la prévision.${leviersEnArgent > 0 ? ` Les leviers ci-dessous couvrent jusqu’à ${fmt(leviersEnArgent)}.` : ''}`
                : `La prévision dépasse l’objectif de ${fmt(-aCombler)}.`}
          </span>
        </div>
      </div>

      {/* ── LE GRAPHE ── */}
      <figure className="trd-mois__graphe">
        <div className="trd-mois__legende">
          <span><i className="trd-cle trd-cle--cumul" />Cumul entré</span>
          <span><i className="trd-cle trd-cle--prevu" />Cumul prévu</span>
          <span><i className="trd-cle trd-cle--bande" />Fourchette bas · haut</span>
          {objectif ? <span><i className="trd-cle trd-cle--objectif" />Objectif</span> : null}
          <span><i className="trd-cle trd-cle--entre" />Entré ce jour</span>
          <span><i className="trd-cle trd-cle--rdv" />Attendu : RDV posés</span>
          <span><i className="trd-cle trd-cle--reprises" />Attendu : reprises</span>
        </div>
        <div className="trd-mois__aire">
          <div className="trd-mois__axe trd-mois__axe--gauche" aria-hidden="true">
            <span className="trd-mois__axe-titre">Par jour</span>
            {gradJ.map((g) => <span key={g} style={{ bottom: `${24 + (g / maxJ) * 120}px` }}>{court(g)}</span>)}
          </div>
          <div className="trd-mois__plan">
            <div className="trd-mois__haut" aria-hidden="true">
              {gradC.map((g) => <i key={g} className="trd-mois__grille" style={{ top: `${yC(g)}%` }} />)}
              <svg viewBox={`0 0 ${n * 10} 100`} preserveAspectRatio="none" className="trd-mois__svg">
                {bande && <polygon points={bande} className="trd-mois__bande" />}
                <polyline points={reelle} className="trd-mois__cumul" vectorEffect="non-scaling-stroke" />
                {prevue && <polyline points={prevue} className="trd-mois__prevu" vectorEffect="non-scaling-stroke" />}
                {objectif ? <line x1={0} x2={n * 10} y1={yC(objectif)} y2={yC(objectif)} className="trd-mois__ligne-objectif" vectorEffect="non-scaling-stroke" /> : null}
              </svg>
            </div>
            <div className="trd-mois__bas" aria-hidden="true">
              {gradJ.map((g) => <i key={g} className="trd-mois__grille" style={{ bottom: `${(g / maxJ) * 100}%` }} />)}
            </div>
            <div className="trd-mois__colonnes" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
              {jours.map((j) => {
                const det = details[j.iso];
                const passe = j.iso < today;
                const h = (v: number) => `${Math.max(0, (v / maxJ) * 120)}px`;
                const choisi = j.iso === jourChoisi;
                const aria = `${majuscule(jourDit(j.iso))}${det?.ferme ? ', fermé' : passe ? `, entré ${fmt(j.encaisseXof)}` : `, attendu ${fmt(j.encaisseXof + j.prevuXof)}`}`;
                return (
                  <button key={j.iso} type="button" className={`trd-mois__jour${choisi ? ' est-choisi' : ''}${j.iso === today ? ' est-aujourdhui' : ''}${det?.ferme ? ' est-ferme' : ''}`}
                    aria-label={aria} aria-pressed={choisi} onClick={() => choisirJour(j.iso)} title={aria}>
                    <span className="trd-mois__pile">
                      {!passe && det && det.reprisesXof > 0 && <i className="trd-b trd-b--reprises" style={{ height: h(det.reprisesXof) }} />}
                      {!passe && det && det.rdvXof > 0 && <i className="trd-b trd-b--rdv" style={{ height: h(det.rdvXof) }} />}
                      {j.encaisseXof > 0 && <i className="trd-b trd-b--entre" style={{ height: h(j.encaisseXof) }} />}
                      {det?.ferme && <i className="trd-b trd-b--ferme" />}
                    </span>
                    <span className={`trd-mois__date${Number(j.iso.slice(8, 10)) % 7 === 1 || choisi || j.iso === today ? ' est-repere' : ''}`}>{Number(j.iso.slice(8, 10))}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="trd-mois__axe trd-mois__axe--droite" aria-hidden="true">
            <span className="trd-mois__axe-titre">Cumul</span>
            {gradC.map((g) => <span key={g} style={{ top: `calc(${(yC(g) / 100) * 180}px - 7px)` }}>{court(g)}</span>)}
          </div>
        </div>
        <figcaption className="trd-mois__note">Touchez un jour : son détail s’ouvre dessous, avec ce qu’on peut y faire. Les jours hachurés, la Maison est fermée.</figcaption>
      </figure>

      {/* ── LE JOUR CHOISI ── */}
      {d && (
        <div className="trd-mois__jour-detail" id="trd-mois-jour">
          <div className="trd-mois__jour-tete">
            <h3>{majuscule(jourDit(d.iso))}{d.iso === today ? ' · aujourd’hui' : ''}</h3>
            <span>{d.ferme ? 'La Maison est fermée' : d.passe ? 'Un jour passé : ce qui est entré' : 'Un jour à venir : ce qui est attendu, et comment le remplir'}</span>
          </div>
          {d.ferme ? (
            <p className="trd-mois__vide">Rien d’entré, rien d’attendu ce jour-là.</p>
          ) : d.passe ? (
            <div className="trd-mois__cartes">
              <div className="trd-mois__carte">
                <span className="trd-mois__sur">Entré ce jour</span>
                <b className="trd-mois__moyen">{fmt(d.entreXof)}</b>
                <span>{prevision.encaisseXof > 0 ? pct(d.entreXof / prevision.encaisseXof) : '0 %'} de ce qui est entré ce mois</span>
              </div>
              <div className="trd-mois__carte">
                <span className="trd-mois__sur">Face à un jour ordinaire</span>
                <b className="trd-mois__moyen">{d.entreXof >= moyenneOuvert ? '+' : ''}{fmt(d.entreXof - moyenneOuvert)}</b>
                <span>Moyenne des {joursOuvertsPasses.length} jours ouverts du mois : {fmt(moyenneOuvert)}</span>
              </div>
              <div className="trd-mois__gestes trd-mois__gestes--colonne">
                <button type="button" className="trd-mois__btn trd-mois__btn--plein" onClick={() => navigate(`/calendrier?jour=${d.iso}`)}>Le calendrier de ce jour</button>
                <button type="button" className="trd-mois__btn" onClick={() => navigate('/encaissements')}>Les encaissements du mois</button>
              </div>
            </div>
          ) : (
            <>
              <div className="trd-mois__cartes">
                <div className="trd-mois__carte">
                  <span className="trd-mois__sur">Attendu ce jour</span>
                  <b className="trd-mois__moyen">{fmt(d.entreXof + d.rdvXof + d.reprisesXof)}</b>
                  <table className="trd-mois__mini">
                    <tbody>
                      {d.entreXof > 0 && <tr><td>Déjà entré aujourd’hui</td><td>{fmt(d.entreXof)}</td></tr>}
                      <tr><td>RDV posés, à {pct(prevision.rdv.taux)}</td><td>{fmt(d.rdvXof)}</td></tr>
                      <tr><td>Reprises, à {pct(prevision.reprises.taux)}</td><td>{fmt(d.reprisesXof)}</td></tr>
                      <tr><td>Places libres (rituels de 2 h)</td><td>{d.places}</td></tr>
                    </tbody>
                  </table>
                </div>
                <div className="trd-mois__carte">
                  <span className="trd-mois__sur">Les RDV posés · {d.rdvs.length}</span>
                  {d.rdvs.length === 0 && <span className="trd-mois__vide">Aucun RDV posé.</span>}
                  {d.rdvs.map((r) => (
                    <button key={r.id} type="button" className="trd-mois__item" onClick={() => fiche(r.clientId)}>
                      <span>{r.heure} · {r.nom}{r.soins ? ` · ${r.soins}` : ''}</span><span>{r.duXof > 0 ? `${fmt(r.duXof)} dus` : 'réglé'}</span>
                    </button>
                  ))}
                </div>
                <div className="trd-mois__carte">
                  <span className="trd-mois__sur">Les reprises attendues, sans RDV · {d.reprises.length}</span>
                  {d.reprises.length === 0 && <span className="trd-mois__vide">Aucune reprise attendue ce jour.</span>}
                  {d.reprises.map((r) => (
                    <button key={r.clientId} type="button" className="trd-mois__item" onClick={() => fiche(r.clientId)}>
                      <span>{r.nom}{r.semaines ? ` · toutes les ${r.semaines} semaines` : ''}</span><span>{fmt(r.valeurXof)}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="trd-mois__gestes">
                {d.reprises.length > 0 && <button type="button" className="trd-mois__btn trd-mois__btn--cuivre" onClick={() => navigate('/gerard')}>Relancer {d.reprises.length > 1 ? `les ${d.reprises.length} reprises` : 'la reprise'} (Assistant Maison)</button>}
                {d.places > 0 && <button type="button" className="trd-mois__btn trd-mois__btn--plein" onClick={() => navigate(`/calendrier?jour=${d.iso}`)}>Remplir les {d.places} place{d.places > 1 ? 's' : ''} libre{d.places > 1 ? 's' : ''}</button>}
                {d.rdvs.length > 0 && <button type="button" className="trd-mois__btn" onClick={() => navigate('/gerard')}>Garder les RDV de ce jour</button>}
                <button type="button" className="trd-mois__btn" onClick={() => navigate(`/calendrier?jour=${d.iso}`)}>Le calendrier de ce jour</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── LES LEVIERS ── */}
      {leviers.length > 0 && (
        <div className="trd-mois__leviers" id="les-leviers">
          <h3 className="trd-mois__titre">Les leviers d’ici le {Number(dernierJour.slice(8, 10))}, rangés par ce qu’ils rapportent</h3>
          <div className="trd-mois__leviers-grille">
            {leviers.map((l, i) => (
              <article key={l.cle} className="trd-mois__levier">
                {l.cle === 'reprises' && (<>
                  <div className="trd-mois__levier-tete"><h4>{i + 1} · Poser les {l.nombre} reprises attendues</h4><b>jusqu’à +{fmt(l.gainXof)}</b></div>
                  <p>Elles valent {fmt(prevision.reprises.valeurXof)}, la prévision n’en compte que {fmt(prevision.reprises.comptesXof)} ({pct(prevision.reprises.taux)}). Une reprise posée passe à 100 % : {nombre(prevision.reprises.valeurXof)} − {nombre(prevision.reprises.comptesXof)} = {fmt(l.gainXof)}.</p>
                  <div className="trd-mois__gestes"><button type="button" className="trd-mois__btn trd-mois__btn--plein" onClick={() => navigate('/gerard')}>Les relancer (Assistant Maison)</button><button type="button" className="trd-mois__btn" onClick={() => ouvreLaLigne('reprises')}>Voir les {l.nombre}</button></div>
                </>)}
                {l.cle === 'creances' && (<>
                  <div className="trd-mois__levier-tete"><h4>{i + 1} · Encaisser les restes à payer</h4><b>jusqu’à +{fmt(l.gainXof)}</b></div>
                  <p>Le haut compte {fmt(prevision.creances.hautXof)} de créances, la prévision {fmt(prevision.creances.medianeXof)}. Chaque pièce soldée avant le {Number(dernierJour.slice(8, 10))} rapproche du haut.</p>
                  <div className="trd-mois__gestes"><button type="button" className="trd-mois__btn trd-mois__btn--plein" onClick={() => navigate('/creances')}>Les créances</button><button type="button" className="trd-mois__btn" onClick={() => ouvreLaLigne('creances')}>Voir le calcul</button></div>
                </>)}
                {l.cle === 'places' && (<>
                  <div className="trd-mois__levier-tete"><h4>{i + 1} · Remplir les {l.nombre} places libres d’ici le {Number(dernierJour.slice(8, 10))}</h4><b>un rituel par place</b></div>
                  <p>{plusCreux ? `Le jour le plus creux : ${jourDit(plusCreux.iso)}, ${fmt(plusCreux.prevuXof)} attendus pour ${details[plusCreux.iso].places} place${details[plusCreux.iso].places > 1 ? 's' : ''} libre${details[plusCreux.iso].places > 1 ? 's' : ''}.` : 'Places comptées en rituels de 2 h, fauteuils et murs déduits.'} L’Assistant Maison y propose déjà ses remises de jour creux, dans le plafond de la semaine.</p>
                  <div className="trd-mois__gestes">{plusCreux && <button type="button" className="trd-mois__btn trd-mois__btn--plein" onClick={() => choisirJour(plusCreux.iso)}>Voir ce jour</button>}<button type="button" className="trd-mois__btn" onClick={() => navigate('/gerard')}>L’Assistant Maison</button></div>
                </>)}
                {l.cle === 'garder' && (<>
                  <div className="trd-mois__levier-tete"><h4>{i + 1} · Garder les {l.nombre} RDV posés</h4><b>protège {fmt(l.gainXof)}</b></div>
                  <p>Un RDV annulé fait descendre la prévision : {fmt(prevision.rdv.duXof)} encore dus sur ces RDV, {fmt(l.gainXof)} entre le compté et le bas.</p>
                  <div className="trd-mois__gestes"><button type="button" className="trd-mois__btn trd-mois__btn--plein" onClick={() => navigate('/gerard')}>L’Assistant Maison</button><button type="button" className="trd-mois__btn" onClick={() => ouvreLaLigne('rdv')}>Voir les {l.nombre}</button></div>
                </>)}
              </article>
            ))}
          </div>
        </div>
      )}

      {/* ── LE CALCUL, LIGNE À LIGNE ── */}
      <div className="trd-mois__calcul" id="trd-mois-calcul">
        <h3 className="trd-mois__titre">Le calcul, ligne à ligne <span>en francs CFA · touchez une ligne</span></h3>
        <div className="trd-mois__defile">
          <table className="trd-calc">
            <thead>
              <tr><th scope="col">Part</th><th scope="col">Base</th><th scope="col">Taux</th><th scope="col">Compté</th><th scope="col">Bas</th><th scope="col">Haut</th><th scope="col">Écart</th></tr>
            </thead>
            {calcul.lignes.map((l) => {
              const ouvert = ligneOuverte === l.cle;
              return (
                <tbody key={l.cle} className={ouvert ? 'est-ouvert' : ''}>
                  <tr>
                    <th scope="row">
                      <button type="button" className="trd-calc__bascule" aria-expanded={ouvert} onClick={() => setLigneOuverte(ouvert ? null : l.cle)}>
                        <span aria-hidden="true">{ouvert ? '▾' : '▸'}</span> {l.libelle}
                      </button>
                    </th>
                    <td>{nombre(l.baseXof)}</td>
                    <td>{l.taux === null ? '' : `× ${Math.round(l.taux * 100)} %`}</td>
                    <td className="trd-calc__compte">{nombre(l.compteXof)}</td>
                    <td className="trd-calc__fourchette">{nombre(l.basXof)}</td>
                    <td className="trd-calc__fourchette">{nombre(l.hautXof)}</td>
                    <td className="trd-calc__ecart">{nombre(Math.max(0, l.hautXof - l.basXof))}</td>
                  </tr>
                  {ouvert && (
                    <tr className="trd-calc__detail">
                      <td colSpan={7}>
                        <p>{explicationDe[l.cle]}</p>
                        {l.cle === 'rdv' && tousRdv.slice(0, 12).map((r) => (
                          <button key={r.id} type="button" className="trd-mois__item" onClick={() => fiche(r.clientId)}><span>{majuscule(jourDit(r.iso))} · {r.heure} · {r.nom}</span><span>{fmt(r.duXof)}</span></button>
                        ))}
                        {l.cle === 'reprises' && toutesReprises.map((r) => (
                          <button key={r.clientId} type="button" className="trd-mois__item" onClick={() => fiche(r.clientId)}><span>{r.nom} · attendue {jourDit(r.iso)}</span><span>{fmt(r.valeurXof)}</span></button>
                        ))}
                        <div className="trd-mois__gestes">
                          {l.cle === 'encaisse' && <button type="button" className="trd-mois__btn trd-mois__btn--plein" onClick={() => navigate('/encaissements')}>Les encaissements du mois</button>}
                          {l.cle === 'rdv' && <button type="button" className="trd-mois__btn trd-mois__btn--plein" onClick={() => navigate('/gerard')}>Les garder (Assistant Maison)</button>}
                          {l.cle === 'reprises' && <button type="button" className="trd-mois__btn trd-mois__btn--plein" onClick={() => navigate('/gerard')}>Les relancer (Assistant Maison)</button>}
                          {l.cle === 'creances' && <button type="button" className="trd-mois__btn trd-mois__btn--plein" onClick={() => navigate('/creances')}>Les créances</button>}
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              );
            })}
            <tfoot>
              <tr>
                <th scope="row">Total prévisionnel</th><td /><td />
                <td className="trd-calc__compte">{nombre(calcul.total.compteXof)}</td>
                <td>{nombre(calcul.total.basXof)}</td>
                <td>{nombre(calcul.total.hautXof)}</td>
                <td className="trd-calc__ecart">{nombre(ecart.totalXof)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="trd-mois__cartes trd-mois__cartes--deux" id="trd-mois-bas-haut">
          <div className="trd-mois__carte">
            <h4>Bas et haut, en clair</h4>
            {fourchette.mode === 'mesuree' ? (
              <p>La fourchette est <b>mesurée</b> sur {fourchette.moisJuges} mois rejoués : chacun, rejoué au même jour du mois avec ce que le Trône savait alors, a vu rentrer ensuite entre {pct(fourchette.ratioBas)} et {pct(fourchette.ratioHaut)} de ce qui restait prévu. Bas et haut appliquent ces deux rapports au reste prévu de ce mois ; l’entré ne bouge pas.</p>
            ) : (<>
              <p><b>Bas, {fmt(prevision.basXof)}</b> : le mois si tout tourne moins bien que d’habitude. RDV posés tenus à {pct(Math.max(0, prevision.rdv.taux - 0.1))} (10 points sous votre taux), la moitié des reprises attendues ({pct(prevision.reprises.taux / 2)} au lieu de {pct(prevision.reprises.taux)}), les créances comme au plus faible des derniers mois ({fmt(prevision.creances.basXof)}).</p>
              <p><b>Haut, {fmt(prevision.hautXof)}</b> : RDV tenus à {pct(Math.min(1, prevision.rdv.taux + 0.05))}, une fois et demie les reprises ({pct(Math.min(1, prevision.reprises.taux * 1.5))}), les créances comme au meilleur mois ({fmt(prevision.creances.hautXof)}).</p>
              <p className="trd-mois__aveu">Ces marges sont encore des règles : la fourchette se mesurera sur les mois rejoués dès {Math.max(0, 3 - fourchette.moisJuges)} mois de plus ({fourchette.moisJuges} jugé{fourchette.moisJuges > 1 ? 's' : ''} sur 3).</p>
            </>)}
          </div>
          <div className="trd-mois__carte">
            <h4>D’où vient l’écart de {fmt(ecart.totalXof)} entre bas et haut</h4>
            <div className="trd-mois__empile" role="img" aria-label={ecart.parts.map((p) => `${p.cle === 'creances' ? 'Créances' : p.cle === 'reprises' ? 'Reprises' : 'RDV posés'} ${fmt(p.xof)}, ${p.pct} %`).join(' ; ')}>
              {ecart.parts.filter((p) => p.pct > 0).map((p) => <i key={p.cle} className={`trd-e trd-e--${p.cle}`} style={{ width: `${p.pct}%` }} />)}
            </div>
            <table className="trd-mois__mini">
              <tbody>
                {ecart.parts.map((p) => (
                  <tr key={p.cle}>
                    <td><i className={`trd-e-cle trd-e--${p.cle}`} aria-hidden="true" />{p.cle === 'creances' ? 'Créances : rentreront-elles ?' : p.cle === 'reprises' ? 'Reprises : posées ou pas' : 'RDV posés : tenus ou annulés'}</td>
                    <td>{fmt(p.xof)} · {p.pct} %</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>L’écart se réduit par les gestes : chaque reprise posée sort du doute, chaque créance encaissée aussi.</p>
          </div>
        </div>

        {explication ? (
          <div className="trd-mois__claude" role="note">
            <p><b>L’assistant :</b> {explication.phrase}</p>
            {explication.gestes.length > 0 && <ul>{explication.gestes.map((g) => <li key={g}>{g}</li>)}</ul>}
          </div>
        ) : peutDemander && claude ? (
          <button type="button" className="trd-mois__btn" onClick={() => { void expliquer(); }} disabled={enCours}>
            {enCours ? 'L’assistant lit le calcul…' : 'Demander pourquoi à l’assistant ›'}
          </button>
        ) : null}
        {refus && <span className="trd-mois__note">{refus}</span>}
      </div>
    </section>
  );
}
