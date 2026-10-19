import { useEffect, useMemo, useState } from 'react';
import { Card, Input, toast } from '../../../../ds/components';
import { Toggle } from '../equipe/ui';
import { useStore } from '../../../../shared/store';
import { useAuth } from '../../../../shared/auth';
import { useCategories, useProducts, useServices } from '../../../../shared/catalog';
import { autoConfigStore } from '../equipe/data';
import { useEstDirection } from '../_vie';
import {
  GARDE_DES_PHOTOS_JOURS, MOTS_DE_PRODUIT, PLAFOND_DU_DIAGNOSTIC_USD, TABLE_PAR_DEFAUT,
  apercuDeLaLigne, dateDuDiagnostic, motsDeLaSaisie, observationDite, tableEstValidee, tableValide,
  type Catalogue, type DocDeLaTable, type LigneDeLaTable,
} from '../../../../shared/ia-diagnostic-pur';
import { ecrisLaTableDuDiagnostic, lisLaTableDuDiagnostic } from '../../../../shared/diagnostics-au-trone';
import { etatDeLaFonction } from '../../../../shared/diagnostic-locks';

/* ══ LE DIAGNOSTIC PHOTO, SES RÉGLAGES — 19 octobre 2026 ═════════════════
   Ses décisions du 19 au soir : le diagnostic reste FERMÉ aux clientes tant
   que la direction ne l'allume pas (l'interrupteur, éteint par défaut, dans
   `mnd_auto_config.diagnosticPhoto`) ; la recommandation suit le catalogue
   du Trône par une table « observation → rituel → produit » écrite par
   défaut, marquée « à valider », que la direction corrige ici.

   La base garde les deux (0137) : hors direction, l'interrupteur reprend sa
   valeur et la table refuse l'écriture. Ici, on ne fait que le dire, et le
   montrer en lecture au reste du personnel. La table ne passe pas par la
   synchro des documents (voir `diagnostics-au-trone`) : elle se lit à
   l'ouverture et s'écrit sur « Enregistrer ». */

const texteDe = (mots: readonly string[]): string => mots.join(', ');

export function CarteDiagnosticPhoto() {
  const estDirection = useEstDirection();
  const { session } = useAuth();
  const [cfg, setCfg] = useStore(autoConfigStore);
  const [services] = useServices();
  const [categories] = useCategories();
  const [produits] = useProducts();
  const [doc, setDoc] = useState<unknown>(null);
  const [lue, setLue] = useState<'' | 'charge' | 'ok' | 'echec'>('');
  const [saisie, setSaisie] = useState<Record<string, { rituel: string; produits: string }>>({});
  const [verdict, setVerdict] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  const allume = (cfg as { diagnosticPhoto?: unknown }).diagnosticPhoto === true;
  const table = useMemo(() => tableValide(doc), [doc]);
  const validee = tableEstValidee(doc);
  const catalogue: Catalogue = useMemo(() => ({ services, categories, products: produits }), [services, categories, produits]);

  useEffect(() => {
    let vivant = true;
    setLue('charge');
    void lisLaTableDuDiagnostic().then(({ doc: d, erreur }) => {
      if (!vivant) return;
      setDoc(d);
      setLue(erreur ? 'echec' : 'ok');
    });
    return () => { vivant = false; };
  }, []);

  const bascule = () => {
    if (!estDirection) { toast('Ce réglage appartient à la direction.'); return; }
    setCfg((c) => ({ ...c, diagnosticPhoto: !allume } as typeof c));
    toast(allume ? 'Diagnostic photo éteint : les clientes ne le voient plus.' : 'Diagnostic photo allumé : La Consultation et Ma Couronne le proposent.');
  };

  const ligneSaisie = (l: LigneDeLaTable) => saisie[l.observation] ?? { rituel: texteDe(l.rituel), produits: texteDe(l.produits) };
  const change = (l: LigneDeLaTable, champ: 'rituel' | 'produits', v: string) =>
    setSaisie((s) => ({ ...s, [l.observation]: { ...ligneSaisie(l), [champ]: v } }));
  const lignesSaisies = (): LigneDeLaTable[] => table.map((l) => {
    const s = ligneSaisie(l);
    return { observation: l.observation, rituel: motsDeLaSaisie(s.rituel, 8), produits: motsDeLaSaisie(s.produits, 4) };
  });

  const ecris = async (nouveau: DocDeLaTable, dit: string) => {
    if (!estDirection) { toast('La table du diagnostic appartient à la direction.'); return; }
    setOccupe(true);
    const r = await ecrisLaTableDuDiagnostic(nouveau);
    setOccupe(false);
    if (r) { toast(r); return; }
    setDoc(nouveau);
    setSaisie({});
    toast(dit);
  };
  const enregistre = () => void ecris({ lignes: lignesSaisies() }, 'Table enregistrée, toujours à valider.');
  const valide = () => void ecris({ lignes: lignesSaisies(), valideeLe: new Date().toISOString(), ...(session?.user?.email ? { valideePar: session.user.email } : {}) }, 'Table validée.');
  const parDefaut = () => void ecris({ lignes: TABLE_PAR_DEFAUT.map((l) => ({ ...l, rituel: [...l.rituel], produits: [...l.produits] })) }, 'Table par défaut remise, à valider.');

  const verifie = async () => {
    setVerdict('Je demande à la fonction…');
    const e = await etatDeLaFonction();
    setVerdict(!e.posee
      ? 'La fonction diagnostic-locks ne répond pas : elle n’est pas encore posée (Verify JWT éteint).'
      : `diagnostic-locks ${e.version} répond ; elle lit l’interrupteur ${e.ouvert ? 'allumé' : 'éteint'}.`);
  };

  const modifiee = Object.keys(saisie).length > 0;

  return (
    <Card className="sys-section" style={{ marginTop: 18 }} data-diagnostic="reglages">
      <div className="sys-section__title">Le diagnostic photo</div>
      <div className="sys-section__cap" style={{ maxWidth: 680 }}>
        Une cliente de La Consultation (réglée en ligne) ou de Ma Couronne envoie une à quatre photos de ses locks ;
        elle lit aussitôt une première lecture « à confirmer en consultation », qu’un maître de la direction ou de
        l’Atelier relit dans la journée (Consultations). Jamais un avis médical : une peau qui inquiète ne propose
        rien et l’équipe est prévenue. Les photos s’effacent à {GARDE_DES_PHOTOS_JOURS} jours ; les lectures ont
        leur plafond à part, {PLAFOND_DU_DIAGNOSTIC_USD} $ par mois.
      </div>

      <div className="sys-row">
        <div>
          <div className="sys-row__label">Proposer le diagnostic photo aux clientes</div>
          <div className="sys-row__sub">
            {allume
              ? 'Allumé : La Consultation et Ma Couronne le proposent.'
              : 'Éteint : les clientes ne le voient nulle part. À allumer quand la migration 0137 et la fonction diagnostic-locks sont posées.'}
            {!estDirection && ' Ce réglage appartient à la direction.'}
          </div>
        </div>
        <Toggle on={allume} onToggle={bascule} />
      </div>
      <div className="sys-row">
        <div>
          <div className="sys-row__label">Vérifier le branchement</div>
          <div className="sys-row__sub">{verdict ?? 'Demande à la fonction ce qu’elle voit, sans rien lire ni envoyer.'}</div>
        </div>
        <button type="button" className="mnd-btn mnd-btn--ghost mnd-btn--sm" onClick={() => void verifie()}>Vérifier</button>
      </div>

      <div style={{ borderTop: '1px solid var(--hairline)', marginTop: 16, paddingTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--color-indigo)' }}>Observation, rituel, produit</span>
          {validee ? (
            <span className="tre-chip is-on" style={{ cursor: 'default' }}>Validée le {dateDuDiagnostic((doc as DocDeLaTable).valideeLe)}</span>
          ) : (
            <span className="tre-chip" style={{ cursor: 'default', borderColor: 'var(--copper-300)', color: 'var(--copper-700)', background: 'var(--copper-50)' }}>À valider</span>
          )}
        </div>
        <div className="mnd-muted" style={{ fontSize: 12, marginTop: 2, lineHeight: 1.5, maxWidth: 680 }}>
          Pour chaque observation, les mots qui reconnaissent un rituel dans le catalogue (son nom ou son atelier) et
          ceux qui reconnaissent un produit ({MOTS_DE_PRODUIT.join(', ')}). Une case produit vide ne propose aucun
          produit. Trois rituels et deux produits au plus par lecture ; un produit sans stock ne se propose pas.
          {lue === 'echec' && ' La table ne se lit pas : la migration 0137 est-elle collée ? La fonction prend la table par défaut.'}
        </div>

        <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
          {table.map((l) => {
            const s = ligneSaisie(l);
            const apercu = apercuDeLaLigne({ observation: l.observation, rituel: motsDeLaSaisie(s.rituel, 8), produits: motsDeLaSaisie(s.produits, 4) }, catalogue);
            return (
              <div key={l.observation} style={{ display: 'grid', gap: 6, gridTemplateColumns: 'minmax(140px, 180px) 1fr 1fr', alignItems: 'start' }} data-ligne={l.observation}>
                <div style={{ fontSize: 13.5, paddingTop: 8 }}>{observationDite(l.observation)}</div>
                <label className="mnd-field">
                  <span className="mnd-field__label">Rituel (mots)</span>
                  <Input value={s.rituel} disabled={!estDirection} onChange={(e) => change(l, 'rituel', e.target.value)} />
                  <span className="mnd-muted" style={{ fontSize: 11 }}>{apercu.rituels.length ? apercu.rituels.map((r) => r.nom).join(' · ') : 'Aucun rituel du catalogue ne répond.'}</span>
                </label>
                <label className="mnd-field">
                  <span className="mnd-field__label">Produits (mots)</span>
                  <Input value={s.produits} disabled={!estDirection} onChange={(e) => change(l, 'produits', e.target.value)} />
                  <span className="mnd-muted" style={{ fontSize: 11 }}>{apercu.produits.length ? apercu.produits.map((p) => p.nom).join(' · ') : 'Aucun produit proposé.'}</span>
                </label>
              </div>
            );
          })}
        </div>

        {estDirection && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            <button type="button" className="mnd-btn mnd-btn--sm" disabled={occupe || lue === 'charge'} onClick={valide}>Valider la table</button>
            <button type="button" className="mnd-btn mnd-btn--ghost mnd-btn--sm" disabled={occupe || !modifiee} onClick={enregistre}>Enregistrer sans valider</button>
            <button type="button" className="mnd-btn mnd-btn--ghost mnd-btn--sm" disabled={occupe} onClick={parDefaut}>Revenir à la table par défaut</button>
          </div>
        )}
      </div>
    </Card>
  );
}
