import { asset } from '../../../../shared/asset';
import { useMemo, useState } from 'react';
import { OptionsPrestations, PageHead, WaLien } from '../_ui';
import { Button, Card, Field, Input, Modal, Select, toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { useClients, useFamilies, clientsStore, estDePassage, aUnPrixConvenu, comptePrixConvenus, type Client } from '../../../../shared/clients';
import { useAppointments, venuesHonorees } from '../../../../shared/agenda';
import { estDependant, depenseFoyerXof } from '../../../../shared/accounts';
import { useServices, useCategories, catsDansLOrdre } from '../../../../shared/catalog';
import { useStore, uid } from '../../../../shared/store';
import { cercleSeuilStore, foyerSeuilStore, estDuCercle, useFoyerTiers, meilleurPalierFoyer, type FoyerTier } from '../../../../shared/offers';
import {
  pointsHistoryStore, pointsRateStore, pointsEnabledStore, useTiers,
  type PointsEvent, type RewardTier,
} from './data';
import { Bar, Pill, Tabs, Toggle } from './ui';
import './equipe.css';

type Tab = 'points' | 'membres' | 'offrandes';

const ROMANS = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ', 'Ⅷ'];

type TierForm = { pts: string; serviceId: string; desc: string };

export default function Cercle() {
  const { branch, currency } = useBranch();
  const [clients] = useClients();
  const [families] = useFamilies();
  const [appts] = useAppointments();
  const [services] = useServices();
  /* LE MENU DES PRESTATIONS, RANGÉ COMME LE CATALOGUE (25 août) — le tri par
     atelier est né ici, puis Yéman a demandé la même chose PARTOUT (28 août).
     Il vit désormais dans `OptionsPrestations`, partagé par les huit écrans :
     huit tris copiés auraient divergé au premier ajout de catégorie. */
  const [tiers, setTiers] = useTiers();
  const [rate, setRate] = useStore(pointsRateStore);
  const [pointsOn, setPointsOn] = useStore(pointsEnabledStore);
  const [history, setHistory] = useStore(pointsHistoryStore);
  const [tab, setTab] = useState<Tab>('points');
  const [tierModal, setTierModal] = useState(false);
  const [tierEditId, setTierEditId] = useState<string | null>(null);
  /* Un seul formulaire pour les deux échelles : `tierKind` dit laquelle. Pour le
     Foyer, le champ numérique porte un SEUIL en F cumulés, pas des points. */
  const [tierKind, setTierKind] = useState<'cercle' | 'foyer'>('cercle');
  const [tierForm, setTierForm] = useState<TierForm>({ pts: '', serviceId: services[0]?.id ?? '', desc: '' });
  const [foyerTiers, setFoyerTiers] = useFoyerTiers();
  const sortedFoyerTiers = useMemo(() => [...foyerTiers].sort((a, b) => a.seuilXof - b.seuilXof), [foyerTiers]);
  const [adjust, setAdjust] = useState<Record<string, string>>({});
  /* LE REGISTRE ÉTAIT UN MUR. Une carte par tête, deux par ligne : cinq membres
     et cent cinquante-deux têtes aux portes faisaient cinq mille pixels de
     défilement pour ajuster un solde. On cherche une tête par son nom, on ne la
     croise pas en descendant. D'où la recherche, les deux registres séparés, et
     les gestes repliés sous la ligne qui les concerne. */
  const [recherche, setRecherche] = useState('');
  const [vue, setVue] = useState<'membres' | 'portes' | 'foyers' | 'convenus'>('membres');
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [montre, setMontre] = useState(20);

  /* LE CERCLE N'EST PAS LE CARNET. « Têtes dans le Cercle » comptait TOUTES les
     clientes de la branche : un registre qui dit « 186 membres » d'un programme
     où personne n'est encore entré ne récompense plus rien, il décrit le carnet.
     On y entre au 3ᵉ passage — les autres sont AUX PORTES, et se voient aussi,
     parce que c'est là que se lit ce que la fidélité est en train de gagner. */
  const [seuil, setSeuil] = useStore(cercleSeuilStore);
  const [seuilFoyer, setSeuilFoyer] = useStore(foyerSeuilStore);
  /* PAR TÊTE, plus par la payeuse (25 août) : le Cercle récompense SES propres
     venues. Les têtes à prix convenu et les dépendantes (enfants, membres non
     payeurs) sont reconnues ailleurs — elles n'entrent pas ici. */
  const venuesDe = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of clients) m.set(c.id, venuesHonorees(appts, c.id, false));
    return m;
  }, [clients, appts]);
  const eligibleCercle = (c: Client): boolean => !aUnPrixConvenu(c) && !estDependant(c, families);

  const branchClients = useMemo(
    () => clients.filter((c) => c.branchId === branch.id && !c.archived)
      .sort((a, b) => b.loyaltyPoints - a.loyaltyPoints),
    [clients, branch.id],
  );
  const members = useMemo(
    () => branchClients.filter((c) => eligibleCercle(c) && estDuCercle(venuesDe.get(c.id) ?? 0, seuil)),
    [branchClients, venuesDe, seuil, families],
  );
  /* Aux portes — il leur manque une venue ou deux. Une passante n'y figure pas :
     elle n'a pas encore de relation à faire mûrir. Une tête à prix convenu ou
     dépendante non plus : sa reconnaissance passe par un autre chemin. */
  const auxPortes = useMemo(
    () => branchClients
      .filter((c) => eligibleCercle(c) && !estDuCercle(venuesDe.get(c.id) ?? 0, seuil) && !estDePassage(c) && (venuesDe.get(c.id) ?? 0) > 0)
      .sort((a, b) => (venuesDe.get(b.id) ?? 0) - (venuesDe.get(a.id) ?? 0)),
    [branchClients, venuesDe, seuil, families],
  );
  const sortedTiers = useMemo(() => [...tiers].sort((a, b) => a.pts - b.pts), [tiers]);

  /* LES COMPTES RECONNUS AUTREMENT (25 août) — exclus du Cercle, ils se
     remplissent d'eux-mêmes ici : les FOYERS (un par famille, sur sa dépense
     cumulée et son palier) et les PRIX CONVENUS. On les voit sans les chercher. */
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
  const servicePrice = (id: string) => services.find((s) => s.id === id)?.priceXof ?? 0;

  const nextTierFor = (pts: number) => sortedTiers.find((t) => t.pts > pts) ?? null;
  const bestTierFor = (pts: number) => {
    const eligible = sortedTiers.filter((t) => t.pts <= pts);
    return eligible.length ? eligible[eligible.length - 1] : null;
  };

  const openTierNew = (kind: 'cercle' | 'foyer' = 'cercle') => {
    setTierKind(kind);
    setTierEditId(null);
    setTierForm({ pts: '', serviceId: services[0]?.id ?? '', desc: '' });
    setTierModal(true);
  };
  const openTierEdit = (t: RewardTier) => {
    setTierKind('cercle');
    setTierEditId(t.id);
    setTierForm({ pts: String(t.pts), serviceId: t.serviceId, desc: t.desc });
    setTierModal(true);
  };
  const openFoyerTierEdit = (t: FoyerTier) => {
    setTierKind('foyer');
    setTierEditId(t.id);
    setTierForm({ pts: String(t.seuilXof), serviceId: t.serviceId, desc: t.desc });
    setTierModal(true);
  };
  const saveTier = () => {
    const n = parseInt(tierForm.pts, 10);
    /* Un refus se dit — même leçon que les formules, le 28 août. */
    if (!n || n <= 0) { toast('Posez le seuil du palier.'); return; }
    if (!tierForm.serviceId) { toast('Choisissez la prestation offerte.'); return; }
    if (tierKind === 'foyer') {
      if (tierEditId) {
        setFoyerTiers((prev) => prev.map((t) => (t.id === tierEditId ? { ...t, seuilXof: n, serviceId: tierForm.serviceId, desc: tierForm.desc } : t)));
      } else {
        setFoyerTiers((prev) => [...prev, { id: `ftier-${uid()}`, seuilXof: n, serviceId: tierForm.serviceId, desc: tierForm.desc, g: '' }]);
      }
    } else if (tierEditId) {
      setTiers((prev) => prev.map((t) => (t.id === tierEditId ? { ...t, pts: n, serviceId: tierForm.serviceId, desc: tierForm.desc } : t)));
    } else {
      setTiers((prev) => [...prev, { id: `tier-${uid()}`, pts: n, serviceId: tierForm.serviceId, desc: tierForm.desc, g: '' }]);
    }
    setTierModal(false);
  };

  const redeem = (c: Client, t: RewardTier) => {
    clientsStore.set((prev) => prev.map((x) => (x.id === c.id ? { ...x, loyaltyPoints: Math.max(0, x.loyaltyPoints - t.pts) } : x)));
    const evt: PointsEvent = {
      id: `pe-${uid()}`, clientId: c.id, clientName: c.name,
      label: `« ${serviceName(t.serviceId)} » offert`, pts: -t.pts, at: new Date().toISOString(),
    };
    setHistory((prev) => [evt, ...prev]);
  };

  const applyAdjust = (c: Client, sign: 1 | -1) => {
    const raw = parseInt(adjust[c.id] ?? '', 10);
    if (!raw || raw <= 0) return;
    const delta = raw * sign;
    clientsStore.set((prev) => prev.map((x) => (x.id === c.id ? { ...x, loyaltyPoints: Math.max(0, x.loyaltyPoints + delta) } : x)));
    const evt: PointsEvent = {
      id: `pe-${uid()}`, clientId: c.id, clientName: c.name,
      label: delta > 0 ? 'Ajustement manuel · points accordés' : 'Ajustement manuel · points retirés',
      pts: delta, at: new Date().toISOString(),
    };
    setHistory((prev) => [evt, ...prev]);
    setAdjust((prev) => ({ ...prev, [c.id]: '' }));
  };

  const totalPoints = members.reduce((a, c) => a + c.loyaltyPoints, 0);

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="Le Cercle MND · transmission & lignée"
        title="Le Cercle."
        sub={`${branch.name}, les points témoignent d’une fidélité ; la maison les rend en offrant ce qu’elle sait faire de mieux : un soin.`}
        actions={<Button variant="copper" onClick={() => openTierNew('cercle')}>+ Nouveau palier</Button>}
      />

      {/* Le programme n'attribue RIEN tant que la maison ne l'a pas lancé — pas de
          points accumulés en coulisses avant le jour officiel. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', border: '1px solid var(--hairline)', borderLeft: '3px solid var(--color-copper)', borderRadius: 'var(--radius-md)', background: 'var(--surface-card)', padding: '13px 16px', marginBottom: 22 }}>
        <Toggle on={pointsOn} onToggle={() => setPointsOn(!pointsOn)} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--ink)' }}>
            Attribution des points : <b>{pointsOn ? 'active' : 'coupée'}</b>
          </div>
          <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 2 }}>
            {pointsOn
              ? 'Chaque rituel honoré attribue ses points (1 point / ' + rate + ' F).'
              : 'Aucun point n’est attribué aux encaissements ni aux rituels honorés, activez le jour du lancement du programme.'}
          </div>
        </div>
      </div>

      <div className="tr-grid tr-grid--4" style={{ marginBottom: 22 }}>
        <Card filet="copper" style={{ padding: 18 }}>
          <div className="mnd-stat__label">Têtes dans le Cercle</div>
          <div className="mnd-stat__value" style={{ fontSize: 32 }}>{members.length}</div>
          <div className="mnd-muted" style={{ fontSize: 11, marginTop: 6 }}>
            entrées au {seuil}ᵉ passage{auxPortes.length > 0 ? ` · ${auxPortes.length} aux portes` : ''}
          </div>
        </Card>
        <Card filet="indigo" style={{ padding: 18 }}>
          <div className="mnd-stat__label">Points en circulation</div>
          <div className="mnd-stat__value" style={{ fontSize: 32 }}>{totalPoints.toLocaleString('fr-FR')}</div>
          <div className="mnd-muted" style={{ fontSize: 11, marginTop: 6 }}>jamais de date d’expiration</div>
        </Card>
        <Card filet="indigo" style={{ padding: 18 }}>
          <div className="mnd-stat__label">Paliers de récompense</div>
          <div className="mnd-stat__value" style={{ fontSize: 32 }}>{sortedTiers.length}</div>
          <div className="mnd-muted" style={{ fontSize: 11, marginTop: 6 }}>points → services offerts</div>
        </Card>
        <Card filet="copper" style={{ padding: 18 }}>
          <div className="mnd-stat__label">Prêtes à être honorées</div>
          <div className="mnd-stat__value" style={{ fontSize: 32 }}>{members.filter((c) => bestTierFor(c.loyaltyPoints)).length}</div>
          <div className="mnd-muted" style={{ fontSize: 11, marginTop: 6 }}>un seuil est déjà franchi</div>
        </Card>
      </div>

      <Tabs<Tab>
        tabs={[{ k: 'points', l: 'Les paliers' }, { k: 'membres', l: 'Registre des soldes' }, { k: 'offrandes', l: 'Registre des offrandes' }]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'points' && (
        <div>
          <Card style={{ padding: '20px 22px', marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 21, color: 'var(--color-indigo)' }}>Comment se méritent les points</div>
                <div className="mnd-muted" style={{ fontSize: 12.5, fontWeight: 300, marginTop: 4 }}>
                  Chaque dépense élève la couronne, jamais de date d’expiration, jamais de petits caractères.
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--hairline)', borderRadius: 2, padding: '8px 12px' }}>
                  <span className="mnd-muted" style={{ fontSize: 10 }}>on entre au</span>
                  <Input
                    type="number"
                    min={1}
                    value={seuil}
                    onChange={(e) => { const n = parseInt(e.target.value, 10); setSeuil(n > 0 ? n : 1); }}
                    style={{ width: 62, textAlign: 'center', padding: '5px 7px' }}
                    aria-label="Nombre de passages pour entrer au Cercle"
                  />
                  <span className="mnd-muted" style={{ fontSize: 10 }}>ᵉ passage</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--hairline)', borderRadius: 2, padding: '8px 12px' }}>
                  <span className="mnd-muted" style={{ fontSize: 10 }}>1 point /</span>
                  <Input
                    type="number"
                    min={1}
                    value={rate}
                    onChange={(e) => { const n = parseInt(e.target.value, 10); setRate(n > 0 ? n : 1); }}
                    style={{ width: 72, textAlign: 'center', padding: '5px 7px' }}
                  />
                  <span className="mnd-muted" style={{ fontSize: 10 }}>F dépensés</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--hairline)', borderRadius: 2, padding: '8px 12px' }}>
                  <span className="mnd-muted" style={{ fontSize: 10 }}>Foyer dès</span>
                  <Input
                    type="number"
                    min={1}
                    step={10000}
                    value={seuilFoyer}
                    onChange={(e) => { const n = parseInt(e.target.value, 10); setSeuilFoyer(n > 0 ? n : 1); }}
                    style={{ width: 96, textAlign: 'center', padding: '5px 7px' }}
                    aria-label="Dépense cumulée du foyer pour le palier Foyer (F CFA)"
                  />
                  <span className="mnd-muted" style={{ fontSize: 10 }}>F cumulés</span>
                </div>
              </div>
            </div>
            {/* LA RÈGLE SE DIT, sinon un comptoir qui ne voit aucun point tomber
                croit à une panne et finit par en ajouter à la main. */}
            <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 12, lineHeight: 1.55, borderTop: '1px solid var(--hairline)', paddingTop: 12 }}>
              Le Cercle se gagne par SES propres venues, à plein tarif : une tête à prix convenu (le prix est déjà sa reconnaissance) et une tête dépendante (enfant, membre non payeur) n’y entrent pas — la famille est reconnue par le <b style={{ fontWeight: 500 }}>Foyer</b>, sur sa dépense cumulée ({fmtMoney(seuilFoyer, currency)}).
              Un passage ne donne pas le Cercle : la reconnaissance commence au {seuil}ᵉ, et rien n’est crédité après coup. Une venue = un jour où un rituel a été honoré ; deux gestes le même jour ne comptent qu’une fois.
            </div>
          </Card>

          <div className="tr-grid tr-grid--3">
            {sortedTiers.map((t, i) => (
              <Card key={t.id} className="tre-tier" filet="copper">
                <span className="tre-tier__seal">{ROMANS[i] ?? '✦'}</span>
                <div className="tre-tier__pts">{t.pts.toLocaleString('fr-FR')} pts</div>
                <div style={{ fontWeight: 500, fontSize: 12, marginTop: 6 }}>« {serviceName(t.serviceId)} » offert</div>
                <div className="mnd-muted" style={{ fontSize: 11, marginTop: 4, lineHeight: 1.4 }}>
                  {t.desc || `Valeur ${fmtMoney(servicePrice(t.serviceId), currency)}, offerte, sans frais.`}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button className="tre-chip" style={{ flex: 1, borderRadius: 2 }} onClick={() => openTierEdit(t)}>Modifier</button>
                  <button className="tre-chip" style={{ flex: 1, borderRadius: 2, color: '#8f3b30' }} onClick={() => setTiers((prev) => prev.filter((x) => x.id !== t.id))}>Retirer</button>
                </div>
              </Card>
            ))}
          </div>

          <div className="tre-quote" style={{ marginTop: 18 }}>
            « Le point ne s’achète pas au sens d’un solde bancaire, il témoigne d’une fidélité. La Maison le rend en offrant ce qu’elle sait faire de mieux : un soin. »
          </div>

          {/* ── LES PALIERS DU FOYER — la famille, sur sa dépense cumulée ── */}
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', margin: '34px 0 12px', borderTop: '1px solid var(--hairline)', paddingTop: 24 }}>
            <div>
              <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 24, color: 'var(--color-indigo)' }}>Les paliers du Foyer</div>
              <div className="mnd-muted" style={{ fontSize: 12.5, fontWeight: 300, marginTop: 2 }}>
                Franchis par la dépense CUMULÉE de la famille. Le geste s’offre de lui-même dès le seuil passé, sur Ma Couronne comme au comptoir.
              </div>
            </div>
            <Button variant="ghost" onClick={() => openTierNew('foyer')}>+ Palier Foyer</Button>
          </div>
          {sortedFoyerTiers.length === 0 ? (
            <div className="mnd-muted" style={{ fontSize: 12.5, border: '1px dashed var(--hairline)', borderRadius: 2, padding: '16px 18px' }}>
              Aucun palier Foyer encore. Ajoutez-en un : « à {fmtMoney(300000, currency)} cumulés, un soin offert à la maisonnée. »
            </div>
          ) : (
            <div className="tr-grid tr-grid--3">
              {sortedFoyerTiers.map((t, i) => (
                <Card key={t.id} className="tre-tier" filet="indigo">
                  <span className="tre-tier__seal">{ROMANS[i] ?? '✦'}</span>
                  <div className="tre-tier__pts">{fmtMoney(t.seuilXof, currency)} cumulés</div>
                  <div style={{ fontWeight: 500, fontSize: 12, marginTop: 6 }}>« {serviceName(t.serviceId)} » offert au foyer</div>
                  <div className="mnd-muted" style={{ fontSize: 11, marginTop: 4, lineHeight: 1.4 }}>
                    {t.desc || `Valeur ${fmtMoney(servicePrice(t.serviceId), currency)}, offerte à la famille, sans frais.`}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button className="tre-chip" style={{ flex: 1, borderRadius: 2 }} onClick={() => openFoyerTierEdit(t)}>Modifier</button>
                    <button className="tre-chip" style={{ flex: 1, borderRadius: 2, color: '#8f3b30' }} onClick={() => setFoyerTiers((prev) => prev.filter((x) => x.id !== t.id))}>Retirer</button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'membres' && (() => {
        const q = recherche.trim().toLowerCase();
        /* Un numéro se tape comme on le lit — « 60 16 » doit trouver
           « +229 01 60 16 32 46 ». On compare donc les deux sans leurs espaces. */
        const qTel = q.replace(/\s/g, '');
        const cherche = (l: Client[]) => (q
          ? l.filter((c) => c.name.toLowerCase().includes(q)
            || (qTel !== '' && (c.phone ?? '').replace(/\s/g, '').includes(qTel)))
          : l);
        const mbr = cherche(members);
        const portes = cherche(auxPortes);
        const foyersF = q ? foyersList.filter((f) => f.nom.toLowerCase().includes(q)) : foyersList;
        const convenusF = cherche(convenusList);
        /* AUX PORTES, ON N'AFFICHE PAS TOUT D'UN COUP — cent cinquante-deux
           lignes ne se lisent pas, elles se cherchent. Le reste s'ouvre à la
           demande, et le compte est dit pour qu'on sache ce qui reste dessous. */
        const visibles = vue === 'membres' ? mbr : portes.slice(0, montre);
        const caches = vue === 'portes' ? Math.max(0, portes.length - visibles.length) : 0;

        return (
          <div>
            <div className="tre-reg__barre">
              <Input
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Chercher une tête (nom, téléphone)…"
                style={{ flex: '1 1 240px', minWidth: 0 }}
              />
              {/* DEUX REGISTRES, PAS UNE PILE. Un membre et une tête aux portes
                  n'appellent pas le même geste : l'un se récompense, l'autre
                  s'attend. Les mêler obligeait à faire le tri de l'œil. */}
              <button
                className={`tre-chip ${vue === 'membres' ? 'is-on' : ''}`}
                onClick={() => { setVue('membres'); setOuvert(null); }}
              >
                Membres <span style={{ opacity: .6, marginLeft: 4 }}>{mbr.length}</span>
              </button>
              <button
                className={`tre-chip ${vue === 'portes' ? 'is-on' : ''}`}
                onClick={() => { setVue('portes'); setOuvert(null); }}
              >
                Aux portes <span style={{ opacity: .6, marginLeft: 4 }}>{portes.length}</span>
              </button>
              <button
                className={`tre-chip ${vue === 'foyers' ? 'is-on' : ''}`}
                onClick={() => { setVue('foyers'); setOuvert(null); }}
              >
                Foyers <span style={{ opacity: .6, marginLeft: 4 }}>{foyersF.length}</span>
              </button>
              <button
                className={`tre-chip ${vue === 'convenus' ? 'is-on' : ''}`}
                onClick={() => { setVue('convenus'); setOuvert(null); }}
              >
                Prix convenus <span style={{ opacity: .6, marginLeft: 4 }}>{convenusF.length}</span>
              </button>
            </div>

            {(vue === 'membres' || vue === 'portes') && visibles.length === 0 && (
              <Card className="tre-empty">
                <img src={asset("/assets/monograms/mono-indigo.png")} alt="" style={{ width: 36, opacity: 0.4 }} />
                <div className="tre-empty__title">
                  {q ? 'Aucune tête à ce nom.' : vue === 'membres' ? 'Personne n’est encore entré.' : 'Aucune tête en approche.'}
                </div>
                <div className="tre-empty__sub">
                  {q
                    ? 'Cherchez sur une autre orthographe, ou changez de registre.'
                    : `Le Cercle s’ouvre au ${seuil}ᵉ passage${vue === 'membres' && auxPortes.length > 0 ? `, ${auxPortes.length} tête${auxPortes.length > 1 ? 's' : ''} en approche, registre voisin.` : '.'}`}
                </div>
              </Card>
            )}

            {(vue === 'membres' || vue === 'portes') && visibles.length > 0 && (
              <div className="tre-reg">
                {visibles.map((c) => {
                  const membre = vue === 'membres';
                  const next = membre ? nextTierFor(c.loyaltyPoints) : null;
                  const best = membre ? bestTierFor(c.loyaltyPoints) : null;
                  const v = venuesDe.get(c.id) ?? 0;
                  const reste = Math.max(1, seuil - v);
                  const pct = membre
                    ? (next ? Math.round((c.loyaltyPoints / next.pts) * 100) : 100)
                    : Math.round((v / Math.max(1, seuil)) * 100);
                  const deplie = ouvert === c.id;
                  return (
                    <div key={c.id}>
                      <div className={`tre-reg__row ${deplie ? 'is-open' : ''}`}>
                        <span className="tre-avatar" style={{ width: 26, height: 26, fontSize: 11 }}>{c.name.slice(0, 1)}</span>
                        <span className="tre-reg__ident">
                          <span className="tre-reg__nom">{c.name}</span>
                          <span className="tre-reg__meta">
                            {membre
                              ? (next
                                ? `${(next.pts - c.loyaltyPoints).toLocaleString('fr-FR')} pts avant « ${serviceName(next.serviceId)} »`
                                : 'Tous les honneurs de points sont mérités.')
                              : `${v} venue${v > 1 ? 's' : ''} · encore ${reste} avant le Cercle`}
                          </span>
                        </span>
                        <span className="tre-reg__jauge"><Bar pct={pct} /></span>
                        <span className="tre-reg__pts">
                          {membre ? c.loyaltyPoints.toLocaleString('fr-FR') : `${v}/${seuil}`}
                        </span>
                        {membre ? (
                          <button
                            className="tre-reg__plus"
                            title={deplie ? 'Replier' : 'Offrir un soin, ajuster ses points'}
                            aria-expanded={deplie}
                            onClick={() => setOuvert(deplie ? null : c.id)}
                          >
                            {deplie ? '−' : '+'}
                          </button>
                        ) : <span />}
                      </div>

                      {/* LES GESTES SOUS LA LIGNE QUI LES CONCERNE. Offrir un
                          soin et retirer des points sont des actes rares : les
                          afficher cent cinquante fois allongeait la page sans
                          rien rendre plus accessible. */}
                      {deplie && (
                        <div className="tre-reg__panel">
                          {best && (
                            <Button size="sm" variant="copper" onClick={() => redeem(c, best)}>
                              Offrir « {serviceName(best.serviceId)} » · −{best.pts.toLocaleString('fr-FR')} pts
                            </Button>
                          )}
                          {c.phone && (
                            <WaLien
                              phone={c.phone}
                              message={best
                                ? `Bonjour ${c.name.split(' ')[0]}, un cadeau vous attend au Cercle de la Maison MND : « ${serviceName(best.serviceId)} », offert. Quand passez-vous ?`
                                : `Bonjour ${c.name.split(' ')[0]}, la Maison MND est heureuse de vous compter dans son Cercle.`}
                              style={{ fontSize: 12, fontWeight: 600, color: 'var(--copper-700)' }}
                            />
                          )}
                          <span className="mnd-muted" style={{ fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase', flex: 'none' }}>Ajustement</span>
                          <Input
                            inputMode="numeric"
                            placeholder="pts"
                            value={adjust[c.id] ?? ''}
                            onChange={(e) => setAdjust((prev) => ({ ...prev, [c.id]: e.target.value.replace(/[^0-9]/g, '') }))}
                            style={{ width: 82, padding: '6px 9px', fontSize: 12 }}
                          />
                          <button className="tre-chip" onClick={() => applyAdjust(c, 1)}>+ Accorder</button>
                          <button className="tre-chip" onClick={() => applyAdjust(c, -1)}>− Retirer</button>
                        </div>
                      )}
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

            {/* LES FOYERS — un par famille, sur sa dépense cumulée et son palier. */}
            {vue === 'foyers' && (foyersF.length === 0 ? (
              <Card className="tre-empty">
                <img src={asset("/assets/monograms/mono-indigo.png")} alt="" style={{ width: 36, opacity: 0.4 }} />
                <div className="tre-empty__title">{q ? 'Aucun foyer à ce nom.' : 'Aucun compte famille pour l’instant.'}</div>
                <div className="tre-empty__sub">Les comptes famille apparaissent ici avec leur dépense cumulée et le palier atteint.</div>
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
                            ? `Palier « ${serviceName(f.palier.serviceId)} » à offrir à la maisonnée`
                            : f.prochain
                              ? `encore ${fmtMoney(Math.max(0, f.prochain.seuilXof - f.depense), currency)} avant un geste`
                              : 'aucun palier Foyer défini'}
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

            {/* LES PRIX CONVENUS — le prix est déjà leur reconnaissance. */}
            {vue === 'convenus' && (convenusF.length === 0 ? (
              <Card className="tre-empty">
                <img src={asset("/assets/monograms/mono-indigo.png")} alt="" style={{ width: 36, opacity: 0.4 }} />
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
                        ? <WaLien phone={c.phone} message={`Bonjour ${c.name.split(' ')[0]}, la Maison MND revient vers vous.`} style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--copper-700)' }} />
                        : <span />}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        );
      })()}

      {tab === 'offrandes' && (
        <div>
          {history.length === 0 && (
            <Card className="tre-empty">
              <img src={asset("/assets/monograms/mono-indigo.png")} alt="" style={{ width: 36, opacity: 0.4 }} />
              <div className="tre-empty__title">Aucune récompense encore offerte.</div>
              <div className="tre-empty__sub">Les soins offerts et les ajustements de points s’inscrivent ici.</div>
            </Card>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {history.map((h) => (
              <Card key={h.id} style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12.5 }}>{h.clientName}</div>
                  <div className="mnd-muted" style={{ fontSize: 10.5 }}>
                    {h.label} · {new Date(h.at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
                  </div>
                </div>
                <Pill tone={h.pts < 0 ? 'copper' : 'ok'}>{h.pts > 0 ? '+' : '−'}{Math.abs(h.pts).toLocaleString('fr-FR')} pts</Pill>
              </Card>
            ))}
          </div>
        </div>
      )}

      {tierModal && (
        <Modal title={tierEditId ? 'Modifier le palier.' : tierKind === 'foyer' ? 'Nouveau palier du Foyer.' : 'Nouveau palier de récompense.'} onClose={() => setTierModal(false)} width={520}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label={tierKind === 'foyer' ? 'Dépense cumulée du foyer · seuil (F CFA)' : 'Points requis · seuil'}>
              <Input inputMode="numeric" value={tierForm.pts} placeholder={tierKind === 'foyer' ? 'Ex. 300000' : 'Ex. 3000'} onChange={(e) => setTierForm({ ...tierForm, pts: e.target.value.replace(/[^0-9]/g, '') })} />
            </Field>
            <Field label="Prestation offerte · tirée du catalogue">
              <Select value={tierForm.serviceId} onChange={(e) => setTierForm({ ...tierForm, serviceId: e.target.value })}>
                {/* Le tri par atelier vivait ici, à lui tout seul ; il est
                    devenu `OptionsPrestations`, partagé par les huit écrans. */}
                <OptionsPrestations services={services} prix devise={currency} />
              </Select>
            </Field>
            <Field label="Description · une phrase">
              <Input value={tierForm.desc} placeholder="Ex. Un soin signature, sans frais." onChange={(e) => setTierForm({ ...tierForm, desc: e.target.value })} />
            </Field>
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <Button variant="ghost" onClick={() => setTierModal(false)}>Annuler</Button>
              <Button variant="copper" style={{ flex: 1 }} onClick={saveTier} disabled={!tierForm.pts || !tierForm.serviceId}>
                {tierEditId ? 'Enregistrer le palier' : 'Créer le palier'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
