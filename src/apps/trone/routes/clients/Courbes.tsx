import { useState } from 'react';
import type { Bilan } from '../../../../shared/bilans';
import type { ComptageLu } from '../../../../shared/comptages';

/* ══ LE SUIVI DE LA COURONNE, EN COURBES — 5 septembre 2026 ═════════
   (maquette `maquette-le-suivi-de-la-couronne.html`, validée)

   « Des courbes qui peuvent servir de suivi et d'évaluation pour fidéliser les
   clients, leur donner des informations sur la pousse de leurs locks suite à un
   resserrage. Un suivi client irréprochable » (Yéman).

   LA MAISON NOTAIT DÉJÀ, ET NE MONTRAIT RIEN. Chaque bilan de séance porte
   quatre jauges de 1 à 5, datées et numérotées, remises à la cliente depuis le
   début — personne ne les avait jamais mises bout à bout. C'est la PENTE qui
   parle, pas la note du jour : une cliente qui voit ses racines passer de 2 à 4
   en dix-huit mois comprend ce qu'elle achète.

   ── CE QUI GOUVERNE CES DESSINS ─────────────────────────────────────

   ① LES TEINTES SONT CALCULÉES, PAS CHOISIES. Les couleurs de la Maison
     échouent en graphe : le vert et la brique sont indiscernables en
     deutéranopie, et l'indigo est trop sombre pour tenir la bande de clarté.
     Les quatre teintes ci-dessous ont passé le contrôle sur TOUTES les paires
     (séparation daltonien, plancher de chroma, contraste sur le parchemin).
     ORDRE FIXE, JAMAIS RECYCLÉ : la couleur suit la jauge, pas son rang — un
     filtre qui retire une série ne doit pas repeindre les autres.

   ② L'IDENTITÉ NE TIENT JAMAIS À LA SEULE COULEUR. Légende ET étiquette au
     bout de chaque ligne, plus une table de repli sous chaque figure.

   ③ UNE SEULE ÉCHELLE. Deux mesures de nature différente font deux figures,
     jamais deux axes sur un même dessin.

   ④ RIEN QUE CE QUI EST MESURÉ. Une figure ne paraît pas tant qu'elle n'a pas
     de quoi dire quelque chose : deux points ne font pas une tendance. */

/** Les quatre teintes des séries — voir ①. Ne pas les échanger contre celles de
    la Maison sans repasser le contrôle : elles ont été choisies pour être
    distinctes, pas pour être belles ensemble. */
const TEINTES = ['#3B4BA0', '#BE7526', '#4E86D9', '#008E7F'] as const;
const ENCRE_D = 'var(--ink-soft)';

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const moisCourt = (iso: string): string => {
  const [a, m] = iso.split('-');
  return `${MOIS[Number(m) - 1] ?? ''} ${(a ?? '').slice(2)}`;
};

type Serie = { nom: string; teinte: string; v: (number | null)[] };

/** LE CADRE COMMUN — marges, grille en retrait, survol. Écrit une fois : deux
    figures dessinées séparément finissent par ne plus se ressembler, et l'œil
    doit réapprendre à lire à chaque fois. */
function Figure(o: {
  titre: string;
  sous: string;
  jours: string[];
  series: Serie[];
  min: number;
  max: number;
  lignesY: number[];
  fmtY?: (n: number) => string;
  /** Une seconde ligne, en pointillé, qui sert de repère et non de série. */
  repere?: { nom: string; v: number[] };
  /** Le chiffre de chaque point, quand ils sont assez peu nombreux pour tenir. */
  etiquetterLesPoints?: boolean;
}) {
  const [surJour, setSurJour] = useState<number | null>(null);
  const L = 640;
  const H = 232;
  const m = { g: 42, d: 128, h: 14, b: 30 };
  const n = o.jours.length;
  const px = (i: number) => m.g + (i * (L - m.g - m.d)) / Math.max(1, n - 1);
  const py = (v: number) => m.h + (1 - (v - o.min) / Math.max(1, o.max - o.min)) * (H - m.h - m.b);
  const ligne = (v: (number | null)[]) => v
    .map((x, i) => (x === null ? null : `${px(i)},${py(x)}`))
    .filter(Boolean).join(' ');

  /* LES ÉTIQUETTES DE FIN S'ÉCARTENT quand deux séries terminent sur la même
     valeur : superposées, elles ne nomment plus personne. */
  const finDe = (s: Serie): number => {
    for (let i = s.v.length - 1; i >= 0; i -= 1) if (s.v[i] !== null) return s.v[i] as number;
    return o.min;
  };
  const placees: number[] = [];
  const yEtiquette = (s: Serie): number => {
    let y = py(finDe(s)) + 4;
    while (placees.some((p) => Math.abs(p - y) < 14)) y += 14;
    placees.push(y);
    return y;
  };

  return (
    <div style={{ border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', background: 'var(--surface-card)', padding: '14px 16px 10px', marginTop: 12 }}>
      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 19, color: 'var(--color-indigo)', lineHeight: 1.2 }}>{o.titre}</div>
      <div className="mnd-muted" style={{ fontSize: 11.5 }}>{o.sous}</div>

      {/* LA LÉGENDE EST TOUJOURS LÀ DÈS DEUX SÉRIES ; une seule se nomme dans
          le titre et n'a besoin de rien. */}
      {o.series.length > 1 && (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', margin: '10px 0 2px' }}>
          {o.series.map((s) => (
            <span key={s.nom} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--ink-soft)' }}>
              <i style={{ width: 10, height: 10, borderRadius: 2, background: s.teinte, display: 'inline-block' }} />
              {s.nom}
            </span>
          ))}
        </div>
      )}

      <div style={{ position: 'relative' }}>
        <svg viewBox={`0 0 ${L} ${H}`} style={{ display: 'block', width: '100%', height: 'auto' }}
          role="img" aria-label={`${o.titre}. ${o.sous}`}>
          {o.lignesY.map((v) => (
            <g key={v}>
              <line x1={m.g} y1={py(v)} x2={L - m.d} y2={py(v)} stroke="var(--hairline)" strokeWidth="1" />
              <text x={m.g - 8} y={py(v) + 3.5} fontSize="9.5" fill={ENCRE_D} textAnchor="end">
                {o.fmtY ? o.fmtY(v) : v}
              </text>
            </g>
          ))}
          {o.jours.map((j, i) => (
            <text key={j} x={px(i)} y={H - 9} fontSize="9.5" fill={ENCRE_D}
              textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>
              {moisCourt(j)}
            </text>
          ))}

          {/* LE REPÈRE PASSE DERRIÈRE ET EN POINTILLÉ : il n'est pas une série,
              il est ce à quoi on se compare. */}
          {o.repere && (
            <polyline points={o.repere.v.map((x, i) => `${px(i)},${py(x)}`).join(' ')}
              fill="none" stroke={ENCRE_D} strokeWidth="1.5" strokeDasharray="5 4" opacity=".5" />
          )}

          {o.series.map((s) => (
            <g key={s.nom}>
              <polyline points={ligne(s.v)} fill="none" stroke={s.teinte} strokeWidth="2" strokeLinejoin="round" />
              {s.v.map((x, i) => (x === null ? null : (
                /* L'ANNEAU DE SURFACE : deux séries qui se croisent au même
                   point se détachent quand même. */
                <circle key={`${s.nom}-${i}`} cx={px(i)} cy={py(x)} r={surJour === i ? 5.5 : 4}
                  fill={s.teinte} stroke="var(--surface-card)" strokeWidth="2" />
              )))}
            </g>
          ))}

          {/* L'ÉTIQUETTE AU BOUT DE LA LIGNE — voir ②. */}
          {o.series.map((s) => (
            <text key={`e-${s.nom}`} x={L - m.d + 9} y={yEtiquette(s)} fontSize="10.5" fill={ENCRE_D}>{s.nom}</text>
          ))}
          {o.repere && (
            <text x={L - m.d + 9} y={py(o.repere.v[o.repere.v.length - 1]) + 4} fontSize="10.5" fill={ENCRE_D}>
              {o.repere.nom}
            </text>
          )}

          {/* LE CHIFFRE SUR LE POINT quand ils sont peu : sur vingt points on
              n'étiquette que les bornes, sinon le dessin devient un tableau. */}
          {o.etiquetterLesPoints && o.series.length === 1 && o.series[0].v.map((x, i) => (x === null ? null : (
            <text key={`v-${i}`} x={px(i)} y={py(x) - 11} fontSize="10.5" fill="var(--color-indigo)" textAnchor="middle">{x}</text>
          )))}

          {/* LA CROIX DU SURVOL, et des cibles plus larges que les marques. */}
          {surJour !== null && (
            <line x1={px(surJour)} y1={m.h} x2={px(surJour)} y2={H - m.b} stroke="var(--color-indigo)" strokeWidth="1" opacity=".28" />
          )}
          {o.jours.map((j, i) => {
            const demi = (L - m.g - m.d) / Math.max(1, n - 1) / 2;
            return (
              <rect key={`z-${j}`} x={px(i) - demi} y={m.h} width={demi * 2} height={H - m.h - m.b}
                fill="transparent" style={{ cursor: 'crosshair' }}
                onMouseEnter={() => setSurJour(i)} onMouseLeave={() => setSurJour(null)} />
            );
          })}
        </svg>

        {surJour !== null && (
          <div style={{
            position: 'absolute', left: `${(px(surJour) / L) * 100}%`, top: 2, transform: 'translateX(-50%)',
            background: 'var(--color-indigo)', color: 'var(--color-ivoire)', borderRadius: 3,
            padding: '7px 10px', fontSize: 11, lineHeight: 1.5, whiteSpace: 'nowrap', pointerEvents: 'none',
            boxShadow: '0 6px 18px rgba(30,33,80,.22)', zIndex: 2,
          }}>
            <b>{moisCourt(o.jours[surJour])}</b>
            {o.series.map((s) => (
              <div key={s.nom}>
                <i style={{ width: 8, height: 8, borderRadius: 2, background: s.teinte, display: 'inline-block', marginRight: 6 }} />
                {s.nom} · <b>{s.v[surJour] ?? '—'}</b>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* LA TABLE DE REPLI — un dessin ne se lit pas au clavier, ni en noir et
          blanc, ni par qui ne distingue pas les teintes. */}
      <details style={{ marginTop: 8 }}>
        <summary style={{ fontSize: 11, color: 'var(--copper-700)', cursor: 'pointer' }}>Voir les chiffres</summary>
        <table style={{ borderCollapse: 'collapse', marginTop: 8, fontSize: 11.5, width: '100%' }}>
          <tbody>
            <tr>
              <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--ink-soft)', fontWeight: 500 }}>Relevé</th>
              {o.jours.map((j) => (
                <th key={j} style={{ textAlign: 'right', padding: '4px 8px', color: 'var(--ink-soft)', fontWeight: 500 }}>{moisCourt(j)}</th>
              ))}
            </tr>
            {o.series.map((s) => (
              <tr key={s.nom}>
                <td style={{ padding: '4px 8px', borderTop: '1px solid var(--hairline)' }}>{s.nom}</td>
                {s.v.map((x, i) => (
                  <td key={i} style={{ textAlign: 'right', padding: '4px 8px', borderTop: '1px solid var(--hairline)', fontVariantNumeric: 'tabular-nums' }}>
                    {x ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

/** ══ LES QUATRE JAUGES DANS LE TEMPS ═══════════════════════════════

    LES JAUGES DU DERNIER BILAN FONT LOI. Elles sont modifiables d'un bilan à
    l'autre ; prendre l'union de toutes ferait paraître des séries mortes, et
    prendre les plus anciennes montrerait ce que la Maison ne note plus. On suit
    donc celles d'aujourd'hui, à travers les bilans passés — absentes d'un
    ancien bilan, elles y font un trou, et un trou est plus honnête qu'un zéro.

    QUATRE AU PLUS : la palette en porte quatre, et une cinquième teinte
    inventée serait la première à devenir illisible. */
export function CourbeDesJauges({ bilans }: { bilans: readonly Bilan[] }) {
  const tries = [...bilans].sort((a, b) => a.date.localeCompare(b.date));
  if (tries.length < 2) return null;
  const noms = (tries[tries.length - 1].jauges ?? []).map((j) => j.nom).slice(0, 4);
  if (noms.length === 0) return null;
  const series: Serie[] = noms.map((nom, i) => ({
    nom,
    teinte: TEINTES[i],
    v: tries.map((b) => b.jauges.find((j) => j.nom === nom)?.valeur ?? null),
  }));
  return (
    <Figure
      titre="Ce que la Maison observe, séance après séance"
      sous={`Noté de 1 à 5 à chaque bilan · ${tries.length} bilans`}
      jours={tries.map((b) => b.date)}
      series={series}
      min={1}
      max={5}
      lignesY={[1, 2, 3, 4, 5]}
    />
  );
}

/** ══ LA POUSSE, ENTRE DEUX RESSERRAGES ═════════════════════════════

    LE REPÈRE FAIT L'ÉVALUATION. Une courbe seule dit « elle a poussé » ;
    au-dessus d'un centimètre par mois, elle dit « la Maison fait mieux que la
    nature », et c'est cela qui se raconte à une cliente. En dessous, il y a une
    conversation à avoir — ce qui vaut mieux que de l'apprendre trop tard.

    DEUX MESURES NE FONT PAS UNE PENTE : la figure attend le troisième relevé. */
export const POUSSE_NATURELLE_CM_PAR_MOIS = 1;

export function CourbeDeLaPousse({ serie }: { serie: readonly ComptageLu[] }) {
  const mesures = [...serie]
    .filter((c) => !!c.iso && (c.longueurCm ?? 0) > 0)
    .sort((a, b) => a.iso.localeCompare(b.iso));
  if (mesures.length < 3) return null;
  const depart = new Date(`${mesures[0].iso}T00:00:00`).getTime();
  const repere = mesures.map((c) => {
    const mois = (new Date(`${c.iso}T00:00:00`).getTime() - depart) / (1000 * 60 * 60 * 24 * 30.4);
    return Math.round(((mesures[0].longueurCm as number) + mois * POUSSE_NATURELLE_CM_PAR_MOIS) * 10) / 10;
  });
  const v = mesures.map((c) => c.longueurCm as number);
  const bas = Math.floor(Math.min(...v, ...repere)) - 1;
  const haut = Math.ceil(Math.max(...v, ...repere)) + 1;
  const pas = Math.max(1, Math.round((haut - bas) / 4));
  const lignesY: number[] = [];
  for (let y = bas; y <= haut; y += pas) lignesY.push(y);
  return (
    <Figure
      titre="La pousse d'une mèche témoin"
      sous={`Mesurée au resserrage · ${mesures.length} relevés`}
      jours={mesures.map((c) => c.iso)}
      series={[{ nom: 'Sa pousse', teinte: TEINTES[3], v }]}
      repere={{ nom: `Repère · ${POUSSE_NATURELLE_CM_PAR_MOIS} cm/mois`, v: repere }}
      min={bas}
      max={haut}
      lignesY={lignesY}
      fmtY={(n) => `${n} cm`}
      etiquetterLesPoints
    />
  );
}
