/* Web Push côté client — Ma Couronne.
   Enregistre le service worker, demande la permission, souscrit avec la clé VAPID
   publique, et stocke l'abonnement dans Supabase (`push_subscriptions`). L'envoi
   réel (confirmations & rappels) est fait par la fonction Edge `push-notify`. */

import { supabase } from './supabase';

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC as string | undefined;

export const pushSupported = (): boolean =>
  typeof window !== 'undefined'
  && 'serviceWorker' in navigator
  && 'PushManager' in window
  && 'Notification' in window
  && !!VAPID_PUBLIC
  && !!supabase;

const urlB64ToUint8 = (b64: string): Uint8Array => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const s = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(s);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};

let regPromise: Promise<ServiceWorkerRegistration | null> | null = null;
export function registerSW(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return Promise.resolve(null);
  if (!regPromise) {
    regPromise = navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: 'none' })
      .then((reg) => { try { void reg.update(); } catch { /* ignore */ } return reg; })
      .catch(() => null);
  }
  return regPromise;
}

export type PushState = 'unsupported' | 'default' | 'denied' | 'subscribed' | 'granted-unsub';

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission === 'default') return 'default';
  const reg = await registerSW();
  if (!reg) return 'default';
  const sub = await reg.pushManager.getSubscription();
  return sub ? 'subscribed' : 'granted-unsub';
}

/** Active les notifications pour cette cliente : permission + abonnement + stockage. */
export async function enablePush(clientId: string): Promise<boolean> {
  if (!pushSupported() || !supabase || !clientId || clientId === 'c-local') return false;
  const reg = await registerSW();
  if (!reg) return false;
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return false;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(VAPID_PUBLIC as string) as BufferSource });
    }
    const json = sub.toJSON();
    const { error } = await supabase.from('push_subscriptions').upsert(
      { endpoint: sub.endpoint, client_id: clientId, p256dh: json.keys?.p256dh, auth: json.keys?.auth },
      { onConflict: 'endpoint' },
    );
    return !error;
  } catch {
    return false;
  }
}

/** Souscrit silencieusement si la permission est déjà accordée (au chargement / réservation). */
export async function ensurePush(clientId: string): Promise<void> {
  if (!pushSupported() || Notification.permission !== 'granted') return;
  await enablePush(clientId);
}

/** Désactive les notifications sur cet appareil : désabonnement + suppression en base. */
export async function disablePush(): Promise<boolean> {
  try {
    const reg = await registerSW();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      if (supabase) await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
      await sub.unsubscribe();
    }
    return true;
  } catch {
    return false;
  }
}

/** Envoie une notification immédiate à la cliente via la fonction Edge (best-effort). */
export async function pushNotify(clientId: string, title: string, body: string, url?: string): Promise<void> {
  if (!supabase || !clientId || clientId === 'c-local') return;
  try {
    await supabase.functions.invoke('push-notify', { body: { clientId, title, body, url } });
  } catch {
    /* silencieux : la fonction n'est peut-être pas encore déployée */
  }
}

/** Referme les notifications encore affichées (tiroir du téléphone) sur TOUTES les
    inscriptions du service worker + efface le badge desktop/iOS (no-op sur Android
    Chrome, où le badge est piloté par le système d'après le tiroir). À appeler à
    chaque reprise de l'app pour que l'icône retombe. */
export async function clearAppNotifications(): Promise<void> {
  try {
    const nav = navigator as Navigator & { clearAppBadge?: () => Promise<void> };
    if (typeof nav.clearAppBadge === 'function') await nav.clearAppBadge();
  } catch { /* ignore */ }
  if (!('serviceWorker' in navigator)) return;
  try {
    /* Balaye toutes les inscriptions (évite qu'une inscription orpheline laisse
       traîner des notifications que le nettoyage ne verrait pas). */
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const reg of regs) {
      try {
        const notifs = await reg.getNotifications();
        for (const n of notifs) n.close();
        reg.active?.postMessage({ type: 'mnd-clear' });
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

/** Notifie TOUT le personnel (souverain/gérants/maîtres) via la fonction Edge —
    pour les événements de la Maison (consultation reçue, réservation, inscription…).
    Appelable par une cliente authentifiée ou par le tunnel public de consultation. */
export async function pushNotifyStaff(title: string, body: string, url?: string): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.functions.invoke('push-notify', { body: { mode: 'staff', title, body, url } });
  } catch {
    /* silencieux : la fonction n'est peut-être pas encore déployée */
  }
}

/** Notifie UNE cliente précise depuis Le Trône (ex. cadeau anniversaire).
    Réservé au personnel (la fonction Edge vérifie le JWT). Renvoie le nombre d'envois. */
export async function pushToClient(clientId: string, title: string, body: string, url?: string, email?: string): Promise<number> {
  if (!supabase || (!clientId && !email)) return 0;
  try {
    const { data } = await supabase.functions.invoke('push-notify', { body: { mode: 'to-client', clientId, email, title, body, url } });
    return (data as { sent?: number })?.sent ?? 0;
  } catch {
    return 0;
  }
}

/** Diffuse une notification à TOUTES les clientes abonnées (offre, promo…).
    Réservé au personnel (la fonction Edge vérifie le JWT). Renvoie le nombre d'envois. */
export async function pushBroadcastClients(title: string, body: string, url?: string): Promise<number> {
  if (!supabase) return 0;
  try {
    const { data } = await supabase.functions.invoke('push-notify', { body: { mode: 'broadcast', title, body, url } });
    return (data as { sent?: number })?.sent ?? 0;
  } catch {
    return 0;
  }
}
