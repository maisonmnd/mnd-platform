import { useMemo, useState, type CSSProperties } from 'react';
import { Button, Field, Input, Modal, Select, Textarea, toast, demande } from '../../../../ds/components';
import { useStaff as useMonProfil } from '../../../../shared/auth';
import { jourCourtAn } from '../../../../shared/calendrier';
import { PARCOURS_MND, PUBLIC_LABEL } from '../../../../shared/parcours';
import {
  lisLeManuel, manuelStore, squeletteDuManuel, useManuel, type ManuelDeFormation,
} from '../../../../shared/manuel';

/* ══ CORRIGER LE MANUEL DANS LE TRÔNE — 13 septembre 2026 ══════════════

   « Donne-moi la possibilité d'éditer le manuel dans le Trône. Je ne veux pas
   corriger le fichier puis le réimporter » (Yéman).

   CE FORMULAIRE EST PUBLIC, SON CONTENU NE L'EST PAS. Ce fichier est dans le
   dépôt, mais il n'écrit aucune ligne du manuel : il affiche ce que la base
   privée lui rend, et y renvoie ce qu'on corrige. La table n'accepte
   l'écriture que de la direction (migration 0089) ; le personnel lit.

   ON CORRIGE UN BROUILLON, PAS LA BASE. Tant qu'on n'a pas enregistré, rien ne
   part : les autres postes gardent le manuel d'avant. L'enregistrement relit
   tout comme un import (`lisLeManuel`) : une séance sans titre ou sans
   objectif ne s'écrit pas, et l'écran dit laquelle.

   DEUX POSTES, UN MANUEL. Si le manuel a changé ailleurs pendant qu'on le
   corrigeait, l'enregistrement le dit et demande avant d'écrire par-dessus.

   LES LISTES SE TAPENT UNE LIGNE PAR ÉLÉMENT. Découper à chaque frappe
   avalerait la ligne vide qu'on vient d'ouvrir : le brouillon garde le texte
   brut, et ne le découpe qu'à l'enregistrement. */

type Paire = [string, string];

type SeanceBrouillon = {
  cle: string;
  module: number;
  titre: string;
  duree: string;
  objectif: string;
  preparer: string;
  deroule: Paire[];
  vu: string;
  pratique: string;
  mesure: Paire[];
  evaluation: string;
  teteReelle: string;
  erreurs: string;
  ensuite: string;
};

type Brouillon = { meta: string; intro: string; materiel: string; seances: SeanceBrouillon[] };

let compteur = 0;
const nouvelleCle = () => `s${Date.now().toString(36)}${(compteur++).toString(36)}`;
const enLignes = (xs: readonly string[]) => xs.join('\n');
const deLignes = (t: string) => t.split('\n').map((l) => l.trim()).filter(Boolean);
const aujourdhui = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const versBrouillon = (m: ManuelDeFormation): Brouillon => ({
  meta: m.meta,
  intro: m.intro,
  materiel: enLignes(m.materiel),
  seances: m.seances.map((s) => ({
    cle: nouvelleCle(), module: s.module, titre: s.titre, duree: s.duree, objectif: s.objectif,
    preparer: enLignes(s.preparer), deroule: s.deroule.map(([a, b]): Paire => [a, b]),
    vu: enLignes(s.vu), pratique: enLignes(s.pratique), mesure: s.mesure.map(([a, b]): Paire => [a, b]),
    evaluation: s.evaluation ?? '', teteReelle: s.teteReelle ?? '', erreurs: enLignes(s.erreurs), ensuite: s.ensuite,
  })),
});

/** Le brouillon rendu à la forme d'un fichier de manuel, que `lisLeManuel` relit. */
const versFichier = (b: Brouillon, noms: readonly string[]) => ({
  meta: b.meta,
  intro: b.intro,
  materiel: deLignes(b.materiel),
  seances: b.seances.map((s, i) => ({
    n: i + 1, module: s.module, nomModule: noms[s.module - 1] ?? '',
    titre: s.titre, duree: s.duree, objectif: s.objectif,
    preparer: deLignes(s.preparer),
    deroule: s.deroule.filter(([a, b]) => a.trim() || b.trim()),
    vu: deLignes(s.vu), pratique: deLignes(s.pratique),
    mesure: s.mesure.filter(([a, b]) => a.trim() || b.trim()),
    evaluation: s.evaluation, teteReelle: s.teteReelle, erreurs: deLignes(s.erreurs), ensuite: s.ensuite,
  })),
});

const SANS_CADRE: CSSProperties = { border: 0, padding: 0, margin: 0, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 };

function Paires({ titre, valeurs, onChange, placeholders, colonnes, ajout, lectureSeule }: {
  titre: string;
  valeurs: Paire[];
  onChange: (v: Paire[]) => void;
  placeholders: Paire;
  colonnes: string;
  ajout: string;
  lectureSeule: boolean;
}) {
  return (
    <div>
      <div className="mnd-field__label" style={{ marginBottom: 6 }}>{titre}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {valeurs.map(([a, b], i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: `${colonnes} auto`, gap: 8, alignItems: 'center' }}>
            <Input value={a} placeholder={placeholders[0]} onChange={(e) => onChange(valeurs.map((p, j): Paire => (j === i ? [e.target.value, p[1]] : p)))} />
            <Input value={b} placeholder={placeholders[1]} onChange={(e) => onChange(valeurs.map((p, j): Paire => (j === i ? [p[0], e.target.value] : p)))} />
            {!lectureSeule && (
              <button type="button" className="tre-link-btn tre-link-btn--danger" aria-label="Retirer la ligne" onClick={() => onChange(valeurs.filter((_, j) => j !== i))}>✕</button>
            )}
          </div>
        ))}
        {!lectureSeule && (
          <button type="button" className="tre-chip" style={{ alignSelf: 'flex-start' }} onClick={() => onChange([...valeurs, ['', '']])}>{ajout}</button>
        )}
      </div>
    </div>
  );
}

export default function ManuelEditeur({ id, lectureSeule, onClose }: { id: string; lectureSeule: boolean; onClose: () => void }) {
  const [manuels] = useManuel();
  const moi = useMonProfil();
  const parcours = PARCOURS_MND.find((p) => p.id === id);
  const existant = manuels.find((m) => m.id === id);
  const noms = useMemo(() => parcours?.programme.map((m) => m.nom) ?? [], [parcours]);

  /* Ce que la base portait à l'ouverture : c'est contre lui qu'on reconnaît
     une correction faite ailleurs pendant la nôtre. */
  const [depart] = useState(() => JSON.stringify(existant ?? null));
  const [brouillon, setBrouillon] = useState<Brouillon>(() =>
    versBrouillon(existant ?? squeletteDuManuel(id) ?? { id, meta: '', intro: '', materiel: [], seances: [] }));
  const [initial] = useState(() => JSON.stringify(brouillon));
  const [deplie, setDeplie] = useState<string | null>(null);
  const [erreurs, setErreurs] = useState<string[]>([]);

  if (!parcours) return null;

  const modifie = JSON.stringify(brouillon) !== initial;
  const majSeance = (cle: string, patch: Partial<SeanceBrouillon>) =>
    setBrouillon((b) => ({ ...b, seances: b.seances.map((s) => (s.cle === cle ? { ...s, ...patch } : s)) }));
  const deplace = (cle: string, sens: -1 | 1) => setBrouillon((b) => {
    const i = b.seances.findIndex((s) => s.cle === cle);
    const j = i + sens;
    if (i < 0 || j < 0 || j >= b.seances.length) return b;
    const suite = [...b.seances];
    [suite[i], suite[j]] = [suite[j], suite[i]];
    return { ...b, seances: suite };
  });
  const retire = async (cle: string) => {
    if (!await demande({
      quoi: 'Séance du manuel',
      titre: 'Retirer cette séance du manuel ?',
      dit: 'Elle ne partira qu’à l’enregistrement : tant que vous n’enregistrez pas, rien n’est perdu.',
      accepter: 'Retirer la séance',
      refuser: 'Garder la séance',
      dur: true,
    })) return;
    setBrouillon((b) => ({ ...b, seances: b.seances.filter((s) => s.cle !== cle) }));
  };
  const ajoute = () => {
    const cle = nouvelleCle();
    setBrouillon((b) => ({
      ...b,
      seances: [...b.seances, {
        cle, module: b.seances[b.seances.length - 1]?.module ?? 1, titre: '', duree: '', objectif: '',
        preparer: '', deroule: [['', '']], vu: '', pratique: '', mesure: [['', '/5']],
        evaluation: '', teteReelle: '', erreurs: '', ensuite: '',
      }],
    }));
    setDeplie(cle);
  };
  const ferme = async () => {
    if (!lectureSeule && modifie && !await demande({
      quoi: 'Corrections en cours',
      titre: 'Fermer sans enregistrer ?',
      dit: 'Les corrections en cours seront perdues.',
      accepter: 'Fermer sans enregistrer',
      refuser: 'Rester sur le manuel',
      dur: true,
    })) return;
    onClose();
  };
  const enregistre = async () => {
    const lu = lisLeManuel({ formations: { [id]: versFichier(brouillon, noms) } }, existant?.importeLe ?? '');
    if (lu.erreurs.length || !lu.manuels[0]) {
      setErreurs(lu.erreurs.length ? lu.erreurs : ['Le manuel ne se lit pas.']);
      return;
    }
    const courant = JSON.stringify(manuelStore.get().find((m) => m.id === id) ?? null);
    if (courant !== depart && !await demande({
      quoi: 'Manuel modifié ailleurs',
      titre: 'Enregistrer vos corrections par-dessus ?',
      dit: 'Ce manuel a été modifié sur un autre poste pendant que vous le corrigiez.',
      scelle: 'Les corrections de l’autre poste seront remplacées par les vôtres.',
      accepter: 'Enregistrer par-dessus',
      refuser: 'Ne rien écraser',
      dur: true,
    })) return;
    const manuel: ManuelDeFormation = {
      ...lu.manuels[0],
      importeLe: existant?.importeLe,
      modifieLe: aujourdhui(),
      modifiePar: moi?.name ?? undefined,
    };
    manuelStore.set((prev) => [...prev.filter((m) => m.id !== id), manuel]);
    toast(`Manuel de ${parcours.titre} enregistré.${lu.alertes.length ? ` ${lu.alertes.join(' ')}` : ''}`);
    onClose();
  };

  const listeLignes = (label: string, valeur: string, patch: (v: string) => Partial<SeanceBrouillon>, cle: string) => (
    <Field label={label}>
      <Textarea rows={4} value={valeur} onChange={(e) => majSeance(cle, patch(e.target.value))} />
    </Field>
  );

  return (
    <Modal title={`Le manuel · ${parcours.titre}.`} onClose={ferme} width={920}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="mnd-muted" style={{ fontSize: 12, lineHeight: 1.55 }}>
          {PUBLIC_LABEL[parcours.public]} · {brouillon.seances.length} séance{brouillon.seances.length > 1 ? 's' : ''} écrite{brouillon.seances.length > 1 ? 's' : ''}, {parcours.seances} au programme
          {existant?.modifieLe ? ` · corrigé le ${jourCourtAn(existant.modifieLe)}${existant.modifiePar ? ` par ${existant.modifiePar}` : ''}` : ''}
          {lectureSeule ? ' · lecture seule : la direction corrige le manuel.' : ''}
        </div>

        <fieldset disabled={lectureSeule} style={SANS_CADRE}>
          <Field label="La ligne de présentation">
            <Input value={brouillon.meta} onChange={(e) => setBrouillon({ ...brouillon, meta: e.target.value })} />
          </Field>
          <Field label="L’introduction pour la formatrice">
            <Textarea rows={3} value={brouillon.intro} onChange={(e) => setBrouillon({ ...brouillon, intro: e.target.value })} />
          </Field>
          <Field label="Le matériel de la formation · une ligne par élément">
            <Textarea rows={4} value={brouillon.materiel} onChange={(e) => setBrouillon({ ...brouillon, materiel: e.target.value })} />
          </Field>
        </fieldset>

        <div className="mnd-eyebrow" style={{ fontSize: 9.5, color: 'var(--copper-700)' }}>Les séances</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {brouillon.seances.map((s, i) => {
            const ouvert = deplie === s.cle;
            return (
              <div key={s.cle} style={{ border: '1px solid var(--hairline)', borderRadius: 3, background: 'var(--surface-card)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setDeplie(ouvert ? null : s.cle)}
                    aria-expanded={ouvert}
                    style={{ flex: '1 1 260px', minWidth: 0, textAlign: 'left', background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit' }}
                  >
                    <span style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--color-indigo)' }}>
                      Séance {i + 1} · {s.titre || 'sans titre'}
                    </span>
                    <span className="mnd-muted" style={{ fontSize: 11.5, marginLeft: 8 }}>
                      module {s.module}{noms[s.module - 1] ? ` · ${noms[s.module - 1]}` : ''}{s.duree ? ` · ${s.duree}` : ''}
                    </span>
                  </button>
                  {!lectureSeule && (
                    <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <button type="button" className="tre-link-btn" disabled={i === 0} onClick={() => deplace(s.cle, -1)} aria-label={`Monter la séance ${i + 1}`}>▲</button>
                      <button type="button" className="tre-link-btn" disabled={i === brouillon.seances.length - 1} onClick={() => deplace(s.cle, 1)} aria-label={`Descendre la séance ${i + 1}`}>▼</button>
                      <button type="button" className="tre-link-btn tre-link-btn--danger" onClick={() => retire(s.cle)}>Retirer</button>
                    </span>
                  )}
                </div>
                {ouvert && (
                  <div style={{ padding: '4px 12px 14px' }}>
                    <fieldset disabled={lectureSeule} style={SANS_CADRE}>
                      <div className="tr-grid tr-grid--3" style={{ gap: 10 }}>
                        <Field label="Titre">
                          <Input value={s.titre} onChange={(e) => majSeance(s.cle, { titre: e.target.value })} />
                        </Field>
                        <Field label="Module">
                          <Select value={String(s.module)} onChange={(e) => majSeance(s.cle, { module: Number(e.target.value) })}>
                            {noms.map((nom, k) => <option key={k} value={k + 1}>{k + 1} · {nom}</option>)}
                          </Select>
                        </Field>
                        <Field label="Durée">
                          <Input value={s.duree} onChange={(e) => majSeance(s.cle, { duree: e.target.value })} />
                        </Field>
                      </div>
                      <Field label="Objectif">
                        <Textarea rows={2} value={s.objectif} onChange={(e) => majSeance(s.cle, { objectif: e.target.value })} />
                      </Field>
                      <div className="tr-grid tr-grid--2" style={{ gap: 10 }}>
                        {listeLignes('Préparer · une ligne par élément', s.preparer, (v) => ({ preparer: v }), s.cle)}
                        {listeLignes('Ce qui est vu · une ligne par point', s.vu, (v) => ({ vu: v }), s.cle)}
                        {listeLignes('Ce qui est pratiqué · une ligne par geste', s.pratique, (v) => ({ pratique: v }), s.cle)}
                        {listeLignes('Les erreurs à corriger · une ligne par erreur', s.erreurs, (v) => ({ erreurs: v }), s.cle)}
                      </div>
                      <Paires
                        titre="Le déroulé"
                        valeurs={s.deroule}
                        onChange={(v) => majSeance(s.cle, { deroule: v })}
                        placeholders={['20 min', 'Ce qui se passe']}
                        colonnes="96px minmax(0,1fr)"
                        ajout="+ Ajouter une étape"
                        lectureSeule={lectureSeule}
                      />
                      <Paires
                        titre="Ce qui est mesuré · chaque critère sur 5"
                        valeurs={s.mesure}
                        onChange={(v) => majSeance(s.cle, { mesure: v })}
                        placeholders={['Le critère', '/5']}
                        colonnes="minmax(0,1fr) 80px"
                        ajout="+ Ajouter un critère"
                        lectureSeule={lectureSeule}
                      />
                      <div className="tr-grid tr-grid--2" style={{ gap: 10 }}>
                        <Field label="Évaluation du module · en fin de module seulement">
                          <Textarea rows={3} value={s.evaluation} onChange={(e) => majSeance(s.cle, { evaluation: e.target.value })} />
                        </Field>
                        <Field label="Tête réelle">
                          <Textarea rows={3} value={s.teteReelle} onChange={(e) => majSeance(s.cle, { teteReelle: e.target.value })} />
                        </Field>
                      </div>
                      <Field label="Entre deux séances">
                        <Textarea rows={2} value={s.ensuite} onChange={(e) => majSeance(s.cle, { ensuite: e.target.value })} />
                      </Field>
                    </fieldset>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {erreurs.length > 0 && (
          <div style={{ borderLeft: '2px solid var(--color-brique, #96412E)', paddingLeft: 12, fontSize: 12.5, lineHeight: 1.55, color: 'var(--color-brique, #96412E)' }}>
            <b>Le manuel ne s’enregistre pas encore :</b>
            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              {erreurs.map((x, i) => <li key={i}>{x}</li>)}
            </ul>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {!lectureSeule && <Button variant="ghost" onClick={ajoute}>+ Ajouter une séance</Button>}
          <div style={{ display: 'flex', gap: 10, marginLeft: 'auto' }}>
            <Button variant="ghost" onClick={ferme}>{lectureSeule ? 'Fermer' : 'Annuler'}</Button>
            {!lectureSeule && <Button variant="copper" onClick={enregistre} disabled={!modifie}>Enregistrer</Button>}
          </div>
        </div>
      </div>
    </Modal>
  );
}
