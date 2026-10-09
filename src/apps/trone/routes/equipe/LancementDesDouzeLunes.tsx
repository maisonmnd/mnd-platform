import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, Modal, demande, toast } from '../../../../ds/components';
import { clientsStore, useClients } from '../../../../shared/clients';
import { useAppointments } from '../../../../shared/agenda';
import { useDemandes } from '../../../../shared/demandes';
import { useStaff } from '../../../../shared/auth';
import { documentDescendu, tablePrete } from '../../../../shared/sync';
import { douzeLunesStore, useDouzeLunes } from '../../../../shared/douze-lunes';
import { useParrainage, type DemandeParrainee } from '../../../../shared/parrainage';
import { PLAFOND_SANS_MAIN, perteDuRetour, retourPossible, type Graine, type PlanDuLancement } from '../../../../shared/douze-lunes-pur';
import type { SoinOffert } from '../../../../shared/parrainage-pur';
import { downloadBackup } from '../../backup';
import { useEstDirection } from '../_vie';
import {
  annuleLeLancement, appliqueLeLancement, empreinteDuPlan, fichesEnRetard, jourDeLaMaison, mercisDesGraines, mercisDuLancement,
  perteDite, planDeLaMaison, planDesMagasins, poseLesGraines, rdvsDesLunes, rendsLesFiches, resteAFaire, resteDuRetour,
  type MercisQuiSuivent,
} from './lancement';
import './ambassadrices.css';

/* ══ LANCER DE MAIN EN MAIN, À L'ÉCRAN — 9 octobre 2026 (étape É5) ══════
   Sur le modèle d'« Ouvrir octobre » (finances/BasculeDOctobre.tsx), trois
   temps : la sauvegarde, obligatoire ; l'aperçu, NOM PAR NOM, en groupes
   repliés qui portent chacun leur résumé chiffré (un seul ouvert à la
   fois) ; le geste, après la question de la Maison. La règle de la
   direction : rien ne s'écrit sur une fiche qu'elle n'a pas vue nommée.

   Après le geste, l'écran relit au bout de 9 s ce qui reste à faire (la
   garde de masse de la synchronisation peut abandonner une poussée en
   silence) et propose la reprise, sans rien doubler. Fait, il propose le
   retour en arrière, à la direction seule. Le titre du programme est « De
   main en main » ; les noms techniques gardent « douze lunes ». */

type Etat =
  | '' | 'en-cours' | 'complet' | 'incomplet'
  | 'retour-serveur' | 'retour-bloque' | 'retour-en-cours' | 'retour-fait' | 'retour-incomplet';

/** « 1 fiche », « 3 fiches » (zéro reste au singulier, en français). */
const pl = (n: number, un: string, plusieurs: string): string => `${n} ${n > 1 ? plusieurs : un}`;

/** Toujours l'année sur une date (mémoire « années sur les dates »). */
export const dateLongue = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
};
const instantDit = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

/** CE QUE LE GESTE LIBÈRE, DIT SANS PROMETTRE LE SILENCE (9 octobre 2026) :
    « Aucun message ne part » seulement quand le compte du moteur le dit. */
const ceQuiSuit = (m: MercisQuiSuivent, sujet: string): string => {
  if (m.mercis === 0) return 'Aucun message ne part.';
  const poses = `${pl(m.mercis, 'merci se pose', 'mercis se posent')} ensuite pour des amies déjà venues`;
  return m.messages === 0
    ? `${sujet} n’envoie rien ; ${poses}, sans message.`
    : `${sujet} n’envoie rien ; ${poses}, dont ${pl(m.messages, 'remerciement part', 'remerciements partent')} sur WhatsApp.`;
};
const ceQuiSuitCourt = (m: MercisQuiSuivent): string => (m.mercis === 0 ? 'aucun message'
  : `${pl(m.mercis, 'merci', 'mercis')} ensuite, ${m.messages ? pl(m.messages, 'message', 'messages') : 'sans message'}`);

/** Où en est une récompense rangée, en clair. */
const etatDuSoin = (s: SoinOffert, aujourdhui: string): string => {
  if (s.utiliseLe) return `utilisée le ${dateLongue(s.utiliseLe)}${s.piece ? ` (${s.piece})` : ''}`;
  if (s.expireLe && s.expireLe < aujourdhui) return `expirée le ${dateLongue(s.expireLe)}`;
  return 'en attente';
};

/** UN GROUPE DE L'APERÇU : la ligne repliée dit son résumé chiffré, le
    détail nomme chaque fiche. Les styles sont ceux des réglages. */
export function Groupe({ id, nom, resume, ouvert, bascule, children }: {
  id: string; nom: string; resume: string; ouvert: boolean; bascule: (id: string) => void; children: ReactNode;
}) {
  return (
    <div className={`amb-reglage${ouvert ? ' is-ouvert' : ''}`}>
      <button type="button" className="amb-reglage__ligne" aria-expanded={ouvert} aria-controls={`lunes-${id}`} onClick={() => bascule(id)}>
        <span className="amb-reglage__nom">{nom}</span>
        <span className="amb-reglage__resume">{resume}</span>
        <span className="amb-reglage__chevron" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5.5 7 9.5 11 5.5" /></svg></span>
      </button>
      {ouvert && <div className="amb-reglage__corps" id={`lunes-${id}`}>{children}</div>}
    </div>
  );
}

function Ligne({ gauche, droite }: { gauche: ReactNode; droite?: ReactNode }) {
  return <div className="amb-liste__ligne"><span>{gauche}</span>{droite !== undefined && <small>{droite}</small>}</div>;
}

/* ══ L'ACCORD DES GRAINES ═══════════════════════════════════════════════
   Au-delà de PLAFOND_SANS_MAIN Graines d'un même passage, le moteur
   n'écrit rien seul (la borne anti-rafale) ; quand la direction baisse N,
   des clientes deviennent Graine d'un coup. Dans les deux cas, la liste
   nominative, puis la main de la direction, en un seul geste. */
export function AccordDesGraines({ graines, seuil, nouveauSeuil, direction, onRenonce }: {
  graines: readonly { clientId: string; graine: Graine }[];
  /** Le N en vigueur. */
  seuil: number;
  /** Le N proposé, s'il change avec le geste. */
  nouveauSeuil?: number;
  direction: boolean;
  onRenonce?: () => void;
}) {
  const [clients] = useClients();
  const [rdvs] = useAppointments();
  const [demandes] = useDemandes();
  const [reglage] = useParrainage();
  const [lunes] = useDouzeLunes();
  const [ouvert, setOuvert] = useState(false);
  const noms = useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients]);
  /* Les mercis que ces Graines libèrent, comptés par le moteur lui-même. */
  const suite = useMemo(
    () => mercisDesGraines(clients, graines, rdvs, demandes as DemandeParrainee[], reglage, lunes),
    [clients, graines, rdvs, demandes, reglage, lunes],
  );
  const k = graines.length;
  const n = nouveauSeuil ?? seuil;
  const poser = async () => {
    if (!await demande({
      quoi: 'De main en main',
      titre: nouveauSeuil !== undefined ? `Passer à ${pl(n, 'visite', 'visites')} et poser ${pl(k, 'Graine', 'Graines')} ?` : `Poser ${pl(k, 'Graine', 'Graines')} ?`,
      dit: k > 1
        ? `Ces ${k} clientes reçoivent leur code et leur carte dans Ma Couronne. La liste est celle que vous avez sous les yeux.`
        : 'Cette cliente reçoit son code et sa carte dans Ma Couronne.',
      suite: `${ceQuiSuit(suite, 'Le geste')} Une Graine posée ne se reprend pas en changeant le nombre de visites.`,
      accepter: `Poser ${pl(k, 'Graine', 'Graines')}`,
      refuser: 'Pas maintenant',
    })) return;
    const posees = poseLesGraines(graines, nouveauSeuil);
    toast(nouveauSeuil !== undefined
      ? `${pl(n, 'visite', 'visites')} désormais. ${pl(posees, 'Graine posée', 'Graines posées')}.`
      : `${pl(posees, 'Graine posée', 'Graines posées')}.`);
    onRenonce?.();
  };
  return (
    <div style={{ display: 'grid', gap: 10, flexBasis: '100%', minWidth: 0 }}>
      <div className="amb-reglages">
        <Groupe id="accord" nom={pl(k, 'cliente devient Graine', 'clientes deviennent Graine')}
          resume={`${pl(n, 'visite', 'visites')} depuis janvier 2026 · un code neuf chacune · ${ceQuiSuitCourt(suite)}`}
          ouvert={ouvert} bascule={() => setOuvert((o) => !o)}>
          <div className="amb-liste">
            {graines.map((g) => (
              <Ligne key={g.clientId} gauche={noms.get(g.clientId) ?? g.clientId}
                droite={`${g.graine.seuil}ᵉ visite le ${dateLongue(g.graine.atteinteLe)} · ${g.graine.code}`} />
            ))}
          </div>
        </Groupe>
      </div>
      {direction ? (
        <div className="amb-actions">
          <Button size="sm" variant="copper" onClick={() => void poser()}>Poser {pl(k, 'Graine', 'Graines')}</Button>
          {onRenonce && <Button size="sm" variant="ghost" onClick={onRenonce}>Garder {pl(seuil, 'visite', 'visites')}</Button>}
        </div>
      ) : (
        <p className="amb-muet">La direction les pose d’un geste, sur cette liste.</p>
      )}
    </div>
  );
}

/* ══ LA FENÊTRE DU LANCEMENT ════════════════════════════════════════════ */
export function LancementDesDouzeLunes({ onClose }: { onClose: () => void }) {
  const [clients] = useClients();
  const [rdvs] = useAppointments();
  const [demandes] = useDemandes();
  const [lunes] = useDouzeLunes();
  const [reglage] = useParrainage();
  const moi = useStaff();
  const direction = useEstDirection();
  const [sauvee, setSauvee] = useState(false);
  const [etat, setEtat] = useState<Etat>('');
  const [ouvert, setOuvert] = useState<string | null>(null);
  /** Ce que le geste a écrit : la vérification relit CE plan-là. */
  const applique = useRef<{ verifie: () => number } | null>(null);
  const aujourdhui = jourDeLaMaison();
  const lus = useMemo(() => rdvsDesLunes(rdvs), [rdvs]);
  const plan = useMemo(
    () => planDeLaMaison(clients, lus, demandes as DemandeParrainee[], lunes, aujourdhui),
    [clients, lus, demandes, lunes, aujourdhui],
  );
  const retard = useMemo(() => fichesEnRetard(clients), [clients]);
  /* Les mercis que le lancement libère (amies venues le jour même), et ce
     qu'un retour perdrait une fois lancé (9 octobre 2026). */
  const suite = useMemo(
    () => mercisDuLancement(clients, plan, rdvs, demandes as DemandeParrainee[], reglage, aujourdhui),
    [clients, plan, rdvs, demandes, reglage, aujourdhui],
  );
  const perte = useMemo(() => perteDuRetour(clients, demandes as DemandeParrainee[]), [clients, demandes]);
  const faite = lunes.lanceLe;
  const t = plan.totaux;
  const bascule = (id: string) => setOuvert((o) => (o === id ? null : id));
  /* RIEN SUR UNE LECTURE À MOITIÉ FAITE : tant que les fiches, le carnet, les
     demandes et les deux réglages ne sont pas descendus du serveur, l'aperçu
     serait celui du cache de ce poste. */
  const pret = tablePrete('clients') && tablePrete('appointments') && tablePrete('demandes')
    && documentDescendu('mnd_douze_lunes') && documentDescendu('mnd_parrainage');

  const groupes = useMemo(() => {
    const cartes = plan.lignes.filter((l) => l.codeRetire);
    const rangees = plan.lignes.filter((l) => l.retirees.length > 0);
    const foyer = plan.lignes.flatMap((l) => l.gardees.filter((g) => g.classe === 'foyer').map((g) => ({ clientId: l.clientId, nom: l.nom, soin: g.soin })));
    const resumes = plan.lignes.filter((l) => l.resumeVide);
    const graines = plan.lignes.filter((l) => l.graine);
    return { cartes, rangees, foyer, resumes, graines };
  }, [plan]);

  const sauver = () => {
    try { downloadBackup(); setSauvee(true); toast('Sauvegarde téléchargée. Gardez le fichier.'); }
    catch { toast('La sauvegarde n’a pas pu se faire. Réessayez avant de lancer.'); }
  };

  /** La synchronisation envoie par tranches ; un garde-fou peut défaire une
      table. On relit après l'envoi : ce qui reste à faire dit la vérité. */
  const verifier = (reste: () => number, ok: Etat, ko: Etat, encours: Etat) => {
    setEtat(encours);
    window.setTimeout(() => setEtat(reste() === 0 ? ok : ko), 9000);
  };
  const resteDuPlan = (p: PlanDuLancement) => () => resteAFaire(p) + (douzeLunesStore.get().lanceLe ? 0 : 1);

  const lancer = async () => {
    const vu = empreinteDuPlan(plan);
    if (!await demande({
      quoi: 'De main en main',
      titre: 'Lancer De main en main maintenant ?',
      dit: `${pl(t.fiches, 'fiche change', 'fiches changent')} : ${pl(t.codes, 'ancienne carte s’éteint', 'anciennes cartes s’éteignent')}, `
        + `${pl(t.retirees, 'récompense de l’ancien programme est rangée', 'récompenses de l’ancien programme sont rangées')}, `
        + `${pl(t.graines, 'Graine est posée', 'Graines sont posées')}.`,
      suite: `Chaque fiche garde dans son archive ce qu’elle portait : le retour en arrière reste possible depuis cet écran, tant que le programme n’a rien donné. ${ceQuiSuit(suite, 'Le geste')}`,
      accepter: 'Lancer De main en main',
      refuser: 'Pas maintenant',
    })) return;
    /* Pendant la question, un autre poste a pu écrire : on n'applique que
       la liste vue. */
    const frais = planDesMagasins();
    if (empreinteDuPlan(frais) !== vu) {
      toast('La liste a changé pendant la question. Relisez l’aperçu, puis lancez à nouveau.');
      return;
    }
    appliqueLeLancement(frais, new Date().toISOString(), moi?.name ?? undefined);
    applique.current = { verifie: resteDuPlan(frais) };
    toast('De main en main est lancé. Vérification de la synchronisation…');
    verifier(applique.current.verifie, 'complet', 'incomplet', 'en-cours');
  };

  /** LA REPRISE : le même plan, appliqué de nouveau. L'archive ne se pose
      qu'une fois, une fiche déjà lancée revient telle quelle. */
  const reprendre = () => {
    const frais = planDesMagasins();
    appliqueLeLancement(frais, new Date().toISOString(), moi?.name ?? undefined);
    applique.current = { verifie: resteDuPlan(frais) };
    verifier(applique.current.verifie, 'complet', 'incomplet', 'en-cours');
  };

  const rangeLeRetard = async () => {
    const liste = retard;
    if (!liste.length) return;
    if (!await demande({
      quoi: 'De main en main',
      titre: `Ranger ${pl(liste.length, 'fiche', 'fiches')} ?`,
      dit: 'Leur ancienne carte, leur résumé et leurs récompenses de l’ancien programme partent dans leur archive, comme au lancement. Le Foyer reste.',
      suite: 'Leur Graine viendra ensuite d’elle-même, par leurs visites.',
      accepter: 'Ranger ces fiches',
      refuser: 'Pas maintenant',
    })) return;
    appliqueLeLancement({ lignes: liste.map((c) => ({ clientId: c.id })) }, new Date().toISOString(), moi?.name ?? undefined);
    verifier(() => fichesEnRetard(clientsStore.get()).length, 'complet', 'incomplet', 'en-cours');
  };

  const revenir = async () => {
    if (!direction) { toast('Seule la direction revient en arrière.'); return; }
    if (!await demande({
      quoi: 'De main en main',
      titre: 'Revenir à avant le lancement ?',
      dit: 'Chaque fiche retrouve son ancienne carte, son résumé et ses récompenses rangées. Les Graines et leurs codes sont retirés.',
      suite: 'Aucun merci n’a encore été posé et aucun code de Graine n’a servi : rien ne se perd. Les anciens codes ne rouvrent rien sur le site, qui ne reconnaît que les codes de Graine.',
      accepter: 'Revenir en arrière',
      refuser: 'Garder De main en main',
      dur: true,
    })) return;
    await retour();
  };
  /** Le retour, ou sa reprise après un serveur muet (déjà demandé). */
  const retour = async () => {
    setEtat('retour-serveur');
    const r = await annuleLeLancement();
    if (!r.ok) { toast(r.pourquoi); setEtat(r.bloque === 'perte' ? '' : 'retour-bloque'); return; }
    verifier(resteDuRetour, 'retour-fait', 'retour-incomplet', 'retour-en-cours');
  };
  const reprendreLeRetour = () => {
    rendsLesFiches();
    verifier(resteDuRetour, 'retour-fait', 'retour-incomplet', 'retour-en-cours');
  };

  const pied = { display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' } as const;
  const titre = (texte: string) => <div style={{ fontFamily: 'var(--font-serif)', fontSize: 19, color: 'var(--color-indigo)', marginBottom: 4 }}>{texte}</div>;

  /* ── Le suivi, après un geste ── */
  const suivi = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 14, lineHeight: 1.6 }}>
      {etat === 'en-cours' && <div>La synchronisation envoie les fiches, par tranches. Un instant…</div>}
      {etat === 'complet' && (
        <div><b>De main en main est lancé.</b> Les fiches ont rangé l’ancien programme et les premières Graines sont posées ; la synchronisation les a gardées. Le geste lui-même n’a envoyé aucun message.</div>
      )}
      {etat === 'incomplet' && (
        <div style={{ color: 'var(--copper-700)' }}>
          Une partie des fiches n’a pas gardé le geste (la synchronisation s’est réalignée sur le serveur).
          Reprenez : seul ce qui manque s’écrit, rien ne se double.
          <div style={{ marginTop: 8 }}><Button size="sm" onClick={reprendre}>Reprendre ce qui manque</Button></div>
        </div>
      )}
      {etat === 'retour-serveur' && <div>Le programme s’arrête ; on attend que le serveur l’ait relu avant de rendre les fiches…</div>}
      {etat === 'retour-bloque' && (
        <div style={{ color: 'var(--copper-700)' }}>
          Le serveur n’a pas confirmé l’arrêt : aucune fiche n’a été rendue. Le programme est arrêté sur ce poste (ni Graine ni merci ne se pose).
          Vérifiez le réseau, puis recommencez.
          <div style={{ marginTop: 8 }}><Button size="sm" onClick={() => void retour()}>Recommencer le retour</Button></div>
        </div>
      )}
      {etat === 'retour-en-cours' && <div>Les fiches retrouvent ce qu’elles portaient. La synchronisation les envoie, un instant…</div>}
      {etat === 'retour-fait' && (
        <div><b>Retour fait.</b> Chaque fiche a retrouvé son ancienne carte, son résumé et ses récompenses ; les Graines sont retirées. De main en main pourra être relancé depuis l’écran des ambassadrices.</div>
      )}
      {etat === 'retour-incomplet' && (
        <div style={{ color: 'var(--copper-700)' }}>
          Une partie des fiches n’a pas été rendue (la synchronisation s’est réalignée sur le serveur). Reprenez : seul ce qui manque s’écrit.
          <div style={{ marginTop: 8 }}><Button size="sm" onClick={reprendreLeRetour}>Reprendre le retour</Button></div>
        </div>
      )}
      <button className="mnd-btn" style={{ alignSelf: 'flex-end' }} onClick={onClose}
        disabled={etat === 'en-cours' || etat === 'retour-serveur' || etat === 'retour-en-cours'}>Fermer</button>
    </div>
  );

  /* ── Déjà lancé ── */
  const lance = (
    <>
      <div className="mnd-muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
        De main en main est lancé depuis le {instantDit(faite)}{lunes.lancePar ? `, par ${lunes.lancePar}` : ''}.
        Les Graines se posent d’elles-mêmes au fil des visites ({pl(plan.seuil, 'visite', 'visites')} depuis janvier 2026) ;
        au-delà de {PLAFOND_SANS_MAIN} d’un coup, l’écran des ambassadrices demande votre accord.
      </div>
      {retard.length > 0 && (
        <div style={{ display: 'grid', gap: 8 }}>
          <div className="amb-note">
            {pl(retard.length, 'fiche porte', 'fiches portent')} encore l’ancien programme sans être passée{retard.length > 1 ? 's' : ''} par le geste
            (une poussée perdue, ou un poste resté sur l’ancienne version). Le Trône ne leur pose pas de Graine tant qu’elles ne sont pas rangées.
          </div>
          <div className="amb-reglages">
            <Groupe id="retard" nom="Les fiches à ranger" resume={`${pl(retard.length, 'fiche', 'fiches')} · ancienne carte, résumé ou récompenses à ranger`}
              ouvert={ouvert === 'retard'} bascule={bascule}>
              <div className="amb-liste">
                {retard.map((c) => <Ligne key={c.id} gauche={c.name} droite={c.codeParrain ?? 'sans code'} />)}
              </div>
            </Groupe>
          </div>
          {direction && <div className="amb-actions"><Button size="sm" onClick={() => void rangeLeRetard()}>Ranger ces fiches</Button></div>}
        </div>
      )}
      {/* LE RETOUR N'EST PERMIS QUE TANT QUE LE PROGRAMME N'A RIEN DONNÉ
          (9 octobre 2026) : un merci posé, un code de Graine déjà utilisé,
          une relance les perdrait. L'écran dit lesquels, nom par nom. */}
      {!retourPossible(perte) && (
        <div style={{ display: 'grid', gap: 8 }}>
          <div className="amb-note">
            Le retour en arrière n’est plus possible depuis cet écran : {perteDite(perte)}. Revenir puis relancer les perdrait
            (le merci repartirait dans l’archive, la cliente recevrait un autre code).
          </div>
          <div className="amb-reglages">
            <Groupe id="perte" nom="Ce que le programme a déjà donné" resume={perteDite(perte)} ouvert={ouvert === 'perte'} bascule={bascule}>
              <div className="amb-liste">
                {perte.mercis.map((m) => <Ligne key={`${m.clientId}-${m.soinId}`} gauche={m.nom} droite={`merci ${m.soinId}`} />)}
                {perte.codes.map((c) => <Ligne key={c.clientId} gauche={`${c.nom} · ${c.code}`} droite={`utilisé par ${c.par.join(', ')}`} />)}
              </div>
            </Groupe>
          </div>
        </div>
      )}
      <div style={{ ...pied, justifyContent: 'space-between' }}>
        {direction && retourPossible(perte)
          ? <button className="mnd-btn mnd-btn--ghost" style={{ color: 'var(--trv-error, #8E3B26)' }} onClick={() => void revenir()}>Revenir à avant</button>
          : <span />}
        <button className="mnd-btn" onClick={onClose}>Fermer</button>
      </div>
    </>
  );

  /* ── L'aperçu, avant le geste ── */
  const { cartes, rangees, foyer, resumes, graines } = groupes;
  const sources = Object.entries(t.parPrefixeEtSource).sort(([a], [b]) => a.localeCompare(b));
  const apercu = (
    <>
      <div className="mnd-muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
        La carte ne se donne plus à toutes : elle se gagne à la Maison, à la {plan.seuil}ᵉ visite honorée depuis le 1er janvier 2026
        (un jour compte une fois ; le nombre se règle dans « La Graine »). Le geste éteint les anciennes cartes, range dans chaque fiche
        ses récompenses de l’ancien programme (le Foyer reste) et pose les premières Graines. Rien ne s’efface : chaque fiche garde ce
        qu’elle portait, et le retour en arrière reste possible ici tant que le programme n’a rien donné. {ceQuiSuit(suite, 'Le geste')}
      </div>
      <div className="amb-note">
        Avant le geste : la migration 0124 collée, la fonction demande-submit recollée, le site publié, tous les postes du Trône rechargés,
        hors des heures d’ouverture.{lunes.annuleLe ? ` Dernier retour en arrière : le ${instantDit(lunes.annuleLe)}.` : ''}
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className={sauvee ? 'mnd-btn mnd-btn--ghost' : 'mnd-btn'} onClick={sauver}>1. Télécharger la sauvegarde</button>
        <span className="mnd-muted" style={{ fontSize: 12 }}>{sauvee ? 'Sauvegarde faite.' : 'Obligatoire avant de lancer.'}</span>
      </div>

      <div>
        {titre('2. Ce que le geste fait, nom par nom')}
        {!pret && <p className="amb-note">Les fiches descendent encore du serveur : l’aperçu attend la lecture complète.</p>}
        {plan.dejaLancees > 0 && (
          <p className="amb-muet" style={{ marginBottom: 6 }}>{pl(plan.dejaLancees, 'fiche est', 'fiches sont')} déjà passée{plan.dejaLancees > 1 ? 's' : ''} par le geste : elle{plan.dejaLancees > 1 ? 's' : ''} ne bouge{plan.dejaLancees > 1 ? 'nt' : ''} pas.</p>
        )}
        <div className="amb-reglages">
          <Groupe id="cartes" nom="Les anciennes cartes qui s’éteignent"
            resume={cartes.length ? `${pl(cartes.length, 'code', 'codes')}${cartes.some((l) => l.archivee) ? ` · dont ${pl(cartes.filter((l) => l.archivee).length, 'fiche archivée', 'fiches archivées')}` : ''} · gardés dans l’archive de chaque fiche` : 'Aucune'}
            ouvert={ouvert === 'cartes'} bascule={bascule}>
            <div className="amb-liste">
              {cartes.map((l) => <Ligne key={l.clientId} gauche={<>{l.nom}{l.archivee && <small> · archivée</small>}</>} droite={l.codeRetire} />)}
            </div>
          </Groupe>

          <Groupe id="rangees" nom="Les récompenses de l’ancien programme, rangées"
            resume={t.retirees ? `${pl(t.retirees, 'récompense', 'récompenses')} sur ${pl(rangees.length, 'fiche', 'fiches')} · ${t.retireesEnAttente} en attente, ${t.retireesUtilisees} utilisée${t.retireesUtilisees > 1 ? 's' : ''}, ${t.retireesExpirees} expirée${t.retireesExpirees > 1 ? 's' : ''}` : 'Aucune'}
            ouvert={ouvert === 'rangees'} bascule={bascule}>
            {sources.length > 0 && (
              <div className="amb-rangs" aria-label="Par début d’identifiant et par source">
                {sources.map(([cle, n]) => <span key={cle} className="amb-rang">{cle}<b>{n}</b></span>)}
              </div>
            )}
            <p className="amb-muet">Mercis, échos, bonus de rang, défis : utilisées et expirées comprises. Chaque fiche les garde dans son archive.</p>
            <div className="amb-liste">
              {rangees.flatMap((l) => l.retirees.map((s) => (
                <Ligne key={`${l.clientId}-${s.id}`} gauche={<>{l.nom} <small>· {s.libelle}{s.raison ? `, ${s.raison}` : ''}</small></>}
                  droite={etatDuSoin(s, aujourdhui)} />
              )))}
            </div>
          </Groupe>

          <Groupe id="gardees" nom="Les récompenses qui restent"
            resume={`${pl(foyer.length, 'sceau du Foyer', 'sceaux du Foyer')} · ${pl(plan.inconnues.length, 'autre', 'autres')}, ni de l’ancien programme ni du Foyer`}
            ouvert={ouvert === 'gardees'} bascule={bascule}>
            {plan.inconnues.length > 0 && (
              <>
                <p className="amb-muet">Ni de l’ancien programme, ni du Foyer : elles restent sur la fiche, telles quelles. À vous de dire s’il faut y toucher.</p>
                <div className="amb-liste">
                  {plan.inconnues.map((x) => (
                    <Ligne key={`${x.clientId}-${x.soin.id}`} gauche={<>{x.nom} <small>· {x.soin.libelle}{x.soin.raison ? `, ${x.soin.raison}` : ''}</small></>} droite={x.soin.id} />
                  ))}
                </div>
              </>
            )}
            {foyer.length > 0 && (
              <>
                <p className="amb-muet">Les sceaux du Foyer, sur les fiches que le geste touche :</p>
                <div className="amb-liste">
                  {foyer.map((x) => <Ligne key={`${x.clientId}-${x.soin.id}`} gauche={x.nom} droite={`${x.soin.libelle} · ${etatDuSoin(x.soin, aujourdhui)}`} />)}
                </div>
              </>
            )}
            {plan.inconnues.length === 0 && foyer.length === 0 && <p className="amb-muet">Aucune sur les fiches touchées.</p>}
          </Groupe>

          <Groupe id="resumes" nom="Les résumés de Ma Couronne, rangés"
            resume={resumes.length ? `${pl(resumes.length, 'fiche', 'fiches')} · anciennes amies, échos et rang, gardés dans l’archive` : 'Aucun'}
            ouvert={ouvert === 'resumes'} bascule={bascule}>
            <div className="amb-liste">
              {resumes.map((l) => <Ligne key={l.clientId} gauche={l.nom} />)}
            </div>
          </Groupe>

          <Groupe id="site" nom="Les marraines du site"
            resume={plan.marrainesDuSite.length ? `${pl(plan.marrainesDuSite.length, 'code s’éteint', 'codes s’éteignent')} · leurs demandes ne bougent pas` : 'Aucune'}
            ouvert={ouvert === 'site'} bascule={bascule}>
            <p className="amb-muet">Des visiteuses qui avaient demandé leur code sur le site. On ne touche pas à leur demande : leur code ne mène simplement plus à rien.</p>
            <div className="amb-liste">
              {plan.marrainesDuSite.map((m) => <Ligne key={m.demandeId || m.code} gauche={m.prenom || 'Une visiteuse'} droite={m.code} />)}
            </div>
          </Groupe>

          <Groupe id="graines" nom="Les premières Graines"
            resume={graines.length ? `${pl(graines.length, 'cliente', 'clientes')} · ${pl(plan.seuil, 'visite', 'visites')} ou plus depuis janvier 2026 · un code neuf chacune` : `Aucune cliente n’a encore ${pl(plan.seuil, 'visite', 'visites')} depuis janvier 2026`}
            ouvert={ouvert === 'graines'} bascule={bascule}>
            <div className="amb-liste">
              {graines.map((l) => (
                <Ligne key={l.clientId} gauche={<>{l.nom} <small>· {pl(l.visites, 'visite', 'visites')}</small></>}
                  droite={`${plan.seuil}ᵉ le ${dateLongue(l.graine!.atteinteLe)} · ${l.graine!.code}`} />
              ))}
            </div>
          </Groupe>
        </div>
      </div>

      <div style={{ fontSize: 13, lineHeight: 1.6, background: 'var(--surface-sunken, rgba(185,122,74,.08))', padding: '10px 12px', borderRadius: 3 }}>
        <b>3. En résumé.</b> {pl(t.fiches, 'fiche change', 'fiches changent')} : {pl(t.codes, 'ancienne carte s’éteint', 'anciennes cartes s’éteignent')},
        {' '}{pl(t.retirees, 'récompense est rangée', 'récompenses sont rangées')}, {pl(t.graines, 'Graine est posée', 'Graines sont posées')}.
        {' '}Une amie invitée avant le lancement qui vient après donne son merci à sa marraine, dès que celle-ci est Graine.
      </div>

      <div style={pied}>
        <button className="mnd-btn mnd-btn--ghost" onClick={onClose}>Annuler</button>
        <button className="mnd-btn" disabled={!sauvee || !pret || !direction} onClick={() => void lancer()}>Lancer De main en main</button>
      </div>
    </>
  );

  return (
    <Modal title={faite && etat === '' ? 'De main en main' : 'Lancer De main en main'} onClose={onClose} width={760}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {etat !== '' ? suivi : faite ? lance : apercu}
      </div>
    </Modal>
  );
}
