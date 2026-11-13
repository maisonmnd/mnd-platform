import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { PageHead } from '../_ui';
import { Button, Input } from '../../../../ds/components';
import ProgrammerUnWhatsApp from '../../shell/ProgrammerUnWhatsApp';
import '../../shell/programmer-un-whatsapp.css';
import { useBranch } from '../../../../shared/branches';
import { useAuth, useMaTete } from '../../../../shared/auth';
import { useInvoices } from '../../../../shared/finance';
import { appointmentsStore } from '../../../../shared/agenda';
import { useAppels, appelsAActer, marquerAppelFait, reporterAppel, rouvrirAppel, messageAppel, type AppelRecu } from '../../../../shared/appels';
import { signeLeMessage } from '../../../../shared/identite';
import { useAutoConfig } from '../equipe/data';
import { RdvModal, todayISO, addDaysISO, frShort } from './_shared';
import { cheminDeLaConversation, lienWaMe } from '../../../../shared/conversations';
import { envoieMaintenant, relache, reglesDepuis } from '../../../../shared/salle-des-envois';
import {
  A_VALIDER, ATTEND_SA_REPONSE, PAR_L_APP, PIECE_A_TIRER, A_REVOIR,
  ongletDe, pastillesDe, quiLEnvoie, quandDit, leOui, retiensLeProgramme, envoyeParLApp, pasEnvoyeParLApp, modeleDeMessage,
  type LigneProgrammee, type OngletDeLaFile,
} from '../../../../shared/envois-programmes-pur';
import { useEnvoisProgrammes, gesteSurLEnvoi, motDuGeste, laPieceEnFichier, pieceATirerDe } from './envois-programmes-donnees';
import { useLaPieceEnPdf } from '../vente/pdf-de-la-piece';

/* ══ CONVERSATIONS › LES ENVOIS PROGRAMMÉS — 13 novembre 2026 ═════════════
   L'onglet « Les appels » devient « Les envois programmés » (maquette
   validée, « construis » ; l'adresse `/appels` reste, les liens la
   connaissent). La file, comme SKEDit : chaque ligne dit quand, à qui,
   quoi, qui l'envoie et où elle en est ; elle se retouche, part tout de
   suite, se retient ou s'écarte jusqu'à la dernière minute. Trois onglets
   (À venir, Partis, À revoir) et, pour ne perdre aucun appel, « Les appels
   notés » : le journal d'avant, intact. `?envoi=<id>` (la notification de
   « me demander avant » et de « par l'app ») ouvre la ligne. */

type Vue = OngletDeLaFile | 'appels';
const STATUTS_A_ECARTER = new Set(['en-attente', 'retenu', A_VALIDER, PAR_L_APP, ATTEND_SA_REPONSE, PIECE_A_TIRER, A_REVOIR, 'périmé']);

export default function Appels() {
  const [params, setParams] = useSearchParams();
  const { branch } = useBranch();
  const { session } = useAuth();
  const { tete } = useMaTete();
  const [cfg] = useAutoConfig();
  const [invoices] = useInvoices();
  const { buildPdfData } = useLaPieceEnPdf();
  const regles = useMemo(() => reglesDepuis(cfg), [cfg]);
  const envois = useEnvoisProgrammes();
  const [appels] = useAppels();
  const appelsATraiter = useMemo(() => appelsAActer(appels, branch.id).length, [appels, branch.id]);
  const choisi = params.get('envoi') ?? '';
  const [vue, setVue] = useState<Vue>('a-venir');
  const [ouvrir, setOuvrir] = useState(false);
  const [retouche, setRetouche] = useState<LigneProgrammee | null>(null);
  const [rdvPour, setRdvPour] = useState<{ clientId: string; appelId: string; avant: number } | null>(null);
  const [mot, setMot] = useState('');
  const [enCours, setEnCours] = useState<string | null>(null);
  /* Par l'app : WhatsApp ouvert d'ici ; au retour, le Trône note « envoyé par l'app ». */
  const [partiVers, setPartiVers] = useState<string | null>(null);
  const [, bat] = useState(0);
  useEffect(() => { const t = window.setInterval(() => bat((k) => k + 1), 30_000); return () => window.clearInterval(t); }, []);

  const qui = ((tete as { name?: string } | null)?.name ?? '').trim().split(/\s+/)[0] || (session?.user?.email ?? '').split('@')[0] || 'le comptoir';
  const maintenant = Date.now();
  const parOnglet = useMemo(() => {
    const r: Record<OngletDeLaFile, LigneProgrammee[]> = { 'a-venir': [], partis: [], 'a-revoir': [] };
    for (const e of envois) { const o = ongletDe(e); if (o) r[o].push(e); }
    r['a-venir'].sort((a, b) => String(a.partA ?? a.prevuA).localeCompare(String(b.partA ?? b.prevuA)));
    r.partis.sort((a, b) => String(b.quand ?? '').localeCompare(String(a.quand ?? '')));
    r['a-revoir'].sort((a, b) => String(b.quand ?? '').localeCompare(String(a.quand ?? '')));
    return r;
  }, [envois]);

  /* La ligne nommée par la notification : son onglet, et elle en vue. */
  useEffect(() => {
    if (!choisi) return;
    const l = envois.find((e) => e.id === choisi);
    const o = l ? ongletDe(l) : null;
    if (o) setVue(o);
    window.setTimeout(() => document.getElementById(`envoi-${choisi}`)?.scrollIntoView({ block: 'center' }), 200);
  }, [choisi, envois]);

  /* Le retour de WhatsApp : « envoyé par l'app », défaisable d'un toucher. */
  useEffect(() => {
    if (!partiVers) return undefined;
    const auRetour = () => {
      if (document.visibilityState !== 'visible') return;
      const id = partiVers;
      setPartiVers(null);
      void gesteSurLEnvoi(id, (l) => envoyeParLApp(l, qui, Date.now())).then((v) => setMot(v === 'fait'
        ? 'Noté « envoyé par l’app ». Pas envoyé ? Touchez « Pas envoyé » sur la ligne, dans Partis.' : motDuGeste(v)));
    };
    document.addEventListener('visibilitychange', auRetour);
    return () => document.removeEventListener('visibilitychange', auRetour);
  }, [partiVers, qui]);

  const fais = async (id: string, faire: (l: LigneProgrammee) => LigneProgrammee | null, dit = '') => {
    setEnCours(id); setMot('');
    const v = await gesteSurLEnvoi(id, faire);
    setEnCours(null);
    setMot(v === 'fait' ? dit : motDuGeste(v));
  };
  const ecarte = (l: LigneProgrammee): LigneProgrammee | null => (STATUTS_A_ECARTER.has(l.statut)
    ? { ...l, statut: 'écarté', ecartePar: qui, ecarteLe: new Date().toISOString() } : null);

  const ouvreWhatsApp = (l: LigneProgrammee) => {
    const lien = lienWaMe(String(l.numero ?? l.colis.numero), l.colis.texte);
    if (!lien) { setMot('Ce numéro n’est pas lisible.'); return; }
    setPartiVers(l.id);
    window.open(lien, '_blank', 'noopener');
  };
  const partageLaPiece = async (l: LigneProgrammee) => {
    const p = l.colis.piece;
    if (!p) return;
    setMot('');
    let f: File | null = null;
    if (p.genre === 'fichier') f = await laPieceEnFichier(p);
    else {
      const piece = pieceATirerDe(invoices, l.clientId, p.genre, p.invoiceId);
      if (piece) {
        const { invoiceEnPiece } = await import('../../../../shared/pdf');
        const doc = await invoiceEnPiece(buildPdfData(piece));
        const blob = await (await fetch(doc.donnees)).blob();
        f = new File([blob], `${p.genre === 'facture' ? 'Facture' : 'Reçu'} ${piece.number || piece.id}.pdf`, { type: 'application/pdf' });
      }
    }
    if (!f) { setMot('La pièce n’a pas pu se lire.'); return; }
    const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
    if (nav.share && nav.canShare?.({ files: [f] })) {
      try { await nav.share({ files: [f] }); } catch { /* fermé par la main */ }
      return;
    }
    const url = URL.createObjectURL(f);
    const a = document.createElement('a');
    a.href = url; a.download = f.name; a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    setMot('Ce navigateur ne partage pas de fichier : la pièce est téléchargée, joignez-la dans WhatsApp.');
  };

  const liste = vue === 'appels' ? [] : parOnglet[vue];
  const occupe = (id: string) => enCours === id;

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow={`Le Trône · ${branch.city}`}
        title="Les envois programmés"
        sub={`${parOnglet['a-venir'].length} à venir · ${parOnglet.partis.length} parti${parOnglet.partis.length > 1 ? 's' : ''} · ${parOnglet['a-revoir'].length} à revoir`}
        actions={<Button variant="indigo" onClick={() => { setRetouche(null); setOuvrir(true); }}>Programmer un WhatsApp</Button>}
      />

      <div className="trc-file__onglets" role="tablist" aria-label="Les envois programmés">
        {([['a-venir', 'À venir'], ['partis', 'Partis'], ['a-revoir', 'À revoir'], ['appels', 'Les appels notés']] as [Vue, string][]).map(([k, nom]) => (
          <button key={k} type="button" role="tab" className="trc-file__onglet" aria-selected={vue === k} onClick={() => setVue(k)}>
            <b>{k === 'appels' ? appelsATraiter : parOnglet[k as OngletDeLaFile].length}</b>{nom}
          </button>
        ))}
      </div>
      {mot && <div className="trc-file__mot" role="status">{mot}</div>}

      {vue === 'appels' ? (
        <JournalDesAppels onPoserRdv={(clientId, appelId) => setRdvPour({ clientId, appelId, avant: appointmentsStore.get().filter((x) => x.clientId === clientId).length })} />
      ) : liste.length === 0 ? (
        <div className="trc-file__liste"><div className="trc-file__vide">
          {vue === 'a-venir' ? 'Rien de programmé. « Programmer un WhatsApp », ci-dessus, ou dans le menu Créer.' : vue === 'partis' ? 'Rien n’est encore parti.' : 'Rien à revoir.'}
        </div></div>
      ) : (
        <div className="trc-file__liste">
          {liste.map((l) => {
            const pastilles = pastillesDe(l, maintenant);
            const sous = l.statut === 'envoyé' ? (l.parLApp ? 'par l’app' : l.parOpale ? 'par Opale' : l.porteLe ? 'par le modèle d’ouverture' : 'tel quel')
              : l.colis.repeter === 'jamais' ? 'une fois' : pastilles.find((p) => /^chaque/.test(p.dit))?.dit ?? '';
            const extrait = `${modeleDeMessage(String(l.modele ?? 'libre')).nom} : « ${l.colis.texte.replace(/\s+/g, ' ').slice(0, 90)}${l.colis.texte.length > 90 ? '…' : ''} »`;
            const app = l.colis.mode === 'app';
            return (
              <div key={l.id} id={`envoi-${l.id}`} className={`trc-file__envoi${l.id === choisi ? ' is-choisi' : ''}`}>
                <span className="trc-file__quand">{quandDit(l.statut === 'envoyé' ? String(l.quand ?? l.prevuA) : String(l.partA ?? l.prevuA), maintenant)}<small>{sous}</small></span>
                <span style={{ minWidth: 0 }}>
                  <span className="trc-file__qui">{l.prenom || 'Une cliente'}</span>
                  <span className="trc-file__extrait">{extrait}</span>
                  <span className="trc-file__etat">
                    <span className="trc-file__pastille is-agent">{quiLEnvoie(l)}</span>
                    {pastilles.map((p, i) => <span key={i} className={`trc-file__pastille${p.ton ? ` is-${p.ton}` : ''}`}>{p.dit}</span>)}
                  </span>
                </span>
                <span className="trc-file__gestes">
                  {l.statut === A_VALIDER && <Button variant="copper" size="sm" disabled={occupe(l.id)} onClick={() => void fais(l.id, (x) => leOui(x, qui, Date.now()), 'Envoyé à son heure, ou tout de suite si elle est passée.')}>Envoyer</Button>}
                  {app && ['en-attente', 'retenu', PAR_L_APP].includes(l.statut) && <Button variant="copper" size="sm" onClick={() => ouvreWhatsApp(l)}>Ouvrir WhatsApp</Button>}
                  {app && l.colis.piece && ['en-attente', 'retenu', PAR_L_APP].includes(l.statut) && <button type="button" className="trc-prog__lien" onClick={() => void partageLaPiece(l)}>Partager la pièce</button>}
                  {app && ['en-attente', 'retenu', PAR_L_APP].includes(l.statut) && <button type="button" className="trc-prog__lien" disabled={occupe(l.id)} onClick={() => void fais(l.id, (x) => envoyeParLApp(x, qui, Date.now()), 'Noté « envoyé par l’app ».')}>C’est envoyé</button>}
                  {!app && l.statut === 'en-attente' && <button type="button" className="trc-prog__lien" disabled={occupe(l.id)} onClick={() => void fais(l.id, (x) => envoieMaintenant(x, Date.now()), 'Il part dans la minute.')}>Envoyer maintenant</button>}
                  {['en-attente', A_VALIDER, PAR_L_APP].includes(l.statut) && <button type="button" className="trc-prog__lien" disabled={occupe(l.id)} onClick={() => void fais(l.id, (x) => retiensLeProgramme(x, qui, Date.now()), 'Retenu : il ne part plus seul.')}>Retenir</button>}
                  {l.statut === 'retenu' && <button type="button" className="trc-prog__lien" disabled={occupe(l.id)} onClick={() => void fais(l.id, (x) => relache(x, Date.now(), regles), 'Relâché : il part à son heure.')}>Relâcher</button>}
                  {['en-attente', 'retenu', A_VALIDER].includes(l.statut) && <button type="button" className="trc-prog__lien" onClick={() => { setRetouche(l); setOuvrir(true); }}>Modifier</button>}
                  {(l.statut === A_REVOIR || l.statut === 'périmé') && <button type="button" className="trc-prog__lien" onClick={() => { setRetouche(l); setOuvrir(true); }}>Corriger et reprogrammer</button>}
                  {l.statut === 'envoyé' && l.parLApp && <button type="button" className="trc-prog__lien" disabled={occupe(l.id)} onClick={() => void fais(l.id, (x) => pasEnvoyeParLApp(x), 'Il redevient prêt, à envoyer par l’app.')}>Pas envoyé</button>}
                  {(l.statut === 'envoyé' || l.statut === A_REVOIR) && <Link className="trc-prog__lien" to={cheminDeLaConversation(String(l.numero ?? l.colis.numero)) ?? '/conversations'}>Ouvrir la conversation</Link>}
                  {STATUTS_A_ECARTER.has(l.statut) && <button type="button" className="trc-prog__lien" disabled={occupe(l.id)} onClick={() => void fais(l.id, ecarte, l.colis.repeter !== 'jamais' ? 'Écarté : la répétition s’arrête avec lui.' : 'Écarté : il ne partira pas.')}>Écarter</button>}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {ouvrir && (
        <ProgrammerUnWhatsApp
          ligne={retouche}
          surFermer={() => { setOuvrir(false); setRetouche(null); if (choisi) { params.delete('envoi'); setParams(params, { replace: true }); } }}
          onPoserRdv={(clientId, appelId) => setRdvPour({ clientId, appelId, avant: appointmentsStore.get().filter((x) => x.clientId === clientId).length })}
        />
      )}
      {rdvPour && (
        <RdvModal
          title="Rendez-vous depuis un appel"
          initial={{ clientId: rdvPour.clientId }}
          onClose={() => {
            const apres = appointmentsStore.get().filter((x) => x.clientId === rdvPour.clientId).length;
            if (apres > rdvPour.avant) marquerAppelFait(rdvPour.appelId);
            setRdvPour(null);
          }}
        />
      )}
    </div>
  );
}

type VueDuJournal = 'a-traiter' | 'traites' | 'tous';

/* LE JOURNAL DES APPELS — le résumé complet, à traiter comme traités, tel
   qu'il était avant les envois programmés : rien ne s'y perd. Un appel « à
   rappeler » devenu un envoi programmé le dit. */
function JournalDesAppels({ onPoserRdv }: { onPoserRdv: (clientId: string, appelId: string) => void }) {
  const { branch } = useBranch();
  const navigate = useNavigate();
  const [appels] = useAppels();
  const [vue, setVue] = useState<VueDuJournal>('a-traiter');
  const [q, setQ] = useState('');
  const demainAppel = addDaysISO(todayISO(), 1);

  const dansLaBranche = useMemo(() => appels.filter((a) => a.branchId === branch.id), [appels, branch.id]);
  const aTraiter = useMemo(() => appelsAActer(appels, branch.id), [appels, branch.id]);
  const programmes = useMemo(() => dansLaBranche.filter((a) => !a.fait && !!a.envoiId), [dansLaBranche]);
  const traites = useMemo(
    () => dansLaBranche.filter((a) => a.fait).sort((a, b) => b.at.localeCompare(a.at)),
    [dansLaBranche],
  );

  const base = vue === 'a-traiter' ? aTraiter : vue === 'traites' ? traites : [...aTraiter, ...programmes, ...traites];
  const t = q.trim().toLowerCase();
  const tTel = t.replace(/\s/g, '');
  const liste = t
    ? base.filter((a) => a.nom.toLowerCase().includes(t)
      || a.motif.toLowerCase().includes(t)
      || (tTel !== '' && (a.phone ?? '').replace(/\s/g, '').includes(tTel)))
    : base;

  const chip = { border: '1px solid var(--hairline)', borderRadius: 3, padding: '6px 11px', fontSize: 12, color: 'var(--ink-soft)', background: 'var(--surface, #fff)', cursor: 'pointer' } as const;
  const onglet = (on: boolean) => ({ ...chip, borderColor: on ? 'var(--color-indigo)' : 'var(--hairline)', background: on ? 'var(--color-indigo)' : 'var(--surface, #fff)', color: on ? '#fff' : 'var(--ink-soft)' });

  return (
    <div>
      <p className="mnd-muted" style={{ fontSize: 12.5, margin: '0 0 10px' }}>
        Les appels notés avant les envois programmés. Ceux qui attendaient un rappel sont devenus des envois à valider d’un toucher, dans « À venir ».
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '0 0 12px' }}>
        <span style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: '1 1 280px', minWidth: 0 }}>
          <Search size={17} aria-hidden="true" style={{ position: 'absolute', left: 13, color: 'var(--color-copper)', pointerEvents: 'none' }} />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Chercher (nom, numéro, motif)…"
            aria-label="Chercher un appel"
            style={{ width: '100%', padding: '12px 14px 12px 40px', fontSize: 14.5, border: '1.5px solid var(--copper-300)', borderRadius: 3 }}
          />
        </span>
        <button type="button" style={onglet(vue === 'a-traiter')} onClick={() => setVue('a-traiter')}>À traiter <span style={{ opacity: .6, marginLeft: 4 }}>{aTraiter.length}</span></button>
        <button type="button" style={onglet(vue === 'traites')} onClick={() => setVue('traites')}>Traités <span style={{ opacity: .6, marginLeft: 4 }}>{traites.length}</span></button>
        <button type="button" style={onglet(vue === 'tous')} onClick={() => setVue('tous')}>Tous</button>
      </div>

      {liste.length === 0 ? (
        <div className="mnd-muted" style={{ fontSize: 13, border: '1px dashed var(--hairline)', borderRadius: 4, padding: '18px 20px' }}>
          {q ? 'Aucun appel à ce nom.' : vue === 'traites' ? 'Aucun appel traité pour l’instant.' : 'Aucun appel en attente.'}
        </div>
      ) : (
        <div style={{ border: '1px solid var(--hairline)', borderRadius: 4, overflow: 'hidden' }}>
          {liste.map((a: AppelRecu) => {
            const enRetard = !a.fait && !a.envoiId && a.suite === 'rappel' && !!a.quand && a.quand < todayISO();
            const tag = a.envoiId && !a.fait
              ? { t: 'devenu un envoi programmé', bg: 'var(--copper-50, #FAF1E9)', c: '#8A5A32', b: 'var(--copper-300, #E3C9AE)' }
              : a.suite === 'rdv'
                ? { t: 'RDV à caler', bg: '#ECEEF6', c: 'var(--color-indigo)', b: '#C7CCE2' }
                : { t: 'à rappeler', bg: 'var(--copper-50, #FAF1E9)', c: '#8A5A32', b: 'var(--copper-300, #E3C9AE)' };
            return (
              <div key={a.id} style={{ display: 'grid', gridTemplateColumns: '30px 1fr auto', gap: 12, alignItems: 'center', padding: '12px 16px', borderTop: '1px solid var(--hairline)', opacity: a.fait ? 0.62 : 1 }}>
                <span style={{ width: 30, height: 30, borderRadius: 999, background: a.fait ? 'var(--ink-soft)' : 'var(--color-indigo)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 12 }}>{a.nom.slice(0, 1)}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 500 }}>
                    {a.nom}
                    <span style={{ fontSize: 10, borderRadius: 4, padding: '1px 8px', marginLeft: 8, background: tag.bg, color: tag.c, border: `1px solid ${tag.b}` }}>{tag.t}</span>
                    {a.fait && <span style={{ fontSize: 10, borderRadius: 4, padding: '1px 8px', marginLeft: 6, background: '#EEF4EE', color: 'var(--color-vert, #4A6B52)', border: '1px solid #CFE0CF' }}>traité</span>}
                  </div>
                  <div className="mnd-muted" style={{ fontSize: 12.5 }}>{a.motif || 'Sans note'}{a.phone ? ` · ${a.phone}` : ''}</div>
                  <div style={{ fontSize: 11, fontWeight: 500, color: enRetard ? 'var(--color-brique, #96412E)' : 'var(--ink-soft)' }}>
                    Reçu le {frShort(a.at.slice(0, 10))}
                    {!a.fait && !a.envoiId && a.suite === 'rappel' && a.quand ? ` · ${a.quand === todayISO() ? "à rappeler aujourd'hui" : a.quand === demainAppel ? 'à rappeler demain' : `à rappeler le ${frShort(a.quand)}`}${enRetard ? ' · en retard' : ''}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {a.phone && !a.envoiId && (
                    <Link to={cheminDeLaConversation(a.phone, signeLeMessage(messageAppel(a))) ?? '/conversations'} style={{ ...chip, textDecoration: 'none' }}>WhatsApp</Link>
                  )}
                  {!a.fait && a.clientId && a.suite === 'rdv' && (
                    <button type="button" style={{ ...chip, borderColor: 'var(--color-copper)', color: '#8A5A32', background: 'var(--copper-50, #FAF1E9)' }} onClick={() => onPoserRdv(a.clientId!, a.id)}>Créer le RDV</button>
                  )}
                  {!a.fait && a.clientId && a.suite === 'rappel' && (
                    <button type="button" style={{ ...chip, borderColor: 'var(--color-copper)', color: '#8A5A32', background: 'var(--copper-50, #FAF1E9)' }} onClick={() => navigate(`/customers?id=${a.clientId}`)}>Ouvrir la fiche</button>
                  )}
                  {!a.fait && !a.envoiId && a.suite === 'rappel' && a.quand !== demainAppel && (
                    <button type="button" style={chip} onClick={() => reporterAppel(a.id, demainAppel)}>Demain</button>
                  )}
                  {a.fait
                    ? <button type="button" style={chip} onClick={() => rouvrirAppel(a.id)}>Rouvrir</button>
                    : <button type="button" style={chip} onClick={() => marquerAppelFait(a.id)}>Fait</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
