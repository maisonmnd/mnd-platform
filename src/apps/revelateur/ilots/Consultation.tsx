import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { COMMUN } from '../contenu';
import { client, lienWhatsApp, maison } from '../maison';
import { mesure } from '../mesure';
import { agendaDeLaMaison, prestationsReservables, type AgendaDeLaMaison, type PrestationPublique } from '../agenda';
import { prixSelonLeCalibre, representantDeLaBande, type Bande, type ContexteDuCalibre } from '../prix-calibre';
import { fmtMoney } from '../../../shared/currency';
import { kkiapayPeutSOuvrir } from '../../../shared/kkiapay-widget';
import { PRIX_DE_LA_CONSULTATION_PRIVEE_XOF } from '../../../shared/estimation-pur';
import { DUREE_MIN, FORME_DE_LA_CONSULTATION, type Creneau } from '../../../shared/visio-pur';
import type { Besoin as Porte } from '../../../shared/qualification';
import {
  ENVIES_MAX, REPONSES_DU_DEBUT, affichesADefaire, affichesDesEnvies, affichesDuModele, basculeUneEnvie, enviesAffichees, enviesSures,
  dureeAuCompte, etatEnLigne, parcoursDe, rangeLesChoisies, seTouche, tarifDesNaturels, tientDansUneJournee,
  type Affiches, type Contexte, type Envie, type ReglagesDesEnvies, type ReponseDuDebut,
} from '../../../shared/envies-pur';
import {
  AGES, AVEC, A_PARTIR_DE, DUREES, ENSUITES, EPAISSEUR_INCONNUE, FACONS, LONGUEURS_DITES, NOMBRE_DE_QUESTIONS, REPONSES_VIDES,
  apresLaReponseDuDebut, besoinsAMontrer, comptesDesTranches, besoinsDuSite, consultationADeposer, ecarteesParLaPeau, ecranPrecedent, ecranSuivant, ecranTenu,
  epaisseursDe, ficheADefaire, ficheDuModele, insecable, motDuRituel, motsDuRendezVous, nombreTape, numeroDe, pasFaits, plageDeLEpaisseur, plageDite,
  prixAPartirDe, trancheDuNombre, tranchesDe,
  type BesoinDuSite, type Ecran, type Epaisseur, type Fiche, type Reponses,
} from '../parcours-en-affiches-pur';
import { Affiche, COORDONNEES_VIDES, Scelle, VotreMoment, base, chiffreEtSigne, creneauxDeLaVisio, type Choix, type Coordonnees } from './PortesDeLaConsultation';
import './consultation.css';

/* ══ LA CONSULTATION EN AFFICHES — 17 novembre 2026 ════════════════════════
   Maquette « La consultation en affiches », validée par Yéman : « construis ».
   « Dans le parcours de consultation gratuite trop d'écriture. Besoin de
   faire des affiches dans le style de Canal Box. Il faut enlever merci la
   maison confirme. Il ne faut pas permettre d'avoir des bilans sans prendre
   de RDV sinon tout le monde nous trichera. »

   UNE QUESTION PAR ÉCRAN, cinq questions, puis le rendez-vous : « 1 sur 5 ·
   Pour qui ? », « 2 sur 5 · Vos locks ? », trois questions selon la réponse,
   l'écran du rendez-vous, « Votre moment », le billet. Un toucher avance
   quand la réponse est unique.

   PLUS DE LECTURE, PLUS D'ESTIMATION : ce navigateur ne calcule et n'affiche
   ni prestation proposée ni fourchette. Le bilan est remis par la Maison, au
   rendez-vous. Les seuls prix montrés : le rituel d'une envie du groupe
   Rituel et le rituel de « Cheveux libres » (au catalogue, « à partir de,
   confirmé au fauteuil »), la consultation privée, le tarif des cheveux
   naturels.

   LES ENVIES VIENNENT DU TRÔNE (document `mnd_envies`, Système › Besoins et
   règles › Vos envies) : leur groupe (Rituel, Visio, Consultation privée),
   leur rituel, les restrictions. Les besoins de chaque envie viennent de
   `mnd_besoins`. L'aiguillage vit dans `envies-pur`, les écrans dans
   `parcours-en-affiches-pur` ; rien n'est écrit ici en dur. Sans document
   lisible, la semence prend le relais.

   LE NAVIGATEUR N'ÉCRIT JAMAIS EN BASE : la visio se réserve par
   `visio-salle`, la consultation se dépose par `push-notify`, le rituel se
   pose par `demande-submit` (voir PortesDeLaConsultation). */

type Donnees = {
  agenda: AgendaDeLaMaison;
  envies: ReglagesDesEnvies;
  besoins: BesoinDuSite[];
  /** Ce que la garde « peau » écarte, réglé au Trône. */
  ecartees: string[];
  devise: string;
  whatsapp: string;
};

async function charge(): Promise<Donnees> {
  const [supabase, m, agenda] = await Promise.all([client(), maison(), agendaDeLaMaison()]);
  if (!supabase || !m || !agenda) throw new Error('la Maison ne répond pas');
  const { data, error } = await supabase.from('documents').select('key,data').in('key', ['mnd_envies', 'mnd_besoins']);
  if (error) throw new Error('réglages illisibles');
  const doc = (k: string): unknown => (data ?? []).find((x) => x.key === k)?.data;
  return {
    agenda,
    /* Absent (pas encore amorcé) ou abîmé : la semence, la même qu'au Trône. */
    envies: enviesSures(doc('mnd_envies')),
    besoins: besoinsDuSite(doc('mnd_besoins')),
    ecartees: ecarteesParLaPeau(doc('mnd_besoins')),
    devise: m.devise,
    whatsapp: m.whatsapp,
  };
}

/** Le point dessiné : la grosseur d'une lock. */
const Point = ({ r }: { r: number }) => (
  <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><circle cx="13" cy="13" r={r} fill="currentColor" /></svg>
);

export default function Consultation() {
  const [d, setD] = useState<Donnees | null>(null);
  const [panne, setPanne] = useState(false);
  /* Les quarts d'heure de visio : `null` tant qu'on ne sait pas. */
  const [creneaux, setCreneaux] = useState<Creneau[] | null>(null);
  const [ecranVoulu, setEcran] = useState<Ecran>('pour');
  const [repBrutes, setRep] = useState<Reponses>(REPONSES_VIDES);
  /* Son prénom et son numéro vivent ici : rien de ce qu'elle touche sur « Votre moment » ne les efface. */
  const [qui, setQui] = useState<Coordonnees>(COORDONNEES_VIDES);
  /* La consultation déposée (son identifiant) : une seule, quel que soit le rendez-vous qu'elle prend ensuite. */
  const [depot, setDepot] = useState('');
  const [toutVoir, setToutVoir] = useState<string[]>([]);
  const [choix, setChoix] = useState<Choix | null>(null);
  const [reserves, setReserves] = useState<Choix['genre'][]>([]);
  /* L'arrivée par `?privee=<id>`, après la visio : la consultation privée, directement. */
  const privee = useMemo(() => { try { const p = new URLSearchParams(location.search).get('privee') ?? ''; return FORME_DE_LA_CONSULTATION.test(p) ? p : ''; } catch { return ''; } }, []);
  const titre = useRef<HTMLHeadingElement>(null);
  const haut = useRef<HTMLDivElement>(null);
  const aBouge = useRef(false);

  useEffect(() => {
    charge().then(setD).catch(() => setPanne(true));
    void creneauxDeLaVisio().then(setCreneaux);
  }, []);
  /* Un écran neuf se lit depuis son titre, et se voit depuis son haut. */
  useEffect(() => {
    if (!aBouge.current) return;
    titre.current?.focus({ preventScroll: true });
    const h = haut.current;
    if (h && h.getBoundingClientRect().top < 0) h.scrollIntoView({ block: 'start' });
  }, [ecranVoulu, choix]);

  /* SES ENVIES SE RECONNAISSENT À LEUR IDENTIFIANT, et se relisent contre les
     réglages : une envie retirée, écartée, restée sans nom ou interdite par
     une autre sort d'elle-même, et ses besoins avec elle. */
  const rep: Reponses = useMemo(() => {
    if (!d) return repBrutes;
    const envies = rangeLesChoisies(d.envies, repBrutes.envies, repBrutes.locks);
    if (envies.length === repBrutes.envies.length) return repBrutes;
    return { ...repBrutes, envies, besoins: repBrutes.besoins.filter((b) => d.besoins.some((x) => x.id === b && envies.includes(x.famille))) };
  }, [d, repBrutes]);
  const parcours = rep.locks ? parcoursDe(rep.locks) : null;
  const tranches = useMemo(() => tranchesDe(d?.agenda.bandes ?? []), [d]);
  const epaisseurs = useMemo(() => epaisseursDe(tranches), [tranches]);
  const epaisseur: Epaisseur | null = epaisseurs.find((e) => e.id === rep.epaisseur) ?? null;
  const tranche = tranches.find((t) => t.id === rep.calibre) ?? null;
  const montrees: Envie[] = d ? enviesAffichees(d.envies, rep.locks) : [];
  const choisies: Envie[] = d ? rep.envies.map((id) => d.envies.envies.find((e) => e.id === id)).filter((e): e is Envie => !!e) : [];
  const besoinsChoisis = d ? d.besoins.filter((b) => rep.besoins.includes(b.id)) : [];
  const besoinsDesEnvies = d ? d.besoins.filter((b) => rep.envies.includes(b.famille)) : [];
  /* Une envie sans besoin écrit : la question « Ce qui vous parle » ne se pose pas. */
  const sautes: Ecran[] = besoinsDesEnvies.length === 0 ? ['besoins'] : [];

  /* Aucune impasse : sans plus aucune envie choisie alors qu'il en reste, elle revient à « Vos envies ». */
  const ecran = ecranTenu(ecranVoulu, parcours, { choisies: d ? rep.envies.length : 1, montrees: montrees.length });
  const va = (e: Ecran) => { aBouge.current = true; setChoix(null); setEcran(e); };
  const avance = () => va(ecranSuivant(ecran, parcours, sautes));
  const recule = () => va(ecranPrecedent(ecran, parcours, sautes));
  const pose = (neuf: Partial<Reponses>) => setRep((r) => ({ ...r, ...neuf }));
  /* Tout montant passe par `fmtMoney`, et ne se coupe jamais sur deux lignes. */
  const argent = (xof: number) => insecable(fmtMoney(xof, d?.devise ?? 'XOF'));

  if (panne) {
    return (
      <div className="ca">
        <div className="ca-ecran">
          <p className="ca-sur">La consultation</p>
          <h2 className="ca-titre">La consultation ne répond pas.</h2>
          <a className="ca-cta" href={lienWhatsApp(COMMUN.editeur.telephone.replace(/\D/g, ''), COMMUN.messages.inconnu)} target="_blank" rel="noopener">Écrire à la Maison</a>
        </div>
      </div>
    );
  }

  const pas = (
    <div className="ca-pas" aria-hidden="true">
      {Array.from({ length: NOMBRE_DE_QUESTIONS }, (_, i) => <i key={i} className={i < pasFaits(ecran, parcours) ? 'est-fait' : ''} />)}
    </div>
  );
  const numero = numeroDe(ecran, parcours);
  const sur = (suite = '') => (numero ? <p className="ca-sur">{numero} sur {NOMBRE_DE_QUESTIONS}{suite ? ` · ${suite}` : ''}</p> : null);
  const revenir = <button type="button" className="ca-revenir" onClick={recule}>Revenir</button>;
  const cadre = (dedans: ReactNode, vif = true) => (
    <div className="ca" ref={haut}>
      {pas}
      <div className="ca-ecran" key={choix ? 'moment' : ecran} aria-live={vif ? 'polite' : undefined}>{dedans}</div>
    </div>
  );

  /* ── APRÈS LA VISIO : LA CONSULTATION PRIVÉE, DIRECTEMENT ── */
  if (privee) {
    if (!d) return <div className="ca"><p className="ca-note" role="status">Un instant…</p></div>;
    return (
      <div className="ca" ref={haut}>
        <VotreMoment
          choix={{ genre: 'privee', prestations: prestationsReservables(d.agenda, 'reparation').slice(0, 1).map((s) => s.id) }}
          agenda={d.agenda} creneaux={[]} whatsapp={d.whatsapp} argent={argent} qui={qui} surQui={setQui} depot={privee} surDepot={setDepot} consultationId={privee}
        />
        <a className="ca-revenir" href={base('/consultation/')}>Recommencer la consultation</a>
      </div>
    );
  }

  /* ── 1 SUR 5 · POUR QUI ? ── */
  if (ecran === 'pour') {
    const choisit = (pour: 'moi' | 'enfant') => {
      if (!rep.pour) mesure('consultation_commencee');
      pose({ pour });
      va('locks');
    };
    return cadre(
      <>
        {sur()}
        <h2 className="ca-titre" ref={titre} tabIndex={-1}>Pour qui ?</h2>
        <div className="ca-affiches">
          <Affiche couleur="indigo" nom="Moi" ligne="Ma couronne" pressee={rep.pour === 'moi'} onClick={() => choisit('moi')} />
          <Affiche couleur="cuivre" nom="Mon enfant" ligne="Sa couronne" pressee={rep.pour === 'enfant'} onClick={() => choisit('enfant')} />
        </div>
      </>,
    );
  }

  /* ── 2 SUR 5 · VOS LOCKS ? ── */
  if (ecran === 'locks') {
    const choisit = (locks: ReponseDuDebut) => {
      /* Sans changer de parcours, ses réponses restent ; les envies que la réponse écarte sortent d'elles-mêmes. */
      setRep(apresLaReponseDuDebut(rep, locks));
      mesure('parcours_choisi', { parcours: parcoursDe(locks), genre: 'consultation' });
      aBouge.current = true;
      setChoix(null);
      setEcran(ecranSuivant('locks', parcoursDe(locks)));
    };
    return cadre(
      <>
        {sur()}
        <h2 className="ca-titre" ref={titre} tabIndex={-1}>{rep.pour === 'enfant' ? 'Ses locks ?' : 'Vos locks ?'}</h2>
        <div className="ca-mots ca-mots--liste" role="group" aria-label="Où en sont les locks">
          {REPONSES_DU_DEBUT.map((l) => (
            <button type="button" key={l.id} className="ca-mot" aria-pressed={rep.locks === l.id} onClick={() => choisit(l.id)}>{l.dit}</button>
          ))}
        </div>
        {revenir}
      </>,
    );
  }

  /* La suite lit les réglages de la Maison : on les attend ici, jamais avant. */
  if (!d || !parcours) return cadre(<p className="ca-note" role="status">Un instant…</p>);
  const r = d.envies;

  /* ── LES RÉPONSES QUI AVANCENT D'UN TOUCHER ── */
  const mots = (
    label: string,
    liste: readonly { id: string; nom: string; petit?: string; point?: number }[],
    choisi: string | null,
    touche: (id: string) => void,
    classe = 'ca-mot--long',
  ) => (
    <div className="ca-mots" role="group" aria-label={label}>
      {liste.map((x) => (
        <button type="button" key={x.id} className={`ca-mot ${classe}${x.point !== undefined ? ' ca-mot--epais' : ''}`} aria-pressed={choisi === x.id} onClick={() => touche(x.id)}>
          {x.point !== undefined
            ? <><span>{x.nom}{x.petit && <small>{x.petit}</small>}</span>{x.point > 0 && <Point r={x.point} />}</>
            : <>{x.nom}{x.petit && <small>{x.petit}</small>}</>}
        </button>
      ))}
    </div>
  );
  const lesEpaisseurs = (sansNombre: string) => [
    ...epaisseurs.map((e) => ({ id: e.id, nom: e.nom, petit: e.tranches.length ? `${plageDeLEpaisseur(e).toLowerCase()} locks` : undefined, point: e.r })),
    { id: EPAISSEUR_INCONNUE, nom: 'Je ne sais pas', petit: sansNombre, point: 0 },
  ];
  const lesLongueurs = LONGUEURS_DITES.map((l) => ({ id: l.id, nom: l.nom, petit: l.repere }));

  /* ── 3 SUR 5 · VOS ENVIES ── */
  if (ecran === 'envies') {
    const touche = (id: string) => {
      const envies = basculeUneEnvie(r, rep.envies, id);
      /* Les besoins cochés et les « Tout voir » ne valent que pour les envies encore choisies. */
      pose({ envies, besoins: rep.besoins.filter((b) => d.besoins.some((x) => x.id === b && envies.includes(x.famille))) });
      setToutVoir((t) => t.filter((x) => envies.includes(x)));
    };
    return cadre(
      <>
        {sur(rep.envies.length >= ENVIES_MAX ? 'cinq choisies, c’est le maximum' : 'cinq au plus')}
        <h2 className="ca-titre" ref={titre} tabIndex={-1}>Vos envies</h2>
        <div className="ca-mots" role="group" aria-label="Vos envies, cinq au plus">
          {montrees.map((e) => (
            <button type="button" key={e.id} className="ca-mot" aria-pressed={rep.envies.includes(e.id)} disabled={!seTouche(r, rep.envies, e.id)} onClick={() => touche(e.id)}>{e.nom}</button>
          ))}
        </div>
        <button type="button" className="ca-cta" disabled={rep.envies.length === 0 && montrees.length > 0} onClick={avance}>Continuer</button>
        {revenir}
      </>,
      false,
    );
  }

  /* ── 4 SUR 5 · CE QUI VOUS PARLE ── */
  if (ecran === 'besoins') {
    const touche = (id: string) => pose({ besoins: rep.besoins.includes(id) ? rep.besoins.filter((x) => x !== id) : [...rep.besoins, id] });
    return cadre(
      <>
        {sur()}
        <h2 className="ca-titre" ref={titre} tabIndex={-1}>Ce qui vous parle</h2>
        {choisies.map((e) => {
          const { montres, reste } = besoinsAMontrer(d.besoins, e.id, toutVoir.includes(e.id));
          if (!montres.length) return null;
          return (
            <div className="ca-groupe" key={e.id}>
              <p className="ca-sur">{e.nom}</p>
              <div className="ca-puces" role="group" aria-label={e.nom}>
                {montres.map((b) => <button type="button" key={b.id} className="ca-puce" aria-pressed={rep.besoins.includes(b.id)} onClick={() => touche(b.id)}>{b.mots}</button>)}
                {reste > 0 && <button type="button" className="ca-puce" onClick={() => setToutVoir((t) => [...t, e.id])}>Tout voir</button>}
              </div>
            </div>
          );
        })}
        <button type="button" className="ca-cta" onClick={avance}>Continuer</button>
        {revenir}
      </>,
      false,
    );
  }

  /* ── 5 SUR 5 · VOTRE COURONNE ── */
  if (ecran === 'couronne') {
    const tape = (brut: string) => {
      const nombre = nombreTape(brut);
      pose({ nombre, calibre: nombre ? trancheDuNombre(Number(nombre), tranches)?.id ?? null : null });
    };
    return cadre(
      <>
        {sur()}
        <h2 className="ca-titre" ref={titre} tabIndex={-1}>Votre couronne</h2>
        <div className="ca-champ">
          <label htmlFor="ca-nombre">Combien de locks ?</label>
          <input id="ca-nombre" type="text" inputMode="numeric" autoComplete="off" placeholder="Par exemple 120" value={rep.nombre} onChange={(e) => tape(e.target.value)} />
        </div>
        <p className="ca-traduit">
          {rep.nombre && tranche
            ? <><b>{rep.nombre} locks</b> : à la Maison, c’est le calibre <b>{tranche.nom}</b>.</>
            : 'Vous ne savez pas ? Touchez la tranche qui vous ressemble.'}
        </p>
        <div className="ca-mots" role="group" aria-label="Le nombre de locks, par tranche">
          {tranches.map((t) => (
            <button type="button" key={t.id} className="ca-mot ca-mot--nombre" aria-pressed={rep.calibre === t.id} onClick={() => pose({ calibre: t.id, nombre: '' })}>
              {plageDite(t)}<small>locks · {t.nom}</small>
            </button>
          ))}
        </div>
        <p className="ca-sur">Leur longueur</p>
        {mots('La longueur', lesLongueurs, rep.longueur, (id) => pose({ longueur: id as Reponses['longueur'] }))}
        <button type="button" className="ca-cta" disabled={!((rep.calibre || tranches.length === 0) && rep.longueur)} onClick={avance}>Mon rendez-vous</button>
        {revenir}
      </>,
      false,
    );
  }

  /* ── SANS LOCKS ENCORE : L'ÉPAISSEUR, LA LONGUEUR, LA DURÉE ── */
  if (ecran === 'epaisseur') {
    return cadre(
      <>
        {sur()}
        <h2 className="ca-titre" ref={titre} tabIndex={-1}>L’épaisseur</h2>
        {mots('L’épaisseur de vos locks', lesEpaisseurs('la Maison vous conseille'), rep.epaisseur, (id) => { pose({ epaisseur: id }); avance(); })}
        {revenir}
      </>,
    );
  }
  if (ecran === 'longueur') {
    const naturels = tarifDesNaturels(argent(r.modele.naturels.prixXof), r.modele.naturels.lot);
    return cadre(
      <>
        {sur()}
        <h2 className="ca-titre" ref={titre} tabIndex={-1}>La longueur</h2>
        {mots('La longueur voulue', lesLongueurs, rep.longueur, (id) => { pose({ longueur: id as Reponses['longueur'] }); if (rep.avec) avance(); })}
        <p className="ca-sur">Avec</p>
        {mots('Vos cheveux seuls, ou des cheveux naturels en option',
          AVEC.map((a) => ({ id: a.id, nom: a.nom, petit: a.id === 'naturels' ? `${a.dit} · ${naturels}` : a.dit })),
          rep.avec, (id) => { pose({ avec: id as Reponses['avec'] }); if (rep.longueur) avance(); })}
        {revenir}
      </>,
    );
  }
  if (ecran === 'duree') {
    return cadre(
      <>
        {sur()}
        <h2 className="ca-titre" ref={titre} tabIndex={-1}>La durée</h2>
        <div className="ca-mots ca-mots--pile" role="group" aria-label="Pour combien de temps">
          {DUREES.map((x) => (
            <button type="button" key={x.id} className="ca-mot ca-mot--duree" aria-pressed={rep.duree === x.id} onClick={() => { pose({ duree: x.id }); avance(); }}><span>{x.nom}</span><b>{x.dit}</b></button>
          ))}
        </div>
        {revenir}
      </>,
    );
  }

  /* ── DES LOCKS À DÉFAIRE : DEPUIS QUAND, SES LOCKS, COMMENT ── */
  if (ecran === 'depuis') {
    return cadre(
      <>
        {sur()}
        <h2 className="ca-titre" ref={titre} tabIndex={-1}>Depuis quand ?</h2>
        {mots('L’âge de vos locks', AGES, rep.depuis, (id) => { pose({ depuis: id }); avance(); }, 'ca-mot--nombre')}
        {revenir}
      </>,
    );
  }
  if (ecran === 'ses-locks') {
    return cadre(
      <>
        {sur()}
        <h2 className="ca-titre" ref={titre} tabIndex={-1}>Vos locks</h2>
        {mots('Leur épaisseur', lesEpaisseurs('la Maison comptera'), rep.epaisseur, (id) => { pose({ epaisseur: id }); if (rep.longueur) avance(); })}
        <p className="ca-sur">Leur longueur</p>
        {mots('Leur longueur', lesLongueurs, rep.longueur, (id) => { pose({ longueur: id as Reponses['longueur'] }); if (rep.epaisseur) avance(); })}
        {revenir}
      </>,
    );
  }
  if (ecran === 'comment') {
    return cadre(
      <>
        {sur()}
        <h2 className="ca-titre" ref={titre} tabIndex={-1}>Comment ?</h2>
        {mots('La façon de défaire', FACONS.map((f) => ({ id: f.id, nom: f.nom, petit: f.dit })), rep.facon, (id) => { pose({ facon: id }); if (rep.ensuite) avance(); })}
        <p className="ca-sur">Ensuite</p>
        {mots('Ce que vous voulez ensuite', ENSUITES.map((x) => ({ id: x.id, nom: x.nom, petit: x.dit })), rep.ensuite, (id) => { pose({ ensuite: id as Reponses['ensuite'] }); if (rep.facon) avance(); })}
        {revenir}
      </>,
    );
  }

  /* ══ LE RENDEZ-VOUS ════════════════════════════════════════════════════ */
  const { agenda } = d;
  const service = (id: string): PrestationPublique | undefined => agenda.services.find((s) => s.id === id);
  const garde = besoinsChoisis.some((b) => b.garde);

  /* LE CALIBRE QU'ELLE A DIT. Ses envies : son nombre, ou le représentant de
     sa tranche. Des locks à défaire : chaque tranche de son épaisseur (une
     épaisseur large en tient plusieurs ; rien de dit : toutes). */
  const bande: Bande | undefined = parcours === 'envies' ? agenda.bandes.find((b) => b.id === rep.calibre) : undefined;
  const lockCount = bande ? (Number(rep.nombre) > 0 ? Number(rep.nombre) : representantDeLaBande(bande, agenda.bandes)) : 0;
  const tranchesDites = epaisseur?.tranches ?? tranches;
  const comptes = parcours === 'defaire' ? comptesDesTranches(tranchesDites, agenda.bandes) : [lockCount];
  const dureeDuCompte = (n: number) => ({
    lockCount: n, bandes: agenda.bandes, sets: agenda.bandSets, categories: agenda.categories, suspendu: agenda.baremeSuspendu === true,
  });

  const contexte: Contexte = {
    seReserve: (id) => etatEnLigne(service(id), agenda.categories, agenda.masques) === 'ok',
    /* LA DURÉE SUIT LE CALIBRE — 18 novembre 2026 : une tête dont le rituel ne
       tient plus dans une journée ne le réserve pas en ligne (la visio, la
       consultation privée). Chaque compte qu'elle peut avoir doit tenir. */
    tient: (ids) => (comptes.length ? comptes : [0]).every((n) => tientDansUneJournee(dureeAuCompte(ids, agenda.services, dureeDuCompte(n)), agenda.semaine)),
    visioOuverte: (creneaux?.length ?? 0) > 0,
    ecartees: garde ? d.ecartees : [],
  };
  const affiches: Affiches = parcours === 'envies' ? affichesDesEnvies(r, rep.envies, contexte)
    : parcours === 'modele' ? affichesDuModele(r, contexte)
      : affichesADefaire(r, rep.ensuite, contexte);

  const fiche: Fiche | null = parcours === 'modele'
    ? ficheDuModele({ epaisseur, longueur: rep.longueur, avec: rep.avec, duree: rep.duree, tarifDesNaturels: tarifDesNaturels(argent(r.modele.naturels.prixXof), r.modele.naturels.lot) })
    : parcours === 'defaire' ? ficheADefaire({ depuis: rep.depuis, epaisseur, longueur: rep.longueur, facon: rep.facon, ensuite: rep.ensuite }) : null;

  /* LE PRIX DU RITUEL : la règle du Catalogue, celle de la réservation du site
     et du serveur (`prixSelonLeCalibre`) : le barème ne joue que sur une
     prestation qui « suit le modèle ». Pour « Cheveux libres », le plus petit
     prix des tranches de son épaisseur (`prixAPartirDe`). Toujours « à partir
     de, confirmé au fauteuil ». */
  const ctx: ContexteDuCalibre | undefined = bande
    ? { bande, lockCount, sets: agenda.bandSets, cats: agenda.categories, baremeSuspendu: agenda.baremeSuspendu } : undefined;
  const prixDuRituel = (ids: readonly string[]): number => ids.reduce((total, id) => {
    const s = service(id);
    if (!s) return total;
    if (parcours === 'defaire') {
      return total + prixAPartirDe(s, tranchesDites, { bandes: agenda.bandes, sets: agenda.bandSets, cats: agenda.categories, baremeSuspendu: agenda.baremeSuspendu });
    }
    return total + ((ctx ? prixSelonLeCalibre(s, ctx) : Number(s.priceXof ?? 0)) ?? 0);
  }, 0);

  /* La consultation de la porte cadre le créneau de la consultation privée (une heure). */
  const porte: Porte = rep.pour === 'enfant' ? 'enfant' : parcours === 'modele' ? 'creation' : 'reparation';
  const laPrivee: Choix = { genre: 'privee', prestations: prestationsReservables(agenda, porte).slice(0, 1).map((s) => s.id) };
  /* La place tenue est celle de la plus grande tête qu'elle peut avoir : une
     épaisseur large réserve la durée de sa dernière tranche, et ne nomme un
     calibre que si elle n'en tient qu'un. */
  const compteDuRituel = parcours === 'defaire' ? Math.max(0, ...comptes) : lockCount;
  const calibreDuRituel = parcours === 'defaire'
    ? (epaisseur?.tranches.length === 1 ? agenda.bandes.find((b) => b.id === epaisseur.tranches[0].id)?.name : undefined)
    : bande?.name;
  const leRituel: Choix | null = affiches.rituel
    ? { genre: 'rituel', prestations: affiches.rituel.prestations, ...(compteDuRituel ? { lockCount: compteDuRituel, ...(calibreDuRituel ? { calibre: calibreDuRituel } : {}) } : {}) }
    : null;
  const ouvre = (c: Choix | null) => { aBouge.current = true; setChoix(c); };

  /* ── VOTRE MOMENT, PUIS LE BILLET ── */
  if (choix) {
    const mixte = !!affiches.rituel && !!affiches.regard;
    const tous = reserves.includes('rituel') && reserves.some((g) => g !== 'rituel');
    return (
      <div className="ca" ref={haut}>
        {pas}
        <VotreMoment
          key={choix.genre}
          choix={choix} agenda={agenda} creneaux={creneaux ?? []} whatsapp={d.whatsapp} argent={argent} qui={qui} surQui={setQui} depot={depot} surDepot={setDepot}
          consultation={(o) => consultationADeposer({
            ...o, maintenant: new Date().toISOString(), devise: d.devise, branchId: agenda.branchId,
            parcours, reponses: rep, envies: choisies, besoins: besoinsChoisis, tranche, epaisseur, fiche,
          })}
          mot={motDuRituel({ envies: choisies, besoins: besoinsChoisis, fiche: parcours === 'defaire' ? fiche : null, longueur: rep.longueur })}
          pourQui={rep.pour ?? 'moi'}
          surRevenir={() => ouvre(null)}
          surReserve={(g) => setReserves((x) => (x.includes(g) ? x : [...x, g]))}
          surLaPrivee={choix.genre === 'visio' ? () => ouvre(laPrivee) : undefined}
          surLesAutres={mixte && !tous ? () => ouvre(null) : undefined}
        />
      </div>
    );
  }

  /* ── LES AFFICHES DU RENDEZ-VOUS ── */
  const cPrivee = chiffreEtSigne(argent(PRIX_DE_LA_CONSULTATION_PRIVEE_XOF));
  const dits = motsDuRendezVous(parcours);
  const dejaVu = reserves.some((g) => g !== 'rituel');
  const regard = affiches.regard && (
    creneaux === null
      ? <p className="ca-note" role="status">Un instant…</p>
      : (
        <div className="ca-affiches">
          {affiches.regard.visio && (
            <Affiche couleur="indigo" nom={dits.visio.nom} ligne={dits.visio.ligne} chiffre="Gratuite" unite={[`${DUREE_MIN}`, 'minutes']}
              pressee={reserves.includes('visio')} onClick={dejaVu ? undefined : () => ouvre({ genre: 'visio' })} />
          )}
          {affiches.regard.privee && (
            <Affiche couleur="cuivre" nom={dits.privee.nom} ligne={dits.privee.ligne} chiffre={cPrivee.chiffre} unite={[`${cPrivee.signe} déduits`.trim(), dits.privee.deduits]}
              pressee={reserves.includes('privee')}
              /* Sans paiement en ligne ouvert, la consultation se réserve par la porte du site, et se règle à la Maison. */
              vers={kkiapayPeutSOuvrir() || dejaVu ? undefined : base(`/reserver/?besoin=${porte}`)}
              onClick={dejaVu ? undefined : () => ouvre(laPrivee)} />
          )}
        </div>
      )
  );
  const rituel = affiches.rituel && leRituel && (() => {
    const prix = prixDuRituel(affiches.rituel.prestations);
    const c = prix > 0 ? chiffreEtSigne(argent(prix)) : null;
    return (
      <div className="ca-affiches">
        <Affiche couleur="sable" nom="Votre rituel" ligne={affiches.rituel.prestations.map((id) => service(id)?.name ?? '').filter(Boolean).join(' + ')}
          chiffre={c?.chiffre} unite={c ? [`${c.signe} · ${A_PARTIR_DE[0]}`, A_PARTIR_DE[1]] : undefined}
          pressee={reserves.includes('rituel')} onClick={reserves.includes('rituel') ? undefined : () => ouvre(leRituel)} />
      </div>
    );
  })();
  const laFiche = fiche && (
    <div className="ca-fiche">
      <span className="ca-fiche__nom">{fiche.nom}</span>
      <span className="ca-fiche__ligne">{fiche.ligne}</span>
      <dl className="ca-fiche__traits">{fiche.traits.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      {fiche.pied && <span className="ca-fiche__ligne">{fiche.pied}</span>}
    </div>
  );

  if (parcours === 'envies') {
    const aVoir = affiches.regard?.envies.map((id) => r.envies.find((e) => e.id === id)?.nom ?? '').filter(Boolean) ?? [];
    return cadre(
      <>
        <h2 className="ca-titre" ref={titre} tabIndex={-1}>{affiches.regard ? 'Votre rendez-vous' : 'Votre rituel'}</h2>
        {rituel}
        {affiches.regard && (
          <>
            {affiches.rituel && aVoir.length > 0 && <p className="ca-sur">{aVoir.join(', ')} : la Maison regarde d’abord</p>}
            {regard}
            <Scelle texte="Remis par la Maison, à votre rendez-vous." />
          </>
        )}
        {revenir}
      </>,
      false,
    );
  }

  return cadre(
    <>
      <h2 className="ca-titre" ref={titre} tabIndex={-1}>{parcours === 'modele' ? 'Votre modèle' : 'Défaire vos locks'}</h2>
      {laFiche}
      {rituel}
      {affiches.regard && (
        <>
          <p className="ca-sur">Votre rendez-vous</p>
          {regard}
          <Scelle texte={parcours === 'modele' ? 'Le prix de votre modèle, remis par la Maison à votre rendez-vous.' : 'Le temps et le prix, remis par la Maison à votre rendez-vous.'} />
        </>
      )}
      {revenir}
    </>,
    false,
  );
}
