import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';

/* LES ÎLOTS, montés seulement sur les pages qui en portent un. React ne se
   charge que par ce module, et ce module ne se charge que s'il y a un
   emplacement `data-ilot` dans la page. */

const ILOTS = {
  triage: lazy(() => import('./ilots/Triage')),
  demande: lazy(() => import('./ilots/Demande')),
  reserver: lazy(() => import('./ilots/Reserver')),
  avis: lazy(() => import('./ilots/Avis')),
  offres: lazy(() => import('./ilots/Offres')),
  contact: lazy(() => import('./ilots/Contact')),
} as const;

document.querySelectorAll<HTMLElement>('[data-ilot]').forEach((el) => {
  const nom = el.dataset.ilot as keyof typeof ILOTS;
  const Ilot = ILOTS[nom];
  if (!Ilot) return;
  const props: Record<string, string> = {};
  if (el.dataset.genre) props.genre = el.dataset.genre;
  if (el.dataset.besoin) props.besoin = el.dataset.besoin;
  createRoot(el).render(
    <StrictMode>
      <Suspense fallback={null}>
        {/* @ts-expect-error : chaque îlot lit les seules props qu'il connaît */}
        <Ilot {...props} />
      </Suspense>
    </StrictMode>,
  );
});
