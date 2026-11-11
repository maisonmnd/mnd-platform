/* LE BILLET RÉGLÉ ET SA FACTURE, ÉPROUVÉS · 7 novembre 2026.
   `node scripts/verifie-le-billet-regle.mjs` (et `--prouve`).

   « Il faut avoir une autre façon d'écrire les rendez-vous qui sont déjà
   passés et qui sont déjà réglés, pouvoir télécharger le PDF » (Yéman).
   Chaque attente est écrite à la main, d'après la règle, jamais tirée du
   code éprouvé ; l'ancien corps de `buildPdfData` est gardé ici, à la
   lettre, pour que la règle pure lui soit comparée. Têtes, numéros,
   montants et pièces INVENTÉS. Sortie ASCII : la console de Windows. */
import { readFileSync } from 'node:fs';
import {
  factureAJoindreAuBillet, factureDuBillet, factureLue, fichesDeLaFactureDuBillet, papierDuBillet, regleLeDuBillet,
  totalDeLaFactureDuBillet, type FactureDuBillet,
} from '../src/shared/billet-regle-pur';
import * as Papier from '../src/shared/pdf-de-la-piece-pur';
import { detailPorte, donneesDuPdfDeLaPiece, type ContexteDuPdfDeLaPiece } from '../src/shared/pdf-de-la-piece-pur';
import { IDENTITE_PAR_DEFAUT_DU_PAPIER, identiteDuPapier } from '../src/shared/identite-du-papier';
import { fenetreDeLaRecherche, retrouveLeRdv, type PieceDeLaFin } from '../src/shared/terminer-et-regler-pur';
import { jetonDuRendezVous, referenceDuRendezVous } from '../src/shared/lien-du-rdv-pur';
import { FACTURE_EN_PANNE, TELECHARGER_LA_FACTURE, billetDeLaPageLu, billetLu, reglementDuBillet, type BilletDuSite } from '../src/apps/revelateur/billet-du-rdv-pur';
// @ts-expect-error module .mjs sans types
import { entre } from './terminer-copie-serveur.mjs';
/* L'ANCIEN CORPS lit ce que lisait le crochet : les calculs et les mots d'avant. */
import { invoiceTotal, ligneNetXof, invoiceReglements, invoiceResteXof } from '../src/shared/finance-pur';
import { fmtMoney } from '../src/shared/currency';
import { appelDe } from '../src/shared/civilite';
import type { Invoice, InvoiceLine } from '../src/shared/finance';
import type { InvoicePdfData } from '../src/shared/pdf';

let ko = 0; let n = 0;
/** Une écriture canonique (clés triées) : l'ordre des clés n'est pas une règle. */
const canon = (x: unknown): string => JSON.stringify(x, (_k, v) => (v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, w]) => w !== undefined).sort(([a], [b]) => a.localeCompare(b))) : v));
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const a = canon(attendu); const o = canon(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else {
    ko++;
    /* Le premier signe qui diffère, en code : deux espaces se ressemblent à l'écran. */
    let i = 0; while (i < a.length && a[i] === o[i]) i++;
    console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}\n       ecart au signe ${i} : obtenu ${o.charCodeAt(i)}, attendu ${a.charCodeAt(i)}`);
  }
};
const lis = (f: string): string => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
/** Toutes les clés d'un objet, à toute profondeur. */
const cles = (x: unknown): string[] => (Array.isArray(x) ? x.flatMap(cles)
  : x && typeof x === 'object' ? Object.entries(x as Record<string, unknown>).flatMap(([k, v]) => [k, ...cles(v)]) : []);
/** Ce que la cliente ne doit jamais recevoir : la caisse, la main, le thème, les identifiants, la fiche, l'équipe. */
const INTERDITS = ['cashbox', 'encaissePar', 'theme', 'clientId', 'forClientId', 'apptId', 'id', 'branchId', 'time', 'trace', 'relancesPause',
  'relancesDecalage', 'whatsapp', 'reglementsEnLigne', 'creeeLe', 'remplacements', 'avoirXof', 'depositCreditXof', 'pourboireDe', 'produitId', 'notes', 'passeAuComptoir'];

/* Cotonou est à UTC+1. */
const aCotonou = (jour: string, heure: string): number => Date.parse(`${jour}T${heure}:00+01:00`);
const JOUR = '2026-11-07';
const A_10H = aCotonou(JOUR, '10:00');

/* ══ 1. « MES RDV » JUSQU'À DOUZE MOIS (choix de Yéman, 7 novembre 2026) ══ */
dit('la recherche remonte douze mois pile, et cent jours en avant', { du: '2025-11-07', au: '2027-02-15' }, fenetreDeLaRecherche(A_10H));
{
  const tete = (id: string, date: string, status = 'honoré') => ({ id, date, time: '09:00', status, numeros: ['+229 01 00 00 00 01'] });
  const liste = [tete('r-onze-mois', '2025-12-10'), tete('r-un-an-pile', '2025-11-07'), tete('r-un-an-et-un-jour', '2025-11-06'), tete('r-hier', '2026-11-06')];
  const cherche = (id: string, chiffres: string) => retrouveLeRdv({
    code: referenceDuRendezVous(id), chiffres, rdvs: liste, referenceDe: referenceDuRendezVous, numerosDe: (r) => r.numeros, maintenantMs: A_10H,
  })?.id ?? null;
  dit('onze mois, douze mois pile, hier : retrouves ; douze mois et un jour : rien', ['r-onze-mois', 'r-un-an-pile', null, 'r-hier'],
    [cherche('r-onze-mois', '0001'), cherche('r-un-an-pile', '0001'), cherche('r-un-an-et-un-jour', '0001'), cherche('r-hier', '0001')]);
  dit('... vieux de onze mois, le code ne suffit toujours pas : sans chiffres, avec des chiffres faux, rien', [null, null], [cherche('r-onze-mois', ''), cherche('r-onze-mois', '9999')]);
}

/* ══ 2. QUAND LE BILLET JOINT SA FACTURE ══════════════════════════════════ */
const ligne = (unitXof: number, plus: Record<string, unknown> = {}) => ({ id: 'l', qty: 1, unitXof, discountPct: 0, ...plus });
const piece = (plus: Partial<PieceDeLaFin> & Record<string, unknown> = {}): PieceDeLaFin =>
  ({ id: 'inv-x', kind: 'facture', status: 'payée', date: '2026-11-04', apptId: 'r', lines: [ligne(12000)], globalDiscountPct: 0, payments: [{ amountXof: 12000 }], ...plus }) as PieceDeLaFin;
const joint = (rdv: { date: string; time: string; status?: string }, p: PieceDeLaFin | null, quand = A_10H) => factureAJoindreAuBillet({ rdv: { status: 'honoré', ...rdv }, piece: p, maintenantMs: quand });
dit('un jour passe, soldee, de l argent recu : la facture se joint', true, joint({ date: '2026-11-04', time: '10:00' }, piece()));
dit('aujourd hui, des l heure du rituel (8 h, il est 10 h) : elle se joint ; a 7 h 59, non', [true, false],
  [joint({ date: JOUR, time: '08:00' }, piece()), joint({ date: JOUR, time: '08:00' }, piece(), aCotonou(JOUR, '07:59'))]);
dit('payee d avance, le rituel pas commence (11 h, il est 10 h ; demain) : rien', [false, false],
  [joint({ date: JOUR, time: '11:00', status: 'confirmé' }, piece()), joint({ date: '2026-11-08', time: '09:00', status: 'confirmé' }, piece())]);
dit('une piece qui doit encore, sans argent recu, un devis, une piece annulee, un rendez-vous annule, aucune piece : rien', [false, false, false, false, false, false],
  [joint({ date: '2026-11-04', time: '10:00' }, piece({ payments: [{ amountXof: 5000 }], status: 'envoyée' })),
    joint({ date: '2026-11-04', time: '10:00' }, piece({ lines: [ligne(0)], payments: [], status: 'envoyée' })),
    joint({ date: '2026-11-04', time: '10:00' }, piece({ kind: 'devis' })),
    joint({ date: '2026-11-04', time: '10:00' }, piece({ status: 'annulée' })),
    joint({ date: '2026-11-04', time: '10:00', status: 'annulé' }, piece()),
    joint({ date: '2026-11-04', time: '10:00' }, null)]);
dit('une piece « payee » sans journal (d avant le 17 aout) compte son total comme recu', true, joint({ date: '2026-11-04', time: '10:00' }, piece({ payments: [] })));
dit('le jour du reglement : le dernier versement qui porte de l argent, sinon le jour de la piece', ['2026-11-04', '2026-10-20'],
  [regleLeDuBillet({ date: '2026-11-01', payments: [{ date: '2026-11-04', amountXof: 1 }, { date: '2026-11-02', amountXof: 5 }, { date: '2026-11-09', amountXof: 0 }] }),
    regleLeDuBillet({ date: '2026-10-20', payments: [] })]);
dit('les fiches a lire : la tete soignee, et la payeuse quand c en est une autre', [{ tete: 'c-a', payeuse: null }, { tete: 'c-enfant', payeuse: 'c-parent' }],
  [fichesDeLaFactureDuBillet({ clientId: 'c-a' }), fichesDeLaFactureDuBillet({ clientId: 'c-parent', forClientId: 'c-enfant' })]);

/* ══ 3. LA FACTURE : ce que le PDF imprime, rien de plus ═════════════════ */
const PIECE_BRUTE = {
  id: 'inv-test-1', branchId: 'b1', kind: 'facture', number: 'F-TEST-0001', date: '2026-11-04', time: '11:40', apptId: 'rdv-passe',
  master: 'Expert', status: 'payée', payment: 'Espèces', cashbox: 'caisse-test', encaissePar: 'Main Caisse', theme: 'Rose',
  clientId: 'c-anne', clientName: 'Anne Exemple',
  lines: [
    { id: 'l1', qty: 1, label: 'Rituel fictif · La Reprise', unitXof: 18000, discountPct: 0, discountXof: 3000, produitId: 'p-x' },
    { id: 'l2', qty: 2, label: 'Soin fictif', unitXof: 2500, discountPct: 10, detail: ['dont un massage', ''] },
  ],
  globalDiscountPct: 0, globalDiscountXof: 0,
  payments: [
    { id: 'p1', date: '2026-11-03', time: '09:00', method: 'Mobile Money', cashbox: 'caisse-test', amountXof: 5000, encaissePar: 'Main Caisse', trace: { banque: 'X' } },
    { id: 'p2', date: '2026-11-04', time: '11:40', method: 'Espèces', cashbox: 'caisse-test', amountXof: 14500, encaissePar: 'Main Caisse' },
  ],
  relancesPause: { le: '2026-11-04', par: 'Main Caisse' }, whatsapp: { le: '2026-11-04', modele: 'm', par: 'Main Caisse' }, creeeLe: '2026-11-04T10:40:00Z', reglementsEnLigne: [],
};
const FICHE_ANNE = { name: 'Anne Exemple', phone: '+229 01 00 00 00 01', civilite: 'madame', notes: 'note de l equipe', passeAuComptoir: false };
const BRANCHE = { id: 'b1', name: 'Maison MND', city: 'Cotonou', currency: 'XOF', masters: ['Expert', 'Main B'], address: 'adresse fictive', seats: 2 };
const RAISON = 'Maison MND · RCCM fictif · IFU fictif';
const FACTURE_ATTENDUE = {
  piece: {
    number: 'F-TEST-0001', date: '2026-11-04', kind: 'facture',
    lines: [
      { label: 'Rituel fictif · La Reprise', qty: 1, unitXof: 18000, discountPct: 0, discountXof: 3000 },
      { label: 'Soin fictif', qty: 2, unitXof: 2500, discountPct: 10, detail: ['dont un massage'] },
    ],
    globalDiscountPct: 0,
    payments: [{ date: '2026-11-03', method: 'Mobile Money', amountXof: 5000 }, { date: '2026-11-04', method: 'Espèces', amountXof: 14500 }],
    payment: 'Espèces', status: 'payée', master: 'Expert',
  },
  cliente: { nom: 'Anne Exemple', telephone: '+229 01 00 00 00 01', name: 'Anne Exemple', civilite: 'madame' },
  maison: { nom: 'Maison MND', ville: 'Cotonou', devise: 'XOF', raison: RAISON },
  regleLe: '2026-11-04',
};
const projetee = factureDuBillet({ piece: PIECE_BRUTE, tete: FICHE_ANNE, payeuse: null, branche: BRANCHE, raison: RAISON });
dit('la facture : le numero, le jour, les lignes, les remises, les versements (jour, moyen, part), le moyen, le statut, la main ; la tete, la branche, la raison, le jour du reglement',
  FACTURE_ATTENDUE, projetee);
dit('... rien de la caisse, de la main qui a encaisse, du theme, des identifiants, de la fiche, de l equipe', [],
  cles(projetee).filter((k) => INTERDITS.includes(k)));
dit('... ni la caisse, ni la main, ni la note de l equipe, meme comme valeur', [false, false, false],
  [/caisse-test/.test(JSON.stringify(projetee)), /Main Caisse/.test(JSON.stringify(projetee)), /note de l equipe/.test(JSON.stringify(projetee))]);
{
  const PIECE_ENFANT = { ...PIECE_BRUTE, clientId: 'c-parent', forClientId: 'c-enfant', master: undefined };
  const f = factureDuBillet({ piece: PIECE_ENFANT, tete: { name: 'Enfant Exemple', phone: '+229 01 00 00 00 03' }, payeuse: { name: 'Parent Exemple', phone: '+229 01 00 00 00 02' }, branche: BRANCHE });
  dit('un enfant soigne, un parent qui regle : le papier nomme l enfant, la payeuse dessous ; sans main nommee, le premier maitre pour le mot',
    [{ nom: 'Enfant Exemple', payeuse: 'Parent Exemple', telephone: '+229 01 00 00 00 03', name: 'Enfant Exemple' }, 'Expert', false],
    [f?.cliente, f?.maison.maitre, /00 00 02/.test(JSON.stringify(f))]);
  const libre = factureDuBillet({ piece: { ...PIECE_BRUTE, clientId: '', clientName: 'walk-in', note: 'Un mot fictif' }, tete: null, payeuse: null, branche: BRANCHE });
  dit('sans fiche : « Cliente de passage » sur le papier ; un mot ecrit garde la main de la piece, le premier maitre ne part pas', [{ nom: 'Cliente de passage', name: 'walk-in' }, undefined, 'Un mot fictif'],
    [libre?.cliente, libre?.maison.maitre, libre?.piece.note]);
  dit('sans numero, sans lignes, sans branche : pas de facture', [null, null, null], [
    factureDuBillet({ piece: { ...PIECE_BRUTE, number: '' }, tete: null, payeuse: null, branche: BRANCHE }),
    factureDuBillet({ piece: { ...PIECE_BRUTE, lines: [] }, tete: null, payeuse: null, branche: BRANCHE }),
    factureDuBillet({ piece: PIECE_BRUTE, tete: null, payeuse: null, branche: null })]);
}

/* ══ 4. LE SITE RELIT LA FACTURE AVANT DE LA CROIRE ══════════════════════ */
const BILLET_PASSE = {
  reference: referenceDuRendezVous('rdv-passe'), prenom: 'Anne', jour: '2026-11-04', heure: '10:00', etat: 'regle', resteXof: 0,
  porte: { ouverte: false, raison: 'deja-regle' }, aTermine: false,
};
const avec = (facture: unknown) => billetLu({ ...BILLET_PASSE, facture });
dit('une facture bien formee se garde, telle quelle', FACTURE_ATTENDUE, avec(JSON.parse(JSON.stringify(projetee)))?.facture);
const casse = (f: (x: any) => void) => { const x = JSON.parse(JSON.stringify(FACTURE_ATTENDUE)); f(x); return x; };
const MAL_FORMEES = [
  casse((x) => { x.piece.number = 1234; }), casse((x) => { x.piece.lines = 'Rituel'; }), casse((x) => { x.piece.lines = []; }),
  casse((x) => { x.regleLe = '4 novembre'; }), casse((x) => { x.piece.kind = 'devis'; }), casse((x) => { x.piece.payments[0].amountXof = -5000; }),
  casse((x) => { x.piece.lines[0].discountPct = 140; }), casse((x) => { x.maison.nom = ''; }), casse((x) => { x.cliente = null; }),
  /* Une pièce qui doit encore : 19 500 F de lignes, 5 000 F reçus. */
  casse((x) => { x.piece.payments = [x.piece.payments[0]]; }),
  'facture', null, 42,
];
dit('une facture mal formee, ou qui doit encore, s ignore ; le billet reste', MAL_FORMEES.map(() => [true, false]),
  MAL_FORMEES.map((f) => { const b = avec(f); return [!!b && b.etat === 'regle', !!b && 'facture' in b]; }));
dit('... ce qu elle porte en trop (une caisse glissee dans un versement, un identifiant) ne passe pas la relecture', [],
  cles(avec(casse((x) => { x.piece.payments[0].cashbox = 'caisse-test'; x.piece.id = 'inv-test-1'; x.cliente.clientId = 'c-anne'; }))?.facture).filter((k) => INTERDITS.includes(k)));
dit('la page relit aussi la facture du billet qu elle demande (billetDeLaPageLu)', FACTURE_ATTENDUE, billetDeLaPageLu({ ok: true, billet: { ...BILLET_PASSE, facture: FACTURE_ATTENDUE } })?.facture);

/* ══ 5. LES MOTS DE LA PAGE ═══════════════════════════════════════════════ */
const billetDuSite = (plus: Partial<BilletDuSite>): BilletDuSite => ({ ...(BILLET_PASSE as BilletDuSite), facture: FACTURE_ATTENDUE as FactureDuBillet, ...plus });
dit('passe et regle : « Regle », le total regle, « Regle le 4 novembre 2026. Merci, Anne. », le bouton de la facture',
  { sur: 'Réglé', montant: '19 500 F', phrase: 'Réglé le 4 novembre 2026. Merci, Anne.', telecharger: 'Télécharger ma facture (PDF)', leJourMeme: false },
  reglementDuBillet(billetDuSite({}), JOUR));
dit('... sans prenom, « Merci. » ; regle un 1er, « 1er novembre 2026 »', ['Réglé le 4 novembre 2026. Merci.', 'Réglé le 1er novembre 2026. Merci, Anne.'],
  [reglementDuBillet(billetDuSite({ prenom: '' }), JOUR)?.phrase, reglementDuBillet(billetDuSite({ facture: { ...(FACTURE_ATTENDUE as FactureDuBillet), regleLe: '2026-11-01' } }), JOUR)?.phrase]);
dit('... ni « vous pouvez partir », ni « votre recu arrive sur WhatsApp »', [false, undefined],
  [/partir|reçu arrive/i.test(String(reglementDuBillet(billetDuSite({}), JOUR)?.phrase)), reglementDuBillet(billetDuSite({}), JOUR)?.note]);
dit('passe et regle sans facture (le reste vient d un prix fige) : « Regle » et merci, sans bouton ni montant invente',
  { sur: 'Réglé', phrase: 'Ce rendez-vous est réglé. Merci, Anne.', leJourMeme: false }, reglementDuBillet(billetDuSite({ facture: undefined }), JOUR));
dit('le jour meme, regle : la phrase d avant et sa note, et le meme bouton',
  { sur: 'Réglé', phrase: 'Merci, Anne. Vous pouvez partir : la Maison est prévenue.', telecharger: 'Télécharger ma facture (PDF)', note: 'Votre reçu arrive sur WhatsApp, la facture jointe.', leJourMeme: true },
  reglementDuBillet(billetDuSite({ jour: JOUR, heure: '08:00' }), JOUR));
dit('... sans facture (la piece se prepare encore), la phrase d avant, sans bouton',
  { sur: 'Réglé', phrase: 'Merci, Anne. Vous pouvez partir : la Maison est prévenue.', note: 'Votre reçu arrive sur WhatsApp, la facture jointe.', leJourMeme: true },
  reglementDuBillet(billetDuSite({ jour: JOUR, heure: '08:00', facture: undefined }), JOUR));
dit('passe et non regle (le retard de saisie ne se montre jamais) : rien, meme si une facture se glissait', [null, null],
  [reglementDuBillet(billetDuSite({ etat: 'passe', resteXof: 12000, porte: { ouverte: false, raison: 'jour-passe' }, facture: undefined }), JOUR),
    reglementDuBillet(billetDuSite({ etat: 'passe', resteXof: 12000, porte: { ouverte: false, raison: 'jour-passe' } }), JOUR)]);
dit('a venir : inchange (« A regler », le montant, la phrase du bouton a venir), jamais le bouton de la facture',
  { sur: 'À régler', montant: '12 000 F', phrase: 'Le jour de votre rituel, dès son heure, le bouton « Terminer et régler » paraît ici : vous réglez depuis votre téléphone.', leJourMeme: false },
  reglementDuBillet(billetDuSite({ jour: '2026-11-12', etat: 'confirme', resteXof: 12000, porte: { ouverte: false, raison: 'pas-encore-le-jour' } }), JOUR));
dit('les mots de la facture : le bouton et la phrase calme d un echec', ['Télécharger ma facture (PDF)', 'La facture ne se prépare pas. Réessayez, ou écrivez à la Maison.'],
  [TELECHARGER_LA_FACTURE, FACTURE_EN_PANNE]);
{
  const mots = [reglementDuBillet(billetDuSite({}), JOUR), reglementDuBillet(billetDuSite({ jour: JOUR }), JOUR), FACTURE_EN_PANNE, TELECHARGER_LA_FACTURE].map((x) => JSON.stringify(x)).join(' ');
  dit('ce que la cliente lit : ni tiret cadratin, ni « salon », ni « maitre »', [false, false, false], [mots.includes('—'), /salon/i.test(mots), /ma[iî]tre/i.test(mots)]);
}

/* ══ 6. UN SEUL PDF : la règle pure rend ce que rendait l'ancien corps ════ */
/* L'ANCIEN CORPS DE `buildPdfData` ET SES AIDES (pdf-de-la-piece.ts au
   6 novembre 2026, 57b6e9bf), à la lettre ; seuls les magasins deviennent
   des paramètres. Ne pas le « corriger » : c'est le témoin. */
type Magasins = {
  branch: { name: string; city: string; masters: string[] };
  currency: string;
  clients: { id: string; name: string; phone?: string; civilite?: 'madame' | 'mademoiselle' | 'monsieur'; auMasculin?: boolean }[];
  paiementDeLaPiece: (resteXof: number, reglages: unknown) => InvoicePdfData['momo'];
  reglagesMnd: unknown;
  contenuDeLaLigne: (piece: Invoice, l: InvoiceLine) => string[];
  maisonRaisonDuPdfAu: (jourIso: string) => string | undefined;
};
function ancienneFabrique(m: Magasins) {
  const { branch, currency, clients, paiementDeLaPiece, reglagesMnd, contenuDeLaLigne, maisonRaisonDuPdfAu } = m;
  const remisesDuPapier = (
    d: Pick<Invoice, 'lines' | 'globalDiscountPct' | 'globalDiscountXof' | 'discountLabel'>,
    fmt: (n: number) => string,
  ): { label: string; value: string }[] => {
    const brut = d.lines.reduce((s, l) => s + l.qty * l.unitXof, 0);
    const apresLignes = d.lines.reduce((s, l) => s + ligneNetXof(l), 0);
    const pct = Math.max(0, d.globalDiscountPct ?? 0);
    const lignes = Math.round(brut) - Math.round(apresLignes);
    const partPct = Math.round(apresLignes) - Math.round(apresLignes * (1 - pct / 100));
    const francs = Math.max(0, Math.round(d.globalDiscountXof ?? 0));
    const out: { label: string; value: string }[] = [];
    if (lignes > 0) out.push({ label: 'Remises sur les lignes', value: `− ${fmt(lignes)}` });
    if (partPct > 0) out.push({ label: `Remise globale · −${pct} %`, value: `− ${fmt(partPct)}` });
    if (francs > 0) out.push({ label: d.discountLabel ?? 'Remise', value: `− ${fmt(francs)}` });
    return out;
  };
  const fmtDateFr = (iso: string) => {
    const d = new Date(iso + 'T00:00:00');
    const s = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    return s.replace(/^1 /, '1ᵉʳ ');
  };
  const payeurDe = (d: Invoice) => clients.find((c) => c.id === d.clientId);
  const clientOf = (d: Invoice) => clients.find((c) => c.id === (d.forClientId ?? d.clientId));
  const clientNameOf = (d: Invoice) => clientOf(d)?.name ?? d.clientName ?? 'Walk-in';
  const appelOf = (d: Invoice) => appelDe(clientOf(d), clientNameOf(d));
  const payeurAutreQue = (d: Invoice): string | undefined => {
    if (!d.forClientId || d.forClientId === d.clientId) return undefined;
    return payeurDe(d)?.name;
  };
  const clientNameForPdf = (d: Invoice) => {
    const c = clientOf(d);
    if (c) return c.name;
    const n = d.clientName?.trim();
    return n && n.toLowerCase() !== 'walk-in' ? n : 'Cliente de passage';
  };
  const defaultNoteFor = (d: Invoice) =>
    `${appelOf(d)}, ce fut un honneur de veiller sur votre couronne. Elle vous va à merveille.\n${d.master ?? branch.masters[0] ?? 'la Maison'}`;
  const sousLeVerrou = branch.city ? `${branch.city} · l'art de la couronne` : undefined;
  const buildPdfData = (d: Invoice): InvoicePdfData => {
    const gross = d.lines.reduce((s, l) => s + l.qty * l.unitXof, 0);
    const net = invoiceTotal(d);
    const disc = gross - net;
    return {
      kind: d.kind,
      number: d.number,
      houseName: branch.name,
      houseSub: sousLeVerrou,
      date: fmtDateFr(d.date),
      legal: maisonRaisonDuPdfAu(d.date),
      clientName: clientNameForPdf(d),
      ...(payeurAutreQue(d) ? { payeurName: payeurAutreQue(d) } : {}),
      clientPhone: clientOf(d)?.phone,
      master: d.master,
      momo: d.kind === 'facture' && invoiceResteXof(d) > 0
        ? paiementDeLaPiece(invoiceResteXof(d), reglagesMnd)
        : undefined,
      reglements: invoiceReglements(d)
        .filter((p) => p.amountXof > 0)
        .map((p) => ({
          date: fmtDateFr(p.date),
          method: p.fx
            ? `${p.method} · ${p.fx.amount.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${p.fx.code} reçus (1 ${p.fx.code} = ${p.fx.rate} ${currency})`
            : p.method,
          amount: fmtMoney(p.amountXof, currency),
        })),
      lines: d.lines.map((l) => {
        const remise = [
          l.discountPct > 0 ? `−${l.discountPct} %` : '',
          (l.discountXof ?? 0) > 0 ? `−${fmtMoney(l.discountXof!, currency)}` : '',
        ].filter(Boolean).join(' puis ');
        const contenu = contenuDeLaLigne(d, l);
        return {
          label: remise ? `${l.label} · remise ${remise}` : l.label,
          qty: l.qty,
          unit: fmtMoney(l.unitXof, currency),
          total: fmtMoney(ligneNetXof(l), currency),
          ...(contenu.length > 0 ? { detail: contenu } : {}),
        };
      }),
      subtotal: fmtMoney(Math.round(gross), currency),
      discount: disc > 0 ? `− ${fmtMoney(Math.round(disc), currency)}` : undefined,
      remises: remisesDuPapier(d, (n) => fmtMoney(n, currency)),
      total: fmtMoney(net, currency),
      tip: (d.tipXof ?? 0) > 0 ? fmtMoney(d.tipXof!, currency) : undefined,
      payment: d.fx
        ? `${d.payment} · ${d.fx.amount.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${d.fx.code} (1 ${d.fx.code} = ${d.fx.rate} ${currency})`
        : d.payment,
      status: d.status,
      note: d.note?.trim() || defaultNoteFor(d),
    };
  };
  return { buildPdfData, clientNameForPdf, payeurAutreQue, clientOf, appelOf, sousLeVerrou };
}
/** LE CROCHET D'AUJOURD'HUI, tel qu'il tend ses magasins à la règle (le banc
    vérifie plus bas que pdf-de-la-piece.ts écrit ces mêmes lignes). */
function nouvelleFabrique(m: Magasins) {
  const a = ancienneFabrique(m);
  const { branch, currency, paiementDeLaPiece, reglagesMnd, contenuDeLaLigne, maisonRaisonDuPdfAu } = m;
  return (d: Invoice): InvoicePdfData => donneesDuPdfDeLaPiece(d, {
    maison: branch.name,
    sousLeVerrou: Papier.ligneSousLeVerrou(branch.city),
    devise: currency,
    legal: maisonRaisonDuPdfAu(d.date),
    nomPourLePdf: a.clientNameForPdf(d),
    payeuse: a.payeurAutreQue(d),
    telephone: a.clientOf(d)?.phone,
    appel: a.appelOf(d),
    maitreDeRepli: branch.masters[0],
    momoPour: () => paiementDeLaPiece(invoiceResteXof(d), reglagesMnd),
    contenuDeLaLigne,
  } satisfies ContexteDuPdfDeLaPiece);
}
const RAISON_DU_JOUR = (jour: string) => (jour < '2026-10-10' ? undefined : RAISON);
const MAGASINS: Magasins = {
  branch: { name: 'Maison MND', city: 'Cotonou', masters: ['Expert', 'Main B'] },
  currency: 'XOF',
  clients: [
    { id: 'c-anne', name: 'Anne Exemple', phone: '+229 01 00 00 00 01', civilite: 'madame' },
    { id: 'c-parent', name: 'Parent Exemple', phone: '+229 01 00 00 00 02' },
    { id: 'c-enfant', name: 'Enfant Exemple', phone: '+229 01 00 00 00 03' },
    { id: 'c-monsieur', name: 'Paul Exemple', auMasculin: true },
  ],
  paiementDeLaPiece: (reste) => ({ qr: `qr-fictif-${reste}`, code: `*000*${reste}#` }),
  reglagesMnd: { fictifs: true },
  /* Le contenu d'une ligne : ce qu'elle porte, sinon un forfait du catalogue (fictif). */
  contenuDeLaLigne: (_p, l) => (detailPorte(l.detail).length ? detailPorte(l.detail) : l.label === 'Forfait fictif' ? ['Resserrage', 'Lavage'] : []),
  maisonRaisonDuPdfAu: RAISON_DU_JOUR,
};
const inv = (plus: Partial<Invoice>): Invoice => ({
  id: 'inv-f', branchId: 'b1', kind: 'facture', number: 'F-TEST-0100', clientId: 'c-anne', date: '2026-11-04', lines: [], globalDiscountPct: 0, theme: 'Rose', status: 'payée', ...plus,
});
const L = (id: string, label: string, qty: number, unitXof: number, plus: Partial<InvoiceLine> = {}): InvoiceLine => ({ id, label, qty, unitXof, discountPct: 0, ...plus });
const PIECES: [string, Invoice][] = [
  ['soldee, remises de ligne et globales, code, devise, pourboire, enfant et parent', inv({
    number: 'F-TEST-0101', clientId: 'c-parent', forClientId: 'c-enfant', master: 'Expert', payment: 'Mobile Money', tipXof: 2000, note: '',
    lines: [L('a', 'Rituel fictif', 1, 20000, { discountPct: 10, discountXof: 1500 }), L('b', 'Soin fictif', 2, 3000, { detail: ['dont un massage'] })],
    globalDiscountPct: 5, globalDiscountXof: 500, discountLabel: 'Code FICTIF5',
    payments: [{ id: 'v1', date: '2026-11-02', amountXof: 10000, method: 'Espèces', cashbox: 'c', fx: { code: 'EUR', rate: 655.957, amount: 15.25 } }, { id: 'v2', date: '2026-11-04', amountXof: 10875, method: 'Mobile Money' }],
  })],
  ['reste a regler : le QR et le code', inv({ number: 'F-TEST-0102', status: 'envoyée', lines: [L('a', 'Rituel fictif', 1, 15000)], payments: [{ id: 'v1', date: '2026-11-04', amountXof: 5000, method: 'Espèces' }], master: 'Main B' })],
  ['un devis', inv({ number: 'D-TEST-0103', kind: 'devis', status: 'envoyée', lines: [L('a', 'Forfait fictif', 1, 40000)] })],
  ['payee sans journal (avant le 17 aout), devise sur la piece', inv({ number: 'F-TEST-0104', date: '2026-10-20', payment: 'Espèces', fx: { code: 'USD', rate: 600, amount: 25 }, lines: [L('a', 'Rituel fictif', 1, 15000)], master: 'Expert' })],
  ['de passage, avant la bascule (pas de ligne legale), sans main : le premier maitre', inv({ number: 'F-TEST-0105', clientId: '', clientName: 'walk-in', date: '2026-09-30', lines: [L('a', 'Rituel fictif', 1, 9000)] })],
  ['de passage nommee, un mot ecrit, un monsieur', inv({ number: 'F-TEST-0106', clientId: 'c-monsieur', lines: [L('a', 'Rituel fictif', 1, 9000)], note: '  Un mot fictif  ', master: 'Expert' })],
  ['un detail ecrit en chaine, un cadeau a cent pour cent', inv({ number: 'F-TEST-0107', lines: [L('a', 'Carnet fictif', 1, 30000, { detail: '3 × Resserrage' as unknown as string[] }), L('b', 'Geste offert', 1, 5000, { discountPct: 100 })], master: 'Expert' })],
];
const ancien = ancienneFabrique(MAGASINS).buildPdfData;
const neuf = nouvelleFabrique(MAGASINS);
for (const [nom, p] of PIECES) dit(`le papier, piece pour piece, comme avant : ${nom}`, JSON.stringify(ancien(p)), JSON.stringify(neuf(p)));
dit('... le mot par defaut se lit au meme endroit au Trone et sur le papier', ancien(PIECES[4][1]).note,
  Papier.motDuPapierParDefaut('walk-in', undefined, 'Expert'));

/* LE SITE CONSTRUIT LA MÊME FACTURE QUE LE TRÔNE : la pièce soldée, projetée
   par le serveur, relue par le site, passe par la même règle. */
const deBoutEnBout = (p: Invoice, tete: Record<string, unknown> | null, payeuse: Record<string, unknown> | null) => {
  const f = factureLue(JSON.parse(JSON.stringify(factureDuBillet({ piece: p as unknown as Record<string, unknown>, tete, payeuse, branche: BRANCHE, raison: RAISON }))));
  return f ? JSON.stringify(papierDuBillet(f, Papier)) : 'sans facture';
};
dit('le PDF du site egale celui du Trone : un enfant et son parent, remises, code, devise, pourboire', JSON.stringify(ancien(PIECES[0][1])),
  deBoutEnBout(PIECES[0][1], MAGASINS.clients[2], MAGASINS.clients[1]));
dit('... une piece payee sans journal, la devise sur la piece', JSON.stringify(ancien(PIECES[3][1])), deBoutEnBout(PIECES[3][1], MAGASINS.clients[0], null));
{
  const avantLaBascule = inv({ number: 'F-TEST-0108', date: '2026-09-30', lines: [L('a', 'Rituel fictif', 1, 9000)], master: 'Expert' });
  dit('... une piece d avant la bascule : pas de ligne legale, comme au Trone', [JSON.stringify(ancien(avantLaBascule)), undefined],
    [deBoutEnBout(avantLaBascule, MAGASINS.clients[0], null), JSON.parse(deBoutEnBout(avantLaBascule, MAGASINS.clients[0], null)).legal]);
}
dit('le total regle que la page montre est celui du papier', 19500, totalDeLaFactureDuBillet(FACTURE_ATTENDUE as FactureDuBillet));

/* Le crochet du Trône tend à la règle exactement ce que le témoin tend. */
const crochet = lis('src/apps/trone/routes/vente/pdf-de-la-piece.ts');
dit('le Trone passe par la regle pure, et ne garde plus de corps a lui', [true, false, false], [
  crochet.includes([
    '  const buildPdfData = (d: Invoice): InvoicePdfData => donneesDuPdfDeLaPiece(d, {', '    maison: branch.name,', '    sousLeVerrou,', '    devise: currency,',
    '    legal: maisonRaisonDuPdfAu(d.date),', '    nomPourLePdf: clientNameForPdf(d),', '    payeuse: payeurAutreQue(d),', '    telephone: clientOf(d)?.phone,',
    '    appel: appelOf(d),', '    maitreDeRepli: branch.masters[0],', '    momoPour: () => paiementDeLaPiece(invoiceResteXof(d), reglagesMnd),', '    contenuDeLaLigne,', '  });',
  ].join('\n')),
  /const gross = d\.lines/.test(crochet), /export const (remisesDuPapier|fmtDateFr|detailPorte) =/.test(crochet)]);
dit('... la ligne sous le verrou et le mot par defaut viennent de la regle', [true, true],
  [crochet.includes('  const sousLeVerrou = ligneSousLeVerrou(branch.city);'), crochet.includes('  const defaultNoteFor = (d: Invoice) => motDuPapierParDefaut(appelOf(d), d.master, branch.masters[0]);')]);
dit('... et les ecrans qui importaient d ici remisesDuPapier, fmtDateFr, detailPorte les y trouvent encore', true,
  crochet.includes("export { remisesDuPapier, fmtDateFr, detailPorte } from '../../../../shared/pdf-de-la-piece-pur';"));
const regle = lis('src/shared/billet-regle-pur.ts');
dit('le site passe par la meme regle (papierDuBillet appelle donneesDuPdfDeLaPiece)', true,
  regle.includes('  papier.donneesDuPdfDeLaPiece(pieceDuPapierDuSite(f), contexteDuPapierDuSite(f, papier));'));

/* ══ 7. LE PAPIER SANS LA SYNCHRONISATION, CHARGÉ À LA DEMANDE ═══════════ */
const graphe: string[] = JSON.parse(process.env.BILLET_GRAPHE ?? '[]');
dit('vue du site, la facture se construit sans identite.ts, la synchronisation, l authentification, les magasins du Trone', [],
  graphe.filter((f) => /src\/shared\/(identite|sync|auth|version|branches|store|clients|settings)\.ts$/.test(f)));
dit('... et elle passe bien par la regle du papier et son constructeur', [true, true, true],
  ['src/shared/pdf-de-la-piece-pur.ts', 'src/shared/pdf.ts', 'src/shared/identite-du-papier.ts'].slice(0, 3).map((f) => graphe.includes(f)));
const ilot = lis('src/apps/revelateur/ilots/MonRendezVous.tsx');
const telechargement = lis('src/apps/revelateur/facture-du-billet.ts');
dit('le papier ne se charge qu au toucher du bouton (ni l ilot ni son aide ne l importent d avance), et un echec se dit en une phrase', [false, false, true, true, true], [
  /^import [^;]*shared\/pdf(-de-la-piece-pur)?';/m.test(ilot), /^import [^;]*shared\/pdf(-de-la-piece-pur)?';/m.test(telechargement),
  telechargement.includes("await Promise.all([import('../../shared/pdf-de-la-piece-pur'), import('../../shared/pdf')]);\n  return invoicePdf(papierDuBillet(f, regle));"),
  ilot.includes('      await telechargeLaFactureDuBillet(facture);'),
  ilot.includes('setPapier({ enCours: false, dit: FACTURE_EN_PANNE });')]);
dit('... le bouton parait quand le reglement le dit, et la page passe le jour de Cotonou', [true, true],
  [ilot.includes('{reglement.telecharger && ('), ilot.includes('const reglement = !agendaSeul && billet ? reglementDuBillet(billet, aujourdhui) : null;')]);
const identite = lis('src/shared/identite.ts');
dit('le papier sans identite.ts signe comme identite.ts : le nom et la devise par defaut', [true, true], [
  identite.includes(`export const DEFAULT_IDENTITY: HouseIdentity = {\n  nom: '${IDENTITE_PAR_DEFAUT_DU_PAPIER.nom}',`),
  identite.includes(`export const DEVISE_COMPLETE = '${IDENTITE_PAR_DEFAUT_DU_PAPIER.devise}';`)]);
dit('... reconnait la Maison comme identite.ts (l ancien nom compte pour elle, une autre maison non)', [true, true, true, false, false],
  ['Maison MND', ' maison mnd ', 'L’atelier MND', 'Atelier Autre', ''].map((x) => identiteDuPapier().estLaMaison(x)));
dit('... et identite.ts lui confie son nom vivant partout ou il se charge ; pdf.ts ne charge plus identite.ts', [true, false, true], [
  identite.includes('confieLIdentiteAuPapier({ nom: maisonNom, devise: DEVISE_COMPLETE, estLaMaison: estLaMaisonMND });'),
  /from '\.\/identite'/.test(lis('src/shared/pdf.ts')), /^import \{ identiteDuPapier \} from '\.\/identite-du-papier';$/m.test(lis('src/shared/pdf.ts'))]);

/* ══ 8. LA COPIE SERVEUR ÉGALE LE PUR ═════════════════════════════════════ */
dit('la fonction porte la copie EXACTE du bloc ⟨billet-regle⟩ (terminer-copie-serveur la reecrit)', [true, true],
  [entre(regle, 'billet-regle') !== null, entre(regle, 'billet-regle') === entre(lis('supabase/functions/terminer-et-regler/index.ts'), 'billet-regle')]);
dit('... et le bloc pur n importe rien (il vit dans une fonction qui n importe rien du depot)', false, /^import /m.test(String(entre(regle, 'billet-regle'))));

/* ══ 9. LE SERVEUR, REJOUÉ : la VRAIE fonction terminer-et-regler, contre une
   base et une horloge simulées. Il est 10 h à Cotonou, le samedi 7 novembre
   2026. ═══════════════════════════════════════════════════════════════════ */
type Row = { id?: string | number; branch_id?: string; data?: any; updated_at?: string; [k: string]: any };
const db: Record<string, Row[]> = {};
let tic = 0;
let maintenant = A_10H;
let identiteDuFrein = 0;
const litCol = (r: Row, col: string): unknown => {
  if (!col.startsWith('data')) return r[col];
  let x: any = r.data;
  for (const p of col.replace(/^data/, '').split(/->>?/).filter(Boolean)) x = x?.[p];
  return x;
};
class Requete {
  filtres: ((r: Row) => boolean)[] = [];
  mode: 'select' | 'insert' | 'update' | 'delete' = 'select';
  valeur: any = null; lim = Infinity; seul = false; compte = false; rend = false; plage: [number, number] | null = null; tri = ''; colonnes = '*';
  constructor(public table: string) {}
  select(c?: string, o?: { count?: string; head?: boolean }) { if (this.mode !== 'select') this.rend = true; else this.colonnes = c ?? '*'; if (o?.count) this.compte = true; return this; }
  delete() { this.mode = 'delete'; return this; }
  eq(c: string, v: unknown) { this.filtres.push((r) => String(litCol(r, c) ?? '') === String(v)); return this; }
  gte(c: string, v: unknown) { this.filtres.push((r) => String(litCol(r, c) ?? '') >= String(v)); return this; }
  lte(c: string, v: unknown) { this.filtres.push((r) => String(litCol(r, c) ?? '') <= String(v)); return this; }
  order(c: string) { this.tri = c; return this; }
  range(a: number, b: number) { this.plage = [a, b]; return this; }
  limit(k: number) { this.lim = k; return this; }
  maybeSingle() { this.seul = true; return this; }
  insert(row: Row) { this.mode = 'insert'; this.valeur = row; return this; }
  update(o: any) { this.mode = 'update'; this.valeur = o; return this; }
  then(ok: (x: any) => any, kko?: (e: any) => any) { return Promise.resolve(this.fais()).then(ok, kko); }
  fais(): any {
    const t = (db[this.table] ??= []);
    if (this.mode === 'insert') {
      const row = { ...structuredClone(this.valeur), at: this.valeur.at ?? new Date(maintenant).toISOString(), updated_at: `t${++tic}` };
      if (row.id === undefined && this.table === 'edge_rate_limits') row.id = ++identiteDuFrein;
      t.push(row);
      return { data: this.rend ? [{ id: row.id }] : null, error: null };
    }
    const lus = t.filter((r) => this.filtres.every((f) => f(r)));
    if (this.mode === 'delete') { for (const r of lus) t.splice(t.indexOf(r), 1); return { data: null, error: null }; }
    if (this.mode === 'update') { for (const r of lus) { Object.assign(r, structuredClone(this.valeur)); r.updated_at = `t${++tic}`; } return { data: this.rend ? lus.map((r) => ({ id: r.id })) : null, error: null }; }
    if (this.compte) return { count: lus.length, error: null };
    let rendus = this.tri ? [...lus].sort((a, b) => String(litCol(a, this.tri) ?? '').localeCompare(String(litCol(b, this.tri) ?? ''))) : lus;
    if (this.plage) rendus = rendus.slice(this.plage[0], this.plage[1] + 1);
    const data = structuredClone(rendus.slice(0, this.lim)).map((r) => (this.colonnes === 'id' ? { id: r.id } : r));
    return { data: this.seul ? (data[0] ?? null) : data, error: null };
  }
}
const admin = { from: (t: string) => new Requete(t), auth: { getUser: async () => ({ data: { user: null } }) } };
const env: Record<string, string> = { SUPABASE_URL: 'http://base', SERVICE_KEY: 'cle-de-service', SUPABASE_SERVICE_ROLE_KEY: 'cle-de-la-plateforme' };
const Horloge = class extends Date {
  constructor(...a: any[]) { if (a.length === 0) super(maintenant); else super(...(a as [any])); }
  static now() { return maintenant; }
};
const fonction = (() => {
  let handler: ((req: Request) => Promise<Response>) | null = null;
  const module = { exports: {} as Record<string, unknown> };
  new Function('createClient', 'Deno', 'fetch', 'module', 'exports', 'Date', readFileSync(process.env.BILLET_FONCTION as string, 'utf8'))(
    () => admin, { env: { get: (k: string) => env[k] }, serve: (h: typeof handler) => { handler = h; } }, async () => new Response('', { status: 404 }), module, module.exports, Horloge,
  );
  return handler!;
})();
let ipSuivante = 0;
const appelle = async (corps?: Record<string, unknown>) => {
  const headers = { 'x-forwarded-for': `10.0.0.${++ipSuivante % 250}` };
  const r = await fonction(new Request('http://f/fonction', corps ? { method: 'POST', body: JSON.stringify(corps), headers } : { method: 'GET' }));
  return { status: r.status, corps: await r.json() as any };
};
const billetDe = async (id: string) => (await appelle({ action: 'billet', v: await jetonDuRendezVous('cle-de-la-plateforme', id) })).corps;

const rdv = (id: string, date: string, time: string, status: string, clientId = 'c-anne') =>
  ({ id, branch_id: 'b1', updated_at: `t${++tic}`, data: { id, branchId: 'b1', clientId, clientName: 'X', date, time, status, priceXof: 12000 } });
const pieceDe = (id: string, data: Record<string, unknown>) => ({ id, branch_id: 'b1', data: { id, branchId: 'b1', kind: 'facture', clientId: 'c-anne', lines: [ligne(12000)], globalDiscountPct: 0, status: 'payée', ...data } });
const soldee = (id: string, apptId: string, date: string, plus: Record<string, unknown> = {}) =>
  pieceDe(id, { number: `F-TEST-${id.slice(-4)}`, date, apptId, master: 'Expert', payment: 'Espèces', cashbox: 'caisse-test', encaissePar: 'Main Caisse', theme: 'Rose', payments: [{ id: `${id}-v`, date, amountXof: 12000, method: 'Espèces', cashbox: 'caisse-test', encaissePar: 'Main Caisse' }], ...plus });
db.clients = [
  { id: 'c-anne', branch_id: 'b1', data: FICHE_ANNE },
  { id: 'c-parent', branch_id: 'b1', data: { name: 'Parent Exemple', phone: '+229 01 00 00 00 02' } },
  { id: 'c-enfant', branch_id: 'b1', data: { name: 'Enfant Exemple', phone: '+229 01 00 00 00 03' } },
];
db.branches = [{ id: 'b1', data: BRANCHE }];
db.documents = [{ key: 'mnd_house_identity', data: { nom: 'Maison MND', raison: RAISON } }];
db.appointments = [
  rdv('rdv-passe', '2026-11-04', '10:00', 'honoré'), rdv('rdv-autre', '2026-10-28', '10:00', 'honoré'),
  rdv('rdv-jour', JOUR, '08:00', 'honoré'), rdv('rdv-tot', JOUR, '11:00', 'confirmé'), rdv('rdv-demain', '2026-11-08', '09:00', 'confirmé'),
  rdv('rdv-impaye', '2026-11-03', '09:00', 'honoré'), rdv('rdv-annule', '2026-11-02', '09:00', 'annulé'), rdv('rdv-sans-piece', '2026-11-01', '09:00', 'honoré'),
  rdv('rdv-gratuit', '2026-10-30', '09:00', 'honoré'), rdv('rdv-enfant', '2026-11-05', '15:00', 'honoré', 'c-enfant'),
  rdv('rdv-onze-mois', '2025-12-10', '10:00', 'honoré'), rdv('rdv-trop-vieux', '2025-11-06', '10:00', 'honoré'),
];
db.invoices = [
  /* Une pièce annulée du même rendez-vous, lue la première : ce n'est pas la sienne. */
  pieceDe('inv-0000', { number: 'F-TEST-0000', date: '2026-11-04', apptId: 'rdv-passe', status: 'annulée', payments: [{ date: '2026-11-04', amountXof: 99000 }] }),
  { id: 'inv-test-1', branch_id: 'b1', data: PIECE_BRUTE },
  soldee('inv-0999', 'rdv-autre', '2026-10-28'),
  soldee('inv-0002', 'rdv-jour', JOUR), soldee('inv-0003', 'rdv-tot', '2026-11-05'), soldee('inv-0004', 'rdv-demain', '2026-11-05'),
  pieceDe('inv-0005', { number: 'F-TEST-0005', date: '2026-11-03', apptId: 'rdv-impaye', status: 'envoyée', payments: [{ date: '2026-11-03', amountXof: 5000, method: 'Espèces' }] }),
  soldee('inv-0006', 'rdv-annule', '2026-11-02'),
  pieceDe('inv-0007', { number: 'F-TEST-0007', date: '2026-10-30', apptId: 'rdv-gratuit', status: 'envoyée', lines: [ligne(0)], payments: [] }),
  soldee('inv-0008', 'rdv-enfant', '2026-11-05', { clientId: 'c-parent', forClientId: 'c-enfant', master: undefined }),
  soldee('inv-0009', 'rdv-onze-mois', '2025-12-10'), soldee('inv-0010', 'rdv-trop-vieux', '2025-11-06'),
];
db.edge_rate_limits = [];

const sante = await appelle();
dit('la version monte : 2026-11-07-b ou apres', true, /^2026-\d\d-\d\d-[a-z] · /.test(String(sante.corps.version)) && String(sante.corps.version) >= '2026-11-07-b');
const passe = await billetDe('rdv-passe');
dit('billet d un jour passe, regle : le billet d avant, et SA facture', {
  ok: true,
  billet: { ...BILLET_PASSE, facture: FACTURE_ATTENDUE },
}, { ok: passe.ok, billet: passe.billet });
dit('... rien de la caisse, de la main, du theme, des identifiants, de la fiche, de l equipe, dans toute la reponse', [[], false, false, false, false],
  [cles(passe).filter((k) => INTERDITS.includes(k)), /caisse-test|Main Caisse|note de l equipe/.test(JSON.stringify(passe)), /inv-test-1|inv-0000/.test(JSON.stringify(passe)), /c-anne/.test(JSON.stringify(passe)), /"Rose"/.test(JSON.stringify(passe))]);
dit('... seulement SA piece : ni l annulee du meme rendez-vous, ni une autre piece de la fiche', [false, false],
  [/F-TEST-0000/.test(JSON.stringify(passe)), /F-TEST-0999/.test(JSON.stringify(passe))]);
dit('... et la page dit « Regle le 4 novembre 2026. Merci, Anne. », 19 500 F, le bouton',
  { sur: 'Réglé', montant: '19 500 F', phrase: 'Réglé le 4 novembre 2026. Merci, Anne.', telecharger: 'Télécharger ma facture (PDF)', leJourMeme: false },
  reglementDuBillet(billetDeLaPageLu(passe)!, JOUR));
const jour = await billetDe('rdv-jour');
dit('regle le jour meme, le rituel commence (8 h, il est 10 h) : la facture est jointe, la page garde sa phrase et ajoute le bouton', ['regle', true, 'Télécharger ma facture (PDF)', true],
  [jour.billet?.etat, !!jour.billet?.facture, reglementDuBillet(billetDeLaPageLu(jour)!, JOUR)?.telecharger, /partir/.test(String(reglementDuBillet(billetDeLaPageLu(jour)!, JOUR)?.phrase))]);
const sans = async (id: string) => { const b = (await billetDe(id)).billet; return [b?.etat, b ? 'facture' in b : 'billet absent']; };
dit('aucune facture : paye d avance avant l heure, demain, une piece qui doit encore, un annule, sans piece, une piece sans argent recu',
  [['confirme', false], ['confirme', false], ['passe', false], ['annule', false], ['passe', false], ['regle', false]],
  [await sans('rdv-tot'), await sans('rdv-demain'), await sans('rdv-impaye'), await sans('rdv-annule'), await sans('rdv-sans-piece'), await sans('rdv-gratuit')]);
dit('... et la page n y parle pas d argent pour un passe non regle (le retard de saisie ne se montre pas)', null,
  reglementDuBillet(billetDeLaPageLu(await billetDe('rdv-impaye'))!, JOUR));
const enfant = await billetDe('rdv-enfant');
dit('un enfant soigne, le parent qui regle : la tete, la payeuse, le premier maitre pour le mot (la piece ne nomme aucune main)',
  [{ nom: 'Enfant Exemple', payeuse: 'Parent Exemple', telephone: '+229 01 00 00 00 03', name: 'Enfant Exemple' }, 'Expert'],
  [enfant.billet?.facture?.cliente, enfant.billet?.facture?.maison?.maitre]);
/* « Mes RDV », douze mois en arrière : le code ET les quatre chiffres. */
const retrouve = await appelle({ action: 'retrouver', code: referenceDuRendezVous('rdv-onze-mois'), chiffres: '0001' });
dit('retrouver un rituel de onze mois (le code ET les quatre chiffres) : le jeton de la page, et le billet porte sa facture', [true, true, 'F-TEST-0009', '2025-12-10'],
  [retrouve.corps.ok, typeof retrouve.corps.v === 'string', retrouve.corps.billet?.facture?.piece?.number, retrouve.corps.billet?.facture?.regleLe]);
dit('... son jeton rouvre la page du rendez-vous (aucune date limite au jeton)', 'F-TEST-0009',
  (await appelle({ action: 'billet', v: retrouve.corps.v })).corps.billet?.facture?.piece?.number);
dit('douze mois et un jour : introuvable, comme un code inconnu ; onze mois avec des chiffres faux : introuvable', [false, 'introuvable', false],
  [(await appelle({ action: 'retrouver', code: referenceDuRendezVous('rdv-trop-vieux'), chiffres: '0001' })).corps.ok,
    (await appelle({ action: 'retrouver', code: referenceDuRendezVous('rdv-trop-vieux'), chiffres: '0001' })).corps.error,
    (await appelle({ action: 'retrouver', code: referenceDuRendezVous('rdv-onze-mois'), chiffres: '9999' })).corps.ok]);

console.log(ko ? `\n${ko} echec(s) sur ${n}.` : `\nTout tient (${n} controles).`);
process.exit(ko ? 1 : 0);
