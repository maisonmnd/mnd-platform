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
import { peutEtreRemis, peutEtreRemisAuFauteuil } from '../src/shared/devis-remis-pur';

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

console.log(`\n${n - ko}/${n} vérifications${ko ? `, ${ko} en échec` : ''}.`);
process.exit(ko ? 1 : 0);
