/* ENTRE DEUX SÉANCES, ÉPROUVÉ — 15 octobre 2026.

   « Créer un système de suivi entre deux rendez-vous pour adresser les
   problèmes qu'un client peut avoir jusqu'à son prochain rendez-vous sur ses
   cheveux (cheveux secs, cheveux cassants, locks inégales) » (Yéman).
   Maquette EfhgzxjA…, choix donnés au sélecteur : deux points d'étape (une
   semaine après la séance, une semaine avant la suivante), la maîtresse de
   la dernière séance répond, Santé sous 24 h et À voir sous 48 h, la photo
   facultative, la Maison propose d'avancer, les réponses en brouillons que
   la direction valide ; Ma Couronne, et WhatsApp pour celles sans l'app.

   Les attentes sont écrites ici à la main, depuis ces choix. */
import { readFileSync } from 'node:fs';
import {
  ACCUSE, ACCUSE_SANTE, DELAI_HEURES, SOUCIS, depuisLaDerniereSeance, echeanceDe, enRetard, fileRangee, niveauDe,
  pointDuJour, pointsDEtape, proposeDAvancer, reponseAuSignalement, soucisDuTexte, surWhatsApp, type Signalement,
} from '../src/shared/entre-deux-pur';
import { EN } from '../src/apps/couronne/i18n/en';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : `\n       attendu ${JSON.stringify(attendu)}\n       obtenu  ${JSON.stringify(obtenu)}`}`);
};
const lis = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* ── 1. LES SOUCIS ET LEURS NIVEAUX ── */
const niveau = (c: string) => SOUCIS.find((s) => s.cle === c)?.niveau;
dit('ses trois exemples : seches = conseil, cassantes = a voir, inegales = a voir', ['conseil', 'voir', 'voir'], [niveau('seches'), niveau('cassantes'), niveau('inegales')]);
dit('ca gratte et la chute sont des soucis de sante', ['sante', 'sante'], [niveau('gratte'), niveau('chute')]);
dit('un signalement prend le niveau du plus grave de ses soucis', ['conseil', 'voir', 'sante'], [niveauDe(['seches', 'pousse']), niveauDe(['seches', 'cassantes']), niveauDe(['seches', 'gratte'])]);
dit('les delais : sante 24 h, a voir 48 h', [24, 48], [DELAI_HEURES.sante, DELAI_HEURES.voir]);
dit('... une sante est en retard a 25 h, un a-voir pas a 47 h', [true, false],
  [enRetard({ etat: 'ouvert', soucis: ['gratte'], quand: '2026-10-15T08:00:00.000Z' }, '2026-10-16T09:00:00.000Z'),
    enRetard({ etat: 'ouvert', soucis: ['cassantes'], quand: '2026-10-15T08:00:00.000Z' }, '2026-10-17T07:00:00.000Z')]);
dit('... un souci traite n est jamais en retard', false, enRetard({ etat: 'traite', soucis: ['gratte'], quand: '2026-10-01T08:00:00.000Z' }, '2026-10-15T08:00:00.000Z'));
dit('l echeance d une sante, 24 h apres', '2026-10-16T08:00:00.000Z', echeanceDe('sante', '2026-10-15T08:00:00.000Z'));

/* ── 2. CE QUE LA CLIENTE REÇOIT ── */
const valides = { seches: 'Nourrir : deux fois par semaine.', gratte: 'un conseil qu on ne doit jamais envoyer' };
dit('en sante, JAMAIS un conseil, meme valide, meme melange a un autre souci', [[ACCUSE_SANTE], [ACCUSE_SANTE]],
  [reponseAuSignalement(['gratte'], valides), reponseAuSignalement(['seches', 'gratte'], valides)]);
dit('une reponse non validee ne part pas : un accuse seulement', [ACCUSE], reponseAuSignalement(['cassantes'], valides));
dit('une reponse validee part telle quelle', ['Nourrir : deux fois par semaine.'], reponseAuSignalement(['seches'], valides));
dit('la Maison propose d avancer pour cassantes, inegales, pousse ; pas pour seches', [true, true, true, false],
  [proposeDAvancer(['cassantes']), proposeDAvancer(['inegales']), proposeDAvancer(['pousse']), proposeDAvancer(['seches'])]);

/* ── 3. LES POINTS D'ÉTAPE ── */
const seances = [
  { id: 'a1', date: '2026-10-06', status: 'honoré' },
  { id: 'a2', date: '2026-11-17', status: 'confirmé' },
];
dit('une semaine apres la seance, une semaine avant la suivante', [['apres', '2026-10-13'], ['avant', '2026-11-10']],
  pointsDEtape(seances, '2026-10-10').map((p) => [p.type, p.date]));
dit('deux seances a moins de 14 jours : pas de point avant', ['apres'],
  pointsDEtape([{ id: 'a1', date: '2026-10-06', status: 'honoré' }, { id: 'a2', date: '2026-10-15', status: 'confirmé' }], '2026-10-08').map((p) => p.type));
dit('le point du jour arrive le jour dit, pas avant', [undefined, 'pe-a1-apres'],
  [pointDuJour(seances, '2026-10-12', new Set())?.cle, pointDuJour(seances, '2026-10-13', new Set())?.cle]);
dit('... une fois repondu, il ne revient pas ; une semaine plus tard, il s efface', [undefined, undefined],
  [pointDuJour(seances, '2026-10-14', new Set(['pe-a1-apres']))?.cle, pointDuJour(seances, '2026-10-20', new Set())?.cle]);
dit('... et le point d avant vient a son tour', 'pe-a2-avant', pointDuJour(seances, '2026-11-11', new Set(['pe-a1-apres']))?.cle);
dit('une seance annulee ne compte pas', [], pointsDEtape([{ id: 'x', date: '2026-10-06', status: 'annulé' }], '2026-10-13'));

/* ── 4. LA FILE DU TRÔNE ── */
const s = (id: string, soucis: string[], quand: string, x: Partial<Signalement> = {}): Signalement =>
  ({ id, branchId: 'b', clientId: 'c', soucis: soucis as Signalement['soucis'], canal: 'couronne', quand, etat: 'ouvert', ...x });
const file = fileRangee([
  s('conseil', ['seches'], '2026-10-15T07:00:00Z'), s('voir', ['cassantes'], '2026-10-15T08:00:00Z'),
  s('sante', ['gratte'], '2026-10-15T09:00:00Z'), s('bien', [], '2026-10-15T06:00:00Z', { bien: true, etat: 'traite' }),
  s('traite', ['chute'], '2026-10-14T09:00:00Z', { etat: 'traite' }),
]);
dit('sante d abord, puis a voir, puis conseil ; ni « tout va bien » ni traite', ['sante', 'voir', 'conseil'], file.map((x) => x.id));
dit('depuis la derniere seance : sa cliente, entre les deux dates', ['b'],
  depuisLaDerniereSeance([s('a', [], '2026-10-06T10:00:00Z'), s('b', [], '2026-10-12T10:00:00Z'), { ...s('c', [], '2026-10-12T10:00:00Z'), clientId: 'autre' }, s('d', [], '2026-11-18T10:00:00Z')], 'c', '2026-10-06', '2026-11-17').map((x) => x.id));

/* ── 5. WHATSAPP : SES MOTS, ET QUI LE REÇOIT ── */
dit('ses mots se reconnaissent', [['seches'], ['gratte'], ['cassantes'], ['inegales']],
  [soucisDuTexte('Mes locks sont très sèches'), soucisDuTexte('Ça me gratte beaucoup'), soucisDuTexte('elles cassent au bout'), soucisDuTexte('les racines sont inégales')]);
dit('... sans faux ami : « une seconde fois » n est pas « sec »', [], soucisDuTexte('je reviens une seconde fois'));
dit('WhatsApp pour celles sans l app, Ma Couronne pour les autres', [true, false], [surWhatsApp({}), surWhatsApp({ authUserId: 'u1' })]);

/* ── 6. LA BASE (0132) ── */
const sql = lis('supabase/migrations/0132_entre_deux_seances.sql').replace(/--.*$/gm, '');
dit('la cliente lit les siens et ceux de son foyer, le personnel tout', true,
  /create policy sig_lire on public\.signalements for select to authenticated\s+using \(public\.is_staff\(\) or public\.est_ma_tete\(data->>'clientId'\)\)/.test(sql));
dit('elle depose sa ligne, ouverte, depuis Ma Couronne, sans jamais la marquer traitee', [true, true, true, true],
  [sql.includes("and public.est_ma_tete(d->>'clientId')"), sql.includes("and coalesce(d->>'canal', '') = 'couronne'"),
    sql.includes("(coalesce(d->>'etat', '') = 'ouvert' or coalesce(d->'bien', 'false'::jsonb) = 'true'::jsonb)"), sql.includes("and d->>'traiteLe' is null and d->>'traitePar' is null")]);
dit('seul le personnel traite ou efface', true,
  /create policy sig_traiter on public\.signalements for update to authenticated\s+using \(public\.is_staff\(\)\) with check \(public\.is_staff\(\)\)/.test(sql)
  && /create policy sig_retirer on public\.signalements for delete to authenticated\s+using \(public\.is_staff\(\)\)/.test(sql));
dit('les reponses se lisent par tous, s ecrivent par la direction seule', [true, true, true],
  [sql.includes('create policy rep_lire on public.entre_deux_reponses for select to anon, authenticated using (true);'),
    sql.includes('create policy rep_ecrire on public.entre_deux_reponses for insert to authenticated with check (public.is_souverain());'),
    /create policy rep_valider on public\.entre_deux_reponses for update to authenticated\s+using \(public\.is_souverain\(\)\) with check \(public\.is_souverain\(\)\)/.test(sql)]);
dit('la photo : compartiment prive, elle et le personnel seulement', [true, true],
  [sql.includes("values ('entre-deux', 'entre-deux', false,"), sql.includes("using (bucket_id = 'entre-deux' and (public.is_staff() or public.est_ma_tete((storage.foldername(name))[1])));")]);

/* ── 7. MA COURONNE ── */
const couronne = sansCommentaires(lis('src/shared/entre-deux-couronne.ts'));
dit('Ma Couronne depose et relit, ne reecrit jamais', [true, false, false], [couronne.includes('.from(TABLE_DES_SIGNALEMENTS).insert({'), /\.upsert\(|\.update\(/.test(couronne), couronne.includes('bindCollection')]);
dit('la reponse recue est celle de la regle (validee, ou accuse, jamais un conseil en sante)', true, couronne.includes('reponseAuSignalement(o.soucis, o.validees)'));
const carte = sansCommentaires(lis('src/apps/couronne/EntreDeux.tsx'));
dit('la carte suit les points d etape et propose d avancer', [true, true], [carte.includes('pointDuJour(seances, aujourdhui(), repondus)'), carte.includes('setAvancer(!bien && proposeDAvancer(pris))')]);
dit('elle est dans l onglet Suivi', true, lis('src/apps/couronne/Tabs.tsx').includes('{client && <EntreDeux client={client} appts={clientAppts} onAvancer={() => onOpenBooking({ pourId: regard?.id })} />}'));
dit('chaque souci se dit aussi en anglais', [], SOUCIS.map((x) => x.dit).filter((d) => !EN[d]));
dit('... et les deux accuses', [true, true], [!!EN[ACCUSE], !!EN[ACCUSE_SANTE]]);

/* ── 8. LE TRÔNE ── */
const routes = lis('src/apps/trone/routes/index.tsx');
dit('la rubrique est dans la Clientele, et nee apres les departements', [true, true],
  [routes.includes("{ path: '/entre-deux', label: 'Entre deux séances', icon: HeartPulse, Component: lazy(() => import('./clients/EntreDeuxSeances')) },"), /ECRANS_NES_APRES_LES_DEPARTEMENTS[^;]*'\/entre-deux'/.test(routes)]);
const ecran = sansCommentaires(lis('src/apps/trone/routes/clients/EntreDeuxSeances.tsx'));
dit('seule la direction valide une reponse', true, ecran.includes("<LesReponses souverain={me?.role === 'souverain'}") && ecran.includes('{souverain ? (') && ecran.includes("Seule la direction valide une réponse."));
dit('un brouillon garde ne remplace pas la reponse validee', true, ecran.includes(': r?.texteValide ? { texteValide: r.texteValide, valideeLe: r.valideeLe, validePar: r.validePar } : {}),'));
dit('en sante, l ecran ne propose aucun texte a valider', true, ecran.includes('{sante\n        ? <p className="sad-doux"'));
dit('les messages de l ecran appellent par la civilite (appelDe)', [true, false], [ecran.includes('const appel = client ? appelDe(client) :'), /Bonjour \$\{prenom\}/.test(ecran)]);
dit('le bilan s ouvre sur « Depuis la derniere seance »', true, lis('src/apps/trone/routes/clients/LeBilanDeLaSeance.tsx').includes('<DepuisLaDerniereSeance appt={appt} />'));
dit('le tableau de bord alerte sur la sante et le retard', true, lis('src/apps/trone/routes/pilotage/Dashboard.tsx').includes("go: () => navigate('/entre-deux'),"));

console.log(ko ? `\n${ko} ECHEC.` : '\nEntre deux seances tient ses promesses.');
if (ko) process.exitCode = 1;
