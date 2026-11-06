import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { AttentionLue } from '../../shared/attentions-pur';
import { decaleLeJour, jourDeCotonou } from '../../shared/ia-faits-pur';
import { appelleLaMaison, dateCourte, dateDansLaPhrase } from './releve';
import { DENTELE } from './sceau';
import { t } from './i18n';
import './abonnee.css';

/* ══ MES ATTENTIONS · 6 novembre 2026 ═════════════════════════════════════
   « Les gens qui ont des abonnements ont une petite surprise à chaque fois
   […] qu'ils veulent découvrir. » (Yéman.) Maquette
   `public/maquette-l-abonnement-refait.html` : le pli scellé de l'accueil, et
   la page de ce que la Maison lui a réservé.

   LA SURPRISE SE GARDE AU SERVEUR. Cet écran ne lit aucune table : il demande
   `mes_attentions` (migration 0170), qui ne rend d'un panier scellé que sa
   date et son indice. Il n'importe ni les paniers ni la boutique de la
   Maison : des règles, il ne prend qu'un type.

   RIEN À OUVRIR SUR LE TÉLÉPHONE : le présent se remet au fauteuil, avec sa
   carte. Ma Couronne en garde la trace, avec le mot.

   Tant que la fonction n'est pas posée, ou que la Maison n'a rien validé,
   l'écran se tait : aucune promesse vide. */

type Reponse = { ok?: boolean; raison?: string; erreur?: string; attentions?: AttentionLue[] };

/** Ses attentions, relues à l'arrivée sur l'écran et à chaque retour dessus. */
export function useMesAttentions(teteId: string | undefined): AttentionLue[] {
  const [lues, setLues] = useState<AttentionLue[]>([]);
  const lis = useCallback(async () => {
    if (!teteId || teteId === 'c-local') return;
    const r = await appelleLaMaison<Reponse>('mes_attentions', { p_client_id: teteId });
    if (r.ok) setLues(Array.isArray(r.data.attentions) ? r.data.attentions : []);
  }, [teteId]);
  useEffect(() => {
    void lis();
    const auRetour = () => { if (document.visibilityState === 'visible') void lis(); };
    document.addEventListener('visibilitychange', auRetour);
    return () => document.removeEventListener('visibilitychange', auRetour);
  }, [lis]);
  /* Celles d'une autre tête, restées de l'écran d'avant, ne se montrent pas. */
  return teteId ? lues.filter((x) => x.clientId === teteId) : [];
}

function Sceau({ genre, glyphe, taille = 40 }: { genre: 'recue' | 'scellee' | 'or' | 'a-venir'; glyphe: string; taille?: number }) {
  return (
    <svg className={`ab-att__sceau ab-att__sceau--${genre}`} viewBox="0 0 100 100" width={taille} height={taille} aria-hidden="true" focusable="false">
      <path className="ab-att__fond" d={DENTELE} />
      <text className="ab-att__n" x="50" y="52" textAnchor="middle" dominantBaseline="central">{glyphe}</text>
    </svg>
  );
}

const minuscule = (s: string): string => s.replace(/^./, (c) => c.toLowerCase());
const servi = (r: { boire?: string; gout?: string }): string => [r.boire, r.gout].filter((x): x is string => !!x).map(minuscule).join(t(' et '));
const rangDit = (x: AttentionLue): string => (x.rang && x.total ? t('Séance {n} sur {total}', { n: x.rang, total: x.total }) : t('Séance de votre formule'));

/** Quand elle l'attend, dans ses mots à elle ou dans ceux de la tête qu'elle porte. */
function quand(x: Extract<AttentionLue, { etat: 'scellee' }>, jour: string, prenom?: string): string {
  if (x.arrivee) {
    return prenom
      ? t('{prenom} est à la Maison MND. Son attention lui est remise au fauteuil, avec sa carte.', { prenom })
      : t('Bienvenue à la Maison MND. Votre attention vous est remise au fauteuil, avec sa carte.');
  }
  if (x.date === jour) return prenom ? t('Son attention l’attend aujourd’hui, à son arrivée à la Maison MND.') : t('Elle vous attend aujourd’hui, à votre arrivée à la Maison MND.');
  if (x.date === decaleLeJour(jour, 1)) return prenom ? t('Son attention l’attend demain, à son arrivée à la Maison MND.') : t('Elle vous attend demain, à votre arrivée à la Maison MND.');
  return prenom
    ? t('La prochaine attention de {prenom} l’attend le {date}, à son arrivée à la Maison MND.', { prenom, date: dateDansLaPhrase(x.date) })
    : t('Votre prochaine attention vous attend le {date}, à votre arrivée à la Maison MND.', { date: dateDansLaPhrase(x.date) });
}

/** LE PLI DE L'ACCUEIL : reçue aujourd'hui, sinon scellée avec son indice. Rien, tant que rien n'est validé. */
export function PliDeLAttention({ teteId, prenom }: { teteId: string | undefined; prenom?: string }) {
  const lues = useMesAttentions(teteId);
  return <VueDuPli lues={lues} jour={jourDeCotonou()} prenom={prenom} />;
}

/** Le pli, tel qu'il se dessine pour ces attentions-là, ce jour-là. */
export function VueDuPli({ lues, jour, prenom }: { lues: readonly AttentionLue[]; jour: string; prenom?: string }) {
  const recue = lues.find((x) => x.etat === 'recue' && x.date === jour);
  const scellee = lues.find((x) => x.etat === 'scellee');
  const ouvre = () => { window.location.hash = '#/attentions'; };
  if (recue && recue.etat === 'recue') {
    const quoi = servi(recue.recu);
    return (
      <section className="ab-att ab-att--recue">
        <span className="ab-lab">{recue.or ? t('Le sceau d’or · reçu aujourd’hui') : t('Reçue aujourd’hui')}</span>
        {recue.recu.present && <h3 className="ab-att__titre">{recue.recu.present}</h3>}
        {recue.mot && <blockquote className="ab-att__mot">{recue.mot}</blockquote>}
        <span className="ab-meta">{t('La Maison MND · le mot de votre carte')}</span>
        {quoi && <span className="ab-meta">{t('Servi aujourd’hui : {quoi}.', { quoi })}</span>}
        <button type="button" className="ab-lien" onClick={ouvre}>{t('Mes attentions')} →</button>
      </section>
    );
  }
  if (!scellee || scellee.etat !== 'scellee') return null;
  return (
    <section className={`ab-att ab-att--scellee ${scellee.or ? 'is-or' : ''}`}>
      <Sceau genre={scellee.or ? 'or' : 'scellee'} glyphe="✦" taille={54} />
      <div className="ab-att__corps">
        <span className="ab-lab">{scellee.or ? t('Le sceau d’or') : t('L’attention')}</span>
        <p className="ab-att__phrase">{quand(scellee, jour, prenom)}</p>
        {scellee.indice && <p className="ab-att__indice">{t('Indice : {indice}.', { indice: scellee.indice })}</p>}
        <button type="button" className="ab-lien" onClick={ouvre}>{t('Mes attentions')} →</button>
      </div>
    </section>
  );
}

/** Le lien vers la page, là où le pli ne se montre pas : seulement si elle a quelque chose à y lire. */
export function LienVersMesAttentions({ teteId }: { teteId: string | undefined }) {
  const lues = useMesAttentions(teteId);
  if (lues.length === 0) return null;
  return <button type="button" className="ab-lien" onClick={() => { window.location.hash = '#/attentions'; }}>{t('Mes attentions')} →</button>;
}

/** LA PAGE : ce qu'elle a reçu, avec le mot de chaque carte ; la prochaine, scellée ; les suivantes, à venir. */
export default function MesAttentions({ teteId, prenom, selecteur, onClose }: {
  teteId: string | undefined;
  prenom?: string;
  /** Le sélecteur de tête, quand elle porte un enfant. */
  selecteur?: ReactNode;
  onClose: () => void;
}) {
  const lues = useMesAttentions(teteId);
  return <VueDesAttentions lues={lues} jour={jourDeCotonou()} prenom={prenom} selecteur={selecteur} onClose={onClose} />;
}

/** La page, telle qu'elle se dessine pour ces attentions-là, ce jour-là. */
export function VueDesAttentions({ lues, jour, prenom, selecteur, onClose }: {
  lues: readonly AttentionLue[];
  jour: string;
  prenom?: string;
  selecteur?: ReactNode;
  onClose: () => void;
}) {
  const recues = lues.filter((x) => x.etat === 'recue').reverse();
  const aVenir = lues.filter((x) => x.etat !== 'recue');
  return (
    <div className="mc-overlayscreen mc-slide" style={{ zIndex: 44 }}>
      <div className="mc-flowhead">
        <div className="mc-flowhead__row">
          <button type="button" className="mc-linkback" onClick={onClose}>← {t('Retour')}</button>
          <button type="button" className="mc-x" aria-label={t('Fermer')} onClick={onClose}>✕</button>
        </div>
        <div className="mc-micro-eyebrow" style={{ marginTop: 10 }}>{t('Mes attentions')}</div>
        <h1 className="mc-flowhead__h1">{prenom ? t('Ce que la Maison réserve à {prenom}.', { prenom }) : t('Ce que la Maison vous a réservé.')}</h1>
      </div>
      <div className="mc-scroll mc-flowbody">
        <div className="ab-page" style={{ padding: 0 }}>
          {selecteur}
          {lues.length === 0 && (
            <div className="ab-vide">
              <div className="ab-vide__g" aria-hidden="true">✦</div>
              <div className="ab-vide__t">{t('Rien ici pour l’instant.')}</div>
              <div className="ab-vide__s">{t('Une attention se remet au fauteuil, à chaque séance d’une formule. Elle se retrouve ici ensuite, avec le mot de sa carte.')}</div>
            </div>
          )}
          {aVenir.map((x) => (x.etat === 'scellee' ? (
            <div key={x.apptId} className={`ab-att ab-att--scellee ${x.or ? 'is-or' : ''}`}>
              <Sceau genre={x.or ? 'or' : 'scellee'} glyphe="✦" taille={46} />
              <div className="ab-att__corps">
                <span className="ab-lab">{rangDit(x)} · {x.or ? t('le sceau d’or') : t('scellée')}</span>
                <p className="ab-att__phrase">{quand(x, jour, prenom)}</p>
                {x.indice && <p className="ab-att__indice">{t('Indice : {indice}.', { indice: x.indice })}</p>}
              </div>
            </div>
          ) : (
            <div key={x.apptId} className="ab-att ab-att--avenir">
              <Sceau genre="a-venir" glyphe={x.rang ? String(x.rang) : '·'} taille={34} />
              <div className="ab-att__corps">
                <span className="ab-lab">{rangDit(x)}{x.or ? ` · ${t('le sceau d’or')}` : ''}</span>
                <span className="ab-meta">{t('À venir · {date}', { date: dateCourte(x.date) })}</span>
              </div>
            </div>
          )))}
          {recues.length > 0 && <span className="ab-lab">{t('Ce que vous avez reçu')}</span>}
          {recues.map((x) => (x.etat === 'recue' ? (
            <div key={x.apptId} className="ab-att ab-att--recue">
              <div className="ab-att__tete">
                <Sceau genre={x.or ? 'or' : 'recue'} glyphe={x.rang ? String(x.rang) : '✓'} taille={38} />
                <div className="ab-att__corps">
                  <span className="ab-lab">{rangDit(x)} · {dateCourte(x.date)}</span>
                  {x.recu.present && <h3 className="ab-att__titre">{x.recu.present}</h3>}
                </div>
              </div>
              {x.mot && <blockquote className="ab-att__mot">{x.mot}</blockquote>}
              {servi(x.recu) && <span className="ab-meta">{t('Servi ce jour-là : {quoi}.', { quoi: servi(x.recu) })}</span>}
            </div>
          ) : null))}
        </div>
      </div>
    </div>
  );
}
