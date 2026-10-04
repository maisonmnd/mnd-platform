/* LE STOCKAGE DU TÉLÉPHONE, QUI SURVIT À LA FERMETURE — pour le harnais de la
   file d'attente (4 octobre 2026). Chaque « séance » est un processus : le
   `localStorage` se relit d'un fichier au départ et s'y réécrit à chaque
   changement, comme le stockage d'un navigateur survit à l'application fermée.
   À importer AVANT la synchronisation. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const dossier = process.env.FAUX_ETAT;
const fichier = dossier ? `${dossier}/stockage.json` : null;
const m = new Map<string, string>(fichier && existsSync(fichier) ? Object.entries(JSON.parse(readFileSync(fichier, 'utf8')) as Record<string, string>) : []);
const sauve = () => { if (fichier) writeFileSync(fichier, JSON.stringify(Object.fromEntries(m))); };
const g = globalThis as Record<string, unknown>;
g.localStorage = {
  getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
  setItem: (k: string, v: string) => { m.set(k, String(v)); sauve(); },
  removeItem: (k: string) => { m.delete(k); sauve(); },
  key: (i: number) => [...m.keys()][i] ?? null,
  get length() { return m.size; },
  clear: () => { m.clear(); sauve(); },
};
const ecoutes = new Map<string, Set<(e: unknown) => void>>();
g.window = {
  addEventListener: (t: string, f: (e: unknown) => void) => { if (!ecoutes.has(t)) ecoutes.set(t, new Set()); ecoutes.get(t)!.add(f); },
  removeEventListener: (t: string, f: (e: unknown) => void) => { ecoutes.get(t)?.delete(f); },
  dispatchEvent: (e: { type: string }) => { ecoutes.get(e.type)?.forEach((f) => f(e)); return true; },
  location: { href: 'http://localhost/trone/', origin: 'http://localhost', pathname: '/trone/' },
};
g.document = { body: { dataset: { surface: 'trone' } }, addEventListener() {}, removeEventListener() {}, hidden: false };
g.CustomEvent = class { type: string; detail: unknown; constructor(t: string, o?: { detail?: unknown }) { this.type = t; this.detail = o?.detail; } };
/** Le réseau revient pendant la séance : l'évènement que le navigateur émet. */
export const leReseauRevient = (): void => { (g.window as { dispatchEvent: (e: { type: string }) => void }).dispatchEvent({ type: 'online' }); };
