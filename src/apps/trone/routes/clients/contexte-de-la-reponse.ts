import { useClients, useFamilies } from '../../../../shared/clients';
import { useCategories, useServices } from '../../../../shared/catalog';
import { personalPriceXof, pricingOf, useBandSets, useModelBands } from '../../../../shared/pricing';
import { useInvoices } from '../../../../shared/finance';
import { ecrituresDeLaTete, ecrituresDuCompte, lignesImpayees, tetesDuCompte } from '../../../../shared/compte';
import type { Fil } from '../../../../shared/conversations';
import { apptDueXof, apptNetXof, todayISO, useBranchAppointmentsAvecEssais, useServicesById } from './_shared';
import {
  contextePourClaude, derniereVenueDe, lignesDuCataloguePourClaude, paliersDeLocks, prochainRdvDe, type JourDePlaces,
} from '../../../../shared/ia-reponse-wa-pur';

/* ══ CE QUE CLAUDE REÇOIT POUR ÉCRIRE UNE RÉPONSE — UNE SEULE SOURCE ══════
   Sorti de `ReponseProposee` le 21 novembre 2026, quand Perle (« Demander à
   Perle », second lot) s'est mise à préparer des réponses elle aussi : le
   bouton du composeur et Perle lisent le fil, la fiche et le catalogue par
   CETTE fonction, pour que le reste dû, les prix par palier et le prochain
   rendez-vous ne divergent jamais d'un écran à l'autre.

   Le crochet lit les magasins ; la fonction qu'il rend compose le contexte
   d'un fil au moment où on la demande. Elle n'envoie rien, n'écrit rien. */
export type OptionsDuContexte = {
  /** La proposition qu'on vient d'écarter (« Une autre »). */
  dejaProposee?: string;
  /** Des places VÉRIFIÉES au Carnet ; absent = l'agenda n'a pas été consulté. */
  places?: readonly JourDePlaces[];
  /** Le jour de la Maison (AAAA-MM-JJ) ; par défaut celui du poste. */
  aujourdhui?: string;
};

export function useContexteDeLaReponse(): (fil: Fil, o?: OptionsDuContexte) => string {
  const [clients] = useClients();
  const [familles] = useFamilies();
  const rendezVous = useBranchAppointmentsAvecEssais();
  const byId = useServicesById();
  const [services] = useServices();
  const [categories] = useCategories();
  const [factures] = useInvoices();
  const [bandes] = useModelBands();
  const [jeux] = useBandSets();

  return (fil, o = {}) => {
    const fiche = fil.clientId ? clients.find((c) => c.id === fil.clientId) : undefined;
    const aujourdhui = o.aujourdhui ?? todayISO();
    const nomDe = (id: string) => byId.get(id)?.name ?? '';
    /* CE QUI LUI RESTE À RÉGLER, comme sa fiche le dit (« Ce qui reste dû ») :
       ses lignes à elle dans le relevé de son compte. Le rituel fait foi, la
       facture qui lui est liée ne se recompte pas, la facture libre entre. */
    const resteDu = fiche
      ? lignesImpayees(ecrituresDeLaTete(ecrituresDuCompte({
        ids: tetesDuCompte(fiche, clients, familles), porteurs: [], appts: rendezVous, invoices: factures, credits: [],
        aujourdhui, netDuRituel: (a) => apptNetXof(a, byId), dûDuRituel: (a) => apptDueXof(a, byId),
      }), fiche.id)).reduce((s, l) => s + l.resteXof, 0)
      : undefined;
    return contextePourClaude({
      fil: fil.messages,
      fiche,
      nomProfil: fil.sansFiche ? fil.nom : undefined,
      prochainRdv: fiche ? prochainRdvDe(rendezVous, fiche.id, aujourdhui, nomDe) : null,
      derniereVenue: fiche ? derniereVenueDe(rendezVous, fiche.id, aujourdhui, nomDe) : null,
      resteDu,
      /* SANS AGENDA, SAUF PLACES VÉRIFIÉES : les places libres dépendent du
         geste voulu (sa durée, le maître), et c'est le serveur qui les juge
         pour le site et pour l'automate. Le bouton du composeur n'en passe
         donc aucune, et Claude n'en promet aucune ; Perle ne passe que la
         place que la direction a citée et que le Carnet montre libre. */
      ...(o.places ? { places: o.places } : {}),
      /* LES PRIX PAR PALIER DE LOCKS (27 octobre 2026), comme la réservation du
         site : le barème du Trône à chaque palier, et son prix à elle quand la
         Maison a compté ses locks. Claude ne cote qu'une fois le nombre connu. */
      catalogue: lignesDuCataloguePourClaude(services.map((sv) => {
        if (sv.archived === true || sv.hidePrice === true) return sv;
        const prixParPalier = paliersDeLocks(bandes).map((b) => ({
          palier: b.palier,
          prixXof: personalPriceXof(sv, pricingOf({ lockCount: b.locks, priceCoef: 1 }, bandes, jeux, categories), services),
        }));
        const pourElle = fiche?.lockCount && fiche.lockCount > 0 ? personalPriceXof(sv, pricingOf(fiche, bandes, jeux, categories), services) : 0;
        return { ...sv, prixParPalier, ...(pourElle > 0 ? { prixPourElle: pourElle } : {}) };
      }), categories),
      locks: fiche ? { compte: fiche.lockCount, declare: fiche.lockCountDeclare } : undefined,
      aujourdhui,
      dejaProposee: o.dejaProposee,
    });
  };
}
