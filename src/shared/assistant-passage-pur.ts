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
import { DECALAGE_DU_SALON_H, heureDeDepart, type ReglesDeLaSalle } from './salle-des-envois';
import { prenomSeul } from './civilite';
import { numeroWa } from './numero-wa-pur';
import { ligneDeNotification, ligneWhatsApp, partSeule, reglagesLus, type CodeAFaire, type LigneDeGerard, type Situation } from './gerard-pur';
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

/** LES CARTES D'ANNIVERSAIRE PARTENT À 10 H — 28 octobre 2026, Yéman : « les
    anniversaires doivent partir automatiquement le jour même à 10 h du matin ».
    Le passage dépose dès 8 h ; la carte attend 10 h, heure du salon. Déposée
    après 10 h (un Trône qui reprend le passage, un réveil tardif), elle part
    comme les autres, après sa salle. La carte de rattrapage du lendemain
    attend 10 h, elle aussi. Les heures calmes gardent le dernier mot. */
export const HEURE_DES_CARTES = 10;
export function departDeLaCarte(maintenantMs: number, r: ReglesDeLaSalle): { partA: number; calme: boolean } {
  const local = new Date(maintenantMs + DECALAGE_DU_SALON_H * 3_600_000);
  const dixHeures = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), HEURE_DES_CARTES, 0, 0) - DECALAGE_DU_SALON_H * 3_600_000;
  return heureDeDepart(Math.max(maintenantMs, dixHeures - r.salleMin * 60_000), r);
}

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
  const enIso = (d: { partA: number; calme: boolean }) => ({ partA: new Date(d.partA).toISOString(), calme: d.calme });
  const departCommun = enIso(heureDeDepart(o.maintenantMs, o.regles));
  const departDesCartes = enIso(departDeLaCarte(o.maintenantMs, o.regles));
  const lignes: LigneDeGerard[] = [];
  for (const s of o.plan) {
    const depart = s.genre === 'anniversaire' ? departDesCartes : departCommun;
    const c = o.cerveau.clientDe(s.clientId);
    const outils = {
      branchId: o.branchId, aujourdhui, maintenantIso, prenom: prenomSeul(c?.name),
      rdv: s.genre === 'garder' ? o.cerveau.rdvAGarder(s.clientId) : undefined,
    };
    if (s.canal === 'couronne') {
      /* La carte d'un enfant : au compte du parent payeur (`pourId`). */
      lignes.push(ligneDeNotification(s, { ...outils, compte: o.cerveau.compteDe(s.pourId ?? s.clientId), ...depart }));
    } else if (partSeule(s, r)) {
      const numero = numeroWa(o.cerveau.telDe(s));
      if (numero) lignes.push(ligneWhatsApp(s, { ...outils, numero, ...depart }));
    }
    /* Sinon : un modèle pas encore approuvé chez Meta, ou une relance sans accord, attend un toucher au Trône. */
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
