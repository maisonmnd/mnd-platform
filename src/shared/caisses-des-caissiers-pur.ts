/* ══ UNE CAISSE PAR CAISSIER, ET LES ANNÉES PASSÉES — 17 octobre 2026 ════
   « Ouvre également des caisses enregistreuses selon qui encaisse, Gérard,
   Brice, Yéman ou autres » (Yéman). Maquette 8kpQtpQh… validée (« Tout est
   bon, tu peux construire »), ses choix lus en base (maquette/encaisser) :
     · chacun a sa caisse, ouverte depuis l'Équipe ;
     · les espèces vont d'office dans la caisse de qui encaisse ;
       « Terrasse · Tiroir espèces » reste la caisse commune, en repli ;
     · MTN MoMoPay → la caisse MoMoPay de la Maison ; carte, chèque et
       virement → La Banque ; MND PAY → MND PAY ; l'avoir ne passe par
       aucune caisse ;
     · seule la direction change la caisse proposée ;
     · pas d'ouverture du matin : on compte le soir seulement.

   « Rajoute une caisse pour les RDV des années passées », puis : « il faut
   automatiquement détecter que c'est une année antérieure. Mais je ne veux
   pas voir année passée tout le temps, c'est pas forcément 2025, 2024, ça
   peut être 2023 ou 2022 ». UNE caisse commune, « Années passées » : tout
   l'argent d'un rendez-vous daté d'une année antérieure à l'année en cours
   y entre, quel que soit le caissier et le moyen, sauf MND PAY (l'argent est
   chez FedaPay) et l'avoir. L'année se CALCULE, elle ne s'écrit jamais en
   dur ; la caisse n'apparaît que pour un tel rendez-vous, et ni dans les
   caisses du jour ni à la clôture du soir.

   LA CAISSE SE DÉDUIT, ELLE NE SE DEVINE PAS. Le 13 septembre, la règle
   était « la caisse se choisit » : la première de la liste (KkiaPay) se
   posait d'office et des espèces partaient dans le tiroir du paiement en
   ligne. Ce qui se propose ici n'est jamais « la première venue » : c'est la
   caisse que SA décision nomme pour ce moyen. Quand aucune ne se nomme
   (Moov, Wave, PayPal…), rien ne se propose et chacun choisit.

   Tout se calcule ici, sans magasin ni React : `scripts/verifie-caisses-des-
   caissiers` le rejoue, pannes plantées comprises. */

import type { Cashbox } from './finance';

export const CAISSE_ANNEES_PASSEES = 'Années passées';
export const CAISSE_TIROIR_COMMUN = 'Terrasse · Tiroir espèces';
const CAISSE_MND_PAY = 'MND PAY';
const CAISSE_ZELLE = 'Zelle';
const CAISSE_KKIAPAY = 'KkiaPay';

export type FamilleDeMoyen = 'especes' | 'momo' | 'banque' | 'mndpay' | 'zelle' | 'kkiapay' | 'avoir' | 'autre';

const plat = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** LA FAMILLE D'UN MOYEN, lue sur son nom (la liste des moyens est la sienne,
    dans Paramètres : on la lit, on ne la réécrit pas). Moov, Celtiis, Wave,
    PayPal n'ont pas de caisse nommée par sa décision : « autre ». */
export function familleDuMoyen(methode: string): FamilleDeMoyen {
  const m = plat(methode ?? '');
  if (!m) return 'autre';
  if (m === 'avoir') return 'avoir';
  if (/mnd ?pay/.test(m)) return 'mndpay';
  if (/zelle/.test(m)) return 'zelle';
  if (/kkiapay/.test(m)) return 'kkiapay';
  if (/espece|cash|liquide/.test(m)) return 'especes';
  if (/\bmtn\b|momo|mobile money/.test(m) && !/moov|celti|wave/.test(m)) return 'momo';
  if (/carte|card|visa|master|cheque|virement|banc|bank/.test(m)) return 'banque';
  return 'autre';
}

/** L'année d'une date ISO, ou NaN. */
export const anneeDe = (iso: string | undefined): number => {
  const m = /^(\d{4})-\d{2}-\d{2}/.exec(String(iso ?? ''));
  return m ? Number(m[1]) : NaN;
};

/** UN RENDEZ-VOUS D'UNE ANNÉE ANTÉRIEURE : son année est avant celle
    d'aujourd'hui. Aucune année écrite en dur : en janvier 2027, un rendez-vous
    de 2026 le devient tout seul. Sans date lisible : non. */
export function estAnneeAnterieure(dateDuRdv: string | undefined, aujourdhui: string): boolean {
  const a = anneeDe(dateDuRdv);
  const b = anneeDe(aujourdhui);
  return Number.isFinite(a) && Number.isFinite(b) && a < b;
}

/** Le prénom, pour nommer une caisse : « Caisse de Gérard ». */
export const prenomDe = (nom: string): string => (nom ?? '').trim().split(/\s+/)[0] ?? '';

type Boite = Pick<Cashbox, 'id' | 'branchId' | 'name' | 'sub' | 'role' | 'equipe' | 'archiveeLe' | 'caissierId' | 'currency'>;

/** LA CAISSE DE CE CAISSIER dans cette branche (jamais une rangée). */
export function caisseDuCaissier<B extends Boite>(boxes: readonly B[], branchId: string, staffId: string | undefined): B | undefined {
  if (!staffId) return undefined;
  return boxes.find((b) => b.branchId === branchId && !b.archiveeLe && b.caissierId === staffId);
}

/** LA CAISSE NEUVE D'UN CAISSIER. Identifiant tiré de sa fiche : deux postes
    qui l'ouvrent en même temps écrivent la même caisse. Deux prénoms pareils :
    la seconde prend le nom entier, pour que le soir on sache laquelle compter. */
export function caisseNeuveDuCaissier(
  branchId: string,
  staff: { id: string; name: string },
  existantes: readonly Pick<Cashbox, 'branchId' | 'name' | 'caissierId'>[],
): Cashbox {
  const prenom = prenomDe(staff.name) || 'caissier';
  const court = `Caisse de ${prenom}`;
  const pris = existantes.some((b) => b.branchId === branchId && b.name === court && b.caissierId !== staff.id);
  const name = pris ? `Caisse de ${staff.name.trim()}` : court;
  return {
    id: `cb-caissier-${staff.id}`,
    branchId,
    name,
    sub: `Espèces encaissées par ${prenom}`,
    glyph: '◈',
    openingXof: 0,
    role: 'terrasse',
    equipe: true,
    caissierId: staff.id,
  };
}

/** LA CAISSE DES ANNÉES PASSÉES de la branche, idempotente (identifiant tiré
    de la branche). Rôle « archive » : c'est l'histoire, et aucune caisse
    proposée d'office ailleurs ne la prendra pour la Terrasse. */
export function caisseDesAnneesPassees(branchId: string): Cashbox {
  return {
    id: `cb-annees-passees-${branchId}`,
    branchId,
    name: CAISSE_ANNEES_PASSEES,
    sub: 'Rendez-vous des années antérieures',
    glyph: '◷',
    openingXof: 0,
    role: 'archive',
  };
}

const textes = (b: Boite): string => plat(`${b.name} ${b.sub ?? ''}`);

/** Le tiroir commun des espèces : son nom d'abord, puis une Terrasse ouverte à
    l'équipe qui dit « espèces » ou « tiroir », jamais la caisse d'un autre. */
function tiroirCommun<B extends Boite>(boxes: readonly B[]): B | undefined {
  return boxes.find((b) => b.name === CAISSE_TIROIR_COMMUN)
    ?? boxes.find((b) => !b.caissierId && b.role === 'terrasse' && /espece|tiroir/.test(textes(b)) && !/momo|devise/.test(textes(b)));
}

export type CaisseProposee = {
  /** Le nom de la caisse proposée ; absent : rien ne se propose, on choisit. */
  caisse?: string;
  /** Ce que l'écran dit, en clair. */
  pourquoi: string;
  /** L'année antérieure reconnue (le rendez-vous de 2025, 2023…). */
  anneePassee?: number;
  /** La caisse des années passées n'existe pas encore : l'écran la crée. */
  aCreer?: boolean;
};

/** LA CAISSE QUE SA DÉCISION NOMME pour ce règlement.
    `boxes` : les caisses où cet argent PEUT entrer (la branche, la date, la
    devise déjà filtrées). `staffId` : la fiche de qui encaisse. */
export function caisseProposee(o: {
  methode: string;
  dateDuRdv?: string;
  aujourdhui: string;
  boxes: readonly Boite[];
  branchId: string;
  staffId?: string;
  /** Payé en devise étrangère : seule une caisse dans cette devise convient. */
  enDevise?: boolean;
}): CaisseProposee {
  const famille = familleDuMoyen(o.methode);
  const ici = o.boxes.filter((b) => b.branchId === o.branchId && !b.archiveeLe);
  const nommee = (nom: string) => ici.find((b) => b.name === nom)?.name;

  if (famille === 'avoir') return { pourquoi: 'L’avoir est un crédit du compte : il ne passe par aucune caisse.' };
  if (famille === 'mndpay') {
    const c = nommee(CAISSE_MND_PAY);
    return c ? { caisse: c, pourquoi: 'Payé par MND PAY : l’argent est chez FedaPay jusqu’au reversement.' } : { pourquoi: 'La caisse MND PAY n’est pas ouverte.' };
  }
  /* UN BILLET ÉTRANGER GARDE SON TIROIR, même pour une année antérieure :
     une caisse ne reçoit que sa devise, sinon la trésorerie additionnerait
     des euros à des francs (18 août). */
  if (o.enDevise) {
    const seules = ici.filter((b) => !b.caissierId);
    return seules.length === 1
      ? { caisse: seules[0].name, pourquoi: 'La seule caisse qui tient cette devise.' }
      : { pourquoi: 'Choisissez la caisse qui tient ces billets.' };
  }
  if (estAnneeAnterieure(o.dateDuRdv, o.aujourdhui)) {
    const annee = anneeDe(o.dateDuRdv);
    const c = nommee(CAISSE_ANNEES_PASSEES);
    return {
      caisse: CAISSE_ANNEES_PASSEES,
      anneePassee: annee,
      pourquoi: `Rendez-vous de ${annee}, une année antérieure : tout son argent va aux années passées.`,
      ...(c ? {} : { aCreer: true }),
    };
  }
  if (famille === 'especes') {
    const sienne = caisseDuCaissier(ici, o.branchId, o.staffId);
    if (sienne) return { caisse: sienne.name, pourquoi: 'Les espèces vont dans la caisse de qui encaisse.' };
    const commun = tiroirCommun(ici);
    return commun
      ? { caisse: commun.name, pourquoi: 'Pas encore de caisse à votre nom : les espèces vont au tiroir commun.' }
      : { pourquoi: 'Aucun tiroir des espèces : choisissez la caisse.' };
  }
  if (famille === 'momo') {
    const c = ici.find((b) => !b.caissierId && /momo ?pay/.test(textes(b)))
      ?? ici.find((b) => !b.caissierId && b.role === 'terrasse' && /momo|mtn/.test(textes(b)));
    return c ? { caisse: c.name, pourquoi: 'MTN MoMoPay arrive sur le compte MoMoPay de la Maison.' } : { pourquoi: 'Aucune caisse MoMoPay : choisissez la caisse.' };
  }
  if (famille === 'banque') {
    const c = ici.find((b) => b.role === 'banque') ?? ici.find((b) => !b.caissierId && /banque|bank/.test(plat(b.name)));
    const cheque = /cheque/.test(plat(o.methode));
    return c
      ? { caisse: c.name, pourquoi: cheque ? 'Le chèque se dépose à la banque.' : 'La carte et le virement arrivent à la banque.' }
      : { pourquoi: 'Aucune caisse de banque : choisissez la caisse.' };
  }
  if (famille === 'zelle') {
    const c = nommee(CAISSE_ZELLE);
    return c ? { caisse: c, pourquoi: 'Zelle arrive sur le compte américain.' } : { pourquoi: 'La caisse Zelle n’est pas ouverte.' };
  }
  if (famille === 'kkiapay') {
    const c = nommee(CAISSE_KKIAPAY);
    return c ? { caisse: c, pourquoi: 'Payé en ligne par KkiaPay.' } : { pourquoi: 'Choisissez la caisse.' };
  }
  return { pourquoi: 'Ce moyen n’a pas de caisse attitrée : choisissez-la.' };
}

/** QUI PEUT CHANGER LA CAISSE. La direction toujours ; les autres seulement
    quand rien ne se propose (sinon un moyen sans caisse attitrée ne
    s'encaisserait plus du tout). */
export const peutChangerLaCaisse = (estDirection: boolean, p: Pick<CaisseProposee, 'caisse'>): boolean =>
  estDirection || !p.caisse;

/** LES CAISSES QU'ON OFFRE AU CHOIX. Jamais la caisse d'un autre caissier à
    qui n'est pas la direction ; jamais les années passées pour un rendez-vous
    de l'année ; jamais MND PAY à la main (seul FedaPay y fait entrer). */
export function caissesAuChoix<B extends Boite>(boxes: readonly B[], o: {
  staffId?: string; estDirection: boolean; anneePassee: boolean; garder?: string;
}): B[] {
  return boxes.filter((b) => {
    if (b.name === o.garder) return true;
    if (b.name === CAISSE_MND_PAY) return false;
    if (b.name === CAISSE_ANNEES_PASSEES) return o.anneePassee;
    if (b.caissierId && b.caissierId !== o.staffId && !o.estDirection) return false;
    return true;
  });
}

/** Les caisses qui ne se comptent jamais le soir : celle des années passées
    (l'histoire) et MND PAY (l'argent est chez FedaPay). */
export const HORS_CLOTURE: readonly string[] = [CAISSE_ANNEES_PASSEES, CAISSE_MND_PAY];
