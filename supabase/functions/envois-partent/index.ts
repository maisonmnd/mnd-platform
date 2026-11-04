/* ══════════════════════════════════════════════════════════════════
   ENVOIS-PARTENT — le facteur de la salle d'attente.

   « Est-ce possible d'intercepter un message qui part vers chez un client ?
   D'arrêter l'envoi à cause de l'heure tardive ou autre raison, erreur…
   Besoin de voir immédiatement les nouveaux messages qui sont prêts à partir
   dans les 5 à 10 min à venir » (Yéman, 2 octobre 2026). Maquette
   `maquette-la-salle-d-attente-des-envois.html`, validée.

   Les fonctions planifiées (confirmation-rdv, rappels-j1, avis-google) ne
   s'adressent plus à la cliente : elles DÉPOSENT leur message dans le
   journal des envois, statut « en-attente », avec son heure de départ et son
   colis. Ce facteur, réveillé CHAQUE MINUTE par le cron :
     ① dit qu'il est vivant (`documents`, clé `mnd_facteur`) : tant qu'il se
        tait plus de cinq minutes, les fonctions envoient comme avant plutôt
        que de déposer des messages que personne ne porterait ;
     ② prévient le personnel, sur le téléphone, de ce qui part dans les dix
        minutes, une fois par message ;
     ③ porte ce dont l'heure est venue, jamais pendant les heures calmes
        (20 h à 8 h par défaut) sauf si une main a dit « maintenant » ;
     ④ RELIT le rendez-vous avant de porter : annulé, déplacé, disparu ou
        passé, le message ne part pas et le journal dit pourquoi ;
     ⑤ ne porte chaque message qu'UNE fois : il le prend en main par une
        écriture conditionnelle (« en-attente » devient « en-envoi »), que deux
        réveils simultanés ne peuvent pas gagner tous les deux.

   Un message RETENU depuis le Trône n'est plus « en-attente » : le facteur ne
   le voit pas. C'est toute la règle, et elle tient en une ligne de filtre.

   LE CALCUL DES HEURES EST RECOPIÉ de `src/shared/salle-des-envois.ts` (une
   fonction Edge ne lit rien du dépôt) ; `verifie-la-salle-des-envois` tient
   les deux ensemble.

   AUCUN SECRET ICI. Tout vient de l'environnement de la fonction
   (supabase secrets set …), ce fichier vit dans un dépôt public.

   Déploiement : Supabase → Edge Functions → New function « envois-partent »
   → coller CE FICHIER ENTIER → Deploy. Puis le cron, chaque minute
   (`* * * * *`), EN PREMIER, avant de recoller les trois autres fonctions.
   ══════════════════════════════════════════════════════════════════ */

import { createClient } from 'npm:@supabase/supabase-js@2';

/* ══ LA PORTE D'OPALE — 4 novembre 2026 ══════════════════════════════
   « Opale garde la porte de tous les modèles Meta automatiques » (Yéman).
   Recopié À L'IDENTIQUE de `src/shared/porte-des-modeles-pur.ts` (une
   fonction Edge ne lit rien du dépôt) ; le banc des douze lunes compare les
   copies et scripts/verifie-la-porte-des-modeles éprouve chaque règle. ══ */
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
  colis?: ColisALaPorte;
  [k: string]: unknown;
};
export type RdvALaPorte = { date?: string; time?: string; status?: string; confirmeeParLaClienteLe?: unknown; deplaceLe?: unknown; [k: string]: unknown };
export type FicheALaPorte = { name?: unknown; civilite?: unknown; auMasculin?: unknown; [k: string]: unknown };
export type MessageALaPorte = { sens?: string; numero?: string; clientId?: string; texte?: string; modele?: string; quand?: string; etat?: string; [k: string]: unknown };
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
    deux fiches ou deux textes, donc deux messages. */
export function dejaParti(l: LigneALaPorte, ctx: ContexteDeLaPorte): string | null {
  const depuis = ctx.maintenantMs - JAMAIS_DEUX_FOIS_MS;
  const recent = (q: unknown): boolean => { const t = instant(q); return Number.isFinite(t) && t >= depuis && t <= ctx.maintenantMs + 5 * 60_000; };
  const cle = cleDeLEvenement(l);
  for (const o of ctx.envois ?? []) {
    if (!o || o.id === l.id || !recent(o.quand)) continue;
    if (o.statut !== 'envoyé' && o.statut !== 'à-la-main') continue;
    if (o.canal !== 'whatsapp' && o.canal !== 'wa-main') continue;
    if (cleDeLEvenement(o) === cle) return 'déjà parti : le même message est au journal depuis moins de 20 h';
  }
  const numero = cleDuNumeroWa(l.colis?.numero);
  const modeles = [l.colis?.modele, l.colis?.repli?.modele].filter((m): m is string => !!m);
  const textes = [l.colis?.texteAuFil, l.colis?.repli?.texteAuFil].filter((t): t is string => !!t).map(texteSansCivilite);
  const unParTete = entreeDe(l)?.unParTete ?? false;
  if (!numero || modeles.length === 0) return null;
  for (const m of ctx.messages ?? []) {
    if (!m || m.sens !== 'sortant' || m.etat === 'non-remis' || !recent(m.quand)) continue;
    if (!m.modele || !modeles.includes(m.modele) || cleDuNumeroWa(m.numero) !== numero) continue;
    const memeTete = unParTete && !!l.clientId && !!m.clientId && m.clientId === l.clientId;
    const memeTexte = !!m.texte && textes.includes(texteSansCivilite(m.texte));
    if (memeTete || memeTexte) return 'déjà parti : le même modèle est au fil de ce numéro depuis moins de 20 h';
  }
  return null;
}

/** (c) PAS DE RAPPEL À QUI VIENT DE CONFIRMER. Pour les rappels seulement :
    « Oui, je viens » posé sur le rendez-vous ; sa confirmation partie il y a
    moins de 24 heures (le modèle, ou la confirmation dite dans la
    conversation) ; ou un message d'elle depuis le dépôt de la ligne. */
export function vientDeConfirmer(l: LigneALaPorte, ctx: ContexteDeLaPorte): string | null {
  if (!entreeDe(l)?.rappel) return null;
  const marque = ctx.rdv?.confirmeeParLaClienteLe;
  if (l.apptId && typeof marque === 'string' && marque.trim()) return 'elle a déjà confirmé sa venue';
  if (l.apptId) {
    for (const o of ctx.envois ?? []) {
      if (!o || o.type !== 'confirmation' || o.apptId !== l.apptId || o.statut !== 'envoyé') continue;
      const t = instant(o.quand);
      if (Number.isFinite(t) && t <= ctx.maintenantMs + 5 * 60_000 && ctx.maintenantMs - t < CONFIRMATION_RECENTE_MS) {
        return 'sa confirmation est partie il y a moins de 24 h';
      }
    }
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
  const prenom = String(fiche.name ?? '').trim().split(/\s+/)[0] ?? '';
  if (reste !== prenom) return null;
  const civ = typeof fiche.civilite === 'string' && ABREGEE[fiche.civilite] ? fiche.civilite : null;
  let juste: string;
  if (civ) juste = prenom ? `${ABREGEE[civ]} ${prenom}` : ENTIERE[civ];
  else if (!mot) juste = String(ecrit ?? '').replace(/\s+/g, ' ').trim();
  else if (fiche.auMasculin === true && MASCULINES.has(mot)) juste = String(ecrit ?? '').replace(/\s+/g, ' ').trim();
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

const VERSION = '2026-11-04-a · la porte d’Opale : jamais deux fois, pas de rappel à qui vient de confirmer, civilité juste';

/* ── LE CALCUL DES HEURES, recopié de src/shared/salle-des-envois.ts ── */
const DECALAGE_DU_SALON_H = 1;
type ReglesDeLaSalle = { salleMin: number; calmeDe: number; calmeA: number };
const REGLES_PAR_DEFAUT: ReglesDeLaSalle = { salleMin: 10, calmeDe: 20, calmeA: 8 };
function reglesDepuis(cfg: { salleMin?: unknown; calmeDe?: unknown; calmeA?: unknown } | null | undefined): ReglesDeLaSalle {
  const n = (v: unknown, min: number, max: number, defaut: number): number => {
    const x = Number(v);
    return Number.isFinite(x) && x >= min && x <= max ? Math.round(x) : defaut;
  };
  return {
    salleMin: n(cfg?.salleMin, 1, 120, REGLES_PAR_DEFAUT.salleMin),
    calmeDe: n(cfg?.calmeDe, 0, 23, REGLES_PAR_DEFAUT.calmeDe),
    calmeA: n(cfg?.calmeA, 0, 23, REGLES_PAR_DEFAUT.calmeA),
  };
}
const heureDuSalon = (ms: number): number => {
  const d = new Date(ms + DECALAGE_DU_SALON_H * 3_600_000);
  return d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
};
function dansLesHeuresCalmes(ms: number, r: ReglesDeLaSalle): boolean {
  if (r.calmeDe === r.calmeA) return false;
  const h = heureDuSalon(ms);
  return r.calmeDe < r.calmeA ? (h >= r.calmeDe && h < r.calmeA) : (h >= r.calmeDe || h < r.calmeA);
}
function pourquoiIlNePartPlus(
  e: { dateRdv?: string; heure?: string; type?: string },
  rdv: { date?: string; time?: string; status?: string } | null | undefined,
  maintenantMs: number,
): string | null {
  if (!rdv) return 'le rendez-vous n’existe plus';
  if (rdv.status === 'annulé') return 'le rendez-vous a été annulé';
  if ((rdv.date ?? '') !== (e.dateRdv ?? '') || (rdv.time ?? '') !== (e.heure ?? '')) return 'le rendez-vous a été déplacé';
  if (e.type === 'confirmation' && rdv.status !== 'confirmé') return 'le rendez-vous n’est plus confirmé';
  /* « Votre rendez-vous est demain » ne part pas le jour même : un rappel du
     soir retenu par les heures calmes arriverait au matin du rendez-vous. */
  if (e.type === 'rappel-j1' && new Date(maintenantMs + 3_600_000).toISOString().slice(0, 10) >= (rdv.date ?? '')) return 'trop tard pour un rappel de la veille';
  const h = /^\d{1,2}:\d{2}$/.test(rdv.time ?? '') ? (rdv.time as string).padStart(5, '0') : '23:59';
  const moment = Date.parse(`${rdv.date}T${h}:00+01:00`);
  if (Number.isFinite(moment) && moment <= maintenantMs) return 'l’heure du rendez-vous est passée';
  return null;
}
/* La confirmation suit son rendez-vous (23 octobre 2026) : recopié lui aussi
   de src/shared/salle-des-envois.ts, comparé par verifie-la-salle-des-envois. */
const FUSEAU_DU_SALON = 'Africa/Porto-Novo';
function heureDuMessage(hhmm: string | undefined): string {
  if (!/^\d{1,2}:\d{2}$/.test(hhmm ?? '')) return hhmm ?? '';
  const [h, m] = (hhmm as string).split(':');
  const minutes = Number(m);
  return Number.isFinite(minutes) && minutes > 0
    ? `${Number(h)} h ${String(minutes).padStart(2, '0')}`
    : `${Number(h)} h`;
}
function momentDuMessage(date: string | undefined, hhmm: string | undefined): string {
  if (!date) return '';
  let jour = date;
  try {
    jour = new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: FUSEAU_DU_SALON,
    });
  } catch { jour = date; }
  return `${jour} à ${heureDuMessage(hhmm)}`;
}
function recolleLeColis<T extends { type?: string; dateRdv?: string; heure?: string; colis?: unknown }>(
  e: T,
  rdv: { date?: string; time?: string; status?: string } | null | undefined,
  maintenantMs: number,
): T | null {
  if (e.type !== 'confirmation' || !e.colis || !rdv || !rdv.date) return null;
  if (rdv.date === (e.dateRdv ?? '') && (rdv.time ?? '') === (e.heure ?? '')) return null;
  const repris = { ...e, dateRdv: rdv.date, heure: rdv.time ?? '' };
  if (pourquoiIlNePartPlus(repris, rdv, maintenantMs) !== null) return null;
  const avant = momentDuMessage(e.dateRdv, e.heure);
  const apres = momentDuMessage(rdv.date, rdv.time);
  const texte = JSON.stringify(e.colis);
  if (!avant || !texte.includes(avant)) return null;
  return { ...repris, colis: JSON.parse(texte.split(avant).join(apres)) };
}
/* ── fin du calcul recopié ── */

/** Ce qu'il faut pour envoyer, déposé par la fonction qui a jugé. */
type Colis =
  | {
    genre: 'whatsapp'; numero: string; modele: string; composants: unknown[]; texteAuFil?: string; parQui?: string; rdvChampApres?: string;
    /** LE REPLI — 3 novembre 2026 : l'ancien modèle et ses mots, pour le cas
        où Meta refuserait le neuf (la confirmation à liens). */
    repli?: { modele: string; composants: unknown[]; texteAuFil?: string };
  }
  | { genre: 'push'; clientId: string; titre: string; corps: string; url?: string }
  | { genre: 'sms'; numero: string; texte: string };

type Ligne = {
  id: string;
  branch_id: string | null;
  data: {
    id: string; type?: string; canal?: string; statut?: string; branchId?: string;
    apptId?: string; clientId?: string; dateRdv?: string; heure?: string; prenom?: string;
    partA?: string; parLaMain?: boolean; annonceLe?: string; colis?: Colis;
    [k: string]: unknown;
  };
};

/** Les messages portés par réveil, au plus : une rafale de quarante rappels
    se porte en deux minutes, pas en une requête qui dépasserait son temps. */
const PAR_REVEIL = 30;
/** On prévient le personnel de ce qui part dans ce délai. */
const ANNONCE_MS = 10 * 60_000;

/* ══ UN ENVOI NE PEND PAS, UNE LIGNE PRISE NE RESTE PAS PRISE — 10 octobre 2026 ══
   Revue de nuit. Les appels à Meta, à push-notify et à Twilio partaient sans
   délai maximal : un appel qui pendait jusqu'à la limite de la fonction la
   tuait, et la ligne déjà passée « en-envoi » le restait POUR TOUJOURS (le
   facteur ne relit que « en-attente », les fonctions qui déposent ne
   retentent que « échec » et « périmé »). Chaque appel est donc borné à huit
   secondes, et chaque réveil commence par rendre « échec » (motif « envoi
   interrompu ») une ligne prise en main depuis plus de dix minutes : la
   fonction qui l'a déposée la retentera, comme un raté. */
const ENVOI_MAX_MS = 8_000;
const EN_ENVOI_PERIME_MS = 10 * 60_000;

const TYPE_DIT: Record<string, string> = {
  confirmation: 'Confirmation', 'rappel-j1': 'Rappel de la veille', 'reprise-j3': 'Reprise proposée',
  'avis-google': 'Demande d’avis', 'fin-de-paquet': 'Fin de paquet',
};

/* ══ CE QUE LA PORTE D'OPALE LIT — 4 novembre 2026 ══════════════════════
   Trois lectures, pour la seule ligne jugée : la fiche qui reçoit (sa
   civilité), les lignes d'envoi voisines (le même rendez-vous, ou la même
   fiche depuis vingt-quatre heures) et le fil de son numéro (sous toutes ses
   formes, depuis le dépôt et au moins vingt-quatre heures). Une lecture qui
   échoue ne laisse pas juger : `null`, et la ligne redevient un échec à
   retenter, jamais un message parti sans sa porte. */
type Sb = ReturnType<typeof createClient>;
async function faitsDeLaPorte(sb: Sb, l: LigneALaPorte, rdv: RdvALaPorte | null, maintenantMs: number): Promise<ContexteDeLaPorte | null> {
  const depuis = depuisPourLaPorte(l, maintenantMs);
  const idFiche = String(l.pourId || l.clientId || '');
  const variantes = variantesDuNumero(l.colis?.numero);
  const [fiche, voisines, fil] = await Promise.all([
    idFiche ? sb.from('clients').select('id, data').eq('id', idFiche).maybeSingle() : Promise.resolve({ data: null, error: null }),
    l.apptId
      ? sb.from('envois').select('id, data').eq('data->>apptId', l.apptId).limit(200)
      : l.clientId
        ? sb.from('envois').select('id, data').eq('data->>clientId', l.clientId).gte('data->>quand', depuis).limit(300)
        : Promise.resolve({ data: [], error: null }),
    variantes.length
      ? sb.from('messages_wa').select('data').in('data->>numero', variantes).gte('data->>quand', depuis).limit(500)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (fiche.error || voisines.error || fil.error) return null;
  return {
    maintenantMs,
    ...(l.apptId ? { rdv } : {}),
    fiche: ((fiche.data as { data?: FicheALaPorte } | null)?.data ?? null),
    envois: ((voisines.data ?? []) as { id: string; data: LigneALaPorte }[]).map((r) => ({ ...(r.data ?? {}), id: r.id })),
    messages: ((fil.data ?? []) as { data: MessageALaPorte }[]).map((r) => r.data ?? {}),
  };
}

Deno.serve(async (req) => {
  const service = (Deno.env.get('CLE_SERVICE') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
  const urlBase = Deno.env.get('SUPABASE_URL') ?? '';
  /* Seul le cron (armé de la clé service) réveille le facteur : il lit des
     téléphones et écrit au journal. */
  const cleRecue = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!service || cleRecue !== service) {
    return new Response(
      JSON.stringify({ erreur: 'réservé au cron', attendueLg: service.length, recueLg: cleRecue.length }),
      { status: 401 },
    );
  }
  const sb = createClient(urlBase, service);
  const maintenantMs = Date.now();
  const maintenant = new Date(maintenantMs).toISOString();

  /* ① JE SUIS VIVANT. Les fonctions qui déposent lisent cette ligne. */
  await sb.from('documents').upsert({ key: 'mnd_facteur', data: { vuLe: maintenant, version: VERSION } });

  const { data: docs } = await sb.from('documents').select('key, data').in('key', ['mnd_auto_config', 'mnd_house_identity']);
  const regles = reglesDepuis(docs?.find((d) => d.key === 'mnd_auto_config')?.data as Record<string, unknown> | undefined);
  const nomMaison: string =
    ((docs?.find((d) => d.key === 'mnd_house_identity')?.data as { nom?: string } | undefined)?.nom ?? '').trim() || 'Maison MND';

  /* LES LIGNES PRISES ET JAMAIS RENDUES. L'heure de prise (`prisLe`) date la
     main ; une ligne prise avant ce jour n'en a pas, son dépôt en tient lieu.
     L'écriture ne passe que si la ligne est toujours « en-envoi ». */
  let interrompus = 0, retrouves = 0;
  const { data: prises } = await sb.from('envois').select('id, data')
    .eq('data->>statut', 'en-envoi').limit(100);
  for (const p of (prises ?? []) as { id: string; data: Record<string, unknown> }[]) {
    const depuis = Date.parse(String(p.data?.prisLe ?? p.data?.quand ?? p.data?.deposeLe ?? ''));
    if (Number.isFinite(depuis) && maintenantMs - depuis < EN_ENVOI_PERIME_MS) continue;
    /* DÉJÀ AU FIL : META L'AVAIT ACCEPTÉE (4 novembre 2026). Le facteur a été
       coupé après l'envoi : la rendre « échec » la ferait redéposer et
       repartir, c'est un des chemins du double rappel du 2 novembre. Le fil
       garde le message sortant : elle est « envoyé ». */
    const prise = { ...p.data, id: p.id } as LigneALaPorte;
    let auFil: MessageALaPorte | null = null;
    if (prise.colis?.genre === 'whatsapp' && Number.isFinite(depuis)) {
      const { data: fil } = await sb.from('messages_wa').select('data')
        .in('data->>numero', variantesDuNumero(prise.colis.numero)).eq('data->>sens', 'sortant')
        .gte('data->>quand', new Date(depuis - 60_000).toISOString()).limit(50);
      auFil = partiAuFil(prise, ((fil ?? []) as { data: MessageALaPorte }[]).map((r) => r.data ?? {}));
    }
    const { data: rendue } = await sb.from('envois')
      .update({
        data: auFil
          ? { ...p.data, statut: 'envoyé', ...(auFil.waId ? { waMessageId: String(auFil.waId) } : {}), detail: 'parti : retrouvé au fil après une interruption', quand: maintenant }
          : { ...p.data, statut: 'échec', detail: 'envoi interrompu', quand: maintenant },
      })
      .eq('id', p.id).eq('data->>statut', 'en-envoi').select('id');
    if ((rendue ?? []).length > 0) { if (auFil) retrouves++; else interrompus++; }
  }

  const { data: rows, error } = await sb.from('envois').select('id, branch_id, data')
    .eq('data->>statut', 'en-attente').limit(300);
  if (error) return new Response(JSON.stringify({ version: VERSION, erreur: error.message }), { status: 500 });
  const enSalle = (rows ?? []) as Ligne[];
  if (enSalle.length === 0) {
    return new Response(JSON.stringify({ version: VERSION, enSalle: 0, partis: 0, interrompus, retrouves }), { headers: { 'content-type': 'application/json' } });
  }

  const partAde = (l: Ligne): number => Date.parse(l.data.partA ?? '');

  /* ② LE TÉLÉPHONE DU PERSONNEL, une fois par message, pour ce qui part
     dans les dix minutes. Un message né la nuit s'annonce donc au matin, dix
     minutes avant huit heures, et ne réveille personne à minuit. */
  const aAnnoncer = enSalle.filter((l) => !l.data.annonceLe && Number.isFinite(partAde(l)) && partAde(l) - maintenantMs <= ANNONCE_MS);
  let annonces = 0;
  if (aAnnoncer.length > 0) {
    const premier = aAnnoncer[0].data;
    const un = `${TYPE_DIT[premier.type ?? ''] ?? 'Message'}${premier.prenom ? ` · ${premier.prenom}` : ''}`;
    const corps = aAnnoncer.length === 1
      ? `${un}. Ouvrez la salle pour le retenir.`
      : `${un}, et ${aAnnoncer.length - 1} autre${aAnnoncer.length > 2 ? 's' : ''}. Ouvrez la salle pour retenir.`;
    try {
      await fetch(`${urlBase}/functions/v1/push-notify`, {
        method: 'POST',
        signal: AbortSignal.timeout(ENVOI_MAX_MS),
        headers: { 'content-type': 'application/json', authorization: `Bearer ${service}` },
        body: JSON.stringify({
          mode: 'staff',
          title: `${nomMaison} · ${aAnnoncer.length} message${aAnnoncer.length > 1 ? 's' : ''} ${aAnnoncer.length > 1 ? 'vont' : 'va'} partir`,
          body: corps,
          url: '/trone/#/conversations?envois=1',
        }),
      });
    } catch (e) {
      console.error('envois-partent: annonce', String(e));
    }
    for (const l of aAnnoncer) {
      /* Seulement s'il attend encore : une main a pu le retenir entre-temps. */
      const { data: marque } = await sb.from('envois')
        .update({ data: { ...l.data, annonceLe: maintenant } })
        .eq('id', l.id).eq('data->>statut', 'en-attente').select('id');
      if ((marque ?? []).length > 0) { l.data.annonceLe = maintenant; annonces++; }
    }
  }

  /* ③ CE DONT L'HEURE EST VENUE. */
  const calme = dansLesHeuresCalmes(maintenantMs, regles);
  const aPorter = enSalle
    .filter((l) => Number.isFinite(partAde(l)) && partAde(l) <= maintenantMs && (!calme || l.data.parLaMain === true))
    .sort((a, b) => partAde(a) - partAde(b))
    .slice(0, PAR_REVEIL);

  const WA_TOKEN = Deno.env.get('WA_TOKEN');
  const WA_PHONE_ID = Deno.env.get('WA_PHONE_ID');
  const SMS_SID = Deno.env.get('SMS_TWILIO_SID');
  const SMS_TOKEN = Deno.env.get('SMS_TWILIO_TOKEN');
  const SMS_FROM = Deno.env.get('SMS_FROM');

  let partis = 0, perimes = 0, echecs = 0, dejaPris = 0, retenusParOpale = 0, corrigesParOpale = 0;

  for (const l of aPorter) {
    /* ⑤ JE LE PRENDS EN MAIN, et moi seul : l'écriture ne passe que s'il est
       encore « en-attente ». Retenu ou déjà pris une seconde plus tôt, elle ne
       touche aucune ligne et je passe au suivant. */
    const { data: pris } = await sb.from('envois')
      .update({ data: { ...l.data, prisLe: maintenant, statut: 'en-envoi' } })
      .eq('id', l.id).eq('data->>statut', 'en-attente').select('id');
    if ((pris ?? []).length === 0) { dejaPris++; continue; }

    const { colis: colisDepose, partA: _p, parLaMain: _m, calme: _c, ...base } = l.data as Ligne['data'] & { calme?: boolean };
    let colis = colisDepose;
    const ecris = async (plus: Record<string, unknown>) => {
      await sb.from('envois').update({ data: { ...base, ...plus, quand: new Date().toISOString() } }).eq('id', l.id);
    };

    /* ④ RELU AVANT DE PARTIR. Une confirmation dont le rendez-vous a été
       déplacé pendant l'attente reprend la nouvelle date au lieu d'être
       écartée (23 octobre 2026) ; tout le reste se juge comme avant. */
    let rdvRelu: RdvALaPorte | null = null;
    if (l.data.apptId) {
      const { data: rdvRow } = await sb.from('appointments').select('id, data').eq('id', l.data.apptId).maybeSingle();
      const rdv = (rdvRow?.data ?? null) as { date?: string; time?: string; status?: string } | null;
      rdvRelu = rdv as RdvALaPorte | null;
      const repris = recolleLeColis(l.data, rdv, Date.now());
      if (repris) {
        colis = repris.colis;
        base.dateRdv = repris.dateRdv;
        base.heure = repris.heure;
        (base as Record<string, unknown>).recolleLe = new Date().toISOString();
      }
      const motif = pourquoiIlNePartPlus(repris ?? l.data, rdv, Date.now());
      if (motif) { await ecris({ statut: 'périmé', detail: motif }); perimes++; continue; }
    }
    if (!colis) { await ecris({ statut: 'échec', detail: 'déposé sans colis' }); echecs++; continue; }

    /* ⑥ LA PORTE D'OPALE — 4 novembre 2026. Prise en main et rendez-vous
       relu, la ligne passe la porte avant Meta : retenue, elle devient
       « périmé » et dit pourquoi (« retenu par Opale : … ») ; corrigée, elle
       part avec l'appel de sa fiche. Un envoi de l'équipe ou une main qui a
       dit « maintenant » ne se juge pas (`quellePorte`). */
    const devant: LigneALaPorte = { ...(l.data as LigneALaPorte), ...(base as LigneALaPorte), id: l.id, parLaMain: l.data.parLaMain, colis: colis as ColisALaPorte };
    if (quellePorte(devant) !== 'aucune') {
      let faits: ContexteDeLaPorte | null = null;
      let panneDeLecture = '';
      try { faits = await faitsDeLaPorte(sb, devant, rdvRelu, Date.now()); } catch (e) { panneDeLecture = String(e).slice(0, 200); }
      if (!faits) { await ecris({ statut: 'échec', detail: `la porte d’Opale n’a pas pu lire le journal ou le fil${panneDeLecture ? ` : ${panneDeLecture}` : ''}` }); echecs++; continue; }
      const v = laPorte(devant, faits);
      if (v.verdict === 'retenu') { await ecris({ statut: 'périmé', detail: detailDOpale(v.motif) }); perimes++; retenusParOpale++; continue; }
      if (v.verdict === 'corrige' && colis.genre === 'whatsapp') {
        colis = { ...colis, composants: v.composants, ...(v.texteAuFil !== undefined ? { texteAuFil: v.texteAuFil } : {}), ...(v.repli ? { repli: v.repli } : {}) };
        (base as Record<string, unknown>).corrigeParOpale = v.motif;
        corrigesParOpale++;
      }
    }

    try {
      if (colis.genre === 'whatsapp') {
        if (!WA_TOKEN || !WA_PHONE_ID) { await ecris({ statut: 'échec', detail: 'clés Meta absentes' }); echecs++; continue; }
        const envoie = (modele: string, composants: unknown[]) => fetch(`https://graph.facebook.com/v20.0/${WA_PHONE_ID}/messages`, {
          method: 'POST',
          signal: AbortSignal.timeout(ENVOI_MAX_MS),
          headers: { 'content-type': 'application/json', authorization: `Bearer ${WA_TOKEN}` },
          body: JSON.stringify({
            messaging_product: 'whatsapp', to: colis.numero, type: 'template',
            template: { name: modele, language: { code: 'fr' }, components: composants },
          }),
        });
        type Reponse = { messages?: { id?: string }[]; error?: { code?: number; message?: string } };
        let r = await envoie(colis.modele, colis.composants);
        let rep = await r.json().catch(() => ({})) as Reponse;
        /* LE REPLI DU MODÈLE — 3 novembre 2026. Meta refuse le MODÈLE neuf
           (#132000 à #132999 : pas approuvé, en pause, variables fausses) et
           le colis emporte l'ancien : il part dans la même minute, et le fil
           dira ce qui est vraiment parti. Tout autre refus reste un échec. */
        let repliDuModele: number | undefined;
        const codeDuRefus = Number(rep?.error?.code);
        if (!r.ok && colis.repli && Number.isInteger(codeDuRefus) && codeDuRefus >= 132000 && codeDuRefus < 133000) {
          repliDuModele = codeDuRefus;
          colis = { ...colis, modele: colis.repli.modele, composants: colis.repli.composants, texteAuFil: colis.repli.texteAuFil ?? colis.texteAuFil };
          r = await envoie(colis.modele, colis.composants);
          rep = await r.json().catch(() => ({})) as Reponse;
        }
        const waId = String(rep?.messages?.[0]?.id ?? '');
        const duRepli = repliDuModele ? { repliDuModele, modele: colis.modele } : {};
        if (!r.ok) {
          await ecris({ statut: 'échec', detail: String(rep?.error?.message ?? `HTTP ${r.status}`).slice(0, 300), ...(Number(rep?.error?.code) ? { codeMeta: Number(rep?.error?.code) } : {}), ...duRepli });
          echecs++;
          continue;
        }
        await ecris({ statut: 'envoyé', ...(waId ? { waMessageId: waId } : { detail: 'accepté sans identifiant Meta' }), ...duRepli });
        partis++;
        if (waId && colis.texteAuFil) {
          const idFil = `wa-${waId}`;
          const { error: errFil } = await sb.from('messages_wa').upsert({
            id: idFil,
            branch_id: l.branch_id,
            data: {
              id: idFil, waId, branchId: l.data.branchId, sens: 'sortant', numero: colis.numero, clientId: l.data.clientId,
              texte: colis.texteAuFil, type: 'text', quand: new Date().toISOString(), etat: 'en-route',
              modele: colis.modele, parQui: colis.parQui ?? 'Le Trône',
            },
          }, { onConflict: 'id' });
          if (errFil) console.error('envois-partent: fil', errFil.message);
        }
        /* Ce que le rendez-vous doit savoir une fois le message parti (la
           reprise proposée s'y inscrit, « À faire » la lit). */
        if (colis.rdvChampApres && l.data.apptId) {
          const { data: rdvRow } = await sb.from('appointments').select('id, data').eq('id', l.data.apptId).maybeSingle();
          if (rdvRow) {
            await sb.from('appointments').update({ data: { ...(rdvRow.data as object), [colis.rdvChampApres]: new Date().toISOString() } }).eq('id', l.data.apptId);
          }
        }
      } else if (colis.genre === 'push') {
        const r = await fetch(`${urlBase}/functions/v1/push-notify`, {
          method: 'POST',
          signal: AbortSignal.timeout(ENVOI_MAX_MS),
          headers: { 'content-type': 'application/json', authorization: `Bearer ${service}` },
          body: JSON.stringify({ mode: 'to-client', clientId: colis.clientId, title: colis.titre, body: colis.corps, url: colis.url ?? '/couronne/' }),
        });
        const sent = ((await r.json().catch(() => ({}))) as { sent?: number }).sent ?? 0;
        await ecris({ statut: sent > 0 ? 'envoyé' : 'sans-abonnement' });
        if (sent > 0) partis++;
      } else if (colis.genre === 'sms') {
        if (!SMS_SID || !SMS_TOKEN || !SMS_FROM) { await ecris({ statut: 'échec', detail: 'clés SMS absentes' }); echecs++; continue; }
        const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SMS_SID}/Messages.json`, {
          method: 'POST',
          signal: AbortSignal.timeout(ENVOI_MAX_MS),
          headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: `Basic ${btoa(`${SMS_SID}:${SMS_TOKEN}`)}` },
          body: new URLSearchParams({ From: SMS_FROM, To: `+${colis.numero}`, Body: colis.texte }).toString(),
        });
        if (r.ok) { await ecris({ statut: 'envoyé' }); partis++; }
        else { await ecris({ statut: 'échec', detail: (await r.text()).slice(0, 300) }); echecs++; }
      } else {
        await ecris({ statut: 'échec', detail: 'colis de genre inconnu' });
        echecs++;
      }
    } catch (e) {
      await ecris({ statut: 'échec', detail: String(e).slice(0, 300) });
      echecs++;
    }
  }

  return new Response(
    JSON.stringify({ version: VERSION, enSalle: enSalle.length, heuresCalmes: calme, annonces, partis, perimes, echecs, dejaPris, interrompus, retrouves, retenusParOpale, corrigesParOpale }),
    { headers: { 'content-type': 'application/json' } },
  );
});
