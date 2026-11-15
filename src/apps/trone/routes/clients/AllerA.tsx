import { useEffect, useRef, useState } from 'react';
import {
  dateCourte, dateDite, distanceDite, lisLeSaut, sautsRapides, titreDeLaSemaine, type SemaineDuFil,
} from './aller-a-pur';
import { dansNSemaines, SEMAINES_DE_LA_SUITE, semaineDuRythme } from '../../../../shared/rendez-vous-suggere-pur';
import './aller-a.css';

/* ══ ALLER À, ET LE FIL DES SEMAINES — 14 novembre 2026 ════════════════
   La barre et le fil de la maquette « Dans trois semaines »
   (`public/maquette-dans-trois-semaines.html`), les mêmes dans le Calendrier
   et dans le « + RDV ». La règle vit dans `aller-a-pur.ts`. */

const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** ALLER À : on tape ce qu'elle dit, ou on touche un saut. Entrée y va. */
export function BarreDeSaut({
  id, aujourdhui, choisi, onSaut, saDate, apresSaVenue, autoFocus,
}: {
  /** L'identifiant du champ : deux barres peuvent vivre sur le même écran. */
  id: string;
  aujourdhui: string;
  /** Le jour montré : sa touche paraît enfoncée. */
  choisi?: string | null;
  onSaut: (iso: string) => void;
  /** Sa date à elle, en cuivre : la reprise que lit sa fiche. */
  saDate?: { iso: string; pourquoi: string } | null;
  /** LES SEMAINES DEPUIS SA VENUE (15 novembre 2026, le rendez-vous suggéré,
      arbitrage D) : 3, 4, 5, 6, 8 et 12 semaines après sa dernière venue,
      son rythme marqué. Une AUTRE BASE que les sauts « +3 sem » (depuis
      aujourd'hui) : leur rangée le dit en toutes lettres. */
  apresSaVenue?: { iso: string; rythmeJours?: number | null } | null;
  autoFocus?: boolean;
}) {
  const [texte, setTexte] = useState('');
  const ecrit = texte.trim();
  const lu = ecrit ? lisLeSaut(ecrit, aujourdhui) : null;
  const va = (iso: string) => { setTexte(''); onSaut(iso); };
  return (
    <div className="tr-saut">
      <label className="tr-saut__etiquette" htmlFor={id}>Aller à</label>
      <div className="tr-saut__ligne">
        <input
          id={id}
          type="text"
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          onKeyDown={(e) => {
            /* Entrée va au jour, et ne soumet jamais la fenêtre qui l'entoure. */
            if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (lu) va(lu.iso); }
          }}
          placeholder="dans 3 semaines, samedi en huit, 12/12, fin janvier"
          autoComplete="off"
          enterKeyHint="go"
          autoFocus={autoFocus}
        />
        <button type="button" className="mnd-btn mnd-btn--sm mnd-btn--ghost" disabled={!lu} onClick={() => lu && va(lu.iso)}>
          Y aller
        </button>
      </div>
      <p className={`tr-saut__lecture${ecrit && !lu ? ' is-ko' : ''}`} aria-live="polite">
        {!ecrit
          ? 'Tapez ce qu’elle dit, puis Entrée. Ou touchez un saut.'
          : lu
            ? (
              <>
                <b>{majuscule(dateDite(lu.iso))}</b>
                {' · '}
                <span className="tr-saut__dist">{distanceDite(lu.iso, aujourdhui)}</span>
                {' · Entrée pour y aller'}
                {lu.avertit && <span className="tr-saut__avert">{lu.avertit}</span>}
              </>
            )
            : `Je ne lis pas « ${ecrit} ». Essayez : 3 sem, samedi en huit, 12/12, fin janvier.`}
      </p>
      <div className="tr-saut__puces" role="group" aria-label="Sauts depuis aujourd’hui">
        {sautsRapides(aujourdhui).map((s) => (
          <button
            key={s.libelle}
            type="button"
            className="tr-saut__puce"
            aria-pressed={choisi === s.iso}
            title={`${majuscule(dateDite(s.iso))}, ${distanceDite(s.iso, aujourdhui)}`}
            onClick={() => va(s.iso)}
          >
            {s.libelle}
          </button>
        ))}
        {saDate && (
          <button
            type="button"
            className="tr-saut__puce tr-saut__puce--sienne"
            aria-pressed={choisi === saDate.iso}
            title={`${majuscule(dateDite(saDate.iso))}, ${distanceDite(saDate.iso, aujourdhui)}. ${saDate.pourquoi}`}
            onClick={() => va(saDate.iso)}
          >
            Sa date · {dateCourte(saDate.iso)}
          </button>
        )}
      </div>
      {apresSaVenue && (() => {
        const rythme = semaineDuRythme(apresSaVenue.rythmeJours ?? null);
        const touches = SEMAINES_DE_LA_SUITE
          .map((n) => ({ n, iso: dansNSemaines(apresSaVenue.iso, n) }))
          .filter((t) => t.iso > aujourdhui);
        if (touches.length === 0) return null;
        return (
          <div className="tr-saut__puces tr-saut__puces--venue" role="group" aria-label={`Depuis sa dernière venue, le ${dateDite(apresSaVenue.iso)}`}>
            <span className="tr-saut__base">{`Après sa venue du ${dateCourte(apresSaVenue.iso)}`}</span>
            {touches.map((t) => (
              <button
                key={t.n}
                type="button"
                className={`tr-saut__puce tr-saut__puce--venue${t.n === rythme ? ' est-rythme' : ''}`}
                aria-pressed={choisi === t.iso}
                data-semaines={t.n}
                title={`${t.n} semaines après sa venue du ${dateDite(apresSaVenue.iso)} : ${dateDite(t.iso)}, ${distanceDite(t.iso, aujourdhui)}${t.n === rythme ? '. Son rythme.' : ''}`}
                onClick={() => va(t.iso)}
              >
                {`${t.n} sem après${t.n === rythme ? ' · son rythme' : ''}`}
              </button>
            ))}
          </div>
        );
      })()}
    </div>
  );
}

/** LE FIL : les semaines d'un regard, le remplissage, les fêtes, sa date.
    Toucher une semaine l'ouvre ; la semaine montrée vient au milieu. */
export function FilDesSemaines({
  semaines, choisie, onChoisir, aujourdhui,
}: {
  semaines: SemaineDuFil[];
  /** Le lundi de la semaine montrée. */
  choisie: string;
  onChoisir: (lundi: string) => void;
  aujourdhui: string;
}) {
  const cadre = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const c = cadre.current;
    const el = c?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!c || !el) return;
    const doux = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    c.scrollTo({ left: el.offsetLeft - c.clientWidth / 2 + el.clientWidth / 2, behavior: doux ? 'smooth' : 'auto' });
  }, [choisie, semaines.length]);
  const avecRemplissage = semaines.some((s) => s.remplissage !== null);
  return (
    <div className="tr-fil">
      <div className="tr-fil__tete">
        <span className="tr-fil__titre">Le fil · {semaines.length} semaines depuis aujourd’hui</span>
        <span className="tr-fil__legende">
          {avecRemplissage && <span><i className="is-pris" />fauteuils pris</span>}
          {avecRemplissage && <span><i className="is-plein" />presque plein</span>}
          {semaines.some((s) => s.sienne) && <span><i className="is-sienne" />sa date</span>}
        </span>
      </div>
      <div className="tr-fil__cadre" ref={cadre}>
        <div className="tr-fil__rang" role="group" aria-label="Les semaines à venir">
          {semaines.map((s) => (
            <button
              key={s.lundi}
              type="button"
              className="tr-fil__sem"
              aria-pressed={s.lundi === choisie}
              title={titreDeLaSemaine(s, aujourdhui)}
              aria-label={titreDeLaSemaine(s, aujourdhui)}
              onClick={() => onChoisir(s.lundi)}
            >
              <span className="tr-fil__mois">{s.mois ?? ''}</span>
              <span className={`tr-fil__barre${s.rang === 0 ? ' is-auj' : ''}`}>
                {s.remplissage !== null && (
                  <i className={s.presquePlein ? 'is-plein' : ''} style={{ height: `${Math.round(s.remplissage * 100)}%` }} />
                )}
              </span>
              <span className="tr-fil__date">{Number(s.lundi.slice(8, 10))}</span>
              <span className="tr-fil__n">{s.rang === 0 ? 'cette sem.' : `S+${s.rang}`}</span>
              <span className="tr-fil__libres">{s.libres} pl.</span>
              <span className={`tr-fil__note${s.sienne ? ' is-sienne' : ''}`}>{s.sienne ? 'sa date' : (s.note ?? ' ')}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
