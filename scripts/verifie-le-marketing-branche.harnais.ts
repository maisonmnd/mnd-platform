/* LE MARKETING BRANCHÉ, ÉPROUVÉ — `node scripts/verifie-le-marketing-branche.mjs`.

   21 octobre 2026. Ses mots : « Dans marketing les boutons campagnes,
   automatisations et audience ne sont pas branchés et ne sont pas reliés.
   Corrige. » Ses réponses au sélecteur : les deux canaux ; une campagne
   retenue jusqu'à son feu vert ; les fausses automatisations rangées en idées,
   sans interrupteur ; des audiences calculées ; et SEUL L'ACCORD NOTÉ ouvre
   WhatsApp (pas « les habituées d'office »).

   Les attentes viennent de ces choix et des règles de la Maison (jamais de
   prix dans une campagne, une passante n'est pas une audience, la date du
   salon), jamais du code. Données d'exemple : les noms sont inventés. */
import {
  aAccepteLesNouvelles, baseDesAudiences, cleDuSegment, estUneAudienceConnue, membresDeLAudience, nomDeLAudience, porteeDeLAudience,
  type ContexteDAudience, type TeteDAudience,
} from '../src/shared/audiences-pur';
import {
  ceQuiManque, contientUnPrix, etatDeLaCampagne, feuVert, idDeLEnvoi, lignesDuDepot, resultatDeLaCampagne, texteDuModele, type Campagne,
} from '../src/shared/campagnes-pur';
import {
  AUTOMATISATIONS_REELLES, IDEES_PAS_ENCORE_CONSTRUITES, compteDeTout, compteDuMois,
} from '../src/shared/automatisations-reelles-pur';
import { TYPE_DIT, type EnvoiLu } from '../src/shared/envois';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  const ok = a === o;
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${o.slice(0, 200)}`);
  if (!ok) console.log(`       attendu ${a.slice(0, 200)}`);
};

/* ── Les têtes d'exemple ─────────────────────────────────────────────── */
type T = TeteDAudience & { name: string; dePassage?: boolean };
const oui = { oui: true, le: '2026-10-01', par: 'comptoir' as const };
const non = { oui: false, le: '2026-10-02', par: 'stop' as const };
const tetes: T[] = [
  { id: 'a', name: 'Ada A.', branchId: 'cot', segments: ['Régulier'], phone: '+229 01 51 00 00 01', nouvelles: oui },
  { id: 'b', name: 'Bea B.', branchId: 'cot', segments: ['Régulier'], phone: '+229 01 51 00 00 02' },
  { id: 'c', name: 'Cora C.', branchId: 'cot', segments: ['Régulier', 'VIP'], phone: '', nouvelles: oui, authUserId: 'u-c' },
  { id: 'd', name: 'Dina D.', branchId: 'cot', segments: ['Régulier'], phone: '+229 01 51 00 00 04', nouvelles: non },
  { id: 'e', name: 'Eva E.', branchId: 'cot', segments: ['Régulier'], phone: '+229 01 51 00 00 05', nouvelles: oui, dePassage: true },
  { id: 'f', name: 'Fifi F.', branchId: 'cot', segments: ['Régulier'], phone: '+229 01 51 00 00 06', nouvelles: oui, archived: true },
  { id: 'g', name: 'Gina G.', branchId: 'lome', segments: ['Régulier'], phone: '+228 90 00 00 07', nouvelles: oui },
  { id: 'h', name: 'Hawa H.', branchId: 'cot', segments: [], phone: '+229 01 51 00 00 08', nouvelles: oui, birthday: '1990-10-12' },
];
const base = baseDesAudiences(tetes, 'cot', (t) => !!t.dePassage);
dit('la base : branche, pas archivée, pas de passage', ['a', 'b', 'c', 'd', 'h'], base.map((t) => t.id));

const ctx: ContexteDAudience = {
  aujourdhui: '2026-10-21',
  venues: new Map([
    ['a', ['2026-10-01']],
    ['b', ['2026-05-01', '2026-06-01']], // dormante : dernière venue le 1er juin
    ['d', ['2026-06-10']], // une seule venue, il y a plus de 60 jours… mais un RDV à venir
    ['h', ['2026-07-01']], // une seule venue, rien à venir
  ]),
  aVenir: new Set(['d']),
  abonnees: new Set(['c']),
};
dit('segment Régulier : les quatre de la base', ['a', 'b', 'c', 'd'], membresDeLAudience(cleDuSegment('Régulier'), base, ctx).map((t) => t.id));
/* Hawa, venue une fois le 1er juillet, rien depuis : 112 jours, elle est
   dormante ET venue une seule fois. Dina, rien depuis juin mais un RDV à
   venir : ni l'une ni l'autre. */
dit('dormantes : la dernière venue a plus de 90 jours, rien à venir', ['b', 'h'], membresDeLAudience('dormantes', base, ctx).map((t) => t.id));
dit('une seule venue, plus de 60 jours, rien à venir (pas Dina : elle revient)', ['h'], membresDeLAudience('une-venue', base, ctx).map((t) => t.id));
dit('anniversaire ce mois (octobre)', ['h'], membresDeLAudience('anniversaires', base, ctx).map((t) => t.id));
dit('abonnées en cours', ['c'], membresDeLAudience('abonnees', base, ctx).map((t) => t.id));
dit('une audience inconnue ne prend personne', [], membresDeLAudience('nimporte', base, ctx).map((t) => t.id));
dit('les clés connues', [true, true, false], [estUneAudienceConnue('seg:VIP'), estUneAudienceConnue('dormantes'), estUneAudienceConnue('toutes')]);
dit('le nom d’une audience', ['VIP', 'Dormantes depuis 90 jours'], [nomDeLAudience('seg:VIP'), nomDeLAudience('dormantes')]);

/* ── L'accord, seul, ouvre WhatsApp ───────────────────────────────────── */
dit('sans accord noté : pas d’accord ; STOP : non', [true, false, false], [aAccepteLesNouvelles(tetes[0]), aAccepteLesNouvelles(tetes[1]), aAccepteLesNouvelles(tetes[3])]);
const abonnes = new Set(['b', 'u-c']);
const reguliers = membresDeLAudience(cleDuSegment('Régulier'), base, ctx);
const portee = porteeDeLAudience(reguliers, abonnes);
dit('portée WhatsApp : accord ET numéro (Cora n’a pas de numéro)', ['a'], portee.whatsapp.map((t) => t.id));
dit('portée notification : par la fiche ou par le compte rattaché', ['b', 'c'], portee.notification.map((t) => t.id));
dit('sans accord noté ou refusé', ['b', 'd'], portee.sansAccord.map((t) => t.id));

/* ── Le dépôt : retenu, une tête un message, WhatsApp d'abord ─────────── */
const camp: Campagne = {
  id: 'cp1', branchId: 'cot', nom: 'L’entretien d’octobre', audience: cleDuSegment('Régulier'), canaux: ['whatsapp', 'notification'],
  modele: 'nouvelles_de_la_maison', apercu: 'Bonjour {{1}}, la Maison MND vous ouvre ses fauteuils.', titre: 'Maison MND', corps: 'Vos fauteuils d’octobre.',
  partA: '2026-10-23T09:00:00.000Z', statut: 'brouillon', creeLe: '2026-10-21T08:00:00.000Z',
};
const outils = {
  maintenantIso: '2026-10-21T08:30:00.000Z', qui: 'Yéman',
  appel: (t: T) => (t.id === 'a' ? 'Madame Ada' : t.name.split(' ')[0]),
  prenom: (t: T) => t.name.split(' ')[0],
  numero: (t: T) => (t.phone ?? '').replace(/\D/g, ''),
  abonnesAuxNotifications: abonnes as ReadonlySet<string>,
};
const depot = lignesDuDepot(camp, reguliers, outils);
dit('le dépôt : Ada par WhatsApp, Bea et Cora par notification, Dina rien', [['a', 'whatsapp'], ['b', 'push'], ['c', 'push']], depot.map((l) => [l.clientId, l.canal]));
dit('tout est retenu, rien en attente', ['retenu', 'retenu', 'retenu'], depot.map((l) => l.statut));
dit('l’identifiant est déterministe', 'camp-cp1-a-whatsapp', depot[0].id);
dit('un même dépôt rejoué donne les mêmes lignes', depot.map((l) => l.id), lignesDuDepot(camp, reguliers, outils).map((l) => l.id));
const colisWa = depot[0].colis as { genre: string; modele: string; composants: { parameters: { text: string }[] }[]; texteAuFil?: string };
dit('le modèle et sa variable {{1}} = la civilité et le prénom', ['nouvelles_de_la_maison', 'Madame Ada'], [colisWa.modele, colisWa.composants[0].parameters[0].text]);
dit('le fil garde le texte, la variable remplie', 'Bonjour Madame Ada, la Maison MND vous ouvre ses fauteuils.', colisWa.texteAuFil);
dit('la notification part vers le compte de Cora', 'u-c', (depot[2].colis as { clientId: string }).clientId);
dit('WhatsApp seul : les têtes sans accord ne reçoivent rien', ['a'], lignesDuDepot({ ...camp, canaux: ['whatsapp'] }, reguliers, outils).map((l) => l.clientId));
dit('notification seule : celles qui l’ont allumée', ['b', 'c'], lignesDuDepot({ ...camp, canaux: ['notification'] }, reguliers, outils).map((l) => l.clientId));
dit('aucune ligne SMS', 0, depot.filter((l) => (l.canal as string) === 'sms').length);
dit('joignable des deux façons : un seul message, WhatsApp', [['a', 'whatsapp']],
  lignesDuDepot(camp, [tetes[0]], { ...outils, abonnesAuxNotifications: new Set(['a']) }).map((l) => [l.clientId, l.canal]));

/* ── Le feu vert ──────────────────────────────────────────────────────── */
const maintenant = '2026-10-22T10:00:00.000Z';
const relache = feuVert(depot, (id) => id === 'a', maintenant, 'Yéman');
dit('le feu vert : en attente, à l’heure dite (le 23 à 9 h UTC)', ['en-attente', '2026-10-23T09:00:00.000Z'], [relache[0].statut, relache[0].partA]);
const tard = feuVert(depot.map((l) => ({ ...l, partA: '2026-10-20T09:00:00.000Z' })), () => true, maintenant, 'Yéman');
dit('une heure passée part maintenant', maintenant, tard[0].partA);
const retire = feuVert(depot, () => false, maintenant, 'Yéman');
dit('l’accord retiré avant le départ : WhatsApp écarté, la notification part', ['écarté', 'en-attente', 'en-attente'], retire.map((l) => l.statut));
const dejaParti = [{ ...depot[0], statut: 'envoyé' }];
dit('ce qui n’est plus retenu ne bouge pas', 'envoyé', feuVert(dejaParti, () => true, maintenant, 'Yéman')[0].statut);

/* ── Jamais de prix ───────────────────────────────────────────────────── */
dit('des prix', [true, true, true, true, true], ['25 000 F', '15000 FCFA', '10.000 francs', 'à 5 000 F CFA', 'en XOF'].map(contientUnPrix));
dit('pas des prix', [false, false, false, false], ['le 5 février', '2 fois par mois', 'jeu. 23 oct. 2026', '3 séances'].map(contientUnPrix));
dit('un prix dans le texte bloque le dépôt', true, ceQuiManque({ ...camp, apercu: 'Bonjour {{1}}, 25 000 F seulement.' }, 3).some((m) => /sans prix/.test(m)));
dit('une campagne complète ne manque de rien', [], ceQuiManque(camp, 3));
dit('un nom de modèle mal formé', true, ceQuiManque({ ...camp, modele: 'Nouvelles de la Maison' }, 3).some((m) => /modèle/.test(m)));
dit('personne de joignable', true, ceQuiManque(camp, 0).some((m) => /joignable/.test(m)));
dit('texteDuModele', 'Bonjour Ola,', texteDuModele('Bonjour {{ 1 }},', 'Ola'));

/* ── L'état et le résultat ────────────────────────────────────────────── */
dit('un brouillon', 'brouillon', etatDeLaCampagne({ statut: 'brouillon' }, []));
dit('retenue', 'retenue', etatDeLaCampagne({ statut: 'deposee' }, depot));
dit('en route', 'en-route', etatDeLaCampagne({ statut: 'deposee' }, relache));
dit('partie', 'partie', etatDeLaCampagne({ statut: 'deposee' }, [{ statut: 'envoyé' }, { statut: 'écarté' }]));
dit('écartée', 'ecartee', etatDeLaCampagne({ statut: 'deposee' }, [{ statut: 'écarté' }]));

const parties: EnvoiLu[] = [
  { id: 'x1', type: 'campagne', canal: 'whatsapp', statut: 'envoyé', etat: 'lu', quand: '2026-10-23T09:01:00.000Z', clientId: 'a' },
  { id: 'x2', type: 'campagne', canal: 'push', statut: 'envoyé', quand: '2026-10-23T09:02:00.000Z', clientId: 'b' },
  { id: 'x3', type: 'campagne', canal: 'push', statut: 'sans-abonnement', quand: '2026-10-23T09:02:00.000Z', clientId: 'c' },
];
const rdvs = [
  { clientId: 'a', status: 'honoré', creeLe: '2026-10-24T10:00:00.000Z' },
  { clientId: 'b', status: 'confirmé', creeLe: '2026-11-02T10:00:00.000Z' },
  { clientId: 'b', status: 'annulé', creeLe: '2026-10-25T10:00:00.000Z' },
  { clientId: 'a', status: 'confirmé', creeLe: '2026-11-20T10:00:00.000Z' }, // après 14 jours
  { clientId: 'c', status: 'confirmé', creeLe: '2026-10-24T10:00:00.000Z' }, // jamais jointe
  { clientId: 'a', status: 'confirmé' }, // sans date de prise : ne compte pas
];
const r = resultatDeLaCampagne(parties, rdvs);
dit('résultat : parti le premier envoi', '2026-10-23T09:01:00.000Z', r.depart);
dit('résultat : 2 partis, 1 lu', [2, 1], [r.partis, r.lus]);
dit('résultat : 2 RDV pris sous 14 jours par des têtes jointes, 1 honoré', [2, 1], [r.rdvPris, r.rdvHonores]);
dit('rien de parti, rien à compter', [null, 0], [resultatDeLaCampagne([], rdvs).depart, resultatDeLaCampagne([], rdvs).rdvPris]);
/* Vu sur l'écran du banc : une campagne retenue se disait « partie ». */
const rDepot = resultatDeLaCampagne(depot, rdvs);
dit('retenue : rien de parti, aucun départ', [null, 0], [rDepot.depart, rDepot.partis]);
const rRelache = resultatDeLaCampagne(relache, rdvs);
dit('au feu vert, en attente du facteur : toujours rien de parti', [null, 0], [rRelache.depart, rRelache.partis]);

/* ── Les automatisations réelles ─────────────────────────────────────── */
const SEMENCE = ['J-1 avant un rituel', 'Loc · jour 365', 'Dormante · 90 jours', 'Après un soin · J+5', 'Acompte non réglé · 2 h', 'Stock bas · seuil'];
dit('aucune ligne semée ne passe pour réelle', [], AUTOMATISATIONS_REELLES.filter((a) => SEMENCE.includes(a.quand)).map((a) => a.id));
dit('chaque type compté est un type du journal', [], AUTOMATISATIONS_REELLES.flatMap((a) => a.types).filter((t) => !TYPE_DIT[t]));
dit('un interrupteur ailleurs dit où il vit', [], AUTOMATISATIONS_REELLES.filter((a) => a.allumage === 'reglage' && !a.reglage).map((a) => a.id));
dit('une ligne non comptée dit pourquoi', [], AUTOMATISATIONS_REELLES.filter((a) => a.types.length === 0 && !a.pasCompte).map((a) => a.id));
dit('les quatre idées restent visibles', 4, IDEES_PAS_ENCORE_CONSTRUITES.length);
const envois: EnvoiLu[] = [
  { id: 'r1', type: 'rappel-j1', canal: 'whatsapp', statut: 'envoyé', etat: 'remis', quand: '2026-10-20T17:00:00.000Z', branchId: 'cot' },
  { id: 'r2', type: 'rappel-j1', canal: 'whatsapp', statut: 'échec', quand: '2026-10-19T17:00:00.000Z', branchId: 'cot' },
  { id: 'r3', type: 'rappel-j1', canal: 'whatsapp', statut: 'envoyé', quand: '2026-09-30T23:30:00.000Z', branchId: 'cot' }, // 1er oct. 0 h 30 au salon
  { id: 'r4', type: 'rappel-j1', canal: 'whatsapp', statut: 'en-attente', quand: '2026-10-21T07:00:00.000Z', branchId: 'cot' },
  { id: 'r5', type: 'rappel-j1', canal: 'whatsapp', statut: 'envoyé', quand: '2026-10-20T17:00:00.000Z', branchId: 'lome' },
  { id: 'c1', type: 'confirmation', canal: 'whatsapp', statut: 'envoyé', etat: 'lu', quand: '2026-10-21T08:00:00.000Z', branchId: 'cot' },
];
const cr = compteDuMois(envois, ['rappel-j1'], '2026-10', 'cot');
dit('le rappel ce mois : 2 partis (le 1er oct. à 0 h 30 au salon compte), l’attente et l’autre branche non', [2, 1], [cr.partis, cr.aRegarder]);
dit('le dernier départ du mois', '2026-10-20T17:00:00.000Z', cr.dernier);
dit('le total de l’onglet', 3, compteDeTout(envois, '2026-10', 'cot').partis);
dit('identifiant d’envoi par canal', 'camp-x-y-push', idDeLEnvoi('x', 'y', 'notification'));

console.log(ko === 0 ? '\nLe marketing branche tient.' : `\n${ko} attente(s) dechue(s).`);
