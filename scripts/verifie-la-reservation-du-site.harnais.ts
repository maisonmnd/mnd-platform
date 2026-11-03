/* LA RÉSERVATION DU SITE, ÉPROUVÉE — `node scripts/verifie-la-reservation-du-site.mjs`.

   « Make these changes on maisonmnd.com » (Yéman, 3 novembre 2026) : la
   barre du total, la présélection par la page, la référence avant WhatsApp,
   le chargeur des places et son repli, le retour d'une cliente, la page du
   rendez-vous (/rdv/, /rdv/agenda/). Le serveur a son banc à lui.

   Trois temps : les règles pures (reservation-du-site-pure), les sources lues
   à des ancres précises, puis des pannes plantées EN MÉMOIRE dans ces
   textes, chacune devant être criée. Tout est inventé. Sortie ASCII : la
   console de Windows. */
import { readFileSync } from 'node:fs';
import {
  appelDuRetour, barreDuTotal, coordonneesLues, DELAI_DU_CHARGEUR_MS, ditLeRetour, dureeDite, etatDuChargeur,
  gestesAPrecocher, gestesDeLAdresse, heureDite, jetonDeLAdresse, lectureDuRdv, NOM_DU_PARCOURS, nomDuFichierAgenda,
  PHRASE_DU_RETOUR, referenceDeLaReponse, texteDeLaBarre,
} from '../src/apps/revelateur/reservation-du-site-pure';
import { fmtMoney } from '../src/shared/currency';
import { PAGES } from '../src/apps/revelateur/contenu';
import { REMISE_EXCLUE } from '../src/apps/revelateur/remise-pure';

let ko = 0;
let n = 0;
const ascii = (v: unknown): string =>
  (JSON.stringify(v) ?? 'undefined').replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : ` -> ${ascii(obtenu)}\n       attendu ${ascii(attendu)}`}`);
};

/* ── 1. La barre du total ── */
const F = (x: number) => fmtMoney(x, 'XOF');
dit('B1 rien tant qu aucun geste n est coche', [null, ''], [barreDuTotal({ nombre: 0, dureeMin: 0, prix: 0, flou: false, devise: 'XOF' }), texteDeLaBarre(null)]);
const un = barreDuTotal({ nombre: 1, dureeMin: 45, prix: 5000, flou: false, devise: 'XOF' });
dit('B2 un geste : le nombre au singulier, la duree, le prix ferme', { gestes: '1 geste', duree: '45 min', prix: F(5000) }, un);
const trois = barreDuTotal({ nombre: 3, dureeMin: 150, prix: 25000, flou: true, devise: 'XOF' });
dit('B3 trois gestes, un prix flou : a partir de', { gestes: '3 gestes', duree: '2 h 30', prix: `à partir de ${F(25000)}` }, trois);
dit('B4 la barre en une phrase', `3 gestes · 2 h 30 · à partir de ${F(25000)}`, texteDeLaBarre(trois));
dit('B5 rien a chiffrer : prix a la Maison', 'prix à la Maison', barreDuTotal({ nombre: 2, dureeMin: 60, prix: 0, flou: true, devise: 'XOF' })?.prix);
dit('B6 les durees dites comme on parle', ['', '45 min', '1 h', '1 h 05', '2 h 30'], [dureeDite(0), dureeDite(45), dureeDite(60), dureeDite(65), dureeDite(150)]);
dit('B7 les heures dites comme on parle', ['10 h', '14 h 30', '9 h'], [heureDite('10:00'), heureDite('14:30'), heureDite('09:00')]);

/* ── 2. La presélection ── */
dit('P1 ?geste= lit un ou plusieurs gestes, dans l ordre', ['sv-a', 'sv-b', 'sv-c'], gestesDeLAdresse('?besoin=entretien&geste=sv-a,sv-b&geste=sv-c'));
dit('P2 ce qui n a pas la forme d un identifiant est ecarte, un doublon compte une fois', ['ok-1'], gestesDeLAdresse('?geste=%3Cscript%3E,ok-1,ok-1,a%20b'));
dit('P3 sans ?geste=, rien', [], gestesDeLAdresse('?besoin=entretien'));
const offerts = [{ id: 'sv-lavage' }, { id: 'sv-racines' }];
dit('P4 un geste connu de la porte se precoche', ['sv-lavage'], gestesAPrecocher(['sv-lavage'], offerts, 6));
dit('P5 un geste inconnu est ignore sans bruit', [], gestesAPrecocher(['sv-nexiste-pas'], offerts, 6));
dit('P6 un geste hors de ce parcours est ignore', ['sv-racines'], gestesAPrecocher(['sv-creation-consult', 'sv-racines'], offerts, 6));
dit('P7 le plafond tient', ['sv-lavage'], gestesAPrecocher(['sv-lavage', 'sv-racines'], offerts, 1));
dit('P8 chaque parcours a son nom dit', ['Entretien', 'Réparation', 'Première Couronne', 'MND Kids'], [NOM_DU_PARCOURS.entretien, NOM_DU_PARCOURS.reparation, NOM_DU_PARCOURS.creation, NOM_DU_PARCOURS.enfant]);

/* ── 3. La reference ── */
dit('F1 la reference rendue par le serveur est gardee', 'MND-4XT3', referenceDeLaReponse({ reference: 'MND-4XT3', apptId: 'autre-chose' }));
dit('F2 une ancienne fonction ne la rend pas : elle se calcule d apres apptId (valeur gravee du contrat)', 'MND-4XT3', referenceDeLaReponse({ apptId: 'rdv-5986667f-51b3-467f-8e4f-e6d221a16a4c' }));
dit('F3 une reference mal formee ne passe pas, le calcul la remplace', 'MND-4XT3', referenceDeLaReponse({ reference: 'MND-0O1I', apptId: 'rdv-5986667f-51b3-467f-8e4f-e6d221a16a4c' }));
dit('F4 en minuscules, elle se redresse', 'MND-4XT3', referenceDeLaReponse({ reference: 'mnd-4xt3' }));
dit('F5 sans rendez-vous pose, pas de reference', ['', ''], [referenceDeLaReponse({ apptId: '' }), referenceDeLaReponse(null)]);

/* ── 4. Le chargeur ── */
dit('C1 douze secondes avant le repli', 12_000, DELAI_DU_CHARGEUR_MS);
dit('C2 en attente : le chargeur, puis le repli passe le delai', ['charge', 'charge', 'lent'], [etatDuChargeur('attente', 0), etatDuChargeur('attente', 11_999), etatDuChargeur('attente', 12_000)]);
dit('C3 une panne va au repli tout de suite, des places fraiches s affichent', ['panne', 'pret'], [etatDuChargeur('panne', 0), etatDuChargeur('frais', 99_000)]);

/* ── 5. Le retour d une cliente ── */
const connue = ditLeRetour({ ok: true });
const inconnue = ditLeRetour({ ok: true });
dit('R1 la phrase est la meme pour un numero connu et inconnu', true, connue.phrase === inconnue.phrase && connue.phrase === PHRASE_DU_RETOUR);
dit('R2 un champ glisse par le serveur ne change rien a ce que la page dit', connue, ditLeRetour({ ok: true, connue: true, prenom: 'A.' } as { ok: boolean }));
dit('R3 la phrase ne dit ni trouve, ni inconnu, ni bienvenue', false, /trouv|inconnu|bienvenue|reconnu/i.test(PHRASE_DU_RETOUR));
dit('R4 un numero mal forme se dit, le trop-plein aussi', ['telephone', 'trop', 'trop', 'panne'],
  [ditLeRetour({ ok: false, error: 'telephone' }).faute, ditLeRetour({ error: 'rate_limited' }).faute, ditLeRetour(null, 429).faute, ditLeRetour(null).faute]);
dit('R5 la fiche relue remplit prenom, nom, civilite, numero, indicatif',
  { prenom: 'Adjoa', nom: 'K.', civilite: 'madame', numero: '0151000000', dial: '+229' },
  coordonneesLues({ ok: true, cliente: { prenom: 'Adjoa', nom: 'K.', civilite: 'madame', numero: '0151000000', dial: '+229' } }));
dit('R6 un indicatif vide : le numero entier en +, le pays ne bouge pas', { prenom: 'Lea', nom: '', civilite: '', numero: '+33612345678', dial: '' },
  coordonneesLues({ ok: true, cliente: { prenom: 'Lea', civilite: 'reine', numero: '+33612345678', dial: '' } }));
dit('R7 un jeton passe ou forge : rien a remplir', [null, null, null], [coordonneesLues({ ok: false, error: 'lien' }), coordonneesLues(null), coordonneesLues({ ok: true, cliente: { prenom: 'X' } })]);
dit('R8 l appel ne suppose jamais la civilite', ['Mme Adjoa', 'M. Jean', 'Lea'],
  [appelDuRetour({ prenom: 'Adjoa Kossi', civilite: 'madame' }), appelDuRetour({ prenom: 'Jean', civilite: 'monsieur' }), appelDuRetour({ prenom: 'Lea', civilite: '' })]);

/* ── 6. La page du rendez-vous ── */
const rdvLu = lectureDuRdv({ ok: true, rdv: { reference: 'MND-4XT3', date: '2026-11-08', heure: '10:00', dureeMin: 90, gestes: ['Lavage rituel'], appel: 'Mme A.', statut: 'a-venir' } });
dit('D1 un rendez-vous a venir se lit', { etat: 'pret', rdv: { reference: 'MND-4XT3', date: '2026-11-08', heure: '10:00', dureeMin: 90, gestes: ['Lavage rituel'], appel: 'Mme A.', statut: 'a-venir' } }, rdvLu);
dit('D2 passe et annule se disent', ['passe', 'annule'], ['passe', 'annule'].map((s) => {
  const l = lectureDuRdv({ ok: true, rdv: { date: '2026-11-08', heure: '10:00', statut: s } });
  return l.etat === 'pret' ? l.rdv.statut : l.etat;
}));
dit('D3 un lien faux ou introuvable : la phrase calme', ['lien', 'lien', 'lien'],
  [lectureDuRdv({ ok: false, error: 'lien' }).etat, lectureDuRdv({ ok: false, error: 'introuvable' }).etat, lectureDuRdv({ ok: true, rdv: { date: 'demain', heure: '10:00' } }).etat]);
dit('D4 le trop-plein et la panne ont leur repli', ['trop', 'trop', 'panne'], [lectureDuRdv({ error: 'rate_limited' }).etat, lectureDuRdv(null, 429).etat, lectureDuRdv(null).etat]);
dit('D5 le jeton se lit dans l adresse, le fichier a son nom', ['ap-x.AbCdEfGhIjKlMnOpQrStUv', 'maison-mnd-2026-11-08.ics'],
  [jetonDeLAdresse('?v=ap-x.AbCdEfGhIjKlMnOpQrStUv'), nomDuFichierAgenda('2026-11-08')]);
const pageRdv = PAGES.find((p) => p.chemin === '/rdv/');
const pageAgenda = PAGES.find((p) => p.chemin === '/rdv/agenda/');
dit('D6 les deux pages existent et montent l ilot du rendez-vous', ['rdv', 'rdv'], [pageRdv?.ilot, pageAgenda?.ilot]);
dit('D7 les deux pages sont hors des moteurs et du plan', [true, true], [!!pageRdv?.horsDesMoteurs, !!pageAgenda?.horsDesMoteurs]);
dit('D8 titres et descriptions a la mesure de la vitrine', true,
  [pageRdv, pageAgenda].every((p) => !!p && p.titre.length <= 60 && p.description.length <= 155));
dit('D9 aucune remise ne vient sur la page du rendez-vous', [true, true], [REMISE_EXCLUE.has('/rdv/'), REMISE_EXCLUE.has('/rdv/agenda/')]);
dit('D10 ni tiret long, ni point d exclamation, ni salon dans ce que lit la cliente', [false, false, false],
  ((t: string) => [/—/.test(t), /!/.test(t), /salon/i.test(t)])([PHRASE_DU_RETOUR, pageRdv?.ligne, pageAgenda?.ligne, pageRdv?.description, pageAgenda?.description].join(' ')));

/* ── 7. Les sources, aux ancres ── */
const lis = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
type Textes = { reserver: string; rdv: string; chargeur: string; gen: string; contenu: string; css: string; monte: string; remise: string };
const VRAIS: Textes = {
  reserver: lis('src/apps/revelateur/ilots/Reserver.tsx'),
  rdv: lis('src/apps/revelateur/ilots/MonRendezVous.tsx'),
  chargeur: lis('src/apps/revelateur/ilots/Chargeur.tsx'),
  gen: lis('scripts/genere-revelateur.mjs'),
  contenu: lis('src/apps/revelateur/contenu.ts'),
  css: lis('src/apps/revelateur/revelateur.css'),
  monte: lis('src/apps/revelateur/monte.tsx'),
  remise: lis('src/apps/revelateur/remise-pure.ts'),
};
const avant = (t: string, a: string | RegExp, b: string | RegExp): boolean => {
  const i = typeof a === 'string' ? t.indexOf(a) : t.search(a);
  const j = typeof b === 'string' ? t.indexOf(b) : t.search(b);
  return i >= 0 && j >= 0 && i < j;
};
function controles(t: Textes): string[] {
  const tombes: string[] = [];
  const exige = (nom: string, ok: boolean) => { if (!ok) tombes.push(nom); };
  const r = t.reserver;
  /* La barre : les memes chiffres que « Votre venue », collante, dite aux lecteurs d ecran. */
  exige('la barre prend les chiffres de la venue', r.includes('const barre = barreDuTotal({ nombre: choisies.length, dureeMin: dureeTotale, prix: prixTotal, flou: prixFlou, devise });'));
  exige('la barre se dit en direct', /\{barre && \(\s*<div className="barre-du-total" role="status" aria-live="polite" aria-atomic="true"/.test(r));
  exige('la barre est collante', /\.barre-du-total \{ position: sticky; bottom: 0;/.test(t.css));
  /* La preselection. */
  exige('le geste se lit dans l adresse', r.includes("gestesDeLAdresse(typeof location === 'undefined' ? '' : location.search)"));
  exige('le lien prepare l emporte sur le geste de l adresse', /if \(prepare\.gestes\.length > 0\) return;\s*const pris = gestesAPrecocher\(voulusDeLAdresse, offerts, PLAFOND_GESTES\);/.test(r));
  exige('l adresse l emporte sur la memoire du telephone', avant(r, 'if (gestesAPrecocher(voulusDeLAdresse, offerts, PLAFOND_GESTES).length > 0) return;', 'const ok = moi.serviceIds.every('));
  exige('la famille du geste s ouvre', r.includes('if (aOuvrir.length) setPlies((p) => ({ ...(p ?? {}), ...Object.fromEntries(aOuvrir.map((g) => [g.id, true])) }));'));
  exige('le parcours se voit', r.includes('<span>Votre parcours : <b>{NOM_DU_PARCOURS[besoin]}</b></span>'));
  exige('le bouton Reserver de la barre et l appel de fin gardent le parcours', (t.gen.match(/href="\$\{attr\(reserverDeLaPage\(chemin\)\)\}">Réserver<\/a>/g) ?? []).length === 2 && t.gen.includes('corps + appelDeFin(chemin)'));
  exige('la regle du bouton suit la page : parcours reservable, pas de message', t.gen.includes("return p && RESERVABLES.has(p.besoin ?? '') && !p.cta?.vers ? versLaReservation(p.besoin, p.cta?.famille) : lien('/reserver/');"));
  /* La reference, avant WhatsApp ; deplacer, annuler ; l agenda du contrat. */
  exige('la reference se dit avant la ligne de WhatsApp', avant(r, /\{recu\.confirme && recu\.reference && \(\s*<p className="merci__reference">/, 'La confirmation est partie sur WhatsApp'));
  exige('pas de reference sans place tenue', r.includes('...(r.confirme === true ? { reference: referenceDeLaReponse(r) || undefined } : {}),'));
  exige('deplacer et annuler ecrivent a la Maison avec la reference',
    r.includes('motPourDeplacer(`${jourDit(recu.date)} à ${heureDite(recu.heure)}`, recu.reference)') && r.includes('motPourAnnuler(`${jourDit(recu.date)} à ${heureDite(recu.heure)}`, recu.reference)'));
  exige('l agenda vient du contrat, a l adresse de la Maison', /href=\{adresseDAgenda\(ficheAgendaICS\(\{\s*apptId: recu\.apptId/.test(r) && r.includes('lieu: `${COMMUN.nom}, ${COMMUN.editeur.adresseComplete}`') && !/fichierAgenda\(/.test(r));
  /* Le chargeur et son repli, qui relance pour de bon. */
  exige('les places ont leur chargeur', r.includes('? <Chargeur texte="Les places se chargent." />'));
  exige('passe le delai ou en panne, le repli', /: etatDesPlaces === 'lent' \|\| etatDesPlaces === 'panne'\s*\? <RepliDuChargement phrase=\{PHRASE_DU_REPLI_DES_PLACES\} wa=\{wa\} surReessayer=\{recharger\} \/>/.test(r));
  exige('le calendrier a son chargeur et son repli', r.includes('{lent ? <RepliDuChargement phrase={PHRASE_DU_REPLI_DU_CALENDRIER} wa={wa} surReessayer={recharger} /> : <Chargeur texte="Le calendrier se charge." />}'));
  exige('Reessayer relance la lecture', /setOccupesEtat\('frais'\);[\s\S]{0,200}\}, \[essai\]\);/.test(r) && r.includes('setEssai((n) => n + 1);'));
  exige('douze secondes, puis lent', r.includes('setTimeout(() => setLent(true), DELAI_DU_CHARGEUR_MS)') && r.includes('etatDuChargeur(occupesEtat, lent ? DELAI_DU_CHARGEUR_MS : 0)'));
  exige('le repli porte Reessayer', t.chargeur.includes('<button type="button" className="btn btn--fort" onClick={surReessayer}>Réessayer</button>'));
  exige('le chargeur se dit aux lecteurs d ecran', t.chargeur.includes('<p className="chargeur" role="status" aria-live="polite">'));
  exige('le chargeur est immobile pour qui l a demande', /\.chargeur__points i \{[^}]*opacity: \.7; \}/.test(t.css) && !/\.chargeur__points i \{[^}]*animation:[^}]*opacity: \.7/.test(t.css)
    && /@media \(prefers-reduced-motion: no-preference\) \{\s*\.chargeur__points i \{ opacity: 1; animation: chargeur-point/.test(t.css));
  /* Le retour d une cliente. */
  exige('le retour envoie le numero et son indicatif', r.includes("{ body: { cliente: 'retour', telephone: numero, dial: indicatif } }"));
  exige('le retour ne dit que la phrase de la page', r.includes("role=\"status\">{retourDit.phrase}</p>}") && (r.match(/setRetourDit\(/g) ?? []).length === (r.match(/setRetourDit\((ditLeRetour\(|error \? ditLeRetour\(\{ error: await raisonDuRefus\(data, error\) \}\) : ditLeRetour\(|\{ phrase: f\.erreurNumero, faute: 'telephone' \}|null)/g) ?? []).length);
  exige('le retour ne s offre pas quand le telephone la connait', r.includes('{!moi && !identiteLue && !prepare.gestes.length && !choisi && ('));
  exige('le lien du retour se relit', r.includes("{ body: { cliente: 'lire', identite: prepare.identite } }") && r.includes('const c = error ? null : coordonneesLues(data);'));
  exige('le pays se retrouve par son indicatif', r.includes('TELEPHONE_MONDE.find((x) => x.dial === c.dial)?.name'));
  /* La page du rendez-vous. */
  const v = t.rdv;
  exige('la page lit le rendez-vous par son jeton', v.includes("{ body: { rdv: 'lire', v: jeton } }"));
  exige('la page ne montre jamais le jeton', !/\{jeton\}|\{v\}/.test(v));
  exige('deplacer et annuler pour un rendez-vous a venir seulement', /\{aVenir \? \(\s*<>[\s\S]*motPourDeplacer\(quand, r\.reference\)[\s\S]*motPourAnnuler\(quand, r\.reference\)[\s\S]*\) : \(/.test(v));
  exige('l agenda part seul, une fois, pour un rendez-vous a venir', v.includes("if (!agendaSeul || telecharge1 || !lu || lu.etat !== 'pret' || lu.rdv.statut !== 'a-venir') return;") && v.includes('telecharge(fichierDuRdv(lu.rdv, apptId), nomDuFichierAgenda(lu.rdv.date));'));
  exige('le fichier a le type d un agenda', v.includes("new Blob([ics], { type: 'text/calendar;charset=utf-8' })"));
  exige('un lien faux se dit calmement', v.includes('<h2>Ce lien ne vaut plus.</h2>'));
  exige('l agenda porte l adresse de la Maison', v.includes('const LIEU = `${COMMUN.nom}, ${COMMUN.editeur.adresseComplete}`;'));
  exige('l ilot du rendez-vous se monte', t.monte.includes("rdv: () => import('./ilots/MonRendezVous')"));
  exige('le generateur ecrit l ilot, agenda pour /rdv/agenda/', t.gen.includes("const agenda = p.chemin === '/rdv/agenda/';") && t.gen.includes('data-ilot="rdv" data-genre="${agenda ? \'agenda\' : \'page\'}"'));
  exige('les deux pages sont hors des moteurs', /chemin: '\/rdv\/',[\s\S]{0,900}?ilot: 'rdv',[\s\S]{0,400}?horsDesMoteurs: '/.test(t.contenu) && /chemin: '\/rdv\/agenda\/',[\s\S]{0,900}?ilot: 'rdv',[\s\S]{0,400}?horsDesMoteurs: '/.test(t.contenu));
  exige('aucune remise sur ces pages', t.remise.includes("'/rdv/', '/rdv/agenda/',"));
  return tombes;
}

dit('S0 les vrais textes passent tous les controles', [], controles(VRAIS));

/* ── 8. Les pannes plantees : chacune doit etre criee ── */
const PANNES: [string, keyof Textes, string, string][] = [
  ['la barre oublie le prix flou', 'reserver', 'flou: prixFlou, devise });', 'flou: false, devise });'],
  ['la barre se tait', 'reserver', 'role="status" aria-live="polite" aria-atomic="true" data-texte', 'data-texte'],
  ['la barre ne colle plus', 'css', '.barre-du-total { position: sticky;', '.barre-du-total { position: static;'],
  ['le geste de l adresse chasse le lien prepare', 'reserver', 'if (prepare.gestes.length > 0) return;\n    const pris', '\n    const pris'],
  ['la memoire chasse le geste de l adresse', 'reserver', '    if (gestesAPrecocher(voulusDeLAdresse, offerts, PLAFOND_GESTES).length > 0) return;\n', ''],
  ['le parcours ne se voit plus', 'reserver', '<span>Votre parcours : <b>{NOM_DU_PARCOURS[besoin]}</b></span>', '<span />'],
  ['la barre du site repart a la porte', 'gen', 'href="${attr(reserverDeLaPage(chemin))}">Réserver</a>\n      </div>\n    </header>', 'href="${lien(\'/reserver/\')}">Réserver</a>\n      </div>\n    </header>'],
  ['une page par message ouvre le calendrier', 'gen', "&& !p.cta?.vers ? versLaReservation(p.besoin, p.cta?.famille)", '? versLaReservation(p.besoin, p.cta?.famille)'],
  ['la reference se tait', 'reserver', '{recu.confirme && recu.reference && (\n          <p className="merci__reference">', '{false && (\n          <p className="merci__reference">'],
  ['une reference sans place tenue', 'reserver', '...(r.confirme === true ? { reference:', '...(true ? { reference:'],
  ['l ancien fichier d agenda revient', 'reserver', 'href={adresseDAgenda(ficheAgendaICS({', 'href={fichierAgenda(({'],
  ['Reessayer ne relance rien', 'reserver', '}, [essai]);', '}, []);'],
  ['le chargeur attend sans fin', 'reserver', ": etatDesPlaces === 'lent' || etatDesPlaces === 'panne'", ": etatDesPlaces === 'panne'"],
  ['Reessayer est muet', 'chargeur', 'onClick={surReessayer}>Réessayer', '>Réessayer'],
  ['le retour trahit un numero connu', 'reserver', 'role="status">{retourDit.phrase}</p>}', 'role="status">{retourDit.phrase}{String((retourDit as unknown as { connue?: boolean }).connue ?? \'\')}</p>}'],
  ['le retour s offre a qui est deja reconnue', 'reserver', '{!moi && !identiteLue && !prepare.gestes.length && !choisi && (', '{!identiteLue && !prepare.gestes.length && !choisi && ('],
  ['le pays se cherche par son nom', 'reserver', 'x.dial === c.dial', 'x.name === c.dial'],
  ['la page montre le jeton', 'rdv', '<p className="sur">{aVenir ?', '<p className="sur">{jeton}{aVenir ?'],
  ['deplacer meme pour un rendez-vous passe', 'rdv', '{aVenir ? (\n        <>', '{true ? (\n        <>'],
  ['l agenda part pour un rendez-vous passe', 'rdv', " || lu.rdv.statut !== 'a-venir') return;", ') return;'],
  ['la page du rendez-vous va aux moteurs', 'contenu', "    horsDesMoteurs: 'La page du bouton « Déplacer ou annuler »", "    enPlus: 'La page du bouton « Déplacer ou annuler »"],
  ['l ilot n est pas monte', 'monte', "rdv: () => import('./ilots/MonRendezVous')", "rendezvous: () => import('./ilots/MonRendezVous')"],
  ['une remise vient sur la page', 'remise', "'/rdv/', '/rdv/agenda/',", ''],
];
let criees = 0;
for (const [nom, ou, de, vers] of PANNES) {
  const t = { ...VRAIS };
  if (!t[ou].includes(de)) { dit(`panne « ${nom} » : le texte a planter existe`, true, false); continue; }
  t[ou] = t[ou].replace(de, vers);
  const tombes = controles(t);
  if (tombes.length > 0) criees++;
  dit(`panne « ${nom} » criee`, true, tombes.length > 0);
}

console.log(`\n${n - ko}/${n} epreuves tenues${ko ? ` ; ${ko} en echec` : ''} ; ${criees} pannes criees sur ${PANNES.length}.`);
