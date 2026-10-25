/* ═══════════════════════════════════════════════════════════════════
   LE CARNET PLUS INTELLIGENT — 25 octobre 2026.

   « Make this page more intelligent » (Yéman, devant le Carnet), maquette
   VJ5PJEGUPDbYKUgEdMUNbS (vue 8). Ses choix au sélecteur : les quatre parties
   (les chiffres et leur calcul, ce qui presse en compteurs, les jours et les
   signaux, la recherche par phrase) ; le risque d'absence jugé SUR SON
   HISTORIQUE, le calcul toujours dit ; l'ancien dû montré sur le rendez-vous
   à venir, avec « Encaisser l'ancien ».

   DES CHIFFRES, PAS DES PHRASES : chaque signal porte son calcul (infobulle),
   chaque compteur son montant, chaque tuile sa ligne de total.

   Ce module est PUR : l'écran lui passe des rendez-vous déjà chiffrés (net,
   reste, durée). `scripts/verifie-le-carnet-intelligent.mjs` le prouve. */

export type RdvLu = {
  id: string;
  clientId: string;
  date: string;
  time: string;
  status: string;
  master?: string;
  depositXof?: number;
  depositConfirmed?: boolean;
  creeLe?: string;
  dureeMin: number;
  netXof: number;
  resteXof: number;
};

/* ── LES DATES, SANS FUSEAU ─────────────────────────────────────────── */
const jourDe = (iso: string): number => {
  const [a, m, j] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(a, (m || 1) - 1, j || 1) / 86400000;
};
const isoDe = (n: number): string => new Date(n * 86400000).toISOString().slice(0, 10);
export const ajouteJours = (iso: string, k: number): string => isoDe(jourDe(iso) + k);
const joursEntre = (a: string, b: string): number => jourDe(b) - jourDe(a);
const jourDeSemaine = (iso: string): number => new Date(jourDe(iso) * 86400000).getUTCDay();
const minutes = (hhmm: string): number => { const [h, m] = (hhmm || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export const jourEnClair = (iso: string): string => {
  const [a, m, j] = iso.split('-').map(Number);
  return `${JOURS[jourDeSemaine(iso)]} ${j === 1 ? '1er' : j} ${MOIS[m - 1]} ${a}`;
};
const fmtXof = (x: number) => `${String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} F`;

/** À venir : un jour à venir (aujourd'hui compris) qui n'est ni honoré ni
    annulé. Le même juge que le Carnet. */
export const estAVenir = (a: Pick<RdvLu, 'date' | 'status'>, aujourdhui: string): boolean =>
  a.date >= aujourdhui && a.status !== 'honoré' && a.status !== 'annulé';

/* ── ① LES CHIFFRES ET LEUR CALCUL ──────────────────────────────────── */
export const TRANCHES_D_ANCIENNETE: readonly { cle: string; nom: string; max: number }[] = [
  { cle: '7', nom: '0 à 7 jours', max: 7 },
  { cle: '30', nom: '8 à 30 jours', max: 30 },
  { cle: '90', nom: '31 à 90 jours', max: 90 },
  { cle: '+', nom: 'plus de 90 jours', max: Infinity },
];

/** LE RESTE À ENCAISSER PAR ANCIENNETÉ : depuis combien de jours le rituel a
    été rendu. Plus il est vieux, moins il rentre ; la dernière tranche se dit
    en alerte à l'écran. */
export function ancienneteDesCreances(creances: readonly { date: string; resteXof: number }[], aujourdhui: string): {
  tranches: { cle: string; nom: string; n: number; xof: number }[];
  n: number;
  xof: number;
} {
  const tranches = TRANCHES_D_ANCIENNETE.map((t) => ({ cle: t.cle, nom: t.nom, n: 0, xof: 0 }));
  for (const c of creances) {
    if (c.resteXof <= 0) continue;
    const age = Math.max(0, joursEntre(c.date, aujourdhui));
    const i = TRANCHES_D_ANCIENNETE.findIndex((t) => age <= t.max);
    tranches[i].n += 1;
    tranches[i].xof += c.resteXof;
  }
  return { tranches, n: tranches.reduce((s, t) => s + t.n, 0), xof: tranches.reduce((s, t) => s + t.xof, 0) };
}

/** Sous dix rendez-vous passés en un an, le taux ne dit rien : 90 %, comme
    la prévision du mois. */
export const TAUX_PAR_DEFAUT = 0.9;
export function tauxDHonneur(rdvs: readonly Pick<RdvLu, 'date' | 'status'>[], aujourdhui: string): { taux: number; honores: number; annules: number; peuDHistoire: boolean } {
  const ilYAUnAn = ajouteJours(aujourdhui, -365);
  const passes = rdvs.filter((a) => a.date >= ilYAUnAn && a.date < aujourdhui);
  const honores = passes.filter((a) => a.status === 'honoré').length;
  const annules = passes.filter((a) => a.status === 'annulé').length;
  const peuDHistoire = honores + annules < 10;
  return { taux: peuDHistoire ? TAUX_PAR_DEFAUT : honores / (honores + annules), honores, annules, peuDHistoire };
}

/** LE PROBABLE À VENIR : ce que les rendez-vous posés valent, au taux de
    venues honorées. Arrondi au millier. */
export const probable = (avenirXof: number, taux: number): number => Math.round((avenirXof * taux) / 1000) * 1000;

/* ── ② CE QUE LE TRÔNE VOIT SUR UN RENDEZ-VOUS ──────────────────────── */
export type CleDuSignal = 'dette' | 'acompte' | 'risque' | 'chevauche' | 'anniv';
export type Signal = { cle: CleDuSignal; dit: string; pourquoi: string; alerte: boolean };

/** CE QU'ELLE DOIT D'AVANT : les rituels déjà rendus (passés ou honorés),
    non annulés, qui gardent un reste. Le plus ancien sert au geste. */
export function dettesParCliente(rdvs: readonly RdvLu[], aujourdhui: string): Map<string, { xof: number; n: number; plusAncien: RdvLu }> {
  const m = new Map<string, { xof: number; n: number; plusAncien: RdvLu }>();
  for (const a of rdvs) {
    if (a.status === 'annulé' || estAVenir(a, aujourdhui) || a.resteXof <= 0) continue;
    const cur = m.get(a.clientId);
    if (!cur) m.set(a.clientId, { xof: a.resteXof, n: 1, plusAncien: a });
    else { cur.xof += a.resteXof; cur.n += 1; if (a.date < cur.plusAncien.date) cur.plusAncien = a; }
  }
  return m;
}

/** L'HISTOIRE D'UNE TÊTE : ses rendez-vous passés, honorés, annulés. */
export function historiqueParCliente(rdvs: readonly Pick<RdvLu, 'clientId' | 'date' | 'status'>[], aujourdhui: string): Map<string, { total: number; honores: number; annules: number }> {
  const m = new Map<string, { total: number; honores: number; annules: number }>();
  for (const a of rdvs) {
    if (a.date >= aujourdhui && a.status !== 'honoré' && a.status !== 'annulé') continue;
    const cur = m.get(a.clientId) ?? { total: 0, honores: 0, annules: 0 };
    cur.total += 1;
    if (a.status === 'honoré') cur.honores += 1;
    if (a.status === 'annulé') cur.annules += 1;
    m.set(a.clientId, cur);
  }
  return m;
}

/** LE RISQUE D'ABSENCE, SUR SON HISTORIQUE (choix du 25 octobre 2026) :
    au moins deux annulations et une sur trois de ses rendez-vous ; ou une
    première venue sans acompte reçu. « Pris la veille » s'ajoute à la raison,
    sans suffire seul. Le calcul se dit toujours ; aucune note inventée. */
export function risqueDAbsence(
  a: Pick<RdvLu, 'date' | 'depositConfirmed' | 'creeLe'>,
  h: { total: number; honores: number; annules: number } | undefined,
): { risque: boolean; raisons: string[] } {
  const histoire = h ?? { total: 0, honores: 0, annules: 0 };
  const raisons: string[] = [];
  if (histoire.annules >= 2 && histoire.annules * 3 >= histoire.total) raisons.push(`${histoire.annules} annulations sur ${histoire.total} rendez-vous`);
  if (histoire.honores === 0 && !a.depositConfirmed) raisons.push('première venue, sans acompte reçu');
  if (raisons.length && a.creeLe && a.creeLe.slice(0, 10) >= ajouteJours(a.date, -1)) raisons.push('pris la veille ou le jour même');
  return { risque: raisons.length > 0 && !(raisons.length === 1 && raisons[0].startsWith('pris')), raisons };
}

/** SANS ACOMPTE À 48 HEURES : un acompte demandé, pas reçu, pour un
    rendez-vous d'ici deux jours. */
export const sansAcompteA48h = (a: Pick<RdvLu, 'date' | 'status' | 'depositXof' | 'depositConfirmed'>, aujourdhui: string): boolean =>
  estAVenir(a, aujourdhui) && a.date <= ajouteJours(aujourdhui, 2) && (a.depositXof ?? 0) > 0 && !a.depositConfirmed;

/** LE PLUS DE TÊTES EN MÊME TEMPS PENDANT CE RENDEZ-VOUS (pas d'un quart
    d'heure), et l'heure où cela arrive. */
export function plusDeTetes(a: Pick<RdvLu, 'id' | 'time' | 'dureeMin'>, duJour: readonly Pick<RdvLu, 'id' | 'time' | 'dureeMin' | 'status'>[]): { tetes: number; heure: string } {
  const debut = minutes(a.time);
  const fin = debut + Math.max(15, a.dureeMin);
  let best = { tetes: 0, heure: a.time };
  for (let t = debut; t < fin; t += 15) {
    const n = duJour.filter((b) => b.status !== 'annulé' && minutes(b.time) <= t && minutes(b.time) + Math.max(15, b.dureeMin) > t).length;
    if (n > best.tetes) best = { tetes: n, heure: `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}` };
  }
  return best;
}

/** Son anniversaire tombe-t-il dans les sept jours qui suivent le rendez-vous
    (jour même compris) ? Rend le jour dit, ou null. */
export function anniversaireProche(dateRdv: string, mmjj: string | undefined): string | null {
  if (!mmjj || !/^\d{2}-\d{2}$/.test(mmjj)) return null;
  const annee = Number(dateRdv.slice(0, 4));
  for (const a of [annee, annee + 1]) {
    const iso = `${a}-${mmjj}`;
    const k = joursEntre(dateRdv, iso);
    if (k >= 0 && k <= 6) return `${Number(mmjj.slice(3, 5))} ${MOIS_COURTS[Number(mmjj.slice(0, 2)) - 1]}`;
  }
  return null;
}

export type ContexteDesSignaux = {
  aujourdhui: string;
  sieges: number;
  dettes: Map<string, { xof: number; n: number; plusAncien: RdvLu }>;
  historiques: Map<string, { total: number; honores: number; annules: number }>;
  duJour: (iso: string) => readonly RdvLu[];
  anniversaireDe: (clientId: string) => string | undefined;
  /** Un maître ne lit pas l'argent : le signal de la dette se tait. */
  sansPrix?: boolean;
};

/** LES SIGNAUX D'UN RENDEZ-VOUS À VENIR. Un rendez-vous passé n'en porte
    pas : on ne peut plus rien lui demander (règle du « à remplir »). */
export function signauxDuRdv(a: RdvLu, ctx: ContexteDesSignaux): Signal[] {
  if (!estAVenir(a, ctx.aujourdhui)) return [];
  const out: Signal[] = [];
  const dette = ctx.dettes.get(a.clientId);
  if (dette && !ctx.sansPrix) {
    out.push({ cle: 'dette', alerte: true, dit: `doit ${fmtXof(dette.xof)} d’avant`,
      pourquoi: `${dette.n} rituel${dette.n > 1 ? 's' : ''} déjà rendu${dette.n > 1 ? 's' : ''} reste${dette.n > 1 ? 'nt' : ''} à régler, le plus ancien du ${jourEnClair(dette.plusAncien.date)} : ${fmtXof(dette.xof)} en tout.` });
  }
  if (sansAcompteA48h(a, ctx.aujourdhui)) {
    out.push({ cle: 'acompte', alerte: true, dit: 'sans acompte', pourquoi: `Acompte demandé : ${fmtXof(a.depositXof ?? 0)}, pas encore reçu, pour un rendez-vous d’ici deux jours.` });
  }
  const r = risqueDAbsence(a, ctx.historiques.get(a.clientId));
  if (r.risque) out.push({ cle: 'risque', alerte: false, dit: 'risque d’absence', pourquoi: `${r.raisons.join(' ; ')}.` });
  if (ctx.sieges > 0) {
    const p = plusDeTetes(a, ctx.duJour(a.date));
    if (p.tetes > ctx.sieges) out.push({ cle: 'chevauche', alerte: true, dit: `${p.tetes} têtes / ${ctx.sieges} fauteuil${ctx.sieges > 1 ? 's' : ''}`, pourquoi: `À ${p.heure.replace(':', ' h ')}, ${p.tetes} rendez-vous se chevauchent pour ${ctx.sieges} fauteuil${ctx.sieges > 1 ? 's' : ''}.` });
  }
  const anniv = anniversaireProche(a.date, ctx.anniversaireDe(a.clientId));
  if (anniv) out.push({ cle: 'anniv', alerte: false, dit: `anniversaire le ${anniv}`, pourquoi: 'Date de naissance sur sa fiche.' });
  return out;
}

/** LE GESTE PROPOSÉ, UN SEUL, dans l'ordre de ce qui presse. */
export type CleDuGeste = 'ancien' | 'acompte' | 'deplacer' | 'appeler' | 'confirmer' | 'encaisser';
export function gesteDuRdv(a: RdvLu, signaux: readonly Signal[], aujourdhui: string, sansPrix = false): { cle: CleDuGeste; dit: string } | null {
  const a_ = (cle: CleDuSignal) => signaux.some((s) => s.cle === cle);
  if (estAVenir(a, aujourdhui)) {
    if (a_('dette') && !sansPrix) return { cle: 'ancien', dit: 'Encaisser l’ancien' };
    if (a_('acompte')) return { cle: 'acompte', dit: 'Demander l’acompte' };
    if (a_('chevauche')) return { cle: 'deplacer', dit: 'Déplacer' };
    if (a_('risque')) return { cle: 'appeler', dit: 'Appeler' };
    if (a.status === 'en attente') return { cle: 'confirmer', dit: 'Confirmer' };
    return null;
  }
  if (a.status !== 'annulé' && a.resteXof > 0 && !sansPrix) return { cle: 'encaisser', dit: 'Encaisser' };
  return null;
}

/* ── ③ CE QUI PRESSE ─────────────────────────────────────────────────── */
export type CleQuiPresse = CleDuSignal | 'remplir';
export function ceQuiPresse(
  aVenir: readonly { a: RdvLu; signaux: readonly Signal[] }[],
  remplir: number,
): { cle: CleQuiPresse; n: number; xof: number; dit: string; alerte: boolean }[] {
  const compte = (cle: CleDuSignal) => aVenir.filter((x) => x.signaux.some((s) => s.cle === cle));
  const dettes = compte('dette');
  const clientesQuiDoivent = new Set(dettes.map((x) => x.a.clientId));
  const lignes: { cle: CleQuiPresse; n: number; xof: number; dit: string; alerte: boolean }[] = [
    { cle: 'acompte', n: compte('acompte').length, xof: compte('acompte').reduce((s, x) => s + x.a.netXof, 0), dit: 'sans acompte à 48 h', alerte: true },
    { cle: 'dette', n: clientesQuiDoivent.size, xof: 0, dit: clientesQuiDoivent.size > 1 ? 'viennent en devant un ancien rituel' : 'vient en devant un ancien rituel', alerte: true },
    { cle: 'risque', n: compte('risque').length, xof: compte('risque').reduce((s, x) => s + x.a.netXof, 0), dit: 'risque d’absence', alerte: false },
    { cle: 'chevauche', n: compte('chevauche').length, xof: 0, dit: 'au-delà des fauteuils', alerte: true },
    { cle: 'remplir', n: remplir, xof: 0, dit: remplir > 1 ? 'fiches à remplir' : 'fiche à remplir', alerte: false },
  ];
  return lignes;
}

/* ── ④ LA RECHERCHE QUI COMPREND UNE PHRASE ─────────────────────────── */
export type PhraseComprise = {
  /** Ce qui reste pour chercher un nom. */
  nom: string;
  paiement?: 'impayé' | 'payé' | 'partiel';
  statut?: 'annulé' | 'honoré' | 'confirmé' | 'en attente';
  mois?: string;
  du?: string;
  au?: string;
  maitre?: string;
  /** LE PRÉNOM D'UN MAÎTRE QUI EST AUSSI CELUI D'UNE CLIENTE — 25 octobre
      2026 (« quand j'écris Brice, je ne vois toujours pas ses rendez-vous ») :
      le mot tapé garde les deux, ceux que Brice a tenus ET ceux de la cliente
      Brice. Sans cliente de ce nom, le mot reste un maître. */
  ouCliente?: string;
  sansAcompte?: boolean;
  /** Ce que le Carnet a compris, à montrer. */
  compris: string[];
};

const plie = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const MOTS_VIDES = new Set(['de', 'du', 'des', 'les', 'la', 'le', 'l', 'pour', 'en', 'avec', 'a', 'au', 'aux', 'chez', 'rdv', 'rendez', 'vous', 'rendez-vous', 'et', 'qui', 'sont', 'ceux', 'celles']);
const NOMS_DES_MOIS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
const NOMS_DES_JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOTS_DE_PAIEMENT: Record<string, PhraseComprise['paiement']> = { impaye: 'impayé', impayes: 'impayé', impayee: 'impayé', impayees: 'impayé', paye: 'payé', payes: 'payé', payee: 'payé', payees: 'payé', regle: 'payé', regles: 'payé', partiel: 'partiel', partiels: 'partiel' };
const MOTS_DE_STATUT: Record<string, PhraseComprise['statut']> = { annule: 'annulé', annules: 'annulé', annulee: 'annulé', annulees: 'annulé', honore: 'honoré', honores: 'honoré', honoree: 'honoré', honorees: 'honoré', confirme: 'confirmé', confirmes: 'confirmé', confirmee: 'confirmé', confirmees: 'confirmé' };
const NOMS_PAIEMENT: Record<string, string> = { impayé: 'Impayés', payé: 'Payés', partiel: 'Partiels' };
const NOMS_STATUT: Record<string, string> = { annulé: 'Annulés', honoré: 'Honorés', confirmé: 'Confirmés', 'en attente': 'En attente' };

/** COMPRENDRE UNE PHRASE : « impayés de septembre », « Team samedi », « sans
    acompte cette semaine », « Baké ». Ce qui n'est ni un mot d'état, ni un
    mois, ni un jour, ni un maître reste un nom à chercher. Le Carnet montre
    toujours ce qu'il a compris. */
export function comprendsLaPhrase(phrase: string, o: { aujourdhui: string; maitres: readonly string[]; clientes?: readonly string[] }): PhraseComprise {
  const r: PhraseComprise = { nom: '', compris: [] };
  let t = ` ${plie(phrase).replace(/[’']/g, ' ').replace(/[^a-z0-9 -]+/g, ' ')} `;
  const prend = (re: RegExp): boolean => { if (!re.test(t)) return false; t = t.replace(re, ' '); return true; };
  const lundi = (iso: string) => ajouteJours(iso, -((jourDeSemaine(iso) + 6) % 7));
  if (prend(/ sans acompte /)) { r.sansAcompte = true; r.compris.push('Sans acompte'); }
  if (prend(/ en attente /)) { r.statut = 'en attente'; }
  if (prend(/ aujourd ?hui /)) { r.du = r.au = o.aujourdhui; }
  else if (prend(/ apres-demain | apres demain /)) { r.du = r.au = ajouteJours(o.aujourdhui, 2); }
  else if (prend(/ demain /)) { r.du = r.au = ajouteJours(o.aujourdhui, 1); }
  else if (prend(/ (la )?semaine prochaine /)) { const l = ajouteJours(lundi(o.aujourdhui), 7); r.du = l; r.au = ajouteJours(l, 6); }
  else if (prend(/ cette semaine /)) { r.du = o.aujourdhui; r.au = ajouteJours(lundi(o.aujourdhui), 6); }
  const restes: string[] = [];
  const mots = t.split(/\s+/).filter(Boolean);
  for (let i = 0; i < mots.length; i++) {
    const m = mots[i];
    if (MOTS_VIDES.has(m)) continue;
    if (MOTS_DE_PAIEMENT[m]) { r.paiement = MOTS_DE_PAIEMENT[m]; continue; }
    if (MOTS_DE_STATUT[m]) { r.statut = MOTS_DE_STATUT[m]; continue; }
    const im = NOMS_DES_MOIS.indexOf(m);
    if (im >= 0) {
      const annee = /^\d{4}$/.test(mots[i + 1] ?? '') ? mots[++i] : o.aujourdhui.slice(0, 4);
      r.mois = `${annee}-${String(im + 1).padStart(2, '0')}`;
      continue;
    }
    const ij = NOMS_DES_JOURS.indexOf(m);
    if (ij >= 0 && !r.du) {
      const k = (ij - jourDeSemaine(o.aujourdhui) + 7) % 7;
      r.du = r.au = ajouteJours(o.aujourdhui, k);
      continue;
    }
    const maitre = o.maitres.find((x) => plie(x).split(/\s+/)[0] === m);
    if (maitre && !r.maitre) {
      r.maitre = maitre;
      if ((o.clientes ?? []).some((c) => plie(c).split(/\s+/).includes(m))) r.ouCliente = m;
      continue;
    }
    restes.push(m);
  }
  r.nom = restes.join(' ');
  if (r.paiement) r.compris.push(NOMS_PAIEMENT[r.paiement]);
  if (r.statut) r.compris.push(NOMS_STATUT[r.statut]);
  if (r.mois) r.compris.push(`${MOIS[Number(r.mois.slice(5, 7)) - 1].replace(/^./, (c) => c.toUpperCase())} ${r.mois.slice(0, 4)}`);
  if (r.du && r.au) r.compris.push(r.du === r.au ? jourEnClair(r.du).replace(/^./, (c) => c.toUpperCase()) : `Du ${jourEnClair(r.du)} au ${jourEnClair(r.au)}`);
  if (r.maitre) r.compris.push(r.ouCliente ? `Maître ou cliente : ${r.maitre}` : `Maître : ${r.maitre}`);
  if (r.nom) r.compris.push(`Cliente : ${r.nom}`);
  return r;
}

/** La phrase comprise garde-t-elle ce rendez-vous ? `payeDe` est le juge de
    règlement du Carnet (apptPayState) ; `nomDe` le nom de la cliente. */
export function gardeSelonLaPhrase(
  a: RdvLu,
  p: PhraseComprise,
  o: { payeDe: (a: RdvLu) => string; nomDe: (a: RdvLu) => string; aujourdhui: string },
): boolean {
  if (p.paiement && (a.status === 'annulé' || o.payeDe(a) !== p.paiement)) return false;
  if (p.statut && a.status !== p.statut) return false;
  if (p.mois && a.date.slice(0, 7) !== p.mois) return false;
  if (p.du && a.date < p.du) return false;
  if (p.au && a.date > p.au) return false;
  if (p.maitre && plie(a.master ?? '').split(/\s+/)[0] !== plie(p.maitre).split(/\s+/)[0]
    && !(p.ouCliente && plie(o.nomDe(a)).split(/\s+/).includes(p.ouCliente))) return false;
  if (p.sansAcompte && !((a.depositXof ?? 0) > 0 && !a.depositConfirmed && estAVenir(a, o.aujourdhui))) return false;
  if (p.nom && !plie(o.nomDe(a)).includes(p.nom)) return false;
  return true;
}

/** Une phrase « vide » (rien de compris) : le Carnet ne filtre pas. */
export const phraseVide = (p: PhraseComprise): boolean => p.compris.length === 0;
