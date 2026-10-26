/* ══ LES AVIS GOOGLE CHOISIS PAR LA MAISON — 10 octobre 2026 ══════════
   « Les avis Google qui sont sur le site, je veux avoir la possibilité de
   les sélectionner, pas de mettre les derniers sur mon site en permanence »
   (Yéman). Décisions du même jour, au sélecteur :
   - on choisit PARMI LES AVIS DU MOMENT : ceux que Google renvoie (cinq au
     plus), relus deux fois par jour par `avis-google-releve` ;
   - tant que rien n'est coché, le site montre les avis de Google, comme
     avant.

   LES RÈGLES DE GOOGLE (Places API, « Policies and attributions ») : on peut
   filtrer et ordonner, à condition de DIRE comment (« a clear notice that
   describes how reviews are being ordered and filtered »), et sans garder
   leurs avis au-delà du relevé. D'où trois choix :
   - le choix ne garde AUCUN texte : seulement une clé calculée sur l'auteur
     et le texte (`cleDeLAvis`). Un avis que Google ne renvoie plus disparaît
     du site, même coché ;
   - la mention du tri accompagne TOUJOURS les avis affichés
     (`mentionDuTri`) ;
   - si aucun avis coché n'est encore renvoyé, le site revient aux avis de
     Google, comme quand rien n'est coché.

   Pur : aucune lecture de magasin ni de réseau. Le site public l'importe
   tel quel (il ne tire pas la synchronisation du Trône). */

export type UnAvisGoogle = {
  auteur: string;
  note: number;
  texte: string;
  quand?: string;
  photo?: string;
};

export type ModeDesAvis = 'choix' | 'google';

/** Le texte remis en forme : les espaces et les retours à la ligne ne
    comptent pas, Google les change parfois d'un relevé à l'autre. */
const net = (s: unknown): string => String(s ?? '').replace(/\s+/g, ' ').trim();

/** LA CLÉ D'UN AVIS, stable d'un relevé à l'autre : une empreinte FNV-1a
    (32 bits) de l'auteur et du texte. Elle ne permet pas de retrouver le
    texte, et c'est voulu : le choix de la Maison ne garde rien de Google. */
export function cleDeLAvis(a: Pick<UnAvisGoogle, 'auteur' | 'texte'>): string {
  const s = `${net(a.auteur)}␞${net(a.texte)}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `av-${h.toString(36)}`;
}

/** CE QUE LE SITE MONTRE : les avis cochés encore renvoyés par Google, dans
    l'ordre de la Maison ; sinon (rien de coché, ou plus aucun coché renvoyé)
    les avis de Google, dans leur ordre. */
export function avisAMontrer<T extends Pick<UnAvisGoogle, 'auteur' | 'texte'>>(
  tous: readonly T[],
  choisis: readonly string[] | undefined | null,
): { avis: T[]; mode: ModeDesAvis } {
  const liste = Array.isArray(choisis) ? choisis.filter((c) => typeof c === 'string' && c) : [];
  if (liste.length > 0) {
    const parCle = new Map(tous.map((a) => [cleDeLAvis(a), a] as const));
    const vus = new Set<string>();
    const retenus: T[] = [];
    for (const c of liste) {
      const a = parCle.get(c);
      if (a && !vus.has(c)) { vus.add(c); retenus.push(a); }
    }
    if (retenus.length > 0) return { avis: retenus, mode: 'choix' };
  }
  return { avis: [...tous], mode: 'google' };
}

/** LA MENTION DU TRI, exigée par Google, montrée sous les avis du site. */
export function mentionDuTri(mode: ModeDesAvis): string {
  return mode === 'choix'
    ? 'Avis choisis par la Maison parmi ceux laissés sur Google.'
    : 'Les avis les plus pertinents selon Google.';
}

/** Cocher ou décocher un avis : coché, il se range à la fin du choix. */
export function basculeLeChoix(choisis: readonly string[] | undefined, cle: string): string[] {
  const liste = [...(choisis ?? [])];
  return liste.includes(cle) ? liste.filter((c) => c !== cle) : [...liste, cle];
}

/** Monter (-1) ou descendre (+1) un avis coché d'une place. */
export function deplaceLeChoix(choisis: readonly string[] | undefined, cle: string, sens: -1 | 1): string[] {
  const liste = [...(choisis ?? [])];
  const i = liste.indexOf(cle);
  const j = i + sens;
  if (i < 0 || j < 0 || j >= liste.length) return liste;
  [liste[i], liste[j]] = [liste[j], liste[i]];
  return liste;
}

/* ══ LES AVIS DU SITE, CHOISIS PARMI TOUS — 26 octobre 2026 ═══════════════
   La rubrique « Les avis Google » (maquette YaWfiqou…, « Tout me va ») montre
   les 299 avis que Make apporte de la fiche (l'API des fiches, pas Places) ;
   la case « Site » de chacun le met sur maisonmnd.com. Le site ne lit pas ces
   avis (le document de Make est réservé à l'équipe) : la Maison y COPIE ceux
   qu'elle choisit, dans `mnd_vitrine_config.avisDuSite`, lisible sans compte.
   Ce sont ses propres avis, venus de sa fiche ; la mention du tri reste.
   Quand la liste existe, elle remplace l'ancien choix par clés (`avisChoisis`,
   limité aux cinq avis de Places), que la rubrique vide en écrivant. */

/** Un avis copié pour le site : ce qu'il montre, et sa clé dans la rubrique. */
export type AvisDuSite = { cle: string; auteur: string; note: number; texte: string; quand?: string };

const estUnAvisDuSite = (v: unknown): v is AvisDuSite => {
  const a = v as AvisDuSite | null;
  return !!a && typeof a === 'object' && typeof a.cle === 'string' && !!a.cle
    && typeof a.auteur === 'string' && !!a.auteur.trim() && typeof a.texte === 'string' && Number.isFinite(Number(a.note));
};

/** Les avis copiés, lus d'un document qui a pu être retouché à la main :
    ceux qui ne tiennent pas (sans clé, sans autrice) se taisent. */
export function avisDuSiteLus(v: unknown): AvisDuSite[] {
  return Array.isArray(v) ? v.filter(estUnAvisDuSite) : [];
}

/** CE QUE LE SITE MONTRE : les avis copiés par la Maison s'il y en a, dans
    son ordre ; sinon l'ancien choix par clés parmi ceux de Google ; sinon
    ceux de Google. */
export function avisDuSiteAMontrer<T extends Pick<UnAvisGoogle, 'auteur' | 'texte'>>(
  copies: readonly AvisDuSite[] | undefined | null,
  tous: readonly T[],
  choisis: readonly string[] | undefined | null,
): { avis: (T | AvisDuSite)[]; mode: ModeDesAvis } {
  const lus = avisDuSiteLus(copies);
  if (lus.length > 0) return { avis: lus, mode: 'choix' };
  return avisAMontrer(tous, choisis);
}

/** Cocher ou décocher un avis : coché, sa copie se range à la fin. */
export function basculeDansLeSite(liste: readonly AvisDuSite[] | undefined, avis: AvisDuSite): AvisDuSite[] {
  const l = avisDuSiteLus(liste);
  return l.some((a) => a.cle === avis.cle) ? l.filter((a) => a.cle !== avis.cle) : [...l, avis];
}

/** Monter (-1) ou descendre (+1) un avis du site d'une place. */
export function deplaceDansLeSite(liste: readonly AvisDuSite[] | undefined, cle: string, sens: -1 | 1): AvisDuSite[] {
  const l = avisDuSiteLus(liste);
  const i = l.findIndex((a) => a.cle === cle);
  const j = i + sens;
  if (i < 0 || j < 0 || j >= l.length) return l;
  [l[i], l[j]] = [l[j], l[i]];
  return l;
}

/** Les clés cochées que Google ne renvoie plus : elles ne s'affichent plus. */
export function choixDisparus(choisis: readonly string[] | undefined, tous: readonly Pick<UnAvisGoogle, 'auteur' | 'texte'>[]): string[] {
  const presentes = new Set(tous.map(cleDeLAvis));
  return (choisis ?? []).filter((c) => !presentes.has(c));
}
