import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { Modal } from '../../../../ds/components';
import { fmtMoney, convertFromXof } from '../../../../shared/currency';
import {
  TEINTES, TEINTE_AUTRES, graduations, chiffreCourt, pourcents, cheminDuMorceau, anglesDesMorceaux, groupePar,
  type PartDeLAnneau, type ecartAuMois,
} from './synthese-graphes-pur';

/* ══ LES GRAPHES DE LA SYNTHÈSE — 24 octobre 2026 ═══════════════════
   Les règles (teintes, graduations, morceaux) vivent dans
   `synthese-graphes-pur.ts` ; ici, le dessin et le survol.

   Les marques sont fines (colonnes de 24 px au plus, bout arrondi, pied
   carré ; ligne de 2 px ; points de 8 px cerclés du fond), la grille est un
   filet qui se retire, et aucun texte ne porte la couleur d'une série : la
   teinte va à la marque posée À CÔTÉ du texte. Le survol ajoute, il ne
   cache rien : chaque chiffre survolé se lit aussi dans les tuiles, la
   légende ou la table « Voir les chiffres ». */

const surTouche = (f: () => void) => (e: KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); f(); }
};

/** La largeur réelle de la boîte : un dessin aux pixels près garde ses
    lettres à la même taille, quelle que soit la largeur de l'écran. */
function useLargeur<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setW(Math.round(el.getBoundingClientRect().width));
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver((entrees) => { for (const e of entrees) setW(Math.round(e.contentRect.width)); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/* ── L'ÉTINCELLE : la pente des derniers mois, en gris ; le mois choisi, en couleur. */
export function Etincelle({ valeurs, indexCourant, largeur = 132 }: { valeurs: number[]; indexCourant: number; largeur?: number }) {
  const W = Math.max(60, largeur), H = 30, p = 5;
  if (valeurs.length < 2) return null;
  const min = Math.min(...valeurs, 0);
  const max = Math.max(...valeurs, 0);
  const x = (i: number) => p + ((W - 2 * p) * i) / (valeurs.length - 1);
  const y = (v: number) => (max === min ? H / 2 : p + (H - 2 * p) * (1 - (v - min) / (max - min)));
  const i = Math.min(Math.max(indexCourant, 0), valeurs.length - 1);
  return (
    <svg className="tsy-etincelle" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
      <polyline fill="none" stroke="var(--tsy-attenue)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
        points={valeurs.map((v, k) => `${x(k).toFixed(1)},${y(v).toFixed(1)}`).join(' ')} />
      <circle cx={x(i)} cy={y(valeurs[i])} r={4} fill={TEINTES[0]} stroke="var(--surface-card)" strokeWidth={2} />
    </svg>
  );
}

/* ── LA TUILE DU MOIS : le chiffre, son écart au mois d'avant, la pente. */
export function TuileDuMois(o: {
  libelle: string;
  valeur: string;
  ecart: ReturnType<typeof ecartAuMois>;
  avantNom: string;
  avantValeur: string;
  extra?: string;
  serie: number[];
  indexCourant: number;
  onOuvrir: () => void;
}) {
  const [pied, largeurDuPied] = useLargeur<HTMLDivElement>();
  const { pct, sens, bon } = o.ecart;
  const etat = bon === true ? 'bon' : bon === false ? 'mauvais' : 'neutre';
  const fleche = sens === 'hausse' ? '▲' : sens === 'baisse' ? '▼' : '=';
  return (
    <div className="tsy-tuile" role="button" tabIndex={0} onClick={o.onOuvrir} onKeyDown={surTouche(o.onOuvrir)} title="Voir le détail">
      <div className="tsy-tuile__l">{o.libelle}</div>
      <div className="tsy-tuile__ligne">
        <span className={`tsy-pastille tsy-pastille--${etat}`} aria-hidden />
        <span className="tsy-tuile__v">{o.valeur}</span>
      </div>
      <div className={`tsy-tuile__ecart tsy-tuile__ecart--${etat}`}>
        {pct === null ? 'premier mois suivi' : <><span aria-hidden>{fleche}</span> {Math.abs(pct)} % vs {o.avantNom}</>}
      </div>
      <div className="tsy-tuile__cmp">
        <span>{o.avantNom} : {o.avantValeur}</span>
        {o.extra && <span>{o.extra}</span>}
      </div>
      <div className="tsy-tuile__pied" ref={pied}>
        {largeurDuPied > 0 && <Etincelle valeurs={o.serie} indexCourant={o.indexCourant} largeur={largeurDuPied} />}
      </div>
    </div>
  );
}

/* ── LE RÉSULTAT MOIS PAR MOIS : deux colonnes (revenus, dépenses) et la
   ligne du résultat, sur UN SEUL axe en francs. Un clic choisit le mois. */
export type MoisDuGraphe = { mk: string; court: string; long: string; rev: number; exp: number; net: number; selected: boolean };

const SERIES_DU_RESULTAT = [
  { cle: 'rev', nom: 'Revenus encaissés', teinte: TEINTES[0], forme: 'barre' },
  { cle: 'exp', nom: 'Dépenses engagées', teinte: TEINTES[1], forme: 'barre' },
  { cle: 'net', nom: 'Résultat net', teinte: TEINTES[3], forme: 'ligne' },
] as const;

/** Une colonne au bout arrondi et au pied carré, posée sur la ligne du zéro. */
const colonne = (x: number, w: number, y0: number, y1: number): string => {
  const h = y0 - y1;
  if (h <= 0.5) return '';
  const r = Math.min(4, w / 2, h);
  return `M ${x} ${y0} L ${x} ${y1 + r} Q ${x} ${y1} ${x + r} ${y1} L ${x + w - r} ${y1} Q ${x + w} ${y1} ${x + w} ${y1 + r} L ${x + w} ${y0} Z`;
};

export function ColonnesDuResultat({ mois, currency, onChoisir }: { mois: MoisDuGraphe[]; currency: string; onChoisir: (mk: string) => void }) {
  const [boite, largeur] = useLargeur<HTMLDivElement>();
  const [survol, setSurvol] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const W = Math.max(300, largeur);
  const H = 268, haut = 16, bas = 30, gauche = 58, droite = 14;
  const plotH = H - haut - bas;
  const ticks = graduations(Math.min(...mois.map((m) => m.net), 0), Math.max(...mois.flatMap((m) => [m.rev, m.exp, m.net]), 0));
  const vide = ticks.length < 2;
  const lo = ticks[0] ?? 0;
  const hi = ticks[ticks.length - 1] ?? 1;
  const y = (v: number) => haut + plotH * (1 - (v - lo) / (hi - lo || 1));
  const bande = (W - gauche - droite) / Math.max(1, mois.length);
  const colW = Math.min(24, Math.max(6, bande * 0.26));
  const cx = (i: number) => gauche + bande * i + bande / 2;
  const y0 = y(0);
  /* Douze mois sur un téléphone : une étiquette sur deux, comptée depuis le
     dernier mois ; celle du mois choisi se lit toujours, ses voisines se taisent. */
  const pas = bande < 46 ? 2 : 1;
  const iChoisi = mois.findIndex((m) => m.selected);
  const etiquetteLue = (i: number) => i === iChoisi
    || (i % pas === (mois.length - 1) % pas && (pas === 1 || Math.abs(i - iChoisi) > 1 || iChoisi < 0));
  const d = survol !== null ? mois[survol] : null;
  const montant = (v: number) => fmtMoney(v, currency);

  return (
    <div className="tsy-graphe">
      <div className="tsy-graphe__tete">
        <div className="tsy-legende" role="list">
          {SERIES_DU_RESULTAT.map((s) => (
            <span key={s.cle} className="tsy-legende__item" role="listitem">
              {s.forme === 'barre'
                ? <span className="tsy-cle tsy-cle--barre" style={{ background: s.teinte }} aria-hidden />
                : <span className="tsy-cle tsy-cle--ligne" style={{ background: s.teinte }} aria-hidden />}
              {s.nom}
            </span>
          ))}
        </div>
        <button type="button" className="tsy-lien" onClick={() => setTable((v) => !v)} aria-pressed={table}>
          {table ? 'Voir le graphe' : 'Voir les chiffres'}
        </button>
      </div>

      {table ? (
        <div className="tsy-table__boite">
          <table className="tsy-table">
            <thead><tr><th scope="col">Mois</th>{SERIES_DU_RESULTAT.map((s) => <th key={s.cle} scope="col">{s.nom}</th>)}</tr></thead>
            <tbody>
              {mois.map((m) => (
                <tr key={m.mk} className={m.selected ? 'is-on' : undefined}>
                  <th scope="row">{m.long}</th>
                  <td>{montant(m.rev)}</td><td>{montant(m.exp)}</td><td>{montant(m.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="tsy-graphe__plan" ref={boite}>
          {vide ? (
            <div className="trf-empty">Aucun mouvement sur ces mois, le graphe attend ses premiers chiffres.</div>
          ) : largeur > 0 && (
            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Revenus, dépenses et résultat, mois par mois">
              {mois.map((m, i) => m.selected && (
                <rect key={`choisi-${m.mk}`} x={gauche + bande * i + 2} y={haut - 8} width={bande - 4} height={plotH + 8 + bas - 4} rx={4} fill="var(--tsy-choisi)" />
              ))}
              {survol !== null && !mois[survol]?.selected && (
                <rect x={gauche + bande * survol + 2} y={haut - 8} width={bande - 4} height={plotH + 8 + bas - 4} rx={4} fill="var(--hover-veil)" />
              )}
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={gauche} x2={W - droite} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--tsy-base)' : 'var(--tsy-grille)'} strokeWidth={1} shapeRendering="crispEdges" />
                  <text x={gauche - 10} y={y(t) + 3.5} textAnchor="end" className="tsy-axe">{chiffreCourt(convertFromXof(t, currency))}</text>
                </g>
              ))}
              {mois.map((m, i) => (
                <g key={m.mk}>
                  <path d={colonne(cx(i) - colW - 1, colW, y0, y(Math.max(0, m.rev)))} fill={SERIES_DU_RESULTAT[0].teinte} />
                  <path d={colonne(cx(i) + 1, colW, y0, y(Math.max(0, m.exp)))} fill={SERIES_DU_RESULTAT[1].teinte} />
                  {etiquetteLue(i) && <text x={cx(i)} y={H - 10} textAnchor="middle" className={`tsy-axe ${m.selected ? 'tsy-axe--choisi' : ''}`}>{m.court}</text>}
                </g>
              ))}
              <polyline fill="none" stroke={SERIES_DU_RESULTAT[2].teinte} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                points={mois.map((m, i) => `${cx(i).toFixed(1)},${y(m.net).toFixed(1)}`).join(' ')} />
              {mois.map((m, i) => (
                <circle key={`pt-${m.mk}`} cx={cx(i)} cy={y(m.net)} r={4} fill={SERIES_DU_RESULTAT[2].teinte} stroke="var(--surface-card)" strokeWidth={2} />
              ))}
              {/* Les cibles du survol : toute la bande du mois, plus large que les marques. */}
              {mois.map((m, i) => (
                <rect
                  key={`cible-${m.mk}`}
                  x={gauche + bande * i} y={0} width={bande} height={H}
                  fill="transparent" style={{ cursor: 'pointer', outline: 'none' }}
                  tabIndex={0} role="button" aria-label={`${m.long} : revenus ${montant(m.rev)}, dépenses ${montant(m.exp)}, résultat ${montant(m.net)}`}
                  onPointerEnter={() => setSurvol(i)} onPointerMove={() => setSurvol(i)} onPointerLeave={() => setSurvol(null)}
                  onFocus={() => setSurvol(i)} onBlur={() => setSurvol(null)}
                  onClick={() => onChoisir(m.mk)} onKeyDown={surTouche(() => onChoisir(m.mk))}
                />
              ))}
            </svg>
          )}
          {d && survol !== null && (
            <div className="tsy-bulle" style={{ left: Math.min(Math.max(cx(survol), 110), W - 110) }} role="status">
              <div className="tsy-bulle__t">{d.long}</div>
              {SERIES_DU_RESULTAT.map((s) => (
                <div key={s.cle} className="tsy-bulle__l">
                  <span className="tsy-cle tsy-cle--ligne" style={{ background: s.teinte }} aria-hidden />
                  <strong>{montant(d[s.cle])}</strong>
                  <span>{s.nom}</span>
                </div>
              ))}
              {!d.selected && <div className="tsy-bulle__note">Cliquer pour lire ce mois</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── L'ANNEAU : la part de chaque chose dans un tout. Quatre teintes au
   plus, le reste en « Autres ». Le centre dit le total ; survolé, il dit le
   morceau. La légende, à côté, porte chaque chiffre : rien ne dépend du survol. */
export function Anneau({ parts, currency, total, libelleTotal, vide, onOuvrir, teinteDe }: {
  parts: PartDeLAnneau[];
  currency: string;
  total: number;
  libelleTotal: string;
  vide: string;
  onOuvrir: (p: PartDeLAnneau) => void;
  /** Pour une teinte fixée à la chose (les maisons), au lieu du rang. */
  teinteDe?: (p: PartDeLAnneau) => string;
}) {
  const [survol, setSurvol] = useState<number | null>(null);
  const S = 172, R = 84, r = 60, c = S / 2;
  const angles = anglesDesMorceaux(parts.map((p) => p.valeur));
  const pcts = pourcents(parts.map((p) => p.valeur));
  const teinte = (p: PartDeLAnneau) => teinteDe?.(p) ?? (p.teinte === null ? TEINTE_AUTRES : TEINTES[p.teinte]);
  if (parts.length === 0) return <div className="trf-empty">{vide}</div>;
  const ici = survol !== null ? parts[survol] : null;
  return (
    <div className="tsy-anneau">
      <div className="tsy-anneau__dessin">
        <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} role="img" aria-label={`${libelleTotal} : ${fmtMoney(total, currency)}`}>
          {parts.map((p, i) => (
            <path
              key={p.nom}
              d={cheminDuMorceau(c, c, R, r, angles[i].a0, angles[i].a1)}
              fill={teinte(p)} fillRule="evenodd"
              stroke="var(--surface-card)" strokeWidth={parts.length > 1 ? 2 : 0}
              opacity={survol === null || survol === i ? 1 : 0.35}
              style={{ cursor: 'pointer', transition: 'opacity .15s' }}
              onPointerEnter={() => setSurvol(i)} onPointerLeave={() => setSurvol(null)}
              onClick={() => onOuvrir(p)}
            />
          ))}
        </svg>
        <div className="tsy-anneau__centre" aria-hidden>
          <div className="tsy-anneau__v">{chiffreCourt(convertFromXof(ici ? ici.valeur : total, currency))}</div>
          <div className="tsy-anneau__l">{ici ? `${ici.nom} · ${pcts[survol ?? 0]} %` : libelleTotal}</div>
        </div>
      </div>
      <div className="tsy-anneau__legende" role="list">
        {parts.map((p, i) => (
          <div
            key={p.nom}
            className={`tsy-anneau__ligne ${survol === i ? 'is-on' : ''}`}
            role="button" tabIndex={0}
            onPointerEnter={() => setSurvol(i)} onPointerLeave={() => setSurvol(null)}
            onFocus={() => setSurvol(i)} onBlur={() => setSurvol(null)}
            onClick={() => onOuvrir(p)} onKeyDown={surTouche(() => onOuvrir(p))}
            title={p.membres.length > 1 ? p.membres.join(', ') : `Voir le détail · ${p.nom}`}
          >
            <span className="tsy-cle tsy-cle--barre" style={{ background: teinte(p) }} aria-hidden />
            <span className="tsy-anneau__nom">{p.nom}{p.membres.length > 1 ? ` (${p.membres.length})` : ''}</span>
            <span className="tsy-anneau__pct">{pcts[i]} %</span>
            <span className="tsy-anneau__val">{fmtMoney(p.valeur, currency)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── LE CLASSEMENT : des barres couchées, une seule teinte (une seule
   série : la couleur ne dirait rien de plus que la longueur). */
export function Classement({ lignes, currency, vide, onOuvrir }: {
  lignes: { nom: string; valeur: number; meta?: string }[];
  currency: string;
  vide: string;
  onOuvrir: (nom: string) => void;
}) {
  const max = Math.max(...lignes.map((l) => l.valeur), 1);
  if (lignes.length === 0) return <div className="trf-empty">{vide}</div>;
  return (
    <div className="tsy-classement" role="list">
      {lignes.map((l, i) => (
        <div key={l.nom} className="tsy-classement__ligne" role="button" tabIndex={0}
          onClick={() => onOuvrir(l.nom)} onKeyDown={surTouche(() => onOuvrir(l.nom))} title={`Voir le détail · ${l.nom}`}>
          <div className="tsy-classement__haut">
            <span className="tsy-classement__rang">{i + 1}</span>
            <span className="tsy-classement__nom">{l.nom}</span>
            <span className="tsy-classement__val">{fmtMoney(l.valeur, currency)}</span>
          </div>
          <div className="tsy-classement__piste">
            <div className="tsy-classement__barre" style={{ width: `${Math.max(2, Math.round((l.valeur / max) * 100))}%`, background: TEINTES[0] }} />
          </div>
          {l.meta && <div className="tsy-classement__meta">{l.meta}</div>}
        </div>
      ))}
    </div>
  );
}

/* ── LA FENÊTRE DU DÉTAIL : derrière chaque chiffre, ses écritures ; et,
   comme chez Workday, « Voir par » cliente, caisse, mode… Un groupe cliqué
   filtre les écritures, et le total suit. */
export type LigneDuDetail = { date?: string; who: string; meta?: string; amount: number; dims?: Record<string, string> };

export function FenetreDuDetail({ titre, lignes, currency, vide, fmtJour, onFermer }: {
  titre: ReactNode;
  lignes: LigneDuDetail[];
  currency: string;
  vide: string;
  fmtJour: (iso: string) => string;
  onFermer: () => void;
}) {
  const cles = useMemo(() => {
    const vues: string[] = [];
    for (const l of lignes) for (const k of Object.keys(l.dims ?? {})) if (!vues.includes(k)) vues.push(k);
    return vues;
  }, [lignes]);
  const [vue, setVue] = useState<string>('');
  const [filtre, setFiltre] = useState<{ cle: string; nom: string } | null>(null);
  const visibles = filtre
    ? lignes.filter((l) => ((l.dims?.[filtre.cle] ?? '').trim() || 'Non précisé') === filtre.nom)
    : lignes;
  const total = visibles.reduce((s, l) => s + l.amount, 0);
  const groupes = vue ? groupePar(visibles, vue) : [];
  const maxG = Math.max(...groupes.map((g) => Math.abs(g.total)), 1);
  return (
    <Modal title={titre} onClose={onFermer} width={720}>
      {lignes.length === 0 ? (
        <div className="trf-empty">{vide}</div>
      ) : (
        <div className="tsy-detail">
          {cles.length > 0 && (
            <div className="tsy-detail__vues" role="group" aria-label="Voir par">
              <span className="tsy-detail__vuesl">Voir par</span>
              <button type="button" className={`tsy-seg ${vue === '' ? 'is-on' : ''}`} aria-pressed={vue === ''} onClick={() => setVue('')}>Écritures</button>
              {cles.map((k) => (
                <button key={k} type="button" className={`tsy-seg ${vue === k ? 'is-on' : ''}`} aria-pressed={vue === k} onClick={() => setVue(k)}>{k}</button>
              ))}
            </div>
          )}
          {filtre && (
            <div className="tsy-detail__filtre">
              <span>{filtre.cle} : <strong>{filtre.nom}</strong></span>
              <button type="button" className="tsy-lien" onClick={() => setFiltre(null)}>Retirer le filtre</button>
            </div>
          )}
          {vue ? (
            <div className="tsy-classement" role="list">
              {groupes.map((g) => (
                <div key={g.nom} className="tsy-classement__ligne" role="button" tabIndex={0}
                  onClick={() => { setFiltre({ cle: vue, nom: g.nom }); setVue(''); }}
                  onKeyDown={surTouche(() => { setFiltre({ cle: vue, nom: g.nom }); setVue(''); })}
                  title={`Voir les ${g.n} écritures · ${g.nom}`}>
                  <div className="tsy-classement__haut">
                    <span className="tsy-classement__nom">{g.nom}</span>
                    <span className="tsy-classement__meta">{g.n} écriture{g.n > 1 ? 's' : ''}</span>
                    <span className="tsy-classement__val">{fmtMoney(g.total, currency)}</span>
                  </div>
                  <div className="tsy-classement__piste">
                    <div className="tsy-classement__barre" style={{ width: `${Math.max(2, Math.round((Math.abs(g.total) / maxG) * 100))}%`, background: TEINTES[0] }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            visibles.map((r, idx) => (
              <div className="trf-exprow" key={idx}>
                {r.date ? <span className="trf-datepill">{fmtJour(r.date)}</span> : <span className="trf-datepill" style={{ visibility: 'hidden' }}>·</span>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="trf-exprow__vendor">{r.who}</div>
                  {r.meta && <div className="trf-exprow__meta">{r.meta}</div>}
                </div>
                <span className="trf-exprow__amt" style={{ color: r.amount < 0 ? 'var(--trf-error)' : undefined }}>{fmtMoney(r.amount, currency)}</span>
              </div>
            ))
          )}
          <div className="tsy-detail__total">
            <span>Total · {visibles.length} écriture{visibles.length > 1 ? 's' : ''}</span>
            <span style={{ color: total < 0 ? 'var(--trf-error)' : 'var(--color-indigo)' }}>{fmtMoney(total, currency)}</span>
          </div>
        </div>
      )}
    </Modal>
  );
}
