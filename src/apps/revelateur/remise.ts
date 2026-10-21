import { jourACotonou, remiseDuJour, remisesAEcrire, type Remise } from './remise-pure';

/* LA REMISE QUI REVIENT, CE QUI VIT — 11 octobre 2026 (maquette validée,
   « construis », Yéman). Le bandeau du haut est posé par une ligne en ligne
   du gabarit, avant la barre, pour ne pas faire sauter la page. Ce module,
   chargé après, fait le reste :
     ① relit les offres au Trône (un simple fetch, sans la bibliothèque) :
        une offre éteinte entre deux constructions retire le bandeau, une
        offre nouvelle passe par la pastille, la fenêtre et le rappel ;
     ② la PASTILLE (le bord gauche au téléphone, l'onglet du bord droit sur
        ordinateur) paraît quand le bandeau a quitté l'écran, et s'efface
        quand le rappel de fin arrive ;
     ③ la FENÊTRE s'ouvre une fois par visite, à mi-page, sauf sur les pages
        dont le travail est un formulaire ; la pastille l'ouvre toujours ;
     ④ le RAPPEL redit l'offre dans la bande de fin, avant le pied.
   Sans offre du jour, rien. Sans base, la remise écrite dans la page. */

const ADRESSE = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '');
const CLEF = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const base = (chemin: string): string => import.meta.env.BASE_URL.replace(/\/$/, '') + chemin;
const DEJA_VUE = 'mnd_remise_fenetre';

function ecrites(): Remise[] {
  try { return JSON.parse(document.getElementById('remises')?.textContent ?? '[]') as Remise[]; } catch { return []; }
}

async function fraiches(): Promise<Remise[] | null> {
  if (!ADRESSE || !CLEF) return null;
  try {
    const delai = typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(6000) : undefined;
    const r = await fetch(`${ADRESSE}/rest/v1/documents?select=data&key=eq.mnd_offers`, {
      headers: { apikey: CLEF, Authorization: `Bearer ${CLEF}` }, signal: delai,
    });
    if (!r.ok) return null;
    const lignes = (await r.json()) as { data?: unknown }[];
    return remisesAEcrire(lignes[0]?.data);
  } catch {
    return null;
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, classe?: string, texte?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texte !== undefined) e.textContent = texte;
  return e;
}

const vuDansLaVisite = (r: Remise): boolean => { try { return sessionStorage.getItem(DEJA_VUE) === r.id; } catch { return false; } };
const noteLaVisite = (r: Remise): void => { try { sessionStorage.setItem(DEJA_VUE, r.id); } catch { /* sans stockage, une fenêtre par page vaut mieux qu'aucune règle */ } };

/** ④ Le rappel, dans la dernière bande de fin de la page. */
function rappelDeFin(r: Remise): HTMLElement | null {
  const appels = document.querySelectorAll<HTMLElement>('main section.appel');
  const appel = appels[appels.length - 1];
  const lieu = appel?.querySelector<HTMLElement>('.conteneur > div');
  if (!appel || !lieu) return null;
  const a = el('a', 'appel-remise');
  a.href = r.porte;
  a.dataset.mesure = 'parcours_choisi';
  a.dataset.parcours = r.parcours;
  a.dataset.sortie = 'remise-fin';
  a.append(el('span', '', `${r.titre} · `), el('b', '', r.code ? `${r.deal} · ${r.code}` : r.deal));
  /* La seconde moitié sur sa ligne au téléphone, sans point en tête (la feuille). */
  const quand = [r.court, r.auDit ? `jusqu’au ${r.auDit}` : ''].filter(Boolean).join(', ');
  const suite = quand ? el('span', 'appel-remise__quand', quand) : null;
  if (suite) a.append(suite);
  const fleche = el('span', 'appel-remise__fleche', '›');
  fleche.setAttribute('aria-hidden', 'true');
  (suite ?? a).append(fleche);
  lieu.append(a);
  return appel;
}

/** ③ La fenêtre de l'offre : un vrai <dialog>, qui garde le focus, se ferme
    à Échap, et rend la main à ce qui l'a ouverte.

    LA CARTE ÉPURÉE — 21 octobre 2026 (Yéman : « fais-le avec le design de
    Lacoste », puis la proposition B de la maquette 6y8uMiyb, « épurer, trop
    de textes »). D'un côté l'étiquette tissée de la Maison posée sur un piqué
    (rose pour Octobre Rose, sable pour les autres offres) ; de l'autre la
    date, le chiffre en grand, ce qu'il couvre, le code et un seul bouton.
    Plus de phrase « le code est déjà posé… · Voir les conditions » : elle l'a
    fait retirer ; le code reste posé d'office dans la réservation. */
function laFenetre(r: Remise): HTMLDialogElement {
  const d = el('dialog', 'remise-fenetre');
  if (/rose/i.test(`${r.id} ${r.titre}`)) d.classList.add('remise-fenetre--rose');
  if (r.deal.length > 9) d.classList.add('remise-fenetre--long');
  d.setAttribute('aria-labelledby', 'remise-titre');
  const fermer = el('button', 'remise-fenetre__fermer', '×');
  fermer.type = 'button';
  fermer.setAttribute('aria-label', 'Fermer');
  fermer.addEventListener('click', () => d.close());

  /* L'étiquette : le verrou de la Maison, puis l'offre et son année. */
  const vue = el('div', 'remise-fenetre__vue');
  const etiquette = el('div', 'remise-etiquette');
  const cadre = el('div', 'remise-etiquette__cadre');
  const verrou = el('img');
  verrou.src = base('/assets/verrous/verrou-couche-indigo.png');
  verrou.alt = 'Maison MND';
  verrou.width = 160;
  verrou.height = 50;
  const annee = /^(\d{4})/.exec(r.au)?.[1] ?? '';
  cadre.append(verrou, el('p', '', [r.titre, annee].filter(Boolean).join(' · ')));
  etiquette.append(cadre);
  vue.append(etiquette);

  const corps = el('div', 'remise-fenetre__corps');
  const sur = r.auDit ? `Jusqu’au ${r.auDit}` : r.tag;
  if (sur) corps.append(el('p', 'remise-fenetre__sur', sur));
  const h = el('h2', 'remise-fenetre__deal', r.deal);
  h.id = 'remise-titre';
  corps.append(h);
  if (r.court) corps.append(el('p', 'remise-fenetre__court', r.court.charAt(0).toLowerCase() + r.court.slice(1)));
  if (r.code) {
    const boite = el('div', 'remise-code');
    const code = el('b', '', r.code);
    const copier = el('button', '', 'Copier');
    copier.type = 'button';
    copier.setAttribute('aria-label', `Copier le code ${r.code}`);
    copier.addEventListener('click', () => {
      const fini = () => { copier.textContent = 'Copié'; window.setTimeout(() => { copier.textContent = 'Copier'; }, 1800); };
      const choisir = () => { const s = getSelection(); const plage = document.createRange(); plage.selectNodeContents(code); s?.removeAllRanges(); s?.addRange(plage); };
      try { void navigator.clipboard.writeText(r.code).then(fini, choisir); } catch { choisir(); }
    });
    boite.append(code, copier);
    corps.append(boite);
  }
  const bouton = el('a', 'remise-fenetre__bouton', r.bouton);
  bouton.href = r.porte;
  bouton.dataset.mesure = 'parcours_choisi';
  bouton.dataset.parcours = r.parcours;
  bouton.dataset.sortie = 'remise';
  corps.append(bouton);

  const carte = el('div', 'remise-fenetre__carte');
  carte.append(fermer, vue, corps);
  d.append(carte);
  /* Le voile ferme : un clic qui tombe sur le <dialog> lui-même, hors de son
     contenu, est un clic sur le fond. */
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  document.body.append(d);
  return d;
}

/** ② La pastille du bord. */
function laPastille(r: Remise): HTMLButtonElement {
  const b = el('button', 'remise-pastille');
  b.type = 'button';
  b.setAttribute('aria-haspopup', 'dialog');
  b.setAttribute('aria-label', `${r.titre}, ${r.deal}${r.code ? `, code ${r.code}` : ''} : voir l’offre`);
  b.append(el('span', '', r.deal), el('b', '', r.code || 'L’offre'));
  document.body.append(b);
  return b;
}

export async function monte(): Promise<void> {
  const noeud = document.getElementById('remises');
  if (!noeud) return;
  const fenetreAuto = noeud.dataset.fenetre === 'oui';
  const jour = jourACotonou();
  const lues = await fraiches();
  const r = remiseDuJour(lues ?? ecrites(), jour);
  const bande = document.querySelector<HTMLElement>('[data-remise-bande]');
  /* Le bandeau a été posé d'après la page ; la base a le dernier mot. */
  if (bande && (!r || bande.dataset.remiseBande !== r.id)) bande.remove();
  if (!r) return;

  const appel = rappelDeFin(r);
  const fenetre = laFenetre(r);
  const pastille = laPastille(r);
  const bandeLa = document.querySelector<HTMLElement>('[data-remise-bande]');

  let bandeVue = !!bandeLa && bandeLa.getBoundingClientRect().bottom > 0;
  let finVue = false;
  const maj = () => {
    const assezBas = bandeLa ? !bandeVue : window.scrollY > window.innerHeight * 0.6;
    pastille.classList.toggle('est-visible', assezBas && !finVue && !fenetre.open);
  };
  if ('IntersectionObserver' in window) {
    if (bandeLa) new IntersectionObserver((v) => { bandeVue = v.some((x) => x.isIntersecting); maj(); }).observe(bandeLa);
    const fin = appel ?? document.querySelector('footer');
    if (fin) new IntersectionObserver((v) => { finVue = v.some((x) => x.isIntersecting); maj(); }).observe(fin);
  }

  const ouvre = () => {
    if (fenetre.open) return;
    noteLaVisite(r);
    if (typeof fenetre.showModal === 'function') fenetre.showModal(); else fenetre.setAttribute('open', '');
    maj();
  };
  fenetre.addEventListener('close', maj);
  pastille.addEventListener('click', ouvre);

  /* À mi-page, une fois par visite, sur une page assez longue pour qu'une
     moitié veuille dire quelque chose ; jamais pendant qu'on écrit dans un
     champ, ni quand le volet « Nous joindre » est ouvert. */
  let attend = false;
  const guette = () => {
    if (attend) return;
    attend = true;
    requestAnimationFrame(() => {
      attend = false;
      maj();
      if (!fenetreAuto || vuDansLaVisite(r)) return;
      const haut = document.documentElement.scrollHeight;
      if (haut < window.innerHeight * 2.2) return;
      if (window.scrollY + window.innerHeight / 2 < haut / 2) return;
      const actif = document.activeElement;
      if (actif && /^(INPUT|TEXTAREA|SELECT)$/.test(actif.tagName)) return;
      if (document.getElementById('joindre-volet')?.hidden === false) return;
      ouvre();
    });
  };
  addEventListener('scroll', guette, { passive: true });
  maj();
}
