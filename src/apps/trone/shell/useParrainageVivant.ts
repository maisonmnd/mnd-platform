import { useEffect, useRef } from 'react';
import { useAppointments } from '../../../shared/agenda';
import { useClients, clientsStore } from '../../../shared/clients';
import { useDemandes, demandesStore } from '../../../shared/demandes';
import { useServices } from '../../../shared/catalog';
import { useAuth } from '../../../shared/auth';
import { documentDescendu, tablePrete } from '../../../shared/sync';
import { envoieSurWhatsApp } from '../../../shared/whatsapp';
import {
  codesAAttribuer, resumeDuParrainage, soinsAPoser, useParrainage,
  type DemandeParrainee,
} from '../../../shared/parrainage';
import { carteDeMarraineEnPiece } from '../../../ds/carte-marraine';

/* ══ LA CARTE DE CHAQUE CLIENTE, TENUE À JOUR — 28 septembre 2026 ══════
   Maquette « La carte de marraine MND » validée (« validé », Yéman). Trois
   gestes, en tâche de fond, sur le patron de useRattacheLesReservations :

   ① CHAQUE FICHE A SON CODE. Une cliente sans code en reçoit un, tiré de
     son prénom et de son identifiant (le même sur tous les postes) ; celle
     qui l'avait déjà demandé sur le site garde celui-là.
   ② LE RÉSUMÉ DE SES FILLEULES suit le carnet : un prénom, un état, une
     date, écrits sur SA fiche pour que Ma Couronne les lise.
   ③ UNE AMIE VENUE (visite honorée) POSE LE SOIN OFFERT sur la fiche de la
     marraine, marque la demande de l'amie, et, si la Maison l'a allumé, part
     le remerciement WhatsApp (modèle `parrainage_merci`, la carte en image).

   LES JUGES SONT PURS (shared/parrainage), éprouvés par verifie-le-parrainage.
   RIEN NE S'ÉCRIT AVANT LA PREMIÈRE LECTURE des fiches, du carnet et des
   demandes, ni avant le réglage : un code posé sur une liste vide en
   doublerait un qui existe au serveur. Le soin porte l'identifiant de la
   demande de l'amie : deux postes qui le posent ensemble n'en font qu'un. */
export function useParrainageVivant(): void {
  const { session } = useAuth();
  const [clients] = useClients();
  const [demandes] = useDemandes();
  const [rdvs] = useAppointments();
  const [services] = useServices();
  const [reglage] = useParrainage();
  /** Les remerciements en vol, pour ne pas les relancer au rendu suivant. */
  const enVol = useRef(new Set<string>());

  useEffect(() => {
    if (!session) return;
    if (!tablePrete('clients') || !tablePrete('demandes') || !tablePrete('appointments')) return;
    const liste = demandes as DemandeParrainee[];

    /* ① Les codes. */
    const codes = codesAAttribuer(clients, liste);
    if (codes.length) {
      const parFiche = new Map(codes.map((c) => [c.clientId, c.code]));
      clientsStore.set((prev) => prev.map((c) => (parFiche.has(c.id) && !c.codeParrain ? { ...c, codeParrain: parFiche.get(c.id) } : c)));
      return;
    }

    /* ② Les résumés : seulement ceux qui changent. */
    const lus = rdvs.map((a) => ({ id: a.id, status: a.status, date: a.date }));
    const resumes = new Map<string, ReturnType<typeof resumeDuParrainage>>();
    for (const c of clients) {
      if (!c.codeParrain) continue;
      const r = resumeDuParrainage(c.codeParrain, liste, lus);
      const avant = JSON.stringify(c.parrainage ?? { filleules: [] });
      if (JSON.stringify(r) !== avant) resumes.set(c.id, r);
    }
    if (resumes.size) {
      clientsStore.set((prev) => prev.map((c) => (resumes.has(c.id) ? { ...c, parrainage: resumes.get(c.id) } : c)));
      return;
    }

    /* ③ Les soins offerts, et le remerciement. */
    if (!documentDescendu('mnd_parrainage')) return;
    const aujourdhui = new Date().toISOString().slice(0, 10);
    const nom = (id: string) => services.find((s) => s.id === id)?.name;
    const gestes = soinsAPoser(clients, liste, lus, reglage, aujourdhui, nom);
    if (!gestes.length) return;
    const soins = new Map<string, NonNullable<(typeof gestes)[number]['soin']>[]>();
    for (const g of gestes) if (g.soin) soins.set(g.clientId, [...(soins.get(g.clientId) ?? []), g.soin]);
    if (soins.size) {
      clientsStore.set((prev) => prev.map((c) => {
        const nouveaux = (soins.get(c.id) ?? []).filter((s) => !(c.soinsOfferts ?? []).some((x) => x.id === s.id));
        return nouveaux.length ? { ...c, soinsOfferts: [...(c.soinsOfferts ?? []), ...nouveaux] } : c;
      }));
    }
    const maintenant = new Date().toISOString();
    const aRemercier = reglage.merciParWhatsApp ? gestes.filter((g) => g.merci && !enVol.current.has(g.demandeId)) : [];
    const marques = new Set(gestes.map((g) => g.demandeId));
    const remercies = new Set(aRemercier.map((g) => g.demandeId));
    demandesStore.set((prev) => prev.map((d) => (marques.has(d.id)
      ? { ...d, cadeauMarraineRemisLe: maintenant, ...(remercies.has(d.id) ? { merciEnvoyeLe: maintenant } : {}) } as typeof d
      : d)));

    for (const g of aRemercier) {
      enVol.current.add(g.demandeId);
      const fiche = clients.find((c) => c.id === g.clientId);
      void (async () => {
        const piece = fiche?.codeParrain
          ? await carteDeMarraineEnPiece({
            prenom: g.prenomMarraine, code: fiche.codeParrain,
            depuis: (fiche.since ?? '').slice(0, 4), modele: fiche.carteModele,
          }).catch(() => undefined)
          : undefined;
        await envoieSurWhatsApp({
          numero: g.telephone,
          modele: 'parrainage_merci',
          variables: [g.prenomMarraine, g.prenomFilleule, g.libelle],
          ...(piece ? { enTete: 'image' as const, piece } : {}),
          clientId: g.clientId,
          parQui: 'Le Trône · parrainage',
        });
      })();
    }
  }, [session, clients, demandes, rdvs, services, reglage]);
}
