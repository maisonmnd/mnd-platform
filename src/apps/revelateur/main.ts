import './revelateur.css';
import { maison } from './maison';
import { mesure } from './mesure';

/* LE SITE RÉVÉLATEUR, CE QUI VIT — 17 septembre 2026.

   Les pages sont de vraies pages HTML, écrites à la construction par
   `scripts/genere-revelateur.mjs` : titres, textes, liens, tout est dans le
   fichier avant qu'un seul script ne tourne. Ce point d'entrée est LÉGER par
   principe (pas de React, pas de Supabase tant qu'on n'en a pas besoin) :
     ① relier les boutons WhatsApp au numéro de la Maison, lu sans compte ;
     ② monter les îlots React seulement sur les pages qui en portent ;
     ③ compter, sans jamais nommer personne (`mesure`). */

function relieWhatsApp(numero: string) {
  document.querySelectorAll<HTMLAnchorElement>('a[data-wa]').forEach((a) => {
    /* Le message est déjà dans le lien, écrit par le générateur : on ne
       fait qu'y poser le numéro. */
    a.href = a.href.replace(/^https:\/\/wa\.me\/\d*\?/, `https://wa.me/${numero}?`);
    a.target = '_blank';
    a.rel = 'noopener';
    if (!a.dataset.mesure) {
      a.dataset.mesure = 'whatsapp_clique';
      a.dataset.parcours = a.dataset.wa || 'inconnu';
    }
  });
}

function compte() {
  mesure('page_vue');
  document.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('[data-mesure]');
    if (!a) return;
    mesure(a.dataset.mesure as Parameters<typeof mesure>[0], { parcours: a.dataset.parcours, sortie: a.dataset.sortie });
  });
}

function marqueLaPageCourante() {
  const ici = location.pathname.replace(/index\.html$/, '');
  document.querySelectorAll<HTMLAnchorElement>('.nav a').forEach((a) => {
    const la = new URL(a.href, location.href).pathname.replace(/index\.html$/, '');
    if (la === ici) a.setAttribute('aria-current', 'page');
  });
}

compte();
marqueLaPageCourante();
/* LA BOUTIQUE SE RÉVÈLE À SON OUVERTURE — 22 octobre 2026. « La boutique ne
   sera visible que dès cet instant » (Yéman) : son lien est écrit caché dans
   le menu, et se montre quand la date posée au Trône est passée. Lu quand le
   navigateur souffle, jamais avant le premier écran. */
const liensQuiAttendent = document.querySelectorAll<HTMLAnchorElement>('a[data-revele="boutique"]');
if (liensQuiAttendent.length) {
  const revele = () => {
    void import('./boutique-ouverte').then((m) => m.boutiqueEstOuverte())
      .then((ouverte) => { if (ouverte) liensQuiAttendent.forEach((a) => { a.hidden = false; }); })
      .catch(() => { /* fermée ou injoignable : le lien reste caché */ });
  };
  if ('requestIdleCallback' in window) requestIdleCallback(revele, { timeout: 3000 }); else setTimeout(revele, 1500);
}
/* REACT PART D'ABORD, ET LA PAGE DE RÉSERVATION LE SAIT — 11 octobre 2026
   (vitesse) : sur cette page, la bibliothèque Supabase (210 Ko) et l'agenda
   attendent que React soit là, pour que le calendrier paraisse avant. */
const monteEnRoute = document.querySelector('[data-ilot]') ? import('./monte') : null;
const pageDeReservation = document.querySelector<HTMLElement>('[data-ilot="reserver"]');
const quandReactEstLa: Promise<unknown> = pageDeReservation && monteEnRoute ? monteEnRoute.catch(() => undefined) : Promise.resolve(undefined);

/* LA BULLE « NOUS JOINDRE » S'ANIME — 19 octobre 2026 (maquette BPWmpyyw…).
   Son balisage et ses gestes simples (ouvrir, revenir, fermer) sont écrits
   dans la page ; ici, ce qui demande le serveur ou React, et seulement
   quand on le touche : « En ligne » se lit à l'ouverture, le chat et le
   message vocal se montent au premier toucher de leur rond. */
if (document.getElementById('joindre')) {
  let etatLu = false;
  document.addEventListener('mnd:joindre-ouvert', () => {
    if (etatLu) return;
    etatLu = true;
    void import('./chat').then(({ quelquUnEstLa }) => quelquUnEstLa()).then((la) => {
      const e = document.getElementById('joindre-etat');
      /* Le serveur n'a rien dit : on ne dit rien plutôt que de mentir. */
      if (!e || la === null) return;
      e.hidden = false;
      e.classList.toggle('est-la', la);
      const t = e.querySelector('span');
      if (t) t.textContent = la ? 'En ligne' : 'Réponse automatique, puis WhatsApp';
    }).catch(() => undefined);
  });
  document.addEventListener('mnd:joindre-vue', (ev) => {
    const vue = (ev as CustomEvent<{ vue?: string }>).detail?.vue;
    if (vue !== 'chat' && vue !== 'vocal') return;
    const el = document.getElementById(`joindre-ilot-${vue}`);
    if (el) void import('./monte').then((m) => m.monteIci(el, vue)).catch(() => undefined);
  });
}

/* LE MENU DERRIÈRE SON BOUTON, ET LA BARRE DE L'ACCUEIL — 23 septembre 2026.
   Le bouton ouvre les liens (sur téléphone partout, sur l'accueil aussi en
   grand) ; un clic ailleurs ou Échap referme. Sur l'accueil, la barre est
   transparente sur la photo et redevient pleine dès qu'on descend. */
const barre = document.querySelector<HTMLElement>('.barre');
const menuEtat = barre?.querySelector<HTMLInputElement>('.menu-etat');
if (barre && menuEtat) {
  /* L'état vit dans la case à cocher, cachée par un clip et non par
     display:none : Tab l'atteint, Espace la bascule, le menu s'ouvre sans une
     ligne de script. Ici, seulement le confort : Échap et le clic ailleurs. */
  const ferme = () => { menuEtat.checked = false; };
  document.addEventListener('click', (e) => { if (menuEtat.checked && !(e.target as Element).closest('.barre')) ferme(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') ferme(); });
}
/* LES FLÈCHES DE LA VUE PLEINE PAGE — 26 septembre 2026. Les liens font tout
   sans script : suivante, précédente, fermer. Le script n'apporte que deux
   conforts. Les flèches du clavier (et Échap) valent un clic sur le lien ; et
   passer d'une photo à l'autre REMPLACE l'adresse au lieu de l'empiler, pour
   que « retour » ramène à la grille en un geste, pas en dix-huit. */
const pleines = document.querySelector<HTMLElement>('.gal-pleines');
if (pleines) {
  const va = (a: HTMLAnchorElement | null) => { if (a) location.replace(a.getAttribute('href') ?? '#'); };
  pleines.addEventListener('click', (e) => {
    const pas = (e.target as Element).closest<HTMLAnchorElement>('.gal-plein__pas');
    if (pas) { e.preventDefault(); va(pas); }
  });
  const CIBLES: Record<string, string> = {
    ArrowRight: '.gal-plein__pas--apres', ArrowLeft: '.gal-plein__pas--avant', Escape: '.gal-plein__fermer',
  };
  document.addEventListener('keydown', (e) => {
    const vue = document.querySelector<HTMLElement>('.gal-plein:target');
    const cible = CIBLES[e.key];
    if (!vue || !cible) return;
    e.preventDefault();
    const a = vue.querySelector<HTMLAnchorElement>(cible);
    if (e.key === 'Escape') a?.click(); else va(a);
  });
}
/* LA BARRE DE L'ACCUEIL ET LA COULEUR DU HAUT — 8 octobre 2026. La barre est
   pleine dès 24 px ; le theme-color suit : indigo tant que la barre est
   transparente sur la photo, ivoire ensuite (sur téléphone, c'est la bande
   au-dessus de la page que l'œil lit comme « la couleur de la page »). La
   ligne en ligne du gabarit, écrite après </header>, a déjà posé .solide si
   l'adresse portait une ancre : ici on ne fait que suivre. */
if (barre && document.body.classList.contains('accueil-plein')) {
  const couleurDuHaut = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  const suit = () => {
    const solide = window.scrollY > 24;
    barre.classList.toggle('solide', solide);
    couleurDuHaut?.setAttribute('content', solide ? '#F6F1E7' : '#1E2150');
  };
  suit();
  addEventListener('scroll', suit, { passive: true });
}
/* SEULES LES PAGES À ÎLOT LISENT LA BASE AU DÉMARRAGE — 11 octobre 2026
   (revue des pages) : une vingtaine de pages chargeaient la bibliothèque
   (214 Ko) pour relire un numéro de WhatsApp déjà écrit dans leur HTML. Le
   pied lit l'état du jour à part, quand il approche. */
if (monteEnRoute) {
  void quandReactEstLa.then(() => maison()).then((m) => { if (m?.whatsapp) relieWhatsApp(m.whatsapp); }).catch(() => { /* le numéro du registre est déjà écrit */ });
}
/* LA REMISE QUI REVIENT — 11 octobre 2026 : sur une page qui porte des
   remises écrites, le module part quand le navigateur souffle (la pastille
   et la fenêtre ne servent qu'après la lecture du premier écran). */
if (document.getElementById('remises')) {
  const lanceLaRemise = () => { void import('./remise').then((m) => m.monte()).catch(() => { /* le bandeau écrit suffit */ }); };
  if ('requestIdleCallback' in window) requestIdleCallback(lanceLaRemise, { timeout: 2500 }); else setTimeout(lanceLaRemise, 1200);
}
/* L'ÉTAT DU JOUR AU PIED — 11 octobre 2026 : « Ouvert jusqu'à 19h00 », lu
   quand le pied approche de l'écran (une requête, pas avant), avec les
   fermetures exceptionnelles. Sans heures connues, la ligne reste cachée. */
const etatAuPied = document.querySelector<HTMLElement>('[data-etat-maison]');
if (etatAuPied && 'IntersectionObserver' in window) {
  const guet = new IntersectionObserver((vus) => {
    if (!vus.some((v) => v.isIntersecting)) return;
    guet.disconnect();
    void Promise.all([import('./maison'), import('./heures')]).then(async ([{ heuresDeLaMaison }, { etatDeLaMaison }]) => {
      const h = await heuresDeLaMaison();
      const etat = etatDeLaMaison(h.semaine, h.exceptions, new Date());
      if (!etat) return;
      etatAuPied.textContent = etat.texte;
      etatAuPied.classList.toggle('est-ouvert', etat.ouvert);
      etatAuPied.hidden = false;
    }).catch(() => { /* la semaine écrite suffit */ });
  }, { rootMargin: '400px 0px' });
  guet.observe(etatAuPied.closest('footer') ?? etatAuPied.parentElement ?? etatAuPied);
}
/* LE CALENDRIER SE CHARGE PENDANT QUE SON CODE ARRIVE — 28 septembre 2026 :
   sur une page qui porte la réservation, les données partent dès l'ouverture,
   en parallèle du téléchargement de l'îlot (voir calendrierDuSite). */
if (pageDeReservation) {
  /* LE CODE DU CALENDRIER PART EN MÊME TEMPS QUE REACT — 11 octobre 2026
     (vitesse) : il ne se demandait qu'une fois React arrivé et exécuté, deux
     allers-retours de plus sur un téléphone lent. Le montage (monte.tsx)
     retrouve le même module, déjà en route. */
  void import('./ilots/Reserver').catch(() => { /* le montage réessaiera */ });
  /* LA BRANCHE EST ÉCRITE DANS LA PAGE (agenda pré-écrit) : les créneaux pris
     partent tout de suite, par un simple fetch ; le reste de l'agenda, qui
     passe par la bibliothèque, attend React. */
  const brancheDeLaPage = (() => {
    try {
      const brut = pageDeReservation.querySelector('script[data-initiales]')?.textContent;
      return brut ? String((JSON.parse(brut) as { branchId?: string }).branchId ?? '') : '';
    } catch { return ''; }
  })();
  void import('./agenda').then(({ calendrierDuSite, prechargeLesOccupes, prochainsJours, JOURS_DU_CALENDRIER }) => {
    const jours = prochainsJours(JOURS_DU_CALENDRIER);
    if (brancheDeLaPage) prechargeLesOccupes(brancheDeLaPage, jours[0], jours[jours.length - 1]).catch(() => { /* l'îlot le dira */ });
    void quandReactEstLa.then(() => calendrierDuSite(jours[0], jours[jours.length - 1], brancheDeLaPage)).catch(() => { /* l'îlot réessaiera */ });
  });
}
/* L'ÉCLAIRCISSEMENT AU DÉFILEMENT, 8 octobre 2026. « On n'apparaît pas, on
   s'éclaire. » La classe js a été posée sur <html> par une ligne dans <head>,
   sous la garde prefers-reduced-motion ; sans elle, aucune règle de voile ne
   s'applique et ce bloc ne fait rien. Les têtes de section marquées
   data-voile par le générateur (jamais le premier écran, jamais un îlot, jamais
   la galerie) s'éclairent quand leur bord haut passe 92 % de la fenêtre, UNE
   fois : jamais re-voilées en remontant (le récit, lui, le fait à dessein).
   Ce qui est déjà à l'écran quand ce module arrive est révélé NET, sans
   transition : pas de fondu par-dessus le fondu de page. Ce qui est au-dessus
   du point d'arrivée (ancre /#portes) est révélé aussi. Sans
   IntersectionObserver, on retire la classe js : tout est visible aussitôt,
   sans attendre le filet de secours de 1,6 s de la feuille. */
const racine = document.documentElement;
if (racine.classList.contains('js')) {
  const voiles = [...document.querySelectorAll<HTMLElement>('[data-voile]')];
  if ('IntersectionObserver' in window && voiles.length) {
    const io = new IntersectionObserver((entrees) => {
      for (const e of entrees) {
        if (e.isIntersecting || e.boundingClientRect.top < 0) {
          e.target.classList.add('vu');
          io.unobserve(e.target);
        }
      }
    }, { rootMargin: '0px 0px -8% 0px' });
    for (const el of voiles) {
      if (el.getBoundingClientRect().top < innerHeight) el.classList.add('vu', 'vu--net');
      else io.observe(el);
    }
  } else {
    racine.classList.remove('js');
  }
}
