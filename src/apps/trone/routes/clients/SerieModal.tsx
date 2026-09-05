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
  habitudesParTete, seriesPosees, type LigneLue,
} from '../../../../shared/serie';
import { ClientPicker, frJourAn, frShortAn, useServicesById } from './_shared';
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

type Mode = 'cadence' | 'liste' | 'mois' | 'retrait';

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
  /* LE RETRAIT SE CONFIRME DANS LA PAGE, en deux temps. `window.confirm` se
     tait quand le navigateur bloque les dialogues, et le bouton passait pour
     mort : c'est ce qui était arrivé à « Écarter », dans Accès & personnel. */
  const [aRetirer, setARetirer] = useState('');

  const tete = clients.find((c) => c.id === clientId);
  const an = Math.max(2000, Math.min(2100, parseInt(annee, 10) || new Date().getFullYear()));

  /* CE QUE CHAQUE TÊTE FAIT D'HABITUDE — lu dans le carnet, jamais deviné.
     Il sert deux fois : à MONTRER ses rituels avant qu'on choisisse (le
     catalogue compte des dizaines de lignes, et la voisine de celle qu'on
     cherche se clique vite), et à faire tenir le mode « le mois », où l'on tape
     un jour et un nom et où le rituel suit tout seul. */
  const habitudes = useMemo(() => habitudesParTete(appts), [appts]);
  const siennes = tete ? (habitudes.get(tete.id) ?? []) : [];
  /* La signature du rituel en cours, pour reconnaître celle qui est déjà
     posée : deux prestations dans un autre ordre sont le même rituel. */
  const cleCourante = [...serviceIds].sort().join('+');

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

    /* L'onglet du retrait ne compose rien : il relit ce qui est déjà posé. */
    if (mode === 'retrait') return [];

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
      const ids = c ? (habitudes.get(c.id)?.[0]?.serviceIds ?? serviceIds) : serviceIds;
      const svs = prestationsDe(ids);
      const dejaLa = !!c && !!l.iso && appts.some((a) => a.clientId === c.id && a.date === l.iso && a.status !== 'annulé');
      const base = fait({ iso: l.iso, heure: l.heure, brut: l.brut }, c, svs);
      return { ...base, cle: `${l.iso ?? l.brut}-${c?.id ?? 'x'}`, dejaAuCarnet: dejaLa, ambigu: candidats.length > 1 } as Ligne & { ambigu?: boolean };
    });
  }, [mode, depart, semaines, jusqu, colle, an, heure, tete, serviceIds, appts, clients, byId, retire, prixParLigne, habitudes, branch.id]);

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
  const enRetrait = mode === 'retrait';

  /* ══ LA MARCHE ARRIÈRE ═══════════════════════════════════════════════
     Poser trente rituels d'un geste et devoir les retirer un par un serait pire
     que de ne rien avoir posé : on renoncerait à la reprise plutôt que de
     risquer une erreur. */
  const series = useMemo(() => seriesPosees(appts), [appts]);

  const retirerLaSerie = (marque: string) => {
    const s = series.find((x) => x.marque === marque);
    if (!s || s.retirables.length === 0) { setARetirer(''); return; }
    const partent = new Set(s.retirables);
    appointmentsStore.set((prev) => prev.filter((a) => !partent.has(a.id)));
    setARetirer('');
    toast(s.retenus.length > 0
      ? `${partent.size} rituels retirés · ${s.retenus.length} gardés.`
      : `${partent.size} rituels retirés.`);
  };

  return (
    <Modal title="Saisir en série" onClose={onClose} width={860}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', gap: 18, borderBottom: '1px solid var(--hairline)' }}>
          {([
            ['cadence', 'La cadence'],
            ['liste', 'La liste de dates'],
            ['mois', 'Plusieurs têtes, un mois'],
            ['retrait', `Les séries posées${series.length > 0 ? ` · ${series.length}` : ''}`],
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

        {!enRetrait && (<>
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

        {/* ══ CE QU'ELLE FAIT D'HABITUDE ══════════════════════════════════
            Le carnet sait déjà : chercher dans un catalogue de dizaines de
            lignes ce qu'elle prend chaque fois, cinquante fois de suite, c'est
            là qu'on clique la prestation voisine. On MONTRE, la Maison
            choisit : un rituel posé tout seul serait un rituel que personne
            n'a regardé. */}
        {!teteDuMois && tete && (
          <div style={{
            border: '1px solid var(--hairline)', borderRadius: 3, padding: '10px 12px',
            background: 'var(--surface-2, #FAF8F5)', marginTop: -4,
          }}>
            <div style={{
              fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase',
              color: 'var(--ink-soft)', fontWeight: 500, marginBottom: 8,
            }}>
              Ce qu’elle fait d’habitude
            </div>
            {siennes.length === 0 ? (
              <div className="mnd-muted" style={{ fontSize: 11.5, lineHeight: 1.55 }}>
                Aucun rituel honoré à son nom pour l’instant. Choisissez au catalogue,
                ci-dessus.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {siennes.map((h) => {
                  const svs = prestationsDe(h.serviceIds);
                  if (svs.length === 0) return null;
                  const posee = h.cle === cleCourante;
                  return (
                    <button
                      key={h.cle}
                      type="button"
                      onClick={() => setServiceIds(h.serviceIds)}
                      style={{
                        display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap',
                        textAlign: 'left', font: 'inherit', cursor: 'pointer',
                        padding: '7px 10px', borderRadius: 3,
                        background: posee ? 'var(--color-copper-08, rgba(176,110,48,.09))' : 'var(--surface, #FFF)',
                        border: `1px solid ${posee ? 'var(--color-copper)' : 'var(--hairline)'}`,
                      }}
                    >
                      <span style={{ fontSize: 12.5, color: 'var(--ink)' }}>
                        {svs.map((s) => s.name).join(' + ')}
                      </span>
                      <span className="mnd-muted" style={{ fontSize: 11 }}>
                        {h.fois} fois · dernière le {frJourAn(h.dernierIso)}
                        {/* CE QU'ELLE A RÉGLÉ LA DERNIÈRE FOIS : quand un tarif
                            a bougé depuis, c'est le chiffre le plus proche de
                            la vérité. Il ne s'applique pas tout seul — le prix
                            reste celui du catalogue, corrigible ligne à ligne
                            dans l'aperçu. */}
                        {typeof h.dernierPrixXof === 'number' && h.dernierPrixXof > 0
                          && ` · réglé ${fmtMoney(h.dernierPrixXof, currency)}`}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {serviceIds.length > 0 && (
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center', marginTop: -4 }}>
            <span style={{
              fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase',
              color: 'var(--ink-soft)', fontWeight: 500,
            }}>
              {teteDuMois ? 'Par défaut' : 'Le rituel posé'}
            </span>
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
        </>)}

        {/* ══ LES SÉRIES POSÉES ═══════════════════════════════════════════
            ON NE RETIRE JAMAIS CE QUI A VÉCU DEPUIS. Un rituel facturé, ou sur
            lequel un autre règlement s'est ajouté, n'appartient plus à la
            série : il appartient à la Maison. On le garde, et on dit pourquoi.
            Un retrait silencieux qui emporterait une facture serait un trou
            dans le registre que personne ne verrait passer. */}
        {enRetrait && (
          series.length === 0 ? (
            <div className="mnd-muted" style={{ fontSize: 12, lineHeight: 1.6, padding: '18px 2px' }}>
              Aucune série posée pour l’instant. Ce qui sera saisi ici se retirera d’un geste,
              depuis cet onglet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '52vh', overflowY: 'auto' }}>
              {series.map((s) => (
                <div key={s.marque} style={{ border: '1px solid var(--hairline)', borderRadius: 3, padding: '11px 13px' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13.5, color: 'var(--ink)' }}>
                      {s.caisse ?? `Reprise ${s.annee}`}
                    </span>
                    <span className="mnd-muted" style={{ fontSize: 11.5 }}>
                      {s.rituels} rituel{s.rituels > 1 ? 's' : ''} · {fmtMoney(s.totalXof, currency)}
                      {' · du '}{frJourAn(s.duIso)} au {frJourAn(s.auIso)}
                    </span>
                  </div>
                  <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 4, lineHeight: 1.55 }}>
                    {s.tetes.join(' · ')}
                  </div>

                  {s.retenus.length > 0 && (
                    <div style={{ fontSize: 11.5, marginTop: 8, lineHeight: 1.6, color: 'var(--copper-700)' }}>
                      {s.retenus.length} rituel{s.retenus.length > 1 ? 's' : ''} rester
                      {s.retenus.length > 1 ? 'ont' : 'a'} au carnet :{' '}
                      {s.retenus.map((r) => `${frJourAn(r.quoi)}, ${r.pourquoi}`).join(' · ')}.
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
                    {aRetirer === s.marque ? (
                      <>
                        <span style={{ fontSize: 12, color: 'var(--trv-error, #96412E)' }}>
                          Retirer {s.retirables.length} rituel{s.retirables.length > 1 ? 's' : ''} du carnet,
                          et leur argent de la caisse ?
                        </span>
                        <Button variant="ghost" style={{ flex: 'none' }} onClick={() => setARetirer('')}>
                          Non, garder
                        </Button>
                        <Button variant="copper" style={{ flex: 'none' }} onClick={() => retirerLaSerie(s.marque)}>
                          Oui, retirer
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="ghost"
                        style={{ flex: 'none' }}
                        disabled={s.retirables.length === 0}
                        onClick={() => setARetirer(s.marque)}
                      >
                        {s.retirables.length === 0 ? 'Plus rien à retirer' : 'Retirer cette série'}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Button variant="ghost" style={{ flex: 'none' }} onClick={onClose}>
            {enRetrait ? 'Fermer' : 'Annuler'}
          </Button>
          {!enRetrait && (
            <Button variant="copper" style={{ flex: 'none' }} disabled={posables.length === 0} onClick={poser}>
              Poser {posables.length} rituel{posables.length > 1 ? 's' : ''}
            </Button>
          )}
          {!enRetrait && posables.length > 0 && (
            <span className="mnd-muted" style={{ fontSize: 12 }}>
              {posables.length} × · <b>{fmtMoney(total, currency)}</b> dans l’année {an}.
            </span>
          )}
        </div>
      </div>
    </Modal>
  );
}
