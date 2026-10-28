/* LE CHAT DE LA MAISON, ÉPROUVÉ — `node scripts/verifie-le-chat-du-site.mjs`.

   19 octobre 2026. Maquette BPWmpyyw… validée (« construis »), ses choix lus
   en base (maquette/chat) : la bulle façon FedaPay ; « En ligne » quand
   quelqu'un a pris la permanence ; la direction et la Clientèle répondent ;
   civilité, nom et numéro avant d'écrire ; 3 minutes sans réponse, le chat
   le dit ; CLAUDE RÉPOND SEUL QUAND PERSONNE N'EST LÀ, jamais un prix ni une
   place, il se dit automatique ; une discussion gardée 90 jours.
   Les attentes viennent de ces choix, jamais du code. Le vrai code du
   serveur est rejoué sur une fausse base. Données d'exemple. */
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { transformSync } from 'esbuild';
import {
  ATTENTE_AVANT_WHATSAPP_MIN, GARDE_DES_DISCUSSIONS_JOURS, REPONSES_AUTO_MAX, LECTURE_LENTE_MS, LECTURE_RAPIDE_MS,
  attenteDepassee, consigneDeClaude, enPermanence, etatDeLaDiscussion, finDePermanence, heuresPourClaude, limiteDesDiscussions,
  messagesPourClaude, motDAttente, motHorsPermanence, numeroDit, peutRepondre, prochaineLecture, reponseSure, reponsesAuto, texteDuMessage,
} from '../src/shared/chat-du-site-pur';
import { ECRANS_NES_APRES_LES_DEPARTEMENTS, NAV, REUNIONS, peutVoir } from '../src/apps/trone/routes/index';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else { ko++; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};
const lis = (f: string) => readFileSync(f, 'utf8').split(String.fromCharCode(13)).join('');
const sansCommentaires = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const sqlSansCommentaires = (t: string) => t.replace(/--.*$/gm, '');
const SERVEUR = 'supabase/functions/discussion/index.ts';
const MIGRATION = 'supabase/migrations/0136_les_discussions_du_site.sql';
const T0 = Date.parse('2026-10-19T10:00:00Z');

/* ── 1. LA RÈGLE ──────────────────────────────────────────────────────── */
dit('ses choix : 90 jours, 3 minutes, Claude 4 fois au plus', [90, 3, 4], [GARDE_DES_DISCUSSIONS_JOURS, ATTENTE_AVANT_WHATSAPP_MIN, REPONSES_AUTO_MAX]);
dit('un message : sans blancs en trop, borné à mille signes, vide sinon', ['Bonjour la Maison', 1000, '', 'a\n\nb'],
  [texteDuMessage('  Bonjour   la  Maison  '), texteDuMessage('x'.repeat(5000)).length, texteDuMessage('   '), texteDuMessage('a\n\n\n\nb')]);
dit('le numéro du Bénin se dit par paires, un autre garde son indicatif', ['01 97 00 00 00', '+33612345678', ''],
  [numeroDit('+2290197000000'), numeroDit('+33612345678'), numeroDit('')]);
dit('la permanence : seulement celles qui courent encore', ['u1'],
  enPermanence([{ user_id: 'u1', jusqua: new Date(T0 + 60_000).toISOString() }, { user_id: 'u2', jusqua: new Date(T0 - 60_000).toISOString() }, { user_id: 'u3', jusqua: 'n importe quoi' }], T0).map((p) => p.user_id));
/* Huit heures, jamais après 20 h à Cotonou (UTC+1) ; prise la nuit (avant 8 h, après 19 h 30), deux heures.
   Heures de Cotonou : 4 h, 11 h, 19 h, 20 h, 0 h 30. */
dit('une permanence dure huit heures au plus, jamais après 20 h à Cotonou ; prise la nuit, deux heures',
  ['2026-10-19T05:00:00.000Z', '2026-10-19T18:00:00.000Z', '2026-10-19T19:00:00.000Z', '2026-10-19T21:00:00.000Z', '2026-10-20T01:30:00.000Z'],
  ['2026-10-19T03:00:00Z', '2026-10-19T10:00:00Z', '2026-10-19T18:00:00Z', '2026-10-19T19:00:00Z', '2026-10-19T23:30:00Z'].map((t) => finDePermanence(Date.parse(t))));
{
  /* LA PORTE DU SERVEUR EST CELLE DE LA BARRE (sa décision : la direction et
     le département Clientèle). Les attentes viennent de sa décision ; la
     barre doit dire la même chose. */
  const cas: [string, Record<string, boolean>][] = [
    ['souverain', {}], ['gerant', {}], ['maitre', {}], ['maitre', { 'dept-clientele': true }],
    ['maitre', { '/discussions': true }], ['maitre', { clients: true }], ['maitre', { 'dept-finances': true }],
  ];
  const decision = [true, true, false, true, true, false, false];
  dit('qui peut répondre : la direction, la Clientèle, ou l écran donné à la main', decision, cas.map(([r, a]) => peutRepondre(r, a)));
  dit('... et la barre du Trône ouvre l écran aux mêmes', decision, cas.map(([r, a]) => peutVoir(r, '/discussions', a)));
  dit('personne sans rôle ne répond', false, peutRepondre(undefined, {}));
}
dit('l écran Discussions vit à la Clientèle, et se dit né après les départements', ['Clientèle', true],
  [NAV.find((g) => g.items.some((i) => i.path === '/discussions'))?.group, ECRANS_NES_APRES_LES_DEPARTEMENTS.includes('/discussions')]);
/* Sans rubrique de plus (elle trie ses rubriques) : un onglet de Conversations, entre WhatsApp et les appels. */
dit('... un onglet « Le chat du site » de Conversations, pas une rubrique de plus', [['/conversations', '/discussions', '/appels'], true],
  [REUNIONS.find((r) => r.hote === '/conversations')?.onglets.map((o) => o.path), NAV.flatMap((g) => g.items).find((i) => i.path === '/discussions')?.horsMenu === true]);
{
  const m = (de: string, minAvant: number) => ({ de: de as never, cree_le: new Date(T0 - minAvant * 60_000).toISOString() });
  dit('le silence dure : la visiteuse attend depuis 3 minutes, rien ne lui a répondu', [true, false, false, false],
    [attenteDepassee([m('visiteuse', 3)], T0), attenteDepassee([m('visiteuse', 2)], T0), attenteDepassee([m('visiteuse', 9), m('maison', 1)], T0), attenteDepassee([], T0)]);
  dit('on lit vite tant qu elle attend une réponse, lentement sinon', [LECTURE_RAPIDE_MS, LECTURE_LENTE_MS, LECTURE_LENTE_MS, LECTURE_LENTE_MS],
    [prochaineLecture([m('visiteuse', 1)], T0), prochaineLecture([m('visiteuse', 30)], T0), prochaineLecture([m('visiteuse', 1), m('maison', 0)], T0), prochaineLecture([], T0)]);
}
dit('Claude a répondu combien de fois', 2, reponsesAuto([{ de: 'auto' }, { de: 'visiteuse' }, { de: 'auto' }, { de: 'systeme' }]));
dit('une discussion s efface 90 jours après son dernier message', T0 - 90 * 86_400_000, limiteDesDiscussions(T0));
dit('à répondre tant que l équipe n a pas parlé ; close l emporte', ['a-repondre', 'repondue', 'close', 'repondue'],
  [etatDeLaDiscussion({ etat: 'ouverte', dernier_de: 'visiteuse' }), etatDeLaDiscussion({ etat: 'ouverte', dernier_de: 'maison' }),
    etatDeLaDiscussion({ etat: 'close', dernier_de: 'visiteuse' }), etatDeLaDiscussion({ etat: 'ouverte', dernier_de: null })]);
dit('les heures pour Claude : les jours pareils ensemble, fermé dit fermé, rien d inventé sans semaine',
  [['du lundi au mercredi : 09h00 à 19h00', 'du jeudi au samedi : 09h00 à 20h00', 'dimanche : fermé'], []],
  [heuresPourClaude([
    { key: 'lun', open: '09h00', close: '19h00', closed: false }, { key: 'mar', open: '9h00', close: '19:00', closed: false }, { key: 'mer', open: '09h00', close: '19h00', closed: false },
    { key: 'jeu', open: '09h00', close: '20h00', closed: false }, { key: 'ven', open: '09h00', close: '20h00', closed: false }, { key: 'sam', open: '09h00', close: '20h00', closed: false },
    { key: 'dim', open: '10h00', close: '16h00', closed: true },
  ]), heuresPourClaude(undefined)]);
{
  const c = consigneDeClaude({ appel: 'Mme Clarisse', heures: ['du lundi au samedi : 09h00 à 19h00'], maintenant: 'lundi 19 octobre 2026 à 10:00' });
  dit('la consigne de Claude : jamais un prix, jamais une place, pas de diagnostic, il se dit automatique, il passe la main par WhatsApp, jamais « salon »',
    [true, true, true, true, true, true, true],
    [/JAMAIS de prix/.test(c), /JAMAIS une place/.test(c), /aucun avis médical/.test(c), /réponse automatique/.test(c), /répondra sur WhatsApp/.test(c), /jamais le mot « salon »/.test(c), /Mme Clarisse/.test(c)]);
  dit('... et il connaît les heures, l adresse, la réservation en ligne', [true, true, true],
    [/09h00 à 19h00/.test(c), /Suru-Léré/.test(c), /maisonmnd\.com\/reserver/.test(c)]);
  dit('... sans heures, il n en donne aucune', true, /ne donne aucune heure/.test(consigneDeClaude({ appel: 'Ola', heures: [], maintenant: 'x' })));
}
dit('les tours pour Claude : la visiteuse parle, la Maison répond, les mots du chat ne comptent pas, deux tours du même côté se fondent',
  [{ role: 'user', content: 'Bonjour\nIl reste de la place ?' }, { role: 'assistant', content: 'Bonjour Madame' }, { role: 'user', content: 'Merci' }],
  messagesPourClaude([{ de: 'maison', texte: 'mot d avant' }, { de: 'visiteuse', texte: 'Bonjour' }, { de: 'systeme', texte: 'Message reçu' }, { de: 'visiteuse', texte: 'Il reste de la place ?' },
    { de: 'auto', texte: 'Bonjour Madame' }, { de: 'visiteuse', texte: 'Merci' }]));
dit('ce que Claude écrit ne part pas s il donne un prix ou dit « salon » ; le tiret long devient une virgule',
  ['', '', '', '', 'La Maison vous reçoit, du lundi au samedi.', 'Venez 2 fois par mois si besoin.'],
  [reponseSure('Un entretien coûte 15 000 F.'), reponseSure('Comptez 20000 francs.'), reponseSure('Environ 10 000 FCFA'), reponseSure('Notre salon vous attend.'),
    reponseSure('La Maison vous reçoit — du lundi au samedi.'), reponseSure('Venez 2 fois par mois si besoin.')]);
dit('les mots du chat disent WhatsApp et le numéro qu elle a donné', [true, true],
  [motHorsPermanence('+2290197000000').includes('WhatsApp au 01 97 00 00 00'), motDAttente('+2290197000000').includes('WhatsApp au 01 97 00 00 00')]);

/* ── 2. LE BLOC RECOPIÉ DANS LA FONCTION ─────────────────────────────── */
const bloc = (t: string) => { const m = /\/\* ⟨chat-du-site⟩ \*\/[\s\S]*?\/\* ⟨\/chat-du-site⟩ \*\//.exec(t); return m ? m[0] : 'absent'; };
dit('la fonction porte le bloc de la règle, caractère pour caractère', bloc(lis('src/shared/chat-du-site-pur.ts')), bloc(lis(SERVEUR)));

/* ── 3. LE VRAI CODE DU SERVEUR, SUR UNE FAUSSE BASE ─────────────────── */
function morceau(src: string, debut: string, fin: string): string {
  const i = src.indexOf(debut);
  const k = src.indexOf(fin, i);
  if (i < 0 || k < 0) throw new Error(`morceau introuvable : ${debut}`);
  return src.slice(i, k + fin.length);
}
type Rendu = [number, Record<string, unknown>];
type Ligne = Record<string, unknown> & { id: string };
type Msg = { id: number; discussion_id: string; de: string; texte: string; genre?: string; cree_le: string };
function serveur(o: { presents?: string[]; claude?: (s: string) => string } = {}) {
  const src = lis(SERVEUR);
  const code = [
    morceau(src, 'const appelDe = (', '\n};\n'),
    bloc(src).replace(/^export /gm, ''),
    morceau(src, 'function telephoneNormalise(', '\n}\n'),
    morceau(src, '// ── DEBUT discussion', '// ── FIN discussion'),
  ].join('\n');
  const js = transformSync(code, { loader: 'ts', format: 'cjs' }).code;
  // eslint-disable-next-line no-new-func
  const f = new Function(`${js}; return { ouvrir, ecrire, lire, etatDuChat };`)() as {
    ouvrir: (o: unknown, b: unknown, br: string) => Promise<Rendu>; ecrire: (o: unknown, b: unknown) => Promise<Rendu>;
    lire: (o: unknown, b: unknown) => Promise<Rendu>; etatDuChat: (o: unknown) => Promise<Rendu>;
  };
  let horloge = T0;
  let n = 0;
  const j = { discussions: new Map<string, Ligne>(), messages: [] as Msg[], alertes: [] as Record<string, unknown>[], claudes: [] as { systeme: string; messages: unknown[] }[], effaces: [] as string[], fonds: 0 };
  const base = {
    permanences: async () => (o.presents ?? []).map((u) => ({ user_id: u, jusqua: new Date(horloge + 3_600_000).toISOString() })),
    creeDiscussion: async (d: Ligne) => { j.discussions.set(d.id, { ...d }); return true; },
    discussion: async (id: string) => (j.discussions.has(id) ? { ...j.discussions.get(id)! } : null),
    messages: async (id: string, apres: number) => j.messages.filter((m) => m.discussion_id === id && m.id > apres),
    derniersMessages: async (id: string, k: number) => j.messages.filter((m) => m.discussion_id === id).slice(-k),
    ecris: async (id: string, de: string, texte: string, genre?: string) => {
      n += 1;
      const m: Msg = { id: n, discussion_id: id, de, texte, ...(genre ? { genre } : {}), cree_le: new Date(horloge).toISOString() };
      j.messages.push(m);
      /* Le déclencheur de 0136 : seules la visiteuse et l'équipe disent qui a parlé. */
      const d = j.discussions.get(id);
      if (d) { d.derniere_le = m.cree_le; if (de === 'visiteuse' || de === 'maison') d.dernier_de = de; }
      return m;
    },
    touche: async (id: string, champs: Record<string, unknown>) => { const d = j.discussions.get(id); if (d) Object.assign(d, champs); },
    heures: async () => [{ key: 'lun', open: '09h00', close: '19h00', closed: false }],
    efface: async (limite: string) => { j.effaces.push(limite); },
  };
  const outils = {
    base,
    maintenant: () => horloge,
    empreinte: async (t: string) => createHash('sha256').update(t).digest('hex'),
    jeton: () => `jeton-${randomUUID()}`,
    nouvelId: () => `disc-${randomUUID()}`,
    alerte: async (a: Record<string, unknown>) => { j.alertes.push(a); return 1; },
    claude: async (systeme: string, messages: unknown[]) => {
      j.claudes.push({ systeme, messages });
      return o.claude ? o.claude(systeme) : 'Bonjour Mme Clarisse, ici la réponse automatique de la Maison MND. Vous pouvez choisir votre heure sur maisonmnd.com/reserver/. Une personne de l’équipe vous répondra sur WhatsApp dès son retour.';
    },
    fond: (p: Promise<unknown>) => { j.fonds += 1; void p; },
  };
  return { ...f, j, outils, avance: (ms: number) => { horloge += ms; } };
}
const CLARISSE = { action: 'ouvrir', civilite: 'madame', prenom: 'Clarisse', nom: 'Dossou', telephone: '01 97 00 00 00', page: '/soins-locks/' };

const essais = async () => {
  /* Ouvrir. */
  {
    const s = serveur();
    const [st, r] = await s.ouvrir(s.outils, CLARISSE, 'br-maison');
    const ligne = s.j.discussions.get(String(r.id)) ?? {} as Ligne;
    dit('ouvrir : un identifiant, un jeton, l appel « Mme Clarisse », hors ligne sans permanence', [200, true, true, 'Mme Clarisse', false],
      [st, /^disc-[0-9a-f-]{36}$/.test(String(r.id)), String(r.jeton).length >= 20, r.appel, r.enLigne]);
    dit('la base ne garde que l empreinte du jeton, jamais le jeton', [true, false],
      [ligne.jeton_hash === createHash('sha256').update(String(r.jeton)).digest('hex'), Object.values(ligne).includes(r.jeton)]);
    dit('la discussion garde civilité, prénom, nom, numéro en E.164, page, branche', ['madame', 'Clarisse', 'Dossou', '+2290197000000', '/soins-locks/', 'br-maison', 'ouverte'],
      [ligne.civilite, ligne.prenom, ligne.nom, ligne.telephone, ligne.page, ligne.branch_id, ligne.etat]);
    dit('... et les vieilles discussions partent en passant (90 jours)', [new Date(limiteDesDiscussions(T0)).toISOString()], s.j.effaces);
    dit('sans numéro, sans nom : refusé', [[400, 'telephone'], [400, 'nom']], [
      await s.ouvrir(s.outils, { ...CLARISSE, telephone: '12' }, 'b').then(([a, b]) => [a, b.error]),
      await s.ouvrir(s.outils, { ...CLARISSE, prenom: ' ', nom: '' }, 'b').then(([a, b]) => [a, b.error]),
    ]);
    dit('une civilité inventée ne passe pas ; sans civilité, le prénom seul', [null, 'Clarisse'],
      await s.ouvrir(s.outils, { ...CLARISSE, civilite: 'docteur' }, 'b').then(([, b]) => [s.j.discussions.get(String(b.id))?.civilite ?? null, b.appel]));
  }

  /* Personne de permanence : Claude répond seul. */
  {
    const s = serveur();
    const [, r] = await s.ouvrir(s.outils, CLARISSE, 'br');
    const porte = { id: r.id, jeton: r.jeton };
    dit('un mauvais jeton n ouvre rien', [403, 403, 403], [
      (await s.ecrire(s.outils, { ...porte, jeton: 'jeton-faux-mais-assez-long-pour-passer', texte: 'x' }))[0],
      (await s.lire(s.outils, { id: r.id }))[0],
      (await s.ecrire(s.outils, { id: 'disc-inconnue', jeton: r.jeton, texte: 'x' }))[0],
    ]);
    const [st, e] = await s.ecrire(s.outils, { ...porte, texte: '  Bonjour, il vous reste de la place samedi ?  ', apres: 0 });
    const msgs = (e.messages ?? []) as Msg[];
    dit('personne n est là : son message, puis la réponse automatique de Claude, rendus aussitôt', [200, ['visiteuse', 'auto'], false],
      [st, msgs.map((m) => m.de), e.enLigne]);
    dit('Claude a reçu la consigne et la conversation, sans jamais son numéro', [1, true, false, false, 'Bonjour, il vous reste de la place samedi ?'],
      [s.j.claudes.length, /Mme Clarisse/.test(s.j.claudes[0]?.systeme ?? ''), /97 00 00 00|2290197/.test(s.j.claudes[0]?.systeme ?? ''),
        /97 00 00 00|2290197/.test(JSON.stringify(s.j.claudes[0]?.messages)), (s.j.claudes[0]?.messages as { content: string }[])[0]?.content]);
    dit('l équipe l apprend (personne de permanence), sans restriction', [1, true, undefined, String(r.id)],
      [s.j.alertes.length, /personne de permanence/.test(String(s.j.alertes[0]?.titre)), s.j.alertes[0]?.seulement, s.j.alertes[0]?.discussionId]);
    dit('Claude ne rend pas « répondue » : la discussion reste à répondre au Trône', 'visiteuse', s.j.discussions.get(String(r.id))?.dernier_de);
    await s.ecrire(s.outils, { ...porte, texte: 'Merci' });
    dit('... et l équipe n est pas resonnée dans la demi-heure', 1, s.j.alertes.length);
    for (let i = 0; i < 4; i++) await s.ecrire(s.outils, { ...porte, texte: `encore ${i}` });
    dit('quatre réponses de Claude au plus, puis le mot du chat, une seule fois', [4, 1],
      [s.j.messages.filter((m) => m.de === 'auto').length, s.j.messages.filter((m) => m.genre === 'hors-permanence').length]);
  }
  {
    const s = serveur({ claude: () => 'Un entretien coûte 15 000 F, venez au salon.' });
    const [, r] = await s.ouvrir(s.outils, CLARISSE, 'br');
    const [, e] = await s.ecrire(s.outils, { id: r.id, jeton: r.jeton, texte: 'Combien ?' });
    dit('Claude donne un prix : rien ne part de lui, le mot du chat le remplace', [['visiteuse', 'systeme'], 'hors-permanence'],
      [((e.messages ?? []) as Msg[]).map((m) => m.de), ((e.messages ?? []) as Msg[])[1]?.genre]);
  }
  {
    const s = serveur({ claude: () => '' });
    const [, r] = await s.ouvrir(s.outils, CLARISSE, 'br');
    const [st, e] = await s.ecrire(s.outils, { id: r.id, jeton: r.jeton, texte: 'Allô ?' });
    dit('Claude muet (panne, clé absente) : le mot du chat, avec son numéro', [200, true],
      [st, String(((e.messages ?? []) as Msg[])[1]?.texte).includes('WhatsApp au 01 97 00 00 00')]);
  }

  /* Quelqu'un est de permanence. */
  {
    const s = serveur({ presents: ['u-awa'] });
    const [, r] = await s.ouvrir(s.outils, CLARISSE, 'br');
    dit('quelqu un est de permanence : « En ligne »', [true, true], [r.enLigne, (await s.etatDuChat(s.outils))[1].enLigne]);
    const [, e] = await s.ecrire(s.outils, { id: r.id, jeton: r.jeton, texte: 'Bonjour' });
    dit('pas de Claude quand l équipe est là ; seule la permanence sonne', [0, ['visiteuse'], ['u-awa'], 'Discussion du site'],
      [s.j.claudes.length, ((e.messages ?? []) as Msg[]).map((m) => m.de), s.j.alertes[0]?.seulement, s.j.alertes[0]?.titre]);
    s.avance(20_000);
    await s.ecrire(s.outils, { id: r.id, jeton: r.jeton, texte: 'Vous êtes là ?' });
    dit('une sonnerie par minute au plus', 1, s.j.alertes.length);
    s.avance(2 * 60_000);
    const [, l1] = await s.lire(s.outils, { id: r.id, jeton: r.jeton, apres: 0 });
    dit('avant trois minutes de silence, le chat ne dit rien', [0, true], [s.j.messages.filter((m) => m.de === 'systeme').length, l1.enLigne]);
    s.avance(60_000);
    await s.lire(s.outils, { id: r.id, jeton: r.jeton, apres: 0 });
    await s.lire(s.outils, { id: r.id, jeton: r.jeton, apres: 0 });
    dit('trois minutes sans réponse : le chat le dit une fois, et toute l équipe qui peut répondre l apprend', [1, 'attente', true, 'Discussion sans réponse', undefined],
      [s.j.messages.filter((m) => m.de === 'systeme').length, s.j.messages.find((m) => m.de === 'systeme')?.genre,
        String(s.j.messages.find((m) => m.de === 'systeme')?.texte).includes('WhatsApp au 01 97 00 00 00'), s.j.alertes[1]?.titre, s.j.alertes[1]?.seulement]);
    const [, l2] = await s.lire(s.outils, { id: r.id, jeton: r.jeton, apres: 1 });
    dit('la lecture rend seulement ce qui suit « apres »', [2, 3], ((l2.messages ?? []) as Msg[]).map((m) => m.id));
  }
  {
    const s = serveur({ presents: ['u-awa'] });
    const [, r] = await s.ouvrir(s.outils, CLARISSE, 'br');
    s.j.discussions.get(String(r.id))!.etat = 'close';
    await s.ecrire(s.outils, { id: r.id, jeton: r.jeton, texte: 'Je reviens vers vous' });
    dit('elle réécrit dans une discussion close : elle se rouvre', 'ouverte', s.j.discussions.get(String(r.id))?.etat);
    dit('un message vide ne part pas', [400, 'vide'], await s.ecrire(s.outils, { id: r.id, jeton: r.jeton, texte: '   ' }).then(([a, b]) => [a, b.error]));
  }
};

/* ── 4. LA FONCTION, LA MIGRATION, LE SITE, LE TRÔNE ─────────────────── */
const structure = () => {
  const f = sansCommentaires(lis(SERVEUR));
  dit('la fonction dit sa version et répond 405 à un GET', [true, true], [/const VERSION = '2026-10-28-a · M\. et Mme/.test(f), /json\(\{ error: 'method', version: VERSION \}, 405\)/.test(f)]);
  dit('ouvrir, écrire et l état ont leur seau ; la lecture, non (le jeton seul l ouvre)', [true, true, true, true],
    [/allowRate\(ip, 'chat_ouvrir', 6\)/.test(f), /allowRate\(ip, 'chat_ecrire', 40\)/.test(f), /allowRate\(ip, 'chat_etat', 60\)/.test(f), /case 'lire':\s*r = await lire\(outils, body\);/.test(f)]);
  dit('Claude ne reçoit jamais le numéro', false, /consigneDeClaude\(\{[^}]*telephone/.test(f));
  dit('Claude : le modèle rapide d abord, quinze secondes au plus', [true, true], [/const MODELES = \['claude-sonnet-5-5', 'claude-haiku-5-5'\];/.test(f), /setTimeout\(\(\) => arret\.abort\(\), 15_000\)/.test(f)]);
  dit('l alerte suit la porte du Trône et ouvre la discussion', [true, true], [/\.filter\(\(s\) => peutRepondre\(s\.role, acces\[s\.user_id\]\)\)/.test(f), /url: `\/trone\/#\/discussions\?d=\$\{o\.discussionId\}`/.test(f)]);
  dit('la fonction porte appelDe (verifie-civilite la tient)', true, /const appelDe = \(/.test(f));

  const m = sqlSansCommentaires(lis(MIGRATION));
  dit('0136 : trois tables, la RLS sur chacune', 3, (m.match(/enable row level security/g) ?? []).length);
  dit('... aucun droit au site (ni anon ni public)', false, /\bto (anon|public)\b/.test(m));
  dit('... l équipe n écrit que des réponses « maison », signées de son compte', true, /for insert to authenticated\s+with check \(public\.is_staff\(\) and de = 'maison' and par = auth\.uid\(\)\)/.test(m));
  dit('... chacun ne pose, ne change ou ne rend que sa permanence (prendre, changer deux fois, rendre)', 4, (m.match(/user_id = auth\.uid\(\)/g) ?? []).length);
  dit('... effacer est à la direction', true, /discussions_effacer on public\.discussions for delete to authenticated\s+using \(public\.est_direction\(\)\)/.test(m));
  dit('... seules la visiteuse et l équipe disent qui a parlé (Claude laisse « à répondre »)', true, /case when new\.de in \('visiteuse', 'maison'\) then new\.de else dernier_de end/.test(m));
  dit('... en direct sur les trois tables', true, /array\['discussions', 'discussion_messages', 'discussion_permanence'\]/.test(m) && /alter publication supabase_realtime add table/.test(m));

  const g = lis('scripts/genere-revelateur.mjs');
  const bulle = morceau(g, 'function bulle(chemin)', '\n}\n');
  dit('la bulle : le monogramme, « Nous sommes là pour vous », quatre ronds (Discuter, Appeler, WhatsApp, Vocal)', [true, true, true, true, true, true],
    [/mono-indigo\.png/.test(bulle), /Nous sommes là pour vous/.test(bulle), /data-joindre="chat"/.test(bulle), /href="tel:/.test(bulle), /<span>WhatsApp<\/span>/.test(bulle), /data-joindre="vocal"/.test(bulle)]);
  dit('... toujours absente des pages qui sont déjà le geste', true, /if \(chemin === '\/reserver\/' \|\| chemin === '\/contact\/' \|\| chemin === '\/rappel\/'\) return '';/.test(bulle));
  dit('... un clic dans un îlot qui se redessine ne la ferme pas (le chemin du clic)', true, /e\.composedPath \? e\.composedPath\(\) : \[\]/.test(bulle));
  dit('... elle annonce son ouverture et sa vue, main.ts fait le reste', [true, true], [/new CustomEvent\('mnd:joindre-ouvert'\)/.test(bulle), /new CustomEvent\('mnd:joindre-vue'/.test(bulle)]);
  const main = sansCommentaires(lis('src/apps/revelateur/main.ts'));
  dit('main.ts lit « En ligne » à l ouverture, et monte le chat ou le vocal au toucher', [true, true, true],
    [/addEventListener\('mnd:joindre-ouvert'/.test(main) && /quelquUnEstLa\(\)/.test(main), /addEventListener\('mnd:joindre-vue'/.test(main), /m\.monteIci\(el, vue\)/.test(main)]);
  dit('l îlot du chat est enregistré', true, /chat: \(\) => import\('\.\/ilots\/ChatDuSite'\)/.test(lis('src/apps/revelateur/monte.tsx')));
  dit('la page Contact a le chat dans « Nous écrire »', true, /<ChatDuSite genre="contact" \/>/.test(lis('src/apps/revelateur/ilots/Joindre.tsx')));
  const ilot = sansCommentaires(lis('src/apps/revelateur/ilots/ChatDuSite.tsx'));
  dit('l îlot : ouvrir, écrire, relire ; se tait onglet caché ; lit au rythme de la règle', [true, true, true, true, true],
    [/action: 'ouvrir'/.test(ilot), /action: 'ecrire'/.test(ilot), /action: 'lire'/.test(ilot), /if \(document\.hidden\) \{ minuterie = window\.setTimeout\(tour, LECTURE_LENTE_MS\); return; \}/.test(ilot), /prochaineLecture\(/.test(ilot)]);
  dit('... avant d écrire : civilité, prénom, nom, numéro WhatsApp (sa décision), et la mention des 90 jours et de l intelligence artificielle', [true, true, true, true],
    [/CIVILITES\.map/.test(ilot), /Votre numéro WhatsApp/.test(ilot), /GARDE_DES_DISCUSSIONS_JOURS/.test(ilot), /intelligence artificielle/.test(ilot)]);
  dit('... la réponse automatique se dit automatique à la visiteuse', true, /'Maison MND · réponse automatique'/.test(ilot));
  const client = sansCommentaires(lis('src/apps/revelateur/chat.ts'));
  dit('le site parle à la fonction par un simple fetch, sans la bibliothèque Supabase', [true, false],
    [/\/functions\/v1\/discussion/.test(client), /shared\/supabase/.test(client)]);
  const confid = morceau(g, "chemin: '/confidentialite/'", '</p>`');
  dit('la page Confidentialité dit la discussion : 90 jours, Claude d Anthropic, jamais son numéro à la machine', [true, true, true, true],
    [/La discussion en direct/.test(confid), /Anthropic/.test(confid), /90 jours après votre dernier message/.test(confid), /jamais votre numéro/.test(confid)]);

  const ecran = sansCommentaires(lis('src/apps/trone/routes/clients/Discussions.tsx'));
  const donnees = sansCommentaires(lis('src/shared/discussions.ts'));
  dit('le Trône répond au nom de la Maison, signé de son compte', true, /insert\(\{ discussion_id: discussionId, de: 'maison', texte, par: uid \}\)/.test(donnees));
  dit('... la permanence se prend et se rend', [true, true], [/prendsLaPermanence\(moi\.user_id/.test(ecran), /rendsLaPermanence\(moi\.user_id\)/.test(ecran)]);
  dit('... le numéro se masque, Claude se dit Claude, effacer est à la direction', [true, true, true],
    [/telephoneMasque\(d\.telephone/.test(ecran), /'Réponse automatique \(Claude\)'/.test(ecran), /\{estDirection && <Button[^>]*onClick=\{\(\) => void efface\(\)\}/.test(ecran)]);
  dit('... la fiche s ouvre par le geste des demandes (segment Prospect)', true, /ficheDepuisLaDemande\(commeUneDemande\(d\)/.test(ecran));
  dit('... l écoute est directe (temps réel), jamais par la synchro des magasins', [true, false],
    [/postgres_changes/.test(donnees), /bindCollection|bindDocument|createStore/.test(donnees)]);
};

await essais();
structure();
console.log(ko === 0 ? '\nTOUT VA BIEN : le chat de la Maison tient ses promesses.' : `\n${ko} ÉCHEC(S)`);
if (ko) process.exitCode = 1;
