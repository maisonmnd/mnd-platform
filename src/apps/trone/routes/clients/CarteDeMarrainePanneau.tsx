import { useState, type CSSProperties } from 'react';
import { toast } from '../../../../ds/components';
import { CarteDeMarraine } from '../../../../ds/CarteDeMarraine';
import {
  carteDeMarraineEnBlob, carteDeMarraineEnPiece, dessineLaCarteDeMarraine, messageDeLaCarte, type DonneesDeCarte,
} from '../../../../ds/carte-marraine';
import { clientsStore, useClients, type Client } from '../../../../shared/clients';
import { useDemandes } from '../../../../shared/demandes';
import { useAppointments } from '../../../../shared/agenda';
import { pourquoiPasDeMarraine, type DemandeLue } from '../../../../shared/ambassade';
import { envoieSurWhatsApp } from '../../../../shared/whatsapp';
import { MODELES_DE_CARTE, genreEffectif, nomDuRang, prenomDuNom, rangSuivant, soinsEnAttente, type ModeleDeCarte, type SoinOffert } from '../../../../shared/parrainage-pur';
import { appelDe } from '../../../../shared/civilite';

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

/* « VIENT DE LA PART DE » — 28 septembre 2026 (les ambassadrices). L'amie
   venue sans le site (WhatsApp, téléphone, en passant) se rattache ici à sa
   marraine : par son code ou par son prénom. Le juge (`pourquoiPasDeMarraine`)
   refuse sa propre marraine, une cliente déjà venue plusieurs fois, et un
   rattachement dont la récompense est déjà posée. */
function VientDeLaPartDe({ client }: { client: Client }) {
  const [clients] = useClients();
  const [rdvs] = useAppointments();
  const [demandes] = useDemandes();
  const [cherche, setCherche] = useState('');
  const [ouvert, setOuvert] = useState(false);
  const lus = rdvs.map((a) => ({ id: a.id, status: a.status, date: a.date, clientId: a.clientId }));
  const marraine = client.parraineePar ? clients.find((c) => c.codeParrain === client.parraineePar) : undefined;
  const q = cherche.trim().toLowerCase();
  const trouvees = q.length < 2 ? [] : clients
    .filter((c) => c.codeParrain && !c.archived && c.id !== client.id
      && (c.codeParrain.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)))
    .slice(0, 5);
  const rattache = (c: Client) => {
    const refus = pourquoiPasDeMarraine(client, c.codeParrain as string, clients, lus, demandes as DemandeLue[]);
    if (refus) { toast(refus); return; }
    clientsStore.set((prev) => prev.map((x) => (x.id === client.id
      ? { ...x, parraineePar: c.codeParrain, parraineeLe: new Date().toISOString().slice(0, 10) } : x)));
    setCherche(''); setOuvert(false);
    toast(`Rattachée à ${prenomDuNom(c.name)}. Sa première visite honorée récompensera sa marraine.`);
  };
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <span className="trc-sub" style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase' }}>Vient de la part de</span>
      {marraine && !ouvert ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, background: 'var(--copper-50, #FAF1E9)', border: '1px solid var(--copper-300, #D6A06F)' }}>
          <span style={{ fontSize: 13.5 }}>{prenomDuNom(marraine.name)} <span className="trc-sub">· {marraine.codeParrain}</span></span>
          <button type="button" onClick={() => setOuvert(true)} style={{ border: 0, background: 'transparent', color: 'var(--copper-700)', fontSize: 12, cursor: 'pointer', minHeight: 32 }}>Changer</button>
        </div>
      ) : (
        <>
          <input className="mnd-input" value={cherche} onChange={(e) => setCherche(e.target.value)} placeholder="Son code, ou le prénom de sa marraine" aria-label="Code ou prénom de la marraine" />
          {trouvees.map((c) => (
            <button key={c.id} type="button" onClick={() => rattache(c)}
              style={{ textAlign: 'left', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(20,20,27,.12)', background: 'transparent', cursor: 'pointer', fontSize: 13.5 }}>
              {c.name} <span className="trc-sub">· {c.codeParrain}</span>
            </button>
          ))}
          {q.length >= 2 && trouvees.length === 0 && <span className="trc-sub" style={{ fontSize: 12 }}>Aucune cliente ne porte ce code ou ce prénom.</span>}
        </>
      )}
    </div>
  );
}

const genreDit = (s: SoinOffert, choix: Client['choixRecompenses']): string => {
  const g = genreEffectif(s, choix);
  if (g === 'a-choisir') return `à choisir : soin ou −${s.pct ?? 20} % produit`;
  return g === 'remise' ? 'remise produit' : 'soin offert';
};

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
    rang: client.parrainage?.rang,
  };
  const venues = client.parrainage?.venues ?? 0;
  const suivant = rangSuivant(venues);
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
          numero: client.phone, modele: 'carte_marraine', variables: [appelDe(client), donnees.code],
          enTete: 'image', piece, clientId: client.id, branchId: client.branchId,
        });
      }
      toast(r.ok ? (r.enAttente ? `Hors ligne : la carte partira à ${donnees.prenom} au retour du réseau.` : `Carte envoyée à ${donnees.prenom} sur WhatsApp.`) : `La carte n’est pas partie : ${r.erreur}`);
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

        <div style={{ fontSize: 13, color: 'var(--color-indigo)' }}>
          Ambassadrice · <b style={{ fontWeight: 500 }}>{nomDuRang(client.parrainage?.rang)}</b> · {venues} {venues > 1 ? 'amies venues' : 'amie venue'}
          {suivant && <span className="trc-sub"> · encore {suivant.seuil - venues} pour {suivant.nom}</span>}
        </div>

        {enAttente.length > 0 && (
          <div style={{ display: 'grid', gap: 6 }}>
            {enAttente.map((s) => (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '10px 12px', borderRadius: 8, background: 'var(--copper-50, #FAF1E9)', border: '1px solid var(--copper-300, #D6A06F)' }}>
                <span style={{ fontSize: 13 }}><b style={{ fontWeight: 500 }}>{s.libelle}</b> · <span className="trc-sub">{s.raison}</span></span>
                <span style={{ fontSize: 11.5, color: 'var(--copper-700)', whiteSpace: 'nowrap' }}>{genreDit(s, client.choixRecompenses)}</span>
              </div>
            ))}
          </div>
        )}
        {soins.filter((s) => s.utiliseLe).map((s) => (
          <span key={s.id} className="trc-sub" style={{ fontSize: 12 }}>{s.libelle} offert, utilisé le {dateCourte(s.utiliseLe)}{s.piece ? ` (${s.piece})` : ''}</span>
        ))}

        <VientDeLaPartDe client={client} />

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
