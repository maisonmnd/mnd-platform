import { createStore, useStore, uid } from './store';
import { clientsStore, familiesStore, type Client } from './clients';
import { estMineur } from './accounts';

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
  nom?: string;
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

/** Le parent dépose sa demande. AUCUNE FICHE N'EST CRÉÉE ICI. */
export function declarerEnfant(parent: Client, prenom: string, nom: string, birthday: string, aujourdhui: string): { ok: boolean; erreur?: string } {
  const p = prenom.trim();
  if (!p) return { ok: false, erreur: 'Il manque son prénom.' };
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
      && e.prenom.trim().toLowerCase() === p.toLowerCase() && e.birthday === birthday,
  );
  if (deja) return { ok: false, erreur: 'Cette demande est déjà en attente.' };

  enfantsDeclaresStore.set((prev) => [
    ...prev,
    {
      id: `dec-${uid()}`,
      branchId: parent.branchId,
      clientId: parent.id,
      prenom: p,
      nom: nom.trim() || undefined,
      birthday,
      declareLe: aujourdhui,
      statut: 'en attente',
    },
  ]);
  return { ok: true };
}

/** LA MAISON VALIDE — et c'est seulement ici qu'une fiche naît.

    Elle crée la tête, ouvre le compte famille s'il n'existe pas encore, et
    désigne le parent comme payeur. Le nom de famille du parent sert de repli :
    un enfant déclaré « Mahoussi » devient « Mahoussi Adamon ». */
export function validerEnfant(dec: EnfantDeclare, aujourdhui: string): { ok: boolean; erreur?: string } {
  if (dec.statut !== 'en attente') return { ok: false, erreur: 'Cette demande est déjà traitée.' };
  const parent = clientsStore.get().find((c) => c.id === dec.clientId);
  if (!parent) return { ok: false, erreur: 'La fiche du parent est introuvable.' };

  /* Le compte famille : celui du parent s'il en a un, sinon on l'ouvre — et le
     parent en devient le payeur, ce qui est déjà la vérité du comptoir. */
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
    /* Une famille sans payeur ne porte personne : le parent qui déclare l'est. */
    familiesStore.set((prev) => prev.map((f) => (f.id === existante.id ? { ...f, payerClientId: parent.id } : f)));
  }

  const patronyme = parent.name.trim().split(/\s+/).slice(-1)[0] ?? '';
  const nomComplet = [dec.prenom.trim(), (dec.nom ?? patronyme).trim()].filter(Boolean).join(' ');
  const enfantId = `enf-${uid()}`;
  clientsStore.set((prev) => [
    ...prev,
    {
      id: enfantId,
      branchId: dec.branchId,
      name: nomComplet,
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
