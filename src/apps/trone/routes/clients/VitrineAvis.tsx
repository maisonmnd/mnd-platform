import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Segs, toast } from '../../../../ds/components';
import { useStaff } from '../../../../shared/auth';
import { useStore } from '../../../../shared/store';
import { jourCourtAn } from '../../../../shared/calendrier';
import { clientsStore } from '../../../../shared/clients';
import { useAppointments } from '../../../../shared/agenda';
import { peutDemander } from '../../../../shared/ia-maison-pur';
import { idDeLAvis, estSansReponse, jourLocalDe, langueDite } from '../../../../shared/ia-avis-pur';
import { useBrouillonsDAvis, usePrepareLesBrouillons } from '../../../../shared/ia-avis';
import {
  DEPART_DES_LIENS, chercheDesFiches, compteParFiltre, etatDuLien, fichesProposees, jourDeLAvis, passeLeFiltre, pourquoiProposee,
  type AvisDuReleve, type FiltreDesAvis, type LienDAvis,
} from '../../../../shared/avis-fiches-pur';
import { delieLAvis, marqueSansFiche, relieLAvis, useLiensDesAvis, type IssueDuLien } from '../../../../shared/avis-fiches';
import { staffAccessStore, useEnvois } from '../equipe/data';
import { BandeDeVitrine, Pastille } from './VitrineSite';
import { ReponseAUnAvis, usePeutRepondreAuxAvis } from './ReponseAUnAvis';
import { useReleveDesAvis } from './releve-des-avis';
import './avis-google.css';

/* ══ LES AVIS GOOGLE, UN ONGLET À PART — 20 octobre 2026 ═══════════════
   « Je veux voir un onglet à part pour les avis Google, et leurs réponses »
   et « à partir d'aujourd'hui lier un avis à une fiche » (Yéman). Maquette
   DNVVXdkd… validée (« Tout me va ») : quatrième onglet de Vitrines (la
   barre reste à 39), la fiche PROPOSÉE puis confirmée d'un toucher.

   UNE LIGNE PAR AVIS, UN SEUL OUVERT (règle des écrans en liste) : la ligne
   porte les étoiles, l'autrice, l'état de la réponse et celui de la fiche,
   calculés par les mêmes juges que les filtres (`avis-fiches-pur`). La ligne
   de l'avis ouvert colle en haut tant qu'on fait défiler son panneau.

   RIEN NE PART SUR GOOGLE D'ICI. Tant que Google n'a pas ouvert l'accès à
   son API (demande refusée deux fois le 20 octobre), la réponse se copie et
   se colle (`ReponseAUnAvis`, inchangée). Le départ seul des réponses de 4
   et 5 étoiles (6 h pour l'arrêter, jamais de 20 h à 8 h) se construira le
   jour où Google dira oui. */

const ETOILES = (n: number) => '★'.repeat(Math.max(0, Math.min(5, Math.round(n)))) + '☆'.repeat(5 - Math.max(0, Math.min(5, Math.round(n))));

/** Le prénom de qui fait le geste, pour « relié par Y. ». */
function useQui(): string {
  const staff = useStaff();
  return String(staff?.name ?? '').trim().split(/\s+/)[0] ?? '';
}

const ditLeGeste = (r: IssueDuLien) => {
  if (r === 'attente') toast('Les fiches des avis ne sont pas encore arrivées du serveur : réessayez dans un instant.');
};

/** Le résumé d'un avis sur sa ligne : la réponse, puis la fiche. */
function EtatsDeLaLigne({ a, releveLe, nomDe }: { a: AvisDuReleve; releveLe?: string; nomDe: (id: string) => string }) {
  const [brouillons] = useBrouillonsDAvis();
  const [liens] = useLiensDesAvis();
  const id = idDeLAvis(a);
  const b = brouillons[id];
  const lien = liens[id];
  const etat = etatDuLien(a, lien, releveLe);
  return (
    <span className="trc-avisg__etats">
      {estSansReponse(a, b)
        ? <Pastille ton="attente">{b?.ecarte ? 'Sans réponse, par choix' : 'Sans réponse'}</Pastille>
        : <Pastille ton="ok">Répondu</Pastille>}
      {etat === 'reliee' && <Pastille>{`Fiche : ${nomDe(lien?.clientId ?? '')}`}</Pastille>}
      {etat === 'sans-fiche' && <Pastille>Sans fiche</Pastille>}
      {etat === 'a-relier' && <Pastille ton="attente">À relier</Pastille>}
    </span>
  );
}

/** LA FICHE DE L'AVIS : reliée, sans fiche, proposée, ou à chercher. */
function FicheDeLAvis({ a, releveLe, peutRelier }: { a: AvisDuReleve; releveLe?: string; peutRelier: boolean }) {
  const navigate = useNavigate();
  const qui = useQui();
  const [liens] = useLiensDesAvis();
  const [clients] = useStore(clientsStore);
  const [envois] = useEnvois();
  const [rdvs] = useAppointments();
  const [cherche, setCherche] = useState(false);
  const [q, setQ] = useState('');
  const [choisi, setChoisi] = useState(0);
  const id = idDeLAvis(a);
  const lien: LienDAvis | undefined = liens[id];
  const etat = etatDuLien(a, lien, releveLe);
  const nomDe = (cid: string) => clients.find((c) => c.id === cid)?.name || 'une fiche effacée';
  const parQui = (l: LienDAvis) => `${l.par ? `par ${l.par} ` : ''}le ${jourCourtAn(jourLocalDe(l.le))}`;

  const props = useMemo(
    () => (etat === 'a-relier' ? fichesProposees(a, releveLe, { clients, envois, rdvs }) : []),
    [a, releveLe, clients, envois, rdvs, etat],
  );
  const trouvees = useMemo(() => (cherche ? chercheDesFiches(q, clients) : []), [cherche, q, clients]);

  if (etat === 'reliee' && lien?.clientId) {
    return (
      <div className="trc-avisg__cadre trc-avisg__cadre--fiche">
        <span className="trc-avisg__titre">La fiche</span>
        <span>Reliée à <b>{nomDe(lien.clientId)}</b> <span className="mnd-muted">· {parQui(lien)}</span></span>
        <span className="trc-avisg__gestes">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/customers?id=${lien.clientId}`)}>Ouvrir sa fiche</Button>
          {peutRelier && <button type="button" className="trc-c360-linkbtn" onClick={() => ditLeGeste(delieLAvis(id))}>Ce n’est pas elle</button>}
        </span>
      </div>
    );
  }
  if (!peutRelier) {
    return etat === 'sans-fiche' ? <span className="mnd-muted" style={{ fontSize: 12 }}>Sans fiche, par choix de la Maison.</span> : null;
  }

  if (cherche) {
    return (
      <div className="trc-avisg__cadre trc-avisg__cadre--fiche">
        <span className="trc-avisg__titre">Une autre fiche</span>
        <input className="mnd-input" type="search" value={q} autoFocus placeholder="Prénom, nom ou numéro" aria-label="Chercher une cliente"
          onChange={(e) => setQ(e.target.value)} />
        <span className="trc-avisg__gestes">
          {trouvees.map((c) => (
            <Button key={c.id} variant="ghost" size="sm" onClick={() => { ditLeGeste(relieLAvis(id, c.id, qui)); setCherche(false); setQ(''); }}>{c.name}</Button>
          ))}
          {q.trim() && trouvees.length === 0 && <span className="mnd-muted" style={{ fontSize: 12 }}>Aucune cliente.</span>}
        </span>
        <span><button type="button" className="trc-c360-linkbtn" onClick={() => { setCherche(false); setQ(''); }}>Retour</button></span>
      </div>
    );
  }

  if (etat === 'sans-fiche' && lien) {
    return (
      <div className="trc-avisg__cadre trc-avisg__cadre--fiche">
        <span className="trc-avisg__titre">La fiche</span>
        <span className="mnd-muted">Aucune fiche, {parQui(lien)}.</span>
        <span><button type="button" className="trc-c360-linkbtn" onClick={() => setCherche(true)}>Relier quand même</button></span>
      </div>
    );
  }

  if (etat === 'ancien') {
    return (
      <div className="trc-avisg__cadre trc-avisg__cadre--fiche">
        <span className="trc-avisg__titre">La fiche</span>
        <span className="mnd-muted">Avis publié avant le {jourCourtAn(DEPART_DES_LIENS)} : pas de proposition.</span>
        <span><Button variant="ghost" size="sm" onClick={() => setCherche(true)}>Relier à une fiche</Button></span>
      </div>
    );
  }

  /* À relier : les fiches proposées, la première cochée. */
  const p = props[Math.min(choisi, Math.max(0, props.length - 1))];
  return (
    <div className="trc-avisg__cadre trc-avisg__cadre--fiche">
      <span className="trc-avisg__titre">{props.length > 0 ? 'La fiche proposée' : 'La fiche'}</span>
      {props.length === 0 && (
        <span className="mnd-muted" style={{ fontSize: 12.5 }}>
          Aucune cliente au même prénom n’a reçu la demande d’avis ni n’est venue dans les 30 jours d’avant.
        </span>
      )}
      {props.length > 1 && <span className="mnd-muted" style={{ fontSize: 12 }}>{props.length} clientes correspondent : choisissez.</span>}
      {props.length > 0 && (
        <span className="trc-avisg__props" role="radiogroup" aria-label="Fiches proposées">
          {props.map((x, i) => (
            <label key={x.clientId} className="trc-avisg__prop">
              <input type="radio" name={`fiche-${id}`} checked={i === choisi} onChange={() => setChoisi(i)} />
              <span><b>{x.nom}</b><span className="mnd-muted" style={{ display: 'block', fontSize: 11.5 }}>{pourquoiProposee(x, jourCourtAn)}</span></span>
            </label>
          ))}
        </span>
      )}
      <span className="trc-avisg__gestes">
        {p && <Button variant="indigo" size="sm" onClick={() => ditLeGeste(relieLAvis(id, p.clientId, qui))}>{props.length > 1 ? 'Relier à celle-ci' : 'C’est elle'}</Button>}
        <Button variant="ghost" size="sm" onClick={() => setCherche(true)}>{props.length > 0 ? 'Une autre fiche' : 'Chercher une fiche'}</Button>
        <button type="button" className="trc-c360-linkbtn" onClick={() => ditLeGeste(marqueSansFiche(id, qui))}>Aucune fiche</button>
      </span>
    </div>
  );
}

export function VitrineAvis({ ouvrir }: { ouvrir?: string }) {
  const releve = useReleveDesAvis();
  const [brouillons] = useBrouillonsDAvis();
  const [liens] = useLiensDesAvis();
  const [clients] = useStore(clientsStore);
  const staff = useStaff();
  const acces = useStore(staffAccessStore)[0];
  const peutRepondre = usePeutRepondreAuxAvis();
  const peutRelier = peutDemander(staff?.role, 'avis', acces[staff?.user_id ?? '']);
  const [filtre, setFiltre] = useState<FiltreDesAvis>('tous');
  const [ouvert, setOuvert] = useState<string | null>(ouvrir ?? null);
  useEffect(() => { if (ouvrir) setOuvert(ouvrir); }, [ouvrir]);

  const avis = releve?.avis ?? null;
  const releveLe = releve?.le;
  /* Les brouillons de Claude se préparent à l'ouverture de CET onglet
     (cinq au plus, un à la fois), comme ils le faisaient sous le site. */
  usePrepareLesBrouillons(avis, peutRepondre);

  const nomDe = (cid: string) => clients.find((c) => c.id === cid)?.name || 'une fiche effacée';
  const comptes = useMemo(() => compteParFiltre(avis ?? [], brouillons, liens, releveLe), [avis, brouillons, liens, releveLe]);
  const vus = (avis ?? []).filter((a) => passeLeFiltre(a, filtre, brouillons[idDeLAvis(a)], liens[idDeLAvis(a)], releveLe));

  return (
    <>
      <BandeDeVitrine couleur="var(--color-indigo)" titre="Les avis Google"
        dit="Ce que les clientes disent de la Maison sur Google, la réponse de la Maison, et la fiche de chacune. Rien ici ne part sur Google tout seul.">
        {releve && <Pastille>{`${releve.note.toLocaleString('fr-FR')} ★ · ${releve.nombre} avis`}</Pastille>}
        {releve && <Pastille ton={comptes.sans > 0 ? 'attente' : 'ok'}>{comptes.sans > 0 ? `${comptes.sans} sans réponse` : 'Chaque avis a sa réponse'}</Pastille>}
        {releve && comptes.relier > 0 && <Pastille ton="attente">{`${comptes.relier} à relier`}</Pastille>}
        <Pastille>Envoi à Google : en attente de l’accès Google</Pastille>
        {releve?.fiche && <a className="mnd-btn mnd-btn--ghost" href={releve.fiche} target="_blank" rel="noreferrer">La fiche Google</a>}
      </BandeDeVitrine>

      {!releve && <p className="mnd-muted" style={{ fontSize: 13 }}>Les avis ne sont pas encore relevés.</p>}

      {releve && (
        <div className="trc-avisg">
          <Segs<FiltreDesAvis>
            options={[
              { value: 'tous', label: `Tous · ${comptes.tous}` },
              { value: 'sans', label: `Sans réponse · ${comptes.sans}` },
              { value: 'relier', label: `À relier · ${comptes.relier}` },
              { value: 'repondus', label: `Répondus · ${comptes.repondus}` },
            ]}
            value={filtre}
            onChange={setFiltre}
          />

          <div className="trc-avisg__liste">
            {vus.length === 0 && <p className="mnd-muted" style={{ fontSize: 12.5 }}>Rien dans ce filtre.</p>}
            {vus.map((a) => {
              const id = idDeLAvis(a);
              const estOuvert = ouvert === id;
              const jour = jourDeLAvis(a, releveLe);
              const original = typeof a.texteOriginal === 'string' && a.texteOriginal.trim() && a.texteOriginal.trim() !== a.texte.trim() ? a.texteOriginal.trim() : '';
              return (
                <div key={id} className={`trc-avisg__avis${estOuvert ? ' is-open' : ''}`}>
                  <button type="button" className="trc-avisg__ligne" aria-expanded={estOuvert} onClick={() => setOuvert(estOuvert ? null : id)}>
                    <span className="trc-avisg__etoiles" aria-label={`${a.note} étoiles sur 5`}>{ETOILES(a.note)}</span>
                    <span className="trc-avisg__qui">
                      <b>{a.auteur || 'Sans nom'}</b>
                      <span className="mnd-muted">{` · ${jour ? jourCourtAn(jour) : a.quand}`}{a.texte ? ` · ${a.texte}` : ''}</span>
                    </span>
                    <EtatsDeLaLigne a={a} releveLe={releveLe} nomDe={nomDe} />
                  </button>
                  {estOuvert && (
                    <div className="trc-avisg__dedans">
                      {original || a.texte
                        ? <p className="trc-avisg__texte">« {original || a.texte} »
                          {original && <span className="mnd-muted">{`Écrit en ${langueDite(a.langueOriginale?.split('-')[0])}. Google le traduit : « ${a.texte} »`}</span>}
                        </p>
                        : <p className="mnd-muted" style={{ fontSize: 12.5 }}>Une note seulement, sans texte.</p>}
                      <FicheDeLAvis a={a} releveLe={releveLe} peutRelier={peutRelier} />
                      <ReponseAUnAvis avis={a} fiche={releve.fiche} sansRetrait />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <p className="mnd-muted" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
            {releveLe ? `Relevé le ${jourCourtAn(releveLe.slice(0, 10))}, deux fois par jour. ` : ''}
            Tant que Google n’a pas ouvert son accès à la Maison, le relevé ne voit que les cinq avis qu’il juge « les plus pertinents » : un nouvel avis peut ne pas paraître ici.
            Le choix des avis montrés sur le site reste dans « Le site public ».
          </p>
        </div>
      )}
    </>
  );
}
