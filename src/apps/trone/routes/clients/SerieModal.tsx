import { useMemo, useState } from 'react';
import { Button, Field, Input, Modal, Select, toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { normName } from '../../../../shared/text';
import { uid } from '../../../../shared/store';
import { appointmentsStore, estampilleLesPoses, useAppointments, type Appointment } from '../../../../shared/agenda';
import { useClients, type Client } from '../../../../shared/clients';
import { useServices, type Service } from '../../../../shared/catalog';
import { cashboxesStore, useCashboxes } from '../../../../shared/finance';
import { RYTHMES_ABO } from '../../../../shared/cadence';
import {
  litLesLignes, datesDeLaCadence, apercuDeLaSerie, caisseDeLaReprise, marqueDeLaSerie,
  type LigneLue,
} from '../../../../shared/serie';
import { ClientPicker, frShortAn, useServicesById } from './_shared';
import { OptionsPrestations } from '../_ui';

/* ══ LA SAISIE EN SÉRIE — 5 septembre 2026 (maquette validée) ═══════

   « Je veux saisir tous mes RDV en 2025. Un système facile pour remplir des
   RDV in bulk » puis « écrire plusieurs têtes pour un mois précis, il faudra
   trouver la solution » (Yéman).

   TROIS FAÇONS, SELON CE QU'ON A EN MAIN :
   ① LA CADENCE — une tête régulière. On décrit son rythme, le Trône déroule.
   ② LA LISTE — une tête, des dates sans rythme. On les tape, il les lit.
   ③ LE MOIS — plusieurs têtes, un mois. On tape « 14/02 Stephanie », le nom
      sur la ligne désigne la tête et son rituel habituel suit.

   RIEN NE S'ÉCRIT AVANT QU'ON AIT VU. C'est la relecture qui protège, pas le
   code : le jour de la semaine s'affiche à côté de chaque date, et si le
   cahier dit samedi quand l'écran dit vendredi, l'erreur saute aux yeux.

   ET TOUT PORTE SA MARQUE. Une saisie en masse sans marche arrière n'est pas
   un outil, c'est un pari : chaque série se retire d'un geste. */

type Mode = 'cadence' | 'liste' | 'mois';

type Ligne = {
  cle: string;
  iso?: string;
  heure: string;
  brut: string;
  client?: Client;
  services: Service[];
  prixXof: number;
  dejaAuCarnet: boolean;
  cochee: boolean;
};

export function SerieModal({ onClose }: { onClose: () => void }) {
  const { branch, currency } = useBranch();
  const [clients] = useClients();
  const [services] = useServices();
  const [tousLesRituels] = useAppointments();
  /* Les rituels de CETTE maison — pour le garde du doublon et pour retrouver
     le rituel habituel de chaque tête. */
  const appts = useMemo(() => tousLesRituels.filter((a) => a.branchId === branch.id), [tousLesRituels, branch.id]);
  const byId = useServicesById();
  const [caisses] = useCashboxes();

  const [mode, setMode] = useState<Mode>('cadence');
  const [annee, setAnnee] = useState(String(new Date().getFullYear() - 1));
  const [clientId, setClientId] = useState('');
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [maitre, setMaitre] = useState(branch.masters[0] ?? '');
  const [heure, setHeure] = useState('11:00');
  const [depart, setDepart] = useState('');
  const [semaines, setSemaines] = useState(8);
  const [jusqu, setJusqu] = useState('');
  const [colle, setColle] = useState('');
  const [retire, setRetire] = useState<Set<string>>(new Set());
  const [prixParLigne, setPrixParLigne] = useState<Record<string, number>>({});

  const tete = clients.find((c) => c.id === clientId);
  const an = Math.max(2000, Math.min(2100, parseInt(annee, 10) || new Date().getFullYear()));

  /* LE RITUEL HABITUEL D'UNE TÊTE — son dernier rituel honoré. C'est lui qui
     rend le mode « le mois » utilisable : on tape un jour et un nom, le reste
     se souvient. Sans cela il faudrait choisir la prestation ligne par ligne,
     et l'on retomberait dans la saisie une par une. */
  const rituelHabituel = useMemo(() => {
    const parTete = new Map<string, string[]>();
    for (const a of [...appts].sort((x, y) => x.date.localeCompare(y.date))) {
      if (a.status === 'annulé' || a.serviceIds.length === 0) continue;
      parTete.set(a.clientId, a.serviceIds);
    }
    return parTete;
  }, [appts]);

  const prestationsDe = (ids: string[]): Service[] =>
    ids.map((id) => byId.get(id)).filter((s): s is Service => !!s);

  /* LE PRIX DU CATALOGUE D'AUJOURD'HUI, figé sur chaque rituel — arbitrage du
     5 septembre. Modifiable ligne par ligne dans l'aperçu : si un tarif a
     bougé depuis, c'est là qu'on le corrige, pas dans le catalogue. */
  const prixDe = (svs: Service[]): number =>
    svs.reduce((n, s) => n + Math.max(0, Math.round(s.priceXof)), 0);

  const lignes: Ligne[] = useMemo(() => {
    const fait = (l: { iso?: string; heure?: string; brut: string }, c: Client | undefined, svs: Service[]): Ligne => {
      const cle = `${l.iso ?? l.brut}-${c?.id ?? ''}`;
      return {
        cle, iso: l.iso, heure: l.heure ?? heure, brut: l.brut,
        client: c, services: svs,
        prixXof: prixParLigne[cle] ?? prixDe(svs),
        dejaAuCarnet: false,
        cochee: !retire.has(cle),
      };
    };

    if (mode === 'cadence') {
      if (!depart || !tete) return [];
      const svs = prestationsDe(serviceIds);
      const dates = datesDeLaCadence({
        departIso: depart, semaines, jusquIso: jusqu || `${an}-12-31`,
      });
      const vus = apercuDeLaSerie({
        dates: dates.map((d) => ({ iso: d })), clientId: tete.id, heureParDefaut: heure, dejaPoses: appts,
      });
      return vus.map((v) => ({ ...fait({ iso: v.iso, heure: v.heure, brut: v.iso }, tete, svs), dejaAuCarnet: v.dejaAuCarnet }));
    }

    if (mode === 'liste') {
      if (!tete) return [];
      const svs = prestationsDe(serviceIds);
      const lues = litLesLignes(colle, an);
      const bonnes = lues.filter((l): l is LigneLue & { iso: string } => !!l.iso);
      const vus = apercuDeLaSerie({
        dates: bonnes.map((l) => ({ iso: l.iso, heure: l.heure })),
        clientId: tete.id, heureParDefaut: heure, dejaPoses: appts,
      });
      const parIso = new Map(vus.map((v) => [v.iso, v] as const));
      return lues.map((l) => {
        const v = l.iso ? parIso.get(l.iso) : undefined;
        return { ...fait({ iso: l.iso, heure: v?.heure ?? l.heure, brut: l.brut }, tete, svs), dejaAuCarnet: v?.dejaAuCarnet ?? false };
      });
    }

    /* ③ LE MOIS — le nom est SUR la ligne. On le reconnaît comme la recherche
       du carnet : sans accent, sans casse, sur le nom entier ou son début. Un
       nom qui désigne deux têtes n'en désigne aucune : on ne choisit pas à la
       place de la Maison. */
    const lues = litLesLignes(colle, an);
    return lues.map((l) => {
      const nom = normName(l.reste ?? '');
      const candidats = nom === '' ? [] : clients.filter((c) => c.branchId === branch.id && !c.archived)
        .filter((c) => normName(c.name).includes(nom));
      const c = candidats.length === 1 ? candidats[0] : undefined;
      const ids = c ? (rituelHabituel.get(c.id) ?? serviceIds) : serviceIds;
      const svs = prestationsDe(ids);
      const dejaLa = !!c && !!l.iso && appts.some((a) => a.clientId === c.id && a.date === l.iso && a.status !== 'annulé');
      const base = fait({ iso: l.iso, heure: l.heure, brut: l.brut }, c, svs);
      return { ...base, cle: `${l.iso ?? l.brut}-${c?.id ?? 'x'}`, dejaAuCarnet: dejaLa, ambigu: candidats.length > 1 } as Ligne & { ambigu?: boolean };
    });
  }, [mode, depart, semaines, jusqu, colle, an, heure, tete, serviceIds, appts, clients, byId, retire, prixParLigne, rituelHabituel, branch.id]);

  const posables = lignes.filter((l) => l.iso && l.client && l.services.length > 0 && !l.dejaAuCarnet && l.cochee);
  const total = posables.reduce((n, l) => n + l.prixXof, 0);
  const caisse = caisseDeLaReprise(an);

  const basculer = (cle: string) => setRetire((prev) => {
    const n = new Set(prev);
    if (n.has(cle)) n.delete(cle); else n.add(cle);
    return n;
  });

  const poser = () => {
    if (posables.length === 0) { toast('Rien à poser.'); return; }
    /* LA CAISSE DE LA REPRISE, garantie avant d'écrire. Verser une année dans
       la Caisse Principale ferait un solde qui ne correspond à aucun billet
       compté : l'argent de 2025 est entré, il n'est plus dans le tiroir. */
    if (!caisses.some((b) => b.branchId === branch.id && b.name === caisse)) {
      cashboxesStore.set((prev) => [...prev, {
        id: `cb-reprise-${an}-${branch.id}`, branchId: branch.id, name: caisse,
        sub: 'Reprise d’historique', glyph: '↺', openingXof: 0,
      }]);
    }
    const serie = uid();
    const neufs: Appointment[] = posables.map((l) => ({
      id: `ap-${uid()}`,
      branchId: branch.id,
      clientId: l.client!.id,
      clientName: l.client!.name,
      serviceIds: l.services.map((s) => s.id),
      date: l.iso!,
      time: l.heure,
      master: maitre,
      status: 'honoré',
      source: 'trone',
      /* HONORÉ ET RÉGLÉ LE JOUR MÊME, en espèces — arbitrage du 5 septembre.
         « Tout comme réglé puis rouvrir les quelques exceptions » : poser tout
         comme impayé obligerait à ouvrir cinquante rituels au lieu de trois. */
      priceXof: l.prixXof,
      paidXof: l.prixXof,
      payments: [{
        id: `pm-${uid()}`, amountXof: l.prixXof, date: l.iso!,
        method: 'Espèces', cashbox: caisse, note: marqueDeLaSerie(serie),
      }],
      note: `Reprise ${an}`,
    } as unknown as Appointment));
    appointmentsStore.set((prev) => [...prev, ...estampilleLesPoses(neufs)]);
    toast(`${neufs.length} rituels posés · ${fmtMoney(total, currency)} dans « ${caisse} ».`);
    onClose();
  };

  const teteDuMois = mode === 'mois';

  return (
    <Modal title="Saisir en série" onClose={onClose} width={860}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', gap: 18, borderBottom: '1px solid var(--hairline)' }}>
          {([
            ['cadence', 'La cadence'],
            ['liste', 'La liste de dates'],
            ['mois', 'Plusieurs têtes, un mois'],
          ] as [Mode, string][]).map(([k, mot]) => (
            <button
              key={k}
              type="button"
              onClick={() => setMode(k)}
              style={{
                background: 'none', border: 'none', padding: '0 0 9px', cursor: 'pointer', font: 'inherit',
                fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase',
                color: mode === k ? 'var(--color-indigo)' : 'var(--ink-soft)',
                borderBottom: mode === k ? '2px solid var(--color-copper)' : '2px solid transparent',
                fontWeight: mode === k ? 500 : 400,
              }}
            >
              {mot}
            </button>
          ))}
        </div>

        <div className="tr-grid tr-grid--3" style={{ gap: 10 }}>
          <Field label="L’année saisie">
            <Input inputMode="numeric" value={annee} onChange={(e) => setAnnee(e.target.value.replace(/[^0-9]/g, ''))} />
          </Field>
          {!teteDuMois && (
            <Field label="La tête">
              <ClientPicker value={clientId} onChange={setClientId} />
            </Field>
          )}
          <Field label="Le maître">
            <Select value={maitre} onChange={(e) => setMaitre(e.target.value)}>
              {branch.masters.map((m) => <option key={m} value={m}>{m}</option>)}
            </Select>
          </Field>
          <Field label={teteDuMois ? 'Rituel par défaut, si elle n’en a pas' : 'Le rituel'}>
            <Select
              value=""
              onChange={(e) => { if (e.target.value) setServiceIds((p) => [...p, e.target.value]); }}
            >
              <option value="">+ Ajouter une prestation…</option>
              <OptionsPrestations services={services} exclure={(sv) => serviceIds.includes(sv.id)} />
            </Select>
          </Field>
        </div>

        {serviceIds.length > 0 && (
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: -6 }}>
            {prestationsDe(serviceIds).map((s) => (
              <button key={s.id} type="button" className="tre-chip is-on"
                onClick={() => setServiceIds((p) => p.filter((x) => x !== s.id))}>
                {s.name} ✕
              </button>
            ))}
          </div>
        )}

        {mode === 'cadence' && (
          <div className="tr-grid tr-grid--4" style={{ gap: 10 }}>
            <Field label="Première venue">
              <Input type="date" value={depart} onChange={(e) => setDepart(e.target.value)} />
            </Field>
            <Field label="Rythme">
              <Select value={String(semaines)} onChange={(e) => setSemaines(Number(e.target.value))}>
                {RYTHMES_ABO.map((s) => <option key={s} value={s}>{s} semaines</option>)}
              </Select>
            </Field>
            <Field label="Heure">
              <Input type="time" value={heure} onChange={(e) => setHeure(e.target.value)} />
            </Field>
            <Field label="Jusqu’au">
              <Input type="date" value={jusqu || `${an}-12-31`} onChange={(e) => setJusqu(e.target.value)} />
            </Field>
          </div>
        )}

        {mode !== 'cadence' && (
          <Field label={teteDuMois
            ? 'Une venue par ligne · le jour, puis le nom — « 14/02 09:00 Stephanie »'
            : 'Une date par ligne · l’heure si vous l’avez'}>
            <textarea
              className="mnd-input"
              value={colle}
              onChange={(e) => setColle(e.target.value)}
              placeholder={teteDuMois ? '14/02 09:00 Stephanie\n7 mars Mylène\n19/05 11h Adjaratou' : '14/02/2025 09:00\n7 mars 2025\n19/05'}
              style={{ minHeight: 130, lineHeight: 1.9, fontFamily: 'var(--font-sans)' }}
            />
            <div className="mnd-muted" style={{ fontSize: 11, marginTop: 5, lineHeight: 1.55 }}>
              Sans année, {an}. Sans heure, {heure}.
              {' '}Se lisent : 14/02/2025 · 14-02-25 · 14 février · 14 févr. 2025 · 14/02, et l’heure
              en 09:00, 9h ou 9h30.
              {teteDuMois && ' Le nom peut être avant ou après la date, et son rituel habituel suit.'}
            </div>
          </Field>
        )}

        {/* ══ L'APERÇU — rien ne s'écrit avant qu'on ait vu ═══════════════ */}
        {lignes.length > 0 && (
          <div style={{ border: '1px solid var(--hairline)', borderRadius: 3, maxHeight: '38vh', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <tbody>
                <tr>
                  <th style={{ width: 34 }} />
                  <th style={{ textAlign: 'left', padding: '7px 10px', fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', fontWeight: 500 }}>Le jour</th>
                  <th style={{ textAlign: 'left', padding: '7px 10px', fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', fontWeight: 500 }}>Ce qui sera posé</th>
                  <th style={{ textAlign: 'right', padding: '7px 10px', fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', fontWeight: 500 }}>Prix</th>
                  <th />
                </tr>
                {lignes.map((l) => {
                  const ko = !l.iso || !l.client || l.services.length === 0;
                  return (
                    <tr key={l.cle} style={{ background: ko ? 'var(--brique-50, #FBF0ED)' : undefined, opacity: !ko && (l.dejaAuCarnet || !l.cochee) ? 0.55 : 1 }}>
                      <td style={{ padding: '6px 10px', borderTop: '1px solid var(--hairline)' }}>
                        {!ko && !l.dejaAuCarnet && (
                          <input type="checkbox" checked={l.cochee} onChange={() => basculer(l.cle)} style={{ accentColor: 'var(--color-copper)' }} />
                        )}
                      </td>
                      <td style={{ padding: '6px 10px', borderTop: '1px solid var(--hairline)', color: ko ? 'var(--trv-error, #96412E)' : undefined }}>
                        {/* LE JOUR DE LA SEMAINE RELIT POUR VOUS : si le cahier
                            dit samedi et l'écran vendredi, l'erreur saute aux
                            yeux avant d'être écrite. */}
                        {l.iso ? `${frShortAn(l.iso)} · ${l.heure}` : l.brut}
                      </td>
                      <td style={{ padding: '6px 10px', borderTop: '1px solid var(--hairline)' }}>
                        {ko
                          ? (!l.iso ? 'Date illisible' : !l.client ? 'Tête introuvable' : 'Aucune prestation')
                          : <>{l.client!.name} · {l.services.map((s) => s.name).join(' + ')}</>}
                      </td>
                      <td style={{ padding: '6px 10px', borderTop: '1px solid var(--hairline)', textAlign: 'right' }}>
                        {!ko && (
                          <Input
                            inputMode="numeric"
                            value={String(l.prixXof)}
                            onChange={(e) => setPrixParLigne((p) => ({ ...p, [l.cle]: Math.max(0, parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0) }))}
                            aria-label="Prix de ce rituel"
                            style={{ width: 96, textAlign: 'right', padding: '4px 8px', fontSize: 12 }}
                          />
                        )}
                      </td>
                      <td style={{ padding: '6px 10px', borderTop: '1px solid var(--hairline)', textAlign: 'right' }}>
                        {l.dejaAuCarnet && <span className="mnd-muted" style={{ fontSize: 10.5 }}>déjà au carnet</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="mnd-muted" style={{ fontSize: 11.5, lineHeight: 1.55 }}>
          Chaque rituel naît <b>honoré et réglé</b> le jour même, en espèces, dans la caisse
          <b> « {caisse} »</b> — l’argent de {an} est entré, il n’est plus dans le tiroir.
          Aucune facture n’est émise. Ces montants entreront dans le chiffre de {an}.
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Button variant="ghost" style={{ flex: 'none' }} onClick={onClose}>Annuler</Button>
          <Button variant="copper" style={{ flex: 'none' }} disabled={posables.length === 0} onClick={poser}>
            Poser {posables.length} rituel{posables.length > 1 ? 's' : ''}
          </Button>
          {posables.length > 0 && (
            <span className="mnd-muted" style={{ fontSize: 12 }}>
              {posables.length} × · <b>{fmtMoney(total, currency)}</b> dans l’année {an}.
            </span>
          )}
        </div>
      </div>
    </Modal>
  );
}
