/* LA CAPTURE QUI S'ENCAISSE, ÉPROUVÉE — `node scripts/verifie-la-capture-qui-s-encaisse.mjs`.

   19 octobre 2026, chantier `capture`. Maquette validée par Yéman : « Claude
   lit la capture (un transfert Mobile Money reçu sur WhatsApp : montant,
   jour et heure, référence, moyen, "Vers : MAISON MND"), retrouve ce que la
   cliente doit (rituel, facture, échéance) et vous propose l'encaissement
   tout prêt, dans la caisse MTN MoMoPay. Si le montant ne tombe sur rien, ou
   sur deux choses, il vous montre ce qu'elle doit et vous choisissez. La
   même lecture marche dans "Encaisser", en déposant la capture. Votre règle
   tient : un rituel passé ne reçoit jamais de reçu. » Sa décision : « Tout
   seul, pour une cliente qui doit de l'argent : chaque image reçue d'une
   cliente avec un reste à payer est lue ; "Captures à inscrire" apparaît
   dans À faire. Les autres images (photos de locks) ne sont pas lues. »

   LES ATTENTES SONT ÉCRITES À LA MAIN d'après ces mots, jamais tirées du
   code. Le passage de lecture se rejoue avec un faux Claude (voir le .mjs) ;
   le vrai n'est jamais appelé. Données d'exemple. */
import { readFileSync } from 'node:fs';
import {
  CAISSE_MOMOPAY_MAISON, caisseProposee,
} from '../src/shared/caisses-des-caissiers-pur';
import { defautDeLaDemande, peutDemander } from '../src/shared/ia-maison-pur';
import { prenomEtInitiale } from '../src/shared/ia-anonymise-pur';
import { recuAEnvoyer } from '../src/shared/recu-whatsapp';
import {
  CLE_DES_CAPTURES, JOURS_DE_LECTURE, LECTURES_MAX_PAR_PASSAGE, MESSAGE_DE_LA_CAPTURE, SCHEMA_DE_LA_CAPTURE, TOLERANCE_PCT, VERROU_MS,
  aUnResteDu, caisseImposee, captureApresLecture, capturesAInscrire, consigneDeLaCapture, dejaInscriteParSaReference,
  dettesDeLaCliente, dettesDites, elagueLesCaptures, imagesALire, jourPourClaude, lectureDeLaCapture, methodeDuMoyenLu,
  noteDeLaCapture, peutLireSeule, phraseDuRapprochement, rapprochement, suiteDuRefus, verrouTient,
  type Captures, type Dette, type MessageImage, type MoyenLu,
} from '../src/shared/ia-capture-pur';
import {
  capturesStore, corrigeLaCapture, ecarteLaCapture, litLesCaptures, lisUneCaptureDeposee, marqueInscrite, oublieLaCapture, reprendsLaCapture,
} from '../src/shared/ia-capture';

let ko = 0;
/* Comparer sans dépendre de l'ordre des clés d'un objet. */
const range = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(range);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, range((v as Record<string, unknown>)[k])]));
  return v;
};
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const a = JSON.stringify(range(attendu)); const o = JSON.stringify(range(obtenu));
  if (a === o) console.log(`OK    ${nom}`);
  else { ko++; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};
const lis = (f: string) => readFileSync(f, 'utf8').split(String.fromCharCode(13)).join('');
const sansCommentaires = (t: string) => t.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const source = (f: string) => sansCommentaires(lis(f));

const PUR = 'src/shared/ia-capture-pur.ts';
const COTE_TRONE = 'src/shared/ia-capture.ts';
const CROCHET = 'src/apps/trone/shell/useLectureDesCaptures.ts';
const SHELL = 'src/apps/trone/shell/Shell.tsx';
const CARTE = 'src/apps/trone/routes/clients/CaptureLue.tsx';
const FIL = 'src/apps/trone/routes/clients/Conversations.tsx';
const ENCAISSER = 'src/apps/trone/routes/clients/actions.tsx';
const CAISSE = 'src/apps/trone/routes/vente/Caisse.tsx';
const DEPOSER = 'src/apps/trone/routes/vente/DeposerUneCapture.tsx';
const TUILE = 'src/apps/trone/routes/pilotage/TuileCapturesAInscrire.tsx';
const A_FAIRE = 'src/apps/trone/routes/pilotage/AFaire.tsx';
const DETTES = 'src/apps/trone/routes/clients/dettes-de-la-cliente.ts';

const dette = (genre: Dette['genre'], id: string, resteXof: number, jour: string, aVenir = false): Dette => ({ genre, id, resteXof, jour, aVenir });

/* ── 1. LA RÈGLE ──────────────────────────────────────────────────────── */
dit('ses mots : quatorze jours, dix lectures par passage, verrou de trois minutes, deux pour cent',
  [14, 10, 3, 2], [JOURS_DE_LECTURE, LECTURES_MAX_PAR_PASSAGE, VERROU_MS / 60_000, TOLERANCE_PCT]);
{
  const D = [dette('rituel', 'r1', 15000, '2026-10-18'), dette('facture', 'f1', 40000, '2026-10-02'), dette('echeance', 's1#2', 25000, '2026-10-25', true)];
  const v = (m: number, d: Dette[] = D) => { const r = rapprochement(m, d); return r.verdict === 'un' ? ['un', r.dette.id] : [r.verdict, r.dettes.map((x) => x.id)]; };
  dit('un seul reste égal : un, et c\'est lui', ['un', 'r1'], v(15000));
  dit('à deux pour cent près (15 000 F : de 14 700 à 15 300) : encore lui', [['un', 'r1'], ['un', 'r1']], [v(14700), v(15300)]);
  dit('au-delà de deux pour cent : aucun, et toutes ses dettes se montrent', [['aucun', ['r1', 'f1', 's1#2']], ['aucun', ['r1', 'f1', 's1#2']]], [v(14699), v(15301)]);
  dit('une échéance à venir se règle d\'avance : elle se rapproche aussi', ['un', 's1#2'], v(25000));
  dit('deux restes égaux : plusieurs, on choisit', ['plusieurs', ['a', 'b']], v(15000, [dette('rituel', 'a', 15000, '2026-10-18'), dette('rituel', 'b', 15000, '2026-10-11')]));
  dit('l\'égalité au franc prime sur l\'approximation', ['un', 'exact'], v(15000, [dette('rituel', 'exact', 15000, '2026-10-18'), dette('rituel', 'proche', 15200, '2026-10-11')]));
  dit('deux restes à deux pour cent, aucun exact : plusieurs', ['plusieurs', ['a', 'b']], v(15050, [dette('rituel', 'a', 15000, '2026-10-18'), dette('rituel', 'b', 15100, '2026-10-11')]));
  dit('un montant nul ne tombe sur rien', ['aucun', ['r1', 'f1', 's1#2']], v(0));
  dit('elle ne doit rien : aucun, liste vide', ['aucun', []], v(15000, []));
}
dit('la caisse : MTN va au MoMoPay de la Maison ; Moov, Celtiis, un virement, un autre : rien ne s\'impose',
  ['MoMoPay Maison MND', null, null, null, null], (['mtn', 'moov', 'celtiis', 'virement', 'autre'] as MoyenLu[]).map((m) => caisseImposee(m) ?? null));
{
  /* La règle des caissiers, la vraie, avec le moyen que la lecture choisit
     dans SA liste (Paramètres par défaut). */
  const methods = ['MTN MoMo', 'Moov', 'Celtis', 'Wave', 'Espèces', 'Carte', 'Virement bancaire', 'PayPal', 'Chèque', 'Lien WhatsApp'];
  const boxes = [
    { id: 'cb1', branchId: 'b1', name: 'MoMoPay Maison MND' },
    { id: 'cb2', branchId: 'b1', name: 'MoMoPay ACIA 1', role: 'terrasse' },
    { id: 'cb3', branchId: 'b1', name: 'Terrasse · Tiroir espèces', role: 'terrasse' },
  ] as Parameters<typeof caisseProposee>[0]['boxes'];
  const caisse = (m: MoyenLu) => {
    const methode = methodeDuMoyenLu(m, methods);
    return methode ? (caisseProposee({ methode, aujourdhui: '2026-10-19', dateDuRdv: '2026-10-18', boxes, branchId: 'b1' }).caisse ?? null) : 'à la main';
  };
  dit('le moyen lu prend le nom de SA liste', ['MTN MoMo', 'Moov', 'Celtis', 'Virement bancaire', null],
    (['mtn', 'moov', 'celtiis', 'virement', 'autre'] as MoyenLu[]).map((m) => methodeDuMoyenLu(m, methods) ?? null));
  dit('... et la caisse proposée : MoMoPay Maison MND pour MTN, aucune pour Moov, Celtiis, un virement',
    [CAISSE_MOMOPAY_MAISON, null, null, null, 'à la main'], (['mtn', 'moov', 'celtiis', 'virement', 'autre'] as MoyenLu[]).map(caisse));
  dit('un moyen absent de sa liste ne s\'invente pas', [null, null], [methodeDuMoyenLu('moov', ['Espèces', 'MTN MoMo']) ?? null, methodeDuMoyenLu('mtn', ['Espèces']) ?? null]);
}
{
  /* CE QU'ELLE DOIT : rituels, factures, échéances. */
  type A = { id: string; clientId: string; date: string; status: string; offertPar?: string; reste: number };
  type P = { id: string; kind: string; status: string; clientId: string; forClientId?: string; apptId?: string; date: string; reste: number };
  const rdvs: A[] = [
    { id: 'a1', clientId: 'c1', date: '2026-10-18', status: 'honoré', reste: 15000 },
    { id: 'a2', clientId: 'c1', date: '2026-10-15', status: 'annulé', reste: 10000 },
    { id: 'a3', clientId: 'c2', date: '2026-10-16', status: 'honoré', reste: 5000 },
    { id: 'a4', clientId: 'c1', date: '2026-10-25', status: 'confirmé', reste: 20000 },
    { id: 'a5', clientId: 'c2', offertPar: 'c1', date: '2026-10-10', status: 'honoré', reste: 8000 },
    { id: 'a6', clientId: 'c1', date: '2026-10-12', status: 'honoré', reste: 0 },
  ];
  const pieces: P[] = [
    { id: 'f1', kind: 'facture', status: 'émise', clientId: 'c1', apptId: 'a1', date: '2026-10-18', reste: 15000 },
    { id: 'f2', kind: 'facture', status: 'émise', clientId: 'c1', date: '2026-10-02', reste: 40000 },
    { id: 'f3', kind: 'facture', status: 'payée', clientId: 'c1', date: '2026-10-01', reste: 9000 },
    { id: 'f4', kind: 'devis', status: 'émis', clientId: 'c1', date: '2026-10-03', reste: 70000 },
    { id: 'f5', kind: 'facture', status: 'émise', clientId: 'c9', forClientId: 'c1', date: '2026-09-30', reste: 3000 },
  ];
  const abonnements = [{ id: 's1', clientId: 'c1' }, { id: 's2', clientId: 'c2' }];
  const echeances: Record<string, { numero: number; dueIso: string; resteXof: number; soldee: boolean }[]> = {
    s1: [{ numero: 1, dueIso: '2026-10-05', resteXof: 0, soldee: true }, { numero: 2, dueIso: '2026-11-05', resteXof: 25000, soldee: false }, { numero: 3, dueIso: '2026-12-05', resteXof: 25000, soldee: false }],
    s2: [{ numero: 1, dueIso: '2026-10-05', resteXof: 9000, soldee: false }],
  };
  const d = dettesDeLaCliente({
    clientId: 'c1', rdvs, resteDuRdv: (a) => a.reste, pieces, resteDeLaPiece: (p) => p.reste,
    abonnements, echeancesDe: (s) => echeances[s.id], aujourdhui: '2026-10-19',
  });
  dit('ce qu\'elle doit : le passé d\'abord (le plus récent en tête), l\'avenir ensuite ; ni annulé, ni soldé, ni devis, ni facture d\'un rituel déjà compté, une seule échéance',
    ['a1', 'a5', 'f2', 'f5', 'a4', 's1#2'], d.map((x) => x.id));
  dit('... avec ses restes et son avenir', [15000, 8000, 40000, 3000, 20000, 25000, false, false, false, false, true, true],
    [...d.map((x) => x.resteXof), ...d.map((x) => x.aVenir)]);
  dit('une dette ne porte ni nom ni numéro : genre, id, reste, jour, avenir', ['aVenir', 'genre', 'id', 'jour', 'resteXof'], Object.keys(d[0]).sort());
  dit('elle « doit » quand une dette n\'est pas à venir ; une échéance à venir seule ne la fait pas lire',
    [true, false, false], [aUnResteDu(d), aUnResteDu(d.filter((x) => x.aVenir)), aUnResteDu([])]);
}
{
  const cas: [string | undefined, Record<string, boolean>][] = [
    ['souverain', {}], ['gerant', {}], ['maitre', { 'dept-clientele': true }], ['maitre', { 'dept-vente-caisse': true }],
    ['maitre', { 'dept-finances': true }], ['maitre', { 'dept-atelier': true }], ['maitre', {}], [undefined, { 'dept-clientele': true }],
  ];
  dit('la carte et « Déposer une capture » : la direction, la Clientèle, la Vente, les Finances',
    [true, true, true, true, true, false, false, false], cas.map(([r, a]) => peutDemander(r, 'capture', a)));
  dit('la lecture qui part seule : la direction ou la Clientèle, jamais un poste de caisse seul',
    [true, true, true, false, false, false, false, false], cas.map(([r, a]) => peutLireSeule(r, a)));
}

/* ── 2. LA LECTURE : ON NE CROIT RIEN DE CE QUE CLAUDE REND ─────────────── */
{
  const AUJ = '2026-10-19';
  const bon = { estUnPaiement: true, montantXof: 15000, jour: '2026-10-18', heure: '9h05', reference: 'MP2610.1234.A56789', moyen: 'mtn', beneficiaire: 'MAISON MND', confiance: 0.92 };
  dit('une capture nette se lit telle quelle (l\'heure remise en HH:MM)',
    { estUnPaiement: true, montantXof: 15000, jour: '2026-10-18', heure: '09:05', reference: 'MP2610.1234.A56789', moyen: 'mtn', beneficiaire: 'MAISON MND', confiance: 0.92 },
    lectureDeLaCapture(bon, AUJ));
  const refus: [string, unknown][] = [
    ['un montant négatif', { ...bon, montantXof: -15000 }],
    ['un montant à virgule', { ...bon, montantXof: 15000.5 }],
    ['un montant en texte', { ...bon, montantXof: '15000' }],
    ['un montant nul', { ...bon, montantXof: 0 }],
    ['un montant de cinquante millions et plus', { ...bon, montantXof: 60_000_000 }],
    ['une date de 2027, lointaine', { ...bon, jour: '2027-03-01' }],
    ['demain', { ...bon, jour: '2026-10-20' }],
    ['un jour sans année', { ...bon, jour: '18/10' }],
    ['un jour à la française', { ...bon, jour: '18/10/2026' }],
    ['un 30 février', { ...bon, jour: '2026-02-30' }],
    ['plus de quatorze mois en arrière', { ...bon, jour: '2025-08-01' }],
    ['un moyen inconnu (Wave)', { ...bon, moyen: 'wave' }],
    ['un moyen hors de l\'énumération (MTN en capitales)', { ...bon, moyen: 'MTN' }],
    ['sans dire si c\'est un paiement', { ...bon, estUnPaiement: undefined }],
    ['un tableau', [bon]],
    ['rien', null],
    ['un texte', 'Le montant est 15 000 F'],
  ];
  dit('les sorties abîmées de Claude sont refusées : ' + refus.map(([n]) => n).join(', '),
    refus.map(() => null), refus.map(([, b]) => lectureDeLaCapture(b, AUJ)));
  dit('aujourd\'hui et treize mois en arrière tiennent', ['2026-10-19', '2025-09-25'],
    [lectureDeLaCapture({ ...bon, jour: '2026-10-19' }, AUJ), lectureDeLaCapture({ ...bon, jour: '2025-09-25' }, AUJ)].map((l) => (l?.estUnPaiement ? l.jour : null)));
  dit('« pas un paiement » tient seul, sans rien d\'autre', { estUnPaiement: false, confiance: 0.8 },
    lectureDeLaCapture({ estUnPaiement: false, confiance: 0.8, montantXof: 99999, moyen: 'mtn' }, AUJ));
  dit('la confiance se borne entre 0 et 1', [1, 0, 0], [7, 'haute', -1].map((c) => lectureDeLaCapture({ ...bon, confiance: c }, AUJ)?.confiance));
  const l = lectureDeLaCapture({ ...bon, heure: '25:00', reference: '<script>alert(1)</script>', beneficiaire: '{"x":1}' }, AUJ);
  dit('une heure impossible, une référence ou un bénéficiaire suspects tombent, le reste tient',
    [15000, false, false, false], [l?.estUnPaiement ? l.montantXof : null, !!l && 'heure' in l, !!l && 'reference' in l, !!l && 'beneficiaire' in l]);
  dit('une référence de plus de quarante signes tombe', false, 'reference' in (lectureDeLaCapture({ ...bon, reference: 'A'.repeat(41) }, AUJ) ?? {}));

  const avant = { id: 'm1', numero: '2290197000000', clientId: 'c1', statut: 'en-cours' as const, enCours: '2026-10-19T09:59:00Z' };
  const D = [dette('rituel', 'r1', 15000, '2026-10-18')];
  const apres = (brut: unknown) => captureApresLecture(avant, brut, { dettes: D, aujourdhui: AUJ, maintenant: '2026-10-19T10:00:00Z' });
  dit('après Claude : un paiement lisible attend un oui, rapproché, sans verrou',
    ['a-verifier', 'un', false], [apres(bon).statut, apres(bon).rapprochement?.verdict, !!apres(bon).enCours]);
  dit('après Claude : pas un paiement, ou illisible, s\'écarte avec son motif',
    [['ecartee', 'pas-un-paiement'], ['ecartee', 'illisible']], [apres({ estUnPaiement: false, confiance: 1 }), apres({ ...bon, montantXof: -1 })].map((c) => [c.statut, c.motif]));
}

/* ── 3. LA CONSIGNE : NI NOM, NI NUMÉRO, NI « SALON » ───────────────────── */
{
  const D = [dette('rituel', 'rdv-22901970000', 15000, '2026-10-18'), dette('facture', 'FAC-2026-0042', 40000, '2026-10-02'), dette('echeance', 'abo-7#2', 25000, '2026-10-25', true)];
  dit('ce qu\'elle doit, dit à Claude : montant, genre, jour avec l\'année',
    ['15 000 F sur son rituel du 18/10/2026', '40 000 F sur sa facture du 02/10/2026', '25 000 F sur son échéance du 25/10/2026'], dettesDites(D));
  const c = consigneDeLaCapture({ dettes: D, aujourdhui: '2026-10-19' });
  dit('la consigne porte ce qu\'elle doit, le jour d\'aujourd\'hui et l\'année exigée',
    [true, true, true], [c.includes('la cliente doit : 15 000 F sur son rituel du 18/10/2026'), c.includes('19/10/2026'), c.includes('AAAA-MM-JJ, AVEC l’année')]);
  dit('la consigne nomme les quatre moyens et MAISON MND', [true, true, true, true, true],
    ['MTN', 'Moov', 'Celtiis', 'virement', 'MAISON MND'].map((m) => c.includes(m)));
  dit('la consigne interdit de corriger le montant pour qu\'il colle, d\'inventer, et le mot « salon »', [true, true, true],
    [c.includes('Tu ne corriges jamais le montant lu'), c.includes('Tu n’inventes jamais'), c.includes('jamais le mot « salon »')]);
  dit('chez Claude : aucun identifiant, aucun numéro de pièce, aucun numéro de téléphone (huit chiffres de suite)', [false, false, false, false],
    [c.includes('22901970000'), c.includes('FAC-2026'), c.includes('abo-7'), /\d{8,}/.test(c)]);
  dit('sans dette connue, elle le dit', true, consigneDeLaCapture({ dettes: [], aujourdhui: '2026-10-19' }).includes('aucune dette'));
  dit('le message qui accompagne l\'image ne porte aucun chiffre', false, /\d/.test(MESSAGE_DE_LA_CAPTURE));
  const s = SCHEMA_DE_LA_CAPTURE as { type: string; additionalProperties: boolean; required: string[]; properties: Record<string, { type?: string; enum?: string[]; minimum?: number }> };
  dit('le schéma : un objet fermé, le montant entier positif, le moyen en énumération fermée',
    ['object', false, ['estUnPaiement', 'montantXof', 'jour', 'moyen'].every((k) => s.required.includes(k)), 'integer', 0, ['mtn', 'moov', 'celtiis', 'virement', 'autre']],
    [s.type, s.additionalProperties, true, s.properties.montantXof.type, s.properties.montantXof.minimum, s.properties.moyen.enum]);
  dit('la demande telle que le Trône l\'envoie est recevable par le contrat', null, defautDeLaDemande({
    chantier: 'capture', usage: 'image', systeme: c, messages: [{ role: 'user', content: MESSAGE_DE_LA_CAPTURE }],
    images: [{ coffre: 'whatsapp', chemin: 'x/abc-capture.jpg' }], schema: SCHEMA_DE_LA_CAPTURE, maxTokens: 400,
  }));
  const qui = prenomEtInitiale({ prenom: 'Clarisse', nom: 'Dossou' });
  const argent = (x: number) => `${x.toLocaleString('fr-FR').replace(/\s/g, ' ')} F`;
  const jour = (iso: string) => (iso === '2026-10-18' ? '18 octobre 2026' : iso);
  dit('la phrase de la maquette, prénom et initiale, l\'année toujours',
    'C’est le rituel de Clarisse D. du 18 octobre 2026 : reste 15 000 F.', phraseDuRapprochement(rapprochement(15000, [D[0]]), { qui, argent, jour }));
  dit('sur deux choses : choisissez', 'Ce montant tombe sur 2 choses que Clarisse D. doit : choisissez.',
    phraseDuRapprochement(rapprochement(15000, [dette('rituel', 'a', 15000, '2026-10-18'), dette('rituel', 'b', 15000, '2026-10-11')]), { qui, argent, jour }));
  dit('la date dite à Claude porte l\'année', '18/10/2026', jourPourClaude('2026-10-18'));
}

/* ── 4. LES IMAGES À LIRE, ET LE DOCUMENT ───────────────────────────────── */
{
  const T = Date.parse('2026-10-19T10:00:00Z');
  const il = (jours: number) => new Date(T - jours * 86_400_000).toISOString();
  const img = (id: string, quand: string, o: Partial<MessageImage> = {}, piece: Partial<NonNullable<MessageImage['piece']>> = {}): MessageImage =>
    ({ id, sens: 'entrant', numero: '2290197000001', clientId: 'c1', quand, type: 'image', piece: { type: 'image/jpeg', coffre: 'whatsapp', chemin: `n/${id}.jpg`, ...piece }, ...o });
  const messages: MessageImage[] = [
    img('m1', il(1)),
    img('m2', il(1.1), { sens: 'sortant' }),
    { id: 'm3', sens: 'entrant', numero: '2290197000001', clientId: 'c1', quand: il(1.2), type: 'text' },
    img('m4', il(15)),
    img('m5', il(1.3), { clientId: 'c2' }),
    img('m6', il(1.4), { clientId: undefined, numero: '2290199999999' }),
    img('m7', il(1.5)), img('m8', il(1.6)), img('m9', il(1.7)), img('m10', il(1.8)),
    img('m11', il(2)),
    img('m12', il(2.1), { type: 'sticker' }, { type: 'image/webp' }),
    img('m13', il(2.2), {}, { coffre: 'engagements' }),
    img('m14', il(2.3), {}, { tropLourde: true }),
    img('m15', il(2.4), { type: 'document' }, { type: 'application/pdf' }),
    img('m16', il(2.5), {}, { chemin: undefined }),
    img('m17', il(3), { clientId: undefined }),
    img('m18', il(4), {}, { coffre: undefined }),
  ];
  const captures: Captures = {
    m7: { id: 'm7', numero: 'n', clientId: 'c1', statut: 'a-verifier' },
    m8: { id: 'm8', numero: 'n', clientId: 'c1', statut: 'inscrite' },
    m9: { id: 'm9', numero: 'n', clientId: 'c1', statut: 'ecartee' },
    m10: { id: 'm10', numero: 'n', clientId: 'c1', statut: 'en-cours', enCours: new Date(T - 2 * 60_000).toISOString() },
    m11: { id: 'm11', numero: 'n', clientId: 'c1', statut: 'en-cours', enCours: new Date(T - 4 * 60_000).toISOString() },
  };
  const choisies = imagesALire({
    messages, captures, maintenant: T,
    clientIdDuNumero: (n) => (n === '2290197000001' ? 'c1' : undefined),
    doitDeLArgent: (c) => c === 'c1',
  });
  dit('les images lues : entrantes, rangées chez les clientes, de moins de quatorze jours, d\'une cliente qui doit, jamais deux fois, verrou périmé repris ; ni autocollant, ni devis de prestataire, ni PDF, ni trop lourde',
    ['m1', 'm11', 'm17', 'm18'], choisies.map((m) => m.id));
  dit('... la fiche retrouvée par le numéro quand le message n\'en porte pas', 'c1', choisies.find((m) => m.id === 'm17')?.clientId);
  const beaucoup = Array.from({ length: 25 }, (_, i) => img(`b${i}`, il(i * 0.01)));
  dit('dix au plus par passage, les plus récentes d\'abord', ['b0', 'b9', 10],
    (() => { const r = imagesALire({ messages: beaucoup, captures: {}, maintenant: T, clientIdDuNumero: () => 'c1', doitDeLArgent: () => true }); return [r[0]?.id, r[9]?.id, r.length]; })());
  dit('quatorze jours : 13,9 lue, 14,1 non', ['tot'],
    imagesALire({ messages: [img('tot', il(13.9)), img('tard', il(14.1))], captures: {}, maintenant: T, clientIdDuNumero: () => 'c1', doitDeLArgent: () => true }).map((m) => m.id));
  dit('les photos d\'une cliente qui ne doit rien ne sont jamais lues', [],
    imagesALire({ messages: [img('x', il(1))], captures: {}, maintenant: T, clientIdDuNumero: () => 'c1', doitDeLArgent: () => false }));
  const v = (ms: number, statut: 'en-cours' | 'a-verifier' = 'en-cours', enCours = new Date(T - ms).toISOString()) => verrouTient({ statut, enCours }, T);
  dit('le verrou tient 2 min 59, plus à 3 min ni après ; pas sans date, pas hors lecture',
    [true, false, false, false, false], [v(179_000), v(180_000), v(181_000), v(0, 'en-cours', 'hier'), v(1000, 'a-verifier')]);
  dit('« Captures à inscrire » ne compte que celles qui attendent un oui', ['m7'], capturesAInscrire(captures).map((c) => c.id));
  const J = 86_400_000;
  const vieux: Captures = {
    i61: { id: 'i61', numero: 'n', clientId: 'c1', statut: 'inscrite', inscriteLe: new Date(T - 61 * J).toISOString() },
    e59: { id: 'e59', numero: 'n', clientId: 'c1', statut: 'ecartee', ecarteeLe: new Date(T - 59 * J).toISOString() },
    e70: { id: 'e70', numero: 'n', clientId: 'c1', statut: 'ecartee', luLe: new Date(T - 70 * J).toISOString() },
    v200: { id: 'v200', numero: 'n', clientId: 'c1', statut: 'a-verifier', luLe: new Date(T - 200 * J).toISOString() },
  };
  dit('le document s\'élague : une lecture réglée depuis plus de soixante jours part, celle qui attend un oui reste', ['e59', 'v200'], Object.keys(elagueLesCaptures(vieux, T)).sort());
  dit('rien à élaguer : le même objet, aucune écriture pour rien', true, elagueLesCaptures(captures, T) === captures);
  dit('la note du versement : « Capture lue · réf. … »', ['Capture lue · réf. MP123', 'Capture lue', 'Capture lue'], [noteDeLaCapture(' MP123 '), noteDeLaCapture(), noteDeLaCapture('  ')]);
  dit('déjà inscrite, reconnue à sa référence ; jamais une autre référence qui la prolonge, ni une autre note',
    [true, true, true, false, false, false, false],
    [
      dejaInscriteParSaReference('MP123', ['Capture lue · réf. MP123']),
      dejaInscriteParSaReference('mp123', [undefined, 'Capture lue · réf. MP123']),
      dejaInscriteParSaReference('MP123', ['Capture lue · réf. MP123 · reprise']),
      dejaInscriteParSaReference('MP123', ['Capture lue · réf. MP1234']),
      dejaInscriteParSaReference('MP123', ['MND PAY · réf. MP123']),
      dejaInscriteParSaReference(undefined, ['Capture lue']),
      dejaInscriteParSaReference('MP123', []),
    ]);
  dit('un refus de la fonction : le réseau et le budget oublient l\'image, un refus d\'image l\'écarte',
    ['oublier', 'oublier', 'oublier-et-se-taire', 'oublier-et-se-taire', 'oublier-et-se-taire', 'ecarter', 'ecarter', 'ecarter'],
    (['reseau', 'hors-ligne', 'budget', 'version', 'equipe', 'format', 'trop-gros', 'claude'] as const).map(suiteDuRefus));
}

/* ── 5. LE PASSAGE DE LECTURE, REJOUÉ AVEC UN FAUX CLAUDE ───────────────── */
type Demande = { chantier: string; usage: string; systeme: string; messages: { role: string; content: string }[]; images?: Record<string, string>[]; schema?: unknown; maxTokens?: number };
const appels: { d: Demande; statutPendant?: string }[] = [];
let reponses: unknown[] = [];
(globalThis as Record<string, unknown>).__fauxClaude = async (d: Demande) => {
  const id = Object.keys(capturesStore.get()).find((k) => d.images?.[0]?.chemin === `n/${k}.jpg`);
  appels.push({ d, statutPendant: id ? capturesStore.get()[id]?.statut : undefined });
  const r = reponses.shift();
  return r ?? { ok: false, erreur: 'claude', message: 'plus de réponse programmée' };
};
const okDe = (data: unknown) => ({ ok: true, data, texte: '', modele: 'faux', coutUsd: 0.01, resteUsd: 59 });
const local = (t: number) => { const x = new Date(t); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const MAINTENANT = Date.now();
const HIER = local(MAINTENANT - 86_400_000);
const DETTE_C1 = [dette('rituel', 'rdv-c1', 15000, HIER)];
const dettesDe = (c: string): Dette[] => (c === 'c1' ? DETTE_C1 : c === 'c3' ? [dette('rituel', 'rdv-c3', 9000, '2099-01-01', true)] : []);
const im = (id: string, minutes: number, clientId = 'c1'): MessageImage =>
  ({ id, sens: 'entrant', numero: '2290197000001', clientId, quand: new Date(MAINTENANT - minutes * 60_000).toISOString(), type: 'image', piece: { type: 'image/jpeg', coffre: 'whatsapp', chemin: `n/${id}.jpg` } });
const passe = (messages: MessageImage[]) => litLesCaptures({ messages, clientIdDuNumero: () => undefined, dettesDe });
const lecturePropre = (montantXof: number, reference = 'MP-1') => ({ estUnPaiement: true, montantXof, jour: HIER, moyen: 'mtn', reference, confiance: 0.9 });

{
  capturesStore.set({});
  const A = [im('p1', 1), im('p2', 2), im('p3', 3), im('p4', 4, 'c2'), im('p5', 5, 'c3')];
  reponses = [okDe(lecturePropre(15000)), okDe({ estUnPaiement: false, confiance: 0.95 }), okDe({ estUnPaiement: true, montantXof: -5, jour: HIER, moyen: 'mtn', confiance: 1 })];
  const r = await passe(A);
  const c = capturesStore.get();
  dit('un passage : trois images de la cliente qui doit, lues ; celle qui ne doit rien et celle qui ne doit qu\'à venir, jamais envoyées',
    [3, 3, ['p1', 'p2', 'p3']], [r.lues, appels.length, Object.keys(c).sort()]);
  dit('... rangées : à vérifier (rapprochée), pas un paiement, illisible',
    [['a-verifier', 'un'], ['ecartee', 'pas-un-paiement'], ['ecartee', 'illisible']],
    [[c.p1?.statut, c.p1?.rapprochement?.verdict], [c.p2?.statut, c.p2?.motif], [c.p3?.statut, c.p3?.motif]]);
  dit('le verrou est posé AVANT l\'appel : pendant que Claude lit, l\'image est « en cours »', ['en-cours', 'en-cours', 'en-cours'], appels.map((a) => a.statutPendant));
  const d0 = appels[0].d;
  dit('la demande : chantier capture, usage image, l\'image par son coffre, le schéma, peu de jetons',
    ['capture', 'image', [{ chemin: 'n/p1.jpg', coffre: 'whatsapp' }], true, true],
    [d0.chantier, d0.usage, d0.images, d0.schema === SCHEMA_DE_LA_CAPTURE, (d0.maxTokens ?? 9999) <= 600]);
  const tout = JSON.stringify({ s: d0.systeme, m: d0.messages });
  dit('chez Claude : ce qu\'elle doit, sans son numéro, sans son identifiant, sans le nom de sa fiche', [true, false, false, false],
    [d0.systeme.includes('15 000 F sur son rituel du'), tout.includes('2290197000001'), tout.includes('rdv-c1'), tout.includes('c1')]);

  appels.length = 0;
  const r2 = await passe(A);
  dit('jamais deux fois la même : le second passage n\'appelle personne', [0, 0], [r2.lues, appels.length]);

  reponses = [{ ok: false, erreur: 'reseau', message: 'Pas de réseau' }];
  const r3 = await passe([...A, im('p6', 0.5)]);
  dit('une panne de réseau : l\'image n\'est pas marquée, elle se relira', [0, true, false], [r3.lues, !!r3.refus, 'p6' in capturesStore.get()]);
  reponses = [okDe(lecturePropre(15000, 'MP-6'))];
  const r4 = await passe([...A, im('p6', 0.5)]);
  dit('... et au passage suivant, elle se lit', [1, 'a-verifier'], [r4.lues, capturesStore.get().p6?.statut]);

  capturesStore.set((prev) => ({ ...prev, p7: { id: 'p7', numero: 'n', clientId: 'c1', statut: 'en-cours', enCours: new Date(Date.now() - 60_000).toISOString() } }));
  capturesStore.set((prev) => ({ ...prev, p8: { id: 'p8', numero: 'n', clientId: 'c1', statut: 'en-cours', enCours: new Date(Date.now() - 4 * 60_000).toISOString() } }));
  appels.length = 0;
  reponses = [okDe(lecturePropre(15000, 'MP-8'))];
  await passe([...A, im('p7', 0.2), im('p8', 0.3)]);
  dit('un verrou frais d\'un autre Trône se respecte, un verrou de quatre minutes se reprend', [['n/p8.jpg'], 'en-cours', 'a-verifier'],
    [appels.map((a) => a.d.images?.[0]?.chemin), capturesStore.get().p7?.statut, capturesStore.get().p8?.statut]);

  appels.length = 0;
  const douze = Array.from({ length: 12 }, (_, i) => im(`q${i}`, 0.01 * (i + 1)));
  reponses = douze.map(() => okDe(lecturePropre(15000)));
  const r5 = await passe(douze);
  dit('dix lectures par passage, pas plus', [10, 10], [r5.lues, appels.length]);

  appels.length = 0;
  reponses = [okDe(lecturePropre(15000)), okDe(lecturePropre(15000))];
  const [x, y] = await Promise.all([passe(douze), passe(douze)]);
  dit('un passage à la fois : le second, lancé pendant le premier, ne lit rien', [2, 0, 2], [x.lues, y.lues, appels.length]);

  reponses = [{ ok: false, erreur: 'claude', message: 'Claude n’a pas su' }];
  await passe([im('k1', 0.05)]);
  dit('Claude muet : la capture s\'écarte avec sa raison', ['ecartee', 'claude'], [capturesStore.get().k1?.statut, capturesStore.get().k1?.motif]);
  oublieLaCapture('k1');
  reponses = [okDe(lecturePropre(15000, 'MP-K'))];
  await passe([im('k1', 0.05)]);
  dit('« Relire » : oubliée, elle se relit au passage suivant', 'a-verifier', capturesStore.get().k1?.statut);

  /* LES GESTES DE LA MAIN. */
  corrigeLaCapture('p1', { ...lecturePropre(40000), moyen: 'moov' } as never, DETTE_C1);
  const p1 = capturesStore.get().p1;
  dit('la main corrige une case : la lecture change, le rapprochement se refait, la lecture de Claude reste à côté',
    [40000, 'aucun', 15000], [p1?.lecture?.estUnPaiement ? p1.lecture.montantXof : null, p1?.rapprochement?.verdict, p1?.lectureBrute?.estUnPaiement ? p1.lectureBrute.montantXof : null]);
  ecarteLaCapture('p1');
  dit('« Ce n\'est pas un paiement » : écartée, par la main', ['ecartee', 'main'], [capturesStore.get().p1?.statut, capturesStore.get().p1?.motif]);
  reprendsLaCapture('p1', DETTE_C1);
  dit('« Finalement, c\'est un paiement » : elle revient à vérifier', 'a-verifier', capturesStore.get().p1?.statut);
  marqueInscrite('p1', 'rdv-c1');
  dit('« Inscrire au Carnet » abouti : inscrite, sur son rendez-vous', ['inscrite', 'rdv-c1'], [capturesStore.get().p1?.statut, capturesStore.get().p1?.inscriteSur]);

  /* LA CAPTURE DÉPOSÉE À LA MAIN : la même lecture, rien ne s'écrit. */
  const avantDepot = JSON.stringify(capturesStore.get());
  appels.length = 0;
  reponses = [okDe(lecturePropre(15000, 'MP-D'))];
  const dep = await lisUneCaptureDeposee(new Blob(['x'], { type: 'image/jpeg' }), DETTE_C1);
  dit('« Déposer une capture » : la lecture revient à l\'écran, l\'image part en base64, le document des captures ne bouge pas',
    [true, 15000, true, true], [dep.ok, dep.ok && dep.lecture.estUnPaiement ? dep.lecture.montantXof : null, !!appels[0]?.d.images?.[0]?.base64, JSON.stringify(capturesStore.get()) === avantDepot]);
  reponses = [okDe({ estUnPaiement: true, montantXof: 15000, jour: '2099-01-01', moyen: 'mtn', confiance: 1 })];
  const dep2 = await lisUneCaptureDeposee(new Blob(['x'], { type: 'image/jpeg' }), DETTE_C1);
  dit('... une lecture abîmée (un transfert venu du futur) ne remplit rien', false, dep2.ok);

  /* EN DERNIER : un refus de budget fait taire le Trône une heure. */
  reponses = [{ ok: false, erreur: 'budget', message: 'Plafond atteint' }];
  const rb = await passe([im('z1', 0.01)]);
  appels.length = 0;
  reponses = [okDe(lecturePropre(15000))];
  const rb2 = await passe([im('z1', 0.01), im('z2', 0.02)]);
  dit('le budget atteint : l\'image n\'est pas marquée, et le Trône se tait ensuite (aucun appel)', [true, false, 0, 0],
    [!!rb.refus, 'z1' in capturesStore.get(), rb2.lues, appels.length]);
}

/* ── 6. UN RITUEL PASSÉ NE REÇOIT JAMAIS DE REÇU (sa règle, la vraie) ───── */
dit('le reçu : jamais pour un rituel passé, même payé aujourd\'hui ; jamais pour un transfert d\'hier ; oui pour l\'argent du jour d\'un rituel du jour ou à venir',
  [false, false, true, true],
  [
    recuAEnvoyer({ jourDuPaiement: '2026-10-19', jourDuRituel: '2026-10-18', aujourdhui: '2026-10-19' }),
    recuAEnvoyer({ jourDuPaiement: '2026-10-18', jourDuRituel: '2026-10-19', aujourdhui: '2026-10-19' }),
    recuAEnvoyer({ jourDuPaiement: '2026-10-19', jourDuRituel: '2026-10-19', aujourdhui: '2026-10-19' }),
    recuAEnvoyer({ jourDuPaiement: '2026-10-19', jourDuRituel: '2026-10-25', aujourdhui: '2026-10-19' }),
  ]);

/* ── 7. LA STRUCTURE ──────────────────────────────────────────────────── */
{
  const shell = source(SHELL);
  dit('le crochet est monté une fois, dans le Shell', 1, (shell.match(/^\s*useLectureDesCaptures\(\);/gm) ?? []).length);
  const k = source(CROCHET);
  dit('le crochet : fonction posée (useSaitIaMaison), la direction ou la Clientèle (peutLireSeule), messages, document, fiches, rendez-vous et pièces descendus',
    [true, true, true, true, true, true, true, true],
    [/useSaitIaMaison\(\)/.test(k), /sait === true/.test(k), /peutLireSeule\(/.test(k), /quandTablePrete\('messages_wa'/.test(k),
      /quandDocumentDescendu\(CLE_DES_CAPTURES\)/.test(k), /tablePrete\('clients'\)/.test(k), /tablePrete\('appointments'\)/.test(k), /tablePrete\('invoices'\)/.test(k)]);
  dit('le crochet n\'écrit rien d\'argent, n\'appelle pas Claude lui-même, et ne redessine pas le Shell à chaque message', [false, false, false, true],
    [/(invoicesStore|appointmentsStore|expensesStore)\.set\(/.test(k), /demandeAClaude/.test(k), /useStore\(messagesWaStore\)/.test(k), /messagesWaStore\.subscribe\(/.test(k)]);
  dit('le crochet retrouve la fiche par la clé de comparaison des numéros (229 01…)', true, /cleDuNumeroWa\(/.test(k));

  const t = source(COTE_TRONE);
  dit('le document des captures porte la clé que le module pur annonce', [CLE_DES_CAPTURES, 'mnd_ia_captures'], [capturesStore.key, CLE_DES_CAPTURES]);
  const appel = t.slice(t.indexOf('export async function litLesCaptures'), t.indexOf('export const enLecture'));
  dit('le passage : images choisies par la règle, verrou relu puis posé, PUIS Claude', [true, true],
    [/imagesALire\(/.test(appel), appel.indexOf('verrouTient(') > -1 && appel.indexOf("statut: 'en-cours'") > appel.indexOf('verrouTient(') && appel.indexOf('await demandeAClaude') > appel.indexOf("statut: 'en-cours'")]);
  dit('le côté Trône n\'inscrit jamais d\'argent ni n\'envoie de message', false, /(invoicesStore|appointmentsStore)\.set\(|envoie(Le|La|Sur)/.test(t));
  const bloc = appel.slice(appel.indexOf('demandeAClaude'), appel.indexOf('});', appel.indexOf('demandeAClaude')));
  dit('la demande ne porte ni le numéro ni la fiche : sa consigne vient de ce qu\'elle doit seulement', [false, true],
    [/numero|clientId|\.name\b|phone/.test(bloc.replace(/m\.piece!?\.chemin!?/g, '')), /consigneDeLaCapture\(\{ dettes: lesDettes, aujourdhui: aujourdhuiLocal\(\) \}\)/.test(bloc)]);

  const carte = source(CARTE);
  dit('la carte : « Lu par Claude · à vérifier », les quatre cases, les trois boutons', [true, true, true, true, true, true, true],
    ['Lu par Claude · à vérifier', '<span>Montant</span>', '<span>Jour</span>', '<span>Référence</span>', '<span>Moyen</span>', 'Inscrire au Carnet', 'Ce n’est pas un paiement'].map((m) => carte.includes(m)));
  dit('... « Un autre rendez-vous » ouvre ce qu\'elle doit', true, carte.includes("'Un autre rendez-vous'"));
  dit('« Inscrire au Carnet » emprunte l\'écran d\'encaissement du Carnet, préremplie de la lecture ; inscrite seulement quand il a encaissé',
    [true, true, true, true],
    [/<PayAppointmentModal[\s\S]*?initial=\{\{ montantXof: lecture\.montantXof, moyen: lecture\.moyen, jourDuPaiement: lecture\.jour, reference: lecture\.reference \}\}/.test(carte),
      /onEncaisse=\{\(\) => marqueInscrite\(capture\.id, rdvCible\.id\)\}/.test(carte),
      (carte.match(/marqueInscrite\(capture\.id, rdvCible\.id\)/g) ?? []).length === 1,
      /onClick=\{\(\) => setAEncaisser\(rdvCible\.id\)\}>Inscrire au Carnet/.test(carte)]);
  dit('la carte n\'écrit pas d\'argent, n\'envoie rien, n\'appelle pas Claude', false, /(invoicesStore|appointmentsStore)\.set\(|envoie(Le|La|Sur)|demandeAClaude|updateInvoice|addPayment/.test(carte));
  dit('la carte : le droit du chantier, la capture déjà inscrite reconnue, l\'année sur chaque date', [true, true, false],
    [/peutDemander\(staff\?\.role, CHANTIER_CAPTURE/.test(carte), /dejaInscriteParSaReference\(/.test(carte), /\bfr(Jour|Short|Court)\(/.test(carte)]);
  const fil = source(FIL);
  dit('le fil monte la carte sous une image reçue, et rien d\'autre', true,
    /m\.sens === 'entrant' && m\.piece\?\.type\?\.startsWith\('image\/'\) && <CaptureLue message=\{m\} clientId=\{fil\.clientId\} \/>/.test(fil));

  const enc = source(ENCAISSER);
  const confirme = enc.slice(enc.indexOf('const confirm = (garderOuvert = false)'));
  dit('l\'écran d\'encaissement : la lecture préremplit sa part et son jour, rien de plus', [true, true],
    [/useState<PartEnc\[\]>\(\(\) => \[initial \? partDeLaLecture\(initial, methods\) : partNeuve\('especes', due\)\]\)/.test(enc),
      /note: noteDeLaCapture\(l\.reference\)/.test(enc)]);
  dit('... le jour du transfert date l\'argent, sauf pour un rituel d\'une année antérieure (sa règle du 17 octobre passe d\'abord), à l\'ouverture comme au dépôt', [true, true],
    [/useState\(\(\) => \(estAnneeAnterieure\(appt\.date, todayISO\(\)\) && appt\.date \? appt\.date : initial\?\.jourDuPaiement \|\| todayISO\(\)\)\)/.test(enc),
      /setPayDate\(estAnneeAnterieure\(appt\.date, todayISO\(\)\) && appt\.date \? appt\.date : l\.jour\)/.test(enc)]);
  dit('... il ne marque la capture qu\'APRÈS avoir écrit et honoré, et seulement si de l\'argent est entré', [true, true],
    [confirme.indexOf('onEncaisse?.()') > confirme.indexOf('honoreALEncaissement(appt.id'), /if \(settleTotal > 0\) onEncaisse\?\.\(\);/.test(confirme)]);
  dit('... la note de la capture va sur le versement', true, /pt\.note \? \{ note: pt\.note \} : \{\}/.test(enc));
  dit('... et le reçu passe par la règle du jour métier (jour du versement, jour du rituel)', true,
    /envoiDeLaPiece\.apresReglement\(pieceId, montantXof, payDate, appt\.date\)/.test(enc));

  const dep = source(DEPOSER);
  dit('« Déposer une capture » : fonction posée et droit du chantier, rien ne s\'écrit', [true, true, false],
    [/if \(!sait \|\| !peutDemander\(staff\?\.role, CHANTIER_CAPTURE/.test(dep), /lisUneCaptureDeposee\(/.test(dep), /Store\.set\(|\.set\(\(prev/.test(dep)]);
  dit('... monté dans l\'encaissement du rituel et dans la Caisse', [true, true],
    [/<DeposerUneCapture clientId=\{appt\.clientId\}/.test(enc), /<DeposerUneCapture clientId=\{posClient\?\.id\}/.test(source(CAISSE))]);
  dit('la capture déposée passe par photoPourClaude', true, /photoPourClaude\(fichier\)/.test(t));

  const tuile = source(TUILE);
  dit('« Captures à inscrire » dans À faire : montée, elle compte celles qui attendent, et mène au fil', [true, true, true, true],
    [/<TuileCapturesAInscrire \/>/.test(source(A_FAIRE)), /capturesAInscrire\(captures\)/.test(tuile), /cheminDeLaConversation\(/.test(tuile), /à inscrire/.test(tuile)]);
  dit('les dettes se lisent avec le juge du Carnet (apptDueXof) et le reste des pièces', [true, true],
    [/apptDueXof\(a, byId\)/.test(source(DETTES)), /resteDeLaPiece: invoiceResteXof/.test(source(DETTES))]);

  const affiches = [PUR, COTE_TRONE, CROCHET, CARTE, DEPOSER, TUILE].map(source).join('\n');
  dit('aucun tiret cadratin dans ce qui s\'affiche', false, affiches.includes('—'));
  dit('« salon » n\'apparaît qu\'une fois, dans l\'interdiction de la consigne', [1, 1],
    [(affiches.match(/salon/gi) ?? []).length, affiches.split('jamais le mot « salon »').length - 1]);
}

if (ko) { console.log(`\n${ko} ÉCHEC(S)`); process.exitCode = 1; } else console.log('\nTOUT VA BIEN');
