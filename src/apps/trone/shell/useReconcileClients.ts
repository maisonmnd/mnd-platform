import { useEffect } from 'react';
import { useAppointments } from '../../../shared/agenda';
import { useInvoices } from '../../../shared/finance';
import { clientsStore, useClients, ensureInitiePersona, type Client } from '../../../shared/clients';
import { useAuth } from '../../../shared/auth';
import { useStore } from '../../../shared/store';
import { consultationsQueueStore } from '../../../shared/bridges';
import { branchesStore, currentBranchStore } from '../../../shared/branches';
import { tablePrete } from '../../../shared/sync';
import { servicesStore, fondeLaCouronne } from '../../../shared/catalog';
import { annuaireStore } from '../routes/equipe/data';
import { supabase } from '../../../shared/supabase';

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
  /* Se ré-exécute quand le CRM change — c'est aussi lui qui dit qui est connu. */
  const [tousClients] = useClients();

  useEffect(() => {
    // L'écriture des fiches exige le personnel (RLS) : n'agir qu'avec une session.
    if (!session) return;
    /* PAS DE FICHE AVANT D'AVOIR LU (13 août — Hermine D. et Elodie A.
       ÉCRASÉES). Quand les rendez-vous arrivaient avant les fiches (hydratation
       ou Realtime en retard), chaque clientId semblait orphelin : le hook
       créait une fiche fourre-tout AVEC LE MÊME identifiant, et la poussée de
       synchronisation l'écrivait PAR-DESSUS la vraie fiche du serveur — le nom
       devenait « Cliente Ma Couronne », le téléphone se vidait. On attend donc
       la première lecture de TOUTES les tables concernées. */
    if (!tablePrete('clients') || !tablePrete('appointments') || !tablePrete('invoices')) return;

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
      /* `walkin` est un marqueur d'écran (vente anonyme au comptoir), jamais un
         identifiant : le laisser passer ouvrait UNE fiche fourre-tout où toutes
         les ventes sans cliente venaient s'empiler. Les deux écrans qui le
         produisent le traduisent maintenant en amont — ceci est la ceinture. */
      if (!clientId || clientId === 'c-local' || clientId === 'walkin' || known.has(clientId)) return;
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

    /* LA CEINTURE : avant de créer, on demande AU SERVEUR s'il porte déjà ces
       identifiants. Une fiche qui existe là-bas n'est pas orpheline — elle est
       simplement en route (Realtime) : la créer ici l'écraserait à la poussée.
       On ne fabrique une fiche que pour un identifiant inconnu DES DEUX côtés. */
    void (async () => {
      if (supabase) {
        const ids = [...missing.keys()];
        const { data, error } = await supabase.from('clients').select('id').in('id', ids);
        /* Serveur muet (réseau, RLS) : on s'abstient — créer dans le doute est
           exactement l'accident qu'on répare. Le prochain passage retentera. */
        if (error) return;
        for (const r of data ?? []) missing.delete((r as { id: string }).id);
        if (missing.size === 0) return;
      }
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
    })();
  }, [session, appts, invoices, tousClients]);

  /* ── L'ANNUAIRE DES COMPTES SE REMPLIT — 19 août 2026 ─────────────
     Le nom de chaque compte (celui d'Accès & personnel) descend dans le
     document `mnd_annuaire`, lisible de tous : c'est lui qui signe le Fil et
     le Tableau. `list_staff_full` rend une liste vide à qui n'est pas
     souverain — pas une erreur — donc l'appel est sans danger partout, et
     l'annuaire se rafraîchit à chaque passage d'un souverain. */
  useEffect(() => {
    if (!session || !supabase) return;
    void supabase.rpc('list_staff_full').then(({ data, error }) => {
      if (error || !data || (data as { email: string }[]).length === 0) return;
      const frais: Record<string, string> = {};
      for (const r of data as { email: string; name: string | null }[]) {
        const mail = (r.email ?? '').trim().toLowerCase();
        if (mail && r.name?.trim()) frais[mail] = r.name.trim();
      }
      if (Object.keys(frais).length === 0) return;
      const actuel = annuaireStore.get();
      const change = Object.entries(frais).some(([k, v]) => actuel[k] !== v)
        || Object.keys(actuel).length !== Object.keys(frais).length;
      if (change) annuaireStore.set(frais);
    });
  }, [session]);

  /* ── LA COURONNE RATTRAPÉE — 19 août 2026 ─────────────────────────
     « Fix it for all VÈKPÈ creations » : les couronnes déjà posées dont la
     fiche est restée muette. Pour chaque cliente SANS « Couronne depuis »
     qui porte un rituel HONORÉ contenant une création VÈKPÈ, on inscrit la
     date du PREMIER de ces rituels — la couronne est née ce jour-là, pas au
     dernier passage. Idempotent : une fiche déjà datée (à la main ou par un
     passage précédent) n'est jamais réécrite ; le geste vivant est dans
     `honorAppointment`, ceci n'est que le rattrapage de l'histoire. La
     reconnaissance passe par la CATÉGORIE (fondeLaCouronne), jamais par le
     nom. On attend la première lecture du catalogue : sans les fiches de
     prestations, tout rituel semblerait étranger à VÈKPÈ. */
  useEffect(() => {
    if (!session) return;
    if (!tablePrete('clients') || !tablePrete('appointments') || !tablePrete('catalog_services')) return;
    const services = new Map(servicesStore.get().map((s) => [s.id, s]));
    const naissances = new Map<string, string>();
    for (const a of appts) {
      if (a.status !== 'honoré' || !a.clientId) continue;
      if (!a.serviceIds.some((id) => { const sv = services.get(id); return sv && fondeLaCouronne(sv); })) continue;
      const deja = naissances.get(a.clientId);
      if (!deja || a.date < deja) naissances.set(a.clientId, a.date);
    }
    if (naissances.size === 0) return;
    const aDater = clientsStore.get().filter((c) => !c.crownSince && naissances.has(c.id));
    if (aDater.length === 0) return;
    clientsStore.set((prev) => prev.map((c) => (!c.crownSince && naissances.has(c.id)
      ? { ...c, crownSince: naissances.get(c.id) }
      : c)));
  }, [session, appts, tousClients]);

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
