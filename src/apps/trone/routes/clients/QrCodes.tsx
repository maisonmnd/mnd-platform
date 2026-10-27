import { useEffect, useState, type ReactNode } from 'react';
import { CSS_FON_OA, htmlFon } from '../../../../ds/fon-pur';
import { useNavigate } from 'react-router-dom';
import { BookOpen, ChevronDown, Clock, Crown, Globe, GraduationCap, MapPin, Smartphone, Star, Wallet, Wifi, type LucideIcon } from 'lucide-react';
import { asset } from '../../../../shared/asset';
import { useBranch } from '../../../../shared/branches';
import { toast, demandeUnTexte } from '../../../../ds/components';
import { PageHead } from '../_ui';
import { createStore, useStore } from '../../../../shared/store';
import { maisonNom, DEVISE_COMPLETE, signeLeMessage, estLaMaisonMND } from '../../../../shared/identite';
import { autoConfigStore, MOMO_QR_DEFAUT, REVIEW_LINK_DEFAUT, MOMO_USSD_DEFAUT, MOMO_MARCHAND_DEFAUT, lienPaiementMomo } from '../equipe/data';
import { CODE_MOMOPAY } from '../../../../shared/momopay-de-la-maison-pur';
import { LIEN_CHAPCHAP, USSD_CHAPCHAP, MARCHAND_CHAPCHAP, RESEAUX_CHAPCHAP } from '../../../../shared/kkiapay-chapchap-pur';
import { usePointageConfig } from '../equipe/payroll';
import { QrSvg, qrMatrice, lienDuJour } from '../equipe/Comptoir';
import { imprimeCarteCouronne, lienMaCouronne } from './Vitrine';
import { todayISO, useBranchAppointments, useBranchClients, useServicesById, apptDurationMin, apptDueXof, ClientPicker } from './_shared';
import { apptCashOnDay, bornesDuSalon } from '../../../../shared/agenda';
import { useSettings } from '../../../../shared/settings';
import { fmtMoney } from '../../../../shared/currency';
import { appelDe } from '../../../../shared/civilite';
import { lienWaMe } from '../../../../shared/conversations';
import { jourEnLettres } from '../../../../shared/calendrier';
import {
  codesDuMoment, ordreParUsage, premiereVenueDe, minutesDe, besoinsDeLaCliente, autresCodesDeLaCliente, CODES_DES_CLIENTES,
  CODES_ENVOYABLES, type IdDuCode, type RdvDuMoment, type Suggestion, type Besoin,
} from '../../../../shared/codes-du-moment';
import { AuComptoir, type Grand } from './AuComptoir';
import './clients.css';

/* QR CODES — TOUS LES CODES DE LA MAISON, RÉUNIS (13 août, demande de Yéman).
   Ils vivaient éparpillés : l'invitation Ma Couronne à la Vitrine, le QR
   MoMoPay au fond des Paramètres, le code du jour au Comptoir. Une page les
   rassemble — à montrer, imprimer, afficher — et dit où chacun se règle.
   Chaque carte sait aussi s'AFFICHER AU COMPTOIR : le code en grand, plein
   écran, tourné vers la cliente — elle scanne, on referme. */


/* Le format Wi-Fi que tous les téléphones savent lire : WIFI:T:WPA;S:…;P:…;;
   Les caractères que le format réserve s'échappent — un mot de passe qui
   porte un point-virgule reste un mot de passe entier. */
const escWifi = (s: string) => s.replace(/([\\;,:"])/g, '\\$1');

/* ÉCHAPPEMENT HTML — défense en profondeur. La carte A5 se bâtit par
   concaténation de chaîne ; nom de la Maison, SSID, marchand MoMo et libellés
   viennent de documents SYNCHRONISÉS (mnd_house_identity, mnd_auto_config),
   qu'un autre poste peut écrire via l'API. Depuis le 10 octobre 2026 la
   fenêtre d'impression s'ouvre vraiment (voir `imprime`) et vit en même
   origine que le Trône : un balisage glissé dans ces champs s'y exécuterait.
   On échappe donc à la source, comme le fait déjà public/payer.html. */
const escHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const wifiPayload = (ssid: string, pass: string) =>
  `WIFI:T:WPA;S:${escWifi(ssid)};P:${escWifi(pass)};;`;

/* LE VERROU EN TÊTE DES CARTES — 25 septembre 2026. Ces cartes portaient le
   nom de la Maison en capitales espacées ; elles portent maintenant le verrou,
   comme les papiers et le site.

   L'ADRESSE EST ABSOLUE, et ce n'est pas un détail : la carte s'imprime dans
   une fenêtre ouverte sur `about:blank` et remplie par `document.write`. Cette
   fenêtre n'a pas d'adresse à elle, un chemin relatif n'y mène nulle part.

   Et le verrou ne se pose que si le nom est bien celui de la Maison : ailleurs,
   il nommerait une maison qui n'est pas la sienne. */
const verrouDeLaMaison = (): string | null => (estLaMaisonMND(maisonNom())
  ? new URL(asset('assets/verrous/verrou-couche-indigo.png'), window.location.href).href
  : null);

/* Le gabarit A5 partagé des cartes imprimées — comptoir, miroir, table. */
const carteA5 = (o: { titre: string; sous: string; qr: string; grand?: string; sousGrand?: string; etapes: string[]; ariaQr: string; verrou?: string | null }) => {
  const { path, n } = qrMatrice(o.qr);
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8" />
<title>${escHtml(maisonNom())}, ${escHtml(o.titre)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,500;1,400&family=Jost:wght@400;500;600&display=swap" />
<style>
  @page { size: A5 portrait; margin: 0; }
  body { margin: 0; background: #F6F1E7; color: #14141B; font-family: 'Jost', sans-serif;
         display: flex; justify-content: center; }
  .carte { width: 148mm; min-height: 210mm; box-sizing: border-box; padding: 18mm 16mm;
           display: flex; flex-direction: column; align-items: center; text-align: center;
           border: 1px solid rgba(20,20,27,.14); outline: 2px solid #B97A4A; outline-offset: -6mm; }
  .marque { font-size: 13px; font-weight: 600; letter-spacing: .34em; color: #1E2150; }
  /* 46 mm : bien au-dessus du plancher du verrou (33 mm), et 40 % de la
     largeur utile de la carte. */
  .verrou { width: 46mm; height: auto; display: block; margin: 0 auto; }
  .titre { font-family: 'Cormorant Garamond', serif; font-weight: 300; font-size: 38px; color: #1E2150; margin: 10mm 0 2mm; }
  .sous { font-family: 'Cormorant Garamond', serif; font-style: italic; font-size: 16px; color: #45454F; max-width: 96mm; line-height: 1.5; }
  .qr { width: 64mm; height: 64mm; margin: 10mm 0 6mm; }
  .grand { font-family: 'Cormorant Garamond', serif; font-size: 30px; color: #1E2150; letter-spacing: .06em; }
  .sousgrand { font-size: 13px; color: #45454F; margin-top: 3mm; letter-spacing: .04em; }
  .etapes { font-size: 12.5px; color: #14141B; line-height: 2; letter-spacing: .02em; margin-top: 6mm; }
  .etapes b { color: #9E6238; font-weight: 600; letter-spacing: .12em; }
  .devise { margin-top: auto; font-family: 'Cormorant Garamond', serif; font-style: italic; font-size: 14px; color: #9E6238; }
  ${CSS_FON_OA} .devise .fon-oa::after { left: 58%; font-style: italic; }
</style></head><body>
  <div class="carte">
    ${o.verrou ? `<img class="verrou" src="${escHtml(o.verrou)}" alt="${escHtml(maisonNom())}" />`
      : `<div class="marque">${escHtml(maisonNom().toUpperCase())}</div>`}
    <div class="titre">${escHtml(o.titre)}</div>
    <div class="sous">${escHtml(o.sous)}</div>
    <svg class="qr" viewBox="-2 -2 ${n + 4} ${n + 4}" role="img" aria-label="${escHtml(o.ariaQr)}">
      <rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#F6F1E7" />
      <path d="${path}" fill="#1E2150" shape-rendering="crispEdges" />
    </svg>
    ${o.grand ? `<div class="grand">${escHtml(o.grand)}</div>` : ''}
    ${o.sousGrand ? `<div class="sousgrand">${escHtml(o.sousGrand)}</div>` : ''}
    <div class="etapes">${o.etapes.map((e, i) => `<b>${i + 1}</b> · ${escHtml(e)}`).join('<br />')}</div>
    <div class="devise">${htmlFon(DEVISE_COMPLETE)}</div>
  </div>
  <script>window.onload = () => setTimeout(() => window.print(), 400);</script>
</body></html>`;
};

/* L'IMPRESSION QUI NE FAISAIT RIEN — 10 octobre 2026. On ouvrait avec
   'noopener' : la spécification veut qu'alors window.open rende null, et la
   fonction sortait sans un mot. « Carte A5 », « Imprimer l'affiche » et la
   carte MoMo n'ont jamais imprimé. On ouvre donc SANS 'noopener', on écrit la
   carte, puis on coupe le lien vers le Trône à la main (comme _piece.tsx). Un
   vrai blocage du navigateur se dit, il ne se tait plus. */
const imprime = (html: string) => {
  const fen = window.open('', '_blank', 'width=520,height=760');
  if (!fen) { toast('La fenêtre d’impression a été bloquée par le navigateur. Autorisez les fenêtres pour le Trône.'); return; }
  fen.opener = null;
  fen.document.write(html);
  fen.document.close();
};

/* ── LA CARTE D'UN CODE ─────────────────────────────────────────────────
   REFAITE LE 27 AOÛT, sur « il y a trop de QR et je me mélange beaucoup »
   (Yéman). La page empilait sept cartes identiques : sept carrés noirs qui se
   ressemblent, les mêmes deux boutons partout, rien pour dire lequel était
   lequel. Le mélange venait de là, pas du nombre.

   Trois choses distinguent désormais une carte : SON SIGNE (une épingle, une
   onde, un téléphone — un pictogramme se reconnaît de loin, un QR non), SA
   PHRASE en capitales cuivre qui dit QUI scanne et CE QUI SE PASSE, et LE
   MOMENT de la visite où elle est rangée. */

type Geste = { texte: string; faire: () => void; fort?: boolean; empeche?: string };

function CarteCode({ signe, nom, qui, dit, valeur, vide, champ, gestes, large, enfants, sansTete }: {
  signe: LucideIcon;
  nom: string;
  /** « La cliente scanne · elle règle » — le sujet et la conséquence. */
  qui: string;
  dit: ReactNode;
  /** Le contenu du carré. Vide = pas encore renseigné, la carte le dit. */
  valeur?: string;
  vide?: string;
  champ?: { lab: string; val: ReactNode; lab2?: string; val2?: ReactNode };
  gestes: Geste[];
  large?: boolean;
  enfants?: ReactNode;
  /** Dans le panneau d'une ligne, qui dit déjà le signe et le nom (24 octobre 2026). */
  sansTete?: boolean;
}) {
  const Signe = signe;
  const pret = !!valeur;
  return (
    <div className={`trq-carte${large ? ' trq-carte--large' : ''}${pret ? '' : ' trq-carte--muette'}`}>
      {!sansTete && (
      <div className="trq-carte__tete">
        <span className={`trq-badge${pret ? '' : ' trq-badge--vide'}`}>
          <Signe size={20} strokeWidth={1.5} aria-hidden="true" />
        </span>
        <div style={{ minWidth: 0 }}>
          <p className="trq-carte__nom">{nom}</p>
          <p className="trq-carte__qui">{qui}</p>
        </div>
      </div>
      )}

      <p className="trq-carte__dit">{dit}</p>

      {enfants ?? (
        <div className="trq-carte__corps">
          {pret
            ? <div className="trq-qr"><QrSvg valeur={valeur} style={{ width: '100%', height: '100%', display: 'block' }} /></div>
            : <div className="trq-qr trq-qr--vide">{vide ?? 'à renseigner'}</div>}
          {champ && (
            <div style={{ minWidth: 0 }}>
              <div className="trq-lab">{champ.lab}</div>
              <div className="trq-val">{champ.val}</div>
              {champ.lab2 && <div className="trq-lab" style={{ marginTop: 6 }}>{champ.lab2}</div>}
              {champ.val2 && <div className="trq-val">{champ.val2}</div>}
            </div>
          )}
        </div>
      )}

      {gestes.length > 0 && (
      <div className="trq-gestes">
        {gestes.map((g) => (
          <button
            key={g.texte}
            type="button"
            className={`mnd-btn mnd-btn--sm ${g.fort ? 'mnd-btn--copper' : 'mnd-btn--ghost'}`}
            disabled={!!g.empeche}
            title={g.empeche}
            onClick={g.faire}
          >
            {g.texte}
          </button>
        ))}
      </div>
      )}
    </div>
  );
}

/* Le titre d'un moment de la visite. */
function Moment({ titre, quand, sous, children }: {
  titre: string; quand: string; sous: string; children: ReactNode;
}) {
  return (
    <section style={{ marginTop: 34 }}>
      <div className="trq-sec">
        <h2 className="trq-sec__titre">{titre}</h2>
        <span className="trq-sec__quand">{quand}</span>
        <span className="trq-sec__rule" />
      </div>
      <p className="trq-sec__sous">{sous}</p>
      {children}
    </section>
  );
}

/* ── LE WIFI, DEUX BOX EN UNE SEULE CARTE ───────────────────────────────
   Elles étaient deux cartes jumelles — « Installez-vous. » et « Le second
   réseau. » — avec des noms presque identiques et LE MÊME mot de passe. Deux
   entrées pour une seule chose : c'était à soi seul une source de mélange.

   Elles n'en font plus qu'une. Ce qui les sépare vraiment n'est pas leur nom,
   c'est leur portée : la 5G près du fauteuil, la 2G jusqu'au fond. C'est donc
   ça qui s'écrit. Face cliente, la phrase reste la même pour les deux :
   « Installez-vous. » */
function BoxWifi({ rang, portee, ssid, pass, pose, surComptoir }: {
  rang: string;
  portee: string;
  ssid: string;
  pass: string;
  pose: (ssid: string, pass: string) => void;
  surComptoir: (g: Grand) => void;
}) {
  const pret = ssid.trim() !== '' && pass.trim() !== '';
  const [ouvre, setOuvre] = useState(false);
  const valeur = pret ? wifiPayload(ssid.trim(), pass.trim()) : '';

  const imprimer = () => imprime(carteA5({
    verrou: verrouDeLaMaison(),
    titre: 'Installez-vous.',
    sous: 'Le réseau de la Maison est à vous, scannez, votre téléphone se connecte seul.',
    qr: valeur,
    grand: ssid.trim(),
    etapes: [
      'Ouvrez l’appareil photo du téléphone',
      'Visez le carré',
      '« Se connecter », vous êtes chez vous',
    ],
    ariaQr: 'QR du réseau Wi-Fi de la maison',
  }));

  return (
    <div className="trq-box">
      <span className="trq-box__rang">{rang}</span>
      {pret
        ? <div className="trq-qr"><QrSvg valeur={valeur} style={{ width: '100%', height: '100%', display: 'block' }} /></div>
        : <div className="trq-qr trq-qr--vide">à renseigner</div>}

      <div className="trq-box__nom">
        <div className="trq-lab">{portee}</div>
        {pret && !ouvre
          ? <div className="trq-val">{ssid}</div>
          : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 3 }}>
              <label className="mnd-field" style={{ width: 168 }}>
                <span className="mnd-field__label">Nom du réseau</span>
                <input className="mnd-input" value={ssid} onChange={(e) => pose(e.target.value, pass)} placeholder="Le réseau du salon" autoComplete="off" />
              </label>
              <label className="mnd-field" style={{ width: 148 }}>
                <span className="mnd-field__label">Mot de passe</span>
                <input className="mnd-input" value={pass} onChange={(e) => pose(ssid, e.target.value)} placeholder="Celui de la box" autoComplete="off" />
              </label>
            </div>
          )}
      </div>

      <div className="trq-gestes" style={{ marginTop: 0 }}>
        {pret && !ouvre && (
          <>
            <button
              type="button"
              className="mnd-btn mnd-btn--sm mnd-btn--copper"
              onClick={() => surComptoir({ titre: 'Installez-vous.', phrase: 'Le réseau de la Maison est à vous.', valeur })}
            >
              Afficher
            </button>
            <button type="button" className="mnd-btn mnd-btn--sm mnd-btn--ghost" onClick={imprimer}>Carte A5</button>
          </>
        )}
        <button type="button" className="mnd-btn mnd-btn--sm mnd-btn--ghost" onClick={() => setOuvre((v) => !v)}>
          {ouvre ? 'Terminé' : 'Modifier'}
        </button>
      </div>
    </div>
  );
}
/* LES CODES QUE CE POSTE MONTRE LE PLUS — 24 octobre 2026. Gardés sur
   l'appareil (jamais synchronisés) : le comptoir et le téléphone de Brice
   n'ont pas les mêmes habitudes, chacun range sa page à sa main. */
const usageDesCodes = createStore<Record<string, number>>('mnd_codes_usage', {});

export default function QrCodes() {
  const navigate = useNavigate();
  const [autoRaw, setAuto] = useStore(autoConfigStore);
  const momoQr = autoRaw.momoQr || MOMO_QR_DEFAUT;
  const lienAvis = (autoRaw.reviewLink || REVIEW_LINK_DEFAUT).trim();
  const momoUssd = autoRaw.momoUssd || MOMO_USSD_DEFAUT;
  const momoMarchand = autoRaw.momoMarchand || MOMO_MARCHAND_DEFAUT;
  /* Le code du jour ne se FABRIQUE pas ici — c'est le geste du Comptoir. On
     montre celui d'aujourd'hui s'il existe, sinon on mène au Comptoir. */
  const [preuve] = usePointageConfig();
  const codeJour = preuve.codeDate === todayISO() ? (preuve.codeValeur ?? '') : '';

  const { branch, currency } = useBranch();
  const [usage, setUsage] = useStore(usageDesCodes);
  const rdvsDeLaBranche = useBranchAppointments();
  const clientsDeLaBranche = useBranchClients();
  const servicesParId = useServicesById();
  const [reglagesMaison] = useSettings();
  const aujourdhui = todayISO();
  /* Le bandeau se relit à la minute : un rituel qui se termine change ce qu'il propose. */
  const [maintenant, setMaintenant] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setMaintenant(new Date()), 60_000); return () => clearInterval(t); }, []);
  const [grand, setGrand] = useState<Grand | null>(null);
  const [recherche, setRecherche] = useState('');
  const [filtre, setFiltre] = useState<string>('tous');
  const [ouvertId, setOuvertId] = useState<string | null>(null);
  /* La cliente à qui l'on montre ou envoie un code (le bandeau, en tête). */
  const [clienteId, setClienteId] = useState('');

  /* ── LES LIENS QU'ON ENVOIE — 18 août 2026 ──────────────────────
     « C'est des liens individuels, pas un seul lien pour toute la page » puis
     « juste pour MoMoPay et la localisation du salon » (Yéman).

     Le Wi-Fi n'a pas de lien : ses mots de passe s'affichent au comptoir le
     temps d'un scan, alors qu'un lien se transfère, se capture d'écran et reste
     dans une conversation. Le code du jour non plus — il sert à pointer, et un
     lien qui pointe pour vous n'est plus une preuve de présence.

     L'adresse se construit sur l'origine COURANTE : jamais de domaine écrit en
     dur, changer de compte ne casse rien. */
  const lienAbsolu = (chemin: string) => new URL(asset(chemin), window.location.href).href;
  /* LE CODE MARCHAND SE LIT DANS LE CODE USSD — il n'a pas de champ à lui, et
     lui en inventer un ferait deux vérités à tenir d'accord. Dans
     « *880*41*909099*montant# », c'est le dernier groupe de chiffres : le
     préfixe de l'opérateur passe avant, le montant vient après. */
  const codeMarchand = (momoUssd.match(/\d{4,}/g) ?? []).slice(-1)[0] ?? '';
  const lienMomo = () => {
    const u = new URL(lienAbsolu('payer.html'));
    if (momoMarchand) u.searchParams.set('m', momoMarchand);
    u.searchParams.set('c', codeMarchand);
    return u.href;
  };
  const adresseComplete = [branch.address, branch.city, branch.country].filter(Boolean).join(', ');
  /* LE LIEN DE LA FICHE PRIME SUR L'ADRESSE ÉCRITE — 18 août 2026. Chercher
     « Cotonou, Bénin » posait le point au centre de la ville : une cliente qui
     suit ce carré arrive dans le bon quartier et cherche encore. Le lien court
     de la fiche Google, lui, désigne la porte. L'adresse reste le repli quand
     aucun lien n'est saisi — mieux vaut la ville que rien. */
  const lienPlan = branch.mapsUrl?.trim()
    || (adresseComplete ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adresseComplete)}` : '');
  const planPrecis = !!branch.mapsUrl?.trim();
  const lienCouronne = lienMaCouronne();
  /* LA CARTE DU COMPTOIR — construite sur l'origine COURANTE, jamais un
     domaine en dur : elle vit sous /trone/ en ligne, à la racine en
     développement. Changer de compte GitHub ne doit rien casser. */
  const lienCarte = new URL(`${window.location.pathname.includes('/trone') ? '/trone/' : '/'}carte.html`, window.location.origin).href;

  /* ── LE SITE PUBLIC — 23 septembre 2026 ────────────────────────
     La RACINE du domaine, pas /revelateur/ : elle y renvoie d'elle-même, et
     c'est la valeur la plus courte, donc le carré le plus lisible une fois
     imprimé. En développement le site vit à côté, sous son nom de fichier.
     Jamais de domaine en dur, l'origine se lit sur la fenêtre. */
  const lienSite = new URL(
    window.location.pathname.includes('/trone') ? '/' : '/revelateur.html',
    window.location.origin,
  ).href;
  /* LE MESSAGE EST SIGNÉ PAR LE CODE, comme tout ce qui sort de la Maison :
     la devise ne se recopie pas à la main, sinon elle finit par différer
     d'un message à l'autre. */
  const messageSite = signeLeMessage(
    `Voici la ${maisonNom()} : nos gestes, nos parcours, et la prise de rendez-vous. ${lienSite}`,
  );

  /* LE REPLI QUAND LE PRESSE-PAPIER REFUSE — refait le 23 septembre 2026.
     Il passait par `window.prompt`, la dernière fenêtre du navigateur de cet
     écran. La fenêtre de la Maison fait mieux que l'afficher : le texte y est
     déjà écrit ET SÉLECTIONNÉ, et le bouton RÉESSAIE la copie. Ce n'est pas
     une politesse : un navigateur refuse le presse-papier quand l'écriture ne
     suit aucun GESTE de l'utilisateur, et un clic en est un. La seconde
     tentative réussit donc là où la première a échoué. */
  const aLaMain = async (texte: string, quoi: string) => {
    const reponse = await demandeUnTexte({
      quoi: 'Le presse-papier a refusé',
      titre: `Copiez ${quoi} à la main.`,
      dit: 'Votre navigateur n’a pas laissé la Maison écrire dans le presse-papier. Le texte est prêt et sélectionné.',
      etiquette: 'À recopier',
      valeur: texte,
      accepter: 'Copier',
      refuser: 'Fermer',
      facultatif: true,
    });
    if (reponse === null) return;
    navigator.clipboard.writeText(texte)
      .then(() => toast('Copié.'))
      .catch(() => toast('Le presse-papier refuse toujours : sélectionnez le texte et copiez-le.'));
  };
  const copier = (lien: string, quoi: string) => {
    navigator.clipboard.writeText(lien)
      .then(() => toast(`Lien ${quoi} copié, collez-le dans WhatsApp.`))
      .catch(() => { void aLaMain(lien, `ce lien ${quoi}`); });
  };
  const copierTexte = (texte: string, quoi: string) => {
    navigator.clipboard.writeText(texte)
      .then(() => toast(`${quoi} copié, collez-le dans WhatsApp.`))
      .catch(() => { void aLaMain(texte, quoi.toLowerCase()); });
  };

  /* ── LE SITE DE L'ACADÉMIE — 17 septembre 2026 ──────────────────
     « On y va pour le moteur » (Yéman). Le carré le moins cher de tous : une
     cliente contente scanne au comptoir, et le monde entier apprend que la
     Maison forme. Sœur du Trône, donc adresse voisine — jamais un domaine en
     dur : sous /trone/ en ligne, à la racine en développement.

     LE MESSAGE EST PRÊT À COLLER, et sa devise est posée PAR LE CODE
     (`signeLeMessage`), comme tout ce qui sort de la Maison. */
  const lienAcademie = new URL(
    `${window.location.pathname.includes('/trone') ? '/academie/' : '/academie.html'}`,
    window.location.origin,
  ).href;
  const messageAcademie = signeLeMessage(
    `La ${maisonNom()} forme au métier du lock : neuf parcours, de la Fondation à L’Œuvre, `
    + `sur des têtes réelles à Cotonou. Le programme, les prix et l’inscription sont ici : ${lienAcademie}`,
  );

  const imprimerMomo = () => imprime(carteA5({
    verrou: verrouDeLaMaison(),
    titre: 'Régler par MoMo.',
    sous: 'Scannez avec l’application MoMo, ou composez le code, le montant en francs.',
    qr: momoQr,
    grand: momoMarchand,
    sousGrand: momoUssd,
    etapes: [
      'Ouvrez l’application MoMo, « Scanner »',
      'Vérifiez le nom du marchand',
      'Saisissez le montant en francs, validez',
    ],
    ariaQr: 'QR MoMoPay de la maison',
  }));

  /* LA CARTE A5 KKIAPAY — 23 octobre 2026. Le lien de paiement KkiaPay
     s'ouvre avec l'appareil photo de n'importe quel téléphone : pas besoin
     d'une application d'opérateur, contrairement au QR MoMoPay. */
  const imprimerChapchap = () => imprime(carteA5({
    verrou: verrouDeLaMaison(),
    titre: 'Régler par KkiaPay.',
    sous: `${RESEAUX_CHAPCHAP.join(', ')} : scannez, ou composez le code, le montant en francs.`,
    qr: LIEN_CHAPCHAP,
    grand: MARCHAND_CHAPCHAP,
    sousGrand: USSD_CHAPCHAP,
    etapes: [
      'Ouvrez l’appareil photo du téléphone, visez le carré',
      `Vérifiez le nom ${MARCHAND_CHAPCHAP} sur la page`,
      'Saisissez le montant en francs, validez',
    ],
    ariaQr: 'QR de paiement KkiaPay de la maison',
  }));

  /* ── CE QUI EST PRÊT, CE QUI DORT INCOMPLET ─────────────────────
     Un carré à moitié réglé ne se voit pas : il a l'air d'un carré. La barre le
     compte, pour qu'on ne découvre pas le manque le jour où on le tend. */
  const wifi1 = !!(autoRaw.wifiSsid?.trim() && autoRaw.wifiPass?.trim());
  const wifi2 = !!(autoRaw.wifi2Ssid?.trim() && autoRaw.wifi2Pass?.trim());
  /* La carte des prix est TOUJOURS prête : elle n'attend aucun réglage, son
     adresse se déduit de l'origine. Elle compte quand même dans le total,
     sinon la barre dirait six là où l'écran en montre sept. */
  const etats = [!!lienCarte, !!lienPlan, wifi1 || wifi2, !!momoQr, !!lienAvis, !!lienCouronne, !!codeJour];
  const prets = etats.filter(Boolean).length;

  /* ══ LES CODES, RANGÉS PAR CE QUE VEUT LA CLIENTE — 24 octobre 2026 ════
     « Je ne me retrouve pas facilement dans les QR. Comment faciliter
     l'utilisation, qu'elle soit smart et intelligente » (Yéman). La troisième
     fois que la page déroute (27 août, 4 octobre). Le présentoir de tuiles
     montrait dix carrés noirs côte à côte : un QR ne se reconnaît pas à l'œil,
     c'était là le mélange.

     Désormais, validé sur maquette :
       · EN CE MOMENT, en tête : le code dont le moment a besoin, lu dans
         l'agenda du jour (shared/codes-du-moment.ts) ;
       · une LISTE PAR INTENTION (Payer, Se connecter, Nous découvrir,
         Revenir, L'équipe) : un pictogramme, un nom, une phrase ; le QR ne
         paraît qu'à l'ouverture d'une ligne ou en plein écran ;
       · UNE seule ligne ouverte à la fois ;
       · dans chaque intention, les codes que CE POSTE montre le plus d'abord
         (`usageDesCodes`, gardé sur l'appareil, jamais synchronisé). */
  type GroupeDuCode = 'payer' | 'connecter' | 'decouvrir' | 'revenir' | 'equipe';
  type CodeDef = {
    id: IdDuCode; court: string; resume: string; groupe: GroupeDuCode; motsCles: string; pret: boolean;
    principal?: Geste; carte: Parameters<typeof CarteCode>[0];
  };
  const GROUPES: { k: GroupeDuCode; l: string }[] = [
    { k: 'payer', l: 'Payer' }, { k: 'connecter', l: 'Se connecter' }, { k: 'decouvrir', l: 'Nous découvrir' },
    { k: 'revenir', l: 'Revenir' }, { k: 'equipe', l: 'L’équipe' },
  ];
  const sansPlan = 'Renseignez l’adresse dans Système › Branches';
  const sansAvis = 'Renseignez le lien dans Paramètres › Automatisations';
  const afficheSite: Geste = { texte: 'Afficher', fort: true, faire: () => setGrand({ titre: `${maisonNom()}.`, phrase: 'Scannez, la Maison s’ouvre sur votre téléphone.', valeur: lienSite }) };
  const afficheCarte: Geste = { texte: 'Afficher', fort: true, faire: () => setGrand({ titre: 'Notre carte.', phrase: 'Scannez, tous nos prix s’ouvrent sur votre téléphone.', valeur: lienCarte }) };
  const affichePlan: Geste = { texte: 'Afficher', fort: true, faire: () => setGrand({ titre: 'Nous trouver.', phrase: adresseComplete, valeur: lienPlan }), empeche: lienPlan ? undefined : sansPlan };
  const afficheMomo: Geste = { texte: 'Afficher', fort: true, faire: () => setGrand({ titre: 'Régler par MoMo.', phrase: `Marchand ${momoMarchand}, le montant en francs.`, valeur: momoQr }) };
  const afficheChapchap: Geste = { texte: 'Afficher', fort: true, faire: () => setGrand({ titre: 'Régler par KkiaPay.', phrase: `${RESEAUX_CHAPCHAP.join(', ')}. La page s’ouvre au nom de ${MARCHAND_CHAPCHAP}.`, valeur: LIEN_CHAPCHAP }) };
  const afficheAvis: Geste = { texte: 'Afficher', fort: true, faire: () => setGrand({ titre: 'Un avis, un merci.', phrase: 'Scannez, deux phrases suffisent, la Maison vous lit.', valeur: lienAvis }), empeche: lienAvis ? undefined : sansAvis };
  const afficheCouronne: Geste = { texte: 'Afficher', fort: true, faire: () => setGrand({ titre: 'Ma Couronne.', phrase: 'Scannez, votre couronne vous reconnaît.', valeur: lienCouronne }) };
  const afficheAcademie: Geste = { texte: 'Afficher', fort: true, faire: () => setGrand({ titre: 'Académie MND.', phrase: 'Scannez, la Maison vous apprend le métier.', valeur: lienAcademie }) };
  const afficheJour: Geste | undefined = codeJour ? { texte: 'Afficher', fort: true, faire: () => setGrand({ titre: 'Le code du jour.', phrase: 'Le pointage de l’équipe, il change chaque nuit.', valeur: lienDuJour(codeJour) }) } : undefined;
  /* Le wifi n'a pas de bouton unique (deux box) : la 5G d'abord, sinon la 2G. */
  const wifiDuMoment = wifi1 ? wifiPayload(autoRaw.wifiSsid!.trim(), autoRaw.wifiPass!.trim())
    : wifi2 ? wifiPayload(autoRaw.wifi2Ssid!.trim(), autoRaw.wifi2Pass!.trim()) : '';
  const afficheWifi: Geste | undefined = wifiDuMoment
    ? { texte: 'Afficher', fort: true, faire: () => setGrand({ titre: 'Installez-vous.', phrase: 'Le réseau de la Maison est à vous.', valeur: wifiDuMoment }) }
    : undefined;
  const hote = lienSite.replace(/^https?:\/\//, '').replace(/\/$/, '');

  /* Un geste compté : c'est lui qui range les codes de CE poste. */
  const compte = (id: IdDuCode) => setUsage((u) => ({ ...u, [id]: (u[id] ?? 0) + 1 }));
  const avecCompte = (id: IdDuCode, g: Geste): Geste => ({ ...g, faire: () => { compte(id); g.faire(); } });

  const codes: CodeDef[] = [
    {
      /* LE PAIEMENT KKIAPAY « CHAP CHAP » — 23 octobre 2026. « Redessine le QR
         code dans les paiements Kkiapay pour MND avec le code USSD » (Yéman).
         Le lien et le code vivent dans shared/kkiapay-chapchap-pur.ts : ils ne
         se règlent pas ici, ils se relisent sur l'affiche de KkiaPay. */
      id: 'kkiapay', court: 'KkiaPay', groupe: 'payer', pret: true, principal: afficheChapchap,
      resume: `Tous réseaux : ${RESEAUX_CHAPCHAP.join(', ')} · au nom de ${MARCHAND_CHAPCHAP}`,
      motsCles: 'kkiapay chap chap mobile money mtn momo moov celtiis payer paiement argent régler ussd',
      carte: {
        signe: Wallet, nom: 'Payer par KkiaPay.', qui: 'La cliente scanne · elle règle',
        dit: <>Avec l’appareil photo de son téléphone, la page de paiement KkiaPay s’ouvre au nom de <b>{MARCHAND_CHAPCHAP}</b> : {RESEAUX_CHAPCHAP.join(', ')}. À l’encaissement, choisissez le moyen <b>KkiaPay</b> : l’argent va dans la caisse KkiaPay.</>,
        valeur: LIEN_CHAPCHAP,
        champ: { lab: 'Marchand', val: <b style={{ color: 'var(--copper-700)', fontWeight: 600 }}>{MARCHAND_CHAPCHAP}</b>, lab2: 'ou composez', val2: USSD_CHAPCHAP },
        gestes: [
          { ...afficheChapchap, texte: 'Afficher le QR seul' },
          { texte: 'L’affiche', faire: () => setGrand({ titre: 'Régler par KkiaPay.', phrase: `${RESEAUX_CHAPCHAP.join(', ')}, le montant en francs.`, valeur: LIEN_CHAPCHAP, affiche: 'kkiapay-affiche.png', afficheAlt: `Régler par KkiaPay, ${RESEAUX_CHAPCHAP.join(', ')}, marchand ${MARCHAND_CHAPCHAP}, ou composez ${USSD_CHAPCHAP}` }) },
          { texte: 'Carte A5', faire: imprimerChapchap },
          { texte: 'Copier le lien', faire: () => copier(LIEN_CHAPCHAP, 'de paiement KkiaPay') },
        ],
      },
    },
    {
      id: 'momo', court: 'MoMoPay', groupe: 'payer', pret: !!momoQr, principal: afficheMomo,
      resume: `MTN seulement, avec l’application MoMo · marchand ${momoMarchand}`,
      motsCles: 'momo momopay payer paiement argent mtn régler marchand',
      carte: {
        signe: Smartphone, nom: 'Payer par MoMoPay.', qui: 'La cliente scanne · elle règle',
        dit: <>Elle scanne avec son application MoMo et saisit le montant en francs. À l’encaissement, le moyen <b>MTN MoMo</b>. Le code et le marchand se règlent dans Paramètres › L’encaissement.</>,
        valeur: momoQr,
        champ: { lab: 'Marchand', val: <b style={{ color: 'var(--copper-700)', fontWeight: 600 }}>{momoMarchand}</b>, lab2: 'ou composez', val2: momoUssd },
        gestes: [
          { ...afficheMomo, texte: 'Afficher le QR seul' },
          { texte: 'L’affiche', faire: () => setGrand({ titre: 'Régler par MoMo.', phrase: `Marchand ${momoMarchand}, le montant en francs.`, valeur: momoQr, affiche: 'momopay-affiche.png' }) },
          { texte: 'Carte A5', faire: imprimerMomo },
          { texte: 'Copier le lien', faire: () => copier(lienMomo(), 'de paiement'), empeche: codeMarchand ? undefined : 'Renseignez le code MoMo dans Paramètres › L’encaissement' },
        ],
      },
    },
    {
      id: 'wifi', court: 'Le wifi', groupe: 'connecter', pret: wifi1 || wifi2, principal: afficheWifi,
      resume: 'Deux box : la 5G près du fauteuil, la 2G jusqu’au fond',
      motsCles: 'wifi internet réseau connexion mot de passe 5g 2g',
      carte: {
        signe: Wifi, nom: 'Le wifi de la Maison.', qui: 'La cliente scanne · elle est connectée',
        dit: <>Deux box, la 5G près du fauteuil et la 2G jusqu’au fond. Elle n’a rien à taper.</>,
        valeur: wifi1 || wifi2 ? 'ok' : '', gestes: [],
        enfants: (
          <>
            <BoxWifi rang="5G" portee="Le plus rapide, près du fauteuil" ssid={autoRaw.wifiSsid ?? ''} pass={autoRaw.wifiPass ?? ''}
              pose={(ssid, pass) => setAuto({ ...autoRaw, wifiSsid: ssid, wifiPass: pass })} surComptoir={(g) => { compte('wifi'); setGrand(g); }} />
            <BoxWifi rang="2G" portee="Porte plus loin, jusqu’au fond" ssid={autoRaw.wifi2Ssid ?? ''} pass={autoRaw.wifi2Pass ?? ''}
              pose={(ssid, pass) => setAuto({ ...autoRaw, wifi2Ssid: ssid, wifi2Pass: pass })} surComptoir={(g) => { compte('wifi'); setGrand(g); }} />
            {autoRaw.wifiPass?.trim() && autoRaw.wifiPass.trim() === autoRaw.wifi2Pass?.trim() && (
              <div className="trq-motdepasse"><span>Mot de passe des deux box</span><b>{autoRaw.wifiPass.trim()}</b></div>
            )}
          </>
        ),
      },
    },
    {
      id: 'site', court: 'Le site', groupe: 'decouvrir', pret: !!lienSite, principal: afficheSite,
      resume: `${hote} · nos gestes, nos parcours, le rendez-vous`,
      motsCles: 'site internet web maison vitrine rendez-vous',
      carte: {
        signe: Globe, nom: 'Le site de la Maison.', qui: 'Elle scanne · la Maison s’ouvre',
        dit: <>Ce que la Maison fait, pour qui ne la connaît pas encore : les gestes, les parcours, les avis et la prise de rendez-vous. C’est le carré de la vitrine et du dos de carte.</>,
        valeur: lienSite, champ: { lab: 'Mène à', val: <span style={{ wordBreak: 'break-all' }}>{lienSite}</span> },
        gestes: [
          { ...afficheSite, texte: 'Afficher au comptoir' },
          { texte: 'Imprimer l’affiche', faire: () => imprime(carteA5({
            verrou: verrouDeLaMaison(), titre: 'La Maison, en entier.',
            sous: 'Nos gestes, nos parcours, nos avis, et la prise de rendez-vous.',
            qr: lienSite, grand: hote, sousGrand: 'Ou tapez cette adresse.',
            etapes: ['Ouvrez l’appareil photo du téléphone', 'Visez le carré', 'La Maison s’ouvre, prenez rendez-vous'],
            ariaQr: 'QR du site de la Maison',
          })) },
          { texte: 'Ouvrir le site', faire: () => window.open(lienSite, '_blank', 'noopener') },
          { texte: 'Copier le lien', faire: () => copier(lienSite, 'du site') },
          { texte: 'Copier le message', faire: () => copier(messageSite, 'du site (message entier)') },
        ],
      },
    },
    {
      id: 'carte', court: 'La carte des prix', groupe: 'decouvrir', pret: !!lienCarte, principal: afficheCarte,
      resume: 'Rituels, formules et gamme, au franc près',
      motsCles: 'prix tarif carte rituels formules combien',
      carte: {
        signe: BookOpen, nom: 'La carte des prix.', qui: 'La cliente scanne · nos prix s’ouvrent',
        dit: <>Nos rituels, nos formules et la gamme, à jour au franc près. Le lien s’envoie aussi par WhatsApp à celle qui demande un prix.</>,
        valeur: lienCarte, champ: { lab: 'Mène à', val: <span style={{ wordBreak: 'break-all' }}>{lienCarte}</span> },
        gestes: [
          { ...afficheCarte, texte: 'Afficher au comptoir' },
          { texte: 'Ouvrir la carte', faire: () => window.open(lienCarte, '_blank', 'noopener') },
          { texte: 'Copier le lien', faire: () => copier(lienCarte, 'de la carte') },
          { texte: 'Copier le message', faire: () => copier(`Voici la carte de la ${maisonNom()}, avec tous nos rituels et nos formules : ${lienCarte}`, 'de la carte (message entier)') },
        ],
      },
    },
    {
      id: 'plan', court: 'Nous trouver', groupe: 'decouvrir', pret: !!lienPlan, principal: affichePlan,
      resume: planPrecis ? 'La porte de la Maison, sur Google Maps' : lienPlan ? 'Le centre de la ville seulement : collez le lien de la fiche Google' : 'Adresse à renseigner',
      motsCles: 'adresse itinéraire plan maps localisation carte google trouver',
      carte: {
        signe: MapPin, nom: 'Où nous trouver.', qui: 'La cliente scanne · sa carte s’ouvre',
        dit: lienPlan
          ? (planPrecis ? <>Le point tombe sur <b>la fiche de la Maison</b> : la porte, pas le quartier.</>
            : <>Ce carré ne mène qu’au centre de la ville. Collez le lien de votre fiche Google dans Système › Branches pour qu’il désigne la porte.</>)
          : <>Aucune adresse ni lien pour cette branche, Système › Branches. Sans eux, ce carré mènerait nulle part.</>,
        valeur: lienPlan, vide: 'adresse à écrire', champ: { lab: 'Le point', val: adresseComplete || 'à renseigner' },
        gestes: [
          { ...affichePlan, texte: 'Afficher au comptoir' },
          { texte: 'Copier le lien', faire: () => copier(lienPlan, 'de localisation'), empeche: lienPlan ? undefined : sansPlan },
        ],
      },
    },
    {
      id: 'couronne', court: 'Ma Couronne', groupe: 'revenir', pret: !!lienCouronne, principal: afficheCouronne,
      resume: 'Son application : rendez-vous, parcours, Cercle',
      motsCles: 'ma couronne application app appli compte installer télécharger',
      carte: {
        signe: Crown, nom: 'Ma Couronne.', qui: 'La cliente scanne · elle installe l’application',
        dit: <>Elle se crée un compte, puis « Ajouter à l’écran d’accueil » l’installe comme une application. Son parcours, ses rendez-vous et son Cercle la suivent.</>,
        valeur: lienCouronne, champ: { lab: 'Mène à', val: <span style={{ wordBreak: 'break-all' }}>{lienCouronne}</span> },
        gestes: [
          { ...afficheCouronne, texte: 'Afficher au comptoir' },
          { texte: 'Carte A5', faire: imprimeCarteCouronne },
          { texte: 'Copier le lien', faire: () => copier(lienCouronne, 'de Ma Couronne') },
        ],
      },
    },
    {
      id: 'avis', court: 'Un avis Google', groupe: 'revenir', pret: !!lienAvis, principal: afficheAvis,
      resume: lienAvis ? 'Le formulaire d’avis s’ouvre directement' : 'Lien à renseigner',
      motsCles: 'avis google étoiles note merci',
      carte: {
        signe: Star, nom: 'Laisser un avis.', qui: 'La cliente scanne · l’avis s’ouvre',
        dit: lienAvis
          ? <>Le formulaire Google s’ouvre directement, pas la carte. À la <b>première venue</b> soldée, la Maison propose déjà l’envoi WhatsApp d’elle-même.</>
          : <>Aucun lien d’avis, Paramètres › Automatisations. Il se prend sur votre fiche Google Business, « Demander des avis ».</>,
        valeur: lienAvis, vide: 'lien à écrire', champ: { lab: 'Mène à', val: 'Le formulaire d’avis Google' },
        gestes: [
          { ...afficheAvis, texte: 'Afficher au comptoir' },
          { texte: 'Copier le lien', faire: () => copier(lienAvis, 'd’avis Google'), empeche: lienAvis ? undefined : sansAvis },
          { texte: 'Copier le message', faire: () => copier(`Merci pour votre passage à la ${maisonNom()}. Si le cœur vous en dit, un avis nous aiderait beaucoup : ${lienAvis}`, 'd’avis à envoyer (message entier)'), empeche: lienAvis ? undefined : sansAvis },
        ],
      },
    },
    {
      id: 'academie', court: 'Académie MND', groupe: 'revenir', pret: !!lienAcademie, principal: afficheAcademie,
      resume: 'Neuf parcours, leurs prix et la réservation',
      motsCles: 'académie formation métier apprendre parcours certificat',
      carte: {
        signe: GraduationCap, nom: 'Académie MND.', qui: 'Elle scanne · elle voit les neuf parcours',
        dit: <>Le site public de l’Académie : les neuf parcours avec leurs prix, le programme de chacun, et la réservation. Une demande laissée là revient dans l’Académie, onglet « Demandes du site ».</>,
        valeur: lienAcademie, champ: { lab: 'Mène à', val: <span style={{ wordBreak: 'break-all' }}>{lienAcademie}</span> },
        gestes: [
          { ...afficheAcademie, texte: 'Afficher au comptoir' },
          { texte: 'Copier le lien', faire: () => copier(lienAcademie, 'du site de l’Académie') },
          { texte: 'Copier le message', faire: () => copierTexte(messageAcademie, 'Le message de l’Académie') },
        ],
      },
    },
    {
      id: 'jour', court: 'Le code du jour', groupe: 'equipe', pret: !!codeJour, principal: afficheJour ?? { texte: 'Ouvrir le Comptoir', fort: true, faire: () => navigate('/comptoir') },
      resume: codeJour ? `Celui d’aujourd’hui : ${codeJour}` : 'Pas encore né : il naît au Comptoir',
      motsCles: 'code du jour pointage équipe présence comptoir',
      carte: {
        signe: Clock, nom: 'Le code du jour.', qui: 'L’équipe scanne · elle pointe',
        dit: codeJour
          ? <>Il naît à l’ouverture du Comptoir et se renouvelle chaque nuit. Celui d’aujourd’hui : <b style={{ color: 'var(--copper-700)', fontWeight: 600, letterSpacing: '.14em' }}>{codeJour}</b>. La cliente ne le scanne jamais.</>
          : <>Il naît à l’ouverture du Comptoir et se renouvelle chaque nuit. <b>Celui d’aujourd’hui n’existe pas encore.</b></>,
        valeur: codeJour ? lienDuJour(codeJour) : '', vide: 'pas encore né', champ: { lab: 'Code d’aujourd’hui', val: codeJour || 'à créer au Comptoir' },
        gestes: [
          ...(afficheJour ? [{ ...afficheJour, texte: 'Afficher au comptoir' }] : []),
          { texte: 'Ouvrir le Comptoir', fort: !codeJour, faire: () => navigate('/comptoir') },
        ],
      },
    },
  ];

  const gesteDu = (id: IdDuCode, texte: string, fort = false): Geste | null => {
    const p = codes.find((c) => c.id === id)?.principal;
    return p ? { ...avecCompte(id, p), texte, fort } : null;
  };

  /* ── EN CE MOMENT ─────────────────────────────────────────────────────
     L'agenda du jour, lu à la minute. La règle est dans
     shared/codes-du-moment.ts ; l'écran ne fait que la nourrir et la dire. */
  const ficheDe = new Map(clientsDeLaBranche.map((c) => [c.id, c]));
  const rdvsDuMoment: RdvDuMoment[] = rdvsDeLaBranche.filter((a) => a.date === aujourdhui).map((a) => ({
    id: a.id,
    qui: a.clientName || ficheDe.get(a.clientId)?.name || 'Rendez-vous sans nom',
    ...(a.master ? { maitre: a.master } : {}),
    date: a.date, time: a.time, dureeMin: apptDurationMin(a, servicesParId), status: a.status,
    resteXof: apptDueXof(a, servicesParId),
    payeAujourdhui: apptCashOnDay(a, aujourdhui) > 0,
    premiereVenue: premiereVenueDe(rdvsDeLaBranche, a.clientId, aujourdhui),
    aCouronne: !!ficheDe.get(a.clientId)?.authUserId,
  }));
  const { ouverture } = bornesDuSalon(Object.fromEntries(reglagesMaison.hours.map((d) => [d.key, { open: d.open, close: d.close, closed: d.closed }])));
  const minutes = maintenant.getHours() * 60 + maintenant.getMinutes();
  const suggestions = codesDuMoment({
    aujourdhui, minutes, rdvs: rdvsDuMoment, ouvertureMin: ouverture * 60, codeDuJourNe: !!codeJour,
    prets: new Set(codes.filter((c) => c.pret).map((c) => c.id)), usage,
  });
  const heureDite = (hhmm: string) => {
    const m = minutesDe(hhmm);
    return Number.isFinite(m) ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : hhmm;
  };
  const avecQui = (qui: string, maitre?: string) => (maitre ? `${qui} avec ${maitre}` : qui);

  /* ── POUR UNE CLIENTE — 24 octobre 2026 ──────────────────────────────
     « Avoir les codes dont le client a besoin dans le bandeau. Si je veux
     envoyer un QR à un de mes clients, pouvoir choisir les clients depuis cet
     endroit » (Yéman). La règle est dans shared/codes-du-moment.ts
     (`besoinsDeLaCliente`) ; ici, ses mots et ses gestes.

     L'ENVOI OUVRE WHATSAPP SUR SON NUMÉRO, le message écrit, comme
     l'itinéraire plus bas. Les Conversations du Trône n'acceptent que les
     modèles approuvés par Meta tant qu'elle n'a pas écrit dans les 24 h :
     le message préparé y disparaissait (essai du 24 octobre 2026). */
  const pretsDesCodes = new Set(codes.filter((c) => c.pret).map((c) => c.id));
  const cliente = clienteId ? ficheDe.get(clienteId) : undefined;
  const besoins = cliente
    ? besoinsDeLaCliente({
      rdvs: rdvsDeLaBranche.filter((a) => a.clientId === cliente.id)
        .map((a) => ({ date: a.date, time: a.time, status: a.status, resteXof: apptDueXof(a, servicesParId) })),
      aCouronne: !!cliente.authUserId, aujourdhui, minutes, prets: pretsDesCodes,
    })
    : [];
  const autres = autresCodesDeLaCliente(besoins, pretsDesCodes);
  const codeDe = (id: IdDuCode) => codes.find((c) => c.id === id);
  /* La date d'une cliente se dit avec son année. */
  const jourDit = (iso: string) => jourEnLettres(iso).replace(/^./, (c) => c.toLowerCase());
  const pourquoi = (x: Besoin): string => {
    switch (x.raison) {
      case 'reste': return x.code === 'kkiapay'
        ? `Reste à régler : ${fmtMoney(x.resteXof, currency)}, tous réseaux`
        : `Reste à régler : ${fmtMoney(x.resteXof, currency)}, avec l’application MoMo`;
      case 'rendez-vous': return `Son rendez-vous du ${jourDit(x.date)} à ${heureDite(x.time)} : l’itinéraire`;
      case 'sans-couronne': return 'Pas encore de compte : l’application à installer';
      case 'venue-recente': return `Venue le ${jourDit(x.date)} : un avis Google`;
    }
  };
  const messagePour = (id: IdDuCode, x?: Besoin): string | null => {
    const bonjour = `Bonjour ${appelDe(cliente ?? {})}, `;
    const reste = x?.raison === 'reste' ? x.resteXof : 0;
    const montant = reste ? `${fmtMoney(reste, currency)} ` : '';
    switch (id) {
      case 'kkiapay': return `${bonjour}pour régler ${montant}par KkiaPay (${RESEAUX_CHAPCHAP.join(', ')}), ouvrez ce lien : la page s’ouvre au nom de ${MARCHAND_CHAPCHAP}, saisissez le montant en francs. ${LIEN_CHAPCHAP}`;
      case 'momo': {
        const l = lienPaiementMomo(reste || undefined);
        return l ? `${bonjour}pour régler ${montant}par MoMoPay, ouvrez cette page : le code à composer s’y affiche${reste ? ', montant compris' : ''}. ${l}` : null;
      }
      case 'site': return `${bonjour}voici la ${maisonNom()} : nos gestes, nos parcours, et la prise de rendez-vous. ${lienSite}`;
      case 'carte': return `${bonjour}voici la carte de la ${maisonNom()}, avec tous nos rituels et nos formules : ${lienCarte}`;
      case 'plan':
        if (!lienPlan) return null;
        return x?.raison === 'rendez-vous'
          ? `${bonjour}voici l’itinéraire de la ${maisonNom()} pour votre rendez-vous du ${jourDit(x.date)} à ${heureDite(x.time)} : ${lienPlan}`
          : `${bonjour}voici où trouver la ${maisonNom()} : ${lienPlan}`;
      case 'couronne': return `${bonjour}voici Ma Couronne, l’application de la ${maisonNom()} : vos rendez-vous, votre parcours et le Cercle. Créez votre compte, puis « Ajouter à l’écran d’accueil ». ${lienCouronne}`;
      case 'avis': return lienAvis ? `${bonjour}merci pour votre passage à la ${maisonNom()}. Si le cœur vous en dit, un avis nous aiderait beaucoup : ${lienAvis}` : null;
      case 'academie': return `${bonjour}la ${maisonNom()} forme au métier du lock : neuf parcours, de la Fondation à L’Œuvre, sur des têtes réelles à Cotonou. Le programme, les prix et l’inscription sont ici : ${lienAcademie}`;
      default: return null;
    }
  };
  /* Sans numéro sur sa fiche, le message se copie : rien ne se perd. */
  const envoie = (id: IdDuCode, x?: Besoin) => {
    const brut = cliente && CODES_ENVOYABLES.includes(id) ? messagePour(id, x) : null;
    if (!brut || !cliente) return;
    compte(id);
    const message = signeLeMessage(brut);
    const lien = lienWaMe(cliente.phone, message);
    if (!lien) { copierTexte(message, 'Pas de numéro sur sa fiche : le message'); return; }
    const w = window.open(lien, '_blank');
    if (w) { try { w.opener = null; } catch { /* l'onglet est ouvert */ } } else copierTexte(message, 'Le message');
  };

  /* L'ITINÉRAIRE, AVANT LE RENDEZ-VOUS — « il faut avant le RDV son
     itinéraire » (Yéman). WhatsApp s'ouvre sur SON numéro, le message écrit
     (l'application de la main, pas l'envoi de la Maison) ; sans numéro, le
     message se copie. Pas de date dans le message : « aujourd'hui » suffit. */
  const envoieItineraire = (rdvId: string) => {
    const a = rdvsDeLaBranche.find((x) => x.id === rdvId);
    if (!a || !lienPlan) return;
    compte('plan');
    const fiche = ficheDe.get(a.clientId);
    const message = signeLeMessage(`Bonjour ${appelDe(fiche ?? {}, a.clientName)}, voici l’itinéraire de la ${maisonNom()} pour votre rendez-vous d’aujourd’hui à ${heureDite(a.time)} : ${lienPlan}`);
    const lien = lienWaMe(fiche?.phone, message);
    if (!lien) { toast('Pas de numéro sur sa fiche : le message est à copier.'); copierTexte(message, 'Le message de l’itinéraire'); return; }
    const w = window.open(lien, '_blank');
    if (w) { try { w.opener = null; } catch { /* l'onglet est ouvert */ } } else copierTexte(message, 'Le message de l’itinéraire');
  };

  const ligneDuMoment = (s: Suggestion): { cle: string; texte: string; sous: string; gestes: Geste[] } => {
    const g = (...xs: (Geste | null)[]) => xs.filter((x): x is Geste => !!x);
    switch (s.sorte) {
      case 'payer': return {
        cle: `payer-${s.rdvId}`, texte: `${avecQui(s.qui, s.maitre)} : le rituel se termine.`,
        sous: `Reste à régler : ${fmtMoney(s.resteXof, currency)}`,
        gestes: g(gesteDu('kkiapay', 'Payer · KkiaPay', true), gesteDu('momo', 'MoMoPay')),
      };
      case 'avis': return {
        cle: `avis-${s.rdvId}`, texte: `${s.qui} : c’est sa première venue.`, sous: 'Après le paiement, un avis Google',
        gestes: g(gesteDu('avis', 'Un avis Google', true)),
      };
      case 'code-du-jour': return {
        cle: 'code-du-jour', texte: 'Le code du jour n’est pas encore né.', sous: 'L’équipe en a besoin pour pointer',
        gestes: [{ texte: 'Ouvrir le Comptoir', fort: true, faire: () => navigate('/comptoir') }],
      };
      case 'itineraire': return {
        cle: `itineraire-${s.rdvId}`, texte: `${heureDite(s.heure)} · rendez-vous de ${avecQui(s.qui, s.maitre)}.`,
        sous: s.premiereVenue ? 'Première venue : la Maison est encore à découvrir' : 'Son itinéraire, à envoyer avant de venir',
        gestes: g({ texte: 'Envoyer l’itinéraire', fort: true, faire: () => envoieItineraire(s.rdvId) }, gesteDu('plan', 'Afficher')),
      };
      case 'couronne': return {
        cle: `couronne-${s.rdvId}`, texte: `${s.qui} n’a pas encore Ma Couronne.`, sous: 'Un scan, et l’application s’installe : rendez-vous, parcours, Cercle',
        gestes: g(gesteDu('couronne', 'Ma Couronne', true)),
      };
      case 'wifi': return {
        cle: `wifi-${s.rdvId}`, texte: `Rituel en cours : ${avecQui(s.qui, s.maitre)}.`, sous: 'Le wifi, pour patienter',
        gestes: g(gesteDu('wifi', 'Le wifi', true)),
      };
      case 'habitude': {
        const c = codes.find((x) => x.id === s.code);
        return { cle: `habitude-${s.code}`, texte: c?.court ?? s.code, sous: c?.resume ?? '', gestes: g(gesteDu(s.code, 'Afficher', true)) };
      }
    }
  };

  const plat = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const q = plat(recherche.trim());
  const visibles = codes.filter((c) => {
    if (filtre === 'a-renseigner' && c.pret) return false;
    if (filtre !== 'tous' && filtre !== 'a-renseigner' && c.groupe !== filtre) return false;
    return !q || plat(`${c.court} ${c.resume} ${c.carte.nom} ${c.motsCles}`).includes(q);
  });
  const manquent = codes.filter((c) => !c.pret).length;

  return (
    <div className="mnd-rise">
      {/* « QR de la Maison » depuis le 27 octobre 2026 (barre à vingt-huit), dans Marketing & Fidélité. */}
      <PageHead eyebrow="Marketing & Fidélité · QR de la Maison" title="Les codes de la Maison." sub="Que veut la cliente ? Un geste, le bon code." />

      {/* LE BANDEAU : les codes des clientes et la cliente à qui on les
          envoie, puis ce que l'agenda du moment demande. */}
      <section className="trq-moment" aria-label="Pour une cliente, et en ce moment">
        <div className="trq-cliente">
          <p className="trq-moment__sur">Pour une cliente</p>
          <div className="trq-cliente__choix">
            <ClientPicker value={clienteId} onChange={setClienteId} placeholder="Choisir une cliente, pour lui envoyer un code" />
            {cliente && <button type="button" className="mnd-btn mnd-btn--sm mnd-btn--ghost" onClick={() => setClienteId('')}>Sans cliente</button>}
          </div>
        </div>
        {!cliente ? (
          <div className="trq-puces" role="group" aria-label="Les codes des clientes">
            {CODES_DES_CLIENTES.map(codeDe).filter((c): c is CodeDef => !!c && c.pret && !!c.principal).map((c) => (
              <button key={c.id} type="button" className="trq-puce" onClick={avecCompte(c.id, c.principal!).faire}>{c.court}</button>
            ))}
          </div>
        ) : (
          <>
            <div className="trq-moment__ligne trq-cliente__qui">
              <div className="trq-moment__texte">
                <b>{cliente.name}</b>
                <small>{cliente.phone ? `WhatsApp ${cliente.phone} · « Envoyer » ouvre WhatsApp, le message écrit, à relire` : 'Pas de numéro sur sa fiche : les messages se copient'}</small>
              </div>
            </div>
            {besoins.map((x) => {
              const c = codeDe(x.code);
              return (
                <div key={x.code} className="trq-moment__ligne">
                  <div className="trq-moment__texte"><b>{c?.court ?? x.code}</b><small>{pourquoi(x)}</small></div>
                  <div className="trq-moment__gestes">
                    <button type="button" className="mnd-btn mnd-btn--sm mnd-btn--copper" onClick={() => envoie(x.code, x)}>Envoyer</button>
                    {c?.principal && <button type="button" className="mnd-btn mnd-btn--sm mnd-btn--ghost" disabled={!!c.principal.empeche} onClick={avecCompte(c.id, c.principal).faire}>Afficher</button>}
                  </div>
                </div>
              );
            })}
            {besoins.length === 0 && <p className="trq-cliente__rien">Rien qui presse pour elle : ses codes sont ici.</p>}
            <div className="trq-puces" role="group" aria-label="Ses autres codes">
              {autres.map(codeDe).filter((c): c is CodeDef => !!c && !!c.principal).map((c) => (
                <span key={c.id} className="trq-puce trq-puce--double">
                  <span className="trq-puce__nom">{c.court}</span>
                  {CODES_ENVOYABLES.includes(c.id)
                    ? <button type="button" onClick={() => envoie(c.id)}>Envoyer</button>
                    : <span className="trq-puce__note" title="Le wifi ne s’envoie pas : il s’affiche au comptoir">au comptoir</span>}
                  <button type="button" onClick={avecCompte(c.id, c.principal!).faire}>Afficher</button>
                </span>
              ))}
            </div>
          </>
        )}
        {suggestions.length > 0 && (
          <>
          <p className="trq-moment__sur trq-moment__sur--suite">En ce moment · {heureDite(`${maintenant.getHours()}:${String(maintenant.getMinutes()).padStart(2, '0')}`)}</p>
          {suggestions.map(ligneDuMoment).map((l) => (
            <div key={l.cle} className="trq-moment__ligne">
              <div className="trq-moment__texte"><b>{l.texte}</b>{l.sous && <small>{l.sous}</small>}</div>
              <div className="trq-moment__gestes">
                {l.gestes.map((x) => (
                  <button key={x.texte} type="button" className={`mnd-btn mnd-btn--sm ${x.fort ? 'mnd-btn--copper' : 'mnd-btn--ghost'}`} disabled={!!x.empeche} title={x.empeche} onClick={x.faire}>{x.texte}</button>
                ))}
              </div>
            </div>
          ))}
          </>
        )}
      </section>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '18px 0' }}>
        <input
          className="mnd-input"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Elle veut… payer, le wifi, l’adresse, les prix"
          aria-label="Chercher un code"
          style={{ maxWidth: 460 }}
        />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="group" aria-label="Ce que veut la cliente">
          {[{ k: 'tous', l: `Tous · ${codes.length}` }, ...GROUPES.map((g) => ({ k: g.k, l: g.l })), ...(manquent ? [{ k: 'a-renseigner', l: `À renseigner · ${manquent}` }] : [])].map((f) => (
            <button
              key={f.k}
              type="button"
              className="trc-chip"
              aria-pressed={filtre === f.k}
              onClick={() => setFiltre(f.k)}
              style={filtre === f.k ? { background: 'var(--color-indigo)', color: 'var(--color-ivoire)', borderColor: 'var(--color-indigo)' } : (f.k === 'a-renseigner' ? { color: 'var(--copper-700)', borderColor: 'var(--copper-300)' } : undefined)}
            >
              {f.l}
            </button>
          ))}
        </div>
      </div>

      {visibles.length === 0 && <div className="trc-empty">Aucun code ne correspond. Essayez « payer », « wifi », « adresse »…</div>}

      {GROUPES.map((gr) => {
        const ici = ordreParUsage(visibles.filter((c) => c.groupe === gr.k).map((c) => c.id), usage)
          .map((id) => visibles.find((c) => c.id === id)!);
        if (ici.length === 0) return null;
        return (
          <section key={gr.k} className="trq-groupe" aria-label={gr.l}>
            <h2 className="trq-groupe__titre">{gr.l}</h2>
            {ici.map((c) => {
              const Signe = c.carte.signe;
              const ouverte = ouvertId === c.id;
              const p = c.principal;
              return (
                <div key={c.id} className={`trq-ligne${ouverte ? ' trq-ligne--ouverte' : ''}${c.pret ? '' : ' trq-ligne--muette'}`}>
                  <div className="trq-ligne__tete">
                    <span className="trq-ligne__signe"><Signe size={21} strokeWidth={1.6} aria-hidden="true" /></span>
                    <button type="button" className="trq-ligne__nom" onClick={() => setOuvertId(ouverte ? null : c.id)} aria-expanded={ouverte}>
                      <span className="trq-ligne__court">{c.court}</span>
                      <span className="trq-ligne__resume">{c.resume}</span>
                    </button>
                    {p
                      ? <button type="button" className="mnd-btn mnd-btn--sm mnd-btn--copper trq-ligne__afficher" disabled={!!p.empeche} title={p.empeche} onClick={avecCompte(c.id, p).faire}>{p.texte}</button>
                      : <span />}
                    <button type="button" className="trq-ligne__ouvre" onClick={() => setOuvertId(ouverte ? null : c.id)} aria-expanded={ouverte} aria-label={`${ouverte ? 'Refermer' : 'Tout voir'} : ${c.court}`}>
                      <ChevronDown size={20} strokeWidth={1.6} aria-hidden="true" />
                    </button>
                  </div>
                  {ouverte && (
                    <div className="trq-ligne__panneau">
                      <CarteCode {...c.carte} sansTete gestes={c.carte.gestes.map((x) => avecCompte(c.id, x))} />
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        );
      })}

      {grand && <AuComptoir g={grand} onClose={() => setGrand(null)} />}
    </div>
  );
}
