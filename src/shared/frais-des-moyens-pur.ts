/* ══ LES FRAIS DES MOYENS DE PAIEMENT — 22 novembre 2026 ═══════════════

   « Je veux un espace dans mes paramètres où je corrige les frais de carte
   à 2,3 %, et tous les frais liés aux différents moyens de paiement MTN,
   KkiaPay, FedaPay » (Yéman).

   UN SEUL ENDROIT : Paramètres › Paiements › « Les frais des moyens de
   paiement ». Chaque taux y garde son défaut, celui qu'écrivait le code ;
   un taux posé par la direction le remplace partout où il compte. Vide, le
   défaut revient.

   · LA MAISON LES AJOUTE POUR LA CLIENTE. La carte au terminal de la
     banque (une ligne de plus sur sa facture) ; Payer par MTN (le serveur
     `collecte-mtn` lit le taux dans `mnd_settings` au moment de la demande :
     ce qui part sur son téléphone est ce que l'écran annonce) ; FedaPay et
     Tap & Go, dont les taux vivent déjà dans `mndPay`, où le serveur
     `mnd-pay` les lit : la carte les écrit à cette place, jamais ailleurs.
   · KKIAPAY LES AJOUTE LUI-MÊME. Le Trône n'ajoute rien (le 21 novembre,
     une cliente a payé 4 % de la Maison en plus des 2,3 % de KkiaPay) : le
     taux ne sert qu'à dire ce qu'elle paiera.
   · MTN LES RETIENT À LA MAISON : 1,2 % (contrat du 28 octobre 2026), sur
     Payer par MTN (ce que les frais ajoutés laissent au-delà entre au tiroir
     « MTN Collection ») comme sur MoMoPay (le montant du code de la facture
     se remonte d'autant).

   Une facture déjà faite garde ses frais : sa ligne dit son taux.

   Pur : il n'importe que d'autres modules purs, d'où viennent les défauts.
   `node scripts/verifie-les-frais-des-moyens.mjs` le rejoue. */
import { FRAIS_DE_CARTE_PCT, fraisDeCarteXof, tauxDit } from './frais-de-carte-pur';
import { TAUX_AJOUTE_MTN_PCT, TAUX_DES_FRAIS_MTN, fraisAjoutesMtn } from './collecte-mtn-pur';
import { TAUX_MOMOPAY_PCT, montantMomopayFraisCompris } from './momopay-de-la-maison-pur';
import { FRAIS_KKIAPAY_CARTE_PCT, FRAIS_KKIAPAY_MOBILE_PCT, fraisKkiapayXof } from './choix-du-moyen-pur';
import { TAUX_MOBILE_DEFAUT, TAUX_TAPGO_DEFAUT, fraisPour, type ReglagesMndPay } from './mnd-pay-pur';

/** Ce que la direction a posé, en pour cent. Une clé absente : le défaut. */
export type FraisDesMoyens = {
  /** La carte au terminal de la banque : la Maison les ajoute. */
  carteTerminalPct?: number;
  /** Payer par MTN : la Maison les ajoute, le serveur les lit. */
  mtnAjoutePct?: number;
  /** Ce que MTN retient à la Maison, sur Payer par MTN et sur MoMoPay. */
  mtnRetenuPct?: number;
  /** KkiaPay, la carte au TPE : KkiaPay les ajoute lui-même. */
  kkiapayCartePct?: number;
  /** KkiaPay, le mobile money : KkiaPay les ajoute lui-même. */
  kkiapayMobilePct?: number;
};
export type CleDesFrais = keyof FraisDesMoyens;

/** Le plus haut taux qu'on accepte : au-delà, c'est une faute de frappe. */
export const TAUX_MAX_PCT = 10;

/** Les taux d'avant, écrits dans le code : ils valent tant que rien n'est posé. */
export const FRAIS_PAR_DEFAUT: Readonly<Record<CleDesFrais, number>> = {
  carteTerminalPct: FRAIS_DE_CARTE_PCT,
  mtnAjoutePct: TAUX_AJOUTE_MTN_PCT,
  mtnRetenuPct: Math.round(TAUX_DES_FRAIS_MTN * 10_000) / 100,
  kkiapayCartePct: FRAIS_KKIAPAY_CARTE_PCT,
  kkiapayMobilePct: FRAIS_KKIAPAY_MOBILE_PCT,
};

/** Un taux tapé ou lu : de 0 à 10 %, au centième. `undefined` : vide ou
    illisible (« 2,3 » et « 2.3 » se lisent pareil). La copie du serveur
    (`tauxDesReglages`, collecte-mtn-pur.ts) dit la même chose. */
export function tauxLu(v: unknown): number | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'string' && v.trim() === '') return undefined;
  const n = typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > TAUX_MAX_PCT) return undefined;
  return Math.round(n * 100) / 100;
}

/** Le taux en vigueur : celui que la direction a posé, sinon celui d'avant. */
export const tauxDe = (f: FraisDesMoyens | null | undefined, cle: CleDesFrais): number =>
  tauxLu(f?.[cle]) ?? FRAIS_PAR_DEFAUT[cle];

/** FedaPay et Tap & Go : leurs taux vivent dans `mndPay`, lus comme le serveur. */
export const tauxFedapayMobile = (r: ReglagesMndPay | null | undefined): number => tauxLu(r?.tauxMobilePct) ?? TAUX_MOBILE_DEFAUT;
export const tauxTapGo = (r: ReglagesMndPay | null | undefined): number => tauxLu(r?.tapgo?.tauxPct) ?? TAUX_TAPGO_DEFAUT;

/** Les taux que le choix du moyen et ses phrases disent. */
export type TauxDuChoix = { mtnAjoutePct: number; kkiapayCartePct: number; kkiapayMobilePct: number };
export const tauxDuChoix = (f: FraisDesMoyens | null | undefined): TauxDuChoix => ({
  mtnAjoutePct: tauxDe(f, 'mtnAjoutePct'),
  kkiapayCartePct: tauxDe(f, 'kkiapayCartePct'),
  kkiapayMobilePct: tauxDe(f, 'kkiapayMobilePct'),
});

/* ── LA CARTE DES PARAMÈTRES ─────────────────────────────────────────── */

export type IdDesFrais = CleDesFrais | 'fedapayMobile' | 'tapgo';
export type GroupeDesFrais = 'maison' | 'kkiapay' | 'retenus';
export type LigneDesFrais = { id: IdDesFrais; groupe: GroupeDesFrais; nom: string; sous: string };

export const GROUPES_DES_FRAIS: readonly { id: GroupeDesFrais; nom: string; cap: string }[] = [
  { id: 'maison', nom: 'La Maison les ajoute pour la cliente', cap: 'Elle paie le rituel, plus ces frais.' },
  { id: 'kkiapay', nom: 'KkiaPay les ajoute lui-même', cap: 'Le Trône n’ajoute rien : le taux sert à dire ce qu’elle paiera.' },
  { id: 'retenus', nom: 'Ce que MTN retient à la Maison', cap: 'Contrat du 28 octobre 2026.' },
];

export const LIGNES_DES_FRAIS: readonly LigneDesFrais[] = [
  { id: 'carteTerminalPct', groupe: 'maison', nom: 'Carte, au terminal de la banque', sous: 'Une ligne de plus sur sa facture ; la caissière passe le total au terminal.' },
  { id: 'mtnAjoutePct', groupe: 'maison', nom: 'Payer par MTN', sous: 'Ajoutés à la demande qui part sur son téléphone, merci compris ; le serveur lit ce taux. Changé, l’affiche du QR « Régler par MTN » est à réimprimer.' },
  { id: 'fedapayMobile', groupe: 'maison', nom: 'FedaPay, mobile money', sous: 'La grille de FedaPay pour MTN et Moov au Bénin.' },
  { id: 'tapgo', groupe: 'maison', nom: 'Tap & Go', sous: 'Compris dans le code qu’elle compose.' },
  { id: 'kkiapayCartePct', groupe: 'kkiapay', nom: 'KkiaPay, carte au TPE', sous: 'Le reçu du 21 novembre 2026 : 2,3 % de frais de transaction.' },
  { id: 'kkiapayMobilePct', groupe: 'kkiapay', nom: 'KkiaPay, mobile money', sous: 'MTN, Moov ou Celtiis, par la fenêtre KkiaPay ou la demande à son numéro.' },
  { id: 'mtnRetenuPct', groupe: 'retenus', nom: 'MTN, sur Payer par MTN et MoMoPay', sous: 'Sur MoMoPay, le code de la facture les comprend ; sur Payer par MTN, ce que les frais ajoutés laissent au-delà entre au tiroir « MTN Collection ».' },
];

/** Ce que les réglages portent, pour une ligne : `frais` et `mndPay`. */
export type ReglagesDesFrais = { frais?: FraisDesMoyens; mndPay?: ReglagesMndPay };

/** Le taux en vigueur d'une ligne. */
export function tauxDeLaLigne(id: IdDesFrais, s: ReglagesDesFrais): number {
  if (id === 'fedapayMobile') return tauxFedapayMobile(s.mndPay);
  if (id === 'tapgo') return tauxTapGo(s.mndPay);
  return tauxDe(s.frais, id);
}

/** Le taux d'avant d'une ligne (celui qui revient quand la case est vidée). */
export const defautDeLaLigne = (id: IdDesFrais): number =>
  (id === 'fedapayMobile' ? TAUX_MOBILE_DEFAUT : id === 'tapgo' ? TAUX_TAPGO_DEFAUT : FRAIS_PAR_DEFAUT[id]);

/** Le taux posé par la direction, s'il y en a un (sinon la case montre le défaut en gris). */
export function tauxPose(id: IdDesFrais, s: ReglagesDesFrais): number | undefined {
  if (id === 'fedapayMobile') return tauxLu(s.mndPay?.tauxMobilePct);
  if (id === 'tapgo') return tauxLu(s.mndPay?.tapgo?.tauxPct);
  return tauxLu(s.frais?.[id]);
}

const F = (x: number): string => `${Math.round(x).toLocaleString('fr-FR').replace(/[  ]/g, ' ')} F`;

/** L'EXEMPLE SOUS LA LIGNE, sur 10 000 F, avec l'arrondi de chaque moyen. */
export function exempleDeLaLigne(id: IdDesFrais, s: ReglagesDesFrais, surXof = 10_000): string {
  const t = tauxDeLaLigne(id, s);
  switch (id) {
    case 'carteTerminalPct': return `Sur ${F(surXof)} : + ${F(fraisDeCarteXof(surXof, t))}, à passer au terminal ${F(surXof + fraisDeCarteXof(surXof, t))}.`;
    case 'mtnAjoutePct': return `Sur ${F(surXof)} : + ${F(fraisAjoutesMtn(surXof, t))}, la demande part à ${F(surXof + fraisAjoutesMtn(surXof, t))}.`;
    case 'fedapayMobile': {
      const x = fraisPour(surXof, 'mtn', { ...(s.mndPay ?? {}), tauxMobilePct: t });
      return `Sur ${F(surXof)} : + ${F(x)}, elle paie ${F(surXof + x)}.`;
    }
    case 'tapgo': {
      const x = fraisPour(surXof, 'tapgo', { ...(s.mndPay ?? {}), tapgo: { ...(s.mndPay?.tapgo ?? {}), tauxPct: t } });
      return `Sur ${F(surXof)} : le code porte ${F(surXof + x)}.`;
    }
    case 'kkiapayCartePct':
    case 'kkiapayMobilePct': return `Sur ${F(surXof)} : KkiaPay ajoute ${F(fraisKkiapayXof(surXof, t))}, elle paie ${F(surXof + fraisKkiapayXof(surXof, t))}.`;
    case 'mtnRetenuPct': return `Par MoMoPay, ${F(surXof)} : le code de la facture porte ${F(montantMomopayFraisCompris(surXof, t))}.`;
  }
}

/** LA SAISIE D'UNE CASE. Vide : le taux posé s'efface, le défaut revient.
    Illisible ou hors de 0 à 10 % : `null`, rien ne bouge. Sinon, ce que les
    réglages deviennent (`frais` ou `mndPay`, l'autre intact). */
export function reglagesApresSaisie(id: IdDesFrais, saisie: string, s: ReglagesDesFrais): ReglagesDesFrais | null {
  const vide = saisie.trim() === '';
  const t = vide ? undefined : tauxLu(saisie);
  if (!vide && t === undefined) return null;
  if (id === 'fedapayMobile') {
    const m: ReglagesMndPay = { ...(s.mndPay ?? {}) };
    if (t === undefined) delete m.tauxMobilePct; else m.tauxMobilePct = t;
    return { ...s, mndPay: m };
  }
  if (id === 'tapgo') {
    const tg = { ...(s.mndPay?.tapgo ?? {}) };
    if (t === undefined) delete tg.tauxPct; else tg.tauxPct = t;
    return { ...s, mndPay: { ...(s.mndPay ?? {}), tapgo: tg } };
  }
  const f: FraisDesMoyens = { ...(s.frais ?? {}) };
  if (t === undefined) delete f[id]; else f[id] = t;
  return { ...s, frais: f };
}

/** Ce que la case montre : le taux posé, ou rien (le défaut en filigrane). */
export const caseDuTaux = (id: IdDesFrais, s: ReglagesDesFrais): string => {
  const p = tauxPose(id, s);
  return p === undefined ? '' : tauxDit(p);
};

export { tauxDit };
