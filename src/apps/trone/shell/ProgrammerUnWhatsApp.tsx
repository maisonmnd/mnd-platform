import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button, ChampTelephone, Input, Modal, toast } from '../../../ds/components';
import { ChampDeDate } from '../../../ds/dates';
import { useBranch } from '../../../shared/branches';
import { useAuth, useMaTete, useStaff } from '../../../shared/auth';
import { useClients, clientsStore, clienteDePassage, ensureInitiePersona, type Client } from '../../../shared/clients';
import { useAppointments } from '../../../shared/agenda';
import { useInvoices } from '../../../shared/finance';
import { appelDe, prenomDUsage, prenomDevine } from '../../../shared/civilite';
import { signeLeMessage } from '../../../shared/identite';
import { numeroWa, useMessagesWa } from '../../../shared/conversations';
import { numeroTelReel } from '../../../shared/geo';
import { poserAppel } from '../../../shared/appels';
import { uid } from '../../../shared/store';
import { momentDuMessage } from '../../../shared/salle-des-envois';
import {
  MODELES_DE_MESSAGE, QUANDS, REPETITIONS, REPETITION_DITE, NOM_DE_L_AGENT, A_REVOIR,
  modeleDeMessage, avecLeMotif, instantChoisi, quandDit, texteDeLaCliente, lignesDeLaProgrammation, fenetreOuverte, reprogramme,
  jourDuProgramme, heureDuProgramme,
  type AgentDuProgramme, type ChoixDuQuand, type CleDuModeleDeMessage, type Destinataire, type LigneProgrammee,
  type ModeDuProgramme, type PieceDuProgramme, type Repetition, type TelephoneDuProgramme,
} from '../../../shared/envois-programmes-pur';
import { ClientPicker, todayISO } from '../routes/clients/_shared';
import { useLiensDesQrCodes } from '../routes/clients/liens-des-qr-codes';
import { deposeLeFichier, gesteSurLEnvoi, motDuGeste, pieceATirerDe, programmeLesLignes } from '../routes/clients/envois-programmes-donnees';
import { useEstDirection } from '../routes/_vie';
import './programmer-un-whatsapp.css';

/* ══ PROGRAMMER UN WHATSAPP — 13 novembre 2026 ═══════════════════════════
   Il remplace « Appel reçu » (menu Créer, le partage « Partager › Le
   Trône », la page Conversations › Les envois programmés). Maquette validée :
   `public/maquette-les-envois-programmes.html`. On écrit le message
   maintenant, avec sa pièce si besoin, on choisit l'heure (exacte, même la
   nuit), et l'assistant du sujet l'envoie seul, ou bien par l'app : à
   l'heure dite, le téléphone sonne et WhatsApp s'ouvre, le message écrit.

   « Suite à son appel » est le premier modèle (le texte de `messageAppel`,
   le motif dedans, l'heure du rappel devient l'heure d'envoi) ; un
   rendez-vous à caler garde son geste « Poser le rendez-vous ». Plusieurs
   clientes : un message chacune, à son prénom, chacune sa ligne. La devise
   de la Maison se pose par le code (`signeLeMessage`), jamais à la main.

   EN RETOUCHE (une ligne de la file) : le texte, l'heure, la répétition et
   « me demander avant » ; une ligne à revoir se reprogramme. */

type ChoixDePiece = 'aucune' | 'facture' | 'recu' | 'carte' | 'itineraire' | 'fichier';

const prochainAnniversaire = (birthday: string | undefined, aujourdhui: string): string | null => {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(birthday ?? '');
  if (!m) return null;
  const annee = Number(aujourdhui.slice(0, 4));
  const cette = `${annee}-${m[1]}-${m[2]}`;
  return cette >= aujourdhui ? cette : `${annee + 1}-${m[1]}-${m[2]}`;
};

export default function ProgrammerUnWhatsApp({ initial, ligne, surFermer, onPoserRdv }: {
  /** Venu d'un partage « Partager › Le Trône » : le numéro, ou un nom. */
  initial?: { phone?: string; nom?: string } | null;
  /** Une ligne de la file à retoucher (ou à reprogrammer). */
  ligne?: LigneProgrammee | null;
  surFermer: () => void;
  /** « Poser le rendez-vous » : la fenêtre du rendez-vous, cliente posée. */
  onPoserRdv?: (clientId: string, appelId: string) => void;
}) {
  const { branch } = useBranch();
  const { session } = useAuth();
  const { tete } = useMaTete();
  const staff = useStaff();
  const direction = useEstDirection();
  const [clients] = useClients();
  const [appts] = useAppointments();
  const [invoices] = useInvoices();
  const [messages] = useMessagesWa();
  const qr = useLiensDesQrCodes();
  const retouche = !!ligne;

  const [dest, setDest] = useState<Destinataire[]>([]);
  const [nouveauNom, setNouveauNom] = useState('');
  const [nouveauTel, setNouveauTel] = useState('');
  const [modele, setModele] = useState<CleDuModeleDeMessage>('appel');
  const [motif, setMotif] = useState('');
  const [texte, setTexte] = useState(ligne ? ligne.colis.texte : avecLeMotif(modeleDeMessage('appel').texte, ''));
  const [piece, setPiece] = useState<ChoixDePiece>('aucune');
  const [fichier, setFichier] = useState<File | null>(null);
  const [mode, setMode] = useState<ModeDuProgramme>(ligne?.colis.mode ?? 'seul');
  const [quand, setQuand] = useState<ChoixDuQuand>(ligne ? 'autre' : 'h1');
  const prevuDeLaLigne = ligne ? Date.parse(ligne.prevuA) : NaN;
  const [jour, setJour] = useState(Number.isFinite(prevuDeLaLigne) ? jourDuProgramme(Math.max(prevuDeLaLigne, Date.now())) : todayISO());
  const [heure, setHeure] = useState(() => {
    if (!Number.isFinite(prevuDeLaLigne)) return '09:00';
    const d = new Date(Math.max(prevuDeLaLigne, Date.now()) + 3_600_000);
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  });
  const [repeter, setRepeter] = useState<Repetition>(ligne?.colis.repeter ?? 'jamais');
  const [agent, setAgent] = useState<AgentDuProgramme>(ligne?.colis.agent ?? 'perle');
  const [prive, setPrive] = useState(false);
  const [telephone, setTelephone] = useState<TelephoneDuProgramme>('moi');
  const [demander, setDemander] = useState(ligne?.colis.demander === true);
  const [mot, setMot] = useState('');
  const [enCours, setEnCours] = useState(false);

  const aujourdhui = todayISO();
  const prochainRdv = (clientId: string): Destinataire['rendezVous'] => {
    const r = appts
      .filter((a) => a.clientId === clientId && a.date >= aujourdhui && a.status !== 'annulé' && a.status !== 'honoré')
      .sort((a, b) => `${a.date} ${a.time ?? ''}`.localeCompare(`${b.date} ${b.time ?? ''}`))[0];
    return r ? { apptId: r.id, date: r.date, time: r.time ?? '', dit: `le ${momentDuMessage(r.date, r.time)}` } : undefined;
  };
  const destDeFiche = (c: Client): Destinataire => ({
    clientId: c.id, nom: c.name, prenom: prenomDUsage(c) || c.name.trim().split(/\s+/)[0] || c.name,
    appel: appelDe(c), numero: numeroWa(c.phone || c.phone2 || ''), rendezVous: prochainRdv(c.id),
  });

  /* LE PARTAGE « PARTAGER › LE TRÔNE » : la fiche du numéro, sinon une nouvelle, le numéro posé. */
  useEffect(() => {
    if (ligne) return;
    const p = initial?.phone;
    const chiffres = (s?: string) => (s ?? '').replace(/\D/g, '').slice(-8);
    const trouvee = p ? clients.find((c) => !!c.phone && chiffres(c.phone) === chiffres(p)) : undefined;
    if (trouvee) setDest([destDeFiche(trouvee)]);
    else { setNouveauNom(initial?.nom ?? ''); setNouveauTel(p ?? ''); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choisisModele = (cle: CleDuModeleDeMessage) => {
    const m = modeleDeMessage(cle);
    setModele(cle); setTexte(avecLeMotif(m.texte, cle === 'appel' ? motif.trim() : '')); setAgent(m.agent); setRepeter(m.repeter);
    if (m.piece) setPiece(m.piece);
    if (cle === 'anniv' && dest.length === 1 && dest[0].clientId) {
      const date = prochainAnniversaire(clients.find((c) => c.id === dest[0].clientId)?.birthday, aujourdhui);
      if (date) { setQuand('autre'); setJour(date); setHeure('09:00'); }
    }
  };
  /* LE MOTIF S'ÉCRIT DANS LE MESSAGE, à vue : tant que le texte est celui du
     modèle, il suit le motif ; retouché à la main, il ne bouge plus. */
  const changeLeMotif = (v: string) => {
    const gabarit = modeleDeMessage('appel').texte;
    if (texte === avecLeMotif(gabarit, motif.trim())) setTexte(avecLeMotif(gabarit, v.trim()));
    setMotif(v);
  };
  const ajouteFiche = (id: string) => {
    const c = clients.find((x) => x.id === id);
    if (c && !dest.some((d) => d.clientId === id)) setDest((prev) => [...prev, destDeFiche(c)]);
  };
  const nouveauNumero = numeroWa(numeroTelReel(nouveauTel));
  /* Une nouvelle, sans fiche : son numéro suffit (le partage d'un numéro
     inconnu) ; sans nom, « Bonjour, » et « Madame, Monsieur » au modèle. */
  const laNouvelle = (): Destinataire | null => {
    if (!nouveauNumero) return null;
    const nom = nouveauNom.trim();
    const prenom = nom ? prenomDevine(nom) || nom : '';
    return { nom: nom || `+${nouveauNumero}`, prenom, appel: prenom || 'Madame, Monsieur', numero: nouveauNumero };
  };
  const ajouteNouvelle = () => {
    const d = laNouvelle();
    if (!d) return;
    setDest((prev) => [...prev, d]);
    setNouveauNom(''); setNouveauTel('');
  };

  /* Le texte, avec les liens de la pièce choisie : la carte et l'itinéraire voyagent DANS le message. */
  const avecLiens = (t: string): string => {
    if (piece === 'carte' && qr.lienCarte) return `${t}\n\nLa carte de la Maison MND : ${qr.lienCarte}`;
    if (piece === 'itineraire' && qr.lienPlan) return `${t}\n\nL’itinéraire jusqu’à la Maison MND : ${qr.lienPlan}`;
    return t;
  };
  const premiere = ligne
    ? { nom: String(ligne.prenom ?? ''), prenom: String(ligne.prenom ?? ''), appel: ligne.colis.appel, numero: String(ligne.numero ?? ligne.colis.numero), clientId: ligne.clientId } as Destinataire
    : dest[0];
  const apercu = ligne ? signeLeMessage(texte) : signeLeMessage(texteDeLaCliente(avecLiens(texte), {
    prenom: premiere?.prenom ?? '{prénom}', motif, rendezVous: modele === 'rdv' ? premiere?.rendezVous?.dit : undefined,
  }));
  const maintenant = Date.now();
  const prevu = instantChoisi(quand, maintenant, jour, heure);
  const ouverte = useMemo(() => {
    const n = premiere?.numero;
    if (!n) return false;
    return fenetreOuverte(messages.filter((m) => numeroWa(m.numero) === n), Date.now());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, premiere?.numero]);
  const factureDuJour = premiere?.clientId && (piece === 'facture' || piece === 'recu') ? pieceATirerDe(invoices, premiere.clientId, piece) : null;
  const nuit = prevu !== null && (() => { const h = Number(heureDuProgramme(prevu).split(' ')[0]); return h >= 20 || h < 8; })();
  const auteur = ((tete as { name?: string } | null)?.name ?? staff?.name ?? '').trim().split(/\s+/)[0] || (session?.user?.email ?? '').split('@')[0] || 'le comptoir';
  const sansNumero = dest.filter((d) => !d.numero);

  const programme = async () => {
    setMot('');
    if (prevu === null) { setMot('Choisissez le jour et l’heure.'); return; }
    if (prevu < maintenant - 60_000) { setMot('Cette heure est déjà passée : choisissez-en une à venir.'); return; }
    if (!texte.trim()) { setMot('Le message est vide.'); return; }
    if (ligne) {
      setEnCours(true);
      const signe = signeLeMessage(texte);
      const v = await gesteSurLEnvoi(ligne.id, (l) => {
        if (l.statut === A_REVOIR || l.statut === 'périmé') {
          const r = reprogramme(l, { texte: signe, prevuMs: prevu, maintenantMs: Date.now() });
          return r ? { ...r, colis: { ...r.colis, repeter, ...(l.colis.mode === 'seul' ? { demander } : {}) } } : null;
        }
        if (!['en-attente', 'retenu', 'à-valider'].includes(l.statut)) return null;
        const iso = new Date(prevu).toISOString();
        return { ...l, prevuA: iso, partA: iso, calme: false, ...(l.occurrence === 1 ? { serieA: iso } : {}), colis: { ...l.colis, texte: signe, repeter, ...(l.colis.mode === 'seul' ? { demander } : {}) } };
      });
      setEnCours(false);
      if (v !== 'fait') { setMot(motDuGeste(v)); return; }
      toast('Envoi programmé retouché.');
      surFermer();
      return;
    }
    /* Une nouvelle tapée mais pas « Ajouter » : elle compte. */
    const enAttente = laNouvelle();
    const tous = enAttente ? [...dest, enAttente] : dest;
    if (!tous.length) { setMot('À qui ? Choisissez une cliente, ou tapez le numéro d’une nouvelle.'); return; }
    if (sansNumero.length) { setMot(`${sansNumero.map((d) => d.nom).join(', ')} : pas de numéro sur la fiche.`); return; }
    if (piece === 'fichier' && !fichier) { setMot('Choisissez le fichier à joindre.'); return; }
    if (piece === 'itineraire' && !qr.lienPlan) { setMot('L’itinéraire attend l’adresse de la branche : Système › Branches.'); return; }
    setEnCours(true);
    const lotId = `prog-${uid()}`;
    let laPiece: PieceDuProgramme | undefined;
    if (piece === 'fichier' && fichier) {
      const d = await deposeLeFichier(lotId, fichier);
      if (!d.ok) { setEnCours(false); setMot(d.erreur); return; }
      laPiece = d.piece;
    } else if (piece === 'facture' || piece === 'recu') laPiece = { genre: piece };
    const lignes = lignesDeLaProgrammation({
      lotId, branchId: branch.id, modele, texte: avecLiens(texte), motif: modele === 'appel' ? motif.trim() : undefined,
      prevuMs: prevu, repeter, agent, mode, telephone, demander: mode === 'seul' && demander, prive: mode === 'seul' && prive && direction,
      ...(laPiece ? { piece: laPiece } : {}), auteur, ...(session?.user?.id ? { auteurUserId: session.user.id } : {}),
    }, tous, Date.now(), signeLeMessage);
    programmeLesLignes(lignes);
    setEnCours(false);
    toast(lignes.length > 1 ? `${lignes.length} envois programmés, un chacune.` : 'Envoi programmé.');
    surFermer();
  };

  const poseLeRdv = () => {
    let cid = dest[0]?.clientId ?? '';
    const nom = dest[0]?.nom ?? nouveauNom.trim();
    const tel = dest[0]?.numero ?? nouveauNumero;
    if (!nom) { setMot('À qui ? Le nom d’abord.'); return; }
    if (!cid) {
      const nouvelle = clienteDePassage({ branchId: branch.id, name: nom, phone: tel ? `+${tel}` : undefined, since: todayISO(), persona: ensureInitiePersona() });
      clientsStore.set((prev) => [...prev, nouvelle]);
      cid = nouvelle.id;
    }
    const appelId = poserAppel({ branchId: branch.id, clientId: cid, nom, phone: tel ? `+${tel}` : undefined, motif: motif.trim(), suite: 'rdv' });
    surFermer();
    onPoserRdv?.(cid, appelId);
  };

  const puce = (on: boolean, rendu: ReactNode, faire: () => void, k: string, desactive = false) => (
    <button key={k} type="button" className="trc-prog__puce" aria-pressed={on} disabled={desactive} onClick={faire}>{rendu}</button>
  );
  const nomAgent = mode === 'app' ? 'par l’app' : NOM_DE_L_AGENT[agent];

  return (
    <Modal title={retouche ? (ligne && (ligne.statut === A_REVOIR || ligne.statut === 'périmé') ? 'Corriger et reprogrammer.' : 'Retoucher l’envoi.') : 'Programmer un WhatsApp.'} onClose={surFermer} width={940}>
      <div className="trc-prog">
        <div className="trc-prog__form">
          {!retouche && (
            <div className="trc-prog__champ">
              <h3 className="trc-prog__titre">À qui</h3>
              <ClientPicker value="" onChange={ajouteFiche} placeholder="Chercher une cliente (nom, téléphone)…" />
              {dest.length > 0 && (
                <div className="trc-prog__puces">
                  {dest.map((d, i) => (
                    <span key={`${d.clientId ?? d.numero}-${i}`} className={`trc-prog__dest${d.numero ? '' : ' is-sans-numero'}`}>
                      {d.nom}{d.numero ? '' : ' · sans numéro'}
                      <button type="button" aria-label={`Retirer ${d.nom}`} onClick={() => setDest((prev) => prev.filter((_, k) => k !== i))}>×</button>
                    </span>
                  ))}
                </div>
              )}
              <div className="trc-prog__nouvelle">
                <Input value={nouveauNom} onChange={(e) => setNouveauNom(e.target.value)} placeholder="… ou une nouvelle : son nom" aria-label="Le nom d’une nouvelle" />
                <ChampTelephone value={nouveauTel} onChange={setNouveauTel} dialDefaut={branch.dial} />
                <button type="button" className="trc-prog__lien" disabled={!nouveauNumero} onClick={ajouteNouvelle}>Ajouter</button>
              </div>
              <span className="trc-prog__aide">Plusieurs clientes : un message chacune, à son prénom.</span>
            </div>
          )}

          {!retouche && (
            <div className="trc-prog__champ">
              <h3 className="trc-prog__titre">Le modèle</h3>
              <div className="trc-prog__puces" role="group" aria-label="Le modèle">
                {MODELES_DE_MESSAGE.map((m) => puce(modele === m.cle, m.nom, () => choisisModele(m.cle), m.cle))}
              </div>
              {modele === 'appel' && (
                <Input value={motif} onChange={(e) => changeLeMotif(e.target.value)} placeholder="Ce qu’elle veut · une phrase (le motif de son appel)" aria-label="Le motif de son appel" />
              )}
              {modele === 'rdv' && premiere && !premiere.rendezVous && <span className="trc-prog__aide">{premiere.nom} n’a pas de rendez-vous à venir : le message dira « bientôt ».</span>}
            </div>
          )}

          <div className="trc-prog__champ">
            <h3 className="trc-prog__titre"><label htmlFor="trc-prog-message">Le message</label></h3>
            <textarea id="trc-prog-message" value={texte} onChange={(e) => setTexte(e.target.value)} aria-describedby="trc-prog-aide" />
            <span className="trc-prog__aide" id="trc-prog-aide">« {'{prénom}'} » se remplace par le prénom de chaque cliente. La devise de la Maison se pose seule à la fin.</span>
          </div>

          {!retouche && (
            <div className="trc-prog__champ">
              <h3 className="trc-prog__titre">Pièce jointe</h3>
              <div className="trc-prog__puces" role="group" aria-label="Pièce jointe">
                {puce(piece === 'aucune', 'Aucune', () => setPiece('aucune'), 'aucune')}
                {puce(piece === 'facture', <>Sa facture<small>tirée à l’envoi</small></>, () => setPiece('facture'), 'facture')}
                {puce(piece === 'recu', <>Son reçu<small>tiré à l’envoi</small></>, () => setPiece('recu'), 'recu')}
                {puce(piece === 'carte', <>La carte des prix<small>un lien, à jour</small></>, () => setPiece('carte'), 'carte')}
                {puce(piece === 'itineraire', <>L’itinéraire<small>{qr.lienPlan ? 'Google Maps, jusqu’à la porte' : 'adresse à régler'}</small></>, () => setPiece('itineraire'), 'itineraire', !qr.lienPlan)}
                {fichier && puce(piece === 'fichier', fichier.name, () => setPiece('fichier'), 'fichier')}
              </div>
              <div className="trc-prog__ligne">
                <label className="trc-prog__aide" htmlFor="trc-prog-fichier">Ou un fichier de l’appareil (photo, PDF, document) :</label>
                <input id="trc-prog-fichier" type="file" accept="image/jpeg,image/png,application/pdf,video/mp4,.doc,.docx,.xls,.xlsx,.txt"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFichier(f); setPiece('fichier'); } }} />
              </div>
              {(piece === 'facture' || piece === 'recu') && (
                <span className="trc-prog__aide">
                  {factureDuJour ? `Aujourd’hui ce serait ${factureDuJour.number || 'sa pièce'} du ${factureDuJour.date} ; la pièce jointe sera celle du jour d’envoi, tirée à l’heure dite.` : 'Elle n’a pas encore de pièce : si elle n’en a toujours pas à l’heure dite, l’envoi le dira dans « À revoir ».'}
                </span>
              )}
            </div>
          )}

          {!retouche && (
            <div className="trc-prog__champ">
              <h3 className="trc-prog__titre">Comment il part</h3>
              <div className="trc-prog__puces" role="group" aria-label="Comment il part">
                {puce(mode === 'seul', <>Seul, par l’assistant<small>à l’heure dite, sans vous</small></>, () => setMode('seul'), 'seul')}
                {puce(mode === 'app', <>Par l’app, d’un toucher<small>WhatsApp s’ouvre sur votre téléphone</small></>, () => setMode('app'), 'app')}
              </div>
            </div>
          )}

          <div className="trc-prog__champ">
            <h3 className="trc-prog__titre">Quand</h3>
            <div className="trc-prog__puces" role="group" aria-label="Quand">
              {QUANDS.map((q) => puce(quand === q.cle, q.nom, () => setQuand(q.cle), q.cle))}
            </div>
            {quand === 'autre' && (
              <div className="trc-prog__ligne">
                <ChampDeDate compact sens="avant" value={jour} onChange={setJour} min={aujourdhui} ariaLabel="Le jour d’envoi" style={{ width: 170 }} />
                <input type="time" value={heure} onChange={(e) => setHeure(e.target.value)} aria-label="L’heure d’envoi" />
              </div>
            )}
          </div>

          <div className="trc-prog__champ">
            <h3 className="trc-prog__titre">Répéter</h3>
            <div className="trc-prog__puces" role="group" aria-label="Répéter">
              {REPETITIONS.map((r) => puce(repeter === r, r === 'jamais' ? 'Une fois' : REPETITION_DITE[r].replace(/^./, (c) => c.toUpperCase()), () => setRepeter(r), r))}
            </div>
          </div>

          {!retouche && mode === 'seul' && (
            <div className="trc-prog__champ">
              <h3 className="trc-prog__titre">Qui l’envoie</h3>
              <div className="trc-prog__puces" role="group" aria-label="Qui l’envoie">
                {puce(agent === 'perle', <>Perle<small>les clientes · WhatsApp de la Maison</small></>, () => setAgent('perle'), 'perle')}
                {puce(agent === 'grenat', <>Grenat<small>l’argent · WhatsApp de la Maison</small></>, () => setAgent('grenat'), 'grenat')}
              </div>
              {direction && (
                <label className="trc-prog__bascule">
                  <span>Message privé<small>Si elle n’a pas écrit depuis 24 h, Opale l’envoie par WhatsApp Web, sans modèle.</small></span>
                  <input type="checkbox" checked={prive} onChange={(e) => setPrive(e.target.checked)} />
                </label>
              )}
            </div>
          )}

          {!retouche && mode === 'app' && (
            <div className="trc-prog__champ">
              <h3 className="trc-prog__titre">Sur quel téléphone</h3>
              <div className="trc-prog__puces" role="group" aria-label="Sur quel téléphone">
                {puce(telephone === 'moi', <>Le vôtre<small>qui programmez</small></>, () => setTelephone('moi'), 'moi')}
                {puce(telephone === 'comptoir', <>Le téléphone du comptoir<small>toute l’équipe reçoit la sonnerie</small></>, () => setTelephone('comptoir'), 'comptoir')}
              </div>
            </div>
          )}

          {(retouche ? ligne?.colis.mode === 'seul' : mode === 'seul') && (
            <label className="trc-prog__bascule">
              <span>Me demander avant d’envoyer<small>À l’heure dite, une notification : « Envoyer » ou « Retenir ».</small></span>
              <input type="checkbox" checked={demander} onChange={(e) => setDemander(e.target.checked)} />
            </label>
          )}

          {mot && <div className="trc-prog__mot" role="alert">{mot}</div>}
          <div className="trc-prog__pied">
            <Button variant="ghost" onClick={surFermer}>Annuler</Button>
            <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {!retouche && modele === 'appel' && onPoserRdv && (
                <Button variant="ghost" onClick={poseLeRdv} disabled={!dest.length && !nouveauNom.trim()}>Poser le rendez-vous</Button>
              )}
              <Button variant="copper" onClick={() => void programme()} disabled={enCours}>{enCours ? 'Un instant…' : retouche ? 'Enregistrer' : 'Programmer'}</Button>
            </span>
          </div>
        </div>

        <aside className="trc-prog__apercu" aria-label="Ce qui partira">
          <h3 className="trc-prog__titre">Ce qui partira</h3>
          <div className="trc-prog__tel">
            <div className="trc-prog__tel-tete">
              <span>{premiere ? `${premiere.nom}${!retouche && dest.length > 1 ? ` et ${dest.length - 1} autre${dest.length > 2 ? 's' : ''}` : ''}` : 'À qui ?'}</span>
              <span>{prevu !== null ? quandDit(new Date(prevu).toISOString(), maintenant) : ''}</span>
            </div>
            <div className="trc-prog__tel-corps">
              {mode === 'seul' && !ouverte && !(prive && direction) && (
                <div className="trc-prog__bulle is-porte">
                  {`Bonjour ${premiere?.appel || '…'}, la Maison MND a un message pour vous. Touchez « Lire le message », ou répondez simplement, pour le recevoir ici.`}
                  <small>modèle d’ouverture · si elle n’a pas écrit depuis 24 h</small>
                </div>
              )}
              <div className="trc-prog__bulle">
                {piece === 'fichier' && fichier ? `[${fichier.name}]\n` : piece === 'facture' || piece === 'recu' ? `[${piece === 'facture' ? 'Sa facture' : 'Son reçu'}, en PDF, tiré à l’envoi]\n` : ''}
                {apercu}
                <small>{nomAgent}</small>
              </div>
            </div>
          </div>
          <div className="trc-prog__voie">
            {mode === 'app' ? (
              <><b>Par l’app, sur {telephone === 'comptoir' ? 'le téléphone du comptoir' : 'votre téléphone'}</b>
                <span>À l’heure dite, le téléphone sonne. Un toucher ouvre WhatsApp sur sa conversation, le message déjà écrit : vous appuyez sur Envoyer. Pas de règle des 24 h, c’est votre WhatsApp.{piece === 'fichier' || piece === 'facture' || piece === 'recu' ? ' La pièce jointe se partage d’un second geste.' : ''}{dest.length > 1 ? ' Plusieurs clientes : une sonnerie chacune.' : ''}</span></>
            ) : ouverte ? (
              <><b>Elle a écrit dans les 24 h</b><span>Aujourd’hui, le message partirait tel quel, par le WhatsApp de la Maison, au nom de {NOM_DE_L_AGENT[agent]}. La fenêtre se relit à l’heure dite.</span></>
            ) : prive && direction ? (
              <><b>Message privé</b><span>Si elle n’a pas écrit depuis 24 h à l’heure dite, Opale l’envoie depuis WhatsApp Web, sur l’ordinateur de Yéman ; endormie, l’envoi passe « À revoir ».</span></>
            ) : (
              <><b>Elle n’a pas écrit depuis 24 h</b><span>WhatsApp n’accepte alors qu’un modèle approuvé : {NOM_DE_L_AGENT[agent]} envoie d’abord le modèle d’ouverture, puis votre message{piece !== 'aucune' ? ' et sa pièce' : ''} dès qu’elle répond.</span></>
            )}
          </div>
          {nuit && mode === 'seul' && (
            <div className="trc-prog__voie is-nuit"><b>À l’heure exacte, même la nuit</b><span>Un envoi programmé n’attend pas 8 h : il part à l’heure dite.</span></div>
          )}
          {demander && mode === 'seul' && (
            <div className="trc-prog__voie"><b>Il vous demandera avant</b><span>À l’heure dite, votre téléphone sonne : rien ne part sans votre « Envoyer ».</span></div>
          )}
          <span className="trc-prog__resume">
            {`${retouche ? 1 : dest.length} cliente${!retouche && dest.length > 1 ? 's' : ''} · ${prevu !== null ? quandDit(new Date(prevu).toISOString(), maintenant).toLowerCase() : 'quand ?'} · ${REPETITION_DITE[repeter]} · ${nomAgent}`}
          </span>
        </aside>
      </div>
    </Modal>
  );
}
