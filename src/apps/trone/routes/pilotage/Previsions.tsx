import { usePiecesDeLaMaison } from '../../../../shared/essai';
import { useId, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useBranch } from '../../../../shared/branches';
import { useSettings, openingForIso } from '../../../../shared/settings';
import { predictNextVisit, tauxDeRealisation } from '../../../../shared/cadence';
import { dortDepuisLongtemps, estDePassage, estDiaspora, aDefaitSesLocks, MOIS_AVANT_SORTIE } from '../../../../shared/clients';
import { apptPaidXof } from '../../../../shared/agenda';
import { useInvoices } from '../../../../shared/finance';
import { NOMS_DES_JOURS, ajouteJours, chargeSurObjectif, jourDeSemaine, rdvParJour, reperesDe, reperesParJour } from '../../../../shared/objectifs-des-fauteuils-pur';
import {
  bornesDeLHorizon, calculeLesPrevisions, finDuMois, mesureDesEnvois, moisDuPasse, nomDeLHorizon, nouvellesClientes, placeDeLaCliente,
  premierMoisJugeLisibleLe, rdvsConnusLe, rejoueLeMois, resumeDuRejeu,
  HORIZONS_DES_PREVISIONS, type ColonneDesPrevisions, type HorizonDesPrevisions, type Levier, type MoisRejoue, type Previsions as LesPrevisions, type RdvDesPrevisions,
} from '../../../../shared/previsions-pur';
import {
  basculeLePanneau, leviersParGain, partsDeLaJauge, remplissage, sousTexteDuJour, tonDuJour, vueDeLAdresse,
  PANNEAU_OUVERT_AU_DEPART, VUES_DES_PREVISIONS, type PanneauDuDetail, type VueDesPrevisions,
} from './previsions-affichage-pur';
import { useCampaigns, useEnvois } from '../equipe/data';
import { apptDueXof, apptDurationMin, apptNetXof, todayISO, useBranchAppointments, useBranchClients, useServicesById } from '../clients/_shared';
import { chiffreAttenduDuJour } from '../clients/chiffre-du-jour-pur';
import { fmtMoney } from '../../../../shared/currency';
import { PrevisionDuMois, usePrevisionDuMois } from './PrevisionDuMois';
import { DemanderALaMaison } from './DemanderALaMaison';
import { PageHead } from '../_ui';
import './previsions.css';

/* ══ LES PRÉVISIONS, 26 octobre 2026 ════════════════════════════════════
   « Il faut construire un meilleur système pour les prévisions à venir, et
   savoir le nombre de fauteuils qu'on pourrait remplir, de façon
   atteignable, si on met en place un système marketing » (Yéman).
   Maquette 1opRHqoVJHVA3oHxVw5kcM, choix du sélecteur : plafond = fait au
   moins un jour sur dix, quatre semaines d'abord, taux du marketing mesurés
   seulement, la rubrique en Direction sous le Centre de commande.

   « ET LES MOIS PASSÉS ? » (le même jour, choix du sélecteur : le réalisé et
   la prévision rejouée) : la vue « 12 derniers mois ». Chaque mois entier, ce
   que la prévision aurait dit au 1er avec ce que le Trône savait alors, à
   côté de ce qui est venu, sous le plafond d'alors.

   REFAITES LE 11 NOVEMBRE 2026 : « L'UI/l'UX des prévisions est médiocre.
   Refais-moi une belle et professionnelle » (Y.), maquette
   PYPe8AbTyxytSBxZLDiMZ7 validée par « construis ». L'horizon (un segment, à
   droite du titre) est séparé de la vue (trois onglets soulignés) ; quatre
   chiffres en tuiles ; une jauge du plafond ; le graphe et « Ce qui remplit »
   côte à côte ; les 14 jours en bande de cases ; les trois tableaux du calcul
   repliés, un seul ouvert. Les règles vivent dans `shared/previsions-pur.ts`
   et ne changent pas ; ce que l'écran choisit de montrer vit dans
   `previsions-affichage-pur.ts`. */

const un = (x: number) => x.toLocaleString('fr-FR', { maximumFractionDigits: 1, minimumFractionDigits: 0 });
const entier = (x: number) => Math.round(x).toLocaleString('fr-FR');
const pct = (x: number) => `${Math.round(x * 100)} %`;
const signe = (x: number) => { const r = Math.round(x); return r > 0 ? `+${r}` : r < 0 ? `−${-r}` : '0'; };
const s = (n: number) => (n > 1 ? 's' : '');
const MOIS_DITS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const leJourDit = (j: string) => `${Number(j.slice(8, 10)) === 1 ? '1er' : Number(j.slice(8, 10))} ${MOIS_DITS[Number(j.slice(5, 7)) - 1]} ${j.slice(0, 4)}`;

/** LES RENDEZ-VOUS DE LA BRANCHE, avec ce qui fait une venue : l'argent reçu
    et la facture (la règle du Carnet, `estUneVenue`). */
function useLesRdvs(): RdvDesPrevisions[] {
  const appts = useBranchAppointments();
  const [pieces] = usePiecesDeLaMaison();
  return useMemo(() => {
    const factures = new Set(pieces.filter((p) => p.apptId && p.kind === 'facture').map((p) => p.apptId as string));
    return appts.map((a) => ({
      clientId: a.clientId, date: a.date, status: a.status, creeLe: a.creeLe,
      encaisse: apptPaidXof(a) > 0, facture: !!a.invoiceId || factures.has(a.id),
    }));
  }, [appts, pieces]);
}

/** UN DES QUATORZE PROCHAINS JOURS : ses posés contre l'ordinaire de son jour
    de la semaine, et le verdict « creux » du Carnet. */
type JourProchain = { iso: string; nom: string; poses: number; ferme: boolean; ordinaire: number; creux: boolean; manque: number };

function usePrevisions(horizon: HorizonDesPrevisions, rdvs: RdvDesPrevisions[]): { p: LesPrevisions; titre: string; debut: string; fin: string; quatorze: JourProchain[] } {
  const { branch } = useBranch();
  const appts = useBranchAppointments();
  const clients = useBranchClients();
  const byId = useServicesById();
  const [envois] = useEnvois();
  const [campagnes] = useCampaigns();
  const [reglages] = useSettings();
  const today = todayISO();

  /* Ce qui ne dépend pas de l'horizon se calcule une fois. */
  const socle = useMemo(() => {
    const estOuvertLe = (j: string) => !openingForIso(j).closed;
    const parJour = rdvParJour(rdvs);
    const reperes = reperesParJour({ parJour, aujourdhui: today, ouvertLe: estOuvertLe });
    const venues = appts.filter((a) => a.status === 'honoré' && !(a.seriesIndex && a.seriesIndex > 1));
    const juste = tauxDeRealisation(venues);
    /* Les leviers mesurés : la reprise proposée (l'automatisation « 3 jours
       avant une reprise ») et les campagnes adressées aux Dormantes. */
    const sesEnvois = envois.filter((e) => !e.branchId || e.branchId === branch.id);
    const dormantes = new Set(campagnes.filter((c) => c && c.branchId === branch.id && c.audience === 'dormantes').map((c) => c.id));
    const relance = mesureDesEnvois(sesEnvois.filter((e) => e.type === 'reprise-j3'), rdvs, today);
    const reveil = mesureDesEnvois(sesEnvois.filter((e) => e.type === 'campagne' && !!e.campagneId && dormantes.has(e.campagneId)), rdvs, today);
    /* La durée moyenne d'un rituel honoré des six derniers mois, pour mémoire. */
    const recents = appts.filter((a) => a.status === 'honoré' && a.date >= ajouteJours(today, -182) && a.date < today);
    const dureeMoyenneMin = recents.length ? recents.reduce((s, a) => s + apptDurationMin(a, byId), 0) / recents.length : 0;
    const parCliente = new Map<string, typeof appts>();
    for (const a of appts) { const l = parCliente.get(a.clientId); if (l) l.push(a); else parCliente.set(a.clientId, [a]); }
    return { estOuvertLe, rdvs, parJour, reperes, justesse: juste ? juste.dans14 / 100 : null, relance, reveil, dureeMoyenneMin, parCliente };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appts, rdvs, envois, campagnes, branch.id, byId, today, reglages]);

  return useMemo(() => {
    const bornes = bornesDeLHorizon(horizon, today);
    /* CHAQUE CLIENTE À UNE SEULE PLACE (`placeDeLaCliente`). */
    const reprises: { iso: string }[] = [];
    let retard = 0; let endormies = 0;
    for (const c of clients) {
      const siens = socle.parCliente.get(c.id);
      if (!siens) continue;
      const cad = predictNextVisit(siens, [c], c.id, today);
      const aUnRdvAVenir = siens.some((a) => a.date >= today && a.status !== 'annulé' && a.status !== 'honoré');
      const derniere = siens.filter((a) => a.status === 'honoré').reduce<string | undefined>((d, a) => (!d || a.date > d ? a.date : d), undefined);
      const ecartee = estDePassage(c) || estDiaspora(c) || aDefaitSesLocks(c);
      const place = placeDeLaCliente({
        aUnRdvAVenir, predit: cad.predicted, iso: cad.iso, retardJours: cad.overdueDays, fin: bornes.fin,
        dort: !ecartee && dortDepuisLongtemps(c, derniere, today, MOIS_AVANT_SORTIE),
      });
      if (place === 'attendue' && cad.iso) reprises.push({ iso: cad.iso });
      else if (place === 'retard') retard += 1;
      else if (place === 'endormie') endormies += 1;
    }
    const filleules = new Set(clients.filter((c) => !!c.parraineePar).map((c) => c.id));
    const p = calculeLesPrevisions({
      aujourdhui: today, bornes, rdvs: socle.rdvs, parJour: socle.parJour, ouvertLe: socle.estOuvertLe, reperes: socle.reperes,
      reprises, justesse: socle.justesse,
      nouvelles: nouvellesClientes(socle.rdvs, (id) => filleules.has(id), today, bornes),
      retard, endormies, relance: socle.relance, reveil: socle.reveil,
      physique: { sieges: Math.max(0, branch.seats ?? 0), dureeMoyenneMin: socle.dureeMoyenneMin, ouverture: openingForIso },
    });
    /* « LES 14 PROCHAINS JOURS » (27 octobre 2026, lot 3 de l'Assistant
       Maison, maquette « 4 tuiles replacées ») : dès demain, jour par jour,
       les posés contre l'ORDINAIRE du jour de la semaine (la médiane des 26
       dernières semaines, `reperesParJour`). Le jour creux est celui du
       Carnet (`chargeSurObjectif`) : une seule définition. Le manque est ce
       qui sépare les posés de l'ordinaire, un jour creux seulement. */
    const quatorze: JourProchain[] = Array.from({ length: 14 }, (_, k) => ajouteJours(today, k + 1)).map((iso) => {
      const poses = socle.parJour.get(iso) ?? 0;
      const ferme = !socle.estOuvertLe(iso) && poses === 0;
      const r = reperesDe(socle.reperes, iso);
      const creux = !ferme && chargeSurObjectif(poses, r).ton === 'creux';
      return { iso, nom: NOMS_DES_JOURS[jourDeSemaine(iso)], poses, ferme, ordinaire: ferme ? 0 : r.ordinaire, creux, manque: creux ? r.ordinaire - poses : 0 };
    });
    return { p, titre: bornes.titre, debut: bornes.debut, fin: bornes.fin, quatorze };
  }, [horizon, today, clients, socle, branch.seats]);
}

/** LE PASSÉ REJOUÉ : chaque mois entier des douze derniers, la prévision
    refaite au 1er avec ce que le Trône savait alors (`rejoueLeMois`). Le
    juge de la Cadence lit les réglages : il tourne ici, mois par mois, sur
    les rendez-vous connus ce jour-là. Ne calcule que si l'onglet est ouvert. */
function useRejeu(actif: boolean, rdvs: RdvDesPrevisions[]): MoisRejoue[] | null {
  const appts = useBranchAppointments();
  const clients = useBranchClients();
  const [reglages] = useSettings();
  const today = todayISO();
  return useMemo(() => {
    if (!actif) return null;
    const ouvertLe = (j: string) => !openingForIso(j).closed;
    const filleules = new Set(clients.filter((c) => !!c.parraineePar).map((c) => c.id));
    return moisDuPasse(today).map((mois) => {
      const premier = `${mois}-01`;
      const fin = finDuMois(mois);
      const connus = rdvsConnusLe(appts, premier);
      const parCliente = new Map<string, typeof connus>();
      for (const a of connus) { const l = parCliente.get(a.clientId); if (l) l.push(a); else parCliente.set(a.clientId, [a]); }
      const reprises: { iso: string }[] = [];
      for (const c of clients) {
        const siens = parCliente.get(c.id);
        if (!siens) continue;
        const cad = predictNextVisit(siens, [c], c.id, premier);
        const aUnRdvAVenir = siens.some((a) => a.date >= premier && a.status !== 'annulé' && a.status !== 'honoré');
        const place = placeDeLaCliente({ aUnRdvAVenir, predit: cad.predicted, iso: cad.iso, retardJours: cad.overdueDays, dort: false, fin });
        if (place === 'attendue' && cad.iso) reprises.push({ iso: cad.iso });
      }
      const juste = tauxDeRealisation(connus.filter((a) => a.status === 'honoré' && !(a.seriesIndex && a.seriesIndex > 1)));
      return rejoueLeMois({ mois, rdvs, ouvertLe, reprises, justesse: juste ? juste.dans14 / 100 : null, estFilleule: (id) => filleules.has(id) });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actif, appts, clients, rdvs, today, reglages]);
}

/** LE DESSIN DU PASSÉ : les venues en barres, la prévision du 1er en trait
    cuivre, le plafond d'alors en tireté. */
function GrapheDuPasse({ lignes }: { lignes: MoisRejoue[] }) {
  const W = 1000; const HT = 260; const g = 40; const b = 28; const haut = 22;
  const max = Math.max(1, ...lignes.map((m) => Math.max(m.plafond, m.venus, m.haut)));
  const pas = max > 240 ? 50 : max > 120 ? 40 : max > 60 ? 20 : max > 24 ? 10 : 5;
  const ech = (v: number) => (HT - b - haut) * v / max;
  const large = (W - g) / Math.max(1, lignes.length);
  const l = Math.min(60, large * 0.55);
  const graduations: number[] = [];
  for (let t = 0; t <= max; t += pas) graduations.push(t);
  return (
    <svg className="trp-prev__graphe" viewBox={`0 0 ${W} ${HT}`} role="img" aria-label="Rendez-vous venus chaque mois, la prévision du 1er et le plafond">
      {graduations.map((t) => {
        const y = HT - b - ech(t);
        return (
          <g key={t}>
            <line x1={g} x2={W} y1={y} y2={y} className="trp-prev__grille" />
            <text x={g - 8} y={y + 4} textAnchor="end">{t}</text>
          </g>
        );
      })}
      {lignes.map((m, i) => {
        const x = g + large * i + (large - l) / 2; const y0 = HT - b;
        const hv = ech(m.venus);
        const yp = y0 - ech(m.prevu);
        const yf = y0 - ech(m.plafond);
        return (
          <g key={m.mois}>
            <title>{`${m.nom} : ${m.venus} venus, ${entier(m.prevu)} prévus au 1er (${entier(m.bas)} à ${entier(m.haut)}), plafond ${m.plafond}`}</title>
            <rect x={x} y={y0 - hv} width={l} height={hv} rx={Math.min(4, hv / 2)} className="trp-prev__poses" />
            {m.plafond > 0 && <line x1={x - 8} x2={x + l + 8} y1={yf} y2={yf} className="trp-prev__plafond" />}
            <line x1={x - 8} x2={x + l + 8} y1={yp} y2={yp} className={m.juge ? 'trp-prev__prevu' : 'trp-prev__prevu trp-prev__prevu--sans'} />
            <text className="trp-prev__val" x={x + l / 2} y={Math.min(y0 - hv, yp) - 8} textAnchor="middle">{m.venus}</text>
            <text x={x + l / 2} y={HT - 8} textAnchor="middle">{m.nomCourt}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** LE PASSÉ, le dessin et le tableau (les trois chiffres sont en tuiles,
    au-dessus). L'explication longue est repliée sous le tableau. */
function LePasse({ lignes }: { lignes: MoisRejoue[] }) {
  const r = resumeDuRejeu(lignes);
  const premier = lignes[0]; const dernier = lignes[lignes.length - 1];
  return (
    <>
      <section className="trp-prev__carte" aria-label="Les douze derniers mois">
        <div className="trp-prev__carte-tete">
          <h3>{premier && dernier ? `De ${premier.nom.toLowerCase()} à ${dernier.nom.toLowerCase()}` : 'Les douze derniers mois'}</h3>
        </div>
        <div className="trp-prev__legende">
          <span><i className="trp-prev__poses" />Venus</span>
          <span><i className="trp-prev__trait-cuivre" />Prévu au 1er</span>
          <span><i className="trp-prev__trait-cuivre trp-prev__trait-cuivre--sans" />Attendu sans les posés</span>
          <span><i className="trp-prev__trait" />Plafond atteignable</span>
        </div>
        <GrapheDuPasse lignes={lignes} />
      </section>

      <section className="trp-prev__carte trp-prev__passe">
        <div className="trp-prev__carte-tete">
          <h3>Prévu au 1er, puis venu</h3>
          <p>Ce que cet écran aurait annoncé le 1er, à côté de ce qui est venu.</p>
        </div>
        <div className="mnd-scroll-x">
          <table className="trp-prev__table">
            <thead>
              <tr><th>Mois</th><th className="d">Prévu au 1er</th><th className="d">Venus</th><th className="d">Écart</th><th className="d">Annulés</th><th className="d">Plafond</th><th className="d">Part du plafond</th></tr>
            </thead>
            <tbody>
              {lignes.map((m) => (
                <tr key={m.mois}>
                  <td>{m.nom}{m.posesConnus > 0 && <small>{m.posesConnus} posé{m.posesConnus > 1 ? 's' : ''} connu{m.posesConnus > 1 ? 's' : ''} le 1er</small>}</td>
                  <td className="d">{entier(m.prevu)}<small>{m.juge ? `${entier(m.bas)} à ${entier(m.haut)}` : 'sans les posés'}</small></td>
                  <td className="d">{m.venus}</td>
                  <td className="d">{m.juge
                    ? <>{signe(m.ecart)}<small className={m.dansLaFourchette ? 'trp-prev__mesure' : 'trp-prev__amesurer'}>{m.dansLaFourchette ? 'dans la fourchette' : 'hors fourchette'}</small></>
                    : <>·<small className="trp-prev__inclus">non jugé</small></>}</td>
                  <td className="d">{m.annules}</td>
                  <td className="d">{m.plafond}</td>
                  <td className="d">{m.plafond > 0 ? pct(m.venus / m.plafond) : '·'}</td>
                </tr>
              ))}
              <tr className="total">
                <td>Douze mois<small>{r.moisJuges
                  ? `${r.moisJuges} mois jugé${r.moisJuges > 1 ? 's' : ''} : écart moyen ${un(r.ecartMoyen)} RDV${r.ecartPart !== null ? `, soit ${pct(r.ecartPart)} des venues` : ''}`
                  : `aucun mois jugé encore : le premier se lit le ${leJourDit(premierMoisJugeLisibleLe())}`}</small></td>
                <td className="d">{r.moisJuges ? entier(r.prevu) : '·'}</td>
                <td className="d">{r.venus}</td>
                <td className="d">{r.moisJuges ? signe(r.ecartTotal) : '·'}</td>
                <td className="d">{r.annules}</td>
                <td className="d">{r.plafond}</td>
                <td className="d">{r.part !== null ? pct(r.part) : '·'}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <details className="trp-prev__note">
          <summary>Comment le passé est rejoué</summary>
          <p>
            Le 1er de chaque mois, le calcul de cet écran est refait avec ce que le Trône savait ce jour-là : l’histoire d’avant le 1er, les rendez-vous
            déjà pris, le plafond, la justesse de la Cadence et le rythme des nouvelles d’alors. Le marketing n’est pas rejoué. Venus : honorés,
            encaissés ou facturés, la règle du Carnet. Un écart positif : il est venu plus de monde que prévu. Jusqu’au 5 septembre 2026, un rendez-vous
            ne notait pas quand il avait été pris : pour les mois d’avant, le Trône ne sait pas ce qui était déjà posé le 1er. Il montre ce que la
            Cadence attendait sans ces posés, et ne juge pas ces mois.
          </p>
        </details>
      </section>
    </>
  );
}

/** LE DESSIN : une barre par colonne, posés (indigo), attendus (indigo
    clair), marketing (hachuré cuivre), le plafond en tireté cuivre et la
    valeur au-dessus de chaque colonne. SVG fait main ; les barres sont
    arrondies en haut par une découpe (un arrondi par segment dentelait la
    pile). */
function Graphe({ colonnes }: { colonnes: ColonneDesPrevisions[] }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const W = 640; const HT = 240; const g = 30; const d = 30; const b = 26; const haut = 26;
  const max = Math.max(1, ...colonnes.map((c) => Math.max(c.plafond, c.poses + c.attendus + c.marketing)));
  const pas = max > 120 ? 40 : max > 60 ? 20 : max > 24 ? 10 : 5;
  const ech = (v: number) => (HT - b - haut) * v / max;
  const n = Math.max(1, colonnes.length);
  const large = (W - g - d) / n;
  const l = Math.min(72, large * 0.56);
  const graduations: number[] = [];
  for (let t = 0; t <= max; t += pas) graduations.push(t);
  return (
    <svg className="trp-prev__graphe" viewBox={`0 0 ${W} ${HT}`} role="img" aria-label="Rendez-vous attendus par colonne, sous le plafond atteignable">
      <defs>
        <pattern id={`${uid}-mk`} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="8" height="8" className="trp-prev__hachure-fond" />
          <rect width="4" height="8" className="trp-prev__hachure-trait" />
        </pattern>
      </defs>
      {graduations.map((t) => {
        const y = HT - b - ech(t);
        return (
          <g key={t}>
            <line x1={g} x2={W - d} y1={y} y2={y} className="trp-prev__grille" />
            <text x={g - 8} y={y + 4} textAnchor="end">{t}</text>
          </g>
        );
      })}
      {colonnes.map((c, i) => {
        const x = g + large * i + (large - l) / 2; const y0 = HT - b;
        const hp = ech(c.poses); const ha = ech(c.attendus); const hm = ech(c.marketing);
        const hTout = hp + ha + hm;
        const yp = y0 - ech(c.plafond);
        const sans = Math.round(c.poses + c.attendus);
        const mk = Math.round(c.marketing);
        const r = Math.min(6, l / 2, hTout / 2);
        return (
          <g key={c.cle}>
            <title>{`${c.nom} : ${un(c.poses)} posés attendus, ${un(c.attendus)} reprises et nouvelles, ${un(c.marketing)} par le marketing ; plafond ${c.plafond}`}</title>
            <clipPath id={`${uid}-c${i}`}><rect x={x} y={y0 - hTout} width={l} height={hTout + r} rx={r} /></clipPath>
            <g clipPath={`url(#${uid}-c${i})`}>
              <rect x={x} y={y0 - hp} width={l} height={hp} className="trp-prev__poses" />
              <rect x={x} y={y0 - hp - ha} width={l} height={ha} className="trp-prev__attendus" />
              <rect x={x} y={y0 - hTout} width={l} height={hm} fill={`url(#${uid}-mk)`} />
            </g>
            {c.plafond > 0 && <line x1={x - 12} x2={x + l + 12} y1={yp} y2={yp} className="trp-prev__plafond" />}
            <text className="trp-prev__val" x={x + l / 2} y={Math.min(y0 - hTout, c.plafond > 0 ? yp : y0) - 8} textAnchor="middle">
              {sans}{mk > 0 && <tspan className="trp-prev__val-mk">{` +${mk}`}</tspan>}
            </text>
            {c.plafond > 0 && <text className="trp-prev__val-plafond" x={x + l + 14} y={yp + 4}>{c.plafond}</text>}
            <text x={x + l / 2} y={HT - 8} textAnchor="middle">{c.nom}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** UNE LIGNE DU DÉTAIL REPLIÉ : titre, une ligne grise, le chiffre à droite,
    le chevron ; ouverte, ses tableaux. L'état vit chez l'écran : une seule
    clé ouverte, donc un seul panneau (`basculeLePanneau`). */
function LigneDuDetail({ cle, ouvert, onBascule, titre, sous, chiffre, children }: {
  cle: PanneauDuDetail; ouvert: PanneauDuDetail | null; onBascule: (cle: PanneauDuDetail) => void;
  titre: string; sous: string; chiffre: string; children: ReactNode;
}) {
  const idPanneau = useId();
  const est = ouvert === cle;
  return (
    <div className={`trp-prev__ligne${est ? ' est-ouverte' : ''}`}>
      <button type="button" className="trp-prev__ligne-tete" aria-expanded={est} aria-controls={idPanneau} onClick={() => onBascule(cle)}>
        <span className="trp-prev__ligne-t">{titre}<small>{sous}</small></span>
        <span className="trp-prev__ligne-n">{chiffre}</span>
        <span className="trp-prev__chevron" aria-hidden="true">›</span>
      </button>
      {est && <div className="trp-prev__ligne-corps" id={idPanneau}>{children}</div>}
    </div>
  );
}

/** Sous le nom d'un levier : sa base et son taux mesuré, ou pourquoi il n'en a pas. */
const baseDuLevier = (l: Levier): string => (l.etat === 'mesure' && l.nombre !== null && l.taux !== null
  ? `${l.nombre} cliente${s(l.nombre)} × ${pct(l.taux)} mesuré`
  : l.etat === 'a-mesurer' && l.nombre !== null ? `${l.nombre} cliente${s(l.nombre)} · ${l.mesure}` : l.mesure);

/* ══ LE MOIS EN FRANCS, 5 novembre 2026 ══════════════════════════════════
   La prévision du mois et « Demander aux chiffres » quittent le tableau de
   bord (maquette « Tableau de bord » en quatre bandes, validée) : il n'en
   garde que la fourchette, qui mène ici (`/previsions?vue=francs`). Le
   calcul ne tourne que sur cet onglet. */
function LeMoisEnFrancs() {
  const { currency } = useBranch();
  const appts = useBranchAppointments();
  const byId = useServicesById();
  const today = todayISO();
  /* La prévision du mois, calculée une fois pour le bloc et pour l'assistant. */
  const prevDuMois = usePrevisionDuMois();
  /* LA JOURNÉE, DITE À L'ASSISTANT : des sommes, jamais une cliente. */
  const jourDuChiffre = chiffreAttenduDuJour(appts.filter((a) => a.date === today && a.status !== 'annulé').map((a) => ({
    date: a.date, status: a.status, rituelXof: apptNetXof(a, byId), resteRituelXof: apptDueXof(a, byId), gamme: a.gamme,
  })), today);
  const jourPourLAssistant = `${jourDuChiffre.nombre} rendez-vous, ${fmtMoney(jourDuChiffre.attenduXof, currency)} attendus, dont ${fmtMoney(jourDuChiffre.encaisseXof, currency)} déjà encaissés ; reste ${fmtMoney(jourDuChiffre.resteXof, currency)}.`;
  return (
    <>
      <PrevisionDuMois donnees={prevDuMois} />
      <DemanderALaMaison prevision={prevDuMois} jour={jourPourLAssistant} />
    </>
  );
}

export default function Previsions() {
  const navigate = useNavigate();
  const today = todayISO();
  const [params] = useSearchParams();
  /* L'HORIZON ET LA VUE, DEUX ÉTATS (11 novembre 2026) : l'horizon ne règle
     que la vue « À venir » ; ailleurs, son segment s'éteint. */
  const [horizon, setHorizon] = useState<HorizonDesPrevisions>('4s');
  const [vue, setVue] = useState<VueDesPrevisions>(() => vueDeLAdresse(params.get('vue')));
  const [ouvert, setOuvert] = useState<PanneauDuDetail | null>(PANNEAU_OUVERT_AU_DEPART);
  const bascule = (cle: PanneauDuDetail) => setOuvert((o) => basculeLePanneau(o, cle));
  const rdvs = useLesRdvs();
  const { p, titre, debut, fin, quatorze } = usePrevisions(horizon, rdvs);
  const passe = useRejeu(vue === 'passe', rdvs);
  const resume = passe ? resumeDuRejeu(passe) : null;
  const joursCreux = quatorze.filter((j) => j.creux).length;
  const totalQuatorze = quatorze.reduce((t, j) => ({ poses: t.poses + j.poses, ordinaire: t.ordinaire + j.ordinaire, manque: t.manque + j.manque }), { poses: 0, ordinaire: 0, manque: 0 });

  /* LES QUATRE CHIFFRES ET LA JAUGE lisent le même calcul. Les attendus sont
     dits par différence, pour que posés + attendus fassent les prévus. */
  const taux = remplissage(p.prevision, p.marketing, p.plafond.total);
  const attendus = p.reprises.rdv + p.nouvelles.rdv;
  const jauge = partsDeLaJauge({ poses: p.poses.rdv, attendus, marketing: p.marketing, plafond: p.plafond.total });
  const posesDits = Math.round(p.poses.rdv);
  const attendusDits = Math.max(0, Math.round(p.prevision) - posesDits);
  const leviers = leviersParGain(p.leviers);

  return (
    <div className="trp-prev">
      <PageHead
        eyebrow={vue === 'passe' ? 'Direction · ce qui est venu' : 'Direction · ce qui vient'}
        title="Les prévisions."
        actions={(
          <div className={`trp-prev__seg${vue !== 'avenir' ? ' est-eteint' : ''}`} role="group" aria-label="L'horizon">
            {HORIZONS_DES_PREVISIONS.map((h) => (
              <button key={h} type="button" aria-pressed={h === horizon} className={h === horizon ? 'est-choisi' : ''}
                disabled={vue !== 'avenir'} onClick={() => setHorizon(h)}>
                {nomDeLHorizon(h, today)}
              </button>
            ))}
          </div>
        )}
      />

      <div className="trp-prev__vues" role="tablist" aria-label="La vue">
        {VUES_DES_PREVISIONS.map((v) => (
          <button key={v.cle} type="button" role="tab" aria-selected={vue === v.cle} className={vue === v.cle ? 'est-choisi' : ''} onClick={() => setVue(v.cle)}>
            {v.nom}
          </button>
        ))}
      </div>

      {vue === 'francs' ? <LeMoisEnFrancs /> : vue === 'passe' ? (<>
        <div className="trp-prev__tuiles trp-prev__tuiles--trois">
          {resume ? (<>
            <div className="trp-prev__tuile"><small>RDV venus</small><b>{resume.venus}</b><span>en {resume.mois} mois</span></div>
            <div className="trp-prev__tuile"><small>Part du plafond</small><b>{resume.part !== null ? pct(resume.part) : '·'}</b><span>du plafond atteignable</span></div>
            {resume.moisJuges > 0 ? (
              <div className="trp-prev__tuile trp-prev__tuile--cuivre"><small>Dans la fourchette</small><b>{resume.dansLaFourchette} / {resume.moisJuges}</b><span>mois jugés, écart moyen ±{un(resume.ecartMoyen)} RDV</span></div>
            ) : (
              <div className="trp-prev__tuile trp-prev__tuile--cuivre"><small>Premier mois jugé</small><b>{leJourDit(premierMoisJugeLisibleLe()).replace(/ \d{4}$/, '')}</b><span>lisible ce jour-là</span></div>
            )}
          </>) : null}
        </div>
        {passe && <LePasse lignes={passe} />}
      </>) : (<>

      <div className="trp-prev__tuiles">
        <div className="trp-prev__tuile"><small>RDV prévus</small><b>{entier(p.prevision)}</b><span>fourchette {entier(p.bas)} à {entier(p.haut)}</span></div>
        <div className="trp-prev__tuile"><small>Plafond atteignable</small><b>{entier(p.plafond.total)}</b><span>fait au moins un jour sur dix</span></div>
        <div className="trp-prev__tuile trp-prev__tuile--cuivre"><small>À gagner</small><b>+{entier(p.marketing)}</b><span>par le marketing mesuré</span></div>
        <div className="trp-prev__tuile"><small>Remplissage</small><b>{taux.sans !== null ? pct(taux.sans) : '·'}</b>
          <span>{taux.avec !== null ? `${pct(taux.avec)} avec le marketing` : 'pas encore de plafond'}</span></div>
      </div>

      <div className="trp-prev__jauge">
        <div className="trp-prev__jauge-l">
          <span><b>{posesDits}</b> posés · <b>{attendusDits}</b> attendus · <b>+{entier(p.marketing)}</b> marketing</span>
          <span>sur un plafond de <b>{entier(p.plafond.total)}</b> · <b>{entier(p.placesLibres)}</b> places libres</span>
        </div>
        <div className="trp-prev__barre" role="img"
          aria-label={`${posesDits} posés, ${attendusDits} attendus et ${entier(p.marketing)} par le marketing, sur un plafond de ${entier(p.plafond.total)}`}>
          <i className="trp-prev__barre-poses" style={{ width: `${jauge.poses * 100}%` }} />
          <i className="trp-prev__barre-attendus" style={{ width: `${jauge.attendus * 100}%` }} />
          <i className="trp-prev__barre-mk" style={{ width: `${jauge.marketing * 100}%` }} />
        </div>
      </div>

      <div className="trp-prev__cartes">
        <section className="trp-prev__carte" aria-label={titre}>
          <div className="trp-prev__carte-tete">
            <h3>{titre}</h3>
            <p>Du {leJourDit(debut)} au {leJourDit(fin)}</p>
          </div>
          <div className="trp-prev__legende">
            <span><i className="trp-prev__poses" />Posés</span>
            <span><i className="trp-prev__attendus" />Attendus</span>
            <span><i className="trp-prev__mk" />Marketing</span>
            <span><i className="trp-prev__trait" />Plafond</span>
          </div>
          <Graphe colonnes={p.colonnes} />
        </section>

        <section className="trp-prev__carte" aria-label="Ce qui remplit">
          <div className="trp-prev__carte-tete">
            <h3>Ce qui remplit</h3>
            <p>Les leviers, du plus rentable au moins rentable.</p>
          </div>
          <ul className="trp-prev__leviers">
            {leviers.map((l) => (
              <li key={l.cle} className={`trp-prev__levier est-${l.etat}`}>
                <div><b>{l.nom}</b><small>{baseDuLevier(l)}</small></div>
                <span className="trp-prev__gain">{l.etat === 'inclus' ? 'inclus' : l.etat === 'mesure' ? `+${entier(l.rdv)}` : 'à mesurer'}</span>
              </li>
            ))}
          </ul>
          <div className="trp-prev__gestes">
            <button type="button" className="trp-prev__btn trp-prev__btn--cuivre" onClick={() => navigate('/marketing?ecrire=dormantes')}
              title="Ouvre une campagne adressée aux Dormantes : elle se dépose retenue, le feu vert reste le vôtre">
              Préparer la campagne des dormantes
            </button>
            <button type="button" className="trp-prev__btn" onClick={() => navigate('/cadence')}>Voir les reprises en retard</button>
          </div>
        </section>
      </div>

      {/* LES 14 PROCHAINS JOURS, en bande (11 novembre 2026) : une case par
          jour, posés en gras, l'ordinaire ou le manque dessous. Une case
          ouverte mène au calendrier de ce jour ; aucun geste de relance ici,
          les reprises ont leur rubrique. */}
      <section className="trp-prev__carte" aria-label="Les 14 prochains jours">
        <div className="trp-prev__carte-tete trp-prev__carte-tete--geste">
          <div>
            <h3>Les 14 prochains jours</h3>
            <p>Posés sur l’ordinaire du même jour. En cuivre, un jour creux.</p>
          </div>
          <button type="button" className="trp-prev__btn" onClick={() => navigate('/calendrier')}>Le calendrier</button>
        </div>
        <div className="trp-prev__jours">
          {quatorze.map((j) => {
            const ton = tonDuJour(j);
            const court = `${j.nom.slice(0, 3)} ${Number(j.iso.slice(8, 10))}`;
            const dit = `${j.nom} ${leJourDit(j.iso)} : ${j.ferme ? 'fermé' : `${j.poses} posé${s(j.poses)} sur ${j.ordinaire} d’ordinaire${j.creux ? `, jour creux, il en manque ${j.manque}` : ''}`}`;
            const dedans = (<>
              <small>{court}</small>
              <b>{j.ferme ? '·' : j.poses}</b>
              <em>{sousTexteDuJour(j)}</em>
            </>);
            return ton === 'ferme'
              ? <div key={j.iso} className="trp-prev__j est-ferme" title={dit} aria-label={dit}>{dedans}</div>
              : <button key={j.iso} type="button" className={`trp-prev__j est-${ton}`} title={dit} aria-label={dit}
                  onClick={() => navigate(`/calendrier?jour=${j.iso}`)}>{dedans}</button>;
          })}
        </div>
        <p className="trp-prev__total">
          <b>{joursCreux}</b> jour{s(joursCreux)} creux · <b>{totalQuatorze.poses}</b> posés sur <b>{totalQuatorze.ordinaire}</b> d’ordinaire
          {totalQuatorze.manque > 0 && <> · il en manque <b>{totalQuatorze.manque}</b> les jours creux</>}
        </p>
      </section>

      <section className="trp-prev__detail" aria-label="Le détail du calcul">
        <LigneDuDetail cle="prevision" ouvert={ouvert} onBascule={bascule} chiffre={entier(p.prevision)}
          titre={`D’où viennent les ${entier(p.prevision)} prévus`} sous="posés, reprises attendues, nouvelles clientes">
          <div className="mnd-scroll-x">
            <table className="trp-prev__table">
              <thead><tr><th>Ligne</th><th className="d">Calcul</th><th className="d">RDV</th></tr></thead>
              <tbody>
                <tr>
                  <td>Déjà posés<small>non annulés{p.poses.honores ? `, dont ${p.poses.honores} déjà honoré${p.poses.honores > 1 ? 's' : ''}` : ''}</small></td>
                  <td className="d">{p.poses.nombre - p.poses.honores} × {pct(p.poses.taux)}{p.poses.honores ? ` + ${p.poses.honores}` : ''}
                    <small>{p.poses.parDefaut ? 'peu d’histoire : 90 % par défaut' : 'venues sur RDV passés, 12 mois'}</small></td>
                  <td className="d">{un(p.poses.rdv)}</td>
                </tr>
                <tr>
                  <td>Reprises attendues<small>à l’heure, sans rendez-vous, selon la Cadence</small></td>
                  <td className="d">{p.reprises.nombre} × {pct(p.reprises.taux)}<small>{p.reprises.parDefaut ? 'justesse non mesurable : 40 %' : 'justesse mesurée du juge'}</small></td>
                  <td className="d">{un(p.reprises.rdv)}</td>
                </tr>
                <tr>
                  <td>Nouvelles clientes<small>{p.nouvelles.douzeMois} en 12 mois{p.nouvelles.dejaPosees ? `, moins ${p.nouvelles.dejaPosees} déjà posée${p.nouvelles.dejaPosees > 1 ? 's' : ''}` : ''}</small></td>
                  <td className="d">{un(p.nouvelles.parMois)} / mois × {un(p.nouvelles.mois)}</td>
                  <td className="d">{un(p.nouvelles.rdv)}</td>
                </tr>
                <tr className="total">
                  <td>Prévision<small>bas {entier(p.bas)} · haut {entier(p.haut)}</small></td>
                  <td />
                  <td className="d">{entier(p.prevision)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="trp-prev__source">Posés : le Carnet, rendez-vous non annulés. Reprises : le juge de la Cadence, une cliente comptée une seule fois (à l’heure, en retard ou endormie).</p>
        </LigneDuDetail>

        <LigneDuDetail cle="plafond" ouvert={ouvert} onBascule={bascule} chiffre={entier(p.plafond.total)}
          titre={`Le plafond de ${entier(p.plafond.total)}`} sous="jour par jour, ce que la Maison a déjà fait">
          <div className="mnd-scroll-x">
            <table className="trp-prev__table">
              <thead><tr><th>Jour</th><th className="d">Jours × plafond</th><th className="d">RDV</th></tr></thead>
              <tbody>
                {p.plafond.jours.length === 0 && <tr><td colSpan={3} className="mnd-muted">Aucun jour ouvert dans l’horizon.</td></tr>}
                {p.plafond.jours.map((j) => (
                  <tr key={j.jour}><td className="trp-prev__jour">{j.nom}</td><td className="d">{j.jours} × {j.plafond}</td><td className="d">{j.rdv}</td></tr>
                ))}
                {p.plafond.physique !== null && (
                  <tr className="trp-prev__memoire">
                    <td>Ce que les fauteuils permettraient<small>fauteuils × heures d’ouverture ÷ durée moyenne : pour mémoire, jamais vécu</small></td>
                    <td />
                    <td className="d">{entier(p.plafond.physique)}</td>
                  </tr>
                )}
                <tr className="total">
                  <td>Plafond atteignable<small>places libres : {entier(p.placesLibres)}</small></td>
                  <td />
                  <td className="d">{entier(p.plafond.total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="trp-prev__source">Ce que la Maison a fait au moins un jour sur dix, jour de la semaine par jour de la semaine, depuis janvier 2025.</p>
        </LigneDuDetail>

        <LigneDuDetail cle="marketing" ouvert={ouvert} onBascule={bascule} chiffre={`+${entier(p.marketing)}`}
          titre={`Les +${entier(p.marketing)} du marketing`} sous="taux mesurés sur 12 mois, bornés aux places libres">
          <div className="mnd-scroll-x">
            <table className="trp-prev__table">
              <thead><tr><th>Levier</th><th className="d">Base × taux</th><th className="d">RDV</th></tr></thead>
              <tbody>
                {p.leviers.map((l) => (
                  <tr key={l.cle}>
                    <td>{l.nom}<small>{l.nombre !== null ? `${l.nombre} cliente${l.nombre > 1 ? 's' : ''} ${l.base}` : l.base}</small></td>
                    <td className="d">
                      {l.etat === 'mesure' && l.taux !== null && l.nombre !== null && <>{l.nombre} × {pct(l.taux)}</>}
                      <small className={l.etat === 'mesure' ? 'trp-prev__mesure' : l.etat === 'inclus' ? 'trp-prev__inclus' : 'trp-prev__amesurer'}>{l.mesure}</small>
                    </td>
                    <td className="d">{l.etat === 'inclus' ? 'inclus' : un(l.rdv)}</td>
                  </tr>
                ))}
                <tr className="total">
                  <td>À gagner<small>borné aux places libres ({entier(p.placesLibres)}){p.marketingBrut > p.marketing ? `, sur ${un(p.marketingBrut)} possibles` : ''}</small></td>
                  <td />
                  <td className="d">+{entier(p.marketing)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="trp-prev__source">Une tête jointe qui prend rendez-vous dans les 14 jours : les envois « reprise proposée » et les campagnes « Dormantes ».</p>
        </LigneDuDetail>
      </section>

      <p className="trp-prev__pied">Ici on compte des rendez-vous ; le chiffre en francs se lit dans « En francs ».</p>
      </>)}
    </div>
  );
}
