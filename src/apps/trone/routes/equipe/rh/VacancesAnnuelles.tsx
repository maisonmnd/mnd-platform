import { useMemo, useState } from 'react';
import { Button, Field, Input, Select, alerte, demande, toast } from '../../../../../ds/components';
import { ChampDeDate } from '../../../../../ds/dates';
import { useBranch } from '../../../../../shared/branches';
import { useStaff as useMyStaff } from '../../../../../shared/auth';
import { planningStore } from '../../../../../shared/rh';
import { estPartie } from '../../../../../shared/rh-pur';
import { exceptionsHorairesStore, useExceptionsHoraires, useSettings } from '../../../../../shared/settings';
import { uid } from '../../../../../shared/store';
import {
  droitDeLAnnee, fermetureEnConges, jourLong, joursAFermer, joursCalendaires, periodesDeLAnnee, poseLesVacances,
  pourquoiPasLaPeriode, repriseApres, retireLesVacances, totalDesJours, type CongeLu,
} from '../../../../../shared/vacances-pur';
import { ordonneEquipe, useStaff } from '../data';
import { PAYROLL_PARAMETERS_SEED, leaveStore, useLeave, usePayrollParameters, type LeaveRequest } from '../payroll';
import { ficheDeLAnnee, rangeLaFiche, telechargeLaFiche } from './fiche-de-conges';

/* ══ LES VACANCES ANNUELLES · 6 novembre 2026 ══════════════════════════
   Maquette 1Jc1m2bUp8rovJ5tmejBAo (v2, « Construis »). Un onglet à côté de
   « Congés & absences », pour caler l'année d'avance : la fermeture de la
   Maison, puis les vacances de chacun. Ce qui est calé s'inscrit au planning
   et se décompte du même solde que les congés ; la fiche PDF se range seule
   au dossier. Les règles vivent dans `shared/vacances-pur`. */

const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
type Formulaire = { genre: 'vacances' | 'fermeture'; staffId: string; du: string; au: string; note: string };

export default function VacancesAnnuelles() {
  const { branch } = useBranch();
  const [staff] = useStaff();
  const [leaves] = useLeave();
  const [params] = usePayrollParameters();
  const [settings] = useSettings();
  const [exceptions] = useExceptionsHoraires();
  const moi = useMyStaff();
  const par = moi?.name ?? 'Direction';
  const taux = (params[params.length - 1] ?? PAYROLL_PARAMETERS_SEED).congesJoursParMois;
  const [annee, setAnnee] = useState(() => { const d = new Date(); return d.getMonth() >= 9 ? d.getFullYear() + 1 : d.getFullYear(); });
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [form, setForm] = useState<Formulaire | null>(null);
  const [occupe, setOccupe] = useState(false);

  /* LA MÊME ÉQUIPE QUE LE PLANNING : qui n'est pas parti, quel que soit son contrat
     (une praticienne payée en prestataire a ses vacances comme les autres). */
  const equipe = useMemo(() => ordonneEquipe(staff.filter((m) => m.branchId === branch.id && !estPartie(m, new Date().toISOString().slice(0, 10)))), [staff, branch.id]);
  const conges = leaves as unknown as CongeLu[];
  const semaine = settings.hours ?? [];
  const exc = (exceptions ?? []) as { id?: string; date: string; staffId?: string; closed?: boolean; open?: string; close?: string }[];
  const periodesDe = (id: string) => periodesDeLAnnee({ conges, employeeId: id, annee, semaine, exceptions: exc });
  const debutAn = `${annee}-01-01`; const finAn = `${annee}-12-31`;
  const fermetures = useMemo(() => {
    const vus = new Map<string, { id: string; du: string; au: string; note?: string; n: number }>();
    for (const l of leaves) {
      if (!l.fermeture || l.startDate > finAn || l.endDate < debutAn) continue;
      const f = vus.get(l.fermeture) ?? { id: l.fermeture, du: l.startDate, au: l.endDate, note: l.reason, n: 0 };
      f.n += 1; vus.set(l.fermeture, f);
    }
    return [...vus.values()].sort((a, b) => a.du.localeCompare(b.du));
  }, [leaves, debutAn, finAn]);

  /* ── La fiche ── */
  const fiche = async (m: { id: string; name: string; since?: string }, tous: readonly CongeLu[], ranger: boolean, telecharger: boolean) => {
    const { fiche: f, nom } = ficheDeLAnnee({ m, annee, conges: tous, joursParMois: taux });
    if (telecharger) await telechargeLaFiche(f, nom);
    if (!ranger) return true;
    const ok = await rangeLaFiche(m.id, f, nom);
    if (ok) leaveStore.set((prev) => prev.map((x) => (x.employeeId === m.id && x.type === 'vacances' && x.startDate <= finAn && x.endDate >= debutAn ? { ...x, ficheLe: new Date().toISOString() } : x)));
    return ok;
  };

  /* ── Caler des vacances ── */
  const caler = async (f: Formulaire) => {
    const m = equipe.find((x) => x.id === f.staffId);
    if (!m) { alerte('Choisissez la personne.'); return; }
    const refus = pourquoiPasLaPeriode({ du: f.du, au: f.au, employeeId: m.id, conges });
    if (refus) { alerte(refus); return; }
    const jours = joursCalendaires(f.du, f.au);
    const l: LeaveRequest = {
      id: `lv-${uid()}`, employeeId: m.id, type: 'vacances', startDate: f.du, endDate: f.au, days: jours,
      status: 'approuve', decidedBy: par, decidedAt: new Date().toISOString(), branchId: branch.id,
      ...(f.note.trim() ? { reason: f.note.trim() } : {}),
    };
    setOccupe(true);
    try {
      leaveStore.set((prev) => [...prev, l]);
      planningStore.set((p) => poseLesVacances(p, m.id, f.du, f.au));
      setForm(null); setOuverte(m.id);
      const ok = await fiche(m, [...conges, l as unknown as CongeLu], true, false);
      toast(`Vacances calées pour ${m.name} : ${jours} jour${jours > 1 ? 's' : ''}, reprise le ${jourLong(repriseApres(f.au, semaine, exc))}.${ok ? ' Fiche rangée au dossier.' : ' La fiche n’a pas pu se ranger : touchez « Fiche PDF ».'}`);
    } finally { setOccupe(false); }
  };

  /* ── La fermeture de la Maison ── */
  const fermer = async (f: Formulaire) => {
    const refus = pourquoiPasLaPeriode({ du: f.du, au: f.au });
    if (refus) { alerte(refus); return; }
    const id = `fer-${uid()}`;
    const nouveaux = fermetureEnConges({ fermetureId: id, du: f.du, au: f.au, note: f.note, equipe, conges, branchId: branch.id, par, le: new Date().toISOString() }) as unknown as LeaveRequest[];
    const fermes = joursAFermer({ fermetureId: id, du: f.du, au: f.au, note: f.note, exceptions: exc });
    if (!await demande({
      quoi: 'Fermeture de la Maison',
      titre: `Fermer la Maison du ${jourLong(f.du)} au ${jourLong(f.au)} ?`,
      dit: `${joursCalendaires(f.du, f.au)} jours pour ${nouveaux.length} personne${nouveaux.length > 1 ? 's' : ''}, au planning et dans leur solde. La réservation en ligne ne propose pas ces jours.`,
      suite: nouveaux.length < equipe.length ? `${equipe.length - nouveaux.length} déjà en congé ces jours-là : rien de plus pour eux.` : undefined,
      accepter: 'Fermer la Maison',
      refuser: 'Pas encore',
    })) return;
    setOccupe(true);
    try {
      leaveStore.set((prev) => [...prev, ...nouveaux]);
      planningStore.set((p) => nouveaux.reduce((acc, l) => poseLesVacances(acc, l.employeeId, l.startDate, l.endDate), p));
      if (fermes.length) exceptionsHorairesStore.set((prev) => [...(prev ?? []), ...fermes]);
      setForm(null);
      const tous = [...conges, ...(nouveaux as unknown as CongeLu[])];
      let rangees = 0;
      for (const l of nouveaux) {
        const m = equipe.find((x) => x.id === l.employeeId);
        if (m && await fiche(m, tous, true, false)) rangees += 1;
      }
      toast(`La Maison est fermée du ${jourLong(f.du)} au ${jourLong(f.au)} : ${nouveaux.length} personne${nouveaux.length > 1 ? 's' : ''} au planning, ${rangees} fiche${rangees > 1 ? 's' : ''} rangée${rangees > 1 ? 's' : ''}.`);
    } finally { setOccupe(false); }
  };

  /* ── Retirer ── */
  const retirer = async (l: LeaveRequest) => {
    const groupe = l.fermeture ? leaves.filter((x) => x.fermeture === l.fermeture) : [l];
    if (!await demande({
      quoi: 'Vacances annuelles',
      titre: l.fermeture ? 'Retirer toute la fermeture de la Maison ?' : `Retirer ces vacances du ${jourLong(l.startDate)} au ${jourLong(l.endDate)} ?`,
      dit: l.fermeture
        ? `Pour les ${groupe.length} personnes, ces jours quittent le planning et le solde, et la réservation en ligne les propose de nouveau.`
        : 'Ces jours quittent le planning et le solde. La fiche déjà rangée reste au dossier : refaites-la avec « Fiche PDF ».',
      accepter: 'Retirer',
      refuser: 'Garder',
    })) return;
    const ids = new Set(groupe.map((x) => x.id));
    leaveStore.set((prev) => prev.filter((x) => !ids.has(x.id)));
    planningStore.set((p) => groupe.reduce((acc, x) => retireLesVacances(acc, x.employeeId, x.startDate, x.endDate), p));
    if (l.fermeture) exceptionsHorairesStore.set((prev) => (prev ?? []).filter((x) => !String(x.id ?? '').startsWith(`hx-${l.fermeture}-`)));
    toast('Retiré.');
  };

  /* ── La frise : une barre par personne, la fermeture en indigo ── */
  const pos = (iso: string) => Math.max(0, Math.min(100, (joursCalendaires(debutAn, iso) - 1) / joursCalendaires(debutAn, finAn) * 100));
  const larg = (du: string, au: string) => Math.max(0.5, joursCalendaires(du < debutAn ? debutAn : du, au > finAn ? finAn : au) / joursCalendaires(debutAn, finAn) * 100);

  const ouvreLeFormulaire = (genre: Formulaire['genre'], staffId = equipe[0]?.id ?? '') =>
    setForm({ genre, staffId, du: `${annee}-01-01` > new Date().toISOString().slice(0, 10) ? `${annee}-01-01` : new Date().toISOString().slice(0, 10), au: '', note: '' });

  const formulaire = form && (
    <div className="va-form" role="group" aria-label={form.genre === 'fermeture' ? 'Fermeture de la Maison' : 'Caler des vacances'}>
      <b>{form.genre === 'fermeture' ? 'Fermeture de la Maison, pour toute l’équipe' : 'Caler des vacances'}</b>
      <div className="va-form__ligne">
        {form.genre === 'vacances' && (
          <Field label="Pour qui">
            <Select value={form.staffId} onChange={(e) => setForm({ ...form, staffId: e.target.value })}>
              {equipe.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Premier jour"><ChampDeDate compact value={form.du} onChange={(iso) => setForm({ ...form, du: iso })} /></Field>
        <Field label="Dernier jour"><ChampDeDate compact value={form.au} onChange={(iso) => setForm({ ...form, au: iso })} /></Field>
        <Field label={form.genre === 'fermeture' ? 'Note (lue par les clientes)' : 'Note (facultative)'}>
          <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder={form.genre === 'fermeture' ? 'Fermeture annuelle' : ''} />
        </Field>
      </div>
      {form.du && form.au && form.au >= form.du && (
        <span className="va-doux">soit {joursCalendaires(form.du, form.au)} jours, reprise le {jourLong(repriseApres(form.au, semaine, exc))}</span>
      )}
      <div className="va-form__ligne">
        <Button variant="copper" disabled={occupe} onClick={() => void (form.genre === 'fermeture' ? fermer(form) : caler(form))}>
          {form.genre === 'fermeture' ? 'Fermer la Maison' : 'Caler et ranger la fiche'}
        </Button>
        <Button variant="ghost" onClick={() => setForm(null)}>Annuler</Button>
      </div>
    </div>
  );

  return (
    <div className="va">
      <div className="va-barre">
        <span className="va-annee">
          <Button size="sm" variant="ghost" onClick={() => setAnnee(annee - 1)} aria-label="Année d’avant">←</Button>
          <b>{annee}</b>
          <Button size="sm" variant="ghost" onClick={() => setAnnee(annee + 1)} aria-label="Année d’après">→</Button>
        </span>
        <span className="va-gestes">
          <Button size="sm" variant="ghost" onClick={() => ouvreLeFormulaire('fermeture')}>+ Fermeture de la Maison</Button>
          <Button size="sm" variant="copper" onClick={() => ouvreLeFormulaire('vacances')} disabled={equipe.length === 0}>+ Caler des vacances</Button>
        </span>
      </div>
      {formulaire}

      {fermetures.map((f) => (
        <div key={f.id} className="va-fermeture">
          <span><b>{f.note || 'Fermeture de la Maison'}</b> · du {jourLong(f.du)} au {jourLong(f.au)} inclus · {joursCalendaires(f.du, f.au)} jours pour {f.n} personne{f.n > 1 ? 's' : ''}</span>
          <button type="button" className="tre-link-btn tre-link-btn--danger" onClick={() => { const l = leaves.find((x) => x.fermeture === f.id); if (l) void retirer(l); }}>Retirer</button>
        </div>
      ))}

      <div className="va-frise" role="img" aria-label={`Les vacances de ${annee}, mois par mois`}>
        <div className="va-frise__mois"><span />{MOIS_COURTS.map((m) => <span key={m}>{m}</span>)}</div>
        {equipe.map((m) => (
          <div key={m.id} className="va-frise__ligne">
            <span className="va-frise__nom">{m.name.split(/\s+/)[0]}</span>
            <span className="va-frise__piste">
              {periodesDe(m.id).map((p) => (
                <span key={p.id} className={`va-bloc va-bloc--${p.genre}`} style={{ left: `${pos(p.du < debutAn ? debutAn : p.du)}%`, width: `${larg(p.du, p.au)}%` }} title={`du ${jourLong(p.du)} au ${jourLong(p.au)}`} />
              ))}
            </span>
          </div>
        ))}
      </div>
      <div className="va-legende"><span><i className="va-bloc--fermeture" />Fermeture de la Maison</span><span><i className="va-bloc--vacances" />Vacances</span><span><i className="va-bloc--conge" />Congé accordé</span></div>

      <div className="va-personnes">
        {equipe.map((m) => {
          const ps = periodesDe(m.id);
          const cales = totalDesJours(ps);
          const droit = droitDeLAnnee(m.since, annee, taux);
          const ouvert = ouverte === m.id;
          return (
            <div key={m.id} className="va-personne">
              <button type="button" aria-expanded={ouvert} onClick={() => setOuverte(ouvert ? null : m.id)}>
                <span className="va-qui"><b>{m.name}</b><small>{m.role}{ps.length ? ` · ${ps.length} période${ps.length > 1 ? 's' : ''}` : ' · rien de calé'}</small></span>
                <span className="va-compte"><span>droit <b>{droit}</b></span><span>calés <b>{cales}</b></span><span>reste <b>{Math.max(0, Math.round((droit - cales) * 10) / 10)}</b></span></span>
              </button>
              {ouvert && (
                <div className="va-detail">
                  {ps.length === 0 && <span className="va-doux">Rien de calé en {annee}.</span>}
                  {ps.map((p) => {
                    const l = leaves.find((x) => x.id === p.id);
                    return (
                      <div key={p.id} className="va-periode">
                        <span>{p.genre === 'fermeture' ? (p.note || 'Fermeture de la Maison') : p.genre === 'vacances' ? 'Vacances' : 'Congé accordé'}, du {jourLong(p.du)} au {jourLong(p.au)} inclus</span>
                        <span className="va-jours">{p.jours} jour{p.jours > 1 ? 's' : ''}</span>
                        <small>Reprise le {jourLong(p.reprise)}{l?.ficheLe ? ' · fiche rangée' : ''}</small>
                        {l && l.type === 'vacances' && <button type="button" className="tre-link-btn tre-link-btn--danger" onClick={() => void retirer(l)}>{l.fermeture ? 'Retirer la fermeture' : 'Retirer'}</button>}
                      </div>
                    );
                  })}
                  <div className="va-form__ligne">
                    <Button size="sm" variant="ghost" disabled={occupe} onClick={() => void fiche(m, conges, true, true).then((ok) => toast(ok ? 'Fiche téléchargée et rangée au dossier.' : 'Fiche téléchargée ; le dossier ne l’a pas prise.'))}>Fiche PDF</Button>
                    <Button size="sm" variant="ghost" onClick={() => ouvreLeFormulaire('vacances', m.id)}>+ Caler des vacances</Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {equipe.length === 0 && <span className="va-doux">Personne dans l’équipe de cet atelier.</span>}
      </div>
      <p className="va-doux">Les jours se comptent du premier au dernier inclus, dimanche et lundi compris. La reprise est le premier jour où la Maison est ouverte. Vacances et congés se décomptent du même solde de congés payés ({taux} j par mois de service).</p>
    </div>
  );
}
