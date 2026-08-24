import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHead } from '../_ui';
import { Button, Field, Input, Modal, Select } from '../../../../ds/components';
import { createStore, uid, useStore } from '../../../../shared/store';
import { bindCollection, bindDocument } from '../../../../shared/sync';
import { consultationsQueueStore, type OnlineConsultation } from '../../../../shared/bridges';
import { fmtMoney } from '../../../../shared/currency';
import { signeLeMessage } from '../../../../shared/identite';
import { clientsStore, usePersonas, type Client } from '../../../../shared/clients';
import { type Appointment } from '../../../../shared/agenda';
import { useInvoices, invoiceTotal, type Invoice } from '../../../../shared/finance';
import { useModelBands, calibreDe } from '../../../../shared/pricing';
import { useBranch } from '../../../../shared/branches';
import { asset } from '../../../../shared/asset';
import { summaryPdf } from '../../../../shared/pdf';
import {
  Avatar, ClientPicker, Drawer, RdvModal, StatusPill, apptLabel, apptTotalXof, frDay, frLong, relDays,
  todayISO, useBranchAppointments, useBranchClients, useServicesById,
} from './_shared';
import './clients.css';
import { splitNotes, serializeNotes, ConsultCards, EditConsultModal, type ConsultBlock } from './consultNotes';

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

/* Stores du module Consultations — synchronisés Supabase (formulaires + archives). */
const consultFormsStore = createStore<ConsultForm[]>('mnd_consult_forms', FORMS_SEED);
const dossierArchiveStore = createStore<string[]>('mnd_consult_dossier_arch', []);
bindCollection(consultFormsStore, 'consult_forms');
bindDocument(dossierArchiveStore, 'mnd_consult_dossier_arch');

type Tab = 'dossiers' | 'formulaires' | 'enligne';
const TABS: { k: Tab; label: string }[] = [
  { k: 'dossiers', label: 'Dossiers clients' },
  { k: 'formulaires', label: 'Formulaires' },
  { k: 'enligne', label: 'Consultations en ligne' },
];

export default function Consultations() {
  const [tab, setTab] = useState<Tab>('dossiers');
  const [forms] = useStore(consultFormsStore);
  const [chooser, setChooser] = useState(false);
  const [quickFillId, setQuickFillId] = useState<string | null>(null);

  const activeForms = forms.filter((f) => !f.archived);
  const quickForm = activeForms.find((f) => f.id === quickFillId) ?? null;

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="Consultations · Diagnostic & rituel"
        title="La consultation."
        actions={<Button variant="indigo" onClick={() => setChooser(true)}>+ Nouvelle consultation</Button>}
      />

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

      {/* Nouvelle consultation — sélecteur de tous les types chargés */}
      {chooser && (
        <Modal title="Nouvelle consultation." onClose={() => setChooser(false)} width={620}>
          <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: -4, marginBottom: 16 }}>
            Choisissez le type de consultation à mener pour une cliente. Toutes vos consultations
            sont ici, vous pourrez la remplir puis l’enregistrer au dossier.
          </p>
          {activeForms.length === 0 ? (
            <div className="trc-empty">Aucune consultation disponible, créez un formulaire dans l’onglet « Formulaires ».</div>
          ) : (
            <div className="tr-grid tr-grid--2">
              {activeForms.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className="trc-consult-pick"
                  onClick={() => { setQuickFillId(f.id); setChooser(false); }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <span className="trc-microlabel" style={{ margin: 0 }}>{f.eyebrow}</span>
                    <span className="trc-pill">{f.questions.length} questions</span>
                  </div>
                  <div style={{ fontFamily: 'var(--font-serif)', fontSize: 19, color: 'var(--color-indigo)', marginTop: 8, lineHeight: 1.15 }}>{f.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 6 }}>{f.desc}</div>
                  <span className="trc-consult-pick__cta">Remplir pour une cliente →</span>
                </button>
              ))}
            </div>
          )}
          <div className="trc-consult-pick__foot">
            <span style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>Diagnostic en autonomie par la cliente ?</span>
            <a
              href={asset('/consultation.html')}
              target="_blank"
              rel="noreferrer"
              className="mnd-btn mnd-btn--ghost mnd-btn--sm"
              style={{ textDecoration: 'none' }}
              onClick={() => setChooser(false)}
            >
              Ouvrir La Consultation Souveraine →
            </a>
          </div>
        </Modal>
      )}

      {quickForm && <FillPanel form={quickForm} onClose={() => setQuickFillId(null)} />}
    </div>
  );
}

/* ---------- Section · Dossiers clients ---------- */
function DossiersSection() {
  const clients = useBranchClients();
  const appts = useBranchAppointments();
  const byId = useServicesById();
  const [personas] = usePersonas();
  const [archived] = useStore(dossierArchiveStore);
  const [openId, setOpenId] = useState<string | null>(null);

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

  const archive = (id: string) => dossierArchiveStore.set((prev) => (prev.includes(id) ? prev : [...prev, id]));
  const restore = (id: string) => dossierArchiveStore.set((prev) => prev.filter((x) => x !== id));

  const openClient = clients.find((c) => c.id === openId) ?? null;

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {active.length === 0 && <div className="trc-empty">Aucun dossier ouvert sur cette branche.</div>}
        {active.map((d) => (
          <div key={d.client.id} className="trc-dossier-row" role="button" tabIndex={0} onClick={() => setOpenId(d.client.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenId(d.client.id); } }} style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderRadius: 4, padding: '14px 18px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px 16px', cursor: 'pointer' }}>
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
              <button className="trc-iconbtn trc-iconbtn--danger" style={{ width: 'auto', height: 28, padding: '0 12px', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase' }} onClick={(e) => { e.stopPropagation(); archive(d.client.id); }}>
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
                <span role="button" tabIndex={0} onClick={() => setOpenId(d.client.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenId(d.client.id); } }} style={{ fontFamily: 'var(--font-serif)', fontSize: 15, color: 'var(--ink)', flex: 1, cursor: 'pointer' }}>{d.client.name}</span>
                <span style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>{d.type}</span>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--color-indigo)' }} onClick={() => restore(d.client.id)}>Restaurer</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {openClient && (
        <DossierPanel
          key={openClient.id}
          client={openClient}
          personaName={personaName(openClient.persona)}
          appts={appts.filter((a) => a.clientId === openClient.id)}
          byId={byId}
          archived={archived.includes(openClient.id)}
          onArchive={() => { archive(openClient.id); setOpenId(null); }}
          onRestore={() => restore(openClient.id)}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}

/* Parsing / sérialisation / rendu / édition des consultations : module partagé
   ./consultNotes (utilisé aussi par la fiche CRM 360). */

/* ---------- Panneau · Dossier client ---------- */
const digitsOnly = (s: string) => s.replace(/\D/g, '');

function DossierPanel({
  client, personaName, appts, byId, archived, onArchive, onRestore, onClose,
}: {
  client: Client;
  personaName: string;
  appts: ReturnType<typeof useBranchAppointments>;
  byId: ReturnType<typeof useServicesById>;
  archived: boolean;
  onArchive: () => void;
  onRestore: () => void;
  onClose: () => void;
}) {
  const { currency, branch } = useBranch();
  const navigate = useNavigate();
  /* Le calibre se déduit du comptage — le style à la main est retiré (13 août). */
  const [bandsModeles] = useModelBands();
  const [queue] = useStore(consultationsQueueStore);
  const [invoices] = useInvoices();
  const [bookOpen, setBookOpen] = useState(false);
  const [editAppt, setEditAppt] = useState<Appointment | null>(null);

  /* Ses factures & devis — chacun ouvrable depuis le dossier, comme dans la fiche CRM. */
  const documents = invoices
    .filter((i) => i.clientId === client.id)
    .sort((a, b) => b.date.localeCompare(a.date));
  const docStatusClass = (s: Invoice['status']) =>
    s === 'payée' || s === 'acceptée' ? 'trc-src' : 'trc-src trc-src--indigo';

  /* Résumé PDF d'une consultation déjà classée au dossier. */
  const summarizeBlock = (b: ConsultBlock) => {
    const safe = client.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'cliente';
    void summaryPdf({
      eyebrow: 'Consultation',
      title: b.name,
      houseName: branch.name,
      meta: [client.name, b.date].filter(Boolean),
      sections: [{ heading: 'Diagnostic / Réponses', rows: b.qa.flatMap((qa) => [
        { label: qa.q },
        { label: `   → ${qa.a || '—'}` },
      ]) }],
      footer: `${branch.name} · Le cheveu est une couronne. La Maison veille.`,
      filename: `Consultation-${safe}-${(b.date || todayISO()).replace(/[^\p{L}\p{N}]+/gu, '-')}.pdf`,
    });
  };

  /* Note de la maison — on n'édite que le texte libre, les consultations sont préservées. */
  const parsedNotes = splitNotes(client.notes);
  const [notes, setNotes] = useState(parsedNotes.free);

  const honored = appts.filter((a) => a.status === 'honoré');
  const spend = honored.reduce((s, a) => s + apptTotalXof(a, byId), 0);
  const lastVisit = [...honored].sort((a, b) => b.date.localeCompare(a.date))[0];
  const history = [...appts].sort((a, b) => b.date.localeCompare(a.date));

  const notesDirty = notes.trim() !== parsedNotes.free;
  const saveNotes = () => {
    const merged = [notes.trim(), parsedNotes.consultRaw].filter(Boolean).join('\n\n');
    clientsStore.set((prev) => prev.map((c) => (c.id === client.id ? { ...c, notes: merged || undefined } : c)));
  };

  /* Modifier / supprimer une consultation déjà enregistrée au dossier. */
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const editBlock = editIdx != null ? parsedNotes.blocks[editIdx] ?? null : null;
  const persistBlocks = (blocks: ConsultBlock[]) => {
    const merged = serializeNotes(notes, blocks);
    clientsStore.set((prev) => prev.map((c) => (c.id === client.id ? { ...c, notes: merged || undefined } : c)));
    setEditIdx(null);
  };
  const saveConsult = (updated: ConsultBlock) => {
    if (editIdx == null) return;
    persistBlocks(parsedNotes.blocks.map((b, i) => (i === editIdx ? updated : b)));
  };
  const deleteConsult = () => {
    if (editIdx == null) return;
    if (!window.confirm('Supprimer définitivement cette consultation du dossier ?')) return;
    persistBlocks(parsedNotes.blocks.filter((_, i) => i !== editIdx));
  };

  /* Consultation en ligne rapprochée par nom ou téléphone. */
  const cPhone = digitsOnly(client.phone);
  const online = queue.find((o) => {
    const sameName = o.client.name.trim().toLowerCase() === client.name.trim().toLowerCase();
    const oPhone = digitsOnly(o.client.phone);
    const samePhone = cPhone.length >= 6 && oPhone.length >= 6 && oPhone.endsWith(cPhone.slice(-8));
    return sameName || samePhone;
  });

  return (
    <Drawer onClose={onClose}>
      <div className="trc-drawer__cover">
        <button className="trc-drawer__close" onClick={onClose} aria-label="Fermer">✕</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Avatar client={client} size={64} />
          <div>
            <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 26, color: 'var(--color-ivoire)', lineHeight: 1 }}>{client.name}</div>
            <div style={{ fontSize: 11.5, color: 'var(--indigo-100)', marginTop: 6 }}>{personaName} · {client.city}</div>
          </div>
        </div>
      </div>

      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Identité */}
        <div>
          <span className="trc-microlabel">Identité</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, color: 'var(--ink)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span style={{ color: 'var(--ink-soft)' }}>Téléphone</span><span>{client.phone || '—'}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span style={{ color: 'var(--ink-soft)' }}>E-mail</span><span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client.email || '—'}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span style={{ color: 'var(--ink-soft)' }}>Ville</span><span>{client.city || '—'}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span style={{ color: 'var(--ink-soft)' }}>Persona</span><span>{personaName}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span style={{ color: 'var(--ink-soft)' }}>Cliente depuis</span><span>{client.since ? frLong(client.since) : '—'}</span></div>
          </div>
        </div>

        {/* Segments */}
        <div>
          <span className="trc-microlabel">Segments</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {client.segments.length === 0 && <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Aucun segment.</span>}
            {client.segments.map((s) => <span key={s} className="trc-src">{s}</span>)}
          </div>
        </div>

        {/* La couronne — le CALIBRE, déduit du comptage (le style à la main
            est retiré du système, 13 août). */}
        {client.lockCount != null && (
          <div>
            <span className="trc-microlabel">La couronne</span>
            <div className="trc-crown">
              <div className="trc-crown__style">{calibreDe(client.lockCount, bandsModeles) ?? 'Calibre à constater'}</div>
              <div className="trc-crown__meta">{client.lockCount} locks</div>
            </div>
          </div>
        )}

        {/* Ministats */}
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="trc-ministat"><b>{fmtMoney(spend, currency)}</b><span>Total dépensé</span></div>
          <div className="trc-ministat"><b>{honored.length}</b><span>Séances honorées</span></div>
          <div className="trc-ministat"><b>{lastVisit ? relDays(lastVisit.date) : '—'}</b><span>Dernière visite</span></div>
        </div>

        {/* Prendre rendez-vous */}
        <div className="trc-next">
          <div className="trc-next__eyebrow">Carnet</div>
          <div style={{ fontSize: 12, color: 'var(--indigo-100)', marginTop: 4 }}>Proposez le fauteuil à {client.name.split(' ')[0]}.</div>
          <Button variant="copper" size="sm" style={{ marginTop: 12 }} onClick={() => setBookOpen(true)}>+ Prendre rendez-vous</Button>
        </div>

        {/* Consultation en ligne rapprochée */}
        {online && (
          <div className="trc-dossier-online">
            <span className="trc-microlabel" style={{ margin: 0 }}>Consultation en ligne rapprochée</span>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--color-indigo)', marginTop: 4 }}>
              {online.parcours === 'sos' ? 'SOS Locks' : 'Création'} · {online.diagnostic?.palier ?? 'palier à lire'}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 3 }}>
              {fmtMoney(online.paidXof, online.client.currency)} crédités · statut {online.status}
              {online.reservation ? ` · ${online.reservation.mode} ${online.reservation.date} ${online.reservation.time}` : ''}
            </div>
          </div>
        )}

        {/* Historique du carnet */}
        <div>
          <span className="trc-microlabel">Historique du carnet</span>
          {history.length === 0 && (
            <div className="trc-empty" style={{ marginTop: 4 }}>Aucun passage enregistré, le carnet de {client.name.split(' ')[0]} est encore vierge.</div>
          )}
          {history.length > 0 && (
            <div className="trc-timeline" style={{ flexDirection: 'column', gap: 0 }}>
              {history.map((a, i) => (
                <div key={a.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div className="trc-timeline__rail">
                    <span className="trc-timeline__dot" style={{ background: a.status === 'honoré' ? 'var(--color-copper)' : 'var(--indigo-200)' }} />
                    {i < history.length - 1 && <span className="trc-timeline__line" />}
                  </div>
                  <button type="button" className="trc-timeline__open" onClick={() => setEditAppt(a)} title="Ouvrir ce rendez-vous">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12.5, color: 'var(--ink)' }}>{frDay(a.date)} · {a.time}</span>
                      <StatusPill status={a.status} />
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 3 }}>{apptLabel(a, byId)} · {a.master}</div>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Factures & devis — ouvrables sans quitter le dossier */}
        <div>
          <span className="trc-microlabel">Factures & devis · {documents.length}</span>
          {documents.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Aucun document pour cette cliente.</div>
          ) : (
            <div className="trc-orders">
              {documents.map((o) => (
                <button type="button" className="trc-order trc-order--btn" key={o.id} title={`Ouvrir ${o.kind === 'devis' ? 'le devis' : 'la facture'} ${o.number}`} onClick={() => navigate(`/factures?id=${o.id}`)}>
                  <span className="trc-order__id">
                    <span style={{ fontFamily: 'var(--font-serif)', fontSize: 14, color: 'var(--color-indigo)' }}>{o.number}</span>
                    <span className="trc-sub" style={{ marginLeft: 8 }}>{o.kind === 'devis' ? 'Devis' : 'Facture'} · {frDay(o.date)}</span>
                  </span>
                  <span className="trc-order__total">{fmtMoney(invoiceTotal(o), currency)}</span>
                  <span className={docStatusClass(o.status)}>{o.status}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Consultations — toujours visible ; chaque bloc a son bouton « Modifier » */}
        <div>
          <span className="trc-microlabel">Consultations · {parsedNotes.blocks.length}</span>
          {parsedNotes.blocks.length === 0 ? (
            <div className="trc-empty" style={{ marginTop: 4 }}>
              Aucune consultation enregistrée pour {client.name.split(' ')[0]}. Remplissez-en une via
              « + Nouvelle consultation », elle apparaîtra ici, avec « Modifier » et « Résumé (PDF) ».
            </div>
          ) : (
            <ConsultCards blocks={parsedNotes.blocks} onSummary={summarizeBlock} onEdit={(i) => setEditIdx(i)} />
          )}
        </div>

        {/* Notes éditables */}
        <div>
          <span className="trc-microlabel">Note de la maison</span>
          <textarea
            className="trc-dossier-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Une attention, une préférence, un détail du rituel…"
            rows={4}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <Button variant="indigo" size="sm" disabled={!notesDirty} onClick={saveNotes}>Enregistrer</Button>
          </div>
        </div>

        {/* Archivage du dossier */}
        <div className="trc-danger">
          <span className="trc-microlabel">{archived ? 'Dossier archivé' : 'Archiver le dossier'}</span>
          {archived ? (
            <Button variant="ghost" size="sm" onClick={onRestore}>Restaurer le dossier</Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={onArchive}>Archiver le dossier</Button>
          )}
          <p className="trc-danger__note">L’archivage retire le dossier des listes sans effacer la cliente ni son carnet.</p>
        </div>
      </div>

      {bookOpen && (
        <RdvModal onClose={() => setBookOpen(false)} initial={{ clientId: client.id }} title={`Rendez-vous · ${client.name.split(' ')[0]}.`} />
      )}

      {editAppt && <RdvModal onClose={() => setEditAppt(null)} appt={editAppt} />}

      {editBlock && (
        <EditConsultModal
          block={editBlock}
          onSave={saveConsult}
          onDelete={deleteConsult}
          onClose={() => setEditIdx(null)}
        />
      )}
    </Drawer>
  );
}

/* ---------- Section · Formulaires personnalisables ---------- */
function FormsSection() {
  const [forms] = useStore(consultFormsStore);
  const [openId, setOpenId] = useState<string | null>(null);
  const [fillId, setFillId] = useState<string | null>(null);

  const active = forms.filter((f) => !f.archived);
  const archives = forms.filter((f) => f.archived);
  const archivedCount = forms.filter((f) => f.archived).length;
  const open = forms.find((f) => f.id === openId && !f.archived) ?? null;
  const filling = forms.find((f) => f.id === fillId && !f.archived) ?? null;

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
      <>
      {filling && <FillPanel form={filling} onClose={() => setFillId(null)} />}
      <div className="trc-formcard" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ background: 'var(--color-indigo)', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div className="trc-microlabel" style={{ color: 'var(--copper-200)', margin: 0 }}>{open.eyebrow} · {open.questions.length} questions</div>
            <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 26, color: 'var(--color-ivoire)', marginTop: 5 }}>{open.name}</div>
            <div style={{ fontSize: 12.5, color: 'var(--indigo-100)', marginTop: 4 }}>{open.desc}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 'none' }}>
            <Button variant="copper" onClick={() => setFillId(open.id)}>Remplir pour une cliente</Button>
            <Button variant="ghost-invert" onClick={() => setOpenId(null)}>← Tous les formulaires</Button>
          </div>
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
      </>
    );
  }

  return (
    <div>
      {filling && <FillPanel form={filling} onClose={() => setFillId(null)} />}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 16 }}>
        <div style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>Cinq formulaires prêts à l’emploi, ouvrez pour voir et personnaliser les questions, ou remplissez-en un pour une cliente.</div>
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
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--hairline)' }}>
              <Button variant="copper" style={{ flex: '1 1 100%' }} onClick={() => setFillId(f.id)}>Remplir pour une cliente</Button>
              <Button variant="indigo" style={{ flex: 1 }} onClick={() => setOpenId(f.id)}>Ouvrir & personnaliser</Button>
              <button className="trc-iconbtn trc-iconbtn--danger" style={{ width: 'auto', padding: '0 14px', height: 'auto', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase' }} onClick={() => archive(f.id)}>Archiver</button>
            </div>
          </div>
        ))}
      </div>
      {/* ── LES ARCHIVÉS SE RETROUVENT — 19 août 2026 ─────────────────
          « Je parlais des formulaires des consultations — les retrouver et
          voir lesquels remettre dans l'ERP. » Un formulaire archivé
          disparaissait de PARTOUT : ni liste, ni retour — une seule ligne
          disait leur nombre, sans un nom. Une archive dont on ne peut rien
          ressortir n'est pas une archive, c'est une corbeille. Les voici,
          chacun avec son geste de retour. */}
      {archives.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div className="trc-microlabel" style={{ color: 'var(--ink-soft)' }}>Archivés · {archives.length}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {archives.map((f) => (
              <div key={f.id} style={{ background: 'var(--hover-veil)', border: '1px solid var(--hairline)', borderRadius: 4, padding: '11px 18px', display: 'flex', alignItems: 'center', gap: 14, opacity: 0.85 }}>
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 15, color: 'var(--ink)', flex: 1, minWidth: 0 }}>{f.name}</span>
                <span style={{ fontSize: 11.5, color: 'var(--ink-soft)', flex: 'none' }}>{f.eyebrow} · {f.questions.length} questions</span>
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: 'var(--copper-700)', letterSpacing: '.06em', textTransform: 'uppercase', flex: 'none' }}
                  onClick={() => mutate(f.id, (x) => ({ ...x, archived: false }))}
                >
                  Remettre dans l’ERP
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Panneau · Remplir un formulaire pour une cliente ---------- */
function FillPanel({ form, onClose }: { form: ConsultForm; onClose: () => void }) {
  const clients = useBranchClients();
  const { branch } = useBranch();
  const [clientId, setClientId] = useState('');
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [savedDate, setSavedDate] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);
  const [waNote, setWaNote] = useState<string | null>(null);

  const client = clients.find((c) => c.id === clientId) ?? null;
  const setAnswer = (i: number, v: string) => setAnswers((prev) => ({ ...prev, [i]: v }));

  const save = () => {
    if (!client) { setError('Choisissez une cliente pour enregistrer la consultation.'); return; }
    const date = todayISO();
    const lines = form.questions.map((q, i) => `${i + 1}. ${q.q || '(question)'}\n   → ${(answers[i] ?? '').trim() || '—'}`);
    const block = [`── Consultation · ${form.name} · ${frLong(date)} ──`, ...lines].join('\n');
    clientsStore.set((prev) =>
      prev.map((c) => {
        if (c.id !== client.id) return c;
        const merged = [(c.notes ?? '').trim(), block].filter(Boolean).join('\n\n');
        return { ...c, notes: merged };
      }),
    );
    setSavedDate(date);
    setSaved(`Consultation enregistrée au dossier de ${client.name}.`);
  };

  /* Construit (et télécharge) le résumé PDF prêt à envoyer à la cliente. */
  const buildPdf = async () => {
    if (!client) return '';
    const date = savedDate || todayISO();
    const rows = form.questions.flatMap((q, i) => [
      { label: `${i + 1}. ${q.q || 'Question'}` },
      { label: `   → ${(answers[i] ?? '').trim() || '—'}` },
    ]);
    const safe = client.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'cliente';
    return summaryPdf({
      eyebrow: 'Consultation',
      title: form.name,
      houseName: branch.name,
      meta: [client.name, frLong(date)],
      sections: [{ heading: 'Diagnostic / Réponses', rows }],
      footer: `${branch.name} · Le cheveu est une couronne. La Maison veille.`,
      filename: `Consultation-${safe}-${date}.pdf`,
    });
  };

  const downloadPdf = async () => {
    setPdfBusy(true);
    try { await buildPdf(); } finally { setPdfBusy(false); }
  };

  const sendWhatsApp = async () => {
    if (!client) return;
    setPdfBusy(true);
    try { await buildPdf(); } finally { setPdfBusy(false); }
    setWaNote('PDF téléchargé, joignez-le à votre message.');
    const first = client.name.split(' ')[0];
    const msg = [
      `Bonjour ${first},`,
      `Voici le résumé de votre consultation « ${form.name} » du ${frLong(savedDate || todayISO())}.`,
      `Résumé en pièce jointe.`,
      /* « La Maison MND veille sur votre couronne » est tombée le 22 août :
         le nom y était codé en dur — deux Maisons se seraient contredites le
         jour d'un changement d'enseigne — et la devise dit la même chose en
         mieux, une fois pour toutes. */
    ].join('\n');
    const phone = digitsOnly(client.phone);
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(signeLeMessage(msg))}`, '_blank', 'noopener');
  };

  return (
    <Drawer onClose={onClose}>
      <div className="trc-drawer__cover">
        <button className="trc-drawer__close" onClick={onClose} aria-label="Fermer">✕</button>
        <div className="trc-microlabel" style={{ color: 'var(--copper-200)', margin: 0 }}>{form.eyebrow} · Remplir pour une cliente</div>
        <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 24, color: 'var(--color-ivoire)', marginTop: 6, lineHeight: 1.1 }}>{form.name}</div>
      </div>

      {saved ? (
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="trc-fill-done">{saved}</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>Le récapitulatif a été ajouté à la note de la maison du dossier de {client?.name}.</div>

          <div className="trc-summary-send">
            <span className="trc-microlabel" style={{ margin: 0 }}>Résumé pour la cliente</span>
            <p className="trc-summary-send__lead">Un résumé soigné, prêt à remettre ou à envoyer à {client?.name.split(' ')[0]}.</p>
            <div className="trc-summary-send__row">
              <Button variant="indigo" style={{ flex: 1 }} disabled={pdfBusy} onClick={downloadPdf}>
                {pdfBusy ? 'Préparation…' : 'Télécharger le résumé (PDF)'}
              </Button>
              <Button variant="copper" style={{ flex: 1 }} disabled={pdfBusy} onClick={sendWhatsApp}>
                Envoyer à la cliente (WhatsApp)
              </Button>
            </div>
            {waNote && <p className="trc-summary-send__note">{waNote}</p>}
          </div>

          <Button variant="ghost" onClick={onClose}>Fermer</Button>
        </div>
      ) : clients.length === 0 ? (
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="trc-empty">Aucune cliente sur cette branche, ajoutez d’abord une tête couronnée dans la fiche Clientes pour enregistrer une consultation.</div>
          <Button variant="ghost" onClick={onClose}>Fermer</Button>
        </div>
      ) : (
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Field label="Cliente">
            <ClientPicker value={clientId} onChange={(id) => { setClientId(id); setError(null); }} placeholder="Rechercher une cliente (nom, téléphone)…" />
          </Field>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {form.questions.map((q, i) => (
              <div key={i}>
                <span className="trc-microlabel" style={{ marginBottom: 4 }}>{i + 1}. {q.q || 'Question'}</span>
                {q.t && <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginBottom: 6 }}>{q.t}</div>}
                <textarea
                  className="trc-dossier-notes trc-fill-answer"
                  value={answers[i] ?? ''}
                  onChange={(e) => setAnswer(i, e.target.value)}
                  placeholder="Réponse de la cliente…"
                  rows={2}
                />
              </div>
            ))}
          </div>

          {error && <div style={{ fontSize: 12, color: 'var(--copper-700)' }}>{error}</div>}

          <div style={{ display: 'flex', gap: 10 }}>
            <Button variant="copper" style={{ flex: 1 }} onClick={save}>Enregistrer au dossier</Button>
            <Button variant="ghost" onClick={onClose}>Annuler</Button>
          </div>
        </div>
      )}
    </Drawer>
  );
}

/* ---------- Modale · Modifier une consultation en ligne ---------- */
function EditOnlineModal({
  consult, onSave, onDelete, onClose,
}: {
  consult: OnlineConsultation;
  onSave: (updated: OnlineConsultation) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(consult.client.name);
  const [phone, setPhone] = useState(consult.client.phone);
  const [city, setCity] = useState(consult.client.city);
  const [parcours, setParcours] = useState<OnlineConsultation['parcours']>(consult.parcours);
  const [status, setStatus] = useState<OnlineConsultation['status']>(consult.status);
  const [palier, setPalier] = useState(consult.diagnostic?.palier ?? '');
  const [scores, setScores] = useState<[string, string][]>(
    Object.entries(consult.diagnostic?.scores ?? {}).map(([k, v]) => [k, String(v)]),
  );
  const [answers, setAnswers] = useState<[string, string][]>(
    Object.entries(consult.answers ?? {}).map(([k, v]) => [k, typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? '')]),
  );
  const [mode, setMode] = useState<'salon' | 'visio'>(consult.reservation?.mode ?? 'salon');
  const [date, setDate] = useState(consult.reservation?.date ?? '');
  const [time, setTime] = useState(consult.reservation?.time ?? '');
  const [paid, setPaid] = useState(String(consult.paidXof));

  const setPair = (
    setter: (fn: (prev: [string, string][]) => [string, string][]) => void,
    i: number, which: 'k' | 'v', val: string,
  ) => setter((prev) => prev.map((e, j): [string, string] => (j === i ? (which === 'k' ? [val, e[1]] : [e[0], val]) : e)));

  const save = () => {
    const scoreObj: Record<string, number> = {};
    for (const [k, v] of scores) if (k.trim()) scoreObj[k.trim()] = Math.round(Number(v) || 0);
    const ansObj: Record<string, unknown> = {};
    for (const [k, v] of answers) if (k.trim()) ansObj[k.trim()] = v;
    onSave({
      ...consult,
      client: { ...consult.client, name: name.trim() || consult.client.name, phone: phone.trim(), city: city.trim() },
      parcours,
      status,
      diagnostic: palier.trim() || Object.keys(scoreObj).length > 0 ? { palier: palier.trim(), scores: scoreObj } : undefined,
      answers: ansObj,
      reservation: date && time ? { mode, date, time } : undefined,
      paidXof: Math.max(0, Math.round(Number(paid) || 0)),
    });
  };

  return (
    <Modal title="Modifier la consultation en ligne." onClose={onClose} width={620}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Cliente */}
        <div>
          <span className="trc-microlabel">Cliente</span>
          <Field label="Nom"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom et prénom" /></Field>
          <div className="tr-grid tr-grid--2" style={{ marginTop: 10 }}>
            <Field label="Téléphone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="—" /></Field>
            <Field label="Ville"><Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="—" /></Field>
          </div>
        </div>

        {/* Parcours / statut / palier */}
        <div className="tr-grid tr-grid--2">
          <Field label="Parcours">
            <Select value={parcours} onChange={(e) => setParcours(e.target.value as OnlineConsultation['parcours'])}>
              <option value="creation">Création</option>
              <option value="sos">SOS Locks</option>
            </Select>
          </Field>
          <Field label="Statut">
            <Select value={status} onChange={(e) => setStatus(e.target.value as OnlineConsultation['status'])}>
              <option value="nouvelle">Nouvelle</option>
              <option value="traitée">Traitée</option>
              <option value="fermée">Fermée</option>
            </Select>
          </Field>
        </div>
        <Field label="Palier lu"><Input value={palier} onChange={(e) => setPalier(e.target.value)} placeholder="—" /></Field>

        {/* Diagnostic — scores */}
        <div>
          <span className="trc-microlabel">Diagnostic · scores</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {scores.map(([k, v], i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Input value={k} onChange={(e) => setPair(setScores, i, 'k', e.target.value)} placeholder="Critère" />
                <Input type="number" value={v} onChange={(e) => setPair(setScores, i, 'v', e.target.value)} placeholder="0" style={{ width: 90, flex: 'none' }} />
                <button type="button" className="trc-iconbtn trc-iconbtn--danger" style={{ flex: 'none' }} onClick={() => setScores((prev) => prev.filter((_, j) => j !== i))} title="Retirer">✕</button>
              </div>
            ))}
            <button type="button" className="trc-addline" onClick={() => setScores((prev) => [...prev, ['', '']])}>+ Ajouter un score</button>
          </div>
        </div>

        {/* Réponses de la cliente */}
        <div>
          <span className="trc-microlabel">Réponses de la cliente</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {answers.map(([k, v], i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                  <Input value={k} onChange={(e) => setPair(setAnswers, i, 'k', e.target.value)} placeholder="Question / clé" />
                  <textarea className="trc-dossier-notes trc-fill-answer" value={v} onChange={(e) => setPair(setAnswers, i, 'v', e.target.value)} placeholder="Réponse…" rows={2} />
                </div>
                <button type="button" className="trc-iconbtn trc-iconbtn--danger" style={{ flex: 'none', marginTop: 4 }} onClick={() => setAnswers((prev) => prev.filter((_, j) => j !== i))} title="Retirer">✕</button>
              </div>
            ))}
            <button type="button" className="trc-addline" onClick={() => setAnswers((prev) => [...prev, ['', '']])}>+ Ajouter une réponse</button>
          </div>
        </div>

        {/* Séance + montant */}
        <div>
          <span className="trc-microlabel">Séance souhaitée (vide = à convenir)</span>
          <div className="tr-cols" style={{ '--cols': '1fr 1fr 1fr', '--cols-md': '1fr 1fr 1fr', '--cols-sm': '1fr', gap: 10, marginTop: 4 } as CSSProperties}>
            <Select value={mode} onChange={(e) => setMode(e.target.value as 'salon' | 'visio')}>
              <option value="salon">Salon</option>
              <option value="visio">Visio</option>
            </Select>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>
        <Field label={`Montant crédité (${consult.client.currency})`}>
          <Input type="number" min={0} value={paid} onChange={(e) => setPaid(e.target.value)} />
        </Field>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 18, flexWrap: 'wrap' }}>
        <button type="button" className="trc-danger__btn" onClick={onDelete}>Supprimer cette consultation</button>
        <div style={{ display: 'flex', gap: 10, marginLeft: 'auto' }}>
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button variant="copper" onClick={save}>Enregistrer</Button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------- Section · Consultations en ligne ---------- */
function OnlineSection() {
  const [queue] = useStore(consultationsQueueStore);
  const [editId, setEditId] = useState<string | null>(null);
  const editConsult = queue.find((o) => o.id === editId) ?? null;

  const setStatus = (id: string, status: OnlineConsultation['status']) =>
    consultationsQueueStore.set((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
  const updateConsult = (updated: OnlineConsultation) =>
    consultationsQueueStore.set((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
  const removeConsult = (id: string) =>
    consultationsQueueStore.set((prev) => prev.filter((o) => o.id !== id));

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>
          Les diagnostics reçus depuis La Consultation Souveraine, confirmez la séance, traitez, puis clôturez.
        </div>
        <a
          href={asset('/consultation.html')}
          target="_blank"
          rel="noreferrer"
          className="mnd-btn mnd-btn--copper"
          style={{ flex: 'none', textDecoration: 'none' }}
        >
          Ouvrir La Consultation →
        </a>
      </div>

      {/* Carte live · dernier diagnostic reçu */}
      {live && (
        <div style={{ background: 'var(--color-indigo)', borderRadius: 6, padding: '20px 24px', color: 'var(--color-ivoire)', marginBottom: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 9.5, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--copper-200)' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-copper)', flex: 'none' }} />
              La Consultation Souveraine · arrivée en ligne
            </span>
            <span style={{ fontSize: 11, color: 'var(--indigo-100)' }}>{whenAgo(live.createdAt)}</span>
          </div>
          <div className="tr-cols" style={{ '--cols': '1.4fr 1fr 1fr auto', gap: 18, alignItems: 'center', marginTop: 16 } as CSSProperties}>
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
              <Button variant="ghost-invert" onClick={() => setEditId(live.id)}>Modifier</Button>
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
            <button className="trc-iconbtn" style={{ width: 'auto', height: 28, padding: '0 12px', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase' }} onClick={() => setEditId(o.id)}>
              Modifier
            </button>
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
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--color-indigo)' }} onClick={() => setEditId(o.id)}>Modifier</button>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--color-indigo)' }} onClick={() => setStatus(o.id, 'traitée')}>Rouvrir</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {editConsult && (
        <EditOnlineModal
          consult={editConsult}
          onSave={(u) => { updateConsult(u); setEditId(null); }}
          onDelete={() => {
            if (window.confirm('Supprimer définitivement cette consultation en ligne ?')) {
              removeConsult(editConsult.id);
              setEditId(null);
            }
          }}
          onClose={() => setEditId(null)}
        />
      )}
    </div>
  );
}
