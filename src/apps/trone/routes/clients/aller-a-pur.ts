/* ══ DANS TROIS SEMAINES — 14 novembre 2026 ═══════════════════════════
   « Besoin de designer comme un expert un calendrier rapide et intelligent.
   Jump to a date from today et se retrouver facilement pour la cliente qui a
   besoin de programmer son prochain RDV rapidement » (Yéman).
   Maquette https://claude.ai/artifact/3eVTTj8KaaqVubnjD5voH9
   (`public/maquette-dans-trois-semaines.html`), ses arbitrages tranchés le
   même jour :

   1. LE FIL VOIT SEIZE SEMAINES, et défile au-delà quand on saute plus loin.
   2. LES SAUTS PARTENT D'AUJOURD'HUI, comme la cliente le dit (« dans trois
      semaines »). Sa date à elle a sa propre touche, comptée depuis sa
      dernière venue par le juge de sa fiche.
   3. TROUVER COMPREND LES DATES : « dans 3 semaines » ou « 12/12 » y ouvre
      le Calendrier sur ce jour.
   4. LE FIL DIT LE REMPLISSAGE DES FAUTEUILS ET LES PLACES LIBRES, la
      semaine presque pleine en cuivre.

   ON L'ÉCRIT COMME ELLE LE DIT : « 3s », « dans 3 semaines », « +10j »,
   « 2 mois », « samedi », « samedi en huit », « jeudi dans 3 semaines »,
   « le 12 », « 12/12 », « 15 janv », « mi-décembre », « fin janvier ».

   POUR ALLER VOIR, L'ANNÉE SE DÉDUIT : la prochaine fois que ce jour revient.
   C'est une navigation, rien ne s'écrit. Pour ÉCRIRE une date dans un champ
   (`ChampDeDate`), la règle de la Maison ne change pas : l'année ne s'y
   devine jamais. Le jour de la semaine tapé est relu : « vendredi 12
   décembre » se signale quand le 12 décembre est un samedi.

   Pur, sans magasin ni React : `scripts/verifie-aller-a.mjs` l'éprouve. */

/** La longueur du fil (arbitrage 1). */
export const FIL_SEMAINES = 16;
/** Au-dessus, une semaine se dit « presque pleine », en cuivre (arbitrage 4). */
export const SEUIL_PRESQUE_PLEIN = 0.85;
/** Le fil ne s'allonge jamais au-delà, quoi qu'on tape. */
const FIL_AU_PLUS = 60;

const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const JOURS_COURTS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MOIS_SANS_ACCENT = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];

/* ── Les jours, à midi : aucun changement d'heure ne déplace une date. ── */
const D = (iso: string) => new Date(`${iso}T12:00:00`);
const pad = (n: number) => String(n).padStart(2, '0');
const isoDe = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const ajoute = (iso: string, n: number): string => { const d = D(iso); d.setDate(d.getDate() + n); return isoDe(d); };
export const ecartEnJours = (de: string, a: string): number => Math.round((D(a).getTime() - D(de).getTime()) / 86400000);
/** Lundi = 0 … dimanche = 6. */
export const rangDuJour = (iso: string): number => (D(iso).getDay() + 6) % 7;
export const lundiDe = (iso: string): string => ajoute(iso, -rangDuJour(iso));
/** Le même quantième N mois plus tard, ramené au dernier jour d'un mois plus court. */
export const ajouteMois = (iso: string, n: number): string => {
  const d = D(iso); const j = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + n);
  const dernier = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(j, dernier));
  return isoDe(d);
};
const quantieme = (n: number) => (n === 1 ? '1er' : String(n));
const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** « samedi 12 décembre 2026 » */
export const dateDite = (iso: string): string => {
  const d = D(iso);
  return `${JOURS[rangDuJour(iso)]} ${quantieme(d.getDate())} ${MOIS[d.getMonth()]} ${d.getFullYear()}`;
};
/** « sam. 12 déc. » */
export const dateCourte = (iso: string): string => {
  const d = D(iso);
  return `${JOURS_COURTS[rangDuJour(iso)]} ${quantieme(d.getDate())} ${MOIS_COURTS[d.getMonth()]}`;
};

/* ── LA DISTANCE : ce que l'on dirait à la cliente. ──────────────────── */

/** « aujourd'hui », « demain », « dans 10 jours », « dans 3 semaines »,
    « dans 2 mois et demi ». Les semaines jusqu'à huit, puis les mois :
    « dans 8 semaines et 5 jours » ne se dit pas, « dans 2 mois » si. */
export function distanceDite(iso: string, aujourdhui: string): string {
  const n = ecartEnJours(aujourdhui, iso);
  if (n === 0) return 'aujourd’hui';
  if (n === 1) return 'demain';
  if (n === 2) return 'après-demain';
  if (n === -1) return 'hier';
  const a = Math.abs(n);
  const pre = n > 0 ? 'dans ' : 'il y a ';
  if (a < 14) return `${pre}${a} jours`;
  if (a < 56 || (a < 63 && a % 7 === 0)) {
    const s = Math.floor(a / 7); const r = a % 7;
    return `${pre}${s} semaines${r ? ` et ${r} jour${r > 1 ? 's' : ''}` : ''}`;
  }
  const m = Math.round((a / 30.44) * 2) / 2;
  return m % 1 ? `${pre}${Math.floor(m)} mois et demi` : `${pre}${m} mois`;
}

/** La distance d'une semaine, comptée de lundi à lundi. */
export function distanceDeLaSemaine(unJourDeLaSemaine: string, aujourdhui: string): string {
  const n = Math.round(ecartEnJours(lundiDe(aujourdhui), lundiDe(unJourDeLaSemaine)) / 7);
  if (n === 0) return 'cette semaine';
  if (n === 1) return 'la semaine prochaine';
  if (n === -1) return 'la semaine dernière';
  return n > 0 ? `dans ${n} semaines` : `il y a ${-n} semaines`;
}

/** La distance d'un mois, d'un mois civil à l'autre. */
export function distanceDuMois(unJourDuMois: string, aujourdhui: string): string {
  const a = D(aujourdhui); const b = D(unJourDuMois);
  const n = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (n === 0) return 'ce mois-ci';
  if (n === 1) return 'le mois prochain';
  if (n === -1) return 'le mois dernier';
  return n > 0 ? `dans ${n} mois` : `il y a ${-n} mois`;
}

/* ── LES SAUTS RAPIDES, depuis aujourd'hui (arbitrage 2). ────────────── */

export type SautRapide = { libelle: string; iso: string };
export function sautsRapides(aujourdhui: string): SautRapide[] {
  return [
    { libelle: 'Aujourd’hui', iso: aujourdhui },
    ...[1, 2, 3, 4, 6, 8].map((s) => ({ libelle: `+${s} sem`, iso: ajoute(aujourdhui, 7 * s) })),
    { libelle: '+3 mois', iso: ajouteMois(aujourdhui, 3) },
  ];
}

/* ── LE LECTEUR ──────────────────────────────────────────────────────── */

export type SautLu = { iso: string; avertit?: string };

const aplatit = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const jourDe = (mot: string | undefined): number => {
  const m = (mot ?? '').replace(/\.$/, '');
  return m.length < 3 ? -1 : JOURS.findIndex((j) => j.startsWith(m));
};
const moisDe = (mot: string | undefined): number => {
  const m = (mot ?? '').replace(/\.$/, '');
  return m.length < 3 ? -1 : MOIS_SANS_ACCENT.findIndex((x) => x.startsWith(m));
};
/** Le prochain jour de rang `j` strictement après `apres`. */
const prochainJour = (j: number, apres: string): string => {
  for (let i = 1; i <= 7; i += 1) { const s = ajoute(apres, i); if (rangDuJour(s) === j) return s; }
  return ajoute(apres, 7);
};
/** Un jour et un mois ; sans année, la prochaine fois qu'il revient. */
function dateDuCalendrier(j: number, mois: number, annee: number | null, aujourdhui: string): SautLu | null {
  const essai = (y: number) => { const d = new Date(y, mois, j, 12); return d.getMonth() === mois && d.getDate() === j ? isoDe(d) : null; };
  if (annee !== null) { const s = essai(annee); return s ? { iso: s } : null; }
  const y = D(aujourdhui).getFullYear();
  const cette = essai(y);
  if (cette && cette >= aujourdhui) return { iso: cette };
  const suivante = essai(y + 1);
  return suivante ? { iso: suivante } : null;
}
/** « le 12 » : le prochain 12, aujourd'hui compris. */
function prochainQuantieme(j: number, aujourdhui: string): SautLu | null {
  if (j < 1 || j > 31) return null;
  for (let i = 0; i < 13; i += 1) {
    const premier = D(ajouteMois(`${aujourdhui.slice(0, 8)}01`, i));
    const r = dateDuCalendrier(j, premier.getMonth(), premier.getFullYear(), aujourdhui);
    if (r && r.iso >= aujourdhui) return r;
  }
  return null;
}
/** Le jour de la semaine tapé est relu contre la date. */
function relu(r: SautLu | null, motDuJour: string | null): SautLu | null {
  if (!r || !motDuJour) return r;
  const j = jourDe(motDuJour);
  if (j < 0) return null;
  if (rangDuJour(r.iso) !== j) {
    const d = D(r.iso);
    return { ...r, avertit: `Le ${quantieme(d.getDate())} ${MOIS[d.getMonth()]} ${d.getFullYear()} est un ${JOURS[rangDuJour(r.iso)]}, pas un ${JOURS[j]}.` };
  }
  return r;
}

/** UNE PHRASE DE CLIENTE → le jour à ouvrir, ou `null` quand elle ne se lit pas. */
export function lisLeSaut(texte: string, aujourdhui: string): SautLu | null {
  let t = aplatit(String(texte ?? '').toLowerCase()).replace(/[’']/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  t = t.replace(/^le /, '');
  if (/^(aujourd ?hui|auj)$/.test(t)) return { iso: aujourdhui };
  if (t === 'demain') return { iso: ajoute(aujourdhui, 1) };
  if (/^apres[- ]?demain$/.test(t)) return { iso: ajoute(aujourdhui, 2) };
  if (/^(la )?semaine prochaine$/.test(t)) return { iso: ajoute(lundiDe(aujourdhui), 7) };

  /* dans 3 semaines · 3s · +10j · 2 mois · dans 3 semaines samedi · samedi dans 3 semaines */
  let m: (string | undefined)[] | null = t.match(/^(?:dans )?\+? ?(\d{1,2}) ?(j|jours?|s|sem|semaines?|m|mois)(?: ([a-z]+\.?))?$/);
  if (!m) {
    const m2 = t.match(/^([a-z]+\.?) dans (\d{1,2}) ?(s|sem|semaines?)$/);
    if (m2) m = [m2[0], m2[2], m2[3], m2[1]];
  }
  if (m) {
    const n = Number(m[1]); const u = (m[2] ?? '')[0];
    const base = u === 'j' ? ajoute(aujourdhui, n) : u === 's' ? ajoute(aujourdhui, 7 * n) : ajouteMois(aujourdhui, n);
    if (m[3]) { const j = jourDe(m[3]); return j < 0 ? null : { iso: ajoute(lundiDe(base), j) }; }
    return { iso: base };
  }

  /* samedi en huit · jeudi en quinze */
  m = t.match(/^([a-z]+\.?) en (huit|8|quinze|15)$/);
  if (m && jourDe(m[1]) >= 0) return { iso: ajoute(prochainJour(jourDe(m[1]), aujourdhui), /huit|8/.test(m[2] ?? '') ? 7 : 14) };

  /* samedi · samedi prochain : le prochain, jamais aujourd'hui */
  m = t.match(/^([a-z]+\.?)(?: prochain)?$/);
  if (m && jourDe(m[1]) >= 0) return { iso: prochainJour(jourDe(m[1]), aujourdhui) };

  /* fin du mois · début, mi, fin + mois · un mois seul */
  if (/^fin (du )?mois$/.test(t)) return dateDuCalendrier(25, D(aujourdhui).getMonth(), null, aujourdhui);
  /* « fin de janvier » : le « de » n'est un mot que suivi d'une espace, sinon
     « début décembre » perdait son « dé ». */
  m = t.match(/^(debut|mi|fin)(?: de(?= ))?[- ]?([a-z]+\.?)$/);
  if (m && moisDe(m[2]) >= 0) return dateDuCalendrier(m[1] === 'debut' ? 1 : m[1] === 'mi' ? 15 : 25, moisDe(m[2]), null, aujourdhui);
  if (/^[a-z]+\.?$/.test(t) && moisDe(t) >= 0) return dateDuCalendrier(1, moisDe(t), null, aujourdhui);

  /* 12 · 12/12 · 12/12/26 · 12 dec · 12 decembre 2026, le jour de la semaine devant ou non */
  let motDuJour: string | null = null;
  m = t.match(/^([a-z]+\.?) (\d.*)$/);
  if (m && jourDe(m[1]) >= 0) { motDuJour = m[1] ?? null; t = m[2] ?? ''; }
  m = t.match(/^(\d{1,2})$/);
  if (m) return relu(prochainQuantieme(Number(m[1]), aujourdhui), motDuJour);
  m = t.match(/^(\d{1,2})[/\-. ](\d{1,2})(?:[/\-. ](\d{2}|\d{4}))?$/);
  if (m) {
    const an = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : null;
    return relu(dateDuCalendrier(Number(m[1]), Number(m[2]) - 1, an, aujourdhui), motDuJour);
  }
  m = t.match(/^(\d{1,2}) ([a-z]+\.?)(?: (\d{4}))?$/);
  if (m && moisDe(m[2]) >= 0) return relu(dateDuCalendrier(Number(m[1]), moisDe(m[2]), m[3] ? Number(m[3]) : null, aujourdhui), motDuJour);
  return null;
}

/* ── TROUVER NE CONFOND PAS UNE CLIENTE ET UNE DATE (arbitrage 3) ──────
   « mar » est mardi pour le lecteur, et le début de Mariette pour Trouver.
   Trouver ne propose une date que si la phrase ne peut être qu'une date :
   un chiffre, ou des mots entiers du calendrier. */
const MOTS_DU_CALENDRIER = new Set([
  ...JOURS, ...MOIS_SANS_ACCENT,
  'aujourd', 'hui', 'aujourdhui', 'demain', 'apres', 'apres-demain', 'semaine', 'prochaine', 'prochain',
  'dans', 'en', 'huit', 'quinze', 'debut', 'mi', 'fin', 'du', 'de', 'mois', 'le', 'la',
  'mi-janvier', 'mi-fevrier', 'mi-mars', 'mi-avril', 'mi-mai', 'mi-juin', 'mi-juillet', 'mi-aout',
  'mi-septembre', 'mi-octobre', 'mi-novembre', 'mi-decembre',
]);
export function estUneDateSure(texte: string, aujourdhui: string): SautLu | null {
  const r = lisLeSaut(texte, aujourdhui);
  if (!r) return null;
  const t = aplatit(String(texte).toLowerCase()).replace(/[’']/g, ' ').trim();
  if (/\d/.test(t)) return r;
  return t.split(/\s+/).every((mot) => MOTS_DU_CALENDRIER.has(mot)) ? r : null;
}

/* ── LE REMPLISSAGE ET LE FIL (arbitrage 4) ─────────────────────────── */

/** La part des fauteuils prise pendant l'ouverture : les minutes occupées,
    sur les fauteuils × l'amplitude. `null` quand la Maison est fermée ou
    qu'elle n'a pas dit son nombre de fauteuils (on ne devine pas). */
export function remplissageDuJour(o: {
  ouverture: { closed: boolean; openMin: number; closeMin: number };
  occupes: readonly { debutMin: number; dureeMin: number }[];
  sieges: number;
}): number | null {
  const { closed, openMin, closeMin } = o.ouverture;
  const sieges = Math.floor(o.sieges);
  if (closed || sieges <= 0 || closeMin <= openMin) return null;
  let pris = 0;
  for (const x of o.occupes) {
    const debut = Math.max(openMin, x.debutMin);
    const fin = Math.min(closeMin, x.debutMin + Math.max(0, x.dureeMin));
    if (fin > debut) pris += fin - debut;
  }
  return Math.min(1, pris / (sieges * (closeMin - openMin)));
}

export type JourDuFil = { ferme: boolean; passe: boolean; libres: number; remplissage: number | null; note?: string | null };
export type SemaineDuFil = {
  lundi: string;
  /** 0 : cette semaine. */
  rang: number;
  /** Le mois, quand il change d'une semaine à l'autre (lu sur le jeudi). */
  mois: string | null;
  /** La moyenne des jours ouverts et pas passés ; `null` sans fauteuils dits. */
  remplissage: number | null;
  libres: number;
  presquePlein: boolean;
  /** Une exception d'horaires de la Maison qui porte un nom (« Noël »). */
  note: string | null;
  /** Sa date à elle tombe dans la semaine. */
  sienne: boolean;
};

/** LE FIL : seize semaines depuis celle d'aujourd'hui, prolongées jusqu'à la
    semaine `jusqua` quand on a sauté plus loin (au plus soixante). */
export function filDesSemaines(o: {
  aujourdhui: string;
  jour: (iso: string) => JourDuFil;
  nombre?: number;
  jusqua?: string | null;
  saDate?: string | null;
}): SemaineDuFil[] {
  const debut = lundiDe(o.aujourdhui);
  const voulu = o.jusqua ? Math.round(ecartEnJours(debut, lundiDe(o.jusqua)) / 7) + 2 : 0;
  const n = Math.min(FIL_AU_PLUS, Math.max(o.nombre ?? FIL_SEMAINES, voulu));
  const out: SemaineDuFil[] = [];
  let moisPrecedent = -1;
  for (let i = 0; i < n; i += 1) {
    const lundi = ajoute(debut, 7 * i);
    let somme = 0; let compte = 0; let libres = 0; let note: string | null = null; let sienne = false;
    for (let k = 0; k < 7; k += 1) {
      const iso = ajoute(lundi, k);
      const j = o.jour(iso);
      if (!note && j.note) note = j.note;
      if (o.saDate && iso === o.saDate) sienne = true;
      if (j.ferme || j.passe) continue;
      libres += Math.max(0, j.libres);
      if (j.remplissage !== null && j.remplissage !== undefined) { somme += j.remplissage; compte += 1; }
    }
    const remplissage = compte ? somme / compte : null;
    const mois = D(ajoute(lundi, 3)).getMonth();
    out.push({
      lundi,
      rang: i,
      mois: mois !== moisPrecedent ? MOIS_COURTS[mois] : null,
      remplissage,
      libres,
      presquePlein: remplissage !== null && remplissage >= SEUIL_PRESQUE_PLEIN,
      note,
      sienne,
    });
    moisPrecedent = mois;
  }
  return out;
}

/** « Semaine du lundi 7 décembre, dans 3 semaines : 12 places libres, fauteuils pris à 64 % » */
export function titreDeLaSemaine(s: SemaineDuFil, aujourdhui: string): string {
  const pl = `${s.libres} place${s.libres > 1 ? 's' : ''} libre${s.libres > 1 ? 's' : ''}`;
  const pris = s.remplissage !== null ? `, fauteuils pris à ${Math.round(s.remplissage * 100)} %` : '';
  return `${majuscule(`semaine du ${dateDite(s.lundi)}`)}, ${distanceDeLaSemaine(s.lundi, aujourdhui)} : ${pl}${pris}`;
}
