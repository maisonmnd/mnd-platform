import { useMemo, useState } from 'react';
import { Button, Input, Modal, Select, toast } from '../../../../ds/components';
import { useServices, type Service } from '../../../../shared/catalog';
import { useClients } from '../../../../shared/clients';
import { useBranch } from '../../../../shared/branches';
import { uid } from '../../../../shared/store';
import {
  protocolesStore, useProtocoles, aSonEcart, litLesProtocoles,
  type EtapeProtocole, type LesProtocoles, type Protocole,
} from '../../../../shared/protocoles';

/* ══ LES PROTOCOLES DE LA MAISON — 6 septembre 2026 (maquette validée) ══

   « Où est-ce que je manage le programme de pousse et je change les
   prestations qui sont inclus ? » puis « allow me to add new protocoles and
   attribute it to clients » (Yéman).

   NULLE PART, JUSQU'ICI. Les jours, les prestations et jusqu'aux phrases que
   la cliente lit vivaient en dur : c'étaient MES intervalles et MES mots. Et
   depuis que Ma Couronne affiche le suivi, ils étaient publiés chez ses
   clientes sous son nom.

   AU CATALOGUE, parce qu'un protocole est une suite de prestations : quand on
   change l'étape d'une étape, c'est le catalogue qu'on a besoin d'avoir sous
   les yeux. */

/** Le code NU d'une prestation — sans son suffixe de longueur. C'est lui que
    l'étape retient : la seule chose qui ne bouge jamais quand on renomme. */
const codeNu = (c?: string): string => (c ?? '').replace(/·[CML]$/, '');

/** Le nom NU, débarrassé de « · Court » et de ses sœurs : l'étape vaut pour
    les trois longueurs, la nommer par l'une d'elles serait mentir. */
const nomNu = (n: string): string =>
  n.replace(/\s*·\s*(Court|Mi-Long|Long ou haute densité)\s*$/, '');

const OUVERTURE: Record<string, string> = {
  couleur: 's’ouvre sur une couleur végétale honorée',
  pousse: 's’ouvre sur un VÍVÍVÓ™, ou sur la date que la Maison pose',
};

export function ProtocolesModal({ onClose }: { onClose: () => void }) {
  const { branch } = useBranch();
  const [services] = useServices();
  const [clients] = useClients();
  const [enMagasin] = useProtocoles();
  /* ON TRAVAILLE SUR UN BROUILLON. Écrire à chaque frappe ferait voyager le
     protocole chez toutes les clientes pendant qu'on hésite encore. */
  const [brouillon, setBrouillon] = useState<LesProtocoles>(
    () => enMagasin.map((p) => ({ ...p, etapes: p.etapes.map((e) => ({ ...e })), declencheurs: [...p.declencheurs] })),
  );

  /* UNE LIGNE PAR CODE NU : le catalogue tient trois fiches par soin, une par
     longueur, et les proposer toutes ferait un menu de deux cents entrées où
     l'on choisirait la mauvaise longueur sans le voir. */
  const choix = useMemo(() => {
    const par = new Map<string, Service>();
    for (const sv of services) {
      const nu = codeNu(sv.code);
      if (!nu || par.has(nu)) continue;
      par.set(nu, sv);
    }
    return [...par.entries()]
      .map(([nu, sv]) => ({ code: nu, nom: nomNu(sv.name) }))
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  }, [services]);

  const majProto = (id: string, patch: Partial<Protocole>) =>
    setBrouillon((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const poseEtape = (id: string, i: number, patch: Partial<EtapeProtocole>) =>
    setBrouillon((p) => p.map((x) => (x.id === id
      ? { ...x, etapes: x.etapes.map((e, k) => (k === i ? { ...e, ...patch } : e)) } : x)));

  const retireEtape = (id: string, i: number) =>
    setBrouillon((p) => p.map((x) => (x.id === id ? { ...x, etapes: x.etapes.filter((_, k) => k !== i) } : x)));

  const ajouteEtape = (id: string) => setBrouillon((p) => p.map((x) => {
    if (x.id !== id) return x;
    const dernier = x.etapes[x.etapes.length - 1];
    return {
      ...x,
      etapes: [...x.etapes, {
        jours: (dernier?.jours ?? 0) + 14,
        code: choix[0]?.code ?? '',
        nom: choix[0]?.nom ?? '',
        pourquoi: '',
      }],
    };
  }));

  /* UN PROTOCOLE NEUF NAÎT SANS DÉCLENCHEUR : il ne s'ouvrira que sur les têtes
     où la Maison le posera. Lui en donner un d'office l'ouvrirait sur toutes
     celles qui ont pris ce soin, y compris hier. */
  const ajouteProtocole = () => {
    const neuf: Protocole = { id: `pr-${uid()}`, nom: 'Nouveau protocole', declencheurs: [], etapes: [] };
    setBrouillon((p) => [...p, neuf]);
  };

  const enregistre = (id: string) => {
    const p = brouillon.find((x) => x.id === id);
    if (!p) return;
    if (!p.nom.trim()) { toast('Un protocole sans nom ne se retrouve pas.'); return; }
    /* LES ÉTAPES SE RANGENT DANS L'ORDRE DU TEMPS. Une étape à J+14 posée après
       une à J+30 ferait un protocole qui remonte le temps, et le suivi
       cocherait les mauvaises. */
    const range = [...p.etapes].filter((e) => e.code && e.jours > 0).sort((a, b) => a.jours - b.jours);
    if (range.length === 0) { toast('Un protocole sans étape ne dit rien.'); return; }
    const fige: Protocole = { ...p, nom: p.nom.trim(), etapes: range };
    protocolesStore.set((prev) => {
      const liste = litLesProtocoles(prev);
      return liste.some((x) => x.id === id)
        ? liste.map((x) => (x.id === id ? fige : x))
        : [...liste, fige];
    });
    setBrouillon((prev) => prev.map((x) => (x.id === id ? fige : x)));
    toast(`${fige.nom} · ${range.length} étape${range.length > 1 ? 's' : ''} enregistrée${range.length > 1 ? 's' : ''}.`);
  };

  /* ON NE SUPPRIME PAS UNE SUITE D'ORIGINE : trop d'écrans s'y appuient, et
     une tête en cours de protocole perdrait ses échéances sans un mot. */
  const supprime = (id: string) => {
    protocolesStore.set((prev) => litLesProtocoles(prev).filter((x) => x.id !== id));
    setBrouillon((prev) => prev.filter((x) => x.id !== id));
    toast('Protocole retiré. Les têtes qui le portaient ne verront plus ses étapes.');
  };

  /* LES TÊTES QUI SUIVENT LEUR PROPRE CADENCE, et celles qui portent un
     protocole posé à la main. Un écart survit à la doctrine : si la Maison
     décale une étape, celles-ci gardent la leur. */
  const ecarts = useMemo(() => clients
    .filter((c) => c.branchId === branch.id && !c.archived)
    .flatMap((c) => ([
      ...(aSonEcart(enMagasin.find((x) => x.natif === 'couleur')?.etapes ?? [], c.ecartProtocole?.couleur)
        ? [{ c, quoi: 'après une couleur', detail: `J+${c.ecartProtocole!.couleur!.join(' / ')}` }] : []),
      ...(aSonEcart(enMagasin.find((x) => x.natif === 'pousse')?.etapes ?? [], c.ecartProtocole?.pousse)
        ? [{ c, quoi: 'programme de pousse', detail: `J+${c.ecartProtocole!.pousse!.join(' / ')}` }] : []),
      ...Object.entries(c.protocolesPoses ?? {}).map(([pid, depuis]) => ({
        c,
        quoi: enMagasin.find((x) => x.id === pid)?.nom ?? 'protocole retiré',
        detail: `posé le ${depuis}`,
      })),
    ])), [clients, branch.id, enMagasin]);

  const table = (p: Protocole) => (
    <div key={p.id} style={{ marginBottom: 26 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        {p.natif ? (
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 21, color: 'var(--color-indigo)' }}>{p.nom}</span>
        ) : (
          <Input
            value={p.nom}
            onChange={(e) => majProto(p.id, { nom: e.target.value })}
            aria-label="Nom du protocole"
            style={{ width: 260, fontFamily: 'var(--font-serif)', fontSize: 19 }}
          />
        )}
        <span className="mnd-muted" style={{ fontSize: 11 }}>
          {p.etapes.length} étape{p.etapes.length > 1 ? 's' : ''}
          {p.natif ? ` · ${OUVERTURE[p.natif]}` : (p.declencheurs.length > 0
            ? ` · s’ouvre sur ${p.declencheurs.length} prestation${p.declencheurs.length > 1 ? 's' : ''} honorée${p.declencheurs.length > 1 ? 's' : ''}`
            : ' · ne s’ouvre que sur les têtes où vous le posez')}
        </span>
        {!p.natif && (
          <Button variant="ghost" size="sm" style={{ flex: 'none', marginLeft: 'auto' }} onClick={() => supprime(p.id)}>
            Retirer
          </Button>
        )}
        <Button variant="copper" size="sm" style={{ flex: 'none', marginLeft: p.natif ? 'auto' : undefined }} onClick={() => enregistre(p.id)}>
          Enregistrer
        </Button>
      </div>

      {/* CE QUI L'OUVRE, pour un protocole écrit par la Maison. Sans
          déclencheur il attend qu'on le pose sur une tête, et c'est souvent ce
          qu'on veut : un programme se décide, il ne se déclenche pas. */}
      {!p.natif && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
          <span className="mnd-muted" style={{ fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase' }}>
            S’ouvre aussi sur
          </span>
          {p.declencheurs.map((code) => (
            <button
              key={code}
              type="button"
              className="tre-chip is-on"
              onClick={() => majProto(p.id, { declencheurs: p.declencheurs.filter((x) => x !== code) })}
            >
              {choix.find((x) => x.code === code)?.nom ?? code} ✕
            </button>
          ))}
          <Select
            value=""
            onChange={(e) => { if (e.target.value) majProto(p.id, { declencheurs: [...p.declencheurs, e.target.value] }); }}
          >
            <option value="">+ Une prestation qui l’ouvre…</option>
            {choix.filter((x) => !p.declencheurs.includes(x.code)).map((x) => (
              <option key={x.code} value={x.code}>{x.nom}</option>
            ))}
          </Select>
        </div>
      )}

      <div style={{ border: '1px solid var(--hairline)', borderRadius: 3, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 720 }}>
          <tbody>
            <tr>
              {['Quand', 'La prestation', 'Ce que la cliente lit', 'Vendu ?', ''].map((t, i) => (
                <th
                  key={t || i}
                  style={{
                    textAlign: 'left', padding: '8px 10px', fontSize: 9, letterSpacing: '.16em',
                    textTransform: 'uppercase', color: 'var(--ink-soft)', fontWeight: 500,
                    borderBottom: '1px solid var(--hairline)',
                    width: i === 0 ? 104 : i === 3 ? 108 : i === 4 ? 40 : undefined,
                  }}
                >
                  {t}
                </th>
              ))}
            </tr>
            {p.etapes.map((e, i) => (
              <tr key={`${p.id}-${i}`}>
                <td style={{ padding: '9px 10px', borderTop: '1px solid var(--hairline)', whiteSpace: 'nowrap' }}>
                  <Input
                    inputMode="numeric"
                    value={String(e.jours)}
                    onChange={(ev) => poseEtape(p.id, i, { jours: Math.max(0, parseInt(ev.target.value.replace(/[^0-9]/g, ''), 10) || 0) })}
                    aria-label="Jours après le déclencheur"
                    style={{ width: 58, textAlign: 'right', fontFamily: 'var(--font-serif)', fontSize: 19, padding: '3px 7px' }}
                  />
                  <span className="mnd-muted" style={{ fontSize: 11, marginLeft: 5 }}>j</span>
                </td>
                <td style={{ padding: '9px 10px', borderTop: '1px solid var(--hairline)' }}>
                  <Select
                    value={e.code}
                    onChange={(ev) => {
                      const t = choix.find((x) => x.code === ev.target.value);
                      poseEtape(p.id, i, { code: ev.target.value, nom: t?.nom ?? e.nom });
                    }}
                  >
                    {!choix.some((x) => x.code === e.code) && <option value={e.code}>{e.nom} · absente du catalogue</option>}
                    {choix.map((x) => <option key={x.code} value={x.code}>{x.nom}</option>)}
                  </Select>
                </td>
                <td style={{ padding: '9px 10px', borderTop: '1px solid var(--hairline)' }}>
                  <Input
                    value={e.pourquoi}
                    onChange={(ev) => poseEtape(p.id, i, { pourquoi: ev.target.value })}
                    placeholder="Ce que la cliente lira sous l’étape…"
                    aria-label="Ce que la cliente lit"
                  />
                </td>
                <td style={{ padding: '9px 10px', borderTop: '1px solid var(--hairline)' }}>
                  {/* HORS FORFAIT : « Le Protocole Post-Couleur » se vend comme
                      les SOINS qui suivent une couleur. Y glisser un acte de
                      couleur changerait ce que le produit veut dire. */}
                  <button
                    type="button"
                    className={`tre-chip ${e.horsForfait ? '' : 'is-on'}`}
                    onClick={() => poseEtape(p.id, i, { horsForfait: e.horsForfait ? undefined : true })}
                  >
                    {e.horsForfait ? 'hors forfait' : 'au forfait'}
                  </button>
                </td>
                <td style={{ padding: '9px 10px', borderTop: '1px solid var(--hairline)', textAlign: 'right' }}>
                  <button
                    type="button"
                    aria-label="Retirer cette étape"
                    onClick={() => retireEtape(p.id, i)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', fontSize: 15, padding: '0 4px' }}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
            {p.etapes.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: '14px 10px', borderTop: '1px solid var(--hairline)', color: 'var(--ink-soft)', fontSize: 12.5 }}>
                  Aucune étape. Un protocole sans étape ne dit rien à personne.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={() => ajouteEtape(p.id)}
        style={{
          marginTop: 9, border: '1px dashed var(--copper-300)', background: 'none', color: 'var(--copper-700)',
          borderRadius: 3, font: 'inherit', fontSize: 12, padding: '8px 12px', cursor: 'pointer',
        }}
      >
        + Une étape
      </button>
    </div>
  );

  return (
    <Modal title="Les protocoles de la Maison" onClose={onClose} width={1040}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {brouillon.map((p) => table(p))}

        <button
          type="button"
          onClick={ajouteProtocole}
          style={{
            border: '1px dashed var(--copper-300)', background: 'none', color: 'var(--copper-700)',
            borderRadius: 3, font: 'inherit', fontSize: 12.5, padding: '10px 14px', cursor: 'pointer',
            alignSelf: 'flex-start', marginBottom: 6,
          }}
        >
          + Un protocole
        </button>

        {/* LES TÊTES QUI S'ÉCARTENT. Rien à afficher quand toutes suivent la
            doctrine : un bloc vide ferait chercher un problème qui n'existe pas. */}
        {ecarts.length > 0 && (
          <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 14 }}>
            <span className="trc-microlabel">Têtes qui ont leur propre suite · {ecarts.length}</span>
            {ecarts.map(({ c, quoi, detail }, i) => (
              <div key={`${c.id}-${i}`} style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '6px 0', borderTop: '1px solid var(--hairline)' }}>
                <span style={{ fontSize: 13.5, color: 'var(--color-indigo)', flex: '1 1 180px' }}>{c.name}</span>
                <span className="mnd-muted" style={{ fontSize: 11.5 }}>{quoi} · {detail}</span>
              </div>
            ))}
            <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 8, lineHeight: 1.55 }}>
              Un écart survit à la doctrine : changer une étape ici ne les déplace pas. Il se pose et
              se retire depuis leur fiche, onglet Parcours.
            </div>
          </div>
        )}

        <div className="mnd-muted" style={{ fontSize: 11.5, lineHeight: 1.55, marginTop: 6 }}>
          Ces mots sont lus par vos clientes, dans Ma Couronne, sous chaque étape de leur suivi.
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
          <Button variant="ghost" style={{ flex: 'none' }} onClick={onClose}>Fermer</Button>
        </div>
      </div>
    </Modal>
  );
}
