import { useMemo, useState } from 'react';
import { Button, Card, Field, Input, Modal, Select, toast, demande } from '../../../../ds/components';
import { ChampDeDate } from '../../../../ds/dates';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { useServices } from '../../../../shared/catalog';
import { useStaff as useMyStaff } from '../../../../shared/auth';
import { maisonNom, maisonVille } from '../../../../shared/identite';
import { facturePrestatairePdf } from '../../../../shared/pdf';
import { uid } from '../../../../shared/store';
import type { SignatureTracee } from '../../../../shared/contrats';
import { useBranchAppointments, useServicesById } from '../clients/_shared';
import { SignatureAuDoigt } from '../_contrat';
import { staffStore, useStaff, type StaffMember } from './data';
import { asArray, payrollRunsStore, usePayrollRuns, type PayrollRun } from './payroll';
import { Pill } from './ui';
import {
  ETAT_DE_FACTURE_MOT, aujourdhuiIso, ceQuiManqueAAccepter, ceQuiManqueASoumettre, compteDuMois, dateDite,
  dernierJourDuMois, echeanceDeLaFacture, enRetard, estPrestataire, factureDe, factureId, facturesPrestatairesStore,
  identiteProposee, jourCourtDit, libelleDeSemaine, moisDit, moisEcoule, nombreEnLettres, numeroPropose,
  prestatairesSansFactureAcceptee, reporteLaFactureDansLaPaie, sesPrestations, totalAccepte, useFacturesPrestataires,
  type CompteDeFacture, type ContexteDesPrestations, type EtatDeFacture, type FacturePrestataire,
  type IdentiteDuPrestataire, type LigneDeFacture, type PrestationSignalee,
} from './facture';

/* ══ LA FACTURE DU PRESTATAIRE · LES ÉCRANS — 13 septembre 2026 ═══════════
   Trois regards sur un même papier : celle qui la remplit (« Mon mois »), la
   direction qui la tranche (la paie), et la grille qu'on écrit sur la fiche.
   Le calcul vit dans `facture.ts`, jamais ici. */

const TON: Record<EtatDeFacture, 'ok' | 'warn' | 'error' | 'muted'> = {
  brouillon: 'muted', soumise: 'warn', acceptee: 'ok', refusee: 'error',
};

const enumere = (noms: string[]): string =>
  (noms.length <= 1 ? noms.join('') : `${noms.slice(0, -1).join(', ')} et ${noms[noms.length - 1]}`);

/** Le Carnet de la branche, le catalogue et l'équipe : ce dont le compte a besoin. */
export function useContexteDesPrestations(): ContexteDesPrestations {
  const { branch } = useBranch();
  const appts = useBranchAppointments();
  const byId = useServicesById();
  const [staff] = useStaff();
  const team = useMemo(() => staff.filter((m) => m.branchId === branch.id), [staff, branch.id]);
  return useMemo(() => ({ appts, byId, team, branchId: branch.id }), [appts, byId, team, branch.id]);
}

/* ---------- Le PDF ---------- */
export async function telechargeLaFacture(
  f: FacturePrestataire,
  o: { currency: string; ville?: string; lieu?: string },
): Promise<void> {
  const compte = f.etat === 'acceptee' && f.compteAccepte ? f.compteAccepte : f.compteSoumis;
  if (!compte) { toast('Cette facture n’a pas encore été soumise.'); return; }
  const argent = (n: number) => fmtMoney(n, o.currency);
  const emise = (f.signature?.at ?? f.soumiseLe ?? f.creeLe).slice(0, 10);
  try {
    await facturePrestatairePdf({
      houseName: maisonNom(),
      ville: o.ville,
      villeDuSiege: maisonVille(),
      numero: f.numero,
      emiseLe: dateDite(emise),
      periode: `du 1er au ${dateDite(dernierJourDuMois(f.mois))}`,
      sousTitre: compte.mode === 'forfait'
        ? `Forfait de prestations de soin de locks · ${moisDit(f.mois)}`
        : `Prestations de soin de locks · ${moisDit(f.mois)}`,
      prestataire: {
        nom: `${f.identite.prenoms} ${f.identite.nom.toLocaleUpperCase('fr')}`.trim(),
        ifu: f.identite.ifu, telephone: f.identite.telephone, email: f.identite.email,
      },
      destinataire: [maisonNom(), o.lieu ?? ''].filter((x) => x.trim()),
      semaines: compte.semaines.map((s) => ({
        libelle: libelleDeSemaine(s.debut, s.fin, { annee: true }), nombre: s.lignes.length, montant: argent(s.montantXof),
      })),
      auForfait: compte.mode === 'forfait',
      /* Un compte d'avant l'arbitrage portait le forfait en ligne à part. */
      forfait: compte.mode !== 'forfait' && compte.forfaitXof > 0
        ? { libelle: 'Forfait du mois', montant: argent(compte.forfaitXof) }
        : undefined,
      total: argent(compte.totalXof),
      totalEnLettres: o.currency === 'XOF'
        ? `Arrêtée à la somme de ${nombreEnLettres(compte.totalXof)} francs CFA.`
        : undefined,
      signature: { trace: f.signature?.signature ?? '', jourLisible: dateDite(emise) },
      acceptee: f.etat === 'acceptee' && f.accepteeLe
        ? `Acceptée par la direction le ${dateDite(f.accepteeLe.slice(0, 10))}.`
        : undefined,
      annexe: compte.semaines.filter((s) => s.lignes.length > 0).map((s) => ({
        titre: libelleDeSemaine(s.debut, s.fin),
        lignes: s.lignes.map((l) => ({
          jour: jourCourtDit(l.date),
          libelle: `${l.libelle}${l.signaleeId ? ' (signalée)' : ''}`,
          montant: l.prixXof === null ? 'prix à écrire' : argent(l.prixXof),
          aEcrire: l.prixXof === null,
        })),
      })),
      filename: `facture-${f.numero || f.id}.pdf`,
    });
  } catch {
    toast('Le PDF n’a pas pu être produit.');
  }
}

/* ---------- Les semaines ---------- */
function PrixAEcrire({ onEcrit }: { onEcrit: (prix: number) => void }) {
  const [v, setV] = useState('');
  const ecrire = () => {
    if (v.trim() === '') return;
    onEcrit(Math.max(0, parseInt(v, 10) || 0));
    setV('');
  };
  return (
    <span className="tre-fp-prix">
      <Input
        inputMode="numeric"
        value={v}
        onChange={(e) => setV(e.target.value.replace(/[^0-9]/g, ''))}
        onKeyDown={(e) => { if (e.key === 'Enter') ecrire(); }}
        placeholder="son prix"
        aria-label="Le prix à écrire"
        style={{ width: 96, textAlign: 'right' }}
      />
      <button type="button" className="tre-link-btn" onClick={ecrire} disabled={v.trim() === ''}>Écrire</button>
    </span>
  );
}

/** UNE LIGNE PAR SEMAINE, qui se déplie sur ses prestations. Les noms des
    clientes n'y paraissent jamais : une facture circule, un Carnet non. */
export function SemainesDeLaFacture({ compte, ecritLePrix, retireSignalee }: {
  compte: CompteDeFacture;
  /** La direction écrit ici un prix manquant. */
  ecritLePrix?: (l: LigneDeFacture, prix: number) => void;
  retireSignalee?: (id: string) => void;
}) {
  const { currency } = useBranch();
  const argent = (n: number) => fmtMoney(n, currency);
  /* AU FORFAIT, RIEN NE SE DÉPLIE : quatre semaines égales, aucune prestation
     à compter ni à signaler. */
  if (compte.mode === 'forfait') {
    return (
      <div className="tre-fp-semaines">
        {compte.semaines.map((s) => (
          <div key={s.debut} className="tre-fp-ligne">
            <span>{libelleDeSemaine(s.debut, s.fin)}</span>
            <b>{argent(s.montantXof)}</b>
          </div>
        ))}
        <div className="tre-fp-total">
          <span>Total du mois<small>le forfait convenu au contrat, en quatre semaines</small></span>
          <b>{argent(compte.totalXof)}</b>
        </div>
      </div>
    );
  }
  return (
    <div className="tre-fp-semaines">
      {compte.semaines.map((s) => (
        <details key={s.debut} className="tre-fp-semaine">
          <summary>
            <span className="tre-fp-jours">{libelleDeSemaine(s.debut, s.fin)}</span>
            <span className="tre-fp-nb">
              {s.lignes.length === 0 ? 'aucune prestation' : `${s.lignes.length} prestation${s.lignes.length > 1 ? 's' : ''}`}
              {s.prixManquants > 0 && <span className="tre-fp-aprix"> · {s.prixManquants} prix à écrire</span>}
            </span>
            <span className={`tre-fp-montant ${s.prixManquants > 0 ? 'is-provisoire' : ''}`}>{argent(s.montantXof)}</span>
          </summary>
          {s.lignes.length > 0 && (
            <div className="tre-fp-detail">
              <table>
                <tbody>
                  {s.lignes.map((l, i) => (
                    <tr key={`${l.rdvId ?? l.signaleeId ?? ''}-${l.serviceId ?? ''}-${i}`}>
                      <td className="tre-fp-jour">{jourCourtDit(l.date)}</td>
                      <td>
                        {l.libelle}
                        {l.signaleeId && (
                          <span className="mnd-muted">
                            {' '}· signalée
                            {retireSignalee && (
                              <>
                                {' '}·{' '}
                                <button type="button" className="tre-link-btn" onClick={() => retireSignalee(l.signaleeId!)}>retirer</button>
                              </>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="num">
                        {l.prixXof !== null
                          ? argent(l.prixXof)
                          : ecritLePrix
                            ? <PrixAEcrire onEcrit={(p) => ecritLePrix(l, p)} />
                            : <span className="tre-fp-aprix">prix à écrire</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </details>
      ))}
      {compte.forfaitXof > 0 && (
        <div className="tre-fp-ligne">
          <span>Forfait du mois<small>le montant convenu sur la fiche</small></span>
          <b>{argent(compte.forfaitXof)}</b>
        </div>
      )}
      <div className="tre-fp-total">
        <span>
          Total du mois
          {compte.prixManquants > 0 && (
            <small>provisoire : {compte.prixManquants} prix à écrire par la direction</small>
          )}
        </span>
        <b>{argent(compte.totalXof)}</b>
      </div>
    </div>
  );
}

/* ══ MA FACTURE — dans « Mon mois » ════════════════════════════════════ */
const moisAvant = (mois: string, n: number): string => {
  const [a, m] = mois.split('-').map(Number);
  const d = new Date(a, m - 1 - n, 1, 12);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export function MaFacture({ moi, auteurId, rattacheeParAdresse, estDirection }: {
  moi: StaffMember;
  auteurId?: string;
  /** Sa fiche est-elle retrouvée par l'adresse de son compte ? La base
      l'exige pour enregistrer (migration 0090). */
  rattacheeParAdresse: boolean;
  estDirection: boolean;
}) {
  const [factures] = useFacturesPrestataires();
  const jour = aujourdhuiIso();
  const [mois, setMois] = useState(() => moisEcoule(jour));
  const choix = useMemo(() => Array.from({ length: 6 }, (_, i) => moisAvant(jour.slice(0, 7), i + 1)), [jour]);
  const enregistree = factureDe(factures, moi.id, mois);
  const precedente = factures
    .filter((f) => f.staffId === moi.id && f.mois < mois)
    .sort((a, b) => b.mois.localeCompare(a.mois))[0];
  const echeance = echeanceDeLaFacture(mois);

  return (
    <Card style={{ marginTop: 14, padding: '16px 18px' }}>
      <div className="tre-rates__head">
        <span className="tre-rates__title">Ma facture · {moisDit(mois)}</span>
        <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Pill tone={enregistree ? TON[enregistree.etat] : 'muted'}>
            {enregistree ? ETAT_DE_FACTURE_MOT[enregistree.etat] : 'À préparer'}
          </Pill>
          <span className="mnd-muted" style={{ fontSize: 12 }}>
            {enregistree?.etat === 'acceptee'
              ? 'son total entre dans votre paie'
              : `à soumettre avant le ${dateDite(echeance)}`}
          </span>
          <Select value={mois} onChange={(e) => setMois(e.target.value)} aria-label="Le mois de la facture" style={{ width: 'auto' }}>
            {choix.map((m) => <option key={m} value={m}>{moisDit(m)}</option>)}
          </Select>
        </span>
      </div>

      {enRetard(enregistree, mois, jour) && (
        <div className="tre-inline-note" style={{ marginTop: 12 }}>
          <span className="mark">!</span>
          <span>La date du {dateDite(echeance)} est passée. Soumettez la facture dès que possible : votre paie l’attend.</span>
        </div>
      )}
      {!rattacheeParAdresse && !estDirection && (
        <div className="tre-inline-note" style={{ marginTop: 12 }}>
          <span className="mark">!</span>
          <span>
            Votre facture ne pourra pas s’enregistrer : l’adresse de votre compte n’est pas inscrite sur votre fiche.
            Demandez au gérant de l’écrire dans Personnel &amp; paie, « E-mail de connexion ».
          </span>
        </div>
      )}

      <FactureDuMois
        key={`${mois}:${enregistree?.etat ?? 'neuve'}`}
        moi={moi}
        mois={mois}
        enregistree={enregistree}
        precedente={precedente?.identite}
        auteurId={auteurId}
      />
    </Card>
  );
}

function FactureDuMois({ moi, mois, enregistree, precedente, auteurId }: {
  moi: StaffMember;
  mois: string;
  enregistree?: FacturePrestataire;
  precedente?: IdentiteDuPrestataire;
  auteurId?: string;
}) {
  const { branch, currency } = useBranch();
  const ctx = useContexteDesPrestations();
  const [services] = useServices();
  const editable = !enregistree || enregistree.etat === 'brouillon' || enregistree.etat === 'refusee';
  const depart = enregistree?.identite ?? identiteProposee(moi, precedente);
  const [identite, setIdentite] = useState<IdentiteDuPrestataire>(depart);
  const [numero, setNumero] = useState(() => enregistree?.numero || numeroPropose(depart, mois));
  const [signalees, setSignalees] = useState<PrestationSignalee[]>(() => enregistree?.signalees ?? []);
  const [trace, setTrace] = useState('');
  const [signal, setSignal] = useState<{ date: string; serviceId: string; libelle: string } | null>(null);

  const lesSignalees = editable ? signalees : (enregistree?.signalees ?? []);
  const compte = useMemo(
    () => (enregistree?.etat === 'acceptee' && enregistree.compteAccepte
      ? enregistree.compteAccepte
      : compteDuMois(moi, mois, lesSignalees, ctx)),
    [enregistree, moi, mois, lesSignalees, ctx],
  );
  const auForfait = compte.mode === 'forfait';
  const catalogue = useMemo(() => [...services].sort((a, b) => a.name.localeCompare(b.name, 'fr')), [services]);

  /* L'ÉCRITURE — brouillon ou soumission, un seul chemin. */
  const ecris = (etat: 'brouillon' | 'soumise', o: { signalees?: PrestationSignalee[]; signature?: SignatureTracee } = {}) => {
    const maintenant = new Date().toISOString();
    const sg = o.signalees ?? signalees;
    const f: FacturePrestataire = {
      id: factureId(mois, moi.id),
      branchId: moi.branchId,
      staffId: moi.id,
      mois,
      auteurId: auteurId ?? enregistree?.auteurId,
      numero: numero.trim(),
      identite: {
        nom: identite.nom.trim(), prenoms: identite.prenoms.trim(), telephone: identite.telephone.trim(),
        email: identite.email.trim(), ifu: identite.ifu.replace(/\s/g, ''),
      },
      signalees: sg,
      etat,
      signature: etat === 'soumise' ? o.signature : undefined,
      soumiseLe: etat === 'soumise' ? maintenant : undefined,
      compteSoumis: etat === 'soumise' ? compteDuMois(moi, mois, sg, ctx) : undefined,
      refus: enregistree?.refus,
      creeLe: enregistree?.creeLe ?? maintenant,
      modifieeLe: maintenant,
    };
    facturesPrestatairesStore.set((prev) => (prev.some((x) => x.id === f.id)
      ? prev.map((x) => (x.id === f.id ? f : x))
      : [...prev, f]));
  };

  const soumettre = async () => {
    const signature: SignatureTracee = {
      at: aujourdhuiIso(),
      signePar: `${identite.prenoms.trim()} ${identite.nom.trim()}`.trim(),
      signature: trace,
      version: `facture ${mois}`,
    };
    const manque = ceQuiManqueASoumettre({ identite, numero, signature });
    if (manque) { toast(manque); return; }
    if (!await demande({
      quoi: 'Votre facture',
      titre: `Soumettre votre facture de ${moisDit(mois)} ?`,
      dit: `Total${compte.prixManquants ? ' provisoire' : ''} : ${fmtMoney(compte.totalXof, currency)}.`,
      suite: 'La direction l’accepte, ou vous la renvoie avec un mot.',
      accepter: 'Soumettre la facture',
      refuser: 'La garder en brouillon',
    })) return;
    ecris('soumise', { signature });
    toast('Facture soumise.');
  };

  const reprendre = async () => {
    if (!enregistree) return;
    if (!await demande({
      quoi: 'Facture soumise',
      titre: 'Reprendre votre facture ?',
      dit: 'Elle repasse en brouillon, et il faudra la signer à nouveau.',
      accepter: 'Reprendre la facture',
      refuser: 'La laisser soumise',
      dur: true,
    })) return;
    facturesPrestatairesStore.set((prev) => prev.map((x) => (x.id === enregistree.id
      ? {
        ...x, etat: 'brouillon', signature: undefined, soumiseLe: undefined, compteSoumis: undefined,
        auteurId: auteurId ?? x.auteurId, modifieeLe: new Date().toISOString(),
      }
      : x)));
  };

  /* UNE PRESTATION OUBLIÉE se signale, et s'enregistre aussitôt : la perdre
     parce qu'on a oublié « Enregistrer » la ferait oublier deux fois. */
  const ajouteSignalee = () => {
    if (!signal) return;
    if (!signal.date || signal.date.slice(0, 7) !== mois) { toast(`Choisissez un jour de ${moisDit(mois)}.`); return; }
    const sv = services.find((s) => s.id === signal.serviceId);
    const libelle = sv ? sv.name : signal.libelle.trim();
    if (!libelle) { toast('Dites quelle prestation vous avez faite.'); return; }
    const n = [...signalees, { id: `sg-${uid()}`, date: signal.date, serviceId: sv?.id, libelle }];
    setSignalees(n);
    setSignal(null);
    ecris('brouillon', { signalees: n });
    toast('Prestation signalée. Si son prix manque, la direction l’écrira.');
  };
  const retireSignalee = (id: string) => {
    const n = signalees.filter((s) => s.id !== id);
    setSignalees(n);
    ecris('brouillon', { signalees: n });
  };

  const champ = (k: keyof IdentiteDuPrestataire, label: string, o: { inputMode?: 'tel' | 'email' | 'numeric'; aide?: string } = {}) => (
    <Field label={label}>
      <Input
        value={identite[k]}
        disabled={!editable}
        inputMode={o.inputMode}
        onChange={(e) => setIdentite({
          ...identite,
          [k]: k === 'ifu' ? e.target.value.replace(/[^0-9 ]/g, '').slice(0, 16) : e.target.value,
        })}
      />
      {o.aide && <div className="mnd-muted" style={{ fontSize: 11, marginTop: 4 }}>{o.aide}</div>}
    </Field>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
      {enregistree?.refus && editable && (
        <div className="tre-inline-note">
          <span className="mark">!</span>
          <span>
            <b>La direction vous l’a renvoyée</b> le {dateDite(enregistree.refus.le.slice(0, 10))} :
            {' '}« {enregistree.refus.mot} ». Corrigez, signez et soumettez à nouveau.
          </span>
        </div>
      )}

      <div className="tr-grid tr-grid--3">
        {champ('nom', 'Nom')}
        {champ('prenoms', 'Prénoms')}
        {champ('telephone', 'Téléphone', { inputMode: 'tel' })}
        {champ('email', 'E-mail', { inputMode: 'email' })}
        {champ('ifu', 'IFU', { inputMode: 'numeric', aide: '13 chiffres, obligatoire pour soumettre.' })}
        <Field label="N° de facture">
          <Input value={numero} disabled={!editable} onChange={(e) => setNumero(e.target.value)} />
        </Field>
      </div>

      <div className="mnd-muted" style={{ fontSize: 12, lineHeight: 1.55 }}>
        {auForfait
          ? 'Votre forfait du mois, convenu au contrat, en quatre semaines égales. Il ne dépend pas du nombre de prestations ; un bonus se verse à part, dans la paie.'
          : 'Une ligne par semaine, du mardi au samedi. Chaque semaine se déplie sur ses prestations, prises dans le Carnet, au prix de votre grille. Un geste fait à plusieurs mains compte pour chacune.'}
      </div>
      <SemainesDeLaFacture compte={compte} retireSignalee={editable ? retireSignalee : undefined} />

      {editable && !auForfait && (signal ? (
        <div className="tre-fp-signal">
          <Field label="Le jour">
            <ChampDeDate
              compact
              value={signal.date}
              onChange={(iso) => setSignal({ ...signal, date: iso })}
              min={`${mois}-01`}
              max={dernierJourDuMois(mois)}
              anneeParDefaut={Number(mois.slice(0, 4))}
              ariaLabel="Le jour de la prestation"
            />
          </Field>
          <Field label="La prestation">
            <Select value={signal.serviceId} onChange={(e) => setSignal({ ...signal, serviceId: e.target.value })}>
              <option value="">Autre, je l’écris</option>
              {catalogue.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          {!signal.serviceId && (
            <Field label="Ce que vous avez fait">
              <Input value={signal.libelle} onChange={(e) => setSignal({ ...signal, libelle: e.target.value })} />
            </Field>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <Button variant="ghost" size="sm" onClick={() => setSignal(null)}>Annuler</Button>
            <Button variant="copper" size="sm" onClick={ajouteSignalee}>Signaler</Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="tre-link-btn"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => setSignal({ date: '', serviceId: '', libelle: '' })}
        >
          + Signaler une prestation oubliée
        </button>
      ))}

      {editable && (
        <>
          <SignatureAuDoigt trace={trace} onTrace={setTrace} titre="Votre signature · au doigt" invite="Signez ici avant de soumettre." />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <Button variant="ghost" size="sm" onClick={() => { ecris('brouillon'); toast('Brouillon enregistré.'); }}>
              Enregistrer le brouillon
            </Button>
            <Button variant="copper" size="sm" onClick={soumettre}>Signer et soumettre</Button>
          </div>
        </>
      )}

      {enregistree?.etat === 'soumise' && (
        <div className="tre-fp-etat">
          <span>
            Soumise le {dateDite((enregistree.soumiseLe ?? enregistree.creeLe).slice(0, 10))}. La direction la relit :
            elle l’accepte, ou vous la renvoie avec un mot.
          </span>
          <span style={{ display: 'inline-flex', gap: 12 }}>
            <button type="button" className="tre-link-btn" onClick={() => void telechargeLaFacture(enregistree, { currency, ville: branch.city, lieu: [branch.name, branch.city].filter(Boolean).join(' · ') })}>
              Mon exemplaire
            </button>
            <button type="button" className="tre-link-btn" onClick={reprendre}>Reprendre ma facture</button>
          </span>
        </div>
      )}
      {enregistree?.etat === 'acceptee' && (
        <div className="tre-fp-etat is-acceptee">
          <span>
            Acceptée le {dateDite((enregistree.accepteeLe ?? enregistree.creeLe).slice(0, 10))}. Son total,
            {' '}{fmtMoney(compte.totalXof, currency)}, entre dans votre paie.
          </span>
          <button type="button" className="tre-link-btn" onClick={() => void telechargeLaFacture(enregistree, { currency, ville: branch.city, lieu: [branch.name, branch.city].filter(Boolean).join(' · ') })}>
            Télécharger le PDF
          </button>
        </div>
      )}
    </div>
  );
}

/* ══ LA DIRECTION TRANCHE — depuis la paie ═════════════════════════════ */
export function FactureDeLaDirection({ membre, mois, onClose }: { membre: StaffMember; mois: string; onClose: () => void }) {
  const { branch, currency } = useBranch();
  const [factures] = useFacturesPrestataires();
  const [runs] = usePayrollRuns();
  const [staff] = useStaff();
  const me = useMyStaff();
  const ctx = useContexteDesPrestations();
  /* LA FICHE VIVANTE, pas celle du clic : un prix écrit dans la grille doit
     paraître aussitôt sur la ligne. */
  const m = staff.find((x) => x.id === membre.id) ?? membre;
  const f = factureDe(factures, m.id, mois);
  const vivant = useMemo(() => compteDuMois(m, mois, f?.signalees ?? [], ctx), [m, mois, f?.signalees, ctx]);
  const compte = f?.etat === 'acceptee' && f.compteAccepte ? f.compteAccepte : vivant;
  const [mot, setMot] = useState<string | null>(null);
  const argent = (n: number) => fmtMoney(n, currency);
  const qui = me?.name?.trim() || 'La direction';
  const lieu = [branch.name, branch.city].filter(Boolean).join(' · ');

  const pose = (patch: Partial<FacturePrestataire>) => {
    if (!f) return;
    facturesPrestatairesStore.set((prev) => prev.map((x) => (x.id === f.id
      ? { ...x, ...patch, modifieeLe: new Date().toISOString() } : x)));
  };

  /* UN PRIX ÉCRIT ICI ENTRE DANS SA GRILLE, et vaut pour les mois suivants.
     Une prestation hors catalogue n'a pas de grille : son prix reste sur la
     facture. */
  const ecritLePrix = (l: LigneDeFacture, prix: number) => {
    if (l.serviceId) {
      const sid = l.serviceId;
      staffStore.set((prev) => prev.map((x) => (x.id === m.id ? { ...x, grille: { ...(x.grille ?? {}), [sid]: prix } } : x)));
      toast(`Prix écrit dans la grille de ${m.name}, il vaudra aussi les mois suivants.`);
      return;
    }
    if (l.signaleeId && f) {
      pose({ signalees: f.signalees.map((s) => (s.id === l.signaleeId ? { ...s, prixXof: prix } : s)) });
      toast('Prix écrit sur la facture.');
    }
  };

  const accepter = async () => {
    if (!f) return;
    const manque = ceQuiManqueAAccepter(vivant);
    if (manque) { toast(manque); return; }
    if (!await demande({
      quoi: 'Acceptation',
      titre: `Accepter la facture de ${m.name} pour ${moisDit(mois)} ?`,
      dit: `Total ${argent(vivant.totalXof)}. Ce total entrera dans sa paie, sans CNSS ni ITS.`,
      scelle: 'Elle ne se modifiera plus.',
      accepter: 'Accepter la facture',
      refuser: 'La laisser en attente',
    })) return;
    const maintenant = new Date().toISOString();
    /* LE COMPTE SE FIGE ICI, recalculé sur CE poste depuis le Carnet et la
       grille : on ne paie pas le chiffre écrit par un autre poste. */
    const acceptee: FacturePrestataire = {
      ...f, etat: 'acceptee', compteAccepte: vivant, accepteeLe: maintenant, accepteePar: qui,
      refus: undefined, modifieeLe: maintenant,
    };
    facturesPrestatairesStore.set((prev) => prev.map((x) => (x.id === f.id ? acceptee : x)));
    payrollRunsStore.set((prev) => reporteLaFactureDansLaPaie(prev, acceptee));
    toast('Facture acceptée. Son total entre dans la paie du mois.');
  };

  const refuser = () => {
    if (!f) return;
    if (!mot?.trim()) { toast('Écrivez un mot pour dire ce qui ne va pas.'); return; }
    pose({ etat: 'refusee', refus: { le: new Date().toISOString(), par: qui, mot: mot.trim() }, signature: undefined, soumiseLe: undefined });
    setMot(null);
    toast('Facture renvoyée avec votre mot.');
  };

  /* ROUVRIR, tant que la paie du mois n'est pas validée. Après, ce qui est
     payé est payé : une correction passe par le mois suivant. */
  const paieEngagee = asArray(runs).some((r) => r.period === mois && r.status !== 'brouillon'
    && (!r.branchId || r.branchId === m.branchId)
    && asArray(r.lines).some((l) => l.employeeId === m.id));
  const rouvrir = async () => {
    if (!f) return;
    if (paieEngagee) { toast('La paie de ce mois est déjà validée : la facture ne se rouvre plus.'); return; }
    if (!await demande({
      quoi: 'Facture acceptée',
      titre: 'Rouvrir cette facture ?',
      dit: 'Elle redevient « soumise » et pourra être modifiée.',
      suite: 'La paie du mois ne se validera plus tant qu’elle n’est pas acceptée à nouveau.',
      accepter: 'Rouvrir la facture',
      refuser: 'La laisser acceptée',
      dur: true,
    })) return;
    pose({ etat: 'soumise', compteAccepte: undefined, accepteeLe: undefined, accepteePar: undefined });
  };

  const manque = ceQuiManqueAAccepter(vivant);

  return (
    <Modal title={`Facture · ${m.name} · ${moisDit(mois)}`} onClose={onClose} width={780}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Pill tone={f ? TON[f.etat] : 'error'}>{f ? ETAT_DE_FACTURE_MOT[f.etat] : 'Non soumise'}</Pill>
          <span className="mnd-muted" style={{ fontSize: 12 }}>
            {f?.etat === 'soumise' && f.compteSoumis && `Soumise le ${dateDite((f.soumiseLe ?? f.creeLe).slice(0, 10))} pour ${argent(f.compteSoumis.totalXof)}`}
            {f?.etat === 'acceptee' && `Acceptée le ${dateDite((f.accepteeLe ?? f.creeLe).slice(0, 10))}${f.accepteePar ? ` par ${f.accepteePar}` : ''}`}
            {(!f || f.etat === 'brouillon' || f.etat === 'refusee') && `Attendue avant le ${dateDite(echeanceDeLaFacture(mois))}`}
          </span>
        </div>

        {(!f || f.etat === 'brouillon' || f.etat === 'refusee') && (
          <div className="tre-inline-note">
            <span className="mark">!</span>
            <span>
              {!f && `${m.name} n’a pas encore préparé sa facture. `}
              {f?.etat === 'brouillon' && `La facture est encore en brouillon chez ${m.name}. `}
              {f?.etat === 'refusee' && `Renvoyée le ${dateDite((f.refus?.le ?? f.creeLe).slice(0, 10))} : « ${f.refus?.mot ?? ''} ». `}
              {vivant.mode === 'forfait'
                ? 'Voici son forfait du mois, en quatre semaines.'
                : 'Voici ce que le Carnet et sa grille donnent aujourd’hui.'}
            </span>
          </div>
        )}

        {f && (
          <div className="tre-fp-parties">
            <div>
              <div className="tre-sec-label">La prestataire</div>
              <b>{f.identite.prenoms} {f.identite.nom.toLocaleUpperCase('fr')}</b>
              <div>IFU {f.identite.ifu || '·'}</div>
              <div>{f.identite.telephone || '·'}</div>
              <div>{f.identite.email || '·'}</div>
            </div>
            <div>
              <div className="tre-sec-label">La facture</div>
              <div>N° {f.numero || '·'}</div>
              {f.signature?.signature && <img src={f.signature.signature} alt="Sa signature" className="tre-fp-signature" />}
            </div>
          </div>
        )}

        {f?.etat === 'soumise' && f.compteSoumis && f.compteSoumis.totalXof !== vivant.totalXof && (
          <div className="mnd-muted" style={{ fontSize: 12, lineHeight: 1.55 }}>
            Le compte a bougé depuis la soumission, par un prix écrit, un Carnet corrigé ou un forfait changé sur la fiche : c’est le compte
            ci-dessous, {argent(vivant.totalXof)}, qui sera accepté.
          </div>
        )}

        <SemainesDeLaFacture compte={compte} ecritLePrix={f?.etat === 'soumise' ? ecritLePrix : undefined} />

        {f?.etat === 'soumise' && (mot === null ? (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
            {manque && <span className="mnd-muted" style={{ fontSize: 12 }}>{manque}</span>}
            <button type="button" className="tre-link-btn" onClick={() => void telechargeLaFacture(f, { currency, ville: branch.city, lieu })}>
              Aperçu du PDF
            </button>
            <Button variant="ghost" size="sm" onClick={() => setMot('')}>Refuser avec un mot</Button>
            <Button variant="copper" size="sm" disabled={!!manque} onClick={accepter}>Accepter</Button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Field label="Ce qui ne va pas">
              <textarea
                className="mnd-input"
                rows={3}
                value={mot}
                onChange={(e) => setMot(e.target.value)}
                style={{ width: '100%', resize: 'vertical' }}
              />
            </Field>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <Button variant="ghost" size="sm" onClick={() => setMot(null)}>Annuler</Button>
              <Button variant="copper" size="sm" onClick={refuser}>Renvoyer la facture</Button>
            </div>
          </div>
        ))}

        {f?.etat === 'acceptee' && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
            {!paieEngagee && <button type="button" className="tre-link-btn" onClick={rouvrir}>Rouvrir</button>}
            <Button variant="copper" size="sm" onClick={() => void telechargeLaFacture(f, { currency, ville: branch.city, lieu })}>
              Télécharger le PDF
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ══ LES FACTURES DU RUN — dans le détail d'une paie ═══════════════════ */
export function FacturesDuRun({ run, onOuvre }: { run: PayrollRun; onOuvre: (m: StaffMember) => void }) {
  const { currency } = useBranch();
  const [factures] = useFacturesPrestataires();
  const [staff] = useStaff();
  const ctx = useContexteDesPrestations();
  const parId = useMemo(() => new Map(staff.map((m) => [m.id, m])), [staff]);
  const lignes = asArray(run.lines).filter((l) => l.prestataire || estPrestataire(parId.get(l.employeeId)));
  if (lignes.length === 0) return null;
  const bloquantes = prestatairesSansFactureAcceptee(run.lines, run.period, staff, factures);
  const jour = aujourdhuiIso();

  return (
    <div style={{ marginTop: 14 }}>
      {run.status === 'brouillon' && bloquantes.length > 0 && (
        <div className="tre-inline-note" style={{ marginBottom: 12 }}>
          <span className="mark">!</span>
          <span>
            <b>La paie ne se valide pas encore :</b>{' '}
            {bloquantes.length === 1
              ? `${bloquantes[0].name} n’a pas de facture acceptée.`
              : `${bloquantes.length} prestataires n’ont pas de facture acceptée, ${enumere(bloquantes.map((l) => l.name))}.`}
          </span>
        </div>
      )}
      <div className="tre-sec-label" style={{ marginBottom: 8 }}>Les factures des prestataires · {moisDit(run.period)}</div>
      <div className="mnd-scroll-x">
        <table className="tre-table">
          <thead><tr><th>Personne</th><th>Facture</th><th className="num">Total</th><th /></tr></thead>
          <tbody>
            {lignes.map((l) => {
              const f = factureDe(factures, l.employeeId, run.period);
              const m = parId.get(l.employeeId);
              const vivant = m && f?.etat === 'soumise' ? compteDuMois(m, run.period, f.signalees, ctx) : undefined;
              const total = totalAccepte(f) ?? vivant?.totalXof;
              const sous = !f
                ? (enRetard(f, run.period, jour) ? 'en retard, attendue avant le 5' : 'pas encore préparée')
                : f.etat === 'brouillon' ? (enRetard(f, run.period, jour) ? 'en brouillon, en retard' : 'en brouillon chez elle')
                  : f.etat === 'refusee' ? 'renvoyée, à corriger'
                    : f.etat === 'soumise' ? (vivant?.prixManquants ? `${vivant.prixManquants} prix à écrire` : 'prête à trancher')
                      : 'son total est dans la paie';
              return (
                <tr key={l.employeeId}>
                  <td>{l.name}</td>
                  <td>
                    <Pill tone={f ? TON[f.etat] : 'error'}>{f ? ETAT_DE_FACTURE_MOT[f.etat] : 'Non soumise'}</Pill>
                    <div className="mnd-muted" style={{ fontSize: 11, marginTop: 3 }}>{sous}</div>
                  </td>
                  <td className="num">{total !== undefined ? fmtMoney(total, currency) : '·'}</td>
                  <td style={{ textAlign: 'right' }}>
                    {m && (
                      <button type="button" className="tre-link-btn" onClick={() => onOuvre(m)}>
                        {f?.etat === 'soumise' ? (vivant?.prixManquants ? 'Écrire les prix' : 'Trancher') : 'Ouvrir la facture'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ══ SA GRILLE DE PRIX — sur la fiche du personnel ═════════════════════
   « C'est moi qui écris le prix. » En tête, ce qu'elle a réellement fait ces
   trois derniers mois ; le reste s'ajoute depuis le catalogue. */
export function GrilleDePrix({ staffId, valeur, onChange, lectureSeule = false }: {
  staffId: string | null;
  valeur: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
  /** Hors direction, la grille se lit : la base ne garde que ce que la
      direction écrit (migration 0091). */
  lectureSeule?: boolean;
}) {
  const [services] = useServices();
  const ctx = useContexteDesPrestations();
  const parId = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);
  const depuis = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 91);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);
  const faites = useMemo(() => {
    const n = new Map<string, number>();
    if (!staffId) return n;
    for (const l of sesPrestations({ id: staffId }, ctx)) {
      if (l.date >= depuis && l.serviceId) n.set(l.serviceId, (n.get(l.serviceId) ?? 0) + 1);
    }
    return n;
  }, [staffId, ctx, depuis]);
  const ids = [
    ...[...faites.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id),
    ...Object.keys(valeur).filter((id) => !faites.has(id)),
  ];
  const restants = services
    .filter((s) => !ids.includes(s.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="mnd-muted" style={{ fontSize: 11.5, lineHeight: 1.55 }}>
        Le prix de chaque prestation sur sa facture du mois. Elle le lit sur sa facture, seule la direction
        l’écrit ici. Une prestation sans prix attend, et sa facture ne s’accepte pas tant qu’il manque.
        {lectureSeule && ' Vous la lisez sans pouvoir la modifier.'}
      </div>
      {ids.length === 0 ? (
        <div className="mnd-muted" style={{ fontSize: 12 }}>
          Aucune prestation ces trois derniers mois. Ajoutez celles qu’elle fera, depuis le catalogue.
        </div>
      ) : (
        <div className="mnd-scroll-x">
          <table className="tre-table">
            <thead><tr><th>Prestation</th><th>Ces 3 derniers mois</th><th className="num">Son prix</th></tr></thead>
            <tbody>
              {ids.map((id) => (
                <tr key={id}>
                  <td>{parId.get(id)?.name ?? 'Prestation retirée du catalogue'}</td>
                  <td className="mnd-muted">{faites.get(id) ? `${faites.get(id)} fois` : '·'}</td>
                  <td className="num">
                    <Input
                      inputMode="numeric"
                      value={valeur[id] ?? ''}
                      disabled={lectureSeule}
                      onChange={(e) => onChange({ ...valeur, [id]: e.target.value.replace(/[^0-9]/g, '') })}
                      aria-label={`Son prix pour ${parId.get(id)?.name ?? 'cette prestation'}`}
                      style={{ width: 110, textAlign: 'right', marginLeft: 'auto' }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!lectureSeule && (
        <Select
          value=""
          onChange={(e) => { if (e.target.value) onChange({ ...valeur, [e.target.value]: '' }); }}
          aria-label="Ajouter une prestation du catalogue"
        >
          <option value="">+ Ajouter une prestation du catalogue</option>
          {restants.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      )}
    </div>
  );
}
