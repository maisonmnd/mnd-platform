/* L'ACCUSÉ DU SITE ET LE NOM DANS SA CASE, ÉPROUVÉS — 15 octobre 2026.

   Trois demandes de Yéman, le même jour :
   1. « Sur le site, après Réserver, la partie "pour votre enfant, ou si vous
      préférez qu'on vous appelle, laissez votre numéro" : retirer cette
      phrase. »
   2. « Pour votre enfant, vous préférez qu'on vous appelle : voilà le message
      que je reçois en WhatsApp (12 h 26). Il n'est pas adapté à la demande du
      client. » Il disait : « votre demande de rendez-vous pour le un
      rendez-vous… votre créneau ».
   3. « Créer des cases séparées pour le nom et le prénom lors de la prise de
      RDV. »

   Les attentes sont écrites ici à la main, depuis ces trois phrases : jamais
   tirées du code éprouvé. */
import { readFileSync } from 'node:fs';
import { POUR_LE_RAPPEL, genreDAccuse, modeleDeLAccuse, quandDeLaDemande, texteDeLAccuse } from '../src/shared/accuse-du-site';
import { memoireAEcrire, memoireLue } from '../src/shared/reservation-express';
import { civiliteAPoser, ficheDepuisLaDemande, nomDeLaDemande, type Demande } from '../src/shared/demandes';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : `\n       attendu ${JSON.stringify(attendu)}\n       obtenu  ${JSON.stringify(obtenu)}`}`);
};
const lis = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\s*\}/g, '{}');

const RESERVER = sansCommentaires(lis('src/apps/revelateur/ilots/Reserver.tsx'));
const EDGE_BRUT = lis('supabase/functions/demande-submit/index.ts');
const EDGE = sansCommentaires(EDGE_BRUT);
const PARTAGE = lis('src/shared/accuse-du-site.ts');

/* ── 1. LA PHRASE DU RAPPEL N'EST PLUS SOUS LA PORTE ── */
dit('la porte ne dit plus « qu on vous appelle » ni « laissez votre numero »', [false, false, false],
  [RESERVER.includes('qu’on vous appelle'), RESERVER.includes('laissez votre numéro'), RESERVER.includes('porte-rdv__rappel')]);
dit('... et garde ses trois choix', [true, true, true],
  ["choisit('entretien')", "choisit('reparation')", "choisit('creation')"].map((c) => RESERVER.includes(c)));
dit('... l enfant se dit toujours au moment de la place (« Pour qui ? »)', true, RESERVER.includes('setPourQui(v as \'moi\' | \'enfant\' | \'autre\')'));

/* ── 2. L'ACCUSÉ DIT CE QU'ELLE A DEMANDÉ ── */
const SON_CAS = texteDeLAccuse(genreDAccuse({ pose: false, avecPlace: false }), 'Yeman', quandDeLaDemande('', 'enfant'));
dit('son cas : un rappel pour son enfant se dit rappel, pour son enfant',
  'Bonjour Yeman, la Maison MND a bien reçu votre demande (un rappel pour votre enfant). Nous vous répondons très vite, sur ce numéro.', SON_CAS);
const BESOINS = ['creation', 'reparation', 'entretien', 'enfant', 'formation', 'inconnu', 'nimporte'];
const PROFILS = ['', 'Carte cadeau', 'Diagnostic locks', 'Testeuse', "J'ai des locks créées ailleurs"];
const tousSansPlace = BESOINS.flatMap((b) => PROFILS.map((p) => texteDeLAccuse('rappel', 'A.', quandDeLaDemande(p, b))));
dit('aucune demande sans place ne parle de rendez-vous ni de creneau', [],
  tousSansPlace.filter((t) => /rendez-vous|créneau|pour le un/.test(t)));
dit('chaque besoin se dit en clair', {
  creation: 'un rappel pour créer votre couronne', reparation: 'un rappel pour réparer votre couronne',
  entretien: 'un rappel pour entretenir votre couronne', enfant: 'un rappel pour votre enfant',
  formation: 'un rappel pour apprendre le métier', inconnu: 'un rappel de la Maison',
}, Object.fromEntries(['creation', 'reparation', 'entretien', 'enfant', 'formation', 'inconnu'].map((b) => [b, quandDeLaDemande('', b)])));
dit('la carte, le diagnostic, la testeuse gardent leur mot', ['une carte cadeau', 'votre routine locks', 'votre inscription comme testeuse'],
  [quandDeLaDemande('Carte cadeau', 'inconnu'), quandDeLaDemande('Diagnostic locks', 'entretien'), quandDeLaDemande('Testeuse', 'inconnu')]);
dit('le rappel connait les cinq besoins nommes', 5, Object.keys(POUR_LE_RAPPEL).length);

dit('trois accuses : posee, demandee non posee, sans place', ['confirmation', 'demande-de-place', 'rappel', 'confirmation'],
  [genreDAccuse({ pose: true, avecPlace: true }), genreDAccuse({ pose: false, avecPlace: true }), genreDAccuse({ pose: false, avecPlace: false }), genreDAccuse({ pose: true, avecPlace: false })]);
const tousLesSecrets = { conf: 'confirmation_rdv', accuse: 'demande_recue', simple: 'demande_recue_simple' };
dit('une demande sans place ne prend JAMAIS le modele d une place', ['', '', 'demande_recue_simple'],
  [modeleDeLAccuse('rappel', {}), modeleDeLAccuse('rappel', { conf: 'x', accuse: 'demande_recue' }), modeleDeLAccuse('rappel', tousLesSecrets)]);
dit('une place posee : la confirmation ; demandee non posee : demande_recue', ['confirmation_rdv', 'demande_recue', 'conf_2', 'acc_2'],
  [modeleDeLAccuse('confirmation', {}), modeleDeLAccuse('demande-de-place', {}), modeleDeLAccuse('confirmation', { conf: 'conf_2' }), modeleDeLAccuse('demande-de-place', { accuse: 'acc_2' })]);
dit('un secret vide ne vaut pas un modele', '', modeleDeLAccuse('rappel', { simple: '' }));
dit('la place non posee se dit avec son jour et son annee, comme le modele approuve',
  'Bonjour Madame A., la Maison MND a bien reçu votre demande de rendez-vous pour le jeudi 15 octobre 2026 à 12 h. Nous vous confirmerons très prochainement votre créneau sur ce même numéro.',
  texteDeLAccuse('demande-de-place', 'Madame A.', 'jeudi 15 octobre 2026 à 12 h'));

/* La copie de la fonction Edge, caractère pour caractère. */
const bloc = (t: string) => {
  const a = t.indexOf('/* ⟨accuse-du-site⟩ */');
  const b = t.indexOf('/* ⟨/accuse-du-site⟩ */');
  return a >= 0 && b > a ? t.slice(a, b) : '';
};
dit('demande-submit porte la copie exacte du bloc partage', [true, true], [bloc(PARTAGE).length > 200, bloc(PARTAGE) === bloc(EDGE_BRUT)]);
dit('l Edge choisit le modele par le genre de l accuse', true,
  EDGE.includes('const genreAccuse = genreDAccuse({ pose: !!o.apptId, avecPlace: o.avecPlace });')
  && /const MODELE = modeleDeLAccuse\(genreAccuse, \{\s*conf: Deno\.env\.get\('WA_TEMPLATE_CONF'\),\s*accuse: Deno\.env\.get\('WA_TEMPLATE_ACCUSE'\),\s*simple: Deno\.env\.get\('WA_TEMPLATE_ACCUSE_SIMPLE'\),\s*\}\);/.test(EDGE));
dit('... sans modele juste, rien ne part', true, /if \(!MODELE\) \{\s*console\.log\([^)]*\);\s*return 'sans-modele';\s*\}/.test(EDGE));
dit('... l ancien repli vers demande_recue a disparu', false, EDGE.includes("Deno.env.get('WA_TEMPLATE_ACCUSE_SIMPLE') ?? Deno.env.get('WA_TEMPLATE_ACCUSE')"));
dit('... le fil montre le texte du meme accuse', true, EDGE.includes('texte: texteDeLAccuse(genreAccuse, prenom, quand),'));
dit('l appel passe la place et ce qu elle a demande', true,
  EDGE.includes('    avecPlace,\n    quand: avecPlace ? `${jourEnClair(date)} à ${heureLisible(time)}` : quandDeLaDemande(texte(d.profil, 80), besoin),\n    ...(avecPlace ? { date, time } : {}),'));

/* ── 3. LE NOM ET LE PRÉNOM, CHACUN SA CASE ── */
const champ = (id: string) => (RESERVER.match(new RegExp(`<input id="${id}"[\\s\\S]*?/>`)) ?? [''])[0];
dit('la reservation a une case prenom et une case nom, distinctes', [true, true, true],
  [/autoComplete="given-name"/.test(champ('res-prenom')), /name="nom" autoComplete="family-name"/.test(champ('res-nom')), /onChange=\{\(e\) => setNom\(e\.target\.value\)\}/.test(champ('res-nom'))]);
dit('... chacune son libelle', [true, true, true],
  [RESERVER.includes('<label htmlFor="res-prenom">{f.prenom}</label>'), RESERVER.includes('<label htmlFor="res-nom">{f.nom}</label>'), lis('src/apps/revelateur/contenu.ts').includes("nom: 'Votre nom',")]);
dit('... cote a cote, le numero dessous', true,
  /<div className="deux-champs">\s*<div className="champ"><label htmlFor="res-prenom">[\s\S]*?<\/div>\s*<div className="champ"><label htmlFor="res-nom">[\s\S]*?<\/div>\s*<\/div>\s*<div className="champ">\s*<label htmlFor="res-numero">/.test(RESERVER));
dit('le nom part au serveur, a part du prenom', true,
  RESERVER.includes('prenom, civilite, telephone: numero, besoin, mot,') && RESERVER.includes('...(nom.trim() ? { nom: nom.trim() } : {}),'));
dit('« ce n est pas moi » efface aussi le nom ; « bon retour » le remet', [true, true],
  [/setPrenom\(''\);\s*setNom\(''\);/.test(RESERVER), RESERVER.includes("setNom((n) => n || moi.nom || '');")]);
const memoire = { prenom: 'Awa', nom: 'H.', numero: '+22990000000', serviceIds: ['sv-1'], calibreId: 'cal-pico', besoin: 'entretien' };
dit('le telephone retient le nom', 'H.', memoireLue(memoireAEcrire(memoire))?.nom);
dit('... et une ancienne memoire, sans nom, se relit', [true, undefined],
  [!!memoireLue(JSON.stringify({ prenom: 'Awa', numero: '+22990000000', serviceIds: ['sv-1'], calibreId: '', besoin: 'entretien' })), memoireLue(JSON.stringify({ prenom: 'Awa', numero: '+22990000000', serviceIds: ['sv-1'], calibreId: '', besoin: 'entretien' }))?.nom]);

dit('le serveur lit le nom et le garde sur la demande', true,
  EDGE.includes('const nom = texte(d.nom, 60);') && EDGE.includes("const nomEntier = [prenom, nom].filter(Boolean).join(' ');") && EDGE.includes('...(nom ? { nom } : {}),'));
dit('... le rendez-vous, le fil et l alerte portent le nom entier', true,
  EDGE.includes("clientName: nomEntier || 'Demande du site',") && EDGE.includes('...(nomEntier ? { nomProfil: nomEntier } : {}),') && EDGE.includes("`${nomEntier || 'Une visiteuse'} · ${besoin}${quand}`,"));
dit('... les messages, eux, appellent par le prenom seul', true,
  EDGE.includes('apptId, demandeId: id, branchId, prenom, telephone,') && EDGE.includes('prenomAmie: premierMot(prenom),'));

const demande = (x: Partial<Demande>): Demande => ({
  id: 'd1', genre: 'rdv', createdAt: '2026-10-15T10:00:00Z', branchId: 'maison', prenom: 'Awa', telephone: '+22990000000',
  besoin: 'entretien', source: 'site', consentementLe: '2026-10-15T10:00:00Z', statut: 'nouvelle', ...x,
});
dit('au Trone, la fiche nait au nom entier', ['Awa H.', 'Awa'],
  [ficheDepuisLaDemande(demande({ nom: 'H.' }), 'p').name, ficheDepuisLaDemande(demande({}), 'p').name]);
dit('... le nom se lit partout de la meme facon', ['Awa H.', 'Awa', 'H.'],
  [nomDeLaDemande({ prenom: ' Awa ', nom: ' H. ' }), nomDeLaDemande({ prenom: 'Awa' }), nomDeLaDemande({ prenom: '', nom: 'H.' })]);
dit('... et la civilite reconnait toujours la fiche par son prenom', 'monsieur',
  civiliteAPoser({ name: 'Awa H.' }, { prenom: 'Awa', civilite: 'monsieur' }));
const rattache = sansCommentaires(lis('src/apps/trone/shell/useRattacheLesReservations.ts'));
const ecran = sansCommentaires(lis('src/apps/trone/routes/clients/Demandes.tsx'));
dit('le rendez-vous rattache prend le nom entier (calendrier et ecran des demandes)', [true, true, true],
  [rattache.includes('prenom: nomDeLaDemande(r.demande),'), ecran.includes('clientName: nomDeLaDemande(d) || a.clientName'), ecran.includes('{nomDeLaDemande(d)}')]);

console.log(ko ? `\n${ko} ECHEC.` : '\nL accuse dit la demande, et le nom a sa case.');
if (ko) process.exitCode = 1;
