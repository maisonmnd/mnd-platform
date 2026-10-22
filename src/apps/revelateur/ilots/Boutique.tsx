import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  MAX_QTE, MOIS, RAYONS, articlesDuRayon, boutiqueOuverte, etatDeLArticle, moisAvant, moisDeLEdition, numeroValable,
  shortDe, shortVendable, titreDe, type ArticleLu, type Remise,
} from '../../../shared/boutique-pur';
import { commanderALaBoutique, motDuRefus, prevenirALArrivee, reglerLaCommande } from '../../../shared/boutique-serveur';
import { PUBLIC_KEY, payWithKkiapay } from '../../../shared/kkiapay-widget';
import { mesure } from '../mesure';

/* LA BOUTIQUE DE LA MAISON — 22 octobre 2026, maquette validée
   (https://claude.ai/artifact/8dE2BEatDd94pn2CfWZRaP). « Construis la boutique
   de la Maison avec ses produits », puis « rajoute la collection des habits
   MND kids et les t-shirts de la marque » (Yéman).

   CE QUE L'ÎLOT LIT, SANS COMPTE : le document `mnd_vitrine_config` (la date
   d'ouverture, la branche), `mnd_settings` (les frais de livraison) et la
   table `catalog_products` (les produits qui portent une fiche `boutique`).
   Trois lectures par simple fetch : la bibliothèque Supabase ne se charge
   pas pour une vitrine.

   AVANT L'OUVERTURE, RIEN NE SE MONTRE : « La boutique ne sera visible que dès
   cet instant » (Yéman). La page renvoie à l'accueil, sans un produit ni un
   prix. CE QUE LA MAISON VEND, ce qui est « Bientôt », ce qui est hors saison :
   tout se décide dans shared/boutique-pur.ts, le juge commun au site, à Ma
   Couronne, au Trône et à la fonction `boutique`. Le prix d'une commande se
   refait au serveur : ce que montre la page n'est qu'un affichage. */

const ADRESSE = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '');
const CLEF = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const base = (chemin: string): string => import.meta.env.BASE_URL.replace(/\/$/, '') + chemin;
const image = (fichier: string | undefined): string => (fichier ? base(`/assets/boutique/${fichier}`) : '');
const PANIER = 'mnd_boutique_panier';

const prix = (n: number): string => `${Math.round(n).toLocaleString('fr-FR').replace(/[  ]/g, ' ')} F`;

type Ligne = { id: string; qte: number; taille?: string; perso?: string };
const cleDe = (l: { id: string; taille?: string; perso?: string }): string => [l.id, l.taille ?? '', l.perso ?? ''].join('|');
/* Dans le panier, un t-shirt de la Maison ou de MND 229 dit ce qu'il est :
   « Le t-shirt L'Allover » à côté de « Le short L'Allover ». */
const nomDeLigne = (a: ArticleLu): string =>
  !a.boutique?.shortDe && (a.boutique?.rayon === 'maison' || a.boutique?.rayon === 'mnd229') ? `Le t-shirt ${titreDe(a)}` : titreDe(a);

async function lis<T>(chemin: string): Promise<T> {
  if (!ADRESSE || !CLEF) throw new Error('sans base');
  const delai = typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(9000) : undefined;
  const r = await fetch(`${ADRESSE}/rest/v1/${chemin}`, { headers: { apikey: CLEF, Authorization: `Bearer ${CLEF}` }, signal: delai });
  if (!r.ok) throw new Error(`lecture ${r.status}`);
  return (await r.json()) as T;
}

type Vitrine = { ouverture?: string; branchId: string; fraisXof: number; articles: ArticleLu[] };

async function chargeLaVitrine(): Promise<Vitrine> {
  const docs = await lis<{ key: string; data?: Record<string, unknown> }[]>('documents?select=key,data&key=in.(mnd_vitrine_config,mnd_settings)');
  const cfg = (docs.find((d) => d.key === 'mnd_vitrine_config')?.data ?? {}) as { branchId?: string; boutique?: { ouverture?: string } };
  const reglages = (docs.find((d) => d.key === 'mnd_settings')?.data ?? {}) as { deliveryFeeXof?: number };
  const ouverture = cfg.boutique?.ouverture;
  const frais = Number(reglages.deliveryFeeXof);
  const vitrine: Vitrine = { ouverture, branchId: String(cfg.branchId ?? ''), fraisXof: Number.isFinite(frais) ? frais : 2000, articles: [] };
  /* FERMÉE : on ne lit même pas le catalogue. */
  if (!boutiqueOuverte(ouverture, new Date())) return vitrine;
  /* Par pages de mille : la base n'en rend jamais plus d'un coup. */
  for (let de = 0; de < 20000; de += 1000) {
    const page = await lis<{ id: string; data?: Record<string, unknown> }[]>(`catalog_products?select=id,data&data->boutique=not.is.null&order=id&offset=${de}&limit=1000`);
    for (const r of page) {
      const d = (r.data ?? {}) as Partial<ArticleLu>;
      if (!d.boutique) continue;
      vitrine.articles.push({ id: r.id, name: String(d.name ?? ''), priceXof: Math.round(Number(d.priceXof) || 0), stock: Math.round(Number(d.stock) || 0), boutique: d.boutique });
    }
    if (page.length < 1000) break;
  }
  return vitrine;
}

function litLePanier(): Ligne[] {
  try {
    const v = JSON.parse(localStorage.getItem(PANIER) ?? '[]') as unknown;
    return Array.isArray(v) ? (v as Ligne[]).filter((l) => l && typeof l.id === 'string' && l.qte > 0) : [];
  } catch { return []; }
}
function gardeLePanier(lignes: Ligne[]): void {
  try { localStorage.setItem(PANIER, JSON.stringify(lignes)); } catch { /* sans stockage, le panier vit le temps de la page */ }
}

/* ── Un volet : la fiche, le panier, « Me prévenir » ─────────────────────
   Un vrai dialogue : le focus y entre, Échap le ferme et rend le focus au
   bouton qui l'a ouvert, la page dessous ne défile plus. */
function Volet({ titre, sur, onFerme, children }: { titre: string; sur: string; onFerme: () => void; children: ReactNode }) {
  const fermer = useRef<HTMLButtonElement>(null);
  /* Le geste de fermeture change à chaque rendu du parent : on le garde dans
     une référence, pour que le focus ne saute pas au bouton à chaque touche. */
  const ferme = useRef(onFerme);
  ferme.current = onFerme;
  useEffect(() => {
    const avant = document.activeElement as HTMLElement | null;
    const defile = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    fermer.current?.focus();
    const touche = (e: KeyboardEvent) => { if (e.key === 'Escape') ferme.current(); };
    addEventListener('keydown', touche);
    return () => { removeEventListener('keydown', touche); document.body.style.overflow = defile; avant?.focus?.(); };
  }, []);
  const id = useMemo(() => `bq-volet-${Math.random().toString(36).slice(2, 8)}`, []);
  return (
    <div className="bq-voile" onClick={(e) => { if (e.target === e.currentTarget) onFerme(); }}>
      <div className="bq-volet" role="dialog" aria-modal="true" aria-labelledby={id}>
        <div className="bq-volet__tete">
          <span className="bq-sur">{sur}</span>
          <button ref={fermer} type="button" className="bq-fermer" onClick={onFerme} aria-label="Fermer">×</button>
        </div>
        <h2 id={id} className="bq-cache">{titre}</h2>
        {children}
      </div>
    </div>
  );
}

function Pas({ q, nom, plus, moins }: { q: number; nom: string; plus: () => void; moins: () => void }) {
  return (
    <span className="bq-pas">
      <button type="button" onClick={moins} aria-label={`Retirer un ${nom}`}>−</button>
      <span aria-live="polite">{q}</span>
      <button type="button" onClick={plus} disabled={q >= MAX_QTE} aria-label={`Ajouter un ${nom}`}>+</button>
    </span>
  );
}

type Piece = 't-shirt' | 'short' | 'tenue';
const MORCEAUX: Record<Piece, string> = { 't-shirt': 'Le t-shirt', short: 'Le short', tenue: 'La tenue' };
type Face = 'devant' | 'dos' | 'short';

export default function Boutique() {
  const [vitrine, setVitrine] = useState<Vitrine | null>(null);
  const [panne, setPanne] = useState(false);
  const [filtre, setFiltre] = useState<'tout' | string>('tout');
  const [panier, setPanier] = useState<Ligne[]>(() => litLePanier());
  const [fiche, setFiche] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState<'panier' | 'prevenir' | null>(null);
  const [aPrevenir, setAPrevenir] = useState<string | null>(null);

  useEffect(() => {
    let vivant = true;
    chargeLaVitrine().then((v) => {
      if (!vivant) return;
      /* « La boutique ne sera visible que dès cet instant » : fermée, la page
         s'efface au profit de l'accueil, sans laisser d'entrée dans l'historique. */
      if (!boutiqueOuverte(v.ouverture, new Date())) { location.replace(base('/')); return; }
      setVitrine(v);
    }).catch(() => { if (vivant) setPanne(true); });
    return () => { vivant = false; };
  }, []);

  useEffect(() => { gardeLePanier(panier); }, [panier]);

  const maintenant = useMemo(() => new Date(), [vitrine]);
  const articles = vitrine?.articles ?? [];
  const parId = useMemo(() => new Map(articles.map((a) => [a.id, a])), [articles]);
  /* Le panier ne garde que ce qui se vend encore : un article retiré entre
     deux visites disparaît sans bruit. */
  const lignes = useMemo(() => panier.filter((l) => {
    const a = parId.get(l.id);
    if (!a?.boutique) return false;
    const tshirt = a.boutique.shortDe ? parId.get(a.boutique.shortDe) : undefined;
    return a.boutique.shortDe ? !!tshirt && shortVendable(a, tshirt, maintenant) : etatDeLArticle(a, maintenant) === 'vendable';
  }), [panier, parId, maintenant]);
  const nombre = lignes.reduce((n, l) => n + l.qte, 0);
  const sousTotal = lignes.reduce((n, l) => n + (parId.get(l.id)?.priceXof ?? 0) * l.qte, 0);

  const ajoute = (l: Omit<Ligne, 'qte'>, qte = 1) => setPanier((p) => {
    const k = cleDe(l);
    const deja = p.find((x) => cleDe(x) === k);
    if (deja) return p.map((x) => (cleDe(x) === k ? { ...x, qte: Math.min(MAX_QTE, x.qte + qte) } : x));
    return [...p, { ...l, qte }];
  });
  const retire = (k: string) => setPanier((p) => p.flatMap((x) => (cleDe(x) === k ? (x.qte > 1 ? [{ ...x, qte: x.qte - 1 }] : []) : [x])));
  const vide = () => setPanier([]);

  if (panne) {
    return (
      <div className="bq-panne">
        <p className="corps">La Boutique ne s’affiche pas pour l’instant. Réessayez dans un moment, ou écrivez à la Maison sur WhatsApp.</p>
      </div>
    );
  }
  if (!vitrine) return <div className="bq-attente" aria-busy="true"><p className="corps">La Boutique se prépare…</p></div>;

  const rayons = RAYONS.map((r) => ({ r, ici: articlesDuRayon(articles, r.id, maintenant) })).filter((x) => x.ici.length > 0);
  const montres = filtre === 'tout' ? rayons : rayons.filter((x) => x.r.id === filtre);
  const ficheArticle = fiche ? parId.get(fiche) : undefined;

  const bouton = (a: ArticleLu) => {
    const etat = etatDeLArticle(a, maintenant);
    if (etat === 'bientot') return <button type="button" className="bq-btn bq-btn--clair" onClick={() => { setAPrevenir(a.id); setOuvert('prevenir'); }}>Me prévenir</button>;
    if (a.boutique?.tailles?.length) return <button type="button" className="bq-btn" onClick={() => setFiche(a.id)}>Choisir la taille</button>;
    const k = cleDe({ id: a.id });
    const q = panier.find((x) => cleDe(x) === k)?.qte ?? 0;
    if (q > 0) return <Pas q={q} nom={titreDe(a)} plus={() => ajoute({ id: a.id })} moins={() => retire(k)} />;
    return <button type="button" className="bq-btn" onClick={() => ajoute({ id: a.id })}>Ajouter</button>;
  };

  return (
    <div className="bq">
      <div className="bq-remises" aria-label="Comment la commande vous arrive">
        <span>Retrait à la Maison, offert</span>
        <span>Livraison dans Cotonou, {prix(vitrine.fraisXof)}</span>
        <span>Réglé par KkiaPay, ou au retrait</span>
      </div>
      {rayons.length > 1 && (
        <div className="bq-puces" role="group" aria-label="Choisir un rayon">
          <button type="button" className="bq-puce" aria-pressed={filtre === 'tout'} onClick={() => setFiltre('tout')}>Tout</button>
          {rayons.map(({ r }) => (
            <button key={r.id} type="button" className="bq-puce" aria-pressed={filtre === r.id} onClick={() => setFiltre(r.id)}>{r.filtre}</button>
          ))}
        </div>
      )}
      {rayons.length === 0 && <p className="corps">Les premiers articles arrivent. Revenez très vite.</p>}
      {montres.map(({ r, ici }) => (
        <section key={r.id} className="bq-rayon" aria-labelledby={`bq-r-${r.id}`}>
          <h2 id={`bq-r-${r.id}`} className="bq-rayon__titre">{r.titre}<small>{r.dit}</small></h2>
          <div className="bq-grille">
            {ici.map((a) => {
              const f = a.boutique!;
              const etat = etatDeLArticle(a, maintenant);
              return (
                <article key={a.id} className={`bq-carte${f.tailles?.length ? ' bq-carte--habit' : ''}`}>
                  <button type="button" className="bq-carte__vue" onClick={() => setFiche(a.id)} aria-label={`Voir ${titreDe(a)}`}>
                    <img src={image(f.image)} alt="" loading="lazy" decoding="async" width="800" height="800" />
                    {etat === 'bientot'
                      ? <span className="bq-pastille bq-pastille--bientot">Bientôt</span>
                      : f.edition ? <span className="bq-pastille">{f.edition}</span> : null}
                  </button>
                  <div className="bq-carte__corps">
                    <span className="bq-rythme">{r.court}</span>
                    <h3>{titreDe(a)}</h3>
                    <p className="bq-carte__ligne">{f.usage}</p>
                    <div className="bq-carte__pied">
                      <span><span className="bq-format">{f.format}</span><br />{a.priceXof > 0 ? <span className="bq-prix">{prix(a.priceXof)}</span> : <span className="bq-prix bq-prix--vide">Bientôt</span>}</span>
                      {bouton(a)}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}

      {nombre > 0 && !ouvert && !fiche && (
        <div className="bq-barre">
          <span><b>{nombre > 1 ? `${nombre} articles` : '1 article'}</b> · {prix(sousTotal)}</span>
          <button type="button" className="bq-btn bq-btn--cuivre" onClick={() => setOuvert('panier')}>Voir le panier</button>
        </div>
      )}

      {ficheArticle && (
        <Fiche
          a={ficheArticle}
          tous={articles}
          maintenant={maintenant}
          fraisXof={vitrine.fraisXof}
          panier={panier}
          onAjoute={ajoute}
          onRetire={retire}
          onPrevenir={() => { setAPrevenir(ficheArticle.id); setFiche(null); setOuvert('prevenir'); }}
          onPanier={() => { setFiche(null); setOuvert('panier'); }}
          onFerme={() => setFiche(null)}
        />
      )}
      {ouvert === 'prevenir' && aPrevenir && parId.get(aPrevenir) && (
        <Prevenir a={parId.get(aPrevenir)!} onFerme={() => setOuvert(null)} />
      )}
      {ouvert === 'panier' && (
        <Panier
          lignes={lignes}
          parId={parId}
          vitrine={vitrine}
          onAjoute={(l) => ajoute(l)}
          onRetire={retire}
          onVide={vide}
          onFerme={() => setOuvert(null)}
        />
      )}
    </div>
  );
}

/* ── La fiche ─────────────────────────────────────────────────────────── */
function Fiche({ a, tous, maintenant, fraisXof, panier, onAjoute, onRetire, onPrevenir, onPanier, onFerme }: {
  a: ArticleLu; tous: ArticleLu[]; maintenant: Date; fraisXof: number; panier: Ligne[];
  onAjoute: (l: Omit<Ligne, 'qte'>) => void; onRetire: (k: string) => void; onPrevenir: () => void; onPanier: () => void; onFerme: () => void;
}) {
  const f = a.boutique!;
  const etat = etatDeLArticle(a, maintenant);
  const leShort = shortDe(tous, a.id);
  const avecShort = !!leShort && shortVendable(leShort, a, maintenant);
  const kids = f.rayon === 'kids';
  const habit = !!f.tailles?.length;
  const [face, setFace] = useState<Face>('devant');
  const [piece, setPiece] = useState<Piece>('t-shirt');
  const [taille, setTaille] = useState('');
  const [perso, setPerso] = useState('');
  const [fait, setFait] = useState('');
  const mois = moisDeLEdition(f.edition);
  const faces: Face[] = (['devant', 'dos', 'short'] as Face[]).filter((x) => x === 'devant' || (x === 'dos' ? !!f.dos : !!f.short && avecShort));
  const src = face === 'dos' ? f.dos : face === 'short' ? f.short : f.image;
  const prixPiece = piece === 'short' ? leShort?.priceXof ?? 0 : piece === 'tenue' ? a.priceXof + (leShort?.priceXof ?? 0) : a.priceXof;
  const pret = !!taille && (!f.perso || perso.trim() !== '');
  const k = cleDe({ id: a.id });
  const q = panier.find((x) => cleDe(x) === k)?.qte ?? 0;

  const ajouteHabit = () => {
    if (!pret) return;
    const nom = f.perso ? perso.trim().slice(0, 24) : undefined;
    const ids = piece === 'short' && leShort ? [leShort.id] : piece === 'tenue' && leShort ? [a.id, leShort.id] : [a.id];
    for (const id of ids) onAjoute({ id, taille, ...(nom ? { perso: nom } : {}) });
    setFait(`Ajouté : ${avecShort ? `${MORCEAUX[piece].toLowerCase()} ` : ''}${titreDe(a)}, ${taille}${nom ? ` · « ${nom} »` : ''}.`);
  };

  return (
    <Volet titre={titreDe(a)} sur={kids ? 'MND Kids' : f.rayon === 'mnd229' ? 'MND 229 · la ligne du Bénin' : f.rayon === 'maison' ? 'Le Vestiaire de la Maison' : RAYONS.find((r) => r.id === f.rayon)?.titre ?? 'La Boutique'} onFerme={onFerme}>
      <div className={`bq-scene${habit ? ' bq-scene--habit' : ''}`}>
        <img src={image(src)} alt={`${titreDe(a)}, ${face === 'dos' ? 'le dos' : face === 'short' ? 'le short' : 'le devant'}`} />
        {faces.length > 1 && (
          <div className="bq-faces" role="group" aria-label="Voir">
            {faces.map((x) => (
              <button key={x} type="button" aria-pressed={face === x} onClick={() => setFace(x)}>{x === 'devant' ? 'Devant' : x === 'dos' ? 'Dos' : 'Short'}</button>
            ))}
          </div>
        )}
      </div>
      <div className="bq-fiche">
        <h3 className="bq-fiche__titre">{titreDe(a)}</h3>
        {f.sous && <p className="bq-fiche__sous">{f.sous}</p>}
        {f.edition && <p className="bq-edition">{f.edition}</p>}
        <dl>
          {habit ? (
            <>
              <dt>Devant</dt><dd>{f.usage}</dd>
              {f.dos && f.detail && !kids && <><dt>Dos</dt><dd>{f.detail}</dd></>}
              {kids && f.detail && <><dt>Matière</dt><dd>{f.detail}</dd></>}
              <dt>{kids ? 'Pour' : 'Tailles'}</dt><dd>{f.format}</dd>
              {avecShort && <><dt>Short</dt><dd>Assorti, vendu seul ou avec le t-shirt.</dd></>}
            </>
          ) : (
            <>
              <dt>Format</dt><dd>{f.format}</dd>
              <dt>Usage</dt><dd>{f.usage}</dd>
              {f.detail && <><dt>Le flacon</dt><dd>{f.detail}</dd></>}
              <dt>Rythme</dt><dd>{RAYONS.find((r) => r.id === f.rayon)?.dit ?? ''}</dd>
            </>
          )}
        </dl>
        {mois > 0 && <p className="bq-note">En vente en {moisAvant(mois)} et en {MOIS[mois - 1]} seulement.</p>}

        {etat === 'bientot' ? (
          <>
            <div className="bq-achat">{a.priceXof > 0 ? <span className="bq-prix">{prix(a.priceXof)}</span> : <span className="bq-prix bq-prix--vide">Bientôt</span>}<button type="button" className="bq-btn bq-btn--clair" onClick={onPrevenir}>Me prévenir</button></div>
            <p className="bq-note">Pas encore là. « Me prévenir » : la Maison vous écrit une fois, le jour où il arrive.</p>
          </>
        ) : habit ? (
          <>
            {avecShort && (
              <fieldset className="bq-choix">
                <legend>Ce que vous prenez</legend>
                <div>{(Object.keys(MORCEAUX) as Piece[]).map((m) => (
                  <button key={m} type="button" className="bq-taille" aria-pressed={piece === m} onClick={() => { setPiece(m); setFace(m === 'short' ? 'short' : 'devant'); setFait(''); }}>{MORCEAUX[m]}</button>
                ))}</div>
              </fieldset>
            )}
            <fieldset className="bq-choix">
              <legend>{kids ? 'Son âge' : 'Votre taille'}</legend>
              <div>{f.tailles!.map((t) => (
                <button key={t} type="button" className="bq-taille" aria-pressed={taille === t} onClick={() => { setTaille(t); setFait(''); }}>{t}</button>
              ))}</div>
            </fieldset>
            {f.perso && (
              <div className="bq-champ">
                <label htmlFor="bq-perso">Son nom de couronne, celui de son carnet</label>
                <input id="bq-perso" maxLength={24} value={perso} onChange={(e) => { setPerso(e.target.value); setFait(''); }} placeholder="le Lion du matin" />
                <span className="bq-note">Jamais son vrai prénom, sauf si vous le demandez. Brodé ou imprimé à la Maison.</span>
              </div>
            )}
            <div className="bq-achat">
              {prixPiece > 0 ? <span className="bq-prix">{prix(prixPiece)}</span> : <span className="bq-prix bq-prix--vide">Bientôt</span>}
              <button type="button" className="bq-btn" disabled={!pret} onClick={ajouteHabit}>Ajouter au panier</button>
            </div>
            {fait
              ? <p className="bq-note bq-note--ok" role="status">{fait} <button type="button" className="bq-lien" onClick={onPanier}>Voir le panier</button></p>
              : <p className="bq-note">{pret ? `Retrait à la Maison offert. Livraison dans Cotonou : ${prix(fraisXof)}.` : `${kids ? 'Choisissez son âge' : 'Choisissez votre taille'}${f.perso ? ', puis son nom de couronne.' : '.'}`}</p>}
          </>
        ) : (
          <>
            <div className="bq-achat">
              <span className="bq-prix">{prix(a.priceXof)}</span>
              {q > 0 ? <Pas q={q} nom={titreDe(a)} plus={() => onAjoute({ id: a.id })} moins={() => onRetire(k)} /> : <button type="button" className="bq-btn" onClick={() => onAjoute({ id: a.id })}>Ajouter</button>}
            </div>
            <p className="bq-note">{q > 0 ? <>Dans votre panier. <button type="button" className="bq-lien" onClick={onPanier}>Voir le panier</button></> : `Retrait à la Maison offert. Livraison dans Cotonou : ${prix(fraisXof)}.`}</p>
          </>
        )}
      </div>
    </Volet>
  );
}

/* ── Me prévenir ──────────────────────────────────────────────────────── */
function Prevenir({ a, onFerme }: { a: ArticleLu; onFerme: () => void }) {
  const [numero, setNumero] = useState('');
  const [nom, setNom] = useState('');
  const [etat, setEtat] = useState<'' | 'envoi' | 'ok' | string>('');
  const envoie = async () => {
    if (!numeroValable(numero)) { setEtat(motDuRefus('coordonnees')); return; }
    setEtat('envoi');
    const r = await prevenirALArrivee(a.id, numero, nom.trim() || undefined);
    if (r.ok) { setEtat('ok'); mesure('boutique_prevenir', { genre: a.id }); } else setEtat(motDuRefus(r.error));
  };
  return (
    <Volet titre={titreDe(a)} sur="Bientôt" onFerme={onFerme}>
      <div className="bq-fiche">
        <h3 className="bq-fiche__titre">{titreDe(a)}</h3>
        {etat === 'ok' ? (
          <p className="bq-note bq-note--ok" role="status">C’est noté. La Maison vous écrit sur WhatsApp le jour où il arrive, une seule fois.</p>
        ) : (
          <>
            <p className="bq-note">Il n’est pas encore là. Laissez votre numéro : la Maison vous écrit une fois, le jour où il arrive, et plus jamais ensuite pour cet article.</p>
            <div className="bq-champ"><label htmlFor="bq-prev-nom">Votre nom (facultatif)</label><input id="bq-prev-nom" autoComplete="name" value={nom} onChange={(e) => setNom(e.target.value)} /></div>
            <div className="bq-champ"><label htmlFor="bq-prev-num">Votre numéro WhatsApp</label><input id="bq-prev-num" inputMode="tel" autoComplete="tel" placeholder="01 XX XX XX XX" value={numero} onChange={(e) => setNumero(e.target.value)} /></div>
            <button type="button" className="bq-btn" disabled={etat === 'envoi'} onClick={() => void envoie()}>{etat === 'envoi' ? 'Un instant…' : 'Me prévenir'}</button>
            {etat && etat !== 'envoi' && <p className="bq-erreur" role="alert">{etat}</p>}
          </>
        )}
      </div>
    </Volet>
  );
}

/* ── Le panier ────────────────────────────────────────────────────────── */
type Ecrite = { commandeId: string; totalXof: number; reference: string; branchId: string };

function Panier({ lignes, parId, vitrine, onAjoute, onRetire, onVide, onFerme }: {
  lignes: Ligne[]; parId: Map<string, ArticleLu>; vitrine: Vitrine;
  onAjoute: (l: Omit<Ligne, 'qte'>) => void; onRetire: (k: string) => void; onVide: () => void; onFerme: () => void;
}) {
  const [remise, setRemise] = useState<Remise>('retrait');
  const [adresse, setAdresse] = useState('');
  const [nom, setNom] = useState('');
  const [numero, setNumero] = useState('');
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);
  /* La commande déjà écrite pour un paiement en ligne : rouvrir KkiaPay la
     reprend, sans en écrire une seconde. */
  const [ecrite, setEcrite] = useState<Ecrite | null>(null);
  const [fin, setFin] = useState<null | { enLigne: boolean; totalXof: number; remise: Remise; prenom: string; aVerifier?: boolean }>(null);

  const produits = lignes.reduce((n, l) => n + (parId.get(l.id)?.priceXof ?? 0) * l.qte, 0);
  const frais = remise === 'livraison' ? vitrine.fraisXof : 0;
  const peutPayer = PUBLIC_KEY !== '' && !!vitrine.branchId;

  const manque = (): string => {
    if (!lignes.length) return 'Le panier est vide.';
    if (!nom.trim() || !numeroValable(numero)) return motDuRefus('coordonnees');
    if (remise === 'livraison' && !adresse.trim()) return motDuRefus('adresse');
    return '';
  };
  const commande = (paiement: 'kkiapay' | 'maison') => commanderALaBoutique({
    lignes: lignes.map((l) => ({ id: l.id, qte: l.qte, ...(l.taille ? { taille: l.taille } : {}), ...(l.perso ? { perso: l.perso } : {}) })),
    remise, adresse: remise === 'livraison' ? adresse.trim() : undefined, nom: nom.trim(), numero: numero.trim(), paiement, origine: 'site',
  });
  const prenom = nom.trim().split(/\s+/)[0] ?? '';

  const auRetrait = async () => {
    if (envoi) return;
    const m = manque(); if (m) { setErreur(m); return; }
    setErreur(''); setEnvoi(true);
    try {
      /* Une commande déjà écrite pour KkiaPay est à la Maison : on ne la
         double pas, elle se réglera au retrait. */
      if (ecrite) { setFin({ enLigne: false, totalXof: ecrite.totalXof, remise, prenom }); onVide(); return; }
      const r = await commande('maison');
      if (!r.ok || !r.commandeId) { setErreur(motDuRefus(r.error)); return; }
      mesure('boutique_commande', { genre: remise });
      setFin({ enLigne: false, totalXof: Number(r.totalXof) || produits + frais, remise, prenom });
      onVide();
    } finally { setEnvoi(false); }
  };

  const enLigne = async () => {
    if (envoi) return;
    const m = manque(); if (m) { setErreur(m); return; }
    setErreur(''); setEnvoi(true);
    try {
      let c = ecrite;
      if (!c) {
        const r = await commande('kkiapay');
        if (!r.ok || !r.commandeId || !r.reference) { setErreur(motDuRefus(r.error)); return; }
        c = { commandeId: r.commandeId, totalXof: Number(r.totalXof) || 0, reference: r.reference, branchId: r.branchId || vitrine.branchId };
        setEcrite(c);
      }
      mesure('boutique_paiement_ouvert', { genre: remise });
      /* La promesse de KkiaPay ne se tient que sur un paiement abouti :
         fermer sa fenêtre laisse l'écran tel quel, avec ses deux portes. */
      const { transactionId } = await payWithKkiapay({ amountXof: c.totalXof, partnerId: c.reference, branchId: c.branchId, phone: numero, name: nom.trim() || undefined });
      const v = await reglerLaCommande(c.commandeId, transactionId);
      mesure('boutique_reglee', { genre: remise });
      setFin({ enLigne: true, totalXof: c.totalXof, remise, prenom, aVerifier: !v.ok });
      onVide();
    } catch (x) {
      setErreur(x instanceof Error ? x.message : 'Le paiement n’a pas abouti.');
    } finally { setEnvoi(false); }
  };

  if (fin) {
    const salut = fin.prenom ? `Bonjour ${fin.prenom},` : 'Bonjour,';
    const mot = fin.remise === 'livraison'
      ? `${salut} votre commande Maison MND part aujourd’hui. Le livreur vous appelle avant d’arriver.${fin.enLigne ? '' : ` Total à régler à la livraison : ${prix(fin.totalXof)}.`}`
      : `${salut} votre commande Maison MND est prête. Elle vous attend à l’accueil.${fin.enLigne ? '' : ` Total à régler au retrait : ${prix(fin.totalXof)}.`}`;
    return (
      <Volet titre="Merci. La Maison a votre commande." sur={fin.enLigne ? 'Réglée par KkiaPay' : 'Commande reçue'} onFerme={onFerme}>
        <div className="bq-fiche" role="status">
          <h3 className="bq-fiche__titre">Merci. La Maison a votre commande.</h3>
          <p className="bq-note">
            {fin.enLigne ? (fin.aVerifier ? 'Le paiement est reçu ; la Maison le confirme dans un instant. ' : 'Le paiement est confirmé. ') : 'Rien n’est à régler maintenant. '}
            Vous recevrez un seul message WhatsApp, quand elle sera {fin.remise === 'livraison' ? 'en route' : 'prête'}.
          </p>
          <p className="bq-sur">Le message que vous recevrez</p>
          <div className="bq-bulle">{mot}<small>Maison MND</small></div>
          <button type="button" className="bq-btn bq-btn--clair" onClick={onFerme}>Revenir à la Boutique</button>
        </div>
      </Volet>
    );
  }

  return (
    <Volet titre="Votre panier" sur="Votre panier" onFerme={onFerme}>
      <div className="bq-panier">
        <h3 className="bq-fiche__titre">Votre panier</h3>
        {!lignes.length ? <p className="bq-note">Le panier est vide. Ajoutez un article depuis la Boutique.</p> : (
          <>
            <ul className="bq-lignes">
              {lignes.map((l) => {
                const a = parId.get(l.id)!;
                const k = cleDe(l);
                const tshirt = a.boutique?.shortDe ? parId.get(a.boutique.shortDe) : undefined;
                const vue = a.boutique?.image ?? tshirt?.boutique?.short;
                return (
                  <li key={k}>
                    <img src={image(vue)} alt="" width="56" height="56" />
                    <div>
                      <div className="bq-ligne__nom">{nomDeLigne(a)}</div>
                      <div className="bq-ligne__detail">{[l.taille, l.perso ? `« ${l.perso} »` : '', a.boutique?.tailles?.length ? '' : a.boutique?.format].filter(Boolean).join(' · ')} · {l.qte} × {prix(a.priceXof)}</div>
                    </div>
                    <Pas q={l.qte} nom={nomDeLigne(a)} plus={() => onAjoute({ id: l.id, taille: l.taille, perso: l.perso })} moins={() => onRetire(k)} />
                  </li>
                );
              })}
            </ul>
            <fieldset className="bq-remise">
              <legend>La remise</legend>
              <label><input type="radio" name="bq-remise" checked={remise === 'retrait'} onChange={() => setRemise('retrait')} /><span>Retrait à la Maison<small>Offert. La Maison vous écrit quand c’est prêt.</small></span></label>
              <label><input type="radio" name="bq-remise" checked={remise === 'livraison'} onChange={() => setRemise('livraison')} /><span>Livraison dans Cotonou<small>{prix(vitrine.fraisXof)}. Une adresse ou un repère.</small></span></label>
            </fieldset>
            {remise === 'livraison' && <div className="bq-champ"><label htmlFor="bq-adresse">Adresse ou repère</label><input id="bq-adresse" autoComplete="street-address" placeholder="Quartier, rue, repère" value={adresse} onChange={(e) => setAdresse(e.target.value)} /></div>}
            <div className="bq-champ"><label htmlFor="bq-nom">Votre nom</label><input id="bq-nom" autoComplete="name" value={nom} onChange={(e) => setNom(e.target.value)} /></div>
            <div className="bq-champ"><label htmlFor="bq-num">Votre numéro WhatsApp</label><input id="bq-num" inputMode="tel" autoComplete="tel" placeholder="01 XX XX XX XX" value={numero} onChange={(e) => setNumero(e.target.value)} /></div>
            <div className="bq-totaux">
              <div><span>Articles</span><span>{prix(produits)}</span></div>
              <div><span>{remise === 'livraison' ? 'Livraison' : 'Retrait'}</span><span>{frais ? prix(frais) : 'offert'}</span></div>
              <div className="bq-totaux__grand"><span>Total</span><span>{prix(produits + frais)}</span></div>
            </div>
            <div className="bq-portes">
              {peutPayer && <button type="button" className="bq-btn bq-btn--cuivre" disabled={envoi} onClick={() => void enLigne()}>{envoi ? 'Un instant…' : ecrite ? 'Rouvrir le paiement · KkiaPay' : 'Régler maintenant · KkiaPay'}</button>}
              <button type="button" className="bq-btn bq-btn--clair" disabled={envoi} onClick={() => void auRetrait()}>{ecrite ? 'Je réglerai' : 'Commander, je règle'} {remise === 'livraison' ? 'à la livraison' : 'au retrait'}</button>
              {erreur && <p className="bq-erreur" role="alert">{erreur}</p>}
              <p className="bq-note">{peutPayer ? 'KkiaPay : MTN, Moov ou carte. Le site n’enregistre aucune carte.' : 'Le paiement en ligne revient bientôt : la commande se règle au retrait.'}</p>
            </div>
          </>
        )}
      </div>
    </Volet>
  );
}
