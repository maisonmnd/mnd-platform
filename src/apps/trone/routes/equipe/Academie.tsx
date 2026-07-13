import { asset } from '../../../../shared/asset';
import { useMemo, useState } from 'react';
import { PageHead } from '../_ui';
import { Button, Card, Field, Input, Modal, Select } from '../../../../ds/components';
import { fmtMoney } from '../../../../shared/currency';
import { useBranch } from '../../../../shared/branches';
import { uid } from '../../../../shared/store';
import {
  QUATRE_TEMPS, REF_PALIERS, REF_LEXIQUE, FORMATION_NIVEAUX,
  useFormations, useApprenants, useCertifs, apprAvancement,
  type Formation, type Apprenant, type Certification,
} from './data';
import { Bar, Pill, Tabs } from './ui';
import './equipe.css';

/* Académie — Formations / Apprenants / Certifications / Référentiel « les quatre temps ».
   Inscription d'apprenants, suivi d'avancement, certificats scellés MND (le rendu du
   certificat lui-même vit dans l'app `certificat` — ici on le déclenche, on ne le rebâtit pas). */

type Tab = 'formations' | 'apprenants' | 'certifications' | 'referentiel';

const payTone = (p: Apprenant['pay']): 'ok' | 'warn' | 'error' => (p === 'À jour' ? 'ok' : p === 'Échéance' ? 'warn' : 'error');

type FormationForm = { name: string; niveau: string; sessions: string; demarrage: string; places: string; price: string; duree: string };
const emptyFormation: FormationForm = { name: '', niveau: FORMATION_NIVEAUX[0], sessions: '6', demarrage: 'sur dossier', places: '4 places', price: '', duree: '6' };

type ApprenantForm = { name: string; formationId: string; pay: Apprenant['pay'] };
type CertifForm = { name: string; parcours: string; date: string; statut: Certification['statut'] };

export default function Academie() {
  const { currency } = useBranch();
  const [tab, setTab] = useState<Tab>('formations');
  const [showArchived, setShowArchived] = useState(false);

  const [formations, setFormations] = useFormations();
  const [apprenants, setApprenants] = useApprenants();
  const [certifs, setCertifs] = useCertifs();

  const [foForm, setFoForm] = useState<FormationForm | null>(null);
  const [foEditId, setFoEditId] = useState<string | null>(null);

  const [apForm, setApForm] = useState<ApprenantForm | null>(null);
  const [apEditId, setApEditId] = useState<string | null>(null);
  const [apDetail, setApDetail] = useState<string | null>(null);

  const [ceForm, setCeForm] = useState<CertifForm | null>(null);
  const [ceEditId, setCeEditId] = useState<string | null>(null);

  const [note, setNote] = useState<string | null>(null);

  const activeFormations = formations.filter((f) => f.archived === showArchived);
  const formationName = (id: string) => formations.find((f) => f.id === id)?.name ?? '—';

  const stats = useMemo(() => ({
    formations: formations.filter((f) => !f.archived).length,
    apprenants: apprenants.length,
    certifs: certifs.filter((c) => c.statut === 'Délivrée').length,
  }), [formations, apprenants, certifs]);

  /* — formations — */
  const openFoNew = () => { setFoEditId(null); setFoForm(emptyFormation); };
  const openFoEdit = (f: Formation) => {
    setFoEditId(f.id);
    setFoForm({ name: f.name, niveau: f.niveau, sessions: String(f.sessions), demarrage: f.demarrage, places: f.places, price: String(f.priceXof), duree: String(f.dureeSemaines) });
  };
  const saveFo = () => {
    if (!foForm || !foForm.name.trim()) return;
    const sessions = parseInt(foForm.sessions, 10) || 1;
    const priceXof = parseInt(foForm.price.replace(/[^0-9]/g, ''), 10) || 0;
    const dureeSemaines = parseInt(foForm.duree, 10) || 1;
    if (foEditId) {
      setFormations((prev) => prev.map((f) => (f.id === foEditId ? { ...f, name: foForm.name.trim(), niveau: foForm.niveau, sessions, demarrage: foForm.demarrage.trim(), places: foForm.places.trim(), priceXof, dureeSemaines } : f)));
    } else {
      setFormations((prev) => [...prev, { id: `fo-${uid()}`, name: foForm.name.trim(), niveau: foForm.niveau, sessions, demarrage: foForm.demarrage.trim(), places: foForm.places.trim(), priceXof, dureeSemaines, archived: false }]);
    }
    setFoForm(null);
  };
  const toggleArchive = (f: Formation) => setFormations((prev) => prev.map((x) => (x.id === f.id ? { ...x, archived: !x.archived } : x)));
  const removeFo = (f: Formation) => {
    const enrolled = apprenants.filter((a) => a.formationId === f.id).length;
    const warn = enrolled > 0
      ? `\n\nAttention : ${enrolled} apprenant·e${enrolled > 1 ? 's' : ''} y ${enrolled > 1 ? 'sont inscrit·e·s' : 'est inscrit·e'}. Leur suivi restera sans formation rattachée.`
      : '';
    if (!window.confirm(`Supprimer la formation « ${f.name} » ?${warn}`)) return;
    setFormations((prev) => prev.filter((x) => x.id !== f.id));
  };

  /* — apprenants — */
  const openApNew = () => { setApEditId(null); setApForm({ name: '', formationId: formations.find((f) => !f.archived)?.id ?? formations[0]?.id ?? '', pay: 'À jour' }); };
  const openApEdit = (a: Apprenant) => { setApEditId(a.id); setApForm({ name: a.name, formationId: a.formationId, pay: a.pay }); };
  const saveAp = () => {
    if (!apForm || !apForm.name.trim()) return;
    if (apEditId) {
      setApprenants((prev) => prev.map((a) => (a.id === apEditId ? { ...a, name: apForm.name.trim(), formationId: apForm.formationId, pay: apForm.pay } : a)));
    } else {
      setApprenants((prev) => [...prev, { id: `ap-${uid()}`, name: apForm.name.trim(), formationId: apForm.formationId, pay: apForm.pay, modulesDone: [false, false, false, false] }]);
      setNote(`${apForm.name.trim()} inscrit·e sur « ${formationName(apForm.formationId)} ».`);
    }
    setApForm(null);
  };
  const removeAp = (id: string) => setApprenants((prev) => prev.filter((a) => a.id !== id));
  const toggleModule = (aid: string, idx: number) =>
    setApprenants((prev) => prev.map((a) => (a.id === aid ? { ...a, modulesDone: a.modulesDone.map((m, i) => (i === idx ? !m : m)) } : a)));

  /* — certifications — */
  const openCeNew = () => { setCeEditId(null); setCeForm({ name: '', parcours: formations[0]?.name ?? '', date: '', statut: 'En cours' }); };
  const openCeEdit = (c: Certification) => { setCeEditId(c.id); setCeForm({ name: c.name, parcours: c.parcours, date: c.date, statut: c.statut }); };
  const saveCe = () => {
    if (!ceForm || !ceForm.name.trim()) return;
    if (ceEditId) {
      setCertifs((prev) => prev.map((c) => (c.id === ceEditId ? { ...c, name: ceForm.name.trim(), parcours: ceForm.parcours, date: ceForm.date.trim() || '—', statut: ceForm.statut } : c)));
    } else {
      setCertifs((prev) => [...prev, { id: `ce-${uid()}`, name: ceForm.name.trim(), parcours: ceForm.parcours, date: ceForm.date.trim() || '—', statut: ceForm.statut }]);
    }
    setCeForm(null);
  };
  const removeCe = (id: string) => setCertifs((prev) => prev.filter((c) => c.id !== id));

  /** Sceller un certificat MND — le rendu A4 vit dans l'app Certificat. */
  const sealCertificate = (name: string, parcours: string) => {
    setCertifs((prev) => prev.some((c) => c.name === name && c.parcours === parcours)
      ? prev.map((c) => (c.name === name && c.parcours === parcours ? { ...c, statut: 'Délivrée', date: 'aujourd’hui' } : c))
      : [...prev, { id: `ce-${uid()}`, name, parcours, date: 'aujourd’hui', statut: 'Délivrée' }]);
    setNote(`Certificat scellé pour ${name} — ouvrez l’app Certificat pour l’imprimer / l’envoyer.`);
    setApDetail(null);
    setTab('certifications');
  };

  const detail = apDetail ? apprenants.find((a) => a.id === apDetail) : null;

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="Académie · Transmission"
        title="L’Académie."
        sub="Former, suivre, sceller. La méthode « les quatre temps » se transmet — chaque parcours achevé devient un certificat scellé MND."
        actions={
          <a
            href={asset('/certificat.html')}
            target="_blank"
            rel="noreferrer"
            className="mnd-btn mnd-btn--ghost"
            style={{ textDecoration: 'none' }}
          >
            Ouvrir le Certificat →
          </a>
        }
      />

      <Tabs<Tab>
        tabs={[
          { k: 'formations', l: 'Formations' },
          { k: 'apprenants', l: 'Apprenants' },
          { k: 'certifications', l: 'Certifications' },
          { k: 'referentiel', l: 'Référentiel méthode' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {note && (
        <div className="tre-inline-note" style={{ marginBottom: 16 }}>
          <span className="mark">✦</span><span>{note}</span>
          <button className="tre-link-btn" style={{ marginLeft: 'auto', color: 'var(--ink-soft)' }} onClick={() => setNote(null)}>fermer</button>
        </div>
      )}

      <div className="tr-grid tr-grid--3" style={{ marginBottom: 18 }}>
        <Card filet="copper" style={{ padding: 16 }}><div className="mnd-stat__label">Formations actives</div><div className="mnd-stat__value" style={{ fontSize: 28 }}>{stats.formations}</div></Card>
        <Card filet="indigo" style={{ padding: 16 }}><div className="mnd-stat__label">Apprenants suivis</div><div className="mnd-stat__value" style={{ fontSize: 28 }}>{stats.apprenants}</div></Card>
        <Card filet="indigo" style={{ padding: 16 }}><div className="mnd-stat__label">Certificats délivrés</div><div className="mnd-stat__value" style={{ fontSize: 28 }}>{stats.certifs}</div></Card>
      </div>

      {/* ===== FORMATIONS ===== */}
      {tab === 'formations' && (
        <div>
          <div className="tre-actions-row">
            <div style={{ display: 'flex', gap: 0, border: '1px solid var(--hairline)', borderRadius: 2, overflow: 'hidden' }}>
              <button className={`trv-tab-seg ${!showArchived ? 'is-on' : ''}`} style={segStyle(!showArchived)} onClick={() => setShowArchived(false)}>Actives</button>
              <button className={`trv-tab-seg ${showArchived ? 'is-on' : ''}`} style={segStyle(showArchived)} onClick={() => setShowArchived(true)}>Terminées · Archives</button>
            </div>
            <Button variant="copper" onClick={openFoNew}>+ Nouvelle formation</Button>
          </div>

          {activeFormations.length === 0 && (
            <Card className="tre-empty">
              <div className="tre-empty__title">Aucune formation ici.</div>
              <div className="tre-empty__sub">{showArchived ? 'Les formations terminées s’archivent ici.' : 'Créez une formation pour ouvrir les inscriptions.'}</div>
            </Card>
          )}

          <div className="tr-grid tr-grid--2">
            {activeFormations.map((f) => (
              <Card key={f.id} style={{ padding: 20, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div>
                    <div className="mnd-eyebrow" style={{ color: 'var(--copper-700)' }}>{f.niveau}</div>
                    <div style={{ fontFamily: 'var(--font-serif)', fontSize: 22, color: 'var(--color-indigo)', marginTop: 3 }}>{f.name}</div>
                  </div>
                  <span style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--color-indigo)', flex: 'none' }}>{fmtMoney(f.priceXof, currency)}</span>
                </div>
                <div className="mnd-muted" style={{ display: 'flex', gap: 10, marginTop: 12, fontSize: 11.5 }}>
                  <span>{f.sessions} séances</span><span style={{ color: 'var(--color-argile)' }}>·</span>
                  <span>{f.demarrage}</span><span style={{ color: 'var(--color-argile)' }}>·</span>
                  <span>{f.dureeSemaines} sem.</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--hairline)' }}>
                  <Pill tone={f.places === 'complet' ? 'muted' : 'copper'}>{f.places}</Pill>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <button className="tre-link-btn" onClick={() => openFoEdit(f)}>Modifier</button>
                    <button className="tre-link-btn" style={{ color: 'var(--copper-700)' }} onClick={() => toggleArchive(f)}>{f.archived ? 'Réactiver' : 'Archiver'}</button>
                    <button className="tre-link-btn tre-link-btn--danger" onClick={() => removeFo(f)}>Supprimer</button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ===== APPRENANTS ===== */}
      {tab === 'apprenants' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
            <Button variant="copper" onClick={openApNew}>+ Nouvel apprenant</Button>
          </div>
          <Card style={{ overflow: 'hidden' }}>
            <div className="mnd-scroll-x">
              <table className="tre-table">
                <thead>
                  <tr><th>Apprenant</th><th>Cursus</th><th>Progression</th><th>Paiement</th><th></th></tr>
                </thead>
                <tbody>
                  {apprenants.map((a) => {
                    const pct = apprAvancement(a);
                    return (
                      <tr key={a.id}>
                        <td>
                          <button className="tre-link-btn" onClick={() => setApDetail(a.id)} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                            <span className="tre-avatar">{a.name.slice(0, 1)}</span>
                            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--color-indigo)' }}>{a.name}</span>
                          </button>
                        </td>
                        <td className="mnd-muted">{formationName(a.formationId)}</td>
                        <td>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <Bar pct={pct} />
                            <span className="mnd-muted" style={{ fontSize: 11.5 }}>{pct} %</span>
                          </span>
                        </td>
                        <td><Pill tone={payTone(a.pay)}>{a.pay}</Pill></td>
                        <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                          <button className="tre-link-btn" onClick={() => setApDetail(a.id)}>Suivi</button>
                          <button className="tre-link-btn" style={{ marginLeft: 12 }} onClick={() => openApEdit(a)}>Modifier</button>
                          <button className="tre-link-btn tre-link-btn--danger" style={{ marginLeft: 12 }} onClick={() => removeAp(a.id)}>Retirer</button>
                        </td>
                      </tr>
                    );
                  })}
                  {apprenants.length === 0 && (
                    <tr><td colSpan={5} className="mnd-muted" style={{ textAlign: 'center', padding: 32 }}>Aucun apprenant inscrit.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ===== CERTIFICATIONS ===== */}
      {tab === 'certifications' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
            <Button variant="copper" onClick={openCeNew}>+ Délivrer une certification</Button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {certifs.map((c) => (
              <Card key={c.id} style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 18 }}>
                <span style={{ width: 44, height: 44, borderRadius: 999, flex: 'none', background: c.statut === 'Délivrée' ? 'var(--copper-50)' : 'var(--paper-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <img src={asset("/assets/monograms/mono-copper.png")} alt="" style={{ width: 20, opacity: c.statut === 'Délivrée' ? 1 : 0.4 }} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-serif)', fontSize: 19, color: 'var(--color-indigo)' }}>{c.name}</div>
                  <div className="mnd-muted" style={{ fontSize: 12 }}>{c.parcours}</div>
                </div>
                <span className="mnd-muted" style={{ fontSize: 12 }}>{c.date}</span>
                <Pill tone={c.statut === 'Délivrée' ? 'ok' : 'warn'}>{c.statut}</Pill>
                <div style={{ display: 'flex', gap: 12, flex: 'none', alignItems: 'center' }}>
                  <Button size="sm" onClick={() => setNote(`Certificat de ${c.name} — ouvrez l’app Certificat pour voir / envoyer (A4, sceau MND, WhatsApp / email).`)}>Voir / Envoyer</Button>
                  <button className="tre-link-btn" onClick={() => openCeEdit(c)}>Modifier</button>
                  <button className="tre-link-btn tre-link-btn--danger" onClick={() => removeCe(c.id)}>Retirer</button>
                </div>
              </Card>
            ))}
            {certifs.length === 0 && (
              <Card className="tre-empty"><div className="tre-empty__title">Aucune certification.</div><div className="tre-empty__sub">Délivrez un certificat scellé MND à un parcours achevé.</div></Card>
            )}
          </div>
        </div>
      )}

      {/* ===== RÉFÉRENTIEL ===== */}
      {tab === 'referentiel' && (
        <div>
          <div className="tre-deep" style={{ marginBottom: 18 }}>
            <div>
              <div className="tre-deep__eyebrow">Standard verrouillé · actif transmissible</div>
              <div className="tre-deep__body">Le référentiel méthode garantit le « powered by MND ».</div>
            </div>
          </div>
          <div className="tr-grid tr-grid--2" style={{ alignItems: 'start' }}>
            <Card style={{ padding: '20px 22px' }}>
              <div className="tre-sec-label" style={{ marginBottom: 14 }}>Les quatre temps</div>
              {QUATRE_TEMPS.map((t) => (
                <div key={t.no} style={{ display: 'flex', gap: 14, alignItems: 'baseline', paddingBottom: 13 }}>
                  <span style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--color-copper)', width: 26, flex: 'none' }}>{t.no}</span>
                  <div>
                    <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--color-indigo)' }}>{t.n}</div>
                    <div className="mnd-muted" style={{ fontSize: 12, fontWeight: 300 }}>{t.g}</div>
                  </div>
                </div>
              ))}
            </Card>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <Card style={{ padding: '20px 22px' }}>
                <div className="tre-sec-label" style={{ marginBottom: 12 }}>La logique de palier</div>
                {REF_PALIERS.map(([n, g]) => (
                  <div key={n} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '8px 0', borderBottom: '1px solid var(--hairline)' }}>
                    <span style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--color-indigo)' }}>{n}</span>
                    <span className="mnd-muted" style={{ fontSize: 12 }}>{g}</span>
                  </div>
                ))}
              </Card>
              <Card style={{ padding: '20px 22px' }}>
                <div className="tre-sec-label" style={{ marginBottom: 12 }}>Le lexique ™</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '9px 18px' }}>
                  {REF_LEXIQUE.map(([n, g]) => (
                    <div key={n}>
                      <span style={{ fontFamily: 'var(--font-serif)', fontSize: 15, color: 'var(--color-indigo)' }}>{n}</span>
                      <span className="mnd-muted" style={{ fontSize: 11, marginLeft: 7 }}>{g}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* ===== SUIVI D'APPRENANT · drawer ===== */}
      {detail && (
        <Modal title={`Suivi · ${detail.name}`} onClose={() => setApDetail(null)} width={560}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div className="mnd-muted" style={{ fontSize: 11.5 }}>{formationName(detail.formationId)}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
              <Bar pct={apprAvancement(detail)} />
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--color-indigo)', flex: 'none' }}>{apprAvancement(detail)} %</span>
            </div>
            <div className="tre-sec-label" style={{ margin: '18px 0 10px' }}>Modules du parcours · les quatre temps</div>
            {QUATRE_TEMPS.map((t, i) => {
              const done = detail.modulesDone[i];
              return (
                <button
                  key={t.no}
                  onClick={() => toggleModule(detail.id, i)}
                  style={{ cursor: 'pointer', textAlign: 'left', background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderRadius: 4, padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}
                >
                  <span style={{ width: 22, height: 22, borderRadius: 999, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, background: done ? 'var(--color-copper)' : 'transparent', border: '2px solid var(--color-indigo)', color: 'var(--color-ivoire)' }}>{done ? '✓' : ''}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--color-indigo)' }}>{t.no} · {t.n}</div>
                    <div className="mnd-muted" style={{ fontSize: 11 }}>{t.g}</div>
                  </div>
                </button>
              );
            })}
            {detail.modulesDone.every(Boolean) && (
              <div style={{ marginTop: 12, background: 'var(--color-obsidian)', borderRadius: 4, padding: '18px 20px' }}>
                <div className="tre-deep__eyebrow">Parcours achevé · prêt à sceller</div>
                <div style={{ fontFamily: 'var(--font-serif)', fontSize: 19, color: 'var(--color-ivoire)', marginTop: 6 }}>La couronne peut être transmise.</div>
                <Button variant="copper" style={{ marginTop: 16, width: '100%' }} onClick={() => sealCertificate(detail.name, formationName(detail.formationId))}>
                  Délivrer la certification · sceau MND
                </Button>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* ===== MODALES CRUD ===== */}
      {foForm && (
        <Modal title={foEditId ? 'La formation.' : 'Nouvelle formation.'} onClose={() => setFoForm(null)} width={560}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="Intitulé de la formation">
              <Input value={foForm.name} onChange={(e) => setFoForm({ ...foForm, name: e.target.value })} placeholder="Ex. Fondations du Lock" />
            </Field>
            <div className="tr-grid tr-grid--2">
              <Field label="Niveau">
                <Select value={foForm.niveau} onChange={(e) => setFoForm({ ...foForm, niveau: e.target.value })}>
                  {FORMATION_NIVEAUX.map((n) => <option key={n} value={n}>{n}</option>)}
                </Select>
              </Field>
              <Field label="Prix (F CFA)">
                <Input inputMode="numeric" value={foForm.price} onChange={(e) => setFoForm({ ...foForm, price: e.target.value })} placeholder="250 000" />
              </Field>
            </div>
            <div className="tr-grid tr-grid--2">
              <Field label="Nombre de séances">
                <Input inputMode="numeric" value={foForm.sessions} onChange={(e) => setFoForm({ ...foForm, sessions: e.target.value })} />
              </Field>
              <Field label="Durée (semaines)">
                <Input inputMode="numeric" value={foForm.duree} onChange={(e) => setFoForm({ ...foForm, duree: e.target.value })} />
              </Field>
            </div>
            <div className="tr-grid tr-grid--2">
              <Field label="Démarrage">
                <Input value={foForm.demarrage} onChange={(e) => setFoForm({ ...foForm, demarrage: e.target.value })} placeholder="démarre 8 juil" />
              </Field>
              <Field label="Places">
                <Input value={foForm.places} onChange={(e) => setFoForm({ ...foForm, places: e.target.value })} placeholder="4 places / complet" />
              </Field>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <Button variant="ghost" onClick={() => setFoForm(null)}>Annuler</Button>
              <Button variant="copper" style={{ flex: 1 }} onClick={saveFo} disabled={!foForm.name.trim()}>{foEditId ? 'Enregistrer' : 'Créer la formation'}</Button>
            </div>
          </div>
        </Modal>
      )}

      {apForm && (
        <Modal title={apEditId ? 'L’apprenant·e.' : 'Nouvel apprenant.'} onClose={() => setApForm(null)} width={520}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="Nom de l’apprenant·e">
              <Input value={apForm.name} onChange={(e) => setApForm({ ...apForm, name: e.target.value })} placeholder="Prénom Nom" />
            </Field>
            <Field label="Formation">
              <Select value={apForm.formationId} onChange={(e) => setApForm({ ...apForm, formationId: e.target.value })}>
                {formations.map((f) => <option key={f.id} value={f.id}>{f.name}{f.archived ? ' · archivée' : ''}</option>)}
              </Select>
            </Field>
            <Field label="Paiement">
              <div style={{ display: 'flex', gap: 8 }}>
                {(['À jour', 'Échéance', 'En retard'] as Apprenant['pay'][]).map((p) => (
                  <button key={p} className={`tre-chip ${apForm.pay === p ? 'is-on' : ''}`} onClick={() => setApForm({ ...apForm, pay: p })}>{p}</button>
                ))}
              </div>
            </Field>
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <Button variant="ghost" onClick={() => setApForm(null)}>Annuler</Button>
              <Button variant="copper" style={{ flex: 1 }} onClick={saveAp} disabled={!apForm.name.trim()}>{apEditId ? 'Enregistrer' : 'Inscrire l’apprenant·e'}</Button>
            </div>
          </div>
        </Modal>
      )}

      {ceForm && (
        <Modal title={ceEditId ? 'La certification.' : 'Délivrer une certification.'} onClose={() => setCeForm(null)} width={520}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="Nom du·de la certifié·e">
              <Input value={ceForm.name} onChange={(e) => setCeForm({ ...ceForm, name: e.target.value })} placeholder="Prénom Nom" />
            </Field>
            <Field label="Parcours">
              <Select value={ceForm.parcours} onChange={(e) => setCeForm({ ...ceForm, parcours: e.target.value })}>
                {formations.map((f) => <option key={f.id} value={f.name}>{f.name}</option>)}
              </Select>
            </Field>
            <div className="tr-grid tr-grid--2">
              <Field label="Date · jury">
                <Input value={ceForm.date} onChange={(e) => setCeForm({ ...ceForm, date: e.target.value })} placeholder="12 mars 2026" />
              </Field>
              <Field label="Statut">
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['Délivrée', 'En cours'] as Certification['statut'][]).map((s) => (
                    <button key={s} className={`tre-chip ${ceForm.statut === s ? 'is-on' : ''}`} onClick={() => setCeForm({ ...ceForm, statut: s })}>{s}</button>
                  ))}
                </div>
              </Field>
            </div>
            <div className="mnd-muted" style={{ fontSize: 11.5, fontStyle: 'italic' }}>Le certificat A4 (sceau MND, PDF, WhatsApp / email) se compose dans l’app Certificat.</div>
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <Button variant="ghost" onClick={() => setCeForm(null)}>Annuler</Button>
              <Button variant="copper" style={{ flex: 1 }} onClick={saveCe} disabled={!ceForm.name.trim()}>{ceEditId ? 'Enregistrer' : 'Délivrer, sceau MND'}</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function segStyle(on: boolean): React.CSSProperties {
  return {
    cursor: 'pointer', background: 'none', border: 'none', borderBottom: `2px solid ${on ? 'var(--color-copper)' : 'transparent'}`,
    padding: '9px 14px', fontFamily: 'var(--font-sans)', fontSize: 11, color: on ? 'var(--color-indigo)' : 'var(--ink-soft)',
  };
}
