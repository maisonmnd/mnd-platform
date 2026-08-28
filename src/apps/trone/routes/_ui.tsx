import { useMemo, type ReactNode, type CSSProperties } from 'react';
import { Eyebrow } from '../../../ds/components';
import { signeLeMessage } from '../../../shared/identite';
import { useCategories, type Service } from '../../../shared/catalog';
import { fmtMoney } from '../../../shared/currency';

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

/** Un lien WhatsApp prêt à l'emploi : ouvre WhatsApp avec le numéro et un
    message pré-écrit (signé de la devise). Ne s'affiche pas sans numéro joignable. */
export function WaLien({ phone, message, children = 'WhatsApp', style }: {
  phone?: string;
  message: string;
  children?: ReactNode;
  style?: CSSProperties;
}) {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (!digits) return null;
  return (
    <a
      href={`https://wa.me/${digits}?text=${encodeURIComponent(signeLeMessage(message))}`}
      target="_blank"
      rel="noreferrer"
      style={{ textDecoration: 'none', ...style }}
    >
      {children}
    </a>
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
