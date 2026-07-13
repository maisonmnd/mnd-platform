import { useMemo, useState } from 'react';
import { PageHead } from '../_ui';
import { Button, Input, Textarea } from '../../../../ds/components';
import { personasStore, usePersonas, type Persona } from '../../../../shared/clients';
import { uid } from '../../../../shared/store';
import { useBranchClients } from './_shared';
import './clients.css';

/* Personas — l'intelligence des profils. Chaque tête couronnée reçoit un archétype ;
   ici la maison façonne chaque persona (nom, essence) et en crée de nouveaux. */

export default function Personas() {
  const [personas] = usePersonas();
  const clients = useBranchClients();
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of clients) m.set(c.persona, (m.get(c.persona) ?? 0) + 1);
    return m;
  }, [clients]);
  const total = clients.length || 1;

  const setField = (id: string, field: 'name' | 'essence', value: string) =>
    personasStore.set((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)));

  const addPersona = () => {
    const p: Persona = { id: uid(), name: 'Nouveau persona', essence: 'Décrivez comment la maison l’accueille…', builtin: false };
    personasStore.set((prev) => [...prev, p]);
  };

  const removePersona = (id: string) => {
    personasStore.set((prev) => prev.filter((p) => p.id !== id));
    setConfirmDel(null);
  };

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="CRM · Intelligence des profils"
        title="Les personas."
        sub="La maison attribue un archétype à chaque cliente d’après ses signaux. Ici vous façonnez chaque persona — son nom, son essence — et vous en créez de nouveaux pour affiner l’accueil."
        actions={<Button variant="copper" onClick={addPersona}>+ Nouveau persona</Button>}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {personas.map((p) => {
          const count = counts.get(p.id) ?? 0;
          const share = Math.round((count / total) * 100);
          return (
            <div className="trc-persona" key={p.id}>
              <div>
                <span className="trc-microlabel">Nom du persona</span>
                <Input value={p.name} onChange={(e) => setField(p.id, 'name', e.target.value)} style={{ fontFamily: 'var(--font-serif)', fontSize: 19, color: 'var(--color-indigo)' }} />
                <div style={{ display: 'flex', gap: 22, marginTop: 16 }}>
                  <div className="trc-persona__stat">
                    <b>{count}</b>
                    <span>clientes</span>
                  </div>
                  <div className="trc-persona__stat">
                    <b style={{ color: 'var(--color-copper)' }}>{share}%</b>
                    <span>du portefeuille</span>
                  </div>
                </div>
              </div>

              <div>
                <span className="trc-microlabel">Essence — comment la maison l’accueille</span>
                <Textarea
                  value={p.essence}
                  onChange={(e) => setField(p.id, 'essence', e.target.value)}
                  style={{ minHeight: 88, resize: 'vertical', fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 14, lineHeight: 1.5 }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
                {p.builtin ? (
                  <span className="trc-src trc-src--indigo">Archétype maison</span>
                ) : (
                  <span className="trc-src">Créé par la maison</span>
                )}
                <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
                  {p.builtin
                    ? 'Archétype fondateur — modifiable, jamais supprimable.'
                    : 'Persona sur-mesure de la maison.'}
                </div>
                {!p.builtin &&
                  (confirmDel === p.id ? (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button size="sm" variant="copper" onClick={() => removePersona(p.id)}>Confirmer</Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmDel(null)}>Annuler</Button>
                    </div>
                  ) : (
                    <button className="trc-iconbtn trc-iconbtn--danger" style={{ width: 'auto', padding: '0 12px', height: 28 }} onClick={() => setConfirmDel(p.id)}>
                      Supprimer
                    </button>
                  ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
