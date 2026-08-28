import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Clock, Crown, MapPin, Smartphone, Star, Wifi, type LucideIcon } from 'lucide-react';
import { asset } from '../../../../shared/asset';
import { useBranch } from '../../../../shared/branches';
import { toast } from '../../../../ds/components';
import { PageHead } from '../_ui';
import { useStore } from '../../../../shared/store';
import { maisonNom, DEVISE_COMPLETE } from '../../../../shared/identite';
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
   qu'un autre poste peut écrire via l'API. L'impression est aujourd'hui inerte
   (`window.open('', ..., 'noopener')` rend `null`), mais si elle est réparée un
   jour sans garde, un balisage glissé dans ces champs s'exécuterait en même
   origine. On échappe donc à la source, comme le fait déjà public/payer.html. */
const escHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const wifiPayload = (ssid: string, pass: string) =>
  `WIFI:T:WPA;S:${escWifi(ssid)};P:${escWifi(pass)};;`;

/* Le gabarit A5 partagé des cartes imprimées — comptoir, miroir, table. */
const carteA5 = (o: { titre: string; sous: string; qr: string; grand?: string; sousGrand?: string; etapes: string[]; ariaQr: string }) => {
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
    <div class="marque">${escHtml(maisonNom().toUpperCase())}</div>
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

const imprime = (html: string) => {
  const fen = window.open('', '_blank', 'noopener,width=520,height=760');
  if (!fen) return;
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
      <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '.34em', color: '#1E2150' }}>
        {maisonNom().toUpperCase()}
      </div>
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

  const copier = (lien: string, quoi: string) => {
    navigator.clipboard.writeText(lien)
      .then(() => toast(`Lien ${quoi} copié, collez-le dans WhatsApp.`))
      .catch(() => window.prompt(`Copiez ce lien ${quoi} :`, lien));
  };

  const imprimerMomo = () => imprime(carteA5({
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

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="Clients & Agenda · Les portes"
        title="Les codes de la Maison."
        sub="Rangés par moment de la visite, chacun avec son signe. À montrer au comptoir, imprimer, afficher au miroir."
      />

      <div className="trq-etat">
        <span className="trq-etat__item"><b>{etats.length}</b> codes</span>
        <span className="trq-etat__item"><b>{prets}</b> prêts à montrer</span>
        {prets < etats.length && (
          <span className="trq-etat__item trq-etat__item--manque">
            <b>{etats.length - prets}</b> à renseigner
          </span>
        )}
      </div>

      {/* ══ ELLE ARRIVE ══ */}
      <Moment
        titre="Elle arrive."
        quand="avant de s’asseoir"
        sous="Ce qu’on tend à celle qui cherche la porte, puis à celle qui vient de s’installer."
      >
        <div className="trq-grille">
          {/* ── LA CARTE DES PRIX — 28 août 2026 ─────────────────────
              L'écran du comptoir a une adresse ; elle mérite son carré. Ce
              n'est plus seulement une tablette posée face à la cliente : le
              lien s'envoie à celle qui écrit « bonjour, c'est combien pour
              des locks ? », et elle lit la carte entière sur son téléphone
              plutôt que de recevoir trois prix recopiés à la main.

              LES PRIX Y SONT TOUJOURS CEUX DU JOUR. Un tarif recopié dans un
              message vieillit dès la prochaine hausse et revient au comptoir
              comme une promesse ; ce lien, lui, dit la vérité du moment. */}
          <CarteCode
            signe={BookOpen}
            nom="La carte des prix."
            qui="La cliente scanne · nos prix s’ouvrent"
            dit={<>Nos rituels, nos formules et la gamme, à jour au franc près. Le lien s’envoie aussi par WhatsApp à celle qui demande un prix.</>}
            valeur={lienCarte}
            champ={{ lab: 'Mène à', val: <span style={{ wordBreak: 'break-all' }}>{lienCarte}</span> }}
            gestes={[
              { texte: 'Afficher au comptoir', fort: true, faire: () => setGrand({ titre: 'Notre carte.', phrase: 'Scannez, tous nos prix s’ouvrent sur votre téléphone.', valeur: lienCarte }) },
              { texte: 'Ouvrir la carte', faire: () => window.open(lienCarte, '_blank', 'noopener') },
              { texte: 'Copier le lien', faire: () => copier(lienCarte, 'de la carte') },
              /* LE MESSAGE ENTIER, pas seulement le lien : celle qui demande
                 un prix par écrit mérite une phrase, pas une adresse nue. */
              { texte: 'Copier le message', faire: () => copier(
                `Voici la carte de la ${maisonNom()}, avec tous nos rituels et nos formules : ${lienCarte}`,
                'de la carte (message entier)',
              ) },
            ]}
          />
          <CarteCode
            signe={MapPin}
            nom="Où nous trouver."
            qui="La cliente scanne · sa carte s’ouvre"
            dit={lienPlan
              ? (planPrecis
                ? <>Le point tombe sur <b>la fiche du salon</b>, la porte, pas le quartier.</>
                : <>Ce carré ne mène qu’au centre de la ville. Collez le lien de votre fiche Google dans Système › Branches pour qu’il désigne la porte.</>)
              : <>Aucune adresse ni lien pour cette branche, Système › Branches. Sans eux, ce carré mènerait nulle part.</>}
            valeur={lienPlan}
            vide="adresse à écrire"
            champ={{ lab: 'Le point', val: adresseComplete || 'à renseigner' }}
            gestes={[
              { texte: 'Afficher au comptoir', fort: true, faire: () => setGrand({ titre: 'Nous trouver.', phrase: adresseComplete, valeur: lienPlan }), empeche: lienPlan ? undefined : 'Renseignez l’adresse dans Système › Branches' },
              { texte: 'Copier le lien', faire: () => copier(lienPlan, 'de localisation'), empeche: lienPlan ? undefined : 'Renseignez l’adresse dans Système › Branches' },
            ]}
          />

          <CarteCode
            signe={Wifi}
            nom="Le wifi de la Maison."
            qui="La cliente scanne · elle est connectée"
            /* La phrase ne promet le mot de passe commun que s'il l'est
               vraiment : la ligne du bas ne s'affiche qu'alors. */
            dit={<>Deux box, la 5G près du fauteuil et la 2G jusqu’au fond. Elle n’a rien à taper.</>}
            valeur={wifi1 || wifi2 ? 'ok' : ''}
            gestes={[]}
            enfants={
              <>
                <BoxWifi
                  rang="5G"
                  portee="Le plus rapide, près du fauteuil"
                  ssid={autoRaw.wifiSsid ?? ''}
                  pass={autoRaw.wifiPass ?? ''}
                  pose={(ssid, pass) => setAuto({ ...autoRaw, wifiSsid: ssid, wifiPass: pass })}
                  surComptoir={setGrand}
                />
                <BoxWifi
                  rang="2G"
                  portee="Porte plus loin, jusqu’au fond"
                  ssid={autoRaw.wifi2Ssid ?? ''}
                  pass={autoRaw.wifi2Pass ?? ''}
                  pose={(ssid, pass) => setAuto({ ...autoRaw, wifi2Ssid: ssid, wifi2Pass: pass })}
                  surComptoir={setGrand}
                />
                {autoRaw.wifiPass?.trim() && autoRaw.wifiPass.trim() === autoRaw.wifi2Pass?.trim() && (
                  <div className="trq-motdepasse">
                    <span>Mot de passe des deux box</span>
                    <b>{autoRaw.wifiPass.trim()}</b>
                  </div>
                )}
              </>
            }
          />
        </div>
      </Moment>

      {/* ══ ELLE REPART ══ */}
      <Moment
        titre="Elle repart."
        quand="au comptoir, le rituel fini"
        sous="Les deux carrés du départ : celui qui encaisse, et celui qui fait parler d’elle."
      >
        <div className="trq-grille">
          <CarteCode
            signe={Smartphone}
            nom="Payer par MoMoPay."
            qui="La cliente scanne · elle règle"
            dit={<>Elle scanne avec son application MoMo et saisit le montant en francs. Le code et le marchand se règlent dans Paramètres › L’encaissement.</>}
            valeur={momoQr}
            champ={{
              lab: 'Marchand', val: <b style={{ color: 'var(--copper-700)', fontWeight: 600 }}>{momoMarchand}</b>,
              lab2: 'ou composez', val2: momoUssd,
            }}
            gestes={[
              /* LE QR SEUL D'ABORD (25 août) : l'affiche est belle, mais elle
                 entoure le code de tout un décor. De près, avec un téléphone
                 qui cherche à scanner, c'est le carré nu qu'on tend. */
              { texte: 'Afficher le QR seul', fort: true, faire: () => setGrand({ titre: 'Régler par MoMo.', phrase: `Marchand ${momoMarchand}, le montant en francs.`, valeur: momoQr }) },
              { texte: 'L’affiche', faire: () => setGrand({ titre: 'Régler par MoMo.', phrase: `Marchand ${momoMarchand}, le montant en francs.`, valeur: momoQr, affiche: 'momopay-affiche.jpg' }) },
              { texte: 'Carte A5', faire: imprimerMomo },
              /* LE LIEN QU'ON ENVOIE mène à une page STATIQUE qui ne sait que
                 ce que son adresse lui dit — ni base, ni clé, ni session. */
              { texte: 'Copier le lien', faire: () => copier(lienMomo(), 'de paiement'), empeche: codeMarchand ? undefined : 'Renseignez le code MoMo dans Paramètres › L’encaissement' },
            ]}
          />

          <CarteCode
            signe={Star}
            nom="Laisser un avis."
            qui="La cliente scanne · l’avis s’ouvre"
            dit={lienAvis
              ? <>Le formulaire Google s’ouvre directement, pas la carte. À la <b>première venue</b> soldée, la Maison propose déjà l’envoi WhatsApp d’elle-même.</>
              : <>Aucun lien d’avis, Paramètres › Automatisations. Il se prend sur votre fiche Google Business, « Demander des avis ».</>}
            valeur={lienAvis}
            vide="lien à écrire"
            champ={{ lab: 'Mène à', val: 'Le formulaire d’avis Google' }}
            gestes={[
              { texte: 'Afficher au comptoir', fort: true, faire: () => setGrand({ titre: 'Un avis, un merci.', phrase: 'Scannez, deux phrases suffisent, la Maison vous lit.', valeur: lienAvis }), empeche: lienAvis ? undefined : 'Renseignez le lien dans Paramètres › Automatisations' },
              { texte: 'Copier le lien', faire: () => copier(lienAvis, 'd’avis Google'), empeche: lienAvis ? undefined : 'Renseignez le lien dans Paramètres › Automatisations' },
              /* LE MESSAGE ENTIER, PAS SEULEMENT LE LIEN — 19 août 2026 : « où
                 récupérer le message si la cliente n'a pas WhatsApp sur le
                 numéro de son profil ? ». Nulle part : il ne naissait qu'à
                 l'instant où WhatsApp s'ouvrait. Le voici à copier, pour un
                 SMS, un mail, n'importe quel canal. */
              { texte: 'Copier le message', faire: () => copier(`Merci pour votre passage à la ${maisonNom()}. Si le cœur vous en dit, un avis nous aiderait beaucoup : ${lienAvis}`, 'd’avis à envoyer (message entier)'), empeche: lienAvis ? undefined : 'Renseignez le lien dans Paramètres › Automatisations' },
            ]}
          />
        </div>
      </Moment>

      {/* ══ ELLE RESTE AVEC NOUS ══ */}
      <Moment
        titre="Elle reste avec nous."
        quand="une fois, et pour longtemps"
        sous="Le seul carré qu’on ne tend qu’une fois : après, elle a la Maison dans sa poche."
      >
        <div className="trq-grille trq-grille--1">
          <CarteCode
            signe={Crown}
            nom="Ma Couronne."
            qui="La cliente scanne · elle installe l’application"
            dit={<>Elle se crée un compte, puis « Ajouter à l’écran d’accueil » l’installe comme une application. Son parcours, ses rendez-vous et son Cercle la suivent.</>}
            valeur={lienCouronne}
            champ={{ lab: 'Mène à', val: <span style={{ wordBreak: 'break-all' }}>{lienCouronne}</span> }}
            gestes={[
              { texte: 'Afficher au comptoir', fort: true, faire: () => setGrand({ titre: 'Ma Couronne.', phrase: 'Scannez, votre couronne vous reconnaît.', valeur: lienCouronne }) },
              { texte: 'Carte A5', faire: imprimeCarteCouronne },
              { texte: 'Copier le lien', faire: () => copier(lienCouronne, 'de Ma Couronne') },
            ]}
          />
        </div>
      </Moment>

      {/* ══ L'ÉQUIPE ══
          À PART, ET POUR UNE RAISON : c'est le seul carré de la page que la
          cliente ne doit jamais scanner. Le ranger avec les siens, c'était
          inviter la confusion au comptoir. */}
      <Moment
        titre="L’équipe."
        quand="chaque matin"
        sous="Le seul carré que la cliente ne doit jamais scanner. Il est à part pour cette raison."
      >
        <div className="trq-grille trq-grille--1">
          <CarteCode
            signe={Clock}
            nom="Le code du jour."
            qui="L’équipe scanne · elle pointe"
            dit={codeJour
              ? <>Il naît à l’ouverture du Comptoir et se renouvelle chaque nuit. Celui d’aujourd’hui : <b style={{ color: 'var(--copper-700)', fontWeight: 600, letterSpacing: '.14em' }}>{codeJour}</b>.</>
              : <>Il naît à l’ouverture du Comptoir et se renouvelle chaque nuit. <b>Celui d’aujourd’hui n’existe pas encore.</b></>}
            valeur={codeJour ? lienDuJour(codeJour) : ''}
            vide="pas encore né"
            champ={{ lab: 'Code d’aujourd’hui', val: codeJour || 'à créer au Comptoir' }}
            gestes={[
              ...(codeJour ? [{ texte: 'Afficher au comptoir', fort: true, faire: () => setGrand({ titre: 'Le code du jour.', phrase: 'Le pointage de l’équipe, il change chaque nuit.', valeur: lienDuJour(codeJour) }) }] : []),
              { texte: 'Ouvrir le Comptoir', fort: !codeJour, faire: () => navigate('/comptoir') },
            ]}
          />
        </div>
      </Moment>

      {grand && <AuComptoir g={grand} onClose={() => setGrand(null)} />}
    </div>
  );
}