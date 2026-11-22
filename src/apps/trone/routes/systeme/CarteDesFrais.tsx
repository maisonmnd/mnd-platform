import { Card, toast } from '../../../../ds/components';
import { useEstDirection } from '../_vie';
import { useSettings } from '../../../../shared/settings';
import {
  GROUPES_DES_FRAIS, LIGNES_DES_FRAIS, caseDuTaux, defautDeLaLigne, exempleDeLaLigne, reglagesApresSaisie, tauxDeLaLigne, tauxDit,
  type LigneDesFrais,
} from '../../../../shared/frais-des-moyens-pur';

/* ══ LES FRAIS DES MOYENS DE PAIEMENT — 22 novembre 2026 ═══════════════
   « Je veux un espace dans mes paramètres où je corrige les frais de carte
   à 2,3 %, et tous les frais liés aux différents moyens de paiement MTN,
   KkiaPay, FedaPay » (Yéman).

   Un taux par moyen, à cet endroit seulement : ceux de FedaPay et de Tap &
   Go ont quitté la carte FedaPay, qui renvoie ici. La direction seule les
   écrit. Une case vide montre le taux d'avant en filigrane, et le rend.
   Les règles, l'arrondi de chaque moyen et l'exemple sous chaque ligne sont
   dans frais-des-moyens-pur.ts. */
export function CarteDesFrais() {
  const [settings, setSettings] = useSettings();
  const estDirection = useEstDirection();
  const s = { frais: settings.frais, mndPay: settings.mndPay };

  const pose = (l: LigneDesFrais, champ: HTMLInputElement) => {
    const saisie = champ.value;
    if (saisie.trim() === caseDuTaux(l.id, s)) return;
    if (!estDirection) { toast('Ce réglage appartient à la direction.'); champ.value = caseDuTaux(l.id, s); return; }
    if (!reglagesApresSaisie(l.id, saisie, s)) { toast('Un taux de 0 à 10 %, par exemple 2,3.'); champ.value = caseDuTaux(l.id, s); return; }
    setSettings((x) => {
      const apres = reglagesApresSaisie(l.id, saisie, { frais: x.frais, mndPay: x.mndPay });
      return apres ? { ...x, frais: apres.frais, mndPay: apres.mndPay } : x;
    });
    const t = saisie.trim() === '' ? defautDeLaLigne(l.id) : tauxDeLaLigne(l.id, reglagesApresSaisie(l.id, saisie, s) ?? s);
    toast(saisie.trim() === '' ? `${l.nom} : le taux d’avant revient, ${tauxDit(t)} %.` : `${l.nom} : ${tauxDit(t)} %.`);
  };

  const ligne = (l: LigneDesFrais) => {
    const vu = caseDuTaux(l.id, s);
    return (
      <div className="sys-row" key={l.id} data-frais={l.id}>
        <div>
          <div className="sys-row__label">{l.nom}</div>
          <div className="sys-row__sub">{l.sous}</div>
          <div className="sys-row__sub" style={{ color: 'var(--color-indigo)' }}>{exempleDeLaLigne(l.id, s)}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            key={vu}
            className="sys-select"
            inputMode="decimal"
            defaultValue={vu}
            placeholder={tauxDit(defautDeLaLigne(l.id))}
            readOnly={!estDirection}
            onBlur={(e) => pose(l, e.target)}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            style={{ width: 80, textAlign: 'right' }}
            aria-label={`${l.nom}, taux en pour cent`}
          />
          <span className="sys-row__value">%</span>
        </div>
      </div>
    );
  };

  return (
    <Card className="sys-section" style={{ marginTop: 18 }}>
      <div className="sys-section__title">Les frais des moyens de paiement</div>
      <div className="sys-section__cap">
        Un taux posé ici vaut partout : à l’encaissement, sur la page « Régler », au serveur de MTN et sur les factures.
        Une facture déjà faite garde le sien. Une case vide rend le taux d’avant, écrit en gris.
        {!estDirection && ' La direction seule les change.'}
      </div>
      {GROUPES_DES_FRAIS.map((g) => (
        <div key={g.id} data-groupe={g.id}>
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-soft)', marginTop: 16 }}>{g.nom}</div>
          <div className="sys-row__sub" style={{ marginBottom: 2 }}>{g.cap}</div>
          {LIGNES_DES_FRAIS.filter((l) => l.groupe === g.id).map(ligne)}
        </div>
      ))}
    </Card>
  );
}
