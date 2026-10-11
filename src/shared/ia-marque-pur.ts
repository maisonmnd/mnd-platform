/* LE GARDIEN DE LA MARQUE — 11 octobre 2026 (phase 2, « Contenu »).

   Cahier « Maison MND AI Operating System », § 13 : la direction artistique
   « contrôle » ce qui sort. Ses règles écrites se vérifient sans Claude,
   à chaque frappe, sur chaque texte de l'atelier des contenus (légende,
   accroche, article, script) et sur chaque réponse d'un agent.

   DEUX GRAVITÉS. « Bloque » : le contenu ne se valide pas tant que la faute
   reste (un prix dans une campagne, un tiret cadratin, « Kolétan »).
   « Attention » : un fondateur tranche (le mot « salon », « MND » seul, une
   date sans année, un emoji, une couleur hors palette).

   Les règles viennent de la Maison, pas du cahier : jamais de prix en
   campagne ni « Kolétan » en publicité (le récit, 3 octobre), jamais
   « salon », pas de tiret cadratin, l'année sur les dates, « Maison MND » en
   entier, aucun emoji, indigo et jamais l'obsidienne.

   MODULE PUR ET SANS IMPORT : copié entre repères dans la fonction. */

export type Gravite = 'bloque' | 'attention';
export type Remarque = { regle: string; gravite: Gravite; dit: string; extrait: string };

const MOIS_DITS = 'janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre';
const PRIX = /\b\d{1,3}(?:[ .  ]?\d{3})*\s?(?:F\b|FCFA\b|F CFA\b|XOF\b|francs?\b)/gi;
const DATE_SANS_ANNEE = new RegExp(`\\b(?:1er|\\d{1,2})\\s+(?:${MOIS_DITS})\\b(?!\\s+\\d{4})`, 'gi');
const MND_SEUL = /(?<![\p{L}#@])(?<!Maison\s)(?<!Académie\s)MND\b(?!\s*(?:Kids|229)\b)/gu;
/* ™, © et ® sont « pictographiques » pour Unicode, mais la Maison les écrit
   (DÀNDÀN™, SÍNSIN™) : ce ne sont pas des emoji. */
const EMOJI = /(?![™©®])\p{Extended_Pictographic}/gu;

function trouve(texte: string, re: RegExp): string[] {
  return [...texte.matchAll(re)].map((m) => m[0]);
}

/** Les remarques d'un texte. `campagne` : un texte qui part dehors (réseaux,
    WhatsApp, affiche) ; un prix y bloque. `visuel` : une consigne d'image ;
    la palette y est relue. */
export function relisLaMarque(texte: string, o: { campagne?: boolean; visuel?: boolean } = {}): Remarque[] {
  const t = String(texte ?? '');
  const r: Remarque[] = [];
  const ajoute = (regle: string, gravite: Gravite, dit: string, extraits: string[]) => {
    if (extraits.length) r.push({ regle, gravite, dit, extrait: [...new Set(extraits)].slice(0, 3).join(' · ') });
  };
  ajoute('tiret', 'bloque', 'Pas de tiret cadratin : une virgule à la place.', trouve(t, /—/g));
  ajoute('koletan', 'bloque', 'Jamais « Kolétan » en publicité.', trouve(t, /kol[ée]tan/gi));
  if (o.campagne) ajoute('prix', 'bloque', 'Jamais de prix dans une campagne : le prix se lit à la réservation.', trouve(t, PRIX));
  ajoute('salon', 'attention', 'La Maison ne dit pas « salon » ; une phrase qui le refuse peut rester, c’est à vous de juger.', trouve(t, /\bsalons?\b/gi));
  ajoute('nom', 'attention', 'Le nom est « Maison MND », en entier.', trouve(t, MND_SEUL));
  ajoute('formation', 'attention', 'On dit « Académie MND », plus « MND Formation ».', trouve(t, /MND\s+Formation/g));
  ajoute('annee', 'attention', 'Une date donnée à une cliente porte son année.', trouve(t, DATE_SANS_ANNEE));
  ajoute('emoji', 'attention', 'La Maison n’écrit pas d’emoji.', trouve(t, EMOJI));
  if (o.visuel) ajoute('palette', 'attention', 'Indigo, cuivre, ivoire : jamais l’obsidienne ni le noir profond.', trouve(t, /\b(?:obsidienne|noir profond|noir intense|fond noir)\b/gi));
  return r;
}

export const bloquant = (rs: readonly Remarque[]): boolean => rs.some((x) => x.gravite === 'bloque');

/** Les remarques de plusieurs champs d'un même contenu, sans doublon. */
export function relisLesChamps(champs: readonly { texte?: string; campagne?: boolean; visuel?: boolean }[]): Remarque[] {
  const vues = new Set<string>();
  const out: Remarque[] = [];
  for (const c of champs) {
    for (const x of relisLaMarque(c.texte ?? '', c)) {
      const cle = `${x.regle}|${x.extrait}`;
      if (!vues.has(cle)) { vues.add(cle); out.push(x); }
    }
  }
  return out;
}

/** Un article de défaut ne porte pas de cliente (registre des photos) : la
    vignette d'une cliente ne va pas sur un article qui nomme un défaut. */
export const NOMME_UN_DEFAUT = /abîm|cass|trop lourd|fine|perdue|néglig|chute|pellicule|moisi|odeur|créées ailleurs/i;
