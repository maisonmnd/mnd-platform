/* LE MESSAGE DU FOYER, 4 novembre 2026.

   « Faith and Jade always come together, they are sisters. Must find a way
   to keep their appointment under one canal. Everything the same. » (Yéman).
   Maquette `maquette-le-parcours-du-foyer.html`, arbitrage 3, validée : UN
   SEUL MESSAGE PAR FOYER, au numéro du foyer, qui nomme toutes les têtes
   (« Jade et Faith sont attendues mardi 22 décembre 2026 à 10 h »). La
   confirmation et le rappel de la veille partaient jusqu'ici une fois par
   tête, au même numéro.

   LE FOYER, ICI : des rendez-vous qui portent le même `foyerId`, le même
   jour, et qu'on prévient au même numéro (sa clé : 229 et huit chiffres,
   écrit avec ou sans le 01). Un foyer de deux numéros fait deux messages ;
   un rendez-vous annulé n'est jamais nommé ; un rendez-vous sans `foyerId`
   reste seul, comme avant. Cette règle se suffit à elle-même : elle ne lit
   pas la case « elles viennent toujours ensemble » du Trône (un autre
   chantier, `foyer-pur.ts`).

   CE QUE PORTE LE MESSAGE. Sa ligne d'envoi est celle du rendez-vous le plus
   tôt du foyer (à la même heure, le plus petit identifiant) : son `apptId`,
   son `clientId`, son heure, son identifiant (`conf-<rdv>-…`,
   `env-<rdv>-…`). La porte d'Opale la juge sur ce rendez-vous-là. Elle porte
   en plus `foyerId`, `apptIds` (chaque rendez-vous nommé) et `clientIds`
   (chaque fiche nommée). Une tête nommée par une ligne qui verrouille est
   COUVERTE : aucune autre ligne ne se dépose pour elle, ni ne passe la
   porte. L'heure dite est celle de la tête la plus tôt : elles viennent
   ensemble.

   LES PRÉNOMS : le premier mot du nom de chaque fiche, jamais le nom de
   famille, sans civilité dès deux têtes (« Jade et Faith », « Jade, Faith et
   Maëlle »). Une fiche seule garde l'appel de sa fiche (« Mme Jade »), comme
   avant. Deux rendez-vous d'une même fiche la nomment une fois.
   Depuis le 7 novembre 2026, tout le prénom composé (« Anne Marie et
   Jade ») : le bloc s'appuie, PAR SON NOM, sur `prenomDUsage` (le bloc
   ⟨prenom-d-usage⟩ de shared/civilite, recopié dans les mêmes fonctions).

   Ce bloc vit à l'identique dans confirmation-rdv, rappels-j1 et
   envois-partent, qui n'importent rien du dépôt ; le banc des douze lunes
   compare les copies, scripts/verifie-le-message-du-foyer éprouve chaque
   règle dans les deux sens (J. K. et F. K., deux sœurs, un numéro). Module
   PUR : ni Supabase, ni DOM, ni horloge. */
import { prenomDUsage } from './civilite';

/* ⟨message-du-foyer⟩ */
/** Une tête à prévenir : son rendez-vous, et le numéro où on la prévient. */
export type TeteAPrevenir = { id: string; clientId?: string; foyerId?: string; date: string; time?: string; status?: string; numero?: string | null };
/** Un foyer à prévenir : la tête qui porte le message (la plus tôt), puis toutes, dans l'ordre. */
export type FoyerAPrevenir<T extends TeteAPrevenir> = { cle: string; porteur: T; tetes: T[] };

/** Le prénom d'une fiche, jamais le nom de famille. TOUT LE PRÉNOM COMPOSÉ
    (7 novembre 2026) : son prénom d'usage (`usage`), sinon celui que le Trône
    devine du nom (`prenomDUsage`, la copie ⟨prenom-d-usage⟩ des fonctions). */
export const prenomDeLaTete = (nom: unknown, usage?: unknown): string => prenomDUsage({ name: nom, prenomUsage: usage });

/** Les prénoms dits en français : « Jade », « Jade et Faith », « Jade, Faith et Maëlle ». */
export function prenomsDits(prenoms: readonly string[]): string {
  const p = prenoms.map((x) => String(x ?? '').trim()).filter(Boolean);
  if (p.length <= 1) return p[0] ?? '';
  return `${p.slice(0, -1).join(', ')} et ${p[p.length - 1]}`;
}

/** La clé du numéro : 229 et huit chiffres, que Meta et la fiche l'écrivent avec ou sans le 01. */
export const cleDuNumeroDuFoyer = (brut: unknown): string => {
  const d = String(brut ?? '').replace(/\D/g, '');
  const n = !d ? '' : d.startsWith('00229') ? d.slice(2) : d.startsWith('229') ? d : d.length === 10 && d.startsWith('01') ? `229${d}` : d.length === 8 ? `22901${d}` : d;
  return n.length === 13 && n.startsWith('22901') ? `229${n.slice(5)}` : n;
};

const heureDuFoyer = (t?: string): string => (/^\d{1,2}:\d{2}$/.test(t ?? '') ? (t as string).padStart(5, '0') : '23:59');
const plusTot = (a: TeteAPrevenir, b: TeteAPrevenir): number =>
  `${a.date} ${heureDuFoyer(a.time)} ${a.id}`.localeCompare(`${b.date} ${heureDuFoyer(b.time)} ${b.id}`);

/** Le foyer d'une tête : son `foyerId`, son jour, la clé de son numéro. Sans foyer ou sans numéro, elle est seule. */
export const cleDuFoyer = (t: TeteAPrevenir): string => {
  const numero = cleDuNumeroDuFoyer(t.numero);
  return t.foyerId && t.date && numero ? `foyer|${t.foyerId}|${t.date.slice(0, 10)}|${numero}` : `seule|${t.id}`;
};

/** LES FOYERS À PRÉVENIR : un groupe par foyer, par jour et par numéro, jamais un rendez-vous annulé ; la tête la plus tôt porte le message. */
export function foyersAPrevenir<T extends TeteAPrevenir>(tetes: readonly T[]): FoyerAPrevenir<T>[] {
  const groupes = new Map<string, T[]>();
  const vus = new Set<string>();
  for (const t of tetes) {
    if (!t || !t.id || t.status === 'annulé' || vus.has(t.id)) continue;
    vus.add(t.id);
    const cle = cleDuFoyer(t);
    groupes.set(cle, [...(groupes.get(cle) ?? []), t]);
  }
  return [...groupes.entries()]
    .map(([cle, g]) => { const tries = [...g].sort(plusTot); return { cle, porteur: tries[0], tetes: tries }; })
    .sort((a, b) => plusTot(a.porteur, b.porteur));
}

/** Les têtes du foyer, une fois par fiche. */
const unesParFiche = <T extends TeteAPrevenir>(f: FoyerAPrevenir<T>): T[] => {
  const vues = new Set<string>();
  return f.tetes.filter((t) => { const k = t.clientId || t.id; if (vues.has(k)) return false; vues.add(k); return true; });
};

/** L'APPEL DU MESSAGE : une fiche seule garde son appel (sa civilité) ; dès deux fiches, leurs prénoms. */
export function appelDuFoyer<T extends TeteAPrevenir>(f: FoyerAPrevenir<T>, appelSeule: (t: T) => string, prenomDe: (t: T) => string): string {
  const fiches = unesParFiche(f);
  return fiches.length <= 1 ? appelSeule(f.porteur) : prenomsDits(fiches.map(prenomDe));
}

/** Ce que la ligne d'envoi porte en plus pour un foyer de deux rendez-vous ou plus ; rien pour une tête seule. */
export function champsDuFoyer<T extends TeteAPrevenir>(f: FoyerAPrevenir<T>): { foyerId?: string; apptIds?: string[]; clientIds?: string[] } {
  if (f.tetes.length < 2) return {};
  return {
    ...(f.porteur.foyerId ? { foyerId: f.porteur.foyerId } : {}),
    apptIds: f.tetes.map((t) => t.id),
    clientIds: [...new Set(f.tetes.map((t) => t.clientId).filter((c): c is string => !!c))],
  };
}

const listeDuFoyer = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x ?? '')).filter(Boolean) : []);
/** Les rendez-vous qu'une ligne nomme : le sien, et ceux de son foyer. */
export const tetesNommees = (l: { apptId?: unknown; apptIds?: unknown } | null | undefined): string[] =>
  [...new Set([String(l?.apptId ?? ''), ...listeDuFoyer(l?.apptIds)].filter(Boolean))];
/** Les fiches qu'une ligne ou un message du fil nomme : la sienne, et celles de son foyer. */
export const fichesNommees = (l: { clientId?: unknown; clientIds?: unknown } | null | undefined): string[] =>
  [...new Set([String(l?.clientId ?? ''), ...listeDuFoyer(l?.clientIds)].filter(Boolean))];
/** Une ligne nomme-t-elle ce rendez-vous ? Le Trône lit ainsi la tournée de chaque tête. */
export const nommeLeRendezVous = (l: { apptId?: unknown; apptIds?: unknown } | null | undefined, apptId: string): boolean =>
  !!apptId && tetesNommees(l).includes(apptId);

/** LES TÊTES COUVERTES : les rendez-vous que nomme une ligne de ce type et de ce canal qui verrouille. */
export function tetesCouvertes<L extends { type?: unknown; canal?: unknown; apptId?: unknown; apptIds?: unknown }>(
  lignes: readonly (L | null | undefined)[], o: { type: string; canal: string; verrouille: (l: L) => boolean },
): Set<string> {
  const couvertes = new Set<string>();
  for (const l of lignes) {
    if (!l || String(l.type ?? '') !== o.type || String(l.canal ?? '') !== o.canal || !o.verrouille(l)) continue;
    for (const id of tetesNommees(l)) couvertes.add(id);
  }
  return couvertes;
}

/** UN FOYER QUI NE TIENT PLUS, relu avant l'envoi : une autre tête nommée a
    disparu, est annulée ou a changé de jour. Le message ne part pas
    (« périmé », sans la marque d'Opale) : la fonction qui l'a déposé le
    refait avec les têtes qui restent. `rdvs` : les rendez-vous relus. */
export function foyerQuiNeTientPlus(
  l: { apptId?: unknown; apptIds?: unknown; dateRdv?: unknown },
  rdvs: ReadonlyMap<string, { date?: string; status?: string } | null | undefined>,
): string | null {
  const jour = String(l.dateRdv ?? '').slice(0, 10);
  for (const id of tetesNommees(l)) {
    if (id === String(l.apptId ?? '')) continue;
    const r = rdvs.get(id);
    if (!r) return 'un rendez-vous du foyer n’existe plus : le message se refait sans lui';
    if (r.status === 'annulé') return 'un rendez-vous du foyer a été annulé : le message se refait sans lui';
    if (String(r.date ?? '').slice(0, 10) !== jour) return 'un rendez-vous du foyer a changé de jour : le message se refait sans lui';
  }
  return null;
}
/* ⟨/message-du-foyer⟩ */
