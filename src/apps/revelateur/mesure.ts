/* LA MESURE DU SITE — 17 septembre 2026.

   Les huit événements du plan SEO, nommés une fois pour toutes, en
   `snake_case` sans accent, avec des paramètres fermés. Ils partent vers
   Google Analytics 4 si un identifiant est donné au build (`VITE_GA_ID`) ;
   sans lui, ils ne partent nulle part et ne coûtent rien. Aucun nom, aucun
   numéro, aucun mot libre n'y entre : un événement dit CE QUI s'est passé,
   jamais QUI. */

export type Evenement =
  | 'page_vue'
  | 'parcours_choisi'
  | 'triage_commence'
  | 'triage_termine'
  | 'prospect_depose'
  | 'consultation_ouverte'
  | 'reservation_demandee'
  | 'whatsapp_clique';

export type Parametres = { parcours?: string; page?: string; sortie?: string; genre?: string };

type Gtag = (...args: unknown[]) => void;
const GA_ID = (import.meta.env.VITE_GA_ID as string | undefined) ?? '';

function gtag(): Gtag | null {
  const w = window as unknown as { gtag?: Gtag; dataLayer?: unknown[] };
  if (!GA_ID) return null;
  if (!w.gtag) {
    w.dataLayer = w.dataLayer ?? [];
    w.gtag = function () { w.dataLayer!.push(arguments); };
    w.gtag('js', new Date());
    w.gtag('config', GA_ID, { send_page_view: false, anonymize_ip: true });
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
    document.head.appendChild(s);
  }
  return w.gtag;
}

export function mesure(evenement: Evenement, params: Parametres = {}): void {
  const g = gtag();
  if (!g) return;
  g('event', evenement, { ...params, page: params.page ?? location.pathname });
}

/** La campagne, lue une fois dans l'adresse et gardée le temps de la visite. */
export function campagne(): string {
  try {
    const q = new URLSearchParams(location.search);
    const c = q.get('utm_campaign') || q.get('campagne') || '';
    if (c) sessionStorage.setItem('mnd_campagne', c);
    return c || sessionStorage.getItem('mnd_campagne') || '';
  } catch {
    return '';
  }
}
