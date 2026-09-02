import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { DEVISE_COMPLETE } from '../../../../shared/identite';
import { PageHead } from '../_ui';
import { Button, Input, Segs, toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { libelleFourchette } from '../../../../shared/abonnements';
import { usePersonas, clientsStore, useFamilies } from '../../../../shared/clients';
import { ageDe, tetesPortees } from '../../../../shared/accounts';
import { declarationsDe, nomPropose, useEnfantsDeclares } from '../../../../shared/enfants';
import { useCategories, useProducts, useServices, priceModeOf, catsDansLOrdre, mondeDeCat, mondeLabel } from '../../../../shared/catalog';
import { useTiers } from '../../../../shared/offers';
import { bandsAbonnements } from '../../../../shared/pricing';
import { useModelBands, useBandSets, pricingOf, personalPriceXof, personalDurationMin, scalesWithModel, bandLabel, calibreDe } from '../../../../shared/pricing';
import { vitrineConfigStore, catalogueVisiblePour, surMesureDe } from '../../../../shared/bridges';
import { ENVIES, QUIZ_POOL, type EnvieKey } from '../../../../shared/quiz';
import { recoPourEnvie, recoSourceLabel } from '../../../../shared/reco';
import { useStore } from '../../../../shared/store';
import { Avatar, apptLabel, frLong, frShort, fromISO, todayISO, useBranchAppointments, useBranchClients, useServicesById } from './_shared';
import { QrSvg, qrMatrice } from '../equipe/Comptoir';
import { carteReglages, type CarteConfig } from '../../../../shared/bridges';
import { autoConfigStore } from '../equipe/data';
import { usePlans } from '../../../../shared/abonnements';
import { seuilCliente } from '../../../../shared/echeancier';
import './clients.css';

/* Vitrine client — le miroir personnalisé auto-joué pendant le rituel, et la régie
   qui compose ce que chaque cliente voit (catégories/services/produits + quiz IA). */

const SCENE_LABELS = ['La rencontre', 'Un mot pour toi', 'Une question pour toi', 'Ton prochain moment'];

/* LES MOTS DU QUIZ ONT DÉMÉNAGÉ dans `shared/quiz.ts` — questions, envies et
   phrases. Ma Couronne pose désormais le même quiz au seuil de sa réservation :
   deux jeux de mots, c'eussent été deux maisons. Le miroir TUTOIE (`.tu`),
   l'application VOUVOIE. Ce qui se propose en face reste réglé à la Régie. */

export default function Vitrine() {
  const [mode, setMode] = useState<'apercu' | 'couronne' | 'regie'>('apercu');
  const clients = useBranchClients();
  const [cIdx, setCIdx] = useState(0);
  const [query, setQuery] = useState('');
  const safeIdx = Math.min(cIdx, Math.max(0, clients.length - 1));
  const client = clients[safeIdx];
  /* Recherche cliente — le CRM peut compter des centaines de têtes ; on filtre les
     pastilles par nom ou téléphone. La sélection reste ancrée sur l'index dans la
     liste COMPLÈTE (stable), pas dans la liste filtrée. */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const qd = q.replace(/\D/g, '');
    return q
      ? clients.filter((c) => c.name.toLowerCase().includes(q) || (qd.length > 0 && (c.phone ?? '').replace(/\D/g, '').includes(qd)))
      : clients;
  }, [clients, query]);

  if (!client) {
    return (
      <div className="mnd-rise">
        <PageHead eyebrow="Vitrine · L’écran de la cliente" title="La Vitrine." />
        <div className="trc-empty">Aucune tête couronnée sur cette branche, la Vitrine attend sa première cliente.</div>
      </div>
    );
  }

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="Vitrine · L’écran de la cliente"
        title="La Vitrine."
        actions={
          <Segs<'apercu' | 'couronne' | 'regie'>
            options={[
              { value: 'apercu', label: 'Aperçu' },
              { value: 'couronne', label: 'Ma Couronne' },
              { value: 'regie', label: 'Régie' },
            ]}
            value={mode}
            onChange={setMode}
          />
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          {/* LE SÉLECTEUR DIT CE QU'IL SÉLECTIONNE. « Qui est devant le miroir ? »
              n'a de sens qu'à l'Aperçu : dans les deux autres onglets, on ne
              choisit pas une tête devant un écran, on en choisit une à régler ou
              à prévisualiser. */}
          <span className="trc-microlabel" style={{ margin: 0 }}>
            {mode === 'apercu' ? 'Qui est devant le miroir ?'
              : mode === 'couronne' ? 'Quelle cliente prévisualiser ?'
              : 'Quelle cliente régler ?'}
          </span>
          <input
            className="mnd-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher une cliente (nom, téléphone)…"
            style={{ flex: '1 1 220px', maxWidth: 320 }}
          />
        </div>
        {/* SANS RECHERCHE, LA LISTE SE TIENT (12 août) : 90 pastilles faisaient
            un mur de prénoms à double ascenseur. Deux rangées suffisent — la
            tête choisie d'abord, toujours visible, et le compteur dit le reste ;
            la recherche est le vrai chemin vers une tête précise. */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', maxHeight: 152, overflowY: 'auto', paddingRight: 4, alignItems: 'center' }}>
          {(query.trim()
            ? filtered
            : [client, ...filtered.filter((c) => c.id !== client.id)].slice(0, 16)
          ).map((c) => (
            <button
              key={c.id}
              className="trc-chip"
              style={c.id === client.id ? { background: 'var(--color-indigo)', color: 'var(--color-ivoire)', borderColor: 'var(--color-indigo)' } : undefined}
              onClick={() => setCIdx(clients.findIndex((x) => x.id === c.id))}
            >
              {c.name.split(' ')[0]}
            </button>
          ))}
          {!query.trim() && filtered.length > 16 && (
            <span className="mnd-muted" style={{ fontSize: 12 }}>
              … et {filtered.length - 16} autres, cherchez par nom ou téléphone.
            </span>
          )}
          {filtered.length === 0 && <span className="mnd-muted" style={{ fontSize: 12.5 }}>Aucune cliente ne correspond.</span>}
        </div>
      </div>

      {mode === 'apercu' && <Apercu client={client} />}
      {mode === 'couronne' && <CouronnePreview client={client} />}
      {mode === 'regie' && (
        <>
          <Regie client={client} />
          <ReglagesDeLaCarte />
          <InvitationCouronne />
        </>
      )}
    </div>
  );
}

/* ═══════ LA CARTE D'INVITATION — le lien de Ma Couronne, au salon ═══════

   Comment une cliente arrive sur l'application : elle SCANNE. Le QR vit ici
   (la Régie), s'imprime en carte A5 aux couleurs de la maison — comptoir,
   miroir, vitrine — et porte l'adresse calculée depuis l'origine servie,
   JAMAIS un domaine en dur (changer de compte GitHub ne casse rien : on
   réimprime, c'est tout). Ma Couronne est une PWA : scannée puis « Ajouter à
   l'écran d'accueil », elle s'installe comme une application. */
/* L'ADRESSE DE MA COURONNE. Sur le site déployé, le Trône vit sous /trone/ et
   sa sœur sous /couronne/ ; en développement (une seule origine), l'entrée est
   couronne.html. Jamais de domaine en dur : changer de compte ne casse rien. */
export const lienMaCouronne = () =>
  `${window.location.origin}${window.location.pathname.startsWith('/trone') ? '/couronne/' : '/couronne.html'}`;

/* LA CARTE A5 DE L'INVITATION, PARTAGÉE — 27 août. La page QR Codes la
   réclame aussi ; deux gabarits imprimés pour une seule carte finiraient par
   diverger, comme la devise l'a fait avant d'avoir sa source unique. */
export const imprimeCarteCouronne = () => {
  const lienCouronne = lienMaCouronne();
  {
    const { path, n } = qrMatrice(lienCouronne);
    const fen = window.open('', '_blank', 'noopener,width=520,height=760');
    if (!fen) return;
    fen.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8" />
<title>Ma Couronne, carte d'invitation</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,500;1,400&family=Jost:wght@400;500;600&display=swap" />
<style>
  @page { size: A5 portrait; margin: 0; }
  body { margin: 0; background: #F6F1E7; color: #14141B; font-family: 'Jost', sans-serif;
         display: flex; justify-content: center; }
  .carte { width: 148mm; min-height: 210mm; box-sizing: border-box; padding: 18mm 16mm;
           display: flex; flex-direction: column; align-items: center; text-align: center;
           border: 1px solid rgba(20,20,27,.14); outline: 2px solid #B97A4A; outline-offset: -6mm; }
  .marque { font-family: 'Jost', sans-serif; font-size: 13px; font-weight: 600; letter-spacing: .34em; color: #1E2150; }
  .titre { font-family: 'Cormorant Garamond', serif; font-weight: 300; font-size: 40px; color: #1E2150; margin: 10mm 0 2mm; }
  .sous { font-family: 'Cormorant Garamond', serif; font-style: italic; font-size: 16px; color: #45454F; max-width: 96mm; line-height: 1.5; }
  .qr { width: 64mm; height: 64mm; margin: 10mm 0 6mm; }
  .etapes { font-size: 12.5px; color: #14141B; line-height: 2; letter-spacing: .02em; }
  .etapes b { color: #9E6238; font-weight: 600; letter-spacing: .12em; }
  .lien { font-size: 11px; color: #45454F; margin-top: 5mm; letter-spacing: .04em; }
  .devise { margin-top: auto; font-family: 'Cormorant Garamond', serif; font-style: italic; font-size: 14px; color: #9E6238; }
</style></head><body>
  <div class="carte">
    <div class="marque">MAISON MND</div>
    <div class="titre">Ma Couronne.</div>
    <div class="sous">Vos rendez-vous, le suivi de votre couronne, le Cercle, dans votre poche.</div>
    <svg class="qr" viewBox="-2 -2 ${n + 4} ${n + 4}" role="img" aria-label="Scanner pour ouvrir Ma Couronne">
      <rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#F6F1E7" />
      <path d="${path}" fill="#1E2150" shape-rendering="crispEdges" />
    </svg>
    <div class="etapes">
      <b>1</b> · Scannez avec l'appareil photo<br />
      <b>2</b> · Créez votre espace, votre couronne vous reconnaît<br />
      <b>3</b> · « Ajouter à l'écran d'accueil », elle s'installe comme une application
    </div>
    <div class="lien">${lienCouronne}</div>
    <div class="devise">${DEVISE_COMPLETE}</div>
  </div>
  <script>window.onload = () => setTimeout(() => window.print(), 400);</script>
</body></html>`);
    fen.document.close();
  }
};

export function InvitationCouronne({ surComptoir }: {
  /** Posé par la page QR Codes : ouvre ce code en plein écran, face cliente. */
  surComptoir?: (g: { titre: string; phrase: string; valeur: string }) => void;
} = {}) {
  const lienCouronne = lienMaCouronne();
  const imprimer = imprimeCarteCouronne;

  return (
    <div className="tr-card" style={{ padding: '18px 22px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap' }}>
      {/* La taille EN STYLE, pas par la classe : `cpt__qrsvg` arrive avec le
          module du Comptoir et imposait ses 340 px d'écran de salon — le code
          débordait sous le texte (12 août). */}
      <div style={{ width: 96, height: 96, flex: 'none', border: '1px solid var(--hairline)', borderRadius: 3, padding: 5, background: '#f6f1e8' }}>
        <QrSvg valeur={lienCouronne} style={{ width: '100%', height: '100%', display: 'block' }} />
      </div>
      <div style={{ flex: 1, minWidth: 240 }}>
        <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 21, color: 'var(--color-indigo)' }}>
          Inviter les clientes sur Ma Couronne.
        </div>
        <div className="mnd-muted" style={{ fontSize: 12.5, marginTop: 5, lineHeight: 1.6, maxWidth: '62ch' }}>
          Scanné, ce code ouvre Ma Couronne : la cliente se crée un compte, puis
          « Ajouter à l’écran d’accueil » l’installe comme une application. Imprimez la
          carte pour le comptoir et le miroir, ou envoyez-lui le lien par WhatsApp.
        </div>
        <div style={{ marginTop: 8, fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--color-indigo)', wordBreak: 'break-all' }}>
          {lienCouronne}
        </div>
      </div>
      {/* LES GESTES À DROITE, EN COLONNE — 19 août : « arrange les boutons du
          même côté que les autres ». Cette carte était la seule de la page à
          poser ses boutons sous le texte ; l'œil devait chercher une nouvelle
          place à chaque carte. Même colonne, même ordre que ses voisines :
          l'affichage d'abord, l'impression, puis la copie. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 'none' }}>
        {surComptoir && (
          <Button
            variant="copper"
            size="sm"
            onClick={() => surComptoir({
              titre: 'Ma Couronne.',
              phrase: 'Scannez, votre couronne vous reconnaît.',
              valeur: lienCouronne,
            })}
          >
            Afficher au comptoir
          </Button>
        )}
        <Button variant={surComptoir ? 'ghost' : 'copper'} size="sm" onClick={imprimer}>Imprimer la carte A5</Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            void navigator.clipboard.writeText(lienCouronne).then(
              () => toast('Lien copié, collez-le dans WhatsApp ou un statut.'),
              () => toast(`Le lien : ${lienCouronne}`),
            );
          }}
        >
          Copier le lien
        </Button>
      </div>
    </div>
  );
}

/* ---------- Aperçu · le miroir auto-joué ---------- */
function Apercu({ client }: { client: ReturnType<typeof useBranchClients>[0] }) {
  const { currency } = useBranch();
  const [personas] = usePersonas();
  const appts = useBranchAppointments();
  const byId = useServicesById();
  const [cfg] = useStore(vitrineConfigStore);
  const today = todayISO();

  const [scene, setScene] = useState(0);
  const [playing, setPlaying] = useState(cfg.autoplay);
  const [variant, setVariant] = useState(0);
  const [servicesTous] = useServices();
  const [cfgMiroir] = useStore(vitrineConfigStore);
  const [q1, setQ1] = useState<string | null>(null);
  const [q2, setQ2] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  /* La naissance de la couronne prime (CRM) ; sinon l'entrée au CRM. */
  const days = Math.max(1, Math.round((Date.now() - fromISO(client.crownSince ?? client.since).getTime()) / 86400000));
  const persona = personas.find((p) => p.id === client.persona);
  const nextAppt = appts
    .filter((a) => a.clientId === client.id && a.date >= today && a.status !== 'annulé' && a.status !== 'honoré')
    .sort((a, b) => a.date.localeCompare(b.date))[0];

  const isQuizScene = scene === 2 && cfg.quizEnabled;

  useEffect(() => {
    if (timer.current) window.clearInterval(timer.current);
    if (!playing) return;
    timer.current = window.setInterval(() => {
      setScene((s) => {
        if (s === 2 && cfg.quizEnabled) return s; // la scène quiz laisse la cliente répondre
        return (s + 1) % SCENE_LABELS.length;
      });
    }, 4200);
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, [playing, cfg.quizEnabled]);

  const pool = QUIZ_POOL[variant % QUIZ_POOL.length];
  /* LA RECOMMANDATION VIENT DU CATALOGUE, et son prix est celui de la
     cliente — coefficient personnel compris, comme partout ailleurs dans la
     Maison. Plus de tarif inventé, plus de multiplicateur d'humeur : ce qui
     s'affiche au miroir est ce qu'elle paiera. */
  const svcReco = q1
    ? recoPourEnvie(client, q1 as EnvieKey, {
        /* Au miroir, le salon est là : le vivier est le catalogue entier, sans
           le filtre de calibre du tunnel. La CASCADE, elle, est la même — son
           persona, son histoire, le repli de la Maison — pour que les deux
           écrans ne racontent jamais deux histoires à la même tête. */
        offre: servicesTous,
        catalogue: servicesTous,
        personas,
        maison: cfgMiroir.recoParEnvie,
        appointments: appts,
        auto: cfgMiroir.recoAuto,
      })?.service
    : undefined;
  const mot = ENVIES.find((e) => e.k === q1);
  const reco = svcReco && mot ? { title: svcReco.name, line: mot.line.tu } : null;
  const recoPrice = svcReco ? personalPriceXof(svcReco, { clientCoef: client.priceCoef }) : 0;

  const goto = (s: number) => { setScene(s); setPlaying(false); };

  return (
    <div>
      <div className="trc-stage">
        <div className="trc-stage__scene">
          {scene === 0 && (
            <div className="trc-fade" style={{ display: 'flex', alignItems: 'center', gap: 48, maxWidth: 900 }}>
              <div style={{ position: 'relative', flex: 'none' }}>
                <div style={{ position: 'absolute', inset: -10, border: '1px solid rgba(185,122,74,.4)', borderRadius: '50%' }} />
                <Avatar client={client} size={140} />
              </div>
              <div>
                <div className="trc-stage__eyebrow">{persona?.name ?? 'Tête couronnée'}</div>
                <h1 className="trc-stage__title">Bonjour,<br />{client.name.split(' ')[0]}.</h1>
                <div className="trc-stage__line">Cela fait {days} jours que ta couronne grandit. Aujourd’hui, elle franchit un palier.</div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginTop: 24 }}>
                  <span style={{ width: 34, height: 1, background: 'var(--copper-200)' }} />
                  <span style={{ fontSize: 12, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--copper-200)' }}>{days} jours couronnée</span>
                </div>
              </div>
            </div>
          )}

          {scene === 1 && (
            <div className="trc-fade" style={{ textAlign: 'center', maxWidth: 720 }}>
              <div className="trc-stage__eyebrow" style={{ letterSpacing: '.3em' }}>Un mot pour toi</div>
              <div className="trc-stage__line" style={{ fontSize: 30, color: 'var(--color-ivoire)', marginTop: 24 }}>
                “{persona?.essence ?? 'Ta couronne raconte ta constance, la maison en est l’orfèvre.'}”
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 40 }}>
                <span style={{ width: 40, height: 1, background: 'rgba(246,241,231,.25)' }} />
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--copper-200)' }}>la Maison, rien que pour toi</span>
                <span style={{ width: 40, height: 1, background: 'rgba(246,241,231,.25)' }} />
              </div>
            </div>
          )}

          {scene === 2 && (
            <div className="trc-fade" style={{ textAlign: 'center', maxWidth: 640, width: '100%' }}>
              {cfg.quizEnabled ? (
                <>
                  <div className="trc-stage__eyebrow">Une question pour toi</div>
                  <h2 className="trc-stage__title" style={{ fontSize: 40 }}>Dis-nous, en deux gestes.</h2>
                  <div className="trc-stage__line" style={{ fontSize: 15, marginTop: 6, marginBottom: 26 }}>
                    Deux réponses, et ta prochaine couronne s’écrit déjà.
                    <button onClick={() => { setVariant((v) => v + 1); setQ1(null); setQ2(null); }} style={{ cursor: 'pointer', background: 'none', border: 'none', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--copper-200)', borderBottom: '1px solid var(--copper-200)', padding: '0 0 1px', marginLeft: 6 }}>
                      ↻ Autres questions
                    </button>
                  </div>
                  <QuizRow label={pool.q1.tu} opts={pool.q1opts} value={q1} onPick={setQ1} />
                  <div style={{ height: 22 }} />
                  <QuizRow label={pool.q2.tu} opts={pool.q2opts} value={q2} onPick={setQ2} />
                  {q1 && q2 && reco && (
                    <div className="trc-fade" style={{ marginTop: 30, background: 'rgba(185,122,74,.14)', border: '1px solid rgba(185,122,74,.42)', borderRadius: 4, padding: '22px 26px' }}>
                      <div className="trc-stage__eyebrow" style={{ letterSpacing: '.2em' }}>Pour toi, {client.name.split(' ')[0]}</div>
                      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 26, color: 'var(--color-ivoire)', marginTop: 7 }}>{reco.title}</div>
                      <div className="trc-stage__line" style={{ fontSize: 16, margin: '8px 0 14px' }}>{reco.line}</div>
                      <span className="trc-stage__piece">{fmtMoney(recoPrice, currency)} · tarif personnalisé</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="trc-stage__line" style={{ fontSize: 20 }}>Le quiz sur-mesure est désactivé pour cette Vitrine. Activez-le dans la Régie.</div>
              )}
            </div>
          )}

          {scene === 3 && (
            <div className="trc-fade" style={{ textAlign: 'center', maxWidth: 560 }}>
              <div className="trc-stage__eyebrow">Ton prochain moment</div>
              <h2 className="trc-stage__title" style={{ fontSize: 50 }}>On t’attend.</h2>
              <div style={{ background: 'rgba(246,241,231,.05)', border: '1px solid rgba(246,241,231,.12)', borderRadius: 4, padding: '26px 30px', marginTop: 24 }}>
                {nextAppt ? (
                  <>
                    <div style={{ fontFamily: 'var(--font-serif)', fontSize: 26, color: 'var(--color-ivoire)' }}>{frLong(nextAppt.date)}</div>
                    <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 44, color: 'var(--copper-200)', margin: '4px 0 14px' }}>{nextAppt.time}</div>
                    <div style={{ fontSize: 12, letterSpacing: '.06em', color: 'var(--indigo-100)' }}>avec {nextAppt.master} · {apptLabel(nextAppt, byId)}</div>
                  </>
                ) : (
                  <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 22, color: 'var(--color-ivoire)' }}>Ton fauteuil t’attend, réserve ton prochain rituel.</div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="trc-stage__controls">
          <button className="trc-stage__arrow" onClick={() => goto((scene + SCENE_LABELS.length - 1) % SCENE_LABELS.length)} aria-label="Précédent">‹</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ display: 'flex', gap: 9 }}>
              {SCENE_LABELS.map((label, i) => (
                <button key={label} className={`trc-dot ${i === scene ? 'is-active' : ''}`} style={{ width: i === scene ? 26 : 6 }} title={label} onClick={() => goto(i)} />
              ))}
            </div>
            <button onClick={() => setPlaying((p) => !p)} style={{ cursor: 'pointer', background: 'none', border: '1px solid rgba(246,241,231,.2)', borderRadius: '50%', width: 32, height: 32, color: 'var(--copper-200)', fontSize: 12 }} aria-label={playing ? 'Pause' : 'Lecture'}>
              {playing ? '❙❙' : '▶'}
            </button>
            <span style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--copper-200)', minWidth: 150, textAlign: 'center' }}>
              {SCENE_LABELS[scene]}{isQuizScene ? ' · en attente' : ''}
            </span>
          </div>
          <button className="trc-stage__arrow" onClick={() => goto((scene + 1) % SCENE_LABELS.length)} aria-label="Suivant">›</button>
        </div>
      </div>
      <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--ink-soft)', marginTop: 12 }}>
        La Vitrine se joue d’elle-même pendant le rituel, chaque scène est composée à partir de l’histoire réelle de la cliente.
      </div>
    </div>
  );
}

function QuizRow({ label, opts, value, onPick }: { label: string; opts: [string, string][]; value: string | null; onPick: (k: string) => void }) {
  return (
    <div style={{ width: '100%' }}>
      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 21, color: 'var(--color-ivoire)', marginBottom: 13 }}>{label}</div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        {opts.map(([k, l]) => {
          const on = value === k;
          return (
            <button
              key={k}
              onClick={() => onPick(k)}
              style={{
                cursor: 'pointer', fontSize: 13, letterSpacing: '.04em',
                color: on ? 'var(--color-obsidian)' : 'var(--color-ivoire)',
                background: on ? 'var(--copper-200)' : 'rgba(246,241,231,.06)',
                border: `1px solid ${on ? 'var(--copper-200)' : 'rgba(246,241,231,.22)'}`,
                borderRadius: 999, padding: '11px 22px', transition: 'all .25s',
              }}
            >
              {l}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Régie · la configuration de la Vitrine ---------- */
function Regie({ client }: { client: ReturnType<typeof useBranchClients>[0] }) {
  const [servicesRegie] = useServices();
  /* Les formules ont leur propre magasin, hors du catalogue des prestations :
     c'est pourquoi la régie ne les portait pas encore. */
  const [plansEnRegie] = usePlans();
  const [cfg] = useStore(vitrineConfigStore);
  const [categories] = useCategories();
  const [services] = useServices();
  const [products] = useProducts();
  const [personas] = usePersonas();
  const persona = personas.find((p) => p.id === client.persona);

  /* La liste blanche `visibleCategories` est RETIRÉE du juge (12 août) : semée
     une fois, jamais entretenue, elle cachait toute catégorie née après. Le
     réglage global vit au Catalogue (« Visible aux clientes », `enabled`). */

  /* LE TAPIS DE CUIVRE EST INDIVIDUEL (12 août — demande de Yéman : « là,
     c'est Marie »). Les interrupteurs écrivaient la config GLOBALE du miroir :
     masquer pour une tête masquait pour toutes. Ils écrivent désormais SES
     masques, sur SA fiche (`Client.vitrineMasques`) ; la config globale ne
     garde que ce qui vaut pour toute la Maison (la carte de gauche le dit). */
  /* DEUX PORTÉES, UN COMMUTATEUR (12 août) : le tapis se compose pour CETTE
     cliente (sa fiche, `vitrineMasques`) ou pour TOUTE LA MAISON (le socle,
     VitrineConfig). Les masques individuels s'ajoutent toujours au socle. */
  const [portee, setPortee] = useState<'cliente' | 'maison'>('cliente');
  const masques = client.vitrineMasques ?? {};
  const herCats = masques.categories ?? [];
  const herSvcs = masques.services ?? [];
  const herProds = masques.products ?? [];
  const gCats = cfg.hiddenCategories ?? [];
  const setMasques = (patch: Partial<NonNullable<typeof client.vitrineMasques>>) =>
    clientsStore.set((prev) => prev.map((c) => (c.id === client.id
      ? { ...c, vitrineMasques: { ...(c.vitrineMasques ?? {}), ...patch } }
      : c)));
  const bascule = (l: string[], id: string) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]);

  /* En portée cliente, un masque MAISON se voit (éteint) mais ne se rallume
     pas d'ici — la carte le dit ; on bascule en portée Maison pour ça. */
  const masqueMaisonCat = (id: string) => gCats.includes(id);
  const masqueMaisonSvc = (id: string) => cfg.hiddenServices.includes(id);
  const masqueMaisonProd = (id: string) => cfg.hiddenProducts.includes(id);
  const catVisible = (id: string) => (portee === 'maison' ? !gCats.includes(id) : !herCats.includes(id) && !gCats.includes(id));
  const svcVisible = (id: string) => (portee === 'maison' ? !cfg.hiddenServices.includes(id) : !herSvcs.includes(id) && !cfg.hiddenServices.includes(id));
  const prodVisible = (id: string) => (portee === 'maison' ? !cfg.hiddenProducts.includes(id) : !herProds.includes(id) && !cfg.hiddenProducts.includes(id));
  const toggleCat = (id: string) => (portee === 'maison'
    ? vitrineConfigStore.set((c) => ({ ...c, hiddenCategories: bascule(c.hiddenCategories ?? [], id) }))
    : (masqueMaisonCat(id) ? undefined : setMasques({ categories: bascule(herCats, id) })));
  const toggleSvc = (id: string) => (portee === 'maison'
    ? vitrineConfigStore.set((c) => ({ ...c, hiddenServices: bascule(c.hiddenServices, id) }))
    : (masqueMaisonSvc(id) ? undefined : setMasques({ services: bascule(herSvcs, id) })));
  const toggleProd = (id: string) => (portee === 'maison'
    ? vitrineConfigStore.set((c) => ({ ...c, hiddenProducts: bascule(c.hiddenProducts, id) }))
    : (masqueMaisonProd(id) ? undefined : setMasques({ products: bascule(herProds, id) })));
  /* ── LES FORMULES, MÊME RÈGLE QUE TOUT LE RESTE — 28 août 2026 ──
     « Je ne veux pas rendre visible tous les abonnements en ligne sur Ma
     Couronne » (Yéman). Elles y étaient TOUTES, sans exception : celles qui se
     négocient au comptoir, celles qu'on garde pour une tête précise, celles
     qu'on n'a pas fini d'écrire. Une formule mal ficelée, lue par une cliente
     avant que la Maison l'ait décidée, se réclame ensuite au comptoir.

     MASQUER N'EFFACE PAS. Celles qui la portent déjà gardent leur formule,
     leur prix et leurs quotas : le masque ne touche QUE la vitrine. C'est la
     réponse à « la retirer de la vente sans l'effacer », que le bouton
     « Retirer » ne pouvait pas donner puisqu'il refuse tant qu'une abonnée
     est dessus. */
  const herPlans = masques.plans ?? [];
  const gPlans = cfg.hiddenPlans ?? [];
  const masqueMaisonPlan = (id: string) => gPlans.includes(id);
  const planVisible = (id: string) => (portee === 'maison' ? !gPlans.includes(id) : !herPlans.includes(id) && !gPlans.includes(id));
  const togglePlan = (id: string) => (portee === 'maison'
    ? vitrineConfigStore.set((c) => ({ ...c, hiddenPlans: bascule(c.hiddenPlans ?? [], id) }))
    : (masqueMaisonPlan(id) ? undefined : setMasques({ plans: bascule(herPlans, id) })));
  const setFlag = (k: 'autoplay' | 'quizEnabled' | 'quizCouronne' | 'recoAuto', v: boolean) => vitrineConfigStore.set((c) => ({ ...c, [k]: v }));

  /* Ce que la portée choisie DONNE À VOIR — le juge unique. */
  const sonCatalogue = useMemo(
    () => catalogueVisiblePour({ cfg, masques: portee === 'cliente' ? client.vitrineMasques : undefined, cats: categories, services, products }),
    [cfg, client, categories, services, products, portee],
  );
  const carpet = useMemo(
    () => [...sonCatalogue.services.map((x) => x.name), ...sonCatalogue.products.map((x) => x.name)],
    [sonCatalogue],
  );

  const onCount = carpet.length;
  const offCount = services.length + products.length - onCount;

  const byCat = (catId: string) => ({
    services: services.filter((s) => s.categoryId === catId).sort((a, b) => a.order - b.order),
    products: products.filter((p) => p.categoryId === catId).sort((a, b) => a.order - b.order),
  });

  return (
    <div className="tr-cols" style={{ '--cols': '340px 1fr', gap: 18, alignItems: 'start' } as CSSProperties}>
      {/* Colonne gauche · la cliente + réglages globaux */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* CETTE CLIENTE — en clair. L'indigo est réservé à ce qui vaut pour
            TOUTE la Maison ; le clair dit « cette tête-là ». Deux surfaces
            indigo de portées différentes ne disaient plus rien de leur portée. */}
        <div style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderLeft: '3px solid var(--color-copper)', borderRadius: 4, padding: '16px 18px' }}>
          <div className="trc-microlabel" style={{ margin: 0 }}>La cliente devant la régie</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 12 }}>
            <Avatar client={client} size={46} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 22, color: 'var(--color-indigo)', lineHeight: 1 }}>{client.name.split(' ')[0]}</div>
              <div className="trc-sub" style={{ marginTop: 4 }}>{persona?.name ?? 'À classer'}</div>
            </div>
          </div>
          {persona && <div className="trc-sub" style={{ marginTop: 10, lineHeight: 1.5 }}>{persona.essence}</div>}
        </div>

        <div style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderRadius: 4, padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 34, color: 'var(--color-indigo)', lineHeight: 1 }}>{onCount}</div>
              <div className="trc-microlabel" style={{ color: 'var(--ink-soft)', marginTop: 5 }}>sur son tapis</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 34, color: 'var(--ink-soft)', lineHeight: 1 }}>{offCount}</div>
              <div className="trc-microlabel" style={{ color: 'var(--ink-soft)', marginTop: 5 }}>hors-champ</div>
            </div>
          </div>
        </div>

        {/* LA PORTÉE SE LIT AU FILET. Cuivre = cette cliente ; indigo = toute la
            Maison. Ces réglages-ci valaient pour toutes mais s'affichaient comme
            les siens, sous sa fiche — on croyait régler son miroir à elle.
            Le fond reste clair : ces cartes portent des champs et des listes,
            que l'indigo rendrait illisibles. */}
        <div style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderLeft: '3px solid var(--color-indigo)', borderRadius: 4, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="trc-microlabel" style={{ margin: 0 }}>Le miroir · pour toutes les clientes</div>
          <SwitchRow label="Lecture automatique" sub="Le miroir enchaîne les scènes seul." on={cfg.autoplay} onToggle={(v) => setFlag('autoplay', v)} />
          {/* DEUX SURFACES, DEUX INTERRUPTEURS — et chacun là où il commande.
              Celui-ci compose le miroir du salon ; celui de Ma Couronne vit dans
              l'onglet Ma Couronne, avec le reste de ce qui gouverne son
              application. Au fauteuil la maîtresse est là pour expliquer, sur
              le téléphone la cliente est seule : ça ne s'éteint pas ensemble. */}
          <SwitchRow
            label="Quiz au miroir du salon"
            sub="La scène « une question pour toi », pendant le rituel."
            on={cfg.quizEnabled}
            onToggle={(v) => setFlag('quizEnabled', v)}
          />

          {/* ══ LE RÈGLEMENT DEPUIS MA COURONNE — 29 août 2026 ═══════
              « Je veux avoir un autre seuil, que je vous donne » (Yéman).
              Plutôt que d'attendre son chiffre et de le figer dans le code, le
              seuil se pose ici et se relit dans Ma Couronne.

              DEUX FOIS SEULEMENT, JAMAIS QUATRE. La découpe en quatre est un
              accord qui se donne en face, pas une case à cocher sur un
              téléphone : elle reste au Trône, et cet écran ne l'offre pas. */}
          <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="trc-microlabel" style={{ margin: 0 }}>Régler en deux fois · Ma Couronne</div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--ink-soft)' }}>
              À partir de (F)
              <input
                className="mnd-input"
                style={{ width: 130 }}
                inputMode="numeric"
                value={String(seuilCliente(cfg.seuilDeuxFoisXof))}
                onChange={(e) => {
                  const v = Math.max(0, parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0);
                  vitrineConfigStore.set((c) => ({ ...c, seuilDeuxFoisXof: v }));
                }}
              />
            </label>
            <div className="mnd-muted" style={{ fontSize: 11, lineHeight: 1.6 }}>
              En dessous, elle règle en une fois. La découpe en quatre reste la vôtre, au comptoir.
            </div>
          </div>

          {/* LE SUR-MESURE (12 août) — remises, minimum et ateliers
              d'abonnement se règlent ICI, plus dans le code. */}
          <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="trc-microlabel" style={{ margin: 0 }}>Sur-mesure · « Vous composez »</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {([['ponctuelPct', 'Ponctuel −%'], ['aboPct', 'Abonnement −%'], ['aboMin', 'Minimum abo.']] as const).map(([k, l]) => (
                <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--ink-soft)' }}>
                  {l}
                  <input
                    className="mnd-input"
                    style={{ width: 92 }}
                    inputMode="numeric"
                    value={String(surMesureDe(cfg)[k])}
                    onChange={(e) => {
                      const v = Math.max(0, Math.min(k === 'aboMin' ? 12 : 90, parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0));
                      vitrineConfigStore.set((c) => ({ ...c, surMesure: { ...surMesureDe(c), [k]: v } }));
                    }}
                  />
                </label>
              ))}
            </div>
            {/* DEUX RÉGIMES, DEUX ARBRES (12 août — « ils ne doivent pas avoir
                accès aux mêmes ateliers ») : le ponctuel et l'abonnement se
                cochent séparément. Un parent coché couvre son sous-arbre ;
                l'enfant couvert se montre inclus et dit pourquoi. */}
            {([
              ['ponctuelCats', 'Ouvert au PONCTUEL', 'Aucune case cochée = tout le catalogue visible.'],
              ['aboCats', 'Ouvert à l’ABONNEMENT', 'Cocher un parent couvre tout son sous-arbre.'],
            ] as const).map(([champ, titre, note]) => {
              const smCfg = surMesureDe(cfg);
              const liste = smCfg[champ];
              const parentDe = (c: (typeof categories)[number]) => categories.find((x) => x.id === c.parentId);
              const profondeur = (c: (typeof categories)[number]): number => {
                let d = 0; let cur = c;
                for (let i = 0; cur.parentId && i < 8; i += 1) {
                  const p = parentDe(cur); if (!p) break; cur = p; d += 1;
                }
                return d;
              };
              const couvrePar = (c: (typeof categories)[number]) => {
                let cur = c;
                for (let i = 0; cur.parentId && i < 8; i += 1) {
                  const p = parentDe(cur); if (!p) break;
                  if (liste.includes(p.id)) return p;
                  cur = p;
                }
                return undefined;
              };
              return (
                <div key={champ} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--ink-soft)' }}>
                    {titre} — {note}
                  </div>
                  {catsDansLOrdre(categories).map((c) => {
                    const dans = liste.includes(c.id);
                    const couvert = couvrePar(c);
                    return (
                      <label
                        key={c.id}
                        title={couvert ? `Couvert par ${couvert.fon}, décocher le parent pour choisir plus fin.` : undefined}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-sans)', fontSize: 12, cursor: couvert ? 'default' : 'pointer', paddingLeft: profondeur(c) * 16, opacity: couvert ? 0.6 : 1 }}
                      >
                        <input
                          type="checkbox"
                          checked={dans || !!couvert}
                          disabled={!!couvert}
                          onChange={() => vitrineConfigStore.set((cf) => {
                            const cur = surMesureDe(cf);
                            return { ...cf, surMesure: { ...cur, [champ]: dans ? cur[champ].filter((x) => x !== c.id) : [...cur[champ], c.id] } };
                          })}
                        />
                        {c.fon} · {c.label}
                      </label>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* CE QUE LE QUIZ PROPOSE — pris au catalogue, jamais inventé. Le
              miroir recommandait quatre rituels écrits en dur, à des prix qui
              n existaient nulle part : montrés a une cliente, ils devenaient
              une promesse que la Maison n avait jamais faite. */}
          {(cfg.quizEnabled || cfg.quizCouronne !== false) && (
            <>
              <SwitchRow
                label="Son histoire tranche"
                sub="Parmi les prestations désignées, celle que ses rendez-vous rendent la plus juste."
                on={!!cfg.recoAuto}
                onToggle={(v) => setFlag('recoAuto', v)}
              />
              <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="mnd-muted" style={{ fontSize: 11.5, lineHeight: 1.55 }}>
                  <b style={{ fontWeight: 500 }}>Le repli de la Maison</b>, ce qui se propose quand
                  l’archétype de la cliente n’a rien dit. La désignation qui compte se fait{' '}
                  <b style={{ fontWeight: 500 }}>par persona</b> (CRM → Les personas). Rien nulle
                  part = rien n’est recommandé, et le quiz ne s’ouvre pas sur son téléphone. Une
                  prestation masquée à la Vitrine ne se propose jamais.
                  {cfg.quizCouronne === false && (
                    <><br />
                      <b style={{ fontWeight: 500, color: 'var(--copper-700)' }}>
                        Le quiz est éteint sur Ma Couronne
                      </b>{' '},
                      ces désignations ne servent donc plus qu’au miroir du salon.
                      Son interrupteur est dans l’onglet <b style={{ fontWeight: 500 }}>Ma Couronne</b>.
                    </>
                  )}
                </div>
                {ENVIES.map((e) => (
                  <label key={e.k} style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12.5 }}>{e.label}</span>
                    <select
                      className="sys-select"
                      style={{ maxWidth: 230, flex: 1 }}
                      value={cfg.recoParEnvie?.[e.k] ?? ''}
                      onChange={(ev) => vitrineConfigStore.set((c) => ({ ...c, recoParEnvie: { ...(c.recoParEnvie ?? {}), [e.k]: ev.target.value || undefined } }))}
                    >
                      <option value="">— aucune —</option>
                      {servicesRegie.map((sv) => <option key={sv.id} value={sv.id}>{sv.name}</option>)}
                    </select>
                  </label>
                ))}
              </div>
              <RecoResolue client={client} />
            </>
          )}
        </div>
      </div>

      {/* Colonne droite · la curation */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <div className="trc-microlabel" style={{ color: 'var(--copper-700)' }}>La régie de la vitrine</div>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 28, color: 'var(--color-indigo)', margin: '2px 0 0' }}>
            {portee === 'cliente' ? 'Compose son tapis de cuivre.' : 'Compose le tapis de la Maison.'}
          </h2>
          <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 15, color: 'var(--ink-soft)', marginTop: 5 }}>
            {portee === 'cliente'
              ? <>Choisis ce que {client.name.split(' ')[0]} verra, et ce qu’elle ne verra pas.</>
              : <>Ce que TOUTES les clientes verront, les masques individuels s’y ajoutent.</>}
          </div>
          {/* LE COMMUTATEUR DE PORTÉE — la cliente devant la régie, ou toute
              la Maison. Deux niveaux, deux écritures : sa fiche, ou le socle. */}
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            {([['cliente', `Pour ${client.name.split(' ')[0]}`], ['maison', 'Pour toutes les clientes']] as const).map(([k, l]) => (
              <button
                key={k}
                type="button"
                aria-pressed={portee === k}
                onClick={() => setPortee(k)}
                style={{
                  cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 12, letterSpacing: '.04em',
                  color: portee === k ? 'var(--color-ivoire)' : 'var(--color-indigo)',
                  background: portee === k ? 'var(--color-indigo)' : 'transparent',
                  border: '1px solid var(--color-indigo)', borderRadius: 3, padding: '8px 16px', transition: 'all .2s',
                }}
              >
                {l}
              </button>
            ))}
            {/* LE RETOUR AUX DÉFAUTS DE LA MAISON — tout rallumer d'un geste
                (les masques individuels des fiches, eux, ne bougent pas). */}
            {portee === 'maison' && (gCats.length > 0 || cfg.hiddenServices.length > 0 || cfg.hiddenProducts.length > 0 || gPlans.length > 0) && (
              <button
                type="button"
                onClick={() => {
                  if (!window.confirm('Rétablir le tapis complet de la Maison ? Tous les masques valant pour toutes les clientes seront levés, ateliers, prestations, produits et formules redeviennent visibles. Les masques individuels posés sur les fiches ne bougent pas.')) return;
                  vitrineConfigStore.set((c) => ({ ...c, hiddenCategories: [], hiddenServices: [], hiddenProducts: [], hiddenPlans: [] }));
                }}
                style={{
                  cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 12, letterSpacing: '.04em',
                  color: 'var(--copper-700)', background: 'transparent',
                  border: '1px solid var(--copper-300)', borderRadius: 3, padding: '8px 16px', transition: 'all .2s',
                }}
              >
                Rétablir le tapis complet
              </button>
            )}
            {/* LE RETOUR AUX DÉFAUTS POUR ELLE SEULE — lève ses masques à elle,
                sans toucher au socle de la Maison. */}
            {portee === 'cliente' && (herCats.length > 0 || herSvcs.length > 0 || herProds.length > 0) && (
              <button
                type="button"
                onClick={() => {
                  if (!window.confirm(`Rétablir le tapis complet de ${client.name.split(' ')[0]} ? Tous SES masques seront levés, elle verra tout ce que la Maison montre. Les masques valant pour toutes les clientes ne bougent pas.`)) return;
                  clientsStore.set((prev) => prev.map((c) => (c.id === client.id ? { ...c, vitrineMasques: undefined } : c)));
                }}
                style={{
                  cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 12, letterSpacing: '.04em',
                  color: 'var(--copper-700)', background: 'transparent',
                  border: '1px solid var(--copper-300)', borderRadius: 3, padding: '8px 16px', transition: 'all .2s',
                }}
              >
                Rétablir son tapis complet
              </button>
            )}
          </div>
        </div>

        {/* ══ LES FORMULES EN VITRINE ══════════════════════════════
            « Dans Le Trône, Vitrine, mes formules ne sont pas ajoutées »
            (Yéman, 29 août). Elles y étaient, mais DEUX FOIS INTROUVABLES :
            enterrées sous tout le catalogue des ateliers, et purement absentes
            quand la liste était vide. Une section qui disparaît ne se cherche
            pas, elle se croit manquante.

            Elles remontent donc AVANT le catalogue, et la section reste là
            même sans une seule formule, pour dire pourquoi. */}
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <div className="trc-microlabel" style={{ margin: 0 }}>Les formules en vitrine</div>
            <span className="mnd-muted" style={{ fontSize: 11.5 }}>
              {plansEnRegie.length === 0
                ? 'Aucune formule au catalogue pour l’instant.'
                : (() => {
                  const n = plansEnRegie.filter((pl) => planVisible(pl.id)).length;
                  return n === plansEnRegie.length
                    ? 'Toutes en vitrine.'
                    : `${n} sur ${plansEnRegie.length} en vitrine.`;
                })()}
              {plansEnRegie.length > 0 ? ' Masquer n’efface rien : celles qui la portent la gardent.' : ''}
            </span>
          </div>
          {plansEnRegie.length === 0 ? (
            <div className="mnd-muted" style={{ fontSize: 12.5, border: '1px dashed var(--hairline)', borderRadius: 3, padding: '14px 16px', lineHeight: 1.6 }}>
              Vos abonnements se créent dans <b style={{ color: 'var(--color-indigo)' }}>Équipe &amp; croissance
              → Abonnements</b>. Dès qu’une formule existe, elle paraît ici et vous choisissez
              si Ma Couronne la montre.
            </div>
          ) : (
            <div className="tr-grid tr-grid--2">
              {plansEnRegie.map((pl) => (
                <ToggleCard
                  key={pl.id}
                  name={pl.name}
                  sub={portee === 'cliente' && masqueMaisonPlan(pl.id)
                    ? 'Formule · masquée pour toute la Maison'
                    : (pl.mode === 'pack' ? 'Paquet de crédits' : 'Abonnement')}
                  on={planVisible(pl.id)}
                  onToggle={() => togglePlan(pl.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* DEUX NIVEAUX, DEUX GESTES — dit une fois, en tête des sections.
            L'interrupteur de l'atelier éteint tout ce qu'il contient ; celui
            d'une prestation ne coupe QU'ELLE. La question de Yéman (15 août)
            portait exactement là : masquer WÈWÈ™ à Façon sans perdre LES SOINS. */}
        <div style={{ background: 'var(--copper-50)', border: '1px solid var(--copper-300)', borderRadius: 4, padding: '11px 14px', fontFamily: 'var(--font-sans)', fontSize: 11.5, lineHeight: 1.6, color: 'var(--copper-700)' }}>
          L’interrupteur de l’<b style={{ fontWeight: 500 }}>atelier</b> éteint tout ce qu’il contient.
          Celui d’une <b style={{ fontWeight: 500 }}>prestation</b> ne coupe qu’elle, masquer
          « WÈWÈ™ à Façon » laisse LES SOINS entiers. Une prestation masquée disparaît de la
          Vitrine, de Ma Couronne et des recommandations ; le comptoir, lui, la garde.
        </div>

        {/* Les sections de la régie déroulent dans l'ORDRE DU CATALOGUE —
            l'arbre, chaque famille derrière son atelier (12 août) — et LES
            MONDES SE DISENT : un intertitre quand on passe de l'Atelier au
            plateau, au Studio. */}
        {(() => {
          let mondePrec: string | null = null;
          return catsDansLOrdre(categories).map((cat) => {
          const { services: cs, products: cp } = byCat(cat.id);
          if (cs.length === 0 && cp.length === 0) return null;
          const catOn = catVisible(cat.id);
          const catMaison = portee === 'cliente' && masqueMaisonCat(cat.id);
          const monde = mondeLabel(mondeDeCat(cat, categories));
          const nouveauMonde = monde !== mondePrec;
          mondePrec = monde;
          return (
            <div key={cat.id}>
              {nouveauMonde && (
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 10.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--copper-700)', borderBottom: '2px solid var(--copper-300)', paddingBottom: 6, marginBottom: 14 }}>
                  {monde}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 12 }}>
                <div className="trc-microlabel" style={{ margin: 0 }}>
                  {cat.fon} · {cat.label}
                  {catMaison && <span style={{ color: 'var(--copper-700)', textTransform: 'none', letterSpacing: 0 }}>, masqué pour toute la Maison</span>}
                </div>
                <button
                  className={`trc-switch ${catOn ? 'is-on' : ''}`}
                  onClick={() => toggleCat(cat.id)}
                  aria-label={`Catégorie ${cat.fon}`}
                  title={catMaison
                    ? 'Masqué pour toute la Maison, bascule sur « Pour toutes les clientes » pour le rallumer.'
                    : catOn ? 'Catégorie visible' : 'Catégorie masquée'}
                />
              </div>
              <div className="tr-grid tr-grid--2" style={{ opacity: catOn ? 1 : 0.4, pointerEvents: catOn ? 'auto' : 'none' }}>
                {cs.map((s) => (
                  <ToggleCard
                    key={s.id}
                    name={s.name}
                    sub={portee === 'cliente' && masqueMaisonSvc(s.id) ? `${s.palier} · masqué pour toute la Maison` : `${s.palier}`}
                    on={svcVisible(s.id)}
                    onToggle={() => toggleSvc(s.id)}
                  />
                ))}
                {cp.map((p) => (
                  <ToggleCard
                    key={p.id}
                    name={p.name}
                    sub={portee === 'cliente' && masqueMaisonProd(p.id) ? 'Produit maison · masqué pour toute la Maison' : 'Produit maison'}
                    on={prodVisible(p.id)}
                    onToggle={() => toggleProd(p.id)}
                  />
                ))}
              </div>
            </div>
          );
          });
        })()}

        {/* Le tapis de cuivre */}
        <div style={{ background: 'var(--grad-indigo, linear-gradient(160deg,#1E2150,#15173A))', borderRadius: 4, padding: '22px 24px 26px', color: 'var(--color-ivoire)' }}>
          <div className="trc-microlabel" style={{ color: 'var(--copper-200)', margin: 0 }}>
            Le tapis de cuivre · {portee === 'cliente' ? client.name.split(' ')[0] : 'toute la Maison'}
          </div>
          <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 15, color: 'var(--indigo-100)', marginTop: 4 }}>
            {portee === 'cliente' ? 'Ce qu’elle foulera, dans cet ordre, rien d’autre.' : 'Le socle commun, chaque fiche peut encore y retrancher.'}
          </div>
          <div style={{ marginTop: 20, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', minHeight: 54 }}>
            {carpet.length === 0 ? (
              <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 15, color: 'var(--indigo-200)' }}>Tapis vide, allume au moins une pièce.</span>
            ) : (
              carpet.map((name) => <span key={name} className="trc-stage__piece">{name}</span>)
            )}
          </div>
        </div>

        {/* L ESSAI EN VRAI, sous les réglages. Régler d un côté et vérifier de
            l autre obligeait à changer d onglet à chaque case cochée : on ne
            voyait jamais l effet du geste qu on venait de faire. Le miroir est
            donc ici, vivant, nourri par la configuration du dessus — coche une
            catégorie, réponds au quiz, et tu vois exactement ce que la cliente
            verra. */}
        <div>
          <div className="trc-microlabel" style={{ color: 'var(--copper-700)' }}>L essai · ce que {client.name.split(' ')[0]} verra</div>
          <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 4, marginBottom: 12, lineHeight: 1.55 }}>
            Le miroir tel qu il se jouera devant elle. Réponds aux deux questions pour vérifier la
            prestation proposée et son prix, ce sont les vrais, pris au catalogue.
          </div>
          <Apercu client={client} />
        </div>
      </div>
    </div>
  );
}

/* CE QU'ELLE VERRA VRAIMENT, envie par envie — la cascade rendue lisible.
   Désigner sur le persona d'un côté et vérifier de l'autre laisserait deviner
   quel cran a répondu : on le dit, ici, pour la cliente qu'on regarde. */
function RecoResolue({ client }: { client: ReturnType<typeof useBranchClients>[0] }) {
  const [servicesTous] = useServices();
  const [personas] = usePersonas();
  const [cfg] = useStore(vitrineConfigStore);
  const appts = useBranchAppointments();
  const persona = personas.find((p) => p.id === client.persona);

  return (
    <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 14 }}>
      <div className="trc-microlabel" style={{ margin: '0 0 8px' }}>
        Pour {client.name.split(' ')[0]} · {persona?.name ?? 'persona à classer'}
      </div>
      {ENVIES.map((e) => {
        const r = recoPourEnvie(client, e.k, {
          offre: servicesTous,
          catalogue: servicesTous,
          personas,
          maison: cfg.recoParEnvie,
          appointments: appts,
          auto: cfg.recoAuto,
        });
        return (
          <div key={e.k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, fontSize: 11.5, padding: '4px 0' }}>
            <span style={{ color: 'var(--ink-soft)', flex: 'none' }}>{e.label}</span>
            <span style={{ textAlign: 'right', minWidth: 0 }}>
              {r ? (
                <>
                  {r.service.name}
                  <span style={{ color: 'var(--copper-700)' }}> · {recoSourceLabel(r.source)}</span>
                </>
              ) : (
                <span className="mnd-muted">rien à proposer</span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* UNE PRESTATION, SON INTERRUPTEUR (15 août, demande de Yéman : « masquer
   WÈWÈ™ à Façon sans masquer tout l'atelier »). Le geste existait déjà — la
   carte entière bascule — mais il ne se VOYAIT pas : une pastille cochée se
   lit comme une décoration, pas comme une commande, quand l'atelier juste
   au-dessus porte, lui, un vrai interrupteur. La carte porte donc le MÊME
   interrupteur, en plus petit, et dit son état en toutes lettres. */
function ToggleCard({ name, sub, on, onToggle }: { name: string; sub: string; on: boolean; onToggle: () => void }) {
  return (
    <button
      className={`trc-toggle ${on ? 'is-on' : ''}`}
      onClick={onToggle}
      aria-pressed={on}
      title={on ? `Masquer « ${name} », elle seule, l'atelier ne bouge pas` : `Remettre « ${name} » sur le tapis`}
    >
      <div className="trc-toggle__row">
        <span className="trc-toggle__name">{name}</span>
        <span className="trc-toggle__ctrl">
          <span className={`trc-toggle__switch ${on ? 'is-on' : ''}`} aria-hidden="true" />
          <span className="trc-toggle__state">{on ? 'Visible' : 'Masquée'}</span>
        </span>
      </div>
      <span className="trc-toggle__sub">{sub}</span>
    </button>
  );
}

function SwitchRow({ label, sub, on, onToggle }: { label: string; sub: string; on: boolean; onToggle: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div>
        <div style={{ fontSize: 13, color: 'var(--ink)' }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2 }}>{sub}</div>
      </div>
      <button className={`trc-switch ${on ? 'is-on' : ''}`} onClick={() => onToggle(!on)} aria-label={label} />
    </div>
  );
}

/* ---------- Ma Couronne · l'aperçu de l'app cliente + les modules par cliente ----
   Ce que VERRA cette cliente dans Ma Couronne, calculé sur les MÊMES données que
   l'app (catalogue visible, barème des modèles, Juste Prix, paliers, RDV, reco) —
   pour tester chaque écran AVANT de lancer les réservations. Et, par cliente, des
   modules à couper : Réserver · Composer · Suivi · Gamme · Cercle · Offres
   (fiche.hiddenModules, lus par l'app). */

const COURONNE_MODULES: { k: string; label: string; sub: string }[] = [
  { k: 'reserver', label: 'Réserver', sub: 'La prise de rendez-vous en ligne (tunnel en sept temps).' },
  { k: 'compose', label: 'Composer', sub: 'Le rituel sur-mesure (composeur).' },
  { k: 'suivi', label: 'Carnet de Suivi', sub: 'Onglet Suivi, parcours, photos, recommandation.' },
  { k: 'gamme', label: 'La Gamme', sub: 'Onglet boutique, produits maison, commandes.' },
  { k: 'cercle', label: 'Le Cercle', sub: 'Onglet fidélité, points et paliers.' },
  { k: 'offres', label: 'Offres instantanées', sub: 'Les offres du Marketing sur son accueil.' },
];

const fmtDur = (min: number): string =>
  min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${String(min % 60).padStart(2, '0')}` : ''}` : `${min} min`;

function CouronnePreview({ client }: { client: ReturnType<typeof useBranchClients>[0] }) {
  const { currency } = useBranch();
  const [categories] = useCategories();
  const [services] = useServices();
  const [products] = useProducts();
  const [tiers] = useTiers();
  const [bands] = useModelBands();
  const [cfg] = useStore(vitrineConfigStore);
  const appts = useBranchAppointments();
  const byId = useServicesById();
  const today = todayISO();

  const [screen, setScreen] = useState<'accueil' | 'reserver' | 'suivi' | 'cercle' | 'profil'>('accueil');

  /* LE PROFIL EST SIMULÉ LUI AUSSI. Il ne l'était pas, et la barre du bas en
     montrait pourtant l'icône : on croyait voir toute son application alors
     qu'un écran manquait — celui, justement, où vivent ses enfants. Un aperçu
     incomplet ment par omission. */
  const [familles] = useFamilies();
  const tetesBranche = useBranchClients();
  const [declarations] = useEnfantsDeclares();
  const portees = tetesPortees(client, tetesBranche, familles, today);
  const mesDemandes = declarationsDe(declarations, client.id);
  const enAttenteDElle = mesDemandes.filter((d) => d.statut === 'en attente');
  const refuseesDElle = mesDemandes.filter((d) => d.statut === 'refusé');

  const hidden = client.hiddenModules ?? [];
  /* L'APERÇU DOIT DIRE LA VÉRITÉ : un module fermé pour toute la Maison est
     fermé chez elle aussi, même si sa fiche ne dit rien. Le même juge que
     l'application (`useModuleFerme`, couronne/lib.ts). */
  const isOff = (k: string) => hidden.includes(k) || (cfg.modulesFermes ?? []).includes(k);
  const toggleModule = (k: string) =>
    clientsStore.set((prev) => prev.map((c) => (c.id === client.id
      ? { ...c, hiddenModules: (c.hiddenModules ?? []).includes(k) ? (c.hiddenModules ?? []).filter((x) => x !== k) : [...(c.hiddenModules ?? []), k] }
      : c)));

  /* Le catalogue VISIBLE côté cliente — LE JUGE UNIQUE (socle Maison + ses
     masques), le même que Ma Couronne : l'aperçu ne peut pas mentir. */
  const sonApercu = useMemo(
    () => catalogueVisiblePour({ cfg, masques: client.vitrineMasques, cats: categories, services, products }),
    [services, products, categories, cfg, client],
  );
  const visServices = sonApercu.services;

  /* SES prix, SA durée — le même moteur que l'app et le comptoir. */
  const [sets] = useBandSets();
  const pricing = pricingOf(client, bands, sets, categories);
  const priceLabel = (s: (typeof services)[number]) => {
    const mode = priceModeOf(s);
    if (mode === 'devis') return 'Prix en salon';
    const p = fmtMoney(personalPriceXof(s, pricing), currency);
    return mode === 'variable' ? `à partir de ${p}` : p;
  };

  /* Paliers du Cercle — la même échelle que l'app. */
  const points = client.loyaltyPoints ?? 0;
  const ladder = useMemo(() => [...tiers].sort((a, b) => a.pts - b.pts), [tiers]);
  const nextTier = ladder.find((t) => points < t.pts);
  const attained = ladder.filter((t) => t.pts <= points);

  const nextAppt = appts
    .filter((a) => a.clientId === client.id && a.date >= today && a.status !== 'annulé' && a.status !== 'honoré')
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const honoredCount = appts.filter((a) => a.clientId === client.id && a.status === 'honoré').length;
  const lastVisit = appts
    .filter((a) => a.clientId === client.id && a.status === 'honoré')
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const reco = products.find((p) => p.id === client.recoProductId);
  const first = client.name.split(' ')[0];

  const screenOff = (k: 'suivi' | 'cercle') => (isOff(k) ? (
    <div style={{ margin: '30px 14px', padding: '18px 16px', textAlign: 'center', border: '1px dashed var(--copper-300)', borderRadius: 4, color: 'var(--copper-700)', fontSize: 12.5, lineHeight: 1.5 }}>
      Module coupé pour {first}, cet onglet n'existe pas dans son application.
    </div>
  ) : null);

  /* Ce que la Maison a fermé pour tout le monde — lu deux fois ci-dessous. */
  const fermeMaison = (k: string) => (cfg.modulesFermes ?? []).includes(k);
  const ouvertsMaison = COURONNE_MODULES.filter((m) => !fermeMaison(m.k)).length;
  /* Ce que SA fiche retire EN PLUS de la Maison — le seul chiffre qui la
     concerne. Compter les modules fermés par la Maison dans son total ferait
     croire que quelqu'un a décidé quelque chose pour elle. */
  const retiresPourElle = COURONNE_MODULES.filter((m) => hidden.includes(m.k) && !fermeMaison(m.k)).length;

  return (
    <>
      {/* ═══ ① LA MAISON — en tête et pleine largeur, parce que ça vaut pour
           TOUTES. Sous la fiche d'une cliente, ces interrupteurs se lisaient
           comme les siens : on croyait fermer une porte à Lutgarde alors qu'on
           la fermait à cent soixante-dix-huit têtes. ═══ */}
      <div style={{ background: 'var(--color-indigo)', borderRadius: 4, padding: '20px 22px', color: 'var(--color-ivoire)', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div className="trc-microlabel" style={{ color: 'var(--copper-200)', margin: 0 }}>
              Ma Couronne · la Maison
            </div>
            <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 22, marginTop: 3 }}>
              Ce qui vaut pour toutes les clientes.
            </div>
          </div>
          <span style={{ fontSize: 11, color: 'var(--indigo-100)' }}>
            {cfg.couronneFermee ? 'Application fermée' : `${ouvertsMaison}/${COURONNE_MODULES.length} modules ouverts`}
          </span>
        </div>

        {/* LA PORTE. */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginTop: 18 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5 }}>L’application est ouverte</div>
            <div style={{ fontSize: 11, color: 'var(--indigo-100)', marginTop: 2, lineHeight: 1.5 }}>
              Fermée, personne n’entre, même pas pour se connecter. Elles lisent votre mot.
            </div>
          </div>
          <button
            className={`trc-switch ${!cfg.couronneFermee ? 'is-on' : ''}`}
            onClick={() => vitrineConfigStore.set((c) => ({ ...c, couronneFermee: !c.couronneFermee }))}
            aria-label="Ma Couronne ouverte"
            style={{ flex: 'none' }}
          />
        </div>

        {cfg.couronneFermee ? (
          <div style={{ marginTop: 14 }}>
            <textarea
              className="mnd-input"
              value={cfg.couronneMot ?? ''}
              onChange={(e) => vitrineConfigStore.set((c) => ({ ...c, couronneMot: e.target.value || undefined }))}
              placeholder="La maison ne prend pas de réservation en ligne en ce moment. Écrivez-nous, on vous répondra."
              style={{ width: '100%', boxSizing: 'border-box', minHeight: 62, resize: 'vertical', fontSize: 12.5 }}
              aria-label="Le mot lu par les clientes"
            />
            <div style={{ fontSize: 10.5, color: 'var(--indigo-100)', marginTop: 5, lineHeight: 1.5 }}>
              Laissé vide, un mot de la Maison s’affiche. Dites pourquoi et quand vous rouvrez,
              une porte close sans explication ne se comprend pas.
            </div>
          </div>
        ) : (
          <>
            {/* LE QUIZ — un réglage de Ma Couronne, donc ici. Celui du miroir du
                salon reste à la Régie : au fauteuil la maîtresse explique, sur
                le téléphone la cliente est seule. */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(246,241,231,.2)' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5 }}>Le quiz au seuil de la réservation</div>
                <div style={{ fontSize: 11, color: 'var(--indigo-100)', marginTop: 2, lineHeight: 1.5 }}>
                  Deux questions avant « Votre objectif », puis une prestation proposée à son prix.
                  {fermeMaison('reserver')
                    ? ' Sans effet : la réservation est fermée pour toutes.'
                    : ENVIES.every((e) => !cfg.recoParEnvie?.[e.k])
                      && ' Rien n’est désigné en repli, il ne s’ouvrira que pour les têtes dont le persona propose quelque chose.'}
                </div>
              </div>
              <button
                className={`trc-switch ${cfg.quizCouronne !== false ? 'is-on' : ''}`}
                onClick={() => vitrineConfigStore.set((c) => ({ ...c, quizCouronne: c.quizCouronne === false }))}
                aria-label="Quiz sur Ma Couronne"
                style={{ flex: 'none' }}
              />
            </div>

            {/* LES SIX PIÈCES, en grille : une liste de six lignes empilées
                donnait une colonne interminable pour six interrupteurs. */}
            <div className="trc-microlabel" style={{ color: 'var(--copper-200)', margin: '18px 0 10px' }}>
              Les onglets de son application
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px 26px' }}>
              {COURONNE_MODULES.map((m) => (
                <div key={m.k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: fermeMaison(m.k) ? 'var(--indigo-200)' : 'var(--color-ivoire)' }}>{m.label}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--indigo-100)', marginTop: 2 }}>{m.sub}</div>
                  </div>
                  <button
                    className={`trc-switch ${!fermeMaison(m.k) ? 'is-on' : ''}`}
                    onClick={() => vitrineConfigStore.set((c) => {
                      const l = c.modulesFermes ?? [];
                      return { ...c, modulesFermes: l.includes(m.k) ? l.filter((x) => x !== m.k) : [...l, m.k] };
                    })}
                    aria-label={`Module ${m.label} pour toutes`}
                    style={{ flex: 'none' }}
                  />
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ═══ ② UNE CLIENTE — et seulement elle. ═══ */}
      <div className="trc-microlabel" style={{ color: 'var(--copper-700)', marginBottom: 10 }}>
        Rien que pour {first}
      </div>

      <div className="tr-cols" style={{ '--cols': 'minmax(300px, 360px) 1fr', gap: 18, alignItems: 'start' } as CSSProperties}>
        {/* ----- Colonne gauche : sa fiche et ce qu'on lui retire ----- */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Sa carte d'identité — CLAIRE, et non plus indigo : l'indigo dit
              désormais « la Maison », le clair dit « cette tête-là ». Deux blocs
              indigo côte à côte ne disaient plus rien de leur portée. */}
          <div style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderLeft: '3px solid var(--color-copper)', borderRadius: 4, padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <Avatar client={client} size={46} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 22, color: 'var(--color-indigo)', lineHeight: 1 }}>{first}</div>
                <div className="trc-sub" style={{ marginTop: 4 }}>
                  {client.lockCount ? `Modèle · ${client.lockCount} locks` : 'Modèle à renseigner (Clientes · colonne Locks)'}
                </div>
              </div>
            </div>
            {pricing.band && (
              <div className="trc-sub" style={{ marginTop: 10, lineHeight: 1.5 }}>
                Tranche {bandLabel(pricing.band, bands)} · prix ×{pricing.band.coef} · durée ×{pricing.band.durCoef}
                {pricing.clientCoef !== 1 ? ` · coefficient personnel ×${pricing.clientCoef}` : ''}
              </div>
            )}
          </div>

          <div style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderRadius: 4, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <div className="trc-microlabel" style={{ margin: 0 }}>Ce qu’on lui retire en plus</div>
              <span className="mnd-muted" style={{ fontSize: 10.5 }}>{retiresPourElle || 'aucun'}</span>
            </div>
            {COURONNE_MODULES.map((m) => {
              /* CE QUE LA MAISON A FERMÉ NE SE ROUVRE PAS ICI. L'interrupteur
                 se tait plutôt que de laisser croire le contraire. */
              const parLaMaison = fermeMaison(m.k);
              return (
                <div key={m.k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, opacity: parLaMaison ? 0.5 : 1 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: isOff(m.k) ? 'var(--ink-soft)' : 'var(--ink)' }}>{m.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2 }}>
                      {parLaMaison ? 'Fermé pour toutes, voir ci-dessus' : m.sub}
                    </div>
                  </div>
                  <button
                    className={`trc-switch ${!isOff(m.k) ? 'is-on' : ''}`}
                    onClick={() => !parLaMaison && toggleModule(m.k)}
                    disabled={parLaMaison}
                    aria-label={`Module ${m.label}`}
                    title={parLaMaison
                      ? 'Fermé pour toute la Maison, se rouvre en haut de page'
                      : isOff(m.k) ? 'Coupé pour elle, cliquer pour l’ouvrir' : 'Ouvert, cliquer pour le couper'}
                    style={{ flex: 'none', cursor: parLaMaison ? 'not-allowed' : 'pointer' }}
                  />
                </div>
              );
            })}
            <div className="mnd-muted" style={{ fontSize: 10.5, lineHeight: 1.5 }}>
              Coupé = l'onglet disparaît de SON application (et les gestes associés se ferment avec un mot honnête).
              L'Accueil et le Profil restent toujours ouverts. Réglage synchronisé, effet immédiat sur son téléphone.
            </div>
          </div>

          <a
            className="mnd-btn mnd-btn--ghost"
            style={{ textAlign: 'center', textDecoration: 'none' }}
            /* Chemin relatif à l'origine (même compte GitHub que Le Trône) : marche
               sur yemanb.github.io comme sur maisonmnd.github.io, sans domaine figé. */
            href="/couronne/"
            target="_blank"
            rel="noreferrer"
          >
            Ouvrir Ma Couronne →
          </a>
        </div>

      {/* ----- Colonne droite : le téléphone ----- */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          {([['accueil', 'Accueil'], ['reserver', 'Réserver'], ['suivi', 'Suivi'], ['cercle', 'Cercle'], ['profil', 'Profil']] as const).map(([k, l]) => (
            <button key={k} className="trc-chip" style={screen === k ? { background: 'var(--color-indigo)', color: 'var(--color-ivoire)', borderColor: 'var(--color-indigo)' } : undefined} onClick={() => setScreen(k)}>
              {l}{((k === 'reserver' && isOff('reserver')) || (k === 'suivi' && isOff('suivi')) || (k === 'cercle' && isOff('cercle'))) ? ' · coupé' : ''}
            </button>
          ))}
        </div>

        <div style={{ width: 384, maxWidth: '100%', background: 'var(--color-ivoire)', border: '10px solid var(--color-indigo)', borderRadius: 26, overflow: 'hidden', boxShadow: 'var(--shadow-lg)' }}>
          <div style={{ background: 'var(--color-indigo)', color: 'var(--color-ivoire)', textAlign: 'center', fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', padding: '7px 0 9px' }}>
            Ma Couronne · {first}
          </div>
          <div style={{ minHeight: 470, maxHeight: 560, overflowY: 'auto' }}>
            {/* ======= ACCUEIL ======= */}
            {screen === 'accueil' && (
              <div style={{ padding: 14 }}>
                <div style={{ background: 'var(--grad-indigo, var(--color-indigo))', borderRadius: 6, padding: '20px 16px', color: 'var(--color-ivoire)' }}>
                  <div style={{ fontSize: 9, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--copper-200)' }}>Votre couronne</div>
                  <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 28, marginTop: 4 }}>Bonjour, {first}.</div>
                </div>
                <div style={{ border: '1px solid var(--hairline)', borderLeft: '3px solid var(--color-copper)', borderRadius: 4, background: 'var(--surface-card)', padding: '12px 14px', marginTop: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--color-indigo)' }}>
                      {(() => { const cal = calibreDe(client.lockCount, bands); return cal ? `Couronne ${cal} · ${client.lockCount} locks` : 'Votre couronne'; })()}
                    </span>
                    {attained.length > 0 && <span style={{ fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--copper-700)', border: '1px solid var(--copper-300)', borderRadius: 999, padding: '2px 9px' }}>Palier {attained.length}</span>}
                  </div>
                  {ladder.length > 0 && (
                    <div className="mnd-muted" style={{ fontSize: 10.5, marginTop: 6 }}>
                      {nextTier ? `Prochain palier à ${nextTier.pts.toLocaleString('fr-FR')} points, elle en a ${points}.` : 'Tous les paliers sont honorés.'}
                    </div>
                  )}
                </div>
                <div style={{ background: 'var(--color-indigo)', borderRadius: 6, padding: '14px 16px', color: 'var(--color-ivoire)', marginTop: 12 }}>
                  <div style={{ fontSize: 9, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--copper-200)' }}>Prochain rituel</div>
                  {nextAppt ? (
                    <>
                      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 19, marginTop: 5 }}>{frLong(nextAppt.date)} · {nextAppt.time}</div>
                      <div style={{ fontSize: 11, color: 'var(--indigo-100)', marginTop: 3 }}>{apptLabel(nextAppt, byId)} · {nextAppt.master}</div>
                    </>
                  ) : (
                    <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 17, marginTop: 5 }}>Aucun rituel à venir</div>
                  )}
                </div>
                {!isOff('reserver') && (
                  <div style={{ background: 'var(--color-copper)', color: 'var(--color-ivoire)', textAlign: 'center', borderRadius: 3, padding: '12px 10px', fontSize: 11.5, letterSpacing: '.14em', textTransform: 'uppercase', marginTop: 12 }}>Réserver un rituel</div>
                )}
                {!isOff('compose') && (
                  <div style={{ border: '1px solid var(--color-indigo)', color: 'var(--color-indigo)', textAlign: 'center', borderRadius: 3, padding: '11px 10px', fontSize: 11.5, letterSpacing: '.14em', textTransform: 'uppercase', marginTop: 8 }}>✦ Composez votre rituel sur-mesure</div>
                )}
                {isOff('reserver') && (
                  <div className="mnd-muted" style={{ fontSize: 11, textAlign: 'center', marginTop: 10, fontStyle: 'italic' }}>Réservation coupée, le bouton n'existe pas chez elle.</div>
                )}
                {reco && (
                  <div style={{ border: '1px solid var(--hairline)', borderRadius: 4, background: 'var(--surface-card)', padding: '11px 13px', marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--copper-700)' }}>Du Carnet de Suivi</div>
                      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 15, color: 'var(--color-indigo)', marginTop: 3 }}>{reco.name}</div>
                    </div>
                    <span style={{ fontFamily: 'var(--font-serif)', fontSize: 14, color: 'var(--copper-700)', flex: 'none' }}>{fmtMoney(reco.priceXof, currency)}</span>
                  </div>
                )}
              </div>
            )}

            {/* ======= RÉSERVER · SES prix ======= */}
            {screen === 'reserver' && (
              <div style={{ padding: 14 }}>
                {isOff('reserver') && (
                  <div style={{ margin: '0 0 12px', padding: '12px 14px', border: '1px dashed var(--copper-300)', borderRadius: 4, color: 'var(--copper-700)', fontSize: 12, lineHeight: 1.5 }}>
                    Module Réserver coupé, elle ne peut PAS ouvrir ce tunnel. Aperçu de ses tarifs quand même :
                  </div>
                )}
                <div style={{ fontSize: 10.5, color: 'var(--copper-700)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 10 }}>
                  {pricing.band
                    ? `Ses prix, modèle ${client.lockCount} locks · ${bandLabel(pricing.band, bands)}`
                    : 'Modèle non renseigné, elle voit les prix catalogue'}
                </div>
                {sonApercu.cats.filter((c) => visServices.some((s) => s.categoryId === c.id)).map((cat) => (
                  <div key={cat.id} style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', marginBottom: 6 }}>{cat.fon} · {cat.label}</div>
                    {visServices.filter((s) => s.categoryId === cat.id).map((s) => (
                      <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--hairline)' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, color: 'var(--color-indigo)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                          <div className="mnd-muted" style={{ fontSize: 10 }}>
                            {fmtDur(personalDurationMin(s, pricing))}
                            {scalesWithModel(s) && pricing.band ? ' · suit son modèle' : ''}
                          </div>
                        </div>
                        <span style={{ fontFamily: 'var(--font-serif)', fontSize: 13.5, color: 'var(--copper-700)', flex: 'none', whiteSpace: 'nowrap' }}>{priceLabel(s)}</span>
                      </div>
                    ))}
                  </div>
                ))}
                {visServices.length === 0 && <div className="mnd-muted" style={{ fontSize: 12, fontStyle: 'italic' }}>Aucune prestation visible, vérifiez la Régie et le Catalogue.</div>}
              </div>
            )}

            {/* ======= SUIVI ======= */}
            {screen === 'suivi' && (screenOff('suivi') ?? (
              <div style={{ padding: 14 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[[client.lockCount ?? '—', 'Locks'], [honoredCount, 'Rituels honorés'], [lastVisit ? frShort(lastVisit.date) : '—', 'Dernière visite']].map(([v, l]) => (
                    <div key={String(l)} style={{ flex: 1, border: '1px solid var(--hairline)', borderRadius: 4, background: 'var(--surface-card)', padding: '10px 8px', textAlign: 'center' }}>
                      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--color-indigo)' }}>{v}</div>
                      <div className="mnd-muted" style={{ fontSize: 9, letterSpacing: '.08em', textTransform: 'uppercase', marginTop: 3 }}>{l}</div>
                    </div>
                  ))}
                </div>
                {reco ? (
                  <div style={{ border: '1px solid var(--copper-300)', borderLeft: '3px solid var(--color-copper)', borderRadius: 4, background: 'var(--copper-50)', padding: '12px 14px', marginTop: 12 }}>
                    <div style={{ fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--copper-700)' }}>La maison vous recommande</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginTop: 5 }}>
                      <span style={{ fontFamily: 'var(--font-serif)', fontSize: 15, color: 'var(--color-indigo)' }}>{reco.name}</span>
                      <span style={{ fontFamily: 'var(--font-serif)', fontSize: 13.5, color: 'var(--copper-700)' }}>{fmtMoney(reco.priceXof, currency)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 12, fontStyle: 'italic' }}>
                    Aucun produit recommandé, choisissez-le sur sa fiche (La couronne · Produit recommandé).
                  </div>
                )}
              </div>
            ))}

            {/* ======= CERCLE ======= */}
            {screen === 'cercle' && (screenOff('cercle') ?? (
              <div style={{ padding: 14 }}>
                <div style={{ background: 'var(--color-indigo)', borderRadius: 6, padding: '16px', color: 'var(--color-ivoire)', textAlign: 'center' }}>
                  <div style={{ fontSize: 9, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--copper-200)' }}>Reconnaissance de la maison</div>
                  <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 34, marginTop: 4 }}>{points.toLocaleString('fr-FR')}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--indigo-100)' }}>points de reconnaissance</div>
                </div>
                {ladder.length === 0 && <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 12, fontStyle: 'italic' }}>Aucun palier défini (Cercle MND).</div>}
                {ladder.map((t, i) => {
                  const svc = services.find((s) => s.id === t.serviceId);
                  const on = points >= t.pts;
                  return (
                    <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, padding: '9px 2px', borderBottom: '1px solid var(--hairline)' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, color: 'var(--color-indigo)' }}>{svc?.name ?? 'Prestation de la maison'}</div>
                        <div className="mnd-muted" style={{ fontSize: 10 }}>palier {i + 1} · {t.pts.toLocaleString('fr-FR')} points</div>
                      </div>
                      <span style={{ fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: on ? 'var(--trf-success, #4c7a4c)' : 'var(--ink-soft)', flex: 'none' }}>{on ? 'Obtenu' : `${points}/${t.pts}`}</span>
                    </div>
                  );
                })}
              </div>
            ))}

            {/* ======= PROFIL =======
                L'Accueil et le Profil restent toujours ouverts : aucun module ne
                les coupe. C'est ici qu'elle déclare ses enfants et retrouve les
                têtes qu'elle porte. */}
            {screen === 'profil' && (
              <div style={{ padding: 14 }}>
                <div style={{ fontSize: 9, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--copper-700)' }}>Son identité</div>
                <div style={{ border: '1px solid var(--hairline)', borderRadius: 4, background: 'var(--surface-card)', padding: '11px 13px', marginTop: 7 }}>
                  <div style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--color-indigo)' }}>{client.name}</div>
                  <div className="mnd-muted" style={{ fontSize: 10.5, marginTop: 3 }}>
                    {client.phone || 'téléphone à renseigner'} · {client.email || 'adresse à renseigner'}
                  </div>
                </div>

                <div style={{ fontSize: 9, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--copper-700)', marginTop: 16 }}>
                  Mes enfants{portees.length ? ` · ${portees.length}` : ''}
                </div>

                {portees.length === 0 && enAttenteDElle.length === 0 && (
                  <div className="mnd-muted" style={{ fontSize: 11, marginTop: 7, lineHeight: 1.5 }}>
                    Vos enfants peuvent avoir leurs propres rendez-vous, à leur nom, avec leur suivi.
                    C’est vous qui réservez et réglez pour eux.
                  </div>
                )}

                {portees.map((e) => {
                  const a = ageDe(e.birthday, today);
                  return (
                    <div key={e.id} style={{ border: '1px solid var(--hairline)', borderLeft: '3px solid var(--color-copper)', borderRadius: 4, background: 'var(--surface-card)', padding: '10px 13px', marginTop: 7, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ fontFamily: 'var(--font-serif)', fontSize: 15, color: 'var(--color-indigo)' }}>{e.name}</span>
                      <span style={{ fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--copper-700)', flex: 'none' }}>
                        {a !== undefined ? `${a} an${a > 1 ? 's' : ''}` : 'âge à préciser'}
                      </span>
                    </div>
                  );
                })}

                {enAttenteDElle.map((d) => (
                  <div key={d.id} style={{ border: '1px solid var(--hairline)', borderLeft: '3px solid var(--color-argile, var(--hairline))', borderRadius: 4, background: 'var(--surface-card)', padding: '10px 13px', marginTop: 7, opacity: .75, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontFamily: 'var(--font-serif)', fontSize: 15, color: 'var(--color-indigo)' }}>{nomPropose(d)}</span>
                    <span style={{ fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-soft)', flex: 'none' }}>En attente</span>
                  </div>
                ))}

                {refuseesDElle.slice(0, 2).map((d) => (
                  <div key={d.id} className="mnd-muted" style={{ fontSize: 11, marginTop: 7, lineHeight: 1.5 }}>
                    {nomPropose(d)}, demande non retenue.{d.motif ? ` « ${d.motif} »` : ''}
                  </div>
                ))}

                <div style={{ border: '1px solid var(--color-indigo)', color: 'var(--color-indigo)', textAlign: 'center', borderRadius: 3, padding: '11px 10px', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', marginTop: 10 }}>
                  + Ajouter un enfant
                </div>
                <div className="mnd-muted" style={{ fontSize: 10, marginTop: 6, lineHeight: 1.5 }}>
                  Elle y écrit son prénom, son nom et sa date de naissance, la fiche naît aussitôt
                  sous son compte famille. Seule une tête déjà connue du carnet repasse par la maison.
                </div>

                {/* CE QUE LE COMPTOIR DOIT SAVOIR, et qu'elle ne verra jamais :
                    sans date de naissance, la tête reste invisible chez elle. */}
                {(() => {
                  const fam = client.familyId ? familles.find((f) => f.id === client.familyId) : undefined;
                  if (!fam || fam.payerClientId !== client.id) return null;
                  const muettes = tetesBranche.filter((c) => c.familyId === fam.id && c.id !== client.id && !c.birthday && !c.archived);
                  if (muettes.length === 0) return null;
                  return (
                    <div style={{ border: '1px dashed var(--copper-300)', borderRadius: 4, color: 'var(--copper-700)', fontSize: 10.5, lineHeight: 1.5, padding: '10px 12px', marginTop: 10 }}>
                      {muettes.map((m) => m.name).join(', ')}, rattachée(s) au compte mais SANS date de naissance :
                      elle ne les voit pas ici. À renseigner sur leur fiche.
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Barre d'onglets du téléphone — les modules coupés n'y figurent pas. */}
          <div style={{ display: 'flex', justifyContent: 'space-around', borderTop: '1px solid var(--hairline)', background: 'var(--surface-card)', padding: '9px 4px 11px' }}>
            {([['accueil', '♛', 'Accueil'], ['suivi', '◷', 'Suivi'], ['gamme', '⬡', 'Gamme'], ['cercle', '✦', 'Cercle'], ['profil', '◈', 'Profil']] as const).map(([k, g, l]) => {
              const off = (k === 'suivi' || k === 'gamme' || k === 'cercle') && isOff(k);
              if (off) return null;
              return (
                <div key={k} style={{ textAlign: 'center', color: k === screen ? 'var(--color-copper)' : 'var(--ink-soft)' }}>
                  <div style={{ fontSize: 13 }}>{g}</div>
                  <div style={{ fontSize: 8.5, letterSpacing: '.08em', textTransform: 'uppercase', marginTop: 1 }}>{l}</div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="mnd-muted" style={{ fontSize: 11, textAlign: 'center', maxWidth: 420, lineHeight: 1.5 }}>
          Aperçu calculé sur les mêmes données que son application : catalogue visible, barème des modèles,
          paliers du Cercle, rendez-vous et recommandation. Ce qu'elle verra, sans se connecter à sa place.
        </div>
        </div>
      </div>
    </>
  );
}

/* ── LES RÉGLAGES DE LA CARTE DU COMPTOIR — 28 août 2026 ──────────────
   « Je veux la possibilité d'afficher ou pas des prestations, ou des
   formules, ou des produits Care & Store » (Yéman).

   ON MASQUE, ON NE SÉLECTIONNE PAS. La liste dit ce qu'on RETIRE, jamais ce
   qu'on garde : une liste blanche cache toute prestation née après elle, et
   la Maison ne s'en aperçoit que le jour où une cliente demande pourquoi la
   nouveauté n'est pas à la carte. C'est exactement ce qui est arrivé à
   `visibleCategories`, resté vestige dans ce fichier même.

   LES MASQUES DE LA CARTE SONT LES SIENS. Le comptoir et Ma Couronne n'ont
   pas le même public : ce qu'on montre à une cliente connue, dans son espace,
   ne va pas forcément sur un écran que tout le salon peut lire par-dessus son
   épaule. */
function ReglagesDeLaCarte() {
  const [cfg, setCfg] = useStore(vitrineConfigStore);
  const r = carteReglages(cfg);
  const [services] = useServices();
  const [produits] = useProducts();
  const [plans] = usePlans();
  const { currency } = useBranch();
  /* LE BARÈME DES ABONNEMENTS, pour que cet écran annonce le même prix que la
     vitrine qu'il règle : une formule qui varie s'y lit en fourchette. */
  const [bandsCarte] = useModelBands();
  const [setsCarte] = useBandSets();
  const calibresAbo = bandsAbonnements(setsCarte, bandsCarte);
  const [ouvert, setOuvert] = useState<'services' | 'formules' | 'produits' | null>(null);
  const [auto] = useStore(autoConfigStore);

  const poser = (p: Partial<CarteConfig>) =>
    setCfg({ ...cfg, carte: { ...(cfg.carte ?? {}), ...p } });

  const bascule = (cle: 'servicesMasques' | 'formulesMasquees' | 'produitsMasques', id: string) => {
    const cur = r[cle];
    poser({ [cle]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] } as Partial<CarteConfig>);
  };

  const lienCarte = `${window.location.origin}${window.location.pathname.startsWith('/trone') ? '/trone/carte.html' : '/carte.html'}`;

  const volet = (cle: 'rituels' | 'formules' | 'produits', titre: string, dit: string) => (
    <button
      type="button"
      className={`tre-chip ${r[cle] ? 'is-on' : ''}`}
      onClick={() => poser({ [cle]: !r[cle] } as Partial<CarteConfig>)}
      title={dit}
    >
      {r[cle] ? '◉' : '○'} {titre}
    </button>
  );

  const liste = (
    cle: 'servicesMasques' | 'formulesMasquees' | 'produitsMasques',
    items: { id: string; name: string; priceXof: number; etiquette?: string }[],
  ) => (
    <div style={{ marginTop: 12, border: '1px solid var(--hairline)', borderRadius: 3, maxHeight: 300, overflowY: 'auto' }}>
      {items.map((x) => {
        const masque = r[cle].includes(x.id);
        return (
          <label
            key={x.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '9px 13px',
              borderTop: '1px solid var(--hairline)', fontSize: 13, cursor: 'pointer',
              opacity: masque ? 0.5 : 1,
            }}
          >
            <input
              type="checkbox"
              checked={!masque}
              onChange={() => bascule(cle, x.id)}
              style={{ accentColor: 'var(--copper-600)' }}
            />
            <span style={{ flex: 1, minWidth: 0, textDecoration: masque ? 'line-through' : undefined }}>{x.name}</span>
            <span className="mnd-muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{x.etiquette ?? fmtMoney(x.priceXof, currency)}</span>
          </label>
        );
      })}
    </div>
  );

  return (
    <div className="tr-card" style={{ padding: '18px 22px', marginBottom: 18 }}>
      <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 21, color: 'var(--color-indigo)' }}>
        La carte du comptoir.
      </div>
      <div className="mnd-muted" style={{ fontSize: 12.5, marginTop: 5, lineHeight: 1.6, maxWidth: '66ch' }}>
        L’écran posé face à la cliente, qu’elle fait défiler seule. Il lit vos prix en direct :
        rien à réimprimer quand vous augmentez. Ouvrez-le sur la tablette du comptoir, en plein écran.
      </div>

      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 14 }}>
        {volet('rituels', 'Les rituels', 'Le catalogue des prestations, par atelier')}
        {volet('formules', 'Les formules', 'Les abonnements, par moment du parcours')}
        {volet('produits', 'Care & Store', 'La gamme de la Maison')}
      </div>

      {/* LE DÉFILEMENT : douze formules entassées se lisent en petits
          caractères, donc ne se lisent pas. Elles passent une à une. */}
      {r.formules && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 14 }}>
          <button
            type="button"
            className={`tre-chip ${r.defileFormules ? 'is-on' : ''}`}
            onClick={() => poser({ defileFormules: !r.defileFormules })}
          >
            {r.defileFormules ? '◉' : '○'} Les formules défilent
          </button>
          {r.defileFormules && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5 }}>
              <Input
                type="number"
                min={3}
                max={60}
                value={String(r.secondesParFormule)}
                onChange={(e) => poser({ secondesParFormule: Math.max(3, Math.min(60, Number(e.target.value) || 9)) })}
                style={{ width: 74, textAlign: 'right' }}
                aria-label="Secondes par formule"
              />
              <span className="mnd-muted">secondes par formule</span>
            </label>
          )}
        </div>
      )}

      {/* ── LE VOLET DU WI-FI ─────────────────────────────────────────
          « Après Réserver il faut ajouter l'onglet pour le Code Wifi »
          (Yéman). La carte est une entrée SANS COMPTE : pour qu'elle lise le
          réseau, il faut le poser dans un document lisible sans être
          personne. Ça se dit, ça ne se cache pas — d'où l'avertissement, et
          le défaut ÉTEINT. */}
      <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--hairline)' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`tre-chip ${r.wifi ? 'is-on' : ''}`}
            onClick={() => poser({ wifi: !r.wifi })}
          >
            {r.wifi ? '◉' : '○'} Le wifi, après Réserver
          </button>
          {r.wifi && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                poser({
                  wifiSsid: auto.wifiSsid ?? '', wifiPass: auto.wifiPass ?? '',
                  wifi2Ssid: auto.wifi2Ssid ?? '', wifi2Pass: auto.wifi2Pass ?? '',
                });
                toast('Réseau repris depuis les QR Codes.');
              }}
            >
              Reprendre le réseau des QR Codes
            </Button>
          )}
        </div>

        {r.wifi && (
          <>
            <div className="tr-grid tr-grid--2" style={{ gap: 10, marginTop: 12 }}>
              {([['wifiSsid', 'Nom du réseau · 5G'], ['wifiPass', 'Mot de passe · 5G'],
                ['wifi2Ssid', 'Nom du réseau · 2G'], ['wifi2Pass', 'Mot de passe · 2G']] as const).map(([k, l]) => (
                <label key={k} className="mnd-field">
                  <span className="mnd-field__label">{l}</span>
                  <Input
                    value={r[k]}
                    onChange={(e) => poser({ [k]: e.target.value } as Partial<CarteConfig>)}
                    placeholder="—"
                    autoComplete="off"
                  />
                </label>
              ))}
            </div>
            <div style={{
              marginTop: 11, padding: '10px 13px', borderRadius: 3, fontSize: 11.5, lineHeight: 1.65,
              background: 'var(--copper-50)', border: '1px solid var(--copper-300)',
            }}>
              <b style={{ fontWeight: 600 }}>Le mot de passe ne s’affiche pas sur la carte</b> : seul
              le carré le porte, et la cliente se connecte sans rien taper. Mais il doit tout de même
              vivre dans le document public de la Vitrine, parce que la carte n’est personne et que le
              carré l’encode. <b style={{ fontWeight: 600 }}>Le cacher à l’écran n’est donc pas une
              protection</b>, c’est une propreté. La seule vraie protection reste un réseau invité,
              séparé de celui de la caisse.
            </div>
          </>
        )}
      </div>

      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 16 }}>
        <Button size="sm" variant="ghost" onClick={() => setOuvert(ouvert === 'services' ? null : 'services')}>
          {ouvert === 'services' ? '▾' : '▸'} Choisir les prestations · {services.length}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOuvert(ouvert === 'formules' ? null : 'formules')}>
          {ouvert === 'formules' ? '▾' : '▸'} Choisir les formules · {plans.length}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOuvert(ouvert === 'produits' ? null : 'produits')}>
          {ouvert === 'produits' ? '▾' : '▸'} Choisir les produits · {produits.length}
        </Button>
        <Button size="sm" variant="copper" onClick={() => window.open(lienCarte, '_blank', 'noopener')}>
          Ouvrir la carte
        </Button>
      </div>

      {ouvert === 'services' && liste('servicesMasques', services)}
      {/* CE QU'ON MONTRE OU CACHE PORTE LE PRIX QUE LA CLIENTE VERRA. Une
          formule qui varie annonce donc sa fourchette ici aussi, sinon l'écran
          qui décide de la vitrine ne dit pas la même chose que la vitrine. */}
      {ouvert === 'formules' && liste('formulesMasquees', plans.map((p) => ({
        id: p.id, name: p.name, priceXof: p.priceXof,
        etiquette: libelleFourchette(p, 'mensuel', calibresAbo, (x) => fmtMoney(x, currency)) ?? undefined,
      })))}
      {ouvert === 'produits' && liste('produitsMasques', produits)}

      <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 12, lineHeight: 1.6 }}>
        Décochez ce que vous ne voulez pas montrer. La liste dit ce qu’on RETIRE, jamais ce qu’on garde :
        une nouveauté paraît donc d’elle-même, au lieu de rester invisible jusqu’à ce qu’on y pense.
        Seules les formules rangées dans un moment du parcours s’affichent.
      </div>
    </div>
  );
}
