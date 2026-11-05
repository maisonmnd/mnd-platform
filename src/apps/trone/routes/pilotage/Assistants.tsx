import { useEffect, useState } from 'react';
import { PageHead } from '../_ui';
import { Button, Input, Textarea, toast, demande } from '../../../../ds/components';
import { useAuth, useStaff as useMonProfil } from '../../../../shared/auth';
import { useSettings, type Settings } from '../../../../shared/settings';
import { useClients } from '../../../../shared/clients';
import { useServices } from '../../../../shared/catalog';
import { caissesVivantes, useExpenseCategories, useToutesLesCaisses } from '../../../../shared/finance';
import { useStaff as useEquipe } from '../equipe/data';
import {
  ASSISTANTS_DE_LA_MAISON, CHOIX_AVEC_TEXTE, CHOIX_DIT, NON_DIT, PURGE_DU_PRIVE_JOURS, RELAIS_DIT, decisionEnAttente, etatDe, reglagesComplets,
  type Assistant, type ChoixDeDecision, type Decision, type FaitsDAcces, type FaitsDeDepense, type FaitsDePlanning, type FaitsDePublication,
  type FaitsDeRdv, type Relais, type ReglagesAssistants,
} from '../../../../shared/assistants-pur';
import {
  ENVELOPPE_USD, NIVEAUX, PORTEURS, PROFESSIONNELS, RESERVE, STATUT_DIT, dollarsDits, livreDuMois, moisDeCotonou, passeAuTrone, plafondsComplets,
  professionnel, type AlerteDeCredit, type LivreDuMois, type Professionnel,
} from '../../../../shared/maison-intelligente-pur';
import {
  GENRE_DE_DECISION_DIT, basculeLeMode, donneUnJeton, etatDuRelaisDit, heureCotonouDite, litLesAssistantsRelies, minuitCotonouISO, prenomDe,
  quandDit, reglagesDits, retireLeJeton, trancheLaDecision, trancheLaPlace, type ChoixDePlace, type LectureDesAssistants,
} from '../../../../shared/assistants';
import type { Geste } from '../../../../shared/journal';
import ConseilDuMatin from './ConseilDuMatin';
import ConsigneAuxAssistants from './ConsigneAuxAssistants';
import './assistants.css';

/* ═══════════════════════════════════════════════════════════════════
   LES ASSISTANTS RELIÉS, 31 octobre 2026, maquette TtHPKpjCqovrn8nookJ7eu ;
   devenu le 2 novembre 2026 l'écran des DIX PROFESSIONNELS de la Maison
   intelligente (maquette CrtJrZzF8E6K39dbPeHwwt, le socle). Les souverains
   seuls (route `/assistants`, ROUTES_SOUVERAIN).

   DANS L'ORDRE OÙ ELLE LE LIT :
     ⓪ ÉCRIRE À UN ASSISTANT (5 novembre 2026, « Une consigne aux
        assistants », lot 1, composant `ConsigneAuxAssistants`) : le choix de
        l'assistant, le champ et la dictée, le fil des consignes, Défaire
        pendant une heure ; la direction seule ;
     ① LE BOUTON DU PORTEUR : « Je suis loin » / « Je suis là » (maquette
        JYW7EQz1kmVXrUSGWQqebZ, choix 1) : ses assistants d'ordinateur ne
        lui posent plus de question au sélecteur, tout arrive ici en cartes ;
     ② LE CONSEIL DU MATIN de Saphir (composant `ConseilDuMatin`) ;
     ③ LES CARTES EN ATTENTE du porteur connecté, tous genres : réponse,
        rendez-vous, dépense, publication, planning, accès, contact nouveau,
        place tenue, note, argent ; le contact et son message pour lui seul
        (effacés dès sa décision, au plus tard dans sept jours) ;
     ④ LES DIX : le registre (`maison-intelligente-pur`) fusionné avec la
        table : l'état vivant de ceux qui passent au Trône, le statut des
        autres, le porteur, où il tourne, ses cartes, ses crédits du mois ;
        les jetons d'Opale et d'Onyx se donnent et se retirent ici ;
     ⑤ LE LIVRE DES CRÉDITS : les compteurs des fonctions rendus à chaque
        professionnel, sur les 200 $ du mois ; les plafonds se règlent ici ;
     ⑥ LES RELAIS, ⑦ LE JOURNAL DU JOUR, ⑧ LES RÉGLAGES de la veille ;
     ⑨ LES TROIS NIVEAUX : seul, en carte, jamais.

   RIEN NE SE LIT EN TEMPS RÉEL : à l'ouverture et toutes les 60 secondes.

   UN SEUL PANNEAU OUVERT, LE RÉSUMÉ SUR LA LIGNE, LA BARRE QUI SUIT : la
   grammaire des écrans en liste du Trône. Le message privé d'un contact
   n'arrive que sur une carte, au porteur seul (la politique de la table) ;
   jamais dans un relais, un résumé, le journal ni une notification. */

const DIT_VERBE: Record<Geste['verbe'], string> = { pose: 'a posé', modifie: 'a modifié', efface: 'a effacé', lit: 'a fait' };

/** Ce que dit le Trône une fois la carte tranchée, par genre puis par choix. */
function ditApresLeChoix(d: Decision, choix: ChoixDeDecision, reponse: Record<string, unknown>): string {
  const efface = d.prive ? ' Le message du contact est effacé du Trône.' : '';
  const g = d.genre;
  const dit = (() => {
    if (g === 'place-tenue') {
      if (choix === 'confirmer') return 'Place confirmée : la confirmation de la Maison part.';
      if (choix === 'autre-heure') return 'Autre heure proposée : l’assistant qui a posé la relaie à la cliente.';
      return 'Place refusée : l’assistant qui l’avait posée le sait.';
    }
    if (g === 'cercle') return 'Cercle noté : l’assistant le garde sur l’ordinateur, jamais au Trône.';
    if (g === 'rdv') {
      if (choix === 'poser') return 'Tranché : l’assistant pose le rendez-vous au Trône et répond au prochain passage.';
      if (choix === 'autre-heure') return 'Autre heure : l’assistant la propose au prochain passage.';
      if (choix === 'modifier') return 'Tranché avec votre texte : la pose et votre réponse partent au prochain passage.';
      return 'Rien ne se pose, rien ne part.';
    }
    if (g === 'depense') {
      if (reponse.verdict === 'deja') return 'Cette dépense était déjà au Trône : rien de plus.';
      if (choix === 'valider') return 'Dépense validée à votre nom : elle est au Trône.';
      if (choix === 'corriger') return 'Dépense corrigée et validée à votre nom : elle est au Trône.';
      return 'Ce n’est pas une dépense : rien n’entre au Trône.';
    }
    if (g === 'publication') {
      if (choix === 'publier') return 'Tranché : la publication part au prochain passage.';
      if (choix === 'modifier') return 'Tranché avec votre texte : il partira au prochain passage.';
      return 'Rien ne sera publié.';
    }
    if (g === 'planning') {
      if (choix === 'accepter') return 'Planning accepté.';
      if (choix === 'modifier') return 'Tranché avec votre correction.';
      return 'Le planning reste tel quel.';
    }
    if (g === 'acces') return choix === 'accorder' ? 'Accès accordé.' : 'Accès refusé.';
    if (choix === 'envoyer') return 'Tranché : l’assistant enverra au prochain passage.';
    if (choix === 'modifier') return 'Tranché avec votre texte : l’assistant l’enverra au prochain passage.';
    return 'Tranché : rien ne partira.';
  })();
  return `${dit}${efface}`;
}

/* Les bornes sont celles de `reglagesComplets` : hors d'elles, la Maison lit
   la valeur par défaut, et le champ le dit. Dans l'ordre de la journée. */
const CHAMPS_DES_REGLAGES: { cle: keyof ReglagesAssistants; libelle: string; unite: string; min: number; max: number }[] = [
  { cle: 'veilleDe', libelle: 'Veille à partir de', unite: 'h', min: 0, max: 23 },
  { cle: 'rythmeMin', libelle: 'Rythme du jour', unite: 'min', min: 5, max: 60 },
  { cle: 'soirDe', libelle: 'Rythme du soir à partir de', unite: 'h', min: 0, max: 24 },
  { cle: 'rythmeSoirMin', libelle: 'Rythme du soir', unite: 'min', min: 5, max: 60 },
  { cle: 'veilleA', libelle: 'Veille jusqu’à', unite: 'h', min: 1, max: 24 },
  { cle: 'silenceMin', libelle: 'Silence avant de prévenir', unite: 'min', min: 15, max: 240 },
  { cle: 'tenueHeures', libelle: 'Une place tenue dure', unite: 'h ouvrées', min: 1, max: 12 },
];

const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;
const apresMs = (iso: string | null | undefined, borneMs: number): boolean => {
  const t = Date.parse(iso ?? '');
  return Number.isFinite(t) && t >= borneMs;
};

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS_LONGS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** « samedi 8 novembre 2026 » : un jour AAAA-MM-JJ, toujours avec l'année. */
function jourDit(dateISO: string | null | undefined, avecLeJour = true): string {
  if (!dateISO || !/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return '';
  const d = new Date(`${dateISO}T12:00:00Z`);
  const date = `${d.getUTCDate() === 1 ? '1er' : d.getUTCDate()} ${MOIS_LONGS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return avecLeJour ? `${JOURS[d.getUTCDay()]} ${date}` : date;
}
/** « novembre 2026 » : un mois AAAA-MM. */
const moisDit = (mois: string): string => {
  const [a, m] = mois.split('-').map(Number);
  return a && m ? `${MOIS_LONGS[m - 1]} ${a}` : mois;
};
/** « 6 000 F » */
const francsDits = (n: number): string => `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} F`;
/** « 10:00 » → « 10 h », « 14:30 » → « 14 h 30 » */
const heureDite = (hhmm: string | null | undefined): string => {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm ?? '');
  if (!m) return hhmm ?? '';
  const h = Number(m[1]);
  return m[2] === '00' ? `${h} h` : `${h} h ${m[2]}`;
};

const ALERTE_DITE: Record<AlerteDeCredit, string> = { ok: 'dans le plafond', proche: 'proche du plafond', depasse: 'plafond dépassé' };

const porteursDits = (p: Professionnel): string => p.porteurs.map((k) => PORTEURS[k].prenom).join(' et ');

/** Un assistant d'ordinateur (Opale, Onyx) : celui que touche le bouton du porteur. */
const estDOrdinateur = (a: Assistant): boolean => {
  const p = professionnel(a.id);
  return p ? passeAuTrone(p) : a.aUnJeton;
};

export default function Assistants() {
  const { session } = useAuth();
  const monProfil = useMonProfil();
  const monId = session?.user?.id ?? null;
  const estSouverain = monProfil?.role === 'souverain';
  const [equipe] = useEquipe();
  const [clients] = useClients();
  const [services] = useServices();
  const [categoriesDeDepense] = useExpenseCategories();
  const [toutesLesCaisses] = useToutesLesCaisses();
  const [reglages, setReglages] = useSettings();
  const [lecture, setLecture] = useState<LectureDesAssistants | null>(null);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const [tour, setTour] = useState(0);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [jetonMontre, setJetonMontre] = useState<{ id: string; nom: string; jeton: string } | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);

  /* LA LECTURE : à l'ouverture, après chaque geste (`relis`), et toutes les
     60 secondes. Une lecture arrivée après la fermeture ne touche rien. */
  const relis = () => setTour((n) => n + 1);
  useEffect(() => {
    let vivant = true;
    const lis = async () => {
      const ms = Date.now();
      const l = await litLesAssistantsRelies(ms);
      if (!vivant) return;
      setMaintenant(ms);
      setLecture(l);
    };
    void lis();
    const t = setInterval(() => { void lis(); }, 60_000);
    return () => { vivant = false; clearInterval(t); };
  }, [tour]);

  const r = reglagesComplets(reglages.assistants);
  const assistants: Assistant[] = lecture?.assistants ?? [];
  const minuitMs = Date.parse(minuitCotonouISO(maintenant));
  const relais: Relais[] = lecture?.relais ?? [];
  const relaisDuJour = relais.filter((x) => apresMs(x.quand, minuitMs));
  const decisions: Decision[] = (lecture?.decisions ?? []).filter((d) => decisionEnAttente(d, maintenant));
  const journal: Geste[] = lecture?.journal ?? [];
  const livre = livreDuMois(lecture?.compteurs ?? {}, moisDeCotonou(maintenant), reglages.livreDesCredits);

  /* ── Le mode du porteur connecté ── */
  const mesOrdinateurs = assistants.filter((a) => !!a.porteurUserId && a.porteurUserId === monId && estDOrdinateur(a));
  const loinDepuis = mesOrdinateurs.map((a) => a.loinDepuis).filter((x): x is string => !!x && Number.isFinite(Date.parse(x))).sort()[0] ?? null;
  const estLoin = !!loinDepuis;
  const nomsDeMesOrdinateurs = mesOrdinateurs.map((a) => a.nom).join(' et ');

  const nomDe = (id: string): string =>
    assistants.find((a) => a.id === id)?.nom ?? professionnel(id)?.nom ?? ASSISTANTS_DE_LA_MAISON.find((x) => x.id === id)?.nom ?? id;
  const prenomDuPorteur = (a: Assistant): string => {
    const m = equipe.find((x) => x.id === a.porteurTeamId);
    if (m) return prenomDe(m.name);
    const p = professionnel(a.id);
    return p ? porteursDits(p) : ASSISTANTS_DE_LA_MAISON.find((x) => x.id === a.id)?.porteurPrenom ?? '';
  };
  const clienteDite = (clientId: string | null | undefined, numeroCle: string | null | undefined): string => {
    const c = clientId ? clients.find((x) => x.id === clientId) : undefined;
    if (c) return c.name;
    if (numeroCle) return `la cliente dont le numéro finit par ${numeroCle.slice(-4)}`;
    return '';
  };
  const prestationDite = (id: string): string => services.find((s) => s.id === id || s.name === id)?.name ?? id;
  const maitreDit = (id: string | null | undefined): string => {
    if (!id) return '';
    const m = equipe.find((x) => x.id === id);
    return m ? prenomDe(m.name) : id;
  };
  const compteurs = (a: Assistant) => ({
    traites: a.etat?.traites ?? 0,
    rdv: journal.filter((g) => g.parNom === a.nom && g.table === 'appointments' && g.verbe === 'pose').length,
    relais: relaisDuJour.filter((x) => x.de === a.id).length,
  });

  /* ── Le bouton « Je suis loin » ── */
  const basculer = async () => {
    const versLoin = !estLoin;
    setEnCours('mode');
    const res = await basculeLeMode(versLoin);
    setEnCours(null);
    if (!res.ok) { toast(res.erreur); return; }
    const qui = nomsDeMesOrdinateurs || 'Votre assistant';
    toast(versLoin
      ? `Vous êtes loin : ${qui} dépose tout ici en cartes dès son prochain passage.`
      : `Vous êtes là : ${qui} reprend ses questions à l’ordinateur au prochain passage.`);
    relis();
  };

  /* ── Les jetons ── */
  const donner = async (a: Assistant) => {
    if (a.aUnJeton && !await demande({
      quoi: 'Jeton', titre: `Donner un nouveau jeton à ${a.nom} ?`,
      dit: 'L’ancien ne vaudra plus : la session de l’assistant devra recevoir le nouveau dans son reglages.json.',
      accepter: 'Donner le jeton', refuser: 'Garder l’ancien',
    })) return;
    setEnCours(`jeton:${a.id}`);
    const res = await donneUnJeton(a.id, { nom: a.nom, ...(a.porteurTeamId ? { porteurTeamId: a.porteurTeamId } : {}), ...(a.appareil ? { appareil: a.appareil } : {}) });
    setEnCours(null);
    if (!res.ok) { toast(res.erreur); return; }
    setJetonMontre({ id: a.id, nom: a.nom, jeton: res.jeton });
    relis();
  };
  const retirer = async (a: Assistant) => {
    if (!await demande({
      quoi: 'Jeton', titre: `Retirer le jeton de ${a.nom} ?`,
      dit: 'Son prochain passage sera refusé : l’assistant ne pourra plus rien poser ni déposer tant qu’un nouveau jeton ne lui est pas donné.',
      accepter: 'Retirer le jeton', refuser: 'Le garder',
    })) return;
    setEnCours(`jeton:${a.id}`);
    const res = await retireLeJeton(a.id);
    setEnCours(null);
    if (!res.ok) { toast(res.erreur); return; }
    if (jetonMontre?.id === a.id) setJetonMontre(null);
    toast(`Jeton retiré : ${a.nom} ne passe plus.`);
    relis();
  };
  const copier = async (texte: string) => {
    try { await navigator.clipboard.writeText(texte); toast('Jeton copié. Collez-le dans reglages.json, puis fermez ce bloc.'); } catch { toast('La copie n’a pas marché : sélectionnez le jeton à la main.'); }
  };

  /* ── Les cartes ── */
  const trancher = async (d: Decision, choix: ChoixDeDecision, extras: { texte?: string; date?: string; time?: string; faits?: Record<string, unknown> } = {}) => {
    setEnCours(`decision:${d.id}`);
    const res = d.genre === 'place-tenue'
      ? await trancheLaPlace({ decisionId: d.id, choix: choix as ChoixDePlace, ...(extras.date ? { date: extras.date } : {}), ...(extras.time ? { time: extras.time } : {}) })
      : await trancheLaDecision(d.id, choix, extras.texte, extras.faits);
    setEnCours(null);
    if (!res.ok) { toast(res.erreur); return; }
    toast(ditApresLeChoix(d, choix, 'reponse' in res ? (res.reponse as Record<string, unknown>) : {}));
    setOuvert(null);
    relis();
  };

  /* ── Les réglages ── */
  const regle = (cle: keyof ReglagesAssistants, v: string) => {
    const n = v.trim() === '' ? undefined : Number(v);
    setReglages((prev) => ({ ...prev, assistants: { ...(prev.assistants ?? {}), [cle]: n !== undefined && Number.isFinite(n) ? n : undefined } }));
  };

  /* « Voir la carte », depuis le fil des consignes : la carte s'ouvre et vient sous les yeux. */
  const ouvrirLaCarte = (decisionId: string) => {
    setOuvert(`decision:${decisionId}`);
    setTimeout(() => { document.getElementById(`carte-${decisionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60);
  };

  const luLe = lecture ? heureCotonouDite(lecture.luLe) : '';
  const ligneDuLivre = (id: string) => livre.lignes.find((l) => l.id === id) ?? null;
  /** L'état vivant (éveillé, endormi, empêché, sans jeton) de ceux qui passent
      au Trône, jugé sur les réglages de la veille ; null pour les autres, qui
      disent leur statut au registre. */
  const etatVivant = (a: Assistant | null, p: Professionnel) => {
    if (!a || !passeAuTrone(p)) return null;
    const e = etatDe(a, maintenant, r);
    return e;
  };

  return (
    <div className="ast">
      <PageHead
        eyebrow="Direction · Les assistants"
        title="Dix professionnels, un seul Trône."
        sub="Qui veille, ce qui attend votre geste, ce qu’ils ont fait aujourd’hui. Rien ne sort sans le oui de son porteur."
        actions={(
          <div className="ast-lu">
            <span className="ast-doux">{lecture ? `Lu à ${luLe} · relu toutes les minutes` : 'Lecture…'}</span>
            <Button size="sm" variant="ghost" onClick={relis}>Relire</Button>
          </div>
        )}
      />

      {!estSouverain && (
        <p className="ast-doux ast-note">Cet écran est celui de la direction : les cartes, les jetons et les plafonds ne s’y touchent qu’avec ce rang.</p>
      )}
      {lecture?.tablesAbsentes && (
        <p className="ast-alerte ast-note">Les tables des assistants ne sont pas encore en ligne (migrations 0149 et 0151) : l’écran se remplira dès qu’elles le seront.</p>
      )}

      {/* ══ ⓪ ÉCRIRE À UN ASSISTANT : la direction seule (la route et la table le sont aussi) ══ */}
      {(!monProfil || estSouverain) && <ConsigneAuxAssistants decisions={decisions} ouvrirLaCarte={ouvrirLaCarte} />}

      {/* ══ ① LE BOUTON DU PORTEUR ══ */}
      {mesOrdinateurs.length > 0 && (
        <section className={`ast-carte ast-mode${estLoin ? ' est-loin' : ''}`} aria-label="Je suis loin">
          <div className="ast-mode__tete">
            <div className="ast-mode__dit">
              <span className="ast-sur">{estLoin ? 'Vous êtes loin' : 'Vous êtes là'}</span>
              <b className="ast-mode__titre">
                {estLoin
                  ? `Depuis ${quandDit(loinDepuis, maintenant)}, ${nomsDeMesOrdinateurs} dépose tout ici.`
                  : `${nomsDeMesOrdinateurs} vous pose ses questions à l’ordinateur.`}
              </b>
            </div>
            <Button variant={estLoin ? 'indigo' : 'copper'} disabled={enCours === 'mode'} onClick={() => { void basculer(); }}>
              {estLoin ? 'Je suis là' : 'Je suis loin'}
            </Button>
          </div>
          <ul className="ast-mode__liste">
            <li>Les questions arrivent ici, en cartes : réponses, rendez-vous, dépenses, contacts nouveaux. Une dépense validée sur sa carte entre déjà validée à votre nom.</li>
            <li>Une notification par tour, avec le nombre de cartes, jamais un nom. Rien entre 22 h et 7 h : les cartes attendent ici.</li>
            <li>Les proches et la famille restent sur l’ordinateur : leurs discussions ne s’ouvrent pas et ne viennent jamais au Trône.</li>
            <li>Une question déjà posée à l’ordinateur reste en attente : touchez le bouton avant de partir. {nomsDeMesOrdinateurs} le lit à son prochain passage.</li>
          </ul>
        </section>
      )}

      {/* ══ ② LE CONSEIL DU MATIN ══ */}
      <ConseilDuMatin />

      {/* ══ ③ LES CARTES EN ATTENTE ══ */}
      <section className="ast-carte" aria-label="Les cartes en attente">
        <div className="ast-entre">
          <span className="ast-sur">Les cartes en attente</span>
          <span className="ast-doux">{decisions.length === 0 ? 'rien n’attend votre geste' : pluriel(decisions.length, 'carte', 'cartes')}</span>
        </div>
        {decisions.length === 0 && (
          <p className="ast-doux ast-vide">Une carte est la seule façon qu’un professionnel a de vous demander : une réponse, un rendez-vous, une dépense, une publication, un planning, un accès, un contact nouveau. Vous tranchez d’un toucher, de l’ordinateur ou du téléphone.</p>
        )}
        <div className="ast-liste">
          {decisions.map((d) => {
            const cle = `decision:${d.id}`;
            const estOuverte = ouvert === cle;
            return (
              <div className={`ast-ligne${estOuverte ? ' est-ouverte' : ''}`} key={d.id} id={`carte-${d.id}`}>
                <button type="button" className="ast-ligne__tete" aria-expanded={estOuverte} onClick={() => setOuvert(estOuverte ? null : cle)}>
                  <span className="ast-ligne__h">{quandDit(d.creeLe, maintenant)}</span>
                  <span className="ast-ligne__qui">{nomDe(d.assistant)} · {GENRE_DE_DECISION_DIT[d.genre] ?? d.genre}</span>
                  <span className="ast-ligne__quoi">{d.prive?.contact ? <b>{d.prive.contact} · </b> : null}{d.resume}</span>
                  <span className="ast-ligne__etat">{d.echeance ? `avant ${quandDit(d.echeance, maintenant)}` : d.choix.map((x) => (x === 'non' ? NON_DIT[d.genre] ?? CHOIX_DIT.non : CHOIX_DIT[x] ?? x)).join(' · ')}</span>
                </button>
                {estOuverte && (
                  <PanneauCarte
                    decision={d}
                    nom={nomDe(d.assistant)}
                    cliente={clienteDite(d.clientId ?? (d.faits as FaitsDeRdv | null)?.clientId, d.numeroCle ?? (d.faits as FaitsDeRdv | null)?.numeroCle)}
                    occupe={enCours === cle}
                    maintenant={maintenant}
                    prestationDite={prestationDite}
                    maitreDit={maitreDit}
                    categories={categoriesDeDepense.map((c) => c.name)}
                    caisses={caissesVivantes(toutesLesCaisses).map((c) => c.name)}
                    fermer={() => setOuvert(null)}
                    trancher={(choix, extras) => { void trancher(d, choix, extras); }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ══ ④ LES DIX ══ */}
      <section className="ast-carte" aria-label="Les dix professionnels">
        <div className="ast-entre">
          <span className="ast-sur">Les dix</span>
          <span className="ast-doux">un par département, chacun son porteur ; ils se parlent par le Trône, jamais entre eux</span>
        </div>
        {jetonMontre && (
          <div className="ast-jeton" role="status">
            <span className="ast-sur">Le jeton de {jetonMontre.nom}, montré une seule fois</span>
            <code className="ast-jeton__code">{jetonMontre.jeton}</code>
            <span className="ast-doux">Collez-le dans le reglages.json de l’assistant, sur son ordinateur. Il ne se verra plus : la base n’en garde que l’empreinte.</span>
            <div className="ast-gestes">
              <Button size="sm" variant="copper" onClick={() => { void copier(jetonMontre.jeton); }}>Copier</Button>
              <Button size="sm" variant="ghost" onClick={() => setJetonMontre(null)}>J’ai fini</Button>
            </div>
          </div>
        )}
        <div className="ast-liste">
          {PROFESSIONNELS.map((p) => {
            const a = assistants.find((x) => x.id === p.id) ?? null;
            const vivant = passeAuTrone(p) && a;
            const e = etatVivant(a, p);
            const etatCle = e ? e.etat : `statut-${p.statut}`;
            const etatMot = e
              ? (e.etat === 'eveille' ? 'éveillé' : e.etat === 'endormi' ? 'endormi' : e.etat === 'empeche' ? 'empêché' : 'sans jeton')
              : STATUT_DIT[p.statut];
            const cartes = decisions.filter((d) => d.assistant === p.id).length;
            const credit = ligneDuLivre(p.id);
            const cle = `pro:${p.id}`;
            const estOuverte = ouvert === cle;
            const occupe = a ? enCours === `jeton:${a.id}` : false;
            const c = a ? compteurs(a) : null;
            return (
              <div className={`ast-ligne ast-pro est-${etatCle}${estOuverte ? ' est-ouverte' : ''}`} key={p.id}>
                <button type="button" className="ast-pro__tete" aria-expanded={estOuverte} onClick={() => setOuvert(estOuverte ? null : cle)}>
                  <b className="ast-pro__nom">{p.nom}</b>
                  <span className="ast-pro__tient"><span className="ast-ligne__qui">{p.departementDit}</span>{p.tient}</span>
                  <span className="ast-etat"><i className="ast-point" aria-hidden="true" />{etatMot}{a?.loinDepuis ? ' · loin' : ''}</span>
                  <span className="ast-pro__porteur">{porteursDits(p)}</span>
                  <span className="ast-pro__chiffres">
                    {cartes > 0 && <span className="ast-pastille">{pluriel(cartes, 'carte', 'cartes')}</span>}
                    {credit && (credit.plafond > 0 || credit.usd > 0)
                      ? <span className={`ast-credit est-${credit.alerte}`}>{dollarsDits(credit.usd)} / {dollarsDits(credit.plafond)}</span>
                      : <span className="ast-doux ast-petit">abonnement</span>}
                  </span>
                </button>
                {estOuverte && (
                  <div className="ast-panneau">
                    <div className="ast-suit">
                      <b>{p.nom}, {p.tient}</b>
                      <small>{p.departementDit} · porté par {porteursDits(p)} · {p.ouDit}</small>
                      <span className="ast-suit__actions"><Button size="sm" variant="ghost-invert" onClick={() => setOuvert(null)}>Fermer</Button></span>
                    </div>
                    <div className="ast-corps">
                      <p className="ast-resume">{p.chaqueJour}</p>
                      <dl className="ast-faits">
                        <dt>Seul</dt><dd>{p.seul}</dd>
                        <dt>En carte</dt><dd>{p.enCarte}</dd>
                        <dt>Où il tourne</dt><dd>{p.ouDit}</dd>
                        <dt>Où il en est</dt><dd>{STATUT_DIT[p.statut]} · {p.quinzaine}</dd>
                        {credit && <><dt>Crédits de {moisDit(livre.mois)}</dt><dd>{dollarsDits(credit.usd)} sur {dollarsDits(credit.plafond)} · {pluriel(credit.appels, 'appel', 'appels')}</dd></>}
                        {e && a && (
                          <>
                            <dt>État</dt><dd>{e.detail}{a.vuLe && e.etat !== 'eveille' ? ` · dernier passage ${quandDit(a.vuLe, maintenant)}` : ''}</dd>
                            {a.loinDepuis && <><dt>Mode</dt><dd>loin depuis {quandDit(a.loinDepuis, maintenant)}</dd></>}
                            {c && <><dt>Aujourd’hui</dt><dd>{c.traites} traités · {c.rdv} RDV · {c.relais} relais</dd></>}
                            {a.etat?.dortPrevenuLe && e.etat === 'endormi' && <><dt>Prévenu</dt><dd>sur son téléphone {quandDit(a.etat.dortPrevenuLe, maintenant)}</dd></>}
                            {a.etat?.version && <><dt>Charte</dt><dd>{a.etat.version}</dd></>}
                            <dt>Porteur</dt><dd>{prenomDuPorteur(a)}{a.appareil ? ` · ${a.appareil}` : ''}</dd>
                          </>
                        )}
                        {p.horsDuTrone && <><dt>À part</dt><dd>La part de la famille reste hors du Trône : rien de Cristal ne passe ici.</dd></>}
                      </dl>
                      {estSouverain && vivant && a && (
                        <div className="ast-gestes">
                          {a.aUnJeton
                            ? <Button size="sm" variant="ghost" disabled={occupe} onClick={() => { void retirer(a); }}>Retirer le jeton</Button>
                            : <Button size="sm" variant="copper" disabled={occupe} onClick={() => { void donner(a); }}>Donner un jeton</Button>}
                          {a.aUnJeton && <Button size="sm" variant="ghost" disabled={occupe} onClick={() => { void donner(a); }}>Nouveau jeton</Button>}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ══ ⑤ LE LIVRE DES CRÉDITS ══ */}
      <LivreDesCredits livre={livre} reglages={reglages} setReglages={setReglages} estSouverain={estSouverain} />

      {/* ══ ⑥ LES RELAIS ══ */}
      <section className="ast-carte" aria-label="Relais">
        <div className="ast-entre">
          <span className="ast-sur">Relais</span>
          <span className="ast-doux">{relais.length === 0 ? 'aucun relais encore' : `les ${relais.length} derniers · ${relaisDuJour.length} aujourd’hui`}</span>
        </div>
        {relais.length === 0 && (
          <p className="ast-doux ast-vide">Un relais est un fait de la Maison qu’un professionnel laisse à un autre : une cliente par son numéro, un jour, une heure, une prestation. Jamais la phrase d’un message.</p>
        )}
        <div className="ast-liste">
          {relais.map((x) => {
            const cle = `relais:${x.id}`;
            const estOuverte = ouvert === cle;
            const qui = clienteDite(x.clientId, x.numeroCle);
            return (
              <div className={`ast-ligne${estOuverte ? ' est-ouverte' : ''}`} key={x.id}>
                <button type="button" className="ast-ligne__tete" aria-expanded={estOuverte} onClick={() => setOuvert(estOuverte ? null : cle)}>
                  <span className="ast-ligne__h">{quandDit(x.quand, maintenant)}</span>
                  <span className="ast-ligne__qui">{nomDe(x.de)} → {nomDe(x.pour)}</span>
                  <span className="ast-ligne__quoi"><b>{RELAIS_DIT[x.genre] ?? x.genre}</b>{x.mot ? ` · ${x.mot}` : ''}</span>
                  <span className="ast-ligne__etat">{etatDuRelaisDit(x, maintenant)}</span>
                </button>
                {estOuverte && (
                  <div className="ast-panneau">
                    <div className="ast-suit">
                      <b>{RELAIS_DIT[x.genre] ?? x.genre}</b>
                      <small>{nomDe(x.de)} pour {nomDe(x.pour)} · {quandDit(x.quand, maintenant)}</small>
                      <span className="ast-suit__actions"><Button size="sm" variant="ghost-invert" onClick={() => setOuvert(null)}>Fermer</Button></span>
                    </div>
                    <div className="ast-corps">
                      {x.mot && <p className="ast-proposition">{x.mot}</p>}
                      <dl className="ast-faits">
                        {qui && <><dt>Cliente</dt><dd>{qui}</dd></>}
                        {x.rdvId && <><dt>Rendez-vous</dt><dd className="ast-mono">{x.rdvId}</dd></>}
                        {x.perimeLe && <><dt>Périme</dt><dd>{quandDit(x.perimeLe, maintenant)}</dd></>}
                        <dt>État</dt><dd>{etatDuRelaisDit(x, maintenant)}</dd>
                      </dl>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ══ ⑦ LE JOURNAL DU JOUR ══ */}
      <section className="ast-carte" aria-label="Le journal du jour">
        <div className="ast-entre">
          <span className="ast-sur">Le journal du jour</span>
          <span className="ast-doux">{journal.length === 0 ? 'aucun geste aujourd’hui' : pluriel(journal.length, 'geste', 'gestes')}</span>
        </div>
        {journal.length === 0 && (
          <p className="ast-doux ast-vide">Les gestes de la Maison faits par un assistant : rendez-vous posés, notes, relais, places tranchées, dépenses. Jamais une lecture, un pouce, une proposition. Le mois entier se relit dans Système › Journal.</p>
        )}
        <div className="ast-journal">
          {journal.map((g) => (
            <div className="ast-geste" key={g.id}>
              <span className="ast-ligne__h">{heureCotonouDite(g.quand) || '·'}</span>
              <span className="ast-ligne__qui">{g.parNom}</span>
              <span className="ast-ligne__quoi">{DIT_VERBE[g.verbe] ?? g.verbe} <b>{g.piece}</b></span>
            </div>
          ))}
        </div>
      </section>

      {/* ══ ⑧ LES RÉGLAGES DE LA VEILLE ══ */}
      <section className="ast-carte" aria-label="Réglages">
        <div className="ast-entre">
          <span className="ast-sur">Réglages de la veille</span>
          <span className="ast-doux">lus par la fonction et par chaque assistant à son passage</span>
        </div>
        <p className="ast-resume">{reglagesDits(r)}.</p>
        {estSouverain && (
          <div className="ast-reglages">
            {CHAMPS_DES_REGLAGES.map((ch) => {
              const brut = reglages.assistants?.[ch.cle];
              const horsBornes = typeof brut === 'number' && brut !== r[ch.cle];
              return (
                <label key={ch.cle}>
                  <span>{ch.libelle}</span>
                  <span className="ast-champ">
                    <Input type="number" min={ch.min} max={ch.max} step={1} inputMode="numeric"
                      value={typeof brut === 'number' ? String(brut) : ''} placeholder={String(r[ch.cle])}
                      onChange={(e) => regle(ch.cle, e.target.value)} aria-label={ch.libelle} />
                    <span className="ast-doux">{ch.unite}</span>
                  </span>
                  {horsBornes && <span className="ast-alerte ast-petit">Hors des bornes ({ch.min} à {ch.max}) : la Maison lit {r[ch.cle]}.</span>}
                </label>
              );
            })}
          </div>
        )}
      </section>

      {/* ══ ⑨ LES TROIS NIVEAUX ══ */}
      <section className="ast-carte" aria-label="Les trois niveaux">
        <div className="ast-entre">
          <span className="ast-sur">Les trois niveaux</span>
          <span className="ast-doux">les mêmes pour les dix</span>
        </div>
        <div className="ast-liste">
          {([
            ['seul', 'Seul', 'ce qu’un professionnel fait sans vous demander', NIVEAUX.seul],
            ['enCarte', 'En carte', 'ce qu’il vous demande, toujours', NIVEAUX.enCarte],
            ['jamais', 'Jamais', 'ce qu’il ne fait pour personne', NIVEAUX.jamais],
          ] as const).map(([k, titre, dit, lignes]) => {
            const cle = `niveau:${k}`;
            const estOuverte = ouvert === cle;
            return (
              <div className={`ast-ligne${estOuverte ? ' est-ouverte' : ''}`} key={k}>
                <button type="button" className="ast-ligne__tete ast-niveau__tete" aria-expanded={estOuverte} onClick={() => setOuvert(estOuverte ? null : cle)}>
                  <span className="ast-ligne__qui">{titre}</span>
                  <span className="ast-ligne__quoi">{dit}</span>
                  <span className="ast-ligne__etat">{pluriel(lignes.length, 'règle', 'règles')}</span>
                </button>
                {estOuverte && (
                  <ul className="ast-niveau">
                    {lignes.map((l) => <li key={l}>{l}</li>)}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

/* ═══ LE LIVRE DES CRÉDITS ════════════════════════════════════════════
   Les compteurs des fonctions qui appellent Claude, rendus à chaque
   professionnel, sur l'enveloppe de 200 $ du mois. Les plafonds se règlent
   ici (`mnd_settings.livreDesCredits`) ; la réserve est ce qui reste. */
function LivreDesCredits({ livre, reglages, setReglages, estSouverain }: {
  livre: LivreDuMois;
  reglages: Settings;
  setReglages: (f: (prev: Settings) => Settings) => void;
  estSouverain: boolean;
}) {
  const [regler, setRegler] = useState(false);
  const lu = plafondsComplets(reglages.livreDesCredits);
  const part = (usd: number, plafond: number) => (plafond > 0 ? Math.min(100, Math.round((usd / plafond) * 100)) : usd > 0 ? 100 : 0);

  const reglePlafond = (id: string, v: string) => {
    const n = v.trim() === '' ? undefined : Number(v.replace(',', '.'));
    setReglages((prev) => {
      const plafonds = { ...(prev.livreDesCredits?.plafonds ?? {}) };
      if (n === undefined || !Number.isFinite(n)) delete plafonds[id]; else plafonds[id] = n;
      return { ...prev, livreDesCredits: { ...(prev.livreDesCredits ?? {}), plafonds } };
    });
  };
  const regleAlerte = (v: string) => {
    const n = v.trim() === '' ? undefined : Number(v) / 100;
    setReglages((prev) => ({ ...prev, livreDesCredits: { ...(prev.livreDesCredits ?? {}), alerteA: n !== undefined && Number.isFinite(n) ? n : undefined } }));
  };

  return (
    <section className="ast-carte ast-livre" aria-label="Le livre des crédits">
      <div className="ast-entre">
        <span className="ast-sur">Le livre des crédits · {moisDit(livre.mois)}</span>
        <span className={`ast-credit est-${livre.alerte}`}>{dollarsDits(livre.totalUsd)} sur {dollarsDits(livre.enveloppeUsd)}</span>
      </div>
      <div className="ast-jauge ast-jauge--total" role="img" aria-label={`${dollarsDits(livre.totalUsd)} dépensés sur ${dollarsDits(ENVELOPPE_USD)} ce mois`}>
        <i className={`est-${livre.alerte}`} style={{ width: `${part(livre.totalUsd, livre.enveloppeUsd)}%` }} />
      </div>
      <div className="ast-livre__lignes">
        {livre.lignes.map((l) => {
          const plafondRegle = reglages.livreDesCredits?.plafonds?.[l.id];
          return (
            <div className={`ast-livre__ligne est-${l.alerte}`} key={l.id}>
              <b>{l.nom}</b>
              <span className="ast-livre__montant">{dollarsDits(l.usd)} <span className="ast-doux">sur {dollarsDits(l.plafond)}</span></span>
              <span className="ast-jauge" aria-hidden="true"><i className={`est-${l.alerte}`} style={{ width: `${part(l.usd, l.plafond)}%` }} /></span>
              <span className="ast-livre__alerte">
                {l.plafond === 0 && l.usd === 0 && l.id !== RESERVE ? 'dans l’abonnement' : ALERTE_DITE[l.alerte]}
              </span>
              {regler && estSouverain && l.id !== RESERVE && (
                <span className="ast-champ">
                  <Input type="number" min={0} max={ENVELOPPE_USD} step={1} inputMode="decimal"
                    value={typeof plafondRegle === 'number' ? String(plafondRegle) : ''} placeholder={String(lu.plafonds[l.id] ?? 0)}
                    onChange={(e) => reglePlafond(l.id, e.target.value)} aria-label={`Plafond de ${l.nom}`} />
                  <span className="ast-doux">$</span>
                </span>
              )}
            </div>
          );
        })}
      </div>
      {lu.depasse > 0 && (
        <p className="ast-alerte ast-note">Les plafonds réglés font {dollarsDits(lu.somme)} : ils dépassent l’enveloppe de {dollarsDits(lu.depasse)}, et la réserve tombe à zéro.</p>
      )}
      {livre.chantiersSansProfessionnel.length > 0 && (
        <p className="ast-alerte ast-note">Des chantiers sans professionnel comptent dans la réserve : {livre.chantiersSansProfessionnel.join(', ')}.</p>
      )}
      <p className="ast-doux ast-vide">
        Opale et Onyx tournent dans l’abonnement Claude de leur porteur : leur part ici reste à zéro. Sans compteur, le livre ne voit pas la discussion du site, le bilan rédigé, la suggestion de fiche. Une ligne passe en cuivre à {Math.round(lu.alerteA * 100)} % de son plafond, en rouge au plafond. Saphir le lit chaque matin.
      </p>
      {estSouverain && (
        <div className="ast-gestes">
          <Button size="sm" variant="ghost" onClick={() => setRegler((v) => !v)}>{regler ? 'J’ai fini de régler' : 'Régler les plafonds'}</Button>
          {regler && (
            <span className="ast-champ">
              <span className="ast-doux">Alerte à</span>
              <Input type="number" min={50} max={100} step={5} inputMode="numeric"
                value={typeof reglages.livreDesCredits?.alerteA === 'number' ? String(Math.round(reglages.livreDesCredits.alerteA * 100)) : ''}
                placeholder={String(Math.round(lu.alerteA * 100))}
                onChange={(e) => regleAlerte(e.target.value)} aria-label="Seuil d’alerte en pour cent" />
              <span className="ast-doux">%</span>
            </span>
          )}
        </div>
      )}
    </section>
  );
}

/* ═══ LE PANNEAU D'UNE CARTE ═══════════════════════════════════════════
   Le résumé ; pour le porteur seul, le contact et son message ; les faits
   du genre ; la proposition ; puis les boutons du genre. « Modifier » ouvre
   le texte ; « Autre heure » demande un jour et une heure ; « Corriger »
   ouvre la dépense. Le panneau ne vit qu'ouvert : le refermer oublie ce
   qu'on y tapait. */
function PanneauCarte({ decision: d, nom, cliente, occupe, maintenant, prestationDite, maitreDit, categories, caisses, fermer, trancher }: {
  decision: Decision;
  nom: string;
  cliente: string;
  occupe: boolean;
  maintenant: number;
  prestationDite: (id: string) => string;
  maitreDit: (id: string | null | undefined) => string;
  categories: string[];
  caisses: string[];
  fermer: () => void;
  trancher: (choix: ChoixDeDecision, extras?: { texte?: string; date?: string; time?: string; faits?: Record<string, unknown> }) => void;
}) {
  const [modifie, setModifie] = useState<string | null>(null);
  const [autreHeure, setAutreHeure] = useState<{ date: string; time: string } | null>(null);
  const [correction, setCorrection] = useState<{ montant: string; objet: string; categorie: string; caisse: string } | null>(null);
  const g = d.genre;
  const placeTenue = g === 'place-tenue';
  const f = d.faits ?? null;
  const rdv = g === 'rdv' ? (f as FaitsDeRdv | null) : null;
  const depense = g === 'depense' ? (f as FaitsDeDepense | null) : null;
  const publication = g === 'publication' ? (f as FaitsDePublication | null) : null;
  const planning = g === 'planning' ? (f as FaitsDePlanning | null) : null;
  const acces = g === 'acces' ? (f as FaitsDAcces | null) : null;
  const effaceLe = (() => {
    const ne = Date.parse(d.creeLe);
    if (!Number.isFinite(ne)) return '';
    const iso = new Date(ne + PURGE_DU_PRIVE_JOURS * 86_400_000 + 3_600_000).toISOString().slice(0, 10);
    return jourDit(iso, false);
  })();
  const libelleDuChoix = (choix: ChoixDeDecision): string => (choix === 'non' ? NON_DIT[g] ?? CHOIX_DIT.non : CHOIX_DIT[choix] ?? choix);
  const titreDeLaProposition = g === 'reponse' ? 'La réponse proposée, dans votre voix'
    : g === 'rdv' ? 'La réponse qui partira après la pose'
      : g === 'publication' ? 'Le texte proposé'
        : placeTenue ? 'Ce qui a été dit' : 'La proposition';

  const montantCorrige = Number(String(correction?.montant ?? '').replace(/\s/g, ''));
  const correctionValable = !!correction && Number.isFinite(montantCorrige) && montantCorrige > 0 && !!correction.objet.trim() && !!correction.categorie.trim();
  const enSaisie = modifie !== null || autreHeure !== null || correction !== null;

  return (
    <div className="ast-panneau">
      <div className="ast-suit">
        <b>{GENRE_DE_DECISION_DIT[g] ?? g}</b>
        <small>{nom} · {quandDit(d.creeLe, maintenant)}{d.echeance ? ` · à trancher avant ${quandDit(d.echeance, maintenant)}` : ''}</small>
        <span className="ast-suit__actions"><Button size="sm" variant="ghost-invert" onClick={fermer}>Fermer</Button></span>
      </div>
      <div className="ast-corps">
        <p className="ast-resume">{d.resume}</p>
        {cliente && <p className="ast-doux">Cliente : {cliente}</p>}

        {d.prive && (
          <div className="ast-prive">
            <span className="ast-sur">Pour vous seulement</span>
            {d.prive.contact && <b className="ast-prive__qui">{d.prive.contact}</b>}
            {d.prive.message && <p className="ast-proposition">{d.prive.message}</p>}
            <span className="ast-doux ast-petit">Effacé dès votre décision, au plus tard dans {PURGE_DU_PRIVE_JOURS} jours{effaceLe ? ` (le ${effaceLe})` : ''}.</span>
          </div>
        )}

        {(rdv || depense || publication || planning || acces) && (
          <dl className="ast-faits">
            {rdv && (
              <>
                <dt>Jour</dt><dd>{jourDit(rdv.date)}</dd>
                <dt>Heure</dt><dd>{heureDite(rdv.time)}</dd>
                <dt>Prestations</dt><dd>{(rdv.services ?? []).map(prestationDite).join(', ')}</dd>
                {rdv.pour && <><dt>Fauteuil</dt><dd>{maitreDit(rdv.pour)}</dd></>}
                {rdv.tenue && <><dt>Place</dt><dd>tenue sur l’autre fauteuil, à confirmer</dd></>}
              </>
            )}
            {depense && (
              <>
                <dt>Montant</dt><dd>{francsDits(depense.montantXof)}</dd>
                <dt>Objet</dt><dd>{depense.objet}</dd>
                <dt>Catégorie</dt><dd>{depense.categorie}</dd>
                <dt>Caisse</dt><dd>{depense.caisse || 'la Caisse Principale'}</dd>
                {depense.porteur && <><dt>Porteur</dt><dd>{depense.porteur}</dd></>}
                {depense.beneficiaire && <><dt>Pour</dt><dd>{depense.beneficiaire}</dd></>}
                {depense.date && <><dt>Date</dt><dd>{jourDit(depense.date)}</dd></>}
              </>
            )}
            {publication && (
              <>
                <dt>Réseau</dt><dd>{publication.reseau}</dd>
                {publication.quand && <><dt>Quand</dt><dd>{publication.quand}</dd></>}
                {publication.apercu && <><dt>Aperçu</dt><dd>{publication.apercu}</dd></>}
              </>
            )}
            {planning && (
              <>
                {planning.jour && <><dt>Jour</dt><dd>{jourDit(planning.jour)}</dd></>}
                <dt>Ce qui change</dt><dd>{planning.quoi}</dd>
              </>
            )}
            {acces && (
              <>
                <dt>Accès</dt><dd>{acces.quoi}</dd>
                {acces.pour && <><dt>Pour</dt><dd>{acces.pour}</dd></>}
              </>
            )}
          </dl>
        )}

        {d.proposition && modifie === null && (
          <>
            <span className="ast-sur">{titreDeLaProposition}</span>
            <p className="ast-proposition">{d.proposition}</p>
          </>
        )}

        {modifie !== null && (
          <label className="ast-modifie">
            <span className="ast-sur">Votre texte</span>
            <Textarea rows={3} value={modifie} onChange={(e) => setModifie(e.target.value)} aria-label="Le texte modifié" />
            <div className="ast-gestes">
              <Button size="sm" variant="copper" disabled={occupe || !modifie.trim()} onClick={() => trancher('modifier', { texte: modifie.trim() })}>
                {g === 'planning' ? 'Garder ma correction' : g === 'rdv' ? 'Poser et envoyer ce texte' : 'Envoyer ce texte'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setModifie(null)}>Reprendre la proposition</Button>
            </div>
          </label>
        )}

        {autreHeure !== null && (
          <div className="ast-modifie">
            <span className="ast-sur">L’heure que vous proposez</span>
            <div className="ast-gestes">
              <Input type="date" value={autreHeure.date} onChange={(e) => setAutreHeure({ ...autreHeure, date: e.target.value })} aria-label="Le jour" />
              <Input type="time" value={autreHeure.time} onChange={(e) => setAutreHeure({ ...autreHeure, time: e.target.value })} aria-label="L’heure" />
            </div>
            <div className="ast-gestes">
              <Button size="sm" variant="copper" disabled={occupe || !autreHeure.date || !autreHeure.time}
                onClick={() => (placeTenue ? trancher('autre-heure', autreHeure) : trancher('autre-heure', { texte: `${autreHeure.date} ${autreHeure.time}` }))}>
                Proposer cette heure
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAutreHeure(null)}>Annuler</Button>
            </div>
            <span className="ast-doux ast-petit">
              {placeTenue
                ? 'La place tenue est libérée ; l’assistant qui l’a posée propose cette heure à la cliente.'
                : 'Rien ne se pose : l’assistant propose cette heure à la cliente au prochain passage.'}
            </span>
          </div>
        )}

        {correction !== null && (
          <div className="ast-modifie">
            <span className="ast-sur">La dépense corrigée</span>
            <div className="ast-correction">
              <label><span>Montant (F)</span>
                <Input type="number" min={1} step={1} inputMode="numeric" value={correction.montant} onChange={(e) => setCorrection({ ...correction, montant: e.target.value })} aria-label="Montant en francs" />
              </label>
              <label><span>Objet</span>
                <Input value={correction.objet} maxLength={80} onChange={(e) => setCorrection({ ...correction, objet: e.target.value })} aria-label="Objet" />
              </label>
              <label><span>Catégorie</span>
                <Input list="ast-categories" value={correction.categorie} maxLength={60} onChange={(e) => setCorrection({ ...correction, categorie: e.target.value })} aria-label="Catégorie" />
              </label>
              <label><span>Caisse</span>
                <Input list="ast-caisses" value={correction.caisse} maxLength={60} placeholder="la Caisse Principale" onChange={(e) => setCorrection({ ...correction, caisse: e.target.value })} aria-label="Caisse" />
              </label>
              <datalist id="ast-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
              <datalist id="ast-caisses">{caisses.map((c) => <option key={c} value={c} />)}</datalist>
            </div>
            <div className="ast-gestes">
              <Button size="sm" variant="copper" disabled={occupe || !correctionValable}
                onClick={() => trancher('corriger', { faits: {
                  ...(depense ?? {}),
                  montantXof: Math.round(montantCorrige), objet: correction.objet.trim(), categorie: correction.categorie.trim(),
                  ...(correction.caisse.trim() ? { caisse: correction.caisse.trim() } : {}),
                } })}>
                Valider la dépense corrigée
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setCorrection(null)}>Annuler</Button>
            </div>
            <span className="ast-doux ast-petit">Elle entre validée à votre nom, avec ces faits.</span>
          </div>
        )}

        {!enSaisie && (
          <div className="ast-choix">
            {d.choix.map((choix, i) => {
              if (CHOIX_AVEC_TEXTE.includes(choix)) {
                const ouvre = choix === 'modifier' ? () => setModifie(d.proposition ?? (planning?.quoi ?? ''))
                  : choix === 'autre-heure' ? () => setAutreHeure({ date: rdv?.date ?? '', time: '' })
                    : () => setCorrection({ montant: depense ? String(depense.montantXof) : '', objet: depense?.objet ?? '', categorie: depense?.categorie ?? '', caisse: depense?.caisse ?? '' });
                return <Button key={choix} size="sm" variant="ghost" disabled={occupe} onClick={ouvre}>{libelleDuChoix(choix)}</Button>;
              }
              return (
                <Button key={choix} size="sm" variant={i === 0 ? 'copper' : 'ghost'} disabled={occupe} onClick={() => trancher(choix)}>
                  {libelleDuChoix(choix)}
                </Button>
              );
            })}
          </div>
        )}
        {placeTenue && <span className="ast-doux ast-petit">Confirmer fait partir la confirmation officielle de la Maison à la cliente ; Non libère la place et le dit à l’assistant qui l’avait posée.</span>}
        {g === 'depense' && !enSaisie && <span className="ast-doux ast-petit">Valider : la dépense entre au Trône déjà validée à votre nom, d’un toucher.</span>}
      </div>
    </div>
  );
}
