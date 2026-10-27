import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { useAuth } from '../../../../shared/auth';
import { adresseDesFonctions, cleAnonyme, supabase } from '../../../../shared/supabase';
import { useClients } from '../../../../shared/clients';
import {
  REPONSES_GRATUITES_DU_MOIS, automatesDesFils, compteDesModeles, delaiDeRetenue, estReserve, laFenetreSePaie, partEnFermant,
  poseLaMain, pourquoiLEnvoiEstImpossible, rendsALAutomate, resteDeLaRetenue, resteEnClair, useFilsAutomate, useMessagesWa,
  type Fil, type MessageWa,
} from '../../../../shared/conversations';
import {
  ETAPE_DITE, ETAPES_EN_COURS, MOTIF_DIT, heureDite, jourDitAvecAnnee, numeroServi, pauseActive, reglageDeLAutomate,
  type EtapeDuFil, type EtatDuFil, type MainDuFil, type VueDeLAutomate,
} from '../../../../shared/automate-wa';
import { appointmentsStore, useAppointments, type Appointment } from '../../../../shared/agenda';
import { motifDuRefus } from '../../../../shared/whatsapp';
import { appelleOuGarde, gardeUnAppel } from '../../../../shared/appels-en-attente';
import { useSettings } from '../../../../shared/settings';
import { useAutoConfig, useEnvois } from '../equipe/data';
import { demandeDAvisPermise, derniereDemandeDAvis, dernierAvisDe, ditLaDemandeDAvis, jourACotonou } from '../../../../shared/avis-fiches-pur';
import { useLiensDesAvis } from '../../../../shared/avis-fiches';
import { useReleveDesAvis } from './releve-des-avis';
import { jourAn } from '../../../../shared/calendrier';
import { RdvModal, useServicesById, type RdvInitial } from './_shared';
import { useEstDirection } from '../_vie';
import { BarreDesGestes, ChoisirUnFichier, PanneauDeLaPromo, useGestesDuFil, type Geste, type PieceRendue } from './_gestes';
import { LienDeReservation } from './LienDeReservation';
import { appelDe } from '../../../../shared/civilite';
import { invoicesStore } from '../../../../shared/finance';
import { useLaPieceEnPdf } from '../vente/pdf-de-la-piece';
import { ReponseProposee } from './ReponseProposee';
import './clients.css';

/* ══ LE COMPOSEUR WHATSAPP · 27 octobre 2026, lot 3 de l'Assistant Maison ══
   Extrait de `Conversations.tsx` SANS CHANGER SA LOGIQUE : la zone de saisie
   et la règle qu'elle porte (la fenêtre de 24 heures), la retenue de huit
   secondes (`delaiDeRetenue`, `partirUneFois`, `pagehide`, le démontage),
   `pourquoiLEnvoiEstImpossible`, les modèles hors fenêtre et la confirmation
   du rang, le bandeau de l'automate, les dix gestes, le lien de réservation,
   la remise à son nom, les coches bleues. Deux écrans le montent : les
   Conversations d'avant (`/conversations?ancien=1`) et la vue « Les
   conversations » de l'Assistant Maison (`LesConversations.tsx`).

   CE QU'IL NE TIENT PAS : la liste des fils, les bulles, la sonnette, les
   archives, les réactions, la réécriture, le rattachement : c'est l'écran
   hôte. Le texte de la zone (`texte`) et le message cité (`cite`) sont à
   l'hôte aussi : un lien `?t=` le pré-remplit, une réécriture y pose le mot
   de correction, « Continuer dans WhatsApp » l'emporte. L'hôte reçoit par
   `poignee` deux gestes à appeler depuis sa tête de fil : prendre la main sur
   l'automate, poser un rendez-vous. */

/** Les trois modèles approuvés de la Maison. Ce sont les seules phrases que
    WhatsApp accepte hors fenêtre, et chacune rouvre une conversation que Meta
    facture : l'écran le dit, il ne le cache pas. */
const MODELES = [
  { nom: 'rappel_rdv', dit: 'Rappel de rendez-vous', variables: 2 },
  { nom: 'confirmation_rdv', dit: 'Confirmation de rendez-vous', variables: 2 },
  { nom: 'avis_google', dit: 'Demande d’avis Google', variables: 1 },
] as const;

/** « 21 h 04 » : l'heure d'un message, à l'heure du poste. */
export const heureDuMessage = (iso: string) => {
  const d = new Date(iso);
  return `${d.getHours()} h ${String(d.getMinutes()).padStart(2, '0')}`;
};
/** « Aujourd’hui », « Hier », sinon « 07 octobre 2026 » : le jour d'un message
    dans le fil, toujours avec l'année (règle de la Maison ; relecture du 27
    octobre 2026 : la fonction exportée rendait « 07 octobre » sans l'année). */
export const jourDuMessage = (iso: string) => {
  const d = new Date(iso);
  const auj = new Date();
  const memeJour = d.toDateString() === auj.toDateString();
  if (memeJour) return 'Aujourd’hui';
  const hier = new Date(auj.getTime() - 86_400_000);
  if (d.toDateString() === hier.toDateString()) return 'Hier';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
};

/** CE QU'UN MESSAGE RETENU PORTE, le temps de son compte à rebours. */
type Attente = {
  texte: string;
  piece: PieceRendue | null;
  citeWaId?: string;
  modele?: string;
  variables: string[];
  /** Le mot ajouté à l'URL du bouton d'un modèle (reservation_preparee). */
  boutonUrl?: string;
  /** Ce que le fil affiche d'un modèle parti, à la place de « Modèle « x » ». */
  texteAffiche?: string;
  numero: string;
  clientId?: string;
  posteLe: number;
};

/* ══ LA MAISON RÉPOND SEULE · 9 octobre 2026 ════════════════════════
   Maquette « Réserver sur WhatsApp », validée le 9 octobre 2026. Quand la
   réponse automatique mène un fil, l'équipe le voit et reprend la main d'un
   geste : une pastille dans la liste, ce bandeau dans la zone de saisie (au
   téléphone aussi, jamais derrière « ⋯ »), des bulles qui disent leur étape.
   Une main passée rallume l'alarme en rouge brique. */

/** « 21 h 04 » (ou « à 21 h 04 »), « hier à 21 h 04 », « le 7 octobre 2026
    à 21 h 04 ». */
const quandDuBandeau = (iso: string | undefined, aLHeure = ''): string => {
  const t = Date.parse(iso ?? '');
  if (!iso || !Number.isFinite(t)) return '';
  const j = jourDuMessage(iso);
  if (j === 'Aujourd’hui') return `${aLHeure}${heureDuMessage(iso)}`;
  if (j === 'Hier') return `hier à ${heureDuMessage(iso)}`;
  return `le ${new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} à ${heureDuMessage(iso)}`;
};

/** La fin d'une pause : « jusqu’à 21 h 04 », « jusqu’à demain 21 h 04 »,
    « jusqu’au 11 octobre 2026, 21 h 04 ». */
export const finDuBandeau = (iso: string | undefined): string => {
  const t = Date.parse(iso ?? '');
  if (!iso || !Number.isFinite(t)) return '';
  const d = new Date(t);
  const auj = new Date();
  if (d.toDateString() === auj.toDateString()) return `jusqu’à ${heureDuMessage(iso)}`;
  if (d.toDateString() === new Date(auj.getTime() + 86_400_000).toDateString()) return `jusqu’à demain ${heureDuMessage(iso)}`;
  return `jusqu’au ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}, ${heureDuMessage(iso)}`;
};

export const etapeDite = (e: string | undefined): string =>
  (e && e in ETAPE_DITE ? ETAPE_DITE[e as EtapeDuFil] : e ?? '');

export function BandeauDeLAutomate({
  vue, etat, main, rdv, gestesDuRdv, surReprendre, surRendre, surPoser, surOuvrirRdv, pauseHeures, parLaReception,
}: {
  vue: VueDeLAutomate;
  etat: EtatDuFil | null;
  main: MainDuFil | null;
  /** Le rendez-vous qu'il a posé, s'il est déjà arrivé sur ce poste. */
  rdv?: Appointment;
  gestesDuRdv: string;
  surReprendre: () => void;
  surRendre: () => void;
  /** Absent : le panier ne porte encore aucun geste à poser. */
  surPoser?: () => void;
  surOuvrirRdv?: () => void;
  /** Le temps où l'automate laisse la Maison répondre après une pose. */
  pauseHeures: number;
  /** Son dernier mot vient de la réception (l'assistant qui répond en phrases). */
  parLaReception?: boolean;
}) {
  const etape = etapeDite(vue.etape);
  if (vue.tenue === 'tenu') {
    return (
      <div className="trc-automate" role="status">
        <span className="trc-automate__dit">
          La Maison répond seule{vue.depuis ? ` depuis ${quandDuBandeau(vue.depuis)}` : ''} · étape : <b>{etape}</b>
        </span>
        <span className="trc-automate__gestes">
          {surPoser && <Button variant="ghost" size="sm" onClick={surPoser}>Poser ce rendez-vous</Button>}
          <Button size="sm" onClick={surReprendre}>Reprendre la main</Button>
        </span>
      </div>
    );
  }
  if (vue.tenue === 'main') {
    return (
      <div className="trc-automate trc-automate--main" role="status">
        <span className="trc-automate__dit">
          <span className="trc-horloge trc-horloge--main">Main passée</span>{' '}
          L’automate a passé la main{etat?.mainPasseeLe ? ` ${quandDuBandeau(etat.mainPasseeLe, 'à ')}` : ''}
          {vue.motif ? ` · ${MOTIF_DIT[vue.motif] ?? vue.motif}` : ''}. Elle attend une personne de la Maison.
        </span>
        <span className="trc-automate__gestes">
          {surPoser && <Button size="sm" onClick={surPoser}>Poser ce rendez-vous</Button>}
          <Button variant="ghost" size="sm" onClick={surRendre}>Rendre à l’automate</Button>
        </span>
      </div>
    );
  }
  if (vue.tenue === 'pause') {
    const enRoute = !!etat && (ETAPES_EN_COURS as readonly string[]).includes(etat.etape);
    return (
      <div className="trc-automate trc-automate--pause" role="status">
        <span className="trc-automate__dit">
          L’équipe a la main{main?.jusqua ? ` ${finDuBandeau(main.jusqua)}` : ''} : l’automate se tait sur ce fil.
          {enRoute ? ` Il en était à : ${etapeDite(etat?.etape)}.` : ''}
        </span>
        <span className="trc-automate__gestes">
          {surPoser && <Button variant="ghost" size="sm" onClick={surPoser}>Poser ce rendez-vous</Button>}
          <Button variant="ghost" size="sm" onClick={surRendre}>Rendre à l’automate</Button>
        </span>
      </div>
    );
  }
  if (vue.tenue === 'fini' && vue.etape === 'confirme') {
    /* APRÈS LA POSE (13 octobre 2026) : il laisse la Maison répondre
       `pauseHeures` ; on le dit, et on peut le lui rendre. */
    const pose = Date.parse(etat?.majLe ?? '');
    const fin = Number.isFinite(pose) ? new Date(pose + pauseHeures * 3_600_000).toISOString() : undefined;
    return (
      <div className="trc-automate trc-automate--pose" role="status">
        <span className="trc-automate__dit">
          <b>Rendez-vous posé</b>
          {rdv
            ? <> · {jourDitAvecAnnee(rdv.date)} à {heureDite(rdv.time)}{gestesDuRdv ? ` · ${gestesDuRdv}` : ''} · « Pris sur WhatsApp, réponse automatique »
                {rdv.status === 'annulé' ? ' · annulé depuis par la Maison' : ''}</>
            : ' par la réponse automatique. Il paraîtra au calendrier dès qu’il arrive sur ce poste.'}
          {' '}L’automate laisse la Maison répondre{fin ? ` ${finDuBandeau(fin)}` : ''}.
        </span>
        <span className="trc-automate__gestes">
          {rdv && surOuvrirRdv && <Button variant="ghost" size="sm" onClick={surOuvrirRdv}>Ouvrir le rendez-vous</Button>}
          {/* rendre après la pose */}<Button variant="ghost" size="sm" onClick={surRendre}>Rendre à l’automate</Button>
        </span>
      </div>
    );
  }
  if (vue.tenue === 'fini' && parLaReception) {
    /* LA RÉCEPTION A RÉPONDU (27 octobre 2026) : le fil est clos, l'alarme se
       tait ; une lettre tapée ici et l'équipe a la main. */
    return (
      <div className="trc-automate" role="status">
        <span className="trc-automate__dit">
          <b>L’assistant de la Maison lui a répondu.</b> Écrivez-lui quand vous le souhaitez : il se retire dès que vous écrivez.
        </span>
      </div>
    );
  }
  if (vue.tenue === 'fini') {
    return (
      <div className="trc-automate trc-automate--pause" role="status">
        <span className="trc-automate__dit">Parcours arrêté à sa demande : rien n’a été réservé.</span>
      </div>
    );
  }
  return null;
}

/** Ce que l'écran hôte peut demander au composeur depuis sa tête de fil. */
export type PoigneeDuComposeur = {
  /** Faire taire l'automate sur ce fil (« Continuer dans WhatsApp », un lien, une réécriture). */
  prendsLaMain: (motif: string, explicite?: boolean) => void;
  /** La fenêtre du rendez-vous, pré-remplie de la fiche (et du panier de l'automate si on le demande). */
  poseUnRendezVous: (depuisLePanier: boolean) => void;
};

export function ComposeurWhatsApp({ fil, texte, surTexte, cite, surCite, poignee }: {
  fil: Fil;
  /** Ce que la zone porte : l'hôte le tient (un lien `?t=`, une correction le pré-remplissent). */
  texte: string;
  surTexte: (t: string) => void;
  /** Le message qu'on cite en répondant, choisi sur une bulle de l'hôte. */
  cite: MessageWa | null;
  surCite: (m: MessageWa | null) => void;
  /** L'hôte y lit `prendsLaMain` et `poseUnRendezVous` pour ses propres boutons. */
  poignee?: { current: PoigneeDuComposeur | null };
}) {
  /* Les crochets, tous, AVANT le premier retour (banc verifie-l-ordre-des-crochets). */
  const { branch } = useBranch();
  const { session } = useAuth();
  const [clients] = useClients();
  const [messages] = useMessagesWa();
  const [lesEnvois] = useEnvois();
  /* QUAND REDEMANDER UN AVIS (26 octobre 2026) : le modèle « Demande d'avis » suit la règle de la fiche (six mois ; chaque passage jusqu'à 3 étoiles). */
  const [liensDesAvis] = useLiensDesAvis();
  const releveDesAvis = useReleveDesAvis();
  /* Le lien de réservation préparé (28 septembre 2026). */
  const [lienOuvert, setLienOuvert] = useState(false);
  const [envoiEnCours, setEnvoi] = useState(false);
  /* LA PIÈCE EN ATTENTE · choisie, pas encore envoyée. Elle se relit comme
     le texte : on doit pouvoir la retirer avant d'appuyer. */
  const [piece, setPiece] = useState<PieceRendue | null>(null);
  /* La facture ou le devis d'un geste, tel que les Factures le font (18 octobre 2026). */
  const { buildPdfData } = useLaPieceEnPdf();
  const [promoOuverte, setPromoOuverte] = useState(false);
  const estDirection = useEstDirection();
  const [reglages] = useSettings();
  /* LE MESSAGE RETENU · il paraît dans le fil, mais n'a pas encore quitté la
     Maison. Un seul à la fois : « retenir » n'a de sens que sur le dernier. */
  const [enAttente, setEnAttente] = useState<Attente | null>(null);

  /* ══ LA MAISON RÉPOND SEULE · 9 octobre 2026 ════════════════════════
     Les fils de la réponse automatique (`fils_automate`, en direct) et son
     réglage : la durée d'une main de l'équipe se lit là, pas ici. */
  const [lignesDeLAutomate] = useFilsAutomate();
  const [configAuto] = useAutoConfig();
  const reglageAutomate = useMemo(() => reglageDeLAutomate(configAuto.automateWa), [configAuto.automateWa]);
  const automates = useMemo(
    () => automatesDesFils(lignesDeLAutomate, reglageAutomate.pauseHeures),
    [lignesDeLAutomate, reglageAutomate.pauseHeures],
  );
  const [rendezVous] = useAppointments();
  const servicesParId = useServicesById();
  /* « POSER UN RENDEZ-VOUS » DEPUIS LE FIL : la fenêtre du rendez-vous,
     pré-remplie (la fiche, et le panier de l'automate s'il y en a un). La
     création se lit en comptant, comme depuis un appel. */
  const [rdvDuFil, setRdvDuFil] = useState<{ initial: RdvInitial; avant: number } | null>(null);
  const [rdvOuvert, setRdvOuvert] = useState<Appointment | null>(null);

  /* ── UN MODÈLE SE CONFIRME AVANT DE PARTIR · 15 septembre 2026 ────
     « Si j'appuie un des modèles je dois avoir un message qui m'avertit que
     je vais être facturé » (Yéman).

     ICI, C'EST TOUJOURS VRAI. Les modèles ne paraissent que lorsque la
     fenêtre est FERMÉE, un modèle envoyé dans une fenêtre ouverte serait
     gratuit, mais ce cas-là n'existe pas à cet endroit de l'écran. Chaque
     clic engage donc une dépense, et un geste qui coûte ne doit pas partir
     d'un seul clic. */
  const [modeleAConfirmer, setModeleAConfirmer] = useState<{ nom: string; dit: string; variables?: string[]; boutonUrl?: string; texteAffiche?: string } | null>(null);

  const moisCourant = new Date().toISOString().slice(0, 7);
  const modelesDuMois = useMemo(
    () => compteDesModeles(messages, moisCourant, branch.id),
    [messages, moisCourant, branch.id],
  );

  /* La demande d'avis à la main suit la même règle que le serveur : six mois,
     chaque passage jusqu'à trois étoiles (avis-fiches-pur, 26 octobre 2026). */
  const demandeDAvis = demandeDAvisPermise({
    premiereVenue: false,
    derniereDemande: fil.clientId ? derniereDemandeDAvis(fil.clientId, lesEnvois) : null,
    dernierAvis: fil.clientId && releveDesAvis ? dernierAvisDe(fil.clientId, releveDesAvis.avis, liensDesAvis, releveDesAvis.le) : null,
    aujourdhui: jourACotonou(new Date().toISOString()) ?? '',
  });

  /* ══ L'ÉQUIPE PREND LA MAIN · 9 octobre 2026 ═══════════════════════
     DÈS LA PREMIÈRE LETTRE, et non au départ du message : la retenue de huit
     secondes vit dans ce navigateur, le serveur ne la voit pas. Un geste, un
     lien, un modèle, « Continuer dans WhatsApp » (l'automate ne voit pas
     cette sortie) font de même. `whatsapp-envoi` pose aussi la pause côté
     serveur : elle tient même si cet écran a perdu le réseau.

     SEULEMENT SUR UN FIL QUE L'AUTOMATE MÈNE : ailleurs il n'y a personne à
     faire taire, et une ligne de plus par fil ne servirait à rien. Une fois
     par fil et par demi-minute : la frappe ne réécrit pas la ligne à chaque
     touche. */
  const mainPriseLe = useRef<Map<string, number>>(new Map());
  const prendsLaMain = (motif: string, explicite = false): void => {
    if (fil.automate?.tenue !== 'tenu') return;
    if (estReserve(fil.tiroir) && !estDirection) return;
    const avant = mainPriseLe.current.get(fil.numero) ?? 0;
    if (!explicite && Date.now() - avant < 30_000) return;
    mainPriseLe.current.set(fil.numero, Date.now());
    poseLaMain(fil.numero, motif, { pauseHeures: reglageAutomate.pauseHeures, branchId: branch.id });
    if (explicite) toast(`Vous avez la main : l’automate se tait sur ce fil pendant ${reglageAutomate.pauseHeures} h.`);
  };
  const rendsLaMain = (): void => {
    if (!fil.automate) return;
    mainPriseLe.current.delete(fil.numero);
    const rendueLe = rendsALAutomate(fil.numero, { mainPasseeLe: automates.get(fil.numero)?.fil?.mainPasseeLe, branchId: branch.id });
    /* IL REPREND TOUT DE SUITE (13 octobre 2026) : la fonction renvoie l'étape
       où il en était, si la fenêtre de 24 heures est ouverte. */
    const attendre = 'Rendu à l’automate. Il reprendra au prochain message de la cliente, sans rien lui écrire d’ici là.';
    if (!supabase || !rendueLe) { toast(attendre); return; }
    toast('Rendu à l’automate : il reprend où il en était…');
    void supabase.functions.invoke('whatsapp-automate', { body: { reprise: { numero: fil.numero, tiroir: fil.tiroir, rendueLe } } })
      .then(({ data }) => {
        const r = (data ?? {}) as { repris?: boolean; raison?: string; etape?: string };
        if (r.repris) toast(`L’automate a repris : il a renvoyé « ${etapeDite(r.etape)} ».`);
        else if (r.raison === 'fenetre') toast('Rendu à l’automate. Elle n’a pas écrit depuis plus de 24 h : WhatsApp l’empêche d’écrire le premier, il reprendra à son prochain message.');
        else toast(attendre);
      }, () => toast(attendre));
  };
  /* LE RENDEZ-VOUS SE POSE À LA MAIN, depuis le fil. Pré-rempli du panier
     quand l'automate en a un ; jamais de maître choisi d'avance, la Maison
     attribue. Pour un fil sans fiche, la fenêtre fait choisir la tête :
     aucune fiche ne naît ici. */
  const poseUnRendezVous = (depuisLePanier: boolean): void => {
    const p = depuisLePanier ? fil.automate?.panier : undefined;
    if (depuisLePanier) prendsLaMain('rendez-vous');
    setRdvDuFil({
      initial: {
        clientId: p?.clientId ?? fil.clientId,
        ...(p?.serviceIds?.length ? { serviceIds: [...p.serviceIds] } : {}),
        ...(p?.date ? { date: p.date } : {}),
        ...(p?.time ? { time: p.time } : {}),
      },
      avant: appointmentsStore.get().length,
    });
  };
  /* L'hôte lit ces deux gestes à chaque rendu : jamais une copie du premier. */
  if (poignee) poignee.current = { prendsLaMain, poseUnRendezVous };

  /* ── LES DIX GESTES ────────────────────────────────────────────────
     Maquette `public/maquette-la-conversation-outillee.html`, validée le
     14 septembre 2026. Le juge est pur et vit dans `shared/gestes-conversation` :
     ici on ne fait que le nourrir et dessiner ce qu'il rend. */
  const { gestes, codesVivants } = useGestesDuFil({ numero: fil.numero, nom: fil.nom, clientId: fil.clientId, fenetreOuverte: fil.fenetre.ouverte });

  /* UNE PIÈCE SEULE EST UN MESSAGE : WhatsApp accepte un fichier sans
     légende, et refuser ici obligerait à écrire « voici » pour rien. */
  const refus = piece && fil.fenetre.ouverte
    ? null
    : pourquoiLEnvoiEstImpossible({ texte, fenetre: fil.fenetre, numero: fil.numero });

  /* UN GESTE REMPLIT LA ZONE, IL N'ENVOIE PAS. C'est une main qui relit.
     Ce qu'il AVERTIT se dit tout de suite : un compteur que la cliente
     contestera est pire qu'un silence, et l'écran doit le dire AVANT. */
  const poseLeGeste = (g: Geste) => {
    if (g.eteint) { toast(g.eteint); return; }
    prendsLaMain('geste');
    if (g.compose) surTexte(g.compose);
    if (g.avertit) toast(g.avertit);
    /* LA FACTURE ET LE DEVIS SE JOIGNENT POUR DE VRAI · 18 octobre 2026.
       « Sa facture sur ce message n'attache pas la facture en PDF » (Yéman) :
       le geste écrivait le texte et laissait la pièce de côté. Le PDF est
       celui des Factures (numéro, QR Tap & Go du reste), posé comme une pièce
       choisie à la main : il se relit, se retire, et part avec le texte. */
    if (g.piece && (g.piece.quoi === 'facture' || g.piece.quoi === 'devis')) {
      const id = g.piece.invoiceId;
      const nom = g.piece.nom;
      const doc = invoicesStore.get().find((i) => i.id === id);
      if (!doc) { toast(`${nom} introuvable : le texte est prêt, sans la pièce.`); return; }
      void (async () => {
        try {
          const { invoiceEnPiece } = await import('../../../../shared/pdf');
          setPiece(await invoiceEnPiece(buildPdfData(doc)));
        } catch {
          toast(`${nom} : le PDF n’a pas pu se faire. Joignez-le avec « + Pièce jointe ».`);
        }
      })();
    } else if (g.piece) {
      /* ON NE PROMET PAS UN FICHIER QU'ON N'A PAS. Le bilan vit dans une page
         imprimable, les photos de séance n'ont pas encore de logement : le
         message part seul, et l'écran le dit plutôt que d'annoncer une pièce
         absente. Voir la maquette, « où vivent les photos d'une séance ». */
      toast(`${g.piece.nom} : le texte est prêt, la pièce ne se joint pas encore.`);
    }
  };

  /* ══ LES HUIT SECONDES QUI SAUVENT · 14 septembre 2026 ═══════════════
     « J'aimerais éditer des messages qui sont partis » (Yéman). Un message
     parti ne se modifie pas chez la cliente : le meilleur remède n'est donc
     pas de le corriger, c'est de ne pas l'envoyer. */
  const delaiMs = delaiDeRetenue(reglages.retenueSecondes);

  /* L'HORLOGE DU COMPTE À REBOURS. Elle ne tourne QUE tant qu'un message
     attend : un intervalle qui bat pour rien réveille l'onglet toute la
     journée et vide la batterie de la tablette. */
  const [tacTac, setTacTac] = useState(0);
  useEffect(() => {
    if (!enAttente) return undefined;
    const t = window.setInterval(() => setTacTac((n) => n + 1), 500);
    return () => window.clearInterval(t);
  }, [enAttente]);
  void tacTac;

  const partir = async (a: Attente, enFermant = false) => {
    const corps = {
      numero: a.numero,
      texte: a.modele ? (a.texteAffiche ?? '') : a.texte,
      modele: a.modele ?? '',
      variables: a.variables,
      ...(a.boutonUrl ? { boutonUrl: a.boutonUrl } : {}),
      clientId: a.clientId,
      branchId: branch.id,
      parQui: session?.user?.email ?? undefined,
      ...(a.citeWaId ? { citeWaId: a.citeWaId } : {}),
      /* RIEN DE PUBLIC : les octets traversent la fonction, qui les dépose
         chez Meta. Aucune adresse n'existe, ni chez nous ni ailleurs. */
      ...(a.piece && !a.modele ? { piece: a.piece } : {}),
    };
    /* ── EN FERMANT L'ONGLET, ON PART QUAND MÊME ──────────────────────
       Le navigateur annule les requêtes en vol d'une page qui se ferme ;
       `keepalive` les laisse finir. Un message qu'on croit envoyé et qui
       n'est jamais parti est pire qu'un message qu'on aurait voulu retenir. */
    if (enFermant) {
      /* Hors ligne, le message ne peut pas finir sa course : il se garde, et
         part à la prochaine ouverture avec réseau (4 octobre 2026). */
      if (typeof navigator !== 'undefined' && navigator.onLine === false) { gardeUnAppel('whatsapp-envoi', corps, `WhatsApp au ${a.numero}`); return; }
      /* UNE PIÈCE TROP LOURDE POUR `keepalive` SE GARDE AUSSI (10 octobre
         2026, revue) : au-delà de 64 Kio le navigateur refuse la requête, et
         le refus se perdait avec l'onglet. Gardée, elle part à la prochaine
         ouverture du Trône. */
      if (!partEnFermant(JSON.stringify(corps))) { gardeUnAppel('whatsapp-envoi', corps, `WhatsApp au ${a.numero}`); return; }
      const base = adresseDesFonctions;
      const jeton = (await supabase?.auth.getSession())?.data.session?.access_token;
      if (!base || !jeton) return;
      void fetch(`${base}/whatsapp-envoi`, {
        method: 'POST',
        keepalive: true,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${jeton}`,
          ...(cleAnonyme ? { apikey: cleAnonyme } : {}),
        },
        body: JSON.stringify(corps),
      });
      return;
    }
    setEnvoi(true);
    try {
      /* HORS LIGNE, IL ATTEND (4 octobre 2026) : gardé sur l'appareil, il part
         de lui-même au retour du réseau ; la pastille le compte. */
      const issue = await appelleOuGarde('whatsapp-envoi', corps, `WhatsApp au ${a.numero}`);
      if ('erreur' in issue) throw issue.erreur;
      toast('enAttente' in issue
        ? 'Hors ligne : le message partira au retour du réseau.'
        : a.modele ? `Modèle « ${a.modele} » envoyé.` : 'Message envoyé.');
    } catch (e) {
      toast(`Non envoyé : ${await motifDuRefus(e)}`);
    } finally {
      setEnvoi(false);
    }
  };

  /* UN MESSAGE RETENU NE PART QU'UNE FOIS · 10 octobre 2026 (revue). Cinq
     chemins le font partir : le bout du compte, « Envoyer maintenant », le
     message suivant, l'onglet qui se ferme, l'écran qu'on quitte. Un oubli
     de l'un d'eux l'envoyait deux fois à la cliente (un modèle posé pendant
     la retenue) : chaque attente partie se note, et ne repart plus. */
  const dejaPartis = useRef(new WeakSet<Attente>());
  const partirUneFois = (a: Attente, enFermant = false) => {
    if (dejaPartis.current.has(a)) return;
    dejaPartis.current.add(a);
    void partir(a, enFermant);
  };
  /* `partir` lit la branche et la session du rendu : les écoutes posées une
     fois pour toutes l'appellent par cette référence, jamais par la copie du
     premier rendu. */
  const partirUneFoisRef = useRef(partirUneFois);
  partirUneFoisRef.current = partirUneFois;

  /* LE DÉPART SE DÉCLENCHE AU BOUT DU COMPTE. */
  const attenteEnCours = useRef<Attente | null>(null);
  attenteEnCours.current = enAttente;
  useEffect(() => {
    if (!enAttente) return undefined;
    const t = window.setTimeout(() => {
      setEnAttente(null);
      partirUneFois(enAttente);
    }, Math.max(0, enAttente.posteLe + delaiMs - Date.now()));
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enAttente, delaiMs]);

  /* L'ONGLET QUI SE FERME NE MANGE PAS LE MESSAGE. `pagehide` plutôt que
     `beforeunload` : c'est le seul que les navigateurs mobiles honorent. */
  useEffect(() => {
    const surFermeture = () => {
      const a = attenteEnCours.current;
      if (a) partirUneFoisRef.current(a, true);
    };
    window.addEventListener('pagehide', surFermeture);
    return () => window.removeEventListener('pagehide', surFermeture);
  }, []);

  /* L'ÉCRAN QU'ON QUITTE NE MANGE PAS LE MESSAGE NON PLUS · 10 octobre 2026
     (revue). Les Conversations se démontent dès qu'on change d'écran
     (« Ouvrir sa fiche », la barre) : le compte à rebours s'effaçait avec
     elles, et le message annoncé « part dans 5 secondes » ne partait jamais,
     sans un mot. Il part donc au démontage, comme à la fermeture. */
  useEffect(() => () => {
    const a = attenteEnCours.current;
    if (a) partirUneFoisRef.current(a);
  }, []);

  /* ── L'ENVOI PASSE PAR LA FONCTION, JAMAIS PAR LE NAVIGATEUR ────────
     Le jeton Meta autorise à écrire au nom de la Maison à n'importe quel
     numéro : le poser ici, ce serait le publier. */
  const envoie = async (modele?: string, variables: string[] = [], extra: { boutonUrl?: string; texteAffiche?: string } = {}) => {
    if (envoiEnCours) return;
    if (!modele && refus) { toast(refus); return; }
    /* SANS SUPABASE, RIEN NE PART, et l'écran le dit. La Maison peut tourner
       hors ligne pour lire son carnet ; écrire à une cliente, non. */
    if (!supabase) { toast('Pas de connexion à la Maison : le message n’est pas parti.'); return; }
    /* UN MESSAGE DE L'ÉQUIPE FAIT TAIRE L'AUTOMATE, même posé sans frappe
       (un texte venu d'ailleurs, un modèle). */
    prendsLaMain(modele ? 'modele' : 'envoi');

    /* ON POSTE, ON N'ENVOIE PAS ENCORE. Le message paraît dans le fil tout de
       suite ; il ne quitte la Maison qu'au bout du délai. C'est le seul vrai
       « annuler l'envoi » qui existe, et il ne demande la permission de
       personne, ni celle de Meta, ni celle de la cliente.

       LE MOTIF D'UN REFUS VIT DANS LE CORPS, PAS DANS LE MESSAGE : voir
       `motifDuRefus`, plus haut. C'est `partir` qui le lit désormais. */
    const aPoster: Attente = {
      texte: texte.trim(),
      piece: modele ? null : piece,
      citeWaId: cite?.waId,
      modele,
      variables,
      ...extra,
      numero: fil.numero,
      clientId: fil.clientId,
      posteLe: Date.now(),
    };
    surTexte('');
    setPiece(null);
    surCite(null);

    /* UN SEUL MESSAGE RETENU À LA FOIS : le précédent part tout de suite,
       sinon « retenir » ne désignerait plus rien. */
    /* ET L'ATTENTE SE VIDE (10 octobre 2026, revue) : sur le chemin d'un
       modèle, rien d'autre ne la vidait, et le compte à rebours déjà armé
       renvoyait le même message à son terme. */
    if (enAttente) { const a = enAttente; setEnAttente(null); partirUneFois(a); }
    /* UN MODÈLE NE SE RETIENT PAS. Son texte est fixe et approuvé par Meta :
       il n'y a aucune faute de frappe à rattraper, et la confirmation qui
       vient de l'annoncer a déjà joué ce rôle, mieux. Lui imposer huit
       secondes de plus ferait attendre pour rien. */
    if (modele) { void partir(aPoster); return; }
    if (delaiMs <= 0) { void partir(aPoster); return; }
    setEnAttente(aPoster);
  };

  /* RETENIR · le texte revient dans la zone de saisie, tel quel. */
  const retenir = () => {
    if (!enAttente) return;
    surTexte(enAttente.texte);
    setPiece(enAttente.piece);
    setEnAttente(null);
    toast('Retenu. Il n’est pas parti.');
  };

  /* ══ MARQUER LU · les deux coches bleues ═══════════════════════════
     Elle voit qu'on l'a lue, donc elle attend au lieu de réécrire. Et elle
     voit aussi qu'on l'a lue SANS répondre : d'où le réglage. */
  useEffect(() => {
    if (!supabase || reglages.cochesBleues === false) return;
    const aDire = fil.messages.filter((m) => m.sens === 'entrant' && m.waId && !m.luParLaMaisonLe);
    if (aDire.length === 0) return;
    /* LE DERNIER SUFFIT : Meta marque lu tout ce qui le précède, et le dire
       message par message multiplierait les appels pour rien. */
    const dernier = aDire[aDire.length - 1];
    void supabase.functions.invoke('whatsapp-envoi', { body: { marquerLu: dernier.waId } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fil.numero, fil.messages.length, reglages.cochesBleues]);

  return (
    <>
      {/* LE MESSAGE RETENU · il paraît, mais n'a pas encore quitté la
          Maison. Quelques secondes pour se raviser. */}
      {enAttente && enAttente.numero === fil.numero && (
        <div className="trc-bulles" style={{ flex: 'none', maxHeight: 'none', padding: '8px 16px' }}>
          <div className="trc-b trc-b--attente">
            {enAttente.texte || enAttente.piece?.nom || `Modèle ${enAttente.modele}`}
            <span className="trc-b__h">
              part dans {resteDeLaRetenue(enAttente.posteLe, delaiMs, Date.now())} secondes
            </span>
            <span className="trc-b__gestes">
              <button type="button" onClick={retenir}>Retenir</button>
              <button
                type="button"
                onClick={() => { const a = enAttente; setEnAttente(null); partirUneFois(a); }}
              >
                Envoyer maintenant
              </button>
            </span>
          </div>
        </div>
      )}

      {/* ── LA SAISIE, ET LA RÈGLE QU'ELLE PORTE ── */}
      <div className={`trc-saisie${fil.fenetre.ouverte ? '' : ' est-close'}`}>
        {/* LE BANDEAU DE L'AUTOMATE, DANS LA SAISIE (9 octobre 2026) :
            c'est là qu'on reprend la main, au téléphone aussi. */}
        {fil.automate && fil.automate.tenue !== 'aucun' && (() => {
          const vue = fil.automate;
          const a = automates.get(fil.numero);
          const rdv = vue.rdvId ? rendezVous.find((x) => x.id === vue.rdvId) : undefined;
          const noms = (rdv?.serviceIds ?? []).map((id) => servicesParId.get(id)?.name ?? '').filter(Boolean);
          const gestesDuRdv = noms.length <= 1 ? (noms[0] ?? '') : `${noms.slice(0, -1).join(', ')} et ${noms[noms.length - 1]}`;
          /* Un rendez-vous déjà posé par l'automate (même si la main
             a passé juste après) ne se pose pas deux fois. */
          const posable = vue.tenue !== 'fini' && !vue.rdvId && !estReserve(fil.tiroir) && (vue.panier?.serviceIds?.length ?? 0) > 0;
          return (
            <BandeauDeLAutomate
              vue={vue}
              etat={a?.fil ?? null}
              main={a?.main ?? null}
              rdv={rdv}
              gestesDuRdv={gestesDuRdv}
              surReprendre={() => prendsLaMain('reprendre', true)}
              surRendre={rendsLaMain}
              surPoser={posable ? () => poseUnRendezVous(true) : undefined}
              surOuvrirRdv={rdv ? () => setRdvOuvert(rdv) : undefined}
              pauseHeures={reglageAutomate.pauseHeures}
              parLaReception={[...fil.messages].reverse().find((m) => m.sens === 'sortant')?.reception === true}
            />
          );
        })()}
        {/* POURQUOI L'AUTOMATE SE TAIT SUR CE FIL (14 octobre 2026). Un numéro
            qu'il n'a jamais mené n'avait ni bandeau ni bouton : l'essai sur le
            numéro de Brice est resté muet sans que rien le dise. La main de
            l'équipe (la pause posée quand une personne écrit) se lève ici ;
            un numéro qu'il ne sert pas le dit, avec le réglage à toucher. */}
        {(!fil.automate || fil.automate.tenue === 'aucun') && fil.tiroir !== 'prestataires' && (() => {
          const mainDuFil = automates.get(fil.numero)?.main ?? null;
          if (pauseActive(mainDuFil, Date.now())) {
            return (
              <div className="trc-automate trc-automate--pause" role="status">
                <span className="trc-automate__dit">
                  L’équipe a la main{mainDuFil?.jusqua ? ` ${finDuBandeau(mainDuFil.jusqua)}` : ''} : l’automate se tait sur ce fil.
                </span>
                <span className="trc-automate__gestes">
                  <Button variant="ghost" size="sm" onClick={() => {
                    mainPriseLe.current.delete(fil.numero);
                    rendsALAutomate(fil.numero, { branchId: branch.id });
                    toast('Rendu à l’automate : il répondra au prochain message de ce numéro.');
                  }}>Rendre à l’automate</Button>
                </span>
              </div>
            );
          }
          if (!numeroServi(reglageAutomate, fil.numero, fil.tiroir)) {
            const pourquoi = reglageAutomate.mode === 'eteint' ? 'il est éteint'
              : reglageAutomate.mode === 'essai' ? 'il est en Essai, et ce numéro n’est pas dans sa liste'
              : 'il est Ouvert, mais ne sert que les clientes et les numéros de sa liste';
            return (
              <div className="trc-automate trc-automate--pause" role="status">
                <span className="trc-automate__dit">L’automate ne répond pas à ce numéro : {pourquoi} (Système › Paramètres).</span>
              </div>
            );
          }
          return null;
        })()}
        <div className="trc-saisie__q">
          {fil.fenetre.ouverte ? (
            <>
              <span className="trc-horloge trc-horloge--ouverte">
                Fenêtre ouverte · {resteEnClair(fil.fenetre.resteMs)}
              </span>
              <span className="trc-sub" style={{ fontSize: 12 }}>
                Elle a écrit à {heureDuMessage(fil.fenetre.depuis ?? fil.dernier.quand)}. Vous pouvez répondre
                librement jusque-là demain.
              </span>
            </>
          ) : (
            <>
              <span className="trc-horloge trc-horloge--close">
                {fil.fenetre.depuis ? 'Fenêtre fermée' : 'Elle ne vous a jamais écrit'}
              </span>
              {/* ── CE QUE META FACTURE VRAIMENT · 15 septembre 2026 ──
                  Cette phrase disait « un modèle rouvre une conversation
                  de 24 h, et Meta LA facture ». C'était vrai jusqu'en
                  juin 2025 ; depuis le 1er juillet 2025 Meta facture AU
                  MESSAGE, et la conversation n'est plus l'unité.

                  LA NUANCE CHANGE LA DÉCISION : sous l'ancien modèle,
                  une fois la conversation payée on pouvait tout dire.
                  Aujourd'hui c'est chaque modèle hors fenêtre qui
                  compte, et répondre ensuite dans la fenêtre qu'il
                  ouvre ne coûte rien. */}
              <span className="trc-sub" style={{ fontSize: 12 }}>
                WhatsApp n’accepte plus que vos modèles approuvés. <b>Meta facture
                le modèle</b>, pas la conversation : une fois qu’elle vous aura
                répondu, {laFenetreSePaie()
                  ? `vos réponses entrent dans les ${REPONSES_GRATUITES_DU_MOIS.toLocaleString('fr-FR')} gratuites du mois.`
                  : `les 24 h qui suivent sont gratuites jusqu’au 30 septembre, puis ${REPONSES_GRATUITES_DU_MOIS.toLocaleString('fr-FR')} réponses gratuites par mois.`}
              </span>
            </>
          )}
        </div>

        {fil.fenetre.ouverte ? (
          <>
            {/* ── LA BARRE D'OUTILS ──────────────────────────────
                Dix gestes, chacun disant son état, et deux portes
                pour les fichiers. Un geste REMPLIT la zone ; c'est
                une main qui relit et qui envoie. */}
            <div className="trc-gestes-rangee">
              <ChoisirUnFichier surFichier={setPiece} occupe={envoiEnCours} />
              <button type="button" className="trc-geste trc-geste--tel" onClick={() => setLienOuvert(true)}>
                <b>Lien de réservation</b>
              </button>
              <BarreDesGestes
                gestes={gestes}
                surGeste={poseLeGeste}
                surPromo={() => setPromoOuverte(true)}
                occupe={envoiEnCours}
              />
            </div>

            {/* CE QU'ON CITE, au-dessus de ce qu'on écrit, comme
                WhatsApp le montre à la cliente. */}
            {cite && (
              <div className="trc-piece">
                <span className="trc-piece__v">Cite</span>
                <span className="trc-piece__n">{cite.texte}</span>
                <button type="button" className="trc-piece__x" onClick={() => surCite(null)}>
                  Ne plus citer
                </button>
              </div>
            )}

            {piece && (
              <div className="trc-piece">
                <span className="trc-piece__v">{piece.type.startsWith('image/') ? 'IMG' : 'PDF'}</span>
                <span className="trc-piece__n">{piece.nom}</span>
                <button type="button" className="trc-piece__x" onClick={() => setPiece(null)}>
                  Retirer
                </button>
              </div>
            )}

            <textarea
              className="mnd-input trc-saisie__texte"
              rows={2}
              value={texte}
              placeholder={`Écrivez à ${fil.nom.split(' ')[0]}…`}
              onChange={(e) => {
                /* La première lettre fait taire l'automate (9 octobre 2026). */
                if (e.target.value.trim()) prendsLaMain('frappe');
                surTexte(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void envoie(); }
              }}
            />
            <div className="trc-saisie__envoi" style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="trc-sub trc-saisie__note" style={{ fontSize: 11, marginRight: 'auto' }}>
                La devise ne se pose pas ici : elle signe ce que la Maison écrit seule.
              </span>
              {/* « Proposer une réponse » (19 octobre 2026) : Claude remplit la zone, la main relit et envoie par le bouton d'à côté. */}
              <ReponseProposee key={fil.numero} fil={fil} texte={texte} occupe={envoiEnCours} surProposition={(t) => { if (t) prendsLaMain('proposition'); surTexte(t); }} />
              <Button className="trc-saisie__lien" variant="ghost" size="sm" onClick={() => setLienOuvert(true)}>Lien de réservation</Button>
              <Button
                variant="copper"
                size="sm"
                disabled={!!refus || envoiEnCours}
                onClick={() => void envoie()}
              >
                {envoiEnCours ? 'Envoi…' : 'Envoyer'}
              </Button>
            </div>
          </>
        ) : estReserve(fil.tiroir) ? (
          /* LES MODÈLES DES CLIENTES NE SERVENT PAS ICI : un rappel de
             rendez-vous à une employée n'aurait pas de sens. Ses
             modèles à elle partent de l'écran qui décide. */
          <p className="trc-sub" style={{ margin: 0 }}>
            Hors fenêtre, écrivez-lui depuis l’écran qui décide : <b>la Paie</b> pour un bulletin,
            <b> Temps & absences</b> pour un congé, <b>les Engagements</b> pour un versement.
            Chacun part par son modèle approuvé. Ou attendez qu’elle écrive : la fenêtre se rouvre.
          </p>
        ) : (
          <div className="trc-saisie__modeles" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="copper" size="sm" disabled={envoiEnCours} onClick={() => setLienOuvert(true)}>
              Réservation préparée
            </Button>
            {MODELES.filter((m) => m.nom !== 'avis_google' || demandeDAvis.permise).map((m) => (
              <Button
                key={m.nom}
                variant="copper"
                size="sm"
                disabled={envoiEnCours}
                title={`${m.dit} · ${m.nom}`}
                onClick={() => setModeleAConfirmer({ nom: m.nom, dit: m.dit })}
              >
                {m.dit}
              </Button>
            ))}
            {!demandeDAvis.permise && (
              <span className="trc-sub" style={{ alignSelf: 'center' }}>{ditLaDemandeDAvis(demandeDAvis, jourAn)}</span>
            )}
          </div>
        )}
      </div>

      {/* LA REMISE À SON NOM (ex-« promo flash ») : un code par cliente, à
          usage unique, 48 heures. La direction seule en crée : une remise est
          de l'argent qui sort. La vraie barrière est la RLS (0093) ; celle-ci
          n'est que la politesse de ne pas montrer un bouton qui refusera. */}
      {lienOuvert && (
        <LienDeReservation
          prenom={appelDe(clients.find((c) => c.id === fil.clientId), fil.nom)}
          fenetreOuverte={fil.fenetre.ouverte}
          surMessage={(m) => { prendsLaMain('lien'); surTexte(m); setLienOuvert(false); toast('Lien posé. Relisez le message avant de l’envoyer.'); }}
          surModele={(variables, boutonUrl, texteAffiche) => {
            setLienOuvert(false);
            setModeleAConfirmer({ nom: 'reservation_preparee', dit: 'Réservation préparée', variables, boutonUrl, texteAffiche });
          }}
          surFermer={() => setLienOuvert(false)}
        />
      )}
      {promoOuverte && fil.clientId && (
        <PanneauDeLaPromo
          tete={{ id: fil.clientId, name: fil.nom }}
          estDirection={estDirection}
          parQui={session?.user?.email ?? undefined}
          vivants={codesVivants}
          surCode={(c, message) => {
            prendsLaMain('geste');
            surTexte(message);
            setPromoOuverte(false);
            toast(`Code ${c.code} posé. Relisez le message avant de l’envoyer.`);
          }}
          surFermer={() => setPromoOuverte(false)}
        />
      )}

      {/* ══ UN MODÈLE SE CONFIRME AVANT DE PARTIR · 15 septembre 2026 ═══
          « Si j'appuie un des modèles je dois avoir un message qui m'avertit
          que je vais être facturé » (Yéman).

          ON DIT COMBIEN, PAS EN FRANCS. La Maison n'a pas les tarifs du Bénin
          et les inventer mettrait un chiffre faux sous les yeux de quelqu'un
          qui déciderait dessus. Le RANG dans le mois, lui, est exact et rend
          la dépense tangible : « le douzième ce mois-ci » se comprend mieux
          qu'un tarif hors contexte.

          ET L'ON RAPPELLE CE QUI EST GRATUIT, parce que c'est souvent la
          meilleure décision : attendre qu'elle écrive ne coûte rien. */}
      {modeleAConfirmer && (
        <div className="trc-modal-fond" onClick={() => setModeleAConfirmer(null)}>
          <div className="trc-modal" onClick={(e) => e.stopPropagation()}>
            <div className="trc-modal__t">Ce modèle sera facturé</div>
            <p className="trc-sub" style={{ marginTop: 0 }}>
              <b>{modeleAConfirmer.dit}</b> partira à <b>{fil.nom}</b>.
              Sa fenêtre est fermée : WhatsApp n’accepte qu’un modèle approuvé, et
              <b> Meta facture ce message</b> au tarif de sa catégorie.
            </p>
            <p className="trc-sub">
              Ce sera le <b>{modelesDuMois.factures + 1}<sup>e</sup></b> modèle facturé
              de la Maison ce mois-ci.
              {modelesDuMois.gratuits > 0
                ? ` ${modelesDuMois.gratuits} autre${modelesDuMois.gratuits > 1 ? 's sont partis' : ' est parti'} sans rien coûter.`
                : ''}
            </p>
            <p className="trc-sub">
              {laFenetreSePaie() ? (
                <>
                  <b>Ce qui peut ne rien coûter :</b> attendre qu’elle vous écrive. Vos réponses
                  entrent alors dans les {REPONSES_GRATUITES_DU_MOIS.toLocaleString('fr-FR')} gratuites
                  du mois, dont <b>{modelesDuMois.reponses}</b> déjà utilisée{modelesDuMois.reponses > 1 ? 's' : ''}.
                </>
              ) : (
                <>
                  <b>Ce qui ne coûte rien :</b> attendre qu’elle vous écrive. Les 24 heures qui
                  suivent son message sont gratuites jusqu’au 30 septembre, puis
                  {' '}{REPONSES_GRATUITES_DU_MOIS.toLocaleString('fr-FR')} réponses gratuites par mois.
                </>
              )}
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <Button variant="ghost" size="sm" onClick={() => setModeleAConfirmer(null)}>
                Ne pas envoyer
              </Button>
              <Button
                variant="copper"
                size="sm"
                disabled={envoiEnCours}
                onClick={() => {
                  const m = modeleAConfirmer;
                  setModeleAConfirmer(null);
                  void envoie(m.nom, m.variables ?? [], { boutonUrl: m.boutonUrl, texteAffiche: m.texteAffiche });
                }}
              >
                Envoyer quand même
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* LE RENDEZ-VOUS DEPUIS LA CONVERSATION · 9 octobre 2026. La création
          se lit en comptant, comme depuis un appel. */}
      {rdvDuFil && (
        <RdvModal
          title="Rendez-vous depuis une conversation"
          initial={rdvDuFil.initial}
          onClose={() => {
            const apres = appointmentsStore.get().length;
            if (apres > rdvDuFil.avant) toast('Rendez-vous posé depuis la conversation.');
            setRdvDuFil(null);
          }}
        />
      )}
      {rdvOuvert && (
        <RdvModal appt={rdvOuvert} onClose={() => setRdvOuvert(null)} />
      )}
    </>
  );
}
