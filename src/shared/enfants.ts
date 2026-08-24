import { createStore, useStore, uid } from './store';
import { clientsStore, familiesStore, type Client } from './clients';
import { estMineur } from './accounts';
import { supabase } from './supabase';

/* LES ENFANTS SE DÉCLARENT, PUIS SE VALIDENT.

   Un parent a besoin que ses enfants aient leurs propres rendez-vous : une
   couronne de neuf ans n'est pas celle de sa mère, et son suivi non plus. Mais
   un mineur n'a ni compte, ni e-mail, ni téléphone — c'est le parent qui agit.

   POURQUOI UNE DÉCLARATION, ET NON UNE FICHE CRÉÉE DIRECTEMENT.

   La règle de sécurité qui ouvrira l'accès du parent dit : « je vois les
   mineurs de la famille dont je suis le parent payeur ». Si le parent pouvait
   écrire lui-même dans le carnet des clientes, il lui suffirait de rattacher à
   sa famille la fiche d'une autre pour la lire entière. Le trou n'est pas
   théorique : c'est la porte la plus large qu'on puisse ouvrir dans un CRM.

   Le parent ne touche donc jamais à `clients`. Il dépose ici un prénom et une
   date de naissance — rien qui désigne quelqu'un d'existant. La Maison regarde,
   et c'est ELLE qui crée la fiche. Tant que personne n'a validé, l'enfant
   n'existe pas et n'ouvre aucun accès.

   La table suit le patron des rendez-vous : la ligne porte l'identifiant du
   parent, il voit les siennes, le personnel voit tout. */

export type EnfantDeclare = {
  id: string;
  branchId: string;
  /** LE PARENT QUI DÉCLARE — c'est ce champ que la sécurité de la base lit
      pour savoir qui a le droit de voir cette ligne. */
  clientId: string;
  /** Ce qu'il a écrit. Rien d'autre : aucun identifiant, aucune fiche visée. */
  prenom: string;
  /** SON NOM À LUI — demandé, jamais déduit du parent. Les enfants portent le
      nom de leur père, et bien des mamans sont inscrites sous leur nom de jeune
      fille : hériter du nom de la déclarante écrivait un nom faux sur la fiche.
      Le carnet le montre déjà — Christelle V. porte Enora H.. */
  nom: string;
  /** OBLIGATOIRE. Sans elle, la minorité ne se prouve pas — et la minorité est
      ce qui ouvre l'accès du parent. Voir `estMineur`. */
  birthday: string;
  declareLe: string; // ISO
  statut: 'en attente' | 'accepté' | 'refusé';
  /** Rempli à l'acceptation : la fiche que la Maison a créée. */
  clientCreeId?: string;
  /** Le mot de la Maison en cas de refus — un refus muet ne s'explique pas. */
  motif?: string;
  traiteLe?: string;
};

export const enfantsDeclaresStore = createStore<EnfantDeclare[]>('mnd_enfants_declares', []);
export const useEnfantsDeclares = () => useStore(enfantsDeclaresStore);

/** Ce que le comptoir doit regarder. */
export const enAttente = (l: EnfantDeclare[], branchId?: string): EnfantDeclare[] =>
  l.filter((e) => e.statut === 'en attente' && (!branchId || e.branchId === branchId));

/** Les déclarations d'un parent — pour qu'il sache où en est sa demande. */
export const declarationsDe = (l: EnfantDeclare[], parentId: string): EnfantDeclare[] =>
  l.filter((e) => e.clientId === parentId)
    .slice()
    .sort((a, b) => b.declareLe.localeCompare(a.declareLe));

/** Le nom que la demande propose. Le comptoir le voit, et peut le corriger
    avant d'ouvrir la fiche — c'est lui qui tient le carnet. */
export const nomPropose = (d: Pick<EnfantDeclare, 'prenom' | 'nom'>): string =>
  /* `?? ''` : une demande déposée avant que le nom soit demandé n'en porte pas.
     Le comptoir doit pouvoir la lire et la compléter, pas tomber dessus. */
  [(d.prenom ?? '').trim(), (d.nom ?? '').trim()].filter(Boolean).join(' ');

/** Le parent dépose sa demande. AUCUNE FICHE N'EST CRÉÉE ICI. */
export function declarerEnfant(parent: Client, prenom: string, nom: string, birthday: string, aujourdhui: string): { ok: boolean; erreur?: string } {
  const p = prenom.trim();
  const n = nom.trim();
  if (!p) return { ok: false, erreur: 'Il manque son prénom.' };
  /* ON LE DEMANDE PLUTÔT QUE DE LE DEVINER. Le nom de l'enfant est celui de son
     père ; celui de la maman peut être son nom de jeune fille. Le déduire d'elle
     écrivait un nom faux sur la fiche de l'enfant, et ce nom la suit partout. */
  if (!n) return { ok: false, erreur: 'Il manque son nom de famille.' };
  if (!birthday) return { ok: false, erreur: 'Il manque sa date de naissance.' };
  if (birthday > aujourdhui) return { ok: false, erreur: 'Cette date est dans l’avenir.' };
  /* La Maison ne prend en charge que des mineurs par ce chemin : un majeur
     ouvre son propre compte, il n'a besoin de personne pour le porter. */
  if (!estMineur({ birthday }, aujourdhui)) {
    return { ok: false, erreur: 'Cette personne est majeure — elle peut ouvrir son propre compte.' };
  }
  /* Deux fois le même enfant : on ne fait pas la queue deux fois. */
  const deja = enfantsDeclaresStore.get().some(
    (e) => e.clientId === parent.id && e.statut === 'en attente'
      && e.prenom.trim().toLowerCase() === p.toLowerCase()
      && (e.nom ?? '').trim().toLowerCase() === n.toLowerCase() && e.birthday === birthday,
  );
  if (deja) return { ok: false, erreur: 'Cette demande est déjà en attente.' };

  enfantsDeclaresStore.set((prev) => [
    ...prev,
    {
      id: `dec-${uid()}`,
      branchId: parent.branchId,
      clientId: parent.id,
      prenom: p,
      nom: n,
      birthday,
      declareLe: aujourdhui,
      statut: 'en attente',
    },
  ]);
  return { ok: true };
}

/** Le compte famille du parent — celui qu'il a, sinon on l'ouvre, et le parent
    en devient le payeur (c'est déjà la vérité du comptoir). Partagé entre la
    validation du Trône et le rattachement direct de Ma Couronne. */
const assureFamilleDuParent = (parent: Client): string => {
  let familyId = parent.familyId;
  const familles = familiesStore.get();
  const existante = familyId ? familles.find((f) => f.id === familyId) : undefined;
  if (!existante) {
    familyId = `fam-${uid()}`;
    const patronyme = parent.name.trim().split(/\s+/).slice(-1)[0] || parent.name.trim();
    familiesStore.set((prev) => [
      ...prev,
      { id: familyId!, branchId: parent.branchId, name: `Famille ${patronyme}`, payerClientId: parent.id },
    ]);
    clientsStore.set((prev) => prev.map((c) => (c.id === parent.id ? { ...c, familyId } : c)));
  } else if (!existante.payerClientId) {
    familiesStore.set((prev) => prev.map((f) => (f.id === existante.id ? { ...f, payerClientId: parent.id } : f)));
  }
  return familyId!;
};

/** LE RATTACHEMENT DIRECT (13 août, décision de Yéman) : la cliente rattache
    ses enfants SANS validation de la Maison. La sécurité qui motivait la
    validation tenait en une phrase — un parent ne doit pas pouvoir s'annexer
    la fiche d'une AUTRE personne. Elle tient toujours : ici, on ne peut que
    CRÉER une tête neuve (prénom + nom + naissance, fiche qui naît vide).
    Si une fiche existe déjà au carnet à ce nom et cette naissance, le
    rattachement redevient une DEMANDE que la Maison arbitre — c'est le seul
    cas qui passe encore par elle. Le journal des déclarations garde trace de
    tout (statut « accepté », fiche créée). */
/** LA NAISSANCE D'UN ENFANT SE CORRIGE DEPUIS MA COURONNE (14 août). Une date
    mal saisie fausse l'âge — et c'est elle qui commande l'accès du parent.
    L'écriture passe par le SERVEUR (0050) : la RLS interdit à une cliente
    d'écrire la fiche d'un enfant, et le serveur vérifie que la tête est un
    mineur qu'elle porte, et que la correction le LAISSE mineur. */
export async function corrigerNaissance(
  enfantId: string,
  birthday: string,
  aujourdhui: string,
): Promise<{ ok: boolean; erreur?: string }> {
  if (!birthday) return { ok: false, erreur: 'Il manque la date de naissance.' };
  if (birthday > aujourdhui) return { ok: false, erreur: 'Cette date est dans l’avenir.' };
  if (!estMineur({ birthday }, aujourdhui)) {
    return { ok: false, erreur: 'Cette date en ferait une personne majeure — passez au salon pour ce changement.' };
  }
  if (supabase) {
    const { error } = await supabase.rpc('corriger_naissance_enfant', {
      p_enfant: enfantId,
      p_naissance: birthday,
    });
    if (error) {
      const msg = error.message ?? '';
      if (/function|does not exist|schema cache/i.test(msg)) {
        return { ok: false, erreur: 'La maison doit d’abord activer cette correction (migration 0050) — réessayez ensuite.' };
      }
      return { ok: false, erreur: msg || 'La correction n’a pas pu passer.' };
    }
  }
  /* Le miroir local — l'écran reflète la correction sans attendre la
     prochaine lecture du serveur. */
  clientsStore.set((prev) => prev.map((c) => (c.id === enfantId ? { ...c, birthday } : c)));
  return { ok: true };
}

export async function rattacherEnfant(
  parent: Client,
  prenom: string,
  nom: string,
  birthday: string,
  aujourdhui: string,
): Promise<{ ok: boolean; erreur?: string; enAttente?: boolean }> {
  const p = prenom.trim();
  const n = nom.trim();
  if (!p) return { ok: false, erreur: 'Il manque son prénom.' };
  if (!n) return { ok: false, erreur: 'Il manque son nom de famille.' };
  if (!birthday) return { ok: false, erreur: 'Il manque sa date de naissance.' };
  if (birthday > aujourdhui) return { ok: false, erreur: 'Cette date est dans l’avenir.' };
  if (!estMineur({ birthday }, aujourdhui)) {
    return { ok: false, erreur: 'Cette personne est majeure — elle peut ouvrir son propre compte.' };
  }
  const nomComplet = `${p} ${n}`.replace(/\s+/g, ' ').trim();

  /* AVEC BACKEND, C'EST LE SERVEUR QUI ÉCRIT (migration 0044). La RLS —
     à raison — n'autorise une cliente qu'à écrire SA fiche : créés depuis
     son téléphone, les enfants restaient locaux puis disparaissaient à la
     première relecture du serveur (constaté le 13 août sur le compte de
     test). La fonction `rattacher_enfant` vérifie et écrit elle-même ;
     on REFLÈTE ensuite ses lignes en local pour que l'écran suive tout de
     suite — l'écho Realtime les confirmera à l'identique. */
  if (supabase) {
    const { data, error } = await supabase.rpc('rattacher_enfant', {
      p_prenom: p, p_nom: n, p_naissance: birthday,
    });
    if (error) {
      const brut = error.message ?? '';
      return {
        ok: false,
        erreur: /function|does not exist|schema cache/i.test(brut)
          ? 'La maison doit d’abord activer le rattachement (migration 0044) — réessayez ensuite.'
          : brut || 'Rattachement impossible — réessayez.',
      };
    }
    const r = data as { statut: string; enfantId?: string; familyId?: string; nom?: string };
    if (r.statut === 'attente') return { ok: true, enAttente: true };
    const familyId = r.familyId!;
    if (!familiesStore.get().some((f) => f.id === familyId)) {
      const patronyme = parent.name.trim().split(/\s+/).slice(-1)[0] || parent.name.trim();
      familiesStore.set((prev) => [
        ...prev,
        { id: familyId, branchId: parent.branchId, name: `Famille ${patronyme}`, payerClientId: parent.id },
      ]);
    }
    if (parent.familyId !== familyId) {
      clientsStore.set((prev) => prev.map((c) => (c.id === parent.id ? { ...c, familyId } : c)));
    }
    if (r.enfantId && !clientsStore.get().some((c) => c.id === r.enfantId)) {
      clientsStore.set((prev) => [
        ...prev,
        {
          id: r.enfantId!,
          branchId: parent.branchId,
          name: r.nom ?? nomComplet,
          phone: '',
          city: parent.city ?? '',
          persona: parent.persona,
          since: aujourdhui,
          birthday,
          familyId,
          segments: ['Enfant'],
          priceCoef: parent.priceCoef ?? 1,
          loyaltyPoints: 0,
        } as Client,
      ]);
    }
    return { ok: true };
  }

  /* SANS BACKEND (mode local) : le même geste, en local. */
  const dejaLa = clientsStore.get().some((c) => !c.archived && c.branchId === parent.branchId
    && c.name.trim().replace(/\s+/g, ' ').toLowerCase() === nomComplet.toLowerCase()
    && (c.birthday ?? '') === birthday);
  if (dejaLa) {
    const r = declarerEnfant(parent, p, n, birthday, aujourdhui);
    return r.ok ? { ok: true, enAttente: true } : r;
  }
  const familyId = assureFamilleDuParent(parent);
  const enfantId = `enf-${uid()}`;
  clientsStore.set((prev) => [
    ...prev,
    {
      id: enfantId,
      branchId: parent.branchId,
      name: nomComplet,
      phone: '',
      city: parent.city ?? '',
      persona: parent.persona,
      since: aujourdhui,
      birthday,
      familyId,
      segments: ['Enfant'],
      priceCoef: parent.priceCoef ?? 1,
      loyaltyPoints: 0,
    } as Client,
  ]);
  enfantsDeclaresStore.set((prev) => [
    ...prev,
    {
      id: `dec-${uid()}`,
      branchId: parent.branchId,
      clientId: parent.id,
      prenom: p,
      nom: n,
      birthday,
      declareLe: aujourdhui,
      statut: 'accepté',
      clientCreeId: enfantId,
      traiteLe: aujourdhui,
    },
  ]);
  return { ok: true };
}

/** LA MAISON VALIDE — et c'est seulement ici qu'une fiche naît.

    Elle crée la tête, ouvre le compte famille s'il n'existe pas encore, et
    désigne le parent comme payeur.

    LE NOM NE SE DÉDUIT PAS DU PARENT. Il venait autrefois du patronyme de la
    déclarante : un enfant déclaré « Éli » par Awa A. devenait
    « Éli Adé ». C'est faux deux fois — l'enfant porte le nom de son
    père, et la maman est souvent inscrite sous son nom de jeune fille. Le carnet
    le disait déjà : Christelle V. porte Enora H., Jocelyne S. porte Anasthasia Y.. Le nom est donc demandé au parent, et le
    comptoir peut le corriger ici — `nomComplet` est ce qu'il a sous les yeux au
    moment de valider. */
export function validerEnfant(dec: EnfantDeclare, aujourdhui: string, nomComplet?: string): { ok: boolean; erreur?: string } {
  if (dec.statut !== 'en attente') return { ok: false, erreur: 'Cette demande est déjà traitée.' };
  const parent = clientsStore.get().find((c) => c.id === dec.clientId);
  if (!parent) return { ok: false, erreur: 'La fiche du parent est introuvable.' };
  const nom = (nomComplet ?? nomPropose(dec)).trim().replace(/\s+/g, ' ');
  if (!nom) return { ok: false, erreur: 'Il faut un nom pour ouvrir sa fiche.' };
  /* LA MÊME TÊTE NE S'OUVRE PAS DEUX FOIS (Kaitlyn, 12 août : deux validations
     ont ouvert deux fiches jumelles d'une enfant qui en avait déjà une). Même
     nom, même naissance, même branche = c'est elle. On refuse en le disant —
     le comptoir rattache la fiche EXISTANTE au compte famille depuis
     Finances › Comptes, il ne la double pas. */
  const nomBas = nom.toLowerCase();
  const dejaLa = clientsStore.get().find((c) => !c.archived && c.branchId === dec.branchId
    && c.name.trim().replace(/\s+/g, ' ').toLowerCase() === nomBas
    && (c.birthday ?? '') === dec.birthday);
  if (dejaLa) {
    return {
      ok: false,
      erreur: `${nom} est déjà au carnet (même nom, même naissance). Rattachez sa fiche existante au compte famille (Finances › Comptes), puis refusez cette demande avec un mot.`,
    };
  }

  /* Le compte famille : le même juge que le rattachement direct. */
  const familyId = assureFamilleDuParent(parent);

  const enfantId = `enf-${uid()}`;
  clientsStore.set((prev) => [
    ...prev,
    {
      id: enfantId,
      branchId: dec.branchId,
      name: nom,
      phone: '',
      city: parent.city ?? '',
      /* NI COMPTE NI ADRESSE : un mineur n'en a pas, et lui en inventer une
         ouvrirait un chemin de connexion à son nom. */
      persona: parent.persona,
      since: aujourdhui,
      birthday: dec.birthday,
      familyId,
      segments: ['Enfant'],
      priceCoef: parent.priceCoef ?? 1,
      loyaltyPoints: 0,
    } as Client,
  ]);

  enfantsDeclaresStore.set((prev) => prev.map((e) => (e.id === dec.id
    ? { ...e, statut: 'accepté', clientCreeId: enfantId, traiteLe: aujourdhui }
    : e)));
  return { ok: true };
}

/** La Maison refuse — avec son mot, jamais en silence. */
export function refuserEnfant(dec: EnfantDeclare, motif: string, aujourdhui: string): void {
  enfantsDeclaresStore.set((prev) => prev.map((e) => (e.id === dec.id
    ? { ...e, statut: 'refusé', motif: motif.trim() || undefined, traiteLe: aujourdhui }
    : e)));
}

import { bindCollection } from './sync';
bindCollection(enfantsDeclaresStore, 'enfants_declares');
