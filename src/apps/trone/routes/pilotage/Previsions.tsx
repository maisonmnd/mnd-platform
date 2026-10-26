import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBranch } from '../../../../shared/branches';
import { useSettings, openingForIso } from '../../../../shared/settings';
import { predictNextVisit, tauxDeRealisation } from '../../../../shared/cadence';
import { dortDepuisLongtemps, estDePassage, estDiaspora, aDefaitSesLocks, MOIS_AVANT_SORTIE } from '../../../../shared/clients';
import { apptPaidXof } from '../../../../shared/agenda';
import { useInvoices } from '../../../../shared/finance';
import { ajouteJours, rdvParJour, reperesParJour } from '../../../../shared/objectifs-des-fauteuils-pur';
import {
  bornesDeLHorizon, calculeLesPrevisions, finDuMois, mesureDesEnvois, moisDuPasse, nomDeLHorizon, nouvellesClientes, placeDeLaCliente,
  premierMoisJugeLisibleLe, rdvsConnusLe, rejoueLeMois, resumeDuRejeu,
  HORIZONS_DES_PREVISIONS, type ColonneDesPrevisions, type HorizonDesPrevisions, type MoisRejoue, type Previsions as LesPrevisions, type RdvDesPrevisions,
} from '../../../../shared/previsions-pur';
import { useCampaigns, useEnvois } from '../equipe/data';
import { apptDurationMin, todayISO, useBranchAppointments, useBranchClients, useServicesById } from '../clients/_shared';
import { PageHead } from '../_ui';
import './previsions.css';

/* ══ LES PRÉVISIONS — 26 octobre 2026 ═══════════════════════════════════
   « Il faut construire un meilleur système pour les prévisions à venir, et
   savoir le nombre de fauteuils qu'on pourrait remplir, de façon
   atteignable, si on met en place un système marketing » (Yéman).
   Maquette 1opRHqoVJHVA3oHxVw5kcM, choix du sélecteur : plafond = fait au
   moins un jour sur dix, quatre semaines d'abord, taux du marketing mesurés
   seulement, la rubrique en Direction sous le Centre de commande.

   LE MOTIF VEDETTE : les semaines (ou les mois) en barres, posés, attendus
   et marketing empilés sous le trait du plafond. Dessous, trois tableaux qui
   recomposent chaque chiffre de l'en-tête. Toutes les règles vivent dans
   `shared/previsions-pur.ts` ; cet écran ne fait que lire et dessiner.

   « ET LES MOIS PASSÉS ? » (le même jour, choix du sélecteur : le réalisé et
   la prévision rejouée) : un quatrième bouton, « 12 derniers mois ». Chaque
   mois entier, ce que la prévision aurait dit au 1er avec ce que le Trône
   savait alors, à côté de ce qui est venu, sous le plafond d'alors. */

const un = (x: number) => x.toLocaleString('fr-FR', { maximumFractionDigits: 1, minimumFractionDigits: 0 });
const entier = (x: number) => Math.round(x).toLocaleString('fr-FR');
const pct = (x: number) => `${Math.round(x * 100)} %`;
const signe = (x: number) => { const r = Math.round(x); return r > 0 ? `+${r}` : r < 0 ? `\u2212${-r}` : '0'; };
const MOIS_DITS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const leJourDit = (j: string) => `${Number(j.slice(8, 10)) === 1 ? '1er' : Number(j.slice(8, 10))} ${MOIS_DITS[Number(j.slice(5, 7)) - 1]} ${j.slice(0, 4)}`;

/** LES RENDEZ-VOUS DE LA BRANCHE, avec ce qui fait une venue : l'argent reçu
    et la facture (la règle du Carnet, `estUneVenue`). */
function useLesRdvs(): RdvDesPrevisions[] {
  const appts = useBranchAppointments();
  const [pieces] = useInvoices();
  return useMemo(() => {
    const factures = new Set(pieces.filter((p) => p.apptId && p.kind === 'facture').map((p) => p.apptId as string));
    return appts.map((a) => ({
      clientId: a.clientId, date: a.date, status: a.status, creeLe: a.creeLe,
      encaisse: apptPaidXof(a) > 0, facture: !!a.invoiceId || factures.has(a.id),
    }));
  }, [appts, pieces]);
}

function usePrevisions(horizon: HorizonDesPrevisions, rdvs: RdvDesPrevisions[]): { p: LesPrevisions; titre: string } {
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
    return { p, titre: bornes.titre };
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
            <rect x={x} y={y0 - hv} width={l} height={hv} className="trp-prev__poses" />
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

/** LE PASSÉ, l'en-tête, le dessin et le tableau. */
function LePasse({ lignes }: { lignes: MoisRejoue[] }) {
  const r = resumeDuRejeu(lignes);
  const premier = lignes[0]; const dernier = lignes[lignes.length - 1];
  return (
    <>
      <section className="trp-prev__vedette" aria-label="Les douze derniers mois">
        <div className="trp-prev__vedette-haut">
          <h3>{premier && dernier ? `De ${premier.nom.toLowerCase()} à ${dernier.nom.toLowerCase()}` : 'Les douze derniers mois'}</h3>
          <div className="trp-prev__legende">
            <span><i className="trp-prev__poses" />Venus</span>
            <span><i className="trp-prev__trait-cuivre" />Prévu au 1er</span>
            <span><i className="trp-prev__trait-cuivre trp-prev__trait-cuivre--sans" />Attendu sans les posés</span>
            <span><i className="trp-prev__trait" />Plafond atteignable</span>
          </div>
        </div>
        <GrapheDuPasse lignes={lignes} />
      </section>

      <section className="trp-prev__calcul trp-prev__passe">
        <h3>Le passé <span>prévu au 1er, puis venu</span></h3>
        <p>Chaque mois, ce que cet écran aurait annoncé le 1er avec ce que le Trône savait ce jour-là, à côté de ce qui est venu.</p>
        <div className="mnd-scroll-x">
          <table>
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
      </section>

      <p className="trp-prev__pied">
        Le 1er de chaque mois, le calcul de cet écran est refait avec ce que le Trône savait ce jour-là : l’histoire d’avant le 1er, les rendez-vous
        déjà pris, le plafond, la justesse de la Cadence et le rythme des nouvelles d’alors. Le marketing n’est pas rejoué. Venus : honorés,
        encaissés ou facturés, la règle du Carnet. Un écart positif : il est venu plus de monde que prévu. Jusqu’au 5 septembre 2026, un rendez-vous
        ne notait pas quand il avait été pris : pour les mois d’avant, le Trône ne sait pas ce qui était déjà posé le 1er. Il montre ce que la
        Cadence attendait sans ces posés, et ne juge pas ces mois.
      </p>
    </>
  );
}

/** LE DESSIN : une barre par colonne, posés (indigo), attendus (indigo
    pâle), marketing (cuivre), le plafond en trait tireté. SVG fait main. */
function Graphe({ colonnes }: { colonnes: ColonneDesPrevisions[] }) {
  const W = 1000; const HT = 260; const g = 40; const b = 28; const haut = 22;
  const max = Math.max(1, ...colonnes.map((c) => Math.max(c.plafond, c.poses + c.attendus + c.marketing)));
  const pas = max > 120 ? 40 : max > 60 ? 20 : max > 24 ? 10 : 5;
  const ech = (v: number) => (HT - b - haut) * v / max;
  const n = Math.max(1, colonnes.length);
  const large = (W - g) / n;
  const l = Math.min(110, large * 0.5);
  const graduations: number[] = [];
  for (let t = 0; t <= max; t += pas) graduations.push(t);
  return (
    <svg className="trp-prev__graphe" viewBox={`0 0 ${W} ${HT}`} role="img" aria-label="Rendez-vous attendus par colonne, sous le plafond atteignable">
      {graduations.map((t) => {
        const y = HT - b - ech(t);
        return (
          <g key={t}>
            <line x1={g} x2={W} y1={y} y2={y} className="trp-prev__grille" />
            <text x={g - 8} y={y + 4} textAnchor="end">{t}</text>
          </g>
        );
      })}
      {colonnes.map((c, i) => {
        const x = g + large * i + (large - l) / 2; const y0 = HT - b;
        const hp = ech(c.poses); const ha = ech(c.attendus); const hm = ech(c.marketing);
        const yp = y0 - ech(c.plafond);
        const sans = Math.round(c.poses + c.attendus);
        return (
          <g key={c.cle}>
            <title>{`${c.nom} : ${un(c.poses)} posés attendus, ${un(c.attendus)} reprises et nouvelles, ${un(c.marketing)} par le marketing ; plafond ${c.plafond}`}</title>
            <rect x={x} y={y0 - hp} width={l} height={hp} className="trp-prev__poses" />
            <rect x={x} y={y0 - hp - ha} width={l} height={ha} className="trp-prev__attendus" />
            <rect x={x} y={y0 - hp - ha - hm} width={l} height={hm} className="trp-prev__mk" />
            {c.plafond > 0 && <line x1={x - 14} x2={x + l + 14} y1={yp} y2={yp} className="trp-prev__plafond" />}
            <text className="trp-prev__val" x={x + l / 2} y={y0 - hp - ha - hm - 8} textAnchor="middle">
              {c.marketing >= 0.5 ? `${sans} + ${Math.round(c.marketing)}` : `${sans}`}
            </text>
            {c.plafond > 0 && <text x={x + l + 18} y={yp + 4}>{c.plafond}</text>}
            <text x={x + l / 2} y={HT - 8} textAnchor="middle">{c.nom}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default function Previsions() {
  const navigate = useNavigate();
  const today = todayISO();
  const [vue, setVue] = useState<HorizonDesPrevisions | 'passe'>('4s');
  const rdvs = useLesRdvs();
  const { p, titre } = usePrevisions(vue === 'passe' ? '4s' : vue, rdvs);
  const passe = useRejeu(vue === 'passe', rdvs);
  const resume = passe ? resumeDuRejeu(passe) : null;

  return (
    <div className="trp-prev">
      <PageHead
        eyebrow={vue === 'passe' ? 'Direction · ce qui est venu' : 'Direction · ce qui vient'}
        title="Les prévisions."
        actions={resume ? (
          <div className="trp-prev__chiffres">
            <span className="trp-prev__chiffre"><b>{resume.venus}</b><small>RDV venus en {resume.mois} mois</small></span>
            <span className="trp-prev__chiffre"><b>{resume.part !== null ? pct(resume.part) : '·'}</b><small>du plafond atteignable</small></span>
            {resume.moisJuges > 0 ? (
              <span className="trp-prev__chiffre trp-prev__chiffre--cuivre"><b>{resume.dansLaFourchette} / {resume.moisJuges}</b><small>mois jugés dans la fourchette (±{un(resume.ecartMoyen)} RDV)</small></span>
            ) : (
              <span className="trp-prev__chiffre trp-prev__chiffre--cuivre"><b>{leJourDit(premierMoisJugeLisibleLe()).replace(/ \d{4}$/, '')}</b><small>premier mois jugé, lisible ce jour-là</small></span>
            )}
          </div>
        ) : (
          <div className="trp-prev__chiffres">
            <span className="trp-prev__chiffre" title={`De ${entier(p.bas)} à ${entier(p.haut)} selon l'honneur et la justesse`}><b>{entier(p.prevision)}</b><small>RDV prévus</small></span>
            <span className="trp-prev__chiffre"><b>{entier(p.plafond.total)}</b><small>plafond atteignable</small></span>
            <span className="trp-prev__chiffre trp-prev__chiffre--cuivre"><b>+{entier(p.marketing)}</b><small>à gagner par le marketing</small></span>
          </div>
        )}
      />

      <div className="trp-prev__horizon" role="tablist" aria-label="L'horizon">
        {HORIZONS_DES_PREVISIONS.map((h) => (
          <button key={h} type="button" role="tab" aria-selected={h === vue} className={h === vue ? 'est-choisi' : ''} onClick={() => setVue(h)}>
            {nomDeLHorizon(h, today)}
          </button>
        ))}
        <button type="button" role="tab" aria-selected={vue === 'passe'} className={vue === 'passe' ? 'est-choisi' : ''} onClick={() => setVue('passe')}>
          12 derniers mois
        </button>
      </div>

      {passe ? <LePasse lignes={passe} /> : (<>

      <section className="trp-prev__vedette" aria-label={titre}>
        <div className="trp-prev__vedette-haut">
          <h3>{titre}</h3>
          <div className="trp-prev__legende">
            <span><i className="trp-prev__poses" />Déjà posés</span>
            <span><i className="trp-prev__attendus" />Attendus</span>
            <span><i className="trp-prev__mk" />Avec le marketing</span>
            <span><i className="trp-prev__trait" />Plafond atteignable</span>
          </div>
        </div>
        <Graphe colonnes={p.colonnes} />
      </section>

      <section className="trp-prev__trois">
        <div className="trp-prev__calcul">
          <h3>La prévision <span>sans rien faire</span></h3>
          <p>Ce qui viendra si la Maison ne lance rien de plus.</p>
          <div className="mnd-scroll-x">
            <table>
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
        </div>

        <div className="trp-prev__calcul">
          <h3>Le plafond <span>atteignable</span></h3>
          <p>Ce que la Maison a déjà fait au moins un jour sur dix, jour de la semaine par jour de la semaine.</p>
          <div className="mnd-scroll-x">
            <table>
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
        </div>

        <div className="trp-prev__calcul">
          <h3>Le marketing <span>ce qu’il peut remplir</span></h3>
          <p>Chaque levier compté au taux MESURÉ sur les envois des douze derniers mois : une tête jointe qui prend rendez-vous dans les 14 jours.</p>
          <div className="mnd-scroll-x">
            <table>
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
          <div className="trp-prev__gestes">
            <button type="button" className="trp-prev__btn trp-prev__btn--cuivre" onClick={() => navigate('/marketing?ecrire=dormantes')}
              title="Ouvre une campagne adressée aux Dormantes : elle se dépose retenue, le feu vert reste le vôtre">
              Préparer la campagne des dormantes
            </button>
            <button type="button" className="trp-prev__btn" onClick={() => navigate('/cadence')}>Voir les reprises en retard</button>
          </div>
        </div>
      </section>

      <p className="trp-prev__pied">
        Posés : le Carnet, rendez-vous non annulés. Reprises : le juge de la Cadence, une cliente comptée une seule fois (à l’heure, en retard ou endormie).
        Plafond : l’historique des jours ouverts depuis janvier 2025. Marketing : les envois « reprise proposée » et les campagnes « Dormantes ». Ici on compte des
        rendez-vous ; le chiffre en francs reste à la prévision du Tableau de bord.
      </p>
      </>)}
    </div>
  );
}
