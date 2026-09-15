import { useMemo, useRef, useState } from 'react';
import { Button, Field, toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { useClients, useFamilies } from '../../../../shared/clients';
import { useAppointments } from '../../../../shared/agenda';
import { useBilans } from '../../../../shared/bilans';
import { useServices } from '../../../../shared/catalog';
import { estMineur } from '../../../../shared/accounts';
import {
  useInvoices, invoiceTotal, invoiceResteXof, useCredits, creditBalanceOf,
} from '../../../../shared/finance';
import {
  useSubscribers, usePlans, contratPourLaDate, usageDetaille,
  rdvCouvertsHorsFormule, retardDuContrat,
} from '../../../../shared/abonnements';
import { invoiceEnPiece, type PieceRendue } from '../../../../shared/pdf';
import {
  lesGestes, releveDuFoyer, gesteDit,
  type Geste, type CleDuGeste, type PieceAJoindre, type PieceDuGeste,
  type SuiviDAbonnement, type ReleveDuFoyer,
} from '../../../../shared/gestes-conversation';
import {
  useCodesPromo, codesPromoStore, codesVivantsDe, fabriqueLeCode,
  pourquoiOnNePeutPasFabriquer, instantDit, HEURES_DE_LA_PROMO, REMISE_MAX_PCT,
  type CodePromo,
} from '../../../../shared/promos';
import { lienPaiementMomo, useAutoConfig } from '../equipe/data';
import { todayISO } from './_shared';

/* ═══════════════════════════════════════════════════════════════════
   LA BARRE D'OUTILS D'UNE CONVERSATION — maquette
   `public/maquette-la-conversation-outillee.html`, validée le 14 septembre
   2026.

   « Comment avoir les boutons de l'automatisation, rappels de RDV, factures,
   itinéraires, codes QR, paiements… Comment aussi joindre des fichiers ? »
   Puis : « Rajoute ses devis, ses photos, et son bilan à remettre »,
   « rajoute suivi d'abonnement », « rajoute dans les raccourcis le bilan du
   foyer avec les impayés », « des promos flash avec des codes de
   réductions ? » (Yéman).

   CE FICHIER NE DÉCIDE RIEN. Les dix gestes, ce qu'ils écrivent et pourquoi
   ils s'éteignent vivent dans `shared/gestes-conversation.ts`, qui est pur et
   éprouvé par son harnais. Ici, on RÉCOLTE ce que les magasins savent, on le
   tend au juge, et on dessine ce qu'il rend. La tentation de trancher un cas
   « juste ici, vite fait » est exactement ce qui fait diverger deux écrans.

   RIEN NE PART D'UN SEUL CLIC. Un geste REMPLIT la zone de saisie ; c'est la
   main qui relit et qui envoie. Un bouton qui expédierait directement finirait
   par envoyer une facture à la mauvaise tête un soir de rush.
   ═══════════════════════════════════════════════════════════════════ */

/** CE QU'UNE CONVERSATION A BESOIN DE SAVOIR pour se doter d'outils. */
export type FilOutille = {
  numero: string;
  nom: string;
  clientId?: string;
  fenetreOuverte: boolean;
};

/* ── L'HEURE COURANTE, EN HH:MM ────────────────────────────────────
   Elle décide si le rituel de ce matin est encore « à venir ». */
const heureCourante = (): string => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export function useGestesDuFil(fil: FilOutille | null): {
  gestes: Geste[];
  codesVivants: CodePromo[];
  foyer?: ReleveDuFoyer;
} {
  const { branch, currency } = useBranch();
  const [clients] = useClients();
  const [familles] = useFamilies();
  const [invoices] = useInvoices();
  const [appts] = useAppointments();
  const [bilans] = useBilans();
  const [credits] = useCredits();
  const [subs] = useSubscribers();
  const [plans] = usePlans();
  const [services] = useServices();
  const [codes] = useCodesPromo();
  const [auto] = useAutoConfig();

  const aujourdhui = todayISO();
  const maintenant = new Date().toISOString();

  return useMemo(() => {
    const tete = fil?.clientId ? clients.find((c) => c.id === fil.clientId) : undefined;

    /* LES PIÈCES, RÉDUITES À CE QUE LE JUGE LIT. On calcule le total et le
       reste UNE fois ici : les recompter dans le juge l'obligerait à
       connaître toute la finance, et à s'en tenir à jour. */
    const pieces: PieceDuGeste[] = invoices
      .filter((i) => i.branchId === branch.id)
      .map((i) => ({
        id: i.id, branchId: i.branchId, kind: i.kind, number: i.number,
        clientId: i.clientId, date: i.date, status: i.status, apptId: i.apptId,
        totalXof: invoiceTotal(i), resteXof: invoiceResteXof(i),
      }));
    const carnet = appts.filter((a) => a.branchId === branch.id);

    /* ── LE SUIVI D'ABONNEMENT — repris de l'écran Abonnements, JAMAIS
          recompté. Deux façons de compter la même chose finissent par
          diverger d'un jeton, et c'est celle qu'on envoie qu'il faudra
          défendre devant la cliente. */
    let abonnement: SuiviDAbonnement | undefined;
    if (tete) {
      const sub = contratPourLaDate(subs.filter((s) => s.branchId === branch.id), tete.id, aujourdhui, plans);
      const plan = sub ? plans.find((p) => p.id === sub.planId) : undefined;
      if (sub) {
        const lignes = usageDetaille(sub, plan, carnet).map((l) => ({
          nom: services.find((s) => s.id === l.serviceId)?.name ?? 'prestations',
          reste: l.remaining,
          total: l.qty,
        }));
        abonnement = {
          formule: plan?.name ?? 'votre formule',
          mode: plan?.mode === 'pack' ? 'pack' : 'cycle',
          lignes,
          expireLe: sub.expiresIso ?? undefined,
          prochaineEcheance: sub.nextIso ? { date: sub.nextIso, montantXof: sub.mrrXof } : undefined,
          retardXof: retardDuContrat(sub, aujourdhui),
          couvertsHorsFormule: rdvCouvertsHorsFormule(sub, plan, carnet).length,
        };
      }
    }

    /* ── LE FOYER — l'argent de tous, le soin de celles qu'elle porte. */
    let foyer: ReleveDuFoyer | undefined;
    const famille = tete?.familyId
      ? familles.find((f) => f.id === tete.familyId)
      : familles.find((f) => f.payerClientId === tete?.id);
    if (tete && famille) {
      foyer = releveDuFoyer({
        famille,
        clients: clients.filter((c) => c.branchId === branch.id),
        pieces, appts: carnet, bilans,
        avoirXof: creditBalanceOf(credits, { type: 'family', id: famille.id }),
        aujourdhui,
        estMineure: (c, auj) => estMineur(c, auj),
      });
    }

    const codesVivants = tete
      ? codesVivantsDe(codes, tete.id, maintenant, branch.id)
      : [];

    const gestes = lesGestes({
      branchId: branch.id,
      maison: branch.name ?? 'la Maison',
      tete,
      fenetreOuverte: !!fil?.fenetreOuverte,
      aujourdhui,
      heure: heureCourante(),
      enFrancs: (x) => fmtMoney(x, currency),
      lienDePaiement: (x) => lienPaiementMomo(x),
      itineraire: (auto as { itineraire?: string }).itineraire ?? '',
      pieces, appts: carnet, bilans,
      photos: tete?.photo ? 1 : 0,
      abonnement, foyer, codesVivants,
    });

    return { gestes, codesVivants, foyer };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fil?.clientId, fil?.fenetreOuverte, clients, familles, invoices, appts, bilans,
    credits, subs, plans, services, codes, auto, branch.id, currency, aujourdhui]);
}

/* ══ RÉSOUDRE UNE PIÈCE EN OCTETS ════════════════════════════════════

   Le juge dit QUELLE pièce joindre ; il ne la fabrique pas — composer un
   message ne doit pas construire trois PDF pour rien. C'est au moment de
   l'envoi, et seulement là, qu'on la construit. */
export async function pieceEnOctets(
  p: PieceAJoindre,
  invoices: { id: string }[],
  construitLaFacture: (id: string) => Promise<PieceRendue | null>,
): Promise<PieceRendue | null> {
  if (p.quoi === 'facture' || p.quoi === 'devis') {
    if (!invoices.some((i) => i.id === p.invoiceId)) return null;
    return construitLaFacture(p.invoiceId);
  }
  /* LE BILAN ET LES PHOTOS N'ONT PAS ENCORE DE CORPS. Le bilan vit dans une
     page imprimable (`bilan.html`), pas dans un constructeur de PDF ; les
     photos de séance n'ont nulle part où vivre (voir la maquette, « où
     vivent les photos d'une séance »). Le geste compose donc son message,
     et l'écran dit franchement que la pièce suivra. Mentir ici enverrait un
     message qui annonce un fichier absent. */
  return null;
}

/* ══ LA BARRE ════════════════════════════════════════════════════════ */

export function BarreDesGestes({
  gestes, surGeste, surPromo, occupe,
}: {
  gestes: Geste[];
  surGeste: (g: Geste) => void;
  surPromo: () => void;
  occupe?: boolean;
}) {
  return (
    <div className="trc-gestes">
      {gestes.map((g) => (
        <button
          key={g.cle}
          type="button"
          className={`trc-geste${g.eteint ? ' est-eteint' : ''}`}
          disabled={!!g.eteint || !!occupe}
          /* UN BOUTON ÉTEINT DIT POURQUOI — au survol, et à l'écran quand on
             le choisit. Onze boutons muets sont un mur. */
          title={g.eteint ?? (g.avertit ? `${g.mot} · ${g.avertit}` : g.mot)}
          onClick={() => (g.cle === 'promo' ? surPromo() : surGeste(g))}
        >
          <b>{g.mot}</b>
          {g.dit ? <span className="trc-geste__dit">· {g.dit}</span> : null}
          {g.attend ? <span className="trc-geste__du">{g.attend}</span> : null}
        </button>
      ))}
    </div>
  );
}

/* ══ JOINDRE UN FICHIER DE L'APPAREIL ════════════════════════════════

   RIEN DE PUBLIC : le fichier monte au serveur, qui le dépose chez Meta et
   n'en garde que l'identifiant. Il ne passe jamais par le coffre de la
   Maison, donc aucune adresse n'existe — c'est la décision du 14 septembre,
   et son prix est le plafond de cinq mégaoctets. */
export const TAILLE_MAX_OCTETS = 5 * 1024 * 1024;

export function ChoisirUnFichier({
  surFichier, occupe,
}: {
  surFichier: (p: PieceRendue) => void;
  occupe?: boolean;
}) {
  const champ = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        className="trc-geste trc-geste--cuivre"
        disabled={occupe}
        title="Une photo, une capture, un PDF de votre appareil"
        onClick={() => champ.current?.click()}
      >
        <b>+ Pièce jointe</b>
      </button>
      <input
        ref={champ}
        type="file"
        hidden
        accept="image/*,application/pdf,.pdf,.csv,.txt"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          if (f.size > TAILLE_MAX_OCTETS) {
            toast(`Cette pièce pèse ${Math.round(f.size / 104857.6) / 10} Mo. La Maison n’envoie rien par un lien public, donc le fichier passe par le serveur : au-delà de 5 Mo, allégez-le d’abord.`);
            return;
          }
          const lecteur = new FileReader();
          lecteur.onload = () => surFichier({
            nom: f.name.slice(0, 120),
            type: f.type || 'application/octet-stream',
            donnees: String(lecteur.result ?? ''),
          });
          lecteur.onerror = () => toast('Ce fichier n’a pas pu être lu.');
          lecteur.readAsDataURL(f);
        }}
      />
    </>
  );
}

/* ══ LA PROMO FLASH ══════════════════════════════════════════════════

   UN CODE PAR CLIENTE, À USAGE UNIQUE, 48 HEURES. Le panneau ne fabrique
   rien tout seul : il propose, une main valide, et le code naît avec son
   message déjà écrit.

   LA DIRECTION SEULE EN CRÉE — une remise est de l'argent qui sort. La vraie
   barrière est la RLS (0093) ; ce garde-ci n'est que la politesse de ne pas
   montrer un bouton qui refusera. */
export function PanneauDeLaPromo({
  tete, estDirection, parQui, vivants, surCode, surFermer,
}: {
  tete: { id: string; name: string };
  estDirection: boolean;
  parQui?: string;
  vivants: CodePromo[];
  surCode: (c: CodePromo, message: string) => void;
  surFermer: () => void;
}) {
  const { branch } = useBranch();
  const [codes] = useCodesPromo();
  const [services] = useServices();
  const [mot, setMot] = useState('Éclat');
  const [pct, setPct] = useState('15');
  const [serviceId, setServiceId] = useState('');
  const [heures, setHeures] = useState(String(HEURES_DE_LA_PROMO));

  const prenom = tete.name.split(/\s+/)[0] ?? tete.name;
  const aFabriquer = {
    branchId: branch.id,
    clientId: tete.id,
    clientNom: tete.name,
    mot,
    remisePct: Number(pct) || 0,
    serviceId: serviceId || undefined,
    heures: Number(heures) || HEURES_DE_LA_PROMO,
    parQui,
  };
  const empeche = pourquoiOnNePeutPasFabriquer(aFabriquer);

  const pose = () => {
    if (empeche) { toast(empeche); return; }
    const neuf = fabriqueLeCode(aFabriquer, codes);
    const quoi = serviceId
      ? (services.find((s) => s.id === serviceId)?.name ?? 'votre prochaine prestation')
      : 'votre prochain rituel';
    const message = `${prenom}, la Maison vous offre −${Math.round(Number(pct))} % sur ${quoi}, avec le code ${neuf.code}, valable jusqu’à ${instantDit(neuf.expireLe)}. Il n’appartient qu’à vous et ne sert qu’une fois.`;
    codesPromoStore.set((prev) => [...prev, { ...neuf, note: message }]);
    surCode(neuf, message);
  };

  return (
    <div className="trc-modal-fond" onClick={surFermer}>
      <div className="trc-modal" onClick={(e) => e.stopPropagation()}>
        <div className="trc-modal__t">Promo flash pour {prenom}</div>

        {vivants.length > 0 && (
          <p className="trc-sub" style={{ marginTop: 0 }}>
            Elle porte déjà {vivants.length === 1 ? 'un code vivant' : `${vivants.length} codes vivants`} :{' '}
            <b>{vivants.map((c) => c.code).join(', ')}</b>. Le plus pressé meurt {instantDit(vivants[0].expireLe)}.
            {' '}En poser un autre ne l’annule pas.
          </p>
        )}

        {!estDirection ? (
          <p className="trc-sub" style={{ marginTop: 0 }}>
            Une remise est de l’argent qui sort : <b>seule la direction crée un code</b>.
            Tout le monde peut l’honorer au comptoir.
          </p>
        ) : (
          <>
            <div className="trc-promo__champs">
              <Field label="Le mot">
                <input className="mnd-input" value={mot} onChange={(e) => setMot(e.target.value)} />
              </Field>
              <Field label="L’avantage (%)">
                <input
                  className="mnd-input" inputMode="numeric" value={pct}
                  onChange={(e) => setPct(e.target.value.replace(/\D/g, '').slice(0, 2))}
                />
              </Field>
              <Field label="Valable (heures)">
                <input
                  className="mnd-input" inputMode="numeric" value={heures}
                  onChange={(e) => setHeures(e.target.value.replace(/\D/g, '').slice(0, 4))}
                />
              </Field>
            </div>

            <Field label="Sur quoi">
              <select className="mnd-input" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
                <option value="">Tout le rituel</option>
                {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>

            {/* ── CE QUE LA PROMO COÛTE — 15 septembre 2026 ──────────────
                « Combien Meta facture une conversation de 24 h ? » (Yéman).
                Ce panneau ne disait rien du coût, alors que c'est le geste qui
                envoie des modèles MARKETING — les plus chers de tous. */}
            <p className="trc-sub">
              <b>Pendant une fenêtre ouverte, cet envoi ne coûte rien.</b> Hors fenêtre,
              il faudrait un modèle marketing approuvé, et Meta facture chaque modèle
              envoyé — depuis juillet 2025, au message et non à la conversation.
            </p>

            <p className="trc-sub">
              Le code sera <b>personnel</b>, <b>à usage unique</b>, et il expirera seul.
              Il se reconnaît à l’encaissement, sur le rendez-vous, et à la réservation dans
              Ma Couronne. Au-delà de {REMISE_MAX_PCT} %, ce n’est plus une promotion :
              cela se décide, cela ne se tape pas.
            </p>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <Button variant="ghost" size="sm" onClick={surFermer}>Annuler</Button>
              <Button variant="copper" size="sm" disabled={!!empeche} onClick={pose}>
                Fabriquer le code
              </Button>
            </div>
            {empeche && <p className="trc-sub" style={{ color: 'var(--mnd-danger, #96412E)' }}>{empeche}</p>}
          </>
        )}
      </div>
    </div>
  );
}

export { gesteDit };
export type { Geste, CleDuGeste, PieceAJoindre, PieceRendue };
export { invoiceEnPiece };
