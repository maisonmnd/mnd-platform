import { asset } from '../../../../shared/asset';
import { useMemo, useState } from 'react';
import { PageHead, WaLien } from '../_ui';
import { Card, Input } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { useClients, useFamilies, estDePassage, aUnPrixConvenu, comptePrixConvenus, type Client } from '../../../../shared/clients';
import { useAppointments, venuesDeLAnnee } from '../../../../shared/agenda';
import { estDependant, depenseFoyerXof } from '../../../../shared/accounts';
import { useServices } from '../../../../shared/catalog';
import { useStore } from '../../../../shared/store';
import { cercleSeuilStore, estDuCercle, useFoyerTiers, meilleurPalierFoyer, type FoyerTier } from '../../../../shared/offers';
import { nomDuRang, rangSuivant, soinsEnAttente } from '../../../../shared/parrainage-pur';
import { pointsHistoryStore } from './data';
import { Bar, Pill, Tabs } from './ui';
import Parrainages from './Parrainages';
import './equipe.css';
import { appelDe } from '../../../../shared/civilite';

/* ══ LE CERCLE MND, RÉUNI — 29 septembre 2026 (maquette « Le Cercle réuni »,
   validée) ══════════════════════════════════════════════════════════════
   Le Cercle et les ambassadrices ne font plus qu'un écran, à deux onglets :
     · Les ambassadrices : les chiffres, le classement, TOUS les réglages
       (dont l'entrée au Cercle et les sceaux du Foyer) ;
     · Membres et Foyers : les registres d'avant (membres, aux portes,
       foyers, prix convenus), chaque membre avec son RANG d'ambassadrice.
   LES POINTS SONT PARTIS : éteints depuis juillet, jamais reliés à la caisse,
   aucun sceau à points créé. Leur historique reste lisible en archive ; rien
   n'est effacé. Un sceau du Foyer atteint se pose désormais tout seul comme
   une récompense (useParrainageVivant), la caisse l'offre. */

type Tab = 'ambassadrices' | 'membres' | 'archive';

export default function Cercle() {
  const { branch, currency } = useBranch();
  const [clients] = useClients();
  const [families] = useFamilies();
  const [appts] = useAppointments();
  const [services] = useServices();
  const [foyerTiers] = useFoyerTiers();
  const [history] = useStore(pointsHistoryStore);
  const [seuil] = useStore(cercleSeuilStore);
  const [tab, setTab] = useState<Tab>('ambassadrices');
  const [recherche, setRecherche] = useState('');
  const [vue, setVue] = useState<'membres' | 'portes' | 'foyers' | 'convenus'>('membres');
  const [montre, setMontre] = useState(20);
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const sortedFoyerTiers = useMemo(() => [...foyerTiers].sort((a, b) => a.seuilXof - b.seuilXof), [foyerTiers]);

  const venuesDe = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of clients) m.set(c.id, venuesDeLAnnee(appts, c.id));
    return m;
  }, [clients, appts]);
  const eligibleCercle = (c: Client): boolean => !aUnPrixConvenu(c) && !estDependant(c, families);
  const branchClients = useMemo(
    () => clients.filter((c) => c.branchId === branch.id && !c.archived),
    [clients, branch.id],
  );
  /* Les membres d'abord par le nombre d'amies venues, puis par leurs venues. */
  const members = useMemo(
    () => branchClients
      .filter((c) => eligibleCercle(c) && estDuCercle(venuesDe.get(c.id) ?? 0, seuil))
      .sort((a, b) => (b.parrainage?.venues ?? 0) - (a.parrainage?.venues ?? 0) || (venuesDe.get(b.id) ?? 0) - (venuesDe.get(a.id) ?? 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [branchClients, venuesDe, seuil, families],
  );
  const auxPortes = useMemo(
    () => branchClients
      .filter((c) => eligibleCercle(c) && !estDuCercle(venuesDe.get(c.id) ?? 0, seuil) && !estDePassage(c) && (venuesDe.get(c.id) ?? 0) > 0)
      .sort((a, b) => (venuesDe.get(b.id) ?? 0) - (venuesDe.get(a.id) ?? 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [branchClients, venuesDe, seuil, families],
  );
  const foyersList = useMemo(() => branchClients
    .filter((c) => c.familyId && families.some((f) => f.id === c.familyId))
    .reduce((acc, c) => {
      if (acc.some((x) => x.famId === c.familyId)) return acc;
      const fam = families.find((f) => f.id === c.familyId)!;
      const payeur = branchClients.find((x) => x.id === fam.payerClientId) ?? c;
      const depense = depenseFoyerXof(payeur, clients, families, appts);
      const palier = meilleurPalierFoyer(depense, foyerTiers);
      const prochain = sortedFoyerTiers.find((t) => depense < t.seuilXof) ?? null;
      acc.push({ famId: fam.id, nom: fam.name, depense, palier, prochain, phone: payeur.phone, prenom: payeur.name.split(' ')[0] });
      return acc;
    }, [] as { famId: string; nom: string; depense: number; palier: FoyerTier | null; prochain: FoyerTier | null; phone?: string; prenom: string }[])
    .sort((a, b) => b.depense - a.depense),
  [branchClients, families, clients, appts, foyerTiers, sortedFoyerTiers]);
  const convenusList = useMemo(
    () => branchClients.filter((c) => aUnPrixConvenu(c)).slice().sort((a, b) => a.name.localeCompare(b.name)),
    [branchClients],
  );
  const serviceName = (id: string) => services.find((s) => s.id === id)?.name ?? 'Prestation retirée du catalogue';

  const onglets: { k: Tab; l: string }[] = [
    { k: 'ambassadrices', l: 'Les ambassadrices' },
    { k: 'membres', l: 'Membres et Foyers' },
    ...(history.length > 0 ? [{ k: 'archive' as const, l: 'Archive des points' }] : []),
  ];

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="Marketing & Fidélité"
        title="Le Cercle MND"
        sub="Ce qu’elle vit à la Maison, et ce qu’elle transmet. Un seul Cercle."
      />
      <Tabs<Tab> tabs={onglets} value={tab} onChange={setTab} />

      {tab === 'ambassadrices' && <Parrainages dansLeCercle />}

      {tab === 'membres' && (() => {
        const q = recherche.trim().toLowerCase();
        const qTel = q.replace(/\s/g, '');
        const cherche = (l: Client[]) => (q
          ? l.filter((c) => c.name.toLowerCase().includes(q) || (qTel !== '' && (c.phone ?? '').replace(/\s/g, '').includes(qTel)))
          : l);
        const mbr = cherche(members);
        const portes = cherche(auxPortes);
        const foyersF = q ? foyersList.filter((f) => f.nom.toLowerCase().includes(q)) : foyersList;
        const convenusF = cherche(convenusList);
        const visibles = vue === 'membres' ? mbr : portes.slice(0, montre);
        const caches = vue === 'portes' ? Math.max(0, portes.length - visibles.length) : 0;
        const puce = (k: typeof vue, l: string, n: number) => (
          <button className={`tre-chip ${vue === k ? 'is-on' : ''}`} onClick={() => setVue(k)}>
            {l} <span style={{ opacity: .6, marginLeft: 4 }}>{n}</span>
          </button>
        );
        return (
          <div>
            <div className="tre-reg__barre">
              <Input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Chercher une tête (nom, téléphone)…" style={{ flex: '1 1 240px', minWidth: 0 }} />
              {puce('membres', 'Membres', mbr.length)}
              {puce('portes', 'Aux portes', portes.length)}
              {puce('foyers', 'Foyers', foyersF.length)}
              {puce('convenus', 'Prix convenus', convenusF.length)}
            </div>
            <p className="mnd-muted" style={{ fontSize: 12, margin: '0 0 10px' }}>
              On entre au Cercle à sa {seuil}ᵉ venue sur les douze derniers mois, par ses propres venues, et on y reste tant qu’on les garde. Un prix convenu et une tête dépendante sont reconnus autrement (le prix, le Foyer).
            </p>

            {(vue === 'membres' || vue === 'portes') && visibles.length === 0 && (
              <Card className="tre-empty">
                <img src={asset('/assets/monograms/mono-indigo.png')} alt="" style={{ width: 36, opacity: 0.4 }} />
                <div className="tre-empty__title">{q ? 'Aucune tête à ce nom.' : vue === 'membres' ? 'Personne n’est encore entré.' : 'Aucune tête en approche.'}</div>
                <div className="tre-empty__sub">{q ? 'Cherchez sur une autre orthographe, ou changez de registre.' : `Le Cercle s’ouvre au ${seuil}ᵉ passage.`}</div>
              </Card>
            )}

            {(vue === 'membres' || vue === 'portes') && visibles.length > 0 && (
              <div className="tre-reg">
                {visibles.map((c) => {
                  const membre = vue === 'membres';
                  const v = venuesDe.get(c.id) ?? 0;
                  const amies = c.parrainage?.venues ?? 0;
                  const suivant = rangSuivant(amies);
                  const attente = soinsEnAttente(c.soinsOfferts, aujourdhui).length;
                  const pct = membre
                    ? (suivant ? Math.round((amies / suivant.seuil) * 100) : 100)
                    : Math.round((v / Math.max(1, seuil)) * 100);
                  return (
                    <div key={c.id} className="tre-reg__row">
                      <span className="tre-avatar" style={{ width: 26, height: 26, fontSize: 11 }}>{c.name.slice(0, 1)}</span>
                      <span className="tre-reg__ident">
                        <span className="tre-reg__nom">{c.name}</span>
                        <span className="tre-reg__meta">
                          {membre
                            ? `${nomDuRang(c.parrainage?.rang)}${c.codeParrain ? ` · ${c.codeParrain}` : ''}${amies ? ` · ${amies} amie${amies > 1 ? 's' : ''} venue${amies > 1 ? 's' : ''}` : ''}${attente ? ` · ${attente} récompense${attente > 1 ? 's' : ''} à utiliser` : ''}`
                            : `encore ${Math.max(1, seuil - v)} venue${Math.max(1, seuil - v) > 1 ? 's' : ''} avant le Cercle`}
                        </span>
                      </span>
                      <span className="tre-reg__jauge"><Bar pct={pct} /></span>
                      <span className="tre-reg__pts" title="Venues des douze derniers mois">{membre ? `${v} / an` : `${v}/${seuil}`}</span>
                      {c.phone
                        ? <WaLien phone={c.phone} message={`Bonjour ${appelDe(c)}, la Maison MND est heureuse de vous compter dans son Cercle.`} style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--copper-700)' }} />
                        : <span />}
                    </div>
                  );
                })}
              </div>
            )}
            {caches > 0 && (
              <button className="tre-chip" style={{ marginTop: 12 }} onClick={() => setMontre((n) => n + 40)}>
                Afficher {Math.min(40, caches)} tête{Math.min(40, caches) > 1 ? 's' : ''} de plus · {caches} restante{caches > 1 ? 's' : ''}
              </button>
            )}

            {vue === 'foyers' && (foyersF.length === 0 ? (
              <Card className="tre-empty">
                <img src={asset('/assets/monograms/mono-indigo.png')} alt="" style={{ width: 36, opacity: 0.4 }} />
                <div className="tre-empty__title">{q ? 'Aucun foyer à ce nom.' : 'Aucun compte famille pour l’instant.'}</div>
                <div className="tre-empty__sub">Les comptes famille apparaissent ici avec leur dépense cumulée et le sceau atteint.</div>
              </Card>
            ) : (
              <div className="tre-reg">
                {foyersF.map((f) => {
                  const pct = f.prochain ? Math.round((f.depense / Math.max(1, f.prochain.seuilXof)) * 100) : 100;
                  return (
                    <div key={f.famId} className="tre-reg__row">
                      <span className="tre-avatar" style={{ width: 26, height: 26, fontSize: 11 }}>{f.nom.slice(0, 1)}</span>
                      <span className="tre-reg__ident">
                        <span className="tre-reg__nom">{f.nom}</span>
                        <span className="tre-reg__meta">
                          {f.palier
                            ? `Sceau « ${serviceName(f.palier.serviceId)} » posé dans ses récompenses`
                            : f.prochain
                              ? `encore ${fmtMoney(Math.max(0, f.prochain.seuilXof - f.depense), currency)} avant un sceau`
                              : 'aucun sceau du Foyer défini'}
                        </span>
                      </span>
                      <span className="tre-reg__jauge"><Bar pct={pct} /></span>
                      <span className="tre-reg__pts">{fmtMoney(f.depense, currency)}</span>
                      {f.phone
                        ? <WaLien phone={f.phone} message={f.palier
                          ? `Bonjour ${f.prenom}, un geste attend votre foyer à la Maison MND : « ${serviceName(f.palier.serviceId)} », offert à la maisonnée.`
                          : `Bonjour ${f.prenom}, la Maison MND revient vers votre foyer « ${f.nom} ».`} style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--copper-700)' }} />
                        : <span />}
                    </div>
                  );
                })}
              </div>
            ))}

            {vue === 'convenus' && (convenusF.length === 0 ? (
              <Card className="tre-empty">
                <img src={asset('/assets/monograms/mono-indigo.png')} alt="" style={{ width: 36, opacity: 0.4 }} />
                <div className="tre-empty__title">{q ? 'Aucune tête à ce nom.' : 'Aucun prix convenu pour l’instant.'}</div>
                <div className="tre-empty__sub">Une tête à qui un prix ferme est accordé (fiche → Ses prix fermes) apparaît ici.</div>
              </Card>
            ) : (
              <div className="tre-reg">
                {convenusF.map((c) => {
                  const n = comptePrixConvenus(c);
                  return (
                    <div key={c.id} className="tre-reg__row">
                      <span className="tre-avatar" style={{ width: 26, height: 26, fontSize: 11 }}>{c.name.slice(0, 1)}</span>
                      <span className="tre-reg__ident">
                        <span className="tre-reg__nom">{c.name}</span>
                        <span className="tre-reg__meta">{n} prix ferme{n > 1 ? 's' : ''} · le prix est sa reconnaissance</span>
                      </span>
                      <span className="tre-reg__jauge" />
                      <span className="tre-reg__pts" style={{ fontSize: 11, letterSpacing: '.04em', color: 'var(--copper-700)' }}>Prix convenu</span>
                      {c.phone
                        ? <WaLien phone={c.phone} message={`Bonjour ${appelDe(c)}, la Maison MND revient vers vous.`} style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--copper-700)' }} />
                        : <span />}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        );
      })()}

      {tab === 'archive' && (
        <div>
          <p className="mnd-muted" style={{ fontSize: 12.5, margin: '0 0 12px' }}>
            Les points ont quitté le Cercle le 29 septembre 2026 : éteints depuis juillet, jamais reliés à la caisse. Leur registre reste ici, en lecture seule.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {history.map((h) => (
              <Card key={h.id} style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12.5 }}>{h.clientName}</div>
                  <div className="mnd-muted" style={{ fontSize: 10.5 }}>{h.label} · {new Date(h.at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                </div>
                <Pill tone={h.pts < 0 ? 'copper' : 'ok'}>{h.pts > 0 ? '+' : '−'}{Math.abs(h.pts).toLocaleString('fr-FR')} pts</Pill>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
