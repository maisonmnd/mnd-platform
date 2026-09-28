import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { PageHead, WaLien } from '../_ui';
import { Badge, Button, Card, Field, Input, toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { useAppointments } from '../../../../shared/agenda';
import { useClients } from '../../../../shared/clients';
import { useServices } from '../../../../shared/catalog';
import { demandesStore, telephoneMasque, useDemandes } from '../../../../shared/demandes';
import { parrainageStore, useParrainage, type DemandeParrainee, type ReglageParrainage } from '../../../../shared/parrainage';
import { RANGS, nomDuRang, soinsEnAttente } from '../../../../shared/parrainage-pur';
import {
  ECHO_PAR_DEFAUT, REMISE_MAX, REMISE_PAR_DEFAUT, chiffresDuMois, classementDuMois, lignees, moisDit, venuesDe,
} from '../../../../shared/ambassade';

/* ══ LES AMBASSADRICES — 28 septembre 2026 (maquette validée, « construits ») ══
   Marketing & Fidélité. Ce que la Maison voit : les nouvelles clientes du
   mois et la part venue par une amie, le classement, les récompenses en
   attente, et TOUS les réglages (le soin, la remise, l'écho, les bonus de
   rang, le défi du mois, le classement dans Ma Couronne, le remerciement).
   Les marraines du site qui ne sont pas encore clientes gardent leur liste :
   leur cadeau se remet à la main, elles n'ont pas de fiche où le poser.

   Le calcul vit dans shared/ambassade, éprouvé par verifie-le-parrainage. */

const ETAT_DIT = { 'sans-rdv': 'pas encore de rendez-vous', 'a-venir': 'rendez-vous à venir', venue: 'venue', annulee: 'rendez-vous annulé' } as const;
const dateDite = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
};
const petit: CSSProperties = { fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--copper-700)' };
const nombre = (v: string, min: number, max: number, defaut: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= min ? Math.min(max, n) : defaut;
};

export default function Parrainages() {
  const { branch } = useBranch();
  const [demandes] = useDemandes();
  const [rdvs] = useAppointments();
  const [clients] = useClients();
  const [services] = useServices();
  const [reglage] = useParrainage();
  const aujourdhui = new Date().toISOString().slice(0, 10);

  const [filleule, setFilleule] = useState(reglage.cadeauFilleule);
  const [marraine, setMarraine] = useState(reglage.cadeauMarraine);
  useEffect(() => { setFilleule(reglage.cadeauFilleule); setMarraine(reglage.cadeauMarraine); }, [reglage.cadeauFilleule, reglage.cadeauMarraine]);

  const fiches = useMemo(() => clients.filter((c) => c && c.branchId === branch.id), [clients, branch.id]);
  const lus = useMemo(() => rdvs.map((a) => ({ id: a.id, status: a.status, date: a.date, clientId: a.clientId })), [rdvs]);
  const liste = demandes as DemandeParrainee[];
  const L = useMemo(
    () => lignees(fiches, liste.filter((d) => d && (!d.branchId || d.branchId === branch.id)), lus),
    [fiches, liste, lus, branch.id],
  );
  const chiffres = chiffresDuMois(fiches, L, lus, aujourdhui);
  const classement = classementDuMois(L, aujourdhui);
  const actives = [...L.values()].filter((l) => l.clientId && venuesDe(l).length > 0).length;
  const enAttente = fiches.reduce((n, c) => n + soinsEnAttente(c.soinsOfferts, aujourdhui).length, 0);
  const duSite = [...L.values()].filter((l) => !l.clientId);
  const soins = useMemo(
    () => services.filter((s) => s && !(s as { archived?: boolean }).archived).sort((a, b) => a.name.localeCompare(b.name)),
    [services],
  );

  const regle = (patch: Partial<ReglageParrainage>, dit?: string) => {
    parrainageStore.set((r) => ({ ...r, ...patch }));
    if (dit) toast(dit);
  };
  const choixDuSoin = (valeur: string | undefined, onChange: (id: string | undefined) => void, vide = 'Aucun') => (
    <select className="mnd-input" value={valeur ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
      <option value="">{vide}</option>
      {soins.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
  );
  const marqueRemis = (demandeId: string, remis: boolean) => {
    demandesStore.set((prev) => prev.map((d) => (d.id === demandeId
      ? { ...d, cadeauMarraineRemisLe: remis ? new Date().toISOString() : undefined } as DemandeParrainee : d)));
    toast(remis ? 'Cadeau de la marraine marqué remis.' : 'Cadeau remis annulé.');
  };
  const part = chiffres.nouvelles ? Math.round((chiffres.parUneAmie / chiffres.nouvelles) * 100) : 0;
  const defi = reglage.defi ?? { actif: false, objectif: 2 };

  return (
    <div className="tr-page">
      <PageHead
        eyebrow="Marketing & Fidélité"
        title="Les ambassadrices"
        sub="Chaque cliente fait venir ses amies, et la Maison la récompense. Deux générations, jamais d’argent."
      />

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', marginBottom: 18 }}>
        {[
          [`Nouvelles clientes, ${moisDit(aujourdhui.slice(0, 7))}`, String(chiffres.nouvelles), `dont ${chiffres.parUneAmie} venues par une amie`],
          ['Part du bouche à oreille', `${part} %`, 'le chiffre qu’on veut voir monter'],
          ['Récompenses à utiliser', String(enAttente), 'soins et remises en attente'],
          ['Ambassadrices actives', String(actives), 'au moins une amie venue'],
        ].map(([l, n, s]) => (
          <Card key={l}>
            <div style={petit}>{l}</div>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 34, color: 'var(--color-indigo)', lineHeight: 1.1 }}>{n}</div>
            <div className="mnd-muted" style={{ fontSize: 12.5 }}>{s}</div>
          </Card>
        ))}
      </div>

      <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', alignItems: 'start' }}>
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
            <strong>Le classement du mois</strong>
            <span className="mnd-muted" style={{ fontSize: 12 }}>{reglage.classementVisible ? 'visible dans Ma Couronne' : 'visible ici seulement'}</span>
          </div>
          {classement.lignes.length === 0
            ? <p className="mnd-muted" style={{ fontSize: 13, margin: '10px 0 0' }}>Aucune amie venue par une ambassadrice pour l’instant.</p>
            : (
              <div style={{ overflowX: 'auto', marginTop: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, fontVariantNumeric: 'tabular-nums' }}>
                  <thead><tr style={{ textAlign: 'left', ...petit }}><th style={{ padding: '8px 4px' }}>#</th><th style={{ padding: '8px 4px' }}>Ambassadrice</th><th style={{ padding: '8px 4px' }}>Rang</th><th style={{ padding: '8px 4px' }}>Ce mois</th><th style={{ padding: '8px 4px' }}>Amies</th></tr></thead>
                  <tbody>
                    {classement.lignes.map((x, i) => (
                      <tr key={`${x.prenom}-${i}`} style={{ borderTop: '1px solid rgba(20,20,27,.1)' }}>
                        <td style={{ padding: '9px 4px', fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--copper-700)' }}>{i + 1}</td>
                        <td style={{ padding: '9px 4px' }}>{x.prenom}</td>
                        <td style={{ padding: '9px 4px' }}>{nomDuRang(x.rang)}</td>
                        <td style={{ padding: '9px 4px' }}>{x.ceMois}</td>
                        <td style={{ padding: '9px 4px' }}>{x.amies}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            <span className="mnd-muted" style={{ fontSize: 12.5, maxWidth: 360 }}>Dans Ma Couronne, au prénom seul, et seulement aux clientes connectées.</span>
            <Button size="sm" variant={reglage.classementVisible ? 'ghost' : 'copper'} onClick={() => regle({ classementVisible: !reglage.classementVisible }, reglage.classementVisible ? 'Classement retiré de Ma Couronne.' : 'Classement visible dans Ma Couronne.')}>
              {reglage.classementVisible ? 'Le cacher' : 'Le montrer'}
            </Button>
          </div>
        </Card>

        <Card filet="copper">
          <strong>Les récompenses</strong>
          <p className="mnd-muted" style={{ fontSize: 12.5, margin: '4px 0 12px' }}>À chaque amie venue, l’ambassadrice choisit l’une ou l’autre. Valables {reglage.validiteMois ?? 6} mois.</p>
          <div style={{ display: 'grid', gap: 12 }}>
            <Field label="Au choix · le soin offert">{choixDuSoin(reglage.soinMarraineServiceId, (id) => regle({ soinMarraineServiceId: id }, 'Soin offert enregistré.'), 'Aucun : la caisse offrira la ligne choisie')}</Field>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
              <Field label="Au choix · remise produit (%)"><Input type="number" min={1} max={REMISE_MAX} defaultValue={reglage.remisePct ?? REMISE_PAR_DEFAUT} onBlur={(e) => regle({ remisePct: nombre(e.target.value, 1, REMISE_MAX, REMISE_PAR_DEFAUT) })} /></Field>
              <Field label="L’écho (%)"><Input type="number" min={1} max={REMISE_MAX} defaultValue={reglage.echoPct ?? ECHO_PAR_DEFAUT} onBlur={(e) => regle({ echoPct: nombre(e.target.value, 1, REMISE_MAX, ECHO_PAR_DEFAUT) })} /></Field>
              <Field label="Validité (mois)"><Input type="number" min={1} max={24} defaultValue={reglage.validiteMois ?? 6} onBlur={(e) => regle({ validiteMois: nombre(e.target.value, 1, 24, 6) })} /></Field>
            </div>
            <div style={petit}>Le bonus de rang, offert une fois</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
              {(['tresse', 'couronne', 'reine'] as const).map((r) => (
                <Field key={r} label={`${nomDuRang(r)} · ${RANGS.find((x) => x.id === r)?.seuil} amies`}>
                  {choixDuSoin(reglage.bonusRangs?.[r], (id) => regle({ bonusRangs: { ...(reglage.bonusRangs ?? {}), [r]: id } }, 'Bonus de rang enregistré.'))}
                </Field>
              ))}
            </div>
            <div style={petit}>Le défi du mois</div>
            <div style={{ display: 'grid', gridTemplateColumns: '120px minmax(0, 1fr) auto', gap: 10, alignItems: 'end' }}>
              <Field label="Amies venues"><Input type="number" min={1} max={20} defaultValue={defi.objectif} onBlur={(e) => regle({ defi: { ...defi, objectif: nombre(e.target.value, 1, 20, 2) } })} /></Field>
              <Field label="Soin offert">{choixDuSoin(defi.serviceId, (id) => regle({ defi: { ...defi, serviceId: id } }))}</Field>
              <Button size="sm" variant={defi.actif ? 'ghost' : 'copper'} disabled={!defi.serviceId} onClick={() => regle({ defi: { ...defi, actif: !defi.actif } }, defi.actif ? 'Défi arrêté.' : 'Défi du mois lancé.')}>{defi.actif ? 'Arrêter' : 'Lancer'}</Button>
            </div>
          </div>
        </Card>

        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <strong>Le site et les messages</strong>
            <Button variant={reglage.actif ? 'ghost' : 'copper'} size="sm" onClick={() => regle({ actif: !reglage.actif }, reglage.actif ? 'Parrainage en pause : le site ne donne plus de code.' : 'Parrainage ouvert.')}>{reglage.actif ? 'Mettre en pause' : 'Ouvrir le parrainage'}</Button>
          </div>
          <p className="mnd-muted" style={{ fontSize: 12.5, margin: '6px 0 12px' }}>Des phrases, pas des montants : le site les dit telles quelles.</p>
          <div style={{ display: 'grid', gap: 10 }}>
            <Field label="Cadeau de bienvenue de l’amie (première visite)"><Input value={filleule} placeholder="un soin DÀNDÀN™ offert" onChange={(e) => setFilleule(e.target.value)} /></Field>
            <Field label="Ce que gagne l’ambassadrice, dit sur le site"><Input value={marraine} placeholder="un soin offert ou une remise, à son choix" onChange={(e) => setMarraine(e.target.value)} /></Field>
            <div><Button variant="copper" size="sm" disabled={filleule.trim() === reglage.cadeauFilleule && marraine.trim() === reglage.cadeauMarraine} onClick={() => regle({ cadeauFilleule: filleule.trim(), cadeauMarraine: marraine.trim() }, 'Phrases enregistrées.')}>Enregistrer</Button></div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 14 }}>
            <span className="mnd-muted" style={{ fontSize: 12.5, maxWidth: 380 }}>Le remerciement WhatsApp, avec sa carte, part à chaque amie venue. À allumer quand Meta a approuvé « parrainage_merci ».</span>
            <Button variant={reglage.merciParWhatsApp ? 'ghost' : 'copper'} size="sm" onClick={() => regle({ merciParWhatsApp: !reglage.merciParWhatsApp }, reglage.merciParWhatsApp ? 'Remerciement éteint.' : 'Remerciement allumé.')}>{reglage.merciParWhatsApp ? 'Éteindre' : 'Allumer'}</Button>
          </div>
        </Card>
      </div>

      {duSite.length > 0 && (
        <div style={{ marginTop: 18, display: 'grid', gap: 12 }}>
          <strong>Les marraines du site, pas encore clientes</strong>
          {duSite.map((l) => (
            <Card key={l.code}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
                <span><strong>{l.prenom || 'Marraine'}</strong> <span className="mnd-muted" style={{ fontSize: 13 }}>{telephoneMasque(l.telephone)} · depuis le {dateDite(l.depuis)}</span></span>
                <Badge tone="copper">{l.code}</Badge>
              </div>
              {l.filleules.length === 0
                ? <p className="mnd-muted" style={{ fontSize: 13, margin: '8px 0 0' }}>Son code n’a pas encore servi.</p>
                : l.filleules.map((f) => (
                  <div key={f.cle} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', padding: '8px 0', borderTop: '1px solid rgba(20,20,27,.08)', fontSize: 13.5 }}>
                    <span>{f.prenom} <span className="mnd-muted">· {ETAT_DIT[f.etat]}{(f.venueLe ?? f.dateRdv) ? ` · ${dateDite(f.venueLe ?? f.dateRdv)}` : ''}</span></span>
                    {f.venueLe && f.demandeId && (f.remisALaMain
                      ? <Button size="sm" variant="ghost" onClick={() => marqueRemis(f.demandeId!, false)}>Annuler « remis »</Button>
                      : (
                        <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          <WaLien phone={l.telephone} message={`Bonjour ${l.prenom}, ${f.prenom} est venue à la Maison grâce à vous. Merci !${reglage.cadeauMarraine ? ` Votre cadeau vous attend : ${reglage.cadeauMarraine}.` : ''}`} style={{ fontSize: 12.5 }}>Remercier</WaLien>
                          <Button size="sm" variant="copper" onClick={() => marqueRemis(f.demandeId!, true)}>Cadeau remis</Button>
                        </span>
                      ))}
                  </div>
                ))}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
