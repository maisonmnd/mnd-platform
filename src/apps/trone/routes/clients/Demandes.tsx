import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHead } from '../_ui';
import { Button, Select, Textarea, toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { signeLeMessage } from '../../../../shared/identite';
import { clientsStore, ensureInitiePersona } from '../../../../shared/clients';
import { appointmentsStore } from '../../../../shared/agenda';
import {
  useDemandes, demandesTriees, ditLeBesoin, ditLeGenre, messageDeRappel, ficheDepuisLaDemande,
  telephoneMasque, telephoneNormalise, depuisQuand, BESOINS,
  type Demande, type BesoinDeLaDemande, type StatutDeLaDemande,
} from '../../../../shared/demandes';
import './clients.css';

/* ══ LES DEMANDES VENUES DU SITE · 17 septembre 2026 ═══════════════════
   Le site révélateur dépose des demandes sans compte : un prénom, un
   numéro, un besoin, parfois un mot. Elles arrivent ICI, à côté des
   Consultations, parce que c'est la même chose : quelqu'un dehors a tendu
   la main, et la Maison lui répond.

   UNE FILE QUE PERSONNE NE REGARDE NE SERT À RIEN. Trois tuiles disent ce
   qui attend ; chaque carte porte ses gestes : écrire sur WhatsApp, dire
   qu'on l'a rappelée, en faire une cliente, écarter. « En faire une
   cliente » ouvre une fiche au segment Prospect, le même geste que le Trône
   fait déjà pour chaque consultation en ligne (`useReconcileClients`), avec
   en plus la provenance : la page, la campagne, le jour du consentement.

   LE NUMÉRO SE MASQUE. Le Trône est un écran de comptoir, lu par-dessus
   l'épaule : les quatre derniers chiffres suffisent à reconnaître, le
   numéro entier ne se montre qu'à qui le demande. */

type FiltreStatut = 'a-traiter' | StatutDeLaDemande | 'toutes';
type FiltreBesoin = 'tous' | BesoinDeLaDemande;

const STATUT_DIT: Record<StatutDeLaDemande, { mot: string; classe: string }> = {
  nouvelle: { mot: 'nouvelle', classe: 'trc-pill--new' },
  rappelee: { mot: 'rappelée', classe: 'trc-pill--attente' },
  convertie: { mot: 'cliente', classe: 'trc-pill--confirme' },
  ecartee: { mot: 'écartée', classe: 'trc-pill--annule' },
};

/** Le lundi de cette semaine, à minuit, en millisecondes. */
/** « mercredi 24 septembre, 10:00 » — la place qu'une visiteuse a prise. */
const placeDite = (d: Demande): string => {
  if (!d.date || !d.time) return '';
  const quand = new Date(`${d.date}T00:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  return `${quand}, ${d.time}${d.master ? ` · ${d.master}` : ''}`;
};

const debutDeSemaine = (maintenant: number): number => {
  const d = new Date(maintenant);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const debutDeMois = (maintenant: number): number => {
  const d = new Date(maintenant);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
};

const lienWhatsApp = (d: Demande): string =>
  `https://wa.me/${d.telephone.replace(/\D/g, '')}?text=${encodeURIComponent(signeLeMessage(messageDeRappel(d)))}`;

export default function Demandes() {
  const { branch } = useBranch();
  const navigate = useNavigate();
  const [toutes, setDemandes] = useDemandes();
  const [statut, setStatut] = useState<FiltreStatut>('a-traiter');
  const [besoin, setBesoin] = useState<FiltreBesoin>('tous');
  const [depliees, setDepliees] = useState<Set<string>>(() => new Set());
  const [brouillons, setBrouillons] = useState<Record<string, string>>({});
  const maintenant = Date.now();

  /* La branche impose tout. Une demande sans branche (un dépôt d'avant que le
     site ne la porte) se montre partout plutôt que nulle part. */
  const dansLaBranche = useMemo(
    () => toutes.filter((d) => !d.branchId || d.branchId === branch.id),
    [toutes, branch.id],
  );

  const nouvelles = dansLaBranche.filter((d) => d.statut === 'nouvelle').length;
  const semaine = debutDeSemaine(maintenant);
  const rappeleesSemaine = dansLaBranche.filter((d) => d.rappeleeLe && Date.parse(d.rappeleeLe) >= semaine).length;
  /* La demande ne porte pas le jour de sa conversion : on compte celles
     converties qui sont ARRIVÉES ce mois, ce qui est la même chose neuf fois
     sur dix, une file se traitant dans la semaine. */
  const mois = debutDeMois(maintenant);
  const convertiesMois = dansLaBranche.filter((d) => d.statut === 'convertie' && Date.parse(d.createdAt) >= mois).length;

  const visibles = useMemo(() => demandesTriees(dansLaBranche.filter((d) => {
    if (statut === 'a-traiter' ? (d.statut !== 'nouvelle' && d.statut !== 'rappelee') : statut !== 'toutes' && d.statut !== statut) return false;
    return besoin === 'tous' || d.besoin === besoin;
  })), [dansLaBranche, statut, besoin]);

  const poser = (d: Demande, patch: Partial<Demande>) =>
    setDemandes((prev) => prev.map((x) => (x.id === d.id ? { ...x, ...patch } : x)));

  const deplier = (id: string) => setDepliees((prev) => {
    const suite = new Set(prev);
    if (suite.has(id)) suite.delete(id); else suite.add(id);
    return suite;
  });

  /* EN FAIRE UNE CLIENTE. Si une fiche porte déjà ce numéro, on s'y rattache
     au lieu d'en ouvrir une seconde : deux fiches pour une tête, c'est deux
     histoires qui ne se retrouvent plus. */
  const convertir = (d: Demande) => {
    const numero = telephoneNormalise(d.telephone);
    const existante = numero
      ? clientsStore.get().find((c) => !c.archived && telephoneNormalise(c.phone) === numero)
      : undefined;
    let id: string;
    if (existante) {
      id = existante.id;
      toast(`${existante.name} a déjà sa fiche : la demande y est rattachée.`);
    } else {
      const fiche = ficheDepuisLaDemande(d, ensureInitiePersona());
      clientsStore.set((prev) => (prev.some((c) => c.id === fiche.id) ? prev : [...prev, fiche]));
      id = fiche.id;
      toast(`${fiche.name} entre au carnet, au segment Prospect.`);
    }
    /* LE RENDEZ-VOUS SUIT LA FICHE. Posé par le site sans `clientId` (aucune
       fiche n'existait), il s'y rattache maintenant : sans ce geste, le
       carnet garderait « Cliente de passage » sur une tête qu'on connaît. */
    if (d.apptId) {
      appointmentsStore.set((prev) => prev.map((a) =>
        (a.id === d.apptId ? { ...a, clientId: id, clientName: d.prenom || a.clientName } : a)));
    }
    poser(d, { statut: 'convertie', clientId: id });
    navigate(`/customers?id=${id}`);
  };

  const noteDe = (d: Demande) => brouillons[d.id] ?? d.note ?? '';
  const poserLaNote = (d: Demande) => {
    const v = noteDe(d).trim();
    if (v !== (d.note ?? '')) poser(d, { note: v || undefined });
    setBrouillons((prev) => { const { [d.id]: _, ...reste } = prev; return reste; });
  };

  return (
    <>
      <PageHead
        eyebrow="Clients & Agenda"
        title="Les demandes"
        sub="Ce que le site public a reçu : un prénom, un numéro, un besoin, parfois une place déjà prise au calendrier. La Maison confirme."
      />

      <div className="trc-kpis" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <div className={`trc-kpi${nouvelles > 0 ? ' trc-kpi--live' : ''}`}>
          <b>{nouvelles}</b><span>{nouvelles > 1 ? 'nouvelles' : 'nouvelle'}</span>
        </div>
        <div className="trc-kpi"><b>{rappeleesSemaine}</b><span>rappelées cette semaine</span></div>
        <div className="trc-kpi"><b>{convertiesMois}</b><span>converties ce mois</span></div>
      </div>

      <div className="trc-toolbar">
        <Select aria-label="Statut" value={statut} onChange={(e) => setStatut(e.target.value as FiltreStatut)}>
          <option value="a-traiter">À traiter</option>
          <option value="nouvelle">Nouvelles</option>
          <option value="rappelee">Rappelées</option>
          <option value="convertie">Converties</option>
          <option value="ecartee">Écartées</option>
          <option value="toutes">Toutes</option>
        </Select>
        <Select aria-label="Besoin" value={besoin} onChange={(e) => setBesoin(e.target.value as FiltreBesoin)}>
          <option value="tous">Tous les besoins</option>
          {BESOINS.map((b) => <option key={b} value={b}>{ditLeBesoin(b)}</option>)}
        </Select>
        <span className="trc-sub" style={{ marginLeft: 'auto' }}>
          {visibles.length} demande{visibles.length > 1 ? 's' : ''}
        </span>
      </div>

      {visibles.length === 0 && (
        <div className="trc-empty">
          {dansLaBranche.length === 0
            ? 'Aucune demande pour l’instant. Le site déposera ici chaque prénom qui vous écrit.'
            : 'Rien sous ce filtre.'}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {visibles.map((d) => {
          const ouverte = depliees.has(d.id);
          return (
            <article
              key={d.id}
              style={{
                background: 'var(--surface-card)',
                border: '1px solid var(--hairline)',
                borderLeft: d.statut === 'nouvelle' ? 'var(--filet-copper)' : '1px solid var(--hairline)',
                borderRadius: 'var(--radius-sm)',
                padding: '14px 16px',
                display: 'flex', flexDirection: 'column', gap: 10,
              }}
            >
              <header style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--color-indigo)', lineHeight: 1.1 }}>
                  {d.prenom}
                </span>
                <span className={`trc-pill ${STATUT_DIT[d.statut].classe}`}>{STATUT_DIT[d.statut].mot}</span>
                <span className={`trc-src${d.genre === 'rdv' ? '' : ' trc-src--indigo'}`}>{ditLeGenre(d.genre)}</span>
                <span className="trc-sub" style={{ marginLeft: 'auto' }} title={new Date(d.createdAt).toLocaleString('fr-FR')}>
                  {depuisQuand(d.createdAt, maintenant)}
                </span>
              </header>

              <div className="trc-name">
                {ditLeBesoin(d.besoin)}
                {d.profil ? <span className="trc-sub"> · {d.profil}</span> : null}
              </div>
              {/* LA PLACE DEMANDÉE EN LIGNE — 17 septembre 2026. Le site pose
                  déjà le rendez-vous en attente : le comptoir n'a qu'à le
                  confirmer au Calendrier, ou à le déplacer. */}
              {d.date && d.time && (
                <div className="trc-name" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span className="trc-pill trc-pill--new">{placeDite(d)}</span>
                  {d.apptId && (
                    <button type="button" className="trc-c360-linkbtn" onClick={() => navigate('/calendrier')}>
                      Voir au calendrier
                    </button>
                  )}
                </div>
              )}
              {(d.page || d.campagne) && (
                <div className="trc-sub">
                  {d.page ? `Depuis ${d.page}` : ''}
                  {d.page && d.campagne ? ' · ' : ''}
                  {d.campagne ? `campagne ${d.campagne}` : ''}
                </div>
              )}

              {d.mot && (
                <p style={{ margin: 0, fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 15, color: 'var(--color-indigo)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                  « {d.mot} »
                </p>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className={`trc-chip${ouverte ? ' is-active' : ''}`}
                  aria-expanded={ouverte}
                  title={ouverte ? 'Masquer le numéro' : 'Voir le numéro entier'}
                  onClick={() => deplier(d.id)}
                >
                  {ouverte ? d.telephone : telephoneMasque(d.telephone)}
                </button>
                {ouverte && d.email && <span className="trc-sub">{d.email}</span>}
                {ouverte && (
                  <span className="trc-sub">
                    consentement le {new Date(d.consentementLe).toLocaleDateString('fr-FR')}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {d.statut !== 'ecartee' && (
                  <a className="trc-wa" href={lienWhatsApp(d)} target="_blank" rel="noreferrer">
                    <span className="trc-wa__num">WhatsApp</span>
                  </a>
                )}
                {d.statut === 'nouvelle' && (
                  <Button variant="ghost" size="sm" onClick={() => poser(d, { statut: 'rappelee', rappeleeLe: new Date().toISOString() })}>
                    Rappelée
                  </Button>
                )}
                {d.statut !== 'convertie' && d.statut !== 'ecartee' && (
                  <Button variant="copper" size="sm" onClick={() => convertir(d)}>En faire une cliente</Button>
                )}
                {d.statut === 'convertie' && d.clientId && (
                  <button type="button" className="trc-c360-linkbtn" onClick={() => navigate(`/customers?id=${d.clientId}`)}>
                    Ouvrir sa fiche
                  </button>
                )}
                {d.statut === 'ecartee' ? (
                  <Button variant="ghost" size="sm" onClick={() => poser(d, { statut: 'nouvelle' })}>Reprendre</Button>
                ) : d.statut !== 'convertie' && (
                  <button type="button" className="trc-c360-linkbtn trc-c360-linkbtn--muted" style={{ marginLeft: 'auto' }} onClick={() => poser(d, { statut: 'ecartee' })}>
                    Écarter
                  </button>
                )}
              </div>

              <Textarea
                aria-label="Note du personnel"
                rows={2}
                style={{ minHeight: 0 }}
                placeholder="Une note pour la Maison : ce qu’elle a dit, quand la rappeler."
                value={noteDe(d)}
                onChange={(e) => setBrouillons((prev) => ({ ...prev, [d.id]: e.target.value }))}
                onBlur={() => poserLaNote(d)}
              />
            </article>
          );
        })}
      </div>
    </>
  );
}
