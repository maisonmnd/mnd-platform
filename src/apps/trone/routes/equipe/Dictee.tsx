import { useEffect, useRef, useState } from 'react';
import { Mic } from 'lucide-react';
import { PageHead } from '../_ui';
import { Card, toast } from '../../../../ds/components';
import { useSettings } from '../../../../shared/settings';
import { metsAuPropre } from '../../../../shared/dictee';
import { MODES_DICTEE, auPropreIci, estMode, nomDuMode, type ModeDictee } from '../../../../shared/dictee-pur';
import './dictee.css';

/* ══ LA DICTÉE MND — 31 octobre 2026 ═══════════════════════════════════════
   « Dictee MND.bat doit être également sur mon téléphone et doit être
   beaucoup plus puissant que Wispr Flow » (Yéman). Maquette
   F7LksMC35bqVm9S6Rwgy15, validée au sélecteur : une appli du Trône, Copier
   et WhatsApp, l'oreille du téléphone, Claude Sonnet 5.5 partout.

   LE GESTE : on tient le bouton cuivre, on parle, on relâche. L'oreille du
   téléphone (Web Speech, celle du micro du clavier) écrit ce qu'elle entend
   pendant qu'on parle ; au relâché, la fonction `dictee-au-propre` rend le
   texte propre, dans le mode choisi (Note, Message, Liste, Anglais). Puis
   Copier, ou WhatsApp. Sans oreille dans ce navigateur, ou sans micro, on
   tape (ou on dicte au clavier) dans la zone du bas, et Claude fait le reste.

   RIEN N'EST GARDÉ : ni la voix, ni le texte. « Refaire » efface. */

type Resultat = { isFinal: boolean; 0: { transcript: string } };
type Oreille = {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  start(): void; stop(): void; abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<Resultat> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
/** Web Speech n'est pas dans lib.dom partout ; Safari le préfixe encore. */
const fabriqueDOreille = (): (new () => Oreille) | null => {
  const w = globalThis as unknown as { SpeechRecognition?: new () => Oreille; webkitSpeechRecognition?: new () => Oreille };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

const DIT_L_ERREUR: Record<string, string> = {
  'not-allowed': 'Le micro est refusé : autorisez-le pour le Trône dans les réglages du navigateur.',
  'service-not-allowed': 'La reconnaissance vocale est fermée sur cet appareil.',
  'audio-capture': 'Aucun micro trouvé sur cet appareil.',
  network: 'L’oreille du téléphone demande le réseau.',
};

type Phase = 'repos' | 'ecoute' | 'propre' | 'fini';

export default function Dictee() {
  const [settings] = useSettings();
  const [mode, setMode] = useState<ModeDictee>(() => (estMode(settings.dictee?.modeParDefaut) ? settings.dictee.modeParDefaut : 'note'));
  const [phase, setPhase] = useState<Phase>('repos');
  const [entendu, setEntendu] = useState('');
  const [enCours, setEnCours] = useState('');
  const [propre, setPropre] = useState('');
  const [modeRendu, setModeRendu] = useState<ModeDictee | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [aide, setAide] = useState('Tenez le bouton le temps de parler, puis relâchez.');
  const [voirEntendu, setVoirEntendu] = useState(false);
  const [sansMicro, setSansMicro] = useState(() => fabriqueDOreille() === null);
  const [tape, setTape] = useState('');

  const oreille = useRef<Oreille | null>(null);
  const tenue = useRef(false);
  const finals = useRef<string[]>([]);
  const enCoursRef = useRef('');
  const propreRef = useRef<HTMLPreElement | null>(null);
  const auTelephone = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

  const metsLeTexteAuPropre = async (texte: string, m: ModeDictee) => {
    setPhase('propre'); setErreur(null); setVoirEntendu(false);
    const r = await metsAuPropre(texte, m, auTelephone ? 'telephone' : 'ordinateur');
    if (r.ok) { setPropre(r.propre); setModeRendu(r.mode); }
    else { setPropre(auPropreIci(texte)); setModeRendu(null); setErreur(`${r.erreur} Voici vos mots, nettoyés ici.`); }
    setPhase('fini');
    setAide('Copiez, ou tenez à nouveau pour recommencer.');
  };

  /* Ce que l'oreille a entendu, joint : Safari s'arrête de lui-même au
     premier silence, et ce qu'il tenait en suspens se garde avant de repartir. */
  const termine = () => {
    if (enCoursRef.current) { finals.current.push(enCoursRef.current); enCoursRef.current = ''; }
    const texte = finals.current.join(' ').replace(/\s+/g, ' ').trim();
    setEnCours(''); setEntendu(texte);
    if (!texte) { setPhase('repos'); setAide('Je n’ai rien entendu : tenez le bouton le temps de parler.'); return; }
    void metsLeTexteAuPropre(texte, mode);
  };

  const lance = (Fabrique: new () => Oreille) => {
    const o = new Fabrique();
    o.lang = 'fr-FR'; o.continuous = true; o.interimResults = true; o.maxAlternatives = 1;
    o.onresult = (e) => {
      let suspens = '';
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const r = e.results[i];
        const t = (r[0]?.transcript ?? '').trim();
        if (!t) continue;
        if (r.isFinal) finals.current.push(t); else suspens += `${t} `;
      }
      enCoursRef.current = suspens.trim();
      setEntendu(finals.current.join(' '));
      setEnCours(enCoursRef.current);
    };
    o.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      setErreur(DIT_L_ERREUR[e.error] ?? `Le micro dit : ${e.error}.`);
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') { tenue.current = false; setSansMicro(true); }
    };
    o.onend = () => {
      if (tenue.current) {
        if (enCoursRef.current) { finals.current.push(enCoursRef.current); enCoursRef.current = ''; setEnCours(''); setEntendu(finals.current.join(' ')); }
        try { lance(Fabrique); } catch { tenue.current = false; termine(); }
        return;
      }
      termine();
    };
    oreille.current = o;
    o.start();
  };

  const demarre = () => {
    if (tenue.current || phase === 'propre') return;
    const Fabrique = fabriqueDOreille();
    if (!Fabrique) { setSansMicro(true); setAide('Pas d’oreille dans ce navigateur : tapez ou dictez au clavier ci-dessous.'); return; }
    tenue.current = true; finals.current = []; enCoursRef.current = '';
    setEntendu(''); setEnCours(''); setPropre(''); setModeRendu(null); setErreur(null); setVoirEntendu(false);
    setPhase('ecoute'); setAide('J’écoute. Relâchez quand vous avez fini.');
    try { lance(Fabrique); } catch { tenue.current = false; setPhase('repos'); setSansMicro(true); setAide('L’oreille ne démarre pas ici : tapez ou dictez au clavier ci-dessous.'); }
  };

  const relache = () => {
    if (!tenue.current) return;
    tenue.current = false;
    setAide('Claude met au propre…');
    try { oreille.current?.stop(); } catch { termine(); }
  };

  useEffect(() => {
    const cache = () => { if (document.visibilityState === 'hidden') relache(); };
    document.addEventListener('visibilitychange', cache);
    return () => {
      document.removeEventListener('visibilitychange', cache);
      tenue.current = false;
      try { oreille.current?.abort(); } catch { /* déjà arrêtée */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeDeMode = (m: ModeDictee) => {
    setMode(m);
    if (phase === 'fini' && entendu) void metsLeTexteAuPropre(entendu, m);
  };

  const copie = async () => {
    try {
      await navigator.clipboard.writeText(propre);
      toast('Copié. Collez-le où vous voulez.');
    } catch {
      const r = document.createRange();
      if (propreRef.current) { r.selectNodeContents(propreRef.current); const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(r); }
      toast('Texte sélectionné : copiez-le.');
    }
  };

  /* wa.me sans numéro : WhatsApp s'ouvre avec le texte, on choisit la discussion. */
  const versWhatsApp = () => window.open(`https://wa.me/?text=${encodeURIComponent(propre)}`, '_blank', 'noopener');

  const refais = () => {
    tenue.current = false;
    try { oreille.current?.abort(); } catch { /* rien */ }
    finals.current = []; enCoursRef.current = '';
    setPhase('repos'); setEntendu(''); setEnCours(''); setPropre(''); setModeRendu(null); setErreur(null); setVoirEntendu(false);
    setAide('Tenez le bouton le temps de parler, puis relâchez.');
  };

  const metsLeTapeAuPropre = () => {
    const t = tape.trim();
    if (!t) { toast('Rien à mettre au propre.'); return; }
    finals.current = [t]; setEntendu(t);
    void metsLeTexteAuPropre(t, mode);
  };

  return (
    <div className="dct-page">
      <PageHead
        eyebrow="Équipe · Dictée MND"
        title="Dictée MND"
        sub="Tenez le bouton, parlez, relâchez : Claude met au propre avec les mots de la Maison. Rien n’est gardé."
      />

      <div className="dct-modes" role="group" aria-label="Mode">
        {MODES_DICTEE.map((m) => (
          <button key={m.id} type="button" className="dct-mode" aria-pressed={mode === m.id} title={m.dit} onClick={() => changeDeMode(m.id)}>{m.nom}</button>
        ))}
      </div>

      <Card className="dct-feuille" filet="copper">
        {phase === 'repos' && !propre && (
          <p className="dct-consigne">{MODES_DICTEE.find((m) => m.id === mode)?.dit} Dites « mode message » ou « en anglais » au début pour changer de mode en parlant ; « à la ligne », « efface ça », « plus court » s’exécutent.</p>
        )}
        {(phase === 'ecoute' || phase === 'propre' || voirEntendu) && (
          <p className="dct-entendu" aria-live="polite">
            <span className="dct-entendu__sur">{phase === 'ecoute' ? 'J’entends' : 'Ce que j’ai entendu'}</span>
            {entendu}{enCours ? <span className="dct-suspens"> {enCours}</span> : null}
            {phase === 'ecoute' && !entendu && !enCours && <span className="dct-suspens">…</span>}
          </p>
        )}
        {(phase === 'ecoute' || phase === 'propre') && (
          <p className={`dct-etat${phase === 'ecoute' ? ' is-ecoute' : ''}`}><span className="dct-point" />{phase === 'ecoute' ? 'J’écoute' : 'Claude met au propre'}</p>
        )}
        {phase === 'fini' && (
          <>
            {modeRendu && modeRendu !== mode && <p className="dct-commande">Mode entendu : {nomDuMode(modeRendu)}.</p>}
            {erreur && <p className="dct-erreur">{erreur}</p>}
            <pre className="dct-propre" ref={propreRef}>{propre}</pre>
            <div className="dct-actions">
              <button type="button" className="mnd-btn mnd-btn--copper mnd-btn--sm" onClick={() => void copie()}>Copier</button>
              <button type="button" className="mnd-btn mnd-btn--ghost mnd-btn--sm" onClick={versWhatsApp}>WhatsApp</button>
              {entendu && entendu !== propre && (
                <button type="button" className="mnd-btn mnd-btn--ghost mnd-btn--sm" aria-pressed={voirEntendu} onClick={() => setVoirEntendu(!voirEntendu)}>
                  {voirEntendu ? 'Masquer' : 'Ce que j’ai entendu'}
                </button>
              )}
              <button type="button" className="mnd-btn mnd-btn--ghost mnd-btn--sm" onClick={refais}>Refaire</button>
            </div>
          </>
        )}
      </Card>

      <div className="dct-bas">
        <button
          type="button"
          className={`dct-tenir${phase === 'ecoute' ? ' is-ecoute' : ''}`}
          aria-label="Tenir pour dicter"
          aria-pressed={phase === 'ecoute'}
          disabled={phase === 'propre'}
          onPointerDown={(e) => { e.preventDefault(); try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* vieux navigateur */ } demarre(); }}
          onPointerUp={relache}
          onPointerCancel={relache}
          onContextMenu={(e) => e.preventDefault()}
          onKeyDown={(e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); demarre(); } }}
          onKeyUp={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); relache(); } }}
        >
          <Mic size={22} />
          <span>{phase === 'ecoute' ? 'Relâchez' : 'Tenez et parlez'}</span>
        </button>
        <p className="dct-aide" aria-live="polite">{aide}</p>
        {!sansMicro && (
          <button type="button" className="dct-lien" onClick={() => setSansMicro(true)}>Sans le micro</button>
        )}
      </div>

      {sansMicro && (
        <Card className="dct-sans-micro">
          <div className="sys-section__title">Sans le micro</div>
          <div className="sys-section__cap">
            {fabriqueDOreille() === null
              ? 'Ce navigateur n’a pas d’oreille. Tapez ici, ou dictez avec le micro de votre clavier, puis Claude met au propre.'
              : 'Tapez ici, ou dictez avec le micro de votre clavier, puis Claude met au propre.'}
          </div>
          <textarea
            id="dct-tape"
            className="mnd-textarea"
            rows={4}
            value={tape}
            onChange={(e) => setTape(e.target.value)}
            placeholder="Vos mots, tels quels…"
          />
          <div className="dct-actions">
            <button type="button" className="mnd-btn mnd-btn--sm" disabled={phase === 'propre' || !tape.trim()} onClick={metsLeTapeAuPropre}>Mettre au propre</button>
            {fabriqueDOreille() !== null && <button type="button" className="mnd-btn mnd-btn--ghost mnd-btn--sm" onClick={() => setSansMicro(false)}>Revenir au micro</button>}
          </div>
        </Card>
      )}
    </div>
  );
}
