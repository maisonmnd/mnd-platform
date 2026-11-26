import { useCallback, useEffect, useRef, useState } from 'react';
import { asset } from '../../shared/asset';
import { QrSvg } from '../../ds/qr';
import { PLAFOND_PAR_JOUR_XOF, codeDuTpePropre, estUnCodeDuTpe, tpeAVerrouiller, type LigneDuJourAuTpe, type TotalDuSoir } from '../../shared/tpe-de-poche-pur';
import {
  activeLeTelephone, declareLesEspeces, dernierToucher, empreinteDuSecret, gardeLeTpe, lisLeJourDuTpe, lisLeTpeGarde, nomDuTelephone,
  noteLeToucher, oublieLeToucher, ouvreLeRdvAuTpe, secretJuste, type TpeGarde,
} from '../../shared/tpe-de-poche-telephone';

/* ══ LE TPE DE POCHE — le téléphone de l'employée (25 novembre 2026) ═════
   « Create a terminal of payment for the Trône, a TPE, and I can give the
   access to certain employees to activate it on their phone and collect
   payment from customers » (Yéman). Maquette RsVNQvgB85ZvDVjaKuMrqP, lot 1.

   Rien que l'encaissement : les rendez-vous du jour de sa branche, avec le
   prénom, la prestation en clair et ce qui reste sur la pièce. « Encaisser
   sur ce téléphone » ouvre la page « Régler » du rendez-vous en mode TPE ;
   « Elle paie sur son téléphone » montre le QR de son lien. L'argent ne
   s'écrit qu'à la confirmation de MTN ou de KkiaPay, sur les comptes de la
   Maison. Le code secret (quatre chiffres) se redemande après deux minutes
   sans toucher ; cinq erreurs retirent le TPE de ce téléphone. */

/* ══ TRÔNE TERMINAL — l'application (26 novembre 2026) ═══════════════════
   « Besoin d'une app sur le téléphone, Trône TPE de poche par exemple… ou
   Trône Terminal » (Yéman). La page s'installe sur l'écran d'accueil
   (manifest.tpe.webmanifest, tpe-sw.js) : une icône, le plein écran, pas de
   magasin d'applications, et chaque publication la met à jour toute seule.
   Sur Android, Chrome propose « Installer » (on garde son invitation pour un
   bouton à nous) ; sur iPhone, c'est Safari › Partager › « Sur l'écran
   d'accueil ». L'APP D'UN IPHONE NE VOIT PAS LE STOCKAGE DE SAFARI : sur
   iPhone, on installe D'ABORD, puis on active dans l'app en tapant le code
   (le QR ouvert dans Safari ne consomme pas le code d'emblée). */
type InvitationAInstaller = Event & { prompt: () => Promise<void>; userChoice?: Promise<{ outcome: string }> };
const estAutonome = (): boolean => {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
};
const estUnIphone = (): boolean => /iPhone|iPad|iPod/i.test(navigator.userAgent);
/* OUVERTE PAR SON ICÔNE, OU DANS UNE AUTRE APP (26 novembre 2026, « je n'ai
   toujours pas la possibilité d'installer l'app », Yéman). Sur Android, quand
   l'app Le Trône est installée, elle capte tous les liens /trone/ : le QR du
   TPE s'ouvre alors DANS Le Trône, en plein écran, où aucun navigateur ne
   propose d'installer. Le manifeste lance Trône Terminal avec `?app=terminal`
   (gardé pour l'onglet) : plein écran SANS cette marque, c'est une autre app,
   et la page propose de s'ouvrir dans Chrome pour installer la sienne. */
const CLE_DE_L_APP = 'mnd-tpe-dans-l-app';
const lanceeParLeTerminal = (): boolean => {
  const dit = new URLSearchParams(window.location.search).get('app') === 'terminal';
  try {
    if (dit) sessionStorage.setItem(CLE_DE_L_APP, '1');
    return dit || sessionStorage.getItem(CLE_DE_L_APP) === '1';
  } catch {
    return dit;
  }
};
/* LE BOUTON « OUVRIR DANS CHROME » NE FAISAIT RIEN (26 novembre 2026, essai
   de Yéman) : une app qui vit dans Chrome ne se relance pas Chrome. Trône
   Terminal a donc quitté /trone/ pour le portail (CHEMIN_DU_TERMINAL), hors de
   la portée de Le Trône ; si une autre app la capte encore, la page donne son
   adresse à ouvrir dans le navigateur. */
const dansUneAutreApp = (): boolean => estAutonome() && !lanceeParLeTerminal();
const adresseSansMarque = (): string => {
  const u = new URL(window.location.href);
  u.searchParams.delete('app');
  u.searchParams.delete('a');
  return u.toString();
};
/** Le service de l'app, à portée étroite (`…/tpe`) : jamais celui du Trône. */
function enregistreLeServiceDeLApp(): void {
  try {
    if (!('serviceWorker' in navigator)) return;
    const base = import.meta.env.BASE_URL;
    void navigator.serviceWorker.register(`${base}tpe-sw.js`, { scope: `${base}tpe`, updateViaCache: 'none' }).catch(() => { /* rien : l'app reste une page */ });
  } catch { /* rien */ }
}

/** « Copier l'adresse » : le presse-papiers si le téléphone l'accepte, sinon
    l'adresse se sélectionne pour un appui long. */
function CopierLAdresse() {
  const [fait, setFait] = useState<'' | 'copiee' | 'a-la-main'>('');
  const copie = async () => {
    try {
      await navigator.clipboard.writeText(adresseSansMarque());
      setFait('copiee');
    } catch {
      try {
        const p = document.querySelector('.tp-adresse');
        const r = document.createRange();
        if (p) { r.selectNodeContents(p); const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(r); }
      } catch { /* rien */ }
      setFait('a-la-main');
    }
  };
  return (
    <>
      <button type="button" className="tp-btn tp-btn--plein" onClick={() => { void copie(); }}>Copier l’adresse</button>
      {fait === 'copiee' && <p className="tp-doux tp-petit">Adresse copiée. Ouvrez Chrome et collez-la.</p>}
      {fait === 'a-la-main' && <p className="tp-doux tp-petit">L’adresse est sélectionnée : appuyez longuement dessus, puis Copier.</p>}
    </>
  );
}

function Installer({ invitation, onInstalle }: { invitation: InvitationAInstaller | null; onInstalle: () => void }) {
  if (dansUneAutreApp()) {
    return (
      <div className="tp-installer">
        <p className="tp-doux tp-petit"><b>Vous êtes dans une autre application</b> de la Maison : elle ne peut pas installer Trône Terminal.</p>
        <ol className="tp-etapes">
          <li>Copiez l’adresse.</li>
          <li>Ouvrez <b>{estUnIphone() ? 'Safari' : 'Chrome'}</b> vous-même et collez-la dans la barre d’adresse : une adresse tapée ne repart jamais dans une autre app.</li>
          <li>{estUnIphone() ? 'Partager › « Sur l’écran d’accueil ».' : 'Touchez « Installer l’app Trône Terminal ».'}</li>
        </ol>
        <p className="tp-adresse">{adresseSansMarque()}</p>
        <CopierLAdresse />
      </div>
    );
  }
  if (estAutonome()) return null;
  if (invitation) {
    return (
      <div className="tp-installer">
        <button type="button" className="tp-btn tp-btn--plein" onClick={() => { void invitation.prompt().then(onInstalle).catch(onInstalle); }}>
          Installer l’app Trône Terminal
        </button>
        <p className="tp-doux tp-petit">Une icône sur l’écran d’accueil : le TPE s’ouvre en plein écran, comme une application.</p>
      </div>
    );
  }
  return (
    <div className="tp-installer">
      <p className="tp-doux tp-petit">
        <b>Installer l’app Trône Terminal :</b>{' '}
        {estUnIphone()
          ? 'dans Safari, touchez Partager (le carré et sa flèche), puis « Sur l’écran d’accueil ».'
          : 'dans Chrome, ouvrez le menu (les trois points), puis « Installer l’application » ou « Ajouter à l’écran d’accueil ».'}
      </p>
    </div>
  );
}

type Vue =
  | { k: 'activation'; code: string; erreur?: string; enCours?: boolean; dAbordLApp?: boolean }
  | { k: 'secret-choisir'; premier?: string }
  | { k: 'verrou' }
  | { k: 'liste' }
  | { k: 'rdv'; ligne: LigneDuJourAuTpe; erreur?: string; enCours?: boolean; qr?: string; especes?: 'confirmer' | 'fait'; montantXof?: number }
  | { k: 'coupe' };

const RELECTURE_MS = 20_000;
const ESSAIS_DU_SECRET = 5;
const francs = (x: number): string => `${Math.round(x).toLocaleString('fr-FR').replace(/[  ]/g, ' ')} F`;
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const jourDit = (iso?: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  if (!m) return '';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return `${JOURS[d.getUTCDay()]} ${Number(m[3])} ${MOIS[Number(m[2]) - 1]} ${m[1]}`;
};
/** Le dossier servi (« /trone/ ») : la page « Régler » et payer.html vivent à côté. */
const dossier = (): string => window.location.pathname.replace(/[^/]*$/, '');
const RAISON_DITE: Record<string, string> = {
  'pas-terminee': 'La séance n’est pas encore terminée au Trône. Le maître la termine, puis vous encaissez.',
  /* Le lot 2 (26 novembre 2026) */
  'plafond-paiement': 'Au-delà de 300 000 F, cette séance se règle au comptoir.',
  'plafond-jour': 'Le plafond du jour de ce TPE est atteint : cette séance se règle au comptoir.',
  'especes-fermees': 'Ce TPE ne prend pas les espèces. La direction peut les ouvrir au Trône.',
  especes: 'Des espèces sont déjà déclarées pour cette séance : la direction les attend ce soir.',
  reglee: 'Cette séance est déjà réglée.',
  introuvable: 'Ce rendez-vous n’est plus dans la journée.',
  ecriture: 'Le Trône écrivait ce rendez-vous au même instant. Réessayez.',
  'hors-ligne': 'Ce téléphone n’a pas de réseau.',
  reseau: 'Le réseau ne répond pas. Réessayez.',
  panne: 'La Maison ne répond pas. Réessayez dans un instant.',
};
const raisonDite = (r?: string): string => RAISON_DITE[r ?? ''] ?? 'La Maison ne répond pas. Réessayez dans un instant.';
/** Le refus, et pour le plafond du jour, ce qui en reste. */
const raisonDuRefus = (r?: string, resteDuJourXof?: number): string =>
  r === 'plafond-jour' && typeof resteDuJourXof === 'number'
    ? `Le plafond du jour de ce TPE ne laisse plus que ${francs(resteDuJourXof)} : cette séance se règle au comptoir.`
    : raisonDite(r);

function Clavier({ onChiffre, onEfface }: { onChiffre: (c: string) => void; onEfface: () => void }) {
  return (
    <div className="tp-clavier">
      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((c) => (
        <button key={c} type="button" onClick={() => onChiffre(c)}>{c}</button>
      ))}
      <span />
      <button type="button" onClick={() => onChiffre('0')}>0</button>
      <button type="button" onClick={onEfface} aria-label="Effacer">‹</button>
    </div>
  );
}
const Points = ({ n }: { n: number }) => (
  <div className="tp-points" aria-label={`${n} chiffre${n > 1 ? 's' : ''} sur 4`}>
    {[0, 1, 2, 3].map((i) => <i key={i} className={i < n ? 'plein' : ''} />)}
  </div>
);

export default function App() {
  const [tpe, setTpe] = useState<TpeGarde | null>(() => lisLeTpeGarde());
  const [vue, setVue] = useState<Vue>(() => {
    const code = codeDuTpePropre(new URLSearchParams(window.location.search).get('a'));
    const garde = lisLeTpeGarde();
    /* Sur iPhone, dans Safari : l'app d'abord (elle ne verrait pas ce que Safari garde). */
    if (estUnCodeDuTpe(code)) return { k: 'activation', code, dAbordLApp: estUnIphone() && !estAutonome() };
    if (!garde) return { k: 'activation', code: '' };
    if (!garde.secret) return { k: 'secret-choisir' };
    return tpeAVerrouiller(dernierToucher(), Date.now()) ? { k: 'verrou' } : { k: 'liste' };
  });
  const [saisie, setSaisie] = useState('');
  const [erreurs, setErreurs] = useState(0);
  const [jour, setJour] = useState<{ jour?: string; lignes: LigneDuJourAuTpe[]; lu: boolean; erreur?: string; especes?: boolean; total?: TotalDuSoir; resteDuJourXof?: number }>({ lignes: [], lu: false });
  const activationLancee = useRef(false);
  const [invitation, setInvitation] = useState<InvitationAInstaller | null>(null);

  /* ── L'app : son service, et l'invitation de Chrome à installer. ── */
  useEffect(() => {
    enregistreLeServiceDeLApp();
    const garde = (e: Event) => { e.preventDefault(); setInvitation(e as InvitationAInstaller); };
    const installee = () => setInvitation(null);
    window.addEventListener('beforeinstallprompt', garde);
    window.addEventListener('appinstalled', installee);
    return () => { window.removeEventListener('beforeinstallprompt', garde); window.removeEventListener('appinstalled', installee); };
  }, []);

  /* ── Le toucher garde le TPE ouvert ; deux minutes sans, il se verrouille. ──
     SEUL UN TOUCHER SUR LE TPE OUVERT COMPTE (26 novembre 2026, « n'importe
     quel code ouvre le terminal », Yéman) : chaque toucher de l'écran du
     code, même faux, se notait comme une activité ; la page rouverte dans les
     deux minutes croyait alors le TPE en main et sautait le code. */
  const ouvert = useRef(false);
  useEffect(() => { ouvert.current = vue.k === 'liste' || vue.k === 'rdv'; }, [vue.k]);
  useEffect(() => {
    const touche = () => { if (ouvert.current) noteLeToucher(); };
    window.addEventListener('pointerdown', touche);
    window.addEventListener('keydown', touche);
    const minuterie = setInterval(() => {
      setVue((v) => {
        if ((v.k === 'liste' || v.k === 'rdv') && tpeAVerrouiller(dernierToucher(), Date.now())) {
          ouvert.current = false;
          oublieLeToucher();
          return { k: 'verrou' };
        }
        return v;
      });
    }, 5_000);
    return () => { window.removeEventListener('pointerdown', touche); window.removeEventListener('keydown', touche); clearInterval(minuterie); };
  }, []);

  const coupe = useCallback(() => {
    gardeLeTpe(null);
    oublieLeToucher();
    setTpe(null);
    setVue({ k: 'coupe' });
  }, []);

  /* ── L'activation : le code du QR, ou tapé. ── */
  const active = useCallback(async (brut: string) => {
    const code = codeDuTpePropre(brut);
    if (!estUnCodeDuTpe(code)) { setVue({ k: 'activation', code: brut, erreur: 'Le code a huit signes, lettres et chiffres, comme à l’écran du Trône.' }); return; }
    setVue({ k: 'activation', code, enCours: true });
    const r = await activeLeTelephone(code, nomDuTelephone());
    if (!r.ok || !r.jeton) {
      setVue({ k: 'activation', code, erreur: r.raison === 'code' ? 'Ce code n’est plus bon. Demandez-en un nouveau au Trône : il vit dix minutes.' : raisonDite(r.raison) });
      return;
    }
    const neuf: TpeGarde = { jeton: r.jeton, nom: r.nom ?? '', membreId: r.membreId ?? '', branchId: r.branchId ?? '' };
    gardeLeTpe(neuf);
    setTpe(neuf);
    /* Le code ne reste pas dans l'adresse : il ne sert qu'une fois. */
    try { window.history.replaceState(null, '', window.location.pathname); } catch { /* rien */ }
    setVue({ k: 'secret-choisir' });
  }, []);
  useEffect(() => {
    if (vue.k === 'activation' && estUnCodeDuTpe(vue.code) && !vue.enCours && !vue.erreur && !vue.dAbordLApp && !activationLancee.current) {
      activationLancee.current = true;
      void active(vue.code);
    }
  }, [vue, active]);

  /* ── Le jour : relu toutes les vingt secondes, et au retour sur la page. ── */
  const relis = useCallback(async () => {
    const t = lisLeTpeGarde();
    if (!t) return;
    const r = await lisLeJourDuTpe(t.jeton);
    if (r.raison === 'coupe') { coupe(); return; }
    if (!r.ok) { setJour((j) => ({ ...j, lu: true, erreur: raisonDite(r.raison) })); return; }
    setJour({ jour: r.jour, lignes: r.lignes ?? [], lu: true, especes: r.especes === true, total: r.total, resteDuJourXof: r.resteDuJourXof });
  }, [coupe]);
  useEffect(() => {
    if (vue.k !== 'liste' && vue.k !== 'rdv') return;
    void relis();
    const minuterie = setInterval(() => { void relis(); }, RELECTURE_MS);
    const revient = () => { if (document.visibilityState === 'visible') void relis(); };
    document.addEventListener('visibilitychange', revient);
    return () => { clearInterval(minuterie); document.removeEventListener('visibilitychange', revient); };
  }, [vue.k, relis]);

  /* ── Le code secret ── */
  const chiffre = async (c: string) => {
    const s = (saisie + c).slice(0, 4);
    setSaisie(s);
    if (s.length < 4) return;
    if (vue.k === 'secret-choisir') {
      if (!vue.premier) { setSaisie(''); setVue({ k: 'secret-choisir', premier: s }); return; }
      if (vue.premier !== s) { setSaisie(''); setVue({ k: 'secret-choisir' }); setErreurs(-1); return; }
      const t = lisLeTpeGarde();
      if (!t) { setVue({ k: 'activation', code: '' }); return; }
      const avecSecret = { ...t, secret: await empreinteDuSecret(s) };
      gardeLeTpe(avecSecret);
      setTpe(avecSecret);
      setSaisie(''); setErreurs(0); noteLeToucher();
      setVue({ k: 'liste' });
      return;
    }
    if (vue.k === 'verrou') {
      const t = lisLeTpeGarde();
      if (t && await secretJuste(s, t.secret)) { setSaisie(''); setErreurs(0); noteLeToucher(); setVue({ k: 'liste' }); return; }
      const n = erreurs + 1;
      setSaisie('');
      /* Un code faux n'ouvre rien, et n'entretient rien. */
      oublieLeToucher();
      if (n >= ESSAIS_DU_SECRET) { gardeLeTpe(null); oublieLeToucher(); setTpe(null); setErreurs(0); setVue({ k: 'activation', code: '', erreur: 'Cinq codes faux : le TPE est retiré de ce téléphone. Demandez un nouveau QR au Trône.' }); return; }
      setErreurs(n);
    }
  };

  /* ── Un rendez-vous ── */
  const ouvre = async (ligne: LigneDuJourAuTpe, comment: 'ici' | 'qr') => {
    const t = lisLeTpeGarde();
    if (!t) { setVue({ k: 'activation', code: '' }); return; }
    setVue({ k: 'rdv', ligne, enCours: true });
    const r = await ouvreLeRdvAuTpe(t.jeton, ligne.id);
    if (r.raison === 'coupe') { coupe(); return; }
    if (!r.ok || !r.jetonDuLien) { setVue({ k: 'rdv', ligne, erreur: raisonDuRefus(r.raison, r.resteDuJourXof) }); return; }
    if (comment === 'ici') {
      noteLeToucher();
      window.location.assign(`${dossier()}regler.html?r=${encodeURIComponent(r.jetonDuLien)}&tpe=1`);
      return;
    }
    setVue({ k: 'rdv', ligne, qr: `${window.location.origin}${dossier()}payer.html?tg=r-${encodeURIComponent(r.jetonDuLien)}` });
  };

  /* ── LES ESPÈCES (lot 2) : déclarées ici, remises le soir, encaissées par la direction. ── */
  const declare = async (ligne: LigneDuJourAuTpe) => {
    const t = lisLeTpeGarde();
    if (!t) { setVue({ k: 'activation', code: '' }); return; }
    setVue({ k: 'rdv', ligne, especes: 'confirmer', enCours: true });
    const r = await declareLesEspeces(t.jeton, ligne.id);
    if (r.raison === 'coupe') { coupe(); return; }
    if (!r.ok) { setVue({ k: 'rdv', ligne, erreur: raisonDuRefus(r.raison, r.resteDuJourXof) }); return; }
    noteLeToucher();
    setVue({ k: 'rdv', ligne, especes: 'fait', montantXof: Number(r.montantXof) || Number(ligne.resteXof) || 0 });
    void relis();
  };

  const tete = (
    <header className="tp-tete">
      <img className="tp-verrou" src={asset('assets/vectoriel/verrou-couche-indigo.svg')} alt="Maison MND" />
    </header>
  );

  if (vue.k === 'activation' && vue.dAbordLApp) {
    return (
      <main className="tp">
        {tete}
        <section className="tp-bloc tp-centre">
          <p className="tp-sur">Trône Terminal</p>
          <h1>D’abord, l’app</h1>
          <ol className="tp-etapes">
            <li>Touchez <b>Partager</b> (le carré et sa flèche), en bas de Safari.</li>
            <li>Choisissez <b>« Sur l’écran d’accueil »</b>, puis <b>Ajouter</b>.</li>
            <li>Ouvrez l’app <b>Trône TPE</b> et tapez ce code :</li>
          </ol>
          <p className="tp-code">{`${vue.code.slice(0, 4)}-${vue.code.slice(4)}`}</p>
          <p className="tp-doux tp-petit">Il vit dix minutes. Passé ce délai, demandez un nouveau QR au Trône.</p>
          <button type="button" className="tp-lien" onClick={() => setVue({ k: 'activation', code: vue.code })}>Rester dans Safari et activer ici</button>
        </section>
      </main>
    );
  }

  if (vue.k === 'activation') {
    return (
      <main className="tp">
        {tete}
        <section className="tp-bloc tp-centre">
          <p className="tp-sur">{estAutonome() ? 'Trône Terminal' : 'TPE de poche'}</p>
          <h1>Activer ce téléphone</h1>
          {vue.enCours ? <p className="tp-doux">Activation…</p> : (
            <>
              <p className="tp-doux">Au Trône, la direction affiche un QR sur votre ligne. Scannez-le avec l’appareil photo, ou tapez son code.</p>
              <form className="tp-pile" onSubmit={(e) => { e.preventDefault(); activationLancee.current = true; void active(vue.code); }}>
                <label className="tp-champ" htmlFor="tp-code">
                  <span className="tp-doux">Code d’activation</span>
                  <input id="tp-code" autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="4k7m-9q2x" value={vue.code}
                    onChange={(e) => setVue({ k: 'activation', code: e.target.value })} />
                </label>
                <button type="submit" className="tp-btn tp-btn--plein" disabled={!vue.code.trim()}>Activer</button>
              </form>
            </>
          )}
          {vue.erreur && <p className="tp-alerte" role="alert">{vue.erreur}</p>}
          <Installer invitation={invitation} onInstalle={() => setInvitation(null)} />
        </section>
      </main>
    );
  }

  if (vue.k === 'coupe') {
    return (
      <main className="tp">
        {tete}
        <section className="tp-bloc tp-centre">
          <p className="tp-sur">TPE de poche</p>
          <h1>Ce TPE a été coupé</h1>
          <p className="tp-doux">La direction l’a arrêté depuis le Trône. Plus rien ne s’encaisse sur ce téléphone.</p>
          <button type="button" className="tp-btn" onClick={() => setVue({ k: 'activation', code: '' })}>Activer à nouveau</button>
        </section>
      </main>
    );
  }

  if (vue.k === 'secret-choisir' || vue.k === 'verrou') {
    const choisir = vue.k === 'secret-choisir';
    return (
      <main className="tp">
        {tete}
        <section className="tp-bloc tp-centre">
          <p className="tp-sur">TPE de poche{tpe?.nom ? ` · ${tpe.nom}` : ''}</p>
          <h1>{choisir ? (vue.premier ? 'Encore une fois' : 'Inventez votre code secret') : 'Votre code secret'}</h1>
          <p className="tp-doux">{choisir
            ? (erreurs === -1 ? 'Les deux codes ne se ressemblaient pas. Recommencez.' : 'Quatre chiffres, choisis par vous, maintenant. Ils seront demandés à chaque ouverture du TPE.')
            : (erreurs > 0 ? `Code faux. Encore ${ESSAIS_DU_SECRET - erreurs} essai${ESSAIS_DU_SECRET - erreurs > 1 ? 's' : ''}.` : 'Deux minutes sans toucher : le TPE s’est verrouillé.')}</p>
          <Points n={saisie.length} />
          <Clavier onChiffre={(c) => { void chiffre(c); }} onEfface={() => setSaisie((s) => s.slice(0, -1))} />
        </section>
      </main>
    );
  }

  const enTete = (
    <div className="tp-marque">
      <div><b>Trône Terminal</b><span>{tpe?.nom}{jour.jour ? ` · ${jourDit(jour.jour)}` : ''}</span></div>
    </div>
  );

  if (vue.k === 'rdv') {
    const l = vue.ligne;
    return (
      <main className="tp">
        {tete}
        <section className="tp-bloc">
          {enTete}
          <div className="tp-qui">
            <b>{l.prenom}{l.essai ? <span className="tp-puce">Essai</span> : null}</b>
            <span>{l.heure}{l.prestations ? ` · ${l.prestations}` : ''}</span>
          </div>
          {l.resteXof !== null && <p className="tp-montant">{francs(l.resteXof)}</p>}
          {vue.qr ? (
            <div className="tp-pile tp-centre">
              <p className="tp-doux">Tournez l’écran vers elle : elle scanne, et paie sur son téléphone, par mobile money ou par carte.</p>
              <QrSvg valeur={vue.qr} style={{ width: 220, height: 220, display: 'block', margin: '0 auto' }} dit={`Le lien de règlement de ${l.prenom}`} />
              <p className="tp-doux tp-petit">La liste se met à jour quand c’est réglé.</p>
            </div>
          ) : vue.especes === 'fait' ? (
            <div className="tp-pile tp-centre">
              <p className="tp-montant">{francs(vue.montantXof ?? 0)}</p>
              <p>Noté : en espèces, à remettre ce soir à la direction.</p>
              <p className="tp-doux tp-petit">Rien ne s’inscrit sur sa facture avant que la direction les reçoive au Trône.</p>
            </div>
          ) : vue.especes === 'confirmer' ? (
            <div className="tp-pile">
              <p>Vous avez reçu <b>{l.resteXof !== null ? francs(l.resteXof) : 'le montant'}</b> en espèces de {l.prenom} ?</p>
              <p className="tp-doux tp-petit">Vous les remettrez ce soir à la direction. Rien ne s’inscrit sur sa facture avant.</p>
              <button type="button" className="tp-btn tp-btn--plein" disabled={vue.enCours} onClick={() => { void declare(l); }}>{vue.enCours ? 'Un instant…' : 'Oui, je les ai reçus'}</button>
              <button type="button" className="tp-btn" disabled={vue.enCours} onClick={() => setVue({ k: 'rdv', ligne: l })}>Non, revenir</button>
            </div>
          ) : vue.enCours ? <p className="tp-doux tp-centre">Ouverture…</p> : (
            <div className="tp-pile">
              <button type="button" className="tp-moyen" onClick={() => { void ouvre(l, 'ici'); }}>
                <b>Encaisser sur ce téléphone</b>
                <span>MTN, Moov, Celtiis ou carte, par la fenêtre KkiaPay : elle confirme sur son téléphone ou tape sa carte ici.</span>
              </button>
              <button type="button" className="tp-moyen" onClick={() => { void ouvre(l, 'qr'); }}>
                <b>Elle paie sur son téléphone</b>
                <span>Un QR à lui montrer : elle règle chez elle, carte ou mobile money.</span>
              </button>
              {jour.especes && (
                <button type="button" className="tp-moyen" onClick={() => setVue({ k: 'rdv', ligne: l, especes: 'confirmer' })}>
                  <b>Elle paie en espèces</b>
                  <span>Vous gardez les billets et les remettez ce soir à la direction.</span>
                </button>
              )}
            </div>
          )}
          {vue.erreur && <p className="tp-alerte" role="alert">{vue.erreur}</p>}
          <button type="button" className="tp-btn" onClick={() => { setVue({ k: 'liste' }); void relis(); }}>Retour à la journée</button>
        </section>
      </main>
    );
  }

  /* La liste du jour. */
  return (
    <main className="tp">
      {tete}
      <section className="tp-bloc">
        {enTete}
        {!jour.lu && <p className="tp-doux">Lecture de la journée…</p>}
        {jour.erreur && <p className="tp-alerte" role="alert">{jour.erreur}</p>}
        {jour.lu && jour.lignes.length === 0 && !jour.erreur && <p className="tp-doux">Aucun rendez-vous aujourd’hui dans cette branche.</p>}
        <ul className="tp-liste">
          {jour.lignes.map((l) => {
            const ouvrable = l.etat === 'a-encaisser';
            return (
              <li key={l.id}>
                <button type="button" className={`tp-rdv ${ouvrable ? '' : 'tp-rdv--repos'}`} disabled={!ouvrable}
                  onClick={() => setVue({ k: 'rdv', ligne: l })}>
                  <span className="tp-h">{l.heure}</span>
                  <span className="tp-q"><b>{l.prenom}{l.essai ? <span className="tp-puce">Essai</span> : null}</b><span>{l.prestations || '—'}</span></span>
                  <span className="tp-m">
                    {l.etat === 'reglee' ? <span className="tp-puce tp-puce--bon">Réglé</span>
                      : l.etat === 'pas-terminee' ? <span className="tp-puce">Pas terminée</span>
                      : l.etat === 'especes' ? <span className="tp-puce">Espèces · à remettre</span>
                        : l.resteXof !== null ? francs(l.resteXof) : 'À encaisser'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {/* LE TOTAL DU SOIR (lot 2) : ce que MTN et KkiaPay ont confirmé, et les espèces à remettre. */}
        {jour.total && jour.total.seances > 0 && (
          <p className="tp-total">
            <span>Ce soir</span>
            <b>{francs(jour.total.encaisseXof)}</b> encaissés{jour.total.especesARemettreXof > 0 ? <> · <b>{francs(jour.total.especesARemettreXof)}</b> en espèces à remettre</> : null}
          </p>
        )}
        {typeof jour.resteDuJourXof === 'number' && jour.resteDuJourXof < PLAFOND_PAR_JOUR_XOF && (
          <p className="tp-doux tp-petit">Plafond du jour : encore {francs(jour.resteDuJourXof)} sur ce TPE.</p>
        )}
        <p className="tp-doux tp-petit">Une séance s’encaisse ici dès que le maître l’a terminée au Trône. L’argent arrive sur les comptes de la Maison, jamais sur ce téléphone.</p>
        <Installer invitation={invitation} onInstalle={() => setInvitation(null)} />
        <button type="button" className="tp-lien" onClick={() => { gardeLeTpe(null); oublieLeToucher(); setTpe(null); setVue({ k: 'activation', code: '' }); }}>
          Retirer le TPE de ce téléphone
        </button>
      </section>
    </main>
  );
}

