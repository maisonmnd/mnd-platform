import { useCallback, useEffect, useState } from 'react';
import { Button, Field, Input, Select, Textarea, demande, toast } from '../../../../ds/components';
import { useStaff as useMaTete } from '../../../../shared/auth';
import { lienWaMe } from '../../../../shared/conversations';
import { supabase } from '../../../../shared/supabase';
import {
  ANNEE, NOM_DE_LA_PREPARATOIRE, STATUTS_PREP, TABLE_DE_LA_PREPARATOIRE, ageALaRentreePrep, classePleine, inscriptionNettoyee, placesPrises, prixDit,
  type InscriptionPreparatoire, type StatutPrep, type SuiviPrep,
} from '../../../../shared/preparatoire-pur';
import { dateLongue } from '../../../../shared/releve-pur';
import { Pill } from './ui';

/* ══ L'ANNÉE PRÉPARATOIRE, AU TRÔNE — 15 octobre 2026 ══════════════════
   Les demandes que les parents déposent sur le site de l'Académie. Des
   MINEURES : la boîte (0131) ne se lit que par la direction, en direct, sans
   magasin partagé, comme les demandes de l'Académie. On y suit chaque
   demande (entretien, inscription, inscription réglée), on appelle le parent
   sur WhatsApp, on efface ce qui ne sert plus. La classe est de huit : une
   neuvième ne s'inscrit pas. */
type Ligne = { id: string; created_at: string; annee: string; inscription: InscriptionPreparatoire; suivi: SuiviPrep; brut: Record<string, unknown> };
const TON: Record<StatutPrep, 'ok' | 'warn' | 'muted' | 'copper'> = { nouvelle: 'warn', entretien: 'copper', inscrite: 'ok', ecartee: 'muted' };

export default function AcademiePreparatoire() {
  const me = useMaTete();
  const souverain = me?.role === 'souverain';
  const [lignes, setLignes] = useState<Ligne[] | null>(null);
  const [ouverte, setOuverte] = useState<string | null>(null);

  const relire = useCallback(async () => {
    if (!supabase) { setLignes([]); return; }
    const { data, error } = await supabase.from(TABLE_DE_LA_PREPARATOIRE).select('id, data, created_at').order('created_at', { ascending: false }).limit(200);
    if (error) { setLignes([]); return; }
    const out: Ligne[] = [];
    for (const r of (data ?? []) as { id: string; data: Record<string, unknown>; created_at: string }[]) {
      const inscription = inscriptionNettoyee(r.data);
      if (!inscription) continue;
      out.push({ id: r.id, created_at: r.created_at, annee: String(r.data?.annee ?? ANNEE.cle), inscription, suivi: (r.data?.suivi ?? {}) as SuiviPrep, brut: r.data ?? {} });
    }
    setLignes(out);
  }, []);
  useEffect(() => { void relire(); }, [relire]);

  const pose = async (l: Ligne, suivi: SuiviPrep) => {
    if (!supabase) return;
    if (suivi.statut === 'inscrite' && l.suivi.statut !== 'inscrite' && lignes && classePleine(lignes)) {
      toast(`La classe est pleine : ${ANNEE.places} inscrites.`);
      return;
    }
    const { error } = await supabase.from(TABLE_DE_LA_PREPARATOIRE).update({ data: { ...l.brut, suivi } }).eq('id', l.id);
    if (error) { toast('Le suivi n’a pas pu s’enregistrer. Réessayez.'); return; }
    toast('Suivi enregistré.');
    void relire();
  };
  const efface = async (l: Ligne) => {
    if (!supabase) return;
    if (!await demande({
      quoi: NOM_DE_LA_PREPARATOIRE,
      titre: `Effacer la demande de ${l.inscription.jeune.prenom} ?`,
      dit: 'Ses données et celles de son parent quittent la base. Rien ne se rattrape.',
      accepter: 'Effacer',
      refuser: 'Garder',
    })) return;
    const { error } = await supabase.from(TABLE_DE_LA_PREPARATOIRE).delete().eq('id', l.id);
    if (error) { toast('L’effacement n’a pas abouti.'); return; }
    toast('Effacée.');
    void relire();
  };

  if (!souverain) return <p className="sad-doux">{NOM_DE_LA_PREPARATOIRE} : des mineures, que seule la direction lit.</p>;
  if (lignes === null) return <p className="sad-doux">Les demandes se chargent.</p>;
  const prises = placesPrises(lignes);
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <p className="sad-doux">
        Rentrée le {dateLongue(ANNEE.rentree)}, jusqu’en {ANNEE.finDit} · {prixDit()} · <b>{prises} sur {ANNEE.places}</b> places prises.
      </p>
      {lignes.length === 0 && <p className="sad-doux">Aucune demande pour l’instant. Le site de l’Académie les déposera ici.</p>}
      {lignes.map((l) => (
        <Demande key={l.id} l={l} ouverte={ouverte === l.id} bascule={() => setOuverte(ouverte === l.id ? null : l.id)} pose={pose} efface={efface} />
      ))}
    </div>
  );
}

function Demande({ l, ouverte, bascule, pose, efface }: {
  l: Ligne; ouverte: boolean; bascule: () => void; pose: (l: Ligne, s: SuiviPrep) => Promise<void>; efface: (l: Ligne) => Promise<void>;
}) {
  const { jeune, parent } = l.inscription;
  const age = ageALaRentreePrep(jeune.naissance);
  const statut: StatutPrep = l.suivi.statut ?? 'nouvelle';
  const [s, setS] = useState<SuiviPrep>(l.suivi);
  const message = `Bonjour ${parent.nom.split(' ')[0]}, ici l’Académie MND. Nous avons bien reçu la demande d’inscription de ${jeune.prenom} à l’année préparatoire. Quand pouvons-nous vous appeler ?`;
  const wa = lienWaMe(parent.telephone, message);
  return (
    <div className="sad-ligne">
      <button type="button" className="sad-ligne__tete" onClick={bascule}>
        <span className="sad-ligne__num">{dateLongue(l.created_at.slice(0, 10))}</span>
        <span className="sad-ligne__quoi"><b>{jeune.prenom} {jeune.nom}</b><small>{age !== null ? `${age} ans à la rentrée · ` : ''}{jeune.classe} · {parent.lien} : {parent.nom}</small></span>
        <Pill tone={TON[statut]}>{STATUTS_PREP[statut]}</Pill>
      </button>
      {ouverte && (
        <div className="sad-form" style={{ padding: '10px 4px 14px' }}>
          {l.inscription.mains && <p style={{ margin: 0 }}><span className="sad-doux">Ce qu’elle aime faire de ses mains :</span> {l.inscription.mains}</p>}
          <div><div className="sad-doux">Pourquoi ce métier, écrit par elle</div><p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{l.inscription.pourquoi}</p></div>
          <div className="tr-grid tr-grid--3" style={{ gap: 12 }}>
            <Field label="Où elle en est">
              <Select value={s.statut ?? 'nouvelle'} onChange={(e) => setS({ ...s, statut: e.target.value as StatutPrep })}>
                {(Object.keys(STATUTS_PREP) as StatutPrep[]).map((k) => <option key={k} value={k}>{STATUTS_PREP[k]}</option>)}
              </Select>
            </Field>
            <Field label="Entretien le"><Input type="date" value={s.entretienLe ?? ''} onChange={(e) => setS({ ...s, entretienLe: e.target.value || undefined })} /></Field>
            <Field label="Inscription réglée le"><Input type="date" value={s.inscriptionRegleeLe ?? ''} onChange={(e) => setS({ ...s, inscriptionRegleeLe: e.target.value || undefined })} /></Field>
          </div>
          <Field label="Note"><Textarea rows={2} value={s.note ?? ''} onChange={(e) => setS({ ...s, note: e.target.value || undefined })} /></Field>
          <div className="sec-actions" style={{ justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={() => void efface(l)}>Effacer</Button>
            {wa && <Button variant="ghost" onClick={() => window.open(wa, '_blank', 'noopener')}>Écrire au parent sur WhatsApp</Button>}
            <Button variant="copper" onClick={() => void pose(l, s)}>Garder</Button>
          </div>
        </div>
      )}
    </div>
  );
}
