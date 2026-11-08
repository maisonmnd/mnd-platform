import { usePiecesDeLaMaison } from '../../../../shared/essai';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHead } from '../_ui';
import { Card } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { useTips } from '../../../../shared/tips';
import { useInvoices } from '../../../../shared/finance';
import { useStaff, ordonneEquipe } from './data';
import { useVoitLesPourboiresDeLEquipe } from './MesPourboires';
import {
  FICHE_RETIREE, detailDuMembre, filDesPourboires, partDite, partsDeLaMaison, payesLeDit, periodeCourte, periodeDesPourboires, periodeDite, periodeTitre, pourboiresDuDit,
  serieMoisParMois, tableauDeLEquipe, taPartDite, type MoisDeLaSerie,
} from '../../../../shared/pourboires-de-l-equipe-pur';
import './pourboires.css';

/* ══ ÉQUIPE › LES POURBOIRES — 5 novembre 2026 ══════════════════════════════
   « Je veux voir le tableau clair des pourboires des employés. Ils ont besoin
   de savoir combien ils gagnent au fur et à mesure, donc je veux voir
   l'évolution. C'est quelque part dans l'encaissement, et ce n'est pas facile
   à voir » (Yéman, 4 novembre 2026). Maquette 2e4ZNFxyREv6mxG4vakuh5,
   écrans 1 à 3 : le tableau de l'équipe, les barres mois par mois, le fil.

   LA DIRECTION SEULE (choix du 4 novembre 2026) : la garde de la barre
   (`ROUTES_DIRECTION`) et celle de l'écran (`useEstDirection`). La base lit
   les parts pour tout le personnel depuis toujours (0008) : chacun voit déjà
   SA part dans Mon mois, et le nom entier des clientes reste ici.

   La Caisse et Finances › Encaissements y mènent d'un lien. La règle vit dans
   shared/pourboires-de-l-equipe-pur.ts. */

const aujourdhuiIci = (): string => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

const FIL_COURT = 20;

const auToucher = (fn: () => void) => (e: KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
};

/** LES BARRES MOIS PAR MOIS. Une seule série, le total de l'équipe : pas de
    légende, chaque barre porte son chiffre ; le mois en cours se dit « en
    cours » et se dessine clair, cerné du même cuivre. Un toucher sur une
    barre ouvre les pourboires de ce mois.
    DESSINÉES À LA LARGEUR RÉELLE : réduit à l'échelle, le dessin de 640 de
    large tombait à 6 px de texte sur un téléphone ; on mesure le cadre, et
    sous 520 px les mois se disent en court (« sept. »). */
function BarresDuMois({ serie, choisi, onChoisis, argent, jourDuMoisEnCours }: {
  serie: MoisDeLaSerie[];
  choisi: string | null;
  onChoisis: (m: string) => void;
  argent: (n: number) => string;
  jourDuMoisEnCours: number;
}) {
  const cadre = useRef<HTMLDivElement | null>(null);
  const [L, setL] = useState(640);
  useEffect(() => {
    const el = cadre.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const o = new ResizeObserver(([e]) => setL(Math.max(300, Math.round(e.contentRect.width))));
    o.observe(el);
    return () => o.disconnect();
  }, []);
  const H = 236;
  const base = 186;
  const haut = 40;
  const n = serie.length;
  const pas = (L - 40) / Math.max(1, n);
  const large = Math.min(90, pas * 0.62);
  const max = Math.max(1, ...serie.map((s) => s.total));
  const court = n > 6 || L < 520 || pas < 96;
  const etiquette = (s: MoisDeLaSerie, i: number): string => {
    const nom = court ? periodeCourte(s.mois) : periodeTitre(s.mois);
    const avecAnnee = i === 0 || s.mois.endsWith('-01');
    return `${nom}${avecAnnee ? ` ${s.mois.slice(0, 4)}` : ''}${s.enCours && !court ? ` (au ${jourDuMoisEnCours})` : ''}`;
  };
  return (
    <div ref={cadre} className="tpp-barres__cadre">
    <svg viewBox={`0 0 ${L} ${H}`} width={L} height={H} role="group" aria-label="Les pourboires de l’équipe, période par période" className="tpp-barres">
      <line className="tpp-barres__axe" x1={20} y1={base} x2={L - 20} y2={base} />
      {serie.map((s, i) => {
        const h = s.total > 0 ? Math.max(2, ((base - haut) * s.total) / max) : 0;
        const x = 20 + pas * i + (pas - large) / 2;
        const y = base - h;
        const r = Math.min(4, h, large / 2);
        const d = h > 0 ? `M${x},${base} V${y + r} Q${x},${y} ${x + r},${y} H${x + large - r} Q${x + large},${y} ${x + large},${y + r} V${base} Z` : '';
        const dit = `${pourboiresDuDit(s.mois)}${s.enCours ? `, en cours (au ${jourDuMoisEnCours})` : ''} : ${argent(s.total)}, ${s.nbPourboires} pourboire${s.nbPourboires > 1 ? 's' : ''}`;
        return (
          <g
            key={s.mois}
            role="button"
            tabIndex={0}
            aria-label={dit}
            aria-pressed={choisi === s.mois}
            className={`tpp-barres__mois${s.enCours ? ' is-en-cours' : ''}${choisi === s.mois ? ' is-choisi' : ''}`}
            data-mois={s.mois}
            onClick={() => onChoisis(s.mois)}
            onKeyDown={auToucher(() => onChoisis(s.mois))}
          >
            <title>{dit}</title>
            <rect className="tpp-barres__cible" x={20 + pas * i} y={haut - 30} width={pas} height={H - haut + 30} />
            {d && <path className="tpp-barres__barre" d={d} />}
            <text className="tpp-barres__val" x={x + large / 2} y={y - 8} textAnchor="middle">{argent(s.total)}</text>
            <text className="tpp-barres__nom" x={x + large / 2} y={base + 20} textAnchor="middle">{etiquette(s, i)}</text>
            {s.enCours && <text className="tpp-barres__note" x={x + large / 2} y={base + 36} textAnchor="middle">en cours</text>}
          </g>
        );
      })}
    </svg>
    </div>
  );
}

export default function Pourboires() {
  const direction = useVoitLesPourboiresDeLEquipe();
  const navigate = useNavigate();
  const { branch, currency } = useBranch();
  const [team] = useStaff();
  const [tips] = useTips();
  const [invoices] = usePiecesDeLaMaison();
  const [membreOuvert, setMembreOuvert] = useState<string | null>(null);
  const [moisChoisi, setMoisChoisi] = useState<string | null>(null);
  const [filEntier, setFilEntier] = useState(false);
  const aujourdhui = aujourdhuiIci();
  const argent = (n: number) => fmtMoney(n, currency);

  const equipe = useMemo(() => ordonneEquipe(team.filter((m) => m.branchId === branch.id)), [team, branch.id]);
  const parts = useMemo(() => partsDeLaMaison(tips, equipe, team), [tips, equipe, team]);
  const tableau = useMemo(() => tableauDeLEquipe(parts, equipe, aujourdhui), [parts, equipe, aujourdhui]);
  const serie = useMemo(() => serieMoisParMois(parts, aujourdhui), [parts, aujourdhui]);
  const fil = useMemo(
    () => filDesPourboires(parts, equipe, invoices, { ...(moisChoisi ? { mois: moisChoisi } : {}), argent: (n) => fmtMoney(n, currency) }),
    [parts, equipe, invoices, moisChoisi, currency],
  );
  const detail = useMemo(() => (membreOuvert ? detailDuMembre(parts, membreOuvert, aujourdhui) : null), [parts, membreOuvert, aujourdhui]);

  if (!direction) {
    return (
      <>
        <PageHead eyebrow="Équipe" title="Les pourboires." />
        <Card style={{ padding: '18px 20px' }}>
          <div className="tre-rates__title">Le tableau de l’équipe est réservé à la direction</div>
          <p className="mnd-muted" style={{ fontSize: 13, marginTop: 8, maxWidth: '62ch' }}>
            Ta part de chaque pourboire, aujourd’hui, cette semaine et ce mois, se lit en tête de Mon mois.
          </p>
          <button type="button" className="tre-link-btn" style={{ marginTop: 10 }} onClick={() => navigate('/mon-mois')}>Ouvrir Mon mois ›</button>
        </Card>
      </>
    );
  }

  const jourDuMois = Number(aujourdhui.slice(8, 10));
  const premier = tableau.premierMois;
  const choisisLeMois = (m: string) => { setMoisChoisi((x) => (x === m ? null : m)); setFilEntier(false); };
  const ouvreLeMembre = (id: string) => setMembreOuvert((x) => (x === id ? null : id));
  const filMontre = filEntier || moisChoisi ? fil : fil.slice(0, FIL_COURT);
  const membreDuDetail = membreOuvert ? equipe.find((m) => m.id === membreOuvert) : undefined;
  const nomDuDetail = membreDuDetail?.name ?? '';

  return (
    <div className="tpp" data-pourboires="equipe">
      <PageHead
        eyebrow="Équipe"
        title="Les pourboires."
        sub="Ce que chacun a reçu aujourd’hui, ce mois et les mois d’avant, au fur et à mesure des encaissements."
        actions={<button type="button" className="tre-link-btn" onClick={() => navigate('/encaissements')}>Le registre des encaissements ›</button>}
      />

      {/* ── 1. LE TABLEAU DE L'ÉQUIPE ─────────────────────────────────── */}
      <section className="tpp-section" aria-labelledby="tpp-t-tableau">
        <h3 id="tpp-t-tableau" className="tpp-h">Le tableau de l’équipe</h3>
        <div className="tpp-tableau mnd-scroll-x">
          <table className="tre-table" data-pourboires="tableau">
            <thead>
              <tr>
                <th>Membre</th>
                <th className="num">Part</th>
                <th className="num">Aujourd’hui</th>
                {tableau.colonnes.map((c) => (
                  <th key={c} className="num">
                    <button
                      type="button"
                      className={`tpp-mois${moisChoisi === c ? ' is-choisi' : ''}`}
                      aria-pressed={moisChoisi === c}
                      onClick={() => choisisLeMois(c)}
                      data-mois={c}
                    >{periodeTitre(c)}</button>
                  </th>
                ))}
                <th className="num">{premier ? `Depuis le ${periodeCourte(premier)} ${premier.slice(0, 4)}` : 'Depuis le début'}</th>
              </tr>
            </thead>
            <tbody>
              {tableau.lignes.map((l) => (
                <tr key={l.id} className={membreOuvert === l.id ? 'is-ouvert' : undefined}>
                  <td>
                    {l.id === FICHE_RETIREE ? <span className="mnd-muted">{l.nom}</span> : (
                      <button
                        type="button"
                        className="tpp-nom"
                        aria-expanded={membreOuvert === l.id}
                        onClick={() => ouvreLeMembre(l.id)}
                        data-membre={l.id}
                      >{l.nom}</button>
                    )}
                  </td>
                  <td className="num">{l.id === FICHE_RETIREE ? '' : partDite(l.part)}</td>
                  <td className="num">{argent(l.aujourdhui)}</td>
                  {l.parMois.map((v, i) => <td key={tableau.colonnes[i]} className="num">{argent(v)}</td>)}
                  <td className="num">{argent(l.depuisLeDebut)}</td>
                </tr>
              ))}
              {tableau.sansPart.length > 0 && (
                <tr className="tpp-sans" data-pourboires="sans-part">
                  <td>{tableau.sansPart.map((m) => m.nom.split(/\s+/)[0]).join(', ')}</td>
                  <td className="num">0</td>
                  <td colSpan={tableau.colonnes.length + 2}>
                    Pas de part : à régler dans{' '}
                    <button type="button" className="tre-link-btn" onClick={() => navigate('/personnel')}>Ressources humaines</button>
                    {' '}si cela doit changer.
                  </td>
                </tr>
              )}
              <tr className="tpp-total" data-pourboires="total">
                <td>L’équipe</td>
                <td className="num">{partDite(tableau.total.part)}</td>
                <td className="num">{argent(tableau.total.aujourdhui)}</td>
                {tableau.total.parMois.map((v, i) => <td key={tableau.colonnes[i]} className="num">{argent(v)}</td>)}
                <td className="num">{argent(tableau.total.depuisLeDebut)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="tpp-doux">Un toucher sur un nom ouvre son détail ; un toucher sur une période, les pourboires de cette période.</p>

        {/* LE DÉTAIL D'UN MEMBRE : un panneau ouvert à la fois. */}
        {detail && membreOuvert && (
          <div className="tpp-detail" data-pourboires="detail" aria-live="polite">
            <div className="tpp-detail__tete">
              <h4>{nomDuDetail}</h4>
              {membreDuDetail && <span className="tpp-doux">Sa part : {taPartDite(membreDuDetail.partPourboire)}.</span>}
              <button type="button" className="tre-link-btn" onClick={() => setMembreOuvert(null)}>Fermer</button>
            </div>
            <div className="tpp-detail__chiffres">
              <p><b>{argent(detail.totaux.aujourdhui)}</b><span>Aujourd’hui</span></p>
              <p><b>{argent(detail.totaux.semaine)}</b><span>Cette semaine</span></p>
              <p><b>{argent(detail.totaux.mois)}</b><span>{pourboiresDuDit(periodeDesPourboires(aujourdhui))}</span></p>
              <p><b>{argent(detail.totaux.depuisLeDebut)}</b><span>Depuis le début</span></p>
            </div>
            <p className="tpp-doux">
              Période par période : {detail.serie.map((s) => `${periodeTitre(s.mois)} ${argent(s.total)}`).join(' · ')}.
            </p>
            <ul className="tpp-detail__liste">
              {detail.lignes.slice(0, 40).map((l) => (
                <li key={l.id}><span>{l.jourDit}{l.cliente ? ` · ${l.cliente}` : ''}</span><b>{argent(l.amountXof)}</b></li>
              ))}
            </ul>
            {detail.lignes.length > 40 && <p className="tpp-doux">Les 40 plus récents sur {detail.lignes.length}.</p>}
          </div>
        )}
      </section>

      {/* ── 2. L'ÉVOLUTION ────────────────────────────────────────────── */}
      <section className="tpp-section" aria-labelledby="tpp-t-evolution">
        <h3 id="tpp-t-evolution" className="tpp-h">Période par période, pour toute l’équipe</h3>
        <div className="tpp-graphe" data-pourboires="barres">
          <BarresDuMois serie={serie} choisi={moisChoisi} onChoisis={choisisLeMois} argent={argent} jourDuMoisEnCours={jourDuMois} />
          <p className="tpp-doux">
            Le tableau montre ce qui a été encaissé : un pourboire donné de la main à la main, sans passer par
            la Caisse, n’y est pas.
          </p>
        </div>
      </section>

      {/* ── 3. LE FIL ─────────────────────────────────────────────────── */}
      <section className="tpp-section" aria-labelledby="tpp-t-fil">
        <div className="tpp-fil__tete">
          <h3 id="tpp-t-fil" className="tpp-h">
            {moisChoisi ? `${pourboiresDuDit(moisChoisi)}, ${payesLeDit(moisChoisi)}` : 'Chaque pourboire, et son partage'}
          </h3>
          {moisChoisi && <button type="button" className="tre-link-btn" onClick={() => setMoisChoisi(null)}>Toutes les périodes</button>}
        </div>
        {fil.length === 0 ? (
          <p className="tpp-doux">Aucun pourboire inscrit{moisChoisi ? ` ${periodeDite(moisChoisi)}` : ''}.</p>
        ) : (
          <div className="tpp-fil" data-pourboires="fil">
            {filMontre.map((p) => (
              <div key={p.cle} className="tpp-fil__ligne" data-piece={p.numero ?? ''}>
                <span className="tpp-fil__jour num">{p.jourDit}</span>
                {/* Une part liée à une pièce pas encore arrivée sur ce poste ne
                    se dit pas « sans pièce » : seules les parts d'avant le
                    19 août 2026 le sont. */}
                <span className="tpp-fil__qui">{p.cliente || 'Cliente non notée'}{p.numero ? ` · ${p.numero}` : p.invoiceId ? '' : ' · sans pièce'}</span>
                <span className="tpp-fil__x num">{argent(p.montant)}</span>
                <span className="tpp-fil__parts">{p.partageDit}</span>
              </div>
            ))}
          </div>
        )}
        {!moisChoisi && fil.length > FIL_COURT && (
          <button type="button" className="tre-link-btn" onClick={() => setFilEntier((v) => !v)}>
            {filEntier ? 'Les plus récents seulement' : `Voir les ${fil.length} pourboires`}
          </button>
        )}
      </section>
    </div>
  );
}
