import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Input, Segs, toast, demande } from '../../../../ds/components';
import { WaLien } from '../_ui';
import { useEstDirection } from '../_vie';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { asset } from '../../../../shared/asset';
import { useStore } from '../../../../shared/store';
import { vitrineConfigStore } from '../../../../shared/bridges';
import { categoriesStore, productsStore, useCategories, useProducts, type Product } from '../../../../shared/catalog';
import { invoicesStore, useInvoices, usePayments, invoiceTotal, invoiceRegleXof, invoiceResteXof } from '../../../../shared/finance';
import { bougerStockGamme, corrigerStockGamme, litQuantite, venteGamme } from '../../../../shared/stock';
import { jourEnLettres } from '../../../../shared/calendrier';
import {
  RAYONS, CATEGORIE_BOUTIQUE, CATEGORIE_BOUTIQUE_SEMENCE, articlesAPoser, boutiqueOuverte,
  ouvertureDepuisSaisie, saisieDepuisOuverture, etatDeLArticle, moisDeLEdition, moisAvant, MOIS,
  shortDe, titreDe, cleDuNumero, commandeDeLaReference, type RayonId,
} from '../../../../shared/boutique-pur';
import { reglerLaCommande, motDuRefus } from '../../../../shared/boutique-serveur';
import { usePrevenir, prevenirStore, estDeLaBoutique, type PieceDeBoutique, type EtatDeCommande } from '../../../../shared/boutique-store';
import { BandeDeVitrine, Pastille } from './VitrineSite';
import { frShortAn, dayOf, todayISO, useBranchClients } from './_shared';
import './vitrine-boutique.css';

/* ══ LA BOUTIQUE, AU TRÔNE — 22 octobre 2026 ═════════════════════════════
   « Construis la boutique de la Maison avec ses produits » (Yéman), sur la
   maquette 8dE2BEat… validée. Cinquième vitrine : ce que le site et Ma
   Couronne vendent, et tout ce qui se tient d'ici.

   UNE PAGE, CINQ QUESTIONS, dans l'ordre où on se les pose :
   ① est-elle ouverte au public, et à partir de quand ;
   ② que vend-elle, à quel prix, avec quel stock (par rayon, replié) ;
   ③ quelles commandes attendent, et où elles en sont ;
   ④ un paiement en ligne est-il resté sans sa pièce ;
   ⑤ qui attend un article « Bientôt ».

   Le juge est `shared/boutique-pur.ts` : l'état d'un article, l'ouverture,
   les saisons se lisent là, jamais ici. Le stock suit les mêmes gestes que
   Stock & Achats : un clic est un mouvement du journal quand la fiche
   d'inventaire existe, l'ancien compteur sinon. */

const lienSite = 'https://maisonmnd.com/boutique/';
const imageDe = (f?: string) => (f ? asset(`/assets/boutique/${f}`) : '');
const minuscule = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/** « mardi 1 décembre 2026 à 9 h 00 », l'heure de Cotonou, l'année toujours. */
function instantEnClair(ouverture: string | undefined): string {
  const local = saisieDepuisOuverture(ouverture);
  if (!local) return '';
  const [jour, heure] = local.split('T');
  const [h, m] = heure.split(':');
  return `${minuscule(jourEnLettres(jour))} à ${Number(h)} h ${m}`;
}

const ETAT_MOTS: Record<EtatDeCommande, string> = { 'a-preparer': 'À préparer', prete: 'Prête', remise: 'Remise' };
const etatDe = (p: PieceDeBoutique): EtatDeCommande => p.boutique.etat ?? 'a-preparer';
const prenomDe = (nom: string | undefined) => (nom ?? '').trim().split(/\s+/)[0] ?? '';

export function VitrineBoutique() {
  const { branch, currency } = useBranch();
  const direction = useEstDirection();
  const navigate = useNavigate();
  const [cfg] = useStore(vitrineConfigStore);
  const [categories] = useCategories();
  const [products, setProducts] = useProducts();
  const [invoices] = useInvoices();
  const [payments] = usePayments();
  const [prevenir] = usePrevenir();
  const clients = useBranchClients();

  /* Le temps qui passe ouvre la Boutique : on relit l'heure toutes les 30 s. */
  const [maintenant, setMaintenant] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setMaintenant(new Date()), 30000);
    return () => window.clearInterval(t);
  }, []);

  const ouverture = cfg.boutique?.ouverture;
  const ouverte = boutiqueOuverte(ouverture, maintenant);
  const aPoser = useMemo(() => articlesAPoser(products), [products]);
  const articles = useMemo(() => products.filter((p) => p.boutique), [products]);
  const vendables = articles.filter((a) => etatDeLArticle(a, maintenant) === 'vendable').length;

  const pieces = useMemo(
    () => invoices
      .filter((i): i is PieceDeBoutique => i.branchId === branch.id && estDeLaBoutique(i))
      .sort((a, b) => (b.boutique.creeLe ?? b.date).localeCompare(a.boutique.creeLe ?? a.date)),
    [invoices, branch.id],
  );
  const aPreparer = pieces.filter((p) => etatDe(p) !== 'remise').length;

  return (
    <>
      <BandeDeVitrine
        couleur="var(--color-copper)"
        titre="La Boutique"
        dit="Les soins, les t-shirts de la Maison, MND 229 et MND Kids, vendus sur le site et dans Ma Couronne. Un seul catalogue : celui-ci."
      >
        <Pastille ton={ouverte ? 'ok' : 'attente'}>{ouverte ? 'Ouverte au public' : 'Fermée au public'}</Pastille>
        <Pastille>{vendables} en vente</Pastille>
        {aPreparer > 0 && <Pastille ton="attente">{aPreparer} commande{aPreparer > 1 ? 's' : ''} en cours</Pastille>}
      </BandeDeVitrine>

      <Ouverture ouverture={ouverture} ouverte={ouverte} direction={direction} />

      {aPoser.length > 0 && (
        <div className="tvb-bloc tvb-poser">
          <div>
            <div className="tvb-titre">Les articles ne sont pas encore au catalogue</div>
            <div className="mnd-muted tvb-dit">
              {aPoser.length} article{aPoser.length > 1 ? 's' : ''} de la maquette attend{aPoser.length > 1 ? 'ent' : ''} d’être posé{aPoser.length > 1 ? 's' : ''} : les soins avec vos premiers prix, les t-shirts, MND 229, MND Kids et les shorts.
              Rien d’existant n’est réécrit, ni un prix, ni un stock.
            </div>
          </div>
          <Button
            disabled={!direction}
            title={direction ? undefined : 'Réservé à la direction'}
            onClick={() => {
              if (!direction) return;
              if (!categories.some((c) => c.id === CATEGORIE_BOUTIQUE)) {
                const maxOrdre = categories.reduce((m, c) => Math.max(m, c.order), 0);
                categoriesStore.set((prev) => (prev.some((c) => c.id === CATEGORIE_BOUTIQUE) ? prev : [...prev, { ...CATEGORIE_BOUTIQUE_SEMENCE, order: Math.max(CATEGORIE_BOUTIQUE_SEMENCE.order, maxOrdre + 1) }]));
              }
              if ((cfg.hiddenCategories ?? []).includes(CATEGORIE_BOUTIQUE)) {
                vitrineConfigStore.set((c) => ({ ...c, hiddenCategories: (c.hiddenCategories ?? []).filter((x) => x !== CATEGORIE_BOUTIQUE) }));
              }
              setProducts((prev) => [...prev, ...articlesAPoser(prev)]);
              toast(`${aPoser.length} articles posés au catalogue.`);
            }}
          >
            Poser les {aPoser.length} articles de la Boutique
          </Button>
        </div>
      )}

      <Rayons articles={articles} maintenant={maintenant} setProducts={setProducts} branchId={branch.id} currency={currency} />

      <Commandes pieces={pieces} clients={clients} currency={currency} branchId={branch.id} navigate={navigate} />

      <ARapprocher payments={payments} invoices={invoices} currency={currency} />

      <APrevenirListe prevenir={prevenir.liste ?? []} articles={articles} clients={clients} />

      <div className="mnd-muted tvb-pied">
        La page publique : <a href={lienSite} target="_blank" rel="noreferrer">{lienSite}</a>. Avant l’ouverture, elle renvoie à l’accueil du site, le lien du menu reste caché et l’onglet Gamme de Ma Couronne aussi.
      </div>
    </>
  );
}

/* ── ① L'OUVERTURE ───────────────────────────────────────────────────── */
function Ouverture({ ouverture, ouverte, direction }: { ouverture?: string; ouverte: boolean; direction: boolean }) {
  const [saisie, setSaisie] = useState(() => saisieDepuisOuverture(ouverture));
  useEffect(() => { setSaisie(saisieDepuisOuverture(ouverture)); }, [ouverture]);
  const pose = (v: string) => {
    if (!direction) return;
    const iso = ouvertureDepuisSaisie(v);
    vitrineConfigStore.set((c) => ({ ...c, boutique: { ...(c.boutique ?? {}), ouverture: iso || undefined } }));
  };
  const etat = !ouverture
    ? 'Aucune date posée : la Boutique est fermée au public.'
    : ouverte
      ? `Ouverte au public depuis le ${instantEnClair(ouverture)}.`
      : `Fermée au public jusqu’au ${instantEnClair(ouverture)}. L’équipe la voit ici.`;
  return (
    <div className="tvb-bloc">
      <div className="tvb-titre">L’ouverture</div>
      <div className="mnd-muted tvb-dit">
        La Boutique reste invisible du public jusqu’à cet instant, heure de Cotonou. Vous pouvez le déplacer à tout moment, même la veille : rien n’est à republier.
      </div>
      <div className="tvb-ouverture">
        <label className="tvb-champ">
          <span>Ouverture au public</span>
          <Input
            type="datetime-local"
            value={saisie}
            disabled={!direction}
            onChange={(e) => setSaisie(e.target.value)}
            onBlur={() => { if (saisie !== saisieDepuisOuverture(ouverture)) pose(saisie); }}
            onKeyDown={(e) => { if (e.key === 'Enter') pose(saisie); }}
          />
        </label>
        {ouverture && direction && (
          <Button variant="ghost" size="sm" onClick={() => { setSaisie(''); vitrineConfigStore.set((c) => ({ ...c, boutique: { ...(c.boutique ?? {}), ouverture: undefined } })); }}>
            Retirer la date
          </Button>
        )}
      </div>
      <div className={`tvb-etat ${ouverte ? 'is-ok' : ''}`}>{etat}</div>
      {!direction && <div className="mnd-muted tvb-dit">La date se pose par la direction.</div>}
    </div>
  );
}

/* ── ② LES RAYONS ────────────────────────────────────────────────────── */
type Etiquette = { mot: string; ton?: 'ok' | 'attente' };
function etiquetteDe(a: Product, maintenant: Date): Etiquette {
  const f = a.boutique!;
  const e = etatDeLArticle(a, maintenant);
  if (e === 'vendable') return { mot: 'Vendable', ton: 'ok' };
  if (e === 'cache') {
    const m = moisDeLEdition(f.edition);
    return { mot: m ? `Hors saison · en vente en ${moisAvant(m)} et en ${MOIS[m - 1]}` : 'Caché' };
  }
  if (f.enVente === false) return { mot: 'Bientôt · retiré de la vente', ton: 'attente' };
  if (!(a.priceXof > 0)) return { mot: 'Bientôt · sans prix', ton: 'attente' };
  return { mot: 'Bientôt · sans stock', ton: 'attente' };
}

function Rayons({ articles, maintenant, setProducts, branchId, currency }: {
  articles: Product[];
  maintenant: Date;
  setProducts: (f: (prev: Product[]) => Product[]) => void;
  branchId: string;
  currency: string;
}) {
  const [ouvert, setOuvert] = useState<RayonId | null>(null);
  const [prixRayon, setPrixRayon] = useState('');
  const [prixShorts, setPrixShorts] = useState('');

  const patch = (id: string, next: Partial<Product>) =>
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...next } : p)));
  /* LES MÊMES GESTES QUE STOCK & ACHATS : un clic est un DELTA au journal,
     une quantité constatée est une CIBLE ; sans fiche d'inventaire, l'ancien
     compteur continue, sans borner à zéro. */
  const bouge = (p: Product, delta: number) => {
    if (bougerStockGamme(p.id, delta, 'Correction Boutique', todayISO(), branchId)) return;
    patch(p.id, { stock: p.stock + delta });
  };
  const corrige = (p: Product, nouvelle: number) => {
    if (nouvelle === p.stock) return;
    if (corrigerStockGamme(p.id, nouvelle, 'Correction Boutique', todayISO(), branchId)) return;
    patch(p.id, { stock: nouvelle });
  };
  const basculeVente = (p: Product) => {
    const f = p.boutique!;
    const { enVente: _ancien, ...reste } = f;
    patch(p.id, { boutique: f.enVente === false ? reste : { ...reste, enVente: false } });
  };

  const parRayon = (r: RayonId) => articles
    .filter((a) => a.boutique!.rayon === r && !a.boutique!.shortDe)
    .sort((x, y) => (x.boutique!.ordre - y.boutique!.ordre) || x.id.localeCompare(y.id));

  /* LE RÉSUMÉ ET LE DÉTAIL LISENT LA MÊME FONCTION (`etatDeLArticle`) : sinon
     ils se contredisent un jour sans que rien ne le signale. */
  const resume = (r: RayonId) => {
    const l = parRayon(r);
    const v = l.filter((a) => etatDeLArticle(a, maintenant) === 'vendable').length;
    const c = l.filter((a) => etatDeLArticle(a, maintenant) === 'cache').length;
    const b = l.length - v - c;
    return [`${l.length} article${l.length > 1 ? 's' : ''}`, `${v} vendable${v > 1 ? 's' : ''}`, b ? `${b} bientôt` : '', c ? `${c} hors saison` : ''].filter(Boolean).join(' · ');
  };

  if (!articles.length) return null;
  return (
    <div className="tvb-bloc">
      <div className="tvb-titre">Les articles, par rayon</div>
      <div className="mnd-muted tvb-dit">
        Vendable = en vente, avec un prix et du stock. Sans l’un des trois, l’article reste visible, « Bientôt », avec « Me prévenir ». Un rayon s’ouvre à la fois.
      </div>
      <div className="tvb-rayons">
        {RAYONS.map((r) => {
          const l = parRayon(r.id);
          if (!l.length) return null;
          const estOuvert = ouvert === r.id;
          const avecShorts = l.some((a) => shortDe(articles, a.id));
          return (
            <div key={r.id} className={`tvb-rayon ${estOuvert ? 'is-open' : ''}`}>
              <button
                type="button"
                className="tvb-rayon__tete"
                aria-expanded={estOuvert}
                onClick={() => { setOuvert(estOuvert ? null : r.id); setPrixRayon(''); setPrixShorts(''); }}
              >
                <span className="tvb-rayon__nom">{r.titre}</span>
                <span className="tvb-rayon__resume">{resume(r.id)}</span>
                <span aria-hidden="true" className="tvb-rayon__fleche">{estOuvert ? '−' : '+'}</span>
              </button>
              {estOuvert && (
                <div className="tvb-rayon__corps">
                  <div className="tvb-collante">Rayon : {r.titre}</div>
                  <div className="tvb-tout-le-rayon">
                    <label className="tvb-champ tvb-champ--ligne">
                      <span>Même prix pour tout le rayon</span>
                      <Input inputMode="numeric" value={prixRayon} placeholder="F CFA" onChange={(e) => setPrixRayon(e.target.value)} style={{ width: 120 }} />
                    </label>
                    <Button size="sm" variant="ghost" onClick={() => {
                      const n = parseInt(prixRayon.replace(/[^0-9]/g, ''), 10);
                      if (!(n > 0)) return;
                      const ids = new Set(l.map((a) => a.id));
                      setProducts((prev) => prev.map((p) => (ids.has(p.id) ? { ...p, priceXof: n } : p)));
                      toast(`${l.length} prix posés à ${fmtMoney(n, currency)}.`);
                      setPrixRayon('');
                    }}>Appliquer</Button>
                    {avecShorts && (
                      <>
                        <label className="tvb-champ tvb-champ--ligne">
                          <span>Même prix pour tous les shorts</span>
                          <Input inputMode="numeric" value={prixShorts} placeholder="F CFA" onChange={(e) => setPrixShorts(e.target.value)} style={{ width: 120 }} />
                        </label>
                        <Button size="sm" variant="ghost" onClick={() => {
                          const n = parseInt(prixShorts.replace(/[^0-9]/g, ''), 10);
                          if (!(n > 0)) return;
                          const ids = new Set(l.map((a) => shortDe(articles, a.id)?.id).filter(Boolean) as string[]);
                          setProducts((prev) => prev.map((p) => (ids.has(p.id) ? { ...p, priceXof: n } : p)));
                          toast(`${ids.size} shorts posés à ${fmtMoney(n, currency)}.`);
                          setPrixShorts('');
                        }}>Appliquer</Button>
                      </>
                    )}
                  </div>
                  {l.map((a) => {
                    const s = articles.find((p) => p.boutique?.shortDe === a.id);
                    return (
                      <div key={a.id} className="tvb-article-groupe">
                        <LigneArticle a={a} etiquette={etiquetteDe(a, maintenant)} patch={patch} bouge={bouge} corrige={corrige} basculeVente={basculeVente} />
                        {s && <LigneArticle a={s} sous etiquette={{ mot: s.boutique?.enVente === false ? 'Retiré' : !(s.priceXof > 0) ? 'Sans prix' : !(s.stock > 0) ? 'Sans stock' : 'Vendable', ton: s.priceXof > 0 && s.stock > 0 && s.boutique?.enVente !== false ? 'ok' : 'attente' }} patch={patch} bouge={bouge} corrige={corrige} basculeVente={basculeVente} />}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LigneArticle({ a, sous, etiquette, patch, bouge, corrige, basculeVente }: {
  a: Product;
  sous?: boolean;
  etiquette: Etiquette;
  patch: (id: string, next: Partial<Product>) => void;
  bouge: (p: Product, d: number) => void;
  corrige: (p: Product, n: number) => void;
  basculeVente: (p: Product) => void;
}) {
  const f = a.boutique!;
  const [prix, setPrix] = useState(a.priceXof > 0 ? String(a.priceXof) : '');
  const [stock, setStock] = useState(String(a.stock));
  useEffect(() => { setPrix(a.priceXof > 0 ? String(a.priceXof) : ''); }, [a.priceXof]);
  useEffect(() => { setStock(String(a.stock)); }, [a.stock]);
  const posePrix = () => {
    const n = parseInt(prix.replace(/[^0-9]/g, ''), 10) || 0;
    if (n !== a.priceXof) patch(a.id, { priceXof: n });
  };
  const poseStock = () => {
    const n = Math.round(litQuantite(stock) || 0);
    if (n !== a.stock) corrige(a, n);
  };
  const enVente = f.enVente !== false;
  return (
    <div className={`tvb-article ${sous ? 'tvb-article--short' : ''}`}>
      <span className="tvb-article__vignette">{f.image && <img src={imageDe(f.image)} alt="" loading="lazy" />}</span>
      <span className="tvb-article__nom">
        <span>{sous ? 'Son short' : titreDe(a)}</span>
        <span className="mnd-muted">{[f.format, sous ? '' : f.sous, f.edition].filter(Boolean).join(' · ')}</span>
      </span>
      <label className="tvb-champ tvb-champ--prix">
        <span className="tvb-sr">Prix de {a.name}</span>
        <Input inputMode="numeric" value={prix} placeholder="Prix" onChange={(e) => setPrix(e.target.value)} onBlur={posePrix} onKeyDown={(e) => { if (e.key === 'Enter') posePrix(); }} />
        <span className="mnd-muted">F</span>
      </label>
      <span className="tvb-stock" aria-label={`Stock de ${a.name}`}>
        <button type="button" onClick={() => bouge(a, -1)} aria-label={`Une pièce de moins, ${a.name}`}>−</button>
        <input value={stock} inputMode="numeric" onChange={(e) => setStock(e.target.value)} onBlur={poseStock} onKeyDown={(e) => { if (e.key === 'Enter') poseStock(); }} aria-label={`Quantité constatée, ${a.name}`} />
        <button type="button" onClick={() => bouge(a, 1)} aria-label={`Une pièce de plus, ${a.name}`}>+</button>
      </span>
      {!sous ? (
        <span className="tvb-vente">
          <button
            type="button"
            className={`trc-switch ${enVente ? 'is-on' : ''}`}
            onClick={() => basculeVente(a)}
            aria-label={enVente ? `Retirer ${a.name} de la vente` : `Remettre ${a.name} en vente`}
            title={enVente ? 'En vente, cliquer pour le passer en « Bientôt »' : 'Retiré, cliquer pour le remettre en vente'}
          />
        </span>
      ) : <span />}
      <span className="tvb-article__etat"><Pastille ton={etiquette.ton}>{etiquette.mot}</Pastille></span>
    </div>
  );
}

/* ── ③ LES COMMANDES ─────────────────────────────────────────────────── */
type Filtre = 'cours' | 'remises' | 'toutes';
function Commandes({ pieces, clients, currency, branchId, navigate }: {
  pieces: PieceDeBoutique[];
  clients: ReturnType<typeof useBranchClients>;
  currency: string;
  branchId: string;
  navigate: (to: string) => void;
}) {
  const [filtre, setFiltre] = useState<Filtre>('cours');
  const [ouverte, setOuverte] = useState<string | null>(null);
  const nomDe = (p: PieceDeBoutique) => p.clientName || clients.find((c) => c.id === p.clientId)?.name || 'Cliente à rattacher';
  const visibles = pieces.filter((p) => (filtre === 'toutes' ? true : filtre === 'remises' ? etatDe(p) === 'remise' : etatDe(p) !== 'remise'));

  const poseEtat = (p: PieceDeBoutique, etat: EtatDeCommande) =>
    invoicesStore.set((prev) => prev.map((i) => (i.id === p.id
      ? { ...i, boutique: { ...p.boutique, ...((i as PieceDeBoutique).boutique ?? {}), etat, ...(etat === 'prete' ? { preteLe: new Date().toISOString() } : {}), ...(etat === 'remise' ? { remiseLe: new Date().toISOString() } : {}) } } as typeof i
      : i)));

  const remiseFaite = async (p: PieceDeBoutique) => {
    const sorties = p.lines.filter((l) => l.produitId && l.qty > 0);
    if (!await demande({
      quoi: 'Commande de la Boutique',
      titre: `Remise faite pour ${p.number} ?`,
      dit: `${sorties.reduce((n, l) => n + l.qty, 0)} article${sorties.length > 1 ? 's' : ''} sortent du stock, référence ${p.number}.`,
      accepter: 'Oui, remise faite',
      refuser: 'Pas encore',
    })) return;
    /* LE STOCK SORT À LA REMISE, comme à la Caisse : au journal quand la fiche
       existe, sur l'ancien compteur sinon. */
    const sansFiche = sorties.filter((l) => !venteGamme(l.produitId!, l.qty, p.number, todayISO(), branchId));
    if (sansFiche.length) {
      productsStore.set((prev) => prev.map((prod) => {
        const q = sansFiche.filter((l) => l.produitId === prod.id).reduce((n, l) => n + l.qty, 0);
        return q ? { ...prod, stock: prod.stock - q } : prod;
      }));
    }
    poseEtat(p, 'remise');
    toast(`${p.number} : remise faite.`);
  };

  const rattacher = (p: PieceDeBoutique, clientId: string, nom: string) =>
    invoicesStore.set((prev) => prev.map((i) => (i.id === p.id ? { ...i, clientId, clientName: i.clientName || nom } : i)));

  return (
    <div className="tvb-bloc">
      <div className="tvb-entete">
        <div>
          <div className="tvb-titre">Les commandes</div>
          <div className="mnd-muted tvb-dit">Du site et de Ma Couronne. Elles sont aussi dans Factures, numérotées CMD.</div>
        </div>
        <Segs<Filtre>
          options={[{ value: 'cours', label: 'En cours' }, { value: 'remises', label: 'Remises' }, { value: 'toutes', label: 'Toutes' }]}
          value={filtre}
          onChange={setFiltre}
        />
      </div>
      {visibles.length === 0 && <div className="mnd-muted tvb-vide">{filtre === 'cours' ? 'Aucune commande en cours.' : 'Aucune commande ici.'}</div>}
      <div className="tvb-commandes">
        {visibles.map((p) => {
          const b = p.boutique;
          const total = invoiceTotal(p);
          const regle = invoiceRegleXof(p);
          const reste = invoiceResteXof(p);
          const enLigne = b.paiement === 'kkiapay';
          const estOuverte = ouverte === p.id;
          const numero = b.numero || clients.find((c) => c.id === p.clientId)?.phone || '';
          const prenom = prenomDe(nomDe(p) === 'Cliente à rattacher' ? '' : nomDe(p));
          const message = b.remise === 'livraison'
            ? `Bonjour${prenom ? ` ${prenom}` : ''}, votre commande Maison MND part aujourd’hui. Le livreur vous appelle avant d’arriver.${reste > 0 ? ` Reste à régler à la livraison : ${fmtMoney(reste, currency)}.` : ''}`
            : `Bonjour${prenom ? ` ${prenom}` : ''}, votre commande Maison MND est prête. Elle vous attend à l’accueil.${reste > 0 ? ` Reste à régler au retrait : ${fmtMoney(reste, currency)}.` : ''}`;
          const candidates = !p.clientId && cleDuNumero(numero).length === 8
            ? clients.filter((c) => cleDuNumero(c.phone) === cleDuNumero(numero) || cleDuNumero(c.phone2) === cleDuNumero(numero)).slice(0, 3)
            : [];
          return (
            <div key={p.id} className={`tvb-commande ${estOuverte ? 'is-open' : ''}`}>
              <button type="button" className="tvb-commande__tete" aria-expanded={estOuverte} onClick={() => setOuverte(estOuverte ? null : p.id)}>
                <span className="tvb-commande__num">{p.number}</span>
                <span className="tvb-commande__qui">{nomDe(p)}<span className="mnd-muted"> · {frShortAn(dayOf(b.creeLe) || p.date)}</span></span>
                <span className="tvb-commande__total">{fmtMoney(total, currency)}</span>
                <Pastille ton={reste <= 0 ? 'ok' : 'attente'}>{reste <= 0 ? (enLigne ? 'Réglée en ligne' : 'Réglée') : enLigne && regle === 0 ? 'Paiement en ligne non confirmé' : `À régler ${b.remise === 'livraison' ? 'à la livraison' : 'au retrait'}`}</Pastille>
                <Pastille ton={etatDe(p) === 'remise' ? 'ok' : undefined}>{ETAT_MOTS[etatDe(p)]}</Pastille>
              </button>
              {estOuverte && (
                <div className="tvb-commande__corps">
                  <div className="tvb-collante">Commande {p.number}</div>
                  <ul className="tvb-lignes">
                    {p.lines.map((l) => <li key={l.id}><span>{l.label}</span><span className="mnd-muted">{l.qty} × {fmtMoney(l.unitXof, currency)}</span></li>)}
                  </ul>
                  <div className="tvb-infos">
                    <div><span className="mnd-muted">Remise</span> {b.remise === 'livraison' ? `Livraison dans Cotonou${b.adresse ? ` : ${b.adresse}` : ''}` : 'Retrait à la Maison'}</div>
                    {numero && <div><span className="mnd-muted">WhatsApp</span> {numero}</div>}
                    <div><span className="mnd-muted">Passée</span> {b.origine === 'couronne' ? 'dans Ma Couronne' : 'sur le site'}, le {frShortAn(dayOf(b.creeLe) || p.date)}</div>
                    {reste > 0 && <div><span className="mnd-muted">Reste dû</span> {fmtMoney(reste, currency)}, à encaisser dans Factures</div>}
                  </div>
                  {candidates.length > 0 && (
                    <div className="tvb-rattacher">
                      <span className="mnd-muted">Même numéro que :</span>
                      {candidates.map((c) => <Button key={c.id} size="sm" variant="ghost" onClick={() => { rattacher(p, c.id, c.name); toast(`Rattachée à ${c.name}.`); }}>Rattacher à {c.name}</Button>)}
                    </div>
                  )}
                  <div className="tvb-gestes">
                    {etatDe(p) === 'a-preparer' && <Button size="sm" onClick={() => poseEtat(p, 'prete')}>Prête</Button>}
                    {numero && (
                      <WaLien phone={numero} message={message}>
                        <Button size="sm" variant="ghost">Prévenir sur WhatsApp</Button>
                      </WaLien>
                    )}
                    {etatDe(p) !== 'remise' && <Button size="sm" variant="copper" onClick={() => void remiseFaite(p)}>Remise faite</Button>}
                    <Button size="sm" variant="ghost" onClick={() => navigate(`/factures?id=${p.id}`)}>Ouvrir dans Factures</Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── ④ LES PAIEMENTS À RAPPROCHER ────────────────────────────────────── */
function ARapprocher({ payments, invoices, currency }: {
  payments: ReturnType<typeof usePayments>[0];
  invoices: ReturnType<typeof useInvoices>[0];
  currency: string;
}) {
  const [enCours, setEnCours] = useState<string | null>(null);
  const orphelins = payments.filter((p) => {
    if (p.status !== 'success') return false;
    const id = commandeDeLaReference(p.partnerId);
    if (!id) return false;
    const piece = invoices.find((i) => i.id === id);
    return !(piece?.payments ?? []).some((v) => v.id === `kkia-${p.id}`);
  });
  if (!orphelins.length) return null;
  return (
    <div className="tvb-bloc tvb-bloc--alerte">
      <div className="tvb-titre">Paiements en ligne à rapprocher</div>
      <div className="mnd-muted tvb-dit">
        KkiaPay a reçu ces paiements, mais la commande ne les porte pas encore : la page de la cliente s’est sans doute fermée trop tôt. « Rapprocher » redemande la vérité à KkiaPay et pose le versement sur la commande, caisse KkiaPay.
      </div>
      {orphelins.map((p) => {
        const id = commandeDeLaReference(p.partnerId);
        const piece = invoices.find((i) => i.id === id);
        return (
          <div key={p.id} className="tvb-orphelin">
            <span>{piece ? piece.number : 'Commande introuvable'} · {fmtMoney(p.amountXof, currency)}<span className="mnd-muted"> · {frShortAn(dayOf(p.at))} · transaction {p.id}</span></span>
            <Button size="sm" disabled={enCours === p.id || !piece} onClick={async () => {
              setEnCours(p.id);
              const r = await reglerLaCommande(id, p.id);
              setEnCours(null);
              if (r.ok) toast(`${piece?.number ?? 'La commande'} : paiement rapproché.`);
              else toast(motDuRefus(r.error));
            }}>{enCours === p.id ? 'Un instant…' : 'Rapprocher'}</Button>
          </div>
        );
      })}
    </div>
  );
}

/* ── ⑤ À PRÉVENIR ────────────────────────────────────────────────────── */
function APrevenirListe({ prevenir, articles, clients }: {
  prevenir: ReturnType<typeof usePrevenir>[0]['liste'];
  articles: Product[];
  clients: ReturnType<typeof useBranchClients>;
}) {
  const [ouvert, setOuvert] = useState<string | null>(null);
  const enAttente = prevenir.filter((x) => !x.prevenuLe);
  const parArticle = useMemo(() => {
    const m = new Map<string, typeof enAttente>();
    for (const x of enAttente) m.set(x.produitId, [...(m.get(x.produitId) ?? []), x]);
    return [...m.entries()];
  }, [enAttente]);
  if (!prevenir.length) return null;
  const marque = (id: string) =>
    prevenirStore.set((d) => ({ ...d, liste: (d.liste ?? []).map((x) => (x.id === id ? { ...x, prevenuLe: new Date().toISOString() } : x)) }));
  return (
    <div className="tvb-bloc">
      <div className="tvb-titre">À prévenir</div>
      <div className="mnd-muted tvb-dit">
        Ces personnes attendent un article « Bientôt ». La Maison écrit une fois, quand il arrive : « Prévenue » le retire de la liste.
      </div>
      {parArticle.length === 0 && <div className="mnd-muted tvb-vide">Personne n’attend, tout le monde a été prévenu.</div>}
      {parArticle.map(([produitId, gens]) => {
        const a = articles.find((p) => p.id === produitId);
        const titre = a ? titreDe(a) : produitId;
        const estOuvert = ouvert === produitId;
        const vendable = a ? etatDeLArticle(a, new Date()) === 'vendable' : false;
        return (
          <div key={produitId} className={`tvb-rayon ${estOuvert ? 'is-open' : ''}`}>
            <button type="button" className="tvb-rayon__tete" aria-expanded={estOuvert} onClick={() => setOuvert(estOuvert ? null : produitId)}>
              <span className="tvb-rayon__nom">{titre}</span>
              <span className="tvb-rayon__resume">{gens.length} personne{gens.length > 1 ? 's' : ''} · {vendable ? 'il est en vente, prévenez-les' : 'pas encore en vente'}</span>
              <span aria-hidden="true" className="tvb-rayon__fleche">{estOuvert ? '−' : '+'}</span>
            </button>
            {estOuvert && (
              <div className="tvb-rayon__corps">
                {gens.map((x) => {
                  const numero = x.numero || clients.find((c) => c.id === x.clientId)?.phone || '';
                  const nom = x.nom || clients.find((c) => c.id === x.clientId)?.name || '';
                  return (
                    <div key={x.id} className="tvb-orphelin">
                      <span>{nom || 'Sans nom'}<span className="mnd-muted"> · {numero || 'sans numéro'} · demandé le {frShortAn(dayOf(x.le))}</span></span>
                      <span className="tvb-gestes">
                        {numero && (
                          <WaLien phone={numero} message={`Bonjour${prenomDe(nom) ? ` ${prenomDe(nom)}` : ''}, l’article « ${titre} » que vous attendiez est arrivé à la Maison MND. Il vous attend sur la Boutique.`}>
                            <Button size="sm" variant="ghost">Écrire</Button>
                          </WaLien>
                        )}
                        <Button size="sm" onClick={() => marque(x.id)}>Prévenue</Button>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

