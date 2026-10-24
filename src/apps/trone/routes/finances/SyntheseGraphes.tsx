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
  /** Ce que dit l'écart (« septembre 2026, à jour égal ») ; par défaut `avantNom`. */
  vsNom?: string;
  extra?: string;
  serie: number[];
  indexCourant: number;
  onOuvrir?: () => void;
}) {
  const [pied, largeurDuPied] = useLargeur<HTMLDivElement>();
  const { pct, sens, bon } = o.ecart;
  const etat = bon === true ? 'bon' : bon === false ? 'mauvais' : 'neutre';
  const fleche = sens === 'hausse' ? '▲' : sens === 'baisse' ? '▼' : '=';
  const ouvrir = o.onOuvrir;
  const attributs = ouvrir
    ? { role: 'button', tabIndex: 0, onClick: ouvrir, onKeyDown: surTouche(ouvrir), title: 'Voir le détail' }
    : {};
  return (
    <div className={`tsy-tuile${ouvrir ? '' : ' tsy-tuile--fixe'}`} {...attributs}>
      <div className="tsy-tuile__l">{o.libelle}</div>
      <div className="tsy-tuile__ligne">
        <span className={`tsy-pastille tsy-pastille--${etat}`} aria-hidden />
        <span className="tsy-tuile__v">{o.valeur}</span>
      </div>
      <div className={`tsy-tuile__ecart tsy-tuile__ecart--${etat}`}>
        {pct === null ? 'premier mois suivi' : <><span aria-hidden>{fleche}</span> {Math.abs(pct)} % vs {o.vsNom ?? o.avantNom}</>}
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
export function Anneau({ parts, currency, total, libelleTotal, vide, onOuvrir, teinteDe, compte }: {
  parts: PartDeLAnneau[];
  currency: string;
  total: number;
  libelleTotal: string;
  vide: string;
  onOuvrir: (p: PartDeLAnneau) => void;
  /** Pour une teinte fixée à la chose (les maisons), au lieu du rang. */
  teinteDe?: (p: PartDeLAnneau) => string;
  /** Des nombres de choses (des rendez-vous), et non des francs. */
  compte?: boolean;
}) {
  const [survol, setSurvol] = useState<number | null>(null);
  const dit = (v: number) => (compte ? v.toLocaleString('fr-FR') : fmtMoney(v, currency));
  const ditCourt = (v: number) => (compte ? v.toLocaleString('fr-FR') : chiffreCourt(convertFromXof(v, currency)));
  const S = 172, R = 84, r = 60, c = S / 2;
  const angles = anglesDesMorceaux(parts.map((p) => p.valeur));
  const pcts = pourcents(parts.map((p) => p.valeur));
  const teinte = (p: PartDeLAnneau) => teinteDe?.(p) ?? (p.teinte === null ? TEINTE_AUTRES : TEINTES[p.teinte]);
  if (parts.length === 0) return <div className="trf-empty">{vide}</div>;
  const ici = survol !== null ? parts[survol] : null;
  return (
    <div className="tsy-anneau">
      <div className="tsy-anneau__dessin">
        <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} role="img" aria-label={`${libelleTotal} : ${dit(total)}`}>
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
          <div className="tsy-anneau__v">{ditCourt(ici ? ici.valeur : total)}</div>
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
            <span className="tsy-anneau__val">{dit(p.valeur)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── LE CLASSEMENT : des barres couchées, une seule teinte (une seule
   série : la couleur ne dirait rien de plus que la longueur). */
export function Classement({ lignes, currency, vide, onOuvrir }: {
  /** `dit` remplace le montant affiché (« 3× · 45 000 F ») ; la barre suit `valeur`. */
  lignes: { nom: string; valeur: number; meta?: string; dit?: string }[];
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
            <span className="tsy-classement__val">{l.dit ?? fmtMoney(l.valeur, currency)}</span>
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

/* ── LES COLONNES EMPILÉES : les parts d'un même total, colonne par colonne
   (les jours du mois : l'encaissé, puis l'attendu ; les mois : les rituels
   de chaque palier). Un seul axe ; 2 px de fond entre deux parts ; seul le
   haut de la pile est arrondi, le pied reste carré sur la ligne du zéro. */
export type ColonneEmpilee = { cle: string; court: string; long: string; valeurs: number[]; marque?: boolean };

export function ColonnesEmpilees({ colonnes, series, fmt, fmtAxe, onChoisir, vide, consigne, hauteur = 240, pasMin = 0 }: {
  colonnes: ColonneEmpilee[];
  series: { nom: string; teinte: string }[];
  fmt: (v: number) => string;
  fmtAxe: (v: number) => string;
  onChoisir?: (cle: string) => void;
  vide: string;
  /** Ce que la bulle propose (« Cliquer pour le détail du jour »). */
  consigne?: string;
  hauteur?: number;
  /** 1 pour un axe qui compte (des rituels), jamais de demi-rituel. */
  pasMin?: number;
}) {
  const [boite, largeur] = useLargeur<HTMLDivElement>();
  const [survol, setSurvol] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const W = Math.max(280, largeur);
  const H = hauteur, haut = 14, bas = 28, gauche = 52, droite = 10;
  const plotH = H - haut - bas;
  const totaux = colonnes.map((c) => c.valeurs.reduce((s, v) => s + Math.max(0, v), 0));
  const ticks = graduations(0, Math.max(...totaux, 0), 4, pasMin);
  const rien = ticks.length < 2;
  const hi = ticks[ticks.length - 1] ?? 1;
  const y = (v: number) => haut + plotH * (1 - v / (hi || 1));
  const bande = (W - gauche - droite) / Math.max(1, colonnes.length);
  const colW = Math.min(24, Math.max(3, bande * 0.62));
  const cx = (i: number) => gauche + bande * i + bande / 2;
  const d = survol !== null ? colonnes[survol] : null;
  return (
    <div className="tsy-graphe">
      <div className="tsy-graphe__tete">
        <div className="tsy-legende" role="list">
          {series.map((s) => (
            <span key={s.nom} className="tsy-legende__item" role="listitem">
              <span className="tsy-cle tsy-cle--barre" style={{ background: s.teinte }} aria-hidden />{s.nom}
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
            <thead><tr><th scope="col">&nbsp;</th>{series.map((s) => <th key={s.nom} scope="col">{s.nom}</th>)}{series.length > 1 && <th scope="col">Total</th>}</tr></thead>
            <tbody>
              {colonnes.map((c, i) => (
                <tr key={c.cle} className={c.marque ? 'is-on' : undefined}>
                  <th scope="row">{c.long}</th>
                  {series.map((s, k) => <td key={s.nom}>{fmt(c.valeurs[k] ?? 0)}</td>)}
                  {series.length > 1 && <td>{fmt(totaux[i])}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="tsy-graphe__plan" ref={boite} style={{ minHeight: H }}>
          {rien ? <div className="trf-empty">{vide}</div> : largeur > 0 && (
            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={series.map((s) => s.nom).join(', ')}>
              {colonnes.map((c, i) => c.marque && (
                <rect key={`m-${c.cle}`} x={gauche + bande * i + 1} y={haut - 6} width={Math.max(1, bande - 2)} height={plotH + 6 + bas - 4} rx={3} fill="var(--tsy-choisi)" />
              ))}
              {survol !== null && (
                <rect x={gauche + bande * survol + 1} y={haut - 6} width={Math.max(1, bande - 2)} height={plotH + 6 + bas - 4} rx={3} fill="var(--hover-veil)" />
              )}
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={gauche} x2={W - droite} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--tsy-base)' : 'var(--tsy-grille)'} strokeWidth={1} shapeRendering="crispEdges" />
                  <text x={gauche - 10} y={y(t) + 3.5} textAnchor="end" className="tsy-axe">{fmtAxe(t)}</text>
                </g>
              ))}
              {colonnes.map((c, i) => {
                const x = cx(i) - colW / 2;
                const dernier = c.valeurs.reduce((k, v, j) => (v > 0 ? j : k), -1);
                let cumul = 0;
                return (
                  <g key={c.cle}>
                    {c.valeurs.map((v, k) => {
                      if (v <= 0) return null;
                      const bas0 = y(cumul) - (cumul > 0 ? 2 : 0);
                      cumul += v;
                      const haut1 = y(cumul);
                      if (bas0 - haut1 < 0.5) return null;
                      const dPath = k === dernier
                        ? colonne(x, colW, bas0, haut1)
                        : `M ${x} ${bas0} L ${x} ${haut1} L ${x + colW} ${haut1} L ${x + colW} ${bas0} Z`;
                      return <path key={k} d={dPath} fill={series[k]?.teinte ?? TEINTE_AUTRES} />;
                    })}
                    {c.court && <text x={cx(i)} y={H - 9} textAnchor="middle" className={`tsy-axe ${c.marque ? 'tsy-axe--choisi' : ''}`}>{c.court}</text>}
                  </g>
                );
              })}
              {colonnes.map((c, i) => (
                <rect
                  key={`cible-${c.cle}`} x={gauche + bande * i} y={0} width={bande} height={H} fill="transparent"
                  style={{ cursor: onChoisir ? 'pointer' : 'default', outline: 'none' }} tabIndex={0} role={onChoisir ? 'button' : 'img'}
                  aria-label={`${c.long} : ${series.map((s, k) => `${s.nom} ${fmt(c.valeurs[k] ?? 0)}`).join(', ')}`}
                  onPointerEnter={() => setSurvol(i)} onPointerMove={() => setSurvol(i)} onPointerLeave={() => setSurvol(null)}
                  onFocus={() => setSurvol(i)} onBlur={() => setSurvol(null)}
                  onClick={onChoisir ? () => onChoisir(c.cle) : undefined}
                  onKeyDown={onChoisir ? surTouche(() => onChoisir(c.cle)) : undefined}
                />
              ))}
            </svg>
          )}
          {d && survol !== null && !rien && (
            <div className="tsy-bulle" style={{ left: Math.min(Math.max(cx(survol), 110), W - 110) }} role="status">
              <div className="tsy-bulle__t">{d.long}</div>
              {series.map((s, k) => (
                <div key={s.nom} className="tsy-bulle__l">
                  <span className="tsy-cle tsy-cle--ligne" style={{ background: s.teinte }} aria-hidden />
                  <strong>{fmt(d.valeurs[k] ?? 0)}</strong>
                  <span>{s.nom}</span>
                </div>
              ))}
              {series.length > 1 && (
                <div className="tsy-bulle__l">
                  <span aria-hidden />
                  <strong>{fmt(totaux[survol])}</strong>
                  <span>au total</span>
                </div>
              )}
              {consigne && onChoisir && <div className="tsy-bulle__note">{consigne}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── LE CUMUL : ce qui est entré depuis le 1er, jour après jour, face au mois
   d'avant. La série du mois en couleur, celle d'avant en gris (on lit l'une,
   l'autre sert de repère). Un réticule trouve le jour : on vise une date,
   jamais un trait de 2 px. */
export function LignesDuCumul({ points, series, fmt, fmtAxe, libelle, court, hauteur = 240 }: {
  points: number;
  series: { nom: string; teinte: string; valeurs: (number | null)[] }[];
  fmt: (v: number) => string;
  fmtAxe: (v: number) => string;
  libelle: (i: number) => string;
  court: (i: number) => string | null;
  hauteur?: number;
}) {
  const [boite, largeur] = useLargeur<HTMLDivElement>();
  const [survol, setSurvol] = useState<number | null>(null);
  const W = Math.max(280, largeur);
  const H = hauteur, haut = 14, bas = 28, gauche = 56, droite = 14;
  const plotH = H - haut - bas;
  const tous = series.flatMap((s) => s.valeurs.filter((v): v is number => v !== null));
  const ticks = graduations(Math.min(0, ...tous), Math.max(0, ...tous));
  const rien = ticks.length < 2;
  const lo = ticks[0] ?? 0;
  const hi = ticks[ticks.length - 1] ?? 1;
  const y = (v: number) => haut + plotH * (1 - (v - lo) / (hi - lo || 1));
  const pas = (W - gauche - droite) / Math.max(1, points - 1);
  const x = (i: number) => gauche + pas * i;
  const trace = (vals: (number | null)[]) => {
    const segs: string[] = [];
    let courant: string[] = [];
    vals.forEach((v, i) => {
      if (v === null) { if (courant.length) segs.push(courant.join(' ')); courant = []; return; }
      courant.push(`${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    });
    if (courant.length) segs.push(courant.join(' '));
    return segs;
  };
  const vise = (px: number) => setSurvol(Math.min(points - 1, Math.max(0, Math.round((px - gauche) / (pas || 1)))));
  return (
    <div className="tsy-graphe">
      <div className="tsy-graphe__tete">
        <div className="tsy-legende" role="list">
          {series.map((s) => (
            <span key={s.nom} className="tsy-legende__item" role="listitem">
              <span className="tsy-cle tsy-cle--ligne" style={{ background: s.teinte }} aria-hidden />{s.nom}
            </span>
          ))}
        </div>
      </div>
      <div className="tsy-graphe__plan" ref={boite} style={{ minHeight: H }}>
        {rien ? <div className="trf-empty">Rien d’encaissé sur ces deux mois, la courbe attend son premier franc.</div> : largeur > 0 && (
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Cumul : ${series.map((s) => s.nom).join(' et ')}`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={gauche} x2={W - droite} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--tsy-base)' : 'var(--tsy-grille)'} strokeWidth={1} shapeRendering="crispEdges" />
                <text x={gauche - 10} y={y(t) + 3.5} textAnchor="end" className="tsy-axe">{fmtAxe(t)}</text>
              </g>
            ))}
            {Array.from({ length: points }, (_, i) => court(i) && (
              <text key={`x-${i}`} x={x(i)} y={H - 9} textAnchor="middle" className="tsy-axe">{court(i)}</text>
            ))}
            {survol !== null && <line x1={x(survol)} x2={x(survol)} y1={haut} y2={haut + plotH} stroke="var(--tsy-base)" strokeWidth={1} />}
            {[...series].reverse().map((s) => trace(s.valeurs).map((pts, k) => (
              <polyline key={`${s.nom}-${k}`} points={pts} fill="none" stroke={s.teinte} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            )))}
            {series.map((s) => {
              const i = survol ?? s.valeurs.reduce<number>((k, v, j) => (v !== null ? j : k), -1);
              const v = i >= 0 ? s.valeurs[i] : null;
              return v === null || v === undefined ? null : <circle key={`pt-${s.nom}`} cx={x(i)} cy={y(v)} r={4} fill={s.teinte} stroke="var(--surface-card)" strokeWidth={2} />;
            })}
            <rect
              x={gauche - pas / 2} y={0} width={W - gauche - droite + pas} height={H} fill="transparent" tabIndex={0}
              style={{ outline: 'none', cursor: 'crosshair' }} aria-label="Parcourir le mois jour par jour avec les flèches"
              onPointerMove={(e) => vise(e.clientX - (e.currentTarget.ownerSVGElement?.getBoundingClientRect().left ?? 0))}
              onPointerLeave={() => setSurvol(null)} onBlur={() => setSurvol(null)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight') { e.preventDefault(); setSurvol((v) => Math.min(points - 1, (v ?? -1) + 1)); }
                if (e.key === 'ArrowLeft') { e.preventDefault(); setSurvol((v) => Math.max(0, (v ?? points) - 1)); }
              }}
            />
          </svg>
        )}
        {survol !== null && !rien && (
          <div className="tsy-bulle" style={{ left: Math.min(Math.max(x(survol), 110), W - 110) }} role="status">
            <div className="tsy-bulle__t">{libelle(survol)}</div>
            {series.map((s) => (
              <div key={s.nom} className="tsy-bulle__l">
                <span className="tsy-cle tsy-cle--ligne" style={{ background: s.teinte }} aria-hidden />
                <strong>{s.valeurs[survol] === null || s.valeurs[survol] === undefined ? 'à venir' : fmt(s.valeurs[survol] as number)}</strong>
                <span>{s.nom}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── LA BARRE DES PARTS : un tout en une seule barre couchée (les clientes
   par palier). Des marches ordonnées, donc une seule teinte du clair au
   foncé ; la légende dessous porte chaque nombre. */
export function BarreDesParts({ parts, vide }: {
  parts: { nom: string; valeur: number; teinte: string; marque?: ReactNode; detail?: string }[];
  vide: string;
}) {
  const vivantes = parts.filter((p) => p.valeur > 0);
  const pcts = pourcents(parts.map((p) => p.valeur));
  if (vivantes.length === 0) return <div className="trf-empty">{vide}</div>;
  return (
    <div className="tsy-parts">
      <div className="tsy-parts__barre" role="img" aria-label={parts.map((p, i) => `${p.nom} ${p.valeur} (${pcts[i]} %)`).join(', ')}>
        {parts.map((p, i) => p.valeur > 0 && (
          <div key={p.nom} className="tsy-parts__seg" style={{ flexGrow: p.valeur, background: p.teinte }} title={`${p.nom} · ${p.valeur} · ${pcts[i]} %`} />
        ))}
      </div>
      <div className="tsy-parts__legende">
        {parts.map((p, i) => (
          <div key={p.nom} className="tsy-parts__ligne">
            <span className="tsy-cle tsy-cle--barre" style={{ background: p.teinte }} aria-hidden />
            <span className="tsy-parts__nom">{p.marque ?? p.nom}</span>
            <span className="tsy-parts__v">{p.valeur.toLocaleString('fr-FR')}</span>
            <span className="tsy-anneau__pct">{pcts[i]} %</span>
            {p.detail && <span className="tsy-parts__detail">{p.detail}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
