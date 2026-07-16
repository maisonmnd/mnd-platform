import { useEffect } from 'react';
import { useAppointments } from '../../../shared/agenda';
import { useInvoices } from '../../../shared/finance';
import { clientsStore, ensureInitiePersona, type Client } from '../../../shared/clients';
import { useAuth } from '../../../shared/auth';
import { useStore } from '../../../shared/store';
import { consultationsQueueStore } from '../../../shared/bridges';
import { branchesStore, currentBranchStore } from '../../../shared/branches';

/** Segment marquant une personne encore en phase de consultation (pas encore cliente). */
export const PROSPECT_SEGMENT = 'Prospect';

/* Auto-réparation des fiches clientes — Le Trône.

   Un RDV ou une facture venus de Ma Couronne portent un `clientId` (= l'identifiant
   Supabase de la cliente). Si, pour une raison de synchronisation (fiche créée avant
   l'hydratation des branches, course d'initialisation, RLS au premier chargement…),
   la fiche cliente correspondante n'est pas présente, Le Trône affichait « Cliente de
   passage ». Ce hook garantit qu'à chaque `clientId` orphelin correspond une vraie
   fiche cliente, éditable, rattachée à la même branche que son RDV/sa facture, et
   nommée d'après le nom porté par le document. La fiche remonte ensuite normalement
   dans le CRM et se synchronise (le personnel a les droits d'écriture). */

export function useReconcileClients(): void {
  const { session } = useAuth();
  const [appts] = useAppointments();
  const [invoices] = useInvoices();
  const [queue] = useStore(consultationsQueueStore);

  useEffect(() => {
    // L'écriture des fiches exige le personnel (RLS) : n'agir qu'avec une session.
    if (!session) return;

    const known = new Set(clientsStore.get().map((c) => c.id));
    /* Un candidat par clientId manquant : on retient la branche et le nom du
       document le plus récent qui le référence. */
    const missing = new Map<string, { branchId: string; name?: string; since: string }>();

    const consider = (
      clientId: string | undefined,
      branchId: string | undefined,
      name: string | undefined,
      date: string | undefined,
    ) => {
      if (!clientId || clientId === 'c-local' || known.has(clientId)) return;
      const prev = missing.get(clientId);
      const since = date || new Date().toISOString().slice(0, 10);
      // Garde le nom le plus informatif et la branche associée.
      missing.set(clientId, {
        branchId: branchId ?? prev?.branchId ?? clientsStore.get()[0]?.branchId ?? 'maison',
        name: name ?? prev?.name,
        since: prev && prev.since < since ? prev.since : since,
      });
    };

    for (const a of appts) consider(a.clientId, a.branchId, a.clientName, a.date);
    for (const i of invoices) consider(i.clientId, i.branchId, i.clientName ?? undefined, i.date);

    if (missing.size === 0) return;

    clientsStore.set((prev) => {
      const have = new Set(prev.map((c) => c.id));
      const created = [...missing.entries()]
        .filter(([id]) => !have.has(id))
        .map(([id, m]) => ({
          id,
          branchId: m.branchId,
          name: m.name || 'Cliente Ma Couronne',
          phone: '',
          city: '',
          /* Le Trône tourne côté personnel : il peut créer le persona d'accueil
             s'il manque encore (idempotent). */
          persona: ensureInitiePersona(),
          since: m.since,
          segments: ['Ma Couronne'],
          priceCoef: 1,
          loyaltyPoints: 0,
        }));
      return created.length ? [...prev, ...created] : prev;
    });
  }, [session, appts, invoices]);

  /* Prospects — chaque consultation en ligne (tunnel Ma Couronne) crée
     automatiquement une fiche « Prospect » (personne en phase de consultation,
     pas encore cliente), si aucune fiche ne correspond déjà par nom ou téléphone. */
  useEffect(() => {
    if (!session || queue.length === 0) return;
    const digits = (s: string) => s.replace(/\D/g, '');
    const clients = clientsStore.get();
    const names = new Set(clients.map((c) => c.name.trim().toLowerCase()));
    const phones = new Set(clients.map((c) => digits(c.phone)).filter((p) => p.length >= 6));
    /* La consultation en ligne ne porte pas de branche → on crée le prospect dans
       la branche actuellement affichée (résolue comme useBranch), pour qu'il soit
       toujours visible là où le personnel travaille. */
    const branches = branchesStore.get();
    const curId = currentBranchStore.get();
    const branchId = (branches.find((b) => b.id === curId) ?? branches[0])?.id ?? 'maison';

    const seen = new Set<string>();
    const created: Client[] = [];
    for (const o of queue) {
      const nm = o.client.name.trim();
      if (!nm) continue;
      const nameKey = nm.toLowerCase();
      const phoneKey = digits(o.client.phone);
      if (names.has(nameKey)) continue;
      if (phoneKey.length >= 6 && phones.has(phoneKey)) continue;
      const key = `${nameKey}|${phoneKey}`;
      if (seen.has(key)) continue;
      seen.add(key);
      created.push({
        id: `prospect-${o.id}`,
        branchId,
        name: nm,
        phone: o.client.phone || '',
        city: o.client.city || '',
        persona: ensureInitiePersona(),
        since: (o.createdAt || new Date().toISOString()).slice(0, 10),
        segments: [PROSPECT_SEGMENT],
        priceCoef: 1,
        loyaltyPoints: 0,
      });
    }
    if (created.length) {
      clientsStore.set((prev) => {
        const have = new Set(prev.map((c) => c.id));
        const add = created.filter((c) => !have.has(c.id));
        return add.length ? [...prev, ...add] : prev;
      });
    }
  }, [session, queue]);
}
