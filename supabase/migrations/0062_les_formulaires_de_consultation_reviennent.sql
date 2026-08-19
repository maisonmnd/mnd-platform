-- ═══════════════════════════════════════════════════════════════════
-- 0062 — LES FORMULAIRES DE CONSULTATION REVIENNENT · 19 août 2026
--
-- « Je parlais des formulaires des consultations — les questionnaires
--   qu'on remplit lors d'une consultation. »
--
-- Les cinq formulaires créés ensemble vivent dans consult_forms. Deux
-- façons de les perdre : l'ARCHIVAGE (réparé côté écran — la section
-- « Archivés » a désormais son bouton « Remettre dans l'ERP ») et la
-- remise à zéro du 30 juillet (« le serveur fait foi » : table vide =
-- magasin vidé, et la graine ne repousse jamais d'elle-même — c'est voulu).
--
-- N'EXÉCUTER QUE SI l'onglet Formulaires est VIDE, archives comprises.
-- Idempotent : on conflict do nothing — un formulaire présent (même
-- personnalisé) n'est JAMAIS réécrit. Généré depuis la source
-- (Consultations.tsx, FORMS_SEED), pas recopié à la main.
-- ═══════════════════════════════════════════════════════════════════

insert into public.consult_forms (id, branch_id, data) values
  ('f1', null, '{"id":"f1","name":"Nouveau projet · démarrage de locks","eyebrow":"Projet","desc":"Cadrer la vision, la texture et le démarrage.","questions":[{"q":"Quel type de locks visez-vous ?","t":"Choix · Microlocks / Sisterlocks / Traditionnelles / Freeform"},{"q":"Quelle est votre texture naturelle (4A–4C, autre) ?","t":"Choix"},{"q":"Vos cheveux sont-ils vierges ou déjà traités ?","t":"Choix · Vierges / Colorés / Défrisés / Autres"},{"q":"Longueur actuelle des cheveux ?","t":"Texte court"},{"q":"Quelle longueur de départ de locks souhaitez-vous ?","t":"Texte court"},{"q":"Avez-vous déjà eu des locks par le passé ?","t":"Oui / Non + détail"},{"q":"À quelle fréquence pourrez-vous venir en entretien ?","t":"Choix · 4 / 6 / 8 semaines"},{"q":"Quel est votre budget mensuel d’entretien ?","t":"Montant"},{"q":"Y a-t-il une échéance (mariage, voyage) à respecter ?","t":"Date + note"},{"q":"Qu’attendez-vous de la maison MND pour ce projet ?","t":"Texte long"}]}'::jsonb),
  ('f2', null, '{"id":"f2","name":"Plan de soin","eyebrow":"Soin","desc":"Établir le rituel d’entretien sur 3 mois.","questions":[{"q":"Le cuir chevelu est-il sec, gras ou mixte ?","t":"Choix"},{"q":"Ressentez-vous des démangeaisons ou tiraillements ?","t":"Échelle 1–5"},{"q":"Présence de pellicules ou résidus ?","t":"Oui / Non + fréquence"},{"q":"À quelle fréquence lavez-vous vos locks ?","t":"Choix · Hebdo / Bi-mensuel / Mensuel"},{"q":"Quels produits utilisez-vous actuellement ?","t":"Texte long"},{"q":"Vos locks sont-elles hydratées ou cassantes ?","t":"Échelle 1–5"},{"q":"Exposition (sport, piscine, foulard) régulière ?","t":"Choix multiple"},{"q":"Allergies ou sensibilités connues ?","t":"Texte court"},{"q":"Objectif principal du plan de soin ?","t":"Choix · Hydratation / Croissance / Assainir"},{"q":"Acceptez-vous un rituel maison entre les séances ?","t":"Oui / Non"}]}'::jsonb),
  ('f3', null, '{"id":"f3","name":"Expertise","eyebrow":"Diagnostic","desc":"Évaluation technique complète de la chevelure.","questions":[{"q":"Densité capillaire observée ?","t":"Échelle 1–5"},{"q":"Diamètre des locks (fin / moyen / épais) ?","t":"Choix"},{"q":"Maturité des locks (jeune / en cours / mûr) ?","t":"Choix"},{"q":"État des racines (saines / fragilisées) ?","t":"Échelle 1–5"},{"q":"État des pointes (intactes / amincies / cassées) ?","t":"Choix"},{"q":"Présence de nœuds, fusions ou locks doubles ?","t":"Oui / Non + zones"},{"q":"Élasticité et résistance à la traction ?","t":"Échelle 1–5"},{"q":"Uniformité de la taille des locks ?","t":"Échelle 1–5"},{"q":"Signes d’amincissement ou de chute localisée ?","t":"Texte + photo"},{"q":"Verdict d’expertise et niveau de priorité ?","t":"Texte long"}]}'::jsonb),
  ('f4', null, '{"id":"f4","name":"Restauration de locks abîmés","eyebrow":"Réparation","desc":"Plan de sauvetage des locks fragilisées.","questions":[{"q":"Quelles zones sont les plus abîmées ?","t":"Choix · Racines / Corps / Pointes"},{"q":"Origine probable des dégâts ?","t":"Choix · Tension / Chimie / Négligence / Casse"},{"q":"Depuis combien de temps le problème persiste-t-il ?","t":"Texte court"},{"q":"Y a-t-il eu une coloration ou décoloration récente ?","t":"Oui / Non + date"},{"q":"Les locks se cassent-elles à la manipulation ?","t":"Échelle 1–5"},{"q":"Combien de locks sont concernées (estimation) ?","t":"Nombre"},{"q":"Avez-vous déjà tenté une réparation ?","t":"Oui / Non + résultat"},{"q":"Êtes-vous ouverte à une coupe partielle si nécessaire ?","t":"Oui / Non"},{"q":"Quel délai pour la restauration complète ?","t":"Choix · 1 / 3 / 6 mois"},{"q":"Niveau d’engagement pour le protocole maison ?","t":"Échelle 1–5"}]}'::jsonb),
  ('f5', null, '{"id":"f5","name":"Suivi des clientes régulières","eyebrow":"Fidélité","desc":"Point d’étape pour les têtes couronnées du Cercle.","questions":[{"q":"Satisfaction depuis la dernière séance ?","t":"Échelle 1–5"},{"q":"Les locks ont-elles évolué comme prévu ?","t":"Oui / Non + note"},{"q":"Nouveaux désagréments depuis la dernière visite ?","t":"Texte court"},{"q":"Le rituel maison a-t-il été suivi ?","t":"Choix · Toujours / Parfois / Jamais"},{"q":"Évolution de la longueur (cm gagnés) ?","t":"Nombre"},{"q":"Souhaitez-vous faire évoluer le style ?","t":"Oui / Non + idée"},{"q":"Régularité d’entretien respectée ?","t":"Échelle 1–5"},{"q":"Intérêt pour un palier ou abonnement supérieur ?","t":"Oui / Non"},{"q":"Produits maison à réapprovisionner ?","t":"Choix multiple"},{"q":"Date idéale du prochain rendez-vous ?","t":"Date"}]}'::jsonb)
on conflict (id) do nothing;

-- ── LE CONTRÔLE — attendu : 5 lignes, chacune avec son nom ──
select id, data ->> 'name' as nom, jsonb_array_length(data -> 'questions') as questions
from public.consult_forms
where id in ('f1','f2','f3','f4','f5')
order by id;
