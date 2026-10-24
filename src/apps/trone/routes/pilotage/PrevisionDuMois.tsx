import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { useInvoices, invoiceReglements } from '../../../../shared/finance';
import { predictNextVisit, tauxDeRealisation } from '../../../../shared/cadence';
import { useApprenants, useSubscribers } from '../equipe/data';
import {
  addDaysISO, apptDueXof, apptNetXof, revenuDuMois, revenusProjetesDuMois, todayISO,
  useBranchAppointments, useBranchClients, useClefDuTarif, useServicesById,
} from '../clients/_shared';
import { ceQuiFaitLaPrevision, prevoisLeMois } from '../../../../shared/prevision-du-mois-pur';
import './prevision.css';

/* ═══════════════════════════════════════════════════════════════════
   LA PRÉVISION DU MOIS, AU TABLEAU DE BORD — 24 octobre 2026, maquette
   VJ5PJEGUPDbYKUgEdMUNbS (vue 1). Le Trône calcule (shared/prevision-du-
   mois-pur.ts), et chaque part se dit en clair à côté du dessin. Ce bloc
   ne lit que ce que la Maison a déjà : les règlements, les rendez-vous, la
   Cadence. Rien n'est envoyé nulle part. */

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
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

export function PrevisionDuMois() {
  const navigate = useNavigate();
  const { branch, currency } = useBranch();
  const [invoices] = useInvoices();
  const appts = useBranchAppointments();
  const clients = useBranchClients();
  const byId = useServicesById();
  const clefDuTarif = useClefDuTarif();
  const [apprenants] = useApprenants();
  const [abonnes] = useSubscribers();
  const today = todayISO();
  const mk = today.slice(0, 7);
  const dernierJour = dernierJourDu(mk);

  const prevision = useMemo(() => {
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
    const rdvs = appts
      .filter((a) => a.branchId === branch.id && a.status !== 'annulé' && a.status !== 'honoré' && a.date >= today && a.date <= dernierJour)
      .map((a) => ({ date: a.date, duXof: apptDueXof(a, byId) }));
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
    for (const c of clients) {
      const siens = parCliente.get(c.id);
      if (!siens) continue;
      const cad = predictNextVisit(siens, [c], c.id, today);
      if (!cad.predicted || !cad.iso || cad.iso > dernierJour) continue;
      reprises.push({ iso: cad.iso, valeurXof: cad.template ? apptNetXof(cad.template, byId) : 0 });
    }
    const venues = appts.filter((a) => a.status === 'honoré' && !(a.seriesIndex && a.seriesIndex > 1));
    const juste = tauxDeRealisation(venues);
    /* ④ Les créances : ce qui est rentré après le même jour, les six derniers
       mois, sur des pièces datées de ce jour ou d'avant. */
    const jour = Number(today.slice(8, 10));
    const factures = invoices.filter((i) => i.branchId === branch.id && i.kind === 'facture');
    const creancesPassees: number[] = [];
    for (let k = 1; k <= 6; k++) {
      const m = moisAvant(mk, k);
      const fin = dernierJourDu(m);
      const cut = `${m}-${String(Math.min(jour, Number(fin.slice(8, 10)))).padStart(2, '0')}`;
      const anciennes = factures.filter((i) => (i.date ?? '').slice(0, 10) <= cut);
      if (!factures.some((i) => (i.date ?? '').slice(0, 7) <= m)) continue; // la Maison n'existait pas encore
      creancesPassees.push(anciennes.reduce((s, i) => s + invoiceReglements(i)
        .filter((p) => (p.date ?? '') > cut && (p.date ?? '') <= fin)
        .reduce((n, p) => n + p.amountXof, 0), 0));
    }
    return prevoisLeMois({
      aujourdhui: today, dernierJour, encaisseParJour, rdvs, honneur, reprises,
      justesse: juste ? juste.dans14 / 100 : null,
      creancesPassees,
      versementsAVenirXof: revenusProjetesDuMois(args, mk, today).versements,
    });
  }, [invoices, appts, clients, byId, apprenants, abonnes, branch.id, today, mk, dernierJour, clefDuTarif]);

  const fmt = (x: number) => fmtMoney(x, currency);
  const lignes = ceQuiFaitLaPrevision(prevision, fmt, `le ${Number(dernierJour.slice(8, 10))}`);
  const nomDuMois = `${MOIS[Number(mk.slice(5, 7)) - 1]} ${mk.slice(0, 4)}`;

  /* LE DESSIN — une barre par jour : l'entré en indigo, l'attendu en indigo
     pâle par-dessus. Une seule échelle, des graduations qui tombent juste. */
  /* Un mois encore vide garde une échelle lisible (10 000 F), pas « 0 · 1 ». */
  const plusHaut = Math.max(10000, ...prevision.jours.map((j) => j.encaisseXof + j.prevuXof));
  const pas = pasLisible(plusHaut);
  const haut = Math.max(pas, Math.ceil(plusHaut / pas) * pas);
  const graduations = Array.from({ length: Math.round(haut / pas) + 1 }, (_, i) => i * pas);
  const L = 720; const H = 200;
  const n = prevision.jours.length;
  const pasX = L / n;
  const largeur = Math.max(2, pasX - 2);
  const y = (x: number) => H - (x / haut) * H;
  const iAujourdhui = prevision.jours.findIndex((j) => j.iso === today);
  const court = (iso: string) => `${Number(iso.slice(8, 10))} ${MOIS_COURTS[Number(iso.slice(5, 7)) - 1]}`;
  const ouAller: Partial<Record<(typeof lignes)[number]['cle'], { dit: string; vers: string }>> = {
    rdv: { dit: 'Le carnet', vers: '/carnet' },
    reprises: { dit: 'La Cadence', vers: '/cadence' },
    creances: { dit: 'Les créances', vers: '/creances' },
  };

  return (
    <section className="trp-prev" aria-label={`La prévision de ${nomDuMois}`}>
      <div className="trp-prev__tete">
        <div className="trp-prev__chiffre">
          <span className="trp-prev__sur">La prévision · {nomDuMois}</span>
          <span className="trp-prev__gros">{fmt(prevision.centraleXof)}</span>
          <span className="trp-prev__dit">Fin du mois, si le rythme tient : entre {fmt(prevision.basXof)} et {fmt(prevision.hautXof)}.</span>
        </div>
        <span className="trp-prev__calcule">Calculé par le Trône sur l’historique de la Maison. Rien n’est inventé : chaque part est détaillée avec le dessin.</span>
      </div>
      <div className="trp-prev__corps">
        <figure className="trp-prev__dessin">
          <div className="trp-prev__legende">
            <span><i className="trp-prev__cle trp-prev__cle--entre" />Entré</span>
            <span><i className="trp-prev__cle trp-prev__cle--attendu" />Attendu (rendez-vous et reprises)</span>
          </div>
          <div className="trp-prev__aire">
            <div className="trp-prev__axe" aria-hidden="true">
              {[...graduations].reverse().map((g) => <span key={g}>{g >= 1000 ? `${Math.round(g / 1000)} k` : g}</span>)}
            </div>
            <svg viewBox={`0 0 ${L} ${H}`} preserveAspectRatio="none" role="img"
              aria-label={`Entré par jour jusqu’au ${court(today)}, puis attendu jusqu’au ${court(dernierJour)}`} className="trp-prev__svg">
              {graduations.map((g) => <rect key={g} x={0} y={Math.min(H - 1, y(g))} width={L} height={1} className="trp-prev__grille" />)}
              {prevision.jours.map((j, i) => {
                const x = i * pasX + 1;
                const hE = (j.encaisseXof / haut) * H;
                const hP = (j.prevuXof / haut) * H;
                const bulle = `${court(j.iso)} ${j.iso.slice(0, 4)} · entré ${fmt(j.encaisseXof)}${j.prevuXof ? ` · attendu ${fmt(j.prevuXof)}` : ''}`;
                return (
                  <g key={j.iso}>
                    <rect x={i * pasX} y={0} width={pasX} height={H} fill="transparent"><title>{bulle}</title></rect>
                    {hE > 0 && <rect x={x} y={H - hE} width={largeur} height={hE} rx={2} className="trp-prev__entre"><title>{bulle}</title></rect>}
                    {hP > 0 && <rect x={x} y={H - hE - hP - (hE > 0 ? 2 : 0)} width={largeur} height={hP} rx={2} className="trp-prev__attendu"><title>{bulle}</title></rect>}
                  </g>
                );
              })}
              {iAujourdhui >= 0 && <rect x={iAujourdhui * pasX + pasX / 2} y={0} width={1.5} height={H} className="trp-prev__auj" />}
            </svg>
          </div>
          <div className="trp-prev__jours" aria-hidden="true">
            <span>1er {MOIS_COURTS[Number(mk.slice(5, 7)) - 1]}</span>
            {/* Sous le trait cuivre, pas au milieu : la date d'aujourd'hui se
                place à sa vraie position dans le mois. */}
            {iAujourdhui >= 0 && (
              <span className="trp-prev__auj-dit" style={{ left: `${((iAujourdhui + 0.5) / n) * 100}%` }}>{court(today)} · aujourd’hui</span>
            )}
            <span>{court(dernierJour)}</span>
          </div>
          <figcaption className="trp-prev__note">Survolez une barre pour son montant. Les créances ne se dessinent pas jour par jour : on ne sait pas quel jour elles rentrent.</figcaption>
        </figure>
        <div className="trp-prev__raisons">
          <span className="trp-prev__sur">Ce qui fait la prévision</span>
          <ul>
            {lignes.map((l) => (
              <li key={l.cle}>
                {l.dit}
                {ouAller[l.cle] && <> <button type="button" className="trp-prev__lien" onClick={() => navigate(ouAller[l.cle]!.vers)}>{ouAller[l.cle]!.dit} ›</button></>}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
