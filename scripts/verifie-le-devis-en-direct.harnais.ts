/* LE DEVIS EN DIRECT, ÉPROUVÉ — `node scripts/verifie-le-devis-en-direct.mjs`.

   22 novembre 2026 : « le même système de connexion automatique entre le
   Trône et les portables de nos clients pour faire les devis […] des devis
   instantanés, avec « Valider », « Oui, j'accepte le devis », « Oui, je
   confirme ma place », prendre son rendez-vous et faire le paiement en
   ligne si possible » (Yéman). Maquette FCTFNSr748gq1ecEHxhDMj, lot 1.
   Ce que ce banc tient :
     - le calibre se lit du nombre de locks, et le prix du modèle le suit ;
     - les options viennent du catalogue, à leur prix pour SA longueur ;
     - la consultation déjà réglée se déduit une fois, jamais sous zéro ;
     - les trois oui, à leurs mots, dans l'ordre, et un seul par page ;
     - un devis ne sort pas sans le rendez-vous du jour ni la marque du
       fauteuil — la règle du 17 novembre ne se lève pas. */
import {
  acompteDuDevisEnDirect, apresLeGeste, calibreDit, calibreDuNombreDeLocks, dureeDite, dureeDuModele,
  etapeDeLaPiece, gesteAttendu, LES_TROIS_OUI, ligneDeLaConsultationDejaReglee, motDUneEtape, placeDite,
  prixDeLOption, prixDuModele, totalDuDevis,
} from '../src/shared/devis-en-direct-pur';
import {
  choixValable, dureeDeLOffre, etatDuDevisEnDirect, jetonDuParametreDuDevis, lignesDuChoix, pageDuDevisEnDirect,
  parametreDuDevis, totalDeLOffre,
} from '../src/shared/devis-en-direct';
import { peutEtreRemis, peutEtreRemisAuFauteuil } from '../src/shared/devis-remis-pur';
import { readFileSync } from 'node:fs';
import { copieAttendue, copieDuServeur } from './devis-en-direct-copie-serveur.mjs';

const lis = (f: string): string => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

let ko = 0;
let n = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const a = JSON.stringify(attendu);
  const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK     ${nom}`);
  else { ko++; console.log(`ECHEC  ${nom} -> attendu ${a}, obtenu ${String(o)}`); }
};
const vrai = (nom: string, oui: boolean) => dit(nom, true, oui || 'faux');

/* Les sept calibres du Trône (`MODEL_BANDS_SEED`, pricing.ts), recopiés ici
   comme un écran les passe : le module ne les invente pas. */
const BANDES = [
  { name: 'Jumbo', maxLocks: 80, coef: 0.8, durCoef: 0.7 },
  { name: 'Medium', maxLocks: 150, coef: 1, durCoef: 1 },
  { name: 'Mini', maxLocks: 250, coef: 1.4, durCoef: 1.4 },
  { name: 'Micro', maxLocks: 350, coef: 1.8, durCoef: 1.9 },
  { name: 'Nano', maxLocks: 450, coef: 2.2, durCoef: 2.4 },
  { name: 'Pico', maxLocks: 550, coef: 2.5, durCoef: 2.6 },
  { name: 'Galaxy', maxLocks: null, coef: 2.8, durCoef: 2.8 },
];

/* ── LE CALIBRE ─────────────────────────────────────────────────────────── */
dit('120 locks : Medium', { nom: 'Medium', min: 81, max: 150, coef: 1, durCoef: 1 }, calibreDuNombreDeLocks(120, BANDES));
dit('80 locks : Jumbo, la première tranche', { nom: 'Jumbo', min: 1, max: 80, coef: 0.8, durCoef: 0.7 }, calibreDuNombreDeLocks(80, BANDES));
dit('81 locks : Medium, pas Jumbo', 'Medium', calibreDuNombreDeLocks(81, BANDES)?.nom);
dit('700 locks : Galaxy, sans plafond', 'Galaxy', calibreDuNombreDeLocks(700, BANDES)?.nom);
dit('zéro lock ne fait pas un calibre', null, calibreDuNombreDeLocks(0, BANDES));
dit('un nombre qui n’en est pas un', null, calibreDuNombreDeLocks('beaucoup', BANDES));
dit('sans table de calibres, rien', null, calibreDuNombreDeLocks(120, []));
dit('le calibre se dit', 'Medium · 81 à 150 locks', calibreDit(calibreDuNombreDeLocks(120, BANDES)));
dit('le dernier calibre se dit sans plafond', 'Galaxy · 551 locks et plus', calibreDit(calibreDuNombreDeLocks(700, BANDES)));

/* ── LES PRIX ───────────────────────────────────────────────────────────── */
dit('un modèle au coefficient 1 garde sa base', 25_000, prixDuModele(25_000, 1));
dit('le calibre allonge le prix', 35_000, prixDuModele(25_000, 1.4));
dit('le prix se dit au demi-millier', 33_000, prixDuModele(23_400, 1.4));
dit('le prix ne descend pas sous le calibre le plus fin', 20_000, prixDuModele(25_000, 0.8));
dit('une durée au calibre 1 ne bouge pas', 150, dureeDuModele(150, 1));
dit('une durée au calibre 1,4 s’allonge', 210, dureeDuModele(150, 1.4));
dit('la durée se dit en heures', '3 h 30', dureeDite(210));
dit('la durée courte se dit en minutes', '45 min', dureeDite(45));
dit('une option à trois longueurs suit la sienne', 30_000, prixDeLOption([15_000, 22_000, 30_000], 'long'));
dit('la longueur courte est la première', 15_000, prixDeLOption([15_000, 22_000, 30_000], 'court'));
dit('une option d’un seul prix ne bouge pas', 2_000, prixDeLOption(2_000, 'long'));
dit('une option sans prix ne se propose pas', null, prixDeLOption(undefined, 'long'));

/* ── LES LIGNES ─────────────────────────────────────────────────────────── */
dit('la consultation réglée se déduit', { label: 'Consultation privée, déduite', xof: -15_000, genre: 'consultation' },
  ligneDeLaConsultationDejaReglee(15_000, 'Consultation privée, déduite'));
dit('une consultation non payée ne se déduit pas', null, ligneDeLaConsultationDejaReglee(0, 'Consultation privée, déduite'));
const lignes = [
  { label: 'Reprise Essentielle', xof: 25_000, genre: 'modele' as const },
  { label: 'DÀNDÀN™ · Le Soin Hydratant', xof: 22_000, genre: 'option' as const },
  { label: 'Consultation privée, déduite', xof: -15_000, genre: 'consultation' as const },
];
dit('le total, déduction faite', 32_000, totalDuDevis(lignes));
dit('un devis ne descend jamais sous zéro', 0, totalDuDevis([{ label: 'Consultation', xof: -15_000, genre: 'consultation' }]));
dit('l’acompte suit le taux du Trône', 9_600, acompteDuDevisEnDirect(32_000, 30));
dit('sans taux, pas d’acompte', 0, acompteDuDevisEnDirect(32_000, 0));

/* ── LES TROIS OUI ──────────────────────────────────────────────────────── */
dit('les mots exacts, tranchés par elle', { valider: 'Valider', accepter: 'Oui, j’accepte le devis', confirmer: 'Oui, je confirme ma place' }, LES_TROIS_OUI);
dit('le premier oui valide', 'valide', apresLeGeste('devis', 'valider'));
dit('le deuxième oui accepte', 'accepte', apresLeGeste('valide', 'accepter'));
dit('le troisième oui prend la place', 'place', apresLeGeste('accepte', 'confirmer'));
dit('on ne saute pas l’acceptation', null, apresLeGeste('devis', 'accepter'));
dit('on ne valide pas deux fois', null, apresLeGeste('valide', 'valider'));
dit('on n’accepte pas deux fois', null, apresLeGeste('accepte', 'accepter'));
dit('après la place, plus de geste', null, apresLeGeste('place', 'confirmer'));
dit('la page attend un seul geste : valider', 'valider', gesteAttendu('devis'));
dit('la page attend un seul geste : accepter', 'accepter', gesteAttendu('valide'));
dit('la page attend un seul geste : confirmer', 'confirmer', gesteAttendu('accepte'));
dit('la page n’attend plus rien une fois la place prise', null, gesteAttendu('place'));
dit('une pièce envoyée est validée', 'valide', etapeDeLaPiece('envoyée', false, false));
dit('une pièce acceptée', 'accepte', etapeDeLaPiece('acceptée', false, false));
dit('une pièce confirmée a sa place', 'place', etapeDeLaPiece('confirmé', false, false));
dit('une pièce payée est scellée', 'scelle', etapeDeLaPiece('payée', false, true));
dit('un brouillon est au début', 'devis', etapeDeLaPiece('brouillon', false, false));
dit('la place tenue se dit', 'tenue', placeDite('tenue'));
dit('la place confirmée se dit', 'confirmée', placeDite('confirmee'));
dit('le dernier mot est « Merci. »', 'Merci.', motDUneEtape('scelle'));

/* ── LA REMISE AU FAUTEUIL, ET CELLE QUI NE SE LÈVE PAS ─────────────────── */
const AUJ = '2026-11-22';
const rdvs = [
  { id: 'rdv1', clientId: 'cl1', status: 'confirmé', date: AUJ },
  { id: 'rdv2', clientId: 'cl2', status: 'annulé', date: AUJ },
  { id: 'rdv3', clientId: 'cl3', status: 'confirmé', date: '2026-11-23' },
];
const devis = (x: Record<string, unknown>) => ({ kind: 'devis', status: 'brouillon', date: AUJ, clientId: 'cl1', ...x });
dit('au fauteuil, le devis du jour sort', { ok: true, par: 'fauteuil' },
  peutEtreRemisAuFauteuil(devis({ auFauteuil: { le: '2026-11-22T10:00:00Z' } }), { rdvs, aujourdhui: AUJ }));
dit('sans la marque du fauteuil, il ne sort pas', { ok: false, raison: 'Ce devis n’est pas marqué au fauteuil : il se remet au rendez-vous.' },
  peutEtreRemisAuFauteuil(devis({}), { rdvs, aujourdhui: AUJ }));
dit('un rendez-vous annulé ne l’ouvre pas', { ok: false, raison: 'Elle n’a pas de rendez-vous aujourd’hui : le devis attend son rendez-vous.' },
  peutEtreRemisAuFauteuil(devis({ clientId: 'cl2', auFauteuil: { le: '2026-11-22T10:00:00Z' } }), { rdvs, aujourdhui: AUJ }));
dit('un rendez-vous demain ne l’ouvre pas non plus', { ok: false, raison: 'Elle n’a pas de rendez-vous aujourd’hui : le devis attend son rendez-vous.' },
  peutEtreRemisAuFauteuil(devis({ clientId: 'cl3', auFauteuil: { le: '2026-11-22T10:00:00Z' } }), { rdvs, aujourdhui: AUJ }));
dit('une commande de la Boutique reste hors de la règle', { ok: true, par: 'hors-regle' },
  peutEtreRemisAuFauteuil({ kind: 'facture', boutique: {}, auFauteuil: { le: AUJ } }, { rdvs, aujourdhui: AUJ }));
/* La règle du 17 novembre ne se lève PAS : une consultation pas encore tenue
   garde son refus, même avec la marque du fauteuil. */
const refus = peutEtreRemis(
  { kind: 'devis', status: 'brouillon', date: AUJ, clientId: 'cl1', consultationId: 'cons1', auFauteuil: { le: '2026-11-22T10:00:00Z' } },
  { consultations: [{ id: 'cons1', paidXof: 15_000, rdvId: 'rdv1' }], visios: [], rdvs: [{ id: 'rdv1', clientId: 'cl1', status: 'confirmé', date: AUJ }] },
);
dit('la règle ordinaire refuse toujours une consultation en cours', { ok: false, raison: 'La consultation privée n’est pas encore faite.' }, refus);

/* ── LA PIÈCE ET LA PAGE (`devis-en-direct.ts`) ────────────────────────── */
const offre = {
  modeleConseille: 'm2',
  modeles: [
    { id: 'm1', nom: 'Reprise Essentielle', xof: 25_000, dureeMin: 150 },
    { id: 'm2', nom: 'Reprise Longue Durée', xof: 35_000, dureeMin: 210, maison: 'SÍNSIN™ Élaboré' },
  ],
  options: [
    { id: 'o1', nom: 'DÀNDÀN™ · Le Soin Hydratant', xof: 22_000, etat: 'proposee' as const, dureeMin: 70 },
    { id: 'o2', nom: 'Styling · sortie soignée', xof: 2_000, etat: 'incluse' as const, dureeMin: 20 },
  ],
  locks: 120,
  calibre: 'Medium · 81 à 150 locks',
  deductionXof: 15_000,
};
dit('le paramètre du devis ne se confond pas avec celui du règlement', ['d-abcdefghjkmnpq', null, null],
  [parametreDuDevis('abcdefghjkmnpq'), jetonDuParametreDuDevis('r-abcdefghjkmnpq'), jetonDuParametreDuDevis('d-abc')]);
dit('le jeton du devis revient', 'abcdefghjkmnpq', jetonDuParametreDuDevis(parametreDuDevis('abcdefghjkmnpq')));
dit('sans lien, la pièce est un brouillon', 'brouillon', etatDuDevisEnDirect({ id: 'p1' }));
dit('envoyée, elle est un devis', 'devis', etatDuDevisEnDirect({ id: 'p1', status: 'envoyée', lienDuDevis: { jeton: 'abcdefghjkmnpq', creeLe: '2026-11-22T10:00:00Z' } }));
dit('acceptée', 'accepte', etatDuDevisEnDirect({ id: 'p1', lienDuDevis: { jeton: 'abcdefghjkmnpq', creeLe: '2026-11-22T10:00:00Z', accepteLe: '2026-11-22T10:10:00Z' } }));
dit('avec sa place', 'place', etatDuDevisEnDirect({ id: 'p1', lienDuDevis: { jeton: 'abcdefghjkmnpq', creeLe: '2026-11-22T10:00:00Z', accepteLe: '2026-11-22T10:10:00Z', place: { jour: '2026-12-01', heure: '10 h' } } }));
dit('une pièce introuvable', 'introuvable', etatDuDevisEnDirect(null));
dit('elle prend le modèle conseillé si elle n a rien choisi', 'm2', choixValable(offre, undefined)?.modele.id);
dit('elle prend celui qu elle a choisi', 'm1', choixValable(offre, { modele: 'm1' })?.modele.id);
dit('un modèle absent de l offre retombe sur le conseillé', 'm2', choixValable(offre, { modele: 'inconnu' })?.modele.id);
dit('une offre sans modèle ne se choisit pas', null, choixValable({ modeles: [], options: [] }, undefined));
dit('l option incluse est toujours dans son choix', ['o2'], choixValable(offre, { modele: 'm1', options: ['o1'] })?.options.filter((x) => x.etat === 'incluse').map((x) => x.id));
dit('ses options cochées vont avec l incluse', ['o1', 'o2'], choixValable(offre, { modele: 'm1', options: ['o1'] })?.options.map((x) => x.id));
const ecrit = lignesDuChoix(offre, { modele: 'm2', options: ['o1'] }, 15_000);
dit('la pièce porte le modèle et ses options', ['Reprise Longue Durée · SÍNSIN™ Élaboré', 'DÀNDÀN™ · Le Soin Hydratant', 'Styling · sortie soignée'], ecrit.lignes.map((l) => l.label));
dit('l option incluse est offerte sur sa ligne', [0, 0, 100], ecrit.lignes.map((l) => l.discountPct));
dit('la consultation se déduit une fois, sur la pièce', 15_000, ecrit.deductionXof);
dit('une consultation non payée ne se déduit pas', 0, lignesDuChoix(offre, { modele: 'm1' }, 0).deductionXof);
dit('un choix impossible ne fait pas de lignes', { lignes: [], deductionXof: 0 }, lignesDuChoix({ modeles: [], options: [] }, undefined));
dit('le total de l offre, déduction faite', 44_000, totalDeLOffre(offre, { modele: 'm2', options: ['o1'] }));
dit('sans option cochée, l incluse compte quand même', 12_000, totalDeLOffre(offre, { modele: 'm1' }));
dit('la durée suit le modèle et ses options', 300, dureeDeLOffre(offre, { modele: 'm2', options: ['o1'] }));
const pageDevis = pageDuDevisEnDirect({ devis: { id: 'p1', status: 'envoyée', clientName: 'Awa Sossou', master: 'Team', devisDuFauteuil: offre, lienDuDevis: { jeton: 'abcdefghjkmnpq', creeLe: '2026-11-22T10:00:00Z' } }, maintenant: new Date('2026-11-22T10:00:00Z') });
dit('la page ne donne que le prénom', 'Awa', pageDevis.prenom);
dit('la page dit le conseillé', [false, true], pageDevis.modeles.map((m) => !!m.conseille));
dit('la page ne porte ni nom de famille ni numéro', false, JSON.stringify(pageDevis).includes('Sossou') || JSON.stringify(pageDevis).includes('01'));
dit('la page dit le maître tel quel', 'Team', pageDevis.maitre);

/* ── LA FONCTION ───────────────────────────────────────────────────────── */
const fn = lis('supabase/functions/devis-en-direct/index.ts');
vrai('la fonction a ses quatre gestes', ["if (b.action === 'lire')", "if (b.action === 'valider')", "if (b.action === 'accepter')", "if (b.action === 'confirmer')"].every((x) => fn.includes(x)));
vrai('la fonction refuse une place qui n est pas proposee', fn.includes("if (!proposees.some((x) => x.jour === jour && x.heure === heure)) return json({ error: 'place' }, 400);"));
vrai('la fonction ne laisse pas remodeler un devis accepte', fn.includes("if (d.lienDuDevis.accepteLe) return json({ error: 'deja_accepte' }, 409);"));
vrai('la fonction exige l acceptation avant la place', fn.includes("if (!d.lienDuDevis.accepteLe) return json({ error: 'pas_accepte' }, 409);"));
vrai('la fonction garde la premiere place', fn.includes('if (d.lienDuDevis.place) return json({ ok: true, deja: true, page: page(d) });'));
vrai('la fonction ecrit les lignes de son choix, jamais un montant recu', fn.includes('const { lignes, deductionXof } = lignesDuChoix(') && fn.includes("if (b.action === 'regler')") === false);
vrai('la fonction ne parle pas a KkiaPay', !fn.includes('KKIAPAY') && !fn.includes('kkiapay.me'));
vrai('la fonction se freine', fn.includes("permis(ipOf(req), 'devis-valider', 30)"));
dit('la regle recopiee est la meme, mot pour mot', copieAttendue(process.cwd()), copieDuServeur(process.cwd()));
/* ── LA PAGE CLIENTE ET SON PONT ──────────────────────────────────────── */
const pageHtml = lis('devis.html');
vrai('la page du devis existe et porte sa surface', pageHtml.includes('data-surface="devis"') && pageHtml.includes('/src/apps/devis/main.tsx'));
vrai('la page est enregistree a la construction', lis('vite.config.ts').includes("devis: resolve(__dirname, 'devis.html')"));
const pont = lis('public/payer.html');
vrai('le bouton d- mene a la page du devis', pont.includes('devis.html?d=') && pont.includes('/^d-([23456789abcdefghjkmnpqrstuvwxyz]{14})$/'));
vrai('le pont ne prend pas un devis pour un Tap & Go', pont.includes("if (p.has('tg') && !rj && !ej && !dj) {"));
const pageApp = lis('src/apps/devis/App.tsx');
vrai('les trois oui sont sur la page, a ses mots', pageApp.includes('Valider') && pageApp.includes('Oui, j’accepte le devis') && pageApp.includes('Oui, je confirme ma place'));
vrai('la page ne fabrique aucun prix', pageApp.includes('valideLeDevis(jeton, modele, options)') && !/valideLeDevis\([^)]*xof/i.test(pageApp));
vrai('la page ne propose que les places recues', pageApp.includes('page.places') || pageApp.includes('p?.places'));
vrai('le dernier ecran dit Merci et signe la Maison', pageApp.includes('>Merci.</h2>') && pageApp.includes('>Maison MND</p>'));
console.log(`\n${n - ko}/${n} vérifications${ko ? `, ${ko} en échec` : ''}.`);
process.exit(ko ? 1 : 0);
