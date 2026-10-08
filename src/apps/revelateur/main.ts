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
if (document.querySelector('[data-ilot]')) void import('./monte');

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
void maison().then((m) => { if (m?.whatsapp) relieWhatsApp(m.whatsapp); });
/* LE CALENDRIER SE CHARGE PENDANT QUE SON CODE ARRIVE — 28 septembre 2026 :
   sur une page qui porte la réservation, les données partent dès l'ouverture,
   en parallèle du téléchargement de l'îlot (voir calendrierDuSite). */
if (document.querySelector('[data-ilot="reserver"]')) {
  void import('./agenda').then(({ calendrierDuSite, prochainsJours, JOURS_DU_CALENDRIER }) => {
    const jours = prochainsJours(JOURS_DU_CALENDRIER);
    void calendrierDuSite(jours[0], jours[jours.length - 1]).catch(() => { /* l'îlot réessaiera */ });
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
