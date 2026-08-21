import { useEffect, useMemo, useState } from 'react';
import { PageHead } from '../_ui';
import { Input, Segs } from '../../../../ds/components';
import { normName } from '../../../../shared/text';
import { litLeJournal, type Geste, type GesteVerbe } from '../../../../shared/journal';
import { todayISO, monthKey, monthTitle, MonthNav, downloadCsv } from '../finances/_shared';
import '../finances/finances.css';
import './systeme.css';

/* LE JOURNAL DES GESTES — 21 août 2026.

   « Je dois tracker systématiquement qui fait quoi et quand sur Le Trône. »

   Même grammaire que le registre des encaissements : on navigue par mois, on
   filtre, on cherche, et les totaux de tête s'ouvrent d'un clic. Ce qui change,
   c'est la matière : ici on ne compte pas de l'argent, on lit des mains.

   RIEN NE S'ÉCRIT DEPUIS CET ÉCRAN. Le journal est en ajout seul — la base
   elle-même refuse toute retouche (migration 0070). Un registre qu'on peut
   corriger ne prouve rien. */

const VERBES: { k: GesteVerbe | 'tous'; l: string }[] = [
  { k: 'tous', l: 'Tous' },
  { k: 'pose', l: 'Posé' },
  { k: 'modifie', l: 'Modifié' },
  { k: 'efface', l: 'Effacé' },
];

const LIBELLE_VERBE: Record<GesteVerbe, string> = {
  pose: 'Posé', modifie: 'Modifié', efface: 'Effacé',
};
/** Le verbe conjugué — « a créé », « a modifié », « a supprimé ». */
const DIT_VERBE: Record<GesteVerbe, string> = {
  pose: 'a créé', modifie: 'a modifié', efface: 'a supprimé',
};

const PORTES: Record<Geste['porte'], string> = {
  trone: 'Le Trône', couronne: 'Ma Couronne', consultation: 'La Consultation',
};

const heure = (iso: string): string => (iso ? iso.slice(11, 16) : '—');
const jourDe = (iso: string): string => iso.slice(0, 10);
const jourLong = (iso: string): string =>
  iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : '';

/** Les initiales d'une main — deux lettres, comme au Fil et au Tableau. */
const initiales = (nom: string): string => {
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return '—';
  if (mots.length === 1) return mots[0].slice(0, 2).toUpperCase();
  return (mots[0][0] + mots[mots.length - 1][0]).toUpperCase();
};

export default function Journal() {
  const [month, setMonth] = useState(monthKey(todayISO()));
  const [gestes, setGestes] = useState<Geste[]>([]);
  const [charge, setCharge] = useState(true);
  const [verbe, setVerbe] = useState<GesteVerbe | 'tous'>('tous');
  const [qui, setQui] = useState<string | null>(null);
  const [ecran, setEcran] = useState<string | null>(null);
  const [q, setQ] = useState('');

  /* LE JOURNAL SE LIT AU SERVEUR, PAS AU CACHE. Il n'est lié à aucun magasin
     local : des centaines de lignes par jour n'ont rien à faire dans le
     navigateur, et la politique du serveur (souverains seuls) doit rester le
     seul juge de ce qui se lit. Un compte sans le rang reçoit une liste vide,
     pas une erreur — l'écran le dit alors en toutes lettres. */
  useEffect(() => {
    let vivant = true;
    setCharge(true);
    void litLeJournal(month).then((rows) => {
      if (!vivant) return;
      setGestes(rows);
      setCharge(false);
    });
    return () => { vivant = false; };
  }, [month]);

  const mains = useMemo(() => {
    const noms = new Map<string, number>();
    for (const g of gestes) noms.set(g.parNom, (noms.get(g.parNom) ?? 0) + 1);
    return [...noms.entries()].sort((a, b) => b[1] - a[1]);
  }, [gestes]);

  const ecrans = useMemo(() => {
    const n = new Map<string, number>();
    for (const g of gestes) n.set(g.ecran, (n.get(g.ecran) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1]);
  }, [gestes]);

  const vus = useMemo(() => {
    const aiguille = normName(q);
    return gestes
      .filter((g) => verbe === 'tous' || g.verbe === verbe)
      .filter((g) => !qui || g.parNom === qui)
      .filter((g) => !ecran || g.ecran === ecran)
      .filter((g) => !aiguille
        || normName(g.piece).includes(aiguille)
        || normName(g.parNom).includes(aiguille)
        || normName(g.ecran).includes(aiguille));
  }, [gestes, verbe, qui, ecran, q]);

  /* Groupés par jour — c'est ainsi qu'on relit une journée de travail. */
  const parJour = useMemo(() => {
    const m = new Map<string, Geste[]>();
    for (const g of vus) {
      const j = jourDe(g.quand);
      const l = m.get(j);
      if (l) l.push(g); else m.set(j, [g]);
    }
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [vus]);

  const exportCsv = () =>
    downloadCsv(`journal-${month}`, [
      ['Quand', 'Qui', 'Compte', 'Porte', 'Geste', 'Écran', 'Pièce', 'Changements'],
      ...vus.map((g) => [
        g.quand, g.parNom, g.parMail ?? '', PORTES[g.porte], LIBELLE_VERBE[g.verbe], g.ecran, g.piece,
        (g.champs ?? []).map((c) => `${c.champ} : ${c.avant} → ${c.apres}`).join(' · '),
      ]),
    ]);

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="Système · Traçabilité"
        title="Le Journal des gestes."
        actions={<button className="mnd-btn mnd-btn--ghost" onClick={exportCsv}>Exporter le mois</button>}
      />

      <div className="trf-toolbar">
        <MonthNav month={month} onChange={setMonth} />
        <div className="trf-searchwrap">
          <Input placeholder="Chercher une pièce, une main, un écran…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <Segs
        value={verbe}
        onChange={(v) => setVerbe(v as GesteVerbe | 'tous')}
        options={VERBES.map((v) => ({ value: v.k, label: v.l }))}
      />

      {mains.length > 0 && (
        <div className="trs-filtres">
          <div className="trs-filtres__rang">
            <span className="trs-filtres__lab">Qui</span>
            <button className={`trf-chip ${!qui ? 'is-active' : ''}`} onClick={() => setQui(null)}>Tout le monde</button>
            {mains.map(([nom, n]) => (
              <button
                key={nom}
                className={`trf-chip ${qui === nom ? 'is-active' : ''}`}
                onClick={() => setQui(qui === nom ? null : nom)}
              >
                {nom} · {n}
              </button>
            ))}
          </div>
          <div className="trs-filtres__rang">
            <span className="trs-filtres__lab">Écran</span>
            <button className={`trf-chip ${!ecran ? 'is-active' : ''}`} onClick={() => setEcran(null)}>Tous</button>
            {ecrans.map(([nom, n]) => (
              <button
                key={nom}
                className={`trf-chip ${ecran === nom ? 'is-active' : ''}`}
                onClick={() => setEcran(ecran === nom ? null : nom)}
              >
                {nom} · {n}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="trf-panel" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, flexWrap: 'wrap', gap: 10 }}>
          <div className="trf-panel__title" style={{ marginBottom: 0 }}>{monthTitle(month)}</div>
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--ink-soft)', fontVariantNumeric: 'tabular-nums' }}>
            {vus.length} geste{vus.length > 1 ? 's' : ''}
            {vus.length !== gestes.length ? ` / ${gestes.length}` : ''} · {mains.length} main{mains.length > 1 ? 's' : ''}
          </div>
        </div>

        {charge && <div className="trf-empty">Lecture du journal…</div>}

        {/* UN MOIS VIDE NE SE LIT PAS COMME UN MOIS SANS ACTIVITÉ. Le journal
            commence le jour où il a été posé : avant, rien n'a été écrit —
            et il faut le dire, sinon le silence passerait pour une preuve. */}
        {!charge && gestes.length === 0 && (
          <div className="trf-empty">
            Aucun geste inscrit en {monthTitle(month)}.
            <div style={{ marginTop: 6, fontSize: 12 }}>
              Le journal a été posé le 21 août 2026 — rien d’antérieur n’a jamais été
              enregistré, et rien ne peut le reconstituer. Un mois vide d’avant cette
              date ne veut donc pas dire un mois sans travail.
            </div>
          </div>
        )}

        {!charge && gestes.length > 0 && vus.length === 0 && (
          <div className="trf-empty">Aucun geste ne répond à ce filtre.</div>
        )}

        {parJour.map(([j, lignes]) => (
          <div key={j}>
            <div className="trs-jour">
              <span>{jourLong(j)}</span>
              <span className="trs-jour__n">{lignes.length} geste{lignes.length > 1 ? 's' : ''}</span>
            </div>
            {lignes.map((g) => (
              <div className="trs-geste" key={g.id}>
                <span className="trs-geste__h">{heure(g.quand)}</span>
                <span
                  className={`trs-qui ${g.porte !== 'trone' ? 'trs-qui--dehors' : ''}`}
                  title={g.parMail ?? PORTES[g.porte]}
                >
                  {g.porte === 'trone' ? initiales(g.parNom) : '·'}
                </span>
                <span className="trs-geste__dit">
                  <span className={`trs-verbe trs-verbe--${g.verbe}`}>{LIBELLE_VERBE[g.verbe]}</span>
                  <b>{g.parNom}</b> {DIT_VERBE[g.verbe]} <b>{g.piece}</b>
                  <div className="trs-geste__quoi">{g.ecran} · {PORTES[g.porte]}</div>
                  {g.champs && g.champs.length > 0 && (
                    <div className="trs-diff">
                      {g.champs.map((c) => (
                        <div className="trs-diff__row" key={c.champ}>
                          <span className="trs-diff__champ">{c.champ}</span>
                          <span className="trs-diff__avant">{c.avant}</span>
                          <span className="trs-diff__apres">→ {c.apres}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <p className="mnd-muted" style={{ fontSize: 11.5, marginTop: 14, lineHeight: 1.6 }}>
        Le journal est en ajout seul : la base refuse toute retouche, y compris à un souverain.
        Les gestes de plus de douze mois sont effacés avec le cliché de nuit. Une écriture faite
        en plusieurs corrections rapprochées ne fait qu’une ligne — l’état d’avant, l’état d’après.
      </p>
    </div>
  );
}
