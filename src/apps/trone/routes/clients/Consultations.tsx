import { useEffect, useMemo, useState } from 'react';
import { PageHead } from '../_ui';
import { Button, Field, Input } from '../../../../ds/components';
import { createStore, uid, useStore } from '../../../../shared/store';
import { bindCollection, bindDocument } from '../../../../shared/sync';
import { consultationsQueueStore, type OnlineConsultation } from '../../../../shared/bridges';
import { fmtMoney } from '../../../../shared/currency';
import { clientsStore, usePersonas, type Client } from '../../../../shared/clients';
import { useBranch } from '../../../../shared/branches';
import { asset } from '../../../../shared/asset';
import {
  Avatar, ClientPicker, Drawer, RdvModal, StatusPill, apptLabel, apptTotalXof, frDay, frLong, relDays,
  todayISO, useBranchAppointments, useBranchClients, useServicesById,
} from './_shared';
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

/* ---------- Note de la maison : texte libre + blocs de consultation ---------- */
type ConsultQA = { q: string; a: string };
type ConsultBlock = { name: string; date: string; qa: ConsultQA[] };
const CONSULT_HEADER = /^── Consultation · (.+) ──$/;

/** Sépare la note en (texte libre) + (blocs consultation) + (texte brut des blocs, pour ré-enregistrer). */
function splitNotes(raw: string | undefined): { free: string; consultRaw: string; blocks: ConsultBlock[] } {
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

/** Rendu des consultations en cartes distinctes (en-tête cuivre serif + Q/R). */
function ConsultCards({ blocks }: { blocks: ConsultBlock[] }) {
  if (blocks.length === 0) return null;
  return (
    <div className="trc-consults">
      {blocks.map((b, i) => (
        <div className="trc-consult-card" key={i}>
          <div className="trc-consult-card__head">
            <span className="trc-consult-card__name">{b.name}</span>
            {b.date && <span className="trc-consult-card__date">{b.date}</span>}
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
  const { currency } = useBranch();
  const [queue] = useStore(consultationsQueueStore);
  const [bookOpen, setBookOpen] = useState(false);

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

        {/* La couronne — si renseignée */}
        {(client.crownStyle || client.lockCount != null) && (
          <div>
            <span className="trc-microlabel">La couronne</span>
            <div className="trc-crown">
              <div className="trc-crown__style">{client.crownStyle ?? 'Style à définir'}</div>
              <div className="trc-crown__meta">{client.lockCount != null ? `${client.lockCount} locks` : 'Locks à compter'}</div>
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
            <div className="trc-empty" style={{ marginTop: 4 }}>Aucun passage enregistré — le carnet de {client.name.split(' ')[0]} est encore vierge.</div>
          )}
          {history.length > 0 && (
            <div className="trc-timeline" style={{ flexDirection: 'column', gap: 0 }}>
              {history.map((a, i) => (
                <div key={a.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div className="trc-timeline__rail">
                    <span className="trc-timeline__dot" style={{ background: a.status === 'honoré' ? 'var(--color-copper)' : 'var(--indigo-200)' }} />
                    {i < history.length - 1 && <span className="trc-timeline__line" />}
                  </div>
                  <div style={{ paddingBottom: 14, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12.5, color: 'var(--ink)' }}>{frDay(a.date)} · {a.time}</span>
                      <StatusPill status={a.status} />
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 3 }}>{apptLabel(a, byId)} · {a.master}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Consultations — chaque bloc rendu en carte distincte */}
        {parsedNotes.blocks.length > 0 && (
          <div>
            <span className="trc-microlabel">Consultations · {parsedNotes.blocks.length}</span>
            <ConsultCards blocks={parsedNotes.blocks} />
          </div>
        )}

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
    </Drawer>
  );
}

/* ---------- Section · Formulaires personnalisables ---------- */
function FormsSection() {
  const [forms] = useStore(consultFormsStore);
  const [openId, setOpenId] = useState<string | null>(null);
  const [fillId, setFillId] = useState<string | null>(null);

  const active = forms.filter((f) => !f.archived);
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
        <div style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>Cinq formulaires prêts à l’emploi — ouvrez pour voir et personnaliser les questions, ou remplissez-en un pour une cliente.</div>
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
      {archivedCount > 0 && <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 14 }}>{archivedCount} formulaire(s) archivé(s).</div>}
    </div>
  );
}

/* ---------- Panneau · Remplir un formulaire pour une cliente ---------- */
function FillPanel({ form, onClose }: { form: ConsultForm; onClose: () => void }) {
  const clients = useBranchClients();
  const [clientId, setClientId] = useState('');
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

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
    setSaved(`Consultation enregistrée au dossier de ${client.name}.`);
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
          <Button variant="copper" onClick={onClose}>Fermer</Button>
        </div>
      ) : clients.length === 0 ? (
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="trc-empty">Aucune cliente sur cette branche — ajoutez d’abord une tête couronnée dans la fiche Clientes pour enregistrer une consultation.</div>
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

/* ---------- Section · Consultations en ligne ---------- */
function OnlineSection() {
  const [queue] = useStore(consultationsQueueStore);

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>
          Les diagnostics reçus depuis La Consultation Souveraine — confirmez la séance, traitez, puis clôturez.
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
