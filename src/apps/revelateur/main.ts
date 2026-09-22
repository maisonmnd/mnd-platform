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
if (barre && document.body.classList.contains('accueil-plein')) {
  const suit = () => barre.classList.toggle('solide', window.scrollY > 24);
  suit();
  addEventListener('scroll', suit, { passive: true });
}
void maison().then((m) => { if (m?.whatsapp) relieWhatsApp(m.whatsapp); });
