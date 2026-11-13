import { useEffect, useMemo, useRef, useState } from 'react';
import { Mic, Sparkles } from 'lucide-react';
import { Button } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { useStore } from '../../../../shared/store';
import { useStaff } from '../../../../shared/auth';
import { staffAccessStore } from '../equipe/data';
import { useCategories, useServices, type Service } from '../../../../shared/catalog';
import { useClients } from '../../../../shared/clients';
import { useModelBands, useBandSets, pricingOf, personalPriceXof, plafondDeRemiseXof } from '../../../../shared/pricing';
import { demandeAClaude, versionDeIaMaison } from '../../../../shared/ia-maison';
import { peutDemander, saitLeDevisParDescription } from '../../../../shared/ia-maison-pur';
import {
  CHANTIER_DU_DEVIS, USAGE_DU_DEVIS, SCHEMA_DU_DEVIS, SIGNES_MAX_DE_LA_DESCRIPTION,
  consigneDuDevis, descriptionPourClaude, devisDepuisLaLecture, lectureDuDevis,
  type DevisPropose, type PrestationDuCatalogue,
} from '../../../../shared/devis-par-description-pur';
import { ClientPicker, todayISO } from '../clients/_shared';
import { useEstDirection } from '../_vie';

/* ══ L'ASSISTANT DES DEVIS — 13 novembre 2026 ═════════════════════════════
   On décrit la situation d'une cliente, avec ses mots ; l'assistant propose
   les prestations du catalogue et chiffre le devis. Ce que la Maison voit
   AVANT d'ouvrir le brouillon : chaque ligne, pourquoi elle est là, la
   remise, le total, et ce qui l'a fait douter. Rien n'est enregistré ici :
   « Ouvrir le brouillon » rend la main à l'éditeur du devis, qui reste le
   seul endroit où un devis naît.

   Les prix ne viennent JAMAIS de Claude : `devis-par-description-pur` ne lui
   demande que des identifiants de prestations et des nombres de locks. */

export type BrouillonDuDevis = { clientId: string; propose: DevisPropose };

const EXEMPLE = 'Ex. : elle a 295 locks faites ailleurs. On les défait, on répare, puis on recrée 100 locks. Le devis doit s’arrêter à 160 000 F.';

/** La reconnaissance vocale du navigateur, quand il en a une : le bouton n'apparaît pas sinon. */
type Reconnaissance = { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };
const creeLaReconnaissance = (): Reconnaissance | null => {
  const w = window as unknown as { SpeechRecognition?: new () => Reconnaissance; webkitSpeechRecognition?: new () => Reconnaissance };
  const Classe = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Classe ? new Classe() : null;
};

export default function AssistantDuDevis({ onOuvrir }: { onOuvrir: (b: BrouillonDuDevis) => void }) {
  const { currency } = useBranch();
  const moi = useStaff();
  const accesTous = useStore(staffAccessStore)[0];
  const mesDomaines = accesTous[moi?.user_id ?? ''] ?? {};
  const estDirection = useEstDirection();
  const [services] = useServices();
  const [categories] = useCategories();
  const [clients] = useClients();
  const bands = useModelBands()[0];
  const sets = useBandSets()[0];

  const [saitFaire, setSaitFaire] = useState<boolean | null>(null);
  const [clientId, setClientId] = useState('');
  const [texte, setTexte] = useState('');
  const [lit, setLit] = useState(false);
  const [mot, setMot] = useState('');
  const [propose, setPropose] = useState<DevisPropose | null>(null);
  const [ecoute, setEcoute] = useState(false);
  const reco = useRef<Reconnaissance | null>(null);
  const [vocalPossible] = useState(() => creeLaReconnaissance() !== null);

  useEffect(() => {
    let vivant = true;
    void versionDeIaMaison().then((v) => { if (vivant) setSaitFaire(saitLeDevisParDescription(v)); });
    return () => { vivant = false; reco.current?.stop(); };
  }, []);

  const maCarte = useMemo(() => services as readonly Service[], [services]);
  const cliente = clients.find((c) => c.id === clientId);
  const peut = saitFaire === true && peutDemander(moi?.role, CHANTIER_DU_DEVIS, mesDomaines);

  /* Le juge des prix est celui de la Caisse : la cliente choisie apporte son Juste Prix et ses prix fermes ;
     le nombre de locks et la longueur de la ligne se posent par-dessus. */
  const prixDe = (sv: PrestationDuCatalogue, o: { locks: number | undefined; longueur: string }): number => {
    const ctx = pricingOf(
      { ...(cliente ?? { priceCoef: 1 }), lockCount: o.locks ?? cliente?.lockCount, longueur: (o.longueur || cliente?.longueur || undefined) as never } as never,
      bands, sets, categories,
    );
    return personalPriceXof(sv as Service, ctx, maCarte);
  };

  const dicter = () => {
    if (ecoute) { reco.current?.stop(); return; }
    const r = creeLaReconnaissance();
    if (!r) return;
    r.lang = 'fr-FR'; r.interimResults = false; r.continuous = true;
    r.onresult = (e) => {
      let dit = '';
      for (let i = 0; i < e.results.length; i++) if (e.results[i].isFinal) dit += ` ${e.results[i][0].transcript}`;
      if (dit.trim()) setTexte((t) => `${t}${t && !/\s$/.test(t) ? ' ' : ''}${dit.trim()}`.slice(0, SIGNES_MAX_DE_LA_DESCRIPTION));
    };
    r.onend = () => setEcoute(false);
    r.onerror = () => setEcoute(false);
    reco.current = r;
    setEcoute(true);
    r.start();
  };

  const prepare = async () => {
    const description = descriptionPourClaude(texte);
    if (!description) { setMot('Décrivez la situation en une ou deux phrases.'); return; }
    setLit(true); setPropose(null); setMot('L’assistant lit la situation…');
    try {
      const r = await demandeAClaude<unknown>({
        chantier: CHANTIER_DU_DEVIS, usage: USAGE_DU_DEVIS,
        systeme: consigneDuDevis({ services: maCarte, aujourdhui: todayISO() }),
        messages: [{ role: 'user', content: description }],
        schema: SCHEMA_DU_DEVIS, maxTokens: 1500,
      });
      if (!r.ok) { setMot(`${r.message} Vous pouvez toujours écrire le devis à la main.`); return; }
      const lu = lectureDuDevis(r.data, maCarte);
      if (!lu) { setMot('La lecture n’a pas donné de devis exploitable. Reformulez, ou écrivez-le à la main.'); return; }
      const devis = devisDepuisLaLecture(lu, {
        services: maCarte, prixDe,
        plafondDeRemiseXof: (base) => plafondDeRemiseXof(estDirection, base),
      });
      setPropose(devis);
      setMot(devis.lignes.length ? '' : 'Aucune prestation du catalogue ne répond à cette description.');
    } finally {
      setLit(false);
    }
  };

  const recommence = () => { setPropose(null); setMot(''); };

  if (saitFaire === false) {
    return (
      <div className="trv-assistant trv-assistant--muet">
        <div className="trv-assistant__titre"><Sparkles size={14} aria-hidden /> L’assistant des devis</div>
        <p className="trv-assistant__aide">Il n’est pas encore en ligne sur ce serveur. Les devis s’écrivent à la main, en attendant.</p>
      </div>
    );
  }
  if (saitFaire === null || !peut) return null;

  return (
    <div className="trv-assistant">
      <div className="trv-assistant__titre"><Sparkles size={14} aria-hidden /> L’assistant des devis</div>
      <p className="trv-assistant__aide">Décrivez la situation de la cliente, avec vos mots. L’assistant choisit les prestations du catalogue et chiffre le devis ; vous relisez avant qu’il existe.</p>

      {!propose && (
        <>
          <div className="trv-assistant__cliente">
            <ClientPicker value={clientId} onChange={setClientId} placeholder="Pour quelle cliente ? (facultatif)" />
          </div>
          <div className="trv-assistant__champ">
            <textarea
              className="mnd-input trv-assistant__texte"
              rows={4}
              maxLength={SIGNES_MAX_DE_LA_DESCRIPTION}
              placeholder={EXEMPLE}
              value={texte}
              onChange={(e) => setTexte(e.target.value)}
              disabled={lit}
            />
            {vocalPossible && (
              <button type="button" className={`trv-assistant__micro${ecoute ? ' is-actif' : ''}`} onClick={dicter} title={ecoute ? 'Arrêter la dictée' : 'Dicter la situation'} aria-pressed={ecoute}>
                <Mic size={15} aria-hidden />
              </button>
            )}
          </div>
          <div className="trv-assistant__actions">
            <Button onClick={prepare} disabled={lit || texte.trim().length < 8}>{lit ? 'Lecture en cours…' : 'Préparer le brouillon'}</Button>
            {mot && <span className="trv-assistant__mot" role="status">{mot}</span>}
          </div>
        </>
      )}

      {propose && propose.lignes.length > 0 && (
        <div className="trv-assistant__resultat">
          <div className="trv-assistant__sous-titre">Ce que l’assistant a compris{cliente ? ` pour ${cliente.name}` : ''}</div>
          <ol className="trv-assistant__lignes">
            {propose.lignes.map((l, i) => (
              <li key={`${l.serviceId}-${i}`}>
                <span className="trv-assistant__ligne-nom">
                  {l.label}{l.qty > 1 ? ` ×${l.qty}` : ''}
                  {l.locks > 0 && <em> · {l.locks} locks</em>}
                  {l.raison && <small>{l.raison}</small>}
                </span>
                <span className="trv-assistant__ligne-prix">{fmtMoney(l.qty * l.unitXof, currency)}</span>
              </li>
            ))}
          </ol>
          <dl className="trv-assistant__totaux">
            <div><dt>Sous-total</dt><dd>{fmtMoney(propose.brutXof, currency)}</dd></div>
            {propose.remiseXof > 0 && <div><dt>Remise</dt><dd>− {fmtMoney(propose.remiseXof, currency)}</dd></div>}
            <div className="trv-assistant__total"><dt>Total</dt><dd>{fmtMoney(propose.totalXof, currency)}</dd></div>
          </dl>
          {propose.avertissements.length > 0 && (
            <ul className="trv-assistant__avertissements">
              {propose.avertissements.map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          )}
          <div className="trv-assistant__actions">
            <Button onClick={() => onOuvrir({ clientId, propose })}>Ouvrir le brouillon à relire</Button>
            <Button variant="ghost" onClick={recommence}>Recommencer</Button>
          </div>
          <p className="trv-assistant__aide">Rien n’est enregistré : le brouillon s’ouvre dans l’éditeur, vous changez ce que vous voulez, puis « Créer le document ».</p>
        </div>
      )}

      {propose && propose.lignes.length === 0 && (
        <div className="trv-assistant__resultat">
          {propose.avertissements.length > 0 && (
            <ul className="trv-assistant__avertissements">{propose.avertissements.map((a, i) => <li key={i}>{a}</li>)}</ul>
          )}
          <div className="trv-assistant__actions"><Button variant="ghost" onClick={recommence}>Reformuler</Button></div>
        </div>
      )}
    </div>
  );
}
