import { useEffect, useState } from 'react';
import { Modal, Button, Field, Input, ChampTelephone } from '../../../ds/components';
import { useBranch } from '../../../shared/branches';
import { useClients } from '../../../shared/clients';
import { poserAppel } from '../../../shared/appels';
import { numeroTelReel } from '../../../shared/geo';
import { ClientPicker, todayISO, addDaysISO } from '../routes/clients/_shared';

/* LE MODALE « APPEL REÇU » — poser l'appel en trois secondes. On choisit à chaque
   fois : un simple rappel (avec sa date), ou un rendez-vous à caler. */
export function AppelRecuModal({ open, onClose, initial }: {
  open: boolean;
  onClose: () => void;
  /** Pré-remplissage venu d'un partage « Partager → Le Trône » (numéro/nom). */
  initial?: { phone?: string; nom?: string } | null;
}) {
  const { branch } = useBranch();
  const [clients] = useClients();
  const [clientId, setClientId] = useState('');
  const [nom, setNom] = useState('');
  const [phone, setPhone] = useState('');
  const [motif, setMotif] = useState('');
  const [suite, setSuite] = useState<'rappel' | 'rdv'>('rappel');
  const [quand, setQuand] = useState(todayISO());

  useEffect(() => {
    if (!open) return;
    setMotif(''); setSuite('rappel'); setQuand(todayISO());
    /* PARTAGE → LE TRÔNE : si un numéro arrive, on tente de reconnaître la fiche
       (mêmes chiffres) ; sinon on ouvre en « nouvelle », le numéro déjà posé. */
    const digits = (s?: string) => (s ?? '').replace(/\D/g, '');
    const p = initial?.phone;
    const match = p ? clients.find((c) => c.phone && digits(c.phone) === digits(p)) : undefined;
    if (match) { setClientId(match.id); setNom(''); setPhone(''); }
    else { setClientId(''); setNom(initial?.nom ?? ''); setPhone(p ?? ''); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const client = clients.find((c) => c.id === clientId);
  const nomFinal = client ? client.name : nom.trim();
  const phoneFinal = client ? client.phone : numeroTelReel(phone);
  const jj = todayISO();
  const demain = addDaysISO(jj, 1);

  const enregistrer = () => {
    if (!nomFinal) return;
    poserAppel({
      branchId: branch.id,
      clientId: clientId || undefined,
      nom: nomFinal,
      phone: phoneFinal || undefined,
      motif: motif.trim(),
      suite,
      quand: suite === 'rappel' ? quand : undefined,
    });
    onClose();
  };

  const optStyle = (on: boolean) => ({
    border: `1px solid ${on ? 'var(--color-copper)' : 'var(--hairline)'}`,
    background: on ? 'var(--copper-50, #FAF1E9)' : 'var(--surface, #fff)',
    borderRadius: 4, padding: '12px 14px', cursor: 'pointer', textAlign: 'left' as const, flex: 1,
    boxShadow: on ? 'inset 0 0 0 1px var(--copper-300, #E3C9AE)' : 'none',
  });
  const pillStyle = (on: boolean) => ({
    border: `1px solid ${on ? 'var(--color-indigo)' : 'var(--hairline)'}`,
    background: on ? 'var(--color-indigo)' : 'var(--surface, #fff)',
    color: on ? '#fff' : 'var(--ink-soft)',
    borderRadius: 999, padding: '4px 12px', fontSize: 12.5, cursor: 'pointer',
  });

  return (
    <Modal title="Appel reçu." onClose={onClose} width={540}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="Qui a appelé">
          <ClientPicker value={clientId} onChange={setClientId} placeholder="Chercher une cliente (nom, téléphone)…" />
        </Field>

        {!clientId && (
          <div style={{ display: 'grid', gap: 10 }}>
            <Field label="… ou une nouvelle : son nom">
              <Input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom et prénom" />
            </Field>
            <Field label="Son numéro">
              <ChampTelephone value={phone} onChange={setPhone} dialDefaut={branch.dial} />
            </Field>
          </div>
        )}

        <Field label="Ce qu'elle veut · une phrase">
          <Input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Ex. Un RDV pour ses locks, plutôt samedi matin." />
        </Field>

        <div>
          <span className="trc-microlabel">Que faire de cet appel</span>
          <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
            <button type="button" style={optStyle(suite === 'rappel')} onClick={() => setSuite('rappel')}>
              <div style={{ fontWeight: 500, color: 'var(--color-indigo)', fontSize: 14 }}>Me le rappeler</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 3, lineHeight: 1.4 }}>Une ligne sur le Tableau de bord, la cloche insiste, jusqu'à ce que ce soit traité.</div>
              {suite === 'rappel' && (
                <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                  <button type="button" style={pillStyle(quand === jj)} onClick={() => setQuand(jj)}>Aujourd'hui</button>
                  <button type="button" style={pillStyle(quand === demain)} onClick={() => setQuand(demain)}>Demain</button>
                  <Input type="date" value={quand} onChange={(e) => setQuand(e.target.value)} style={{ padding: '4px 8px', fontSize: 12.5, width: 150 }} />
                </div>
              )}
            </button>
            <button type="button" style={optStyle(suite === 'rdv')} onClick={() => setSuite('rdv')}>
              <div style={{ fontWeight: 500, color: 'var(--color-indigo)', fontSize: 14 }}>Un RDV à caler</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 3, lineHeight: 1.4 }}>À traiter : depuis la liste, un tap ouvre sa fiche pour poser le créneau.</div>
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button variant="copper" style={{ flex: 1 }} onClick={enregistrer} disabled={!nomFinal}>
            Enregistrer l'appel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
