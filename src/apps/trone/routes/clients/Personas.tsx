import { useMemo, useState, type CSSProperties } from 'react';
import { PageHead } from '../_ui';
import { Button, Field, Input, Select, Textarea } from '../../../../ds/components';
import { personasStore, clientsStore, useClients, usePersonas, initiePersonaId, type Persona, type Client } from '../../../../shared/clients';
import { useServices } from '../../../../shared/catalog';
import { ENVIES, type EnvieKey } from '../../../../shared/quiz';
import {
  REGLES_DEFAUT, SIGNAL_NOMS, evaluePersona, nomArchetype, personaDe,
  personaReglesStore, suggereArchetypes, usePersonaRegles,
  type ArchetypeCle, type PropositionArchetype,
} from '../../../../shared/persona';
import { uid } from '../../../../shared/store';
import { Avatar, todayISO, useBranchAppointments, useBranchClients } from './_shared';
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
  const [tab, setTab] = useState<'archetypes' | 'clientele' | 'lecture'>('archetypes');

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
        <button className={`trc-tab ${tab === 'lecture' ? 'is-active' : ''}`} onClick={() => setTab('lecture')}>La lecture du carnet</button>
      </div>

      {tab === 'clientele' && <ClienteleTab personas={personas} clients={clients} />}
      {tab === 'lecture' && <LectureTab personas={personas} clients={clients} />}

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

/* ---------- Onglet · La lecture du carnet ----------
   LES RÈGLES SE RÈGLENT ICI, et leur effet se voit avant d'être subi. Chaque
   ligne pèse un signal ; le tableau de droite dit, sur les têtes réelles de la
   Maison, ce que le réglage courant donnerait — et combien de fiches
   changeraient. Un poids qu'on corrige d'un champ vaut mieux qu'un poids qu'il
   faut redéployer.

   Rien n'est écrit sur les fiches depuis cet écran : la lecture vivante
   (usePersonaVivant) s'en charge au prochain mouvement du carnet. On règle, on
   regarde, on laisse faire. */
function LectureTab({ personas, clients }: { personas: Persona[]; clients: Client[] }) {
  const [config] = usePersonaRegles();
  const appts = useBranchAppointments();
  const [services] = useServices();
  const [ouvert, setOuvert] = useState<ArchetypeCle | null>(null);

  const parId = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);
  const aujourdhui = todayISO();

  /* CE QUE LE RÉGLAGE COURANT DONNERAIT — calculé sur les vraies têtes, jamais
     écrit. Les fiches figées à la main sont comptées à part : elles ne bougent
     plus, et le dire évite de croire la lecture en panne. */
  const apercu = useMemo(() => {
    const parCliente = new Map<string, typeof appts>();
    for (const a of appts) {
      const l = parCliente.get(a.clientId);
      if (l) l.push(a); else parCliente.set(a.clientId, [a]);
    }
    const compte = new Map<ArchetypeCle, number>();
    let figees = 0;
    let sansVerdict = 0;
    let changeraient = 0;
    const exemples: { nom: string; cle: ArchetypeCle; raisons: string[] }[] = [];
    for (const c of clients) {
      if (c.personaFige) { figees += 1; continue; }
      const siens = parCliente.get(c.id);
      if (!siens?.length) { sansVerdict += 1; continue; }
      const v = evaluePersona(c, siens, parId, aujourdhui, config);
      if (!v.confiant) { sansVerdict += 1; continue; }
      compte.set(v.cle, (compte.get(v.cle) ?? 0) + 1);
      const cible = personaDe(personas, v.cle);
      if (cible && cible.id !== c.persona) {
        changeraient += 1;
        if (exemples.length < 8) exemples.push({ nom: c.name, cle: v.cle, raisons: v.raisons });
      }
    }
    return { compte, figees, sansVerdict, changeraient, exemples };
  }, [clients, appts, parId, config, personas, aujourdhui]);

  /* CE QUE LA MAISON N'A PAS ENCORE NOMMÉ — les groupes qui dorment dans les
     têtes sans verdict. Recalculé à l'écran, jamais écrit tant qu'on ne le
     décide pas. */
  const propositions = useMemo(() => {
    const parCliente = new Map<string, typeof appts>();
    for (const a of appts) {
      const l = parCliente.get(a.clientId);
      if (l) l.push(a); else parCliente.set(a.clientId, [a]);
    }
    return suggereArchetypes(clients, parCliente, parId, aujourdhui, config, personas);
  }, [clients, appts, parId, config, personas, aujourdhui]);

  /* Créer l'archétype découvert : le persona ET les règles qui le
     reconnaîtront. Un persona sans règle serait un nom que personne ne peut
     porter. Les fiches, elles, se rangeront d'elles-mêmes au prochain
     mouvement du carnet. */
  const creerDecouvert = (p: PropositionArchetype, nom: string) => {
    const cle = `decouvert-${uid()}`;
    personasStore.set((prev) => [...prev, {
      id: cle, name: nom.trim() || p.nom, essence: p.essence, builtin: false,
    }]);
    personaReglesStore.set((c) => ({
      ...c,
      regles: [
        ...c.regles,
        ...p.regles.map((r, i) => ({ ...r, id: `${cle}-${i}`, pour: cle })),
      ],
    }));
  };

  const majRegle = (id: string, champ: 'poids' | 'valeur' | 'plafond', v: number) =>
    personaReglesStore.set((c) => ({
      ...c,
      regles: c.regles.map((r) => (r.id === id ? { ...r, [champ]: v } : r)),
    }));
  const bascule = (id: string) =>
    personaReglesStore.set((c) => ({
      ...c,
      regles: c.regles.map((r) => (r.id === id ? { ...r, actif: !r.actif } : r)),
    }));
  const majSeuil = (champ: 'seuil' | 'marge', v: number) =>
    personaReglesStore.set((c) => ({ ...c, [champ]: Math.max(0, v) }));
  const retablir = () => {
    if (!window.confirm('Rétablir les règles de la Maison ? Vos réglages seront perdus.')) return;
    personaReglesStore.set(() => structuredClone(REGLES_DEFAUT));
  };

  const cles = [...new Set(config.regles.map((r) => r.pour))];

  return (
    <div className="tr-cols" style={{ '--cols': '1fr 320px', gap: 18, alignItems: 'start' } as CSSProperties}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', padding: '16px 18px' }}>
          <span className="trc-microlabel">Ce qu'il faut pour trancher</span>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <Field label="Points nécessaires">
              <Input type="number" min={1} value={config.seuil}
                onChange={(e) => majSeuil('seuil', Math.round(Number(e.target.value) || 0))}
                style={{ width: 90, textAlign: 'right' }} />
            </Field>
            <Field label="Avance sur le suivant">
              <Input type="number" min={0} value={config.marge}
                onChange={(e) => majSeuil('marge', Math.round(Number(e.target.value) || 0))}
                style={{ width: 90, textAlign: 'right' }} />
            </Field>
            <Button variant="ghost" size="sm" onClick={retablir}>Rétablir les règles de la Maison</Button>
          </div>
          <div className="trc-sub" style={{ marginTop: 8, lineHeight: 1.5 }}>
            Un archétype ne se gagne qu'au-dessus du seuil, ET en distançant le suivant.
            Sous ces deux conditions, la Maison ne tranche pas : la fiche ne bouge pas.
            Monter ces nombres rend la lecture prudente, les baisser la rend bavarde.
          </div>
        </div>

        {cles.map((cle) => {
          const regles = config.regles.filter((r) => r.pour === cle);
          const actives = regles.filter((r) => r.actif).length;
          const open = ouvert === cle;
          return (
            <div key={cle} style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', padding: '14px 18px' }}>
              <button
                type="button"
                onClick={() => setOuvert(open ? null : cle)}
                style={{ display: 'flex', width: '100%', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}
              >
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 19, color: 'var(--color-indigo)' }}>
                  {nomArchetype(cle, personas)}
                </span>
                <span className="trc-sub">
                  {apercu.compte.get(cle) ?? 0} tête(s) · {actives}/{regles.length} indice(s) · {open ? '▲' : '▼'}
                </span>
              </button>

              {open && (
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {regles.map((r) => (
                    <div key={r.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', opacity: r.actif ? 1 : 0.45, borderTop: '1px solid var(--hairline)', paddingTop: 10 }}>
                      <button
                        type="button"
                        className={`trc-switch ${r.actif ? 'is-on' : ''}`}
                        onClick={() => bascule(r.id)}
                        aria-label={`Indice ${r.dit}`}
                        style={{ flex: 'none' }}
                      />
                      <span style={{ flex: '1 1 200px', minWidth: 0, fontSize: 12.5 }}>
                        {r.dit.replace('{n}', '…')}
                        <span className="trc-sub" style={{ display: 'block' }}>
                          {SIGNAL_NOMS[r.signal]}
                          {r.mode === 'seuil' ? (r.sous ? ' · au plus' : ' · au moins') : ' · par unité'}
                          {r.et ? ` · et ${SIGNAL_NOMS[r.et.signal]} ${r.et.sous ? '≤' : '≥'} ${r.et.valeur}` : ''}
                        </span>
                      </span>
                      {r.mode === 'seuil' && (
                        <label style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span className="trc-sub">{r.sous ? '≤' : '≥'}</span>
                          <Input type="number" value={r.valeur ?? 1} step={r.signal === 'regularite' || r.signal.startsWith('part') ? 0.1 : 1}
                            onChange={(e) => majRegle(r.id, 'valeur', Number(e.target.value) || 0)}
                            style={{ width: 78, textAlign: 'right', fontSize: 12 }} />
                        </label>
                      )}
                      <label style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span className="trc-sub">points</span>
                        <Input type="number" min={0} value={r.poids}
                          onChange={(e) => majRegle(r.id, 'poids', Math.max(0, Number(e.target.value) || 0))}
                          style={{ width: 66, textAlign: 'right', fontSize: 12 }} />
                      </label>
                      {r.mode === 'parUnite' && (
                        <label style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span className="trc-sub">max</span>
                          <Input type="number" min={0} value={r.plafond ?? 0}
                            onChange={(e) => majRegle(r.id, 'plafond', Math.max(0, Number(e.target.value) || 0))}
                            style={{ width: 66, textAlign: 'right', fontSize: 12 }} />
                        </label>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* CE QUE LA MAISON N'A PAS ENCORE NOMMÉ. Ces groupes existent déjà dans
            le carnet — on ne les invente pas, on leur donne un nom. */}
        <div style={{ background: 'var(--color-sable)', border: '1px solid var(--copper-300)', borderRadius: 'var(--radius-md)', padding: '16px 18px' }}>
          <span className="trc-microlabel" style={{ color: 'var(--copper-700)' }}>
            Des archétypes que la maison n’a pas encore nommés
          </span>
          {propositions.length === 0 ? (
            <div className="trc-sub" style={{ lineHeight: 1.5 }}>
              Aucun groupe assez nombreux et assez typé parmi les têtes sans verdict. C’est bon
              signe : soit vos archétypes couvrent la maison, soit il manque encore des
              observations sur les fiches pour que des profils se dessinent.
            </div>
          ) : (
            <>
              <div className="trc-sub" style={{ lineHeight: 1.5, marginBottom: 10 }}>
                Parmi les {apercu.sansVerdict} têtes que la pesée ne tranche pas, ces groupes
                partagent un profil qu’aucun de vos archétypes ne décrit. Le nom n’est qu’une
                suggestion — corrigez-le avant de créer.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {propositions.map((p) => (
                  <PropositionCarte key={p.id} p={p} onCreer={creerDecouvert} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* L'effet du réglage, sur les têtes réelles — avant toute écriture. */}
      <div style={{ position: 'sticky', top: 12, background: 'var(--color-indigo)', color: 'var(--color-ivoire)', borderRadius: 'var(--radius-md)', padding: '18px 20px' }}>
        <div className="trc-microlabel" style={{ color: 'var(--copper-200)', margin: 0 }}>Ce que ce réglage donnerait</div>
        <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 34, lineHeight: 1, marginTop: 10 }}>
          {apercu.changeraient}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--indigo-100)' }}>
          fiche(s) changeraient d'archétype
        </div>

        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {[...apercu.compte.entries()].sort((a, b) => b[1] - a[1]).map(([cle, n]) => (
            <div key={cle} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
              <span>{nomArchetype(cle, personas)}</span>
              <span style={{ color: 'var(--copper-200)' }}>{n}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, borderTop: '1px solid rgba(246,241,231,.2)', paddingTop: 5, marginTop: 3 }}>
            <span>Sans verdict — laissées en place</span>
            <span style={{ color: 'var(--indigo-100)' }}>{apercu.sansVerdict}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
            <span>Figées à la main</span>
            <span style={{ color: 'var(--indigo-100)' }}>{apercu.figees}</span>
          </div>
        </div>

        {apercu.exemples.length > 0 && (
          <div style={{ marginTop: 16, borderTop: '1px solid rgba(246,241,231,.2)', paddingTop: 12 }}>
            <div className="trc-microlabel" style={{ color: 'var(--copper-200)', margin: '0 0 6px' }}>Qui bougerait</div>
            {apercu.exemples.map((e) => (
              <div key={e.nom} style={{ fontSize: 11.5, marginBottom: 6, lineHeight: 1.45 }}>
                {e.nom} → <span style={{ color: 'var(--copper-200)' }}>{nomArchetype(e.cle, personas)}</span>
                <span style={{ display: 'block', color: 'var(--indigo-100)' }}>{e.raisons.join(' · ')}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ fontSize: 10.5, color: 'var(--indigo-100)', marginTop: 14, lineHeight: 1.5 }}>
          Rien n'est écrit depuis cet écran. La lecture s'applique d'elle-même au prochain
          mouvement du carnet, et jamais sur une fiche figée à la main.
        </div>
      </div>
    </div>
  );
}

/* Une proposition d'archétype — le nom se corrige AVANT d'exister. La machine
   décrit un groupe qu'elle a trouvé ; la Maison le baptise. */
function PropositionCarte({ p, onCreer }: { p: PropositionArchetype; onCreer: (p: PropositionArchetype, nom: string) => void }) {
  const [nom, setNom] = useState(p.nom);
  const [fait, setFait] = useState(false);
  const [voirQui, setVoirQui] = useState(false);

  if (fait) {
    return (
      <div style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderRadius: 3, padding: '12px 14px' }}>
        <span className="trc-sub">
          « {nom} » est créé, avec les règles qui le reconnaissent. Ses têtes s’y rangeront au
          prochain mouvement du carnet — vous pouvez ajuster ses indices ci-dessus.
        </span>
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderRadius: 3, padding: '14px 16px' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <Input
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          style={{ flex: '1 1 180px', minWidth: 0, fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--color-indigo)' }}
          aria-label="Nom de l’archétype proposé"
        />
        <span className="trc-sub" style={{ flex: 'none' }}>{p.membres.length} têtes</span>
        <Button size="sm" variant="copper" onClick={() => { onCreer(p, nom); setFait(true); }}>
          Créer cet archétype
        </Button>
      </div>
      <div className="trc-sub" style={{ marginTop: 8, lineHeight: 1.5 }}>
        Ce qu’elles ont en commun : {p.traits.join(' · ')}.
      </div>
      <button
        type="button"
        className="tre-link-btn"
        style={{ marginTop: 6 }}
        onClick={() => setVoirQui((v) => !v)}
      >
        {voirQui ? 'Masquer' : 'Voir qui'}
      </button>
      {voirQui && (
        <div className="trc-sub" style={{ marginTop: 6, lineHeight: 1.5 }}>
          {p.membres.slice(0, 20).map((m) => m.nom).join(' · ')}
          {p.membres.length > 20 ? ` … et ${p.membres.length - 20} autres` : ''}
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

  /* Ranger une tête à la main, c'est la FIGER : la lecture automatique du
     carnet (shared/persona.ts) ne la reclassera plus. Sans ce verrou, elle
     défaisait au mouvement suivant ce qu'on vient de décider ici. */
  const reassign = (clientId: string, personaId: string) =>
    clientsStore.set((prev) =>
      prev.map((c) => (c.id === clientId ? { ...c, persona: personaId, personaFige: true } : c)));

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
