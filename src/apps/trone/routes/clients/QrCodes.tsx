import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Clock, Crown, Globe, MapPin, Smartphone, Star, Wifi, type LucideIcon } from 'lucide-react';
import { asset } from '../../../../shared/asset';
import { useBranch } from '../../../../shared/branches';
import { toast, demandeUnTexte, Modal } from '../../../../ds/components';
import { PageHead } from '../_ui';
import { useStore } from '../../../../shared/store';
import { maisonNom, DEVISE_COMPLETE, signeLeMessage, estLaMaisonMND } from '../../../../shared/identite';
import { autoConfigStore, MOMO_QR_DEFAUT, REVIEW_LINK_DEFAUT, MOMO_USSD_DEFAUT, MOMO_MARCHAND_DEFAUT } from '../equipe/data';
import { usePointageConfig } from '../equipe/payroll';
import { QrSvg, qrMatrice, lienDuJour } from '../equipe/Comptoir';
import { imprimeCarteCouronne, lienMaCouronne } from './Vitrine';
import { todayISO } from './_shared';
import './clients.css';

/* QR CODES — TOUS LES CODES DE LA MAISON, RÉUNIS (13 août, demande de Yéman).
   Ils vivaient éparpillés : l'invitation Ma Couronne à la Vitrine, le QR
   MoMoPay au fond des Paramètres, le code du jour au Comptoir. Une page les
   rassemble — à montrer, imprimer, afficher — et dit où chacun se règle.
   Chaque carte sait aussi s'AFFICHER AU COMPTOIR : le code en grand, plein
   écran, tourné vers la cliente — elle scanne, on referme. */

/* Ce qu'un code montre quand il occupe tout l'écran. */
type Grand = {
  titre: string;
  phrase: string;
  valeur: string;
  /** L'AFFICHE DE LA MAISON, à la place du carré nu — 18 août 2026. Yéman a
      fait faire une affiche MoMoPay à ses couleurs : la montrer entière vaut
      mieux qu'un QR posé sur du blanc, parce qu'elle dit déjà le marchand, le
      code USSD et le geste. Absente ailleurs : les réseaux Wi-Fi n'en ont pas. */
  affiche?: string;
};

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
    <div class="devise">${DEVISE_COMPLETE}</div>
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

function CarteCode({ signe, nom, qui, dit, valeur, vide, champ, gestes, large, enfants }: {
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
}) {
  const Signe = signe;
  const pret = !!valeur;
  return (
    <div className={`trq-carte${large ? ' trq-carte--large' : ''}${pret ? '' : ' trq-carte--muette'}`}>
      <div className="trq-carte__tete">
        <span className={`trq-badge${pret ? '' : ' trq-badge--vide'}`}>
          <Signe size={20} strokeWidth={1.5} aria-hidden="true" />
        </span>
        <div style={{ minWidth: 0 }}>
          <p className="trq-carte__nom">{nom}</p>
          <p className="trq-carte__qui">{qui}</p>
        </div>
      </div>

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
/* ── LE PLEIN ÉCRAN DU COMPTOIR ─────────────────────────────────────────
   Parchemin, marque, le code aussi grand que l'écran le permet. On le tourne
   vers la cliente ; un toucher n'importe où — ou Échap — le referme. */
function AuComptoir({ g, onClose }: { g: Grand; onClose: () => void }) {
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [onClose]);
  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-label={`${g.titre}, plein écran`}
      style={{
        /* Au-dessus de tout — tiroirs (z-modal+1) et toasts (z-modal+5). */
        position: 'fixed', inset: 0, zIndex: 120,
        background: '#F6F1E7', cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '24px 20px', animation: 'mnd-fade var(--dur-base) var(--ease-soft)',
      }}
    >
      {estLaMaisonMND(maisonNom()) ? (
        /* Le verrou, jamais sous son plancher : 150 px au plus petit. */
        <img
          src={asset('assets/verrous/verrou-couche-indigo.png')}
          alt={maisonNom()}
          style={{ width: 'clamp(150px, 18vw, 260px)', height: 'auto', display: 'block' }}
        />
      ) : (
        <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '.34em', color: '#1E2150' }}>
          {maisonNom().toUpperCase()}
        </div>
      )}
      <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 'clamp(30px, 5vw, 46px)', color: '#1E2150', margin: '12px 0 2px', textAlign: 'center' }}>
        {g.titre}
      </div>
      <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 'clamp(15px, 2.2vw, 20px)', color: '#45454F', textAlign: 'center', maxWidth: '46ch', lineHeight: 1.5 }}>
        {g.phrase}
      </div>
      {g.affiche ? (
        /* L'AFFICHE, SON CADRE MARCHAND CORRIGÉ — 18 août 2026.
           « Là où il y a mon Nom Marchand il faut mettre le QR code de Mobile
           Money de la maison avec le nom ACIA1 » (Yéman).

           Le JPEG porte « YEMAN » gravé dans ses pixels ; je ne peux pas le
           repeindre. On RECOUVRE donc son cadre noir par un panneau qui dit
           juste — le carré à scanner et le vrai nom du marchand. Le cadre du
           dessous ne se voit plus, mais il est toujours là : la correction
           durable est une affiche ré-exportée par qui l'a dessinée.

           Les proportions sont en POURCENTAGES de l'image, pas en pixels :
           l'affiche se redimensionne avec l'écran, le panneau la suit. */
        <div style={{ position: 'relative', margin: '22px 0 14px', lineHeight: 0 }}>
          <img
            src={asset(g.affiche)}
            alt=""
            style={{ height: 'min(66vh, 96vw)', width: 'auto', borderRadius: 4, boxShadow: '0 2px 18px rgba(30,33,80,.13)', display: 'block' }}
          />
          <div
            style={{
              position: 'absolute', left: '6.2%', top: '62.6%', width: '36.4%', height: '19.6%',
              background: '#0B0D24', border: '1px solid rgba(242,183,5,.55)', borderRadius: '3.2%',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5%', padding: '2.4%',
            }}
          >
            <div style={{ height: '86%', aspectRatio: '1 / 1', background: '#fff', padding: '3%', borderRadius: 2, flex: 'none' }}>
              <QrSvg valeur={g.valeur} style={{ width: '100%', height: '100%', display: 'block' }} />
            </div>
            <div style={{ lineHeight: 1.25, minWidth: 0 }}>
              <div style={{ color: '#F2B705', fontSize: 'clamp(8px, 1.15vh, 15px)', letterSpacing: '.06em' }}>Nom Marchand</div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 'clamp(11px, 1.7vh, 24px)', letterSpacing: '.02em' }}>ACIA1</div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ width: 'min(64vw, 56vh)', height: 'min(64vw, 56vh)', margin: '26px 0 14px' }}>
          <QrSvg valeur={g.valeur} style={{ width: '100%', height: '100%', display: 'block' }} />
        </div>
      )}
      <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 14, color: '#9E6238' }}>
        {DEVISE_COMPLETE}
      </div>
      <div style={{ position: 'absolute', bottom: 16, fontSize: 11.5, color: '#8a8a93', letterSpacing: '.08em' }}>
        toucher l’écran pour fermer · Échap
      </div>
    </div>
  );
}
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

  const { branch } = useBranch();
  const [grand, setGrand] = useState<Grand | null>(null);
  const [recherche, setRecherche] = useState('');
  const [filtre, setFiltre] = useState<string>('tous');
  const [ouvertId, setOuvertId] = useState<string | null>(null);

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
     « *880*41*506846*montant# », c'est le dernier groupe de chiffres : le
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

  /* ══ LE PRÉSENTOIR — 4 octobre 2026 ═══════════════════════════════════
     « La page QR code a besoin de plus de facilité pour retrouver les codes.
     Toujours trop de codes et pas facile. Restructure la page. Meilleur UI,
     et meilleur UX » (Yéman).

     NEUF GRANDES CARTES EMPILÉES se lisaient avant de se trouver. Désormais :
     une recherche et des filtres par moment en tête, puis un présentoir de
     tuiles (le carré, son nom court, son état, UN bouton « Afficher ») ; la
     fiche complète de chaque code (ce qu'il fait, où il mène, imprimer,
     copier, le message, le réglage du wifi) s'ouvre d'un clic. Ce que fait
     chaque code ne change pas : ce sont les mêmes gestes, rangés. */
  type MomentDuCode = 'avant' | 'pendant' | 'depart' | 'longtemps' | 'equipe';
  type CodeDef = {
    id: string; court: string; moment: MomentDuCode; motsCles: string; pret: boolean;
    principal?: Geste; carte: Parameters<typeof CarteCode>[0];
  };
  const MOMENTS: { k: MomentDuCode; l: string }[] = [
    { k: 'avant', l: 'Avant la visite' }, { k: 'pendant', l: 'Pendant' }, { k: 'depart', l: 'Au départ' },
    { k: 'longtemps', l: 'Pour longtemps' }, { k: 'equipe', l: 'L’équipe' },
  ];
  const sansPlan = 'Renseignez l’adresse dans Système › Branches';
  const sansAvis = 'Renseignez le lien dans Paramètres › Automatisations';
  const afficheSite: Geste = { texte: 'Afficher', fort: true, faire: () => setGrand({ titre: `${maisonNom()}.`, phrase: 'Scannez, la Maison s’ouvre sur votre téléphone.', valeur: lienSite }) };
  const afficheCarte: Geste = { texte: 'Afficher', fort: true, faire: () => setGrand({ titre: 'Notre carte.', phrase: 'Scannez, tous nos prix s’ouvrent sur votre téléphone.', valeur: lienCarte }) };
  const affichePlan: Geste = { texte: 'Afficher', fort: true, faire: () => setGrand({ titre: 'Nous trouver.', phrase: adresseComplete, valeur: lienPlan }), empeche: lienPlan ? undefined : sansPlan };
  const afficheMomo: Geste = { texte: 'Afficher', fort: true, faire: () => setGrand({ titre: 'Régler par MoMo.', phrase: `Marchand ${momoMarchand}, le montant en francs.`, valeur: momoQr }) };
  const afficheAvis: Geste = { texte: 'Afficher', fort: true, faire: () => setGrand({ titre: 'Un avis, un merci.', phrase: 'Scannez, deux phrases suffisent, la Maison vous lit.', valeur: lienAvis }), empeche: lienAvis ? undefined : sansAvis };
  const afficheCouronne: Geste = { texte: 'Afficher', fort: true, faire: () => setGrand({ titre: 'Ma Couronne.', phrase: 'Scannez, votre couronne vous reconnaît.', valeur: lienCouronne }) };
  const afficheAcademie: Geste = { texte: 'Afficher', fort: true, faire: () => setGrand({ titre: 'Académie MND.', phrase: 'Scannez, la Maison vous apprend le métier.', valeur: lienAcademie }) };
  const afficheJour: Geste | undefined = codeJour ? { texte: 'Afficher', fort: true, faire: () => setGrand({ titre: 'Le code du jour.', phrase: 'Le pointage de l’équipe, il change chaque nuit.', valeur: lienDuJour(codeJour) }) } : undefined;

  const codes: CodeDef[] = [
    {
      id: 'site', court: 'Le site', moment: 'avant', motsCles: 'site internet web maison vitrine rendez-vous', pret: !!lienSite, principal: afficheSite,
      carte: {
        signe: Globe, nom: 'Le site de la Maison.', qui: 'Elle scanne · la Maison s’ouvre',
        dit: <>Ce que la Maison fait, pour qui ne la connaît pas encore : les gestes, les parcours, les avis et la prise de rendez-vous. C’est le carré de la vitrine et du dos de carte.</>,
        valeur: lienSite, champ: { lab: 'Mène à', val: <span style={{ wordBreak: 'break-all' }}>{lienSite}</span> },
        gestes: [
          { ...afficheSite, texte: 'Afficher au comptoir' },
          { texte: 'Imprimer l’affiche', faire: () => imprime(carteA5({
            verrou: verrouDeLaMaison(), titre: 'La Maison, en entier.',
            sous: 'Nos gestes, nos parcours, nos avis, et la prise de rendez-vous.',
            qr: lienSite, grand: lienSite.replace(/^https?:\/\//, '').replace(/\/$/, ''), sousGrand: 'Ou tapez cette adresse.',
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
      id: 'carte', court: 'La carte des prix', moment: 'avant', motsCles: 'prix tarif carte rituels formules combien', pret: !!lienCarte, principal: afficheCarte,
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
      id: 'plan', court: 'Nous trouver', moment: 'avant', motsCles: 'adresse itinéraire plan maps localisation carte google', pret: !!lienPlan, principal: affichePlan,
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
      id: 'wifi', court: 'Le wifi', moment: 'pendant', motsCles: 'wifi internet réseau connexion mot de passe 5g 2g', pret: wifi1 || wifi2,
      carte: {
        signe: Wifi, nom: 'Le wifi de la Maison.', qui: 'La cliente scanne · elle est connectée',
        dit: <>Deux box, la 5G près du fauteuil et la 2G jusqu’au fond. Elle n’a rien à taper.</>,
        valeur: wifi1 || wifi2 ? 'ok' : '', gestes: [],
        enfants: (
          <>
            <BoxWifi rang="5G" portee="Le plus rapide, près du fauteuil" ssid={autoRaw.wifiSsid ?? ''} pass={autoRaw.wifiPass ?? ''}
              pose={(ssid, pass) => setAuto({ ...autoRaw, wifiSsid: ssid, wifiPass: pass })} surComptoir={setGrand} />
            <BoxWifi rang="2G" portee="Porte plus loin, jusqu’au fond" ssid={autoRaw.wifi2Ssid ?? ''} pass={autoRaw.wifi2Pass ?? ''}
              pose={(ssid, pass) => setAuto({ ...autoRaw, wifi2Ssid: ssid, wifi2Pass: pass })} surComptoir={setGrand} />
            {autoRaw.wifiPass?.trim() && autoRaw.wifiPass.trim() === autoRaw.wifi2Pass?.trim() && (
              <div className="trq-motdepasse"><span>Mot de passe des deux box</span><b>{autoRaw.wifiPass.trim()}</b></div>
            )}
          </>
        ),
      },
    },
    {
      id: 'momo', court: 'MoMoPay', moment: 'depart', motsCles: 'momo momopay payer paiement argent mtn régler marchand', pret: !!momoQr, principal: afficheMomo,
      carte: {
        signe: Smartphone, nom: 'Payer par MoMoPay.', qui: 'La cliente scanne · elle règle',
        dit: <>Elle scanne avec son application MoMo et saisit le montant en francs. Le code et le marchand se règlent dans Paramètres › L’encaissement.</>,
        valeur: momoQr,
        champ: { lab: 'Marchand', val: <b style={{ color: 'var(--copper-700)', fontWeight: 600 }}>{momoMarchand}</b>, lab2: 'ou composez', val2: momoUssd },
        gestes: [
          { ...afficheMomo, texte: 'Afficher le QR seul' },
          { texte: 'L’affiche', faire: () => setGrand({ titre: 'Régler par MoMo.', phrase: `Marchand ${momoMarchand}, le montant en francs.`, valeur: momoQr, affiche: 'momopay-affiche.jpg' }) },
          { texte: 'Carte A5', faire: imprimerMomo },
          { texte: 'Copier le lien', faire: () => copier(lienMomo(), 'de paiement'), empeche: codeMarchand ? undefined : 'Renseignez le code MoMo dans Paramètres › L’encaissement' },
        ],
      },
    },
    {
      id: 'avis', court: 'Un avis Google', moment: 'depart', motsCles: 'avis google étoiles note merci', pret: !!lienAvis, principal: afficheAvis,
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
      id: 'couronne', court: 'Ma Couronne', moment: 'longtemps', motsCles: 'ma couronne application app compte installer', pret: !!lienCouronne, principal: afficheCouronne,
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
      id: 'academie', court: 'Académie MND', moment: 'longtemps', motsCles: 'académie formation métier apprendre parcours certificat', pret: !!lienAcademie, principal: afficheAcademie,
      carte: {
        signe: BookOpen, nom: 'Académie MND.', qui: 'Elle scanne · elle voit les neuf parcours',
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
      id: 'jour', court: 'Le code du jour', moment: 'equipe', motsCles: 'code du jour pointage équipe présence comptoir', pret: !!codeJour, principal: afficheJour ?? { texte: 'Ouvrir le Comptoir', fort: true, faire: () => navigate('/comptoir') },
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

  const plat = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const q = plat(recherche.trim());
  const visibles = codes.filter((c) => {
    if (filtre === 'a-renseigner' && c.pret) return false;
    if (filtre !== 'tous' && filtre !== 'a-renseigner' && c.moment !== filtre) return false;
    return !q || plat(`${c.court} ${c.carte.nom} ${c.motsCles}`).includes(q);
  });
  const manquent = codes.filter((c) => !c.pret).length;
  const ouvert = codes.find((c) => c.id === ouvertId);

  return (
    <div className="mnd-rise">
      <PageHead eyebrow="Clients & Agenda · Les portes" title="Les codes de la Maison." sub="Trouver un code, le montrer d’un geste." />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
        <input
          className="mnd-input"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Chercher un code : momo, wifi, avis, prix, adresse…"
          aria-label="Chercher un code"
          style={{ maxWidth: 420 }}
        />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="group" aria-label="Moment de la visite">
          {[{ k: 'tous', l: `Tous · ${codes.length}` }, ...MOMENTS.map((m) => ({ k: m.k, l: m.l })), ...(manquent ? [{ k: 'a-renseigner', l: `À renseigner · ${manquent}` }] : [])].map((f) => (
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

      {visibles.length === 0 && <div className="trc-empty">Aucun code ne correspond. Essayez « momo », « wifi », « avis »…</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
        {visibles.map((c) => {
          const Signe = c.carte.signe;
          const p = c.principal;
          return (
            <div key={c.id} style={{ background: 'var(--surface-card)', border: `1px solid ${c.pret ? 'var(--hairline)' : 'var(--copper-300)'}`, borderStyle: c.pret ? 'solid' : 'dashed', borderRadius: 6, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <Signe size={18} strokeWidth={1.6} aria-hidden="true" style={{ color: 'var(--copper-700)', flex: 'none' }} />
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 19, color: 'var(--color-indigo)', lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.court}</span>
              </div>
              <button type="button" onClick={() => setOuvertId(c.id)} aria-label={`Ouvrir la fiche : ${c.court}`}
                style={{ border: 0, padding: 0, background: 'transparent', cursor: 'pointer', aspectRatio: '1 / 1', width: '100%', borderRadius: 4, overflow: 'hidden' }}>
                {c.pret && c.carte.valeur && c.carte.valeur !== 'ok'
                  ? <QrSvg valeur={c.carte.valeur} style={{ width: '100%', height: '100%', display: 'block' }} />
                  : (
                    <span style={{ display: 'grid', placeItems: 'center', width: '100%', height: '100%', background: c.pret ? 'var(--copper-50, #f9efe7)' : 'transparent', border: c.pret ? 0 : '1px dashed var(--copper-300)', color: 'var(--copper-700)', fontSize: 12.5, borderRadius: 4, textAlign: 'center', padding: 8 }}>
                      {c.pret ? <><Signe size={42} strokeWidth={1.2} aria-hidden="true" /><span style={{ display: 'block', marginTop: 6 }}>Ouvrir pour choisir le réseau</span></> : (c.carte.vide ?? 'à renseigner')}
                    </span>
                  )}
              </button>
              <span className="mnd-muted" style={{ fontSize: 11.5, lineHeight: 1.4, minHeight: 32 }}>{c.carte.qui}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {p
                  ? <button type="button" className="mnd-btn mnd-btn--sm mnd-btn--copper" style={{ flex: 1 }} disabled={!!p.empeche} title={p.empeche} onClick={p.faire}>{p.texte}</button>
                  : <button type="button" className="mnd-btn mnd-btn--sm mnd-btn--copper" style={{ flex: 1 }} onClick={() => setOuvertId(c.id)}>Ouvrir</button>}
                <button type="button" className="mnd-btn mnd-btn--sm mnd-btn--ghost" onClick={() => setOuvertId(c.id)}>Tout voir</button>
              </div>
            </div>
          );
        })}
      </div>

      {ouvert && (
        <Modal title={ouvert.carte.nom} onClose={() => setOuvertId(null)} width={640}>
          <CarteCode {...ouvert.carte} />
        </Modal>
      )}

      {grand && <AuComptoir g={grand} onClose={() => setGrand(null)} />}
    </div>
  );
}