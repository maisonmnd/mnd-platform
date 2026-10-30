import {
  motsReconnus, intentionDeReserver, renvoieAUnRdv, uneQuestionAutre, demandeLeCheminWa, enRouteWa,
  MOTS_DES_GESTES_WA, MOTS_DANS_LE_NOM_WA, jugeLaParole, tourDeLaCliente, reglageDeLAutomate, cleCourte, sansAccentsWa,
  type ConseilDeLaMaison, type FicheDuNumero,
} from './automate-wa';
import { GESTES_EN_FRANCAIS } from './gestes-en-francais';
import { sansCoordonnees } from './ia-anonymise-pur';

/* ══ LA BANQUE DE SCÉNARIOS · 30 octobre 2026 ═══════════════════════════
   « Comment mieux entraîner l'automate à des milliers de scénarios ? »
   (Yéman). Maquette 8c48d9mc… validée (« tout me va ») : les vrais messages
   du numéro de la Maison, plus les discussions exportées du numéro de Brice ;
   la réponse attendue proposée, puis validée d'un toucher ; un bouton
   « Mauvaise réponse » dans les Conversations ; plus tard, vingt variantes
   par cas, écrites par Claude.

   L'automate n'apprend pas seul : chaque cas validé est rejoué à chaque
   changement, et un cas qui ne tient plus bloque la mise en ligne
   (`scripts/banc-des-scenarios`). Un cas « à reprendre » est une correction
   promise : il dit ce que la Maison attend, et l'automate y viendra.

   CE QU'UN CAS RETIENT : qui répond (l'automate, l'assistant, l'équipe) et
   ce que l'automate comprend du message (les signes). Pas le texte de la
   réponse : celui de l'assistant change à chaque fois, et celui de
   l'automate se juge dans ses propres bancs.

   LES MESSAGES RESTENT CHEZ LA MAISON : la banque vit dans un document de la
   base (`mnd_scenarios_wa`), jamais dans le dépôt public. Le banc la lit dans
   une sauvegarde de la Maison. Les numéros et les adresses e-mail sont ôtés
   à l'entrée (`sansCoordonnees`).

   MODULE PUR. */

/* ── CE QUE L'AUTOMATE COMPREND ─────────────────────────────────────────── */
export type Qui = 'automate' | 'assistant' | 'equipe';
export const QUI_DIT: Record<Qui, string> = {
  automate: 'L’automate : boutons et listes',
  assistant: 'L’assistant (Claude)',
  equipe: 'La main passe à l’équipe',
};

/** Les signes que l'automate lit, dans l'ordre où l'écran les montre. Les
    gestes nommés s'y ajoutent (« geste:Lavage »). */
export const SIGNES: readonly { id: string; dit: string }[] = [
  { id: 'reserver', dit: 'envie de réserver' },
  { id: 'rdv-pris', dit: 'un rendez-vous déjà pris' },
  { id: 'annuler', dit: 'annuler' },
  { id: 'decaler', dit: 'décaler' },
  { id: 'retard', dit: 'un retard' },
  { id: 'en-route', dit: 'en route' },
  { id: 'chemin', dit: 'le chemin' },
  { id: 'prix', dit: 'un prix' },
  { id: 'question', dit: 'une question' },
  { id: 'aujourdhui', dit: 'aujourd’hui' },
  { id: 'jour', dit: 'un jour' },
  { id: 'heure', dit: 'une heure' },
  { id: 'moment', dit: 'matin ou après-midi' },
];
const ORDRE_DES_SIGNES = new Map(SIGNES.map((s, i) => [s.id, i]));

/** Les gestes que l'automate sait lire, tels que la cliente les entend. */
export const GESTES_LUS: readonly string[] = [
  ...Object.keys(MOTS_DES_GESTES_WA).map((m) => GESTES_EN_FRANCAIS[m]?.court ?? m),
  ...MOTS_DANS_LE_NOM_WA.map((m) => `${m.charAt(0).toUpperCase()}${m.slice(1)}`),
];

export const signeDit = (id: string): string =>
  id.startsWith('geste:') ? id.slice('geste:'.length) : (SIGNES.find((s) => s.id === id)?.dit ?? id);

const rangeLesSignes = (ids: Iterable<string>): string[] => [...new Set(ids)].sort((a, b) => {
  const ga = a.startsWith('geste:');
  const gb = b.startsWith('geste:');
  if (ga !== gb) return ga ? 1 : -1;
  if (ga) return a.localeCompare(b, 'fr');
  return (ORDRE_DES_SIGNES.get(a) ?? 99) - (ORDRE_DES_SIGNES.get(b) ?? 99);
});

/** Les gestes que ses mots nomment : la famille par sa marque (un
    shampoing : Lavage), ou le mot que le nom porte (Coiffure, Tresse). */
function gestesNommes(texte: string): string[] {
  const t = sansAccentsWa(texte);
  const out: string[] = [];
  for (const [marque, r] of Object.entries(MOTS_DES_GESTES_WA)) if (r.test(t)) out.push(`geste:${GESTES_EN_FRANCAIS[marque]?.court ?? marque}`);
  for (const m of MOTS_DANS_LE_NOM_WA) {
    if (new RegExp(`(?<!\\p{L})${m}s?(?!\\p{L})`, 'u').test(t)) out.push(`geste:${m.charAt(0).toUpperCase()}${m.slice(1)}`);
  }
  return out;
}

export type Lecture = { qui: Qui; signes: string[] };

/** La cliente du banc : connue, à son numéro, sans venue ni rendez-vous. */
const CLIENTE_DU_BANC: FicheDuNumero = { id: 'banque', nom: 'Cliente', civilite: 'madame', parPhone: true, numeros: ['22990000000'] };

/** CE QUE L'AUTOMATE FAIT DE CE MESSAGE, à l'instant où il a été écrit (les
    jours relatifs, « demain », se lisent depuis là) : qui répond, et les
    signes qu'il comprend. Le conseil de la Maison compte, s'il est donné. */
export function litLeCas(texte: string, quandIso: string, conseil?: ConseilDeLaMaison): Lecture {
  const t0 = Date.parse(quandIso);
  const ms = Number.isFinite(t0) ? t0 : Date.now();
  const m = motsReconnus(texte, ms);
  const tour = tourDeLaCliente([{ waId: 'wamid.banque', quand: new Date(ms).toISOString(), texte, type: 'text', sens: 'entrant' }], []);
  const juge = jugeLaParole(null, tour, {
    maintenantMs: ms, numero: '22990000000', tiroir: 'clientes', reglage: reglageDeLAutomate({ mode: 'ouvert' }),
    fiches: [CLIENTE_DU_BANC], premierMessage: false, main: null, ...(conseil ? { conseil } : {}),
  });
  const qui: Qui = juge.parole === 'main-silencieuse' ? 'equipe'
    : juge.parole === 'parle' ? (m.annuler || m.jourMeme ? 'equipe' : 'automate')
      : 'assistant';
  const signes: string[] = [];
  if (intentionDeReserver(texte)) signes.push('reserver');
  if (renvoieAUnRdv(texte)) signes.push('rdv-pris');
  if (m.annuler) signes.push('annuler');
  if (m.deplacer) signes.push('decaler');
  if (m.retard) signes.push('retard');
  if (enRouteWa(texte)) signes.push('en-route');
  if (demandeLeCheminWa(texte)) signes.push('chemin');
  if (m.prix) signes.push('prix');
  if (uneQuestionAutre(texte, ms)) signes.push('question');
  if (m.jourMeme) signes.push('aujourdhui');
  if (m.jourVoulu) signes.push('jour');
  if (m.heure) signes.push('heure');
  if (m.moment) signes.push('moment');
  signes.push(...gestesNommes(texte));
  return { qui, signes: rangeLesSignes(signes) };
}

/** CE QUI DIFFÈRE entre l'attendu et ce qu'il fait : une liste vide, le cas
    tient. Les signes se comparent un à un : un signe de trop est une faute
    aussi (« une adresse sympathique » n'est pas le chemin). */
export function ecartsDuCas(attendu: Lecture, lu: Lecture): string[] {
  const e: string[] = [];
  if (attendu.qui !== lu.qui) e.push(`${QUI_DIT[lu.qui]}, au lieu de : ${QUI_DIT[attendu.qui]}`);
  const a = new Set(attendu.signes);
  const l = new Set(lu.signes);
  for (const s of attendu.signes) if (!l.has(s)) e.push(`ne lit plus « ${signeDit(s)} »`);
  for (const s of lu.signes) if (!a.has(s)) e.push(`lit « ${signeDit(s)} » en trop`);
  return e;
}

/* ── LA BANQUE ──────────────────────────────────────────────────────────── */
export type EtatDuCas = 'propose' | 'valide' | 'a-reprendre';
export type SourceDuCas = 'maison' | 'export' | 'mauvaise-reponse' | 'maquette';
export const SOURCE_DITE: Record<SourceDuCas, string> = {
  maison: 'Numéro de la Maison',
  export: 'Discussion exportée',
  'mauvaise-reponse': 'Mauvaise réponse',
  maquette: 'Maquette du 30 oct. 2026',
};

export type CasDeLaBanque = {
  id: string;
  /** Le message de la cliente, sans numéro ni adresse e-mail. */
  texte: string;
  /** Quand elle l'a écrit : « demain » se lit depuis là. */
  quand: string;
  source: SourceDuCas;
  etat: EtatDuCas;
  /** Ce que la Maison attend ; absent tant que le cas est proposé. */
  attendu?: Lecture;
  /** Ce qu'il fallait répondre, dit par la Maison. */
  note?: string;
  creeLe: string;
  valideLe?: string;
  valideePar?: string;
  /** Vingt façons de dire la même demande, écrites par Claude
      (`variantes-wa`) : rejouées, elles disent où l'automate est fragile. */
  variantes?: string[];
};
export type BanqueBrute = { cas: CasDeLaBanque[] };
export const BANQUE_VIDE: BanqueBrute = { cas: [] };

/** L'identifiant d'un cas : son texte, à la ponctuation et aux accents près.
    Le même message, de deux sources, ne fait qu'un cas. */
export const idDuCas = (texte: string): string =>
  `cas-${cleCourte(sansAccentsWa(texte).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim())}`;

/** Un texte propre pour la banque : sans numéro ni adresse, sans espaces en
    trop, 600 signes au plus. Vide : rien. */
export function texteDuCas(brut: string): string {
  return sansCoordonnees(String(brut ?? '')).replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 600);
}

/** LA BANQUE TELLE QUE LA BASE LA REND, remise en forme : un cas abîmé tombe,
    un doublon aussi. */
export function banqueLue(brut: unknown): BanqueBrute {
  const b = (brut && typeof brut === 'object' ? brut : {}) as { cas?: unknown };
  const vus = new Set<string>();
  const cas: CasDeLaBanque[] = [];
  const quiSur = (q: unknown): Qui | null => (q === 'automate' || q === 'assistant' || q === 'equipe' ? q : null);
  for (const x of Array.isArray(b.cas) ? b.cas : []) {
    if (!x || typeof x !== 'object') continue;
    const c = x as Record<string, unknown>;
    const texte = typeof c.texte === 'string' ? c.texte : '';
    const id = typeof c.id === 'string' ? c.id : '';
    if (!texte.trim() || !/^cas-[a-z0-9]{6,40}$/.test(id) || vus.has(id)) continue;
    vus.add(id);
    const etat: EtatDuCas = c.etat === 'valide' || c.etat === 'a-reprendre' ? c.etat : 'propose';
    const source: SourceDuCas = c.source === 'export' || c.source === 'mauvaise-reponse' || c.source === 'maquette' ? c.source : 'maison';
    const a = c.attendu as { qui?: unknown; signes?: unknown } | undefined;
    const qui = quiSur(a?.qui);
    const attendu = qui ? { qui, signes: rangeLesSignes((Array.isArray(a?.signes) ? a!.signes : []).filter((s): s is string => typeof s === 'string' && s.length > 0 && s.length < 60)) } : undefined;
    cas.push({
      id, texte, quand: typeof c.quand === 'string' ? c.quand : '', source,
      etat: attendu ? etat : 'propose',
      ...(attendu ? { attendu } : {}),
      ...(typeof c.note === 'string' && c.note.trim() ? { note: c.note.trim().slice(0, 600) } : {}),
      creeLe: typeof c.creeLe === 'string' ? c.creeLe : '',
      ...(typeof c.valideLe === 'string' ? { valideLe: c.valideLe } : {}),
      ...(typeof c.valideePar === 'string' ? { valideePar: c.valideePar } : {}),
      ...(Array.isArray(c.variantes) ? { variantes: (c.variantes as unknown[]).filter((v): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= 300).slice(0, 20) } : {}),
    });
  }
  return { cas };
}

/** LES VARIANTES D'UN CAS, posées (elles remplacent les précédentes). */
export function poseLesVariantes(b: BanqueBrute, id: string, variantes: readonly string[]): BanqueBrute {
  const propres = [...new Set(variantes.map((v) => texteDuCas(v)).filter(Boolean))].slice(0, 20);
  return { cas: b.cas.map((c) => (c.id === id ? { ...c, variantes: propres } : c)) };
}

/** Des cas neufs, proposés : un texte déjà dans la banque ne revient pas. */
export function ajouteDesCas(b: BanqueBrute, neufs: readonly { texte: string; quand: string; source: SourceDuCas; note?: string; etat?: EtatDuCas }[], maintenant: string): { banque: BanqueBrute; ajoutes: number } {
  const ids = new Set(b.cas.map((c) => c.id));
  const cas = [...b.cas];
  let ajoutes = 0;
  for (const n of neufs) {
    const texte = texteDuCas(n.texte);
    if (!texte) continue;
    const id = idDuCas(texte);
    if (ids.has(id)) continue;
    ids.add(id);
    cas.push({ id, texte, quand: n.quand || maintenant, source: n.source, etat: 'propose', ...(n.note?.trim() ? { note: n.note.trim().slice(0, 600) } : {}), creeLe: maintenant });
    ajoutes += 1;
  }
  return { banque: { cas }, ajoutes };
}

/** « C'EST JUSTE » : ce que l'automate fait aujourd'hui devient l'attendu. */
export function valideLeCas(b: BanqueBrute, id: string, lu: Lecture, par: string, quand: string): BanqueBrute {
  return { cas: b.cas.map((c) => (c.id === id ? { ...c, etat: 'valide', attendu: { qui: lu.qui, signes: rangeLesSignes(lu.signes) }, valideLe: quand, valideePar: par } : c)) };
}

/** « À REPRENDRE » : ce que la Maison attend à la place, et ce qu'il fallait
    répondre. Le banc le dira tant que l'automate n'y est pas. */
export function reprendsLeCas(b: BanqueBrute, id: string, attendu: Lecture, note: string, par: string, quand: string): BanqueBrute {
  return { cas: b.cas.map((c) => (c.id === id ? { ...c, etat: 'a-reprendre', attendu: { qui: attendu.qui, signes: rangeLesSignes(attendu.signes) }, ...(note.trim() ? { note: note.trim().slice(0, 600) } : {}), valideLe: quand, valideePar: par } : c)) };
}

export function retireLeCas(b: BanqueBrute, id: string): BanqueBrute {
  return { cas: b.cas.filter((c) => c.id !== id) };
}

/** LE PASSAGE DE LA BANQUE : chaque cas qui a un attendu, rejoué. Les cas
    validés qui ne tiennent plus bloquent ; les cas à reprendre qui tiennent
    enfin sont à revalider. */
export type PassageDeLaBanque = {
  justes: number;
  casses: { cas: CasDeLaBanque; ecarts: string[] }[];
  aReprendre: { cas: CasDeLaBanque; ecarts: string[] }[];
  reprisAValider: CasDeLaBanque[];
  proposes: number;
  /** Les variantes des cas validés : comprises comme l'original, ou non.
      Elles ne bloquent rien : elles disent quoi renforcer. */
  variantesJustes: number;
  variantesRatees: { cas: CasDeLaBanque; variante: string; ecarts: string[] }[];
};
/** Une variante dite comme l'original : qui répond, et ce qu'il comprend. */
export const ecartsDeLaVariante = (c: CasDeLaBanque, variante: string, conseil?: ConseilDeLaMaison): string[] =>
  (c.attendu ? ecartsDuCas(c.attendu, litLeCas(variante, c.quand, conseil)) : []);

export function passeLaBanque(b: BanqueBrute, conseil?: ConseilDeLaMaison): PassageDeLaBanque {
  const out: PassageDeLaBanque = { justes: 0, casses: [], aReprendre: [], reprisAValider: [], proposes: 0, variantesJustes: 0, variantesRatees: [] };
  for (const c of b.cas) {
    if (!c.attendu) { out.proposes += 1; continue; }
    const e = ecartsDuCas(c.attendu, litLeCas(c.texte, c.quand, conseil));
    if (c.etat === 'valide') {
      if (e.length === 0) out.justes += 1;
      else out.casses.push({ cas: c, ecarts: e });
      for (const v of c.variantes ?? []) {
        const ev = ecartsDeLaVariante(c, v, conseil);
        if (ev.length === 0) out.variantesJustes += 1;
        else out.variantesRatees.push({ cas: c, variante: v, ecarts: ev });
      }
    } else if (c.etat === 'a-reprendre') {
      if (e.length === 0) out.reprisAValider.push(c);
      else out.aReprendre.push({ cas: c, ecarts: e });
    }
  }
  return out;
}

/* ── LES CAS À PROPOSER, DEPUIS UNE CONVERSATION ───────────────────────────
   Un « tour » : les messages de la cliente envoyés coup sur coup (deux
   minutes au plus entre eux), joints. Un tour devient un cas quand il ouvre
   une conversation, ou qu'il suit un message de la Maison, ou six heures de
   silence : c'est là qu'elle demande quelque chose de neuf. Les médias et
   les messages effacés ne comptent pas. */
export type LigneDeConversation = { fil: string; deLaCliente: boolean; texte: string; quand: string };
const RAFALE_MS = 2 * 60 * 1000;
const SILENCE_MS = 6 * 60 * 60 * 1000;
const SANS_TEXTE = /^(<\s*(m[ée]dias?\s+omis|media omitted|pi[èe]ce jointe|fichier omis)[^>]*>|ce message a [ée]t[ée] supprim[ée]|vous avez supprim[ée] ce message|this message was deleted|message vocal|null)$/i;

export function toursDesConversations(lignes: readonly LigneDeConversation[]): { texte: string; quand: string }[] {
  const parFil = new Map<string, LigneDeConversation[]>();
  for (const l of lignes) parFil.set(l.fil, [...(parFil.get(l.fil) ?? []), l]);
  const out: { texte: string; quand: string }[] = [];
  for (const fil of parFil.values()) {
    const tri = [...fil].filter((l) => Number.isFinite(Date.parse(l.quand))).sort((a, b) => Date.parse(a.quand) - Date.parse(b.quand));
    let tour: { textes: string[]; debut: number; dernier: number; ouvre: boolean } | null = null;
    let precedente: { deLaCliente: boolean; t: number } | null = null;
    const ferme = () => {
      if (tour && tour.ouvre && tour.textes.length > 0) out.push({ texte: tour.textes.join('\n'), quand: new Date(tour.debut).toISOString() });
      tour = null;
    };
    for (const l of tri) {
      const t = Date.parse(l.quand);
      const texte = String(l.texte ?? '').trim();
      if (!l.deLaCliente) { ferme(); precedente = { deLaCliente: false, t }; continue; }
      if (tour && t - tour.dernier <= RAFALE_MS) {
        if (texte && !SANS_TEXTE.test(texte)) tour.textes.push(texte);
        tour.dernier = t;
      } else {
        ferme();
        const ouvre = !precedente || !precedente.deLaCliente || t - precedente.t >= SILENCE_MS;
        tour = { textes: texte && !SANS_TEXTE.test(texte) ? [texte] : [], debut: t, dernier: t, ouvre };
      }
      precedente = { deLaCliente: true, t };
    }
    ferme();
  }
  return out;
}

/* ── UNE DISCUSSION EXPORTÉE DE WHATSAPP (.txt) ────────────────────────────
   « Exporter la discussion », sans les médias, depuis le téléphone de Brice.
   Les deux formes : Android (« 30/10/2026 00:05 - Nom : texte ») et iPhone
   (« [30/10/2026 00:05:12] Nom : texte »). Une ligne sans date continue le
   message d'avant. L'heure est celle de Cotonou. */
export type LigneDExport = { quand: string; qui: string; texte: string };
const DEBUT_ANDROID = /^‎?(\d{1,2})\/(\d{1,2})\/(\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?\s+[-–]\s+([^:]{1,60}?):\s?(.*)$/;
const DEBUT_IPHONE = /^‎?\[(\d{1,2})\/(\d{1,2})\/(\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?\]\s+([^:]{1,60}?):\s?(.*)$/;

export function litUnExport(contenu: string): LigneDExport[] {
  const out: LigneDExport[] = [];
  for (const brute of String(contenu ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    const ligne = brute.replace(/[‎‏]/g, '');
    const m = DEBUT_ANDROID.exec(ligne) ?? DEBUT_IPHONE.exec(ligne);
    if (!m) {
      if (out.length > 0 && ligne.trim()) out[out.length - 1].texte += `\n${ligne.trim()}`;
      continue;
    }
    const [, j, mo, a, h, mi, s, ampm, qui, texte] = m;
    let heure = Number(h);
    if (ampm) heure = (heure % 12) + (/p/i.test(ampm) ? 12 : 0);
    const an = a.length === 2 ? 2000 + Number(a) : Number(a);
    const iso = `${an}-${mo.padStart(2, '0')}-${j.padStart(2, '0')}T${String(heure).padStart(2, '0')}:${mi}:${s ?? '00'}+01:00`;
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) continue;
    out.push({ quand: new Date(t).toISOString(), qui: qui.trim(), texte: texte.trim() });
  }
  return out;
}

/** La cliente d'un export : le nom du fichier le dit (« Discussion WhatsApp
    avec Awa.txt », « WhatsApp Chat with Awa.txt ») ; sinon, la personne qui
    n'est pas la Maison est la seconde qui écrit. */
export function clienteDeLExport(lignes: readonly LigneDExport[], nomDuFichier = ''): string {
  const qui = [...new Set(lignes.map((l) => l.qui))];
  const m = /(?:avec|with)\s+(.+?)(?:\s*\(\d+\))?\.txt$/i.exec(nomDuFichier);
  const duFichier = m?.[1]?.trim();
  if (duFichier && qui.includes(duFichier)) return duFichier;
  return qui[1] ?? qui[0] ?? '';
}

export function casDUnExport(lignes: readonly LigneDExport[], cliente: string): { texte: string; quand: string }[] {
  return toursDesConversations(lignes.map((l) => ({ fil: 'export', deLaCliente: l.qui === cliente, texte: l.texte, quand: l.quand })));
}
