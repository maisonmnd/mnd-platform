/* Dictionnaire anglais : booking. Voir ../i18n.ts. */
export const EN_BOOKING: Record<string, string> = {
  // L'entête du tunnel : titres et surtitres (tableaux TITLES / EYEBROWS).
  'Votre rituel.': 'Your ritual.',
  'Le moment.': 'The moment.',
  'L’acompte.': 'The deposit.',
  'Confirmé.': 'Confirmed.',
  'Réserver · votre rituel': 'Book · your ritual',
  'Réserver · le moment': 'Book · the moment',
  'Réserver · Mobile Money': 'Book · Mobile Money',
  'Réserver · scellé': 'Book · sealed',
  'Réserver · une question pour vous': 'Book · a question for you',
  'Dites-nous, en deux gestes.': 'Tell us, in two taps.',
  'Réserver': 'Book',
  'Fermer': 'Close',
  '← Annuler': '← Cancel',
  '← Retour': '← Back',

  // La porte fermée sur une échéance oubliée.
  'Une échéance vous attend.': 'A payment is waiting for you.',
  'Réservation suspendue': 'Booking on hold',
  'Une échéance de votre formule attend depuis {n} jours. Réglez-la et votre prochain rendez-vous se rouvre aussitôt.':
    'A payment on your plan has been waiting for {n} days. Settle it and your next appointment opens again right away.',
  'Régler {montant}': 'Pay {montant}',
  'Vous pouvez aussi passer à la Maison : elle encaisse et rouvre votre rendez-vous sur-le-champ.':
    'You can also come by the Maison: we take your payment and reopen your appointment on the spot.',

  // Pour qui.
  'Pour': 'For',
  'Moi': 'Me',

  // Le quiz du seuil.
  'Deux réponses, et votre prochaine couronne s’écrit déjà.': 'Two answers, and your next crown is already taking shape.',
  '↻ Autres questions': '↻ Other questions',
  'Pour vous, {prenom}': 'For you, {prenom}',
  'Pour vous': 'For you',
  ' · votre tarif': ' · your price',
  'Réserver ce rituel': 'Book this ritual',
  'Voir toutes les prestations →': 'See all services →',
  'Votre envie est notée, la maison la lira avant votre venue. Parcourez ses rituels : la maîtresse fera le reste au fauteuil.':
    'Your wish is noted, the Maison will read it before your visit. Browse its rituals: your artisan will do the rest in the chair.',
  'Voir les rituels': 'See the rituals',
  'Je sais déjà ce que je veux →': 'I already know what I want →',
  // Les mots du quiz (shared/quiz.ts), traduits à l'affichage.
  'Aujourd’hui, qu’est-ce qui compte le plus pour vous ?': 'Today, what matters most to you?',
  'Et pour la suite, vous vous verriez bien…': 'And next, you could see yourself…',
  'Si votre couronne pouvait parler, elle réclamerait…': 'If your crown could speak, it would ask…',
  'Votre humeur du moment, c’est plutôt…': 'Your mood right now is more…',
  'Ce mois-ci, votre geste beauté prioritaire…': 'This month, your beauty priority…',
  'Pour votre prochaine venue, vous aimeriez…': 'For your next visit, you would like…',
  'La longueur': 'Length',
  'La protection': 'Protection',
  'Le changement': 'Change',
  'Garder ma ligne': 'Keeping my look',
  'Oser plus grand': 'Daring bigger',
  'Me faire surprendre': 'Being surprised',
  'De pousser encore': 'To keep growing',
  'De briller plus': 'To shine brighter',
  'D’être protégée': 'To be protected',
  'De tout changer': 'To change everything',
  'La continuité': 'Continuity',
  'L’audace': 'Boldness',
  'La surprise': 'Surprise',
  'Gagner en longueur': 'Gaining length',
  'Raviver l’éclat': 'Reviving radiance',
  'Fortifier': 'Strengthening',
  'Réinventer': 'Reinventing',
  'Rester fidèle à mon style': 'Staying true to my style',
  'Voir plus grand': 'Thinking bigger',
  'Qu’on me guide': 'Being guided',
  'On nourrit la racine, c’est là que la longueur se gagne.': 'We nourish the root. That is where length is won.',
  'Une lumière posée sur votre couronne, rien que pour la faire chanter.': 'A light set on your crown, simply to make it sing.',
  'On protège ce que vous avez bâti, mèche après mèche.': 'We protect what you have built, lock after lock.',
  'Le grand passage, une œuvre qui change tout.': 'The great passage, a work that changes everything.',

  // Votre rituel : l'accordéon.
  'Toute la carte de la Maison est ouverte.': 'The Maison’s full menu is open.',
  'Vous voyez la carte MND Kids, pour les têtes de {age} ans.': 'You are viewing the MND Kids menu, for {age}-year-olds.',
  'Vous voyez la carte MND Kids.': 'You are viewing the MND Kids menu.',
  'Revenir à MND Kids': 'Back to MND Kids',
  'Voir toute la carte': 'See the full menu',
  'LE PLATEAU TECHNIQUE · commun aux deux maisons': 'THE TECHNICAL FLOOR · shared by both houses',
  'à la Maison': 'at the Maison',
  'Série · {n} séances · prix unique': 'Series · {n} sessions · one price',
  'Voir les {n} autres prestations →': 'See the {n} other services →',
  'Aucune prestation choisie': 'No service chosen yet',
  'Ouvrez un atelier pour commencer': 'Open a collection to begin',
  '{n} prestations': '{n} services',
  '{n} prestation · {duree}': '{n} service · {duree}',
  '{n} prestations · {duree}': '{n} services · {duree}',
  'Continuer': 'Continue',
  'L’offre se prépare.': 'The menu is being prepared.',
  'La maison compose en ce moment ses rituels. Revenez très bientôt, votre couronne sera reçue comme il se doit.':
    'The Maison is composing its rituals right now. Come back very soon, your crown will be welcomed as it deserves.',
  'Revenir à l’accueil': 'Back to home',

  // Les prix.
  'Prix à la Maison': 'Price at the Maison',
  'à partir de {montant}': 'from {montant}',

  // Le moment : le récapitulatif.
  'Votre rituel': 'Your ritual',
  'Offre instantanée': 'Instant offer',
  'Remise famille · −{pct} % (hors forfaits) · −{montant}': 'Family discount · −{pct}% (packages excluded) · −{montant}',
  'Remise famille · −{pct} % · −{montant}': 'Family discount · −{pct}% · −{montant}',
  'Total connu': 'Known total',
  'Total': 'Total',
  'Ses prix, établis pour la couronne de {nom}': 'Prices set for {nom}’s crown',
  'Vos prix, établis pour votre couronne': 'Your prices, set for your crown',
  ' de {n} locks': ' of {n} locks',
  ' · longueur {longueur}': ' · length: {longueur}',
  // Les trois longueurs (shared/catalog.ts).
  'Court': 'Short',
  'Mi-Long': 'Mid-length',
  'Long ou haute densité': 'Long or high density',
  'Une prestation se règle à la Maison.': 'One service is settled at the Maison.',

  // Le moment : les séances d'une série.
  'Séance {n} sur {total}': 'Session {n} of {total}',
  'Choisissez la date et l’heure de cette séance.': 'Choose the date and time of this session.',
  'Reprendre la séance {n}, {jour} à {heure}': 'Change session {n}, {jour} at {heure}',
  'Touchez une séance pour la reprendre.': 'Tap a session to change it.',
  'La prestation est réglée une fois, les séances suivantes sont incluses · acompte sur la 1ʳᵉ.':
    'The service is paid once, the following sessions are included · deposit on the first.',
  'La prestation est réglée une fois, les séances suivantes sont incluses.':
    'The service is paid once, the following sessions are included.',

  // Le moment : la densité déclarée.
  'Vos locks, pour réserver le bon nombre d’heures': 'Your locks, so we book the right number of hours',
  'Au plus près, la Maison comptera précisément au fauteuil.': 'Your closest guess. The Maison will count precisely in the chair.',
  'Durée prévue : {duree}.': 'Expected time: {duree}.',

  // Le moment : le calendrier et l'heure.
  'Le jour': 'The day',
  'Jours avec créneaux libres · {duree}': 'Days with open time slots · {duree}',
  'L’heure · {jour}': 'The time · {jour}',
  'Votre heure': 'Your time',
  'Libre': 'Open',

  // Les quatre temps (./lib, QUATRE_TEMPS).
  'Les quatre temps': 'The four steps',
  'Purifier': 'Purify',
  'Laver en douceur, libérer le cuir chevelu.': 'Wash gently, free the scalp.',
  'Nourrir': 'Nourish',
  'Sceller': 'Seal',
  'Couronner': 'Crown',

  // Le panier collant du moment.
  'Séance {n} sur {total}, choisissez son moment': 'Session {n} of {total}, choose its moment',
  'Choisissez le jour, puis l’heure': 'Choose the day, then the time',
  'Continuer · acompte': 'Continue · deposit',

  // L'acompte.
  'Prestation à régler d’avance': 'Service paid in advance',
  'Acompte à envoyer': 'Deposit to send',
  'À la Maison': 'At the Maison',
  'Acompte réglé à la Maison': 'Deposit paid at the Maison',
  'Montant intégral de la prestation': 'Full amount of the service',
  '{pct} % de {montant}': '{pct}% of {montant}',
  'Acompte des prestations concernées': 'Deposit on the services concerned',
  'reste à la Maison': 'remainder at the Maison',
  'solde à la Maison': 'balance at the Maison',
  'Il tient votre créneau, et se déduit le jour même.': 'It holds your time slot, and comes off your bill on the day.',
  'Régler maintenant': 'Pay now',
  'Mobile Money · carte': 'Mobile Money · card',
  'Reste à la Maison': 'Balance at the Maison',
  'à convenir': 'to be agreed',
  'Paiement en cours…': 'Payment in progress…',
  'Payer l’acompte · {montant}': 'Pay the deposit · {montant}',
  'J’enverrai l’acompte moi-même': 'I’ll send the deposit myself',
  'Votre acompte est crédité dès la confirmation du paiement.': 'Your deposit is credited as soon as the payment is confirmed.',
  'Comment faire': 'How it works',
  '1 · Envoyez': '1 · Send',
  '2 · Au numéro de la Maison': '2 · To the Maison’s number',
  'communiqué sur WhatsApp': 'shared on WhatsApp',
  '3 · Puis annoncez l’envoi': '3 · Then let us know',
  'bouton ci-dessous': 'button below',
  'Envoyé par': 'Sent with',
  'Confirmer la réservation': 'Confirm the booking',
  'J’ai envoyé l’acompte · {montant}': 'I’ve sent the deposit · {montant}',
  '← Régler en ligne plutôt': '← Pay online instead',
  'La Maison vérifie la réception avant votre passage.': 'The Maison confirms receipt before your visit.',
  'Choisissez votre moyen d’envoi.': 'Choose how you are sending it.',

  // Confirmé.
  'Votre rituel est scellé.': 'Your ritual is sealed.',
  'Votre acompte est reçu, votre créneau est tenu.': 'Your deposit is received, your time slot is held.',
  'Votre créneau est tenu, la confirmation arrive sur WhatsApp.': 'Your time slot is held. Your confirmation is on its way on WhatsApp.',
  'La Maison vérifie votre acompte et confirme votre créneau très vite.': 'The Maison is checking your deposit and will confirm your time slot very soon.',
  'La Maison confirme votre créneau très vite, sur WhatsApp.': 'The Maison will confirm your time slot very soon, on WhatsApp.',
  'Ajoutez le rituel à votre calendrier : c’est lui qui vous rappellera sur votre téléphone, même l’app fermée.':
    'Add the ritual to your calendar: it will remind you on your phone, even with the app closed.',
  '{n} séances liées': '{n} linked sessions',
  'Séance {n}/{total}': 'Session {n}/{total}',
  'Acompte': 'Deposit',
  '{montant} · reçu': '{montant} · received',
  '{montant} · payé · vérification en cours': '{montant} · paid · being verified',
  '{montant} · à vérifier par la Maison': '{montant} · to be checked by the Maison',
  'Référence': 'Reference',
  'Statut': 'Status',
  'Confirmé': 'Confirmed',
  'En attente de la maison': 'Awaiting the Maison',
  'Ajouter au calendrier': 'Add to calendar',

  // Les messages de l'écriture (toasts) et la notification de la cliente.
  'Les horaires de la Maison se chargent, réessayez dans un instant.': 'The Maison’s opening hours are loading. Please try again in a moment.',
  'La Maison est fermée ces jours-là, choisissez d’autres dates.': 'The Maison is closed on those days. Please choose other dates.',
  'La Maison est fermée le {jour}, choisissez un autre jour.': 'The Maison is closed on {jour}. Please choose another day.',
  'C’est réservé': 'It’s booked',
  'Réservation transmise': 'Booking sent',
  '{quoi} · {jour} à {heure}. La Maison vous attend.': '{quoi} · {jour} at {heure}. The Maison awaits you.',
  '{quoi} · {jour} à {heure}, la maison confirmera.': '{quoi} · {jour} at {heure}. The Maison will confirm.',

  // Son calendrier (fichier .ics).
  'Séance {n}/{total} · Maison MND': 'Session {n}/{total} · Maison MND',
  'Maison MND, la maison vous attend.': 'Maison MND, the Maison awaits you.',
  'Fichier calendrier téléchargé, votre téléphone vous rappellera 2 h avant.': 'Calendar file downloaded. Your phone will remind you 2 hours before.',

  // Le paiement en ligne (messages de shared/kkiapay et kkiapay-widget).
  'Vérification impossible, la Maison vérifiera.': 'We could not verify it. The Maison will check.',
  'Le paiement n’a pas abouti.': 'The payment did not go through.',
  'Backend non configuré.': 'The service is not configured.',
  'Le montant reçu ne correspond pas à l’acompte attendu, la Maison vous contacte.':
    'The amount received does not match the expected deposit. The Maison will contact you.',
  'Le service de paiement est injoignable.': 'The payment service cannot be reached.',
  'Paiement sans référence, contactez la Maison.': 'Payment without a reference. Please contact the Maison.',
  'Paiement remplacé.': 'Payment replaced.',
  'Ce numéro Mobile Money n’est pas valide, vérifiez le pays et le numéro.':
    'This Mobile Money number is not valid. Please check the country and the number.',
  'Solde insuffisant sur le compte débité.': 'Insufficient balance on the account.',
  'Paiement refusé par l’opérateur.': 'Payment declined by the operator.',
  'Paiement bloqué par l’opérateur.': 'Payment blocked by the operator.',
  'Paiement annulé.': 'Payment cancelled.',
  'Le paiement n’a pas abouti, réessayez ou envoyez l’acompte vous-même.':
    'The payment did not go through. Try again, or send the deposit yourself.',
};
