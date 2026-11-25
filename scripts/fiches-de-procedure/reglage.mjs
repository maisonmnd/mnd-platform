import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* LE RÉGLAGE DES FICHES DE PROCÉDURE — le fichier SQL que la mise en ligne passe.

   node scripts/fiches-de-procedure/reglage.mjs --fiches <fiches.json> --sortie <fichier.sql>
        [--seulement id,id]   ne pose que ces fiches
        [--valide id,id]      celles-ci partent VALIDÉES (version 1), les autres en brouillon
        [--prestations]       crée aussi les deux prestations offertes et les masque du site
        --quoi "…"            la phrase qui dit, en tête du fichier, ce que ce réglage fait

   TROIS GARDES, écrites dans le SQL lui-même :
   · UNE FICHE QUE LA DIRECTION A VALIDÉE OU CORRIGÉE NE S'ÉCRASE PAS. Le
     réglage ne remplace une fiche que si elle n'est pas validée et que son
     brouillon vient de la semence ou d'un réglage précédent (`brouillonPar`
     vide ou égal à la marque de cette recherche). Tout le reste est gardé.
   · UNE PRESTATION DÉJÀ LÀ, OU RETIRÉE PAR LA MAISON (pierre tombale), ne se
     repose pas.
   · UN REPLI D'ABORD : les deux documents touchés sont copiés dans une table
     `repli_`, sous RLS, avant toute écriture.
   Rejouable : le rejouer ne change rien de plus. */

const ici = import.meta.dirname;
const arg = (nom) => { const i = process.argv.indexOf(nom); return i > 0 ? process.argv[i + 1] : undefined; };
const drapeau = (nom) => process.argv.includes(nom);
const liste = (nom) => (arg(nom) ?? '').split(',').map((x) => x.trim()).filter(Boolean);

const fichier = arg('--fiches');
const sortie = arg('--sortie');
const quoi = arg('--quoi');
if (!fichier || !sortie || !quoi) { console.error('Il faut --fiches, --sortie et --quoi.'); process.exit(2); }

export const MARQUE_DE_LA_RECHERCHE = 'Recherche du 25 novembre 2026';
const SIGNATURE = 'la direction (décision confiée à Claude le 25 novembre 2026)';
const maintenant = new Date().toISOString();
const jour = maintenant.slice(0, 10).replace(/-/g, '');

const seulement = liste('--seulement');
const aValider = liste('--valide');
const toutes = JSON.parse(readFileSync(fichier, 'utf8'));
const retenues = seulement.length ? toutes.filter((f) => seulement.includes(f.serviceId)) : toutes;
for (const id of [...seulement, ...aValider]) {
  if (!retenues.some((f) => f.serviceId === id)) { console.error(`Fiche introuvable : ${id}`); process.exit(2); }
}

const document = {};
for (const f of retenues) {
  const propre = Object.fromEntries(Object.entries(f).filter(([k]) => !k.startsWith('_')));
  document[f.serviceId] = {
    ...propre,
    brouillonLe: maintenant,
    brouillonPar: MARQUE_DE_LA_RECHERCHE,
    ...(aValider.includes(f.serviceId)
      ? { validee: { numero: 1, le: maintenant, par: SIGNATURE, contenu: f.brouillon } }
      : {}),
  };
}

const json = (v) => {
  const t = JSON.stringify(v);
  if (t.includes('$fiches$')) throw new Error('Le contenu porte la balise $fiches$.');
  return `$fiches$${t}$fiches$::jsonb`;
};
const sql = (s) => `'${String(s).replace(/'/g, "''")}'`;

const { PRESTATIONS_OFFERTES } = await import(pathToFileURL(path.join(ici, 'prestations-offertes.mjs')).href);
const avecPrestations = drapeau('--prestations');
const ids = PRESTATIONS_OFFERTES.map((p) => p.id);
const tableau = `array[${ids.map(sql).join(', ')}]`;
const repli = `repli_documents_${jour}_fiches_de_procedure`;

const morceaux = [];
morceaux.push(`-- ═══════════════════════════════════════════════════════════════════════════
-- RÉGLAGE — LES FICHES DE PROCÉDURE (${maintenant.slice(0, 10)})
--
-- ${quoi}
--
-- Écrit par \`node scripts/fiches-de-procedure/reglage.mjs\` depuis les fiches
-- de \`scripts/fiches-de-procedure/familles/\`. Ne pas le corriger à la main :
-- corriger la famille, puis le refaire.
--
-- ${retenues.length} fiche(s) : ${aValider.length} validée(s) (version 1, signée
-- « ${SIGNATURE} »), ${retenues.length - aValider.length} en brouillon.${avecPrestations ? `
-- ${ids.length} prestations offertes créées (0 F) et retirées du site et de Ma Couronne.` : ''}
--
-- GARDES : une fiche déjà validée, ou dont le brouillon a été corrigé par la
-- direction, n'est pas touchée ; une prestation déjà là ou retirée par la
-- Maison ne se repose pas. Un repli d'abord. Rejouable sans rien changer de plus.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Le repli ──────────────────────────────────────────────────────────
create table if not exists public.${repli} as
  select * from public.documents where key in ('mnd_fiches_de_procedure', 'mnd_vitrine_config');
alter table public.${repli} enable row level security;
`);

if (avecPrestations) {
  morceaux.push(`-- ── ① Les prestations offertes ─────────────────────────────────────────
insert into public.catalog_services (id, branch_id, data)
select v.id, null, v.data
  from (values
${PRESTATIONS_OFFERTES.map((p) => `    (${sql(p.id)}, ${json(p)})`).join(',\n')}
  ) as v(id, data)
 where not exists (select 1 from public.catalog_services s where s.id = v.id)
   and not exists (select 1 from public.catalog_tombstones t where t.id = v.id);

-- ── ② Elles ne se réservent pas seules : hors du site, hors de Ma Couronne ──
update public.documents d
   set data = jsonb_set(
         jsonb_set(
           d.data,
           '{siteMasques,services}',
           (d.data->'siteMasques'->'services')
             || coalesce((select jsonb_agg(x) from unnest(${tableau}) as x
                           where not (d.data->'siteMasques'->'services') ? x), '[]'::jsonb)),
         '{hiddenServices}',
         (d.data->'hiddenServices')
           || coalesce((select jsonb_agg(x) from unnest(${tableau}) as x
                         where not (d.data->'hiddenServices') ? x), '[]'::jsonb)),
       updated_at = now()
 where d.key = 'mnd_vitrine_config'
   and jsonb_typeof(d.data->'siteMasques'->'services') = 'array'
   and jsonb_typeof(d.data->'hiddenServices') = 'array'
   and not ((d.data->'siteMasques'->'services') ?& ${tableau}
        and (d.data->'hiddenServices') ?& ${tableau});
`);
}

morceaux.push(`-- ── ③ Les fiches ──────────────────────────────────────────────────────
with neuves as (select ${json(document)} as j)
update public.documents d
   set data = (
         select coalesce(jsonb_object_agg(t.k, t.v), '{}'::jsonb)
           from (
             select n.key as k,
                    case
                      when d.data ? n.key and (
                             (d.data->n.key) ? 'validee'
                          or coalesce(d.data->n.key->>'brouillonPar', '') not in ('', ${sql(MARQUE_DE_LA_RECHERCHE)})
                           ) then d.data->n.key
                      else n.value
                    end as v
               from neuves, jsonb_each(neuves.j) as n
             union all
             select e.key, e.value
               from neuves, jsonb_each(d.data) as e
              where not (neuves.j ? e.key)
           ) t),
       updated_at = now()
 where d.key = 'mnd_fiches_de_procedure'
   and jsonb_typeof(d.data) = 'object';

-- Le document n'existait pas encore : on le pose.
with neuves as (select ${json(document)} as j)
insert into public.documents (key, data)
select 'mnd_fiches_de_procedure', neuves.j from neuves
 where not exists (select 1 from public.documents where key = 'mnd_fiches_de_procedure');


-- ── Contrôle ──────────────────────────────────────────────────────────
select (select count(*) from jsonb_object_keys(d.data))                                              as fiches,
       (select count(*) from jsonb_each(d.data) e where e.value ? 'validee')                         as validees,
       (select count(*) from jsonb_each(d.data) e where not (e.value ? 'validee'))                   as brouillons,
       d.data->'1740l5ysxj'->'validee'->>'numero'                                                    as sowa_version,
       d.data->'1740l5ysxj'->'validee'->>'par'                                                       as sowa_validee_par,
       jsonb_array_length(d.data->'1740l5ysxj'->'validee'->'contenu'->'etapes')                      as sowa_etapes,
       d.updated_at
  from public.documents d where d.key = 'mnd_fiches_de_procedure';
select s.id, s.data->>'name' as nom, s.data->>'priceXof' as prix, s.data->>'durationMin' as minutes,
       (select d.data->'siteMasques'->'services' ? s.id from public.documents d where d.key = 'mnd_vitrine_config')  as hors_du_site,
       (select d.data->'hiddenServices' ? s.id from public.documents d where d.key = 'mnd_vitrine_config')           as hors_de_ma_couronne
  from public.catalog_services s where s.id = any(${tableau});
select count(*) as lignes_au_repli from public.${repli};
`);

/* L'ESSAI À BLANC (`--essai`), en lecture seule : UNE requête qui calcule, sur
   la vraie base, ce que le réglage y écrirait. Les expressions sont les
   mêmes ; elle se passe par `mise-en-ligne.mjs requete`. */
if (drapeau('--essai')) {
  const fusion = `(select coalesce(jsonb_object_agg(t.k, t.v), '{}'::jsonb)
           from (
             select n.key as k,
                    case
                      when d.data ? n.key and (
                             (d.data->n.key) ? 'validee'
                          or coalesce(d.data->n.key->>'brouillonPar', '') not in ('', ${sql(MARQUE_DE_LA_RECHERCHE)})
                           ) then d.data->n.key
                      else n.value
                    end as v
               from neuves, jsonb_each(neuves.j) as n
             union all
             select e.key, e.value
               from neuves, jsonb_each(d.data) as e
              where not (neuves.j ? e.key)
           ) t)`;
  const essai = `with neuves as (select ${json(document)} as j),
     apres as (select ${fusion} as data, d.data as avant from public.documents d where d.key = 'mnd_fiches_de_procedure')
select (select count(*) from jsonb_object_keys(a.avant))                                    as fiches_avant,
       (select count(*) from jsonb_object_keys(a.data))                                     as fiches_apres,
       (select count(*) from jsonb_each(a.data) e where e.value ? 'validee')                as validees_apres,
       (select count(*) from neuves, jsonb_each(neuves.j) n where a.data->n.key = n.value)  as posees,
       (select count(*) from neuves, jsonb_each(neuves.j) n where a.data->n.key <> n.value) as gardees_telles_quelles,
       a.data->'1740l5ysxj'->'validee'->>'par'                                              as sowa_validee_par,
       jsonb_array_length(a.data->'1740l5ysxj'->'validee'->'contenu'->'etapes')             as sowa_etapes,
       (select jsonb_agg(v.id) from (values ${PRESTATIONS_OFFERTES.map((p) => `(${sql(p.id)})`).join(', ')}) as v(id)
         where not exists (select 1 from public.catalog_services s where s.id = v.id)
           and not exists (select 1 from public.catalog_tombstones t where t.id = v.id))     as prestations_a_poser,
       (select (d.data->'siteMasques'->'services')
                 || coalesce((select jsonb_agg(x) from unnest(${tableau}) as x where not (d.data->'siteMasques'->'services') ? x), '[]'::jsonb)
          from public.documents d where d.key = 'mnd_vitrine_config')                        as masques_du_site_apres
  from apres a`;
  writeFileSync(sortie, essai);
  console.log(`${sortie} : essai à blanc (lecture seule), ${(essai.length / 1024).toFixed(0)} Ko.`);
  process.exit(0);
}

writeFileSync(sortie, morceaux.join('\n'));
console.log(`${sortie} : ${retenues.length} fiche(s), ${aValider.length} validée(s)${avecPrestations ? `, ${ids.length} prestations offertes` : ''} ; ${(morceaux.join('\n').length / 1024).toFixed(0)} Ko.`);
