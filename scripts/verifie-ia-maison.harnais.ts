/* LA PORTE VERS CLAUDE, ÉPROUVÉE — `node scripts/verifie-ia-maison.mjs`.

   19 octobre 2026. Ses choix (maquette NKQMiMMY… « Tout me va », sélecteur
   du soir) : UNE porte serveur pour les huit chantiers ; l'équipe seule, et
   le département ouvre le chantier (la direction a tout) ; jamais un numéro
   chez Claude ; 60 $ par mois pour les huit, puis Claude se tait jusqu'au
   1er ; le fin pour les photos, le rapide pour les textes ; jamais les
   papiers de la famille ; ce que Claude rend est une proposition.
   Les attentes sont écrites à la main d'après ces choix, jamais déduites du
   code. Le VRAI code de la fonction est rejoué sur de faux outils ; la vraie
   fonction et Anthropic ne sont jamais appelés. Données d'exemple. */
import { readFileSync, existsSync } from 'node:fs';
import { transformSync } from 'esbuild';
import {
  CLE_DU_COMPTEUR_DES_HUIT, MODELES_PAR_USAGE, OCTETS_MAX_PAR_IMAGE, PLAFOND_DES_HUIT_USD,
  defautDeLaDemande, jetonsAccordes, peutDemander, saitIaMaison, type DemandeIa,
} from '../src/shared/ia-maison-pur';
import { PRIX_PAR_MILLION, coutDeLAppel, moisACotonou } from '../src/shared/ia-budget-pur';
import { sansCoordonnees } from '../src/shared/ia-anonymise-pur';
// @ts-expect-error module .mjs sans types
import { copiesAJour } from './copie-dans-le-centre.mjs';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else { ko++; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};
const lis = (f: string) => readFileSync(f, 'utf8').split(String.fromCharCode(13)).join('');
const sansCommentaires = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const FONCTION = 'supabase/functions/ia-maison/index.ts';
const ORIGINAL = 'src/shared/ia-maison-pur.ts';

/* ── 1. LA RÈGLE (le contrat des huit) ───────────────────────────────── */
dit('la fonction se dit 2026-10-19-a, et le Trône ne la croit qu à partir de là', [true, false, false],
  [saitIaMaison('2026-10-19-a'), saitIaMaison('2026-10-18-z'), saitIaMaison(undefined)]);
dit('« fin-photos » : le fin pour une image, le rapide pour un texte, le milieu en remplaçant',
  { image: ['claude-opus-5-5', 'claude-sonnet-5-5'], texte: ['claude-haiku-5-5', 'claude-sonnet-5-5'] }, MODELES_PAR_USAGE);
dit('chaque modèle des huit a son prix (sinon il se compterait au plus cher)', ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'],
  [...new Set([...MODELES_PAR_USAGE.image, ...MODELES_PAR_USAGE.texte])].filter((m) => m in PRIX_PAR_MILLION));
dit('le haiku 5.5 coûte 1 $ le million en entrée, 5 $ en sortie', [1, 5], [coutDeLAppel('claude-haiku-5-5', 1_000_000, 0), coutDeLAppel('claude-haiku-5-5', 0, 1_000_000)]);
/* 120 $ depuis le 24 octobre 2026 (Tableau de bord intelligent, « jusqu'à 120 $ » au sélecteur). */
dit('son plafond : 120 $, dans son propre compteur', [120, 'mnd_ia_compteur_huit'], [PLAFOND_DES_HUIT_USD, CLE_DU_COMPTEUR_DES_HUIT]);
dit('qui peut demander : la direction tout ; un maître ce que son département ouvre ; la lettre, la direction seule ; sans rôle, rien',
  [true, true, false, true, false, false, false],
  [peutDemander('souverain', 'lettre', {}), peutDemander('gerant', 'capture', {}), peutDemander('maitre', 'capture', {}),
    peutDemander('maitre', 'reponse-wa', { 'dept-clientele': true }), peutDemander('maitre', 'reponse-wa', { 'dept-atelier': true }),
    peutDemander('maitre', 'lettre', { 'dept-clientele': true, 'dept-finances': true }), peutDemander(undefined, 'recu', { 'dept-finances': true })]);
dit('la demande : un texte n emporte pas d image, une lecture d image en a une', ['un texte n’emporte pas d’image', 'une lecture d’image sans image', null],
  [defautDeLaDemande({ chantier: 'lettre', usage: 'texte', systeme: 's', messages: [{ role: 'user', content: 'x' }], images: [{ base64: 'A'.repeat(200), mime: 'image/jpeg' }] }),
    defautDeLaDemande({ chantier: 'diagnostic', usage: 'image', systeme: 's', messages: [{ role: 'user', content: 'x' }] }),
    defautDeLaDemande({ chantier: 'lettre', usage: 'texte', systeme: 's', messages: [{ role: 'user', content: 'x' }] })]);
{
  /* Le contrat refuse lui-même une image qui n'est pas un objet (19 octobre
     2026, au soir) : avant, `'base64' in null` lançait. */
  const regle = (im: unknown) => {
    try { return defautDeLaDemande({ chantier: 'diagnostic', usage: 'image', systeme: 's', messages: [{ role: 'user', content: 'x' }], images: [im] as never }); } catch (e) { return `lance : ${String((e as Error)?.message ?? e)}`; }
  };
  dit('le contrat : une image nulle, une chaîne, un tableau sont « image mal formée », sans exception', ['image mal formée', 'image mal formée', 'image mal formée'],
    [regle(null), regle('photo.jpg'), regle([1, 2])]);
}
dit('les jetons accordés : 1500 par défaut, 4000 au plus, 50 au moins', [1500, 4000, 50], [jetonsAccordes(undefined), jetonsAccordes(10_000), jetonsAccordes(10)]);
dit('un numéro et une adresse s effacent, un montant et une date restent', 'Awa D., [numéro], [adresse], 33 000 F le 2026-10-19',
  sansCoordonnees('Awa D., 01 97 00 00 00, awa.d@exemple.com, 33 000 F le 2026-10-19'));

/* ── 2. LES COPIES DANS LA FONCTION ───────────────────────────────────── */
const blocMaison = (t: string) => { const m = /\/\* ⟨ia-maison⟩ \*\/[\s\S]*?\/\* ⟨\/ia-maison⟩ \*\//.exec(t); return m ? m[0] : 'absent'; };
dit('la fonction porte le bloc ⟨ia-maison⟩ de l original, caractère pour caractère', blocMaison(lis(ORIGINAL)), blocMaison(lis(FONCTION)));
{
  const { ecarts } = copiesAJour(lis(FONCTION), (p: string) => readFileSync(p, 'utf8')) as { ecarts: string[] };
  const copies = [...lis(FONCTION).matchAll(/\/\/ ── DÉBUT DE LA COPIE : (\S+) ──/g)].map((m) => m[1]);
  dit('... et les copies entières de l anonymisation et du budget, à jour (le mécanisme du Centre)', [[], ['src/shared/ia-anonymise-pur.ts', 'src/shared/ia-budget-pur.ts']], [ecarts, copies]);
}
dit('R8 des douze lunes connaît l original de ⟨ia-maison⟩', true,
  lis('scripts/verifie-les-douze-lunes.harnais.ts').includes("'ia-maison': { fichier: 'src/shared/ia-maison-pur.ts', extrait: (s) => entre(s, 'ia-maison') }"));

/* ── 3. LE VRAI CODE DU SERVEUR, SUR DE FAUX OUTILS ──────────────────── */
function morceau(src: string, debut: string, fin: string): string {
  const i = src.indexOf(debut);
  const k = src.indexOf(fin, i);
  if (i < 0 || k < 0) throw new Error(`morceau introuvable : ${debut}`);
  return src.slice(i, k + fin.length);
}
const copiesEntieres = (t: string) => [...t.matchAll(/\/\/ ── DÉBUT DE LA COPIE : \S+ ──\n([\s\S]*?)\/\/ ── FIN DE LA COPIE ──/g)].map((m) => m[1]).join('\n');
type Rendu = [number, Record<string, unknown>];
type Appel = Record<string, unknown>;
type ReponseFausse = { status: number; corps: Record<string, unknown> };
type Fichier = { octets: Uint8Array; mime: string; lecteurs?: string[] };
type Traite = (o: unknown, body: unknown, jwt: string) => Promise<Rendu>;
type Options = {
  role?: string; acces?: Record<string, boolean>; compteur?: Record<string, unknown>; fichiers?: Record<string, Fichier>;
  reponses?: ReponseFausse[] | ((corps: Appel) => ReponseFausse); panne?: string; maintenant?: string;
};
/** La session de chacun : un jeton, un identifiant ; la ligne staff dit le rôle. */
const JETONS: Record<string, string> = { 'jeton-de-la-fondatrice': 'u-yeman', 'jeton-de-la-gerante': 'u-gerante', 'jeton-du-maitre': 'u-maitre', 'jeton-d-un-autre-maitre': 'u-maitre-2', 'jeton-de-l-inconnu': 'u-inconnu' };
const ROLES: Record<string, string> = { 'u-yeman': 'souverain', 'u-gerante': 'gerant', 'u-maitre': 'maitre', 'u-maitre-2': 'maitre' };
const REPONSE_TEXTE: ReponseFausse = { status: 200, corps: { content: [{ type: 'text', text: 'Bonjour Awa D.,' }, { type: 'text', text: 'votre lettre.' }], usage: { input_tokens: 1000, output_tokens: 1000 }, stop_reason: 'end_turn' } };
const REPONSE_OUTIL: ReponseFausse = { status: 200, corps: { content: [{ type: 'tool_use', id: 'tu_1', name: 'reponds', input: { montant: 33000, date: '2026-10-19' } }], usage: { input_tokens: 500, output_tokens: 50 }, stop_reason: 'tool_use' } };
const MODELE_INCONNU: ReponseFausse = { status: 404, corps: { error: { type: 'not_found_error', message: 'model: claude-opus-5-5' } } };

function serveur(o: Options = {}) {
  const src = lis(FONCTION);
  const code = [blocMaison(src), copiesEntieres(src), morceau(src, '// ── DEBUT iaMaison', '// ── FIN iaMaison')].join('\n').replace(/^export /gm, '');
  const js = transformSync(code, { loader: 'ts', format: 'cjs' }).code;
  const journal: string[] = [];
  const fauxConsole = { log: (...a: unknown[]) => journal.push(a.map(String).join(' ')), error: (...a: unknown[]) => journal.push(a.map(String).join(' ')), warn: () => {} };
  // eslint-disable-next-line no-new-func
  const f = new Function('console', `${js}; return { traiteLaDemande, COFFRES_D_IMAGES };`)(fauxConsole) as { traiteLaDemande: Traite; COFFRES_D_IMAGES: readonly string[] };
  const j = { appels: [] as Appel[], ecritures: [] as Record<string, unknown>[], telechargements: [] as [string, string, string][], journal };
  let compteur: Record<string, unknown> = o.compteur ?? {};
  const file = Array.isArray(o.reponses) ? [...o.reponses] : null;
  const base = {
    utilisateur: async (jwt: string) => JETONS[jwt] ?? null,
    staff: async (uid: string) => (ROLES[uid] ? { user_id: uid, role: o.role ?? ROLES[uid] } : null),
    matrice: async () => ({ 'u-maitre': o.acces ?? {}, 'u-maitre-2': o.acces ?? {} }),
    compteur: async () => JSON.parse(JSON.stringify(compteur)) as Record<string, unknown>,
    ecrisLeCompteur: async (doc: Record<string, unknown>) => { compteur = doc; j.ecritures.push(doc); },
    /* LA RLS, EN FAUX : un fichier peut nommer les jetons qui le lisent
       (un chèque : la direction et qui l'a pris). Sans liste, l'équipe. */
    telecharge: async (coffre: string, chemin: string, jwt: string) => {
      j.telechargements.push([coffre, chemin, jwt]);
      const f = o.fichiers?.[`${coffre}/${chemin}`];
      return f && (!f.lecteurs || f.lecteurs.includes(jwt)) ? { octets: f.octets, mime: f.mime } : null;
    },
  };
  const outils = {
    base,
    appelleAnthropic: async (corps: Appel) => {
      j.appels.push(corps);
      if (o.panne) throw new Error(o.panne);
      if (typeof o.reponses === 'function') return o.reponses(corps);
      return file?.shift() ?? REPONSE_TEXTE;
    },
    maintenant: () => new Date(o.maintenant ?? '2026-10-19T10:00:00Z'),
  };
  const demande = (body: unknown, jwt = 'jeton-de-la-gerante') => f.traiteLaDemande(outils, body, jwt);
  return { ...f, j, outils, demande, compteur: () => compteur };
}

const LETTRE: DemandeIa = {
  chantier: 'lettre', usage: 'texte',
  systeme: 'Tu écris pour la Maison MND. Joindre la cliente au 01 97 00 00 00 ou awa.d@exemple.com.',
  messages: [{ role: 'user', content: 'Écris une lettre à Awa D. ; son numéro : +229 01 97 00 00 00.' }, { role: 'assistant', content: 'Bien.' }, { role: 'user', content: 'Courte.' }],
};
const PHOTO: DemandeIa = {
  chantier: 'diagnostic', usage: 'image', systeme: 'Tu lis des photos de locks.',
  messages: [{ role: 'user', content: 'Décris l’état des locks.' }],
  images: [{ base64: 'A'.repeat(200), mime: 'image/jpeg' }],
};
const SCHEMA = { type: 'object', properties: { montant: { type: 'integer' }, date: { type: 'string' } }, required: ['montant', 'date'] };
const code = ([st, r]: Rendu) => [st, r.erreur ?? r.ok];

const essais = async () => {
  /* LA PORTE. */
  {
    const s = serveur({ acces: {} });
    dit('un maître sans département : refusé, et Claude n est pas appelé', [[403, 'equipe'], 0], [code(await s.demande(LETTRE, 'jeton-du-maitre')), s.j.appels.length]);
    dit('un jeton inconnu, un jeton vide, une personne hors du personnel : refusés', [[403, 'equipe'], [403, 'equipe'], [403, 'equipe']],
      [code(await s.demande(LETTRE, 'jeton-perime')), code(await s.demande(LETTRE, '')), code(await s.demande(LETTRE, 'jeton-de-l-inconnu'))]);
    dit('la gérante et la fondatrice : acceptées', [[200, true], [200, true]], [code(await s.demande(LETTRE, 'jeton-de-la-gerante')), code(await s.demande(LETTRE, 'jeton-de-la-fondatrice'))]);
  }
  {
    const s = serveur({ acces: { 'dept-clientele': true } });
    dit('un maître de la Clientèle : la réponse WhatsApp oui, la lettre (direction seule) non', [[200, true], [403, 'equipe']],
      [code(await s.demande({ ...LETTRE, chantier: 'reponse-wa' }, 'jeton-du-maitre')), code(await s.demande(LETTRE, 'jeton-du-maitre'))]);
  }

  /* LE FORMAT. */
  {
    const s = serveur();
    const [st, r] = await s.demande({ ...LETTRE, images: PHOTO.images });
    dit('une demande texte qui emporte une image : format, avant tout appel', [400, 'format', 'La demande n’est pas recevable : un texte n’emporte pas d’image.', 0], [st, r.erreur, r.message, s.j.appels.length]);
    dit('un corps vide ou un chantier inconnu : format', [[400, 'format'], [400, 'format']], [code(await s.demande(null)), code(await s.demande({ ...LETTRE, chantier: 'inconnu' }))]);
    /* Une image nulle ou en chaîne ferait lancer la règle du contrat
       (`'base64' in null`) : la porte la refuse en format, sans trébucher. */
    let lance = '';
    const malFormees: unknown[] = [];
    for (const im of [null, 'photo.jpg', [1, 2]]) {
      try { malFormees.push(code(await s.demande({ ...PHOTO, images: [im] }))); } catch (e) { lance = String((e as Error)?.message ?? e); }
    }
    dit('une image nulle, une chaîne, un tableau : format 400, sans exception ni appel', [[[400, 'format'], [400, 'format'], [400, 'format']], '', 0], [malFormees, lance, s.j.appels.length]);
  }

  /* L'ANONYMISATION DE SÛRETÉ. */
  {
    const s = serveur();
    const [st] = await s.demande(LETTRE);
    const envoye = JSON.stringify(s.j.appels[0]);
    const fil = s.j.appels[0].messages as { content: string }[];
    dit('le numéro et l adresse de la consigne et des messages sont effacés avant l appel ; les mots restent', [200, false, true, 'Écris une lettre à Awa D. ; son numéro : [numéro].', true],
      [st, /97 00 00 00|exemple\.com/.test(envoye), /\[numéro\].*\[adresse\]/.test(String(s.j.appels[0].system)), fil[0].content, String(s.j.appels[0].system).includes('Tu écris pour la Maison MND')]);
    dit('les trois tours partent dans l ordre, la consigne à part', [['user', 'assistant', 'user'], 'Courte.'], [fil.map((m) => (m as { role: string }).role), fil[2].content]);
  }

  /* LE BUDGET. */
  {
    const plein = { '2026-10': { usd: 120, appels: 40, entree: 1, sortie: 1 } };
    const s = serveur({ compteur: plein });
    const [st, r] = await s.demande(LETTRE);
    dit('à 120 $ dans le mois : budget, 0 $ de reste, AUCUN appel, aucune écriture', [402, 'budget', 0, 'Les 120 $ du mois sont dépensés : Claude se tait jusqu’au 1er.', 0, 0],
      [st, r.erreur, r.resteUsd, r.message, s.j.appels.length, s.j.ecritures.length]);
  }
  {
    const s = serveur({ compteur: { '2026-10': { usd: 119.99, appels: 40, entree: 1, sortie: 1 } } });
    const [st, r] = await s.demande(LETTRE);
    dit('à 119,99 $ l appel part encore ; le reste dit ce qui reste après lui', [200, 0.006, 0.004], [st, r.coutUsd, r.resteUsd]);
  }
  {
    const s = serveur({ compteur: { '2026-10': { usd: 10, appels: 4, entree: 1, sortie: 1 } } });
    dit('le plafond du Centre (10 $) n est pas celui des huit : à 10 $ l appel part', [200, true], code(await s.demande(LETTRE)));
  }
  {
    const s = serveur();
    const [, r] = await s.demande(LETTRE);
    dit('le coût du haiku pour mille jetons dans chaque sens, et une seule écriture', [0.006, 119.994, 1], [r.coutUsd, r.resteUsd, s.j.ecritures.length]);
    dit('le compteur écrit : la ligne du mois à la forme du budget, et le détail par chantier à côté',
      { '2026-10': { usd: 0.006, appels: 1, entree: 1000, sortie: 1000 }, parChantier: { '2026-10': { lettre: { usd: 0.006, appels: 1 } } } }, s.j.ecritures[0]);
    await s.demande(LETTRE);
    await s.demande({ ...LETTRE, chantier: 'avis' });
    dit('trois appels : le mois les cumule, chaque chantier compte les siens',
      [{ usd: 0.018, appels: 3, entree: 3000, sortie: 3000 }, { lettre: { usd: 0.012, appels: 2 }, avis: { usd: 0.006, appels: 1 } }],
      [s.compteur()['2026-10'], (s.compteur().parChantier as Record<string, unknown>)['2026-10']]);
  }
  {
    /* 23 h 30 UTC le 31 octobre = 0 h 30 à Cotonou le 1er novembre : le mois d'octobre plein ne compte plus. */
    const s = serveur({ compteur: { '2026-10': { usd: 120, appels: 40, entree: 1, sortie: 1 } }, maintenant: '2026-10-31T23:30:00Z' });
    const [st] = await s.demande(LETTRE);
    dit('le mois est celui de Cotonou : à minuit et demie le 1er, octobre plein ne retient plus rien, et novembre s ouvre', ['2026-11', 200, { usd: 0.006, appels: 1, entree: 1000, sortie: 1000 }, { usd: 120, appels: 40, entree: 1, sortie: 1 }, { lettre: { usd: 0.006, appels: 1 } }],
      [moisACotonou(new Date('2026-10-31T23:30:00Z')), st, s.compteur()['2026-11'], s.compteur()['2026-10'], (s.compteur().parChantier as Record<string, unknown>)['2026-11']]);
  }
  {
    const s = serveur({ reponses: [{ status: 200, corps: { content: [{ type: 'text', text: 'x' }], usage: { input_tokens: 100, cache_creation_input_tokens: 200, cache_read_input_tokens: 300, output_tokens: 10 } } }] });
    const [, r] = await s.demande(LETTRE);
    dit('le cache se compte au plein prix d entrée (prudent) : 600 jetons d entrée, 10 de sortie', [0.0007, 600, 10],
      [r.coutUsd, (s.j.ecritures[0]['2026-10'] as { entree: number }).entree, (s.j.ecritures[0]['2026-10'] as { sortie: number }).sortie]);
  }
  {
    const s = serveur({ panne: 'soixante secondes sans réponse' });
    const [st, r] = await s.demande(LETTRE);
    dit('le réseau ou le délai lâche : claude 502, la raison en clair, rien d écrit', [502, 'claude', true, 0], [st, r.erreur, String(r.message).includes('soixante secondes sans réponse'), s.j.ecritures.length]);
  }
  {
    const s = serveur({ reponses: [{ status: 529, corps: { error: { type: 'overloaded_error', message: 'Overloaded' } } }] });
    const [st, r] = await s.demande(LETTRE);
    dit('Anthropic refuse (529) : claude 502 avec son message, un seul essai, rien d écrit', [502, 'claude', true, 1, 0], [st, r.erreur, String(r.message).includes('Overloaded'), s.j.appels.length, s.j.ecritures.length]);
  }

  /* LES IMAGES. */
  {
    const s = serveur();
    const [st, r] = await s.demande(PHOTO);
    const contenu = (s.j.appels[0].messages as { content: unknown }[])[0].content;
    dit('une photo en base64 part telle quelle, puis le texte ; le modèle fin la lit', [200, 'claude-opus-5-5',
      [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'A'.repeat(200) } }, { type: 'text', text: 'Décris l’état des locks.' }]],
      [st, r.modele, contenu]);
  }
  {
    const s = serveur();
    /* Resserrée le 19 octobre au soir : ce que les chantiers lisent, rien de plus. */
    dit('la liste blanche des coffres : whatsapp, fil, traces-privees, rien d autre', ['fil', 'traces-privees', 'whatsapp'], [...s.COFFRES_D_IMAGES].sort());
    const refuses = [];
    for (const coffre of ['papiers', 'secretariat', 'rh', 'signatures', 'engagements', 'entre-deux', 'site']) refuses.push(code(await s.demande({ ...PHOTO, images: [{ coffre, chemin: 'x/y.jpg' }] })));
    dit('les papiers, le secrétariat, la RH, les signatures, les engagements (une carte d identité), entre-deux et le site : refusés sans lecture ni appel',
      [Array(7).fill([400, 'format']), 0, 0], [refuses, s.j.telechargements.length, s.j.appels.length]);
  }
  {
    const fichiers = {
      'whatsapp/22901970000000/abc-photo.jpg': { octets: new Uint8Array([0, 1, 2]), mime: 'image/jpeg' },
      'fil/depense/lourde.jpg': { octets: new Uint8Array(OCTETS_MAX_PAR_IMAGE + 1), mime: 'image/jpeg' },
      'fil/devis.pdf': { octets: new Uint8Array([1, 2, 3, 4]), mime: 'application/pdf' },
    };
    const s = serveur({ fichiers });
    const [st] = await s.demande({ ...PHOTO, images: [{ coffre: 'whatsapp', chemin: '22901970000000/abc-photo.jpg' }] });
    const contenu = (s.j.appels[0].messages as { content: { source?: { data: string; media_type: string } }[] }[])[0].content[0];
    dit('une photo reçue sur WhatsApp se lit dans son coffre, AVEC LE JETON de la personne, et part en base64', [200, [['whatsapp', '22901970000000/abc-photo.jpg', 'jeton-de-la-gerante']], 'AAEC', 'image/jpeg'],
      [st, s.j.telechargements, contenu.source?.data, contenu.source?.media_type]);
    dit('plus de 4 Mo : trop-gros 413, sans appel', [[413, 'trop-gros'], 1], [code(await s.demande({ ...PHOTO, images: [{ coffre: 'fil', chemin: 'depense/lourde.jpg' }] })), s.j.appels.length]);
    const [stAbsente, rAbsente] = await s.demande({ ...PHOTO, images: [{ coffre: 'fil', chemin: 'absente.jpg' }] });
    dit('un PDF n est pas une image que Claude lit ; un fichier absent ne se lit pas non plus (403, comme un refus)', [[400, 'format'], [403, 'format', 'Cette image n’est pas lisible pour vous.'], 1],
      [code(await s.demande({ ...PHOTO, images: [{ coffre: 'fil', chemin: 'devis.pdf' }] })), [stAbsente, rAbsente.erreur, rAbsente.message], s.j.appels.length]);
  }
  {
    /* LE CHÈQUE (0134) : la RLS ne le donne qu'à la direction et à qui l'a
       pris. Le faux coffre l'imite ; la fonction lit avec le jeton reçu. */
    const fichiers = { 'traces-privees/cheque/u-maitre/2026-10-19-a1.jpg': { octets: new Uint8Array([9, 9, 9]), mime: 'image/jpeg', lecteurs: ['jeton-de-la-gerante', 'jeton-du-maitre'] } };
    const s = serveur({ fichiers, acces: { 'dept-vente-caisse': true } });
    const cheque = { ...PHOTO, chantier: 'recu' as const, images: [{ coffre: 'traces-privees', chemin: 'cheque/u-maitre/2026-10-19-a1.jpg' }] };
    const [stAutre, rAutre] = await s.demande(cheque, 'jeton-d-un-autre-maitre');
    dit('le chèque d un autre : 403, « Cette image n’est pas lisible pour vous. », et Claude n est pas appelé', [403, 'format', 'Cette image n’est pas lisible pour vous.', 0],
      [stAutre, rAutre.erreur, rAutre.message, s.j.appels.length]);
    dit('... celui qui l a pris et la gérante le lisent', [[200, true], [200, true]], [code(await s.demande(cheque, 'jeton-du-maitre')), code(await s.demande(cheque, 'jeton-de-la-gerante'))]);
    dit('chaque lecture de coffre porte le jeton de la demande, jamais un autre', ['jeton-d-un-autre-maitre', 'jeton-du-maitre', 'jeton-de-la-gerante'], s.j.telechargements.map((t) => t[2]));
  }

  /* LE SCHÉMA. */
  {
    const s = serveur({ reponses: [REPONSE_OUTIL] });
    const [st, r] = await s.demande({ ...LETTRE, chantier: 'recu', schema: SCHEMA });
    dit('avec un schéma : Claude reçoit UN outil « reponds » et l obligation de l appeler', [[{ name: 'reponds', description: 'La réponse, dans la forme demandée.', input_schema: SCHEMA }], { type: 'tool', name: 'reponds' }],
      [s.j.appels[0].tools, s.j.appels[0].tool_choice]);
    dit('... et la fonction rend data depuis le tool_use, texte vide', [200, { montant: 33000, date: '2026-10-19' }, '', 'claude-haiku-5-5'], [st, r.data, r.texte, r.modele]);
  }
  {
    const s = serveur({ reponses: [REPONSE_TEXTE] });
    const [st, r] = await s.demande({ ...LETTRE, schema: SCHEMA });
    dit('un schéma mais pas de tool_use : claude, et le coût est dû quand même', [502, 'claude', 'Claude n’a pas répondu dans la forme demandée.', 1], [st, r.erreur, r.message, s.j.ecritures.length]);
  }
  {
    /* Au bout de ses jetons, l'outil est inachevé : une liste de trois sur
       cinq aurait l'air entière. Refusée, et le coût est dû. */
    const coupee: ReponseFausse = { status: 200, corps: { content: [{ type: 'tool_use', id: 'tu_2', name: 'reponds', input: { montant: 33000 } }], usage: { input_tokens: 500, output_tokens: 1500 }, stop_reason: 'max_tokens' } };
    const s = serveur({ reponses: [coupee] });
    const [st, r] = await s.demande({ ...LETTRE, chantier: 'recu', schema: SCHEMA });
    dit('un outil coupé au bout des jetons : claude 502, rien de rendu, le coût compté', [502, 'claude', 'La réponse de Claude a été coupée avant la fin : redemandez plus court.', undefined, 1],
      [st, r.erreur, r.message, r.data, s.j.ecritures.length]);
  }
  {
    const s = serveur();
    const [st, r] = await s.demande(LETTRE);
    dit('sans schéma : pas d outil, le texte des blocs joints, data nulle', [200, undefined, undefined, 'Bonjour Awa D.,\nvotre lettre.', null],
      [st, s.j.appels[0].tools, s.j.appels[0].tool_choice, r.texte, r.data]);
  }

  /* LE MODÈLE ET SON REMPLAÇANT. */
  {
    const s = serveur({ reponses: [MODELE_INCONNU, REPONSE_TEXTE] });
    const [st, r] = await s.demande(PHOTO);
    dit('le fin n est pas ouvert à la clé (404) : le remplaçant prend, et le coût est le sien', [200, ['claude-opus-5-5', 'claude-sonnet-5-5'], 'claude-sonnet-5-5', 0.018],
      [st, s.j.appels.map((a) => a.model), r.modele, r.coutUsd]);
  }
  {
    const s = serveur({ reponses: [{ status: 400, corps: { error: { type: 'invalid_request_error', message: 'model: claude-haiku-5-5 is not available' } } }, REPONSE_TEXTE] });
    dit('un 400 qui parle du modèle vaut aussi un remplaçant', [[200, true], ['claude-haiku-5-5', 'claude-sonnet-5-5']], [code(await s.demande(LETTRE)), s.j.appels.map((a) => a.model)]);
  }
  {
    const s = serveur({ reponses: [{ status: 400, corps: { error: { type: 'invalid_request_error', message: 'messages: text content blocks must be non-empty' } } }] });
    const [st, r] = await s.demande(LETTRE);
    dit('un autre 400 : claude 502 avec le message d Anthropic en clair, sans second essai', [502, true, 1], [st, String(r.message).includes('text content blocks must be non-empty'), s.j.appels.length]);
    dit('... et le journal dit le refus (statut, genre) sans son message', [['ia-maison: lettre claude-haiku-5-5 refus 400 invalid_request_error'], false],
      [s.j.journal, s.j.journal.join('\n').includes('text content blocks')]);
  }
  {
    const s = serveur({ reponses: [MODELE_INCONNU, MODELE_INCONNU] });
    dit('aucun modèle ouvert : claude 502', [502, 'claude'], code(await s.demande(PHOTO)));
  }
  {
    const s = serveur();
    await s.demande(LETTRE);
    await s.demande({ ...LETTRE, maxTokens: 10_000 });
    dit('max_tokens : 1500 par défaut, borné à 4000 ; la consigne en system', [1500, 4000, true], [s.j.appels[0].max_tokens, s.j.appels[1].max_tokens, String(s.j.appels[0].system).startsWith('Tu écris')]);
  }

  /* LE JOURNAL. */
  {
    const s = serveur();
    await s.demande(LETTRE);
    dit('le journal dit le chantier, le modèle, les jetons et le coût, jamais le contenu', [1, true, false],
      [s.j.journal.length, /lettre claude-haiku-5-5 entrée=1000 sortie=1000 coût=0\.006/.test(s.j.journal[0] ?? ''), /Awa|Tu écris|Courte/.test(s.j.journal.join('\n'))]);
  }
};

/* ── 3 bis. LES VRAIS OUTILS, SUR UN FAUX SUPABASE ─────────────────────
   Le coffre se lit avec la SESSION de la personne (19 octobre 2026, au
   soir) : le vrai code des outils, de « LES VRAIS OUTILS » jusqu'à l'appel
   d'Anthropic, rejoué avec un faux `createClient` et un faux client de
   service qui notent tout. Les clés sont des chaînes d'exemple. */
const SERVICE = 'cle-de-service-du-banc';
const ENV: Record<string, string> = { CLE_SERVICE: SERVICE, SUPABASE_SERVICE_ROLE_KEY: 'autre-cle-de-service', SUPABASE_ANON_KEY: 'cle-publique-de-l-environnement' };
async function vraisOutils() {
  const src = lis(FONCTION);
  const i = src.indexOf('/* ══ LES VRAIS OUTILS');
  const k = src.indexOf('/** Anthropic, soixante secondes');
  if (i < 0 || k < i) { dit('les vrais outils se trouvent entre leurs repères', true, false); return; }
  const js = transformSync(src.slice(i, k), { loader: 'ts', format: 'cjs' }).code;
  const clients: { cle: string; autorisation: string }[] = [];
  const parLeService: string[] = [];
  const fauxCreateClient = (_url: string, cle: string, opts: { global?: { headers?: Record<string, string> } }) => {
    clients.push({ cle, autorisation: opts?.global?.headers?.Authorization ?? '' });
    return { storage: { from: (coffre: string) => ({ download: async (chemin: string) => ({ data: new Blob([new Uint8Array([7, 7])], { type: 'image/jpeg' }), error: null, coffre, chemin }) }) } };
  };
  const fauxAdmin = {
    storage: { from: (coffre: string) => { parLeService.push(coffre); return { download: async () => ({ data: new Blob([new Uint8Array([1])], { type: 'image/jpeg' }), error: null }) }; } },
    auth: { getUser: async () => ({ data: { user: { id: 'u-gerante' } } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }), upsert: async () => ({ error: null }) }),
  };
  const fauxDeno = { env: { get: (n: string) => ENV[n] } };
  // eslint-disable-next-line no-new-func
  const f = new Function('admin', 'createClient', 'Deno', 'SUPABASE_URL', 'SERVICE_KEY', 'CLE_DU_COMPTEUR_DES_HUIT',
    `${js}; return { clePubliqueDe, baseDeLaRequete };`)(fauxAdmin, fauxCreateClient, fauxDeno, 'https://exemple.supabase.co', SERVICE, CLE_DU_COMPTEUR_DES_HUIT) as {
    clePubliqueDe: (req: { headers: Headers }) => string;
    baseDeLaRequete: (cle: string) => { telecharge: (c: string, ch: string, jwt: string) => Promise<{ octets: Uint8Array; mime: string } | null> };
  };
  const req = (h: Record<string, string>) => ({ headers: new Headers(h) });
  dit('la clé du lecteur : l apikey reçue ; sans elle, ou si c est une clé de service, celle de l environnement',
    ['cle-publique-du-trone', 'cle-publique-de-l-environnement', 'cle-publique-de-l-environnement', 'cle-publique-de-l-environnement'],
    [f.clePubliqueDe(req({ apikey: 'cle-publique-du-trone' })), f.clePubliqueDe(req({})), f.clePubliqueDe(req({ apikey: SERVICE })), f.clePubliqueDe(req({ apikey: 'autre-cle-de-service' }))]);
  const base = f.baseDeLaRequete(f.clePubliqueDe(req({ apikey: 'cle-publique-du-trone' })));
  const lu = await base.telecharge('traces-privees', 'cheque/u-maitre/a1.jpg', 'jeton-du-maitre');
  dit('un coffre se lit par un client à la clé publique et au jeton de la personne', [[{ cle: 'cle-publique-du-trone', autorisation: 'Bearer jeton-du-maitre' }], [7, 7], 'image/jpeg'],
    [clients, lu ? [...lu.octets] : null, lu?.mime]);
  const parService = await base.telecharge('fil', 'depense/x.jpg', SERVICE);
  const sansJeton = await base.telecharge('fil', 'depense/x.jpg', '');
  const sansCle = await f.baseDeLaRequete('').telecharge('fil', 'depense/x.jpg', 'jeton-du-maitre');
  dit('un jeton qui serait la clé de service, un jeton vide, une clé publique absente : rien ne se lit, aucun client créé', [null, null, null, 1], [parService, sansJeton, sansCle, clients.length]);
  dit('le client de service ne lit JAMAIS un coffre, et aucun lecteur ne porte une clé de service', [[], false],
    [parLeService, clients.some((c) => [SERVICE, 'autre-cle-de-service'].includes(c.cle) || [SERVICE, 'autre-cle-de-service'].some((s) => c.autorisation.includes(s)))]);
}

/* ── 4. LA STRUCTURE DE LA FONCTION ───────────────────────────────────── */
const structure = () => {
  const brut = lis(FONCTION);
  const f = sansCommentaires(brut);
  dit('la fonction dit sa version et répond 405 à un GET avec elle', [true, true], [/const VERSION = '2026-10-24-a';/.test(f), /if \(req\.method !== 'POST'\) return json\(\{ error: 'method', version: VERSION \}, 405\);/.test(f)]);
  dit('l en-tête dit Verify JWT ALLUMÉ, et les secrets qui existent déjà', [true, true, true], [/Verify JWT ALLUMÉ/.test(brut), /ANTHROPIC_API_KEY et CLE_SERVICE/.test(brut), /aucun secret nouveau/.test(brut)]);
  dit('la porte lit la personne du jeton, puis sa ligne staff (rôle)', [true, true],
    [/await admin\.auth\.getUser\(jwt\)/.test(f), /from\('staff'\)\.select\('user_id, role'\)\.eq\('user_id', uid\)\.maybeSingle\(\)/.test(f)]);
  const documents = [...f.matchAll(/(?<!function )lisLeDocument(?:<[^>]*>)?\(([^,]+),/g)].map((m) => m[1].trim());
  dit('elle ne lit que deux documents : la matrice des départements et son compteur ; jamais la table des clientes', [['\'mnd_staff_access\'', 'CLE_DU_COMPTEUR_DES_HUIT'], 1, 2, false],
    [documents, (f.match(/\.eq\('key', /g) ?? []).length, (f.match(/from\('documents'\)/g) ?? []).length, /from\('clients'\)/.test(f)]);
  dit('le compteur s écrit par un upsert de la clé des huit', true, /upsert\(\{ key: CLE_DU_COMPTEUR_DES_HUIT, data: doc \}\)/.test(f));
  dit('aucun coffre ne se lit par le client de service ; chaque requête bâtit ses outils avec SA clé publique', [false, true, true],
    [/admin\s*\.\s*storage/.test(f), /base: baseDeLaRequete\(clePubliqueDe\(req\)\)/.test(f), /o\.base\.telecharge\(im\.coffre, im\.chemin, jwt\)/.test(f)]);
  dit('Anthropic par fetch, la clé en en-tête, la version d API, soixante secondes au plus', [true, true, true, true],
    [/fetch\('https:\/\/api\.anthropic\.com\/v1\/messages'/.test(f), /'x-api-key': ANTHROPIC_API_KEY/.test(f), /'anthropic-version': '2023-06-01'/.test(f), /setTimeout\(\(\) => arret\.abort\(\), 60_000\)/.test(f)]);
  /* La clé ne vit que sur trois lignes : lue, exigée, mise en en-tête. Toute
     autre ligne (un console.log, un json) est une fuite. */
  dit('la clé n est jamais journalisée ni rendue : trois lignes seulement la portent', [
    "const ANTHROPIC_API_KEY = (Deno.env.get('ANTHROPIC_API_KEY') ?? '').trim();",
    "if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY manque dans les secrets de la fonction.');",
    "headers: { 'content-type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },",
  ], f.split('\n').filter((l) => l.includes('ANTHROPIC_API_KEY')).map((l) => l.trim()));
  dit('le bloc rejoué reçoit ses outils : traiteLaDemande(outils, body, jwt), et Deno.serve l appelle', [true, true],
    [/async function traiteLaDemande\(o: OutilsDeLaMaison, body: unknown, jwt: string\)/.test(f), /await traiteLaDemande\(outils, body, jwt\)/.test(f)]);
  dit('le plafond se lit avant l appel, dans le bloc', true, f.indexOf('const permis = peutAppeler(') > 0 && f.indexOf('const permis = peutAppeler(') < f.indexOf('await o.appelleAnthropic('));
  dit('le Trône appelle bien une fonction nommée ia-maison', true, /const FONCTION = 'ia-maison';/.test(lis('src/shared/ia-maison.ts')));
  dit('docs/ia-maison.md existe et dit la porte, Verify JWT, le plafond et le compteur', [true, true, true, true],
    [existsSync('docs/ia-maison.md'), /Verify JWT/.test(lis('docs/ia-maison.md')), /120 \$/.test(lis('docs/ia-maison.md')), /mnd_ia_compteur_huit/.test(lis('docs/ia-maison.md'))]);
};

/* Un vrai code qui plante est un échec dit, pas un banc qui s'arrête :
   la structure se lit quand même. */
try { await essais(); } catch (e) { ko++; console.log(`ECHEC le vrai code de la fonction plante sur de faux outils\n       ${String((e as Error)?.message ?? e).slice(0, 200)}`); }
try { await vraisOutils(); } catch (e) { ko++; console.log(`ECHEC les vrais outils plantent sur un faux Supabase\n       ${String((e as Error)?.message ?? e).slice(0, 200)}`); }
structure();
console.log(ko === 0 ? '\nTOUT VA BIEN : la porte vers Claude tient ses promesses.' : `\n${ko} ÉCHEC(S)`);
if (ko) process.exitCode = 1;
