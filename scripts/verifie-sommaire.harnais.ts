/* LES PARAMÈTRES EN TUILES, ÉPROUVÉS — `node scripts/verifie-sommaire.mjs`
   (et `--prouve` : chaque panne remise doit faire crier le harnais).

   L'HISTOIRE. Le 6 septembre 2026, le sommaire en pastilles avait dérivé de la
   page (« j'ai rajouté des choses au fur et à mesure », Yéman) : deux réglages
   n'apparaissaient plus nulle part. Le 29 octobre 2026, la page devient huit
   tuiles, « Rarement » et ce qui efface derrière un mot (« il y a trop de
   boutons que je n'utilise pas », maquette 5aXKK3Eu…). La dérive possible a
   changé de forme, pas de nature : une tuile sans panneau ne s'ouvre sur rien,
   un panneau sans tuile ne s'atteint jamais, un bouton « à venir » revient en
   douce, un geste qui efface ressort de sous le verrou.

   L'ATTENTE VIENT DE LA PROMESSE, jamais du code éprouvé : les mots retirés,
   les gestes rapides et le résumé des heures sont écrits ici en clair. */
import { readFileSync } from 'node:fs';
import {
  TUILES, RAREMENT, NOTIFICATIONS, verrouOuvert, heureLisible, resumeDesHeures, tuilesTrouvees, rarementTrouves, resumeEnvois,
} from '../src/apps/trone/routes/systeme/parametres-pur';

/* LES FINS DE LIGNE DE WINDOWS (CRLF) dans une copie propre faite par git :
   le harnais lit des retours « \n », il les rend tous pareils d'abord. */
const lit = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const ECRAN = lit('src/apps/trone/routes/systeme/Parametres.tsx');
const CLOCHE = lit('src/apps/trone/shell/Notifications.tsx');
const MARKETING = lit('src/apps/trone/routes/equipe/MarketingBranche.tsx');
const TEXTES = lit('src/apps/trone/routes/systeme/Textes.tsx');

const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');

/** Les contrôles, sur un texte donné : renvoie les échecs (vide = tout tient). */
function controle(ecran: string, cloche: string, marketing: string, textes: string, bavard: boolean): string[] {
  const echecs: string[] = [];
  const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
    const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
    if (!ok) echecs.push(nom);
    if (bavard) {
      console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
      if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
    }
  };
  const code = sansCommentaires(ecran);
  const corps = code.slice(code.indexOf('export default function Parametres()'));

  /* ① UNE TUILE, UN PANNEAU ; UN PANNEAU, UNE TUILE. */
  const panneaux = [...corps.matchAll(/\{ouverte === '([a-z]+)' &&/g)].map((m) => m[1]);
  dit('chaque tuile ouvre un panneau', [], TUILES.filter((t) => !panneaux.includes(t.id)).map((t) => t.id));
  dit('chaque panneau a sa tuile', [], panneaux.filter((p) => !TUILES.some((t) => t.id === p)));
  dit('aucun panneau en double', panneaux.length, new Set(panneaux).size);
  dit('les tuiles se dessinent depuis la table', true, /TUILES\.filter\(\(t\) => tuilesVues\.includes\(t\.id\)\)\.map/.test(corps));

  /* ② « RAREMENT » : chaque entrée cherchable a sa carte, et l'inverse. */
  const rares = [...corps.matchAll(/raresVus\.includes\('([a-z]+)'\)/g)].map((m) => m[1]);
  dit('chaque entrée de « Rarement » a sa carte', [], RAREMENT.filter((r) => !rares.includes(r.id)).map((r) => r.id));
  dit('chaque carte de « Rarement » est dans la table', [], rares.filter((r) => !RAREMENT.some((x) => x.id === r)));

  /* ③ CE QUI EFFACE : une fois, au bout, et seulement sous le verrou. */
  const verrou = corps.indexOf('{deverrouille && (\n');
  for (const carte of ['ResetEncaissementsCard', 'ViderRdvCard', 'FactoryResetCard']) {
    const n = corps.split(`<${carte} />`).length - 1;
    dit(`${carte} paraît une fois`, 1, n);
    dit(`${carte} est sous le verrou`, true, verrou > 0 && corps.indexOf(`<${carte} />`) > verrou);
  }
  dit('le verrou s’ouvre au mot, par la règle pure', true, /const deverrouille = verrouOuvert\(mot\);/.test(corps));
  dit('la sauvegarde reçoit le verrou', true, /<SauvegardeCard deverrouille=\{deverrouille\} \/>/.test(corps));
  const sauvegarde = code.slice(code.indexOf('function SauvegardeCard('), code.indexOf('function SauvegardeCard(') + 9000);
  const garde = sauvegarde.indexOf('{deverrouille && (');
  dit('« Mettre à jour » et « Remplacer » sont sous le verrou', true,
    garde > 0 && sauvegarde.indexOf("openPicker('update')") > garde && sauvegarde.indexOf("openPicker('replace')") > garde);
  dit('« Restaurer » (sans rien écraser) reste à portée', true, sauvegarde.indexOf("openPicker('add')") > 0 && sauvegarde.indexOf("openPicker('add')") < garde);
  dit('le verrou vient après « Rarement »', true, corps.indexOf('<SauvegardeCard deverrouille') > corps.indexOf("raresVus.includes('appareil')"));

  /* ④ LES CONTRÔLES RETIRÉS NE REVIENNENT PAS. Huit n'étaient reliés à rien,
     quatre ne faisaient que répéter un autre écran. */
  const retires = [
    'Durée standard d’un rituel', 'Fenêtre d’annulation', 'Rappels automatiques', 'Nouvelle introduction du Cercle',
    'Double authentification', 'Sauvegarde quotidienne', 'Export souverain autorisé', 'Lien de paiement Mobile Money',
    'Hébergement des données', 'Devise de référence', 'Accès ERP du personnel', 'Ouvrir les textes', 'Clôture de paie',
  ];
  dit('aucun contrôle retiré ne reparaît', [], retires.filter((m) => code.includes(m)));
  dit('aucun réglage « à venir »', [], ['aVenir', 'AVenir', 'À venir'].filter((m) => code.includes(m)));
  dit('le lien MoMo mort ne s’écrit plus', false, /setAuto\('momoLink'/.test(code));

  /* ⑤ LES CINQ GESTES RAPIDES. */
  const gestes = ['Fermer la Maison un jour', 'Bloquer un créneau', 'Mettre WhatsApp en pause', 'Tout vérifier', 'Sauvegarder la Maison'];
  const rangee = corps.slice(corps.indexOf('aria-label="Gestes rapides">'), corps.indexOf('</div>', corps.indexOf('aria-label="Gestes rapides">')));
  dit('les cinq gestes sont dans la rangée des gestes', [], gestes.filter((g) => !rangee.includes(`>${g}<`) && !rangee.includes(`'${g}'`)));
  dit('la pause passe par le chemin de la carte WhatsApp', true,
    /const ecrisLAutomate = \(r: ReglageDeLAutomate\) => setAutoCfgRaw\(\{ \.\.\.autoCfg, automateWa: r \}\);/.test(corps)
    && /ecris=\{ecrisLAutomate\}/.test(corps) && /ecrisLAutomate\(\{ \.\.\.reglageWa, mode: 'eteint' \}\)/.test(corps));
  dit('la pause est à la direction', true, /const pauseWhatsApp = \(\) => \{\s*if \(!estDirection\) \{ toast\('Ce réglage appartient à la direction\.'\); return; \}/.test(corps));
  dit('fermer un jour écrit une journée exceptionnelle fermée', true, /setExceptions\(\[\.\.\.exceptions, \{\s*id: `hx-\$\{uid\(\)\}`, date: ferme\.date, open: '', close: '', closed: true,/.test(corps));

  /* ⑥ LES TROIS NOTIFICATIONS SONT CELLES QUE LA CLOCHE LIT. */
  const lues = [...cloche.matchAll(/tg\.(notif[A-Za-z]+) !== false/g)].map((m) => m[1]).sort();
  dit('les interrupteurs sont ceux que la cloche lit', lues, NOTIFICATIONS.map((n) => n.k).sort());

  /* ⑦ UN RÉGLAGE, UN SEUL ENDROIT : les autres écrans renvoient ici. */
  const mk = sansCommentaires(marketing);
  dit('Marketing n’écrit plus les liens des messages', [], ['momoLink: e.target.value', 'mapsLink: e.target.value', 'reviewLink: e.target.value', 'itineraire: e.target.value'].filter((m) => mk.includes(m)));
  dit('Marketing renvoie à la tuile', true, mk.includes('/parametres?ouvre=envoyer'));
  const tx = sansCommentaires(textes);
  dit('les Textes lisent l’identité sans l’écrire', [], ['nom: e.target.value', 'raison: e.target.value', 'ville: e.target.value'].filter((m) => tx.includes(m)));
  dit('les Textes renvoient à l’identité', true, tx.includes('/parametres?ouvre=identite'));
  return echecs;
}

/* ── LA RÈGLE PURE, sur des cas écrits en clair ── */
let ko = 0;
const vaut = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};
/* Les heures de la Maison, telles que la sauvegarde du 26 octobre 2026 les porte. */
const SEMAINE = [
  { key: 'lun', open: '08h00', close: '19h00', closed: true }, { key: 'mar', open: '08h00', close: '20h30', closed: false },
  { key: 'mer', open: '08h00', close: '20h30', closed: false }, { key: 'jeu', open: '08h00', close: '20h30', closed: false },
  { key: 'ven', open: '08h00', close: '20h30', closed: false }, { key: 'sam', open: '09h00', close: '20h00', closed: false },
  { key: 'dim', open: '10h00', close: '16h00', closed: true },
];
vaut('le résumé des heures dit la semaine de la Maison', 'mar. au ven. 8 h à 20 h 30 · sam. 9 h à 20 h · fermée lundi et dimanche', resumeDesHeures(SEMAINE));
vaut('deux jours qui se suivent : « et », pas « au »', 'sam. et dim. 9 h à 13 h · fermée lundi, mardi, mercredi, jeudi et vendredi',
  resumeDesHeures(SEMAINE.map((j) => ({ ...j, closed: !['sam', 'dim'].includes(j.key), open: '09h00', close: '13h00' }))));
vaut('une semaine fermée le dit', 'Fermée toute la semaine', resumeDesHeures(SEMAINE.map((j) => ({ ...j, closed: true }))));
vaut('les heures se lisent', ['8 h', '20 h 30', '9 h', 'midi'], [heureLisible('08h00'), heureLisible('20h30'), heureLisible('9:00'), heureLisible('midi')]);
vaut('« acompte » mène à la réservation', ['reservation'], tuilesTrouvees('acompte'));
vaut('« relances » mène aux paiements', ['paiements'], tuilesTrouvees('relances'));
vaut('« Réservation en ligne » sans accent ni casse', ['reservation'], tuilesTrouvees('reservation EN ligne'));
vaut('« wifi » ne se règle pas ici', [[], []], [tuilesTrouvees('wifi'), rarementTrouves('wifi')]);
vaut('« fuseau » est dans « Rarement »', [[], ['identite']], [tuilesTrouvees('fuseau'), rarementTrouves('fuseau')]);
vaut('le verrou veut le mot entier', [true, true, false, false], [verrouOuvert('EFFACER'), verrouOuvert(' effacer '), verrouOuvert('EFFACE'), verrouOuvert('')]);
vaut('un lien manquant se nomme', 'Manque le lien Google Avis', resumeEnvois({ itineraire: 'x', mapsLink: 'x', reviewLink: ' ', momoQr: 'x' }).dit);

const prouve = process.argv.includes('--prouve');
const echecs = controle(ECRAN, CLOCHE, MARKETING, TEXTES, !prouve);
ko += echecs.length;

/* ── LE HARNAIS SE PROUVE DANS LES DEUX SENS : chaque panne, remise EN
   MÉMOIRE (jamais sur le disque, l'arbre est partagé), doit le faire crier. */
if (prouve) {
  const remplace = (s: string, a: string, b: string) => { if (!s.includes(a)) throw new Error(`panne introuvable : ${a.slice(0, 60)}`); return s.replace(a, b); };
  const pannes: [string, () => string[]][] = [
    ['un panneau sans tuile', () => controle(remplace(ECRAN, "{ouverte === 'notifications' && (", "{ouverte === 'notifs' && ("), CLOCHE, MARKETING, TEXTES, false)],
    ['une carte de « Rarement » perdue', () => controle(remplace(ECRAN, "raresVus.includes('livraison')", "raresVus.includes('livraisons')"), CLOCHE, MARKETING, TEXTES, false)],
    ['tout réinitialiser hors du verrou', () => controle(remplace(remplace(ECRAN, '                <FactoryResetCard />\n', ''), '<SauvegardeCard deverrouille={deverrouille} />', '<SauvegardeCard deverrouille={deverrouille} />\n            <FactoryResetCard />'), CLOCHE, MARKETING, TEXTES, false)],
    ['« Remplacer » sorti du verrou', () => controle(remplace(ECRAN, "        {deverrouille && (\n          <>\n            <Button variant=\"ghost\" onClick={() => openPicker('update')}", "        <Button variant=\"ghost\" onClick={() => openPicker('replace')}>X</Button>\n        {deverrouille && (\n          <>\n            <Button variant=\"ghost\" onClick={() => openPicker('update')}"), CLOCHE, MARKETING, TEXTES, false)],
    ['un réglage « à venir » revient', () => controle(ECRAN + '\nconst AVenir = () => null;\n', CLOCHE, MARKETING, TEXTES, false)],
    ['« Double authentification » revient', () => controle(remplace(ECRAN, "<span className=\"prm-panneau__nom\">", "<span title=\"Double authentification\" className=\"prm-panneau__nom\">"), CLOCHE, MARKETING, TEXTES, false)],
    ['un geste rapide manque', () => controle(remplace(ECRAN, '>Tout vérifier<', '>Vérifier<'), CLOCHE, MARKETING, TEXTES, false)],
    ['la pause sans garde de la direction', () => controle(remplace(ECRAN, "  const pauseWhatsApp = () => {\n    if (!estDirection) { toast('Ce réglage appartient à la direction.'); return; }\n", '  const pauseWhatsApp = () => {\n'), CLOCHE, MARKETING, TEXTES, false)],
    ['la cloche lit un sujet de plus', () => controle(ECRAN, CLOCHE + '\nconst okX = tg.notifCercle !== false;\n', MARKETING, TEXTES, false)],
    ['Marketing réécrit un lien', () => controle(ECRAN, CLOCHE, MARKETING + '\nconst x = { mapsLink: e.target.value };\n', TEXTES, false)],
    ['les Textes réécrivent l’identité', () => controle(ECRAN, CLOCHE, MARKETING, TEXTES + '\nconst y = { nom: e.target.value };\n', false)],
  ];
  for (const [nom, panne] of pannes) {
    const crie = panne();
    const ok = crie.length > 0;
    if (!ok) ko++;
    console.log(`${ok ? 'CRIE ' : 'MUET '} ${nom}${ok ? ` → ${crie.join(' ; ')}` : ''}`);
  }
  console.log(`\n${ko === 0 ? 'Le harnais crie à chaque panne.' : `${ko} ÉCHEC(S) : une panne passe sans bruit.`}`);
  process.exit(ko === 0 ? 0 : 1);
}

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} ÉCHEC(S).`);
process.exit(ko === 0 ? 0 : 1);
