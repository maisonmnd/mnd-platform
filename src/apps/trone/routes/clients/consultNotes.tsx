import { useState } from 'react';
import { Button, Input, Modal } from '../../../../ds/components';

/* Consultations dans la note de la maison — parsing, sérialisation, rendu et édition.
   Partagé entre la fiche Dossier (Consultations) et la fiche CRM 360 (Customers).

   Format d'un bloc dans `client.notes` :
     ── Consultation · <nom> · <date> ──
     1. <question>
        → <réponse>
     2. ... */

export type ConsultQA = { q: string; a: string };
export type ConsultBlock = { name: string; date: string; qa: ConsultQA[] };

const CONSULT_HEADER = /^── Consultation · (.+) ──$/;

/** Sépare la note en (texte libre) + (blocs consultation) + (texte brut des blocs). */
export function splitNotes(raw: string | undefined): { free: string; consultRaw: string; blocks: ConsultBlock[] } {
  const lines = (raw ?? '').split('\n');
  let firstIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (CONSULT_HEADER.test(lines[i])) { firstIdx = i; break; }
  }
  const free = (firstIdx === -1 ? lines : lines.slice(0, firstIdx)).join('\n').trim();
  const consultRaw = firstIdx === -1 ? '' : lines.slice(firstIdx).join('\n').trim();
  const blocks: ConsultBlock[] = [];
  let cur: { name: string; date: string; qa: ConsultQA[]; a: ConsultQA | null } | null = null;
  const closeQA = () => { if (cur && cur.a) { cur.qa.push(cur.a); cur.a = null; } };
  const flush = () => { if (cur) { closeQA(); blocks.push({ name: cur.name, date: cur.date, qa: cur.qa }); cur = null; } };
  for (const line of consultRaw ? consultRaw.split('\n') : []) {
    const h = line.match(CONSULT_HEADER);
    if (h) {
      flush();
      const inner = h[1];
      const idx = inner.lastIndexOf(' · ');
      cur = { name: idx >= 0 ? inner.slice(0, idx) : inner, date: idx >= 0 ? inner.slice(idx + 3) : '', qa: [], a: null };
      continue;
    }
    if (!cur) continue;
    const qm = line.match(/^\d+\.\s?(.*)$/);
    if (qm) { closeQA(); cur.a = { q: qm[1].trim(), a: '' }; continue; }
    const am = line.match(/^\s*→\s?(.*)$/);
    if (am && cur.a) { cur.a.a = cur.a.a ? `${cur.a.a}\n${am[1]}` : am[1]; continue; }
    const t = line.trim();
    if (t && cur.a) cur.a.a = cur.a.a ? `${cur.a.a}\n${t}` : t;
  }
  flush();
  return { free, consultRaw, blocks };
}

/** Reconstitue le texte d'un bloc consultation (inverse de splitNotes). */
export function serializeBlock(b: ConsultBlock): string {
  const header = `── Consultation · ${b.name}${b.date ? ` · ${b.date}` : ''} ──`;
  const lines = b.qa.map((qa, i) => `${i + 1}. ${qa.q}\n   → ${qa.a || '—'}`);
  return [header, ...lines].join('\n');
}

/** Recompose la note complète : texte libre + blocs consultation. */
export function serializeNotes(free: string, blocks: ConsultBlock[]): string {
  return [free.trim(), ...blocks.map(serializeBlock)].filter(Boolean).join('\n\n');
}

/** Rendu des consultations en cartes distinctes (en-tête cuivre serif + Q/R). */
export function ConsultCards({
  blocks, onSummary, onEdit,
}: {
  blocks: ConsultBlock[];
  onSummary?: (b: ConsultBlock) => void;
  onEdit?: (index: number, b: ConsultBlock) => void;
}) {
  if (blocks.length === 0) return null;
  return (
    <div className="trc-consults">
      {blocks.map((b, i) => (
        <div className="trc-consult-card" key={i}>
          <div className="trc-consult-card__head">
            <span className="trc-consult-card__name">{b.name}</span>
            {b.date && <span className="trc-consult-card__date">{b.date}</span>}
            {onEdit && (
              <button className="trc-consult-card__summary" onClick={() => onEdit(i, b)}>Modifier</button>
            )}
            {onSummary && (
              <button className="trc-consult-card__summary" onClick={() => onSummary(b)}>Résumé (PDF)</button>
            )}
          </div>
          <div className="trc-consult-card__body">
            {b.qa.map((qa, j) => (
              <div className="trc-consult-qa" key={j}>
                <div className="trc-consult-qa__q">{qa.q}</div>
                <div className="trc-consult-qa__a">{qa.a || '—'}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- Modale · Modifier une consultation enregistrée ---------- */
/** Édite le nom, les questions ET les réponses ; permet d'ajouter/retirer une
    question, ou de supprimer toute la consultation. */
export function EditConsultModal({
  block, onSave, onDelete, onClose,
}: {
  block: ConsultBlock;
  onSave: (updated: ConsultBlock) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(block.name);
  const [qa, setQa] = useState<ConsultQA[]>(block.qa.map((x) => ({ ...x })));
  const setQ = (i: number, v: string) => setQa((prev) => prev.map((x, j) => (j === i ? { ...x, q: v } : x)));
  const setA = (i: number, v: string) => setQa((prev) => prev.map((x, j) => (j === i ? { ...x, a: v } : x)));
  const addQ = () => setQa((prev) => [...prev, { q: '', a: '' }]);
  const delQ = (i: number) => setQa((prev) => prev.filter((_, j) => j !== i));

  return (
    <Modal title="Modifier la consultation." onClose={onClose} width={640}>
      <div style={{ marginBottom: 14 }}>
        <span className="trc-microlabel" style={{ marginBottom: 4 }}>Type de consultation{block.date ? ` · ${block.date}` : ''}</span>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom de la consultation" />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {qa.map((x, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <span className="trc-qno">{i + 1}</span>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7, minWidth: 0 }}>
              <Input value={x.q} onChange={(e) => setQ(i, e.target.value)} placeholder="Intitulé de la question" />
              <textarea
                className="trc-dossier-notes trc-fill-answer"
                value={x.a}
                onChange={(e) => setA(i, e.target.value)}
                placeholder="Réponse de la cliente…"
                rows={2}
              />
            </div>
            <button
              type="button"
              className="trc-iconbtn trc-iconbtn--danger"
              style={{ flex: 'none', marginTop: 4 }}
              onClick={() => delQ(i)}
              title="Retirer cette question"
            >
              ✕
            </button>
          </div>
        ))}
        <button type="button" className="trc-addline" onClick={addQ}>+ Ajouter une question</button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 18, flexWrap: 'wrap' }}>
        <button type="button" className="trc-danger__btn" onClick={onDelete}>Supprimer cette consultation</button>
        <div style={{ display: 'flex', gap: 10, marginLeft: 'auto' }}>
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button variant="copper" onClick={() => onSave({ ...block, name: name.trim() || block.name, qa })}>Enregistrer</Button>
        </div>
      </div>
    </Modal>
  );
}
