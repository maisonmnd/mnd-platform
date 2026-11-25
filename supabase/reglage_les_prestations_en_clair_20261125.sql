-- ═══════════════════════════════════════════════════════════════════════════
-- RÉGLAGE — LES PRESTATIONS EN CLAIR (2026-11-25)
--
-- « Quand les clients reçoivent leurs rendez-vous ou leurs factures, ils ne
-- savent pas que Rituel Sówà™ est le traitement anti-poux, ni que Le Souffle
-- est un lavage. Il faut la mini-description des noms des services » (Yéman).
--
-- 87 prestations reçoivent leurs mots en clair (champ « enClair », voir
-- shared/en-clair-pur.ts), écrits d'après leur propre description au
-- catalogue. Les 19 autres n'en ont pas besoin : leur nom le dit déjà
-- (« Pendant le rituel · pédicure », « Démontage ancienne coiffure »).
-- Ils se corrigent ensuite au Catalogue, champ « En clair ».
--
-- GARDE : une prestation qui porte déjà des mots en clair (posés ou corrigés
-- au Catalogue) n'est pas touchée. Un repli d'abord. Rejouable sans rien
-- changer de plus.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Le repli ──────────────────────────────────────────────────────────
create table if not exists public.repli_catalog_services_20261125_en_clair as
  select * from public.catalog_services;
alter table public.repli_catalog_services_20261125_en_clair enable row level security;

-- ── Les mots en clair ─────────────────────────────────────────────────
update public.catalog_services c
   set data = jsonb_set(c.data, '{enClair}', to_jsonb(v.en_clair)),
       updated_at = now()
  from (values
    ($t$sv-koko-ori$t$, $t$consultation avant la création des locks$t$),
    ($t$sv-koko-sui$t$, $t$consultation pour des locks faites ailleurs$t$),
    ($t$sv-koko-bilan$t$, $t$consultation, bilan de vos locks$t$),
    ($t$svc-doto-conseil$t$, $t$consultation conseil et routine$t$),
    ($t$sv-atl-i-jum$t$, $t$création de locks larges$t$),
    ($t$sv-atl-i-med$t$, $t$création de locks moyennes$t$),
    ($t$sv-atl-i-min$t$, $t$création de locks fines$t$),
    ($t$sv-atl-i-mic$t$, $t$création de locks très fines$t$),
    ($t$sv-atl-i-nan$t$, $t$création de locks ultra fines$t$),
    ($t$sv-atl-i-pic$t$, $t$création des locks les plus fines$t$),
    ($t$sv-forfait-sv-fft-i-01$t$, $t$création de locks et kit d’entretien$t$),
    ($t$sv-fft-i-02$t$, $t$création de locks et trois entretiens$t$),
    ($t$sv-sup-30$t$, $t$quelques locks d’essai avant la création$t$),
    ($t$sv-forfait-sv-fft-ii-01$t$, $t$abonnement d’entretien, 3 mois$t$),
    ($t$sv-forfait-sv-fft-ii-02$t$, $t$abonnement d’entretien, 12 mois$t$),
    ($t$sv-atl-iii-cou-c$t$, $t$coloration végétale$t$),
    ($t$sv-atl-iii-cou-l$t$, $t$coloration végétale$t$),
    ($t$sv-atl-iii-ecl-c$t$, $t$ravive une couleur végétale déjà posée$t$),
    ($t$sv-atl-iii-lum-c$t$, $t$soin brillance$t$),
    ($t$sv-forfait-sv-plt-60-cl-c$t$, $t$coloration végétale et soin brillance$t$),
    ($t$sv-dds-col-c$t$, $t$pose de la coloration que vous apportez$t$),
    ($t$sv-forfait-sv-fft-iii-01$t$, $t$forfait couleur et brillance, 3 mois$t$),
    ($t$sv-atl-iii-sub-c$t$, $t$décoloration puis coloration$t$),
    ($t$sv-plt-60-pc-c$t$, $t$les trois soins après une coloration$t$),
    ($t$sv-plt-60-pc-m$t$, $t$les trois soins après une coloration$t$),
    ($t$sv-plt-60-pc-l$t$, $t$les trois soins après une coloration$t$),
    ($t$sv-finfin-legere$t$, $t$réparation légère des locks$t$),
    ($t$sv-atl-iv-gbe-c$t$, $t$réparation des locks fragilisées$t$),
    ($t$sv-atl-iv-gbp-c$t$, $t$réparation des locks très abîmées$t$),
    ($t$sv-atl-iv-ala-c$t$, $t$séparation des locks collées et reconstruction$t$),
    ($t$sv-plt-50-ret-r-c$t$, $t$contrôle après une réparation$t$),
    ($t$sv-atl-iv-gbp-prot$t$, $t$soin aux protéines après une technique$t$),
    ($t$sv-fft-iv-01$t$, $t$cure de reconstruction, 3 séances$t$),
    ($t$sv-fft-iv-02$t$, $t$réparation complète et 6 mois d’entretien$t$),
    ($t$sv-plt-45-std$t$, $t$défaisage des locks récentes ou larges$t$),
    ($t$sv-plt-45-int$t$, $t$défaisage des locks anciennes, fines ou denses$t$),
    ($t$sv-atl-ii-e$t$, $t$reprise des racines$t$),
    ($t$sv-atl-ii-l$t$, $t$reprise des racines, longue tenue$t$),
    ($t$sv-gbeji-sublimation$t$, $t$soin des cheveux qui sortent de la lock$t$),
    ($t$sv-venue-gbeji-ess$t$, $t$lavage et reprise des racines$t$),
    ($t$sv-venue-gbeji-sig$t$, $t$lavage et reprise des racines, longue tenue$t$),
    ($t$sv-le-moment$t$, $t$lavage, reprise des racines et hydratation$t$),
    ($t$sv-le-moment-cuir-chevelu$t$, $t$lavage, reprise des racines et détox du cuir chevelu$t$),
    ($t$sv-forfait-gbeji-fidelite$t$, $t$lavage et reprise des racines, 20 % de moins$t$),
    ($t$sv-plt-05-ess-c$t$, $t$lavage doux$t$),
    ($t$sv-plt-05-sig-c$t$, $t$lavage approfondi$t$),
    ($t$sv-plt-05-pre-c$t$, $t$lavage complet avec masque$t$),
    ($t$sv-dds-shp-e$t$, $t$lavage avec votre shampoing$t$),
    ($t$sv-plt-10-l$t$, $t$soin hydratant léger$t$),
    ($t$sv-plt-10-m$t$, $t$soin hydratant profond$t$),
    ($t$sv-plt-20-c$t$, $t$soin détox des locks et du cuir chevelu$t$),
    ($t$sv-forfait-sv-plt-60-wd-c$t$, $t$soin détox et soin hydratant$t$),
    ($t$sv-dds-dec$t$, $t$soin détox avec votre produit$t$),
    ($t$sv-dds-soi-c$t$, $t$soin avec votre masque ou votre huile$t$),
    ($t$sv-plt-40-m$t$, $t$soin anti-casse$t$),
    ($t$sv-gbigbi-cure-trois$t$, $t$soin anti-casse, 3 séances$t$),
    ($t$sv-plt-30-c$t$, $t$soin pour la pousse, massage du crâne$t$),
    ($t$sv-plt-30-cur$t$, $t$soin pour la pousse, 3 séances$t$),
    ($t$1740l5ysxj$t$, $t$traitement anti-poux$t$),
    ($t$sv-sowa-controle$t$, $t$contrôle anti-poux, 7 jours après$t$),
    ($t$sv-sup-01$t$, $t$préparation du cheveu$t$),
    ($t$sv-sup-02-l$t$, $t$préparation du cheveu$t$),
    ($t$sv-sup-03-c$t$, $t$préparation du cheveu$t$),
    ($t$sv-kids-kloklo$t$, $t$lavage, enfant$t$),
    ($t$sv-kids-sinsin$t$, $t$reprise des racines, enfant$t$),
    ($t$sv-kids-retouche$t$, $t$retouche des racines, enfant$t$),
    ($t$sv-kids-vekpe$t$, $t$création de locks, enfant$t$),
    ($t$sv-kids-naissance$t$, $t$création de locks et trois venues de suivi, enfant$t$),
    ($t$sv-kids-rituel$t$, $t$lavage, reprise des racines et soins, enfant$t$),
    ($t$sv-kids-gbigbi$t$, $t$soin anti-casse, enfant$t$),
    ($t$sv-kids-yekpe$t$, $t$soin brillance et anti-casse, enfant$t$),
    ($t$sv-kids-couronne-cocon$t$, $t$coiffure protectrice, enfant$t$),
    ($t$sv-fulani-braids-kids$t$, $t$tresses Fulani, enfant$t$),
    ($t$sv-stu-b-eve-c$t$, $t$lavage et définition des boucles$t$),
    ($t$sv-stu-c-sik-1-c$t$, $t$coiffure du grand jour, sans essai$t$),
    ($t$sv-stu-c-sik-2-c$t$, $t$coiffure du grand jour, avec essai$t$),
    ($t$sv-souv-1h$t$, $t$salon privatisé, une heure$t$),
    ($t$sv-souv-2h$t$, $t$salon privatisé, deux heures$t$),
    ($t$sv-souv-rep$t$, $t$salon privatisé pendant la réparation$t$),
    ($t$sv-souv-crea$t$, $t$salon privatisé pendant la création$t$),
    ($t$sv-aca-ini-dec$t$, $t$cours particulier$t$),
    ($t$sv-aca-ini-res$t$, $t$cours particulier$t$),
    ($t$sv-aca-ini-aut$t$, $t$trois cours particuliers$t$),
    ($t$sv-aca-pro-cre$t$, $t$formation professionnelle$t$),
    ($t$sv-aca-pro-ent$t$, $t$formation professionnelle$t$),
    ($t$sv-aca-pro-biz$t$, $t$formation professionnelle$t$),
    ($t$sv-aca-pro-cert$t$, $t$formation professionnelle certifiante$t$)
  ) as v(id, en_clair)
 where c.id = v.id
   and coalesce(c.data->>'enClair', '') = '';

-- ── Ce qui est posé ───────────────────────────────────────────────────
select count(*) filter (where coalesce(data->>'enClair', '') <> '') as en_clair,
       count(*) as prestations
  from public.catalog_services;
