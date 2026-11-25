/* LE CONTRÔLE SÓWÀ À J+7, ÉPROUVÉ — `node scripts/verifie-le-controle-sowa.mjs [--prouve]`.

   25 novembre 2026 : « Pour un rituel Sówà, il faut toujours prendre un
   rendez-vous automatique offert Sówà 7 jours plus tard avec la personne pour
   son suivi » (Yéman). La règle vit en base (migration 0245, pg_cron) ; le
   banc lit son texte et vérifie chacune de ses gardes. `--prouve` casse
   chaque garde, en mémoire seulement (aucun fichier n'est réécrit), et
   exige que le banc le voie. */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const racine = path.resolve(import.meta.dirname ?? '.', '..');
const FICHIER = 'supabase/migrations/0245_le_controle_sowa_a_j7.sql';
const propre = readFileSync(path.join(racine, FICHIER), 'utf8').replace(/\r\n/g, '\n');

const epreuves = (sql) => {
  const dit = [];
  const vaut = (nom, ok) => dit.push([nom, !!ok]);
  vaut('le rituel est le Rituel Sówà, le contrôle celui du catalogue', sql.includes("rituel_sowa   constant text := '1740l5ysxj';") && sql.includes("le_controle   constant text := 'sv-sowa-controle';"));
  vaut('seul un rituel ferme appelle son contrôle (confirmé ou honoré)', sql.includes("and coalesce(a.data->>'status', '') in ('confirmé', 'honoré')"));
  vaut('une place en attente du oui de la cliente attend ce oui', sql.includes("and not (a.data ? 'attenduJusquAu' and coalesce(a.data->>'confirmeeParLaClienteLe', '') = ''"));
  vaut('sept jours plus tard, à la même heure, chez Team', sql.includes('cible := (r.data->>\'date\')::date + 7;') && sql.includes("'time', r.data->>'time',") && sql.includes("'master', 'Team',"));
  vaut('offert, 45 minutes, la prestation du contrôle', sql.includes("'priceXof', 0,") && sql.includes("'dureeMin', 45,") && sql.includes("'serviceIds', jsonb_build_array(le_controle),"));
  vaut('jamais deux : un rituel qui a déjà son contrôle (même annulé)', sql.includes("and not exists (select 1 from public.appointments k where k.data->>'controleDe' = a.id)"));
  vaut('jamais deux : un contrôle vivant de la cliente dans les trois semaines', sql.includes('between (a.data->>\'date\')::date + 1 and (a.data->>\'date\')::date + 21)') && sql.includes("and coalesce(k.data->>'status', '') <> 'annulé'"));
  vaut('jamais pour une fiche d essai', sql.includes("and coalesce(a.data->>'essai', '') <> 'true'") && sql.includes("and coalesce(cl.data->>'essai', '') = 'true')"));
  vaut('jamais dans le passé', sql.includes("and (a.data->>'date')::date + 7 >= aujourdhui"));
  vaut('une erreur sur un rituel ne bloque pas les autres', sql.includes("exception when others then\n      raise warning 'contrôle Sówà du rituel % non posé : %', r.id, sqlerrm;"));
  vaut('le contrôle suit son rituel, seulement si personne ne l a touché', sql.includes("and (k.data->>'date')::date = (k.data->>'controlePourLe')::date + 7") && sql.includes("where coalesce(k.data->>'status', '') = 'confirmé'"));
  vaut('le rituel annulé annule le contrôle', sql.includes("if coalesce(c.rituel->>'status', '') = 'annulé' then") && sql.includes("'raisonAnnulation', 'le Rituel Sówà a été annulé'"));
  vaut('le rituel déplacé déplace le contrôle, au septième jour et à son heure', sql.includes("'date', to_char((c.rituel->>'date')::date + 7, 'YYYY-MM-DD'),") && sql.includes("'time', c.rituel->>'time',"));
  vaut('la tâche passe toutes les dix minutes, une seule fois inscrite', sql.includes("perform cron.unschedule('pose-les-controles-sowa');") && sql.includes("perform cron.schedule('pose-les-controles-sowa', '*/10 * * * *', 'select public.pose_les_controles_sowa();');"));
  vaut('personne d autre que le serveur ne l appelle', sql.includes('revoke all on function public.pose_les_controles_sowa() from public, anon, authenticated;'));
  vaut('les dates illisibles sont écartées', sql.includes("and coalesce(a.data->>'date', '') ~ '^\\d{4}-\\d{2}-\\d{2}$'"));
  return dit;
};

const PANNES = [
  ['un rituel en attente pose son contrôle', "and not (a.data ? 'attenduJusquAu'", 'and not (false'],
  ['le contrôle tombe à J+6', "cible := (r.data->>'date')::date + 7;", "cible := (r.data->>'date')::date + 6;"],
  ['le contrôle n est plus offert', "'priceXof', 0,", "'priceXof', 5000,"],
  ['un contrôle annulé se repose', "and not exists (select 1 from public.appointments k where k.data->>'controleDe' = a.id)", ''],
  ['un contrôle posé à la main ne compte plus', 'between (a.data->>\'date\')::date + 1 and (a.data->>\'date\')::date + 21)', 'between (a.data->>\'date\')::date + 1 and (a.data->>\'date\')::date + 2)'],
  ['une fiche d essai a son contrôle', "and coalesce(a.data->>'essai', '') <> 'true'", ''],
  ['un contrôle retouché à la main suit quand même', "and (k.data->>'date')::date = (k.data->>'controlePourLe')::date + 7", ''],
  ['un rituel annulé laisse son contrôle', "if coalesce(c.rituel->>'status', '') = 'annulé' then", "if false then"],
  ['une erreur arrête tout', "exception when others then\n      raise warning 'contrôle Sówà du rituel % non posé : %', r.id, sqlerrm;", ''],
  ['la tâche s inscrit deux fois', "perform cron.unschedule('pose-les-controles-sowa');", ''],
  ['un rituel seulement suggéré appelle son contrôle', "in ('confirmé', 'honoré')", "in ('confirmé', 'honoré', 'en attente')"],
];

const net = epreuves(propre);
for (const [nom, ok] of net) console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}`);
const echecs = net.filter(([, ok]) => !ok).length;
console.log(echecs ? `\n${echecs} épreuve(s) en échec.` : `\n${net.length}/${net.length} : le contrôle Sówà tient.`);
if (echecs) process.exit(1);

if (process.argv.includes('--prouve')) {
  let muettes = 0;
  for (const [nom, a, b] of PANNES) {
    if (propre.split(a).length !== 2) { console.log(`INTROUVABLE ${nom}`); muettes++; continue; }
    const casse = epreuves(propre.replace(a, () => b)).filter(([, ok]) => !ok);
    if (casse.length) console.log(`CRIE  ${nom}  (${casse[0][0]})`); else { console.log(`MUETTE ${nom}`); muettes++; }
  }
  console.log(muettes ? `\n${muettes} panne(s) muette(s).` : `\nLes ${PANNES.length} pannes crient.`);
  process.exit(muettes ? 1 : 0);
}
