import { useEffect, useRef } from 'react';
import { useAppointments } from '../../../shared/agenda';
import { useClients, useFamilies, clientsStore } from '../../../shared/clients';
import { depenseFoyerXof } from '../../../shared/accounts';
import { useFoyerTiers } from '../../../shared/offers';
import { useDemandes, demandesStore } from '../../../shared/demandes';
import { useProducts, useServices } from '../../../shared/catalog';
import { useAuth } from '../../../shared/auth';
import { documentDescendu, tablePrete } from '../../../shared/sync';
import { envoieSurWhatsApp } from '../../../shared/whatsapp';
import { codesAAttribuer, useParrainage, type DemandeParrainee } from '../../../shared/parrainage';
import {
  choixReportes, classementDuMois, lignees, rattachementsDuSite, recompensesAPoser, resumeDeLAmbassade, sceauxDuFoyerAPoser,
} from '../../../shared/ambassade';
import { CLASSEMENT_VIDE, classementStore, useClassement } from '../../../shared/classement-ambassade';
import { carteDeMarraineEnPiece } from '../../../ds/carte-marraine';
/* Un automatisme qui réécrit les fiches en boucle se tait de lui-même
   (1er octobre 2026, voir shared/ecriture-automatique.ts). */
import { gardeLEcriture } from '../../../shared/ecriture-automatique';
/* ══ LES AMBASSADRICES, TENUES À JOUR — 28 septembre 2026 ═══════════════
   Maquette validée (« construits », Yéman). Six gestes, en tâche de fond,
   UN PAR PASSAGE : chaque geste écrit puis rend la main, le suivant part au
   rendu d'après, sur des données fraîches.

   ① Chaque fiche a son code (tiré de son prénom, le même sur tous les postes).
   ② L'amie qui a réservé avec un code et dont le rendez-vous a trouvé sa
     fiche porte ce code sur sa fiche (`parraineePar`) : les deux chemins se
     rejoignent.
   ③ Le choix de la cliente (soin ou remise) est reporté sur sa récompense.
   ④ Le résumé de Ma Couronne (amies, échos, rang, défi) suit le carnet.
   ⑤ Les récompenses se posent : une par amie venue, l'écho, les rangs, le
     défi ; le remerciement part si la Maison l'a allumé.
   ⑥ Le classement du mois, si la Maison l'a rendu visible.

   Les juges sont PURS (shared/ambassade), éprouvés par verifie-le-parrainage.
   Rien ne s'écrit avant la première lecture des fiches, des demandes et du
   carnet, ni les récompenses avant le réglage. */
export function useParrainageVivant(): void {
  const { session } = useAuth();
  const [clients] = useClients();
  const [demandes] = useDemandes();
  const [rdvs] = useAppointments();
  const [services] = useServices();
  const [produits] = useProducts();
  const [reglage] = useParrainage();
  const [classement] = useClassement();
  const [familles] = useFamilies();
  const [sceaux] = useFoyerTiers();
  const enVol = useRef(new Set<string>());

  useEffect(() => {
    if (!session) return;
    if (!tablePrete('clients') || !tablePrete('demandes') || !tablePrete('appointments')) return;
    const liste = demandes as DemandeParrainee[];
    const lus = rdvs.map((a) => ({ id: a.id, status: a.status, date: a.date, clientId: a.clientId }));
    const nomDuService = (id: string) => services.find((s) => s.id === id)?.name;
    const nomDuProduit = (id: string) => produits.find((p) => p.id === id)?.name;
    const aujourdhui = new Date().toISOString().slice(0, 10);

    /* ① Les codes. */
    const codes = codesAAttribuer(clients, liste);
    if (codes.length) {
      const parFiche = new Map(codes.map((c) => [c.clientId, c.code]));
      gardeLEcriture('parrainage', clientsStore).set((prev) => prev.map((c) => (parFiche.has(c.id) && !c.codeParrain ? { ...c, codeParrain: parFiche.get(c.id) } : c)));
      return;
    }

    /* ② Le chemin du site rejoint la fiche. */
    const rattache = rattachementsDuSite(clients, liste, lus);
    if (rattache.length) {
      const parFiche = new Map(rattache.map((r) => [r.clientId, r]));
      gardeLEcriture('parrainage', clientsStore).set((prev) => prev.map((c) => {
        const r = parFiche.get(c.id);
        return r && !c.parraineePar ? { ...c, parraineePar: r.code, parraineeLe: r.le } : c;
      }));
      return;
    }

    /* ③ Les choix reportés. */
    const reportes = new Map<string, NonNullable<ReturnType<typeof choixReportes>>>();
    for (const c of clients) {
      const r = choixReportes(c, nomDuService, nomDuProduit);
      if (r) reportes.set(c.id, r);
    }
    if (reportes.size) {
      gardeLEcriture('parrainage', clientsStore).set((prev) => prev.map((c) => (reportes.has(c.id) ? { ...c, soinsOfferts: reportes.get(c.id) } : c)));
      return;
    }

    if (!documentDescendu('mnd_parrainage')) return;
    const L = lignees(clients, liste, lus);

    /* ④ Les résumés : seulement ceux qui changent. */
    const resumes = new Map<string, ReturnType<typeof resumeDeLAmbassade>>();
    for (const c of clients) {
      if (!c.codeParrain || c.archived) continue;
      const l = L.get(c.codeParrain);
      if (!l) continue;
      const r = resumeDeLAmbassade(l, L, clients, reglage, aujourdhui, nomDuService);
      if (JSON.stringify(r) !== JSON.stringify(c.parrainage ?? null)) resumes.set(c.id, r);
    }
    if (resumes.size) {
      gardeLEcriture('parrainage', clientsStore).set((prev) => prev.map((c) => (resumes.has(c.id) ? { ...c, parrainage: resumes.get(c.id) } : c)));
      return;
    }

    /* ⑤ Les récompenses. */
    const poses = recompensesAPoser(clients, L, reglage, aujourdhui, nomDuService);
    if (poses.parFiche.size) {
      gardeLEcriture('parrainage', clientsStore).set((prev) => prev.map((c) => {
        const neuves = (poses.parFiche.get(c.id) ?? []).filter((s) => !(c.soinsOfferts ?? []).some((x) => x.id === s.id));
        return neuves.length ? { ...c, soinsOfferts: [...(c.soinsOfferts ?? []), ...neuves] } : c;
      }));
      if (poses.demandesMarquees.length) {
        const marquees = new Set(poses.demandesMarquees);
        const maintenant = new Date().toISOString();
        gardeLEcriture('parrainage', demandesStore).set((prev) => prev.map((d) => (marquees.has(d.id) && !(d as DemandeParrainee).cadeauMarraineRemisLe
          ? { ...d, cadeauMarraineRemisLe: maintenant } as typeof d : d)));
      }
      for (const m of poses.mercis) {
        const cle = `${m.clientId}|${m.prenomFilleule}`;
        if (enVol.current.has(cle)) continue;
        enVol.current.add(cle);
        const fiche = clients.find((c) => c.id === m.clientId);
        void (async () => {
          const piece = fiche?.codeParrain
            ? await carteDeMarraineEnPiece({ prenom: m.prenomMarraine, code: fiche.codeParrain, depuis: (fiche.since ?? '').slice(0, 4), modele: fiche.carteModele, rang: fiche.parrainage?.rang }).catch(() => undefined)
            : undefined;
          await envoieSurWhatsApp({
            numero: m.telephone, modele: 'parrainage_merci', variables: [m.prenomMarraine, m.prenomFilleule, m.libelle],
            ...(piece ? { enTete: 'image' as const, piece } : {}), clientId: m.clientId, parQui: 'Le Trône · ambassadrices',
          });
        })();
      }
      return;
    }

    /* ⑤ bis LES SCEAUX DU FOYER (29 septembre, le Cercle réuni) : un palier
       atteint par la maisonnée pose sa récompense sur la fiche de celle qui
       règle le foyer. Une fois par palier et par foyer. */
    if (documentDescendu('mnd_foyer_tiers') && sceaux.length && tablePrete('families')) {
      const foyers = familles.map((f) => {
        const payeur = clients.find((c) => c.id === f.payerClientId);
        return payeur ? { famId: f.id, nom: f.name, payeurId: payeur.id, depense: depenseFoyerXof(payeur, clients, familles, rdvs) } : null;
      }).filter((x): x is NonNullable<typeof x> => !!x);
      const poses = sceauxDuFoyerAPoser(foyers, sceaux, clients, aujourdhui, reglage.validiteMois ?? 6, nomDuService);
      if (poses.size) {
        gardeLEcriture('parrainage', clientsStore).set((prev) => prev.map((c) => {
          const neuves = (poses.get(c.id) ?? []).filter((s) => !(c.soinsOfferts ?? []).some((x) => x.id === s.id));
          return neuves.length ? { ...c, soinsOfferts: [...(c.soinsOfferts ?? []), ...neuves] } : c;
        }));
        return;
      }
    }

    /* ⑥ Le classement du mois, une fois le document descendu. */
    if (!documentDescendu('mnd_classement_ambassade')) return;
    const voulu = reglage.classementVisible ? classementDuMois(L, aujourdhui) : CLASSEMENT_VIDE;
    if (JSON.stringify(voulu) !== JSON.stringify(classement)) gardeLEcriture('parrainage', classementStore).set(voulu);
  }, [session, clients, demandes, rdvs, services, produits, reglage, classement, familles, sceaux]);
}
