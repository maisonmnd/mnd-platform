import { useEffect, useMemo, useState } from 'react';
import { PageHead } from '../_ui';
import { Button, Input } from '../../../../ds/components';
import { createStore, uid, useStore } from '../../../../shared/store';
import { consultationsQueueStore, type OnlineConsultation } from '../../../../shared/bridges';
import { fmtMoney } from '../../../../shared/currency';
import { usePersonas } from '../../../../shared/clients';
import { Avatar, relDays, useBranchAppointments, useBranchClients } from './_shared';
import './clients.css';

/* Consultations — trois temps : les dossiers clients (avec archivage), les cinq
   formulaires personnalisables (gestionnaire de questions) et les consultations
   reçues en ligne depuis La Consultation Souveraine (avec bouton de clôture). */

type FormQuestion = { q: string; t: string };
type ConsultForm = { id: string; name: string; eyebrow: string; desc: string; questions: FormQuestion[]; archived?: boolean };

const FORMS_SEED: ConsultForm[] = [
  { id: 'f1', name: 'Nouveau projet · démarrage de locks', eyebrow: 'Projet', desc: 'Cadrer la vision, la texture et le démarrage.', questions: [
    { q: 'Quel type de locks visez-vous ?', t: 'Choix · Microlocks / Sisterlocks / Traditionnelles / Freeform' },
    { q: 'Quelle est votre texture naturelle (4A–4C, autre) ?', t: 'Choix' },
    { q: 'Vos cheveux sont-ils vierges ou déjà traités ?', t: 'Choix · Vierges / Colorés / Défrisés / Autres' },
    { q: 'Longueur actuelle des cheveux ?', t: 'Texte court' },
    { q: 'Quelle longueur de départ de locks souhaitez-vous ?', t: 'Texte court' },
    { q: 'Avez-vous déjà eu des locks par le passé ?', t: 'Oui / Non + détail' },
    { q: 'À quelle fréquence pourrez-vous venir en entretien ?', t: 'Choix · 4 / 6 / 8 semaines' },
    { q: 'Quel est votre budget mensuel d’entretien ?', t: 'Montant' },
    { q: 'Y a-t-il une échéance (mariage, voyage) à respecter ?', t: 'Date + note' },
    { q: 'Qu’attendez-vous de la maison MND pour ce projet ?', t: 'Texte long' },
  ] },
  { id: 'f2', name: 'Plan de soin', eyebrow: 'Soin', desc: 'Établir le rituel d’entretien sur 3 mois.', questions: [
    { q: 'Le cuir chevelu est-il sec, gras ou mixte ?', t: 'Choix' },
    { q: 'Ressentez-vous des démangeaisons ou tiraillements ?', t: 'Échelle 1–5' },
    { q: 'Présence de pellicules ou résidus ?', t: 'Oui / Non + fréquence' },
    { q: 'À quelle fréquence lavez-vous vos locks ?', t: 'Choix · Hebdo / Bi-mensuel / Mensuel' },
    { q: 'Quels produits utilisez-vous actuellement ?', t: 'Texte long' },
    { q: 'Vos locks sont-elles hydratées ou cassantes ?', t: 'Échelle 1–5' },
    { q: 'Exposition (sport, piscine, foulard) régulière ?', t: 'Choix multiple' },
    { q: 'Allergies ou sensibilités connues ?', t: 'Texte court' },
    { q: 'Objectif principal du plan de soin ?', t: 'Choix · Hydratation / Croissance / Assainir' },
    { q: 'Acceptez-vous un rituel maison entre les séances ?', t: 'Oui / Non' },
  ] },
  { id: 'f3', name: 'Expertise', eyebrow: 'Diagnostic', desc: 'Évaluation technique complète de la chevelure.', questions: [
    { q: 'Densité capillaire observée ?', t: 'Échelle 1–5' },
    { q: 'Diamètre des locks (fin / moyen / épais) ?', t: 'Choix' },
    { q: 'Maturité des locks (jeune / en cours / mûr) ?', t: 'Choix' },
    { q: 'État des racines (saines / fragilisées) ?', t: 'Échelle 1–5' },
    { q: 'État des pointes (intactes / amincies / cassées) ?', t: 'Choix' },
    { q: 'Présence de nœuds, fusions ou locks doubles ?', t: 'Oui / Non + zones' },
    { q: 'Élasticité et résistance à la traction ?', t: 'Échelle 1–5' },
    { q: 'Uniformité de la taille des locks ?', t: 'Échelle 1–5' },
    { q: 'Signes d’amincissement ou de chute localisée ?', t: 'Texte + photo' },
    { q: 'Verdict d’expertise et niveau de priorité ?', t: 'Texte long' },
  ] },
  { id: 'f4', name: 'Restauration de locks abîmés', eyebrow: 'Réparation', desc: 'Plan de sauvetage des locks fragilisées.', questions: [
    { q: 'Quelles zones sont les plus abîmées ?', t: 'Choix · Racines / Corps / Pointes' },
    { q: 'Origine probable des dégâts ?', t: 'Choix · Tension / Chimie / Négligence / Casse' },
    { q: 'Depuis combien de temps le problème persiste-t-il ?', t: 'Texte court' },
    { q: 'Y a-t-il eu une coloration ou décoloration récente ?', t: 'Oui / Non + date' },
    { q: 'Les locks se cassent-elles à la manipulation ?', t: 'Échelle 1–5' },
    { q: 'Combien de locks sont concernées (estimation) ?', t: 'Nombre' },
    { q: 'Avez-vous déjà tenté une réparation ?', t: 'Oui / Non + résultat' },
    { q: 'Êtes-vous ouverte à une coupe partielle si nécessaire ?', t: 'Oui / Non' },
    { q: 'Quel délai pour la restauration complète ?', t: 'Choix · 1 / 3 / 6 mois' },
    { q: 'Niveau d’engagement pour le protocole maison ?', t: 'Échelle 1–5' },
  ] },
  { id: 'f5', name: 'Suivi des clientes régulières', eyebrow: 'Fidélité', desc: 'Point d’étape pour les têtes couronnées du Cercle.', questions: [
    { q: 'Satisfaction depuis la dernière séance ?', t: 'Échelle 1–5' },
    { q: 'Les locks ont-elles évolué comme prévu ?', t: 'Oui / Non + note' },
    { q: 'Nouveaux désagréments depuis la dernière visite ?', t: 'Texte court' },
    { q: 'Le rituel maison a-t-il été suivi ?', t: 'Choix · Toujours / Parfois / Jamais' },
    { q: 'Évolution de la longueur (cm gagnés) ?', t: 'Nombre' },
    { q: 'Souhaitez-vous faire évoluer le style ?', t: 'Oui / Non + idée' },
    { q: 'Régularité d’entretien respectée ?', t: 'Échelle 1–5' },
    { q: 'Intérêt pour un palier ou abonnement supérieur ?', t: 'Oui / Non' },
    { q: 'Produits maison à réapprovisionner ?', t: 'Choix multiple' },
    { q: 'Date idéale du prochain rendez-vous ?', t: 'Date' },
  ] },
];

/* Stores locaux (persistés) propres au module Consultations. */
const consultFormsStore = createStore<ConsultForm[]>('mnd_consult_forms', FORMS_SEED);
const dossierArchiveStore = createStore<string[]>('mnd_consult_dossier_arch', []);

/* Consultations en ligne de démonstration — reçues du parcours mondial payant. */
const ONLINE_SEED: OnlineConsultation[] = [
  { id: 'oc-carine', createdAt: new Date(Date.now() - 14 * 60000).toISOString(), parcours: 'creation',
    client: { name: 'Carine M.', phone: '+33 6 41 22 07 55', city: 'Paris', currency: 'EUR' },
    answers: {}, diagnostic: { palier: 'L’Affirmation', scores: { Hydratation: 62, Cuir: 74, Intégrité: 80, Densité: 58, Maturité: 45 } },
    reservation: { mode: 'salon', date: '2026-07-18', time: '10:00' }, paidXof: 15000, status: 'nouvelle' },
  { id: 'oc-delphine', createdAt: new Date(Date.now() - 62 * 60000).toISOString(), parcours: 'creation',
    client: { name: 'Délphine A.', phone: '+1 514 220 88 03', city: 'Montréal', currency: 'CAD' },
    answers: {}, diagnostic: { palier: 'L’Initiation', scores: { Hydratation: 70, Cuir: 66, Intégrité: 55, Densité: 72, Maturité: 30 } },
    reservation: { mode: 'visio', date: '2026-07-20', time: '15:30' }, paidXof: 15000, status: 'nouvelle' },
  { id: 'oc-sandra', createdAt: new Date(Date.now() - 26 * 3600000).toISOString(), parcours: 'sos',
    client: { name: 'Sandra K.', phone: '+229 01 22 45 90', city: 'Cotonou', currency: 'XOF' },
    answers: {}, diagnostic: { palier: 'Restauration', scores: { Hydratation: 40, Cuir: 52, Intégrité: 34, Densité: 60, Maturité: 68 } },
    reservation: { mode: 'salon', date: '2026-07-16', time: '09:30' }, paidXof: 15000, status: 'traitée' },
];

type Tab = 'dossiers' | 'formulaires' | 'enligne';
const TABS: { k: Tab; label: string }[] = [
  { k: 'dossiers', label: 'Dossiers clients' },
  { k: 'formulaires', label: 'Formulaires' },
  { k: 'enligne', label: 'Consultations en ligne' },
];

export default function Consultations() {
  const [tab, setTab] = useState<Tab>('dossiers');

  return (
    <div className="mnd-rise">
      <PageHead eyebrow="Consultations · Diagnostic & rituel" title="La consultation." />

      <div className="trc-tabs" style={{ marginBottom: 22 }}>
        {TABS.map((t) => (
          <button key={t.k} className={`trc-tab ${tab === t.k ? 'is-active' : ''}`} onClick={() => setTab(t.k)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'dossiers' && <DossiersSection />}
      {tab === 'formulaires' && <FormsSection />}
      {tab === 'enligne' && <OnlineSection />}
    </div>
  );
}

/* ---------- Section · Dossiers clients ---------- */
function DossiersSection() {
  const clients = useBranchClients();
  const appts = useBranchAppointments();
  const [personas] = usePersonas();
  const [archived] = useStore(dossierArchiveStore);

  const personaName = (id: string) => personas.find((p) => p.id === id)?.name ?? 'À classer';

  const rows = useMemo(
    () =>
      clients.map((c) => {
        const honored = appts.filter((a) => a.clientId === c.id && a.status === 'honoré');
        const last = honored.sort((a, b) => b.date.localeCompare(a.date))[0];
        return {
          client: c,
          type: personaName(c.persona),
          last: last ? relDays(last.date) : 'jamais venue',
          sessions: honored.length,
          tag: c.segments[0] ?? 'Cliente',
        };
      }),
    [clients, appts, personas],
  );

  const active = rows.filter((r) => !archived.includes(r.client.id));
  const archivedRows = rows.filter((r) => archived.includes(r.client.id));

  const archive = (id: string) => dossierArchiveStore.set((prev) => [...prev, id]);
  const restore = (id: string) => dossierArchiveStore.set((prev) => prev.filter((x) => x !== id));

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {active.length === 0 && <div className="trc-empty">Aucun dossier ouvert sur cette branche.</div>}
        {active.map((d) => (
          <div key={d.client.id} style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderRadius: 4, padding: '14px 18px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px 16px' }}>
            <Avatar client={d.client} size={42} />
            <div style={{ flex: '1 1 160px', minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--color-indigo)' }}>{d.client.name}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>{d.type} · {d.client.city}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="trc-microlabel" style={{ color: 'var(--ink-soft)', marginBottom: 2 }}>Dernière visite</div>
              <div style={{ fontSize: 12, color: 'var(--ink)' }}>{d.last}</div>
            </div>
            <div style={{ textAlign: 'center', minWidth: 54 }}>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 19, color: 'var(--color-indigo)' }}>{d.sessions}</div>
              <div className="trc-microlabel" style={{ color: 'var(--ink-soft)', margin: 0 }}>séances</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
              <span className="trc-src">{d.tag}</span>
              <button className="trc-iconbtn trc-iconbtn--danger" style={{ width: 'auto', height: 28, padding: '0 12px', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase' }} onClick={() => archive(d.client.id)}>
                Archiver
              </button>
            </div>
          </div>
        ))}
      </div>

      {archivedRows.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div className="trc-microlabel" style={{ color: 'var(--ink-soft)' }}>Archivés · {archivedRows.length}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {archivedRows.map((d) => (
              <div key={d.client.id} style={{ background: 'var(--hover-veil)', border: '1px solid var(--hairline)', borderRadius: 4, padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 14, opacity: 0.72 }}>
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 15, color: 'var(--ink)', flex: 1 }}>{d.client.name}</span>
                <span style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>{d.type}</span>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--color-indigo)' }} onClick={() => restore(d.client.id)}>Restaurer</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Section · Formulaires personnalisables ---------- */
function FormsSection() {
  const [forms] = useStore(consultFormsStore);
  const [openId, setOpenId] = useState<string | null>(null);

  const active = forms.filter((f) => !f.archived);
  const archivedCount = forms.filter((f) => f.archived).length;
  const open = forms.find((f) => f.id === openId && !f.archived) ?? null;

  const mutate = (id: string, fn: (f: ConsultForm) => ConsultForm) =>
    consultFormsStore.set((prev) => prev.map((f) => (f.id === id ? fn(f) : f)));

  const setQ = (id: string, i: number, field: keyof FormQuestion, value: string) =>
    mutate(id, (f) => ({ ...f, questions: f.questions.map((q, j) => (j === i ? { ...q, [field]: value } : q)) }));
  const moveQ = (id: string, i: number, dir: -1 | 1) =>
    mutate(id, (f) => {
      const qs = [...f.questions];
      const j = i + dir;
      if (j < 0 || j >= qs.length) return f;
      [qs[i], qs[j]] = [qs[j], qs[i]];
      return { ...f, questions: qs };
    });
  const delQ = (id: string, i: number) => mutate(id, (f) => ({ ...f, questions: f.questions.filter((_, j) => j !== i) }));
  const addQ = (id: string) => mutate(id, (f) => ({ ...f, questions: [...f.questions, { q: '', t: 'Texte court' }] }));
  const archive = (id: string) => { mutate(id, (f) => ({ ...f, archived: true })); if (openId === id) setOpenId(null); };
  const addForm = () => {
    const f: ConsultForm = { id: uid(), name: 'Nouveau formulaire', eyebrow: 'Personnalisé', desc: 'Décrivez l’objet de ce formulaire…', questions: [{ q: '', t: 'Texte court' }] };
    consultFormsStore.set((prev) => [...prev, f]);
    setOpenId(f.id);
  };

  if (open) {
    return (
      <div className="trc-formcard" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ background: 'var(--color-indigo)', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div className="trc-microlabel" style={{ color: 'var(--copper-200)', margin: 0 }}>{open.eyebrow} · {open.questions.length} questions</div>
            <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 26, color: 'var(--color-ivoire)', marginTop: 5 }}>{open.name}</div>
            <div style={{ fontSize: 12.5, color: 'var(--indigo-100)', marginTop: 4 }}>{open.desc}</div>
          </div>
          <Button variant="ghost-invert" onClick={() => setOpenId(null)}>← Tous les formulaires</Button>
        </div>
        <div style={{ padding: '4px 24px 20px' }}>
          {open.questions.map((q, i) => (
            <div className="trc-qrow" key={i}>
              <span className="trc-qno">{i + 1}</span>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7, minWidth: 0 }}>
                <Input value={q.q} onChange={(e) => setQ(open.id, i, 'q', e.target.value)} placeholder="Intitulé de la question" />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="trc-microlabel" style={{ color: 'var(--ink-soft)', margin: 0, flex: 'none' }}>Réponse</span>
                  <Input value={q.t} onChange={(e) => setQ(open.id, i, 't', e.target.value)} placeholder="Type de réponse (Choix, Échelle 1–5, Texte long…)" style={{ fontSize: 11.5, color: 'var(--ink-soft)' }} />
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 'none', paddingTop: 4 }}>
                <button className="trc-iconbtn" disabled={i === 0} onClick={() => moveQ(open.id, i, -1)} title="Monter">▲</button>
                <button className="trc-iconbtn" disabled={i === open.questions.length - 1} onClick={() => moveQ(open.id, i, 1)} title="Descendre">▼</button>
                <button className="trc-iconbtn trc-iconbtn--danger" onClick={() => delQ(open.id, i)} title="Supprimer">✕</button>
              </div>
            </div>
          ))}
          <button className="trc-addline" style={{ marginTop: 16 }} onClick={() => addQ(open.id)}>+ Ajouter une question</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 16 }}>
        <div style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>Cinq formulaires prêts à l’emploi — ouvrez pour voir et personnaliser les questions.</div>
        <Button variant="indigo" onClick={addForm}>+ Nouveau formulaire</Button>
      </div>
      <div className="tr-grid tr-grid--2">
        {active.map((f) => (
          <div className="trc-formcard" key={f.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div className="trc-microlabel" style={{ margin: 0 }}>{f.eyebrow}</div>
              <span className="trc-pill">{f.questions.length} questions</span>
            </div>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 21, color: 'var(--color-indigo)', marginTop: 8, lineHeight: 1.15 }}>{f.name}</div>
            <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 6, flex: 1 }}>{f.desc}</div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--hairline)' }}>
              <Button variant="indigo" style={{ flex: 1 }} onClick={() => setOpenId(f.id)}>Ouvrir & personnaliser</Button>
              <button className="trc-iconbtn trc-iconbtn--danger" style={{ width: 'auto', padding: '0 14px', height: 'auto', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase' }} onClick={() => archive(f.id)}>Archiver</button>
            </div>
          </div>
        ))}
      </div>
      {archivedCount > 0 && <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 14 }}>{archivedCount} formulaire(s) archivé(s).</div>}
    </div>
  );
}

/* ---------- Section · Consultations en ligne ---------- */
function OnlineSection() {
  const [queue] = useStore(consultationsQueueStore);

  // Amorce la queue de démonstration à la première ouverture (pont La Consultation → Trône).
  useEffect(() => {
    if (consultationsQueueStore.get().length === 0) consultationsQueueStore.set(ONLINE_SEED);
  }, []);

  const setStatus = (id: string, status: OnlineConsultation['status']) =>
    consultationsQueueStore.set((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));

  const open = queue.filter((o) => o.status !== 'fermée');
  const closed = queue.filter((o) => o.status === 'fermée');
  const live = open.find((o) => o.status === 'nouvelle');

  const whenAgo = (iso: string) => {
    const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (min < 60) return `reçue il y a ${min} min`;
    const h = Math.round(min / 60);
    return h < 24 ? `reçue il y a ${h} h` : 'reçue hier';
  };

  return (
    <div>
      <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginBottom: 16 }}>
        Les diagnostics reçus depuis La Consultation Souveraine — confirmez la séance, traitez, puis clôturez.
      </div>

      {/* Carte live · dernier diagnostic reçu */}
      {live && (
        <div style={{ background: 'var(--color-obsidian)', borderRadius: 6, padding: '20px 24px', color: 'var(--color-ivoire)', marginBottom: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 9.5, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--copper-200)' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-copper)', flex: 'none' }} />
              La Consultation Souveraine · arrivée en ligne
            </span>
            <span style={{ fontSize: 11, color: 'var(--indigo-100)' }}>{whenAgo(live.createdAt)}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr auto', gap: 18, alignItems: 'center', marginTop: 16 }}>
            <div>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 24, lineHeight: 1 }}>{live.client.name}</div>
              <div style={{ fontSize: 11.5, color: 'var(--indigo-100)', marginTop: 4 }}>{live.client.city} · {live.parcours === 'sos' ? 'SOS Locks' : 'Création'}</div>
            </div>
            <div>
              <div style={{ fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--copper-200)' }}>Palier lu</div>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 17, marginTop: 2 }}>{live.diagnostic?.palier ?? '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--copper-200)' }}>Séance souhaitée</div>
              <div style={{ fontSize: 12.5, marginTop: 3 }}>{live.reservation ? `${live.reservation.mode} · ${live.reservation.date} ${live.reservation.time}` : 'à convenir'}</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="copper" onClick={() => setStatus(live.id, 'traitée')}>Confirmer la séance →</Button>
              <Button variant="ghost-invert" onClick={() => setStatus(live.id, 'fermée')}>Fermer</Button>
            </div>
          </div>
          {live.diagnostic && (
            <div style={{ display: 'flex', gap: 18, marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(246,241,231,.14)' }}>
              {Object.entries(live.diagnostic.scores).map(([label, v]) => (
                <div className="trc-score" key={label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: 10, color: 'var(--indigo-100)' }}>{label}</span>
                    <span style={{ fontFamily: 'var(--font-serif)', fontSize: 14, color: 'var(--copper-200)' }}>{v}</span>
                  </div>
                  <div className="trc-score__bar"><div style={{ width: `${Math.min(100, v)}%` }} /></div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Liste des consultations ouvertes */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {open.length === 0 && <div className="trc-empty">Aucune consultation en ligne en attente.</div>}
        {open.map((o) => (
          <div key={o.id} style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderRadius: 4, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--color-indigo)' }}>{o.client.name}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{o.client.city} · {o.parcours === 'sos' ? 'SOS Locks' : 'Création'} · {fmtMoney(o.paidXof, o.client.currency)} crédités</div>
            </div>
            <span style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>{whenAgo(o.createdAt)}</span>
            <span className={`trc-pill ${o.status === 'nouvelle' ? 'trc-pill--new' : 'trc-pill--honore'}`}>{o.status}</span>
            <button className="trc-iconbtn trc-iconbtn--danger" style={{ width: 'auto', height: 28, padding: '0 12px', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase' }} onClick={() => setStatus(o.id, 'fermée')}>
              Fermer
            </button>
          </div>
        ))}
      </div>

      {closed.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div className="trc-microlabel" style={{ color: 'var(--ink-soft)' }}>Clôturées · {closed.length}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {closed.map((o) => (
              <div key={o.id} style={{ background: 'var(--hover-veil)', border: '1px solid var(--hairline)', borderRadius: 4, padding: '11px 18px', display: 'flex', alignItems: 'center', gap: 14, opacity: 0.72 }}>
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 15, color: 'var(--ink)', flex: 1 }}>{o.client.name}</span>
                <span style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>{o.client.city}</span>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--color-indigo)' }} onClick={() => setStatus(o.id, 'traitée')}>Rouvrir</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
