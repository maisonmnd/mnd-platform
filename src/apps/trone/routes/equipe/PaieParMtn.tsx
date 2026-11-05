import { useEffect, useMemo, useRef } from 'react';
import { Button, alerte, demande, toast } from '../../../../ds/components';
import { bulletinsStore, type BulletinPublie } from '../../../../shared/rh';
import { numeroDit, quandDit, type CalendrierDeLaPaie, type LectureDeLaLigne } from '../../../../shared/paie-du-5-pur';
import {
  ETAT_DE_L_ENVOI_DIT, appliqueLesRecus, ceQuiManque, heureDeDepart, itemsDuRun, raisonDite, totalDe, triDesEnvois,
  type EnvoiMtn, type EtatDeLEnvoi,
} from '../../../../shared/paie-par-mtn-pur';
import type { StaffMember } from './data';
import { asArray, type PayrollLine, type PayrollRun } from './payroll';
import { annule, lisChezMtn, programmeLeRun, relis, renvoie } from './paie-par-mtn';

/* ══ LA PAIE PAR MTN, SUR LA PAIE DU MOIS · 5 novembre 2026 (lot 2) ═════
   Maquette 6bNGeh7nyABotDAXppWRoX : avant le toucher, le solde du compte de
   paie MTN et le nom de chaque numéro, lus chez MTN ; un nom différent
   attend « C'est bien son numéro » ; « Valider et programmer » confie les
   envois au serveur pour 18 h ; puis l'état de chaque envoi, tel que MTN le
   dit. Un refus ne repart jamais seul : « Renvoyer » demande un nouveau
   toucher, avec une nouvelle référence. */

const PILL: Record<EtatDeLEnvoi, string> = {
  recu: 'p5-pill--fait', refuse: 'p5-pill--alerte', annule: 'p5-pill--attente',
  programme: 'p5-pill--attente', envoi: 'p5-pill--attente', envoye: 'p5-pill--attente', 'sans-reponse': 'p5-pill--attente',
};
const nowIso = () => new Date().toISOString();
const DEUX_HEURES = 2 * 60 * 60 * 1000;

export function ceQuiSeDitDeLEnvoi(e: EnvoiMtn): string {
  const ref = `référence ${e.reference.slice(0, 8)}`;
  switch (e.etat) {
    case 'programme': return `Part le ${quandDit(e.part_a, true)}${e.note ? ` · ${e.note}` : ''} · ${ref}`;
    case 'envoi':
    case 'envoye': return `Envoyé le ${quandDit(e.envoye_le ?? undefined)} · le Trône attend la réponse de MTN · ${ref}`;
    case 'sans-reponse': return `Envoyé le ${quandDit(e.envoye_le ?? undefined)} · MTN n’a pas encore répondu : le Trône relit cette référence, sans renvoyer · ${ref}`;
    case 'recu': return `Reçu le ${quandDit(e.repondu_le ?? undefined)}${e.transaction_mtn ? ` · transaction MTN ${e.transaction_mtn}` : ''}`;
    case 'refuse': return `${raisonDite(e.raison)}. Rien n’a quitté le compte, rien ne repart seul · ${ref}`;
    case 'annule': return `Annulé · ${ref}`;
  }
}

/** Le dernier envoi de chaque personne (le registre arrive du plus récent au plus ancien). */
export const derniersParPersonne = (envois: readonly EnvoiMtn[]): EnvoiMtn[] => {
  const vus = new Set<string>();
  return envois.filter((e) => (vus.has(e.employee_id) ? false : (vus.add(e.employee_id), true)));
};

export default function PaieParMtn(p: {
  run: PayrollRun;
  lues: { ligne: PayrollLine; lecture: LectureDeLaLigne; fiche?: StaffMember }[];
  cal: CalendrierDeLaPaie | null;
  qui: string;
  F: (n: number) => string;
  fige: boolean;
  envois: EnvoiMtn[];
  relisLeRegistre: () => void;
  ecrisLeRun: (change: (r: PayrollRun) => PayrollRun) => void;
}) {
  const { run, lues, cal, qui, F, fige, envois, relisLeRegistre, ecrisLeRun } = p;
  const lecture = run.paieDu5?.lectureMtn;
  const items = useMemo(() => itemsDuRun(lues), [lues]);
  const vus = (id: string) => asArray<PayrollLine>(run.lines).find((l) => l.employeeId === id)?.nomMtnVu;
  const tri = triDesEnvois({ runId: run.id, items, envois, lecture, vus });
  const derniers = derniersParPersonne(envois);
  const programmes = envois.filter((e) => e.etat === 'programme');
  const numeros = useMemo(() => [...new Set(lues.filter((x) => x.lecture.voie === 'MTN' && x.lecture.etat !== 'payee' && x.lecture.msisdn).map((x) => x.lecture.msisdn as string))], [lues]);
  const totalProgramme = programmes.reduce((s, e) => s + e.montant_xof, 0);
  const manque = ceQuiManque(lecture?.soldeXof, totalProgramme + totalDe(tri.partent));
  /* Par l'API, MTN ne prend aucun frais : des frais MTN réglés pour le portail rogneraient le net pour rien. */
  const avecFrais = lues.filter((x) => x.lecture.voie === 'MTN' && x.lecture.etat !== 'payee' && x.lecture.fraisXof > 0).length;

  /* ── Lire chez MTN : le solde, et le nom et l'état de chaque numéro ── */
  const lire = async (dire = true) => {
    if (!numeros.length) return;
    const r = await lisChezMtn(numeros);
    if (r.erreur || !r.le) { if (dire) alerte(r.erreur ?? 'MTN n’a pas répondu.'); return; }
    ecrisLeRun((x) => ({ ...x, paieDu5: { ...(x.paieDu5 ?? {}), lectureMtn: { le: r.le as string, soldeXof: r.soldeXof ?? null, numeros: r.numeros ?? {} } } }));
    if (dire) toast('Solde et noms lus chez MTN.');
  };
  const lu = useRef(false);
  useEffect(() => {
    if (lu.current || fige || !numeros.length) return;
    const age = lecture ? Date.now() - Date.parse(lecture.le) : Infinity;
    if (age < DEUX_HEURES) return;
    lu.current = true;
    void lire(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numeros.length, fige]);

  /* ── Les réponses de MTN paient les lignes ── */
  useEffect(() => {
    if (fige) return;
    const r = appliqueLesRecus(asArray<PayrollLine>(run.lines), run.id, envois);
    if (!r.payees.length) return;
    ecrisLeRun((x) => ({ ...x, lines: appliqueLesRecus(asArray<PayrollLine>(x.lines), x.id, envois).lignes }));
    const parId = new Map(r.lignes.map((l) => [l.employeeId, l]));
    const payees = new Set(r.payees);
    bulletinsStore.set((prev) => asArray<BulletinPublie>(prev).map((b) => {
      const l = parId.get(b.employeeId);
      return b.runId === run.id && payees.has(b.employeeId) && l
        ? { ...b, payeLe: l.payeLe, ...(l.transactionMtn ? { transactionMtn: l.transactionMtn } : {}) }
        : b;
    }));
    toast(`${r.payees.length} ligne${r.payees.length > 1 ? 's' : ''} payée${r.payees.length > 1 ? 's' : ''} par MTN.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envois, fige]);

  /* ── Les gestes ── */
  const cEstBienSonNumero = async (employeeId: string, nom: string, msisdn: string, nomMtn: string) => {
    if (!qui) return;
    if (!await demande({
      quoi: 'La paie par MTN',
      titre: `Le ${numeroDit(msisdn)} est-il bien celui de ${nom} ?`,
      dit: `MTN dit que ce numéro est au nom de ${nomMtn}.`,
      suite: `Vérifié par ${qui}, pour ce numéro et ce nom seulement.`,
      accepter: 'C’est bien son numéro',
      refuser: 'Je vérifie d’abord',
    })) return;
    ecrisLeRun((x) => ({
      ...x,
      lines: asArray<PayrollLine>(x.lines).map((l) => (l.employeeId === employeeId ? { ...l, nomMtnVu: { par: qui, le: nowIso(), msisdn, nomMtn } } : l)),
    }));
  };

  const programmerLeReste = async () => {
    const partA = heureDeDepart(cal, Date.now());
    const total = totalDe(tri.partent);
    if (manque != null && manque > 0) {
      alerte(`Le solde du compte de paie MTN ne couvre pas l’envoi : il manque ${F(manque)}. Alimentez le compte, puis lisez à nouveau chez MTN.`);
      return;
    }
    if (!await demande({
      quoi: 'La paie par MTN',
      titre: `Programmer ${tri.partent.length} envoi${tri.partent.length > 1 ? 's' : ''} pour ${F(total)} ?`,
      dit: `Ils partent le ${quandDit(partA, true)} par l’API MTN, depuis le compte de paie MTN.`,
      suite: `Programmé par ${qui}. Annulable tant qu’ils ne sont pas partis.`,
      accepter: 'Programmer',
      refuser: 'Pas encore',
    })) return;
    const r = await programmeLeRun({ runId: run.id, periode: run.period, partA, items, envois, lecture, vus });
    if (r.erreur) { alerte(r.erreur); return; }
    toast(`${r.inscrits.length} envoi${r.inscrits.length > 1 ? 's' : ''} programmé${r.inscrits.length > 1 ? 's' : ''}.`);
    if (r.refuses.length) alerte(`${r.refuses.length} envoi${r.refuses.length > 1 ? 's' : ''} refusé${r.refuses.length > 1 ? 's' : ''} par le serveur : ${r.refuses.map((x) => x.erreur).join(' ; ')}.`);
    relisLeRegistre();
  };

  const annulerTout = async () => {
    if (!programmes.length) return;
    if (!await demande({
      quoi: 'La paie par MTN',
      titre: `Annuler ${programmes.length} envoi${programmes.length > 1 ? 's' : ''} programmé${programmes.length > 1 ? 's' : ''} ?`,
      dit: `${F(totalProgramme)} ne partiront pas. Les envois déjà partis ne changent pas.`,
      accepter: 'Annuler la programmation',
      refuser: 'Les garder',
    })) return;
    const r = await annule(programmes.map((e) => e.reference));
    if (r.erreur) { alerte(r.erreur); return; }
    toast(`${r.annules ?? 0} envoi${(r.annules ?? 0) > 1 ? 's' : ''} annulé${(r.annules ?? 0) > 1 ? 's' : ''}.`);
    relisLeRegistre();
  };

  const renvoyer = async (e: EnvoiMtn) => {
    const fiche = lues.find((x) => x.ligne.employeeId === e.employee_id)?.fiche;
    const numero = fiche?.mobileMoney?.operateur === 'MTN' ? fiche.mobileMoney.numero : e.msisdn;
    if (!await demande({
      quoi: 'La paie par MTN',
      titre: `Renvoyer ${F(e.montant_xof)} à ${e.nom} ?`,
      dit: `MTN avait refusé : ${raisonDite(e.raison)}. Le renvoi part tout de suite vers le ${numeroDit(numero)}, avec une nouvelle référence ; l’ancienne reste notée.`,
      scelle: 'Vérifiez d’abord le numéro sur sa fiche.',
      accepter: 'Renvoyer',
      refuser: 'Ne rien faire',
    })) return;
    const r = await renvoie(e.reference, numero);
    if (r.erreur) { alerte(r.erreur); return; }
    toast('Renvoyé : le Trône attend la réponse de MTN.');
    relisLeRegistre();
  };

  const relireMtn = async () => {
    const r = await relis();
    if (r.erreur) { alerte(r.erreur); return; }
    relisLeRegistre();
  };

  const parNom = (id: string) => lues.find((x) => x.ligne.employeeId === id)?.ligne.name ?? '';

  return (
    <div className="p5__voie">
      <h4>MTN · par l’API, depuis le compte de paie MTN</h4>
      <p>
        {lecture
          ? <>Lu chez MTN le {quandDit(lecture.le)} : solde du compte de paie {lecture.soldeXof != null ? <b>{F(lecture.soldeXof)}</b> : 'non donné par MTN'}.</>
          : 'Le solde et les noms ne sont pas encore lus chez MTN.'}
        {manque != null && manque > 0 ? <> Il manque <b>{F(manque)}</b> pour couvrir ce qui est programmé et à programmer : rien ne part tant que le compte ne couvre pas tout.</> : ''}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Button size="sm" variant="ghost" disabled={fige || !numeros.length} onClick={() => void lire()}>Lire chez MTN</Button>
        {envois.length > 0 && <Button size="sm" variant="ghost" onClick={() => void relireMtn()}>Relire les réponses de MTN</Button>}
      </div>

      {avecFrais > 0 && (
        <div className="p5__note p5__note--cuivre">
          <span>Des frais d’envoi MTN sont retirés de {avecFrais} net{avecFrais > 1 ? 's' : ''}. Par l’API, MTN ne prend aucun frais : mettez les frais MTN à 0 F dans les Paramètres de paie, puis redéposez les bulletins.</span>
        </div>
      )}

      {tri.attendent.filter((a) => a.pourquoi === 'nom' || a.pourquoi === 'inactif').map((a) => (
        <div key={a.employeeId} className="p5__note p5__note--cuivre">
          <span>
            {a.pourquoi === 'nom'
              ? <><b>{a.nom}</b> : MTN dit que le {numeroDit(a.msisdn)} est au nom de <b>{a.nomMtn}</b>. Elle ne part pas sans votre mot.</>
              : <><b>{a.nom}</b> : MTN dit que le {numeroDit(a.msisdn)} n’a pas de compte MoMo actif. Corrigez le numéro sur sa fiche.</>}
          </span>
          {a.pourquoi === 'nom' && a.nomMtn && !fige && (
            <Button size="sm" variant="copper" onClick={() => void cEstBienSonNumero(a.employeeId, a.nom, a.msisdn, a.nomMtn as string)}>C’est bien son numéro</Button>
          )}
        </div>
      ))}

      {tri.partent.length > 0 && !fige && (
        <div className="p5__note">
          <span>{tri.partent.length} ligne{tri.partent.length > 1 ? 's' : ''} validée{tri.partent.length > 1 ? 's' : ''} pas encore programmée{tri.partent.length > 1 ? 's' : ''}, {F(totalDe(tri.partent))}. Elles partiront le {quandDit(heureDeDepart(cal, Date.now()), true)}.</span>
          <Button size="sm" variant="copper" onClick={() => void programmerLeReste()}>Programmer l’envoi</Button>
        </div>
      )}

      {derniers.length > 0 && (
        <ul className="p5__lots">
          {derniers.map((e) => (
            <li key={e.reference} style={{ display: 'grid', gap: 4 }}>
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span><b>{parNom(e.employee_id) || e.nom}</b> · {F(e.montant_xof)}</span>
                <span className={`p5-pill ${PILL[e.etat]}`}>{ETAT_DE_L_ENVOI_DIT[e.etat]}</span>
              </span>
              <small>{ceQuiSeDitDeLEnvoi(e)}</small>
              {e.etat === 'refuse' && !fige && <span><Button size="sm" variant="ghost" onClick={() => void renvoyer(e)}>Renvoyer avec votre toucher</Button></span>}
            </li>
          ))}
        </ul>
      )}
      {programmes.length > 0 && !fige && <Button size="sm" variant="ghost" onClick={() => void annulerTout()}>Annuler la programmation</Button>}
      <p className="p5__doux">Chaque envoi porte sa référence. Sans réponse de MTN, le Trône relit la même référence : il ne refait jamais un second envoi. 0 % de frais sur les envois par l’API.</p>
    </div>
  );
}
