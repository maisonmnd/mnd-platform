/* ══ LE RENDEZ-VOUS DU FOYER — 2 septembre 2026 ═══════════════════════
   « Comment je peux prendre des RDV dans un foyer pour 2 personnes au
   minimum ? » (Yéman).

   TROIS FOIS LE MÊME FORMULAIRE. Pour la mère et ses deux filles, il fallait
   ouvrir trois rendez-vous, retaper trois fois la date, choisir trois fois le
   maître, et rien ensuite ne disait que ces trois-là n'en faisaient qu'un.

   DEUX RENDEZ-VOUS, PAS UN À DEUX TÊTES. Le calendrier, les mains, les
   commissions et le suivi comptent tous PAR TÊTE : un objet à deux têtes
   casserait les quatre d'un coup. On pose donc des rendez-vous ordinaires,
   liés par `foyerId`, exactement comme les séances d'une série. Chacun se
   déplace, s'annule et se facture seul — une fille malade ne fait pas tomber
   le rendez-vous de sa mère. */
import { useEffect, useMemo, useState } from 'react';
import { Button, Field, Modal, Select, toast } from '../../../../ds/components';
import { OptionsPrestations } from '../_ui';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { useClients, useFamilies, remiseFamillePct, type Client } from '../../../../shared/clients';
import { estKids } from '../../../../shared/accounts';
import { useServices, useProducts, type Service } from '../../../../shared/catalog';
import {
  useModelBands, useBandSets, pricingOf, personalPriceXof, prixDeBase, isPersonalized,
  personalDurationMin,
} from '../../../../shared/pricing';
import { useCategories } from '../../../../shared/catalog';
import {
  appointmentsStore, useAppointments, maitresLibres, placeLeFoyer, type Appointment,
} from '../../../../shared/agenda';
import { uid } from '../../../../shared/store';
import { TIME_SLOTS, todayISO, poseLHoteDuFoyer } from './_shared';

/** Les têtes d'un foyer : toutes celles rattachées au compte, quel que soit
    leur âge. `tetesPortees` ne rend que les MINEURES, ce qui est juste pour Ma
    Couronne — un adulte ne réserve pas pour un autre adulte sans son mot — mais
    faux au comptoir, où la Maison a les deux sœurs devant elle. */
export const tetesDuFoyer = (client: Client, clients: readonly Client[], familyId?: string): Client[] => {
  const fid = familyId ?? client.familyId;
  if (!fid) return [];
  return clients
    .filter((c) => c.familyId === fid && !c.archived)
    .sort((a, b) => (a.id === client.id ? -1 : b.id === client.id ? 1 : a.name.localeCompare(b.name, 'fr')));
};

type Choix = { serviceIds: string[] };

export function RdvFoyerModal({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const { branch, currency } = useBranch();
  const [clients] = useClients();
  const [families] = useFamilies();
  const [services] = useServices();
  const [produits] = useProducts();
  const [cats] = useCategories();
  const [bands] = useModelBands();
  const [sets] = useBandSets();
  const [appts] = useAppointments();

  const client = clients.find((c) => c.id === clientId);
  const famille = client?.familyId ? families.find((f) => f.id === client.familyId) : undefined;
  const tetes = useMemo(
    () => (client ? tetesDuFoyer(client, clients) : []),
    [client, clients],
  );

  /* LA TÊTE PAR LAQUELLE ON EST ARRIVÉ EST COCHÉE : c'est elle qu'on servait
     quand l'idée du foyer est venue. */
  const [pris, setPris] = useState<Record<string, Choix>>(() => ({ [clientId]: { serviceIds: [] } }));
  const [date, setDate] = useState(todayISO());
  const [heure, setHeure] = useState('10:00');
  const [ensemble, setEnsemble] = useState(true);

  const byId = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);

  /* SON PRIX ET SA DURÉE À ELLE. Micro, Nano, Pico : trois têtes d'un même
     foyer ne paient pas le même resserrage, et le total du foyer est une somme
     de prix personnels, jamais un tarif de groupe. */
  const chiffreDe = (c: Client, ids: string[]) => {
    const pricing = pricingOf(c, bands, sets, cats);
    const perso = isPersonalized(pricing);
    const svcs = ids.map((id) => byId.get(id)).filter(Boolean) as Service[];
    const prixXof = svcs.reduce(
      (n, sv) => n + (perso ? personalPriceXof(sv, pricing, services, produits) : prixDeBase(sv, pricing)), 0,
    );
    const dureeMin = svcs.reduce((n, sv) => n + (personalDurationMin(sv, pricing) ?? sv.durationMin ?? 60), 0);
    return { prixXof, dureeMin: dureeMin || 60, perso };
  };

  const retenues = tetes.filter((t) => pris[t.id]);
  const lignes = retenues.map((t) => ({ tete: t, ...chiffreDe(t, pris[t.id].serviceIds), ids: pris[t.id].serviceIds }));
  const totalXof = lignes.reduce((n, l) => n + l.prixXof, 0);

  /* LA REMISE DU FOYER SE POSE UNE FOIS, sur le total : la poser tête par tête
     la doublerait, et la Maison offrirait deux fois ce qu'elle a promis une. */
  const famPct = remiseFamillePct(famille, clients, todayISO());
  const netXof = Math.max(0, totalXof - Math.round(totalXof * (famPct / 100)));

  /* CE QUE L'AGENDA PERMET, avant de proposer quoi que ce soit. Promettre deux
     fauteuils qui n'existent pas se paie à l'arrivée, devant la famille. */
  const dureeMax = Math.max(60, ...lignes.map((l) => l.dureeMin));
  const libres = useMemo(
    () => maitresLibres({
      appts, branchId: branch.id, dateIso: date, heure, dureeMin: dureeMax, maitres: branch.masters,
    }),
    [appts, branch.id, branch.masters, date, heure, dureeMax],
  );
  const peutEnsemble = libres.length >= 2 && lignes.length >= 2;

  const places = placeLeFoyer({
    tetes: lignes.map((l) => ({ clientId: l.tete.id, dureeMin: l.dureeMin })),
    maitresLibres: libres,
    maitreParDefaut: branch.masters[0] ?? '',
    heure,
    ensemble: ensemble && peutEnsemble,
  });

  const bascule = (id: string) => setPris((prev) => {
    const suite = { ...prev };
    if (suite[id]) delete suite[id]; else suite[id] = { serviceIds: [] };
    return suite;
  });

  const poser = () => {
    if (lignes.length < 2) { toast('Cochez au moins deux têtes du foyer.'); return; }
    const sans = lignes.find((l) => l.ids.length === 0);
    if (sans) { toast(`Ajoutez au moins une prestation pour ${sans.tete.name.split(' ')[0]}.`); return; }
    const foyerId = `fo-${uid()}`;
    const neufs: Appointment[] = places.map((p) => {
      const l = lignes.find((x) => x.tete.id === p.clientId)!;
      return {
        id: `ap-${uid()}`,
        branchId: branch.id,
        clientId: l.tete.id,
        clientName: l.tete.name,
        serviceIds: l.ids,
        date,
        time: p.time,
        master: p.master,
        status: 'confirmé',
        source: 'trone',
        foyerId,
        dureeMin: l.dureeMin,
        /* LE PRIX SE FIGE QUAND IL EST PERSONNEL, comme à la modale : sans
           cela, la fiche relirait le catalogue et contredirait le comptoir. */
        ...(l.perso ? { priceXof: l.prixXof } : {}),
        ...(famPct > 0 ? { remiseFamille: true as const, discountPct: famPct } : {}),
      } as Appointment;
    });
    appointmentsStore.set((prev) => [...prev, ...neufs]);
    toast(`${neufs.length} rendez-vous posés pour le foyer, le ${date}.`);
    onClose();
  };

  if (!client) return null;

  return (
    <Modal title={`Rendez-vous du foyer · ${famille?.name ?? client.name}`} onClose={onClose} width={560}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {tetes.length < 2 ? (
          <div className="tre-inline-note">
            <span className="mark">!</span>
            <span>
              {famille
                ? <>Ce foyer ne compte qu’une tête. Rattachez-en une autre depuis <b>Comptes &amp; Avoirs</b>, et le rendez-vous du foyer s’ouvrira.</>
                : <><b>{client.name}</b> n’a pas encore de foyer. Ouvrez-en un dans <b>Comptes &amp; Avoirs</b> : il désigne le payeur, pose la remise et tient un seul compteur de Cercle pour tout le monde.</>}
            </span>
          </div>
        ) : (
          <>
            <div>
              <div className="mnd-eyebrow" style={{ fontSize: 9.5, marginBottom: 8 }}>Qui vient</div>
              {tetes.map((t) => {
                const coche = !!pris[t.id];
                const l = lignes.find((x) => x.tete.id === t.id);
                return (
                  <div
                    key={t.id}
                    style={{
                      border: `1px solid ${coche ? 'var(--copper-300)' : 'var(--hairline)'}`,
                      borderLeft: coche ? '3px solid var(--color-copper)' : '1px solid var(--hairline)',
                      background: coche ? 'var(--copper-50)' : 'var(--surface-card)',
                      borderRadius: 3, padding: '11px 13px', marginBottom: 9,
                    }}
                  >
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                      <input type="checkbox" checked={coche} onChange={() => bascule(t.id)} style={{ accentColor: 'var(--color-copper)' }} />
                      <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--color-indigo)' }}>
                        {t.name}
                        {t.lockCount ? <span className="mnd-muted" style={{ fontFamily: 'var(--font-sans)', fontSize: 11 }}> · {t.lockCount} locks</span> : null}
                      </span>
                      {l && l.prixXof > 0 && (
                        <span style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--color-indigo)' }}>
                          {fmtMoney(l.prixXof, currency)}
                        </span>
                      )}
                    </label>
                    {coche && (
                      <div style={{ marginTop: 9 }}>
                        <Select
                          value=""
                          onChange={(e) => {
                            if (!e.target.value) return;
                            const v = e.target.value;
                            setPris((prev) => ({ ...prev, [t.id]: { serviceIds: [...prev[t.id].serviceIds, v] } }));
                            e.currentTarget.value = '';
                          }}
                          style={{ borderStyle: 'dashed', color: 'var(--copper-600)' }}
                        >
                          <option value="" disabled>+ Ajouter une prestation…</option>
                          {/* CHAQUE TÊTE VOIT SA SECTION. Sur le rendez-vous du
                              foyer, l'enfant voit MND Kids et la mère ne la voit
                              pas, dans le même écran. */}
                          <OptionsPrestations
                            services={services.filter((sv) => !sv.reserveEnfants || estKids(t, todayISO()) !== 'non')}
                            exclure={(sv) => pris[t.id].serviceIds.includes(sv.id)}
                          />
                        </Select>
                        {pris[t.id].serviceIds.length > 0 && (
                          <div style={{ marginTop: 7, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {pris[t.id].serviceIds.map((id, i) => (
                              <button
                                key={`${id}-${i}`} type="button" className="tre-chip"
                                onClick={() => setPris((prev) => ({
                                  ...prev,
                                  [t.id]: { serviceIds: prev[t.id].serviceIds.filter((_, k) => k !== i) },
                                }))}
                                title="Retirer"
                              >
                                {byId.get(id)?.name ?? 'Prestation retirée'} ✕
                              </button>
                            ))}
                          </div>
                        )}
                        {l && l.dureeMin > 0 && pris[t.id].serviceIds.length > 0 && (
                          <div className="mnd-muted" style={{ fontSize: 10.5, marginTop: 6 }}>
                            {Math.floor(l.dureeMin / 60) > 0 ? `${Math.floor(l.dureeMin / 60)} h ` : ''}
                            {l.dureeMin % 60 > 0 ? `${l.dureeMin % 60} min` : ''} au fauteuil
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="tr-grid tr-grid--2">
              <Field label="Date">
                <input className="mnd-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label="Heure">
                <Select value={heure} onChange={(e) => setHeure(e.target.value)}>
                  {!TIME_SLOTS.includes(heure) && <option value={heure}>{heure}</option>}
                  {TIME_SLOTS.map((t) => <option key={t} value={t}>{t}</option>)}
                </Select>
              </Field>
            </div>

            {/* « ENSEMBLE » NE PARAÎT QUE SI L'AGENDA LE PERMET. Deux têtes au
                même créneau demandent deux maîtres libres ; promettre deux
                fauteuils qui n'existent pas se paie à l'arrivée. */}
            {lignes.length >= 2 && (
              <div>
                <div className="mnd-eyebrow" style={{ fontSize: 9.5, marginBottom: 8 }}>Le moment</div>
                <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
                  <button
                    type="button" className={`tre-chip ${ensemble && peutEnsemble ? 'is-on' : ''}`}
                    disabled={!peutEnsemble} onClick={() => setEnsemble(true)}
                    title={peutEnsemble ? undefined : 'Il faut deux maîtres libres à cette heure'}
                  >
                    Ensemble · {heure}
                  </button>
                  <button
                    type="button" className={`tre-chip ${!ensemble || !peutEnsemble ? 'is-on' : ''}`}
                    onClick={() => setEnsemble(false)}
                  >
                    À la suite
                  </button>
                </div>
                {!peutEnsemble && (
                  <div className="mnd-muted" style={{ fontSize: 10.5, marginTop: 6 }}>
                    {libres.length === 0
                      ? 'Aucun maître libre à cette heure : elles passeront à la suite.'
                      : 'Un seul maître libre à cette heure : elles passeront à la suite.'}
                  </div>
                )}
                <div style={{ marginTop: 10 }}>
                  {places.map((p) => {
                    const t = tetes.find((x) => x.id === p.clientId);
                    return (
                      <div key={p.clientId} style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '6px 0', borderTop: '1px solid var(--hairline)', fontSize: 12.5 }}>
                        <span style={{ flex: 1, minWidth: 0, color: 'var(--color-indigo)' }}>{t?.name}</span>
                        <span className="mnd-muted" style={{ fontVariantNumeric: 'tabular-nums' }}>{p.time} · {p.master}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {totalXof > 0 && (
              <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                <span className="mnd-eyebrow" style={{ fontSize: 9.5 }}>Le foyer règle</span>
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 24, color: 'var(--color-indigo)' }}>{fmtMoney(netXof, currency)}</span>
                {famPct > 0 && (
                  <span className="mnd-muted" style={{ flex: '1 1 100%', fontSize: 11 }}>
                    {fmtMoney(totalXof, currency)} moins la remise famille de {famPct} %
                  </span>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <Button variant="ghost" style={{ flex: 1 }} onClick={onClose}>Annuler</Button>
              <Button style={{ flex: 1 }} onClick={poser} disabled={lignes.length < 2}>
                Poser {places.length > 0 ? places.length : ''} rendez-vous
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

/** L'HÔTE — monté UNE fois dans la coquille. Il se déclare à
    `poseLHoteDuFoyer`, et toute modale de rendez-vous peut dès lors ouvrir le
    foyer sans rien savoir de lui.

    IL SE RETIRE EN PARTANT : un hôte démonté qui resterait déclaré ferait
    appeler un `setState` sur un composant mort, et le lien ne s'ouvrirait plus
    jamais. */
export function RdvFoyerHote() {
  const [pour, setPour] = useState<string | null>(null);
  useEffect(() => {
    poseLHoteDuFoyer((clientId) => setPour(clientId));
    return () => poseLHoteDuFoyer(null);
  }, []);
  if (!pour) return null;
  return <RdvFoyerModal clientId={pour} onClose={() => setPour(null)} />;
}
