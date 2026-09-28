import { useState, type CSSProperties } from 'react';
import { CarteDeMarraine } from '../../ds/CarteDeMarraine';
import { carteDeMarraineEnBlob, messageDeLaCarte, type DonneesDeCarte } from '../../ds/carte-marraine';
import { prenomDuNom, soinsEnAttente } from '../../shared/parrainage-pur';
import { useClient } from './lib';

/* ══ MA CARTE DE MARRAINE — 28 septembre 2026 (maquette validée) ════════
   Chaque cliente a la sienne, posée par le Trône : son prénom, son code, le
   QR que ses amies scannent. Elle la montre (elle se retourne d'une touche),
   la partage sur WhatsApp, l'enregistre dans ses photos. Dessous : le soin
   qui l'attend et ses filleules. Ma Couronne ne fait que LIRE : le code, le
   résumé et les soins sont écrits par le Trône, et la migration 0110 les
   protège de toute autre écriture. */

const ETAT_DIT = { 'sans-rdv': 'pas encore de rendez-vous', 'a-venir': 'rendez-vous à venir', venue: 'venue', annulee: 'rendez-vous annulé' } as const;
const dateDite = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
};

export function donneesDeMaCarte(client: ReturnType<typeof useClient>): DonneesDeCarte | null {
  if (!client?.codeParrain) return null;
  return {
    prenom: prenomDuNom(client.name) || client.name,
    code: client.codeParrain,
    depuis: (client.since ?? '').slice(0, 4) || String(new Date().getFullYear()),
    modele: client.carteModele ?? 'indigo',
  };
}

export default function MaCarte({ onClose, toast }: { onClose: () => void; toast: (m: string) => void }) {
  const client = useClient();
  const donnees = donneesDeMaCarte(client);
  const [occupe, setOccupe] = useState(false);
  const soins = soinsEnAttente(client?.soinsOfferts);
  const filleules = client?.parrainage?.filleules ?? [];

  /* PARTAGER : l'image des deux faces quand le téléphone sait joindre un
     fichier, sinon le message et le lien sur WhatsApp. */
  const partage = async () => {
    if (!donnees || occupe) return;
    setOccupe(true);
    try {
      const texte = messageDeLaCarte(donnees);
      const blob = await carteDeMarraineEnBlob('deux', donnees);
      const fichier = new File([blob], `carte-de-marraine-${donnees.code}.png`, { type: 'image/png' });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.share && nav.canShare?.({ files: [fichier] })) {
        await nav.share({ files: [fichier], text: texte });
      } else {
        window.open(`https://wa.me/?text=${encodeURIComponent(texte)}`, '_blank', 'noopener');
      }
    } catch {
      /* Un partage annulé n'est pas une panne. */
    } finally {
      setOccupe(false);
    }
  };
  const enregistre = async () => {
    if (!donnees) return;
    try {
      const blob = await carteDeMarraineEnBlob('deux', donnees);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `carte-de-marraine-${donnees.code}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast('Votre carte est enregistrée.');
    } catch { toast('L’image n’a pas pu être préparée.'); }
  };
  const copie = async () => {
    if (!donnees) return;
    try { await navigator.clipboard.writeText(donnees.code); toast(`Code ${donnees.code} copié.`); } catch { toast(donnees.code); }
  };

  const bouton: CSSProperties = {
    minHeight: 48, borderRadius: 999, border: '1px solid rgba(30,33,80,.35)', background: 'transparent',
    color: '#1E2150', fontSize: 11.5, letterSpacing: '.16em', textTransform: 'uppercase', cursor: 'pointer',
  };

  return (
    <div className="mc-overlayscreen mc-slide" style={{ zIndex: 42 }}>
      <div className="mc-flowhead mc-flowhead--split">
        <div>
          <div className="mc-micro-eyebrow">Parrainage</div>
          <h1 className="mc-flowhead__h1" style={{ marginTop: 4 }}>Votre carte de marraine.</h1>
        </div>
        <button className="mc-x" aria-label="Fermer" onClick={onClose}>✕</button>
      </div>
      <div className="mc-scroll" style={{ flex: 1, padding: '8px 20px calc(24px + env(safe-area-inset-bottom))', display: 'grid', gap: 18, alignContent: 'start' }}>
        {!donnees ? (
          <p style={{ fontSize: 14.5, lineHeight: 1.6, color: '#5E5750' }}>Votre carte se prépare à la Maison. Revenez dans un instant : elle portera votre prénom et votre code.</p>
        ) : (
          <>
            <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.55, color: '#5E5750' }}>
              Montrez-la, partagez-la : chaque amie qui vient grâce à vous vous offre un soin.
            </p>
            <CarteDeMarraine donnees={donnees} largeur={Math.min(350, (typeof window !== 'undefined' ? window.innerWidth : 390) - 40)} />
            <div style={{ display: 'grid', gap: 10 }}>
              <button type="button" onClick={() => void partage()} disabled={occupe}
                style={{ ...bouton, border: 0, background: '#B97A4A', color: '#F6F1E7', minHeight: 50 }}>
                {occupe ? 'Préparation' : 'Partager sur WhatsApp'}
              </button>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <button type="button" style={bouton} onClick={() => void enregistre()}>Enregistrer l’image</button>
                <button type="button" style={bouton} onClick={() => void copie()}>Copier le code</button>
              </div>
            </div>

            {soins.map((s) => (
              <div key={s.id} style={{ borderRadius: 16, padding: '20px 18px', display: 'flex', gap: 14, alignItems: 'center', color: '#F6F1E7', background: '#1E2150' }}>
                <span style={{ width: 52, height: 52, flex: 'none', borderRadius: '50%', background: '#B97A4A', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-serif, Georgia)', fontSize: 22 }}>✦</span>
                <span style={{ display: 'grid', gap: 3 }}>
                  <span style={{ fontSize: 10.5, letterSpacing: '.24em', textTransform: 'uppercase', color: '#D6A06F' }}>Un soin vous attend</span>
                  <span style={{ fontFamily: 'var(--font-serif, Georgia)', fontSize: 23, lineHeight: 1.1 }}>{s.libelle}</span>
                  <span style={{ fontSize: 13, color: 'rgba(246,241,231,.8)' }}>{s.raison}. À votre prochaine visite, dites-le simplement à l’accueil.</span>
                </span>
              </div>
            ))}

            <div>
              <div className="mc-sectionlabel" style={{ margin: '4px 0 6px' }}>Vos filleules</div>
              {filleules.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13.5, color: '#5E5750' }}>Personne encore : votre première amie vous attend.</p>
              ) : filleules.map((f, i) => (
                <div key={`${f.prenom}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderBottom: '1px solid rgba(20,20,27,.12)' }}>
                  <span style={{ width: 38, height: 38, borderRadius: '50%', flex: 'none', display: 'grid', placeItems: 'center', background: f.etat === 'venue' ? '#1E2150' : '#B97A4A', color: '#F6F1E7', fontFamily: 'var(--font-serif, Georgia)', fontSize: 19 }}>{f.prenom.slice(0, 1).toUpperCase()}</span>
                  <span style={{ flexGrow: 1, display: 'grid' }}>
                    <span style={{ fontSize: 15 }}>{f.prenom}</span>
                    <span style={{ fontSize: 12.5, color: '#5E5750' }}>{ETAT_DIT[f.etat]}{f.date ? ` · ${dateDite(f.date)}` : ''}</span>
                  </span>
                </div>
              ))}
              <p style={{ margin: '10px 0 0', fontSize: 12.5, lineHeight: 1.5, color: '#5E5750' }}>Un soin pour chaque amie venue, sans limite. Le code sert une fois par nouvelle cliente.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
