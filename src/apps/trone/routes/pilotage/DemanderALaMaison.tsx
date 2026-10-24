import { useEffect, useState } from 'react';
import { useBranch } from '../../../../shared/branches';
import { useStaff as useMonProfil } from '../../../../shared/auth';
import { fmtMoney } from '../../../../shared/currency';
import { useInvoices, invoiceResteXof } from '../../../../shared/finance';
import { useFil, demandeOuverte, estDemande } from '../../../../shared/fil';
import { useProjets } from '../../../../shared/projets';
import { NOMS_DES_ETATS, avancementDe, dateCourte, etatDuProjet, type TacheDuProjet } from '../../../../shared/projets-pur';
import { demandeAClaude, versionDeIaMaison } from '../../../../shared/ia-maison';
import { saitLeTableauIntelligent } from '../../../../shared/ia-maison-pur';
import { demandeDeQuestion, type ContexteDeLaMaison } from '../../../../shared/ia-tableau-pur';
import { statsDuProcessus } from '../../../../shared/processus-pur';
import { useLesProcessus } from './agents-donnees';
import type { DonneesDeLaPrevision } from './PrevisionDuMois';
import './prevision.css';

/* ═══════════════════════════════════════════════════════════════════
   DEMANDER À LA MAISON — 24 octobre 2026, maquette VJ5PJEGUPDbYKUgEdMUNbS
   (vue 1, « Demander à la Maison… »). Une question, et l'assistant répond
   avec le seul contexte que le Trône lui donne : la prévision et ses parts,
   la journée, les créances, l'état des projets, ce qui attend les agents.
   DES SOMMES ET DES NOMS DE PROJETS : jamais une cliente, jamais le texte
   d'une tâche (il pourrait en nommer une). La direction seule. */

/* Le tiret cadratin devient une virgule (règle de la Maison) ; écrit par
   son code pour que le texte de l'écran n'en porte aucun. */
const SANS_TIRET = new RegExp(`\\s*${String.fromCharCode(8212)}\\s*`, 'g');

export function DemanderALaMaison({ prevision, jour }: { prevision: DonneesDeLaPrevision; jour: string }) {
  const { branch, currency } = useBranch();
  const monProfil = useMonProfil();
  const [invoices] = useInvoices();
  const [fil] = useFil();
  const [projets] = useProjets();
  const { processus, passages } = useLesProcessus();
  const [claude, setClaude] = useState(false);
  const [question, setQuestion] = useState('');
  const [fils, setFils] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [enCours, setEnCours] = useState(false);
  const [refus, setRefus] = useState('');
  useEffect(() => { let v = true; void versionDeIaMaison().then((x) => { if (v) setClaude(saitLeTableauIntelligent(x)); }); return () => { v = false; }; }, []);

  const direction = monProfil?.role === 'souverain' || monProfil?.role === 'gerant';
  if (!direction || !claude) return null;

  /* Le contexte se compose au moment de demander, pas à chaque affichage. */
  const contexte = (): ContexteDeLaMaison => {
    const fmt = (x: number) => fmtMoney(x, currency);
    const avecReste = invoices.filter((i) => i.branchId === branch.id && i.kind === 'facture' && invoiceResteXof(i) > 0);
    const taches: TacheDuProjet[] = fil
      .filter((m) => m.branchId === branch.id && estDemande(m) && !!m.projetId)
      .map((m) => ({ id: m.id, texte: '', projetId: m.projetId, jalonId: m.jalonId, echeance: m.echeance, close: !demandeOuverte(m, invoices) }));
    return {
      aujourdhui: dateCourte(prevision.today),
      jour,
      prevision: [`Fin du mois : ${fmt(prevision.prevision.centraleXof)} (de ${fmt(prevision.prevision.basXof)} à ${fmt(prevision.prevision.hautXof)}).`, ...prevision.lignes.map((l) => l.dit), `Les mois passés : ${prevision.moisPasses.join(' ; ')}.`],
      creances: `${avecReste.length} factures doivent encore ${fmt(avecReste.reduce((s, i) => s + invoiceResteXof(i), 0))}.`,
      projets: projets.filter((p) => p.branchId === branch.id && p.statut !== 'clos').map((p) => {
        const leurs = taches.filter((t) => t.projetId === p.id);
        const av = avancementDe(leurs);
        return `${p.nom} (pilote ${p.piloteNom.split(/\s+/)[0]}) : ${NOMS_DES_ETATS[etatDuProjet(p, leurs, prevision.today)].toLowerCase()}, ${av.faites} tâches faites sur ${av.total}, fin prévue le ${dateCourte(p.fin)}.`;
      }),
      agents: processus.map((p) => {
        const s = statsDuProcessus(passages, p.id);
        return `${p.nom} : ${p.actif ? 'allumé' : 'éteint'}, ${s.aValider} à valider, ${s.ecrits + s.poses} écrites ou posées en deux mois.`;
      }),
    };
  };

  const demander = async () => {
    const q = question.trim();
    if (!q) return;
    setEnCours(true); setRefus('');
    const r = await demandeAClaude(demandeDeQuestion(q, contexte(), fils));
    setEnCours(false);
    if (!r.ok) { setRefus(r.message); return; }
    const texte = (r.texte || '').replace(SANS_TIRET, ', ').trim();
    setFils((f) => [...f, { role: 'user' as const, content: q }, { role: 'assistant' as const, content: texte }].slice(-8));
    setQuestion('');
  };

  return (
    <section className="trp-demander" aria-label="Demander à la Maison">
      <form className="trp-demander__champ" onSubmit={(e) => { e.preventDefault(); void demander(); }}>
        <label htmlFor="trp-demander" className="trp-demander__masque">Demander à la Maison</label>
        <input id="trp-demander" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Demander à la Maison… « pourquoi novembre s’annonce plus calme ? »" disabled={enCours} />
        <button type="submit" disabled={enCours || !question.trim()}>{enCours ? 'L’assistant lit…' : 'Demander'}</button>
      </form>
      {refus && <p className="trp-prev__note">{refus}</p>}
      {fils.length > 0 && (
        <div className="trp-demander__fil">
          {fils.map((m, i) => (
            <p key={i} className={m.role === 'user' ? 'trp-demander__moi' : 'trp-demander__lui'}>{m.content}</p>
          ))}
          <button type="button" className="trp-prev__lien" onClick={() => setFils([])}>Effacer la conversation</button>
        </div>
      )}
    </section>
  );
}
