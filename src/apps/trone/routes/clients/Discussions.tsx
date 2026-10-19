import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PageHead } from '../_ui';
import { Button, demande, toast } from '../../../../ds/components';
import { useStaff } from '../../../../shared/auth';
import { appelDe } from '../../../../shared/civilite';
import { clientsStore, ensureInitiePersona } from '../../../../shared/clients';
import { signeLeMessage } from '../../../../shared/identite';
import { depuisQuand, ficheDepuisLaDemande, telephoneMasque, telephoneNormalise, type Demande } from '../../../../shared/demandes';
import { etatDeLaDiscussion, numeroDit, type EtatDeLaDiscussion } from '../../../../shared/chat-du-site-pur';
import {
  changeLEtat, effaceLaDiscussion, presents, prendsLaPermanence, relieALaFiche, rendsLaPermanence, repondre,
  useDiscussions, useMessagesDe, type Discussion,
} from '../../../../shared/discussions';
import { useEstDirection } from '../_vie';
import './clients.css';

/* ══ LES DISCUSSIONS DU SITE — 19 octobre 2026 ══════════════════════════
   Maquette BPWmpyyw… validée (« construis »). La visiteuse écrit dans la
   bulle du site ; elle arrive ici, en direct, et l'équipe lui répond au nom
   de la Maison (jamais d'un prénom).

   LA PERMANENCE DIT « EN LIGNE » (sa décision). Quelqu'un la prend ici pour
   sa journée : le site dit « En ligne », et ses messages font sonner son
   téléphone. Personne de permanence : Claude répond seul sur le site, et la
   discussion reste « à répondre » ici, pour reprendre sur WhatsApp. Trois
   minutes sans réponse pendant une permanence : le chat le dit à la
   visiteuse, et toute l'équipe qui peut répondre l'apprend.

   Le numéro se masque, comme dans Les demandes : l'écran se lit par-dessus
   l'épaule. */

type Filtre = 'a-repondre' | 'ouvertes' | 'closes' | 'toutes';
const FILTRES: { k: Filtre; l: string }[] = [
  { k: 'a-repondre', l: 'À répondre' },
  { k: 'ouvertes', l: 'Ouvertes' },
  { k: 'closes', l: 'Closes' },
  { k: 'toutes', l: 'Toutes' },
];
const ETAT_DIT: Record<EtatDeLaDiscussion, { mot: string; classe: string }> = {
  'a-repondre': { mot: 'à répondre', classe: 'trc-pill--new' },
  repondue: { mot: 'répondue', classe: 'trc-pill--confirme' },
  close: { mot: 'close', classe: 'trc-pill--honore' },
};

/** Les mots de tous les jours, d'un toucher. */
const RAPIDES: { l: string; t: string }[] = [
  { l: 'Un instant', t: 'Bonjour, merci pour votre message. Je regarde et je reviens vers vous dans un instant.' },
  { l: 'Réserver en ligne', t: 'Vous pouvez choisir votre heure en ligne, en trois pas : https://maisonmnd.com/reserver/' },
  { l: 'L’adresse', t: 'La Maison vous reçoit à Suru-Léré, Cotonou (Ilot 130-F, Maison 88, portail marron). Voulez-vous le plan sur WhatsApp ?' },
];

const appelDeLaDiscussion = (d: Pick<Discussion, 'civilite' | 'prenom' | 'nom'>): string =>
  appelDe(d.civilite ? { name: d.prenom || d.nom || '', civilite: d.civilite as never } : null, d.prenom || d.nom || '');
const nomEntier = (d: Pick<Discussion, 'prenom' | 'nom'>): string => [d.prenom, d.nom].filter(Boolean).join(' ') || 'Visiteuse';
const heureDe = (iso: string): string => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
};

/** La discussion vue comme une demande du site, pour ouvrir sa fiche par
    le même geste que Les demandes (segment Prospect, provenance « site »). */
const commeUneDemande = (d: Discussion): Demande => ({
  id: d.id, genre: 'prospect', createdAt: d.cree_le, branchId: d.branch_id ?? '', prenom: d.prenom ?? '',
  ...(d.nom ? { nom: d.nom } : {}), telephone: d.telephone ?? '', besoin: 'inconnu', source: 'site',
  ...(d.civilite ? { civilite: d.civilite as Demande['civilite'] } : {}),
  ...(d.page ? { page: d.page } : {}), consentementLe: d.cree_le, statut: 'nouvelle',
});

export default function Discussions() {
  const { discussions, permanences, pret, erreur } = useDiscussions();
  const moi = useStaff();
  const estDirection = useEstDirection();
  const navigate = useNavigate();
  const emplacement = useLocation();
  const [filtre, setFiltre] = useState<Filtre>('a-repondre');
  const [choisie, setChoisie] = useState<string | null>(() => new URLSearchParams(emplacement.search).get('d'));
  const [brouillon, setBrouillon] = useState('');
  const [enVol, setEnVol] = useState(false);
  const [numeroVu, setNumeroVu] = useState(false);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const messages = useMessagesDe(choisie);
  const fil = useRef<HTMLDivElement | null>(null);

  /* L'adresse d'une notification (?d=…) ouvre sa discussion. */
  useEffect(() => {
    const d = new URLSearchParams(emplacement.search).get('d');
    if (d) { setChoisie(d); setFiltre('toutes'); }
  }, [emplacement.search]);
  /* Les âges (« il y a 3 min ») et la permanence avancent avec la montre. */
  useEffect(() => {
    const t = window.setInterval(() => setMaintenant(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => { setNumeroVu(false); setBrouillon(''); }, [choisie]);
  useEffect(() => {
    const f = fil.current;
    if (f) f.scrollTop = f.scrollHeight;
  }, [messages.length, choisie]);

  const deGarde = useMemo(() => presents(permanences), [permanences, maintenant]); // eslint-disable-line react-hooks/exhaustive-deps
  const maPermanence = deGarde.find((p) => p.user_id === moi?.user_id);
  const compte = useMemo(() => {
    const c: Record<Filtre, number> = { 'a-repondre': 0, ouvertes: 0, closes: 0, toutes: discussions.length };
    for (const d of discussions) {
      const e = etatDeLaDiscussion(d);
      if (e === 'a-repondre') c['a-repondre'] += 1;
      if (e === 'close') c.closes += 1; else c.ouvertes += 1;
    }
    return c;
  }, [discussions]);
  const visibles = useMemo(() => discussions.filter((d) => {
    const e = etatDeLaDiscussion(d);
    return filtre === 'toutes' || (filtre === 'a-repondre' ? e === 'a-repondre' : filtre === 'closes' ? e === 'close' : e !== 'close');
  }), [discussions, filtre]);
  const d = discussions.find((x) => x.id === choisie) ?? null;
  const ficheConnue = useMemo(() => {
    if (!d) return undefined;
    if (d.client_id) return clientsStore.get().find((c) => c.id === d.client_id);
    const numero = telephoneNormalise(d.telephone ?? '');
    return numero ? clientsStore.get().find((c) => !c.archived && telephoneNormalise(c.phone) === numero) : undefined;
  }, [d]);

  /* ── Les gestes ── */
  const basculeLaPermanence = async () => {
    if (!moi) return;
    const motif = maPermanence
      ? await rendsLaPermanence(moi.user_id)
      : await prendsLaPermanence(moi.user_id, (moi.name ?? '').trim().split(/\s+/)[0] || 'L’équipe');
    if (motif) { toast(motif); return; }
    toast(maPermanence ? 'Permanence rendue : le site dit que l’équipe répond sur WhatsApp.' : 'Vous êtes de permanence : le site dit « En ligne ».');
  };

  const envoyer = async () => {
    if (!d || !moi || enVol || !brouillon.trim()) return;
    setEnVol(true);
    const motif = await repondre(d.id, brouillon, moi.user_id);
    setEnVol(false);
    if (motif) { toast(motif); return; }
    setBrouillon('');
  };

  const ouvreLaFiche = () => {
    if (!d) return;
    if (ficheConnue) {
      if (!d.client_id) void relieALaFiche(d.id, ficheConnue.id);
      navigate(`/customers?id=${ficheConnue.id}`);
      return;
    }
    const fiche = ficheDepuisLaDemande(commeUneDemande(d), ensureInitiePersona());
    clientsStore.set((prev) => (prev.some((c) => c.id === fiche.id) ? prev : [...prev, fiche]));
    void relieALaFiche(d.id, fiche.id);
    toast(`${fiche.name} entre au carnet, au segment Prospect.`);
    navigate(`/customers?id=${fiche.id}`);
  };

  const lienWhatsApp = (x: Discussion): string =>
    `https://wa.me/${(x.telephone ?? '').replace(/\D/g, '')}?text=${encodeURIComponent(signeLeMessage(`Bonjour ${appelDeLaDiscussion(x)}, ici la Maison MND. Suite à votre message sur notre site : `))}`;

  const efface = async () => {
    if (!d) return;
    if (!await demande({
      quoi: 'Les discussions',
      titre: `Effacer la discussion de ${nomEntier(d)} ?`,
      dit: 'Elle disparaît pour de bon, avec ses messages. Sa fiche, si elle en a une, reste.',
      accepter: 'Effacer',
      refuser: 'La garder',
    })) return;
    const motif = await effaceLaDiscussion(d.id);
    if (motif) { toast(motif); return; }
    setChoisie(null);
    toast('La discussion est effacée.');
  };

  return (
    <>
      <PageHead
        eyebrow="Conversations"
        title="Le chat du site"
        sub="On répond ici, en direct, au nom de la Maison. Sans personne de permanence, une réponse automatique répond sur le site et la discussion attend ici, pour reprendre sur WhatsApp."
        actions={moi ? (
          <Button variant={maPermanence ? 'ghost' : 'copper'} onClick={() => void basculeLaPermanence()}>
            {maPermanence ? 'Rendre la permanence' : 'Prendre la permanence'}
          </Button>
        ) : undefined}
      />

      <div className={`trc-chat-garde${deGarde.length ? ' trc-chat-garde--la' : ''}`} role="status">
        <i aria-hidden="true" />
        {deGarde.length
          ? <span>De permanence : {deGarde.map((p) => (p.user_id === moi?.user_id ? 'vous' : p.nom || 'un membre de l’équipe')).join(', ')}{maPermanence ? `, jusqu’à ${new Date(maPermanence.jusqua).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : ''}. Le site dit « En ligne ».</span>
          : <span>Personne de permanence : le site dit qu’une réponse automatique aide, puis que l’équipe répond sur WhatsApp.</span>}
      </div>

      {erreur && <p className="trc-chat-erreur" role="alert">{erreur}</p>}

      <div className="trc-chat-filtres" role="tablist" aria-label="Quelles discussions">
        {FILTRES.map((f) => (
          <button key={f.k} type="button" role="tab" aria-selected={filtre === f.k} className={filtre === f.k ? 'est-choisi' : undefined} onClick={() => setFiltre(f.k)}>
            {f.l}{compte[f.k] ? <span className="trc-chat-nb">{compte[f.k]}</span> : null}
          </button>
        ))}
      </div>

      <div className={`trc-chat${d ? ' trc-chat--fil' : ''}`}>
        <div className="trc-chat-liste">
          {!pret && <p className="trc-chat-vide">Lecture des discussions…</p>}
          {pret && !visibles.length && !erreur && (
            <p className="trc-chat-vide">{filtre === 'a-repondre' ? 'Rien n’attend de réponse.' : 'Aucune discussion ici.'}</p>
          )}
          {visibles.map((x) => {
            const e = etatDeLaDiscussion(x);
            return (
              <button key={x.id} type="button" className={`trc-chat-ligne${x.id === choisie ? ' est-choisie' : ''}${e === 'a-repondre' ? ' est-a-repondre' : ''}`} onClick={() => setChoisie(x.id)}>
                <b>{nomEntier(x)}<span>{depuisQuand(x.derniere_le, maintenant)}</span></b>
                <small><span className={`trc-pill ${ETAT_DIT[e].classe}`}>{ETAT_DIT[e].mot}</span> {telephoneMasque(x.telephone ?? '')}</small>
              </button>
            );
          })}
        </div>

        <div className="trc-chat-droite">
          {!d && <p className="trc-chat-vide">Choisissez une discussion pour la lire et y répondre.</p>}
          {d && (
            <>
              <div className="trc-chat-tete">
                <button type="button" className="trc-chat-retour" onClick={() => setChoisie(null)} aria-label="Revenir à la liste">‹</button>
                <div className="trc-chat-qui">
                  <b>{appelDeLaDiscussion(d)}</b>
                  <small>
                    {nomEntier(d)} · {numeroVu ? numeroDit(d.telephone ?? '') : telephoneMasque(d.telephone ?? '')}
                    {!numeroVu && <button type="button" className="trc-c360-linkbtn" onClick={() => setNumeroVu(true)}>voir</button>}
                    {ficheConnue ? ' · cliente connue' : ''}{d.page ? ` · depuis ${d.page}` : ''} · ouverte le {heureDe(d.cree_le)}
                  </small>
                </div>
                <div className="trc-chat-gestes">
                  <Button size="sm" variant="ghost" onClick={ouvreLaFiche}>{ficheConnue ? 'Ouvrir sa fiche' : 'Créer sa fiche'}</Button>
                  {d.telephone && <a className="mnd-btn mnd-btn--ghost mnd-btn--sm" href={lienWhatsApp(d)} target="_blank" rel="noopener">Passer sur WhatsApp</a>}
                  <Button size="sm" variant="ghost" onClick={() => void changeLEtat(d.id, d.etat === 'close' ? 'ouverte' : 'close').then((m) => { if (m) toast(m); })}>
                    {d.etat === 'close' ? 'Rouvrir' : 'Clore'}
                  </Button>
                  {estDirection && <Button size="sm" variant="ghost" onClick={() => void efface()}>Effacer</Button>}
                </div>
              </div>

              <div className="trc-chat-fil" ref={fil} aria-live="polite">
                {messages.map((m) => (
                  m.de === 'systeme'
                    ? <p key={m.id} className="trc-chat-msg trc-chat-msg--systeme">{m.texte}<small>Le chat, {heureDe(m.cree_le)}</small></p>
                    : (
                      <div key={m.id} className={`trc-chat-msg trc-chat-msg--${m.de}`}>
                        {m.texte}
                        <small>
                          {m.de === 'visiteuse' ? appelDeLaDiscussion(d) : m.de === 'auto' ? 'Réponse automatique (Claude)' : m.par === moi?.user_id ? 'Vous, au nom de la Maison' : 'La Maison'}
                          {' · '}{heureDe(m.cree_le)}
                        </small>
                      </div>
                    )
                ))}
              </div>

              <div className="trc-chat-rapides" role="group" aria-label="Réponses rapides">
                {RAPIDES.map((r) => <button key={r.l} type="button" onClick={() => setBrouillon(r.t)}>{r.l}</button>)}
              </div>
              <form className="trc-chat-repondre" onSubmit={(e) => { e.preventDefault(); void envoyer(); }}>
                <textarea
                  value={brouillon}
                  rows={2}
                  placeholder={`Répondre à ${appelDeLaDiscussion(d)}, au nom de la Maison`}
                  onChange={(e) => setBrouillon(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void envoyer(); } }}
                />
                <Button type="submit" variant="copper" disabled={enVol || !brouillon.trim()}>{enVol ? 'Envoi…' : 'Envoyer'}</Button>
              </form>
            </>
          )}
        </div>
      </div>
    </>
  );
}
