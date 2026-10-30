/* ══ LA PHRASE ENTIÈRE — 24 octobre 2026 ═══════════════════════════════
   « Faire à présent taper une phrase entière dans la case (« Mireille
   retwist mercredi à 10h ») sur le Trône, le site et Ma Couronne » (Yéman).
   C'était promis dans la maquette du « + RDV » : « la phrase entière
   viendra ensuite, sans IA payante ».

   UNE LECTURE, PAS UNE DEVINETTE. Ce juge lit ce qu'il reconnaît à coup
   sûr, et rend le reste tel quel :
     · l'heure : « 10h », « 10 h 30 », « 10:30 », « 10h et demie », « à 10 »,
       « midi », « 3h de l'après-midi » ;
     · le jour : « aujourd'hui », « demain », « après-demain », un jour de la
       semaine (le prochain, aujourd'hui compris tant que l'heure n'est pas
       passée), « le 3 novembre », « 28/10 », « le 2 » (ce mois, sinon le
       suivant) ; une date passée de l'année va à l'année suivante ;
     · le maître : « avec Teckle », seulement un nom de la liste ;
     · la cliente (au Trône) : un prénom, un nom ou un numéro de sa fiche ;
       deux homonymes restent deux, la main choisit ;
     · les prestations : un mot de leur nom (« kloklo » pour KLƆKLƆ™, sans
       accents ni ™), ou de leur nom en français (« racines » pour SÍNSIN™,
       shared/gestes-en-francais), ou du petit lexique de la main (« retwist »
       et « resserrage » se disent « racines », « shampoing » se dit
       « lavage »…). Un mot qui en
       désigne plusieurs autant l'une que l'autre devient un DOUTE, jamais un
       choix ; `departage` le lève par l'habitude de la cliente.
   Rien ne s'enregistre ici : l'écran propose, la main pose.

   Pur : ni magasin ni horloge, le jour et la minute entrent par la porte.
   `scripts/verifie-la-phrase-de-rendez-vous` l'éprouve. */

import { clefDeRecherche } from './recherche';
import { nomEnFrancaisWa } from './gestes-en-francais';

/* LE LEXIQUE DE LA MAIN : les mots qu'on tape pour un geste dont le nom dit
   autre chose. Chaque mot cherche aussi ses équivalents. */
/* LE SÍNSIN™ SE DIT « Reprise des racines » depuis le 30 octobre 2026 : la
   main tape encore « resserrage », il cherche les racines. */
const LEXIQUE: Record<string, string[]> = {
  retwist: ['racines'], twist: ['racines'], resserrer: ['racines'], resserrage: ['racines'],
  shampoing: ['lavage'], shampooing: ['lavage'], laver: ['lavage'],
  coloration: ['couleur'], teinture: ['couleur'], colorer: ['couleur'],
  diagnostic: ['consultation'], diag: ['consultation'],
  detox: ['purification'], creer: ['creation'], demarrage: ['creation'],
  reparer: ['restauration'], reparation: ['restauration'], defaire: ['defaisage'],
  hydrater: ['hydratation'], pousse: ['activateur'],
};

export type Personne = { id: string; name: string; phone?: string };
export type PrestationNommee = { id: string; name: string };

export type LectureDeLaPhrase = {
  /** Les clientes reconnues : aucune, une, ou plusieurs homonymes. */
  clientes: string[];
  /** Les prestations, dans l'ordre où la phrase les dit. */
  prestations: string[];
  /** Un mot qui désigne plusieurs prestations autant l'une que l'autre. */
  doutes: { mot: string; ids: string[] }[];
  jour: string | null;
  heure: string | null;
  maitre: string | null;
  /** Les mots que la lecture n'a pas compris. */
  reste: string[];
  /** Rien de compris. */
  vide: boolean;
};

const MOIS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/* Les mots qui ne désignent rien : la phrase les porte, la lecture les laisse. */
const VIDES = new Set([
  'le', 'la', 'les', 'l', 'de', 'du', 'des', 'd', 'et', 'a', 'au', 'aux', 'en', 'pour', 'avec', 'sans', 'un', 'une',
  'ce', 'cet', 'cette', 'prochain', 'prochaine', 'matin', 'soir', 'apres', 'midi', 'rendez', 'vous', 'rdv', 'svp',
  'merci', 'je', 'j', 'veux', 'voudrais', 'aimerais', 'reserver', 'prendre', 'moi', 'heure', 'heures', 'h', 'vers',
  'plus', 'puis', 'ou', 'sur', 'chez', 'the', 'at', 'on', 'and', 'with', 'please', 'next', 'book', 'mon', 'ma', 'mes',
  'son', 'sa', 'ses', 'svp', 'stp', 'bonjour', 'hello', 'il', 'elle', 'faut', 'faire', 'fois',
]);
/* Les mots des noms de prestations qui ne disent rien de la prestation. */
const VIDES_DES_NOMS = new Set(['le', 'la', 'les', 'de', 'du', 'des', 'et', 'au', 'aux', 'en', 'pour', 'avec', 'sans', 'une', 'the', 'and']);

const pad = (n: number) => String(n).padStart(2, '0');
const isoDe = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const dateDe = (iso: string) => new Date(`${iso}T12:00:00Z`);
const plusJours = (iso: string, n: number) => { const d = dateDe(iso); d.setUTCDate(d.getUTCDate() + n); return isoDe(d); };
const valide = (a: number, m: number, j: number) => {
  const d = new Date(Date.UTC(a, m - 1, j, 12));
  return d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === j ? isoDe(d) : null;
};
/** Une date sans année : la prochaine, cette année ou la suivante. */
const prochaineDate = (m: number, j: number, aujourdhui: string): string | null => {
  const a = Number(aujourdhui.slice(0, 4));
  const ici = valide(a, m, j);
  if (ici && ici >= aujourdhui) return ici;
  return valide(a + 1, m, j);
};

/** Le texte de la main, aplati sans perdre ses chiffres ni ses « : » et « / ». */
const aplatie = (s: string) => s
  .toLowerCase()
  .normalize('NFD')
  .replace(/\p{Diacritic}/gu, '')
  .replace(/ɔ/g, 'o')
  .replace(/ɛ/g, 'e')
  .replace(/[’`]/g, "'")
  .replace(/\s+/g, ' ');

/** L'HEURE dite. Rend « HH:MM » et le texte sans elle. */
function litLHeure(t: string): { heure: string | null; reste: string } {
  const apresMidi = /\b(apres[ -]?midi|aprem|soir)\b/.test(t);
  const pose = (h: number, m: number, motif: RegExpMatchArray): { heure: string | null; reste: string } => {
    let hh = h;
    if (apresMidi && hh >= 1 && hh < 8) hh += 12;
    if (hh > 23 || m > 59) return { heure: null, reste: t };
    return { heure: `${pad(hh)}:${pad(m)}`, reste: t.replace(motif[0], ' ') };
  };
  let m = t.match(/(?:\b(?:a|vers)\s+)?\b(\d{1,2})\s*(?:h|heures?|:)\s*(\d{2})\b/);
  if (m) return pose(Number(m[1]), Number(m[2]), m);
  m = t.match(/(?:\b(?:a|vers)\s+)?\b(\d{1,2})\s*(?:h\b|heures?\b)(?:\s+et\s+(demie|quart))?/);
  if (m) return pose(Number(m[1]), m[2] === 'demie' ? 30 : m[2] === 'quart' ? 15 : 0, m);
  m = t.match(/(?:\b(?:a|vers)\s+)?\bmidi(?:\s+et\s+(demie|quart))?\b/);
  if (m) return pose(12, m[1] === 'demie' ? 30 : m[1] === 'quart' ? 15 : 0, m);
  m = t.match(/\b(?:a|vers)\s+(\d{1,2})\b(?!\s*(?:\/|\.|-|\d|janv|fevr|mars|avri|mai\b|juin|juil|aout|sept|octo|nove|dece))/);
  if (m && Number(m[1]) >= 6 && Number(m[1]) <= 22) return pose(Number(m[1]), 0, m);
  return { heure: null, reste: t };
}

/** LE JOUR dit. Rend l'ISO et le texte sans lui. */
function litLeJour(t: string, aujourdhui: string, heure: string | null, minutes?: number): { jour: string | null; reste: string } {
  const sans = (motif: RegExpMatchArray) => t.replace(motif[0], ' ');
  let m = t.match(/\b(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?\b/);
  if (m) {
    const a = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : null;
    const j = a ? valide(a, Number(m[2]), Number(m[1])) : prochaineDate(Number(m[2]), Number(m[1]), aujourdhui);
    if (j) return { jour: j, reste: sans(m) };
  }
  m = t.match(new RegExp(`\\b(?:le\\s+)?(1er|premier|\\d{1,2})\\s+(${MOIS.join('|')})(?:\\s+(\\d{4}))?\\b`));
  if (m) {
    const jj = m[1] === '1er' || m[1] === 'premier' ? 1 : Number(m[1]);
    const mm = MOIS.indexOf(m[2]) + 1;
    const j = m[3] ? valide(Number(m[3]), mm, jj) : prochaineDate(mm, jj, aujourdhui);
    if (j) return { jour: j, reste: sans(m) };
  }
  m = t.match(/\bapres[ -]?demain\b/);
  if (m) return { jour: plusJours(aujourdhui, 2), reste: sans(m) };
  m = t.match(/\b(demain|tomorrow)\b/);
  if (m) return { jour: plusJours(aujourdhui, 1), reste: sans(m) };
  m = t.match(/\b(aujourd ?'? ?hui|aujourdhui|today|ce jour)\b/);
  if (m) return { jour: aujourdhui, reste: sans(m) };
  m = t.match(new RegExp(`\\b(${[...JOURS, ...DAYS].join('|')})(\\s+prochain(?:e)?)?\\b`));
  if (m) {
    const cible = JOURS.includes(m[1]) ? JOURS.indexOf(m[1]) : DAYS.indexOf(m[1]);
    let ecart = (cible - dateDe(aujourdhui).getUTCDay() + 7) % 7;
    if (ecart === 0) {
      const [hh, mn] = (heure ?? '').split(':').map(Number);
      const passee = heure && typeof minutes === 'number' && hh * 60 + mn <= minutes;
      if (m[2] || passee) ecart = 7;
    }
    return { jour: plusJours(aujourdhui, ecart), reste: sans(m) };
  }
  m = t.match(/\ble\s+(1er|\d{1,2})\b(?!\s*(?:h\b|heures?\b|:))/);
  if (m) {
    const jj = m[1] === '1er' ? 1 : Number(m[1]);
    const [a, mo, j0] = aujourdhui.split('-').map(Number);
    let j = jj >= j0 ? valide(a, mo, jj) : null;
    if (!j) j = mo === 12 ? valide(a + 1, 1, jj) : valide(a, mo + 1, jj);
    if (j) return { jour: j, reste: sans(m) };
  }
  return { jour: null, reste: t };
}

const correspondUn = (mot: string, w: string) =>
  w === mot || (mot.length >= 4 && w.startsWith(mot)) || (w.length >= 4 && mot.startsWith(w) && mot.length - w.length <= 2);
/* Le mot tapé, ou l'un de ses équivalents du lexique. */
const correspond = (mot: string, w: string) => correspondUn(mot, w) || (LEXIQUE[mot] ?? []).some((x) => correspondUn(x, w));

export function litLaPhrase(phrase: string, o: {
  aujourdhui: string;
  /** Minutes depuis minuit, pour savoir si « samedi 10h » un samedi est passé. */
  minutes?: number;
  prestations: readonly PrestationNommee[];
  clientes?: readonly Personne[];
  maitres?: readonly string[];
}): LectureDeLaPhrase {
  const t0 = ` ${aplatie(phrase)} `;
  const h = litLHeure(t0);
  const d = litLeJour(h.reste, o.aujourdhui, h.heure, o.minutes);
  let mots = clefDeRecherche(d.reste).split(' ').filter(Boolean);

  /* LE MAÎTRE : « avec » suivi d'un nom de la liste, rien d'autre. */
  let maitre: string | null = null;
  for (let i = 0; i < mots.length - 1 && !maitre; i++) {
    if (mots[i] !== 'avec' && mots[i] !== 'with') continue;
    const suivant = mots[i + 1];
    const trouve = (o.maitres ?? []).find((x) => { const c = clefDeRecherche(x); return c === suivant || (suivant.length >= 3 && c.split(' ')[0].startsWith(suivant)); });
    if (trouve) { maitre = trouve; mots.splice(i, 2); }
  }

  /* LE NUMÉRO : des chiffres qui se suivent, huit au moins, et une fiche qui finit pareil. */
  const clientes = new Map<string, number>();
  const chiffres = mots.filter((x) => /^\d+$/.test(x)).join('');
  if (chiffres.length >= 8) {
    const fin = chiffres.slice(-8);
    for (const c of o.clientes ?? []) if ((c.phone ?? '').replace(/\D/g, '').endsWith(fin)) clientes.set(c.id, 99);
    if (clientes.size) mots = mots.filter((x) => !/^\d+$/.test(x));
  }

  const motsDesNoms = (o.prestations ?? []).map((p) => ({
    id: p.id,
    /* Son nom, et son nom en français : « SÍNSIN™ Essentiel » se lit aussi « Reprise des racines · Essentiel ». */
    mots: clefDeRecherche(`${p.name} ${nomEnFrancaisWa(p.name).francais}`).split(' ').filter((w) => w.length >= 3 && !VIDES_DES_NOMS.has(w)),
  }));
  const motsDesClientes = (o.clientes ?? []).map((c) => ({ id: c.id, mots: clefDeRecherche(c.name).split(' ').filter((w) => w.length >= 2) }));

  const reste: string[] = [];
  const pourLesPrestations: string[] = [];
  const scoreCliente = new Map<string, number>();
  for (const mot of mots) {
    if (VIDES.has(mot) || /^\d+$/.test(mot)) continue;
    if (mot.length < 3) { reste.push(mot); continue; }
    const prestations = motsDesNoms.filter((p) => p.mots.some((w) => correspond(mot, w)));
    const exactePrestation = motsDesNoms.some((p) => p.mots.includes(mot));
    const deClientes = motsDesClientes.filter((c) => c.mots.some((w) => w === mot || (mot.length >= 4 && w.startsWith(mot))));
    /* Un mot exact d'une prestation reste à la prestation ; sinon une cliente qui le porte le prend. */
    if (deClientes.length && !(exactePrestation && !deClientes.some((c) => c.mots.includes(mot)))) {
      for (const c of deClientes) scoreCliente.set(c.id, (scoreCliente.get(c.id) ?? 0) + 1);
      continue;
    }
    if (prestations.length) { pourLesPrestations.push(mot); continue; }
    reste.push(mot);
  }
  if (!clientes.size && scoreCliente.size) {
    const meilleur = Math.max(...scoreCliente.values());
    for (const [id, n] of scoreCliente) if (n === meilleur) clientes.set(id, n);
  }

  /* LES PRESTATIONS : chaque mot va à celle qu'il désigne le mieux ; à égalité, un doute. */
  const score = new Map<string, number>();
  for (const mot of pourLesPrestations) for (const p of motsDesNoms) if (p.mots.some((w) => correspond(mot, w))) score.set(p.id, (score.get(p.id) ?? 0) + 1);
  const choisies: string[] = [];
  const doutes: { mot: string; ids: string[] }[] = [];
  for (const mot of pourLesPrestations) {
    const candidats = motsDesNoms.filter((p) => p.mots.some((w) => correspond(mot, w)));
    const haut = Math.max(...candidats.map((p) => score.get(p.id) ?? 0));
    let gagnants = candidats.filter((p) => (score.get(p.id) ?? 0) === haut);
    if (gagnants.length > 1) {
      const exacts = gagnants.filter((p) => p.mots.includes(mot));
      if (exacts.length === 1) gagnants = exacts;
    }
    if (gagnants.length === 1) { if (!choisies.includes(gagnants[0].id)) choisies.push(gagnants[0].id); }
    else doutes.push({ mot, ids: gagnants.map((p) => p.id) });
  }
  const doutesRestants = doutes.filter((x) => !x.ids.some((id) => choisies.includes(id)));

  const lecture: LectureDeLaPhrase = {
    clientes: [...clientes.keys()],
    prestations: choisies,
    doutes: doutesRestants,
    jour: d.jour,
    heure: h.heure,
    maitre,
    reste,
    vide: false,
  };
  lecture.vide = !lecture.clientes.length && !lecture.prestations.length && !lecture.doutes.length && !lecture.jour && !lecture.heure && !lecture.maitre;
  return lecture;
}

/** LE DÉPARTAGE PAR L'HABITUDE : un doute dont une seule prestation revient
    dans ses venues se lève sur elle (« retwist » chez une habituée du SÍNSIN™
    Signature). Sinon le doute reste, et la main choisit. */
export function departage(l: LectureDeLaPhrase, habitudes: readonly string[]): LectureDeLaPhrase {
  const siennes = new Set(habitudes);
  const prestations = [...l.prestations];
  const doutes: LectureDeLaPhrase['doutes'] = [];
  for (const d of l.doutes) {
    const ici = d.ids.filter((id) => siennes.has(id));
    if (ici.length === 1) { if (!prestations.includes(ici[0])) prestations.push(ici[0]); } else doutes.push(d);
  }
  return { ...l, prestations, doutes };
}

/** Une PHRASE, et non un nom qu'on cherche : elle dit un moment, un maître,
    ou au moins deux choses (une cliente et une prestation). La case unique
    du Trône ne propose « tout poser » qu'à une phrase. */
export const estUnePhrase = (l: LectureDeLaPhrase): boolean =>
  !!l.jour || !!l.heure || !!l.maitre || (l.clientes.length > 0 && (l.prestations.length > 0 || l.doutes.length > 0));
