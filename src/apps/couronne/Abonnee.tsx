import { useEffect, useState, type ReactNode } from 'react';
import { useBranch } from '../../shared/branches';
import { fmtMoney } from '../../shared/currency';
import { useServices } from '../../shared/catalog';
import { kkiapayEnabled, payWithKkiapay, saitLEcheanceSuivante, verifyDeposit, versionDeKkiapayVerify } from '../../shared/kkiapay';
import { decaleLeJour } from '../../shared/ia-faits-pur';
import type {
  Alerte, LigneDeSeances, LigneDeSolde, ReleveDeLAbonnee, ReleveDuContrat,
} from '../../shared/abonnee-pur';
import { useClient } from './lib';
import { ETAT_FORMULE, dateCourte, dateDansLaPhrase, rangDit } from './releve';
import { t, prix } from './i18n';
import './abonnee.css';

/* ══ LE TABLEAU DE BORD DE L'ABONNÉE — 20 octobre 2026 ═══════════════════
   Maquette L0 validée (« construis c'est bon comme ça »), écran 1.

   L'ACCUEIL RÉPOND À UNE SEULE QUESTION : où en suis-je ? Dans cet ordre, une
   seule alerte, la plus urgente ; une carte par formule qui court, avec ses
   séances faites, réservées et disponibles ; la prochaine séance (la carte
   indigo de l'accueil, qui garde sa place) ; le solde ; deux boutons.

   RIEN NE SE RECOMPTE ICI. Chaque chiffre vient du relevé
   (`releveDeLAbonnee`) : la carte dit ce que dit Ma formule, ce que dit Mon
   solde, ce que dit le Trône. */

/** Ce qu'on demande à la feuille « Régler » : le montant, sa date, son objet. */
export type DemandeDeReglement = {
  /** Le contrat réglé. Absent : un rituel ou une pièce, qui ne passent pas par KkiaPay ici. */
  subId?: string;
  montantXof: number;
  /** Le jour avant lequel régler (la retenue, l'échéance). */
  avantIso?: string;
  /** Ce que la cliente lit, et ce que la Maison lira dans le message. */
  objet: string;
};

/** Le nom de la prestation, ou un mot honnête quand elle a quitté le catalogue. */
export function useNomDeService(): (id: string) => string {
  const [services] = useServices();
  return (id: string) => services.find((s) => s.id === id)?.name ?? t('Prestation retirée');
}

/** Le dernier jour d'une lune [du, au) : la veille de `au`. */
const dernierJour = (au: string): string => decaleLeJour(au, -1);

/* ── LA BARRE EN TROIS MATIÈRES ─────────────────────────────────────── */
export function Barre3({ l, voile, perdue }: { l: LigneDeSeances; voile?: boolean; perdue?: boolean }) {
  if (l.incluses === null) return null;
  const segs: string[] = [];
  for (let i = 0; i < l.incluses; i += 1) {
    if (i < l.faites) segs.push('faite');
    else if (i < l.faites + l.manquees) segs.push('manquee');
    else if (i < l.faites + l.manquees + l.reservees) segs.push('reservee');
    else segs.push(perdue ? 'perdue' : 'libre');
  }
  return (
    <div className={`ab-barre3 ${voile ? 'is-voile' : ''}`} aria-hidden="true">
      {segs.map((s, i) => <i key={i} className={`ab-seg ab-seg--${s}`} />)}
    </div>
  );
}

/** « 2 faites · 1 réservée · 3 disponibles », chaque mot avec sa matière. */
export function Legende({ l, perdue }: { l: LigneDeSeances; perdue?: boolean }) {
  const items: [string, string][] = [];
  if (l.faites) items.push(['faite', l.faites > 1 ? t('{n} faites', { n: l.faites }) : t('{n} faite', { n: l.faites })]);
  if (l.manquees) items.push(['manquee', l.manquees > 1 ? t('{n} manquées', { n: l.manquees }) : t('{n} manquée', { n: l.manquees })]);
  if (l.reservees) items.push(['reservee', l.reservees > 1 ? t('{n} réservées', { n: l.reservees }) : t('{n} réservée', { n: l.reservees })]);
  if (l.disponibles !== null && l.disponibles > 0) {
    items.push(perdue
      ? ['perdue', l.disponibles > 1 ? t('{n} perdues', { n: l.disponibles }) : t('{n} perdue', { n: l.disponibles })]
      : ['libre', l.disponibles > 1 ? t('{n} disponibles', { n: l.disponibles }) : t('{n} disponible', { n: l.disponibles })]);
  }
  if (!items.length) return null;
  return (
    <div className="ab-leg">
      {items.map(([k, mot]) => (
        <span key={k} className="ab-leg__i"><i className={`ab-seg ab-seg--${k}`} />{mot}</span>
      ))}
    </div>
  );
}

/** Le chiffre principal d'une ligne de séances, selon l'état de la formule. */
function chiffreDeLaLigne(c: ReleveDuContrat, l: LigneDeSeances): string {
  if (l.incluses === null) return t('sans limite');
  if (c.etat === 'retenue') return l.incluses > 1 ? t('{n} séances', { n: l.incluses }) : t('{n} séance', { n: l.incluses });
  if (c.etat === 'en-pause') return t('en pause');
  if (c.etat === 'terminee') return (l.disponibles ?? 0) > 1 ? t('{n} perdues', { n: l.disponibles ?? 0 }) : t('{n} perdue', { n: l.disponibles ?? 0 });
  if (c.etat === 'resiliee' && !c.courtJusquau) return t('résiliée');
  /* L'ANCIEN CARNET ÉPUISÉ : ses séances ont été prises avant Le Trône ; on ne
     prétend pas « 2 sur 6 ». */
  if (c.etat === 'epuisee' && c.epuiseeParLAncienCarnet) return t('épuisée');
  if (c.etat === 'epuisee') return t('{n} sur {total}', { n: l.faites + l.manquees, total: l.incluses });
  return (l.disponibles ?? 0) > 1 ? t('{n} disponibles', { n: l.disponibles ?? 0 }) : t('{n} disponible', { n: l.disponibles ?? 0 });
}

/** La ligne sous le nom de la formule : jusqu'à quand, ou pourquoi elle s'arrête. */
function sousLeNom(c: ReleveDuContrat): string {
  if (c.etat === 'retenue' && c.retenueJusquau) return t('Retenue jusqu’au {date} au soir', { date: dateDansLaPhrase(c.retenueJusquau) });
  if (c.etat === 'resiliee' && c.resilieeLe && c.courtJusquau) return t('Résiliée le {date} · la lune réglée court jusqu’au {fin}', { date: dateDansLaPhrase(c.resilieeLe), fin: dateDansLaPhrase(c.courtJusquau) });
  if (c.etat === 'resiliee' && c.resilieeLe) return t('Résiliée le {date}', { date: dateDansLaPhrase(c.resilieeLe) });
  if (c.etat === 'epuisee' && c.epuiseeParLAncienCarnet) return t('Épuisée · séances prises avant Le Trône');
  if (c.etat === 'effacee' && c.effaceeLe) return t('Retenue non réglée, effacée le {date}', { date: dateDansLaPhrase(c.effaceeLe) });
  if (c.etat === 'en-pause' && c.pause?.genre === 'lune') return t('En pause depuis le {date}', { date: dateDansLaPhrase(c.pause.depuisIso) });
  if (c.etat === 'en-pause' && c.pause?.genre === 'suspension') return t('En pause jusqu’au {date}', { date: dateDansLaPhrase(c.pause.au) });
  if (c.etat === 'terminee' && c.finIso) return t('Terminée le {date}', { date: dateDansLaPhrase(c.finIso) });
  if (c.mode === 'cycle' && c.lune) return t('Lune en cours jusqu’au {date}', { date: dateDansLaPhrase(dernierJour(c.lune.au)) });
  if (c.finIso) return t('Valable jusqu’au {date}', { date: dateDansLaPhrase(c.finIso) });
  return t('Sans date de fin');
}

/* ── LA CARTE « MA FORMULE » DE L'ACCUEIL ────────────────────────────── */
export function CarteFormule({ c, prenom, onFormule, onRegler, onRenoncer }: {
  c: ReleveDuContrat;
  /** Le prénom de la tête portée ; absent : c'est elle. */
  prenom?: string;
  onFormule: () => void;
  onRegler: (d: DemandeDeReglement) => void;
  onRenoncer?: (c: ReleveDuContrat) => void;
}) {
  const nomDe = useNomDeService();
  const etat = ETAT_FORMULE[c.etat];
  const voile = c.etat === 'retenue' || c.etat === 'en-pause';
  const perdue = c.etat === 'terminee' || !!c.epuiseeParLAncienCarnet;
  return (
    <div className="ab-card">
      <div className="ab-card__top">
        <span className="mc-micro-eyebrow">
          {prenom ? t('La formule de {prenom} · {reference}', { prenom, reference: c.reference }) : t('Ma formule · {reference}', { reference: c.reference })}
        </span>
        {c.etat !== 'effacee' && <span className={`mc-stchip ${etat.cls}`}>{t(etat.dit)}</span>}
      </div>
      <div className="ab-mcf__nom">{c.nom}</div>
      <p className="ab-meta">{sousLeNom(c)}</p>
      {c.seances.map((l) => (
        <div key={l.serviceId} className="ab-mcf__ligne">
          <div className="ab-mcf__tete">
            <span>{c.mode === 'cycle' && l.incluses !== null
              ? t('{prestation} · {n} par lune', { prestation: nomDe(l.serviceId), n: l.incluses })
              : nomDe(l.serviceId)}</span>
            <b>{chiffreDeLaLigne(c, l)}</b>
          </div>
          <Barre3 l={l} voile={voile} perdue={perdue} />
          {c.etat === 'retenue'
            ? <div className="ab-leg">{t('Elles s’ouvrent au premier règlement.')}</div>
            : c.etat === 'en-pause'
              ? <div className="ab-leg">{t('Aucune séance incluse avant le règlement de la lune.')}</div>
              : c.epuiseeParLAncienCarnet
                ? <div className="ab-leg">{t('Séances prises avant Le Trône.')}</div>
                : <Legende l={l} perdue={perdue} />}
        </div>
      ))}
      {c.etat === 'retenue' && c.argent.pourOuvrir && (
        <div className="ab-actes">
          <button type="button" className="mc-cta mc-cta--copper"
            onClick={() => onRegler({ subId: c.sub.id, montantXof: c.argent.pourOuvrir!.montantXof, avantIso: c.argent.pourOuvrir!.avantIso, objet: c.nom })}>
            {t('Régler {montant}', { montant: prix(c.argent.pourOuvrir.montantXof) })}
          </button>
          {onRenoncer && (
            <button type="button" className="mc-cta mc-cta--outline" onClick={() => onRenoncer(c)}>{t('Renoncer')}</button>
          )}
        </div>
      )}
      <button type="button" className="ab-lien" onClick={onFormule}>{prenom ? t('Sa formule →') : t('Ma formule →')}</button>
    </div>
  );
}

/** Ce qu'une ligne du solde est, en peu de mots. */
export function objetDeLaLigne(l: LigneDeSolde, pourElle = true): string {
  if (l.genre === 'echeance') return l.numero ? t('{rang} échéance de la formule', { rang: rangDit(l.numero) }) : t('échéance de la formule');
  if (l.genre === 'lune') return t('la lune suivante');
  if (l.genre === 'resiliation') return t('reste de la résiliation');
  if (l.genre === 'a-convenir') return t('reste à convenir avec la Maison');
  if (l.genre === 'rituel') return pourElle ? t('reste d’une séance') : t('reste d’une séance de sa couronne');
  if (l.genre === 'piece') return l.libelle ?? t('facture');
  return t('avoir');
}

/* ── LA CARTE « MON SOLDE » DE L'ACCUEIL ─────────────────────────────── */
export function CarteSolde({ releve, prenom, onSolde, onRegler }: {
  releve: ReleveDeLAbonnee;
  prenom?: string;
  onSolde: () => void;
  onRegler: (d: DemandeDeReglement) => void;
}) {
  const s = releve.solde;
  const aRegler = s.lignes.filter((l) => l.statut === 'a-regler-aujourdhui' || l.statut === 'en-retard');
  const aVenir = s.lignes.filter((l) => l.statut === 'a-venir');
  const retenue = releve.contrats.find((c) => c.etat === 'retenue' && c.argent.pourOuvrir);
  const enPause = releve.contrats.some((c) => c.etat === 'en-pause');
  const premier = aRegler[0];
  return (
    <div className="ab-card">
      <div className="mc-micro-eyebrow">{prenom ? t('Le solde de {prenom}', { prenom }) : t('Mon solde')}</div>
      {premier ? (
        <>
          <span className="ab-mcs__lab">{t('À régler aujourd’hui')}</span>
          <div className={`ab-big ${s.dontEnRetardXof > 0 ? 'is-retard' : ''}`}>{prix(s.aRegleAujourdhuiXof)}</div>
          {aRegler.map((l) => (
            <p key={`${l.genre}-${l.subId ?? l.id}-${l.numero ?? ''}`} className="ab-meta">
              {l.statut === 'en-retard' && l.dueIso
                ? t('{objet}, attendue depuis le {date}.', { objet: objetDeLaLigne(l, !prenom), date: dateDansLaPhrase(l.dueIso) })
                : t('{objet}, aujourd’hui.', { objet: objetDeLaLigne(l, !prenom) })}
            </p>
          ))}
          <button type="button" className="mc-cta mc-cta--copper ab-court"
            onClick={() => onRegler({ subId: premier.subId, montantXof: premier.montantXof, avantIso: premier.dueIso, objet: objetDeLaLigne(premier, !prenom) })}>
            {t('Régler {montant}', { montant: prix(premier.montantXof) })}
          </button>
        </>
      ) : retenue?.argent.pourOuvrir ? (
        <>
          <div className="ab-mcs__ok">{t('Rien n’est dû.')}</div>
          <p className="ab-meta">{t('Pour ouvrir votre formule : {montant} avant le {date} au soir.', { montant: prix(retenue.argent.pourOuvrir.montantXof), date: dateDansLaPhrase(retenue.argent.pourOuvrir.avantIso) })}</p>
        </>
      ) : (
        <div className="ab-mcs__ok">{prenom ? t('Rien à régler pour {prenom}.', { prenom }) : enPause ? t('Rien n’est dû.') : t('Vous êtes à jour.')}</div>
      )}
      {aVenir.length > 0 && (
        <div className="ab-mcs__venir">
          <span className="ab-mcs__lab" style={{ marginTop: 0 }}>{t('À venir')}</span>
          {aVenir.slice(0, 3).map((l) => (
            <div key={`${l.genre}-${l.subId ?? l.id}-${l.numero ?? ''}-${l.dueIso ?? ''}`} className="ab-mcs__l">
              <span>{l.dueIso ? `${dateCourte(l.dueIso)} · ` : ''}{objetDeLaLigne(l, !prenom)}</span>
              <b>{prix(l.montantXof)}</b>
            </div>
          ))}
        </div>
      )}
      {s.aConvenirXof > 0 && (
        <div className="ab-mcs__l"><span>{t('À convenir avec la Maison')}</span><b>{prix(s.aConvenirXof)}</b></div>
      )}
      {s.avoirXof > 0 && (
        <div className="ab-mcs__l"><span>{prenom ? t('Son avoir') : t('Votre avoir')}</span><b>{prix(s.avoirXof)}</b></div>
      )}
      <button type="button" className="ab-lien" onClick={onSolde}>{prenom ? t('Ouvrir son solde →') : t('Ouvrir mon solde →')}</button>
    </div>
  );
}

/* ── L'ALERTE UNIQUE ─────────────────────────────────────────────────── */
const NIVEAU: Record<Alerte['genre'], string> = {
  retard: 'retard', 'a-regler': 'jour', pause: 'pause', retenue: 'retenue', 'prix-revu': 'info', 'a-confirmer': 'info', 'fin-proche': 'info',
};

export function AlerteUnique({ releve, onRegler, onSolde, onOpenRdv, onReserverIncluse, onAcheter }: {
  releve: ReleveDeLAbonnee;
  onRegler: (d: DemandeDeReglement) => void;
  onSolde: () => void;
  onOpenRdv: (id: string) => void;
  onReserverIncluse: () => void;
  onAcheter: () => void;
}) {
  const a = releve.alerte;
  if (!a) return null;
  const c = a.subId ? [...releve.contrats, ...releve.anciens].find((x) => x.sub.id === a.subId) : undefined;
  let geste: { label: string; agir: () => void } | null = null;
  if ((a.genre === 'retard' || a.genre === 'a-regler' || a.genre === 'pause' || a.genre === 'retenue') && a.montantXof) {
    const montant = a.montantXof;
    geste = {
      label: a.genre === 'pause' ? t('Régler la lune') : t('Régler'),
      agir: () => onRegler({ subId: a.subId, montantXof: montant, avantIso: a.dueIso, objet: c?.nom ?? t('votre formule') }),
    };
  } else if (a.genre === 'prix-revu') geste = { label: t('Voir'), agir: onSolde };
  else if (a.genre === 'a-confirmer' && a.seanceId) { const id = a.seanceId; geste = { label: t('Confirmer'), agir: () => onOpenRdv(id) }; }
  else if (a.genre === 'fin-proche') {
    geste = c?.finProche?.motif === 'derniere-seance' && c.porte.peutReserverIncluse
      ? { label: t('Réserver'), agir: onReserverIncluse }
      : { label: t('Reprendre'), agir: onAcheter };
  }
  return (
    <div className={`ab-alerte ab-alerte--${NIVEAU[a.genre]}`} role="status">
      <span className="ab-alerte__dot" aria-hidden="true" />
      {/* LA PHRASE EST CELLE DU JUGE : l'accueil, le Trône et le message
          disent la même chose, l'année toujours. */}
      <span className="ab-alerte__t">{a.texte}</span>
      {geste && <button type="button" className="ab-alerte__go" onClick={geste.agir}>{geste.label}</button>}
    </div>
  );
}

/* ── LES DEUX BOUTONS ───────────────────────────────────────────────── */
export function BoutonsDeLAccueil({ releve, prenom, peutAcheter, onReserverIncluse, onReserverAutre, onAcheter, onRegler }: {
  releve: ReleveDeLAbonnee;
  prenom?: string;
  /** La vitrine des formules est ouverte pour elle. */
  peutAcheter: boolean;
  onReserverIncluse: () => void;
  onReserverAutre: () => void;
  onAcheter: () => void;
  onRegler: (d: DemandeDeReglement) => void;
}) {
  const courent = releve.contrats.filter((c) => c.etat !== 'epuisee');
  const autre = (
    <button type="button" className="mc-cta mc-cta--outline" onClick={onReserverAutre}>
      {courent.length ? t('Réserver un autre soin') : t('Réserver un soin')}
    </button>
  );
  if (!courent.length) {
    return (
      <div className="ab-boutons">
        {peutAcheter && (
          <button type="button" className="mc-cta mc-cta--copper" onClick={onAcheter}>
            {releve.contrats.length || releve.anciens.length ? t('Reprendre une formule') : t('Découvrir les formules')}
          </button>
        )}
        {autre}
      </div>
    );
  }
  const incluse = prenom ? t('Réserver une séance de sa formule') : t('Réserver une séance de ma formule');
  let premier = <button type="button" className="mc-cta mc-cta--copper" onClick={onReserverIncluse}>{incluse}</button>;
  let raison = '';
  if (!releve.porte.peutReserverIncluse) {
    const pause = courent.find((c) => c.etat === 'en-pause' && c.argent.luneARegler);
    const quota = courent.find((c) => c.porte.raison === 'quota');
    if (pause?.argent.luneARegler) {
      const lune = pause.argent.luneARegler;
      premier = (
        <button type="button" className="mc-cta mc-cta--copper"
          onClick={() => onRegler({ subId: pause.sub.id, montantXof: lune.montantXof, avantIso: lune.depuisIso, objet: pause.nom })}>
          {t('Régler la lune · {montant}', { montant: prix(lune.montantXof) })}
        </button>
      );
      raison = t('Une séance de votre formule se réserve dès la lune réglée.');
    } else {
      premier = <button type="button" className="mc-cta mc-cta--copper" disabled>{incluse}</button>;
      raison = releve.porte.raison === 'retenue' ? t('Aucune séance incluse avant le premier règlement.')
        : releve.porte.raison === 'retard' ? t('Réglez l’échéance en retard : la réservation se rouvre aussitôt.')
          : quota?.mode === 'cycle' ? t('La séance de cette lune est déjà faite ou réservée.')
            : t('Toutes les séances de la formule sont faites ou réservées.');
    }
  }
  return (
    <div className="ab-boutons">
      {premier}
      {raison && <p className="ab-raison">{raison}</p>}
      {autre}
    </div>
  );
}

/* ── LA FEUILLE « RÉGLER » ──────────────────────────────────────────────
   Trois voies, chacune DATÉE (une retenue s'efface au 7e jour, une échéance
   est en retard dès le lendemain) : en ligne par KkiaPay quand le serveur
   sait régler l'échéance suivante ; un lien MND PAY demandé à la Maison sur
   WhatsApp ; le comptoir. Le message à la Maison reste en français et ne
   porte aucun numéro de pièce. */
export function FeuilleRegler({ demande, onClose, toast }: {
  demande: DemandeDeReglement;
  onClose: () => void;
  toast: (m: string) => void;
}) {
  const { branch } = useBranch();
  const client = useClient();
  const [serveurPret, setServeurPret] = useState(false);
  const [paie, setPaie] = useState<'repos' | 'en_cours'>('repos');
  useEffect(() => {
    if (!kkiapayEnabled()) return undefined;
    let vivant = true;
    void versionDeKkiapayVerify().then((v) => { if (vivant) setServeurPret(saitLEcheanceSuivante(v)); });
    return () => { vivant = false; };
  }, []);
  const enLigne = kkiapayEnabled() && serveurPret && !!demande.subId;
  const numero = (branch.phone ?? '').replace(/\D/g, '');
  const avant = demande.avantIso ? dateDansLaPhrase(demande.avantIso) : '';
  const texteMaison = `Bonjour, je souhaite recevoir un lien MND PAY pour régler ${fmtMoney(demande.montantXof)} : ${demande.objet}${avant ? `, avant le ${avant}` : ''}.`;

  const reglerEnLigne = async () => {
    if (!demande.subId || paie === 'en_cours') return;
    setPaie('en_cours');
    try {
      const { transactionId } = await payWithKkiapay({
        amountXof: demande.montantXof, partnerId: demande.subId, branchId: branch.id,
        clientId: client?.id, phone: client?.phone, name: client?.name, email: client?.email,
      });
      const v = await verifyDeposit({
        transactionId, apptId: '', subId: demande.subId, expectedXof: demande.montantXof, branchId: branch.id, clientId: client?.id,
      });
      toast(v.ok
        ? t('Réglé : {montant}. Merci.', { montant: prix(v.amountXof) })
        : t('Le paiement n’a pas été confirmé. Réessayez, ou réglez au comptoir.'));
      if (v.ok) onClose();
    } catch (e) {
      toast(e instanceof Error && e.message ? t(e.message) : t('Paiement interrompu.'));
    }
    setPaie('repos');
  };

  return (
    <>
      <div className="ab-voile" onClick={onClose} />
      <div className="ab-feuille" role="dialog" aria-modal="true" aria-label={t('Régler')}>
        <span className="ab-feuille__poignee" aria-hidden="true" />
        <div className="mc-micro-eyebrow">{t('Régler')}</div>
        <div className="ab-feuille__t">{prix(demande.montantXof)}</div>
        <p className="ab-meta">{avant ? t('{objet}, avant le {date}.', { objet: demande.objet, date: avant }) : demande.objet}</p>
        {enLigne && (
          <button type="button" className="ab-choix" disabled={paie === 'en_cours'} onClick={() => void reglerEnLigne()}>
            <span className="ab-choix__n">{paie === 'en_cours' ? t('Paiement en cours…') : t('En ligne, maintenant')}</span>
            <span className="ab-choix__s">{t('Mobile money ou carte, par KkiaPay : votre règlement est confirmé en quelques secondes.')}</span>
          </button>
        )}
        {numero && (
          <a className="ab-choix" href={`https://wa.me/${numero}?text=${encodeURIComponent(texteMaison)}`} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
            <span className="ab-choix__n">{t('Recevoir un lien MND PAY')}</span>
            <span className="ab-choix__s">{avant
              ? t('La Maison vous l’envoie sur WhatsApp ; à régler avant le {date}.', { date: avant })
              : t('La Maison vous l’envoie sur WhatsApp.')}</span>
          </a>
        )}
        <div className="ab-choix" style={{ cursor: 'default' }}>
          <span className="ab-choix__n">{t('Au comptoir de la Maison')}</span>
          <span className="ab-choix__s">{avant
            ? t('Avant le {date}. La Maison est fermée le dimanche.', { date: avant })
            : t('La Maison est fermée le dimanche.')}</span>
        </div>
        <button type="button" className="mc-cta mc-cta--quiet" onClick={onClose}>{t('Plus tard')}</button>
      </div>
    </>
  );
}

/* ── LE TABLEAU DE BORD ─────────────────────────────────────────────── */
export function TableauDeBord({ releve, prenom, onFormule, onRegler, onRenoncer, onSolde, onOpenRdv, onReserverIncluse, onAcheter, avantLeSolde }: {
  releve: ReleveDeLAbonnee;
  prenom?: string;
  onFormule: () => void;
  onRegler: (d: DemandeDeReglement) => void;
  onRenoncer?: (c: ReleveDuContrat) => void;
  onSolde: () => void;
  onOpenRdv: (id: string) => void;
  onReserverIncluse: () => void;
  onAcheter: () => void;
  /** La carte indigo de la prochaine séance, posée entre les formules et le solde. */
  avantLeSolde?: ReactNode;
}) {
  return (
    <>
      <AlerteUnique releve={releve} onRegler={onRegler} onSolde={onSolde} onOpenRdv={onOpenRdv}
        onReserverIncluse={onReserverIncluse} onAcheter={onAcheter} />
      {releve.contrats.map((c) => (
        <CarteFormule key={c.sub.id} c={c} prenom={prenom} onFormule={onFormule} onRegler={onRegler} onRenoncer={onRenoncer} />
      ))}
      {avantLeSolde}
      <CarteSolde releve={releve} prenom={prenom} onSolde={onSolde} onRegler={onRegler} />
    </>
  );
}

/* ── CE QUE L'ACCUEIL, LA TÊTE PORTÉE ET LE PROFIL REÇOIVENT ──────────── */
export type GestesDeLAbonnee = {
  releve: ReleveDeLAbonnee | null;
  /** La vitrine des formules est ouverte pour elle. */
  peutAcheter: boolean;
  onRegler: (d: DemandeDeReglement) => void;
  onRenoncer?: (c: ReleveDuContrat) => void;
  onSolde: () => void;
  onFormule: () => void;
  onReserverIncluse: () => void;
  onAcheter: () => void;
  goGamme?: () => void;
  goCercle?: () => void;
};

/** Elle porte, ou a porté, une formule : le tableau de bord s'affiche. */
export const aUneFormule = (r: ReleveDeLAbonnee | null | undefined): r is ReleveDeLAbonnee =>
  !!r && r.contrats.length + r.anciens.length > 0;

/** LE SCEAU D'ARGENT D'UNE SÉANCE : « Incluse · séance 3 sur 6 de votre
    formule », ou la lune qui la porte. `null` : elle n'est pas dans une formule. */
export function sceauDeLaSeance(releve: ReleveDeLAbonnee | null | undefined, apptId: string, prenom?: string): string | null {
  if (!releve) return null;
  for (const c of [...releve.contrats, ...releve.anciens]) {
    const s = c.attribuees.find((x) => x.id === apptId);
    if (!s || !s.compte) continue;
    if (c.mode === 'cycle') return c.lune ? t('Incluse · lune du {date}', { date: dateDansLaPhrase(c.lune.du) }) : t('Incluse dans la lune');
    if (!s.rang || !s.total) return t('Incluse dans la formule');
    return prenom
      ? t('Incluse · séance {n} sur {total} de sa formule', { n: s.rang, total: s.total })
      : t('Incluse · séance {n} sur {total} de votre formule', { n: s.rang, total: s.total });
  }
  return null;
}

/** LA CLOCHE DE L'ACCUEIL : une cloche, plus un pion d'échecs (point tranché
    de la maquette, les glyphes de la barre). */
export function Cloche() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </svg>
  );
}
