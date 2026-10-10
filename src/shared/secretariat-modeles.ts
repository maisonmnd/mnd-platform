/* LES MODÈLES DU SECRÉTARIAT — 6 octobre 2026.

   Chaque modèle donne un objet, des formules et un corps de départ. Deux
   sortes de marques dans le texte :
   — `{entreprise}`, `{signataire}`, `{qualite}`, `{ville}` se remplissent
     seuls au rendu, d'après l'entité et le signataire choisis ;
   — `[À COMPLÉTER]` : ce que la main doit écrire. L'écran les compte et le
     dit avant la signature.

   LES MODÈLES JURIDIQUES SONT DES BASES, PAS DES CONSEILS (choix du
   6 octobre : « je les rédige, relus ensuite »). Ils portent `aRelire` :
   l'écran affiche « Modèle à faire relire par un juriste ou le comptable
   avant le premier usage », tant que la direction ne l'a pas levé. */

import type { Entite } from './secretariat-pur';

export type Famille = 'lettres' | 'clients' | 'fournisseurs' | 'equipe' | 'administration' | 'attestations' | 'notes' | 'contrats' | 'oapi' | 'juridiques' | 'perso' | 'libre';

export type Modele = {
  cle: string;
  famille: Famille;
  titre: string;
  objet: string;
  destinataire: string;
  /** Index dans APPELS, ou -1 : pas de formule d'appel (attestation, note). */
  appel: number;
  /** Index dans clotures(), ou -1 : pas de formule de politesse. */
  cloture: number;
  corps: string;
  aRelire?: boolean;
  /** Le modèle se remplit depuis une fiche de l'équipe. */
  depuisEquipe?: boolean;
};

export const FAMILLES: { cle: Famille; titre: string; dit: string }[] = [
  { cle: 'lettres', titre: 'Lettres officielles', dit: 'Moov, fournisseur, toute lettre au nom de l’entreprise' },
  { cle: 'clients', titre: 'Clients et paiements', dit: 'Relance, rappel avant mise en demeure, remerciement, réponse à une réclamation' },
  { cle: 'fournisseurs', titre: 'Fournisseurs et partenaires', dit: 'Demande de devis, commande, partenariat, résiliation' },
  { cle: 'equipe', titre: 'Équipe', dit: 'Convocation, avertissement, félicitations, fin de contrat, démission' },
  { cle: 'administration', titre: 'Administration et banque', dit: 'Ouverture de compte, attestation fiscale ou CNSS, changement d’adresse ou de gérance, autorisation' },
  { cle: 'attestations', titre: 'Attestations', dit: 'Travail, stage, formation, paiement' },
  { cle: 'notes', titre: 'Notes et comptes rendus', dit: 'Note interne, procès-verbal, règlement' },
  { cle: 'contrats', titre: 'Contrats', dit: 'Prestation, travail, avenant' },
  { cle: 'oapi', titre: 'Dossier OAPI', dit: 'Lettre de dépôt, pouvoir au mandataire' },
  { cle: 'juridiques', titre: 'Juridiques', dit: 'Procuration, mise en demeure, attestation sur l’honneur' },
  { cle: 'perso', titre: 'Lettre personnelle', dit: 'En votre nom, pas celui de l’entreprise' },
  { cle: 'libre', titre: 'Document libre', dit: 'Une page blanche à l’en-tête choisi' },
];

const A = '[À COMPLÉTER]';

export const MODELES: Modele[] = [
  /* ── Lettres officielles ── */
  {
    cle: 'lettre', famille: 'lettres', titre: 'Lettre officielle', objet: A, destinataire: `${A}\n${A}\nCotonou, Bénin`,
    appel: 0, cloture: 0,
    corps: `${A}`,
  },
  {
    cle: 'demande', famille: 'lettres', titre: 'Lettre de demande', objet: `Demande de ${A}`, destinataire: `${A}\nÀ l’attention de ${A}\nCotonou, Bénin`,
    appel: 0, cloture: 3,
    corps: `{entreprise}, établie à {ville}, souhaite ${A}.\n\nÀ cet effet, nous vous adressons ${A}.\n\nNous restons à votre disposition pour tout renseignement complémentaire.`,
  },
  {
    cle: 'reclamation', famille: 'lettres', titre: 'Réclamation', objet: `Réclamation concernant ${A}`, destinataire: `${A}\nService clientèle\nCotonou, Bénin`,
    appel: 0, cloture: 0,
    corps: `Le ${A}, nous avons constaté ${A}.\n\nMalgré ${A}, la situation n’a pas été résolue à ce jour.\n\nNous vous demandons de bien vouloir ${A} dans un délai de ${A} jours à compter de la réception du présent courrier.`,
  },
  /* ── Clients et paiements (6 octobre : « Clients et paiements ») ── */
  {
    cle: 'relance-paiement', famille: 'clients', titre: 'Relance de paiement', objet: `Relance : facture n° ${A} restant due`, destinataire: `${A}\n${A}\nCotonou, Bénin`,
    appel: 0, cloture: 3,
    corps: `Sauf erreur de notre part, la facture n° ${A} du ${A}, d’un montant de ${A} F CFA, reste à régler à ce jour.\n\nNous vous remercions de bien vouloir procéder à son règlement d’ici le ${A}, par ${A}.\n\nSi ce règlement a été fait entre-temps, merci de ne pas tenir compte de ce courrier.`,
  },
  {
    cle: 'rappel-avant-demeure', famille: 'clients', titre: 'Dernier rappel avant mise en demeure', objet: `Dernier rappel : facture n° ${A}`, destinataire: `${A}\n${A}\nCotonou, Bénin`,
    appel: 0, cloture: 0, aRelire: true,
    corps: `Malgré notre relance du ${A}, la facture n° ${A} d’un montant de ${A} F CFA demeure impayée.\n\nNous vous demandons de régler cette somme sous ${A} jours à compter de la réception du présent courrier.\n\nÀ défaut, nous serons contraints de vous adresser une mise en demeure, préalable à toute procédure de recouvrement.`,
  },
  {
    cle: 'remerciement-cliente', famille: 'clients', titre: 'Lettre de remerciement', objet: 'Avec nos remerciements', destinataire: `${A}\nCotonou, Bénin`,
    appel: 7, cloture: 5,
    corps: `Nous tenons à vous remercier pour ${A}.\n\nVotre confiance nous honore, et c’est un plaisir de vous accueillir à {entreprise}.\n\nNous restons à votre écoute pour ${A}.`,
  },
  {
    cle: 'reponse-reclamation', famille: 'clients', titre: 'Réponse à une réclamation', objet: `Votre réclamation du ${A}`, destinataire: `${A}\nCotonou, Bénin`,
    appel: 0, cloture: 0,
    corps: `Nous avons bien reçu votre réclamation du ${A} concernant ${A}, et nous vous remercions de nous l’avoir signalée.\n\nAprès vérification, ${A}.\n\nPour y remédier, nous vous proposons ${A}.\n\nNous restons à votre disposition pour en parler de vive voix.`,
  },
  /* ── Fournisseurs et partenaires (6 octobre, ajouté à la demande) ── */
  {
    cle: 'demande-devis', famille: 'fournisseurs', titre: 'Demande de devis', objet: `Demande de devis : ${A}`, destinataire: `${A}\nService commercial\nCotonou, Bénin`,
    appel: 0, cloture: 3,
    corps: `{entreprise} souhaite recevoir votre meilleure offre pour ${A}.\n\nQuantités et caractéristiques : ${A}.\n\nMerci de préciser les prix unitaires, les délais de livraison, les conditions de paiement et la durée de validité de votre offre. Nous souhaiterions recevoir votre devis avant le ${A}.`,
  },
  {
    cle: 'commande', famille: 'fournisseurs', titre: 'Lettre de commande', objet: `Commande suivant votre devis n° ${A}`, destinataire: `${A}\nService commercial\nCotonou, Bénin`,
    appel: 0, cloture: 0,
    corps: `Suite à votre devis n° ${A} du ${A}, nous vous passons commande de : ${A}.\n\nMontant total convenu : ${A} F CFA, payable ${A}.\n\nLivraison souhaitée le ${A}, à ${A}. Merci de nous confirmer la bonne réception de cette commande.`,
  },
  {
    cle: 'partenariat', famille: 'fournisseurs', titre: 'Proposition de partenariat', objet: `Proposition de partenariat avec {entreprise}`, destinataire: `${A}\nÀ l’attention de ${A}\nCotonou, Bénin`,
    appel: 0, cloture: 4,
    corps: `{entreprise} ${A}.\n\nNous serions heureux de construire avec vous un partenariat autour de ${A}.\n\nConcrètement, nous vous proposons ${A}. En retour, ${A}.\n\nNous serions ravis d’en parler lors d’une rencontre, à la date qui vous conviendra.`,
  },
  {
    cle: 'resiliation', famille: 'fournisseurs', titre: 'Résiliation d’un contrat ou d’un abonnement', objet: `Résiliation du contrat n° ${A}`, destinataire: `${A}\nService clientèle\nCotonou, Bénin`,
    appel: 0, cloture: 0, aRelire: true,
    corps: `Par la présente, nous vous informons de notre décision de résilier le contrat n° ${A}, souscrit le ${A}, conformément à ${A}.\n\nCette résiliation prendra effet le ${A}, à l’issue du préavis prévu au contrat.\n\nNous vous remercions de nous adresser la confirmation de cette résiliation, ainsi que ${A}.`,
  },
  /* ── Équipe (6 octobre : « Équipe ») ── */
  {
    cle: 'convocation-entretien', famille: 'equipe', titre: 'Convocation à un entretien', objet: 'Convocation à un entretien', destinataire: `[NOM]\n[POSTE]`,
    appel: 0, cloture: 0, aRelire: true, depuisEquipe: true,
    corps: `Nous vous prions de vous présenter le ${A} à ${A} heures, à ${A}, pour un entretien avec {signataire}, {qualite}, au sujet de ${A}.\n\nVous pouvez vous faire assister lors de cet entretien par une personne de votre choix appartenant au personnel.`,
  },
  {
    cle: 'avertissement', famille: 'equipe', titre: 'Avertissement', objet: 'Avertissement', destinataire: `[NOM]\n[POSTE]`,
    appel: 0, cloture: 0, aRelire: true, depuisEquipe: true,
    corps: `Le ${A}, ${A}.\n\nCe comportement est contraire à ${A}, et nous ne pouvons l’accepter.\n\nNous vous adressons par la présente un avertissement, qui sera versé à votre dossier. Nous vous demandons de veiller à ce que cela ne se reproduise pas.`,
  },
  {
    cle: 'felicitations', famille: 'equipe', titre: 'Lettre de félicitations', objet: 'Félicitations', destinataire: `[NOM]\n[POSTE]`,
    appel: 7, cloture: 5, depuisEquipe: true,
    corps: `Au nom de {entreprise}, nous tenons à vous féliciter pour ${A}.\n\nVotre engagement et la qualité de votre travail sont remarqués, et ils font la réputation de la Maison.\n\nNous vous remercions, et nous comptons sur vous pour la suite.`,
  },
  {
    cle: 'certificat-fin-contrat', famille: 'equipe', titre: 'Certificat de travail (fin de contrat)', objet: 'Certificat de travail', destinataire: '',
    appel: -1, cloture: -1, aRelire: true, depuisEquipe: true,
    corps: `Je soussigné(e) {signataire}, {qualite} de {entreprise}, certifie que [NOM] a été employé(e) au sein de notre structure du [DATE D’ENTRÉE] au ${A}, en qualité de [POSTE].\n\n[NOM] nous quitte libre de tout engagement.\n\nLe présent certificat lui est délivré pour servir et valoir ce que de droit.`,
  },
  {
    cle: 'acceptation-demission', famille: 'equipe', titre: 'Acceptation de démission', objet: 'Votre démission', destinataire: `[NOM]\n[POSTE]`,
    appel: 0, cloture: 0, aRelire: true, depuisEquipe: true,
    corps: `Nous accusons réception de votre lettre de démission du ${A}.\n\nConformément à ${A}, votre préavis prendra fin le ${A}, date à laquelle votre contrat prendra fin.\n\nVotre certificat de travail et votre solde de tout compte vous seront remis à cette date. Nous vous remercions pour votre travail au sein de la Maison.`,
  },
  /* ── Administration et banque (6 octobre : « Administration et banque ») ── */
  {
    cle: 'ouverture-compte', famille: 'administration', titre: 'Demande d’ouverture de compte', objet: 'Demande d’ouverture de compte', destinataire: `${A}\nÀ l’attention du Service Entreprises\nCotonou, Bénin`,
    appel: 0, cloture: 3,
    corps: `{entreprise} souhaite ouvrir un compte ${A} auprès de votre établissement, afin de ${A}.\n\nVous trouverez ci-joint les pièces suivantes : ${A}.\n\nNous restons à votre disposition pour tout document complémentaire.`,
  },
  {
    cle: 'attestation-fiscale', famille: 'administration', titre: 'Demande d’attestation fiscale ou CNSS', objet: `Demande d’attestation ${A}`, destinataire: `${A}\nCotonou, Bénin`,
    appel: 0, cloture: 0,
    corps: `{entreprise}, immatriculée sous le numéro ${A}, sollicite la délivrance d’une attestation ${A}.\n\nCette attestation est demandée pour ${A}.\n\nVous trouverez ci-joint ${A}.`,
  },
  {
    cle: 'changement-adresse', famille: 'administration', titre: 'Changement d’adresse ou de gérance', objet: `Changement ${A}`, destinataire: `${A}\nCotonou, Bénin`,
    appel: 0, cloture: 0, aRelire: true,
    corps: `Nous vous informons qu’à compter du ${A}, ${A}.\n\nNous vous remercions de bien vouloir mettre à jour nos informations dans vos registres.\n\nVous trouverez ci-joint ${A}.`,
  },
  {
    cle: 'demande-autorisation', famille: 'administration', titre: 'Demande d’autorisation', objet: `Demande d’autorisation ${A}`, destinataire: `${A}\nCotonou, Bénin`,
    appel: 0, cloture: 1,
    corps: `{entreprise} sollicite l’autorisation de ${A}, le ${A}, à ${A}.\n\nCette demande est motivée par ${A}.\n\nNous nous engageons à ${A}.`,
  },
  /* ── Attestations ── */
  {
    cle: 'attestation-travail', famille: 'attestations', titre: 'Attestation de travail', objet: 'Attestation de travail', destinataire: '',
    appel: -1, cloture: -1, depuisEquipe: true,
    corps: `Je soussigné(e) {signataire}, {qualite} de {entreprise}, atteste que [NOM] est employé(e) au sein de notre structure depuis le [DATE D’ENTRÉE], en qualité de [POSTE], sous contrat [CONTRAT].\n\nLa présente attestation lui est délivrée à sa demande, pour servir et valoir ce que de droit.`,
  },
  {
    cle: 'attestation-stage', famille: 'attestations', titre: 'Attestation de stage', objet: 'Attestation de stage', destinataire: '',
    appel: -1, cloture: -1, depuisEquipe: true,
    corps: `Je soussigné(e) {signataire}, {qualite} de {entreprise}, atteste que [NOM] a effectué un stage au sein de notre structure du ${A} au ${A}, en qualité de [POSTE].\n\nDurant ce stage, ${A}.\n\nLa présente attestation lui est délivrée pour servir et valoir ce que de droit.`,
  },
  {
    cle: 'attestation-formation', famille: 'attestations', titre: 'Attestation de formation', objet: 'Attestation de formation', destinataire: '',
    appel: -1, cloture: -1,
    corps: `Je soussigné(e) {signataire}, {qualite} de {entreprise}, atteste que ${A} a suivi la formation « ${A} » du ${A} au ${A}, pour une durée de ${A} heures.\n\nLa présente attestation lui est délivrée pour servir et valoir ce que de droit.`,
  },
  {
    cle: 'attestation-paiement', famille: 'attestations', titre: 'Attestation de paiement', objet: 'Attestation de paiement', destinataire: '',
    appel: -1, cloture: -1,
    corps: `Je soussigné(e) {signataire}, {qualite} de {entreprise}, atteste avoir reçu de ${A} la somme de ${A} francs CFA (${A} F CFA), le ${A}, au titre de ${A}.\n\nLa présente attestation est délivrée pour servir et valoir ce que de droit.`,
  },
  /* ── Notes et comptes rendus ── */
  {
    cle: 'note-interne', famille: 'notes', titre: 'Note interne', objet: `Note à toute l’équipe : ${A}`, destinataire: 'À toute l’équipe',
    appel: -1, cloture: -1,
    corps: `À compter du ${A}, ${A}.\n\nCette décision s’applique à ${A}.\n\nPour toute question, adressez-vous à {signataire}.`,
  },
  {
    cle: 'proces-verbal', famille: 'notes', titre: 'Procès-verbal de réunion', objet: `Procès-verbal de la réunion du ${A}`, destinataire: '',
    appel: -1, cloture: -1,
    corps: `Présents : ${A}.\nAbsents excusés : ${A}.\n\nOrdre du jour :\n1. ${A}\n2. ${A}\n\nDécisions :\n1. ${A}\n2. ${A}\n\nProchaine réunion : le ${A}.`,
  },
  {
    cle: 'reglement-interieur', famille: 'notes', titre: 'Règlement intérieur', objet: 'Règlement intérieur', destinataire: 'À toute l’équipe',
    appel: -1, cloture: -1, aRelire: true,
    corps: `Article 1. Horaires. Les horaires de travail sont fixés de ${A} à ${A}, du ${A} au ${A}.\n\nArticle 2. Ponctualité et absences. Toute absence est signalée à la direction au plus tôt, et justifiée sous ${A} jours.\n\nArticle 3. Tenue et hygiène. ${A}.\n\nArticle 4. Confidentialité. Les informations sur les clientes et la Maison ne sortent pas de la Maison.\n\nArticle 5. Entrée en vigueur. Le présent règlement s’applique à compter du ${A}.`,
  },
  /* ── Contrats ── */
  {
    cle: 'contrat-prestation', famille: 'contrats', titre: 'Contrat de prestation de services', objet: 'Contrat de prestation de services', destinataire: '',
    appel: -1, cloture: -1, aRelire: true,
    corps: `Entre {entreprise}, représentée par {signataire}, {qualite}, ci-après « le Client »,\n\nEt ${A}, ${A}, ci-après « le Prestataire »,\n\nIl a été convenu ce qui suit.\n\nArticle 1. Objet. Le Prestataire s’engage à réaliser ${A}.\n\nArticle 2. Durée. Le présent contrat prend effet le ${A} pour une durée de ${A}.\n\nArticle 3. Prix et paiement. Le prix est fixé à ${A} F CFA, payable ${A}.\n\nArticle 4. Obligations. Le Prestataire exécute la prestation avec soin et dans les délais ; le Client fournit ${A}.\n\nArticle 5. Résiliation. En cas de manquement, chaque partie peut résilier le contrat après mise en demeure restée sans effet pendant ${A} jours.\n\nArticle 6. Litiges. À défaut d’accord amiable, les tribunaux de Cotonou sont compétents.\n\nFait à {ville}, en deux exemplaires originaux.`,
  },
  {
    cle: 'contrat-travail', famille: 'contrats', titre: 'Contrat de travail', objet: 'Contrat de travail à durée [DÉTERMINÉE ou INDÉTERMINÉE]', destinataire: '',
    appel: -1, cloture: -1, aRelire: true, depuisEquipe: true,
    corps: `Entre {entreprise}, représentée par {signataire}, {qualite}, ci-après « l’Employeur »,\n\nEt [NOM], ci-après « le Salarié »,\n\nIl a été convenu ce qui suit, conformément au Code du travail de la République du Bénin.\n\nArticle 1. Engagement. Le Salarié est engagé en qualité de [POSTE] à compter du [DATE D’ENTRÉE].\n\nArticle 2. Période d’essai. ${A}.\n\nArticle 3. Rémunération. Le Salarié perçoit un salaire mensuel brut de ${A} F CFA.\n\nArticle 4. Lieu et horaires. ${A}.\n\nArticle 5. Obligations. Le Salarié respecte le règlement intérieur et la confidentialité des informations de la Maison.\n\nArticle 6. Rupture. ${A}.\n\nFait à {ville}, en deux exemplaires originaux.`,
  },
  {
    cle: 'avenant', famille: 'contrats', titre: 'Avenant au contrat', objet: `Avenant n° ${A} au contrat du ${A}`, destinataire: '',
    appel: -1, cloture: -1, aRelire: true,
    corps: `Entre {entreprise}, représentée par {signataire}, {qualite},\n\nEt ${A},\n\nIl est convenu de modifier le contrat signé le ${A} comme suit.\n\nArticle 1. ${A}.\n\nArticle 2. Les autres clauses du contrat restent inchangées.\n\nFait à {ville}, en deux exemplaires originaux.`,
  },
  /* ── Dossier OAPI ── */
  {
    cle: 'oapi-depot', famille: 'oapi', titre: 'Lettre de dépôt de marque', objet: 'Dépôt de marque auprès de l’OAPI', destinataire: 'Organisation Africaine de la Propriété Intellectuelle\nPar l’intermédiaire de la Structure Nationale de Liaison\nCotonou, Bénin',
    appel: 0, cloture: 1, aRelire: true,
    corps: `Nous avons l’honneur de solliciter l’enregistrement de la marque « ${A} » au nom de {entreprise}.\n\nLa marque est demandée dans la ou les classes ${A} de la classification de Nice, pour les produits et services suivants : ${A}.\n\nVous trouverez ci-joint ${A}.`,
  },
  {
    cle: 'oapi-pouvoir', famille: 'oapi', titre: 'Pouvoir au mandataire', objet: 'Pouvoir', destinataire: '',
    appel: -1, cloture: -1, aRelire: true,
    corps: `Je soussigné(e) {signataire}, {qualite} de {entreprise}, donne pouvoir à ${A}, mandataire agréé auprès de l’OAPI, demeurant ${A},\n\nde déposer en notre nom et pour notre compte la demande d’enregistrement de la marque « ${A} », d’accomplir toutes les formalités qui s’y rapportent, et de recevoir toute correspondance à ce sujet.\n\nFait à {ville}, pour servir et valoir ce que de droit.`,
  },
  /* ── Juridiques ── */
  {
    cle: 'procuration', famille: 'juridiques', titre: 'Procuration', objet: 'Procuration', destinataire: '',
    appel: -1, cloture: -1, aRelire: true,
    corps: `Je soussigné(e) {signataire}, {qualite} de {entreprise}, donne procuration à ${A}, titulaire de la pièce d’identité n° ${A},\n\npour ${A} en mon nom et pour mon compte, le ${A}.\n\nFait à {ville}, pour servir et valoir ce que de droit.`,
  },
  {
    cle: 'mise-en-demeure', famille: 'juridiques', titre: 'Mise en demeure', objet: 'Mise en demeure', destinataire: `${A}\n${A}\nCotonou, Bénin`,
    appel: 0, cloture: 0, aRelire: true,
    corps: `Par la présente, nous vous mettons en demeure de ${A}, conformément à ${A}.\n\nMalgré nos relances du ${A}, cette obligation n’a pas été exécutée.\n\nÀ défaut d’exécution dans un délai de ${A} jours à compter de la réception de la présente, nous nous réservons le droit d’engager toute procédure utile, sans autre avis.`,
  },
  {
    cle: 'honneur', famille: 'juridiques', titre: 'Attestation sur l’honneur', objet: 'Attestation sur l’honneur', destinataire: '',
    appel: -1, cloture: -1, aRelire: true,
    corps: `Je soussigné(e) {signataire}, {qualite} de {entreprise}, atteste sur l’honneur que ${A}.\n\nJe suis informé(e) qu’une fausse déclaration m’expose aux sanctions prévues par la loi.\n\nFait à {ville}, pour servir et valoir ce que de droit.`,
  },
  /* ── Lettre personnelle ── */
  {
    cle: 'lettre-perso', famille: 'perso', titre: 'Lettre personnelle', objet: A, destinataire: `${A}\n${A}\nCotonou, Bénin`,
    appel: 0, cloture: 0,
    corps: `${A}`,
  },
  /* ── Libre ── */
  {
    cle: 'libre', famille: 'libre', titre: 'Document', objet: '', destinataire: '',
    appel: -1, cloture: -1,
    corps: '',
  },
];

export const modeleDe = (cle: string): Modele => MODELES.find((m) => m.cle === cle) ?? MODELES[0];

/* LES PIÈCES D'EMPLOYEUR — relecture du 10 octobre 2026. Depuis que Maison
   MND a son registre, une pièce faite à son nom porte au pied le RCCM et
   l'IFU de l'établissement immatriculé le 9 octobre. Or l'employeur de
   l'équipe n'a pas changé (décision attendue du comptable) : une attestation
   de travail sous Maison MND aurait affirmé un emploi par un établissement
   de la veille, contre les déclarations sociales. Ces pièces se font donc au
   nom de l'EMPLOYEUR réglé dans Paramètres › Identité (le même qui signe le
   règlement intérieur et les lettres du prêt) : ACIA 1 tant qu'il dit ACIA 1,
   Maison MND le jour où le comptable l'aura décidé. Les autres pièces
   (attestation de stage, de formation, de paiement, contrats de prestation)
   restent au nom choisi. */
export const PIECES_D_EMPLOYEUR: readonly string[] = [
  'convocation-entretien', 'avertissement', 'felicitations', 'certificat-fin-contrat', 'acceptation-demission',
  'attestation-travail', 'contrat-travail',
];
/** L'entité d'une pièce nouvelle : celle choisie, sauf une pièce d'employeur
    demandée au nom de Maison MND alors que l'employeur réglé est ACIA 1. */
export function entiteDeLaPiece(entite: Entite, cle: string, employeur: string): Entite {
  if (entite !== 'mnd' || !PIECES_D_EMPLOYEUR.includes(cle)) return entite;
  return /^\s*(?:ets\.?\s+)?acia\s*1\b/i.test(employeur ?? '') ? 'acia' : entite;
}

/** Les marques « à compléter » restées dans un texte. */
export const aCompleter = (...textes: string[]): number =>
  textes.reduce((n, t) => n + ((t ?? '').match(/\[[^\]\n]{2,60}\]/g) ?? []).length, 0);

/** Remplit les jetons au rendu. */
export function remplis(texte: string, v: { entreprise: string; signataire: string; qualite: string; ville: string }): string {
  return (texte ?? '')
    .replace(/\{entreprise\}/g, v.entreprise)
    .replace(/\{signataire\}/g, v.signataire)
    .replace(/\{qualite\}/g, v.qualite)
    .replace(/\{ville\}/g, v.ville);
}

/** Remplit depuis une fiche de l'équipe : nom, poste, entrée, contrat. */
export function remplisDepuisEquipe(texte: string, m: { name: string; role?: string; entree?: string; contrat?: string }): string {
  return (texte ?? '')
    .replace(/\[NOM\]/g, m.name)
    .replace(/\[POSTE\]/g, m.role || '[POSTE]')
    .replace(/\[DATE D’ENTRÉE\]/g, m.entree || '[DATE D’ENTRÉE]')
    .replace(/\[CONTRAT\]/g, m.contrat || '[CONTRAT]');
}
