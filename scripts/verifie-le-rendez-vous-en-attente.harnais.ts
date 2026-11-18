/* LE RENDEZ-VOUS EN ATTENTE, ÉPROUVÉ — `node scripts/verifie-le-rendez-vous-en-attente.mjs`.

   17 novembre 2026 (Yéman, arbitrage B de « La consultation en affiches »). Un rendez-vous
   pris sur le site naît en attente : la place est tenue deux heures, il se
   confirme par « Je confirme » sur WhatsApp (et l'acompte quand un geste en
   porte un), sinon la place se libère.

   Trois parties. A : la règle pure (rendez-vous-en-attente-pur). B : la VRAIE
   fonction demande-submit contre une base, un Meta, un Deno et une horloge
   simulés : la bascule, la pose en attente, la réponse du webhook, les deux
   heures, les plafonds, la clé du numéro, le doublon, la grille, la durée au
   calibre, Ma Couronne. C : les fichiers qui tiennent la même règle (le SQL,
   le webhook, confirmation-rdv, le Trône, Ma Couronne), lus à leurs ancres.
   Tout est inventé. Sortie ASCII : la console de Windows. */
import { readFileSync, readdirSync } from 'node:fs';
import {
  DELAI_DE_L_ATTENTE_MS, SURSIS_DE_L_ACOMPTE_MS, EN_ATTENTE_PAR_NUMERO, POSES_PAR_NUMERO_ET_PAR_JOUR, POSES_PAR_ADRESSE_ET_PAR_JOUR,
  MODELES_PAR_NUMERO_ET_PAR_JOUR, DEPLACEMENTS_AU_PLUS, MODELE_DE_L_ATTENTE,
  acompteAttendu, estFerme, estEnAttente, placeALiberer, etatDeLAttente, marquesDeLaNaissance, marquesDuOui, marquesDeLaLiberation,
  cleDuNumero, formesDuNumero, plafondDuNumero, deplacementsFaits, peutEncoreSeDeplacer, remiseGardeeAuDeplacement, acompteDesGestes,
  heureSurLaGrille, dureeAuCalibre, gestesAuCalibre, famillesAvecLeDefaisage, ATELIERS_DU_DEFAISAGE, texteDeLAttente, composantsDeLAttente, texteDuOui, texteDeLAcompte,
  texteDeLaPlaceLiberee, texteDeLAutreMoment, heureDeCotonouDite, ceQueDitLAttente,
  minuteDePortoNovo, debutDuRendezVous, ouiDuComptoir, texteDesOuis,
} from '../src/shared/rendez-vous-en-attente-pur';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { estSuggere } from '../src/shared/rendez-vous-suggere-pur';
import { rappelDeLaVeilleSeTait, suggestionSansOui } from '../src/shared/heures-des-rappels-pur';
import { jetonDuRendezVous, referenceDuRendezVous } from '../src/shared/lien-du-rdv-pur';
import { reponseDeLaMaisonLue } from '../src/apps/couronne/reservation-serveur';

let ko = 0;
let n = 0;
const ascii = (v: unknown): string =>
  (JSON.stringify(v) ?? 'undefined').replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : `\n       obtenu  ${ascii(obtenu)}\n       attendu ${ascii(attendu)}`}`);
};
const lit = (f: string): string => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

/* ── L'horloge : le mardi 17 novembre 2026, 10 h à Cotonou. Elle avance quand on le lui dit. ── */
const REEL = Date;
let T0 = REEL.parse('2026-11-17T10:00:00+01:00');
class Horloge extends REEL {
  constructor(...a: unknown[]) { if (a.length === 0) super(T0); else super(...(a as [number])); }
  static now() { return T0; }
}
(globalThis as any).Date = Horloge;
const iso = (ms: number): string => new REEL(ms).toISOString();

/* ══ A. LA RÈGLE PURE ═══════════════════════════════════════════════════════ */
{
  const pose = marquesDeLaNaissance(T0);
  dit('A1 deux heures : la pose ecrit sa marque et son echeance, deux heures plus tard', [7_200_000, iso(T0), iso(T0 + 7_200_000)],
    [DELAI_DE_L_ATTENTE_MS, pose.suggereLe, pose.attenduJusquAu]);
  const tenue = { status: 'confirmé', ...pose };
  dit('A2 nee en attente : tenue (statut confirme), en attente, suggeree pour les rappels, pas ferme', [true, true, false, 'sans-reponse'],
    [estEnAttente(tenue), estSuggere(tenue), estFerme(tenue), etatDeLAttente(tenue)]);
  dit('A3 les rappels se taisent tant qu elle n a pas dit oui : ni la veille, ni deux heures avant', [true, true],
    [rappelDeLaVeilleSeTait({ ...tenue, date: '2026-11-18' }), suggestionSansOui(tenue)]);
  /* Une place pour le vendredi 20 novembre, 10 h : son heure est loin. */
  const aVenir = { ...tenue, date: '2026-11-20', time: '10:00' };
  dit('A4 l echeance : a 1 h 59 la place tient, a 2 h pile elle se libere ; ferme, jamais', [false, true, false],
    [placeALiberer(aVenir, T0 + 7_140_000), placeALiberer(aVenir, T0 + 7_200_000),
      placeALiberer({ ...aVenir, confirmeeParLaClienteLe: iso(T0 + 60_000) }, T0 + 9_000_000)]);
  /* LA PLACE DU JOUR MÊME (18 novembre 2026) : prise à 13 h 30 pour 14 h, sans réponse. */
  const midiEtDemi = REEL.parse('2026-11-17T13:30:00+01:00');
  const duJour = { status: 'confirmé', ...marquesDeLaNaissance(midiEtDemi), date: '2026-11-17', time: '14:00' };
  const apresSesDeuxHeures = midiEtDemi + 2 * 3_600_000 + 60_000;
  dit('A4b une place dont l heure est venue ne se libere jamais : prise a 13 h 30 pour 14 h, a 15 h 31 elle tient (elle est au fauteuil) ; pour le lendemain, elle se libere ; a l heure pile, elle tient ; une minute avant, elle se libere ; un jour ou une heure illisibles la gardent',
    ['2026-11-17 15:31', '2026-11-17 14:00', false, true, false, true, false, false, true],
    [minuteDePortoNovo(apresSesDeuxHeures), debutDuRendezVous(duJour), placeALiberer(duJour, apresSesDeuxHeures),
      placeALiberer({ ...duJour, date: '2026-11-18', time: '10:00' }, apresSesDeuxHeures),
      placeALiberer({ ...duJour, time: '15:31' }, apresSesDeuxHeures), placeALiberer({ ...duJour, time: '15:32' }, apresSesDeuxHeures),
      placeALiberer({ ...duJour, date: '17/11/2026' }, apresSesDeuxHeures), placeALiberer({ ...duJour, time: undefined }, apresSesDeuxHeures),
      estEnAttente(duJour)]);
  /* « ELLE A DIT OUI » AU COMPTOIR, AVEC UN ACOMPTE ENCORE DÛ (18 novembre 2026). */
  const auComptoir = { ...aVenir, depositXof: 6000, confirmeeParLaClienteLe: iso(T0 + 60_000), ouiNoteParLeComptoir: true };
  dit('A4c son oui note au comptoir : la place ne se libere pas, l acompte reste attendu ; son oui par WhatsApp sans l acompte, elle se libere a son echeance ; la marque seule, sans le oui, ne tient rien',
    [true, true, 'acompte', false, false, true, true],
    [ouiDuComptoir(auComptoir), estEnAttente(auComptoir), etatDeLAttente(auComptoir), placeALiberer(auComptoir, T0 + 9_000_000),
      ouiDuComptoir({ ...auComptoir, ouiNoteParLeComptoir: undefined }), placeALiberer({ ...auComptoir, ouiNoteParLeComptoir: undefined }, T0 + 9_000_000),
      placeALiberer({ ...aVenir, ouiNoteParLeComptoir: true }, T0 + 9_000_000)]);
  const oui = { ...tenue, ...marquesDuOui(tenue, T0 + 600_000) };
  dit('A5 son oui, sans acompte : ferme, plus en attente, plus suggeree ; l echeance ne bouge pas', [true, false, false, 'ferme', pose.attenduJusquAu],
    [estFerme(oui), estEnAttente(oui), estSuggere(oui), etatDeLAttente(oui), oui.attenduJusquAu]);
  const avecAcompte = { ...tenue, depositXof: 6000 };
  const ouiAcompte = { ...avecAcompte, ...marquesDuOui(avecAcompte, T0 + 7_100_000) };
  dit('A6 son oui, avec un acompte du : pas ferme, « acompte », et trente minutes au moins pour le regler', [false, true, 'acompte', iso(T0 + 7_100_000 + SURSIS_DE_L_ACOMPTE_MS), 6000],
    [estFerme(ouiAcompte), estEnAttente(ouiAcompte), etatDeLAttente(ouiAcompte), ouiAcompte.attenduJusquAu, acompteAttendu(ouiAcompte)]);
  dit('A7 l acompte recu apres son oui : ferme ; l acompte recu SANS son oui : pas ferme', [true, false],
    [estFerme({ ...ouiAcompte, depositConfirmed: true }), estFerme({ ...avecAcompte, depositConfirmed: true })]);
  const liberee = { ...tenue, ...marquesDeLaLiberation(T0 + 7_300_000) };
  dit('A8 liberee : annulee, sa marque, ni elle ni la Maison n ont annule', ['annulé', 'liberee', false, false],
    [liberee.status, etatDeLAttente(liberee), 'annuleePar' in liberee, estEnAttente(liberee)]);
  dit('A9 un rendez-vous d avant (aucune echeance), confirme ou suggere par la Maison, n est pas « en attente »', [false, null, false, null],
    [estEnAttente({ status: 'confirmé' }), etatDeLAttente({ status: 'confirmé' }), estEnAttente({ status: 'confirmé', suggereLe: iso(T0) } as never), etatDeLAttente({ status: 'confirmé', suggereLe: iso(T0) } as never)]);
  dit('A10 la cle du numero : 229 97…, 229 01 97…, 01 97…, 97…, +229 et 00229 sont une personne ; un numero francais reste lui-meme',
    ['22997000011', '22997000011', '22997000011', '22997000011', '22997000011', '22997000011', '33612345678'],
    [cleDuNumero('+22997000011'), cleDuNumero('+2290197000011'), cleDuNumero('0197000011'), cleDuNumero('97000011'), cleDuNumero('229 01 97 00 00 11'), cleDuNumero('0022997000011'), cleDuNumero('+33612345678')]);
  dit('A11 ses graphies en base : les deux plans du Benin, ou lui seul ailleurs', [['+2290197000011', '+22997000011'], ['+33612345678'], []],
    [formesDuNumero('+22997000011'), formesDuNumero('+33612345678'), formesDuNumero('')]);
  dit('A12 le plafond d un numero : trois en attente, cinq poses par jour ; sans attente, seul le jour compte',
    [3, 5, 12, 5, null, 'trop_en_attente', null, 'trop_de_demandes', 'trop_de_demandes'],
    [EN_ATTENTE_PAR_NUMERO, POSES_PAR_NUMERO_ET_PAR_JOUR, POSES_PAR_ADRESSE_ET_PAR_JOUR, MODELES_PAR_NUMERO_ET_PAR_JOUR,
      plafondDuNumero({ posesDuJour: 2, enAttente: 2, attente: true }), plafondDuNumero({ posesDuJour: 3, enAttente: 3, attente: true }),
      plafondDuNumero({ posesDuJour: 3, enAttente: 3, attente: false }), plafondDuNumero({ posesDuJour: 5, enAttente: 0, attente: false }),
      plafondDuNumero({ posesDuJour: 5, enAttente: 3, attente: true })]);
  dit('A13 la limite des deplacements : deux ; un rendez-vous deplace avant le compte en compte un', [2, [0, true], [1, true], [2, false], [1, true], [0, true]],
    [DEPLACEMENTS_AU_PLUS, [deplacementsFaits({}), peutEncoreSeDeplacer({})], [deplacementsFaits({ deplacements: 1 }), peutEncoreSeDeplacer({ deplacements: 1 })],
      [deplacementsFaits({ deplacements: 2 }), peutEncoreSeDeplacer({ deplacements: 2 })],
      [deplacementsFaits({ deplaceLe: iso(T0), deplacePar: 'site' }), peutEncoreSeDeplacer({ deplaceLe: iso(T0), deplacePar: 'site' })],
      [deplacementsFaits({ deplaceLe: iso(T0), deplacePar: 'trone' }), peutEncoreSeDeplacer({ deplaceLe: iso(T0), deplacePar: 'trone' })]]);
  const r = (o: Partial<Parameters<typeof remiseGardeeAuDeplacement>[0]>) => remiseGardeeAuDeplacement({ aUneRemise: true, memeJour: false, bienvenue: false, offreConnue: true, aPlaces: false, lieeAuJour: false, tombeBien: false, ...o });
  dit('A14 la remise au deplacement : sans remise ou le meme jour, rien ne change ; la bienvenue suit ; la saison suit ; le mercredi suit a un mercredi seulement ; une place limitee et une offre disparue ne suivent pas',
    [true, true, true, true, true, false, false, false],
    [r({ aUneRemise: false, offreConnue: false }), r({ memeJour: true, aPlaces: true }), r({ bienvenue: true, offreConnue: false }), r({}),
      r({ lieeAuJour: true, tombeBien: true }), r({ lieeAuJour: true, tombeBien: false }), r({ aPlaces: true, lieeAuJour: true, tombeBien: true }), r({ offreConnue: false })]);
  dit('A15 l acompte d un panier : chaque geste a son taux, zero sans taux, jamais sur un taux absurde', [6000, 0, 0, 13500],
    [acompteDesGestes([{ id: 'a', prixXof: 20000 }], { a: 30 }), acompteDesGestes([{ id: 'a', prixXof: 20000 }], {}),
      acompteDesGestes([{ id: 'a', prixXof: 20000 }], { a: 130 }), acompteDesGestes([{ id: 'a', prixXof: 20000 }, { id: 'b', prixXof: 15000 }], { a: 30, b: 50 })]);
  const g = (debutMin: number, openMin = 480, closeMin = 1230) => heureSurLaGrille({ openMin, closeMin, debutMin, premierMin: 510 });
  dit('A16 la grille : 08:30 puis l heure ; ni 08:00, ni 09:30, ni 14:17 ; le samedi (09:00) commence a 09:00', [true, true, false, false, false, true, false],
    [g(510), g(540), g(480), g(570), g(857), g(540, 540, 1200), g(510, 540, 1200)]);
  const bandes = [{ id: 'm', maxLocks: 150, durCoef: 1 }, { id: 'mi', maxLocks: 350, durCoef: 1.8 }, { id: 'g', maxLocks: null, durCoef: 2.8 }];
  const geste = { id: 'sv', categoryId: 'cat', durationMin: 120, scalesWithModel: true };
  const c = (o: object, s: object = geste) => dureeAuCalibre(s as never, { lockCount: 300, bandes, ...o } as never);
  dit('A17 la duree au calibre : le coefficient de sa tranche, au quart d heure ; rien sans calibre, sans interrupteur, pour un prix fixe, ou bareme suspendu ; le bareme de l atelier passe d abord',
    [210, 120, 120, 120, 120, 330, 120, 360],
    [c({}), c({ lockCount: 0 }), c({}, { ...geste, scalesWithModel: false }), c({}, { ...geste, id: 'sv-gbigbi-essentiel' }), c({ suspendu: true }),
      c({ lockCount: 900 }), c({ lockCount: 100 }),
      c({ sets: { atl: [{ maxLocks: null, durCoef: 3 }] }, categories: [{ id: 'cat', parentId: 'atl' }] })]);
  dit('A18 le catalogue au calibre ne touche que les durees qui changent', [[210, 60], true],
    [gestesAuCalibre([geste, { id: 'x', durationMin: 60 }], { lockCount: 300, bandes }).map((s) => s.durationMin),
      gestesAuCalibre([{ id: 'x', durationMin: 60 }], { lockCount: 300, bandes })[0] !== undefined]);
  const fam = [{ id: 'atl-ii-gbeji' }, { id: 'atl-iv-finfin' }, { id: 'cat-defaisage' }, { id: 'sup' }, { id: 'cat-x', parentId: 'atl-iv-finfin' }];
  const lues = (f: { id: string; parentId?: string }[]) => Object.fromEntries(famillesAvecLeDefaisage(f, ['atl-ii-gbeji', 'atl-iii-yekpe']).map((c) => [c.id, c.parentId ?? null]));
  dit('A18b le defaisage, pour la porte du site : son atelier a lui se lit sous un atelier qui se reserve ; range sous la restauration, il y reste ; aucune autre famille ne bouge ; sans atelier qui se reserve, rien',
    [['cat-defaisage', 'plt-45'], 'atl-ii-gbeji', 'atl-ii-gbeji', null, null, 'atl-iv-finfin', 'atl-iv-finfin', undefined],
    [[...ATELIERS_DU_DEFAISAGE], lues(fam)['cat-defaisage'], lues(fam)['plt-45'], lues(fam).sup, lues(fam)['atl-iv-finfin'], lues(fam)['cat-x'],
      lues([{ id: 'atl-ii-gbeji' }, { id: 'cat-defaisage', parentId: 'atl-iv-finfin' }])['cat-defaisage'],
      Object.fromEntries(famillesAvecLeDefaisage([{ id: 'cat-defaisage' }], ['atl-ii-gbeji']).map((c) => [c.id, c.parentId]))['cat-defaisage']]);
  const o = { appel: 'Mme Awa', quand: 'vendredi 20 novembre 2026 à 10 h', gestes: 'Lavage rituel' };
  dit('A19 le message de la place tenue : il dit la place tenue, les deux heures, et ne finit pas par une variable',
    'Bonjour Mme Awa, la Maison MND tient votre place le vendredi 20 novembre 2026 à 10 h : Lavage rituel. Répondez « Je confirme » dans les deux heures pour la garder ; sans réponse, la place se libère.',
    texteDeLAttente(o));
  const comp = composantsDeLAttente({ ...o, apptId: 'rdv-1' }) as any[];
  dit('A20 ses deux boutons sont ceux du rendez-vous suggere, dans cet ordre, et trois variables', [3, 'REPRISE_OK:rdv-1', 'REPRISE_AUTRE:rdv-1', 'rdv_a_confirmer'],
    [comp[0].parameters.length, comp[1].parameters[0].payload, comp[2].parameters[0].payload, MODELE_DE_L_ATTENTE]);
  dit('A21 les reponses : confirme avec sa reference et son lien ; l acompte et jusqu a quand ; la place liberee et ou en reprendre une ; un autre moment',
    [true, true, true, true],
    [/C’est confirmé, Mme Awa/.test(texteDuOui({ appel: 'Mme Awa', quand: o.quand, reference: 'MND-7K3Q', lien: 'https://x/rdv/?v=j' })) && /MND-7K3Q/.test(texteDuOui({ appel: 'Mme Awa', quand: o.quand, reference: 'MND-7K3Q', lien: 'https://x/rdv/?v=j' })),
      /acompte de 6 000 F/.test(texteDeLAcompte({ appel: 'Mme Awa', quand: o.quand, acompte: '6 000 F', jusqua: '12 h 30', lien: 'https://x' })) && /jusqu’à 12 h 30/.test(texteDeLAcompte({ appel: 'Mme Awa', quand: o.quand, acompte: '6 000 F', jusqua: '12 h 30', lien: 'https://x' })),
      /elle s’est libérée/.test(texteDeLaPlaceLiberee({ appel: 'Mme Awa', quand: o.quand, lien: 'https://x/reserver/' })) && /reserver/.test(texteDeLaPlaceLiberee({ appel: 'Mme Awa', quand: o.quand, lien: 'https://x/reserver/' })),
      /La place est rendue/.test(texteDeLAutreMoment({ appel: 'Mme Awa', lien: 'https://x/reserver/' }))]);
  const court = (j: string) => ({ '2026-11-17': '17 nov. 2026' } as Record<string, string>)[j] ?? j;
  const francs = (x: number) => `${x} F`;
  dit('A22 le Carnet le dit : en attente et jusqu a quand ; son oui et l acompte attendu ; confirme par elle ; la place liberee ; rien pour un rendez-vous d avant',
    ['En attente de son oui · la place se libère à 12 h', 'Elle a dit oui · acompte de 6000 F attendu · jusqu’à 12 h 28', 'Pris en ligne, confirmé par elle le 17 nov. 2026',
      'Place libérée le 17 nov. 2026 : pas de confirmation sous deux heures', 'Place rendue le 17 nov. 2026 : elle a demandé un autre moment', '', '12 h'],
    [ceQueDitLAttente(tenue, { court, francs }), ceQueDitLAttente(ouiAcompte, { court, francs }), ceQueDitLAttente(oui, { court, francs }),
      ceQueDitLAttente(liberee, { court, francs }), ceQueDitLAttente({ ...liberee, autreMomentDemandeLe: iso(T0) }, { court, francs }),
      ceQueDitLAttente({ status: 'confirmé' }, { court, francs }), heureDeCotonouDite(pose.attenduJusquAu)]);
  dit('A22b le Carnet ne promet pas une liberation qui n aura pas lieu : ni l heure d une place qui commence avant son echeance, ni celle d une place dont le comptoir a note le oui ; une place du lendemain la dit',
    ['En attente de son oui', 'Elle a dit oui · acompte de 6000 F attendu', 'En attente de son oui · la place se libère à 15 h 30'],
    [ceQueDitLAttente(duJour, { court, francs }), ceQueDitLAttente(auComptoir, { court, francs }), ceQueDitLAttente({ ...duJour, date: '2026-11-18' }, { court, francs })]);
  const troisPlaces = [
    { quand: 'vendredi 20 novembre 2026 à 10 h', reference: 'MND-AAA2', lien: 'https://x/rdv/?v=a' },
    { quand: 'vendredi 20 novembre 2026 à 12 h', reference: 'MND-BBB3', lien: 'https://x/rdv/?v=b' },
    { quand: 'vendredi 20 novembre 2026 à 14 h', reference: 'MND-CCC4', lien: '' },
  ];
  const ouis = texteDesOuis({ appel: 'Mme Awa', places: troisPlaces });
  const mele = texteDesOuis({ appel: 'Mme Awa', places: [troisPlaces[0], { ...troisPlaces[1], acompte: '6 000 F', jusqua: '12 h 30' }] });
  dit('A24 « Je confirme » ecrit pour trois places : la phrase dit combien, et chacune sur sa ligne, avec sa reference et son lien ; une place dont l acompte reste du le dit',
    [true, 3, true, true, true, false, true, true, true],
    [ouis.startsWith('C’est confirmé, Mme Awa : vos trois rendez-vous.'), ouis.split('\n').filter((l) => l.startsWith('· ')).length,
      ['MND-AAA2', 'MND-BBB3', 'MND-CCC4'].every((r) => ouis.includes(r)), ouis.includes('https://x/rdv/?v=b'), ouis.endsWith('La Maison vous attend.'),
      mele.startsWith('C’est confirmé'), mele.startsWith('Merci Mme Awa, votre oui est noté pour vos deux rendez-vous.'),
      mele.includes('il reste l’acompte de 6 000 F'), mele.includes('place tenue jusqu’à 12 h 30')]);
  dit('A23 Ma Couronne relit la reponse de la Maison : posee (ferme ou non), place prise, place limitee partie, refusee ; tout le reste est une fonction injoignable',
    ['pose', true, 'pose', false, 'prise', 'place-partie', 'refusee', 'injoignable', 'injoignable', 'injoignable'],
    [reponseDeLaMaisonLue({ ok: true, etat: 'confirme', rdvs: [{ id: 'rdv-1', date: '2026-11-20', time: '10:00', status: 'confirmé' }] }).etat,
      (reponseDeLaMaisonLue({ ok: true, etat: 'confirme', rdvs: [{ id: 'rdv-1', date: '2026-11-20', time: '10:00', status: 'confirmé' }] }) as any).ferme,
      reponseDeLaMaisonLue({ ok: true, etat: 'en-attente', rdvs: [{ id: 'rdv-1', date: '2026-11-20', time: '10:00', status: 'en attente' }] }).etat,
      (reponseDeLaMaisonLue({ ok: true, etat: 'en-attente', rdvs: [] }) as any).ferme,
      (reponseDeLaMaisonLue({ ok: false, error: 'creneau_pris' }) as any).raison, (reponseDeLaMaisonLue({ ok: false, error: 'places_limitees' }) as any).raison,
      (reponseDeLaMaisonLue({ ok: false, error: 'tete' }) as any).raison, reponseDeLaMaisonLue({ error: 'consentement' }).etat,
      reponseDeLaMaisonLue(null).etat, reponseDeLaMaisonLue({ ok: true, etat: 'confirme', rdvs: [{ id: 'rdv-1' }] }).etat]);
}

/* ══ B. LA VRAIE FONCTION, CONTRE UNE BASE SIMULÉE ══════════════════════════ */
type Ligne = Record<string, any>;
const TABLES: Record<string, Ligne[]> = {};
const table = (t: string): Ligne[] => (TABLES[t] ??= []);
const cleDe = (t: string): string => (t === 'documents' ? 'key' : 'id');
let TIC = 0;
let SEQ = 0;
let ENTRE_DEUX: ((t: string) => void) | null = null;
function valeur(l: Ligne, col: string): unknown {
  const m = /^data((?:->[A-Za-z0-9_]+)*)->>([A-Za-z0-9_]+)$/.exec(col);
  if (!m) return l[col];
  let v: any = l.data;
  for (const k of m[1].split('->').filter(Boolean)) v = v?.[k];
  v = v?.[m[2]];
  return v === undefined || v === null ? null : typeof v === 'object' ? JSON.stringify(v) : String(v);
}
function projette(l: Ligne, cols: string): Ligne {
  if (!cols || cols.trim() === '*') return structuredClone(l);
  const r: Ligne = {};
  for (const brut of cols.split(',').map((c) => c.trim()).filter(Boolean)) {
    const [alias, chemin] = brut.includes(':') ? brut.split(':') : [brut.replace(/^data->>/, ''), brut];
    r[alias] = structuredClone(valeur(l, chemin));
  }
  return r;
}
class Requete {
  private filtres: ((l: Ligne) => boolean)[] = [];
  private mode: 'select' | 'update' | 'upsert' | 'insert' | 'delete' = 'select';
  private cols = '*';
  private rendre = false;
  private tete = false;
  private plafond = Infinity;
  private tri: [string, boolean] | null = null;
  private seule: 'non' | 'peut-etre' = 'non';
  private charge: any = null;
  private options: any = {};
  constructor(private t: string) {}
  select(cols = '*', o: { count?: string; head?: boolean } = {}) {
    if (this.mode === 'select') { this.cols = cols; this.tete = !!o.head; } else { this.rendre = true; this.cols = cols; }
    return this;
  }
  eq(c: string, v: unknown) { this.filtres.push((l) => String(valeur(l, c)) === String(v)); return this; }
  neq(c: string, v: unknown) { this.filtres.push((l) => String(valeur(l, c)) !== String(v)); return this; }
  gt(c: string, v: unknown) { this.filtres.push((l) => String(valeur(l, c) ?? '') > String(v)); return this; }
  gte(c: string, v: unknown) { this.filtres.push((l) => String(valeur(l, c) ?? '') >= String(v)); return this; }
  lte(c: string, v: unknown) { this.filtres.push((l) => String(valeur(l, c) ?? '') <= String(v)); return this; }
  in(c: string, vs: unknown[]) { const s = new Set(vs.map(String)); this.filtres.push((l) => s.has(String(valeur(l, c)))); return this; }
  limit(k: number) { this.plafond = k; return this; }
  order(c: string, o: { ascending?: boolean } = {}) { this.tri = [c, o.ascending !== false]; return this; }
  maybeSingle() { this.seule = 'peut-etre'; return this; }
  update(d: any) { this.mode = 'update'; this.charge = d; return this; }
  delete() { this.mode = 'delete'; return this; }
  upsert(d: any, o: any = {}) { this.mode = 'upsert'; this.charge = d; this.options = o; return this; }
  insert(d: any) { this.mode = 'insert'; this.charge = d; return this; }
  private execute(): { data: any; error: any; count?: number } {
    /* Une autre écriture qui passe entre la lecture et la mise à jour (une fois). */
    if (this.mode === 'update' && ENTRE_DEUX) { const f = ENTRE_DEUX; ENTRE_DEUX = null; f(this.t); }
    const lignes = table(this.t);
    const cle = this.options.onConflict ?? cleDe(this.t);
    if (this.mode === 'insert' || this.mode === 'upsert') {
      const faites: Ligne[] = [];
      for (const brut of ([] as any[]).concat(this.charge)) {
        const l: Ligne = { at: new Date().toISOString(), updated_at: `t${++TIC}`, ...structuredClone(brut) };
        if (l.id === undefined && this.t !== 'documents') l.id = ++SEQ;
        const i = lignes.findIndex((x) => x[cle] !== undefined && x[cle] === l[cle]);
        if (i >= 0 && this.mode === 'upsert') { if (this.options.ignoreDuplicates) continue; lignes[i] = l; } else lignes.push(l);
        faites.push(l);
      }
      return { data: this.rendre ? faites.map((l) => projette(l, this.cols)) : null, error: null };
    }
    let vues = lignes.filter((l) => this.filtres.every((f) => f(l)));
    if (this.mode === 'update') {
      for (const l of vues) { Object.assign(l, structuredClone(this.charge)); l.updated_at = `t${++TIC}`; }
      return { data: this.rendre ? vues.map((l) => projette(l, this.cols)) : null, error: null };
    }
    if (this.mode === 'delete') {
      for (const l of vues) lignes.splice(lignes.indexOf(l), 1);
      return { data: null, error: null };
    }
    if (this.tri) { const [c, asc] = this.tri; vues = [...vues].sort((a, b) => String(valeur(a, c)).localeCompare(String(valeur(b, c)), undefined, { numeric: true }) * (asc ? 1 : -1)); }
    const compte = vues.length;
    vues = vues.slice(0, this.plafond);
    if (this.tete) return { data: null, error: null, count: compte };
    const data = vues.map((l) => projette(l, this.cols));
    if (this.seule !== 'non') return { data: data[0] ?? null, error: null };
    return { data, error: null, count: compte };
  }
  then(ok: (r: any) => unknown, ko2?: (e: unknown) => unknown) {
    try { return Promise.resolve(this.execute()).then(ok, ko2); } catch (e) { return Promise.reject(e).then(ok, ko2); }
  }
}

/* ── La base, côté fonctions : ce que 0222 pose, rejoué ici mot pour mot avec la règle pure. ── */
const DEBIT: { seau: string; cle: string; at: number }[] = [];
let VOLEE: string | null = null;
const minutes = (t: string): number => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const RPC: Record<string, (a: any) => unknown> = {
  debit_permis: ({ p_seau, p_cle, p_plafond, p_minutes }) => {
    const depuis = T0 - p_minutes * 60_000;
    if (DEBIT.filter((x) => x.seau === p_seau && x.cle === p_cle && x.at >= depuis).length >= p_plafond) return false;
    DEBIT.push({ seau: p_seau, cle: p_cle, at: T0 });
    return true;
  },
  plafond_des_poses: ({ p_cle }) => {
    const siens = table('appointments').filter((l) => l.data.cleDuNumero === p_cle);
    return {
      posesDuJour: siens.filter((l) => String(l.data.creeLe) >= iso(T0 - 86_400_000)).length,
      enAttente: siens.filter((l) => estEnAttente(l.data) && String(l.data.attenduJusquAu) > iso(T0)).length,
    };
  },
  creneaux_occupes: ({ p_branch, p_du, p_au }) => table('appointments')
    .filter((l) => l.branch_id === p_branch && l.data.status !== 'annulé' && l.data.date >= p_du && l.data.date <= p_au)
    .map((l) => ({ jour: l.data.date, maitre: l.data.master ?? '', debut: l.data.time, duree: l.data.dureeMin ?? 60 })),
  places_en_ligne: () => 1,
  places_de_la_remise: () => [],
  /* `pose_si_libre` (0222) : jamais avant 08:30, le plafond du numéro rejoué, une place en ligne par heure.
     `VOLEE` : un jour où une autre porte prend la place au même instant (entre la lecture et le verrou). */
  pose_si_libre: ({ p_rdv, p_maitres }) => {
    if (VOLEE && p_rdv.date === VOLEE) {
      table('appointments').push({ id: `rdv-vole-${++SEQ}`, branch_id: p_rdv.branchId, updated_at: `t${++TIC}`, data: { id: 'vole', branchId: p_rdv.branchId, date: p_rdv.date, time: p_rdv.time, status: 'confirmé', dureeMin: 60, master: '' } });
      VOLEE = null;
    }
    const debut = minutes(p_rdv.time);
    if (debut < 510) return { ok: false, raison: 'creneau_hors_ouverture' };
    if (p_rdv.cleDuNumero) {
      const c = RPC.plafond_des_poses({ p_cle: p_rdv.cleDuNumero }) as { posesDuJour: number; enAttente: number };
      if (c.posesDuJour >= 5) return { ok: false, raison: 'trop_de_demandes' };
      if (p_rdv.attenduJusquAu && c.enAttente >= 3) return { ok: false, raison: 'trop_en_attente' };
    }
    const duree = p_rdv.dureeMin ?? 60;
    const dessus = table('appointments').filter((l) => l.branch_id === p_rdv.branchId && l.data.date === p_rdv.date && l.data.status !== 'annulé'
      && debut < minutes(l.data.time) + (l.data.dureeMin ?? 60) && debut + duree > minutes(l.data.time));
    if (dessus.length >= 1) return { ok: false, raison: 'creneau_pris' };
    const master = (p_maitres ?? [])[0] ?? '';
    table('appointments').push({ id: p_rdv.id, branch_id: p_rdv.branchId, updated_at: `t${++TIC}`, data: { ...structuredClone(p_rdv), master } });
    return { ok: true, verdict: 'pose', id: p_rdv.id, master, dureeMin: duree };
  },
};
/** `libere_les_places_en_attente` (0222) : ce que le cron fait toutes les cinq minutes. */
const libere = (): number => {
  let combien = 0;
  for (const l of table('appointments')) {
    if (!placeALiberer(l.data, T0)) continue;
    l.data = { ...l.data, ...marquesDeLaLiberation(T0) };
    l.updated_at = `t${++TIC}`;
    for (const d of table('demandes').filter((x) => x.data?.apptId === l.id)) { const { codeApplique: _c, ...reste } = d.data; d.data = reste; }
    combien += 1;
  }
  return combien;
};
const client = {
  from: (t: string) => new Requete(t),
  rpc: async (nom: string, args: unknown) => (RPC[nom] ? { data: RPC[nom](args), error: null } : { data: null, error: { message: 'rpc absente du banc' } }),
  auth: {
    /* Awa : son compte porte l'identifiant de sa fiche. Béa : la Maison l'a inscrite avant son compte, sa fiche porte son compte (`authUserId`). */
    getUser: async (jeton: string) => (jeton === 'session-de-awa' ? { data: { user: { id: 'cl-awa' } }, error: null }
      : jeton === 'session-de-bea' ? { data: { user: { id: 'uid-de-bea' } }, error: null }
        : { data: { user: null }, error: { message: 'session inconnue' } }),
  },
  storage: { from: () => ({}) },
};

const ENV: Record<string, string | undefined> = {
  SUPABASE_URL: 'http://faux.local', SUPABASE_SERVICE_ROLE_KEY: 'le-secret-de-la-plateforme', CLE_SERVICE: 'la-cle-de-la-maison',
  WA_TOKEN: 'jeton-meta-de-banc', WA_PHONE_ID: '1234',
};
const SERVIS: ((req: Request) => Promise<Response>)[] = [];
const EN_FOND: Promise<unknown>[] = [];
const META: { modele?: string; composants: any[]; to: string; texte?: string }[] = [];
let REPONSES_META: { status: number; corps: unknown }[] = [];
(globalThis as any).__faux = { client: () => client };
(globalThis as any).Deno = { env: { get: (k: string) => ENV[k] }, serve: (h: any) => { SERVIS.push(h); } };
(globalThis as any).EdgeRuntime = { waitUntil: (p: Promise<unknown>) => { EN_FOND.push(p); } };
let numeroWa = 0;
(globalThis as any).fetch = async (url: string, init?: { body?: string }) => {
  if (String(url).includes('graph.facebook.com')) {
    const corps = JSON.parse(String(init?.body ?? '{}'));
    META.push({ modele: corps.template?.name, composants: corps.template?.components ?? [], to: corps.to, texte: corps.text?.body });
    const r = REPONSES_META.shift() ?? { status: 200, corps: { messages: [{ id: `wamid.banc${++numeroWa}` }] } };
    return new Response(JSON.stringify(r.corps), { status: r.status });
  }
  return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
};
console.error = () => {};
console.log = ((journal) => (...a: unknown[]) => { if (!String(a[0] ?? '').startsWith('demande-submit')) journal(...a); })(console.log);
const attendsLeFond = async () => { while (EN_FOND.length) await Promise.allSettled(EN_FOND.splice(0)); };

/* ── Les fixtures : la Maison, ses heures, ses gestes, son barème (tout est inventé). ── */
const HEURES = ['mar', 'mer', 'jeu', 'ven'].map((key) => ({ key, open: '08h00', close: '20h30', closed: false }))
  .concat([{ key: 'sam', open: '09h00', close: '20h00', closed: false }])
  .concat(['dim', 'lun'].map((key) => ({ key, open: '09h00', close: '19h00', closed: true })));
table('branches').push({ id: 'br-1', data: { masters: ['Team', 'Expert'], flagship: true, seats: 2 } });
table('documents').push(
  { key: 'mnd_settings', data: { hours: HEURES, depositPctByService: {} } },
  { key: 'mnd_horaires_exceptions', data: [] },
  { key: 'mnd_vitrine_config', data: {} },
  { key: 'mnd_offers', data: [{ id: 'of-rentree', active: true, code: 'RENTREE10', discountPct: 10, serviceIds: ['sv-lavage'] }] },
  { key: 'mnd_model_bands', data: [{ id: 'm', name: 'Medium', maxLocks: 150, coef: 1, durCoef: 1 }, { id: 'mi', name: 'Micro', maxLocks: 350, coef: 1.8, durCoef: 1.8 }] },
  { key: 'mnd_model_band_sets', data: {} },
);
table('catalog_categories').push({ id: 'atl-ii-gbeji', data: {} }, { id: 'atl-i-vekpe', data: {} }, { id: 'atl-iv-finfin', data: {} }, { id: 'cat-defaisage', data: {} }, { id: 'sup', data: {} });
table('catalog_services').push(
  { id: 'sv-lavage', data: { name: 'Lavage rituel', categoryId: 'atl-ii-gbeji', durationMin: 60, priceXof: 20000 } },
  { id: 'sv-racines', data: { name: 'Reprise des racines', categoryId: 'atl-ii-gbeji', durationMin: 120, priceXof: 25000, scalesWithModel: true } },
  { id: 'sv-creation', data: { name: 'Création', categoryId: 'atl-i-vekpe', durationMin: 240, priceXof: 150000 } },
  /* Le défaisage, comme au catalogue en ligne le 17 novembre 2026 : un atelier à lui, « consultation avant » cochée. */
  { id: 'sv-gbata', data: { name: 'GBÀTÀ™ Essentiel · Le Défaisage', categoryId: 'cat-defaisage', durationMin: 300, priceXof: 80000, priceMode: 'variable', consultationAvant: true } },
  { id: 'sv-renais', data: { name: 'Restauration', categoryId: 'atl-iv-finfin', durationMin: 120, priceXof: 60000 } },
  { id: 'sv-sup', data: { name: 'Supplément', categoryId: 'sup', durationMin: 60, priceXof: 5000 } },
);
table('services').push({ id: 'sv-lavage', data: { name: 'Lavage rituel' } }, { id: 'sv-racines', data: { name: 'Reprise des racines' } });
table('clients').push(
  { id: 'cl-awa', branch_id: 'br-1', data: { name: 'Awa EXEMPLE', civilite: 'madame', phone: '+2290197000090', lockCount: 300 } },
  { id: 'cl-autre', branch_id: 'br-1', data: { name: 'Autre EXEMPLE', phone: '+2290197000091' } },
  /* La fiche que la Maison a inscrite avant le compte de Béa, adoptée depuis : son identifiant n'est pas celui du compte. */
  { id: 'cl-bea', branch_id: 'br-1', data: { name: 'Bea EXEMPLE', phone: '+2290197000092', authUserId: 'uid-de-bea', familyId: 'fam-bea' } },
  { id: 'cl-enfant-bea', branch_id: 'br-1', data: { name: 'Enfant EXEMPLE', birthday: '2016-05-01', familyId: 'fam-bea' } },
  { id: 'cl-grande-bea', branch_id: 'br-1', data: { name: 'Grande EXEMPLE', birthday: '1990-01-01', familyId: 'fam-bea' } },
  { id: 'cl-enfant-awa', branch_id: 'br-1', data: { name: 'Petit EXEMPLE', birthday: '2018-03-01', familyId: 'fam-awa' } },
  { id: 'cl-grand-awa', branch_id: 'br-1', data: { name: 'Grand EXEMPLE', birthday: '1995-03-01', familyId: 'fam-awa' } },
);
/* Béa paie le compte famille par sa fiche ; Awa, par l'identifiant de son compte. */
table('families').push({ id: 'fam-bea', data: { payerClientId: 'cl-bea' } }, { id: 'fam-awa', data: { payerClientId: 'cl-awa' } });

const demande = await import('../supabase/functions/demande-submit/index.ts') as any;
const [servir] = SERVIS;
let ipN = 0;
const ipNeuve = (): string => `10.${Math.floor(++ipN / 250) + 1}.${ipN % 250}.1`;
const appelle = async (corps: unknown, o: { ip?: string; cle?: string } = {}) => {
  const r = await servir(new Request('http://faux.local/functions/v1/demande-submit', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': o.ip ?? ipNeuve(), ...(o.cle ? { authorization: `Bearer ${o.cle}` } : {}) },
    body: JSON.stringify(corps),
  }));
  return { statut: r.status, corps: await r.json() as any };
};
const depot = (plus: Record<string, unknown> = {}, o: { ip?: string } = {}) => appelle({
  genre: 'rdv',
  data: { prenom: 'Awa', civilite: 'madame', telephone: '0197000011', dial: '+229', besoin: 'entretien', serviceIds: ['sv-lavage'], date: '2026-11-20', time: '10:00', consentement: true, ...plus },
}, o);
const rdvDe = (id: string): any => structuredClone(table('appointments').find((l) => l.id === id)?.data ?? null);
const envoi = (id: string): any => table('envois').find((e) => e.id === id)?.data;
const SERVICE = 'la-cle-de-la-maison';
const approuve = (etat = 'APPROVED') => {
  const i = table('documents').findIndex((d) => d.key === 'mnd_modeles_meta');
  if (i >= 0) table('documents').splice(i, 1);
  table('documents').push({ key: 'mnd_modeles_meta', data: { lusLe: iso(T0), modeles: [{ id: '1', nom: 'rdv_a_confirmer', etat }] } });
};

/* B1. SANS LE MODÈLE, RIEN NE CHANGE. */
{
  const r = await depot();
  await attendsLeFond();
  const a = rdvDe(r.corps.apptId);
  dit('B1 sans le secret du modele : la place nait confirmee comme avant, l ancienne confirmation part, et la reponse dit « confirme »',
    [200, 'confirme', true, referenceDuRendezVous(r.corps.apptId), 'confirmé', false, false, '22997000011', 'confirmation_rdv', false],
    [r.statut, r.corps.etat, r.corps.confirme, r.corps.reference, a?.status, 'attenduJusquAu' in a, 'suggereLe' in a, a?.cleDuNumero, META[0]?.modele, estEnAttente(a)]);
  ENV.WA_TEMPLATE_ATTENTE = 'rdv_a_confirmer';
  META.length = 0;
  const r2 = await depot({ telephone: '0197000012', date: '2026-11-20', time: '12:00' });
  approuve('PENDING');
  const r3 = await depot({ telephone: '0197000013', date: '2026-11-20', time: '14:00' });
  await attendsLeFond();
  dit('B2 le secret pose mais le modele pas encore lu « APPROVED » au Trone (absent, puis en revue) : toujours confirmee, jamais le modele de l attente',
    ['confirme', 'confirme', false, false, ['confirmation_rdv', 'confirmation_rdv']],
    [r2.corps.etat, r3.corps.etat, estEnAttente(rdvDe(r2.corps.apptId)), estEnAttente(rdvDe(r3.corps.apptId)), META.map((m) => m.modele)]);
}

/* B3. LA BASCULE : EN ATTENTE. */
approuve();
META.length = 0;
const b3 = await depot({ telephone: '0197000021', date: '2026-11-21', time: '10:00', cle: 'cle-du-depot-de-awa-0001' });
await attendsLeFond();
const idB3 = b3.corps.apptId as string;
{
  const a = rdvDe(idB3);
  dit('B3 le modele approuve : la place nait EN ATTENTE, tenue deux heures ; la reponse le dit, sans « confirme »',
    [200, 'en-attente', false, iso(T0 + DELAI_DE_L_ATTENTE_MS), referenceDuRendezVous(idB3), 'envoyé'],
    [b3.statut, b3.corps.etat, 'confirme' in b3.corps, b3.corps.attenduJusquAu, b3.corps.reference, b3.corps.accuse]);
  dit('B4 sur le rendez-vous : statut confirme (la place est tenue partout), ses deux marques, la cle du numero ; en attente, suggere pour les rappels',
    ['confirmé', iso(T0), iso(T0 + DELAI_DE_L_ATTENTE_MS), '22997000021', 'site', true, true, true],
    [a.status, a.suggereLe, a.attenduJusquAu, a.cleDuNumero, a.source, estEnAttente(a), estSuggere(a), rappelDeLaVeilleSeTait(a)]);
  const boutons = (META[0]?.composants ?? []).filter((c: any) => c.type === 'button').map((c: any) => c.parameters[0].payload);
  dit('B5 UN message : le modele de l attente, trois variables, « Je confirme » puis « Un autre moment », au numero tape',
    [1, 'rdv_a_confirmer', 3, [`REPRISE_OK:${idB3}`, `REPRISE_AUTRE:${idB3}`], '2290197000021'],
    [META.length, META[0]?.modele, META[0]?.composants?.[0]?.parameters?.length, boutons, META[0]?.to]);
  dit('B6 le journal : sa ligne att-…, du genre « proposition », envoyee ; AUCUNE ligne de confirmation tant qu elle n a pas dit oui',
    ['proposition', 'envoyé', true, 'rdv_a_confirmer', undefined],
    [envoi(`att-${idB3}-whatsapp`)?.type, envoi(`att-${idB3}-whatsapp`)?.statut, envoi(`att-${idB3}-whatsapp`)?.attente, envoi(`att-${idB3}-whatsapp`)?.modele, envoi(`conf-${idB3}-whatsapp`)]);
}

/* B7. SA RÉPONSE, RENDUE PAR LE WEBHOOK. */
{
  const sansCle = await appelle({ attente: 'reponse', rdv: idB3, geste: 'ok', numero: '22997000021' });
  const mauvaiseCle = await appelle({ attente: 'reponse', rdv: idB3, geste: 'ok', numero: '22997000021' }, { cle: 'une-cle-publique' });
  const etranger = await appelle({ attente: 'reponse', rdv: idB3, geste: 'ok', numero: '22997000099' }, { cle: SERVICE });
  dit('B7 la porte de la reponse ne s ouvre qu a la cle service ; un autre numero ne confirme pas pour elle', [401, 401, { pris: true, etat: 'numero-etranger' }, false],
    [sansCle.statut, mauvaiseCle.statut, etranger.corps, 'confirmeeParLaClienteLe' in rdvDe(idB3)]);
  META.length = 0;
  T0 += 10 * 60_000;
  /* Meta livre l'ancienne forme à huit chiffres : la clé la reconnaît. */
  const oui = await appelle({ attente: 'reponse', rdv: idB3, geste: 'ok', numero: '22997000021' }, { cle: SERVICE });
  await attendsLeFond();
  const a = rdvDe(idB3);
  dit('B8 « Je confirme », de son numero (livre a huit chiffres) : ferme ; son oui est date, la relance eteinte',
    [{ pris: true, etat: 'ferme' }, iso(T0), true, true, false, 'confirmé'],
    [oui.corps, a.confirmeeParLaClienteLe, a.relanceFaite, estFerme(a), estEnAttente(a), a.status]);
  dit('B9 elle recoit, en une phrase et sans modele : c est confirme, sa reference, le lien de son rendez-vous',
    [1, undefined, '22997000021', true, true, true],
    [META.length, META[0]?.modele, META[0]?.to, /C’est confirmé, Mme Awa/.test(META[0]?.texte ?? ''), (META[0]?.texte ?? '').includes(referenceDuRendezVous(idB3)), /\/rdv\/\?v=/.test(META[0]?.texte ?? '')]);
  dit('B10 la confirmation est inscrite (conf-…-whatsapp, envoyee) : le balayage ne la redira pas ; le fil garde la phrase',
    ['confirmation', 'envoyé', true],
    [envoi(`conf-${idB3}-whatsapp`)?.type, envoi(`conf-${idB3}-whatsapp`)?.statut, table('messages_wa').some((m) => m.data?.auto === 'attente-ok' && m.data?.numero === '22997000021')]);
  META.length = 0;
  const encore = await appelle({ attente: 'reponse', rdv: idB3, geste: 'ok', numero: '22997000021' }, { cle: SERVICE });
  dit('B11 un second « Je confirme » ne dit rien de plus', [{ pris: true, etat: 'ferme' }, 0], [encore.corps, META.length]);
  const pasNe = await appelle({ attente: 'reponse', rdv: (table('appointments')[0] as Ligne).id, geste: 'ok', numero: '22997000011' }, { cle: SERVICE });
  dit('B12 un rendez-vous qui n est pas ne en attente (une vraie suggestion, un rendez-vous d avant) : le webhook garde la main', { pris: false }, pasNe.corps);
}

/* B13. LES DEUX HEURES. */
{
  const r = await depot({ telephone: '0197000031', date: '2026-11-21', time: '12:00', cle: 'cle-du-depot-de-bea-0001', code: 'RENTREE10' });
  await attendsLeFond();
  const id = r.corps.apptId as string;
  T0 += DELAI_DE_L_ATTENTE_MS - 60_000;
  const avant = libere();
  dit('B13 a 1 h 59, rien ne se libere : la place est toujours la sienne', [0, 'confirmé', true], [avant, rdvDe(id).status, estEnAttente(rdvDe(id))]);
  T0 += 2 * 60_000;
  const apres = libere();
  const a = rdvDe(id);
  dit('B14 passe deux heures sans son oui, la place se libere seule : annule, « place liberee », ni elle ni la Maison ne l ont annule',
    [1, 'annulé', iso(T0), false, 'liberee'], [apres, a.status, a.placeLibereeLe, 'annuleePar' in a, etatDeLAttente(a)]);
  dit('B15 la place confirmee plus tot (B8) n a pas bouge', ['confirmé', false], [rdvDe(idB3).status, 'placeLibereeLe' in rdvDe(idB3)]);
  dit('B16 le code de l offre qu elle portait ne compte pas pour une fois', false, 'codeApplique' in (table('demandes').find((d) => d.data?.apptId === id)?.data ?? {}));
  META.length = 0;
  const tard = await appelle({ attente: 'reponse', rdv: id, geste: 'ok', numero: '22997000031' }, { cle: SERVICE });
  await attendsLeFond();
  dit('B17 son « Je confirme » arrive apres : on lui dit que la place s est liberee, et ou en reprendre une ; rien ne se rouvre',
    [{ pris: true, etat: 'liberee' }, true, true, 'annulé'],
    [tard.corps, /elle s’est libérée/.test(META[0]?.texte ?? ''), /\/reserver\//.test(META[0]?.texte ?? ''), rdvDe(id).status]);
  const encore = await depot({ telephone: '0197000031', date: '2026-11-21', time: '12:00', cle: 'cle-du-depot-de-bea-0002', code: 'RENTREE10' });
  await attendsLeFond();
  dit('B18 la meme place se reprend : une place liberee n est plus un doublon, et son code vaut encore', [true, 'en-attente', true, true, false],
    [encore.corps.ok, encore.corps.etat, !!encore.corps.apptId && encore.corps.apptId !== id, encore.corps.codeApplique, 'deja' in encore.corps]);
}

/* B19. « UN AUTRE MOMENT ». */
{
  const r = await depot({ telephone: '0197000041', date: '2026-11-21', time: '14:00' });
  await attendsLeFond();
  const id = r.corps.apptId as string;
  META.length = 0;
  const autre = await appelle({ attente: 'reponse', rdv: id, geste: 'autre', numero: '2290197000041' }, { cle: SERVICE });
  await attendsLeFond();
  const a = rdvDe(id);
  dit('B19 « Un autre moment » : la place est rendue tout de suite, par elle ; elle recoit le lien pour en choisir une autre',
    [{ pris: true, etat: 'liberee' }, 'annulé', 'cliente', true, true, true],
    [autre.corps, a.status, a.annuleePar, !!a.placeLibereeLe && !!a.autreMomentDemandeLe, /La place est rendue/.test(META[0]?.texte ?? ''), /\/reserver\//.test(META[0]?.texte ?? '')]);
}

/* B20. L'ACOMPTE. */
{
  (table('documents').find((d) => d.key === 'mnd_settings') as Ligne).data.depositPctByService = { 'sv-lavage': 30 };
  const r = await depot({ telephone: '0197000051', date: '2026-11-24', time: '10:00' });
  await attendsLeFond();
  const id = r.corps.apptId as string;
  dit('B20 un geste qui porte un acompte dans Parametres : le rendez-vous le porte, la reponse le dit', [6000, 6000, 'en-attente'], [rdvDe(id).depositXof, r.corps.acompteXof, r.corps.etat]);
  META.length = 0;
  T0 += 110 * 60_000;
  const oui = await appelle({ attente: 'reponse', rdv: id, geste: 'ok', numero: '22997000051' }, { cle: SERVICE });
  await attendsLeFond();
  const a = rdvDe(id);
  dit('B21 son oui ne suffit pas : pas ferme, « acompte » ; la place se tient trente minutes de plus au moins ; elle recoit le montant, l heure et le lien ; aucune confirmation inscrite',
    [{ pris: true, etat: 'acompte' }, false, true, iso(T0 + SURSIS_DE_L_ACOMPTE_MS), true, true, undefined],
    [oui.corps, estFerme(a), estEnAttente(a), a.attenduJusquAu, /acompte de 6 000 F/.test(META[0]?.texte ?? ''), /\/rdv\/\?v=/.test(META[0]?.texte ?? ''), envoi(`conf-${id}-whatsapp`)]);
  META.length = 0;
  T0 += 5 * 60_000;
  const encoreOui = await appelle({ attente: 'reponse', rdv: id, geste: 'ok', numero: '22997000051' }, { cle: SERVICE });
  await attendsLeFond();
  dit('B21b un second « Je confirme » redit l acompte et son lien, sans reculer l echeance une seconde fois',
    [{ pris: true, etat: 'acompte' }, a.attenduJusquAu, a.confirmeeParLaClienteLe, true],
    [encoreOui.corps, rdvDe(id).attenduJusquAu, rdvDe(id).confirmeeParLaClienteLe, /acompte de 6 000 F/.test(META[0]?.texte ?? '')]);
  const lue = await appelle({ rdv: 'lire', v: (await jetonDuRendezVous('le-secret-de-la-plateforme', id)) });
  dit('B21c la page de son rendez-vous dit l acompte, jusqu a quand, et la maison qui l encaisse ; rien de tout cela pour un rendez-vous confirme',
    ['acompte', 6000, 'br-1', a.attenduJusquAu, false],
    [lue.corps.rdv?.attente, lue.corps.rdv?.acompteXof, lue.corps.rdv?.branchId, lue.corps.rdv?.attenduJusquAu,
      'attente' in ((await appelle({ rdv: 'lire', v: (await jetonDuRendezVous('le-secret-de-la-plateforme', idB3)) })).corps.rdv ?? {})]);
  /* kkiapay-verify (ou le comptoir) reconnaît l'acompte : rien d'autre à écrire, le rendez-vous est ferme. */
  (table('appointments').find((l) => l.id === id) as Ligne).data.depositConfirmed = true;
  T0 += 3 * 3_600_000;
  /* (Le passage du cron libere au passage les places des epreuves d avant, restees sans reponse : pas celle-ci.) */
  libere();
  dit('B22 l acompte reconnu (kkiapay-verify, ou le comptoir) : ferme sans une ecriture de plus, et la place ne se libere pas', [true, false, 'confirmé', false],
    [estFerme(rdvDe(id)), placeALiberer(rdvDe(id), T0), rdvDe(id).status, 'placeLibereeLe' in rdvDe(id)]);
  (table('documents').find((d) => d.key === 'mnd_settings') as Ligne).data.depositPctByService = {};
}

/* B23. « JE CONFIRME », ÉCRIT. */
{
  const r = await depot({ telephone: '0197000061', date: '2026-11-24', time: '12:00' });
  await attendsLeFond();
  const id = r.corps.apptId as string;
  const inconnue = await appelle({ attente: 'reponse', geste: 'ok', numero: '22997000777', texte: 'Je confirme' }, { cle: SERVICE });
  const ecrit = await appelle({ attente: 'reponse', geste: 'ok', numero: '22997000061', texte: 'Je confirme mon rendez-vous' }, { cle: SERVICE });
  await attendsLeFond();
  dit('B23 « Je confirme » ecrit au lieu de touche : sa seule place en attente est confirmee ; un numero qui n en tient aucune rend la main',
    [{ pris: false }, { pris: true, etat: 'ferme' }, true], [inconnue.corps, ecrit.corps, estFerme(rdvDe(id))]);
  /* UNE MÈRE ET SES DEUX ENFANTS : trois places du même numéro, sans réponse. */
  const r1 = await depot({ telephone: '0197000062', date: '2026-11-24', time: '14:00' });
  const r2 = await depot({ telephone: '0197000062', date: '2026-11-24', time: '16:00', pourQui: 'enfant' });
  const r3 = await depot({ telephone: '0197000062', date: '2026-11-24', time: '18:00', pourQui: 'enfant' });
  await attendsLeFond();
  const ref = (r: { corps: any }) => referenceDuRendezVous(r.corps.apptId);
  const cite = await appelle({ attente: 'reponse', geste: 'ok', numero: '22997000062', texte: `Je confirme mon rendez-vous (réf. ${ref(r2)}).` }, { cle: SERVICE });
  await attendsLeFond();
  dit('B24 trois places en attente, la reference citee : celle-la seule se confirme',
    [['en-attente', 'en-attente', 'en-attente'], { pris: true, etat: 'ferme' }, false, true, false],
    [[r1, r2, r3].map((r) => r.corps.etat), cite.corps, estFerme(rdvDe(r1.corps.apptId)), estFerme(rdvDe(r2.corps.apptId)), estFerme(rdvDe(r3.corps.apptId))]);
  META.length = 0;
  const toutes = await appelle({ attente: 'reponse', geste: 'ok', numero: '22997000062', texte: 'je confirme' }, { cle: SERVICE });
  await attendsLeFond();
  const phrase = META[0]?.texte ?? '';
  dit('B24b « Je confirme » ecrit, quand le numero tient encore deux places sans reponse : les deux se confirment ; UNE phrase dit combien et lesquelles, avec leurs references ; chacune a sa confirmation inscrite',
    [{ pris: true, etat: 'ferme', places: 2 }, true, true, 1, true, true, false, ['envoyé', 'envoyé']],
    [toutes.corps, estFerme(rdvDe(r1.corps.apptId)), estFerme(rdvDe(r3.corps.apptId)), META.length, /vos deux rendez-vous/.test(phrase),
      phrase.includes(ref(r1)) && phrase.includes(ref(r3)), phrase.includes(ref(r2)),
      [envoi(`conf-${r1.corps.apptId}-whatsapp`)?.statut, envoi(`conf-${r3.corps.apptId}-whatsapp`)?.statut]]);
  const encore = await appelle({ attente: 'reponse', geste: 'ok', numero: '22997000062', texte: 'Je confirme' }, { cle: SERVICE });
  dit('B24c un « Je confirme » de plus, toutes confirmees : rien a confirmer, le webhook garde la main', { pris: false }, encore.corps);
  /* Deux places, l'une porte un acompte : son oui est noté, l'acompte reste dû. */
  (table('documents').find((d) => d.key === 'mnd_settings') as Ligne).data.depositPctByService = { 'sv-lavage': 30 };
  const m1 = await depot({ telephone: '0197000063', date: '2026-11-25', time: '14:00', serviceIds: ['sv-racines'] });
  const m2 = await depot({ telephone: '0197000063', date: '2026-11-25', time: '17:00' });
  (table('documents').find((d) => d.key === 'mnd_settings') as Ligne).data.depositPctByService = {};
  await attendsLeFond();
  META.length = 0;
  const mixte = await appelle({ attente: 'reponse', geste: 'ok', numero: '22997000063', texte: 'Oui je confirme' }, { cle: SERVICE });
  await attendsLeFond();
  const dite = META[0]?.texte ?? '';
  dit('B24d deux places, l une avec un acompte : la premiere se confirme, l autre note son oui et attend son acompte ; la phrase le dit',
    [{ pris: true, etat: 'acompte', places: 2 }, 'ferme', 'acompte', true, true, 'envoyé', undefined],
    [mixte.corps, etatDeLAttente(rdvDe(m1.corps.apptId)), etatDeLAttente(rdvDe(m2.corps.apptId)), /votre oui est noté pour vos deux rendez-vous/.test(dite),
      /il reste l’acompte de 6 000 F/.test(dite), envoi(`conf-${m1.corps.apptId}-whatsapp`)?.statut, envoi(`conf-${m2.corps.apptId}-whatsapp`)]);
  /* Deux places ; la première est rendue (« Un autre moment », sur un autre téléphone) entre la lecture et l'écriture. */
  const t1 = await depot({ telephone: '0197000064', date: '2026-11-21', time: '16:00' });
  const t2 = await depot({ telephone: '0197000064', date: '2026-11-21', time: '18:00' });
  await attendsLeFond();
  ENTRE_DEUX = (t) => {
    if (t !== 'appointments') return;
    const l = table('appointments').find((x) => x.id === t1.corps.apptId) as Ligne;
    l.data = { ...l.data, ...marquesDeLaLiberation(T0), annuleePar: 'cliente', autreMomentDemandeLe: iso(T0) };
    l.updated_at = `t${++TIC}`;
  };
  META.length = 0;
  const croisee = await appelle({ attente: 'reponse', geste: 'ok', numero: '22997000064', texte: 'Je confirme' }, { cle: SERVICE });
  await attendsLeFond();
  ENTRE_DEUX = null;
  dit('B24e une place rendue entre la lecture et l ecriture reste rendue : seule l autre se confirme, et la phrase ne parle que d elle',
    [{ pris: true, etat: 'ferme', places: 1 }, 'liberee', false, 'ferme', true, false],
    [croisee.corps, etatDeLAttente(rdvDe(t1.corps.apptId)), 'confirmeeParLaClienteLe' in rdvDe(t1.corps.apptId), etatDeLAttente(rdvDe(t2.corps.apptId)),
      (META[0]?.texte ?? '').includes(referenceDuRendezVous(t2.corps.apptId)), (META[0]?.texte ?? '').includes(referenceDuRendezVous(t1.corps.apptId))]);
}

/* B25. META REFUSE LE MODÈLE. */
{
  META.length = 0;
  REPONSES_META = [{ status: 400, corps: { error: { code: 132001, message: 'Template name does not exist' } } }];
  const r = await depot({ telephone: '0197000071', date: '2026-11-25', time: '10:00' });
  await attendsLeFond();
  const a = rdvDe(r.corps.apptId);
  dit('B25 Meta refuse le modele de l attente (#132001) : la place se confirme dans la seconde, comme avant, et l ancienne confirmation part',
    ['confirme', true, 'confirmé', false, false, ['rdv_a_confirmer', 'confirmation_rdv']],
    [r.corps.etat, r.corps.confirme, a.status, 'attenduJusquAu' in a, 'suggereLe' in a, META.map((m) => m.modele)]);
  META.length = 0;
  REPONSES_META = [{ status: 400, corps: { error: { code: 131026, message: 'Message undeliverable' } } }];
  const r2 = await depot({ telephone: '0197000072', date: '2026-11-25', time: '12:00' });
  await attendsLeFond();
  const a2 = rdvDe(r2.corps.apptId);
  dit('B26 un echec qui n est pas celui du modele (numero hors WhatsApp) : elle ne pourrait pas repondre, la place se confirme dans la seconde, comme pour un refus du modele, et l ancienne confirmation part',
    ['confirme', true, 'confirmé', false, false, 'échec', ['rdv_a_confirmer', 'confirmation_rdv']],
    [r2.corps.etat, r2.corps.confirme, a2.status, 'attenduJusquAu' in a2, estEnAttente(a2), envoi(`att-${r2.corps.apptId}-whatsapp`)?.statut, META.map((m) => m.modele)]);
  /* Le plafond des modèles du site, déjà atteint pour ce numéro aujourd'hui. */
  for (let i = 0; i < MODELES_PAR_NUMERO_ET_PAR_JOUR; i += 1) DEBIT.push({ seau: 'modeles_du_site', cle: '22997000073', at: T0 });
  META.length = 0;
  const r3 = await depot({ telephone: '0197000073', date: '2026-11-25', time: '19:00' });
  await attendsLeFond();
  const a3 = rdvDe(r3.corps.apptId);
  dit('B26b le plafond des modeles atteint : aucun message ne part, et la place ne reste pas en attente d un oui qu elle ne peut pas donner',
    ['confirme', 'confirmé', false, 0, 'plafond'], [r3.corps.etat, a3.status, estEnAttente(a3), META.length, r3.corps.accuse]);
}

/* B26c. META DIT PLUS TARD LE MESSAGE DE L'ATTENTE NON REMIS (le webhook, « failed » sur sa ligne att-…). */
{
  const r4 = await depot({ telephone: '0197000074', date: '2026-11-28', time: '10:00' });
  const r5 = await depot({ telephone: '0197000075', date: '2026-11-28', time: '12:00' });
  await attendsLeFond();
  const id4 = r4.corps.apptId as string;
  const id5 = r5.corps.apptId as string;
  const sansCle = await appelle({ attente: 'non-remis', rdv: id4 });
  META.length = 0;
  const rendu = await appelle({ attente: 'non-remis', rdv: id4 }, { cle: SERVICE });
  await attendsLeFond();
  const a4 = rdvDe(id4);
  dit('B26c la porte ne s ouvre qu a la cle service ; la place qui attendait son oui se confirme sans attente, l ancienne confirmation part a son numero et s inscrit',
    [['en-attente', 'en-attente'], 401, { pris: true, etat: 'confirme', accuse: 'envoyé' }, 'confirmé', false, false, ['confirmation_rdv'], '2290197000074', 'envoyé'],
    [[r4.corps.etat, r5.corps.etat], sansCle.statut, rendu.corps, a4.status, 'attenduJusquAu' in a4, estEnAttente(a4), META.map((m) => m.modele), META[0]?.to, envoi(`conf-${id4}-whatsapp`)?.statut]);
  await appelle({ attente: 'reponse', rdv: id5, geste: 'ok', numero: '22997000075' }, { cle: SERVICE });
  META.length = 0;
  const repondue = await appelle({ attente: 'non-remis', rdv: id5 }, { cle: SERVICE });
  const deuxFois = await appelle({ attente: 'non-remis', rdv: id4 }, { cle: SERVICE });
  dit('B26d une place qui a deja repondu, ou deja confirmee sans attente, ne bouge pas, et rien ne repart',
    [{ pris: false }, { pris: false }, true, true, 0], [repondue.corps, deuxFois.corps, estFerme(rdvDe(id5)), 'attenduJusquAu' in rdvDe(id5), META.length]);
}

/* B27. LES PLAFONDS. */
{
  const heures = ['10:00', '12:00', '14:00', '16:00', '18:00'];
  const poses: any[] = [];
  /* Trois graphies du même numéro : une seule personne. */
  for (const [i, tel] of ['0197000081', '97000081', '+229 97 00 00 81'].entries()) {
    poses.push(await depot({ telephone: tel, dial: '+229', date: '2026-11-26', time: heures[i], pourQui: i === 0 ? 'moi' : i === 1 ? 'enfant' : 'autre' }));
  }
  await attendsLeFond();
  const lignesAvant = [table('demandes').length, table('messages_wa').length, table('appointments').length];
  const quatrieme = await depot({ telephone: '0197000081', date: '2026-11-26', time: heures[3] });
  dit('B27 un numero (sous toutes ses graphies) tient trois places sans les confirmer ; la quatrieme est refusee, et ne laisse ni demande, ni fil, ni rendez-vous',
    [['en-attente', 'en-attente', 'en-attente'], 429, 'trop_en_attente', lignesAvant],
    [poses.map((p) => p.corps.etat), quatrieme.statut, quatrieme.corps.error, [table('demandes').length, table('messages_wa').length, table('appointments').length]]);
  for (const p of poses) await appelle({ attente: 'reponse', rdv: p.corps.apptId, geste: 'ok', numero: '22997000081' }, { cle: SERVICE });
  const q = await depot({ telephone: '0197000081', date: '2026-11-26', time: heures[3] });
  const c = await depot({ telephone: '0197000081', date: '2026-11-26', time: heures[4] });
  await attendsLeFond();
  const sixieme = await depot({ telephone: '0197000081', date: '2026-11-27', time: '10:00' });
  dit('B28 confirmees, elle en reprend ; mais jamais plus de cinq places en vingt-quatre heures : la sixieme est refusee',
    [true, true, 429, 'trop_de_demandes'], [q.corps.ok, c.corps.ok, sixieme.statut, sixieme.corps.error]);
  T0 += 25 * 3_600_000;
  const demain = await depot({ telephone: '0197000081', date: '2026-11-27', time: '10:00' });
  await attendsLeFond();
  dit('B29 le lendemain, le compte est reparti', [true, 'en-attente'], [demain.corps.ok, demain.corps.etat]);
  /* Par adresse : douze places en vingt-quatre heures, quel que soit le numéro. */
  const ip = '41.0.0.1';
  const statuts: number[] = [];
  let k = 0;
  for (const jour of ['2026-12-01', '2026-12-02', '2026-12-03']) {
    for (const h of heures) {
      if (statuts.length >= 13) break;
      /* Le seau des dépôts (six par dix minutes) n'est pas l'objet : l'horloge avance entre deux. */
      T0 += 11 * 60_000;
      statuts.push((await depot({ telephone: `01970002${String(++k).padStart(2, '0')}`, date: jour, time: h }, { ip })).statut);
    }
  }
  await attendsLeFond();
  dit('B30 une adresse pose douze places en vingt-quatre heures, pas treize', [12, 429], [statuts.filter((s) => s === 200).length, statuts[12]]);
}

/* B31. LE DOUBLON NE REND PLUS LA RÉFÉRENCE D'UNE AUTRE. */
{
  const autre = await depot({ telephone: '0197000021', date: '2026-11-21', time: '10:00' });
  const autreForme = await depot({ telephone: '+229 97 00 00 21', dial: '+229', date: '2026-11-21', time: '10:00', cle: 'une-autre-cle-00000001' });
  dit('B31 retaper le numero, le jour et l heure d une autre (sous n importe quelle graphie) ne rend ni son rendez-vous ni sa reference',
    [{ ok: true, deja: true, accuse: 'deja' }, { ok: true, deja: true, accuse: 'deja' }], [autre.corps, autreForme.corps]);
  const sien = await depot({ telephone: '0197000021', date: '2026-11-21', time: '10:00', cle: 'cle-du-depot-de-awa-0001' });
  dit('B32 le meme appareil (la cle de son premier depot) retrouve sa reference et l etat de sa place',
    [true, idB3, referenceDuRendezVous(idB3), 'confirme', 'deja'], [sien.corps.deja, sien.corps.apptId, sien.corps.reference, sien.corps.etat, sien.corps.accuse]);
}

/* B33. LE CODE, UNE FOIS PAR PERSONNE : PAR LA CLÉ DU NUMÉRO. */
{
  const un = await depot({ telephone: '0197000301', date: '2026-12-04', time: '10:00', code: 'RENTREE10' });
  await appelle({ attente: 'reponse', rdv: un.corps.apptId, geste: 'ok', numero: '22997000301' }, { cle: SERVICE });
  const deux = await depot({ telephone: '+229 97 00 03 01', dial: '+229', date: '2026-12-04', time: '14:00', code: 'RENTREE10' });
  await attendsLeFond();
  dit('B33 le code d une offre sert une fois par personne, meme si elle retape son numero a l ancienne (+229 et huit chiffres)',
    [true, undefined, false, 'deja-utilise'], [un.corps.codeApplique, un.corps.codeRaison, deux.corps.codeApplique, deux.corps.codeRaison]);
}

/* B34. L'HEURE ET LA DURÉE. */
{
  const horsGrille = await depot({ telephone: '0197000401', date: '2026-12-05', time: '14:17' });
  const demie = await depot({ telephone: '0197000402', date: '2026-12-04', time: '09:30' });
  const huit = await depot({ telephone: '0197000403', date: '2026-12-08', time: '08:00' });
  await attendsLeFond();
  dit('B34 une heure hors de la grille (14:17, 09:30) est refusee par le serveur ; rien ne se pose a 08:00',
    [409, 'creneau_hors_ouverture', 409, false],
    [horsGrille.statut, horsGrille.corps.error, demie.statut, table('appointments').some((l) => l.data.date === '2026-12-08' && l.data.time === '08:00')]);
  const nu = await depot({ telephone: '0197000404', date: '2026-12-08', time: '10:00', serviceIds: ['sv-racines'] });
  const micro = await depot({ telephone: '0197000405', date: '2026-12-09', time: '10:00', serviceIds: ['sv-racines'], lockCount: 300, calibre: 'Micro' });
  await attendsLeFond();
  dit('B35 la duree posee suit le calibre annonce : 120 min au catalogue, 210 min pour une tete Micro (x1,8, au quart d heure)', [120, 210],
    [rdvDe(nu.corps.apptId).dureeMin, rdvDe(micro.corps.apptId).dureeMin]);
  const dessus = await depot({ telephone: '0197000406', date: '2026-12-09', time: '13:00' });
  dit('B36 … et l heure qui tombe dans cette duree n est plus libre', [409, 'creneau_pris'], [dessus.statut, dessus.corps.error]);
}

/* B36b. LE DÉFAISAGE (GBÀTÀ™) SE RÉSERVE EN LIGNE. */
{
  const gbata = (plus: Record<string, unknown>) => depot({ serviceIds: ['sv-gbata'], ...plus });
  const geste = table('catalog_services').find((l) => l.id === 'sv-gbata') as Ligne;
  const cochee = await gbata({ telephone: '0197000501', date: '2026-12-22', time: '09:00' });
  dit('G1 tant que sa case « consultation avant » est cochee au Catalogue (comme en ligne aujourd hui), le rituel GBATA ne se reserve pas : la consultation',
    [409, 'consultation_requise'], [cochee.statut, cochee.corps.error]);
  delete geste.data.consultationAvant;
  const libre = await gbata({ telephone: '0197000502', date: '2026-12-22', time: '09:00' });
  await attendsLeFond();
  const a = rdvDe(libre.corps.apptId);
  dit('G2 la case decochee par Yeman : le rituel GBATA se reserve tout de suite, a sa duree (cinq heures), comme toute place du site (tenue, a confirmer)',
    [200, 'en-attente', ['sv-gbata'], 300, 'confirmé', true], [libre.statut, libre.corps.etat, a?.serviceIds, a?.dureeMin, a?.status, estEnAttente(a)]);
  const creation = await depot({ telephone: '0197000503', date: '2026-12-23', time: '09:00', serviceIds: ['sv-creation'] });
  const restauration = await depot({ telephone: '0197000504', date: '2026-12-23', time: '09:00', serviceIds: ['sv-renais'] });
  const autre = await depot({ telephone: '0197000505', date: '2026-12-23', time: '09:00', serviceIds: ['sv-sup'] });
  dit('G3 rien d autre ne s ouvre : une creation et une restauration passent toujours par la consultation, une famille qui ne se reserve pas reste fermee',
    [[409, 'consultation_requise'], [409, 'consultation_requise'], [409, 'prestation_retiree']],
    [[creation.statut, creation.corps.error], [restauration.statut, restauration.corps.error], [autre.statut, autre.corps.error]]);
  const vitrine = table('documents').find((d) => d.key === 'mnd_vitrine_config') as Ligne;
  vitrine.data = { siteMasques: { services: ['sv-gbata'], categories: [] } };
  const decoche = await gbata({ telephone: '0197000506', date: '2026-12-24', time: '09:00' });
  vitrine.data = {};
  (table('catalog_categories').find((c) => c.id === 'cat-defaisage') as Ligne).data = { parentId: 'atl-iv-finfin' };
  const sousFinfin = await gbata({ telephone: '0197000507', date: '2026-12-24', time: '09:00' });
  (table('catalog_categories').find((c) => c.id === 'cat-defaisage') as Ligne).data = {};
  geste.data.priceMode = 'devis';
  const devis = await gbata({ telephone: '0197000508', date: '2026-12-24', time: '09:00' });
  geste.data.priceMode = 'variable';
  dit('G4 … et le geste garde ses fermetures : decoche pour le site, range sous la restauration, ou sur devis, il ne se reserve pas',
    [[409, 'prestation_retiree'], [409, 'consultation_requise'], [409, 'consultation_requise']],
    [[decoche.statut, decoche.corps.error], [sousFinfin.statut, sousFinfin.corps.error], [devis.statut, devis.corps.error]]);
}

/* B37. MA COURONNE PASSE PAR LE SERVEUR. */
{
  const corps = (plus: Record<string, unknown> = {}) => ({
    couronne: 'reserver',
    data: { pour: 'cl-awa', nom: 'Awa EXEMPLE', serviceIds: ['sv-racines'], seances: [{ date: '2026-12-10', time: '10:00' }], maitre: 'Expert', notes: ['Envie · brillance'],
      placeAttendue: false, tarifDeLaMaison: true, vu: { totalXof: 45000, remiseXof: 0, dureeMin: 30 }, ...plus },
  });
  const sansSession = await appelle(corps());
  const faux = await appelle(corps(), { cle: 'une-session-inventee' });
  dit('B37 Ma Couronne : sans sa session, rien', [401, 'session', 401], [sansSession.statut, sansSession.corps.error, faux.statut]);
  const r = await appelle({ ...corps(), data: { ...corps().data, status: 'confirmé', priceXof: 1, dureeMin: 15, discountXof: 99999 } }, { cle: 'session-de-awa' });
  const a = r.corps.rdvs?.[0];
  dit('B38 avec sa session : le serveur pose, sous verrou ; le statut, la duree (le calibre de SA fiche, jamais plus courte que le catalogue) et le maitre viennent de lui',
    [200, 'confirme', 'confirmé', 210, 'Expert', 'couronne', 'cl-awa', true],
    [r.statut, r.corps.etat, a?.status, a?.dureeMin, a?.master, a?.source, a?.clientId, !!rdvDe(a?.id)]);
  dit('B39 rien de ce que l appareil annonce ne fait foi : ni prix fige, ni remise ; ce qu elle a vu est dans la note, pour le comptoir',
    [false, false, true, true], ['priceXof' in a, 'discountXof' in a, /Vu dans Ma Couronne : 45 000 F/.test(a?.note ?? ''), /Envie · brillance/.test(a?.note ?? '')]);
  const autreTete = await appelle(corps({ pour: 'cl-autre', seances: [{ date: '2026-12-11', time: '10:00' }] }), { cle: 'session-de-awa' });
  dit('B40 elle ne reserve pas pour la tete d une autre', [403, 'tete'], [autreTete.statut, autreTete.corps.error]);
  const creation = await appelle(corps({ serviceIds: ['sv-creation'], seances: [{ date: '2026-12-11', time: '10:00' }] }), { cle: 'session-de-awa' });
  dit('B41 un geste qui demande le regard de la Maison (une creation) ne nait pas confirme : « en attente », la Maison regarde',
    ['en-attente', 'en attente', true], [creation.corps.etat, creation.corps.rdvs?.[0]?.status, creation.corps.regard]);
  const avant = table('appointments').length;
  const serie = await appelle(corps({ serviceIds: ['sv-lavage'], seances: [{ date: '2026-12-12', time: '10:00' }, { date: '2026-12-10', time: '11:00' }] }), { cle: 'session-de-awa' });
  dit('B42 une serie se pose entiere, ou pas du tout : la seconde seance tombe sur une place prise, rien ne reste',
    [409, 'creneau_pris', avant], [serie.statut, serie.corps.error, table('appointments').length]);
  VOLEE = '2026-12-17';
  const avantVol = table('appointments').filter((l) => l.data.clientId === 'cl-awa').length;
  const volee = await appelle(corps({ serviceIds: ['sv-lavage'], seances: [{ date: '2026-12-16', time: '10:00' }, { date: '2026-12-17', time: '10:00' }] }), { cle: 'session-de-awa' });
  dit('B42b … et quand la seconde place part sous le verrou, la premiere deja posee se defait : rien de la serie ne reste',
    [409, 'creneau_pris', avantVol], [volee.statut, volee.corps.error, table('appointments').filter((l) => l.data.clientId === 'cl-awa').length]);
  const longue = await appelle(corps({ serviceIds: ['sv-lavage'], seances: [{ date: '2026-12-12', time: '10:00' }], vu: { totalXof: 20000, remiseXof: 0, dureeMin: 600 } }), { cle: 'session-de-awa' });
  dit('B43 la duree que l ecran compte ne l allonge que jusqu au double', 120, longue.corps.rdvs?.[0]?.dureeMin);
  (table('documents').find((d) => d.key === 'mnd_settings') as Ligne).data.depositPctByService = { 'sv-lavage': 30 };
  table('payments').push({ id: 'tx-banc-1', data: { status: 'success', partnerId: 'rdv-paye-0001', amountXof: 6000 } }, { id: 'tx-banc-2', data: { status: 'success', partnerId: 'rdv-paye-0002', amountXof: 4000 } });
  const payee = await appelle(corps({ serviceIds: ['sv-lavage'], seances: [{ date: '2026-12-18', time: '10:00', id: 'rdv-paye-0001' }], transactionId: 'tx-banc-1' }), { cle: 'session-de-awa' });
  const courte = await appelle(corps({ serviceIds: ['sv-lavage'], seances: [{ date: '2026-12-18', time: '14:00', id: 'rdv-paye-0002' }], transactionId: 'tx-banc-2' }), { cle: 'session-de-awa' });
  const autreTx = await appelle(corps({ serviceIds: ['sv-lavage'], seances: [{ date: '2026-12-18', time: '16:00', id: 'rdv-paye-0003' }], transactionId: 'tx-banc-1' }), { cle: 'session-de-awa' });
  dit('B43b l acompte paye en ligne pour CE rendez-vous (au registre) : confirme ; paye en dessous : l argent est pose, la Maison regarde ; le paiement d un autre rendez-vous ne vaut rien',
    [['confirme', 'rdv-paye-0001', 6000, true], ['en-attente', 4000, true], ['en-attente', 6000, false]],
    [[payee.corps.etat, payee.corps.rdvs?.[0]?.id, payee.corps.rdvs?.[0]?.depositXof, payee.corps.rdvs?.[0]?.depositConfirmed],
      [courte.corps.etat, courte.corps.rdvs?.[0]?.depositXof, courte.corps.rdvs?.[0]?.depositConfirmed],
      [autreTx.corps.etat, autreTx.corps.rdvs?.[0]?.depositXof, !!autreTx.corps.rdvs?.[0]?.depositConfirmed]]);
  (table('documents').find((d) => d.key === 'mnd_settings') as Ligne).data.depositPctByService = {};
  const horsGrille = await appelle(corps({ serviceIds: ['sv-lavage'], seances: [{ date: '2026-12-15', time: '10:20' }] }), { cle: 'session-de-awa' });
  dit('B44 … et l heure est une heure de la grille, pour elle aussi', [409, 'creneau_hors_ouverture'], [horsGrille.statut, horsGrille.corps.error]);
  const avantLaDemie = await appelle(corps({ serviceIds: ['sv-lavage'], seances: [{ date: '2026-12-15', time: '08:00' }] }), { cle: 'session-de-awa' });
  dit('B44b … et rien ne se pose a 08:00 un jour qui ouvre a 08:00 : jamais avant 08:30, depuis Ma Couronne non plus',
    [409, false], [avantLaDemie.statut, table('appointments').some((l) => l.data.date === '2026-12-15' && l.data.time === '08:00')]);
  const jugeDeLaCouronne = (() => { const s = lit('supabase/functions/demande-submit/index.ts'); const i = s.indexOf('function laPlaceTientPourLaCouronne('); return i >= 0 ? s.slice(i, i + 700) : ''; })();
  dit('B44c son juge refuse lui-meme avant 08:30 ; il ne compare jamais a la seule ouverture',
    [true, false],
    [jugeDeLaCouronne.includes('if (debut < Math.max(fenetre.openMin, PREMIER_RENDEZ_VOUS_MIN) || fin > fenetre.closeMin) return false;'), jugeDeLaCouronne.includes('debut < fenetre.openMin')]);

  /* SA FICHE, LA RÈGLE D'est_ma_tete (18 novembre 2026). Une heure plus tard : le seau de son compte est reparti. */
  T0 += 61 * 60_000;
  const jour = '2026-12-19';
  const adoptee = await appelle(corps({ pour: 'cl-bea', seances: [{ date: jour, time: '10:00' }] }), { cle: 'session-de-bea' });
  dit('B45 la fiche que la Maison a inscrite avant son compte, adoptee (son compte dans authUserId), est la sienne : Ma Couronne y reserve, a son nom',
    [200, 'cl-bea', 'Bea EXEMPLE'], [adoptee.statut, adoptee.corps.rdvs?.[0]?.clientId, adoptee.corps.rdvs?.[0]?.clientName]);
  const sonEnfant = await appelle(corps({ pour: 'cl-enfant-bea', seances: [{ date: jour, time: '13:00' }] }), { cle: 'session-de-bea' });
  const enfantDAwa = await appelle(corps({ pour: 'cl-enfant-awa', seances: [{ date: jour, time: '16:00' }] }), { cle: 'session-de-awa' });
  dit('B45b son enfant mineur, dont elle paie le compte famille par sa fiche adoptee : elle y reserve ; payeur par l identifiant de son compte, comme avant',
    [[200, 'cl-enfant-bea'], [200, 'cl-enfant-awa']],
    [[sonEnfant.statut, sonEnfant.corps.rdvs?.[0]?.clientId], [enfantDAwa.statut, enfantDAwa.corps.rdvs?.[0]?.clientId]]);
  const avantLesRefus = table('appointments').length;
  const lEnfantDUneAutre = await appelle(corps({ pour: 'cl-enfant-bea', seances: [{ date: jour, time: '18:00' }] }), { cle: 'session-de-awa' });
  const majeure = await appelle(corps({ pour: 'cl-grande-bea', seances: [{ date: jour, time: '18:00' }] }), { cle: 'session-de-bea' });
  const laFicheDUneAutre = await appelle(corps({ pour: 'cl-bea', seances: [{ date: jour, time: '18:00' }] }), { cle: 'session-de-awa' });
  const majeurDAwa = await appelle(corps({ pour: 'cl-grand-awa', seances: [{ date: jour, time: '18:00' }] }), { cle: 'session-de-awa' });
  dit('B45c rien d autre : l enfant d une autre, une majeure de sa famille (payee par sa fiche, ou par son compte), la fiche adoptee d une autre ; rien ne se pose',
    [[403, 'tete'], [403, 'tete'], [403, 'tete'], [403, 'tete'], avantLesRefus],
    [[lEnfantDUneAutre.statut, lEnfantDUneAutre.corps.error], [majeure.statut, majeure.corps.error], [majeurDAwa.statut, majeurDAwa.corps.error],
      [laFicheDUneAutre.statut, laFicheDUneAutre.corps.error], table('appointments').length]);
}

/* B46. LA PLACE DU JOUR MÊME NE SE LIBÈRE PAS PENDANT LA SÉANCE (18 novembre 2026). */
{
  T0 = REEL.parse('2026-12-29T13:30:00+01:00');
  const duJour = await depot({ telephone: '0197000601', date: '2026-12-29', time: '14:00' });
  const demain = await depot({ telephone: '0197000602', date: '2026-12-30', time: '10:00' });
  await attendsLeFond();
  T0 += 2 * 3_600_000 + 60_000;
  libere();
  const a = rdvDe(duJour.corps.apptId);
  const b = rdvDe(demain.corps.apptId);
  dit('B46 prise a 13 h 30 pour 14 h, sans reponse : a 15 h 31 sa place tient (elle est au fauteuil) ; celle du lendemain, prise au meme instant, se libere',
    [['en-attente', 'en-attente'], 'confirmé', false, 'annulé', 'liberee'],
    [[duJour.corps.etat, demain.corps.etat], a.status, 'placeLibereeLe' in a, b.status, etatDeLAttente(b)]);
}

/* B47. « ELLE A DIT OUI » AU COMPTOIR, L'ACOMPTE ENCORE DÛ (18 novembre 2026). */
{
  (table('documents').find((d) => d.key === 'mnd_settings') as Ligne).data.depositPctByService = { 'sv-lavage': 30 };
  const auComptoir = await depot({ telephone: '0197000611', date: '2027-01-05', time: '10:00' });
  const parWhatsApp = await depot({ telephone: '0197000612', date: '2027-01-05', time: '12:00' });
  (table('documents').find((d) => d.key === 'mnd_settings') as Ligne).data.depositPctByService = {};
  await attendsLeFond();
  /* Le geste du Carnet (`noteSonOui`) : son oui, et la marque du comptoir. */
  const ligne = table('appointments').find((l) => l.id === auComptoir.corps.apptId) as Ligne;
  ligne.data = { ...ligne.data, confirmeeParLaClienteLe: iso(T0), ouiNoteParLeComptoir: true };
  ligne.updated_at = `t${++TIC}`;
  await appelle({ attente: 'reponse', rdv: parWhatsApp.corps.apptId, geste: 'ok', numero: '22997000612' }, { cle: SERVICE });
  T0 += 3 * 3_600_000;
  libere();
  const a = rdvDe(auComptoir.corps.apptId);
  const b = rdvDe(parWhatsApp.corps.apptId);
  dit('B47 son oui note au comptoir, l acompte encore du : trois heures plus tard la place tient, l acompte reste attendu ; son oui par WhatsApp sans l acompte : la place se libere a son echeance',
    [6000, 'confirmé', 'acompte', false, 'annulé', 'liberee'], [a.depositXof, a.status, etatDeLAttente(a), 'placeLibereeLe' in a, b.status, etatDeLAttente(b)]);
}

/* ══ C. LES FICHIERS QUI TIENNENT LA MÊME RÈGLE ═════════════════════════════ */
{
  const sql = lit('supabase/migrations/0222_le_rendez_vous_en_attente.sql').replace(/--[^\n]*/g, '');
  const pose = sql.slice(sql.indexOf('create or replace function public.pose_si_libre'), sql.indexOf('create or replace function public.libere_les_places_en_attente'));
  dit('C1 la base tient les memes nombres que la regle : cinq poses par jour, trois en attente, sous le verrou du numero pris AVANT celui du jour',
    [true, true, true, true],
    [new RegExp(`coalesce\\(poses_du_jour, 0\\) >= ${POSES_PAR_NUMERO_ET_PAR_JOUR} then`).test(pose), new RegExp(`coalesce\\(en_attente, 0\\) >= ${EN_ATTENTE_PAR_NUMERO} then`).test(pose),
      /interval '24 hours'/.test(pose),
      pose.indexOf("pg_advisory_xact_lock(hashtext('pose-numero'), hashtext(cle))") > 0 && pose.indexOf("pg_advisory_xact_lock(hashtext('pose-numero'), hashtext(cle))") < pose.indexOf("pg_advisory_xact_lock(hashtext('pose'), hashtext(branche || ':' || jour))")]);
  /* LE JOUR MÊME D'OPALE NE SE PERD PAS (18 novembre 2026). 0222 réécrivait `pose_si_libre` depuis le texte
     de 0203 et effaçait en silence la clause de 0213, passée le matin même : toute place du jour posée par
     Opale aurait été refusée. La DERNIÈRE migration qui définit le verrou doit la garder, quelle qu'elle soit. */
  const versLeVerrou = readdirSync('supabase/migrations').filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort()
    .filter((f) => lit(`supabase/migrations/${f}`).includes('create or replace function public.pose_si_libre'));
  const dernier = lit(`supabase/migrations/${versLeVerrou[versLeVerrou.length - 1]}`).replace(/--[^\n]*/g, '');
  const verrou = dernier.slice(dernier.indexOf('create or replace function public.pose_si_libre'));
  dit('C1b la derniere migration du verrou garde le jour meme d Opale (0213) : WhatsApp, posee par Opale, vingt-cinq minutes au moins',
    [true, true, true],
    [/coalesce\(p_rdv->>'source', ''\) = 'whatsapp'/.test(verrou), /coalesce\(p_rdv->>'poseePar', ''\) = 'Opale'/.test(verrou), /::int \+ 25\)/.test(verrou)]);
  dit('C2 aucune porte en ligne ne pose avant 08:30 ; le plafond ne vaut que pour une place qui nait en attente',
    [true, true], [/if debut is null or debut < 510 then\s+return jsonb_build_object\('ok', false, 'raison', 'creneau_hors_ouverture'\);/.test(pose),
      /if btrim\(coalesce\(p_rdv->>'attenduJusquAu', ''\)\) <> '' and coalesce\(en_attente, 0\) >= 3 then/.test(pose)]);
  const juge = sql.slice(sql.indexOf('create or replace function public.rdv_en_attente'), sql.indexOf('create index if not exists appointments_cle_du_numero'));
  dit('C3 le juge de la base est celui de la regle : tenue, une echeance, et pas (son oui ET l acompte recu ou nul)', [true, true, true, true],
    [/coalesce\(a->>'status', ''\) = 'confirmé'/.test(juge), /btrim\(coalesce\(a->>'attenduJusquAu', ''\)\) <> ''/.test(juge),
      /btrim\(coalesce\(a->>'confirmeeParLaClienteLe', ''\)\) <> ''/.test(juge), /coalesce\(a->>'depositConfirmed', ''\) = 'true'/.test(juge)]);
  const lib = sql.slice(sql.indexOf('create or replace function public.libere_les_places_en_attente'));
  dit('C4 la liberation : les seules places en attente dont l echeance est passee ; annule, « place liberee », le code rendu ; le cron toutes les cinq minutes',
    [true, true, true, true, true],
    [/public\.rdv_en_attente\(a\.data\)\s+and a\.data->>'attenduJusquAu' <= maintenant/.test(lib), /'status', 'annulé', 'annuleeLe', maintenant, 'placeLibereeLe', maintenant/.test(lib),
      /d\.data - 'codeApplique'/.test(lib), /cron\.schedule\('libere-les-places-en-attente', '\*\/5 \* \* \* \*'/.test(lib), !/annuleePar/.test(lib)]);
  const ouLibere = lib.slice(lib.indexOf('for r in'), lib.indexOf('for update skip locked'));
  dit('C4b la base, comme placeALiberer : jamais une place dont l heure est venue (le jour et l heure compares en texte a l heure de Porto-Novo, illisibles : gardee), ni une place dont le comptoir a note le oui',
    [true, true, true, true, true],
    [/ici\s+text := to_char\(now\(\) at time zone 'Africa\/Porto-Novo', 'YYYY-MM-DD HH24:MI'\);/.test(lib),
      /and coalesce\(a\.data->>'date', ''\) ~ '\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$'\s+and coalesce\(a\.data->>'time', ''\) ~ '\^\\d\{2\}:\\d\{2\}\$'/.test(ouLibere),
      /and \(a\.data->>'date'\) \|\| ' ' \|\| \(a\.data->>'time'\) > ici\s/.test(ouLibere),
      /and not \(btrim\(coalesce\(a\.data->>'confirmeeParLaClienteLe', ''\)\) <> ''\s+and coalesce\(a\.data->'ouiNoteParLeComptoir' = 'true'::jsonb, false\)\)/.test(ouLibere),
      minuteDePortoNovo(REEL.parse('2026-11-17T23:30:00Z')) === '2026-11-18 00:30']);
  dit('C5 le debit se compte et s ecrit sous un meme verrou, a la cle service seule', [true, true],
    [/perform pg_advisory_xact_lock\(hashtext\('debit:' \|\| seau\), hashtext\(cle\)\);[\s\S]*?insert into public\.edge_rate_limits/.test(sql),
      /revoke all on function public\.debit_permis\(text, text, int, int\) from public, anon, authenticated;/.test(sql)]);
  const depl = lit('supabase/migrations/0223_deplacer_sous_le_verrou.sql').replace(/--[^\n]*/g, '');
  dit('C6 deplacer : sous le verrou des poses, la ligne relue, deux fois au plus, jamais avant 08:30, lui-meme retire du compte',
    [true, true, true, true, true],
    [/perform pg_advisory_xact_lock\(hashtext\('pose'\), hashtext\(branche \|\| ':' \|\| p_date\)\);/.test(depl), /rdv\.updated_at is distinct from p_vu/.test(depl),
      new RegExp(`if faits >= ${DEPLACEMENTS_AU_PLUS} then\\s+return jsonb_build_object\\('ok', false, 'raison', 'trop_de_deplacements'\\);`).test(depl),
      /if debut is null or debut < 510 then/.test(depl), (depl.match(/where a\.id <> p_id/g) ?? []).length >= 4]);
  const garde = lit('supabase/migrations/0224_ma_couronne_passe_par_le_serveur.sql').replace(/--[^\n]*/g, '');
  dit('C7 la garde de la base : une cliente ne se confirme pas, ne fige ni prix ni remise, ne raccourcit pas la duree ; la Maison ecrit comme avant',
    [true, true, true, true, true],
    [/if public\.ecriture_de_la_maison\(\) then\s+return new;/.test(garde),
      /if coalesce\(new\.data->>'status', ''\) = 'confirmé' then\s+new\.data := jsonb_set\(new\.data, '\{status\}', '"en attente"'::jsonb\);/.test(garde),
      /array\['priceXof', 'discountXof', 'discountPct', 'remisesLignes', 'offreId',/.test(garde), /greatest\(\s*catalogue,/.test(garde),
      /create trigger garde_reservation_cliente_biu\s+before insert or update on public\.appointments/.test(garde)]);
  dit('C7b la ligne deja la (la synchronisation insere, ou modifie si la ligne existe) n est pas une creation : la branche des creations la laisse, en tete, comme 0219',
    true, /if tg_op = 'INSERT' then\s+if exists \(select 1 from public\.appointments a where a\.id = new\.id\) then\s+return new;\s+end if;\s+if coalesce\(new\.data->>'status', ''\) = 'confirmé' then/.test(garde));
  dit('C7c la branche des modifications garde la ligne : une cliente ne monte pas son rendez-vous en « confirme », la valeur d avant revient',
    true, /else\s+if coalesce\(new\.data->>'status', ''\) = 'confirmé' and coalesce\(old\.data->>'status', ''\) <> 'confirmé' then\s+new\.data := jsonb_set\(new\.data, '\{status\}', coalesce\(old\.data -> 'status', '"en attente"'::jsonb\)\);/.test(garde));
  dit('C7d la marque du comptoir (ouiNoteParLeComptoir, qui tient une place) ne se pose pas a la creation et garde sa valeur d avant a la modification',
    [true, true],
    [/'remiseFamille', 'remiseFamilleXof', 'remiseDuComptoirXof',\s+'suggereLe', 'attenduJusquAu', 'cleDuNumero', 'placeLibereeLe', 'deplacements',\s+'ouiNoteParLeComptoir'\] loop\s+new\.data := new\.data - cle;\s+end loop;/.test(garde),
      /'remiseDuComptoirXof', 'dureeMin',\s+'suggereLe', 'attenduJusquAu', 'cleDuNumero', 'placeLibereeLe', 'deplacements',\s+'ouiNoteParLeComptoir'\] loop\s+new\.data := new\.data - cle;\s+if old\.data \? cle then/.test(garde)]);

  const webhook = lit('supabase/functions/whatsapp-webhook/index.ts');
  dit('C8 le webhook rend le bouton d une place en attente a la porte du site, AVANT de chercher une fiche ; et le « Je confirme » ecrit, AVANT l automate',
    [true, true, true, true],
    [/if \(typeof rdv\.attenduJusquAu === 'string' && rdv\.attenduJusquAu\.trim\(\)\) \{\s+const rendu = await rendsALaPorteDuSite\(urlBase, service, \{ rdv: ligne\.id, geste: m\[1\] === 'OK' \? 'ok' : 'autre', numero: e\.numero \}\);/.test(webhook),
      webhook.indexOf("const rendu = await rendsALaPorteDuSite(urlBase, service, { rdv: ligne.id") < webhook.indexOf("dis('reprise · numéro étranger au rendez-vous')"),
      webhook.indexOf('if (rendu.pris) confirmesParEcrit.add(e.waId);') > 0 && webhook.indexOf('if (rendu.pris) confirmesParEcrit.add(e.waId);') < webhook.indexOf('const tache = confieALAutomate('),
      /body: JSON\.stringify\(\{ attente: 'reponse', \.\.\.corps \}\)/.test(webhook) && /authorization: `Bearer \$\{service\}`/.test(webhook)]);
  const jeConfirme = /const estUnJeConfirme = \(texte: string \| undefined\): boolean =>\s+(\/.*\/i)\.test/.exec(webhook)?.[1] ?? '';
  const re = jeConfirme ? new RegExp(jeConfirme.slice(1, jeConfirme.lastIndexOf('/')), 'i') : /$^/;
  dit('C9 « Je confirme » se reconnait ecrit ; « oui » seul, ou une question, non', [true, true, true, false, false, false],
    [re.test('Je confirme'), re.test(' je confirme mon rendez-vous (réf. MND-7K3Q).'), re.test('Oui, je confirme'), re.test('oui'), re.test('Est-ce que je confirme ici ?'), re.test('Bonjour')]);
  const conf = lit('supabase/functions/confirmation-rdv/index.ts');
  dit('C10 confirmation-rdv ne dit rien a une place en attente : ni proposition, ni « c est confirme »', true,
    /\.filter\(\(a\) => a\.date >= aujourdhui && estAConfirmer\(a, maintenant\)\)[\s\S]{0,260}\.filter\(\(a\) => !estEnAttente\(a\)\);/.test(conf));
  const ds = lit('supabase/functions/demande-submit/index.ts');
  dit('C11 demande-submit : la bascule veut le secret ET le modele approuve ; la reponse de l attente ne s ouvre qu a la cle service ; le juge de l heure n est pas refait ici',
    [true, true, true, true],
    [/const nom = \(Deno\.env\.get\('WA_TEMPLATE_ATTENTE'\) \?\? ''\)\.trim\(\);\s+if \(!nom \|\| !Deno\.env\.get\('WA_TOKEN'\) \|\| !Deno\.env\.get\('WA_PHONE_ID'\)\) return '';/.test(ds),
      /String\(m\?\.etat \?\? ''\)\.toUpperCase\(\) === 'APPROVED'/.test(ds), /if \(!appelDuServeur\(req\)\) return json\(\{ error: 'reserve' \}, 401\);/.test(ds),
      /if \(debutDemande >= PREMIER_RENDEZ_VOUS_MIN\s+&& !heureSurLaGrille\(/.test(ds)]);
  const badge = lit('src/apps/trone/routes/clients/BadgeSuggere.tsx');
  const carnet = lit('src/apps/trone/routes/clients/Carnet.tsx');
  dit('C12 au Carnet, un rendez-vous en attente se distingue d un confirme : son badge, sa tuile en pointilles, son filtre ; libere, il le dit',
    [true, true, true, true],
    [badge.includes("{attente === 'liberee' ? 'Place libérée' : 'En attente'}"), badge.includes("(estSuggere(a) || estEnAttente(a) ? 'est-suggere' : '')"),
      carnet.includes("garde: (a) => a.status === 'en attente' || estEnAttente(a) }"), carnet.includes("garde: (a) => a.status === 'confirmé' && !estSuggere(a) && !estEnAttente(a) }")]);
  const booking = lit('src/apps/couronne/Booking.tsx');
  dit('C13 Ma Couronne demande a la Maison ; ce qu elle garde est ce que la Maison a ecrit ; elle n envoie ni statut, ni prix, ni remise',
    [true, true, false],
    [booking.includes('const parLaMaison = sb ? await reserveALaMaison(sb, {'), booking.includes('ecrits = parLaMaison.rdvs;'),
      /reserveALaMaison\(sb, \{[^;]*(status|priceXof|discountXof|remisesLignes)\b/.test(booking.replace(/\/\*[\s\S]*?\*\//g, ''))]);
  const reserver = lit('src/apps/revelateur/ilots/Reserver.tsx');
  dit('C14 le site : le prix au calibre annonce est un plancher, confirme au fauteuil ; les heures suivent la duree au calibre ; la page dit comment confirmer',
    [true, true, true, true],
    [reserver.includes("const prixFlou = prixAuCalibre || choisies.some("), reserver.includes("${prixAuCalibre ? 'confirmé au fauteuil' : 'à régler à la Maison'}"),
      reserver.includes('heuresLibres({ agenda: agendaAuCalibre ?? agenda, dateIso: iso,'), reserver.includes("'Répondez « Je confirme » sur WhatsApp.'")]);
  /* L'ASSEMBLAGE (18 novembre 2026) : une place prise en ligne porte `suggereLe` pour taire les rappels,
     mais ce n'est pas une suggestion de la Maison. Rien de ce qui est fait pour une suggestion ne la vise. */
  const rj1 = lit('supabase/functions/rappels-j1/index.ts');
  const express = lit('src/shared/reservation-express.ts');
  dit('C15 rappels-j1 : ni la relance J-3 « Notre proposition », ni la note du comptoir la veille ne visent une place prise en ligne',
    [true, true, true],
    [rj1.includes('&& !a.confirmeeParLaClienteLe && !a.autreMomentDemandeLe && !a.attenduJusquAu);'),
      express.includes('&& !a.confirmeeParLaClienteLe && !a.autreMomentDemandeLe && !a.attenduJusquAu);'),
      rj1.includes('.filter((a) => estSuggere(a) && !a.attenduJusquAu)')]);
  const mesRdv = lit('src/apps/couronne/MesRendezVous.tsx');
  const prochain = lit('src/apps/trone/routes/vente/SonProchainRituel.tsx');
  const abonnee = lit('src/shared/abonnee-pur.ts');
  dit('C16 Ma Couronne, la carte du prochain rituel et la formule ne la disent pas « proposee par la Maison »',
    [true, 0, true, true],
    [mesRdv.includes('const proposeeParLaMaison = (a: Appointment): boolean => estSuggere(a) && etatDeLAttente(a) === null;'),
      (mesRdv.match(/\{(aVenir && )?estSuggere\(a\) &&/g) ?? []).length,
      prochain.includes("suggere: estSuggere(dejaPose) && etatDeLAttente(dejaPose) === null }") && prochain.includes("estSuggere(rdvMontre) && etatDeLAttente(rdvMontre) === null ?"),
      abonnee.includes("if (estSuggere(a) && !a.attenduJusquAu) return 'proposee';")]);
  /* LE MESSAGE DE L'ATTENTE NON REMIS (18 novembre 2026). */
  const accusesDuWebhook = webhook.slice(webhook.indexOf('const refusesApresCoup = new Set<string>();'), webhook.indexOf('/* ── ⑥ LES REACTIONS QU ELLE POSE'));
  dit('C17 le webhook : un « failed » sur la ligne att-<rdv>-whatsapp d une place tenue est rendu a la porte du site (attente non-remis, la cle service), apres le journal',
    [true, true, true, true],
    [/if \(ligne && a\.etat === 'non-remis' && ligne\.data\.attente === true && \/\^att-rdv-\/\.test\(ligne\.id\)\s+&& typeof ligne\.data\.apptId === 'string' && ligne\.id === `att-\$\{ligne\.data\.apptId\}-whatsapp`\) \{\s+attentesNonRemises\.add\(String\(ligne\.data\.apptId\)\);/.test(accusesDuWebhook),
      /for \(const rdv of attentesNonRemises\) await ditLAttenteNonRemise\(urlBase, service, rdv\);/.test(accusesDuWebhook),
      accusesDuWebhook.indexOf('for (const rdv of attentesNonRemises)') > accusesDuWebhook.indexOf("...(a.etat === 'non-remis' ? { statut: 'échec' } : {}),"),
      /body: JSON\.stringify\(\{ attente: 'non-remis', rdv \}\)/.test(webhook) && /async function ditLAttenteNonRemise\([\s\S]{0,300}authorization: `Bearer \$\{service\}`/.test(webhook)]);
  dit('C17b demande-submit : un envoi de l attente plus long que six secondes est suivi jusqu au bout ; s il ne part pas, la place se confirme et l ancienne confirmation part',
    true, /if \(partie === 'en-cours'\) \{\s+enTacheDeFond\(envoi\.then\(async \(fin\) => \{\s+if \(!attenteNonPartie\(fin\) \|\| !\(await confirmeSansAttente\(posee\)\)\) return;\s+await accuseDAvant\(\);/.test(ds));
  const carte = lit('src/shared/carte-du-prochain-rituel.ts');
  dit('C18 « Elle a dit oui » au Carnet (noteSonOui) pose son oui ET la marque du comptoir que lit la liberation',
    true, /confirmeeParLaClienteLe: new Date\(\)\.toISOString\(\), ouiNoteParLeComptoir: true/.test(carte));
}

/* ══ D. LA BASE, JOUÉE DANS PGLITE (quand BANC_PGLITE le permet) ═══════════
   La VRAIE 0224 et la VRAIE libération de 0222 contre une base simulée : les
   rôles de Supabase, `auth.uid()`, des règles `own_*` comme 0006,
   `ecriture_de_la_maison` (0138). La cliente écrit comme sa synchronisation :
   « insérer, ou modifier si la ligne existe ». */
{
  const dossierPGlite = process.env.BANC_PGLITE;
  type Base = { exec: (s: string) => Promise<unknown>; query: (s: string, p?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>; close: () => Promise<void> };
  let PGlite: (new () => Base) | null = null;
  if (dossierPGlite) {
    try { PGlite = (await import(pathToFileURL(path.join(dossierPGlite, 'node_modules/@electric-sql/pglite/dist/index.js')).href)).PGlite ?? null; } catch { PGlite = null; }
  }
  if (!PGlite) {
    console.log('SAUTE D 0224 et la liberation de 0222 ne se jouent pas ici, PGlite absent (BANC_PGLITE=<dossier qui porte node_modules/@electric-sql/pglite>)');
  } else {
    /* La vraie horloge : PGlite lit la sienne. */
    (globalThis as any).Date = REEL;
    const M0138 = lit('supabase/migrations/0138_le_parcours_de_l_abonnee.sql');
    const M0222 = lit('supabase/migrations/0222_le_rendez_vous_en_attente.sql');
    const M0224 = lit('supabase/migrations/0224_ma_couronne_passe_par_le_serveur.sql');
    const fonction = (s: string, debut: string): string => { const i = s.indexOf(debut); return i < 0 ? '' : s.slice(i, s.indexOf('$$;', s.indexOf('$$', s.indexOf('$$', i) + 2)) + 3); };
    const CLIENTE = '11111111-1111-4111-8111-111111111111';
    const EQUIPE = '33333333-3333-4333-8333-333333333333';
    const base = new PGlite();
    await base.exec(`
      create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
      grant anon, authenticated, service_role to current_user;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create table public.staff (user_id uuid primary key, role text);
      create table public.appointments (id text primary key, branch_id text, data jsonb not null default '{}'::jsonb, updated_at timestamptz default now());
      create table public.demandes (id text primary key, genre text, branch_id text, data jsonb not null default '{}'::jsonb);
      create function public.is_staff() returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from public.staff where user_id = auth.uid()) $$;
      create function public.est_ma_tete(cible text) returns boolean language sql stable security definer set search_path = public as $$ select cible = (auth.uid())::text $$;
      create function public.duree_du_rdv(a jsonb) returns int language sql stable as $$ select 60 $$;
      ${M0138.slice(M0138.indexOf('create or replace function public.ecriture_de_la_maison()'), M0138.indexOf('create or replace function public.garde_argent_cliente()'))}
      ${fonction(M0138, 'create or replace function public.abo_iso(t timestamptz)')}
      alter table public.appointments enable row level security;
      create policy own_sel on public.appointments for select to authenticated using (public.is_staff() or public.est_ma_tete(data->>'clientId'));
      create policy own_ins on public.appointments for insert to authenticated with check (public.is_staff() or public.est_ma_tete(data->>'clientId'));
      create policy own_upd on public.appointments for update to authenticated using (public.is_staff() or public.est_ma_tete(data->>'clientId')) with check (public.is_staff() or public.est_ma_tete(data->>'clientId'));
      insert into public.staff (user_id, role) values ('${EQUIPE}', 'equipe');
      grant usage on schema public, auth to anon, authenticated, service_role;
      grant all on all tables in schema public to anon, authenticated, service_role;
      grant execute on all functions in schema public to anon, authenticated, service_role;
      grant execute on all functions in schema auth to anon, authenticated, service_role;`);
    const joue = (s: string) => base.exec(s).then(() => 'jouee', (e: Error) => String(e?.message ?? e).slice(0, 160));
    dit('D1 0224 se joue sans erreur, et se rejoue ; les deux fonctions de la liberation (0222) aussi',
      ['jouee', 'jouee', 'jouee'],
      [await joue(M0224), await joue(M0224), await joue(`${fonction(M0222, 'create or replace function public.rdv_en_attente(a jsonb)')}\n${fonction(M0222, 'create or replace function public.libere_les_places_en_attente()')}`)]);
    const q = (v: unknown) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
    type Qui = 'cliente' | 'serveur';
    const comme = async (qui: Qui, s: string): Promise<string> => {
      const role = qui === 'serveur' ? 'service_role' : 'authenticated';
      await base.exec(`begin; set local role ${role}; select set_config('request.jwt.claim.sub', '${qui === 'cliente' ? CLIENTE : ''}', true), set_config('request.jwt.claims', '{"role":"${role}"}', true);`);
      try { await base.exec(s); await base.exec('commit;'); return 'ecrit'; } catch (e) {
        await base.exec('rollback;');
        return `erreur ${String((e as Error)?.message).slice(0, 90)}`;
      }
    };
    const ligneDe = async (id: string) => ((await base.query('select data from public.appointments where id = $1', [id])).rows[0]?.data ?? null) as Record<string, any> | null;
    const pousse = (id: string, data: Record<string, unknown>) =>
      comme('cliente', `insert into public.appointments (id, branch_id, data) values ('${id}', 'br-1', ${q({ id, ...data })}) on conflict (id) do update set branch_id = excluded.branch_id, data = excluded.data;`);
    /* Ce que le serveur pose pour Ma Couronne : confirmé, sa durée, ses marques. */
    const duServeur = { branchId: 'br-1', clientId: CLIENTE, clientName: 'Awa EXEMPLE', serviceIds: ['sv-lavage'], date: '2099-01-06', time: '10:00', status: 'confirmé', source: 'couronne', dureeMin: 60, cleDuNumero: '22997000090', priceXof: 20000 };
    await comme('serveur', `insert into public.appointments (id, branch_id, data) values ('rdv-pose-1', 'br-1', ${q({ id: 'rdv-pose-1', ...duServeur })});`);
    const repousse = await pousse('rdv-pose-1', { ...duServeur, note: 'vu' });
    const apres = await ligneDe('rdv-pose-1');
    dit('D2 Ma Couronne repousse le rendez-vous que le serveur a pose confirme (sa synchronisation) : il reste confirme ; rien de « Annonce par son appareil », ses marques restent',
      ['ecrit', 'confirmé', false, '22997000090', 20000], [repousse, apres?.status, /Annoncé par son appareil/.test(String(apres?.note ?? '')), apres?.cleDuNumero, apres?.priceXof]);
    const neuve = await pousse('rdv-neuf-1', { ...duServeur, cleDuNumero: undefined, date: '2099-01-07', ouiNoteParLeComptoir: true });
    const lue = await ligneDe('rdv-neuf-1');
    dit('D3 un rendez-vous NEUF ecrit par elle : « confirme » retombe « en attente », ni prix fige, ni marque du comptoir ; ce qu elle annoncait passe dans la note',
      ['ecrit', 'en attente', false, false, true], [neuve, lue?.status, 'priceXof' in (lue ?? {}), 'ouiNoteParLeComptoir' in (lue ?? {}), /Annoncé par son appareil : prix 20000 F/.test(String(lue?.note ?? ''))]);
    const monte = await pousse('rdv-neuf-1', { ...lue, status: 'confirmé', ouiNoteParLeComptoir: true });
    const parMiseAJour = await comme('cliente', `update public.appointments set data = data || '{"status":"confirmé"}'::jsonb where id = 'rdv-neuf-1';`);
    const toujours = await ligneDe('rdv-neuf-1');
    dit('D4 elle ne monte pas son rendez-vous en « confirme », ni par sa synchronisation ni par une mise a jour ; elle ne pose pas la marque du comptoir',
      ['ecrit', 'ecrit', 'en attente', false], [monte, parMiseAJour, toujours?.status, 'ouiNoteParLeComptoir' in (toujours ?? {})]);
    /* LA LIBÉRATION, POUR DE VRAI : toutes les échéances sont passées. */
    const passee = '2000-01-01T00:00:00.000Z';
    const place = (o: Record<string, unknown>) => ({ branchId: 'br-1', clientId: '', serviceIds: ['sv-lavage'], status: 'confirmé', source: 'site', suggereLe: passee, attenduJusquAu: passee, date: '2099-01-08', time: '10:00', ...o });
    const PLACES: Record<string, Record<string, unknown>> = {
      'rdv-a-venir': place({}),
      'rdv-commence': place({ date: '2000-01-01', time: '10:00' }),
      'rdv-illisible': place({ date: '08/01/2099' }),
      'rdv-comptoir': place({ depositXof: 6000, confirmeeParLaClienteLe: passee, ouiNoteParLeComptoir: true }),
      'rdv-oui-sans-acompte-recu': place({ depositXof: 6000, confirmeeParLaClienteLe: passee }),
      'rdv-ferme': place({ confirmeeParLaClienteLe: passee }),
      'rdv-marque-sans-oui': place({ ouiNoteParLeComptoir: true }),
    };
    for (const [id, d] of Object.entries(PLACES)) await comme('serveur', `insert into public.appointments (id, branch_id, data) values ('${id}', 'br-1', ${q({ id, ...d })});`);
    const n = Number((await base.query('select public.libere_les_places_en_attente() as n')).rows[0]?.n);
    const etats = Object.fromEntries(await Promise.all(Object.keys(PLACES).map(async (id) => [id, (await ligneDe(id))?.status])));
    const jumeaux = Object.fromEntries(Object.entries(PLACES).map(([id, d]) => [id, placeALiberer(d, REEL.now()) ? 'annulé' : 'confirmé']));
    dit('D5 la vraie liberation : la place a venir et le oui par WhatsApp sans l acompte se liberent ; l heure venue, un jour illisible, le oui du comptoir, une place ferme restent ; et placeALiberer dit la meme chose, place par place',
      [3, { 'rdv-a-venir': 'annulé', 'rdv-commence': 'confirmé', 'rdv-illisible': 'confirmé', 'rdv-comptoir': 'confirmé', 'rdv-oui-sans-acompte-recu': 'annulé', 'rdv-ferme': 'confirmé', 'rdv-marque-sans-oui': 'annulé' }, true],
      [n, etats, JSON.stringify(jumeaux) === JSON.stringify(etats)]);
    await base.close();
    (globalThis as any).Date = Horloge;
  }
}

console.log(`\n${n - ko}/${n} epreuves tenues${ko ? `, ${ko} en echec` : ''}.`);
if (ko) process.exitCode = 1;
