import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHead } from '../_ui';
import { Card, Input, Select, toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { useStaff as useMyStaff, useAuth } from '../../../../shared/auth';
import { sameName } from '../../../../shared/text';
import { useStaff, ordonneEquipe, type StaffMember } from './data';
import { useSettings } from '../../../../shared/settings';
import {
  useAttendance, useBaremePoints, pointsDuJour, minutesDe,
  useExceptionsHoraires, horaireEffectif,
  usePointageConfig, distanceM,
  type Attendance,
} from './payroll';
import { uid } from '../../../../shared/store';
import { useTips } from '../../../../shared/tips';
import { useAppointments, appointmentsStore } from '../../../../shared/agenda';
import { useServices } from '../../../../shared/catalog';
import './equipe.css';

/* MON MOIS — l'écran que chacun ouvre pour soi.

   Le suivi du personnel se lisait jusqu'ici depuis le bureau : le gérant
   ouvrait Personnel & paie et découvrait qui avait tenu son mois. Personne
   d'autre ne voyait rien, et ce qu'on ne voit pas ne se corrige pas en cours
   de route.

   Ici, chacun pointe son arrivée et son départ, et voit ses points grandir le
   jour même. Celui qui ne pointe pas ne marque rien : la règle est la même
   pour tous, et elle ne demande à personne d'aller réclamer son dû.

   Le classement est visible de tous — mais la prime se gagne sur un SEUIL, pas
   sur un rang : on n'y perd rien parce qu'un collègue a fait mieux. */

const JOURS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
const iso = (d: Date) => d.toISOString().slice(0, 10);
const moisDe = (d: string) => d.slice(0, 7);
const maintenant = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const fmtHeures = (min: number) => `${Math.floor(min / 60)} h${min % 60 ? ` ${String(min % 60).padStart(2, '0')}` : ''}`;

/* LE RANG SE PARTAGE, PAS LE BILAN. Savoir qui mène motive — c'est tout
   l'intérêt d'un classement. Mais lire les journées, les retards et la prime
   d'un collègue ne regarde que lui et le gérant : ce sont des bilans
   personnels. Chacun voit donc l'ordre complet, et ses chiffres à lui seul. */
function TrClassement({ rang, nom, b, sien, ouvert, seuil, prime }: {
  rang: number;
  nom: string;
  b: { total: number; joursPointes: number; heuresSup: number };
  sien: boolean;
  ouvert: boolean;
  seuil: number;
  prime: string;
}) {
  const masque = <span className="mnd-muted">·</span>;
  return (
    <tr style={sien ? { background: 'var(--color-sable)' } : undefined}>
      <td>{rang}. {nom}</td>
      <td className="num">{ouvert ? b.total : masque}</td>
      <td className="num">{ouvert ? b.joursPointes : masque}</td>
      <td className="num">{ouvert ? b.heuresSup : masque}</td>
      <td style={{ fontSize: 12.5, color: 'var(--copper-700)' }}>
        {!ouvert ? masque : seuil > 0 && b.total >= seuil ? `◆ ${prime}` : '—'}
      </td>
    </tr>
  );
}

export default function MonMois() {
  const { branch, currency } = useBranch();
  const [team] = useStaff();
  const [pointages, setPointages] = useAttendance();
  const [bareme] = useBaremePoints();
  const [reglages] = useSettings();
  const [exceptions] = useExceptionsHoraires();
  const [preuve] = usePointageConfig();
  const [verif, setVerif] = useState<string>('');
  const [demande, setDemande] = useState<{ m: StaffMember; champ: 'arrivee' | 'depart'; motif: string } | null>(null);
  const [saisie, setSaisie] = useState('');

  /* LE CODE APPORTÉ PAR LE QR. Scanné au comptoir avec l'appareil photo du
     téléphone — aucune application à installer —, il ouvre cet écran avec le
     code dans l'adresse. On le retire aussitôt de la barre d'adresse : un lien
     partagé par mégarde ne doit pas emporter le code du jour avec lui. */
  const [params, setParams] = useSearchParams();
  const codeScanne = params.get('code') ?? '';
  useEffect(() => {
    if (!codeScanne) return;
    const p = new URLSearchParams(params);
    p.delete('code');
    setParams(p, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeScanne]);
  const me = useMyStaff();
  const { session } = useAuth();
  const [corrige, setCorrige] = useState<string | null>(null);
  const [tips] = useTips();
  const [appts] = useAppointments();
  const [services] = useServices();
  const svcById = useMemo(() => new Map(services.map((sv) => [sv.id, sv])), [services]);

  const equipe = useMemo(() => ordonneEquipe(team.filter((m) => m.branchId === branch.id)), [team, branch.id]);
  /* QUI SUIS-JE dans l'équipe. Le compte du Trône et la fiche du personnel
     sont deux registres distincts ; il faut les rapprocher.

     L'ADRESSE D'ABORD, le nom ensuite. Le nom d'un compte est proposé d'après
     son e-mail au moment de l'autorisation — « Locksmnd » pour
     locksmnd@gmail.com — quand la fiche, elle, porte « Gerard Tolofon ».
     Deux registres, deux libellés, aucun rattachement : c'est ce qui laissait
     ce membre devant un écran vide alors que tout était bien saisi.

     L'adresse, elle, ne se paraphrase pas. On la lit sur la fiche du
     personnel ; le nom reste le repli pour les fiches qui n'en portent pas. */
  const monMail = (session?.user?.email ?? '').trim().toLowerCase();
  const moi = equipe.find((m) => monMail && (m.email ?? '').trim().toLowerCase() === monMail)
    ?? equipe.find((m) => sameName(m.name, me?.name ?? ''))
    ?? null;
  const gerant = me?.role === 'souverain' || me?.role === 'gerant';

  const M = moisDe(iso(new Date()));
  /* L'HORAIRE D'UNE PERSONNE UN JOUR DONNÉ.

     LES HEURES SONT CELLES DES PARAMÈTRES — « Jours & heures d'ouverture »,
     celles qui commandent déjà les créneaux réservables. Cet écran lisait un
     SECOND document, jamais branché à rien, resté à ses valeurs de départ :
     il annonçait 9 h quand la Maison ouvrait à 8 h. Deux sources d'horaires
     pour une seule maison, c'est une de trop.

     L'exception du jour se pose par-dessus ; une exception nominative
     l'emporte sur celle de la Maison, le plus précis gagne. */
  const jourDeLaSemaine = (d: string) => JOURS[new Date(`${d}T00:00:00`).getDay()];
  const semaine = useMemo(() => {
    const m: Record<string, { open: string; close: string; closed: boolean }> = {};
    for (const d of reglages.hours) m[d.key] = { open: d.open, close: d.close, closed: d.closed };
    return m;
  }, [reglages.hours]);
  const horaireDe = (d: string, staffId?: string) =>
    horaireEffectif(d, staffId, semaine, exceptions, jourDeLaSemaine);
  const horaireDu = (d: string) => horaireDe(d, moi?.id);

  /* Les points d'une personne sur le mois, et le détail jour par jour. */
  const bilanDe = (m: StaffMember) => {
    const jours = pointages
      .filter((a) => a.employeeId === m.id && moisDe(a.date) === M)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    const lignes = jours.map((a) => ({ a, p: pointsDuJour(a, horaireDu(a.date), bareme) }));
    return {
      lignes,
      total: lignes.reduce((n, l) => n + l.p.total, 0),
      joursPointes: lignes.filter((l) => l.p.total > 0).length,
      heuresSup: lignes.reduce((n, l) => n + l.p.heuresSup, 0),
    };
  };

  const classement = useMemo(
    () => equipe.map((m) => ({ m, b: bilanDe(m) })).sort((a, b) => b.b.total - a.b.total),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [equipe, pointages, bareme, semaine, exceptions, M],
  );

  const duJour = (staffId: string, d: string) =>
    pointages.find((a) => a.employeeId === staffId && a.date === d);

  /* POINTER. L'arrivée crée la ligne du jour, le départ la complète. On
     n'écrase jamais une heure déjà posée : corriger est un autre geste, tracé. */
  /* LA POSITION, PUIS LE CODE. On demande d'abord au téléphone où il se
     trouve : c'est la voie sans geste, et la plus difficile à contourner.
     Quand elle échoue — permission refusée, GPS muet en intérieur, trop loin —
     on retombe sur le code affiché au comptoir. Une journée de travail ne peut
     pas dépendre d'un satellite. */
  const positionOk = (): Promise<{ ok: boolean; motif: string }> =>
    new Promise((resolve) => {
      if (preuve.lat === undefined || preuve.lng === undefined) { resolve({ ok: true, motif: '' }); return; }
      if (!navigator.geolocation) { resolve({ ok: false, motif: 'position indisponible sur cet appareil' }); return; }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const d = distanceM(pos.coords.latitude, pos.coords.longitude, preuve.lat!, preuve.lng!);
          resolve(d <= preuve.rayonM
            ? { ok: true, motif: `${d} m du salon` }
            : { ok: false, motif: `${d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${d} m`} du salon` });
        },
        () => resolve({ ok: false, motif: 'position refusée' }),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
      );
    });

  /* L'ÉCRITURE, une fois la présence acquise. Séparée de la vérification :
     le code peut arriver par le QR, par la saisie, ou n'être pas nécessaire
     du tout quand la position suffit — trois chemins, une seule inscription. */
  const inscrire = (m: StaffMember, champ: 'arrivee' | 'depart') => {
    const d = iso(new Date());
    const h = maintenant();
    const existe = duJour(m.id, d);
    if (existe?.[champ]) { toast(`${champ === 'arrivee' ? 'Arrivée' : 'Départ'} déjà inscrit — le gérant peut le corriger.`); return; }
    if (existe) setPointages((prev) => prev.map((a) => (a.id === existe.id ? { ...a, [champ]: h } : a)));
    else {
      const ouverture = minutesDe(horaireDu(d)?.open);
      const arr = minutesDe(h);
      setPointages((prev) => [...prev, {
        id: `at-${uid()}`, employeeId: m.id, date: d, branchId: branch.id,
        /* Le statut suit l'heure : arriver au-dela de la tolerance EST un
           retard, et le dire tout de suite evite de le decouvrir en paie. */
        status: ouverture !== undefined && arr !== undefined && arr > ouverture + bareme.toleranceMin ? 'retard' : 'present',
        [champ]: h,
      } as Attendance]);
    }
    toast(`${champ === 'arrivee' ? 'Arrivée' : 'Départ'} inscrit à ${h}.`);
  };

  /* POINTER — la position d'abord, le code ensuite, l'inscription enfin.
     LA BOÎTE DU NAVIGATEUR A DISPARU : elle sortait du dessin de la Maison et
     plusieurs navigateurs mobiles la refusent purement et simplement. La
     demande se fait maintenant dans la carte, sous les boutons. */
  const pointer = async (m: StaffMember, champ: 'arrivee' | 'depart') => {
    const d = iso(new Date());
    if (preuve.exigerPreuve) {
      const attendu = preuve.codeDate === d ? preuve.codeValeur : undefined;
      /* LE QR A DÉJÀ RÉPONDU : scanné au comptoir, il ouvre cet écran avec le
         code en poche. On ne redemande rien — c'est tout l'intérêt du geste. */
      if (attendu && codeScanne === attendu) { inscrire(m, champ); return; }

      setVerif('Vérification de la position…');
      const { ok, motif } = await positionOk();
      setVerif('');
      if (!ok) {
        if (!attendu) {
          toast(`Pointage impossible — ${motif}, et aucun code du jour n’est affiché au salon.`);
          return;
        }
        setDemande({ m, champ, motif });
        setSaisie('');
        return;
      }
    }
    inscrire(m, champ);
  };

  /* LA SAISIE DU CODE, quand la position n'a rien donné. */
  const validerCode = () => {
    if (!demande) return;
    const attendu = preuve.codeDate === iso(new Date()) ? preuve.codeValeur : undefined;
    if (saisie.trim() !== attendu) { toast('Code incorrect — le pointage n’a pas été inscrit.'); return; }
    inscrire(demande.m, demande.champ);
    setDemande(null);
    setSaisie('');
  };

  const corriger = (a: Attendance, champ: 'arrivee' | 'depart', valeur: string) =>
    setPointages((prev) => prev.map((x) => (x.id === a.id ? {
      ...x, [champ]: valeur,
      corrigePar: me?.name ?? '—', corrigeAt: new Date().toISOString(),
      avant: x.avant ?? { arrivee: x.arrivee, depart: x.depart },
    } : x)));

  /* SUPPRIMER UN POINTAGE — le gerant seul, et jamais sans confirmation.
     Corriger suffit dans la vie courante : la trace garde ce qui etait
     inscrit avant, et un mois de paie doit pouvoir se relire. Mais un essai
     n'est pas une erreur a rectifier, c'est une ligne qui n'aurait jamais du
     exister ; la trainer fausse les points et le classement de tout le monde.
     D'ou ce geste, separe du reste, et volontairement plus lourd. */
  const supprimerPointage = (a: Attendance) => {
    const qui = equipe.find((m) => m.id === a.employeeId)?.name ?? 'ce membre';
    const quand = new Date(`${a.date}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
    if (!window.confirm(
      `Supprimer le pointage de ${qui} du ${quand} ?

`
      + `${a.arrivee ?? '—'} → ${a.depart ?? '—'}

`
      + `Les points de cette journée disparaissent avec lui. C'est definitif.`,
    )) return;
    setPointages((prev) => prev.filter((x) => x.id !== a.id));
    toast('Pointage supprimé.');
  };

  /* MES POURBOIRES DU MOIS. Le partage se voit deja au comptoir au moment de
     l'encaissement ; il ne se revoyait plus ensuite, et une regle qu'on ne
     peut pas relire finit par se discuter de memoire. */
  const mesPourboires = useMemo(
    () => (moi ? tips.filter((t) => t.staffId === moi.id && moisDe(t.date) === M).sort((a, b) => (a.date < b.date ? 1 : -1)) : []),
    [tips, moi, M],
  );
  const totalPourboires = mesPourboires.reduce((n, t) => n + t.amountXof, 0);

  /* LES TÊTES À COMPLÉTER. Une prestation sans mains désignées ne compte pour
     personne — ni dans la production, ni dans les seuils. Elle retombe sur le
     maître assigné, qui n'est pas toujours celui qui a travaillé.

     On les remonte ici pour que celui qui a fait le geste puisse le dire
     lui-même, plutôt que d'attendre qu'on le lui demande. */
  const aCompleter = useMemo(() => appts
    .filter((a) => a.branchId === branch.id && a.status === 'honoré' && moisDe(a.date) === M)
    .filter((a) => a.serviceIds.some((_, i) => !(a.mains?.[i]?.length)))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 30),
    [appts, branch.id, M]);

  const poserMain = (apptId: string, i: number, staffId: string) =>
    appointmentsStore.set((prev) => prev.map((a) => {
      if (a.id !== apptId) return a;
      /* On repart TOUJOURS d'un tableau aligne sur serviceIds : un tableau
         plus court laisserait les lignes suivantes sans mains, et un index
         decale attribuerait le travail au geste voisin. */
      const n = a.serviceIds.map((_, k) => a.mains?.[k] ?? []);
      n[i] = n[i].includes(staffId) ? n[i].filter((x) => x !== staffId) : [...n[i], staffId];
      return { ...a, mains: n };
    }));

  /* UN SEUL RITUEL À LA FOIS. La liste dépliée faisait défiler des dizaines de
     pastilles : on ne savait plus où l'on en était, et le geste — dire qui a
     fait la tête — se perdait dans le défilement. On choisit dans une liste
     déroulante, on renseigne, on passe au suivant. */
  const [rituelChoisi, setRituelChoisi] = useState<string>('');
  const rituel = aCompleter.find((a) => a.id === rituelChoisi) ?? aCompleter[0];

  const monBilan = moi ? bilanDe(moi) : null;
  const monRang = moi ? classement.findIndex((c) => c.m.id === moi.id) + 1 : 0;
  const primeAcquise = !!monBilan && bareme.seuilPrime > 0 && monBilan.total >= bareme.seuilPrime;

  return (
    <>
      <PageHead
        eyebrow="Équipe & Croissance"
        title="Mon mois."
        sub="Ce que j’ai tenu — mon pointage, mes points, ma prime."
      />

      {!moi && (
        <Card style={{ padding: '18px 20px' }}>
          <div className="tre-rates__title">Ce compte n’est rattaché à aucune fiche du personnel</div>
          <div className="mnd-muted" style={{ fontSize: 12.5, marginTop: 8, lineHeight: 1.6, maxWidth: '62ch' }}>
            Le pointage se rattache à une fiche de l’équipe, retrouvée par l’adresse e-mail — ou à
            défaut par le nom. Demande au gérant d’inscrire l’adresse de ton compte sur ta fiche
            dans Personnel &amp; paie, ou d’y écrire exactement le même nom.
          </div>
        </Card>
      )}

      {moi && monBilan && (
        <>
          {/* ── AUJOURD'HUI ─────────────────────────────────────────── */}
          <Card style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
              <span className="tre-rates__title">Aujourd’hui</span>
              <span className="mnd-muted" style={{ fontSize: 12 }}>
                {horaireDu(iso(new Date()))?.closed
                  ? 'Le salon est fermé'
                  : `Salon ${horaireDu(iso(new Date()))?.open ?? '—'} – ${horaireDu(iso(new Date()))?.close ?? '—'} · ${bareme.toleranceMin} min de tolérance`}
              </span>
            </div>
            {(() => {
              const d = iso(new Date());
              const a = duJour(moi.id, d);
              const p = a ? pointsDuJour(a, horaireDu(d), bareme) : null;
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 14 }}>
                  <button className="tre-chip" style={{ opacity: a?.arrivee ? 0.5 : 1 }} onClick={() => pointer(moi, 'arrivee')}>
                    {a?.arrivee ? `Arrivée · ${a.arrivee}` : 'Arrivée'}
                  </button>
                  <button className="tre-chip" style={{ opacity: a?.depart ? 0.5 : 1 }} onClick={() => pointer(moi, 'depart')}>
                    {a?.depart ? `Départ · ${a.depart}` : 'Départ'}
                  </button>
                  {p && p.total > 0 && (
                    <span className="mnd-muted" style={{ fontSize: 12.5 }}>
                      {p.ponctualite > 0 ? '◆ à l’heure' : 'hors tolérance'}
                      {p.heuresSup > 0 ? ` · ${p.heuresSup} h au-delà` : ''}
                      {' · '}<strong style={{ fontWeight: 500, color: 'var(--copper-700)' }}>{p.total} pts</strong>
                    </span>
                  )}
                  {verif && <span className="mnd-muted" style={{ fontSize: 12 }}>{verif}</span>}
                  {!verif && !a?.arrivee && (
                    <span className="mnd-muted" style={{ fontSize: 12 }}>Sans pointage, la journée ne compte pas.</span>
                  )}
                  {!verif && !demande && preuve.exigerPreuve && preuve.lat !== undefined && (
                    <span className="mnd-muted" style={{ fontSize: 11.5 }}>
                      · le pointage vérifie que tu es au salon
                    </span>
                  )}

                  {/* LA DEMANDE DE CODE, dans la carte et non dans une boîte
                      système. On dit POURQUOI on la fait : « refusé » sans
                      raison fait croire à une panne, et l'on cesse de pointer. */}
                  {demande && (
                    <div className="tre-code-ask">
                      <div className="tre-code-ask__motif">
                        {demande.motif} — scanne le carré affiché au comptoir, ou saisis ses quatre chiffres.
                      </div>
                      <div className="tre-code-ask__ligne">
                        <Input
                          value={saisie}
                          onChange={(e) => setSaisie(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
                          onKeyDown={(e) => { if (e.key === 'Enter') validerCode(); }}
                          inputMode="numeric"
                          autoFocus
                          placeholder="0000"
                          aria-label="Code du jour"
                          style={{ width: 128, textAlign: 'center', fontFamily: 'var(--font-serif)', fontSize: 22, letterSpacing: '.28em' }}
                        />
                        <button className="tre-chip is-on" onClick={validerCode} disabled={saisie.length < 4}>
                          Valider
                        </button>
                        <button className="tre-link-btn" onClick={() => { setDemande(null); setSaisie(''); }}>
                          Annuler
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </Card>

          {/* ── MON COMPTE DU MOIS ──────────────────────────────────── */}
          <div className="tr-grid tr-grid--4" style={{ marginTop: 14 }}>
            <Card filet="copper" style={{ padding: 18 }}>
              <div className="mnd-stat__label">Mes points</div>
              <div className="mnd-stat__value" style={{ fontSize: 32 }}>{monBilan.total}</div>
              <div className="mnd-muted" style={{ fontSize: 11, marginTop: 6 }}>
                {bareme.seuilPrime > 0 && (primeAcquise
                  ? `seuil de ${bareme.seuilPrime} franchi`
                  : `encore ${bareme.seuilPrime - monBilan.total} pour la prime`)}
              </div>
            </Card>
            <Card style={{ padding: 18 }}>
              <div className="mnd-stat__label">Jours pointés</div>
              <div className="mnd-stat__value" style={{ fontSize: 32 }}>{monBilan.joursPointes}</div>
            </Card>
            <Card style={{ padding: 18 }}>
              <div className="mnd-stat__label">Heures au-delà</div>
              <div className="mnd-stat__value" style={{ fontSize: 32 }}>{monBilan.heuresSup}</div>
            </Card>
            <Card style={{ padding: 18 }}>
              <div className="mnd-stat__label">Prime du mois</div>
              <div className="mnd-stat__value" style={{ fontSize: 26, color: primeAcquise ? 'var(--copper-700)' : undefined }}>
                {primeAcquise ? fmtMoney(bareme.primeXof, currency) : '—'}
              </div>
              <div className="mnd-muted" style={{ fontSize: 11, marginTop: 6 }}>
                {primeAcquise ? 'acquise, à inscrire par le gérant' : `au-delà de ${bareme.seuilPrime} points`}
              </div>
            </Card>
          </div>

          {/* ── MON JOURNAL ─────────────────────────────────────────── */}
          <Card style={{ marginTop: 14, padding: '16px 18px' }}>
            <div className="tre-rates__head">
              <span className="tre-rates__title">Mon journal</span>
              <span className="mnd-muted" style={{ fontSize: 12 }}>
                {bareme.ptsPointage} pt pour avoir pointé · {bareme.ptsPonctualite} pour l’heure ·
                {' '}{bareme.ptsParHeureSup} par heure au-delà
              </span>
            </div>
            <div className="mnd-scroll-x" style={{ marginTop: 12 }}>
              <table className="tre-table">
                <thead>
                  <tr><th>Jour</th><th>Arrivée</th><th>Départ</th><th>Au-delà</th><th className="num">Points</th></tr>
                </thead>
                <tbody>
                  {monBilan.lignes.length === 0 && (
                    <tr><td colSpan={5} className="mnd-muted">Aucun pointage ce mois-ci.</td></tr>
                  )}
                  {monBilan.lignes.map(({ a, p }) => (
                    <tr key={a.id}>
                      <td>{new Date(`${a.date}T00:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                      <td style={{ color: p.ponctualite > 0 ? 'var(--copper-700)' : undefined }}>
                        {a.arrivee ?? '—'}{p.ponctualite > 0 ? ' ◆' : ''}
                      </td>
                      <td>{a.depart ?? '—'}</td>
                      <td>{p.heuresSup > 0 ? fmtHeures(p.heuresSup * 60) : '—'}</td>
                      <td className="num">{p.total || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {/* ── MES POURBOIRES ────────────────────────────────────────────
          Transparents : chacun relit sa part sans avoir à la demander. */}
      {moi && (
        <Card style={{ marginTop: 14, padding: '16px 18px' }}>
          <div className="tre-rates__head">
            <span className="tre-rates__title">Mes pourboires · {totalPourboires > 0 ? fmtMoney(totalPourboires, currency) : '—'}</span>
            <span className="mnd-muted" style={{ fontSize: 12 }}>
              Le pourboire se partage entre toute l’équipe, qu’on ait touché la tête ou non.
              Ta part : {(moi.partPourboire ?? 1) === 1 ? 'une part' : (moi.partPourboire ?? 1) === 0 ? 'aucune' : `${moi.partPourboire} part`}.
            </span>
          </div>
          {mesPourboires.length === 0 ? (
            <div className="mnd-muted" style={{ fontSize: 12.5, marginTop: 10 }}>Aucun pourboire ce mois-ci.</div>
          ) : (
            <div className="mnd-scroll-x" style={{ marginTop: 12 }}>
              <table className="tre-table">
                <thead><tr><th>Jour</th><th className="num">Ma part</th></tr></thead>
                <tbody>
                  {mesPourboires.map((t) => (
                    <tr key={t.id}>
                      <td>{new Date(`${t.date}T00:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                      <td className="num">{fmtMoney(t.amountXof, currency)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ fontWeight: 500 }}>Total du mois</td>
                    <td className="num">{fmtMoney(totalPourboires, currency)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* ── LES TÊTES À COMPLÉTER ─────────────────────────────────────
          Une prestation sans mains ne compte pour personne. Celui qui a fait
          le geste le dit lui-même, sans attendre qu'on le lui demande. */}
      {moi && aCompleter.length > 0 && (
        <Card style={{ marginTop: 14, padding: '16px 18px' }}>
          <div className="tre-rates__head">
            <span className="tre-rates__title">Têtes à compléter · {aCompleter.length}</span>
            <span className="mnd-muted" style={{ fontSize: 12 }}>
              Ces rituels n’ont pas dit qui les a faits. Sans mains, la prestation ne compte
              ni dans la production ni dans les seuils.
            </span>
          </div>
          {/* LE CHOIX D'ABORD, le geste ensuite. */}
          <div style={{ marginTop: 14 }}>
            <Select
              value={rituel?.id ?? ''}
              onChange={(e) => setRituelChoisi(e.target.value)}
              aria-label="Choisir un rituel à compléter"
              style={{ width: '100%', maxWidth: 460 }}
            >
              {aCompleter.map((a) => {
                const reste = a.serviceIds.filter((_, k) => !(a.mains?.[k]?.length)).length;
                const quand = new Date(`${a.date}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
                return (
                  <option key={a.id} value={a.id}>
                    {a.clientName ?? 'Cliente'} · {quand} · {reste} geste{reste > 1 ? 's' : ''}
                  </option>
                );
              })}
            </Select>
          </div>

          {rituel && (
            <div style={{ border: '1px solid var(--hairline)', borderRadius: 4, padding: '13px 15px', marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 17 }}>{rituel.clientName ?? 'Cliente'}</span>
                <span className="mnd-muted" style={{ fontSize: 12 }}>
                  {new Date(`${rituel.date}T00:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                  {rituel.master ? ` · assigné à ${rituel.master}` : ''}
                </span>
              </div>

              {/* SEULS LES GESTES SANS MAINS RESTENT ICI. Une ligne déjà
                  renseignée disparaît d'elle-même : ce qui reste à l'écran est
                  exactement ce qui reste à faire. */}
              {rituel.serviceIds.map((sid, i) => {
                const sv = svcById.get(sid);
                const posees = rituel.mains?.[i] ?? [];
                /* CE QUI RESTE À L'ÉCRAN EST CE QUI RESTE À FAIRE — plus ce
                   qu'on vient de cocher, pour pouvoir se dédire. Un geste
                   attribué à d'autres seulement ne nous concerne plus. */
                if (!sv || (posees.length > 0 && !posees.includes(moi.id))) return null;
                return (
                  <div key={`${rituel.id}-${i}`} style={{ padding: '8px 0', borderTop: i > 0 ? '1px solid var(--hairline)' : undefined }}>
                    <div style={{ fontSize: 13, marginBottom: 7 }}>{sv.name}</div>
                    {/* CHACUN NE PARLE QUE POUR LUI. La liste entière du
                        personnel invitait à désigner les autres — or personne
                        ne sait à leur place, et cet écran est un bilan
                        personnel. Un seul bouton : le sien. Le gérant garde
                        la vue complète dans Personnel & paie. */}
                    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
                      <button
                        type="button"
                        className={`tre-chip ${posees.includes(moi.id) ? 'is-on' : ''}`}
                        style={{ fontSize: 11.5 }}
                        onClick={() => poserMain(rituel.id, i, moi.id)}
                      >
                        {posees.includes(moi.id) ? '✓ C’est moi' : 'C’est moi'}
                      </button>
                      {posees.length > 0 && (
                        <span className="mnd-muted" style={{ fontSize: 11.5 }}>
                          {posees.length > 1 ? `${posees.length} mains sur ce geste` : ''}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 10, lineHeight: 1.55 }}>
            Un geste fait à deux compte une demi-part de chaque côté. Ne coche que ce que tu as
            réellement fait — le gérant relit ces attributions. Un rituel renseigné quitte la
            liste : il en reste {aCompleter.length}.
          </div>
        </Card>
      )}

      {/* ── LE CLASSEMENT ─────────────────────────────────────────────
          Visible de tous, parce qu'un classement caché ne motive personne.
          Mais la prime se gagne au SEUIL : voir le premier ne prive de rien. */}
      <Card style={{ marginTop: 14, padding: '16px 18px' }}>
        <div className="tre-rates__head">
          <span className="tre-rates__title">Le mois de l’équipe</span>
          <span className="mnd-muted" style={{ fontSize: 12 }}>
            {bareme.seuilPrime > 0
              ? `Chacun qui dépasse ${bareme.seuilPrime} points touche ${fmtMoney(bareme.primeXof, currency)} — le rang ne prive de rien.`
              : 'Aucun seuil de prime réglé.'}
          </span>
        </div>
        <div className="mnd-scroll-x" style={{ marginTop: 12 }}>
          <table className="tre-table">
            <thead>
              <tr><th>Membre</th><th className="num">Points</th><th className="num">Jours</th><th className="num">Heures au-delà</th><th>Prime</th></tr>
            </thead>
            <tbody>
              {/* LE NOM D'UN COLLÈGUE NE S'AFFICHE PAS ICI. On voyait la
                  maison entière alignée avec ses chiffres : un tableau de
                  comparaison, là où il fallait un bilan. Chacun lit sa ligne
                  et son rang — savoir qu'on est deuxième sur cinq suffit à se
                  situer, nommer les autres n'y ajoute rien et les expose.
                  Le gérant, lui, garde la maison entière sous les yeux. */}
              {classement
                .filter(({ m }) => gerant || (!!moi && m.id === moi.id))
                .map(({ m, b }) => (
                  <TrClassement
                    key={m.id}
                    rang={classement.findIndex((c) => c.m.id === m.id) + 1}
                    nom={m.name}
                    b={b}
                    sien={!!moi && m.id === moi.id}
                    ouvert
                    seuil={bareme.seuilPrime}
                    prime={fmtMoney(bareme.primeXof, currency)}
                  />
                ))}
            </tbody>
          </table>
        </div>
        {moi && monRang > 0 && (
          <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 10 }}>
            Tu es {monRang}<sup>{monRang === 1 ? 'er' : 'e'}</sup> sur {classement.length}.
            {!gerant && ' Le rang de chacun lui appartient — la prime se gagne au seuil, pas sur le podium.'}
          </div>
        )}
      </Card>

      {/* ── LA CORRECTION, réservée au gérant ─────────────────────────
          Un oubli ou une heure fantaisiste se rectifie — jamais en silence :
          la trace garde qui a corrigé, quand, et ce qui était inscrit avant. */}
      {gerant && (
        <Card style={{ marginTop: 14, padding: '16px 18px' }}>
          <div className="tre-rates__head">
            <span className="tre-rates__title">Corriger un pointage</span>
            <span className="mnd-muted" style={{ fontSize: 12 }}>
              Réservé au gérant. Chaque correction garde sa trace.
            </span>
          </div>
          <div className="mnd-scroll-x" style={{ marginTop: 12 }}>
            <table className="tre-table">
              <thead>
                <tr><th>Membre</th><th>Jour</th><th>Arrivée</th><th>Départ</th><th>Trace</th><th /></tr>
              </thead>
              <tbody>
                {pointages
                  .filter((a) => moisDe(a.date) === M && equipe.some((m) => m.id === a.employeeId))
                  .sort((a, b) => (a.date < b.date ? 1 : -1))
                  .slice(0, 40)
                  .map((a) => (
                    <tr key={a.id}>
                      <td>{equipe.find((m) => m.id === a.employeeId)?.name ?? '—'}</td>
                      <td>{new Date(`${a.date}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</td>
                      <td>
                        {corrige === a.id
                          ? <Input value={a.arrivee ?? ''} onChange={(e) => corriger(a, 'arrivee', e.target.value)} placeholder="09:00" style={{ width: 92 }} />
                          : a.arrivee ?? '—'}
                      </td>
                      <td>
                        {corrige === a.id
                          ? <Input value={a.depart ?? ''} onChange={(e) => corriger(a, 'depart', e.target.value)} placeholder="19:00" style={{ width: 92 }} />
                          : a.depart ?? '—'}
                      </td>
                      <td style={{ fontSize: 11.5 }}>
                        {a.corrigePar
                          ? <span className="mnd-muted">
                              corrigé par {a.corrigePar}
                              {a.avant?.arrivee || a.avant?.depart
                                ? ` — était ${a.avant?.arrivee ?? '—'} → ${a.avant?.depart ?? '—'}`
                                : ''}
                            </span>
                          : <button className="tre-link-btn" onClick={() => setCorrige(corrige === a.id ? null : a.id)}>
                              {corrige === a.id ? 'Terminé' : 'Corriger'}
                            </button>}
                      </td>
                      {/* LE RETRAIT SE TIENT A L'ECART de la correction : deux
                          gestes de portee differente ne partagent pas un bouton. */}
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="tre-link-btn"
                          onClick={() => supprimerPointage(a)}
                          title="Supprimer ce pointage"
                          style={{ color: 'var(--color-danger, #a4423a)' }}
                        >
                          Supprimer
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 10, lineHeight: 1.55 }}>
            Corriger garde une trace de ce qui était inscrit avant ; supprimer n'en garde aucune.
            Le retrait est fait pour les essais — une ligne qui n'aurait jamais dû exister.
          </div>
        </Card>
      )}
    </>
  );
}
