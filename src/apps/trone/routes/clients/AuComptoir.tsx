import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { asset } from '../../../../shared/asset';
import { maisonNom, DEVISE_COMPLETE, estLaMaisonMND } from '../../../../shared/identite';
import { CODE_MOMOPAY } from '../../../../shared/momopay-de-la-maison-pur';
import { QrSvg } from '../equipe/Comptoir';

/* ── LE PLEIN ÉCRAN DU COMPTOIR ─────────────────────────────────────────
   Parchemin, marque, le code aussi grand que l'écran le permet. On le tourne
   vers la cliente ; un toucher n'importe où — ou Échap — le referme.

   SON FICHIER À LUI depuis le 24 octobre 2026 : la page QR codes l'ouvre, et
   Encaisser aussi (« Montrer le QR à la cliente »), sans charger la page.
   Ouvert depuis une fenêtre, il se pose sur le corps de la page (un parent
   transformé enfermerait un `position: fixed`), et Échap ne ferme QUE lui :
   il écoute avant la fenêtre d'Encaisser et arrête la touche. */

/* Ce qu'un code montre quand il occupe tout l'écran. */
export type Grand = {
  titre: string;
  phrase: string;
  valeur: string;
  /** L'AFFICHE DE LA MAISON, à la place du carré nu — 18 août 2026. Yéman a
      fait faire une affiche MoMoPay à ses couleurs : la montrer entière vaut
      mieux qu'un QR posé sur du blanc, parce qu'elle dit déjà le marchand, le
      code USSD et le geste. Absente ailleurs : les réseaux Wi-Fi n'en ont pas. */
  affiche?: string;
  /** Ce que l'affiche dit, pour qui ne la voit pas (23 octobre 2026 : deux
      affiches désormais, MoMoPay et KkiaPay). */
  afficheAlt?: string;
};

export function AuComptoir({ g, onClose }: { g: Grand; onClose: () => void }) {
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', surTouche, true);
    return () => window.removeEventListener('keydown', surTouche, true);
  }, [onClose]);
  return createPortal(
    <div
      onClick={onClose}
      role="dialog"
      aria-label={`${g.titre}, plein écran`}
      style={{
        /* Au-dessus de tout — tiroirs (z-modal+1) et toasts (z-modal+5). */
        position: 'fixed', inset: 0, zIndex: 120,
        background: '#F6F1E7', cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '24px 20px', animation: 'mnd-fade var(--dur-base) var(--ease-soft)',
      }}
    >
      {estLaMaisonMND(maisonNom()) ? (
        /* Le verrou, jamais sous son plancher : 150 px au plus petit. */
        <img
          src={asset('assets/verrous/verrou-couche-indigo.png')}
          alt={maisonNom()}
          style={{ width: 'clamp(150px, 18vw, 260px)', height: 'auto', display: 'block' }}
        />
      ) : (
        <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '.34em', color: '#1E2150' }}>
          {maisonNom().toUpperCase()}
        </div>
      )}
      <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 'clamp(30px, 5vw, 46px)', color: '#1E2150', margin: '12px 0 2px', textAlign: 'center' }}>
        {g.titre}
      </div>
      <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 'clamp(15px, 2.2vw, 20px)', color: '#45454F', textAlign: 'center', maxWidth: '46ch', lineHeight: 1.5 }}>
        {g.phrase}
      </div>
      {g.affiche ? (
        /* L'AFFICHE DE LA MAISON — 19 octobre 2026. « Recrée un poster, épuré
           et avec les couleurs de la charte » (Yéman) : le compte MoMoPay de
           MAISON MND (code 909099), ivoire, indigo et cuivre, le QR dedans.
           L'ancienne (noir et or, « YEMAN » gravé, recouvert d'un panneau
           ACIA1) est rangée au Drive, 99 · Archives › Anciennes affiches. */
        <img
          src={asset(g.affiche)}
          alt={g.afficheAlt ?? `Régler par MTN MoMo, code marchand ${CODE_MOMOPAY}, MAISON MND`}
          style={{ height: 'min(66vh, 96vw)', width: 'auto', borderRadius: 4, boxShadow: '0 2px 18px rgba(30,33,80,.13)', display: 'block', margin: '22px 0 14px' }}
        />
      ) : (
        <div style={{ width: 'min(64vw, 56vh)', height: 'min(64vw, 56vh)', margin: '26px 0 14px' }}>
          <QrSvg valeur={g.valeur} style={{ width: '100%', height: '100%', display: 'block' }} />
        </div>
      )}
      <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 14, color: '#9E6238' }}>
        {DEVISE_COMPLETE}
      </div>
      <div style={{ position: 'absolute', bottom: 16, fontSize: 11.5, color: '#8a8a93', letterSpacing: '.08em' }}>
        toucher l’écran pour fermer · Échap
      </div>
    </div>,
    document.body,
  );
}
