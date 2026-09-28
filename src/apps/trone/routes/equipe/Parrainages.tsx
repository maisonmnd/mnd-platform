import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { PageHead, WaLien } from '../_ui';
import { asset } from '../../../../shared/asset';
import { Badge, Button, toast } from '../../../../ds/components';
import { Toggle } from './ui';
import './equipe.css';
import './ambassadrices.css';
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

/* ══ LES AMBASSADRICES — 28 septembre 2026, revisitées le soir même ══════
   Ce que la Maison regarde tous les jours d'abord : quatre chiffres, le
   classement du mois. Puis les réglages, en LIGNES REPLIÉES qui disent leur
   valeur (« DÀNDÀN™ ou −15 % produit · écho −10 % · 6 mois »), un seul
   panneau ouvert à la fois : on lit tout sans rien déplier, on ne déplie que
   ce qu'on règle. Styles : ambassadrices.css (la carte du système n'a pas de
   marge intérieure, d'où les chiffres collés aux bords avant ce soir).

   Le calcul vit dans shared/ambassade, éprouvé par verifie-le-parrainage. */

const ETAT_DIT = { 'sans-rdv': 'pas encore de rendez-vous', 'a-venir': 'rendez-vous à venir', venue: 'venue', annulee: 'rendez-vous annulé' } as const;
const dateDite = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
};
const borne = (v: string, min: number, max: number, defaut: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= min ? Math.min(max, n) : defaut;
};

type IdReglage = 'recompenses' | 'rangs' | 'defi' | 'site';

function Reglage({ id, nom, resume, ouvert, bascule, children }: {
  id: IdReglage; nom: string; resume: string; ouvert: boolean; bascule: (id: IdReglage) => void; children: ReactNode;
}) {
  return (
    <div className={`amb-reglage${ouvert ? ' is-ouvert' : ''}`}>
      <button type="button" className="amb-reglage__ligne" aria-expanded={ouvert} aria-controls={`amb-${id}`} onClick={() => bascule(id)}>
        <span className="amb-reglage__nom">{nom}</span>
        <span className="amb-reglage__resume">{resume}</span>
        <span className="amb-reglage__chevron" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5.5 7 9.5 11 5.5" /></svg></span>
      </button>
      {ouvert && <div className="amb-reglage__corps" id={`amb-${id}`}>{children}</div>}
    </div>
  );
}

function Champ({ label, aide, large, children }: { label: string; aide?: string; large?: boolean; children: ReactNode }) {
  return (
    <label className={`amb-champ${large ? ' amb-champ--large' : ''}`}>
      <span className="amb-champ__label">{label}{aide && <small>{aide}</small>}</span>
      {children}
    </label>
  );
}

export default function Parrainages() {
  const { branch } = useBranch();
  const [demandes] = useDemandes();
  const [rdvs] = useAppointments();
  const [clients] = useClients();
  const [services] = useServices();
  const [reglage] = useParrainage();
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const [ouvert, setOuvert] = useState<IdReglage | null>(null);
  const bascule = (id: IdReglage) => setOuvert((o) => (o === id ? null : id));

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
  const nomDuSoin = (id?: string) => (id ? soins.find((s) => s.id === id)?.name : undefined);
  const part = chiffres.nouvelles ? Math.round((chiffres.parUneAmie / chiffres.nouvelles) * 100) : 0;
  const defi = reglage.defi ?? { actif: false, objectif: 2 };
  const remise = reglage.remisePct ?? REMISE_PAR_DEFAUT;
  const echo = reglage.echoPct ?? ECHO_PAR_DEFAUT;
  const validite = reglage.validiteMois ?? 6;

  const regle = (patch: Partial<ReglageParrainage>, dit = 'Enregistré.') => {
    parrainageStore.set((r) => ({ ...r, ...patch }));
    toast(dit);
  };
  const choixDuSoin = (valeur: string | undefined, onChange: (id: string | undefined) => void, vide = 'Aucun', etiquette = 'Le soin') => (
    <select className="mnd-input" aria-label={etiquette} value={valeur ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
      <option value="">{vide}</option>
      {soins.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
  );
  const pourcent = (valeur: number, defaut: number, cle: 'remisePct' | 'echoPct', etiquette: string) => (
    <span className="amb-suffixe">
      <input key={`${cle}-${valeur}`} className="mnd-input" type="number" min={1} max={REMISE_MAX} defaultValue={valeur} aria-label={etiquette}
        onBlur={(e) => { const n = borne(e.target.value, 1, REMISE_MAX, defaut); if (n !== valeur) regle({ [cle]: n }); e.target.value = String(n); }} />
      <span>%</span>
    </span>
  );
  const marqueRemis = (demandeId: string, remis: boolean) => {
    demandesStore.set((prev) => prev.map((d) => (d.id === demandeId
      ? { ...d, cadeauMarraineRemisLe: remis ? new Date().toISOString() : undefined } as DemandeParrainee : d)));
    toast(remis ? 'Cadeau de la marraine marqué remis.' : 'Cadeau remis annulé.');
  };

  const bonusPoses = (['tresse', 'couronne', 'reine'] as const).filter((r) => reglage.bonusRangs?.[r]);
  const resumes: Record<IdReglage, string> = {
    recompenses: `${nomDuSoin(reglage.soinMarraineServiceId) ?? 'Soin à choisir'} ou −${remise} % produit · écho −${echo} % · ${validite} mois`,
    rangs: bonusPoses.length
      ? (['tresse', 'couronne', 'reine'] as const).map((r) => `${nomDuRang(r).split(' ')[0]} : ${nomDuSoin(reglage.bonusRangs?.[r]) ?? 'aucun'}`).join(' · ')
      : 'Aucun bonus choisi : les rangs se gagnent, sans cadeau en plus',
    defi: defi.actif ? `En cours · ${defi.objectif} amies ce mois · ${nomDuSoin(defi.serviceId) ?? 'soin à choisir'}` : 'Arrêté',
    site: `${reglage.actif ? 'Parrainage ouvert' : 'Parrainage en pause'} · remerciement WhatsApp ${reglage.merciParWhatsApp ? 'allumé' : 'éteint'}`,
  };

  return (
    <div className="tr-page amb">
      <PageHead
        eyebrow="Marketing & Fidélité"
        title="Les ambassadrices"
        sub="Chaque cliente fait venir ses amies, et la Maison la récompense. Deux générations, jamais d’argent."
      />

      <section className="amb-chiffres" aria-label="Les chiffres du mois">
        <div className="amb-chiffre amb-chiffre--fort">
          <span className="amb-chiffre__label">Nouvelles clientes · {moisDit(aujourdhui.slice(0, 7))}</span>
          <span className="amb-chiffre__nombre">{chiffres.nouvelles}</span>
          <span className="amb-chiffre__dit">dont {chiffres.parUneAmie} venue{chiffres.parUneAmie > 1 ? 's' : ''} par une amie</span>
        </div>
        <div className="amb-chiffre">
          <span className="amb-chiffre__label">Part du bouche à oreille</span>
          <span className="amb-chiffre__nombre">{part} %</span>
          <div className="amb-jauge" aria-hidden="true"><span style={{ width: `${part}%` }} /></div>
        </div>
        <div className="amb-chiffre">
          <span className="amb-chiffre__label">Récompenses à utiliser</span>
          <span className="amb-chiffre__nombre">{enAttente}</span>
          <span className="amb-chiffre__dit">soins et remises en attente</span>
        </div>
        <div className="amb-chiffre">
          <span className="amb-chiffre__label">Ambassadrices actives</span>
          <span className="amb-chiffre__nombre">{actives}</span>
          <span className="amb-chiffre__dit">au moins une amie venue</span>
        </div>
      </section>

      <div className="amb-grille">
        <section className="amb-carte" aria-labelledby="amb-classement">
          <div className="amb-carte__tete">
            <h3 className="amb-carte__titre" id="amb-classement">Le classement du mois</h3>
            <Toggle on={!!reglage.classementVisible} label="Dans Ma Couronne"
              onToggle={() => regle({ classementVisible: !reglage.classementVisible }, reglage.classementVisible ? 'Classement retiré de Ma Couronne.' : 'Classement visible dans Ma Couronne.')} />
          </div>
          {classement.lignes.length === 0 ? (
            <div className="amb-vide">
              <span className="amb-vide__rond" aria-hidden="true"><img src={asset('/assets/vectoriel/pictogramme-cuivre.svg')} alt="" width={28} height={23} /></span>
              <p className="amb-muet">Personne encore. Dès qu’une amie vient grâce à une ambassadrice, elle paraît ici.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="amb-table">
                <thead><tr><th>#</th><th>Ambassadrice</th><th>Rang</th><th>Ce mois</th><th>Amies</th></tr></thead>
                <tbody>
                  {classement.lignes.map((x, i) => (
                    <tr key={`${x.prenom}-${i}`}>
                      <td className="amb-table__rang">{i + 1}</td><td>{x.prenom}</td><td>{nomDuRang(x.rang)}</td><td>{x.ceMois}</td><td>{x.amies}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="amb-muet">{reglage.classementVisible ? 'Visible dans Ma Couronne, au prénom seul, par les clientes connectées.' : 'Visible ici seulement.'}</p>
          <div className="amb-rangs" aria-label="Les rangs">
            {RANGS.map((r) => <span key={r.id} className="amb-rang">{r.nom}<b>{r.seuil}</b></span>)}
          </div>
        </section>

        <section className="amb-carte" aria-labelledby="amb-reglages">
          <div className="amb-carte__tete">
            <h3 className="amb-carte__titre" id="amb-reglages">Les réglages</h3>
          </div>
          <div className="amb-reglages">
            <Reglage id="recompenses" nom="Les récompenses" resume={resumes.recompenses} ouvert={ouvert === 'recompenses'} bascule={bascule}>
              <p className="amb-muet">À chaque amie venue, l’ambassadrice choisit l’une ou l’autre.</p>
              <Champ label="Le soin offert" aide="La caisse le passe à 100 %. Sans soin : la ligne choisie à la caisse">
                {choixDuSoin(reglage.soinMarraineServiceId, (id) => regle({ soinMarraineServiceId: id }), 'Aucun', 'Le soin offert')}
              </Champ>
              <Champ label="Ou une remise sur un produit" aide={`Jamais plus de ${REMISE_MAX} %`}>{pourcent(remise, REMISE_PAR_DEFAUT, 'remisePct', 'Remise sur un produit')}</Champ>
              <Champ label="L’écho" aide="Pour les amies de ses amies">{pourcent(echo, ECHO_PAR_DEFAUT, 'echoPct', 'Écho')}</Champ>
              <Champ label="Validité" aide="Ensuite, la récompense s’efface">
                <span className="amb-suffixe">
                  <input key={`validite-${validite}`} className="mnd-input" type="number" min={1} max={24} defaultValue={validite} aria-label="Validité en mois"
                    onBlur={(e) => { const n = borne(e.target.value, 1, 24, 6); if (n !== validite) regle({ validiteMois: n }); e.target.value = String(n); }} />
                  <span>mois</span>
                </span>
              </Champ>
            </Reglage>

            <Reglage id="rangs" nom="Les bonus de rang" resume={resumes.rangs} ouvert={ouvert === 'rangs'} bascule={bascule}>
              <p className="amb-muet">Offert une fois, le jour où elle atteint le rang. Sans soin choisi, rien ne se pose.</p>
              {(['tresse', 'couronne', 'reine'] as const).map((r) => (
                <Champ key={r} label={nomDuRang(r)} aide={`${RANGS.find((x) => x.id === r)?.seuil} amies venues`}>
                  {choixDuSoin(reglage.bonusRangs?.[r], (id) => regle({ bonusRangs: { ...(reglage.bonusRangs ?? {}), [r]: id } }), 'Aucun', `Bonus ${nomDuRang(r)}`)}
                </Champ>
              ))}
            </Reglage>

            <Reglage id="defi" nom="Le défi du mois" resume={resumes.defi} ouvert={ouvert === 'defi'} bascule={bascule}>
              <Champ label="Amies à faire venir" aide="Dans le mois">
                <span className="amb-suffixe">
                  <input key={`obj-${defi.objectif}`} className="mnd-input" type="number" min={1} max={20} defaultValue={defi.objectif} aria-label="Amies à faire venir"
                    onBlur={(e) => { const n = borne(e.target.value, 1, 20, 2); if (n !== defi.objectif) regle({ defi: { ...defi, objectif: n } }); e.target.value = String(n); }} />
                  <span>amies</span>
                </span>
              </Champ>
              <Champ label="Le soin offert">{choixDuSoin(defi.serviceId, (id) => regle({ defi: { ...defi, serviceId: id, ...(id ? {} : { actif: false }) } }), 'Aucun', 'Soin du défi')}</Champ>
              <div className="amb-actions">
                <Toggle on={defi.actif} label={defi.actif ? 'Défi en cours' : 'Défi arrêté'}
                  onToggle={() => { if (!defi.serviceId) { toast('Choisissez d’abord le soin du défi.'); return; } regle({ defi: { ...defi, actif: !defi.actif } }, defi.actif ? 'Défi arrêté.' : 'Défi du mois lancé.'); }} />
                {!defi.serviceId && <p className="amb-note">Choisissez le soin pour pouvoir lancer le défi.</p>}
              </div>
            </Reglage>

            <Reglage id="site" nom="Le site et les messages" resume={resumes.site} ouvert={ouvert === 'site'} bascule={bascule}>
              <div className="amb-actions">
                <Toggle on={reglage.actif} label={reglage.actif ? 'Parrainage ouvert' : 'Parrainage en pause'}
                  onToggle={() => regle({ actif: !reglage.actif }, reglage.actif ? 'Parrainage en pause : le site ne donne plus de code.' : 'Parrainage ouvert.')} />
              </div>
              <Champ large label="Le cadeau de bienvenue de l’amie" aide="Dit tel quel sur le site">
                <input className="mnd-input" type="text" value={filleule} placeholder="un soin DÀNDÀN™ offert" onChange={(e) => setFilleule(e.target.value)} />
              </Champ>
              <Champ large label="Ce que gagne l’ambassadrice" aide="Dit tel quel sur le site">
                <input className="mnd-input" type="text" value={marraine} placeholder="un soin offert ou une remise, à son choix" onChange={(e) => setMarraine(e.target.value)} />
              </Champ>
              <div className="amb-actions">
                <Button variant="copper" size="sm" disabled={filleule.trim() === reglage.cadeauFilleule && marraine.trim() === reglage.cadeauMarraine}
                  onClick={() => regle({ cadeauFilleule: filleule.trim(), cadeauMarraine: marraine.trim() }, 'Phrases enregistrées.')}>Enregistrer les phrases</Button>
              </div>
              <div className="amb-actions">
                <Toggle on={!!reglage.merciParWhatsApp} label={reglage.merciParWhatsApp ? 'Remerciement allumé' : 'Remerciement éteint'}
                  onToggle={() => regle({ merciParWhatsApp: !reglage.merciParWhatsApp }, reglage.merciParWhatsApp ? 'Remerciement éteint.' : 'Remerciement allumé.')} />
              </div>
              <p className="amb-muet">Le remerciement WhatsApp part avec sa carte à chaque amie venue. Allumez-le quand Meta a approuvé « parrainage_merci ».</p>
            </Reglage>
          </div>
        </section>
      </div>

      {duSite.length > 0 && (
        <section className="amb-site" aria-labelledby="amb-site">
          <h3 className="amb-carte__titre" id="amb-site">Les marraines du site, pas encore clientes</h3>
          {duSite.map((l) => (
            <div key={l.code} className="amb-marraine">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
                <span><strong>{l.prenom || 'Marraine'}</strong> <span className="amb-muet" style={{ display: 'inline' }}>{telephoneMasque(l.telephone)} · depuis le {dateDite(l.depuis)}</span></span>
                <Badge tone="copper">{l.code}</Badge>
              </div>
              {l.filleules.length === 0
                ? <p className="amb-muet">Son code n’a pas encore servi.</p>
                : l.filleules.map((f) => (
                  <div key={f.cle} className="amb-marraine__ligne">
                    <span>{f.prenom} <span className="amb-muet" style={{ display: 'inline' }}>· {ETAT_DIT[f.etat]}{(f.venueLe ?? f.dateRdv) ? ` · ${dateDite(f.venueLe ?? f.dateRdv)}` : ''}</span></span>
                    {f.venueLe && f.demandeId && (f.remisALaMain
                      ? <Button size="sm" variant="ghost" onClick={() => marqueRemis(f.demandeId!, false)}>Annuler « remis »</Button>
                      : (
                        <span className="amb-actions">
                          <WaLien phone={l.telephone} message={`Bonjour ${l.prenom}, ${f.prenom} est venue à la Maison grâce à vous. Merci !${reglage.cadeauMarraine ? ` Votre cadeau vous attend : ${reglage.cadeauMarraine}.` : ''}`} style={{ fontSize: 12.5 }}>Remercier</WaLien>
                          <Button size="sm" variant="copper" onClick={() => marqueRemis(f.demandeId!, true)}>Cadeau remis</Button>
                        </span>
                      ))}
                  </div>
                ))}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
