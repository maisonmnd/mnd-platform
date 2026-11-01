/* UNE PIECE, UN SEUL WHATSAPP, EPROUVE — 1er novembre 2026.
   `node scripts/verifie-une-piece-un-message.mjs` (et `--prouve`).

   LE FAIT : le 31 octobre 2026, la piece 0166 est partie a 14 h 37 d'un
   poste (le rituel honore, `facture_du_rituel`, le PDF, une cle par etape),
   puis a 22 h 08 d'un AUTRE poste (l'encaissement du soir,
   `recu_de_paiement`, LE MEME PDF, aucune cle). SA REGLE (1er novembre
   2026) : « quand c'est parti une fois, meme quand on retouche, terminer,
   plus d'envoi ». Le contrat vit dans src/shared/une-piece-un-message-pur.ts
   (deux verrous : la marque sur la piece, et UNE cle serveur par piece) ;
   les cablages dans envoi-de-la-piece.ts, Caisse.tsx,
   useReglementsEnLigne.ts, recu-whatsapp.ts, facture-whatsapp.ts,
   whatsapp.ts ; la migration 0150 pose la marque sur les pieces deja parties.

   TOUS LES ATTENDUS SONT ECRITS EN DUR. Les identifiants et les mains sont
   inventes ; jamais un nom ni un numero de cliente, la piece se dit « 0166 ».
   Sortie ASCII : la console de Windows. */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  CLE_DE_LA_PIECE, CLE_DE_RENVOI, decisionDEnvoi, ditLaPiecePartie, enRouteAilleurs, marqueLaPiecePartie, pieceDejaPartie,
  type PiecePartie,
} from '../src/shared/une-piece-un-message-pur';
import type { Invoice } from '../src/shared/finance';

declare const __FAUTE__: { fichier: string; avant: string; apres: string } | null;

let ko = 0;
const ascii = (s: string) => s.replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (n: number, nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(ascii(`${ok ? 'OK   ' : 'ECHEC'} #${n} ${nom} -> ${JSON.stringify(obtenu)?.slice(0, 220)}`));
  if (!ok) console.log(ascii(`       attendu ${JSON.stringify(attendu)?.slice(0, 220)}`));
};

const racine = process.cwd();
const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const source = (rel: string): string => {
  let s = readFileSync(path.join(racine, rel), 'utf8').replace(/\r\n/g, '\n');
  if (__FAUTE__ && __FAUTE__.fichier === rel) s = s.split(__FAUTE__.avant).join(__FAUTE__.apres);
  return sansCommentaires(s);
};
const sansCommentairesSql = (s: string) => s.replace(/^\s*--.*$/gm, '');
const sourceSql = (rel: string): string => {
  let s = readFileSync(path.join(racine, rel), 'utf8').replace(/\r\n/g, '\n');
  if (__FAUTE__ && __FAUTE__.fichier === rel) s = s.split(__FAUTE__.avant).join(__FAUTE__.apres);
  return sansCommentairesSql(s);
};

/* ── Le decor : la piece 0166 et ses deux instants, en temps de Greenwich ── */
const MATIN = '2026-10-31T13:37:22Z'; /* 14 h 37 au salon : le rituel honore, la facture part. */
const SOIR = '2026-10-31T21:08:46Z'; /* 22 h 08 au salon : l'encaissement d'un autre poste. */
type Piece = Pick<Invoice, 'id' | 'whatsapp'>;
const piece = (id: string, whatsapp?: PiecePartie): Piece => ({ id, ...(whatsapp ? { whatsapp } : {}) });
const PREMIERE: PiecePartie = { partieLe: MATIN, modele: 'facture_du_rituel', parQui: 'le poste du matin' };
const SECONDE: PiecePartie = { partieLe: SOIR, modele: 'recu_de_paiement', parQui: 'le poste du soir' };

/* == #1 -- LES CLES : UNE PAR PIECE, UNE A LA MINUTE POUR LE RENVOI == */
{
  dit(1, 'CLE_DE_LA_PIECE : une seule cle par piece, quel que soit le modele ou l etape', 'piece-inv-0166', CLE_DE_LA_PIECE('inv-0166'));
  dit(1, 'CLE_DE_RENVOI : la piece et la minute, jamais les secondes', 'piece-inv-0166-renvoi-2026-10-31T21:08', CLE_DE_RENVOI('inv-0166', SOIR));
  dit(1, 'deux touchers dans la meme minute : la meme cle ; la minute suivante : une autre', [true, false], [
    CLE_DE_RENVOI('inv-0166', '2026-10-31T21:08:01Z') === CLE_DE_RENVOI('inv-0166', '2026-10-31T21:08:59Z'),
    CLE_DE_RENVOI('inv-0166', SOIR) === CLE_DE_RENVOI('inv-0166', '2026-10-31T21:09:00Z'),
  ]);
  dit(1, 'la cle de renvoi n est jamais la cle de la piece, ni celle d une autre piece', [true, true], [
    CLE_DE_RENVOI('inv-0166', SOIR) !== CLE_DE_LA_PIECE('inv-0166'),
    CLE_DE_LA_PIECE('inv-0166') !== CLE_DE_LA_PIECE('inv-0167'),
  ]);
}

/* == #2 -- LE SCENARIO DE LA PIECE 0166 : 14 H 37 ELLE PART, 22 H 08 ELLE NE REPART PAS == */
{
  const neuve = piece('inv-0166');
  dit(2, '14 h 37, le rituel honore : la piece neuve part, sur la cle de la piece', { envoie: true, cle: 'piece-inv-0166' },
    decisionDEnvoi({ piece: neuve, geste: 'auto', instant: MATIN }));
  const partie = marqueLaPiecePartie(neuve, PREMIERE);
  const soir = decisionDEnvoi({ piece: partie, geste: 'auto', instant: SOIR });
  dit(2, '22 h 08, l encaissement d un autre poste : le recu NE PART PAS', false, soir.envoie);
  const motif = soir.envoie ? '' : soir.motif;
  dit(2, '... et le motif dit le jour, l annee et l heure du salon', 'déjà partie sur son WhatsApp le 31 octobre 2026 à 14 h 37', motif);
  dit(2, '... « 31 octobre 2026 » et « 14 h 37 » y sont, sans tiret long ni parenthese', [true, true, false], [
    motif.includes('31 octobre 2026'), motif.includes('14 h 37'), /[—()]/.test(motif),
  ]);
  dit(2, 'le bouton expres « Renvoyer » sur la meme piece : la cle a la minute', { envoie: true, cle: 'piece-inv-0166-renvoi-2026-10-31T21:08' },
    decisionDEnvoi({ piece: partie, geste: 'renvoi', instant: SOIR }));
  dit(2, 'une piece jamais partie : la cle de la piece', { envoie: true, cle: 'piece-inv-x' },
    decisionDEnvoi({ piece: piece('inv-x'), geste: 'auto', instant: SOIR }));
  /* Le bouton « Envoyer la facture sur son WhatsApp » passe `renvoi` meme la premiere fois : ce premier
     envoi doit reserver la cle de la piece au serveur, sinon un second poste en retard de synchro
     repartirait sur une cle libre (relecture du 1er novembre 2026). */
  dit(2, 'le bouton expres sur une piece JAMAIS partie est un premier envoi : la cle de la piece, pas celle a la minute',
    { envoie: true, cle: 'piece-inv-x' }, decisionDEnvoi({ piece: piece('inv-x'), geste: 'renvoi', instant: SOIR }));
  /* La marque apprise par la cle du serveur (`dAilleurs`) ferme la porte autant que la sienne. */
  const dAilleurs = piece('inv-0166', { partieLe: MATIN, modele: 'facture_du_rituel', dAilleurs: true });
  dit(2, 'une marque apprise d un autre poste refuse aussi', false, decisionDEnvoi({ piece: dAilleurs, geste: 'auto', instant: SOIR }).envoie);
  /* Le serveur rend « deja » des que la cle est prise, meme quand l autre poste attend encore Meta
     (sans waId) : si Meta refuse, rien n est parti. Seul un deja AVEC waId dit le papier chez elle. */
  dit(2, 'deja avec waId : le papier est chez elle ; deja sans waId : l autre poste attend Meta, rien n est su', [false, true, false], [
    enRouteAilleurs({ deja: true, waId: 'wamid.0166' }), enRouteAilleurs({ deja: true }), enRouteAilleurs({ waId: 'wamid.0166' }),
  ]);
}

/* == #3 -- LA MARQUE : LA PREMIERE FOIS FAIT FOI == */
{
  const neuve = piece('inv-0166');
  const p1 = marqueLaPiecePartie(neuve, PREMIERE);
  dit(3, 'la premiere marque se pose telle quelle, la piece neuve n est pas touchee', [{ id: 'inv-0166', whatsapp: PREMIERE }, { id: 'inv-0166' }], [p1, neuve]);
  dit(3, 'pieceDejaPartie : non avant, oui apres', [false, true], [pieceDejaPartie(neuve), pieceDejaPartie(p1)]);
  const p2 = marqueLaPiecePartie(p1, SECONDE);
  dit(3, 'la seconde marque, plus recente (22 h 08), ne remplace pas la premiere : le meme objet', [true, PREMIERE], [p2 === p1, p2.whatsapp]);
  dit(3, 'le meme instant ne remplace pas non plus', true, marqueLaPiecePartie(p1, { partieLe: MATIN, modele: 'recu_de_paiement' }) === p1);
  /* Un poste en retard avait marque 22 h 08 ; la cle du serveur lui rend le vrai premier envoi, 14 h 37. */
  const tard = marqueLaPiecePartie(piece('inv-y'), SECONDE);
  const corrige = marqueLaPiecePartie(tard, { partieLe: MATIN, modele: 'facture_du_rituel', dAilleurs: true });
  dit(3, 'une marque plus ANCIENNE remplace : c est elle, le premier envoi', { partieLe: MATIN, modele: 'facture_du_rituel', dAilleurs: true }, corrige.whatsapp);
  dit(3, 'dAilleurs se pose seulement quand il est vrai ; parQui seulement quand la main est connue', [false, false], [
    'dAilleurs' in (p1.whatsapp ?? {}), 'parQui' in (corrige.whatsapp ?? {}),
  ]);
  dit(3, 'le reste de la piece reste tel quel', { id: 'inv-z', number: 'MND-2026-0166', status: 'payée', whatsapp: PREMIERE },
    marqueLaPiecePartie({ id: 'inv-z', number: 'MND-2026-0166', status: 'payée' } as unknown as Piece, PREMIERE));
  const finance = source('src/shared/finance.ts');
  dit(3, 'finance.ts : Invoice porte whatsapp?: PiecePartie, importe en type seulement', [true, true], [
    /whatsapp\?: PiecePartie;/.test(finance), /import type \{ PiecePartie \} from '\.\/une-piece-un-message-pur';/.test(finance),
  ]);
}

/* == #4 -- CE QU ELLE LIT : L ANNEE SUR LA DATE, L HEURE DU SALON == */
{
  const dite = (iso: string, fuseau?: string) => ditLaPiecePartie({ whatsapp: { partieLe: iso, modele: 'facture_du_rituel' } }, fuseau);
  dit(4, '21:08:46Z : l heure du salon, 22 h 08, et l annee', 'partie sur son WhatsApp le 31 octobre 2026 à 22 h 08', dite(SOIR));
  dit(4, '13:37:22Z : 14 h 37', 'partie sur son WhatsApp le 31 octobre 2026 à 14 h 37', dite(MATIN));
  dit(4, 'une heure ronde se dit « 9 h », jamais « 9 h 00 »', 'partie sur son WhatsApp le 31 octobre 2026 à 9 h', dite('2026-10-31T08:00:00Z'));
  dit(4, 'le 31 decembre a 23 h 30 de Greenwich est deja le 1 janvier 2027 au salon', 'partie sur son WhatsApp le 1 janvier 2027 à 0 h 30', dite('2026-12-31T23:30:00Z'));
  dit(4, 'le fuseau demande est honore (Greenwich : 21 h 08)', 'partie sur son WhatsApp le 31 octobre 2026 à 21 h 08', dite(SOIR, 'UTC'));
  dit(4, 'sans marque, ou avec un instant illisible : la phrase nue, jamais une erreur', ['partie sur son WhatsApp', 'partie sur son WhatsApp'], [
    ditLaPiecePartie({}), ditLaPiecePartie({ whatsapp: { partieLe: 'hier', modele: 'x' } }),
  ]);
  dit(4, 'ni tiret long ni parenthese dans ce qu elle lit', false, /[—()]/.test(dite(SOIR)));
}

/* == #5 -- LE SEUL CHEMIN DU COMPTOIR : envoi-de-la-piece.ts DECIDE AVANT DE PREPARER == */
{
  const e = source('src/apps/trone/routes/vente/envoi-de-la-piece.ts');
  const tranche = (de: string, a: string) => e.slice(e.indexOf(de), e.indexOf(a));
  const apres = tranche('const apresReglement = async', 'const aRegler = async');
  const aRegler = tranche('const aRegler = async', 'const foyer = async');
  const foyer = tranche('const foyer = async', 'const point = async');
  const point = e.slice(e.indexOf('const point = async'));
  const decideAvantDePreparer = (t: string) => t.indexOf('decisionDEnvoi(') > 0 && t.indexOf('decisionDEnvoi(') < t.indexOf('preparer(pieceId)');
  dit(5, 'apresReglement : decisionDEnvoi geste auto, AVANT preparer ; un refus dit pourquoi et rien ne part', [true, true, true], [
    /decisionDEnvoi\(\{ piece, geste: 'auto'/.test(apres), decideAvantDePreparer(apres),
    /if \(!decision\.envoie\) \{ toast\([^\n]*\); return; \}/.test(apres),
  ]);
  dit(5, 'apresReglement : envoieLeRecu recoit la cle de la decision, puis la piece est marquee recu_de_paiement', [true, true], [
    /cleUnique: decision\.cle/.test(apres), /noteLaPiecePartie\(p\.piece\.id, infoDuDepart\(r, MODELE_RECU\)\)/.test(apres),
  ]);
  dit(5, 'aRegler : decisionDEnvoi, renvoi expres ou auto, AVANT preparer ; la cle de la decision ; marque facture_du_rituel', [true, true, true, true], [
    /decisionDEnvoi\(\{ piece: avant, geste: o\?\.renvoi \? 'renvoi' : 'auto'/.test(aRegler), decideAvantDePreparer(aRegler),
    /cle: decision\.cle,/.test(aRegler), /noteLaPiecePartie\(p\.piece\.id, infoDuDepart\(r, MODELE_FACTURE\)\)/.test(aRegler),
  ]);
  dit(5, 'aRegler : plus aucune cle fabriquee a la main', false, /\$\{p\.piece\.id\}-\$\{new Date\(\)/.test(aRegler));
  dit(5, 'aRegler : « renvoyee » seulement si la piece etait deja partie ; le meme bouton sur une piece vierge dit « envoyee »', true,
    /dit\(p\.piece\.number, r, !!o\?\.renvoi && pieceDejaPartie\(avant\)\);/.test(aRegler));
  dit(5, 'foyer et point : chaque piece ouverte porte la marque', [true, true], [
    /noteLesPiecesParties\(ouvertes\.map\(\(p\) => p\.id\), infoDuDepart\(r, PAPIER_DU_FOYER\)\)/.test(foyer),
    /noteLesPiecesParties\(ouvertes\.map\(\(p\) => p\.id\), infoDuDepart\(r, MODELE_DU_POINT\)\)/.test(point),
  ]);
  /* Ni sur un envoi garde hors ligne (rien n est parti), ni sur un deja sans waId (l autre poste attend Meta). */
  dit(5, 'jamais de marque hors ligne ni sur un deja sans waId : les quatre marques exigent r.ok && !r.enAttente && !enRouteAilleurs(r)', [4, 0], [
    (e.match(/if \(r\.ok && !r\.enAttente && !enRouteAilleurs\(r\)\) note(LaPiecePartie|LesPiecesParties)\(/g) ?? []).length,
    (e.match(/if \(r\.ok(?: && !r\.enAttente)?\) note(LaPiecePartie|LesPiecesParties)\(/g) ?? []).length,
  ]);
  dit(5, 'infoDuDepart : le lien seul se dit paiement_en_attente ; parti d ailleurs : dAilleurs, sans main', [true, true], [
    /modele: r\.repli === 'lien' \? MODELE_TAPGO : papier/.test(e),
    /\.\.\.\(r\.deja \? \{ dAilleurs: true as const \} : \{ parQui: quiEncaisse\(\) \}\)/.test(e),
  ]);
  dit(5, 'les toasts disent le refus (le recu ne part pas), le parti d ailleurs, l envoi en cours ailleurs, le renvoi de la minute et le renvoi, sans tiret long',
    [true, true, true, true, true, false, false], [
      e.includes(': le reçu ne part pas.'),
      e.includes('sur son WhatsApp depuis un autre poste : rien de plus n’est envoyé.'),
      e.includes(': un autre poste l’envoie en ce moment, rien de plus n’est envoyé.'),
      e.includes(': ce renvoi vient de partir il y a moins d’une minute, rien de plus n’est envoyé.'),
      /renvoi \? 'renvoyée' : 'envoyée'/.test(e),
      e.includes('n’est pas renvoyé'),
      /—/.test(e),
    ]);
  dit(5, 'le deja du foyer et du point passent par ditLeDeja, le renvoi (cle a la minute) distingue', [true, true], [
    /ditLeDeja\('Facture du foyer', 'partie', r, !!o\?\.renvoi\)/.test(foyer),
    /ditLeDeja\('Point du compte', 'parti', r, !!o\?\.renvoi\)/.test(point),
  ]);
}

/* == #6 -- LES DEUX AUTRES APPELANTS DU RECU : LA CAISSE ET LE REGLEMENT EN LIGNE == */
{
  const caisse = source('src/apps/trone/routes/vente/Caisse.tsx');
  const enLigne = source('src/apps/trone/shell/useReglementsEnLigne.ts');
  dit(6, 'Caisse : le recu du comptoir part sur la cle de la piece, puis la piece est marquee (jamais sur un deja sans waId)', [true, true, true, true], [
    /envoieLeRecu\(\{[\s\S]{0,400}?cleUnique: CLE_DE_LA_PIECE\(inv\.id\),/.test(caisse),
    /if \(r\.ok && !r\.enAttente && !enRouteAilleurs\(r\)\) noteLaPiecePartie\(inv\.id, \{ partieLe: r\.quand \?\? new Date\(\)\.toISOString\(\), modele: MODELE_RECU/.test(caisse),
    caisse.includes('Reçu déjà parti sur son WhatsApp depuis un autre poste.'),
    caisse.includes('Un autre poste envoie ce reçu en ce moment : rien de plus n’est envoyé.'),
  ]);
  dit(6, 'reglement en ligne : la cle recu-en-ligne-<reglement> reste (l exception), et la piece est marquee (jamais sur un deja sans waId)', [true, true, true], [
    /cleUnique: `recu-en-ligne-\$\{t\.r\.id\}`/.test(enLigne),
    /const partie = r\.enAttente \|\| enRouteAilleurs\(r\) \? null : \{/.test(enLigne),
    /return partie \? marqueLaPiecePartie\(q, partie\) : q;/.test(enLigne),
  ]);
}

/* == #7 -- LES ENVOIS : UNE CLE ENTIERE, PLUS DE SUFFIXE D ETAPE == */
{
  const recu = source('src/shared/recu-whatsapp.ts');
  const fact = source('src/shared/facture-whatsapp.ts');
  dit(7, 'recu-whatsapp : la cle entiere, partagee par le mot et le modele ; plus de suffixe d etape', [true, 2, false, false], [
    /const cle = o\.cleUnique \? \{ cleUnique: o\.cleUnique \} : \{\};/.test(recu),
    (recu.match(/\.\.\.cle[ ,}]/g) ?? []).length,
    /\$\{o\.cleUnique\}-/.test(recu), /cle\('(mot|modele|lien)'\)/.test(recu),
  ]);
  dit(7, 'facture-whatsapp : la facture a regler, le foyer et le point partagent leur cle entiere entre mot, modele et lien', [true, 2, 9, false, false, false], [
    /const cle = o\.cle \? \{ cleUnique: o\.cle \} : \{\};/.test(fact),
    (fact.match(/const cle = \{ cleUnique: o\.cle \};/g) ?? []).length,
    (fact.match(/\.\.\.cle[ ,}]/g) ?? []).length,
    /facture-\$\{o\.cle\}/.test(fact), /\$\{o\.cle\}-/.test(fact), /cle\('(mot|modele|lien)'\)/.test(fact),
  ]);
}

/* == #8 -- LA MIGRATION 0150 : LA MARQUE SUR LES PIECES DEJA PARTIES, REJOUABLE == */
{
  const m = sourceSql('supabase/migrations/0150_une_piece_un_message.sql');
  const maj = m.slice(m.indexOf('update public.invoices'), m.indexOf('\nselect i.id'));
  const parNom = m.slice(m.indexOf('par_nom as ('), m.indexOf('choisis as ('));
  const listing = m.slice(m.indexOf('\nselect i.id'));
  dit(8, '0150 : ne touche que les pieces sans marque (is null dans les deux CTE, la mise a jour et le listing final)', [4, true], [
    (m.match(/data->'whatsapp' is null/g) ?? []).length,
    /where c\.piece_id = i\.id\s+and i\.data->'whatsapp' is null;/.test(maj),
  ]);
  dit(8, '0150 : updated_at = now() pour que les postes relisent la piece', true, /updated_at = now\(\)/.test(maj));
  dit(8, '0150 : le plus ANCIEN message fait foi', [true, true], [/distinct on \(piece_id\)/.test(m), /order by piece_id, quand asc/.test(m)]);
  /* Meta a PRIS le message : remis, lu, ou en route AVEC waId (le webhook laisse « sent » en route ; un
     telephone eteint n accuse jamais). Une reservation en route sans waId, ou non-remis : rien n est parti. */
  dit(8, '0150 : sortants que Meta a pris (remis, lu, ou en-route avec waId) ; jamais non-remis', [true, true, true, false], [
    /m\.data->>'sens' = 'sortant'/.test(m), /m\.data->>'etat' in \('remis', 'lu'\)/.test(m),
    /or \(m\.data->>'etat' = 'en-route' and coalesce\(m\.data->>'waId', ''\) <> ''\)\)/.test(m),
    /non-remis/.test(m),
  ]);
  dit(8, '0150 : la cle ancienne par starts_with, les cles neuves piece-<id> (egalite) et piece-<id>-renvoi- ; jamais le prefixe piece-<id> seul', [true, true, false], [
    /starts_with\(s\.cle, 'facture-' \|\| i\.id \|\| '-'\)/.test(m),
    /or s\.cle = 'piece-' \|\| i\.id\s+or starts_with\(s\.cle, 'piece-' \|\| i\.id \|\| '-renvoi-'\)/.test(m),
    /starts_with\(s\.cle, 'piece-' \|\| i\.id\)/.test(m),
  ]);
  dit(8, '0150 : le nom du PDF par le numero, jamais pour un numero porte par deux pieces ; le listing final les rend', [true, true, true], [
    /'Facture-' \|\| \(i\.data->>'number'\) \|\| '\.pdf'/.test(parNom),
    /and not exists \(select 1 from public\.invoices j\s+where j\.id <> i\.id and j\.data->>'number' = i\.data->>'number'\)/.test(parNom),
    /^select i\.id, i\.data->>'number' as numero[\s\S]*and exists \(select 1 from public\.invoices j where j\.id <> i\.id and j\.data->>'number' = i\.data->>'number'\)/m.test(listing),
  ]);
  dit(8, '0150 : la marque posee est partieLe, modele, parQui, sans nuls', [true, true], [
    /jsonb_strip_nulls/.test(m), /'partieLe', c\.quand,\s+'modele', c\.modele,\s+'parQui', c\.par_qui/.test(m),
  ]);
  dit(8, '0150 est seule a porter son numero (0149 est la derniere passee)', 1,
    readdirSync(path.join(racine, 'supabase/migrations')).filter((f: string) => f.startsWith('0150_')).length);
}

/* == #9 -- whatsapp.ts REND « deja » : PARTI D AILLEURS, C EST UN OK == */
{
  const wa = source('src/shared/whatsapp.ts');
  dit(9, 'whatsapp.ts : ResultatDEnvoi ok porte deja?: true, lu dans la reponse du serveur', [true, true, true], [
    /enAttente\?: true; deja\?: true \}/.test(wa),
    /deja\?: boolean \}>\('whatsapp-envoi'/.test(wa),
    /\.\.\.\(d\.deja \? \{ deja: true as const \} : \{\}\)/.test(wa),
  ]);
}

/* == #10 -- « TERMINER » LE FOYER NE RENVOIE PAS UNE FACTURE DEJA PARTIE ==
   Sa regle du 1er novembre 2026 : terminer ne renvoie rien. Sans `renvoi`,
   une piece deja partie seule sort du foyer ; le bouton d apres coup garde tout. */
{
  const e = source('src/apps/trone/routes/vente/envoi-de-la-piece.ts');
  dit(10, 'foyer : sans renvoi, les pieces deja parties sortent ; avec renvoi, toutes restent ; toutes parties = rien ne part', [true, true], [
    /const ouvertes = o\?\.renvoi \? aRegle : aRegle\.filter\(\(p\) => !pieceDejaPartie\(p\)\);/.test(e),
    /if \(ouvertes\.length === 0\) \{\s+toast\(aRegle\.length > 0\s+\? 'Les factures de ce foyer sont d.j. parties sur son WhatsApp/.test(e),
  ]);
}

console.log(ko === 0 ? 'Tout tient.' : `${ko} constat(s) en echec.`);
