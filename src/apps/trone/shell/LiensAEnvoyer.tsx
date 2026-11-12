import { Fragment, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Copy } from 'lucide-react';
import { Field, Input, Modal, toast } from '../../../ds/components';
import { cheminDeLaConversation, lienWaMe, numeroWa } from '../../../shared/conversations';
import { signeLeMessage } from '../../../shared/identite';
import {
  GROUPE_DES_QR_CODES, LIENS_A_ENVOYER, LIENS_DES_QR_CODES, adresseDuLienAEnvoyer, messageDuLienAEnvoyer, messageDuLienDuQr,
  type CleDuLien, type CleDuQr,
} from '../../../shared/liens-a-envoyer-pur';
import { useLiensDesQrCodes } from '../routes/clients/liens-des-qr-codes';
import { WaGlyph } from '../routes/_ui';
import './liens-a-envoyer.css';

/* ══ LES LIENS À ENVOYER — 12 novembre 2026 ══════════════════════════════
   « Peux-tu designer quelque part dans le Trône où j'accède rapidement à ces
   liens que je peux envoyer par WhatsApp app directement », puis « rajouter
   à côté de WhatsApp, app aussi », puis « ajoute dans les liens la liste des
   liens des QR codes » (Yéman). Maquette validée :
   `public/maquette-les-liens-a-envoyer.html`. Les mots vivent dans
   `shared/liens-a-envoyer-pur.ts` ; les adresses des QR codes dans
   `routes/clients/liens-des-qr-codes.ts`, la même source que la page QR codes.

   DEUX PORTES, COMME PARTOUT DANS LE TRÔNE (15 septembre 2026) :
   · « WhatsApp » ouvre son fil dans Conversations, le message posé dans la
     zone de saisie : il part du numéro de la Maison et reste au fil. Il lui
     faut un numéro ;
   · « App » ouvre l'application WhatsApp de l'appareil (wa.me), avec ou sans
     numéro : ce qui s'y écrit n'entre pas dans le fil de la Maison.

   L'ADRESSE DU SITE EST L'ORIGINE DU TRÔNE, jamais un nom de domaine écrit :
   comme le lien préparé de Conversations (`LienDeReservation`). */

type Ligne = {
  id: string;
  groupe: string;
  nom: string;
  sous: string;
  adresse: string;
  /** Le message sans signature. */
  message: string;
  /** Ce qui manque pour qu'il parte, et où le régler. */
  manque?: string;
};

const SANS_MOMO = 'Renseignez le code MoMo dans Paramètres › L’encaissement';
const SANS_PLAN = 'Renseignez l’adresse dans Système › Branches';
const SANS_AVIS = 'Renseignez le lien dans Paramètres › Automatisations';

export default function LiensAEnvoyer({ appel = '', numero = '', choisi: choisiAuDepart = 'tout', surFermer }: {
  /** Comment la saluer (« Awa », « Mme Awa ») ; vide : « Bonjour, ». */
  appel?: string;
  /** Son numéro, s'il est connu (depuis sa fiche). */
  numero?: string;
  choisi?: CleDuLien;
  surFermer: () => void;
}) {
  const navigate = useNavigate();
  const qr = useLiensDesQrCodes();
  const [salut, setSalut] = useState(appel);
  const [tel, setTel] = useState(numero);
  const [choisi, setChoisi] = useState<string>(choisiAuDepart);
  const [copie, setCopie] = useState<string | null>(null);

  const site = `${window.location.origin}/`;
  const n = numeroWa(tel);

  const adresseDuQr: Record<CleDuQr, string> = {
    mtn: qr.lienComptoirMtn,
    kkiapay: qr.lienChapchap,
    momo: qr.codeMarchand ? qr.lienMomo : '',
    site: qr.lienSite,
    carte: qr.lienCarte,
    plan: qr.lienPlan,
    couronne: qr.lienCouronne,
    avis: qr.lienAvis,
    academie: qr.lienAcademie,
  };
  const manqueDuQr: Partial<Record<CleDuQr, string>> = {
    ...(qr.codeMarchand ? {} : { momo: SANS_MOMO }),
    ...(qr.lienPlan ? {} : { plan: SANS_PLAN }),
    ...(qr.lienAvis ? {} : { avis: SANS_AVIS }),
  };
  const sousDuPlan = qr.planPrecis
    ? 'la porte de la Maison, sur Google Maps'
    : 'le centre de la ville seulement : collez le lien de la fiche Google dans Système › Branches';

  const lignes: Ligne[] = [
    ...LIENS_A_ENVOYER.map((l) => ({
      id: l.cle, groupe: l.groupe, nom: l.nom, sous: l.sous,
      adresse: adresseDuLienAEnvoyer(site, l.cle),
      message: messageDuLienAEnvoyer(site, l.cle, salut),
    })),
    ...LIENS_DES_QR_CODES.map((l) => ({
      id: `qr-${l.cle}`, groupe: GROUPE_DES_QR_CODES, nom: l.nom,
      sous: l.cle === 'plan' && qr.lienPlan ? sousDuPlan : l.sous,
      adresse: adresseDuQr[l.cle],
      message: messageDuLienDuQr(l.cle, adresseDuQr[l.cle], salut),
      ...(manqueDuQr[l.cle] ? { manque: manqueDuQr[l.cle] } : {}),
    })),
  ];
  const groupes = [...new Set(lignes.map((l) => l.groupe))];
  const texte = (l: Ligne) => signeLeMessage(l.message);
  const versLApp = (l: Ligne) => lienWaMe(tel, texte(l)) ?? `https://wa.me/?text=${encodeURIComponent(texte(l))}`;
  const apercu = lignes.find((l) => l.id === choisi && !l.manque) ?? lignes[0];

  const parLeTrone = (l: Ligne) => {
    setChoisi(l.id);
    const vers = cheminDeLaConversation(tel, texte(l));
    if (!vers) { toast('Son numéro d’abord : Conversations s’ouvre sur un fil, et un fil, c’est un numéro.'); return; }
    surFermer();
    navigate(vers);
  };

  const copier = (l: Ligne) => {
    setChoisi(l.id);
    const t = texte(l);
    void navigator.clipboard?.writeText(t)
      .then(() => {
        setCopie(l.id);
        toast('Message copié.');
        window.setTimeout(() => setCopie((c) => (c === l.id ? null : c)), 1600);
      })
      .catch(() => toast(t, 9000));
  };

  return (
    <Modal title="Un lien à envoyer." onClose={surFermer} width={640}>
      <div className="trc-liens">
        <div className="tr-grid tr-grid--2">
          <Field label="Son prénom · facultatif">
            <Input value={salut} placeholder="Awa" autoComplete="off" onChange={(e) => setSalut(e.target.value)} />
          </Field>
          <Field label="Son numéro · pour « WhatsApp »">
            <Input value={tel} placeholder="01 97 00 00 00" type="tel" inputMode="tel" autoComplete="off" onChange={(e) => setTel(e.target.value)} />
          </Field>
        </div>
        <p className="trc-liens__aide">
          {n
            ? `Les deux portes s’ouvrent sur sa conversation (+${n}).`
            : 'Sans numéro, « App » vous laisse choisir la conversation ; « WhatsApp » attend son numéro.'}
        </p>

        <div className="trc-liens__liste">
          {groupes.map((g) => (
            <Fragment key={g}>
              <div className="trc-liens__groupe">{g}</div>
              {lignes.filter((l) => l.groupe === g).map((l) => (
                <div key={l.id} className={`trc-liens__lien${l.id === apercu.id ? ' is-choisi' : ''}${l.manque ? ' is-manque' : ''}`}>
                  <button type="button" className="trc-liens__choix" aria-pressed={l.id === apercu.id} disabled={!!l.manque} onClick={() => setChoisi(l.id)}>
                    <b>{l.nom}</b>
                    <span>{l.manque ?? l.sous}</span>
                    {!l.manque && <span className="trc-liens__adresse">{l.adresse.replace(/^https?:\/\//, '')}</span>}
                  </button>
                  {!l.manque && (
                    <div className="trc-liens__gestes">
                      <button
                        type="button"
                        className={`trc-liens__copier${copie === l.id ? ' is-fait' : ''}`}
                        title="Copier le message"
                        aria-label={copie === l.id ? 'Message copié' : `Copier le message : ${l.nom}`}
                        onClick={() => copier(l)}
                      >
                        {copie === l.id ? <Check size={15} /> : <Copy size={15} />}
                      </button>
                      <button
                        type="button"
                        className="trc-liens__porte trc-liens__porte--trone"
                        aria-disabled={!n}
                        title={n ? 'Ouvrir son fil dans Conversations, le message posé. Il part du numéro de la Maison.' : 'Son numéro d’abord.'}
                        onClick={() => parLeTrone(l)}
                      >
                        <WaGlyph /> WhatsApp
                      </button>
                      <a
                        className="trc-liens__porte trc-liens__porte--app"
                        href={versLApp(l)}
                        target="_blank"
                        rel="noreferrer"
                        title="Ouvrir l’application WhatsApp. Ce qui s’y écrit n’entre pas dans le fil de la Maison."
                        onClick={() => setChoisi(l.id)}
                      >
                        App
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </Fragment>
          ))}
        </div>

        <div className="trc-liens__apercu">
          <div className="trc-liens__titre">Le message · {apercu.nom}</div>
          <pre>{texte(apercu)}</pre>
        </div>
        <dl className="trc-liens__legende">
          <dt>WhatsApp</dt><dd>Conversations s’ouvre sur son fil, le message posé. Il part du numéro de la Maison.</dd>
          <dt>App</dt><dd>L’application WhatsApp de cet appareil s’ouvre, le message écrit. Il n’entre pas dans le fil de la Maison.</dd>
        </dl>
      </div>
    </Modal>
  );
}
