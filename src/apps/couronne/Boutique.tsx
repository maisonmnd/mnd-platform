/* ══ LA BOUTIQUE DANS MA COURONNE — 22 octobre 2026 ══════════════════════
   « Construis la boutique de la Maison avec ses produits » (Yéman), maquette
   validée : https://claude.ai/artifact/8dE2BEatDd94pn2CfWZRaP.

   L'écran Gamme devient la Boutique : les articles qui portent une fiche
   (`Product.boutique`), par rayon, avec la même règle que le site
   (shared/boutique-pur.ts). Les produits du comptoir n'y paraissent pas.

   LA PIÈCE N'EST PLUS ÉCRITE PAR LE NAVIGATEUR. Commander passe par la
   fonction `boutique`, qui relit le catalogue et chiffre la commande ; le
   jeton de la cliente la rattache à sa fiche. Deux portes : KkiaPay tout de
   suite (le serveur revérifie le montant), ou « je règle au retrait ».

   La Gamme n'est ouverte qu'à partir de la date d'ouverture posée au Trône
   (voir `useModuleFerme`). */
import './boutique.css';
import { useEffect, useMemo, useState } from 'react';
import { MapPin } from 'lucide-react';
import { asset } from '../../shared/asset';
import { useBranch } from '../../shared/branches';
import { useAuth } from '../../shared/auth';
import { useProducts, type Product } from '../../shared/catalog';
import { clientsStore } from '../../shared/clients';
import { deliveryFee } from '../../shared/settings';
import { payWithKkiapay, kkiapayEnabled } from '../../shared/kkiapay';
import {
  RAYONS, MOIS, articlesDuRayon, etatDeLArticle, moisAvant, moisDeLEdition, shortDe, shortVendable, titreDe,
  type ArticleLu, type RayonId,
} from '../../shared/boutique-pur';
import { commanderALaBoutique, motDuRefus, prevenirALArrivee, reglerLaCommande } from '../../shared/boutique-serveur';
import { useClient, useClientId } from './lib';
import { t, prix } from './i18n';

const image = (fichier?: string): string => (fichier ? asset(`/assets/boutique/${fichier}`) : '');
/** Dans le panier, un t-shirt de la Maison ou de MND 229 dit qu'il est un
    t-shirt : « Kwabɔ » seul ne se distingue pas de son short. */
const nomAuPanier = (a: ArticleLu): string =>
  (a.boutique?.rayon === 'maison' || a.boutique?.rayon === 'mnd229') && !a.boutique.shortDe
    ? t('Le t-shirt {nom}', { nom: titreDe(a) })
    : titreDe(a);

/** Une ligne du panier : l'article, sa taille, son nom de couronne. */
const cle = (id: string, taille = '', perso = ''): string => [id, taille, perso].join('|');
const lis = (k: string): { id: string; taille: string; perso: string } => {
  const [id, taille = '', perso = ''] = k.split('|');
  return { id, taille, perso };
};

type Piece = 'tshirt' | 'short' | 'tenue';
type Face = 'devant' | 'dos' | 'short';

/** Le temps qui passe : une édition de saison entre ou sort sans recharger. */
function useMaintenant(): Date {
  const [ms, setMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return useMemo(() => new Date(ms), [ms]);
}

/** Les commandes de la Boutique de cette cliente, pour le lien « Mes commandes ». */
export const estCommandeBoutique = (i: object): boolean => !!(i as { boutique?: unknown }).boutique;

export function BoutiqueGamme({ toast, onOpenOrders, nbCommandes }: { toast: (m: string) => void; onOpenOrders: () => void; nbCommandes: number }) {
  const { branch, currency } = useBranch();
  const [produits] = useProducts();
  const client = useClient();
  const clientId = useClientId();
  const { session } = useAuth();
  const jeton = session?.access_token;
  const maintenant = useMaintenant();

  const articles = useMemo(() => (produits as (Product & ArticleLu)[]).filter((p) => !!p.boutique), [produits]);
  const parId = useMemo(() => new Map(articles.map((a) => [a.id, a])), [articles]);

  const [rayon, setRayon] = useState<RayonId | 'tout'>('tout');
  const [ficheId, setFicheId] = useState<string | null>(null);
  const [panier, setPanier] = useState<Record<string, number>>({});
  const [panierOuvert, setPanierOuvert] = useState(false);

  const rayonsVisibles = useMemo(
    () => RAYONS.map((r) => ({ r, liste: articlesDuRayon(articles, r.id, maintenant) })).filter((x) => x.liste.length > 0),
    [articles, maintenant],
  );
  const montres = rayon === 'tout' ? rayonsVisibles : rayonsVisibles.filter((x) => x.r.id === rayon);

  const lignes = Object.entries(panier)
    .map(([k, q]) => ({ k, q, ...lis(k), a: parId.get(lis(k).id) }))
    .filter((l): l is typeof l & { a: Product & ArticleLu } => !!l.a);
  const nb = lignes.reduce((n, l) => n + l.q, 0);
  const sousTotal = lignes.reduce((n, l) => n + l.a.priceXof * l.q, 0);

  const ajoute = (k: string) => setPanier((p) => ({ ...p, [k]: (p[k] ?? 0) + 1 }));
  const retire = (k: string) => setPanier((p) => {
    const n = { ...p };
    const q = (n[k] ?? 0) - 1;
    if (q <= 0) delete n[k]; else n[k] = q;
    return n;
  });
  const enleve = (k: string) => setPanier((p) => { const n = { ...p }; delete n[k]; return n; });

  const fiche = ficheId ? parId.get(ficheId) : undefined;

  return (
    <div className="mc-pagepad mc-pagepad--top mc-fade mc-page--wide">
      <div className="mc-micro-eyebrow">{t('La Boutique · Maison MND')}</div>
      <h1 className="mc-serif-title" style={{ margin: '6px 0 4px' }}>{t('Ce que la Maison met sur les têtes.')}</h1>
      <p className="mc-lead" style={{ margin: '0 0 16px' }}>
        {t('Les soins, essayés sur des locks avant d’entrer ici, et les vêtements de la Maison. Retrait à la Maison offert, ou livraison dans Cotonou.')}
      </p>

      {nbCommandes > 0 && (
        <button className="mc-orderslink" onClick={onOpenOrders}>
          <span>{t('Mes commandes · {n}', { n: nbCommandes })}</span>
          <span className="mc-orderslink__arrow" aria-hidden="true">→</span>
        </button>
      )}

      {rayonsVisibles.length > 1 && (
        <div className="bq-puces" role="group" aria-label={t('Les rayons')}>
          <button type="button" className="bq-puce" aria-pressed={rayon === 'tout'} onClick={() => setRayon('tout')}>{t('Tout')}</button>
          {rayonsVisibles.map(({ r }) => (
            <button key={r.id} type="button" className="bq-puce" aria-pressed={rayon === r.id} onClick={() => setRayon(r.id)}>{t(r.filtre)}</button>
          ))}
        </div>
      )}

      {montres.map(({ r, liste }) => (
        <section key={r.id} className="bq-rayon">
          {rayon === 'tout' && (
            <h2 className="bq-rayon__t">{t(r.titre)}<small>{t(r.dit)}</small></h2>
          )}
          <div className="bq-grille">
            {liste.map((a) => {
              const etat = etatDeLArticle(a, maintenant);
              const f = a.boutique!;
              return (
                <article key={a.id} className="bq-carte">
                  <button type="button" className="bq-carte__vue" onClick={() => setFicheId(a.id)} aria-label={t('Voir {nom}', { nom: titreDe(a) })}>
                    <img src={image(f.image)} alt="" loading="lazy" />
                    {etat === 'bientot' ? (
                      <span className="bq-pastille bq-pastille--plein">{t('Bientôt')}</span>
                    ) : f.edition ? (
                      <span className="bq-pastille">{t(f.edition)}</span>
                    ) : null}
                  </button>
                  <div className="bq-carte__corps">
                    <span className="bq-carte__rayon">{t(r.court)}</span>
                    <h3 className="bq-carte__nom">{titreDe(a)}</h3>
                    <span className="bq-carte__format">{f.tailles ? t(f.format) : f.format}</span>
                    <div className="bq-carte__pied">
                      {a.priceXof > 0 ? <span className="bq-prix">{prix(a.priceXof, currency)}</span> : <span className="bq-prix bq-prix--vide">{t('Bientôt')}</span>}
                      <button type="button" className={etat === 'vendable' ? 'mc-plusbtn' : 'bq-lien'} onClick={() => setFicheId(a.id)} aria-label={etat === 'vendable' ? t('Choisir {nom}', { nom: titreDe(a) }) : t('Me prévenir pour {nom}', { nom: titreDe(a) })}>
                        {etat === 'vendable' ? '+' : t('Me prévenir')}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}

      {rayonsVisibles.length === 0 && (
        <div className="mc-emptyzone">
          <div className="mc-emptyzone__glyph">⬡</div>
          <div className="mc-emptyzone__t">{t('La Boutique se prépare.')}</div>
          <div className="mc-emptyzone__s">{t('La Maison pose ses articles un à un. Revenez bientôt.')}</div>
        </div>
      )}

      {nb > 0 && (
        <div className="mc-basketbar">
          <div className="mc-basketbar__info">
            <span className="mc-basketbar__count">{nb > 1 ? t('{n} articles', { n: nb }) : t('{n} article', { n: nb })}</span>
            <span className="mc-basketbar__total">{prix(sousTotal, currency)}</span>
          </div>
          <button className="mc-cta mc-cta--copper mc-basketbar__cta" onClick={() => setPanierOuvert(true)}>{t('Voir le panier')}</button>
        </div>
      )}
      <div style={{ height: 70 }} />

      {fiche && (
        <FicheArticle
          key={fiche.id}
          article={fiche}
          short={shortDe(articles, fiche.id) as (Product & ArticleLu) | undefined}
          maintenant={maintenant}
          currency={currency}
          numero={client?.phone ?? ''}
          nom={client?.name ?? ''}
          jeton={jeton}
          onAjoute={(cles) => { cles.forEach(ajoute); }}
          onFerme={() => setFicheId(null)}
          toast={toast}
        />
      )}

      {panierOuvert && (
        <Panier
          lignes={lignes}
          sousTotal={sousTotal}
          currency={currency}
          branchId={branch.id}
          clientId={clientId}
          client={client}
          jeton={jeton}
          email={session?.user?.email ?? undefined}
          onPlus={ajoute}
          onMoins={retire}
          onEnleve={enleve}
          onVide={() => setPanier({})}
          onFerme={() => setPanierOuvert(false)}
          onOpenOrders={onOpenOrders}
          toast={toast}
        />
      )}
    </div>
  );
}

/* ── La fiche d'un article ─────────────────────────────────────────────── */
function FicheArticle({ article, short, maintenant, currency, numero, nom, jeton, onAjoute, onFerme, toast }: {
  article: Product & ArticleLu;
  short?: Product & ArticleLu;
  maintenant: Date;
  currency: string;
  numero: string;
  nom: string;
  jeton?: string;
  onAjoute: (cles: string[]) => void;
  onFerme: () => void;
  toast: (m: string) => void;
}) {
  const f = article.boutique!;
  const etat = etatDeLArticle(article, maintenant);
  const avecShort = !!short && !!f.short && shortVendable(short, article, maintenant);
  const [piece, setPiece] = useState<Piece>('tshirt');
  const [face, setFace] = useState<Face>('devant');
  const [taille, setTaille] = useState('');
  const [perso, setPerso] = useState('');
  const [fait, setFait] = useState('');
  const [prevenir, setPrevenir] = useState(numero);
  const [prevenu, setPrevenu] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  const faces: Face[] = (['devant', 'dos', 'short'] as Face[]).filter((x) => x === 'devant' || (x === 'dos' ? !!f.dos : !!f.short));
  const src = image(face === 'dos' ? f.dos : face === 'short' ? f.short : f.image) || image(f.image);
  const prixVu = piece === 'short' ? short?.priceXof ?? 0 : piece === 'tenue' ? article.priceXof + (short?.priceXof ?? 0) : article.priceXof;
  const pret = (!f.tailles || !!taille) && (!f.perso || !!perso.trim()) && etat === 'vendable';
  const kids = f.rayon === 'kids';
  const mois = moisDeLEdition(f.edition);

  const ajoute = () => {
    if (!pret) return;
    const p = f.perso ? perso.trim() : '';
    const ids = !avecShort || piece === 'tshirt' ? [article.id] : piece === 'short' ? [short!.id] : [article.id, short!.id];
    onAjoute(ids.map((id) => cle(id, taille, p)));
    setFait(f.tailles ? t('Ajouté au panier, taille {taille}.', { taille: t(taille) }) : t('Ajouté au panier.'));
  };

  const demandeLaNouvelle = async () => {
    if (envoi) return;
    setEnvoi(true);
    const r = await prevenirALArrivee(article.id, prevenir, nom, jeton);
    setEnvoi(false);
    if (r.ok) setPrevenu(true);
    else toast(t(motDuRefus(r.error)));
  };

  return (
    <div className="mc-overlayscreen mc-slide" style={{ zIndex: 43 }} role="dialog" aria-modal="true" aria-label={titreDe(article)}>
      <div className="mc-flowhead mc-flowhead--split">
        <div>
          <div className="mc-micro-eyebrow">{t(RAYONS.find((r) => r.id === f.rayon)?.titre ?? '')}</div>
          <h1 className="mc-flowhead__h1" style={{ marginTop: 4 }}>{titreDe(article)}</h1>
        </div>
        <button className="mc-x" aria-label={t('Fermer')} onClick={onFerme}>✕</button>
      </div>
      <div className="mc-scroll" style={{ flex: 1, padding: '0 0 calc(24px + env(safe-area-inset-bottom))' }}>
        <div className="bq-scene">
          <img src={src} alt="" />
          {faces.length > 1 && (
            <div className="bq-faces" role="group" aria-label={t('Voir le vêtement')}>
              {faces.map((x) => (
                <button key={x} type="button" aria-pressed={face === x} onClick={() => setFace(x)}>
                  {x === 'devant' ? t('Devant') : x === 'dos' ? t('Dos') : t('Short')}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="bq-fiche">
          {f.sous && <p className="bq-fiche__sous">{f.sous}</p>}
          {f.edition && <p className="bq-fiche__edition">{t(f.edition)}</p>}
          <dl className="bq-fiche__dl">
            {f.tailles ? (
              <>
                <dt>{t('Devant')}</dt><dd>{f.usage}</dd>
                {f.dos && f.detail && (<><dt>{t('Dos')}</dt><dd>{f.detail}</dd></>)}
                {!f.dos && f.detail && (<><dt>{t('Matière')}</dt><dd>{f.detail}</dd></>)}
                <dt>{kids ? t('Pour') : t('Tailles')}</dt><dd>{t(f.format)}</dd>
                {f.short && <><dt>{t('Short')}</dt><dd>{t('Assorti, vendu seul ou avec le t-shirt.')}</dd></>}
              </>
            ) : (
              <>
                <dt>{t('Format')}</dt><dd>{f.format}</dd>
                <dt>{t('Usage')}</dt><dd>{f.usage}</dd>
                {f.detail && (<><dt>{t('Le flacon')}</dt><dd>{f.detail}</dd></>)}
              </>
            )}
          </dl>
          {mois > 0 && (
            <p className="bq-note">{t('En vente en {avant} et en {mois} seulement.', { avant: t(moisAvant(mois)), mois: t(MOIS[mois - 1]) })}</p>
          )}

          {etat === 'vendable' ? (
            <>
              {avecShort && (
                <fieldset className="bq-choix">
                  <legend>{t('Ce que vous prenez')}</legend>
                  <div>
                    {(['tshirt', 'short', 'tenue'] as Piece[]).map((x) => (
                      <button key={x} type="button" className="bq-taille" aria-pressed={piece === x} onClick={() => { setPiece(x); setFace(x === 'short' ? 'short' : 'devant'); setFait(''); }}>
                        {x === 'tshirt' ? t('Le t-shirt') : x === 'short' ? t('Le short') : t('La tenue')}
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}
              {f.tailles && (
                <fieldset className="bq-choix">
                  <legend>{kids ? t('Son âge') : t('Votre taille')}</legend>
                  <div>
                    {f.tailles.map((x) => (
                      <button key={x} type="button" className="bq-taille" aria-pressed={taille === x} onClick={() => { setTaille(x); setFait(''); }}>{t(x)}</button>
                    ))}
                  </div>
                </fieldset>
              )}
              {f.perso && (
                <label className="bq-champ">
                  <span>{t('Son nom de couronne, celui de son carnet')}</span>
                  <input value={perso} maxLength={24} onChange={(e) => { setPerso(e.target.value); setFait(''); }} placeholder={t('le Lion du matin')} />
                  <small>{t('Jamais son vrai prénom, sauf si vous le demandez. Brodé ou imprimé à la Maison.')}</small>
                </label>
              )}
              <div className="bq-achat">
                {prixVu > 0 ? <span className="bq-prix bq-prix--grand">{prix(prixVu, currency)}</span> : <span />}
                <button type="button" className="mc-cta mc-cta--copper bq-achat__btn" disabled={!pret} onClick={ajoute}>{t('Ajouter au panier')}</button>
              </div>
              <p className="bq-note" aria-live="polite">
                {fait || (pret
                  ? t('Retrait à la Maison offert, ou livraison dans Cotonou.')
                  : f.tailles
                    ? (kids ? t('Choisissez son âge.') : t('Choisissez votre taille.')) + (f.perso ? ' ' + t('Puis son nom de couronne.') : '')
                    : '')}
              </p>
            </>
          ) : (
            <div className="bq-prevenir">
              <p className="bq-note">{t('Pas encore disponible. Laissez votre numéro : la Maison vous écrit une seule fois, le jour où il arrive.')}</p>
              {prevenu ? (
                <p className="bq-ok">{t('C’est noté. La Maison vous écrit dès qu’il arrive.')}</p>
              ) : (
                <>
                  <label className="bq-champ">
                    <span>{t('Votre numéro WhatsApp')}</span>
                    <input value={prevenir} inputMode="tel" onChange={(e) => setPrevenir(e.target.value)} placeholder="01 XX XX XX XX" />
                  </label>
                  <button type="button" className="mc-cta mc-cta--outline" disabled={envoi} onClick={() => void demandeLaNouvelle()}>{t('Me prévenir')}</button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Le panier ─────────────────────────────────────────────────────────── */
type LignePanier = { k: string; q: number; id: string; taille: string; perso: string; a: Product & ArticleLu };

function Panier({ lignes, sousTotal, currency, branchId, clientId, client, jeton, email, onPlus, onMoins, onEnleve, onVide, onFerme, onOpenOrders, toast }: {
  lignes: LignePanier[];
  sousTotal: number;
  currency: string;
  branchId: string;
  clientId: string;
  client?: { name?: string; phone?: string; city?: string };
  jeton?: string;
  email?: string;
  onPlus: (k: string) => void;
  onMoins: (k: string) => void;
  onEnleve: (k: string) => void;
  onVide: () => void;
  onFerme: () => void;
  onOpenOrders: () => void;
  toast: (m: string) => void;
}) {
  const [mode, setMode] = useState<'retrait' | 'livraison'>('retrait');
  const [adresse, setAdresse] = useState(client?.city ? `${client.city}, ` : '');
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [geoBusy, setGeoBusy] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  /* Le widget KkiaPay ouvert : la commande est écrite, le paiement attendu.
     Une porte de sortie reste toujours là (le widget fermé ne répond pas). */
  const [enPaiement, setEnPaiement] = useState<{ numero: string; totalXof: number } | null>(null);
  const [fini, setFini] = useState<{ numero: string; totalXof: number; mode: 'retrait' | 'livraison'; paye: boolean } | null>(null);

  const frais = deliveryFee();
  const fraisVus = mode === 'livraison' ? frais : 0;
  const total = sousTotal + fraisVus;
  const lienCarte = geo ? `https://maps.google.com/?q=${geo.lat},${geo.lng}` : '';
  const adresseManque = mode === 'livraison' && !adresse.trim() && !geo;
  const enLigne = kkiapayEnabled();

  const partage = () => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) { toast(t('La géolocalisation n’est pas disponible sur cet appareil.')); return; }
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setGeo({ lat: Number(pos.coords.latitude.toFixed(6)), lng: Number(pos.coords.longitude.toFixed(6)) }); setGeoBusy(false); toast(t('Position partagée, la maison vous trouvera facilement.')); },
      (err) => { setGeoBusy(false); toast(err.code === err.PERMISSION_DENIED ? t('Autorisez la localisation pour partager votre position.') : t('Impossible d’obtenir votre position. Réessayez.')); },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  };

  const passe = async (paiement: 'kkiapay' | 'maison') => {
    if (envoi || lignes.length === 0 || adresseManque) return;
    setEnvoi(true);
    /* L'adresse part telle quelle à la Maison, en français : le Trône la lit. */
    const adresseEntiere = mode === 'livraison' ? [adresse.trim(), lienCarte ? `Position GPS : ${lienCarte}` : ''].filter(Boolean).join('\n') : undefined;
    const r = await commanderALaBoutique({
      lignes: lignes.map((l) => ({ id: l.id, qte: l.q, ...(l.taille ? { taille: l.taille } : {}), ...(l.perso ? { perso: l.perso } : {}) })),
      remise: mode, adresse: adresseEntiere, nom: client?.name, numero: client?.phone, paiement, origine: 'couronne',
    }, jeton);
    if (!r.ok || !r.commandeId) { setEnvoi(false); toast(t(motDuRefus(r.error))); return; }
    if (geo) clientsStore.set((prev) => prev.map((c) => (c.id === clientId ? { ...c, geo } : c)));
    const numero = String(r.numero ?? '');
    const totalXof = Number(r.totalXof ?? total);
    onVide();
    if (paiement === 'maison') { setEnvoi(false); setFini({ numero, totalXof, mode, paye: false }); return; }
    setEnPaiement({ numero, totalXof });
    try {
      const { transactionId } = await payWithKkiapay({
        amountXof: totalXof, partnerId: String(r.reference), branchId: String(r.branchId || branchId), clientId,
        phone: client?.phone, name: client?.name, email,
      });
      const v = await reglerLaCommande(String(r.commandeId), transactionId);
      if (!v.ok) toast(t(motDuRefus(v.error)));
      setFini({ numero, totalXof, mode, paye: !!v.ok });
    } catch (e) {
      toast(e instanceof Error ? t(e.message) : t('Le paiement n’a pas abouti.'));
      setFini({ numero, totalXof, mode, paye: false });
    } finally {
      setEnPaiement(null);
      setEnvoi(false);
    }
  };

  return (
    <div className="mc-overlayscreen mc-slide" style={{ zIndex: 42 }}>
      <div className="mc-flowhead mc-flowhead--split">
        <div>
          <div className="mc-micro-eyebrow">{fini ? t('Commande transmise') : t('Votre panier')}</div>
          <h1 className="mc-flowhead__h1" style={{ marginTop: 4 }}>{fini ? t('C’est transmis.') : t('Le panier.')}</h1>
        </div>
        <button className="mc-x" aria-label={t('Fermer')} onClick={onFerme}>✕</button>
      </div>
      <div className="mc-scroll" style={{ flex: 1, padding: '18px 24px calc(24px + env(safe-area-inset-bottom))' }}>
        {fini ? (
          <div className="mc-confirm mc-rise" style={{ paddingTop: 26 }}>
            <div className="mc-confirm__seal"><img src={asset('/assets/monograms/mono-copper.png')} alt="" /></div>
            <h2>{fini.paye ? t('Commande réglée.') : t('Commande transmise.')}</h2>
            <p>{fini.paye
              ? t('Le paiement est confirmé. La Maison vous écrit une seule fois sur WhatsApp, quand elle est prête.')
              : t('La Maison la reçoit à l’instant et vous écrit sur WhatsApp quand elle est prête. Suivez-la dans « Mes commandes ».')}</p>
            <div className="mc-recapcard" style={{ textAlign: 'left', width: '100%' }}>
              <div className="mc-recapcard__line"><span>{t('Commande')}</span><span>{fini.numero}</span></div>
              <div className="mc-recapcard__line"><span>{t('Remise')}</span><span>{fini.mode === 'livraison' ? t('Livraison dans Cotonou') : t('Retrait à la Maison')}</span></div>
              <div className="mc-hairline" />
              <div className="mc-recapcard__total"><span>{t('Total')}</span><span>{prix(fini.totalXof, currency)}</span></div>
              <div className="mc-recapcard__meta">
                {fini.paye ? t('Réglée en ligne.') : fini.mode === 'livraison' ? t('À régler à la livraison.') : t('À régler au retrait.')}
              </div>
            </div>
            <button className="mc-cta mc-cta--indigo" style={{ marginTop: 20 }} onClick={() => { onFerme(); onOpenOrders(); }}>{t('Suivre mes commandes')}</button>
            <button className="mc-quietbtn" onClick={onFerme}>{t('Revenir à la Boutique')}</button>
          </div>
        ) : enPaiement ? (
          <div className="mc-confirm" style={{ paddingTop: 26 }}>
            <h2>{t('Paiement en cours.')}</h2>
            <p>{t('La commande est enregistrée. Si vous avez fermé KkiaPay, elle reste à régler au retrait.')}</p>
            <button className="mc-cta mc-cta--outline" style={{ marginTop: 16 }} onClick={() => { setFini({ numero: enPaiement.numero, totalXof: enPaiement.totalXof, mode, paye: false }); setEnPaiement(null); setEnvoi(false); }}>
              {mode === 'livraison' ? t('Je réglerai à la livraison') : t('Je réglerai au retrait')}
            </button>
          </div>
        ) : lignes.length === 0 ? (
          <div className="mc-emptyzone">
            <div className="mc-emptyzone__glyph">⬡</div>
            <div className="mc-emptyzone__t">{t('Votre panier est vide.')}</div>
            <div className="mc-emptyzone__s">{t('Choisissez un article de la Boutique pour composer votre commande.')}</div>
            <button className="mc-cta mc-cta--outline" style={{ marginTop: 22 }} onClick={onFerme}>{t('Revenir à la Boutique')}</button>
          </div>
        ) : (
          <>
            <div className="mc-stack" style={{ gap: 10 }}>
              {lignes.map((l) => (
                <div key={l.k} className="mc-basketrow">
                  <img className="bq-mini" src={image(l.a.boutique?.image)} alt="" />
                  <div className="mc-basketrow__body">
                    <div className="mc-basketrow__name">{nomAuPanier(l.a)}</div>
                    <div className="mc-basketrow__unit">
                      {[l.taille ? t(l.taille) : '', l.perso ? `« ${l.perso} »` : '', t('{prix} l’unité', { prix: prix(l.a.priceXof, currency) })].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <div className="mc-qtystep">
                    <button aria-label={t('Retirer {nom}', { nom: titreDe(l.a) })} onClick={() => onMoins(l.k)}>−</button>
                    <span>{l.q}</span>
                    <button aria-label={t('Ajouter {nom}', { nom: titreDe(l.a) })} onClick={() => onPlus(l.k)}>+</button>
                  </div>
                  <button className="mc-basketrow__x" aria-label={t('Retirer {nom} du panier', { nom: titreDe(l.a) })} onClick={() => onEnleve(l.k)}>✕</button>
                </div>
              ))}
            </div>
            <div className="mc-deliver" style={{ marginTop: 18 }}>
              <div className="mc-micro-eyebrow">{t('Comment la recevoir')}</div>
              <div className="mc-deliver__opts">
                <button type="button" className={`mc-deliver__opt ${mode === 'retrait' ? 'is-active' : ''}`} onClick={() => setMode('retrait')}>
                  <span className="mc-deliver__name">{t('Retrait à la Maison')}</span>
                  <span className="mc-deliver__price">{t('Offert')}</span>
                </button>
                <button type="button" className={`mc-deliver__opt ${mode === 'livraison' ? 'is-active' : ''}`} onClick={() => setMode('livraison')}>
                  <span className="mc-deliver__name">{t('Livraison dans Cotonou')}</span>
                  <span className="mc-deliver__price">{frais > 0 ? prix(frais, currency) : t('Offert')}</span>
                </button>
              </div>
              {mode === 'livraison' && (
                <>
                  <label className="mc-deliver__addr">
                    <span className="mc-deliver__addrlabel">{t('Adresse de livraison')}</span>
                    <textarea className="mc-deliver__addrinput" value={adresse} onChange={(e) => setAdresse(e.target.value)} placeholder={t('Quartier, rue, repère… et un numéro à joindre.')} rows={2} />
                  </label>
                  <div className="mc-geo">
                    <button type="button" className={`mc-geo__btn ${geo ? 'is-set' : ''}`} onClick={partage} disabled={geoBusy}>
                      <MapPin size={15} strokeWidth={1.75} />
                      {geoBusy ? t('Localisation en cours…') : geo ? t('Actualiser ma position') : t('Partager ma position GPS')}
                    </button>
                    {geo
                      ? <a className="mc-geo__link" href={lienCarte} target="_blank" rel="noopener noreferrer">{t('Position enregistrée · voir sur la carte')}</a>
                      : <span className="mc-geo__hint">{t('Un point précis pour que le livreur vous trouve sans hésiter.')}</span>}
                  </div>
                </>
              )}
            </div>
            <div className="mc-recapcard" style={{ marginTop: 16 }}>
              <div className="mc-recapcard__line"><span>{t('Articles')}</span><span>{prix(sousTotal, currency)}</span></div>
              <div className="mc-recapcard__line">
                <span>{mode === 'livraison' ? t('Livraison') : t('Retrait')}</span>
                <span>{fraisVus > 0 ? prix(fraisVus, currency) : t('Offert')}</span>
              </div>
              <div className="mc-hairline" />
              <div className="mc-recapcard__total"><span>{t('Total')}</span><span>{prix(total, currency)}</span></div>
            </div>
            {enLigne && (
              <button className="mc-cta mc-cta--copper" style={{ marginTop: 18 }} onClick={() => void passe('kkiapay')} disabled={envoi || adresseManque}>
                {t('Régler maintenant · KkiaPay')}
              </button>
            )}
            <button className={`mc-cta ${enLigne ? 'mc-cta--outline' : 'mc-cta--copper'}`} style={{ marginTop: 10 }} onClick={() => void passe('maison')} disabled={envoi || adresseManque}>
              {mode === 'livraison' ? t('Commander, je règle à la livraison') : t('Commander, je règle au retrait')}
            </button>
            {adresseManque && (
              <div className="mc-footnote" style={{ color: 'var(--mc-cuivre-texte)' }}>{t('Indiquez l’adresse de livraison pour transmettre la commande.')}</div>
            )}
            <div className="mc-footnote">{enLigne ? t('KkiaPay : MTN, Moov ou carte. La Maison ne garde aucune carte.') : t('La Maison vous écrit sur WhatsApp quand votre commande est prête.')}</div>
          </>
        )}
      </div>
    </div>
  );
}
