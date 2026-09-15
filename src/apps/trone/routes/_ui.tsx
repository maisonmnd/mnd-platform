import { useMemo, type ReactNode, type CSSProperties } from 'react';
import { Eyebrow } from '../../../ds/components';
import { signeLeMessage } from '../../../shared/identite';
import { useCategories, type Service } from '../../../shared/catalog';
import { fmtMoney } from '../../../shared/currency';
import { Link } from 'react-router-dom';
import { cheminDeLaConversation } from '../../../shared/conversations';

/* ── LE CHOIX D'UNE PRESTATION, RANGÉ PAR ATELIER — 28 août 2026 ────────
   « Ça va dans tous les sens et je ne me retrouve pas facilement. Partout où
   je dois sélectionner des prestations, assure-toi de bien organiser la
   sélection » (Yéman).

   Huit écrans offraient la même liste à plat, dans l'ordre où le catalogue
   les rendait — c'est-à-dire aucun. Une soixantaine de lignes où VÈKPÈ™,
   GBÈJÍ™ et le styling se succédaient sans logique : pour trouver un soin, il
   fallait tout lire.

   LES ATELIERS SONT DÉJÀ LA CARTE MENTALE DE LA MAISON. Ils nomment les
   prestations, ils structurent le catalogue, ils sont dans la bouche de
   l'équipe. Les groupes du menu sont donc les ateliers, dans LEUR ordre à eux
   (`order`), et les prestations sont alphabétiques à l'intérieur.

   UN SEUL COMPOSANT pour les huit écrans : huit tris copiés auraient divergé
   au premier ajout de catégorie, comme la devise avant d'avoir sa source. */
export function OptionsPrestations({ services, exclure, prix, devise }: {
  services: readonly Service[];
  /** Les prestations déjà choisies ailleurs, à ne plus proposer. */
  exclure?: (s: Service) => boolean;
  /** Affiche le prix après le nom — utile en facturation, inutile en quota. */
  prix?: boolean;
  devise?: string;
}) {
  const [cats] = useCategories();

  const groupes = useMemo(() => {
    const gardees = services.filter((s) => !exclure?.(s));
    const par = new Map<string, Service[]>();
    for (const s of gardees) {
      const cle = s.categoryId || '·hors·';
      const liste = par.get(cle);
      if (liste) liste.push(s); else par.set(cle, [s]);
    }
    const rang = new Map(cats.map((c, i) => [c.id, c.order ?? i]));
    const titre = (id: string) => {
      const c = cats.find((x) => x.id === id);
      if (!c) return 'Hors atelier';
      /* « VÈKPÈ™ · Pose & structure » — la marque fon d'abord, elle est ce que
         l'équipe prononce ; le libellé français désambiguïse. */
      return c.fon ? (c.label ? `${c.fon} · ${c.label}` : c.fon) : (c.label || 'Atelier');
    };
    return [...par.entries()]
      .map(([id, liste]) => ({
        id,
        titre: titre(id),
        /* Sans atelier connu, on passe en dernier : ce sont les orphelines. */
        rang: rang.get(id) ?? (id === '·hors·' ? 9999 : 9998),
        liste: [...liste].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
      }))
      .sort((a, b) => a.rang - b.rang || a.titre.localeCompare(b.titre, 'fr'));
  }, [services, cats, exclure]);

  return (
    <>
      {groupes.map((g) => (
        <optgroup key={g.id} label={g.titre}>
          {g.liste.map((s) => (
            <option key={s.id} value={s.id}>
              {prix ? `${s.name} · ${fmtMoney(s.priceXof, devise ?? 'XOF')}` : s.name}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

/** LE PICTOGRAMME DE WHATSAPP — monochrome, il prend la couleur du texte.

    IL DESCEND ICI LE 15 SEPTEMBRE : il vivait dans `Customers.tsx`, et les
    Conversations en avaient besoin à leur tour. Deux copies d'un même dessin
    finissent par ne plus se ressembler — celle qu'on corrige, et l'autre. */
export const WaGlyph = ({ taille = 13 }: { taille?: number }) => (
  <svg viewBox="0 0 24 24" width={taille} height={taille} fill="currentColor" aria-hidden="true">
    <path d="M17.5 14.4c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.66.15-.2.29-.76.96-.93 1.16-.17.2-.34.22-.63.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.06-.17-.3-.02-.46.13-.6.13-.13.3-.34.44-.51.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.66-1.6-.9-2.18-.24-.57-.48-.5-.66-.5l-.56-.01c-.2 0-.51.07-.78.36-.27.29-1.02 1-1.02 2.42s1.05 2.8 1.19 3c.15.2 2.06 3.14 4.99 4.4.7.3 1.24.48 1.66.62.7.22 1.34.19 1.84.11.56-.08 1.75-.71 1.99-1.4.25-.69.25-1.28.17-1.4-.07-.12-.26-.19-.55-.34zM12.03 21.3a9.2 9.2 0 0 1-4.68-1.28l-.34-.2-3.48.91.93-3.39-.22-.35a9.15 9.15 0 0 1-1.4-4.87 9.19 9.19 0 0 1 9.2-9.17 9.14 9.14 0 0 1 9.17 9.19 9.19 9.19 0 0 1-9.18 9.16zm7.82-16.99A11.1 11.1 0 0 0 12.02.99C5.94.99 1 5.93.99 12a11 11 0 0 0 1.47 5.5L.9 23.2l5.84-1.53a11.1 11.1 0 0 0 5.28 1.35h.01c6.07 0 11.02-4.94 11.02-11.01a10.94 10.94 0 0 0-3.2-7.7z" />
  </svg>
);

/** Un lien WhatsApp prêt à l'emploi : ouvre SA CONVERSATION DANS LE TRÔNE,
    le message pré-écrit déjà posé dans la zone de saisie (signé de la
    devise). Ne s'affiche pas sans numéro joignable.

    ── ON NE SORT PAS DU TRÔNE — 14 septembre 2026 ───────────────────
    « Ne sors pas du Trône. Tu ouvres WhatsApp directement dans le Trône »
    (Yéman). Ce lien ouvrait `wa.me` : un onglet de plus, une autre
    application, et surtout un message écrit AILLEURS — le Trône n'en gardait
    aucune trace, la cliente répondait dans un fil que la Maison ne voyait
    pas, et la conversation se coupait en deux. Depuis le 11 septembre le
    Trône sait parler ; il n'y a plus de raison d'en sortir. */
export function WaLien({ phone, message, children = 'WhatsApp', style }: {
  phone?: string;
  message: string;
  children?: ReactNode;
  style?: CSSProperties;
}) {
  const vers = cheminDeLaConversation(phone, signeLeMessage(message));
  if (!vers) return null;
  return (
    <Link to={vers} style={{ textDecoration: 'none', ...style }}>
      {children}
    </Link>
  );
}

/** En-tête de page standard du Trône. */
export function PageHead({ eyebrow, title, sub, actions }: { eyebrow: ReactNode; title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className={`tr-page-head${actions ? ' tr-page-head--actions' : ''}`}>
      <div className="tr-page-head__head">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2>{title}</h2>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {actions && <div className="tr-page-head__actions">{actions}</div>}
    </div>
  );
}
