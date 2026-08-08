import { useMemo, useState, type CSSProperties } from 'react';
import { PageHead } from '../_ui';
import { Button, Input, Select, Textarea } from '../../../../ds/components';
import { personasStore, clientsStore, useClients, usePersonas, initiePersonaId, type Persona, type Client } from '../../../../shared/clients';
import { useServices } from '../../../../shared/catalog';
import { ENVIES, type EnvieKey } from '../../../../shared/quiz';
import { uid } from '../../../../shared/store';
import { Avatar, useBranchClients } from './_shared';
import './clients.css';

/** Aplati pour la recherche : sans casse, sans accent. */
const fold = (s?: string) => (s ?? '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

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
  const [tab, setTab] = useState<'archetypes' | 'clientele'>('archetypes');

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

  /* CE QUE LE QUIZ PROPOSE AUX TÊTES DE CET ARCHÉTYPE. La désignation vivait à
     la Régie, une seule pour toute la Maison : la même réponse à une Initiée qui
     découvre et à une Souveraine de dix ans. Elle se fait ici — six réglages au
     lieu de cent quatre-vingt-six, et une nouvelle cliente hérite du sien dès
     qu'elle est classée. */
  const [services] = useServices();
  const servicesTries = useMemo(() => services.slice().sort((a, b) => a.name.localeCompare(b.name)), [services]);
  const setReco = (id: string, k: EnvieKey, serviceId: string) =>
    personasStore.set((prev) => prev.map((p) => (p.id === id
      ? { ...p, recoParEnvie: { ...(p.recoParEnvie ?? {}), [k]: serviceId || undefined } }
      : p)));

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
        sub="La maison attribue un archétype à chaque cliente d’après ses signaux. Ici vous façonnez chaque persona — son nom, son essence — et vous gérez qui le porte."
        actions={tab === 'archetypes' ? <Button variant="copper" onClick={addPersona}>+ Nouveau persona</Button> : undefined}
      />

      <div className="trc-tabs" style={{ marginBottom: 22 }}>
        <button className={`trc-tab ${tab === 'archetypes' ? 'is-active' : ''}`} onClick={() => setTab('archetypes')}>Les archétypes</button>
        <button className={`trc-tab ${tab === 'clientele' ? 'is-active' : ''}`} onClick={() => setTab('clientele')}>Clientèle par persona</button>
      </div>

      {tab === 'clientele' && <ClienteleTab personas={personas} clients={clients} />}

      {tab === 'archetypes' && (
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
                    <b style={{ color: 'var(--copper-700)' }}>{share}%</b>
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

              {/* Le quiz de la Vitrine et de Ma Couronne — quatre envies, quatre
                  prestations RÉELLES du catalogue. Rien de désigné ici = la
                  Régie de la Vitrine répond (repli de la Maison) ; rien nulle
                  part = le quiz ne propose rien à ces têtes. */}
              <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--hairline)', paddingTop: 14 }}>
                <span className="trc-microlabel">Le quiz · ce qu’on propose à ces têtes</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
                  {ENVIES.map((e) => (
                    <label key={e.k} style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                      <span className="trc-sub">{e.label}</span>
                      <Select
                        value={p.recoParEnvie?.[e.k] ?? ''}
                        onChange={(ev) => setReco(p.id, e.k, ev.target.value)}
                        style={{ fontSize: 12, minWidth: 0 }}
                      >
                        <option value="">— comme la Maison —</option>
                        {servicesTries.map((sv) => <option key={sv.id} value={sv.id}>{sv.name}</option>)}
                      </Select>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}

/* ---------- Onglet · Clientèle par persona ----------
   La liste, persona par persona : choisir un archétype montre qui le porte, et
   chaque cliente peut basculer vers un autre persona d'un geste. « À classer »
   regroupe les fiches dont le persona n'existe plus (imports, héritage). */
function ClienteleTab({ personas, clients }: { personas: Persona[]; clients: Client[] }) {
  const known = useMemo(() => new Set(personas.map((p) => p.id)), [personas]);
  const orphanCount = clients.filter((c) => !known.has(c.persona)).length;
  const [sel, setSel] = useState<string>(personas[0]?.id ?? '__none__');
  const [q, setQ] = useState('');

  const reassign = (clientId: string, personaId: string) =>
    clientsStore.set((prev) => prev.map((c) => (c.id === clientId ? { ...c, persona: personaId } : c)));

  const countOf = (id: string) => (id === '__none__' ? orphanCount : clients.filter((c) => c.persona === id).length);
  const inPersona = clients.filter((c) => (sel === '__none__' ? !known.has(c.persona) : c.persona === sel));
  const shown = inPersona.filter((c) => { const n = fold(q); return !n || fold(c.name).includes(n); });
  const selName = sel === '__none__' ? 'À classer' : personas.find((p) => p.id === sel)?.name ?? '';

  return (
    <div>
      {/* Choix du persona à gérer */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {personas.map((p) => (
          <button key={p.id} className={`trc-chip ${sel === p.id ? 'is-active' : ''}`} onClick={() => setSel(p.id)}>
            {p.name} <span className="count">{countOf(p.id)}</span>
          </button>
        ))}
        {orphanCount > 0 && (
          <button className={`trc-chip ${sel === '__none__' ? 'is-active' : ''}`} onClick={() => setSel('__none__')}>
            À classer <span className="count">{orphanCount}</span>
          </button>
        )}
      </div>

      {/* Recherche dans le persona courant */}
      <div className="trc-toolbar" style={{ marginBottom: 14 }}>
        <div className="trc-searchwrap">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Rechercher dans « ${selName} »…`} aria-label="Rechercher une cliente" />
        </div>
      </div>

      <div className="trc-sheet trc-sheet--fluid">
        <div className="trc-sheet__group">{selName} · {inPersona.length} cliente{inPersona.length > 1 ? 's' : ''}</div>
        {shown.length === 0 && (
          <div className="trc-empty">{q ? `Aucune cliente ne répond à « ${q.trim()} ».` : 'Aucune cliente sur ce persona.'}</div>
        )}
        {shown.map((c) => (
          <div key={c.id} className="trc-sheet__row tr-cols" style={{ '--cols': '1fr 220px', gap: 12 } as CSSProperties}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <Avatar client={c} size={34} />
              <span style={{ minWidth: 0 }}>
                <span className="trc-name" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                <span className="trc-sub">{c.city || '—'}</span>
              </span>
            </span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, justifySelf: 'end', width: '100%' }}>
              <span className="trc-sub" style={{ flex: 'none' }}>Persona</span>
              <Select value={known.has(c.persona) ? c.persona : ''} onChange={(e) => reassign(c.id, e.target.value)} style={{ flex: 1, minWidth: 0, fontSize: 12 }}>
                {!known.has(c.persona) && <option value="" disabled>À classer</option>}
                {personas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}
