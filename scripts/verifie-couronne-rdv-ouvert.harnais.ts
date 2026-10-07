/* LE RENDEZ-VOUS S'OUVRE PARTOUT, ÉPROUVÉ — 7 octobre 2026.

   « Dans Ma Couronne permettre aux clients d'ouvrir leurs RDV à tous les
   endroits qui montrent un RDV. J'ai l'impression que le RDV en 30 secondes
   n'a pas été déployé sur Ma Couronne » (Yéman). Maquette validée.

   LA RÈGLE, pas le cas du jour :
   1. tout endroit qui montre un rendez-vous l'ouvre sur SA fiche (accueil,
      rappel, enfant, suivi, liste à venir et passée, notifications, après la
      réservation, le lien d'une notification du téléphone) ;
   2. la cliente ne lit jamais le nom d'un maître : la Maison attribue ;
   3. une touche ne réserve jamais à l'aveugle : murs du serveur connus,
      horaires descendus, moment encore libre, pas d'acompte, une séance ;
   4. le premier écran de la réservation est celui des trente secondes :
      sa dernière venue, les formules de la Maison, les six prochaines places. */
import { readFileSync } from 'node:fs';
import { prochainesPlaces } from '../src/shared/reservation-express';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : `\n       attendu ${JSON.stringify(attendu)}\n       obtenu  ${JSON.stringify(obtenu)}`}`);
};
const lis = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const D = 'src/apps/couronne/';
const tabs = lis(`${D}Tabs.tsx`);
const liste = lis(`${D}MesRendezVous.tsx`);
const app = lis(`${D}App.tsx`);
const resa = lis(`${D}Booking.tsx`);
const lib = lis(`${D}lib.ts`);

/* ── 1. TOUTES LES PORTES ─────────────────────────────────────────────── */
dit('accueil : la prochaine séance ouvre SA fiche', true, /className="mc-nextrdv__ouvrir" onClick=\{\(\) => onOpenRdv\(next\.id\)\}/.test(tabs));
dit('accueil : le rappel des 48 h aussi', true, /className="mc-remindbanner" onClick=\{\(\) => onOpenRdv\(soon\.id\)\}/.test(tabs));
dit('enfant : son rituel ouvre sa fiche', true, /onClick=\{\(\) => onOpenRdv\?\.\(next\.id\)\}/.test(tabs) && /<HomeEnfant[^\n]{0,200}onOpenRdv=\{openRdv\} \/>/.test(app));
dit('suivi : chaque passage et le prochain ouvrent leur fiche', [true, true, true],
  [/id: a\.id,/.test(tabs), /id: next\.id,/.test(tabs), /onClick=\{\(\) => onOpenRdv\(ev\.id\)\}/.test(tabs)]);
dit('liste : les cartes à venir ET passées s\'ouvrent', 2, (liste.match(/mc-rdvcard--ouvrable" role="button" tabIndex=\{0\} onClick=\{\(\) => ouvreLaFiche\(a\)\}/g) ?? []).length);
dit('… et leurs boutons ne l\'ouvrent pas par mégarde', true, /className="mc-rdvcard__acts" onClick=\{\(e\) => e\.stopPropagation\(\)\}/.test(liste));
dit('la fiche : calendrier, déplacer, annuler ; passée : refaire, bilan', [true, true, true, true, true], [
  /onClick=\{\(\) => addToCalendar\(a\)\}>\{t\('Calendrier'\)\}/.test(liste),
  /onClick=\{\(\) => openEdit\(a\)\}>\{t\('Déplacer'\)\}/.test(liste),
  /onClick=\{\(\) => setCancelling\(a\)\}>\{t\('Annuler'\)\}/.test(liste),
  /onClick=\{\(\) => onRefaire\(a\)\}>\{t\('Refaire ce rituel'\)\}/.test(liste),
  /onClick=\{\(\) => setBilanOuvert\(bilan\)\}/.test(liste),
]);
dit('notifications : le rappel et chaque réservation ouvrent leur fiche', [true, true],
  [/onClick=\{\(\) => onOpenRdv\(next\.id\)\}>\{t\('Voir mon rendez-vous'\)\}/.test(tabs), /onClick=\{\(\) => onOpenRdv\(a\.id\)\}>\{t\('Voir mon rendez-vous'\)\}/.test(tabs)]);
dit('après la réservation : « Voir mon rendez-vous »', true, /onClick=\{\(\) => onVoirRdv\(rdvCree\)\}/.test(resa) && /setRdvCree\(newAppts\[0\]\?\.id \?\? null\)/.test(resa));
dit('les notifications du téléphone portent le lien de LA fiche', [true, 2],
  [/#\/rdv\/\$\{newAppts\[0\]\?\.id \?\? ''\}/.test(resa), (liste.match(/#\/rdv\/\$\{a\.id\}/g) ?? []).length]);
dit('… et l\'app ouvre ce lien, à l\'ouverture comme en route', [true, true],
  [/\/\^#\\\/rdv\\\/\(\[A-Za-z0-9_-\]\+\)\$\/\.exec\(window\.location\.hash\)/.test(app), /window\.addEventListener\('hashchange', lis\)/.test(app)]);
dit('l\'app passe la fiche désignée à « Mes rendez-vous »', true, /ouvrir=\{rdv\.ouvrir\}/.test(app));

/* ── 2. AUCUN NOM DE MAÎTRE LU PAR LA CLIENTE ─────────────────────────── */
const couronne = ['App.tsx', 'Booking.tsx', 'Compose.tsx', 'Cycle.tsx', 'MaCarte.tsx', 'MaFormule.tsx', 'MesRendezVous.tsx', 'Onboarding.tsx', 'Tabs.tsx', 'AchatFormule.tsx']
  .map((f) => [f, lis(`${D}${f}`)] as const);
dit('aucune phrase de Ma Couronne ne nomme le maître', [],
  couronne.flatMap(([f, src]) => (src.match(/t\('[^']*\{maitre\}[^']*'/g) ?? []).map((m) => `${f}: ${m}`)));

/* ── 3. UNE TOUCHE NE RÉSERVE JAMAIS À L'AVEUGLE ─────────────────────── */
const effet = /const expressFait = useRef\(false\);[\s\S]*?\n {2}\}, \[/.exec(resa)?.[0] ?? '';
dit('« Réserver ce moment » demande la touche qui réserve', true, /time: predite\.template!\.time, express: true/.test(tabs));
dit('la touche attend les murs du serveur et les horaires', true, /if \(!occupesCharges \|\| !horairesDescendus\(\) \|\| selected\.length === 0\) return;/.test(effet));
dit('… s\'efface devant un acompte ou une série', true, /if \(totalSessions > 1 \|\| hasDeposit\) \{ expressFait\.current = true; return; \}/.test(effet));
dit('… ne réserve que le moment voulu, encore libre, une seule fois', true,
  /if \(pose && dayTimes\.includes\(voulu\)\) \{\s*expressFait\.current = true;\s*settle\(\);/.test(effet));
dit('l\'heure habituelle ne se pose qu\'une fois les murs connus', true, /if \(!occupesCharges\) return;/.test(resa));
dit('les murs disent quand ils sont connus, et une erreur ne vaut pas « libre »', [true, true], [
  /setEtat\(\{ occupes: \(data \?\? \[\]\) as CreneauOccupe\[\], charge: true, cle \}\)/.test(lib),
  /if \(error\) \{ setEtat\(\{ occupes: \[\], charge: false, cle \}\); return; \}/.test(lib),
]);

/* ── 4. LE PREMIER ÉCRAN DES TRENTE SECONDES ─────────────────────────── */
dit('la réservation s\'ouvre sur l\'écran express', true, /useState\(prefService \? 3 : EXPRESS\)/.test(resa));
dit('… sa dernière venue, les formules de la Maison, les six places', [true, true, true], [
  /a\.clientId === cible\.id && a\.status === 'honoré'/.test(resa),
  /cfg\.formulesRapides \?\? \[\]/.test(resa),
  /prochainesPlaces\(jours, 6\)/.test(resa),
]);
dit('… les places attendent les murs, et « Un autre jour » ouvre le calendrier', [true, true],
  [/if \(vue !== EXPRESS \|\| !selected\.length \|\| totalSessions > 1 \|\| !occupesCharges\) return \[\];/.test(resa), /onClick=\{unAutreJour\}>\{t\('Un autre jour'\)\}/.test(resa)]);
dit('… la place touchée se relit avant de réserver', true,
  /if \(!placesExpress\.some\(\(p\) => p\.iso === placeExpress\.iso && p\.place\.heure === placeExpress\.heure\)\) \{/.test(resa));
dit('… « Composer moi-même » rouvre le chemin d\'avant', true, /setStep\(quizActif \? QUIZ : 0\);/.test(resa));
dit('… sans venue ni formule, l\'écran ne s\'ouvre pas', true, /const vue = step === EXPRESS\s*\? \(expressDispo \? EXPRESS : quizActif \? QUIZ : 0\)/.test(resa));
const places = prochainesPlaces([
  { iso: '2026-10-14', heures: [{ heure: '09:00' }, { heure: '10:00' }, { heure: '14:30' }, { heure: '16:00' }] },
  { iso: '2026-10-15', heures: [{ heure: '09:30' }, { heure: '15:00' }] },
  { iso: '2026-10-16', heures: [{ heure: '10:00' }] },
], 6).map((p) => `${p.iso.slice(8)} ${p.place.heure}`);
dit('six places, deux par jour d\'abord, puis on complète', ['14 09:00', '14 10:00', '14 14:30', '15 09:30', '15 15:00', '16 10:00'], places);

console.log(ko === 0 ? '\nLe rendez-vous s\'ouvre partout.' : `\n${ko} controle(s) en echec.`);
process.exit(ko === 0 ? 0 : 1);
