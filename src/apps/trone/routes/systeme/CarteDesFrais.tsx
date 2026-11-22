import { useState } from 'react';
import { Card, toast } from '../../../../ds/components';
import { useMaTete } from '../../../../shared/auth';
import { useSettings } from '../../../../shared/settings';
import {
  GROUPES_DES_FRAIS, LIGNES_DES_FRAIS, defautDeLaLigne, exempleDeLaLigne, reglagesApresSaisie, tauxDeLaLigne, tauxDit, tauxPose,
  type LigneDesFrais, type ReglagesDesFrais,
} from '../../../../shared/frais-des-moyens-pur';

/* ══ LES FRAIS DES MOYENS DE PAIEMENT — 22 novembre 2026 ═══════════════
   « Je veux un espace dans mes paramètres où je corrige les frais de carte
   à 2,3 %, et tous les frais liés aux différents moyens de paiement MTN,
   KkiaPay, FedaPay » (Yéman).

   Un taux par moyen, à cet endroit seulement : ceux de FedaPay et de Tap &
   Go ont quitté la carte FedaPay, qui renvoie ici. La direction seule les
   écrit. Les règles, l'arrondi de chaque moyen et l'exemple sous chaque
   ligne sont dans frais-des-moyens-pur.ts.

   « LES CASES NE MARCHENT PAS, ON N'ARRIVE PAS À ÉCRIRE NI MODIFIER DEDANS »
   (Yéman, le même jour, capture à l'appui). Deux causes : le taux d'avant
   n'était qu'un filigrane (on ne le sélectionne ni ne l'efface), et la case
   se figeait sans un mot tant que le Trône cherchait encore le rôle de la
   personne. Désormais la case porte le taux EN VIGUEUR comme une vraie
   valeur, sélectionnée au clic ; elle ne se fige que pour qui n'est pas la
   direction, et un rôle qui se charge se dit. Vider la case rend le taux
   d'avant. */
export function CarteDesFrais() {
  const [settings, setSettings] = useSettings();
  const { tete, pret } = useMaTete();
  const estDirection = tete?.role === 'souverain' || tete?.role === 'gerant';
  const s: ReglagesDesFrais = { frais: settings.frais, mndPay: settings.mndPay };

  const pose = (l: LigneDesFrais, saisie: string) => {
    if (saisie.trim() === tauxDit(tauxDeLaLigne(l.id, s))) return;
    if (!estDirection && !pret) { toast('Le Trône vérifie encore votre rôle : réessayez dans un instant.'); return; }
    if (!estDirection) { toast('Ce réglage appartient à la direction.'); return; }
    if (!reglagesApresSaisie(l.id, saisie, s)) { toast('Un taux de 0 à 10 %, par exemple 2,3.'); return; }
    setSettings((x) => {
      const apres = reglagesApresSaisie(l.id, saisie, { frais: x.frais, mndPay: x.mndPay });
      return apres ? { ...x, frais: apres.frais, mndPay: apres.mndPay } : x;
    });
    const t = saisie.trim() === '' ? defautDeLaLigne(l.id) : tauxDeLaLigne(l.id, reglagesApresSaisie(l.id, saisie, s) ?? s);
    toast(saisie.trim() === '' ? `${l.nom} : le taux d’avant revient, ${tauxDit(t)} %.` : `${l.nom} : ${tauxDit(t)} %.`);
  };

  const ligne = (l: LigneDesFrais) => (
    <div className="sys-row" key={l.id} data-frais={l.id}>
      <div>
        <div className="sys-row__label">{l.nom}</div>
        <div className="sys-row__sub">{l.sous}</div>
        <div className="sys-row__sub" style={{ color: 'var(--color-indigo)' }}>{exempleDeLaLigne(l.id, s)}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <CaseDuTaux
          nom={l.nom}
          enVigueur={tauxDit(tauxDeLaLigne(l.id, s))}
          pose={tauxPose(l.id, s) !== undefined}
          defaut={tauxDit(defautDeLaLigne(l.id))}
          fige={pret && !estDirection}
          onPose={(saisie) => pose(l, saisie)}
        />
        <span className="sys-row__value">%</span>
      </div>
    </div>
  );

  return (
    <Card className="sys-section" style={{ marginTop: 18 }}>
      <div className="sys-section__title">Les frais des moyens de paiement</div>
      <div className="sys-section__cap">
        Un taux posé ici vaut partout : à l’encaissement, sur la page « Régler », au serveur de MTN et sur les factures.
        Une facture déjà faite garde le sien. Touchez un taux pour le changer ; videz la case pour revenir au taux d’avant.
        {pret && !estDirection && ' La direction seule les change.'}
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

/** UNE CASE QUI SE LAISSE FAIRE : le taux en vigueur comme vraie valeur (plus
    pâle tant que c'est celui d'avant), sélectionné au clic pour être tapé
    par-dessus ; le brouillon vit dans la case jusqu'à la sortie (Entrée ou
    clic ailleurs), Échap le rend. */
function CaseDuTaux({ nom, enVigueur, pose, defaut, fige, onPose }: {
  nom: string;
  enVigueur: string;
  pose: boolean;
  defaut: string;
  fige: boolean;
  onPose: (saisie: string) => void;
}) {
  const [brouillon, setBrouillon] = useState<string | null>(null);
  return (
    <input
      className="sys-select"
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={brouillon ?? enVigueur}
      placeholder={defaut}
      readOnly={fige}
      title={pose ? undefined : 'Le taux d’avant : tapez-en un autre pour le changer.'}
      onFocus={(e) => { const champ = e.currentTarget; if (!fige) { setBrouillon(enVigueur); requestAnimationFrame(() => champ.select()); } }}
      onChange={(e) => setBrouillon(e.target.value)}
      onBlur={() => { const b = brouillon; setBrouillon(null); if (b !== null) onPose(b); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') { setBrouillon(enVigueur); requestAnimationFrame(() => (e.target as HTMLInputElement).blur()); }
      }}
      style={{ width: 80, textAlign: 'right', cursor: fige ? 'default' : 'text', color: pose || brouillon !== null ? undefined : 'var(--ink-soft)' }}
      aria-label={`${nom}, taux en pour cent`}
      data-taux-pose={pose ? '1' : '0'}
    />
  );
}
