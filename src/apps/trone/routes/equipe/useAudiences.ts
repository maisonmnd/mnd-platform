/* CE QUE LES AUDIENCES LISENT DU VÉCU — 21 octobre 2026.

   Le Marketing (pour compter et écrire) et le registre des Clientes (pour
   montrer) jugent les audiences avec `shared/audiences-pur`. Ce crochet leur
   prépare le même contexte, une seule fois écrit : les venues honorées, les
   rendez-vous à venir, les formules qui courent, et les têtes qui ont allumé
   les notifications de Ma Couronne. */
import { useEffect, useMemo, useState } from 'react';
import { useBranch } from '../../../../shared/branches';
import { useClients, estDePassage, type Client } from '../../../../shared/clients';
import { useAppointments } from '../../../../shared/agenda';
import { useSubscribers, abonnementsVivantsDe } from '../../../../shared/abonnements';
import { jourDeCotonou } from '../../../../shared/ia-faits-pur';
import { supabase } from '../../../../shared/supabase';
import { litToutesLesPages } from '../../../../shared/lecture-entiere';
import { baseDesAudiences, type ContexteDAudience } from '../../../../shared/audiences-pur';

/** Les comptes (identifiant de fiche ou compte rattaché) qui ont un abonnement
    aux notifications. Lu une fois par écran ; vide tant que la lecture n'a
    pas répondu, et vide hors ligne : alors personne n'est compté joignable
    par notification, plutôt que tout le monde. */
export function useAbonnesAuxNotifications(): ReadonlySet<string> {
  const [ids, setIds] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    let vivant = true;
    const sb = supabase;
    if (!sb) return undefined;
    void litToutesLesPages<{ id: string; client_id: string | null }>((apres, taille) => {
      let q = sb.from('push_subscriptions').select('id:endpoint,client_id').order('endpoint', { ascending: true }).limit(taille);
      if (apres) q = q.gt('endpoint', apres);
      return q as unknown as PromiseLike<{ data: { id: string; client_id: string | null }[] | null; error: { message: string } | null }>;
    }).then(({ data }) => {
      if (!vivant || !data) return;
      setIds(new Set(data.map((r) => r.client_id ?? '').filter(Boolean)));
    });
    return () => { vivant = false; };
  }, []);
  return ids;
}

/** La base (branche, pas archivée, pas de passage) et le contexte du jour. */
export function useAudiences(): { base: Client[]; ctx: ContexteDAudience } {
  const { branch } = useBranch();
  const [clients] = useClients();
  const [appointments] = useAppointments();
  const [subs] = useSubscribers();
  const aujourdhui = jourDeCotonou();

  const base = useMemo(() => baseDesAudiences(clients, branch.id, estDePassage), [clients, branch.id]);

  const ctx = useMemo<ContexteDAudience>(() => {
    const venues = new Map<string, string[]>();
    const aVenir = new Set<string>();
    for (const a of appointments) {
      if (!a?.clientId) continue;
      if (a.status === 'honoré') {
        const l = venues.get(a.clientId) ?? [];
        l.push(a.date);
        venues.set(a.clientId, l);
      } else if (a.status !== 'annulé' && a.date >= aujourdhui) {
        aVenir.add(a.clientId);
      }
    }
    const abonnees = new Set<string>();
    const portees = new Set(subs.filter((s) => s.branchId === branch.id && s.clientId).map((s) => s.clientId as string));
    for (const cid of portees) if (abonnementsVivantsDe(subs, cid).length > 0) abonnees.add(cid);
    return { aujourdhui, venues, aVenir, abonnees };
  }, [appointments, subs, branch.id, aujourdhui]);

  return { base, ctx };
}
