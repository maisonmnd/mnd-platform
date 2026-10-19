import { createStore, useStore } from './store';
import { bindDocument } from './sync';
import { demandeAClaude, photoPourClaude } from './ia-maison';
import {
  CHANTIER_CAPTURE, CLE_DES_CAPTURES, MESSAGE_DE_LA_CAPTURE, SCHEMA_DE_LA_CAPTURE, USAGE_CAPTURE, VERROU_MS,
  captureApresLecture, consigneDeLaCapture, imagesALire, lectureDeLaCapture, rapprochement, verrouTient,
  type CaptureLue, type Captures, type Dette, type LectureDeLaCapture, type MessageImage,
} from './ia-capture-pur';

/* ══ LES CAPTURES LUES, CÔTÉ TRÔNE — 19 octobre 2026 (chantier `capture`) ═══
   Les règles vivent dans `ia-capture-pur` ; ici le document synchronisé
   (`mnd_ia_captures`, par identifiant de message), l'appel à Claude par la
   porte commune `demandeAClaude`, et les trois gestes du comptoir :
   corriger les cases, inscrire, écarter.

   LE TRÔNE LIT SEUL, N'INSCRIT JAMAIS SEUL. Un passage de lecture pose un
   verrou doux sur chaque image (trois minutes), appelle Claude une image à
   la fois, et range la lecture « à vérifier ». L'argent ne s'inscrit que par
   le bouton « Inscrire au Carnet », qui emprunte l'écran d'encaissement du
   Carnet tel qu'il est. */

export const capturesStore = createStore<Captures>(CLE_DES_CAPTURES, {});
bindDocument(capturesStore, CLE_DES_CAPTURES);
export const useCapturesLues = () => useStore(capturesStore);

const maintenant = () => new Date().toISOString();
const aujourdhuiLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const pose = (id: string, patch: Partial<CaptureLue>): void =>
  capturesStore.set((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], ...patch } } : prev));

/** La main corrige une case : la lecture change, le rapprochement se refait,
    la lecture brute de Claude reste à côté. */
export function corrigeLaCapture(id: string, lecture: LectureDeLaCapture, dettes: readonly Dette[]): void {
  pose(id, {
    lecture,
    ...(lecture.estUnPaiement ? { rapprochement: rapprochement(lecture.montantXof, dettes) } : {}),
  });
}

/** « Inscrire au Carnet » a abouti : l'écran d'encaissement a écrit le versement. */
export function marqueInscrite(id: string, apptId: string): void {
  pose(id, { statut: 'inscrite', inscriteLe: maintenant(), apptId });
}

/** « Ce n'est pas un paiement » : écartée, par la main. */
export function ecarteLaCapture(id: string): void {
  pose(id, { statut: 'ecartee', motif: 'main', ecarteeLe: maintenant() });
}

/** Une capture écartée qui l'était à tort revient à vérifier (sa lecture
    tient encore). */
export function reprendsLaCapture(id: string, dettes: readonly Dette[]): void {
  const c = capturesStore.get()[id];
  if (!c?.lecture?.estUnPaiement) return;
  pose(id, { statut: 'a-verifier', motif: undefined, ecarteeLe: undefined, rapprochement: rapprochement(c.lecture.montantXof, dettes) });
}

/* ── LE PASSAGE DE LECTURE ─────────────────────────────────────────────
   Un seul à la fois par Trône ; après un refus de budget, de version ou
   d'équipe, on se tait une heure (la raison ne changera pas dans la minute). */
let passageEnCours = false;
let silenceJusqua = 0;
const SILENCE_MS = 60 * 60_000;

export type ResultatDuPassage = { lues: number; refus?: string };

export async function litLesCaptures(o: {
  messages: readonly MessageImage[];
  clientIdDuNumero: (numero: string) => string | undefined;
  dettesDe: (clientId: string) => Dette[];
  maintenant?: number;
}): Promise<ResultatDuPassage> {
  const t = o.maintenant ?? Date.now();
  if (passageEnCours || t < silenceJusqua) return { lues: 0 };
  passageEnCours = true;
  try {
    const dettesParCliente = new Map<string, Dette[]>();
    const dettes = (clientId: string) => {
      let d = dettesParCliente.get(clientId);
      if (!d) { d = o.dettesDe(clientId); dettesParCliente.set(clientId, d); }
      return d;
    };
    const aLire = imagesALire({
      messages: o.messages, captures: capturesStore.get(), clientIdDuNumero: o.clientIdDuNumero,
      doitDeLArgent: (id) => dettes(id).some((d) => !d.aVenir && d.resteXof > 0), maintenant: t,
    });
    let lues = 0;
    for (const m of aLire) {
      /* Le verrou se pose AVANT l'appel, et se relit juste avant : un autre
         Trône a pu le poser pendant qu'on lisait l'image d'avant. */
      const deja = capturesStore.get()[m.id];
      if (deja && (deja.statut !== 'en-cours' || verrouTient(deja, Date.now()))) continue;
      const ouverte: CaptureLue = { id: m.id, numero: m.numero, clientId: m.clientId, statut: 'en-cours', enCours: maintenant() };
      capturesStore.set((prev) => ({ ...prev, [m.id]: ouverte }));
      const lesDettes = dettes(m.clientId);
      const r = await demandeAClaude<unknown>({
        chantier: CHANTIER_CAPTURE, usage: USAGE_CAPTURE,
        systeme: consigneDeLaCapture({ dettes: lesDettes, aujourdhui: aujourdhuiLocal() }),
        messages: [{ role: 'user', content: MESSAGE_DE_LA_CAPTURE }],
        images: [{ coffre: m.piece!.coffre!, chemin: m.piece!.chemin! }],
        schema: SCHEMA_DE_LA_CAPTURE, maxTokens: 400,
      });
      if (!r.ok) {
        /* Une panne de réseau rend l'image à lire plus tard (le verrou
           s'efface) ; un refus de la fonction la range comme non lue, et
           le passage s'arrête. */
        if (r.erreur === 'reseau' || r.erreur === 'hors-ligne') {
          capturesStore.set((prev) => { const { [m.id]: _o, ...reste } = prev; return reste; });
          return { lues, refus: r.message };
        }
        capturesStore.set((prev) => ({ ...prev, [m.id]: { ...ouverte, enCours: undefined, statut: 'ecartee', motif: 'claude', detail: r.message, ecarteeLe: maintenant() } }));
        if (r.erreur === 'budget' || r.erreur === 'version' || r.erreur === 'equipe') silenceJusqua = Date.now() + SILENCE_MS;
        return { lues, refus: r.message };
      }
      const apres = captureApresLecture(ouverte, r.data, { dettes: lesDettes, aujourdhui: aujourdhuiLocal(), maintenant: maintenant(), coutUsd: r.coutUsd });
      capturesStore.set((prev) => ({ ...prev, [m.id]: apres }));
      lues += 1;
    }
    return { lues };
  } finally {
    passageEnCours = false;
  }
}

/** Le verrou d'une capture, lu par les écrans : « Claude lit… » tant qu'il tient. */
export const enLecture = (c: CaptureLue | undefined): boolean => verrouTient(c, Date.now());
export { VERROU_MS };

/* ── UNE CAPTURE DÉPOSÉE À LA MAIN (« Encaisser ») ─────────────────────
   Le même Claude, la même consigne, la même lecture ; l'image vient du
   poste, réduite avant de partir. Rien ne s'écrit : la lecture revient à
   l'écran qui l'a demandée, qui remplit ses cases. */
export async function lisUneCaptureDeposee(fichier: Blob, dettes: readonly Dette[]): Promise<
  | { ok: true; lecture: LectureDeLaCapture }
  | { ok: false; message: string }
> {
  let image: { base64: string; mime: string };
  try { image = await photoPourClaude(fichier); } catch { return { ok: false, message: 'Cette image ne se lit pas sur ce poste.' }; }
  const r = await demandeAClaude<unknown>({
    chantier: CHANTIER_CAPTURE, usage: USAGE_CAPTURE,
    systeme: consigneDeLaCapture({ dettes, aujourdhui: aujourdhuiLocal() }),
    messages: [{ role: 'user', content: MESSAGE_DE_LA_CAPTURE }],
    images: [image], schema: SCHEMA_DE_LA_CAPTURE, maxTokens: 400,
  });
  if (!r.ok) return { ok: false, message: r.message };
  const lecture = lectureDeLaCapture(r.data, aujourdhuiLocal());
  if (!lecture) return { ok: false, message: 'Claude n’a pas su lire cette capture : vérifiez l’image, ou saisissez à la main.' };
  return { ok: true, lecture };
}
