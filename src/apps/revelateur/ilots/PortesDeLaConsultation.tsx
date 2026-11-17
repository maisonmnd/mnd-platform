import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { client, lienWhatsApp } from '../maison';
import { campagne, mesure } from '../mesure';
import { raisonDuRefus } from '../refus-du-serveur';
import { payWithKkiapay } from '../../../shared/kkiapay-widget';
import { PRIX_DE_LA_CONSULTATION_PRIVEE_XOF } from '../../../shared/estimation-pur';
import { DUREE_MIN, FORME_DE_LA_CONSULTATION, jourDeCotonou, type Creneau } from '../../../shared/visio-pur';
import type { CarteDesPlaces, CreneauOccupe } from '../../../shared/agenda-pur';
import type { RendezVous } from '../../../shared/envies-pur';
import { TELEPHONE_MONDE, TELEPHONE_PAYS } from '../../../shared/geo';
import { creneauxOccupes, heuresLibres, horizonDuSite, placesEnLigne, type AgendaDeLaMaison } from '../agenda';
import { LETTRES_DE_LA_SEMAINE, flechesDuMois, grilleDuMois, moisApres, titreDuMois } from '../calendrier-du-site-pur';
import { PHRASE_DU_REPLI_DES_PLACES, referenceDeLaReponse } from '../reservation-du-site-pure';
import {
  heureEnMots, ilYAPlusDeDates, insecable, jourEnPuce, jourEnToutesLettres, joursDeLaVisio, joursDesMoments, joursDuCarnet, moisDesJours, numeroEntier,
  numeroLisible, pucesDesJours,
  type Heure, type JourOuvert, type Moment,
} from '../parcours-en-affiches-pur';

/* ══ VOTRE MOMENT, PUIS LE BILLET — 17 novembre 2026 (la consultation en affiches) ══
   Maquette validée par Yéman : « Il faut enlever merci la maison confirme. À
   ce stade rien n'est encore fait, il faut passer à la réservation. » Plus
   d'écran « Merci » : l'affiche touchée mène ici, à son moment, puis à son
   billet.

   TROIS RENDEZ-VOUS, UN SEUL ÉCRAN :
     · LA VISIO : un quart d'heure libre de la fonction `visio-salle`. Son
       lien n'est jamais montré à l'écran : il arrive sur WhatsApp ;
     · LA CONSULTATION PRIVÉE : un moment que le serveur posera (`moments-privee`,
       sinon le Carnet), réglée ici (KkiaPay, que `kkiapay-verify` revérifie sur
       l'identifiant de la consultation), puis posée au Carnet (`reserver-privee`).
       Le moment choisi voyage dans `moment` : avec la consultation déposée,
       avec la vérification du paiement, avec la pose ;
     · LE RITUEL : un créneau du Carnet, posé par `demande-submit`, le chemin
       de la réservation du site.
   LES JOURS ET LES HEURES SONT CEUX DE LA MAISON : les quatre prochains jours
   ouverts, puis « Plus de dates » ouvre le mois ; l'horizon est celui de la
   réservation du site (`horizonDuSite`). L'écran propose, le serveur dispose.

   Le bilan reste sous clé : il s'ouvre au rendez-vous, jamais à la réservation. */

export type Choix =
  | { genre: 'visio' }
  /** `prestations` : la consultation de la porte, dont la durée cadre le créneau. */
  | { genre: 'privee'; prestations: string[] }
  | { genre: 'rituel'; prestations: string[]; lockCount?: number; calibre?: string };

export const base = (chemin: string): string => import.meta.env.BASE_URL.replace(/\/$/, '') + chemin;

/** Une fonction de la Maison, sa réponse lue même quand elle refuse. */
export async function appelle(nom: string, corps: Record<string, unknown>): Promise<Record<string, unknown>> {
  const supabase = await client();
  if (!supabase) throw new Error('hors-ligne');
  const { data, error } = await supabase.functions.invoke(nom, { body: corps });
  if (!error) return (data ?? {}) as Record<string, unknown>;
  try {
    const r = (error as { context?: Response }).context;
    const d = r && typeof r.json === 'function' ? ((await r.json()) as Record<string, unknown>) : null;
    if (d) return d;
  } catch { /* corps illisible */ }
  throw error;
}

/** Les quarts d'heure de visio encore libres ; aucun quand la Maison l'a éteinte ou que le service manque. */
export const creneauxDeLaVisio = (): Promise<Creneau[]> =>
  appelle('visio-salle', { geste: 'creneaux' })
    .then((r) => (r.ok && r.actif && Array.isArray(r.creneaux) ? (r.creneaux as Creneau[]) : []))
    .catch(() => []);

/* ── L'AFFICHE ────────────────────────────────────────────────────────── */

/** Un bloc de couleur, une carte claire au coin coupé, un nom, une ligne, un grand chiffre, un « + ». */
export function Affiche({ couleur, nom, ligne, chiffre, unite, pressee, vers, onClick }: {
  couleur: 'indigo' | 'cuivre' | 'sable'; nom: string; ligne: string;
  chiffre?: string; unite?: readonly string[];
  pressee?: boolean; vers?: string; onClick?: () => void;
}) {
  const dedans = (
    <>
      <span className="ca-aff__c">
        <span className="ca-aff__nom">{nom}</span>
        <span className="ca-aff__ligne">{ligne}</span>
        {chiffre && (
          <span className="ca-aff__chiffre">
            {/* Le nombre tient d'un seul tenant : jamais « 64 » au-dessus de « 000 ». */}
            <span className="ca-aff__nombre">{chiffre}</span>
            {unite && unite.length > 0 && <small>{unite.map((u) => <span key={u}>{u}</span>)}</small>}
          </span>
        )}
      </span>
      <span className="ca-aff__plus" aria-hidden="true">+</span>
    </>
  );
  return vers
    ? <a className={`ca-aff ca-aff--${couleur}`} href={vers}>{dedans}</a>
    : <button type="button" className={`ca-aff ca-aff--${couleur}`} aria-pressed={pressee} disabled={!onClick} onClick={onClick}>{dedans}</button>;
}

/** Le bilan sous clé : remis par la Maison, au rendez-vous. */
export function Scelle({ texte }: { texte: string }) {
  return (
    <div className="ca-scelle">
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><rect x="4" y="9" width="12" height="8" rx="1" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M7 9V6.5a3 3 0 016 0V9" fill="none" stroke="currentColor" strokeWidth="1.3" /></svg>
      <span><b>Votre bilan</b><span>{texte}</span></span>
    </div>
  );
}

/** Un montant dit par `fmtMoney`, coupé pour l'affiche : le grand chiffre
    (ses espaces insécables), puis le signe de la devise. */
export function chiffreEtSigne(montantDit: string): { chiffre: string; signe: string } {
  const m = /^([\d\s.,]*\d)\s*([^\d\s].*)$/.exec(montantDit.trim());
  return m ? { chiffre: insecable(m[1]), signe: m[2].trim() } : { chiffre: insecable(montantDit), signe: '' };
}

/** Son prénom et son numéro : le parcours les tient, « Votre moment » les écrit. */
export type Coordonnees = { prenom: string; numero: string; pays: string };
export const COORDONNEES_VIDES: Coordonnees = { prenom: '', numero: '', pays: TELEPHONE_PAYS[0]?.name ?? 'Bénin' };

/* ── LE CALENDRIER : PLUS DE DATES ────────────────────────────────────── */

function Calendrier({ ouverts, jour, mois, surMois, surJour }: {
  ouverts: readonly JourOuvert[]; jour: string | null; mois: string; surMois: (m: string) => void; surJour: (iso: string) => void;
}) {
  const bornes = moisDesJours(ouverts);
  if (!bornes) return null;
  const libres = new Set(ouverts.map((j) => j.jour));
  const fleches = flechesDuMois(mois, bornes.premier, bornes.dernier);
  return (
    <div className="ca-cal" role="group" aria-label="Le calendrier">
      <div className="ca-cal__tete">
        <button type="button" className="ca-cal__nav" aria-label="Le mois d’avant" disabled={!fleches.precedent} onClick={() => surMois(moisApres(mois, -1))}>‹</button>
        <span>{titreDuMois(mois)}</span>
        <button type="button" className="ca-cal__nav" aria-label="Le mois d’après" disabled={!fleches.suivant} onClick={() => surMois(moisApres(mois, 1))}>›</button>
      </div>
      <div className="ca-cal__grille">
        {LETTRES_DE_LA_SEMAINE.map((l, i) => <span key={`l${i}`} className="ca-cal__j" aria-hidden="true">{l}</span>)}
        {grilleDuMois(mois).cases.map((iso, i) => (iso
          ? <button type="button" key={iso} className="ca-cal__c" aria-label={jourEnToutesLettres(iso)} aria-pressed={jour === iso} disabled={!libres.has(iso)} onClick={() => surJour(iso)}>{Number(iso.slice(8))}</button>
          : <span key={`v${i}`} />))}
      </div>
    </div>
  );
}

/* ── VOTRE MOMENT ─────────────────────────────────────────────────────── */

type Recu = {
  genre: Choix['genre'];
  jour: string;
  heure: string;
  code?: string;
  /** Ce que le serveur dit du rendez-vous posé ; `demande` : rien n'est posé, la Maison rappelle ;
      `a-fixer` : la privée est réglée, son moment vient d'être pris, la Maison le fixe avec elle. */
  etat: 'en-attente' | 'confirme' | 'demande' | 'a-fixer';
  /** Le chemin de la page de la visio, quand le serveur le rend : « Changer l'heure » y mène. */
  changer?: string;
};

type Carnet = { occupes: CreneauOccupe[]; places: CarteDesPlaces };

const QUOI: Readonly<Record<Choix['genre'], string>> = {
  visio: `Visio · ${DUREE_MIN} minutes`,
  privee: 'Consultation privée · à la Maison',
  rituel: 'Votre rituel · à la Maison',
};

/** Le dépôt refusé se reconnaît à ce mot : son message n'est pas fait pour elle. */
const DEPOT_REFUSE = 'depot:';

/** Un chemin de la Maison, et rien d'autre : jamais une adresse venue d'ailleurs. */
const cheminSur = (x: unknown): string => (typeof x === 'string' && /^\/[A-Za-z0-9#]/.test(x) ? x : '');

/** La page du billet de la visio, pour « Changer l'heure » : `changer`, ou le
    `chemin` d'une réponse qui porte un billet et aucun jeton d'entrée (la page
    montre l'heure, la change, l'annule, et n'ouvre jamais la salle). Une
    réponse d'avant, dont le `chemin` ouvre la salle, ne donne rien : le lien
    d'entrée ne part que par WhatsApp. */
const cheminDuBillet = (r: Record<string, unknown>): string =>
  cheminSur(r.changer) || (typeof r.billet === 'string' && !('jeton' in r) ? cheminSur(r.chemin) : '');

export function VotreMoment({
  choix, agenda, creneaux, whatsapp, argent, qui, surQui, depot, surDepot,
  consultation, consultationId, mot, pourQui, surRevenir, surReserve, surLaPrivee, surLesAutres,
}: {
  choix: Choix;
  agenda: AgendaDeLaMaison;
  /** Les quarts d'heure de visio lus à l'ouverture. */
  creneaux: readonly Creneau[];
  whatsapp: string;
  /** Un montant en francs, dit dans la devise de la branche (`fmtMoney`). */
  argent: (xof: number) => string;
  /** Son prénom et son numéro, tenus par le parcours : toucher un jour, une
      heure, « Plus de dates », ou changer de rendez-vous ne les efface pas. */
  qui: Coordonnees;
  surQui: (q: Coordonnees) => void;
  /** La consultation déjà déposée, tenue par le parcours : une visio refusée
      puis la consultation privée n'en déposent pas une seconde. */
  depot: string;
  surDepot: (id: string) => void;
  /** La consultation à déposer (visio, consultation privée) : le parcours la compose, il tient les réponses. */
  consultation?: (o: { id: string; prenom: string; telephone: string; rendezVous: RendezVous; moment?: Moment }) => Record<string, unknown>;
  /** Arrivée par `?privee=<id>` (après la visio) : la consultation existe déjà à la Maison. */
  consultationId?: string;
  /** Ce qui accompagne un rituel réservé : ses réponses, pour la personne qui la reçoit. */
  mot?: string;
  pourQui?: 'moi' | 'enfant';
  surRevenir?: () => void;
  surReserve?: (genre: Choix['genre']) => void;
  /** La visio se refuse (limite, fermée) : la consultation privée reste ouverte. */
  surLaPrivee?: () => void;
  /** Un rituel et un regard ensemble : revenir prendre l'autre rendez-vous. */
  surLesAutres?: () => void;
}) {
  const prix = PRIX_DE_LA_CONSULTATION_PRIVEE_XOF;
  const horizon = useMemo(() => horizonDuSite(), []);
  const aujourdhui = useMemo(() => jourDeCotonou(Date.now()), []);
  const [vifs, setVifs] = useState<readonly Creneau[]>(creneaux);
  const [carnet, setCarnet] = useState<Carnet | 'panne' | null>(null);
  /* Les moments de la privée que le serveur posera ; `null` : pas (encore) dits, le Carnet sinon. */
  const [privees, setPrivees] = useState<JourOuvert[] | null>(null);
  const [essai, setEssai] = useState(0);
  const [jour, setJour] = useState<string | null>(null);
  const [heure, setHeure] = useState<Heure | null>(null);
  const [calendrier, setCalendrier] = useState(false);
  const [mois, setMois] = useState('');
  const { prenom, numero, pays } = qui;
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<ReactNode>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [recu, setRecu] = useState<Recu | null>(null);
  const titre = useRef<HTMLHeadingElement>(null);
  const billet = useRef<HTMLDivElement>(null);
  const indicatif = TELEPHONE_MONDE.find((p) => p.name === pays)?.dial ?? '+229';
  const sansCoordonnees = !!consultationId;

  useEffect(() => { titre.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => { if (recu) billet.current?.focus(); }, [recu]);

  /* LE CARNET, LU EN VIF : les créneaux pris et les places en ligne de tout
     l'horizon, d'un coup, comme la réservation du site. Une panne se dit. */
  useEffect(() => {
    if (choix.genre === 'visio') return undefined;
    let vivant = true;
    setCarnet(null);
    setPrivees(null);
    const leCarnet = () => Promise.all([creneauxOccupes(agenda.branchId, horizon.du, horizon.au), placesEnLigne(agenda.branchId, horizon.du, horizon.au)])
      .then(([occupes, places]) => { if (vivant) setCarnet({ occupes, places }); })
      .catch(() => { if (vivant) setCarnet('panne'); });
    if (choix.genre === 'privee') {
      /* LA PRIVÉE, AUX MOMENTS QUE LE SERVEUR POSERA. Une fonction d'avant ne
         connaît pas ce geste : le Carnet, comme pour un rituel. */
      appelle('visio-salle', { geste: 'moments-privee', branchId: agenda.branchId, horizonJours: horizon.jours.length })
        .then((r) => {
          const jours = r.ok === true && r.lisible !== false ? joursDesMoments(r.moments) : null;
          if (!vivant) return;
          if (jours) setPrivees(jours); else void leCarnet();
        })
        .catch(() => { if (vivant) void leCarnet(); });
    } else void leCarnet();
    return () => { vivant = false; };
  }, [choix.genre, agenda.branchId, horizon.du, horizon.au, horizon.jours.length, essai]);

  const prestations = choix.genre === 'visio' ? null : choix.prestations;
  const ouverts: JourOuvert[] | null = useMemo(() => {
    if (!prestations) return joursDeLaVisio(vifs);
    if (privees) return privees;
    if (!carnet || carnet === 'panne') return null;
    return joursDuCarnet(horizon.jours, (iso) => heuresLibres({ agenda, dateIso: iso, serviceIds: prestations, occupes: carnet.occupes, places: carnet.places }));
  }, [prestations, vifs, privees, carnet, horizon.jours, agenda]);

  const duJour = ouverts?.find((j) => j.jour === jour)?.heures ?? [];
  const choisisLeJour = (iso: string) => { setJour(iso); setHeure(null); setErreur(null); };
  const ouvreLeCalendrier = () => {
    if (!calendrier && ouverts) setMois(jour ? jour.slice(0, 7) : moisDesJours(ouverts)?.premier ?? '');
    setCalendrier(!calendrier);
  };
  const ecrire = lienWhatsApp(whatsapp, 'Bonjour, je souhaite prendre rendez-vous après ma consultation sur le site.');
  const relisLeCarnet = () => { setJour(null); setHeure(null); setEssai((n) => n + 1); };

  /* ── LE DÉPÔT : la consultation part à la Maison avec ses réponses, jamais un montant. ── */
  const depose = async (rendezVous: RendezVous, moment?: Moment): Promise<string> => {
    if (consultationId) return consultationId;
    /* Déjà déposée (une visio refusée, puis la privée ; un paiement repris) : la même, jamais une seconde. */
    if (depot) return depot;
    if (!consultation) throw new Error('sans consultation');
    const propose = `cg-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const data = consultation({ id: propose, prenom: prenom.trim(), telephone: numeroEntier(indicatif, numero), rendezVous, ...(moment ? { moment } : {}) });
    const r = await appelle('push-notify', {
      mode: 'tunnel-submit',
      consultation: { id: propose, data },
      title: `Consultation du site · ${prenom.trim()}`,
      body: `${rendezVous === 'visio' ? 'Visio' : 'Consultation privée'} · ${jour ? jourEnToutesLettres(jour) : ''} · ${heure?.dit ?? ''}`,
      url: '/trone/#/consultations',
    });
    if (!r.ok) throw new Error(`${DEPOT_REFUSE}${String(r.error ?? '')}`);
    /* Le serveur fait l'identifiant et le rend (`id`) ; une fonction d'avant garde celui qu'on propose. */
    const id = typeof r.id === 'string' && FORME_DE_LA_CONSULTATION.test(r.id) ? r.id : propose;
    surDepot(id);
    mesure('consultation_deposee', { genre: rendezVous });
    return id;
  };

  const reserveLaVisio = async (h: Heure) => {
    const id = await depose('visio');
    const r = await appelle('visio-salle', { geste: 'reserver', debut: h.cle, nom: prenom.trim(), telephone: numeroEntier(indicatif, numero), consultationId: id });
    if (r.ok) {
      mesure('visio_reservee');
      const debut = typeof r.debut === 'string' && Number.isFinite(Date.parse(r.debut)) ? r.debut : h.cle;
      setRecu({
        genre: 'visio', jour: jourDeCotonou(Date.parse(debut)), heure: h.dit, etat: 'en-attente',
        ...(typeof r.reference === 'string' && r.reference ? { code: r.reference } : {}),
        /* « Changer l'heure » mène à la page de la visio que le serveur nomme (`changer`), jamais à la salle par
           son chemin à jeton (`chemin`) : le lien d'entrée ne part que par WhatsApp. */
        ...(cheminDuBillet(r) ? { changer: cheminDuBillet(r) } : {}),
      });
      surReserve?.('visio');
      return;
    }
    /* Le refus : `motif` aujourd'hui, `raison` pour la limite d'une visio par numéro. */
    const motif = String(r.motif ?? r.raison ?? '');
    const laPrivee = surLaPrivee && <> <button type="button" className="ca-revenir" onClick={surLaPrivee}>Réserver une consultation privée</button></>;
    if (motif === 'pris') {
      setErreur('Ce quart d’heure vient d’être pris. Choisissez-en un autre.');
      setHeure(null);
      setVifs(await creneauxDeLaVisio());
    } else if (motif === 'limite') {
      const quand = typeof r.prochaineLe === 'string' && /^\d{4}-\d{2}-\d{2}/.test(r.prochaineLe) ? jourEnToutesLettres(r.prochaineLe.slice(0, 10)).toLowerCase() : '';
      setErreur(<>{quand ? `Votre prochaine visio se réserve à partir du ${quand}.` : 'Une visio a déjà été prise à ce numéro.'}{laPrivee}</>);
    } else if (motif === 'deja') {
      setErreur('Une visio est déjà réservée à ce numéro. Son lien est dans votre WhatsApp.');
    } else if (motif === 'numero') {
      setErreur(<>Ce numéro ne reçoit pas WhatsApp : le lien de la visio ne pourrait pas vous parvenir.{laPrivee}</>);
    } else if (motif === 'fermee') {
      setErreur(<>La visio ne se réserve pas pour l’instant.{laPrivee}</>);
    } else if (motif === 'rate_limited') {
      setErreur('Trop d’essais d’un coup. Réessayez dans quelques minutes.');
    } else {
      setErreur('La réservation n’a pas abouti. Réessayez, ou écrivez à la Maison.');
    }
  };

  /* Le serveur relit la transaction chez KkiaPay et tient la barre : c'est LUI qui dit « reçu ». Le créneau part avec. */
  const verifie = async (transactionId: string, id: string, moment: Moment, h: Heure) => {
    const r = await appelle('kkiapay-verify', { transactionId, apptId: '', consultationId: id, expectedXof: prix, branchId: agenda.branchId, moment });
    if (r.ok !== true) throw new Error(`Vérification impossible pour l’instant. Gardez votre référence : ${transactionId}.`);
    mesure('consultation_reglee');
    /* RÉGLÉE, ELLE SE POSE AU CARNET à son moment (`reserver-privee`). Une
       fonction d'avant ne connaît pas ce geste, et une heure prise entre-temps
       se refuse : c'est réglé, et la Maison fixe l'heure avec elle. */
    const pose = await appelle('visio-salle', { geste: 'reserver-privee', consultationId: id, moment }).catch(() => ({} as Record<string, unknown>));
    const tenu = pose.ok === true;
    /* Refusée par la fonction neuve (le moment vient d'être pris : `momentRefuse`) ; une fonction d'avant ne connaît pas le geste. */
    const refusee = !tenu && typeof pose.motif === 'string' && pose.motif !== 'geste inconnu';
    const dit = (tenu && pose.moment && typeof pose.moment === 'object' ? pose.moment : {}) as Partial<Moment>;
    const jour = typeof dit.jour === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dit.jour) ? dit.jour : moment.jour;
    const heure = typeof dit.heure === 'string' && /^\d{1,2}:\d{2}$/.test(dit.heure) ? heureEnMots(dit.heure) : h.dit;
    setRecu({ genre: 'privee', jour, heure, code: transactionId, etat: tenu ? 'confirme' : refusee ? 'a-fixer' : 'demande' });
    surReserve?.('privee');
  };
  const regleLaPrivee = async (h: Heure, iso: string) => {
    const moment: Moment = { jour: iso, heure: h.cle };
    const id = await depose('privee', moment);
    if (reference) { await verifie(reference, id, moment, h); return; }
    const { transactionId } = await payWithKkiapay({
      amountXof: prix, partnerId: id, branchId: agenda.branchId,
      phone: numero.replace(/\D/g, '') || undefined, name: prenom.trim() || undefined,
    });
    /* L'argent est parti : la référence se garde AVANT la vérification. */
    setReference(transactionId);
    await verifie(transactionId, id, moment, h);
  };

  const reserveLeRituel = async (h: Heure, iso: string) => {
    if (choix.genre !== 'rituel') return;
    const supabase = await client();
    if (!supabase) { setErreur('La réservation n’est pas reliée pour l’instant. Écrivez-nous sur WhatsApp.'); return; }
    const { data, error } = await supabase.functions.invoke('demande-submit', {
      body: {
        genre: 'rdv',
        data: {
          prenom: prenom.trim(), telephone: numero, dial: indicatif, besoin: 'entretien', mot: mot ?? '',
          serviceIds: choix.prestations, date: iso, time: h.cle, master: h.maitre ?? '',
          ...(choix.lockCount ? { lockCount: choix.lockCount, ...(choix.calibre ? { calibre: choix.calibre } : {}) } : {}),
          pourQui: pourQui === 'enfant' ? 'enfant' : 'moi',
          page: location.pathname, campagne: campagne() || undefined, consentement: true,
        },
      },
    });
    const r = (data ?? {}) as { ok?: boolean; confirme?: boolean; etat?: unknown; apptId?: string; reference?: string };
    if (error || !r.ok) {
      const code = await raisonDuRefus(data, error);
      if (code.includes('creneau')) {
        setErreur('Cette heure vient d’être prise. Choisissez-en une autre.');
        relisLeCarnet();
      } else if (code.includes('rate')) setErreur('Beaucoup de demandes d’un coup. Réessayez dans quelques minutes.');
      else if (code.includes('telephone')) setErreur('Il nous manque votre numéro pour vous répondre.');
      else if (code.includes('retiree') || code.includes('consultation') || code.includes('prestation')) setErreur('Ce rituel ne se réserve plus en ligne. Écrivez-nous sur WhatsApp.');
      else setErreur('L’envoi n’a pas abouti. Écrivez-nous sur WhatsApp, nous vous répondons.');
      return;
    }
    mesure('reservation_demandee', { parcours: 'entretien', genre: 'rdv', chemin: 'consultation' });
    /* `etat` : le rendez-vous naît en attente de son « Je confirme » dès que le serveur le dit ; sinon, comme aujourd'hui. */
    const etat: Recu['etat'] = r.etat === 'en-attente' ? 'en-attente' : r.etat === 'confirme' || r.confirme === true ? 'confirme' : 'demande';
    const code = etat === 'demande' ? '' : referenceDeLaReponse(r);
    setRecu({ genre: 'rituel', jour: iso, heure: h.dit, etat, ...(code ? { code } : {}) });
    surReserve?.('rituel');
  };

  const envoie = async (e: FormEvent) => {
    e.preventDefault();
    if (envoi || !jour || !heure) return;
    if (!sansCoordonnees) {
      if (prenom.trim().length < 2) { setErreur('Votre prénom, pour que la Maison vous appelle par votre nom.'); return; }
      if (!numeroLisible(numero)) { setErreur('Il nous manque votre numéro WhatsApp.'); return; }
    }
    setErreur(null);
    setEnvoi(true);
    try {
      if (choix.genre === 'visio') await reserveLaVisio(heure);
      else if (choix.genre === 'privee') await regleLaPrivee(heure, jour);
      else await reserveLeRituel(heure, jour);
    } catch (x) {
      const dit = x instanceof Error ? x.message : '';
      /* Ce que disent le paiement et sa vérification est écrit pour elle (« Gardez votre référence… ») ; le reste non. */
      const pourElle = choix.genre === 'privee' && dit !== '' && !dit.startsWith(DEPOT_REFUSE) && dit !== 'hors-ligne' && dit !== 'sans consultation' && / /.test(dit);
      setErreur(pourElle ? dit
        : dit.includes('rate') ? 'Trop d’envois d’un coup. Réessayez dans quelques minutes.'
          : 'L’envoi n’a pas abouti. Réessayez, ou écrivez à la Maison.');
    } finally {
      setEnvoi(false);
    }
  };

  /* ── LE BILLET ── */
  if (recu) {
    const note = recu.genre === 'visio'
      ? 'Le lien arrive sur votre WhatsApp. Répondez « Je confirme » : sans réponse, la place se libère.'
      : recu.genre === 'privee'
        ? (recu.etat === 'confirme' ? 'C’est réglé. Votre confirmation arrive sur votre WhatsApp.'
          : recu.etat === 'a-fixer' ? 'Ce moment vient d’être pris : la Maison fixe le vôtre avec vous sur WhatsApp.'
            : 'C’est réglé. La Maison vous confirme l’heure sur WhatsApp.')
        : recu.etat === 'en-attente'
          ? 'Répondez « Je confirme » sur WhatsApp. Si un acompte est demandé, il se règle par le lien reçu.'
          : recu.etat === 'confirme' ? 'Votre confirmation arrive sur votre WhatsApp.' : 'La Maison vous confirme sur WhatsApp.';
    return (
      <div className="ca-ecran" ref={billet} tabIndex={-1} role="status">
        <p className="ca-sur">{recu.genre === 'privee' && recu.etat !== 'confirme' ? 'C’est réglé' : recu.etat === 'demande' ? 'C’est demandé' : 'C’est réservé'}</p>
        <div className="ca-billet">
          <div className="ca-billet__c">
            <span className="ca-sur">{QUOI[recu.genre]}</span>
            <span className="ca-billet__jour">{recu.etat === 'a-fixer' ? 'À fixer avec la Maison' : <>{jourEnToutesLettres(recu.jour)}<br />{recu.heure}</>}</span>
            {recu.code && <span className="ca-billet__code"><span>{recu.genre === 'privee' ? 'Votre référence' : 'Votre code'}</span><b>{recu.code}</b></span>}
          </div>
        </div>
        <p className="ca-note">{note}</p>
        {recu.genre === 'visio' && (
          <>
            {/* Le geste vit sur la page de la visio : le billet y mène quand le serveur en rend le chemin, sinon par le lien du WhatsApp. */}
            {recu.changer
              ? <a className="ca-revenir" href={recu.changer}>Changer l’heure</a>
              : <p className="ca-note">Changer l’heure : par le lien reçu sur WhatsApp.</p>}
            <p className="ca-note">Jusqu’à 2 heures avant, deux fois au plus.</p>
          </>
        )}
        {recu.genre !== 'rituel' && <Scelle texte="Il s’ouvre à ce rendez-vous." />}
        {surLesAutres && <button type="button" className="ca-revenir" onClick={surLesAutres}>Mon autre rendez-vous</button>}
      </div>
    );
  }

  /* ── VOTRE MOMENT ── */
  const sur = choix.genre === 'visio' ? 'Visio · gratuite' : choix.genre === 'privee' ? `Consultation privée · ${argent(prix)}` : 'Votre rituel · à la Maison';
  const geste = envoi ? 'Un instant'
    : choix.genre === 'visio' ? 'Réserver ma visio'
      : choix.genre === 'privee' ? (reference ? 'Revérifier mon paiement' : `Régler ${argent(prix)} et réserver`)
        : 'Réserver mon rituel';
  return (
    <form className="ca-ecran" onSubmit={(e) => void envoie(e)} noValidate>
      <p className="ca-sur">{sur}</p>
      <h2 className="ca-titre" ref={titre} tabIndex={-1}>Votre moment</h2>
      {carnet === 'panne' && prestations && (
        <>
          <p className="ca-note">{PHRASE_DU_REPLI_DES_PLACES}</p>
          <button type="button" className="ca-cta" onClick={relisLeCarnet}>Réessayer</button>
          <a className="ca-revenir" href={ecrire} target="_blank" rel="noopener">Écrire à la Maison</a>
        </>
      )}
      {!ouverts && carnet !== 'panne' && <p className="ca-note" role="status">Un instant…</p>}
      {ouverts && ouverts.length === 0 && (
        <>
          <p className="ca-note">Aucune place libre pour l’instant.</p>
          <a className="ca-cta" href={ecrire} target="_blank" rel="noopener">Écrire à la Maison</a>
        </>
      )}
      {ouverts && ouverts.length > 0 && (
        <>
          <div className="ca-puces" role="group" aria-label="Le jour">
            {pucesDesJours(ouverts, jour).map((iso) => (
              <button type="button" key={iso} className="ca-puce" aria-pressed={jour === iso} onClick={() => choisisLeJour(iso)}>{jourEnPuce(iso, aujourdhui)}</button>
            ))}
            {ilYAPlusDeDates(ouverts) && (
              <button type="button" className="ca-puce ca-puce--plus" aria-expanded={calendrier} onClick={ouvreLeCalendrier}>{calendrier ? 'Fermer le calendrier' : 'Plus de dates'}</button>
            )}
          </div>
          {calendrier && <Calendrier ouverts={ouverts} jour={jour} mois={mois} surMois={setMois} surJour={choisisLeJour} />}
          {jour && (
            <div className="ca-puces" role="group" aria-label="L’heure">
              {duJour.map((h) => (
                <button type="button" key={h.cle} className="ca-puce" aria-pressed={heure?.cle === h.cle} onClick={() => { setHeure(h); setErreur(null); }}>{h.dit}</button>
              ))}
            </div>
          )}
          {!sansCoordonnees && (
            <>
              <div className="ca-champ"><label htmlFor="ca-prenom">Prénom</label><input id="ca-prenom" name="prenom" type="text" autoComplete="given-name" value={prenom} onChange={(e) => surQui({ ...qui, prenom: e.target.value })} /></div>
              <div className="ca-champ">
                <label htmlFor="ca-numero">WhatsApp</label>
                <div className="ca-numero">
                  <select aria-label="Indicatif du pays" value={pays} onChange={(e) => surQui({ ...qui, pays: e.target.value })}>
                    <optgroup label="Les plus fréquents">{TELEPHONE_PAYS.map((p) => <option key={p.name} value={p.name}>{p.dial} {p.name}</option>)}</optgroup>
                    <optgroup label="Tous les pays">{TELEPHONE_MONDE.slice(TELEPHONE_PAYS.length).map((p) => <option key={p.name} value={p.name}>{p.dial} {p.name}</option>)}</optgroup>
                  </select>
                  <input id="ca-numero" name="numero" type="tel" inputMode="tel" autoComplete="tel-national" value={numero} onChange={(e) => surQui({ ...qui, numero: e.target.value })} />
                </div>
              </div>
            </>
          )}
          <button type="submit" className="ca-cta" disabled={!jour || !heure || envoi}>{geste}</button>
        </>
      )}
      {erreur && <p className="ca-erreur" role="alert">{erreur}</p>}
      {surRevenir && <button type="button" className="ca-revenir" onClick={surRevenir}>Revenir</button>}
    </form>
  );
}
