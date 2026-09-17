/* LES DEMANDES DU SITE, ÉPROUVÉES · `node scripts/verifie-demandes.mjs`.

   Le site révélateur dépose des demandes sans compte (17 septembre 2026).
   Ce que le Trône en fait tient à des fonctions pures : un numéro qui ne se
   normalise pas casse le lien WhatsApp et laisse passer les doublons ; un
   message qui porterait la devise la ferait poser deux fois ; une fiche sans
   provenance ne dit plus d'où la cliente est venue.

   Les numéros ci-dessous sont des DONNÉES DE TEST, fictifs (01 97 00 00 00),
   jamais des exemples affichés à l'écran. */
import {
  telephoneNormalise, telephoneMasque, demandesTriees, doublonDe, messageDeRappel,
  ficheDepuisLaDemande, ditLeBesoin, depuisQuand, type Demande,
} from '../src/shared/demandes';
import { porteLaDevise, signeLeMessage, DEVISE_COMPLETE } from '../src/shared/identite';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

const demande = (o: Partial<Demande> = {}): Demande => ({
  id: 'd1', genre: 'prospect', createdAt: '2026-09-17T09:00:00.000Z', branchId: 'br',
  prenom: 'A.', telephone: '+2290197000000', besoin: 'creation', source: 'site',
  consentementLe: '2026-09-17T08:59:00.000Z', statut: 'nouvelle', ...o,
});

/* ── 1. LE NUMÉRO, SOUS SIX FORMES, UNE SEULE EN BASE ──────────────── */
const E164 = '+2290197000000';
dit('dix chiffres locaux reçoivent +229', E164, telephoneNormalise('01 97 00 00 00'));
dit('huit chiffres reçoivent +229 et le 01 de 2024', E164, telephoneNormalise('97 00 00 00'));
dit('un plus en tête garde son indicatif', E164, telephoneNormalise('+229 01 97 00 00 00'));
dit('« 00 » en tête vaut un plus', E164, telephoneNormalise('00229 01 97 00 00 00'));
dit('l’indicatif tapé sans plus est reconnu', E164, telephoneNormalise('229 0197000000'));
dit('un numéro étranger garde le sien', '+33600000000', telephoneNormalise('+33 6 00 00 00 00'));
dit('moins de huit chiffres : rien', '', telephoneNormalise('97 00'));

/* ── 2. LE MASQUE DU COMPTOIR ──────────────────────────────────────── */
dit('le comptoir ne voit que les quatre derniers chiffres', '··· 00 00', telephoneMasque(E164));

/* ── 3. LE TRI : NOUVELLES D'ABORD, PUIS LES PLUS RÉCENTES ─────────── */
const liste = [
  demande({ id: 'ancienne-rappelee', statut: 'rappelee', createdAt: '2026-09-10T09:00:00.000Z' }),
  demande({ id: 'nouvelle-vieille', statut: 'nouvelle', createdAt: '2026-09-01T09:00:00.000Z' }),
  demande({ id: 'convertie-recente', statut: 'convertie', createdAt: '2026-09-16T09:00:00.000Z' }),
  demande({ id: 'nouvelle-fraiche', statut: 'nouvelle', createdAt: '2026-09-17T09:00:00.000Z' }),
];
dit('les nouvelles montent, les plus fraîches en tête',
  ['nouvelle-fraiche', 'nouvelle-vieille', 'convertie-recente', 'ancienne-rappelee'],
  demandesTriees(liste).map((d) => d.id));
dit('… sans toucher la liste reçue', 'ancienne-rappelee', liste[0].id);

/* ── 4. LE DOUBLON, DANS ET HORS FENÊTRE ───────────────────────────── */
const deja = [demande({ id: 'hier', telephone: E164, besoin: 'creation', createdAt: '2026-09-16T09:00:00.000Z' })];
dit('même numéro (autre forme), même besoin, dans la fenêtre : doublon', 'hier',
  doublonDe(deja, '97 00 00 00', 'creation', '2026-09-10T00:00:00.000Z')?.id);
dit('hors de la fenêtre : pas un doublon', undefined,
  doublonDe(deja, '97 00 00 00', 'creation', '2026-09-17T00:00:00.000Z')?.id);
dit('un autre besoin n’est pas un doublon', undefined,
  doublonDe(deja, E164, 'entretien', '2026-09-10T00:00:00.000Z')?.id);

/* ── 5. LE MESSAGE DE RAPPEL, NU ; LA DEVISE, POSÉE PAR LE CODE ────── */
const msg = messageDeRappel(demande({ prenom: 'A.', besoin: 'creation' }));
dit('le message dit qui, d’où, et demande quand',
  'Bonjour A., ici la Maison MND. Vous nous avez écrit depuis notre site pour créer votre couronne. Quand pouvons-nous vous appeler ?',
  msg);
dit('il ne porte pas la devise', false, porteLaDevise(msg));
dit('c’est signeLeMessage qui la pose, une fois', true, signeLeMessage(msg).endsWith(DEVISE_COMPLETE) && !porteLaDevise(msg));
dit('« ne sait pas encore » ne fait pas une phrase cassée',
  'Bonjour B., ici la Maison MND. Vous nous avez écrit depuis notre site. Quand pouvons-nous vous appeler ?',
  messageDeRappel(demande({ prenom: 'B.', besoin: 'inconnu' })));
dit('le besoin se dit comme sur le site', 'Pour son enfant', ditLeBesoin('enfant'));

/* ── 6. LA FICHE, AVEC SA PROVENANCE ───────────────────────────────── */
const fiche = ficheDepuisLaDemande(demande({
  id: 'd9', email: ' a@exemple.test ', page: '/premiere-couronne/', campagne: 'rentree',
}), 'p-initie');
dit('la fiche est un prospect de la branche, née le jour du dépôt', {
  id: 'prospect-d9', branchId: 'br', name: 'A.', phone: E164, city: '', persona: 'p-initie',
  since: '2026-09-17', segments: ['Prospect'], priceCoef: 1, loyaltyPoints: 0,
}, {
  id: fiche.id, branchId: fiche.branchId, name: fiche.name, phone: fiche.phone, city: fiche.city,
  persona: fiche.persona, since: fiche.since, segments: fiche.segments, priceCoef: fiche.priceCoef,
  loyaltyPoints: fiche.loyaltyPoints,
});
dit('… et porte d’où elle vient', {
  source: 'site', pageOrigine: '/premiere-couronne/', campagne: 'rentree',
  consentementLe: '2026-09-17T08:59:00.000Z', email: 'a@exemple.test',
}, {
  source: fiche.source, pageOrigine: fiche.pageOrigine, campagne: fiche.campagne,
  consentementLe: fiche.consentementLe, email: fiche.email,
});
dit('sans page ni campagne, rien d’inventé', false,
  'pageOrigine' in ficheDepuisLaDemande(demande(), 'p-initie') || 'campagne' in ficheDepuisLaDemande(demande(), 'p-initie'));

/* ── 7. L'ÂGE D'UNE DEMANDE, EN MOTS ───────────────────────────────── */
const T0 = Date.parse('2026-09-17T12:00:00.000Z');
dit('deux heures', 'il y a 2 h', depuisQuand('2026-09-17T10:00:00.000Z', T0));
dit('hier', 'hier', depuisQuand('2026-09-16T11:00:00.000Z', T0));

if (ko) {
  console.error(`\n${ko} vérification(s) en échec.`);
  process.exit(1);
}
console.log('\nLes demandes tiennent.');
