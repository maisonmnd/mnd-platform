import { useState } from 'react';
import { Card, Segs, toast } from '../../../../ds/components';
import { useSettings } from '../../../../shared/settings';
import { quiEncaisse } from '../../../../shared/finance';
import { santeDeLaDictee } from '../../../../shared/dictee';
import {
  MODELES_DICTEE, MODELE_PAR_DEFAUT, MODES_DICTEE, MOTS_DE_LA_MAISON, empreinteDuJeton, motsDuTexte, nouveauJeton,
  type ModeDictee, type ModeleDictee, type ReglagesDictee,
} from '../../../../shared/dictee-pur';
import { useEstDirection } from '../_vie';

/* ══ PARAMÈTRES › DICTÉE — 31 octobre 2026 ═══════════════════════════════
   Maquette F7LksMC3…, son choix au sélecteur : « les mots et les modes réglés
   au Trône, pour toute l'équipe ». La direction règle ; tout le monde lit.
   Le jeton de la Dictée du bureau se fabrique ICI, dans le navigateur, se
   montre UNE fois, et la base n'en garde que l'empreinte. */
export function CarteDictee() {
  const [settings, setSettings] = useSettings();
  const estDirection = useEstDirection();
  const r: ReglagesDictee = settings.dictee ?? {};
  const pose = (patch: Partial<ReglagesDictee>) => setSettings((s) => ({ ...s, dictee: { ...(s.dictee ?? {}), ...patch } }));
  const reserve = () => { toast('Ce réglage appartient à la direction.'); return false; };

  const [saisie, setSaisie] = useState((r.mots ?? []).join('\n'));
  const [jetonMontre, setJetonMontre] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<string | null>(null);
  const aujourdhui = new Date().toISOString().slice(0, 10);

  const enregistreLesMots = () => {
    if (!estDirection) { reserve(); return; }
    const mots = motsDuTexte(saisie);
    pose({ mots });
    setSaisie(mots.join('\n'));
    toast(mots.length ? `${mots.length} mot${mots.length > 1 ? 's' : ''} de la Maison, pour toute l’équipe.` : 'Plus aucun mot en plus de ceux de la Maison.');
  };

  const donneUnJeton = async () => {
    if (!estDirection) { reserve(); return; }
    const jeton = nouveauJeton();
    const empreinte = await empreinteDuJeton(jeton);
    pose({ bureau: { empreinte, poseLe: aujourdhui, ...(quiEncaisse() ? { par: quiEncaisse() } : {}) } });
    setJetonMontre(jeton);
  };

  const retireLeJeton = () => {
    if (!estDirection) { reserve(); return; }
    setSettings((s) => { const { bureau: _b, ...reste } = s.dictee ?? {}; return { ...s, dictee: reste }; });
    setJetonMontre(null);
    toast('La Dictée du bureau ne passe plus par le Trône.');
  };

  const copieLeJeton = async () => {
    if (!jetonMontre) return;
    try { await navigator.clipboard.writeText(jetonMontre); toast('Jeton copié.'); } catch { toast('Sélectionnez le jeton et copiez-le.'); }
  };

  const verifie = async () => {
    setVerdict('Je demande à la fonction…');
    const s = await santeDeLaDictee();
    setVerdict(!s ? 'La fonction dictee-au-propre ne répond pas : elle n’est pas encore en ligne.'
      : s.claude ? `dictee-au-propre ${s.version} répond, la clé de Claude est posée.`
        : `dictee-au-propre ${s.version} répond, mais la clé de Claude n’est pas posée : la Dictée se rabat sur la mise au propre de secours.`);
  };

  return (
    <Card className="sys-section" style={{ marginTop: 18 }}>
      <div className="sys-section__title">Dictée MND</div>
      <div className="sys-section__cap">
        Tenez le bouton, parlez, relâchez : Claude met au propre avec les mots de la Maison. Ces réglages valent pour toute l’équipe,
        au téléphone comme au bureau. Déjà connus de la Dictée : {MOTS_DE_LA_MAISON.join(', ')}.
      </div>

      <div className="sys-row" style={{ display: 'grid', gap: 8 }}>
        <div>
          <div className="sys-row__label">Les mots de la Maison</div>
          <div className="sys-row__sub">Un mot par ligne : prénoms, marques, mots fon, ce que l’oreille entend mal. Claude les écrit ainsi.</div>
        </div>
        <textarea
          id="dictee-mots"
          className="mnd-textarea"
          rows={5}
          value={saisie}
          disabled={!estDirection}
          onChange={(e) => setSaisie(e.target.value)}
          placeholder={'Kèliji\nTeckle\nSuru-Léré'}
        />
        <button type="button" className="mnd-btn mnd-btn--ghost mnd-btn--sm" style={{ justifySelf: 'start' }} disabled={!estDirection || motsDuTexte(saisie).join('\n') === (r.mots ?? []).join('\n')} onClick={enregistreLesMots}>
          Enregistrer
        </button>
      </div>

      <div className="sys-row">
        <div>
          <div className="sys-row__label">Le mode au départ</div>
          <div className="sys-row__sub">Celui que l’écran ouvre. On en change d’un geste, ou en disant « mode message » au début.</div>
        </div>
        <Segs<ModeDictee>
          options={MODES_DICTEE.map((m) => ({ value: m.id, label: m.nom }))}
          value={r.modeParDefaut ?? 'note'}
          onChange={(v) => { if (!estDirection) { reserve(); return; } pose({ modeParDefaut: v }); }}
        />
      </div>

      <div className="sys-row">
        <div>
          <div className="sys-row__label">Le cerveau</div>
          <div className="sys-row__sub">{MODELES_DICTEE.map((m) => `${m.nom} : ${m.dit}`).join(' ')} Pris sur les crédits Claude inclus.</div>
        </div>
        <Segs<ModeleDictee>
          options={MODELES_DICTEE.map((m) => ({ value: m.id, label: m.nom }))}
          value={r.modele ?? MODELE_PAR_DEFAUT}
          onChange={(v) => { if (!estDirection) { reserve(); return; } pose({ modele: v }); }}
        />
      </div>

      <div className="sys-row" style={{ display: 'grid', gap: 8 }}>
        <div>
          <div className="sys-row__label">La Dictée du bureau</div>
          <div className="sys-row__sub">
            {r.bureau
              ? `Un jeton est posé depuis le ${r.bureau.poseLe}${r.bureau.par ? ` par ${r.bureau.par}` : ''} : la Dictée de l’ordinateur passe par le Trône, mêmes mots, mêmes modes.`
              : 'Sans jeton, la Dictée de l’ordinateur met au propre seule. Avec, elle passe par le Trône : mêmes mots, mêmes modes, plus de clé à poser dans Windows.'}
            {' '}Le jeton se montre une fois ; le Trône n’en garde que l’empreinte.
          </div>
        </div>
        {jetonMontre && (
          <div style={{ display: 'grid', gap: 6 }}>
            <input id="dictee-jeton" readOnly value={jetonMontre} onFocus={(e) => e.currentTarget.select()} style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12.5 }} />
            <div className="sys-row__sub">
              Collez-le dans C:\Users\boyay\Dictee\reglages.json, à « jeton », puis relancez « Dictee MND ». Il ne se montrera plus : perdu, on en refait un.
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {jetonMontre && <button type="button" className="mnd-btn mnd-btn--sm" onClick={() => void copieLeJeton()}>Copier le jeton</button>}
          <button type="button" className="mnd-btn mnd-btn--ghost mnd-btn--sm" disabled={!estDirection} onClick={() => void donneUnJeton()}>
            {r.bureau ? 'Refaire un jeton' : 'Donner un jeton au bureau'}
          </button>
          {r.bureau && <button type="button" className="mnd-btn mnd-btn--ghost mnd-btn--sm" disabled={!estDirection} onClick={retireLeJeton}>Retirer le jeton</button>}
        </div>
      </div>

      <div className="sys-row">
        <div>
          <div className="sys-row__label">Vérifier le branchement</div>
          <div className="sys-row__sub">{verdict ?? 'Demande à la fonction sa version et si la clé de Claude est posée, sans rien envoyer.'}</div>
        </div>
        <button type="button" className="mnd-btn mnd-btn--ghost mnd-btn--sm" onClick={() => void verifie()}>Vérifier</button>
      </div>
    </Card>
  );
}
