import { useMemo, useState } from 'react';
import { toast } from '../../../../ds/components';
import type { Appointment } from '../../../../shared/agenda';
import type { Client } from '../../../../shared/clients';
import type { Service } from '../../../../shared/catalog';
import { useProducts } from '../../../../shared/catalog';
import { JAUGES_SEED, RITUEL_SEED, dernierBilanDe, ecritLaNote, useBilans, useNotesDeSeance } from '../../../../shared/bilans';
import { useFormulesLab } from '../../../../shared/formules';
import { LAB_FORMULAS } from '../vente/lab';
import {
  NATURES_DU_CHEVEU, SIGNES_METISSE, SIGNES_VUS, brouillonDeLaMain, contexteDuBilan, idDeLaNote, noteVide,
  type BrouillonDeBilan, type NoteDeSeance,
} from '../../../../shared/bilan-assistant-pur';
import { redigeLeBilan, type DemandeAuBilan, type ListesDeLaMaison } from '../../../../shared/bilan-assistant';
import { dateDite } from '../../../../shared/bilan-document';
import { BilanModal } from './BilanModal';

/* LE BILAN DE LA SÉANCE, DANS LE RENDEZ-VOUS — 4 octobre 2026.

   Réponse au sélecteur : « dans le rendez-vous, après la séance ». Des cases
   pour ce que le maître a vu, la nature du cheveu (et, s'il est métissé, ses
   problèmes propres), deux lignes libres, et un bouton. L'assistant connaît
   déjà le reste : son style, ses locks, ses bilans d'avant, sa consultation.

   LA NOTE S'ÉCRIT DANS SA PROPRE TABLE (0115), réservée au personnel, et
   jamais dans le rendez-vous, que la cliente lit dans Ma Couronne. */

const puce = (on: boolean): React.CSSProperties => ({
  fontSize: 12, padding: '4px 10px', borderRadius: 999, cursor: 'pointer',
  border: `1px solid ${on ? 'var(--color-copper)' : 'var(--hairline)'}`,
  background: on ? 'var(--copper-100, #F6EADF)' : 'transparent',
  color: on ? 'var(--copper-700)' : 'var(--ink)',
});
const etiquette: React.CSSProperties = { fontSize: 10.5, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--copper-700)' };

export function LeBilanDeLaSeance({ appt, client, byId }: {
  appt: Appointment;
  client: Client | undefined;
  byId: Map<string, Service>;
}) {
  const [notes] = useNotesDeSeance();
  const [bilans] = useBilans();
  const [produits] = useProducts();
  const [formulesLab] = useFormulesLab();
  const id = idDeLaNote(appt.id);
  const enregistree = notes.find((n) => n.id === id);
  const bilan = bilans.find((b) => b.apptId === appt.id);

  /* La nature du cheveu ne change pas d'une séance à l'autre : la dernière
     note de la même tête la propose. */
  const natureConnue = useMemo(
    () => [...notes].filter((n) => n.clientId === appt.clientId && n.nature).sort((a, b) => b.ecritLe.localeCompare(a.ecritLe))[0]?.nature
      ?? bilans.filter((b) => b.clientId === appt.clientId && b.nature).sort((a, b) => b.remisLe.localeCompare(a.remisLe))[0]?.nature,
    [notes, bilans, appt.clientId],
  );

  const [note, setNote] = useState<NoteDeSeance>(() => enregistree ?? {
    id, apptId: appt.id, clientId: appt.clientId, branchId: appt.branchId,
    nature: natureConnue, vu: [], metisse: [], attendu: '', retenir: '', ecritLe: new Date().toISOString(),
  });
  const [ouvert, setOuvert] = useState(!bilan && (!noteVide(enregistree) || appt.status === 'honoré'));
  const [enCours, setEnCours] = useState(false);
  const [fiche, setFiche] = useState<BrouillonDeBilan | null>(null);
  const [parLaMain, setParLaMain] = useState(false);

  /* Une case se garde au geste ; un texte, quand on quitte le champ. */
  const garde = (n: NoteDeSeance) => {
    const suivante = { ...n, ecritLe: new Date().toISOString() };
    setNote(suivante);
    ecritLaNote(suivante);
  };
  const bascule = (champ: 'vu' | 'metisse', mot: string) => {
    const l = note[champ];
    garde({ ...note, [champ]: l.includes(mot) ? l.filter((x) => x !== mot) : [...l, mot] });
  };

  const listes = (): ListesDeLaMaison => ({
    prestations: [...byId.values()].map((s) => ({ id: s.id, nom: s.name })),
    formules: [...new Set([...Object.values(LAB_FORMULAS).map((f) => f.name), ...formulesLab.map((f) => f.nom)])],
    produits: produits.map((p) => p.name),
  });

  const contexte = () => {
    if (!client) throw new Error('La fiche de la cliente est introuvable.');
    const passes = bilans
      .filter((b) => b.clientId === client.id && b.apptId !== appt.id)
      .sort((a, b) => b.date.localeCompare(a.date));
    return contexteDuBilan({
      fiche: client,
      note,
      seance: {
        date: dateDite(appt.date),
        prestations: appt.serviceIds.map((s) => byId.get(s)?.name).filter((s): s is string => !!s),
        praticien: appt.master,
      },
      bilansPasses: passes,
    });
  };

  const demande = (quoi: DemandeAuBilan, actuel?: BrouillonDeBilan) =>
    redigeLeBilan({ demande: quoi, contexte: contexte(), listes: listes(), ...(actuel ? { actuel } : {}) });

  const rediger = async () => {
    if (enCours) return;
    if (noteVide(note)) { toast('Cochez ce que vous avez vu, ou écrivez ce que vous attendez : l’assistant part de vos mots.'); return; }
    setEnCours(true);
    try {
      const b = await demande('rediger');
      garde({ ...note, brouillon: b, brouillonLe: new Date().toISOString() });
      setParLaMain(false);
      setFiche(b);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setEnCours(false);
    }
  };

  /* ÉCRIRE SOI-MÊME — 5 octobre 2026 : la même fiche, remplie de la note,
     sans appel à l'assistant ni crédit. Jauges et rituel du bilan précédent. */
  const ecrireMoiMeme = () => {
    garde(note);
    const precedent = client ? dernierBilanDe(bilans, client.id) : undefined;
    setParLaMain(true);
    setFiche(brouillonDeLaMain(note, {
      jauges: precedent?.jauges?.length ? precedent.jauges : JAUGES_SEED,
      rituel: precedent?.rituel?.length ? precedent.rituel : RITUEL_SEED,
    }));
  };

  const resumeDeLaLigne = bilan
    ? `Remis · ${bilan.numero}`
    : note.brouillon ? 'Brouillon de l’assistant, à relire et signer'
      : noteVide(note) ? 'À écrire après la séance' : 'Note commencée';

  return (
    <div style={{ border: '1px solid var(--hairline)', borderRadius: 8, overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        aria-expanded={ouvert}
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, padding: '10px 12px', background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', textAlign: 'left' }}
      >
        <span style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--color-indigo)' }}>Le bilan de la séance</span>
        <span className="mnd-muted" style={{ fontSize: 12 }}>{resumeDeLaLigne} {ouvert ? '▴' : '▾'}</span>
      </button>

      {ouvert && (
        <div style={{ display: 'grid', gap: 12, padding: '0 12px 12px' }}>
          {bilan && (
            <div className="mnd-muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
              Le bilan {bilan.numero} a été signé par {bilan.praticien ?? 'la Maison'} le {dateDite(bilan.remisLe)}.
              Il se renvoie et s'imprime depuis la fiche de la cliente.
            </div>
          )}

          <div style={{ display: 'grid', gap: 6 }}>
            <span style={etiquette}>La nature du cheveu</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {NATURES_DU_CHEVEU.map((n) => (
                <button key={n.cle} type="button" aria-pressed={note.nature === n.cle} style={puce(note.nature === n.cle)}
                  onClick={() => garde({ ...note, nature: note.nature === n.cle ? undefined : n.cle })}>{n.dit}</button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gap: 6 }}>
            <span style={etiquette}>Ce que je vois</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {SIGNES_VUS.map((m) => (
                <button key={m} type="button" aria-pressed={note.vu.includes(m)} style={puce(note.vu.includes(m))} onClick={() => bascule('vu', m)}>{m}</button>
              ))}
            </div>
          </div>

          {note.nature === 'metisse' && (
            <div style={{ display: 'grid', gap: 6 }}>
              <span style={etiquette}>Le cheveu métissé</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {SIGNES_METISSE.map((m) => (
                  <button key={m} type="button" aria-pressed={note.metisse.includes(m)} style={puce(note.metisse.includes(m))} onClick={() => bascule('metisse', m)}>{m}</button>
                ))}
              </div>
            </div>
          )}

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={etiquette}>Ce que j'attends</span>
            <textarea
              className="mnd-input" rows={3} value={note.attendu}
              onChange={(e) => setNote({ ...note, attendu: e.target.value })}
              onBlur={() => garde(note)}
              placeholder="Racines sèches sur la nuque, elle lave trop souvent. Veut de la longueur pour mars…"
              style={{ resize: 'vertical', fontSize: 13, lineHeight: 1.5 }}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={etiquette}>Ce que je veux qu'elle retienne</span>
            <textarea
              className="mnd-input" rows={2} value={note.retenir}
              onChange={(e) => setNote({ ...note, retenir: e.target.value })}
              onBlur={() => garde(note)}
              placeholder="Moins laver, mieux nourrir. Revenir dans 6 semaines."
              style={{ resize: 'vertical', fontSize: 13, lineHeight: 1.5 }}
            />
          </label>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" className="mnd-btn mnd-btn--copper" onClick={rediger} disabled={enCours || !client}>
              {enCours ? 'L’assistant rédige…' : note.brouillon ? 'Rédiger à nouveau' : 'Rédiger le bilan avec l’assistant'}
            </button>
            <button type="button" className="mnd-btn mnd-btn--ghost" onClick={ecrireMoiMeme} disabled={enCours || !client}>
              Écrire le bilan moi-même
            </button>
            {note.brouillon && !enCours && (
              <button type="button" className="mnd-btn mnd-btn--ghost" onClick={() => { setParLaMain(false); setFiche(note.brouillon!); }}>
                Reprendre le brouillon
              </button>
            )}
          </div>
          <div className="mnd-muted" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
            « Écrire le bilan moi-même » est gratuit : la fiche s’ouvre remplie de votre note. Seul l’assistant utilise du crédit Anthropic ;
            il reçoit son prénom et ce qui touche à ses cheveux, jamais son numéro. Il propose ; vous relisez et vous signez.
            Cette note reste dans le Trône : {client ? client.name.split(' ')[0] : 'la cliente'} ne la voit pas.
          </div>
        </div>
      )}

      {fiche && client && (
        <BilanModal
          client={client}
          honored={[appt]}
          byId={byId}
          branchId={client.branchId}
          seance={appt}
          brouillon={fiche}
          nature={note.nature}
          parLaMain={parLaMain}
          surRedemande={parLaMain ? undefined : (quoi, actuel) => demande(quoi, actuel)}
          surRemis={(b) => garde({ ...note, brouillon: undefined, brouillonLe: undefined, bilanId: b.id })}
          onClose={() => setFiche(null)}
        />
      )}
    </div>
  );
}
