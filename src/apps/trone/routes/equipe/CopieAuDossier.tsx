import { useEffect, useState } from 'react';
import { Button, toast } from '../../../../ds/components';
import { copiesAuDossier, adresseDuCertificat, type CopieDeCertificat } from '../../../../shared/certificats-coffre';

/* ══ LA DERNIÈRE VERSION ENREGISTRÉE — 16 septembre 2026 ═══════════════
   « Me permettre de sauvegarder le certificat », puis « quand j'enregistre
   le certificat, je veux que cette dernière version soit sur la page de
   certification » (Yéman).

   Le certificat enregistré depuis sa page dépose sa copie au coffre des
   certificats, sous un dossier (l'inscription quand il y en a une, sinon la
   certification elle-même). Elle se retrouve ici, au Suivi comme à l'onglet
   Certifications, et se rouvre par un lien signé d'une heure. Le coffre se
   relit quand la fenêtre reprend le focus : on revient de la page du
   certificat, la version est là. */

const quand = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export default function CopieAuDossier({ dossier, compact }: { dossier: string; compact?: boolean }) {
  const [copies, setCopies] = useState<CopieDeCertificat[] | null>(null);
  useEffect(() => {
    let vivant = true;
    const relit = () => { void copiesAuDossier(dossier).then((c) => { if (vivant) setCopies(c); }); };
    relit();
    window.addEventListener('focus', relit);
    return () => { vivant = false; window.removeEventListener('focus', relit); };
  }, [dossier]);
  const ouvre = async (chemin: string) => {
    const url = await adresseDuCertificat(chemin);
    if (url) window.open(url, '_blank', 'noopener');
    else toast('Le coffre n’a pas rendu ce certificat.');
  };
  const petit = { fontSize: 11.5 } as const;
  if (copies === null) return <div className="mnd-muted" style={petit}>Le coffre se lit…</div>;
  if (copies.length === 0) {
    return (
      <div className="mnd-muted" style={petit}>
        Aucune version enregistrée. Ouvrez le certificat, puis « Enregistrer le PDF » : la dernière version se retrouve ici.
      </div>
    );
  }
  const derniere = copies[0];
  if (compact) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
        <span className="mnd-muted" style={petit}>Dernière version enregistrée le {quand(derniere.deposeLe)}</span>
        <button type="button" className="tre-link-btn" onClick={() => void ouvre(derniere.chemin)}>Ouvrir le PDF</button>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
      <div className="tre-sec-label">Dernière version enregistrée</div>
      {copies.map((c, i) => (
        <div key={c.chemin} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderTop: '1px solid var(--hairline)', paddingTop: 8 }}>
          <span style={{ fontSize: 13 }}>{c.nom}</span>
          <span className="mnd-muted" style={petit}>{i === 0 ? 'enregistrée' : 'version antérieure'} le {quand(c.deposeLe)}</span>
          <Button variant="ghost" size="sm" style={{ marginLeft: 'auto' }} onClick={() => void ouvre(c.chemin)}>Ouvrir</Button>
        </div>
      ))}
    </div>
  );
}
