import { useState } from 'react';
import { Card, Segs, toast, demande, demandeUnTexte } from '../../../../ds/components';
import { useSettings } from '../../../../shared/settings';
import { quiEncaisse } from '../../../../shared/finance';
import { santeDeLaDictee } from '../../../../shared/dictee';
import {
  ID_DU_BUREAU, MODELES_DICTEE, MODELE_PAR_DEFAUT, MODES_DICTEE, MOTS_DE_LA_MAISON, NOM_DU_BUREAU, NOM_DU_POSTE_AU_PLUS, POSTES_AU_PLUS,
  ajouteUnPoste, empreinteDuJeton, jourDuPoste, motsDuTexte, nouveauJeton, nouvelIdDePoste, ordinateursDeLaDictee, postesDeLaDictee,
  retireUnPoste, type ModeDictee, type ModeleDictee, type PosteDictee, type ReglagesDictee,
} from '../../../../shared/dictee-pur';
import { useEstDirection } from '../_vie';

/* ══ PARAMÈTRES › DICTÉE — 31 octobre 2026 ═══════════════════════════════
   Maquette F7LksMC3…, son choix au sélecteur : « les mots et les modes réglés
   au Trône, pour toute l'équipe ». La direction règle ; tout le monde lit.
   Le jeton de la Dictée du bureau se fabrique ICI, dans le navigateur, se
   montre UNE fois, et la base n'en garde que l'empreinte.

   UN JETON PAR ORDINATEUR — 2 novembre 2026. Le Mac a besoin du sien, et le
   fabriquer ne doit pas couper le PC : « Donner un jeton à un autre
   ordinateur » demande un nom court, fabrique le jeton de la même façon, le
   montre une fois, et range l'empreinte seule dans `postes`. Chaque
   ordinateur a sa ligne, son nom, sa date, son « Retirer ». */
export function CarteDictee() {
  const [settings, setSettings] = useSettings();
  const estDirection = useEstDirection();
  const r: ReglagesDictee = settings.dictee ?? {};
  const pose = (patch: Partial<ReglagesDictee>) => setSettings((s) => ({ ...s, dictee: { ...(s.dictee ?? {}), ...patch } }));
  const reserve = () => { toast('Ce réglage appartient à la direction.'); return false; };

  const [saisie, setSaisie] = useState((r.mots ?? []).join('\n'));
  /** Le jeton tout juste fabriqué, et l'ordinateur à qui il va : montré une fois. */
  const [jetonMontre, setJetonMontre] = useState<{ jeton: string; id: string; nom: string } | null>(null);
  const [verdict, setVerdict] = useState<string | null>(null);
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const ordinateurs = ordinateursDeLaDictee(r);
  const plein = postesDeLaDictee(r).length >= POSTES_AU_PLUS;

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
    setJetonMontre({ jeton, id: ID_DU_BUREAU, nom: NOM_DU_BUREAU });
  };

  /* UN AUTRE ORDINATEUR : le nom d'abord, par la question de la Maison ; le
     jeton ensuite, fabriqué comme celui du bureau. Le bureau ne bouge pas. */
  const donneUnJetonAUnPoste = async () => {
    if (!estDirection) { reserve(); return; }
    if (plein) { toast(`${POSTES_AU_PLUS} autres ordinateurs au plus : retirez-en un pour en ajouter un.`); return; }
    const nom = await demandeUnTexte({
      quoi: 'La Dictée d’un autre ordinateur',
      titre: 'Quel ordinateur reçoit ce jeton ?',
      dit: `Un nom court, ${NOM_DU_POSTE_AU_PLUS} signes au plus, pour le reconnaître dans la liste et le retirer un jour. Les jetons déjà posés restent tels quels.`,
      etiquette: 'Le nom de l’ordinateur',
      gabarit: 'Le Mac',
      accepter: 'Fabriquer son jeton',
      refuser: 'Ne rien fabriquer',
    });
    if (!nom?.trim()) return;
    const jeton = nouveauJeton();
    const poste: PosteDictee = {
      id: nouvelIdDePoste(), nom, empreinte: await empreinteDuJeton(jeton), poseLe: aujourdhui,
      ...(quiEncaisse() ? { par: quiEncaisse() } : {}),
    };
    const issue = ajouteUnPoste(r, poste);
    if (!issue.ok) {
      toast(issue.motif === 'meme-nom' ? 'Un ordinateur porte déjà ce nom : choisissez-en un autre.'
        : issue.motif === 'plein' ? `${POSTES_AU_PLUS} autres ordinateurs au plus : retirez-en un pour en ajouter un.`
          : 'Le jeton ne s’est pas fabriqué : recommencez.');
      return;
    }
    setSettings((s) => {
      const i = ajouteUnPoste(s.dictee, issue.poste);
      return i.ok ? { ...s, dictee: i.reglages } : s;
    });
    setJetonMontre({ jeton, id: issue.poste.id, nom: issue.poste.nom });
  };

  const retireUnOrdinateur = async (o: PosteDictee) => {
    if (!estDirection) { reserve(); return; }
    const oui = await demande({
      quoi: 'La Dictée des ordinateurs',
      titre: `Retirer le jeton de « ${o.nom} » ?`,
      dit: 'Cet ordinateur ne passera plus par le Trône : il mettra au propre seul. Les autres gardent le leur.',
      accepter: 'Retirer le jeton',
      refuser: 'Le garder',
    });
    if (!oui) return;
    setSettings((s) => ({ ...s, dictee: retireUnPoste(s.dictee, o.id) }));
    setJetonMontre((j) => (j?.id === o.id ? null : j));
    toast(`« ${o.nom} » ne passe plus par le Trône.`);
  };

  const copieLeJeton = async () => {
    if (!jetonMontre) return;
    try { await navigator.clipboard.writeText(jetonMontre.jeton); toast('Jeton copié.'); } catch { toast('Sélectionnez le jeton et copiez-le.'); }
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
          <div className="sys-row__label">La Dictée des ordinateurs</div>
          <div className="sys-row__sub">
            Sans jeton, la Dictée d’un ordinateur met au propre seule. Avec, elle passe par le Trône : mêmes mots, mêmes modes, plus de clé à poser.
            Un jeton par ordinateur : en refaire un ne coupe pas les autres. Le jeton se montre une fois ; le Trône n’en garde que l’empreinte.
          </div>
        </div>
        {ordinateurs.length > 0 && (
          <div id="dictee-ordinateurs">
            {ordinateurs.map((o) => (
              <div key={o.id} className="sys-row sys-row--items">
                <div>
                  <div className="sys-row__label">{o.nom}</div>
                  <div className="sys-row__sub">
                    {o.poseLe ? `Jeton posé le ${jourDuPoste(o.poseLe)}${o.par ? ` par ${o.par}` : ''}.` : 'Jeton posé.'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {o.id === ID_DU_BUREAU && (
                    <button type="button" className="mnd-btn mnd-btn--ghost mnd-btn--sm" disabled={!estDirection} onClick={() => void donneUnJeton()}>Refaire un jeton</button>
                  )}
                  <button type="button" className="mnd-btn mnd-btn--ghost mnd-btn--sm" disabled={!estDirection} onClick={() => void retireUnOrdinateur(o)}>Retirer</button>
                </div>
              </div>
            ))}
          </div>
        )}
        {jetonMontre && (
          <div style={{ display: 'grid', gap: 6 }}>
            <div className="sys-row__label">Le jeton de « {jetonMontre.nom} »</div>
            <input id="dictee-jeton" readOnly value={jetonMontre.jeton} onFocus={(e) => e.currentTarget.select()} style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12.5 }} />
            <div className="sys-row__sub">
              {jetonMontre.id === ID_DU_BUREAU
                ? 'Collez-le dans C:\\Users\\boyay\\Dictee\\reglages.json, à « jeton », puis relancez « Dictee MND ». Il ne se montrera plus : perdu, on en refait un.'
                : `Collez-le dans les réglages de la Dictée de « ${jetonMontre.nom} », à « jeton », puis relancez-la. Il ne se montrera plus : perdu, on retire cet ordinateur et on lui en donne un autre.`}
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {jetonMontre && <button type="button" className="mnd-btn mnd-btn--sm" onClick={() => void copieLeJeton()}>Copier le jeton</button>}
          {!r.bureau && (
            <button type="button" className="mnd-btn mnd-btn--ghost mnd-btn--sm" disabled={!estDirection} onClick={() => void donneUnJeton()}>Donner un jeton au bureau</button>
          )}
          <button type="button" className="mnd-btn mnd-btn--ghost mnd-btn--sm" disabled={!estDirection || plein} onClick={() => void donneUnJetonAUnPoste()}>
            Donner un jeton à un autre ordinateur
          </button>
        </div>
        {plein && <div className="sys-row__sub">{POSTES_AU_PLUS} autres ordinateurs au plus : retirez-en un pour en ajouter un.</div>}
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
