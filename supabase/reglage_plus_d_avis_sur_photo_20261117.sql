-- Plus d'avis sur photo sans rendez-vous : 17 novembre 2026.
-- « Il ne faut pas permettre d'avoir des bilans sans prendre de RDV sinon tout
-- le monde nous trichera. » (Yéman, la consultation en affiches, arbitrage D.)
-- Elle revient sur son choix du 30 octobre 2026 : à « ma longueur suffit ? »,
-- la Maison répondait « Envoyez-nous une photo de vos cheveux, de face et de
-- dos : une personne de la Maison regarde et vous dit si la longueur suffit. »
--
-- Ce texte était PROPOSÉ par le Trône pour la réponse « r-longueur » du
-- conseil WhatsApp (document `mnd_reponses_maison`, Clients › Réponses de la
-- Maison). S'il y a été validé, l'automate (en réserve depuis qu'Opale
-- répond) le renverrait encore le jour où on le rallume, et il se lit
-- toujours au Trône.
--
-- Ce fichier remplace CE texte, et lui seul, par celui que le Trône propose
-- désormais (shared/conseil-wa.ts, `TEXTES_PROPOSES`), et remet la réponse en
-- brouillon : la direction la relit et la valide, comme toute réponse dont
-- le sens change. Une réponse que la direction a écrite autrement n'est pas
-- touchée. Aucune autre ligne ne bouge.
--
-- À PASSER APRÈS la publication du Trône (un ancien Trône proposerait encore
-- l'ancien texte pour une réponse vide).
--
-- REJOUABLE : rejoué, il ne trouve plus l'ancien texte et ne change rien.

update public.documents d
   set data = jsonb_set(
         d.data,
         '{reponses}',
         (select jsonb_agg(
                   case when r->>'id' = 'r-longueur'
                         and r->>'texte' = 'Envoyez-nous une photo de vos cheveux, de face et de dos : une personne de la Maison regarde et vous dit si la longueur suffit.'
                        then (r - 'valideeLe' - 'valideePar')
                             || jsonb_build_object(
                                  'texte', 'La longueur se regarde avec vous, au rendez-vous : la consultation est le premier pas, elle se réserve ci-dessous.',
                                  'etat', 'brouillon')
                        else r end
                   order by ord)
            from jsonb_array_elements(d.data->'reponses') with ordinality as t(r, ord))),
       updated_at = now()
 where d.key = 'mnd_reponses_maison'
   and jsonb_typeof(d.data->'reponses') = 'array'
   and exists (
         select 1 from jsonb_array_elements(d.data->'reponses') r
          where r->>'id' = 'r-longueur'
            and r->>'texte' = 'Envoyez-nous une photo de vos cheveux, de face et de dos : une personne de la Maison regarde et vous dit si la longueur suffit.');

-- Ce qui est en base après coup : la réponse « ma longueur suffit ? ».
select r->>'id' as reponse, r->>'etat' as etat, r->>'texte' as texte
  from public.documents d, jsonb_array_elements(d.data->'reponses') r
 where d.key = 'mnd_reponses_maison' and r->>'id' = 'r-longueur';
