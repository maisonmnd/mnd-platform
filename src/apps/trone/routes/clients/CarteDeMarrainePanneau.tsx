import { useState, type CSSProperties } from 'react';
import { toast } from '../../../../ds/components';
import { CarteDeMarraine } from '../../../../ds/CarteDeMarraine';
import {
  carteDeMarraineEnBlob, carteDeMarraineEnPiece, dessineLaCarteDeMarraine, messageDeLaCarte, type DonneesDeCarte,
} from '../../../../ds/carte-marraine';
import { clientsStore, type Client } from '../../../../shared/clients';
import { envoieSurWhatsApp } from '../../../../shared/whatsapp';
import { MODELES_DE_CARTE, prenomDuNom, soinsEnAttente, type ModeleDeCarte } from '../../../../shared/parrainage-pur';

/* ══ SA CARTE DE MARRAINE, DANS SA FICHE — 28 septembre 2026 ════════════
   Maquette validée (« Au Trône, la fiche cliente »). La carte à son prénom,
   son modèle, trois gestes (l'envoyer sur WhatsApp, l'imprimer au format
   carte bancaire, l'enregistrer), ses filleules et ses soins offerts.

   LE CODE N'EST JAMAIS SAISI ICI : `useParrainageVivant` le pose sur chaque
   fiche, tiré de son prénom. Les soins se posent tout seuls quand une amie
   est venue, et se consomment à la caisse. */

const MODELE_DIT: Record<ModeleDeCarte, string> = { indigo: 'Indigo', ivoire: 'Ivoire', cuivre: 'Cuivre' };
const ETAT_DIT = { 'sans-rdv': 'pas encore de rendez-vous', 'a-venir': 'rendez-vous à venir', venue: 'venue', annulee: 'rendez-vous annulé' } as const;
const dateCourte = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
};

async function imprime(d: DonneesDeCarte): Promise<void> {
  const faces = await Promise.all((['recto', 'verso'] as const).map(async (f) => {
    const canvas = document.createElement('canvas');
    await dessineLaCarteDeMarraine(canvas, f, d);
    return canvas.toDataURL('image/png');
  }));
  const w = window.open('', '_blank');
  if (!w) { toast('La fenêtre d’impression a été bloquée par le navigateur.'); return; }
  w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Carte de marraine ${d.code}</title>
<style>@page{size:85.6mm 54mm;margin:0}html,body{margin:0}img{display:block;width:85.6mm;height:54mm;page-break-after:always}</style></head>
<body>${faces.map((src) => `<img src="${src}" alt="">`).join('')}<script>window.onload=()=>{window.focus();window.print();}<\/script></body></html>`);
  w.document.close();
}

export function CarteDeMarrainePanneau({ client }: { client: Client }) {
  const [envoi, setEnvoi] = useState(false);
  if (!client.codeParrain) {
    return (
      <div>
        <span className="trc-microlabel">Carte de marraine</span>
        <p className="trc-sub" style={{ fontSize: 12.5, margin: '6px 0 0' }}>Sa carte se prépare : son code arrive dans un instant.</p>
      </div>
    );
  }
  const donnees: DonneesDeCarte = {
    prenom: prenomDuNom(client.name) || client.name,
    code: client.codeParrain,
    depuis: (client.since ?? '').slice(0, 4) || String(new Date().getFullYear()),
    modele: client.carteModele ?? 'indigo',
  };
  const filleules = client.parrainage?.filleules ?? [];
  const soins = client.soinsOfferts ?? [];
  const enAttente = soinsEnAttente(soins);

  const changeModele = (m: ModeleDeCarte) =>
    clientsStore.set((prev) => prev.map((c) => (c.id === client.id ? { ...c, carteModele: m } : c)));

  const envoie = async () => {
    if (envoi) return;
    setEnvoi(true);
    try {
      const piece = await carteDeMarraineEnPiece(donnees);
      /* Dans la fenêtre de 24 heures, l'image part avec sa légende. Hors
         fenêtre, le modèle approuvé `carte_marraine` la porte en en-tête. */
      let r = await envoieSurWhatsApp({ numero: client.phone, texte: messageDeLaCarte(donnees), piece, clientId: client.id, branchId: client.branchId });
      if (!r.ok && /fenêtre/i.test(r.erreur)) {
        r = await envoieSurWhatsApp({
          numero: client.phone, modele: 'carte_marraine', variables: [donnees.prenom, donnees.code],
          enTete: 'image', piece, clientId: client.id, branchId: client.branchId,
        });
      }
      toast(r.ok ? `Carte envoyée à ${donnees.prenom} sur WhatsApp.` : `La carte n’est pas partie : ${r.erreur}`);
    } catch {
      toast('La carte n’a pas pu être dessinée.');
    } finally {
      setEnvoi(false);
    }
  };

  const telecharge = async () => {
    try {
      const blob = await carteDeMarraineEnBlob('deux', donnees);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `carte-de-marraine-${donnees.code}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch { toast('L’image n’a pas pu être préparée.'); }
  };

  const bouton: CSSProperties = {
    minHeight: 40, borderRadius: 6, border: '1px solid rgba(30,33,80,.3)', background: 'transparent',
    color: 'var(--color-indigo)', fontSize: 12.5, cursor: 'pointer', padding: '0 12px',
  };

  return (
    <div>
      <span className="trc-microlabel">Carte de marraine</span>
      <div style={{ display: 'grid', gap: 12, marginTop: 8 }}>
        <CarteDeMarraine donnees={donnees} largeur={300} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 22, letterSpacing: '.12em', color: 'var(--color-indigo)' }}>{donnees.code}</span>
          <span style={{ display: 'flex', gap: 4 }}>
            {MODELES_DE_CARTE.map((m) => (
              <button key={m} type="button" onClick={() => changeModele(m)} aria-pressed={donnees.modele === m}
                style={{ ...bouton, minHeight: 30, fontSize: 11, padding: '0 9px', borderRadius: 999, ...(donnees.modele === m ? { background: 'var(--color-indigo)', color: 'var(--color-ivoire)', borderColor: 'var(--color-indigo)' } : {}) }}>
                {MODELE_DIT[m]}
              </button>
            ))}
          </span>
        </div>
        <button type="button" onClick={() => void envoie()} disabled={envoi}
          style={{ ...bouton, minHeight: 44, background: 'var(--copper-500, #B97A4A)', borderColor: 'var(--copper-500, #B97A4A)', color: 'var(--color-ivoire, #F6F1E7)' }}>
          {envoi ? 'Envoi en cours' : 'Envoyer sa carte sur WhatsApp'}
        </button>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button type="button" style={bouton} onClick={() => void imprime(donnees)}>Imprimer la carte</button>
          <button type="button" style={bouton} onClick={() => void telecharge()}>Enregistrer l’image</button>
        </div>

        {enAttente.length > 0 && (
          <div style={{ display: 'grid', gap: 6 }}>
            {enAttente.map((s) => (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '10px 12px', borderRadius: 8, background: 'var(--copper-50, #FAF1E9)', border: '1px solid var(--copper-300, #D6A06F)' }}>
                <span style={{ fontSize: 13 }}><b style={{ fontWeight: 500 }}>{s.libelle}</b> · <span className="trc-sub">{s.raison}</span></span>
                <span style={{ fontSize: 11.5, color: 'var(--copper-700)', whiteSpace: 'nowrap' }}>à utiliser</span>
              </div>
            ))}
          </div>
        )}
        {soins.filter((s) => s.utiliseLe).map((s) => (
          <span key={s.id} className="trc-sub" style={{ fontSize: 12 }}>{s.libelle} offert, utilisé le {dateCourte(s.utiliseLe)}{s.piece ? ` (${s.piece})` : ''}</span>
        ))}

        <div>
          <span className="trc-sub" style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase' }}>Ses filleules</span>
          {filleules.length === 0
            ? <p className="trc-sub" style={{ fontSize: 12.5, margin: '4px 0 0' }}>Son code n’a pas encore servi.</p>
            : filleules.map((f, i) => (
              <div key={`${f.prenom}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '7px 0', borderBottom: '1px solid rgba(20,20,27,.08)', fontSize: 13 }}>
                <span>{f.prenom}</span>
                <span className="trc-sub">{ETAT_DIT[f.etat]}{f.date ? ` · ${dateCourte(f.date)}` : ''}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
