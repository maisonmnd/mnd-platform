import { useCallback, useEffect, useRef, useState } from 'react';
import { asset } from '../../shared/asset';
import { abandonneLePaiementKkiapay, estUneFenetreFermee, estUnePanneDeKkiapay, kkiapayPeutSOuvrir, payWithKkiapay } from '../../shared/kkiapay-widget';
import { msisdnDe } from '../../shared/collecte-mtn-pur';
import { TexteFon } from '../../ds/fon';
import { inviteAUnePart, laGamme, ajouteALaGamme, retireDeLaGamme, lisLeLien, poseLeSceau, regleLeLien, repondsAuProchainRituel, type PageDuLien } from '../../shared/regler-la-seance-serveur';
import { attenteDeLaPiece, retourAMaCouronne } from '../../shared/terminer-et-regler-serveur';
import { RE_DEMANDE_DU_LIEN } from '../../shared/regler-par-fedapay-pur';
import { ATTENTE_FEDAPAY_LECTURES, ATTENTE_FEDAPAY_MS, statutFedaPay } from '../../shared/regler-par-fedapay-serveur';
import { MOYENS_DU_SCEAU, type MoyenDuSceau } from '../../shared/le-sceau-pur';
import { ecouteLeFilDuSceau } from '../../shared/le-fil-du-sceau';
import { PayerParMtn } from './Mtn';
import { PayerParFedaPay } from './FedaPay';
import { Sceau, SceauPose } from '../../ds/sceau';
import { QrSvg } from '../../ds/qr';

/* ══ RÉGLER SA SÉANCE — la page de la cliente (25 octobre 2026) ══════════
   Ouverte depuis le bouton « Régler » de son message (payer.html?tg=r-…).
   Elle ne sait que son jeton : la fonction `regler-la-seance` dit le juste
   reste, et c'est elle seule qui pose l'argent sur la pièce. Le retour du
   widget KkiaPay ne prouve rien ; la page le dit à la fonction, qui
   redemande à KkiaPay. Maquette : vue 10 du canvas du Tableau intelligent.

   ══ LE SCEAU (22 novembre 2026) ══════════════════════════════════════════
   « Un système rapide de self checkout sur le Trône avec les téléphones qui
   communiquent avec le Trône en direct » (Yéman). Cette page en est le lot 1
   (passation mnd-passation-sceau-et-devis) :
   · le geste : un doigt maintenu une seconde sur le sceau de la Maison
     (`Sceau.tsx`), à la place du bouton « Régler » ;
   · le moyen qu'elle choisit SUR SA NOTE — MTN, Moov, Celtiis, carte — et
     les frais de chacun, dits ;
   · le fil : la page écoute le jeton (`sceau-<jeton>`) et relit sa note à
     chaque « relis » ; le Trône, lui, voit chaque étape du fauteuil ;
   · le geste offert par la Maison apparaît en moins, sans qu'elle recharge ;
   · le dernier écran dit « Merci. », signé « Maison MND », puis la devise.
   Ce qui ne change pas : le montant vient du serveur, l'argent ne s'écrit
   qu'à la confirmation de KkiaPay (ou de MTN), et le comptoir reste là. */

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
/** Toujours l'année sur une date que la cliente lit (règle de la Maison). */
const jourDit = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${parseInt(m[3], 10)} ${MOIS[parseInt(m[2], 10) - 1]} ${m[1]}` : iso;
};
const francs = (x: number): string => `${Math.round(x).toLocaleString('fr-FR').replace(/ | /g, ' ')} F`;
/** « la séance d'Awa », « la séance de Sena » : la page se lit aussi chez celle qui règle pour elle.
    L'élision devant une voyelle seulement (25 octobre 2026, « j'ai vu d'Yeman ») :
    « de Yéman », « de Hélène » plutôt qu'une élision fautive. */
const deLaCliente = (prenom: string): string => (!prenom ? '' : /^[aeiouàâäéèêëîïôöûü]/i.test(prenom) ? `d’${prenom}` : `de ${prenom}`);
/** LE FOYER (28 octobre 2026) : « de Nael et d’Aloys », « de Nael, de Sena et d’Aloys ». */
const desTetes = (prenoms: readonly string[]): string => {
  /* Chaque prénom une fois : le point d'un compte porte plusieurs séances de la même tête (28 octobre 2026). */
  const dits = [...new Set(prenoms.filter(Boolean))].map(deLaCliente);
  return dits.length <= 1 ? (dits[0] ?? '') : `${dits.slice(0, -1).join(', ')} et ${dits[dits.length - 1]}`;
};

/** Les montants du merci (sa liste du 25 octobre 2026), puis « Autre ». Aucun
    n'est choisi d'avance : le merci reste libre, et se retire d'un second toucher. */
const POURBOIRES = [500, 1000, 2000, 5000, 10000];
const POURBOIRE_MAX = 100000;
/* La devise, écrite ici : identite.ts emporterait la synchronisation de
   l'ERP dans une page de paiement ouverte sur un téléphone. Le banc
   verifie-regler-la-seance la compare à DEVISE_COMPLETE. */
const DEVISE = 'mi nyɔ́ ɖɛkpɛ, votre beauté est déjà là';

type Ecran =
  | { k: 'lecture' }
  | { k: 'preparation' }
  | { k: 'erreur'; dit: string; reessayer?: boolean }
  | { k: 'page'; page: PageDuLien }
  | { k: 'paiement'; page: PageDuLien }
  | { k: 'reglee'; page: PageDuLien; paye?: number; honore?: boolean };

const jetonDeLAdresse = (): string => (new URLSearchParams(window.location.search).get('r') ?? '').trim();
/* LE RETOUR DE FEDAPAY (12 novembre 2026, le choix du moyen, lot C) : le
   serveur a écrit l'adresse de retour, ?r=<jeton>&fp=<sa demande> ; ce que
   FedaPay y ajoute (id, status) ne prouve rien : la page relit l'état de SA
   demande au serveur, qui le relit chez FedaPay. */
const demandeFedaPayDeLAdresse = (): string => {
  const v = (new URLSearchParams(window.location.search).get('fp') ?? '').trim();
  return RE_DEMANDE_DU_LIEN.test(v) ? v : '';
};
type RetourFedaPay = 'lecture' | 'delai' | 'refusee' | 'expiree' | 'annulee';
const RETOUR_FEDAPAY_DIT: Record<Exclude<RetourFedaPay, 'lecture'>, string> = {
  delai: 'FedaPay n’a pas encore confirmé votre paiement. Si vous avez payé, inutile de payer une seconde fois : la Maison le verra.',
  refusee: 'FedaPay dit que le paiement n’a pas abouti. Vous pouvez recommencer, ou régler autrement.',
  expiree: 'Le paiement FedaPay a expiré avant d’être fait. Vous pouvez recommencer.',
  annulee: 'Ce paiement FedaPay a été remplacé ou annulé. Vous pouvez recommencer.',
};
/** L'adresse à partager : la page de la séance, sans ce que FedaPay a laissé. */
const adresseAPartager = (): string => {
  const u = new URL(window.location.href);
  for (const k of ['fp', 'id', 'status']) u.searchParams.delete(k);
  return u.toString();
};
/* TERMINER ET RÉGLER (6 novembre 2026) : elle a terminé elle-même, sa pièce
   s'écrit au Trône dans l'instant. La page l'attend trois minutes, en 27
   lectures espacées (`attenteDeLaPiece` : la fonction n'en accorde que 60
   par adresse en dix minutes, et le Wi-Fi de la Maison est une seule
   adresse), avant de proposer le comptoir. Venue de Ma Couronne
   (`retour=couronne`), elle y revient d'un toucher une fois le règlement fait. */
const PAS_ENCORE_PRETE = 'Votre montant n’est pas encore prêt : l’équipe le prépare. Réessayez dans un instant, ou réglez au comptoir.';
const retourDemande = (): boolean => new URLSearchParams(window.location.search).get('retour') === 'couronne';
/* LE TPE DE POCHE (25 novembre 2026, maquette RsVNQvgB…) : le téléphone d'une
   employée ouvre cette page en mode TPE (`tpe=1`). La note et l'encaissement
   restent les mêmes ; ce qui ne se demande qu'à la cliente sur SON téléphone
   (le merci, la Gamme, régler à deux, partager, la prochaine place, les
   étoiles) se retire, et « Revenir au TPE » ramène à la liste du jour. Le mode
   se garde pour l'onglet : le retour de FedaPay ne porte que `r` et `fp`. */
const CLE_DU_MODE_TPE = 'mnd-regler-tpe';
const auTpe = (): boolean => {
  const dit = new URLSearchParams(window.location.search).get('tpe') === '1';
  try {
    if (dit) sessionStorage.setItem(CLE_DU_MODE_TPE, '1');
    return dit || sessionStorage.getItem(CLE_DU_MODE_TPE) === '1';
  } catch {
    return dit;
  }
};
/* RÉGLER AVANT ET APRÈS (7 novembre 2026, « pourquoi je ne peux pas faire un
   paiement d'un RDV sur ma couronne à n'importe quel moment ? ») : un
   rendez-vous sans pièce, ouvert depuis Ma Couronne, se règle d'avance ou
   après coup (`sansPiece`). Le montant vient de la fonction ; aucun merci ici
   (il se donne le jour du rituel, sur sa pièce) ; et la page ne promet pas de
   reçu WhatsApp : le versement est inscrit sur son rendez-vous, la facture se
   fait au Trône. */
const SUR_LA_PAGE = { avance: 'Régler d’avance', apres: 'Régler la séance' } as const;
const APRES_LE_REGLEMENT = {
  avance: 'C’est inscrit sur votre rendez-vous, qui reste confirmé. Si l’équipe ajoute un soin pendant la séance, il se règle en plus le jour même.',
  apres: 'C’est inscrit sur votre rendez-vous : la Maison est prévenue.',
} as const;
/** Ce que la page dit d'un refus de la prochaine place (23 novembre 2026). */
const ditLeRefusProchain = (e?: string): string => e === 'place'
  ? 'Cette place n’est plus proposée. Choisissez-en une autre.'
  : e === 'pas_de_place' ? 'La Maison ne vous a pas encore proposé de place.'
    : 'La réponse n’est pas passée. Réessayez dans un instant.';

export default function App() {
  const jeton = jetonDeLAdresse();
  const [ecran, setEcran] = useState<Ecran>({ k: 'lecture' });
  const [pourboire, setPourboire] = useState(0);
  const [autre, setAutre] = useState(false);
  const [saisie, setSaisie] = useState('');
  const [souci, setSouci] = useState('');
  const [partage, setPartage] = useState('');
  /* Une demande MTN attend sa validation : KkiaPay se tient à l'écart (11 novembre 2026). */
  const [mtnOccupe, setMtnOccupe] = useState(false);
  /* LE SCEAU (22 novembre 2026) : le moyen qu'elle a choisi sur sa note, et
     si la Maison a ouvert MTN pour cette séance. Le sceau prend le rail du
     moyen ; si MTN n'est pas ouvert, il ouvre KkiaPay. */
  const [moyen, setMoyen] = useState<MoyenDuSceau>('mtn');
  const [mtnOuvert, setMtnOuvert] = useState(false);
  /* MOOV, CELTIIS : SON NUMÉRO D'ABORD (23 novembre 2026). « Quand on choisit
     Moov et Celtiis rien ne se passe, ça ne demande pas de récupérer un numéro
     de téléphone » (Yéman, pendant l'essai). La page le demande, comme pour
     MTN, et la fenêtre KkiaPay s'ouvre avec ce numéro déjà écrit. KkiaPay
     n'envoie aucune demande sans sa fenêtre : elle y confirme, puis tape son
     code secret. */
  const [numeroKkia, setNumeroKkia] = useState('');
  const parMobile = moyen === 'moov' || moyen === 'celtiis';
  const numeroLu = msisdnDe(numeroKkia);
  const nomDuMoyen = MOYENS_DU_SCEAU.find((m) => m.k === moyen)?.nom ?? '';
  /** Elle a refermé une fenêtre de paiement dans cette visite : la note se relit avant la suivante. */
  const aRenonce = useRef(false);
  /* LE SECOURS FEDAPAY (12 novembre 2026, lot C) : KkiaPay ne peut pas
     s'ouvrir (sans clé, d'emblée ; script injoignable ou erreur technique,
     au toucher). Elle annule elle-même : rien ne change. */
  const [kkiaEnPanne, setKkiaEnPanne] = useState(() => !kkiapayPeutSOuvrir());
  const demandeFp = demandeFedaPayDeLAdresse();
  const [retourFp, setRetourFp] = useState<RetourFedaPay | null>(() => (demandeFp ? 'lecture' : null));
  /** Ce que FedaPay a confirmé, gardé pour la lecture du lien qui arriverait après. */
  const payeParFedaPay = useRef<{ paye: number; honore: boolean } | null>(null);

  const lis = useCallback(async (essai = 0, attend = false): Promise<void> => {
    if (!jeton) { setEcran({ k: 'erreur', dit: 'Ce lien est incomplet. Demandez-en un nouveau à la Maison.' }); return; }
    const r = await lisLeLien(jeton);
    /* LE FREIN DE LA FONCTION N'EST PAS UNE PANNE (« trop », relecture du 6
       novembre 2026) : pendant l'attente de sa pièce, c'est « pas encore
       prêt », et la page relit plus tard, jamais plus vite que toutes les
       10 s. Hors de l'attente, elle le dit et propose de réessayer. */
    if (r.error === 'trop') {
      const delai = attend ? attenteDeLaPiece(essai) : null;
      if (delai !== null) {
        setEcran({ k: 'preparation' });
        window.setTimeout(() => { void lis(essai + 1, true); }, Math.max(delai, 10_000));
        return;
      }
      setEcran({ k: 'erreur', dit: attend ? PAS_ENCORE_PRETE : 'Beaucoup de demandes d’un coup. Réessayez dans un instant.', reessayer: true });
      return;
    }
    if (!r.ok || !r.page) {
      setEcran({ k: 'erreur', dit: r.error === 'hors_ligne' || r.error === 'reseau' ? 'Pas de réseau pour l’instant. Réessayez dans un moment.' : 'La page ne répond pas. Réessayez dans un moment.' });
      return;
    }
    const p = r.page;
    /* Elle a terminé elle-même : le Trône prépare sa pièce. La page attend,
       et le dit ; au bout de trois minutes, le comptoir reste là. */
    if (p.etat === 'sans-piece' && p.enPreparation) {
      const delai = attenteDeLaPiece(essai);
      if (delai !== null) {
        setEcran({ k: 'preparation' });
        window.setTimeout(() => { void lis(essai + 1, true); }, delai);
        return;
      }
      setEcran({ k: 'erreur', dit: PAS_ENCORE_PRETE, reessayer: true });
      return;
    }
    /* Le rendez-vous vient d'être écrit au comptoir : il peut mettre quelques
       secondes à arriver. On relit trois fois avant de dire « introuvable ». */
    if ((p.etat === 'introuvable' || p.etat === 'sans-piece') && essai < 3) {
      window.setTimeout(() => { void lis(essai + 1); }, 2500);
      return;
    }
    /* FedaPay a confirmé son paiement (lot C) : « Réglé », même si la Maison
       doit encore le rapprocher de sa pièce ; jamais une seconde demande. */
    const fp = payeParFedaPay.current;
    if (p.etat === 'reglee') setEcran({ k: 'reglee', page: p, ...(fp ? { paye: fp.paye, honore: fp.honore } : {}) });
    else if (p.etat === 'a-regler' && fp) setEcran({ k: 'reglee', page: { ...p, resteXof: 0 }, paye: fp.paye, honore: fp.honore });
    else if (p.etat === 'a-regler') setEcran({ k: 'page', page: p });
    else if (p.etat === 'annule') setEcran({ k: 'erreur', dit: p.tetes ? 'Ces rendez-vous ont été annulés : il n’y a rien à régler.' : 'Ce rendez-vous a été annulé : il n’y a rien à régler.' });
    else if (p.etat === 'sans-piece') setEcran({ k: 'erreur', dit: 'Votre facture n’est pas encore prête. Réessayez dans un instant.' });
    else setEcran({ k: 'erreur', dit: 'Ce lien n’est plus valable. Demandez-en un nouveau à la Maison.' });
  }, [jeton]);

  useEffect(() => { void lis(); }, [lis]);

  /* ══ LE FIL (22 novembre 2026, Le Sceau) ═══════════════════════════════
     Le Trône souffle « relis » quand la pièce de ce rendez-vous change — un
     soin ajouté, un geste offert. La page relit alors sa note au serveur :
     elle voit le geste de la Maison SANS RIEN TOUCHER, et c'est la fonction
     qui dit le montant, jamais le fil. Une relecture par quatre secondes au
     plus : la fonction n'accorde que soixante lectures en dix minutes et par
     adresse, et le Wi-Fi de la Maison est une seule adresse. */
  const derniereRelecture = useRef(0);
  const relisEnDirect = useCallback(async (): Promise<void> => {
    if (!jeton) return;
    const maintenant = Date.now();
    if (maintenant - derniereRelecture.current < 4_000) return;
    derniereRelecture.current = maintenant;
    const r = await lisLeLien(jeton);
    if (!r.ok || !r.page) return;
    const p = r.page;
    setEcran((e) => {
      if (e.k !== 'page') return e;
      if (p.etat === 'reglee') return { k: 'reglee', page: { ...p, resteXof: 0 } };
      if (p.etat !== 'a-regler') return e;
      return { k: 'page', page: p };
    });
  }, [jeton]);

  useEffect(() => {
    if (!jeton) return;
    return ecouteLeFilDuSceau(jeton, () => { void relisEnDirect(); });
  }, [jeton, relisEnDirect]);

  /* LE FILET : sans le fil (pas de clé, pas de réseau), sa note se relit
     quand même — toutes les quarante-cinq secondes, et au retour sur
     l'onglet. Le direct accélère ; il ne porte rien. */
  useEffect(() => {
    if (!jeton) return;
    const battement = window.setInterval(() => { if (!document.hidden) void relisEnDirect(); }, 45_000);
    const auRetour = () => { if (document.hidden) return; derniereRelecture.current = 0; void relisEnDirect(); };
    document.addEventListener('visibilitychange', auRetour);
    return () => { window.clearInterval(battement); document.removeEventListener('visibilitychange', auRetour); };
  }, [jeton, relisEnDirect]);

  /* AU RETOUR DE FEDAPAY : l'état de SA demande, relu toutes les quatre
     secondes, trois minutes au plus. Payée : « Réglé » ; refusée, expirée,
     remplacée : la page le dit et laisse recommencer ; rien encore : la page
     le dit, sans faire payer deux fois. */
  useEffect(() => {
    if (!jeton || !demandeFp) return;
    let vivant = true;
    void (async () => {
      for (let i = 0; i < ATTENTE_FEDAPAY_LECTURES && vivant; i++) {
        if (i > 0) await new Promise((ok) => window.setTimeout(ok, ATTENTE_FEDAPAY_MS));
        if (!vivant) return;
        const s = await statutFedaPay(jeton, demandeFp);
        if (!vivant) return;
        if (s.erreur === 'introuvable' || s.erreur === 'lien') { setRetourFp(null); return; }
        if (s.etat === 'payee') {
          const fait = { paye: Number(s.regleXof) || 0, honore: s.honore === true };
          payeParFedaPay.current = fait;
          setRetourFp(null);
          setEcran((e) => ('page' in e ? { k: 'reglee', page: { ...e.page, resteXof: 0 }, paye: fait.paye, honore: fait.honore } : e));
          return;
        }
        if (s.etat === 'refusee' || s.etat === 'expiree' || s.etat === 'annulee') { setRetourFp(s.etat); return; }
      }
      if (vivant) setRetourFp('delai');
    })();
    return () => { vivant = false; };
  }, [jeton, demandeFp]);

  /* SA NOTE SE RELIT PEU APRÈS UNE FENÊTRE REFERMÉE : si la demande partie
     sur son téléphone aboutit malgré tout, la page le voit sans qu'elle
     recharge (le filet de KkiaPay prévient la fonction). */
  const relisBientot = () => {
    for (const ms of [6_000, 25_000]) window.setTimeout(() => { derniereRelecture.current = 0; void relisEnDirect(); }, ms);
  };

  const regle = async (p: PageDuLien) => {
    setSouci('');
    setEcran({ k: 'paiement', page: p });
    /* ELLE A DÉJÀ RENONCÉ UNE FOIS : un paiement parti de son téléphone après
       la fenêtre refermée a pu aboutir. Sa note se relit avant de rouvrir
       quoi que ce soit : deux paiements, c'est deux fois le même argent. */
    if (aRenonce.current) {
      const r = await lisLeLien(jeton);
      if (r.ok && r.page?.etat === 'reglee') { setEcran({ k: 'reglee', page: { ...r.page, resteXof: 0 } }); return; }
    }
    const montant = p.resteXof + (p.pourboire ? pourboire : 0);
    /* LE MOYEN QU'ELLE A CHOISI OUVRE SA FENÊTRE (23 novembre 2026) : la
       carte ouvre la carte, Moov et Celtiis ouvrent le mobile money avec son
       numéro déjà écrit. Le foyer et le règlement d'avance, qui ne choisissent
       pas de moyen, gardent la fenêtre entière. */
    const surSaNote = !p.sansPiece && !p.tetes;
    const numero = surSaNote && parMobile ? msisdnDe(numeroKkia) : null;
    let transactionId = '';
    try {
      transactionId = (await payWithKkiapay({
        amountXof: montant, partnerId: p.reference, branchId: p.branchId,
        rendLaMainALaFermeture: true,
        ...(surSaNote && moyen === 'carte' ? { moyens: ['card'] as const } : surSaNote && parMobile ? { moyens: ['momo'] as const } : {}),
        ...(numero ? { phone: numero.slice(3) } : {}),
      })).transactionId;
    } catch (e) {
      setEcran({ k: 'page', page: p });
      /* ELLE A REFERMÉ LA FENÊTRE, ou touché « Changer de moyen » : sa note
         revient, ses moyens se libèrent, et rien ne s'écrit en rouge — elle
         n'a rien raté, elle a changé d'avis. */
      if (estUneFenetreFermee(e)) { aRenonce.current = true; relisBientot(); return; }
      /* KkiaPay en panne (pas elle, pas son opérateur) : FedaPay prend le relais. */
      if (estUnePanneDeKkiapay(e)) { setKkiaEnPanne(true); setSouci('KkiaPay ne répond pas pour l’instant.'); return; }
      setSouci(e instanceof Error ? e.message : 'Le paiement n’a pas abouti.');
      return;
    }
    const r = await regleLeLien(jeton, transactionId);
    if (r.ok) { setEcran({ k: 'reglee', page: { ...p, resteXof: 0 }, paye: montant, honore: r.honore === true }); return; }
    if (r.error === 'reseau' || r.error === 'hors_ligne') {
      /* L'argent est chez KkiaPay ; son filet préviendra la Maison. */
      setEcran({ k: 'reglee', page: { ...p, resteXof: 0 }, paye: montant });
      return;
    }
    setEcran({ k: 'page', page: p });
    setSouci(r.error === 'deja_reglee'
      ? 'Cette séance était déjà réglée : la Maison vous rendra ce paiement.'
      : 'Votre paiement est enregistré chez KkiaPay, la Maison le vérifie. Inutile de payer une seconde fois.');
  };

  /* LE GESTE : le sceau posé se dit au Trône, PAS l'argent. La fonction note
     l'heure et le moyen sur le lien, et le Trône voit « Elle règle » à la
     seconde. L'argent n'entre qu'ensuite, avec `regleLeLien`, et seulement
     sur la réponse de KkiaPay : une page rejouée ne paie donc rien. */
  const poserLeSceau = async (p: PageDuLien): Promise<void> => {
    if (!p.tetes && !p.sansPiece) {
      const rail: string = moyen === 'mtn' && !mtnOuvert ? 'kkiapay' : moyen;
      void poseLeSceau(jeton, rail);
    }
    await regle(p);
  };

  /* ══ RÉGLER À DEUX — 23 novembre 2026 (Le Sceau, suite) ═══════════════
     « Qui règle avec vous ? » (maquette LK7GvACWPzWgJ7WNZeZigp). Elle
     nomme son invitée, la fonction tire un lien pour elle — un seul à la
     fois, le précédent s'éteint —, et la page le lui envoie par WhatsApp
     ou par copie. L'invitée ouvre la même page et paie le reste. */
  const [invitee, setInvitee] = useState('');
  const [invitationOuverte, setInvitationOuverte] = useState(false);
  const [lienDeLInvitee, setLienDeLInvitee] = useState('');
  /* LA SORTIE (23 novembre 2026) : sa prochaine place, puis les étoiles. */
  const [modifie, setModifie] = useState(false);
  const [placeChoisie, setPlaceChoisie] = useState<{ jour: string; heure: string } | null>(null);
  const [etoilesFaite, setEtoilesFaite] = useState(false);
  /* LA GAMME AU FAUTEUIL (23 novembre 2026) : l'étagère, ouverte d'un
     toucher ; les produits viennent du CATALOGUE, au serveur. */
  const [gammeOuverte, setGammeOuverte] = useState(false);
  const [produits, setProduits] = useState<{ id: string; nom: string; xof: number }[]>([]);
  const [sortieOccupe, setSortieOccupe] = useState(false);

  const inviter = async () => {
    const nom = invitee.replace(/\s+/g, ' ').trim().slice(0, 18);
    if (!nom) return;
    setSouci('');
    const r = await inviteAUnePart(jeton, nom);
    if (!r.ok || typeof r.jeton !== 'string') {
      setSouci(r.error === 'deja_reglee' ? 'Cette séance est déjà réglée : il n’y a plus rien à partager.' : 'Le lien n’a pas pu partir. Réessayez dans un instant.');
      return;
    }
    const adresse = `${window.location.origin}${window.location.pathname}?r=${r.jeton}`;
    setLienDeLInvitee(adresse);
    setInvitationOuverte(false);
    const mot = `Peux-tu régler ma séance à la Maison MND ? C’est ${nom} qui reçois le lien :`;
    try {
      if (navigator.share) { await navigator.share({ title: 'Maison MND', text: mot, url: adresse }); return; }
    } catch { /* fermé par elle */ }
    try {
      await navigator.clipboard.writeText(`${mot} ${adresse}`);
      setPartage(`Lien de ${nom} copié : collez-le dans votre conversation.`);
    } catch {
      setPartage(adresse);
    }
  };

  /* SA PROCHAINE PLACE : elle répond, la fonction l'écrit, la page se relit. */  const repondreAuProchainRituel = async (geste: 'confirmer' | 'choisir' | 'plus-tard', place?: { jour: string; heure: string }) => {
    if (sortieOccupe) return;
    setSortieOccupe(true);
    const r = await repondsAuProchainRituel(jeton, geste, place);
    setSortieOccupe(false);
    if (!r.ok) { setSouci(ditLeRefusProchain(r.error)); return; }
    setPlaceChoisie(null);
    setModifie(false);
    const relu = await lisLeLien(jeton);
    if (relu.ok && relu.page) setEcran((e) => (e.k === 'reglee' ? { ...e, page: relu.page! } : e));
  };

  /* LA GAMME AU FAUTEUIL (23 novembre 2026) : l'étagère. Les produits
     viennent du catalogue, au serveur ; le prix avec eux. Elle en prend un,
     sa note grandit, le Trône le voit. */
  const ouvreLaGamme = async () => {
    setGammeOuverte(true);
    const r = await laGamme(jeton);
    const p = Array.isArray(r.produits) ? (r.produits as { id: string; nom: string; xof: number }[]) : [];
    setProduits(p);
  };
  const prendsALaGamme = async (produitId: string) => {
    const r = await ajouteALaGamme(jeton, produitId);
    if (!r.ok) { setSouci(r.error === 'deja_reglee' ? 'Cette séance est déjà réglée : rien ne s’y ajoute.' : 'Le produit n’a pas pu s’ajouter. Réessayez à l’accueil.'); return; }
    setSouci('');
    setGammeOuverte(false);
    const relu = await lisLeLien(jeton);
    if (relu.ok && relu.page) setEcran((e) => ('page' in e ? { ...e, page: relu.page! } : e));
  };
  const retireLeProduit = async (produitId: string) => {
    const r = await retireDeLaGamme(jeton, produitId);
    if (!r.ok) { setSouci('Le produit n’a pas pu se retirer. Demandez à l’accueil.'); return; }
    const relu = await lisLeLien(jeton);
    if (relu.ok && relu.page) setEcran((e) => ('page' in e ? { ...e, page: relu.page! } : e));
  };

  const partager = async () => {
    const adresse = adresseAPartager();
    const mot = ecran.k === 'page' && ecran.page.tetes ? 'Peux-tu régler nos séances à la Maison MND ? Le lien :' : 'Peux-tu régler ma séance à la Maison MND ? Le lien :';
    try {
      if (navigator.share) { await navigator.share({ title: 'Maison MND', text: mot, url: adresse }); return; }
    } catch { /* fermé par elle : rien à dire */ return; }
    try {
      await navigator.clipboard.writeText(`${mot} ${adresse}`);
      setPartage('Lien copié : collez-le dans la conversation de votre choix.');
    } catch {
      setPartage(adresse);
    }
  };

  return (
    <main className="rg">
      <header className="rg-tete">
        <img className="rg-verrou" src={asset('assets/vectoriel/verrou-couche-indigo.svg')} alt="Maison MND" />
      </header>

      {ecran.k === 'lecture' && <p className="rg-doux rg-centre">Un instant, la Maison relit votre séance…</p>}

      {ecran.k === 'preparation' && <p className="rg-doux rg-centre" aria-live="polite">La Maison prépare votre montant. Un instant…</p>}

      {ecran.k === 'erreur' && <p className="rg-doux rg-centre">{ecran.dit}</p>}
      {ecran.k === 'erreur' && ecran.reessayer && (
        <button type="button" className="rg-autre" onClick={() => { setEcran({ k: 'lecture' }); void lis(); }}>Réessayer</button>
      )}

      {(ecran.k === 'page' || ecran.k === 'paiement') && (() => {
        const p = ecran.page;
        const total = p.resteXof + (p.pourboire ? pourboire : 0);
        /* L'ÉTAGÈRE, UNE PAGE À ELLE (maquette : « Visez l'étiquette. ») —
           23 novembre 2026. Les produits et leurs prix viennent du catalogue,
           au serveur ; elle n'en invente aucun. */
        if (gammeOuverte) {
          return (
            <section className="rg-bloc" aria-label="La Gamme">
              <button type="button" className="rg-lien" style={{ justifySelf: 'start' }}
                onClick={() => setGammeOuverte(false)}>Retour à ma note</button>
              <p className="rg-sur">La Gamme</p>
              <h1 className="rg-titre">Visez l’étiquette.</h1>
              <p className="rg-doux">Ce que la Maison peut vous remettre avant de partir. Ce que vous prenez s’ajoute à votre note, et l’équipe le voit.</p>
              {produits.length === 0 && <p className="rg-doux">Rien n’est proposé pour l’instant.</p>}
              {produits.map((x) => {
                const pris = p.lignes.some((l) => l.produitId === x.id);
                return (
                  <button key={x.id} type="button" className="rg-autre" disabled={pris}
                    onClick={() => { void prendsALaGamme(x.id); }}
                    style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <span>{x.nom}</span>
                    <span style={{ whiteSpace: 'nowrap' }}>{pris ? 'dans votre note' : francs(x.xof)}</span>
                  </button>
                );
              })}
              {souci && <p className="rg-souci" role="alert">{souci}</p>}
            </section>
          );
        }
        return (
          <section className="rg-bloc" aria-label={p.sansPiece ? SUR_LA_PAGE[p.sansPiece] : p.tetes ? 'Régler les séances' : 'Régler la séance'}>
            <p className="rg-sur">{p.sansPiece ? SUR_LA_PAGE[p.sansPiece] : p.tetes ? 'Régler les séances' : 'Régler la séance'}</p>
            {p.tetes
              ? <h1 className="rg-titre">Les séances {desTetes(p.tetes.map((x) => x.prenom))}{p.jour ? `, ${jourDit(p.jour)}` : ''}.</h1>
              : <h1 className="rg-titre">La séance {deLaCliente(p.prenom)}{p.jour ? `, ${jourDit(p.jour)}` : ''}.</h1>}
            {p.maitre && <p className="rg-doux">Avec {p.maitre}.</p>}

            <div className="rg-lignes">
              {p.lignes.map((l, i) => (
                <div className="rg-ligne" key={i}>
                  <span>{l.label}{l.produitId ? <em> · La Gamme</em> : null}</span>
                  <span>
                    {francs(l.montantXof)}
                    {l.produitId && (
                      <button type="button" className="rg-lien" style={{ marginLeft: 8 }}
                        onClick={() => { void retireLeProduit(l.produitId!); }}>Retirer</button>
                    )}
                  </span>
                </div>
              ))}
              {/* LE GESTE OFFERT (22 novembre 2026) : la Maison l'a posé sur sa
                  note, elle le voit sans rien toucher. Il est DÉJÀ dans le
                  total (c'est la remise de la pièce) : on ne le retranche pas
                  deux fois. */}
              {(p.gesteXof ?? 0) > 0 && (
                <>
                  <div className="rg-ligne rg-geste"><span>Geste de la Maison <em>offert</em></span><span>− {francs(p.gesteXof ?? 0)}</span></div>
                  <div className="rg-ligne rg-doux"><span>Total</span><span>{francs(p.totalXof)}</span></div>
                </>
              )}
              {p.recuXof > 0 && <div className="rg-ligne rg-doux"><span>Déjà reçu</span><span>− {francs(p.recuXof)}</span></div>}
              <div className="rg-ligne rg-fort"><span>Reste à régler</span><span>{francs(p.resteXof)}</span></div>
            </div>
            <p className="rg-direct"><i aria-hidden="true" />En direct avec la Maison</p>
            {p.sansPiece === 'avance' && <p className="rg-doux rg-petit">Le rendez-vous reste confirmé. Si l’équipe ajoute un soin pendant la séance, il se règle en plus le jour même.</p>}

            {p.pourboire && !auTpe() && (
              <div className="rg-merci">
                <span className="rg-doux">Un merci pour l’équipe ?</span>
                <div className="rg-puces">
                  {POURBOIRES.map((x) => {
                    const on = !autre && pourboire === x;
                    return (
                      <button key={x} type="button" className={on ? 'rg-puce rg-puce--on' : 'rg-puce'} aria-pressed={on}
                        onClick={() => { setAutre(false); setSaisie(''); setPourboire(on ? 0 : x); }}>
                        {francs(x)}
                      </button>
                    );
                  })}
                  <button type="button" className={autre ? 'rg-puce rg-puce--on' : 'rg-puce'} aria-pressed={autre}
                    onClick={() => { const o = !autre; setAutre(o); setSaisie(''); setPourboire(0); }}>
                    Autre
                  </button>
                </div>
                {autre && (
                  <label className="rg-autre-montant">
                    <span className="rg-doux">Le montant de votre merci</span>
                    <span className="rg-champ">
                      <input inputMode="numeric" autoComplete="off" placeholder="Par exemple 3 000" value={saisie} autoFocus
                        onChange={(e) => {
                          const chiffres = e.target.value.replace(/\D/g, '').slice(0, 6);
                          const x = Math.min(POURBOIRE_MAX, Number(chiffres) || 0);
                          setSaisie(x ? x.toLocaleString('fr-FR').replace(/ | /g, ' ') : '');
                          setPourboire(x);
                        }} />
                      <span>F</span>
                    </span>
                  </label>
                )}
              </div>
            )}

            {/* COMMENT RÉGLER (22 novembre 2026, Le Sceau) : MTN, Moov, Celtiis,
                carte — son choix, jamais celui de la page. Les puces se
                figent pendant qu'une demande MTN attend sa validation : deux
                moyens en vol, c'est deux fois le même argent. */}
            {!p.sansPiece && !p.tetes && (
              <div className="rg-merci">
                <span className="rg-doux">Comment régler</span>
                <div className="rg-puces">
                  {MOYENS_DU_SCEAU.map((m) => {
                    const on = moyen === m.k;
                    return (
                      <button key={m.k} type="button" className={on ? 'rg-puce rg-puce--on' : 'rg-puce'} aria-pressed={on}
                        disabled={mtnOccupe || ecran.k === 'paiement'} onClick={() => setMoyen(m.k)}>
                        {m.nom}
                      </button>
                    );
                  })}
                </div>
                <span className="rg-doux rg-petit">En espèces ? Au comptoir, comme toujours.</span>
              </div>
            )}

            {/* RÉGLER PAR MTN (11 novembre 2026, maquette AdAaYXGS…) : une
                séance avec sa pièce, quand la Maison l'a ouvert ; le montant
                vient de la fonction collecte-mtn, la page ne donne que le
                numéro et le merci. Le foyer et le règlement d'avance restent
                à KkiaPay. */}
            {!p.sansPiece && !p.tetes && (
              <PayerParMtn jeton={jeton} totalXof={total} pourboireXof={p.pourboire ? pourboire : 0} onOccupe={setMtnOccupe}
                masque={moyen !== 'mtn'} onOuverte={setMtnOuvert}
                onGeste={() => { void poseLeSceau(jeton, 'mtn'); }}
                geste={(o) => <Sceau montantXof={o.montantXof} disabled={o.disabled} onTenue={o.onTenue}
                  dit={o.disabled ? 'Votre numéro MTN d’abord' : 'Maintenez le sceau une seconde'} />}
                onRegle={(paye, honore) => setEcran({ k: 'reglee', page: { ...p, resteXof: 0 }, paye, honore })} />
            )}
            {/* LE RETOUR DE FEDAPAY (12 novembre 2026, lot C) : tant que sa
                demande se relit, aucun autre bouton ne fait payer une seconde fois. */}
            {retourFp === 'lecture' && <p className="rg-doux rg-centre" aria-live="polite">FedaPay confirme votre paiement. Un instant…</p>}
            {retourFp && retourFp !== 'lecture' && <p className="rg-souci" role="status">{RETOUR_FEDAPAY_DIT[retourFp]}</p>}
            {/* LE SCEAU, PAR KKIAPAY (22 novembre 2026) : Moov, Celtiis, la
                carte — et MTN quand la Maison ne l'a pas ouvert, ou sur une
                séance qui n'a pas sa pièce (le foyer, le règlement d'avance).
                Un doigt maintenu une seconde, et la fenêtre s'ouvre sur son
                téléphone. */}
            {kkiapayPeutSOuvrir() && retourFp !== 'lecture' && !(moyen === 'mtn' && mtnOuvert && !p.sansPiece && !p.tetes) && (
              <>
                {moyen === 'mtn' && !mtnOuvert && !p.sansPiece && !p.tetes && (
                  <p className="rg-doux rg-petit rg-centre">MTN n’est pas ouvert pour cette séance : le sceau ouvre KkiaPay, qui prend MTN, Moov, Celtiis et la carte.</p>
                )}
                {/* MOOV, CELTIIS : SON NUMÉRO D'ABORD (23 novembre 2026). Le
                    sceau attend un numéro qui se lit ; la fenêtre KkiaPay
                    s'ouvre ensuite avec lui. */}
                {parMobile && !p.sansPiece && !p.tetes && (
                  <label className="rg-autre-montant">
                    <span className="rg-doux">Votre numéro {nomDuMoyen}</span>
                    <span className="rg-champ">
                      <input id="rg-numero-kkiapay" inputMode="tel" autoComplete="tel" placeholder="01 …" value={numeroKkia} disabled={ecran.k === 'paiement'}
                        onChange={(e) => setNumeroKkia(e.target.value.replace(/[^\d+ ]/g, '').slice(0, 20))} />
                    </span>
                    {numeroKkia.replace(/\D/g, '').length >= 10 && !numeroLu && <span className="rg-doux rg-petit">Ce numéro ne se lit pas : dix chiffres, commençant par 01.</span>}
                  </label>
                )}
                <Sceau montantXof={total} disabled={ecran.k === 'paiement' || mtnOccupe || (parMobile && !p.sansPiece && !p.tetes && !numeroLu)}
                  dit={ecran.k === 'paiement' ? 'Paiement en cours…' : parMobile && !p.sansPiece && !p.tetes && !numeroLu ? `Votre numéro ${nomDuMoyen} d’abord` : 'Maintenez le sceau une seconde'}
                  onTenue={() => { void poserLeSceau(p); }} />
                {/* TOUJOURS UNE SORTIE (23 novembre 2026, « on ne peut plus
                    revenir en arrière et modifier ») : pendant le paiement,
                    un lien rend la main, que la fenêtre se soit montrée ou
                    non. La refermer suffit aussi. */}
                {ecran.k === 'paiement' ? (
                  <p className="rg-centre"><button type="button" className="rg-lien" style={{ padding: '8px 6px' }} onClick={abandonneLePaiementKkiapay}>Changer de moyen</button></p>
                ) : moyen === 'carte' && !p.sansPiece && !p.tetes ? (
                  <p className="rg-doux rg-petit rg-centre">KkiaPay s’ouvre pour votre carte. Ses frais s’ajoutent au paiement.</p>
                ) : parMobile && !p.sansPiece && !p.tetes ? (
                  <p className="rg-doux rg-petit rg-centre">KkiaPay s’ouvre avec votre numéro : confirmez, puis tapez votre code secret. Ses frais s’ajoutent au paiement.</p>
                ) : (
                  <p className="rg-doux rg-petit rg-centre">KkiaPay s’ouvre sur votre téléphone. Ses frais s’ajoutent au paiement.</p>
                )}
              </>
            )}
            {souci && <p className="rg-souci" role="alert">{souci}</p>}
            {/* KKIAPAY NE S'OUVRE PAS : FedaPay prend le relais, pour une séance
                avec sa pièce (le foyer et le règlement d'avance restent à
                KkiaPay, comme pour MTN). Rien ne paraît quand KkiaPay marche. */}
            {(kkiaEnPanne || (!!retourFp && retourFp !== 'lecture')) && (!p.sansPiece && !p.tetes
              ? <PayerParFedaPay jeton={jeton} reste={p.resteXof} merciXof={p.pourboire ? pourboire : 0} merciPermis={p.pourboire}
                  bloque={mtnOccupe || ecran.k === 'paiement' || retourFp === 'lecture'} />
              : <p className="rg-doux rg-petit rg-centre">Le paiement en ligne ne répond pas pour l’instant. Réessayez dans un moment, ou réglez à l’accueil.</p>)}

            {/* PLUS DE TAP & GO ICI — 25 octobre 2026 (« le Tap & Go n'est
                vraiment pas nécessaire sur cette page ») : KkiaPay prend déjà
                les trois réseaux et la carte ; deux boutons de paiement à deux
                montants faisaient douter. Tap & Go reste au comptoir. */}
            {/* RÉGLER À DEUX (23 novembre 2026) : elle nomme son invitée, un
                seul lien à la fois. L'invitée, elle, ne voit pas ce bouton —
                elle est déjà celle qui règle. */}
            {/* LA GAMME AU FAUTEUIL — 23 novembre 2026 : deux tuiles, comme
                la maquette — prendre un soin, ou régler à deux. */}
            {!auTpe() && (
            <div className="rg-puces">
              <button type="button" className="rg-autre" style={{ flex: 1 }} onClick={() => { void ouvreLaGamme(); }}>La Gamme · prendre un soin</button>
            </div>
            )}
            {!p.parInvitee && !auTpe() && (
              <div className="rg-merci">
                {p.invitee ? (
                  <>
                    <span className="rg-doux">{p.invitee.nom} peut régler avec vous. Un seul lien à la fois : si vous changez d’invitée, l’ancien s’éteint.</span>
                    <button type="button" className="rg-autre" onClick={() => { setInvitee(p.invitee?.nom ?? ''); setInvitationOuverte(true); }}>Changer d’invitée</button>
                  </>
                ) : (
                  <button type="button" className="rg-autre" onClick={() => setInvitationOuverte(true)}>Régler à deux</button>
                )}
                {invitationOuverte && (
                  <div className="rg-merci">
                    <label className="rg-autre-montant">
                      <span className="rg-doux">Qui règle avec vous ?</span>
                      <span className="rg-champ">
                        <input maxLength={18} autoComplete="off" placeholder="Son prénom" value={invitee} autoFocus
                          onChange={(e) => setInvitee(e.target.value)} />
                      </span>
                    </label>
                    <button type="button" className="rg-autre" disabled={!invitee.trim()} onClick={() => { void inviter(); }}>
                      {invitee.trim() ? `Envoyer le lien à ${invitee.trim()}` : 'Son prénom d’abord'}
                    </button>
                    <span className="rg-doux rg-petit">Elle reçoit un lien : elle voit le montant, jamais votre numéro. Ce qu’elle règle s’enlève de votre note.</span>
                  </div>
                )}
                {lienDeLInvitee && (
                  <div className="rg-merci" style={{ justifyItems: 'center' }}>
                    <span className="rg-doux">Lien prêt pour {p.invitee?.nom ?? invitee}. Elle peut aussi le scanner :</span>
                    <QrSvg valeur={lienDeLInvitee} style={{ width: 148, height: 148, display: 'block' }}
                      dit={`Le QR du lien de ${p.invitee?.nom ?? invitee}`} />
                  </div>
                )}
              </div>
            )}
            {auTpe() ? (
              <a className="rg-autre" href="tpe.html">Revenir au TPE</a>
            ) : (
              <>
                <button type="button" className="rg-autre" onClick={() => { void partager(); }}>Quelqu’un règle pour moi</button>
                <p className="rg-doux rg-petit rg-centre">Envoyez-lui ce lien : la personne voit {p.tetes ? 'les séances' : 'la séance'} et le montant, jamais votre numéro.</p>
                {partage && <p className="rg-doux rg-petit rg-centre">{partage}</p>}
              </>
            )}
          </section>
        );
      })()}

      {ecran.k === 'reglee' && (() => {
        /* ══ LA SORTIE — 23 novembre 2026 (Le Sceau, la suite) ═══════════
           Trois pages, une demande chacune, dans l'ordre que Yéman a tranché :
           sa prochaine place d'abord (« Confirmer cette place » ou
           « Modifier », jamais « Garder »), les étoiles ensuite — une page à
           elles seules —, et « Merci. » à la fin. Rien ne s'empile. */
        const pr = ecran.page.prochainRituel;
        /* Au TPE de poche, la place et les étoiles restent à SON téléphone : « Merci. » d'emblée. */
        const etape = auTpe() ? 'merci' : pr && !pr.reponse ? 'place' : (ecran.paye && !etoilesFaite ? 'etoiles' : 'merci');

        if (etape === 'place' && pr) {
          const retenue = placeChoisie;
          return (
            <section className="rg-bloc rg-final" aria-label="Votre prochain rituel">
              <p className="rg-sur">Votre prochain rituel</p>
              {retenue ? (
                <>
                  <p className="rg-titre" style={{ margin: 0 }}>{jourDit(retenue.jour)}, {retenue.heure}.</p>
                  <button type="button" className="rg-regler" onClick={() => { void repondreAuProchainRituel('choisir', retenue); }}>
                    Confirmer cette place
                  </button>
                  <button type="button" className="rg-autre" onClick={() => setPlaceChoisie(null)}>Retour</button>
                </>
              ) : (
                <>
                  <p className="rg-titre" style={{ margin: 0 }}>{jourDit(pr.jour)}, {pr.heure}.</p>
                  <button type="button" className="rg-regler" onClick={() => { void repondreAuProchainRituel('confirmer'); }}>
                    Confirmer cette place
                  </button>
                  {(pr.autres?.length ?? 0) > 0 && (
                    <>
                      <button type="button" className="rg-autre" onClick={() => setModifie(true)}>Modifier</button>
                      {modifie && (
                        <div className="rg-puces" style={{ justifyContent: 'center' }}>
                          {pr.autres!.map((x) => (
                            <button key={`${x.jour}-${x.heure}`} type="button" className="rg-puce"
                              onClick={() => { setPlaceChoisie(x); setModifie(false); }}>
                              {jourDit(x.jour)}, {x.heure}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  <button type="button" className="rg-lien" onClick={() => { void repondreAuProchainRituel('plus-tard'); }}>Pas maintenant</button>
                </>
              )}
            </section>
          );
        }

        if (etape === 'etoiles') {
          const jetonEtoiles = ecran.page.etoilesJeton;
          return (
            <section className="rg-bloc rg-final" aria-label="Vos étoiles">
              <p className="rg-sur">Vos étoiles</p>
              <p className="rg-titre" style={{ margin: 0 }}>Laissez-nous vos étoiles, beauté.</p>
              {jetonEtoiles ? (
                <>
                  <p className="rg-doux">Un toucher suffit, rien à écrire.</p>
                  <a className="rg-regler" style={{ textAlign: 'center', textDecoration: 'none', display: 'block' }}
                    href={`regler.html?e=${jetonEtoiles}`}>Donner mes étoiles</a>
                  <button type="button" className="rg-lien" onClick={() => setEtoilesFaite(true)}>Plus tard</button>
                </>
              ) : (
                <>
                  <p className="rg-doux">La Maison vous écrit ce soir sur WhatsApp, avec son lien : un toucher suffit, rien à écrire.</p>
                  <button type="button" className="rg-regler" onClick={() => setEtoilesFaite(true)}>C’est noté</button>
                </>
              )}
            </section>
          );
        }

        return (
          <section className="rg-bloc rg-final" aria-label="Séance réglée">
            <SceauPose />
            <h2 className="rg-merci-titre">Merci.</h2>
            <p className="rg-signe">Maison MND</p>
            <div className="rg-ok">
              <strong>{ecran.paye ? `Réglé, ${francs(ecran.paye)}.` : 'Déjà réglée.'}</strong>
              <span>{ecran.page.sansPiece
                ? (ecran.paye ? APRES_LE_REGLEMENT[ecran.page.sansPiece] : 'Il n’y a plus rien à régler pour cette séance.')
                : ecran.page.tetes
                  ? (ecran.paye ? 'Vos reçus arrivent sur WhatsApp, chaque facture jointe.' : 'Il n’y a plus rien à régler pour ces séances.')
                  : (ecran.paye ? 'Votre reçu arrive sur WhatsApp, la facture jointe.' : 'Il n’y a plus rien à régler pour cette séance.')}</span>
              {/* Elle avait terminé elle-même : réglé, le rendez-vous est honoré (6 novembre 2026). */}
              {ecran.honore && <span>Vous pouvez partir : la Maison est prévenue.</span>}
              {ecran.page.prochainRituel?.retenue && (
                <span>Votre prochain rituel : {jourDit(ecran.page.prochainRituel.retenue.jour)}, {ecran.page.prochainRituel.retenue.heure}.</span>
              )}
            </div>
            {retourDemande() && <a className="rg-autre" href={retourAMaCouronne()}>Revenir à Ma Couronne</a>}
            {auTpe() && <a className="rg-autre" href="tpe.html">Revenir au TPE</a>}
          </section>
        );
      })()}

      <p className="rg-devise"><TexteFon texte={DEVISE} penche /></p>
    </main>
  );
}
