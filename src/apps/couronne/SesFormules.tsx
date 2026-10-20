import { useState, type ReactNode } from 'react';
import { useModelBands } from '../../shared/pricing';
import { decaleLeJour } from '../../shared/ia-faits-pur';
import type { LigneDeSeances, ReleveDeLAbonnee, ReleveDuContrat, SeanceDuContrat } from '../../shared/abonnee-pur';
import { useNomDeService, Legende, type DemandeDeReglement } from './Abonnee';
import { ETAT_FORMULE, dateDansLaPhrase, dateLongue, heureDite, rangDit } from './releve';
import { fourchetteDuModele } from './fourchette';
import { t, prix } from './i18n';
import './abonnee.css';

/* ══ MA FORMULE, CE QUI EST CONVENU — 20 octobre 2026 ════════════════════
   Maquette L0 validée, écran 2 : « Qu'ai-je acheté, jusqu'à quand, à quelles
   conditions ? » Une carte par contrat qui court (deux formules peuvent courir
   ensemble), ses séances prestation par prestation, son règlement en résumé,
   ce qui est convenu dans les mots de l'achat, puis les formules passées,
   repliées.

   LA DATE DE FIN EST CELLE DU CONTRAT, jamais la durée de la formule : la
   Maison a pu la prolonger, et c'est elle qui fait foi.

   UN SEUL PANNEAU OUVERT À LA FOIS, le résumé sur la ligne : on lit d'un coup
   d'œil, on déplie pour le détail. */

const dernierJour = (au: string): string => decaleLeJour(au, -1);

/** Les jetons d'une prestation : ✓ faite, × manquée, demi réservée, vide disponible. */
function Jetons({ l, perdue }: { l: LigneDeSeances; perdue: boolean }) {
  if (l.incluses === null) return null;
  if (l.incluses > 12) return <span className="ab-pli__resume">{t('{n} prises sur {total}', { n: l.faites + l.manquees + l.reservees, total: l.incluses })}</span>;
  return (
    <span className="ab-jetons" aria-hidden="true">
      {Array.from({ length: l.incluses }, (_, i) => {
        const cls = i < l.faites ? 'is-faite' : i < l.faites + l.manquees ? 'is-manquee' : i < l.faites + l.manquees + l.reservees ? 'is-reservee' : perdue ? 'is-perdue' : '';
        return <span key={i} className={`ab-jeton ${cls}`}>{cls === 'is-faite' ? '✓' : cls === 'is-manquee' ? '×' : ''}</span>;
      })}
    </span>
  );
}

/** Le mot d'une séance dans la liste dépliée. */
function motDeLaSeance(s: SeanceDuContrat): string {
  if (s.etat === 'faite') return t('faite');
  if (s.etat === 'manquee') return t('manquée, comptée');
  if (s.etat === 'proposee') return t('proposée par la Maison');
  if (s.etat === 'a-cloturer') return t('passée');
  return t('réservée');
}

function CarteDuContrat({ c, prenom, onRegler, onRenoncer }: {
  c: ReleveDuContrat;
  prenom?: string;
  onRegler: (d: DemandeDeReglement) => void;
  onRenoncer?: (c: ReleveDuContrat) => void;
}) {
  const [bands] = useModelBands();
  const b = c.sub.calibreVendu ? bands.find((x) => x.id === c.sub.calibreVendu) : undefined;
  const total = c.seances.reduce((m, l) => Math.max(m, l.incluses ?? 0), 0);
  const tag = c.mode === 'cycle'
    ? t('Chaque lune · {montant}', { montant: prix(c.argent.prixVenduXof) })
    : c.etat === 'retenue' && c.retenueJusquau ? t('{n} séances · retenue jusqu’au {date}', { n: total, date: dateDansLaPhrase(c.retenueJusquau) })
      : c.etat === 'resiliee' && c.resilieeLe ? t('{n} séances · résiliée le {date}', { n: total, date: dateDansLaPhrase(c.resilieeLe) })
        : c.finIso ? (c.etat === 'terminee'
          ? t('{n} séances · terminée le {date}', { n: total, date: dateDansLaPhrase(c.finIso) })
          : t('{n} séances · jusqu’au {date}', { n: total, date: dateDansLaPhrase(c.finIso) }))
          : t('{n} séances', { n: total });
  const lignes: [string, string][] = [[t('Référence'), c.reference]];
  if (c.etat === 'retenue') lignes.push([t('Prise en ligne'), t('le {date}, pas encore réglée', { date: dateDansLaPhrase(c.debutIso) })]);
  else lignes.push([t('Signée'), t('le {date}', { date: dateDansLaPhrase(c.debutIso) })]);
  if (c.mode === 'pack' && c.finIso) lignes.push([t('Fin'), t('le {date}', { date: dateDansLaPhrase(c.finIso) })]);
  if (c.resilieeLe) lignes.push([t('Résiliée'), t('le {date}', { date: dateDansLaPhrase(c.resilieeLe) })]);
  if (c.courtJusquau) lignes.push([t('Court jusqu’au'), t('{date}, la fin de la lune réglée', { date: dateDansLaPhrase(c.courtJusquau) })]);
  if (c.epuiseeParLAncienCarnet) lignes.push([t('Séances'), t('prises avant Le Trône')]);
  if (c.mode === 'cycle') {
    lignes.push([t('Lune'), c.lune && c.etat !== 'en-pause'
      ? t('du {du} au {au}', { du: dateDansLaPhrase(c.lune.du), au: dateDansLaPhrase(dernierJour(c.lune.au)) })
      : t('en attente de règlement')]);
  }
  if (b?.name) lignes.push([prenom ? t('Sa tête') : t('Votre tête'), t('{calibre}, {fourchette}', { calibre: b.name.trim(), fourchette: fourchetteDuModele(b, bands) })]);
  const pr = c.sub.prixRevu;
  lignes.push([t('Prix'), pr
    ? t('{nouveau} sur votre contrat depuis le comptage du {date} (avant : {ancien}).', { nouveau: prix(pr.nouveauXof), date: dateDansLaPhrase(pr.le), ancien: prix(pr.ancienXof) })
    : c.mode === 'cycle' ? t('{montant} par lune', { montant: prix(c.argent.prixVenduXof) }) : t('{montant} sur votre contrat.', { montant: prix(c.argent.prixVenduXof) })]);
  const etat = ETAT_FORMULE[c.etat];
  return (
    <div className="ab-carte">
      <div className="ab-carte__tag">{tag}</div>
      <div className="ab-carte__nom">{c.nom}</div>
      {c.plan?.line && <p className="ab-carte__ligne">{c.plan.line}</p>}
      <dl>
        {lignes.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>
      <div className="ab-carte__etat"><span>{t('État')}</span><b>{t(etat.dit)}</b></div>
      {c.etat === 'retenue' && c.argent.pourOuvrir && (
        <div className="ab-actes">
          <button type="button" className="mc-cta mc-cta--copper"
            onClick={() => onRegler({ subId: c.sub.id, montantXof: c.argent.pourOuvrir!.montantXof, avantIso: c.argent.pourOuvrir!.avantIso, objet: c.nom })}>
            {t('Régler {montant}', { montant: prix(c.argent.pourOuvrir.montantXof) })}
          </button>
          {onRenoncer && <button type="button" className="mc-cta ab-invert" onClick={() => onRenoncer(c)}>{t('Renoncer')}</button>}
        </div>
      )}
      {c.etat === 'en-pause' && c.argent.luneARegler && (
        <div className="ab-actes ab-actes--un">
          <button type="button" className="mc-cta mc-cta--copper"
            onClick={() => onRegler({ subId: c.sub.id, montantXof: c.argent.luneARegler!.montantXof, avantIso: c.argent.luneARegler!.depuisIso, objet: c.nom })}>
            {t('Régler la lune · {montant}', { montant: prix(c.argent.luneARegler.montantXof) })}
          </button>
        </div>
      )}
    </div>
  );
}

function LigneDePrestation({ c, l, ouvert, onBascule, onOpenRdv, onReserverIncluse }: {
  c: ReleveDuContrat;
  l: LigneDeSeances;
  ouvert: boolean;
  onBascule: () => void;
  onOpenRdv: (id: string) => void;
  onReserverIncluse: () => void;
}) {
  const nomDe = useNomDeService();
  const perdue = c.etat === 'terminee' || (c.etat === 'resiliee' && !c.courtJusquau) || !!c.epuiseeParLAncienCarnet;
  const resume = c.etat === 'retenue' ? (l.incluses ?? 0) > 1
    ? t('{n} séances, ouvertes au premier règlement', { n: l.incluses ?? 0 }) : t('{n} séance, ouverte au premier règlement', { n: l.incluses ?? 0 })
    : c.etat === 'en-pause' ? t('En pause : aucune séance incluse avant le règlement de la lune')
      : c.epuiseeParLAncienCarnet ? t('Épuisée · séances prises avant Le Trône')
        : null;
  const seances = c.attribuees.filter((s) => s.compte && l.seances.includes(s.id));
  const fin = c.mode === 'cycle' ? (c.lune ? dernierJour(c.lune.au) : null) : c.finIso;
  return (
    <div className={`ab-pli ${ouvert ? 'is-ouvert' : ''}`}>
      <button type="button" className="ab-pli__tete" aria-expanded={ouvert} onClick={onBascule}>
        <span className="ab-pli__nom">{c.mode === 'cycle' && l.incluses !== null
          ? t('{prestation} · {n} par lune', { prestation: nomDe(l.serviceId), n: l.incluses }) : nomDe(l.serviceId)}</span>
        <span className="ab-pli__chev" aria-hidden="true">{ouvert ? '−' : '+'}</span>
        <Jetons l={l} perdue={perdue} />
        <span className="ab-pli__resume">{resume ?? (l.incluses === null ? t('Sans limite.') : null)}</span>
        {!resume && l.incluses !== null && <span className="ab-pli__resume"><Legende l={l} perdue={perdue} /></span>}
      </button>
      {ouvert && (
        <ol className="ab-seances">
          {c.etat === 'retenue' ? (
            <li className="ab-s"><span className="ab-jeton" /><span className="ab-s__t"><b>{t('Elles s’ouvrent au premier règlement')}</b><span>{c.retenueJusquau ? t('Avant le {date} au soir.', { date: dateDansLaPhrase(c.retenueJusquau) }) : ''}</span></span><span /></li>
          ) : c.etat === 'en-pause' ? (
            <li className="ab-s"><span className="ab-jeton" /><span className="ab-s__t"><b>{t('La séance de la lune')}</b><span>{t('Elle s’ouvre le jour où vous réglez la lune, pour 30 jours.')}</span></span><span /></li>
          ) : (
            <>
              {seances.map((s, i) => (
                <li key={s.id} className="ab-s">
                  <span className={`ab-jeton ${s.etat === 'faite' ? 'is-faite' : s.etat === 'manquee' ? 'is-manquee' : 'is-reservee'}`}>{s.etat === 'faite' ? '✓' : s.etat === 'manquee' ? '×' : ''}</span>
                  <span className="ab-s__t">
                    <b>{t('Séance {n} · {mot}', { n: i + 1, mot: motDeLaSeance(s) })}</b>
                    <span>{s.etat === 'faite' || s.etat === 'manquee' ? dateLongue(s.date) : t('{date} · {heure}', { date: dateLongue(s.date), heure: heureDite(s.time) })}</span>
                  </span>
                  {s.etat === 'faite' || s.etat === 'manquee'
                    ? <span />
                    : <button type="button" className="ab-s__go" onClick={() => onOpenRdv(s.id)}>{t('Ouvrir')}</button>}
                </li>
              ))}
              {Array.from({ length: l.disponibles ?? 0 }, (_, k) => {
                const n = seances.length + k + 1;
                if (c.etat === 'terminee') {
                  return <li key={`p${k}`} className="ab-s"><span className="ab-jeton is-perdue" /><span className="ab-s__t"><b>{t('Séance {n} · perdue', { n })}</b><span>{c.finIso ? t('Non prise au {date}, date de fin.', { date: dateDansLaPhrase(c.finIso) }) : ''}</span></span><span /></li>;
                }
                if (c.etat === 'resiliee' && !c.courtJusquau && c.mode === 'cycle') {
                  return <li key={`p${k}`} className="ab-s"><span className="ab-jeton is-perdue" /><span className="ab-s__t"><b>{t('Séance {n} · non prise', { n })}</b><span>{c.resilieeLe ? t('Résiliée le {date} : la lune réglée a couru jusqu’à son terme, rien n’est rendu.', { date: dateDansLaPhrase(c.resilieeLe) }) : ''}</span></span><span /></li>;
                }
                if (c.etat === 'resiliee' && !c.courtJusquau) {
                  return <li key={`p${k}`} className="ab-s"><span className="ab-jeton is-perdue" /><span className="ab-s__t"><b>{t('Séance {n} · rendue en avoir', { n })}</b><span>{c.resilieeLe ? t('Non faite à la résiliation du {date} : comptée dans votre avoir.', { date: dateDansLaPhrase(c.resilieeLe) }) : ''}</span></span><span /></li>;
                }
                return (
                  <li key={`d${k}`} className="ab-s">
                    <span className="ab-jeton" />
                    <span className="ab-s__t"><b>{t('Séance {n} · disponible', { n })}</b><span>{fin ? t('À réserver avant le {date}.', { date: dateDansLaPhrase(fin) }) : t('À réserver quand vous voulez.')}</span></span>
                    {k === 0 && c.porte.peutReserverIncluse
                      ? <button type="button" className="ab-s__go" onClick={onReserverIncluse}>{t('Réserver')}</button>
                      : <span />}
                  </li>
                );
              })}
            </>
          )}
        </ol>
      )}
    </div>
  );
}

function Reglement({ c, prenom, onRegler, onSolde }: { c: ReleveDuContrat; prenom?: string; onRegler: (d: DemandeDeReglement) => void; onSolde: () => void }) {
  const ar = c.argent;
  const lienSolde = <button type="button" className="ab-lien" onClick={onSolde}>{prenom ? t('Son solde →') : t('Mon solde →')}</button>;
  if (c.mode === 'cycle' && !ar.echeances.length) {
    return (
      <div className="ab-card">
        <div className="ab-reg__haut"><span>{t('Chaque lune, avant la lune')}</span><b>{prix(ar.prixVenduXof)}</b></div>
        <p className="ab-meta">{c.etat === 'en-pause' && ar.luneARegler
          ? t('Votre prochaine lune attend son règlement depuis le {date}. Pas de dette : la formule reprend le jour où vous réglez, et la lune court 30 jours à partir de là.', { date: dateDansLaPhrase(ar.luneARegler.depuisIso) })
          : c.lune ? t('Lune réglée jusqu’au {fin}. La suivante se règle avant le {suivante}.', { fin: dateDansLaPhrase(dernierJour(c.lune.au)), suivante: dateDansLaPhrase(c.lune.prochaineIso) }) : t('La lune se règle avant la lune.')}</p>
        {c.etat === 'en-pause' && ar.luneARegler && (
          <button type="button" className="mc-cta mc-cta--copper ab-court"
            onClick={() => onRegler({ subId: c.sub.id, montantXof: ar.luneARegler!.montantXof, avantIso: ar.luneARegler!.depuisIso, objet: c.nom })}>
            {t('Régler la lune · {montant}', { montant: prix(ar.luneARegler.montantXof) })}
          </button>
        )}
        {lienSolde}
      </div>
    );
  }
  if (c.etat === 'retenue') {
    return (
      <div className="ab-card">
        <div className="ab-reg__haut"><span>{t('Rien n’est encore réglé')}</span><b>{prix(ar.prixVenduXof)}</b></div>
        <p className="ab-meta">{ar.pourOuvrir
          ? t('Retenue jusqu’au {date} au soir ; sans règlement, elle s’efface le lendemain, et rien n’est dû.', { date: dateDansLaPhrase(ar.pourOuvrir.avantIso) })
          : ''}</p>
        {lienSolde}
      </div>
    );
  }
  if (c.etat === 'resiliee') {
    return (
      <div className="ab-card">
        <div className="ab-reg__haut"><span>{t('Réglé {regle} sur {prix}', { regle: prix(ar.regleXof), prix: prix(ar.prixVenduXof) })}</span><b className="is-ok">{t('Résiliée')}</b></div>
        {c.courtJusquau && <p className="ab-meta">{t('La lune en cours court jusqu’au {date} : vos séances incluses restent réservables jusque-là.', { date: dateDansLaPhrase(c.courtJusquau) })}</p>}
        {c.mode === 'cycle' && (ar.lunesEnAvoir
          ? <p className="ab-meta">{ar.lunesEnAvoir.nombre > 1
            ? t('{n} lunes réglées d’avance deviennent un avoir : {montant}, à valoir sur une prochaine séance.', { n: ar.lunesEnAvoir.nombre, montant: prix(ar.lunesEnAvoir.avoirXof) })
            : t('{n} lune réglée d’avance devient un avoir : {montant}, à valoir sur une prochaine séance.', { n: ar.lunesEnAvoir.nombre, montant: prix(ar.lunesEnAvoir.avoirXof) })}</p>
          : <p className="ab-meta">{t('Rien n’est rendu de la lune en cours.')}</p>)}
        {ar.prorata && ar.prorata.resteXof > 0
          ? <p className="ab-meta">{t('Les séances faites dépassent ce qui était réglé : {montant} à régler le {date}.', { montant: prix(ar.prorata.resteXof), date: dateDansLaPhrase(ar.prorata.dueIso) })}</p>
          : ar.prorata && <p className="ab-meta">{t('Votre avoir : {montant}, à valoir sur une prochaine séance.', { montant: prix(ar.prorata.avoirXof) })}</p>}
        {lienSolde}
      </div>
    );
  }
  const prochaine = ar.echeances.find((e) => e.statut === 'en-retard' || e.statut === 'a-regler-aujourdhui' || e.statut === 'a-venir');
  const pct = ar.prixVenduXof > 0 ? Math.min(100, Math.round((ar.regleXof / ar.prixVenduXof) * 100)) : 0;
  const derniere = [...ar.echeances].reverse().find((e) => e.statut === 'reglee');
  return (
    <div className="ab-card">
      <div className="ab-reg__haut">
        <span>{t('Réglé {regle} sur {prix}', { regle: prix(ar.regleXof), prix: prix(ar.prixVenduXof) })}</span>
        {ar.resteXof > 0 ? <b>{t('Reste {montant}', { montant: prix(ar.resteXof) })}</b> : <b className="is-ok">{t('Tout est réglé')}</b>}
      </div>
      <div className="ab-progres"><div style={{ width: `${pct}%` }} /></div>
      {prochaine ? (
        <>
          <p className="ab-meta" style={{ marginTop: 9 }}>
            {prochaine.statut === 'en-retard'
              ? t('{rang} échéance : {montant}, en attente depuis le {date}.', { rang: rangDit(prochaine.numero), montant: prix(prochaine.resteXof), date: dateDansLaPhrase(prochaine.dueIso) })
              : prochaine.statut === 'a-regler-aujourdhui'
                ? t('{rang} échéance : {montant}, à régler aujourd’hui, {date}.', { rang: rangDit(prochaine.numero), montant: prix(prochaine.resteXof), date: dateDansLaPhrase(prochaine.dueIso) })
                : t('{rang} échéance : {montant}, à régler le {date}. Vous recevrez un rappel la veille.', { rang: rangDit(prochaine.numero), montant: prix(prochaine.resteXof), date: dateDansLaPhrase(prochaine.dueIso) })}
          </p>
          <button type="button" className="mc-cta mc-cta--copper ab-court"
            onClick={() => onRegler({ subId: c.sub.id, montantXof: prochaine.resteXof, avantIso: prochaine.dueIso, objet: c.nom })}>
            {t('Régler {montant}', { montant: prix(prochaine.resteXof) })}
          </button>
        </>
      ) : ar.echeancierAPoser && (ar.aConvenirXof ?? 0) > 0 ? (
        <p className="ab-meta" style={{ marginTop: 9 }}>{t('Reste {montant}, à convenir avec la Maison : sans échéance datée, jamais en retard.', { montant: prix(ar.aConvenirXof ?? 0) })}</p>
      ) : derniere?.regleeLe ? (
        <p className="ab-meta" style={{ marginTop: 9 }}>{t('Tout est réglé, la dernière échéance le {date}.', { date: dateDansLaPhrase(derniere.regleeLe) })}</p>
      ) : null}
      {lienSolde}
    </div>
  );
}

/** CE QUI EST CONVENU, avec les mêmes mots qu'à l'achat (décisions 3, 4, 5, 9, 10). */
function Convenu({ c }: { c: ReleveDuContrat }) {
  const items: [string, string][] = c.mode === 'cycle' ? [
    [t('La lune'), t('Elle dure 30 jours et commence le jour du règlement. Elle se règle avant, au mois seulement.')],
    [t('Non réglée'), t('La formule se met en pause, sans dette. Elle reprend le jour où vous réglez.')],
    [t('Annuler ou déplacer'), t('Plus de 24 h avant : rien n’est compté. À moins de 24 h, ou absente : la séance est comptée et marquée « Manquée ». Pour un motif justifié, la Maison peut la rendre.')],
    [t('Déplacer à moins de 24 h'), t('Écrivez à la Maison : elle peut la déplacer sans la compter.')],
    [t('Résilier'), t('Quand vous voulez, daté, avec son motif. La lune en cours court jusqu’à son terme : vos séances restent réservables jusque-là. Une lune réglée d’avance et pas encore commencée devient un avoir ; rien ne sort de la caisse.')],
    [t('Le prix'), t('S’il est revu après le comptage de votre calibre, la Maison vous l’annonce ici et par WhatsApp avant la lune qui change.')],
  ] : [
    [t('Départ'), t('Le {date}.', { date: dateDansLaPhrase(c.debutIso) })],
    [t('Fin'), c.finIso ? t('Le {date}. Les séances non prises à cette date sont perdues.', { date: dateDansLaPhrase(c.finIso) }) : t('Les séances non prises à la date de fin sont perdues.')],
    [t('Annuler ou déplacer'), t('Plus de 24 h avant : rien n’est compté, la séance revient à votre formule.')],
    [t('À moins de 24 h, ou absente'), t('La séance est comptée et marquée « Manquée ». Pour un motif justifié, la Maison peut la rendre.')],
    [t('Reporter'), t('Vous déplacez une séance autant qu’il le faut, plus de 24 h avant, jusqu’à la date de fin. À moins de 24 h, écrivez à la Maison : elle peut la déplacer sans la compter.')],
    [t('Prolonger'), t('Sur demande, la Maison peut repousser la fin, avec un motif et une nouvelle date.')],
    [t('Résilier'), t('Ce que vous avez réglé au-delà des séances faites devient un avoir au prorata, arrondi au franc ; rien ne sort de la caisse. Si les séances faites dépassent ce que vous avez réglé, la différence est à régler le jour de la résiliation. La résiliation se demande à la Maison, datée, avec son motif.')],
    [t('Le prix'), t('S’il est revu après un nouveau comptage de votre calibre, la Maison vous l’annonce ici et par WhatsApp avant que vos échéances changent ; l’écart s’ajoute à la prochaine échéance, ou devient une échéance à 30 jours s’il n’en reste pas. En votre faveur, il se retranche de la prochaine échéance, ou devient un avoir.')],
  ];
  return (
    <div className="ab-verrou">
      <dl>{items.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    </div>
  );
}

/** Une formule passée, repliée : son état final, ses dates, ses séances faites. */
function Passee({ c, ouvert, onBascule }: { c: ReleveDuContrat; ouvert: boolean; onBascule: () => void }) {
  const comptees = c.attribuees.filter((s) => s.compte && (s.etat === 'faite' || s.etat === 'manquee'));
  const total = c.seances.reduce((m, l) => Math.max(m, l.incluses ?? 0), 0);
  const fin = c.etat === 'resiliee' && c.resilieeLe ? t('Résiliée le {date}', { date: dateDansLaPhrase(c.resilieeLe) })
    : c.etat === 'effacee' && c.effaceeLe ? t('Retenue non réglée, effacée le {date}', { date: dateDansLaPhrase(c.effaceeLe) })
      : c.finIso ? t('Terminée le {date}', { date: dateDansLaPhrase(c.finIso) }) : t(ETAT_FORMULE[c.etat].dit);
  return (
    <div className={`ab-pli ${ouvert ? 'is-ouvert' : ''}`}>
      <button type="button" className="ab-pli__tete" aria-expanded={ouvert} onClick={onBascule}>
        <span className="ab-pli__nom">{c.nom}</span>
        <span className="ab-pli__chev" aria-hidden="true">{ouvert ? '−' : '+'}</span>
        <span className="ab-pli__resume">{total
          ? t('{fin} · {n} séances sur {total} · {prix}', { fin, n: comptees.length, total, prix: prix(c.argent.prixVenduXof) })
          : t('{fin} · {prix}', { fin, prix: prix(c.argent.prixVenduXof) })}</span>
      </button>
      {ouvert && (
        <ol className="ab-seances">
          <li className="ab-s"><span /><span className="ab-s__t"><b>{c.reference}</b><span>{c.finIso
            ? t('Signée le {debut}, fin prévue le {fin}. Réglé {regle}.', { debut: dateDansLaPhrase(c.debutIso), fin: dateDansLaPhrase(c.finIso), regle: prix(c.argent.regleXof) })
            : t('Signée le {debut}. Réglé {regle}.', { debut: dateDansLaPhrase(c.debutIso), regle: prix(c.argent.regleXof) })}</span></span><span /></li>
          {comptees.map((s, i) => (
            <li key={s.id} className="ab-s">
              <span className={`ab-jeton ${s.etat === 'manquee' ? 'is-manquee' : 'is-faite'}`}>{s.etat === 'manquee' ? '×' : '✓'}</span>
              <span className="ab-s__t"><b>{t('Séance {n} · {mot}', { n: i + 1, mot: motDeLaSeance(s) })}</b><span>{dateLongue(s.date)}</span></span>
              <span />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function SesFormules({ releve, prenom, selecteur, onRegler, onRenoncer, onSolde, onOpenRdv, onReserverIncluse, onAcheter }: {
  releve: ReleveDeLAbonnee;
  prenom?: string;
  selecteur?: ReactNode;
  onRegler: (d: DemandeDeReglement) => void;
  onRenoncer?: (c: ReleveDuContrat) => void;
  onSolde: () => void;
  onOpenRdv: (id: string) => void;
  onReserverIncluse: () => void;
  onAcheter?: () => void;
}) {
  const [ouvert, setOuvert] = useState<string | null>(null);
  const bascule = (k: string) => setOuvert((o) => (o === k ? null : k));
  return (
    <div className="mc-fade">
      <div className="ab-tete">
        <div className="mc-micro-eyebrow">{t('Ma formule · ce qui est convenu')}</div>
        <h1 className="ab-titre">{prenom ? t('La formule de {prenom}.', { prenom }) : t('Ma formule.')}</h1>
      </div>
      <div className="ab-page">
        {selecteur}
        {releve.contrats.map((c) => (
          <div key={c.sub.id} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <CarteDuContrat c={c} prenom={prenom} onRegler={onRegler} onRenoncer={onRenoncer} />
            <div className="ab-lab">{prenom ? t('Ses séances') : t('Mes séances')}{c.mode === 'cycle' ? ` · ${t('cette lune')}` : ''}</div>
            {c.seances.map((l) => (
              <LigneDePrestation key={l.serviceId} c={c} l={l} ouvert={ouvert === `${c.sub.id}:${l.serviceId}`}
                onBascule={() => bascule(`${c.sub.id}:${l.serviceId}`)} onOpenRdv={onOpenRdv} onReserverIncluse={onReserverIncluse} />
            ))}
            <div className="ab-lab">{prenom ? t('Son règlement') : t('Mon règlement')}</div>
            <Reglement c={c} prenom={prenom} onRegler={onRegler} onSolde={onSolde} />
            <div className="ab-lab">{t('Ce qui est convenu')}</div>
            <Convenu c={c} />
          </div>
        ))}
        {!releve.contrats.length && (
          <div className="ab-card" style={{ borderStyle: 'dashed', textAlign: 'center' }}>
            <div className="mc-micro-eyebrow">{t('Aucune formule en cours')}</div>
            <p className="ab-mcf__nom" style={{ margin: '8px 0 6px' }}>{t('Vos séances d’avance, à un prix qui tient.')}</p>
            {onAcheter && <button type="button" className="mc-cta mc-cta--copper ab-court" onClick={onAcheter}>{t('Voir les formules')}</button>}
          </div>
        )}
        {releve.anciens.length > 0 && (
          <>
            <div className="ab-lab">{prenom ? t('Ses formules passées') : t('Mes formules passées')}</div>
            {releve.anciens.map((c) => (
              <Passee key={c.sub.id} c={c} ouvert={ouvert === `p:${c.sub.id}`} onBascule={() => bascule(`p:${c.sub.id}`)} />
            ))}
          </>
        )}
        {onAcheter && releve.contrats.length > 0 && (
          <button type="button" className="mc-cta mc-cta--quiet" onClick={onAcheter}>{t('Prendre une autre formule')}</button>
        )}
        <p className="ab-doute">{t('Un doute ? Écrivez à la Maison, on vous répond.')}</p>
      </div>
    </div>
  );
}
