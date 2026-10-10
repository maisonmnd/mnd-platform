/* ══ LA BASCULE DU 1er JANVIER 2027, POSÉE DEPUIS LE TRÔNE ═══════════════
   Le juge vit dans `shared/bascule-de-janvier-pur`. Ici, le geste, une fois,
   au premier démarrage du Trône le 1er janvier 2027 ou après (jamais depuis
   le navigateur d'une cliente), comme la grille du 10 octobre :

   ① les rendez-vous déjà pris se figent au prix que l'écran leur lisait la
     veille, par la porte des écrans (`apptTotalXof`) ;
   ② les têtes dont la visite monte de plus de 10 % reçoivent leurs prix
     tenus jusqu'au 31 mars 2027, comparés ligne à ligne, ancien catalogue
     contre catalogue de janvier, calculés en mémoire ;
   ③ la carte de janvier se pose ;
   ④ les treize anciennes formules se ferment à la vente ;
   ⑤ les masques tombent, sur la vitrine relue au serveur.

   ① et ② ne se font que si le catalogue est encore celui d'avant : un
   deuxième poste, qui reçoit une carte déjà basculée, ne fige rien au
   nouveau prix. Rejoué, chaque pas ne fait rien (les juges ne touchent que
   ce qu'ils reconnaissent).

   LES VERROUS, comme la grille : une session ; le catalogue, les formules,
   les rendez-vous et les fiches chargés ; la vitrine lue au serveur avant
   d'écrire ses masques. Pas de lecture, pas d'écriture, pas de marque : on
   retentera au prochain signal. */
import { categoriesStore, productsStore, servicesStore, fondeLaCouronne, type CatalogCategory, type Service } from '../../../shared/catalog';
import { appointmentsStore, type Appointment } from '../../../shared/agenda';
import { clientsStore, type Client } from '../../../shared/clients';
import { plansStore, type Plan } from '../../../shared/abonnements';
import { vitrineConfigStore, type VitrineConfig } from '../../../shared/bridges';
import { quandTablePrete } from '../../../shared/sync';
import { supabase } from '../../../shared/supabase';
import { appliqueLaGrille, masquesDeLaGrille } from '../../../shared/nouvelle-grille-pur';
import { masquesDesFormules } from '../../../shared/formules-en-lunes-pur';
import {
  BASCULE, PRIX_TENUS_JUSQUAU, fermeLesAnciennesFormules, figeLesRendezVous, prixTenusDeLaTete, visiteDeReference,
} from '../../../shared/bascule-de-janvier-pur';
import { bandSetsStore, isPersonalized, modelBandsStore, personalPriceXof, prixDeBase, pricingOf } from '../../../shared/pricing';
import { isoDuJour } from '../../../shared/offres-pur';

const MARQUEUR = 'mnd_bascule_de_janvier_2027_v1';
const FIN = Date.parse('2027-03-31T23:59:59+01:00');

const catalogueCharge = (): boolean => {
  const sv = servicesStore.get();
  return sv.some((x) => x.id === 'sv-atl-ii-e') && sv.some((x) => x.id === 'sv-plt-05-ess-c')
    && categoriesStore.get().some((x) => x.id === 'atl-ii-gbeji');
};

/** La carte de janvier, calculée sur le catalogue du poste ; `null` si elle est déjà posée. */
const carteDeJanvier = () => appliqueLaGrille(
  { services: servicesStore.get() as unknown as { id: string }[], categories: categoriesStore.get() as unknown as { id: string }[] },
  'janvier', isoDuJour(new Date()),
);

/** ① Les rendez-vous déjà pris, figés au prix que l'écran leur lit. */
const figeLesRendezVousPris = async (): Promise<number> => {
  const { apptTotalXof } = await import('../routes/clients/_shared');
  const byId = new Map(servicesStore.get().map((s) => [s.id, s] as const));
  const r = figeLesRendezVous(appointmentsStore.get(), (a) => apptTotalXof(a as Appointment, byId));
  if (!r) return 0;
  const figes = new Map(r.rdvs.filter((a) => r.figes.includes(a.id)).map((a) => [a.id, a] as const));
  appointmentsStore.set((prev) => prev.map((a) => {
    const f = figes.get(a.id);
    return f && typeof a.priceXof !== 'number' ? { ...a, priceXof: f.priceXof, prixFigeParLaBascule: f.prixFigeParLaBascule } : a;
  }));
  return r.figes.length;
};

/** ② Les prix tenus, ancien catalogue contre catalogue de janvier, en mémoire. */
const poseLesPrixTenus = (neufs: readonly Service[]): number => {
  const anciens = servicesStore.get();
  const parIdAvant = new Map(anciens.map((s) => [s.id, s] as const));
  const parIdApres = new Map(neufs.map((s) => [s.id, s] as const));
  const bands = modelBandsStore.get();
  const sets = bandSetsStore.get();
  const cats = categoriesStore.get();
  const produits = productsStore.get();
  const rdvs = appointmentsStore.get();
  const estCreation = (id: string) => { const sv = parIdAvant.get(id); return !!sv && fondeLaCouronne(sv); };
  const tenus = new Map<string, Record<string, number>>();
  for (const c of clientsStore.get()) {
    if (c.archived || c.prixTenus) continue;
    const visite = visiteDeReference(rdvs, c.id, estCreation);
    if (!visite) continue;
    const pricing = { ...pricingOf(c, bands, sets, cats, BASCULE), longueur: (visite.longueur ?? c.longueur ?? 'mi-long') as Client['longueur'] };
    const prix = (parId: Map<string, Service>, tous: readonly Service[]) => (id: string): number | undefined => {
      const sv = parId.get(id);
      if (!sv) return undefined;
      return isPersonalized(pricing) ? personalPriceXof(sv, pricing, tous, produits) : prixDeBase(sv, pricing);
    };
    const t = prixTenusDeLaTete({ visite: visite.serviceIds, avant: prix(parIdAvant, anciens), apres: prix(parIdApres, neufs) });
    if (t) tenus.set(c.id, t);
  }
  if (!tenus.size) return 0;
  const poseLe = new Date().toISOString();
  clientsStore.set((prev) => prev.map((c) => {
    const t = tenus.get(c.id);
    return t && !c.prixTenus ? { ...c, prixTenus: { jusquau: PRIX_TENUS_JUSQUAU, services: t, poseLe } } : c;
  }));
  return tenus.size;
};

/** ⑤ Les masques, sur la vitrine RELUE AU SERVEUR. Vrai si la vitrine a été lue. */
const demasquee = async (): Promise<boolean> => {
  if (!supabase) return false;
  const { data, error } = await supabase.from('documents').select('data').eq('key', 'mnd_vitrine_config').maybeSingle();
  const cfgServeur = (data as { data?: VitrineConfig } | null)?.data;
  if (error || !cfgServeur || typeof cfgServeur !== 'object') return false;
  const avecServices = masquesDeLaGrille(cfgServeur, 'janvier') ?? cfgServeur;
  const avecFormules = masquesDesFormules(avecServices, 'janvier') ?? avecServices;
  if (avecFormules !== cfgServeur) vitrineConfigStore.set(avecFormules);
  return true;
};

const marque = () => { try { localStorage.setItem(MARQUEUR, new Date().toISOString()); } catch { /* sans stockage, on rejouera : sans effet */ } };

/** À appeler une fois, au démarrage du Trône seulement. Ne fait rien avant le 1er janvier 2027. */
export function migreLaBasculeDeJanvier(): void {
  if (isoDuJour(new Date()) < BASCULE || Date.now() > FIN || !supabase) return;
  try { if (localStorage.getItem(MARQUEUR)) return; } catch { /* on tente */ }
  const sb = supabase;
  const pretes = { catalog_services: false, catalog_categories: false, plans: false, appointments: false, clients: false };
  let enCours = false;
  let faite = false;
  const essaie = async () => {
    if (faite || enCours || Object.values(pretes).some((v) => !v) || !catalogueCharge()) return;
    enCours = true;
    try {
      if (!(await sb.auth.getSession()).data.session) return;
      if (!catalogueCharge()) return;
      const carte = carteDeJanvier();
      if (carte) {
        await figeLesRendezVousPris();                                         // ①
        poseLesPrixTenus(carte.services as unknown as Service[]);              // ②
        categoriesStore.set(carte.categories as unknown as CatalogCategory[]); // ③
        servicesStore.set(carte.services as unknown as Service[]);
      }
      const formules = fermeLesAnciennesFormules(plansStore.get(), isoDuJour(new Date()));
      if (formules) plansStore.set(formules.plans as Plan[]);                  // ④
      if (!(await demasquee())) return;                                        // ⑤
      marque();
      faite = true;
    } finally { enCours = false; }
  };
  const relance = () => { if (!faite) setTimeout(() => void essaie(), 0); };
  servicesStore.subscribe(relance);
  categoriesStore.subscribe(relance);
  plansStore.subscribe(relance);
  sb.auth.onAuthStateChange((evenement) => {
    if (evenement === 'SIGNED_IN' || evenement === 'INITIAL_SESSION' || evenement === 'TOKEN_REFRESHED') relance();
  });
  for (const t of Object.keys(pretes) as (keyof typeof pretes)[]) {
    quandTablePrete(t, () => { pretes[t] = true; void essaie(); });
  }
}
