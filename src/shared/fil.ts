import { createStore, useStore, uid } from './store';
import { bindCollection } from './sync';
import { invoiceSoldee, type Invoice } from './finance';
import { supabase } from './supabase';

/* ═══════════════════════════════════════════════════════════════════
   LE FIL — le registre interne de la Maison. 18 août 2026.

   « Je veux créer un système de chat interne comme Slack pour Le Trône entre
   utilisateurs, prendre des notes, faire des demandes pour traiter les
   factures, les RDV… » (Yéman), maquette `public/maquette-le-fil.html`
   validée le 18 août.

   CE QUI LE SÉPARE D'UN SLACK, et la seule raison de l'écrire : un message peut
   DÉSIGNER UNE PIÈCE de la Maison — une facture, un rituel, une cliente. « Peux-
   tu regarder la facture d'Hermine ? » cesse d'être une phrase où l'on recopie
   un numéro : elle porte la pièce, on l'ouvre d'un clic, et la demande
   s'éteint quand la pièce est traitée.
   ═══════════════════════════════════════════════════════════════════ */

/** LA PIÈCE ATTACHÉE — on garde l'identifiant ET un libellé.

    L'identifiant seul obligerait chaque lecture à retrouver la pièce pour
    savoir de quoi l'on parle ; le libellé seul mentirait le jour où la pièce
    change de nom. On garde les deux : l'identifiant fait foi pour OUVRIR, le
    libellé sert à LIRE le fil sans rien charger — et s'il a vieilli, la pièce
    ouverte dit la vérité. C'est la même règle que sur les lignes de facture. */
export type FilPiece = {
  kind: 'facture' | 'rituel' | 'cliente';
  id: string;
  label: string;
};

export type FilMessage = {
  id: string;
  branchId: string;
  /** Le fil où il se dit. « maison » pour commencer — les fils par atelier et
      les tête-à-tête viendront d'après ce qui aura manqué, pas d'après ce qu'on
      imagine aujourd'hui (décision de Yéman, 18 août). */
  canal: string;
  /** L'ADRESSE DE LA SESSION est la seule identité SÛRE : un membre peut être
      renommé, sa fiche supprimée, deux personnes porter le même prénom. Le nom
      est gardé à côté pour que le fil reste lisible même si la fiche disparaît. */
  auteurMail: string;
  auteurNom: string;
  texte: string;
  /** Horodatage COMPLET — un fil se lit à la minute, pas au jour. */
  at: string;
  piece?: FilPiece;

  /* ── LA DEMANDE ────────────────────────────────────────────────
     Le même message, adressé à quelqu'un et qui attend d'être traité. */
  demandePour?: string;
  demandePourNom?: string;
  faitAt?: string;
  faitPar?: string;

  /** LE FICHIER JOINT — 18 août 2026, « je fais des screenshots et je veux
      pouvoir joindre les fichiers aux membres de l'équipe ».

      On garde le CHEMIN, pas une adresse : une adresse de compartiment privé
      expire, et un lien mort dans un registre est pire qu'une absence. Le
      chemin, lui, ne périme pas — on en tire un jeton frais à chaque lecture.

      Le nom et le poids sont gardés pour que le fil se lise SANS aller
      chercher le fichier : on voit ce qui est joint avant de le demander. */
  fichier?: { chemin: string; nom: string; type: string; taille: number };

  /** QUAND ELLE A ÉTÉ REPRISE — 18 août 2026, « je veux modifier mes notes ».

      On peut corriger ce qu'on a écrit ; on ne peut pas le corriger EN SILENCE.
      La maquette l'avait posé pour les demandes — « un registre qui s'efface ne
      prouve plus rien » — et la règle vaut pour tout : une note qui change sans
      le dire n'est plus une trace, c'est une opinion d'aujourd'hui déguisée en
      souvenir. La mention « modifié » suffit à garder l'honnêteté du registre
      sans alourdir le geste. */
  modifieAt?: string;

  /** LE COMPTAGE DES LOCKS — 18 août 2026.

      « Parfois c'est Gérard qui compte, pas moi la souveraine. Il n'a pas accès
      aux fiches des clientes, mais ils ont accès à leurs fils » (Yéman).

      C'est ce qui décide de la forme : LE FIL EST LA PORTE. Un maître pose ici
      un fait qu'il ne peut pas écrire sur la fiche, et le nombre remonte au
      profil sans qu'on lui ouvre le CRM. Le fil garde QUI a compté et QUAND ;
      la fiche porte le nombre du jour.

      QUATRE QUADRANTS, corrigé le 18 août : « j'ai 4 quadrants. Gauche et
      droite (devant), gauche et droite (derrière) ». C'est ainsi qu'une tête se
      compte réellement, et un total sans ses quarts ne se vérifie pas : on
      recompte le quadrant qui cloche, pas la tête entière.

      `gauche` / `droite` restent lisibles — ce sont les deux moitiés des
      messages écrits avant cette correction. On ne réécrit pas un comptage
      passé pour le faire ressembler au nouveau : il a été fait ainsi. */
  comptage?: {
    avantG?: number; avantD?: number;
    arriereG?: number; arriereD?: number;
    gauche?: number; droite?: number;
  };

  /** CE MESSAGE PARLE D'ARGENT. Un maître au fauteuil ne voit pas les montants
      (`sansPrix`) : un fil où l'on écrit « 81 000 F » rouvrirait cette porte
      par la bande. Les messages ainsi marqués ne lui sont pas montrés —
      décision de Yéman, 18 août : « les fils suivent les droits des écrans ». */
  argent?: boolean;

  /* ── LE TABLEAU — maquette validée le 18 août 2026 ─────────────────
     « Je veux une organisation avec chaque nom sous une colonne et ses tâches,
     et pouvoir déplacer les tâches vers d'autres membres ou quand c'est
     terminé. » Le tableau n'a PAS de table à lui : une carte EST une demande,
     et ces deux champs sont tout ce qui lui manquait. */

  /** L'ÉCHÉANCE — facultative, décision de la maquette : sans elle, « en
      retard » et « aujourd'hui » ne peuvent pas exister. Une carte sans date se
      range en bas de sa colonne, sous un trait — elle ne se fait pas passer
      pour urgente. */
  echeance?: string;

  /** LA TRACE DES DÉPLACEMENTS — « un travail qui passe d'une main à l'autre
      sans que rien ne le dise, c'est un travail qui se perd ». Chaque
      réadressage s'ajoute ici ; on ne garde pas que le dernier, parce qu'une
      carte qui a fait trois mains raconte quelque chose que la dernière main
      ne dit pas. */
  mouvements?: { parNom: string; deNom: string; aNom: string; at: string }[];

  /** LA PRIORITÉ — 19 août 2026, « des niveaux de priorité comme Monday,
      dans les couleurs de ma charte ». TROIS niveaux, pas cinq : au-delà,
      plus personne ne sait ce qui sépare « élevé » de « critique » et tout
      finit en haut. Absente = ordinaire — l'absence est un niveau, le plus
      courant, et il ne se coche pas. Les couleurs sont celles de la Maison :
      brique pour ce qui presse, or pour le moyen, indigo doux pour ce qui
      peut attendre. */
  priorite?: 'haute' | 'moyenne' | 'basse';
};

/* ── LA PRIORITÉ SE TRIE ET SE NOMME ─────────────────────────────── */
export const PRIORITES: { cle: NonNullable<FilMessage['priorite']>; nom: string }[] = [
  { cle: 'haute', nom: 'Haute' },
  { cle: 'moyenne', nom: 'Moyenne' },
  { cle: 'basse', nom: 'Basse' },
];

/** Le poids d'une carte dans sa colonne — la haute d'abord, l'ordinaire avant
    la basse : qui marque « basse » dit « ça peut attendre », pas « oubliez ». */
export const poidsPriorite = (m: Pick<FilMessage, 'priorite'>): number =>
  m.priorite === 'haute' ? 0 : m.priorite === 'moyenne' ? 1 : m.priorite === 'basse' ? 3 : 2;

export const filStore = createStore<FilMessage[]>('mnd_fil', []);
export const useFil = () => useStore(filStore);
bindCollection(filStore, 'fil_messages');

/** Un message neuf — l'horodatage est LOCAL et complet. Jamais `toISOString()`
    pour la date seule : elle bascule d'un jour selon le fuseau. */
export function nouveauMessage(m: Omit<FilMessage, 'id' | 'at'>): FilMessage {
  const d = new Date();
  const p2 = (n: number) => String(n).padStart(2, '0');
  return {
    ...m,
    id: `fil-${uid()}`,
    at: `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`,
  };
}

export const estDemande = (m: FilMessage): boolean => !!m.demandePour;

/** LE COMPARTIMENT DES PIÈCES JOINTES — privé, ouvert au seul personnel. */
export const SEAU_FIL = 'fil';

/** DÉPOSER UN FICHIER. Rend le chemin, ou null si le dépôt a échoué — jamais
    une exception : un fil qui casse parce qu'une image n'est pas passée ferait
    perdre le message avec elle. */
/* LE MÊME COMPARTIMENT POUR TOUTES LES PIÈCES — 23 août 2026. « Après note,
   j'aimerais attacher un fichier ou une photo » : les caisses et les dépenses
   déposent désormais ici aussi, sous leur propre dossier. Un second
   compartiment aux politiques identiques aurait doublé la surface à protéger
   sans rien gagner — et la migration 0059 le dit déjà : ce que la Maison garde
   derrière une porte, elle le garde derrière LA MÊME. */
export async function deposerFichier(
  branchId: string,
  f: File,
  dossier?: string,
): Promise<FilMessage['fichier'] | null> {
  if (!supabase) return null;
  /* Le nom est NETTOYÉ mais gardé lisible : « Capture 2026-08-18.png » se
     retrouve d'un coup d'œil dans le compartiment, « a3f9c2.png » jamais. */
  const propre = f.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').slice(-80);
  const chemin = `${branchId}/${dossier ? `${dossier}/` : ''}${uid()}-${propre}`;
  const { error } = await supabase.storage.from(SEAU_FIL).upload(chemin, f, {
    contentType: f.type || 'application/octet-stream',
    upsert: false,
  });
  if (error) { console.warn('[mnd-fil] dépôt refusé :', error.message); return null; }
  return { chemin, nom: f.name, type: f.type, taille: f.size };
}

/** UNE ADRESSE SIGNÉE, valable une heure. On en redemande une à chaque lecture
    plutôt que d'en garder : une adresse enregistrée serait morte demain, et
    donnerait à croire que le fichier a disparu. */
export async function adresseSignee(chemin: string): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.storage.from(SEAU_FIL).createSignedUrl(chemin, 3600);
  if (error) { console.warn('[mnd-fil] adresse refusée :', error.message); return null; }
  return data?.signedUrl ?? null;
}

/** Un poids qui se lit — « 1,2 Mo » plutôt que 1258291. */
export const poidsEnClair = (o: number): string =>
  o >= 1048576 ? `${(o / 1048576).toFixed(1).replace('.', ',')} Mo` : `${Math.max(1, Math.round(o / 1024))} Ko`;

/** PUIS-JE REPRENDRE CE MESSAGE ?

    Le mien, et pas celui d'un autre — corriger la phrase de quelqu'un dans un
    registre partagé, c'est réécrire son témoignage.

    Et pas une demande DÉJÀ FAITE : elle atteste un travail accompli. La
    modifier après coup changerait ce que l'autre a cru faire. */
/** PUIS-JE CLORE CETTE DEMANDE ?

    « Gérard ne peut pas traiter une tâche qui est pour Yéman Boya, impossible »
    (Yéman, 18 août). Le bouton « C'est fait » était offert à TOUT LE MONDE :
    n'importe qui pouvait éteindre le travail d'un autre, et la demande
    disparaissait de la liste de celui qui devait vraiment la faire.

    Deux personnes seulement : CELLE À QUI on demande — elle seule sait que
    c'est fait — et CELLE QUI A DEMANDÉ, parce qu'on peut retirer sa propre
    demande quand elle n'a plus lieu d'être. */
export const puisJeClore = (m: FilMessage, monMail: string): boolean => {
  const moi = monMail.trim().toLowerCase();
  /* Une demande à prendre n'a pas de destinataire : seul son auteur peut la
     retirer — la clore, c'est dire que le travail n'attend plus personne. */
  if (estAPrendre(m)) return m.auteurMail.trim().toLowerCase() === moi;
  return (m.demandePour ?? '').toLowerCase() === moi
    || m.auteurMail.trim().toLowerCase() === moi;
};

export const puisJeReprendre = (m: FilMessage, monMail: string): boolean =>
  m.auteurMail.trim().toLowerCase() === monMail.trim().toLowerCase() && !m.faitAt;

/** EFFACER — 18 août 2026, « supprimer les tâches terminées dans Fil et
    Tableau ». Un message ordinaire s'efface par son auteur. Une demande
    OUVERTE aussi — par son auteur seul : elle engage quelqu'un d'autre, et
    la retirer est le droit de qui l'a posée. Une demande TERMINÉE s'efface
    par son auteur, son destinataire ou le souverain : le travail est fait,
    la garder n'engage plus personne — et Le Fil, lui, garde la parole qui
    l'entourait. */
export const puisJeEffacer = (
  m: FilMessage,
  monMail: string,
  souverain = false,
  /* Une demande éteinte PAR SA FACTURE n'a pas de `faitAt` : l'appelant qui
     tient les factures passe l'état vrai ; par défaut, la case cochée. */
  terminee: boolean = !!m.faitAt,
): boolean => {
  const moi = monMail.trim().toLowerCase();
  const auteur = m.auteurMail.trim().toLowerCase() === moi;
  if (!estDemande(m)) return auteur;
  if (!terminee) return auteur;
  return auteur || souverain || (m.demandePour ?? '').toLowerCase() === moi;
};

/** LA DEMANDE EST-ELLE ENCORE OUVERTE ?

    Deux façons de la refermer, et la seconde est celle qui compte :

    ① quelqu'un dit « c'est fait » — `faitAt` est posé ;
    ② LA PIÈCE EST TRAITÉE — une demande qui porte une facture s'éteint quand
       la facture est soldée. C'est le cœur du Fil : personne n'a à se souvenir
       de fermer une demande dont le travail est visiblement fini.

    Le second cas se LIT, il ne s'écrit pas. Un travail de fond qui parcourrait
    les demandes pour les clore aurait besoin d'un moment pour tourner, et se
    tromperait sur toutes celles qu'il manquerait. Une lecture ne se trompe
    jamais : elle regarde la pièce telle qu'elle est. */
export function demandeOuverte(m: FilMessage, factures: readonly Invoice[]): boolean {
  if (!estDemande(m)) return false;
  if (m.faitAt) return false;
  if (m.piece?.kind === 'facture') {
    const inv = factures.find((i) => i.id === m.piece!.id);
    /* Pièce introuvable — supprimée depuis ? La demande reste ouverte : c'est
       une question à poser, pas une chose à clore en silence. */
    if (inv && invoiceSoldee(inv)) return false;
  }
  return true;
}

/* ── LES FILS ──────────────────────────────────────────────────────
   Le canal est une CHAÎNE, pas une énumération : ajouter un atelier ou une
   cliente ne doit pas demander de migration. La forme dit le genre.

     maison              toute la Maison
     atelier:<catId>     un atelier — ceux qui y travaillent s'y parlent
     dm:<a>|<b>          un tête-à-tête, les deux adresses TRIÉES pour que
                         l'ordre d'ouverture ne crée pas deux fils
     notes:<mail>        mes notes — personne d'autre ne les lit
     cliente:<id>        les notes posées sur une tête ; elles remontent sur
                         SA fiche, parce que c'est là qu'on les cherche */
export const CANAL_MAISON = 'maison';
export const canalAtelier = (categorieId: string) => `atelier:${categorieId}`;
export const canalNotes = (mail: string) => `notes:${mail.trim().toLowerCase()}`;
export const canalCliente = (clientId: string) => `cliente:${clientId}`;
/** Le tête-à-tête ne dépend pas de qui l'ouvre : deux adresses triées, un fil. */
export const canalDM = (a: string, b: string) =>
  `dm:${[a.trim().toLowerCase(), b.trim().toLowerCase()].sort().join('|')}`;

export const estCanalPrive = (canal: string) => canal.startsWith('notes:') || canal.startsWith('dm:');

/* ── À PRENDRE ─────────────────────────────────────────────────────
   Une demande SANS destinataire — la colonne de gauche du Tableau. L'étoile
   est une sentinelle, pas une adresse : aucun courriel ne peut la porter, donc
   elle ne tombera jamais dans le « à traiter » de quelqu'un par accident. */
export const A_PRENDRE = '*';
export const estAPrendre = (m: FilMessage): boolean => m.demandePour === A_PRENDRE;

/** CE MESSAGE ME REGARDE-T-IL ? — 18 août 2026.

    « Gérard ne doit pas voir ce que son patron envoie à sa patronne. »

    Le premier verrou ne fermait que les tête-à-tête et les notes. Or les
    demandes de Brice à Yéman avaient été écrites dans « Toute la Maison » : un
    fil ouvert au personnel, donc lisible de Gérard. Ce n'était pas une fuite du
    tête-à-tête — c'était une demande posée en public.

    LA RÈGLE, PLUS JUSTE : une demande ne regarde que DEUX personnes — celle qui
    demande et celle à qui l'on demande — quel que soit le fil où elle est
    écrite. On ne discute pas du travail d'un autre devant lui sans qu'il puisse
    répondre, et l'on n'expose pas ce qu'un souverain demande à l'autre.

    Un message SANS demande reste ce qu'il est : une parole au fil où il est
    posé, publique s'il est public. */
export const messageVisible = (m: FilMessage, monMail: string, sansPrix = false): boolean => {
  if (!canalVisible(m.canal, monMail)) return false;
  /* UN MESSAGE QUI PARLE D'ARGENT ne se montre pas à qui ne voit pas les prix.
     La règle était écrite ici depuis le matin — mais rien ne l'appliquait :
     le champ `argent` était posé à l'envoi et jamais lu. Un maître voyait
     « 81 000 F » dans le fil de la Maison. Colmaté le 18 août, en construisant
     le Tableau — qui aurait hérité du même trou. */
  if (sansPrix && m.argent) return false;
  if (!estDemande(m)) return true;
  /* Une demande À PRENDRE n'a pas encore de destinataire : elle regarde tout
     le monde, puisque n'importe qui peut la prendre. */
  if (estAPrendre(m)) return true;
  const moi = monMail.trim().toLowerCase();
  return (m.demandePour ?? '').toLowerCase() === moi
    || m.auteurMail.trim().toLowerCase() === moi;
};

/** Le canal m'est-il destiné ? Mes notes et mes tête-à-tête, personne d'autre.
    Le reste est à la Maison. */
export const canalVisible = (canal: string, monMail: string): boolean => {
  const moi = monMail.trim().toLowerCase();
  if (canal.startsWith('notes:')) return canal === canalNotes(moi);
  if (canal.startsWith('dm:')) return canal.slice(3).split('|').includes(moi);
  return true;
};

/** LES NOTES D'UNE TÊTE — celles posées sur elle, plus celles dont la pièce la
    désigne. Une note écrite depuis Le Fil et une note écrite depuis sa fiche
    sont la même chose : on ne veut pas deux endroits où chercher. */
export const notesDeLaCliente = (
  tous: readonly FilMessage[],
  branchId: string,
  clientId: string,
): FilMessage[] =>
  tous
    .filter((m) => m.branchId === branchId
      && (m.canal === canalCliente(clientId)
        || (m.piece?.kind === 'cliente' && m.piece.id === clientId)))
    .sort((a, b) => b.at.localeCompare(a.at));

/** FUSIONNER DEUX COMPTAGES — le nouveau complète l'ancien.

    « Permettre de rajouter le comptage des quadrants au fur et à mesure. Ne se
    fait pas d'un coup. Sauvegarder pour s'en souvenir et ensuite rajouter et
    cumuler » (Yéman, 18 août).

    Un quadrant ABSENT n'est pas un quadrant à zéro : c'est un quadrant pas
    encore compté. Les confondre effaçait le devant en comptant le derrière —
    et le total tombait faux sans que rien ne le dise. Le nouveau chiffre gagne
    quand il existe ; sinon l'ancien tient. */
export function fusionnerComptages(
  ancien: FilMessage['comptage'],
  neuf: FilMessage['comptage'],
): FilMessage['comptage'] {
  const g = (k: 'avantG' | 'avantD' | 'arriereG' | 'arriereD') =>
    (neuf?.[k] != null ? neuf[k] : ancien?.[k]);
  const out = { avantG: g('avantG'), avantD: g('avantD'), arriereG: g('arriereG'), arriereD: g('arriereD') };
  return out;
}

/** Le comptage est-il COMPLET — les quatre quarts posés ? Tant qu'il ne l'est
    pas, le total n'est qu'une somme partielle, et l'écran doit le dire. */
export const comptageComplet = (c?: FilMessage['comptage']): boolean =>
  c != null && [c.avantG, c.avantD, c.arriereG, c.arriereD].every((n) => n != null);

/** Le total d'un comptage — les quatre quarts, ou les deux moitiés d'avant. */
export const totalDuComptage = (c?: FilMessage['comptage']): number =>
  Math.max(0, Math.round(
    (c?.avantG ?? 0) + (c?.avantD ?? 0) + (c?.arriereG ?? 0) + (c?.arriereD ?? 0)
    + (c?.gauche ?? 0) + (c?.droite ?? 0),
  ));

/** Le comptage EN CLAIR, quelle que soit sa forme — « devant 26 · 24 ·
    derrière 22 · 21 », ou « gauche 50 · droite 43 » pour les anciens. */
export const comptageEnClair = (c?: FilMessage['comptage']): string => {
  if (!c) return '';
  const quarts = [c.avantG, c.avantD, c.arriereG, c.arriereD];
  if (quarts.some((n) => n != null)) {
    /* Un quart non compté s'écrit « — », jamais « 0 » : la Maison doit voir
       d'un coup d'œil ce qui reste à faire sur cette tête. */
    const q = (n?: number) => (n == null ? '—' : String(n));
    return `devant ${q(c.avantG)} · ${q(c.avantD)} — derrière ${q(c.arriereG)} · ${q(c.arriereD)}`;
  }
  return `gauche ${c.gauche ?? 0} · droite ${c.droite ?? 0}`;
};

/** LE DERNIER COMPTAGE D'UNE TÊTE, d'où qu'il vienne.

    La fiche cliente le lit ici plutôt que d'attendre qu'on le lui écrive : un
    maître sans droit sur le CRM peut alors compter, et le nombre paraît quand
    même — avec le nom de qui l'a posé et le jour où il l'a fait. Sans cette
    lecture, le comptage de Gérard serait resté dans une conversation. */
export const dernierComptage = (
  tous: readonly FilMessage[],
  branchId: string,
  clientId: string,
): FilMessage | undefined =>
  tous
    .filter((m) => m.branchId === branchId
      && !!m.comptage
      && m.piece?.kind === 'cliente' && m.piece.id === clientId)
    .sort((a, b) => b.at.localeCompare(a.at))[0];

/** Les messages d'un fil, du plus ancien au plus récent — l'ordre de lecture. */
export const messagesDuCanal = (
  tous: readonly FilMessage[],
  branchId: string,
  canal: string,
  monMail: string,
  sansPrix = false,
): FilMessage[] =>
  tous
    .filter((m) => m.branchId === branchId && m.canal === canal && messageVisible(m, monMail, sansPrix))
    .sort((a, b) => a.at.localeCompare(b.at));

/** CE QUI M'ATTEND — les demandes qui me sont adressées et restent ouvertes. */
export const mesDemandes = (
  tous: readonly FilMessage[],
  branchId: string,
  monMail: string,
  factures: readonly Invoice[],
): FilMessage[] =>
  tous
    .filter((m) => m.branchId === branchId
      && (m.demandePour ?? '').toLowerCase() === monMail.toLowerCase()
      && demandeOuverte(m, factures))
    .sort((a, b) => a.at.localeCompare(b.at));

/** CE QUI S'OUBLIE — 18 août, décision de Yéman : « les messages s'effacent au
    bout de douze mois, les demandes restent ». Ce qui engage se garde, ce qui
    bavarde s'oublie. La coupe se LIT ici ; l'effacement réel se fera en base,
    pour que le passé ne pèse pas sur chaque appareil. */
export const MOIS_DE_MEMOIRE = 12;
export function messageExpire(m: FilMessage, aujourdhui: string): boolean {
  if (estDemande(m)) return false;
  const limite = new Date(`${aujourdhui}T00:00:00`);
  limite.setMonth(limite.getMonth() - MOIS_DE_MEMOIRE);
  const p2 = (n: number) => String(n).padStart(2, '0');
  const borne = `${limite.getFullYear()}-${p2(limite.getMonth() + 1)}-${p2(limite.getDate())}`;
  return m.at.slice(0, 10) < borne;
}

/* ═══════════════════════════════════════════════════════════════════
   LE TABLEAU — les demandes vues d'en haut. Maquette validée le 18 août :
   « le tableau peut suivre le rang. C'est bon comme ça. »
   ═══════════════════════════════════════════════════════════════════ */

/** LES CARTES DU TABLEAU — et la règle du rang, décidée le 18 août.

    Le fil garde sa règle stricte : une demande ne regarde que son auteur et
    son destinataire. Le tableau, lui, SUIT LE RANG : le souverain voit toutes
    les colonnes, parce qu'il répond de la Maison — c'est le seul endroit où il
    peut savoir qui porte quoi. Le maître ne voit que ce qui le touche : ce
    qu'on lui demande, ce qu'il demande, et ce qui est à prendre.

    La demande d'un souverain à l'autre reste hors de la vue du personnel :
    c'est la correction du matin même, et le rang ne la rouvre pas. */
export const demandesDuTableau = (
  tous: readonly FilMessage[],
  branchId: string,
  monMail: string,
  souverain: boolean,
  sansPrix = false,
): FilMessage[] => {
  const moi = monMail.trim().toLowerCase();
  return tous
    .filter((m) => m.branchId === branchId && estDemande(m))
    .filter((m) => !(sansPrix && m.argent))
    .filter((m) => souverain
      || estAPrendre(m)
      || (m.demandePour ?? '').toLowerCase() === moi
      || m.auteurMail.trim().toLowerCase() === moi)
    .sort((a, b) => a.at.localeCompare(b.at));
};

/** QUI PEUT DÉPLACER UNE CARTE — décision ③ de la maquette : celui qui a
    demandé, celui à qui l'on a demandé, plus le souverain. Sinon chacun peut se
    débarrasser de son travail en trois secondes. Une carte à prendre se laisse
    prendre par n'importe qui : c'est son sens. */
export const puisJeDeplacer = (m: FilMessage, monMail: string, souverain: boolean): boolean => {
  if (souverain) return true;
  if (estAPrendre(m)) return true;
  const moi = monMail.trim().toLowerCase();
  return (m.demandePour ?? '').toLowerCase() === moi
    || m.auteurMail.trim().toLowerCase() === moi;
};

/** EN RETARD — se CALCULE depuis l'échéance, jamais ne se coche : un état
    qu'il faut penser à changer à la main finit toujours par mentir. */
export const enRetard = (m: FilMessage, aujourdhui: string): boolean =>
  !!m.echeance && m.echeance < aujourdhui;

/** LA COLONNE « TERMINÉ » — sept jours à vue, décision ④ de la maquette. Une
    colonne qui garde six mois n'est plus une colonne, c'est une archive qu'on
    ne lit pas. Le reste vit toujours dans le fil. */
export const JOURS_AU_TABLEAU = 7;
export function faiteRecemment(m: FilMessage, aujourdhui: string): boolean {
  if (!m.faitAt) return false;
  const limite = new Date(`${aujourdhui}T00:00:00`);
  limite.setDate(limite.getDate() - JOURS_AU_TABLEAU);
  const p2 = (n: number) => String(n).padStart(2, '0');
  const borne = `${limite.getFullYear()}-${p2(limite.getMonth() + 1)}-${p2(limite.getDate())}`;
  return m.faitAt.slice(0, 10) >= borne;
}
