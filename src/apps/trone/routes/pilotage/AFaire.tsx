import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHead } from '../_ui';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { useClients } from '../../../../shared/clients';
import { useBilans } from '../../../../shared/bilans';
import { useProduitsStock } from '../../../../shared/stock';
import {
  leTravail, tetesDuGeste, motPourDemander, SE_DEMANDE, type CleGeste,
} from '../../../../shared/afaire';
import { signeLeMessage } from '../../../../shared/identite';

import { apptDueXof, frJourAn, todayISO, useBranchAppointments, useServicesById } from '../clients/_shared';
import './pilotage.css';
/** LES GESTES QUI SE LISENT TÊTE PAR TÊTE. Les mains, le prix d'achat et les
    impayés ne concernent pas une tête : ils vivent sur un rituel ou une fiche
    de stock, et leur liste est ailleurs. */
const SE_TETE: CleGeste[] = ['meche', 'bilan', 'cadence', 'longueur', 'email', 'locks'];


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

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="Pilotage · le travail"
        title="À faire."
        sub={reste === 0
          ? 'Tout est tenu. Chaque case qui ouvre quelque chose est remplie.'
          : 'Ce qui manque, et ce que ça ouvre. Rangé par ce qui touche le plus de têtes.'}
      />

      {/* SIX JAUGES, QUE DES CHIFFRES. Elles ne se lisent pas, elles se
          regardent : c'est la couleur qui dit où est la tension. */}
      <div className="trp-jauges">
        {travail.jauges.map((j) => (
          <div key={j.cle} className={`trp-jauge ${teinte(j.pct)}`}>
            <u>{j.nom}</u>
            <b>{j.pct} %</b>
            <i><span style={{ width: `${Math.max(2, j.pct)}%` }} /></i>
          </div>
        ))}
      </div>

      <div className="trp-gestes">
        {travail.gestes.map((g) => {
          const tenu = g.combien === 0;
          return (
            <div key={g.cle}>
            <div className={`trp-geste ${tenu ? 'est-fait' : g.combien >= 40 ? 'est-fort' : 'est-moyen'}`}>
              <span className="trp-geste__n">{g.combien}</span>
              <span className="trp-geste__q">{g.quoi}</span>
              <span className="trp-geste__d">
                {tenu ? 'tenu' : (g.xof !== undefined && g.xof > 0
                  ? `${fmtMoney(g.xof, currency)} ${g.ouvre}`
                  : g.ouvre)}
              </span>
              {!tenu && SE_TETE.includes(g.cle) && (
                <button
                  type="button"
                  className="trp-geste__l"
                  onClick={() => setOuvert((v) => (v === g.cle ? '' : g.cle))}
                >
                  {ouvert === g.cle ? 'Replier' : 'Voir qui'}
                </button>
              )}
              {!tenu && (
                <button type="button" className="trp-geste__b" onClick={() => navigate(OU[g.cle])}>
                  {g.verbe}
                </button>
              )}
            </div>
            {ouvert === g.cle && (
              <div className="trp-liste">
                {laListe.map(({ tete, prochaineIso }) => {
                  const c = clients.find((x) => x.id === tete.id);
                  const prenom = (c?.name ?? '').split(' ')[0] ?? '';
                  const tel = chiffresDe(c?.phone ?? '');
                  return (
                    <div key={tete.id} className="trp-tete">
                      <span className="trp-tete__n">{c?.name ?? '—'}</span>
                      {/* SA PROCHAINE VENUE EST L'ALERTE : c'est le jour où
                          l'on pourra demander sans la déranger un autre jour. */}
                      <span className={`trp-tete__q ${prochaineIso ? 'est-attendue' : ''}`}>
                        {prochaineIso ? `vient le ${frJourAn(prochaineIso)}` : 'aucune venue prévue'}
                      </span>
                      {SE_DEMANDE[g.cle] && tel && (
                        <a
                          className="trp-tete__wa"
                          href={`https://wa.me/${tel}?text=${encodeURIComponent(signeLeMessage(motPourDemander(g.cle, prenom)))}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          WhatsApp
                        </a>
                      )}
                      <button
                        type="button"
                        className="trp-tete__f"
                        onClick={() => navigate(`/customers?fiche=${tete.id}`)}
                      >
                        Sa fiche
                      </button>
                    </div>
                  );
                })}
                {laListe.length === 0 && (
                  <div className="trp-tete"><span className="trp-tete__n">Personne.</span></div>
                )}
              </div>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
}
