import { useCallback, useMemo } from 'react';
import { Modal } from '../../../../ds/components';
import { useAppointments, type Appointment } from '../../../../shared/agenda';
import { useCategories, useProducts, type Service } from '../../../../shared/catalog';
import { useClients } from '../../../../shared/clients';
import { useBandSets, useModelBands } from '../../../../shared/pricing';
import { apptLabel, tarifsDuRituel, useServicesById } from './_shared';
import { DevisEnDirect } from './DevisEnDirect';
import { ReglementEnDirect } from './ReglementEnDirect';

/* ══ EN DIRECT, D'UN TOUCHER — 23 novembre 2026 ══════════════════════════
   « Facilite l'accès au règlement en direct et devis en direct, trop
   compliqué » (Yéman, pendant l'essai du Sceau). Les deux panneaux vivaient
   au fond de la fenêtre « Encaisser » : ouvrir Encaisser, déplier « Et
   ensuite », descendre. Trois gestes pour trouver ce qui doit se faire devant
   elle, au fauteuil.

   UNE FENÊTRE À EUX DEUX, RIEN DE REPLIÉ. Elle s'ouvre depuis la ligne du
   rendez-vous (Tableau de bord, Carnet) et ne montre que cela : son devis,
   son règlement. Ce sont les MÊMES panneaux que dans « Encaisser », pas une
   copie : `DevisEnDirect`, `ReglementEnDirect`. Rien ne s'y calcule de neuf.

   L'ORDRE SUIT LA SÉANCE. Tant que la séance n'est pas terminée, sa note
   n'existe pas : le devis vient d'abord, déjà ouvert pour être composé, et le
   règlement dit seulement quand il s'ouvrira. Dès que la note est partie, le
   règlement passe devant : c'est lui qu'on regarde.

   CETTE FENÊTRE N'ENCAISSE RIEN et ne termine rien : « Terminer » et
   « Encaisser » gardent leur place, sur la ligne. */
export function EnDirect({ appt: entrant, onClose }: { appt: Appointment; onClose: () => void }) {
  /* Le rendez-vous se relit au magasin : la copie qu'on tient en main vieillit
     dès que la séance se termine ou que le lien se pose. */
  const [rdvs] = useAppointments();
  const appt = rdvs.find((a) => a.id === entrant.id) ?? entrant;

  const byId = useServicesById();
  const [clients] = useClients();
  const [bands] = useModelBands();
  const [sets] = useBandSets();
  const [categories] = useCategories();
  const [produits] = useProducts();
  const client = clients.find((c) => c.id === appt.clientId);

  /* Les prix du devis sont ceux du Trône pour SA tête : un seul calcul, puis
     une lecture par prestation. */
  const services = useMemo(() => [...byId.values()], [byId]);
  const tarifs = useMemo(
    () => tarifsDuRituel(appt, { client, bands, sets, cats: categories, byId, tousServices: services, produits }),
    [appt, client, bands, sets, categories, byId, services, produits],
  );
  const prixDuService = useCallback((sv: Service) => tarifs.prixPlein(sv), [tarifs]);

  const nom = client?.name ?? appt.clientName ?? 'Cliente de passage';
  const saNoteExiste = !!appt.lienDeReglement;

  const devis = <DevisEnDirect appt={appt} services={services} prixDuService={prixDuService} ouvertDAbord={!saNoteExiste} />;
  const reglement = saNoteExiste ? (
    <ReglementEnDirect appt={appt} />
  ) : (
    <section aria-label="Le règlement en direct" style={{ border: '1px solid var(--line, #E5D8C6)', borderRadius: 8, padding: '12px 14px', display: 'grid', gap: 6, background: 'var(--paper, #FFFDF9)' }}>
      <span style={{ font: '500 11px Jost, system-ui, sans-serif', letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--copper, #9A6036)' }}>Le règlement en direct</span>
      <p style={{ margin: 0, fontSize: 13 }} className="mnd-muted">
        Il s’ouvre ici dès que la séance est terminée : sa note part sur son WhatsApp, et vous suivez pas à pas ce qu’elle en fait.
      </p>
    </section>
  );

  return (
    <Modal title={`En direct · ${nom}`} onClose={onClose} width={720}>
      <div style={{ display: 'grid', gap: 14 }}>
        <p style={{ margin: 0, fontSize: 13 }} className="mnd-muted">{apptLabel(appt, byId)} · {appt.time}</p>
        {saNoteExiste ? <>{reglement}{devis}</> : <>{devis}{reglement}</>}
      </div>
    </Modal>
  );
}
