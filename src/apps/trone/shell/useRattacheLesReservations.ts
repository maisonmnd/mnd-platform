import { useEffect } from 'react';
import { useAppointments, appointmentsStore } from '../../../shared/agenda';
import { useClients, clientsStore, ensureInitiePersona } from '../../../shared/clients';
import { useDemandes, demandesStore, rattachementsAFaire, ficheDepuisLaDemande } from '../../../shared/demandes';
import { useAuth } from '../../../shared/auth';
import { tablePrete } from '../../../shared/sync';
import { supabase } from '../../../shared/supabase';

/* ══ LA RÉSERVATION DU SITE TROUVE SA FICHE EN ÉTANT CONFIRMÉE — 18 sept. 2026 ══
   Arbitrage de Yéman (maquette `maquette-le-journal-des-envois.html`) :
   valider depuis le calendrier une réservation du site crée sa fiche, au
   segment Prospect, comme « En faire une cliente ». C'est elle qui porte le
   numéro, et c'est ce numéro que la confirmation WhatsApp attend.

   LE JUGE EST PUR (`rattachementsAFaire`, shared/demandes) : il regarde le
   résultat, pas le chemin, et les sept écrans qui confirment un rendez-vous
   n'ont rien à savoir.

   LA LEÇON DU 13 AOÛT TIENT ICI AUSSI (useReconcileClients) : rien ne se
   crée avant la première lecture des trois tables, et une fiche au même
   identifiant qui existe déjà au serveur ne se refabrique pas, elle
   l'écraserait à la poussée. L'identifiant est posé depuis la demande
   (`prospect-<demande>`) : deux postes ouverts en même temps ne font pas
   deux fiches. */
export function useRattacheLesReservations(): void {
  const { session } = useAuth();
  const [appts] = useAppointments();
  const [demandes] = useDemandes();
  const [clients] = useClients();

  useEffect(() => {
    if (!session) return;
    if (!tablePrete('clients') || !tablePrete('appointments') || !tablePrete('demandes')) return;
    const aFaire = rattachementsAFaire(appts, demandes, clients);
    if (aFaire.length === 0) return;

    void (async () => {
      const persona = ensureInitiePersona();
      const neuves = aFaire
        .filter((r) => !r.ficheExistante)
        .map((r) => ficheDepuisLaDemande(r.demande, persona));
      /* LA CEINTURE : le serveur porte-t-il déjà ces fiches ? Serveur muet,
         on s'abstient ; le prochain passage retentera. */
      let auServeur = new Set<string>();
      if (supabase && neuves.length > 0) {
        const { data, error } = await supabase.from('clients').select('id').in('id', neuves.map((f) => f.id));
        if (error) return;
        auServeur = new Set((data ?? []).map((r) => (r as { id: string }).id));
      }
      const aCreer = neuves.filter((f) => !auServeur.has(f.id));
      if (aCreer.length > 0) {
        clientsStore.set((prev) => {
          const have = new Set(prev.map((c) => c.id));
          const add = aCreer.filter((f) => !have.has(f.id));
          return add.length ? [...prev, ...add] : prev;
        });
      }
      const ficheDe = new Map(aFaire.map((r) => [
        r.apptId,
        { id: r.ficheExistante?.id ?? `prospect-${r.demande.id}`, prenom: r.demande.prenom, demandeId: r.demande.id },
      ]));
      /* Le rendez-vous ne se rattache que s'il est TOUJOURS sans fiche :
         une main a pu le rattacher entre-temps, elle a le dernier mot. */
      appointmentsStore.set((prev) => prev.map((a) => {
        const f = ficheDe.get(a.id);
        return f && !a.clientId ? { ...a, clientId: f.id, clientName: f.prenom || a.clientName } : a;
      }));
      const parDemande = new Map([...ficheDe.values()].map((f) => [f.demandeId, f.id]));
      demandesStore.set((prev) => prev.map((d) => {
        const id = parDemande.get(d.id);
        return id && d.statut !== 'convertie' ? { ...d, statut: 'convertie', clientId: id } : d;
      }));
    })();
  }, [session, appts, demandes, clients]);
}
