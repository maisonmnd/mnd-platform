import type { ReactNode } from 'react';
import { useAppointments, apptPaidXof } from '../../shared/agenda';
import { useInvoices, invoiceTotal } from '../../shared/finance';
import type { EcheanceDuContrat, ReleveDeLAbonnee, ReleveDuContrat } from '../../shared/abonnee-pur';
import { objetDeLaLigne, type DemandeDeReglement } from './Abonnee';
import { dateCourte, dateDansLaPhrase, dateSansJour, rangDit } from './releve';
import { t, prix } from './i18n';
import './abonnee.css';

/* ══ MON SOLDE — 20 octobre 2026 ═════════════════════════════════════════
   Maquette L0 validée, écran 5 : « Combien ai-je payé, combien reste-t-il ? »

   TROIS CHIFFRES, JAMAIS ADDITIONNÉS EN UN SEUL : ce qui est à régler
   aujourd'hui (l'échu, retard compris), ce qui viendra (daté, échéance par
   échéance), et l'avoir, toujours à part. Additionner l'échu et l'à venir
   faisait lire « vous devez 140 000 F » à une cliente parfaitement à jour.

   Tout vient du relevé : l'échéancier de chaque formule, ses versements
   (réunis par identifiant, contrat et pièce), ce qu'elle doit hors formule. */

/** Une échéance dite en une phrase : réglée le, à régler le, en attente depuis. */
function phraseDeLEcheance(e: EcheanceDuContrat, c: ReleveDuContrat, jour: string): string {
  if (e.statut === 'reglee') return e.regleeLe ? t('réglée le {date}', { date: dateDansLaPhrase(e.regleeLe) }) : t('réglée');
  if (e.statut === 'annulee') return c.resilieeLe ? t('annulée par la résiliation du {date}', { date: dateDansLaPhrase(c.resilieeLe) }) : t('annulée');
  if (e.statut === 'retenue') return c.argent.pourOuvrir
    ? t('à régler avant le {date} au soir, pour ouvrir la formule', { date: dateDansLaPhrase(c.argent.pourOuvrir.avantIso) })
    : t('pour ouvrir la formule');
  if (e.statut === 'a-regler-aujourdhui') return t('à régler aujourd’hui, {date}', { date: dateDansLaPhrase(e.dueIso) });
  if (e.statut === 'en-retard') return e.retardJours > 1
    ? t('en attente depuis le {date} · {n} jours de retard', { date: dateDansLaPhrase(e.dueIso), n: e.retardJours })
    : t('en attente depuis le {date} · 1 jour de retard', { date: dateDansLaPhrase(e.dueIso) });
  return e.dueIso > jour ? t('à régler le {date} ; un rappel vous arrive la veille', { date: dateDansLaPhrase(e.dueIso) }) : t('à régler le {date}', { date: dateDansLaPhrase(e.dueIso) });
}

const PASTILLE: Record<EcheanceDuContrat['statut'], string> = {
  reglee: 'is-ok', 'a-regler-aujourdhui': 'is-jour', 'en-retard': 'is-retard', 'a-venir': '', retenue: 'is-jour', annulee: '',
};

/** L'échéancier d'une formule, avec ce qui reste. */
function Echeancier({ c, jour, onRegler }: { c: ReleveDuContrat; jour: string; onRegler: (d: DemandeDeReglement) => void }) {
  const ar = c.argent;
  const ouverte = ar.echeances.find((e) => e.statut === 'en-retard' || e.statut === 'a-regler-aujourdhui');
  return (
    <>
      <div className="ab-ech">
        {ar.echeances.map((e) => (
          <div key={e.numero} className="ab-ech__ligne">
            <span className={`ab-pastille ${PASTILLE[e.statut]}`} aria-hidden="true" />
            <span className="ab-ech__date"><b>{t('{rang} échéance', { rang: rangDit(e.numero) })}</b><br />{phraseDeLEcheance(e, c, jour)}</span>
            <span className={`ab-ech__mt ${e.statut === 'reglee' || e.statut === 'annulee' ? 'is-paye' : ''}`}>{prix(e.amountXof)}</span>
          </div>
        ))}
        {c.mode === 'cycle' && ar.luneARegler && (
          <div className="ab-ech__ligne">
            <span className="ab-pastille is-jour" aria-hidden="true" />
            <span className="ab-ech__date"><b>{t('Lune suivante')}</b><br />{t('en attente depuis le {date} : en pause, pas de dette', { date: dateDansLaPhrase(ar.luneARegler.depuisIso) })}</span>
            <span className="ab-ech__mt">{prix(ar.luneARegler.montantXof)}</span>
          </div>
        )}
        {c.mode === 'cycle' && ar.aVenir.filter((v) => v.genre === 'lune').map((v) => (
          <div key={v.dueIso} className="ab-ech__ligne">
            <span className="ab-pastille" aria-hidden="true" />
            <span className="ab-ech__date"><b>{t('Lune suivante')}</b><br />{t('à régler avant le {date}', { date: dateDansLaPhrase(v.dueIso) })}</span>
            <span className="ab-ech__mt">{prix(v.montantXof)}</span>
          </div>
        ))}
        {ar.prorata && (
          <p className="ab-meta" style={{ paddingTop: 8 }}>
            {t('Résiliée le {date} : {n} séances comptées valent {consomme}, au prorata, arrondi au franc ; vous aviez réglé {regle}.', {
              date: dateDansLaPhrase(ar.prorata.le), n: ar.prorata.comptees, consomme: prix(ar.prorata.consommeXof), regle: prix(ar.regleXof),
            })}
          </p>
        )}
        <div className="ab-somme">
          {c.mode === 'cycle' && !ar.echeances.length
            ? <><span>{t('Une lune non réglée ne se doit pas')}</span><b>{prix(0)}</b></>
            : <><span>{t('Reste sur la formule')}</span><b>{prix(ar.resteXof)}</b></>}
        </div>
      </div>
      {ouverte && (
        <button type="button" className="mc-cta mc-cta--copper ab-court"
          onClick={() => onRegler({ subId: c.sub.id, montantXof: ouverte.resteXof, avantIso: ouverte.dueIso, objet: c.nom })}>
          {t('Régler {montant}', { montant: prix(ouverte.resteXof) })}
        </button>
      )}
      {!ouverte && c.mode === 'cycle' && ar.luneARegler && (
        <button type="button" className="mc-cta mc-cta--copper ab-court"
          onClick={() => onRegler({ subId: c.sub.id, montantXof: ar.luneARegler!.montantXof, avantIso: ar.luneARegler!.depuisIso, objet: c.nom })}>
          {t('Régler la lune · {montant}', { montant: prix(ar.luneARegler.montantXof) })}
        </button>
      )}
    </>
  );
}

export default function MonSolde({ releve, prenom, selecteur, onClose, onRegler }: {
  releve: ReleveDeLAbonnee;
  prenom?: string;
  /** Le sélecteur de tête, quand elle porte un enfant. */
  selecteur?: ReactNode;
  onClose: () => void;
  onRegler: (d: DemandeDeReglement) => void;
}) {
  const [appts] = useAppointments();
  const [invoices] = useInvoices();
  const s = releve.solde;
  const jour = releve.jour;
  const aRegler = s.lignes.filter((l) => l.statut === 'a-regler-aujourdhui' || l.statut === 'en-retard');
  const aVenir = s.lignes.filter((l) => l.statut === 'a-venir');
  const hors = s.lignes.filter((l) => l.genre === 'rituel' || l.genre === 'piece');
  const retenue = releve.contrats.find((c) => c.etat === 'retenue' && c.argent.pourOuvrir);
  const enPause = releve.contrats.some((c) => c.etat === 'en-pause');
  const avecArgent = [...releve.contrats, ...releve.anciens].filter((c) => c.etat !== 'effacee'
    && (c.argent.echeances.length || c.argent.luneARegler || c.argent.aVenir.length || c.argent.prorata || c.argent.versements.length));

  /* SES PAIEMENTS, tous : ceux de ses formules (réunis par identifiant) et
     ceux de ses rituels, chacun à sa date. */
  const paiements = [
    ...[...releve.contrats, ...releve.anciens].flatMap((c) => c.argent.versements.map((v) => ({
      id: `v-${v.id}`, date: v.date, montantXof: v.montantXof, objet: c.nom, moyen: v.moyen,
    }))),
    ...appts.filter((a) => a.clientId === releve.clientId && !a.coveredBySub && apptPaidXof(a) > 0)
      .flatMap((a) => (a.payments?.length
        ? a.payments.map((p) => ({ id: `p-${p.id}`, date: p.date || a.date, montantXof: Number(p.amountXof) || 0, objet: t('Séance du {date}', { date: dateCourte(a.date) }), moyen: p.method as string | undefined }))
        : [{ id: `p-${a.id}`, date: a.date, montantXof: apptPaidXof(a), objet: t('Séance du {date}', { date: dateCourte(a.date) }), moyen: undefined as string | undefined }])),
  ].filter((p) => p.montantXof > 0).sort((a, b) => (a.date < b.date ? 1 : -1));

  /* SES PIÈCES : le numéro se lit ici, dans l'application, jamais dans un
     message WhatsApp. */
  const pieces = invoices.filter((i) => i.kind === 'facture' && i.clientId === releve.clientId)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div className="mc-overlayscreen mc-slide" style={{ zIndex: 44 }}>
      <div className="mc-flowhead">
        <div className="mc-flowhead__row">
          <button type="button" className="mc-linkback" onClick={onClose}>← {t('Retour')}</button>
          <button type="button" className="mc-x" aria-label={t('Fermer')} onClick={onClose}>✕</button>
        </div>
        <div className="mc-micro-eyebrow" style={{ marginTop: 10 }}>{t('Mon solde · réglé, à venir, avoir')}</div>
        <h1 className="mc-flowhead__h1">{prenom ? t('Le solde de {prenom}.', { prenom }) : t('Mon solde.')}</h1>
      </div>
      <div className="mc-scroll mc-flowbody">
        <div className="ab-page" style={{ padding: 0 }}>
          {selecteur}
          <div className={`ab-sol-grand ${s.dontEnRetardXof > 0 ? 'is-retard' : s.aRegleAujourdhuiXof > 0 ? 'is-du' : ''}`}>
            <span className="ab-sol-lab">{t('À régler aujourd’hui')}</span>
            <b className="ab-sol-chiffre">{prix(s.aRegleAujourdhuiXof)}</b>
            {aRegler.length ? (
              <>
                {aRegler.map((l) => (
                  <span key={`${l.genre}-${l.subId ?? l.id}-${l.numero ?? ''}`} className="ab-sol-sous">
                    {l.statut === 'en-retard' && l.dueIso
                      ? t('{montant} · {objet}, en attente depuis le {date}', { montant: prix(l.montantXof), objet: objetDeLaLigne(l, !prenom), date: dateDansLaPhrase(l.dueIso) })
                      : t('{montant} · {objet}, aujourd’hui', { montant: prix(l.montantXof), objet: objetDeLaLigne(l, !prenom) })}
                  </span>
                ))}
                <button type="button" className="mc-cta mc-cta--copper ab-court"
                  onClick={() => onRegler({ subId: aRegler[0].subId, montantXof: aRegler[0].montantXof, avantIso: aRegler[0].dueIso, objet: objetDeLaLigne(aRegler[0], !prenom) })}>
                  {t('Régler {montant}', { montant: prix(aRegler[0].montantXof) })}
                </button>
              </>
            ) : (
              <span className="ab-sol-sous">
                {enPause ? t('Rien : une lune non réglée n’est pas une dette.')
                  : retenue?.argent.pourOuvrir ? t('Rien n’est dû. Pour ouvrir votre formule : {montant} avant le {date} au soir.', { montant: prix(retenue.argent.pourOuvrir.montantXof), date: dateDansLaPhrase(retenue.argent.pourOuvrir.avantIso) })
                    : prenom ? t('Rien à régler pour {prenom} aujourd’hui.', { prenom }) : t('Rien à régler aujourd’hui. Vous êtes à jour.')}
              </span>
            )}
          </div>
          <div className="ab-sol-duo">
            <div className="ab-sol-petit">
              <span className="ab-sol-lab">{t('À venir')}</span>
              <b>{prix(s.aVenirXof)}</b>
              {aVenir.length
                ? aVenir.map((l) => <span key={`${l.genre}-${l.subId ?? l.id}-${l.numero ?? ''}-${l.dueIso ?? ''}`} className="ab-sol-sous">{l.dueIso ? t('{montant} le {date}', { montant: prix(l.montantXof), date: dateSansJour(l.dueIso) }) : prix(l.montantXof)}</span>)
                : <span className="ab-sol-sous">{t('Rien de prévu.')}</span>}
            </div>
            <div className="ab-sol-petit">
              <span className="ab-sol-lab">{prenom ? t('Son avoir') : t('Votre avoir')}</span>
              <b>{prix(s.avoirXof)}</b>
              <span className="ab-sol-sous">{s.avoirXof > 0 ? t('À valoir sur une prochaine séance ; rien ne sort de la caisse.') : t('Aucun avoir.')}</span>
            </div>
          </div>
          <p className="mc-footnote" style={{ textAlign: 'left', marginTop: 0 }}>{t('Ces trois chiffres ne s’additionnent pas : chacun a sa date.')}</p>

          {avecArgent.map((c) => (
            <div key={c.sub.id} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="ab-lab">{prenom ? t('Sa formule · {nom}', { nom: c.nom }) : t('Ma formule · {nom}', { nom: c.nom })}</div>
              <Echeancier c={c} jour={jour} onRegler={onRegler} />
            </div>
          ))}

          <div className="ab-lab">{prenom ? t('Ses séances à régler hors formule') : t('Mes séances à régler hors formule')}</div>
          {hors.length ? (
            <div>
              {hors.map((l) => (
                <div key={`${l.genre}-${l.id}`} className="ab-pai">
                  {l.dueIso && <span className="ab-pai__d">{dateCourte(l.dueIso)}</span>}
                  <span className="ab-pai__o">{objetDeLaLigne(l, !prenom)}<small>{l.statut === 'a-venir' ? t('à venir') : t('à régler au comptoir ou par un lien MND PAY')}</small></span>
                  <b>{prix(l.montantXof)}</b>
                </div>
              ))}
            </div>
          ) : <p className="ab-meta">{t('Aucune séance à régler hors formule.')}</p>}

          <div className="ab-lab">{prenom ? t('Ses paiements') : t('Mes paiements')}</div>
          {paiements.length ? (
            <div>
              {paiements.map((p) => (
                <div key={p.id} className="ab-pai">
                  <span className="ab-pai__d">{dateCourte(p.date)}</span>
                  <span className="ab-pai__o">{p.objet}{p.moyen ? <small>{p.moyen}</small> : null}</span>
                  <b>{prix(p.montantXof)}</b>
                </div>
              ))}
            </div>
          ) : <p className="ab-meta">{t('Aucun paiement pour l’instant.')}</p>}

          <div className="ab-lab">{prenom ? t('Ses pièces') : t('Mes pièces')}</div>
          {pieces.length ? (
            <div>
              {pieces.map((i) => (
                <div key={i.id} className="ab-pai">
                  <span className="ab-pai__d">{dateCourte(i.date)}</span>
                  <span className="ab-pai__o">{t('Facture {numero}', { numero: i.number })}<small>{i.status === 'payée' ? t('réglée') : t('en cours de règlement')}</small></span>
                  <b>{prix(invoiceTotal(i))}</b>
                </div>
              ))}
              <p className="ab-meta">{t('La Maison vous remet le PDF de chaque pièce sur demande.')}</p>
            </div>
          ) : <p className="ab-meta">{t('Aucune pièce pour l’instant.')}</p>}
          <p className="ab-doute">{t('Un doute ? Écrivez à la Maison, on vous répond.')}</p>
        </div>
      </div>
    </div>
  );
}
