import type { Besoin } from '../../shared/qualification';

/* CE QUE LE SITE SAIT DE LA MAISON, SANS COMPTE — 17 septembre 2026.

   Les pages sont statiques ; ce qui vit (le numéro WhatsApp, la fiche
   Google, les avis) se lit ici par la clé publique, dans les seules tables
   ouvertes à l'anonyme : `branches` (0006) et le document `mnd_avis_google`
   (0108). Rien d'autre. Ce module n'importe pas la synchronisation : une
   page publique se charge en un instant, même sur réseau faible. */

export type Maison = {
  branchId: string;
  nom: string;
  ville: string;
  /** Le numéro WhatsApp de la Maison, chiffres seuls, tel que wa.me l'attend. */
  whatsapp: string;
  /** La devise de la branche : elle habille les prix du calendrier. */
  devise: string;
  fiche?: string;
};

export type AvisGoogle = {
  note: number;
  nombre: number;
  avis: { auteur: string; note: number; texte: string; quand: string; photo?: string }[];
  fiche: string;
  ecrire: string;
};

const CLE = 'mnd_site_maison';

/* Le client Supabase ne se charge qu'à la première lecture : une page qui
   ne fait que se lire n'en a pas besoin, et ne le télécharge pas. */
export const client = () => import('../../shared/supabase').then((m) => m.supabase);

let promesse: Promise<Maison | null> | null = null;

export function maison(): Promise<Maison | null> {
  if (promesse) return promesse;
  promesse = (async () => {
    try {
      const gardee = sessionStorage.getItem(CLE);
      if (gardee) return JSON.parse(gardee) as Maison;
    } catch { /* pas de session : on lit la base */ }
    const supabase = await client();
    if (!supabase) return null;
    const { data } = await supabase.from('branches').select('id,data');
    type Ligne = { id: string; data?: { name?: string; city?: string; phone?: string; mapsUrl?: string; currency?: string; flagship?: boolean; status?: string } };
    const lignes = (data ?? []) as Ligne[];
    const b = lignes.find((l) => l.data?.flagship && l.data?.status !== 'paused') ?? lignes[0];
    if (!b) return null;
    const m: Maison = {
      branchId: b.id,
      nom: b.data?.name ?? 'Maison MND',
      ville: b.data?.city ?? '',
      whatsapp: (b.data?.phone ?? '').replace(/\D/g, ''),
      devise: b.data?.currency || 'XOF',
      fiche: b.data?.mapsUrl || undefined,
    };
    try { sessionStorage.setItem(CLE, JSON.stringify(m)); } catch { /* tant pis */ }
    return m;
  })();
  return promesse;
}

export async function avisGoogle(): Promise<AvisGoogle | null> {
  const supabase = await client();
  if (!supabase) return null;
  const { data } = await supabase.from('documents').select('data').eq('key', 'mnd_avis_google').maybeSingle();
  const d = (data as { data?: AvisGoogle } | null)?.data;
  return d && Number(d.note) > 0 ? d : null;
}

/** UNE OFFRE, VUE DU TROTTOIR — 18 septembre 2026. La Maison compose ses
    offres au Trône ; le site n'en lit qu'une part, et seulement celles
    qu'elle a ACTIVÉES. Une offre qui dort ne sort jamais de la Maison.

    `mnd_offers` est dans la liste blanche de lecture publique depuis 0006 :
    aucune migration n'est nécessaire. La forme est déclarée ici plutôt
    qu'importée, pour la même raison que le reste de ce module, ne pas tirer
    la synchronisation de l'ERP dans une page qui doit s'ouvrir vite. */
export type OffreDuSite = {
  id: string;
  branchId: string;
  title: string;
  tag: string;
  deal: string;
  sub: string;
  active: boolean;
  du?: string;
  au?: string;
};

export async function offresDuSite(): Promise<OffreDuSite[]> {
  const supabase = await client();
  if (!supabase) return [];
  const { data } = await supabase.from('documents').select('data').eq('key', 'mnd_offers').maybeSingle();
  const d = (data as { data?: OffreDuSite[] } | null)?.data;
  if (!Array.isArray(d)) return [];
  /* Actives seulement, et datées seulement : une offre sans saison est une
     heure creuse de Ma Couronne, elle n'a rien à faire sur la vitrine. */
  return d.filter((o) => o && o.active && (o.du || o.au));
}

/** Le lien WhatsApp d'un parcours : le numéro de la Maison quand on le
    connaît, sinon WhatsApp s'ouvre avec le message et laisse choisir. */
export function lienWhatsApp(numero: string, message: string): string {
  const texte = encodeURIComponent(message);
  return numero ? `https://wa.me/${numero}?text=${texte}` : `https://wa.me/?text=${texte}`;
}

export type { Besoin };
