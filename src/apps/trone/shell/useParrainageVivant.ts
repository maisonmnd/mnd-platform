import { useEffect, useMemo, useRef } from 'react';
import { useAppointments } from '../../../shared/agenda';
import { useClients, useFamilies, clientsStore } from '../../../shared/clients';
import { depenseFoyerXof } from '../../../shared/accounts';
import { useFoyerTiers } from '../../../shared/offers';
import { useDemandes, demandesStore } from '../../../shared/demandes';
import { useProducts, useServices } from '../../../shared/catalog';
import { useAuth } from '../../../shared/auth';
import { documentDescendu, tablePrete } from '../../../shared/sync';
import { envoieSurWhatsApp } from '../../../shared/whatsapp';
import { jourDuSalon } from '../../../shared/envois';
import { useParrainage, type DemandeParrainee } from '../../../shared/parrainage';
import {
  choixReportes, lignees, rattachementsDuSite, recompensesAPoser, reglageDuMoteur, resumeDeLAmbassade, sceauxDuFoyerAPoser,
  type ReglageAmbassade,
} from '../../../shared/ambassade';
import { useDouzeLunes } from '../../../shared/douze-lunes';
import {
  PLAFOND_SANS_MAIN, attendLeLancement, codeActifDe, codesConnus, grainesAAttribuer, seuilDeLaGraine,
} from '../../../shared/douze-lunes-pur';
import { CLASSEMENT_VIDE, classementStore, useClassement } from '../../../shared/classement-ambassade';
import { carteDeMarraineEnPiece } from '../../../ds/carte-marraine';
/* Un automatisme qui réécrit les fiches en boucle se tait de lui-même
   (1er octobre 2026, voir shared/ecriture-automatique.ts). */
import { gardeLEcriture } from '../../../shared/ecriture-automatique';
import { memeContenu } from '../../../shared/meme-contenu';
import { parIdentifiant, rendezVousEnOrdre } from '../../../shared/ordre-canonique';
import { appelDe } from '../../../shared/civilite';
/* ══ LES AMBASSADRICES, TENUES À JOUR — 28 septembre 2026 ═══════════════
   Maquette validée (« construits », Yéman). Des gestes en tâche de fond,
   UN PAR PASSAGE : chaque geste écrit puis rend la main, le suivant part au
   rendu d'après, sur des données fraîches.

   ── DE MAIN EN MAIN (9 octobre 2026). Plus de code pour toutes : la carte
   se gagne (la Graine, shared/douze-lunes-pur). L'ordre devient :

   ① Le choix de la cliente (soin ou remise) est reporté sur sa récompense.
   ② L'amie qui a réservé avec le code d'une Graine (actif, ou l'ancien code
     de la même fiche) et dont le rendez-vous a trouvé sa fiche porte ce
     code sur sa fiche (`parraineePar`) : les deux chemins se rejoignent.
   ③ Les Graines, une fois les deux réglages descendus et seulement après
     le lancement : un code neuf pour chaque fiche qui atteint N jours de
     visite depuis janvier. Plus de PLAFOND_SANS_MAIN d'un coup : rien ne
     s'écrit, la direction voit la liste (borne anti-rafale).
   ④ Le résumé de Ma Couronne (amies, échos, rang) suit le carnet, pour les
     Graines seules.
   ⑤ Les mercis se posent, un par amie venue après le lancement ; le
     remerciement part si la Maison l'a allumé (dans `mnd_douze_lunes`), et
     seulement pour une amie venue depuis la Graine de sa marraine : les
     mercis en retard se posent en silence. Ni écho, ni rang, ni défi.
   ⑥ Les sceaux du Foyer, sans changement.
   ⑦ Le classement ne se montre plus aux clientes : le document reste vide
     (le personnel le calcule sur son écran).

   Les juges sont PURS (shared/ambassade, shared/douze-lunes-pur), éprouvés
   par leurs harnais. Rien ne s'écrit avant la première lecture des fiches,
   des demandes et du carnet, ni les Graines et les récompenses avant les
   réglages. */
export function useParrainageVivant(): void {
  const { session } = useAuth();
  /* MÊME ORDRE SUR TOUS LES POSTES (1er octobre 2026) : ce qui est lu se range d'abord,
     d'une seule façon, pour que deux postes ne se renvoient pas la même fiche parce
     qu'ils l'ont lue dans deux ordres (voir shared/ordre-canonique.ts). */
  const [clientsLus] = useClients();
  const [demandesLues] = useDemandes();
  const [rdvsLus] = useAppointments();
  const clients = useMemo(() => parIdentifiant(clientsLus), [clientsLus]);
  const demandes = useMemo(() => parIdentifiant(demandesLues), [demandesLues]);
  const rdvs = useMemo(() => rendezVousEnOrdre(rdvsLus), [rdvsLus]);
  const [services] = useServices();
  const [produits] = useProducts();
  const [reglage] = useParrainage();
  const [lunes] = useDouzeLunes();
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
    /* LE JOUR DE LA MAISON, pas celui de Greenwich (9 octobre 2026) : entre
       minuit et une heure au Bénin, l'heure UTC disait encore la veille. */
    const aujourdhui = jourDuSalon(new Date().toISOString());
    if (!aujourdhui) return;

    /* ① Les choix reportés. */
    const reportes = new Map<string, NonNullable<ReturnType<typeof choixReportes>>>();
    for (const c of clients) {
      const r = choixReportes(c, nomDuService, nomDuProduit);
      if (r) reportes.set(c.id, r);
    }
    if (reportes.size) {
      gardeLEcriture('parrainage', clientsStore).set((prev) => prev.map((c) => (reportes.has(c.id) ? { ...c, soinsOfferts: reportes.get(c.id) } : c)));
      return;
    }

    /* ② Le chemin du site rejoint la fiche (codes de Graine seulement). */
    const rattache = rattachementsDuSite(clients, liste, lus);
    if (rattache.length) {
      const parFiche = new Map(rattache.map((r) => [r.clientId, r]));
      gardeLEcriture('parrainage', clientsStore).set((prev) => prev.map((c) => {
        const r = parFiche.get(c.id);
        return r && !c.parraineePar ? { ...c, parraineePar: r.code, parraineeLe: r.le } : c;
      }));
      return;
    }

    if (!documentDescendu('mnd_parrainage') || !documentDescendu('mnd_douze_lunes')) return;
    /* Le jour du lancement, à l'heure du Bénin : la date métier des mercis.
       Le remerciement WhatsApp se lit dans le document du programme (le
       geste éteint l'ancien, pour un vieux poste resté ouvert). */
    const lanceLe = lunes.lanceLe ? jourDuSalon(lunes.lanceLe) || undefined : undefined;
    const reglageAmb: ReglageAmbassade = reglageDuMoteur(reglage, lunes, lanceLe);

    /* ③ LES GRAINES, après le lancement seulement. AUCUNE EXCLUSION
       (décision de la direction, 9 octobre 2026) : enfants et prix
       convenus compris, d'où un ensemble vide. Une fiche qui porte encore
       l'ancien programme sans être passée par le geste attend la relance :
       lui poser une Graine effacerait son ancien code sans l'archiver. */
    if (lunes.lanceLe) {
      const exclues = new Set<string>();
      const candidates = clients.filter((c) => !attendLeLancement(c));
      const graines = grainesAAttribuer(candidates, lus, seuilDeLaGraine(lunes), aujourdhui, codesConnus(clients, liste), exclues);
      if (graines.length > 0 && graines.length <= PLAFOND_SANS_MAIN) {
        const parFiche = new Map(graines.map((g) => [g.clientId, g.graine]));
        gardeLEcriture('parrainage', clientsStore).set((prev) => prev.map((c) => {
          const g = parFiche.get(c.id);
          return g && !c.graine && !attendLeLancement(c) ? { ...c, graine: g, codeParrain: g.code } : c;
        }));
        return;
      }
      /* Au-delà du plafond, rien ne s'écrit seul : Parrainages montre
         « n Graines attendent votre accord » et la main les pose. */
    }

    const L = lignees(clients, liste, lus);

    /* ④ Les résumés des Graines : seulement ceux qui changent. */
    const resumes = new Map<string, ReturnType<typeof resumeDeLAmbassade>>();
    for (const c of clients) {
      const code = codeActifDe(c);
      if (!code) continue;
      const l = L.get(code);
      if (!l) continue;
      const r = resumeDeLAmbassade(l, L, clients, reglageAmb, aujourdhui, nomDuService);
      /* LE CONTENU, PAS L'ORDRE DES CHAMPS (2 octobre 2026) : la base rend le
         résumé rangé à sa façon, et le comparer par son texte le faisait
         réécrire sans fin, 289 fiches par minute (voir shared/meme-contenu). */
      if (!memeContenu(r, c.parrainage ?? null)) resumes.set(c.id, r);
    }
    if (resumes.size) {
      gardeLEcriture('parrainage', clientsStore).set((prev) => prev.map((c) => (resumes.has(c.id) ? { ...c, parrainage: resumes.get(c.id) } : c)));
      return;
    }

    /* ⑤ Les mercis. */
    const poses = recompensesAPoser(clients, L, reglageAmb, aujourdhui, nomDuService);
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
        const code = codeActifDe(fiche);
        void (async () => {
          const piece = fiche && code
            ? await carteDeMarraineEnPiece({ prenom: m.prenomMarraine, code, depuis: (fiche.since ?? '').slice(0, 4), modele: fiche.carteModele, rang: fiche.parrainage?.rang }).catch(() => undefined)
            : undefined;
          await envoieSurWhatsApp({
            numero: m.telephone, modele: 'parrainage_merci', variables: [fiche ? appelDe(fiche) : m.prenomMarraine, m.prenomFilleule, m.libelle],
            ...(piece ? { enTete: 'image' as const, piece } : {}), clientId: m.clientId, parQui: 'Le Trône · ambassadrices',
          });
        })();
      }
      return;
    }

    /* ⑥ LES SCEAUX DU FOYER (29 septembre, le Cercle réuni) : un palier
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

    /* ⑦ Le classement : TOUJOURS vide pour Ma Couronne (9 octobre 2026),
       quel que soit l'ancien réglage `classementVisible`. */
    if (!documentDescendu('mnd_classement_ambassade')) return;
    if (!memeContenu(CLASSEMENT_VIDE, classement)) gardeLEcriture('parrainage', classementStore).set(CLASSEMENT_VIDE);
  }, [session, clients, demandes, rdvs, services, produits, reglage, lunes, classement, familles, sceaux]);
}
