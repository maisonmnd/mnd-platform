import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHead } from '../_ui';
import { Button, Field, toast, demande } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { useClients, useFamilies } from '../../../../shared/clients';
import { holderOf } from '../../../../shared/accounts';
import { useCashboxes, usePaymentMethods, caisseParDefaut } from '../../../../shared/finance';
import { fmtMoney } from '../../../../shared/currency';
import { cheminDeLaConversation, numeroWa } from '../../../../shared/conversations';
import { appelDe } from '../../../../shared/civilite';
import { KKIAPAY_CASHBOX } from '../../../../shared/kkiapay';
import {
  useCartesCadeaux, etatDeLaCarte, ETAT_DIT, objetDeLaCarte, messageDeLaCarte, montantTape, nouvelIdDeCarte,
  type CarteCadeau, type EtatDeCarte,
} from '../../../../shared/cartes-cadeaux';
import { ClientPicker } from '../clients/_shared';
import { useEstDirection } from '../_vie';
import { encaisseLaCarte, vendsUneCarte, marqueRemise, remplaceLeCode, prolonge, ecarte } from './cartes-actions';
import { RattacherUneCarte } from './RattacherUneCarte';
import './vente.css';

/* ══ LES CARTES CADEAUX — 2 octobre 2026 ═════════════════════════════════
   Maquette « La carte cadeau en ligne », validée (« construis »).

   TOUTES LES CARTES AU MÊME ENDROIT, réglées en ligne ou à la Maison. Ce que
   la Maison doit encore en soins se lit d'un coup d'œil. Une commande du
   site (un geste, ou « je règle à la Maison ») arrive « à régler » ;
   l'encaisser fait naître son code. Une carte réglée attend d'être remise,
   puis la visite de sa bénéficiaire, où elle devient son avoir. */

const jour = (iso?: string): string =>
  iso ? new Date(iso.length > 10 ? iso : `${iso}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

const A_TRAITER: readonly EtatDeCarte[] = ['a-regler', 'a-envoyer', 'a-remettre', 'echue'];

type Encaisser = { carte: CarteCadeau; neuve: boolean; montant: string; cashbox: string; methode: string };

export default function CartesCadeaux() {
  const navigate = useNavigate();
  const { branch, currency } = useBranch();
  const [cartes] = useCartesCadeaux();
  const [clients] = useClients();
  const [families] = useFamilies();
  const [cashboxes] = useCashboxes();
  const [methods] = usePaymentMethods();
  const estDirection = useEstDirection();
  const [vue, setVue] = useState<'traiter' | 'toutes'>('traiter');
  const [enc, setEnc] = useState<Encaisser | null>(null);
  const [rattacher, setRattacher] = useState<{ clientId: string } | null>(null);
  const aujourdhui = new Date().toISOString();

  const siennes = useMemo(
    () => cartes.filter((c) => c.branchId === branch.id).sort((a, b) => (b.payeLe ?? b.creeLe).localeCompare(a.payeLe ?? a.creeLe)),
    [cartes, branch.id],
  );
  const etat = (c: CarteCadeau) => etatDeLaCarte(c, aujourdhui);
  const compte = (e: EtatDeCarte[]) => siennes.filter((c) => e.includes(etat(c))).length;
  /* CE QUE LA MAISON DOIT ENCORE EN SOINS : les cartes réglées que personne
     n'est encore venu dépenser. Une carte rattachée vit dans l'avoir de sa
     fiche, avec le reste de son compte. */
  const encoreDu = siennes
    .filter((c) => ['a-envoyer', 'a-remettre', 'attend-sa-visite'].includes(etat(c)))
    .reduce((s, c) => s + (c.montantXof ?? 0), 0);
  const liste = vue === 'traiter' ? siennes.filter((c) => A_TRAITER.includes(etat(c))) : siennes.filter((c) => etat(c) !== 'annulee');

  const boxes = cashboxes.filter((b) => b.branchId === branch.id);
  const ouvreEncaisser = (c: CarteCadeau, neuve = false) => setEnc({
    carte: c, neuve, montant: c.montantXof ? String(c.montantXof) : '',
    cashbox: caisseParDefaut(cashboxes, branch.id, currency)?.name ?? boxes[0]?.name ?? '',
    methode: methods[0] ?? 'Espèces',
  });
  const vendre = () => ouvreEncaisser({
    id: nouvelIdDeCarte(), branchId: branch.id, creeLe: new Date().toISOString(), origine: 'trone',
    objet: 'montant', modele: 'medaillon', pour: '', de: '', remise: 'numerique', telephone: '', statut: 'a-regler',
  }, true);

  const valideEncaisser = () => {
    if (!enc) return;
    const montant = montantTape(enc.montant);
    if (montant <= 0) { toast('Écrivez le montant de la carte.'); return; }
    if (!enc.cashbox) { toast('Choisissez la caisse qui reçoit l’argent.'); return; }
    const o = { montantXof: montant, cashbox: enc.cashbox, methode: enc.methode };
    const code = enc.neuve ? vendsUneCarte(enc.carte, o) : encaisseLaCarte(enc.carte, o);
    setEnc(null);
    toast(`Carte réglée. Son code : ${code}.`);
  };

  const ecrire = (c: CarteCadeau, avecLaCarte: boolean) => {
    const fiche = clients.find((x) => numeroWa(x.phone) === numeroWa(c.telephone));
    const appel = appelDe(fiche, c.de);
    const texte = avecLaCarte
      ? messageDeLaCarte(c, appel)
      : `Bonjour ${appel},\nmerci pour votre commande de carte cadeau pour ${c.pour || 'votre proche'}. Nous la préparons avec vous.`;
    const chemin = cheminDeLaConversation(c.telephone, texte);
    if (!chemin) { toast('Cette commande n’a pas de numéro.'); return; }
    navigate(chemin);
  };

  const ecarteLa = async (c: CarteCadeau) => {
    if (!await demande({
      quoi: 'Carte cadeau', titre: 'Écarter cette commande ?',
      dit: `La commande pour ${c.pour || '?'}, de la part de ${c.de || '?'}, sort du registre. Elle n’a jamais été réglée.`,
      accepter: 'Écarter', refuser: 'La garder',
    })) return;
    ecarte(c, 'Écartée au Trône');
    toast('Commande écartée.');
  };

  const remplace = async (c: CarteCadeau) => {
    if (!await demande({
      quoi: 'Carte cadeau', titre: 'Remplacer le code de cette carte ?',
      dit: `L’ancien code ${c.code ?? ''} ne vaudra plus rien. La carte garde son montant et sa date.`,
      suite: 'À faire quand une carte est perdue, ou que son code a circulé.',
      accepter: 'Remplacer le code', refuser: 'Garder', dur: true,
    })) return;
    toast(`Nouveau code : ${remplaceLeCode(c)}.`);
  };

  const fiche = rattacher ? clients.find((c) => c.id === rattacher.clientId) : undefined;

  return (
    <div className="tr-page trcc-page">
      <PageHead
        eyebrow="Vente & Caisse · ce que l’on offre"
        title="Les cartes cadeaux."
        actions={(
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Button variant="ghost" size="sm" onClick={() => setRattacher({ clientId: '' })}>Rattacher une carte</Button>
            <Button variant="copper" size="sm" onClick={vendre}>Vendre une carte</Button>
          </div>
        )}
      />

      <div className="trcc-compte">
        <div><small>À régler</small><b>{compte(['a-regler'])}</b></div>
        <div className={compte(['a-envoyer', 'a-remettre']) > 0 ? 'est-vif' : ''}><small>À envoyer ou remettre</small><b>{compte(['a-envoyer', 'a-remettre'])}</b></div>
        <div><small>Attendent leur visite</small><b>{compte(['attend-sa-visite'])}</b></div>
        <div><small>Sur une fiche</small><b>{compte(['sur-sa-fiche'])}</b></div>
        <div><small>Encore dû en soins</small><b>{fmtMoney(encoreDu, currency)}</b></div>
      </div>

      <div className="trc-tabs" style={{ marginBottom: 12 }}>
        <button type="button" className={`trc-tab${vue === 'traiter' ? ' is-active' : ''}`} onClick={() => setVue('traiter')}>À traiter</button>
        <button type="button" className={`trc-tab${vue === 'toutes' ? ' is-active' : ''}`} onClick={() => setVue('toutes')}>Toutes</button>
      </div>

      {liste.length === 0 ? (
        <div className="trcc-vide">
          {vue === 'traiter'
            ? 'Rien à traiter. Une carte réglée en ligne sur maisonmnd.com, ou commandée pour être réglée à la Maison, arrive ici.'
            : 'Aucune carte pour l’instant. Les cartes du site arrivent ici ; « Vendre une carte » en crée une au comptoir.'}
        </div>
      ) : (
        <div className="trcc-liste">
          {liste.map((c) => {
            const e = etat(c);
            return (
              <div key={c.id} className="trcc-ligne">
                <div className="trcc-ligne__code">
                  {c.code ?? <span className="trcc-muet">pas encore de code</span>}
                  <small>{c.origine === 'en-ligne' ? (c.payeLe ? 'réglée en ligne' : 'paiement en ligne non abouti') : c.origine === 'maison' ? 'commandée sur le site' : 'vendue au comptoir'}</small>
                </div>
                <div className="trcc-ligne__qui">
                  <b>Pour {c.pour || '?'}</b>
                  <small>de {c.de || '?'} · {c.remise === 'imprimee' ? 'imprimée' : 'numérique'}{c.telephone ? <> · <span style={{ whiteSpace: 'nowrap' }}>{c.telephone}</span></> : ''}</small>
                  {c.mot && <small className="trcc-mot">« {c.mot} »</small>}
                </div>
                <div className="trcc-ligne__valeur">
                  {c.montantXof ? fmtMoney(c.montantXof, currency) : objetDeLaCarte(c)}
                  <small>{c.payeLe ? `${c.methode ?? ''} · ${jour(c.payeLe)}` : `commande du ${jour(c.creeLe)}`}</small>
                  {c.valableJusquau && <small>jusqu’au {jour(c.valableJusquau)}</small>}
                </div>
                <div className="trcc-ligne__etat"><span className={`trcc-etq trcc-etq--${e}`}>{ETAT_DIT[e]}</span></div>
                <div className="trcc-ligne__gestes">
                  {e === 'a-regler' && (
                    <>
                      <button type="button" className="trcc-geste trcc-geste--fort" onClick={() => ouvreEncaisser(c)}>Encaisser</button>
                      <button type="button" className="trcc-geste" onClick={() => ecrire(c, false)}>Écrire</button>
                      <button type="button" className="trcc-geste" onClick={() => void ecarteLa(c)}>Écarter</button>
                    </>
                  )}
                  {(e === 'a-envoyer' || e === 'a-remettre' || e === 'attend-sa-visite') && (
                    <>
                      <button type="button" className={`trcc-geste${e === 'a-envoyer' ? ' trcc-geste--fort' : ''}`} onClick={() => ecrire(c, true)}>Envoyer sur WhatsApp</button>
                      {e !== 'attend-sa-visite' && <button type="button" className="trcc-geste" onClick={() => { marqueRemise(c); toast('Carte remise.'); }}>C’est remis</button>}
                      <button type="button" className="trcc-geste" onClick={() => setRattacher({ clientId: '' })}>Rattacher</button>
                      {estDirection && <button type="button" className="trcc-geste" onClick={() => void remplace(c)}>Remplacer le code</button>}
                    </>
                  )}
                  {e === 'sur-sa-fiche' && c.clientId && (
                    <button type="button" className="trcc-geste" onClick={() => navigate(`/customers?id=${c.clientId}`)}>Ouvrir sa fiche</button>
                  )}
                  {e === 'echue' && estDirection && (
                    <button type="button" className="trcc-geste trcc-geste--fort" onClick={() => { prolonge(c); toast('Carte prolongée d’un an.'); }}>Prolonger d’un an</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {enc && (
        <div className="trc-modal-fond" onClick={() => setEnc(null)}>
          <div className="trc-modal" onClick={(ev) => ev.stopPropagation()}>
            <div className="trc-modal__t">{enc.neuve ? 'Vendre une carte cadeau' : 'Encaisser la carte'}</div>
            {!enc.neuve && (
              <p className="trc-sub" style={{ marginTop: 0 }}>
                Pour <b>{enc.carte.pour || '?'}</b>, de la part de <b>{enc.carte.de || '?'}</b>
                {enc.carte.objet === 'geste' && enc.carte.geste ? <> · <b>{enc.carte.geste}</b> : écrivez le prix du geste.</> : '.'}
              </p>
            )}
            <div style={{ display: 'grid', gap: 10 }}>
              {enc.neuve && (
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 10 }}>
                  <Field label="Pour"><input className="mnd-input" value={enc.carte.pour} onChange={(ev) => setEnc({ ...enc, carte: { ...enc.carte, pour: ev.target.value } })} /></Field>
                  <Field label="De la part de"><input className="mnd-input" value={enc.carte.de} onChange={(ev) => setEnc({ ...enc, carte: { ...enc.carte, de: ev.target.value } })} /></Field>
                  <Field label="Son numéro WhatsApp"><input className="mnd-input" inputMode="tel" value={enc.carte.telephone} onChange={(ev) => setEnc({ ...enc, carte: { ...enc.carte, telephone: ev.target.value } })} /></Field>
                  <Field label="Remise">
                    <select className="mnd-input" value={enc.carte.remise} onChange={(ev) => setEnc({ ...enc, carte: { ...enc.carte, remise: ev.target.value === 'imprimee' ? 'imprimee' : 'numerique' } })}>
                      <option value="numerique">Numérique, sur WhatsApp</option>
                      <option value="imprimee">Imprimée, à retirer</option>
                    </select>
                  </Field>
                </div>
              )}
              <Field label={`Montant de la carte · ${currency}`}>
                <input className="mnd-input" inputMode="numeric" value={enc.montant} onChange={(ev) => setEnc({ ...enc, montant: ev.target.value })} placeholder="25 000" />
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 10 }}>
                <Field label="Caisse qui reçoit">
                  <select className="mnd-input" value={enc.cashbox} onChange={(ev) => setEnc({ ...enc, cashbox: ev.target.value })}>
                    {boxes.filter((b) => b.name !== KKIAPAY_CASHBOX).map((b) => <option key={b.id} value={b.name}>{b.name}</option>)}
                  </select>
                </Field>
                <Field label="Moyen">
                  <select className="mnd-input" value={enc.methode} onChange={(ev) => setEnc({ ...enc, methode: ev.target.value })}>
                    {methods.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </Field>
              </div>
              <p className="trc-sub" style={{ margin: 0, fontSize: 12 }}>
                L’argent entre dans cette caisse aujourd’hui, comme un avoir que porte la carte. À la première visite, il passe sur la fiche de la bénéficiaire.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14, flexWrap: 'wrap' }}>
              <Button variant="ghost" size="sm" onClick={() => setEnc(null)}>Annuler</Button>
              <Button variant="copper" size="sm" onClick={valideEncaisser}>Encaisser et créer le code</Button>
            </div>
          </div>
        </div>
      )}

      {rattacher && (
        <div className="trc-modal-fond" onClick={() => setRattacher(null)}>
          <div className="trc-modal" onClick={(ev) => ev.stopPropagation()}>
            <div className="trc-modal__t">Rattacher une carte</div>
            <p className="trc-sub" style={{ marginTop: 0 }}>
              La carte devient l’avoir de la personne soignée (ou du compte famille qui paie). Elle se dépense ensuite à l’encaissement, en une ou plusieurs fois.
            </p>
            <Field label="La bénéficiaire">
              <ClientPicker value={rattacher.clientId} onChange={(id) => setRattacher({ clientId: id })} placeholder="Chercher sa fiche…" />
            </Field>
            <div style={{ marginTop: 10 }}>
              <RattacherUneCarte
                porteur={fiche ? holderOf(fiche, families) : null}
                clientId={fiche?.id ?? ''}
                nom={fiche ? fiche.name.split(' ')[0] : 'elle'}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
              <Button variant="ghost" size="sm" onClick={() => setRattacher(null)}>Fermer</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
