/* LES FICHES D'ESSAI, ÉPROUVÉES : `node scripts/verifie-essai.mjs` (`--prouve`).

   7 novembre 2026 : « des RDV test qui ne vont pas dans notre liste de RDV,
   comme en sandbox ? » puis « ni dans le chiffre d'affaires » (Yéman). La règle
   (shared/essai-pur.ts), ses portes (shared/essai.ts) et les écrans qui les
   prennent. Tout est inventé. Sortie ASCII : la console de Windows. */
import { readFileSync } from 'node:fs';
import {
  CASE_DE_LA_FICHE, MONTRER_LES_ESSAIS, MOT_ESSAI, PHRASE_DE_LA_CASE, SERVICE_D_ESSAI_ID, SQL_SANS_FICHE_D_ESSAI,
  estUnePieceDEssai, estUneFicheDEssai, estUnRdvDEssai, fichesParId, fichesSansLesEssais, nombreDEssais,
  piecesSansLesEssais, rdvsDuCalendrier, rdvsParPiece, sansLesEssais,
} from '../src/shared/essai-pur';
import { appointmentsStore } from '../src/shared/agenda';
import { clientsStore } from '../src/shared/clients';
import { invoicesStore, paymentsStore } from '../src/shared/finance';
import { paiementsDeLaMaison, piecesDeLaMaison, rdvsDeLaMaison } from '../src/shared/essai';

let ko = 0;
let n = 0;
const ascii = (v: unknown): string =>
  (JSON.stringify(v) ?? 'undefined').replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : ` -> ${ascii(obtenu)}`}`);
  if (!ok) console.log(`       attendu ${ascii(attendu)}`);
};
const sansCommentaires = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s+/g, ' ');

/* ── Les fiches ───────────────────────────────────────────────────────── */
const vraie = { id: 'c-vraie', essai: undefined as boolean | undefined };
const essai = { id: 'c-essai', essai: true };
const decochee = { id: 'c-decochee', essai: false };
const fiches = fichesParId([vraie, essai, decochee]);
dit('une fiche cochee est d essai', true, estUneFicheDEssai(essai));
dit('une fiche sans marque, decochee, absente ou nulle compte', [false, false, false, false], [
  estUneFicheDEssai(vraie), estUneFicheDEssai(decochee), estUneFicheDEssai(undefined), estUneFicheDEssai(null)]);
dit('« true » en texte n est pas la marque (seul le booleen vrai)', false, estUneFicheDEssai({ id: 'x', essai: 'true' as unknown as boolean }));

/* ── Les rendez-vous ──────────────────────────────────────────────────── */
const rdv = (id: string, clientId: string, extra: Record<string, unknown> = {}) => ({ id, clientId, serviceIds: ['s-nattes'], ...extra });
dit('un rendez-vous de la fiche d essai est d essai', true, estUnRdvDEssai(rdv('r1', 'c-essai'), fiches));
dit('un rendez-vous d une vraie fiche compte', false, estUnRdvDEssai(rdv('r2', 'c-vraie'), fiches));
dit('un rendez-vous d une fiche decochee compte', false, estUnRdvDEssai(rdv('r2b', 'c-decochee'), fiches));
dit('une cliente de passage (sans fiche) ou inconnue compte', [false, false], [
  estUnRdvDEssai(rdv('r3', ''), fiches), estUnRdvDEssai(rdv('r4', 'c-fantome'), fiches)]);
dit('le service des essais rend d essai, fiche vraie ou non', [true, true], [
  estUnRdvDEssai(rdv('r5', 'c-vraie', { serviceIds: [SERVICE_D_ESSAI_ID] }), fiches),
  estUnRdvDEssai(rdv('r6', '', { serviceIds: ['s-x', SERVICE_D_ESSAI_ID] }), fiches)]);
dit('l identifiant du service des essais', 'doiqyq0g0m', SERVICE_D_ESSAI_ID);
dit('un rendez-vous sans services ne plante pas', false, estUnRdvDEssai({ id: 'r7', clientId: 'c-vraie', serviceIds: null }, fiches));

const tous = [rdv('a', 'c-vraie'), rdv('b', 'c-essai'), rdv('c', 'c-vraie', { serviceIds: [SERVICE_D_ESSAI_ID] }), rdv('d', 'c-decochee'), rdv('e', 'c-essai', { coveredBySub: true })];
dit('sansLesEssais garde les vrais, dans l ordre', ['a', 'd'], sansLesEssais(tous, fiches).map((r) => r.id));
dit('sansLesEssais ne touche pas la liste d origine', 5, (sansLesEssais(tous, fiches), tous.length));
dit('un rendez-vous de FORMULE d une fiche d essai sort aussi des comptes de formule', false, sansLesEssais(tous, fiches).some((r) => r.coveredBySub));

/* ── Le calendrier ────────────────────────────────────────────────────── */
dit('le calendrier cache les essais par defaut', ['a', 'd'], rdvsDuCalendrier(tous, fiches, false).map((r) => r.id));
dit('« Montrer les essais » les fait paraitre, tous', ['a', 'b', 'c', 'd', 'e'], rdvsDuCalendrier(tous, fiches, true).map((r) => r.id));
dit('le calendrier dit combien d essais il cache', 3, nombreDEssais(tous, fiches));

/* ── Les pieces ───────────────────────────────────────────────────────── */
const piece = (id: string, clientId: string, extra: Record<string, unknown> = {}) => ({ id, clientId, ...extra });
const rdvPieces = [
  { id: 'rp1', clientId: '', serviceIds: ['s-x'], invoiceId: 'p-liee-par-rdv' },
  { id: 'rp2', clientId: 'c-essai', serviceIds: ['s-x'] },
  { id: 'rp3', clientId: 'c-vraie', serviceIds: ['s-x'], invoiceId: 'p-vraie-liee' },
];
const liens = { parId: new Map(rdvPieces.map((r) => [r.id, r])), parPiece: rdvsParPiece(rdvPieces) };
dit('une piece de la fiche d essai est d essai', true, estUnePieceDEssai(piece('p1', 'c-essai'), fiches));
dit('une piece d une vraie cliente, d un walk-in ou sans cliente compte', [false, false, false], [
  estUnePieceDEssai(piece('p2', 'c-vraie'), fiches), estUnePieceDEssai(piece('p3', ''), fiches), estUnePieceDEssai(piece('p4', 'c-fantome'), fiches)]);
dit('une piece sans cliente liee (apptId) a un rendez-vous d essai est d essai', true,
  estUnePieceDEssai(piece('p5', '', { apptId: 'rp2' }), fiches, liens));
dit('une piece portee par le rendez-vous d essai (invoiceId) est d essai', true,
  estUnePieceDEssai(piece('p-liee-par-rdv', ''), fiches, { parId: liens.parId, parPiece: new Map([['p-liee-par-rdv', { clientId: 'c-essai', serviceIds: [] }]]) }));
dit('une piece liee a un rendez-vous qui compte compte', false, estUnePieceDEssai(piece('p-vraie-liee', ''), fiches, liens));
dit('une piece liee au service des essais est d essai', true,
  estUnePieceDEssai(piece('p6', '', { apptId: 'rs' }), fiches, { parId: new Map([['rs', { clientId: 'c-vraie', serviceIds: [SERVICE_D_ESSAI_ID] }]]), parPiece: new Map() }));
dit('piecesSansLesEssais ne garde que les pieces qui comptent', ['p2', 'p3'],
  piecesSansLesEssais([piece('p1', 'c-essai'), piece('p2', 'c-vraie'), piece('p3', ''), piece('p5', '', { apptId: 'rp2' })], fiches, rdvPieces).map((p) => p.id));
dit('fichesSansLesEssais ote les fiches d essai des statistiques', ['c-vraie', 'c-decochee'], fichesSansLesEssais([vraie, essai, decochee]).map((c) => c.id));

/* ── Les portes, sur les magasins (hors React) ────────────────────────── */
const C = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: id, branchId: 'b', ...extra }) as never;
const R = (id: string, clientId: string, extra: Record<string, unknown> = {}) => ({ id, clientId, branchId: 'b', serviceIds: ['s-nattes'], date: '2026-11-07', time: '10:00', status: 'honoré', ...extra }) as never;
clientsStore.set([C('c-vraie'), C('c-essai', { essai: true })]);
appointmentsStore.set([R('r-v', 'c-vraie', { invoiceId: 'f-v' }), R('r-e', 'c-essai', { invoiceId: 'f-e' }), R('r-s', 'c-vraie', { serviceIds: [SERVICE_D_ESSAI_ID] })]);
invoicesStore.set([
  { id: 'f-v', clientId: 'c-vraie', kind: 'facture' }, { id: 'f-e', clientId: '', kind: 'facture', apptId: 'r-e' }, { id: 'f-w', clientId: '', kind: 'facture' },
] as never);
paymentsStore.set([
  { id: 'k1', partnerId: 'r-v', clientId: 'c-vraie', status: 'success', amountXof: 100 }, { id: 'k2', partnerId: 'r-e', clientId: 'c-essai', status: 'success', amountXof: 100 },
  { id: 'k3', partnerId: 'r-s', status: 'success', amountXof: 100 },
] as never);
dit('la porte des rendez-vous de la Maison : sans l essai ni le service', ['r-v'], rdvsDeLaMaison().map((r) => r.id));
dit('... et le registre entier garde tout (la chaine d essai continue)', ['r-v', 'r-e', 'r-s'], appointmentsStore.get().map((r) => r.id));
dit('la porte des pieces de la Maison : sans la piece de l essai', ['f-v', 'f-w'], piecesDeLaMaison().map((p) => p.id));
dit('... et le registre des pieces garde tout', ['f-v', 'f-e', 'f-w'], invoicesStore.get().map((p) => p.id));
dit('la porte des paiements en ligne : sans les versements d essai', ['k1'], paiementsDeLaMaison().map((p) => p.id));
dit('... et le registre des paiements garde tout', ['k1', 'k2', 'k3'], paymentsStore.get().map((p) => p.id));

/* ── Les mots et la requete des assistants ────────────────────────────── */
dit('la requete SQL des assistants', "not coalesce((c.data->>'essai')::boolean, false)", SQL_SANS_FICHE_D_ESSAI);
dit('les mots de l ecran', ['Essai', 'Montrer les essais'], [MOT_ESSAI, MONTRER_LES_ESSAIS]);
dit('la case dit la phrase de la demande', true, CASE_DE_LA_FICHE.startsWith('Fiche d’essai (rien de ses rendez-vous ni de ses paiements ne compte)'));
dit('aucun tiret long dans les textes d ecran', false, [CASE_DE_LA_FICHE, PHRASE_DE_LA_CASE, MOT_ESSAI, MONTRER_LES_ESSAIS].some((t) => t.includes('—')));

/* ── Les ecrans : la gestion lit SANS les essais ──────────────────────── */
const lit = (f: string) => sansCommentaires(f);
const T = 'src/apps/trone/';
const compte = [
  'routes/finances/Synthese.tsx', 'routes/finances/ChiffreDesPrestations.tsx', 'routes/finances/RevenuDuJour.tsx', 'routes/finances/useClotureDuJour.ts',
  'routes/finances/_shared.tsx', 'routes/finances/Encaissements.tsx', 'routes/finances/Coffre.tsx', 'routes/finances/Caisses.tsx', 'routes/finances/JournalDeCaisse.tsx',
  'routes/finances/SalonFoyer.tsx', 'routes/pilotage/Dashboard.tsx', 'routes/pilotage/Analytics.tsx', 'routes/pilotage/BilanMensuel.tsx', 'routes/pilotage/Previsions.tsx',
  'routes/pilotage/PrevisionDuMois.tsx', 'routes/clients/Carnet.tsx', 'routes/vente/Factures.tsx', 'routes/equipe/Paie.tsx',
  'routes/equipe/Personnel.tsx', 'routes/equipe/Pourboires.tsx', 'routes/equipe/Cercle.tsx', 'routes/equipe/MonMois.tsx', 'shell/Notifications.tsx',
];
const brut = (f: string) => lit(T + f);
dit('ces ecrans de comptes ne lisent plus les registres entiers (ni useInvoices, ni useAppointments)',
  [], compte.filter((f) => /\buse(Invoices|Appointments)\(\)/.test(brut(f))));
dit('... et lisent par la porte de la Maison', [],
  compte.filter((f) => !/use(PiecesDeLaMaison|RdvsDeLaMaison|BranchAppointments|ClientsDeLaMaison)\(\)/.test(brut(f))));
const partage = lit(T + 'routes/clients/_shared.tsx');
dit('useBranchAppointments passe par la porte de la Maison ; la version avec essais existe pour la fiche', [true, true], [
  partage.includes('export function useBranchAppointments(): Appointment[] { const { branch } = useBranch(); const [appointments] = useRdvsDeLaMaison();'),
  partage.includes('export function useBranchAppointmentsAvecEssais(): Appointment[] { const { branch } = useBranch(); const [appointments] = useAppointments();')]);
const calendrier = lit(T + 'routes/clients/Calendrier.tsx');
dit('le calendrier cache les essais sauf demande, juge les chevauchements sur TOUT, marque « Essai »', [true, true, true, true, true], [
  calendrier.includes('const appts = useMemo(() => rdvsDuCalendrier(tousLesRdv, fichesDuCalendrier, montrerLesEssais)'),
  calendrier.includes('return tousLesRdv.some((a) => {'),
  calendrier.includes('{MONTRER_LES_ESSAIS}'),
  (calendrier.match(/\{estEssai\(a\) && <BadgeEssai \/>\}/g) ?? []).length === 3,
  calendrier.includes("{estEssai(a) ? ' · Essai' : ''}")]);
const fiche = readFileSync(T + 'routes/clients/Customers.tsx', 'utf8').replace(/\s+/g, ' ');
dit('la case « Fiche d essai » est de la direction seule, et le badge suit le nom', [true, true, true], [
  fiche.includes('{estDirection && ( <Field label="Fiche d’essai">'),
  fiche.includes("onChange={(e) => patch({ essai: e.target.checked ? true : undefined })}"),
  fiche.includes('{client.name}{estUneFicheDEssai(client) && <BadgeEssai />}')]);
const convs = lit(T + 'routes/clients/LesConversations.tsx');
dit('la liste des conversations porte le badge (ligne et tete)', 2, (convs.match(/estUneFicheDEssai\(clients\.find\(\(c\) => c\.id === b\.clientId\)\) && <BadgeEssai \/>/g) ?? []).length);

/* ── La chaine d essai ne bouge pas : ce qui sert LA cliente lit tout ──── */
const chaine = [
  'shell/useLaFinDuRituel.ts', 'shell/useReglementsEnLigne.ts', 'shell/useLaMainDeGrenat.ts', 'shell/useMndPayRattache.ts', 'routes/clients/actions.tsx',
  'routes/clients/ReglementEnDirect.tsx', 'routes/clients/SalleDesEnvois.tsx', 'routes/clients/ReponseProposee.tsx', 'routes/clients/Customers.tsx',
  'routes/clients/Gerard.tsx', 'routes/clients/gerard-donnees.ts', 'routes/clients/LesConversations.tsx',
];
dit('la fin du rituel, le reglement en ligne, la main de Grenat, l encaissement, la salle des envois et les conversations lisent TOUT',
  [], chaine.filter((f) => /use(PiecesDeLaMaison|RdvsDeLaMaison|PaiementsDeLaMaison)\(\)|useBranchAppointments\(\)/.test(brut(f))));
const couronne = ['apps/couronne/Tabs.tsx', 'apps/couronne/MonSolde.tsx', 'apps/couronne/RituelEnCours.tsx', 'apps/couronne/Booking.tsx'];
dit('Ma Couronne ne connait pas la porte de la Maison', [], couronne.filter((f) => /use(Rdvs|Pieces|Paiements|Clients)DeLaMaison/.test(lit('src/' + f))));
const fonction = lit('supabase/functions/cloture-du-jour/index.ts');
dit('la cloture du jour de Grenat exclut les fiches d essai (rendez-vous et pieces)', [true, true, true], [
  fonction.includes("const fichesDEssai = new Set(lignesFiches.filter((l) => l.data?.essai === true)"),
  fonction.includes('lignesRdv = lignesRdv.filter((l) => !idsRdvEssai.has(String(l.id)));'),
  fonction.includes('if (fichesDEssai.has(String(l.data?.clientId ?? \'\')) || idsRdvEssai.has(String(l.data?.apptId ?? \'\'))) pieces.delete(id);')]);
const centre = lit('supabase/functions/centre-de-commande/index.ts');
dit('le briefing de la direction (centre de commande) exclut le service des essais, sans jamais lire la table des clientes', [true, false], [
  centre.includes('.filter((r: Rdv) => !(r.serviceIds ?? []).includes(SERVICE_D_ESSAI))'), /from\('clients'\)/.test(centre)]);
const conseil = lit('supabase/functions/conseil-du-matin/index.ts');
dit('la page du matin exclut les fiches d essai (rendez-vous du jour, actives du lundi)', [true, true], [
  conseil.includes('.filter((r) => !rdvDEssai(r.data, essais)).map((r) => ({ time'),
  conseil.includes('lignes.filter((r) => !rdvDEssai(r.data, essais))')]);
const lancement = lit(T + 'routes/equipe/lancement.ts');
dit('le Cercle et les audiences comptent les fiches sans les essais', [true, true], [
  /useClientsDeLaMaison\(\)/.test(lit(T + 'routes/equipe/Cercle.tsx')), /useClientsDeLaMaison\(\)/.test(lit(T + 'routes/equipe/useAudiences.ts'))]);
dit('le plan du lancement lit la meme liste que sa fenetre (sinon l empreinte refuse)', true, lancement.includes('rdvsDesLunes(rdvsDeLaMaison())'));
const cl = lit('src/shared/clients.ts');
dit('la marque vit sur la fiche cliente', true, cl.includes('essai?: boolean;'));

console.log(`\n${n - ko}/${n} epreuves : les fiches d essai.`);
if (ko) console.log(`${ko} ECHEC(S).`);
