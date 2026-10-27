import { useEffect, useMemo, useState, type KeyboardEvent, type SyntheticEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { useStaff, type Staff } from '../../../../shared/auth';
import { DEVISE_COMPLETE } from '../../../../shared/identite';
import { prenomSeul } from '../../../../shared/civilite';
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
  filDeLaCliente, heureDite, jourDit, ligneALaMain, partSeule, planDuJour, servie,
  type FicheDeGerard, type Situation,
} from '../../../../shared/gerard-pur';
import { changeLePlafond, estActif, jamaisPourElle, metEnPause, reglagesLus, useReglagesDeGerard, type ReglagesDeGerard } from '../../../../shared/gerard';
import {
  GENRE_D_ATTENTE_DIT, attendUnHumain, fourchetteDite, francsEnJeu, fusionnePlanEtSalle, partiAujourdhui, porteeParCanal, tuilesDuJour,
  type EnvoiDuJour, type FrancsEnJeu, type LigneDuJour,
} from '../../../../shared/assistant-aujourdhui-pur';
import { CLE_DU_SERVEUR, serveurVivant, type EtatDuServeur } from '../../../../shared/assistant-passage-pur';
import { supabase } from '../../../../shared/supabase';
import type { Appointment } from '../../../../shared/agenda';
import { envoisStore, useAutoConfig, useEnvois } from '../equipe/data';
import { fabriqueLeCodeDe, useCerveauDeGerard, useLePassageDeGerard, type CerveauDeGerard } from './gerard-donnees';
import { gesteDeLaSalle } from './SalleDesEnvois';
import { RdvModal, apptTotalXof, tarifDeLaTeteXof, useBranchAppointments, useBranchClients, useServicesById } from './_shared';
import { PageHead } from '../_ui';
import { GerardEntreDeux } from './GerardEntreDeux';
import LesConversations from './LesConversations';
import LesAvis from './LesAvis';
import OffresEtRemises from './OffresEtRemises';
import CeQueCaRapporte from './CeQueCaRapporte';
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

/* ── LES CINQ VUES ──────────────────────────────────────────────────────── */
type Vue = 'aujourdhui' | 'conversations' | 'avis' | 'offres' | 'rapporte';
const VUES: readonly { cle: Vue; titre: string }[] = [
  { cle: 'aujourdhui', titre: 'Aujourd’hui' },
  { cle: 'conversations', titre: 'Les conversations' },
  { cle: 'avis', titre: 'Les avis' },
  { cle: 'offres', titre: 'Offres et remises' },
  { cle: 'rapporte', titre: 'Ce que ça rapporte' },
];
const vueLue = (x: string | null): Vue => (VUES.some((v) => v.cle === x) ? (x as Vue) : 'aujourdhui');
/** Les replis du bas d'Aujourd'hui (Entre deux séances, Ses règles, Ses modèles) : un seul ouvert à la fois. */
type Repli = 'entre-deux' | 'regles' | 'modeles';

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
  const appts = useBranchAppointments();
  const clients = useBranchClients();
  const byId = useServicesById();
  const [cfg] = useAutoConfig();
  const [messages] = useMessagesWa();
  const [prives] = useFilsPrives();
  const [archives] = useFilsArchives();
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
  /* Un verdict par ligne touchée (« Tout laisser partir » en rend plusieurs d'un coup). */
  const [verdicts, setVerdicts] = useState<Record<string, string>>({});
  const [repli, setRepli] = useState<Repli | null>(null);
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
  const tetes = useMemo(() => tetesDeLaMaison({ clientes: clients }), [clients]);
  const automates = useMemo(() => automatesDesFils(lignesDeLAutomate, reglageDeLAutomate(cfg.automateWa).pauseHeures), [lignesDeLAutomate, cfg.automateWa]);
  const fils = useMemo(
    () => filsDeLaMaison(messages, tetes, prives, tick, branch.id, automates).filter((f) => f.tiroir === 'clientes' && !estArchive(f, archives)),
    [messages, tetes, prives, tick, branch.id, automates, archives],
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
  const garder = plan.filter((s) => s.genre === 'garder').length;
  const sommeDesCreux = ctx.creux.reduce((s, j) => ({ manque: s.manque + j.manque, remises: s.remises + j.remises }), { manque: 0, remises: 0 });

  /* UN TOUCHER : le message s'ouvre dans WhatsApp, déjà écrit ; il est noté au journal, et son code fabriqué. */
  const noteALaMain = (s: Situation) => {
    const c = cerveau.clientDe(s.clientId);
    const maintenant = Date.now();
    const codePromo = fabriqueLeCodeDe(s, { branchId: branch.id, nom: c?.name ?? '', maintenantMs: maintenant });
    const ligne = ligneALaMain(s, {
      branchId: branch.id, aujourdhui: ctx.aujourdhui, maintenantIso: new Date(maintenant).toISOString(), prenom: prenomSeul(c?.name),
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
  /* TOUT LAISSER PARTIR (spec §9, les quatre touchers du matin ; 27 octobre
     2026) : chaque notification Ma Couronne du jour encore en salle ou retenue
     part à l'instant, par le même geste que la ligne, une écriture
     conditionnelle et un verdict par ligne ; jamais par le magasin. */
  const partantes = fusion.lignes.filter((l) => l.envoi && l.canal === 'couronne' && (l.etat === 'en-salle' || l.etat === 'retenue'));
  const toutLaisserPartir = async () => { for (const l of partantes) await geste(l, 'envoyer'); };
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
  const compteDeLaVue = (cle: Vue): { n: string; ton: string } | null => {
    if (cle === 'aujourdhui') return fusion.resume.lignes ? { n: String(fusion.resume.lignes), ton: 'indigo' } : null;
    if (cle === 'conversations') return humain.total ? { n: String(humain.total), ton: 'terre' } : null;
    if (cle === 'avis') return aRelire ? { n: String(aRelire), ton: 'or' } : null;
    if (cle === 'offres') return { n: `${plafond.faites} / ${plafond.remisesParSemaine}`, ton: 'cuivre' };
    return null;
  };
  const ouiDit = (() => {
    const o = tuiles.oui;
    const parts: string[] = [];
    if (o.whatsapp.n) parts.push(`${o.whatsapp.n} WhatsApp en un geste`);
    if (o.bilans) parts.push(`${o.bilans} bilan${o.bilans > 1 ? 's' : ''} à remettre`);
    if (o.avis) parts.push(`${o.avis} réponse${o.avis > 1 ? 's' : ''} à un avis`);
    if (o.offresFlash) parts.push(`${o.offresFlash} offre flash`);
    return parts.length ? `oui attendus · ${parts.join(', ')}` : 'oui attendus · rien à trancher';
  })();
  const propsDesVues: PropsDUneVue = { cerveau, reglages, moi };

  return (
    <div className="trc-ger trc-am">
      <PageHead
        eyebrow="Clientèle · Assistant Maison"
        title="Assistant Maison."
        actions={(
          <div className="trc-ger__chiffres">
            <span className="trc-ger__chiffre"><b>{plan.length}</b><small>à écrire aujourd’hui</small></span>
            <span className="trc-ger__chiffre"><b>{parti.compte.partis}</b><small>partis aujourd’hui</small></span>
            <span className="trc-ger__chiffre"><b>{garder}</b><small>RDV à garder</small></span>
            <span className="trc-ger__chiffre"><b>{plafond.faites} / {plafond.remisesParSemaine}</b><small>remises de la semaine</small></span>
            <span className="trc-ger__chiffre"><b>{francsDits(plafond.francs)}</b><small>sur {francsDits(plafond.plafondFrancs)}</small></span>
          </div>
        )}
      />

      {/* LA BARRE DES CINQ VUES, collante : elle nomme ce qu'on règle et compte ce qui attend. */}
      <div className="trc-am__vues" role="tablist" aria-label="Les vues de l’Assistant" onKeyDown={surLesTouches}>
        {VUES.map((v) => {
          const choisi = vue === v.cle;
          const compte = compteDeLaVue(v.cle);
          return (
            <button key={v.cle} type="button" role="tab" id={`am-ong-${v.cle}`} aria-selected={choisi} aria-controls={`am-vue-${v.cle}`}
              tabIndex={choisi ? 0 : -1} className={choisi ? 'est-choisi' : ''} onClick={() => versLaVue(v.cle)}>
              {v.titre}
              {compte && <span className={`trc-am__n trc-am__n--${compte.ton}`}>{compte.n}</span>}
            </button>
          );
        })}
      </div>

      <div className="trc-am__vue" role="tabpanel" id={`am-vue-${vue}`} aria-labelledby={`am-ong-${vue}`}>
        {vue === 'conversations' && <LesConversations {...propsDesVues} />}
        {vue === 'avis' && <LesAvis {...propsDesVues} />}
        {vue === 'offres' && <OffresEtRemises {...propsDesVues} />}
        {vue === 'rapporte' && <CeQueCaRapporte {...propsDesVues} />}
        {vue === 'aujourdhui' && (
          <>
            {/* LES CINQ TUILES : prêts, oui attendus, humain, remises de la semaine, francs en jeu (calibre + fourchette). */}
            <div className="trc-am__tuiles">
              <div className="trc-am__tuile trc-am__tuile--indigo">
                <b>{actif ? tuiles.prets.total : tuiles.prets.enPause}</b>
                <span>{actif ? `partent aujourd’hui · Ma Couronne ${tuiles.prets.couronne}, WhatsApp ${tuiles.prets.whatsapp}` : `prêts, en pause · Ma Couronne ${fusion.resume.couronne}, WhatsApp ${fusion.resume.whatsapp}`}</span>
              </div>
              <div className="trc-am__tuile trc-am__tuile--cuivre"><b>{tuiles.oui.total}</b><span>{ouiDit}</span></div>
              <div className={`trc-am__tuile trc-am__tuile--terre${tuiles.humain.sante ? ' est-alarme' : ''}`}>
                <b>{tuiles.humain.total}</b><span>attendent un humain · Santé {tuiles.humain.sante}</span>
              </div>
              <div className="trc-am__tuile trc-am__tuile--cuivre">
                <b>{tuiles.remises.faites} <small>/ {tuiles.remises.sur}</small></b>
                <span>remises cette semaine · {francsDits(tuiles.remises.francs)} sur {francsDits(tuiles.remises.plafondFrancs)}</span>
                <div className="trc-am__barre" aria-hidden="true"><i style={{ width: `${tuiles.remises.pct}%` }} /></div>
              </div>
              <div className="trc-am__tuile trc-am__tuile--or">
                <b>{tuiles.francs ? enFrancs(tuiles.francs.calibre) : '0 F'}</b>
                <span>{tuiles.francs ? `en jeu aujourd’hui · ${fourchetteDite(tuiles.francs)}` : 'en jeu aujourd’hui · aucun chiffre sûr'}</span>
              </div>
            </div>

            <div className="trc-ger__etat" role="note">
              <b>{actif ? 'Actif' : 'Pause'}.</b>
              {!actif
                ? <span>Il prépare son plan, il n’écrit à personne.</span>
                : <span>Chaque jour, quand la direction ouvre le Trône entre 8 h et 20 h, Gérard dépose les notifications Ma Couronne de son plan ; le facteur les porte, jamais entre 20 h et 8 h. WhatsApp : « Envoyer sur WhatsApp », un toucher par cliente, jusqu’à l’approbation de ses modèles chez Meta ; approuvé, le modèle part seul au passage du matin.{reglages.dernierPassage ? ` Dernier passage : ${reglages.dernierPassage === ctx.aujourdhui ? 'aujourd’hui' : jourDit(reglages.dernierPassage)}.` : ''}</span>}
              {/* QUI FAIT LE PASSAGE (lot 2) : la fonction serveur si elle a parlé depuis moins de 26 h, sinon le Trône.
                  Rien tant que le document n'est pas lu : pas de fausse phrase le temps d'un chargement. */}
              {etatServeur !== undefined && (
                <span className="trc-am__portee">
                  Passage du matin : {serveurVit ? 'la fonction serveur' : 'par le Trône (fonction pas encore collée)'}
                  {etatServeur?.passageLe ? ` · dernier passage ${jourDit(etatServeur.passageLe)}` : ''}
                </span>
              )}
              <span className="trc-am__portee">Portée du jour : <b>{portee.joignables}</b> cliente{portee.joignables > 1 ? 's' : ''} joignable{portee.joignables > 1 ? 's' : ''} · Ma Couronne {portee.couronne} · WhatsApp {portee.whatsapp}</span>
            </div>

            {/* PART AUJOURD'HUI : le plan du jour, ligne par ligne, avec ce que la salle en sait. Un panneau ouvert à la fois. */}
            <section className="trc-ger__carte">
              <div className="trc-ger__haut">
                <h3>Part aujourd’hui <span>le plan du jour, avec la salle d’attente</span></h3>
                <span className="trc-am__resume">
                  <b>{fusion.resume.lignes}</b> ligne{fusion.resume.lignes > 1 ? 's' : ''} · Ma Couronne {fusion.resume.couronne} · WhatsApp {fusion.resume.whatsapp}
                  {' · '}{fusion.resume.remises} remise{fusion.resume.remises > 1 ? 's' : ''} ({plafond.faites} / {plafond.remisesParSemaine} cette semaine)
                  {fusion.resume.francs ? ` · ${fourchetteDite(fusion.resume.francs)}` : ''}
                </span>
              </div>
              {partantes.length > 0 && (
                <div className="trc-am__gestes">
                  <button type="button" className="trc-ger__btn trc-ger__btn--cuivre" onClick={() => { void toutLaisserPartir(); }}>Tout laisser partir ({partantes.length})</button>
                </div>
              )}
              {fusion.lignes.length === 0 && <p className="trc-ger__vide">Plus rien à écrire aujourd’hui : chaque cliente est entre deux messages.</p>}
              <ul className="trc-ger__liste">
                {fusion.lignes.map((l) => {
                  const s = l.situation;
                  const f = ficheDe.get(s.clientId);
                  const nom = nomDe(s.clientId);
                  const ouvert = ouverte === s.clientId;
                  const modele = MODELES_DE_GERARD[s.modele];
                  const tel = lienTel(cerveau.clientDe(s.clientId)?.phone);
                  const enSalle = l.etat === 'en-salle' || l.etat === 'retenue';
                  /* Garder son RDV : la ligne dit lequel, avec l'année (maquette l.374). */
                  const rdv = s.genre === 'garder' ? cerveau.rdvAGarder(s.clientId) : undefined;
                  return (
                    <li key={s.clientId} className={`trc-ger__rangee${ouvert ? ' est-ouverte' : ''}`}>
                      <button type="button" className="trc-ger__ligne trc-am__ligne" aria-expanded={ouvert} onClick={() => setOuverte(ouvert ? null : s.clientId)}>
                        <span className={`trc-am__avatar${s.canal === 'whatsapp' ? ' trc-am__avatar--cuivre' : ''}`} aria-hidden="true">{initiales(nom)}</span>
                        {/* La remise se dit une fois sur la ligne, dans la colonne du canal (« −15 % · jour creux »). */}
                        <span className="trc-ger__qui">{nom}</span>
                        <span className={`trc-ger__genre trc-ger__genre--${s.genre}`}>{GENRE_DIT[s.genre]}{s.envie ? ` · ${ENVIE_DITE[s.envie]}` : ''}{rdv ? ` · ${jourDit(rdv.date)}, ${heureDite(rdv.time)}` : ''}</span>
                        <span className="trc-ger__canal">{canalDuPlan(s.canal)}{s.code ? ` · ${codeDit(s)}` : ''}</span>
                        <span className="trc-am__droite">
                          <b>{l.francs ? `≈ ${enFrancs(l.francs.calibre)}` : 'sans chiffre'}</b>
                          <small className={l.etat === 'ecartee' || l.etat === 'perimee' || l.etat === 'echec' ? 'trc-am__alarme' : ''}>{l.depart}</small>
                        </span>
                      </button>
                      {ouvert && f && (
                        <div className="trc-ger__panneau">
                          <div className="trc-ger__message">
                            <div className="trc-ger__bulle">
                              <span className="trc-ger__texte">{s.texte}</span>
                              {modele.boutons.length > 0 && <span className="trc-ger__boutons">{modele.boutons.map((b) => <i key={b}>{b}</i>)}</span>}
                              <span className="trc-ger__pied">{piedDeGerard}</span>
                            </div>
                            <small className="trc-ger__doux">
                              Modèle {modele.nom} · {modele.categorie === 'UTILITY' ? 'utilitaire' : 'marketing'} · {canalDuPlan(s.canal)} · {l.depart}
                              {l.francs ? ` · ${fourchetteDite(l.francs)}` : ''}{l.codePromo ? ` · code ${l.codePromo}` : ''}
                            </small>
                            <div className="trc-am__gestes">
                              {/* LOT 2 : un modèle approuvé chez Meta part seul au passage du matin (`partSeule`) ; le
                                  bouton se tait, sinon le message partirait deux fois. Pas approuvé : un toucher par cliente. */}
                              {s.canal === 'whatsapp' && partSeule(s, reglages) && (
                                <em className="trc-am__puce trc-am__puce--cuivre">Part seul sur WhatsApp au passage du matin</em>
                              )}
                              {s.canal === 'whatsapp' && servie(reglages, s.clientId) && !partSeule(s, reglages) && (() => {
                                const lien = lienWaMe(cerveau.clientDe(s.clientId)?.phone, `${s.texte}\n${DEVISE_COMPLETE}`);
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
                              {/* JAMAIS POUR ELLE (direction) : s'écrit dans ses réglages, `jamais[clientId]`
                                  (gerard.ts, lot 2), et la situation sort de son plan. « Pas maintenant »
                                  n'a toujours pas de porte serveur pour `reponse` sur la ligne envois :
                                  pas de bouton mort à sa place (27 octobre 2026). */}
                              {direction && (
                                <button type="button" className="trc-ger__btn trc-am__btn--calme"
                                  title={`Il ne lui écrira plus jamais « ${GENRE_DIT[s.genre]} » ; noté dans ses réglages.`}
                                  onClick={() => { jamaisPourElle(s.clientId, s.genre, true, moi?.name ?? 'La direction'); toast(`Noté : plus jamais « ${GENRE_DIT[s.genre]} » pour ${nom}.`); }}>
                                  Jamais pour elle
                                </button>
                              )}
                            </div>
                            {l.envoi && verdicts[l.envoi.id] && <small className="trc-ger__doux">{verdicts[l.envoi.id]}</small>}
                            {s.canal === 'couronne' && actif && l.etat === 'pas-encore' && <small className="trc-ger__doux">Notification Ma Couronne : elle part au passage du jour.</small>}
                          </div>
                          <div className="trc-ger__pourquoi">
                            <h4 className="trc-am__sous">Pourquoi il lui écrit <span>lu sur sa fiche</span></h4>
                            <ul className="trc-am__puces">
                              {s.pourquoi.map(([k, v]) => <li key={k}><span className="trc-am__cle">{k}</span> <span>{v}</span></li>)}
                            </ul>
                            <LeFil fiche={f} aujourdhui={ctx.aujourdhui} />
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>

            <div className="trc-ger__deux trc-am__deux">
              {/* ATTEND UN OUI : des cartes, une par décision. Aucune carte factice : sans proposition, une phrase. */}
              <section className="trc-ger__carte">
                <h3>Attend un oui <span>{tuiles.oui.total} décision{tuiles.oui.total > 1 ? 's' : ''}</span></h3>
                {tuiles.oui.total === 0 && (
                  <p className="trc-ger__doux">Rien n’attend votre oui : {actif ? 'aucun WhatsApp à un toucher' : 'l’Assistant est en pause'}, aucune offre flash proposée, aucun bilan à remettre, aucune réponse à un avis à relire.</p>
                )}
                <div className="trc-am__cartes">
                  {tuiles.oui.whatsapp.n > 0 && (
                    <div className="trc-am__carte trc-am__carte--cuivre">
                      <span className="trc-am__sur">{tuiles.oui.whatsapp.n} WhatsApp à un toucher</span>
                      <b>{tuiles.oui.whatsapp.francs ? fourchetteDite(tuiles.oui.whatsapp.francs) : 'sans chiffre'}</b>
                      <p>{tuiles.oui.whatsapp.clientIds.map(nomDe).filter(Boolean).join(', ')} : à un toucher tant que le modèle Meta n’est pas approuvé.</p>
                      <div className="trc-am__gestes"><button type="button" className="trc-ger__btn trc-ger__btn--cuivre" onClick={() => setOuverte(tuiles.oui.whatsapp.clientIds[0] ?? null)}>Ouvrir la première</button></div>
                    </div>
                  )}
                  {tuiles.oui.bilans > 0 && (
                    <div className="trc-am__carte">
                      <span className="trc-am__sur">Bilans à remettre</span>
                      <b>{tuiles.oui.bilans}</b>
                      <p>séance{tuiles.oui.bilans > 1 ? 's' : ''} honorée{tuiles.oui.bilans > 1 ? 's' : ''} sans bilan sur 30 jours.</p>
                      <div className="trc-am__gestes"><Link className="trc-ger__btn" to="/customers?focus=bilans">Voir les séances</Link></div>
                    </div>
                  )}
                  {tuiles.oui.avis > 0 && (
                    <div className="trc-am__carte trc-am__carte--or">
                      <span className="trc-am__sur">Réponses à un avis</span>
                      <b>{tuiles.oui.avis}</b>
                      <p>prête{tuiles.oui.avis > 1 ? 's' : ''} à relire avant publication.</p>
                      <div className="trc-am__gestes"><button type="button" className="trc-ger__btn" onClick={() => versLaVue('avis')}>Relire</button></div>
                    </div>
                  )}
                </div>
                {tuiles.oui.total > 0 && <p className="trc-ger__doux">Offre flash : aucune proposition (la mécanique arrive au lot 5).</p>}
              </section>

              {/* ATTEND UN HUMAIN : Santé d'abord, puis À voir, la question franche, le reste. Chaque ligne ouvre Les conversations. */}
              <section className="trc-ger__carte">
                <div className="trc-ger__haut">
                  <h3>Attend un humain <span>Santé sous 24 h · À voir sous 48 h</span></h3>
                  <span className="trc-am__resume"><b>{humain.total}</b> · Santé {humain.sante}</span>
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
              </section>
            </div>

            {/* CE QUI EST PARTI AUJOURD'HUI, tous types, à l'heure de Cotonou. Ouvert dès qu'une ligne est partie. */}
            <details className="trc-ger__carte trc-am__repli" open={parti.lignes > 0}>
              <summary>
                <h3>Aujourd’hui <span>ce qui est parti</span></h3>
                <span className="trc-am__resume">
                  <b>{parti.lignes}</b> ligne{parti.lignes > 1 ? 's' : ''} · remis {parti.compte.remis} · lu {parti.compte.lus}
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
                        return (
                          <tr key={r.cle}>
                            <td>{r.heure}</td>
                            <td>{r.quoi}</td>
                            <td><span className={`trc-am__puce trc-am__puce--${puce.ton}`}>{puce.dit}</span></td>
                            <td className="d">{r.lignes}</td>
                            <td>{r.devenu}{r.motifs.length ? <small className="trc-am__alarme"> · {r.motifs.join(' · ')}</small> : null}</td>
                            {/* La remise à son nom : le code né au départ réel, « à fabriquer au départ » en attendant (`codeDeLaLigne`). */}
                            <td>{r.codes.join(', ')}</td>
                            <td className="trc-am__noms">{noms.length > 8 ? `${noms.slice(0, 8).join(', ')} et ${noms.length - 8} autres` : noms.join(', ')}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </details>

            {/* LES JOURS CREUX, repliés : le manque sous l'ordinaire, les remises ouvertes, à qui une place est proposée. */}
            <details className="trc-ger__carte trc-am__repli">
              <summary>
                <h3>Les jours creux <span>de 3 à 7 jours</span></h3>
                <span className="trc-am__resume">
                  <b>{ctx.creux.length}</b> jour{ctx.creux.length > 1 ? 's' : ''} · {sommeDesCreux.manque} place{sommeDesCreux.manque > 1 ? 's' : ''} manquante{sommeDesCreux.manque > 1 ? 's' : ''} · {sommeDesCreux.remises} remise{sommeDesCreux.remises > 1 ? 's' : ''} ouverte{sommeDesCreux.remises > 1 ? 's' : ''}
                </span>
              </summary>
              <p className="trc-ger__doux">Un jour est creux quand ses RDV posés sont sous l’ordinaire de ce jour de la semaine (les Prévisions). L’Assistant y ouvre autant de remises de {REMISE_CREUX_PCT} % qu’il manque de RDV, dans le plafond de la semaine, d’abord aux clientes en retard.</p>
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

            <section className="trc-ger__carte">
              <h3>Son réglage <span>Pause ou Actif</span></h3>
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
              <p className="trc-ger__doux">
                Cette semaine : {plafond.faites} remise{plafond.faites > 1 ? 's' : ''} à son nom, {francsDits(plafond.francs)} engagés (jour creux, anniversaire, offre flash et remises de la direction comptent ensemble). À l’une des deux bornes, plus aucune remise : il écrit sans elle.
              </p>
            </section>

            {/* ENTRE DEUX SÉANCES, SES RÈGLES, SES MODÈLES : repliés, un seul ouvert (relecture du
                27 octobre 2026 : la vue d'entrée les dépliait tous, et « Ce que ça rapporte » les
                porte déjà). Le réglage Pause / Actif reste déplié au-dessus : le banc de Gérard
                touche ses boutons, qu'un repli fermé cacherait. */}
            <details className="trc-ger__carte trc-am__repli trc-am__repli--hote" open={repli === 'entre-deux'} onToggle={surRepli('entre-deux')}>
              <summary>
                <h3>Entre deux séances <span>ce que l’Assistant en sait</span></h3>
                <span className="trc-am__resume"><b>{soucisOuverts}</b> souci{soucisOuverts > 1 ? 's' : ''} ouvert{soucisOuverts > 1 ? 's' : ''}</span>
              </summary>
              <GerardEntreDeux />
            </details>

            <details className="trc-ger__carte trc-am__repli" open={repli === 'regles'} onToggle={surRepli('regles')}>
              <summary>
                <h3>Ses règles <span>vos choix du 26 octobre 2026</span></h3>
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
                <h3>Ses modèles chez Meta <span>à déposer maintenant : l’approbation prend du temps</span></h3>
                <span className="trc-am__resume"><b>{Object.keys(MODELES_DE_GERARD).length}</b> modèles · 7 + 1</span>
              </summary>
              <p className="trc-ger__doux">Dans le gestionnaire WhatsApp de Meta, un modèle par ligne : le nom, la catégorie, le corps tel quel ({'{{1}}'}, {'{{2}}'}… sont les variables), le pied « {piedDeGerard} », et les boutons de réponse rapide.</p>
              <ul className="trc-ger__modeles">
                {Object.entries(MODELES_DE_GERARD).map(([cle, m]) => {
                  const bloc = `${m.nom}\n${m.categorie}\n\n${m.corps}\n\n${piedDeGerard}\n\nBoutons : ${m.boutons.join(' · ')}`;
                  return (
                    <li key={cle}>
                      <div><b>{m.nom}</b><small>{m.categorie === 'UTILITY' ? 'Utilitaire' : 'Marketing'} · {m.boutons.join(' · ')}</small></div>
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
    </div>
  );
}
