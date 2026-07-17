import { asset } from '../../../../shared/asset';
import { useMemo, useState } from 'react';
import { PageHead } from '../_ui';
import { Button, Card, Field, Input, Modal, Select } from '../../../../ds/components';
import { fmtMoney } from '../../../../shared/currency';
import { usePaymentMethods, type PaymentMethod } from '../../../../shared/finance';
import { useBranch } from '../../../../shared/branches';
import { uid } from '../../../../shared/store';
import {
  FORMATION_NIVEAUX,
  refTempsStore, refPaliersStore, refLexiqueStore,
  useRefTemps, useRefPaliers, useRefLexique,
  REF_TEMPS_SEED, REF_PALIERS_SEED, REF_LEXIQUE_SEED,
  useFormations, useApprenants, useCertifs,
  apprPaid, apprDue, apprHasFinance, apprPayStatus,
  type Formation, type Apprenant, type Certification, type Payment, type RefEntry,
} from './data';
import type { Store } from '../../../../shared/store';
import { Bar, Pill, Tabs } from './ui';
import './equipe.css';

/* Académie — Formations / Apprenants / Certifications / Référentiel « les quatre temps ».
   Inscription d'apprenants, suivi d'avancement, certificats scellés MND (le rendu du
   certificat lui-même vit dans l'app `certificat` — ici on le déclenche, on ne le rebâtit pas). */

type Tab = 'formations' | 'apprenants' | 'certifications' | 'referentiel';

const payTone = (p: Apprenant['pay']): 'ok' | 'warn' | 'error' => (p === 'À jour' ? 'ok' : p === 'Échéance' ? 'warn' : 'error');

/* Parcours par défaut d'une nouvelle formation — « les quatre temps » du
   référentiel, désormais éditable : le défaut se lit donc au moment de la création
   (dans le composant), non plus à l'import de ce module. */
type FormationForm = { name: string; niveau: string; sessions: string; demarrage: string; places: string; price: string; duree: string; modules: string[] };
const BASE_FORMATION: Omit<FormationForm, 'modules'> = { name: '', niveau: FORMATION_NIVEAUX[0], sessions: '6', demarrage: 'sur dossier', places: '4 places', price: '', duree: '6' };

/* Inscription : identité + scolarité (montant convenu) + un règlement à saisir
   — intégral (tout, à une date) ou partiel (un acompte). `payments` porte les
   règlements déjà enregistrés (édition d'un·e apprenant·e existant·e). */
type PayMode = 'integral' | 'partiel' | 'aucun';
type ApprenantForm = {
  name: string;
  formationId: string;
  priceInput: string;   // montant brut de la formation
  remiseInput: string;  // remise accordée (F CFA)
  payMode: PayMode;
  amountInput: string;
  payDate: string;      // ISO yyyy-mm-dd (calendrier)
  payMethod: PaymentMethod;
  payments: Payment[];
};
type CertifForm = { name: string; parcours: string; date: string; statut: Certification['statut'] };

export default function Academie() {
  const { currency } = useBranch();
  const [payMethods] = usePaymentMethods();
  const [tab, setTab] = useState<Tab>('formations');
  const [showArchived, setShowArchived] = useState(false);

  const [formations, setFormations] = useFormations();
  const [apprenants, setApprenants] = useApprenants();
  const [certifs, setCertifs] = useCertifs();

  /* Le référentiel — éditable. Les « quatre temps » servent aussi de parcours par
     défaut à toute nouvelle formation, d'où leur lecture ici. */
  const [refTemps] = useRefTemps();
  const [refPaliers] = useRefPaliers();
  const [refLexique] = useRefLexique();
  const defaultModules = useMemo(() => refTemps.map((t) => t.n.trim()).filter(Boolean), [refTemps]);

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
  const formationPrice = (id: string) => formations.find((f) => f.id === id)?.priceXof ?? 0;
  /* Les modules du parcours de la formation. `undefined` = fiche héritée d'avant la
     fonctionnalité → repli sur « les quatre temps ». `[]` = parcours volontairement
     vidé → on le respecte (aucun module). */
  const formationModules = (id: string): string[] => {
    const m = formations.find((f) => f.id === id)?.modules;
    return m === undefined ? defaultModules : m;
  };
  /* Avancement = modules faits / modules de LA formation. On ne compte que dans la
     limite des modules actuels (si la formation en a perdu, on ne dépasse pas 100 %). */
  const avancementOf = (a: Apprenant) => {
    const total = formationModules(a.formationId).length;
    const done = a.modulesDone.slice(0, total).filter(Boolean).length;
    return total ? Math.round((done / total) * 100) : 0;
  };
  const digits = (s: string) => parseInt(s.replace(/[^0-9]/g, ''), 10) || 0;
  /* Date du jour au format calendrier (yyyy-mm-dd, local). */
  const todayISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  /* yyyy-mm-dd → jj/mm/aaaa (lisible), sans décalage de fuseau. */
  const frDate = (iso: string) => {
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
  };
  /* Statut affiché : déduit des règlements réels si suivi financier, sinon champ historique. */
  const payStatusOf = (a: Apprenant) => (apprHasFinance(a) ? apprPayStatus(a) : a.pay);

  const stats = useMemo(() => ({
    formations: formations.filter((f) => !f.archived).length,
    apprenants: apprenants.length,
    certifs: certifs.filter((c) => c.statut === 'Délivrée').length,
  }), [formations, apprenants, certifs]);

  /* — formations — */
  const openFoNew = () => { setFoEditId(null); setFoForm({ ...BASE_FORMATION, modules: [...defaultModules] }); };
  const openFoEdit = (f: Formation) => {
    setFoEditId(f.id);
    setFoForm({ name: f.name, niveau: f.niveau, sessions: String(f.sessions), demarrage: f.demarrage, places: f.places, price: String(f.priceXof), duree: String(f.dureeSemaines), modules: f.modules && f.modules.length ? [...f.modules] : [...defaultModules] });
  };
  const saveFo = () => {
    if (!foForm || !foForm.name.trim()) return;
    const sessions = parseInt(foForm.sessions, 10) || 1;
    const priceXof = parseInt(foForm.price.replace(/[^0-9]/g, ''), 10) || 0;
    const dureeSemaines = parseInt(foForm.duree, 10) || 1;
    const modules = foForm.modules.map((m) => m.trim()).filter(Boolean);
    if (foEditId) {
      const oldNames = formationModules(foEditId); // parcours AVANT modification (état courant)
      setFormations((prev) => prev.map((f) => (f.id === foEditId ? { ...f, name: foForm.name.trim(), niveau: foForm.niveau, sessions, demarrage: foForm.demarrage.trim(), places: foForm.places.trim(), priceXof, dureeSemaines, modules } : f)));
      /* Réaligne la progression des apprenant·e·s inscrit·e·s par NOM de module : ajout,
         retrait ou réordonnancement ne décalent plus les cases cochées (un renommage
         repart de zéro pour ce module). */
      const modulesChanged = oldNames.length !== modules.length || oldNames.some((nm, i) => nm !== modules[i]);
      if (modulesChanged) {
        setApprenants((prev) => prev.map((a) => {
          if (a.formationId !== foEditId) return a;
          const done = new Map(oldNames.map((nm, i) => [nm, !!a.modulesDone[i]]));
          return { ...a, modulesDone: modules.map((nm) => done.get(nm) ?? false) };
        }));
      }
    } else {
      setFormations((prev) => [...prev, { id: `fo-${uid()}`, name: foForm.name.trim(), niveau: foForm.niveau, sessions, demarrage: foForm.demarrage.trim(), places: foForm.places.trim(), priceXof, dureeSemaines, archived: false, modules }]);
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
  const openApNew = () => {
    setApEditId(null);
    const fId = formations.find((f) => !f.archived)?.id ?? formations[0]?.id ?? '';
    const price = formationPrice(fId);
    /* Défaut « Plus tard » : aucun règlement n'est enregistré tant qu'on ne le choisit pas
       explicitement — on ne marque jamais « soldé » par accident. */
    setApForm({ name: '', formationId: fId, priceInput: price ? String(price) : '', remiseInput: '', payMode: 'aucun', amountInput: '', payDate: todayISO(), payMethod: 'MTN MoMo', payments: [] });
  };
  const openApEdit = (a: Apprenant) => {
    setApEditId(a.id);
    /* Fiche déjà financée → on rappelle son montant brut (net + remise) et sa remise.
       Fiche héritée (sans suivi) → champs vides : un simple correctif ne la bascule pas
       sur le suivi de paiement ni ne la fait paraître débitrice. */
    const remise = a.remiseXof ?? 0;
    const gross = apprHasFinance(a) ? (a.priceXof ?? 0) + remise : 0;
    setApForm({ name: a.name, formationId: a.formationId, priceInput: gross ? String(gross) : '', remiseInput: remise ? String(remise) : '', payMode: 'aucun', amountInput: '', payDate: todayISO(), payMethod: 'MTN MoMo', payments: a.payments ?? [] });
  };
  const saveAp = () => {
    if (!apForm || !apForm.name.trim()) return;
    const gross = digits(apForm.priceInput);
    const remise = Math.min(gross, digits(apForm.remiseInput)); // la remise ne dépasse pas le prix
    const price = Math.max(0, gross - remise);                  // net dû = prix − remise
    const already = apForm.payments.reduce((s, p) => s + p.amountXof, 0);
    /* Le règlement saisi : intégral solde le reste (net − déjà réglé), partiel prend le montant saisi. */
    let newPayment: Payment | null = null;
    if (apForm.payMode !== 'aucun') {
      const amount = apForm.payMode === 'integral' ? Math.max(0, price - already) : digits(apForm.amountInput);
      if (amount > 0) newPayment = { id: `pay-${uid()}`, amountXof: amount, date: frDate(apForm.payDate || todayISO()), method: apForm.payMethod };
    }
    const payments = newPayment ? [...apForm.payments, newPayment] : apForm.payments;
    const paid = payments.reduce((s, p) => s + p.amountXof, 0);
    /* Soldé → « À jour », toute somme restant due → « Échéance ». */
    const derived: Apprenant['pay'] = paid >= price ? 'À jour' : 'Échéance';
    /* « Financé » = un montant, une remise ou au moins un règlement. Sinon (fiche héritée
       laissée telle quelle) on préserve son statut d'origine — pas de bascule fortuite. */
    const financed = price > 0 || remise > 0 || payments.length > 0;
    if (apEditId) {
      setApprenants((prev) => prev.map((a) => {
        if (a.id !== apEditId) return a;
        /* Changement de formation → on réaligne la progression sur le NOUVEAU parcours,
           en conservant les modules dont le nom coïncide (les autres repartent à zéro). */
        let modulesDone = a.modulesDone;
        if (a.formationId !== apForm.formationId) {
          const oldNames = formationModules(a.formationId);
          const done = new Map(oldNames.map((nm, i) => [nm, !!a.modulesDone[i]]));
          modulesDone = formationModules(apForm.formationId).map((nm) => done.get(nm) ?? false);
        }
        return { ...a, name: apForm.name.trim(), formationId: apForm.formationId, priceXof: price, remiseXof: remise || undefined, payments, pay: financed ? derived : a.pay, modulesDone };
      }));
    } else {
      const mods = formationModules(apForm.formationId);
      setApprenants((prev) => [...prev, { id: `ap-${uid()}`, name: apForm.name.trim(), formationId: apForm.formationId, pay: derived, modulesDone: mods.map(() => false), priceXof: price, remiseXof: remise || undefined, payments }]);
      const reste = Math.max(0, price - paid);
      setNote(
        `${apForm.name.trim()} inscrit·e sur « ${formationName(apForm.formationId)} »`
        + (price > 0 ? ` · ${fmtMoney(paid, currency)} réglé${reste > 0 ? ` · reste ${fmtMoney(reste, currency)}` : ' · soldé'}.` : '.'),
      );
    }
    setApForm(null);
  };
  const removeAp = (id: string) => setApprenants((prev) => prev.filter((a) => a.id !== id));
  const toggleModule = (aid: string, idx: number) =>
    setApprenants((prev) => prev.map((a) => {
      if (a.id !== aid) return a;
      const arr = [...a.modulesDone];
      while (arr.length <= idx) arr.push(false); // aligne si la formation a gagné des modules
      arr[idx] = !arr[idx];
      return { ...a, modulesDone: arr };
    }));

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
                    const pct = avancementOf(a);
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
                        <td>
                          <span style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
                            <Pill tone={payTone(payStatusOf(a))}>{payStatusOf(a)}</Pill>
                            {apprHasFinance(a) && (
                              <span className="mnd-muted" style={{ fontSize: 10.5, whiteSpace: 'nowrap' }}>
                                {apprDue(a) > 0 ? `reste ${fmtMoney(apprDue(a), currency)}` : `soldé · ${fmtMoney(a.priceXof ?? 0, currency)}`}
                              </span>
                            )}
                          </span>
                        </td>
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
            <RefEditor
              title="Les quatre temps"
              note="Le geste du rituel — et le parcours par défaut de toute nouvelle formation."
              rows={refTemps}
              store={refTempsStore}
              seed={REF_TEMPS_SEED}
              numbered
              namePlaceholder="Nom du temps (ex. Purifier)"
              glossPlaceholder="Le geste en une phrase"
              addLabel="+ Ajouter un temps"
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <RefEditor
                title="La logique de palier"
                rows={refPaliers}
                store={refPaliersStore}
                seed={REF_PALIERS_SEED}
                namePlaceholder="Nom du palier"
                glossPlaceholder="Ce qu’il promet"
                addLabel="+ Ajouter un palier"
              />
              <RefEditor
                title="Le lexique ™"
                rows={refLexique}
                store={refLexiqueStore}
                seed={REF_LEXIQUE_SEED}
                namePlaceholder="Terme (ex. VÈKPÈ™)"
                glossPlaceholder="Ce qu’il désigne"
                addLabel="+ Ajouter un terme"
              />
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
              <Bar pct={avancementOf(detail)} />
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--color-indigo)', flex: 'none' }}>{avancementOf(detail)} %</span>
            </div>

            {apprHasFinance(detail) && (
              <div className="tre-pay-summary">
                <div className="tre-sec-label" style={{ marginBottom: 10 }}>Formation</div>
                {(detail.remiseXof ?? 0) > 0 && (
                  <div className="tre-pay-recap__line"><span className="mnd-muted">Remise accordée</span><span>− {fmtMoney(detail.remiseXof ?? 0, currency)}</span></div>
                )}
                <div className="tre-pay-recap__line"><span className="mnd-muted">Montant convenu</span><span>{fmtMoney(detail.priceXof ?? 0, currency)}</span></div>
                <div className="tre-pay-recap__line"><span className="mnd-muted">Réglé</span><span>{fmtMoney(apprPaid(detail), currency)}</span></div>
                <div className="tre-pay-recap__line tre-pay-recap__reste"><span>Reste à payer</span><span>{fmtMoney(apprDue(detail), currency)}</span></div>
                {(detail.payments ?? []).length > 0 && (
                  <div className="tre-pay-summary__list">
                    {(detail.payments ?? []).map((p) => (
                      <div key={p.id} className="tre-pay-summary__pay"><span className="mnd-muted">{p.date}{p.method ? ` · ${p.method}` : ''}</span><span>{fmtMoney(p.amountXof, currency)}</span></div>
                    ))}
                  </div>
                )}
                {apprDue(detail) > 0 && (
                  <Button size="sm" variant="ghost" style={{ marginTop: 12 }} onClick={() => { openApEdit(detail); setApDetail(null); }}>Enregistrer un règlement</Button>
                )}
              </div>
            )}

            <div className="tre-sec-label" style={{ margin: '18px 0 10px' }}>Modules du parcours</div>
            {formationModules(detail.formationId).length === 0 && (
              <div className="mnd-muted" style={{ fontSize: 12, fontStyle: 'italic' }}>Aucun module défini pour cette formation — ajoutez-en dans la fiche formation.</div>
            )}
            {formationModules(detail.formationId).map((name, i) => {
              const done = !!detail.modulesDone[i];
              return (
                <button
                  key={i}
                  onClick={() => toggleModule(detail.id, i)}
                  style={{ cursor: 'pointer', textAlign: 'left', background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderRadius: 4, padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8, width: '100%' }}
                >
                  <span style={{ width: 22, height: 22, borderRadius: 999, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, background: done ? 'var(--color-copper)' : 'transparent', border: '2px solid var(--color-indigo)', color: 'var(--color-ivoire)' }}>{done ? '✓' : ''}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--color-indigo)' }}>{String(i + 1).padStart(2, '0')} · {name}</div>
                  </div>
                </button>
              );
            })}
            {(() => { const mods = formationModules(detail.formationId); return mods.length > 0 && mods.every((_, i) => !!detail.modulesDone[i]); })() && (
              <div style={{ marginTop: 12, background: 'var(--color-indigo)', borderRadius: 4, padding: '18px 20px' }}>
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
            <Field label="Modules du parcours">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {foForm.modules.map((m, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span className="mnd-muted" style={{ fontSize: 12, width: 18, flex: 'none', textAlign: 'right' }}>{i + 1}</span>
                    <Input
                      value={m}
                      onChange={(e) => setFoForm((prev) => (prev ? { ...prev, modules: prev.modules.map((x, j) => (j === i ? e.target.value : x)) } : prev))}
                      placeholder="Nom du module (ex. Purifier)"
                    />
                    <button
                      type="button"
                      aria-label="Retirer le module"
                      className="tre-link-btn tre-link-btn--danger"
                      style={{ flex: 'none' }}
                      onClick={() => setFoForm((prev) => (prev ? { ...prev, modules: prev.modules.filter((_, j) => j !== i) } : prev))}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="tre-chip"
                  style={{ alignSelf: 'flex-start' }}
                  onClick={() => setFoForm((prev) => (prev ? { ...prev, modules: [...prev.modules, ''] } : prev))}
                >
                  + Ajouter un module
                </button>
                <span className="mnd-muted" style={{ fontSize: 11, fontStyle: 'italic' }}>
                  Chaque formation a ses propres étapes — l'avancement des apprenant·e·s s'y aligne.
                </span>
              </div>
            </Field>
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <Button variant="ghost" onClick={() => setFoForm(null)}>Annuler</Button>
              <Button variant="copper" style={{ flex: 1 }} onClick={saveFo} disabled={!foForm.name.trim()}>{foEditId ? 'Enregistrer' : 'Créer la formation'}</Button>
            </div>
          </div>
        </Modal>
      )}

      {apForm && ((f: ApprenantForm) => {
        const apGross = digits(f.priceInput);
        const apRemise = Math.min(apGross, digits(f.remiseInput));
        const apNet = Math.max(0, apGross - apRemise);
        const apAlready = f.payments.reduce((s, p) => s + p.amountXof, 0);
        const apThis = f.payMode === 'integral' ? Math.max(0, apNet - apAlready) : f.payMode === 'partiel' ? digits(f.amountInput) : 0;
        const apReste = Math.max(0, apNet - (apAlready + apThis));
        return (
        <Modal title={apEditId ? 'L’apprenant·e.' : 'Nouvel apprenant.'} onClose={() => setApForm(null)} width={520}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="Nom de l’apprenant·e">
              <Input value={f.name} onChange={(e) => setApForm({ ...f, name: e.target.value })} placeholder="Prénom Nom" />
            </Field>
            <Field label="Formation">
              <Select
                value={f.formationId}
                onChange={(e) => {
                  const fid = e.target.value;
                  setApForm({ ...f, formationId: fid, ...(apEditId ? {} : { priceInput: formationPrice(fid) ? String(formationPrice(fid)) : '' }) });
                }}
              >
                {formations.map((fo) => <option key={fo.id} value={fo.id}>{fo.name}{fo.archived ? ' · archivée' : ''}</option>)}
              </Select>
            </Field>

            <div className="tr-grid tr-grid--2">
              <Field label="Montant de la formation (F CFA)">
                <Input inputMode="numeric" value={f.priceInput} onChange={(e) => setApForm({ ...f, priceInput: e.target.value })} placeholder="Ex. 250 000" />
              </Field>
              <Field label="Remise accordée (F CFA)">
                <Input inputMode="numeric" value={f.remiseInput} onChange={(e) => setApForm({ ...f, remiseInput: e.target.value })} placeholder="0" />
              </Field>
            </div>

            {f.payments.length > 0 && (
              <div className="mnd-muted" style={{ fontSize: 12, marginTop: -6 }}>
                Déjà réglé : {fmtMoney(apAlready, currency)}{apNet > 0 && <> · reste {fmtMoney(Math.max(0, apNet - apAlready), currency)}</>}
              </div>
            )}

            <Field label={f.payments.length > 0 ? 'Enregistrer un règlement' : 'Règlement à l’inscription'}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {([['integral', 'Intégral'], ['partiel', 'Partiel'], ['aucun', f.payments.length > 0 ? 'Aucun ajout' : 'Plus tard']] as [PayMode, string][]).map(([m, label]) => (
                  <button key={m} type="button" className={`tre-chip ${f.payMode === m ? 'is-on' : ''}`} onClick={() => setApForm({ ...f, payMode: m })}>{label}</button>
                ))}
              </div>
            </Field>

            {f.payMode === 'partiel' && (
              <div className="tr-grid tr-grid--2">
                <Field label="Montant réglé (F CFA)">
                  <Input inputMode="numeric" value={f.amountInput} onChange={(e) => setApForm({ ...f, amountInput: e.target.value })} placeholder="Ex. 100 000" />
                </Field>
                <Field label="Date du règlement">
                  <Input type="date" value={f.payDate} onChange={(e) => setApForm({ ...f, payDate: e.target.value })} />
                </Field>
                <Field label="Mode de paiement">
                  <Select value={f.payMethod} onChange={(e) => setApForm({ ...f, payMethod: e.target.value as PaymentMethod })}>
                    {payMethods.map((m) => <option key={m} value={m}>{m}</option>)}
                  </Select>
                </Field>
              </div>
            )}
            {f.payMode === 'integral' && (
              <div className="tr-grid tr-grid--2">
                <Field label="Montant réglé">
                  <Input value={fmtMoney(apThis, currency)} readOnly disabled />
                </Field>
                <Field label="Date du règlement">
                  <Input type="date" value={f.payDate} onChange={(e) => setApForm({ ...f, payDate: e.target.value })} />
                </Field>
                <Field label="Mode de paiement">
                  <Select value={f.payMethod} onChange={(e) => setApForm({ ...f, payMethod: e.target.value as PaymentMethod })}>
                    {payMethods.map((m) => <option key={m} value={m}>{m}</option>)}
                  </Select>
                </Field>
              </div>
            )}

            {apGross > 0 && (
              <div className="tre-pay-recap">
                <div className="tre-pay-recap__line"><span className="mnd-muted">Formation</span><span>{fmtMoney(apGross, currency)}</span></div>
                {apRemise > 0 && (
                  <div className="tre-pay-recap__line"><span className="mnd-muted">Remise</span><span>− {fmtMoney(apRemise, currency)}</span></div>
                )}
                {f.payMode !== 'aucun' && apThis > 0 && (
                  <div className="tre-pay-recap__line"><span className="mnd-muted">Ce règlement</span><span>{fmtMoney(apThis, currency)}</span></div>
                )}
                <div className="tre-pay-recap__line tre-pay-recap__reste"><span>Reste à payer</span><span>{fmtMoney(apReste, currency)}</span></div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <Button variant="ghost" onClick={() => setApForm(null)}>Annuler</Button>
              <Button variant="copper" style={{ flex: 1 }} onClick={saveAp} disabled={!f.name.trim()}>{apEditId ? 'Enregistrer' : 'Inscrire l’apprenant·e'}</Button>
            </div>
          </div>
        </Modal>
        );
      })(apForm)}

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

/* ---------- Éditeur d'une section du référentiel ----------
   Trois sections, une même forme (nom + glose) : un seul éditeur les gère toutes.
   La numérotation des « quatre temps » se lit de la position (`numbered`) — ajouter,
   retirer ou réordonner ne renumérote donc jamais à la main. */
function RefEditor({
  title, note, rows, store, seed, numbered, namePlaceholder, glossPlaceholder, addLabel,
}: {
  title: string;
  note?: string;
  rows: RefEntry[];
  store: Store<RefEntry[]>;
  seed: RefEntry[];
  numbered?: boolean;
  namePlaceholder: string;
  glossPlaceholder: string;
  addLabel: string;
}) {
  const setField = (i: number, field: keyof RefEntry, v: string) =>
    store.set((prev) => prev.map((r, j) => (j === i ? { ...r, [field]: v } : r)));
  const move = (i: number, dir: -1 | 1) =>
    store.set((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const del = (i: number) => store.set((prev) => prev.filter((_, j) => j !== i));
  const add = () => store.set((prev) => [...prev, { n: '', g: '' }]);
  const reset = () => {
    if (window.confirm(`Rétablir « ${title} » au standard MND ? Vos modifications de cette section seront remplacées.`)) {
      store.set(() => seed.map((r) => ({ ...r })));
    }
  };

  return (
    <Card style={{ padding: '20px 22px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: note ? 4 : 14 }}>
        <div className="tre-sec-label" style={{ margin: 0 }}>{title}</div>
        <button className="tre-link-btn" style={{ color: 'var(--copper-700)' }} onClick={reset} title="Rétablir le standard MND">Rétablir</button>
      </div>
      {note && <div className="mnd-muted" style={{ fontSize: 11.5, fontStyle: 'italic', marginBottom: 14 }}>{note}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map((r, i) => (
          <div key={i} className="tre-ref-row">
            {numbered && <span className="tre-ref-no">{String(i + 1).padStart(2, '0')}</span>}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
              <Input value={r.n} onChange={(e) => setField(i, 'n', e.target.value)} placeholder={namePlaceholder} style={{ fontFamily: 'var(--font-serif)', fontSize: 15, color: 'var(--color-indigo)' }} />
              <Input value={r.g} onChange={(e) => setField(i, 'g', e.target.value)} placeholder={glossPlaceholder} style={{ fontSize: 12 }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 'none' }}>
              <button className="tre-ref-ctl" disabled={i === 0} onClick={() => move(i, -1)} title="Monter" aria-label="Monter">▲</button>
              <button className="tre-ref-ctl" disabled={i === rows.length - 1} onClick={() => move(i, 1)} title="Descendre" aria-label="Descendre">▼</button>
              <button className="tre-ref-ctl tre-ref-ctl--danger" onClick={() => del(i)} title="Retirer" aria-label="Retirer">✕</button>
            </div>
          </div>
        ))}
        {rows.length === 0 && <div className="mnd-muted" style={{ fontSize: 12, fontStyle: 'italic' }}>Section vide — ajoutez une première entrée.</div>}
      </div>
      <button className="tre-chip" style={{ marginTop: 12 }} onClick={add}>{addLabel}</button>
    </Card>
  );
}

function segStyle(on: boolean): React.CSSProperties {
  return {
    cursor: 'pointer', background: 'none', border: 'none', borderBottom: `2px solid ${on ? 'var(--color-copper)' : 'transparent'}`,
    padding: '9px 14px', fontFamily: 'var(--font-sans)', fontSize: 11, color: on ? 'var(--color-indigo)' : 'var(--ink-soft)',
  };
}
