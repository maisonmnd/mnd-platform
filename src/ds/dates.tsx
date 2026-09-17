import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays } from 'lucide-react';
import {
  grilleDuMois, moisVoisin, retardEnJours, correctionsPossibles, horsBornes,
  jourAn, jourCourtAn, jourEnLettres, litLaDate, type SensDeLaDate,
} from '../shared/calendrier';

/* ══ LES CHAMPS DE DATE DE LA MAISON — jour · mois · année ══════════════

   « Sur la page de RDV et d'encaissement que les dates soient toujours réglées
   sur la date des francophones : jour, mois, année. Même chose pour les dates
   d'anniversaire sur le profil des clients. Quel que soit le service,
   respecter le même format » (Yéman, 13 septembre 2026).

   LE CHAMP NATIF N'OBÉIT PAS À LA MAISON. `<input type="date">` s'écrit dans
   la langue du NAVIGATEUR : sous un Edge anglais, « 09/13/2026 ». Soixante-
   dix-sept champs du Trône, et ceux du Certificat, du Bilan et de Ma Couronne,
   tendaient ce piège. Ils passent tous par ici.

   ── L'HISTOIRE DU CHAMP (5 et 12 septembre 2026) ──
   « Sélectionner une date depuis le calendrier n'est pas facile. Ouverture du
   calendrier et les années à choisir sont à revisiter » (Yéman).

   ON TAPE LA DATE, ON NE LA CHERCHE PAS. Et on la tape comme on la lit dans un
   cahier : « 14/02 », « 14-02-25 », « 14 février », « 14 févr. 2025 ». C'est le
   MÊME lecteur que la saisie en série (`litUneLigne`, éprouvé par
   `verifie-serie`) : une seule écriture à apprendre pour toute la Maison.

   ET ON RELIT CE QU'ON A ÉCRIT, en toutes lettres, avec SON JOUR DE LA
   SEMAINE : si le cahier dit samedi et l'écran vendredi, l'erreur saute aux
   yeux avant d'être écrite.

   L'ANNÉE NE SE DEVINE JAMAIS. Quand elle n'est pas tapée, les années
   possibles s'offrent, et la Maison clique.

   LE CALENDRIER RESTE, replié : semaine commençant le lundi, jours de
   fermeture barrés, ouvert sur le mois de la date en cours. */

const aujourdhuiISO = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/* LA PLACE ET L'ENCRE NE VONT PAS AU MÊME ENDROIT. Les champs natifs portaient
   tout dans un seul `style` : une largeur de 138 px et une police de 12 px. Le
   champ compact enveloppe l'entrée pour y poser son bouton de calendrier ; la
   largeur va donc à l'enveloppe, la police et le rembourrage à l'entrée. */
const CLES_DE_PLACE = new Set([
  'width', 'minWidth', 'maxWidth', 'flex', 'flexGrow', 'flexShrink', 'flexBasis', 'alignSelf',
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'gridColumn',
]);
const partageLeStyle = (style?: CSSProperties): { place: CSSProperties; encre: CSSProperties } => {
  const place: Record<string, unknown> = {};
  const encre: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(style ?? {})) (CLES_DE_PLACE.has(k) ? place : encre)[k] = v;
  return { place: place as CSSProperties, encre: encre as CSSProperties };
};

export type ChampDeDateProps = {
  /** La date en ISO, ou '' quand rien n'est encore posé. */
  value: string;
  onChange: (iso: string) => void;
  /** L'année qu'on suppose quand elle n'est pas tapée. Défaut : cette année. */
  anneeParDefaut?: number;
  ariaLabel?: string;
  autoFocus?: boolean;
  /** UN RENDEZ-VOUS REGARDE DEVANT, UN ANNIVERSAIRE DERRIÈRE. Le champ ne peut
      pas le deviner, et la liste d'années qu'il offre n'a de sens que dans un
      sens. */
  sens?: SensDeLaDate;
  /** Les jours où la Maison est fermée, lundi = 0. Barrés au calendrier. */
  joursFermes?: readonly number[];
  /** Les bornes que le champ natif tenait : une naissance ne tombe pas demain,
      une reprogrammation pas hier. Hors bornes, la date se relit en rouge et
      ne s'écrit pas. */
  min?: string;
  max?: string;
  /** L'ALERTE « CE JOUR EST PASSÉ » ne concerne que les rendez-vous. Elle
      était liée au sens « avant », et parlait donc aussi dans la saisie d'une
      année passée, où une date ancienne est justement ce qu'on vient écrire. */
  alertePasse?: boolean;
  /** UNE LIGNE, POUR LES ÉCRANS SERRÉS. La relecture, les années et le
      calendrier s'ouvrent sous le champ tant qu'il a la main, puis se replient :
      une ligne de versements ou une échéance de tableau ne peut pas porter une
      relecture de vingt-deux pixels. */
  compact?: boolean;
  style?: CSSProperties;
  className?: string;
  title?: string;
  disabled?: boolean;
  id?: string;
};

export function ChampDeDate({
  value,
  onChange,
  anneeParDefaut,
  ariaLabel = 'La date',
  autoFocus = false,
  sens = 'avant',
  joursFermes,
  min,
  max,
  alertePasse = false,
  compact = false,
  style,
  className,
  title,
  disabled,
  id,
}: ChampDeDateProps) {
  const auj = aujourdhuiISO();
  const anneeCourante = Number(auj.slice(0, 4));
  const [annee, setAnnee] = useState(anneeParDefaut ?? anneeCourante);
  /* La frappe vit à part de la valeur : une date à moitié tapée n'est pas une
     date, et l'effacer sous les doigts pour « corriger » serait insupportable. */
  const [saisie, setSaisie] = useState('');
  const [calendrier, setCalendrier] = useState(false);
  const [aLaMain, setALaMain] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; dessus: boolean } | null>(null);
  /* Ce que le champ a lui-même émis, pour reconnaître une valeur venue du
     dehors et se resynchroniser sans écraser une frappe en cours. */
  const emis = useRef<string | null>(null);
  const champ = useRef<HTMLInputElement>(null);

  const enForme = (v: string) => (v ? (jourAn(v) === '—' ? v : jourAn(v)) : '');

  useEffect(() => { setAnnee(anneeParDefaut ?? anneeCourante); }, [anneeParDefaut, anneeCourante]);
  useEffect(() => {
    if (value === emis.current) return;
    emis.current = value;
    setSaisie(enForme(value));
  }, [value]);

  const lecture = litLaDate(saisie, { annee, aujourdhui: auj, sens, min, max });
  const iso = lecture.iso;
  const retenue = iso && !lecture.horsBornes ? iso : undefined;

  const emet = (nouveau: string) => { emis.current = nouveau; onChange(nouveau); };

  const pose = (texte: string, an = annee) => {
    setSaisie(texte);
    if (texte.trim() === '') { if (value !== '') emet(''); return; }
    const l = litLaDate(texte, { annee: an, aujourdhui: auj, sens, min, max });
    if (l.iso && !l.horsBornes && l.iso !== value) emet(l.iso);
  };

  const poseISO = (nouveau: string) => {
    if (horsBornes(nouveau, min, max)) return;
    setSaisie(jourAn(nouveau));
    if (nouveau !== value) emet(nouveau);
  };

  /* ── CE QUI EST DERRIÈRE NOUS ────────────────────────────────────
     Rien ne prévenait : le rendez-vous se créait, disparaissait du carnet du
     jour, et personne ne le voyait avant que la cliente se présente. */
  const retard = alertePasse && retenue ? retardEnJours(retenue, auj) : 0;
  const corrections = retard > 0 && retenue
    ? correctionsPossibles(retenue, auj).filter((c) => !horsBornes(c, min, max))
    : [];

  /* ── LE CALENDRIER ───────────────────────────────────────────────
     Il s'ouvre sur le mois de la date en cours, jamais sur aujourd'hui. */
  const ancre = retenue || (/^\d{4}-\d{2}/.test(value) ? value : '') || auj;
  const [moisVu, setMoisVu] = useState(() => ({
    annee: Number(ancre.slice(0, 4)), mois: Number(ancre.slice(5, 7)),
  }));
  useEffect(() => {
    if (!calendrier) return;
    setMoisVu({ annee: Number(ancre.slice(0, 4)), mois: Number(ancre.slice(5, 7)) });
  }, [calendrier]);

  /* LE VOLET DU CHAMP COMPACT SE POSE AU-DESSUS DE TOUT. Il vit hors de la
     modale (portail) : une modale qui défile, un tableau qui masque son
     débordement l'auraient coupé en deux. Il suit le champ quand on défile,
     et passe au-dessus quand la place manque dessous. */
  useLayoutEffect(() => {
    if (!compact || !aLaMain) { setPos((p) => (p ? null : p)); return; }
    const place = () => {
      const r = champ.current?.getBoundingClientRect();
      if (!r) return;
      const besoin = calendrier ? 380 : 160;
      const dessous = window.innerHeight - r.bottom;
      const dessus = dessous < besoin && r.top > dessous;
      const largeur = Math.min(288, window.innerWidth - 16);
      setPos({
        left: Math.max(8, Math.min(r.left, window.innerWidth - largeur - 8)),
        top: dessus ? r.top - 6 : r.bottom + 6,
        dessus,
      });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [compact, aLaMain, calendrier]);

  const vide = saisie.trim() === '';
  const motDesBornes = lecture.horsBornes === 'trop-tard'
    ? (max === auj ? 'Ce jour n’est pas encore arrivé.' : `Au plus tard le ${jourAn(max)}.`)
    : lecture.horsBornes === 'trop-tot'
      ? (min === auj ? 'Ce jour est déjà passé.' : `Au plus tôt le ${jourAn(min)}.`)
      : '';
  const ton = vide ? ' is-vide' : !retenue ? ' is-faux' : retard > 0 ? ' is-retard' : '';

  const aides = (petit: boolean) => (
    <>
      {/* LA RELECTURE, EN TOUTES LETTRES. Toute la sécurité du champ tient à
          cette ligne : le jour de la semaine est la meilleure alarme qui soit,
          parce qu'on le connaît sans le calculer. */}
      <div className={`mnd-date__lu${petit ? ' is-petit' : ''}${ton}`}>
        {vide ? 'Aucune date' : iso ? jourEnLettres(iso) : 'Cette date ne se lit pas'}
      </div>

      {motDesBornes && <div className="mnd-date__alerte">{motDesBornes}</div>}

      {retard > 0 && (
        <div className="mnd-date__alerte">
          Ce jour est passé depuis {retard} jour{retard > 1 ? 's' : ''}.
          Un rendez-vous posé là ne paraîtra dans aucun carnet.
        </div>
      )}

      {corrections.length > 0 && (
        <div className="mnd-date__puces">
          <span>Vouliez-vous dire</span>
          {corrections.map((c) => (
            <button key={c} type="button" className="mnd-date__puce is-cuivre" onClick={() => poseISO(c)}>
              {jourCourtAn(c)}
            </button>
          ))}
        </div>
      )}

      {/* LES ANNÉES, DANS L'ORDRE DU CALENDRIER (« Range les années en ordre :
          2025-2026-2027 », Yéman). Elles ne paraissent que si l'année n'a pas
          été tapée : offrir un choix déjà fait n'aide personne. */}
      {lecture.anneeSupposee && iso && lecture.candidats.length > 0 && (
        <div className="mnd-date__puces">
          <span>Quelle année ?</span>
          {[...lecture.candidats].sort((x, y) => x - y).map((a2) => (
            <button
              key={a2}
              type="button"
              className={`mnd-date__puce${a2 === annee ? ' is-pris' : ''}`}
              onClick={() => { setAnnee(a2); pose(saisie, a2); }}
            >
              {a2}
            </button>
          ))}
        </div>
      )}

      <button type="button" className="mnd-date__ouvre" onClick={() => setCalendrier((v) => !v)}>
        {calendrier ? 'Replier le calendrier' : 'Le calendrier'}
      </button>

      {calendrier && (
        <div className="mnd-cal">
          <div className="mnd-cal__t">
            <button type="button" className="mnd-cal__fl" onClick={() => setMoisVu((m) => moisVoisin(m.annee, m.mois, -1))} aria-label="Mois précédent">‹</button>
            <b>{majuscule(new Date(moisVu.annee, moisVu.mois - 1, 15).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }))}</b>
            <button type="button" className="mnd-cal__fl" onClick={() => setMoisVu((m) => moisVoisin(m.annee, m.mois, 1))} aria-label="Mois suivant">›</button>
          </div>
          <div className="mnd-cal__g">
            {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((j, i) => (
              <span key={i} className="mnd-cal__j">{j}</span>
            ))}
            {grilleDuMois(moisVu.annee, moisVu.mois).map((c, i) => {
              const ferme = (joursFermes ?? []).includes(i % 7);
              const interdit = !!horsBornes(c.iso, min, max);
              const classes = ['mnd-cal__c'];
              if (c.horsMois) classes.push('hors');
              if (c.iso === auj) classes.push('auj');
              if (c.iso === retenue) classes.push('pris');
              if (ferme) classes.push('ferme');
              if (interdit) classes.push('interdit');
              return (
                <button
                  key={c.iso}
                  type="button"
                  className={classes.join(' ')}
                  disabled={interdit}
                  onClick={() => {
                    poseISO(c.iso);
                    setCalendrier(false);
                    if (compact) champ.current?.blur();
                  }}
                  aria-label={jourEnLettres(c.iso)}
                >
                  {c.jour}
                </button>
              );
            })}
          </div>
          <div className="mnd-cal__pied">
            <span>Cercle cuivre · aujourd’hui</span>
            {(joursFermes ?? []).length > 0 && <span>Barré · la Maison est fermée</span>}
          </div>
        </div>
      )}
    </>
  );

  if (!compact) {
    return (
      <div className="mnd-date" style={style}>
        <input
          id={id}
          className={`mnd-input mnd-date__champ${className ? ` ${className}` : ''}`}
          value={saisie}
          autoFocus={autoFocus}
          disabled={disabled}
          title={title}
          aria-label={ariaLabel}
          /* AU CLIC, TOUT SE SÉLECTIONNE : on retape, on n'efface pas. Sans
             cela on obtenait « 12 sept. 202613 ». */
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => pose(e.target.value)}
        />
        {aides(false)}
      </div>
    );
  }

  const { place, encre } = partageLeStyle(style);
  return (
    <div className="mnd-date mnd-date--compact" style={place}>
      <input
        ref={champ}
        id={id}
        className={`mnd-input mnd-date__champ${className ? ` ${className}` : ''}`}
        style={encre}
        /* Hors de la main, le champ montre la VALEUR, toujours mise en forme ;
           sous la main, ce qu'on tape. */
        value={aLaMain ? saisie : enForme(value)}
        autoFocus={autoFocus}
        disabled={disabled}
        title={title}
        placeholder="jj/mm/aaaa"
        aria-label={ariaLabel}
        aria-invalid={aLaMain && !vide && !retenue ? true : undefined}
        onFocus={(e) => {
          setSaisie(enForme(value));
          setALaMain(true);
          e.currentTarget.select();
        }}
        onBlur={() => {
          setALaMain(false);
          setCalendrier(false);
          setSaisie(enForme(value));
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
          /* Échap replie le volet sans fermer la modale qui le porte. */
          else if (e.key === 'Escape') { e.stopPropagation(); e.currentTarget.blur(); }
        }}
        onChange={(e) => pose(e.target.value)}
      />
      <button
        type="button"
        className="mnd-date__icone"
        tabIndex={-1}
        disabled={disabled}
        aria-label={calendrier ? 'Replier le calendrier' : 'Ouvrir le calendrier'}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          if (!aLaMain) champ.current?.focus();
          setCalendrier((v) => !v);
        }}
      >
        <CalendarDays size={14} strokeWidth={1.6} aria-hidden="true" />
      </button>
      {aLaMain && pos && createPortal(
        <div
          className="mnd-date__pop"
          style={{ left: pos.left, top: pos.top, transform: pos.dessus ? 'translateY(-100%)' : undefined }}
          /* Le volet ne prend jamais la main au champ : sans cela, cliquer une
             année le refermerait avant que le clic n'arrive. */
          onMouseDown={(e) => e.preventDefault()}
        >
          {aides(true)}
        </div>,
        document.body,
      )}
    </div>
  );
}

/* ══ LA DATE EN TROIS CASES — jour · mois · année ═══════════════════════
   Pour les dates qu'on connaît par cœur et qu'on donne d'un trait : une
   naissance, « couronne depuis ». Le mois s'écrit en toutes lettres, et l'ISO
   ne s'écrit que quand la date est complète et réelle.

   L'ORDRE A CHANGÉ LE 13 SEPTEMBRE 2026. Il était mois · jour · année depuis
   le 13 août ; la Maison veut désormais le même ordre partout, celui qu'on
   parle : le jour d'abord. */
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

export function DateEnClair({ value, onChange, ariaLabel, max, id }: {
  value?: string;
  onChange: (iso: string | undefined) => void;
  ariaLabel?: string;
  /** Une naissance ne tombe pas demain. Au-delà, rien ne s'écrit et la ligne
      le dit. */
  max?: string;
  id?: string;
}) {
  const decompose = (iso?: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
    return m ? { mois: m[2], jour: String(Number(m[3])), annee: m[1] } : { mois: '', jour: '', annee: '' };
  };
  const [p, setP] = useState(() => decompose(value));
  const [tropTard, setTropTard] = useState(false);
  useEffect(() => { setP(decompose(value)); setTropTard(false); }, [value]);
  const maj = (patch: Partial<typeof p>) => {
    const n = { ...p, ...patch };
    setP(n);
    if (!n.mois && !n.jour.trim() && !n.annee.trim()) { setTropTard(false); onChange(undefined); return; }
    const a = parseInt(n.annee, 10);
    const j = parseInt(n.jour, 10);
    if (!n.mois || !Number.isFinite(a) || n.annee.trim().length !== 4 || a < 1900 || a > 2100 || !Number.isFinite(j) || j < 1) {
      setTropTard(false);
      return;
    }
    /* Le jour se borne au mois réel : un 31 février devient le 28 ou le 29. */
    const jMax = new Date(a, Number(n.mois), 0).getDate();
    const iso = `${a}-${n.mois}-${String(Math.min(j, jMax)).padStart(2, '0')}`;
    if (max && iso > max) { setTropTard(true); return; }
    setTropTard(false);
    onChange(iso);
  };
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          id={id}
          className="mnd-input"
          inputMode="numeric"
          value={p.jour}
          onChange={(e) => maj({ jour: e.target.value.replace(/[^0-9]/g, '').slice(0, 2) })}
          placeholder="jour"
          style={{ width: 58, textAlign: 'right', flex: 'none' }}
          aria-label={ariaLabel ? `${ariaLabel}, jour` : 'Jour'}
        />
        <select
          className="mnd-select"
          value={p.mois}
          onChange={(e) => maj({ mois: e.target.value })}
          style={{ flex: '1 1 120px', minWidth: 0 }}
          aria-label={ariaLabel ? `${ariaLabel}, mois` : 'Mois'}
        >
          <option value="">mois</option>
          {MOIS.map((nom, i) => (
            <option key={nom} value={String(i + 1).padStart(2, '0')}>{nom}</option>
          ))}
        </select>
        <input
          className="mnd-input"
          inputMode="numeric"
          value={p.annee}
          onChange={(e) => maj({ annee: e.target.value.replace(/[^0-9]/g, '').slice(0, 4) })}
          placeholder="année"
          style={{ width: 74, textAlign: 'right', flex: 'none' }}
          aria-label={ariaLabel ? `${ariaLabel}, année` : 'Année'}
        />
      </div>
      {tropTard && <div className="mnd-date__alerte">Ce jour n’est pas encore arrivé.</div>}
    </div>
  );
}

/* ══ LE MOIS ET SON ANNÉE ═══════════════════════════════════════════════
   `<input type="month">` a le même défaut que son frère : sous un navigateur
   anglais, « September 2026 » ou « 2026-09 ». Deux listes, le mois en toutes
   lettres puis l'année. */
export function ChampDeMois({ value, onChange, vide = false, ariaLabel = 'Le mois', style }: {
  /** « AAAA-MM », ou '' quand rien n'est posé. */
  value: string;
  onChange: (v: string) => void;
  /** Le mois peut rester vide (une échéance facultative). */
  vide?: boolean;
  ariaLabel?: string;
  style?: CSSProperties;
}) {
  const m = /^(\d{4})-(\d{2})$/.exec(value ?? '');
  const an = m ? m[1] : '';
  const mois = m ? m[2] : '';
  const maintenant = new Date();
  const anCourant = maintenant.getFullYear();
  const moisCourant = String(maintenant.getMonth() + 1).padStart(2, '0');
  const debut = Math.min(anCourant - 3, an ? Number(an) : anCourant);
  const fin = Math.max(anCourant + 10, an ? Number(an) : anCourant);
  const annees = Array.from({ length: fin - debut + 1 }, (_, i) => debut + i);
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', ...style }}>
      <select
        className="mnd-select"
        value={mois}
        aria-label={`${ariaLabel}, mois`}
        style={{ flex: '1 1 130px', minWidth: 0 }}
        onChange={(e) => {
          const mm = e.target.value;
          if (!mm) { if (vide) onChange(''); return; }
          onChange(`${an || anCourant}-${mm}`);
        }}
      >
        {(vide || !mois) && <option value="">{vide ? 'Sans date' : 'mois'}</option>}
        {MOIS.map((nom, i) => (
          <option key={nom} value={String(i + 1).padStart(2, '0')}>{nom}</option>
        ))}
      </select>
      <select
        className="mnd-select"
        value={an}
        aria-label={`${ariaLabel}, année`}
        style={{ width: 96, flex: 'none' }}
        onChange={(e) => {
          const a = e.target.value;
          if (!a) { if (vide) onChange(''); return; }
          onChange(`${a}-${mois || moisCourant}`);
        }}
      >
        {(vide || !an) && <option value="">année</option>}
        {annees.map((a) => <option key={a} value={String(a)}>{a}</option>)}
      </select>
    </div>
  );
}
