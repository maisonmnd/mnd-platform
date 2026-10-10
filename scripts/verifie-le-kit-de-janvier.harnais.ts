/* LE KIT DE JANVIER, ÉPROUVÉ — 11 octobre 2026 (la genèse des prix, 0127).

   La RÈGLE : Ma Couronne et le serveur tiennent les règles du comptoir ; deux
   fois dès 100 000 F, trois fois dès 200 000 F, mais seulement une fois que
   le serveur le sait ; une formule fermée ne se souscrit pas, sauf la reprise
   unique d'après la bascule ; une fois par tête ; Les Premières Lunes après
   une création ; un paquet épuisé ne bloque plus ; la remise famille lit le
   compte des têtes donné par le serveur, la règle des mineurs sinon ; la
   liste blanche des documents ne perd aucune clé.
   Le SQL ne s'exécute pas ici : ses règles se lisent dans son texte.
   Attendus écrits à la main. `node scripts/verifie-le-kit-de-janvier.mjs` ;
   `--prouve` remet chaque faute une à une et exige que le banc crie. */
import { readFileSync } from 'node:fs';
import { decoupesEnLigne } from '../src/shared/echeancier';
import { remiseFamillePourTetes, type Family } from '../src/shared/clients';

let ko = 0;
const ascii = (s: string) => s.replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(ascii(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)}`));
  if (!ok) console.log(ascii(`       attendu ${JSON.stringify(attendu)}`));
};

/* ── 1. Les decoupes en ligne ── */
dit('avant le signal : deux fois au-dessus de 100 000, jamais trois', [[1], [1, 2], [1, 2]],
  [decoupesEnLigne(100000, {}), decoupesEnLigne(100001, {}), decoupesEnLigne(250000, {})]);
const signal = { seuilTroisFoisXof: 200000 };
dit('apres le signal : deux fois des 100 000, trois fois des 200 000', [[1], [1, 2], [1, 2], [1, 2, 3]],
  [decoupesEnLigne(99999, signal), decoupesEnLigne(100000, signal), decoupesEnLigne(199999, signal), decoupesEnLigne(200000, signal)]);
dit('trois fois jamais sous le seuil des deux fois', [[1], [1, 2, 3]],
  [decoupesEnLigne(140000, { seuilDeuxFoisXof: 150000, seuilTroisFoisXof: 120000 }), decoupesEnLigne(150000, { seuilDeuxFoisXof: 150000, seuilTroisFoisXof: 120000 })]);

/* ── 2. La remise famille par le compte du serveur ── */
const foyer = { id: 'f1' } as Family;
dit('une tete 0 %, deux 10 %, trois et plus 15 %', [0, 10, 15, 15], [1, 2, 3, 5].map((n) => remiseFamillePourTetes(foyer, n)));
dit('un taux pose sur le compte l emporte ; sans compte, rien', [12, 0], [remiseFamillePourTetes({ id: 'f2', remisePct: 12 } as Family, 3), remiseFamillePourTetes(undefined, 3)]);

/* ── 3. Le SQL ── */
const sql = readFileSync('supabase/migrations/0127_la_bascule_de_janvier.sql', 'utf8').replace(/--[^\n]*/g, '');
const souscrire = sql.slice(sql.indexOf('create or replace function public.souscrire_a_une_formule'), sql.indexOf('$$;', sql.indexOf('create or replace function public.souscrire_a_une_formule')));
dit('en 1, 2 ou 3 fois, des les seuils (et non au-dessus)', [true, true, true, false], [
  /if p_parts not in \(1, 2, 3\) then/.test(souscrire),
  /if p_parts = 2 and v_prix < v_seuil2 then/.test(souscrire),
  /if p_parts = 3 and v_prix < v_seuil3 then/.test(souscrire),
  /v_prix <= v_seuil/.test(souscrire),
]);
dit('trois echeances : aujourd hui, a trente et a soixante jours', true, /'numero', 3, 'dueIso', to_char\(v_today \+ 60/.test(souscrire));
dit('une formule fermee refusee, sauf la reprise unique d apres la bascule', [true, true, true], [
  /if coalesce\(\(v_plan\.data->>'fermee'\)::boolean, false\) then/.test(souscrire) && /return jsonb_build_object\('erreur', 'formule_fermee'\)/.test(souscrire),
  /coalesce\(\(v_plan\.data->>'fermeeParLaBascule'\)::boolean, false\)/.test(souscrire),
  /< '2027-01-01'\)[\s\S]*?>= '2027-01-01'\)/.test(souscrire),
]);
dit('une fois par tete, variante comprise ; Les Premieres Lunes apres une creation de 30 jours', [true, true], [
  /p\.data->>'uneFoisParTete' = v_une[\s\S]*?'deja_prise'/.test(souscrire),
  /v_une = 'premieres-lunes'[\s\S]*?v_today - 30[\s\S]*?'atl-i-vekpe'[\s\S]*?'apres_une_creation'/.test(souscrire),
]);
dit('un paquet epuise ou echu ne bloque plus', true,
  /not in \('churn', 'exhausted'\)[\s\S]*?expiresIso[\s\S]*?< v_today[\s\S]*?'deja_abonnee'/.test(souscrire));
dit('le prix se relit dans la grille, jamais recu', [true, false], [
  /v_plan\.data->'prixParCalibre'->>p_band_id/.test(souscrire), /p_prix|p_montant/.test(souscrire),
]);
dit('la souscription : publique fermee, connectees ouvertes', true,
  /revoke all on function public\.souscrire_a_une_formule\(text, int, text, text\) from public;\s*grant execute on function public\.souscrire_a_une_formule\(text, int, text, text\) to authenticated;/.test(sql));
const cles = (texte: string) => [...(texte.match(/create policy docs_pub_read[\s\S]*?\]\)\);/)?.[0] ?? '').matchAll(/'(mnd_[a-z_]+)'/g)].map((m) => m[1]);
const avant = cles(readFileSync('supabase/migrations/0114_l_editeur_du_site.sql', 'utf8').replace(/--[^\n]*/g, ''));
const apres = cles(sql);
dit('la liste blanche garde ses quatorze cles et gagne les deux interrupteurs', [14, [], ['mnd_cercle_actif', 'mnd_foyer_actif']],
  [avant.length, avant.filter((k) => !apres.includes(k)), apres.filter((k) => !avant.includes(k))]);
dit('le compte du foyer : un nombre, elle comprise, jamais un nom', [true, true, true, false], [
  /create or replace function public\.nombre_de_tetes_de_mon_foyer\(\)\s*returns int/.test(sql),
  /security definer/.test(sql.slice(sql.indexOf('nombre_de_tetes_de_mon_foyer'))),
  /revoke all on function public\.nombre_de_tetes_de_mon_foyer\(\) from public;\s*grant execute on function public\.nombre_de_tetes_de_mon_foyer\(\) to authenticated;/.test(sql),
  /returns (setof|table|jsonb)/.test(sql.slice(sql.indexOf('nombre_de_tetes_de_mon_foyer'), sql.indexOf('$$;', sql.indexOf('nombre_de_tetes_de_mon_foyer')))),
]);
dit('le signal des trois fois : pose une fois, a 200 000', true,
  /set data = coalesce\(data, '\{\}'::jsonb\) \|\| jsonb_build_object\('seuilTroisFoisXof', 200000\)[\s\S]*?and not \(coalesce\(data, '\{\}'::jsonb\) \? 'seuilTroisFoisXof'\)/.test(sql));

/* ── 4. Les ecrans (commentaires effaces) ── */
const sansCom = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const achat = sansCom('src/apps/couronne/AchatFormule.tsx');
dit('l achat lit les decoupes en ligne ; trois fois seulement si offertes', [true, true, false], [
  /const offertes = decoupesEnLigne\(total, cfg\);/.test(achat),
  /\{troisFois \? \([\s\S]*?onClick=\{\(\) => setParts\(3\)\}/.test(achat),
  /deuxFoisPossible/.test(achat),
]);
dit('les refus du serveur se disent', [true, true, true], ['formule_fermee', 'deja_prise', 'apres_une_creation'].map((k) => new RegExp(`\\b${k}: '`).test(achat)));
const lib = sansCom('src/apps/couronne/lib.ts');
dit('le compte se demande au serveur, null s il ne repond pas', [true, true], [
  /supabase\.rpc\('nombre_de_tetes_de_mon_foyer'\)/.test(lib),
  /tetesDuFoyerLues = !error && typeof data === 'number' \? data : null;/.test(lib),
]);
dit('la reservation et le profil : le compte du serveur, sinon les mineurs', [true, true], [
  /tetesDuFoyer !== null && familleDeLaTete && familleDeLaTete\.id === client\?\.familyId\s*\? remiseFamillePourTetes\(familleDeLaTete, tetesDuFoyer\)\s*: remiseFamillePct\(familleDeLaTete, tousClients, todayIso\(\), 'mineurs'\)/.test(sansCom('src/apps/couronne/Booking.tsx')),
  /tetesDuFoyerProfil !== null && familleProfil\s*\? remiseFamillePourTetes\(familleProfil, tetesDuFoyerProfil\)\s*: remiseFamillePct\(familleProfil, tousClientsProfil, todayIso\(\), 'mineurs'\)/.test(sansCom('src/apps/couronne/Tabs.tsx')),
]);

console.log(ko === 0 ? '\nLe kit de janvier tient.' : `\n${ko} epreuve(s) en echec.`);
