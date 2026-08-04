import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHead } from '../_ui';
import { Button, Field, Input, Modal, Select, Textarea } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { sousArbreOf, type ServiceInclus, type TarifMode,
  useCategories, useServices, useProducts,
  QUATRE_TEMPS, fmtDuration, priceModeOf, PRICE_MODES,
  markServiceRemoved, MAISONS,
  type CatalogCategory, type Service, type Product, type PriceMode, type Maison,
} from '../../../../shared/catalog';
import { uid } from '../../../../shared/store';
import { appointmentsStore, useAppointments } from '../../../../shared/agenda';
import { useClients } from '../../../../shared/clients';
import { apptNetXof, useServicesById, DrillModal, dayOf, type Drill } from '../clients/_shared';
import { scalesWithModel, useModelBands, bandRange, sortedBands } from '../../../../shared/pricing';
import { FILL_DESCRIPTIONS, REWRITE_DESCRIPTIONS, DESC_REV } from './serviceDescriptions';
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
  includes: ServiceInclus[]; // prestations reellement couvertes par un forfait
  forfaitRemise: string; // remise du forfait, en % de sa composition
  estForfait: boolean; // un forfait porte une composition ; une prestation, non
  floors: Record<string, string>; // plancher par calibre, saisi en texte
  durationMax: string; // borne haute quand la durée s'annonce en fourchette
  priceTo: string; // borne haute d'affichage — « de X à Y »
};

const emptySvcForm = (categoryId: string, master: string, estForfait = false): SvcForm => ({
  id: null, categoryId, name: '', description: '', price: '', priceMode: 'fixe', palier: 'Fondation', durationMin: '60', sessions: 1, master,
  code: '', rate: '', tarifMode: '', includes: [], forfaitRemise: '', estForfait, floors: {}, durationMax: '', priceTo: '',
});

/** Champs numériques du formulaire : « 45 000 » comme « 45000 » donnent 45000 ;
    une saisie vide rend undefined pour que le champ DISPARAISSE de la fiche au
    lieu d'y écrire un zéro qui vaudrait « gratuit ». */
const num = (s: string): number | undefined => {
  const n = parseInt(String(s).replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};


type CatForm = { id: string | null; fon: string; label: string; enabled: boolean; maison: Maison | ''; code: string; parentId: string };

type ProdForm = { id: string | null; categoryId: string; name: string; price: string; stock: string };
const emptyProdForm = (categoryId: string): ProdForm => ({ id: null, categoryId, name: '', price: '', stock: '0' });

export default function Catalogue() {
  const { branch, currency } = useBranch();
  const [categories, setCategories] = useCategories();
  const [services, setServices] = useServices();
  const [products, setProducts] = useProducts();
  /* Les calibres, triés : ils commandent la saisie des planchers du tarif au lock. */
  const [rawBands] = useModelBands();
  const bands = sortedBands(rawBands);

  const [svcForm, setSvcForm] = useState<SvcForm | null>(null);
  const [catForm, setCatForm] = useState<CatForm | null>(null);
  const [prodForm, setProdForm] = useState<ProdForm | null>(null);
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

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
    const today = new Date().toISOString().slice(0, 10);
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
  /* L'ORDRE DE L'ARBRE : chaque atelier, puis ses familles a la suite. Trier a
     plat melait les familles aux ateliers et l'ecran ne montrait plus la
     composition — GBEJI et ses SINSIN se retrouvaient a des bouts opposes de la
     page selon leur rang. Une famille orpheline (atelier supprime) remonte au
     rang des ateliers plutot que de disparaitre. */
  const cats = useMemo(() => {
    const rang = [...categories].sort((a, b) => a.order - b.order);
    const racines = rang.filter((c) => !c.parentId || !categories.some((p2) => p2.id === c.parentId));
    return racines.flatMap((r) => [r, ...rang.filter((c) => c.parentId === r.id)]);
  }, [categories]);

  /* LES QUATRE ENSEMBLES DU CATALOGUE. 24 catégories à la suite, c'est un mur :
     on ne voit plus ni le Studio ni le plateau, noyés au milieu de l'Atelier.
     Le regroupement suit l'arborescence v6 — deux maisons, un plateau commun,
     et l'Académie à part. L'ordre des catégories reste celui de `order` : le
     titre d'ensemble s'insère quand on change de groupe, il ne retrie rien. */
  const groupeDe = (c: CatalogCategory): { k: string; titre: string; sous: string } => {
    if (c.maison === 'atelier') return { k: 'atelier', titre: 'ATELIER MND™', sous: 'Les locks exclusivement' };
    if (c.maison === 'studio') return { k: 'studio', titre: 'STUDIO MND · ACƆ™', sous: 'Le cheveu afro dans tous ses styles' };
    if (c.id.startsWith('aca-')) return { k: 'academie', titre: 'MND ACADÉMIE', sous: 'La transmission' };
    if (c.produits || c.id === 'home-rituals' || c.id === 'meches') return { k: 'gamme', titre: 'LA GAMME', sous: 'Produits — voir aussi l’écran Produits' };
    return { k: 'plateau', titre: 'LE PLATEAU TECHNIQUE', sous: 'Commun aux deux maisons — une même ligne, deux origines de vente' };
  };
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
  const matchSvc = (s: Service) => !q || s.name.toLowerCase().includes(q) || (s.description ?? '').toLowerCase().includes(q);
  const matchProd = (p: Product) => !q || p.name.toLowerCase().includes(q);
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
  const moveCat = (cat: CatalogCategory, dir: -1 | 1) => {
    const idx = cats.findIndex((c) => c.id === cat.id);
    const other = cats[idx + dir];
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
  const inclusPrix = parseInt((svcForm?.price ?? '').replace(/[^0-9]/g, ''), 10) || 0;
  const inclusEcart = inclusValeur - inclusPrix;

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
    const v6 = {
      code: svcForm.code.trim() || undefined,
      ratePerLock: num(svcForm.rate),
      tarifMode: svcForm.tarifMode || undefined,
      includes: svcForm.includes.length ? svcForm.includes : undefined,
      forfaitRemisePct: svcForm.forfaitRemise.trim() === '' ? undefined : Math.max(0, Math.min(100, parseInt(svcForm.forfaitRemise.replace(/[^0-9]/g, ''), 10) || 0)),
      priceFloors: Object.keys(floors).length ? floors : undefined,
      durationMaxMin: num(svcForm.durationMax),
      priceToXof: num(svcForm.priceTo),
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
  const patchProd = (id: string, patch: Partial<Product>) =>
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const openProdEdit = (prod: Product) =>
    setProdForm({ id: prod.id, categoryId: prod.categoryId, name: prod.name, price: String(prod.priceXof), stock: String(prod.stock) });

  const saveProd = () => {
    if (!prodForm || !prodForm.name.trim()) return;
    const price = parseInt(prodForm.price.replace(/[^0-9]/g, ''), 10) || 0;
    const stock = parseInt(prodForm.stock.replace(/[^0-9]/g, ''), 10) || 0;
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 16px', flexWrap: 'wrap' }}>
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
        const prods = (isOrphan ? orphanProds : prodsOf(cat.id)).filter(matchProd);
        const count = list.length + prods.length;
        const catMatches = !q || cat.fon.toLowerCase().includes(q) || cat.label.toLowerCase().includes(q);
        /* En recherche : on masque les catégories sans aucune correspondance. */
        if (q && count === 0 && !catMatches) return null;
        /* Replié uniquement hors recherche — une recherche déplie tout. */
        const open = !q && !collapsed.has(cat.id);
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
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 17, letterSpacing: '.04em' }}>{g.titre}</span>
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
                    <button className="trv-minibtn" title="Modifier la catégorie" onClick={() => setCatForm({ id: cat.id, fon: cat.fon, label: cat.label, enabled: cat.enabled, maison: cat.maison ?? '', code: cat.code ?? '' , parentId: cat.parentId ?? '' })}>
                      Modifier
                    </button>
                    <button className="trv-minibtn" title="Supprimer la catégorie" onClick={() => deleteCat(cat)}>
                      Supprimer
                    </button>
                    <button className="trv-sq" title="Monter" disabled={ci === 0} onClick={() => moveCat(cat, -1)}>↑</button>
                    <button className="trv-sq" title="Descendre" disabled={ci === renderCats.length - 1} onClick={() => moveCat(cat, 1)}>↓</button>
                  </span>
                </>
              )}
            </div>

            {open && (
            <>
            <div className="trv-catblock__filet" />

            <div className="trv-catblock__body tr-grid tr-grid--2">
              {list.map((svc, si) => (
                <article key={svc.id} className="trv-svc">
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
                      <button className="trv-sq" title="Retirer une unité" onClick={() => patchProd(p.id, { stock: Math.max(0, p.stock - 1) })}>−</button>
                      <span className="val">{p.stock}</span>
                      <button className="trv-sq" title="Ajouter une unité" onClick={() => patchProd(p.id, { stock: p.stock + 1 })}>+</button>
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
        <Modal title={svcForm.id ? (svcForm.estForfait ? 'Le forfait.' : 'La prestation.') : (svcForm.estForfait ? 'Nouveau forfait.' : 'Nouvelle prestation.')} onClose={() => setSvcForm(null)} width={600}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="Nom de la prestation">
              <Input value={svcForm.name} onChange={(e) => setSvcForm({ ...svcForm, name: e.target.value })} placeholder="Ex. Création microlocks" />
            </Field>
            <Field label="Description · la voix de la Maison">
              <Textarea
                value={svcForm.description}
                onChange={(e) => setSvcForm({ ...svcForm, description: e.target.value })}
                placeholder="Ce que cette prestation accomplit, en une ou deux phrases souveraines…"
              />
            </Field>
            <div className="tr-grid tr-grid--2">
              <Field label="Catégorie ™">
                <Select value={svcForm.categoryId} onChange={(e) => setSvcForm({ ...svcForm, categoryId: e.target.value })}>
                  {cats.map((c) => (
                    <option key={c.id} value={c.id}>{c.fon} · {c.label}</option>
                  ))}
                </Select>
              </Field>
              <Field label={svcForm.priceMode === 'variable' ? 'Prix de départ (F CFA)' : svcForm.priceMode === 'devis' ? 'Prix indicatif (facultatif)' : 'Prix (F CFA)'}>
                <Input inputMode="numeric" value={svcForm.price} onChange={(e) => setSvcForm({ ...svcForm, price: e.target.value })} placeholder="45 000" />
              </Field>
            </div>
            <Field label="Mode de prix">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
              </div>
              <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 6, lineHeight: 1.5 }}>
                {svcForm.priceMode === 'fixe'
                  ? 'Prix ferme — facturé tel quel.'
                  : svcForm.priceMode === 'variable'
                    ? 'Affiché « à partir de » ; le montant réel se fixe au fauteuil (à la prise de rendez-vous).'
                    : 'Aucun prix affiché — « sur devis ». Le montant se saisit à la prise de rendez-vous.'}
              </div>
            </Field>
            {/* ── LE TARIF AU LOCK ──────────────────────────────────────────
                Ce que la densité fait varier se compte lock par lock : la
                création VÈKPÈ™, le resserrage SÍNSIN™, le démontage PLT·70.
                Le plancher de chaque calibre empêche un petit compte de locks
                de tomber sous le tarif de la Maison — le temps de fauteuil ne
                descend pas aussi vite que le nombre de locks. */}
            {/* ── LES PRESTATIONS INCLUSES ──────────────────────────────────
                Un forfait n'est pas une phrase : c'est un ensemble de gestes
                reels. Tant qu'ils n'etaient que du texte, rien ne savait ce
                qui restait du a la cliente, ces gestes ne comptaient dans
                aucune statistique, et les seances de suivi se perdaient. */}
            {svcForm.estForfait && (
            <Field label="Prestations incluses dans ce forfait">
              {svcForm.includes.length === 0 && (
                <div className="mnd-muted" style={{ fontSize: 12, padding: '4px 0 8px' }}>
                  Aucune — cette prestation se vend seule.
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
                    value={inc.categoryId ? `cat:${inc.categoryId}` : inc.serviceId}
                    onChange={(e) => {
                      const v = e.target.value;
                      const cat = v.startsWith('cat:') ? v.slice(4) : undefined;
                      setSvcForm({
                        ...svcForm,
                        includes: svcForm.includes.map((x, j) => (j === i
                          ? { ...x, serviceId: cat ? '' : v, categoryId: cat }
                          : x)),
                      });
                    }}
                  >
                    <option value="">Choisir une prestation…</option>
                    {/* SELON LE CALIBRE — la prestation reelle sera choisie a la
                        reservation d'apres le modele de la cliente. Un seul
                        forfait couvre alors les cinq densites. */}
                    <optgroup label="Selon le calibre de la cliente">
                      {categories
                        .filter((c) => {
                          const sa = sousArbreOf(categories, c.id);
                          return services.some((sv) => sa.has(sv.categoryId) && Object.keys(sv.priceFloors ?? {}).length);
                        })
                        .map((c) => (
                          <option key={`cat-${c.id}`} value={`cat:${c.id}`}>
                            {c.fon} · la prestation de son calibre
                          </option>
                        ))}
                    </optgroup>
                    <optgroup label="Une prestation précise">
                      {services
                        .filter((sv) => sv.id !== svcForm.id)
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((sv) => (
                          <option key={sv.id} value={sv.id}>{sv.name}</option>
                        ))}
                    </optgroup>
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
                + Ajouter une prestation incluse
              </button>
              {inclusValeur > 0 && (
                /* CE QUE LE FORFAIT PROMET, CE QU'IL COUTE, CE QU'IL OFFRE.
                   Composer un pack a l'aveugle revenait a deviner la remise :
                   on additionne donc les prestations retenues au prix catalogue
                   et on montre l'ecart avec le prix demande. */
                <div style={{ marginTop: 12, padding: '12px 14px', background: 'var(--color-sable)', borderRadius: 4 }}>
                  {[
                    ['Valeur des prestations incluses', inclusValeur, 'var(--ink)'],
                    ['Prix du forfait', inclusPrix, 'var(--ink)'],
                  ].map(([label, val]) => (
                    <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontFamily: 'var(--font-sans)', fontSize: 12.5, marginBottom: 5 }}>
                      <span>{label as string}</span>
                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(val as number, currency)}</span>
                    </div>
                  ))}
                  {inclusFamilles > 0 && inclusValeurHaute > inclusValeur && (
                    <div className="mnd-muted" style={{ fontSize: 11.5, marginBottom: 6, lineHeight: 1.5 }}>
                      {inclusFamilles} prestation{inclusFamilles > 1 ? 's' : ''} varie{inclusFamilles > 1 ? 'nt' : ''} avec
                      la densité — la valeur du forfait va de {fmtMoney(inclusValeur, currency)} à
                      {' '}{fmtMoney(inclusValeurHaute, currency)} selon la tête. La ligne ci-dessus retient
                      la borne basse ; l’économie réelle sera plus forte sur une tête dense.
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
                      ? <span style={{ color: 'var(--copper-700)' }}>Le prix saisi plus haut est à 0 F : le forfait
                        vaudra donc la <strong style={{ fontWeight: 500 }}>somme entière</strong> de ses prestations au
                        prix de la cliente, sans remise. Saisis un pourcentage ici pour accorder une remise, ou un prix
                        plus haut pour vendre à prix fixe.</span>
                      : svcForm.forfaitRemise.trim()
                      ? <>Le forfait vaudra la somme de ses prestations <strong style={{ fontWeight: 500 }}>au prix
                        de la cliente</strong>, moins {parseInt(svcForm.forfaitRemise.replace(/[^0-9]/g, ''), 10) || 0} %.
                        Chaque tête a donc son montant exact, et ta marge reste la même sur toutes.
                        Le prix saisi plus haut ne sert alors plus qu'à l'affichage en vitrine.</>
                      : <>Vide : le forfait se vend au prix fixe saisi plus haut, le même pour toutes.
                        Une tête dense reçoit alors bien plus de valeur qu'une tête légère pour la même somme.</>}
                  </div>
                </Field>
              )}
              <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 10, lineHeight: 1.55 }}>
                La colonne « semaines » dit quand la prestation est due. Laisser vide pour le jour même ;
                6 pour un entretien à six semaines. Les lignes à échéance deviennent des rendez-vous
                posés au carnet dès la réservation du forfait, couverts par lui, à 0 F.
              </div>
            </Field>
            )}
            <Field label="Qui commande le prix">
              <select
                className="ds-select"
                value={svcForm.tarifMode}
                onChange={(e) => setSvcForm({ ...svcForm, tarifMode: e.target.value as '' | TarifMode })}
              >
                <option value="">Automatique — le tarif au lock s’il existe, la tranche sinon</option>
                <option value="lock">Le comptage — locks × tarif, le plancher n’est qu’un filet</option>
                <option value="calibre">La tranche — le plancher du calibre EST le prix</option>
              </select>
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--ink-soft)', marginTop: 5, lineHeight: 1.5 }}>
                Le tarif au lock reste inscrit dans les deux cas : basculer sur « la tranche » le met en
                sommeil sans l’effacer, et tu peux le réveiller quand il t’arrange.
              </div>
            </Field>
            <Field label="Tarif au lock (F CFA par lock)">
              <Input
                inputMode="numeric"
                value={svcForm.rate}
                onChange={(e) => setSvcForm({ ...svcForm, rate: e.target.value })}
                placeholder="Laisser vide si le prix ne dépend pas du nombre de locks"
              />
              <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 6, lineHeight: 1.5 }}>
                {svcForm.rate
                  ? `Le prix se compte lock par lock, sans plafond. Une cliente de 250 locks paierait ${(250 * (num(svcForm.rate) ?? 0)).toLocaleString('fr-FR')} F — sauf si le plancher de son calibre est plus élevé.`
                  : 'Vide : le prix ne suit pas la densité. C’est le cas de tout le Plateau et du Studio.'}
              </div>
            </Field>
            {svcForm.rate && (
              <Field label="Plancher par calibre — le prix ne descend jamais en dessous">
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
              </Field>
            )}
            <div className="tr-grid tr-grid--2">
              <Field label="Code ERP">
                <Input value={svcForm.code} onChange={(e) => setSvcForm({ ...svcForm, code: e.target.value })} placeholder="ATL·II·MIN·E" />
              </Field>
              <Field label="Prix haut affiché (facultatif)">
                <Input inputMode="numeric" value={svcForm.priceTo} onChange={(e) => setSvcForm({ ...svcForm, priceTo: e.target.value })} placeholder="« de 15 000 à 25 000 »" />
              </Field>
            </div>
            <div className="tr-grid tr-grid--2">
              {inclusPaires.length > 0 && (
              <div style={{ gridColumn: '1 / -1', padding: '11px 14px', background: 'var(--color-sable)', borderRadius: 4, marginBottom: 4 }}>
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
                  La durée ci-dessous se recalcule à chaque prestation ajoutée ou retirée : elle ne retient
                  que le jour même. Les séances à échéance sont d’autres rendez-vous, avec leur propre durée —
                  les additionner ici bloquerait des heures de fauteuil pour des gestes qui n’auront pas lieu.
                  Tu peux toujours saisir une durée à la main ; elle tiendra jusqu’à la prochaine modification
                  de la composition.
                </div>
              </div>
            )}
            <Field label="Durée (minutes)">
                <Input inputMode="numeric" value={svcForm.durationMin} onChange={(e) => setSvcForm({ ...svcForm, durationMin: e.target.value })} placeholder="120" />
              </Field>
              <Field label="Durée haute (facultatif)">
                <Input inputMode="numeric" value={svcForm.durationMax} onChange={(e) => setSvcForm({ ...svcForm, durationMax: e.target.value })} placeholder="« 3h à 4h30 »" />
              </Field>
            </div>
            <div className="tr-grid tr-grid--2">
              <Field label="Maître assigné">
                <Select value={svcForm.master} onChange={(e) => setSvcForm({ ...svcForm, master: e.target.value })}>
                  {[...new Set([svcForm.master, ...masters])].filter(Boolean).map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Nombre de séances">
              <span className="trv-stepper">
                <button className="trv-sq" onClick={() => setSvcForm({ ...svcForm, sessions: Math.max(1, svcForm.sessions - 1) })}>−</button>
                <span className="val" style={{ fontSize: 18 }}>{svcForm.sessions}</span>
                <button className="trv-sq" onClick={() => setSvcForm({ ...svcForm, sessions: Math.min(12, svcForm.sessions + 1) })}>+</button>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--ink-soft)' }}>séance{svcForm.sessions > 1 ? 's' : ''}</span>
              </span>
            </Field>
            <Field label="Palier d’expérience">
              <div style={{ display: 'flex', gap: 8 }}>
                {PALIERS.map((p) => (
                  <button key={p} className={`trv-palier-chip ${svcForm.palier === p ? 'is-active' : ''}`} onClick={() => setSvcForm({ ...svcForm, palier: p })}>
                    {p}
                  </button>
                ))}
              </div>
            </Field>
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
