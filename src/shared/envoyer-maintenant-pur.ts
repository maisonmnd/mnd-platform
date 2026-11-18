/* ══ « ENVOYER MAINTENANT » : UNE LIGNE DU PLAN QUI ATTEND SON HEURE — 18 novembre 2026 ══
   Yéman, 20 h 44, devant la carte d'anniversaire d'une cliente qui ne
   partait qu'au passage du lendemain, 10 h : « Comment faire partir des
   messages malgré l'heure ? Je veux que ça parte maintenant. » Elle a choisi
   au sélecteur de faire construire le bouton.

   LA LIGNE QUI ATTEND SON HEURE : au plan du jour (Conversations ›
   Aujourd'hui), un modèle approuvé chez Meta (`partSeule`), sur WhatsApp,
   sans ligne encore dans la salle d'attente. Jusqu'ici, rien ne la faisait
   partir avant le passage du matin.

   UN TOUCHER, ET ELLE PART PAR LE MÊME CHEMIN QUE LE PASSAGE :
     · la ligne est celle que le passage fabrique (`lignesDuPassage`) : même
       modèle Meta, mêmes variables, même image en tête, mêmes boutons, même
       clé `gerard-<jour>-<cliente>-whatsapp` ;
     · elle entre en salle comme « Envoyer quand même » la fait partir
       (`envoieMaintenant`) : son heure est maintenant, et une main l'a dit
       (`parLaMain`), le facteur la porte donc même pendant les heures calmes ;
     · elle signe qui l'a touchée (`envoyeMaintenantPar`), et le journal des
       gestes l'inscrit (`gesteDuMaintenant`) ;
     · elle est une ligne `gerard` comme les autres : elle compte dans la
       promesse des deux nouvelles par mois (`promesseDe`), et le passage du
       lendemain la lit dans ses traces. Le même jour, sa clé l'écarte du
       passage (`lignesNeuves`) ; le lendemain, la trace suffit : la carte est
       « déjà fêtée cette année », une envie attend ses quatorze jours.

   LE BOUTON FERMÉ, ET POURQUOI (`porteDuMaintenant`). Pas de bouton du
   tout pour une ligne qui n'attend pas son heure : Ma Couronne, un modèle pas
   approuvé chez Meta (il a déjà son bouton à la main, « Envoyer sur
   WhatsApp »), une ligne déjà en salle (la salle a son propre « Envoyer
   maintenant ») ou déjà partie, l'Assistant en pause. Le bouton fermé, avec
   sa raison, pour une ligne qui ne peut pas partir : sans numéro WhatsApp,
   un « stop », l'accord des nouvelles refusé ou absent (une sollicitation),
   les deux nouvelles du mois déjà parties. La carte d'anniversaire garde sa
   règle : un vœu part à toutes, sans l'accord des nouvelles, mais pas
   malgré un « stop » ni au-delà de la promesse.

   Module PUR : `scripts/verifie-envoyer-maintenant.mjs` le prouve. */
import { EST_UN_SERVICE, GENRE_DIT, MOTIF_DE_LA_PROMESSE, idDeLaLigne, partSeule, promesseDe, reglagesLus, type FicheDeGerard, type LigneDeGerard, type Situation } from './gerard-pur';
import { lignesDuPassage } from './assistant-passage-pur';
import { envoieMaintenant, type ReglesDeLaSalle } from './salle-des-envois';
import { numeroWa } from './numero-wa-pur';
import type { CerveauDeGerard } from './assistant-lecture-pur';
import type { Geste, Identite } from './journal';

/** Ce que dit le bouton d'une ligne du plan. */
export type PorteDuMaintenant =
  | { bouton: false }
  | { bouton: true; ouvert: true }
  | { bouton: true; ouvert: false; raison: string };

/** Les raisons d'un bouton fermé, en quelques mots. */
export const RAISON_DU_MAINTENANT = {
  sansNumero: 'sans numéro WhatsApp',
  stop: 'elle a dit « stop »',
  accordRefuse: 'accord des nouvelles refusé',
  sansAccord: 'sans accord des nouvelles',
  promesse: MOTIF_DE_LA_PROMESSE,
} as const;

/** Une sollicitation demande l'accord des nouvelles pour partir sur WhatsApp ;
    « garder » (un service) et la carte d'anniversaire (un vœu) non. */
const demandeLAccord = (genre: Situation['genre']): boolean => !EST_UN_SERVICE[genre] && genre !== 'anniversaire';

export function porteDuMaintenant(o: {
  situation: Situation;
  /** Le document `mnd_gerard` tel quel (lu par `reglagesLus`). */
  reglagesGerard: unknown;
  /** La ligne du jour existe déjà (en salle, partie, écartée, à la main). */
  dejaUneLigne: boolean;
  /** Sa fiche, lue par l'Assistant : l'accord, le « stop », ses traces. */
  fiche: Pick<FicheDeGerard, 'accord' | 'stop' | 'traces'> | undefined;
  /** La fiche qui reçoit, quand ce n'est pas la sienne (la carte d'un enfant au parent payeur). */
  destinataire?: Pick<FicheDeGerard, 'stop'> | undefined;
  /** L'accord écrit sur la fiche : `oui: false` hors « stop » est un refus. */
  nouvelles?: { oui?: boolean; par?: string } | null;
  /** Le numéro où l'écrire, tel que la fiche le porte (`cerveau.telDe`). */
  telephone: string | undefined;
  aujourdhui: string;
}): PorteDuMaintenant {
  const s = o.situation;
  const r = reglagesLus(o.reglagesGerard as Parameters<typeof reglagesLus>[0]);
  /* PAS DE BOUTON : la ligne n'attend pas son heure. */
  if (s.canal !== 'whatsapp') return { bouton: false };
  if (!partSeule(s, r)) return { bouton: false };
  if (o.dejaUneLigne) return { bouton: false };
  if (!o.fiche) return { bouton: false };
  /* FERMÉ, AVEC SA RAISON : la ligne ne peut pas partir. */
  const ferme = (raison: string): PorteDuMaintenant => ({ bouton: true, ouvert: false, raison });
  if (!numeroWa(o.telephone)) return ferme(RAISON_DU_MAINTENANT.sansNumero);
  if (!EST_UN_SERVICE[s.genre] && (o.fiche.stop || o.destinataire?.stop)) return ferme(RAISON_DU_MAINTENANT.stop);
  if (demandeLAccord(s.genre) && !o.fiche.accord) {
    return ferme(o.nouvelles?.oui === false ? RAISON_DU_MAINTENANT.accordRefuse : RAISON_DU_MAINTENANT.sansAccord);
  }
  if (!EST_UN_SERVICE[s.genre] && !promesseDe(o.fiche, o.aujourdhui).tenue) return ferme(RAISON_DU_MAINTENANT.promesse);
  return { bouton: true, ouvert: true };
}

/** Ce que porte la ligne envoyée maintenant, en plus de celle du passage. */
export type LigneDuMaintenant = LigneDeGerard & { parLaMain: true; envoyeMaintenantPar: string; envoyeMaintenantLe: string };

/** LA LIGNE QUI PART MAINTENANT : celle que le passage du matin déposerait,
    à la même clé, entrée en salle comme par « Envoyer quand même ». `null`
    quand le passage ne la déposerait pas (pause, modèle pas approuvé, sans
    numéro). */
export function ligneDuMaintenant(o: {
  cerveau: CerveauDeGerard;
  situation: Situation;
  reglagesGerard: unknown;
  maintenantMs: number;
  branchId: string;
  regles: ReglesDeLaSalle;
  qui: string;
}): LigneDuMaintenant | null {
  const cle = idDeLaLigne(o.cerveau.ctx.aujourdhui, o.situation.clientId, 'whatsapp');
  const duPassage = lignesDuPassage({
    cerveau: o.cerveau, plan: [o.situation], reglagesGerard: o.reglagesGerard, maintenantMs: o.maintenantMs, branchId: o.branchId, regles: o.regles,
  }).find((l) => l.id === cle);
  if (!duPassage) return null;
  const partie = envoieMaintenant(duPassage, o.maintenantMs);
  if (!partie) return null;
  return { ...partie, parLaMain: true, envoyeMaintenantPar: o.qui, envoyeMaintenantLe: new Date(o.maintenantMs).toISOString() };
}

/** LE JOURNAL DES GESTES : qui a fait partir la ligne avant son heure. La
    table `envois` n'est pas suivie par la greffe de la synchronisation (sa
    mécanique ne dit rien de personne) : ce geste-là, une main l'a fait, il
    s'inscrit à la main. */
export function gesteDuMaintenant(l: Pick<LigneDuMaintenant, 'id' | 'branchId' | 'genre' | 'envoyeMaintenantLe'>, qui: Identite, nom: string): Geste {
  return {
    id: `g-${l.id}-maintenant`,
    branchId: l.branchId,
    quand: l.envoyeMaintenantLe,
    ...(qui.mail ? { parMail: qui.mail } : {}),
    parNom: qui.nom,
    porte: qui.porte,
    verbe: 'pose',
    table: 'envois',
    ecran: 'Conversations',
    pieceId: l.id,
    piece: `Envoyé maintenant · ${GENRE_DIT[l.genre]}${nom ? ` · ${nom}` : ''}`,
    champs: [{ champ: 'Départ', avant: 'à son heure', apres: 'maintenant, sur WhatsApp' }],
  };
}
