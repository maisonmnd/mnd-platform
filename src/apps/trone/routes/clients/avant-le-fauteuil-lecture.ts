import { useMemo } from 'react';
import { useAppointments, type Appointment } from '../../../../shared/agenda';
import { useClients, useFamilies, type Client } from '../../../../shared/clients';
import { useCategories, type CatalogCategory } from '../../../../shared/catalog';
import { openingForIso, useSettings } from '../../../../shared/settings';
import { useCredits, useInvoices } from '../../../../shared/finance';
import { cleDuNumeroWa, useMessagesWa } from '../../../../shared/conversations';
import { holderOf } from '../../../../shared/accounts';
import { comptesAbonnement, usePlans, useSubscribers, ETATS_QUI_COURENT } from '../../../../shared/abonnements';
import { contratDeLaSeance } from '../../../../shared/abonnee-pur';
import { ecrituresDeLaTete, ecrituresDuCompte, lignesImpayees, tetesDuCompte } from '../../../../shared/compte';
import {
  avantLeFauteuil,
  type BriefingAvantLeFauteuil, type CarnetLu, type ClienteLue, type EntreeAvantLeFauteuil, type MessageLu, type RdvLu,
} from '../../../../shared/avant-le-fauteuil-pur';
import {
  apptDueXof, apptDurationMin, apptLabel, apptNetXof, timeToMin, todayISO, useBranchAppointments, useClefDuTarif, useServicesById,
} from './_shared';

/* ══ CE QU'« AVANT LE FAUTEUIL » LIT DANS LES MAGASINS — 31 octobre 2026 ══
   « N'oublie pas de me faire un résumé de ce que je dois savoir avant un RDV
   d'un client. Credo vient le 13 novembre, il faut que je me souvienne de
   relire notre conversation. » (Yéman, 31 octobre 2026).

   Le juge est `shared/avant-le-fauteuil-pur.ts` : il reçoit tout en
   paramètres et ne lit rien. CE FICHIER EST SA SEULE PRISE SUR LE TRÔNE : il
   assemble l'`EntreeAvantLeFauteuil` d'un rendez-vous depuis les magasins
   (le Carnet, les fiches, le catalogue, les Conversations de la Maison, les
   formules, le compte, les pièces, les heures de la Maison) et rend le
   briefing. Deux lecteurs l'emploient : l'écran (la ligne cuivre sous chaque
   rendez-vous du Carnet et dans Parcours) et le passage du soir et du matin
   qui pousse la notification (`avant-le-fauteuil-donnees.ts`).

   UNE SEULE LECTURE, TRANCHÉ LE 31 OCTOBRE 2026. Le chantier était né avec
   deux prises sur les magasins : l'écran lisait lui-même (rendez-vous de la
   branche, compte de la fiche, relevé de l'abonnée) et la notification
   passait par ici (tous les rendez-vous, `duDeLaTete`, `comptesAbonnement`).
   Le téléphone pouvait donc dire « Justine revient après 5 mois » ou « doit
   8 000 F » et le Carnet dire autre chose. L'écran ne lit plus rien : il
   appelle `lis(rdv)`. Et chaque donnée est prise là où le Trône l'affiche
   déjà, pour que la ligne cuivre dise le chiffre de la fiche et celui de la
   fenêtre du rendez-vous :
     · SES RENDEZ-VOUS (dernière venue, mois sans venir, dernière note) :
       toutes branches. Une dernière venue au Plateau compte même vue depuis
       Suru-Léré, et « 5 mois sans venir » se compte sur sa vie à la Maison.
     · CE QU'ELLE DOIT : la méthode de la fiche cliente (`CompteDeLaCliente`
       dans Customers.tsx), à l'identique. Voir `duDeLaFiche`.
     · SON CARNET VIVANT : la fenêtre du rendez-vous (`SeanceDeLaFormule`,
       « compris dans sa formule ») et l'écran Abonnements. Voir `carnetDe`.
     · LES TRESSES : la catégorie, sa chaîne de parents, ou le nom.
   Seule la LISTE des rendez-vous du jour visé reste par branche
   (`useEntreesAvantLeFauteuil`) : le Carnet est par branche.

   CHOIX 3 DE LA MAQUETTE : le Trône ne devine rien de son WhatsApp
   personnel. Il lit `note` (posée par Opale), les messages ENTRANTS de la
   cliente aux numéros de la Maison, et ses propres données. */

/** Le rendez-vous, sa fiche, l'entrée tendue au juge et ce qu'il en a dit. */
export type LectureAvantLeFauteuil = {
  rdv: Appointment;
  cliente: Client | null;
  entree: EntreeAvantLeFauteuil;
  briefing: BriefingAvantLeFauteuil;
};

/** LES RENDEZ-VOUS À VENIR D'UN JOUR, dans l'ordre des heures : confirmés et
    en attente. Un rendez-vous honoré n'a plus rien à préparer, un annulé
    n'aura pas lieu. Pur. */
export const rendezVousAVenirDu = (appts: readonly Appointment[], jour: string): Appointment[] =>
  appts
    .filter((a) => a.date === jour && (a.status === 'confirmé' || a.status === 'en attente'))
    .sort((a, b) => timeToMin(a.time) - timeToMin(b.time) || a.id.localeCompare(b.id));

/** La fiche, réduite à ce que le juge en lit. */
const clienteLue = (c: Client): ClienteLue => ({
  id: c.id, name: c.name, phone: c.phone, phone2: c.phone2, birthday: c.birthday, civilite: c.civilite, lockCount: c.lockCount,
});

/** TRESSES, NATTES, VANILLES : un rendez-vous de tresses prévient Hermine,
    coiffeuse externe. Le mot se cherche dans le nom de la prestation, puis
    dans sa catégorie et toute la chaîne de ses parents (code ERP, identifiant,
    nom fon, descripteur) : « Tressage » comme « Demi-vanilles » sont pris,
    sans frontière de mot, car un catalogue n'a pas de « stress ». La version
    la plus complète des deux lectures d'avant le 31 octobre 2026. */
const TRESSES = /tress|natte|vanille/i;
const estDesTresses = (
  serviceId: string, byId: ReturnType<typeof useServicesById>, catById: ReadonlyMap<string, CatalogCategory>,
): boolean => {
  const s = byId.get(serviceId);
  if (!s) return false;
  if (TRESSES.test(s.name)) return true;
  let cat = catById.get(s.categoryId);
  for (let i = 0; cat && i < 8; i += 1) {
    if (TRESSES.test(`${cat.code ?? ''} ${cat.id} ${cat.fon} ${cat.label}`)) return true;
    cat = cat.parentId ? catById.get(cat.parentId) : undefined;
  }
  return false;
};

/** UN LECTEUR : `lis(rdv)` rend la lecture d'un rendez-vous, quel qu'il
    soit, avec les magasins tels qu'ils sont à cet instant. L'écran l'appelle
    par ligne ; le passage l'appelle sur les rendez-vous du jour visé. */
export function useLecteurAvantLeFauteuil(): { aujourdhui: string; lis: (rdv: Appointment) => LectureAvantLeFauteuil } {
  /* TOUS ses rendez-vous, toutes branches : « 5 mois sans venir » se compte
     sur sa vie à la Maison, pas sur une seule branche. */
  const [tous] = useAppointments();
  const [clients] = useClients();
  const [families] = useFamilies();
  const byId = useServicesById();
  const [categories] = useCategories();
  const [messages] = useMessagesWa();
  const [subs] = useSubscribers();
  const [plans] = usePlans();
  const [invoices] = useInvoices();
  const [credits] = useCredits();
  /* Les réglages de la Maison portent les heures que lit `openingForIso` ;
     la clef du tarif refait les prix quand un calibre ou un barème change. */
  const [reglages] = useSettings();
  const clefDuTarif = useClefDuTarif();
  const aujourdhui = todayISO();

  const lis = useMemo(() => {
    const parId = new Map(clients.map((c) => [c.id, c]));
    const catById = new Map(categories.map((c) => [c.id, c]));

    /* Le rendez-vous tel que le juge le lit : ses chiffres figés par les
       mêmes mains que le Carnet (durée, net, phrase). La durée passe par
       `apptDurationMin` : ce qui est écrit sur le rendez-vous, sinon la grille,
       sinon le catalogue ; un rendez-vous d'avant la règle du 1er septembre
       2026 n'a pas de `dureeMin` écrit, et « hors des heures » se juge sur sa
       vraie durée, pas sur une heure par défaut. */
    const rdvLu = (a: Appointment): RdvLu => ({
      id: a.id, clientId: a.clientId, date: a.date, time: a.time, status: a.status, serviceIds: a.serviceIds,
      note: a.note, pieces: a.pieces, coveredBySub: a.coveredBySub, dureeMin: apptDurationMin(a, byId),
      prixXof: apptNetXof(a, byId), libelle: apptLabel(a, byId),
    });

    /* SES MESSAGES AUX NUMÉROS DE LA MAISON : par la fiche quand le webhook
       l'a reconnue, sinon par ses numéros (la clé de Meta, `cleDuNumeroWa`).
       Le juge ne garde que les entrants ; on lui tend tout le fil. Un
       rendez-vous sans fiche (`clientId` vide) ne ramasse pas les messages
       sans fiche de toute la Maison. */
    const messagesDe = (cliente: Client | null, clientId: string): MessageLu[] => {
      const cles = new Set([cliente?.phone, cliente?.phone2].map((n) => cleDuNumeroWa(n)).filter((k) => k !== ''));
      return messages
        .filter((m) => (clientId !== '' && m.clientId === clientId) || (cles.size > 0 && cles.has(cleDuNumeroWa(m.numero))))
        .map((m) => ({ quand: m.quand, texte: m.texte ?? '', type: m.type, sens: m.sens }));
    };

    /* ── CE QU'ELLE DOIT : LE CHIFFRE DE LA FICHE, 31 octobre 2026 ────────
       La fiche cliente (`CompteDeLaCliente`, Customers.tsx) dit « Justine
       doit 8 000 F à la Maison » ainsi : `ecrituresDuCompte` sur les têtes
       du compte (`tetesDuCompte`) et les porteurs d'avoir (`holderOf`), puis
       SES écritures à elle quand elle est en foyer (`ecrituresDeLaTete` : une
       enfant ne porte pas la dette de sa mère), puis la somme des
       `lignesImpayees`. C'est cette méthode, et pas `duDeLaTete`, que le
       lecteur prend : `duDeLaTete` ne somme que les rituels, et oublie une
       facture libre impayée (une vente de produits au comptoir) que la fiche
       compte. Le téléphone et la fiche doivent dire le même chiffre.

       LES RENDEZ-VOUS DE SA BRANCHE, comme la fiche : `CompteDeLaCliente` lit
       `useBranchAppointments`, et la fiche ne s'ouvre que depuis sa branche
       (`useBranchClients`). Lire ici toutes les branches ferait annoncer au
       téléphone une dette que la fiche ne montre pas.

       SANS CE RENDEZ-VOUS-CI : il est à venir, son reste se règle au fauteuil,
       ce n'est pas une dette d'avant. Le jour même, la fiche le compte déjà
       (`rituelAuCompte` : la date est passée ou égale) ; la ligne cuivre, non.
       C'est la seule différence voulue avec la fiche. */
    const duDeLaFiche = (rdv: Appointment, cliente: Client | null): number => {
      if (!rdv.clientId) return 0;
      const ids = cliente ? tetesDuCompte(cliente, clients, families) : [rdv.clientId];
      const vus = new Map<string, { type: 'client' | 'family'; id: string }>();
      for (const id of ids) {
        const t = parId.get(id);
        if (!t) continue;
        const h = holderOf(t, families);
        vus.set(`${h.type}:${h.id}`, h);
        vus.set(`client:${t.id}`, { type: 'client', id: t.id });
      }
      const appts = cliente ? tous.filter((a) => a.branchId === cliente.branchId) : tous;
      const ecritures = ecrituresDuCompte({
        ids, porteurs: [...vus.values()], appts, invoices, credits, aujourdhui,
        netDuRituel: (a) => apptNetXof(a, byId),
        dûDuRituel: (a) => apptDueXof(a, byId),
      });
      const siennes = ids.length > 1 ? ecrituresDeLaTete(ecritures, rdv.clientId) : ecritures;
      return lignesImpayees(siennes)
        .filter((l) => l.refId !== rdv.id)
        .reduce((s, l) => s + l.resteXof, 0);
    };

    /* ── SON CARNET VIVANT : LA FENÊTRE DU RENDEZ-VOUS, 31 octobre 2026 ──
       La fenêtre du rendez-vous dit « compris dans sa formule » et
       `SeanceDeLaFormule` dit « Incluse · séance 2 sur 3 » par le relevé de
       l'abonnée (`releveDeLAbonnee`, shared/abonnee-pur.ts) sur le contrat
       que nomme `contratDeLaSeance` : celui du `subId` du rendez-vous, sinon
       le plus récent en vie à sa date qui porte la prestation. L'écran
       Abonnements lit `comptesAbonnement`, qui n'est que ce même relevé
       projeté par tête : « faites, réservées, disponibles sur promis »,
       comptées UNE FOIS PAR SÉANCE (« six séances, pas douze »), comme le
       « séance 2 sur 3 » de la fenêtre. L'ancienne lecture de l'écran sommait
       les lignes par prestation et doublait une formule à deux prestations.

       Le lecteur prend donc `comptesAbonnement` pour les chiffres (ceux de
       l'écran Abonnements) et `contratDeLaSeance` pour le contrat (celui de
       la fenêtre du rendez-vous) : « faites 1, réservées 1, reste 1 » est le
       même chiffre aux trois endroits. Un contrat qui ne court plus ne se dit
       que si cette séance en est couverte. */
    const carnetDe = (rdv: Appointment, siens: readonly Appointment[]): CarnetLu | null => {
      if (!rdv.clientId) return null;
      const contrats = subs.filter((s) => s.clientId === rdv.clientId);
      if (contrats.length === 0) return null;
      const compte = comptesAbonnement({ subs: contrats, plans, appts: siens, aujourdhui, invoices })[0];
      if (!compte) return null;
      const nomme = contratDeLaSeance(rdv, contrats, plans);
      const c = (nomme ? compte.contrats.find((x) => x.sub.id === nomme.id) : undefined) ?? compte.vif;
      if (!c) return null;
      if (!ETATS_QUI_COURENT.includes(c.etat) && !rdv.coveredBySub) return null;
      return {
        nom: c.releve.nom,
        faites: c.faites,
        reservees: c.reservees,
        restantes: c.promis > 0 ? Math.max(0, c.promis - c.utilises) : null,
        expireLe: c.releve.finIso ?? undefined,
      };
    };

    return (rdv: Appointment): LectureAvantLeFauteuil => {
      const cliente = parId.get(rdv.clientId) ?? null;
      /* UN RENDEZ-VOUS SANS FICHE (`clientId` vide, une tête de passage) n'a
         pas de vie à la Maison : lui prêter tous les rendez-vous sans fiche
         ferait une « dernière venue » et une dette qui ne sont à personne. */
      const siens = rdv.clientId ? tous.filter((a) => a.clientId === rdv.clientId) : [];
      /* Le rendez-vous tel que le magasin le porte à cet instant : une note
         ou une pièce posée il y a une seconde se lit tout de suite. */
      const frais = siens.find((a) => a.id === rdv.id) ?? rdv;
      const entree: EntreeAvantLeFauteuil = {
        aujourdhui,
        rdv: rdvLu(frais),
        cliente: cliente ? clienteLue(cliente) : null,
        sesRdv: siens.map(rdvLu),
        messages: messagesDe(cliente, rdv.clientId),
        carnet: carnetDe(frais, siens),
        duXof: duDeLaFiche(frais, cliente),
        ouverture: openingForIso,
        prestationsTresses: (id) => estDesTresses(id, byId, catById),
      };
      return { rdv: frais, cliente, entree, briefing: avantLeFauteuil(entree) };
    };
  /* `reglages` et `clefDuTarif` ne servent que de clef : les heures et les prix se relisent par leurs fonctions. */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tous, clients, families, byId, categories, messages, subs, plans, invoices, credits, aujourdhui, reglages, clefDuTarif]);

  return { aujourdhui, lis };
}

/** LES LECTURES D'UN JOUR, pour la branche courante : chaque rendez-vous à
    venir de ce jour, dans l'ordre des heures, avec son briefing. Le passage
    du soir lui tend demain, celui du matin aujourd'hui ; le Carnet, le jour
    qu'il montre. La LISTE est par branche (le Carnet l'est) ; chaque lecture,
    elle, voit toute la vie de la cliente. */
export function useEntreesAvantLeFauteuil(jour: string): LectureAvantLeFauteuil[] {
  const appts = useBranchAppointments();
  const { lis } = useLecteurAvantLeFauteuil();
  return useMemo(() => rendezVousAVenirDu(appts, jour).map((a) => lis(a)), [appts, jour, lis]);
}
