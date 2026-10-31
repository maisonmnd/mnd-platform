/* ══ LES PARAMÈTRES EN TUILES — 29 octobre 2026 ═══════════════════════════
   « Il y a trop de désordre, il y a trop de boutons que je n'utilise pas.
   Recrée de nouveaux boutons pour ce que j'utilise, et rends l'UI beaucoup
   plus agréable, intuitive et interactive » (Yéman). Maquette 5aXKK3Eu…,
   « construis » le 29 octobre 2026, ses propositions retenues : huit tuiles,
   un seul panneau ouvert, cinq gestes rapides, un réglage à un seul endroit,
   ce qui efface derrière un mot.

   CE MODULE EST PUR : les tuiles, leurs mots de recherche et leurs résumés.
   Le résumé d'une tuile et le panneau qu'elle ouvre lisent la même donnée ;
   le résumé se calcule ici pour s'éprouver sans React
   (`node scripts/verifie-sommaire.mjs`). */

export type IdTuile =
  | 'heures' | 'whatsapp' | 'paiements' | 'envoyer'
  | 'reservation' | 'pointage' | 'diagnostic' | 'notifications'
  /* La neuvième, née le 31 octobre 2026 : la Dictée MND (maquette F7LksMC3…). */
  | 'dictee';

export type Tuile = { id: IdTuile; nom: string; mots: string };

/** L'ordre est celui de l'écran : le plus touché d'abord. */
export const TUILES: readonly Tuile[] = [
  { id: 'heures', nom: 'Heures et jours', mots: 'heures horaires ouverture fermeture ouvert fermé jour journée exceptionnelle férié inventaire congé bloquer créneau pause midi absence' },
  { id: 'whatsapp', nom: 'WhatsApp', mots: 'whatsapp automate assistant phrases claude numéros essai places horizon main équipe pause réponse' },
  { id: 'paiements', nom: 'Paiements', mots: 'paiement paiements modes espèces momo moov celtiis carte chèque virement mnd pay fedapay tap go zelle devise étrangère euro dollar relance relances facture factures rythme rattrapage' },
  { id: 'envoyer', nom: 'Ce qu’on envoie aux clientes', mots: 'itinéraire chemin adresse plan google maps avis lien momo qr ussd marchand code 909099 messages automatiques' },
  { id: 'reservation', nom: 'Réservation et acompte', mots: 'réservation réserver acompte pourcentage prestations plafond maître jour paliers élévation souveraineté habilitée main ma couronne en ligne' },
  { id: 'pointage', nom: 'Pointage de l’équipe', mots: 'pointage présence preuve position gps rayon mètres code du jour comptoir arrivée équipe' },
  { id: 'diagnostic', nom: 'Diagnostic photo', mots: 'diagnostic photo photos locks ma couronne table observation rituel produit claude' },
  { id: 'notifications', nom: 'Notifications', mots: 'notification notifications cloche alerte rendez-vous stock réassort factures attente' },
  { id: 'dictee', nom: 'Dictée MND', mots: 'dictée dictee dicter voix micro parler oreille claude mots vocabulaire mode note message liste anglais jeton bureau ordinateur téléphone wispr' },
];

/** Ce qui se règle rarement : replié sous « Rarement », cherchable aussi. */
export const RAREMENT: readonly { id: string; nom: string; mots: string }[] = [
  { id: 'identite', nom: 'Identité de la Maison', mots: 'identité nom maison raison employeur ville siège fuseau horaire heure voyage' },
  { id: 'calibres', nom: 'Les calibres des modèles', mots: 'calibres calibre modèles locks barème jumbo galaxy' },
  { id: 'segments', nom: 'Segments de clientèle', mots: 'segments segment crm clientèle vip prospect diaspora' },
  { id: 'livraison', nom: 'Frais de livraison', mots: 'livraison frais domicile boutique gamme ma couronne' },
  { id: 'appareil', nom: 'Cet appareil', mots: 'appareil poste mémoire serveur compte connecté photos poids alléger repartir' },
];

export const MOT_DU_VERROU = 'EFFACER';
/** Le mot qui montre ce qui efface : écrit en entier, la casse n'y fait rien. */
export const verrouOuvert = (saisie: string): boolean => saisie.trim().toUpperCase() === MOT_DU_VERROU;

export const estIdTuile = (v: string | null | undefined): v is IdTuile => TUILES.some((t) => t.id === v);

export const sansAccent = (s: string): string =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, ' ');

/** Chaque mot de la question doit se trouver dans le nom ou les mots de la
    tuile : « acompte en ligne » trouve la réservation, pas les paiements. */
const trouve = (q: string, nom: string, mots: string): boolean => {
  const termes = sansAccent(q).split(/\s+/).filter((x) => x.length > 1);
  if (termes.length === 0) return true;
  const ou = sansAccent(`${nom} ${mots}`);
  return termes.every((t) => ou.includes(t));
};
export const tuilesTrouvees = (q: string): IdTuile[] => TUILES.filter((t) => trouve(q, t.nom, t.mots)).map((t) => t.id);
export const rarementTrouves = (q: string): string[] => RAREMENT.filter((r) => trouve(q, r.nom, r.mots)).map((r) => r.id);

/* ── LES RÉSUMÉS ─────────────────────────────────────────────────────── */

export type JourDuSalon = { key: string; open: string; close: string; closed: boolean };
const ORDRE = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];
const COURT: Record<string, string> = { lun: 'lun.', mar: 'mar.', mer: 'mer.', jeu: 'jeu.', ven: 'ven.', sam: 'sam.', dim: 'dim.' };
const LONG: Record<string, string> = { lun: 'lundi', mar: 'mardi', mer: 'mercredi', jeu: 'jeudi', ven: 'vendredi', sam: 'samedi', dim: 'dimanche' };

/** « 08h00 » → « 8 h », « 20h30 » → « 20 h 30 » ; ce qui ne se lit pas reste tel quel. */
export function heureLisible(h: string): string {
  const m = /^\s*(\d{1,2})\s*[h:]\s*(\d{2})?\s*$/i.exec(h ?? '');
  if (!m) return (h ?? '').trim();
  const heures = String(Number(m[1]));
  return !m[2] || m[2] === '00' ? `${heures} h` : `${heures} h ${m[2]}`;
}

/** « mar. au ven. 8 h à 20 h 30 · sam. 9 h à 20 h · fermée lundi et dimanche » :
    les jours qui se suivent avec les mêmes heures vont ensemble. */
export function resumeDesHeures(jours: readonly JourDuSalon[]): string {
  const tries = ORDRE.map((k) => jours.find((j) => j.key === k)).filter((j): j is JourDuSalon => !!j);
  const groupes: { de: string; a: string; plage: string }[] = [];
  let dernier: JourDuSalon | null = null;
  for (const j of tries) {
    if (j.closed) { dernier = null; continue; }
    const plage = `${heureLisible(j.open)} à ${heureLisible(j.close)}`;
    const g = groupes[groupes.length - 1];
    if (g && dernier && !dernier.closed && g.plage === plage && ORDRE.indexOf(j.key) === ORDRE.indexOf(dernier.key) + 1) g.a = j.key;
    else groupes.push({ de: j.key, a: j.key, plage });
    dernier = j;
  }
  const ouverts = groupes.map((g) => {
    if (g.de === g.a) return `${COURT[g.de]} ${g.plage}`;
    const joint = ORDRE.indexOf(g.a) === ORDRE.indexOf(g.de) + 1 ? ' et ' : ' au ';
    return `${COURT[g.de]}${joint}${COURT[g.a]} ${g.plage}`;
  });
  const fermes = tries.filter((j) => j.closed).map((j) => LONG[j.key]);
  if (ouverts.length === 0) return 'Fermée toute la semaine';
  const ferme = fermes.length === 0 ? '' : ` · fermée ${fermes.length === 1 ? fermes[0] : `${fermes.slice(0, -1).join(', ')} et ${fermes[fermes.length - 1]}`}`;
  return `${ouverts.join(' · ')}${ferme}`;
}

export type Etat = { ton: 'ok' | 'attention' | 'neutre'; dit: string };

export function etatDesHeures(jours: readonly JourDuSalon[]): Etat {
  const n = jours.filter((j) => !j.closed).length;
  return n === 0 ? { ton: 'attention', dit: 'fermée' } : { ton: 'ok', dit: `${n} jour${n > 1 ? 's' : ''} sur 7` };
}

const DIT_AUTOMATE: Record<string, string> = { eteint: 'éteint', essai: 'en essai', ouvert: 'ouvert' };
const DIT_ASSISTANT: Record<string, string> = { non: 'non', essai: 'en essai', tous: 'pour tout le monde' };
export function resumeWhatsApp(automate: string, assistant: string, horizonJours: number): string {
  return `Automate ${DIT_AUTOMATE[automate] ?? automate} · assistant ${DIT_ASSISTANT[assistant] ?? assistant} · places sur ${horizonJours} jours`;
}
export function etatWhatsApp(automate: string): Etat {
  return automate === 'eteint' ? { ton: 'attention', dit: 'en pause' } : automate === 'essai' ? { ton: 'neutre', dit: 'en essai' } : { ton: 'ok', dit: 'répond' };
}

export function resumePaiements(nbModes: number, mndPay: boolean, relances: boolean): string {
  return `${nbModes} mode${nbModes > 1 ? 's' : ''} · MND PAY ${mndPay ? 'allumé' : 'éteint'} · relances ${relances ? 'allumées' : 'éteintes'}`;
}
export function etatPaiements(mndPay: boolean, relances: boolean): Etat {
  return mndPay && relances ? { ton: 'ok', dit: 'tout allumé' } : { ton: 'neutre', dit: `${[mndPay, relances].filter(Boolean).length} sur 2 allumés` };
}

/** Les quatre choses qu'un message automatique peut glisser : il en manque une, on la nomme. */
export function resumeEnvois(c: { itineraire?: string; mapsLink?: string; reviewLink?: string; momoQr?: string }): { dit: string; etat: Etat } {
  const quatre: [string, string | undefined][] = [
    ['l’itinéraire', c.itineraire], ['le lien Google Maps', c.mapsLink], ['le lien Google Avis', c.reviewLink], ['le QR MoMo', c.momoQr],
  ];
  const manque = quatre.filter(([, v]) => !(v ?? '').trim()).map(([n]) => n);
  const poses = 4 - manque.length;
  return {
    dit: manque.length === 0 ? 'Itinéraire, Google Maps, avis Google, QR et code MoMo' : `Manque ${manque.join(', ')}`,
    etat: manque.length === 0 ? { ton: 'ok', dit: '4 sur 4 posés' } : { ton: 'attention', dit: `${poses} sur 4 posés` },
  };
}

export function resumeReservation(acompteDefaut: number, nbPrestationsAcompte: number, plafondMaitre: number, plafondMaison: number): string {
  const acompte = nbPrestationsAcompte === 0
    ? 'aucune prestation à acompte'
    : `${nbPrestationsAcompte} prestation${nbPrestationsAcompte > 1 ? 's' : ''} à acompte`;
  const plafonds = [plafondMaitre > 0 ? `${plafondMaitre} par maître` : '', plafondMaison > 0 ? `${plafondMaison} pour la Maison` : ''].filter(Boolean);
  return `Acompte par défaut ${acompteDefaut} % · ${acompte} · ${plafonds.length ? `plafond ${plafonds.join(', ')} par jour` : 'aucun plafond par jour'}`;
}

export function resumePointage(exigerPreuve: boolean, rayonM: number): { dit: string; etat: Etat } {
  return exigerPreuve
    ? { dit: `Présence vérifiée · rayon de ${rayonM} m`, etat: { ton: 'ok', dit: 'vérifiée' } }
    : { dit: 'Confiance, aucune vérification', etat: { ton: 'neutre', dit: 'confiance' } };
}

export function resumeDiagnostic(allume: boolean): { dit: string; etat: Etat } {
  return allume
    ? { dit: 'Proposé aux clientes dans Ma Couronne', etat: { ton: 'ok', dit: 'allumé' } }
    : { dit: 'Fermé aux clientes', etat: { ton: 'neutre', dit: 'éteint' } };
}

/** La Dictée : combien de mots elle connaît, le mode au départ, si le bureau est relié par son jeton. */
export function resumeDictee(nbMots: number, mode: string, bureauRelie: boolean): { dit: string; etat: Etat } {
  return {
    dit: `${nbMots} mot${nbMots > 1 ? 's' : ''} de la Maison · mode ${mode} · bureau ${bureauRelie ? 'relié' : 'sans jeton'}`,
    etat: bureauRelie ? { ton: 'ok', dit: 'téléphone et bureau' } : { ton: 'neutre', dit: 'téléphone' },
  };
}

/** Les trois sujets que la cloche du Trône sait taire (shell/Notifications.tsx). */
export const NOTIFICATIONS = [
  { k: 'notifRdv', l: 'Nouveau rendez-vous', sub: 'Un rendez-vous pris en ligne, sur Ma Couronne ou par WhatsApp.' },
  { k: 'notifStock', l: 'Stock bas', sub: 'Un produit passé sous son seuil de réassort.' },
  { k: 'notifPaie', l: 'Factures en attente', sub: 'Une facture envoyée et pas encore réglée.' },
] as const;

export function resumeNotifications(toggles: Record<string, boolean | undefined>): string {
  const n = NOTIFICATIONS.filter((x) => toggles[x.k] !== false).length;
  return `${n} sur 3 dans la cloche`;
}
