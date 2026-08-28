import { useEffect, useMemo, useRef, useState } from 'react';
import { useBranch } from '../../shared/branches';
import { fmtMoney } from '../../shared/currency';
import { DEVISE_COMPLETE, maisonNom } from '../../shared/identite';
import { useCategories, useProducts, useServices, catsDansLOrdre, priceModeOf } from '../../shared/catalog';
import { FAMILLES_FORMULES, usePlans } from '../../shared/abonnements';
import { carteReglages, directionDuGlisse, gardeSurLaCarte, indexSuivant, vitrineConfigStore } from '../../shared/bridges';
import { useStore } from '../../shared/store';
import { QrSvg } from './Qr';

/* ── LA CARTE DU COMPTOIR — 28 août 2026 ──────────────────────────────
   « Un catalogue des prix affiché sur un comptoir que le client peut faire
   défiler en toute autonomie : nos offres, nos abonnements, avec réserver
   votre rituel » (Yéman).

   UNE ENTRÉE À PART, PUBLIQUE ET SANS COMPTE. Ce n'est pas une page du
   Trône : la tablette reste sur le comptoir, parfois sans surveillance, face
   à qui passe. Elle ne crée aucun dossier, n'ouvre aucune fiche, ne connaît
   personne. Même laissée seule, il n'y a rien à y prendre.

   ELLE EST EN LECTURE SEULE. Aucun prix ne s'y modifie. Elle lit le catalogue
   en direct : un prix changé au Trône est dit au comptoir dans la seconde,
   là où une carte imprimée vieillit le jour où la Maison augmente.

   RÉSERVER SE FAIT SUR SON TÉLÉPHONE À ELLE. Sur une tablette partagée, se
   connecter voudrait dire le faire devant tout le monde puis penser à se
   déconnecter — et la cliente suivante hériterait du dossier de la
   précédente. Le carré déporte la réservation là où elle est déjà connue. */

type Volet = 'rituels' | 'formules' | 'produits' | 'reserver' | 'wifi';

/** Deux minutes sans un geste, et la carte revient à son début : la cliente
    suivante la trouve au commencement, pas là où la précédente s'est arrêtée. */
const REPOS_MS = 120_000;

export default function App() {
  const { branch, currency } = useBranch();
  const [services] = useServices();
  const [categories] = useCategories();
  const [produits] = useProducts();
  const [plans] = usePlans();
  const [vitrine] = useStore(vitrineConfigStore);
  const reglages = carteReglages(vitrine);

  /* Les réseaux posés, et eux seuls : un carré Wi-Fi sans mot de passe ne
     connecte rien, il déçoit. */
  const reseaux = useMemo(() => ([
    { rang: '5G', portee: 'Le plus rapide, près du fauteuil', ssid: reglages.wifiSsid, pass: reglages.wifiPass },
    { rang: '2G', portee: 'Porte plus loin, jusqu’au fond', ssid: reglages.wifi2Ssid, pass: reglages.wifi2Pass },
  ].filter((r) => r.ssid.trim() !== '' && r.pass.trim() !== '')),
  [reglages.wifiSsid, reglages.wifiPass, reglages.wifi2Ssid, reglages.wifi2Pass]);

  const volets = useMemo(() => ([
    ...(reglages.rituels ? [{ k: 'rituels' as const, l: 'Les rituels' }] : []),
    ...(reglages.formules ? [{ k: 'formules' as const, l: 'Les formules' }] : []),
    ...(reglages.produits ? [{ k: 'produits' as const, l: 'Care & Store' }] : []),
    { k: 'reserver' as const, l: 'Réserver' },
    /* LE WI-FI VIENT APRÈS RÉSERVER : c'est ce qu'on demande une fois assise,
       pas ce qu'on cherche en entrant. */
    ...(reglages.wifi && reseaux.length > 0 ? [{ k: 'wifi' as const, l: 'Le wifi' }] : []),
  ]), [reglages.rituels, reglages.formules, reglages.produits, reglages.wifi, reseaux.length]);

  const [volet, setVolet] = useState<string>(volets[0]?.k ?? 'reserver');
  /* Un volet qu'on éteint ne doit pas laisser l'écran sur du vide. */
  useEffect(() => {
    if (!volets.some((v) => v.k === volet)) setVolet(volets[0]?.k ?? 'reserver');
  }, [volets, volet]);

  /* LE RETOUR AU REPOS. Tout geste le repousse ; le silence le déclenche. */
  const corps = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let t: number;
    const remettre = () => {
      setVolet(volets[0]?.k ?? 'reserver');
      corps.current?.scrollTo({ top: 0, behavior: 'smooth' });
    };
    const repousser = () => { window.clearTimeout(t); t = window.setTimeout(remettre, REPOS_MS); };
    repousser();
    const gestes: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
    gestes.forEach((g) => window.addEventListener(g, repousser, { passive: true }));
    return () => {
      window.clearTimeout(t);
      gestes.forEach((g) => window.removeEventListener(g, repousser));
    };
  }, [volets]);

  /* Le lien de Ma Couronne, construit sur l'origine COURANTE : jamais de
     domaine en dur, changer de compte ne casse rien. La carte vit sous
     /trone/, sa sœur sous /couronne/. */
  const lienCouronne = `${window.location.origin}${window.location.pathname.includes('/trone') ? '/couronne/' : '/couronne.html'}`;

  return (
    <div className="kio">
      <header className="kio-tete">
        <div className="kio-marque">
          <span className="kio-nom">{maisonNom()}</span>
          <span className="kio-devise">{DEVISE_COMPLETE}</span>
        </div>
        <nav className="kio-onglets" aria-label="La carte">
          {volets.map((v) => (
            <button
              key={v.k}
              type="button"
              className={`kio-onglet ${volet === v.k ? 'on' : ''}`}
              onClick={() => { setVolet(v.k); corps.current?.scrollTo({ top: 0 }); }}
            >
              {v.l}
            </button>
          ))}
        </nav>
      </header>

      <div className="kio-corps" ref={corps}>
        {volet === 'rituels' && (
          <Rituels
            services={gardeSurLaCarte(services, reglages.servicesMasques)}
            categories={categories}
            currency={currency}
          />
        )}
        {volet === 'formules' && (
          <Formules
            plans={gardeSurLaCarte(plans, reglages.formulesMasquees)}
            currency={currency}
            defile={reglages.defileFormules}
            secondes={reglages.secondesParFormule}
          />
        )}
        {volet === 'produits' && (
          <Produits produits={gardeSurLaCarte(produits, reglages.produitsMasques)} currency={currency} />
        )}
        {volet === 'reserver' && <Reserver lien={lienCouronne} ville={branch.city} />}
        {volet === 'wifi' && <Wifi reseaux={reseaux} />}
      </div>
    </div>
  );
}

/* ── LES RITUELS, PAR ATELIER ─────────────────────────────────────────
   Les ateliers sont la carte mentale de la Maison : ils nomment les
   prestations et vivent dans la bouche de l'équipe. Une liste à plat aurait
   obligé la cliente à tout lire pour trouver un soin. */
function Rituels({ services, categories, currency }: {
  services: ReturnType<typeof useServices>[0];
  categories: ReturnType<typeof useCategories>[0];
  currency: string;
}) {
  const groupes = useMemo(() => catsDansLOrdre(categories)
    .map((c) => ({
      cat: c,
      liste: services
        .filter((s) => s.categoryId === c.id)
        .sort((a, b) => a.priceXof - b.priceXof || a.name.localeCompare(b.name, 'fr')),
    }))
    .filter((g) => g.liste.length > 0), [services, categories]);

  if (groupes.length === 0) return <Vide dit="La carte des rituels s’ouvrira bientôt." />;

  return (
    <>
      {groupes.map((g) => (
        <section className="kio-atelier" key={g.cat.id}>
          <div className="kio-atelier__tete">
            <span className="kio-atelier__fon">{g.cat.fon}</span>
            {g.cat.label && <span className="kio-atelier__label">{g.cat.label}</span>}
            <span className="kio-rule" />
          </div>
          {g.liste.map((s) => {
            /* UN PRIX MASQUÉ NE S'INVENTE PAS. « Sur devis » dit la vérité :
               le montant se fixe au fauteuil, sur la couronne qu'on a devant
               soi. Afficher un chiffre serait une promesse que la Maison n'a
               pas faite. */
            const mode = priceModeOf(s);
            const surDevis = s.hidePrice || mode === 'devis' || s.priceXof <= 0;
            return (
              <div className="kio-presta" key={s.id}>
                <div>
                  <div className="kio-presta__nom">{s.name}</div>
                  {s.sessions > 1 && <div className="kio-presta__dit">{s.sessions} séances</div>}
                </div>
                <span className={`kio-presta__prix ${surDevis ? 'devis' : ''}`}>
                  {surDevis ? 'sur devis' : fmtMoney(s.priceXof, currency)}
                </span>
              </div>
            );
          })}
        </section>
      ))}
    </>
  );
}

/* ── LES FORMULES, QUI DÉFILENT ───────────────────────────────────────
   « Je veux pouvoir faire défiler les formules pour permettre aux lecteurs
   de bien lire » (Yéman). Douze cartes entassées se lisent en petits
   caractères, donc ne se lisent pas. Elles passent donc UNE À UNE, en grand,
   le temps d'être lues — et le doigt peut toujours devancer le rythme. */
function Formules({ plans, currency, defile, secondes }: {
  plans: ReturnType<typeof usePlans>[0];
  currency: string;
  defile: boolean;
  secondes: number;
}) {
  /* SEULES LES FORMULES RANGÉES DANS UN MOMENT PARAISSENT : le champ « Le
     moment du parcours » devient la commande qui publie une formule au
     comptoir, ou la garde en réserve. */
  const liste = useMemo(() => FAMILLES_FORMULES
    .flatMap((f) => plans.filter((p) => p.famille === f.k).map((p) => ({ p, f }))), [plans]);

  const [i, setI] = useState(0);
  useEffect(() => { if (i >= liste.length) setI(0); }, [liste.length, i]);

  /* Le défilement se remet à zéro à chaque geste : celle qui vient d'avancer
     à la main a tout son temps sur la carte qu'elle a choisie. */
  useEffect(() => {
    if (!defile || liste.length < 2) return;
    const t = window.setTimeout(() => setI((n) => (n + 1) % liste.length), secondes * 1000);
    return () => window.clearTimeout(t);
  }, [defile, liste.length, secondes, i]);

  /* ── LE GLISSEMENT ────────────────────────────────────────────────
     « Je préfère swiper et aller au suivant et revenir en arrière à ma
     convenance » (Yéman). Les pastilles demandent de viser ; le doigt qui
     glisse ne vise rien, il pousse. Le départ du geste est mémorisé, le sens
     se juge à la levée — et un mouvement plus vertical qu'horizontal ne
     compte pas, sans quoi chaque défilement du pouce ferait sauter une
     formule. */
  const depart = useRef<{ x: number; y: number } | null>(null);
  const pousse = (sens: -1 | 0 | 1) => { if (sens !== 0) setI((n) => indexSuivant(n, liste.length, sens)); };
  const surDepart = (x: number, y: number) => { depart.current = { x, y }; };
  const surFin = (x: number, y: number) => {
    const d = depart.current;
    depart.current = null;
    if (d) pousse(directionDuGlisse(x - d.x, y - d.y));
  };

  if (liste.length === 0) return <Vide dit="Les formules de la Maison s’ouvriront bientôt." />;

  const { p, f } = liste[Math.min(i, liste.length - 1)];
  return (
    <div
      className="kio-defile"
      onTouchStart={(e) => surDepart(e.touches[0].clientX, e.touches[0].clientY)}
      onTouchEnd={(e) => surFin(e.changedTouches[0].clientX, e.changedTouches[0].clientY)}
      onPointerDown={(e) => { if (e.pointerType === 'mouse') surDepart(e.clientX, e.clientY); }}
      onPointerUp={(e) => { if (e.pointerType === 'mouse') surFin(e.clientX, e.clientY); }}
      /* Le clavier aussi : une tablette branchée sur un clavier reste une
         tablette, et les flèches sont le geste attendu. */
      tabIndex={0}
      role="group"
      aria-label="Les formules, glissez pour changer"
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') pousse(-1);
        if (e.key === 'ArrowRight') pousse(1);
      }}
    >
      <div className="kio-moment">
        <span className="kio-moment__titre">{f.titre}</span>
        <span className="kio-moment__quand">{f.quand}</span>
        <span className="kio-rule" />
      </div>

      <article className={`kio-formule ${p.popular ? 'phare' : ''}`} key={p.id}>
        <div className="kio-formule__tag">{p.tag}</div>
        <h2 className="kio-formule__nom">{p.name}</h2>
        {p.line && <p className="kio-formule__ligne">{p.line}</p>}
        <div className="kio-formule__prix">
          {fmtMoney(p.priceXof, currency)}
          <span>{p.mode === 'pack' ? ' · pour l’année' : ' / mois'}</span>
        </div>
        <ul className="kio-formule__perks">
          {p.perks.map((k) => <li key={k}>{k}</li>)}
        </ul>
      </article>

      {/* Les flèches encadrent les pastilles : le doigt glisse, la souris
          clique, et le rang reste lisible entre les deux. */}
      <div className="kio-nav">
        <button type="button" className="kio-fleche" aria-label="La formule précédente" onClick={() => pousse(-1)}>‹</button>
        <div className="kio-points" role="tablist" aria-label="Les formules">
          {liste.map(({ p: q }, n) => (
            <button
              key={q.id}
              type="button"
              role="tab"
              aria-selected={n === i}
              aria-label={q.name}
              className={`kio-point ${n === i ? 'on' : ''}`}
              onClick={() => setI(n)}
            />
          ))}
        </div>
        <button type="button" className="kio-fleche" aria-label="La formule suivante" onClick={() => pousse(1)}>›</button>
      </div>
      <p className="kio-indice">
        {i + 1} sur {liste.length} · glissez du doigt pour la suivante
      </p>
    </div>
  );
}

/* ── LE WI-FI ─────────────────────────────────────────────────────────
   « Après Réserver il faut ajouter l'onglet pour le Code Wifi » (Yéman).
   Le carré se scanne et connecte le téléphone sans rien taper ; le nom et le
   mot de passe restent écrits dessous, pour celle dont le téléphone ne sait
   pas lire un QR Wi-Fi. */
const wifiPayload = (ssid: string, pass: string) =>
  `WIFI:T:WPA;S:${ssid.replace(/([\\;,:"])/g, '\\$1')};P:${pass.replace(/([\\;,:"])/g, '\\$1')};;`;

function Wifi({ reseaux }: { reseaux: { rang: string; portee: string; ssid: string; pass: string }[] }) {
  if (reseaux.length === 0) return <Vide dit="Le réseau de la Maison n’est pas encore posé." />;
  return (
    <div className="kio-wifi">
      <h2 className="kio-wifi__titre">Installez-vous.</h2>
      <p className="kio-wifi__dit">
        Le réseau de la Maison est à vous. Scannez le carré, votre téléphone se connecte seul.
      </p>
      <div className="kio-wifi__grille">
        {reseaux.map((r) => (
          <div className="kio-reseau" key={r.rang}>
            <div className="kio-reseau__qr"><QrSvg valeur={wifiPayload(r.ssid, r.pass)} /></div>
            <div className="kio-reseau__dit">
              <span className="kio-reseau__rang">{r.rang}</span>
              <div className="kio-reseau__portee">{r.portee}</div>
              <div className="kio-reseau__lab">Nom du réseau</div>
              <div className="kio-reseau__val">{r.ssid}</div>
              <div className="kio-reseau__lab">Mot de passe</div>
              <div className="kio-reseau__val">{r.pass}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── CARE & STORE ─────────────────────────────────────────────────────── */
function Produits({ produits, currency }: {
  produits: ReturnType<typeof useProducts>[0];
  currency: string;
}) {
  const liste = useMemo(
    () => [...produits].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [produits],
  );
  if (liste.length === 0) return <Vide dit="La gamme s’ouvrira bientôt." />;
  return (
    <section className="kio-atelier">
      <div className="kio-atelier__tete">
        <span className="kio-atelier__fon">Care &amp; Store</span>
        <span className="kio-atelier__label">La gamme de la Maison</span>
        <span className="kio-rule" />
      </div>
      {liste.map((p) => (
        <div className="kio-presta" key={p.id}>
          <div>
            <div className="kio-presta__nom">{p.name}</div>
            {/* LA RUPTURE SE DIT. Laisser une cliente choisir un produit
                absent, puis le lui refuser au comptoir, vaut moins que de
                l'annoncer tout de suite. */}
            {p.stock <= 0 && <div className="kio-presta__dit">bientôt de retour</div>}
          </div>
          <span className="kio-presta__prix">{fmtMoney(p.priceXof, currency)}</span>
        </div>
      ))}
    </section>
  );
}

/* ── RÉSERVER ─────────────────────────────────────────────────────────── */
function Reserver({ lien, ville }: { lien: string; ville: string }) {
  return (
    <div className="kio-reserver">
      <div className="kio-qr"><QrSvg valeur={lien} /></div>
      <div>
        <h2>Réservez votre rituel.</h2>
        <p>
          Scannez ce carré avec votre téléphone. Ma Couronne s’ouvre : vous choisissez votre
          rituel, votre jour et votre heure. Votre créneau vous attend.
        </p>
        <p>Vous y retrouverez aussi votre parcours, vos crédits d’abonnement et votre Cercle.</p>
        <div className="kio-ou">Ou dites-le-nous simplement, au comptoir{ville ? ` de ${ville}` : ''}.</div>
      </div>
    </div>
  );
}

function Vide({ dit }: { dit: string }) {
  return <div className="kio-vide">{dit}</div>;
}
