/* LA PORTE DES MODÈLES — 4 novembre 2026. « Opale garde la porte de tous
   les modèles Meta automatiques » (Yéman). Chaque modèle WhatsApp qui part
   SEUL passe désormais une porte, juste avant l'envoi.

   CE QUI L'A DÉCIDÉE. Le 2 novembre 2026, le rappel de la veille
   « …, votre rendez-vous est demain à 17 h 30. » est parti deux fois à deux
   clientes, à 17 h 11 puis à 18 h 11. rappels-j1 passe deux fois par soir
   (le premier et le second passage, une heure d'écart) et redépose la ligne
   env-<rdv>-whatsapp qu'il trouve en « échec » ou « périmé ». Plusieurs
   chemins y mènent : l'accusé « failed » de Meta (whatsapp-webhook remet la
   ligne en échec), une ligne « en-envoi » rendue « échec » après dix minutes
   alors que Meta l'avait acceptée (envois-partent), un poste du Trône qui
   repousse une copie ancienne de la ligne, un second rendez-vous pour la
   même personne. Le même jour, « Monsieur A. » a salué une dame.

   LA RÈGLE tient à la porte de la salle d'attente. `envois-partent` est la
   sortie de presque tous les modèles automatiques : il prend la ligne en
   main, relit le rendez-vous, puis demande ici, avant d'appeler Meta :
     (a) QUI ENVOIE ? Seuls les envois automatiques passent toute la porte.
         Une campagne (voulue par la Maison, partie sur un feu vert) ne
         connaît que (b). Un envoi de l'équipe, ou une ligne qu'une main a
         fait partir « maintenant », ne se juge jamais : la main a choisi.
     (b) JAMAIS DEUX FOIS : le même événement déjà parti dans les vingt
         dernières heures, au journal ou au fil, ne repart pas. UN FOYER,
         UN MESSAGE (4 novembre 2026) : un message qui nomme plusieurs têtes
         d'un foyer (`apptIds`, `clientIds`, src/shared/message-du-foyer-pur)
         couvre chacune ; une autre ligne pour une tête déjà nommée ne
         repart pas.
     (c) PAS DE RAPPEL À QUI VIENT DE CONFIRMER : « Oui, je viens » posé,
         une confirmation partie il y a moins de 24 heures, ou un message
         d'elle depuis le dépôt (la conversation est ouverte : l'équipe ou
         Opale y répond), et le rappel se tait.
     (d) RIEN POUR UN RENDEZ-VOUS qui n'existe plus, annulé, honoré, passé ou
         déplacé depuis le dépôt.
     (e) LA CIVILITÉ DE LA FICHE : l'appel du modèle se corrige quand la
         fiche dit autre chose, et ne s'invente jamais quand elle ne dit rien.
   La nuit, rien ne part : les heures calmes de la salle le font déjà, la
   porte n'y touche pas.

   Une ligne retenue devient « périmé », avec le détail « retenu par Opale :
   <motif> » : le Trône montre pourquoi, et rappels-j1 ne la redépose pas.

   Ce bloc vit à l'identique dans `envois-partent`, qui n'importe rien du
   dépôt ; le banc des douze lunes compare les copies, et
   scripts/verifie-la-porte-des-modeles éprouve chaque règle dans les deux
   sens. Module PUR : ni Supabase, ni DOM, ni horloge (l'heure se donne).
   Il lit les têtes nommées par `tetesNommees` et `fichesNommees`, du bloc
   ⟨message-du-foyer⟩ : envois-partent porte les deux copies. Depuis le
   7 novembre 2026, il écrit le prénom d'usage par `prenomDUsage` (le bloc
   ⟨prenom-d-usage⟩ de shared/civilite), qu'envois-partent porte aussi. */
import { fichesNommees, tetesNommees } from './message-du-foyer-pur';
import { prenomDUsage } from './civilite';

/* ⟨porte-des-modeles⟩ */
/** La marque d'une ligne retenue par la porte. Le Trône la montre dans le
    détail ; rappels-j1 la lit et ne redépose pas la ligne. */
export const MARQUE_D_OPALE = 'retenu par Opale';
export const detailDOpale = (motif: string): string => `${MARQUE_D_OPALE} : ${motif}`;
export const retenuParOpale = (d: { detail?: unknown } | null | undefined): boolean => String(d?.detail ?? '').startsWith(MARQUE_D_OPALE);

/** Vingt heures : deux passages du même soir tombent dedans, le rappel du
    lendemain soir (24 heures plus tard) n'y tombe jamais. */
export const JAMAIS_DEUX_FOIS_MS = 20 * 3_600_000;
/** Une confirmation partie depuis moins de 24 heures vaut rappel. */
export const CONFIRMATION_RECENTE_MS = 24 * 3_600_000;

/** QUI ENVOIE, d'après `colis.parQui` : ce que chaque fonction écrit. */
export const PAR_QUI_AUTOMATIQUES: readonly string[] = [
  'la Maison, automatiquement', 'Le Trône', 'Assistant Maison', 'Gérard', 'Le Trône · ambassadrices',
];
export const PAR_QUI_DES_CAMPAGNES: readonly string[] = ['Le Trône · campagne'];

export type FamilleDeModele =
  | 'rappel-j1' | 'confirmation' | 'reprise-j3' | 'point-apres' | 'point-avant' | 'avis-google'
  | 'rappel-echeance' | 'prix-revu' | 'relance-facture' | 'fete-de-couronne' | 'fin-de-paquet'
  | 'merci-marraine' | 'perle-garder' | 'perle-avant' | 'perle' | 'campagne';

export type EntreeDuRegistre = {
  famille: FamilleDeModele;
  /** Le `type` de la ligne d'envoi ; pour Perle, aussi son `genre`. */
  type: string;
  genres?: readonly string[];
  /** Les noms chez Meta, tels que le code les connaît (le secret peut en nommer un autre). */
  modeles: readonly string[];
  /** Les secrets qui nomment le modèle ; vide quand le nom est écrit dans le code. */
  secrets: readonly string[];
  /** Qui dépose la ligne dans la salle d'attente. */
  depose: string;
  pourQuoi: string;
  quand: string;
  /** Le {{n}} du corps qui porte l'appel (« Mme Adjoa »), lu dans le code ;
      null quand le code ne le dit pas. */
  appel: number | null;
  /** Lié à un rendez-vous : (d) s'applique quand la ligne le nomme. */
  rdv: boolean;
  /** Un rappel : (c) s'applique. */
  rappel: boolean;
  /** Une fois par tête et par jour : un second message du même modèle à la
      même fiche est un doublon même si son texte diffère (la civilité
      corrigée entre deux passages, un second rendez-vous). Sinon, seul le
      même texte fait un doublon (deux formules, deux enfants, deux mercis). */
  unParTete: boolean;
  /** 'toutes' : (a) à (e) ; 'jamais-deux-fois' : (b) seulement. */
  porte: 'toutes' | 'jamais-deux-fois';
};

/** LE REGISTRE : chaque famille de modèles automatiques, lue dans le code
    qui la dépose (4 novembre 2026). */
export const REGISTRE_DES_MODELES: readonly EntreeDuRegistre[] = [
  {
    famille: 'rappel-j1', type: 'rappel-j1', modeles: ['rappel_rdv'], secrets: ['WA_TEMPLATE'], depose: 'rappels-j1',
    pourQuoi: 'Le rappel de la veille : « Bonjour {{1}}, petit rappel de la maison : votre rendez-vous est prévu demain à {{2}}. » {{1}} l’appel, {{2}} l’heure.',
    quand: 'La veille du rendez-vous, aux heures réglées au Trône (18 h, puis 19 h sans réglage), jamais pour celle qui a déjà dit « Oui, je viens ».',
    appel: 1, rdv: true, rappel: true, unParTete: true, porte: 'toutes',
  },
  {
    famille: 'confirmation', type: 'confirmation', modeles: ['confirmation_rdv', 'confirmation_rdv_liens'], secrets: ['WA_TEMPLATE_CONF', 'WA_TEMPLATE_CONF_LIENS'],
    depose: 'confirmation-rdv, et assistants-maison qui dépose la même pièce',
    pourQuoi: 'La confirmation d’un rendez-vous posé par la Maison : « Bonjour {{1}}, c’est confirmé : votre rendez-vous est retenu {{2}}. » ; le modèle à liens ajoute {{3}} la référence et deux boutons, l’ancien reste son repli.',
    quand: 'Dès que le rendez-vous est confirmé. Celle qui réserve elle-même (Ma Couronne, WhatsApp) la reçoit sans salle d’attente.',
    appel: 1, rdv: true, rappel: false, unParTete: false, porte: 'toutes',
  },
  {
    famille: 'reprise-j3', type: 'reprise-j3', modeles: ['reprise_proposee'], secrets: ['WA_TEMPLATE_REPRISE'], depose: 'rappels-j1',
    pourQuoi: 'La reprise posée à la caisse, proposée avec deux boutons, « Je confirme » et « Un autre moment » : {{1}} l’appel, {{2}} le moment, {{3}} les gestes.',
    quand: 'Trois jours avant la reprise, à chaque passage de rappels-j1.',
    appel: 1, rdv: true, rappel: true, unParTete: false, porte: 'toutes',
  },
  {
    famille: 'point-apres', type: 'point-apres', modeles: ['point_apres_seance'], secrets: ['WA_TEMPLATE_POINT_APRES'], depose: 'rappels-j1',
    pourQuoi: 'Une semaine après une séance honorée, « comment vont vos locks ? » : {{1}} l’appel, {{2}} le jour de la séance. La ligne ne nomme pas sa séance comme rendez-vous.',
    quand: 'Sept jours après la séance, pour les clientes sans Ma Couronne.',
    appel: 1, rdv: false, rappel: false, unParTete: false, porte: 'toutes',
  },
  {
    famille: 'point-avant', type: 'point-avant', modeles: ['point_avant_seance'], secrets: ['WA_TEMPLATE_POINT_AVANT'], depose: 'rappels-j1',
    pourQuoi: 'Une semaine avant la séance suivante : un soin, une coloration, une coiffure, autre chose ? {{1}} l’appel, {{2}} le jour.',
    quand: 'Sept jours avant la séance, pour les clientes sans Ma Couronne.',
    appel: 1, rdv: true, rappel: true, unParTete: false, porte: 'toutes',
  },
  {
    famille: 'avis-google', type: 'avis-google', modeles: ['avis_google'], secrets: ['WA_TEMPLATE_AVIS'], depose: 'avis-google',
    pourQuoi: 'La demande d’avis après une première venue : {{1}} l’appel, {{2}} le lien.',
    quand: 'Le jour où la première venue est soldée, une demande au plus par période.',
    appel: 1, rdv: false, rappel: false, unParTete: true, porte: 'toutes',
  },
  {
    famille: 'rappel-echeance', type: 'rappel-echeance', modeles: ['rappel_echeance_veille'], secrets: ['WA_TEMPLATE_RAPPEL_ECHEANCE'], depose: 'rappels-d-echeance',
    pourQuoi: 'La veille d’une échéance ou d’une lune d’une formule : {{1}} l’appel, {{2}} le jour, {{3}} laquelle, {{4}} la formule, {{5}} le montant.',
    quand: 'La veille de l’échéance, de 9 h à 19 h 30 ; à celle qui paie pour son foyer quand la tête n’a pas de numéro.',
    appel: 1, rdv: false, rappel: false, unParTete: false, porte: 'toutes',
  },
  {
    famille: 'prix-revu', type: 'prix-revu', modeles: ['prix_revu_apres_comptage'], secrets: ['WA_TEMPLATE_PRIX_REVU'], depose: 'rappels-d-echeance',
    pourQuoi: 'Le prix d’une formule revu après le comptage : {{1}} l’appel, puis le jour, le calibre, la formule, l’ancien prix, le nouveau, l’effet.',
    quand: 'Quand un prix revu attend d’être dit, de 9 h à 19 h 30.',
    appel: 1, rdv: false, rappel: false, unParTete: false, porte: 'toutes',
  },
  {
    famille: 'relance-facture', type: 'relance-facture', modeles: ['rappel_de_reglement', 'rappel_du_point'], secrets: ['WA_TEMPLATE_RELANCE', 'WA_TEMPLATE_RAPPEL_DU_POINT'],
    depose: 'relances-factures',
    pourQuoi: 'La relance d’une facture qui attend son règlement, ou le rappel du point de plusieurs : {{1}} l’appel, puis le jour ou le total, le reste ; un bouton « Régler ».',
    quand: 'J+1, J+3, J+7 et J+14 après la facture, jamais le dimanche, un rappel par payeur et par jour.',
    appel: 1, rdv: false, rappel: false, unParTete: true, porte: 'toutes',
  },
  {
    famille: 'fete-de-couronne', type: 'fete-de-couronne', modeles: ['fete_de_couronne'], secrets: ['WA_TEMPLATE_FETE_DE_COURONNE'], depose: 'fete-de-couronne',
    pourQuoi: 'L’anniversaire de la première couronne d’un enfant du Club : {{1}} l’appel du parent qui paie, {{2}} l’enfant, {{3}} ses années, {{4}} le jour.',
    quand: 'Le jour anniversaire de sa Première Couronne.',
    appel: 1, rdv: false, rappel: false, unParTete: false, porte: 'toutes',
  },
  {
    famille: 'fin-de-paquet', type: 'fin-de-paquet', modeles: ['fin_de_paquet'], secrets: [], depose: 'le Trône (shared/fin-de-paquet)',
    pourQuoi: 'Un paquet de séances qui touche à sa fin : {{1}} l’appel, {{2}} ce qui reste, {{3}} la formule, {{4}} la validité.',
    quand: 'Au passage du Trône, aux heures du salon, une fois par paquet.',
    appel: 1, rdv: false, rappel: false, unParTete: false, porte: 'toutes',
  },
  {
    famille: 'merci-marraine', type: 'merci-marraine', modeles: ['parrainage_merci'], secrets: [], depose: 'le Trône (shared/merci-en-salle)',
    pourQuoi: 'Le merci à la marraine, la carte en en-tête : {{1}} son appel, {{2}} la filleule, {{3}} la récompense.',
    quand: 'Quand une filleule vient grâce à elle.',
    appel: 1, rdv: false, rappel: false, unParTete: false, porte: 'toutes',
  },
  {
    famille: 'perle-garder', type: 'gerard', genres: ['garder'], modeles: ['assistant_maison_garder'], secrets: [], depose: 'assistant-maison (le passage du matin de Perle)',
    pourQuoi: 'Garder un rendez-vous : « Bonjour {{1}}, petit rappel de la Maison : votre rendez-vous de {{2}} est prévu {{3}}. » Oui, je viens ; Changer l’heure ; Je ne peux plus. Pour un enfant, {{1}} salue le parent.',
    quand: 'Deux jours avant un rendez-vous pris au moins trois jours avant sa date.',
    appel: 1, rdv: true, rappel: true, unParTete: true, porte: 'toutes',
  },
  {
    famille: 'perle-avant', type: 'gerard', genres: ['avant'], modeles: ['assistant_maison_avant'], secrets: [], depose: 'assistant-maison (le passage du matin de Perle)',
    pourQuoi: 'Le prochain soin qui approche : « Bonjour {{1}}, votre prochain {{2}} approche : il est prévu {{3}}. Je vous réserve votre place ? »',
    quand: 'Quand sa cadence annonce le prochain soin, sans rendez-vous encore posé.',
    appel: 1, rdv: false, rappel: true, unParTete: true, porte: 'toutes',
  },
  {
    famille: 'perle', type: 'gerard',
    modeles: ['assistant_maison_envie', 'assistant_maison_place', 'assistant_maison_anniversaire', 'assistant_maison_carte_anniversaire', 'assistant_maison_carte_foyer', 'assistant_maison_fetes', 'assistant_maison_endormie', 'nouvelles_de_la_maison'],
    secrets: [], depose: 'assistant-maison (le passage du matin de Perle)',
    pourQuoi: 'Les autres messages de Perle : une envie, une place, les cartes d’anniversaire, les fêtes, une cliente endormie, les nouvelles. {{1}} l’appel ; pour la carte du foyer, celui du parent qui paie.',
    quand: 'Au passage du matin, une ligne par cliente et par jour au plus ; les cartes à 10 h.',
    appel: 1, rdv: false, rappel: false, unParTete: true, porte: 'toutes',
  },
  {
    famille: 'campagne', type: 'campagne', modeles: [], secrets: [], depose: 'le Trône (Marketing, shared/campagnes-pur)',
    pourQuoi: 'Une campagne de la Maison : le modèle qu’elle choisit, {{1}} l’appel. Déposée retenue, partie sur un feu vert : la porte ne vérifie que « jamais deux fois ».',
    quand: 'À l’heure dite par la campagne, après le feu vert.',
    appel: 1, rdv: false, rappel: false, unParTete: true, porte: 'jamais-deux-fois',
  },
];

/** CE QUI NE PASSE PAS PAR LA PORTE, dit honnêtement : ces envois partent
    sans la salle d'attente, la porte ne les voit pas. */
export const SORTIES_HORS_DE_LA_PORTE: readonly { qui: string; quoi: string }[] = [
  { qui: 'rappels-j1, confirmation-rdv, avis-google, relances-factures, rappels-d-echeance, fete-de-couronne', quoi: 'quand le facteur se tait depuis plus de cinq minutes, ils envoient eux-mêmes, comme avant la salle' },
  { qui: 'confirmation-rdv', quoi: 'la confirmation de celle qui a réservé elle-même (Ma Couronne, WhatsApp) part sans salle' },
  { qui: 'demande-submit', quoi: 'l’accusé et la confirmation d’une réservation du site, tout de suite' },
  { qui: 'whatsapp-automate, whatsapp-webhook', quoi: 'les réponses dans une conversation ouverte' },
  { qui: 'le Trône', quoi: 'les envois de l’équipe (composer, tournée du matin, « à la main ») : jamais jugés' },
  { qui: 'cloture-du-jour (Grenat)', quoi: 'le papier d’une pièce : il passe par la salle, gardé par la marque de la pièce et sa clé au serveur (une pièce, un seul WhatsApp), pas par la porte' },
];

/** La famille d'une ligne d'envoi, ou null. */
export function entreeDe(l: { type?: unknown; genre?: unknown } | null | undefined): EntreeDuRegistre | null {
  const type = String(l?.type ?? '');
  if (!type) return null;
  const memeType = REGISTRE_DES_MODELES.filter((e) => e.type === type);
  if (memeType.length <= 1) return memeType[0] ?? null;
  const genre = String(l?.genre ?? '');
  return memeType.find((e) => !!e.genres && e.genres.includes(genre)) ?? memeType.find((e) => !e.genres) ?? null;
}

/* ── LE NUMÉRO ET SA CLÉ. Meta dit « 229 97 00 00 01 », la fiche
   « +229 01 97 00 00 01 » : la clé les réduit à 229 et huit chiffres pour
   comparer, comme `cle_du_numero_wa` en base et `cleWa` du webhook. ── */
export const numeroWa = (brut: string | undefined): string => {
  const d = (brut ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00229')) return d.slice(2);
  if (d.startsWith('229')) return d;
  if (d.length === 10 && d.startsWith('01')) return `229${d}`;
  if (d.length === 8) return `22901${d}`;
  return d;
};
export const cleDuNumeroWa = (brut: unknown): string => {
  const d = numeroWa(String(brut ?? ''));
  return d.length === 13 && d.startsWith('22901') ? `229${d.slice(5)}` : d;
};
/** Les formes sous lesquelles un numéro vit dans `messages_wa` et `envois` :
    une lecture `in` les trouve toutes, sans fonction en base. */
export function variantesDuNumero(brut: unknown): string[] {
  const k = cleDuNumeroWa(brut);
  if (!k) return [];
  const formes = /^229\d{8}$/.test(k) ? [k, `22901${k.slice(3)}`] : [k];
  return formes.flatMap((f) => [f, `+${f}`]);
}

/** Le texte d'un message sans ses civilités : « M. Awa, … » et « Mme Awa, … »
    disent la même chose, une fois la civilité corrigée entre deux passages. */
export const texteSansCivilite = (t: unknown): string => String(t ?? '').replace(/(^|[\s,;:(«"'])(?:M\.|Mme|Mlle|Monsieur|Madame|Mademoiselle)(?= )\s*/g, '$1').replace(/\s+/g, ' ').trim();

/* ── CE QUE LA PORTE REÇOIT ── */
export type ColisALaPorte = {
  genre?: string; numero?: string; modele?: string; composants?: unknown[]; texteAuFil?: string; parQui?: string;
  repli?: { modele: string; composants: unknown[]; texteAuFil?: string };
};
/** La ligne d'envoi telle que le facteur la tient, colis compris. */
export type LigneALaPorte = {
  id: string; type?: string; genre?: string; canal?: string; statut?: string; detail?: string;
  apptId?: string; clientId?: string; pourId?: string; teteId?: string; subId?: string; seanceId?: string;
  invoiceId?: string; invoiceIds?: unknown; campagneId?: string; echeance?: unknown; dueIso?: string; revuLe?: string;
  dateRdv?: string; heure?: string; deposeLe?: string; quand?: string; prisLe?: string; recolleLe?: string; parLaMain?: boolean;
  /** Le message d'un foyer : le foyer, chaque rendez-vous et chaque fiche qu'il nomme. */
  foyerId?: string; apptIds?: unknown; clientIds?: unknown;
  colis?: ColisALaPorte;
  [k: string]: unknown;
};
export type RdvALaPorte = { date?: string; time?: string; status?: string; confirmeeParLaClienteLe?: unknown; deplaceLe?: unknown; foyerId?: unknown; [k: string]: unknown };
export type FicheALaPorte = { name?: unknown; civilite?: unknown; auMasculin?: unknown; [k: string]: unknown };
export type MessageALaPorte = { sens?: string; numero?: string; clientId?: string; clientIds?: unknown; texte?: string; modele?: string; quand?: string; etat?: string; [k: string]: unknown };
export type ContexteDeLaPorte = {
  maintenantMs: number;
  /** Le rendez-vous relu (null : il n'existe plus ; absent : la ligne n'en nomme pas). */
  rdv?: RdvALaPorte | null;
  /** La fiche qui reçoit : celle de `pourId` quand la ligne en porte un, sinon celle de `clientId`. */
  fiche?: FicheALaPorte | null;
  /** Les lignes d'envoi voisines (le même rendez-vous, ou la même fiche). */
  envois?: readonly LigneALaPorte[];
  /** Le fil de ce numéro, depuis le dépôt et au moins vingt-quatre heures. */
  messages?: readonly MessageALaPorte[];
};
export type VerdictDeLaPorte =
  | { verdict: 'passe' }
  | { verdict: 'retenu'; motif: string }
  | { verdict: 'corrige'; composants: unknown[]; texteAuFil?: string; repli?: ColisALaPorte['repli']; motif: string };

const instant = (v: unknown): number => Date.parse(String(v ?? ''));

/** (a) QUI ENVOIE. 'aucune' : un envoi de l'équipe, une main qui a dit
    « maintenant », ou autre chose qu'un modèle WhatsApp ; 'jamais-deux-fois' :
    une campagne ; 'toutes' : un envoi automatique. */
export function quellePorte(l: LigneALaPorte): 'aucune' | 'jamais-deux-fois' | 'toutes' {
  if (l.colis?.genre !== 'whatsapp') return 'aucune';
  if (l.parLaMain === true) return 'aucune';
  const parQui = String(l.colis.parQui ?? '');
  const e = entreeDe(l);
  if (e?.porte === 'jamais-deux-fois' || PAR_QUI_DES_CAMPAGNES.includes(parQui)) return 'jamais-deux-fois';
  if (e || PAR_QUI_AUTOMATIQUES.includes(parQui)) return 'toutes';
  return 'aucune';
}

/** L'ÉVÉNEMENT qu'une ligne porte : son rendez-vous, sinon ce dont elle parle
    (la campagne, l'enfant, la formule et son échéance, la séance, la
    facture, la situation de Perle). Une ligne qui ne dit rien de plus n'est
    qu'elle-même : jamais confondue avec une autre. */
export function cleDeLEvenement(l: LigneALaPorte): string {
  const e = entreeDe(l);
  const famille = e?.famille ?? String(l.type ?? '');
  if (l.apptId && (e ? e.rdv : true)) return `${famille}|rdv|${l.apptId}`;
  const factures = Array.isArray(l.invoiceIds) && l.invoiceIds.length ? l.invoiceIds.map(String).sort().join(',') : '';
  const sujet = l.campagneId || l.teteId || (l.subId ? `${l.subId}|${String(l.echeance ?? l.dueIso ?? l.revuLe ?? '')}` : '')
    || l.seanceId || l.invoiceId || factures || (l.type === 'gerard' ? String(l.genre ?? '') : '');
  if (!sujet) return `${famille}|ligne|${l.id}`;
  return `${famille}|${l.clientId ?? ''}|${sujet}`;
}

/** (b) JAMAIS DEUX FOIS. Le journal : une autre ligne du même événement,
    partie (ou envoyée à la main) sur WhatsApp depuis vingt heures. Le fil :
    un message sortant du même modèle (ou de son repli), à la même clé de
    numéro, depuis vingt heures, que WhatsApp n'a pas dit « non remis », pour
    la même fiche (famille « une par tête ») ou au même texte, civilités
    ôtées. Deux enfants d'un même parent, deux formules d'une même payeuse :
    deux fiches ou deux textes, donc deux messages.

    UN FOYER, UN MESSAGE (4 novembre 2026). Deux enfants d'un même foyer,
    le même jour, au même numéro, sont nommés par UN message (`apptIds`,
    `clientIds`). Chaque rendez-vous nommé par une ligne partie au journal,
    et chaque fiche nommée par un message du fil, est couvert : une ligne
    dont toutes les têtes sont déjà couvertes ne repart pas, qu'elle soit
    celle du foyer ou celle d'une seule tête. Deux enfants d'un même parent
    hors d'un foyer gardent chacun leur message, comme avant. */
export function dejaParti(l: LigneALaPorte, ctx: ContexteDeLaPorte): string | null {
  const depuis = ctx.maintenantMs - JAMAIS_DEUX_FOIS_MS;
  const recent = (q: unknown): boolean => { const t = instant(q); return Number.isFinite(t) && t >= depuis && t <= ctx.maintenantMs + 5 * 60_000; };
  const cle = cleDeLEvenement(l);
  const famille = entreeDe(l);
  const tetes = famille?.rdv ? tetesNommees(l) : [];
  const couvertes = new Set<string>();
  for (const o of ctx.envois ?? []) {
    if (!o || o.id === l.id || !recent(o.quand)) continue;
    if (o.statut !== 'envoyé' && o.statut !== 'à-la-main') continue;
    if (o.canal !== 'whatsapp' && o.canal !== 'wa-main') continue;
    if (cleDeLEvenement(o) === cle) return 'déjà parti : le même message est au journal depuis moins de 20 h';
    if (tetes.length > 0 && entreeDe(o)?.famille === famille?.famille) for (const t of tetesNommees(o)) couvertes.add(t);
  }
  if (tetes.length > 0 && tetes.every((t) => couvertes.has(t))) return 'déjà parti : chaque rendez-vous de ce foyer est nommé au journal depuis moins de 20 h';
  const numero = cleDuNumeroWa(l.colis?.numero);
  const modeles = [l.colis?.modele, l.colis?.repli?.modele].filter((m): m is string => !!m);
  const textes = [l.colis?.texteAuFil, l.colis?.repli?.texteAuFil].filter((t): t is string => !!t).map(texteSansCivilite);
  const unParTete = entreeDe(l)?.unParTete ?? false;
  if (!numero || modeles.length === 0) return null;
  const nommees = fichesNommees(l);
  const vues = new Set<string>();
  for (const m of ctx.messages ?? []) {
    if (!m || m.sens !== 'sortant' || m.etat === 'non-remis' || !recent(m.quand)) continue;
    if (!m.modele || !modeles.includes(m.modele) || cleDuNumeroWa(m.numero) !== numero) continue;
    const memeTexte = !!m.texte && textes.includes(texteSansCivilite(m.texte));
    if (memeTexte) return 'déjà parti : le même modèle est au fil de ce numéro depuis moins de 20 h';
    if (unParTete) for (const c of fichesNommees(m)) vues.add(c);
  }
  const memeTete = unParTete && nommees.length > 0 && nommees.every((c) => vues.has(c));
  if (memeTete) return 'déjà parti : le même modèle est au fil de ce numéro depuis moins de 20 h';
  return null;
}

/** (c) PAS DE RAPPEL À QUI VIENT DE CONFIRMER. Pour les rappels seulement :
    « Oui, je viens » posé sur le rendez-vous ; sa confirmation partie il y a
    moins de 24 heures (le modèle, ou la confirmation dite dans la
    conversation) ; ou un message d'elle depuis le dépôt de la ligne. Le
    rappel d'un foyer se tait quand chaque rendez-vous qu'il nomme a eu sa
    confirmation depuis moins de 24 heures (celle du foyer les nomme tous). */
export function vientDeConfirmer(l: LigneALaPorte, ctx: ContexteDeLaPorte): string | null {
  if (!entreeDe(l)?.rappel) return null;
  const marque = ctx.rdv?.confirmeeParLaClienteLe;
  if (l.apptId && typeof marque === 'string' && marque.trim()) return 'elle a déjà confirmé sa venue';
  if (l.apptId) {
    const confirmes = new Set<string>();
    for (const o of ctx.envois ?? []) {
      if (!o || o.type !== 'confirmation' || o.statut !== 'envoyé') continue;
      const t = instant(o.quand);
      if (Number.isFinite(t) && t <= ctx.maintenantMs + 5 * 60_000 && ctx.maintenantMs - t < CONFIRMATION_RECENTE_MS) {
        for (const id of tetesNommees(o)) confirmes.add(id);
      }
    }
    if (tetesNommees(l).every((id) => confirmes.has(id))) return 'sa confirmation est partie il y a moins de 24 h';
  }
  const depot = instant(l.deposeLe ?? l.quand);
  const numero = cleDuNumeroWa(l.colis?.numero);
  if (Number.isFinite(depot) && numero) {
    for (const m of ctx.messages ?? []) {
      if (!m || m.sens !== 'entrant' || cleDuNumeroWa(m.numero) !== numero) continue;
      const t = instant(m.quand);
      if (Number.isFinite(t) && t > depot) return 'elle a écrit depuis le dépôt : la conversation est ouverte';
    }
  }
  return null;
}

/** (d) LE RENDEZ-VOUS TIENT-IL ENCORE ? Pour une ligne qui nomme son
    rendez-vous. Déplacé : un autre jour ou une autre heure que ceux de la
    ligne, ou une trace de déplacement postérieure au dépôt (sauf pour une
    confirmation, que le facteur recolle à la nouvelle date). */
export function rendezVousQuiNeTientPlus(l: LigneALaPorte, ctx: ContexteDeLaPorte): string | null {
  const e = entreeDe(l);
  if (!l.apptId || (e && !e.rdv)) return null;
  const r = ctx.rdv;
  if (!r) return 'le rendez-vous n’existe plus';
  if (r.status === 'annulé') return 'le rendez-vous a été annulé';
  if (r.status === 'honoré') return 'le rendez-vous est déjà honoré';
  if ((r.date ?? '') !== (l.dateRdv ?? '') || (r.time ?? '') !== (l.heure ?? '')) return 'le rendez-vous a été déplacé';
  const deplace = instant(r.deplaceLe);
  const depot = instant(l.deposeLe ?? l.quand);
  if (e?.famille !== 'confirmation' && Number.isFinite(deplace) && Number.isFinite(depot) && deplace > depot) return 'le rendez-vous a été déplacé depuis le dépôt';
  const h = /^\d{1,2}:\d{2}$/.test(r.time ?? '') ? (r.time as string).padStart(5, '0') : '23:59';
  const moment = Date.parse(`${r.date}T${h}:00+01:00`);
  if (Number.isFinite(moment) && moment <= ctx.maintenantMs) return 'l’heure du rendez-vous est passée';
  return null;
}

/* ── (e) LA CIVILITÉ. La règle de src/shared/civilite.ts (`appelDe`) : la
   civilité notée l'emporte sur l'ancienne marque `auMasculin`, abrégée
   devant le prénom (« M. », « Mme », « Mlle »), en entier seule ; une fiche
   muette dit le prénom seul. ── */
const ABREGEE: Record<string, string> = { madame: 'Mme', mademoiselle: 'Mlle', monsieur: 'M.' };
const ENTIERE: Record<string, string> = { madame: 'Madame', mademoiselle: 'Mademoiselle', monsieur: 'Monsieur' };
const MASCULINES = new Set(['M.', 'Monsieur']);
/** La civilité écrite en tête d'un appel, et ce qui la suit. */
export function civiliteEcrite(appel: string): { mot: string | null; reste: string } {
  const t = String(appel ?? '').replace(/\s+/g, ' ').trim();
  const m = /^(M\.|Mme|Mlle|Monsieur|Madame|Mademoiselle)(?: (.+))?$/.exec(t);
  return m ? { mot: m[1], reste: m[2] ?? '' } : { mot: null, reste: t };
}
/** L'appel juste pour cette fiche, à partir de l'appel écrit ; null quand il
    n'y a rien à changer, ou quand l'appel ne nomme pas cette fiche (le parent
    d'un enfant, « à vous », « Madame, Monsieur ») : on ne corrige que ce
    qu'on sait être à elle. */
export function appelJuste(ecrit: string, fiche: FicheALaPorte | null | undefined): string | null {
  if (!fiche) return null;
  const { mot, reste } = civiliteEcrite(ecrit);
  /* TOUT LE PRÉNOM COMPOSÉ (7 novembre 2026) : la porte écrit le prénom
     d'usage (`prenomDUsage`) ; un message déposé avant ce jour, qui dit le
     premier mot seul, la nomme encore, et prend tout son prénom. */
  const prenom = prenomDUsage(fiche);
  const premierMot = String(fiche.name ?? '').trim().split(/\s+/)[0] ?? '';
  if (reste !== prenom && reste !== premierMot) return null;
  const civ = typeof fiche.civilite === 'string' && ABREGEE[fiche.civilite] ? fiche.civilite : null;
  let juste: string;
  if (civ) juste = prenom ? `${ABREGEE[civ]} ${prenom}` : ENTIERE[civ];
  else if (!mot) juste = prenom || String(ecrit ?? '').replace(/\s+/g, ' ').trim();
  else if (fiche.auMasculin === true && MASCULINES.has(mot)) juste = prenom ? `${mot} ${prenom}` : mot;
  else juste = prenom || 'Madame, Monsieur';
  return juste === String(ecrit ?? '').replace(/\s+/g, ' ').trim() ? null : juste;
}
/** Le texte du fil, l'appel remplacé à sa première place comme mot entier. */
export function remplaceLAppel(texte: string, avant: string, apres: string): string {
  if (!avant) return texte;
  const lettre = /[\p{L}\p{N}]/u;
  for (let i = texte.indexOf(avant); i >= 0; i = texte.indexOf(avant, i + 1)) {
    const devant = i === 0 ? '' : texte[i - 1];
    const derriere = texte[i + avant.length] ?? '';
    if ((devant === '' || !lettre.test(devant)) && (derriere === '' || !lettre.test(derriere))) {
      return `${texte.slice(0, i)}${apres}${texte.slice(i + avant.length)}`;
    }
  }
  return texte;
}
type CorpsDuModele = { type?: string; parameters?: { type?: string; text?: string }[] };
/** L'appel porté par les composants, au {{n}} du registre. */
export function appelDesComposants(composants: unknown[] | undefined, n: number): string | null {
  const corps = (composants ?? []).find((c) => String((c as CorpsDuModele)?.type ?? '').toLowerCase() === 'body') as CorpsDuModele | undefined;
  const p = corps?.parameters?.[n - 1];
  return p && p.type === 'text' && typeof p.text === 'string' ? p.text : null;
}
/** Les composants avec l'appel remplacé au {{n}} du corps, le reste intact. */
export function composantsAvecLAppel(composants: unknown[], n: number, appel: string): unknown[] {
  let fait = false;
  return composants.map((c) => {
    const corps = c as CorpsDuModele;
    if (fait || String(corps?.type ?? '').toLowerCase() !== 'body' || !Array.isArray(corps.parameters)) return c;
    fait = true;
    return { ...corps, parameters: corps.parameters.map((p, i) => (i === n - 1 ? { ...p, text: appel } : p)) };
  });
}
/** (e) L'APPEL CORRIGÉ : les composants (et son repli) et le texte du fil,
    quand la fiche dit une autre civilité que le modèle. */
export function appelCorrige(l: LigneALaPorte, ctx: ContexteDeLaPorte): { composants: unknown[]; texteAuFil?: string; repli?: ColisALaPorte['repli']; motif: string } | null {
  const n = entreeDe(l)?.appel ?? null;
  const colis = l.colis;
  if (!n || !colis || !Array.isArray(colis.composants)) return null;
  const ecrit = appelDesComposants(colis.composants, n);
  if (ecrit === null) return null;
  const juste = appelJuste(ecrit, ctx.fiche);
  if (juste === null) return null;
  const composants = composantsAvecLAppel(colis.composants, n, juste);
  const texteAuFil = typeof colis.texteAuFil === 'string' ? remplaceLAppel(colis.texteAuFil, ecrit.replace(/\s+/g, ' ').trim(), juste) : undefined;
  let repli = colis.repli;
  if (repli && Array.isArray(repli.composants)) {
    const ecritRepli = appelDesComposants(repli.composants, n);
    if (ecritRepli !== null && appelJuste(ecritRepli, ctx.fiche) === juste) {
      repli = {
        ...repli, composants: composantsAvecLAppel(repli.composants, n, juste),
        ...(typeof repli.texteAuFil === 'string' ? { texteAuFil: remplaceLAppel(repli.texteAuFil, ecritRepli.replace(/\s+/g, ' ').trim(), juste) } : {}),
      };
    }
  }
  return { composants, ...(texteAuFil !== undefined ? { texteAuFil } : {}), ...(repli ? { repli } : {}), motif: `civilité de la fiche : « ${ecrit} » devient « ${juste} »` };
}

/** LA PORTE : (a), puis (b), puis (d), (c) et (e) pour un envoi automatique. */
export function laPorte(l: LigneALaPorte, ctx: ContexteDeLaPorte): VerdictDeLaPorte {
  const porte = quellePorte(l);
  if (porte === 'aucune') return { verdict: 'passe' };
  const deux = dejaParti(l, ctx);
  if (deux) return { verdict: 'retenu', motif: deux };
  if (porte === 'jamais-deux-fois') return { verdict: 'passe' };
  const rdv = rendezVousQuiNeTientPlus(l, ctx);
  if (rdv) return { verdict: 'retenu', motif: rdv };
  const confirme = vientDeConfirmer(l, ctx);
  if (confirme) return { verdict: 'retenu', motif: confirme };
  const corrige = appelCorrige(l, ctx);
  if (corrige) return { verdict: 'corrige', ...corrige };
  return { verdict: 'passe' };
}

/** Depuis quand lire le journal et le fil pour juger une ligne : vingt-quatre
    heures, et au moins depuis son dépôt. */
export function depuisPourLaPorte(l: LigneALaPorte, maintenantMs: number): string {
  const depot = instant(l.deposeLe ?? l.quand);
  const bas = Math.min(maintenantMs - CONFIRMATION_RECENTE_MS, Number.isFinite(depot) ? depot - 60_000 : Infinity);
  return new Date(bas).toISOString();
}

/** UNE LIGNE PRISE ET JAMAIS RENDUE, DÉJÀ AU FIL : le facteur a été coupé
    après que Meta a accepté le message. Le fil le dit (même modèle ou son
    repli, même clé de numéro, depuis la prise) : elle est partie, la rendre
    « échec » la ferait repartir au passage suivant. Rend le message trouvé. */
export function partiAuFil(l: LigneALaPorte, messages: readonly MessageALaPorte[]): MessageALaPorte | null {
  const numero = cleDuNumeroWa(l.colis?.numero);
  const modeles = [l.colis?.modele, l.colis?.repli?.modele].filter((m): m is string => !!m);
  const prise = instant(l.prisLe ?? l.deposeLe ?? l.quand);
  if (l.colis?.genre !== 'whatsapp' || !numero || modeles.length === 0 || !Number.isFinite(prise)) return null;
  return messages.find((m) => !!m && m.sens === 'sortant' && m.etat !== 'non-remis' && !!m.modele && modeles.includes(m.modele)
    && cleDuNumeroWa(m.numero) === numero && (!l.clientId || !m.clientId || m.clientId === l.clientId)
    && instant(m.quand) >= prise - 60_000) ?? null;
}
/* ⟨/porte-des-modeles⟩ */
