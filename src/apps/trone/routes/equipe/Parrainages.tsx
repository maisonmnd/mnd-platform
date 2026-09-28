import { useEffect, useMemo, useState } from 'react';
import { PageHead, WaLien } from '../_ui';
import { Badge, Button, Card, Field, Input, toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { useAppointments } from '../../../../shared/agenda';
import { demandesStore, telephoneMasque, useDemandes } from '../../../../shared/demandes';
import {
  VISITE_DITE, cadeauDu, marrainesEtFilleules, parrainageStore, useParrainage,
  type DemandeParrainee, type Filleule,
} from '../../../../shared/parrainage';

/* LES PARRAINAGES — 28 septembre 2026, maquette « La communauté MND »
   validée (Marketing & Fidélité). Trois choses : les deux cadeaux, écrits
   en phrases (la fonction Edge les rend au site quand une marraine reçoit
   son code) ; chaque marraine et ses filleules, avec l'état de la première
   visite lu dans l'agenda ; et le cadeau de la marraine, qu'on marque remis
   quand la visite de la filleule est passée.

   Rien ne s'invente ici : les marraines et les filleules sont des demandes
   écrites par `demande-submit`, la visite est le rendez-vous qu'elle a
   posé. Le calcul vit dans `shared/parrainage`, éprouvé par
   `verifie-le-parrainage`. */

const dateDite = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
};

export default function Parrainages() {
  const { branch } = useBranch();
  const [demandes] = useDemandes();
  const [rdvs] = useAppointments();
  const [reglage] = useParrainage();
  const [filleule, setFilleule] = useState(reglage.cadeauFilleule);
  const [marraine, setMarraine] = useState(reglage.cadeauMarraine);
  useEffect(() => { setFilleule(reglage.cadeauFilleule); setMarraine(reglage.cadeauMarraine); }, [reglage.cadeauFilleule, reglage.cadeauMarraine]);

  const liste = useMemo(
    () => marrainesEtFilleules(
      (demandes as DemandeParrainee[]).filter((d) => d && (!d.branchId || d.branchId === branch.id)),
      rdvs.map((a) => ({ id: a.id, status: a.status, date: a.date })),
    ),
    [demandes, rdvs, branch.id],
  );
  const toutes = liste.flatMap((m) => m.filleules);
  const dus = toutes.filter(cadeauDu).length;

  const enregistre = () => {
    parrainageStore.set((r) => ({ ...r, cadeauFilleule: filleule.trim(), cadeauMarraine: marraine.trim() }));
    toast('Cadeaux enregistrés. Le site les dira dès le prochain code.');
  };
  const bascule = () => {
    parrainageStore.set((r) => ({ ...r, actif: !r.actif }));
    toast(reglage.actif ? 'Parrainage en pause : le site ne donne plus de code.' : 'Parrainage ouvert.');
  };
  const marqueRemis = (f: Filleule, remis: boolean) => {
    demandesStore.set((prev) => prev.map((d) => (d.id === f.demande.id
      ? { ...d, cadeauMarraineRemisLe: remis ? new Date().toISOString() : undefined } as DemandeParrainee
      : d)));
    toast(remis ? 'Cadeau de la marraine marqué remis.' : 'Cadeau remis annulé.');
  };

  const merci = (m: DemandeParrainee, f: DemandeParrainee): string =>
    `Bonjour ${m.prenom || ''}, ${f.prenom || 'votre amie'} est venue à la Maison grâce à vous. Merci !${reglage.cadeauMarraine ? ` Votre cadeau vous attend : ${reglage.cadeauMarraine}.` : ''}`;

  return (
    <div className="tr-page">
      <PageHead
        eyebrow="Marketing & Fidélité"
        title="Parrainages"
        sub="Les marraines, leurs filleules, et les cadeaux que la Maison promet sur le site."
      />

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', marginBottom: 18 }}>
        {[['Marraines', liste.length], ['Filleules', toutes.length], ['Venues', toutes.filter((f) => f.visite === 'venue').length], ['Cadeaux à remettre', dus]].map(([l, n]) => (
          <Card key={String(l)}><div className="mnd-muted" style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase' }}>{l}</div><div style={{ fontFamily: 'var(--font-serif)', fontSize: 32, color: 'var(--color-indigo)' }}>{n}</div></Card>
        ))}
      </div>

      <Card filet="copper" style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <strong>Les cadeaux</strong>
          <Button variant={reglage.actif ? 'ghost' : 'copper'} size="sm" onClick={bascule}>{reglage.actif ? 'Mettre en pause' : 'Ouvrir le parrainage'}</Button>
        </div>
        <p className="mnd-muted" style={{ fontSize: 13, margin: '6px 0 14px' }}>
          Des phrases, pas des montants : le site les dit telles quelles. Tant qu’elles sont vides, il promet « un cadeau de bienvenue » sans le nommer.
        </p>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          <Field label="Cadeau de la filleule (première visite)"><Input value={filleule} placeholder="un soin DÀNDÀN™ offert" onChange={(e) => setFilleule(e.target.value)} /></Field>
          <Field label="Cadeau de la marraine (quand elle est venue)"><Input value={marraine} placeholder="un lavage offert" onChange={(e) => setMarraine(e.target.value)} /></Field>
        </div>
        <div style={{ marginTop: 12 }}><Button variant="copper" size="sm" onClick={enregistre} disabled={filleule.trim() === reglage.cadeauFilleule && marraine.trim() === reglage.cadeauMarraine}>Enregistrer</Button></div>
      </Card>

      {liste.length === 0 && (
        <Card><p className="mnd-muted" style={{ margin: 0 }}>Aucune marraine pour l’instant. Le code se demande sur le site, page « Parrainer une amie ».</p></Card>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        {liste.map((m) => (
          <Card key={m.demande.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <div>
                <strong style={{ fontSize: 16 }}>{m.demande.prenom || 'Marraine'}</strong>
                <span className="mnd-muted" style={{ marginLeft: 10, fontSize: 13 }}>{telephoneMasque(m.demande.telephone)} · depuis le {dateDite(m.demande.createdAt)}</span>
              </div>
              <Badge tone="copper">{m.code}</Badge>
            </div>
            {m.filleules.length === 0
              ? <p className="mnd-muted" style={{ fontSize: 13, margin: '10px 0 0' }}>Son code n’a pas encore servi.</p>
              : (
                <div style={{ overflowX: 'auto', marginTop: 10 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                    <thead><tr style={{ textAlign: 'left', fontSize: 10.5, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--copper-700)' }}>
                      <th style={{ padding: '8px 6px' }}>Filleule</th><th style={{ padding: '8px 6px' }}>Première visite</th><th style={{ padding: '8px 6px' }}>Cadeau de la marraine</th><th />
                    </tr></thead>
                    <tbody>
                      {m.filleules.map((f) => (
                        <tr key={f.demande.id} style={{ borderTop: '1px solid var(--line, rgba(20,20,27,.12))' }}>
                          <td style={{ padding: '9px 6px' }}>{f.demande.prenom || 'Sans prénom'}</td>
                          <td style={{ padding: '9px 6px' }}>{VISITE_DITE[f.visite]}{f.dateRdv ? ` · ${dateDite(f.dateRdv)}` : ''}</td>
                          <td style={{ padding: '9px 6px' }}>
                            {f.demande.cadeauMarraineRemisLe
                              ? <Badge tone="indigo">remis le {dateDite(f.demande.cadeauMarraineRemisLe)}</Badge>
                              : cadeauDu(f) ? <Badge tone="copper">à remettre</Badge> : <span className="mnd-muted">après sa visite</span>}
                          </td>
                          <td style={{ padding: '9px 6px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {cadeauDu(f) && (
                              <>
                                <WaLien phone={m.demande.telephone} message={merci(m.demande, f.demande)} style={{ marginRight: 10, fontSize: 12.5 }}>Remercier</WaLien>
                                <Button size="sm" variant="copper" onClick={() => marqueRemis(f, true)}>Cadeau remis</Button>
                              </>
                            )}
                            {f.demande.cadeauMarraineRemisLe && <Button size="sm" variant="ghost" onClick={() => marqueRemis(f, false)}>Annuler</Button>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </Card>
        ))}
      </div>
    </div>
  );
}
