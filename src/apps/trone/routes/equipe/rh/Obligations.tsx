import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Field, Input, Modal, Select, Textarea, toast } from '../../../../../ds/components';
import { useBranch } from '../../../../../shared/branches';
import { maisonEmployeur } from '../../../../../shared/identite';
import { nouvelleEcheance, echeancesDe } from '../../../../../shared/secretariat-admin';
import { useSecretariat } from '../../../../../shared/secretariat';
import {
  GARDE_DES_CANDIDATURES_MOIS, JOURS_COURTS, OBLIGATIONS, SMIG_MENSUEL_XOF, dateDite, dateDuMois, estPartie,
  type Accident, type ReglagesRh,
} from '../../../../../shared/rh-pur';
import { nouvelleLigneRh, retoucheRh, reglagesRhStore, useRegistreRh, useReglagesRh } from '../../../../../shared/rh';
import { fmtMoney } from '../../../../../shared/currency';
import { ordonneEquipe, useFonctions, useStaff, type StaffMember } from '../data';
import { aujourdhuiRh, useQuiEcrit } from './_ui';

/* ══ LES OBLIGATIONS ET LA SANTÉ — 14 octobre 2026 ════════════════════
   Le calendrier légal, les réglages du droit, l'aptitude et les accidents.
   LE TRÔNE NE TRANCHE JAMAIS UNE RÈGLE DE DROIT : chaque durée, chaque jour
   du mois est un réglage VIDE tant que le comptable ou un juriste ne l'a pas
   donné. Les sources lues le 14 octobre 2026 ne s'accordent pas toutes. */

const SOURCES = [
  { titre: 'Convention collective générale (WageIndicator)', url: 'https://wageindicator.org/fr-bj/travail-au-benin/convention-collective/benin---convention-collective-generale-du-travail' },
  { titre: 'Africarrières, types de contrats', url: 'https://africarrieres.com/benin/fr/guide/droit-du-travail/types-de-contrats' },
  { titre: 'Rivermate, congés au Bénin', url: 'https://rivermate.com/fr/guides/benin/conge' },
  { titre: 'Le SMIG de 2023 (WageIndicator)', url: 'https://wageindicator.org/salary/minimum-wage/minimum-wages-news/2023/minimum-wage-revised-in-benin-from-01-january-2023-june-23-2023' },
  { titre: 'Contrats et licenciements (WageIndicator)', url: 'https://wageindicator.org/fr-bj/travail-au-benin/droit-du-travail/contrats-et-licenciements' },
  { titre: 'Cour constitutionnelle, DCC 17-179', url: 'https://courconstitutionnelle.bj/files/decisions/DCC17-179_10_aout_2017.pdf' },
];

const nombreOuRien = (v: string): number | undefined => (v.trim() === '' ? undefined : Math.max(0, Number(v.replace(',', '.')) || 0));

export default function RhObligations() {
  const { branch, currency } = useBranch();
  const [reglages] = useReglagesRh();
  const [fonctions] = useFonctions();
  const [staff] = useStaff();
  const registre = useRegistreRh();
  const [lignesSec] = useSecretariat();
  const { moi } = useQuiEcrit();
  const jour = aujourdhuiRh();
  const [accident, setAccident] = useState(false);
  const accidents = registre.filter((l): l is Accident => l.genre === 'accident' && l.branchId === branch.id).sort((a, b) => b.le.localeCompare(a.le));
  const r = reglages ?? {};
  const regle = (patch: Partial<ReglagesRh>) => reglagesRhStore.set((prev) => ({ ...(prev ?? {}), ...patch }));
  const parFonction = (cle: 'essaiJours' | 'preavisJours', f: string, v: string) =>
    regle({ [cle]: { ...(r[cle] ?? {}), [f]: nombreOuRien(v) } } as Partial<ReglagesRh>);
  const echeances = echeancesDe(lignesSec);
  const poseALEcheancier = (titre: string, jourDuMois: number) => {
    if (echeances.some((e) => e.titre === titre && !e.terminee)) { toast('Elle est déjà à l’échéancier du Secrétariat.'); return; }
    const d = dateDuMois(jourDuMois, jour);
    if (!d) return;
    nouvelleEcheance({ branchId: branch.id, par: moi, titre, type: 'social', date: d, recurrence: 'mensuelle', prive: false });
    toast(`Posée à l’échéancier du Secrétariat, le ${dateDite(d)}, chaque mois.`);
  };

  return (
    <div className="sad-onglet">
      <div className="regles" style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))' }}>
        <div className="rh-etape">
          <h4>L’employeur</h4>
          <span>{maisonEmployeur()}</span>
          <Field label="Numéro employeur à la CNSS"><Input value={r.cnssEmployeur ?? ''} onChange={(e) => regle({ cnssEmployeur: e.target.value.trim() || undefined })} placeholder="à donner" /></Field>
          <p className="sad-doux">Le salaire minimum : {fmtMoney(SMIG_MENSUEL_XOF, currency)} par mois depuis le 1er janvier 2023. Un salaire de base en dessous se signale sur la fiche.</p>
        </div>
        <div className="rh-etape">
          <h4>Santé et sécurité</h4>
          <p className="sad-note">Aptitude médicale : apte ou pas, et sa date, sur chaque dossier. Jamais un diagnostic.</p>
          <p className="sad-note">{staff.filter((m) => m.branchId === branch.id && !estPartie(m, jour) && (m.contractType === 'CDI' || m.contractType === 'CDD') && !m.aptitude).length} salariée(s) sans aptitude posée.</p>
          <Button size="sm" variant="ghost" onClick={() => setAccident(true)}>+ Noter un accident du travail</Button>
        </div>
      </div>

      <p className="sad-mois">Le calendrier légal</p>
      <div className="sad-liste">
        {OBLIGATIONS.map((o) => {
          const v = o.reglage ? r[o.reglage] : undefined;
          const mensuelle = o.reglage === 'cnssJour' || o.reglage === 'itsJour';
          const d = mensuelle ? dateDuMois(v as number | undefined, jour) : undefined;
          return (
            <div key={o.cle} className="sad-ligne est-ouverte">
              <div className="sad-ligne__tete" style={{ cursor: 'default' }}>
                <span className="sad-ligne__num">{o.rythme}</span>
                <span className="sad-ligne__quoi"><b>{o.titre}</b><small>{o.note}</small></span>
                <span className={`sad-badge${v === undefined && o.reglage ? ' est-urgent' : ''}`}>{d ? `prochaine le ${dateDite(d)}` : o.reglage ? (v === undefined ? 'à confirmer' : 'réglé') : 'à vérifier'}</span>
              </div>
              {o.reglage && (
                <div className="sad-ligne__corps">
                  <div className="sad-ajout-ligne">
                    <Field label={mensuelle ? 'Le jour du mois' : o.reglage === 'accidentHeures' ? 'Délai, en heures' : 'Délai, en jours'}>
                      <Input inputMode="numeric" value={v === undefined ? '' : String(v)} onChange={(e) => regle({ [o.reglage as string]: nombreOuRien(e.target.value) } as Partial<ReglagesRh>)} placeholder="à confirmer" />
                    </Field>
                    {mensuelle && typeof v === 'number' && <Button size="sm" variant="ghost" onClick={() => poseALEcheancier(o.titre, v)}>Poser à l’échéancier du Secrétariat</Button>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="sad-mois">Les réglages du droit, par fonction</p>
      <div className="rh-cadre">
        <table className="rh-grille">
          <thead><tr><th>Fonction</th><th>Période d’essai (jours)</th><th>Préavis (jours)</th></tr></thead>
          <tbody>
            {fonctions.map((f) => (
              <tr key={f}>
                <td className="qui">{f}</td>
                <td><Input inputMode="numeric" value={r.essaiJours?.[f] === undefined ? '' : String(r.essaiJours[f])} onChange={(e) => parFonction('essaiJours', f, e.target.value)} placeholder="à confirmer" aria-label={`Essai, ${f}`} /></td>
                <td><Input inputMode="numeric" value={r.preavisJours?.[f] === undefined ? '' : String(r.preavisJours[f])} onChange={(e) => parFonction('preavisJours', f, e.target.value)} placeholder="à confirmer" aria-label={`Préavis, ${f}`} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="tr-grid tr-grid--3" style={{ gap: 12 }}>
        <Field label="Délai d’une demande d’explication (jours)"><Input inputMode="numeric" value={r.delaiExplicationJours === undefined ? '' : String(r.delaiExplicationJours)} onChange={(e) => regle({ delaiExplicationJours: nombreOuRien(e.target.value) })} placeholder="à confirmer" /></Field>
        <Field label="Une sanction sort du dossier après (mois)"><Input inputMode="numeric" value={r.sanctionSortApresMois === undefined ? '' : String(r.sanctionSortApresMois)} onChange={(e) => regle({ sanctionSortApresMois: nombreOuRien(e.target.value) })} placeholder="à confirmer" /></Field>
        <Field label={`Une candidature non retenue s’efface après (mois, proposé : ${GARDE_DES_CANDIDATURES_MOIS})`}><Input inputMode="numeric" value={r.candidatureGardeeMois === undefined ? '' : String(r.candidatureGardeeMois)} onChange={(e) => regle({ candidatureGardeeMois: nombreOuRien(e.target.value) })} placeholder={String(GARDE_DES_CANDIDATURES_MOIS)} /></Field>
      </div>
      <div className="tr-grid tr-grid--2" style={{ gap: 12 }}>
        <Field label="Une pause se note au planning au-delà de (heures au fauteuil)"><Input inputMode="numeric" value={r.seuilPauseHeures === undefined ? '' : String(r.seuilPauseHeures)} onChange={(e) => regle({ seuilPauseHeures: nombreOuRien(e.target.value) })} placeholder="à donner" /></Field>
        <Field label="Jours d’ouverture">
          <div className="sad-ajout-ligne">
            {JOURS_COURTS.map((j, i) => (
              <label key={j} className="sad-case"><input type="checkbox" checked={(r.joursOuverts ?? []).includes(i)} onChange={(e) => regle({ joursOuverts: e.target.checked ? [...(r.joursOuverts ?? []), i].sort() : (r.joursOuverts ?? []).filter((x) => x !== i) })} /> {j}</label>
            ))}
          </div>
        </Field>
      </div>
      <p className="sad-doux">Les congés payés se règlent dans les paramètres de paie (2 jours par mois aujourd’hui ; certaines sources disent 2,5 : <span className="rh-a-confirmer">à confirmer</span>).</p>

      {accidents.length > 0 && (
        <>
          <p className="sad-mois">Le registre des accidents du travail</p>
          <div className="sad-liste">
            {accidents.map((a) => (
              <div key={a.id} className="sad-ligne">
                <div className="sad-ligne__tete" style={{ cursor: 'default' }}>
                  <span className="sad-ligne__num">{dateDite(a.le)}</span>
                  <span className="sad-ligne__quoi"><b>{staff.find((m) => m.id === a.staffId)?.name ?? 'une fiche'}</b><small>{a.quoi}</small></span>
                  {a.declareLe ? <span className="sad-badge est-fait">déclaré le {dateDite(a.declareLe)}</span>
                    : <button type="button" className="sad-badge est-urgent" onClick={() => retoucheRh(a, { declareLe: jour })}>déclaré aujourd’hui</button>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="sad-doux">Sources lues le 14 octobre 2026 (aucune n’est le texte officiel ; le comptable ou un juriste tranche) : {SOURCES.map((s, i) => <span key={s.url}>{i ? ' · ' : ''}<a href={s.url} target="_blank" rel="noreferrer">{s.titre}</a></span>)}.</p>
      {accident && <NoterUnAccident equipe={ordonneEquipe(staff.filter((m) => m.branchId === branch.id && !estPartie(m, jour)))} branchId={branch.id} onClose={() => setAccident(false)} />}
    </div>
  );
}

function NoterUnAccident({ equipe, branchId, onClose }: { equipe: StaffMember[]; branchId: string; onClose: () => void }) {
  const { moi } = useQuiEcrit();
  const [staffId, setStaffId] = useState(equipe[0]?.id ?? '');
  const [le, setLe] = useState(aujourdhuiRh());
  const [quoi, setQuoi] = useState('');
  return createPortal(
    <Modal title="Un accident du travail" onClose={onClose} width={520}>
      <div className="sad-form">
        <div className="tr-grid tr-grid--2" style={{ gap: 12 }}>
          <Field label="Qui"><Select value={staffId} onChange={(e) => setStaffId(e.target.value)}>{equipe.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select></Field>
          <Field label="Le"><Input type="date" value={le} onChange={(e) => setLe(e.target.value)} /></Field>
        </div>
        <Field label="Ce qui s’est passé (les faits, pas un diagnostic)"><Textarea rows={3} value={quoi} onChange={(e) => setQuoi(e.target.value)} /></Field>
        <div className="sec-actions" style={{ justifyContent: 'flex-end' }}>
          <Button variant="copper" disabled={!staffId || !quoi.trim()} onClick={() => { nouvelleLigneRh<Accident>({ genre: 'accident', branchId, staffId, le, quoi: quoi.trim(), par: moi }); onClose(); }}>Noter</Button>
        </div>
      </div>
    </Modal>,
    document.body,
  );
}
