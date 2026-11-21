import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic } from 'lucide-react';
import { PageHead } from '../_ui';
import { Button } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { useStaff } from '../../../../shared/auth';
import { createStore, uid, useStore } from '../../../../shared/store';
import { demandeAClaude, versionDeIaMaison } from '../../../../shared/ia-maison';
import { dollarsDits, saitInternet, saitLeTableauIntelligent, type MessageIa, type SourceInternet } from '../../../../shared/ia-maison-pur';
import {
  QUESTIONS_PROPOSEES, consigneDeLaDirection, deQui, demandeDInternet, demandeDeLaReponse, demandeDuPlan, dernierMessageDElle, ecransLus, estUnAvisDifficile, etoilesDites, momentDit, planLu, refusDeLAvis, refusDuMessage, reperesDeTemps, reponsePropre, resteAPreparer, sourcesPropres,
  type AvisDemande, type FaitLu, type MessageDemande,
} from '../../../../shared/perle-pur';
import { prenomDeLAuteur } from '../../../../shared/ia-avis-pur';
import { SCHEMA_DE_LA_REPONSE, consigneDeLaReponse, lectureDeLaReponse } from '../../../../shared/ia-reponse-wa-pur';
import { cheminDeLaConversation } from '../../../../shared/conversations';
import { signeLeMessage } from '../../../../shared/identite';
import { momentDuSalon } from '../../../../shared/calendrier';
import { heureEnClair } from '../../../../shared/cloture-du-jour-pur';
import { dateDite } from '../../../../shared/ia-fiche-du-jour-pur';
import { usePerle } from './perle-donnees';
import './demander-a-perle.css';

/* ══ DEMANDER À PERLE — 21 novembre 2026 ═════════════════════════════════
   Maquette 7XvdzJ99bioQsv62r5cBrw (« Construis, la direction seule,
   questions et En direct d'abord »). À gauche la conversation : une
   question, écrite ou dictée, et la réponse de Perle avec les faits que le
   Trône vient de lire, les écrans d'où ils viennent, et ce que la réponse a
   coûté. À droite « En direct », que le Trône calcule seul, sans IA.

   PREMIER LOT : ELLE LIT ET RÉPOND. Aucun bouton ici n'envoie un message, ne
   pose un rendez-vous ni ne touche à l'argent : ils ouvrent des écrans.

   SECOND LOT (21 novembre 2026, « oui internet et le second lot ») : ELLE
   PRÉPARE UNE RÉPONSE À UNE CLIENTE. « Réponds à Awa que jeudi 10 h est
   libre » : le Trône retrouve le fil, vérifie la place au Carnet, et Claude
   écrit par la porte des réponses qui existait (`reponse-wa`, la voix de la
   Maison, le contexte de `contexte-de-la-reponse`). Le brouillon se montre
   ici, avec son dernier message à elle. RIEN NE PART D'ICI : « Ouvrir dans la
   conversation » le pose, signé de la devise par le code, dans la zone de
   saisie du fil, où « Envoyer » reste le seul bouton de départ (la fenêtre
   de 24 heures, la pause d'Opale et la retenue y restent juges).

   La conversation reste sur ce poste, une liste par personne, jamais reliée
   au serveur (comme « Rechercher ») : la direction y écrit des noms. */

/** Une réponse préparée : le fil qu'elle vise, ce qu'elle a écrit en dernier,
    le brouillon, et ce que le Carnet dit de la place promise. */
type Brouillon = {
  numero: string; nom: string; dernier: string; quandDernier: string; texte: string;
  /** Ce que la direction a demandé de dire, et la place citée : « Une autre » les redit. */
  consigne?: string; jour?: string; heure?: string;
  verif?: { ok: boolean; dit: string };
  etat?: 'ouvert' | 'ecarte';
};
type Echange = {
  id: string; question: string; reponse: string; ecrans: { nom: string; chemin: string }[]; quand: string; coutUsd?: number;
  /** Cherchée sur internet (21 novembre 2026) : ses sources, et la réponse coupée si elle l'a été. */
  internet?: boolean; sources?: SourceInternet[]; coupee?: boolean;
  brouillon?: Brouillon;
  /** Une réponse préparée à un avis Google : l'avis, et le brouillon tel que Perle l'a rangé dans Les avis Google. */
  avis?: { cle: string; auteur: string; note: number; texte: string; quand?: string; reponse: string };
};
/** « 14 h 02 », ou « 20 novembre 2026, 18 h 40 » un autre jour : à l'heure de Cotonou. */
const quandDit = (iso: string, aujourdhui: string): string => {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const m = momentDuSalon(t);
  return `${m.jour === aujourdhui ? '' : `${dateDite(m.jour)}, `}${heureEnClair(m.minutes)}`;
};
const ECHANGES_GARDES = 30;
const SIGNES_MAX = 1200;
const filDePerleStore = createStore<Record<string, Echange[]>>('mnd_perle_fil', {});

/** La reconnaissance vocale du navigateur (celle de Perle au comptoir) : le micro n'apparaît pas sans elle. */
type Reconnaissance = {
  lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null; onerror: (() => void) | null;
};
const creeLaReconnaissance = (): Reconnaissance | null => {
  const w = window as unknown as { SpeechRecognition?: new () => Reconnaissance; webkitSpeechRecognition?: new () => Reconnaissance };
  const Classe = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Classe ? new Classe() : null;
};

/** La réponse, en paragraphes ; les lignes qui commencent par un tiret font une liste. */
function Reponse({ texte }: { texte: string }) {
  const blocs: ({ genre: 'p'; texte: string } | { genre: 'liste'; lignes: string[] })[] = [];
  for (const brute of texte.split('\n')) {
    const ligne = brute.trim();
    if (!ligne) continue;
    const item = /^[-•]\s+(.*)$/.exec(ligne);
    const dernier = blocs[blocs.length - 1];
    if (item) {
      if (dernier?.genre === 'liste') dernier.lignes.push(item[1]);
      else blocs.push({ genre: 'liste', lignes: [item[1]] });
    } else blocs.push({ genre: 'p', texte: ligne });
  }
  return (
    <>
      {blocs.map((b, i) => (b.genre === 'p'
        ? <p key={i}>{b.texte}</p>
        : <ul key={i}>{b.lignes.map((l, k) => <li key={k}>{l}</li>)}</ul>))}
    </>
  );
}

export default function DemanderAPerle() {
  const { branch } = useBranch();
  const moi = useStaff();
  const navigate = useNavigate();
  const perle = usePerle();
  const [fils, setFils] = useStore(filDePerleStore);
  const cle = moi?.user_id ?? '';
  const fil = fils[cle] ?? [];
  const [question, setQuestion] = useState('');
  const [enCours, setEnCours] = useState('');
  const [refus, setRefus] = useState('');
  const [claude, setClaude] = useState<boolean | null>(null);
  /* Internet ne se propose que si la fonction posée sait chercher. */
  const [internet, setInternet] = useState(false);
  const [ecoute, setEcoute] = useState(false);
  const reco = useRef<Reconnaissance | null>(null);
  const bas = useRef<HTMLDivElement | null>(null);
  /* Le micro ne se montre que si le navigateur sait écouter (lu une fois). */
  const [aLeMicro] = useState(() => {
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    return !!(w.SpeechRecognition ?? w.webkitSpeechRecognition);
  });

  useEffect(() => { let v = true; void versionDeIaMaison().then((x) => { if (v) { setClaude(saitLeTableauIntelligent(x)); setInternet(saitInternet(x)); } }); return () => { v = false; }; }, []);
  useEffect(() => () => { reco.current?.stop(); }, []);
  useEffect(() => { bas.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [fil.length, enCours]);

  const direction = moi?.role === 'souverain' || moi?.role === 'gerant';
  if (!direction) {
    return (
      <div className="trp-perle">
        <PageHead eyebrow={`Le Trône · ${branch.city}`} title="Demander à Perle" sub="Cet écran est réservé à la direction." />
      </div>
    );
  }

  const garde = (e: Echange) => setFils((tous) => ({ ...tous, [cle]: [...(tous[cle] ?? []), e].slice(-ECHANGES_GARDES) }));
  const change = (id: string, f: (e: Echange) => Echange) => setFils((tous) => ({ ...tous, [cle]: (tous[cle] ?? []).map((e) => (e.id === id ? f(e) : e)) }));

  /* ── PRÉPARER UNE RÉPONSE À UNE CLIENTE (second lot) ──────────────────
     Le fil se retrouve, la place citée se vérifie au Carnet, Claude écrit par
     la porte des réponses, et le brouillon se montre. RIEN NE PART D'ICI. */
  /* Un brouillon écarté ne compte plus : la conversation attend toujours, elle se prépare de nouveau. */
  const dejaPrepares = fil.flatMap((e) => (e.brouillon && e.brouillon.etat !== 'ecarte' ? [e.brouillon.numero] : []));
  const aPreparer = resteAPreparer(perle.enAttente, dejaPrepares);
  const prepare = async (o: { question: string; demande: MessageDemande; coutDAvant?: number; remplace?: Echange }): Promise<boolean> => {
    const quand = new Date().toISOString();
    const dit = (reponse: string, ecrans: Echange['ecrans']) => {
      garde({ id: uid(), question: o.question, reponse, ecrans, quand, coutUsd: o.coutDAvant });
      return true;
    };
    /* « Une autre » vise le même fil ; sinon c'est le Trône qui le retrouve. */
    const ancien = o.remplace?.brouillon;
    const duBrouillon = ancien ? perle.filDuNumero(ancien.numero) : undefined;
    const r = ancien ? (duBrouillon ? { etat: 'trouve' as const, fil: duBrouillon } : { etat: 'aucune' as const }) : perle.filDe(o.demande, o.question, dejaPrepares);
    if (r.etat !== 'trouve') return dit(refusDuMessage(r, o.demande.cliente), [{ nom: 'Conversations', chemin: '/conversations' }]);
    const f = r.fil;
    const qui = perle.quiEst(f);
    const chemin = cheminDeLaConversation(f.numero) ?? '/conversations';
    const dernier = dernierMessageDElle(f.messages);
    if (!dernier) return dit(`${qui} n’a encore rien écrit à la Maison : il n’y a pas de message auquel répondre.`, [{ nom: 'sa conversation', chemin }]);
    /* Fenêtre fermée : un texte libre ne partirait pas. On ne dépense rien à l'écrire. */
    if (!f.fenetre.ouverte) return dit(`La fenêtre de 24 heures de ${qui} est fermée : un texte libre ne peut plus partir, seulement un modèle approuvé. Ouvrez sa conversation pour en choisir un.`, [{ nom: 'sa conversation', chemin }]);
    const verdict = perle.placeAuCarnet(o.demande.jour, o.demande.heure);
    /* La place ne part dans le contexte que si le Carnet la montre libre, et à partir de demain (comme le site). */
    const places = verdict?.etat === 'libre' && verdict.jour > perle.jour ? [{ iso: verdict.jour, heures: [{ heure: verdict.heure }] }] : undefined;
    const consigne = perle.pourClaude(o.demande.consigne);
    setEnCours(`Perle écrit la réponse pour ${qui}`);
    const r2 = await demandeAClaude<{ reponse?: unknown }>({
      chantier: 'reponse-wa', usage: 'texte', systeme: consigneDeLaReponse(),
      messages: [{
        role: 'user',
        content: perle.contexteDuFil(f, { places, dejaProposee: ancien?.texte })
          + reperesDeTemps({ dernierLe: momentDuSalon(Date.parse(dernier.quand)), maintenant: { jour: perle.jour, minutes: perle.minutes } })
          + consigneDeLaDirection(consigne),
      }],
      schema: SCHEMA_DE_LA_REPONSE,
      maxTokens: 300,
    });
    if (!r2.ok) { setRefus(r2.message); return false; }
    const texteDuBrouillon = lectureDeLaReponse(r2.data);
    if (!texteDuBrouillon) { setRefus('Perle n’a rien écrit d’envoyable (un numéro, un mot banni, ou rien du tout) : redemandez, ou écrivez dans la conversation.'); return false; }
    const brouillon: Brouillon = {
      numero: f.numero, nom: f.nom, dernier: dernier.texte, quandDernier: dernier.quand, texte: texteDuBrouillon,
      ...(o.demande.consigne ? { consigne: o.demande.consigne } : {}),
      ...(o.demande.jour && o.demande.heure ? { jour: o.demande.jour, heure: o.demande.heure } : {}),
      ...(verdict ? { verif: { ok: verdict.etat === 'libre', dit: verdict.dit } } : {}),
    };
    const reponse = `J’ai préparé une réponse pour ${qui} : elle se relit et s’envoie depuis sa conversation.`;
    if (o.remplace) change(o.remplace.id, (e) => ({ ...e, reponse, brouillon, coutUsd: (e.coutUsd ?? 0) + r2.coutUsd }));
    else garde({ id: uid(), question: o.question, reponse, ecrans: [], quand, coutUsd: (o.coutDAvant ?? 0) + r2.coutUsd, brouillon });
    return true;
  };
  /** Un geste qui prépare (« Une autre », « La suivante », le fil En direct) : un seul à la fois. */
  const lance = async (o: Parameters<typeof prepare>[0]) => {
    if (enCours) return;
    reco.current?.stop();
    setRefus('');
    setEnCours('Perle lit la conversation…');
    try { await prepare(o); } finally { setEnCours(''); }
  };
  /** LE SEUL CHEMIN DU BROUILLON : la zone de saisie de la conversation, signé
      de la devise par le code. Ce bouton n'envoie rien : « Envoyer » est là-bas. */
  const ouvreLeBrouillon = (e: Echange) => {
    if (!e.brouillon) return;
    const chemin = cheminDeLaConversation(e.brouillon.numero, signeLeMessage(e.brouillon.texte));
    if (!chemin) return;
    change(e.id, (x) => (x.brouillon ? { ...x, brouillon: { ...x.brouillon, etat: 'ouvert' } } : x));
    navigate(chemin);
  };

  /* ── PRÉPARER LA RÉPONSE À UN AVIS GOOGLE (second lot) ────────────────
     L'avis se retrouve, Claude écrit par le geste de l'écran des avis, et le
     brouillon se range dans Les avis Google : c'est LÀ qu'il se relit et se
     publie. RIEN N'EST PUBLIÉ D'ICI ; Perle n'écarte ni ne colle rien. */
  const avisMontres = fil.flatMap((e) => (e.avis ? [e.avis.cle] : []));
  const avisAPreparer = perle.avisAPreparer(avisMontres);
  const cheminDeLAvis = (cleDeLAvis: string) => `/avis-google?avis=${encodeURIComponent(cleDeLAvis)}`;
  const prepareLAvis = async (o: { question: string; demande: AvisDemande; coutDAvant?: number; remplace?: Echange }): Promise<boolean> => {
    const quand = new Date().toISOString();
    const dit = (reponse: string, ecrans: Echange['ecrans'] = [{ nom: 'Les avis Google', chemin: '/avis-google' }]) => {
      garde({ id: uid(), question: o.question, reponse, ecrans, quand, coutUsd: o.coutDAvant });
      return true;
    };
    const ancien = o.remplace?.avis;
    const r = ancien ? { etat: 'trouve' as const, cle: ancien.cle } : perle.avisDe(o.demande, o.question, avisMontres);
    if (r.etat !== 'trouve') return dit(refusDeLAvis(r, o.demande.auteur));
    let a = perle.avisDeLaCle(r.cle);
    if (!a) return dit(refusDeLAvis({ etat: 'aucun' }, o.demande.auteur));
    const prenom = prenomDeLAuteur(a.auteur) || 'cette personne';
    const sien = [{ nom: 'cet avis', chemin: cheminDeLAvis(a.cle) }];
    if (a.etat === 'publiee') return dit(`L’avis ${deQui(prenom)} a déjà sa réponse sur Google.`, sien);
    if (a.etat === 'ecartee') return dit(`La Maison a choisi de ne pas répondre à l’avis ${deQui(prenom)}. Ouvrez-le dans Les avis Google pour reprendre.`, sien);
    if (a.etat === 'prepare') return dit(`Une réponse à l’avis ${deQui(prenom)} est en cours de préparation, sur ce poste ou un autre. Redemandez dans un instant.`, sien);
    /* Déjà prête (l'écran des avis prépare seul les avis récents) : on la montre, sans rien dépenser. */
    let cout = 0;
    if (a.etat === 'nouveau' || ancien) {
      setEnCours(`Perle écrit la réponse à l’avis ${deQui(prenom)}`);
      const p = await perle.proposeAuxAvis(a.cle);
      if (!p.ok) { setRefus(p.message); return false; }
      cout = p.coutUsd ?? 0;
      a = perle.avisDeLaCle(a.cle) ?? a;
    }
    if (!a.brouillon) { setRefus('Le brouillon n’est pas arrivé jusqu’ici : ouvrez Les avis Google.'); return false; }
    const carte = { cle: a.cle, auteur: a.auteur, note: a.note, texte: a.texte, ...(a.jour ? { quand: a.jour } : {}), reponse: a.brouillon };
    const reponse = `${cout > 0 ? 'J’ai préparé une réponse' : 'Une réponse est prête'} pour l’avis ${deQui(prenom)} : elle se relit et se publie depuis Les avis Google.`;
    if (o.remplace) change(o.remplace.id, (e) => ({ ...e, reponse, avis: carte, coutUsd: (e.coutUsd ?? 0) + cout }));
    else garde({ id: uid(), question: o.question, reponse, ecrans: [], quand, coutUsd: (o.coutDAvant ?? 0) + cout, avis: carte });
    return true;
  };
  const lanceLAvis = async (o: Parameters<typeof prepareLAvis>[0]) => {
    if (enCours) return;
    reco.current?.stop();
    setRefus('');
    setEnCours('Perle lit l’avis…');
    try { await prepareLAvis(o); } finally { setEnCours(''); }
  };

  const demander = async (texte?: string) => {
    const q = (texte ?? question).trim().slice(0, SIGNES_MAX);
    if (!q || enCours) return;
    reco.current?.stop();
    setRefus('');
    setEnCours('Perle lit la question…');
    try {
      /* Les tours d'avant, anonymisés comme la question : elle suit « et hier ? ». */
      const avant: MessageIa[] = fil.slice(-3).flatMap((e) => [
        { role: 'user' as const, content: perle.pourClaude(e.question) },
        { role: 'assistant' as const, content: e.reponse },
      ]);
      const pourElle = perle.pourClaude(q);
      const contexte = { question: pourElle, jour: perle.jour, minutes: perle.minutes, enDirect: perle.enDirectTexte, avant };
      const r1 = await demandeAClaude<unknown>(demandeDuPlan({ ...contexte, internet, messages: true, avis: true }));
      if (!r1.ok) { setRefus(r1.message); return; }
      const plan = planLu(r1.data);
      /* UNE RÉPONSE À PRÉPARER : le plan dit à qui et quoi, le Trône fait le reste. */
      if (plan.message) {
        if (await prepare({ question: q, demande: plan.message, coutDAvant: r1.coutUsd })) setQuestion('');
        return;
      }
      if (plan.avis) {
        if (await prepareLAvis({ question: q, demande: plan.avis, coutDAvant: r1.coutUsd })) setQuestion('');
        return;
      }
      /* INTERNET : la question reformulée par Perle part SEULE, sans le fil ni
         les tours d'avant, et sans aucune cliente (`pourInternet`). */
      if (plan.internet && internet) {
        setEnCours('Perle cherche sur internet…');
        const r3 = await demandeAClaude<{ sources?: unknown; coupee?: unknown }>(demandeDInternet({ question: perle.pourInternet(plan.internet), jour: perle.jour, minutes: perle.minutes }));
        if (!r3.ok) { setRefus(r3.message); return; }
        const trouvee = reponsePropre(r3.texte);
        if (!trouvee) { setRefus('Perle n’a rien trouvé de sûr sur internet. Reformulez la question.'); return; }
        garde({
          id: uid(), question: q, reponse: trouvee, quand: new Date().toISOString(), coutUsd: r1.coutUsd + r3.coutUsd, ecrans: [],
          internet: true, sources: sourcesPropres(r3.data?.sources), ...(r3.data?.coupee === true ? { coupee: true } : {}),
        });
        setQuestion('');
        return;
      }
      let reponse = plan.reponse;
      let faits: FaitLu[] = [];
      let cout = r1.coutUsd;
      if (plan.lectures.length) {
        faits = plan.lectures.flatMap((l) => perle.lis(l, q));
        setEnCours(`Perle lit ${ecransLus(faits).map((e) => e.nom).join(', ')}…`);
        const r2 = await demandeAClaude<unknown>(demandeDeLaReponse({ ...contexte, faits }));
        if (!r2.ok) { setRefus(r2.message); return; }
        reponse = r2.texte;
        cout += r2.coutUsd;
      }
      const propre = reponsePropre(reponse);
      if (!propre) { setRefus('Perle n’a pas su répondre à cette question. Reformulez-la, ou ouvrez l’écran concerné.'); return; }
      garde({
        id: uid(), question: q, reponse: propre, quand: new Date().toISOString(), coutUsd: cout,
        ecrans: faits.length ? ecransLus(faits) : [],
      });
      setQuestion('');
    } finally {
      setEnCours('');
    }
  };

  const dicter = () => {
    if (ecoute) { reco.current?.stop(); return; }
    const r = creeLaReconnaissance();
    if (!r) return;
    r.lang = 'fr-FR'; r.interimResults = false; r.continuous = true;
    r.onresult = (e) => {
      let dit = '';
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) dit += ` ${e.results[i][0].transcript}`;
      if (dit.trim()) setQuestion((t) => `${t}${t && !/\s$/.test(t) ? ' ' : ''}${dit.trim()}`.slice(0, SIGNES_MAX));
    };
    r.onend = () => setEcoute(false);
    r.onerror = () => setEcoute(false);
    reco.current = r;
    setEcoute(true);
    r.start();
  };

  const eteinte = claude === false;
  return (
    <div className="trp-perle">
      <PageHead
        eyebrow={`Le Trône · ${branch.city}`}
        title="Demander à Perle"
        sub="Elle lit le Trône à l’instant où vous demandez, et répond avec ce qu’elle y trouve. Elle prépare une réponse à une cliente si vous le demandez, sans jamais l’envoyer : « Envoyer » reste dans la conversation. Elle ne pose aucun rendez-vous et ne déplace jamais d’argent."
      />
      <p className="trp-perle__moment"><span aria-hidden="true" />{`En direct · ${momentDit(perle.jour, perle.minutes)}`}</p>

      <div className="trp-perle__grille">
        <section className="trp-perle__fil" aria-label="La conversation avec Perle">
          {fil.length === 0 && !enCours && (
            <div className="trp-perle__accueil">
              <h3>Que voulez-vous savoir ?</h3>
              <p>La caisse du jour, les rendez-vous, une cliente, les factures en attente, le mois, les dépenses, les conversations qui attendent : posez la question comme vous la diriez.</p>
              {internet && <p>Une question sur le monde hors de la Maison (un taux, une règle, un prix du marché) part sur internet, sans le nom d’aucune cliente, et revient avec ses sources.</p>}
              <p>Demandez-lui aussi de préparer une réponse : « Réponds à Awa que jeudi 10 h est libre ». Elle écrit le brouillon, vérifie la place au Carnet, et c’est vous qui l’envoyez, depuis la conversation.</p>
              <p>De même pour un avis Google : « Réponds à l’avis de Fatou ». Le brouillon se range dans Les avis Google, où vous le relisez avant de publier.</p>
            </div>
          )}
          {fil.map((e, rang) => (
            <div key={e.id} className="trp-perle__echange">
              <p className="trp-perle__moi">{e.question}</p>
              <article className="trp-perle__elle">
                <Reponse texte={e.reponse} />
                {e.brouillon && e.brouillon.etat === 'ecarte' && <p className="trp-perle__source">Brouillon écarté. Rien n’est parti.</p>}
                {e.brouillon && e.brouillon.etat !== 'ecarte' && (
                  <div className="trp-perle__brouillon" data-brouillon={e.brouillon.etat ?? 'pret'}>
                    <p className="trp-perle__etiquette">{`${e.brouillon.nom} · son dernier message${quandDit(e.brouillon.quandDernier, perle.jour) ? ` · ${quandDit(e.brouillon.quandDernier, perle.jour)}` : ''}`}</p>
                    <p className="trp-perle__cite">{`« ${e.brouillon.dernier} »`}</p>
                    {e.brouillon.verif && <p className={`trp-perle__verif${e.brouillon.verif.ok ? '' : ' is-alerte'}`}>{e.brouillon.verif.dit}</p>}
                    <p className="trp-perle__etiquette">La réponse préparée</p>
                    <p className="trp-perle__texte">{e.brouillon.texte}</p>
                    <p className="trp-perle__devise">{signeLeMessage('')}</p>
                    <p className="trp-perle__source">
                      {e.brouillon.etat === 'ouvert'
                        ? 'Ouverte dans la conversation : c’est là qu’elle se relit, se corrige et s’envoie.'
                        : 'La signature est posée par le Trône, jamais par l’IA. Rien ne part d’ici : « Envoyer » est dans la conversation, où vous relisez et corrigez.'}
                    </p>
                    <div className="trp-perle__gestes">
                      <Button variant="copper" size="sm" disabled={!!enCours} onClick={() => ouvreLeBrouillon(e)}>{e.brouillon.etat === 'ouvert' ? 'Rouvrir dans la conversation' : 'Ouvrir dans la conversation'}</Button>
                      <Button
                        variant="ghost" size="sm" disabled={!!enCours || eteinte}
                        onClick={() => { void lance({ question: e.question, demande: { cliente: '', plusAncienne: false, consigne: e.brouillon?.consigne ?? '', jour: e.brouillon?.jour, heure: e.brouillon?.heure }, remplace: e }); }}
                      >Une autre</Button>
                      <Button variant="ghost" size="sm" disabled={!!enCours} onClick={() => change(e.id, (x) => (x.brouillon ? { ...x, brouillon: { ...x.brouillon, etat: 'ecarte' } } : x))}>Écarter</Button>
                      {rang === fil.length - 1 && aPreparer.length > 0 && (
                        <Button
                          variant="ghost" size="sm" disabled={!!enCours || eteinte}
                          onClick={() => { void lance({ question: 'Prépare la réponse suivante.', demande: { cliente: '', plusAncienne: true, consigne: '' } }); }}
                        >{`La suivante (${aPreparer.length} attend${aPreparer.length > 1 ? 'ent' : ''})`}</Button>
                      )}
                    </div>
                  </div>
                )}
                {e.avis && (() => {
                  /* L'avis et son brouillon, tels qu'ils sont MAINTENANT dans Les avis Google (retouché, publié). */
                  const carte = e.avis;
                  const vif = perle.avisDeLaCle(carte.cle);
                  const publiee = vif?.etat === 'publiee';
                  const retouchee = !publiee && !!vif?.brouillon && vif.brouillon !== carte.reponse;
                  return (
                    <div className="trp-perle__brouillon" data-avis={publiee ? 'publiee' : retouchee ? 'retouchee' : 'prete'}>
                      <p className="trp-perle__etiquette">{`Avis ${carte.auteur ? deQui(carte.auteur) : 'sans nom'} · ${etoilesDites(carte.note)}${carte.quand ? ` · ${dateDite(carte.quand)}` : ''}`}</p>
                      <p className="trp-perle__cite">{carte.texte ? `« ${carte.texte} »` : 'Une note, sans texte.'}</p>
                      {estUnAvisDifficile(carte.note) && !publiee && (
                        <p className="trp-perle__verif is-alerte">{`Avis de ${etoilesDites(carte.note)} : la réponse reconnaît sans se justifier. Relisez-la de près avant de publier.`}</p>
                      )}
                      <p className="trp-perle__etiquette">{publiee ? 'La réponse publiée sur Google' : retouchee ? 'La réponse, retouchée dans Les avis Google' : 'La réponse préparée'}</p>
                      <p className="trp-perle__texte">{publiee ? (vif?.publiee || vif?.brouillon || carte.reponse) : (vif?.brouillon ?? carte.reponse)}</p>
                      <p className="trp-perle__source">{publiee ? 'Publiée depuis Les avis Google.' : 'Rangée dans Les avis Google, où elle se relit, se corrige et se publie. Rien n’est publié d’ici.'}</p>
                      <div className="trp-perle__gestes">
                        <Button variant="copper" size="sm" disabled={!!enCours} onClick={() => navigate(cheminDeLAvis(carte.cle))}>Ouvrir dans les avis Google</Button>
                        {/* Une réponse que la main a retouchée ne se remplace pas d'ici. */}
                        {!publiee && !retouchee && (
                          <Button variant="ghost" size="sm" disabled={!!enCours || eteinte} onClick={() => { void lanceLAvis({ question: e.question, demande: { auteur: '', plusRecent: false }, remplace: e }); }}>Une autre</Button>
                        )}
                        {rang === fil.length - 1 && avisAPreparer > 0 && (
                          <Button
                            variant="ghost" size="sm" disabled={!!enCours || eteinte}
                            onClick={() => { void lanceLAvis({ question: 'Prépare la réponse à l’avis suivant.', demande: { auteur: '', plusRecent: true } }); }}
                          >{`Le suivant (${avisAPreparer} sans réponse)`}</Button>
                        )}
                      </div>
                    </div>
                  );
                })()}
                {e.coupee && <p className="trp-perle__source">La réponse a été coupée avant sa fin : reposez la question, plus précise.</p>}
                {e.internet && (e.sources?.length ?? 0) > 0 && (
                  <ul className="trp-perle__sources" aria-label="Les sources">
                    {(e.sources ?? []).map((s) => (
                      <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.titre}</a></li>
                    ))}
                  </ul>
                )}
                <p className="trp-perle__source">
                  {e.internet
                    ? 'Cherché sur internet, pas dans le Trône : à confirmer à la source avant de décider.'
                    : e.brouillon ? 'Lu dans : sa conversation, sa fiche et le catalogue.'
                    : e.avis ? 'Lu dans : Les avis Google.'
                      : e.ecrans.length ? `Lu dans : ${e.ecrans.map((x) => x.nom).join(', ')}.` : 'Lu dans : En direct.'}
                  {typeof e.coutUsd === 'number' && e.coutUsd > 0 ? ` Cette réponse : ${dollarsDits(e.coutUsd)}.` : ''}
                </p>
                {e.ecrans.length > 0 && (
                  <div className="trp-perle__gestes">
                    {e.ecrans.map((x) => (
                      <Button key={x.chemin} variant="ghost" size="sm" onClick={() => navigate(x.chemin)}>{`Ouvrir ${x.nom}`}</Button>
                    ))}
                  </div>
                )}
              </article>
            </div>
          ))}
          {enCours && <p className="trp-perle__attente" role="status">{enCours}</p>}
          {refus && <p className="trp-perle__refus" role="alert">{refus}</p>}
          {eteinte && <p className="trp-perle__refus" role="alert">La fonction ia-maison n’est pas posée ou pas à jour : Perle ne peut pas répondre pour l’instant. Le fil « En direct », lui, reste juste.</p>}
          <div ref={bas} className="trp-perle__bas" />

          <form className="trp-perle__champ" onSubmit={(e) => { e.preventDefault(); void demander(); }}>
            <label htmlFor="trp-perle-question">Votre question</label>
            <div className="trp-perle__saisie">
              <input
                id="trp-perle-question"
                value={question}
                onChange={(e) => setQuestion(e.target.value.slice(0, SIGNES_MAX))}
                placeholder="Écrivez, ou dictez"
                autoComplete="off"
                disabled={!!enCours || eteinte}
              />
              {aLeMicro && (
                <button
                  type="button"
                  className={`trp-perle__micro${ecoute ? ' is-actif' : ''}`}
                  onClick={dicter}
                  disabled={!!enCours || eteinte}
                  aria-pressed={ecoute}
                  aria-label={ecoute ? 'Arrêter la dictée' : 'Dicter la question'}
                  title={ecoute ? 'Arrêter la dictée' : 'Dicter la question'}
                >
                  <Mic size={17} aria-hidden="true" />
                </button>
              )}
              <Button type="submit" disabled={!!enCours || eteinte || !question.trim()}>{enCours ? 'Perle lit…' : 'Demander'}</Button>
            </div>
            <div className="trp-perle__puces">
              {QUESTIONS_PROPOSEES.map((q) => (
                <button key={q} type="button" className="trp-perle__puce" disabled={!!enCours || eteinte} onClick={() => { void demander(q); }}>{q}</button>
              ))}
              {fil.length > 0 && (
                <button type="button" className="trp-perle__effacer" disabled={!!enCours} onClick={() => setFils((tous) => ({ ...tous, [cle]: [] }))}>Effacer la conversation</button>
              )}
            </div>
          </form>
        </section>

        <aside className="trp-perle__direct" aria-label="En direct">
          <h3>En direct</h3>
          {perle.lignes.map((l) => (
            <div key={l.cle} className="trp-perle__ligne">
              <b>{l.titre}</b>
              <span>{l.detail}</span>
              {l.ecran && l.geste && <button type="button" onClick={() => navigate(l.ecran as string)}>{l.geste}</button>}
              {/* Second lot : Perle prépare la réponse à celle qui attend depuis le plus longtemps ; rien ne part. */}
              {l.cle === 'sans-reponse' && aPreparer.length > 0 && !eteinte && (
                <button
                  type="button" className="trp-perle__preparer" disabled={!!enCours}
                  onClick={() => { void lance({ question: 'Prépare la réponse à la conversation qui attend.', demande: { cliente: '', plusAncienne: true, consigne: '' } }); }}
                >Préparer une réponse</button>
              )}
              {/* Les avis Google : le plus récent de ceux qui n'ont ni réponse ni brouillon ; le brouillon se range dans Les avis Google. */}
              {l.cle === 'avis' && avisAPreparer > 0 && !eteinte && (
                <button
                  type="button" className="trp-perle__preparer" disabled={!!enCours}
                  onClick={() => { void lanceLAvis({ question: 'Prépare la réponse à l’avis qui attend.', demande: { auteur: '', plusRecent: true } }); }}
                >Préparer une réponse</button>
              )}
            </div>
          ))}
          <p className="trp-perle__note">Calculé par le Trône, sans IA : il se met à jour seul.</p>
        </aside>
      </div>
    </div>
  );
}
