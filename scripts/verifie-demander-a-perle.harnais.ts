/* DEMANDER À PERLE, ÉPROUVÉ — `node scripts/verifie-demander-a-perle.mjs`.

   21 novembre 2026 : « une intelligence artificielle dans le Trône à qui je
   peux poser toutes les questions […] me donner des infos en temps réel »
   (Yéman), premier lot : la direction seule, les questions et « En direct ».
   Le banc rejoue les règles pures (le plan, la réponse, les lectures, le
   fil), l'anonymisation, la porte de la direction, et lit dans leur source
   que l'écran ne fait que lire. Toutes les têtes sont inventées. */
import { readFileSync } from 'node:fs';
import {
  CHANTIER_DE_PERLE, LECTURES, LECTURES_MAX, NOMS_DES_LECTURES, SCHEMA_DU_PLAN, SIGNES_DE_FAITS_MAX,
  QUESTION_INTERNET_MAX, auFauteuil, clientesDeLaQuestion, clientesDuNom, demandeDInternet, demandeDeLaReponse, demandeDuPlan, dureeEnClair, ecransLus, enDirectEnTexte, encoreAttendues,
  sansLesClientes, sourcesPropres,
  faitsEnTexte, fenetreDesDepenses, fenetreDesRendezVous, francsPourPerle, lignesEnDirect, moisDAvant, dernierJourDuMois, momentDit, planLu, reponsePropre, toursDAvant,
  type FaitsEnDirect, type RdvDuJour,
} from '../src/shared/perle-pur';
import { SIGNES_MAX_PAR_DEMANDE, defautDeLaDemande, peutDemander } from '../src/shared/ia-maison-pur';
import { pourClaude, sansCoordonnees } from '../src/shared/ia-anonymise-pur';
import { personnesDe, prenomDeLaFiche } from '../src/shared/ia-fiche-du-jour-pur';
import { ROUTES_DIRECTION, peutVoir } from '../src/apps/trone/routes/index';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  /* Les montants s'écrivent avec une espace insécable : le banc les compare à l'espace près. */
  const plat = (v: unknown) => (JSON.stringify(v) ?? '').replace(/[  ]/g, ' ');
  const ok = plat(attendu) === plat(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)?.slice(0, 220)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)?.slice(0, 220)}`);
};
const lit = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

/* ── 1. Le catalogue des lectures ── */
{
  dit('dix lectures, chacune dite a Claude et rattachee a un ecran', [10, true, true],
    [NOMS_DES_LECTURES.length, NOMS_DES_LECTURES.every((n) => LECTURES[n].dit.startsWith(n)), NOMS_DES_LECTURES.every((n) => LECTURES[n].ecran.startsWith('/') && !!LECTURES[n].nomEcran)]);
  const items = (SCHEMA_DU_PLAN.properties as { lectures: { maxItems: number; items: { properties: { nom: { enum: string[] } } } } }).lectures;
  dit('le schema ne connait que ces lectures, quatre au plus', [[...NOMS_DES_LECTURES], LECTURES_MAX], [items.items.properties.nom.enum, items.maxItems]);
}

/* ── 2. Le plan, lu sans rien croire ── */
{
  dit('une reponse seule', { reponse: 'Deux rituels.', lectures: [], internet: '' }, planLu({ reponse: ' Deux rituels. ', lectures: [] }));
  dit('des lectures : la reponse d avance ne se garde pas', { reponse: '', lectures: [{ nom: 'journee', jour: '2026-11-20' }], internet: '' },
    planLu({ reponse: 'Je pense que…', lectures: [{ nom: 'journee', jour: '2026-11-20' }] }));
  dit('une lecture inconnue tombe', { reponse: '', lectures: [{ nom: 'impayes' }], internet: '' }, planLu({ reponse: '', lectures: [{ nom: 'efface_tout' }, { nom: 'impayes' }] }));
  dit('une date mal formee tombe, pas la lecture', [{ nom: 'rendez_vous', au: '2026-11-25' }],
    planLu({ reponse: '', lectures: [{ nom: 'rendez_vous', du: 'demain', au: '2026-11-25', jour: '2026-13-45' }] }).lectures);
  dit('un mois « AAAA-MM », un nom borne a 80 signes', [{ nom: 'mois', mois: '2026-10' }, 80],
    [planLu({ reponse: '', lectures: [{ nom: 'mois', mois: '2026-10' }] }).lectures[0], planLu({ reponse: '', lectures: [{ nom: 'cliente', cliente: 'a'.repeat(300) }] }).lectures[0].cliente?.length]);
  dit('quatre lectures au plus, sans doublon', ['journee', 'impayes', 'mois', 'depenses'],
    planLu({ reponse: '', lectures: [{ nom: 'journee' }, { nom: 'journee' }, { nom: 'impayes' }, { nom: 'mois' }, { nom: 'depenses' }, { nom: 'abonnements' }, { nom: 'conversations' }] }).lectures.map((l) => l.nom));
  dit('n importe quoi ne rend rien', [{ reponse: '', lectures: [], internet: '' }, { reponse: '', lectures: [], internet: '' }, { reponse: '', lectures: [], internet: '' }],
    [planLu(null), planLu('bonjour'), planLu({ reponse: 12, lectures: 'journee' })]);
}

/* ── 3. Les demandes : la porte de la direction, la voix de Perle ── */
{
  const plan = demandeDuPlan({ question: '  Combien avons-nous encaissé ?  ', jour: '2026-11-21', minutes: 15 * 60 + 13, enDirect: '- Encaissé aujourd’hui : 185 000 F' });
  dit('le plan passe par le chantier « question », en texte, avec son schema', ['question', 'texte', true, 700], [plan.chantier, plan.usage, plan.schema === SCHEMA_DU_PLAN, plan.maxTokens]);
  dit('ce chantier est a la direction seule', [true, true, false, false],
    [peutDemander('souverain', CHANTIER_DE_PERLE, {}), peutDemander('gerant', CHANTIER_DE_PERLE, {}),
      peutDemander('maitre', CHANTIER_DE_PERLE, { 'dept-clientele': true, 'dept-finances': true, 'dept-vente-caisse': true, 'dept-systeme': true }), peutDemander(undefined, CHANTIER_DE_PERLE, {})]);
  dit('la demande est recevable par la porte', null, defautDeLaDemande(plan));
  dit('Perle sait le moment, les faits en direct et le catalogue', [true, true, true, true],
    [plan.systeme.includes('samedi 21 novembre 2026, 15 h 13 à Cotonou'), plan.systeme.includes('- Encaissé aujourd’hui : 185 000 F'), plan.systeme.includes('journee(jour)'), plan.systeme.includes('depenses(du, au)')]);
  dit('elle lit et ne fait rien : ni message, ni rendez-vous, ni argent', [true, true, true],
    [plan.systeme.includes('tu n’envoies aucun message'), plan.systeme.includes('tu ne poses ni ne déplaces aucun rendez-vous'), plan.systeme.includes('tu ne déplaces jamais d’argent')]);
  dit('elle n invente aucun chiffre, et garde les prenoms et initiales', [true, true],
    [plan.systeme.includes('N’invente AUCUN chiffre'), plan.systeme.includes('prénom et une initiale')]);
  dit('la question part rognee, en dernier message de la Maison', [{ role: 'user', content: 'Combien avons-nous encaissé ?' }, 1200],
    [plan.messages[plan.messages.length - 1], demandeDuPlan({ question: 'x'.repeat(5000), jour: '2026-11-21', minutes: 0, enDirect: '' }).messages[0].content.length]);
  dit('le moment se dit en clair', 'lundi 5 janvier 2026, 9 h 05 à Cotonou', momentDit('2026-01-05', 9 * 60 + 5));

  const fil = [
    { role: 'assistant' as const, content: 'orpheline' },
    ...[1, 2, 3, 4].flatMap((n) => [{ role: 'user' as const, content: `q${n}` }, { role: 'assistant' as const, content: `r${n}` }]),
  ];
  dit('trois tours d avant, jamais un premier message de Perle', ['q2', 'r2', 'q3', 'r3', 'q4', 'r4'], toursDAvant(fil).map((m) => m.content));
  dit('... et un fil qui commence par elle perd ce debut', ['q1', 'r1'], toursDAvant(fil.slice(0, 3)).map((m) => m.content));
}

/* ── 4. La reponse : les faits lus, bornes ── */
{
  const faits = [
    { lecture: 'journee' as const, titre: 'La journée du 21 novembre 2026', texte: 'Argent entré : 185 000 F.' },
    { lecture: 'cliente' as const, titre: 'La fiche de Awa K.', texte: 'Awa K. Elle ne doit rien.', lien: '/customers?id=c1' },
  ];
  const r = demandeDeLaReponse({ question: 'Et Awa K. ?', jour: '2026-11-21', minutes: 600, enDirect: '- rien', faits });
  dit('la reponse emporte les faits lus, sans schema', [true, true, undefined, 'question', null],
    [r.systeme.includes('## La journée du 21 novembre 2026\nArgent entré : 185 000 F.'), r.systeme.includes('## La fiche de Awa K.'), r.schema, r.chantier, defautDeLaDemande(r)]);
  const enormes = [1, 2, 3].map((n) => ({ lecture: 'depenses' as const, titre: `Liste ${n}`, texte: Array.from({ length: 4000 }, (_, i) => `- ligne ${i} de la liste ${n}`).join('\n') }));
  const texte = faitsEnTexte(enormes);
  dit('des faits enormes se bornent, chacun garde sa part, et la coupe se dit', [true, true, true],
    [texte.length <= SIGNES_DE_FAITS_MAX + 600, texte.includes('## Liste 1') && texte.includes('## Liste 3'), texte.includes('la suite n’est pas montrée')]);
  dit('... et la demande reste recevable par la porte', [null, true],
    [defautDeLaDemande(demandeDeLaReponse({ question: 'q', jour: '2026-11-21', minutes: 0, enDirect: 'x'.repeat(2000), faits: enormes })), SIGNES_DE_FAITS_MAX < SIGNES_MAX_PAR_DEMANDE - 8000]);
  dit('la coupe tombe en fin de ligne, jamais au milieu d un chiffre', true, faitsEnTexte(enormes).split('\n(la suite')[0].endsWith(' de la liste 1'));
  dit('la reponse perd le tiret cadratin et les marques', 'Deux rituels, 70 000 F à encaisser.\n\nÀ voir', reponsePropre(`**Deux rituels** ${String.fromCharCode(8212)} 70 000 F à encaisser.\n\n\n\n## À voir`));
  dit('... et prend l apostrophe de la Maison', 'Aujourd’hui, l’argent n’est pas entré. « l’une »', reponsePropre("Aujourd'hui, l'argent n'est pas entré. « l'une »"));
  dit('« Lu dans » : un ecran par lecture, sans doublon ; la fiche pour une cliente',
    [{ nom: 'La journée', chemin: '/la-journee' }, { nom: 'Sa fiche', chemin: '/customers?id=c1' }, { nom: 'Le Carnet', chemin: '/carnet' }],
    ecransLus([...faits, { lecture: 'rendez_vous' }, { lecture: 'places_libres' }, { lecture: 'journee' }]));
}

/* ── 5. Les bornes des lectures ── */
{
  dit('les rendez-vous : aujourd hui sans date, sept jours au plus, dans l ordre',
    [{ du: '2026-11-21', au: '2026-11-21' }, { du: '2026-11-22', au: '2026-11-28' }, { du: '2026-11-25', au: '2026-11-25' }, { du: '2026-11-23', au: '2026-11-23' }],
    [fenetreDesRendezVous({}, '2026-11-21'), fenetreDesRendezVous({ du: '2026-11-22', au: '2027-01-31' }, '2026-11-21'),
      fenetreDesRendezVous({ du: '2026-11-25', au: '2026-11-20' }, '2026-11-21'), fenetreDesRendezVous({ jour: '2026-11-23' }, '2026-11-21')]);
  dit('les depenses : le mois en cours sans date, 92 jours au plus',
    [{ du: '2026-11-01', au: '2026-11-30' }, { du: '2026-02-01', au: '2026-02-28' }, { du: '2026-01-01', au: '2026-04-02' }, { du: '2026-11-10', au: '2026-11-21' }],
    [fenetreDesDepenses({}, '2026-11-21'), fenetreDesDepenses({ mois: '2026-02' }, '2026-11-21'),
      fenetreDesDepenses({ du: '2026-01-01', au: '2026-12-31' }, '2026-11-21'), fenetreDesDepenses({ du: '2026-11-10' }, '2026-11-21')]);
  dit('le mois d avant, le dernier jour du mois (annee bissextile, janvier)', ['2025-12', '2026-10', '2028-02-29', '2026-11-30'],
    [moisDAvant('2026-01'), moisDAvant('2026-11'), dernierJourDuMois('2028-02'), dernierJourDuMois('2026-11')]);
}

/* ── 5 bis. Un montant ne se prend pas pour un numéro ── */
{
  dit('sous dix millions, le montant de la Maison', ['185 000 F', '9 999 999 F', '0 F'], [francsPourPerle(185000), francsPourPerle(9999999), francsPourPerle(0)]);
  dit('dix millions et plus se disent en millions', ['12 millions 500 000 F', '10 millions F', '−25 millions 30 F'], [francsPourPerle(12500000), francsPourPerle(10000000), francsPourPerle(-25000030)]);
  dit('... et la porte ne les efface plus (ecrit en chiffres, il partait en « [numéro] F »)', [true, true, false],
    [sansCoordonnees(francsPourPerle(12500000)) === francsPourPerle(12500000), sansCoordonnees(francsPourPerle(987654321)) === francsPourPerle(987654321), sansCoordonnees('12 500 000 F') === '12 500 000 F']);
}

/* ── 6. Retrouver une cliente, et ce qui part chez Claude ── */
{
  const fiches = [
    { id: 'c1', name: 'Awa Kossou' }, { id: 'c2', name: 'Awa Dossou' }, { id: 'c3', name: 'Chloé Fagbémi' },
    { id: 'c4', name: 'Bénédicte de Souza' }, { id: 'c5', name: 'Éric' }, { id: 'c6', name: 'Awa Marie Kpadonou' },
  ];
  dit('« Awa K. » : le prenom et l initiale d un nom', ['c1', 'c6'], clientesDuNom('Awa K.', fiches).map((c) => c.id));
  dit('« Mme Kossou Awa », sans accent ni casse', ['c1'], clientesDuNom('Mme KOSSOU awa', fiches).map((c) => c.id));
  dit('« awa » seul : trois fiches au plus', ['c2', 'c1', 'c6'], clientesDuNom('awa', fiches).map((c) => c.id));
  dit('« Chloe » sans accent, « Fagb » en debut de nom', [['c3'], ['c3']], [clientesDuNom('Chloe', fiches).map((c) => c.id), clientesDuNom('chloé fagb', fiches).map((c) => c.id)]);
  dit('un nom que personne ne porte, ou rien', [[], [], []], [clientesDuNom('Zoé', fiches), clientesDuNom('', fiches), clientesDuNom('Mme', fiches)]);
  dit('dans la question : le nom de famille reconnait la fiche, le prenom a cote passe devant', [['c2'], ['c1'], ['c4']],
    [clientesDeLaQuestion('Que doit Mme Dossou ?', fiches).map((c) => c.id), clientesDeLaQuestion('Quand est venue Awa Kossou ?', fiches).map((c) => c.id), clientesDeLaQuestion('la fiche de souza', fiches).map((c) => c.id)]);
  dit('... le prenom seul ne designe personne (vingt fiches le portent)', [[], []], [clientesDeLaQuestion('Quand vient Awa ?', fiches), clientesDeLaQuestion('Combien avons-nous encaissé ?', fiches)]);

  const nommees = clientesDeLaQuestion('Que doit Mme Dossou, au 97 00 00 99 ?', fiches).flatMap((c) => personnesDe(c.name));
  const pleins = fiches.map((c) => personnesDe(c.name)[0]).filter(Boolean);
  dit('ce qui part : un nom complet devient prenom et initiale', 'Quand est venue Awa K. ? Et Chloé F. ?', pourClaude('Quand est venue Awa Kossou ? Et Fagbémi Chloé ?', pleins));
  dit('... un nom de famille seul devient son initiale, un numero ne part pas', 'Que doit Mme D., au [numéro] ?', pourClaude('Que doit Mme Dossou, au 97 00 00 99 ?', [...nommees, ...pleins]));
  dit('une cliente se dit « Awa K. » dans les faits', ['Awa K.', 'Éric'], [prenomDeLaFiche('Awa Kossou'), prenomDeLaFiche('Éric')]);
}

/* ── 6 bis. Internet (21 novembre 2026, « oui internet ») ── */
{
  const base = { question: 'Quel est le taux de TVA au Bénin ?', jour: '2026-11-21', minutes: 600, enDirect: '- rien' };
  const avec = demandeDuPlan({ ...base, internet: true });
  const sans = demandeDuPlan(base);
  dit('le plan ne propose internet que si la fonction posee sait chercher', [true, false, true, true],
    [avec.systeme.includes('écris dans « internet » la question à chercher'), sans.systeme.includes('écris dans « internet »'),
      sans.systeme.includes('tu ne lis pour l’instant que le Trône'), avec.systeme.includes('Une question sur la Maison ne va jamais sur internet.')]);
  dit('... et il demande une question SANS nom de personne ni chiffre de la Maison', true, avec.systeme.includes('reformulée SANS aucun nom de personne ni chiffre de la Maison'));
  dit('le plan lu : internet, quand il n y a ni lecture ; sa reponse d avance tombe', { reponse: '', lectures: [], internet: 'taux de TVA au Bénin en 2026' },
    planLu({ reponse: 'Je crois que…', lectures: [], internet: '  taux de TVA au Bénin en 2026 ' }));
  dit('... le Trone d abord : avec une lecture, rien ne part sur internet', { reponse: '', lectures: [{ nom: 'mois' }], internet: '' },
    planLu({ reponse: '', lectures: [{ nom: 'mois' }], internet: 'chiffre d affaires moyen d un salon' }));
  dit('... une question bornee a 400 signes ; autre chose qu un texte ne compte pas', [QUESTION_INTERNET_MAX, 400, ''],
    [QUESTION_INTERNET_MAX, planLu({ reponse: '', lectures: [], internet: 'x'.repeat(2000) }).internet.length, planLu({ reponse: 'ok', lectures: [], internet: { q: 1 } }).internet]);

  const d = demandeDInternet({ question: '  taux de TVA au Bénin en 2026  ', jour: '2026-11-21', minutes: 15 * 60 + 13 });
  dit('la recherche : le chantier de la direction, en texte, `web`, sans schema', ['question', 'texte', true, undefined, null], [d.chantier, d.usage, d.web, d.schema, defautDeLaDemande(d)]);
  dit('... la question SEULE : ni le fil En direct, ni les tours d avant', [[{ role: 'user', content: 'taux de TVA au Bénin en 2026' }], false, false],
    [d.messages, d.systeme.includes('FAITS'), d.systeme.includes('Encaissé')]);
  dit('... ses regles : le Benin d abord, la source nommee, la date, pas un conseil, jamais une personne privee', [true, true, true, true, true, true],
    [d.systeme.includes('cherche d’abord ce qui vaut au Bénin'), d.systeme.includes('Nomme le site'), d.systeme.includes('Donne la date de l’information'),
      d.systeme.includes('c’est une information, pas un conseil'), d.systeme.includes('Ne cherche jamais le nom d’une personne privée'), d.systeme.includes('samedi 21 novembre 2026, 15 h 13 à Cotonou')]);
  dit('la recherche est reservee au chantier « question » : ailleurs, la porte la refuse', 'la recherche sur internet n’est ouverte qu’aux questions de la direction',
    defautDeLaDemande({ ...d, chantier: 'reponse-wa' }));

  const etiquettes = ['Awa K.', 'Awa Marie K.', 'Chloé F.', 'Éric', 'Bénédicte D.'];
  dit('ce qui part sur internet ne porte aucune cliente, meme en prenom et initiale', 'Que répondre à une cliente et à une cliente qui demandent un devis ?',
    sansLesClientes('Que répondre à Awa Marie K. et à Chloé F. qui demandent un devis ?', etiquettes));
  dit('... sans casse ni bord de mot manque ; un prenom seul reste un mot de tous les jours', ['une cliente veut un prix.', 'Éric cherche un taux', 'Le forfait Awa Kiné'],
    [sansLesClientes('awa k. veut un prix.', etiquettes), sansLesClientes('Éric cherche un taux', etiquettes), sansLesClientes('Le forfait Awa Kiné', etiquettes)]);
  dit('la chaine entiere : nom complet -> prenom et initiale -> « une cliente », et le numero tombe', 'Comment relancer une cliente au [numéro] ?',
    sansLesClientes(pourClaude('Comment relancer Awa Kossou au 97 00 00 99 ?', [{ prenom: 'Awa', nom: 'Kossou' }]), ['Awa K.']));

  dit('les sources : des adresses web seulement, sans doublon, six au plus ; sans titre, le nom du site',
    [{ titre: 'La TVA', url: 'https://impots.exemple.bj/tva' }, { titre: 'presse.exemple', url: 'https://www.presse.exemple/a?b=1' }],
    sourcesPropres([{ titre: 'La TVA', url: 'https://impots.exemple.bj/tva' }, { titre: 'Encore', url: 'https://impots.exemple.bj/tva' }, { titre: 'Piège', url: 'javascript:alert(1)' },
      { titre: '', url: 'https://www.presse.exemple/a?b=1' }, { url: 'ftp://x.exemple' }, null, 'https://nu.exemple', { titre: 'Espace', url: 'https://x.exemple/a b' }]));
  dit('... six au plus, et n importe quoi ne rend rien', [6, [], []],
    [sourcesPropres(Array.from({ length: 9 }, (_, i) => ({ titre: `S${i}`, url: `https://s${i}.exemple/` }))).length, sourcesPropres(null), sourcesPropres({ url: 'https://x.exemple' })]);
}

/* ── 7. En direct ── */
{
  const rdvs: RdvDuJour[] = [
    { id: 'a', heureMin: 14 * 60, dureeMin: 120, maitre: 'Team', status: 'confirmé' },
    { id: 'b', heureMin: 14 * 60 + 30, dureeMin: 90, maitre: 'Expert', status: 'confirmé' },
    { id: 'c', heureMin: 9 * 60, dureeMin: 60, maitre: 'Team', status: 'honoré' },
    { id: 'd', heureMin: 13 * 60, dureeMin: 240, maitre: 'Team', status: 'annulé' },
    { id: 'e', heureMin: 16 * 60, dureeMin: 60, maitre: 'Team', status: 'confirmé' },
    { id: 'f', heureMin: 17 * 60 + 30, dureeMin: 30, maitre: 'Expert', status: 'en attente' },
    { id: 'g', heureMin: 11 * 60, dureeMin: 60, maitre: 'Team', status: 'confirmé' },
  ];
  const m = 15 * 60 + 13;
  dit('au fauteuil : commence, pas fini, encore « confirmé »', ['a', 'b'], auFauteuil(rdvs, m).map((r) => r.id));
  dit('encore attendues : pas commence, confirme ou en attente', ['e', 'f'], encoreAttendues(rdvs, m).map((r) => r.id));
  const faits: FaitsEnDirect = {
    jour: '2026-11-21', minutes: m, encaisseXof: 185000, pourboiresXof: 5000, aEncaisser: { n: 2, xof: 70000 }, rdvs,
    sansReponse: { n: 3, plusAncienneMin: 70 }, ferme: false, placesLibres: ['16:30', '18:00'], aConfirmer: 2,
  };
  const lignes = lignesEnDirect(faits);
  dit('le fil : sept lignes, dans l ordre', ['encaisse', 'a-encaisser', 'fauteuil', 'attendues', 'sans-reponse', 'places', 'a-confirmer'], lignes.map((l) => l.cle));
  dit('... ce qu elles disent', [
    'Encaissé aujourd’hui : 185 000 F', 'Pourboires à part : 5 000 F',
    'À encaisser : 70 000 F', '2 rituels commencés ou terminés, sans règlement',
    'Au fauteuil : 2', 'Team depuis 14 h · Expert depuis 14 h 30',
    'Encore attendues aujourd’hui : 2', '16 h, 17 h 30',
    '3 conversations sans réponse', 'La plus ancienne attend depuis 1 h 10 min',
    'Places libres aujourd’hui', '16 h 30, 18 h, pour une heure',
    '2 rendez-vous suggérés sans réponse',
  ], [...lignes.slice(0, 6).flatMap((l) => [l.titre, l.detail]), lignes[6].titre]);
  dit('chaque ligne mene a un ecran du Trone', ['/la-journee', '/caisse', '/carnet', '/carnet', '/conversations', '/carnet', '/carnet'], lignes.map((l) => l.ecran));
  const calme = lignesEnDirect({ ...faits, encaisseXof: 0, pourboiresXof: 0, aEncaisser: { n: 0, xof: 0 }, rdvs: [], sansReponse: { n: 0, plusAncienneMin: null }, placesLibres: [], aConfirmer: 0 });
  dit('un jour calme : l argent du jour, et « plus de place », rien d autre', [['encaisse', 'places'], 'Encaissé aujourd’hui : 0 F', 'Plus de place libre aujourd’hui'],
    [calme.map((l) => l.cle), calme[0].titre, calme[1].titre]);
  dit('un jour ferme le dit, au singulier quand il faut', ['La Maison est fermée aujourd’hui', '1 conversation sans réponse', 'À encaisser : 30 000 F', '1 rituel commencé ou terminé, sans règlement'],
    (() => {
      const l = lignesEnDirect({ ...faits, ferme: true, sansReponse: { n: 1, plusAncienneMin: 12 }, aEncaisser: { n: 1, xof: 30000 } });
      return [l.find((x) => x.cle === 'places')?.titre, l.find((x) => x.cle === 'sans-reponse')?.titre, l.find((x) => x.cle === 'a-encaisser')?.titre, l.find((x) => x.cle === 'a-encaisser')?.detail];
    })());
  dit('le fil dit a Perle : une ligne par fait', '- Encaissé aujourd’hui : 185 000 F (Pourboires à part : 5 000 F)', enDirectEnTexte(lignes).split('\n')[0]);
  /* Premier essai en ligne, 21 novembre 2026 : « attend depuis 13 h 52 » (treize heures d'attente)
     est devenu « depuis 13 h 52 hier » dans la réponse. Une durée porte ses minutes ou son mot. */
  dit('une duree ne se lit jamais comme une heure', ['20 min', '1 heure', '2 heures', '13 h 52 min', '1 h 05 min', '0 min'],
    [dureeEnClair(20), dureeEnClair(60), dureeEnClair(120), dureeEnClair(832), dureeEnClair(65), dureeEnClair(-4)]);
  dit('... et le fil la dit ainsi', 'La plus ancienne attend depuis 13 h 52 min',
    lignesEnDirect({ ...faits, sansReponse: { n: 1, plusAncienneMin: 832 } }).find((l) => l.cle === 'sans-reponse')?.detail);
}

/* ── 8. La porte, et l'écran qui ne fait que lire (lus dans leur source) ── */
{
  dit('« Demander à Perle » est a la direction seule', [true, true, true, false, false],
    [ROUTES_DIRECTION.includes('/demander'), peutVoir('souverain', '/demander', {}), peutVoir('gerant', '/demander', {}),
      peutVoir('maitre', '/demander', { '/demander': true, 'dept-direction': true, 'dept-clientele': true, 'dept-finances': true }), peutVoir('maitre', '/demander', {})]);
  const routes = lit('src/apps/trone/routes/index.tsx');
  dit('la route existe, hors des departements, et se sait nee apres eux', [true, true],
    [routes.includes("{ path: '/demander', horsMenu: true, label: 'Demander à Perle', icon: Sparkles, Component: lazy(() => import('./pilotage/DemanderAPerle')) },"),
      /ECRANS_NES_APRES_LES_DEPARTEMENTS[^\n]*'\/demander'/.test(routes)]);
  const shell = lit('src/apps/trone/shell/Shell.tsx');
  dit('son entree est en tete de la barre, sous la meme garde, et Alt P l ouvre', [true, true, true],
    [/<nav className="tr-nav">[\s\S]{0,400}\{peutVoir\(role, '\/demander', mesDomaines\) && \(\s*<NavLink to="\/demander"/.test(shell),
      shell.includes("const ouvrePerle = peutVoir(staff?.role, '/demander', mesDomaines);"),
      shell.includes("if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyP') { e.preventDefault(); navigate('/demander'); }")]);
  const ecran = lit('src/apps/trone/routes/pilotage/DemanderAPerle.tsx');
  const donnees = lit('src/apps/trone/routes/pilotage/perle-donnees.ts');
  dit('la question et les tours d avant partent anonymises, jamais bruts', [true, true, true, false],
    [ecran.includes('const pourElle = perle.pourClaude(q);'), ecran.includes("{ role: 'user' as const, content: perle.pourClaude(e.question) },"),
      ecran.includes('const contexte = { question: pourElle, jour: perle.jour, minutes: perle.minutes, enDirect: perle.enDirectTexte, avant };'),
      /demandeDuPlan\(\{[^}]*question: q\b/.test(ecran)]);
  dit('la lecture d une cliente se fait sur la vraie question, au Trone', true, ecran.includes('faits = plan.lectures.flatMap((l) => perle.lis(l, q));'));
  /* Internet (21 novembre 2026). */
  dit('internet : la question reformulee part seule, par `pourInternet`, et seulement si la fonction sait chercher', [true, true, true, false],
    [ecran.includes('if (plan.internet && internet) {'), ecran.includes('demandeDInternet({ question: perle.pourInternet(plan.internet), jour: perle.jour, minutes: perle.minutes })'),
      ecran.includes('const r1 = await demandeAClaude<unknown>(demandeDuPlan({ ...contexte, internet }));'), /demandeDInternet\(\{[^}]*(avant|enDirect)/.test(ecran)]);
  dit('... `pourInternet` retire les clientes apres l anonymisation ordinaire', true,
    donnees.includes('pourInternet: (texte: string) => sansLesClientes(pourElle(texte), clients.map((c) => prenomDeLaFiche(c.name))),'));
  dit('... les sources passent par `sourcesPropres` et s ouvrent a part, sans donner la main a la page ouverte', [true, true, true],
    [ecran.includes('sources: sourcesPropres(r3.data?.sources)'), ecran.includes('<a href={s.url} target="_blank" rel="noopener noreferrer">{s.titre}</a>'),
      ecran.includes('Cherché sur internet, pas dans le Trône : à confirmer à la source avant de décider.')]);
  dit('... et l ecran ne propose internet que sur la version qui le sait', true, ecran.includes('setInternet(saitInternet(x));'));
  dit('l ecran redit sa garde, et sa conversation reste sur le poste', [true, true, false],
    [ecran.includes("const direction = moi?.role === 'souverain' || moi?.role === 'gerant';"), ecran.includes("createStore<Record<string, Echange[]>>('mnd_perle_fil', {})"), /bindDocument|bindCollection/.test(ecran)]);
  const ECRITURES = /Store\.set\(|envoieSurWhatsApp|poseUnRendezVous|honorAppointment|remplaceLeRendezVous|\.upsert\(|\.insert\(|\.update\(/;
  dit('Perle ne fait que lire : aucune ecriture dans ses donnees ; l ecran n ecrit que sa propre conversation', [false, ['setFils((tous) => ({ ...tous, [cle]: [...(tous[cle] ?? []), e].slice(-ECHANGES_GARDES) }))', 'setFils((tous) => ({ ...tous, [cle]: [] }))']],
    [ECRITURES.test(donnees), ecran.match(/setFils\(\(tous\) => \(\{[^\n]*?\}\)\)/g)]);
  dit('... et l ecran n appelle aucun magasin ni aucun envoi', false, /Store\.set\(|envoieSurWhatsApp|poseUnRendezVous|supabase/.test(ecran));
  dit('les donnees passent par les portes de la Maison : sans les essais, en prenom et initiale, sans coordonnees', [true, false, true, true, true, true],
    [donnees.includes('const [toutesLesFiches] = useClientsDeLaMaison();'), /\buseClients\(\)|\buseInvoices\(\)|\buseAppointments\(\)/.test(donnees),
      donnees.includes('usePiecesDeLaMaison()'), donnees.includes('useBranchAppointments()'), donnees.includes('prenomDeLaFiche(nom)'), donnees.includes('texte: sansCoordonnees(texte)')]);
  dit('les conversations : les memes juges que l alarme, sans sa sonnette', [true, true, false],
    [donnees.includes('filsDeLaMaison(messages, tetes, prives, tick, branch.id, automates)'), donnees.includes('filsSansReponse(tous.filter((f) => !estArchive(f, supprimees)), archives, TIROIRS, retires)'), /sonne\(|armeLaSonnette|useLAlarmeWhatsApp/.test(donnees)]);
  dit('le moment est celui du salon, pas du poste', [true, false], [donnees.includes('momentDuSalon(tick)'), /getHours\(\)|todayISO\(\)/.test(donnees)]);
}

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} ECHEC(S).`);
if (ko) process.exitCode = 1;
