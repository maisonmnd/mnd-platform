/* ══ LE RENDEZ-VOUS SUGGÉRÉ · 15 novembre 2026 ══════════════════════════
   « The way you make automatic appointments is not good » ; « call it
   suggested appointment » ; « après avoir terminé un RDV, il y a une
   ambiguïté car on ne comprend pas qu'une nouvelle transaction commence avec
   un futur RDV, il faut revoir la transition » ; « l'option de cocher 3, 4,
   5, 6, 8 et 12 semaines, ou choisir une date » (Yéman, 14 novembre 2026,
   après Mme F. : « je n'avais pas pris de rdv pour demain », et l'assistant
   qui lui répondait « vous avez bien un rendez-vous confirmé »).

   Maquette `public/maquette-le-rendez-vous-suggere.html`
   (PeiD4o4yfCY4GajdGJ52Ez), quatre arbitrages tranchés au sélecteur le
   14 novembre 2026, « construis » le 15 :
   A · sans réponse, la place reste tenue ; relance trois jours avant ; la
       veille à 10 h le comptoir est prévenu (l'appeler ou libérer la place) ;
       rien ne s'efface seul ;
   B · les rendez-vous posés AVANT ce jour restent « Confirmé », sans
       message : seul celui que la seconde étape pose porte la marque ;
   C · la proposition part en fermant la fenêtre, une seule fois ;
   D · les semaines aussi dans « Nouveau rendez-vous » › Quand, comptées
       depuis sa dernière venue.

   UNE MARQUE STOCKÉE, PAS UNE DÉDUCTION. `repriseDe` dit d'où vient un
   rendez-vous ; il ne dit pas si elle a dit oui (B : 45 reprises d'avant
   restent confirmées). La seconde étape pose `suggereLe` ; « Je confirme »
   (WhatsApp, Ma Couronne) ou « Elle a dit oui » (le comptoir) posent
   `confirmeeParLaClienteLe`. Le statut reste « confirmé » : la place est
   tenue au Carnet, dans les places du « + RDV », dans les comptes.

   Pur, sans magasin ni React. Le bloc ⟨rendez-vous-suggere⟩ est RECOPIÉ dans
   confirmation-rdv et rappels-j1 (une fonction Edge n'importe rien du
   dépôt) ; `verifie-les-douze-lunes` garde les copies identiques.
   `scripts/verifie-le-rendez-vous-suggere.mjs` l'éprouve (et `--prouve`). */

/* ⟨rendez-vous-suggere⟩ */
/** Les marques que lit le juge : le statut, la pose par la Maison, son oui. */
export type MarquesDeLaSuggestion = {
  status?: unknown; suggereLe?: unknown; confirmeeParLaClienteLe?: unknown; autreMomentDemandeLe?: unknown;
};
const marquePosee = (v: unknown): boolean => typeof v === 'string' && v.trim().length > 0;

/** SUGGÉRÉ : posé par la Maison (`suggereLe`), tenu, et pas encore de oui. */
export function estSuggere(a: MarquesDeLaSuggestion | null | undefined): boolean {
  return !!a && a.status === 'confirmé' && marquePosee(a.suggereLe) && !marquePosee(a.confirmeeParLaClienteLe);
}

/** Trois jours avant : la relance d'une suggestion sans réponse. */
export const JOURS_AVANT_LA_RELANCE = 3;

/** « Bonjour Mme F., merci pour votre visite… » : le message de la
    proposition, en fermant la fenêtre (le modèle `proposition_rituel`,
    {{1}} l'appel, {{2}} le moment, {{3}} les gestes). Mot pour mot le corps
    approuvé chez Meta le 15 novembre 2026 : Meta refuse un corps qui finit
    par une variable, la question finale y a été ajoutée. */
export function texteDeLaProposition(o: { appel: string; quand: string; gestes: string }): string {
  return `Bonjour ${o.appel}, merci pour votre visite. Pour garder le rythme de vos locks, nous vous proposons votre prochain rituel le ${o.quand} : ${o.gestes}. Cette date vous convient-elle ?`;
}

/** La relance, trois jours avant, quand elle n'a pas répondu (le modèle
    `reprise_proposee`, mêmes variables). Elle ne dit jamais « votre
    rendez-vous » : elle n'a rien réservé. */
export function texteDeLaRelance(o: { appel: string; quand: string; gestes: string }): string {
  return `Bonjour ${o.appel}, notre proposition du ${o.quand} pour votre prochain rituel (${o.gestes}) vous convient-elle ?`;
}

/** Les deux réponses, dans cet ordre : ce que chaque bouton rapporte au
    webhook (REPRISE_OK / REPRISE_AUTRE, lus depuis le 29 septembre 2026). */
export function composantsDeLaProposition(o: { appel: string; quand: string; gestes: string; apptId: string }): unknown[] {
  return [
    { type: 'body', parameters: [{ type: 'text', text: o.appel }, { type: 'text', text: o.quand }, { type: 'text', text: o.gestes }] },
    { type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: `REPRISE_OK:${o.apptId}` }] },
    { type: 'button', sub_type: 'quick_reply', index: '1', parameters: [{ type: 'payload', payload: `REPRISE_AUTRE:${o.apptId}` }] },
  ];
}
/* ⟨/rendez-vous-suggere⟩ */

/* ── CE QUE LE TRÔNE EN DIT ────────────────────────────────────────────── */

export type EtatDeLaSuggestion = 'sans-reponse' | 'autre-moment' | 'confirmee';

/** Où en est une suggestion. `null` : ce n'en est pas une (prise par elle,
    posée avant le 15 novembre 2026, ou annulée). */
export function etatDeLaSuggestion(a: MarquesDeLaSuggestion | null | undefined): EtatDeLaSuggestion | null {
  if (!a || !marquePosee(a.suggereLe) || a.status === 'annulé') return null;
  if (marquePosee(a.confirmeeParLaClienteLe)) return 'confirmee';
  return marquePosee(a.autreMomentDemandeLe) ? 'autre-moment' : 'sans-reponse';
}

const plusJours = (iso: string, n: number): string => {
  const t = Date.parse(`${iso}T12:00:00Z`);
  return Number.isFinite(t) ? new Date(t + n * 86_400_000).toISOString().slice(0, 10) : iso;
};

/** Le jour de sa relance (trois jours avant). */
export const jourDeLaRelance = (dateIso: string): string => plusJours(dateIso, -JOURS_AVANT_LA_RELANCE);

/** LA TUILE DU CARNET : « Proposé le 14 nov. 2026 · sans réponse · relance le
    23 déc. », « … · elle demande un autre moment », « Suggéré le 7 nov. 2026,
    confirmé par elle le 8 nov. ». `court` : « 14 nov. 2026 ». */
export function ceQueDitLaSuggestion(
  a: MarquesDeLaSuggestion & { date?: string },
  o: { court: (iso: string) => string; aujourdhui: string },
): string {
  const etat = etatDeLaSuggestion(a);
  if (!etat) return '';
  const le = o.court(String(a.suggereLe).slice(0, 10));
  if (etat === 'confirmee') return `Suggéré le ${le}, confirmé par elle le ${o.court(String(a.confirmeeParLaClienteLe).slice(0, 10))}`;
  if (etat === 'autre-moment') return `Proposé le ${le} · elle demande un autre moment`;
  const relance = a.date ? jourDeLaRelance(a.date) : '';
  return relance && relance >= o.aujourdhui
    ? `Proposé le ${le} · sans réponse · relance le ${o.court(relance)}`
    : `Proposé le ${le} · sans réponse`;
}

/* ── LES SEMAINES DE LA SUITE ──────────────────────────────────────────── */

/** « 3, 4, 5, 6, 8 et 12 semaines » (Yéman). */
export const SEMAINES_DE_LA_SUITE: readonly number[] = [3, 4, 5, 6, 8, 12];

/** LA PUCE DE SON RYTHME : la plus proche de son rythme, en semaines (à
    égalité, la plus courte). `null` : pas de rythme lisible. */
export function semaineDuRythme(rythmeJours: number | null | undefined): number | null {
  if (!rythmeJours || !Number.isFinite(rythmeJours) || rythmeJours <= 0) return null;
  const s = rythmeJours / 7;
  let meilleure: number | null = null;
  let ecart = Infinity;
  for (const n of SEMAINES_DE_LA_SUITE) {
    const e = Math.abs(n - s);
    if (e < ecart - 1e-9) { ecart = e; meilleure = n; }
  }
  return meilleure;
}

/** Le jour visé par une puce, depuis sa venue. */
export const dansNSemaines = (depuisIso: string, n: number): string => plusJours(depuisIso, n * 7);

const enMinutes = (h: string): number => { const [hh, mm] = h.split(':').map(Number); return (hh || 0) * 60 + (mm || 0); };

export type PlaceDeLaPuce = {
  iso: string;
  heure: string;
  /** Le jour que la puce visait. */
  vise: string;
  /** 'aucun' : le jour visé, à son heure ; 'heure' : le jour visé, une
      autre heure ; 'jour' : le jour visé est fermé ou plein, le suivant. */
  ecart: 'aucun' | 'heure' | 'jour';
};

/** LA PLACE D'UNE PUCE : le jour visé (jamais avant demain), à son heure
    habituelle si elle est libre, sinon l'heure libre la plus proche ; un jour
    fermé ou plein passe au jour ouvert suivant qui a une place pour sa durée.
    `null` : rien dans l'horizon. */
export function laPlaceDeLaPuce(o: {
  vise: string;
  aujourdhui: string;
  placesDe: (iso: string) => { ferme: boolean; heures: readonly string[] };
  heureHabituelle?: string | null;
  horizon?: number;
}): PlaceDeLaPuce | null {
  const demain = plusJours(o.aujourdhui, 1);
  const depart = o.vise < demain ? demain : o.vise;
  const horizon = o.horizon ?? 28;
  for (let i = 0; i <= horizon; i += 1) {
    const iso = plusJours(depart, i);
    const p = o.placesDe(iso);
    if (p.ferme || p.heures.length === 0) continue;
    const sienne = o.heureHabituelle ?? null;
    let heure = p.heures[0];
    if (sienne) {
      heure = p.heures.includes(sienne)
        ? sienne
        : [...p.heures].sort((a, b) => Math.abs(enMinutes(a) - enMinutes(sienne)) - Math.abs(enMinutes(b) - enMinutes(sienne)) || enMinutes(a) - enMinutes(b))[0];
    }
    const ecart: PlaceDeLaPuce['ecart'] = iso !== o.vise ? 'jour' : sienne && heure !== sienne ? 'heure' : 'aucun';
    return { iso, heure, vise: o.vise, ecart };
  }
  return null;
}

/* ── QUI A CHOISI LA DATE ──────────────────────────────────────────────── */

/** « Suggéré par la Maison » (le défaut) ou « Elle l'a choisi avec nous ». */
export type QuiAChoisi = 'suggere' | 'choisi';

/** Les champs qu'écrit la seconde étape : la marque d'une suggestion, ou
    rien (elle a dit oui au comptoir : un rendez-vous ordinaire, confirmé). */
export const marqueDeLaPose = (qui: QuiAChoisi, maintenantIso: string): { suggereLe?: string } =>
  (qui === 'suggere' ? { suggereLe: maintenantIso } : {});

/* ── LES COMPTES À VENIR ───────────────────────────────────────────────── */

/** « Les chiffres à venir le comptent à part : « à confirmer » » : les
    rendez-vous à venir qu'elle a pris ou confirmés, et les suggestions
    qui attendent son oui. */
export function comptesAVenir(
  appts: readonly (MarquesDeLaSuggestion & { date: string; status: string })[],
  aujourdhui: string,
): { confirmes: number; aConfirmer: number } {
  let confirmes = 0;
  let aConfirmer = 0;
  for (const a of appts) {
    if (a.date < aujourdhui || a.status !== 'confirmé') continue;
    if (estSuggere(a)) aConfirmer += 1; else confirmes += 1;
  }
  return { confirmes, aConfirmer };
}

/* ── LA VEILLE À 10 H : LE COMPTOIR PRÉVENU (arbitrage A) ──────────────── */

/** L'heure du salon où le comptoir apprend les suggestions de demain restées sans réponse. */
export const HEURE_DU_COMPTOIR_LA_VEILLE = 10;

/** Celles de demain qui attendent encore son oui : à appeler, ou la place à libérer. */
export const suggestionsSansReponse = <T extends MarquesDeLaSuggestion & { date?: string }>(appts: readonly T[], demain: string): T[] =>
  appts.filter((a) => a.date === demain && estSuggere(a));

/** La notification du comptoir : des initiales et des heures, jamais un nom. */
export function noteDuComptoir(lignes: readonly { initiales: string; heure: string }[]): { titre: string; corps: string } | null {
  if (lignes.length === 0) return null;
  const n = lignes.length;
  const qui = lignes.map((l) => `${l.initiales} à ${l.heure}`).join(', ');
  return {
    titre: n > 1 ? `${n} suggestions de demain sans réponse` : 'Une suggestion de demain sans réponse',
    corps: `${qui}. Appelez-la pour confirmer, ou libérez la place au Carnet.`,
  };
}

/** « Mme F. » → « F. » ; « Floriane Adjovi » → « F. A. ». */
export function initialesDe(nom: string | null | undefined): string {
  const mots = String(nom ?? '').replace(/(^|\s)(?:M\.|Mme|Mlle|Monsieur|Madame|Mademoiselle)(?=\s)/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return 'Une cliente';
  return mots.slice(0, 2).map((m) => `${m.charAt(0).toUpperCase()}.`).join(' ');
}
