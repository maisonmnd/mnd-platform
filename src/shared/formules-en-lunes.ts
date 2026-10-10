/* ══ LES FORMULES EN LUNES, POSÉES DEPUIS LE TRÔNE — 10 octobre 2026 ═══════
   La genèse des prix, lot 2. Les dix fiches et leurs règles vivent dans
   `formules-en-lunes-pur.ts`. Ici, le seul geste : les faire naître une fois,
   depuis le Trône seul, masquées de Ma Couronne jusqu'en janvier (le pilote
   est au comptoir, question 12).

   QUATRE VERROUS, ceux de la carte (`nouvelle-grille.ts`) et un de plus :
   ① une session ; ② les formules de la Maison reconnues dans le magasin ;
   ③ la vitrine relue au serveur avant d'y masquer quoi que ce soit ;
   ④ LA CARTE DU LOT 1 POSÉE : les formules comptent les venues nommées
     (GBÈJÍ™ Essentiel et Signature) ; sans elles, elles ne couvriraient rien.
   Les masques d'abord, les formules ensuite. Pas de lecture, pas d'écriture,
   pas de marque : on retentera. */
import { servicesStore } from './catalog';
import { plansStore, type Plan } from './abonnements';
import { vitrineConfigStore, type VitrineConfig } from './bridges';
import { quandTablePrete } from './sync';
import { supabase } from './supabase';
import { masquesDesFormules, poseLesFormulesEnLunes } from './formules-en-lunes-pur';
import { FORMULES_A_ZERO_DU_10_OCTOBRE } from './formules-fermees-pur';

const MARQUEUR = 'mnd_formules_en_lunes_2026_10';
const FIN = Date.parse('2026-12-31T23:59:59+01:00');

/** Les formules de la Maison sont-elles là ? (une de celles du 10 octobre) */
const formulesChargees = (): boolean => {
  const connues = new Set([...FORMULES_A_ZERO_DU_10_OCTOBRE, 'pl-mkt-eclosion', 'pl-mkt-juste-cadence']);
  return plansStore.get().some((p) => connues.has(p.id));
};
/** La carte du lot 1 est-elle posée ? */
const carteDuLot1 = (): boolean => {
  const sv = servicesStore.get();
  return sv.some((x) => x.id === 'sv-venue-gbeji-ess') && sv.some((x) => x.id === 'sv-venue-gbeji-sig');
};

const masquee = async (): Promise<boolean> => {
  if (!supabase) return false;
  const { data, error } = await supabase.from('documents').select('data').eq('key', 'mnd_vitrine_config').maybeSingle();
  const cfgServeur = (data as { data?: VitrineConfig } | null)?.data;
  if (error || !cfgServeur || typeof cfgServeur !== 'object') return false;
  const cfg = masquesDesFormules(cfgServeur, 'maintenant');
  if (cfg) vitrineConfigStore.set(cfg);
  return true;
};

const posees = (): void => {
  const r = poseLesFormulesEnLunes(plansStore.get());
  if (r) plansStore.set(r.plans as unknown as Plan[]);
};

const marque = () => { try { localStorage.setItem(MARQUEUR, new Date().toISOString()); } catch { /* on rejouera : sans effet */ } };

/** À appeler une fois, au démarrage du Trône seulement. */
export function migreLesFormulesEnLunes(): void {
  if (Date.now() > FIN || !supabase) return;
  try { if (localStorage.getItem(MARQUEUR)) return; } catch { /* on tente */ }
  const sb = supabase;
  let plans = false;
  let enCours = false;
  let faite = false;
  const essaie = async () => {
    if (faite || enCours || !plans) return;
    if (!formulesChargees() || !carteDuLot1()) return;
    enCours = true;
    try {
      if (!(await sb.auth.getSession()).data.session) return;   // ①
      if (!formulesChargees() || !carteDuLot1()) return;        // ② ④
      if (!(await masquee())) return;                           // ③
      posees();
      marque();
      faite = true;
    } finally { enCours = false; }
  };
  plansStore.subscribe(() => { if (!faite) setTimeout(() => void essaie(), 0); });
  servicesStore.subscribe(() => { if (!faite) setTimeout(() => void essaie(), 0); });
  sb.auth.onAuthStateChange((evenement) => {
    if (!faite && (evenement === 'SIGNED_IN' || evenement === 'INITIAL_SESSION' || evenement === 'TOKEN_REFRESHED')) {
      setTimeout(() => void essaie(), 0);
    }
  });
  quandTablePrete('plans', () => { plans = true; void essaie(); });
}
