import { useEffect, useMemo, useRef, useState } from 'react';
import { Mic } from 'lucide-react';
import { toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { uid, useStore } from '../../../../shared/store';
import { useStaff } from '../../../../shared/auth';
import {
  useExpenses, useCashboxes, useExpenseCategories, usePorteurs, caissesPourLEquipe, type Expense, type PieceJointe,
} from '../../../../shared/finance';
import { useProviders } from '../../../../shared/prestataires';
import { laCaisseDuPaiement } from '../../../../shared/caisses-des-caissiers-pur';
import {
  CAISSE_PAR_DEFAUT, depenseDeLaPhrase, ditLaLecture, enregistreeAcquise, francs, jugeLaPhrase, lisLaPhrase,
  type ContexteDeLaPhrase,
} from '../../../../shared/depense-en-une-phrase-pur';
import { fabriqueDOreille, DIT_L_ERREUR_DE_L_OREILLE, type Oreille } from '../../../../shared/oreille';
import { staffAccessStore, useMaFiche } from '../equipe/data';
import { peutVoir } from '../index';
import { todayISO, ChampPieceJointe } from './_shared';
import './depenses-preparees.css';

/* ══ ENREGISTRER UNE DÉPENSE, EN UNE PHRASE — 5 novembre 2026 ══════════════
   Maquette « Les dépenses préparées par Grenat » (FyXznPQfTLKnL5MQgbn4C1),
   validée. En tête de Finances › Dépenses et de la Caisse : une case, un
   bouton « Dicter » (l'oreille de la Dictée MND), et « Grenat lit : … »
   AVANT de rien poser. La phrase se lit par des règles, sans IA payante
   (`shared/depense-en-une-phrase-pur`).

   LA DÉPENSE PASSE PAR LE MAGASIN DES DÉPENSES, comme « + Dépense » : écrite
   par la direction, elle s'enregistre acquise (c'est déjà son oui) ; écrite
   par l'équipe, elle attend la validation (`soumisPar` son nom), et la
   clôture de Grenat la met sous les yeux. Jamais deux fois, jamais un
   prestataire, rien de la famille : `jugeLaPhrase` le dit, et rien ne part. */

type Ecoute = 'repos' | 'ecoute';

export function DepenseEnUnePhrase({ ou = 'depenses' }: { ou?: 'depenses' | 'caisse' }) {
  const { branch } = useBranch();
  const moi = useStaff();
  const [acces] = useStore(staffAccessStore);
  const mesDomaines = acces[moi?.user_id ?? ''] ?? {};
  const role = moi?.role;
  const monNom = (moi?.name ?? '').trim();
  const voitTout = role !== 'maitre' || mesDomaines.finances === true;
  const maFiche = useMaFiche();
  const [toutes, setExpenses] = useExpenses();
  const [boites] = useCashboxes();
  const [categories] = useExpenseCategories();
  const [porteurs] = usePorteurs();
  const [prestataires] = useProviders();

  const [phrase, setPhrase] = useState('');
  const [choixCategorie, setChoixCategorie] = useState('');
  const [choixCaisse, setChoixCaisse] = useState('');
  const [fichier, setFichier] = useState<PieceJointe | undefined>(undefined);
  const [dit, setDit] = useState<{ ton: 'ok' | 'non'; texte: string } | null>(null);
  const [ecoute, setEcoute] = useState<Ecoute>('repos');
  const oreille = useRef<Oreille | null>(null);
  const entendu = useRef<string[]>([]);

  /* Les caisses que ce compte peut choisir : toutes pour la direction, la
     sienne (ou celles de l'équipe) pour un compte restreint. */
  const caisses = useMemo(() => caissesPourLEquipe(
    boites.filter((c) => c.branchId === branch.id && !c.archiveeLe), voitTout, maFiche?.id,
  ), [boites, branch.id, voitTout, maFiche?.id]);
  const ctx = useMemo<ContexteDeLaPhrase>(() => {
    const noms = caisses.map((c) => c.name);
    const ici = (c?: { name: string }) => (c && noms.includes(c.name) ? c.name : undefined);
    /* « espèces » : la caisse par défaut (celle d'Opale), sinon la caisse des
       espèces, sinon la seule caisse que ce compte a. */
    const especes = noms.includes(CAISSE_PAR_DEFAUT) ? CAISSE_PAR_DEFAUT
      : ici(laCaisseDuPaiement(caisses, branch.id, 'especes')) ?? (noms.length === 1 ? noms[0] : undefined);
    return {
      aujourdhui: todayISO(),
      caisses: noms,
      caisseDesEspeces: especes,
      caisseMomo: ici(laCaisseDuPaiement(caisses, branch.id, 'momo')),
      caisseMomoPrive: ici(laCaisseDuPaiement(caisses, branch.id, 'momoPrive')),
      porteurs,
      categories: categories.map((c) => ({ name: c.name, subs: c.subs })),
      ...(voitTout ? {} : { signeDe: monNom || 'Sans nom' }),
    };
  }, [caisses, branch.id, porteurs, categories, voitTout, monNom]);

  const lue = useMemo(() => {
    if (!phrase.trim()) return null;
    const l = lisLaPhrase(phrase, ctx);
    /* Ce que la main a corrigé passe devant ce que Grenat a lu. */
    if (choixCategorie && ctx.categories.some((c) => c.name === choixCategorie) && choixCategorie !== l.categorie) {
      return { ...l, categorie: choixCategorie, sousCategorie: undefined, categorieDevinee: true };
    }
    return l;
  }, [phrase, ctx, choixCategorie]);
  const lecture = useMemo(() => {
    if (!lue || !choixCaisse || !ctx.caisses.includes(choixCaisse) || choixCaisse === lue.caisse) return lue;
    const questions = lue.questions.filter((q) => !/caisse/i.test(q));
    return { ...lue, caisse: choixCaisse, caisseDite: 'nom' as const, questions, laMaisonAPaye: lue.porteur ? lue.laMaisonAPaye : true };
  }, [lue, choixCaisse, ctx.caisses]);
  const jugement = useMemo(() => (lecture ? jugeLaPhrase(lecture, { branchId: branch.id, existantes: toutes, prestataires }) : null), [lecture, branch.id, toutes, prestataires]);

  useEffect(() => () => { try { oreille.current?.abort(); } catch { /* déjà arrêtée */ } }, []);

  const peutDicter = fabriqueDOreille() !== null && peutVoir(role, '/dictee', mesDomaines);
  const acquise = enregistreeAcquise(role);

  const dicte = () => {
    if (ecoute === 'ecoute') { try { oreille.current?.stop(); } catch { setEcoute('repos'); } return; }
    const Fabrique = fabriqueDOreille();
    if (!Fabrique) return;
    entendu.current = [];
    setDit(null);
    const o = new Fabrique();
    o.lang = 'fr-FR'; o.continuous = false; o.interimResults = true; o.maxAlternatives = 1;
    o.onresult = (e) => {
      let suspens = '';
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const r = e.results[i];
        const t = (r[0]?.transcript ?? '').trim();
        if (!t) continue;
        if (r.isFinal) entendu.current.push(t); else suspens += `${t} `;
      }
      setPhrase(`${entendu.current.join(' ')} ${suspens}`.replace(/\s+/g, ' ').trim());
    };
    o.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      setDit({ ton: 'non', texte: DIT_L_ERREUR_DE_L_OREILLE[e.error] ?? `Le micro dit : ${e.error}.` });
    };
    o.onend = () => setEcoute('repos');
    oreille.current = o;
    try { o.start(); setEcoute('ecoute'); } catch { setEcoute('repos'); }
  };

  const efface = () => { setPhrase(''); setChoixCategorie(''); setChoixCaisse(''); setFichier(undefined); };

  const pose = () => {
    if (!lecture || !jugement) return;
    /* Le juge relit le magasin AU MOMENT DU GESTE : une dépense arrivée d'un
       autre poste entre la frappe et le toucher compte comme doublon. */
    const j = jugeLaPhrase(lecture, { branchId: branch.id, existantes: toutes, prestataires });
    if (!j.ok) { setDit({ ton: 'non', texte: j.dit }); return; }
    const e = depenseDeLaPhrase(lecture, {
      id: uid(), branchId: branch.id, role, nom: monNom, maintenantISO: new Date().toISOString(), fichier,
    }) as unknown as Expense;
    setExpenses((prev) => [e, ...prev]);
    const texte = acquise
      ? `Enregistrée : ${lecture.libelle}, ${francs(lecture.montantXof ?? 0)}. Elle compte déjà, c’est votre oui.`
      : `Préparée : ${lecture.libelle}, ${francs(lecture.montantXof ?? 0)}. Elle attend la validation de la direction.`;
    setDit({ ton: 'ok', texte });
    toast(texte);
    efface();
  };

  const lu = lecture ? ditLaLecture(lecture, ctx.aujourdhui) : '';
  const bloque = !lecture || !jugement || !jugement.ok;
  const raison = jugement && !jugement.ok ? jugement.dit : '';

  /* À LA CAISSE, pour qui ouvre aussi les Dépenses : sans elles, on ne suit
     pas ce qu'on a soumis, et on le resaisirait. (Tous les crochets sont
     au-dessus de ce retour.) */
  if (ou === 'caisse' && !peutVoir(role, '/depenses', mesDomaines)) return null;

  return (
    <div className={`dpg-phrase${ou === 'caisse' ? ' dpg-phrase--caisse' : ''}`} data-phrase="case">
      <label className="dpg-phrase__sur" htmlFor={`dpg-mot-${ou}`}>Enregistrer une dépense, en une phrase</label>
      <div className="dpg-phrase__ligne">
        <input
          id={`dpg-mot-${ou}`}
          className="mnd-input dpg-phrase__mot"
          type="text"
          value={phrase}
          maxLength={200}
          autoComplete="off"
          placeholder="Transport des produits 3 000 F espèces, payé par Brice"
          onChange={(e) => { setPhrase(e.target.value); setDit(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !bloque) { e.preventDefault(); pose(); } }}
        />
        {peutDicter && (
          <button type="button" className={`trf-act dpg-phrase__dicter${ecoute === 'ecoute' ? ' is-ecoute' : ''}`} data-phrase="dicter"
            aria-pressed={ecoute === 'ecoute'} title="La Dictée MND : parlez, la phrase s’écrit" onClick={dicte}>
            <Mic size={14} /> {ecoute === 'ecoute' ? 'J’écoute…' : 'Dicter'}
          </button>
        )}
        <button type="button" className="trf-act dpg-phrase__poser" data-phrase="poser" disabled={bloque} onClick={pose}>
          {acquise ? 'Enregistrer' : 'Préparer'}
        </button>
      </div>
      {lecture && (
        <div className="dpg-phrase__lu" data-phrase="lu" aria-live="polite">
          <p>{lu}</p>
          {raison && <p className="dpg-phrase__demande" data-phrase="demande">{jugement?.ok === false && jugement.pourquoi === 'questions' ? `Grenat demande : ${raison}` : raison}</p>}
          {!raison && (
            <p className="dpg-phrase__etat">
              {acquise ? 'Elle s’enregistre validée : c’est votre oui.' : 'Elle part à valider : la direction dira oui.'}
            </p>
          )}
          {(lecture.montantXof !== undefined || lecture.libelle) && (
            <div className="dpg-phrase__corrige">
              <select className="mnd-select" aria-label="La catégorie" value={lecture.categorie}
                onChange={(e) => setChoixCategorie(e.target.value)}>
                {ctx.categories.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
              {!lecture.avancee && (
                <select className="mnd-select" aria-label="La caisse" value={lecture.caisse ?? ''}
                  onChange={(e) => setChoixCaisse(e.target.value)}>
                  {!lecture.caisse && <option value="">De quelle caisse ?</option>}
                  {ctx.caisses.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
              <ChampPieceJointe branchId={branch.id} dossier="depense" valeur={fichier} onChange={setFichier} />
            </div>
          )}
        </div>
      )}
      {!lecture && dit && <p className={`dpg-phrase__dit is-${dit.ton}`} data-phrase="dit">{dit.texte}</p>}
    </div>
  );
}

export default DepenseEnUnePhrase;
