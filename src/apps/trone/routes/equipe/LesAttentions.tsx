import { useMemo, useState } from 'react';
import { Button, toast } from '../../../../ds/components';
import { fmtMoney } from '../../../../shared/currency';
import { jourDitAvecLAnnee, type ReleveDuContrat } from '../../../../shared/abonnee-pur';
import { decaleLeJour } from '../../../../shared/ia-faits-pur';
import { quiEncaisse } from '../../../../shared/finance';
import type { Plan } from '../../../../shared/abonnements';
import {
  BORNES_DE_LA_CARTE_DITES, NIVEAU_DIT, RAYONS, RAYON_DIT, ARTICLES_DICTES,
  ecartesDe, enRayon, heureDuFauteuil, histoireDe, listeDeLaVeille, messageALArtisane, panierDeLaSeance, pourquoiPasCetArticle,
  pourquoiPasValider, prenomDe, programmeDe, proposeLePanier, reserveDite, reservesCourtes, seancesAPreparer, semaineDe, tempsDuPanier,
  type ArticleDAttention, type CollectionDeCartes, type Niveau, type PanierDAttention, type Rayon, type ReglageDAttention,
  type RegleDuRang, type Reserve, type SeanceAPreparer, type ViseeDesAttentions,
} from '../../../../shared/attentions-pur';
import {
  ecritLePanier, ecritLeReglage, enregistreLArticle, nePlusLuiProposer, poseLesArticlesDictes, rouvreLePanier,
  useArticlesDAttention, usePaniersDAttention, useReglagesDAttention, valideLePanier,
} from '../../../../shared/attentions';
import './attentions.css';

/* ══ LES ATTENTIONS, AU TRÔNE · 6 novembre 2026 ═══════════════════════════
   Maquette `public/maquette-l-abonnement-refait.html`, onglet « Les
   attentions » : une boutique, pas un tirage. Quatre vues :
   · La semaine : un panier par séance de formule. Perle le remplit d'après le
     programme et l'histoire de la tête ; la Maison change un article comme
     dans une boutique, relit le mot, puis valide. Validé, l'abonnée voit son
     pli scellé dans Ma Couronne ;
   · La boutique : les articles par rayon, leurs trois niveaux, leur réserve ;
   · Le programme : la règle d'une formule, séance par séance, la collection
     de cartes, le coût visé ;
   · La veille : ce qu'il faut commander, cueillir, sortir et écrire pour le
     lendemain. Le message à l'artisane se prépare ; la Maison l'envoie.

   Les règles sont dans `shared/attentions-pur.ts` : cet écran ne décide de
   rien, il montre et il écrit. Peu de mots : le résumé sur la ligne, un seul
   rayon ouvert à la fois. */

type Vue = 'semaine' | 'boutique' | 'programme' | 'veille';
const VUES: [Vue, string][] = [['semaine', 'La semaine'], ['boutique', 'La boutique'], ['programme', 'Le programme'], ['veille', 'La veille']];

type Commun = {
  releves: readonly ReleveDuContrat[];
  nomDe: (clientId: string) => string;
  branchId: string;
  aujourdhui: string;
  articles: ArticleDAttention[];
  paniers: PanierDAttention[];
  reglages: ReglageDAttention[];
};

const maintenant = (): string => new Date().toISOString();
const jourCourt = (iso: string): string => jourDitAvecLAnnee(iso).replace(/^./, (c) => c.toUpperCase());

export function LesAttentions({ releves, plans, nomDe, branchId, aujourdhui, currency, vueInitiale }: {
  releves: readonly ReleveDuContrat[];
  plans: readonly Plan[];
  nomDe: (clientId: string) => string;
  branchId: string;
  aujourdhui: string;
  currency: Parameters<typeof fmtMoney>[1];
  vueInitiale?: Vue;
}) {
  const [vue, setVue] = useState<Vue>(vueInitiale ?? 'semaine');
  const [tousLesArticles] = useArticlesDAttention();
  const [paniers] = usePaniersDAttention();
  const [tousLesReglages] = useReglagesDAttention();
  const articles = useMemo(() => tousLesArticles.filter((a) => !a.branchId || a.branchId === branchId), [tousLesArticles, branchId]);
  const reglages = useMemo(() => tousLesReglages.filter((r) => !r.branchId || r.branchId === branchId), [tousLesReglages, branchId]);
  const c: Commun = { releves, nomDe, branchId, aujourdhui, articles, paniers, reglages };
  return (
    <div className="att">
      <div className="tre-filtres" role="tablist" aria-label="Les attentions">
        {VUES.map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={vue === k} className={`tre-filtre ${vue === k ? 'is-on' : ''}`} onClick={() => setVue(k)}>{l}</button>
        ))}
      </div>
      {vue === 'semaine' && <LaSemaine {...c} versLaBoutique={() => setVue('boutique')} />}
      {vue === 'boutique' && <LaBoutique {...c} currency={currency} />}
      {vue === 'programme' && <LeProgramme {...c} plans={plans} currency={currency} />}
      {vue === 'veille' && <LaVeille {...c} />}
    </div>
  );
}

/* ── LA SEMAINE ───────────────────────────────────────────────────────── */

/** Les paniers à l'écran : celui qui est écrit, sinon la proposition de Perle.
    Une proposition tient compte des précédentes : deux séances ne reçoivent
    pas la même dernière pièce. */
export function paniersAffiches(seances: readonly SeanceAPreparer[], c: Pick<Commun, 'paniers' | 'articles' | 'reglages' | 'nomDe' | 'branchId'>): { s: SeanceAPreparer; panier: PanierDAttention; ecrit: boolean }[] {
  let poses = [...c.paniers];
  return seances.map((s) => {
    const deja = c.paniers.find((p) => p.id === s.apptId);
    if (deja) return { s, panier: deja, ecrit: true };
    const propose = proposeLePanier({
      seance: s, prenom: prenomDe(c.nomDe(s.clientId)), articles: c.articles, reglages: c.reglages,
      histoire: histoireDe(s.clientId, poses, ecartesDe(c.reglages, s.clientId), s.apptId), paniers: poses,
    });
    const panier = panierDeLaSeance(s, propose, c.branchId);
    poses = [...poses, panier];
    return { s, panier, ecrit: false };
  });
}

const ETAT_DIT: Record<ReturnType<typeof tempsDuPanier>, string> = { 'a-valider': 'Proposé par Perle', pret: 'Validé', arrivee: 'Arrivée', remis: 'Remis' };

function LaSemaine({ releves, nomDe, branchId, aujourdhui, articles, paniers, reglages, versLaBoutique }: Commun & { versLaBoutique: () => void }) {
  const [jour, setJour] = useState(aujourdhui);
  const [choisit, setChoisit] = useState<string | null>(null);
  const sem = semaineDe(jour);
  const lignes = useMemo(() => {
    const seances = seancesAPreparer(releves, sem.du, sem.au).filter((s) => s.date >= aujourdhui || paniers.some((p) => p.id === s.apptId));
    return paniersAffiches(seances, { paniers, articles, reglages, nomDe, branchId });
  }, [releves, sem.du, sem.au, aujourdhui, paniers, articles, reglages, nomDe, branchId]);
  const courtes = useMemo(() => reservesCourtes(articles, [...paniers.filter((p) => !lignes.some((l) => l.panier.id === p.id)), ...lignes.map((l) => l.panier)]), [articles, paniers, lignes]);
  const valides = lignes.filter((l) => l.panier.etat === 'valide').length;
  const nom = (id: string | undefined): string => (id ? articles.find((a) => a.id === id)?.nom ?? 'Article retiré' : 'À choisir');
  const bascule = (k: string) => setChoisit((o) => (o === k ? null : k));

  return (
    <>
      <div className="att-nav">
        <button type="button" className="tre-mini" aria-label="Semaine précédente" onClick={() => setJour(decaleLeJour(jour, -7))}>‹</button>
        <b>Du {jourDitAvecLAnnee(sem.du)} au {jourDitAvecLAnnee(sem.au)}</b>
        <button type="button" className="tre-mini" aria-label="Semaine suivante" onClick={() => setJour(decaleLeJour(jour, 7))}>›</button>
        {jour !== aujourdhui && <button type="button" className="tre-mini" onClick={() => setJour(aujourdhui)}>Cette semaine</button>}
        <span className="att-note">{lignes.length === 0 ? 'Aucune séance de formule.' : `${valides} validé${valides > 1 ? 's' : ''} sur ${lignes.length}.`}</span>
      </div>
      {articles.length === 0 && (
        <p className="att-vide">La boutique est vide : Perle n’a rien à proposer. <button type="button" className="tre-link-btn" onClick={versLaBoutique}>Ouvrir la boutique</button></p>
      )}
      {lignes.map(({ s, panier, ecrit }) => {
        const temps = tempsDuPanier(panier);
        const fige = panier.etat === 'valide';
        const refus = pourquoiPasValider(panier);
        return (
          <article key={s.apptId} className={`att-panier is-${temps}`}>
            <header className="att-panier__tete">
              <span><b>{jourCourt(s.date)} · {heureDuFauteuil(s.time)}</b> · {nomDe(s.clientId)} · {s.formule}{s.rang && s.total ? ` · séance ${s.rang} sur ${s.total}` : ''}{panier.or ? ' · sceau d’or' : ''}</span>
              <span className={`att-etat is-${temps}`}>{ETAT_DIT[temps]}</span>
            </header>
            <div className="att-ligne">
              <span className="att-ligne__l">La carte</span>
              <span className="att-ligne__v">
                <span>{panier.carte ? `${panier.carte.serie} n° ${String(panier.carte.numero).padStart(2, '0')}` : 'Collection à saisir dans « Le programme »'}</span>
                <label className="att-petit" htmlFor={`mot-${s.apptId}`}>Le mot, à recopier à la main</label>
                <textarea id={`mot-${s.apptId}`} key={`${s.apptId}:${panier.mot}`} className="mnd-textarea att-mot" rows={2} defaultValue={panier.mot} readOnly={fige}
                  onBlur={(e) => { if (e.target.value !== panier.mot) ecritLePanier({ ...panier, mot: e.target.value }); }} />
              </span>
            </div>
            {RAYONS.map((rayon) => {
              const cle = `${s.apptId}:${rayon}`;
              const choix = enRayon(articles, rayon).filter((a) => a.niveau !== 'carte' && (rayon !== 'present' || (panier.or ? true : a.niveau === 'offert')));
              return (
                <div key={rayon} className="att-ligne">
                  <span className="att-ligne__l">{RAYON_DIT[rayon]}</span>
                  <span className="att-ligne__v">
                    <span>{nom(panier[rayon])}{panier[rayon] && articles.find((a) => a.id === panier[rayon])?.reserve === 'frais' ? <span className="att-petit"> · commandé la veille</span> : null}</span>
                    {choisit === cle && (
                      <span className="att-choix">
                        {choix.map((a) => (
                          <button key={a.id} type="button" className={`att-choix__a ${panier[rayon] === a.id ? 'is-on' : ''}`} onClick={() => { ecritLePanier({ ...panier, [rayon]: a.id }); setChoisit(null); }}>
                            <b>{a.nom}</b><span>{NIVEAU_DIT[a.niveau]} · {reserveDite(a.reserve)}</span>
                          </button>
                        ))}
                        {choix.length === 0 && <span className="att-petit">Aucun article dans ce rayon.</span>}
                        {panier[rayon] && (
                          <button type="button" className="tre-link-btn" onClick={() => {
                            nePlusLuiProposer(s.clientId, panier[rayon] as string, branchId);
                            const reste: PanierDAttention = { ...panier }; delete reste[rayon];
                            ecritLePanier(reste); setChoisit(null);
                            toast('Noté : cet article ne lui sera plus proposé.');
                          }}>Ne plus lui proposer</button>
                        )}
                      </span>
                    )}
                  </span>
                  {!fige && <button type="button" className="tre-mini" aria-expanded={choisit === cle} onClick={() => bascule(cle)}>{choisit === cle ? 'Fermer' : 'Changer'}</button>}
                </div>
              );
            })}
            {panier.pourquoi && !panier.remiseLe && <p className="att-petit">Pourquoi : {panier.pourquoi}</p>}
            {panier.remiseLe && <p className="att-petit">Remis le {jourDitAvecLAnnee(panier.remiseLe.slice(0, 10))}{panier.remisePar ? ` par ${panier.remisePar}` : ''}.</p>}
            {!panier.remiseLe && (
              <div className="att-gestes">
                {fige
                  ? <button type="button" className="tre-mini" onClick={() => rouvreLePanier(panier.id)}>Rouvrir</button>
                  : <Button variant="copper" size="sm" disabled={!!refus} onClick={() => { valideLePanier(panier, maintenant(), quiEncaisse()); toast('Panier validé : elle voit son pli scellé dans Ma Couronne.'); }}>Valider le panier</Button>}
                {!fige && refus && <span className="att-petit">{refus}</span>}
                {!fige && !ecrit && !refus && <span className="att-petit">Proposition : rien n’est écrit tant que vous ne validez pas.</span>}
              </div>
            )}
          </article>
        );
      })}
      {courtes.map((x) => (
        <p key={x.article.id} className="att-alerte">{x.article.nom} : {x.reserve} en réserve pour {x.promis} séance{x.promis > 1 ? 's' : ''} à venir, à recommander.</p>
      ))}
      {lignes.length > 0 && <p className="att-petit">Les cartes à écrire et la commande du frais se lisent dans « La veille ».</p>}
    </>
  );
}

/* ── LA BOUTIQUE ──────────────────────────────────────────────────────── */

type Fiche = { id?: string; nom: string; rayon: Rayon; niveau: Niveau; prix: string; cout: string; genre: 'compte' | 'frais' | 'jardin'; reserve: string; indice: string };
const FICHE_VIDE: Fiche = { nom: '', rayon: 'present', niveau: 'offert', prix: '', cout: '', genre: 'compte', reserve: '0', indice: '' };
const ficheDe = (a: ArticleDAttention): Fiche => ({
  id: a.id, nom: a.nom, rayon: a.rayon, niveau: a.niveau, prix: a.prixXof === undefined ? '' : String(a.prixXof), cout: a.coutXof === undefined ? '' : String(a.coutXof),
  genre: typeof a.reserve === 'number' ? 'compte' : a.reserve, reserve: typeof a.reserve === 'number' ? String(a.reserve) : '0', indice: a.indice ?? '',
});
const entier = (t: string): number | undefined => { const n = parseInt(t.replace(/[^0-9]/g, ''), 10); return Number.isFinite(n) ? n : undefined; };

function LaBoutique({ articles, branchId, currency }: Commun & { currency: Parameters<typeof fmtMoney>[1] }) {
  const [rayon, setRayon] = useState<Rayon | 'tout'>('tout');
  const [fiche, setFiche] = useState<Fiche | null>(null);
  const liste = useMemo(() => [...articles].filter((a) => rayon === 'tout' || a.rayon === rayon)
    .sort((x, y) => (RAYONS.indexOf(x.rayon) - RAYONS.indexOf(y.rayon)) || ((x.ordre ?? 0) - (y.ordre ?? 0)) || x.nom.localeCompare(y.nom, 'fr')), [articles, rayon]);
  const enregistre = () => {
    if (!fiche) return;
    const reserve: Reserve = fiche.genre === 'compte' ? (entier(fiche.reserve) ?? 0) : fiche.genre;
    const base = articles.find((a) => a.id === fiche.id);
    const prixXof = fiche.niveau === 'carte' ? entier(fiche.prix) : undefined;
    const coutXof = entier(fiche.cout);
    const neuf = {
      ...(base ?? { branchId, ordre: articles.length + 1 }), nom: fiche.nom.trim(), rayon: fiche.rayon, niveau: fiche.niveau, reserve,
      prixXof, coutXof, indice: fiche.rayon === 'present' && fiche.indice.trim() ? fiche.indice.trim() : undefined,
      enFinDeRdv: fiche.niveau === 'carte' ? base?.enFinDeRdv : undefined,
    };
    const refus = pourquoiPasCetArticle(neuf);
    if (refus) { toast(refus); return; }
    enregistreLArticle(JSON.parse(JSON.stringify(neuf)) as ArticleDAttention);
    setFiche(null);
    toast('Article enregistré.');
  };

  return (
    <>
      <div className="att-nav">
        <div className="tre-filtres" style={{ marginBottom: 0 }}>
          {([['tout', 'Tous les rayons'], ...RAYONS.map((r) => [r, RAYON_DIT[r]])] as [Rayon | 'tout', string][]).map(([k, l]) => (
            <button key={k} type="button" className={`tre-filtre ${rayon === k ? 'is-on' : ''}`} aria-pressed={rayon === k} onClick={() => setRayon(k)}>{l}</button>
          ))}
        </div>
        <Button variant="ghost" size="sm" onClick={() => setFiche({ ...FICHE_VIDE, rayon: rayon === 'tout' ? 'present' : rayon })}>Ajouter un article</Button>
      </div>
      <p className="att-petit">Trois niveaux : offert dans l’attention ; à la carte, {BORNES_DE_LA_CARTE_DITES} ; sceau d’or. Un article à la carte se propose en fin de rendez-vous si vous le décidez.</p>
      {articles.length === 0 && !fiche && (
        <div className="att-vide">
          <p>La boutique est vide.</p>
          <Button variant="copper" size="sm" onClick={() => { const n = poseLesArticlesDictes(branchId); toast(n ? `${n} articles posés : comptez les réserves, puis simplifiez.` : 'La boutique a déjà ses articles.'); }}>
            Poser les {ARTICLES_DICTES.length} articles dictés le 6 novembre 2026
          </Button>
          <p className="att-petit">Sans prix ni réserve supposés : les pièces sont à compter, le frais se commande la veille.</p>
        </div>
      )}
      {fiche && (
        <div className="att-fiche">
          <label>Nom<input className="mnd-input" value={fiche.nom} onChange={(e) => setFiche({ ...fiche, nom: e.target.value })} /></label>
          <label>Rayon<select className="mnd-select" value={fiche.rayon} onChange={(e) => setFiche({ ...fiche, rayon: e.target.value as Rayon })}>{RAYONS.map((r) => <option key={r} value={r}>{RAYON_DIT[r]}</option>)}</select></label>
          <label>Niveau<select className="mnd-select" value={fiche.niveau} onChange={(e) => setFiche({ ...fiche, niveau: e.target.value as Niveau })}>{(['offert', 'carte', 'or'] as Niveau[]).map((n) => <option key={n} value={n}>{NIVEAU_DIT[n]}</option>)}</select></label>
          {fiche.niveau === 'carte' && <label>Prix, {BORNES_DE_LA_CARTE_DITES}<input className="mnd-input" inputMode="numeric" value={fiche.prix} onChange={(e) => setFiche({ ...fiche, prix: e.target.value })} /></label>}
          <label>Ce qu’il coûte à la Maison (facultatif)<input className="mnd-input" inputMode="numeric" value={fiche.cout} onChange={(e) => setFiche({ ...fiche, cout: e.target.value })} /></label>
          <label>Réserve<select className="mnd-select" value={fiche.genre} onChange={(e) => setFiche({ ...fiche, genre: e.target.value as Fiche['genre'] })}>
            <option value="compte">Comptée, en pièces</option><option value="frais">Frais, commandé la veille</option><option value="jardin">Cueilli au jardin</option>
          </select></label>
          {fiche.genre === 'compte' && <label>Pièces en réserve<input className="mnd-input" inputMode="numeric" value={fiche.reserve} onChange={(e) => setFiche({ ...fiche, reserve: e.target.value })} /></label>}
          {fiche.rayon === 'present' && <label>L’indice, lu sous le pli scellé (facultatif)<input className="mnd-input" placeholder="elle se noue" value={fiche.indice} onChange={(e) => setFiche({ ...fiche, indice: e.target.value })} /></label>}
          <div className="att-gestes"><Button variant="copper" size="sm" onClick={enregistre}>Enregistrer</Button><button type="button" className="tre-mini" onClick={() => setFiche(null)}>Fermer</button></div>
        </div>
      )}
      <div className="att-liste">
        {liste.map((a) => {
          const defaut = pourquoiPasCetArticle(a);
          return (
            <div key={a.id} className={`att-article ${a.retire ? 'is-retire' : ''}`}>
              <div className="att-article__quoi">
                <b>{a.nom}</b>
                <span>{RAYON_DIT[a.rayon]} · {NIVEAU_DIT[a.niveau]}{a.niveau === 'carte' && a.prixXof !== undefined ? ` · ${fmtMoney(a.prixXof, currency)}` : ''} · {reserveDite(a.reserve)}{a.indice ? ` · indice : ${a.indice}` : ''}</span>
                {defaut && <span className="att-defaut">{a.niveau === 'carte' ? 'Prix à fixer : il n’est pas proposé.' : defaut}</span>}
                {a.retire && <span className="att-defaut">Retiré de la boutique.</span>}
              </div>
              <div className="att-article__gestes">
                {a.niveau === 'carte' && !a.retire && (
                  <button type="button" className={`tre-mini ${a.enFinDeRdv ? 'is-cuivre' : ''}`} aria-pressed={!!a.enFinDeRdv} disabled={!!defaut}
                    onClick={() => enregistreLArticle({ ...a, enFinDeRdv: !a.enFinDeRdv })}>{a.enFinDeRdv ? 'En fin de rendez-vous' : 'Pas proposé'}</button>
                )}
                <button type="button" className="tre-mini" onClick={() => setFiche(ficheDe(a))}>Modifier</button>
                <button type="button" className="tre-mini" onClick={() => enregistreLArticle({ ...a, retire: !a.retire, ...(a.retire ? {} : { enFinDeRdv: false }) })}>{a.retire ? 'Remettre' : 'Retirer'}</button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ── LE PROGRAMME ─────────────────────────────────────────────────────── */

const REGLES_DE_PERLE = [
  'Jamais deux fois le même présent, ni la même carte de la collection, à la même personne. Les boissons et les bouchées tournent.',
  'Jamais un article que vous avez écarté pour elle (« Ne plus lui proposer »).',
  'Un article dont la réserve est toute promise n’est pas proposé ; le Trône prévient quand la réserve ne couvre plus les séances à venir.',
  'Le frais se commande la veille, à l’artisane du quartier.',
  'À la dernière séance d’un carnet, un présent du sceau d’or.',
];

const seancesDuPlan = (p: Plan | undefined): number => {
  const bornees = (p?.included ?? []).map((i) => i.qty).filter((q): q is number => typeof q === 'number');
  return Math.min(12, Math.max(1, bornees.length ? Math.max(...bornees) : 6));
};

function LeProgramme({ articles, reglages, branchId, plans, currency }: Commun & { plans: readonly Plan[]; currency: Parameters<typeof fmtMoney>[1] }) {
  const [planId, setPlanId] = useState('');
  const plan = plans.find((p) => p.id === planId);
  const ecrit = reglages.find((r) => r.type === 'programme' && (planId ? r.planId === planId : r.planId === null));
  const herite = !ecrit && planId ? programmeDe(reglages, planId) : undefined;
  const depart = (ecrit?.type === 'programme' ? ecrit.rangs : herite?.rangs) ?? [];
  const n = planId ? seancesDuPlan(plan) : 6;
  const cleDuBrouillon = `${planId}:${JSON.stringify(depart)}`;
  const [brouillon, setBrouillon] = useState<{ cle: string; rangs: RegleDuRang[] } | null>(null);
  const rangs: RegleDuRang[] = Array.from({ length: n }, (_, i) => {
    const source = brouillon && brouillon.cle === cleDuBrouillon ? brouillon.rangs : depart;
    return source.find((r) => r.rang === i + 1) ?? { rang: i + 1 };
  });
  const change = (rang: number, x: Partial<RegleDuRang>) => setBrouillon({ cle: cleDuBrouillon, rangs: rangs.map((r) => (r.rang === rang ? { ...r, ...x } : r)) });
  const presents = enRayon(articles, 'present').filter((a) => a.niveau !== 'carte');

  const collection = reglages.find((r): r is CollectionDeCartes => r.type === 'collection');
  const [series, setSeries] = useState<{ nom: string; nombre: string }[] | null>(null);
  const lesSeries = series ?? (collection?.series ?? []).map((s) => ({ nom: s.nom, nombre: String(s.nombre) }));
  const visee = reglages.find((r): r is ViseeDesAttentions => r.type === 'visee');
  const [cout, setCout] = useState<string | null>(null);

  return (
    <>
      <div className="att-nav">
        <label className="att-petit">La règle de
          <select className="mnd-select" value={planId} onChange={(e) => { setPlanId(e.target.value); setBrouillon(null); }}>
            <option value="">toutes les formules</option>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <span className="att-note">{ecrit ? 'Règle écrite pour cette formule.' : planId && herite ? 'Elle suit la règle de toutes les formules.' : 'Aucune règle écrite : Perle prend le premier présent jamais reçu.'}</span>
      </div>
      <div className="att-table">
        <table>
          <thead><tr><th>Séance</th><th>Le présent voulu</th><th>Le mot voulu ({'{prenom}'} s’y remplace)</th></tr></thead>
          <tbody>
            {rangs.map((r) => (
              <tr key={r.rang}>
                <td className="att-num">{r.rang}</td>
                <td>
                  <select className="mnd-select" value={r.present ?? ''} aria-label={`Le présent de la séance ${r.rang}`} onChange={(e) => change(r.rang, { present: e.target.value || undefined })}>
                    <option value="">Au choix de Perle</option>
                    {presents.map((a) => <option key={a.id} value={a.id}>{a.nom}{a.niveau === 'or' ? ' · sceau d’or' : ''}</option>)}
                  </select>
                </td>
                <td><textarea className="mnd-textarea att-mot" rows={2} aria-label={`Le mot de la séance ${r.rang}`} value={r.mot ?? ''} placeholder="Le mot de la Maison" onChange={(e) => change(r.rang, { mot: e.target.value || undefined })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="att-gestes">
        <Button variant="copper" size="sm" onClick={() => {
          const propres = rangs.filter((r) => r.present || r.mot?.trim()).map((r) => ({ rang: r.rang, ...(r.present ? { present: r.present } : {}), ...(r.mot?.trim() ? { mot: r.mot.trim() } : {}) }));
          ecritLeReglage({ id: `programme:${planId || 'defaut'}`, branchId, type: 'programme', planId: planId || null, rangs: propres });
          setBrouillon(null);
          toast('Programme enregistré.');
        }}>Enregistrer le programme</Button>
      </div>

      <h3 className="att-titre">La collection de cartes</h3>
      <p className="att-petit">Les séries imprimées, dans l’ordre où elles se donnent. Le Trône dit quelle carte revient à chaque abonnée, jamais deux fois la même.</p>
      {lesSeries.map((s, i) => (
        <div key={i} className="att-serie">
          <input className="mnd-input" aria-label="Nom de la série" placeholder="Nom de la série" value={s.nom} onChange={(e) => setSeries(lesSeries.map((x, j) => (j === i ? { ...x, nom: e.target.value } : x)))} />
          <input className="mnd-input" aria-label="Nombre de cartes" inputMode="numeric" placeholder="Cartes" value={s.nombre} onChange={(e) => setSeries(lesSeries.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)))} />
          <button type="button" className="tre-mini" onClick={() => setSeries(lesSeries.filter((_, j) => j !== i))}>Retirer</button>
        </div>
      ))}
      <div className="att-gestes">
        <button type="button" className="tre-mini" onClick={() => setSeries([...lesSeries, { nom: '', nombre: '' }])}>Ajouter une série</button>
        <Button variant="ghost" size="sm" onClick={() => {
          const propres = lesSeries.map((s) => ({ nom: s.nom.trim(), nombre: entier(s.nombre) ?? 0 })).filter((s) => s.nom && s.nombre > 0);
          ecritLeReglage({ id: 'collection', branchId, type: 'collection', series: propres });
          setSeries(null);
          toast('Collection enregistrée.');
        }}>Enregistrer la collection</Button>
      </div>

      <h3 className="att-titre">Le coût visé d’un panier</h3>
      <div className="att-serie">
        <input className="mnd-input" aria-label="Coût visé d’un panier, en francs" inputMode="numeric" placeholder="À saisir" value={cout ?? (visee?.coutParPanierXof === undefined ? '' : String(visee.coutParPanierXof))} onChange={(e) => setCout(e.target.value)} />
        <Button variant="ghost" size="sm" onClick={() => { ecritLeReglage({ id: 'visee', branchId, type: 'visee', ...(entier(cout ?? '') === undefined ? {} : { coutParPanierXof: entier(cout ?? '') }) }); setCout(null); toast('Coût visé enregistré.'); }}>Enregistrer</Button>
        {visee?.coutParPanierXof !== undefined && <span className="att-petit">{fmtMoney(visee.coutParPanierXof, currency)} par panier offert.</span>}
      </div>

      <h3 className="att-titre">Les règles que Perle suit</h3>
      <ul className="att-regles">{REGLES_DE_PERLE.map((r) => <li key={r}>{r}</li>)}</ul>
    </>
  );
}

/* ── LA VEILLE ────────────────────────────────────────────────────────── */

function LaVeille({ releves, nomDe, aujourdhui, articles, paniers }: Commun) {
  const [jour, setJour] = useState(decaleLeJour(aujourdhui, 1));
  const [faits, setFaits] = useState<Record<string, boolean>>({});
  const liste = useMemo(() => listeDeLaVeille(jour, seancesAPreparer(releves, jour, jour), paniers, articles), [jour, releves, paniers, articles]);
  const message = messageALArtisane(liste, jourDitAvecLAnnee(jour));
  const coche = (k: string, texte: string) => (
    <button key={k} type="button" className="att-prep" aria-pressed={!!faits[`${jour}:${k}`]} onClick={() => setFaits((f) => ({ ...f, [`${jour}:${k}`]: !f[`${jour}:${k}`] }))}>
      <span className="att-prep__c" aria-hidden="true" /><span>{texte}</span>
    </button>
  );
  const rien = liste.aCommander.length + liste.aCueillir.length + liste.aSortir.length + liste.cartes.length === 0;
  return (
    <>
      <div className="att-nav">
        <button type="button" className="tre-mini" aria-label="Jour précédent" onClick={() => setJour(decaleLeJour(jour, -1))}>‹</button>
        <b>Pour le {jourDitAvecLAnnee(jour)}</b>
        <button type="button" className="tre-mini" aria-label="Jour suivant" onClick={() => setJour(decaleLeJour(jour, 1))}>›</button>
        <span className="att-note">{liste.seances === 0 ? 'Aucune séance de formule.' : `${liste.seances} séance${liste.seances > 1 ? 's' : ''} de formule${liste.aValider ? `, dont ${liste.aValider} panier${liste.aValider > 1 ? 's' : ''} à valider` : ''}.`}</span>
      </div>
      {rien && liste.seances > 0 && <p className="att-vide">Rien à préparer tant que les paniers ne sont pas validés, dans « La semaine ».</p>}
      {liste.aCommander.length > 0 && <h3 className="att-titre">À commander à l’artisane</h3>}
      {liste.aCommander.map((l) => coche(`c:${l.article.id}`, `${l.nombre} × ${l.article.nom}`))}
      {message && (
        <div className="att-gestes">
          <Button variant="ghost" size="sm" onClick={() => {
            try { void navigator.clipboard.writeText(message).then(() => toast('Message copié : vous l’envoyez vous-même.'), () => toast('La copie est refusée par ce navigateur : sélectionnez le texte.')); } catch { toast('La copie est refusée par ce navigateur : sélectionnez le texte.'); }
          }}>Copier le message à l’artisane</Button>
          <span className="att-petit att-message">{message}</span>
        </div>
      )}
      {liste.aCueillir.length > 0 && <h3 className="att-titre">À cueillir au jardin</h3>}
      {liste.aCueillir.map((l) => coche(`j:${l.article.id}`, `${l.nombre} × ${l.article.nom}`))}
      {liste.aSortir.length > 0 && <h3 className="att-titre">À sortir de la réserve</h3>}
      {liste.aSortir.map((l) => coche(`s:${l.article.id}`, `${l.nombre} × ${l.article.nom} (${reserveDite(l.article.reserve)})`))}
      {liste.cartes.length > 0 && <h3 className="att-titre">Les cartes à écrire et à signer</h3>}
      {liste.cartes.map((k) => coche(`k:${k.apptId}`, `${heureDuFauteuil(k.time)} · ${nomDe(k.clientId)} · ${k.carte ? `${k.carte.serie} n° ${String(k.carte.numero).padStart(2, '0')}` : 'carte au choix'} : « ${k.mot} »`))}
    </>
  );
}
