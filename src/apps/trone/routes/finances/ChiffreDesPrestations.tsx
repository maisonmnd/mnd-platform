import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Input } from '../../../../ds/components';
import { PageHead } from '../_ui';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { useAppointments, apptPaidXof } from '../../../../shared/agenda';
import { useClients } from '../../../../shared/clients';
import { mondeDeCat, mondeLabel, useCategories, type CatalogCategory } from '../../../../shared/catalog';
import { invoiceRegleXof, invoiceTotal, useInvoices, type Invoice } from '../../../../shared/finance';
import {
  evolution, laPeriode, leChiffre, lignesCsv, prixReel, rituelsDistincts,
  type ChoixDePeriode, type FormuleVendue, type Ligne, type RdvLu, type Regroupement,
} from '../../../../shared/chiffre-des-prestations-pur';
import { apptDuTotalXof, apptNetXof, DrillModal, todayISO, useServicesById, type Drill } from '../clients/_shared';
import { downloadCsv } from './_shared';

/* ══ LE CHIFFRE DES PRESTATIONS — 14 octobre 2026 ═════════════════════════

   « J'ai besoin de questionner des services du catalogue et voir quel chiffre
   d'affaires ils génèrent » (Yéman). Maquette EvcUQJUB… validée, quatre
   choix : le chiffre des rituels honorés avec « dont encaissé », la formule à
   sa vente sur une ligne à part, un écran des Finances, vu de la direction et
   du département Finances.

   Le Catalogue le disait déjà prestation par prestation, depuis toujours ; la
   Synthèse, le top 5 d'un mois. Ici : une période, un regroupement, tout le
   catalogue rangé, la comparaison, le détail qui s'ouvre, l'export. Les règles
   sont celles du Trône (shared/chiffre-des-prestations-pur.ts). */

const PERIODES: { k: ChoixDePeriode; l: string }[] = [
  { k: 'mois', l: 'Ce mois' }, { k: 'moisPrec', l: 'Le mois dernier' }, { k: 'trois', l: '3 derniers mois' },
  { k: 'annee', l: 'Cette année' }, { k: 'douze', l: '12 derniers mois' }, { k: 'libre', l: 'Dates choisies' },
];
const REGROUPEMENTS: { k: Regroupement; l: string }[] = [
  { k: 'prestation', l: 'Par prestation' }, { k: 'famille', l: 'Par famille' }, { k: 'maison', l: 'Par maison' },
];
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

export default function ChiffreDesPrestations() {
  const { branch, branches, currency } = useBranch();
  const navigate = useNavigate();
  const [rdvs] = useAppointments();
  const [clients] = useClients();
  const [cats] = useCategories();
  const [invoices] = useInvoices();
  const byId = useServicesById();
  const jour = todayISO();
  const [choix, setChoix] = useState<ChoixDePeriode>('mois');
  const [libreDe, setLibreDe] = useState(`${jour.slice(0, 7)}-01`);
  const [libreA, setLibreA] = useState(jour);
  const [regroupement, setRegroupement] = useState<Regroupement>('prestation');
  const [cherche, setCherche] = useState('');
  const [toutes, setToutes] = useState(false);
  const [choisie, setChoisie] = useState<string | null>(null);
  const [drill, setDrill] = useState<Drill | null>(null);
  const panneau = useRef<HTMLDivElement>(null);

  const entrees = useMemo(() => {
    const lesCats = Array.isArray(cats) ? cats : [];
    const catById = new Map(lesCats.map((c) => [c.id, c]));
    const racine = (id: string | undefined): CatalogCategory | undefined => {
      let c = id ? catById.get(id) : undefined;
      for (let i = 0; c?.parentId && i < 8; i += 1) { const p = catById.get(c.parentId); if (!p) break; c = p; }
      return c;
    };
    const invById = new Map((Array.isArray(invoices) ? invoices : []).map((i) => [i.id, i]));
    const nomDeCliente = (id?: string) => (id ? clients.find((c) => c.id === id)?.name : undefined);
    /* La part payée d'un rituel : par sa facture quand il en a une (l'argent y
       est consigné), sinon par le journal du rendez-vous. */
    const partPayeeDe = (a: RdvLu): number => {
      const inv = a.invoiceId ? invById.get(a.invoiceId) : undefined;
      if (inv) { const t = invoiceTotal(inv); const r = invoiceRegleXof(inv); return t > 0 ? r / t : r > 0 ? 1 : 0; }
      const appt = a as unknown as Parameters<typeof apptDuTotalXof>[0];
      const du = apptDuTotalXof(appt, byId);
      const paye = apptPaidXof(appt);
      return du > 0 ? paye / du : paye > 0 ? 1 : 0;
    };
    /* UNE FORMULE VENDUE : une facture d'abonnement, sans rendez-vous
       (equipe/Abonnements.tsx écrit « Abonnement · <formule> » sur sa note). */
    const formules: FormuleVendue[] = (Array.isArray(invoices) ? invoices : [])
      .filter((i: Invoice) => i.kind !== 'devis' && !i.apptId && (i.note ?? '').startsWith('Abonnement · '))
      .map((i: Invoice) => ({
        id: i.id, date: i.date, branchId: i.branchId,
        nom: i.lines[0]?.label || (i.note ?? '').replace('Abonnement · ', '').split(' · ')[0],
        montantXof: invoiceTotal(i), encaisseXof: invoiceRegleXof(i),
        qui: i.clientName ?? nomDeCliente(i.clientId) ?? 'Cliente',
      }));
    return {
      rdvs: (Array.isArray(rdvs) ? rdvs : []) as unknown as RdvLu[],
      netDe: (a: RdvLu) => apptNetXof(a as unknown as Parameters<typeof apptNetXof>[0], byId),
      partPayeeDe,
      services: byId as unknown as ReadonlyMap<string, { name: string; priceXof: number; categoryId?: string }>,
      familleDe: (id: string | undefined) => { const r = racine(id); return r ? { id: r.id, nom: r.label || r.fon } : undefined; },
      maisonDe: (id: string | undefined) => { const c = id ? catById.get(id) : undefined; if (!c) return undefined; const m = mondeDeCat(c, lesCats); return { id: m, nom: mondeLabel(m) }; },
      formules,
      nomDe: (a: RdvLu) => a.clientName ?? nomDeCliente(a.clientId) ?? 'Cliente de passage',
    };
  }, [rdvs, clients, cats, invoices, byId]);

  const periode = laPeriode(choix, jour, { de: libreDe, a: libreA });
  const multi = (branches?.length ?? 1) > 1;
  const calcule = (p: { de: string; a: string }) => leChiffre(entrees, p, regroupement, jour, !multi || toutes, branch.id);
  const r = useMemo(() => calcule(periode.p), [entrees, periode.p.de, periode.p.a, regroupement, toutes, branch.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const avant = useMemo(() => new Map(calcule(periode.avant).lignes.map((l) => [l.cle, l.chiffreXof])), [entrees, periode.avant.de, periode.avant.a, regroupement, toutes, branch.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const douze = laPeriode('douze', jour);
  const surDouze = useMemo(() => calcule(douze.p), [entrees, regroupement, toutes, branch.id, jour]); // eslint-disable-line react-hooks/exhaustive-deps

  const q = cherche.trim().toLowerCase();
  const lignes = r.lignes.filter((l) => !q || `${l.nom} ${l.sous ?? ''}`.toLowerCase().includes(q));
  const total = lignes.reduce((s, l) => s + l.chiffreXof, 0);
  const encaisse = lignes.reduce((s, l) => s + l.encaisseXof, 0);
  const rituels = rituelsDistincts(lignes);
  const max = Math.max(1, ...lignes.map((l) => l.chiffreXof));
  const laChoisie = lignes.find((l) => l.cle === choisie) ?? null;

  const ouvre = (l: Ligne) => setDrill({
    title: l.nom,
    sub: `${l.rituels} rituel${l.rituels > 1 ? 's' : ''}${l.sansArgent ? `, dont ${l.sansArgent} sans argent (formule ou série)` : ''} · ${periode.dit}`,
    total: l.chiffreXof,
    rows: l.detail.map((d) => ({
      date: d.date, who: d.qui, amount: d.montantXof, invoiceId: d.invoiceId,
      sub: d.quoi ?? (d.sansArgent ? 'Séance couverte ou de série, sans argent' : d.combine ? 'Part d’un rituel combiné' : 'Rituel honoré'),
      onOpen: d.invoiceId ? undefined : () => navigate(`/carnet?q=${encodeURIComponent(d.qui)}`),
    })),
  });
  /* Au téléphone, le détail s'ouvre sous le tableau : on l'amène sous les yeux. */
  useEffect(() => { if (choisie) panneau.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [choisie]);
  const exporte = () => downloadCsv(`chiffre-des-prestations-${periode.p.de}-${periode.p.a}.csv`, lignesCsv(lignes, avant));

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="Finances"
        title="Le chiffre des prestations."
        sub={`${periode.dit} · ${multi && toutes ? 'toutes les branches' : branch.name}`}
        actions={<Button variant="ghost" onClick={exporte} disabled={lignes.length === 0}>Exporter (CSV)</Button>}
      />

      <Card style={{ padding: 16, display: 'grid', gap: 10, marginBottom: 16 }}>
        <div className="trc-tabs" style={{ flexWrap: 'wrap' }} role="group" aria-label="Période">
          {PERIODES.map((p) => <button key={p.k} type="button" className={`trc-tab ${choix === p.k ? 'is-active' : ''}`} onClick={() => setChoix(p.k)}>{p.l}</button>)}
        </div>
        {choix === 'libre' && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <label className="mnd-muted" style={{ fontSize: 13 }}>Du <Input type="date" value={libreDe} onChange={(e) => setLibreDe(e.target.value)} /></label>
            <label className="mnd-muted" style={{ fontSize: 13 }}>au <Input type="date" value={libreA} onChange={(e) => setLibreA(e.target.value)} /></label>
          </div>
        )}
        <div className="trc-tabs" style={{ flexWrap: 'wrap' }} role="group" aria-label="Regrouper">
          {REGROUPEMENTS.map((g) => <button key={g.k} type="button" className={`trc-tab ${regroupement === g.k ? 'is-active' : ''}`} onClick={() => { setRegroupement(g.k); setChoisie(null); }}>{g.l}</button>)}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Input value={cherche} onChange={(e) => setCherche(e.target.value)} placeholder="Chercher : resserrage, DÀNDÀN, tresses…" aria-label="Chercher une prestation" style={{ flex: '1 1 240px', width: '100%', maxWidth: 420 }} />
          {multi && <label className="mnd-muted" style={{ fontSize: 13 }}><input type="checkbox" checked={toutes} onChange={(e) => setToutes(e.target.checked)} /> Toutes les branches</label>}
        </div>
      </Card>

      <div className="tr-grid tr-grid--4" style={{ marginBottom: 16 }}>
        <Card filet="indigo" style={{ padding: 16 }}><div className="mnd-stat__label">Chiffre</div><div className="mnd-stat__value" style={{ fontSize: 26 }}>{fmtMoney(total, currency)}</div></Card>
        <Card filet="indigo" style={{ padding: 16 }}><div className="mnd-stat__label">Rituels honorés</div><div className="mnd-stat__value" style={{ fontSize: 26 }}>{rituels}</div></Card>
        <Card filet="copper" style={{ padding: 16 }}><div className="mnd-stat__label">Dont encaissé</div><div className="mnd-stat__value" style={{ fontSize: 26 }}>{fmtMoney(encaisse, currency)}</div></Card>
        <Card filet="copper" style={{ padding: 16 }}><div className="mnd-stat__label">Reste à faire payer</div><div className="mnd-stat__value" style={{ fontSize: 26 }}>{fmtMoney(Math.max(0, total - encaisse), currency)}</div></Card>
      </div>

      <Card style={{ overflow: 'hidden' }}>
        <div className="mnd-scroll-x">
          <table className="tre-table">
            <thead>
              <tr>
                <th>#</th>
                <th>{regroupement === 'prestation' ? 'Prestation' : regroupement === 'famille' ? 'Famille' : 'Maison'}</th>
                <th className="num">Rituels</th><th className="num">Chiffre</th><th>Part</th>
                <th className="num">Prix réel moyen</th><th className="num">Remise</th><th className="num">Évolution</th>
                <th className="num">Dont encaissé</th><th className="num">À venir</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l, i) => {
                const p = prixReel(l);
                const ev = evolution(l.chiffreXof, avant.get(l.cle));
                return (
                  <tr key={l.cle} className="tre-row--edit" onClick={() => setChoisie(l.cle === choisie ? null : l.cle)} style={l.cle === choisie ? { background: 'var(--copper-50)' } : undefined} title="Ouvrir : le mois par mois et les rituels">
                    <td className="mnd-muted">{i + 1}</td>
                    <td style={{ minWidth: 150 }}><span style={{ color: 'var(--color-indigo)' }}>{l.nom}</span>{l.sous ? <span className="mnd-muted" style={{ fontSize: 12 }}> · {l.sous}</span> : null}</td>
                    <td className="num">{l.rituels}{l.sansArgent ? <span className="mnd-muted" style={{ fontSize: 12 }}> (dont {l.sansArgent} sans argent)</span> : null}</td>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>{fmtMoney(l.chiffreXof, currency)}</td>
                    <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}><span style={{ display: 'inline-block', height: 7, width: Math.round((l.chiffreXof / max) * 90), borderRadius: 999, background: 'var(--color-copper)' }} /><span className="mnd-muted" style={{ fontSize: 12 }}>{String(total ? Math.round((l.chiffreXof / total) * 1000) / 10 : 0).replace('.', ',')} %</span></span></td>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>{p.moyenXof === null ? '·' : fmtMoney(p.moyenXof, currency)}</td>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>{p.remisePct && p.remisePct > 0 ? `${p.remisePct} %` : '·'}</td>
                    <td className="num" style={{ whiteSpace: 'nowrap', color: ev === null ? undefined : ev >= 0 ? 'var(--trv-success, #2f7d54)' : 'var(--trv-error, #b0563e)' }}>{ev === null ? '·' : `${ev >= 0 ? '+' : ''}${ev} %`}</td>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>{fmtMoney(l.encaisseXof, currency)}</td>
                    <td className="num mnd-muted">{l.aVenir || '·'}</td>
                  </tr>
                );
              })}
              {lignes.length === 0 && <tr><td colSpan={10} className="mnd-muted" style={{ textAlign: 'center', padding: 28 }}>{q ? 'Aucune prestation ne répond à cette recherche.' : 'Aucun rituel honoré sur cette période.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="mnd-muted" style={{ fontSize: 12, marginTop: 10, lineHeight: 1.6 }}>
        Le chiffre est la valeur des rituels honorés, remise déduite, partagée entre leurs prestations au prorata des prix de carte : le même qu’au Catalogue et à la Synthèse.
        Une séance couverte par une formule ou de série compte en nombre, sans argent ; la formule compte à sa vente, sur sa ligne. « Dont encaissé » suit la facture du rituel, sinon son journal.
        Évolution : par rapport à la période d’avant, de même longueur. Les ventes au comptoir sans rendez-vous ne sont pas comptées, comme au Catalogue.
      </p>

      {laChoisie && (
        <div ref={panneau} style={{ marginTop: 16, scrollMarginTop: 90 }}><Card style={{ padding: 16, display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
            <div><div className="tre-sec-label">Mois par mois, sur douze mois</div><div style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--color-indigo)' }}>{laChoisie.nom}</div></div>
            <Button variant="copper" onClick={() => ouvre(laChoisie)}>Voir les {laChoisie.rituels} rituel{laChoisie.rituels > 1 ? 's' : ''}</Button>
          </div>
          <MoisParMois mois={douze.mois} valeurs={surDouze.lignes.find((l) => l.cle === laChoisie.cle)?.parMois ?? {}} enCours={periode.mois} />
        </Card></div>
      )}
      {drill && <DrillModal drill={drill} onClose={() => setDrill(null)} />}
    </div>
  );
}

/** Douze barres à l'échelle ; en indigo, les mois de la période choisie. */
function MoisParMois({ mois, valeurs, enCours }: { mois: string[]; valeurs: Record<string, number>; enCours: string[] }) {
  const vals = mois.map((m) => valeurs[m] ?? 0);
  const max = Math.max(...vals);
  const echelle = max > 0 ? Math.ceil(max / 50000) * 50000 : 50000;
  const L = 560, haut = 130, base = 150, gauche = 52, pas = (L - gauche - 6) / Math.max(1, mois.length);
  return (
    <svg viewBox={`0 0 ${L} 175`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Chiffre mois par mois">
      {[0, 0.5, 1].map((k) => (
        <g key={k}>
          <line x1={gauche} x2={L - 6} y1={base - haut * k} y2={base - haut * k} stroke="var(--hairline)" strokeWidth={1} />
          <text x={gauche - 6} y={base - haut * k + 3} textAnchor="end" fontSize={10.5} fill="var(--ink-soft)">{Math.round((echelle * k) / 1000)} k</text>
        </g>
      ))}
      {vals.map((v, i) => {
        const h = (haut * v) / echelle;
        const x = gauche + i * pas + 4;
        const [a, m] = mois[i].split('-').map(Number);
        return (
          <g key={mois[i]}>
            <rect x={x} y={base - h} width={Math.max(2, pas - 8)} height={h} fill={enCours.includes(mois[i]) ? 'var(--color-indigo)' : 'var(--color-copper)'}><title>{`${MOIS_COURTS[m - 1]} ${a} : ${Math.round(v).toLocaleString('fr-FR')} F`}</title></rect>
            <text x={x + Math.max(2, pas - 8) / 2} y={base + 15} textAnchor="middle" fontSize={10.5} fill="var(--ink-soft)">{MOIS_COURTS[m - 1]}</text>
          </g>
        );
      })}
    </svg>
  );
}
