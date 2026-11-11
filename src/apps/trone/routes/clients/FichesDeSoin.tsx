import { useEffect, useRef, useState } from 'react';
import { Button, refus, toast } from '../../../../ds/components';
import { supabase } from '../../../../shared/supabase';
import { COFFRE_PIECES, PIECE_MAX_OCTETS } from '../../../../shared/pieces-des-clientes';
import { dossierDesFiches, estUneFiche, ficheLue, nomDeLaFiche } from '../../../../shared/fiches-de-soin-pur';
import { fmtDateFr } from '../../../../shared/pdf-de-la-piece-pur';

/* ══ FICHES DE SOIN, EN TÊTE DE L'ONGLET DOCUMENTS · 11 novembre 2026 ══════
   « ranger les fiches de M. G. » (Y.). Les PDF de ses programmes,
   dans le coffre privé des pièces : la liste est celle du dossier
   (fiches-de-soin-pur.ts), « Ouvrir » demande une adresse signée d'une heure,
   « Ajouter une fiche » dépose un PDF. Hors ligne, la liste le dit. */

type Fichier = { name: string; created_at?: string | null };

export default function FichesDeSoin({ clientId }: { clientId: string }) {
  const [fichiers, setFichiers] = useState<Fichier[] | null>(null);
  const [hors, setHors] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const choix = useRef<HTMLInputElement>(null);
  const dossier = dossierDesFiches(clientId);

  const relis = async () => {
    if (!supabase) { setHors(true); setFichiers([]); return; }
    const { data, error } = await supabase.storage.from(COFFRE_PIECES).list(dossier, { limit: 100, sortBy: { column: 'name', order: 'asc' } });
    if (error) { setHors(true); setFichiers([]); return; }
    setHors(false);
    setFichiers(((data ?? []) as Fichier[]).filter((f) => estUneFiche(f.name)));
  };
  useEffect(() => { setFichiers(null); void relis(); }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  const ouvre = async (nom: string) => {
    if (!supabase) return;
    const fenetre = window.open('', '_blank');
    const { data, error } = await supabase.storage.from(COFFRE_PIECES).createSignedUrl(`${dossier}/${nom}`, 3600);
    if (error || !data?.signedUrl) { fenetre?.close(); refus('La fiche ne s’ouvre pas. Réessayez une fois en ligne.'); return; }
    if (fenetre) fenetre.location.href = data.signedUrl; else window.location.href = data.signedUrl;
  };

  const depose = async (f: File) => {
    if (!supabase) { refus('Hors ligne : la fiche partira une fois en ligne.'); return; }
    if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') { refus('Seul un PDF se range ici.'); return; }
    if (f.size > PIECE_MAX_OCTETS) { refus('Ce PDF est trop lourd.'); return; }
    setEnvoi(true);
    const corps = f.type === 'application/pdf' ? f : new Blob([f], { type: 'application/pdf' });
    const { error } = await supabase.storage.from(COFFRE_PIECES).upload(`${dossier}/${nomDeLaFiche(f.name)}`, corps, { contentType: 'application/pdf', upsert: false });
    setEnvoi(false);
    if (error) { refus(/exists|duplicate/i.test(error.message) ? 'Une fiche porte déjà ce nom.' : 'La fiche n’a pas été rangée.'); return; }
    toast('Fiche rangée.');
    void relis();
  };

  return (
    <section className="trc-docs">
      <header className="trc-docs__tete">
        <h3 className="trc-docs__titre">Fiches de soin</h3>
        <span className="trc-docs__resume">
          {fichiers === null ? '…' : hors ? 'hors ligne' : `${fichiers.length} fiche${fichiers.length > 1 ? 's' : ''}`}
        </span>
      </header>
      {fichiers && fichiers.length > 0 && (
        <ul className="trc-fiches">
          {fichiers.map((f) => {
            const l = ficheLue(f.name);
            return (
              <li key={f.name} className="trc-fiches__ligne">
                <span className="trc-fiches__titre">{l.titre}</span>
                <span className="trc-fiches__qui">
                  {[l.pourLaCliente ? 'à lui remettre' : l.interne ? 'interne' : '', f.created_at ? `rangée le ${fmtDateFr(f.created_at.slice(0, 10))}` : ''].filter(Boolean).join(' · ')}
                </span>
                <Button size="sm" variant="ghost" onClick={() => void ouvre(f.name)}>Ouvrir</Button>
              </li>
            );
          })}
        </ul>
      )}
      <div>
        <input ref={choix} type="file" accept="application/pdf,.pdf" hidden
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void depose(f); }} />
        <Button size="sm" variant="ghost" disabled={envoi} onClick={() => choix.current?.click()}>
          {envoi ? 'Rangement…' : '+ Ajouter une fiche (PDF)'}
        </Button>
      </div>
    </section>
  );
}
