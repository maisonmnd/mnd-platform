import { useMemo, useState } from 'react';
import { Button, Modal, toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { maisonNom, maisonVille } from '../../../../shared/identite';
import { summaryPdf, type SummarySection } from '../../../../shared/pdf';
import { enService, ficheDuPoste, type FicheDePoste } from '../../../../shared/postes';
import { useFichesDePoste } from '../../../../shared/textes';
import {
  NIVEAUX, VERSION_EVALUATION, compte, ecarts, evaluationNeuve, motDuNiveau,
  pourquoiIncomplete, signeDuNiveau, type Evaluation, type Niveau,
} from '../../../../shared/evaluation';
import { SignatureAuDoigt } from '../_contrat';
import type { StaffMember } from './data';

/* ══ LA FICHE DE POSTE, TENUE — 6 septembre 2026 ══════════════════════

   « Je voudrais des fiches de postes plus détaillées avec des cases à cocher,
   des objectifs mesurables et atteignables, des points forts » (Yéman).

   UN SEUL ÉCRAN POUR LES DEUX MOITIÉS. En haut ce que le poste attend de
   n'importe qui — la fiche, la même pour tous ; en bas ce que cette personne-là
   en fait. Deux écrans auraient laissé évaluer sans relire, et c'est exactement
   ainsi qu'un entretien devient une humeur.

   DEUX COLONNES, PAS UNE (arbitrage de Yéman). Elle se note, la Maison note
   aussi, et L'ÉCART EST LE SUJET DE LA CONVERSATION. Une colonne unique fait
   d'un entretien une notification.

   LES CIBLES SE MODIFIENT ICI, pas dans la fiche : celle qui débute ne vise pas
   ce que vise celle qui a trois ans, mais toutes deux sont jugées sur les mêmes
   lignes. Le standard vit dans `shared/postes`, l'ajustement sur la personne. */

const jourLisible = (iso: string) => iso.split('-').reverse().join('/');
const enFichier = (t: string) => t.toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

/** LA FICHE DU POSTE, EN PAPIER — elle ne se signe pas : elle se remet et
    s'affiche. Un document qui décrit un métier n'engage personne, il éclaire ;
    c'est le règlement qui engage. */
export async function ficheDePostePdf(f: FicheDePoste, pourQui?: string) {
  const lignes = (titre: string, items: string[]): SummarySection => ({
    heading: titre, rows: items.map((t) => ({ label: `· ${t}` })),
  });
  await summaryPdf({
    eyebrow: 'Fiche de poste',
    title: f.poste,
    houseName: maisonNom(),
    meta: [
      f.auFauteuil ? 'Au fauteuil · touche une tête' : 'Hors fauteuil',
      `Rend compte ${f.rendCompteA}`,
      ...(pourQui ? [`Établie pour ${pourQui}`] : []),
    ],
    sections: [
      { heading: 'La mission', rows: [{ label: f.mission, strong: true }] },
      lignes('Ce qu’elle fait', f.fait),
      lignes('Ce qui se mesure', f.mesure),
      /* LA RUBRIQUE LA PLUS UTILE : les conflits d'atelier naissent presque
         toujours d'une frontière que personne n'avait tracée. */
      lignes('Ce qu’elle ne fait pas', f.neFaitPas),
      /* LA FRONTIÈRE DU MÉTIER N'EST PAS LA FRONTIÈRE DE L'AUTORITÉ : un
         maître a le droit d'arrêter un rituel, pas d'accorder une remise. */
      lignes('Ce qu’elle décide seule', f.decide),
      {
        heading: 'Ce qui s’approuve avant',
        rows: f.demandeAvant.map((d) => ({ label: `· ${d.quoi}`, value: d.a })),
      },
      {
        heading: 'Ce qui se coche à l’entretien',
        rows: f.competences.map((c) => ({ label: `· ${c.mot}`, value: '· ~ ✓' })),
      },
      {
        heading: 'Ce qui se vise',
        rows: f.objectifs.map((o) => ({ label: `· ${o.mot}`, value: o.cible })),
      },
    ],
    footer: 'La fiche dit le métier. Le règlement intérieur dit les règles.',
    filename: `fiche-de-poste-${enFichier(f.poste)}.pdf`,
  });
}

/* ── LE SÉLECTEUR À TROIS ÉTATS ──────────────────────────────────────
   Trois boutons, pas une case à cocher : une case ne sait dire que oui ou non,
   et tout ce qui n'est pas parfait finirait coché « non ». « En cours » est le
   plus utile des trois — personne ne signe une feuille qui dit qu'il ne sait
   rien faire. */
function Trois(o: { valeur?: Niveau; ton: 'elle' | 'maison'; onChange: (n: Niveau) => void; nom: string }) {
  return (
    <div className={`tre-ev__seg tre-ev__seg--${o.ton}`} role="group" aria-label={o.nom}>
      {NIVEAUX.map((n) => (
        <button
          key={n.cle}
          type="button"
          className={o.valeur === n.cle ? 'is-on' : ''}
          title={n.mot}
          aria-pressed={o.valeur === n.cle}
          onClick={() => o.onChange(n.cle)}
        >
          {n.signe}
        </button>
      ))}
    </div>
  );
}

export function EvaluationModal(o: {
  membre: StaffMember;
  onEnregistre: (ev: Evaluation) => void;
  onClose: () => void;
}) {
  const { branch } = useBranch();
  const jour = new Date().toISOString().slice(0, 10);
  /* LES FICHES DE LA MAISON, PAS CELLES DU CODE. Elles se modifient dans
     Paramètres · Les textes ; évaluer sur le texte d'origine ferait cocher des
     lignes que plus personne n'a sous les yeux. */
  const [fiches] = useFichesDePoste();
  const fiche = ficheDuPoste(o.membre.role, fiches);
  const passees = useMemo(
    () => [...(o.membre.evaluations ?? [])].sort((a, b) => b.at.localeCompare(a.at)),
    [o.membre.evaluations],
  );

  /* ON REPREND CELLE DU JOUR, JAMAIS CELLE DE L'AN DERNIER. Rouvrir l'entretien
     de l'année passée pour le modifier effacerait ce qui avait été signé — et
     c'est précisément ce qu'on relit quand un désaccord dure. */
  const [ev, setEv] = useState<Evaluation>(() => {
    /* Sans fiche, l'écran ne propose rien à remplir — mais un état doit exister :
       un hook ne se pose pas sous condition. */
    if (!fiche) {
      return {
        at: jour, poste: o.membre.role, parElle: {}, parLaMaison: {},
        cibles: {}, atteints: {}, pointsForts: '', aTravailler: '',
      };
    }
    const duJour = passees.find((e) => e.at === jour);
    if (duJour) return { ...duJour };
    const neuve = evaluationNeuve(
      { ...fiche, objectifs: enService(fiche.objectifs) } as FicheDePoste, jour,
    );
    /* LES CIBLES DE L'AN DERNIER SUIVENT LA PERSONNE : elles ont été discutées
       une fois, les retaper chaque année les ferait dériver au hasard. */
    const derniere = passees[0];
    return derniere ? { ...neuve, cibles: { ...neuve.cibles, ...derniere.cibles } } : neuve;
  });
  const [trace, setTrace] = useState('');

  if (!fiche) {
    return (
      <Modal title={`Entretien · ${o.membre.name}`} onClose={o.onClose} width={560}>
        <p style={{ margin: 0, lineHeight: 1.7 }}>
          Aucune fiche n’existe pour le poste « {o.membre.role} ».
        </p>
        <p className="mnd-muted" style={{ lineHeight: 1.7 }}>
          Un poste que personne n’a décrit se recrute à l’aveugle et s’évalue à l’humeur.
          Décrivez-le d’abord dans les fiches de la Maison.
        </p>
        <Button variant="ghost" style={{ flex: 'none' }} onClick={o.onClose}>Fermer</Button>
      </Modal>
    );
  }

  /* CE QU'ON COCHE AUJOURD'HUI. Une ligne retirée de la fiche ne se propose
     plus — mais si l'entretien ouvert porte déjà un avis dessus, elle reste
     affichée : la faire disparaître sous les yeux de quelqu'un effacerait ce
     qu'on venait de lui dire. */
  const porteUnAvis = (cle: string) => !!ev.parElle[cle] || !!ev.parLaMaison[cle];
  const f: FicheDePoste = {
    ...fiche,
    competences: fiche.competences.filter((c) => !c.retiree || porteUnAvis(c.cle)),
    objectifs: enService(fiche.objectifs),
  };
  const pose = (champ: 'parElle' | 'parLaMaison', cle: string, n: Niveau) =>
    setEv((p) => ({ ...p, [champ]: { ...p[champ], [cle]: n } }));

  const dElle = compte(f, ev.parElle);
  const deLaMaison = compte(f, ev.parLaMaison);
  const desaccords = ecarts(f, ev);
  const manque = pourquoiIncomplete(f, ev);

  const sections = (): SummarySection[] => [
    {
      heading: 'Ce qu’elle sait faire · elle / la Maison',
      rows: f.competences.map((c) => ({
        label: `· ${c.mot}`,
        value: `${signeDuNiveau(ev.parElle[c.cle])}  ${signeDuNiveau(ev.parLaMaison[c.cle])}`,
      })),
    },
    {
      heading: 'Ce qui se vise',
      rows: f.objectifs.flatMap((ob) => [
        { label: `· ${ob.mot}`, value: ev.atteints[ob.cle] ? 'Atteint' : 'Pas encore' },
        { label: `Cible retenue : ${ev.cibles[ob.cle] ?? ob.cible}`, sub: true },
      ]),
    },
    /* LES ÉCARTS SONT SUR LE PAPIER, pas seulement à l'écran : c'est ce qu'on
       relit l'année suivante pour savoir si la conversation a servi. */
    ...(desaccords.length ? [{
      heading: 'Là où les deux regards diffèrent',
      rows: desaccords.map((d) => ({
        label: `· ${d.mot}`,
        value: d.sens === 'elle-plus-haut' ? 'elle se voit plus loin' : 'la Maison la voit plus loin',
      })),
    }] : []),
    { heading: 'Ses points forts', rows: [{ label: ev.pointsForts || '—' }] },
    { heading: 'Ce qu’elle travaille cette année', rows: [{ label: ev.aTravailler || '—' }] },
    ...(ev.motDeLaPersonne?.trim()
      ? [{ heading: 'Son mot', rows: [{ label: ev.motDeLaPersonne.trim() }] }] : []),
  ];

  const enregistre = async (avecPdf: boolean) => {
    if (manque) { toast(manque); return; }
    const fini: Evaluation = {
      ...ev,
      signature: trace
        ? { at: jour, signePar: o.membre.name, signature: trace, version: VERSION_EVALUATION }
        : ev.signature,
    };
    o.onEnregistre(fini);
    if (avecPdf) {
      try {
        await summaryPdf({
          eyebrow: 'Entretien annuel',
          title: o.membre.name,
          houseName: maisonNom(),
          meta: [
            `${f.poste} · ${f.auFauteuil ? 'au fauteuil' : 'hors fauteuil'}`,
            `Elle : ${dElle.acquis} sur ${dElle.total} · la Maison : ${deLaMaison.acquis} sur ${deLaMaison.total}`,
            `Entretien du ${jourLisible(ev.at)}`,
          ],
          sections: sections(),
          signature: fini.signature?.signature
            ? {
              trace: fini.signature.signature, nom: o.membre.name,
              qualite: 'Entretien tenu, lu et signé :',
              jourLisible: jourLisible(ev.at), ville: branch.city, villeDuSiege: maisonVille(),
            }
            : undefined,
          footer: 'La fiche dit le métier · l’entretien dit où en est la personne.',
          filename: `entretien-${enFichier(o.membre.name)}-${ev.at}.pdf`,
        });
      } catch { toast('Entretien enregistré, mais le PDF n’a pas pu être produit.'); }
    }
    toast('Entretien enregistré.');
    o.onClose();
  };

  return (
    <Modal title={`Fiche de poste & entretien · ${o.membre.name}`} onClose={o.onClose} width={980}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* ── CE QUE LE POSTE ATTEND — la même pour tous ───────────── */}
        <div className="tre-ev__fiche">
          <div className="trc-microlabel">La fiche du poste · {f.poste}</div>
          <p style={{ margin: '4px 0 10px', fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--color-indigo)', lineHeight: 1.45 }}>
            {f.mission}
          </p>
          <div className="tre-ev__quatre">
            <div>
              <div className="tre-ev__rub">Ce qu’elle fait</div>
              <ul>{f.fait.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
            <div>
              <div className="tre-ev__rub">Ce qui se mesure</div>
              <ul>{f.mesure.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
            <div>
              <div className="tre-ev__rub">Ce qu’elle ne fait pas</div>
              <ul>{f.neFaitPas.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
            <div>
              <div className="tre-ev__rub">Elle rend compte</div>
              <ul><li>{f.rendCompteA}</li></ul>
            </div>
            {/* LES POUVOIRS DE DÉCISION — « ce qu'il peut décider et ce qui a
                besoin d'être approuvé avant de faire » (Yéman). C'est ce qu'on
                relit le jour où quelqu'un a décidé trop, ou trop peu. */}
            <div>
              <div className="tre-ev__rub">Ce qu’elle décide seule</div>
              <ul>{f.decide.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
            <div>
              <div className="tre-ev__rub">Ce qui s’approuve avant</div>
              <ul>{f.demandeAvant.map((d) => (
                <li key={d.quoi}>{d.quoi} <span className="mnd-muted">· auprès de {d.a}</span></li>
              ))}</ul>
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <Button variant="ghost" style={{ flex: 'none' }} onClick={() => void ficheDePostePdf(f, o.membre.name)}>
              Imprimer la fiche du poste
            </Button>
          </div>
        </div>

        {/* ── CE QU'ELLE SAIT FAIRE — deux regards ─────────────────── */}
        <div>
          <div className="trc-microlabel">
            Ce qu’elle sait faire · elle d’abord, la Maison ensuite
          </div>
          <p className="mnd-muted" style={{ margin: '2px 0 8px', fontSize: 12 }}>
            Des gestes qu’on peut voir, jamais des qualités. Laissez-lui l’écran pour
            la première colonne : ce qu’elle en dit avant d’entendre votre avis vaut
            plus que ce qu’elle en dirait après.
          </p>
          <div className="tre-ev__entete">
            <span />
            <span>Elle</span>
            <span>La Maison</span>
          </div>
          <div className="tre-ev">
            {f.competences.map((c) => {
              const d = desaccords.find((x) => x.cle === c.cle);
              return (
                <div key={c.cle} className={`tre-ev__ligne${d ? ' is-ecart' : ''}`}>
                  <span className="tre-ev__geste">{c.mot}</span>
                  <Trois valeur={ev.parElle[c.cle]} ton="elle" nom={`${c.mot} — son avis`}
                    onChange={(n) => pose('parElle', c.cle, n)} />
                  <Trois valeur={ev.parLaMaison[c.cle]} ton="maison" nom={`${c.mot} — l’avis de la Maison`}
                    onChange={(n) => pose('parLaMaison', c.cle, n)} />
                </div>
              );
            })}
          </div>
          <div className="tre-ev__compte">
            <span>Elle : <strong>{dElle.acquis}</strong> acquis, {dElle.encours} en cours sur {dElle.total}</span>
            <span>La Maison : <strong>{deLaMaison.acquis}</strong> acquis, {deLaMaison.encours} en cours sur {deLaMaison.total}</span>
          </div>
          {/* L'ÉCART EST LE SUJET DE LA CONVERSATION — il se dit, il ne se
              devine pas en comparant deux colonnes de haut en bas. */}
          {desaccords.length > 0 && (
            <div className="tre-ev__ecarts">
              <div className="tre-ev__rub">À se dire · {desaccords.length} désaccord{desaccords.length > 1 ? 's' : ''}</div>
              {desaccords.map((d) => (
                <div key={d.cle} className="tre-ev__ecart">
                  <span>{d.mot}</span>
                  <span className="mnd-muted">
                    {d.sens === 'elle-plus-haut'
                      ? `elle se dit « ${motDuNiveau(d.elle).toLowerCase()} », la Maison « ${motDuNiveau(d.maison).toLowerCase()} »`
                      : `la Maison la voit « ${motDuNiveau(d.maison).toLowerCase()} », elle se dit « ${motDuNiveau(d.elle).toLowerCase()} »`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── CE QU'ELLE VISE — le standard, ajusté pour elle ──────── */}
        <div>
          <div className="trc-microlabel">Ce qu’elle vise cette année</div>
          <p className="mnd-muted" style={{ margin: '2px 0 8px', fontSize: 12 }}>
            La cible vient du poste et s’ajuste pour elle. Un objectif qu’on sait
            hors d’atteinte le jour où on l’écrit ne se poursuit pas, il se subit.
          </p>
          <div className="tre-ev">
            {f.objectifs.map((ob) => (
              <div key={ob.cle} className="tre-ev__obj">
                <span className="tre-ev__geste">{ob.mot}</span>
                <input
                  className="mnd-input"
                  value={ev.cibles[ob.cle] ?? ob.cible}
                  aria-label={`Cible · ${ob.mot}`}
                  onChange={(e) => setEv((p) => ({ ...p, cibles: { ...p.cibles, [ob.cle]: e.target.value } }))}
                />
                <label className="tre-ev__atteint">
                  <input
                    type="checkbox"
                    checked={!!ev.atteints[ob.cle]}
                    onChange={(e) => setEv((p) => ({ ...p, atteints: { ...p.atteints, [ob.cle]: e.target.checked } }))}
                  />
                  Atteint
                </label>
                {(ev.cibles[ob.cle] ?? ob.cible) !== ob.cible && (
                  <span className="mnd-muted tre-ev__standard">standard du poste : {ob.cible}</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── CE QU'ON LUI DIT ─────────────────────────────────────── */}
        <div className="tre-ev__mots">
          <div>
            <div className="trc-microlabel">Ses points forts</div>
            <textarea
              className="mnd-textarea"
              value={ev.pointsForts}
              placeholder="Ce qu’elle fait mieux que ce qu’on lui demandait."
              onChange={(e) => setEv((p) => ({ ...p, pointsForts: e.target.value }))}
            />
          </div>
          <div>
            <div className="trc-microlabel">Ce qu’elle travaille cette année</div>
            <textarea
              className="mnd-textarea"
              value={ev.aTravailler}
              placeholder="Un ou deux gestes, pas dix. Une liste longue ne se travaille pas."
              onChange={(e) => setEv((p) => ({ ...p, aTravailler: e.target.value }))}
            />
          </div>
          {/* UN ENTRETIEN OÙ SEUL L'EMPLOYEUR ÉCRIT N'EST PAS UN ENTRETIEN. */}
          <div>
            <div className="trc-microlabel">Son mot · facultatif</div>
            <textarea
              className="mnd-textarea"
              value={ev.motDeLaPersonne ?? ''}
              placeholder="Ce qu’elle veut voir écrit, avec ses mots."
              onChange={(e) => setEv((p) => ({ ...p, motDeLaPersonne: e.target.value }))}
            />
          </div>
        </div>

        <SignatureAuDoigt
          trace={trace}
          onTrace={setTrace}
          titre="Sa signature · elle a lu ce qui est écrit"
          invite="Facultative, mais un entretien non signé ne s’oppose à rien."
        />

        {passees.length > 0 && (
          <div className="mnd-muted" style={{ fontSize: 12 }}>
            Entretiens précédents : {passees.map((e) => jourLisible(e.at)).join(' · ')}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Button variant="ghost" style={{ flex: 'none' }} onClick={o.onClose}>Annuler</Button>
          <Button variant="ghost" style={{ flex: 'none' }} disabled={!!manque} onClick={() => void enregistre(false)}>
            Enregistrer
          </Button>
          <Button variant="copper" style={{ flex: 'none' }} disabled={!!manque} onClick={() => void enregistre(true)}>
            Enregistrer et remettre le PDF
          </Button>
          {manque && <span className="mnd-muted" style={{ fontSize: 12 }}>{manque}</span>}
        </div>
      </div>
    </Modal>
  );
}
