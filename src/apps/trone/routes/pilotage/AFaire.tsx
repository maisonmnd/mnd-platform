import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHead, WaLien } from '../_ui';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { clientsStore, useClients, type Client } from '../../../../shared/clients';
import { toast } from '../../../../ds/components';
import { useBilans } from '../../../../shared/bilans';
import { useProduitsStock } from '../../../../shared/stock';
import {
  leTravail, tetesDuGeste, motPourDemander, relancesAReprendre, retenuesAVenir, SE_DEMANDE, type CleGeste,
} from '../../../../shared/afaire';
import { signeLeMessage, maisonNom } from '../../../../shared/identite';
import { jourLisible, texteDeLaRelance, texteDuRappel } from '../../../../shared/rappel';
import { appointmentsStore } from '../../../../shared/agenda';

import { addDaysISO, apptDueXof, apptLabel, frJourAn, todayISO, useBranchAppointments, useServicesById } from '../clients/_shared';
import './pilotage.css';
/** LES GESTES QUI SE LISENT TÊTE PAR TÊTE. Les mains, le prix d'achat et les
    impayés ne concernent pas une tête : ils vivent sur un rituel ou une fiche
    de stock, et leur liste est ailleurs. */
const SE_TETE: CleGeste[] = ['meche', 'bilan', 'cadence', 'longueur', 'email', 'locks'];

/** LES GESTES QUE LA DIASPORA NE DOIT PAS — ceux qui se constatent au
    fauteuil. Marquer une tête « vit ailleurs » la retire de ces quatre
    listes-là, et d'elles seulement (voir `AU_FAUTEUIL`, shared/afaire). */
const AU_FAUTEUIL: CleGeste[] = ['meche', 'cadence', 'longueur', 'locks'];

/** LES TROIS RAISONS DE SORTIR UNE TÊTE DU FAUTEUIL. Le juge qui les lit vit
    dans `shared/afaire` (`horsDuFauteuil`) ; ici on ne fait que les poser. */
const MARQUES: { cle: string; mot: string; dit: string; pose: Partial<Client> }[] = [
  /* LE MOT DE LA MAISON, ET LUI SEUL — « Vit ailleurs et Diaspora ont la même
     fonctionnalité ? » (Yéman). Oui : deux mots pour une notion finissent
     toujours par se répondre de travers. */
  { cle: 'ailleurs', mot: 'Diaspora', dit: 'elle vit ailleurs', pose: { diaspora: true } },
  { cle: 'sans-locks', mot: 'Sans locks', dit: 'elle a défait ses locks', pose: { locksDefaits: true } },
  /* LA MAIN L'EMPORTE SUR LA MACHINE DU PASSAGE — sans `passagePose`, la
     marque se lèverait dès sa deuxième venue et le bouton s'annulerait. */
  { cle: 'passage', mot: 'De passage', dit: 'elle est de passage', pose: { dePassage: true, passagePose: true } },
];


/* ══ À FAIRE — 6 septembre 2026 (maquette validée) ═══════════════════

   « J'aimerais que les données soient liées aux finances, à la prévision, à la
   rentabilité. Que je sache ce qu'il est très important de remplir » puis
   « moins de lecture, plus d'actions déclencheur » (Yéman).

   LE TRÔNE SAIT DÉJÀ PRESQUE TOUT FAIRE — ce qui manque, c'est de savoir ce
   qui manque. Un comptage absent ne se voit nulle part : il se voit au moment
   où un prix s'annonce « dès », trois semaines plus tard, devant la cliente.

   PAS UNE PAGE À LIRE, UNE LISTE DE GESTES. Un nombre, ce qu'il ouvre en trois
   mots, un bouton qui mène là où c'est à remplir. Ce qui est tenu passe au
   vert et perd son bouton : un geste qui ne fait plus rien encombre. */

/** OÙ MÈNE CHAQUE GESTE. Un bouton qui n'emmène nulle part est un bouton
    qu'on cesse de cliquer au troisième essai. */
const OU: Record<CleGeste, string> = {
  meche: '/customers',
  bilan: '/customers',
  cadence: '/customers',
  longueur: '/customers',
  email: '/customers',
  mains: '/carnet',
  locks: '/customers',
  achat: '/fournisseurs',
  solde: '/creances',
};

const teinte = (pct: number): string =>
  (pct >= 90 ? 'est-tenu' : pct >= 55 ? 'est-tiede' : 'est-creux');

/** Chiffres seulement — pour wa.me. */
const chiffresDe = (t: string): string => (t ?? '').replace(/\D/g, '');

export default function AFaire() {
  const { branch, currency } = useBranch();
  const [clients] = useClients();
  const appts = useBranchAppointments();
  const [bilans] = useBilans();
  const [stock] = useProduitsStock();
  const byId = useServicesById();
  const navigate = useNavigate();

  const travail = useMemo(() => leTravail({
    branchId: branch.id,
    tetes: clients,
    rituels: appts,
    bilans,
    stock,
    duXof: (a) => apptDueXof(a as never, byId),
  }), [branch.id, clients, appts, bilans, stock, byId]);

  const reste = travail.gestes.reduce((n, g) => n + g.combien, 0);

  /* ══ LA LISTE S'OUVRE SOUS LA LIGNE — 6 septembre 2026 ═════════════
     « S'il y a 38 têtes sans e-mail, je veux la liste de ces têtes-là »
     (Yéman). Un nombre sans ses noms ne se travaille pas : on sait qu'il y a
     du retard, on ne sait pas par qui commencer. */
  const [ouvert, setOuvert] = useState<CleGeste | ''>('');
  /* SA PROCHAINE VENUE — c'est elle qui range la liste : celle qui vient
     demain se traite aujourd'hui. */
  const prochaineDe = useMemo(() => {
    const par = new Map<string, string>();
    const auj = todayISO();
    for (const a of appts) {
      if (a.status === 'annulé' || a.status === 'honoré' || a.date < auj) continue;
      const vu = par.get(a.clientId);
      if (!vu || a.date < vu) par.set(a.clientId, a.date);
    }
    return (id: string) => par.get(id);
  }, [appts]);

  const laListe = useMemo(() => (ouvert === '' ? [] : tetesDuGeste({
    branchId: branch.id, cle: ouvert, tetes: clients, rituels: appts, bilans, prochaineDe,
  })), [ouvert, branch.id, clients, appts, bilans, prochaineDe]);

  /* LE CARNET DES RETENUES DU MOIS, et la fenêtre J-3 qui s'allume dedans. */
  const auj = todayISO();
  const horizonJ3 = addDaysISO(auj, 3);
  const retenues = useMemo(() => retenuesAVenir(appts, auj), [appts, auj]);
  const duMois = useMemo(() => retenues.filter((a) => a.date.slice(0, 7) === auj.slice(0, 7)), [retenues, auj]);
  const aRelancer = useMemo(() => relancesAReprendre(appts, auj, horizonJ3), [appts, auj, horizonJ3]);
  const auDela = retenues.length - duMois.length;
  const prochaineAuDela = retenues.find((a) => a.date.slice(0, 7) !== auj.slice(0, 7));
  const nCadence = duMois.filter((a) => a.repriseDe).length;
  const clientDe = (id: string) => clients.find((c) => c.id === id);

  /* Le dé de jour — lisible de loin, comme sur la maquette. */
  const deDuJour = (iso: string) => ({
    u: ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'][new Date(`${iso}T12:00:00`).getDay()],
    b: parseInt(iso.slice(8, 10), 10),
  });
  const versAncre = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const enFenetre = duMois.filter((a) => a.date <= horizonJ3 && !a.relanceFaite);
  const plusLoin = duMois.filter((a) => !(a.date <= horizonJ3 && !a.relanceFaite));
  const gestesOuverts = travail.gestes.filter((g) => g.combien > 0);
  const gestesTenus = travail.gestes.filter((g) => g.combien === 0);
  const jourDuTitre = (() => {
    const j = jourLisible(auj, addDaysISO(auj, -1));
    return j.charAt(0).toUpperCase() + j.slice(1);
  })();

  /* ══ LA PAGE REFONDUE — maquette du 9 septembre, validée ═══════════
     Elle se lit de haut en bas comme une journée : le mois retenu d'abord
     (jamais muet), les gestes en cartes ensuite, la tenue des fiches en
     pied. MÊMES JUGES, MÊMES GESTES — seulement mieux rangés. */
  const ligneRetenue = (a: (typeof duMois)[number]) => {
    const c = clientDe(a.clientId);
    const prenom = (c?.name ?? '').split(' ')[0] || 'Madame';
    const dansFenetre = a.date <= horizonJ3 && !a.relanceFaite;
    const de = deDuJour(a.date);
    const origine = a.repriseDe
      ? (a.note ? a.note.replace('Reprise posée à la clôture · ', 'cadence · ').replace('toutes les ', '≈ ').replace('cadence observée ', '') : 'cadence')
      : a.source === 'couronne' ? 'Ma Couronne' : 'à la main';
    const rituel = apptLabel(a as never, byId);
    const message = a.repriseDe
      ? texteDeLaRelance({ prenom, jourIso: a.date, heure: a.time ?? '', aujourdhuiIso: auj, maison: maisonNom() })
      : texteDuRappel({
        prenom, jourIso: a.date, heure: a.time ?? '', aujourdhuiIso: auj,
        demainIso: addDaysISO(auj, 1), rituels: [], maison: maisonNom(),
      });
    return (
      <div key={a.id} className={`trp-af-rdv${dansFenetre ? ' trp-af-rdv--feu' : ' trp-af-rdv--loin'}`}>
        <span className="trp-af-jourde"><u>{de.u}</u><b>{de.b}</b></span>
        <span className="trp-af-qui">
          <b>{c?.name ?? a.clientName ?? 'Fiche retirée'}</b>
          <span className={`trp-af-tag${a.repriseDe ? ' trp-af-tag--cad' : ''}`}>{origine}</span>
          <small>{a.time ?? ''}{rituel ? `${a.time ? ' · ' : ''}${rituel}` : ''}</small>
        </span>
        <span className="trp-af-actes">
          {a.relanceFaite ? (
            <span className="trp-relance__fait">Relancée</span>
          ) : (
            <>
              <WaLien phone={c?.phone} message={message}>
                <span className={`trp-btn${dansFenetre ? ' trp-btn--copper' : ''}`}>WhatsApp</span>
              </WaLien>
              {dansFenetre ? (
                <button
                  type="button" className="trp-btn"
                  onClick={() => {
                    appointmentsStore.set((prev) => prev.map((x) => (x.id === a.id ? { ...x, relanceFaite: true } : x)));
                    toast('Relance notée, la ligne s’éteint.');
                  }}
                >
                  Relancée
                </button>
              ) : (
                <span className="trp-relance__des">relance dès le {frJourAn(addDaysISO(a.date, -3))}</span>
              )}
            </>
          )}
        </span>
      </div>
    );
  };

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="Pilotage · le travail"
        title="À faire."
        sub={reste === 0
          ? 'Tout est tenu. Chaque case qui ouvre quelque chose est remplie.'
          : 'Ce qui presse, ce qui manque, ce qui est tenu — dans cet ordre.'}
      />

      {/* ── L'en-tête daté et ses pastilles-chiffres, qui mènent ── */}
      <div className="trp-af-head">
        <div>
          <div className="trp-af-jourtitre">{jourDuTitre}.</div>
        </div>
        <div className="trp-af-score">
          {aRelancer.length > 0 && (
            <button type="button" className="trp-af-pill trp-af-pill--feu" onClick={() => versAncre('relances')}>
              <b>{aRelancer.length}</b> à relancer · 3 jours
            </button>
          )}
          <button type="button" className="trp-af-pill" onClick={() => versAncre('relances')}>
            <b>{duMois.length}</b> retenue{duMois.length > 1 ? 's' : ''} ce mois
          </button>
          <button type="button" className="trp-af-pill" onClick={() => versAncre('gestes')}>
            <b>{reste}</b> geste{reste > 1 ? 's' : ''} restant{reste > 1 ? 's' : ''}
          </button>
        </div>
      </div>

      {/* ── Strate 1 · le mois retenu ── */}
      <section id="relances" className="trp-af-bloc">
        <div className="trp-af-bloc__t">
          <b>Le mois retenu</b>
          <span>
            {duMois.length === 0
              ? 'aucun fauteuil retenu ce mois-ci · le mois est à conquérir'
              : `${duMois.length} fauteuil${duMois.length > 1 ? 's' : ''}${nCadence ? ` · ${nCadence} posé${nCadence > 1 ? 's' : ''} par la cadence` : ''} · à J-3 la ligne s'allume`}
          </span>
        </div>
        {enFenetre.length > 0 && <div className="trp-af-groupe">À relancer · dans les 3 jours</div>}
        {enFenetre.map(ligneRetenue)}
        {plusLoin.length > 0 && <div className="trp-af-groupe trp-af-groupe--calme">Plus loin dans le mois</div>}
        {plusLoin.map(ligneRetenue)}
        {(auDela > 0 && prochaineAuDela) && (
          <div className="trp-af-pied">
            Au-delà du mois : {auDela} retenue{auDela > 1 ? 's' : ''} déjà posée{auDela > 1 ? 's' : ''},
            la plus proche le {frJourAn(prochaineAuDela.date)}.
          </div>
        )}
      </section>

      {/* ── Strate 2 · les gestes, en cartes ── */}
      <div id="gestes" className="trp-af-gestes">
        {gestesOuverts.map((g) => (
          <div key={g.cle} className={`trp-af-geste${g.combien >= 40 ? '' : ' trp-af-geste--moyen'}`}>
            <span className="trp-af-geste__n">{g.combien}</span>
            <span className="trp-af-geste__q">{g.quoi}</span>
            <button
              type="button"
              className="trp-btn trp-af-geste__b"
              onClick={() => (SE_TETE.includes(g.cle)
                ? setOuvert((v) => (v === g.cle ? '' : g.cle))
                : navigate(OU[g.cle]))}
            >
              {SE_TETE.includes(g.cle) && ouvert === g.cle ? 'Replier' : g.verbe}
            </button>
            <span className="trp-af-geste__d">
              {g.xof !== undefined && g.xof > 0 ? `${fmtMoney(g.xof, currency)} ${g.ouvre}` : g.ouvre}
            </span>
          </div>
        ))}
      </div>
      {gestesTenus.length > 0 && (
        <div className="trp-af-tenus">
          Tenu : {gestesTenus.map((g) => g.quoi).join(' · ')}.
        </div>
      )}

      {/* ── La liste ouverte d'un geste, en vraies colonnes ── */}
      {ouvert !== '' && (
        <div className="trp-af-liste">
          <div className="trp-af-liste__t">
            {laListe.length} tête{laListe.length > 1 ? 's' : ''} · celles qui viennent d’abord
          </div>
          {laListe.map(({ tete, prochaineIso }) => {
            const c = clients.find((x) => x.id === tete.id);
            const prenom = (c?.name ?? '').split(' ')[0] ?? '';
            const tel = chiffresDe(c?.phone ?? '');
            const initiales = (c?.name ?? '—').split(/\s+/).map((m) => m.charAt(0)).slice(0, 2).join('').toUpperCase();
            return (
              <div key={tete.id} className="trp-af-tete">
                <span className="trp-af-av">{initiales || '·'}</span>
                <span className="trp-af-tete__n"><b>{c?.name ?? '—'}</b></span>
                <span className={`trp-af-tete__vient${prochaineIso ? '' : ' est-libre'}`}>
                  {prochaineIso ? `vient le ${frJourAn(prochaineIso)}` : 'aucune venue prévue'}
                </span>
                <span className="trp-af-micro">
                  {SE_DEMANDE[ouvert] && tel && (
                    <a
                      className="trp-af-mbtn trp-af-mbtn--wa"
                      href={`https://wa.me/${tel}?text=${encodeURIComponent(signeLeMessage(motPourDemander(ouvert, prenom)))}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      WhatsApp
                    </a>
                  )}
                  {AU_FAUTEUIL.includes(ouvert) && MARQUES.map((m) => (
                    <button
                      key={m.cle}
                      type="button"
                      className="trp-af-mbtn"
                      title={`${c?.name ?? 'Cette tête'} · ${m.dit} : hors du compte, de la cadence, de la mèche et de la longueur`}
                      onClick={() => {
                        clientsStore.set((prev) => prev.map((x) => (x.id === tete.id ? { ...x, ...m.pose } : x)));
                        toast(`${prenom || 'Elle'} · ${m.dit}. Elle sort du compte et de la cadence.`);
                      }}
                    >
                      {m.mot}
                    </button>
                  ))}
                  <button type="button" className="trp-af-mbtn" onClick={() => navigate(`/customers?id=${tete.id}`)}>
                    Sa fiche
                  </button>
                </span>
              </div>
            );
          })}
          {laListe.length === 0 && (
            <div className="trp-af-tete"><span className="trp-af-av">·</span><span className="trp-af-tete__n"><b>Personne.</b></span></div>
          )}
        </div>
      )}

      {/* ── Strate 3 · la tenue des fiches, en pied — un pouls ── */}
      <div className="trp-jauges trp-jauges--pied">
        {travail.jauges.map((j) => (
          <div key={j.cle} className={`trp-jauge ${teinte(j.pct)}`}>
            <u>{j.nom}</u>
            <b>{j.pct} %</b>
            <i><span style={{ width: `${Math.max(2, j.pct)}%` }} /></i>
          </div>
        ))}
      </div>
    </div>
  );
}
