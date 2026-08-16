import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHead } from '../_ui';
import { Button, Field, Input, Modal, Select, Textarea } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { racineOf, sousArbreOf, LONGUEURS, suitLongueur, type LongueurId, type ServiceInclus, type TarifMode,
  useCategories, useServices, useProducts, catsDansLOrdre, mondeDeCat, mondeLabel,
  QUATRE_TEMPS, fmtDuration, priceModeOf, PRICE_MODES,
  markServiceRemoved, MAISONS,
  type CatalogCategory, type Service, type Product, type PriceMode, type Maison,
} from '../../../../shared/catalog';
import { uid } from '../../../../shared/store';
import { appointmentsStore, useAppointments } from '../../../../shared/agenda';
import { useClients } from '../../../../shared/clients';
import { apptNetXof, useServicesById, DrillModal, dayOf, todayISO, type Drill } from '../clients/_shared';
import { scalesWithModel, useModelBands, useBandSets, bandRange, sortedBands, forfaitPriceXof, regimeTarifaire, gestesDe, type PersonalPricing, type ModelBand } from '../../../../shared/pricing';
import { FILL_DESCRIPTIONS, REWRITE_DESCRIPTIONS, DESC_REV } from './serviceDescriptions';
import { bougerStockGamme, corrigerStockGamme, litQuantite } from '../../../../shared/stock';
import './vente.css';

/* Catalogue — double nomenclature fon™. Catégories réordonnables, activables,
   éditables et supprimables ; prestations et produits Maison éditables au fauteuil.
   Les produits partagent productsStore avec le Laboratoire (gamme & stock). */

const PALIERS: Service['palier'][] = ['Fondation', 'Élévation', 'Souveraineté'];

/** Une ligne du détail d'usage d'une prestation — un rituel qui la portait. */
type UsageRow = {
  date: string;
  who: string;
  /** Part du net attribuée à CETTE prestation (absente pour un RDV à venir). */
  amount?: number;
  upcoming?: boolean;
  /** Le rituel portait plusieurs prestations : le montant est une part. */
  combined?: boolean;
  invoiceId?: string;
};

type SvcForm = {
  id: string | null;
  categoryId: string;
  name: string;
  description: string;
  price: string;
  priceMode: PriceMode;
  palier: Service['palier'];
  durationMin: string;
  sessions: number;
  master: string;
  /* — arborescence v6 — */
  code: string; // ATL·II·MIN·E
  rate: string; // tarif au lock (F/lock) — vide = pas de prix au lock
  tarifMode: '' | TarifMode; // qui commande : '' = comportement historique
  /** LE MODÈLE DE PRIX — UN SEUL COMMANDE (13 août, demande de Yéman). Le
      formulaire empilait tarif au lock, planchers et grille longueur comme
      trois réglages cumulables : on ne savait jamais lequel jouait. Le choix
      est désormais EXCLUSIF : seuls les champs du modèle choisi s'affichent,
      et l'enregistrement EFFACE les systèmes des autres modèles. */
  modele: 'fixe' | 'modele' | 'lock' | 'calibre' | 'longueur';
  /** LES CALIBRES QU'ELLE SERT (13 août — deux créations prixées en même
      temps : Création Medium ne portait pas la restriction de ses sœurs, et
      AUCUN champ ne permettait de la poser). Vide = toutes les têtes. */
  bandIds: string[];
  /** Réservée aux comptes famille (14 août — le Pack Famille). */
  reserveFamilles: boolean;
  /** LES GESTES DE LA MAISON (15 août) — elle perd `pct` % de son prix quand
      l'une de ces prestations est au même rituel, pour ces calibres (vide =
      tous). Une LISTE : le shampoing est offert avec une Reprise ET à moitié
      prix avec une coloration. */
  gestes: { serviceIds: string[]; bandIds: string[]; pct: string }[];
  /** LE SALON SOUVERAIN (15 août) — elle ferme la Maison, et pour combien de
      têtes au plus. Le plafond se règle ici : deux aujourd'hui, autre chose
      demain, sans passer par le code. */
  privatise: boolean;
  maxTetes: string;
  includes: ServiceInclus[]; // prestations reellement couvertes par un forfait
  forfaitRemise: string; // remise du forfait, en % de sa composition
  estForfait: boolean; // un forfait porte une composition ; une prestation, non
  floors: Record<string, string>; // plancher par calibre, saisi en texte
  durationMax: string; // borne haute quand la durée s'annonce en fourchette
  priceTo: string; // borne haute d'affichage — « de X à Y »
  /* — la longueur — un prix et une durée par longueur travaillée, saisis en
       texte. Vides partout = prestation à prix unique. */
  prixLong: Partial<Record<LongueurId, string>>;
  dureeLong: Partial<Record<LongueurId, string>>;
  /* — LE TARIF AU LOCK, PAR LONGUEUR (16 août) — renseigné, il prime sur le
       tarif unique, et `prixLong` devient le PLANCHER de chaque longueur. */
  tarifLong: Partial<Record<LongueurId, string>>;
};

const emptySvcForm = (categoryId: string, master: string, estForfait = false): SvcForm => ({
  id: null, categoryId, name: '', description: '', price: '', priceMode: 'fixe', palier: 'Fondation', durationMin: '60', sessions: 1, master,
  code: '', rate: '', tarifMode: '', includes: [], forfaitRemise: '', estForfait, floors: {}, durationMax: '', priceTo: '',
  prixLong: {}, dureeLong: {}, tarifLong: {}, modele: 'fixe', bandIds: [], reserveFamilles: false, gestes: [], privatise: false, maxTetes: '2',
});

/** Le modèle de prix ACTUEL d'une prestation — dérivé du même juge que les
    étiquettes ; tout ce qui n'est pas un des quatre systèmes retombe sur fixe. */
const modeleDe = (svc: Service): SvcForm['modele'] => {
  const k = regimeTarifaire(svc).k;
  return k === 'lock' || k === 'calibre' || k === 'longueur' || k === 'modele' ? k : 'fixe';
};

/** LA COMPOSITION COMMANDE-T-ELLE LE PRIX ? (15 août — « où est passé prix par
    longueur ? court, mi-long et long ? »)

    PORTER UNE COMPOSITION N'EST PAS ÊTRE PRICÉ PAR ELLE. Le formulaire tenait
    pour forfait TOUTE prestation portant un `includes`, et lui fermait alors
    les cinq modèles de prix — grille par longueur comprise. Or trois fiches du
    catalogue portent un geste inclus (un soin protéiné à deux semaines) SANS
    remise de forfait et avec leur prix propre : le moteur, lui, ne fait pas
    l'erreur — `forfaitPriceXof` rend `undefined` faute de remise, et le prix
    retombe sur la grille par longueur. Deux d'entre elles portaient DÉJÀ leurs
    trois longueurs (37 000 / 55 000 / 64 500) : invisibles à l'écran, et
    EFFACÉES au premier enregistrement, puisque l'écriture n'écrit que le
    système du modèle et qu'aucun modèle n'était choisi.

    Le juge est donc CELUI DU MOTEUR, mot pour mot : la composition commande
    quand une remise est posée, ou quand le prix propre est à zéro. Sinon la
    fiche garde ses modèles de prix. */
const prixParComposition = (f: SvcForm): boolean =>
  f.estForfait && (f.forfaitRemise.trim() !== '' || (parseInt(f.price.replace(/[^0-9]/g, ''), 10) || 0) === 0);

/** Champs numériques du formulaire : « 45 000 » comme « 45000 » donnent 45000 ;
    une saisie vide rend undefined pour que le champ DISPARAISSE de la fiche au
    lieu d'y écrire un zéro qui vaudrait « gratuit ». */
const num = (s: string): number | undefined => {
  const n = parseInt(String(s).replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** Un barème par longueur, débarrassé de ses cases vides. Rend `undefined` quand
    il ne reste rien — la prestation retrouve alors son prix unique au lieu de
    porter un objet vide qui la ferait passer pour tarifée à la longueur. */
const nettoie = (saisi: Partial<Record<LongueurId, string>>): Partial<Record<LongueurId, number>> | undefined => {
  const garde = Object.entries(saisi)
    .map(([k, v]) => [k, num(v ?? '')] as const)
    .filter(([, v]) => v !== undefined) as [LongueurId, number][];
  return garde.length ? Object.fromEntries(garde) : undefined;
};


/** UN BLOC DE LA FICHE — un titre bref, et ce qu'il contient.

    La fiche etait une colonne de vingt champs, chacun suivi de son paragraphe
    d'explication : elle se lisait comme une notice, pas comme un outil. Les
    blocs disent ou l'on se trouve ; les explications qui restent tiennent en
    une ligne, a cote du titre, la ou on les cherche. */
/** LES SIX RUBRIQUES DE LA FICHE (15 août — maquette validée). Chacune porte
    une question, pas un degré de difficulté : « avancée » ne disait pas ce
    qu'on y trouvait, seulement que c'était rare. */
const RUBRIQUES = [
  { k: 'identite', t: 'L’identité' },
  { k: 'prix', t: 'Le prix' },
  { k: 'temps', t: 'Le temps' },
  { k: 'contient', t: 'Ce qu’elle contient' },
  { k: 'tetes', t: 'Qui peut la prendre' },
  { k: 'gestes', t: 'Les gestes' },
] as const;
type Rubrique = (typeof RUBRIQUES)[number]['k'];

function Bloc({ titre, aide, children }: { titre: string; aide?: string; children: ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', paddingBottom: 6, borderBottom: '1px solid var(--line)' }}>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--copper-700)', fontWeight: 600 }}>
          {titre}
        </span>
        {aide && <span className="mnd-muted" style={{ fontSize: 11.5 }}>{aide}</span>}
      </div>
      {children}
    </section>
  );
}

/** UN BLOC QU'ON DEPLIE. Ce que la Maison regle une fois puis ne retouche
    jamais n'a pas a occuper la fiche en permanence. Replie, il annonce ce
    qu'il contient : rien ne se cache derriere un titre muet. */
function BlocPliant({ titre, resume, ouvert, onBascule, children }:
  { titre: string; resume: string; ouvert: boolean; onBascule: () => void; children: ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: ouvert ? 14 : 0 }}>
      <button
        type="button"
        onClick={onBascule}
        style={{
          display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', width: '100%',
          paddingBottom: 6, borderBottom: '1px solid var(--line)', background: 'none',
          border: 'none', borderBottomStyle: 'solid', borderBottomWidth: 1, borderBottomColor: 'var(--line)',
          textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit',
        }}
      >
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--copper-700)', fontWeight: 600 }}>
          {ouvert ? '▾' : '▸'} {titre}
        </span>
        <span className="mnd-muted" style={{ fontSize: 11.5 }}>{resume}</span>
      </button>
      {ouvert && children}
    </section>
  );
}

type CatForm = { id: string | null; fon: string; label: string; enabled: boolean; maison: Maison | ''; code: string; parentId: string };

type ProdForm = { id: string | null; categoryId: string; name: string; price: string; stock: string };
const emptyProdForm = (categoryId: string): ProdForm => ({ id: null, categoryId, name: '', price: '', stock: '0' });

export default function Catalogue() {
  const { branch, currency } = useBranch();
  const [categories, setCategories] = useCategories();
  const [services, setServices] = useServices();
  /* La rubrique ouverte. Toute fiche s'ouvre sur son identité — on relit un
     nom bien plus souvent qu'on ne refait un barème. */
  const [rubrique, setRubrique] = useState<Rubrique>('identite');
  const [products, setProducts] = useProducts();
  /* Les calibres, triés : ils commandent la saisie des planchers du tarif au lock. */
  const [rawBands] = useModelBands();
  const bands = sortedBands(rawBands);
  /* Les barèmes par atelier — l'aperçu du prix d'un forfait PAR MODÈLE doit
     traverser les mêmes coefficients que la réservation (VÈKPÈ a les siens). */
  const [bandSets] = useBandSets();

  const [svcForm, setSvcForm] = useState<SvcForm | null>(null);
  /* LE BLOC DES LONGUEURS EST REPLIE PAR DEFAUT. Une trentaine de prestations
     sur soixante-quatorze se facturent a la longueur ; sur toutes les autres —
     une manucure, une formation de l'Academie, une vente de produit — trois
     lignes de cases vides ne disaient rien et encombraient la fiche. Le repli
     vaut mieux qu'une regle « telle categorie n'y a pas droit » : une regle
     pareille se trompe le jour ou l'exception se presente. */
  /* La tarification avancee : repliee par defaut, ouverte
     d'elle-meme quand la prestation en porte deja. */
  const [avanceOuverte, setAvanceOuverte] = useState<string | null>(null);
  const [catForm, setCatForm] = useState<CatForm | null>(null);
  /* L'atelier qu'on programme au comptage — son identifiant, ou null. */
  const [progAtelier, setProgAtelier] = useState<string | null>(null);
  const [prodForm, setProdForm] = useState<ProdForm | null>(null);
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  /* LE REGROUPEMENT PAR RÉGIME (13 août — « tous les services qui dépendent du
     Juste Prix doivent être regroupés »). Un filtre montre le catalogue entier
     réduit aux prestations du régime choisi, toujours rangées par atelier, et
     se comporte comme une recherche : catégories vides masquées, tout déplié. */
  /* `?regime=` : les Systèmes de prix (Finances › Le Juste Prix) ouvrent le
     Catalogue directement filtré sur un système. */
  const [regimeFiltre, setRegimeFiltre] = useState<'tout' | 'jp' | 'modele' | 'lock' | 'calibre' | 'longueur' | 'hors'>(() => {
    const r = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('regime');
    return r === 'jp' || r === 'modele' || r === 'lock' || r === 'calibre' || r === 'longueur' || r === 'hors' ? r : 'tout';
  });

  /* ----- Le point d'usage : ce que chaque prestation a réellement servi -----
     Par prestation : rituels honorés, RDV à venir, et part du chiffre encaissé
     (net du RDV ventilé au prorata des prix catalogue quand un rituel combine
     plusieurs prestations — la somme des parts égale toujours le net). Toutes
     branches confondues : le catalogue est celui de la maison entière. */
  const navigate = useNavigate();
  const [allAppts] = useAppointments();
  const [clients] = useClients();
  const svcById = useServicesById();
  const clientNameOf = (id: string) => clients.find((c) => c.id === id)?.name ?? 'Cliente de passage';
  /* Détail ouvert sur le chiffre d'une prestation. */
  const [drill, setDrill] = useState<Drill | null>(null);
  const usage = useMemo(() => {
    const today = todayISO();
    /* `rows` garde le DÉTAIL derrière chaque total : sans lui, deux prestations
       de même nom affichent deux chiffres d'affaires sans qu'on puisse voir ce
       qui les compose — un chiffre qu'on ne peut pas ouvrir n'est pas un chiffre,
       c'est une rumeur. */
    const m = new Map<string, { done: number; upcoming: number; rev: number; rows: UsageRow[] }>();
    const at = (id: string) => {
      let u = m.get(id);
      if (!u) { u = { done: 0, upcoming: 0, rev: 0, rows: [] }; m.set(id, u); }
      return u;
    };
    for (const a of allAppts) {
      if (a.status === 'annulé' || a.serviceIds.length === 0) continue;
      if (a.status === 'honoré') {
        const net = apptNetXof(a, svcById);
        const prices = a.serviceIds.map((id) => svcById.get(id)?.priceXof ?? 0);
        const totalP = prices.reduce((s, x) => s + x, 0);
        /* UN rituel = UNE ligne par prestation. Quand `serviceIds` porte deux
           fois le même identifiant, parcourir la liste telle quelle empilait
           deux lignes jumelles et comptait le rituel deux fois — dans
           « honorés » comme dans le chiffre. On CUMULE les parts par
           prestation, en gardant le prorata sur la liste COMPLÈTE : la somme
           des parts égale toujours le net du rituel.
           (Attention : deux lignes de MONTANTS DIFFÉRENTS pour une même
           cliente ne viennent pas d'ici — ce sont deux rendez-vous distincts,
           possiblement dupliqués à l'import. Voir le bloc ③ de
           supabase/fix_appointment_dates.sql.) */
        const partById = new Map<string, number>();
        a.serviceIds.forEach((id, i) => {
          const part = totalP > 0 ? (net * prices[i]) / totalP : net / a.serviceIds.length;
          partById.set(id, (partById.get(id) ?? 0) + part);
        });
        for (const [id, part] of partById) {
          const u = at(id);
          u.done += 1;
          u.rev += part;
          u.rows.push({
            date: a.date,
            who: a.clientName ?? clientNameOf(a.clientId),
            amount: Math.round(part),
            combined: partById.size > 1,
            invoiceId: a.invoiceId,
          });
        }
      } else if (dayOf(a.date) >= today) {
        /* Même règle : un identifiant répété ne fait pas deux rendez-vous. */
        const uniq = new Set(a.serviceIds);
        for (const id of uniq) {
          const u = at(id);
          u.upcoming += 1;
          u.rows.push({
            date: a.date,
            who: a.clientName ?? clientNameOf(a.clientId),
            upcoming: true,
            combined: uniq.size > 1,
          });
        }
      }
    }
    /* Tri sur le JOUR normalisé : comparer des horodatages complets à des jours
       nus rangeait les rituels migrés au hasard. */
    for (const u of m.values()) u.rows.sort((x, y) => {
      const a2 = dayOf(x.date), b2 = dayOf(y.date);
      return a2 < b2 ? 1 : a2 > b2 ? -1 : 0;
    });
    return m;
  }, [allAppts, svcById, clients]);

  /* LES SEMENCES SONT RETIRÉES — 30 juillet 2026.
     Ici s'appelaient `ensureConsultationCategory()` et `ensureStarterServices()`
     à chaque ouverture de l'écran. Elles garnissaient une maison neuve, ce qui
     est utile UNE fois et néfaste ensuite : elles ne savent pas distinguer
     « catalogue vide parce que neuf » de « catalogue vide parce que la Maison
     l'a voulu » — ni de « pas encore hydraté ».
     Le 30 juillet, après une remise à zéro vérifiée à zéro, ouvrir cet écran a
     recréé 94 prestations et la catégorie ÐÓTÓ™. Le seul garde-fou existant, le
     drapeau `HOUSE_BLANK`, vit dans le localStorage : il est donc PAR APPAREIL,
     invisible, et perdu au moindre nettoyage du navigateur. Un garde-fou qu'on
     peut oublier n'en est pas un.
     Les deux fonctions restent exportées par shared/catalog.ts pour une
     éventuelle action explicite (« garnir la Maison »), mais l'écran n'écrit
     plus jamais de prestation de lui-même. */

  /* Descriptions signées (voix de la Maison). Dépend de `services` pour s'appliquer
     une fois le catalogue hydraté ; idempotent (renvoie la même référence si rien à
     faire → pas de boucle). Deux passages :
       · FILL — ne remplit QUE les descriptions vides ;
       · REWRITE — réécrit UNE FOIS (via descRev), puis ne retouche plus, ce qui
         préserve les retouches manuelles ultérieures. */
  useEffect(() => {
    setServices((prev) => {
      let changed = false;
      const next = prev.map((s) => {
        const rw = REWRITE_DESCRIPTIONS[s.id];
        if (rw && s.descRev !== DESC_REV) { changed = true; return { ...s, description: rw, descRev: DESC_REV }; }
        const fill = FILL_DESCRIPTIONS[s.id];
        if (fill && !(s.description && s.description.trim())) { changed = true; return { ...s, description: fill }; }
        return s;
      });
      return changed ? next : prev;
    });
    /* Micro-corrections de données, idempotentes : la faute « Perfectionement »
       (visible cliente ET comptoir) et le sur-mesure resté « fixe · 0 F » alors
       qu'il est sur devis — la caisse l'affichait 0 F, encaissable tel quel. */
    setServices((prev) => {
      let changed = false;
      const next = prev.map((s) => {
        if (s.name.includes('Perfectionement')) { changed = true; return { ...s, name: s.name.replace(/Perfectionement/g, 'Perfectionnement') }; }
        if (s.id === 'mx8npm3zn9' && priceModeOf(s) !== 'devis' && (s.priceXof ?? 0) === 0) {
          changed = true;
          return { ...s, priceMode: 'devis' as const, hidePrice: true };
        }
        return s;
      });
      return changed ? next : prev;
    });
  }, [services, setServices]);

  const masters = branch.masters;

  /* LES QUATRE ENSEMBLES DU CATALOGUE. 24 catégories à la suite, c'est un mur :
     on ne voit plus ni le Studio ni le plateau, noyés au milieu de l'Atelier.
     Le regroupement suit l'arborescence v6 — deux maisons, un plateau commun,
     et l'Académie à part.

     LES LIGNES DE PRODUITS SONT DU PLATEAU. Elles avaient leur propre ensemble,
     « LA GAMME » : une troisième colonne qui ne correspondait à rien de la
     maison. Un pot de crème se vend depuis l'Atelier comme depuis le Studio,
     exactement comme un soin annexe — c'est la définition du plateau. */
  const groupeDe = (c: CatalogCategory): { k: string; titre: string; sous: string } => {
    /* LA MAISON EST CELLE DE L'ATELIER, JAMAIS DE LA FAMILLE. Une famille — les
       KLƆKLƆ™, les Soins, les Retouches — ne porte pas de maison : elle la tient
       de l'atelier qui la contient. Lire `c.maison` a plat rangeait donc les six
       familles creees le 5 aout dans LE PLATEAU TECHNIQUE, et comme l'ordre de
       l'arbre les intercale entre leurs ateliers, l'ecran rouvrait un titre
       d'ensemble a chaque famille : trois « PLATEAU TECHNIQUE » sur une meme
       page, et les KLƆKLƆ™ coupes des SINSIN™ auxquels ils appartiennent. */
    const r = racineOf(categories, c.id) ?? c;
    if (r.maison === 'atelier') return { k: 'atelier', titre: 'ATELIER MND™', sous: 'Les locks exclusivement' };
    if (r.maison === 'studio') return { k: 'studio', titre: 'STUDIO MND · ACƆ™', sous: 'Le cheveu afro dans tous ses styles' };
    if (r.id.startsWith('aca-')) return { k: 'academie', titre: 'MND ACADÉMIE', sous: 'La transmission' };
    return { k: 'plateau', titre: 'LE PLATEAU TECHNIQUE', sous: 'Commun aux deux maisons — rituels annexes et lignes de produits' };
  };

  /* L'ORDRE DE L'ARBRE : les deux maisons, ce qu'elles partagent, puis l'école ;
     et dans chaque ensemble, chaque atelier suivi de ses familles.

     L'ENSEMBLE COMMANDE AVANT `order`. Le titre d'ensemble se pose sur la
     PREMIÈRE catégorie de son groupe : si deux categories d'un même ensemble
     sont séparées par une troisième d'un autre, le titre se rouvre — on a vu
     trois « PLATEAU TECHNIQUE » sur une même page. Trier d'abord par ensemble
     garantit un seul titre chacun, quels que soient les rangs saisis.

     Une famille orpheline (atelier supprimé) remonte au rang des ateliers
     plutôt que de disparaître. */
  const RANG_ENSEMBLE: Record<string, number> = { atelier: 0, studio: 1, plateau: 2, academie: 3 };
  const cats = useMemo(() => {
    const rang = [...categories].sort((a, b) => a.order - b.order);
    const racines = rang.filter((c) => !c.parentId || !categories.some((p2) => p2.id === c.parentId));
    /* `sort` est stable : à ensemble égal, l'ordre saisi est conservé. */
    const parEnsemble = [...racines].sort(
      (a, b) => (RANG_ENSEMBLE[groupeDe(a).k] ?? 9) - (RANG_ENSEMBLE[groupeDe(b).k] ?? 9),
    );
    return parEnsemble.flatMap((r) => [r, ...rang.filter((c) => c.parentId === r.id)]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories]);

  /* LES PRESTATIONS RANGÉES COMME AU RENDEZ-VOUS (15 août — « organise la
     liste des services dans Catalogue pour qu'on se retrouve facilement comme
     dans RDV »). Le sélecteur de déclencheurs listait les 60 prestations à la
     file, dans l'ordre brut du magasin : on cherchait un shampoing entre une
     pédicure et un module. Même rangement que la modale de rendez-vous —
     par monde, puis par atelier, chacun dans son ordre saisi. */
  const prestaParAtelier = useMemo(() => {
    const rangees = catsDansLOrdre(categories)
      .map((c) => ({
        cat: c,
        list: services.filter((sv) => sv.categoryId === c.id).sort((a, b) => a.order - b.order),
      }))
      .filter((g) => g.list.length);
    const orphelines = services
      .filter((sv) => !categories.some((c) => c.id === sv.categoryId))
      .sort((a, b) => a.order - b.order);
    return { rangees, orphelines };
  }, [categories, services]);

  /* Replier tout un ensemble d'un geste : c'est ce qui rend les 24 catégories
     tenables à l'écran. */
  const toggleGroupe = (k: string) => {
    const ids = cats.filter((c) => groupeDe(c).k === k).map((c) => c.id);
    const tout = ids.every((id) => collapsed.has(id));
    setCollapsed((prev) => {
      const n = new Set(prev);
      ids.forEach((id) => (tout ? n.delete(id) : n.add(id)));
      return n;
    });
  };

  /* Recherche + repli — le catalogue peut être dense ; on aide à s'y retrouver.
     Une recherche déplie tout et masque les catégories sans correspondance. */
  const q = query.trim().toLowerCase();
  /* Le régime d'une prestation contre le filtre — MÊME juge que l'étiquette. */
  const matchRegime = (s: Service): boolean => {
    if (regimeFiltre === 'tout') return true;
    const r = regimeTarifaire(s, cats);
    if (regimeFiltre === 'jp') return r.justePrix;
    if (regimeFiltre === 'hors') return !r.justePrix;
    return r.k === regimeFiltre;
  };
  /* Un filtre actif (recherche OU régime) masque les catégories vides. */
  const filtreActif = !!q || regimeFiltre !== 'tout';
  const matchSvc = (s: Service) => (!q || s.name.toLowerCase().includes(q) || (s.description ?? '').toLowerCase().includes(q)) && matchRegime(s);
  /* Les produits de la Gamme ne portent pas de régime tarifaire : un filtre
     par régime les met de côté — on regarde des PRESTATIONS. */
  const matchProd = (p: Product) => (!q || p.name.toLowerCase().includes(q)) && regimeFiltre === 'tout';
  const toggleCollapse = (id: string) =>
    setCollapsed((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allCollapsed = cats.length > 0 && cats.every((c) => collapsed.has(c.id));
  const toggleAll = () => setCollapsed(allCollapsed ? new Set() : new Set(cats.map((c) => c.id)));

  /* Filet de secours : toute prestation/produit dont la catégorie n'existe pas
     (plus) dans la liste apparaît quand même, sous « À reclasser » — sinon elle
     serait invisible au Catalogue alors qu'elle sort bien en caisse. On peut la
     Modifier pour la ranger dans une vraie catégorie. */
  const ORPHAN_ID = '__orphans__';
  const knownCatIds = new Set(cats.map((c) => c.id));
  const orphanSvcs = services.filter((s) => !knownCatIds.has(s.categoryId)).sort((a, b) => a.order - b.order);
  const orphanProds = products.filter((p) => !knownCatIds.has(p.categoryId)).sort((a, b) => a.order - b.order);
  const renderCats: CatalogCategory[] = orphanSvcs.length || orphanProds.length
    ? [...cats, { id: ORPHAN_ID, fon: 'À RECLASSER', label: 'Sans catégorie — à ranger', enabled: true, order: Number.MAX_SAFE_INTEGER }]
    : cats;

  /* — catégories — */
  /* LE VOISIN DE MÊME RANG. La flèche échangeait l'ordre avec la ligne d'à côté
     dans la liste à plat — qui peut appartenir à un autre atelier ou à un autre
     ensemble. Depuis que l'ensemble commande l'affichage, un tel échange ne
     bouge plus rien : le clic semblait ne pas fonctionner. On ne permute donc
     qu'entre voisins de même parent ET de même ensemble, et la flèche
     s'éteint quand il n'y a personne à cette place. */
  const voisinDe = (cat: CatalogCategory, dir: -1 | 1): CatalogCategory | undefined => {
    const memeRang = cats.filter(
      (c) => (c.parentId ?? '') === (cat.parentId ?? '') && groupeDe(c).k === groupeDe(cat).k,
    );
    const i = memeRang.findIndex((c) => c.id === cat.id);
    return i < 0 ? undefined : memeRang[i + dir];
  };
  const moveCat = (cat: CatalogCategory, dir: -1 | 1) => {
    const other = voisinDe(cat, dir);
    if (!other) return;
    setCategories((prev) =>
      prev.map((c) =>
        c.id === cat.id ? { ...c, order: other.order } : c.id === other.id ? { ...c, order: cat.order } : c,
      ),
    );
  };
  const toggleCat = (cat: CatalogCategory) =>
    setCategories((prev) => prev.map((c) => (c.id === cat.id ? { ...c, enabled: !c.enabled } : c)));

  const saveCat = () => {
    if (!catForm || !catForm.fon.trim()) return;
    if (catForm.id) {
      setCategories((prev) => prev.map((c) => (c.id === catForm.id
        ? { ...c, fon: catForm.fon.trim(), label: catForm.label.trim(), enabled: catForm.enabled, maison: catForm.maison || undefined, code: catForm.code.trim() || undefined, parentId: catForm.parentId || undefined }
        : c)));
    } else {
      const maxOrder = cats.reduce((m, c) => Math.max(m, c.order), 0);
      setCategories((prev) => [...prev, { id: uid(), fon: catForm.fon.trim(), label: catForm.label.trim(), enabled: catForm.enabled, order: maxOrder + 1, maison: catForm.maison || undefined, code: catForm.code.trim() || undefined, parentId: catForm.parentId || undefined }]);
    }
    setCatForm(null);
  };

  const deleteCat = (cat: CatalogCategory) => {
    const svcCount = services.filter((s) => s.categoryId === cat.id).length;
    const prodCount = products.filter((p) => p.categoryId === cat.id).length;
    const refs = svcCount + prodCount;
    const warn = refs > 0
      ? `\n\nAttention : ${svcCount} prestation${svcCount > 1 ? 's' : ''} et ${prodCount} produit${prodCount > 1 ? 's' : ''} y sont rattaché${refs > 1 ? 's' : ''} — ils resteront sans catégorie tant que vous ne les réaffectez pas.`
      : '';
    if (!window.confirm(`Supprimer la catégorie « ${cat.fon} · ${cat.label} » ?${warn}`)) return;
    setCategories((prev) => prev.filter((c) => c.id !== cat.id));
  };

  /* — prestations — */
  const svcOf = (catId: string) => services.filter((s) => s.categoryId === catId).sort((a, b) => a.order - b.order);

  const moveSvc = (svc: Service, dir: -1 | 1) => {
    const list = svcOf(svc.categoryId);
    const idx = list.findIndex((s) => s.id === svc.id);
    const other = list[idx + dir];
    if (!other) return;
    setServices((prev) =>
      prev.map((s) =>
        s.id === svc.id ? { ...s, order: other.order } : s.id === other.id ? { ...s, order: svc.order } : s,
      ),
    );
  };
  const patchSvc = (id: string, patch: Partial<Service>) =>
    setServices((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  /* Change vite le mode de prix depuis la carte : Fixe → Variable → Sur devis.
     `hidePrice` suit le mode « devis » (front & caisse s'en servent). */
  const cyclePriceMode = (svc: Service) => {
    const order: PriceMode[] = ['fixe', 'variable', 'devis'];
    const next = order[(order.indexOf(priceModeOf(svc)) + 1) % order.length];
    patchSvc(svc.id, { priceMode: next, hidePrice: next === 'devis' });
  };

  const deleteSvc = (svc: Service) => {
    /* Garde-fou : des RDV référencent peut-être cette prestation — la supprimer
       leur ferait perdre libellé et prix d'affichage (incident du 23 juil. 2026).
       On compte, on prévient, on nomme la conséquence. */
    const refs = appointmentsStore.get().filter((a) => a.serviceIds.includes(svc.id) && a.status !== 'annulé').length;
    const warn = refs > 0
      ? `\n\n⚠ ${refs} rendez-vous du carnet porte${refs > 1 ? 'nt' : ''} cette prestation : ils perdront son libellé et son prix d'affichage (les montants déjà encaissés/figés ne bougent pas). Préférez la MASQUER de la vitrine si vous voulez seulement cesser de la vendre.`
      : '';
    if (!window.confirm(`Supprimer la prestation « ${svc.name} » ? Cette action est définitive.${warn}`)) return;
    /* Pierre tombale AVANT la suppression : les mécanismes de restauration
       (prestations de départ, sauvetage) ne la re-créeront plus jamais. */
    markServiceRemoved(svc.id);
    setServices((prev) => prev.filter((s) => s.id !== svc.id));
  };

  const openSvcEdit = (svc: Service) =>
    setSvcForm({
      id: svc.id, categoryId: svc.categoryId, name: svc.name, description: svc.description ?? '',
      price: String(svc.priceXof), priceMode: priceModeOf(svc), palier: svc.palier, durationMin: String(svc.durationMin), sessions: svc.sessions, master: svc.master,
      code: svc.code ?? '', rate: svc.ratePerLock ? String(svc.ratePerLock) : '', tarifMode: svc.tarifMode ?? '', includes: svc.includes ?? [], estForfait: !!svc.includes?.length, forfaitRemise: svc.forfaitRemisePct !== undefined ? String(svc.forfaitRemisePct) : '',
      floors: Object.fromEntries(Object.entries(svc.priceFloors ?? {}).map(([k, v]) => [k, String(v)])),
      durationMax: svc.durationMaxMin ? String(svc.durationMaxMin) : '',
      priceTo: svc.priceToXof ? String(svc.priceToXof) : '',
      prixLong: Object.fromEntries(Object.entries(svc.prixParLongueur ?? {}).map(([k, v]) => [k, String(v)])),
      dureeLong: Object.fromEntries(Object.entries(svc.dureeParLongueur ?? {}).map(([k, v]) => [k, String(v)])),
      tarifLong: Object.fromEntries(Object.entries(svc.tarifLockParLongueur ?? {}).map(([k, v]) => [k, String(v)])),
      modele: modeleDe(svc),
      /* L'ancien champ simple `bandId` se fond dans la liste à l'ouverture. */
      bandIds: svc.bandIds ?? (svc.bandId ? [svc.bandId] : []),
      reserveFamilles: !!svc.reserveFamilles,
      privatise: !!svc.privatise,
      maxTetes: String(svc.privatise?.maxTetes ?? 2),
      gestes: gestesDe(svc).map((g) => ({
        serviceIds: [...g.serviceIds], bandIds: [...(g.bandIds ?? [])],
        pct: String(Number.isFinite(Number(g.pct)) ? Number(g.pct) : 100),
      })),
    });

  /* LE COMPTE DU FORFAIT. Valeur des prestations retenues au prix catalogue,
     prix demande, et l'ecart entre les deux — la remise que la cliente gagne.
     Les prestations au modele sont comptees a leur prix catalogue : leur vrai
     montant depend de la tete, on le signale plutot que de l'inventer. */
  /* On garde la PAIRE — la ligne du forfait ET la prestation qu'elle designe.
     Filtrer d'abord les prestations introuvables casserait l'alignement avec
     les echeances, et on additionnerait la duree d'une seance a venir dans
     celle de la visite d'ouverture. */
  /* CE QU'UNE LIGNE PEUT COUTER, DU MOINS AU PLUS.

     Le prix d'une prestation varie avec la densite de deux facons, et un
     forfait peut porter les deux :
       · cinq prestations soeurs, une par calibre — les creations VEKPE ;
       · UNE prestation qui porte six planchers — le resserrage SINSIN.
     Prendre le prix catalogue d'une seule d'entre elles donnerait un total
     faux dans les deux cas. On lit donc les bornes reelles : les planchers
     quand il y en a, le prix ferme sinon.

     Aucune tete n'est en face au moment ou l'on compose : le total s'annonce
     en fourchette, jamais en montant unique invente. */
  const bornes = (sv: Service): { bas: number; haut: number } => {
    const f = Object.values(sv.priceFloors ?? {});
    return f.length ? { bas: Math.min(...f), haut: Math.max(...f) } : { bas: sv.priceXof, haut: sv.priceXof };
  };
  const inclusPaires = (svcForm?.includes ?? [])
    .map((inc) => {
      if (inc.categoryId) {
        /* « La prestation de son calibre » ne designe QUE celles qui varient
           avec la densite. Retenir tout l'atelier melait le resserrage et
           l'abonnement annuel a 480 000 F, et la fourchette annoncee n'avait
           plus aucun sens — de 8 900 F a 1 140 000 F. */
        const sousArbre = sousArbreOf(categories, inc.categoryId);
        const fam = services.filter((x) => sousArbre.has(x.categoryId)
          && Object.keys(x.priceFloors ?? {}).length > 0);
        if (!fam.length) return null;
        const bs = fam.map(bornes);
        return {
          inc,
          sv: fam[0],
          bas: Math.min(...bs.map((b) => b.bas)),
          haut: Math.max(...bs.map((b) => b.haut)),
          variable: true,
          nom: categories.find((c) => c.id === inc.categoryId)?.fon ?? '',
        };
      }
      if (inc.productId) {
        /* Un produit a un prix ferme : ni calibre ni fourchette, et pas de duree
           — on le remet, on ne le realise pas. */
        const pr = products.find((x) => x.id === inc.productId);
        if (!pr) return null;
        const commeSvc = { id: pr.id, name: pr.name, priceXof: pr.priceXof, durationMin: 0,
                           categoryId: pr.categoryId } as unknown as Service;
        return { inc, sv: commeSvc, bas: pr.priceXof, haut: pr.priceXof, variable: false, nom: pr.name };
      }
      const sv = services.find((x) => x.id === inc.serviceId);
      if (!sv) return null;
      const b = bornes(sv);
      return { inc, sv, bas: b.bas, haut: b.haut, variable: b.haut > b.bas, nom: sv.name };
    })
    .filter((x): x is { inc: ServiceInclus; sv: Service; bas: number; haut: number; variable: boolean; nom: string } => !!x);
  const inclusLignes = inclusPaires.map((x) => x.sv);
  /* LA DUREE DE LA VISITE D'OUVERTURE — les seules prestations du jour meme.
     Une seance a six semaines est un AUTRE rendez-vous : l'additionner ici
     ferait bloquer sept heures de fauteuil pour un geste qui n'aura pas lieu. */
  const jourMeme = inclusPaires.filter((x) => !x.inc.afterWeeks);
  const suites = inclusPaires.filter((x) => !!x.inc.afterWeeks);
  const dureeJour = jourMeme.reduce((n, x) => n + x.sv.durationMin, 0);
  const dureeJourHaute = jourMeme.reduce((n, x) => n + (x.sv.durationMaxMin ?? x.sv.durationMin), 0);
  const dureeSuites = suites.reduce((n, x) => n + x.sv.durationMin, 0);
  const inclusValeur = inclusPaires.reduce((n, x) => n + x.bas, 0);
  const inclusValeurHaute = inclusPaires.reduce((n, x) => n + x.haut, 0);
  const inclusFamilles = inclusPaires.filter((x) => x.variable).length;
  const inclusSaisi = parseInt((svcForm?.price ?? '').replace(/[^0-9]/g, ''), 10) || 0;
  /* LE RECAPITULATIF SUIT LA REMISE. Il lisait le prix saisi plus haut, qui ne
     commande plus rien des qu'une remise est posee : on affichait « 0 F » sous
     une composition a 95 000 F, et les deux blocs semblaient etrangers l'un a
     l'autre. Le prix montre est desormais celui que la cliente paiera. */
  const remisePct = svcForm?.forfaitRemise.trim()
    ? Math.max(0, Math.min(100, parseInt(svcForm.forfaitRemise.replace(/[^0-9]/g, ''), 10) || 0))
    : undefined;
  const inclusPrix = remisePct !== undefined
    ? Math.round(inclusValeur * (1 - remisePct / 100))
    : inclusSaisi;
  const inclusPrixHaut = remisePct !== undefined
    ? Math.round(inclusValeurHaute * (1 - remisePct / 100))
    : inclusSaisi;
  const inclusEcart = inclusValeur - inclusPrix;

  /* LE PRIX PAR MODÈLE — se lit ICI, pas en allant le découvrir à la
     réservation (Yéman, 11 août). Pour chaque calibre : la composition au prix
     de ce modèle, barrée, puis le prix du forfait après remise. C'est le
     MOTEUR qui répond (`forfaitPriceXof` — le même juge que la modale RDV et
     Ma Couronne), avec une tête type par calibre : son plafond de locks
     traverse les barèmes par atelier comme une vraie cliente. Les PRODUITS de
     la composition passent AUSSI par le moteur (12 août) — l'aperçu les
     additionnait à la main pendant que le moteur les sautait, et le composeur
     voyait un prix qu'aucune caisse ne sonnait. Le tableau ne paraît que si
     une remise est posée (sans elle le prix est LE MÊME pour toutes) et que
     les montants diffèrent vraiment. Mémoïsé : chaque frappe du formulaire
     relançait tranches × includes × catalogue de recherches. */
  const cleForm = svcForm
    ? `${svcForm.id}|${svcForm.includes.map((i) => i.serviceId || (i.categoryId ? `c:${i.categoryId}` : i.productId ? `p:${i.productId}` : '')).join(',')}|${svcForm.forfaitRemise}`
    : '';
  const prixParModele = useMemo(() => {
    if (!svcForm || remisePct === undefined) return [];
    const incs = svcForm.includes.filter((i) => i.serviceId || i.categoryId || i.productId);
    if (!incs.length || bands.length === 0) return [];
    const virtuel = {
      id: svcForm.id || 'apercu-forfait', name: '', categoryId: '',
      priceXof: 0, durationMin: 0, includes: incs,
    } as unknown as Service;
    const rows = bands.map((b, i) => {
      const rep = b.maxLocks ?? ((bands[i - 1]?.maxLocks ?? 0) + 1);
      const p: PersonalPricing = { band: b, lockCount: rep, clientCoef: 1, sets: bandSets, cats: categories };
      const compo = forfaitPriceXof(virtuel, p, services, products);
      if (compo === undefined) return { b, valeur: 0, prix: null as number | null };
      return { b, valeur: compo, prix: Math.round(compo * (1 - remisePct / 100)) };
    });
    /* Un seul montant distinct = rien à tabuler ; le récapitulatif suffit. */
    return new Set(rows.filter((r) => r.prix != null).map((r) => r.prix)).size > 1 ? rows : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleForm, remisePct, bands, bandSets, categories, services, products]);

  /* LA DUREE SE RECALCULE QUAND LA COMPOSITION CHANGE — pas a l'ouverture de la
     fiche, sinon on ecraserait en silence une duree posee a la main. La cle
     n'inclut que ce qui compte : quelles prestations, a quelles echeances. */
  const cleInclus = (svcForm?.includes ?? []).map((i) => `${i.serviceId}@${i.afterWeeks ?? 0}`).join('|');
  const cleInclusPrec = useRef<string | null>(null);
  useEffect(() => {
    if (!svcForm) { cleInclusPrec.current = null; return; }
    if (cleInclusPrec.current === null) { cleInclusPrec.current = cleInclus; return; }
    if (cleInclusPrec.current === cleInclus) return;
    cleInclusPrec.current = cleInclus;
    if (!jourMeme.length) return;
    setSvcForm((f) => (f ? {
      ...f,
      durationMin: String(dureeJour),
      durationMax: dureeJourHaute > dureeJour ? String(dureeJourHaute) : '',
    } : f));
  }, [cleInclus, svcForm, jourMeme.length, dureeJour, dureeJourHaute]);

  /* CE QUE LE RAIL DIT DE CHAQUE RUBRIQUE — un chiffre, jamais une phrase :
     il sert à savoir ce qui est rempli SANS y entrer. « — » quand rien n'y
     est posé, ce qui vaut invitation plutôt que reproche. */
  const etatRubrique = (k: Rubrique): string => {
    if (!svcForm) return '';
    switch (k) {
      case 'identite': return svcForm.name.trim() ? '✓' : '—';
      case 'prix': {
        const v = num(svcForm.price);
        return svcForm.priceMode === 'devis' ? 'sur devis' : v ? fmtMoney(v, currency) : '—';
      }
      case 'temps': {
        const m = num(svcForm.durationMin) ?? 0;
        const h = m >= 60 ? `${Math.round(m / 60 * 10) / 10} h` : m ? `${m} min` : '—';
        return svcForm.sessions > 1 ? `${h} · ${svcForm.sessions}×` : h;
      }
      case 'contient': return svcForm.includes.length ? String(svcForm.includes.length) : '—';
      case 'tetes': return svcForm.reserveFamilles ? 'familles'
        : svcForm.bandIds.length ? `${svcForm.bandIds.length} calibres` : 'toutes';
      case 'gestes': return svcForm.gestes.length ? String(svcForm.gestes.length) : '—';
    }
  };

  const saveSvc = () => {
    if (!svcForm || !svcForm.name.trim()) return;
    const price = parseInt(svcForm.price.replace(/[^0-9]/g, ''), 10) || 0;
    const dur = parseInt(svcForm.durationMin.replace(/[^0-9]/g, ''), 10) || 60;
    // `hidePrice` reste synchronisé avec le mode « devis » (front & caisse s'en servent).
    const hidePrice = svcForm.priceMode === 'devis';
    /* Planchers : on ne garde que les calibres réellement renseignés. Un plancher
       à 0 n'est pas « pas de plancher », c'est un prix gratuit — d'où le filtre. */
    const floors = Object.fromEntries(
      Object.entries(svcForm.floors).map(([k, v]) => [k, num(v)]).filter(([, v]) => v !== undefined),
    ) as Record<string, number>;
    /* UN SEUL MODÈLE COMMANDE (13 août) : l'enregistrement n'écrit QUE le
       système du modèle choisi et EFFACE les autres — plus jamais trois
       mécanismes empilés sur la même fiche. Un forfait PRICÉ PAR SA
       COMPOSITION, lui, n'a pas de modèle : ces champs ne le concernent pas.
       Un forfait qui porte son propre prix, si (voir `prixParComposition`). */
    const m = prixParComposition(svcForm) ? null : svcForm.modele;
    const v6 = {
      code: svcForm.code.trim() || undefined,
      ratePerLock: m === 'lock' ? num(svcForm.rate) : undefined,
      tarifMode: m === 'lock' ? ('lock' as const) : m === 'calibre' ? ('calibre' as const) : undefined,
      includes: svcForm.includes.length ? svcForm.includes : undefined,
      forfaitRemisePct: svcForm.forfaitRemise.trim() === '' ? undefined : Math.max(0, Math.min(100, parseInt(svcForm.forfaitRemise.replace(/[^0-9]/g, ''), 10) || 0)),
      priceFloors: m === 'calibre' && Object.keys(floors).length ? floors : undefined,
      durationMaxMin: num(svcForm.durationMax),
      priceToXof: num(svcForm.priceTo),
      /* Même filtre que les planchers : une case vide fait disparaître la
         longueur de la fiche, elle n'y écrit pas un zéro qui vaudrait gratuit. */
      /* LE COMPTAGE PEUT GARDER SA GRILLE (16 août) : quand des tarifs au lock
         PAR LONGUEUR sont posés, les prix par longueur ne sont plus le système
         concurrent — ils en sont le PLANCHER, et le moteur les lit comme tels.
         Les effacer ici retirerait le filet au premier enregistrement. */
      tarifLockParLongueur: m === 'lock' ? nettoie(svcForm.tarifLong) : undefined,
      prixParLongueur: m === 'longueur' || (m === 'lock' && nettoie(svcForm.tarifLong))
        ? nettoie(svcForm.prixLong) : undefined,
      dureeParLongueur: m === 'longueur' || (m === 'lock' && nettoie(svcForm.tarifLong))
        ? nettoie(svcForm.dureeLong) : undefined,
      /* L'interrupteur « suit le modèle » appartient au modèle « Barème » ;
         un forfait pricé par sa composition garde le sien tel quel. */
      ...(prixParComposition(svcForm) ? {} : { scalesWithModel: m === 'modele' ? true : undefined }),
      /* LES CALIBRES SERVIS — la liste fait foi (`servesBand`) ; l'ancien
         champ simple `bandId`, fondu dans la liste à l'ouverture, se retire. */
      bandIds: svcForm.bandIds.length ? svcForm.bandIds : undefined,
      bandId: undefined,
      /* RÉSERVÉE AUX COMPTES FAMILLE — le juge est `estProposable` : une tête
         sans compte famille ne la verra ni au tunnel, ni à l'accueil, ni à la
         modale RDV. */
      reserveFamilles: svcForm.reserveFamilles || undefined,
      privatise: svcForm.privatise
        ? { maxTetes: Math.max(1, parseInt(svcForm.maxTetes, 10) || 1) }
        : undefined,
      /* Les gestes sans déclencheur ne s'enregistrent pas : une règle qui ne
         se déclenche jamais est du bruit dans la fiche. */
      offertAvec: (() => {
        const gardes = svcForm.gestes
          .filter((g) => g.serviceIds.length > 0)
          .map((g) => ({
            serviceIds: g.serviceIds,
            bandIds: g.bandIds.length ? g.bandIds : undefined,
            pct: Math.max(1, Math.min(100, parseInt(g.pct, 10) || 100)),
          }));
        return gardes.length ? gardes : undefined;
      })(),
    };
    if (svcForm.id) {
      patchSvc(svcForm.id, {
        categoryId: svcForm.categoryId, name: svcForm.name.trim(), description: svcForm.description.trim() || undefined,
        priceXof: price, priceMode: svcForm.priceMode, hidePrice, palier: svcForm.palier, durationMin: dur, sessions: svcForm.sessions, master: svcForm.master,
        ...v6,
      });
    } else {
      const maxOrder = svcOf(svcForm.categoryId).reduce((m, s) => Math.max(m, s.order), 0);
      setServices((prev) => [
        ...prev,
        {
          id: uid(), categoryId: svcForm.categoryId, name: svcForm.name.trim(), description: svcForm.description.trim() || undefined,
          palier: svcForm.palier, priceXof: price, priceMode: svcForm.priceMode, hidePrice, sessions: svcForm.sessions,
          master: svcForm.master, durationMin: dur, order: maxOrder + 1, temps: [1, 1, 1, 1],
          ...v6,
        },
      ]);
    }
    setSvcForm(null);
  };

  /* — produits — (partagés avec le Laboratoire via productsStore) */
  const prodsOf = (catId: string) => products.filter((p) => p.categoryId === catId).sort((a, b) => a.order - b.order);

  const moveProd = (prod: Product, dir: -1 | 1) => {
    const list = prodsOf(prod.categoryId);
    const idx = list.findIndex((p) => p.id === prod.id);
    const other = list[idx + dir];
    if (!other) return;
    setProducts((prev) =>
      prev.map((p) =>
        p.id === prod.id ? { ...p, order: other.order } : p.id === other.id ? { ...p, order: prod.order } : p,
      ),
    );
  };
  const patchProd = (id: string, patch: Partial<Product>) => {
    /* UNE CORRECTION DE STOCK PASSE PAR LE JOURNAL dès que la fiche d'inventaire
       existe (module Stock & Achats) : le geste devient un ajustement tracé, et
       le champ `stock` d'ici n'est plus qu'un miroir que le journal réécrit.
       Sans fiche, l'ancien compteur continue — rien ne casse. */
    if (patch.stock !== undefined
      && corrigerStockGamme(id, patch.stock, 'Correction Catalogue', todayISO(), branch.id)) {
      const { stock: _stock, ...reste } = patch;
      if (!Object.keys(reste).length) return;
      patch = reste;
    }
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  /* Un clic est un DELTA — voir bougerStockGamme. Sans fiche, l'ancien
     compteur continue, sans borner : le négatif dit la vérité. */
  const bougeProd = (p: Product, delta: number) => {
    if (bougerStockGamme(p.id, delta, 'Correction Catalogue', todayISO(), branch.id)) return;
    setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, stock: x.stock + delta } : x)));
  };

  const openProdEdit = (prod: Product) =>
    setProdForm({ id: prod.id, categoryId: prod.categoryId, name: prod.name, price: String(prod.priceXof), stock: String(prod.stock) });

  const saveProd = () => {
    if (!prodForm || !prodForm.name.trim()) return;
    const price = parseInt(prodForm.price.replace(/[^0-9]/g, ''), 10) || 0;
    const stock = Math.round(litQuantite(prodForm.stock) || 0);
    if (prodForm.id) {
      patchProd(prodForm.id, { categoryId: prodForm.categoryId, name: prodForm.name.trim(), priceXof: price, stock });
    } else {
      const maxOrder = prodsOf(prodForm.categoryId).reduce((m, p) => Math.max(m, p.order), 0);
      setProducts((prev) => [...prev, { id: uid(), categoryId: prodForm.categoryId, name: prodForm.name.trim(), priceXof: price, stock, order: maxOrder + 1 }]);
    }
    setProdForm(null);
  };

  const deleteProd = (prod: Product) => {
    if (!window.confirm(`Retirer le produit « ${prod.name} » de la gamme ?`)) return;
    setProducts((prev) => prev.filter((p) => p.id !== prod.id));
  };

  const dodoId = cats.find((c) => c.id === 'dodo')?.id ?? cats[0]?.id ?? 'dodo';

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="Vente · L’offre"
        title="Le catalogue."
        sub="Segmenté par catégorie ™ et par palier d’expérience — jamais par remise. Chaque prestation couvre les quatre temps : Purifier · Nourrir · Sceller · Couronner."
        actions={
          <>
            <Button variant="ghost" onClick={() => setCatForm({ id: null, fon: '', label: '', enabled: true, maison: '', code: '', parentId: '' })}>+ Catégorie</Button>
            <Button variant="ghost" onClick={() => setProdForm(emptyProdForm(dodoId))}>+ Produit</Button>
            <Button onClick={() => setSvcForm(emptySvcForm(cats[0]?.id ?? 'vekpe', masters[0] ?? ''))}>+ Prestation</Button>
            {/* UN FORFAIT N'EST PAS UNE PRESTATION. Il en rassemble plusieurs et
                leur applique une remise ; une prestation isolee n'a rien a
                composer. Les deux formulaires ne montrent donc pas les memes
                champs, et le geste de creation le dit des le depart. */}
            <Button variant="ghost" onClick={() => setSvcForm(emptySvcForm(cats[0]?.id ?? 'vekpe', masters[0] ?? '', true))}>+ Forfait</Button>
          </>
        }
      />

      {cats.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 10px', flexWrap: 'wrap' }}>
          <input
            className="mnd-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher une prestation, un produit…"
            style={{ flex: '1 1 240px', maxWidth: 360 }}
          />
          {query && <button className="trv-minibtn" onClick={() => setQuery('')}>Effacer</button>}
          <Button variant="ghost" onClick={toggleAll}>{allCollapsed ? 'Tout déplier' : 'Tout replier'}</Button>
        </div>
      )}

      {/* LE REGROUPEMENT PAR RÉGIME — un clic montre ENSEMBLE toutes les
          prestations d'un même régime tarifaire (rangées par atelier), avec
          le compte sur chaque pastille. Le même juge que les étiquettes. */}
      {cats.length > 0 && (() => {
        const nb = {
          jp: services.filter((s) => regimeTarifaire(s, cats).justePrix).length,
          modele: services.filter((s) => regimeTarifaire(s, cats).k === 'modele').length,
          lock: services.filter((s) => regimeTarifaire(s, cats).k === 'lock').length,
          calibre: services.filter((s) => regimeTarifaire(s, cats).k === 'calibre').length,
          longueur: services.filter((s) => regimeTarifaire(s, cats).k === 'longueur').length,
          hors: services.filter((s) => !regimeTarifaire(s, cats).justePrix).length,
        };
        const chips: { v: typeof regimeFiltre; t: string; n?: number }[] = [
          { v: 'tout', t: 'Tout' },
          { v: 'jp', t: 'Juste Prix', n: nb.jp },
          { v: 'modele', t: 'Barème du modèle', n: nb.modele },
          { v: 'lock', t: 'Comptage des locks', n: nb.lock },
          { v: 'calibre', t: 'Prix par calibre', n: nb.calibre },
          { v: 'longueur', t: 'Grille par longueur', n: nb.longueur },
          { v: 'hors', t: 'Hors Juste Prix', n: nb.hors },
        ];
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 16px', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', flex: 'none' }}>
              Régime du prix
            </span>
            {chips.map((c) => {
              const on = regimeFiltre === c.v;
              return (
                <button
                  key={c.v}
                  type="button"
                  className="trv-minibtn"
                  onClick={() => setRegimeFiltre(on && c.v !== 'tout' ? 'tout' : c.v)}
                  style={on
                    ? { background: 'var(--color-copper)', borderColor: 'var(--color-copper)', color: 'var(--color-ivoire)' }
                    : undefined}
                >
                  {c.t}{c.n !== undefined ? ` · ${c.n}` : ''}
                </button>
              );
            })}
            {regimeFiltre !== 'tout' && (
              <span className="mnd-muted" style={{ fontSize: 11.5 }}>
                {regimeFiltre === 'jp'
                  ? 'toutes les prestations que le Juste Prix de la cliente modulera — les produits de la Gamme sont hors champ'
                  : regimeFiltre === 'hors'
                    ? 'prix fermes du catalogue et montants sur devis — le Juste Prix ne les touche pas'
                    : 'les prestations de ce régime, rangées par atelier'}
              </span>
            )}
          </div>
        );
      })()}

      {cats.length === 0 && (
        <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 16, lineHeight: 1.6, color: 'var(--ink-soft)', padding: '28px 0', textAlign: 'center' }}>
          Le catalogue est vierge. Commencez par inscrire une catégorie ™ — elle accueillera vos prestations et vos produits Maison.
        </div>
      )}

      {renderCats.map((cat, ci) => {
        const isOrphan = cat.id === ORPHAN_ID;
        /* Titre d'ensemble : posé sur la PREMIÈRE catégorie du groupe. */
        const g = isOrphan ? null : groupeDe(cat);
        const gPrec = ci > 0 && renderCats[ci - 1].id !== ORPHAN_ID ? groupeDe(renderCats[ci - 1]).k : null;
        const ouvreGroupe = g && g.k !== gPrec;
        const list = (isOrphan ? orphanSvcs : svcOf(cat.id)).filter(matchSvc);
        /* LES FORFAITS A PART. Un forfait rassemble plusieurs gestes et se
           vend comme un engagement ; melange aux prestations, il se lisait
           comme l'une d'elles. On les range en fin d'atelier, sous leur propre
           en-tete, pour qu'on sache toujours dans lequel des deux on se trouve. */
        const prestations = list.filter((sv) => !sv.includes?.length);
        const forfaits = list.filter((sv) => !!sv.includes?.length);
        const prods = (isOrphan ? orphanProds : prodsOf(cat.id)).filter(matchProd);
        const count = list.length + prods.length;
        const catMatches = !q || cat.fon.toLowerCase().includes(q) || cat.label.toLowerCase().includes(q);
        /* Filtre actif (recherche ou régime) : on masque les catégories sans
           aucune correspondance. */
        if (filtreActif && count === 0 && !(q && catMatches)) return null;
        /* Replié uniquement hors filtre — chercher ou filtrer DÉPLIE : le
           `!q &&` d'origine faisait l'inverse de son commentaire, une
           recherche repliait tous les ateliers (corrigé le 13 août). */
        const open = filtreActif || !collapsed.has(cat.id);
        return (
          <div key={`w-${cat.id}`}>
          {ouvreGroupe && g && (
            <div
              style={{
                display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap',
                margin: '26px 0 10px', paddingBottom: 8,
                borderBottom: '2px solid var(--line)',
              }}
            >
              <button
                type="button"
                className="trv-sq"
                title="Replier ou déplier tout cet ensemble"
                onClick={() => toggleGroupe(g.k)}
                style={{ flex: 'none' }}
              >
                ⇅
              </button>
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: 17, letterSpacing: '.04em' }}>{g.titre}</span>
              <span className="mnd-muted" style={{ fontSize: 12 }}>{g.sous}</span>
              <span className="mnd-muted" style={{ fontSize: 11.5, marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
                {cats.filter((c) => groupeDe(c).k === g.k).length} catégories ·{' '}
                {services.filter((sv) => cats.some((c) => c.id === sv.categoryId && groupeDe(c).k === g.k)).length} prestations
              </span>
            </div>
          )}
          {/* UNE FAMILLE SE LIT COMME TELLE : decalee sous son atelier, avec un
              filet a gauche. Sans ce retrait, l'ecran affichait une liste plate
              ou rien ne disait que les SINSIN appartiennent a GBEJI. */}
          <section
            className="trv-catblock"
            style={{
              opacity: cat.enabled ? 1 : 0.6,
              ...(cat.parentId && categories.some((p2) => p2.id === cat.parentId)
                ? { marginLeft: 26, borderLeft: '2px solid var(--line)', paddingLeft: 14 }
                : {}),
            }}
          >
            <div className="trv-catblock__band">
              {!q && (
                <button
                  className="trv-sq"
                  title={open ? 'Replier' : 'Déplier'}
                  onClick={() => toggleCollapse(cat.id)}
                  style={{ marginRight: 8, flex: 'none' }}
                >
                  {open ? '▾' : '▸'}
                </button>
              )}
              <button
                className="trv-catblock__id"
                onClick={() => !q && toggleCollapse(cat.id)}
                style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: q ? 'default' : 'pointer', font: 'inherit', color: 'inherit' }}
              >
                <span className="fon">{cat.fon}</span>
                <span className="label">{cat.label}</span>
              </button>
              <span className="trv-catblock__count">
                {count} élément{count > 1 ? 's' : ''}
              </span>
              <span className="trv-catblock__spacer" />
              {!isOrphan && (
                <>
                  <button
                    className="trv-minibtn"
                    style={{ color: cat.enabled ? 'var(--copper-600)' : 'var(--ink-soft)' }}
                    title="Afficher / masquer cette catégorie aux clientes"
                    onClick={() => toggleCat(cat)}
                  >
                    {cat.enabled ? '● Visible aux clientes' : '○ Masquée du front'}
                  </button>
                  <span className="trv-catblock__tools">
                    {/* PROGRAMMER TOUT UN ATELIER D'UN GESTE (16 août) — poser
                        le comptage au lock sur six Créations une par une, c'est
                        six occasions de se tromper d'un chiffre. */}
                    <button
                      className="trv-minibtn"
                      title="Programmer cet atelier au comptage des locks"
                      onClick={() => setProgAtelier(cat.id)}
                    >
                      Programmer au comptage
                    </button>
                    <button className="trv-minibtn" title="Modifier la catégorie" onClick={() => setCatForm({ id: cat.id, fon: cat.fon, label: cat.label, enabled: cat.enabled, maison: cat.maison ?? '', code: cat.code ?? '' , parentId: cat.parentId ?? '' })}>
                      Modifier
                    </button>
                    <button className="trv-minibtn" title="Supprimer la catégorie" onClick={() => deleteCat(cat)}>
                      Supprimer
                    </button>
                    <button className="trv-sq" title="Monter" disabled={!voisinDe(cat, -1)} onClick={() => moveCat(cat, -1)}>↑</button>
                    <button className="trv-sq" title="Descendre" disabled={!voisinDe(cat, 1)} onClick={() => moveCat(cat, 1)}>↓</button>
                  </span>
                </>
              )}
            </div>

            {open && (
            <>
            <div className="trv-catblock__filet" />

            {prestations.length > 0 && forfaits.length > 0 && (
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', padding: '4px 0 8px' }}>
                Prestations · {prestations.length}
              </div>
            )}
            <div className="trv-catblock__body tr-grid tr-grid--2">
              {[...prestations, ...forfaits].map((svc, si) => (
                <Fragment key={svc.id}>
                {/* L'EN-TETE DES FORFAITS s'insere pile avant le premier d'entre
                    eux : on sait toujours dans lequel des deux on se trouve. */}
                {si === prestations.length && forfaits.length > 0 && (
                  <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginTop: 14, paddingBottom: 6, borderBottom: '1px solid var(--copper-300)' }}>
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--copper-700)' }}>
                      Forfaits · {forfaits.length}
                    </span>
                    <span className="mnd-muted" style={{ fontSize: 11.5 }}>
                      plusieurs gestes, un seul engagement — les prestations incluses se posent au carnet
                    </span>
                  </div>
                )}
                <article className="trv-svc">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                    <div className="trv-svc__name">{svc.name}</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flex: 'none' }}>
                      {/* Suit le MODÈLE : le prix (et la durée) s'ajustent au nombre de
                          locks de la cliente via le barème du Juste Prix. */}
                      <button
                        className="trv-hideprice"
                        style={scalesWithModel(svc) ? { color: 'var(--copper-700)', borderColor: 'var(--copper-300)' } : undefined}
                        title={scalesWithModel(svc)
                          ? 'Suit le modèle de la cliente (barème par tranches de locks) — cliquer pour désactiver'
                          : 'Prix identique quel que soit le modèle — cliquer pour suivre le barème par tranches de locks'}
                        onClick={() => patchSvc(svc.id, { scalesWithModel: !scalesWithModel(svc) })}
                      >
                        {scalesWithModel(svc) ? '◈ Modèle' : 'Modèle —'}
                      </button>
                      <button
                        className="trv-hideprice"
                        title="Mode de prix — cliquez pour changer : Fixe → Variable → Sur devis"
                        onClick={() => cyclePriceMode(svc)}
                      >
                        {PRICE_MODES.find((m) => m.k === priceModeOf(svc))?.label}
                      </button>
                      <div className="trv-svc__price">
                        {priceModeOf(svc) === 'devis'
                          ? <em style={{ fontSize: 15, color: 'var(--ink-soft)' }}>sur devis</em>
                          : (
                            <span>
                              {priceModeOf(svc) === 'variable' && <span style={{ fontSize: 11, color: 'var(--ink-soft)', marginRight: 4 }}>dès</span>}
                              {fmtMoney(svc.priceXof, currency)}
                            </span>
                          )}
                      </div>
                    </div>
                  </div>

                  {/* LES TROIS LONGUEURS, quand la prestation en porte. Le grand
                      prix au-dessus reste celui du catalogue — c'est le repli
                      quand la longueur n'est pas connue ; ces trois-là sont ceux
                      qui sortent réellement en caisse. */}
                  {suitLongueur(svc) && (
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', margin: '7px 0 2px', fontFamily: 'var(--font-sans)', fontSize: 12 }}>
                      {LONGUEURS.filter((l) => svc.prixParLongueur?.[l.id] !== undefined).map((l) => (
                        <span key={l.id} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5 }}>
                          <span style={{ color: 'var(--ink-soft)' }}>{l.label}</span>
                          <strong style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--copper-700)' }}>
                            {fmtMoney(svc.prixParLongueur![l.id]!, currency)}
                          </strong>
                          {svc.dureeParLongueur?.[l.id] !== undefined && (
                            <span className="mnd-muted" style={{ fontSize: 11 }}>{fmtDuration(svc.dureeParLongueur[l.id]!)}</span>
                          )}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* CE QUI FAIT SON PRIX — la règle en une phrase, par LE juge
                      du moteur (`regimeTarifaire`). Comptage, plancher, grille,
                      Juste Prix : ça se lisait champ par champ, jamais comme
                      une règle (13 août). */}
                  {(() => {
                    const regime = regimeTarifaire(svc, cats);
                    return (
                      <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11, marginTop: 5, lineHeight: 1.45, color: 'var(--ink-soft)' }}>
                        <span style={{ fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--copper-700)' }}>Son prix · </span>
                        {regime.mots}
                        <span style={{ color: regime.justePrix ? 'var(--copper-700)' : 'var(--ink-soft)' }}>
                          {regime.justePrix ? ' · Juste Prix : oui' : ' · Juste Prix : non'}
                        </span>
                      </div>
                    );
                  })()}

                  <div className="trv-svc__meta">
                    <span>{svc.palier}</span>
                    <span style={{ color: 'var(--color-argile)' }}>·</span>
                    <span>{fmtDuration(svc.durationMin)}</span>
                    <span style={{ color: 'var(--color-argile)' }}>·</span>
                    <span className="trv-stepper">
                      <button className="trv-sq" style={{ width: 24, height: 24 }} title="Retirer une séance" onClick={() => patchSvc(svc.id, { sessions: Math.max(1, svc.sessions - 1) })}>−</button>
                      <span className="val">{svc.sessions}</span>
                      <button className="trv-sq" style={{ width: 24, height: 24 }} title="Ajouter une séance" onClick={() => patchSvc(svc.id, { sessions: svc.sessions + 1 })}>+</button>
                      <span>séance{svc.sessions > 1 ? 's' : ''}</span>
                    </span>
                  </div>

                  {/* Le point d'usage — ce que cette prestation a réellement servi. */}
                  {(() => {
                    const u = usage.get(svc.id);
                    /* Ouvrir le chiffre : QUI, QUAND, COMBIEN. Deux prestations
                       homonymes ne se distinguent que par là. */
                    const openUsage = () => {
                      if (!u) return;
                      setDrill({
                        title: svc.name,
                        sub: `${u.done} rituel${u.done > 1 ? 's' : ''} honoré${u.done > 1 ? 's' : ''} · ${u.upcoming} à venir · part du chiffre encaissé`,
                        total: Math.round(u.rev),
                        rows: u.rows.map((r) => ({
                          /* La date part BRUTE : `DrillModal` la formate lui-même
                             (frShort), comme pour tous les autres écrans qui
                             l'ouvrent. La formater ici la faisait formater deux
                             fois — `new Date('Sam. 4 juil.T12:00:00')` — et toute
                             la colonne affichait « Invalid Date ». */
                          date: r.date,
                          who: r.who,
                          sub: r.upcoming
                            ? 'À venir'
                            : r.combined ? 'Part d’un rituel combiné' : 'Rituel honoré',
                          amount: r.amount,
                          invoiceId: r.invoiceId,
                          /* Pas de facture rattachee — la ligne ouvre alors le
                             RENDEZ-VOUS, filtre sur la cliente. Un chiffre qu'on
                             ne peut pas ouvrir n'est pas un chiffre. */
                          onOpen: r.invoiceId || r.upcoming
                            ? undefined
                            : () => navigate(`/carnet?q=${encodeURIComponent(r.who)}`),
                        })),
                      });
                    };
                    return (
                      <div
                        className={`trv-svc__meta${u && (u.done > 0 || u.upcoming > 0) ? ' trv-svc__meta--click' : ''}`}
                        style={{ marginTop: 2 }}
                        role={u && (u.done > 0 || u.upcoming > 0) ? 'button' : undefined}
                        tabIndex={u && (u.done > 0 || u.upcoming > 0) ? 0 : undefined}
                        onClick={openUsage}
                        onKeyDown={(e) => { if (e.key === 'Enter') openUsage(); }}
                        title={u && (u.done > 0 || u.upcoming > 0) ? 'Voir le détail : quelles clientes, quand, pour combien' : undefined}
                      >
                        {u && (u.done > 0 || u.upcoming > 0) ? (
                          <>
                            <span>
                              ◈ {u.done} honoré{u.done > 1 ? 's' : ''}
                            </span>
                            <span style={{ color: 'var(--color-argile)' }}>·</span>
                            <span title="Rendez-vous à venir portant cette prestation">{u.upcoming} à venir</span>
                            {u.rev > 0 && (
                              <>
                                <span style={{ color: 'var(--color-argile)' }}>·</span>
                                <span
                                  title="Part du chiffre encaissé attribuée à cette prestation (ventilée au prorata quand un rituel en combine plusieurs)"
                                  style={{ color: 'var(--copper-700)' }}
                                >
                                  {fmtMoney(Math.round(u.rev), currency)} générés
                                </span>
                              </>
                            )}
                          </>
                        ) : (
                          <span style={{ fontStyle: 'italic' }}>◈ Jamais réservée — masquable ou supprimable sans risque</span>
                        )}
                      </div>
                    );
                  })()}

                  <div className="trv-temps">
                    {QUATRE_TEMPS.map((t, i) => (
                      <span key={t} className={(svc.temps ?? [1, 1, 1, 1])[i] ? 'on' : ''}>{t}</span>
                    ))}
                  </div>

                  {svc.description && <div className="trv-svc__desc">{svc.description}</div>}

                  <div className="trv-svc__foot">
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--ink-soft)' }}>
                      Maître
                      <select
                        className="trv-master"
                        value={svc.master}
                        onChange={(e) => patchSvc(svc.id, { master: e.target.value })}
                      >
                        {[...new Set([svc.master, ...masters])].map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </label>
                    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                      <button className="trv-sq" title="Monter la prestation" disabled={si === 0} onClick={() => moveSvc(svc, -1)}>▲</button>
                      <button className="trv-sq" title="Descendre la prestation" disabled={si === list.length - 1} onClick={() => moveSvc(svc, 1)}>▼</button>
                      <button className="trv-minibtn" onClick={() => openSvcEdit(svc)}>Modifier</button>
                      <button className="trv-minibtn" title="Supprimer la prestation" onClick={() => deleteSvc(svc)}>Supprimer</button>
                    </span>
                  </div>
                </article>
                </Fragment>
              ))}

              {prods.map((p, pi) => (
                <article key={p.id} className="trv-svc">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                    <div className="trv-svc__name">{p.name}</div>
                    <div className="trv-svc__price">{fmtMoney(p.priceXof, currency)}</div>
                  </div>
                  <div className="trv-svc__meta">
                    <span>Produit Maison</span>
                    <span style={{ color: 'var(--color-argile)' }}>·</span>
                    <span style={{ color: p.stock <= 8 ? 'var(--trv-warning)' : undefined }}>
                      stock {p.stock}
                    </span>
                  </div>
                  <div className="trv-svc__foot">
                    <span className="trv-stepper">
                      <button className="trv-sq" title="Retirer une unité" onClick={() => bougeProd(p, -1)}>−</button>
                      <span className="val">{p.stock}</span>
                      <button className="trv-sq" title="Ajouter une unité" onClick={() => bougeProd(p, 1)}>+</button>
                      <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--ink-soft)' }}>en stock</span>
                    </span>
                    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                      <button className="trv-sq" title="Monter le produit" disabled={pi === 0} onClick={() => moveProd(p, -1)}>▲</button>
                      <button className="trv-sq" title="Descendre le produit" disabled={pi === prods.length - 1} onClick={() => moveProd(p, 1)}>▼</button>
                      <button className="trv-minibtn" onClick={() => openProdEdit(p)}>Modifier</button>
                      <button className="trv-minibtn" onClick={() => deleteProd(p)}>Supprimer</button>
                    </span>
                  </div>
                </article>
              ))}

              {list.length === 0 && prods.length === 0 && (
                <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', color: 'var(--ink-soft)', padding: '8px 0' }}>
                  {q ? 'Aucune correspondance dans cette catégorie.' : 'Aucune prestation ni produit dans cette catégorie pour l’instant.'}
                </div>
              )}
            </div>
            </>
            )}
          </section>
          </div>
        );
      })}

      {svcForm && (
        <Modal title={svcForm.id ? (svcForm.estForfait ? 'Le forfait.' : 'La prestation.') : (svcForm.estForfait ? 'Nouveau forfait.' : 'Nouvelle prestation.')} onClose={() => setSvcForm(null)} width={900}>
          {/* 24 px entre les blocs, 14 a l'interieur : c'est l'ecart qui dit
              ou un sujet finit et ou le suivant commence. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* ═══ LA FICHE EN SIX RUBRIQUES (15 août — maquette validée) ═══
              Trois écrans de défilement, et une rubrique « Tarification
              avancée » où vivaient les calibres, les comptes famille, les
              gestes et le code ERP : quatre choses qui ne parlent pas de prix.
              « Avancée » ne disait pas ce qu'on y trouvait — seulement que
              c'était rare.

              Chaque rubrique répond désormais à une question qu'on se pose :
              qu'est-ce que c'est · combien · combien de temps · que promet-elle
              en plus · à quelles têtes · quand baisse-t-elle. Aucun champ n'a
              été supprimé ni réécrit : ils ont changé de place, c'est tout. */}
          {/* LE BANDEAU QUI NE QUITTE PAS L'ÉCRAN — le nom et le prix qu'on
              est en train de poser. Ils vivaient au milieu du défilement : on
              réglait un tarif sans le voir, et l'on ne savait plus quelle
              prestation on tenait après deux écrans de champs. */}
          <div className="trv-fiche__tete">
            <div className="l1">
              <span className="nom">{svcForm.name.trim() || (svcForm.estForfait ? 'Nouveau forfait' : 'Nouvelle prestation')}</span>
              <span className="prix">
                {svcForm.priceMode === 'devis' ? 'sur devis' : num(svcForm.price) ? fmtMoney(num(svcForm.price)!, currency) : '—'}
              </span>
            </div>
            <div className="l2">
              <span className="puce">{cats.find((c) => c.id === svcForm.categoryId)?.label ?? 'sans catégorie'}</span>
              <span className="puce">{svcForm.palier}</span>
              <span className="puce">{etatRubrique('temps')}</span>
              {svcForm.includes.length > 0 && (
                <span className="puce is-on">
                  Forfait · {svcForm.includes.length} ligne{svcForm.includes.length > 1 ? 's' : ''}
                </span>
              )}
              {svcForm.gestes.length > 0 && (
                <span className="puce is-on">{svcForm.gestes.length} geste{svcForm.gestes.length > 1 ? 's' : ''}</span>
              )}
            </div>
          </div>
          <div className="trv-fiche">
            <nav className="trv-fiche__rail" role="tablist" aria-label="Rubriques de la fiche">
              {RUBRIQUES.map((r, i) => (
                <button
                  key={r.k}
                  role="tab"
                  type="button"
                  aria-selected={rubrique === r.k}
                  className={rubrique === r.k ? 'is-active' : ''}
                  onClick={() => setRubrique(r.k)}
                >
                  <span className="n">Rubrique {i + 1}</span>
                  {r.t}
                  <span className="etat">{etatRubrique(r.k)}</span>
                </button>
              ))}
            </nav>

            <div className="trv-fiche__volet">
              {rubrique === 'identite' && (
                <Bloc titre="L’identité" aide="ce qu'elle est, et sous quel nom la cliente la reconnaît">
              <Field label="Nom de la prestation">
                <Input value={svcForm.name} onChange={(e) => setSvcForm({ ...svcForm, name: e.target.value })} placeholder="Ex. Création microlocks" />
              </Field>
                  <div className="tr-grid tr-grid--2">
                <Field label="Catégorie ™">
                  <Select value={svcForm.categoryId} onChange={(e) => setSvcForm({ ...svcForm, categoryId: e.target.value })}>
                    {cats.map((c) => (
                      <option key={c.id} value={c.id}>{c.fon} · {c.label}</option>
                    ))}
                  </Select>
                </Field>
              <Field label="Code ERP">
                <Input value={svcForm.code} onChange={(e) => setSvcForm({ ...svcForm, code: e.target.value })} placeholder="ATL·II·MIN·E" />
              </Field>
                  </div>
              <div className="tr-grid tr-grid--2">
                <Field label="Palier d’expérience">
                  <div style={{ display: 'flex', gap: 8 }}>
                    {PALIERS.map((pa) => (
                      <button key={pa} className={`trv-palier-chip ${svcForm.palier === pa ? 'is-active' : ''}`} onClick={() => setSvcForm({ ...svcForm, palier: pa })}>
                        {pa}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Maître assigné">
                  <Select value={svcForm.master} onChange={(e) => setSvcForm({ ...svcForm, master: e.target.value })}>
                    {[...new Set([svcForm.master, ...masters])].filter(Boolean).map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field label="Description · la voix de la Maison">
                <Textarea
                  value={svcForm.description}
                  onChange={(e) => setSvcForm({ ...svcForm, description: e.target.value })}
                  placeholder="Ce que cette prestation accomplit, en une ou deux phrases souveraines…"
                />
              </Field>
                </Bloc>
              )}

              {rubrique === 'prix' && (
                <Bloc titre="Le prix" aide="combien elle vaut, et sur quoi ce montant se calcule">
                  <div className="tr-grid tr-grid--2">
                <Field label={svcForm.priceMode === 'variable' ? 'Prix de départ (F CFA)' : svcForm.priceMode === 'devis' ? 'Prix indicatif (facultatif)' : 'Prix (F CFA)'}>
                  <Input inputMode="numeric" value={svcForm.price} onChange={(e) => setSvcForm({ ...svcForm, price: e.target.value })} placeholder="45 000" />
                </Field>
              <Field label="Prix haut affiché">
                <Input inputMode="numeric" value={svcForm.priceTo} onChange={(e) => setSvcForm({ ...svcForm, priceTo: e.target.value })} placeholder="« de 15 000 à 25 000 »" />
              </Field>
                  </div>
              <Field label="Mode de prix">
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
                  {PRICE_MODES.map((m) => (
                    <button
                      key={m.k}
                      type="button"
                      className={`trv-palier-chip ${svcForm.priceMode === m.k ? 'is-active' : ''}`}
                      onClick={() => setSvcForm({ ...svcForm, priceMode: m.k })}
                    >
                      {m.label}
                    </button>
                  ))}
                  {/* L'aide tient sur la meme ligne que les boutons : trois mots
                      suffisent, un paragraphe sous chaque champ ne se lit plus. */}
                  <span className="mnd-muted" style={{ fontSize: 11.5 }}>
                    {svcForm.priceMode === 'fixe' ? 'facturé tel quel'
                      : svcForm.priceMode === 'variable' ? 'affiché « à partir de », montant fixé au fauteuil'
                      : 'aucun prix affiché, montant donné au cas par cas'}
                  </span>
                </div>
              </Field>
            {(() => {
              const clef = svcForm.id ?? '__nouvelle__';
              const longueurPosee = Object.values(svcForm.prixLong).some((v) => v?.trim())
                || Object.values(svcForm.dureeLong).some((v) => v?.trim());
              /* CE QUI DECIDE DE L'OUVERTURE — le code ERP en est exclu : presque
                 toutes les prestations en portent un, et le compter ouvrirait le
                 bloc partout, ce qui reviendrait a ne l'avoir jamais replie. */
              const reglee = !!svcForm.rate.trim() || !!svcForm.tarifMode
                || Object.values(svcForm.floors).some((v) => v?.trim())
                || longueurPosee || !!svcForm.priceTo.trim() || !!svcForm.durationMax.trim();
              const ouvert = reglee || avanceOuverte === clef;
              /* REPLIE, LE BLOC DIT CE QU'IL CONTIENT : rien ne se cache
                 derriere un titre muet. */
              const resume = [
                svcForm.rate.trim() ? `${fmtMoney(num(svcForm.rate) ?? 0, currency)} le lock` : null,
                Object.values(svcForm.floors).filter((v) => v?.trim()).length
                  ? `${Object.values(svcForm.floors).filter((v) => v?.trim()).length} planchers` : null,
                longueurPosee ? 'prix par longueur' : null,
                svcForm.code.trim() || null,
              ].filter(Boolean).join(' · ') || 'tarif au lock, planchers, prix par longueur';
              return (
            <BlocPliant
              titre="Le barème détaillé"
              resume={resume}
              ouvert={ouvert}
              onBascule={() => setAvanceOuverte(ouvert && !reglee ? null : clef)}
            >
            {/* LA RÈGLE, DITE EN DIRECT — le même juge que l'étiquette des
                lignes (`regimeTarifaire`) relit le formulaire à chaque frappe :
                on voit ce que les champs du dessous FONT au prix, au lieu de
                le déduire champ par champ (13 août). */}
            {(() => {
              const planchersSaisis = Object.fromEntries(
                Object.entries(svcForm.floors).map(([k, v]) => [k, num(v)]).filter(([, v]) => v !== undefined),
              ) as Record<string, number>;
              /* Le brouillon suit LE MODÈLE CHOISI — la phrase dit ce que
                 l'enregistrement écrira, pas ce que la fiche portait avant. */
              const m = prixParComposition(svcForm) ? null : svcForm.modele;
              const brouillon = {
                id: svcForm.id ?? '',
                categoryId: svcForm.categoryId,
                name: svcForm.name,
                priceMode: svcForm.priceMode,
                hidePrice: svcForm.priceMode === 'devis',
                scalesWithModel: m === 'modele',
                ratePerLock: m === 'lock' ? num(svcForm.rate) : undefined,
                tarifMode: m === 'lock' ? 'lock' : m === 'calibre' ? 'calibre' : undefined,
                includes: svcForm.includes.length ? svcForm.includes : undefined,
                priceFloors: m === 'calibre' && Object.keys(planchersSaisis).length ? planchersSaisis : undefined,
                prixParLongueur: m === 'longueur' ? nettoie(svcForm.prixLong) : undefined,
              } as unknown as Service;
              const regime = regimeTarifaire(brouillon, cats);
              return (
                <div style={{ padding: '11px 14px', background: 'var(--color-sable)', borderRadius: 4, fontFamily: 'var(--font-sans)', fontSize: 12.5, lineHeight: 1.55 }}>
                  <span style={{ fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--copper-700)' }}>Ce qui fait son prix · </span>
                  {regime.mots}
                  {regime.justePrix
                    ? ' — puis le Juste Prix de la cliente s’applique (Finances › Le Juste Prix).'
                    : ' — le Juste Prix de la cliente ne s’applique pas.'}
                </div>
              );
            })()}
            {/* LE MODÈLE DE PRIX — UN SEUL COMMANDE (13 août). Les trois
                systèmes s'empilaient comme des réglages cumulables ; on ne
                savait jamais lequel jouait. Le choix est EXCLUSIF : seuls les
                champs du modèle choisi s'affichent, et l'enregistrement efface
                les systèmes des autres. Un forfait PRICÉ PAR SA COMPOSITION
                (remise posée, ou prix propre à zéro) n'a pas de modèle à
                choisir — les autres, si : porter un geste inclus ne retire pas
                à une prestation son propre prix. */}
            {!prixParComposition(svcForm) && (
              <Field label="Le modèle de prix — un seul commande">
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {([
                    { v: 'fixe' as const, t: 'Prix fixe' },
                    { v: 'modele' as const, t: 'Barème du modèle' },
                    { v: 'lock' as const, t: 'Comptage des locks' },
                    { v: 'calibre' as const, t: 'Prix par calibre' },
                    { v: 'longueur' as const, t: 'Grille par longueur' },
                  ]).map((c) => (
                    <button
                      key={c.v}
                      type="button"
                      className="trv-minibtn"
                      onClick={() => setSvcForm({ ...svcForm, modele: c.v })}
                      style={svcForm.modele === c.v
                        ? { background: 'var(--color-copper)', borderColor: 'var(--color-copper)', color: 'var(--color-ivoire)' }
                        : undefined}
                    >
                      {c.t}
                    </button>
                  ))}
                </div>
                <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 8, lineHeight: 1.55 }}>
                  {svcForm.modele === 'fixe' && 'Le prix du catalogue, le même pour toutes les têtes. Seul le Juste Prix personnel d’une cliente peut encore le moduler.'}
                  {svcForm.modele === 'modele' && 'Prix de base × le coefficient de la tranche de la cliente — le barème s’édite dans Finances › Le Juste Prix.'}
                  {svcForm.modele === 'lock' && 'Locks comptés × tarif, sans plancher. Tant que la tête n’est pas comptée, le prix s’annonce « dès ».'}
                  {svcForm.modele === 'calibre' && 'Un prix par tranche de locks — le prix de la tranche EST le prix, il ne se recalcule pas.'}
                  {svcForm.modele === 'longueur' && 'Trois prix saisis — court, mi-long, long. La longueur se choisit à la réservation et se fige sur le rendez-vous.'}
                </div>
                {/* ELLE PORTE UNE COMPOSITION MAIS GARDE SON PRIX — le dire,
                    sinon la fiche s'intitule « Le forfait » et propose quand
                    même un modèle de prix, sans qu'on sache lequel gagne. */}
                {svcForm.estForfait && (
                  <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--copper-50)', border: '1px solid var(--copper-300)', borderRadius: 3, fontFamily: 'var(--font-sans)', fontSize: 11.5, lineHeight: 1.55, color: 'var(--copper-700)' }}>
                    Cette fiche porte une composition mais garde <b style={{ fontWeight: 500 }}>son propre prix</b> —
                    le geste inclus l’accompagne, il ne le calcule pas. Pour qu’elle vaille sa
                    composition, pose une <b style={{ fontWeight: 500 }}>remise de forfait</b> (rubrique
                    « Ce qu’elle contient ») ou mets son prix à zéro ; le modèle de prix disparaîtra alors.
                  </div>
                )}
              </Field>
            )}
            {!prixParComposition(svcForm) && svcForm.modele === 'lock' && (
              <Field label="Tarif au lock (F CFA par lock)">
                <Input
                  inputMode="numeric"
                  value={svcForm.rate}
                  onChange={(e) => setSvcForm({ ...svcForm, rate: e.target.value })}
                  placeholder="Ex. 100"
                />
                {svcForm.rate && (
                  <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 6 }}>
                    250 locks → {fmtMoney(250 * (num(svcForm.rate) ?? 0), currency)}.
                  </div>
                )}
                {/* LE TARIF PEUT CHANGER AVEC LA LONGUEUR (16 août). Renseignés,
                    ces trois-là PRIMENT sur le tarif unique du dessus, et le
                    prix de la même longueur devient le PLANCHER : le comptage
                    ne fait jamais descendre sous le prix affiché. */}
                <div style={{ marginTop: 14, borderTop: '1px solid var(--hairline)', paddingTop: 12 }}>
                  <div className="trc-microlabel" style={{ margin: '0 0 8px' }}>
                    Le tarif change-t-il avec la longueur ?
                  </div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 108px 118px', gap: 8, fontFamily: 'var(--font-sans)', fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>
                      <span>Longueur</span><span>F / lock</span><span>Plancher</span>
                    </div>
                    {LONGUEURS.map((l) => (
                      <div key={l.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 108px 118px', gap: 8, alignItems: 'center' }}>
                        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5 }}>{l.label}</span>
                        <Input
                          inputMode="numeric"
                          value={svcForm.tarifLong[l.id] ?? ''}
                          onChange={(e) => setSvcForm({ ...svcForm, tarifLong: { ...svcForm.tarifLong, [l.id]: e.target.value } })}
                          placeholder="—"
                        />
                        <Input
                          inputMode="numeric"
                          value={svcForm.prixLong[l.id] ?? ''}
                          onChange={(e) => setSvcForm({ ...svcForm, prixLong: { ...svcForm.prixLong, [l.id]: e.target.value } })}
                          placeholder="—"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 8, lineHeight: 1.55 }}>
                    Le prix vaut <b style={{ fontWeight: 500 }}>locks × tarif de sa longueur</b>, jamais moins que
                    le plancher. Tant que la tête n’est pas comptée, c’est le plancher qui s’annonce.
                    Laisse ces cases vides pour garder un tarif unique.
                  </div>
                </div>
              </Field>
            )}
            {!prixParComposition(svcForm) && svcForm.modele === 'calibre' && (
              <Field label="Le prix de chaque calibre">
                <div className="tr-grid tr-grid--2" style={{ gap: 10 }}>
                  {bands.map((b) => (
                    <label key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, width: 66, color: 'var(--ink-soft)' }}>
                        {b.name ?? bandRange(b, bands)}
                      </span>
                      <Input
                        inputMode="numeric"
                        value={svcForm.floors[b.id] ?? ''}
                        onChange={(e) => setSvcForm({ ...svcForm, floors: { ...svcForm.floors, [b.id]: e.target.value } })}
                        placeholder="—"
                      />
                    </label>
                  ))}
                </div>
                <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 6 }}>
                  Une case vide : la tranche retombe sur le prix du catalogue.
                </div>
              </Field>
            )}
            {!prixParComposition(svcForm) && svcForm.modele === 'longueur' && (
              <Field label="Prix et durée par longueur">
                <div style={{ display: 'grid', gap: 8 }}>
                  {LONGUEURS.map((l) => (
                    <div key={l.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 108px 96px', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5 }}>
                        {l.label}
                        <span className="mnd-muted" style={{ fontSize: 11, marginLeft: 6 }}>{l.hint}</span>
                      </span>
                      <Input
                        inputMode="numeric"
                        value={svcForm.prixLong[l.id] ?? ''}
                        onChange={(e) => setSvcForm({ ...svcForm, prixLong: { ...svcForm.prixLong, [l.id]: e.target.value } })}
                        placeholder="prix"
                      />
                      <Input
                        inputMode="numeric"
                        value={svcForm.dureeLong[l.id] ?? ''}
                        onChange={(e) => setSvcForm({ ...svcForm, dureeLong: { ...svcForm.dureeLong, [l.id]: e.target.value } })}
                        placeholder="min"
                      />
                    </div>
                  ))}
                </div>
                <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 6 }}>
                  Une case vide retombe sur le prix et la durée de l’essentiel.
                </div>
              </Field>
            )}
            {/* LES CALIBRES QU'ELLE SERT (13 août). À 300 locks, DEUX créations
                s'affichaient prixées : Création Medium ne portait pas la
                restriction de ses sœurs — et rien à l'écran ne permettait de la
                poser. Vaut aussi pour un forfait (GBÈJÍ™ Fidélité sert Micro et
                Nano). Le juge est `servesBand` : hors de ces calibres, la
                prestation n'est ni proposée ni prixée — « hors calibre ». */}
            </BlocPliant>
              );
            })()}
                </Bloc>
              )}

              {rubrique === 'temps' && (
                <Bloc titre="Le temps" aide="ce qu'elle occupe au fauteuil, et en combien de venues">
              <div className="tr-grid tr-grid--2">
                <Field label="Durée (minutes)">
                  <Input inputMode="numeric" value={svcForm.durationMin} onChange={(e) => setSvcForm({ ...svcForm, durationMin: e.target.value })} placeholder="120" />
                </Field>
                <Field label="Nombre de séances">
                  <span className="trv-stepper">
                    <button className="trv-sq" onClick={() => setSvcForm({ ...svcForm, sessions: Math.max(1, svcForm.sessions - 1) })}>−</button>
                    <span className="val" style={{ fontSize: 18 }}>{svcForm.sessions}</span>
                    <button className="trv-sq" onClick={() => setSvcForm({ ...svcForm, sessions: Math.min(12, svcForm.sessions + 1) })}>+</button>
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--ink-soft)' }}>séance{svcForm.sessions > 1 ? 's' : ''}</span>
                  </span>
                </Field>
              </div>
              <Field label="Durée haute">
                <Input inputMode="numeric" value={svcForm.durationMax} onChange={(e) => setSvcForm({ ...svcForm, durationMax: e.target.value })} placeholder="« 3h à 4h30 »" />
              </Field>
                </Bloc>
              )}

              {rubrique === 'contient' && (
                <>
            {svcForm.estForfait && (
            <Bloc titre="La composition" aide="ce que le forfait couvre réellement">
            <Field label="Prestations et produits inclus">
              {svcForm.includes.length === 0 && (
                <div className="mnd-muted" style={{ fontSize: 12, padding: '4px 0 8px' }}>
                  Aucun — cette prestation se vend seule.
                </div>
              )}
              {svcForm.includes.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 84px 26px', gap: 8, marginBottom: 4 }}>
                  <span className="mnd-muted" style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase' }}>Prestation</span>
                  <span className="mnd-muted" style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase' }}>Semaines</span>
                  <span />
                </div>
              )}
              {svcForm.includes.map((inc, i) => (
                /* `minmax(0,1fr)` et non `1fr` : sans le minimum a zero, un
                   `<select>` dont le libelle est long refuse de se retrecir et
                   pousse les colonnes suivantes hors du cadre — c'est ce qui
                   faisait deborder la fenetre et sortir la colonne semaines. */
                <div key={`inc-${i}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 84px 26px', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                  <select
                    className="ds-select"
                    style={{ minWidth: 0, width: '100%' }}
                    value={inc.categoryId ? `cat:${inc.categoryId}` : inc.productId ? `prod:${inc.productId}` : inc.serviceId}
                    onChange={(e) => {
                      const v = e.target.value;
                      const cat = v.startsWith('cat:') ? v.slice(4) : undefined;
                      const prod = v.startsWith('prod:') ? v.slice(5) : undefined;
                      setSvcForm({
                        ...svcForm,
                        includes: svcForm.includes.map((x, j) => (j === i
                          ? { ...x, serviceId: cat || prod ? '' : v, categoryId: cat, productId: prod }
                          : x)),
                      });
                    }}
                  >
                    <option value="">Choisir une prestation ou un produit…</option>
                    {/* SELON LE CALIBRE — la prestation reelle sera choisie a la
                        reservation d'apres le modele de la cliente. Un seul
                        forfait couvre alors les cinq densites. */}
                    <optgroup label="Selon le calibre de la cliente">
                      {categories
                        /* ON NE PROPOSE QUE LE NIVEAU LE PLUS PRECIS. Depuis que
                           les reprises sont une famille, GBEJI et SINSIN
                           designaient la meme chose — le sous-arbre fait que
                           viser le parent trouve l'enfant. Deux entrees pour un
                           seul resultat n'offrent pas un choix, seulement une
                           hesitation. On ne liste donc que les categories qui
                           portent DIRECTEMENT des prestations au calibre.
                           La resolution, elle, continue de descendre l'arbre :
                           un forfait pose avant la mise en familles marche
                           toujours. */
                        .filter((c) => services.some((sv) => sv.categoryId === c.id
                          && Object.keys(sv.priceFloors ?? {}).length))
                        .map((c) => (
                          <option key={`cat-${c.id}`} value={`cat:${c.id}`}>
                            {c.fon} · la prestation de son calibre
                          </option>
                        ))}
                    </optgroup>
                    {/* LES PRODUITS AUSSI. Un forfait promet souvent un flacon
                        ou une trousse : sans eux, sa valeur affichee etait
                        incomplete et la promesse ne vivait que dans le texte. */}
                    {products.length > 0 && (
                      <optgroup label="Un produit de la Gamme">
                        {[...products].sort((a, b) => a.name.localeCompare(b.name)).map((pr) => (
                          <option key={`prod-${pr.id}`} value={`prod:${pr.id}`}>{pr.name}</option>
                        ))}
                      </optgroup>
                    )}
                    {/* RANGÉES COMME AU RENDEZ-VOUS (15 août) — l'ordre
                        alphabétique mêlait les mondes : on cherchait un
                        shampoing entre une pédicure et un module. Par monde,
                        puis par atelier, chacun dans son ordre saisi. */}
                    {prestaParAtelier.rangees.map((grp, gj) => {
                      const libres = grp.list.filter((sv) => sv.id !== svcForm.id);
                      if (!libres.length) return null;
                      const monde = mondeDeCat(grp.cat, categories);
                      const prec = gj > 0 ? mondeDeCat(prestaParAtelier.rangees[gj - 1].cat, categories) : null;
                      return (
                        <Fragment key={`inc-${grp.cat.id}`}>
                          {(gj === 0 || monde !== prec) && <optgroup label={`━━ ${mondeLabel(monde)} ━━`} />}
                          <optgroup label={`${grp.cat.fon} · ${grp.cat.label}`}>
                            {libres.map((sv) => <option key={sv.id} value={sv.id}>{sv.name}</option>)}
                          </optgroup>
                        </Fragment>
                      );
                    })}
                    {prestaParAtelier.orphelines.some((sv) => sv.id !== svcForm.id) && (
                      <optgroup label="Autres">
                        {prestaParAtelier.orphelines
                          .filter((sv) => sv.id !== svcForm.id)
                          .map((sv) => <option key={sv.id} value={sv.id}>{sv.name}</option>)}
                      </optgroup>
                    )}
                  </select>
                  <Input
                    inputMode="numeric"
                    style={{ width: '100%', minWidth: 0, textAlign: 'center' }}
                    value={inc.afterWeeks ? String(inc.afterWeeks) : ''}
                    onChange={(e) => setSvcForm({
                      ...svcForm,
                      includes: svcForm.includes.map((x, j) => (j === i
                        ? { ...x, afterWeeks: parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || undefined }
                        : x)),
                    })}
                    placeholder="semaines"
                  />
                  <button
                    type="button"
                    onClick={() => setSvcForm({ ...svcForm, includes: svcForm.includes.filter((_, j) => j !== i) })}
                    style={{ cursor: 'pointer', background: 'none', border: 'none', color: 'var(--ink-soft)', fontSize: 16, lineHeight: 1, padding: 0 }}
                    title="Retirer cette ligne"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setSvcForm({ ...svcForm, includes: [...svcForm.includes, { serviceId: '' }] })}
                style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0, fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--copper-600)', textDecoration: 'underline', textUnderlineOffset: 2 }}
              >
                + Ajouter une ligne au forfait
              </button>
              {inclusValeur > 0 && (
                /* CE QUE LE FORFAIT PROMET, CE QU'IL COUTE, CE QU'IL OFFRE.
                   Composer un pack a l'aveugle revenait a deviner la remise :
                   on additionne donc les prestations retenues au prix catalogue
                   et on montre l'ecart avec le prix demande. */
                <div style={{ marginTop: 12, padding: '12px 14px', background: 'var(--color-sable)', borderRadius: 4 }}>
                  {[
                    ['Valeur des prestations incluses', inclusValeur, 'var(--ink)'],
                    [remisePct !== undefined ? `Prix du forfait · remise ${remisePct} %` : 'Prix du forfait',
                     inclusPrix, 'var(--ink)'],
                  ].map(([label, val]) => (
                    <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontFamily: 'var(--font-sans)', fontSize: 12.5, marginBottom: 5 }}>
                      <span>{label as string}</span>
                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(val as number, currency)}</span>
                    </div>
                  ))}
                  {prixParModele.length > 0 ? (
                    <div style={{ margin: '2px 0 8px', paddingTop: 6, borderTop: '1px solid var(--line)' }}>
                      <div className="mnd-muted" style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 6 }}>
                        Le prix par modèle
                      </div>
                      {prixParModele.map(({ b, valeur, prix }) => (
                        <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontFamily: 'var(--font-sans)', fontSize: 12, marginBottom: 3 }}>
                          <span className="mnd-muted">{b.name ?? bandRange(b, bands)}</span>
                          {prix == null ? (
                            <span className="mnd-muted" title="Aucune prestation de la composition ne sert ce calibre.">—</span>
                          ) : (
                            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                              <span className="mnd-muted" style={{ textDecoration: 'line-through', marginRight: 8 }}>{fmtMoney(valeur, currency)}</span>
                              {fmtMoney(prix, currency)}
                            </span>
                          )}
                        </div>
                      ))}
                      <div className="mnd-muted" style={{ fontSize: 10.5, lineHeight: 1.5, marginTop: 4 }}>
                        Tête type au plafond de chaque calibre — une prestation comptée au lock suit
                        le comptage exact de la cliente au moment de réserver.
                      </div>
                    </div>
                  ) : inclusFamilles > 0 && inclusValeurHaute > inclusValeur && (
                    <div className="mnd-muted" style={{ fontSize: 11.5, marginBottom: 6, lineHeight: 1.5 }}>
                      {inclusFamilles} prestation{inclusFamilles > 1 ? 's' : ''} varie{inclusFamilles > 1 ? 'nt' : ''} avec
                      la densité — la valeur va de {fmtMoney(inclusValeur, currency)} à
                      {' '}{fmtMoney(inclusValeurHaute, currency)} selon la tête
                      {remisePct !== undefined && (
                        <>, et la cliente paiera donc de {fmtMoney(inclusPrix, currency)} à
                        {' '}{fmtMoney(inclusPrixHaut, currency)}</>
                      )}. Les lignes ci-dessus retiennent la borne basse.
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingTop: 6, borderTop: '1px solid var(--line)', fontFamily: 'var(--font-sans)', fontSize: 13 }}>
                    <span style={{ color: inclusEcart > 0 ? 'var(--copper-700)' : 'var(--ink-soft)' }}>
                      {inclusEcart > 0 ? 'Économie pour la cliente' : inclusEcart < 0 ? 'Majoration' : 'Ni remise ni majoration'}
                    </span>
                    <span style={{ fontVariantNumeric: 'tabular-nums', color: inclusEcart > 0 ? 'var(--copper-700)' : 'var(--ink-soft)' }}>
                      {inclusEcart > 0 ? '− ' : ''}{fmtMoney(Math.abs(inclusEcart), currency)}
                      {inclusValeur > 0 ? ` · ${Math.round((inclusEcart / inclusValeur) * 100)} %` : ''}
                    </span>
                  </div>
                </div>
              )}
              {inclusPaires.length > 0 && (
                <Field label="Remise du forfait (% de sa composition) — facultatif">
                  <Input
                    inputMode="numeric"
                    value={svcForm.forfaitRemise}
                    onChange={(e) => setSvcForm({ ...svcForm, forfaitRemise: e.target.value })}
                    placeholder="Laisser vide pour garder le prix annoncé ci-dessus"
                  />
                  <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 6, lineHeight: 1.55 }}>
                    {!svcForm.forfaitRemise.trim() && inclusPrix === 0
                      ? <span style={{ color: 'var(--copper-700)' }}>Prix à 0 F et sans remise : le forfait vaudra la
                        somme entière de ses prestations. Saisis un pourcentage, ou un prix plus haut.</span>
                      : svcForm.forfaitRemise.trim()
                      ? <>Somme des prestations au prix de la cliente, moins {parseInt(svcForm.forfaitRemise.replace(/[^0-9]/g, ''), 10) || 0} % —
                        chaque tête a son montant exact, ta marge reste la même.</>
                      : <>Prix fixe, le même pour toutes : une tête dense reçoit plus de valeur qu’une tête légère.</>}
                  </div>
                </Field>
              )}
              <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 10, lineHeight: 1.55 }}>
                « Semaines » dit quand la prestation est due — vide pour le jour même, 6 pour un
                entretien à six semaines. Les échéances deviennent des rendez-vous posés au carnet,
                couverts par le forfait, à 0 F.
              </div>
            </Field>
            {/* LE COMPTE DES DUREES appartient a la composition : c'est elle
                qu'il resume, et il se recalcule a chaque ligne ajoutee. */}
            {inclusPaires.length > 0 && (
              <div style={{ padding: '11px 14px', background: 'var(--color-sable)', borderRadius: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontFamily: 'var(--font-sans)', fontSize: 12.5 }}>
                  <span>Visite d’ouverture · {jourMeme.length} prestation{jourMeme.length > 1 ? 's' : ''} le jour même</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {dureeJour} min{dureeJourHaute > dureeJour ? ` à ${dureeJourHaute} min` : ''}
                  </span>
                </div>
                {suites.length > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontFamily: 'var(--font-sans)', fontSize: 12.5, marginTop: 5, color: 'var(--ink-soft)' }}>
                    <span>Séances à venir · {suites.length} rendez-vous séparés</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{dureeSuites} min au total</span>
                  </div>
                )}
                <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 8, lineHeight: 1.55 }}>
                  La durée de l’essentiel ne retient que le jour même : les séances à échéance sont
                  d’autres rendez-vous.
                </div>
              </div>
            )}
            </Bloc>
            )}
                  {!svcForm.estForfait && (
                    <div className="trf-empty">
                      Cette prestation ne promet rien d'autre qu'elle-même. Ouvrez une composition
                      depuis « ＋ Nouveau forfait » si elle doit en couvrir d'autres.
                    </div>
                  )}
                </>
              )}

              {rubrique === 'tetes' && (
                <Bloc titre="Qui peut la prendre" aide="les têtes à qui elle est proposée — et prixée">
                  {/* LE SALON SOUVERAIN (15 août) — « quand quelqu'un réserve,
                      le salon est bloqué pour ce temps ; maximum 2 têtes ».
                      Le plafond est un CHAMP, pas une constante : la Maison
                      change d'avis sans qu'on touche au code. */}
                  <Field label="Elle privatise le salon">
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="trv-minibtn"
                        style={svcForm.privatise ? { background: 'var(--color-copper)', borderColor: 'var(--color-copper)', color: 'var(--color-ivoire)' } : undefined}
                        onClick={() => setSvcForm({ ...svcForm, privatise: !svcForm.privatise })}
                      >
                        {svcForm.privatise ? 'Oui — la Maison ferme' : 'Non — un fauteuil parmi d’autres'}
                      </button>
                      {svcForm.privatise && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <span className="mnd-muted" style={{ fontSize: 12 }}>au plus</span>
                          <Input
                            inputMode="numeric"
                            style={{ width: 68, textAlign: 'center' }}
                            value={svcForm.maxTetes}
                            onChange={(e) => setSvcForm({ ...svcForm, maxTetes: e.target.value.replace(/[^0-9]/g, '') })}
                            aria-label="Nombre de têtes au plus"
                          />
                          <span className="mnd-muted" style={{ fontSize: 12 }}>tête{(parseInt(svcForm.maxTetes, 10) || 0) > 1 ? 's' : ''}</span>
                        </span>
                      )}
                    </div>
                    <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 6, lineHeight: 1.5 }}>
                      Réservée, elle ne prend pas un fauteuil : elle prend le salon. Toute sa durée est
                      bloquée au calendrier, personne d’autre n’y entre, et le rituel refuse la tête de trop.
                    </div>
                  </Field>
            <Field label="Les calibres qu'elle sert">
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {bands.map((b) => {
                  const on = svcForm.bandIds.includes(b.id);
                  return (
                    <button
                      key={b.id}
                      type="button"
                      className="trv-minibtn"
                      style={on ? { background: 'var(--color-copper)', borderColor: 'var(--color-copper)', color: 'var(--color-ivoire)' } : undefined}
                      onClick={() => setSvcForm({
                        ...svcForm,
                        bandIds: on ? svcForm.bandIds.filter((x) => x !== b.id) : [...svcForm.bandIds, b.id],
                      })}
                    >
                      {b.name ?? bandRange(b, bands)}
                    </button>
                  );
                })}
              </div>
              <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 6, lineHeight: 1.5 }}>
                {svcForm.bandIds.length
                  ? 'Réservée à ces calibres — pour les autres têtes : « hors calibre », jamais proposée ni prixée.'
                  : 'Aucune coche : elle sert toutes les têtes, quel que soit le calibre.'}
              </div>
            </Field>
            <Field label="Réservée aux comptes famille">
              <button
                type="button"
                className="trv-minibtn"
                style={svcForm.reserveFamilles ? { background: 'var(--color-copper)', borderColor: 'var(--color-copper)', color: 'var(--color-ivoire)' } : undefined}
                onClick={() => setSvcForm({ ...svcForm, reserveFamilles: !svcForm.reserveFamilles })}
              >
                {svcForm.reserveFamilles ? 'Oui — familles seulement' : 'Non — ouverte à toutes'}
              </button>
              <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 6, lineHeight: 1.5 }}>
                Réservée : seules les têtes rattachées à un compte famille la voient — tunnel de
                Ma Couronne, accueil et modale de rendez-vous. Le Pack Famille vit ici.
              </div>
            </Field>
            {/* LES GESTES DE LA MAISON (15 août, décisions de Yéman) :
                « quand les Pico et Galaxy font une réservation de reprise
                essentielle ou élaborée, le shampoing est offert » puis
                « 50 % le shampoing dès qu'une coloration est sélectionnée ».
                DEUX règles sur la même prestation — d'où une liste, et un
                pourcentage par règle. Elles se posent ICI, sur la prestation
                qui BAISSE, et valent au comptoir comme dans le tunnel de Ma
                Couronne : même juge (`remiseGestePct`), donc le prix annoncé
                est le prix encaissé. */}
                </Bloc>
              )}

              {rubrique === 'gestes' && (
                <Bloc titre="Les gestes de la maison" aide="quand son prix baisse parce qu'une autre est au même rituel">
            <Field label="Les gestes de la maison">
              <div style={{ display: 'grid', gap: 10 }}>
                {svcForm.gestes.map((g, gi) => {
                  const majGeste = (patch: Partial<typeof g>) => setSvcForm({
                    ...svcForm,
                    gestes: svcForm.gestes.map((x, i) => (i === gi ? { ...x, ...patch } : x)),
                  });
                  return (
                    <div key={gi} className="mnd-bande" style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--ink-soft)' }}>
                          Elle perd
                        </span>
                        <Input
                          inputMode="numeric"
                          style={{ width: 74 }}
                          value={g.pct}
                          onChange={(e) => majGeste({ pct: e.target.value.replace(/[^0-9]/g, '') })}
                        />
                        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--ink-soft)' }}>
                          % de son prix{(parseInt(g.pct, 10) || 0) >= 100 ? ' — elle est offerte' : ''}, avec :
                        </span>
                        <button
                          type="button"
                          className="trv-minibtn"
                          style={{ marginLeft: 'auto' }}
                          title="Retirer ce geste"
                          onClick={() => setSvcForm({ ...svcForm, gestes: svcForm.gestes.filter((_, i) => i !== gi) })}
                        >
                          Retirer
                        </button>
                      </div>
                      <div style={{ marginTop: 8 }}>
                        <Select
                          value=""
                          onChange={(e) => {
                            const id = e.target.value;
                            if (id && !g.serviceIds.includes(id)) majGeste({ serviceIds: [...g.serviceIds, id] });
                          }}
                        >
                          <option value="">Ajouter un déclencheur…</option>
                          {prestaParAtelier.rangees.map((grp, gj) => {
                            const libres = grp.list.filter((x) => x.id !== svcForm.id && !g.serviceIds.includes(x.id));
                            if (!libres.length) return null;
                            const monde = mondeDeCat(grp.cat, categories);
                            const prec = gj > 0 ? mondeDeCat(prestaParAtelier.rangees[gj - 1].cat, categories) : null;
                            return (
                              <Fragment key={grp.cat.id}>
                                {(gj === 0 || monde !== prec) && <optgroup label={`━━ ${mondeLabel(monde)} ━━`} />}
                                <optgroup label={`${grp.cat.fon} · ${grp.cat.label}`}>
                                  {libres.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                                </optgroup>
                              </Fragment>
                            );
                          })}
                          {prestaParAtelier.orphelines.some((x) => x.id !== svcForm.id && !g.serviceIds.includes(x.id)) && (
                            <optgroup label="Autres">
                              {prestaParAtelier.orphelines
                                .filter((x) => x.id !== svcForm.id && !g.serviceIds.includes(x.id))
                                .map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                            </optgroup>
                          )}
                        </Select>
                      </div>
                      {g.serviceIds.length > 0 && (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                          {g.serviceIds.map((id) => (
                            <button
                              key={id}
                              type="button"
                              className="trv-minibtn"
                              title="Retirer ce déclencheur"
                              onClick={() => majGeste({ serviceIds: g.serviceIds.filter((x) => x !== id) })}
                            >
                              {services.find((x) => x.id === id)?.name ?? 'prestation retirée'} ×
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 10, marginBottom: 4 }}>
                        Pour quels calibres ? Aucune coche : pour toutes les têtes.
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {bands.map((b) => {
                          const on = g.bandIds.includes(b.id);
                          return (
                            <button
                              key={b.id}
                              type="button"
                              className="trv-minibtn"
                              style={on ? { background: 'var(--color-copper)', borderColor: 'var(--color-copper)', color: 'var(--color-ivoire)' } : undefined}
                              onClick={() => majGeste({ bandIds: on ? g.bandIds.filter((x) => x !== b.id) : [...g.bandIds, b.id] })}
                            >
                              {b.name ?? bandRange(b, bands)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              <button
                type="button"
                className="trv-minibtn"
                style={{ marginTop: svcForm.gestes.length ? 10 : 0 }}
                onClick={() => setSvcForm({ ...svcForm, gestes: [...svcForm.gestes, { serviceIds: [], bandIds: [], pct: '100' }] })}
              >
                ＋ Ajouter un geste
              </button>
              <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 8, lineHeight: 1.5 }}>
                Son prix baisse dès qu'un des déclencheurs est au même rituel — le prix plein reste
                affiché, barré, pour que la cliente voie le geste. Deux gestes qui tombent ensemble ne
                se cumulent pas : c'est le plus généreux qui s'applique. Sans geste : elle se paie
                toujours plein tarif.
              </div>
            </Field>
                </Bloc>
              )}
            </div>
          </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <Button variant="ghost" onClick={() => setSvcForm(null)}>Annuler</Button>
              <Button variant="copper" style={{ flex: 1 }} onClick={saveSvc}>Enregistrer la prestation</Button>
            </div>
          </div>
        </Modal>
      )}

      {prodForm && (
        <Modal title={prodForm.id ? 'Le produit Maison.' : 'Nouveau produit Maison.'} onClose={() => setProdForm(null)} width={520}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="Nom du produit">
              <Input value={prodForm.name} onChange={(e) => setProdForm({ ...prodForm, name: e.target.value })} placeholder="Ex. Le Sérum Moringa & Prêle" />
            </Field>
            <Field label="Catégorie ™">
              <Select value={prodForm.categoryId} onChange={(e) => setProdForm({ ...prodForm, categoryId: e.target.value })}>
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>{c.fon} · {c.label}</option>
                ))}
              </Select>
            </Field>
            <div className="tr-grid tr-grid--2">
              <Field label="Prix conseillé (F CFA)">
                <Input inputMode="numeric" value={prodForm.price} onChange={(e) => setProdForm({ ...prodForm, price: e.target.value })} placeholder="12 000" />
              </Field>
              <Field label="Stock">
                <Input inputMode="numeric" value={prodForm.stock} onChange={(e) => setProdForm({ ...prodForm, stock: e.target.value })} placeholder="0" />
              </Field>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <Button variant="ghost" onClick={() => setProdForm(null)}>Annuler</Button>
              <Button variant="copper" style={{ flex: 1 }} onClick={saveProd} disabled={!prodForm.name.trim()}>{prodForm.id ? 'Enregistrer le produit' : 'Inscrire à la gamme'}</Button>
            </div>
          </div>
        </Modal>
      )}

      {progAtelier && (
        <ProgrammerAuComptage
          cat={categories.find((c) => c.id === progAtelier)!}
          categories={categories}
          services={services}
          bandes={bands}
          currency={currency}
          onClose={() => setProgAtelier(null)}
          onAppliquer={(patchs) => {
            setServices((prev) => prev.map((s) => (patchs[s.id] ? { ...s, ...patchs[s.id] } : s)));
            setProgAtelier(null);
          }}
        />
      )}

      {catForm && (
        <Modal title={catForm.id ? 'La catégorie.' : 'Nouvelle catégorie.'} onClose={() => setCatForm(null)} width={480}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* UNE FAMILLE DE RITUELS SOUS SON ATELIER. GBEJI porte les SINSIN,
                les KLOKLO, les DANDAN. La famille n'a ni maison ni bareme
                propres : elle herite de son atelier, et tout ce qui les lit
                remonte jusqu'a lui. */}
            <Field label="Rattachée à un atelier — facultatif">
              <select
                className="ds-select"
                value={catForm.parentId}
                onChange={(e) => setCatForm({ ...catForm, parentId: e.target.value })}
              >
                <option value="">Aucun — c’est un atelier</option>
                {categories
                  .filter((c) => !c.parentId && c.id !== catForm.id)
                  .sort((a, b) => a.order - b.order)
                  .map((c) => (
                    <option key={c.id} value={c.id}>{c.fon} · {c.label}</option>
                  ))}
              </select>
              <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 5, lineHeight: 1.55 }}>
                Laisser vide pour un atelier. Choisir un atelier en fait une famille de rituels rangée
                sous lui — les SÍNSIN™ sous GBÈJÍ™, par exemple. Une famille hérite de la maison et du
                barème de son atelier ; inutile de les redéfinir.
              </div>
            </Field>
            <Field label="Code de la catégorie">
              <Input
                value={catForm.fon}
                onChange={(e) => setCatForm({ ...catForm, fon: e.target.value })}
                placeholder="Ex. VÈKPÈ™"
                style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--color-indigo)' }}
              />
            </Field>
            <Field label="Libellé · ce qu’elle regroupe">
              <Input value={catForm.label} onChange={(e) => setCatForm({ ...catForm, label: e.target.value })} placeholder="Ex. Pose & structure" />
            </Field>
            {/* LA MAISON — le catalogue du Trône est commun à toute la Maison :
                c'est ce champ, et non la branche, qui sépare l'Atelier du Studio.
                Sans maison, la catégorie est du PLATEAU : elle se vend des deux
                côtés, ce que la règle 5 de l'arborescence appelle « une même
                ligne, deux origines de vente ». */}
            <Field label="Maison">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[{ k: '' as const, label: 'Plateau — les deux' }, ...MAISONS.map((m) => ({ k: m.k, label: m.fon }))].map((m) => (
                  <button
                    key={m.k || 'plateau'}
                    type="button"
                    className={`trv-palier-chip ${catForm.maison === m.k ? 'is-active' : ''}`}
                    onClick={() => setCatForm({ ...catForm, maison: m.k })}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Code ERP">
              <Input value={catForm.code} onChange={(e) => setCatForm({ ...catForm, code: e.target.value })} placeholder="ATL·II · PLT·05 · STU·A" />
            </Field>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--ink)', cursor: 'pointer' }}>
              <input type="checkbox" checked={catForm.enabled} onChange={(e) => setCatForm({ ...catForm, enabled: e.target.checked })} />
              Visible aux clientes (Vitrine / Ma Couronne)
            </label>
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <Button variant="ghost" onClick={() => setCatForm(null)}>Annuler</Button>
              <Button variant="copper" style={{ flex: 1 }} onClick={saveCat}>Enregistrer la catégorie</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Le détail derrière le chiffre d'une prestation — quelles clientes, quand,
          pour quelle part. Seul moyen de distinguer deux prestations homonymes. */}
      {drill && <DrillModal drill={drill} onClose={() => setDrill(null)} />}
    </div>
  );
}

/* ═══ PROGRAMMER UN ATELIER AU COMPTAGE DES LOCKS ═══════════════════
   16 août 2026, demande de Yéman : « programme l'atelier VÈKPÈ au comptage
   avec trois niveaux de prix par longueur — 1 100 / 1 200 / 1 300 du Jumbo au
   Mini, 1 400 / 1 500 / 1 600 du Micro au Galaxy ».

   Poser cela fiche par fiche, c'est six formulaires et dix-huit chiffres :
   autant d'occasions de se tromper d'un zéro, et rien pour relire l'ensemble.
   Ici on saisit DEUX grilles, on dit quels calibres suivent laquelle, et
   l'aperçu montre — avant d'écrire — ce que chaque prestation deviendra au
   bas et au haut de sa tranche.

   LE PRIX AFFICHÉ D'AUJOURD'HUI DEVIENT LE PLANCHER (décision de Yéman) : le
   comptage ne peut que monter le prix, jamais le baisser. Une prestation qui
   n'a pas encore de grille par longueur garde donc son prix catalogue comme
   plancher des trois longueurs. */
type GrilleTarif = { court: string; 'mi-long': string; long: string };

function ProgrammerAuComptage({
  cat, categories, services, bandes, currency, onClose, onAppliquer,
}: {
  cat: CatalogCategory;
  categories: CatalogCategory[];
  services: Service[];
  bandes: ModelBand[];
  currency: string;
  onClose: () => void;
  onAppliquer: (patchs: Record<string, Partial<Service>>) => void;
}) {
  /* L'atelier ET ses familles : les Créations vivent souvent un cran plus bas. */
  const sousArbre = new Set(sousArbreOf(categories, cat.id));
  /* Les forfaits ne se comptent pas au lock — ils valent leur composition. */
  const concernees = services
    .filter((s) => sousArbre.has(s.categoryId) && !s.includes?.length)
    .sort((a, b) => a.order - b.order);

  const [grilleA, setGrilleA] = useState<GrilleTarif>({ court: '1100', 'mi-long': '1200', long: '1300' });
  const [grilleB, setGrilleB] = useState<GrilleTarif>({ court: '1400', 'mi-long': '1500', long: '1600' });
  /* Quels calibres suivent la grille B — les autres suivent la A. */
  const [enB, setEnB] = useState<string[]>(['cal-micro', 'cal-nano', 'cal-pico', 'cal-galaxy']);

  const n = (v: string) => parseInt(v.replace(/[^0-9]/g, ''), 10) || 0;
  const grilleDe = (s: Service): GrilleTarif =>
    (s.bandIds ?? []).some((b) => enB.includes(b)) ? grilleB : grilleA;

  /* Les bornes de la tranche d'une prestation — pour dire ce que ça donne en
     bas et en haut. Sans calibre servi, on ne promet rien. */
  const bornes = (s: Service): [number, number] | null => {
    const servis = bandes.filter((b) => (s.bandIds ?? []).includes(b.id));
    if (!servis.length) return null;
    const i0 = bandes.findIndex((b) => b.id === servis[0].id);
    const bas = i0 > 0 ? (bandes[i0 - 1].maxLocks ?? 0) + 1 : 1;
    const haut = servis[servis.length - 1].maxLocks ?? bas;
    return [bas, haut];
  };
  /* Le plancher d'une longueur : sa grille de prix si elle en a une, sinon le
     prix catalogue — jamais rien, sinon le filet n'existerait pas. */
  const plancherDe = (s: Service, l: LongueurId): number => s.prixParLongueur?.[l] ?? s.priceXof;

  const patchs: Record<string, Partial<Service>> = {};
  for (const s of concernees) {
    const g = grilleDe(s);
    patchs[s.id] = {
      tarifMode: 'lock',
      ratePerLock: undefined,
      tarifLockParLongueur: { court: n(g.court), 'mi-long': n(g['mi-long']), long: n(g.long) },
      prixParLongueur: {
        court: plancherDe(s, 'court'),
        'mi-long': plancherDe(s, 'mi-long'),
        long: plancherDe(s, 'long'),
      },
      scalesWithModel: undefined,
      priceFloors: undefined,
    };
  }

  return (
    <Modal title={`Programmer ${cat.fon} au comptage.`} onClose={onClose} width={860}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div className="mnd-muted" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
          Le prix vaudra <b style={{ fontWeight: 500 }}>locks × le tarif de sa longueur</b>, sans jamais
          descendre sous le prix affiché aujourd’hui — qui devient le plancher. Une tête pas encore
          comptée s’annonce à ce plancher. {concernees.length} prestation{concernees.length > 1 ? 's' : ''} de
          cet atelier {concernees.length > 1 ? 'sont' : 'est'} concernée{concernees.length > 1 ? 's' : ''} ;
          les forfaits n’y sont pas.
        </div>

        <div className="tr-grid tr-grid--2" style={{ gap: 14 }}>
          {([['A', grilleA, setGrilleA] as const, ['B', grilleB, setGrilleB] as const]).map(([nom, g, set]) => (
            <div key={nom} style={{ border: '1px solid var(--hairline)', borderRadius: 4, padding: '14px 16px' }}>
              <div className="trc-microlabel" style={{ margin: '0 0 10px' }}>Grille {nom} · F par lock</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {LONGUEURS.map((l) => (
                  <div key={l.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 110px', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5 }}>{l.label}</span>
                    <Input
                      inputMode="numeric"
                      value={g[l.id as keyof GrilleTarif]}
                      onChange={(e) => set({ ...g, [l.id]: e.target.value })}
                    />
                  </div>
                ))}
              </div>
              <div className="mnd-muted" style={{ fontSize: 11, marginTop: 10 }}>
                {nom === 'A' ? 'Suivie par tous les calibres non cochés ci-dessous.' : 'Suivie par les calibres cochés ci-dessous.'}
              </div>
            </div>
          ))}
        </div>

        <div>
          <div className="trc-microlabel" style={{ margin: '0 0 8px' }}>Quels calibres suivent la grille B ?</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {bandes.map((b) => (
              <button
                key={b.id}
                type="button"
                className="trv-minibtn"
                style={enB.includes(b.id)
                  ? { background: 'var(--color-copper)', borderColor: 'var(--color-copper)', color: 'var(--color-ivoire)' }
                  : undefined}
                onClick={() => setEnB((prev) => (prev.includes(b.id) ? prev.filter((x) => x !== b.id) : [...prev, b.id]))}
              >
                {b.name}
              </button>
            ))}
          </div>
        </div>

        {/* L'APERÇU — ce que chaque fiche deviendra, avant d'écrire. */}
        <div>
          <div className="trc-microlabel" style={{ margin: '0 0 8px' }}>Ce que ça donnera</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {concernees.map((s) => {
              const g = grilleDe(s);
              const b = bornes(s);
              return (
                <div key={s.id} style={{ border: '1px solid var(--hairline)', borderRadius: 4, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                    <span style={{ fontFamily: 'var(--font-serif)', fontSize: 15, color: 'var(--color-indigo)' }}>{s.name}</span>
                    <span className="mnd-muted" style={{ fontSize: 11 }}>
                      grille {grilleDe(s) === grilleB ? 'B' : 'A'}
                      {b ? ` · ${b[0]}–${b[1]} locks` : ' · aucun calibre servi'}
                    </span>
                  </div>
                  <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 5, lineHeight: 1.6 }}>
                    {LONGUEURS.map((l) => {
                      const tarif = n(g[l.id as keyof GrilleTarif]);
                      const plancher = plancherDe(s, l.id);
                      const bas = b ? Math.max(b[0] * tarif, plancher) : plancher;
                      const haut = b ? Math.max(b[1] * tarif, plancher) : plancher;
                      return (
                        <span key={l.id} style={{ marginRight: 14, whiteSpace: 'nowrap' }}>
                          <b style={{ fontWeight: 500 }}>{l.label}</b> {fmtMoney(bas, currency)}
                          {haut !== bas ? ` → ${fmtMoney(haut, currency)}` : ''}
                          <span style={{ color: 'var(--copper-700)' }}> (plancher {fmtMoney(plancher, currency)})</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {concernees.length === 0 && (
              <div className="mnd-muted" style={{ fontSize: 12 }}>
                Aucune prestation à programmer dans cet atelier.
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button
            disabled={concernees.length === 0}
            onClick={() => {
              if (!window.confirm(`Programmer ${concernees.length} prestation(s) de « ${cat.fon} » au comptage des locks ? Les prix affichés d'aujourd'hui deviennent leurs planchers.`)) return;
              onAppliquer(patchs);
            }}
          >
            Programmer {concernees.length} prestation{concernees.length > 1 ? 's' : ''}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
