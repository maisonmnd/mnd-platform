import { useEffect, type ReactNode } from 'react';
import { authEnabled, useAuth, useMaTete } from './auth';
import {
  ENTREE_DU_TRONE, SORTIES_DE_LA_PORTE, etatDeLaPorteDeLEquipe,
  type EtatDeLaPorteDeLEquipe, type PageDeLEquipe,
} from './porte-de-l-equipe-pur';

/* LA PORTE DE L'ÉQUIPE, BRANCHÉE SUR LA SESSION — 17 novembre 2026.
   La règle vit dans `porte-de-l-equipe-pur`. Ici : la session du Trône (la
   même origine, le même tiroir), la fiche du personnel (`useMaTete`, qui ne
   conclut jamais d'une panne), et l'écran de celle qui n'en est pas. */

export function useEtatDeLaPorteDeLEquipe(): EtatDeLaPorteDeLEquipe {
  const { session, loading } = useAuth();
  const { tete, pret } = useMaTete();
  return etatDeLaPorteDeLEquipe({ serveur: authEnabled, chargement: loading, session: !!session, pret, personnel: !!tete });
}

/* Les couleurs et les polices sont écrites ici : la porte s'affiche avant la
   feuille de la page, et la papeterie du bilan n'a pas les jetons du design
   system. Indigo sur ivoire, Cormorant Garamond 300 et Jost, un filet cuivre. */
const FOND = '#F6F1E7';
const INDIGO = '#1E2150';
const CUIVRE = '#B97A4A';

export function PorteDeLEquipe({ page, children }: { page: PageDeLEquipe; children: ReactNode }) {
  const etat = useEtatDeLaPorteDeLEquipe();
  const sortie = SORTIES_DE_LA_PORTE[page];
  useEffect(() => {
    if (etat === 'dehors' && sortie.mene) window.location.replace(sortie.vers);
  }, [etat, sortie.mene, sortie.vers]);

  if (etat === 'equipe') return <>{children}</>;
  return (
    <main
      data-porte-de-l-equipe={etat}
      style={{
        minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18,
        padding: 24, background: FOND, color: INDIGO, textAlign: 'center',
      }}
    >
      {etat === 'dehors' && (
        <>
          <p style={{ margin: 0, fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 300, fontSize: 30, lineHeight: 1.2 }}>{sortie.ligne}</p>
          <span aria-hidden="true" style={{ width: 40, height: 1, background: CUIVRE }} />
          <a
            href={sortie.vers}
            style={{
              fontFamily: 'Jost, system-ui, sans-serif', fontSize: 14, letterSpacing: '0.08em', textTransform: 'uppercase', textDecoration: 'none',
              color: FOND, background: INDIGO, padding: '12px 22px', borderRadius: 3,
            }}
          >
            {sortie.mot}
          </a>
          <a href={ENTREE_DU_TRONE} style={{ fontFamily: 'Jost, system-ui, sans-serif', fontSize: 12.5, color: INDIGO, opacity: 0.7, textUnderlineOffset: 3 }}>
            Équipe : le Trône
          </a>
        </>
      )}
    </main>
  );
}
