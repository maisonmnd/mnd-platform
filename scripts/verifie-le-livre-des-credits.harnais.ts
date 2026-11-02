/* LE LIVRE DES CRÉDITS, ÉPROUVÉ : `node scripts/verifie-le-livre-des-credits.mjs`.

   Le socle de la Maison intelligente (2 novembre 2026, maquette
   CrtJrZzF8E6K39dbPeHwwt) : chaque professionnel a un plafond dans les 200 $
   du mois ; les compteurs des fonctions qui appellent Claude lui sont rendus
   (src/shared/maison-intelligente-pur.ts), l'écran « Les assistants » les
   montre, Saphir les lit. Ce banc tient : les plafonds lus et la réserve,
   le livre d'un mois en long et en large, chaque chantier d'ia-maison rendu
   à un professionnel, chaque compteur des fonctions présent au livre, et
   l'écran qui le porte. Montants inventés. Sortie ASCII : la console de
   Windows. */
import {
  ALERTE_PAR_DEFAUT, CHANTIER_VERS_PROFESSIONNEL, CLES_DES_COMPTEURS, COMPTEURS_DU_LIVRE, ENVELOPPE_USD, ID_DES_PROFESSIONNELS,
  PLAFONDS_PAR_DEFAUT, PORTEURS, PROFESSIONNELS, RESERVE, alerteDe, dollarsDits, livreDuMois, moisDeCotonou, plafondsComplets,
} from '../src/shared/maison-intelligente-pur';
import { CHANTIERS_IA } from '../src/shared/ia-maison-pur';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

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
/* Le runner se place à la racine du dépôt avant d'importer : les chemins se lisent de là. */
const racine = process.cwd();
const lit = (f: string) => readFileSync(path.join(racine, f), 'utf8').replace(/\r\n/g, '\n');
const MOIS = '2026-11';
const ligne = (l: ReturnType<typeof livreDuMois>, id: string) => l.lignes.find((x) => x.id === id);

/* ── ① LE REGISTRE ET SES PLAFONDS PAR DÉFAUT ──────────────────────────── */
dit('dix professionnels, des identifiants uniques', [10, 10], [PROFESSIONNELS.length, new Set(ID_DES_PROFESSIONNELS).size]);
dit('chaque porteur est Yeman ou Brice, chacun en a au moins un', [true, true],
  [PROFESSIONNELS.every((p) => p.porteurs.length > 0 && p.porteurs.every((k) => k in PORTEURS)), PROFESSIONNELS.every((p) => p.porteurs.length >= 1)]);
dit('un plafond par defaut pour chacun des dix, rien de plus', [...ID_DES_PROFESSIONNELS].sort(), Object.keys(PLAFONDS_PAR_DEFAUT).sort());
const sommeDefaut = Object.values(PLAFONDS_PAR_DEFAUT).reduce((a, b) => a + b, 0);
dit('les plafonds par defaut tiennent dans l enveloppe de 200 $', true, sommeDefaut <= ENVELOPPE_USD);
dit('Opale et Onyx tournent dans l abonnement : plafond 0', [0, 0], [PLAFONDS_PAR_DEFAUT.opale, PLAFONDS_PAR_DEFAUT.onyx]);

/* Qui reçoit un chantier ou un compteur doit avoir un plafond : sinon son
   premier centime le met « dépassé » à l'écran. */
const recoivent = new Set<string>([...Object.values(CHANTIER_VERS_PROFESSIONNEL), ...COMPTEURS_DU_LIVRE.map((c) => c.professionnel)].filter((id) => id !== RESERVE));
dit('qui recoit un chantier ou un compteur a un plafond plus grand que zero', [],
  [...recoivent].filter((id) => !((PLAFONDS_PAR_DEFAUT[id] ?? 0) > 0)).sort());

/* ── ② LES PLAFONDS LUS ET LA RÉSERVE ─────────────────────────────────── */
const defaut = plafondsComplets(undefined);
dit('sans reglage : les plafonds par defaut, la reserve est le reste des 200 $', [PLAFONDS_PAR_DEFAUT.perle, ENVELOPPE_USD - sommeDefaut, ALERTE_PAR_DEFAUT, sommeDefaut, 0],
  [defaut.plafonds.perle, defaut.plafonds[RESERVE], defaut.alerteA, defaut.somme, defaut.depasse]);
dit('null vaut sans reglage', ascii(defaut), ascii(plafondsComplets(null)));
const regle = plafondsComplets({ plafonds: { perle: 80, ambre: 10 } });
dit('un plafond regle remplace le sien et la reserve suit', [80, 10, ENVELOPPE_USD - (sommeDefaut - PLAFONDS_PAR_DEFAUT.perle - PLAFONDS_PAR_DEFAUT.ambre + 90)],
  [regle.plafonds.perle, regle.plafonds.ambre, regle.plafonds[RESERVE]]);
const faux = plafondsComplets({ plafonds: { perle: -5, ambre: 500, grenat: Number.NaN, jade: 'x' as unknown as number, topaze: Infinity } });
dit('un plafond negatif, au-dessus de 200, NaN, texte ou infini reprend celui par defaut',
  [PLAFONDS_PAR_DEFAUT.perle, PLAFONDS_PAR_DEFAUT.ambre, PLAFONDS_PAR_DEFAUT.grenat, PLAFONDS_PAR_DEFAUT.jade, PLAFONDS_PAR_DEFAUT.topaze],
  [faux.plafonds.perle, faux.plafonds.ambre, faux.plafonds.grenat, faux.plafonds.jade, faux.plafonds.topaze]);
dit('un plafond a zero est permis (il ferme la porte)', 0, plafondsComplets({ plafonds: { ambre: 0 } }).plafonds.ambre);
dit('un identifiant inconnu ne compte pas, la reserve ne se regle pas', [undefined, ENVELOPPE_USD - sommeDefaut],
  [plafondsComplets({ plafonds: { inconnu: 50, [RESERVE]: 3 } }).plafonds.inconnu, plafondsComplets({ plafonds: { inconnu: 50, [RESERVE]: 3 } }).plafonds[RESERVE]]);
const trop = plafondsComplets({ plafonds: { perle: 150, ambre: 60 } });
dit('des plafonds qui depassent l enveloppe : la reserve tombe a 0 et le depassement se dit', [0, true, Math.round((trop.somme - ENVELOPPE_USD) * 100) / 100],
  [trop.plafonds[RESERVE], trop.somme > ENVELOPPE_USD, trop.depasse]);
dit('le seuil d alerte : 0,9 lu ; 0,3 et 1,2 reprennent 0,8', [0.9, ALERTE_PAR_DEFAUT, ALERTE_PAR_DEFAUT],
  [plafondsComplets({ alerteA: 0.9 }).alerteA, plafondsComplets({ alerteA: 0.3 }).alerteA, plafondsComplets({ alerteA: 1.2 }).alerteA]);
dit('les centimes se gardent', 12.5, plafondsComplets({ plafonds: { jade: 12.5 } }).plafonds.jade);

/* ── ③ L'ALERTE ───────────────────────────────────────────────────────── */
dit('alerte : sous le seuil, au seuil, au plafond, au-dessus', ['ok', 'proche', 'depasse', 'depasse'],
  [alerteDe(10, 60, 0.8), alerteDe(48, 60, 0.8), alerteDe(60, 60, 0.8), alerteDe(70, 60, 0.8)]);
dit('alerte d un plafond nul : rien depense = ok, un centime = depasse', ['ok', 'depasse'], [alerteDe(0, 0, 0.8), alerteDe(0.01, 0, 0.8)]);

/* ── ④ LE LIVRE D'UN MOIS ─────────────────────────────────────────────── */
const vide = livreDuMois({}, MOIS);
dit('sans compteur : onze lignes (les dix et la reserve), tout a zero, le mois rendu', [11, 0, 'ok', MOIS, 0, []],
  [vide.lignes.length, vide.totalUsd, vide.alerte, vide.mois, vide.partDeLEnveloppe, vide.chantiersSansProfessionnel]);
dit('les lignes suivent le registre, la reserve en dernier', [...ID_DES_PROFESSIONNELS, RESERVE], vide.lignes.map((l) => l.id));
dit('la part d un plafond nul est nulle, celle d un plafond se lit', [null, 0], [ligne(vide, 'opale')?.part, ligne(vide, 'perle')?.part]);

const docs = {
  mnd_ia_compteur_huit: {
    '2026-10': { usd: 99, appels: 99 },
    [MOIS]: { usd: 10, appels: 20, entree: 1, sortie: 1 },
    parChantier: {
      '2026-10': { achat: { usd: 50, appels: 50 } },
      [MOIS]: { achat: { usd: 2, appels: 3 }, 'reponse-wa': { usd: 3, appels: 5 }, lettre: { usd: 1, appels: 1 }, prevision: { usd: 0.5, appels: 1 } },
    },
  },
  mnd_assistant_wa_compte: { [MOIS]: { usd: 4, appels: 8 } },
  mnd_variantes_wa_compte: { [MOIS]: { usd: 0.25, appels: 1 } },
  mnd_tri_compte: { [MOIS]: { usd: 0.75, appels: 2 } },
  mnd_ia_compteur_diagnostic: { [MOIS]: { usd: 1, appels: 1 } },
  mnd_ia_compteur: { [MOIS]: { usd: 6, appels: 4 } },
  mnd_dictee_compte: { [MOIS]: { usd: 0.5, appels: 1 } },
};
const l1 = livreDuMois(docs, MOIS);
dit('ia-maison : chaque chantier a son professionnel (achat Jade, reponse Perle, lettre Cristal, prevision Saphir)', [2, 1, 0.5],
  [ligne(l1, 'jade')?.usd, ligne(l1, 'cristal')?.usd, Math.round(((ligne(l1, 'saphir')?.usd ?? 0) - 6) * 1000) / 1000]);
dit('Perle : reponse-wa du chantier + reception + variantes + tri + diagnostic', 3 + 4 + 0.25 + 0.75 + 1, ligne(l1, 'perle')?.usd);
dit('Saphir : le Centre de commande et la prevision', 6.5, ligne(l1, 'saphir')?.usd);
dit('la reserve : ce que ia-maison a compte sans detail (10 - 6,5) et la dictee', 3.5 + 0.5, ligne(l1, 'reserve')?.usd);
dit('les appels suivent les dollars (reserve : 20 - 10 du detail, + 1 de la dictee)', [3, 8 + 5 + 1 + 2 + 1, 11],
  [ligne(l1, 'jade')?.appels, ligne(l1, 'perle')?.appels, ligne(l1, 'reserve')?.appels]);
dit('le total est la somme des comptes du mois, les autres mois ne comptent pas', 10 + 4 + 0.25 + 0.75 + 1 + 6 + 0.5, l1.totalUsd);
dit('la part de l enveloppe', Math.round((22.5 / 200) * 1000) / 1000, l1.partDeLEnveloppe);
dit('Opale et Onyx restent a zero : ils ne sont sur aucun compteur', [0, 0], [ligne(l1, 'opale')?.usd, ligne(l1, 'onyx')?.usd]);
dit('un autre mois ne lit que le sien', [50, 0], [ligne(livreDuMois(docs, '2026-10'), 'jade')?.usd, ligne(livreDuMois(docs, '2026-10'), 'perle')?.usd]);

const nouveau = livreDuMois({ mnd_ia_compteur_huit: { [MOIS]: { usd: 2, appels: 2 }, parChantier: { [MOIS]: { inconnu: { usd: 2, appels: 2 } } } } }, MOIS);
dit('un chantier sans professionnel tombe dans la reserve et se signale', [2, ['inconnu']], [ligne(nouveau, 'reserve')?.usd, nouveau.chantiersSansProfessionnel]);
const incoherent = livreDuMois({ mnd_ia_compteur_huit: { [MOIS]: { usd: 1, appels: 1 }, parChantier: { [MOIS]: { achat: { usd: 3, appels: 4 } } } } }, MOIS);
dit('un detail plus grand que le mois ne rend jamais la reserve negative', [3, 0, 0], [ligne(incoherent, 'jade')?.usd, ligne(incoherent, 'reserve')?.usd, ligne(incoherent, 'reserve')?.appels]);
const sale = livreDuMois({ mnd_assistant_wa_compte: { [MOIS]: { usd: -4, appels: -2 } }, mnd_ia_compteur: { [MOIS]: { usd: '3', appels: 'x' } }, mnd_tri_compte: 'pas un objet', mnd_dictee_compte: null }, MOIS);
dit('des comptes faux (negatifs, texte, pas un objet, null) valent zero', [0, 0, 0], [sale.totalUsd, ligne(sale, 'perle')?.appels, ligne(sale, 'saphir')?.usd]);
const sansDetail = livreDuMois({ mnd_ia_compteur_huit: { [MOIS]: { usd: 5, appels: 5 } } }, MOIS);
dit('ia-maison sans detail du mois : tout va a la reserve', 5, ligne(sansDetail, 'reserve')?.usd);

const alertes = livreDuMois({ mnd_assistant_wa_compte: { [MOIS]: { usd: 50 } }, mnd_ia_compteur: { [MOIS]: { usd: 20 } } }, MOIS);
dit('Perle a 50 $ sur 60 : proche ; Saphir a 20 $ sur 15 : depasse ; la part se lit', ['proche', 'depasse', 0.833, 1.333],
  [ligne(alertes, 'perle')?.alerte, ligne(alertes, 'saphir')?.alerte, ligne(alertes, 'perle')?.part, ligne(alertes, 'saphir')?.part]);
dit('le plafond regle s applique au livre', ['ok', 80], [ligne(livreDuMois({ mnd_assistant_wa_compte: { [MOIS]: { usd: 50 } } }, MOIS, { plafonds: { perle: 80 } }), 'perle')?.alerte,
  ligne(livreDuMois({}, MOIS, { plafonds: { perle: 80 } }), 'perle')?.plafond]);
dit('le seuil regle s applique au livre (0,9 : 50 sur 60 redevient ok)', 'ok',
  ligne(livreDuMois({ mnd_assistant_wa_compte: { [MOIS]: { usd: 50 } } }, MOIS, { alerteA: 0.9 }), 'perle')?.alerte);
const total = (usd: number) => livreDuMois({ mnd_ia_compteur_huit: { [MOIS]: { usd } } }, MOIS);
dit('l enveloppe : 150 ok, 160 proche, 200 depasse', ['ok', 'proche', 'depasse'], [total(150).alerte, total(160).alerte, total(200).alerte]);
dit('la reserve garde son alerte sur ce qui reste (55 $ : 50 proche)', 'proche', ligne(total(50), 'reserve')?.alerte);

/* ── ⑤ CHAQUE CHANTIER, CHAQUE COMPTEUR ───────────────────────────────── */
dit('chaque chantier d ia-maison est rendu a un professionnel du registre (aucun dans la reserve par oubli)', [],
  CHANTIERS_IA.filter((c) => !ID_DES_PROFESSIONNELS.includes(CHANTIER_VERS_PROFESSIONNEL[c] ?? '')));
dit('aucun chantier rendu n est inconnu d ia-maison', [], Object.keys(CHANTIER_VERS_PROFESSIONNEL).filter((c) => !(CHANTIERS_IA as readonly string[]).includes(c)));
dit('chaque compteur va a un professionnel du registre ou a la reserve', [],
  COMPTEURS_DU_LIVRE.filter((c) => c.professionnel !== RESERVE && !ID_DES_PROFESSIONNELS.includes(c.professionnel)).map((c) => c.cle));
dit('les cles du livre sont uniques', CLES_DES_COMPTEURS.length, new Set(CLES_DES_COMPTEURS).size);
/* La carte des chantiers et des compteurs, épinglée telle que le socle l'a
   rendue le 2 novembre 2026 : un chantier qui change de professionnel change
   ses crédits et son plafond, il se change ici exprès. */
dit('chaque chantier chez le sien : la capture et le recu a Grenat, la clientele a Perle, la lettre a Cristal, le tableau de bord a Saphir, l achat a Jade', {
  capture: 'grenat', recu: 'grenat',
  cahier: 'perle', 'reponse-wa': 'perle', avis: 'perle', diagnostic: 'perle', 'fiche-du-jour': 'perle',
  lettre: 'cristal', prevision: 'saphir', question: 'saphir', processus: 'saphir', achat: 'jade',
}, Object.fromEntries(Object.entries(CHANTIER_VERS_PROFESSIONNEL).sort(([a], [b]) => CHANTIERS_IA.indexOf(a as never) - CHANTIERS_IA.indexOf(b as never))));
dit('chaque compteur chez le sien', [
  ['mnd_ia_compteur_huit', RESERVE], ['mnd_assistant_wa_compte', 'perle'], ['mnd_variantes_wa_compte', 'perle'], ['mnd_tri_compte', 'perle'],
  ['mnd_ia_compteur_diagnostic', 'perle'], ['mnd_ia_compteur', 'saphir'], ['mnd_dictee_compte', RESERVE],
], COMPTEURS_DU_LIVRE.map((c) => [c.cle, c.professionnel]));

/* Les compteurs écrits par les fonctions Edge : tout `documents` de la forme
   mnd_…compte… ou mnd_…compteur… nommé dans une fonction doit être au livre. */
const dossierDesFonctions = path.join(racine, 'supabase/functions');
const vus = new Set<string>();
for (const f of readdirSync(dossierDesFonctions)) {
  const index = path.join(dossierDesFonctions, f, 'index.ts');
  if (!existsSync(index)) continue;
  for (const m of readFileSync(index, 'utf8').matchAll(/["'](mnd_[a-z_]*(?:compte|compteur)[a-z_]*)["']/g)) vus.add(m[1]);
}
dit('les fonctions nomment au moins les sept compteurs connus', true, vus.size >= 7);
dit('chaque compteur ecrit par une fonction est au livre', [], [...vus].filter((k) => !(CLES_DES_COMPTEURS as readonly string[]).includes(k)).sort());

/* ── ⑥ LE MOIS ET LES DOLLARS ─────────────────────────────────────────── */
dit('le mois se lit a Cotonou (UTC+1) : 23 h 30 UTC le 31 octobre 2026 est deja novembre', ['2026-11', '2026-10'],
  [moisDeCotonou(Date.parse('2026-10-31T23:30:00Z')), moisDeCotonou(Date.parse('2026-10-31T22:59:00Z'))]);
dit('les dollars : deux decimales sous 10 $, entiers au-dessus', ['3,40 $', '0,00 $', '120 $', '9,99 $'],
  [dollarsDits(3.4), dollarsDits(0), dollarsDits(120), dollarsDits(9.99)]);

/* ── ⑦ L'ÉCRAN ET SA LECTURE ──────────────────────────────────────────── */
const ecran = lit('src/apps/trone/routes/pilotage/Assistants.tsx');
const client = lit('src/shared/assistants.ts');
dit('l ecran passe les compteurs et les plafonds reglés au livre du mois de Cotonou', true,
  ecran.includes('livreDuMois(lecture?.compteurs ?? {}, moisDeCotonou(maintenant), reglages.livreDesCredits)'));
dit('les plafonds se reglent dans mnd_settings.livreDesCredits, jamais la reserve', [true, true],
  [/livreDesCredits: \{ \.\.\.\(prev\.livreDesCredits \?\? \{\}\), plafonds \}/.test(ecran), ecran.includes("l.id !== RESERVE && (")]);
dit('le depassement de l enveloppe et les chantiers sans professionnel se disent', [true, true],
  [ecran.includes('lu.depasse > 0'), ecran.includes('livre.chantiersSansProfessionnel.length > 0')]);
dit('l alerte se dit en mots, pas par la seule couleur', true, ecran.includes('ALERTE_DITE[l.alerte]'));
dit('la lecture prend les compteurs du livre et rien d autre', [true, true],
  [client.includes(".in('key', [...CLES_DES_COMPTEURS])"), /litLesCompteursDuLivre\(\),\n  \]\);/.test(client)]);
dit('l ecran montre les dix du registre et le bouton du porteur', [true, true, true, true],
  [ecran.includes('{PROFESSIONNELS.map((p) => {'), ecran.includes("{estLoin ? 'Je suis là' : 'Je suis loin'}"), client.includes("appelleLaPorteDuSouverain('loin.basculer', { loin })"),
    ecran.includes('import ConseilDuMatin from \'./ConseilDuMatin\';')]);
dit('le message d un contact se dit pour le porteur seul et son effacement aussi', [true, true],
  [ecran.includes('Pour vous seulement'), ecran.includes('Effacé dès votre décision, au plus tard dans {PURGE_DU_PRIVE_JOURS} jours')]);
dit('une depense corrigee part avec ses faits', true, ecran.includes("trancher('corriger', { faits: {"));
dit('les cartes et l assistant se lisent par toute la ligne (avant 0151, rien ne tombe)', [true, true],
  [/from\('assistants'\)\n\s*\.select\('\*'\)/.test(client), /from\('assistants_decisions'\)\n\s*\.select\('\*'\)/.test(client)]);
dit('le prive ne part ni dans un toast ni dans le journal de l ecran', [false, false],
  [/toast\([^)]*prive/.test(ecran), /journal[^\n]*prive/.test(ecran)]);

console.log(ko === 0 ? `\n${n} epreuves : le livre des credits tient.` : `\n${ko} ECHEC sur ${n}.`);
process.exit(ko ? 1 : 0);
