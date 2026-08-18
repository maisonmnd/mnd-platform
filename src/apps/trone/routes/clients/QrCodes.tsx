import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { asset } from '../../../../shared/asset';
import { useBranch } from '../../../../shared/branches';
import { toast } from '../../../../ds/components';
import { PageHead } from '../_ui';
import { useStore } from '../../../../shared/store';
import { maisonNom } from '../../../../shared/identite';
import { autoConfigStore, MOMO_QR_DEFAUT, REVIEW_LINK_DEFAUT, MOMO_USSD_DEFAUT, MOMO_MARCHAND_DEFAUT } from '../equipe/data';
import { usePointageConfig } from '../equipe/payroll';
import { QrSvg, qrMatrice, lienDuJour } from '../equipe/Comptoir';
import { InvitationCouronne } from './Vitrine';
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
const wifiPayload = (ssid: string, pass: string) =>
  `WIFI:T:WPA;S:${escWifi(ssid)};P:${escWifi(pass)};;`;

/* Le gabarit A5 partagé des cartes imprimées — comptoir, miroir, table. */
const carteA5 = (o: { titre: string; sous: string; qr: string; grand?: string; sousGrand?: string; etapes: string[]; ariaQr: string }) => {
  const { path, n } = qrMatrice(o.qr);
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8" />
<title>${maisonNom()} — ${o.titre}</title>
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
    <div class="marque">${maisonNom().toUpperCase()}</div>
    <div class="titre">${o.titre}</div>
    <div class="sous">${o.sous}</div>
    <svg class="qr" viewBox="-2 -2 ${n + 4} ${n + 4}" role="img" aria-label="${o.ariaQr}">
      <rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#F6F1E7" />
      <path d="${path}" fill="#1E2150" shape-rendering="crispEdges" />
    </svg>
    ${o.grand ? `<div class="grand">${o.grand}</div>` : ''}
    ${o.sousGrand ? `<div class="sousgrand">${o.sousGrand}</div>` : ''}
    <div class="etapes">${o.etapes.map((e, i) => `<b>${i + 1}</b> · ${e}`).join('<br />')}</div>
    <div class="devise">mi nyɔ́ ɖɛkpɛ — la maison veille.</div>
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

/* ── UNE CARTE WI-FI ────────────────────────────────────────────────────
   La maison a DEUX réseaux : la carte est un gabarit, chaque réseau a la
   sienne. Nom et mot de passe se posent ici et vivent dans la BASE de la
   maison (jamais dans le code : le dépôt est public). Tant qu'ils manquent,
   la carte attend au lieu de montrer un code muet. */
function CarteWifi({ titre, sous, ssid, pass, pose, surComptoir }: {
  titre: string;
  sous: string;
  ssid: string;
  pass: string;
  pose: (ssid: string, pass: string) => void;
  surComptoir: (g: Grand) => void;
}) {
  const pret = ssid.trim() !== '' && pass.trim() !== '';
  const valeur = pret ? wifiPayload(ssid.trim(), pass.trim()) : '';
  /* Face cliente — plein écran et carte imprimée — la phrase est LA MÊME
     pour les deux réseaux : elle accueille, elle ne parle pas de boxes. */
  const imprimer = () => imprime(carteA5({
    titre: 'Installez-vous.',
    sous: 'Le réseau de la Maison est à vous — scannez, votre téléphone se connecte seul.',
    qr: valeur,
    grand: ssid.trim(),
    etapes: [
      'Ouvrez l’appareil photo du téléphone',
      'Visez le carré',
      '« Se connecter » — vous êtes chez vous',
    ],
    ariaQr: 'QR du réseau Wi-Fi de la maison',
  }));
  return (
    <div className="tr-card" style={{ padding: '18px 22px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap' }}>
      {pret ? (
        <div style={{ width: 96, height: 96, flex: 'none', border: '1px solid var(--hairline)', borderRadius: 3, padding: 5, background: '#f6f1e8' }}>
          <QrSvg valeur={valeur} style={{ width: '100%', height: '100%', display: 'block' }} />
        </div>
      ) : (
        <div style={{ width: 96, height: 96, flex: 'none', border: '1px dashed var(--copper-300)', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--copper-700)', fontFamily: 'var(--font-serif)', fontSize: 13, textAlign: 'center', padding: 6 }}>
          à renseigner
        </div>
      )}
      <div style={{ flex: 1, minWidth: 240 }}>
        <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 21, color: 'var(--color-indigo)' }}>
          {titre}
        </div>
        <div className="mnd-muted" style={{ fontSize: 12.5, marginTop: 5, lineHeight: 1.6, maxWidth: '62ch' }}>
          {sous}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
          <label className="mnd-field" style={{ width: 200 }}>
            <span className="mnd-field__label">Nom du réseau</span>
            <input
              className="mnd-input"
              value={ssid}
              onChange={(e) => pose(e.target.value, pass)}
              placeholder="Le réseau du salon"
              autoComplete="off"
            />
          </label>
          <label className="mnd-field" style={{ width: 200 }}>
            <span className="mnd-field__label">Mot de passe</span>
            <input
              className="mnd-input"
              value={pass}
              onChange={(e) => pose(ssid, e.target.value)}
              placeholder="Celui de la box"
              autoComplete="off"
            />
          </label>
        </div>
      </div>
      {pret && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 'none' }}>
          <button
            type="button"
            className="mnd-btn mnd-btn--copper"
            onClick={() => surComptoir({ titre: 'Installez-vous.', phrase: 'Le réseau de la Maison est à vous.', valeur })}
          >
            Afficher au comptoir
          </button>
          <button type="button" className="mnd-btn mnd-btn--ghost" onClick={imprimer}>
            Imprimer la carte A5
          </button>
        </div>
      )}
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
      aria-label={`${g.titre} — plein écran`}
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
        mi nyɔ́ ɖɛkpɛ — la maison veille.
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

     Deux liens, et deux seulement. Le Wi-Fi n'en a pas : ses mots de passe
     s'affichent au comptoir le temps d'un scan, alors qu'un lien se transfère,
     se capture d'écran et reste dans une conversation. Le code du jour non
     plus — il sert à pointer, et un lien qui pointe pour vous n'est plus une
     preuve de présence.

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
  /* La localisation : l'adresse de la branche, telle que la Maison l'a écrite,
     confiée à une carte. Sans adresse, pas de lien — on ne devine pas où l'on
     est. */
  const adresseComplete = [branch.address, branch.city, branch.country].filter(Boolean).join(', ');
  /* LE LIEN DE LA FICHE PRIME SUR L'ADRESSE ÉCRITE — 18 août 2026. Chercher
     « Cotonou, Bénin » posait le point au centre de la ville : une cliente qui
     suit ce carré arrive dans le bon quartier et cherche encore. Le lien court
     de la fiche Google, lui, désigne la porte. L'adresse reste le repli quand
     aucun lien n'est saisi — mieux vaut la ville que rien. */
  const lienPlan = branch.mapsUrl?.trim()
    || (adresseComplete ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adresseComplete)}` : '');
  const planPrecis = !!branch.mapsUrl?.trim();
  const copier = (lien: string, quoi: string) => {
    navigator.clipboard.writeText(lien)
      .then(() => toast(`Lien ${quoi} copié — collez-le dans WhatsApp.`))
      .catch(() => window.prompt(`Copiez ce lien ${quoi} :`, lien));
  };

  const imprimerMomo = () => imprime(carteA5({
    titre: 'Régler par MoMo.',
    sous: 'Scannez avec l’application MoMo — ou composez le code, le montant en francs.',
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

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="Clients & Agenda · Les portes"
        title="QR Codes."
        sub="Tous les codes de la Maison, réunis — à montrer au comptoir, imprimer, afficher au miroir."
      />

      {/* ① L'invitation Ma Couronne — la même carte que la Vitrine. */}
      <InvitationCouronne surComptoir={setGrand} />

      {/* ② et ③ Les deux réseaux Wi-Fi — « Installez-vous. » */}
      <CarteWifi
        titre="Installez-vous."
        sous="Le réseau de la Maison est à vous — scanné, ce code connecte le téléphone de la cliente sans qu’elle tape le mot de passe. Le nom et le mot de passe restent dans la base de la maison, nulle part ailleurs."
        ssid={autoRaw.wifiSsid ?? ''}
        pass={autoRaw.wifiPass ?? ''}
        pose={(ssid, pass) => setAuto({ ...autoRaw, wifiSsid: ssid, wifiPass: pass })}
        surComptoir={setGrand}
      />
      <CarteWifi
        titre="Le second réseau."
        sous="La maison a deux réseaux — même geste pour l’autre box. Face cliente, la carte et le plein écran disent la même chose : « Installez-vous. »"
        ssid={autoRaw.wifi2Ssid ?? ''}
        pass={autoRaw.wifi2Pass ?? ''}
        pose={(ssid, pass) => setAuto({ ...autoRaw, wifi2Ssid: ssid, wifi2Pass: pass })}
        surComptoir={setGrand}
      />

      {/* ④ L'encaissement MoMoPay. */}
      <div className="tr-card" style={{ padding: '18px 22px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap' }}>
        <div style={{ width: 96, height: 96, flex: 'none', border: '1px solid var(--hairline)', borderRadius: 3, padding: 5, background: '#f6f1e8' }}>
          <QrSvg valeur={momoQr} style={{ width: '100%', height: '100%', display: 'block' }} />
        </div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 21, color: 'var(--color-indigo)' }}>
            Encaisser par MoMoPay.
          </div>
          <div className="mnd-muted" style={{ fontSize: 12.5, marginTop: 5, lineHeight: 1.6, maxWidth: '62ch' }}>
            La cliente scanne avec son application MoMo — marchand <b style={{ color: 'var(--copper-700)', fontWeight: 600 }}>{momoMarchand}</b>,
            ou compose {momoUssd}. Le code et le marchand se règlent dans Paramètres › L’encaissement.
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 'none' }}>
          <button
            type="button"
            className="mnd-btn mnd-btn--copper"
            onClick={() => setGrand({
              titre: 'Régler par MoMo.',
              phrase: `Marchand ${momoMarchand} — le montant en francs.`,
              valeur: momoQr,
              affiche: 'momopay-affiche.jpg',
            })}
          >
            Afficher au comptoir
          </button>
          <button type="button" className="mnd-btn mnd-btn--ghost" onClick={imprimerMomo}>
            Imprimer la carte A5
          </button>
          {/* LE LIEN QU'ON ENVOIE. Il mène à une page STATIQUE qui ne sait que
              ce que son adresse lui dit — ni base, ni clé, ni session. Rien à
              en extraire, donc rien à protéger. */}
          <button
            type="button"
            className="mnd-btn mnd-btn--ghost"
            disabled={!codeMarchand}
            title={codeMarchand ? undefined : 'Renseignez le code MoMo dans Paramètres › L’encaissement'}
            onClick={() => copier(lienMomo(), 'de paiement')}
          >
            Copier le lien à envoyer
          </button>
        </div>
      </div>

      {/* ④bis OÙ NOUS TROUVER — 18 août 2026, « juste pour MoMoPay et la
          localisation du salon ». Le carré se scanne au comptoir ; le lien
          s'envoie à celle qui cherche la porte. Sans adresse renseignée, la
          carte le dit au lieu de mener nulle part. */}
      <div className="tr-card" style={{ padding: '18px 22px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap' }}>
        <div style={{ width: 96, height: 96, flex: 'none', border: `1px ${lienPlan ? 'solid var(--hairline)' : 'dashed var(--copper-300)'}`, borderRadius: 3, padding: 5, background: '#f6f1e8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {lienPlan
            ? <QrSvg valeur={lienPlan} style={{ width: '100%', height: '100%', display: 'block' }} />
            : <span style={{ fontFamily: 'var(--font-serif)', fontSize: 12, color: 'var(--copper-700)', textAlign: 'center' }}>adresse à écrire</span>}
        </div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 21, color: 'var(--color-indigo)' }}>
            Où nous trouver.
          </div>
          <div className="mnd-muted" style={{ fontSize: 12.5, marginTop: 5, lineHeight: 1.6, maxWidth: '62ch' }}>
            {lienPlan
              ? (planPrecis
                ? <>La cliente scanne, sa carte s'ouvre sur <b style={{ color: 'var(--copper-700)', fontWeight: 600 }}>la fiche du salon</b> — la porte, pas le quartier. Le lien s'envoie aussi par message.</>
                : <>Ce carré ne mène qu'à <b style={{ color: 'var(--copper-700)', fontWeight: 600 }}>{adresseComplete}</b> — le centre de la ville. Collez le lien de votre fiche Google dans Système › Branches pour qu'il désigne la porte.</>)
              : <>Aucune adresse ni lien pour cette branche — Système › Branches. Sans eux, ce carré mènerait nulle part.</>}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 'none' }}>
          <button
            type="button"
            className="mnd-btn mnd-btn--copper"
            disabled={!lienPlan}
            onClick={() => setGrand({ titre: 'Nous trouver.', phrase: adresseComplete, valeur: lienPlan })}
          >
            Afficher au comptoir
          </button>
          <button
            type="button"
            className="mnd-btn mnd-btn--ghost"
            disabled={!lienPlan}
            onClick={() => copier(lienPlan, 'de localisation')}
          >
            Copier le lien à envoyer
          </button>
        </div>
      </div>

      {/* ④ter LAISSEZ-NOUS UN AVIS — 18 août 2026, « je veux que mes nouvelles
          clientes de passage laissent un avis Google ». Le carré s'imprime pour
          le comptoir, le lien s'envoie par message — et la Maison le propose
          d'elle-même par WhatsApp à la première venue soldée. */}
      <div className="tr-card" style={{ padding: '18px 22px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap' }}>
        <div style={{ width: 96, height: 96, flex: 'none', border: `1px ${lienAvis ? 'solid var(--hairline)' : 'dashed var(--copper-300)'}`, borderRadius: 3, padding: 5, background: '#f6f1e8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {lienAvis
            ? <QrSvg valeur={lienAvis} style={{ width: '100%', height: '100%', display: 'block' }} />
            : <span style={{ fontFamily: 'var(--font-serif)', fontSize: 12, color: 'var(--copper-700)', textAlign: 'center' }}>lien à écrire</span>}
        </div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 21, color: 'var(--color-indigo)' }}>
            Laissez-nous un avis.
          </div>
          <div className="mnd-muted" style={{ fontSize: 12.5, marginTop: 5, lineHeight: 1.6, maxWidth: '62ch' }}>
            {lienAvis
              ? <>La cliente scanne et le formulaire d’avis Google s’ouvre — pas la carte, <b style={{ color: 'var(--copper-700)', fontWeight: 600 }}>l’avis</b>. À l’encaissement d’une <b style={{ color: 'var(--copper-700)', fontWeight: 600 }}>première venue</b>, la Maison propose aussi l’envoi WhatsApp d’elle-même.</>
              : <>Aucun lien d’avis — Paramètres › Automatisations. Il se prend sur votre fiche Google Business, « Demander des avis ».</>}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 'none' }}>
          <button
            type="button"
            className="mnd-btn mnd-btn--copper"
            disabled={!lienAvis}
            onClick={() => setGrand({ titre: 'Un avis, un merci.', phrase: 'Scannez — deux phrases suffisent, la Maison vous lit.', valeur: lienAvis })}
          >
            Afficher au comptoir
          </button>
          <button
            type="button"
            className="mnd-btn mnd-btn--ghost"
            disabled={!lienAvis}
            onClick={() => copier(lienAvis, 'd’avis Google')}
          >
            Copier le lien à envoyer
          </button>
        </div>
      </div>

      {/* ⑤ Le code du jour — pointage de l'équipe (il naît au Comptoir). */}
      <div className="tr-card" style={{ padding: '18px 22px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap' }}>
        {codeJour ? (
          <div style={{ width: 96, height: 96, flex: 'none', border: '1px solid var(--hairline)', borderRadius: 3, padding: 5, background: '#f6f1e8' }}>
            <QrSvg valeur={lienDuJour(codeJour)} style={{ width: '100%', height: '100%', display: 'block' }} />
          </div>
        ) : (
          <div style={{ width: 96, height: 96, flex: 'none', border: '1px dashed var(--copper-300)', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--copper-700)', fontFamily: 'var(--font-serif)', fontSize: 13, textAlign: 'center', padding: 6 }}>
            pas encore né
          </div>
        )}
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 21, color: 'var(--color-indigo)' }}>
            Le code du jour · pointage.
          </div>
          <div className="mnd-muted" style={{ fontSize: 12.5, marginTop: 5, lineHeight: 1.6, maxWidth: '62ch' }}>
            {codeJour
              ? <>Le carré que l’équipe scanne pour pointer — aujourd’hui : <b style={{ color: 'var(--copper-700)', fontWeight: 600, letterSpacing: '.14em' }}>{codeJour}</b>. Il se renouvelle chaque nuit.</>
              : 'Le carré que l’équipe scanne pour pointer. Il naît à l’ouverture du Comptoir — ouvrez-le pour créer celui d’aujourd’hui.'}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 'none' }}>
          {codeJour && (
            <button
              type="button"
              className="mnd-btn mnd-btn--copper"
              onClick={() => setGrand({ titre: 'Le code du jour.', phrase: 'Le pointage de l’équipe — il change chaque nuit.', valeur: lienDuJour(codeJour) })}
            >
              Afficher au comptoir
            </button>
          )}
          <button type="button" className={`mnd-btn ${codeJour ? 'mnd-btn--ghost' : 'mnd-btn--copper'}`} onClick={() => navigate('/comptoir')}>
            Ouvrir le Comptoir
          </button>
        </div>
      </div>

      {grand && <AuComptoir g={grand} onClose={() => setGrand(null)} />}
    </div>
  );
}
