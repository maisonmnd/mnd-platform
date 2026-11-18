import { usePiecesDeLaMaison } from '../../../../shared/essai';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, EllipsisVertical, Plus } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useBranch } from '../../../../shared/branches';
import { Field, demande, toast } from '../../../../ds/components';
import { codesOrphelins, compteParCode, estUnCodeDeLAssistant, type DemandeLue, type EnvoiDuCompteur, type EtatDuVerdict, type LigneDuCompteur, type SourceDUsage } from '../../../../shared/compteur-des-remises-pur';
import { codesPromoStore, codesVivantsDe, estExpire, estUtilise, instantDit, useCodesPromo, type CodePromo } from '../../../../shared/promos';
import { useOffers } from '../../../../shared/offers';
import { useInvoices } from '../../../../shared/finance';
import { useDemandes } from '../../../../shared/demandes';
import { useCartesCadeaux } from '../../../../shared/cartes-cadeaux';
import { lienWaMe } from '../../../../shared/conversations';
import { changeLePlafond } from '../../../../shared/gerard';
import { REMISE_ANNIV_PCT, REMISE_CREUX_PCT, jourDit } from '../../../../shared/gerard-pur';
import { jourCourtAn } from '../../../../shared/calendrier';
import { francs } from '../../../../shared/ia-faits-pur';
import type { Appointment } from '../../../../shared/agenda';
import { useEnvois } from '../equipe/data';
import { useAbonnesAuxNotifications } from '../equipe/useAudiences';
import EditeurDesOffres from '../equipe/EditeurDesOffres';
import { compteDesCartes } from '../vente/CartesCadeaux';
import { ClientPicker, apptTotalXof, useBranchAppointments, useServicesById } from './_shared';
import { PanneauDeLaPromo } from './_gestes';
import type { PropsDUneVue } from './Gerard';
import './clients.css';
import './les-conversations.css';

/* ══ OFFRES ET REMISES, VUE DE L'ASSISTANT MAISON · 27 octobre 2026, lot 3 ══
   Spécification `docs/spec-assistant-maison.md` §5.4 et §8, maquette validée
   `public/maquette-assistant-maison.html` (vue 4). « La seule porte pour tout
   ce qui baisse un prix, et le seul compte de ce que ça rapporte. »

   CE QU'ELLE MONTRE, dans l'ordre : quatre tuiles (les remises de la semaine
   et leurs francs, LUS DANS `cerveau.plafond`, le même chiffre que la vue
   Aujourd'hui ; les codes vivants ; les codes orphelins, qui doivent tomber à
   zéro), le compte « Par code » en liste repliée (`compteur-des-remises-pur`,
   un panneau ouvert à la fois : les usages avec la date et l'année, la pièce,
   la remise, la cliente en initiales, la source), quatre cartes (l'offre
   flash proposée, les jours creux, les offres de saison, les cartes cadeaux),
   puis les gestes : Remise à son nom (une cliente, puis le panneau qui
   fabriquait déjà la « Promo flash »), Changer le plafond, Annuler un code
   vivant. Dessous, repliés : l'éditeur des offres de saison (extrait du
   Marketing, `equipe/EditeurDesOffres`) et la table des jours creux.

   RIEN D'INVENTÉ : l'offre flash n'existe pas encore (l'Assistant ne fabrique
   que CREUX et ANNIV), la carte dit « aucune proposition » plutôt qu'une
   proposition factice. Aucun appel à Claude ni à une fonction serveur d'ici.

   18 NOVEMBRE 2026, DANS LE CADRE DES CONVERSATIONS (lot 3 de « exactement
   comme WhatsApp », maquette J6ZeXBFaesywB5Q42F1TRN, planche 3) : toute la
   page ; à gauche « Offres et remises », le plafond de la semaine en tête,
   les puces Tous / À son nom / Offres publiques / Codes vivants / Orphelins
   et une ligne par code ; à droite le compte de la ligne ouverte (ou du
   code), ou un volet (le plafond, l'annulation, les offres de saison, les
   jours creux, le code fabriqué) ; sans rien d'ouvert, la vue d'ensemble et
   ses quatre cartes. Les quatre tuiles s'effacent : leurs nombres sont là. */

/* LES PUCES DE LA LISTE (18 novembre 2026). */
type PuceDesOffres = 'tous' | 'nom' | 'public' | 'vivants' | 'orphelins';
const PUCES_DES_OFFRES: readonly { k: PuceDesOffres; dit: string }[] = [
  { k: 'tous', dit: 'Tous' }, { k: 'nom', dit: 'À son nom' }, { k: 'public', dit: 'Publiques' }, { k: 'vivants', dit: 'Vivants' }, { k: 'orphelins', dit: 'Orphelins' },
];
type VoletDesOffres = 'plafond' | 'annuler' | 'saison' | 'creux' | 'code';
/** Le téléphone (900 px et moins) : la liste OU ce qui est ouvert, comme les Conversations. */
function useEtroit(largeur = 900): boolean {
  const [etroit, setEtroit] = useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(`(max-width: ${largeur}px)`).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia(`(max-width: ${largeur}px)`);
    const lis = () => setEtroit(mq.matches);
    mq.addEventListener('change', lis);
    return () => mq.removeEventListener('change', lis);
  }, [largeur]);
  return etroit;
}

const TON_DU_VERDICT: Record<EtatDuVerdict, 'vert' | 'indigo' | 'cuivre' | 'terre'> = {
  utile: 'vert', 'a-mesurer': 'indigo', 'a-regarder': 'cuivre', 'a-eteindre': 'terre', public: 'indigo',
};
const SOURCE_DITE: Record<SourceDUsage, string> = { caisse: 'Caisse', site: 'site', couronne: 'Ma Couronne' };

/** « M. D. » → « MD » : l'avatar à initiales de la maquette ; les usages disent la cliente ainsi. */
const initiales = (nom: string): string => nom.split(/\s+/).filter(Boolean).map((m) => m[0]).join('').slice(0, 2).toUpperCase() || '·';
/** « 6,2 » ; « pas encore » tant que rien n'a été remisé (essai du 18 novembre 2026 : « rendement · » ne disait rien). */
const rendementDit = (r: number | null): string => (r === null ? 'pas encore' : r.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
const tauxDit = (t: number | null): string => (t === null ? '·' : `${Math.round(t * 100)} %`);
/** « Lun. 26 oct. 2026 » : toujours l'année ; une date illisible le dit. */
const jourCourt = (j: string): string => { const d = jourCourtAn(j); return d === String.fromCharCode(0x2014) ? 'date inconnue' : d; };
const pluriel = (n: number, un: string, des: string): string => `${n} ${n > 1 ? des : un}`;
/** La puce du verdict ; le vert n'a pas de classe dans `assistant-maison.css`, il se dit en jetons. */
const PuceDuVerdict = ({ etat, dit }: { etat: EtatDuVerdict; dit: string }) => {
  const ton = TON_DU_VERDICT[etat];
  return ton === 'vert'
    ? <em className="trc-am__puce" style={{ background: 'var(--am-vert-pale)', color: 'var(--am-vert-fonce)' }}>{dit}</em>
    : <em className={`trc-am__puce trc-am__puce--${ton}`}>{dit}</em>;
};

export default function OffresEtRemises({ cerveau, reglages, moi }: PropsDUneVue) {
  const { branch } = useBranch();
  const navigate = useNavigate();
  const [codes] = useCodesPromo();
  const [offres] = useOffers();
  const [envois] = useEnvois();
  const [pieces] = usePiecesDeLaMaison();
  const [demandes] = useDemandes();
  const [cartes] = useCartesCadeaux();
  const appts = useBranchAppointments();
  const byId = useServicesById();
  const abonnes = useAbonnesAuxNotifications();
  /* L'horloge bat : un code qui meurt à 14 h sort des vivants à 14 h. */
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setTick(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [remise, setRemise] = useState<{ clientId: string; panneau: boolean } | null>(null);
  const [codeFait, setCodeFait] = useState<{ clientId: string; code: CodePromo; message: string } | null>(null);
  const [copie, setCopie] = useState(false);
  /* CE QUI EST OUVERT À DROITE (18 novembre 2026) : un volet, une ligne du compte, ou un code. */
  const [volet, setVolet] = useState<VoletDesOffres | null>(null);
  const [codeOuvert, setCodeOuvert] = useState<string | null>(null);
  const [puce, setPuce] = useState<PuceDesOffres>('tous');
  const [menu, setMenu] = useState(false);
  const etroit = useEtroit();
  /* Le menu ⋮ se ferme au clic ailleurs et à Échap. */
  useEffect(() => {
    if (!menu) return undefined;
    const ferme = (e: Event) => { if (!(e.target as Element | null)?.closest?.('[data-menu]')) setMenu(false); };
    const echap = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); };
    document.addEventListener('pointerdown', ferme);
    document.addEventListener('keydown', echap);
    return () => { document.removeEventListener('pointerdown', ferme); document.removeEventListener('keydown', echap); };
  }, [menu]);
  /* Le plafond se tape puis s'écrit à la sortie du champ (comme dans Aujourd'hui). */
  const [nombre, setNombre] = useState(String(reglages.remisesParSemaine));
  const [francsDuPlafond, setFrancsDuPlafond] = useState(String(reglages.plafondFrancs));
  useEffect(() => { setNombre(String(reglages.remisesParSemaine)); }, [reglages.remisesParSemaine]);
  useEffect(() => { setFrancsDuPlafond(String(reglages.plafondFrancs)); }, [reglages.plafondFrancs]);

  const direction = moi?.role === 'souverain' || moi?.role === 'gerant';
  const qui = moi?.name ?? 'La direction';
  const maintenant = useMemo(() => new Date(tick).toISOString(), [tick]);
  const { plafond, ctx, nomDe, clientDe } = cerveau;

  const codesDeLaBranche = useMemo(() => codes.filter((c) => c.branchId === branch.id), [codes, branch.id]);
  const offresDeLaBranche = useMemo(() => offres.filter((o) => o.branchId === branch.id), [offres, branch.id]);
  const envoisLus = useMemo(
    () => (envois as unknown as EnvoiDuCompteur[]).filter((e) => !e.branchId || e.branchId === branch.id),
    [envois, branch.id],
  );
  const piecesLues = useMemo(() => pieces.filter((p) => p.branchId === branch.id), [pieces, branch.id]);
  /* LA REMISE QU'UN RENDEZ-VOUS PORTE : ce que ses lignes au catalogue
     valaient sans le code, moins ce qu'il vaut (son prix figé s'il en a un).
     Le catalogue le sait, le compteur ne le devine pas. */
  const remiseDuRdvXof = useMemo(() => {
    const parId = new Map(appts.map((a) => [a.id, a] as const));
    return (rdvId: string): number => {
      const a = parId.get(rdvId);
      if (!a) return 0;
      const sans: Appointment = { ...a, remisesLignes: undefined, codeOffre: undefined, priceXof: undefined };
      const avec = typeof a.priceXof === 'number' ? a.priceXof : apptTotalXof(a, byId);
      return Math.max(0, Math.round(apptTotalXof(sans, byId) - avec));
    };
  }, [appts, byId]);
  const compte = useMemo(() => compteParCode({
    codes: codesDeLaBranche, offres: offresDeLaBranche, envois: envoisLus, pieces: piecesLues, rdvs: appts,
    demandes: demandes as unknown as DemandeLue[], remiseDuRdvXof, maintenant,
  }), [codesDeLaBranche, offresDeLaBranche, envoisLus, piecesLues, appts, demandes, remiseDuRdvXof, maintenant]);
  const vivants = useMemo(
    () => codesDeLaBranche.filter((c) => !estUtilise(c) && !estExpire(c, maintenant)).sort((a, b) => a.expireLe.localeCompare(b.expireLe)),
    [codesDeLaBranche, maintenant],
  );
  const orphelins = useMemo(() => codesOrphelins(codesDeLaBranche, envoisLus), [codesDeLaBranche, envoisLus]);
  const cartesDeLaMaison = useMemo(() => compteDesCartes(cartes.filter((c) => c.branchId === branch.id), maintenant), [cartes, branch.id, maintenant]);
  const pieceParNumero = useMemo(() => new Map(piecesLues.map((p) => [p.number, p.id] as const)), [piecesLues]);

  const nominatifs = compte.lignes.filter((l) => l.envoyes !== 'public');
  const publics = compte.lignes.filter((l) => l.envoyes === 'public');
  const vivantsDeLAssistant = vivants.filter((c) => estUnCodeDeLAssistant(c.parQui)).length;
  const offresEnLigne = offresDeLaBranche.filter((o) => o.active);
  const sommeDesCreux = ctx.creux.reduce((s, j) => ({ poses: s.poses + j.poses, ordinaire: s.ordinaire + j.ordinaire, manque: s.manque + j.manque, remises: s.remises + j.remises }), { poses: 0, ordinaire: 0, manque: 0, remises: 0 });
  const pctRemises = plafond.remisesParSemaine > 0 ? Math.min(100, Math.round((100 * plafond.faites) / plafond.remisesParSemaine)) : 0;
  const pctFrancs = plafond.plafondFrancs > 0 ? Math.min(100, Math.round((100 * plafond.francs) / plafond.plafondFrancs)) : 0;
  const partDesMorts = compte.total.fabriques > 0 ? Math.round((100 * compte.total.perimes) / compte.total.fabriques) : null;
  const tete = remise ? clientDe(remise.clientId) : undefined;
  const lienDuCode = codeFait ? lienWaMe(clientDe(codeFait.clientId)?.phone, codeFait.message) : null;

  const ecrisLePlafond = () => {
    /* Un champ vidé ne vaut pas zéro : il garde le plafond d'avant. */
    const lu = (x: string) => { const d = x.replace(/\D/g, ''); return d ? Number(d) : undefined; };
    changeLePlafond({ remisesParSemaine: lu(nombre), plafondFrancs: lu(francsDuPlafond) }, qui);
  };
  /* ANNULER UN CODE VIVANT : la direction seule (RLS `promo_efface`). Le
     déclencheur de la table gèle les champs d'un code : on ne le « ferme »
     pas, on l'efface, et le compteur ne le voit plus. */
  const annuleLeCode = async (c: CodePromo) => {
    if (!direction) return;
    if (!await demande({
      quoi: 'Remise à son nom',
      titre: `Annuler le code ${c.code} ?`,
      dit: `${nomDe(c.clientId) || c.clientNom || 'Sa tête'} ne pourra plus le présenter ; il sort du compte des remises.`,
      scelle: 'Un code annulé ne se rallume pas : il faudrait en fabriquer un autre.',
      accepter: 'Annuler le code', refuser: 'Le garder', dur: true,
    })) return;
    codesPromoStore.set((prev) => prev.filter((x) => x.id !== c.id));
    toast(`Code ${c.code} annulé.`);
  };
  const copier = (texte: string) => {
    void navigator.clipboard?.writeText(texte).then(() => setCopie(true), () => setCopie(false));
  };
  const ouvreLeVolet = (v: VoletDesOffres) => { setVolet(v); setOuverte(null); setCodeOuvert(null); setMenu(false); };
  const ouvreLaLigne = (cle: string | null) => { setVolet(null); setCodeOuvert(null); setOuverte(cle); };
  const ouvreLeCode = (id: string | null) => { setVolet(null); setOuverte(null); setCodeOuvert(id); };
  const fermeTout = () => { setVolet(null); setOuverte(null); setCodeOuvert(null); };
  const avantageDit = (c: Pick<CodePromo, 'remisePct' | 'remiseXof'>): string =>
    (c.remisePct ? `−${c.remisePct} %` : c.remiseXof ? `−${francs(c.remiseXof)}` : 'sans avantage');

  /** L'avatar d'une ligne : le pourcentage d'un code de Perle (CREUX15 → « 15 % »), « Offre » pour une offre publique, « Nom » pour la remise à son nom. */
  const avatarDe = (l: LigneDuCompteur): string => {
    if (l.envoyes === 'public') return 'Offre';
    const m = l.libelle.match(/(\d+)$/);
    return m ? `${m[1]} %` : 'Nom';
  };
  /* LE COMPTE D'UNE LIGNE, à droite (18 novembre 2026) : ce qu'elle a coûté et rapporté, puis ses usages. */
  const compteDeLaLigne = (l: LigneDuCompteur) => {
    const estPublic = l.envoyes === 'public';
    return (
      <div className="trc-ger__panneau trc-of__panneau">
        <div className="trc-ger__pourquoi">
          <h4 className="trc-am__sous">Le compte <span>{l.quoi}</span></h4>
          <ul className="trc-am__puces">
            <li><span className="trc-am__cle">Envoyés</span> <span>{estPublic ? 'public, sans message compté' : l.envoyes}</span></li>
            <li><span className="trc-am__cle">Utilisés</span> <span>{l.utilises}{estPublic ? '' : ` · taux ${tauxDit(l.taux)}`}</span></li>
            <li><span className="trc-am__cle">Venues gagnées</span> <span>{l.venuesGagnees}</span></li>
            <li><span className="trc-am__cle">Remise réelle</span> <span>{francs(l.remiseReelleXof)}</span></li>
            <li><span className="trc-am__cle">CA encaissé</span> <span>{francs(l.caEncaisseXof)}</span></li>
            <li><span className="trc-am__cle">Rendement</span> <span>{rendementDit(l.rendement)}</span></li>
            {l.codes && (
              <li><span className="trc-am__cle">Codes</span> <span>{l.codes.fabriques} fabriqués · {l.codes.vivants} vivants · {l.codes.perimes} périmés sans servir · {l.codes.enCours} fenêtres de 14 jours ouvertes</span></li>
            )}
            <li><span className="trc-am__cle">Verdict</span> <span>{l.verdict.dit}</span></li>
          </ul>
        </div>
        <div className="trc-ger__pourquoi">
          <h4 className="trc-am__sous">Les usages <span>du plus récent au plus ancien</span></h4>
          {l.usages.length === 0
            ? <p className="trc-ger__doux">Aucun usage encore.</p>
            : (
              <div className="mnd-scroll-x">
                <table>
                  <thead><tr><th>Date</th><th>Pièce</th><th className="d">Remise</th><th>Cliente</th><th>Source</th></tr></thead>
                  <tbody>
                    {l.usages.map((u, i) => {
                      const pieceId = u.piece ? pieceParNumero.get(u.piece) : undefined;
                      const nom = u.clientId ? nomDe(u.clientId) : '';
                      return (
                        <tr key={`${u.code}-${u.jour}-${u.piece ?? u.rdvId ?? i}`}>
                          <td>{jourCourt(u.jour)}</td>
                          <td>
                            {pieceId
                              ? <button type="button" className="trc-ger__btn" onClick={() => navigate(`/factures?id=${pieceId}`)}>Ouvrir la pièce {u.piece}</button>
                              : (u.piece || '·')}
                          </td>
                          <td className="d">{francs(u.remiseXof)}</td>
                          <td title={nom || undefined}>{nom ? initiales(nom) : '·'}</td>
                          <td>{SOURCE_DITE[u.source]}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
        </div>
      </div>
    );
  };

  /** UNE LIGNE DU COMPTE, comme celles des Conversations : l'avatar, le code, ce qu'il a fait, son verdict. */
  const ligneDuCompte = (l: LigneDuCompteur) => {
    const ouvert = ouverte === l.cle && !volet;
    const estPublic = l.envoyes === 'public';
    return (
      <li key={l.cle} className={`trc-ger__rangee trc-of__rangee${ouvert ? ' est-ouverte' : ''}`}>
        <button type="button" className={`trc-ger__ligne trc-av__ligne${ouvert ? ' est-courante' : ''}`} aria-expanded={ouvert} onClick={() => ouvreLaLigne(ouvert ? null : l.cle)}>
          <span className={`trc-bx__avatar trc-of__avatar${estPublic ? ' est-public' : /\d+ %$/.test(avatarDe(l)) ? ' trc-av__avatar--cuivre' : ''}`} aria-hidden="true">{avatarDe(l)}</span>
          <span className="trc-av__corps">
            <span className="trc-av__haut">
              <span className="trc-ger__qui"><b>{l.libelle}{l.titre ? ` · ${l.titre}` : ''}</b><em>{l.quoi}</em></span>
              <span className="trc-av__age">{francs(l.caEncaisseXof)}</span>
            </span>
            <span className="trc-av__bas">
              <span className="trc-av__extrait">
                {estPublic
                  ? `${pluriel(l.utilises, 'usage', 'usages')} · public`
                  : `${l.envoyes} ${l.envoyes === 1 ? 'envoyé' : 'envoyés'} · ${l.utilises} ${l.utilises > 1 ? 'utilisés' : 'utilisé'} (${tauxDit(l.taux)})`}
                {` · ${pluriel(l.venuesGagnees, 'venue', 'venues')}`}
              </span>
              <span className="trc-am__droite"><PuceDuVerdict etat={l.verdict.etat} dit={l.verdict.dit} /></span>
            </span>
          </span>
        </button>
      </li>
    );
  };

  /** UN CODE (vivant ou orphelin), une ligne : le code, sa cliente, son avantage, jusqu'à quand. */
  const ligneDuCode = (c: CodePromo, orphelin = false) => {
    const nom = nomDe(c.clientId) || c.clientNom || 'sans fiche';
    const ouvert = codeOuvert === c.id && !volet;
    const deLAssistant = estUnCodeDeLAssistant(c.parQui);
    return (
      <li key={c.id} className={`trc-ger__rangee trc-of__rangee${ouvert ? ' est-ouverte' : ''}`}>
        <button type="button" className={`trc-ger__ligne trc-av__ligne${ouvert ? ' est-courante' : ''}`} aria-expanded={ouvert} onClick={() => ouvreLeCode(ouvert ? null : c.id)}>
          <span className={`trc-bx__avatar${deLAssistant ? ' trc-av__avatar--cuivre' : ''}`} aria-hidden="true">{initiales(nom)}</span>
          <span className="trc-av__corps">
            <span className="trc-av__haut">
              <span className="trc-ger__qui"><b>{c.code}</b><em>{deLAssistant ? 'Perle' : c.parQui || 'direction'}</em></span>
              <span className="trc-av__age">jusqu’à {instantDit(c.expireLe)}</span>
            </span>
            <span className="trc-av__bas">
              <span className="trc-av__extrait">{nom} · {avantageDit(c)}</span>
              <span className="trc-am__droite">{orphelin ? <em className="trc-am__puce trc-am__puce--terre">orphelin</em> : <em className="trc-am__puce trc-am__puce--cuivre">vivant</em>}</span>
            </span>
          </span>
        </button>
      </li>
    );
  };

  /** UN VOLET, à droite, avec sa tête : le plafond, l'annulation, les offres de saison, les jours creux, le code fabriqué. */
  const voletAPart = (titre: string, sous: string, contenu: ReactNode) => (
    <section className={`trc-bx__conv trc-bx__outil-pane${etroit ? ' trc-am__plein' : ''}`} aria-label={titre}>
      <div className={etroit ? 'trc-am__tete trc-bx__tete' : 'trc-bx__tete'}>
        <button type="button" className="trc-bx__icone" onClick={fermeTout} aria-label="Revenir"><ArrowLeft size={19} aria-hidden="true" /></button>
        <span className="trc-bx__nom trc-bx__nom--outil"><b>{titre}</b><span>{sous}</span></span>
      </div>
      <div className="trc-bx__outil-corps">{contenu}</div>
    </section>
  );

  const ligneOuverte = !volet && ouverte ? compte.lignes.find((l) => l.cle === ouverte) ?? null : null;
  const codeVu = !volet && codeOuvert ? [...vivants, ...orphelins].find((c) => c.id === codeOuvert) ?? null : null;
  const quelqueChoseOuvert = !!volet || !!ligneOuverte || !!codeVu;
  const listeDeLaPuce: ReactNode = puce === 'vivants'
    ? (vivants.length === 0 ? <p className="trc-ger__vide">Aucun code vivant.</p> : <ul className="trc-ger__liste trc-bx__lignes">{vivants.map((c) => ligneDuCode(c))}</ul>)
    : puce === 'orphelins'
      ? (orphelins.length === 0 ? <p className="trc-ger__vide">Aucun code orphelin : chaque code fabriqué a son message parti.</p> : <ul className="trc-ger__liste trc-bx__lignes">{orphelins.map((c) => ligneDuCode(c, true))}</ul>)
      : (() => {
        const lignes = puce === 'nom' ? nominatifs : puce === 'public' ? publics : [...nominatifs, ...publics];
        return lignes.length === 0
          ? <p className="trc-ger__vide">Aucun code ni offre codée pour l’instant : le compte se remplira au premier message parti ou à la première offre de saison.</p>
          : <ul className="trc-ger__liste trc-bx__lignes">{lignes.map(ligneDuCompte)}</ul>;
      })();

  return (
    <>
      <section className={`trc-bx trc-bx-vue trc-av trc-of${etroit && quelqueChoseOuvert ? ' est-ouverte' : ''}`} aria-label="Offres et remises">
        {/* LA LISTE : « Offres et remises », le plafond de la semaine, les puces, une ligne par code. */}
        <div className="trc-bx__liste">
          <div className="trc-bx__entete">
            <h2 className="trc-bx__titre">Offres et remises</h2>
            <button type="button" className="trc-bx__icone" aria-label="Remise à son nom" title="Remise à son nom" onClick={() => setRemise({ clientId: '', panneau: false })}><Plus size={19} aria-hidden="true" /></button>
            <span className="trc-bx__plus-zone" data-menu="">
              <button type="button" className={`trc-bx__icone trc-bx__plus${menu ? ' est-choisi' : ''}`} aria-label="Les outils des remises" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
                <EllipsisVertical size={19} aria-hidden="true" />
              </button>
              {menu && (
                <div className="trc-bx__menu-liste trc-bx__menu-outils" role="menu">
                  <button type="button" role="menuitem" onClick={() => { setMenu(false); setRemise({ clientId: '', panneau: false }); }}><b>Remise à son nom</b><span>une cliente, un pourcentage, 48 heures</span></button>
                  <button type="button" role="menuitem" disabled={!direction} onClick={() => ouvreLeVolet('plafond')}><b>Changer le plafond</b><span>{direction ? 'remises et francs de la semaine' : 'la direction seule'}</span></button>
                  <button type="button" role="menuitem" onClick={() => ouvreLeVolet('annuler')}><b>Annuler un code vivant</b><span>{direction ? `${pluriel(vivants.length, 'vivant', 'vivants')}` : 'la direction seule peut'}</span></button>
                  <button type="button" role="menuitem" onClick={() => ouvreLeVolet('saison')}><b>Offres de saison</b><span>l’éditeur · site et Ma Couronne</span></button>
                  <button type="button" role="menuitem" onClick={() => ouvreLeVolet('creux')}><b>Les jours creux</b><span>de 3 à 7 jours</span></button>
                  <Link role="menuitem" to="/cartes-cadeaux" onClick={() => setMenu(false)}><b>Cartes cadeaux</b><span>{pluriel(cartesDeLaMaison.vendues, 'vendue', 'vendues')}</span></Link>
                  <button type="button" role="menuitem" onClick={() => { setMenu(false); fermeTout(); }}><b>La vue d’ensemble</b><span>les quatre cartes</span></button>
                </div>
              )}
            </span>
          </div>
          {/* LE PLAFOND DE LA SEMAINE, toujours en tête : le même chiffre que la vue Aujourd'hui (`cerveau.plafond`). */}
          <div className="trc-of__plafond" aria-label="Le plafond de la semaine">
            <span className="trc-of__plafond-t">Cette semaine{direction && <button type="button" onClick={() => ouvreLeVolet('plafond')}>Changer</button>}</span>
            <span className="trc-of__jauge"><span><b>{plafond.faites} / {plafond.remisesParSemaine}</b> remises · {plafond.restantes} {plafond.restantes > 1 ? 'restantes' : 'restante'}</span><i><span style={{ width: `${pctRemises}%` }} /></i></span>
            <span className="trc-of__jauge"><span><b>{francs(plafond.francs)}</b> sur {francs(plafond.plafondFrancs)}</span><i><span style={{ width: `${pctFrancs}%` }} /></i></span>
          </div>
          <div className="trc-bx__commandes">
            <div className="trc-bx__segments" role="tablist" aria-label="Quels codes">
              {PUCES_DES_OFFRES.map((p) => {
                const choisi = puce === p.k;
                const n = p.k === 'nom' ? nominatifs.length : p.k === 'public' ? publics.length : p.k === 'vivants' ? vivants.length : p.k === 'orphelins' ? orphelins.length : 0;
                return (
                  <button key={p.k} type="button" role="tab" aria-selected={choisi} className={`${choisi ? 'est-choisi' : ''}${p.k === 'orphelins' && n > 0 ? ' est-vive' : ''}`} onClick={() => setPuce(p.k)}>
                    {p.dit}{p.k !== 'tous' && <em>{n}</em>}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="trc-bx__defile">{listeDeLaPuce}</div>
        </div>

        {volet === 'code' && codeFait ? voletAPart('Remise à son nom', 'code fabriqué', (
          <div className="trc-of__volet">
            <p className="trc-ger__doux">{nomDe(codeFait.clientId) || codeFait.code.clientNom} · <b>{codeFait.code.code}</b> · {avantageDit(codeFait.code)} · jusqu’à {instantDit(codeFait.code.expireLe)} · il compte dans le plafond de la semaine.</p>
            <div className="trc-ger__bulle"><span className="trc-ger__texte">{codeFait.message}</span></div>
            <div className="trc-am__gestes">
              {lienDuCode && <a className="trc-ger__btn trc-ger__btn--cuivre" href={lienDuCode} target="_blank" rel="noreferrer">Envoyer sur WhatsApp</a>}
              <button type="button" className="trc-ger__btn" onClick={() => copier(codeFait.message)}>{copie ? 'Copié' : 'Copier le message'}</button>
              <button type="button" className="trc-ger__btn trc-am__btn--calme" onClick={() => { setCodeFait(null); setCopie(false); fermeTout(); }}>Fermer</button>
            </div>
          </div>
        ))
          : volet === 'plafond' && direction ? voletAPart('Le plafond de la semaine', 'direction', (
            <div className="trc-of__volet">
              <div className="trc-ger__plafond">
                <label>
                  <span>Remises par semaine, tout compris</span>
                  <input type="text" inputMode="numeric" value={nombre} onChange={(e) => setNombre(e.target.value)} onBlur={ecrisLePlafond} />
                </label>
                <label>
                  <span>Plafond en francs par semaine</span>
                  <input type="text" inputMode="numeric" value={francsDuPlafond} onChange={(e) => setFrancsDuPlafond(e.target.value)} onBlur={ecrisLePlafond} />
                </label>
              </div>
              <p className="trc-ger__doux">Cette semaine : {pluriel(plafond.faites, 'remise à son nom', 'remises à son nom')}, {francs(plafond.francs)} engagés (jour creux, anniversaire, offre flash et remises de la direction comptent ensemble). À l’une des deux bornes, plus aucune remise : il écrit sans elle.</p>
            </div>
          ))
          : volet === 'annuler' ? voletAPart('Annuler un code vivant', direction ? 'direction seule' : 'la direction seule peut', (
            <div className="trc-of__volet">
              <p className="trc-am__resume"><b>{vivants.length}</b> {vivants.length > 1 ? 'vivants' : 'vivant'} · le plus pressé meurt {vivants[0] ? instantDit(vivants[0].expireLe) : 'jamais : aucun'}</p>
              {!direction && <p className="trc-ger__doux">Une remise est de l’argent qui sort : seule la direction annule un code. Tout le monde peut l’honorer au comptoir.</p>}
              {vivants.length === 0
                ? <p className="trc-ger__doux">Aucun code vivant : rien à annuler.</p>
                : (
                  <ul className="trc-ger__liste">
                    {vivants.map((c) => {
                      const nom = nomDe(c.clientId) || c.clientNom || 'sans fiche';
                      const deLAssistant = estUnCodeDeLAssistant(c.parQui);
                      return (
                        <li key={c.id} className="trc-ger__rangee trc-am__attente">
                          <span className={`trc-am__avatar${deLAssistant ? '' : ' trc-am__avatar--cuivre'}`} aria-hidden="true">{initiales(nom)}</span>
                          <span className="trc-am__qui">
                            <b>{c.code} <em className={`trc-am__puce${deLAssistant ? '' : ' trc-am__puce--cuivre'}`}>{deLAssistant ? 'Assistant' : c.parQui || 'direction'}</em></b>
                            <span>{nom} · {avantageDit(c)} · jusqu’à {instantDit(c.expireLe)}</span>
                          </span>
                          <span className="trc-am__gestes">
                            {direction && <button type="button" className="trc-ger__btn trc-ger__btn--alarme" onClick={() => { void annuleLeCode(c); }}>Annuler</button>}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
            </div>
          ))
          : volet === 'saison' ? voletAPart('Offres de saison', `l’éditeur · site et Ma Couronne · ${offresEnLigne.length} en ligne sur ${offresDeLaBranche.length}`, (
            <div className="trc-of__volet" id="am-offres-editeur"><EditeurDesOffres abonnes={abonnes} /></div>
          ))
          : volet === 'creux' ? voletAPart('Les jours creux', `de 3 à 7 jours · ${pluriel(sommeDesCreux.manque, 'place manquante', 'places manquantes')}`, (
            <div className="trc-of__volet">
              <p className="trc-ger__doux">Un jour est creux quand ses RDV posés sont sous l’ordinaire de ce jour de la semaine (les Prévisions). L’Assistant y ouvre autant de remises de {REMISE_CREUX_PCT} % qu’il manque de RDV, dans le plafond de la semaine. « Posés après l’envoi » et « remplissage final » attendent l’historique des jours creux (lot 5).</p>
              <div className="mnd-scroll-x">
                <table>
                  <thead><tr><th>Jour</th><th className="d">Posés</th><th className="d">Ordinaire</th><th className="d">Manque</th><th className="d">Remises</th><th className="d">Remplissage</th></tr></thead>
                  <tbody>
                    {ctx.creux.length === 0 && <tr><td colSpan={6} className="trc-ger__doux">Aucun jour creux dans la semaine qui vient.</td></tr>}
                    {ctx.creux.map((j) => (
                      <tr key={j.iso}>
                        <td>{jourDit(j.iso)}</td><td className="d">{j.poses}</td><td className="d">{j.ordinaire}</td><td className="d">{j.manque}</td><td className="d">{j.remises}</td>
                        <td className="d">{j.ordinaire > 0 ? `${Math.round((100 * j.poses) / j.ordinaire)} %` : '·'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
          : ligneOuverte ? voletAPart(`${ligneOuverte.libelle}${ligneOuverte.titre ? ` · ${ligneOuverte.titre}` : ''}`, `${ligneOuverte.quoi} · ${ligneOuverte.verdict.dit}`, compteDeLaLigne(ligneOuverte))
          : codeVu ? voletAPart(codeVu.code, `${nomDe(codeVu.clientId) || codeVu.clientNom || 'sans fiche'} · ${avantageDit(codeVu)} · jusqu’à ${instantDit(codeVu.expireLe)}`, (
            <div className="trc-of__volet">
              <ul className="trc-am__puces">
                <li><span className="trc-am__cle">Cliente</span> <span>{nomDe(codeVu.clientId) || codeVu.clientNom || 'sans fiche'}</span></li>
                <li><span className="trc-am__cle">Avantage</span> <span>{avantageDit(codeVu)}</span></li>
                <li><span className="trc-am__cle">Jusqu’à</span> <span>{instantDit(codeVu.expireLe)}</span></li>
                <li><span className="trc-am__cle">Fabriqué par</span> <span>{estUnCodeDeLAssistant(codeVu.parQui) ? 'Perle' : codeVu.parQui || 'la direction'}</span></li>
                {orphelins.some((c) => c.id === codeVu.id) && <li><span className="trc-am__cle">Orphelin</span> <span className="trc-am__alarme">fabriqué sans message parti : il doit tomber à zéro</span></li>}
              </ul>
              <div className="trc-am__gestes">
                {codeVu.clientId && <Link className="trc-ger__btn" to={`/gerard?vue=conversations&c=${codeVu.clientId}`}>Ouvrir sa conversation</Link>}
                {direction && vivants.some((c) => c.id === codeVu.id) && <button type="button" className="trc-ger__btn trc-ger__btn--alarme" onClick={() => { void annuleLeCode(codeVu); }}>Annuler ce code</button>}
              </div>
            </div>
          ))
          : !etroit ? (
            /* SANS RIEN D'OUVERT : la vue d'ensemble. Rien de factice : sans proposition d'offre flash, la carte le dit. */
            <section className="trc-bx__conv trc-av__accueil" aria-label="La vue d’ensemble">
              <div className="trc-av__accueil-corps">
                <h3 className="trc-of__titre">La seule porte pour tout ce qui baisse un prix</h3>
                <div className="trc-av__chiffres">
                  <span><b>{vivants.length}</b>codes vivants · Perle {vivantsDeLAssistant}, direction {vivants.length - vivantsDeLAssistant}</span>
                  <span className={orphelins.length ? 'est-alarme' : ''}><b>{orphelins.length}</b>codes orphelins · doit être 0</span>
                  <span><b>{compte.total.venuesGagnees}</b>{compte.total.venuesGagnees > 1 ? 'venues gagnées' : 'venue gagnée'} · rendement {rendementDit(compte.total.rendement)}</span>
                </div>
                <p className="trc-am__resume trc-of__resume">
                  <b>{compte.total.lignes}</b> {compte.total.lignes > 1 ? 'nominatifs' : 'nominatif'} · {compte.total.envoyes} envoyés · {compte.total.utilises} utilisés ({tauxDit(compte.total.taux)}) · {compte.total.venuesGagnees} venues
                  {' · '}{francs(compte.total.remiseReelleXof)} de remise · {francs(compte.total.caEncaisseXof)} encaissés · rendement {rendementDit(compte.total.rendement)}
                  {partDesMorts !== null ? ` · codes morts ${partDesMorts} %` : ''}
                  {publics.length ? ` · publics ${compte.publics.lignes} (${compte.publics.usages} usages, ${francs(compte.publics.caEncaisseXof)} encaissés)` : ''}
                </p>
                <div className="trc-am__cartes trc-av__cartes">
                  <div className="trc-am__carte trc-am__carte--cuivre">
                    <span className="trc-am__sur">Offre flash proposée</span>
                    <b>aucune proposition</b>
                    <p>L’Assistant ne fabrique encore que CREUX {REMISE_CREUX_PCT} % et ANNIV {REMISE_ANNIV_PCT} % ; l’offre flash d’un jour creux (J-3 à J-7, deux places qui manquent) arrive au lot 5.</p>
                  </div>
                  <div className="trc-am__carte">
                    <span className="trc-am__sur">Jours creux</span>
                    <b>{sommeDesCreux.poses} {sommeDesCreux.poses > 1 ? 'places' : 'place'} sur {sommeDesCreux.ordinaire}</b>
                    <p>{pluriel(ctx.creux.length, 'jour creux', 'jours creux')} de 3 à 7 jours · {pluriel(sommeDesCreux.manque, 'place manquante', 'places manquantes')} · {pluriel(sommeDesCreux.remises, 'remise ouverte', 'remises ouvertes')}</p>
                    <div className="trc-am__gestes"><button type="button" className="trc-ger__btn" onClick={() => ouvreLeVolet('creux')}>Voir les jours creux</button></div>
                  </div>
                  <div className="trc-am__carte">
                    <span className="trc-am__sur">Offres de saison</span>
                    <b>{offresEnLigne.length} en ligne <small style={{ fontSize: 14, color: 'var(--ink-soft)' }}>· {offresDeLaBranche.length} offres</small></b>
                    <p>
                      {offresEnLigne.length === 0
                        ? 'Aucune offre en ligne ; les sept saisons et les cinq parcours attendent d’être allumés.'
                        : offresEnLigne.map((o) => `${o.code ?? o.title}${o.au ? ` jusqu’au ${jourDit(o.au)}` : ''}${(() => { const l = compte.lignes.find((x) => x.cle === `offre:${o.id}`); return l ? `, ${pluriel(l.utilises, 'usage', 'usages')}` : ''; })()}`).join(' · ')}
                    </p>
                    <div className="trc-am__gestes"><button type="button" className="trc-ger__btn trc-ger__btn--cuivre" onClick={() => ouvreLeVolet('saison')}>Créer une offre</button></div>
                  </div>
                  <div className="trc-am__carte trc-am__carte--or">
                    <span className="trc-am__sur">Cartes cadeaux</span>
                    <b>{pluriel(cartesDeLaMaison.vendues, 'vendue', 'vendues')}</b>
                    <p>{francs(cartesDeLaMaison.encoreDuXof)} encore dus en soins · {cartesDeLaMaison.venduesCeMois} ce mois · à régler {cartesDeLaMaison.aRegler} · à envoyer ou remettre {cartesDeLaMaison.aEnvoyerOuRemettre} · attendent leur visite {cartesDeLaMaison.attendentLeurVisite}. L’Assistant relie, il ne fabrique aucun code.</p>
                    <div className="trc-am__gestes"><Link className="trc-ger__btn" to="/cartes-cadeaux">Ouvrir les cartes</Link></div>
                  </div>
                </div>
                {/* LES GESTES : une remise à son nom (une cliente, puis le panneau), le plafond et l'annulation, direction seule. */}
                <div className="trc-am__gestes">
                  <button type="button" className="trc-ger__btn trc-ger__btn--cuivre" onClick={() => setRemise({ clientId: '', panneau: false })}>Remise à son nom</button>
                  <button type="button" className="trc-ger__btn trc-am__btn--calme" disabled={!direction} title={direction ? undefined : 'La direction seule change le plafond.'} onClick={() => ouvreLeVolet('plafond')}>Changer le plafond</button>
                  <button type="button" className="trc-ger__btn trc-am__btn--calme" onClick={() => ouvreLeVolet('annuler')}>Annuler un code vivant{direction ? '' : ' · direction seule'}</button>
                </div>
                <p className="trc-ger__doux">Venue gagnée = RDV posé dans les 14 jours après le code, honoré, encaissé ; une par cliente et par fenêtre. Rendement = encaissé ÷ remise réelle. Le verdict ne parle qu’à partir de 20 envois : utile si un code sur dix sert et que chaque franc remisé en rapporte trois, à éteindre sans venue ou sous un franc rendu.</p>
              </div>
            </section>
          ) : null}
      </section>

      {/* REMISE À SON NOM : une cliente d'abord (la vue n'a pas de fil ouvert), puis le panneau qui fabrique le code. */}
      {remise && !remise.panneau && (
        <div className="trc-modal-fond" onClick={() => setRemise(null)}>
          <div className="trc-modal" onClick={(e) => e.stopPropagation()}>
            <div className="trc-modal__t">Remise à son nom</div>
            <p className="trc-sub" style={{ marginTop: 0 }}>
              Une cliente, un pourcentage, 48 heures, une prestation ou tout le rituel. Le code compte dans le plafond de la semaine ({plafond.faites} / {plafond.remisesParSemaine}).
              {direction ? '' : ' Seule la direction fabrique un code ; tout le monde peut l’honorer au comptoir.'}
            </p>
            <Field label="La cliente">
              <ClientPicker value={remise.clientId} onChange={(id) => setRemise({ clientId: id, panneau: false })} placeholder="Chercher sa fiche…" />
            </Field>
            <div className="trc-am__gestes" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
              <button type="button" className="trc-ger__btn" onClick={() => setRemise(null)}>Annuler</button>
              <button type="button" className="trc-ger__btn trc-ger__btn--cuivre" disabled={!remise.clientId} onClick={() => setRemise({ clientId: remise.clientId, panneau: true })}>Continuer</button>
            </div>
          </div>
        </div>
      )}
      {remise?.panneau && tete && (
        <PanneauDeLaPromo
          tete={{ id: tete.id, name: tete.name }}
          estDirection={direction}
          parQui={moi?.name ?? undefined}
          vivants={codesVivantsDe(codes, tete.id, maintenant, branch.id)}
          surCode={(c, message) => { setCodeFait({ clientId: tete.id, code: c, message }); setCopie(false); setRemise(null); ouvreLeVolet('code'); }}
          surFermer={() => setRemise(null)}
        />
      )}
    </>
  );
}
