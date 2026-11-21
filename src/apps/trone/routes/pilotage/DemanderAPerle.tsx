import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic } from 'lucide-react';
import { PageHead } from '../_ui';
import { Button } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { useStaff } from '../../../../shared/auth';
import { createStore, uid, useStore } from '../../../../shared/store';
import { demandeAClaude, versionDeIaMaison } from '../../../../shared/ia-maison';
import { dollarsDits, saitInternet, saitLeTableauIntelligent, type MessageIa, type SourceInternet } from '../../../../shared/ia-maison-pur';
import {
  QUESTIONS_PROPOSEES, demandeDInternet, demandeDeLaReponse, demandeDuPlan, ecransLus, momentDit, planLu, reponsePropre, sourcesPropres, type FaitLu,
} from '../../../../shared/perle-pur';
import { usePerle } from './perle-donnees';
import './demander-a-perle.css';

/* ══ DEMANDER À PERLE — 21 novembre 2026 ═════════════════════════════════
   Maquette 7XvdzJ99bioQsv62r5cBrw (« Construis, la direction seule,
   questions et En direct d'abord »). À gauche la conversation : une
   question, écrite ou dictée, et la réponse de Perle avec les faits que le
   Trône vient de lire, les écrans d'où ils viennent, et ce que la réponse a
   coûté. À droite « En direct », que le Trône calcule seul, sans IA.

   PREMIER LOT : ELLE LIT ET RÉPOND. Aucun bouton ici n'envoie un message, ne
   pose un rendez-vous ni ne touche à l'argent : ils ouvrent des écrans.

   La conversation reste sur ce poste, une liste par personne, jamais reliée
   au serveur (comme « Rechercher ») : la direction y écrit des noms. */

type Echange = {
  id: string; question: string; reponse: string; ecrans: { nom: string; chemin: string }[]; quand: string; coutUsd?: number;
  /** Cherchée sur internet (21 novembre 2026) : ses sources, et la réponse coupée si elle l'a été. */
  internet?: boolean; sources?: SourceInternet[]; coupee?: boolean;
};
const ECHANGES_GARDES = 30;
const SIGNES_MAX = 1200;
const filDePerleStore = createStore<Record<string, Echange[]>>('mnd_perle_fil', {});

/** La reconnaissance vocale du navigateur (celle de Perle au comptoir) : le micro n'apparaît pas sans elle. */
type Reconnaissance = {
  lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null; onerror: (() => void) | null;
};
const creeLaReconnaissance = (): Reconnaissance | null => {
  const w = window as unknown as { SpeechRecognition?: new () => Reconnaissance; webkitSpeechRecognition?: new () => Reconnaissance };
  const Classe = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Classe ? new Classe() : null;
};

/** La réponse, en paragraphes ; les lignes qui commencent par un tiret font une liste. */
function Reponse({ texte }: { texte: string }) {
  const blocs: ({ genre: 'p'; texte: string } | { genre: 'liste'; lignes: string[] })[] = [];
  for (const brute of texte.split('\n')) {
    const ligne = brute.trim();
    if (!ligne) continue;
    const item = /^[-•]\s+(.*)$/.exec(ligne);
    const dernier = blocs[blocs.length - 1];
    if (item) {
      if (dernier?.genre === 'liste') dernier.lignes.push(item[1]);
      else blocs.push({ genre: 'liste', lignes: [item[1]] });
    } else blocs.push({ genre: 'p', texte: ligne });
  }
  return (
    <>
      {blocs.map((b, i) => (b.genre === 'p'
        ? <p key={i}>{b.texte}</p>
        : <ul key={i}>{b.lignes.map((l, k) => <li key={k}>{l}</li>)}</ul>))}
    </>
  );
}

export default function DemanderAPerle() {
  const { branch } = useBranch();
  const moi = useStaff();
  const navigate = useNavigate();
  const perle = usePerle();
  const [fils, setFils] = useStore(filDePerleStore);
  const cle = moi?.user_id ?? '';
  const fil = fils[cle] ?? [];
  const [question, setQuestion] = useState('');
  const [enCours, setEnCours] = useState('');
  const [refus, setRefus] = useState('');
  const [claude, setClaude] = useState<boolean | null>(null);
  /* Internet ne se propose que si la fonction posée sait chercher. */
  const [internet, setInternet] = useState(false);
  const [ecoute, setEcoute] = useState(false);
  const reco = useRef<Reconnaissance | null>(null);
  const bas = useRef<HTMLDivElement | null>(null);
  /* Le micro ne se montre que si le navigateur sait écouter (lu une fois). */
  const [aLeMicro] = useState(() => {
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    return !!(w.SpeechRecognition ?? w.webkitSpeechRecognition);
  });

  useEffect(() => { let v = true; void versionDeIaMaison().then((x) => { if (v) { setClaude(saitLeTableauIntelligent(x)); setInternet(saitInternet(x)); } }); return () => { v = false; }; }, []);
  useEffect(() => () => { reco.current?.stop(); }, []);
  useEffect(() => { bas.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [fil.length, enCours]);

  const direction = moi?.role === 'souverain' || moi?.role === 'gerant';
  if (!direction) {
    return (
      <div className="trp-perle">
        <PageHead eyebrow={`Le Trône · ${branch.city}`} title="Demander à Perle" sub="Cet écran est réservé à la direction." />
      </div>
    );
  }

  const garde = (e: Echange) => setFils((tous) => ({ ...tous, [cle]: [...(tous[cle] ?? []), e].slice(-ECHANGES_GARDES) }));

  const demander = async (texte?: string) => {
    const q = (texte ?? question).trim().slice(0, SIGNES_MAX);
    if (!q || enCours) return;
    reco.current?.stop();
    setRefus('');
    setEnCours('Perle lit la question…');
    try {
      /* Les tours d'avant, anonymisés comme la question : elle suit « et hier ? ». */
      const avant: MessageIa[] = fil.slice(-3).flatMap((e) => [
        { role: 'user' as const, content: perle.pourClaude(e.question) },
        { role: 'assistant' as const, content: e.reponse },
      ]);
      const pourElle = perle.pourClaude(q);
      const contexte = { question: pourElle, jour: perle.jour, minutes: perle.minutes, enDirect: perle.enDirectTexte, avant };
      const r1 = await demandeAClaude<unknown>(demandeDuPlan({ ...contexte, internet }));
      if (!r1.ok) { setRefus(r1.message); return; }
      const plan = planLu(r1.data);
      /* INTERNET : la question reformulée par Perle part SEULE, sans le fil ni
         les tours d'avant, et sans aucune cliente (`pourInternet`). */
      if (plan.internet && internet) {
        setEnCours('Perle cherche sur internet…');
        const r3 = await demandeAClaude<{ sources?: unknown; coupee?: unknown }>(demandeDInternet({ question: perle.pourInternet(plan.internet), jour: perle.jour, minutes: perle.minutes }));
        if (!r3.ok) { setRefus(r3.message); return; }
        const trouvee = reponsePropre(r3.texte);
        if (!trouvee) { setRefus('Perle n’a rien trouvé de sûr sur internet. Reformulez la question.'); return; }
        garde({
          id: uid(), question: q, reponse: trouvee, quand: new Date().toISOString(), coutUsd: r1.coutUsd + r3.coutUsd, ecrans: [],
          internet: true, sources: sourcesPropres(r3.data?.sources), ...(r3.data?.coupee === true ? { coupee: true } : {}),
        });
        setQuestion('');
        return;
      }
      let reponse = plan.reponse;
      let faits: FaitLu[] = [];
      let cout = r1.coutUsd;
      if (plan.lectures.length) {
        faits = plan.lectures.flatMap((l) => perle.lis(l, q));
        setEnCours(`Perle lit ${ecransLus(faits).map((e) => e.nom).join(', ')}…`);
        const r2 = await demandeAClaude<unknown>(demandeDeLaReponse({ ...contexte, faits }));
        if (!r2.ok) { setRefus(r2.message); return; }
        reponse = r2.texte;
        cout += r2.coutUsd;
      }
      const propre = reponsePropre(reponse);
      if (!propre) { setRefus('Perle n’a pas su répondre à cette question. Reformulez-la, ou ouvrez l’écran concerné.'); return; }
      garde({
        id: uid(), question: q, reponse: propre, quand: new Date().toISOString(), coutUsd: cout,
        ecrans: faits.length ? ecransLus(faits) : [],
      });
      setQuestion('');
    } finally {
      setEnCours('');
    }
  };

  const dicter = () => {
    if (ecoute) { reco.current?.stop(); return; }
    const r = creeLaReconnaissance();
    if (!r) return;
    r.lang = 'fr-FR'; r.interimResults = false; r.continuous = true;
    r.onresult = (e) => {
      let dit = '';
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) dit += ` ${e.results[i][0].transcript}`;
      if (dit.trim()) setQuestion((t) => `${t}${t && !/\s$/.test(t) ? ' ' : ''}${dit.trim()}`.slice(0, SIGNES_MAX));
    };
    r.onend = () => setEcoute(false);
    r.onerror = () => setEcoute(false);
    reco.current = r;
    setEcoute(true);
    r.start();
  };

  const eteinte = claude === false;
  return (
    <div className="trp-perle">
      <PageHead
        eyebrow={`Le Trône · ${branch.city}`}
        title="Demander à Perle"
        sub="Elle lit le Trône à l’instant où vous demandez, et répond avec ce qu’elle y trouve. Elle n’envoie aucun message, ne pose aucun rendez-vous et ne déplace jamais d’argent."
      />
      <p className="trp-perle__moment"><span aria-hidden="true" />{`En direct · ${momentDit(perle.jour, perle.minutes)}`}</p>

      <div className="trp-perle__grille">
        <section className="trp-perle__fil" aria-label="La conversation avec Perle">
          {fil.length === 0 && !enCours && (
            <div className="trp-perle__accueil">
              <h3>Que voulez-vous savoir ?</h3>
              <p>La caisse du jour, les rendez-vous, une cliente, les factures en attente, le mois, les dépenses, les conversations qui attendent : posez la question comme vous la diriez.</p>
              {internet && <p>Une question sur le monde hors de la Maison (un taux, une règle, un prix du marché) part sur internet, sans le nom d’aucune cliente, et revient avec ses sources.</p>}
            </div>
          )}
          {fil.map((e) => (
            <div key={e.id} className="trp-perle__echange">
              <p className="trp-perle__moi">{e.question}</p>
              <article className="trp-perle__elle">
                <Reponse texte={e.reponse} />
                {e.coupee && <p className="trp-perle__source">La réponse a été coupée avant sa fin : reposez la question, plus précise.</p>}
                {e.internet && (e.sources?.length ?? 0) > 0 && (
                  <ul className="trp-perle__sources" aria-label="Les sources">
                    {(e.sources ?? []).map((s) => (
                      <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.titre}</a></li>
                    ))}
                  </ul>
                )}
                <p className="trp-perle__source">
                  {e.internet
                    ? 'Cherché sur internet, pas dans le Trône : à confirmer à la source avant de décider.'
                    : e.ecrans.length ? `Lu dans : ${e.ecrans.map((x) => x.nom).join(', ')}.` : 'Lu dans : En direct.'}
                  {typeof e.coutUsd === 'number' && e.coutUsd > 0 ? ` Cette réponse : ${dollarsDits(e.coutUsd)}.` : ''}
                </p>
                {e.ecrans.length > 0 && (
                  <div className="trp-perle__gestes">
                    {e.ecrans.map((x) => (
                      <Button key={x.chemin} variant="ghost" size="sm" onClick={() => navigate(x.chemin)}>{`Ouvrir ${x.nom}`}</Button>
                    ))}
                  </div>
                )}
              </article>
            </div>
          ))}
          {enCours && <p className="trp-perle__attente" role="status">{enCours}</p>}
          {refus && <p className="trp-perle__refus" role="alert">{refus}</p>}
          {eteinte && <p className="trp-perle__refus" role="alert">La fonction ia-maison n’est pas posée ou pas à jour : Perle ne peut pas répondre pour l’instant. Le fil « En direct », lui, reste juste.</p>}
          <div ref={bas} className="trp-perle__bas" />

          <form className="trp-perle__champ" onSubmit={(e) => { e.preventDefault(); void demander(); }}>
            <label htmlFor="trp-perle-question">Votre question</label>
            <div className="trp-perle__saisie">
              <input
                id="trp-perle-question"
                value={question}
                onChange={(e) => setQuestion(e.target.value.slice(0, SIGNES_MAX))}
                placeholder="Écrivez, ou dictez"
                autoComplete="off"
                disabled={!!enCours || eteinte}
              />
              {aLeMicro && (
                <button
                  type="button"
                  className={`trp-perle__micro${ecoute ? ' is-actif' : ''}`}
                  onClick={dicter}
                  disabled={!!enCours || eteinte}
                  aria-pressed={ecoute}
                  aria-label={ecoute ? 'Arrêter la dictée' : 'Dicter la question'}
                  title={ecoute ? 'Arrêter la dictée' : 'Dicter la question'}
                >
                  <Mic size={17} aria-hidden="true" />
                </button>
              )}
              <Button type="submit" disabled={!!enCours || eteinte || !question.trim()}>{enCours ? 'Perle lit…' : 'Demander'}</Button>
            </div>
            <div className="trp-perle__puces">
              {QUESTIONS_PROPOSEES.map((q) => (
                <button key={q} type="button" className="trp-perle__puce" disabled={!!enCours || eteinte} onClick={() => { void demander(q); }}>{q}</button>
              ))}
              {fil.length > 0 && (
                <button type="button" className="trp-perle__effacer" disabled={!!enCours} onClick={() => setFils((tous) => ({ ...tous, [cle]: [] }))}>Effacer la conversation</button>
              )}
            </div>
          </form>
        </section>

        <aside className="trp-perle__direct" aria-label="En direct">
          <h3>En direct</h3>
          {perle.lignes.map((l) => (
            <div key={l.cle} className="trp-perle__ligne">
              <b>{l.titre}</b>
              <span>{l.detail}</span>
              {l.ecran && l.geste && <button type="button" onClick={() => navigate(l.ecran as string)}>{l.geste}</button>}
            </div>
          ))}
          <p className="trp-perle__note">Calculé par le Trône, sans IA : il se met à jour seul.</p>
        </aside>
      </div>
    </div>
  );
}
