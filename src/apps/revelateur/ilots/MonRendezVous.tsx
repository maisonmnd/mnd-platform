import { useEffect, useState, type FormEvent } from 'react';
import { COMMUN } from '../contenu';
import { client, lienWhatsApp, maison } from '../maison';
import { jourDit } from '../agenda';
import { mesure } from '../mesure';
import { ficheAgendaICS, motPourAnnuler, motPourDeplacer, referenceDuRendezVous } from '../../../shared/lien-du-rdv-pur';
import { gesteDitEnFrancaisWa, nomEnFrancaisWa } from '../../../shared/gestes-en-francais';
import {
  DELAI_DU_CHARGEUR_MS, dureeDite, heureDite, jetonDeLAdresse, lectureDuRdv, nomDuFichierAgenda,
  type LectureDuRdv, type RendezVousLu,
} from '../reservation-du-site-pure';
import { Chargeur, RepliDuChargement } from './Chargeur';
import {
  CHEMIN_POUR_RETROUVER, FACTURE_EN_PANNE, FONCTION_DE_LA_FIN, MOTS_DE_LA_RECHERCHE, billetDeLaPageLu, codeDeLAdresse, finLue, rechercheLue, refusDit,
  reglementDuBillet, saisieARevoir, type BilletDuSite,
} from '../billet-du-rdv-pur';
import { jourDeLaFin } from '../../../shared/terminer-et-regler-pur';
import { telechargeLaFactureDuBillet } from '../facture-du-billet';

/* LA PAGE DU RENDEZ-VOUS — 3 novembre 2026. « Add a "Déplacer/Annuler"
   WhatsApp link to the confirmation message » et « an .ics calendar link »
   (Yéman). Les deux boutons du modèle `confirmation_rdv_liens` mènent ici,
   avec le jeton signé du rendez-vous (`?v=`) :
   · /rdv/?v= : le rendez-vous en clair, puis Déplacer et Annuler (deux mots
     écrits à la Maison sur WhatsApp, la référence dedans ; la réception les
     comprend) et Ajouter à mon agenda ;
   · /rdv/agenda/?v= (`genre="agenda"`) : la même lecture, puis le fichier
     .ics se télécharge tout seul, et un bouton le reprend si le téléphone
     l'a retenu.
   La fonction juge le jeton (`{ rdv: 'lire', v }`) ; la page ne le montre
   jamais. Un rendez-vous passé ou annulé se dit sans les boutons ; un lien
   faux ou passé, par une phrase calme et le WhatsApp de la Maison. Les deux
   pages sont hors des moteurs (contenu.ts).

   TERMINER ET RÉGLER — 6 novembre 2026 (la porte du site). « Il peut aller
   sur maisonmnd.com, mettre son code de confirmation et passer au
   règlement » (Yéman) :
   · /mon-rendez-vous/ (`genre="retrouver"`) : son code ET les 4 derniers
     chiffres de son numéro ; trouvé, la page mène à /rdv/?v= ;
   · /rdv/?v= porte aussi le règlement (la fonction `terminer-et-regler`
     dit le reste et si la porte est ouverte) : avant le jour, ce qui sera à
     régler ; le jour même, dès l'heure du rituel, « Terminer et régler »,
     qui mène à la page « Régler ». Le montant vient du serveur, jamais d'ici.
   Les mots et la lecture des réponses vivent dans billet-du-rdv-pur.ts.

   LE RENDEZ-VOUS RÉGLÉ ET SA FACTURE — 7 novembre 2026. « Pouvoir
   télécharger le PDF » (Yéman). Quand le billet porte la facture, « Télécharger
   ma facture (PDF) » charge à la demande la règle du papier
   (pdf-de-la-piece-pur.ts, celle du Trône) et le constructeur (pdf.ts), puis
   le fichier part sous le même nom qu'au Trône. Rien ne se charge tant
   qu'elle n'a pas touché le bouton ; un échec se dit en une phrase. */

const LIEU = `${COMMUN.nom}, ${COMMUN.editeur.adresseComplete}`;
const quandDuRdv = (r: RendezVousLu): string => `${jourDit(r.date)} à ${heureDite(r.heure)}`;
const fichierDuRdv = (r: RendezVousLu, apptId: string): string => ficheAgendaICS({
  apptId, date: r.date, heure: r.heure, dureeMin: r.dureeMin || 60,
  titre: `Maison MND · ${r.gestes.map((n) => nomEnFrancaisWa(n).francais).join(', ') || 'votre venue'}`,
  note: `${r.reference ? `Réf. ${r.reference}. ` : ''}Pour déplacer ou annuler, un mot sur WhatsApp suffit.`,
  lieu: LIEU,
});

/** Télécharger le .ics : un blob, un lien, un clic. `false` si le navigateur
    a refusé ; le bouton reste alors pour le reprendre. */
function telecharge(ics: string, nom: string): boolean {
  try {
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = nom;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    return true;
  } catch {
    return false;
  }
}

/** L'appel à la fonction terminer-et-regler : ce qu'elle rend, et le statut d'un refus. */
async function demandeALaFin(corps: Record<string, unknown>): Promise<{ data: unknown; statut?: number }> {
  const supabase = await client();
  if (!supabase) return { data: null };
  const { data, error } = await supabase.functions.invoke(FONCTION_DE_LA_FIN, { body: corps });
  return error ? { data: null, statut: (error as { context?: { status?: number } } | null)?.context?.status } : { data };
}

/** « RETROUVER MON RENDEZ-VOUS » : son code ET ses quatre chiffres. Trouvé,
    la page mène au billet (/rdv/?v=) ; sinon la même phrase, que le code soit
    inconnu ou les chiffres faux. */
function RetrouverMonRendezVous({ wa }: { wa: (mot: string) => string }) {
  const M = MOTS_DE_LA_RECHERCHE;
  const [code, setCode] = useState(() => codeDeLAdresse(typeof location === 'undefined' ? '' : location.search));
  const [chiffres, setChiffres] = useState('');
  const [dit, setDit] = useState<{ champ?: 'code' | 'chiffres'; texte: string } | null>(null);
  const [cherche, setCherche] = useState(false);

  const envoie = async (e: FormEvent) => {
    e.preventDefault();
    if (cherche) return;
    const aRevoir = saisieARevoir(code, chiffres);
    if (aRevoir) { setDit({ champ: aRevoir.champ, texte: aRevoir.dit }); return; }
    setCherche(true);
    setDit(null);
    try {
      const { data, statut } = await demandeALaFin({ action: 'retrouver', code, chiffres });
      const r = rechercheLue(data, statut);
      if (r.etat === 'trouve') { location.assign(`${import.meta.env.BASE_URL}rdv/?v=${encodeURIComponent(r.v)}`); return; }
      setDit({ texte: r.etat === 'introuvable' ? M.introuvable : r.etat === 'trop' ? M.trop : M.panne });
    } catch {
      setDit({ texte: M.panne });
    }
    setCherche(false);
  };

  return (
    <form className="rdv-page rdv-cherche" onSubmit={(e) => { void envoie(e); }} noValidate>
      <p className="sur">{M.sur}</p>
      <h2>{M.titre}</h2>
      <p className="corps">{M.intro}</p>
      <div className="champ">
        <label htmlFor="rdv-code">{M.code}</label>
        <input id="rdv-code" name="code" value={code} autoComplete="off" autoCapitalize="characters" spellCheck={false} enterKeyHint="next"
          aria-invalid={dit?.champ === 'code'} onChange={(e) => { setCode(e.target.value.toUpperCase().slice(0, 9)); setDit(null); }} />
      </div>
      <div className="champ">
        <label htmlFor="rdv-chiffres">{M.chiffres}</label>
        <input id="rdv-chiffres" name="chiffres" value={chiffres} inputMode="numeric" autoComplete="off" maxLength={4} enterKeyHint="go"
          aria-invalid={dit?.champ === 'chiffres'} onChange={(e) => { setChiffres(e.target.value.replace(/\D/g, '').slice(0, 4)); setDit(null); }} />
        <small>{M.aide}</small>
      </div>
      {dit && <p className="rdv-cherche__dit" role="alert">{dit.texte}</p>}
      <p className="rangee"><button type="submit" className="btn btn--plein" disabled={cherche}>{cherche ? 'Un instant…' : M.bouton}</button></p>
      <p className="legende"><a href={wa(M.motPourLeCode)} target="_blank" rel="noopener">{M.perdu}</a></p>
    </form>
  );
}

export default function MonRendezVous({ genre }: { genre?: string }) {
  const agendaSeul = genre === 'agenda';
  const retrouver = genre === 'retrouver';
  const [jeton] = useState(() => jetonDeLAdresse(typeof location === 'undefined' ? '' : location.search));
  const [lu, setLu] = useState<LectureDuRdv | null>(null);
  const [lent, setLent] = useState(false);
  const [essai, setEssai] = useState(0);
  const [whatsapp, setWhatsapp] = useState(COMMUN.editeur.telephone.replace(/\D/g, ''));
  const [telecharge1, setTelecharge1] = useState(false);
  /* Le règlement du billet (6 novembre 2026) : relu au serveur, jamais décidé ici. */
  const [billet, setBillet] = useState<BilletDuSite | null>(null);
  const [fin, setFin] = useState<{ enCours: boolean; dit: string }>({ enCours: false, dit: '' });
  /* La facture d'un rendez-vous réglé (7 novembre 2026) : en préparation, ou la phrase d'un échec. */
  const [papier, setPapier] = useState<{ enCours: boolean; dit: string }>({ enCours: false, dit: '' });

  useEffect(() => {
    let vivant = true;
    void maison().then((m) => { if (vivant && m?.whatsapp) setWhatsapp(m.whatsapp); }).catch(() => { /* le numéro du registre */ });
    return () => { vivant = false; };
  }, []);

  useEffect(() => {
    if (retrouver || agendaSeul || !jeton) return;
    let vivant = true;
    void demandeALaFin({ action: 'billet', v: jeton })
      .then(({ data }) => { if (vivant) setBillet(billetDeLaPageLu(data)); })
      .catch(() => { /* sans le règlement, la page garde le rendez-vous */ });
    return () => { vivant = false; };
  }, [retrouver, agendaSeul, jeton, essai]);

  useEffect(() => {
    if (retrouver) return;
    if (!jeton) { setLu({ etat: 'lien' }); return; }
    let vivant = true;
    setLu(null);
    setLent(false);
    const minuterie = setTimeout(() => { if (vivant) setLent(true); }, DELAI_DU_CHARGEUR_MS);
    void (async () => {
      try {
        const supabase = await client();
        if (!supabase) { if (vivant) setLu({ etat: 'panne' }); return; }
        const { data, error } = await supabase.functions.invoke('demande-submit', { body: { rdv: 'lire', v: jeton } });
        if (!vivant) return;
        const statut = (error as { context?: { status?: number } } | null)?.context?.status;
        setLu(error ? lectureDuRdv({ error: statut === 429 ? 'rate_limited' : 'panne' }, statut) : lectureDuRdv(data));
      } catch {
        if (vivant) setLu({ etat: 'panne' });
      } finally {
        clearTimeout(minuterie);
      }
    })();
    return () => { vivant = false; clearTimeout(minuterie); };
  }, [retrouver, jeton, essai]);

  /* /rdv/agenda/ : le fichier part de lui-même, une fois, pour un rendez-vous à venir. */
  const apptId = jeton.split('.')[0] ?? '';
  useEffect(() => {
    if (!agendaSeul || telecharge1 || !lu || lu.etat !== 'pret' || lu.rdv.statut !== 'a-venir') return;
    setTelecharge1(true);
    telecharge(fichierDuRdv(lu.rdv, apptId), nomDuFichierAgenda(lu.rdv.date));
  }, [agendaSeul, telecharge1, lu, apptId]);

  const waMaison = lienWhatsApp(whatsapp, 'Bonjour MND, je voudrais parler de mon rendez-vous.');
  const reessayer = () => setEssai((n) => n + 1);

  /* « TERMINER ET RÉGLER » : la fonction juge la porte, pose le lien, prévient
     l'équipe ; la page n'a plus qu'à mener à « Régler ». */
  const termine = async () => {
    if (fin.enCours) return;
    setFin({ enCours: true, dit: '' });
    try {
      const { data, statut } = await demandeALaFin({ action: 'terminer', porte: 'site', v: jeton });
      const r = finLue(data, statut);
      if (r.etat === 'a-regler') { location.assign(r.adresse); return; }
      setFin({
        enCours: false,
        dit: r.etat === 'ferme' ? refusDit(r.raison)
          : r.etat === 'trop' ? 'Beaucoup de demandes d’un coup. Réessayez dans un moment.'
            : 'Le règlement ne répond pas. Réessayez dans un moment, ou passez au comptoir.',
      });
      if (r.etat === 'ferme') reessayer();
    } catch {
      setFin({ enCours: false, dit: 'Le règlement ne répond pas. Réessayez dans un moment, ou passez au comptoir.' });
    }
  };

  /* « TÉLÉCHARGER MA FACTURE (PDF) » : la règle du papier du Trône et son
     constructeur, chargés seulement maintenant (facture-du-billet.ts) ; le
     fichier porte le nom qu'il a au Trône (« Facture-<numéro>.pdf »). */
  const telechargeLaFacture = async () => {
    const facture = billet?.facture;
    if (!facture || papier.enCours) return;
    setPapier({ enCours: true, dit: '' });
    try {
      await telechargeLaFactureDuBillet(facture);
      setPapier({ enCours: false, dit: '' });
    } catch {
      setPapier({ enCours: false, dit: FACTURE_EN_PANNE });
    }
  };

  if (retrouver) return <RetrouverMonRendezVous wa={(mot) => lienWhatsApp(whatsapp, mot)} />;

  if (!lu) {
    return (
      <div className="rdv-page">
        {lent ? <RepliDuChargement phrase="Votre rendez-vous ne se charge pas." wa={waMaison} surReessayer={reessayer} /> : <Chargeur texte="Votre rendez-vous se charge." />}
      </div>
    );
  }
  if (lu.etat === 'panne' || lu.etat === 'trop') {
    return (
      <div className="rdv-page">
        <RepliDuChargement phrase={lu.etat === 'trop' ? 'Beaucoup de demandes d’un coup.' : 'Votre rendez-vous ne se charge pas.'} wa={waMaison} surReessayer={reessayer} />
      </div>
    );
  }
  if (lu.etat === 'lien') {
    return (
      <div className="rdv-page">
        <p className="sur">Votre rendez-vous</p>
        <h2>Ce lien ne vaut plus.</h2>
        <p className="corps">Il a peut-être servi pour un rendez-vous passé, ou il a été coupé en chemin. Écrivez à la Maison : elle retrouve votre rendez-vous avec votre prénom.</p>
        <p className="rangee">
          <a className="btn btn--plein" href={waMaison} target="_blank" rel="noopener">Écrire à la Maison sur WhatsApp</a>
          <a className="btn btn--lien" href={`${import.meta.env.BASE_URL}${CHEMIN_POUR_RETROUVER}`}>Le retrouver avec mon code</a>
        </p>
      </div>
    );
  }

  /* La référence manque d'une ancienne fonction : la même règle la calcule
     d'après l'identifiant que porte le jeton. */
  const r = { ...lu.rdv, reference: lu.rdv.reference || (apptId ? referenceDuRendezVous(apptId) : '') };
  const quand = quandDuRdv(r);
  const aVenir = r.statut === 'a-venir';
  const ics = fichierDuRdv(r, apptId);
  /* Le règlement : seulement sur la page du billet, jamais sur celle de l'agenda.
     Le jour de Cotonou sépare un rituel réglé d'un jour passé de celui du jour. */
  const aujourdhui = jourDeLaFin(Date.now());
  const reglement = !agendaSeul && billet ? reglementDuBillet(billet, aujourdhui) : null;
  /* Le jour même, le rituel a commencé : Déplacer et Annuler n'ont plus lieu d'être. */
  const changer = aVenir && !reglement?.leJourMeme;
  const blocDuReglement = reglement && (
    <div className="rdv-page__reglement">
      <p className="sur">{reglement.sur}</p>
      {reglement.montant && <p className="rdv-page__montant">{reglement.montant}</p>}
      <p className="legende">{reglement.phrase}</p>
      {reglement.bouton && (
        <p className="rangee">
          <button type="button" className="btn btn--plein" disabled={fin.enCours} onClick={() => { void termine(); }}>{fin.enCours ? 'Un instant…' : reglement.bouton}</button>
        </p>
      )}
      {reglement.telecharger && (
        <p className="rangee">
          <button type="button" className="btn btn--fort" disabled={papier.enCours} onClick={() => { void telechargeLaFacture(); }}>{papier.enCours ? 'La facture se prépare…' : reglement.telecharger}</button>
        </p>
      )}
      {reglement.note && <p className="legende">{reglement.note}</p>}
      {fin.dit && <p className="legende" role="alert">{fin.dit}</p>}
      {papier.dit && <p className="legende" role="alert">{papier.dit}</p>}
    </div>
  );
  return (
    <div className="rdv-page">
      <p className="sur">{aVenir ? 'Votre rendez-vous' : r.statut === 'annule' ? 'Rendez-vous annulé' : 'Rendez-vous passé'}</p>
      <h2>{aVenir
        ? (r.appel ? `${r.appel}, la Maison vous attend.` : 'La Maison vous attend.')
        : r.statut === 'annule' ? 'Ce rendez-vous est annulé.' : 'Ce rendez-vous a eu lieu.'}</h2>
      <p className="merci__place">{jourDit(r.date)}, à {heureDite(r.heure)}.</p>
      {(r.gestes.length > 0 || r.dureeMin > 0) && (
        <p className="merci__resume">{[r.gestes.map(gesteDitEnFrancaisWa).join(', '), dureeDite(r.dureeMin)].filter(Boolean).join(' · ')}</p>
      )}
      {r.reference && (
        <p className="merci__reference">
          <span>Votre référence</span>
          <b>{r.reference}</b>
          <small>À garder pour tout échange avec la Maison.</small>
        </p>
      )}
      {aVenir ? (
        <>
          {/* Avant l'heure du rituel : l'agenda, Déplacer, Annuler. Le jour même, dès son heure : le règlement seul. */}
          {changer && (
            <>
              {agendaSeul && <p className="legende">Le fichier de votre agenda se télécharge. S’il ne s’ouvre pas, touchez « Ajouter à mon agenda ».</p>}
              <div className="rangee">
                <a className="btn btn--fort" href={`data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`} download={nomDuFichierAgenda(r.date)}>Ajouter à mon agenda</a>
              </div>
              <div className="rdv-page__changer">
                <p className="legende">Un empêchement ? Un mot à la Maison suffit, votre référence est déjà dedans.</p>
                <p className="rangee">
                  <a className="btn" href={lienWhatsApp(whatsapp, motPourDeplacer(quand, r.reference))} target="_blank" rel="noopener" onClick={() => mesure('whatsapp_clique', { chemin: 'deplacer', page: '/rdv/' })}>Déplacer</a>
                  <a className="btn btn--lien" href={lienWhatsApp(whatsapp, motPourAnnuler(quand, r.reference))} target="_blank" rel="noopener" onClick={() => mesure('whatsapp_clique', { chemin: 'annuler', page: '/rdv/' })}>Annuler</a>
                </p>
              </div>
            </>
          )}
          {blocDuReglement}
        </>
      ) : (
        <>
          {blocDuReglement}
          <p className="rangee">
            <a className="btn btn--plein" href={`${import.meta.env.BASE_URL}reserver/`}>Réserver une autre venue</a>
            <a className="btn btn--lien" href={waMaison} target="_blank" rel="noopener">Écrire à la Maison</a>
          </p>
        </>
      )}
    </div>
  );
}
