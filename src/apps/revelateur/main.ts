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
void maison().then((m) => { if (m?.whatsapp) relieWhatsApp(m.whatsapp); });
