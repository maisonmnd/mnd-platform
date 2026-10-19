import { StrictMode, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';

/* LES ÎLOTS, montés seulement sur les pages qui en portent un. React ne se
   charge que par ce module, et ce module ne se charge que s'il y a un
   emplacement `data-ilot` dans la page. */

/* LE CODE D'ABORD, LE MONTAGE ENSUITE — 11 octobre 2026. Les îlots se
   montaient par `lazy` sous un `Suspense` sans repli : au premier rendu,
   React remplaçait ce que la page avait écrit (la première question du
   diagnostic, le calendrier qui se charge, les offres) par RIEN, le temps
   que le code arrive. Sur un téléphone lent, la page s'effondrait puis se
   regonflait (CLS mesuré à 0,66 sur le diagnostic). On attend maintenant le
   code, puis on monte : le contenu écrit reste visible jusqu'à l'instant où
   l'îlot le remplace, et si le code ne vient pas, la page garde son repli. */
type Chargeur = () => Promise<{ default: ComponentType<Record<string, unknown>> }>;
const ILOTS: Record<string, Chargeur> = {
  triage: () => import('./ilots/Triage') as unknown as ReturnType<Chargeur>,
  demande: () => import('./ilots/Demande') as unknown as ReturnType<Chargeur>,
  reserver: () => import('./ilots/Reserver') as unknown as ReturnType<Chargeur>,
  avis: () => import('./ilots/Avis') as unknown as ReturnType<Chargeur>,
  offres: () => import('./ilots/Offres') as unknown as ReturnType<Chargeur>,
  'bandeau-offre': () => import('./ilots/BandeauOffre') as unknown as ReturnType<Chargeur>,
  contact: () => import('./ilots/Contact') as unknown as ReturnType<Chargeur>,
  joindre: () => import('./ilots/Joindre') as unknown as ReturnType<Chargeur>,
  offrir: () => import('./ilots/Offrir') as unknown as ReturnType<Chargeur>,
  parrainer: () => import('./ilots/Parrainer') as unknown as ReturnType<Chargeur>,
  /* Le message vocal (19 octobre 2026) : la colonne de /rappel/. */
  vocal: () => import('./ilots/MessageVocal') as unknown as ReturnType<Chargeur>,
};

document.querySelectorAll<HTMLElement>('[data-ilot]').forEach((el) => {
  const charge = ILOTS[el.dataset.ilot ?? ''];
  if (!charge) return;
  const props: Record<string, unknown> = {};
  if (el.dataset.genre) props.genre = el.dataset.genre;
  if (el.dataset.besoin) props.besoin = el.dataset.besoin;
  /* Le profil posé d'avance (la testeuse, 28 septembre 2026). */
  if (el.dataset.profil) props.profil = el.dataset.profil;
  /* LES DONNÉES ÉCRITES DANS LA PAGE — 24 septembre 2026. La construction
     pose, à côté du rendu, un bloc JSON que l'îlot reprend au montage : il
     repart de ce que la page montre déjà, puis relit la base. */
  const initiales = el.querySelector<HTMLScriptElement>('script[type="application/json"][data-initiales]');
  if (initiales?.textContent) {
    try { props.initiales = JSON.parse(initiales.textContent); } catch { /* un JSON abîmé vaut une page sans initiales */ }
  }
  void charge().then(({ default: Ilot }) => {
    createRoot(el).render(
      <StrictMode>
        <Ilot {...props} />
      </StrictMode>,
    );
    /* LE PLANCHER NE VAUT QUE JUSQU'AU MONTAGE — 11 octobre 2026 (revue des
       pages) : la feuille réserve à chaque emplacement la hauteur que l'îlot
       prendra (mesurée au banc), pour que la page ne saute pas ; une fois
       monté, l'îlot fait sa hauteur, et un écran court (un merci) ne laisse
       pas de vide. */
    el.classList.add('est-monte');
  }).catch(() => { /* le code n'est pas venu : la page garde ce qu'elle a écrit */ });
});
