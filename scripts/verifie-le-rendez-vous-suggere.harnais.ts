/* LE RENDEZ-VOUS SUGGÉRÉ, ÉPROUVÉ — `node scripts/verifie-le-rendez-vous-suggere.mjs`.

   14 novembre 2026, Mme F. : « je n'avais pas pris de rdv pour demain ».
   La carte « Son prochain rituel » avait posé sa suite au statut confirmé,
   et tout le reste l'a cru (Gérard, le rappel de la veille, l'assistant).
   Maquette PeiD4o4yfCY4GajdGJ52Ez, arbitrages A à D (14 novembre 2026),
   « construis » le 15. Le banc rejoue la règle pure, la carte, les
   messages, Ma Couronne, l'assistant, et lit les copies du serveur. */
import { readFileSync } from 'node:fs';
import {
  estSuggere, etatDeLaSuggestion, ceQueDitLaSuggestion, jourDeLaRelance, semaineDuRythme, dansNSemaines, laPlaceDeLaPuce,
  marqueDeLaPose, comptesAVenir, suggestionsSansReponse, noteDuComptoir, initialesDe, texteDeLaProposition, texteDeLaRelance,
  composantsDeLaProposition, SEMAINES_DE_LA_SUITE,
} from '../src/shared/rendez-vous-suggere-pur';
import { rappelDeLaVeilleSeTait, suggestionSansOui } from '../src/shared/heures-des-rappels-pur';
import { reprisesAProposer } from '../src/shared/reservation-express';
import { carteNeuve, gesteSurLaCarte, pastilleDeLaCarte, ceQuiPartVersElle, issueDeLaFermeture } from '../src/shared/carte-du-prochain-rituel-pur';
import { leRendezVousDuProchainRituel } from '../src/shared/prochain-rituel-pur';
import { marqueLaSuggestion, noteSonOui } from '../src/shared/carte-du-prochain-rituel';
import { appointmentsStore, type Appointment } from '../src/shared/agenda';
import { etatDeLaSeance } from '../src/shared/abonnee-pur';
import { prochainRdvDe, contextePourClaude } from '../src/shared/ia-reponse-wa-pur';
import { REGISTRE_DES_MODELES } from '../src/shared/porte-des-modeles-pur';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};
const lit = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

/* ── 1. La marque ── */
{
  const pose = '2026-11-14T13:00:00.000Z';
  dit('une suggestion sans oui est suggeree', true, estSuggere({ status: 'confirmé', suggereLe: pose }));
  dit('son oui la rend confirmee', false, estSuggere({ status: 'confirmé', suggereLe: pose, confirmeeParLaClienteLe: '2026-11-15T09:00:00Z' }));
  dit('une reprise d avant (repriseDe seul) reste confirmee (arbitrage B)', false, estSuggere({ status: 'confirmé', repriseDe: 'r1' } as never));
  dit('annulee, elle n est plus une suggestion', false, estSuggere({ status: 'annulé', suggereLe: pose }));
  dit('les etats', ['sans-reponse', 'autre-moment', 'confirmee', null], [
    etatDeLaSuggestion({ status: 'confirmé', suggereLe: pose }),
    etatDeLaSuggestion({ status: 'confirmé', suggereLe: pose, autreMomentDemandeLe: '2026-11-15T09:00:00Z' }),
    etatDeLaSuggestion({ status: 'confirmé', suggereLe: pose, confirmeeParLaClienteLe: '2026-11-15T09:00:00Z' }),
    etatDeLaSuggestion({ status: 'confirmé' }),
  ]);
  dit('la relance tombe trois jours avant', '2026-12-23', jourDeLaRelance('2026-12-26'));
  const court = (iso: string) => ({ '2026-11-14': '14 nov. 2026', '2026-12-23': '23 déc. 2026', '2026-11-08': '8 nov. 2026', '2026-11-07': '7 nov. 2026' } as Record<string, string>)[iso] ?? iso;
  dit('la tuile dit la proposition, sans reponse, et sa relance', 'Proposé le 14 nov. 2026 · sans réponse · relance le 23 déc. 2026',
    ceQueDitLaSuggestion({ status: 'confirmé', suggereLe: pose, date: '2026-12-26' }, { court, aujourdhui: '2026-11-15' }));
  dit('la tuile d une suggestion confirmee', 'Suggéré le 7 nov. 2026, confirmé par elle le 8 nov. 2026',
    ceQueDitLaSuggestion({ status: 'confirmé', suggereLe: '2026-11-07T10:00:00Z', confirmeeParLaClienteLe: '2026-11-08T10:00:00Z', date: '2026-12-26' }, { court, aujourdhui: '2026-11-15' }));
  dit('la pose : suggere ou rien', [{ suggereLe: pose }, {}], [marqueDeLaPose('suggere', pose), marqueDeLaPose('choisi', pose)]);
}

/* ── 2. Les messages : une proposition se dit comme une proposition ── */
{
  const o = { appel: 'Mme F.', quand: 'samedi 26 décembre 2026 à 13 h 30', gestes: 'Lavage rituel et Reprise des racines' };
  dit('la proposition, mot pour mot comme la maquette',
    /* Le corps approuvé chez Meta le 15 novembre 2026 (ID 1137098799075487), question finale comprise. */
    'Bonjour Mme F., merci pour votre visite. Pour garder le rythme de vos locks, nous vous proposons votre prochain rituel le samedi 26 décembre 2026 à 13 h 30 : Lavage rituel et Reprise des racines. Cette date vous convient-elle ?',
    texteDeLaProposition(o));
  dit('la relance ne dit jamais « votre rendez-vous »', false, /votre rendez-vous/i.test(texteDeLaRelance(o)));
  dit('la relance demande si la proposition convient', true, texteDeLaRelance(o).includes('notre proposition du samedi 26 décembre 2026 à 13 h 30'));
  const c = composantsDeLaProposition({ ...o, apptId: 'ap-1' }) as { type: string; parameters: { text?: string; payload?: string }[] }[];
  dit('trois variables, puis Je confirme et Un autre moment', [['Mme F.', o.quand, o.gestes], 'REPRISE_OK:ap-1', 'REPRISE_AUTRE:ap-1'],
    [c[0].parameters.map((p) => p.text), c[1].parameters[0].payload, c[2].parameters[0].payload]);
  const p = REGISTRE_DES_MODELES.find((e) => e.famille === 'proposition');
  dit('la proposition a sa famille au registre de la porte', { type: 'proposition', modeles: ['proposition_rituel'], secrets: ['WA_TEMPLATE_PROPOSITION'], depose: 'confirmation-rdv', rappel: false },
    p ? { type: p.type, modeles: p.modeles, secrets: p.secrets, depose: p.depose, rappel: p.rappel } : null);
}

/* ── 3. Le rappel de la veille et la relance (arbitrages A et B) ── */
{
  const date = '2026-12-26';
  dit('un rendez-vous pris par elle : la veille part', false, rappelDeLaVeilleSeTait({ date }));
  dit('pris par elle, « Oui, je viens » a J-2 : la veille se tait (2 novembre 2026)', true, rappelDeLaVeilleSeTait({ date, confirmeeParLaClienteLe: '2026-12-24T10:00:00Z' }));
  dit('une suggestion sans oui : pas de « votre rendez-vous est demain »', true, rappelDeLaVeilleSeTait({ date, suggereLe: '2026-11-14T13:00:00Z' }));
  dit('une suggestion confirmee en fermant la fenetre : la veille part', false, rappelDeLaVeilleSeTait({ date, suggereLe: '2026-11-14T13:00:00Z', confirmeeParLaClienteLe: '2026-11-14T13:30:00Z' }));
  dit('une suggestion confirmee a la relance : la veille se tait', true, rappelDeLaVeilleSeTait({ date, suggereLe: '2026-11-14T13:00:00Z', confirmeeParLaClienteLe: '2026-12-23T18:00:00Z' }));
  dit('deux heures avant, une suggestion sans oui se tait aussi', [true, false],
    [suggestionSansOui({ suggereLe: '2026-11-14T13:00:00Z' }), suggestionSansOui({ suggereLe: '2026-11-14T13:00:00Z', confirmeeParLaClienteLe: 'x' })]);
  const rdvs = [
    { id: 's', date, status: 'confirmé', clientId: 'c', repriseDe: 'r', suggereLe: '2026-11-14T13:00:00Z' },
    { id: 'ancienne', date, status: 'confirmé', clientId: 'c2', repriseDe: 'r2' },
    { id: 'oui', date, status: 'confirmé', clientId: 'c3', suggereLe: 'x', confirmeeParLaClienteLe: 'y' },
    { id: 'autre', date, status: 'confirmé', clientId: 'c4', suggereLe: 'x', autreMomentDemandeLe: 'y' },
  ];
  dit('la relance J-3 : seulement la suggestion sans reponse, jamais une reprise d avant', ['s'], reprisesAProposer(rdvs, date).map((a) => a.id));
  dit('le comptoir la veille : celles de demain sans oui', ['s', 'ancienne'].filter((x) => x === 's'), suggestionsSansReponse(rdvs, date).filter((a) => !a.autreMomentDemandeLe).map((a) => a.id));
  const note = noteDuComptoir([{ initiales: initialesDe('Mme Floriane Adjo'), heure: '13 h 30' }]);
  dit('le comptoir lit des initiales et une heure, jamais un nom', { titre: 'Une suggestion de demain sans réponse', corps: 'F. A. à 13 h 30. Appelez-la pour confirmer, ou libérez la place au Carnet.' }, note);
}

/* ── 4. Les semaines de la suite (« 3, 4, 5, 6, 8 et 12 semaines ») ── */
{
  dit('les six puces', [3, 4, 5, 6, 8, 12], [...SEMAINES_DE_LA_SUITE]);
  dit('son rythme : 42 j -> 6, 35 j -> 5, 49 j -> 6, 70 j -> 8, 120 j -> 12, rien -> null', [6, 5, 6, 8, 12, null],
    [42, 35, 49, 70, 120, null].map((j) => semaineDuRythme(j)));
  dit('six semaines apres le 14 novembre 2026', '2026-12-26', dansNSemaines('2026-11-14', 6));
  const places = (iso: string) => ({
    '2026-12-12': { ferme: false, heures: ['10:00', '15:00'] },
    '2026-12-26': { ferme: false, heures: ['10:00', '13:30', '16:00'] },
    '2027-01-02': { ferme: true, heures: [] },
    '2027-01-03': { ferme: false, heures: [] },
    '2027-01-04': { ferme: false, heures: ['13:30'] },
  } as Record<string, { ferme: boolean; heures: string[] }>)[iso] ?? { ferme: true, heures: [] };
  dit('le jour vise, a son heure', { iso: '2026-12-26', heure: '13:30', vise: '2026-12-26', ecart: 'aucun' },
    laPlaceDeLaPuce({ vise: '2026-12-26', aujourdhui: '2026-11-15', placesDe: places, heureHabituelle: '13:30' }));
  dit('son heure prise : l heure libre la plus proche', { iso: '2026-12-12', heure: '15:00', vise: '2026-12-12', ecart: 'heure' },
    laPlaceDeLaPuce({ vise: '2026-12-12', aujourdhui: '2026-11-15', placesDe: places, heureHabituelle: '13:30' }));
  dit('ferme ou plein : le jour ouvert suivant', { iso: '2027-01-04', heure: '13:30', vise: '2027-01-02', ecart: 'jour' },
    laPlaceDeLaPuce({ vise: '2027-01-02', aujourdhui: '2026-11-15', placesDe: places, heureHabituelle: '13:30' }));
  dit('jamais avant demain', '2026-11-16', laPlaceDeLaPuce({ vise: '2026-11-10', aujourdhui: '2026-11-15', placesDe: () => ({ ferme: false, heures: ['10:00'] }) })?.iso);
}

/* ── 5. La carte : viser ne pose rien, poser la suggestion pose et ferme ── */
{
  const depart = { iso: '2026-12-26', heure: '13:30' };
  const e0 = carteNeuve({ depart });
  const v = gesteSurLaCarte(e0, { genre: 'viser', place: { iso: '2027-01-09', heure: '13:30' } });
  dit('une puce change la place montree, et rien ne se pose', [{ iso: '2027-01-09', heure: '13:30' }, false, []], [v.etat.place, v.etat.valide, v.effets]);
  const pose = gesteSurLaCarte(v.etat, { genre: 'valider-et-terminer', id: 'n1' });
  dit('« Poser la suggestion » : poser, lever la confirmation, fermer', ['poser', 'confirmer', 'fermer'], pose.effets.map((f) => f.genre));
  const valide = gesteSurLaCarte(e0, { genre: 'valider', id: 'n2' }).etat;
  const bouge = gesteSurLaCarte(valide, { genre: 'viser', place: { iso: '2027-01-09', heure: '13:30' } });
  dit('pose, une puce deplace le meme rendez-vous, rien ne part', [{ genre: 'deplacer', rdvId: 'n2', place: { iso: '2027-01-09', heure: '13:30' } }], bouge.effets);
  const deja = carteNeuve({ depart, deja: { id: 'd1', iso: '2026-12-20', heure: '10:00' } });
  dit('un rendez-vous deja la s ouvre dans sa fiche', ['ouvrir'], gesteSurLaCarte(deja, { genre: 'viser', place: depart }).effets.map((f) => f.genre));
  dit('la pastille dit « Suggéré », puis « Confirmé » quand elle l a choisi avec nous', ['Suggéré', 'Confirmé'],
    [pastilleDeLaCarte(valide, { suggere: true }).texte, pastilleDeLaCarte(valide, { suggere: false }).texte]);
  dit('ce qu elle recoit : une proposition, une seule fois', 'part', ceQuiPartVersElle(valide, { aUnNumero: true, suggere: true }).genre);
  dit('sans le modele approuve, la fenetre le dit', 'sans-modele', ceQuiPartVersElle(valide, { aUnNumero: true, suggere: true, sansModele: true }).genre);
  dit('sans numero, aucune proposition', 'sans-numero', ceQuiPartVersElle(valide, { aUnNumero: false, suggere: true }).genre);
  const ferme = issueDeLaFermeture(valide, { qui: 'Mme F.', momentDit: () => 'samedi 26 décembre 2026 à 13 h 30', suggere: true });
  dit('la fermeture dit la proposition, pas la confirmation', [true, false], [ferme.includes('La proposition part'), ferme.includes('confirmation')]);
}

/* ── 6. Le rendez-vous construit, la marque posee et levee ── */
{
  const base = {
    id: 'ap-s', branchId: 'b', clientId: 'c', serviceIds: ['s1'], place: { iso: '2026-12-26', heure: '13:30' }, master: 'Team',
    dureeMin: 105, priceXof: 25000, depositServiceIds: [], depositXof: 0, repriseDe: 'r1', sansConfirmation: true,
  };
  dit('la carte pose la marque d une suggestion', '2026-11-15T10:00:00Z', leRendezVousDuProchainRituel({ ...base, suggereLe: '2026-11-15T10:00:00Z' }).suggereLe);
  dit('elle l a choisi avec nous : aucune marque', false, 'suggereLe' in leRendezVousDuProchainRituel(base));
  appointmentsStore.set([{ id: 'ap-s', branchId: 'b', clientId: 'c', serviceIds: ['s1'], date: '2026-12-26', time: '13:30', master: 'Team', status: 'confirmé', suggereLe: '2026-11-15T10:00:00Z' } as Appointment]);
  marqueLaSuggestion('ap-s', false);
  dit('« Elle l a choisi avec nous » apres la pose : la marque tombe', false, 'suggereLe' in (appointmentsStore.get()[0] ?? {}));
  marqueLaSuggestion('ap-s', true);
  dit('puis « Suggéré par la Maison » : elle revient', true, estSuggere(appointmentsStore.get()[0]));
  noteSonOui('ap-s');
  const a = appointmentsStore.get()[0];
  dit('« Elle a dit oui » au comptoir : confirmee, notee par le comptoir', [false, true], [estSuggere(a), a.ouiNoteParLeComptoir === true]);
}

/* ── 7. Ma Couronne, l'assistant, les chiffres ── */
{
  const s = { id: 'x', clientId: 'c', date: '2026-12-26', time: '13:30', serviceIds: [], master: 'T', branchId: 'b', status: 'confirmé', suggereLe: '2026-11-14T13:00:00Z' } as Appointment;
  dit('Ma Couronne : « Proposée par la Maison »', 'proposee', etatDeLaSeance(s, '2026-11-15'));
  dit('Ma Couronne : son oui, « confirmée »', 'confirmee', etatDeLaSeance({ ...s, confirmeeParLaClienteLe: '2026-11-15T09:00:00Z' }, '2026-11-15'));
  const p = prochainRdvDe([s], 'c', '2026-11-15', () => 'Lavage rituel');
  dit('l assistant sait que c est une proposition', true, p?.suggere === true);
  const ctx = contextePourClaude({ fil: [], fiche: { id: 'c', name: 'Floriane A.' } as never, prochainRdv: p, catalogue: [], aujourdhui: '2026-11-15' });
  dit('l assistant ne dit jamais « rendez-vous confirme » d une proposition', [true, true], [ctx.includes('PROPOSITION de la Maison'), ctx.includes('ne dis jamais qu’elle a un rendez-vous confirmé')]);
  const ctxPris = contextePourClaude({ fil: [], fiche: { id: 'c', name: 'Floriane A.' } as never, prochainRdv: prochainRdvDe([{ ...s, suggereLe: undefined }], 'c', '2026-11-15'), catalogue: [], aujourdhui: '2026-11-15' });
  dit('un rendez-vous qu elle a pris se dit comme avant', [true, false], [ctxPris.includes('Son prochain rendez-vous : '), ctxPris.includes('PROPOSITION')]);
  dit('les chiffres a venir comptent « a confirmer » a part', { confirmes: 1, aConfirmer: 1 },
    comptesAVenir([s, { ...s, id: 'y', suggereLe: undefined }, { ...s, id: 'z', date: '2026-11-01' }], '2026-11-15'));
}

/* ── 8. Les écrans et le serveur, lus dans leur source ── */
{
  const regle = lit('src/apps/trone/routes/clients/actions.tsx');
  const carte = lit('src/apps/trone/routes/vente/SonProchainRituel.tsx');
  dit('« C est regle » : deux etapes nommees, la seance fermee en une ligne, « Nouveau rendez-vous »', [true, true, true, true, true],
    ['Ensuite : son prochain rendez-vous', 'Fermer sans prochain rendez-vous', 'Nouveau rendez-vous', 'const [etape, setEtape] = useState<1 | 2>(1);', 'Pas de prochain rendez-vous'].map((m) => regle.includes(m)));
  dit('la carte : les puces, la date libre, qui a choisi, la pose marquee', [true, true, true, true, true],
    ['Dans combien de temps', 'Ou choisir une date', 'Suggéré par la Maison', 'Elle l’a choisi avec nous', '...marqueDeLaPose(quiRef.current, new Date().toISOString()),'].map((m) => carte.includes(m)));
  /* L'agent des rendez-vous (18 novembre 2026) pose ce qu'on lui demande au comptoir : « choisi » pour lui seul. */
  dit('« Suggéré par la Maison » est le choix par defaut', true, carte.includes("useState<QuiAChoisi>(souhait ? 'choisi' : 'suggere')"));
  const conf = lit('supabase/functions/confirmation-rdv/index.ts');
  dit('confirmation-rdv : la confirmation ne part pas a une suggestion, la proposition oui', [true, true, true],
    [conf.includes('for (const a of aEnvoyer.filter((x) => !estSuggere(x))) {'), conf.includes("Deno.env.get('WA_TEMPLATE_PROPOSITION')"), conf.includes('composantsDeLaProposition({ appel, quand, gestes, apptId: a.id })')]);
  const rap = lit('supabase/functions/rappels-j1/index.ts');
  dit('rappels-j1 : la relance des seules suggestions, le comptoir a 10 h', [true, true, true],
    [rap.includes("&& !!a.clientId && !!a.suggereLe\n    && !a.confirmeeParLaClienteLe && !a.autreMomentDemandeLe);"), rap.includes('heureDeCePassage === HEURE_DU_COMPTOIR_LA_VEILLE'), rap.includes('texteDeLaRelance({ appel: prenom, quand, gestes })')]);
  const push = lit('supabase/functions/push-notify/index.ts');
  dit('push-notify : deux heures avant, une suggestion sans oui se tait', true, push.includes("if (kind === 'h-2' && suggestionSansOui(a)) continue;"));
  const gerard = lit('src/shared/gerard-pur.ts');
  dit('Gerard ne « garde » jamais une suggestion', true, gerard.includes('if (r && !r.suggere && ecartJours(A, r.date) === GARDER_AVANT'));
  const wh = lit('supabase/functions/whatsapp-webhook/index.ts');
  dit('le webhook reconnait son « Je confirme » par la cle du numero (Meta livre huit chiffres, la fiche dix)', true,
    wh.includes("if (!fiche || !fiche.numeros.some((n) => cleWa(n) === cleWa(e.numero))) { dis('reprise · numéro étranger au rendez-vous'); continue; }"));
  const sql = lit('supabase/migrations/0211_le_rendez_vous_suggere.sql');
  dit('fiches_du_numero dit la suggestion a l assistant', [true, true], [sql.includes("'suggere', case when btrim(coalesce(a.data->>'suggereLe', '')) <> ''"), sql.includes('create or replace function public.fiches_du_numero(n text)')]);
  const quand = lit('src/apps/trone/routes/clients/_shared.tsx');
  dit('« Nouveau rendez-vous » › Quand : les semaines depuis sa venue, sans toucher aux sauts d aujourd hui', [true, true],
    [quand.includes('apresSaVenue={!appt && saDerniereVenue ?'), quand.includes('saDate={!appt && reprise?.iso')]);
}

console.log(ko ? `\n${ko} ECHEC(S).` : '\nTout passe.');
process.exit(ko ? 1 : 0);
