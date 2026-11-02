/* L'ACCORD DES NOUVELLES DEMANDÉ SUR WHATSAPP — 2 novembre 2026. Maquette
   Q6aGAyTUKKJc6c2roJgHhN (v0), choix de Yéman au sélecteur : demandé « au
   comptoir et sur WhatsApp » ; sur WhatsApp, une seule fois par personne,
   juste après un « Oui, je viens » (touché ou écrit) et après un reçu de
   paiement envoyé sur WhatsApp ; la question promet « deux messages par mois
   au plus », et Perle tient la promesse (PLAFOND_DES_NOUVELLES_PAR_MOIS).

   Une seule règle pour trois portes : le webhook (le bouton « Oui, je
   viens »), la réception (un « oui je viens » écrit) et le Trône (le reçu).
   Le webhook n'importe rien du dépôt : il recopie ce bloc entre ses bornes,
   et son banc compare les deux textes. Module PUR. */

/* ⟨accord-whatsapp⟩ */
/** La question, dans la voix de la Maison (vouvoiement, sans « ! » ni emoji). */
export const QUESTION_DE_L_ACCORD =
  'Souhaitez-vous aussi recevoir les nouvelles de la Maison : les envies de saison, les offres et les places qui se libèrent ? Deux messages par mois au plus, et STOP à tout moment.';

/** Les deux boutons de réponse rapide (session de 24 h : pas de modèle Meta). */
export const BOUTON_ACCORD_OUI = 'NOUVELLES:oui';
export const BOUTON_ACCORD_NON = 'NOUVELLES:non';
export const BOUTONS_DE_L_ACCORD = [
  { id: BOUTON_ACCORD_OUI, titre: 'Oui, volontiers' },
  { id: BOUTON_ACCORD_NON, titre: 'Non merci' },
] as const;

/** Ce que la Maison répond à chaque bouton. */
export const MERCI_DE_L_ACCORD = 'Merci. Vous recevrez nos nouvelles ; un STOP suffit pour les arrêter.';
export const MERCI_DU_REFUS = 'Bien entendu. Vous continuerez de recevoir vos rappels et vos confirmations, rien d\'autre.';

/** La promesse tenue : au plus deux messages par mois et par personne pour
    tout ce qui n'est pas un service (envies, offres, relances, fêtes, place
    libérée). Les rappels, les confirmations, « garder », les reçus, les
    factures n'y comptent pas. */
export const PLAFOND_DES_NOUVELLES_PAR_MOIS = 2;
export const FENETRE_DU_PLAFOND_JOURS = 30;

/** Le moment où la question peut suivre. */
export type MomentDeLAccord = 'oui-je-viens' | 'recu';
export const MOMENTS_DE_L_ACCORD: readonly MomentDeLAccord[] = ['oui-je-viens', 'recu'];

/** Ce que la règle lit d'une fiche. */
export type FichePourLAccord = {
  nouvelles?: { oui: boolean; le: string; par: string } | null;
  /** Quand la question a été posée sur WhatsApp (une seule fois, pour toujours). */
  nouvellesDemandeesLe?: string | null;
  archived?: boolean | null;
  segments?: readonly string[] | null;
  birthday?: string | null;
};

/** La question peut-elle suivre maintenant ? Jamais si elle a déjà répondu
    (oui, non ou STOP), jamais si elle a déjà été demandée sur WhatsApp,
    jamais pour une fiche archivée ou un enfant (l'accord se donne au
    comptoir, par le parent), jamais hors de la fenêtre de 24 heures (un
    message libre n'y passe pas). */
export function doitDemanderLAccord(
  f: FichePourLAccord,
  o: { moment: MomentDeLAccord; fenetreOuverte: boolean; estEnfant: boolean },
): { oui: true } | { oui: false; pourquoi: string } {
  if (!(MOMENTS_DE_L_ACCORD as readonly string[]).includes(o.moment)) return { oui: false, pourquoi: 'moment' };
  if (f.nouvelles) return { oui: false, pourquoi: f.nouvelles.par === 'stop' ? 'stop' : 'deja-repondu' };
  if (f.nouvellesDemandeesLe) return { oui: false, pourquoi: 'deja-demande' };
  if (f.archived) return { oui: false, pourquoi: 'archivee' };
  if (o.estEnfant || (f.segments ?? []).includes('Enfant')) return { oui: false, pourquoi: 'enfant' };
  if (!o.fenetreOuverte) return { oui: false, pourquoi: 'fenetre' };
  return { oui: true };
}

/** La réponse à un bouton : l'accord daté, de source WhatsApp, ou null. */
export function accordDuBouton(idDuBouton: string, maintenantISO: string): { oui: boolean; le: string; par: 'whatsapp' } | null {
  const le = String(maintenantISO).slice(0, 10);
  if (idDuBouton === BOUTON_ACCORD_OUI) return { oui: true, le, par: 'whatsapp' };
  if (idDuBouton === BOUTON_ACCORD_NON) return { oui: false, le, par: 'whatsapp' };
  return null;
}

/** Les genres d'envoi qui comptent dans la promesse (tout sauf un service).
    La carte d'anniversaire compte aussi : la question promet deux messages,
    pas deux nouvelles et un voeu (tranché le 2 novembre 2026). */
export const GENRES_QUI_COMPTENT = ['avant', 'envie', 'place', 'anniversaire', 'carte', 'carte-foyer', 'fetes', 'endormie', 'nouvelles', 'campagne', 'relance'] as const;

/** Combien de nouvelles lui sont parties dans les trente derniers jours. */
export function nouvellesDuMois(envois: readonly { genre?: string | null; quand?: string | null; statut?: string | null }[], maintenantMs: number): number {
  const depuis = maintenantMs - FENETRE_DU_PLAFOND_JOURS * 24 * 60 * 60_000;
  return envois.filter((e) => {
    if (!e.genre || !(GENRES_QUI_COMPTENT as readonly string[]).includes(e.genre)) return false;
    if (e.statut && /annul|ecart|refus|echec/i.test(e.statut)) return false;
    const t = Date.parse(e.quand ?? '');
    return Number.isFinite(t) && t >= depuis && t <= maintenantMs;
  }).length;
}

/** La promesse permet-elle une nouvelle de plus ? */
export const promesseTenue = (dejaCeMois: number): boolean => dejaCeMois < PLAFOND_DES_NOUVELLES_PAR_MOIS;
/* ⟨/accord-whatsapp⟩ */
