/* LES QUATRE AUTRES AGENTS, ÉPROUVÉS — `node scripts/verifie-les-quatre-agents.mjs`.

   24 octobre 2026 : « Construis les quatre autres agents (planning,
   comptabilité, avis, stock) » (Yéman). Les règles (shared/agents-maison-
   pur.ts) et l'écran (texte). Tout est inventé. Sortie ASCII. */
import {
  chargeDuJour, cleDuLibelle, depensesEnAttente, depensesSansJustificatif, etatDesAvis, gammeAReassortir, rangementsProposes, tauxDit,
  type DepenseLue,
} from '../src/shared/agents-maison-pur';
import { readFileSync } from 'node:fs';

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

/* ── 1. LE PLANNING ─────────────────────────────────────────────────── */
const OUVERT = { closed: false, openMin: 9 * 60, closeMin: 19 * 60 }; // 10 h, 3 fauteuils = 1 800 min
const rdv = (h: number, duree: number) => ({ debutMin: h * 60, dureeMin: duree });
dit('un jour ferme : ferme, et ses rendez-vous poses sont signales', { etat: 'ferme', surFerme: 2 },
  (() => { const j = chargeDuJour({ iso: '2026-10-26', ouverture: { closed: true, openMin: 0, closeMin: 0 }, sieges: 3, rdvs: [rdv(10, 60), rdv(14, 60)] }); return { etat: j.etat, surFerme: j.surFerme }; })());
dit('la capacite : fauteuils x ouverture ; l occupe se borne a l ouverture (60 + 60 + 120)', [1800, 240],
  (() => { const j = chargeDuJour({ iso: 'x', ouverture: OUVERT, sieges: 3, rdvs: [rdv(8, 120), rdv(18, 120), rdv(12, 120)] }); return [j.capaciteMin, j.occupeMin]; })());
dit('creux sous 35 %, plein a 90 % et plus, sinon normal', ['creux', 'normal', 'plein'],
  [600, 1000, 1650].map((occ) => chargeDuJour({ iso: 'x', ouverture: OUVERT, sieges: 3, rdvs: [{ debutMin: 9 * 60, dureeMin: occ / 3 }, { debutMin: 9 * 60, dureeMin: occ / 3 }, { debutMin: 9 * 60, dureeMin: occ / 3 }] }).etat));
dit('trop de tetes : un bloc par chevauchement, dit a son plus haut', [{ heure: '14:00', tetes: 5 }],
  chargeDuJour({ iso: 'x', ouverture: OUVERT, sieges: 3, rdvs: [rdv(14, 120), rdv(14, 120), rdv(14, 120), rdv(14, 60), rdv(14.5, 30)] }).trop);
dit('a fauteuils egaux, rien a signaler', [], chargeDuJour({ iso: 'x', ouverture: OUVERT, sieges: 3, rdvs: [rdv(14, 120), rdv(14, 120), rdv(14, 120)] }).trop);
dit('sans fauteuils declares : la charge se lit sur un fauteuil, et aucun chevauchement ne crie', [600, []],
  (() => { const j = chargeDuJour({ iso: 'x', ouverture: OUVERT, sieges: 0, rdvs: [rdv(10, 60), rdv(10, 60)] }); return [j.capaciteMin, j.trop]; })());
dit('le taux se dit en pourcent entier', ['30 %', '95 %'], [tauxDit(0.301), tauxDit(0.949)]);

/* ── 2. LA COMPTABILITE ─────────────────────────────────────────────── */
const d = (o: Partial<DepenseLue>): DepenseLue => ({ id: 'x', branchId: 'b1', label: 'Achat', amountXof: 10000, date: '2026-10-10', category: 'Matières', ...o });
dit('sans justificatif : ce mois, au-dessus de 5 000 F, sans piece, pas refusees ; les plus lourdes d abord', ['gros', 'moyen'],
  depensesSansJustificatif([
    d({ id: 'moyen', amountXof: 8000 }), d({ id: 'gros', amountXof: 40000 }), d({ id: 'petit', amountXof: 2000 }),
    d({ id: 'avec', fichier: { chemin: 'x' } }), d({ id: 'vieux', date: '2026-09-30' }), d({ id: 'refusee', validation: { etat: 'refusee' } }), d({ id: 'ailleurs', branchId: 'b2' }),
  ], 'b1', '2026-10-01').map((x) => x.id));
dit('celles qui attendent un oui', ['a'], depensesEnAttente([d({ id: 'a', validation: { etat: 'attente' } }), d({ id: 'b', validation: { etat: 'validee' } }), d({ id: 'c' })], 'b1').map((x) => x.id));
dit('la cle d un libelle : deux mots qui comptent, sans accents ni casse ni nombres', ['achat meches', 'achat meches', 'transport'],
  [cleDuLibelle('Achat mèches Dantokpa'), cleDuLibelle('ACHAT de MECHES 12'), cleDuLibelle('Transport')]);
const rangements = rangementsProposes([
  d({ id: 'f1', fournisseurId: 'four-a', category: 'Matières' }), d({ id: 'f2', fournisseurId: 'four-a', category: 'Matières' }),
  d({ id: 'f3', fournisseurId: 'four-a', category: 'Divers', label: 'Paquet' }),
  d({ id: 'l1', label: 'Achat mèches Dantokpa', category: 'Matières' }), d({ id: 'l2', label: 'achat meches', category: 'Matières' }),
  d({ id: 'l3', label: 'Achat mèches marché', category: 'Divers' }),
  d({ id: 'u1', label: 'Taxi', category: 'Transport' }), d({ id: 'u2', label: 'Taxi moto', category: 'Divers' }), // une seule habitude : rien
  d({ id: 'v1', label: 'Achat mèches', category: '', branchId: 'b2' }),
], 'b1');
dit('ranger : le meme fournisseur d abord, sinon le meme libelle ; deux habitudes au moins', [['f3', 'Matières'], ['l3', 'Matières']],
  rangements.map((r) => [r.depenseId, r.vers]));
dit('la raison se dit', 'comme 2 autres dépenses de ce fournisseur', rangements[0].parce);

/* ── 3. LE STOCK ────────────────────────────────────────────────────── */
dit('la Gamme a son seuil ou dessous, la plus vide d abord', ['vide', 'deux', 'trois'],
  gammeAReassortir([{ id: 'a', name: 'trois', stock: 3 }, { id: 'b', name: 'vide', stock: 0 }, { id: 'c', name: 'deux', stock: 2 }, { id: 'd', name: 'plein', stock: 9 }, { id: 'e', name: 'archive', stock: 0, archived: true }], 3).map((p) => p.name));

/* ── 4. LES AVIS ────────────────────────────────────────────────────── */
const avis = [
  { id: 'a', note: 5, quand: '2026-10-20' }, { id: 'b', note: 4, quand: '2026-10-18' }, { id: 'c', note: 5, quand: '2026-10-10' }, { id: 'd', note: 3, quand: '2026-09-01' },
];
const brouillons: Record<string, { reponse?: string; ecarte?: boolean }> = { a: { reponse: 'Merci Awa' }, b: { ecarte: true } };
dit('les avis : sans reponse, prets a copier, sans brouillon, ecartes ; la note des dix derniers', { sansReponse: 3, prets: 1, sansBrouillon: 1, ecartes: 1, noteRecente: 4.3 },
  etatDesAvis(avis, (a) => a.id !== 'd', (a) => brouillons[a.id]));

/* ── 5. L ECRAN (texte) ─────────────────────────────────────────────── */
const agents = sansCommentaires('src/apps/trone/routes/pilotage/Agents.tsx');
const suivants = sansCommentaires('src/apps/trone/routes/pilotage/AgentsSuivants.tsx');
dit('les quatre sont a l ecran, et « pas encore construits » est parti', [true, false],
  [/<AgentDuPlanning [\s\S]*<AgentDeLaComptabilite \/>\s*<AgentDesAvis \/>\s*<AgentDuStock \/>/.test(agents), agents.includes('pas encore construits')]);
dit('aucun n ecrit a une cliente ni a un fournisseur', [false, false, false, false],
  [suivants.includes('envoieSurWhatsApp'), suivants.includes('functions.invoke'), suivants.includes('envoyerCommande'), suivants.includes('fetch(')]);
dit('le bon se prepare en brouillon, jamais deux chez le meme fournisseur', true,
  /if \(brouillonChez\(fid\)\) \{ toast/.test(suivants) && suivants.includes('creerCommande(branch.id, fid, todayISO())') && suivants.includes("c.statut === 'brouillon'"));
dit('ranger se fait sur un clic, et ne touche que la rubrique', [true, true],
  [suivants.includes('onClick={() => ranger(r.depenseId, r.vers, r.sous)}'), suivants.includes('{ ...d, category: vers, subcategory: sous }')]);
dit('un creux se remplit par une liste de reprises a valider, pas par un envoi', true, agents.includes('const r = preparePassageMaintenant(agentReprises, tetes);'));
/* 26 octobre 2026 : les avis ont leur rubrique, « Les avis Google ». */
dit('les avis menent a la rubrique des avis, pour relire', true, suivants.includes('<Lien vers="/avis-google">Relire</Lien>'));
dit('chaque agent montre ses chiffres et sa ligne de total', 4, (suivants.match(/total=\{\{ libelle: /g) ?? []).length);
dit('pas de tiret cadratin dans ce que l ecran dit', false, suivants.includes('—'));

console.log(`\n${n - ko}/${n} verifications`);
