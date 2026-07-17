import { useMemo, useState } from 'react';
import { PageHead } from '../_ui';
import { Button, Input, Textarea } from '../../../../ds/components';
import { personasStore, clientsStore, useClients, usePersonas, initiePersonaId, type Persona } from '../../../../shared/clients';
import { uid } from '../../../../shared/store';
import { useBranchClients } from './_shared';
import './clients.css';

/* Personas — l'intelligence des profils. Chaque tête couronnée reçoit un archétype ;
   ici la maison façonne chaque persona (nom, essence), en crée, en réordonne et
   en retire — la seule intouchable est « Initiée », le seuil par où entre toute
   nouvelle cliente. */

/** Reconnaît le persona d'accueil : jamais supprimable, il ancre l'intake et sert
    de refuge aux clientes d'un persona qu'on efface. */
const isInitie = (p: Persona) => p.id === 'p-initie' || /^\s*initi/i.test(p.name);

export default function Personas() {
  const [personas] = usePersonas();
  const clients = useBranchClients();
  const [allClients] = useClients();
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of clients) m.set(c.persona, (m.get(c.persona) ?? 0) + 1);
    return m;
  }, [clients]);
  const total = clients.length || 1;

  /* Combien de clientes (toutes branches) portent ce persona — ce qu'un retrait
     réaffecterait. Le compteur d'affichage est par branche ; celui-ci ne l'est pas,
     car un persona est partagé par la maison entière. */
  const globalCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of allClients) m.set(c.persona, (m.get(c.persona) ?? 0) + 1);
    return m;
  }, [allClients]);

  const setField = (id: string, field: 'name' | 'essence', value: string) =>
    personasStore.set((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)));

  const addPersona = () => {
    const p: Persona = { id: uid(), name: 'Nouveau persona', essence: 'Décrivez comment la maison l’accueille…', builtin: false };
    personasStore.set((prev) => [...prev, p]);
  };

  /* Réordonner — l'ordre de la liste EST l'ordre partout (fiche, intake). */
  const move = (id: string, dir: -1 | 1) =>
    personasStore.set((prev) => {
      const i = prev.findIndex((p) => p.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  /* Retirer un persona — jamais « Initiée ». Ses clientes ne restent pas orphelines :
     elles refluent vers Initiée, le seuil, plutôt que de porter un archétype fantôme. */
  const removePersona = (id: string) => {
    const initieId = initiePersonaId();
    if (id === initieId) { setConfirmDel(null); return; } // garde-fou : jamais l'ancre d'accueil
    if (initieId) {
      clientsStore.set((prev) => prev.map((c) => (c.persona === id ? { ...c, persona: initieId } : c)));
    }
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
        {personas.map((p, i) => {
          const count = counts.get(p.id) ?? 0;
          const share = Math.round((count / total) * 100);
          const initie = isInitie(p);
          const affected = globalCount.get(p.id) ?? 0;
          return (
            <div className="trc-persona" key={p.id}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span className="trc-microlabel" style={{ margin: 0 }}>Nom du persona</span>
                  {/* Réordonner — la place dans la liste vaut partout ailleurs. */}
                  <span style={{ display: 'flex', gap: 4, flex: 'none' }}>
                    <button className="trc-iconbtn" disabled={i === 0} onClick={() => move(p.id, -1)} title="Monter" aria-label="Monter le persona">▲</button>
                    <button className="trc-iconbtn" disabled={i === personas.length - 1} onClick={() => move(p.id, 1)} title="Descendre" aria-label="Descendre le persona">▼</button>
                  </span>
                </div>
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
                {initie ? (
                  <span className="trc-src trc-src--indigo">Seuil d’accueil</span>
                ) : p.builtin ? (
                  <span className="trc-src trc-src--indigo">Archétype maison</span>
                ) : (
                  <span className="trc-src">Créé par la maison</span>
                )}
                <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
                  {initie
                    ? 'Le seuil par où entre toute nouvelle cliente — modifiable, jamais supprimable.'
                    : p.builtin
                      ? 'Archétype fondateur — modifiable et, si besoin, retirable.'
                      : 'Persona sur-mesure de la maison.'}
                </div>
                {!initie &&
                  (confirmDel === p.id ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
                      {affected > 0 && (
                        <div style={{ fontSize: 11.5, color: 'var(--copper-700)' }}>
                          {affected} cliente{affected > 1 ? 's' : ''} repasseront à « Initiée ».
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <Button size="sm" variant="copper" onClick={() => removePersona(p.id)}>Confirmer le retrait</Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmDel(null)}>Annuler</Button>
                      </div>
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
