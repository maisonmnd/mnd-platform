import { useEffect, useMemo, useState } from 'react';
import { createStore, useStore } from '../../shared/store';
import {
  useCategories,
  useServices,
  useProducts,
  type CatalogCategory,
  type Service,
  type Product,
} from '../../shared/catalog';
import { vitrineConfigStore } from '../../shared/bridges';
import { useClients, type Client } from '../../shared/clients';
import { OPEN_HOUR, CLOSE_HOUR, type Appointment } from '../../shared/agenda';

/* Ma Couronne — bibliothèque locale : session, visibilité, dates, créneaux, offres. */

/* ---------- Session (persistée : les rechargements restent connectés) ---------- */

export type Session = { phone: string; clientId: string; loggedAt: string };
export const sessionStore = createStore<Session | null>('mnd_couronne_session', null);

export const CLIENT_ID = 'c-adjoa';

export function useClient(): Client | undefined {
  const [clients] = useClients();
  return clients.find((c) => c.id === CLIENT_ID);
}

export function firstName(name: string | undefined): string {
  return (name ?? 'Adjoa').split(' ')[0];
}

/* ---------- Visibilité — catalogue × configuration Vitrine du Trône ---------- */

export type VisibleCatalog = {
  cats: CatalogCategory[];
  services: Service[];
  products: Product[];
};

export function useVisibleCatalog(): VisibleCatalog {
  const [cats] = useCategories();
  const [services] = useServices();
  const [products] = useProducts();
  const [vitrine] = useStore(vitrineConfigStore);

  return useMemo(() => {
    const catOk = (id: string) => {
      const c = cats.find((x) => x.id === id);
      if (!c || !c.enabled) return false;
      return vitrine.visibleCategories.length === 0 || vitrine.visibleCategories.includes(id);
    };
    return {
      cats: cats.filter((c) => catOk(c.id)).slice().sort((a, b) => a.order - b.order),
      services: services
        .filter((s) => catOk(s.categoryId) && !vitrine.hiddenServices.includes(s.id))
        .slice()
        .sort((a, b) => a.order - b.order),
      products: products
        .filter((p) => catOk(p.categoryId) && !vitrine.hiddenProducts.includes(p.id))
        .slice()
        .sort((a, b) => a.order - b.order),
    };
  }, [cats, services, products, vitrine]);
}

/* ---------- Dates (tout est calculé sur la date du jour) ---------- */

export const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);

export const DOWS = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];
export const DOW_LETTERS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
export const MONTHS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];
export const MONTHS_SHORT = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];

export const isoOf = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const todayIso = () => isoOf(new Date());
export const dateOfIso = (iso: string) => new Date(`${iso}T00:00:00`);

/** « Sam. 5 juil » */
export function dayLabel(d: Date): string {
  return `${DOWS[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}
export function dayLabelIso(iso: string): string {
  return dayLabel(dateOfIso(iso));
}

export function daysSince(iso: string): number {
  const ms = Date.now() - dateOfIso(iso).getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

/** « 2 h » · « 1 h 30 » · « 45 min » */
export function fmtDuration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${pad2(m)}` : `${h} h`;
}

/* ---------- Créneaux libres — calculés par maître contre l'agenda partagé ---------- */

function apptDurationMin(a: Appointment, services: Service[]): number {
  const total = a.serviceIds.reduce((sum, id) => sum + (services.find((s) => s.id === id)?.durationMin ?? 60), 0);
  return total || 60;
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};

/** Heures de départ libres pour un maître, un jour, une durée — 08:00 → 18:00. */
export function freeSlots(
  dateIso: string,
  master: string,
  durationMin: number,
  appts: Appointment[],
  services: Service[],
  branchId: string
): string[] {
  const busy = appts
    .filter((a) => a.branchId === branchId && a.master === master && a.date === dateIso && a.status !== 'annulé')
    .map((a) => {
      const start = toMin(a.time);
      return [start, start + apptDurationMin(a, services)] as const;
    });

  const now = new Date();
  const isToday = dateIso === isoOf(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const out: string[] = [];
  for (let m = OPEN_HOUR * 60; m + durationMin <= CLOSE_HOUR * 60; m += 60) {
    if (isToday && m <= nowMin) continue;
    const overlaps = busy.some(([s, e]) => m < e && m + durationMin > s);
    if (!overlaps) out.push(`${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`);
  }
  return out;
}

/* ---------- Paliers d'expérience ---------- */

export const PALIERS: { key: Service['palier']; sub: string }[] = [
  { key: 'Fondation', sub: 'Poser les bases, découvrir le rituel.' },
  { key: 'Élévation', sub: 'Affirmer sa couronne, séance après séance.' },
  { key: 'Souveraineté', sub: 'La maîtrise, mèche après mèche.' },
];

/* ---------- Les quatre temps — la méthode de la maison ---------- */

export const QUATRE_TEMPS = [
  { no: '01', n: 'Purifier', g: 'Laver en douceur, libérer le cuir chevelu.' },
  { no: '02', n: 'Nourrir', g: 'Hydrater la fibre, fortifier la racine.' },
  { no: '03', n: 'Sceller', g: 'Fixer le soin, protéger la mèche.' },
  { no: '04', n: 'Couronner', g: 'Sculpter, parfumer, révéler la tête haute.' },
];

/* ---------- Offres instantanées ---------- */

export type Offer = {
  id: string;
  tag: string;
  deal: string;
  discountPct: number;
  serviceId?: string;
  title: string;
  sub: string;
  cta: string;
  theme: 'copper' | 'indigo' | 'sable';
  act: 'book' | 'invite';
};

export const OFFERS: Offer[] = [
  {
    id: 'off-resserrage', tag: 'Offre éclair', deal: '−25 %', discountPct: 25,
    serviceId: 'sv-resserrage', title: 'Resserrage racines', sub: 'Sérum Racines offert',
    cta: 'Réserver −25 %', theme: 'copper', act: 'book',
  },
  {
    id: 'off-entretien', tag: 'Duo découverte', deal: '−15 %', discountPct: 15,
    serviceId: 'sv-entretien-complet', title: 'Entretien complet', sub: 'Réservé aujourd’hui seulement',
    cta: 'Réserver −15 %', theme: 'indigo', act: 'book',
  },
  {
    id: 'off-parrainage', tag: 'Cadeau', deal: '✦', discountPct: 0,
    title: 'Parrainez une amie', sub: 'Un soin offert à sa première visite',
    cta: 'Inviter', theme: 'sable', act: 'invite',
  },
];

/** Les offres expirent au prochain 21:00 — compte à rebours vivant. */
export function useOfferCountdown(): string {
  const compute = () => {
    const now = new Date();
    const end = new Date(now);
    end.setHours(21, 0, 0, 0);
    if (end.getTime() <= now.getTime()) end.setDate(end.getDate() + 1);
    const s = Math.max(0, Math.floor((end.getTime() - now.getTime()) / 1000));
    return `${pad2(Math.floor(s / 3600))}:${pad2(Math.floor((s % 3600) / 60))}:${pad2(s % 60)}`;
  };
  const [v, setV] = useState(compute);
  useEffect(() => {
    const t = window.setInterval(() => setV(compute()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return v;
}

/* ---------- Gamme — descripteurs éditoriaux par produit ---------- */

export const PRODUCT_META: Record<string, { tag: string; line: string }> = {
  'pr-huile-couronne': { tag: 'Sceller', line: 'Brillance & protection des pointes' },
  'pr-shampoing': { tag: 'Purifier', line: 'Moringa · romarin · sans paraben' },
  'pr-beurre-locks': { tag: 'Couronner', line: 'Karité · cacao · définition' },
  'pr-serum-racines': { tag: 'Nourrir', line: 'Densité & cuir chevelu sain' },
};

export const productMeta = (id: string) => PRODUCT_META[id] ?? { tag: 'Rituel', line: 'Formule naturelle de la maison' };

/* ---------- Fidélité ---------- */

export const TIER_SILVER = 'Couronne d’argent';
export const TIER_GOLD = 'Couronne d’or';
export const GOLD_AT = 2000;

/* ---------- Réservation — pré-remplissage (offres, re-réservation) ---------- */

export type BookingPrefill = {
  serviceId: string;
  discountPct?: number;
  offerLabel?: string;
};
