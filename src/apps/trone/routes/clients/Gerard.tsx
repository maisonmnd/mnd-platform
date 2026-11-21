import { Fragment, useEffect, useMemo, useState, type KeyboardEvent, type SyntheticEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { useStaff, type Staff } from '../../../../shared/auth';
import { DEVISE_COMPLETE } from '../../../../shared/identite';
import { CIVILITES, appelDe, estMuette, ficheAvecCivilite, prenomDUsage, type Civilite } from '../../../../shared/civilite';
import { clientsStore, useFamilies, type Client } from '../../../../shared/clients';
import {
  automatesDesFils, cheminDeLaConversation, estArchive, filsDeLaMaison, lienWaMe, tetesDeLaMaison,
  useFilsArchives, useFilsAutomate, useFilsPrives, useMessagesWa,
} from '../../../../shared/conversations';
import { reglageDeLAutomate } from '../../../../shared/automate-wa';
import { canalDit, envoisDeLaPeriode } from '../../../../shared/envois';
import { reglesDepuis } from '../../../../shared/salle-des-envois';
import { useSignalements } from '../../../../shared/entre-deux';
import { useDemandes } from '../../../../shared/demandes';
import { useAppelsWa } from '../../../../shared/appels-wa';
import { useAppels } from '../../../../shared/appels';
import { seancesSansBilan, useBilans } from '../../../../shared/bilans';
import { reponsesARelire } from '../../../../shared/avis-rubrique-pur';
import { useBrouillonsDAvis } from '../../../../shared/ia-avis';
import { francs as enFrancs } from '../../../../shared/ia-faits-pur';
import {
  ENVIE_DITE, GENRE_DIT, MODELES_DE_GERARD, REMISE_ANNIV_PCT, REMISE_CREUX_PCT, REPONSE_FRANCHE, SIGNATURE,
  filDeLaCliente, heureDite, idDeLaLigne, jourDit, ligneALaMain, partSeule, planDuJour, servie,
  anniversairesDuJour, ETAT_DE_L_ANNIVERSAIRE_DIT, IMAGE_DE_LA_CARTE,
  type FicheDeGerard, type Situation,
} from '../../../../shared/gerard-pur';
import { changeLePlafond, estActif, jamaisPourElle, metEnPause, reglagesLus, useReglagesDeGerard, type ReglagesDeGerard } from '../../../../shared/gerard';
import { FICHES_DES_MODELES_DE_L_ABONNEE } from '../../../../shared/messages-de-l-abonnee-pur';
import {
  GENRE_D_ATTENTE_DIT, attendUnHumain, detailDuParti, fourchetteDite, francsEnJeu, fusionnePlanEtSalle, partiAujourdhui, porteeParCanal, tuilesDuJour,
  type EnvoiDuJour, type FrancsEnJeu, type LigneDuJour,
} from '../../../../shared/assistant-aujourdhui-pur';
import { CLE_DU_SERVEUR, serveurVivant, type EtatDuServeur } from '../../../../shared/assistant-passage-pur';
import { cleDuFilRange, estRangee } from '../../../../shared/boite-unique-pur';
import { useRiensARepondre } from '../../../../shared/rien-a-repondre';
import { supabase } from '../../../../shared/supabase';
import type { Appointment } from '../../../../shared/agenda';
import { envoisStore, useAutoConfig, useEnvois } from '../equipe/data';
import { fabriqueLeCodeDe, useCerveauDeGerard, useLePassageDeGerard, type CerveauDeGerard } from './gerard-donnees';
import { gesteDeLaSalle } from './SalleDesEnvois';
import { porteDuMaintenant } from '../../../../shared/envoyer-maintenant-pur';
import { envoieLaLigneMaintenant } from './envoyer-maintenant';
import { RdvModal, apptLabel, apptTotalXof, frShort, tarifDeLaTeteXof, useBranchAppointmentsAvecEssais, useBranchClients, useServicesById } from './_shared';
import { etatDuReport } from '../../../../shared/a-reprogrammer-pur';
import { etatDuReportDit, rdvsAReprogrammer } from './a-reprogrammer';
import { PageHead } from '../_ui';
import { GerardEntreDeux } from './GerardEntreDeux';
import { useConversationsSupprimees } from '../../../../shared/conversations-supprimees';
import { settingsStore, useSettings } from '../../../../shared/settings';
import { repondsAuMatin, useEquipeDuMatin } from '../../../../shared/equipe-du-matin';
import {
  HEURES_PLUS_TARD, INSTALLATION_MIN, RIEN_AVANT_MIN, estOuverte, heureDuMatin, jourDeCotonou, laPropositionDe, minuteDeCotonou,
  appelDuDestinataire, nomsDits, reglagesDuMatin, type ReglagesDeLEquipeDuMatin,
} from '../../../../shared/equipe-du-matin-pur';
import { useStaff as useFichesDeLEquipe } from '../equipe/data';
import LesConversations from './LesConversations';
import LesAvis from './LesAvis';
import OffresEtRemises from './OffresEtRemises';
import CeQueCaRapporte from './CeQueCaRapporte';
import { CarteModal } from './CarteModal';
import { FenetreDesCivilites } from './FenetreDesCivilites';
import './gerard.css';
import './assistant-maison.css';

/* ══ L'ASSISTANT MAISON, LA RUBRIQUE · 26 octobre 2026, lot 1 ; lot 3 le 27 ══
   Maquette 4bPVFik1ABh3TRFZ5XbHiG, « construis » : le cerveau
   (`shared/gerard-pur.ts`) et sa rubrique. Chaque matin, une chose au plus
   par cliente : garder son RDV, son anniversaire, tout combiner, une envie
   du fil, un jour creux, Noël, ou une relance.

   MAQUETTE V4 (« construis », 26 octobre 2026) : un seul interrupteur, Pause
   ou Actif ; le plafond de la semaine compte toutes les remises à son nom,
   en nombre et en francs ; les modèles passent de quatorze à sept plus un.

   LOT 3 (27 octobre 2026, `docs/spec-assistant-maison.md` §5, maquette
   `public/maquette-assistant-maison.html`) : la rubrique devient CINQ VUES
   sous une barre collante (`?vue=aujourdhui | conversations | avis | offres |
   rapporte`). La vue Aujourd'hui vit ici : cinq tuiles, la liste « Part
   aujourd'hui » (le plan fusionné avec la salle d'attente par l'identifiant
   déterministe de la ligne, `assistant-aujourdhui-pur`), « Attend un oui »
   en cartes, « Attend un humain » en liste, ce qui est parti, les jours
   creux, puis les réglages de la direction. Les quatre autres vues reçoivent
   le cerveau en props : il ne se charge qu'une fois par écran.

   IL COMMENCE LE 26 OCTOBRE 2026 AU SOIR (« on commence immédiatement ») :
   le passage du jour (`gerard-donnees.ts`) dépose les notifications Ma
   Couronne en salle d'attente ; les lignes WhatsApp ont leur bouton, un
   toucher par cliente, jusqu'à l'approbation de ses modèles chez Meta.
   Claude lira les réponses plus tard.

   LOT 2 (27 octobre 2026, `assistant-passage-pur.ts`) : le passage du matin
   est celui de la fonction serveur `assistant-maison` (le Trône ne reprend
   que si elle se tait depuis 26 h, `serveurVivant`) ; un modèle approuvé chez
   Meta part seul (`partSeule`), sa ligne `-whatsapp` vit en salle, et son
   bouton se tait pour ne pas partir deux fois. La remise à son nom naît au
   départ réel : la colonne Code du journal le dit. */

const MODES: { pause: boolean; titre: string; dit: string }[] = [
  { pause: true, titre: 'Pause', dit: 'Il prépare son plan, il n’écrit à personne.' },
  { pause: false, titre: 'Actif', dit: 'Il écrit chaque jour, sous ses règles et son plafond.' },
];
const francsDits = (n: number) => `${n.toLocaleString('fr-FR')} F`;

/** Le pied de page des modèles : la devise seule (règle du 13 octobre 2026). */
const piedDeGerard = DEVISE_COMPLETE;
const canalDuPlan = (c: Situation['canal']) => (c === 'couronne' ? 'Ma Couronne' : 'WhatsApp');
const codeDit = (s: Situation) => (s.code ? `−${s.code.pct} % · ${s.code.mot === 'CREUX' ? 'jour creux' : 'anniversaire'}` : '');

/* ── LES SIX VUES ───────────────────────────────────────────────────────────
   21 novembre 2026 (« je me perds et n'y comprends rien », Yéman) : des noms
   courts, et une sixième vue, « Réglages », qui reprend tout ce qui se règle
   (Pause ou Actif, le plafond, les jours creux, les règles, les modèles). */
type Vue = 'aujourdhui' | 'conversations' | 'avis' | 'offres' | 'rapporte' | 'reglages';
const VUES: readonly { cle: Vue; titre: string }[] = [
  { cle: 'aujourdhui', titre: 'Aujourd’hui' },
  { cle: 'conversations', titre: 'Conversations' },
  { cle: 'avis', titre: 'Avis' },
  { cle: 'offres', titre: 'Offres' },
  { cle: 'rapporte', titre: 'Résultats' },
  { cle: 'reglages', titre: 'Réglages' },
];
const vueLue = (x: string | null): Vue => (VUES.some((v) => v.cle === x) ? (x as Vue) : 'aujourdhui');
/** Le titre de la page, vue par vue (les vues en pleine page ont leur propre tête). */
const TITRE_DE_LA_VUE: Partial<Record<Vue, string>> = { aujourdhui: 'Aujourd’hui.', rapporte: 'Résultats.', reglages: 'Réglages de Perle.' };
/** Les replis des Réglages (Entre deux séances, Ses règles, Modèles WhatsApp) : un seul ouvert à la fois. */
type Repli = 'entre-deux' | 'regles' | 'modeles' | 'matin';
/** Les lignes montrées d'abord dans « Perle écrit aujourd'hui » ; le reste se déplie. */
const LIGNES_VUES = 5;
/** LE DÉPART D'UNE LIGNE, EN DEUX MOTS : la colonne de droite de la liste. La
    phrase entière (`LigneDuJour.depart`) reste dans le panneau ouvert. */
const DEPART_COURT: Partial<Record<LigneDuJour['etat'], string>> = { 'pas-encore': 'Part seul', 'en-pause': 'En pause', retenue: 'Retenue', 'a-son-toucher': 'À envoyer' };
const departCourt = (l: LigneDuJour): string => {
  const dit = DEPART_COURT[l.etat] ?? (l.depart === 'part seul au passage du matin' ? 'Part seul' : l.depart);
  return dit ? dit[0].toUpperCase() + dit.slice(1) : '';
};

/** Ce que chaque vue reçoit : le cerveau (lourd, lu une fois), les réglages lus, la personne au clavier. */
export type PropsDUneVue = { cerveau: CerveauDeGerard; reglages: ReglagesDeGerard; moi: Staff | null };

/** « M. D. » → « MD » : l'avatar à initiales de la maquette. */
const initiales = (nom: string): string => nom.split(/\s+/).filter(Boolean).map((m) => m[0]).join('').slice(0, 2).toUpperCase() || '·';
const chiffresSeuls = (t: string | undefined): string => (t ?? '').replace(/\D/g, '');
/** `tel:` depuis un numéro de fiche (+229 01 51 …) ou un numéro réduit (22901…). */
const lienTel = (brut: string | undefined): string | null => { const d = chiffresSeuls(brut); return d ? `tel:+${d}` : null; };
/** La puce « Par où » du journal du jour : Ma Couronne (indigo), WhatsApp parti
    seul (cuivre), WhatsApp à un toucher (`CANAL_DIT['wa-main']`). `CANAL_DIT`
    (envois.ts) ne dit que « WhatsApp » pour le canal `whatsapp`, tous types ;
    ici, une ligne de ce canal est toujours partie seule, par une fonction,
    jamais par une main (la main, c'est `wa-main`). */
const puceDuCanal = (canal: string): { dit: string; ton: 'indigo' | 'cuivre' } =>
  (canal === 'push' ? { dit: 'Ma Couronne', ton: 'indigo' } : canal === 'whatsapp' ? { dit: 'WhatsApp, parti seul', ton: 'cuivre' } : { dit: canalDit(canal), ton: 'cuivre' });

type GesteDeLaLigne = 'retenir' | 'relacher' | 'envoyer' | 'ecarter';
const VERDICT_DIT: Record<GesteDeLaLigne, string> = {
  retenir: 'Retenue : elle ne part plus tant qu’une main ne la relâche pas.',
  relacher: 'Relâchée : elle repart à l’heure de la salle.',
  envoyer: 'Envoyée : elle part à l’instant, sans attendre l’heure de la salle.',
  ecarter: 'Écartée : elle ne partira pas.',
};
const TON_DE_L_ATTENTE: Record<string, string> = { sante: 'terre', 'a-voir': 'cuivre', 'question-franche': 'cuivre', whatsapp: 'cuivre', site: 'indigo', 'appel-wa': 'cuivre', appel: 'indigo' };

/** UN DOCUMENT LU DIRECTEMENT, sans magasin (comme Ce que ça rapporte) : le
    signe de vie de la fonction serveur du passage du matin, relu chaque
    minute. `undefined` : pas encore lu ; `null` : absent, ou pas de serveur. */
function useDocumentLu<T>(cle: string, toutesLesMs?: number): T | null | undefined {
  const [doc, setDoc] = useState<T | null | undefined>(undefined);
  useEffect(() => {
    const sb = supabase;
    if (!sb) { setDoc(null); return undefined; }
    let vivant = true;
    const lis = async () => {
      const { data, error } = await sb.from('documents').select('data').eq('key', cle).maybeSingle();
      if (!vivant) return;
      setDoc(error ? null : ((data?.data ?? null) as T | null));
    };
    void lis();
    if (!toutesLesMs) return () => { vivant = false; };
    const t = window.setInterval(() => { void lis(); }, toutesLesMs);
    return () => { vivant = false; window.clearInterval(t); };
  }, [cle, toutesLesMs]);
  return doc;
}

/** Le fil d'une cliente, en ruban : ce que le Trône écrit déjà, ce que Gérard ajoute. */
export function LeFil({ fiche, aujourdhui }: { fiche: FicheDeGerard; aujourdhui: string }) {
  const points = filDeLaCliente(fiche, aujourdhui);
  if (points.length === 0) return <p className="trc-ger__doux">Pas de fil : il faut une dernière venue et une date de cadence.</p>;
  const fin = points[points.length - 1].jour || 1;
  return (
    <div className="trc-ger__ruban" role="img" aria-label="Son fil, de sa dernière venue à sa date de cadence">
      <div className="trc-ger__piste">
        <div className="trc-ger__trait" />
        {points.map((p, i) => (
          <div key={`${p.iso}-${i}`} className={`trc-ger__noeud${p.existant ? ' est-existant' : ' est-gerard'}${p.iso === aujourdhui ? ' est-aujourdhui' : ''}${i % 3 === 1 ? ' en-haut' : i % 3 === 2 ? ' en-bas' : ''}`}
            style={{ left: `${10 + 80 * p.jour / fin}%` }}>
            <i />
            <small><b>{p.quoi}</b>{jourDit(p.iso).replace(/^\S+ /, '')}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Gerard() {
  const { branch } = useBranch();
  const moi = useStaff();
  const direction = moi?.role === 'souverain' || moi?.role === 'gerant';
  const [brut] = useReglagesDeGerard();
  /* Lus une fois par réglage : la fusion du plan les lit (`partSeule`), elle ne doit pas se refaire à chaque rendu. */
  const reglages = useMemo(() => reglagesLus(brut), [brut]);
  const cerveau = useCerveauDeGerard();
  const { fiches, ctx, nomDe } = cerveau;
  const plan = useMemo(() => planDuJour(fiches, ctx), [fiches, ctx]);
  useLePassageDeGerard(cerveau, plan);
  const [envois] = useEnvois();
  const [params, setParams] = useSearchParams();
  const vue = vueLue(params.get('vue'));
  /* Ce que la vue Aujourd'hui lit autour du plan : les RDV (les francs en
     jeu), les fils (le juge WhatsApp), les soucis, les demandes, les appels,
     les bilans, les brouillons d'avis, et la salle. */
  const appts = useBranchAppointmentsAvecEssais();
  const clients = useBranchClients();
  const byId = useServicesById();
  const [cfg] = useAutoConfig();
  const [messages] = useMessagesWa();
  const [prives] = useFilsPrives();
  const [archives] = useFilsArchives();
  /* Une discussion supprimée (18 novembre 2026) n'attend plus personne, jusqu'à son prochain message. */
  const [supprimees] = useConversationsSupprimees();
  const [riens] = useRiensARepondre();
  const [lignesDeLAutomate] = useFilsAutomate();
  const signalementsTous = useSignalements();
  const [demandes] = useDemandes();
  const [appelsWa] = useAppelsWa();
  const [appels] = useAppels();
  const [bilans] = useBilans();
  const [brouillons] = useBrouillonsDAvis();
  /* Le passage du matin : la fonction serveur `assistant-maison` dit qu'elle vit dans
     `mnd_assistant_serveur` (lot 2) ; muette depuis 26 h, le Trône reprend le passage. */
  const etatServeur = useDocumentLu<EtatDuServeur>(CLE_DU_SERVEUR, 60_000);
  /* L'horloge bat : « part dans 8 min » et « depuis 26 h » se relisent chaque minute. */
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setTick(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [copie, setCopie] = useState<string | null>(null);
  const [rdvPour, setRdvPour] = useState<string | null>(null);
  /* À REPROGRAMMER (19 novembre 2026) : le rendez-vous qu'on rouvre pour reposer sa date. */
  const [aReposer, setAReposer] = useState<Appointment | null>(null);
  /* LA CARTE D'ANNIVERSAIRE, à un toucher : la fenêtre « Sa carte », au numéro du plan. */
  const [carteDe, setCarteDe] = useState<Situation | null>(null);
  /* Un verdict par ligne touchée (« Tout laisser partir » en rend plusieurs d'un coup). */
  const [verdicts, setVerdicts] = useState<Record<string, string>>({});
  const [repli, setRepli] = useState<Repli | null>(null);
  /* AUJOURD'HUI, REFAIT (21 novembre 2026) : la liste de celles qui attendent une personne, et celle des
     rendez-vous à reprogrammer, ne s'ouvrent qu'à la demande, sous leur carte ; la liste du jour montre
     cinq lignes, le reste se déplie. */
  const [tiroir, setTiroir] = useState<'repondre' | 'reprogrammer' | null>(null);
  const [toutVoir, setToutVoir] = useState(false);
  /* LES CIVILITÉS (28 octobre 2026, « dire Mr ou Mme avant le prénom ») : les
     fiches qu'un message peut joindre et qui ne disent rien, et leur fenêtre. */
  const [civilites, setCivilites] = useState(false);
  const muettes = useMemo(() => clients.filter((c) => estMuette(c) && !!c.phone?.trim()).length, [clients]);
  const poseLaCivilite = (c: Client, civ: Civilite) => {
    clientsStore.set((prev) => prev.map((x) => (x.id === c.id ? { ...x, ...ficheAvecCivilite(civ) } : x)));
    toast(`Noté sur sa fiche : le message dit « ${appelDe({ ...c, ...ficheAvecCivilite(civ) })} ».`);
  };
  const actif = estActif(reglages);
  const serveurVit = serveurVivant(etatServeur ?? null, tick);
  const { plafond } = cerveau;
  /* Le plafond se tape puis s'écrit à la sortie du champ. */
  const [nombre, setNombre] = useState(String(reglages.remisesParSemaine));
  const [francs, setFrancs] = useState(String(reglages.plafondFrancs));
  useEffect(() => { setNombre(String(reglages.remisesParSemaine)); }, [reglages.remisesParSemaine]);
  useEffect(() => { setFrancs(String(reglages.plafondFrancs)); }, [reglages.plafondFrancs]);
  const posePlafond = () => {
    /* Un champ vidé ne vaut pas zéro : il garde le plafond d'avant. */
    const lu = (x: string) => { const d = x.replace(/\D/g, ''); return d ? Number(d) : undefined; };
    changeLePlafond({ remisesParSemaine: lu(nombre), plafondFrancs: lu(francs) }, moi?.name ?? 'La direction');
  };

  const regles = useMemo(() => reglesDepuis(cfg), [cfg]);
  const signalements = useMemo(() => signalementsTous.filter((s) => !s.branchId || s.branchId === branch.id), [signalementsTous, branch.id]);
  /* LE JUGE WHATSAPP EST CELUI DES CONVERSATIONS : `filsDeLaMaison` rend
     `Fil.attendUneReponse` ; on le lit, on ne le refait pas. */
  const [familles] = useFamilies();
  const tetes = useMemo(() => tetesDeLaMaison({ clientes: clients, familles }), [clients, familles]);
  const automates = useMemo(() => automatesDesFils(lignesDeLAutomate, reglageDeLAutomate(cfg.automateWa).pauseHeures), [lignesDeLAutomate, cfg.automateWa]);
  /* « Rien à répondre » (Les conversations, 27 octobre 2026) vaut ici aussi :
     un fil rangé ne compte pas dans « attend un humain » jusqu'à son prochain mot. */
  const fils = useMemo(
    () => filsDeLaMaison(messages, tetes, prives, tick, branch.id, automates).filter((f) => f.tiroir === 'clientes' && !estArchive(f, archives) && !estArchive(f, supprimees)
      && !estRangee([cleDuFilRange(f.numero), ...(f.clientId ? [`c:${f.clientId}`] : [])], f.dernierQuiCompte?.quand, riens)),
    [messages, tetes, prives, tick, branch.id, automates, archives, supprimees, riens],
  );
  const humain = useMemo(() => attendUnHumain({
    signalements,
    fils,
    demandes: demandes.filter((d) => d.branchId === branch.id),
    appelsWa: appelsWa.filter((a) => !a.branchId || a.branchId === branch.id),
    appels: appels.filter((a) => a.branchId === branch.id),
    maintenantMs: tick,
    nomDe,
  }), [signalements, fils, demandes, appelsWa, appels, tick, nomDe, branch.id]);
  /* LES FRANCS EN JEU d'une cliente : son RDV posé, sinon son dernier rituel
     honoré, sinon le tarif de sa tête ; le pur arrondit en calibre et
     fourchette. Rien d'inventé : sans aucun des trois, pas de chiffre. */
  const francsDe = useMemo(() => {
    const parCliente = new Map<string, Appointment[]>();
    for (const a of appts) { const l = parCliente.get(a.clientId); if (l) l.push(a); else parCliente.set(a.clientId, [a]); }
    const cache = new Map<string, FrancsEnJeu | null>();
    return (clientId: string): FrancsEnJeu | null => {
      const vu = cache.get(clientId);
      if (vu !== undefined) return vu;
      const siens = parCliente.get(clientId) ?? [];
      const pose = siens.filter((a) => a.date >= ctx.aujourdhui && a.status !== 'annulé' && a.status !== 'honoré').sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time))[0];
      const dernier = siens.filter((a) => a.status === 'honoré').sort((x, y) => x.date.localeCompare(y.date)).pop();
      const f = francsEnJeu({
        rdvPoseXof: pose ? apptTotalXof(pose, byId) : null,
        dernierRituelXof: dernier ? apptTotalXof(dernier, byId) : null,
        tarifDeLaTeteXof: pose ? tarifDeLaTeteXof(pose, byId) ?? null : null,
      });
      cache.set(clientId, f);
      return f;
    };
  }, [appts, byId, ctx.aujourdhui]);
  const envoisLus = envois as unknown as EnvoiDuJour[];
  /* LE PLAN FUSIONNÉ AVEC LA SALLE : chaque situation retrouve sa ligne
     `envois` par `idDeLaLigne`, jamais par « le dernier envoi de la cliente ».
     Un modèle approuvé chez Meta (`partSeule`) attend le passage du matin, pas un toucher. */
  const fusion = useMemo(
    () => fusionnePlanEtSalle({ plan, envois: envoisLus, aujourdhui: ctx.aujourdhui, maintenantMs: tick, actif, francsDe, partSeule: (s) => partSeule(s, reglages) }),
    [plan, envoisLus, ctx.aujourdhui, tick, actif, francsDe, reglages],
  );
  const bilansARemettre = useMemo(() => seancesSansBilan(appts, bilans, ctx.aujourdhui).length, [appts, bilans, ctx.aujourdhui]);
  const aRelire = reponsesARelire(brouillons);
  const tuiles = useMemo(
    () => tuilesDuJour({ fusion, actif, plafond, humain, oui: { bilans: bilansARemettre, avis: aRelire } }),
    [fusion, actif, plafond, humain, bilansARemettre, aRelire],
  );
  /* Ce qui est parti aujourd'hui, tous types, à l'heure de Cotonou (`jourDuSalon`) ; et qui, par rangée. */
  const parti = useMemo(() => partiAujourdhui(envoisLus, tick), [envoisLus, tick]);
  /* LE DÉTAIL D'UNE RANGÉE (28 octobre 2026, « j'ai besoin de tout le détail ») : une seule ouverte à la fois. */
  const [rangeeOuverte, setRangeeOuverte] = useState<string | null>(null);
  const detailOuvert = useMemo(() => (rangeeOuverte ? detailDuParti(envoisLus, rangeeOuverte, tick) : []), [envoisLus, rangeeOuverte, tick]);
  const clientesDuParti = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const e of envoisDeLaPeriode(envoisLus, 'aujourdhui', parti.jour)) {
      const cle = `${e.type}|${e.canal}`;
      const nom = (e.clientId ? nomDe(e.clientId) : '') || e.prenom || '';
      if (!nom) continue;
      const l = m.get(cle);
      if (l) { if (!l.includes(nom)) l.push(nom); } else m.set(cle, [nom]);
    }
    return m;
  }, [envoisLus, parti.jour, nomDe]);
  const portee = useMemo(() => porteeParCanal(fiches), [fiches]);
  const ficheDe = useMemo(() => new Map(fiches.map((f) => [f.id, f])), [fiches]);
  /* LES ANNIVERSAIRES DU JOUR, tous reconnus (27 octobre 2026) : ceux dont la carte part, et pourquoi les autres se taisent. */
  const anniversaires = useMemo(() => anniversairesDuJour(fiches, ctx), [fiches, ctx]);
  const annivTus = anniversaires.filter((a) => a.etat !== 'carte');
  const garder = plan.filter((s) => s.genre === 'garder').length;
  const sommeDesCreux = ctx.creux.reduce((s, j) => ({ manque: s.manque + j.manque, remises: s.remises + j.remises }), { manque: 0, remises: 0 });

  /* OUVRIR UNE LIGNE DE LOIN (« Attend un oui › Ouvrir la première », 27 octobre 2026) : la ligne vit plus
     haut, dans « Part aujourd'hui ». L'ouvrir sans y aller ne changeait rien à l'écran : on y va. */
  const ouvreLaLigne = (id: string | null) => {
    setOuverte(id);
    if (!id) return;
    /* Elle peut vivre au-delà des cinq premières : la liste se déplie. */
    setToutVoir(true);
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      document.getElementById(`am-ligne-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }));
  };
  /* UN TOUCHER : le message s'ouvre dans WhatsApp, déjà écrit ; il est noté au journal, et son code fabriqué. */
  const noteALaMain = (s: Situation) => {
    const c = cerveau.clientDe(s.clientId);
    const maintenant = Date.now();
    const codePromo = fabriqueLeCodeDe(s, { branchId: branch.id, nom: c?.name ?? '', maintenantMs: maintenant });
    const ligne = ligneALaMain(s, {
      branchId: branch.id, aujourdhui: ctx.aujourdhui, maintenantIso: new Date(maintenant).toISOString(), prenom: prenomDUsage(c),
      rdv: s.genre === 'garder' ? cerveau.rdvAGarder(s.clientId) : undefined, codePromo,
    });
    envoisStore.set((prev) => [...prev.filter((e) => e.id !== ligne.id), ligne as unknown as (typeof prev)[number]]);
  };
  /* LES GESTES DE LA SALLE, écrits au serveur sous condition (`gesteDeLaSalle`), jamais par le magasin. */
  const geste = async (l: LigneDuJour, g: GesteDeLaLigne) => {
    if (!l.envoi) return;
    const id = l.envoi.id;
    const v = await gesteDeLaSalle(id, g, moi?.name ?? 'La direction', regles);
    setVerdicts((prev) => ({
      ...prev,
      [id]: v === 'fait' ? VERDICT_DIT[g] : v === 'trop-tard' ? 'Trop tard : elle vient de partir, ou une autre main l’a reprise.' : 'Panne : le serveur n’a pas répondu, rien n’a changé.',
    }));
  };
  /* « ENVOYER MAINTENANT » SUR UNE LIGNE QUI ATTEND SON HEURE (18 novembre
     2026, Yéman : « je veux que ça parte maintenant ») : la ligne que le
     passage du matin déposerait, à la même clé, part à l'instant, malgré les
     heures calmes (`shared/envoyer-maintenant-pur`). La clé déjà prise (le
     passage vient de la déposer), elle part par le geste de la salle. */
  const [enVol, setEnVol] = useState<string | null>(null);
  /* L'ÉQUIPE DU MATIN : le document de la fonction, l'heure qui avance, la réponse d'un toucher, et ses réglages. */
  const matin = useEquipeDuMatin();
  const [maintenantMatin, setMaintenantMatin] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setMaintenantMatin(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  const [reponseDuMatin, setReponseDuMatin] = useState(false);
  const repondsLeMatin = async (heure: number) => {
    setReponseDuMatin(true);
    const r = await repondsAuMatin(heure, branch.id);
    setReponseDuMatin(false);
    toast(r.ok ? `C’est noté : l’équipe vient à ${heure} h.` : (r.motif ?? 'Rien n’a changé.'));
  };
  const [reglagesDeLaMaison] = useSettings();
  const matinRegle = reglagesDuMatin(reglagesDeLaMaison.equipeDuMatin);
  const [fichesDeLEquipe] = useFichesDeLEquipe();
  const fichesDeLaBranche = fichesDeLEquipe.filter((f) => f.branchId === branch.id && !f.archiveeLe)
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const changeLeMatin = (change: (r: ReturnType<typeof reglagesDuMatin>) => ReglagesDeLEquipeDuMatin) =>
    settingsStore.set((s) => ({ ...s, equipeDuMatin: change(reglagesDuMatin(s.equipeDuMatin)) }));
  const envoieSansAttendre = async (s: Situation) => {
    const qui = moi?.name ?? 'La direction';
    setEnVol(s.clientId);
    try {
      const { issue, id } = await envoieLaLigneMaintenant({ cerveau, situation: s, reglagesGerard: brut, branchId: branch.id, regles, qui });
      let dit = issue === 'parti' ? 'Envoyée maintenant : elle part à l’instant sur WhatsApp, même pendant les heures calmes ; le passage du matin ne la renverra pas.'
        : issue === 'facteur-muet' ? 'Le facteur se tait depuis plus de cinq minutes : rien n’est parti. Réessayez dans un instant.'
          : issue === 'ferme' ? 'Elle ne peut pas partir : le passage du matin ne la déposerait pas.'
            : 'Panne : le serveur n’a pas répondu, rien n’est parti.';
      if (issue === 'deja') {
        const v = await gesteDeLaSalle(id, 'envoyer', qui, regles);
        dit = v === 'fait' ? VERDICT_DIT.envoyer : v === 'trop-tard' ? 'Déjà partie, ou une autre main l’a reprise.' : 'Panne : le serveur n’a pas répondu, rien n’a changé.';
      }
      setVerdicts((prev) => ({ ...prev, [id]: dit }));
    } finally {
      setEnVol(null);
    }
  };
  /* TOUT LAISSER PARTIR (spec §9, les quatre touchers du matin ; 27 octobre
     2026) : chaque notification Ma Couronne du jour encore en salle ou retenue
     part à l'instant, par le même geste que la ligne, une écriture
     conditionnelle et un verdict par ligne ; jamais par le magasin. */
  const partantes = fusion.lignes.filter((l) => l.envoi && l.canal === 'couronne' && (l.etat === 'en-salle' || l.etat === 'retenue'));
  const toutLaisserPartir = async () => { for (const l of partantes) await geste(l, 'envoyer'); };
  /* « PAS MAINTENANT » (spec §5.1, 27 octobre 2026) : la trace « non » du
     jour, sur la ligne que le passage écrirait pour elle (`idDeLaLigne`, le
     canal du serveur : push pour Ma Couronne, whatsapp pour un modèle qui part
     seul, wa-main pour un toucher). Déjà en salle : écartée sous condition,
     par le geste de la salle, avec la réponse. Pas encore de ligne : elle naît
     écartée, et le passage du jour (Trône ou serveur) ne la redépose pas.
     Écartée, elle ne compte jamais comme partie ; portant « non », elle pèse
     dans les traces (`tracesDesEnvois`, lot 2, b3796ae1) : l'envie refusée
     attend 90 jours, la situation ne revient pas le lendemain. */
  const pasMaintenant = async (l: LigneDuJour, s: Situation) => {
    const qui = moi?.name ?? 'La direction';
    const maintenant = new Date().toISOString();
    const marque = { reponse: 'non', pasMaintenant: true, reponduLe: maintenant, reponduPar: qui };
    if (l.envoi) {
      if (l.etat !== 'en-salle' && l.etat !== 'retenue') return;
      const id = l.envoi.id;
      const v = await gesteDeLaSalle(id, 'ecarter', qui, regles, marque);
      setVerdicts((prev) => ({
        ...prev,
        [id]: v === 'fait' ? 'Pas maintenant : écartée, et la réponse « non » est notée.' : v === 'trop-tard' ? 'Trop tard : elle vient de partir, ou une autre main l’a reprise.' : 'Panne : le serveur n’a pas répondu, rien n’a changé.',
      }));
      return;
    }
    const canal = s.canal === 'couronne' ? 'push' : partSeule(s, reglages) ? 'whatsapp' : 'wa-main';
    const ligne = {
      id: idDeLaLigne(ctx.aujourdhui, s.clientId, canal), branchId: branch.id, type: 'gerard', canal, statut: 'écarté',
      clientId: s.clientId, genre: s.genre, ...(s.envie ? { envie: s.envie } : {}), modele: s.modele, texte: s.texte,
      deposeLe: maintenant, quand: maintenant, ecartePar: qui, ecarteLe: maintenant, ...marque,
    };
    envoisStore.set((prev) => (prev.some((e) => e.id === ligne.id) ? prev : [...prev, ligne as unknown as (typeof prev)[number]]));
    toast(`Pas maintenant : rien ne part pour ${cerveau.nomDe(s.clientId) || 'elle'} aujourd’hui${s.genre === 'envie' ? ', et cette envie attend 90 jours' : ''}.`);
  };
  const surRepli = (cle: Repli) => (e: SyntheticEvent<HTMLDetailsElement>) => {
    if (e.currentTarget.open) setRepli(cle);
    else setRepli((r) => (r === cle ? null : r));
  };
  const soucisOuverts = signalements.filter((s) => s.etat === 'ouvert' && !s.bien).length;
  const versLaVue = (cle: Vue) => {
    const suivants = new URLSearchParams(params);
    if (cle === 'aujourdhui') suivants.delete('vue'); else suivants.set('vue', cle);
    setParams(suivants);
  };
  /* Les flèches passent d'une vue à l'autre, comme un vrai tablist. */
  const surLesTouches = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = VUES.findIndex((v) => v.cle === vue);
    const j = (i + (e.key === 'ArrowRight' ? 1 : VUES.length - 1)) % VUES.length;
    e.preventDefault();
    versLaVue(VUES[j].cle);
    (e.currentTarget.children[j] as HTMLElement | undefined)?.focus();
  };
  const copier = (cle: string, texte: string) => {
    void navigator.clipboard?.writeText(texte).then(() => setCopie(cle), () => setCopie(null));
  };
  /* Deux pastilles seulement : celles qui attendent une personne, et les avis à relire. Le plan du
     jour se compte dans sa liste, les remises de la semaine dans « Offres ». */
  const compteDeLaVue = (cle: Vue): { n: string; ton: string } | null => {
    if (cle === 'conversations') return humain.total ? { n: String(humain.total), ton: 'terre' } : null;
    if (cle === 'avis') return aRelire ? { n: String(aRelire), ton: 'or' } : null;
    return null;
  };
  /* À REPROGRAMMER (19 novembre 2026) : tant qu'elle n'a pas choisi sa nouvelle date. Au 7e jour sans
     choix, à l'équipe de la rappeler. */
  const liste = rdvsAReprogrammer(appts);
  const aLEquipe = liste.filter((a) => etatDuReport(a, Date.now()) === 'equipe').length;
  /* L'ÉQUIPE DU MATIN (21 novembre 2026) : rien avant 11 h, la question de 9 h ou 10 h, posée à
     6 h sur le WhatsApp de la direction et ici. Le premier toucher décide ; la fonction juge. */
  const propositionDuMatin = laPropositionDe(matin, jourDeCotonou(maintenantMatin), branch.id);
  const questionDuMatin = direction && estOuverte(propositionDuMatin, maintenantMatin) ? propositionDuMatin : null;
  const arriveeChoisie = propositionDuMatin?.etat === 'choisie' && typeof propositionDuMatin.heure === 'number'
    && minuteDeCotonou(maintenantMatin) < RIEN_AVANT_MIN ? propositionDuMatin : null;
  /* À ENVOYER : les WhatsApp qui attendent un toucher (un par cliente, tant que le modèle n'est pas approuvé chez Meta). */
  const aToucher = tuiles.oui.whatsapp;
  const lignesVues = toutVoir ? fusion.lignes : fusion.lignes.slice(0, LIGNES_VUES);
  const propsDesVues: PropsDUneVue = { cerveau, reglages, moi };
  /* Les vues qui prennent toute la page (la barre du Trône se replie, Shell) : leur propre tête remplace celle de Perle ; « Les envois programmés » passe dans le menu ⋮ de la liste. */
  const pleinePage = vue === 'conversations' || vue === 'avis' || vue === 'offres';

  return (
    <div className={`trc-ger trc-am${vue === 'conversations' ? ' trc-am--conversations' : ''}${pleinePage ? ' trc-am--pleine' : ''}`}>
      {/* TOUTE LA PAGE (18 novembre 2026) : sur les vues qui la prennent, le titre et les cinq chiffres restent sur « Aujourd'hui ». */}
      {/* LA TÊTE (21 novembre 2026) : le nom de la vue, et l'état de Perle d'un coup d'œil, avec son
          interrupteur. Les cinq chiffres d'avant répétaient les tuiles : ils sont partis avec elles. */}
      {!pleinePage && <PageHead
        eyebrow="Conversations"
        title={TITRE_DE_LA_VUE[vue] ?? 'Conversations.'}
        actions={(
          <div className="trc-auj__perle" title={reglages.dernierPassage ? `Dernier passage : ${reglages.dernierPassage === ctx.aujourdhui ? 'aujourd’hui' : jourDit(reglages.dernierPassage)}` : undefined}>
            <i className={actif ? 'est-actif' : ''} aria-hidden="true" />
            <span>{actif ? 'Perle écrit seule' : 'Perle est en pause'}</span>
            {direction && (
              <button type="button" className="trc-auj__btn" onClick={() => metEnPause(actif, moi?.name ?? 'La direction')}>
                {actif ? 'Mettre en pause' : 'Reprendre'}
              </button>
            )}
          </div>
        )}
      />}

      {/* LA BARRE DES CINQ VUES, collante : elle nomme ce qu'on règle et compte ce qui attend. */}
      <div className="trc-am__vues" role="tablist" aria-label="Les vues de l’Assistant" onKeyDown={surLesTouches}>
        {VUES.map((v) => {
          const choisi = vue === v.cle;
          const compte = compteDeLaVue(v.cle);
          return (
            <button key={v.cle} type="button" role="tab" id={`am-ong-${v.cle}`} aria-selected={choisi} aria-controls={`am-vue-${v.cle}`}
              tabIndex={choisi ? 0 : -1} className={`${choisi ? 'est-choisi' : ''}${v.cle === 'reglages' ? ' est-a-droite' : ''}`} onClick={() => versLaVue(v.cle)}>
              {v.titre}
              {compte && <span className={`trc-am__n trc-am__n--${compte.ton}`}>{compte.n}</span>}
            </button>
          );
        })}
        {/* LES ENVOIS PROGRAMMÉS (13 novembre 2026) : la file vivait seulement sous la barre WhatsApp ·
            Le chat du site (#/appels), et Yéman ne la trouvait pas. Depuis le 21 novembre, dans la barre
            même, à droite : après les onglets, pour que les flèches du clavier gardent leur compte. */}
        <Link to="/appels" className="trc-am__vues-lien">Programmés</Link>
      </div>

      <div className="trc-am__vue" role="tabpanel" id={`am-vue-${vue}`} aria-labelledby={`am-ong-${vue}`}>
        {vue === 'conversations' && <LesConversations {...propsDesVues} />}
        {vue === 'avis' && <LesAvis {...propsDesVues} />}
        {vue === 'offres' && <OffresEtRemises {...propsDesVues} />}
        {vue === 'rapporte' && <CeQueCaRapporte {...propsDesVues} />}
        {vue === 'aujourdhui' && (
          <>
            {/* AUJOURD'HUI, REFAIT (21 novembre 2026, « je me perds et n'y comprends rien… plus de si longs
                textes », Yéman ; maquette Jrj9rfdYAYPDPDS1aT4EFs). Trois zones : ce qui l'attend, ce que
                Perle écrit, ce qui est parti. Le réglage, les règles, les jours creux et les modèles vivent
                dans la vue « Réglages ». */}
            <section className="trc-auj__bloc" aria-label="À faire maintenant">
              <span className="trc-auj__sur">À faire maintenant</span>
              {/* L'ÉQUIPE DU MATIN (21 novembre 2026) : la même question que sur son WhatsApp à 6 h. */}
              {questionDuMatin && (
                <div className="trc-auj__equipe">
                  <div>
                    <strong>L’équipe plus tard ?</strong>
                    <span>Rien avant 11 h · {nomsDits(questionDuMatin.destinataires.map((d) => d.appel))} · réponse avant {heureDuMatin(minuteDeCotonou(Date.parse(questionDuMatin.limite)))}</span>
                  </div>
                  {HEURES_PLUS_TARD.map((h) => (
                    <button key={h} type="button" className="trc-auj__btn trc-auj__btn--clair" disabled={reponseDuMatin} onClick={() => { void repondsLeMatin(h); }}>À {h} h</button>
                  ))}
                </div>
              )}
              {arriveeChoisie && (
                <div className="trc-auj__equipe trc-auj__equipe--calme">
                  <div>
                    <strong>L’équipe vient à {arriveeChoisie.heure} h</strong>
                    <span>{nomsDits(arriveeChoisie.destinataires.map((d) => d.appel))} · personne ne réserve avant {heureDuMatin((arriveeChoisie.heure ?? 0) * 60 + INSTALLATION_MIN)}</span>
                  </div>
                </div>
              )}
              <div className="trc-auj__cartes">
                <div className={`trc-auj__carte${humain.total > 0 ? ' trc-auj__carte--forte' : ''}`}>
                  <b>{humain.total}</b>
                  <strong>À répondre</strong>
                  <span className={humain.sante > 0 ? 'est-alarme' : ''}>{humain.sante > 0 ? `dont ${humain.sante} santé` : humain.total > 0 ? 'Elles attendent une personne' : 'Personne n’attend'}</span>
                  {humain.total > 0 && (
                    <button type="button" className="trc-auj__btn trc-auj__btn--clair" aria-expanded={tiroir === 'repondre'}
                      onClick={() => setTiroir(tiroir === 'repondre' ? null : 'repondre')}>
                      {tiroir === 'repondre' ? 'Fermer' : 'Répondre'}
                    </button>
                  )}
                </div>
                <div className="trc-auj__carte">
                  <b>{aToucher.n}</b>
                  <strong>À envoyer</strong>
                  <span>{aToucher.n > 0 ? 'Messages prêts sur WhatsApp' : actif ? 'Rien à envoyer' : 'Perle est en pause'}</span>
                  {aToucher.n > 0 && (
                    <button type="button" className="trc-auj__btn trc-auj__btn--cuivre" onClick={() => ouvreLaLigne(aToucher.clientIds[0] ?? null)}>Envoyer la première</button>
                  )}
                </div>
                <div className="trc-auj__carte">
                  <b>{liste.length}</b>
                  <strong>À reprogrammer</strong>
                  <span className={aLEquipe > 0 ? 'est-alarme' : ''}>
                    {aLEquipe > 0 ? `${aLEquipe} à rappeler` : liste.length === 1 ? (nomDe(liste[0].clientId) || liste[0].clientName || 'Sans nouvelle date') : liste.length > 0 ? 'Sans nouvelle date' : 'Aucune'}
                  </span>
                  {liste.length > 0 && (
                    <button type="button" className="trc-auj__btn"
                      onClick={() => (liste.length === 1 ? setAReposer(liste[0]) : setTiroir(tiroir === 'reprogrammer' ? null : 'reprogrammer'))}>
                      {liste.length > 1 && tiroir === 'reprogrammer' ? 'Fermer' : 'Reposer une date'}
                    </button>
                  )}
                </div>
              </div>
              {/* LE TIROIR : la liste ne s'ouvre qu'à la demande, sous les cartes. Santé d'abord, puis À voir. */}
              {tiroir === 'repondre' && humain.total > 0 && (
                <div className="trc-ger__carte trc-auj__tiroir">
                  <div className="trc-ger__haut">
                    <h3>À répondre</h3>
                    <button type="button" className="trc-ger__btn" onClick={() => versLaVue('conversations')}>Toutes les conversations</button>
                  </div>
                {humain.lignes.length === 0
                  ? <p className="trc-ger__doux">Personne n’attend : aucun souci ouvert, aucun fil sans réponse depuis 24 h, aucune demande ni appel à traiter.</p>
                  : (
                    <ul className="trc-ger__liste">
                      {humain.lignes.map((l) => {
                        const brutTel = l.numero ?? cerveau.clientDe(l.clientId ?? '')?.phone;
                        const chemin = cheminDeLaConversation(brutTel);
                        const tel = lienTel(brutTel);
                        const ton = TON_DE_L_ATTENTE[l.genre] ?? 'indigo';
                        return (
                          <li key={l.cle} className={`trc-ger__rangee trc-am__attente${l.enRetard ? ' est-en-retard' : ''}`}>
                            <span className={`trc-am__avatar trc-am__avatar--${ton}`} aria-hidden="true">{initiales(l.nom)}</span>
                            <span className="trc-am__qui">
                              <b>{l.nom || 'Sans nom'} <em className={`trc-am__puce trc-am__puce--${ton}`}>{GENRE_D_ATTENTE_DIT[l.genre]}</em></b>
                              <span>{l.dit}{l.dit ? ' · ' : ''}{l.depuis}{l.enRetard ? ' · en retard' : ''}</span>
                            </span>
                            <span className="trc-am__gestes">
                              {l.genre === 'sante' && tel && <a className="trc-ger__btn trc-ger__btn--alarme" href={tel}>Appeler</a>}
                              {chemin && <Link className="trc-ger__btn" to={chemin}>Répondre</Link>}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
              {tiroir === 'reprogrammer' && liste.length > 1 && (
                <div className="trc-ger__carte trc-auj__tiroir">
                  <h3>À reprogrammer</h3>
                  <ul className="trc-ger__liste">
                    {liste.map((a) => (
                      <li key={a.id} className="trc-ger__rangee trc-am__attente">
                        <span className="trc-am__qui">
                          <b>{nomDe(a.clientId) || a.clientName || 'Cliente'}</b>
                          <span>{apptLabel(a, byId) || 'Rituel'} · prévu le {frShort(a.date)} à {a.time} · {etatDuReportDit(a, Date.now())}</span>
                        </span>
                        <span className="trc-am__gestes">
                          <button type="button" className="trc-ger__btn trc-ger__btn--cuivre" onClick={() => setAReposer(a)}>Reposer une date</button>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            {(aRelire > 0 || bilansARemettre > 0 || muettes > 0) && (
              <section className="trc-auj__bloc" aria-label="Ensuite">
                <span className="trc-auj__sur">Ensuite</span>
                <div className="trc-auj__suite">
                  {aRelire > 0 && (
                    <div className="trc-auj__petite">
                      <b>{aRelire}</b><span>Avis à relire</span>
                      <button type="button" className="trc-auj__btn" onClick={() => versLaVue('avis')}>Relire</button>
                    </div>
                  )}
                  {bilansARemettre > 0 && (
                    <div className="trc-auj__petite">
                      <b>{bilansARemettre}</b><span>{bilansARemettre > 1 ? 'Bilans à remettre' : 'Bilan à remettre'}</span>
                      <Link className="trc-auj__btn" to="/customers?focus=bilans">Voir</Link>
                    </div>
                  )}
                  {muettes > 0 && (
                    <div className="trc-auj__petite">
                      <b>{muettes}</b><span>{muettes > 1 ? 'Civilités à poser' : 'Civilité à poser'}</span>
                      <button type="button" className="trc-auj__btn" onClick={() => setCivilites(true)}>Poser</button>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* CE QUE PERLE ÉCRIT AUJOURD'HUI : le plan du jour, ligne par ligne, avec ce que la salle en sait.
                Cinq lignes d'abord, le reste se déplie ; un panneau ouvert à la fois. */}
            <section className="trc-auj__bloc" aria-label="Perle écrit aujourd’hui">
              <div className="trc-auj__tete">
                <h3>
                  {!actif ? `En pause · ${fusion.lignes.length} message${fusion.lignes.length > 1 ? 's' : ''} prêt${fusion.lignes.length > 1 ? 's' : ''}`
                    : fusion.lignes.length === 0 ? 'Perle n’écrit à personne aujourd’hui'
                      : `Perle écrit à ${fusion.lignes.length} cliente${fusion.lignes.length > 1 ? 's' : ''}`}
                </h3>
                {tuiles.francs && <span className="trc-auj__enjeu">≈ {enFrancs(tuiles.francs.calibre)} en jeu</span>}
                {partantes.length > 0 && (
                  <button type="button" className="trc-ger__btn trc-ger__btn--cuivre" onClick={() => { void toutLaisserPartir(); }}>Tout laisser partir ({partantes.length})</button>
                )}
              </div>
              {fusion.lignes.length > 0 && (
                <ul className="trc-auj__liste">
                  {lignesVues.map((l) => {
                  const s = l.situation;
                  const f = ficheDe.get(s.clientId);
                  const nom = nomDe(s.clientId);
                  const ouvert = ouverte === s.clientId;
                  const modele = MODELES_DE_GERARD[s.modele];
                  const tel = lienTel(cerveau.telDe(s));
                  const enSalle = l.etat === 'en-salle' || l.etat === 'retenue';
                  /* Garder son RDV : la ligne dit lequel, avec l'année (maquette l.374). */
                  const rdv = s.genre === 'garder' ? cerveau.rdvAGarder(s.clientId) : undefined;
                  /* La ligne qui attend son heure : « Envoyer maintenant », ouvert ou fermé avec sa raison. */
                  const porteMaintenant = porteDuMaintenant({
                    situation: s, reglagesGerard: brut, dejaUneLigne: !!l.envoi, fiche: f, destinataire: s.pourId ? ficheDe.get(s.pourId) : undefined,
                    nouvelles: cerveau.clientDe(s.clientId)?.nouvelles, telephone: cerveau.telDe(s), aujourdhui: ctx.aujourdhui,
                  });
                  const idWa = idDeLaLigne(ctx.aujourdhui, s.clientId, 'whatsapp');
                    /* À SON TOUCHER : le bouton « Envoyer » est sur la ligne même (la carte, ou WhatsApp déjà écrit). */
                    const aSonToucher = l.etat === 'a-son-toucher' && s.canal === 'whatsapp' && servie(reglages, s.clientId) && !partSeule(s, reglages);
                    const lienDuToucher = aSonToucher && modele.enTete !== 'image' ? lienWaMe(cerveau.telDe(s), `${s.texte}\n${DEVISE_COMPLETE}`) : null;
                    const aUnBouton = aSonToucher && (modele.enTete === 'image' || !!lienDuToucher);
                    return (
                      <li key={s.clientId} id={`am-ligne-${s.clientId}`} className={`trc-auj__rangee${ouvert ? ' est-ouverte' : ''}`}>
                        <div className="trc-auj__ligne">
                          <button type="button" className="trc-auj__ouvre" aria-expanded={ouvert} onClick={() => setOuverte(ouvert ? null : s.clientId)}>
                            <span className={`trc-am__avatar${s.canal === 'whatsapp' ? ' trc-am__avatar--cuivre' : ''}`} aria-hidden="true">{initiales(nom)}</span>
                            <span className="trc-auj__qui">{nom}</span>
                            <span className={`trc-auj__motif${s.code ? ' trc-auj__motif--cuivre' : ''}`}>
                              {GENRE_DIT[s.genre]}{s.envie ? ` · ${ENVIE_DITE[s.envie]}` : ''}{rdv ? ` · ${jourDit(rdv.date)}, ${heureDite(rdv.time)}` : ''}{s.pourId ? ` · à ${nomDe(s.pourId) || 'son parent payeur'}` : ''}{s.code ? ` · −${s.code.pct} %` : ''}
                            </span>
                            <span className="trc-auj__francs">{l.francs ? `≈ ${enFrancs(l.francs.calibre)}` : ''}</span>
                          </button>
                          <span className="trc-auj__fin">
                            {aSonToucher && modele.enTete === 'image' && (
                              <button type="button" className="trc-auj__btn trc-auj__btn--cuivre" onClick={() => setCarteDe(s)}>Envoyer</button>
                            )}
                            {lienDuToucher && (
                              <a className="trc-auj__btn trc-auj__btn--cuivre" href={lienDuToucher} target="_blank" rel="noreferrer" onClick={() => noteALaMain(s)}>Envoyer</a>
                            )}
                            {!aUnBouton && (
                              <small className={l.etat === 'ecartee' || l.etat === 'perimee' || l.etat === 'echec' ? 'trc-am__alarme' : ''}>{departCourt(l)}</small>
                            )}
                          </span>
                        </div>
                      {ouvert && f && (
                        <div className="trc-ger__panneau trc-auj__panneau">
                          <div className="trc-ger__message">
                            {/* SA CIVILITÉ, tant que la fiche de celle qui reçoit n'en dit rien et que rien n'est encore
                                en salle : un toucher la pose sur sa fiche, et le message dit aussitôt « M. Jean-Luc ». */}
                            {(() => {
                              const dest = clients.find((c) => c.id === (s.pourId ?? s.clientId));
                              if (!dest || !estMuette(dest) || l.envoi) return null;
                              return (
                                <div className="trc-civ__surligne">
                                  <b>Sa civilité</b>
                                  <span>{s.pourId ? `${nomDe(dest.id) || 'son parent payeur'}, ` : ''}le message dit le prénom seul :</span>
                                  {CIVILITES.map((x) => <button key={x.cle} type="button" className="trc-chip" onClick={() => poseLaCivilite(dest, x.cle)}>{x.dit}</button>)}
                                </div>
                              );
                            })()}
                            <div className="trc-ger__bulle">
                              <span className="trc-ger__texte">{s.texte}</span>
                              {modele.boutons.length > 0 && <span className="trc-ger__boutons">{modele.boutons.map((b) => <i key={b}>{b}</i>)}</span>}
                              <span className="trc-ger__pied">{piedDeGerard}</span>
                            </div>
                            <small className="trc-ger__doux">{canalDuPlan(s.canal)} · {l.depart}{l.codePromo ? ` · code ${l.codePromo}` : ''}</small>
                            <div className="trc-am__gestes">
                              {/* LOT 2 : un modèle approuvé chez Meta part seul au passage du matin (`partSeule`) ; le
                                  bouton se tait, sinon le message partirait deux fois. Pas approuvé : un toucher par cliente. */}
                              {s.canal === 'whatsapp' && partSeule(s, reglages) && (
                                <em className="trc-am__puce trc-am__puce--cuivre">{l.envoi?.envoyeMaintenantPar ? `Envoyée maintenant par ${l.envoi.envoyeMaintenantPar}` : s.genre === 'anniversaire' ? 'Part seule sur WhatsApp à 10 h' : 'Part seul sur WhatsApp au passage du matin'}</em>
                              )}
                              {/* « ENVOYER MAINTENANT » (18 novembre 2026) : la ligne qui attend son heure part à l'instant,
                                  malgré les heures calmes ; fermé, le bouton dit pourquoi (`porteDuMaintenant`). */}
                              {porteMaintenant.bouton && (porteMaintenant.ouvert ? (
                                <button type="button" className="trc-ger__btn trc-ger__btn--cuivre" disabled={enVol === s.clientId}
                                  title="Elle part à l’instant, par le même modèle que le passage du matin, même pendant les heures calmes ; le passage ne la renverra pas."
                                  onClick={() => { void envoieSansAttendre(s); }}>
                                  {enVol === s.clientId ? 'Envoi en cours' : 'Envoyer maintenant'}
                                </button>
                              ) : (
                                <button type="button" className="trc-ger__btn" disabled title={`Fermé : ${porteMaintenant.raison}.`}>Envoyer maintenant</button>
                              ))}
                              {/* LA CARTE À UN TOUCHER : la fenêtre « Sa carte » (l'image à son prénom, au numéro du plan) ; noté « à la main » quand elle part. */}
                              {s.canal === 'whatsapp' && servie(reglages, s.clientId) && !partSeule(s, reglages) && modele.enTete === 'image' && (
                                <button type="button" className="trc-ger__btn trc-ger__btn--cuivre" onClick={() => setCarteDe(s)}>Envoyer sa carte</button>
                              )}
                              {s.canal === 'whatsapp' && servie(reglages, s.clientId) && !partSeule(s, reglages) && modele.enTete !== 'image' && (() => {
                                const lien = lienWaMe(cerveau.telDe(s), `${s.texte}\n${DEVISE_COMPLETE}`);
                                return lien ? (
                                  <a className="trc-ger__btn trc-ger__btn--cuivre" href={lien} target="_blank" rel="noreferrer" onClick={() => noteALaMain(s)}>Envoyer sur WhatsApp</a>
                                ) : null;
                              })()}
                              {l.etat === 'en-salle' && <button type="button" className="trc-ger__btn" onClick={() => { void geste(l, 'retenir'); }}>Retenir</button>}
                              {l.etat === 'retenue' && <button type="button" className="trc-ger__btn" onClick={() => { void geste(l, 'relacher'); }}>Relâcher</button>}
                              {enSalle && <button type="button" className="trc-ger__btn trc-ger__btn--cuivre" onClick={() => { void geste(l, 'envoyer'); }}>Envoyer maintenant</button>}
                              {enSalle && <button type="button" className="trc-ger__btn" onClick={() => { void geste(l, 'ecarter'); }}>Écarter</button>}
                              <button type="button" className="trc-ger__btn" onClick={() => setRdvPour(s.clientId)}>Poser le RDV</button>
                              {tel && <a className="trc-ger__btn" href={tel}>Appeler</a>}
                              {/* PAS MAINTENANT : la trace « non » du jour (voir `pasMaintenant`) ; tant que rien n'est parti,
                                  et en Actif seulement (en pause, rien ne part de toute façon). */}
                              {actif && (!l.envoi || enSalle) && (
                                <button type="button" className="trc-ger__btn"
                                  title={s.genre === 'envie' ? 'Rien ne part aujourd’hui ; cette envie attend 90 jours.' : 'Rien ne part aujourd’hui ; il ne lui réécrit pas avant quatorze jours.'}
                                  onClick={() => { void pasMaintenant(l, s); }}>
                                  Pas maintenant
                                </button>
                              )}
                              {/* JAMAIS POUR ELLE (direction) : s'écrit dans ses réglages, `jamais[clientId]`
                                  (gerard.ts, lot 2), et la situation sort de son plan. */}
                              {direction && (
                                <button type="button" className="trc-ger__btn trc-am__btn--calme"
                                  title={`Il ne lui écrira plus jamais « ${GENRE_DIT[s.genre]} » ; noté dans ses réglages.`}
                                  onClick={() => { jamaisPourElle(s.clientId, s.genre, true, moi?.name ?? 'La direction'); toast(`Noté : plus jamais « ${GENRE_DIT[s.genre]} » pour ${nom}.`); }}>
                                  Jamais pour elle
                                </button>
                              )}
                            </div>
                            {porteMaintenant.bouton && !porteMaintenant.ouvert && <small className="trc-ger__doux">Envoyer maintenant est fermé : {porteMaintenant.raison}.</small>}
                            {!l.envoi && verdicts[idWa] && <small className="trc-ger__doux">{verdicts[idWa]}</small>}
                            {l.envoi && verdicts[l.envoi.id] && <small className="trc-ger__doux">{verdicts[l.envoi.id]}</small>}
                            {s.canal === 'couronne' && actif && l.etat === 'pas-encore' && <small className="trc-ger__doux">Notification Ma Couronne : elle part au passage du jour.</small>}
                          </div>
                          <details className="trc-ger__pourquoi trc-auj__pourquoi">
                            <summary>Pourquoi ce message</summary>
                            <ul className="trc-am__puces">
                              {s.pourquoi.map(([k, v]) => <li key={k}><span className="trc-am__cle">{k}</span> <span>{v}</span></li>)}
                            </ul>
                            <LeFil fiche={f} aujourdhui={ctx.aujourdhui} />
                          </details>
                        </div>
                      )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {fusion.lignes.length > LIGNES_VUES && (
                <button type="button" className="trc-auj__plus" aria-expanded={toutVoir} onClick={() => setToutVoir((v) => !v)}>
                  {toutVoir ? 'Réduire la liste' : fusion.lignes.length - LIGNES_VUES === 1 ? 'Voir la dernière' : `Voir les ${fusion.lignes.length - LIGNES_VUES} autres`}
                </button>
              )}
            </section>

            {/* CE QUI EST PARTI AUJOURD'HUI, tous types, à l'heure de Cotonou. Replié : son compte se lit fermé. */}
            <details className="trc-ger__carte trc-am__repli">
              <summary>
                <h3>Déjà parti aujourd’hui</h3>
                <span className="trc-am__resume">
                  <b>{parti.lignes}</b>
                  {parti.compte.aRegarder ? <i className="trc-am__alarme"> · à regarder {parti.compte.aRegarder}</i> : null}
                </span>
              </summary>
              {parti.lignes === 0 && <p className="trc-ger__doux">Rien encore aujourd’hui.</p>}
              {parti.lignes > 0 && (
                <div className="mnd-scroll-x">
                  <table>
                    <thead><tr><th>Heure</th><th>Quoi</th><th>Par où</th><th className="d">Lignes</th><th>Devenu</th><th>Code</th><th>Clientes</th></tr></thead>
                    <tbody>
                      {parti.rangees.map((r) => {
                        const puce = puceDuCanal(r.cle.split('|')[1] ?? '');
                        const noms = clientesDuParti.get(r.cle) ?? [];
                        const ouverte = rangeeOuverte === r.cle;
                        return (
                          <Fragment key={r.cle}>
                          <tr className={`trc-am__rangee${ouverte ? ' is-open' : ''}`} onClick={() => setRangeeOuverte(ouverte ? null : r.cle)}>
                            <td>
                              <button type="button" className="trc-am__ouvre" aria-expanded={ouverte} aria-label={`${ouverte ? 'Fermer' : 'Ouvrir'} le détail : ${r.quoi}`}
                                onClick={(ev) => { ev.stopPropagation(); setRangeeOuverte(ouverte ? null : r.cle); }}>
                                {r.heure}
                              </button>
                            </td>
                            <td>{r.quoi}</td>
                            <td><span className={`trc-am__puce trc-am__puce--${puce.ton}`}>{puce.dit}</span></td>
                            <td className="d">{r.lignes}</td>
                            <td>{r.devenu}{r.motifs.length ? <small className="trc-am__alarme"> · {r.motifs.join(' · ')}</small> : null}</td>
                            {/* La remise à son nom : le code né au départ réel, « à fabriquer au départ » en attendant (`codeDeLaLigne`). */}
                            <td>{r.codes.join(', ')}</td>
                            <td className="trc-am__noms">{noms.length > 8 ? `${noms.slice(0, 8).join(', ')} et ${noms.length - 8} autres` : noms.join(', ')}</td>
                          </tr>
                          {ouverte && (
                            <tr className="trc-am__detail">
                              <td colSpan={7}>
                                <ol className="trc-am__messages">
                                  {detailOuvert.map((l) => {
                                    const qui = (l.clientId ? nomDe(l.clientId) : '') || l.prenom || 'Sans fiche';
                                    const chemin = cheminDeLaConversation(l.numero);
                                    return (
                                      <li key={l.id} className={l.aRegarder ? 'is-alarme' : undefined}>
                                        <div className="trc-am__message-tete">
                                          <b>{l.heure}</b>
                                          <span>{qui}</span>
                                          {l.numero && <span className="trc-am__numero">+{chiffresSeuls(l.numero)}</span>}
                                          <span className={l.aRegarder ? 'trc-am__alarme' : 'trc-am__devenu'}>{l.devenu}{l.motif ? ` · ${l.motif}` : ''}</span>
                                          {l.code && <span>code {l.code}</span>}
                                          {chemin && <Link className="trc-ger__btn" to={chemin}>La conversation</Link>}
                                        </div>
                                        {l.texte
                                          ? <p className="trc-am__texte">{l.texte}</p>
                                          : <p className="trc-ger__doux">Le texte n’est pas gardé pour ce message (modèle Meta sans copie au fil).</p>}
                                        {l.modele && <small className="trc-ger__doux">modèle {l.modele}</small>}
                                      </li>
                                    );
                                  })}
                                </ol>
                              </td>
                            </tr>
                          )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </details>
          </>
        )}
        {/* LES RÉGLAGES DE PERLE (21 novembre 2026) : tout ce qui se règle, et rien de ce qui se fait
            aujourd'hui. Pause ou Actif reste déplié : le banc de Gérard touche ses boutons. */}
        {vue === 'reglages' && (
          <>
            <section className="trc-ger__carte">
              <h3>Pause ou Actif</h3>
              <div className="trc-ger__modes" role="radiogroup" aria-label="Pause ou Actif">
                {MODES.map((m) => (
                  <button key={m.titre} type="button" role="radio" aria-checked={actif !== m.pause} disabled={!direction}
                    className={actif !== m.pause ? 'est-choisi' : ''} onClick={() => metEnPause(m.pause, moi?.name ?? 'La direction')}>
                    <b>{m.titre}</b><span>{m.dit}</span>
                  </button>
                ))}
              </div>
              <div className="trc-ger__plafond">
                <label>
                  <span>Remises par semaine, tout compris</span>
                  <input type="text" inputMode="numeric" value={nombre} disabled={!direction}
                    onChange={(e) => setNombre(e.target.value)} onBlur={posePlafond} />
                </label>
                <label>
                  <span>Plafond en francs par semaine</span>
                  <input type="text" inputMode="numeric" value={francs} disabled={!direction}
                    onChange={(e) => setFrancs(e.target.value)} onBlur={posePlafond} />
                </label>
              </div>
              <p className="trc-ger__doux">Cette semaine : {plafond.faites} remise{plafond.faites > 1 ? 's' : ''}, {francsDits(plafond.francs)} engagés.</p>
              <div className="trc-auj__etat">
                {etatServeur !== undefined && (
                  <span>Passage du matin : {serveurVit ? 'par le serveur' : 'par le Trône'}{etatServeur?.passageLe ? ` · dernier passage ${jourDit(etatServeur.passageLe)}` : ''}</span>
                )}
                <span>Joignables : <b>{portee.joignables}</b> · Ma Couronne {portee.couronne} · WhatsApp {portee.whatsapp}</span>
                {anniversaires.length > 0 && (
                  <span>
                    Anniversaires du jour : <b>{anniversaires.length}</b>
                    {annivTus.length > 0 ? ` · sans carte : ${annivTus.map((a) => `${nomDe(a.clientId) || 'une fiche'} (${ETAT_DE_L_ANNIVERSAIRE_DIT[a.etat]})`).join(', ')}` : ''}
                  </span>
                )}
              </div>
            </section>

            <details className="trc-ger__carte trc-am__repli">
              <summary>
                <h3>Jours creux</h3>
                <span className="trc-am__resume">
                  <b>{ctx.creux.length}</b> jour{ctx.creux.length > 1 ? 's' : ''} · {sommeDesCreux.manque} place{sommeDesCreux.manque > 1 ? 's' : ''} manquante{sommeDesCreux.manque > 1 ? 's' : ''} · {sommeDesCreux.remises} remise{sommeDesCreux.remises > 1 ? 's' : ''} ouverte{sommeDesCreux.remises > 1 ? 's' : ''}
                </span>
              </summary>
              <p className="trc-ger__doux">Un jour creux a moins de rendez-vous que d’habitude : Perle y propose ses remises de {REMISE_CREUX_PCT} %.</p>
              <div className="mnd-scroll-x">
                <table>
                  <thead><tr><th>Jour</th><th className="d">Posés</th><th className="d">Ordinaire</th><th className="d">Manque</th><th className="d">Remises</th><th>Une place proposée à</th></tr></thead>
                  <tbody>
                    {ctx.creux.length === 0 && <tr><td colSpan={6} className="trc-ger__doux">Aucun jour creux dans la semaine qui vient.</td></tr>}
                    {ctx.creux.map((j) => {
                      const aQui = plan.filter((s) => s.genre === 'creux' && s.code?.jour === j.iso).map((s) => nomDe(s.clientId)).filter(Boolean);
                      return (
                        <tr key={j.iso}>
                          <td>{jourDit(j.iso)}</td><td className="d">{j.poses}</td><td className="d">{j.ordinaire}</td><td className="d">{j.manque}</td><td className="d">{j.remises}</td>
                          <td className="trc-am__noms">{aQui.length ? aQui.join(', ') : 'personne aujourd’hui'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>

            {/* L'ÉQUIPE LE MATIN (21 novembre 2026) : qui reçoit la journée à 6 h, comment Perle l'appelle,
                qui répond « À 9 h » ou « À 10 h », et l'heure au-delà de laquelle l'équipe vient à 8 h. */}
            <details className="trc-ger__carte trc-am__repli trc-auj__matin" open={repli === 'matin'} onToggle={surRepli('matin')}>
              <summary>
                <h3>L’équipe le matin</h3>
                <span className="trc-am__resume">{matinRegle.actif ? <><b>{matinRegle.destinataires.length}</b> à 6 h</> : 'Éteint'}</span>
              </summary>
              <label className="trc-auj__reglage">
                <input type="checkbox" checked={matinRegle.actif} disabled={!direction}
                  onChange={(e) => { const oui = e.target.checked; changeLeMatin((r) => ({ ...r, actif: oui })); }} />
                <span>Chaque matin à 6 h, la journée à l’équipe</span>
              </label>
              <ul className="trc-auj__qui-recoit">
                {fichesDeLaBranche.filter((f) => f.auFauteuil).map((f) => {
                  const d = matinRegle.destinataires.find((x) => x.staffId === f.id);
                  return (
                    <li key={f.id}>
                      <label>
                        <input type="checkbox" checked={!!d} disabled={!direction}
                          onChange={(e) => {
                            const oui = e.target.checked;
                            changeLeMatin((r) => ({ ...r, destinataires: oui ? [...r.destinataires.filter((x) => x.staffId !== f.id), { staffId: f.id }] : r.destinataires.filter((x) => x.staffId !== f.id) }));
                          }} />
                        <span>{f.name}</span>
                      </label>
                      {d && (
                        <input type="text" aria-label={`Comment Perle appelle ${f.name}`} placeholder={appelDuDestinataire({ staffId: f.id }, f.name)} defaultValue={d.appel ?? ''} disabled={!direction}
                          onBlur={(e) => {
                            const appel = e.target.value.replace(/\s+/g, ' ').trim();
                            changeLeMatin((r) => ({ ...r, destinataires: r.destinataires.map((x) => (x.staffId === f.id ? (appel ? { staffId: f.id, appel } : { staffId: f.id }) : x)) }));
                          }} />
                      )}
                    </li>
                  );
                })}
              </ul>
              <label className="trc-auj__reglage">
                <span>« À 9 h » ou « À 10 h » : la question va à</span>
                <select value={matinRegle.decideur} disabled={!direction}
                  onChange={(e) => { const decideur = e.target.value; changeLeMatin((r) => ({ ...r, decideur })); }}>
                  <option value="">Personne</option>
                  {fichesDeLaBranche.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </label>
              <label className="trc-auj__reglage">
                <span>Sans réponse à</span>
                <input type="time" value={matinRegle.limite} min="06:00" max="09:00" disabled={!direction}
                  onChange={(e) => { const limite = e.target.value; changeLeMatin((r) => ({ ...r, limite })); }} />
                <span>l’équipe vient à 8 h</span>
              </label>
            </details>

            <details className="trc-ger__carte trc-am__repli trc-am__repli--hote" open={repli === 'entre-deux'} onToggle={surRepli('entre-deux')}>
              <summary>
                <h3>Entre deux séances</h3>
                <span className="trc-am__resume"><b>{soucisOuverts}</b> souci{soucisOuverts > 1 ? 's' : ''} ouvert{soucisOuverts > 1 ? 's' : ''}</span>
              </summary>
              <GerardEntreDeux />
            </details>

            <details className="trc-ger__carte trc-am__repli" open={repli === 'regles'} onToggle={surRepli('regles')}>
              <summary>
                <h3>Ses règles</h3>
                <span className="trc-am__resume"><b>{plafond.remisesParSemaine}</b> remises et {francsDits(plafond.plafondFrancs)} par semaine · jamais entre 20 h et 8 h</span>
              </summary>
              <div className="mnd-scroll-x">
                <table>
                  <tbody>
                    <tr><td>Le fil entre deux séances</td><td>Une envie par mois, d’après sa fiche : un soin si elle a dit « cheveux secs », une retouche si sa couleur a trois mois, midi et deux si elle vient à midi, une coiffure en fin d’année, un lavage si son rythme est long. Jamais la même deux fois ; refusée, elle attend trois mois.</td></tr>
                    <tr><td>La saison des fêtes</td><td>Du 1er novembre au 24 décembre : une envie toutes les trois semaines, les relances toutes les deux semaines, le message de Noël dès le 15 novembre. Retour au rythme ordinaire le 25 décembre.</td></tr>
                    <tr><td>Avant sa date</td><td>Sept jours avant sa date de cadence, il lui propose de réserver ; avec un soin ajouté le même jour, la coiffure de sortie est offerte.</td></tr>
                    <tr><td>Garder son RDV</td><td>Deux jours avant un RDV pris depuis plus d’une semaine ; la veille, le rappel habituel.</td></tr>
                    <tr><td>Les relances</td><td>Dix jours après sa date de cadence si rien n’est posé, puis quatre semaines au plus entre deux ; une endormie trois fois, à six semaines d’écart, puis silence.</td></tr>
                    <tr><td>Les remises</td><td>Jour creux {REMISE_CREUX_PCT} %, anniversaire {REMISE_ANNIV_PCT} % (30 jours), notées à son nom et proposées à la Caisse ; {plafond.remisesParSemaine} par semaine tout compris et {francsDits(plafond.plafondFrancs)} au plus ; jamais deux à la fois.</td></tr>
                    <tr><td>Le silence</td><td>Rien qu’à garder son RDV si elle doit de l’argent, si une relance de facture est partie il y a moins de sept jours, si elle a écrit depuis moins de 48 heures sans réponse, si un souci est ouvert ; jamais rien à un enfant d’un foyer (le parent reçoit).</td></tr>
                    <tr><td>Noël</td><td>Du 15 novembre au 15 décembre, les places des fêtes et la carte cadeau, sans remise.</td></tr>
                    <tr><td>Toujours</td><td>Jamais entre 20 h et 8 h, jamais deux messages en moins de deux semaines, toutes voix de la Maison comptées (hors garder son RDV et les services), jamais de prix ni de civilité supposée ; Ma Couronne d’abord (gratuite), sinon WhatsApp, avec l’accord des nouvelles pour une sollicitation.</td></tr>
                    <tr><td>La question franche</td><td>Ses messages sont signés « {SIGNATURE} » et il n’annonce rien de lui-même ; à « c’est un robot ? », il répond : « {REPONSE_FRANCHE} »</td></tr>
                  </tbody>
                </table>
              </div>
            </details>

            <details className="trc-ger__carte trc-am__repli" open={repli === 'modeles'} onToggle={surRepli('modeles')}>
              <summary>
                <h3>Modèles WhatsApp</h3>
                <span className="trc-am__resume"><b>{Object.keys(MODELES_DE_GERARD).length}</b> modèles · 7 + 1, et deux cartes</span>
              </summary>
              <p className="trc-ger__doux">Dans le gestionnaire WhatsApp de Meta, un modèle par ligne : le nom, la catégorie, le corps tel quel ({'{{1}}'}, {'{{2}}'}… sont les variables), le pied « {piedDeGerard} », et les boutons de réponse rapide.</p>
              <ul className="trc-ger__modeles">
                {Object.entries(MODELES_DE_GERARD).map(([cle, m]) => {
                  const bloc = `${m.nom}\n${m.categorie}${m.enTete === 'image' ? `\n\nEn-tête : image (la carte : ${IMAGE_DE_LA_CARTE})` : ''}\n\n${m.corps}\n\n${piedDeGerard}\n\nBoutons : ${m.boutons.join(' · ')}`;
                  return (
                    <li key={cle}>
                      <div><b>{m.nom}</b><small>{m.categorie === 'UTILITY' ? 'Utilitaire' : 'Marketing'}{m.enTete === 'image' ? ' · en-tête image, la carte' : ''} · {m.boutons.join(' · ')}</small></div>
                      <p className="trc-ger__texte">{m.corps}</p>
                      <button type="button" className="trc-ger__btn" onClick={() => copier(cle, bloc)}>{copie === cle ? 'Copié' : 'Copier'}</button>
                    </li>
                  );
                })}
              </ul>
              {/* LES DEUX MODÈLES DE L'ABONNÉE — 8 novembre 2026 (lot 4 de l'abonnement
                  refait, docs/modeles-whatsapp-abonnement.md). Ce ne sont pas des
                  messages de Perle, mais ils se déposent au même endroit, de la même
                  façon : la veille avec l'attention (rappels-j1, secret
                  WA_TEMPLATE_RAPPEL_ATTENTION) et la prochaine séance proposée après la
                  séance (déposée par le Trône quand la direction a noté ce modèle
                  « approuvé » dans « Ce que ça rapporte » › Les autres modèles de la
                  Maison). Le pied est DEVISE_COMPLETE, jamais recopié. */}
              <p className="trc-ger__doux">Les deux modèles de l’abonnée (8 novembre 2026) : la veille d’une séance de formule, et sa prochaine séance proposée après la séance. Utilitaires, le même pied. Le premier part dès que son secret est posé (WA_TEMPLATE_RAPPEL_ATTENTION) ; le second, dès que la direction le note « approuvé » dans « Ce que ça rapporte » › Ses modèles chez Meta › Les autres modèles de la Maison.</p>
              <ul className="trc-ger__modeles">
                {FICHES_DES_MODELES_DE_L_ABONNEE.map((m) => {
                  const cle = `abonnee-${m.nom}`;
                  const bloc = `${m.nom}\n${m.categorie}\n\n${m.corps}\n\n${piedDeGerard}${m.boutons.length ? `\n\nBoutons : ${m.boutons.join(' · ')}` : ''}${m.secret ? `\n\nSecret de fonction : ${m.secret} = ${m.nom}` : ''}`;
                  return (
                    <li key={cle}>
                      <div><b>{m.nom}</b><small>Utilitaire{m.boutons.length ? ` · ${m.boutons.join(' · ')}` : ' · sans bouton'}{m.secret ? ` · secret ${m.secret}` : ''}</small></div>
                      <p className="trc-ger__texte">{m.corps}</p>
                      <button type="button" className="trc-ger__btn" onClick={() => copier(cle, bloc)}>{copie === cle ? 'Copié' : 'Copier'}</button>
                    </li>
                  );
                })}
              </ul>
            </details>
          </>
        )}
      </div>

      {rdvPour && <RdvModal title="Poser le RDV" initial={{ clientId: rdvPour }} onClose={() => setRdvPour(null)} />}
      {aReposer && <RdvModal appt={aReposer} onClose={() => setAReposer(null)} />}
      {civilites && <FenetreDesCivilites onClose={() => setCivilites(false)} />}
      {carteDe && cerveau.clientDe(carteDe.clientId) && (
        <CarteModal client={cerveau.clientDe(carteDe.clientId)!} numero={cerveau.telDe(carteDe)} mot={carteDe.texte}
          onEnvoye={() => noteALaMain(carteDe)} onClose={() => setCarteDe(null)} />
      )}
    </div>
  );
}
