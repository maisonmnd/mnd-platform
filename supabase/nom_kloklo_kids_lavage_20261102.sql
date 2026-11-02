-- Le lavage des enfants dit en clair — 2 novembre 2026, choix de Yéman
-- (« comment préciser que Le Souffle, c'est le lavage, sur les factures ? »,
-- puis « Partout ») : « KLƆKLƆ™ Kids · Le Souffle » devient
-- « KLƆKLƆ™ Kids · Le Souffle · shampoing et lavage ». Le prix ne bouge pas.
-- Un nom posé à la main fait foi devant la nouvelle grille (nouvelle-grille-pur.ts).
-- Copie de repli de la fiche d'avant. Rejouable.
create table if not exists public.repli_nom_kloklo_kids_20261102 as
  select id, data from public.catalog_services where id = 'sv-kids-kloklo';
alter table public.repli_nom_kloklo_kids_20261102 enable row level security;

update public.catalog_services
   set data = jsonb_set(data, '{name}', '"KLƆKLƆ™ Kids · Le Souffle · shampoing et lavage"'::jsonb), updated_at = now()
 where id = 'sv-kids-kloklo';

select id, data->>'name' as nom, data->>'priceXof' as prix from public.catalog_services where id = 'sv-kids-kloklo';
