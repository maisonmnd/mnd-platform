/* ══ LE FIL DU SCEAU, CÔTÉ TRÔNE — 22 novembre 2026 ═════════════════════
   Quand la pièce d'un rendez-vous change (un soin ajouté, un geste offert),
   le Trône souffle « relis » sur le fil du jeton de ce rendez-vous : la note
   de la cliente se relit d'elle-même, sans qu'elle touche à rien.

   CE MODULE EST LE SEUL À PARLER AU FIL AVEC LA SESSION DE LA MAISON : il
   prend le client déjà branché (`./supabase`), celui du Trône, et non un
   second client anonyme. Un canal par jeton, gardé tant que la fiche est
   ouverte, oublié au départ.

   LE SIGNE D'UN ENVOI, C'EST L'ÉTAT DE LA PIÈCE, PAS LE GESTE. ReglementEnDirect
   appelle `souffleSurLeFilDuSceau` quand le contenu de la pièce a changé
   (lignes, remise, geste, argent reçu) — jamais à chaque rendu. */
import { supabase } from './supabase';
import { filDuSceau, signalDuSceau } from './le-sceau-pur';

type Canal = { c: { send: (m: unknown) => Promise<unknown>; unsubscribe: () => Promise<unknown> }; pret: boolean; enAttente: boolean };
const canaux = new Map<string, Canal>();

/** Souffle « relis » sur le fil d'un jeton. Sans effet hors connexion, ou
    sans jeton : la note se relira à sa prochaine lecture. */
export function souffleSurLeFilDuSceau(jeton: string): void {
  const sb = supabase;
  const j = String(jeton ?? '').trim();
  if (!sb || !j) return;
  let e = canaux.get(j);
  if (!e) {
    const c = sb.channel(filDuSceau(j), { config: { broadcast: { self: false } } });
    const neuf: Canal = { c: c as unknown as Canal['c'], pret: false, enAttente: false };
    canaux.set(j, neuf);
    /* LE PREMIER SIGNE ATTEND D'ÊTRE JOINT. `send` sur un canal qui n'a pas
       encore dit SUBSCRIBED part dans le vide, en silence : on le garde donc
       en mémoire et il part à la jointure. */
    c.subscribe((statut: string) => {
      if (statut !== 'SUBSCRIBED') return;
      neuf.pret = true;
      if (!neuf.enAttente) return;
      neuf.enAttente = false;
      void envoie(neuf);
    });
    e = neuf;
  }
  if (e.pret) { void envoie(e); return; }
  e.enAttente = true;
}

function envoie(e: Canal): Promise<unknown> {
  const s = signalDuSceau();
  return e.c.send({ type: 'broadcast', event: s.event, payload: s.payload }).catch(() => undefined);
}

/** La fiche se ferme : son canal s'en va. Un fil oublié, c'est un canal de
    plus à chaque rendez-vous ouvert dans la journée. */
export function oublieLeFilDuSceau(jeton: string): void {
  const j = String(jeton ?? '').trim();
  const e = canaux.get(j);
  if (!e) return;
  canaux.delete(j);
  void e.c.unsubscribe();
}
