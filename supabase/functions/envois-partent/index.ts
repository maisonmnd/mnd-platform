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

/* ══ LE PRÉNOM COMPOSÉ — 7 novembre 2026 ══════════════════════════════════
   « Quand on leur écrit, on écrive toujours, dans leur rendez-vous et dans
   leur messagerie WhatsApp, tout le prénom composé » (Yéman) : le prénom
   d'usage de la fiche, sinon celui que le Trône devine du nom. Recopié de
   `src/shared/civilite.ts` entre ses repères ; verifie-le-prenom-d-usage
   et le banc des douze lunes tiennent la copie. */
/* ⟨prenom-d-usage⟩ */
/** LES PRÉNOMS QUI SE COMPOSENT (liste du 7 novembre 2026) : en tête d'un nom
    de trois mots ou plus sans NOM en capitales, ils prennent le mot suivant. */
const PRENOMS_QUI_SE_COMPOSENT: readonly string[] = ['Marie', 'Anne', 'Jean', 'Paul', 'Pierre', 'Louis'];
/** Les particules d'un nom de famille : « de », « da », « d'Agbo »… */
const PARTICULE_DU_NOM = /^(?:de|da|do|dos|das|du|des|di|del|della|van|von|le|la|d['’]\S*)$/i;
/** Un mot tout en capitales : au moins deux lettres, accents compris, l'apostrophe et le trait d'union admis. */
const motEnCapitales = (m: string): boolean => /^[\p{Lu}'’-]+$/u.test(m) && (m.match(/\p{Lu}/gu) ?? []).length >= 2;
/** La capitale d'un second prénom écrit en minuscules ; rien d'autre ne bouge. */
const capitaleDuSecond = (m: string): string => (/^\p{Ll}/u.test(m) ? `${m.charAt(0).toUpperCase()}${m.slice(1)}` : m);

/** LE PRÉNOM QUE LE TRÔNE DEVINE d'un nom complet (les règles 2 à 5). Le
    trait d'union se recolle dans le prénom, jamais vers un NOM en capitales
    (« Awa - KOSSI » reste deux mots). */
const prenomDevine = (nom: unknown): string => {
  const mots = String(nom ?? '').trim().replace(/\s+/g, ' ')
    .replace(/(\S+) ?- ?(?=(\S+))/g, (tout: string, g: string, d: string) => (motEnCapitales(g) || motEnCapitales(d) ? tout : `${g}-`))
    .split(' ').filter(Boolean);
  if (mots.length === 0) return '';
  const nomDeFamille = mots.findIndex((m, i) => i > 0 && motEnCapitales(m));
  if (nomDeFamille > 0) {
    const fin = mots.findIndex((m, i) => i > 0 && (i >= nomDeFamille || !/^\p{L}/u.test(m)));
    const prenoms = mots.slice(0, fin);
    while (prenoms.length > 1 && PARTICULE_DU_NOM.test(prenoms[prenoms.length - 1])) prenoms.pop();
    return prenoms.map((m, i) => (i > 0 && !PARTICULE_DU_NOM.test(m) ? capitaleDuSecond(m) : m)).join(' ');
  }
  const premier = mots[0].toLowerCase();
  const second = mots[1] ?? '';
  if (mots.length >= 3 && PRENOMS_QUI_SE_COMPOSENT.some((p) => p.toLowerCase() === premier) && /^\p{L}/u.test(second) && !PARTICULE_DU_NOM.test(second)) {
    return `${mots[0]} ${capitaleDuSecond(second)}`;
  }
  return mots[0];
};

/** LE PRÉNOM D'USAGE d'une cliente : celui de sa fiche, sinon celui que le
    Trône devine de son nom. `repli` sert quand la fiche manque mais qu'un nom
    est connu ailleurs (le rendez-vous, la demande du site). */
const prenomDUsage = (c: { name?: unknown; prenomUsage?: unknown } | null | undefined, repli?: unknown): string => {
  const note = String(c?.prenomUsage ?? '').trim().replace(/\s+/g, ' ');
  return note || prenomDevine(c?.name ?? repli);
};
/* ⟨/prenom-d-usage⟩ */

/* ══ LE MESSAGE DU FOYER, 4 novembre 2026 ══════════════════════════════
   « Un seul message par foyer, au numéro du foyer, qui nomme toutes les
   têtes » (maquette du parcours du foyer, arbitrage 3). Recopié À
   L'IDENTIQUE de `src/shared/message-du-foyer-pur.ts` ; la porte d'Opale y
   lit les têtes qu'une ligne nomme, et le facteur relit le foyer avant
   l'envoi. Le banc des douze lunes compare les copies. ══ */
/* ⟨message-du-foyer⟩ */
/** Une tête à prévenir : son rendez-vous, et le numéro où on la prévient. */
export type TeteAPrevenir = { id: string; clientId?: string; foyerId?: string; date: string; time?: string; status?: string; numero?: string | null };
/** Un foyer à prévenir : la tête qui porte le message (la plus tôt), puis toutes, dans l'ordre. */
export type FoyerAPrevenir<T extends TeteAPrevenir> = { cle: string; porteur: T; tetes: T[] };

/** Le prénom d'une fiche, jamais le nom de famille. TOUT LE PRÉNOM COMPOSÉ
    (7 novembre 2026) : son prénom d'usage (`usage`), sinon celui que le Trône
    devine du nom (`prenomDUsage`, la copie ⟨prenom-d-usage⟩ des fonctions). */
export const prenomDeLaTete = (nom: unknown, usage?: unknown): string => prenomDUsage({ name: nom, prenomUsage: usage });

/** Les prénoms dits en français : « Jade », « Jade et Faith », « Jade, Faith et Maëlle ». */
export function prenomsDits(prenoms: readonly string[]): string {
  const p = prenoms.map((x) => String(x ?? '').trim()).filter(Boolean);
  if (p.length <= 1) return p[0] ?? '';
  return `${p.slice(0, -1).join(', ')} et ${p[p.length - 1]}`;
}

/** La clé du numéro : 229 et huit chiffres, que Meta et la fiche l'écrivent avec ou sans le 01. */
export const cleDuNumeroDuFoyer = (brut: unknown): string => {
  const d = String(brut ?? '').replace(/\D/g, '');
  const n = !d ? '' : d.startsWith('00229') ? d.slice(2) : d.startsWith('229') ? d : d.length === 10 && d.startsWith('01') ? `229${d}` : d.length === 8 ? `22901${d}` : d;
  return n.length === 13 && n.startsWith('22901') ? `229${n.slice(5)}` : n;
};

const heureDuFoyer = (t?: string): string => (/^\d{1,2}:\d{2}$/.test(t ?? '') ? (t as string).padStart(5, '0') : '23:59');
const plusTot = (a: TeteAPrevenir, b: TeteAPrevenir): number =>
  `${a.date} ${heureDuFoyer(a.time)} ${a.id}`.localeCompare(`${b.date} ${heureDuFoyer(b.time)} ${b.id}`);

/** Le foyer d'une tête : son `foyerId`, son jour, la clé de son numéro. Sans foyer ou sans numéro, elle est seule. */
export const cleDuFoyer = (t: TeteAPrevenir): string => {
  const numero = cleDuNumeroDuFoyer(t.numero);
  return t.foyerId && t.date && numero ? `foyer|${t.foyerId}|${t.date.slice(0, 10)}|${numero}` : `seule|${t.id}`;
};

/** LES FOYERS À PRÉVENIR : un groupe par foyer, par jour et par numéro, jamais un rendez-vous annulé ; la tête la plus tôt porte le message. */
export function foyersAPrevenir<T extends TeteAPrevenir>(tetes: readonly T[]): FoyerAPrevenir<T>[] {
  const groupes = new Map<string, T[]>();
  const vus = new Set<string>();
  for (const t of tetes) {
    if (!t || !t.id || t.status === 'annulé' || vus.has(t.id)) continue;
    vus.add(t.id);
    const cle = cleDuFoyer(t);
    groupes.set(cle, [...(groupes.get(cle) ?? []), t]);
  }
  return [...groupes.entries()]
    .map(([cle, g]) => { const tries = [...g].sort(plusTot); return { cle, porteur: tries[0], tetes: tries }; })
    .sort((a, b) => plusTot(a.porteur, b.porteur));
}

/** Les têtes du foyer, une fois par fiche. */
const unesParFiche = <T extends TeteAPrevenir>(f: FoyerAPrevenir<T>): T[] => {
  const vues = new Set<string>();
  return f.tetes.filter((t) => { const k = t.clientId || t.id; if (vues.has(k)) return false; vues.add(k); return true; });
};

/** L'APPEL DU MESSAGE : une fiche seule garde son appel (sa civilité) ; dès deux fiches, leurs prénoms. */
export function appelDuFoyer<T extends TeteAPrevenir>(f: FoyerAPrevenir<T>, appelSeule: (t: T) => string, prenomDe: (t: T) => string): string {
  const fiches = unesParFiche(f);
  return fiches.length <= 1 ? appelSeule(f.porteur) : prenomsDits(fiches.map(prenomDe));
}

/** Ce que la ligne d'envoi porte en plus pour un foyer de deux rendez-vous ou plus ; rien pour une tête seule. */
export function champsDuFoyer<T extends TeteAPrevenir>(f: FoyerAPrevenir<T>): { foyerId?: string; apptIds?: string[]; clientIds?: string[] } {
  if (f.tetes.length < 2) return {};
  return {
    ...(f.porteur.foyerId ? { foyerId: f.porteur.foyerId } : {}),
    apptIds: f.tetes.map((t) => t.id),
    clientIds: [...new Set(f.tetes.map((t) => t.clientId).filter((c): c is string => !!c))],
  };
}

const listeDuFoyer = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x ?? '')).filter(Boolean) : []);
/** Les rendez-vous qu'une ligne nomme : le sien, et ceux de son foyer. */
export const tetesNommees = (l: { apptId?: unknown; apptIds?: unknown } | null | undefined): string[] =>
  [...new Set([String(l?.apptId ?? ''), ...listeDuFoyer(l?.apptIds)].filter(Boolean))];
/** Les fiches qu'une ligne ou un message du fil nomme : la sienne, et celles de son foyer. */
export const fichesNommees = (l: { clientId?: unknown; clientIds?: unknown } | null | undefined): string[] =>
  [...new Set([String(l?.clientId ?? ''), ...listeDuFoyer(l?.clientIds)].filter(Boolean))];
/** Une ligne nomme-t-elle ce rendez-vous ? Le Trône lit ainsi la tournée de chaque tête. */
export const nommeLeRendezVous = (l: { apptId?: unknown; apptIds?: unknown } | null | undefined, apptId: string): boolean =>
  !!apptId && tetesNommees(l).includes(apptId);

/** LES TÊTES COUVERTES : les rendez-vous que nomme une ligne de ce type et de ce canal qui verrouille. */
export function tetesCouvertes<L extends { type?: unknown; canal?: unknown; apptId?: unknown; apptIds?: unknown }>(
  lignes: readonly (L | null | undefined)[], o: { type: string; canal: string; verrouille: (l: L) => boolean },
): Set<string> {
  const couvertes = new Set<string>();
  for (const l of lignes) {
    if (!l || String(l.type ?? '') !== o.type || String(l.canal ?? '') !== o.canal || !o.verrouille(l)) continue;
    for (const id of tetesNommees(l)) couvertes.add(id);
  }
  return couvertes;
}

/** UN FOYER QUI NE TIENT PLUS, relu avant l'envoi : une autre tête nommée a
    disparu, est annulée ou a changé de jour. Le message ne part pas
    (« périmé », sans la marque d'Opale) : la fonction qui l'a déposé le
    refait avec les têtes qui restent. `rdvs` : les rendez-vous relus. */
export function foyerQuiNeTientPlus(
  l: { apptId?: unknown; apptIds?: unknown; dateRdv?: unknown },
  rdvs: ReadonlyMap<string, { date?: string; status?: string } | null | undefined>,
): string | null {
  const jour = String(l.dateRdv ?? '').slice(0, 10);
  for (const id of tetesNommees(l)) {
    if (id === String(l.apptId ?? '')) continue;
    const r = rdvs.get(id);
    if (!r) return 'un rendez-vous du foyer n’existe plus : le message se refait sans lui';
    if (r.status === 'annulé') return 'un rendez-vous du foyer a été annulé : le message se refait sans lui';
    if (String(r.date ?? '').slice(0, 10) !== jour) return 'un rendez-vous du foyer a changé de jour : le message se refait sans lui';
  }
  return null;
}
/* ⟨/message-du-foyer⟩ */

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
  | 'merci-marraine' | 'perle-garder' | 'perle-avant' | 'perle' | 'campagne'
  /* Le modèle d'ouverture d'un envoi programmé (13 novembre 2026). */
  | 'ouverture';

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
  /* LES ENVOIS PROGRAMMÉS (13 novembre 2026) : elle n'a pas écrit depuis 24 h,
     le modèle d'ouverture part d'abord, le message programmé à sa réponse.
     Seul ce modèle passe la porte : le message lui-même est écrit par
     l'équipe, comme un envoi de Conversations. */
  {
    famille: 'ouverture', type: 'programme', modeles: ['un_message_pour_vous'], secrets: ['WA_TEMPLATE_OUVERTURE'],
    depose: 'le Trône (Programmer un WhatsApp), porté par envois-partent',
    pourQuoi: 'Le modèle d’ouverture d’un envoi programmé : « Bonjour {{1}}, la Maison MND a un message pour vous. » {{1}} l’appel ; le message programmé part à sa réponse.',
    quand: 'À l’heure dite d’un envoi programmé, quand elle n’a pas écrit depuis 24 h ; un seul par numéro tant qu’il attend sa réponse.',
    appel: 1, rdv: false, rappel: false, unParTete: true, porte: 'toutes',
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
  { qui: 'envois-partent (les envois programmés)', quoi: 'le message programmé lui-même, fenêtre ouverte ou à sa réponse : un texte écrit par l’équipe, jamais jugé ; seul son modèle d’ouverture passe la porte' },
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
/* ══ ARRÊTÉ D'AVANCE, MODÈLE EN PAUSE — 5 novembre 2026 (ce qui va partir) ══
   « Ne pas envoyer » (la direction, depuis l'onglet « À venir ») et
   l'interrupteur « En service / En pause » d'un modèle. Recopié À
   L'IDENTIQUE de `src/shared/arret-d-avance-pur.ts` ; le banc des douze
   lunes (R8) compare la copie. NE RIEN RETOUCHER ENTRE LES REPÈRES. ══ */
/* ⟨arret-d-avance⟩ */
/** Un message arrêté d'avance : sa clé, qui l'a arrêté et quand ; « Remettre » pose `remisLe`. */
type ArretDAvance = { id?: string; cle?: string; arreteLe?: string; arretePar?: string; remisLe?: string; remisPar?: string; [k: string]: unknown };
/** Un modèle Meta en pause chez nous : `enPause` vrai, qui, quand, pourquoi ; « Reprendre » le remet à faux. */
type PauseDuModele = { id?: string; modele?: string; enPause?: boolean; par?: string; le?: string; motif?: string; parOpale?: boolean; [k: string]: unknown };
/** Ce que la porte d'avance décide d'une ligne. `repli` : le modèle est en pause, son repli part à sa place. */
type VerdictDAvance =
  | { verdict: 'arrete'; cle: string; par: string; le: string; motif: string }
  | { verdict: 'en-pause'; modele: string; motif: string }
  | { verdict: 'repli'; modele: string; motif: string };
/** Ce qu'une ligne d'envoi porte et que la clé lit. */
type LigneDAvance = {
  id?: unknown; type?: unknown; genre?: unknown; apptId?: unknown; seanceId?: unknown; invoiceId?: unknown; rang?: unknown;
  clientId?: unknown; teteId?: unknown; subId?: unknown; campagneId?: unknown; dateRdv?: unknown; anniversaire?: unknown;
  colis?: { genre?: unknown; modele?: unknown; repli?: { modele?: unknown } | null } | null;
  [k: string]: unknown;
};

/** Le mot qui ouvre le détail d'une ligne arrêtée d'avance : le Trône le lit. */
const MARQUE_DE_L_ARRET = 'arrêté d’avance';
/** Opale signale un modèle au deuxième « non remis » de suite, le met en pause au cinquième. */
const NON_REMIS_SIGNALE_AU = 2;
const NON_REMIS_EN_PAUSE_AU = 5;

const motDAvance = (v: unknown): string => String(v ?? '').trim();

/** LA CLÉ D'UN MESSAGE : la même pour la prévision, la ligne en salle et la
    ligne prise par le facteur. Une ligne que rien ne décrit n'est qu'elle-même. */
function cleDuMessage(l: LigneDAvance | null | undefined): string {
  const type = motDAvance(l?.type);
  const id = motDAvance(l?.id);
  const rdv = motDAvance(l?.apptId);
  if ((type === 'rappel-j1' || type === 'confirmation' || type === 'reprise-j3') && rdv) return `${type}:${rdv}`;
  if (type === 'point-apres' || type === 'point-avant') {
    const seance = motDAvance(l?.seanceId) || rdv;
    if (seance) return `${type}:${seance}`;
  }
  if (type === 'relance-facture') {
    const m = /^rl-(.+)-(\d+)-whatsapp$/.exec(id);
    if (m) return `relance:${m[1]}:${m[2]}`;
    if (motDAvance(l?.invoiceId) && motDAvance(l?.rang)) return `relance:${motDAvance(l?.invoiceId)}:${motDAvance(l?.rang)}`;
  }
  if (type === 'rappel-echeance' || type === 'prix-revu') {
    const m = /^(?:rv|pr)-(.+)-whatsapp$/.exec(id);
    if (m) return `${type === 'prix-revu' ? 'prix-revu' : 'echeance'}:${m[1]}`;
  }
  if (type === 'fete-de-couronne') {
    const m = /^fc-(.+)-(\d{4})-whatsapp$/.exec(id);
    if (m) return `fete:${m[1]}:${m[2]}`;
  }
  if (type === 'avis-google' && motDAvance(l?.invoiceId)) return `avis:${motDAvance(l?.invoiceId)}`;
  if (type === 'papier-de-la-piece' && motDAvance(l?.invoiceId)) return `papier:${motDAvance(l?.invoiceId)}`;
  if (type === 'campagne' && motDAvance(l?.campagneId)) return `campagne:${motDAvance(l?.campagneId)}:${motDAvance(l?.clientId)}`;
  if (type === 'gerard') {
    const genre = motDAvance(l?.genre);
    const jour = /^gerard-(\d{4}-\d{2}-\d{2})-/.exec(id)?.[1] ?? '';
    if (genre === 'garder' && rdv) return `garder:${rdv}`;
    if (genre === 'anniversaire' && motDAvance(l?.clientId) && jour) return `anniv:${motDAvance(l?.clientId)}:${jour.slice(0, 4)}`;
    if (genre && motDAvance(l?.clientId) && jour) return `perle:${genre}:${motDAvance(l?.clientId)}:${jour}`;
  }
  return `ligne:${id}`;
}

/** L'ARRÊT EN VIGUEUR pour cette clé, ou null. Remis après le dernier arrêt : plus d'arrêt. */
function arretEnVigueur(cle: string, arrets: readonly (ArretDAvance | null | undefined)[] | null | undefined): ArretDAvance | null {
  if (!cle) return null;
  for (const a of arrets ?? []) {
    if (!a || motDAvance(a.cle ?? a.id) !== cle || !motDAvance(a.arreteLe)) continue;
    if (motDAvance(a.remisLe) && motDAvance(a.remisLe) >= motDAvance(a.arreteLe)) continue;
    return a;
  }
  return null;
}

/** LE MODÈLE EST-IL EN PAUSE ? La pause en vigueur, ou null. */
function modeleEnPause(modele: unknown, pauses: readonly (PauseDuModele | null | undefined)[] | null | undefined): PauseDuModele | null {
  const m = motDAvance(modele);
  if (!m) return null;
  for (const p of pauses ?? []) if (p && motDAvance(p.modele ?? p.id) === m && p.enPause === true) return p;
  return null;
}

/** « mercredi 4 novembre 2026 à 21 h 40 », à l'heure de Cotonou (UTC + 1, sans heure d'été). */
function momentDAvance(iso: unknown): string {
  const t = Date.parse(motDAvance(iso));
  if (!Number.isFinite(t)) return '';
  const d = new Date(t + 3_600_000);
  const JOURS_DITS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const MOIS_DITS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const j = d.getUTCDate();
  const mi = d.getUTCMinutes();
  return `${JOURS_DITS[d.getUTCDay()]} ${j === 1 ? '1er' : j} ${MOIS_DITS[d.getUTCMonth()]} ${d.getUTCFullYear()} à ${d.getUTCHours()} h${mi ? ` ${String(mi).padStart(2, '0')}` : ''}`;
}

/** LA PORTE D'AVANCE : l'arrêt de la direction d'abord, quel que soit le
    canal (le SMS d'un rappel arrêté ne part pas non plus) ; puis, pour un
    modèle WhatsApp, la pause : son repli part s'il en a un qui n'est pas en
    pause, sinon rien. `null` : rien ne l'arrête ici. */
function laPorteDAvance(
  l: LigneDAvance | null | undefined,
  o: { arrets?: readonly (ArretDAvance | null | undefined)[] | null; pauses?: readonly (PauseDuModele | null | undefined)[] | null },
): VerdictDAvance | null {
  const cle = cleDuMessage(l);
  const arret = arretEnVigueur(cle, o.arrets);
  if (arret) {
    const par = motDAvance(arret.arretePar) || 'la direction';
    const le = motDAvance(arret.arreteLe);
    const quand = momentDAvance(le);
    return { verdict: 'arrete', cle, par, le, motif: `${MARQUE_DE_L_ARRET} par ${par}${quand ? `, ${quand}` : ''}` };
  }
  if (motDAvance(l?.colis?.genre) !== 'whatsapp') return null;
  const modele = motDAvance(l?.colis?.modele);
  const pause = modeleEnPause(modele, o.pauses);
  if (!pause) return null;
  const repli = motDAvance(l?.colis?.repli?.modele);
  if (repli && repli !== modele && !modeleEnPause(repli, o.pauses)) {
    return { verdict: 'repli', modele: repli, motif: `le modèle ${modele} est en pause : ${repli} part à sa place` };
  }
  const par = motDAvance(pause.par);
  return { verdict: 'en-pause', modele, motif: `le modèle ${modele} est en pause${par ? ` (${par === 'Opale' ? 'mis en pause par Opale' : `par ${par}`})` : ''}` };
}

/** CE QUE LA LIGNE DEVIENT quand elle ne part pas. Arrêtée : « écarté », par
    qui l'a arrêtée ; le colis reste, « Remettre » peut la rendre tant que
    son heure n'est pas passée. En pause : « périmé », marqué par Opale (les
    fonctions ne la redéposent pas). Un repli n'écrit rien : la ligne part. */
function ligneRetenueDAvance(v: VerdictDAvance, maintenantIso: string): Record<string, unknown> | null {
  if (v.verdict === 'arrete') {
    return { statut: 'écarté', ecartePar: v.par, ecarteLe: maintenantIso, detail: v.motif, arretDAvance: { cle: v.cle, par: v.par, le: v.le } };
  }
  if (v.verdict === 'en-pause') return { statut: 'périmé', detail: `retenu par Opale : ${v.motif}`, modeleEnPause: v.modele };
  return null;
}

/** LA SÉRIE DES « NON REMIS » d'un modèle : du plus récent au plus ancien, les
    messages sortants que WhatsApp a jugés, comptés tant qu'ils sont « non
    remis ». Un message encore en route ne compte ni pour ni contre. */
function serieDeNonRemis(messages: readonly ({ sens?: unknown; etat?: unknown; quand?: unknown } | null | undefined)[]): number {
  const juges = messages
    .filter((m): m is { sens?: unknown; etat?: unknown; quand?: unknown } => !!m && motDAvance(m.sens) === 'sortant'
      && ['non-remis', 'remis', 'lu'].includes(motDAvance(m.etat)) && Number.isFinite(Date.parse(motDAvance(m.quand))))
    .sort((a, b) => Date.parse(motDAvance(b.quand)) - Date.parse(motDAvance(a.quand)));
  let n = 0;
  for (const m of juges) {
    if (motDAvance(m.etat) !== 'non-remis') break;
    n += 1;
  }
  return n;
}

/** CE QU'OPALE FAIT D'UNE SÉRIE : rien, le signaler, ou mettre le modèle en pause. */
function veilleDuModele(serie: number): 'rien' | 'signale' | 'pause' {
  if (serie >= NON_REMIS_EN_PAUSE_AU) return 'pause';
  if (serie >= NON_REMIS_SIGNALE_AU) return 'signale';
  return 'rien';
}

/** Ce qu'une fonction donne pour lire : la base, telle que le client Supabase la présente. */
type BaseDAvance = { from(t: string): { select(c: string): { range(de: number, a: number): PromiseLike<{ data: unknown[] | null; error: unknown }> } } };
/** LA LECTURE AU DÉPÔT : une fonction qui dépose lit les arrêts et les pauses
    une fois par passage. Une lecture qui échoue n'arrête rien ici : le
    facteur, lui, ne laisse rien partir sans les avoir lus. */
async function litLesArretsEtLesPauses(sb: BaseDAvance): Promise<{ arrets: ArretDAvance[]; pauses: PauseDuModele[] }> {
  const lis = async (t: string): Promise<Record<string, unknown>[]> => {
    try {
      const { data, error } = await sb.from(t).select('id, data').range(0, 4999);
      if (error) return [];
      return ((data ?? []) as { id?: unknown; data?: Record<string, unknown> | null }[]).map((r) => ({ ...(r?.data ?? {}), id: String(r?.id ?? '') }));
    } catch {
      return [];
    }
  };
  const [arrets, pauses] = await Promise.all([lis('envois_arretes'), lis('modeles_en_pause')]);
  return { arrets: arrets as ArretDAvance[], pauses: pauses as PauseDuModele[] };
}
/* ⟨/arret-d-avance⟩ */

/* ══ LES ENVOIS PROGRAMMÉS — 13 novembre 2026 ══════════════════════════
   « Programmer un WhatsApp » (maquette validée, « construis »). La règle est
   RECOPIÉE de `src/shared/envois-programmes-pur.ts`
   (`node scripts/terminer-copie-serveur.mjs` ; douze lunes R8 et
   verifie-les-envois-programmes). NE RIEN RETOUCHER ENTRE LES REPÈRES. */
/* ⟨envois-programmes⟩ */
/** Le type des lignes d'envoi programmées. */
export const TYPE_PROGRAMME = 'programme';
/** « Me demander avant » : l'heure est venue, la ligne attend le oui. Aussi
    les appels convertis : rien ne part sans le oui. */
export const A_VALIDER = 'à-valider';
/** Le modèle d'ouverture est parti : la ligne attend sa réponse. */
export const ATTEND_SA_REPONSE = 'attend-sa-réponse';
/** Message privé, fenêtre fermée : une consigne à Opale (WhatsApp Web). */
export const CONFIE_A_OPALE = 'confié-à-opale';
/** Par l'app : le téléphone a sonné, une main l'envoie de son WhatsApp. */
export const PAR_L_APP = 'par-l-app';
/** Une pièce du Trône (sa facture, son reçu) à tirer par un Trône ouvert. */
export const PIECE_A_TIRER = 'à-préparer';
/** « À revoir » : rien n'est parti, la ligne dit pourquoi. Le même mot que
    le journal (« échec ») : aucune fonction ne retente une ligne programmée. */
export const A_REVOIR = 'échec';

export type Repetition = 'jamais' | 'jour' | 'semaine' | 'mois' | 'annee';
export const REPETITIONS: readonly Repetition[] = ['jamais', 'jour', 'semaine', 'mois', 'annee'];
export type AgentDuProgramme = 'perle' | 'grenat';
export const NOM_DE_L_AGENT: Record<AgentDuProgramme, string> = { perle: 'Perle', grenat: 'Grenat' };
export type ModeDuProgramme = 'seul' | 'app';
export type TelephoneDuProgramme = 'moi' | 'comptoir';

/** La pièce jointe. Un fichier de l'appareil se garde dans le compartiment
    privé `envois-programmes` (0206) ; une pièce du Trône (facture, reçu) se
    TIRE au moment d'envoyer : un Trône ouvert fait son PDF et le range au
    même endroit (`chemin`), juste avant que le facteur la porte. */
export type PieceDuProgramme =
  | { genre: 'fichier'; chemin: string; nom: string; type: string; octets: number }
  | { genre: 'facture' | 'recu'; invoiceId?: string; chemin?: string; nom?: string; type?: string; octets?: number; tireeLe?: string };

export type ColisProgramme = {
  genre: 'programme';
  /** Le numéro au moment de programmer ; la fiche relue l'emporte. */
  numero: string;
  /** Le message, son prénom posé et la devise de la Maison au bout. */
  texte: string;
  piece?: PieceDuProgramme;
  agent: AgentDuProgramme;
  /** Le nom au journal et au fil : « Perle », « Grenat ». */
  parQui: string;
  /** Un message personnel, au nom de Yéman : fenêtre fermée, Opale l'envoie
      par WhatsApp Web, sans modèle. */
  prive?: boolean;
  mode: ModeDuProgramme;
  telephone?: TelephoneDuProgramme;
  demander?: boolean;
  repeter: Repetition;
  /** Le {{1}} du modèle d'ouverture : « Mme Awa ». */
  appel: string;
};

/** Ce que le facteur et le Trône lisent d'une ligne programmée. */
export type LigneProgrammee = {
  id: string;
  type: string;
  canal: string;
  statut: string;
  branchId?: string;
  clientId?: string;
  prenom?: string;
  numero?: string;
  /** Le rendez-vous dont parle le message : relu avant de partir. */
  apptId?: string;
  dateRdv?: string;
  heure?: string;
  serieId: string;
  /** La première fois de la série : les suivantes se comptent depuis elle. */
  serieA?: string;
  occurrence: number;
  lotId?: string;
  /** L'instant voulu, et celui où il pourra partir. */
  prevuA: string;
  partA?: string;
  calme?: boolean;
  parLaMain?: boolean;
  modele?: string;
  auteur?: string;
  auteurUserId?: string;
  deposeLe?: string;
  quand?: string;
  depuisUnAppel?: string;
  ouiLe?: string;
  ouiPar?: string;
  porteLe?: string;
  porteDe?: string;
  waOuvertureId?: string;
  consigneId?: string;
  confieLe?: string;
  sonneLe?: string;
  prevenuLe?: string;
  parLApp?: boolean;
  parOpale?: boolean;
  suivanteId?: string;
  waMessageId?: string;
  detail?: string;
  colis: ColisProgramme;
  [k: string]: unknown;
};

/* ── Le temps, à Cotonou : UTC + 1, toute l'année ── */
const DECALAGE_DU_PROGRAMME_MS = 3_600_000;
/** L'instant d'un jour et d'une heure de Cotonou. */
export const instantDuProgramme = (jour: string, hhmm: string): number => {
  const h = /^\d{1,2}:\d{2}$/.test(hhmm ?? '') ? hhmm.padStart(5, '0') : '09:00';
  return Date.parse(`${jour}T${h}:00+01:00`);
};
/** Le jour de Cotonou d'un instant. */
export const jourDuProgramme = (ms: number): string => new Date(ms + DECALAGE_DU_PROGRAMME_MS).toISOString().slice(0, 10);
const joursDuMois = (annee: number, mois: number): number => new Date(Date.UTC(annee, mois + 1, 0)).getUTCDate();

/** LA FOIS SUIVANTE d'une série, après `apresMs`, comptée depuis sa première
    fois (`ancreIso`) : le 31 janvier chaque mois donne le 28 février puis le
    31 mars, jamais le 28 mars ; le 29 février chaque année, le 28 les
    autres années. `null` : une fois seulement. */
export function prochaineFois(ancreIso: string, r: Repetition, apresMs: number): string | null {
  if (r === 'jamais') return null;
  const t0 = Date.parse(ancreIso);
  if (!Number.isFinite(t0)) return null;
  const l = new Date(t0 + DECALAGE_DU_PROGRAMME_MS);
  const Y = l.getUTCFullYear(); const M = l.getUTCMonth(); const D = l.getUTCDate();
  const h = l.getUTCHours(); const mi = l.getUTCMinutes();
  for (let n = 1; n <= 40_000; n += 1) {
    let ms: number;
    if (r === 'jour') ms = Date.UTC(Y, M, D + n, h, mi);
    else if (r === 'semaine') ms = Date.UTC(Y, M, D + 7 * n, h, mi);
    else if (r === 'mois') {
      const y = Y + Math.floor((M + n) / 12); const m = (M + n) % 12;
      ms = Date.UTC(y, m, Math.min(D, joursDuMois(y, m)), h, mi);
    } else ms = Date.UTC(Y + n, M, Math.min(D, joursDuMois(Y + n, M)), h, mi);
    ms -= DECALAGE_DU_PROGRAMME_MS;
    if (ms > apresMs) return new Date(ms).toISOString();
  }
  return null;
}

/** LA LIGNE DE LA FOIS SUIVANTE : un envoi répété se reprogramme seul, UNE
    fois (son identifiant est fixe, `<série>-<n+1>` : l'écrire deux fois ne
    crée rien de plus). Elle repart du début : ni oui, ni porte, ni consigne ;
    une pièce du Trône se tirera de nouveau, un fichier se garde. */
export function ligneSuivante(l: LigneProgrammee, maintenantMs: number): LigneProgrammee | null {
  const c = l.colis;
  if (!c || c.genre !== 'programme') return null;
  const ancre = l.serieA ?? l.prevuA;
  const prevu = Date.parse(l.prevuA);
  const suivant = prochaineFois(ancre, c.repeter, Math.max(Number.isFinite(prevu) ? prevu : 0, maintenantMs));
  if (!suivant) return null;
  const iso = new Date(maintenantMs).toISOString();
  const piece: PieceDuProgramme | undefined = !c.piece ? undefined
    : c.piece.genre === 'fichier' ? c.piece
      : { genre: c.piece.genre, ...(c.piece.invoiceId ? { invoiceId: c.piece.invoiceId } : {}) };
  return {
    id: `${l.serieId}-${l.occurrence + 1}`, type: TYPE_PROGRAMME, canal: 'whatsapp', statut: 'en-attente',
    ...(l.branchId ? { branchId: l.branchId } : {}), ...(l.clientId ? { clientId: l.clientId } : {}),
    ...(l.prenom ? { prenom: l.prenom } : {}), ...(l.numero ? { numero: l.numero } : {}),
    serieId: l.serieId, serieA: ancre, occurrence: l.occurrence + 1, ...(l.lotId ? { lotId: l.lotId } : {}),
    prevuA: suivant, partA: suivant, calme: false, ...(l.modele ? { modele: l.modele } : {}),
    ...(l.auteur ? { auteur: l.auteur } : {}), ...(l.auteurUserId ? { auteurUserId: l.auteurUserId } : {}),
    deposeLe: iso, quand: iso, apptId: '', dateRdv: '',
    colis: { ...c, ...(piece ? { piece } : {}) },
  };
}

/* ── Le numéro, sa clé, la fenêtre ── */
/** Le numéro au format de Meta : 229 et ses chiffres (la règle de `numeroWa`). */
export const numeroDuProgramme = (brut: unknown): string => {
  const d = String(brut ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00229')) return d.slice(2);
  if (d.startsWith('229')) return d;
  if (d.length === 10 && d.startsWith('01')) return `229${d}`;
  if (d.length === 8) return `22901${d}`;
  return d;
};
/** Ce qu'on relit de la fiche avant d'envoyer. */
export type FicheDuProgramme = {
  name?: unknown; phone?: unknown; phone2?: unknown; archived?: unknown;
  nouvelles?: { oui?: unknown; par?: unknown } | null;
  [k: string]: unknown;
};
/** LE NUMÉRO OÙ L'ENVOYER, relu : celui de la fiche d'aujourd'hui (le premier,
    sinon le second), sinon celui noté en programmant. */
export const numeroDeLEnvoi = (l: Pick<LigneProgrammee, 'clientId' | 'colis'>, fiche: FicheDuProgramme | null | undefined): string =>
  numeroDuProgramme(fiche?.phone) || numeroDuProgramme(fiche?.phone2) || numeroDuProgramme(l.colis?.numero);

/** Un message du fil, tel qu'on le lit pour la fenêtre. */
export type MessageDuProgramme = { sens?: unknown; canal?: unknown; quand?: unknown; [k: string]: unknown };
export const FENETRE_DU_PROGRAMME_MS = 24 * 3_600_000;
const entrantVrai = (m: MessageDuProgramme | null | undefined): boolean =>
  !!m && m.sens === 'entrant' && m.canal !== 'site';
/** ELLE A ÉCRIT DANS LES 24 HEURES : seul ce qu'ELLE envoie ouvre la fenêtre,
    jamais nos messages ; une demande du site n'ouvre rien (la règle de
    `whatsapp-envoi` et de `fenetreDe`). `messages` : le fil de son numéro. */
export function fenetreOuverte(messages: readonly (MessageDuProgramme | null | undefined)[], maintenantMs: number): boolean {
  return messages.some((m) => {
    if (!entrantVrai(m)) return false;
    const t = Date.parse(String(m?.quand ?? ''));
    return Number.isFinite(t) && t > maintenantMs - FENETRE_DU_PROGRAMME_MS && t <= maintenantMs + 5 * 60_000;
  });
}
/** ELLE A RÉPONDU au modèle d'ouverture : un message d'elle après son départ. */
export function aReponduDepuis(messages: readonly (MessageDuProgramme | null | undefined)[], depuisIso: string | undefined): boolean {
  const d = Date.parse(String(depuisIso ?? ''));
  if (!Number.isFinite(d)) return false;
  return messages.some((m) => entrantVrai(m) && Date.parse(String(m?.quand ?? '')) > d);
}

/* ── Ce que le facteur relit avant de porter ── */
export const MOTIF_FICHE_DISPARUE = 'la fiche n’existe plus';
export const MOTIF_SANS_NUMERO = 'pas de numéro WhatsApp sur la fiche';
export const MOTIF_STOP = 'elle a écrit STOP : la Maison ne lui écrit plus seule';
export const MOTIF_OPALE_ENDORMIE = 'message privé, elle n’a pas écrit depuis 24 h, et Opale n’était pas éveillée pour l’envoyer par WhatsApp Web';
export const MOTIF_MODELE_PAS_APPROUVE = 'elle n’a pas écrit depuis 24 h, et le modèle d’ouverture n’est pas encore approuvé chez Meta : rien n’est parti';
export const MOTIF_SANS_REPONSE = 'elle n’a pas répondu au modèle d’ouverture en sept jours : le message n’est pas parti';
export const MOTIF_SANS_AUTEUR = 'message privé sans auteur connecté : Opale ne reçoit une consigne qu’au nom de la direction';
export const MOTIF_CONSIGNE_TROP_LONGUE = 'le message et sa pièce dépassent les mille signes d’une consigne à Opale';
/** Sans réponse au modèle d'ouverture en sept jours, la ligne passe à revoir. */
export const ATTENTE_DE_LA_REPONSE_MS = 7 * 86_400_000;

/** POURQUOI IL NE PART PAS, relu à l'heure dite : la fiche existe encore, le
    numéro aussi, elle n'a pas écrit STOP, et le rendez-vous dont parle le
    message n'a été ni annulé ni déplacé. `null` : tout tient. */
export function pourquoiLeProgrammeNePartPas(
  l: Pick<LigneProgrammee, 'clientId' | 'colis' | 'apptId' | 'dateRdv' | 'heure'>,
  o: { fiche?: FicheDuProgramme | null; rdv?: { date?: string; time?: string; status?: string } | null; maintenantMs: number },
): string | null {
  if (l.clientId && !o.fiche) return MOTIF_FICHE_DISPARUE;
  if (!numeroDeLEnvoi(l, o.fiche)) return MOTIF_SANS_NUMERO;
  if (o.fiche?.nouvelles && o.fiche.nouvelles.oui === false && o.fiche.nouvelles.par === 'stop') return MOTIF_STOP;
  if (l.apptId) {
    const r = o.rdv;
    if (!r) return 'le rendez-vous dont parle le message n’existe plus';
    if (r.status === 'annulé') return 'le rendez-vous dont parle le message a été annulé';
    if ((r.date ?? '') !== (l.dateRdv ?? '') || (r.time ?? '') !== (l.heure ?? '')) return 'le rendez-vous dont parle le message a été déplacé';
    const h = /^\d{1,2}:\d{2}$/.test(r.time ?? '') ? (r.time as string).padStart(5, '0') : '23:59';
    const moment = Date.parse(`${r.date}T${h}:00+01:00`);
    if (Number.isFinite(moment) && moment <= o.maintenantMs) return 'l’heure du rendez-vous dont parle le message est passée';
  }
  return null;
}

/* ── La voie ── */
/** Opale veille : son guetteur a regardé depuis trois minutes, ou elle est
    passée au Trône depuis quarante-cinq (son tour du soir est de trente). */
export function opaleEveillee(a: { empreinte?: unknown; vu_le?: unknown; guette_le?: unknown } | null | undefined, maintenantMs: number): boolean {
  if (!a || !a.empreinte) return false;
  const g = Date.parse(String(a.guette_le ?? ''));
  const v = Date.parse(String(a.vu_le ?? ''));
  return (Number.isFinite(g) && maintenantMs - g <= 3 * 60_000) || (Number.isFinite(v) && maintenantMs - v <= 45 * 60_000);
}
/** Une pièce du Trône pas encore tirée. */
export const pieceATirer = (p: PieceDuProgramme | undefined): boolean => !!p && p.genre !== 'fichier' && !p.chemin;

export type FaitsDeLaVoie = {
  fenetreOuverte: boolean;
  opaleEveillee: boolean;
  /** Le nom du modèle d'ouverture approuvé (le secret `WA_TEMPLATE_OUVERTURE`) ; vide : pas encore approuvé. */
  modeleDOuverture: string;
  /** Une autre ligne a déjà ouvert la porte à ce numéro et attend sa réponse. */
  porteOuverteDe: string | null;
};
export type VoieDuProgramme =
  | { voie: 'app' } | { voie: 'demander' } | { voie: 'tirer' } | { voie: 'texte' } | { voie: 'opale' }
  | { voie: 'ouverture' } | { voie: 'rejoint'; de: string } | { voie: 'revoir'; motif: string };

/** PAR OÙ IL PART, à l'heure dite. Par l'app : le téléphone de qui l'a
    programmé sonne, pas de règle des 24 h. « Me demander avant » : rien sans
    le oui. Une pièce du Trône se tire d'abord. Elle a écrit dans les 24 h :
    le message part tel quel, par le WhatsApp de la Maison. Sinon : privé,
    Opale l'envoie par WhatsApp Web ; sinon le modèle d'ouverture (un seul
    par numéro : une porte déjà ouverte, on l'attend avec elle). */
export function voieDuProgramme(l: Pick<LigneProgrammee, 'colis' | 'ouiLe'>, f: FaitsDeLaVoie): VoieDuProgramme {
  const c = l.colis;
  if (c.mode === 'app') return { voie: 'app' };
  if (c.demander === true && !l.ouiLe) return { voie: 'demander' };
  if (pieceATirer(c.piece)) return { voie: 'tirer' };
  if (f.fenetreOuverte) return { voie: 'texte' };
  if (c.prive === true) return f.opaleEveillee ? { voie: 'opale' } : { voie: 'revoir', motif: MOTIF_OPALE_ENDORMIE };
  if (f.porteOuverteDe) return { voie: 'rejoint', de: f.porteOuverteDe };
  if (!f.modeleDOuverture) return { voie: 'revoir', motif: MOTIF_MODELE_PAS_APPROUVE };
  return { voie: 'ouverture' };
}

/* ── Le modèle d'ouverture (docs/modeles-whatsapp-envois-programmes.md) ── */
/** Le nom proposé chez Meta ; le secret `WA_TEMPLATE_OUVERTURE` le pose,
    APRÈS l'approbation. */
export const MODELE_D_OUVERTURE = 'un_message_pour_vous';
/** Le corps exact déposé chez Meta, {{1}} l'appel. */
export const CORPS_D_OUVERTURE = 'Bonjour {{1}}, la Maison MND a un message pour vous. Touchez « Lire le message », ou répondez simplement, pour le recevoir ici.';
export const texteDOuverture = (appel: string): string => CORPS_D_OUVERTURE.replace('{{1}}', String(appel ?? '').trim() || 'Madame, Monsieur');
export const composantsDOuverture = (appel: string): unknown[] =>
  [{ type: 'body', parameters: [{ type: 'text', text: String(appel ?? '').replace(/\s+/g, ' ').trim() || 'Madame, Monsieur' }] }];

/* ── Ce qui part chez Meta ── */
export type FamilleDuFichier = 'image' | 'video' | 'audio' | 'document';
export const familleDuFichier = (type: string): FamilleDuFichier => {
  const m = String(type ?? '').toLowerCase();
  if (m === 'image/jpeg' || m === 'image/png') return 'image';
  if (m === 'video/mp4' || m === 'video/3gpp') return 'video';
  if (m.startsWith('audio/')) return 'audio';
  return 'document';
};
/** Les messages à porter : le texte seul, ou la pièce avec sa légende (1 024
    signes au plus, jamais sur un son), ou la pièce puis le texte. */
export function messagesAPorter(numero: string, texte: string, media?: { id: string; famille: FamilleDuFichier; nom: string } | null): Record<string, unknown>[] {
  const t = String(texte ?? '').trim();
  const leTexte = { messaging_product: 'whatsapp', recipient_type: 'individual', to: numero, type: 'text', text: { body: t, preview_url: true } };
  if (!media) return [leTexte];
  const legende = media.famille !== 'audio' && t.length > 0 && t.length <= 1024;
  const corps: Record<string, unknown> = { id: media.id };
  if (media.famille === 'document') corps.filename = media.nom;
  if (legende) corps.caption = t;
  const laPiece = { messaging_product: 'whatsapp', recipient_type: 'individual', to: numero, type: media.famille, [media.famille]: corps };
  return legende || !t ? [laPiece] : [laPiece, leTexte];
}

/** LA CLÉ D'UNE PHASE (réservée au fil avant de parler, comme la clé d'une
    pièce) : la même ligne, la même phase, un seul message, même si le facteur
    est coupé au milieu et reprend. */
export const cleDuProgramme = (id: string, phase: 'ouverture' | 'message'): string => `programme-${id}-${phase}`;

/* ── La consigne à Opale (charte, section 22) ── */
export const DEBUT_DE_LA_CONSIGNE = 'Envoi programmé';
/** LA CONSIGNE : qui l'a programmé, le numéro, le texte mot pour mot, la pièce
    (un lien signé de vingt-quatre heures), et la réponse attendue. `null` :
    plus de mille signes, la consigne ne la porterait pas. */
export function texteDeLaConsigne(o: { auteur: string; numero: string; prenom?: string; texte: string; piece?: { nom: string; lien: string } | null }): string | null {
  const t = [
    `${DEBUT_DE_LA_CONSIGNE} par ${o.auteur || 'la direction'} : à envoyer maintenant depuis WhatsApp Web, au +${o.numero}${o.prenom ? ` (${o.prenom})` : ''}, une seule fois.`,
    'Le message, mot pour mot :',
    String(o.texte ?? '').trim(),
    ...(o.piece ? [`La pièce jointe à joindre (${o.piece.nom}) : ${o.piece.lien}`] : []),
    'Parti : consigne repondre --statut faite. Impossible : --statut en-attente, et pourquoi.',
  ].join('\n');
  return t.length <= 1000 ? t : null;
}
/* ⟨/envois-programmes⟩ */

const VERSION = '2026-11-13-a · la porte d’Opale : jamais deux fois, pas de rappel à qui vient de confirmer, civilité juste ; un message par foyer, chaque tête nommée couverte, le foyer relu avant l’envoi ; le papier d’une pièce déposé par Grenat : la pièce relue, sa clé réservée, sa marque posée ; ce qui va partir : arrêté d’avance, modèle en pause, cinq non remis de suite et Opale le met en pause ; la prochaine séance de l’abonnée (apres-seance) relue avant de partir : une suite posée pendant l’attente, ou une séance qui n’est plus marquée faite, et elle ne part pas ; les envois programmés (13 novembre 2026) : l’heure exacte, même la nuit, relus avant de partir, le texte et sa pièce dans la fenêtre, sinon le modèle d’ouverture puis le message à sa réponse, ou Opale par WhatsApp Web pour un message privé, me demander avant, par l’app, la fois suivante posée une fois';

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
  'avis-google': 'Demande d’avis', 'fin-de-paquet': 'Fin de paquet', programme: 'Envoi programmé',
};

/* ══ CE QUE LA PORTE D'OPALE LIT — 4 novembre 2026 ══════════════════════
   Trois lectures, pour la seule ligne jugée : la fiche qui reçoit (sa
   civilité), les lignes d'envoi voisines (le même rendez-vous, ou la même
   fiche depuis vingt-quatre heures) et le fil de son numéro (sous toutes ses
   formes, depuis le dépôt et au moins vingt-quatre heures). Une lecture qui
   échoue ne laisse pas juger : `null`, et la ligne redevient un échec à
   retenter, jamais un message parti sans sa porte.

   LE FOYER AUSSI (4 novembre 2026) : les lignes du même foyer (celui de la
   ligne, ou celui du rendez-vous relu), pour qu'une tête déjà nommée par le
   message du foyer ne reparte pas sous une autre ligne. */
type Sb = ReturnType<typeof createClient>;
async function faitsDeLaPorte(sb: Sb, l: LigneALaPorte, rdv: RdvALaPorte | null, maintenantMs: number): Promise<ContexteDeLaPorte | null> {
  const depuis = depuisPourLaPorte(l, maintenantMs);
  const idFiche = String(l.pourId || l.clientId || '');
  const variantes = variantesDuNumero(l.colis?.numero);
  const foyer = String(l.foyerId || (l.apptId ? rdv?.foyerId ?? '' : '') || '');
  const [fiche, voisines, fil, duFoyer] = await Promise.all([
    idFiche ? sb.from('clients').select('id, data').eq('id', idFiche).maybeSingle() : Promise.resolve({ data: null, error: null }),
    l.apptId
      ? sb.from('envois').select('id, data').eq('data->>apptId', l.apptId).limit(200)
      : l.clientId
        ? sb.from('envois').select('id, data').eq('data->>clientId', l.clientId).gte('data->>quand', depuis).limit(300)
        : Promise.resolve({ data: [], error: null }),
    variantes.length
      ? sb.from('messages_wa').select('data').in('data->>numero', variantes).gte('data->>quand', depuis).limit(500)
      : Promise.resolve({ data: [], error: null }),
    foyer
      ? sb.from('envois').select('id, data').eq('data->>foyerId', foyer).limit(200)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (fiche.error || voisines.error || fil.error || duFoyer.error) return null;
  const lignes = new Map<string, LigneALaPorte>();
  for (const r of [...(voisines.data ?? []), ...(duFoyer.data ?? [])] as { id: string; data: LigneALaPorte }[]) lignes.set(r.id, { ...(r.data ?? {}), id: r.id });
  return {
    maintenantMs,
    ...(l.apptId ? { rdv } : {}),
    fiche: ((fiche.data as { data?: FicheALaPorte } | null)?.data ?? null),
    envois: [...lignes.values()],
    messages: ((fil.data ?? []) as { data: MessageALaPorte }[]).map((r) => r.data ?? {}),
  };
}

/* ══ CE QUI VA PARTIR : LA PORTE D'AVANCE — 5 novembre 2026 ═══════════════
   « Qu'on puisse arrêter le message au besoin », « mettre des modèles en
   pause » (Yéman, 4 novembre 2026). Deux lectures par réveil, une fois pour
   toutes les lignes portées : les messages arrêtés d'avance par la direction
   (`envois_arretes`) et les modèles en pause (`modeles_en_pause`, 0197). Une
   lecture qui échoue ne laisse rien partir sans elles : `null`, et chaque
   ligne redevient un échec que sa fonction retentera. Seule une table encore
   absente (0197 pas encore passée) laisse le facteur porter comme avant.

   OPALE VEILLE : avant de porter un modèle WhatsApp, la série de ses « non
   remis » les plus récents (depuis quatorze jours, et depuis qu'une main l'a
   repris) se lit au fil ; à cinq de suite, Opale le met en pause (`parOpale`)
   et rien ne part plus avec lui tant que la direction ne l'a pas repris. */
type AvanceDuReveil = { arrets: ArretDAvance[]; pauses: PauseDuModele[] };
const tableAbsente = (e: { code?: string; message?: string } | null | undefined): boolean =>
  !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|could not find the table/i.test(String(e.message ?? '')));
async function litLAvance(sb: Sb): Promise<AvanceDuReveil | null> {
  const [a, p] = await Promise.all([
    sb.from('envois_arretes').select('id, data').limit(5000),
    sb.from('modeles_en_pause').select('id, data').limit(500),
  ]);
  if ((a.error && !tableAbsente(a.error)) || (p.error && !tableAbsente(p.error))) return null;
  return {
    arrets: ((a.error ? [] : a.data ?? []) as { id: string; data: ArretDAvance }[]).map((r) => ({ ...(r.data ?? {}), id: r.id })),
    pauses: ((p.error ? [] : p.data ?? []) as { id: string; data: PauseDuModele }[]).map((r) => ({ ...(r.data ?? {}), id: r.id })),
  };
}
const VEILLE_DES_NON_REMIS_MS = 14 * 86_400_000;
async function serieDuModele(sb: Sb, modele: string, depuisMs: number): Promise<number | null> {
  const { data, error } = await sb.from('messages_wa').select('data').eq('data->>modele', modele).eq('data->>sens', 'sortant')
    .gte('data->>quand', new Date(depuisMs).toISOString()).limit(500);
  if (error) return null;
  return serieDeNonRemis(((data ?? []) as { data: Record<string, unknown> }[]).map((r) => r.data ?? {}));
}

/* ══ LE PAPIER D'UNE PIÈCE, DÉPOSÉ PAR GRENAT — 4 novembre 2026 ═══════════
   La clôture de Grenat (`cloture-du-jour`) dépose le reçu ou la facture pas
   encore partis ; le Trône en fait le PDF et pose la ligne en salle. Ici,
   juste avant Meta, les DEUX VERROUS d'« une pièce, un seul WhatsApp »
   (une-piece-un-message-pur.ts) :
     ① la pièce relue : effacée, ou portant déjà sa marque `whatsapp`, rien
        ne part (« périmé », et pourquoi) ;
     ② la CLÉ DE LA PIÈCE (`piece-<id>`) réservée dans `messages_wa`, à
        l'identifiant que `whatsapp-envoi` en dérive (SHA-256) : un poste du
        comptoir qui enverrait le même papier se heurte à elle et reçoit
        « déjà ». Prise et pas reprenable : rien ne part. Meta refuse : la
        clé est rendue (« non-remis »), comme `whatsapp-envoi` le fait.
   Parti, la ligne réservée devient le message du fil (son `waId`), et la
   pièce reçoit sa marque, si aucune n'est venue entre-temps. */
const TYPE_DU_PAPIER = 'papier-de-la-piece';
const RESERVATION_ABANDONNEE_MS = 5 * 60 * 1000;
const idDeLaCle = async (cle: string): Promise<string> => {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(cle)));
  return `wa-cle-${[...h.slice(0, 16)].map((o) => o.toString(16).padStart(2, '0')).join('')}`;
};
type ReservationDuPapier = { id: string; data: Record<string, unknown> } | { refus: string };
async function reserveLePapier(sb: Sb, l: Ligne, colis: { numero: string; modele: string; parQui?: string }): Promise<ReservationDuPapier> {
  const pieceId = String(l.data.invoiceId ?? '');
  if (!pieceId) return { refus: 'ligne de papier sans pièce' };
  const { data: piece, error } = await sb.from('invoices').select('id, data').eq('id', pieceId).maybeSingle();
  if (error) return { refus: `la pièce n’a pas pu être relue : ${String(error.message ?? '').slice(0, 80)}` };
  if (!piece) return { refus: 'la pièce n’existe plus' };
  if ((piece.data as { whatsapp?: { partieLe?: string } } | null)?.whatsapp?.partieLe) return { refus: 'déjà parti : la pièce porte sa marque' };
  const cleUnique = `piece-${pieceId}`;
  const id = await idDeLaCle(cleUnique);
  const quand = new Date().toISOString();
  const data = {
    id, branchId: l.data.branchId, sens: 'sortant', numero: colis.numero, clientId: l.data.clientId,
    texte: `Modèle « ${colis.modele} »`, type: 'text', quand, etat: 'en-route', modele: colis.modele, parQui: colis.parQui ?? 'Grenat', cleUnique,
  };
  const { data: prise } = await sb.from('messages_wa')
    .upsert({ id, branch_id: l.branch_id ?? null, data }, { onConflict: 'id', ignoreDuplicates: true }).select('id');
  if ((prise ?? []).length) return { id, data };
  const { data: avantLu } = await sb.from('messages_wa').select('id, data').eq('id', id).limit(1);
  const avant = (((avantLu ?? [])[0] as { data?: Record<string, unknown> } | undefined)?.data ?? {}) as { waId?: string; etat?: string; quand?: string };
  const depuis = Date.parse(String(avant.quand ?? ''));
  const reprenable = avant.etat === 'non-remis' || (!avant.waId && avant.etat === 'en-route' && Number.isFinite(depuis) && Date.now() - depuis > RESERVATION_ABANDONNEE_MS);
  if (!reprenable) return { refus: 'déjà parti d’un autre poste : la clé de la pièce est prise' };
  const { data: reprise } = await sb.from('messages_wa').update({ data, updated_at: quand })
    .eq('id', id).eq('data->>etat', String(avant.etat)).eq('data->>quand', String(avant.quand)).select('id');
  return (reprise ?? []).length ? { id, data } : { refus: 'déjà parti d’un autre poste : la clé de la pièce est prise' };
}

/* ══ LA PROCHAINE SÉANCE DE L'ABONNÉE, RELUE AVANT DE PARTIR — 11 novembre 2026 ══
   Lot 4 de l'abonnement refait. « Merci, Awa. Votre prochaine séance :
   samedi 23 janvier 2027 à 9 h ? » (`apres-seance`) se dépose au Trône quand
   sa séance de formule est marquée faite, et attend dix minutes en salle :
   c'est justement le moment où le comptoir pose la suite (la carte « Son
   prochain rituel », la fenêtre du rendez-vous). Une suite posée pendant
   l'attente, ou une séance qui n'est plus marquée faite, et la ligne ne part
   pas (« aucun message si le rendez-vous suivant existe déjà »). La règle du
   suivant est RECOPIÉE telle quelle de `src/shared/messages-de-l-abonnee-
   pur.ts` (`node scripts/terminer-copie-serveur.mjs` ; douze lunes R8). NE
   RIEN RETOUCHER ENTRE LES REPÈRES. */
/* ⟨deja-un-suivant⟩ */
/** Un rendez-vous de la tête, pour savoir si un suivant est déjà posé. */
type RdvDeLaTete = { id: string; clientId: string; date: string; time?: string; status: string };
/** LE RENDEZ-VOUS SUIVANT, S'IL EST DÉJÀ POSÉ : le plus proche rendez-vous
    de la même tête, ni annulé ni honoré, après la séance (le même jour plus
    tard compris). `null` : elle n'a pas encore sa place. Jugé trois fois :
    au dépôt (le Trône), au départ (le facteur : la carte « Son prochain
    rituel » pose souvent la suite pendant les dix minutes de salle), et au
    « Oui » (le webhook : rien ne se pose une seconde fois). */
function leSuivant<R extends RdvDeLaTete>(rdvs: readonly R[], seance: { id: string; clientId: string; date: string; time?: string }): R | null {
  let mieux: R | null = null;
  for (const a of rdvs) {
    if (!a || a.id === seance.id || a.clientId !== seance.clientId || a.status === 'annulé' || a.status === 'honoré') continue;
    const apres = a.date > seance.date || (a.date === seance.date && String(a.time ?? '') > String(seance.time ?? ''));
    if (!apres) continue;
    if (!mieux || a.date < mieux.date || (a.date === mieux.date && String(a.time ?? '') < String(mieux.time ?? ''))) mieux = a;
  }
  return mieux;
}
/** Un rendez-vous suivant existe-t-il déjà ? Alors pas de message : elle a déjà sa place. */
const dejaUnSuivant = (rdvs: readonly RdvDeLaTete[], seance: { id: string; clientId: string; date: string; time?: string }): boolean =>
  leSuivant(rdvs, seance) !== null;
/* ⟨/deja-un-suivant⟩ */
const TYPE_DE_LA_PROCHAINE_SEANCE = 'apres-seance';
/** Pourquoi la prochaine séance ne part plus, ou `null`. Lève quand la base ne se lit pas. */
async function pourquoiLaProchaineSeanceNePartPlus(sb: Sb, l: { seanceId?: unknown; clientId?: unknown }): Promise<string | null> {
  const seanceId = String(l.seanceId ?? '');
  const clientId = String(l.clientId ?? '');
  if (!seanceId || !clientId) return 'la séance n’est plus nommée';
  const { data: s, error: errS } = await sb.from('appointments').select('id, data').eq('id', seanceId).limit(1);
  if (errS) throw new Error(errS.message);
  const seance = ((s ?? [])[0] as { data?: Partial<RdvDeLaTete> } | undefined)?.data;
  if (!seance || seance.status !== 'honoré' || !seance.date) return 'la séance n’est plus marquée faite';
  const { data: siens, error } = await sb.from('appointments').select('id, data')
    .eq('data->>clientId', clientId).gte('data->>date', seance.date).limit(500);
  if (error) throw new Error(error.message);
  const rdvs = ((siens ?? []) as { id: string; data?: Partial<RdvDeLaTete> }[]).map((r) => ({
    id: r.id, clientId: String(r.data?.clientId ?? ''), date: String(r.data?.date ?? ''), time: r.data?.time, status: String(r.data?.status ?? ''),
  }));
  return dejaUnSuivant(rdvs, { id: seanceId, clientId, date: seance.date, time: seance.time })
    ? 'un rendez-vous suivant est déjà posé : elle a sa place'
    : null;
}

/* ══ LES ENVOIS PROGRAMMÉS, PORTÉS — 13 novembre 2026 ═══════════════════
   « Programmer un WhatsApp » : une ligne `programme` de la salle, écrite au
   Trône, avec son heure exacte (même la nuit), son colis, son auteur et son
   assistant. À l'heure dite, le facteur la prend en main (l'écriture
   conditionnelle de toujours), la RELIT (la fiche, le numéro, STOP, le
   rendez-vous dont elle parle), puis suit sa voie (`voieDuProgramme`) :
     · par l'app : le téléphone de qui l'a programmée sonne (« prêt ») ;
     · « me demander avant » : il sonne aussi, et rien ne part sans le oui ;
     · une pièce du Trône (sa facture, son reçu) : « à-préparer », un Trône
       ouvert la tire, puis elle revient ici ;
     · elle a écrit dans les 24 h : le message part tel quel, par le WhatsApp
       de la Maison, sa pièce avec lui, signé au nom de l'assistant ;
     · sinon, privé : une consigne à Opale, qui l'envoie par WhatsApp Web ;
     · sinon : le MODÈLE D'OUVERTURE (passé par la porte d'Opale), puis le
       message à sa réponse (« attend-sa-réponse », relu chaque minute) ;
       un seul modèle par numéro, les autres lignes l'attendent avec lui.
   Une seule fois : la ligne prise en main par condition, et chaque phase
   réserve sa clé au fil avant de parler. Un envoi répété se reprogramme
   seul, une fois (`ligneSuivante`, identifiant fixe). Un échec se dit une
   fois au téléphone de qui l'a programmé. */
const COMPARTIMENT_DES_ENVOIS = 'envois-programmes';
type LigneDuProgramme = { id: string; branch_id: string | null; data: LigneProgrammee };

/** Une notification, au téléphone de qui l'a programmé (le comptoir : toute
    l'équipe ; sans auteur connu : la direction). Jamais un extrait. */
async function previensDuProgramme(urlBase: string, service: string, l: LigneProgrammee, titre: string, corps: string): Promise<void> {
  const cible = l.colis?.mode === 'app' && l.colis?.telephone === 'comptoir'
    ? { mode: 'staff' }
    : l.auteurUserId ? { mode: 'to-staff', userId: l.auteurUserId } : { mode: 'direction' };
  try {
    await fetch(`${urlBase}/functions/v1/push-notify`, {
      method: 'POST',
      signal: AbortSignal.timeout(ENVOI_MAX_MS),
      headers: { 'content-type': 'application/json', authorization: `Bearer ${service}` },
      body: JSON.stringify({ ...cible, title: titre, body: corps, url: `/trone/#/appels?envoi=${encodeURIComponent(l.id)}`, tag: `mnd-envoi-${l.id}` }),
    });
  } catch (e) {
    console.error('envois-partent: notification du programme', String(e).slice(0, 160));
  }
}

/** La clé d'une phase, réservée au fil avant de parler (la règle de
    `whatsapp-envoi`) : prise ici, ou déjà là. Un essai refusé par Meta
    (« non-remis ») ou abandonné en route se reprend. */
async function reserveLaCleDuProgramme(sb: Sb, cle: string, data: Record<string, unknown>, branchId: string | null): Promise<{ id: string; data: Record<string, unknown> } | { deja: string }> {
  const id = await idDeLaCle(cle);
  const ligne = { ...data, id, cleUnique: cle, quand: new Date().toISOString(), etat: 'en-route' };
  const { data: prise } = await sb.from('messages_wa').upsert({ id, branch_id: branchId, data: ligne }, { onConflict: 'id', ignoreDuplicates: true }).select('id');
  if ((prise ?? []).length) return { id, data: ligne };
  const { data: lu } = await sb.from('messages_wa').select('id, data').eq('id', id).limit(1);
  const avant = (((lu ?? [])[0] as { data?: Record<string, unknown> } | undefined)?.data ?? {}) as { waId?: string; etat?: string; quand?: string };
  const depuis = Date.parse(String(avant.quand ?? ''));
  const reprenable = avant.etat === 'non-remis' || (!avant.waId && avant.etat === 'en-route' && Number.isFinite(depuis) && Date.now() - depuis > RESERVATION_ABANDONNEE_MS);
  if (!reprenable) return { deja: String(avant.waId ?? '') };
  const { data: reprise } = await sb.from('messages_wa').update({ data: ligne })
    .eq('id', id).eq('data->>etat', String(avant.etat)).eq('data->>quand', String(avant.quand)).select('id');
  return (reprise ?? []).length ? { id, data: ligne } : { deja: String(avant.waId ?? '') };
}

/** La pièce, du compartiment privé jusqu'à Meta (déposée, jamais un lien public). */
async function laPieceChezMeta(sb: Sb, p: PieceDuProgramme, token: string, phoneId: string): Promise<{ id: string; famille: FamilleDuFichier; nom: string } | { refus: string }> {
  const chemin = String(p.chemin ?? '');
  if (!chemin) return { refus: 'la pièce n’a pas été tirée' };
  const { data: blob, error } = await sb.storage.from(COMPARTIMENT_DES_ENVOIS).download(chemin);
  if (error || !blob) return { refus: `la pièce n’a pas pu être relue : ${String(error?.message ?? 'absente').slice(0, 120)}` };
  const type = String(p.type ?? 'application/pdf');
  const nom = String(p.nom ?? 'piece.pdf');
  try {
    const fd = new FormData();
    fd.append('messaging_product', 'whatsapp');
    fd.append('type', type);
    fd.append('file', new Blob([await blob.arrayBuffer()], { type }), nom);
    const r = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/media`, {
      method: 'POST', headers: { authorization: `Bearer ${token}` }, body: fd, signal: AbortSignal.timeout(30_000),
    });
    const rep = await r.json().catch(() => ({})) as { id?: string; error?: { message?: string } };
    if (!r.ok || !rep?.id) return { refus: `Meta n’a pas pris la pièce : ${String(rep?.error?.message ?? `HTTP ${r.status}`).slice(0, 160)}` };
    return { id: String(rep.id), famille: familleDuFichier(type), nom };
  } catch (e) {
    return { refus: `le dépôt de la pièce a échoué : ${String(e).slice(0, 160)}` };
  }
}

/** Le fil d'un numéro, sous toutes ses formes, depuis cet instant. `null` : illisible. */
async function filDuProgramme(sb: Sb, numero: string, depuisIso: string): Promise<MessageDuProgramme[] | null> {
  const variantes = variantesDuNumero(numero);
  if (!variantes.length) return [];
  const { data, error } = await sb.from('messages_wa').select('data').in('data->>numero', variantes).gte('data->>quand', depuisIso).limit(500);
  if (error) return null;
  return ((data ?? []) as { data: MessageDuProgramme }[]).map((r) => r.data ?? {});
}

type ContexteDuProgramme = { sb: Sb; urlBase: string; service: string; token: string; phoneId: string; modeleDOuverture: string; avance: AvanceDuReveil };
type IssueDuProgramme = 'parti' | 'ouvert' | 'attend' | 'revoir' | 'ecarte';

/** La ligne réécrite en entier (on la tient : elle est « en-envoi »). */
const ecrisLeProgramme = async (sb: Sb, id: string, data: LigneProgrammee): Promise<void> => {
  await sb.from('envois').update({ data: { ...data, quand: new Date().toISOString() } }).eq('id', id);
};
/** À REVOIR : rien n'est parti ; la ligne dit pourquoi, et l'auteur le sait une fois. */
async function aRevoirDuProgramme(c: ContexteDuProgramme, row: LigneDuProgramme, l: LigneProgrammee, motif: string, plus: Record<string, unknown> = {}): Promise<'revoir'> {
  const deja = !!l.prevenuLe;
  await ecrisLeProgramme(c.sb, row.id, { ...l, ...plus, statut: A_REVOIR, detail: motif.slice(0, 300), ...(deja ? {} : { prevenuLe: new Date().toISOString() }) });
  if (!deja) await previensDuProgramme(c.urlBase, c.service, l, `Votre WhatsApp à ${l.prenom || 'une cliente'} n’est pas parti`, motif.slice(0, 140));
  return 'revoir';
}
/** LA FOIS SUIVANTE, posée une fois (identifiant fixe, l'écrire deux fois ne fait rien). */
async function laSuiteDuProgramme(c: ContexteDuProgramme, row: LigneDuProgramme, l: LigneProgrammee): Promise<string | undefined> {
  const s = ligneSuivante(l, Date.now());
  if (!s) return undefined;
  await c.sb.from('envois').upsert({ id: s.id, branch_id: row.branch_id, data: s }, { onConflict: 'id', ignoreDuplicates: true });
  return s.id;
}

/** LE MESSAGE LUI-MÊME, fenêtre ouverte : sa pièce, puis son texte (ou la
    pièce et sa légende), par le WhatsApp de la Maison, au nom de l'assistant. */
async function porteLeMessageProgramme(c: ContexteDuProgramme, row: LigneDuProgramme, l: LigneProgrammee, numero: string): Promise<IssueDuProgramme> {
  const colis = l.colis;
  const fil = { branchId: l.branchId, sens: 'sortant', numero, clientId: l.clientId, texte: colis.texte, type: 'text', parQui: colis.parQui, envoiId: l.id };
  const cle = await reserveLaCleDuProgramme(c.sb, cleDuProgramme(l.id, 'message'), fil, row.branch_id);
  if ('deja' in cle) {
    await ecrisLeProgramme(c.sb, row.id, { ...l, statut: 'envoyé', detail: 'déjà parti : la clé du message est au fil', ...(cle.deja ? { waMessageId: cle.deja } : {}) });
    return 'parti';
  }
  const rends = async (pourquoi: string) => { await c.sb.from('messages_wa').update({ data: { ...cle.data, etat: 'non-remis', detail: pourquoi.slice(0, 300) } }).eq('id', cle.id); };
  let media: { id: string; famille: FamilleDuFichier; nom: string } | null = null;
  if (colis.piece) {
    const m = await laPieceChezMeta(c.sb, colis.piece, c.token, c.phoneId);
    if ('refus' in m) { await rends(m.refus); return aRevoirDuProgramme(c, row, l, `la pièce jointe n’a pas pu partir : ${m.refus}`); }
    media = m;
  }
  const ids: string[] = [];
  const charges = messagesAPorter(numero, colis.texte, media);
  for (const charge of charges) {
    let r: Response | null = null;
    let rep: { messages?: { id?: string }[]; error?: { code?: number; message?: string } } = {};
    try {
      r = await fetch(`https://graph.facebook.com/v20.0/${c.phoneId}/messages`, {
        method: 'POST', signal: AbortSignal.timeout(ENVOI_MAX_MS),
        headers: { 'content-type': 'application/json', authorization: `Bearer ${c.token}` }, body: JSON.stringify(charge),
      });
      rep = await r.json().catch(() => ({}));
    } catch (e) {
      if (!ids.length) { await rends(String(e)); return aRevoirDuProgramme(c, row, l, `coupure en route : ${String(e).slice(0, 160)}`); }
      break;
    }
    if (!r || !r.ok) {
      const motif = String(rep?.error?.message ?? `HTTP ${r?.status ?? 0}`).slice(0, 300);
      if (!ids.length) { await rends(motif); return aRevoirDuProgramme(c, row, l, motif, Number(rep?.error?.code) ? { codeMeta: Number(rep?.error?.code) } : {}); }
      break;
    }
    ids.push(String(rep?.messages?.[0]?.id ?? ''));
  }
  const waId = ids.find(Boolean) ?? '';
  await c.sb.from('messages_wa').update({ data: {
    ...cle.data, ...(waId ? { waId } : {}), ...(media ? { type: media.famille, piece: { nom: media.nom, type: String(colis.piece?.type ?? '') } } : {}),
  } }).eq('id', cle.id);
  /* La Maison a parlé : l'automate se tait sur ce fil (0125), comme pour un envoi de l'équipe. */
  try { await c.sb.rpc('pause_le_fil', { p_numero: numero, p_par: colis.parQui, p_motif: 'envoi-programme' }); } catch { /* sans 0125, rien */ }
  await ecrisLeProgramme(c.sb, row.id, {
    ...l, statut: 'envoyé', ...(waId ? { waMessageId: waId } : { detail: 'accepté sans identifiant Meta' }),
    ...(ids.length < charges.length ? { detail: 'la pièce est partie, le texte n’a pas suivi' } : {}),
  });
  /* Un fichier d'une seule fois, ou une pièce tirée pour cette fois : il quitte le compartiment. */
  if (colis.piece?.chemin && (colis.piece.genre !== 'fichier' || colis.repeter === 'jamais')) {
    try { await c.sb.storage.from(COMPARTIMENT_DES_ENVOIS).remove([colis.piece.chemin]); } catch { /* il restera, privé */ }
  }
  return 'parti';
}

/** UNE LIGNE PROGRAMMÉE, PRISE EN MAIN : relue, puis sa voie. */
async function porteLeProgramme(c: ContexteDuProgramme, row: LigneDuProgramme): Promise<IssueDuProgramme> {
  const l = { ...row.data, id: row.id } as LigneProgrammee;
  const maintenantMs = Date.now();
  if (!l.colis || l.colis.genre !== 'programme') return aRevoirDuProgramme(c, row, l, 'déposé sans colis');
  /* RELU AVANT DE PARTIR. */
  let fiche: FicheDuProgramme | null = null;
  if (l.clientId) {
    const { data, error } = await c.sb.from('clients').select('id, data').eq('id', l.clientId).maybeSingle();
    if (error) { await ecrisLeProgramme(c.sb, row.id, { ...l, statut: 'en-attente', partA: new Date(maintenantMs + 60_000).toISOString(), detail: 'la fiche n’a pas pu être relue : il repasse dans une minute' }); return 'attend'; }
    fiche = ((data as { data?: FicheDuProgramme } | null)?.data ?? null);
  }
  let rdv: { date?: string; time?: string; status?: string } | null | undefined;
  if (l.apptId) {
    const { data } = await c.sb.from('appointments').select('id, data').eq('id', l.apptId).maybeSingle();
    rdv = ((data as { data?: { date?: string; time?: string; status?: string } } | null)?.data ?? null);
  }
  const motif = pourquoiLeProgrammeNePartPas(l, { fiche, rdv, maintenantMs });
  if (motif) { await laSuiteDuProgramme(c, row, l); return aRevoirDuProgramme(c, row, l, motif); }
  const numero = numeroDeLEnvoi(l, fiche);
  /* « Ne pas envoyer » de la direction (Ce qui va partir) : écarté, comme les autres. */
  const arret = laPorteDAvance({ id: l.id, type: l.type, clientId: l.clientId }, c.avance);
  if (arret && arret.verdict === 'arrete') {
    await ecrisLeProgramme(c.sb, row.id, { ...l, statut: 'écarté', ecartePar: arret.par, ecarteLe: new Date().toISOString(), detail: arret.motif, arretDAvance: { cle: arret.cle, par: arret.par, le: arret.le } });
    return 'ecarte';
  }
  const suivanteId = await laSuiteDuProgramme(c, row, l);
  const avecSuite: LigneProgrammee = { ...l, numero, ...(suivanteId ? { suivanteId } : {}) };
  /* LES FAITS DE LA VOIE. */
  const voieSansFil = l.colis.mode === 'app' || (l.colis.demander === true && !l.ouiLe) || pieceATirer(l.colis.piece);
  const lefil = voieSansFil ? [] : await filDuProgramme(c.sb, numero, new Date(maintenantMs - FENETRE_DU_PROGRAMME_MS).toISOString());
  if (lefil === null) { await ecrisLeProgramme(c.sb, row.id, { ...avecSuite, statut: 'en-attente', partA: new Date(maintenantMs + 60_000).toISOString(), detail: 'le fil n’a pas pu être relu : il repasse dans une minute' }); return 'attend'; }
  const ouverte = fenetreOuverte(lefil, maintenantMs);
  let opale = false;
  if (!voieSansFil && !ouverte && l.colis.prive === true) {
    const { data } = await c.sb.from('assistants').select('id, empreinte, vu_le, guette_le').eq('id', 'opale').maybeSingle();
    opale = opaleEveillee(data as { empreinte?: unknown; vu_le?: unknown; guette_le?: unknown } | null, maintenantMs);
  }
  let porteOuverteDe: string | null = null;
  let porteLeDeLAutre = '';
  if (!voieSansFil && !ouverte && l.colis.prive !== true) {
    const { data } = await c.sb.from('envois').select('id, data').eq('data->>statut', ATTEND_SA_REPONSE).in('data->>numero', variantesDuNumero(numero)).limit(20);
    const autre = ((data ?? []) as { id: string; data: LigneProgrammee }[]).find((r) => r.id !== row.id && Date.parse(String(r.data?.porteLe ?? '')) > maintenantMs - ATTENTE_DE_LA_REPONSE_MS);
    if (autre) { porteOuverteDe = autre.id; porteLeDeLAutre = String(autre.data.porteLe ?? ''); }
  }
  const voie = voieDuProgramme(l, { fenetreOuverte: ouverte, opaleEveillee: opale, modeleDOuverture: c.modeleDOuverture, porteOuverteDe });
  const qui = l.prenom || 'une cliente';
  if (voie.voie === 'app') {
    await ecrisLeProgramme(c.sb, row.id, { ...avecSuite, statut: PAR_L_APP, sonneLe: new Date().toISOString() });
    await previensDuProgramme(c.urlBase, c.service, l, `Votre WhatsApp à ${qui} est prêt`, 'Un toucher l’ouvre dans WhatsApp, le message déjà écrit.');
    return 'attend';
  }
  if (voie.voie === 'demander') {
    await ecrisLeProgramme(c.sb, row.id, { ...avecSuite, statut: A_VALIDER, sonneLe: new Date().toISOString() });
    await previensDuProgramme(c.urlBase, c.service, l, `Votre WhatsApp à ${qui} attend votre oui`, 'Envoyer ou Retenir, dans Les envois programmés.');
    return 'attend';
  }
  if (voie.voie === 'tirer') { await ecrisLeProgramme(c.sb, row.id, { ...avecSuite, statut: PIECE_A_TIRER }); return 'attend'; }
  if (voie.voie === 'revoir') return aRevoirDuProgramme(c, row, avecSuite, voie.motif);
  if (voie.voie === 'texte') return porteLeMessageProgramme(c, row, avecSuite, numero);
  if (voie.voie === 'rejoint') {
    await ecrisLeProgramme(c.sb, row.id, { ...avecSuite, statut: ATTEND_SA_REPONSE, porteDe: voie.de, porteLe: porteLeDeLAutre });
    return 'ouvert';
  }
  if (voie.voie === 'opale') {
    if (!l.auteurUserId) return aRevoirDuProgramme(c, row, avecSuite, MOTIF_SANS_AUTEUR);
    let piece: { nom: string; lien: string } | null = null;
    if (l.colis.piece?.chemin) {
      const { data: signe, error } = await c.sb.storage.from(COMPARTIMENT_DES_ENVOIS).createSignedUrl(l.colis.piece.chemin, 86_400);
      if (error || !signe?.signedUrl) return aRevoirDuProgramme(c, row, avecSuite, 'la pièce jointe n’a pas pu se confier à Opale');
      piece = { nom: String(l.colis.piece.nom ?? 'la pièce'), lien: String(signe.signedUrl) };
    }
    const texte = texteDeLaConsigne({ auteur: String(l.auteur ?? ''), numero, prenom: l.prenom, texte: l.colis.texte, piece });
    if (!texte) return aRevoirDuProgramme(c, row, avecSuite, MOTIF_CONSIGNE_TROP_LONGUE);
    const consigneId = `consigne-${l.id}`;
    const { error } = await c.sb.from('assistants_consignes').upsert({
      id: consigneId, de: String(l.auteur ?? '').slice(0, 80) || 'la direction', de_user_id: l.auteurUserId, pour: 'opale',
      texte, statut: 'envoyee', ...(l.branchId ? { branch_id: l.branchId } : {}),
    }, { onConflict: 'id', ignoreDuplicates: true });
    if (error) return aRevoirDuProgramme(c, row, avecSuite, `la consigne à Opale n’a pas pu s’écrire : ${String(error.message ?? '').slice(0, 120)}`);
    await ecrisLeProgramme(c.sb, row.id, { ...avecSuite, statut: CONFIE_A_OPALE, consigneId, confieLe: new Date().toISOString() });
    return 'attend';
  }
  /* LE MODÈLE D'OUVERTURE, passé par la porte d'Opale (jamais deux fois, la civilité de la fiche). */
  const devant: LigneALaPorte = {
    ...(l as unknown as LigneALaPorte), id: row.id, parLaMain: false,
    colis: { genre: 'whatsapp', numero, modele: c.modeleDOuverture, composants: composantsDOuverture(l.colis.appel), texteAuFil: texteDOuverture(l.colis.appel), parQui: l.colis.parQui },
  };
  const faits = await faitsDeLaPorte(c.sb, devant, null, Date.now());
  if (!faits) { await ecrisLeProgramme(c.sb, row.id, { ...avecSuite, statut: 'en-attente', partA: new Date(maintenantMs + 60_000).toISOString(), detail: 'la porte d’Opale n’a pas pu lire le fil : il repasse dans une minute' }); return 'attend'; }
  const vp = laPorte(devant, faits);
  if (vp.verdict === 'retenu') return aRevoirDuProgramme(c, row, avecSuite, detailDOpale(vp.motif));
  const composants = vp.verdict === 'corrige' ? vp.composants : (devant.colis?.composants ?? []);
  const texteAuFil = vp.verdict === 'corrige' && vp.texteAuFil ? vp.texteAuFil : String(devant.colis?.texteAuFil ?? '');
  const cle = await reserveLaCleDuProgramme(c.sb, cleDuProgramme(l.id, 'ouverture'), {
    branchId: l.branchId, sens: 'sortant', numero, clientId: l.clientId, texte: texteAuFil, type: 'text', modele: c.modeleDOuverture, parQui: l.colis.parQui, envoiId: l.id,
  }, row.branch_id);
  if ('deja' in cle) {
    await ecrisLeProgramme(c.sb, row.id, { ...avecSuite, statut: ATTEND_SA_REPONSE, porteLe: new Date().toISOString(), detail: 'le modèle d’ouverture était déjà au fil' });
    return 'ouvert';
  }
  let r: Response;
  let rep: { messages?: { id?: string }[]; error?: { code?: number; message?: string } } = {};
  try {
    r = await fetch(`https://graph.facebook.com/v20.0/${c.phoneId}/messages`, {
      method: 'POST', signal: AbortSignal.timeout(ENVOI_MAX_MS),
      headers: { 'content-type': 'application/json', authorization: `Bearer ${c.token}` },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: numero, type: 'template', template: { name: c.modeleDOuverture, language: { code: 'fr' }, components: composants } }),
    });
    rep = await r.json().catch(() => ({}));
  } catch (e) {
    await c.sb.from('messages_wa').update({ data: { ...cle.data, etat: 'non-remis', detail: String(e).slice(0, 300) } }).eq('id', cle.id);
    return aRevoirDuProgramme(c, row, avecSuite, `coupure en route : ${String(e).slice(0, 160)}`);
  }
  if (!r.ok) {
    const code = Number(rep?.error?.code);
    const dit = String(rep?.error?.message ?? `HTTP ${r.status}`).slice(0, 200);
    await c.sb.from('messages_wa').update({ data: { ...cle.data, etat: 'non-remis', detail: dit } }).eq('id', cle.id);
    const motifMeta = code >= 132000 && code < 133000 ? `le modèle d’ouverture n’est pas accepté par Meta (${dit}) : rien n’est parti` : dit;
    return aRevoirDuProgramme(c, row, avecSuite, motifMeta, Number.isFinite(code) && code ? { codeMeta: code } : {});
  }
  const waId = String(rep?.messages?.[0]?.id ?? '');
  await c.sb.from('messages_wa').update({ data: { ...cle.data, ...(waId ? { waId } : {}) } }).eq('id', cle.id);
  try { await c.sb.rpc('pause_le_fil', { p_numero: numero, p_par: l.colis.parQui, p_motif: 'envoi-programme' }); } catch { /* sans 0125, rien */ }
  await ecrisLeProgramme(c.sb, row.id, { ...avecSuite, statut: ATTEND_SA_REPONSE, porteLe: new Date().toISOString(), ...(waId ? { waOuvertureId: waId } : {}), ...(vp.verdict === 'corrige' ? { corrigeParOpale: vp.motif } : {}) });
  return 'ouvert';
}

/** CE QUI ATTEND SA SUITE, relu chaque minute : sa réponse au modèle
    d'ouverture (le message part alors), ou la réponse d'Opale à sa consigne. */
async function suisLesProgrammes(c: ContexteDuProgramme): Promise<{ partisASaReponse: number; sansReponse: number; parOpale: number; opaleEmpechee: number }> {
  const bilan = { partisASaReponse: 0, sansReponse: 0, parOpale: 0, opaleEmpechee: 0 };
  const maintenantMs = Date.now();
  const { data: attente } = await c.sb.from('envois').select('id, branch_id, data').eq('data->>statut', ATTEND_SA_REPONSE).limit(200);
  for (const row of (attente ?? []) as LigneDuProgramme[]) {
    const l = { ...row.data, id: row.id } as LigneProgrammee;
    if (l.type !== TYPE_PROGRAMME || !l.colis) continue;
    const numero = numeroDuProgramme(l.numero ?? l.colis.numero);
    const porte = Date.parse(String(l.porteLe ?? ''));
    const fil = await filDuProgramme(c.sb, numero, new Date((Number.isFinite(porte) ? porte : maintenantMs) - 60_000).toISOString());
    if (fil === null) continue;
    if (aReponduDepuis(fil, l.porteLe)) {
      const { data: pris } = await c.sb.from('envois').update({ data: { ...l, statut: 'en-envoi', prisLe: new Date().toISOString() } })
        .eq('id', row.id).eq('data->>statut', ATTEND_SA_REPONSE).select('id');
      if (!(pris ?? []).length) continue;
      const issue = await porteLeMessageProgramme(c, row, { ...l, statut: 'en-envoi' }, numero);
      if (issue === 'parti') bilan.partisASaReponse += 1;
      continue;
    }
    if (Number.isFinite(porte) && maintenantMs - porte > ATTENTE_DE_LA_REPONSE_MS) {
      const { data: pris } = await c.sb.from('envois').update({ data: { ...l, statut: 'en-envoi', prisLe: new Date().toISOString() } })
        .eq('id', row.id).eq('data->>statut', ATTEND_SA_REPONSE).select('id');
      if (!(pris ?? []).length) continue;
      await aRevoirDuProgramme(c, row, l, MOTIF_SANS_REPONSE);
      bilan.sansReponse += 1;
    }
  }
  const { data: confies } = await c.sb.from('envois').select('id, branch_id, data').eq('data->>statut', CONFIE_A_OPALE).limit(200);
  const lignes = ((confies ?? []) as LigneDuProgramme[]).filter((r) => !!r.data?.consigneId);
  if (lignes.length) {
    const { data: consignes } = await c.sb.from('assistants_consignes').select('id, statut, reponse').in('id', lignes.map((r) => String(r.data.consigneId)));
    const parId = new Map(((consignes ?? []) as { id: string; statut: string; reponse: string | null }[]).map((k) => [k.id, k]));
    for (const row of lignes) {
      const l = { ...row.data, id: row.id } as LigneProgrammee;
      const k = parId.get(String(l.consigneId));
      if (!k || (k.statut !== 'faite' && k.statut !== 'en-attente')) continue;
      const { data: pris } = await c.sb.from('envois').update({ data: { ...l, statut: 'en-envoi', prisLe: new Date().toISOString() } })
        .eq('id', row.id).eq('data->>statut', CONFIE_A_OPALE).select('id');
      if (!(pris ?? []).length) continue;
      if (k.statut === 'faite') {
        await ecrisLeProgramme(c.sb, row.id, { ...l, statut: 'envoyé', parOpale: true, detail: `envoyé par Opale, depuis WhatsApp Web${k.reponse ? ` : ${String(k.reponse).slice(0, 200)}` : ''}` });
        bilan.parOpale += 1;
      } else {
        await aRevoirDuProgramme(c, row, l, `Opale n’a pas pu l’envoyer${k.reponse ? ` : ${String(k.reponse).slice(0, 200)}` : ''}`);
        bilan.opaleEmpechee += 1;
      }
    }
  }
  return bilan;
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

  /* ⑦ LES ENVOIS PROGRAMMÉS QUI ATTENDENT LEUR SUITE (13 novembre 2026) : sa
     réponse au modèle d'ouverture, ou celle d'Opale à sa consigne. */
  const WA_TOKEN = Deno.env.get('WA_TOKEN');
  const WA_PHONE_ID = Deno.env.get('WA_PHONE_ID');
  const programme: ContexteDuProgramme = {
    sb, urlBase, service, token: WA_TOKEN ?? '', phoneId: WA_PHONE_ID ?? '',
    modeleDOuverture: (Deno.env.get('WA_TEMPLATE_OUVERTURE') ?? '').trim(), avance: { arrets: [], pauses: [] },
  };
  let suites = { partisASaReponse: 0, sansReponse: 0, parOpale: 0, opaleEmpechee: 0 };
  if (WA_TOKEN && WA_PHONE_ID) {
    try { suites = await suisLesProgrammes(programme); } catch (e) { console.error('envois-partent: suite des programmes', String(e).slice(0, 200)); }
  }

  const { data: rows, error } = await sb.from('envois').select('id, branch_id, data')
    .eq('data->>statut', 'en-attente').limit(300);
  if (error) return new Response(JSON.stringify({ version: VERSION, erreur: error.message }), { status: 500 });
  const enSalle = (rows ?? []) as Ligne[];
  if (enSalle.length === 0) {
    return new Response(JSON.stringify({ version: VERSION, enSalle: 0, partis: 0, interrompus, retrouves, ...suites }), { headers: { 'content-type': 'application/json' } });
  }

  const partAde = (l: Ligne): number => Date.parse(l.data.partA ?? '');

  /* ② LE TÉLÉPHONE DU PERSONNEL, une fois par message, pour ce qui part
     dans les dix minutes. Un message né la nuit s'annonce donc au matin, dix
     minutes avant huit heures, et ne réveille personne à minuit. */
  /* Un envoi programmé « par l'app » ou « me demander avant » ne part pas
     seul : il sonne chez qui l'a programmé, à son heure, pas chez l'équipe. */
  const partSeul = (l: Ligne): boolean => {
    if (l.data.type !== TYPE_PROGRAMME) return true;
    const c = l.data.colis as unknown as ColisProgramme | undefined;
    return c?.mode !== 'app' && !(c?.demander === true && !l.data.ouiLe);
  };
  const aAnnoncer = enSalle.filter((l) => !l.data.annonceLe && partSeul(l) && Number.isFinite(partAde(l)) && partAde(l) - maintenantMs <= ANNONCE_MS);
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
    /* L'HEURE EXACTE, MÊME LA NUIT (13 novembre 2026) : un envoi programmé
       traverse les heures calmes, comme un « maintenant » d'une main. */
    .filter((l) => Number.isFinite(partAde(l)) && partAde(l) <= maintenantMs && (!calme || l.data.parLaMain === true || l.data.type === TYPE_PROGRAMME))
    .sort((a, b) => partAde(a) - partAde(b))
    .slice(0, PAR_REVEIL);

  const SMS_SID = Deno.env.get('SMS_TWILIO_SID');
  const SMS_TOKEN = Deno.env.get('SMS_TWILIO_TOKEN');
  const SMS_FROM = Deno.env.get('SMS_FROM');

  let partis = 0, perimes = 0, echecs = 0, dejaPris = 0, retenusParOpale = 0, corrigesParOpale = 0;
  let arretesDAvance = 0, enPause = 0, replisCarEnPause = 0;
  let programmesPartis = 0, programmesOuverts = 0;
  let avanceProgramme: AvanceDuReveil | null = null;
  const misEnPauseParOpale: string[] = [];
  /* LA PORTE D'AVANCE (5 novembre 2026) : les arrêts et les pauses, lus une fois pour ce réveil. */
  const avance = aPorter.length > 0 ? await litLAvance(sb) : { arrets: [], pauses: [] };
  const seriesLues = new Map<string, number | null>();

  for (const l of aPorter) {
    /* ⑤ JE LE PRENDS EN MAIN, et moi seul : l'écriture ne passe que s'il est
       encore « en-attente ». Retenu ou déjà pris une seconde plus tôt, elle ne
       touche aucune ligne et je passe au suivant. */
    const { data: pris } = await sb.from('envois')
      .update({ data: { ...l.data, prisLe: maintenant, statut: 'en-envoi' } })
      .eq('id', l.id).eq('data->>statut', 'en-attente').select('id');
    if ((pris ?? []).length === 0) { dejaPris++; continue; }

    /* ⑧ UN ENVOI PROGRAMMÉ (13 novembre 2026) : sa règle à lui, relu, puis sa voie. */
    if (l.data.type === TYPE_PROGRAMME) {
      if (!avanceProgramme) avanceProgramme = await litLAvance(sb);
      if (!avanceProgramme || !WA_TOKEN || !WA_PHONE_ID) {
        await sb.from('envois').update({ data: { ...l.data, statut: 'en-attente', partA: new Date(Date.now() + 60_000).toISOString(), detail: !WA_TOKEN || !WA_PHONE_ID ? 'clés Meta absentes : il repasse dans une minute' : 'les arrêts n’ont pas pu être lus : il repasse dans une minute' } }).eq('id', l.id);
        echecs++;
        continue;
      }
      try {
        const issue = await porteLeProgramme({ ...programme, avance: avanceProgramme }, { id: l.id, branch_id: l.branch_id, data: { ...(l.data as unknown as LigneProgrammee), statut: 'en-envoi' } });
        if (issue === 'parti') { partis++; programmesPartis++; } else if (issue === 'ouvert') programmesOuverts++; else if (issue === 'revoir') echecs++;
      } catch (e) {
        await sb.from('envois').update({ data: { ...l.data, statut: A_REVOIR, detail: String(e).slice(0, 300), quand: new Date().toISOString() } }).eq('id', l.id).eq('data->>statut', 'en-envoi');
        echecs++;
      }
      continue;
    }

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
      /* LE FOYER RELU, 4 novembre 2026. Le message d'un foyer nomme d'autres
         têtes que la sienne (`apptIds`) : une d'elles annulée, disparue ou
         passée à un autre jour pendant l'attente, et il ne part pas. Il
         devient « périmé » sans la marque d'Opale : la fonction qui l'a
         déposé le refait avec les têtes qui restent (`foyerQuiNeTientPlus`). */
      const autresTetes = tetesNommees(l.data).filter((id) => id !== l.data.apptId);
      if (autresTetes.length > 0) {
        const { data: lesAutres, error: errAutres } = await sb.from('appointments').select('id, data').in('id', autresTetes);
        if (errAutres) { await ecris({ statut: 'échec', detail: 'le foyer n’a pas pu être relu' }); echecs++; continue; }
        const relus = new Map(((lesAutres ?? []) as { id: string; data: { date?: string; status?: string } }[]).map((r) => [r.id, r.data ?? null]));
        const motifDuFoyer = foyerQuiNeTientPlus({ apptId: l.data.apptId, apptIds: l.data.apptIds, dateRdv: base.dateRdv }, relus);
        if (motifDuFoyer) { await ecris({ statut: 'périmé', detail: motifDuFoyer }); perimes++; continue; }
      }
    }
    /* LA PROCHAINE SÉANCE DE L'ABONNÉE (11 novembre 2026) : relue avant de
       partir ; la suite posée pendant l'attente la tait. */
    if (l.data.type === TYPE_DE_LA_PROCHAINE_SEANCE) {
      let motifDeLaSuite: string | null = null;
      try { motifDeLaSuite = await pourquoiLaProchaineSeanceNePartPlus(sb, l.data); } catch (e) {
        await ecris({ statut: 'échec', detail: `la séance n’a pas pu être relue : ${String(e).slice(0, 160)}` }); echecs++; continue;
      }
      if (motifDeLaSuite) { await ecris({ statut: 'périmé', detail: motifDeLaSuite }); perimes++; continue; }
    }
    if (!colis) { await ecris({ statut: 'échec', detail: 'déposé sans colis' }); echecs++; continue; }

    /* ⑥ LA PORTE D'OPALE — 4 novembre 2026. Prise en main et rendez-vous
       relu, la ligne passe la porte avant Meta : retenue, elle devient
       « périmé » et dit pourquoi (« retenu par Opale : … ») ; corrigée, elle
       part avec l'appel de sa fiche. Un envoi de l'équipe ou une main qui a
       dit « maintenant » ne se juge pas (`quellePorte`). */
    const devant: LigneALaPorte = { ...(l.data as LigneALaPorte), ...(base as LigneALaPorte), id: l.id, parLaMain: l.data.parLaMain, colis: colis as ColisALaPorte };
    /* ⑥ bis LA PORTE D'AVANCE — 5 novembre 2026 (ce qui va partir). Avant
       toute autre règle, et pour toute ligne (le SMS d'un rappel arrêté non
       plus, une main qui a dit « maintenant » non plus) : arrêté d'avance par
       la direction, la ligne devient « écarté », son colis gardé (« Remettre »
       peut la rendre tant que son heure n'est pas passée) ; un modèle en
       pause : « périmé », retenu par Opale, ou son repli part à sa place. */
    if (!avance) { await ecris({ statut: 'échec', detail: 'la porte d’Opale n’a pas pu lire les arrêts et les pauses' }); echecs++; continue; }
    if (colis.genre === 'whatsapp' && !modeleEnPause(colis.modele, avance.pauses)) {
      const m = String(colis.modele ?? '');
      if (m && !seriesLues.has(m)) {
        const reprise = Date.parse(String(avance.pauses.find((p) => String(p.modele ?? p.id) === m)?.reprisLe ?? ''));
        const depuis = Math.max(Date.now() - VEILLE_DES_NON_REMIS_MS, Number.isFinite(reprise) ? reprise : 0);
        seriesLues.set(m, await serieDuModele(sb, m, depuis));
      }
      const serie = seriesLues.get(m);
      if (typeof serie === 'number' && veilleDuModele(serie) === 'pause') {
        const pause: PauseDuModele = { id: m, modele: m, enPause: true, par: 'Opale', le: new Date().toISOString(), parOpale: true, motif: `${serie} messages de suite non remis` };
        const { error: errPause } = await sb.from('modeles_en_pause').upsert({ id: m, branch_id: null, data: pause }, { onConflict: 'id' });
        if (!errPause) { avance.pauses.push(pause); misEnPauseParOpale.push(m); }
      }
    }
    const dAvance = laPorteDAvance(devant, avance);
    if (dAvance && dAvance.verdict !== 'repli') {
      const retenue = ligneRetenueDAvance(dAvance, new Date().toISOString()) ?? {};
      await ecris(dAvance.verdict === 'arrete' ? { ...retenue, colis: colisDepose, partA: l.data.partA } : retenue);
      if (dAvance.verdict === 'arrete') arretesDAvance++; else { enPause++; perimes++; }
      continue;
    }
    if (dAvance?.verdict === 'repli' && colis.genre === 'whatsapp' && colis.repli) {
      colis = { ...colis, modele: colis.repli.modele, composants: colis.repli.composants, texteAuFil: colis.repli.texteAuFil ?? colis.texteAuFil, repli: undefined };
      devant.colis = colis as ColisALaPorte;
      (base as Record<string, unknown>).repliCarEnPause = dAvance.motif;
      replisCarEnPause++;
    }
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
        /* LE PAPIER D'UNE PIÈCE (Grenat, 4 novembre 2026) : la pièce relue, sa clé réservée. */
        const papier = l.data.type === TYPE_DU_PAPIER ? await reserveLePapier(sb, l, colis) : null;
        if (papier && 'refus' in papier) { await ecris({ statut: 'périmé', detail: papier.refus }); perimes++; continue; }
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
          /* La clé de la pièce est rendue : rien n'est parti, un autre geste pourra l'envoyer. */
          if (papier && !('refus' in papier)) await sb.from('messages_wa').update({ data: { ...papier.data, etat: 'non-remis', detail: String(rep?.error?.message ?? `HTTP ${r.status}`).slice(0, 300) } }).eq('id', papier.id);
          await ecris({ statut: 'échec', detail: String(rep?.error?.message ?? `HTTP ${r.status}`).slice(0, 300), ...(Number(rep?.error?.code) ? { codeMeta: Number(rep?.error?.code) } : {}), ...duRepli });
          echecs++;
          continue;
        }
        await ecris({ statut: 'envoyé', ...(waId ? { waMessageId: waId } : { detail: 'accepté sans identifiant Meta' }), ...duRepli });
        partis++;
        if (papier && !('refus' in papier)) {
          /* La ligne réservée devient le message du fil ; la pièce reçoit sa marque. */
          await sb.from('messages_wa').update({ data: { ...papier.data, ...(waId ? { waId } : {}), texte: colis.texteAuFil ?? papier.data.texte, modele: colis.modele } }).eq('id', papier.id);
          const { data: pieceRow } = await sb.from('invoices').select('id, data').eq('id', String(l.data.invoiceId)).maybeSingle();
          const pd = (pieceRow?.data ?? null) as { whatsapp?: { partieLe?: string } } | null;
          if (pieceRow && !pd?.whatsapp?.partieLe) {
            await sb.from('invoices').update({ data: { ...(pieceRow.data as object), whatsapp: { partieLe: new Date().toISOString(), modele: colis.modele, parQui: 'Grenat' } } })
              .eq('id', String(l.data.invoiceId)).is('data->whatsapp', null);
          }
        } else if (waId && colis.texteAuFil) {
          const idFil = `wa-${waId}`;
          const { error: errFil } = await sb.from('messages_wa').upsert({
            id: idFil,
            branch_id: l.branch_id,
            data: {
              id: idFil, waId, branchId: l.data.branchId, sens: 'sortant', numero: colis.numero, clientId: l.data.clientId,
              /* Le message d'un foyer dit au fil chaque fiche qu'il nomme : la porte et rappels-j1 les y lisent. */
              ...(fichesNommees(l.data).length > 1 ? { clientIds: fichesNommees(l.data) } : {}),
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
    JSON.stringify({ version: VERSION, enSalle: enSalle.length, heuresCalmes: calme, annonces, partis, programmesPartis, programmesOuverts, ...suites, perimes, echecs, dejaPris, interrompus, retrouves, retenusParOpale, corrigesParOpale, arretesDAvance, enPause, replisCarEnPause, misEnPauseParOpale }),
    { headers: { 'content-type': 'application/json' } },
  );
});
