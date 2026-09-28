import { createStore, useStore } from './store';
import { bindDocument } from './sync';
import type { Demande } from './demandes';
import type { Client } from './clients';
import { FORME_DU_CODE, codeDeMarraine, prenomDuNom, type EtatDeLaFilleule, type ResumeParrainage, type SoinOffert } from './parrainage-pur';

/* LE PARRAINAGE — 28 septembre 2026, maquette « La communauté MND » validée
   (« construis avec les patterns réels de la marque », Yéman).

   UNE MARRAINE est une demande du site, genre `prospect`, profil
   « Marraine », qui porte `codeParrain` : c'est la fonction Edge
   `demande-submit` qui l'écrit, jamais le navigateur (mode `parrainage`).
   UNE FILLEULE est une réservation du site dont le code a été reconnu comme
   un code de marraine (`codeRaison: 'parrainage'`, `parrainDe`) : nouvelle
   cliente seulement, jamais la marraine elle-même.

   Ce fichier ne décide rien que la fonction ne décide déjà : il range, pour
   l'écran Parrainages, ce que la base contient. La FORME du code est le seul
   contrat entre les deux rives ; `verifie-le-parrainage` l'éprouve des deux
   côtés. */

export { FORME_DU_CODE, SIGNES_DU_CODE, racineDuCode, codeDeMarraine, lienDuParrainage, soinsEnAttente, prenomDuNom, MODELES_DE_CARTE } from './parrainage-pur';
export type { SoinOffert, ModeleDeCarte, ResumeParrainage } from './parrainage-pur';

/* ── LES CADEAUX, ÉCRITS PAR LA MAISON ─────────────────────────────────
   Des phrases, pas des montants : « un lavage offert », « 10 % sur la
   première visite ». La fonction les lit (clef de service) et les rend à la
   page quand le code est créé ; le site n'en invente aucun. */
export type ReglageParrainage = {
  actif: boolean;
  cadeauFilleule: string;
  cadeauMarraine: string;
  /** LE SOIN DE LA MARRAINE, pris au catalogue (28 septembre 2026) : la
      caisse passe cette prestation à 100 % quand elle le consomme. Sans lui,
      le soin se pose quand même, et la caisse l'offre sur la ligne choisie. */
  soinMarraineServiceId?: string;
  /** Le remerciement part tout seul sur WhatsApp (modèle `parrainage_merci`)
      dès que Meta l'a approuvé. Éteint par défaut. */
  merciParWhatsApp?: boolean;
};

export const REGLAGE_PARRAINAGE_DEFAUT: ReglageParrainage = {
  actif: true,
  cadeauFilleule: '',
  cadeauMarraine: '',
};

export const parrainageStore = createStore<ReglageParrainage>('mnd_parrainage', REGLAGE_PARRAINAGE_DEFAUT);
export const useParrainage = () => useStore(parrainageStore);
bindDocument(parrainageStore, 'mnd_parrainage');

/* ── CE QUE L'ÉCRAN MONTRE ─────────────────────────────────────────── */

/** Ce que la base porte en plus sur une demande, pour le parrainage. */
export type DemandeParrainee = Demande & {
  codeParrain?: string;
  code?: string;
  codeRaison?: string;
  parrainDe?: string;
  marraineId?: string;
  marraineClientId?: string;
  /** Posé au Trône : le cadeau de la marraine lui a été remis (ou son soin posé). */
  cadeauMarraineRemisLe?: string;
  /** Le remerciement WhatsApp est parti (ou a été tenté) : jamais deux fois. */
  merciEnvoyeLe?: string;
};

export type EtatDeLaVisite = EtatDeLaFilleule;

export type Filleule = {
  demande: DemandeParrainee;
  visite: EtatDeLaVisite;
  dateRdv?: string;
};

/** Une marraine : une FICHE du Trône (toute cliente a sa carte), ou une
    personne qui a demandé son code sur le site sans être encore cliente. */
export type Marraine = {
  id: string;
  prenom: string;
  telephone: string;
  depuis: string;
  code: string;
  clientId?: string;
  demande?: DemandeParrainee;
  filleules: Filleule[];
};

type RdvLu = { id: string; status: string; date: string };
export type FicheLue = Pick<Client, 'id' | 'name' | 'phone' | 'since'> & Partial<Pick<Client, 'codeParrain' | 'archived' | 'soinsOfferts' | 'parrainage' | 'phone2'>>;

export function etatDeLaVisite(d: DemandeParrainee, rdvs: readonly RdvLu[]): { visite: EtatDeLaVisite; dateRdv?: string } {
  const r = d.apptId ? rdvs.find((x) => x.id === d.apptId) : undefined;
  if (!r) return { visite: 'sans-rdv' };
  if (r.status === 'honoré') return { visite: 'venue', dateRdv: r.date };
  if (r.status === 'annulé') return { visite: 'annulee', dateRdv: r.date };
  return { visite: 'a-venir', dateRdv: r.date };
}

const filleulesDe = (code: string, demandes: readonly DemandeParrainee[], rdvs: readonly RdvLu[]): Filleule[] =>
  demandes
    .filter((f) => f && f.codeRaison === 'parrainage' && f.parrainDe === code)
    .map((f) => ({ demande: f, ...etatDeLaVisite(f, rdvs) }))
    .sort((a, b) => b.demande.createdAt.localeCompare(a.demande.createdAt));

/** Les marraines, chacune avec ses filleules, les plus récentes d'abord.
    Une fiche n'y paraît que si son code a servi ; une marraine du site y
    paraît toujours (elle a demandé son code). Une fiche et une demande qui
    portent le même code sont UNE marraine : la fiche l'emporte. */
export function marrainesEtFilleules(
  demandes: readonly DemandeParrainee[], rdvs: readonly RdvLu[], clients: readonly FicheLue[] = [],
): Marraine[] {
  const parCode = new Map<string, Marraine>();
  for (const d of demandes) {
    if (!d || !d.codeParrain || !FORME_DU_CODE.test(d.codeParrain)) continue;
    parCode.set(d.codeParrain, {
      id: d.id, prenom: d.prenom, telephone: d.telephone, depuis: d.createdAt, code: d.codeParrain,
      demande: d, filleules: filleulesDe(d.codeParrain, demandes, rdvs),
    });
  }
  for (const c of clients) {
    if (!c || c.archived || !c.codeParrain || !FORME_DU_CODE.test(c.codeParrain)) continue;
    const filleules = filleulesDe(c.codeParrain, demandes, rdvs);
    const deja = parCode.get(c.codeParrain);
    if (!filleules.length && !deja) continue;
    parCode.set(c.codeParrain, {
      id: c.id, prenom: prenomDuNom(c.name), telephone: c.phone, depuis: deja?.depuis ?? c.since,
      code: c.codeParrain, clientId: c.id, demande: deja?.demande, filleules,
    });
  }
  return [...parCode.values()].sort((a, b) => b.depuis.localeCompare(a.depuis));
}

/** Le cadeau de la marraine est dû dès qu'UNE filleule est venue et qu'il
    n'a pas été remis pour elle. */
export const cadeauDu = (f: Filleule): boolean => f.visite === 'venue' && !f.demande.cadeauMarraineRemisLe;

export const VISITE_DITE: Record<EtatDeLaVisite, string> = {
  'sans-rdv': 'pas encore de rendez-vous',
  'a-venir': 'rendez-vous à venir',
  venue: 'venue',
  annulee: 'rendez-vous annulé',
};

/* ══ LA CARTE DE CHAQUE CLIENTE — 28 septembre 2026 ═════════════════════
   Trois juges PURS, que le Trône applique en tâche de fond
   (`useParrainageVivant`) et que `verifie-le-parrainage` éprouve. */

/** Les huit derniers chiffres d'un numéro : la même règle que la fonction. */
export const huitDerniers = (t: string | undefined): string => String(t ?? '').replace(/\D/g, '').slice(-8);

/** Un hasard DÉTERMINISTE, tiré de l'identifiant de la fiche : deux postes
    du Trône qui attribuent en même temps écrivent le MÊME code. */
function graine(texte: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < texte.length; i++) h = Math.imul(h ^ texte.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** LES CODES À POSER : chaque fiche vivante qui n'en a pas. Une cliente qui a
    déjà demandé son code sur le site (même numéro) GARDE ce code-là : il a
    peut-être déjà été partagé. Sinon, un code tiré de son prénom, unique
    parmi les fiches ET les marraines du site. */
export function codesAAttribuer(clients: readonly FicheLue[], demandes: readonly DemandeParrainee[]): { clientId: string; code: string }[] {
  const desFiches = new Set(clients.map((c) => c?.codeParrain).filter(Boolean) as string[]);
  const duSite = new Map<string, string>();
  for (const d of demandes) {
    if (d?.codeParrain && FORME_DU_CODE.test(d.codeParrain) && huitDerniers(d.telephone).length === 8) duSite.set(huitDerniers(d.telephone), d.codeParrain);
  }
  const pris = new Set<string>([...desFiches, ...duSite.values()]);
  const sortie: { clientId: string; code: string }[] = [];
  const aPoser = clients.filter((c) => c && !c.archived && !c.codeParrain).sort((a, b) => a.id.localeCompare(b.id));
  for (const c of aPoser) {
    const adopte = duSite.get(huitDerniers(c.phone));
    if (adopte && !desFiches.has(adopte)) {
      desFiches.add(adopte);
      sortie.push({ clientId: c.id, code: adopte });
      continue;
    }
    for (let essai = 0; essai < 40; essai++) {
      const code = codeDeMarraine(prenomDuNom(c.name), graine(`${c.id}:${essai}`));
      if (!pris.has(code)) {
        pris.add(code);
        desFiches.add(code);
        sortie.push({ clientId: c.id, code });
        break;
      }
    }
  }
  return sortie;
}

/** CE QUE LA CLIENTE VOIT DE SES FILLEULES : un prénom, un état, une date. */
export function resumeDuParrainage(code: string, demandes: readonly DemandeParrainee[], rdvs: readonly RdvLu[]): ResumeParrainage {
  return {
    filleules: filleulesDe(code, demandes, rdvs).map((f) => ({
      prenom: prenomDuNom(f.demande.prenom) || 'Une amie',
      etat: f.visite,
      ...(f.dateRdv ? { date: f.dateRdv } : {}),
    })),
  };
}

export const idDuSoin = (demandeId: string): string => `parr-${demandeId}`;

export type GesteDuParrainage = {
  clientId: string;
  demandeId: string;
  /** Le soin à poser, s'il n'est pas déjà sur la fiche. */
  soin?: SoinOffert;
  /** Le remerciement WhatsApp reste à envoyer. */
  merci: boolean;
  prenomMarraine: string;
  prenomFilleule: string;
  libelle: string;
  telephone: string;
};

/** LES SOINS À POSER : une amie venue (visite HONORÉE) dont la marraine est
    une fiche. Un soin par amie, jamais deux (son identifiant vient de la
    demande de l'amie) ; une demande déjà marquée ne rend plus rien. */
export function soinsAPoser(
  clients: readonly FicheLue[], demandes: readonly DemandeParrainee[], rdvs: readonly RdvLu[],
  reglage: Pick<ReglageParrainage, 'cadeauMarraine' | 'soinMarraineServiceId'>, aujourdhui: string,
  nomDuService: (id: string) => string | undefined = () => undefined,
): GesteDuParrainage[] {
  const gestes: GesteDuParrainage[] = [];
  const libelle = (reglage.soinMarraineServiceId && nomDuService(reglage.soinMarraineServiceId))
    || reglage.cadeauMarraine.trim() || 'Un soin offert';
  for (const c of clients) {
    if (!c || c.archived || !c.codeParrain) continue;
    for (const f of filleulesDe(c.codeParrain, demandes, rdvs)) {
      if (f.visite !== 'venue' || f.demande.cadeauMarraineRemisLe) continue;
      const id = idDuSoin(f.demande.id);
      const dejaPose = (c.soinsOfferts ?? []).some((s) => s.id === id);
      const prenomFilleule = prenomDuNom(f.demande.prenom) || 'votre amie';
      gestes.push({
        clientId: c.id, demandeId: f.demande.id,
        ...(dejaPose ? {} : {
          soin: {
            id, libelle, raison: `Pour la venue de ${prenomFilleule}`, poseLe: aujourdhui,
            ...(reglage.soinMarraineServiceId ? { serviceId: reglage.soinMarraineServiceId } : {}),
          },
        }),
        merci: !f.demande.merciEnvoyeLe,
        prenomMarraine: prenomDuNom(c.name), prenomFilleule, libelle, telephone: c.phone,
      });
    }
  }
  return gestes;
}

/** LE SOIN CONSOMMÉ À LA CAISSE : daté, avec la pièce. Un soin déjà utilisé
    ne se rouvre pas. */
export function soinUtilise(soins: readonly SoinOffert[] | undefined, id: string, piece: string, quand: string): SoinOffert[] {
  return (soins ?? []).map((s) => (s.id === id && !s.utiliseLe ? { ...s, utiliseLe: quand, piece } : s));
}
