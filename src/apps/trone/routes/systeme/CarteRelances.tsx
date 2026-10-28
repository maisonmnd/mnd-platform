import { useMemo, useState } from 'react';
import { Card, toast } from '../../../../ds/components';
import { Toggle } from '../equipe/ui';
import { supabase } from '../../../../shared/supabase';
import { useSettings } from '../../../../shared/settings';
import { useClients } from '../../../../shared/clients';
import { fmtMoney } from '../../../../shared/currency';
import { invoiceResteXof, quiEncaisse, useInvoices } from '../../../../shared/finance';
import { jourDit } from '../../../../shared/gestes-conversation';
import { jourLocal } from '../../../../shared/mnd-pay-pur';
import {
  CADENCE_DES_FAMILLES, CADENCE_DES_RELANCES, JOURS_AU_PLUS, JOURS_DE_RATTRAPAGE, RELANCES_AU_PLUS, jourPlusR, rythmeDe, rythmeValide, seRelance,
  type ReglagesRelances,
} from '../../../../shared/relances-pur';
import { useEstDirection } from '../_vie';

/* ══ LES RELANCES DES FACTURES, LEUR INTERRUPTEUR — 18 octobre 2026 ═════
   Maquette « Les relances » validée. La direction les allume ici : le jour
   du lancement s'écrit alors, et seules les factures de ce jour et après se
   relancent d'office. Les trente jours d'avant attendent une liste qu'elle
   valide UNE fois (sa décision) : rien ne part en vague au lancement.
   Rien ne part non plus tant que le modèle Meta `rappel_de_reglement` n'est
   pas approuvé, la fonction `relances-factures` posée et son réveil de 10 h
   créé : « Vérifier » demande à la fonction ce qu'elle voit. */
export function CarteRelances() {
  const [settings, setSettings] = useSettings();
  const [factures] = useInvoices();
  const [clients] = useClients();
  const estDirection = useEstDirection();
  const r: ReglagesRelances = settings.relances ?? {};
  const pose = (patch: Partial<ReglagesRelances>) => setSettings((s) => ({ ...s, relances: { ...(s.relances ?? {}), ...patch } }));
  const aujourdhui = jourLocal(new Date().toISOString());
  const [verdict, setVerdict] = useState<string | null>(null);
  const [ecartees, setEcartees] = useState<Set<string>>(new Set());
  /* LES RYTHMES (28 octobre 2026) : « 1, 3, 7, 14 » se tape, se relit, s'enregistre. */
  const dit = (c: readonly number[]) => c.join(', ');
  const [saisie, setSaisie] = useState<{ seule: string; famille: string }>(() => ({ seule: dit(rythmeDe(r, false)), famille: dit(rythmeDe(r, true)) }));
  const lu = (t: string) => rythmeValide(t.split(/[^\d]+/).filter(Boolean).map(Number));

  const tapGoPret = settings.mndPay?.actif === true && settings.mndPay?.tapgo?.actif !== false;

  /* LE RATTRAPAGE : les factures des trente jours d'avant le lancement qui
     restent à régler, toutes cochées ; on décoche celles à épargner. */
  const aRattraper = useMemo(() => {
    if (!r.actives || !r.depuis || r.rattrapage) return [];
    const plancher = jourPlusR(r.depuis, -JOURS_DE_RATTRAPAGE);
    return factures
      .filter((f) => seRelance(f) && f.date >= plancher && f.date < (r.depuis as string) && invoiceResteXof(f) > 0)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [factures, r.actives, r.depuis, r.rattrapage]);

  const bascule = () => {
    if (!estDirection) { toast('Ce réglage appartient à la direction.'); return; }
    if (r.actives) { pose({ actives: false }); return; }
    pose({ actives: true, depuis: r.depuis ?? aujourdhui });
  };

  const valideLeRattrapage = () => {
    if (!estDirection) { toast('Ce réglage appartient à la direction.'); return; }
    const ids = aRattraper.filter((f) => !ecartees.has(f.id)).map((f) => f.id);
    pose({ rattrapage: { valideLe: aujourdhui, ids, ...(quiEncaisse() ? { par: quiEncaisse() } : {}) } });
    toast(ids.length ? `${ids.length} facture${ids.length > 1 ? 's' : ''} rattrapée${ids.length > 1 ? 's' : ''} : la première relance part demain à 10 h.` : 'Aucune facture rattrapée.');
  };

  const verifie = async () => {
    setVerdict('Je demande à la fonction…');
    if (!supabase) { setVerdict('Pas de connexion à la Maison.'); return; }
    const { data, error } = await supabase.functions.invoke('relances-factures', { method: 'GET' });
    if (error) { setVerdict('La fonction relances-factures ne répond pas : elle n’est pas encore posée.'); return; }
    const d = data as { version?: string; secrets?: { WA_TEMPLATE_RELANCE?: number; WA_TEMPLATE_RAPPEL_DU_POINT?: number } };
    /* Ce que la fonction voit du modèle du point : les factures le lisent pour dire juste (28 octobre 2026). */
    const point = (d.secrets?.WA_TEMPLATE_RAPPEL_DU_POINT ?? 0) > 0;
    if (estDirection && point !== !!r.modelePoint) pose({ modelePoint: point });
    setVerdict(d.secrets?.WA_TEMPLATE_RELANCE
      ? `relances-factures ${d.version ?? ''} répond, le modèle est nommé. ${point
        ? 'Le rappel groupé est nommé : un payeur reçoit un seul rappel pour toutes ses factures.'
        : 'Le rappel groupé (rappel_du_point) n’est pas encore nommé : seules les factures d’un même jour partent ensemble.'}`
      : `relances-factures ${d.version ?? ''} répond, mais le secret WA_TEMPLATE_RELANCE n’est pas posé : rien ne part.`);
  };

  const enregistreLeRythme = (cle: 'seule' | 'famille') => {
    if (!estDirection) { toast('Ce réglage appartient à la direction.'); return; }
    const c = lu(saisie[cle]);
    if (!c) { toast(`Des jours croissants, de 1 à ${JOURS_AU_PLUS}, ${RELANCES_AU_PLUS} au plus : par exemple « ${dit(cle === 'seule' ? CADENCE_DES_RELANCES : CADENCE_DES_FAMILLES)} ».`); return; }
    pose({ rythmes: { ...(r.rythmes ?? {}), [cle]: c } });
    setSaisie((avant) => ({ ...avant, [cle]: dit(c) }));
    toast(`Rythme ${cle === 'seule' ? 'des clientes seules' : 'des comptes famille'} : ${c.map((j) => `J+${j}`).join(', ')}.`);
  };

  const nomDe = (id: string, repli?: string) => clients.find((c) => c.id === id)?.name || repli || 'Cliente';
  const cadence = rythmeDe(r, false).map((j) => `J+${j}`).join(', ');

  return (
    <Card className="sys-section" style={{ marginTop: 18 }}>
      <div className="sys-section__title">Relances des factures</div>
      <div className="sys-section__cap">
        Une facture qui reste à régler se rappelle seule sur WhatsApp, à 10 h ({cadence} pour une cliente seule), avec le bouton « Régler ».
        Celle d’un enfant part au payeur de son compte famille, et ses factures du même jour ne font qu’un rappel.
        Tout s’arrête dès qu’on paie ou qu’on écrit à la Maison ; une pause se pose sur la facture.
      </div>
      <div className="sys-row">
        <div>
          <div className="sys-row__label">Allumer les relances</div>
          <div className="sys-row__sub">
            {r.actives && r.depuis
              ? `Allumées depuis le ${jourDit(r.depuis)} : les factures de ce jour et après se relancent d’office.`
              : 'Éteintes. Allumées, seules les factures du jour et après se relancent ; les trente jours d’avant attendent votre liste.'}
            {!tapGoPret && ' Le bouton « Régler » a besoin de MND PAY et de Tap & Go allumés : sans eux, rien ne part.'}
          </div>
        </div>
        <Toggle on={!!r.actives} onToggle={bascule} />
      </div>
      {([['seule', 'Rythme · cliente seule', 'Une cliente qui paie pour elle-même.'],
        ['famille', 'Rythme · compte famille', 'Le payeur d’un compte famille : ses enfants, ses proches.']] as const).map(([cle, titre, sous]) => (
        <div className="sys-row" key={cle} data-rythme={cle}>
          <div>
            <div className="sys-row__label">{titre}</div>
            <div className="sys-row__sub">
              {sous} Les jours après la facture : {rythmeDe(r, cle === 'famille').map((j) => `J+${j}`).join(', ')}, à 10 h. Sur une facture, « Décaler la prochaine relance » fixe le jour de la suivante.
            </div>
          </div>
          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <input
              aria-label={titre}
              value={saisie[cle]}
              disabled={!estDirection}
              onChange={(e) => setSaisie((avant) => ({ ...avant, [cle]: e.target.value }))}
              style={{ width: 120 }}
            />
            <button type="button" className="mnd-btn mnd-btn--ghost mnd-btn--sm" disabled={!estDirection || dit(lu(saisie[cle]) ?? []) === dit(rythmeDe(r, cle === 'famille'))}
              onClick={() => enregistreLeRythme(cle)}>Enregistrer</button>
          </span>
        </div>
      ))}
      <div className="sys-row">
        <div>
          <div className="sys-row__label">Vérifier le branchement</div>
          <div className="sys-row__sub">{verdict ?? 'Demande à la fonction si le modèle Meta est nommé, sans rien envoyer.'}</div>
        </div>
        <button type="button" className="mnd-btn mnd-btn--ghost mnd-btn--sm" onClick={() => void verifie()}>Vérifier</button>
      </div>
      {r.actives && r.rattrapage && (
        <div className="sys-row">
          <div>
            <div className="sys-row__label">Rattrapage des trente jours d’avant</div>
            <div className="sys-row__sub">
              Validé le {jourDit(r.rattrapage.valideLe)}{r.rattrapage.par ? ` par ${r.rattrapage.par}` : ''} :
              {' '}{r.rattrapage.ids.length} facture{r.rattrapage.ids.length > 1 ? 's' : ''}, relancées depuis ce jour-là.
            </div>
          </div>
        </div>
      )}
      {r.actives && r.depuis && !r.rattrapage && (
        <div className="sys-row" style={{ display: 'grid', gap: 10 }} data-rattrapage={aRattraper.length}>
          <div>
            <div className="sys-row__label">Rattrapage des trente jours d’avant</div>
            <div className="sys-row__sub">
              {aRattraper.length === 0
                ? `Aucune facture du ${jourDit(jourPlusR(r.depuis, -JOURS_DE_RATTRAPAGE))} au lancement ne reste à régler.`
                : `${aRattraper.length} facture${aRattraper.length > 1 ? 's' : ''} d’avant le lancement reste${aRattraper.length > 1 ? 'nt' : ''} à régler. Décochez celles à épargner, puis validez : leurs relances se comptent depuis aujourd’hui.`}
            </div>
          </div>
          {aRattraper.length > 0 && (
            <div style={{ display: 'grid', gap: 4 }}>
              {aRattraper.map((f) => (
                <label key={f.id} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 13 }}>
                  <input
                    type="checkbox"
                    id={`rattrapage-${f.id}`}
                    checked={!ecartees.has(f.id)}
                    disabled={!estDirection}
                    onChange={() => setEcartees((avant) => {
                      const s = new Set(avant);
                      if (s.has(f.id)) s.delete(f.id); else s.add(f.id);
                      return s;
                    })}
                  />
                  <span>
                    {nomDe(f.clientId, f.clientName)} · facture du {jourDit(f.date)} · reste {fmtMoney(invoiceResteXof(f), 'XOF')}
                  </span>
                </label>
              ))}
            </div>
          )}
          {aRattraper.length > 0 && (
            <button type="button" className="mnd-btn mnd-btn--sm" disabled={!estDirection} onClick={valideLeRattrapage} style={{ justifySelf: 'start' }}>
              Relancer ces {aRattraper.length - [...ecartees].filter((id) => aRattraper.some((f) => f.id === id)).length} factures
            </button>
          )}
        </div>
      )}
    </Card>
  );
}
