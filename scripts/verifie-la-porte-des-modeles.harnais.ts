/* LA PORTE DES MODELES, EPROUVEE — 4 novembre 2026.
   `node scripts/verifie-la-porte-des-modeles.mjs` (et `--prouve`).

   La decision de Yeman : « Opale garde la porte de tous les modeles Meta
   automatiques ». Jamais deux fois pour le meme evenement ; pas de rappel ni
   de « garder » a qui vient de confirmer, ni quand la confirmation est partie
   il y a moins de 24 h ; rien pour un rendez-vous annule, honore, passe ou
   deplace ; la civilite du salut est celle de la fiche. Les envois de
   l'equipe ne se jugent jamais ; une campagne ne connait que « jamais deux
   fois ».

   TOUS LES ATTENDUS SONT ECRITS EN DUR, tires de ces phrases et des deux
   incidents du 2 novembre 2026 (le rappel de la veille parti a 17 h 11 puis
   a 18 h 11 ; « M. » pour une dame), jamais du code eprouve. Les regles
   tournent pour de vrai (porte-des-modeles-pur) ; le facteur et rappels-j1
   se lisent dans leur source, a leurs ancres, et la copie du bloc dans le
   facteur se compare caractere pour caractere a l'original. Tout est
   invente : aucune cliente, aucun numero reel. Sortie ASCII. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  CONFIRMATION_RECENTE_MS, JAMAIS_DEUX_FOIS_MS, MARQUE_D_OPALE, PAR_QUI_AUTOMATIQUES, PAR_QUI_DES_CAMPAGNES, REGISTRE_DES_MODELES,
  appelCorrige, appelJuste, civiliteEcrite, cleDuNumeroWa, cleDeLEvenement, dejaParti, depuisPourLaPorte, detailDOpale, entreeDe,
  laPorte, partiAuFil, quellePorte, remplaceLAppel, rendezVousQuiNeTientPlus, retenuParOpale, texteSansCivilite, variantesDuNumero,
  vientDeConfirmer,
  type ContexteDeLaPorte, type LigneALaPorte,
} from '../src/shared/porte-des-modeles-pur';
import { appelDe } from '../src/shared/civilite';

declare const __PANNE__: { fichier: string; avant: string; apres: string } | null;

let ko = 0;
let n = 0;
const ascii = (s: string) => s.replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(ascii(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)?.slice(0, 200)}`));
  if (!ok) console.log(ascii(`       attendu ${JSON.stringify(attendu)?.slice(0, 200)}`));
};

const racine = process.cwd();
/* Le disque tel quel : l'original de la copie se lit ainsi, pour qu'une
   panne plantee dans le module pur ne soit criee que par les regles qui
   tournent (sinon la comparaison des copies crierait a leur place). */
const disque = (rel: string): string => readFileSync(path.join(racine, rel), 'utf8').replace(/\r\n/g, '\n');
const brut = (rel: string): string => {
  let s = disque(rel);
  if (__PANNE__ && __PANNE__.fichier === rel) s = s.split(__PANNE__.avant).join(__PANNE__.apres);
  return s;
};
const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const egal = (s: string) => s.replace(/\s+/g, ' ');
const source = (rel: string): string => egal(sansCommentaires(brut(rel)));

const PUR = 'src/shared/porte-des-modeles-pur.ts';
const EP = 'supabase/functions/envois-partent/index.ts';
const RJ = 'supabase/functions/rappels-j1/index.ts';

/* ── Les fixtures : le soir du 2 novembre 2026 ─────────────────────── */
const H = (iso: string) => Date.parse(iso);
const HEURE = 3_600_000;
const PREMIER = '2026-11-02T16:11:00.000Z'; // 17 h 11 a Cotonou
const SECOND = '2026-11-02T17:11:00.000Z'; // 18 h 11
const DEPOSE = '2026-11-02T17:00:00.000Z'; // le second passage depose a 18 h
const DEMAIN = '2026-11-03';
const RDV = 'ap-banc-j1';
const iso = (ms: number) => new Date(ms).toISOString();
const texteJ1 = (appel: string, heure = '17 h 30') => `${appel}, votre rendez-vous est demain à ${heure}.`;
const colisJ1 = (appel = 'Mme Awa', numero = '22997000001', heure = '17 h 30') => ({
  genre: 'whatsapp', numero, modele: 'rappel_rdv', parQui: 'la Maison, automatiquement', texteAuFil: texteJ1(appel, heure),
  composants: [{ type: 'body', parameters: [{ type: 'text', text: appel }, { type: 'text', text: heure }] }],
});
const ligneJ1 = (o: Partial<LigneALaPorte> = {}): LigneALaPorte => ({
  id: `env-${RDV}-whatsapp`, type: 'rappel-j1', canal: 'whatsapp', apptId: RDV, clientId: 'cl-awa', dateRdv: DEMAIN, heure: '17:30',
  statut: 'en-envoi', deposeLe: DEPOSE, quand: DEPOSE, colis: colisJ1(), ...o,
});
const RDV_OK = { date: DEMAIN, time: '17:30', status: 'confirmé', clientId: 'cl-awa' };
const FICHE_AWA = { name: 'Awa Banc', civilite: 'madame' };
/* Le premier rappel, tel que le facteur l'a ecrit au fil : le numero sous la
   forme de la fiche, quand la ligne le redit sous celle de Meta. */
const filJ1 = (o: Record<string, unknown> = {}) => ({
  sens: 'sortant', numero: '+2290197000001', clientId: 'cl-awa', texte: texteJ1('Mme Awa'), modele: 'rappel_rdv', quand: PREMIER, etat: 'remis',
  parQui: 'la Maison, automatiquement', ...o,
});
const ctx = (o: Partial<ContexteDeLaPorte> = {}): ContexteDeLaPorte => ({
  maintenantMs: H(SECOND), rdv: RDV_OK, fiche: FICHE_AWA, envois: [], messages: [], ...o,
});
const verdict = (l: LigneALaPorte, c: ContexteDeLaPorte) => {
  const v = laPorte(l, c);
  return v.verdict === 'retenu' ? `retenu : ${v.motif}` : v.verdict;
};
const DEJA_FIL = 'déjà parti : le même modèle est au fil de ce numéro depuis moins de 20 h';
const DEJA_JOURNAL = 'déjà parti : le même message est au journal depuis moins de 20 h';

/* ══ 1. Le registre, lu dans le code qui depose ══ */
{
  dit('seize familles de modeles automatiques, chacune une fois',
    ['rappel-j1', 'confirmation', 'reprise-j3', 'point-apres', 'point-avant', 'avis-google', 'rappel-echeance', 'prix-revu', 'relance-facture',
      'fete-de-couronne', 'fin-de-paquet', 'merci-marraine', 'perle-garder', 'perle-avant', 'perle', 'campagne'],
    REGISTRE_DES_MODELES.map((e) => e.famille));
  dit('chacune dit a quoi elle sert et quand elle part, et l appel au {{1}}', [],
    REGISTRE_DES_MODELES.filter((e) => e.pourQuoi.length < 30 || e.quand.length < 15 || e.appel !== 1).map((e) => e.famille));
  const j1 = REGISTRE_DES_MODELES.find((e) => e.famille === 'rappel-j1');
  dit('le rappel de la veille : rappel_rdv, le secret WA_TEMPLATE, l appel au {{1}}, un rappel lie au rendez-vous, une fois par tete',
    { modeles: ['rappel_rdv'], secrets: ['WA_TEMPLATE'], appel: 1, rdv: true, rappel: true, unParTete: true, porte: 'toutes' },
    j1 && { modeles: j1.modeles, secrets: j1.secrets, appel: j1.appel, rdv: j1.rdv, rappel: j1.rappel, unParTete: j1.unParTete, porte: j1.porte });
  dit('les rappels : la veille, la reprise J-3, le point d avant, garder et avant de Perle',
    ['rappel-j1', 'reprise-j3', 'point-avant', 'perle-garder', 'perle-avant'], REGISTRE_DES_MODELES.filter((e) => e.rappel).map((e) => e.famille));
  dit('les familles liees a un rendez-vous', ['rappel-j1', 'confirmation', 'reprise-j3', 'point-avant', 'perle-garder'],
    REGISTRE_DES_MODELES.filter((e) => e.rdv).map((e) => e.famille));
  dit('seule la campagne ne connait que « jamais deux fois »', ['campagne'],
    REGISTRE_DES_MODELES.filter((e) => e.porte === 'jamais-deux-fois').map((e) => e.famille));
  /* Chaque secret du registre est lu par la fonction qui depose. */
  const parFonction: Record<string, string> = {
    'rappel-j1': RJ, confirmation: 'supabase/functions/confirmation-rdv/index.ts', 'reprise-j3': RJ, 'point-apres': RJ, 'point-avant': RJ,
    'avis-google': 'supabase/functions/avis-google/index.ts', 'rappel-echeance': 'supabase/functions/rappels-d-echeance/index.ts',
    'prix-revu': 'supabase/functions/rappels-d-echeance/index.ts', 'relance-facture': 'supabase/functions/relances-factures/index.ts',
    'fete-de-couronne': 'supabase/functions/fete-de-couronne/index.ts',
  };
  dit('chaque secret du registre est lu par la fonction qui depose', [],
    REGISTRE_DES_MODELES.flatMap((e) => e.secrets.filter((s) => !source(parFonction[e.famille] ?? PUR).includes(`Deno.env.get('${s}')`)).map((s) => `${e.famille}:${s}`)));
  dit('les noms ecrits dans le code sont ceux du registre', [true, true, true, true, true, true], [
    source(RJ).includes("Deno.env.get('WA_TEMPLATE') ?? 'rappel_rdv'"),
    source('supabase/functions/confirmation-rdv/index.ts').includes("Deno.env.get('WA_TEMPLATE_CONF') ?? 'confirmation_rdv'"),
    source('supabase/functions/avis-google/index.ts').includes("Deno.env.get('WA_TEMPLATE_AVIS') ?? 'avis_google'"),
    source('src/shared/merci-en-salle.ts').includes("export const MODELE_DU_MERCI = 'parrainage_merci';"),
    source('src/shared/conversations.ts').includes("export const MODELE_FIN_DE_PAQUET = 'fin_de_paquet';"),
    REGISTRE_DES_MODELES.filter((e) => e.type === 'gerard').flatMap((e) => e.modeles).every((m) => source('src/shared/gerard-pur.ts').includes(`nom: '${m}'`)),
  ]);
  /* L'appel au {{1}} : le premier parametre du corps, dans chaque depot. */
  dit('l appel est le {{1}} du corps, dans le code de chaque depot', Array(14).fill(true), [
    source(RJ).includes("composants: [{ type: 'body', parameters: [{ type: 'text', text: prenom }, { type: 'text', text: heureLisible(a.time) }] }]"),
    source(RJ).includes("{ type: 'body', parameters: [{ type: 'text', text: prenom }, { type: 'text', text: quand }, { type: 'text', text: gestes }] }"),
    (source(RJ).match(/\{ type: 'body', parameters: \[\{ type: 'text', text: prenom \}, \{ type: 'text', text: jour \}\] \}/g) ?? []).length === 2,
    source('supabase/functions/confirmation-rdv/index.ts').includes("const corps = [{ type: 'text', text: o.prenom }, { type: 'text', text: o.quand }];"),
    source('supabase/functions/avis-google/index.ts').includes("composants: [{ type: 'body', parameters: [{ type: 'text', text: prenom }, { type: 'text', text: lien }] }]"),
    (source('supabase/functions/rappels-d-echeance/index.ts').match(/montantXof: number \}\): string\[\] => \[ o\.appel,|nouveauXof: number; effet: string \}\): string\[\] => \[ o\.appel,/g) ?? []).length === 2,
    source('supabase/functions/relances-factures/index.ts').includes("? [{ type: 'text', text: appel }, { type: 'text', text: resteDit }, { type: 'text', text: pour }] : [{ type: 'text', text: appel }, { type: 'text', text: jour }, { type: 'text', text: resteDit }] }"),
    source('supabase/functions/fete-de-couronne/index.ts').includes('const variablesDeLaFete = (o: { appel: string; enfant: string; annees: number; premiereLe: string }): string[] => [ o.appel,'),
    source('src/shared/fin-de-paquet.ts').includes('=> [ appelDe(fiche, f.nom),'),
    source('src/apps/trone/shell/useParrainageVivant.ts').includes('const variables = [fiche ? appelDe(fiche) : m.prenomMarraine, m.prenomFilleule, m.libelle];'),
    source('src/shared/gerard-pur.ts').includes("garder: { nom: 'assistant_maison_garder', categorie: 'UTILITY', corps: 'Bonjour {{1}},"),
    source('src/shared/gerard-pur.ts').includes("const s = fait('garder', 'garder', [f.appel, f.soinDit, place], pourquoi);"),
    source('src/shared/gerard-pur.ts').includes("{ type: 'body', parameters: s.variables.map((v) => ({ type: 'text' as const, text: v.replace(/\\s+/g, ' ').trim() })) },"),
    source('src/shared/campagnes-pur.ts').includes("composants: [{ type: 'body', parameters: [{ type: 'text', text: appel }] }],"),
  ]);
  dit('qui envoie : les mots que chaque depot ecrit', [true, true, true, true, true], [
    source(RJ).includes("parQui: 'la Maison, automatiquement'") && PAR_QUI_AUTOMATIQUES.includes('la Maison, automatiquement'),
    source('supabase/functions/confirmation-rdv/index.ts').includes("modele: WA_TEMPLATE, parQui: 'Le Trône', texteAuFil: texteDuFil,") && PAR_QUI_AUTOMATIQUES.includes('Le Trône'),
    source('src/shared/gerard-pur.ts').includes("texteAuFil: s.texte, parQui: 'Assistant Maison',") && PAR_QUI_AUTOMATIQUES.includes('Assistant Maison'),
    source('src/shared/merci-en-salle.ts').includes("parQui: 'Le Trône · ambassadrices',") && source('src/shared/merci-en-salle.ts').includes("type: 'merci-marraine'"),
    source('src/shared/campagnes-pur.ts').includes("parQui: 'Le Trône · campagne',") && PAR_QUI_DES_CAMPAGNES.includes('Le Trône · campagne'),
  ]);
  dit('Perle se lit a son genre ; un type inconnu n a pas de famille', ['perle-garder', 'perle-avant', 'perle', 'perle', null],
    [entreeDe({ type: 'gerard', genre: 'garder' })?.famille, entreeDe({ type: 'gerard', genre: 'avant' })?.famille,
      entreeDe({ type: 'gerard', genre: 'carte-foyer' })?.famille, entreeDe({ type: 'gerard' })?.famille, entreeDe({ type: 'message-libre' })?.famille ?? null]);
}

/* ══ 2. (a) Qui envoie ══ */
{
  const campagne: LigneALaPorte = {
    id: 'camp-novembre-cl-awa-whatsapp', type: 'campagne', canal: 'whatsapp', campagneId: 'camp-novembre', clientId: 'cl-awa', apptId: '', dateRdv: '',
    deposeLe: DEPOSE, colis: { genre: 'whatsapp', numero: '22997000001', modele: 'nouvelles_novembre', parQui: 'Le Trône · campagne', texteAuFil: 'Bonjour M. Awa, des nouvelles.', composants: [{ type: 'body', parameters: [{ type: 'text', text: 'M. Awa' }] }] },
  };
  dit('un rappel de la veille passe toute la porte ; une confirmation, Perle et le merci aussi', ['toutes', 'toutes', 'toutes', 'toutes'], [
    quellePorte(ligneJ1()),
    quellePorte({ id: 'conf-x-whatsapp', type: 'confirmation', colis: { genre: 'whatsapp', parQui: 'Le Trône' } }),
    quellePorte({ id: 'gerard-x', type: 'gerard', genre: 'garder', colis: { genre: 'whatsapp', parQui: 'Assistant Maison' } }),
    quellePorte({ id: 'env-merci-x', type: 'merci-marraine', colis: { genre: 'whatsapp', parQui: 'Le Trône · ambassadrices' } }),
  ]);
  dit('PANNE « une campagne jugee en entier » : une campagne ne connait que jamais deux fois', 'jamais-deux-fois', quellePorte(campagne));
  dit('PANNE « une main qui dit maintenant jugee » : la main a choisi, rien ne se juge', 'aucune', quellePorte(ligneJ1({ parLaMain: true })));
  dit('PANNE « un envoi manuel juge » : un envoi de l equipe ne passe aucune porte', 'aucune',
    quellePorte({ id: 'x', colis: { genre: 'whatsapp', parQui: 'Yeman', modele: 'rappel_rdv', numero: '22997000001' } }));
  dit('une notification de Ma Couronne n est pas un modele WhatsApp', 'aucune', quellePorte({ id: 'conf-x-push', type: 'confirmation', colis: { genre: 'push' } }));
  dit('un type inconnu, envoye automatiquement, passe la porte', 'toutes', quellePorte({ id: 'x', type: 'nouveau', colis: { genre: 'whatsapp', parQui: 'la Maison, automatiquement' } }));
  /* La campagne : seulement « jamais deux fois ». */
  const toutFaux = ctx({ rdv: { ...RDV_OK, status: 'annulé' }, fiche: { name: 'Awa Banc', civilite: 'madame' },
    messages: [{ sens: 'entrant', numero: '22997000001', quand: iso(H(DEPOSE) + 60_000) }] });
  dit('PANNE « une campagne jugee en entier » : elle a ecrit et la civilite est fausse, la campagne part telle quelle', 'passe', verdict(campagne, toutFaux));
  dit('... mais une campagne deja partie a la meme tete ne repart pas', `retenu : ${DEJA_FIL}`,
    verdict(campagne, ctx({ messages: [{ sens: 'sortant', numero: '+2290197000001', clientId: 'cl-awa', modele: 'nouvelles_novembre', quand: PREMIER, etat: 'lu', texte: 'autre' }] })));
}

/* ══ 3. (b) Jamais deux fois ══ */
{
  dit('PANNE « le numero compare tel quel » : le double rappel du 2 novembre, 17 h 11 puis 18 h 11, la cle du numero le voit', DEJA_FIL,
    dejaParti(ligneJ1(), ctx({ messages: [filJ1()] })));
  dit('... et la porte le retient', `retenu : ${DEJA_FIL}`, verdict(ligneJ1(), ctx({ messages: [filJ1()] })));
  dit('PANNE « un non remis compte comme parti » : WhatsApp a dit non remis, il repart', null, dejaParti(ligneJ1(), ctx({ messages: [filJ1({ etat: 'non-remis' })] })));
  dit('PANNE « la fenetre change » : parti il y a 19 h, il ne repart pas', DEJA_FIL, dejaParti(ligneJ1(), ctx({ messages: [filJ1({ quand: iso(H(SECOND) - 19 * HEURE) })] })));
  dit('PANNE « la fenetre change » : parti il y a 21 h (le soir d avant), le rappel du jour part', null, dejaParti(ligneJ1(), ctx({ messages: [filJ1({ quand: iso(H(SECOND) - 21 * HEURE) })] })));
  dit('un autre modele au fil ne compte pas', null, dejaParti(ligneJ1(), ctx({ messages: [filJ1({ modele: 'confirmation_rdv' })] })));
  dit('un autre numero ne compte pas', null, dejaParti(ligneJ1(), ctx({ messages: [filJ1({ numero: '22966000002' })] })));
  dit('PANNE « deux enfants confondus » : deux enfants d un meme parent recoivent chacun leur rappel', null,
    dejaParti(ligneJ1(), ctx({ messages: [filJ1({ clientId: 'cl-kiki', texte: texteJ1('Mlle Kiki') })] })));
  /* UN FOYER, UN MESSAGE (4 novembre 2026) : deux enfants du MEME FOYER sont
     nommes par un message (`clientIds`, `apptIds`) ; il couvre chacun. */
  dit('PANNE « le foyer oublie au fil » : nommee par le rappel de son foyer, la seconde ne recoit pas le sien', DEJA_FIL,
    dejaParti(ligneJ1(), ctx({ messages: [filJ1({ clientId: 'cl-kiki', clientIds: ['cl-kiki', 'cl-awa'], texte: texteJ1('Kiki et Awa') })] })));
  dit('PANNE « le foyer oublie au journal » : son rendez-vous nomme par la ligne partie du foyer, elle ne repart pas', true,
    /chaque rendez-vous de ce foyer/.test(dejaParti(ligneJ1(), ctx({ envois: [{ id: 'env-ap-kiki-whatsapp', type: 'rappel-j1', canal: 'whatsapp', apptId: 'ap-kiki', apptIds: ['ap-kiki', RDV], statut: 'envoyé', quand: PREMIER }] })) ?? ''));
  dit('... mais le message d un foyer qui ne la nommait pas la laisse partir', null,
    dejaParti(ligneJ1(), ctx({ envois: [{ id: 'env-ap-kiki-whatsapp', type: 'rappel-j1', canal: 'whatsapp', apptId: 'ap-kiki', apptIds: ['ap-kiki', 'ap-lola'], statut: 'envoyé', quand: PREMIER }],
      messages: [filJ1({ clientId: 'cl-kiki', clientIds: ['cl-kiki', 'cl-lola'], texte: texteJ1('Kiki et Lola') })] })));
  dit('PANNE « une seule tete par jour oubliee » : un second rendez-vous pour la meme personne ne fait pas un second rappel', DEJA_FIL,
    dejaParti(ligneJ1({ colis: colisJ1('Mme Awa', '22997000001', '10 h') }), ctx({ messages: [filJ1()] })));
  dit('PANNE « le texte compare avec sa civilite » : une fiche en double, le meme texte a la civilite pres, ne repart pas', DEJA_FIL,
    dejaParti(ligneJ1(), ctx({ messages: [filJ1({ clientId: 'cl-awa-bis', texte: texteJ1('M. Awa') })] })));
  /* Une famille sans « une par tete » : deux formules d'une meme payeuse. */
  const echeance = (sub: string, formule: string): LigneALaPorte => ({
    id: `ech-${sub}`, type: 'rappel-echeance', canal: 'whatsapp', apptId: '', dateRdv: '', subId: sub, echeance: 2, clientId: 'cl-mere', deposeLe: DEPOSE,
    colis: { genre: 'whatsapp', numero: '22997000003', modele: 'rappel_echeance_veille', parQui: 'la Maison, automatiquement', texteAuFil: `Bonjour Mme Afi, demain, la 2e échéance de ${formule}.`, composants: [{ type: 'body', parameters: [{ type: 'text', text: 'Mme Afi' }] }] },
  });
  const filEch = (formule: string) => ({ sens: 'sortant', numero: '22997000003', clientId: 'cl-mere', modele: 'rappel_echeance_veille', quand: PREMIER, etat: 'remis', texte: `Bonjour Mme Afi, demain, la 2e échéance de ${formule}.` });
  dit('deux formules d une meme payeuse : deux textes, deux rappels', null, dejaParti(echeance('sub-b', 'L Ancrage, pour Kiki'), ctx({ messages: [filEch('L Ancrage, pour Lola')] })));
  dit('... la meme formule, le meme texte : une fois', DEJA_FIL, dejaParti(echeance('sub-a', 'L Ancrage, pour Lola'), ctx({ messages: [filEch('L Ancrage, pour Lola')] })));
  /* Le journal : une autre ligne du meme evenement. */
  const voisine = (o: Partial<LigneALaPorte>): LigneALaPorte => ({ id: `gerard-2026-11-01-cl-awa-whatsapp`, type: 'rappel-j1', canal: 'whatsapp', apptId: RDV, statut: 'envoyé', quand: PREMIER, ...o });
  dit('le journal : une autre ligne du meme rendez-vous, partie il y a une heure, suffit', DEJA_JOURNAL, dejaParti(ligneJ1(), ctx({ envois: [voisine({ id: 'env-copie' })] })));
  dit('PANNE « le journal ne compte que les envoyes » : envoyee a la main, elle compte aussi', DEJA_JOURNAL, dejaParti(ligneJ1(), ctx({ envois: [voisine({ id: 'env-copie', statut: 'à-la-main', canal: 'wa-main' })] })));
  dit('le journal : un echec, une notification, la ligne elle-meme, un autre rendez-vous ne comptent pas', [null, null, null, null], [
    dejaParti(ligneJ1(), ctx({ envois: [voisine({ id: 'env-copie', statut: 'échec' })] })),
    dejaParti(ligneJ1(), ctx({ envois: [voisine({ id: 'env-copie', canal: 'push' })] })),
    dejaParti(ligneJ1(), ctx({ envois: [voisine({ id: `env-${RDV}-whatsapp` })] })),
    dejaParti(ligneJ1(), ctx({ envois: [voisine({ id: 'env-copie', apptId: 'ap-autre' })] })),
  ]);
  dit('un rappel de la veille et le garder de Perle sont deux messages, pas un doublon', null,
    dejaParti(ligneJ1(), ctx({ envois: [voisine({ id: 'gerard-x', type: 'gerard', genre: 'garder' })] })));
  dit('l evenement d une ligne : son rendez-vous, sa formule et son echeance, sinon elle-meme', ['rappel-j1|rdv|ap-banc-j1', 'rappel-echeance|cl-mere|sub-a|2', 'merci-marraine|ligne|env-merci-1'],
    [cleDeLEvenement(ligneJ1()), cleDeLEvenement(echeance('sub-a', 'x')), cleDeLEvenement({ id: 'env-merci-1', type: 'merci-marraine', clientId: 'cl-awa' })]);
  /* Le repli de la confirmation : partie par l'ancien modele, elle ne repart pas par le neuf. */
  const conf: LigneALaPorte = {
    id: 'conf-ap-banc-c-whatsapp', type: 'confirmation', canal: 'whatsapp', apptId: 'ap-banc-c', clientId: 'cl-awa', dateRdv: '2026-11-08', heure: '10:00', deposeLe: DEPOSE,
    colis: {
      genre: 'whatsapp', numero: '22997000001', modele: 'confirmation_rdv_liens', parQui: 'Le Trône', texteAuFil: 'Bonjour Mme Awa, c est confirmé. Votre référence : MND-AB23.',
      composants: [{ type: 'body', parameters: [{ type: 'text', text: 'Mme Awa' }, { type: 'text', text: 'dimanche' }, { type: 'text', text: 'MND-AB23' }] }],
      repli: { modele: 'confirmation_rdv', composants: [{ type: 'body', parameters: [{ type: 'text', text: 'Mme Awa' }, { type: 'text', text: 'dimanche' }] }], texteAuFil: 'Bonjour Mme Awa, c est confirmé.' },
    },
  };
  dit('partie par son repli, la confirmation ne repart pas par le modele neuf', DEJA_FIL,
    dejaParti(conf, ctx({ messages: [{ sens: 'sortant', numero: '2290197000001', clientId: 'cl-awa', modele: 'confirmation_rdv', texte: 'Bonjour Mme Awa, c est confirmé.', quand: PREMIER, etat: 'remis' }] })));
}

/* ══ 4. (c) Pas de rappel a qui vient de confirmer ══ */
{
  const garder: LigneALaPorte = {
    id: 'gerard-2026-11-01-cl-awa-whatsapp', type: 'gerard', genre: 'garder', canal: 'whatsapp', apptId: RDV, clientId: 'cl-awa', dateRdv: DEMAIN, heure: '17:30', deposeLe: DEPOSE,
    colis: { genre: 'whatsapp', numero: '22997000001', modele: 'assistant_maison_garder', parQui: 'Assistant Maison', texteAuFil: 'Bonjour Mme Awa, petit rappel de la Maison.',
      composants: [{ type: 'body', parameters: [{ type: 'text', text: 'Mme Awa' }, { type: 'text', text: 'retwist' }, { type: 'text', text: 'demain' }] }] },
  };
  const ouiJeViens = { ...RDV_OK, confirmeeParLaClienteLe: '2026-11-01T09:00:00.000Z' };
  dit('PANNE « oui je viens ignore » : un garder apres « Oui, je viens » ne part pas', 'retenu : elle a déjà confirmé sa venue', verdict(garder, ctx({ rdv: ouiJeViens })));
  dit('... ni le rappel de la veille', 'elle a déjà confirmé sa venue', vientDeConfirmer(ligneJ1(), ctx({ rdv: ouiJeViens })));
  const confPartie = (heures: number, statut = 'envoyé', canal = 'whatsapp') => ({
    id: `conf-${RDV}-${canal}`, type: 'confirmation', canal, apptId: RDV, statut, quand: iso(H(SECOND) - heures * HEURE),
  });
  dit('PANNE « la confirmation recente oubliee » : un rappel pour un rendez-vous confirme il y a 3 h ne part pas', 'retenu : sa confirmation est partie il y a moins de 24 h',
    verdict(ligneJ1(), ctx({ envois: [confPartie(3)] })));
  dit('... confirmee dans la conversation il y a 20 h, non plus', 'sa confirmation est partie il y a moins de 24 h', vientDeConfirmer(ligneJ1(), ctx({ envois: [confPartie(20)] })));
  dit('une confirmation partie il y a 30 h, ou ratee, ne tait pas le rappel', [null, null],
    [vientDeConfirmer(ligneJ1(), ctx({ envois: [confPartie(30)] })), vientDeConfirmer(ligneJ1(), ctx({ envois: [confPartie(3, 'échec')] }))]);
  const ecrit = (minutes: number, numero = '2290197000001') => ({ sens: 'entrant', numero, clientId: 'cl-awa', texte: 'Bonsoir', quand: iso(H(DEPOSE) + minutes * 60_000) });
  dit('PANNE « elle a ecrit, le rappel part quand meme » : elle a ecrit depuis le depot, la conversation est ouverte', 'retenu : elle a écrit depuis le dépôt : la conversation est ouverte',
    verdict(ligneJ1(), ctx({ messages: [ecrit(5)] })));
  dit('ecrit avant le depot, ou depuis un autre numero : le rappel part', [null, null],
    [vientDeConfirmer(ligneJ1(), ctx({ messages: [ecrit(-30)] })), vientDeConfirmer(ligneJ1(), ctx({ messages: [ecrit(5, '22966000002')] }))]);
  const avis: LigneALaPorte = { id: 'env-fac-1-wa-avis', type: 'avis-google', canal: 'whatsapp', apptId: '', invoiceId: 'fac-1', clientId: 'cl-awa', deposeLe: DEPOSE,
    colis: { genre: 'whatsapp', numero: '22997000001', modele: 'avis_google', parQui: 'la Maison, automatiquement', texteAuFil: 'Bonjour Mme Awa, merci de votre visite.', composants: [{ type: 'body', parameters: [{ type: 'text', text: 'Mme Awa' }, { type: 'text', text: 'https://g.page/x' }] }] } };
  dit('une demande d avis n est pas un rappel : elle a ecrit, elle part quand meme', 'passe', verdict(avis, ctx({ rdv: undefined, messages: [ecrit(5)] })));
  dit('la confirmation elle-meme n est pas un rappel', null, vientDeConfirmer({ ...ligneJ1(), id: 'conf-x', type: 'confirmation' }, ctx({ rdv: ouiJeViens, envois: [confPartie(3)] })));
}

/* ══ 5. (d) Le rendez-vous tient-il ? ══ */
{
  const avec = (o: Record<string, unknown>) => rendezVousQuiNeTientPlus(ligneJ1(), ctx({ rdv: { ...RDV_OK, ...o } }));
  dit('annule, deplace (un autre jour, une autre heure), passe : il ne part pas', ['le rendez-vous a été annulé', 'le rendez-vous a été déplacé', 'le rendez-vous a été déplacé', 'l’heure du rendez-vous est passée'],
    [avec({ status: 'annulé' }), avec({ date: '2026-11-04' }), avec({ time: '18:00' }), rendezVousQuiNeTientPlus(ligneJ1(), ctx({ maintenantMs: H('2026-11-03T17:00:00Z') }))]);
  dit('PANNE « un rendez-vous honore garde son rappel » : honore, rien', 'retenu : le rendez-vous est déjà honoré', verdict(ligneJ1(), ctx({ rdv: { ...RDV_OK, status: 'honoré' } })));
  dit('disparu : rien', 'le rendez-vous n’existe plus', rendezVousQuiNeTientPlus(ligneJ1(), ctx({ rdv: null })));
  dit('PANNE « un deplacement apres le depot ignore » : deplace puis remis a la meme place apres le depot, rien', 'le rendez-vous a été déplacé depuis le dépôt',
    avec({ deplaceLe: iso(H(DEPOSE) + 60_000) }));
  dit('deplace AVANT le depot (le rappel dit deja la bonne heure) : il part', null, avec({ deplaceLe: iso(H(DEPOSE) - HEURE) }));
  dit('un rendez-vous qui tient : rien a redire', null, avec({}));
  dit('une confirmation recollee a sa nouvelle date n est pas retenue pour son deplacement', null,
    rendezVousQuiNeTientPlus({ ...ligneJ1(), type: 'confirmation', recolleLe: SECOND }, ctx({ rdv: { ...RDV_OK, deplaceLe: iso(H(DEPOSE) + 60_000) } })));
  dit('le point d apres ne nomme pas de rendez-vous : rien a relire', null,
    rendezVousQuiNeTientPlus({ id: 'pe-x-apres-whatsapp', type: 'point-apres', apptId: '', seanceId: 'x' }, ctx({ rdv: null })));
}

/* ══ 6. (e) La civilite de la fiche ══ */
{
  const j1 = (appel: string) => ligneJ1({ colis: colisJ1(appel) });
  const avecFiche = (appel: string, fiche: Record<string, unknown> | null) => {
    const v = laPorte(j1(appel), ctx({ fiche }));
    return v.verdict === 'corrige' ? [appelDesParametres(v.composants), v.texteAuFil] : v.verdict;
  };
  const appelDesParametres = (c: unknown[]) => ((c[0] as { parameters: { text: string }[] }).parameters).map((p) => p.text);
  dit('PANNE « la vieille marque masculine l emporte » : « M. Adjaratou », la fiche dit Madame : « Mme Adjaratou », au modele et au fil',
    [['Mme Adjaratou', '17 h 30'], 'Mme Adjaratou, votre rendez-vous est demain à 17 h 30.'],
    avecFiche('M. Adjaratou', { name: 'Adjaratou Banc', civilite: 'madame', auMasculin: true }));
  {
    const v = laPorte(j1('M. Adjaratou'), ctx({ fiche: { name: 'Adjaratou Banc', civilite: 'madame' } }));
    dit('... et la porte dit ce qu elle a corrige', 'civilité de la fiche : « M. Adjaratou » devient « Mme Adjaratou »', v.verdict === 'corrige' ? v.motif : v.verdict);
  }
  dit('« M. Sena » sans civilite sur la fiche : « Sena »', [['Sena', '17 h 30'], 'Sena, votre rendez-vous est demain à 17 h 30.'], avecFiche('M. Sena', { name: 'Sena Banc' }));
  dit('la vieille marque masculine seule garde « M. Koffi », et ote un « Mme » qui la contredit', ['passe', [['Koffi', '17 h 30'], 'Koffi, votre rendez-vous est demain à 17 h 30.']],
    [avecFiche('M. Koffi', { name: 'Koffi Banc', auMasculin: true }), avecFiche('Mme Koffi', { name: 'Koffi Banc', auMasculin: true })]);
  dit('l appel sans civilite la recoit quand la fiche la dit : « Mlle Grace »', [['Mlle Grace', '17 h 30'], 'Mlle Grace, votre rendez-vous est demain à 17 h 30.'],
    avecFiche('Grace', { name: 'Grace Banc', civilite: 'mademoiselle' }));
  dit('PANNE « une civilite inventee » : la fiche ne dit rien, « Grace » reste « Grace »', 'passe', avecFiche('Grace', { name: 'Grace Banc' }));
  dit('PANNE « le parent salue du nom de l enfant » : l appel d un parent, « a vous », « Madame, Monsieur » ne se touchent pas', ['passe', 'passe', 'passe'],
    [avecFiche('Mme Adjoa', { name: 'Kiki Banc', civilite: 'mademoiselle' }), avecFiche('à vous', { name: 'Kiki Banc', civilite: 'mademoiselle' }), avecFiche('Madame, Monsieur', { name: 'Kiki Banc', civilite: 'mademoiselle' })]);
  dit('sans fiche lue, rien ne se corrige ; le bon appel passe tel quel', ['passe', 'passe'], [avecFiche('M. Sena', null), avecFiche('Mme Awa', FICHE_AWA)]);
  dit('sans prenom sur la fiche, la civilite seule s ecrit en entier', ['Madame', null], [appelJuste('Monsieur', { civilite: 'madame' }), appelJuste('Madame', { civilite: 'madame' })]);
  /* Perle : la carte en en-tete, l'appel dans le corps. */
  {
    const carte: LigneALaPorte = {
      id: 'gerard-2026-11-02-cl-sena-whatsapp', type: 'gerard', genre: 'anniversaire', canal: 'whatsapp', apptId: '', clientId: 'cl-sena', deposeLe: DEPOSE,
      colis: { genre: 'whatsapp', numero: '22997000004', modele: 'assistant_maison_carte_anniversaire', parQui: 'Assistant Maison', texteAuFil: 'Joyeux anniversaire M. Sena ! Toute la Maison vous souhaite une très belle journée.',
        composants: [{ type: 'header', parameters: [{ type: 'image', image: { link: 'https://exemple.invalid/carte.png' } }] }, { type: 'body', parameters: [{ type: 'text', text: 'M. Sena' }] }, { type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: 'x' }] }] },
    };
    const v = laPorte(carte, ctx({ rdv: undefined, fiche: { name: 'Sena Banc', civilite: 'madame' } }));
    dit('Perle, carte en en-tete : l appel du corps se corrige, l en-tete et le bouton ne bougent pas',
      ['corrige', 'header', 'Mme Sena', 'button', 'Joyeux anniversaire Mme Sena ! Toute la Maison vous souhaite une très belle journée.'],
      v.verdict === 'corrige' ? [v.verdict, (v.composants[0] as { type: string }).type, (v.composants[1] as { parameters: { text: string }[] }).parameters[0].text, (v.composants[2] as { type: string }).type, v.texteAuFil] : [v.verdict]);
  }
  /* La confirmation et son repli. */
  {
    const conf: LigneALaPorte = {
      id: 'conf-ap-banc-c-whatsapp', type: 'confirmation', canal: 'whatsapp', apptId: 'ap-banc-c', clientId: 'cl-adja', dateRdv: '2026-11-08', heure: '10:00', deposeLe: DEPOSE,
      colis: {
        genre: 'whatsapp', numero: '22997000005', modele: 'confirmation_rdv_liens', parQui: 'Le Trône', texteAuFil: 'Bonjour M. Adjaratou, c est confirmé.',
        composants: [{ type: 'body', parameters: [{ type: 'text', text: 'M. Adjaratou' }, { type: 'text', text: 'dimanche' }, { type: 'text', text: 'MND-AB23' }] }],
        repli: { modele: 'confirmation_rdv', composants: [{ type: 'body', parameters: [{ type: 'text', text: 'M. Adjaratou' }, { type: 'text', text: 'dimanche' }] }], texteAuFil: 'Bonjour M. Adjaratou, c est confirmé, ancien modèle.' },
      },
    };
    const v = appelCorrige(conf, ctx({ rdv: { date: '2026-11-08', time: '10:00', status: 'confirmé' }, fiche: { name: 'Adjaratou', civilite: 'madame' } }));
    dit('PANNE « le texte du fil garde l ancien appel » / « le repli garde l ancien appel » : le modele neuf et son repli, au modele et au fil',
      [['Mme Adjaratou', 'dimanche', 'MND-AB23'], 'Bonjour Mme Adjaratou, c est confirmé.', ['Mme Adjaratou', 'dimanche'], 'Bonjour Mme Adjaratou, c est confirmé, ancien modèle.'],
      v ? [appelDesParametres(v.composants), v.texteAuFil, v.repli ? appelDesParametres(v.repli.composants) : null, v.repli?.texteAuFil] : null);
  }
  /* L'appel juste est celui de civilite.ts (appelDe), quand la fiche dit sa civilite. */
  const FICHES = [
    { name: 'Awa Banc', civilite: 'madame' }, { name: 'Grace Banc', civilite: 'mademoiselle' }, { name: 'Keli Banc', civilite: 'monsieur' },
    { name: 'Keli Banc', civilite: 'madame', auMasculin: true }, { name: '  Awa   Banc ', civilite: 'madame' },
  ] as const;
  const ecrits = (prenom: string) => [prenom, `M. ${prenom}`, `Mme ${prenom}`, `Mlle ${prenom}`];
  dit('quand la fiche dit sa civilite, l appel juste est celui de civilite.ts, quel que soit l appel ecrit', [],
    FICHES.flatMap((f) => ecrits(String(f.name).trim().split(/\s+/)[0]).filter((e) => (appelJuste(e, f) ?? e) !== appelDe(f as never)).map((e) => `${f.name}|${e}`)));
  dit('la civilite ecrite se lit en tete, jamais dans « Madame, Monsieur »', [{ mot: 'M.', reste: 'Awa' }, { mot: 'Madame', reste: '' }, { mot: null, reste: 'Madame, Monsieur' }],
    [civiliteEcrite('M.  Awa'), civiliteEcrite('Madame'), civiliteEcrite('Madame, Monsieur')]);
  dit('l appel se remplace a sa premiere place, comme mot entier', ['Bonjour Mme Sena, merci Sena', 'Bonjour Senami', 'Mme Awa, votre rendez-vous'],
    [remplaceLAppel('Bonjour Sena, merci Sena', 'Sena', 'Mme Sena'), remplaceLAppel('Bonjour Senami', 'Sena', 'X'), remplaceLAppel('M. Awa, votre rendez-vous', 'M. Awa', 'Mme Awa')]);
  dit('PANNE « le texte compare avec sa civilite » : le texte sans civilite', ['Awa, votre rendez-vous', 'Bonjour Awa, merci', 'Bonjour Madame, Monsieur, merci'],
    [texteSansCivilite('M. Awa, votre rendez-vous'), texteSansCivilite('Bonjour  Mme Awa, merci'), texteSansCivilite('Bonjour Madame, Monsieur, merci')]);
}

/* ══ 7. La porte entiere ══ */
{
  const toutFaux = ctx({
    rdv: { ...RDV_OK, status: 'annulé' }, fiche: { name: 'Awa Banc', civilite: 'madame' },
    envois: [{ id: 'conf-x', type: 'confirmation', apptId: RDV, statut: 'envoyé', canal: 'whatsapp', quand: iso(H(SECOND) - HEURE) }],
    messages: [filJ1(), { sens: 'entrant', numero: '22997000001', quand: iso(H(DEPOSE) + 60_000) }],
  });
  dit('PANNE « un envoi manuel juge » : un envoi de l equipe ne se juge jamais, meme quand tout est faux', 'passe',
    verdict({ id: 'x', canal: 'whatsapp', apptId: RDV, clientId: 'cl-awa', colis: { ...colisJ1('M. Awa'), parQui: 'Yeman' } }, toutFaux));
  dit('PANNE « une main qui dit maintenant jugee » : une main a dit maintenant, rien ne se juge', 'passe', verdict(ligneJ1({ parLaMain: true, colis: colisJ1('M. Awa') }), toutFaux));
  dit('un rappel juste, a la bonne personne, part', 'passe', verdict(ligneJ1(), ctx()));
  dit('deja parti l emporte sur tout le reste', `retenu : ${DEJA_FIL}`, verdict(ligneJ1({ colis: colisJ1('M. Awa') }), toutFaux));
  dit('la marque d Opale se lit, et seulement elle', ['retenu par Opale : déjà parti', true, false, false],
    [detailDOpale('déjà parti'), retenuParOpale({ detail: detailDOpale('déjà parti') }), retenuParOpale({ detail: 'le rendez-vous a été déplacé' }), retenuParOpale(null)]);
  dit('les fenetres : vingt heures, vingt-quatre heures', [20 * HEURE, 24 * HEURE], [JAMAIS_DEUX_FOIS_MS, CONFIRMATION_RECENTE_MS]);
  dit('on lit le journal et le fil depuis 24 h, et au moins depuis le depot', [iso(H(SECOND) - 24 * HEURE), '2026-11-01T09:59:00.000Z'],
    [depuisPourLaPorte(ligneJ1(), H(SECOND)), depuisPourLaPorte(ligneJ1({ deposeLe: '2026-11-01T10:00:00.000Z' }), H(SECOND))]);
}

/* ══ 8. La cle du numero ══ */
{
  dit('la cle du numero : 229 et huit chiffres, quelle que soit l ecriture', ['22997000001', '22997000001', '22997000001', '22997000001', '22997000001', '33612345678', ''],
    ['+229 01 97 00 00 01', '22997000001', '0197000001', '97000001', '0022997000001', '+33612345678', ''].map(cleDuNumeroWa));
  dit('les formes a lire au fil', ['22997000001', '+22997000001', '2290197000001', '+2290197000001'], variantesDuNumero('+229 01 97 00 00 01'));
}

/* ══ 9. La ligne prise et jamais rendue, deja au fil ══ */
{
  const prise: LigneALaPorte = { ...ligneJ1(), prisLe: PREMIER };
  const fil = (o: Record<string, unknown>) => ({ sens: 'sortant', numero: '+2290197000001', clientId: 'cl-awa', modele: 'rappel_rdv', quand: iso(H(PREMIER) + 2_000), etat: 'en-route', waId: 'wamid.banc1', ...o });
  dit('Meta l avait acceptee : le fil le dit, elle est partie', 'wamid.banc1', partiAuFil(prise, [fil({})])?.waId ?? null);
  dit('rien au fil depuis la prise, un non remis, un autre modele : elle redevient un echec', [null, null, null],
    [partiAuFil(prise, [fil({ quand: iso(H(PREMIER) - 2 * HEURE) })]), partiAuFil(prise, [fil({ etat: 'non-remis' })]), partiAuFil(prise, [fil({ modele: 'autre' })])]);
}

/* ══ 10. Le facteur : la copie, l'appel, la ligne prise ══ */
{
  const OUVRE = '/* ⟨porte-des-modeles⟩ */\n';
  const FERME = '\n/* ⟨/porte-des-modeles⟩ */';
  const entre = (s: string) => { const i = s.indexOf(OUVRE); const k = s.indexOf(FERME, i); return i < 0 || k < 0 ? null : s.slice(i + OUVRE.length, k); };
  const original = entre(disque(PUR));
  const copie = entre(brut(EP));
  dit('le facteur porte le bloc, caractere pour caractere', true, !!original && original.length > 5000 && copie === original);
  dit('le bloc ne porte aucun import', false, /^import /m.test(original ?? ''));
  const f = source(EP);
  /* La version dit la porte d'Opale, au 4 novembre 2026 ou plus tard (le foyer l'a montée au -b). */
  const versionDu = (s: string): string => /const VERSION = '(\d{4}-\d{2}-\d{2}-[a-z])/.exec(s)?.[1] ?? '';
  dit('la version du facteur dit la porte d Opale', true,
    versionDu(f) >= '2026-11-04-a' && /const VERSION = '[^']* · la porte d’Opale : jamais deux fois, pas de rappel à qui vient de confirmer, civilité juste/.test(f));
  const prise = f.indexOf(".update({ data: { ...l.data, prisLe: maintenant, statut: 'en-envoi' } }) .eq('id', l.id).eq('data->>statut', 'en-attente').select('id');");
  const relu = f.indexOf('const motif = pourquoiIlNePartPlus(repris ?? l.data, rdv, Date.now());');
  const porte = f.indexOf('const v = laPorte(devant, faits);');
  const meta = f.indexOf('fetch(`https://graph.facebook.com/v20.0/${WA_PHONE_ID}/messages`', prise);
  dit('PANNE « le facteur ne passe pas la porte » : la porte vient apres la prise en main et le rendez-vous relu, avant Meta', true, prise > 0 && relu > prise && porte > relu && meta > porte);
  dit('PANNE « le facteur retient en echec » : retenue, la ligne devient « perime », avec la marque d Opale', true,
    f.includes("if (v.verdict === 'retenu') { await ecris({ statut: 'périmé', detail: detailDOpale(v.motif) }); perimes++; retenusParOpale++; continue; }"));
  dit('PANNE « le facteur oublie la correction » : corrigee, elle part avec les composants, le fil et le repli corriges', true,
    f.includes('colis = { ...colis, composants: v.composants, ...(v.texteAuFil !== undefined ? { texteAuFil: v.texteAuFil } : {}), ...(v.repli ? { repli: v.repli } : {}) };'));
  dit('PANNE « la main qui dit maintenant oubliee » : la porte sait qu une main a dit maintenant', true,
    f.includes('const devant: LigneALaPorte = { ...(l.data as LigneALaPorte), ...(base as LigneALaPorte), id: l.id, parLaMain: l.data.parLaMain, colis: colis as ColisALaPorte };')
    && f.includes("if (quellePorte(devant) !== 'aucune') {"));
  dit('PANNE « la fiche de l enfant pour le parent » : la fiche lue est celle qui recoit', true,
    f.includes("const idFiche = String(l.pourId || l.clientId || '');") && f.includes("sb.from('clients').select('id, data').eq('id', idFiche).maybeSingle()"));
  dit('le journal du meme rendez-vous ou de la meme fiche, le fil du numero sous toutes ses formes', true,
    f.includes("sb.from('envois').select('id, data').eq('data->>apptId', l.apptId).limit(200)")
    && f.includes("sb.from('envois').select('id, data').eq('data->>clientId', l.clientId).gte('data->>quand', depuis).limit(300)")
    && f.includes("sb.from('messages_wa').select('data').in('data->>numero', variantes).gte('data->>quand', depuis).limit(500)")
    && f.includes('const variantes = variantesDuNumero(l.colis?.numero);'));
  dit('PANNE « une lecture en panne laisse partir » : sans lecture, pas de jugement, un echec a retenter', true,
    f.includes('if (fiche.error || voisines.error || fil.error || duFoyer.error) return null;') && f.includes("if (!faits) { await ecris({ statut: 'échec', detail: `la porte d’Opale n’a pas pu lire le journal ou le fil"));
  dit('le rendez-vous relu sert a la porte, et les verdicts d avant restent', true,
    f.includes('rdvRelu = rdv as RdvALaPorte | null;') && f.includes('faits = await faitsDeLaPorte(sb, devant, rdvRelu, Date.now());')
    && f.includes("if (motif) { await ecris({ statut: 'périmé', detail: motif }); perimes++; continue; }"));
  dit('PANNE « la ligne prise retombe en echec meme partie » : deja au fil, elle est « envoye », sinon un echec comme avant', true,
    f.includes('auFil = partiAuFil(prise, ((fil ?? []) as { data: MessageALaPorte }[]).map((r) => r.data ?? {}));')
    && f.includes("? { ...p.data, statut: 'envoyé', ...(auFil.waId ? { waMessageId: String(auFil.waId) } : {}), detail: 'parti : retrouvé au fil après une interruption', quand: maintenant }")
    && f.includes(": { ...p.data, statut: 'échec', detail: 'envoi interrompu', quand: maintenant },")
    && f.includes(".in('data->>numero', variantesDuNumero(prise.colis.numero)).eq('data->>sens', 'sortant')"));
  const data = source('src/apps/trone/routes/equipe/data.ts');
  const envois = source('src/shared/envois.ts');
  dit('le Trone connait « perime » et le dit « pas envoye » : aucun statut nouveau', true,
    /* Grenat ajoute « à-préparer » après eux (4 novembre 2026) : la porte, elle, n'en ajoute aucun. */
    data.includes("| 'en-attente' | 'retenu' | 'écarté' | 'périmé' | 'en-envoi'") && envois.includes("perime: 'pas envoyé'"));
}

/* ══ 11. rappels-j1 : ce qu'Opale a retenu ne se redepose pas ══ */
{
  const r = source(RJ);
  const pur = egal(sansCommentaires(disque(PUR)));
  dit('la version de rappels-j1 dit la porte d Opale', true,
    (/const VERSION = '(\d{4}-\d{2}-\d{2}-[a-z])/.exec(r)?.[1] ?? '') >= '2026-11-04-a'
    && /const VERSION = '[^']*la porte d’Opale : un rappel retenu par Opale ne se redépose pas ; même modèle au fil de ce numéro depuis 20 h, il ne repart pas';/.test(r));
  dit('la marque lue par rappels-j1 est celle de la porte', true,
    r.includes("const retenuParOpale = (d: { detail?: unknown } | null | undefined): boolean => String(d?.detail ?? '').startsWith('retenu par Opale');") && MARQUE_D_OPALE === 'retenu par Opale');
  dit('PANNE « rappels-j1 redepose ce qu Opale a retenu » : la ligne de la veille retenue par Opale verrouille', true,
    /\.eq\('data->>dateRdv', demain\); const deja = new Set\( \(dejaRows \?\? \[\]\) \.filter\(\(r\) => !SE_RETENTE\.has\(\(r\.data as \{ statut\?: string \} \| null\)\?\.statut \?\? ''\) \|\| retenuParOpale\(r\.data as \{ detail\?: unknown \} \| null\)\)/.test(r));
  dit('... et les reprises et les points aussi', 3, (r.match(/\|\| retenuParOpale\(r\.data as \{ detail\?: unknown \} \| null\)\)/g) ?? []).length);
  const ligneDe = (s: string, debut: string) => { const i = s.indexOf(debut); return i < 0 ? '' : s.slice(i, s.indexOf(';', s.indexOf("'$1')", i)) + 1); };
  dit('le texte sans civilite de rappels-j1 est celui de la porte, mot pour mot', true,
    ligneDe(r, 'const texteSansCivilite = ') !== '' && ligneDe(r, 'const texteSansCivilite = ') === ligneDe(pur, 'export const texteSansCivilite = ').replace(/^export /, ''));
  dit('la cle du numero de rappels-j1 est celle de la porte', true,
    r.includes("const d = numeroIntl(String(brut ?? '')) ?? ''; return d.length === 13 && d.startsWith('22901') ? `229${d.slice(5)}` : d;")
    && pur.includes("return d.length === 13 && d.startsWith('22901') ? `229${d.slice(5)}` : d;"));
  dit('PANNE « rappels-j1 compare le numero tel quel » / « la tete oubliee » : le fil se range par cle du numero, par fiche et par texte sans civilite', true,
    r.includes("...(r.data?.clientId ? [`${cleDuNumero(r.data?.numero)}|tete|${r.data.clientId}`] : []),")
    && r.includes("...(r.data?.texte ? [`${cleDuNumero(r.data?.numero)}|texte|${texteSansCivilite(r.data.texte)}`] : []),")
    && r.includes(".filter((r) => r.data?.etat !== 'non-remis')"));
  dit('PANNE « rappels-j1 revient au texte exact » : le meme modele, la meme cle et la meme fiche suffisent', true,
    r.includes('if (tel && (dejaRemis.has(`${cleDuNumero(tel)}|tete|${a.clientId}`) || dejaRemis.has(`${cleDuNumero(tel)}|texte|${texteSansCivilite(`${prenom}, votre rendez-vous est demain à ${heureLisible(a.time)}.`)}`))) { dejaRemisTus++; continue; }')
    && !r.includes('dejaRemis.has(`${tel}|'));
  dit('le garde du fil passe avant tout depot et tout envoi', true, r.indexOf('dejaRemis.has(') > 0 && r.indexOf('dejaRemis.has(') < r.indexOf("consigne('whatsapp', a, 'en-attente'"));
}

if (ko) { console.log(`\n${ko} ECHEC(S) sur ${n}.`); process.exit(1); }
console.log(`\n${n} epreuves : tout est juste.`);
