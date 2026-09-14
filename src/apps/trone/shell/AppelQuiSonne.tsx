import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../shared/auth';
import { useBranch } from '../../../shared/branches';
import { useClients } from '../../../shared/clients';
import { useAppointments } from '../../../shared/agenda';
import { fmtMoney } from '../../../shared/currency';
import { useInvoices, invoiceResteXof } from '../../../shared/finance';
import {
  useAppelsWa, appelsWaStore, appelQuiSonne, dejaPris, dureeDite,
  type AppelWa,
} from '../../../shared/appels-wa';
import { armeLaSonnette, sonne } from '../../../shared/sonnette';
import './appel-qui-sonne.css';

/* ══ L'APPEL QUI SONNE — 14 septembre 2026 ═══════════════════════════

   « N'oublie pas que je dois recevoir les appels WhatsApp » (Yéman).
   Maquette `public/maquette-decrocher-dans-le-trone.html`, validée.

   IL PARAÎT PARTOUT, et c'est pour cela qu'il vit dans le Shell : à la
   caisse, au carnet, dans la paie. Un téléphone qui ne sonne que dans une
   pièce n'est pas un téléphone du salon.

   CE QU'IL MONTRE VIENT DU TRÔNE, PAS DE META. Meta ne donne qu'un numéro :
   c'est la Maison qui reconnaît la tête, retrouve son rendez-vous du jour et
   ce qu'elle doit. Décrocher en sachant déjà pourquoi elle appelle, c'est
   tout l'intérêt de décrocher ici plutôt que sur un téléphone.

   TOUS LES POSTES SONNENT, LE PREMIER QUI PREND GAGNE. L'arbitrage n'est pas
   ici : il est en base (0098), parce que deux mains peuvent tomber sur le
   bouton dans la même seconde et qu'aucun écran n'a vu l'autre. Ici, on
   écrit son nom et l'on regarde ce que la base rend — si c'est un autre nom,
   on se tait, et l'écran le dit.

   ── CE QUI MANQUE ENCORE, ET IL FAUT LE DIRE ─────────────────────
   LA VOIX NE PASSE PAS ENCORE. Cette marche-ci sait qu'on appelle, qui
   appelle, et garde tout au carnet ; elle ne porte pas encore le son. C'est
   la troisième marche de la maquette, celle qui demande plusieurs jours et
   une fenêtre d'essai avec les appels allumés chez Meta. Tant qu'elle n'est
   pas là, l'écran ne promet pas ce qu'il ne tient pas : il dit « prendre sur
   le téléphone », et il note qui l'a pris. */

export function AppelQuiSonne() {
  const { session } = useAuth();
  const { branch, currency } = useBranch();
  const [appels] = useAppelsWa();
  const [clients] = useClients();
  const [appts] = useAppointments();
  const [invoices] = useInvoices();

  /* L'HORLOGE — la sonnerie a une fin, même si Meta oublie de nous le dire.
     Sans ce battement, un panneau resterait à sonner pour une cliente qui a
     raccroché depuis un quart d'heure. */
  const [tic, setTic] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setTic(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const appel = useMemo(
    () => appelQuiSonne(appels, tic, branch.id),
    [appels, tic, branch.id],
  );

  /* LA SONNERIE — les mêmes deux notes que la sonnette des messages, et pour
     la même raison : aucun fichier son. Elle bat tant que l'appel sonne, à la
     seconde : un appel, ça insiste. */
  const [sonneDepuis, setSonneDepuis] = useState<string | null>(null);
  useEffect(() => {
    if (!appel) { setSonneDepuis(null); return undefined; }
    if (sonneDepuis !== appel.id) setSonneDepuis(appel.id);
    armeLaSonnette();
    sonne();
    const t = window.setInterval(() => sonne(), 2500);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appel?.id]);

  if (!appel) return null;

  const tete = appel.clientId ? clients.find((c) => c.id === appel.clientId) : undefined;
  const nom = tete?.name ?? appel.nomProfil ?? `+${appel.numero}`;

  /* CE QUE LA MAISON SAIT D'ELLE, et qui change la première phrase qu'on
     prononce. Son rendez-vous du jour d'abord : c'est presque toujours la
     raison de l'appel. */
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const duJour = tete
    ? appts.find((a) => a.clientId === tete.id && a.date === aujourdhui && a.status !== 'annulé')
    : undefined;
  const du = tete
    ? invoices
      .filter((i) => i.branchId === branch.id && i.kind === 'facture'
        && i.clientId === tete.id && i.status !== 'brouillon')
      .reduce((s, i) => s + invoiceResteXof(i), 0)
    : 0;

  const prisPar = dejaPris(appel);
  const moi = session?.user?.email ?? '';
  const cestMoi = !!prisPar && prisPar === moi;

  /* ON ÉCRIT SON NOM, ET L'ON REGARDE CE QUE LA BASE REND. La garde de 0098
     restaure le premier nom posé : si c'est celui d'une autre, le panneau le
     dira au prochain battement, sans qu'on ait rien à faire. */
  const prendre = () => {
    appelsWaStore.set((prev) => prev.map((a) => (a.id === appel.id && !a.prisPar
      ? { ...a, etat: 'pris' as const, prisPar: moi, prisLe: new Date().toISOString() }
      : a)));
  };

  const laisser = () => {
    appelsWaStore.set((prev) => prev.map((a) => (a.id === appel.id
      ? { ...a, etat: 'manque' as const, finiLe: new Date().toISOString() }
      : a)));
  };

  const secondes = Math.max(0, Math.round((tic - Date.parse(appel.sonneLe)) / 1000));

  return (
    <div className="trs-appel" role="alert" aria-live="assertive">
      <div className="trs-appel__q">
        Appel WhatsApp · {dureeDite(secondes)}
      </div>
      <div className="trs-appel__n">{nom}</div>
      <div className="trs-appel__s">
        {duJour
          ? `Rendez-vous aujourd’hui à ${duJour.time}`
          : tete ? 'Aucun rendez-vous aujourd’hui' : 'Tête inconnue de la Maison'}
      </div>

      {prisPar ? (
        /* UN NOM DÉJÀ POSÉ : cet appel est pris. On ne « perd » pas l'appel,
           on apprend qu'il est pris — et l'écran doit le dire ainsi. */
        <div className="trs-appel__pris">
          {cestMoi
            ? 'Vous avez pris cet appel. Répondez sur le téléphone de la Maison.'
            : `${prisPar} a pris cet appel.`}
        </div>
      ) : (
        <>
          <div className="trs-appel__r">
            <button type="button" className="trs-appel__prendre" onClick={prendre}>
              Prendre l’appel
            </button>
            <button type="button" className="trs-appel__laisser" onClick={laisser}>
              Laisser sonner
            </button>
          </div>
          {/* L'ÉCRAN NE PROMET PAS CE QU'IL NE TIENT PAS. */}
          <div className="trs-appel__note">
            La voix ne passe pas encore par le Trône. « Prendre » dit aux autres
            postes que vous vous en occupez, et l’inscrit au carnet.
          </div>
        </>
      )}

      {du > 0 && (
        <div className="trs-appel__f">
          Il reste {fmtMoney(du, currency)} sur son compte.
        </div>
      )}
    </div>
  );
}

export type { AppelWa };
