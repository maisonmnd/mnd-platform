/* LES CAMPAGNES — 21 octobre 2026.

   « Campagnes, Automatisations et Audience ne sont pas branchés » (Yéman).
   L'onglet Campagnes lisait une table que rien n'écrivait : aucune campagne
   ne pouvait naître, aucune ne pouvait partir.

   Choix au sélecteur, sur la maquette « Marketing branché » :
   · PAR OÙ : les deux. WhatsApp (un modèle « marketing » approuvé par Meta,
     facturé par Meta à chaque message remis) pour les têtes qui ont accepté
     les nouvelles de la Maison, la notification de Ma Couronne (gratuite)
     pour celles qui l'ont allumée. UNE TÊTE, UN MESSAGE : WhatsApp d'abord,
     la notification seulement pour qui n'a pas WhatsApp d'accord.
   · LE DÉPART : retenue jusqu'au feu vert. La campagne se dépose dans la
     salle d'attente des envois au statut « retenu » ; le facteur
     (envois-partent) ne prend que l'« en-attente », et respecte les heures
     calmes (jamais entre 20 h et 8 h). Le feu vert relit l'accord de chaque
     tête : celle qui a dit non entre-temps est écartée, pas envoyée.
   · LE RÉSULTAT se compte en rendez-vous pris et honorés par les têtes
     jointes dans les 14 jours, pas en messages lus.
   · JAMAIS DE PRIX dans une campagne (règle de la Maison).

   Aucune fonction serveur nouvelle : le facteur porte déjà les colis
   WhatsApp et notification. Pur, éprouvé par `verifie-le-marketing-branche`. */

import { aAccepteLesNouvelles, type TeteDAudience } from './audiences-pur';
import { compteDuJournal, devenuDe, type CompteDuJournal, type EnvoiLu } from './envois';
import { EN_ATTENTE, EN_ENVOI, RETENU, ECARTE, attendEncore } from './salle-des-envois';

export type CanalDeCampagne = 'whatsapp' | 'notification';

export type Campagne = {
  id: string;
  branchId: string;
  nom: string;
  /** La clé d'audience (`audiences-pur`) : `seg:Régulier`, `dormantes`… */
  audience: string;
  canaux: CanalDeCampagne[];
  /** Le nom du modèle Meta « marketing » ; sa seule variable {{1}} reçoit la civilité et le prénom. */
  modele?: string;
  /** Le texte du modèle tel qu'approuvé, pour l'aperçu et le fil de la cliente. */
  apercu?: string;
  /** La notification de Ma Couronne. */
  titre?: string;
  corps?: string;
  /** L'instant de départ voulu (ISO). */
  partA: string;
  statut: 'brouillon' | 'deposee';
  creeLe: string;
  creePar?: string;
  deposeeLe?: string;
  deposeePar?: string;
  feuVertLe?: string;
  feuVertPar?: string;
};

/** UN PRIX DANS LE TEXTE : « 25 000 F », « 15000 FCFA », « 10.000 francs », « XOF ».
    « 5 février » n'en est pas un : le F du franc n'est suivi d'aucune lettre. */
export const PRIX = /\d[\d\s.,]*\s?(?:f\s?cfa|f(?![a-zà-öø-ÿ])|xof|francs?(?![a-zà-öø-ÿ])|cfa(?![a-zà-öø-ÿ]))|\bxof\b/i;
export const contientUnPrix = (texte?: string): boolean => PRIX.test(texte ?? '');

/** CE QUI MANQUE pour déposer la campagne, en français ; vide = elle peut partir en salle. */
export function ceQuiManque(c: Campagne, joignables: number): string[] {
  const manque: string[] = [];
  if (!c.nom.trim()) manque.push('un nom pour la campagne');
  if (!c.audience) manque.push('une audience');
  if (c.canaux.length === 0) manque.push('un canal');
  if (c.canaux.includes('whatsapp') && !/^[a-z0-9_]+$/.test(c.modele ?? '')) manque.push('le nom du modèle WhatsApp approuvé (minuscules, chiffres et _)');
  if (c.canaux.includes('notification') && (!(c.titre ?? '').trim() || !(c.corps ?? '').trim())) manque.push('le titre et le texte de la notification');
  if ([c.apercu, c.titre, c.corps].some(contientUnPrix)) manque.push('un texte sans prix : jamais de prix dans une campagne');
  if (!Number.isFinite(Date.parse(c.partA))) manque.push('le jour et l’heure du départ');
  if (joignables === 0) manque.push('au moins une tête joignable');
  return manque;
}

/** Le texte du modèle, la civilité et le prénom à la place de {{1}}. */
export const texteDuModele = (apercu: string, appel: string): string => apercu.replace(/\{\{\s*1\s*\}\}/g, appel);

/** L'identifiant d'une ligne : déterministe, un dépôt rejoué n'en double aucune. */
export const idDeLEnvoi = (campagneId: string, clientId: string, canal: CanalDeCampagne): string =>
  `camp-${campagneId}-${clientId}-${canal === 'whatsapp' ? 'whatsapp' : 'push'}`;

export type LigneDeCampagne = {
  id: string;
  branchId: string;
  type: 'campagne';
  canal: 'whatsapp' | 'push';
  statut: typeof RETENU;
  campagneId: string;
  clientId: string;
  prenom: string;
  apptId: '';
  dateRdv: '';
  partA: string;
  deposeLe: string;
  retenuPar: string;
  retenuLe: string;
  quand: string;
  colis:
    | { genre: 'whatsapp'; numero: string; modele: string; composants: unknown[]; texteAuFil?: string; parQui: string }
    | { genre: 'push'; clientId: string; titre: string; corps: string; url: string };
};

export type OutilsDuDepot<T> = {
  maintenantIso: string;
  qui: string;
  /** « Madame Aïcha », « Ola », « Madame, Monsieur » : `appelDe`. */
  appel: (t: T) => string;
  prenom: (t: T) => string;
  /** Le numéro au format WhatsApp (chiffres, indicatif), ou '' s'il n'y en a pas. */
  numero: (t: T) => string;
  abonnesAuxNotifications: ReadonlySet<string>;
};

/** LE DÉPÔT : une ligne par tête, au statut « retenu », WhatsApp d'abord. */
export function lignesDuDepot<T extends TeteDAudience>(c: Campagne, membres: readonly T[], o: OutilsDuDepot<T>): LigneDeCampagne[] {
  const lignes: LigneDeCampagne[] = [];
  for (const t of membres) {
    const numero = o.numero(t);
    const parWhatsApp = c.canaux.includes('whatsapp') && aAccepteLesNouvelles(t) && !!numero && !!c.modele;
    const compte = t.authUserId && o.abonnesAuxNotifications.has(t.authUserId) ? t.authUserId : t.id;
    const parNotification = !parWhatsApp && c.canaux.includes('notification')
      && (o.abonnesAuxNotifications.has(t.id) || (!!t.authUserId && o.abonnesAuxNotifications.has(t.authUserId)));
    if (!parWhatsApp && !parNotification) continue;
    const canal: CanalDeCampagne = parWhatsApp ? 'whatsapp' : 'notification';
    const appel = o.appel(t);
    lignes.push({
      id: idDeLEnvoi(c.id, t.id, canal),
      branchId: c.branchId,
      type: 'campagne',
      canal: parWhatsApp ? 'whatsapp' : 'push',
      statut: RETENU,
      campagneId: c.id,
      clientId: t.id,
      prenom: o.prenom(t),
      apptId: '',
      dateRdv: '',
      partA: c.partA,
      deposeLe: o.maintenantIso,
      retenuPar: o.qui,
      retenuLe: o.maintenantIso,
      quand: o.maintenantIso,
      colis: parWhatsApp
        ? {
          genre: 'whatsapp', numero, modele: c.modele as string,
          composants: [{ type: 'body', parameters: [{ type: 'text', text: appel }] }],
          ...(c.apercu ? { texteAuFil: texteDuModele(c.apercu, appel) } : {}),
          parQui: 'Le Trône · campagne',
        }
        : { genre: 'push', clientId: compte, titre: (c.titre ?? '').trim(), corps: (c.corps ?? '').trim(), url: '/couronne/' },
    });
  }
  return lignes;
}

type LigneEnSalle = EnvoiLu & { campagneId?: string; partA?: string; retenuPar?: string; retenuLe?: string; ecartePar?: string; ecarteLe?: string; canal: string };

/** LE FEU VERT : chaque ligne retenue repasse « en-attente », à l'heure dite
    (ou tout de suite si elle est passée) ; l'accord se relit, et la tête qui a
    dit non entre-temps est écartée. Ce qui n'est plus retenu ne bouge pas. */
export function feuVert<T extends LigneEnSalle>(
  lignes: readonly T[], accordeAujourdhui: (clientId: string) => boolean, maintenantIso: string, qui: string,
): T[] {
  return lignes.map((l) => {
    if (l.statut !== RETENU) return l;
    if (l.canal === 'whatsapp' && !accordeAujourdhui(l.clientId ?? '')) {
      return { ...l, statut: ECARTE, ecartePar: qui, ecarteLe: maintenantIso, detail: 'accord pour les nouvelles retiré avant le départ' } as T;
    }
    const partA = Date.parse(l.partA ?? '') > Date.parse(maintenantIso) ? (l.partA as string) : maintenantIso;
    return { ...l, statut: EN_ATTENTE, partA, quand: maintenantIso } as T;
  });
}

export type EtatDeLaCampagne = 'brouillon' | 'retenue' | 'en-route' | 'partie' | 'ecartee';

export const ETAT_DE_LA_CAMPAGNE_DIT: Record<EtatDeLaCampagne, string> = {
  brouillon: 'Brouillon',
  retenue: 'Retenue · attend votre feu vert',
  'en-route': 'En route',
  partie: 'Partie',
  ecartee: 'Écartée',
};

export function etatDeLaCampagne(c: Pick<Campagne, 'statut'>, lignes: readonly Pick<EnvoiLu, 'statut'>[]): EtatDeLaCampagne {
  if (c.statut === 'brouillon' || lignes.length === 0) return 'brouillon';
  if (lignes.some((l) => l.statut === RETENU)) return 'retenue';
  if (lignes.some((l) => l.statut === EN_ATTENTE || l.statut === EN_ENVOI)) return 'en-route';
  if (lignes.every((l) => l.statut === ECARTE)) return 'ecartee';
  return 'partie';
}

export type ResultatDeLaCampagne = CompteDuJournal & {
  /** L'instant du premier message parti, ou null. */
  depart: string | null;
  /** Rendez-vous pris par les têtes jointes, dans les 14 jours après le départ. */
  rdvPris: number;
  rdvHonores: number;
};

export const JOURS_DU_RESULTAT = 14;

type RdvLu = { clientId: string; status?: string; creeLe?: string };

/** CE QU'ELLE A DONNÉ. Une tête « jointe » est une tête dont le message est
    parti ; un rendez-vous compte s'il a été pris (`creeLe`) entre le départ et
    quatorze jours plus tard, et n'a pas été annulé. Un rendez-vous sans date
    de prise ne compte pas : on ne devine pas. */
export function resultatDeLaCampagne(toutes: readonly EnvoiLu[], rdvs: readonly RdvLu[]): ResultatDeLaCampagne {
  /* CE QUI ATTEND EN SALLE N'EST PAS PARTI. Une campagne retenue se lisait
     « partie le 21 oct. à 10 h 19 », ses deux messages comptés comme partis :
     le journal range un statut qu'il ne connaît pas dans « en route ». */
  const lignes = toutes.filter((l) => !attendEncore(l));
  const compte = compteDuJournal(lignes);
  const parties = lignes.filter((l) => {
    const d = devenuDe(l);
    return d === 'lu' || d === 'remis' || d === 'en-route' || d === 'non-remis';
  });
  const depart = parties.reduce<string | null>((d, l) => (d === null || l.quand < d ? l.quand : d), null);
  if (!depart) return { ...compte, depart: null, rdvPris: 0, rdvHonores: 0 };
  const jointes = new Set(parties.map((l) => l.clientId ?? ''));
  const fin = new Date(Date.parse(depart) + JOURS_DU_RESULTAT * 86_400_000).toISOString();
  const pris = rdvs.filter((r) => jointes.has(r.clientId) && !!r.creeLe && r.creeLe >= depart && r.creeLe <= fin && r.status !== 'annulé');
  return { ...compte, depart, rdvPris: pris.length, rdvHonores: pris.filter((r) => r.status === 'honoré').length };
}
