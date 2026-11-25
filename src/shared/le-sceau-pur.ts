/* ══ LE SCEAU — 22 novembre 2026 ═════════════════════════════════════════
   « Un système rapide de self checkout sur le Trône avec les téléphones qui
   communiquent avec le Trône en direct » (Yéman). Maquette jouable
   `LK7GvACWPzWgJ7WNZeZigp` (version 9, 22 novembre 2026), construite ici :
   son lot 1, « le direct et le sceau sur la page Régler qui existe ».
   La passation est `mnd-passation-sceau-et-devis`.

   CE QUI EST TRANCHÉ PAR ELLE, ET NE SE ROUVRE PAS :
   · le nom « Le Sceau », et le geste : UN DOIGT MAINTENU UNE SECONDE ;
   · le sceau, c'est le pictogramme de la Maison ; au moment « Scellé », le
     sceau cuivre (`public/assets/tampons/mnd-premium-cuivre.png`). JAMAIS le
     tampon de la direction (`mnd-1-sceau.png`) ;
   · deux entrées qui marchent toujours : la note sur son WhatsApp quand le
     maître termine, ou le médaillon du fauteuil à scanner — c'est le même
     lien (`payer.html?tg=r-<jeton>`), le QR du médaillon le porte ;
   · « Ajouter un soin » ouvre le catalogue (avec recherche), plusieurs
     soins, chacun retirable ;
   · le geste offert : le maître tape lui-même un montant en francs ou un
     pourcentage ;
   · le merci à l'équipe : 1 000, 2 000, 3 000, 5 000, 10 000 — caché à
     l'équipe jusqu'au règlement ;
   · une demande par page, jamais deux mêlées ; le dernier écran dit
     « Merci. », signé « Maison MND », puis la devise.

   CE FICHIER EST PUR (aucun magasin, aucun React) : le banc
   `scripts/verifie-le-sceau.mjs --prouve` l'éprouve sans navigateur.

   LE FIL NE PORTE QUE DES SIGNAUX. Le canal temps réel d'une page cliente
   est écoutable par n'importe quel téléphone qui connaît son jeton : il ne
   transporte donc RIEN d'autre que « relis » (`signalDuSceau`). Ni nom, ni
   montant, ni numéro. Tout le reste se relit au serveur, par la fonction
   `regler-la-seance`, qui seule connaît la note et l'argent. */
import type { EtatDuLien, LienDeReglement } from './regler-la-seance-pur';

export const LE_SCEAU = 'Le Sceau';

/** « Un doigt maintenu une seconde » (Yéman). La jauge du doigt dure tout
    ce temps ; en deçà, rien ne part. */
export const TENUE_DU_SCEAU_MS = 1100;

/** Le sceau cuivre de la Maison, au moment « Scellé ». Jamais celui de la
    direction. */
export const SCEAU_CUIVRE = 'assets/tampons/mnd-premium-cuivre.png';
/** Le pictogramme seul, sur le bouton et les petites marques (celui de la
    Maison, en indigo sur le cuivre). */
export const PICTOGRAMME_DU_SCEAU = 'assets/vectoriel/pictogramme-indigo-profond.svg';

/* ── LES MOYENS DU SCEAU ──────────────────────────────────────────────────
   Elle choisit sur sa note ; le sceau pose le geste. MTN part en demande
   directe (la Maison ajoute ses frais, 1,6 % par défaut, réglable) ;
   Moov, Celtiis et la carte passent par la fenêtre KkiaPay sur SON
   téléphone (KkiaPay ajoute ses frais : 1,5 % mobile money, 2,3 % carte).
   Les espèces restent au comptoir — le sceau ne les connaît pas. */
export type MoyenDuSceau = 'mtn' | 'moov' | 'celtiis' | 'carte';
export type RailDuSceau = 'mtn' | 'kkiapay';

export const MOYENS_DU_SCEAU: readonly { k: MoyenDuSceau; nom: string; rail: RailDuSceau; par: string }[] = [
  { k: 'mtn', nom: 'MTN', rail: 'mtn', par: 'par MTN' },
  { k: 'moov', nom: 'Moov', rail: 'kkiapay', par: 'par Moov' },
  { k: 'celtiis', nom: 'Celtiis', rail: 'kkiapay', par: 'par Celtiis' },
  { k: 'carte', nom: 'Carte', rail: 'kkiapay', par: 'par carte' },
];

export const estUnMoyenDuSceau = (x: unknown): x is MoyenDuSceau =>
  MOYENS_DU_SCEAU.some((m) => m.k === x);

export const moyenDuSceau = (x: unknown): { k: MoyenDuSceau; nom: string; rail: RailDuSceau; par: string } | null =>
  MOYENS_DU_SCEAU.find((m) => m.k === x) ?? null;

/** LE SCEAU POSÉ SANS SAVOIR PAR OÙ. Quand elle règle par la fenêtre KkiaPay,
    le réseau (MTN, Moov, Celtiis, carte) se connaît à la fin, pas au geste :
    le Trône dit « par KkiaPay », et le moyen exact vient avec l'argent
    (`moyenDit` de la fonction). */
export const MOYEN_KKIAPAY = 'kkiapay';

/** Ce que le Trône lit d'un moyen de sceau, `kkiapay` compris. */
export const moyenDitDuSceau = (x: unknown): { nom: string; rail: RailDuSceau; par: string } | null =>
  x === MOYEN_KKIAPAY ? { nom: 'KkiaPay', rail: 'kkiapay', par: 'par KkiaPay' } : moyenDuSceau(x);

/* ── LE GESTE DE LA MAISON ────────────────────────────────────────────────
   Le maître tape lui-même un montant en francs ou un pourcentage. Le
   plafond de 50 % vient de la maquette (choix de la session précédente,
   repris du seuil de la remise que la direction s'autorise) : IL ATTEND LA
   CONFIRMATION DE YÉMAN (passation, « ce qui est de moi : à lui faire
   confirmer »). Il ne s'applique qu'au pourcentage : en francs, le plafond
   est la note elle-même. */
export const PLAFOND_DU_GESTE_PCT = 50;

/** Ce qui reste à payer : un geste ne peut pas dépasser ce qu'elle doit
    encore. Un geste sur de l'argent déjà reçu obligerait à rendre. */
export const baseDuGeste = (resteXof: number): number => Math.max(0, Math.round(Number(resteXof) || 0));

export type GesteDemande =
  | { ok: true; mode: 'xof' | 'pct'; dit: number; xof: number }
  | { ok: false; raison: 'vide' | 'lecture' | 'trop' | 'rien' };

/** Le geste lu : un montant en francs, ou un pourcentage borné. `saisie` est
    ce qu'il a tapé, tel quel (« 1 000 », « 12,5 », « 12.5 % »). */
export function gesteDemande(saisie: unknown, mode: 'xof' | 'pct', resteXof: number): GesteDemande {
  const base = baseDuGeste(resteXof);
  const brut = String(saisie ?? '').trim();
  if (!brut) return { ok: false, raison: 'vide' };
  if (base <= 0) return { ok: false, raison: 'rien' };
  if (mode === 'pct') {
    const net = brut.replace(/[\s\u00a0%]/g, '').replace(',', '.');
    if (!/^\d+(\.\d+)?$/.test(net)) return { ok: false, raison: 'lecture' };
    const v = Math.round(Number(net) * 10) / 10;
    if (!(v >= 1)) return { ok: false, raison: 'lecture' };
    if (v > PLAFOND_DU_GESTE_PCT) return { ok: false, raison: 'trop' };
    return { ok: true, mode, dit: v, xof: Math.min(base, Math.round((base * v) / 100)) };
  }
  const chiffres = brut.replace(/[^\d]/g, '');
  if (!chiffres) return { ok: false, raison: 'lecture' };
  const v = Math.round(Number(chiffres));
  if (!(v >= 1)) return { ok: false, raison: 'lecture' };
  if (v > base) return { ok: false, raison: 'trop' };
  return { ok: true, mode, dit: v, xof: v };
}

/** Ce que l'écran du geste dit sous le champ. */
export function gesteDit(saisie: unknown, mode: 'xof' | 'pct', resteXof: number, franc: (x: number) => string): string {
  const g = gesteDemande(saisie, mode, resteXof);
  const base = baseDuGeste(resteXof);
  if (g.ok) return `Sur une note de ${franc(base)} : − ${franc(g.xof)}. Elle le voit à l’instant.`;
  if (g.raison === 'rien') return 'Il n’y a plus rien à régler sur cette note.';
  if (g.raison === 'vide') return mode === 'pct' ? 'De 1 à 50 %. Au-delà, la direction décide.' : `Jusqu’à ${franc(base)}, ce qu’elle doit encore.`;
  if (g.raison === 'trop') return mode === 'pct' ? 'Un pourcentage de 1 à 50.' : `Un montant de 1 F à ${franc(base)}.`;
  return mode === 'pct' ? 'Un pourcentage de 1 à 50.' : 'Un nombre de francs.';
}

/* ── LE FAUTEUIL, SUIVI PAR LE TRÔNE ──────────────────────────────────────
   Cinq étapes, les mots de la maquette : le rituel se termine, la note est
   partie, elle lit sa note, elle règle, c'est scellé. Elles se lisent sur le
   LIEN et sur l'argent — jamais sur un état que la page aurait crié. */
export const ETAPES_DU_FAUTEUIL = ['rituel', 'note', 'page', 'regle', 'scelle'] as const;
export type EtapeDuFauteuil = (typeof ETAPES_DU_FAUTEUIL)[number];

export const NOMS_DES_ETAPES: Record<EtapeDuFauteuil, string> = {
  rituel: 'Le rituel',
  note: 'Note partie',
  page: 'Sur sa note',
  regle: 'Elle règle',
  scelle: 'Scellé',
};

/** Où en est le fauteuil. `etat` vient d'`etatDuLien` (le reste de la pièce). */
export function etapeDuFauteuil(o: { lien?: LienDeReglement | null; etat: EtatDuLien }): EtapeDuFauteuil {
  if (o.etat === 'reglee') return 'scelle';
  if (o.lien?.sceauLe) return 'regle';
  if (o.lien?.ouvertLe) return 'page';
  if (o.lien?.envoyeLe) return 'note';
  return 'rituel';
}

export const rangDeLEtape = (e: EtapeDuFauteuil): number => ETAPES_DU_FAUTEUIL.indexOf(e);
/** L'étape `k` est-elle derrière celle où il en est ? */
export const estFranchie = (e: EtapeDuFauteuil, k: EtapeDuFauteuil): boolean => rangDeLEtape(k) < rangDeLEtape(e);

/* UNE HEURE DE RETARD (25 novembre 2026). Vu à l'essai du Sceau : le Trône
   disait « Scellé à 5 h 38 » quand la ligne d'à côté, elle, disait 06:38.
   La fonction recopiait les chiffres écrits dans l'instant ; or le serveur
   note le sceau en temps universel (`toISOString`, « …Z »), et à Cotonou il
   est une heure de plus, toute l'année (UTC+1, sans heure d'été). Un instant
   qui porte son fuseau se convertit ; un instant sans fuseau est déjà à
   l'heure du salon et se lit tel quel. Jamais l'heure du poste : celui du
   bureau est réglé sur la Chine (voir `heureDuSalon`, shared/calendrier). */
export const DECALAGE_DU_SALON_MS = 3_600_000;
const PORTE_SON_FUSEAU = /(?:Z|[+-]\d{2}:?\d{2})$/;

/** L'heure d'un instant ISO, à la montre de Cotonou : « 17 h 42 ». */
export function heureDit(iso: string | undefined): string {
  if (!iso) return '';
  const brut = String(iso).trim();
  const m = /T(\d{2}):(\d{2})/.exec(brut);
  if (!m) return '';
  if (!PORTE_SON_FUSEAU.test(brut)) return `${Number(m[1])} h ${m[2]}`;
  const t = Date.parse(brut);
  if (!Number.isFinite(t)) return '';
  const d = new Date(t + DECALAGE_DU_SALON_MS);
  return `${d.getUTCHours()} h ${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

/** Ce que le Trône dit du fauteuil, en une phrase — la maquette, mot pour mot
    quand elle le donne. `prenom` s'accorde : la phrase reste la même pour un
    client homme (« elle » devient « il »). */
export function leFauteuilDit(o: {
  etape: EtapeDuFauteuil; prenom?: string; moyen?: string | null; sceauLe?: string;
}): string {
  const moyen = moyenDitDuSceau(o.moyen);
  if (o.etape === 'rituel') return 'Le rituel se termine. Le maître choisit : la note sur son WhatsApp, ou le médaillon du fauteuil.';
  if (o.etape === 'note') return 'Sa note est partie sur son WhatsApp. Elle ne l’a pas encore ouverte.';
  if (o.etape === 'page') return 'Elle lit sa note, en direct.';
  if (o.etape === 'regle') {
    if (!moyen) return 'Le sceau est posé : elle règle sur son téléphone.';
    return moyen.rail === 'mtn'
      ? 'Le sceau est posé : la demande MTN est sur son téléphone, elle valide avec son code secret.'
      : `Le sceau est posé : elle règle ${moyen.par}, dans la fenêtre KkiaPay de son téléphone.`;
  }
  return o.sceauLe ? `Scellé à ${heureDit(o.sceauLe)}. Le fauteuil se libère.` : 'Scellé. Le fauteuil se libère.';
}

/* ── LE FIL ───────────────────────────────────────────────────────────────
   Un canal par jeton, nommé par lui : `sceau-<jeton>`. Personne ne peut le
   deviner sans le lien, et il ne dit rien de plus que l'existence d'une page
   ouverte. La charge est VIDE, par construction. */
export const SIGNAL_DU_SCEAU = 'relis';
export const filDuSceau = (jeton: string): string => `sceau-${String(jeton ?? '').trim()}`;
export const estUnFilDuSceau = (s: unknown): boolean => /^sceau-[23456789abcdefghjkmnpqrstuvwxyz]{14}$/.test(String(s ?? ''));

/** La charge du fil, telle qu'elle part. Gelée, et vide : un champ ajouté
    demain ne sortira pas sans qu'on rouvre cette fonction. */
export const CHARGE_DU_FIL: Readonly<Record<string, never>> = Object.freeze({});

export const signalDuSceau = (): { event: string; payload: Readonly<Record<string, never>> } =>
  ({ event: SIGNAL_DU_SCEAU, payload: CHARGE_DU_FIL });
