import { useEffect, useMemo, useState } from 'react';
import { useBranch } from '../../../../shared/branches';
import { useFamilies } from '../../../../shared/clients';
import { useClientsDeLaMaison, usePiecesDeLaMaison } from '../../../../shared/essai';
import { invoiceResteXof, useDepensesComptees } from '../../../../shared/finance';
import { EST_ACTIVITE, receiptKindLabel } from '../../../../shared/receipts';
import { usePlans, useSubscribers } from '../../../../shared/abonnements';
import { useServices } from '../../../../shared/catalog';
import { plagesBloquees, useBlocages } from '../../../../shared/blocages';
import { openingForIso } from '../../../../shared/settings';
import { momentDuSalon } from '../../../../shared/calendrier';
import { estSuggere } from '../../../../shared/rendez-vous-suggere-pur';
import { ETAPES, classeLaCliente, ficheDuClassement, joursEntre } from '../../../../shared/classement-pur';
import { useClassement } from '../../../../shared/classement';
import {
  TIROIRS, automatesDesFils, estArchive, filsDeLaMaison, filsSansReponse, tetesDeLaMaison,
  useAlarmeRetires, useFilsArchives, useFilsAutomate, useFilsPrives, useMessagesWa, type Fil,
} from '../../../../shared/conversations';
import { reglageDeLAutomate } from '../../../../shared/automate-wa';
import { useConversationsSupprimees } from '../../../../shared/conversations-supprimees';
import { useProviders } from '../../../../shared/prestataires';
import { useFournisseurs } from '../../../../shared/stock';
import { useEngagements } from '../../../../shared/engagements';
import { pourClaude, sansCoordonnees, type Personne } from '../../../../shared/ia-anonymise-pur';
import { dateDite, heureDite, personnesDe, prenomDeLaFiche } from '../../../../shared/ia-fiche-du-jour-pur';
import {
  ETAT_DE_L_AVIS_DIT, avisDeLaDemande, clientesDeLaQuestion, clientesDuMessage, clientesDuNom, dernierJourDuMois, dureeEnClair, enDirectEnTexte, etoilesDites, fenetreDesDepenses, fenetreDesRendezVous, filDeLaDemande, francsPourPerle, lignesEnDirect, moisDAvant, sansLesClientes, verdictDeLaPlace,
  type AvisDeLaDemande, type AvisDemande, type EtatDUnAvis, type FaitLu, type FilDeLaDemande, type LectureDemandee, type LigneEnDirect, type MessageDemande, type RdvDuJour, type VerdictDeLaPlace,
} from '../../../../shared/perle-pur';
import { avisDeLaRubrique, estRecent, etatDeLAvis, noteDesDixDerniers, reponsesARelire } from '../../../../shared/avis-rubrique-pur';
import { prenomDeLAuteur } from '../../../../shared/ia-avis-pur';
import { brouillonsDAvisStore, proposeUneReponse, useBrouillonsDAvis, type ResultatDeProposition } from '../../../../shared/ia-avis';
import { useAvisDeGoogle } from '../../../../shared/avis-google-pont';
import { useReleveDesAvis } from '../clients/releve-des-avis';
import type { JourDePlaces } from '../../../../shared/ia-reponse-wa-pur';
import { useContexteDeLaReponse } from '../clients/contexte-de-la-reponse';
import { useAutoConfig, useStaff as useEquipe } from '../equipe/data';
import { useRegistreEncaissements } from '../finances/_shared';
import { apptDueXof, apptDurationMin, apptNetXof, timeToMin, useBranchAppointments, useServicesById } from '../clients/_shared';
import { placesDuJour, type Occupant } from '../clients/rdv-fluide-pur';
import { aDejaSaPiece } from '../vente/encaissement-pur';
import { aEncaisserMaintenant } from '../vente/caisse-fluide-pur';

/* ══ CE QUE PERLE LIT DANS LE TRÔNE — 21 novembre 2026 ═══════════════════
   Les règles vivent dans `shared/perle-pur` ; ici, les magasins. Tout est lu
   par les MÊMES portes que les écrans : le registre des encaissements, le
   Carnet sans les fiches d'essai, les factures, l'alarme des conversations
   (mêmes juges, sans sa sonnette), le classement des clientes.

   « En direct » se recalcule seul : les magasins préviennent, et l'horloge
   bat chaque minute à l'heure de Cotonou (`momentDuSalon`).

   CE QUI SORT D'ICI VERS CLAUDE EST DÉJÀ ANONYMISÉ : une cliente se dit par
   son prénom et une initiale (`prenomDeLaFiche`), un texte libre passe par
   `pourClaude`. La fonction repasse derrière (`sansCoordonnees`). */

const somme = (l: readonly number[]): number => l.reduce((s, x) => s + (Number(x) || 0), 0);
const parCle = <T,>(l: readonly T[], cle: (x: T) => string, montant: (x: T) => number): { k: string; xof: number; n: number }[] => {
  const m = new Map<string, { xof: number; n: number }>();
  for (const x of l) { const k = cle(x) || 'Autre'; const v = m.get(k) ?? { xof: 0, n: 0 }; v.xof += montant(x); v.n += 1; m.set(k, v); }
  return [...m.entries()].map(([k, v]) => ({ k, ...v })).sort((a, b) => b.xof - a.xof);
};
const borne = (t: string, n: number): string => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const jourEtDate = (iso: string): string => `${JOURS[new Date(`${iso}T12:00:00Z`).getUTCDay()] ?? ''} ${dateDite(iso)}`.trim();
/* Une durée ne se lit jamais comme une heure : « 13 h 52 min », « 2 heures » (`dureeEnClair`). */
const dureeDite = dureeEnClair;

/** Les conversations qui attendent une réponse, fenêtre ouverte : les mêmes
    juges que l'alarme du tableau de bord (`filsDeLaMaison`, `filsSansReponse`),
    sans la sonnette, que l'alarme garde pour elle. */
function useConversationsQuiAttendent(tick: number): { tous: Fil[]; enAttente: Fil[] } {
  const { branch } = useBranch();
  const [clients] = useClientsDeLaMaison();
  const [familles] = useFamilies();
  const [messages] = useMessagesWa();
  const [prives] = useFilsPrives();
  const [archives] = useFilsArchives();
  const [supprimees] = useConversationsSupprimees();
  const [retires] = useAlarmeRetires();
  const [equipe] = useEquipe();
  const [prestataires] = useProviders();
  const [fournisseurs] = useFournisseurs();
  const [engagements] = useEngagements();
  const [lignesDeLAutomate] = useFilsAutomate();
  const [configAuto] = useAutoConfig();
  const pauseHeures = reglageDeLAutomate(configAuto.automateWa).pauseHeures;
  const automates = useMemo(() => automatesDesFils(lignesDeLAutomate, pauseHeures), [lignesDeLAutomate, pauseHeures]);
  const tetes = useMemo(
    () => tetesDeLaMaison({ clientes: clients, familles, equipe, prestataires, fournisseurs, engagements }),
    [clients, familles, equipe, prestataires, fournisseurs, engagements],
  );
  return useMemo(() => {
    const tous = filsDeLaMaison(messages, tetes, prives, tick, branch.id, automates).filter((f) => !estArchive(f, supprimees));
    /* Celle qui attend depuis le plus longtemps d'abord : c'est à elle qu'on répond en premier. */
    const depuis = (f: Fil): string => f.fenetre.depuis ?? f.dernierQuiCompte?.quand ?? '';
    const enAttente = [...filsSansReponse(tous, archives, TIROIRS, retires)].sort((a, b) => depuis(a).localeCompare(depuis(b)));
    return { tous, enAttente };
  }, [messages, tetes, prives, tick, branch.id, automates, supprimees, archives, retires]);
}

export type Perle = {
  jour: string;
  minutes: number;
  lignes: LigneEnDirect[];
  enDirectTexte: string;
  /** Une lecture du catalogue, exécutée sur les magasins : des faits déjà anonymisés. */
  lis: (l: LectureDemandee, question: string) => FaitLu[];
  /** La question, telle qu'elle peut partir : les noms complets en prénom et initiale. */
  pourClaude: (texte: string) => string;
  /** Ce qui part sur internet : sans numéro, et sans aucune cliente, même en prénom et initiale. */
  pourInternet: (texte: string) => string;

  /* ── PRÉPARER UNE RÉPONSE (second lot) : rien ici n'envoie ni n'écrit. ── */
  /** Les conversations qui attendent une réponse, la plus ancienne d'abord. */
  enAttente: Fil[];
  /** À qui la direction veut répondre : son fil, ou pourquoi on ne prépare rien. */
  filDe: (demande: MessageDemande, question: string, dejaPrepares?: readonly string[]) => FilDeLaDemande<Fil>;
  /** Un fil par son numéro (le brouillon gardé le désigne ainsi), s'il existe encore. */
  filDuNumero: (numero: string) => Fil | undefined;
  /** La cliente d'un fil, comme elle part chez Claude : prénom et initiale. */
  quiEst: (fil: Fil) => string;
  /** La place citée par la direction, jugée au Carnet ; rien si elle n'en cite pas. */
  placeAuCarnet: (jour?: string, heure?: string) => VerdictDeLaPlace | null;
  /** Le contexte d'une réponse à ce fil (la même source que le bouton du composeur), au jour de Cotonou. */
  contexteDuFil: (fil: Fil, o?: { dejaProposee?: string; places?: readonly JourDePlaces[] }) => string;

  /* ── LES AVIS GOOGLE (second lot) : Perle range un brouillon, elle ne publie rien. ── */
  /** Quel avis la direction veut voir répondu, ou pourquoi on ne prépare rien. */
  avisDe: (demande: AvisDemande, question: string, dejaMontres?: readonly string[]) => AvisDeLaDemande;
  /** Un avis par sa clé : ce que la carte en montre, et où en est sa réponse (le brouillon relu dans le magasin à l'instant). */
  avisDeLaCle: (cle: string) => AvisPourPerle | undefined;
  /** Le geste de l'écran des avis : Claude écrit, le brouillon se range dans le document des brouillons. */
  proposeAuxAvis: (cle: string) => Promise<ResultatDeProposition>;
  /** Les avis qui n'ont encore ni réponse ni brouillon, moins ceux déjà montrés ici. */
  avisAPreparer: (dejaMontres: readonly string[]) => number;
};

/** Un avis, tel que la carte de Perle le montre à la direction (sur son poste). */
export type AvisPourPerle = {
  cle: string; auteur: string; note: number; texte: string; jour?: string; etat: EtatDUnAvis;
  /** Le brouillon rangé dans Les avis Google, s'il y en a un. */
  brouillon?: string;
  /** La réponse que Google porte déjà. */
  publiee?: string;
};

export function usePerle(): Perle {
  const { branch } = useBranch();
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setTick(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  const { jour, minutes } = useMemo(() => momentDuSalon(tick), [tick]);

  const [toutesLesFiches] = useClientsDeLaMaison();
  const clients = useMemo(() => toutesLesFiches.filter((c) => c.branchId === branch.id && !c.archived), [toutesLesFiches, branch.id]);
  const rdvs = useBranchAppointments();
  const [toutesLesPieces] = usePiecesDeLaMaison();
  const pieces = useMemo(() => toutesLesPieces.filter((i) => i.branchId === branch.id), [toutesLesPieces, branch.id]);
  const recettes = useRegistreEncaissements();
  const depensesComptees = useDepensesComptees();
  const depenses = useMemo(() => depensesComptees.filter((d) => d.branchId === branch.id), [depensesComptees, branch.id]);
  const byId = useServicesById();
  const [services] = useServices();
  const [abonnes] = useSubscribers();
  const [formules] = usePlans();
  const [blocages] = useBlocages();
  const [classement] = useClassement();
  const { tous: tousLesFils, enAttente } = useConversationsQuiAttendent(tick);
  /* Le fil, la fiche, le compte et le catalogue d'une réponse : la source du bouton du composeur. */
  const contexteDe = useContexteDeLaReponse();
  /* LES AVIS GOOGLE, par les portes de leur écran : le relevé de Places, les
     avis que Make apporte, et le document des brouillons (synchronisé). */
  const releveDesAvis = useReleveDesAvis();
  const avisDeGoogle = useAvisDeGoogle();
  const [brouillonsDAvis] = useBrouillonsDAvis();
  const lesAvis = useMemo(() => avisDeLaRubrique(avisDeGoogle, releveDesAvis?.avis), [avisDeGoogle, releveDesAvis]);
  const etatDe = (a: (typeof lesAvis)[number]): EtatDUnAvis => etatDeLAvis(a, brouillonsDAvis[a.cle], tick);
  const sieges = Math.max(0, branch.seats ?? 0);

  const ficheParId = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  /* Les noms complets de la Maison, pour les rendre en prénom et initiale dans un texte libre. */
  const pleinsNoms = useMemo<Personne[]>(() => clients.map((c) => personnesDe(c.name)[0]).filter((p): p is Personne => !!p), [clients]);

  const etiquette = (clientId: string | undefined, nomDeRepli?: string): string => {
    const c = clientId ? ficheParId.get(clientId) : undefined;
    const nom = c?.name ?? nomDeRepli ?? '';
    return nom.trim() ? prenomDeLaFiche(nom) : 'Cliente de passage';
  };
  const gestesDe = (ids: readonly string[] | undefined): string =>
    (ids ?? []).map((id) => byId.get(id)?.name.split(' · ')[0]).filter(Boolean).join(' + ') || 'rituel';
  /* LES HEURES LIBRES D'UN JOUR pour un rituel d'une heure, ou sa fermeture :
     le même juge pour la lecture « places_libres » et pour la place qu'une
     réponse préparée promet. */
  const placesDu = (j: string): { ferme: boolean; heures: string[] } => {
    const ouverture = openingForIso(j);
    if (ouverture.closed) return { ferme: true, heures: [] };
    const occupes: Occupant[] = rdvs
      .filter((a) => a.date === j && a.status !== 'annulé' && /^\d{1,2}:\d{2}/.test(a.time ?? ''))
      .map((a) => ({ maitre: a.master, debutMin: timeToMin(a.time), dureeMin: apptDurationMin(a, byId) }));
    return { ferme: false, heures: placesDuJour({
      iso: j, aujourdhui: jour, maintenantMin: minutes, ouverture, durationMin: 60,
      occupes, bloques: plagesBloquees(blocages, branch.id, j, ''), sieges,
    }).heures };
  };

  /* ── EN DIRECT ── */
  const lignes = useMemo(() => {
    const duJour: RdvDuJour[] = rdvs
      .filter((a) => a.date === jour && /^\d{1,2}:\d{2}/.test(a.time ?? ''))
      .map((a) => ({ id: a.id, heureMin: timeToMin(a.time), dureeMin: apptDurationMin(a, byId), maitre: a.master ?? '', status: a.status }));
    const entrees = recettes.filter((r) => r.date === jour);
    const aEnc = aEncaisserMaintenant(rdvs, {
      aujourdhui: jour, maintenantMin: minutes,
      dejaSaPiece: (a) => aDejaSaPiece(a, pieces), duXof: (a) => apptDueXof(a, byId),
    });
    const ouverture = openingForIso(jour);
    const occupes: Occupant[] = rdvs
      .filter((a) => a.date === jour && a.status !== 'annulé' && /^\d{1,2}:\d{2}/.test(a.time ?? ''))
      .map((a) => ({ maitre: a.master, debutMin: timeToMin(a.time), dureeMin: apptDurationMin(a, byId) }));
    const places = ouverture.closed ? [] : placesDuJour({
      iso: jour, aujourdhui: jour, maintenantMin: minutes, ouverture, durationMin: 60,
      occupes, bloques: plagesBloquees(blocages, branch.id, jour, ''), sieges,
    }).heures;
    const depuis = enAttente.map((f) => Date.parse(f.fenetre.depuis ?? f.dernierQuiCompte?.quand ?? '')).filter((t) => Number.isFinite(t));
    return lignesEnDirect({
      jour, minutes,
      encaisseXof: somme(entrees.filter((r) => EST_ACTIVITE[r.kind]).map((r) => r.amountXof)),
      pourboiresXof: somme(entrees.filter((r) => r.kind === 'pourboire').map((r) => r.amountXof)),
      aEncaisser: { n: aEnc.length, xof: somme(aEnc.map((a) => apptDueXof(a, byId))) },
      rdvs: duJour,
      sansReponse: { n: enAttente.length, plusAncienneMin: depuis.length ? Math.max(0, Math.round((tick - Math.min(...depuis)) / 60_000)) : null },
      ferme: ouverture.closed,
      placesLibres: places,
      aConfirmer: rdvs.filter((a) => a.date >= jour && a.status === 'confirmé' && estSuggere(a)).length,
      /* Les avis : ce que la liste dit quand elle est arrivée ; avant, le seul compte des brouillons à relire. */
      avis: {
        recentsSansReponse: lesAvis.filter((a) => estRecent(a, tick) && ['nouveau', 'prepare', 'prete'].includes(etatDeLAvis(a, brouillonsDAvis[a.cle], tick))).length,
        aRelire: lesAvis.length ? lesAvis.filter((a) => etatDeLAvis(a, brouillonsDAvis[a.cle], tick) === 'prete').length : reponsesARelire(brouillonsDAvis),
      },
    });
  }, [rdvs, recettes, pieces, byId, blocages, enAttente, jour, minutes, tick, branch.id, sieges, lesAvis, brouillonsDAvis]);

  /* ── LES LECTURES ── */
  const lis = (l: LectureDemandee, question: string): FaitLu[] => {
    const fait = (titre: string, texte: string, lien?: string): FaitLu => ({ lecture: l.nom, titre, texte: sansCoordonnees(texte), ...(lien ? { lien } : {}) });
    const ligneDuRdv = (a: (typeof rdvs)[number]): string => {
      const etat = a.status === 'confirmé' && estSuggere(a) ? 'suggéré par la Maison, sans réponse d’elle' : a.status;
      return `- ${jourEtDate(a.date)}${a.time ? ` à ${heureDite(a.time)}` : ''} : ${etiquette(a.clientId, a.clientName)}, ${gestesDe(a.serviceIds)}${a.master ? `, avec ${a.master}` : ''}, ${etat}, ${francsPourPerle(apptNetXof(a, byId))}`;
    };

    if (l.nom === 'journee') {
      const j = l.jour ?? jour;
      const entrees = recettes.filter((r) => r.date === j);
      const activite = entrees.filter((r) => EST_ACTIVITE[r.kind]);
      const duJour = rdvs.filter((a) => a.date === j);
      const sorties = depenses.filter((d) => d.date === j);
      const texte = [
        `Argent entré le ${dateDite(j)} : ${francsPourPerle(somme(activite.map((r) => r.amountXof)))} en ${activite.length} versement${activite.length > 1 ? 's' : ''}.`,
        activite.length ? `Par moyen : ${parCle(activite, (r) => r.method, (r) => r.amountXof).map((x) => `${x.k} ${francsPourPerle(x.xof)}`).join(', ')}.` : '',
        `Pourboires, à part : ${francsPourPerle(somme(entrees.filter((r) => r.kind === 'pourboire').map((r) => r.amountXof)))}.`,
        `Dépenses : ${francsPourPerle(somme(sorties.map((d) => d.amountXof)))}${sorties.length ? ` (${sorties.slice(0, 12).map((d) => `${borne(d.label, 50)} ${francsPourPerle(d.amountXof)}`).join(' ; ')})` : ''}.`,
        `Rendez-vous du jour : ${duJour.length}, dont ${duJour.filter((a) => a.status === 'honoré').length} honorés, ${duJour.filter((a) => a.status === 'confirmé').length} confirmés et ${duJour.filter((a) => a.status === 'annulé').length} annulés.`,
      ];
      if (j === jour) {
        const aEnc = aEncaisserMaintenant(rdvs, { aujourdhui: jour, maintenantMin: minutes, dejaSaPiece: (a) => aDejaSaPiece(a, pieces), duXof: (a) => apptDueXof(a, byId) });
        texte.push(aEnc.length
          ? `À encaisser maintenant : ${francsPourPerle(somme(aEnc.map((a) => apptDueXof(a, byId))))} sur ${aEnc.length} rituel${aEnc.length > 1 ? 's' : ''} (${aEnc.map((a) => `${etiquette(a.clientId, a.clientName)} ${francsPourPerle(apptDueXof(a, byId))}`).join(', ')}).`
          : 'Rien à encaisser pour l’instant.');
      }
      return [fait(`La journée du ${dateDite(j)}`, texte.filter(Boolean).join('\n'))];
    }

    if (l.nom === 'rendez_vous') {
      const f = fenetreDesRendezVous(l, jour);
      const liste = rdvs.filter((a) => a.date >= f.du && a.date <= f.au).sort((a, b) => `${a.date} ${a.time ?? ''}`.localeCompare(`${b.date} ${b.time ?? ''}`));
      const titre = f.du === f.au ? `Les rendez-vous du ${jourEtDate(f.du)}` : `Les rendez-vous du ${dateDite(f.du)} au ${dateDite(f.au)}`;
      return [fait(titre, liste.length ? `${liste.length} rendez-vous.\n${liste.slice(0, 60).map(ligneDuRdv).join('\n')}` : 'Aucun rendez-vous sur ces jours.')];
    }

    if (l.nom === 'places_libres') {
      const j = l.jour ?? jour;
      const { ferme, heures } = placesDu(j);
      if (ferme) return [fait(`Les places du ${jourEtDate(j)}`, `La Maison est fermée le ${jourEtDate(j)}.`)];
      return [fait(`Les places du ${jourEtDate(j)}`, heures.length
        ? `Heures libres pour un rituel d’une heure : ${heures.map((h) => heureDite(h)).join(', ')}. Un rituel plus long a moins de places.`
        : (j < jour ? 'Ce jour est passé.' : 'Aucune heure libre pour un rituel d’une heure.'))];
    }

    if (l.nom === 'cliente') {
      const parLeNom = l.cliente ? clientesDuNom(l.cliente, clients) : [];
      const parLaQuestion = clientesDeLaQuestion(question, clients);
      const trouvees = [...new Map([...parLaQuestion, ...parLeNom].map((c) => [c.id, c])).values()].slice(0, 3);
      if (!trouvees.length) return [fait('La cliente', 'Aucune fiche ne porte ce nom dans la Maison.')];
      const abosDeLaBranche = abonnes.filter((a) => a.branchId === branch.id);
      const nomDeLaFormule = (id: string) => formules.find((p) => p.id === id)?.name ?? 'formule';
      return trouvees.map((c) => {
        const f = ficheDuClassement(c, rdvs, abosDeLaBranche, nomDeLaFormule, jour);
        const r = classeLaCliente(f, classement.criteres, classement.categories, jour);
        const etape = ETAPES.find((e) => e.cle === r.etape)?.nom ?? classement.categories.find((k) => k.id === r.etape)?.nom ?? r.etape;
        const siens = rdvs.filter((a) => a.clientId === c.id);
        const venues = siens.filter((a) => a.status === 'honoré').sort((a, b) => b.date.localeCompare(a.date));
        const prochain = siens.filter((a) => (a.status === 'confirmé' || a.status === 'en attente') && a.date >= jour).sort((a, b) => `${a.date} ${a.time ?? ''}`.localeCompare(`${b.date} ${b.time ?? ''}`))[0];
        const dues = pieces.filter((i) => i.clientId === c.id && i.kind === 'facture' && invoiceResteXof(i) > 0);
        const formule = f.abonnements.find((a) => (a.statut === 'active' || a.statut === 'new' || a.statut === 'risk') && (!a.fin || a.fin >= jour));
        const nom = prenomDeLaFiche(c.name);
        const texte = [
          `${nom}${c.city ? `, ${c.city}` : ''}. Étape au classement : ${etape}.`,
          `Venues honorées : ${f.visites}${f.premiere ? `, la première le ${dateDite(f.premiere)}` : ''}.`,
          f.derniere ? `Dernière venue : le ${dateDite(f.derniere)}, il y a ${joursEntre(f.derniere, jour)} jours.` : 'Elle n’est jamais venue.',
          r.rythmeJours ? `Son rythme : une venue tous les ${r.rythmeJours} jours environ.` : 'Son rythme ne se lit pas encore.',
          prochain ? `Prochain rendez-vous : ${jourEtDate(prochain.date)}${prochain.time ? ` à ${heureDite(prochain.time)}` : ''}, ${gestesDe(prochain.serviceIds)}${prochain.master ? `, avec ${prochain.master}` : ''}${estSuggere(prochain) ? ' (suggéré par la Maison, sans réponse d’elle)' : ''}.` : 'Elle n’a aucun rendez-vous à venir.',
          dues.length ? `Elle doit ${francsPourPerle(somme(dues.map((i) => invoiceResteXof(i))))} sur ${dues.length} facture${dues.length > 1 ? 's' : ''}.` : 'Elle ne doit rien.',
          formule ? `Formule en cours : ${formule.formule}${formule.fin ? `, jusqu’au ${dateDite(formule.fin)}` : ''}.` : '',
          venues.length ? `Ses dernières venues :\n${venues.slice(0, 5).map((a) => `- ${dateDite(a.date)} : ${gestesDe(a.serviceIds)}${a.master ? `, avec ${a.master}` : ''}, ${francsPourPerle(apptNetXof(a, byId))}`).join('\n')}` : '',
        ].filter(Boolean).join('\n');
        return fait(`La fiche de ${nom}`, pourClaude(texte, personnesDe(c.name)), `/customers?id=${c.id}`);
      });
    }

    if (l.nom === 'impayes') {
      const dues = pieces.filter((i) => i.kind === 'facture' && invoiceResteXof(i) > 0).sort((a, b) => invoiceResteXof(b) - invoiceResteXof(a));
      return [fait('Les factures qui doivent encore', dues.length
        ? `${dues.length} factures doivent encore ${francsPourPerle(somme(dues.map((i) => invoiceResteXof(i))))}.\n${dues.slice(0, 40).map((i) => `- ${etiquette(i.clientId, i.clientName)} : ${francsPourPerle(invoiceResteXof(i))} (facture du ${dateDite(i.date)})`).join('\n')}`
        : 'Aucune facture ne doit d’argent.')];
    }

    if (l.nom === 'mois') {
      const mois = l.mois ?? jour.slice(0, 7);
      const avant = moisDAvant(mois);
      const duMois = recettes.filter((r) => r.date.slice(0, 7) === mois);
      const activite = duMois.filter((r) => EST_ACTIVITE[r.kind]);
      const dAvant = recettes.filter((r) => r.date.slice(0, 7) === avant && EST_ACTIVITE[r.kind]);
      const enCours = mois === jour.slice(0, 7);
      /* Le mois en cours se compare au même jour du mois d'avant, sinon il paraît toujours en retard. */
      const jusquAu = `${avant}-${jour.slice(8, 10)}`;
      const sorties = depenses.filter((d) => d.date.slice(0, 7) === mois);
      const texte = [
        `Mois ${mois}${enCours ? `, au ${dateDite(jour)}` : ''}. Argent entré : ${francsPourPerle(somme(activite.map((r) => r.amountXof)))}.`,
        activite.length ? `Par nature : ${parCle(activite, (r) => receiptKindLabel(r.kind), (r) => r.amountXof).map((x) => `${x.k} ${francsPourPerle(x.xof)}`).join(', ')}.` : '',
        activite.length ? `Par moyen : ${parCle(activite, (r) => r.method, (r) => r.amountXof).map((x) => `${x.k} ${francsPourPerle(x.xof)}`).join(', ')}.` : '',
        `Pourboires, à part : ${francsPourPerle(somme(duMois.filter((r) => r.kind === 'pourboire').map((r) => r.amountXof)))}.`,
        `Le mois d’avant (${avant}), entier : ${francsPourPerle(somme(dAvant.map((r) => r.amountXof)))}.${enCours ? ` Au même jour du mois d’avant : ${francsPourPerle(somme(dAvant.filter((r) => r.date <= jusquAu).map((r) => r.amountXof)))}.` : ''}`,
        `Dépenses du mois : ${francsPourPerle(somme(sorties.map((d) => d.amountXof)))}${sorties.length ? ` (${parCle(sorties, (d) => d.category, (d) => d.amountXof).slice(0, 10).map((x) => `${x.k} ${francsPourPerle(x.xof)}`).join(', ')})` : ''}.`,
        `Rituels honorés : ${rdvs.filter((a) => a.status === 'honoré' && a.date.slice(0, 7) === mois).length}. Nouvelles fiches : ${clients.filter((c) => String(c.since ?? '').slice(0, 7) === mois).length}.`,
        enCours ? `Le mois se termine le ${dateDite(dernierJourDuMois(mois))}.` : '',
      ].filter(Boolean).join('\n');
      return [fait(`Le mois ${mois}`, texte)];
    }

    if (l.nom === 'conversations') {
      if (!enAttente.length) return [fait('Les conversations qui attendent', 'Aucune conversation n’attend de réponse, fenêtre ouverte.')];
      const lignesDesFils = enAttente.slice(0, 15).map((f) => {
        const c = f.clientId ? ficheParId.get(f.clientId) : undefined;
        const qui = c ? prenomDeLaFiche(c.name) : (/\d{6,}/.test(f.nom) ? 'Un numéro sans fiche' : prenomDeLaFiche(f.nom));
        const depuis = Date.parse(f.fenetre.depuis ?? f.dernierQuiCompte?.quand ?? '');
        const attend = Number.isFinite(depuis) ? `attend depuis ${dureeDite((tick - depuis) / 60_000)}` : 'attend';
        const mot = borne(String(f.dernierQuiCompte?.texte ?? '').replace(/\s+/g, ' ').trim(), 220);
        return `- ${qui} : ${attend}, la fenêtre de 24 heures se ferme dans ${dureeDite(f.fenetre.resteMs / 60_000)}. Son dernier message : « ${pourClaude(mot, [...(c ? personnesDe(c.name) : []), ...pleinsNoms])} »`;
      });
      return [fait('Les conversations qui attendent', `${enAttente.length} conversation${enAttente.length > 1 ? 's' : ''} attend${enAttente.length > 1 ? 'ent' : ''} une réponse de la Maison.\n${lignesDesFils.join('\n')}`)];
    }

    if (l.nom === 'abonnements') {
      const vives = abonnes.filter((a) => a.branchId === branch.id && (a.status === 'active' || a.status === 'new' || a.status === 'risk'));
      return [fait('Les formules en cours', vives.length
        ? `${vives.length} formules en cours.\n${vives.slice(0, 40).map((a) => `- ${etiquette(a.clientId, a.name)} : ${formules.find((p) => p.id === a.planId)?.name ?? 'formule'}${a.nextIso ? `, prochaine échéance le ${dateDite(a.nextIso)}` : ''}${a.status === 'risk' ? ', à surveiller' : ''}`).join('\n')}`
        : 'Aucune formule en cours.')];
    }

    if (l.nom === 'prestations') {
      const sansAccent = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('fr');
      const terme = l.terme ? sansAccent(l.terme) : '';
      const liste = services.filter((s) => !s.archived && (!terme || sansAccent(s.name).includes(terme))).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
      return [fait('Le catalogue', liste.length
        ? `${liste.length} prestations${terme ? ` pour « ${l.terme} »` : ''}.\n${liste.slice(0, 60).map((s) => `- ${s.name} : ${francsPourPerle(s.priceXof)}, ${dureeDite(s.durationMin)}`).join('\n')}`
        : `Aucune prestation du catalogue ne porte « ${l.terme ?? ''} » dans son nom.`)];
    }

    if (l.nom === 'avis') {
      if (!lesAvis.length) return [fait('Les avis Google', 'Les avis Google ne sont pas arrivés sur ce poste (le serveur n’a pas répondu). Ouvrez Les avis Google.')];
      const dix = noteDesDixDerniers(lesAvis);
      const attendent = lesAvis.filter((a) => ['nouveau', 'prepare', 'prete'].includes(etatDe(a)));
      const aMontrer = lesAvis.filter((a) => estRecent(a, tick) || attendent.includes(a)).slice(0, 25);
      const decimale = (n: number) => String(n).replace('.', ',');
      const ligne = (a: (typeof lesAvis)[number]): string => {
        const mots = a.texte ? `« ${borne(a.texte.replace(/\s+/g, ' ').trim(), 240)} »` : 'une note, sans texte';
        return `- ${a.publieLe ? dateDite(a.publieLe) : (a.quand ?? 'date inconnue')}, ${etoilesDites(a.note)}, ${prenomDeLAuteur(a.auteur) || 'sans nom'} : ${pourClaude(mots, pleinsNoms)} (${ETAT_DE_L_AVIS_DIT[etatDe(a)]})`;
      };
      const texte = [
        releveDesAvis ? `La fiche Google de la Maison : ${decimale(releveDesAvis.note)} sur 5, sur ${releveDesAvis.nombre} avis.` : '',
        dix.note !== null ? `Les ${dix.n} derniers avis notés : ${decimale(dix.note)} sur 5.` : '',
        `Avis connus du Trône : ${lesAvis.length}. ${attendent.length} attend${attendent.length > 1 ? 'ent' : ''} une réponse, dont ${attendent.filter((a) => etatDe(a) === 'prete').length} avec une réponse prête à relire.`,
        aMontrer.length ? `Les avis des trente derniers jours et ceux qui attendent, du plus récent au plus ancien :\n${aMontrer.map(ligne).join('\n')}` : 'Aucun avis dans les trente derniers jours, et aucun n’attend de réponse.',
      ].filter(Boolean).join('\n');
      return [fait('Les avis Google', texte)];
    }

    /* depenses */
    const f = fenetreDesDepenses(l, jour);
    const liste = depenses.filter((d) => d.date >= f.du && d.date <= f.au).sort((a, b) => b.date.localeCompare(a.date));
    return [fait(`Les dépenses du ${dateDite(f.du)} au ${dateDite(f.au)}`, liste.length
      ? `${liste.length} dépenses, ${francsPourPerle(somme(liste.map((d) => d.amountXof)))} au total.\nPar catégorie : ${parCle(liste, (d) => d.category, (d) => d.amountXof).map((x) => `${x.k} ${francsPourPerle(x.xof)}`).join(', ')}.\n${liste.slice(0, 60).map((d) => `- ${dateDite(d.date)} : ${borne(d.label, 60)}, ${francsPourPerle(d.amountXof)} (${d.category})`).join('\n')}`
      : 'Aucune dépense sur ces jours.')];
  };

  const pourElle = (texte: string): string => {
    /* Une cliente nommée par son seul nom de famille (« Mme Kossou ») : il devient son initiale. */
    const nommees = clientesDeLaQuestion(texte, clients).flatMap((c) => personnesDe(c.name));
    return pourClaude(texte, [...nommees, ...pleinsNoms]);
  };
  return {
    jour, minutes, lignes,
    enDirectTexte: enDirectEnTexte(lignes),
    lis,
    pourClaude: pourElle,
    /* INTERNET (21 novembre 2026) : d'abord comme pour Claude (noms en prénom et
       initiale, numéros retirés), puis chaque « Awa K. » de la Maison devient
       « une cliente » : rien d'une cliente ne part vers un moteur de recherche. */
    pourInternet: (texte: string) => sansLesClientes(pourElle(texte), clients.map((c) => prenomDeLaFiche(c.name))),

    /* PRÉPARER UNE RÉPONSE (second lot, 21 novembre 2026). Le Trône retrouve la
       cliente sur le vrai texte de la question et sur le nom rendu par le plan
       (`clientesDuMessage`), puis son fil ; un fil privé ou hors des clientes
       ne se prépare pas (`filDeLaDemande`, la règle de `filOuvertAClaude`). */
    enAttente,
    filDe: (demande, question, dejaPrepares) => filDeLaDemande({
      demande,
      trouvees: clientesDuMessage(demande.cliente, question, clients).map((c) => ({ id: c.id, etiquette: prenomDeLaFiche(c.name) })),
      fils: tousLesFils, enAttente, dejaPrepares,
    }),
    filDuNumero: (numero) => tousLesFils.find((f) => f.numero === numero),
    quiEst: (f) => {
      const c = f.clientId ? ficheParId.get(f.clientId) : undefined;
      return c ? prenomDeLaFiche(c.name) : (/\d{6,}/.test(f.nom) ? 'un numéro sans fiche' : prenomDeLaFiche(f.nom));
    },
    placeAuCarnet: (j, heure) => {
      if (!j || !heure) return null;
      const { ferme, heures } = placesDu(j);
      return verdictDeLaPlace({ jour: j, heure, aujourdhui: jour, maintenantMin: minutes, ferme, heuresLibres: heures });
    },
    contexteDuFil: (f, o = {}) => contexteDe(f, { ...o, aujourdhui: jour }),

    /* LES AVIS GOOGLE (second lot). L'avis se retrouve par le nom que Google
       affiche ; le brouillon s'écrit par le geste de l'écran des avis
       (`proposeUneReponse`) et se range dans SON document : Perle ne publie,
       n'écarte ni ne colle rien. */
    avisDe: (demande, question, dejaMontres) => avisDeLaDemande({
      demande,
      trouves: clientesDuMessage(demande.auteur, question, lesAvis.filter((a) => a.auteur.trim()).map((a) => ({ id: a.cle, name: a.auteur }))).map((x) => x.id),
      avis: lesAvis.map((a) => ({ cle: a.cle, auteur: a.auteur, etat: etatDe(a) })),
      dejaMontres,
    }),
    avisDeLaCle: (cle) => {
      const a = lesAvis.find((x) => x.cle === cle);
      if (!a) return undefined;
      /* Le brouillon se relit dans le magasin À L'INSTANT : il vient d'y être rangé. */
      const b = brouillonsDAvisStore.get()[cle];
      return {
        cle, auteur: a.auteur.trim(), note: a.note, texte: borne(a.texte.replace(/\s+/g, ' ').trim(), 600), etat: etatDeLAvis(a, b, tick),
        ...(a.publieLe ? { jour: a.publieLe.slice(0, 10) } : {}),
        ...(b?.reponse ? { brouillon: b.reponse } : {}),
        ...(typeof a.reponse === 'string' && a.reponse.trim() ? { publiee: a.reponse } : {}),
      };
    },
    proposeAuxAvis: async (cle) => {
      const a = lesAvis.find((x) => x.cle === cle);
      return a ? proposeUneReponse(a) : { ok: false, erreur: 'introuvable', message: 'Cet avis n’est plus dans la liste : ouvrez Les avis Google.' };
    },
    avisAPreparer: (dejaMontres) => lesAvis.filter((a) => etatDe(a) === 'nouveau' && !dejaMontres.includes(a.cle)).length,
  };
}
