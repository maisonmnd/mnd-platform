import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHead } from '../_ui';
import { Button, Select, Textarea, toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { useAuth } from '../../../../shared/auth';
import { useClients, clientsStore } from '../../../../shared/clients';
import { useInvoices, invoiceTotal, invoiceResteXof } from '../../../../shared/finance';
import { useAppointments } from '../../../../shared/agenda';
import { fmtMoney } from '../../../../shared/currency';
import {
  filStore, useFil, nouveauMessage, estDemande, demandeOuverte, messagesDuCanal, mesDemandes,
  CANAL_MAISON, A_PRENDRE, canalAtelier, canalNotes, canalDM, estCanalPrive, totalDuComptage, comptageEnClair, puisJeReprendre, puisJeClore, fusionnerComptages, comptageComplet, deposerFichier, adresseSignee, poidsEnClair,
  type FilMessage, type FilPiece,
} from '../../../../shared/fil';
import { useCategories } from '../../../../shared/catalog';
import { dernierComptage } from '../../../../shared/fil';
import { useStaff } from './data';
import { apptLabel, useServicesById, ClientPicker } from '../clients/_shared';
import './equipe.css';

/* ═══════════════════════════════════════════════════════════════════
   LE FIL — maquette `public/maquette-le-fil.html`, validée le 18 août 2026.

   Le cœur d'abord, comme convenu : un fil pour toute la Maison, les demandes,
   la pièce attachée. Les tête-à-tête et les fils par atelier viendront d'après
   ce qui aura manqué, pas d'après ce qu'on imagine aujourd'hui.
   ═══════════════════════════════════════════════════════════════════ */

/** L'heure d'un message — le jour ne se dit que s'il n'est pas aujourd'hui. */
const quand = (at: string, aujourdhui: string): string => {
  const [jour, heure] = at.split('T');
  if (jour === aujourdhui) return heure ?? '';
  const [, m, d] = jour.split('-');
  return `${d}/${m} · ${heure ?? ''}`;
};

/** LA PIÈCE JOINTE — elle demande son adresse à chaque affichage.

    Le compartiment est PRIVÉ : rien ne s'y lit sans un jeton signé, valable une
    heure. On ne garde donc pas l'adresse dans le message — elle serait morte
    demain, et un lien mort dans un registre donne à croire que le fichier a
    disparu. On en redemande une, à chaque fois.

    Une image se montre ; un PDF s'annonce et s'ouvre. Montrer une vignette de
    PDF gris ne dirait rien de plus que son nom. */
function PieceJointe({ f }: { f: NonNullable<FilMessage['fichier']> }) {
  const [url, setUrl] = useState<string | null>(null);
  const [refuse, setRefuse] = useState(false);
  useEffect(() => {
    let vivant = true;
    void adresseSignee(f.chemin).then((u) => {
      if (!vivant) return;
      if (u) setUrl(u); else setRefuse(true);
    });
    return () => { vivant = false; };
  }, [f.chemin]);

  if (refuse) {
    return <div className="trf-fil__fichier">Ce fichier ne peut plus être ouvert — {f.nom}</div>;
  }
  const estImage = f.type.startsWith('image/');
  return (
    <a
      className="trf-fil__fichier"
      href={url ?? undefined}
      target="_blank"
      rel="noopener noreferrer"
      title={`${f.nom} · ${poidsEnClair(f.taille)}`}
    >
      {estImage && url
        ? <img src={url} alt="" />
        : <span className="trf-fil__fichiernom">{f.nom}</span>}
      <span className="trf-fil__fichiermeta">{f.nom} · {poidsEnClair(f.taille)}</span>
    </a>
  );
}

const initiales = (nom: string) => nom.trim().split(/\s+/).slice(0, 2).map((x) => x[0]?.toUpperCase() ?? '').join('');

export default function Fil() {
  const navigate = useNavigate();
  const { branch, currency } = useBranch();
  const { session } = useAuth();
  const [tous] = useFil();
  const [equipe] = useStaff();
  const [invoices] = useInvoices();
  const [appts] = useAppointments();
  const [clients] = useClients();
  const [cats] = useCategories();
  const byId = useServicesById();

  /* QUI JE SUIS — l'adresse de la session, seule identité sûre. Le nom se
     retrouve sur la fiche du personnel ; à défaut, l'adresse fait le nom, pour
     qu'un message ne soit jamais signé « inconnu ». */
  const monMail = (session?.user?.email ?? '').trim().toLowerCase();
  const moi = equipe.find((m) => (m.email ?? '').trim().toLowerCase() === monMail);
  const monNom = moi?.name?.trim() || monMail.split('@')[0] || 'La maison';

  const aujourdhui = useMemo(() => {
    const d = new Date();
    const p2 = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  }, []);

  /* ── LES FILS ────────────────────────────────────────────────────
     Toute la Maison, un fil par atelier, mes notes, et un tête-à-tête par
     membre. Ils sont FABRIQUÉS, pas stockés : un atelier ajouté au Catalogue
     a son fil le jour même, sans qu'on ait à le créer — et un fil vide ne
     coûte rien tant que personne n'y écrit. */
  const ateliers = useMemo(
    () => cats.filter((c) => !c.parentId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [cats],
  );
  const autres = useMemo(
    () => equipe.filter((m) => m.branchId === branch.id
      && (m.email ?? '').trim().toLowerCase() !== monMail
      && (m.email ?? '').trim() !== ''),
    [equipe, branch.id, monMail],
  );
  const [canal, setCanal] = useState<string>(CANAL_MAISON);

  const messages = messagesDuCanal(tous, branch.id, canal, monMail);
  const aTraiter = mesDemandes(tous, branch.id, monMail, invoices);
  /* Combien de messages non lus ? On ne suit pas la lecture — ce serait un
     registre de plus. On montre COMBIEN il y a, ce qui suffit à savoir où
     ça parle. */
  const compteDe = (c: string) => messagesDuCanal(tous, branch.id, c, monMail).length;
  const titreDuCanal = () => {
    if (canal === CANAL_MAISON) return 'Toute la Maison';
    if (canal === canalNotes(monMail)) return 'Mes notes';
    const at = ateliers.find((c) => canalAtelier(c.id) === canal);
    if (at) return at.fon || at.label;
    const qui = autres.find((m) => canalDM(monMail, m.email ?? '') === canal);
    return qui ? qui.name : 'Le Fil';
  };

  /* ── Ce qu'on écrit ── */
  const [texte, setTexte] = useState('');
  const [pourQui, setPourQui] = useState('');
  /* L'ÉCHÉANCE d'une demande — facultative, décision de la maquette du
     Tableau : sans elle, « en retard » n'existe pas ; avec elle obligatoire,
     on inventerait des dates. */
  const [echeance, setEcheance] = useState('');
  const [pieceRef, setPieceRef] = useState('');
  /* ── LE COMPTAGE ────────────────────────────────────────────────
     « Parfois c'est Gérard qui compte, pas moi » : le fil est la porte par
     laquelle un maître pose un nombre qu'il ne peut pas écrire sur la fiche.
     On demande la TÊTE explicitement — un comptage sans nom ne se rattache à
     personne, et ce serait un chiffre perdu. */
  /* Le fichier qu'on joint — choisi, puis déposé au moment de l'envoi. Déposer
     avant d'envoyer laisserait des fichiers orphelins dans le compartiment
     chaque fois qu'on renonce à écrire. */
  const [fichier, setFichier] = useState<File | null>(null);
  const [depotEnCours, setDepotEnCours] = useState(false);
  const champFichier = useRef<HTMLInputElement>(null);

  const [compteOuvert, setCompteOuvert] = useState(false);
  const [compteTete, setCompteTete] = useState('');
  /* QUATRE QUADRANTS — devant gauche/droite, derrière gauche/droite. C'est
     ainsi qu'une tête se compte : on recompte le quart qui cloche, pas tout. */
  const [avG, setAvG] = useState('');
  const [avD, setAvD] = useState('');
  const [arG, setArG] = useState('');
  const [arD, setArD] = useState('');
  /* Un champ VIDE veut dire « pas encore compté », pas « zéro ». */
  const nbOuRien = (v: string) => (v.trim() === '' ? undefined : Math.max(0, Math.round(Number(v.replace(/[^0-9]/g, '')) || 0)));
  const comptageSaisi = {
    avantG: nbOuRien(avG), avantD: nbOuRien(avD), arriereG: nbOuRien(arG), arriereD: nbOuRien(arD),
  };
  const totalCompte = totalDuComptage(comptageSaisi);

  /* ── ON REPREND LÀ OÙ L'ON S'ÉTAIT ARRÊTÉ ────────────────────────
     « Ne se fait pas d'un coup. Sauvegarder pour s'en souvenir et ensuite
     rajouter et cumuler. » Choisir la tête rappelle son dernier comptage : on
     complète les quarts manquants au lieu de tout recompter, et rien de déjà
     compté ne se perd. */
  useEffect(() => {
    if (!compteTete) return;
    const d = dernierComptage(tous, branch.id, compteTete)?.comptage;
    setAvG(d?.avantG != null ? String(d.avantG) : '');
    setAvD(d?.avantD != null ? String(d.avantD) : '');
    setArG(d?.arriereG != null ? String(d.arriereG) : '');
    setArD(d?.arriereD != null ? String(d.arriereD) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compteTete]);
  const teteDuBranche = useMemo(
    () => clients.filter((c) => c.branchId === branch.id).sort((a, b) => a.name.localeCompare(b.name)),
    [clients, branch.id],
  );

  /* LES PIÈCES QU'ON PEUT DÉSIGNER — les plus récentes, pas toutes : une liste
     de quatre cents factures ne se parcourt pas au moment d'écrire une phrase.
     La vraie porte reste le bouton « Demander » posé SUR la facture. */
  const piecesProposees = useMemo((): { valeur: string; libelle: string; piece: FilPiece }[] => {
    const nomDe = (id: string) => clients.find((c) => c.id === id)?.name ?? 'Cliente';
    const fact = invoices
      .filter((i) => i.branchId === branch.id && i.kind === 'facture')
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 20)
      .map((i) => {
        const reste = invoiceResteXof(i);
        const label = `${i.number} · ${i.clientName ?? nomDe(i.clientId)} · ${fmtMoney(invoiceTotal(i), currency)}${reste > 0 ? ` · reste ${fmtMoney(reste, currency)}` : ''}`;
        return { valeur: `facture:${i.id}`, libelle: `Facture — ${label}`, piece: { kind: 'facture' as const, id: i.id, label } };
      });
    const rdv = appts
      .filter((a) => a.branchId === branch.id && a.status !== 'annulé')
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 20)
      .map((a) => {
        const label = `${nomDe(a.clientId)} · ${a.date} ${a.time} · ${apptLabel(a, byId)}`;
        return { valeur: `rituel:${a.id}`, libelle: `Rituel — ${label}`, piece: { kind: 'rituel' as const, id: a.id, label } };
      });
    return [...fact, ...rdv];
  }, [invoices, appts, clients, branch.id, currency, byId]);

  const envoyer = async () => {
    const dit = texte.trim();
    const compteSeul = compteOuvert && compteTete && totalCompte > 0;
    if (!dit && !compteSeul && !fichier) return;

    /* LE FICHIER PART EN PREMIER. S'il ne passe pas, on le DIT et l'on n'écrit
       rien : un message qui annonce une capture absente est pire que pas de
       message — on la chercherait. */
    let joint: FilMessage['fichier'] | undefined;
    if (fichier) {
      setDepotEnCours(true);
      joint = (await deposerFichier(branch.id, fichier)) ?? undefined;
      setDepotEnCours(false);
      if (!joint) { toast('Le fichier n’a pas pu être déposé — rien n’a été envoyé.'); return; }
    }
    /* « À prendre » — une demande sans destinataire, que n'importe qui peut
       prendre sur le Tableau. La sentinelle n'est pas une adresse : elle ne
       tombera dans le « à traiter » de personne par accident. */
    const aPrendre = pourQui === A_PRENDRE;
    const dest = aPrendre ? undefined : equipe.find((m) => m.id === pourQui);
    const tete = compteOuvert && compteTete ? teteDuBranche.find((c) => c.id === compteTete) : undefined;
    /* Le nouveau COMPLÈTE l'ancien : un quart laissé vide garde ce qu'il
       valait, il ne le remet pas à zéro. */
    const comptage = tete && totalCompte > 0
      ? fusionnerComptages(dernierComptage(tous, branch.id, tete.id)?.comptage, comptageSaisi)
      : undefined;
    /* Un comptage désigne SA tête : la pièce attachée devient la cliente, et la
       fiche saura retrouver ce message. */
    const choisie: FilPiece | undefined = tete
      ? { kind: 'cliente', id: tete.id, label: tete.name }
      : piecesProposees.find((p) => p.valeur === pieceRef)?.piece;
    filStore.set((prev) => [...prev, nouveauMessage({
      branchId: branch.id,
      canal,
      auteurMail: monMail,
      auteurNom: monNom,
      texte: dit || (comptage ? `Comptage · ${comptageEnClair(comptage)}` : joint?.nom ?? ''),
      piece: choisie,
      fichier: joint,
      comptage,
      demandePour: aPrendre ? A_PRENDRE : dest ? (dest.email ?? '').trim().toLowerCase() : undefined,
      demandePourNom: aPrendre ? 'À prendre' : dest?.name,
      echeance: (aPrendre || dest) && echeance ? echeance : undefined,
      /* UN MESSAGE QUI PORTE UNE FACTURE PARLE D'ARGENT. On le marque sans le
         demander : compter sur la mémoire de celui qui écrit, c'est laisser un
         montant passer sous les yeux d'un maître un jour de presse. */
      argent: choisie?.kind === 'facture' || undefined,
    })]);
    /* LE NOMBRE REMONTE À LA FICHE — quand on en a le droit. Un maître dont le
       CRM est fermé verra sa poussée refusée par le serveur ; le comptage
       restera dans le fil, et la fiche l'y lira quand même (`dernierComptage`).
       On tente donc, sans en faire une condition : le geste ne doit pas échouer
       parce qu'une seconde écriture n'est pas permise. */
    if (tete && comptage) {
      clientsStore.set((prev) => prev.map((c) => (c.id === tete.id
        ? { ...c, lockCount: totalDuComptage(comptage) }
        : c)));
    }
    setTexte(''); setPourQui(''); setPieceRef(''); setEcheance('');
    setFichier(null); if (champFichier.current) champFichier.current.value = '';
    setCompteOuvert(false); setCompteTete(''); setAvG(''); setAvD(''); setArG(''); setArD('');
    toast(comptage
      ? `Comptage posé — ${tete?.name} · ${totalDuComptage(comptage)} locks.`
      : aPrendre ? 'Demande posée — à prendre sur le Tableau.'
      : dest ? `Demande adressée à ${dest.name}.` : 'Message posé au fil.');
  };

  /* ── REPRENDRE SA PHRASE ─────────────────────────────────────────
     La sienne, et pas celle d'un autre. La reprise se DIT — « modifié » —
     parce qu'un registre qui change en silence ne prouve plus rien. */
  const [enReprise, setEnReprise] = useState<string | null>(null);
  const [repris, setRepris] = useState('');
  const commencerLaReprise = (m: FilMessage) => { setEnReprise(m.id); setRepris(m.texte); };
  const enregistrerLaReprise = () => {
    const dit = repris.trim();
    if (!enReprise || !dit) return;
    const d = new Date();
    const p2 = (n: number) => String(n).padStart(2, '0');
    const quandCa = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
    filStore.set((prev) => prev.map((x) => (x.id === enReprise ? { ...x, texte: dit, modifieAt: quandCa } : x)));
    setEnReprise(null); setRepris('');
  };
  /* Effacer la sienne — une note, pas une demande en cours : celle-là engage
     quelqu'un d'autre, et disparaîtrait de son « à traiter » sans un mot. */
  const effacer = (m: FilMessage) => {
    if (!window.confirm('Effacer ce message ? Il disparaîtra du fil pour tout le monde.')) return;
    filStore.set((prev) => prev.filter((x) => x.id !== m.id));
    toast('Message effacé.');
  };

  /* ── LA CASE SE COCHE ET SE DÉCOCHE — 18 août 2026 ───────────────
     « I want a checkbox that I can check or uncheck instead of c'est fait. »

     Un bouton à sens unique suppose qu'on ne se trompe jamais. Or Gérard vient
     de clore une demande qui ne lui revenait pas : sans retour en arrière, elle
     serait perdue pour Yéman, qui ne la verrait plus dans son « à traiter » et
     ne saurait pas qu'elle a existé. Une case qui se décoche répare cela d'un
     geste, et ne cache rien : la reprise se voit comme le reste. */
  const basculerFait = (m: FilMessage) => {
    const d = new Date();
    const p2 = (n: number) => String(n).padStart(2, '0');
    const maintenant = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
    filStore.set((prev) => prev.map((x) => (x.id === m.id
      ? (x.faitAt
        ? { ...x, faitAt: undefined, faitPar: undefined }
        : { ...x, faitAt: maintenant, faitPar: monNom })
      : x)));
  };

  const ouvrirLaPiece = (p: FilPiece) => {
    if (p.kind === 'facture') navigate(`/factures?id=${p.id}`);
    else if (p.kind === 'rituel') navigate('/carnet');
    else navigate('/customers');
  };

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="La Maison · le registre interne"
        title="Le Fil."
        sub="Se parler, et demander qu'une chose soit faite — une demande qui porte une facture s'éteint quand la facture est réglée."
      />

      <div className="trf-fil">
        {/* ── Les fils, puis ce qui m'attend ── */}
        <aside className="trf-fil__volet">
          <div className="trf-fil__label">Les fils</div>
          <button type="button" className={`trf-fil__canal${canal === CANAL_MAISON ? ' est-ouvert' : ''}`} onClick={() => setCanal(CANAL_MAISON)}>
            Toute la Maison<span>{compteDe(CANAL_MAISON) || ''}</span>
          </button>
          {ateliers.map((c) => {
            const k = canalAtelier(c.id);
            return (
              <button key={c.id} type="button" className={`trf-fil__canal${canal === k ? ' est-ouvert' : ''}`} onClick={() => setCanal(k)}>
                {c.fon || c.label}<span>{compteDe(k) || ''}</span>
              </button>
            );
          })}

          <div className="trf-fil__label" style={{ marginTop: 16 }}>Pour moi seul</div>
          <button type="button" className={`trf-fil__canal${canal === canalNotes(monMail) ? ' est-ouvert' : ''}`} onClick={() => setCanal(canalNotes(monMail))}>
            Mes notes<span>{compteDe(canalNotes(monMail)) || ''}</span>
          </button>
          {autres.map((m) => {
            const k = canalDM(monMail, m.email ?? '');
            return (
              <button key={m.id} type="button" className={`trf-fil__canal${canal === k ? ' est-ouvert' : ''}`} onClick={() => setCanal(k)}>
                {m.name}<span>{compteDe(k) || ''}</span>
              </button>
            );
          })}

          <div className="trf-fil__label" style={{ marginTop: 16 }}>À traiter · {aTraiter.length}</div>
          {aTraiter.length === 0 && (
            <div className="trf-fil__vide">Rien ne vous attend.</div>
          )}
          {aTraiter.map((m) => (
            <div key={m.id} className="trf-fil__att">
              {m.texte}
              <small>{m.auteurNom} · {quand(m.at, aujourdhui)}</small>
              <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap', marginTop: 4 }}>
                {/* LA CASE SE COCHE OÙ LA DEMANDE SE LIT — 18 août 2026 :
                    « avoir un bouton pour cocher que la note a été traitée ».
                    Elle n'existait que sur le message, au fond du fil : il
                    fallait retrouver la conversation pour clore une chose déjà
                    faite. On coche là où on la voit. */}
                {puisJeClore(m, monMail) && (
                  <label className="trf-fil__case">
                    <input type="checkbox" checked={!!m.faitAt} onChange={() => basculerFait(m)} />
                    <span>Traité</span>
                  </label>
                )}
                {m.piece && (
                  <button type="button" className="trf-fil__lien" onClick={() => ouvrirLaPiece(m.piece!)}>
                    Ouvrir {m.piece.kind === 'facture' ? 'la facture' : m.piece.kind === 'rituel' ? 'le rituel' : 'la fiche'}
                  </button>
                )}
                {/* Aller à la conversation d'où elle vient — une demande se
                    comprend souvent dans ce qui l'entoure. */}
                <button type="button" className="trf-fil__lien" onClick={() => setCanal(m.canal)}>Voir le fil</button>
              </div>
            </div>
          ))}
        </aside>

        {/* ── Le fil ── */}
        <section className="trf-fil__corps">
          <div className="trf-fil__tete">
            <h4>{titreDuCanal()}</h4>
            <span>{messages.length} message{messages.length > 1 ? 's' : ''}</span>
            {estCanalPrive(canal) && (
              <span style={{ color: 'var(--copper-700)' }}>
                {canal.startsWith('notes:') ? '· personne d’autre ne les lit' : '· en tête à tête'}
              </span>
            )}
          </div>

          <div className="trf-fil__flux">
            {messages.length === 0 && (
              <div className="trf-fil__vide" style={{ padding: '28px 0' }}>
                Le fil est vide. Écrivez la première phrase.
              </div>
            )}
            {messages.map((m) => {
              const ouverte = demandeOuverte(m, invoices);
              return (
                <div key={m.id} className="trf-fil__msg">
                  <span className="trf-fil__av">{initiales(m.auteurNom)}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="trf-fil__qui">
                      <b>{m.auteurNom}</b> · {quand(m.at, aujourdhui)}
                      {m.modifieAt && <> · <em style={{ fontStyle: 'normal', color: 'var(--copper-700)' }}>modifié</em></>}
                      {puisJeReprendre(m, monMail) && enReprise !== m.id && (
                        <>
                          {' · '}
                          <button type="button" className="trf-fil__mini" onClick={() => commencerLaReprise(m)}>Modifier</button>
                          {' · '}
                          <button type="button" className="trf-fil__mini" onClick={() => effacer(m)}>Effacer</button>
                        </>
                      )}
                    </div>

                    <div className={estDemande(m) ? `trf-fil__demande${ouverte ? '' : ' est-close'}` : ''}>
                      {estDemande(m) && (
                        <div className="trf-fil__demtete">
                          {ouverte
                            ? `Demande à ${m.demandePourNom ?? m.demandePour} · à traiter`
                            : `Demande à ${m.demandePourNom ?? m.demandePour} · faite${m.faitPar ? ` par ${m.faitPar}` : ' — la pièce est réglée'}`}
                        </div>
                      )}
                      {enReprise === m.id ? (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                          <Textarea
                            rows={2}
                            value={repris}
                            onChange={(e) => setRepris(e.target.value)}
                            style={{ flex: 1, minWidth: 200 }}
                          />
                          <Button variant="copper" size="sm" onClick={enregistrerLaReprise}>Enregistrer</Button>
                          <Button variant="ghost" size="sm" onClick={() => setEnReprise(null)}>Annuler</Button>
                        </div>
                      ) : (
                        <div className="trf-fil__texte">{m.texte}</div>
                      )}

                      {m.fichier && <PieceJointe f={m.fichier} />}
                      {m.comptage && (
                        <div className="trf-fil__compte">
                          <b>{totalDuComptage(m.comptage)} locks</b>
                          <span>{comptageEnClair(m.comptage)}</span>
                        </div>
                      )}
                      {m.piece && (
                        <div className="trf-fil__piece">
                          <div className="trf-fil__piecequoi">
                            {m.piece.kind === 'facture' ? 'Facture' : m.piece.kind === 'rituel' ? 'Rendez-vous' : 'Cliente'}
                          </div>
                          <div className="trf-fil__piecetitre">{m.piece.label}</div>
                          <button type="button" className="trf-fil__lien" onClick={() => ouvrirLaPiece(m.piece!)}>
                            Ouvrir
                          </button>
                        </div>
                      )}

                      {estDemande(m) && (
                        <div style={{ marginTop: 9 }}>
                          {puisJeClore(m, monMail) ? (
                            <label className="trf-fil__case">
                              <input
                                type="checkbox"
                                checked={!!m.faitAt}
                                onChange={() => basculerFait(m)}
                              />
                              <span>
                                {m.faitAt
                                  ? `Traité${m.faitPar ? ` par ${m.faitPar}` : ''} — décocher pour rouvrir`
                                  : 'Marquer comme traité'}
                              </span>
                            </label>
                          ) : (
                            /* Ni destinataire ni auteur : on LIT la demande, on ne
                               l'éteint pas. Clore le travail d'un autre le ferait
                               disparaître de sa liste sans qu'il l'ait fait. */
                            <span className="mnd-muted" style={{ fontSize: 11.5 }}>
                              À {m.demandePourNom ?? m.demandePour} d'y répondre.
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Ce qu'on écrit ── */}
          <div className="trf-fil__compo">
            <Textarea
              rows={2}
              value={texte}
              onChange={(e) => setTexte(e.target.value)}
              placeholder={canal.startsWith('notes:') ? 'Une note pour moi…' : `Écrire — ${titreDuCanal()}`}
            />
            {compteOuvert && (
              <div className="trf-fil__compteur">
                {/* CHERCHER LA TÊTE, pas la faire défiler — 18 août 2026.
                    Une liste déroulante de quatre cents noms se parcourt à
                    l'aveugle : on cherche « Jade » et l'on descend jusqu'au J.
                    Le sélecteur de la Maison cherche par NOM ET PAR TÉLÉPHONE,
                    et c'est déjà celui du carnet et du coffre — une seule façon
                    de désigner une cliente, partout. */}
                <div style={{ minWidth: 220, flex: 1 }}>
                  <ClientPicker
                    value={compteTete}
                    onChange={setCompteTete}
                    placeholder="Chercher la tête — nom, téléphone…"
                  />
                </div>
                <label>Devant G
                  <input className="mnd-input" inputMode="numeric" value={avG} onChange={(e) => setAvG(e.target.value)} />
                </label>
                <label>Devant D
                  <input className="mnd-input" inputMode="numeric" value={avD} onChange={(e) => setAvD(e.target.value)} />
                </label>
                <label>Derrière G
                  <input className="mnd-input" inputMode="numeric" value={arG} onChange={(e) => setArG(e.target.value)} />
                </label>
                <label>Derrière D
                  <input className="mnd-input" inputMode="numeric" value={arD} onChange={(e) => setArD(e.target.value)} />
                </label>
                <span className="trf-fil__total">
                  {totalCompte > 0 ? `${totalCompte} locks` : '—'}
                  {totalCompte > 0 && !comptageComplet(comptageSaisi) && (
                    <em style={{ display: 'block', fontFamily: 'var(--font-sans)', fontStyle: 'normal', fontSize: 10.5, color: 'var(--copper-700)' }}>
                      partiel — il reste des quarts
                    </em>
                  )}
                </span>
              </div>
            )}
            <div className="trf-fil__outils">
              {/* JOINDRE UNE CAPTURE — le compartiment est privé et fermé au
                  seul personnel ; le fichier n'existe nulle part ailleurs. */}
              <input
                ref={champFichier}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
                style={{ display: 'none' }}
                onChange={(e) => setFichier(e.target.files?.[0] ?? null)}
              />
              <Button variant={fichier ? 'copper' : 'ghost'} size="sm" onClick={() => champFichier.current?.click()}>
                {fichier ? `${fichier.name.slice(0, 22)} · ${poidsEnClair(fichier.size)}` : 'Joindre un fichier'}
              </Button>
              {fichier && (
                <button
                  type="button"
                  className="trf-fil__mini"
                  onClick={() => { setFichier(null); if (champFichier.current) champFichier.current.value = ''; }}
                >
                  Retirer
                </button>
              )}
              <Button
                variant={compteOuvert ? 'copper' : 'ghost'}
                size="sm"
                onClick={() => setCompteOuvert((v) => !v)}
              >
                {compteOuvert ? 'Sans comptage' : 'Compter des locks'}
              </Button>
              <Select value={pieceRef} onChange={(e) => setPieceRef(e.target.value)} disabled={compteOuvert} style={{ fontSize: 12, maxWidth: 320 }}>
                <option value="">Joindre une pièce · facultatif</option>
                {piecesProposees.map((p) => (
                  <option key={p.valeur} value={p.valeur}>{p.libelle}</option>
                ))}
              </Select>
              <Select value={pourQui} onChange={(e) => setPourQui(e.target.value)} style={{ fontSize: 12, maxWidth: 220 }}>
                <option value="">Sans demande</option>
                <option value={A_PRENDRE}>En faire une demande · à prendre</option>
                {equipe.filter((m) => m.branchId === branch.id).map((m) => (
                  <option key={m.id} value={m.id}>En faire une demande · {m.name}</option>
                ))}
              </Select>
              {pourQui !== '' && (
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--ink-soft)' }}>
                  Échéance
                  <input
                    className="mnd-input"
                    type="date"
                    value={echeance}
                    onChange={(e) => setEcheance(e.target.value)}
                    style={{ padding: '4px 7px', fontSize: 12 }}
                  />
                </label>
              )}
              <Button
                variant="copper"
                size="sm"
                disabled={depotEnCours || (!texte.trim() && !fichier && !(compteOuvert && compteTete && totalCompte > 0))}
                onClick={() => void envoyer()}
              >
                {depotEnCours ? 'Dépôt du fichier…'
                  : compteOuvert && compteTete && totalCompte > 0 ? 'Poser le comptage'
                  : pourQui ? 'Demander' : 'Envoyer'}
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
