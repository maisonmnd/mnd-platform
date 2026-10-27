/* ══ LE PASSAGE DU MATIN DE L'ASSISTANT MAISON — 27 octobre 2026 ═════════
   Maquette v4, lot 2 : « une fonction serveur, chaque matin, sans qu'un
   Trône soit ouvert ». Ce module dit ce que le passage DÉPOSE dans la salle
   d'attente des envois ; le facteur (`envois-partent`) le porte à son heure,
   jamais pendant les heures calmes.

     · Ma Couronne : une notification, au compte où elle est abonnée.
     · WhatsApp : le modèle part seul s'il est APPROUVÉ chez Meta
       (`mnd_gerard.approuves`) ; sinon il attend un toucher au Trône.
     · La remise à son nom n'est jamais fabriquée au dépôt : la ligne porte
       `codeAFaire`, et la remise naît quand le facteur a dit « envoyé »
       (`remisesAFabriquer`). Une ligne retenue, périmée ou sans abonnement
       ne coûte rien.

   DEUX PORTES, UN PASSAGE. La fonction serveur l'appelle chaque matin ; le
   Trône ne l'appelle plus que si la fonction s'est tue depuis plus de 26
   heures (pas encore collée, ou en panne) : `serveurVivant`. Les deux
   écrivent des lignes à identifiant du jour (`idDeLaLigne`), et seulement
   si elles n'existent pas encore : un second passage ne double rien et ne
   remet jamais « en attente » une ligne déjà partie. */
import { heureDeDepart, type ReglesDeLaSalle } from './salle-des-envois';
import { prenomSeul } from './civilite';
import { numeroWa } from './numero-wa-pur';
import { ligneDeNotification, ligneWhatsApp, partSeulSurWhatsApp, reglagesLus, type CodeAFaire, type LigneDeGerard, type Situation } from './gerard-pur';
import type { CerveauDeGerard } from './assistant-lecture-pur';

/** Le document où la fonction serveur dit qu'elle vit, et quand elle est passée. */
export const CLE_DU_SERVEUR = 'mnd_assistant_serveur';
export type EtatDuServeur = { vuLe?: string; passageLe?: string; version?: string; deposees?: number; remises?: number };
/** Au-delà, la fonction est tenue pour absente : le Trône reprend le passage. */
export const SERVEUR_TU_APRES_H = 26;
export const serveurVivant = (etat: EtatDuServeur | null | undefined, maintenantMs: number): boolean => {
  const t = Date.parse(etat?.vuLe ?? '');
  return Number.isFinite(t) && maintenantMs - t < SERVEUR_TU_APRES_H * 3_600_000;
};

/** LES LIGNES DU PASSAGE : une par situation qui peut partir seule. */
export function lignesDuPassage(o: {
  cerveau: CerveauDeGerard;
  plan: readonly Situation[];
  reglagesGerard: unknown;
  maintenantMs: number;
  branchId: string;
  regles: ReglesDeLaSalle;
}): LigneDeGerard[] {
  const r = reglagesLus(o.reglagesGerard as Parameters<typeof reglagesLus>[0]);
  if (r.mode === 'eteint') return [];
  const aujourdhui = o.cerveau.ctx.aujourdhui;
  const maintenantIso = new Date(o.maintenantMs).toISOString();
  const { partA, calme } = heureDeDepart(o.maintenantMs, o.regles);
  const depart = { partA: new Date(partA).toISOString(), calme };
  const lignes: LigneDeGerard[] = [];
  for (const s of o.plan) {
    const c = o.cerveau.clientDe(s.clientId);
    const outils = {
      branchId: o.branchId, aujourdhui, maintenantIso, prenom: prenomSeul(c?.name),
      rdv: s.genre === 'garder' ? o.cerveau.rdvAGarder(s.clientId) : undefined,
    };
    if (s.canal === 'couronne') {
      lignes.push(ligneDeNotification(s, { ...outils, compte: o.cerveau.compteDe(s.clientId), ...depart }));
    } else if (s.canal === 'whatsapp' && partSeulSurWhatsApp(r, s.modele)) {
      const numero = numeroWa(c?.phone);
      if (numero) lignes.push(ligneWhatsApp(s, { ...outils, numero, ...depart }));
    }
    /* Sinon : un modèle pas encore approuvé chez Meta attend un toucher au Trône. */
  }
  return lignes;
}

/** Les lignes déjà au journal ne se réécrivent jamais : seules les neuves passent. */
export const lignesNeuves = <L extends { id: string }>(lignes: readonly L[], existantes: ReadonlySet<string>): L[] =>
  lignes.filter((l) => !existantes.has(l.id));

/** LES REMISES À FABRIQUER : une ligne de l'Assistant PARTIE (le facteur a
    dit « envoyé ») qui porte une remise à faire et pas encore de code. */
export type LigneAuCode = { id: string; clientId: string; genre: Situation['genre']; codeAFaire: CodeAFaire; branchId: string };
export function remisesAFabriquer(envois: readonly unknown[]): LigneAuCode[] {
  const out: LigneAuCode[] = [];
  for (const brut of envois) {
    const e = brut as { id?: string; type?: string; statut?: string; clientId?: string; genre?: string; codeAFaire?: CodeAFaire; codePromo?: string; branchId?: string };
    if (e.type !== 'gerard' || e.statut !== 'envoyé' || !e.codeAFaire || e.codePromo || !e.id || !e.clientId) continue;
    if (e.codeAFaire.mot !== 'CREUX' && e.codeAFaire.mot !== 'ANNIV') continue;
    out.push({ id: e.id, clientId: e.clientId, genre: (e.genre ?? 'creux') as Situation['genre'], codeAFaire: e.codeAFaire, branchId: e.branchId ?? '' });
  }
  return out;
}
