import { useNavigate } from 'react-router-dom';
import { PageHead } from '../_ui';
import { useStore } from '../../../../shared/store';
import { maisonNom } from '../../../../shared/identite';
import { autoConfigStore, MOMO_QR_DEFAUT, MOMO_USSD_DEFAUT, MOMO_MARCHAND_DEFAUT } from '../equipe/data';
import { usePointageConfig } from '../equipe/payroll';
import { QrSvg, qrMatrice, lienDuJour } from '../equipe/Comptoir';
import { InvitationCouronne } from './Vitrine';
import { todayISO } from './_shared';
import './clients.css';

/* QR CODES — TOUS LES CODES DE LA MAISON, RÉUNIS (13 août, demande de Yéman).
   Ils vivaient éparpillés : l'invitation Ma Couronne à la Vitrine, le QR
   MoMoPay au fond des Paramètres, le code du jour au Comptoir. Une page les
   rassemble — à montrer, imprimer, afficher — et dit où chacun se règle. */

export default function QrCodes() {
  const navigate = useNavigate();
  const [autoRaw] = useStore(autoConfigStore);
  const momoQr = autoRaw.momoQr || MOMO_QR_DEFAUT;
  const momoUssd = autoRaw.momoUssd || MOMO_USSD_DEFAUT;
  const momoMarchand = autoRaw.momoMarchand || MOMO_MARCHAND_DEFAUT;
  /* Le code du jour ne se FABRIQUE pas ici — c'est le geste du Comptoir. On
     montre celui d'aujourd'hui s'il existe, sinon on mène au Comptoir. */
  const [preuve] = usePointageConfig();
  const codeJour = preuve.codeDate === todayISO() ? (preuve.codeValeur ?? '') : '';

  /* La carte A5 du QR MoMoPay — même gabarit que la carte d'invitation :
     comptoir, miroir, caisse. Le QR est celui que l'app MoMo sait lire. */
  const imprimerMomo = () => {
    const { path, n } = qrMatrice(momoQr);
    const fen = window.open('', '_blank', 'noopener,width=520,height=760');
    if (!fen) return;
    fen.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8" />
<title>MoMoPay — carte d'encaissement</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,500;1,400&family=Jost:wght@400;500;600&display=swap" />
<style>
  @page { size: A5 portrait; margin: 0; }
  body { margin: 0; background: #F6F1E7; color: #14141B; font-family: 'Jost', sans-serif;
         display: flex; justify-content: center; }
  .carte { width: 148mm; min-height: 210mm; box-sizing: border-box; padding: 18mm 16mm;
           display: flex; flex-direction: column; align-items: center; text-align: center;
           border: 1px solid rgba(20,20,27,.14); outline: 2px solid #B97A4A; outline-offset: -6mm; }
  .marque { font-size: 13px; font-weight: 600; letter-spacing: .34em; color: #1E2150; }
  .titre { font-family: 'Cormorant Garamond', serif; font-weight: 300; font-size: 38px; color: #1E2150; margin: 10mm 0 2mm; }
  .sous { font-family: 'Cormorant Garamond', serif; font-style: italic; font-size: 16px; color: #45454F; max-width: 96mm; line-height: 1.5; }
  .qr { width: 64mm; height: 64mm; margin: 10mm 0 6mm; }
  .marchand { font-family: 'Cormorant Garamond', serif; font-size: 30px; color: #1E2150; letter-spacing: .06em; }
  .ussd { font-size: 13px; color: #45454F; margin-top: 3mm; letter-spacing: .04em; }
  .etapes { font-size: 12.5px; color: #14141B; line-height: 2; letter-spacing: .02em; margin-top: 6mm; }
  .etapes b { color: #9E6238; font-weight: 600; letter-spacing: .12em; }
  .devise { margin-top: auto; font-family: 'Cormorant Garamond', serif; font-style: italic; font-size: 14px; color: #9E6238; }
</style></head><body>
  <div class="carte">
    <div class="marque">${maisonNom().toUpperCase()}</div>
    <div class="titre">Régler par MoMo.</div>
    <div class="sous">Scannez avec l'application MoMo — ou composez le code, le montant en francs.</div>
    <svg class="qr" viewBox="-2 -2 ${n + 4} ${n + 4}" role="img" aria-label="QR MoMoPay de la maison">
      <rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#F6F1E7" />
      <path d="${path}" fill="#1E2150" shape-rendering="crispEdges" />
    </svg>
    <div class="marchand">${momoMarchand}</div>
    <div class="ussd">${momoUssd}</div>
    <div class="etapes">
      <b>1</b> · Ouvrez l'application MoMo, « Scanner »<br />
      <b>2</b> · Vérifiez le nom du marchand<br />
      <b>3</b> · Saisissez le montant en francs, validez
    </div>
    <div class="devise">mi nyɔ́ ɖɛkpɛ — la maison veille.</div>
  </div>
  <script>window.onload = () => setTimeout(() => window.print(), 400);</script>
</body></html>`);
    fen.document.close();
  };

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="Clients & Agenda · Les portes"
        title="QR Codes."
        sub="Tous les codes de la Maison, réunis — à montrer au comptoir, imprimer, afficher au miroir."
      />

      {/* ① L'invitation Ma Couronne — la même carte que la Vitrine. */}
      <InvitationCouronne />

      {/* ② L'encaissement MoMoPay. */}
      <div className="tr-card" style={{ padding: '18px 22px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap' }}>
        <div style={{ width: 96, height: 96, flex: 'none', border: '1px solid var(--hairline)', borderRadius: 3, padding: 5, background: '#f6f1e8' }}>
          <QrSvg valeur={momoQr} style={{ width: '100%', height: '100%', display: 'block' }} />
        </div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 21, color: 'var(--color-indigo)' }}>
            Encaisser par MoMoPay.
          </div>
          <div className="mnd-muted" style={{ fontSize: 12.5, marginTop: 5, lineHeight: 1.6, maxWidth: '62ch' }}>
            La cliente scanne avec son application MoMo — marchand <b style={{ color: 'var(--copper-700)', fontWeight: 600 }}>{momoMarchand}</b>,
            ou compose {momoUssd}. Le code et le marchand se règlent dans Paramètres › L’encaissement.
          </div>
        </div>
        <button type="button" className="mnd-btn mnd-btn--copper" onClick={imprimerMomo} style={{ flex: 'none' }}>
          Imprimer la carte A5
        </button>
      </div>

      {/* ③ Le code du jour — pointage de l'équipe (il naît au Comptoir). */}
      <div className="tr-card" style={{ padding: '18px 22px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap' }}>
        {codeJour ? (
          <div style={{ width: 96, height: 96, flex: 'none', border: '1px solid var(--hairline)', borderRadius: 3, padding: 5, background: '#f6f1e8' }}>
            <QrSvg valeur={lienDuJour(codeJour)} style={{ width: '100%', height: '100%', display: 'block' }} />
          </div>
        ) : (
          <div style={{ width: 96, height: 96, flex: 'none', border: '1px dashed var(--copper-300)', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--copper-700)', fontFamily: 'var(--font-serif)', fontSize: 13, textAlign: 'center', padding: 6 }}>
            pas encore né
          </div>
        )}
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 21, color: 'var(--color-indigo)' }}>
            Le code du jour · pointage.
          </div>
          <div className="mnd-muted" style={{ fontSize: 12.5, marginTop: 5, lineHeight: 1.6, maxWidth: '62ch' }}>
            {codeJour
              ? <>Le carré que l’équipe scanne pour pointer — aujourd’hui : <b style={{ color: 'var(--copper-700)', fontWeight: 600, letterSpacing: '.14em' }}>{codeJour}</b>. Il se renouvelle chaque nuit.</>
              : 'Le carré que l’équipe scanne pour pointer. Il naît à l’ouverture du Comptoir — ouvrez-le pour créer celui d’aujourd’hui.'}
          </div>
        </div>
        <button type="button" className="mnd-btn mnd-btn--copper" onClick={() => navigate('/comptoir')} style={{ flex: 'none' }}>
          Ouvrir le Comptoir
        </button>
      </div>
    </div>
  );
}
