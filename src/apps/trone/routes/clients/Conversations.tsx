import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHead } from '../_ui';
import { Button, toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { useAuth } from '../../../../shared/auth';
import { supabase } from '../../../../shared/supabase';
import { clientsStore, useClients } from '../../../../shared/clients';
import {
  useMessagesWa, useFilsPrives, basculeLeSecret, filsDeLaMaison, resteEnClair,
  pourquoiLEnvoiEstImpossible, numeroWa, messagesWaStore, type Fil,
} from '../../../../shared/conversations';
import { ClientPicker } from './_shared';
import './clients.css';

/* ═══════════════════════════════════════════════════════════════════
   LES CONVERSATIONS — maquette `public/maquette-les-conversations.html`,
   validée le 11 septembre 2026.

   « Comment je réussis à construire les conversations WhatsApp dans le
   trône ? » (Yéman).

   LE TRÔNE PARLAIT SANS ENTENDRE. Trois modèles partaient seuls, la cloche
   ouvrait des brouillons, et rien ne revenait : ce qu'une cliente répondait
   vivait dans un téléphone, pas dans la Maison.

   LA FENÊTRE DE 24 HEURES DESSINE CET ÉCRAN, et rien d'autre. On écrit
   librement pendant les 24 heures qui suivent SON dernier message ; passé ce
   délai, Meta n'accepte plus qu'un modèle approuvé. C'est ce qui fait rater
   la plupart des boîtes WhatsApp : on tape un texte, on appuie, et ça échoue
   avec une erreur illisible. L'écran porte donc la règle lui-même, et la
   zone de saisie se ferme AVANT qu'on ait tapé, plutôt qu'après.
   ═══════════════════════════════════════════════════════════════════ */

/** Les trois modèles approuvés de la Maison. Ce sont les seules phrases que
    WhatsApp accepte hors fenêtre, et chacune rouvre une conversation que Meta
    facture : l'écran le dit, il ne le cache pas. */
const MODELES = [
  { nom: 'rappel_rdv', dit: 'Rappel de rendez-vous', variables: 2 },
  { nom: 'confirmation_rdv', dit: 'Confirmation de rendez-vous', variables: 2 },
  { nom: 'avis_google', dit: 'Demande d’avis', variables: 1 },
] as const;

const heure = (iso: string) => {
  const d = new Date(iso);
  return `${d.getHours()} h ${String(d.getMinutes()).padStart(2, '0')}`;
};
const jour = (iso: string) => {
  const d = new Date(iso);
  const auj = new Date();
  const memeJour = d.toDateString() === auj.toDateString();
  if (memeJour) return 'Aujourd’hui';
  const hier = new Date(auj.getTime() - 86_400_000);
  if (d.toDateString() === hier.toDateString()) return 'Hier';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long' });
};

const initiales = (nom: string) =>
  nom.split(/\s+/).map((m) => m.charAt(0)).slice(0, 2).join('').toUpperCase() || '·';

export default function Conversations() {
  const navigate = useNavigate();
  const { branch } = useBranch();
  const { session } = useAuth();
  const [clients] = useClients();
  const [messages] = useMessagesWa();
  const [prives] = useFilsPrives();
  const [params, setParams] = useSearchParams();
  const [texte, setTexte] = useState('');
  const [envoiEnCours, setEnvoi] = useState(false);
  const [voirPrives, setVoirPrives] = useState(false);
  const [rattacher, setRattacher] = useState<Fil | null>(null);
  const finDuFil = useRef<HTMLDivElement>(null);

  /* L'HORLOGE BAT, SINON LA FENÊTRE MENT. Un écran ouvert depuis une heure
     afficherait « 23 h restantes » alors qu'il en reste 22 : on relit la
     règle chaque minute plutôt que de laisser la page vieillir. */
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setTick(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const tous = useMemo(
    () => filsDeLaMaison(messages, clients, prives, tick, branch.id),
    [messages, clients, prives, tick, branch.id],
  );
  /* « TOUT LE PERSONNEL, SAUF CE QUE JE MARQUE PRIVÉ » (Yéman, 11 septembre).
     Le fil privé se replie, il ne s'efface pas : un bouton le rouvre, et
     l'écran dit franchement que ce n'est pas un coffre. */
  const fils = useMemo(
    () => (voirPrives ? tous : tous.filter((f) => !f.prive)),
    [tous, voirPrives],
  );
  const nPrives = tous.filter((f) => f.prive).length;

  const ouvertNum = params.get('n') ?? '';
  const fil = tous.find((f) => f.numero === ouvertNum) ?? null;
  const ouvre = (n: string) => {
    setParams(n ? { n } : {}, { replace: true });
    setTexte('');
  };

  useEffect(() => {
    finDuFil.current?.scrollIntoView({ block: 'end' });
  }, [fil?.numero, fil?.messages.length]);

  const refus = fil
    ? pourquoiLEnvoiEstImpossible({ texte, fenetre: fil.fenetre, numero: fil.numero })
    : 'Choisissez un fil.';

  /* ── L'ENVOI PASSE PAR LA FONCTION, JAMAIS PAR LE NAVIGATEUR ────────
     Le jeton Meta autorise à écrire au nom de la Maison à n'importe quel
     numéro : le poser ici, ce serait le publier. */
  const envoie = async (modele?: string, variables: string[] = []) => {
    if (!fil || envoiEnCours) return;
    if (!modele && refus) { toast(refus); return; }
    /* SANS SUPABASE, RIEN NE PART, et l'écran le dit. La Maison peut tourner
       hors ligne pour lire son carnet ; écrire à une cliente, non. */
    if (!supabase) { toast('Pas de connexion à la Maison : le message n’est pas parti.'); return; }
    setEnvoi(true);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-envoi', {
        body: {
          numero: fil.numero,
          texte: modele ? '' : texte.trim(),
          modele: modele ?? '',
          variables,
          clientId: fil.clientId,
          branchId: branch.id,
          parQui: session?.user?.email ?? undefined,
        },
      });
      if (error) throw error;
      setTexte('');
      /* LA LIGNE EST DÉJÀ ÉCRITE PAR LA FONCTION ; la synchro la ramènera.
         On ne la pose pas à la main en plus : deux écritures pour un message
         finiraient par en afficher deux. */
      void data;
      toast(modele ? `Modèle « ${modele} » envoyé.` : 'Message envoyé.');
    } catch (e) {
      /* CE QUE META REFUSE SE DIT EN ENTIER. Un échec muet se cherche
         pendant des semaines, la Maison a déjà payé cette leçon. */
      const m = (e as { message?: string })?.message ?? String(e);
      toast(`Non envoyé : ${m}`);
    } finally {
      setEnvoi(false);
    }
  };

  /* RATTACHER UN NUMÉRO INCONNU À UNE FICHE — jamais l'inverse, et jamais
     tout seul. On écrit le numéro sur la fiche choisie ; les messages
     rejoignent sa tête au prochain rendu, sans qu'aucun message ne bouge. */
  const attache = (clientId: string, numero: string) => {
    const c = clients.find((x) => x.id === clientId);
    if (!c) return;
    const n = numeroWa(numero);
    /* LE PREMIER NUMÉRO NE S'ÉCRASE PAS : c'est le contact principal, celui
       des rappels. Un numéro qui écrit devient le SECOND, à moins que la
       fiche n'en ait aucun. */
    const champ = numeroWa(c.phone) ? 'phone2' : 'phone';
    clientsStore.set((prev) => prev.map((x) => (x.id === clientId ? { ...x, [champ]: `+${n}` } : x)));
    /* ON RATTACHE AUSSI L'HISTOIRE : les messages déjà reçus portent un
       `clientId` vide, et le rapprochement par numéro suffirait à l'écran —
       mais la fiche, le carnet et tout ce qui lira ces lignes demain veut
       l'identifiant écrit. */
    messagesWaStore.set((prev) => prev.map((m) => (numeroWa(m.numero) === n
      ? { ...m, clientId, branchId: m.branchId ?? c.branchId }
      : m)));
    setRattacher(null);
    toast(`Ce numéro est désormais celui de ${c.name.split(' ')[0]}.`);
  };

  return (
    <div className="tr-page">
      <PageHead
        eyebrow="Clients & agenda · ce qu’elles nous écrivent"
        title="Les conversations."
        actions={
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {nPrives > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setVoirPrives((v) => !v)}>
                {voirPrives ? 'Replier les fils privés' : `Voir les ${nPrives} fils privés`}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => navigate('/customers')}>
              Les clientes
            </Button>
          </div>
        }
      />

      {messages.length === 0 && (
        <div className="trc-passage-banner">
          Aucune conversation pour l’instant. Le Trône n’entend que depuis que l’oreille est posée :
          <b> Meta ne livre rien du passé</b>, le fil commence au premier message reçu. Si vos clientes
          vous écrivent sur un autre numéro que celui branché sur l’API, elles n’arriveront pas ici.
        </div>
      )}

      <div className="trc-convs">
        {/* ── LA BOÎTE ── */}
        <div className="trc-convs__boite">
          {fils.length === 0 && messages.length > 0 && (
            <div className="trc-empty">Aucun fil sur cette branche.</div>
          )}
          {fils.map((f) => (
            <button
              key={f.numero}
              type="button"
              className={`trc-conv${f.numero === ouvertNum ? ' is-ouvert' : ''}${f.attendUneReponse ? ' est-vif' : ''}`}
              onClick={() => ouvre(f.numero)}
            >
              <span className={`trc-conv__rond${f.sansFiche ? ' est-inconnu' : ''}`}>
                {f.sansFiche ? '?' : initiales(f.nom)}
              </span>
              <span className="trc-conv__c">
                <span className="trc-conv__n">{f.nom}</span>
                <span className="trc-conv__d">
                  {f.dernier.sens === 'sortant' ? 'Vous : ' : ''}{f.dernier.texte}
                </span>
              </span>
              <span className="trc-conv__r">
                <b>{jour(f.dernier.quand) === 'Aujourd’hui' ? heure(f.dernier.quand) : jour(f.dernier.quand)}</b>
                {f.sansFiche ? (
                  <span className="trc-horloge trc-horloge--inc">Sans fiche</span>
                ) : f.fenetre.ouverte ? (
                  <span className="trc-horloge trc-horloge--ouverte">{resteEnClair(f.fenetre.resteMs)}</span>
                ) : (
                  <span className="trc-horloge trc-horloge--close">Fermée</span>
                )}
                {f.prive && <span className="trc-horloge">Privé</span>}
              </span>
            </button>
          ))}
        </div>

        {/* ── LE FIL ── */}
        <div className="trc-convs__fil">
          {!fil ? (
            <div className="trc-empty" style={{ margin: 'auto' }}>
              Choisissez un fil à gauche.
            </div>
          ) : (
            <>
              <div className="trc-fil__tete">
                <span>
                  <b>{fil.nom}</b>
                  <span className="trc-sub" style={{ display: 'block', fontSize: 11.5 }}>
                    +{fil.numero}
                    {fil.sansFiche ? ' · aucune fiche' : ''}
                  </span>
                </span>
                <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                  {fil.sansFiche ? (
                    <button type="button" className="trv-minibtn" onClick={() => setRattacher(fil)}>
                      Rattacher à une fiche
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="trv-minibtn"
                      onClick={() => navigate(`/customers?id=${fil.clientId}`)}
                    >
                      Ouvrir sa fiche
                    </button>
                  )}
                  <button
                    type="button"
                    className="trv-minibtn"
                    title={fil.prive
                      ? 'Rouvrir ce fil au personnel'
                      : 'Replier ce fil : il ne paraîtra plus dans la liste, sans être verrouillé'}
                    onClick={() => basculeLeSecret(fil.numero)}
                  >
                    {fil.prive ? 'Rouvrir' : 'Marquer privé'}
                  </button>
                </span>
              </div>

              <div className="trc-bulles">
                {fil.messages.map((m, i) => {
                  const nouveauJour = i === 0 || jour(fil.messages[i - 1].quand) !== jour(m.quand);
                  return (
                    <div key={m.id} style={{ display: 'contents' }}>
                      {nouveauJour && <span className="trc-jour">{jour(m.quand)}</span>}
                      <div className={`trc-b trc-b--${m.sens === 'entrant' ? 'elle' : m.modele ? 'modele' : 'nous'}`}>
                        {m.texte}
                        <span className="trc-b__h">
                          {m.modele ? `Modèle ${m.modele} · ` : ''}{heure(m.quand)}
                          {m.etat === 'lu' ? ' · lu' : m.etat === 'remis' ? ' · remis'
                            : m.etat === 'non-remis' ? ' · non remis' : m.etat === 'en-route' ? ' · en route' : ''}
                          {m.detail ? ` · ${m.detail}` : ''}
                        </span>
                      </div>
                    </div>
                  );
                })}
                <div ref={finDuFil} />
              </div>

              {/* ── LA SAISIE, ET LA RÈGLE QU'ELLE PORTE ── */}
              <div className={`trc-saisie${fil.fenetre.ouverte ? '' : ' est-close'}`}>
                <div className="trc-saisie__q">
                  {fil.fenetre.ouverte ? (
                    <>
                      <span className="trc-horloge trc-horloge--ouverte">
                        Fenêtre ouverte · {resteEnClair(fil.fenetre.resteMs)}
                      </span>
                      <span className="trc-sub" style={{ fontSize: 12 }}>
                        Elle a écrit à {heure(fil.fenetre.depuis ?? fil.dernier.quand)}. Vous pouvez répondre
                        librement jusque-là demain.
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="trc-horloge trc-horloge--close">
                        {fil.fenetre.depuis ? 'Fenêtre fermée' : 'Elle ne vous a jamais écrit'}
                      </span>
                      <span className="trc-sub" style={{ fontSize: 12 }}>
                        WhatsApp n’accepte plus que vos modèles approuvés. Un modèle rouvre une
                        conversation de 24 h, <b>et Meta la facture</b>.
                      </span>
                    </>
                  )}
                </div>

                {fil.fenetre.ouverte ? (
                  <>
                    <textarea
                      className="mnd-input"
                      rows={2}
                      value={texte}
                      placeholder={`Écrivez à ${fil.nom.split(' ')[0]}…`}
                      onChange={(e) => setTexte(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void envoie(); }
                      }}
                    />
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span className="trc-sub" style={{ fontSize: 11, marginRight: 'auto' }}>
                        La devise ne se pose pas ici : elle signe ce que la Maison écrit seule.
                      </span>
                      <Button
                        variant="copper"
                        size="sm"
                        disabled={!!refus || envoiEnCours}
                        onClick={() => void envoie()}
                      >
                        {envoiEnCours ? 'Envoi…' : 'Envoyer'}
                      </Button>
                    </div>
                  </>
                ) : (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {MODELES.map((m) => (
                      <Button
                        key={m.nom}
                        variant="copper"
                        size="sm"
                        disabled={envoiEnCours}
                        title={`${m.dit} · ${m.nom}`}
                        onClick={() => void envoie(m.nom)}
                      >
                        {m.dit}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* RATTACHER — on choisit une tête EXISTANTE. Créer une fiche depuis un
          numéro qui écrit remplirait la base de démarcheurs en un mois. */}
      {rattacher && (
        <div className="trc-modal-fond" onClick={() => setRattacher(null)}>
          <div className="trc-modal" onClick={(e) => e.stopPropagation()}>
            <div className="trc-modal__t">
              À qui appartient le +{rattacher.numero} ?
            </div>
            <p className="trc-sub" style={{ marginTop: 0 }}>
              Le numéro s’écrira sur la fiche choisie, et tout ce fil la rejoindra.
              Si elle a déjà un numéro principal, celui-ci devient son second.
              <b> Aucune fiche n’est créée ici</b> : si c’est une nouvelle tête, ouvrez-la d’abord
              depuis Les clientes.
            </p>
            <ClientPicker
              value=""
              onChange={(id) => id && attache(id, rattacher.numero)}
              placeholder="Cherchez une cliente…"
            />
          </div>
        </div>
      )}
    </div>
  );
}
