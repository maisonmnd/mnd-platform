/* L'AGENT DES RENDEZ-VOUS, ÉPROUVÉ — `node scripts/verifie-l-agent-des-rendez-vous.mjs`.

   18 novembre 2026 : « Dites-le. C'est posé. » Claude lit la phrase, la
   Maison fait le reste. Ce banc éprouve le module pur
   (src/shared/agent-des-rendez-vous-pur.ts), la porte (ia-maison) qui ouvre
   le chantier « rendez-vous », et le branchement : la carte « Son prochain
   rituel » qui reçoit le souhait, la fenêtre de l'agent, la barre du haut.
   Tout est inventé : des clientes en initiales, aucun numéro.
   Sortie ASCII : la console de Windows. */
import {
  CHANTIER_DE_L_AGENT, USAGE_DE_L_AGENT, SCHEMA_DE_L_AGENT, JOURS_DU_CALENDRIER, JOURS_DE_LA_FENETRE_MAX, GESTES_MAX,
  calendrierDit, clientesQuiRepondent, consigneDeLAgent, heureLue, laCliente, laPlaceDuSouhait, lectureDeLAgent,
  leRituelVoulu, motsDuNom, phraseDuSouhait, phrasePourClaude, plusJours,
} from '../src/shared/agent-des-rendez-vous-pur';
import type { PrestationDuCatalogue } from '../src/shared/devis-par-description-pur';
import { CHANTIERS_IA, DEPARTEMENTS_PAR_CHANTIER, peutDemander, saitLAgentDesRendezVous } from '../src/shared/ia-maison-pur';
import { readFileSync } from 'node:fs';

let n = 0;
const ascii = (v: unknown): string =>
  (JSON.stringify(v) ?? 'undefined').replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) process.exitCode = 1;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : ` -> ${ascii(obtenu)}`}`);
  if (!ok) console.log(`       attendu ${ascii(attendu)}`);
};
const lf = (s: string) => s.replace(/\r\n/g, '\n');
const lis = (f: string) => lf(readFileSync(f, 'utf8'));

const AUJ = '2026-11-18'; // un mercredi
const CAT: PrestationDuCatalogue[] = [
  { id: 'sinsin-ess', name: 'SÍNSIN™ Essentiel · La Reprise', priceXof: 20000, categoryId: 'gbeji' },
  { id: 'sinsin-sig', name: 'SÍNSIN™ Signature · La Reprise Longue Durée', priceXof: 25000, categoryId: 'gbeji' },
  { id: 'lavage', name: 'KLƆKLƆ™ Essentiel · Le Lavage', priceXof: 8000, categoryId: 'klo' },
  { id: 'creation', name: 'VÈKPÈ™ Création Medium', priceXof: 0, categoryId: 'atl-i-vekpe', tarifMode: 'lock' },
  { id: 'vieille', name: 'Ancienne prestation', priceXof: 5000, categoryId: 'klo', archived: true },
  { id: 'essai', name: 'Essai de paiement · 100 F', priceXof: 100, categoryId: '8p8i2vwmx3' },
];

/* ── ① LE CALENDRIER QUE LIT CLAUDE ───────────────────────────────────── */
const cal = calendrierDit(AUJ).split('\n');
dit('cent vingt jours, aujourd hui d abord, demain ensuite', [JOURS_DU_CALENDRIER, '2026-11-18 | mercredi (aujourd’hui)', '2026-11-19 | jeudi (demain)'], [cal.length, cal[0], cal[1]]);
dit('les jours de la semaine sont justes, au passage des mois et de l annee', [true, true, true, true, true],
  [cal.includes('2026-11-21 | samedi'), cal.includes('2026-11-30 | lundi'), cal.includes('2026-12-01 | mardi'), cal.includes('2026-12-31 | jeudi'), cal.includes('2027-01-01 | vendredi')]);
dit('le dernier jour du calendrier', '2027-03-17 | mercredi', cal[cal.length - 1]);
dit('les jours se comptent en UTC (jamais l heure de la machine)', ['2026-12-01', '2027-01-01', '2026-11-17'], [plusJours('2026-11-30', 1), plusJours('2026-12-31', 1), plusJours(AUJ, -1)]);

/* ── ② LA CONSIGNE ─────────────────────────────────────────────────────── */
const consigne = consigneDeLAgent({ services: CAT, aujourdhui: AUJ });
dit('la consigne porte le calendrier et le catalogue propre (ni archivee, ni essai)', [true, true, true, false, false],
  [consigne.includes('2026-11-21 | samedi'), consigne.includes('sinsin-ess | SÍNSIN™ Essentiel · La Reprise'), consigne.includes('creation | VÈKPÈ™ Création Medium'), consigne.includes('vieille |'), consigne.includes('essai |')]);
dit('aucun prix ne part vers Claude (le catalogue se dit par identifiant et nom)', [false, false, false], [consigne.includes('20000'), consigne.includes('25000'), /\d+\s?F\b/.test(consigne.replace('160 000 F', ''))]);
dit('la consigne interdit le prix, la promesse et le calcul de tete', [true, true, true],
  [/Tu ne dis jamais un prix/.test(consigne), /tu ne promets aucune place/.test(consigne), /jamais calculée de tête/.test(consigne)]);
dit('la cliente se dit telle qu elle est dite : la Maison la cherche dans son carnet', [true, true], [/TEL QU’IL EST DIT/.test(consigne), /la Maison qui cherche la cliente dans son carnet/.test(consigne)]);
dit('la consigne ne recoit que le catalogue et le jour, jamais les fiches', 1, consigneDeLAgent.length);
const props = (SCHEMA_DE_L_AGENT as { properties: Record<string, unknown>; required: string[] });
dit('le schema demande la cliente dite, des gestes, la fenetre, l heure, le moment', ['cliente', 'gestes', 'du', 'au', 'heure', 'moment', 'reserves'], props.required);
dit('le schema ne porte aucun champ de prix ni de numero', false, Object.keys(props.properties).some((k) => /prix|xof|montant|tel|phone|numero/i.test(k)));
dit('le chantier : rendez-vous, usage texte', ['rendez-vous', 'texte'], [CHANTIER_DE_L_AGENT, USAGE_DE_L_AGENT]);

/* ── ③ LA LECTURE, REVALIDÉE ──────────────────────────────────────────── */
const lu = (o: Record<string, unknown>) => lectureDeLAgent({ cliente: 'Mme T.', gestes: [], du: '', au: '', heure: '', moment: '', reserves: [], ...o }, CAT, AUJ)!;
dit('une reponse qui n est pas un objet est refusee', [null, null, null], [lectureDeLAgent(null, CAT, AUJ), lectureDeLAgent('texte', CAT, AUJ), lectureDeLAgent([1], CAT, AUJ)]);
const g = lu({ gestes: ['sinsin-ess', 'inventee', 'vieille', 'sinsin-ess', 'lavage', 'creation', 'sinsin-sig'] });
dit('les gestes : hors catalogue ou archive ecartes et dits, sans doublon, quatre au plus', [['sinsin-ess', 'lavage', 'creation', 'sinsin-sig'], 2],
  [g.gestes, g.reserves.filter((r) => /pas au catalogue/.test(r)).length]);
dit('quatre gestes au plus', GESTES_MAX, lu({ gestes: ['sinsin-ess', 'lavage', 'creation', 'sinsin-sig'] }).gestes.length);
dit('un jour seul : du egale au', ['2026-11-21', '2026-11-21'], [lu({ du: '2026-11-21' }).du, lu({ du: '2026-11-21' }).au]);
dit('seulement au : il devient le jour seul', ['2026-11-24', '2026-11-24'], [lu({ au: '2026-11-24' }).du, lu({ au: '2026-11-24' }).au]);
dit('une fenetre a l envers se remet a l endroit', ['2026-11-23', '2026-11-28'], [lu({ du: '2026-11-28', au: '2026-11-23' }).du, lu({ du: '2026-11-28', au: '2026-11-23' }).au]);
dit('une date qui n existe pas est ecartee', ['', ''], [lu({ du: '2026-02-31' }).du, lu({ du: '2026-11-1' }).du]);
const passee = lu({ du: '2026-11-10', au: '2026-11-12' });
dit('une fenetre passee est ecartee et dite : la Maison suit son rythme', ['', '', true], [passee.du, passee.au, passee.reserves.some((r) => /passée/.test(r))]);
dit('une fenetre commencee hier commence aujourd hui', ['2026-11-18', '2026-11-20'], [lu({ du: '2026-11-16', au: '2026-11-20' }).du, lu({ du: '2026-11-16', au: '2026-11-20' }).au]);
const loin = lu({ du: '2027-06-01' });
dit('une date hors du calendrier est ecartee et dite', ['', true], [loin.du, loin.reserves.some((r) => /trop loin/.test(r))]);
dit('une fenetre ne depasse pas six semaines', plusJours('2026-11-20', JOURS_DE_LA_FENETRE_MAX - 1), lu({ du: '2026-11-20', au: '2027-02-20' }).au);
dit('les heures se lisent : 10 h, 9h30, 14:00 ; 25:00 et midi non', ['10:00', '09:30', '14:00', '', ''], [heureLue('10 h'), heureLue('9h30'), heureLue('14:00'), heureLue('25:00'), heureLue('midi')]);
dit('le moment : matin, apres-midi, ou rien', ['matin', 'apres-midi', ''], [lu({ moment: 'matin' }).moment, lu({ moment: 'apres-midi' }).moment, lu({ moment: 'soir' }).moment]);
dit('la cliente dite est gardee, nettoyee et bornee', ['Mme T.', 80], [lu({ cliente: '  Mme   T. ' }).cliente, lu({ cliente: 'x'.repeat(200) }).cliente.length]);
dit('la phrase trop courte ne part pas, la longue est bornee', [null, 600], [phrasePourClaude('ok'), phrasePourClaude('x'.repeat(2000))!.length]);

/* ── ④ LA CLIENTE, CHERCHÉE AU CARNET ─────────────────────────────────── */
const FICHES = [
  { id: 'c1', name: 'Aïcha K.' },
  { id: 'c2', name: 'Aïchatou B.' },
  { id: 'c3', name: 'Tèmi T.' },
  { id: 'c4', name: 'Tanya B.' },
  { id: 'c5', name: 'Fifi A.' },
  { id: 'c6', name: 'Tobi Z.', archived: true },
];
const recence: Record<string, string> = { c3: '2026-10-02', c4: '2026-11-14' };
const rec = (id: string) => recence[id] ?? '';
dit('les mots d un nom : sans accent, sans ponctuation', ['aicha', 'k'], motsDuNom('Aïcha K.'));
dit('« Aicha » retient Aicha K., mot pour mot, devant Aichatou B.', { genre: 'une', id: 'c1' }, ((r) => ({ genre: r.genre, id: r.genre === 'une' ? r.fiche.id : null }))(laCliente('Aicha', FICHES, rec)));
const lesT = laCliente('Mme T.', FICHES, rec);
dit('« Mme T. » montre toutes les T., la plus recente d abord, jamais une archivee', { genre: 'plusieurs', ids: ['c4', 'c3'] },
  { genre: lesT.genre, ids: lesT.genre === 'plusieurs' ? lesT.fiches.map((f) => f.id) : [] });
dit('« Madame Temi » : sans accent, la civilite ne compte pas', 'c3', ((r) => (r.genre === 'une' ? r.fiche.id : r.genre))(laCliente('Madame Temi', FICHES, rec)));
dit('« Fifi », seule a repondre, est retenue', 'c5', ((r) => (r.genre === 'une' ? r.fiche.id : r.genre))(laCliente('Fifi', FICHES)));
dit('un nom que personne ne porte : aucune', 'aucune', laCliente('Gertrude', FICHES).genre);
dit('une civilite seule ne nomme personne', 'aucune', laCliente('Madame', FICHES).genre);
dit('« Aich » (un debut) donne le choix entre les deux', 'plusieurs', laCliente('Aich', FICHES).genre);
dit('chaque mot dit doit repondre : « Aicha B. » trouve Aichatou B., jamais Aicha K.', ['c2'], clientesQuiRepondent('Aicha B.', FICHES).map((c) => c.fiche.id));
dit('« Mme T. » ne retient jamais d office une cliente nommee « ... T. »', 'plusieurs', laCliente('Mme T.', [{ id: 'a', name: 'Rose T.' }, { id: 'b', name: 'Toyin A.' }]).genre);

/* ── ⑤ LE RITUEL ET LA PLACE DU SOUHAIT ───────────────────────────────── */
const famille = (id: string) => CAT.find((s) => s.id === id)?.categoryId;
const RITUELS = [{ ids: ['lavage'] }, { ids: ['sinsin-sig', 'lavage'] }];
dit('« sa reprise » lue Essentielle retrouve sa reprise Signature (meme famille)', 1, leRituelVoulu(RITUELS, ['sinsin-ess'], famille));
dit('le rituel qui porte tous les gestes nommes passe d abord', 0, leRituelVoulu(RITUELS, ['lavage'], famille));
dit('un geste qu elle n a jamais pris : aucun de ses rituels', -1, leRituelVoulu(RITUELS, ['creation'], famille));
dit('aucun geste nomme : rien a choisir ici (son rituel d office)', -1, leRituelVoulu(RITUELS, [], famille));

const JOURNEES: Record<string, { ferme: boolean; heures: string[] }> = {
  '2026-11-23': { ferme: true, heures: [] },
  '2026-11-24': { ferme: false, heures: ['08:30', '10:00', '11:00', '14:00', '16:00'] },
  '2026-11-25': { ferme: false, heures: ['09:00', '15:00'] },
};
const placesDe = (iso: string) => JOURNEES[iso] ?? { ferme: false, heures: [] };
const souhait = (o: Partial<{ du: string; au: string; heure: string; moment: '' | 'matin' | 'apres-midi' }>) => ({ du: '2026-11-23', au: '2026-11-28', heure: '', moment: '' as const, ...o });
const place = (o: Parameters<typeof souhait>[0], habituelle: string | null = null) => laPlaceDuSouhait({ souhait: souhait(o), aujourdhui: AUJ, heureHabituelle: habituelle, placesDe });
dit('le premier jour ouvert de la fenetre, a son heure habituelle', { iso: '2026-11-24', heure: '11:00', ecart: 'aucun' }, place({}, '11:00'));
dit('sans heure habituelle : la premiere place du jour', { iso: '2026-11-24', heure: '08:30', ecart: 'aucun' }, place({}));
dit('l heure dite, libre', { iso: '2026-11-24', heure: '10:00', ecart: 'aucun' }, place({ heure: '10:00' }, '16:00'));
dit('l heure dite, prise : la plus proche ce jour-la, et l ecart se dit', { iso: '2026-11-24', heure: '08:30', ecart: 'heure' }, place({ heure: '09:00' }));
dit('l apres-midi : les places de midi et apres', { iso: '2026-11-24', heure: '14:00', ecart: 'aucun' }, place({ moment: 'apres-midi' }));
dit('le matin, avec une heure habituelle l apres-midi : elle ne compte pas', { iso: '2026-11-24', heure: '08:30', ecart: 'aucun' }, place({ moment: 'matin' }, '16:00'));
dit('un jour sans place au moment dit passe au suivant', { iso: '2026-11-25', heure: '09:00', ecart: 'aucun' }, place({ du: '2026-11-25', moment: 'matin' }));
dit('rien dans la fenetre : aucune place (jamais hors de la fenetre)', null, place({ du: '2026-11-26', au: '2026-11-28' }));
dit('sans date dite : rien ici, la carte suit son rythme', null, place({ du: '' }));
const jourDit = (iso: string) => ({ '2026-11-23': 'lundi 23 novembre 2026', '2026-11-28': 'samedi 28 novembre 2026', '2026-11-24': 'mardi 24 novembre 2026' } as Record<string, string>)[iso] ?? iso;
const heureDite = (h: string) => h.replace(':00', ' h').replace(':', ' h ');
dit('la carte dit ce qui a ete demande', 'Demandé : du lundi 23 novembre 2026 au samedi 28 novembre 2026, le matin.',
  phraseDuSouhait({ souhait: souhait({ moment: 'matin' }), place: { iso: '2026-11-24', heure: '08:30', ecart: 'aucun' }, jourDit, heureDite }));
dit('... et l ecart de l heure', 'Demandé : le mardi 24 novembre 2026, à 9 h. 9 h est prise ce jour-là : la plus proche est 08 h 30.',
  phraseDuSouhait({ souhait: souhait({ du: '2026-11-24', au: '2026-11-24', heure: '09:00' }), place: { iso: '2026-11-24', heure: '08:30', ecart: 'heure' }, jourDit, heureDite }).replace('09 h', '9 h').replace('09 h', '9 h'));
dit('... et qu il n y a rien dans la fenetre', true, /Aucune place libre pour sa durée dans cette fenêtre/.test(phraseDuSouhait({ souhait: souhait({}), place: null, jourDit, heureDite })));

/* ── ⑥ LA PORTE ───────────────────────────────────────────────────────── */
dit('le chantier est ouvert, la clientele et la vente le demandent, l atelier non', [true, true, true, false],
  [(CHANTIERS_IA as readonly string[]).includes('rendez-vous'), peutDemander('maitre', 'rendez-vous', { 'dept-clientele': true }), peutDemander('maitre', 'rendez-vous', { 'dept-vente-caisse': true }), peutDemander('maitre', 'rendez-vous', { 'dept-atelier': true })]);
dit('departements du chantier', ['dept-clientele', 'dept-vente-caisse'], [...DEPARTEMENTS_PAR_CHANTIER['rendez-vous']]);
dit('le Trone ne propose l agent que si la fonction le sait', [false, false, true], [saitLAgentDesRendezVous(undefined), saitLAgentDesRendezVous('2026-11-13-a'), saitLAgentDesRendezVous('2026-11-18-a')]);
const serveur = lis('supabase/functions/ia-maison/index.ts');
const pur = lis('src/shared/ia-maison-pur.ts');
const bloc = (t: string) => { const a = t.indexOf('/* ⟨ia-maison⟩ */'); const b = t.indexOf('/* ⟨/ia-maison⟩ */'); return a >= 0 && b > a ? t.slice(a, b) : ''; };
dit('la fonction porte le meme bloc que le depot, et dit 2026-11-18-a', [true, true, true], [bloc(serveur) !== '' && bloc(serveur) === bloc(pur), /const VERSION = '2026-11-18-a';/.test(serveur), /'rendez-vous': \['dept-clientele', 'dept-vente-caisse'\]/.test(serveur)]);

/* ── ⑦ LE BRANCHEMENT ─────────────────────────────────────────────────── */
const carte = lis('src/apps/trone/routes/vente/SonProchainRituel.tsx');
dit('la carte recoit le souhait : rituel voulu, place de la fenetre, phrase', [true, true, true],
  [/leRituelVoulu\(rituels, voulus,/.test(carte), /laPlaceDuSouhait\(\{ souhait, aujourdhui, heureHabituelle: sonHeure,/.test(carte), /phraseDuSouhait\(\{ souhait, place: placeDuSouhait,/.test(carte)]);
dit('l agent pose toujours sur Team, jamais une personne', [true, true], [/const maitreDeTeam = branch\.masters\.find\(\(m\) => sameName\(m, 'Team'\)\) \?\? maitreParDefaut\(branch\);/.test(carte), /: souhait && tarif\s*\n\s*\? maitreDeTeam/.test(carte)]);
dit('ce que l agent pose, elle l a choisi avec nous (confirme)', true, /useState<QuiAChoisi>\(souhait \? 'choisi' : 'suggere'\)/.test(carte));
dit('la carte offre a l hote de valider sans fermer, et dit si la place se pose ici', [true, true],
  [/const valider = \(\) => \{ if \(carte\.place && !carte\.valide && !carte\.dejaLa && !carte\.retire\) fais\(\{ genre: 'valider', id: uid\(\) \}\); \};/.test(carte), /const aPoser = !!carte\.place && !carte\.valide && !carte\.dejaLa && !carte\.retire && !casAPart\(carte\.place\.iso\);/.test(carte)]);
const fenetre = lis('src/apps/trone/shell/FenetreDeLAgent.tsx');
dit('la fenetre n envoie a Claude que la phrase, avec le catalogue et le jour', [true, true],
  [/systeme: consigneDeLAgent\(\{ services, aujourdhui \}\),/.test(fenetre), /messages: \[\{ role: 'user', content: phrase \}\],/.test(fenetre)]);
dit('la cliente se cherche au Trone, puis la carte recoit le souhait', [true, true],
  [/laCliente\(lu\.cliente, clients,/.test(fenetre), /<SonProchainRituel clientId=\{clientId\} serviceIds=\{\[\]\} jour=\{jour\} longueur=\{longueur\} souhait=\{souhait\} onFerme=\{onFerme\}>/.test(fenetre)]);
dit('l agent valide seul, une seule fois, et Terminer envoie la confirmation', [true, true],
  [/if \(tente\.current \|\| !aPoser\) return;\s*\n\s*tente\.current = true;\s*\n\s*valider\(\);/.test(fenetre), /<Modal title="L’agent des rendez-vous" onClose=\{v\.terminer\} width=\{760\}>/.test(fenetre)]);
const shell = lis('src/apps/trone/shell/Shell.tsx');
const bouton = lis('src/apps/trone/shell/AgentDesRendezVous.tsx');
dit('le bouton est dans la barre du haut, a cote de Creer, et n apparait que s il le peut', [true, true],
  [/<AgentDesRendezVous \/>\s*\n\s*<MenuCreer /.test(shell), /if \(!saitFaire \|\| !peutDemander\(moi\?\.role, CHANTIER_DE_L_AGENT, mesDomaines\)\) return null;/.test(bouton)]);

console.log(`\n${n} verifications.`);
if (process.exitCode) console.log('ECHEC : l agent des rendez-vous ne tient pas ses promesses.');
else console.log('TOUT VA BIEN : l agent des rendez-vous tient ses promesses.');
