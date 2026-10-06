/* LE BILAN DE LA SÉANCE — le harnais. 4 octobre 2026.

   Ce qu'il tient, et qui ne doit jamais casser en silence :
   1. LE MINIMUM PART À L'ASSISTANT : civilité + prénom + cheveux. Jamais le
      téléphone, jamais le courriel, jamais le nom de famille ; un numéro
      glissé dans une note libre est retiré.
   2. CE QUI REVIENT EST RELU : une prestation hors catalogue, un ingrédient
      hors des sept tombent ; les Quatre Temps sortent au complet et dans
      l'ordre ; les jauges restent de 1 à 5 ; le tiret long devient virgule.
   3. CE QUI DEMANDE UN JUGEMENT EST SIGNALÉ : prix, « salon », tutoiement.
   4. LA NOTE NE VIT PAS DANS LE RENDEZ-VOUS (la cliente le lit) : sa table
      est réservée au personnel.
   5. LA FONCTION EDGE garde la porte (personnel seul), contraint le modèle à
      la liste des prestations, et porte les règles de la Maison.
   6. MA COURONNE s'ouvre sur l'essentiel, et la signature notifie. */
import { readFileSync } from 'node:fs';
import {
  alertesDuTexte, brouillonDeLaMain, brouillonRelu, contexteDuBilan, sansCoordonnees, signesRetenus,
} from '../src/shared/bilan-assistant-pur';
import { pourQuiDuBilan } from '../src/shared/bilan-document';
import { RITUEL_SEED } from '../src/shared/bilans';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : `\n       attendu ${JSON.stringify(attendu)}\n       obtenu  ${JSON.stringify(obtenu)}`}`);
};
const sansCommentaires = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* ── 1. LE MINIMUM ─────────────────────────────────────────────────── */
const ficheEntiere = {
  name: 'Awa Kossou Dossou', phone: '+229 01 97 00 00 00', email: 'awa@exemple.bj', city: 'Cotonou',
  civilite: 'madame' as const, crownStyle: 'Microlocks', longueur: 'mi-long', lockCount: 320,
  crownSince: '2023-05-14', notes: 'Cuir chevelu sensible. Rappeler au 0197000000.',
};
const note = {
  nature: 'afro' as const, vu: ['Sécheresse'], metisse: ['Frisottis'],
  attendu: 'Racines sèches. Sa sœur au 01 96 11 22 33 viendra aussi, écrire à soeur@mail.com', retenir: 'Moins laver.',
};
const ctx = contexteDuBilan({
  fiche: ficheEntiere,
  note,
  seance: { date: '4 octobre 2026', prestations: ['SÍNSIN™ Essentiel'], praticien: 'Brice' },
  bilansPasses: [],
});
const brut = JSON.stringify(ctx);
dit('l appel est sa civilite et son prenom', 'Madame Awa', ctx.appel);
dit('ni telephone, ni courriel, ni ville, ni nom de famille ne partent', [false, false, false, false, false],
  [brut.includes('97 00 00'), brut.includes('awa@exemple'), brut.includes('Cotonou'), brut.includes('Dossou'), brut.includes('Kossou')]);
dit('un numero ou une adresse glisses dans une note libre sont retires', [false, false, false],
  [brut.includes('96 11 22 33'), brut.includes('soeur@mail.com'), brut.includes('0197000000')]);
dit('les cles qui partent sont celles du contexte, rien d autre', ['appel', 'attendu', 'bilansPasses', 'cheveu', 'retenir', 'seance', 'vu'], Object.keys(ctx).sort());
dit('un monsieur est appele Monsieur', 'Monsieur Koffi', contexteDuBilan({ fiche: { name: 'Koffi A.', auMasculin: true }, note, seance: ctx.seance, bilansPasses: [] }).appel);
dit('les cases metissees ne partent que sur un cheveu metisse', [['Sécheresse'], ['Sécheresse', 'Frisottis']],
  [signesRetenus(note), signesRetenus({ ...note, nature: 'metisse' })]);
dit('sansCoordonnees garde une phrase sans numero', 'Revenir dans 6 semaines.', sansCoordonnees('Revenir dans 6 semaines.'));

/* ── 2. CE QUI REVIENT EST RELU ─────────────────────────────────────── */
const listes = {
  prestations: [{ id: 'svc-sinsin', nom: 'SÍNSIN™ Essentiel' }, { id: 'svc-dandan', nom: 'DÀNDÀN™ Soin hydratant' }],
  ingredients: ['aloes', 'hibiscus', 'baobab', 'karite', 'neem', 'moringa', 'avocat'],
  rituelDefaut: RITUEL_SEED,
};
const relu = brouillonRelu({
  diagnostic: 'Madame Awa — vos racines sont sèches.',
  propositions: [
    { serviceId: 'svc-dandan', quand: 'à votre prochaine venue' },
    { serviceId: 'svc-invente', quand: 'demain' },
    { serviceId: 'svc-dandan', quand: 'en double' },
    { serviceId: 'svc-sinsin', quand: 'dans six semaines' },
  ],
  rituel: [
    { nom: 'Nourrir', cadence: '2 fois par semaine', texte: 'Brume aloès.', ingredients: ['aloes', 'cannabis'] },
    { nom: 'Purifier', cadence: 'tous les 10 jours', texte: 'Lavage doux.', ingredients: ['neem'] },
  ],
  jauges: [{ nom: 'Racines', valeur: 9, note: 'reprises' }, { nom: 'Cuir chevelu', valeur: 0, note: 'apaisé' }],
  points: ['Un', 'Deux', 'Trois', 'Quatre'],
}, listes);
dit('une prestation hors catalogue tombe, un doublon aussi', ['svc-dandan', 'svc-sinsin'], relu.propositions.map((p) => p.serviceId));
dit('le nom d une proposition vient du catalogue, pas du modele', 'DÀNDÀN™ Soin hydratant', relu.propositions[0].nom);
dit('les Quatre Temps sortent au complet et dans l ordre', ['Purifier', 'Nourrir', 'Sceller', 'Couronner'], relu.rituel.map((t) => t.nom));
dit('un temps absent reprend la voix de la Maison', RITUEL_SEED[2].texte, relu.rituel[2].texte);
dit('un ingredient hors des sept tombe', ['aloes'], relu.rituel[1].ingredients);
dit('les jauges restent de 1 a 5, une absente vaut 3', [1, 5, 3, 3], relu.jauges.map((j) => j.valeur));
dit('le tiret long devient une virgule', 'Madame Awa, vos racines sont sèches.', relu.diagnostic);
dit('trois points au plus', 3, relu.points.length);
dit('un brouillon illisible ne casse rien', 4, brouillonRelu(null, listes).rituel.length);

/* ── 3. CE QUI DEMANDE UN JUGEMENT ──────────────────────────────────── */
dit('un prix est signale', 1, alertesDuTexte('Le soin coûte 15 000 F.').length);
dit('le mot salon est signale', 1, alertesDuTexte('Revenez au salon.').length);
dit('le tutoiement est signale', 1, alertesDuTexte('Prends soin de ta nuque.').length);
dit('une phrase de la Maison passe sans alerte', [], alertesDuTexte('Madame Awa, revenez dans six semaines, deux fois par semaine une brume.'));

/* ── 4. LE PAPIER ───────────────────────────────────────────────────── */
dit('le papier porte la civilite, le prenom et l initiale, jamais le nom entier', 'Madame Awa D.', pourQuiDuBilan({ name: 'Awa Kossou Dossou' }));
const pdf = sansCommentaires('src/shared/pdf.ts');
const constructeur = pdf.slice(pdf.indexOf('async function construitLeBilan'), pdf.indexOf('export async function bilanEnPiece'));
dit('le PDF porte le verrou couche et la devise en pied', [true, true],
  [/poseLeVerrou\(doc, M, 12, 46\)/.test(constructeur), /pieDeLaMaison\(doc/.test(constructeur)]);
dit('le PDF ne dit jamais « assistant »', false, /assistant/i.test(constructeur));

/* ── 5. LA NOTE NE VIT PAS DANS LE RENDEZ-VOUS ──────────────────────── */
const section = sansCommentaires('src/apps/trone/routes/clients/LeBilanDeLaSeance.tsx');
dit('la section ecrit la note dans sa table, jamais dans le rendez-vous', [true, false],
  [/ecritLaNote\(/.test(section), /appointmentsStore|apptsStore|updateAppt/.test(section)]);
const bilans = sansCommentaires('src/shared/bilans.ts');
dit('la note se lie a la table notes_de_seance', true, /bindCollection\(notesDeSeanceStore, 'notes_de_seance'\)/.test(bilans));
const migration = readFileSync('supabase/migrations/0115_les_notes_de_seance.sql', 'utf8').replace(/--.*$/gm, '');
dit('la table est protegee et reservee au personnel, sans porte pour la cliente', [true, true, false],
  [/enable row level security/.test(migration), /using \(public\.is_staff\(\)\) with check \(public\.is_staff\(\)\)/.test(migration), /auth\.uid\(\)/.test(migration)]);

/* ── 6. LA FONCTION EDGE ────────────────────────────────────────────── */
const fn = sansCommentaires('supabase/functions/bilan-redige/index.ts');
dit('la fonction est reservee au personnel (connecte ET dans staff)', [true, true, true],
  [/if \(!uid\) return json\(\{ error: 'forbidden' \}, 403\);/.test(fn),
    /from\('staff'\)\.select\('user_id'\)\.eq\('user_id', uid\)/.test(fn),
    /if \(!staffRow\) return json\(\{ error: 'forbidden' \}, 403\);/.test(fn)]);
dit('le modele est contraint aux prestations de la Maison', true, /serviceId: \{ type: 'string', enum: ids \}/.test(fn));
dit('le contexte est filtre par une liste blanche sans telephone', [true, false],
  [/const CLES = \['appel', 'seance', 'cheveu', 'vu', 'attendu', 'retenir', 'bilansPasses'\]/.test(fn), /phone|telephone|email/i.test(fn)]);
dit('les regles de la Maison sont dites au modele', [true, true, true, true, true],
  [/dermatologue/.test(fn), /« salon »/.test(fn), /JAMAIS de prix/.test(fn), /tiret long/.test(fn), /vouvoyant/.test(fn)]);
/* 5 octobre 2026 : « l'assistant est injoignable », sans cause. La panne se
   dit, et un modèle inconnu du compte cède la place au suivant. */
dit('la fonction rend la cause de la panne au personnel', true, /return json\(\{ error: 'upstream', detail: derniere \}, 502\)/.test(fn));
dit('un modele inconnu du compte cede la place au suivant', true,
  /for \(const modele of MODELES\)/.test(fn) && /if \(status === 404 \|\| \(status === 400 && \/model\/i\.test\(derniere\)\)\) continue;/.test(fn));
const pont = sansCommentaires('src/shared/bilan-assistant.ts');
dit('le Trone dit la cause que la fonction donne', true, /return `Le bilan n’a pas pu être rédigé : \$\{detail\}`;/.test(pont));
dit('le modele ne parle que des sept ingredients (enum des slugs)', true, /ingredients: \{ type: 'array', items: \{ type: 'string', enum: slugs \} \}/.test(fn));

/* ── 6 bis. ÉCRIRE SOI-MÊME, SANS CRÉDIT — 5 octobre 2026 ─────────────
   « Mes bilans partaient avant sans crédit Anthropic. » Le chemin à la main
   part de la note et n'appelle jamais l'assistant. */
const main = brouillonDeLaMain(
  { nature: 'metisse', vu: ['Sécheresse'], metisse: ['Frisottis'], attendu: 'Racines sèches — elle lave trop.', retenir: 'Moins laver.' },
  { jauges: [{ nom: 'Racines', valeur: 2, note: 'sèches' }], rituel: RITUEL_SEED },
);
dit('a la main : la note devient le constat, ce qu elle retient devient le resume', ['Racines sèches, elle lave trop.', 'Moins laver.'], [main.diagnostic, main.resume]);
dit('a la main : ce que le maitre a vu ouvre les points', ['Vu à la séance : sécheresse, frisottis.'], main.points);
dit('a la main : les jauges du bilan precedent, les Quatre Temps au complet', [[2], ['Purifier', 'Nourrir', 'Sceller', 'Couronner']],
  [main.jauges.map((j) => j.valeur), main.rituel.map((t) => t.nom)]);
const ecrire = section.slice(section.indexOf('const ecrireMoiMeme = () =>'), section.indexOf('const resumeDeLaLigne'));
dit('ecrire soi-meme n appelle jamais l assistant', [true, false], [/brouillonDeLaMain\(/.test(ecrire), /demande\(|redigeLeBilan/.test(ecrire)]);
dit('la fiche a la main ne dit pas « propose par l assistant » et ne propose pas de le rappeler', [true, true],
  [/useState\(!!brouillon && !parLaMain\)/.test(sansCommentaires('src/apps/trone/routes/clients/BilanModal.tsx')), /surRedemande=\{parLaMain \? undefined :/.test(section)]);

/* ── 7. LA SIGNATURE ET MA COURONNE ─────────────────────────────────── */
const modale = sansCommentaires('src/apps/trone/routes/clients/BilanModal.tsx');
dit('la fiche dit « a relire » et se signe', [true, true],
  [modale.includes('Proposé par l’assistant · à relire'), modale.includes('Signer et remettre')]);
const signer = modale.slice(modale.indexOf('const signer = () =>'), modale.indexOf('const pdf = async'));
dit('signer remet au registre ET notifie Ma Couronne', [true, true], [/remettreBilan\(/.test(signer), /annonceLeBilan\(b, client\)/.test(signer)]);
dit('un bilan non signe ne part pas sur WhatsApp', true, /if \(!remis \|\| occupe\) return;/.test(modale.slice(modale.indexOf('const whatsapp = async'))));
const tabs = sansCommentaires('src/apps/couronne/Tabs.tsx');
dit('Ma Couronne ouvre le bilan sur le resume, l entier a un geste', [true, true],
  [/const \[entier, setEntier\] = useState\(!bilan\.resume\)/.test(tabs), /t\('Voir le bilan entier'\)/.test(tabs)]);
dit('chaque proposition se reserve', true, /onReserver\(p\.serviceId\)/.test(tabs));
dit('la cloche compte les bilans recents', true, /bilans\.filter\(\(b\) => !d\.has\(`bilan-\$\{b\.id\}`\)\)\.length/.test(tabs));
dit('Ma Couronne ne dit jamais « assistant »', false, /assistant/i.test(tabs));

console.log(ko === 0 ? '\nLe bilan de la seance tient ses regles.' : `\n${ko} controle(s) en echec.`);
process.exit(ko === 0 ? 0 : 1);
