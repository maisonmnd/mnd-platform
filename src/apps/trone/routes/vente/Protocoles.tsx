import { useMemo, useState } from 'react';
import { Button, Input, Modal, Select, toast } from '../../../../ds/components';
import { useServices, type Service } from '../../../../shared/catalog';
import { useClients } from '../../../../shared/clients';
import { useBranch } from '../../../../shared/branches';
import {
  protocolesStore, useProtocoles, aSonEcart, type EtapeProtocole, type LesProtocoles,
} from '../../../../shared/protocoles';

/* ══ LES PROTOCOLES DE LA MAISON — 6 septembre 2026 (maquette validée) ══

   « Où est-ce que je manage le programme de pousse et je change les
   prestations qui sont inclus ? » (Yéman).

   NULLE PART, JUSQU'ICI. Les jours, les prestations et jusqu'aux phrases que
   la cliente lit vivaient en dur dans `shared/protocoles.ts` : c'étaient MES
   intervalles et MES mots, proposés faute de connaître ceux de la Maison. Et
   depuis que Ma Couronne affiche le suivi, ils sont publiés chez ses clientes
   sous son nom.

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

type Cle = 'couleur' | 'pousse';

const TITRES: Record<Cle, { titre: string; quand: string }> = {
  couleur: { titre: 'Après une couleur', quand: 's’ouvre sur une couleur végétale honorée' },
  pousse: { titre: 'Le programme de pousse', quand: 's’ouvre sur un VÍVÍVÓ™, ou sur la date que la Maison pose' },
};

export function ProtocolesModal({ onClose }: { onClose: () => void }) {
  const { branch } = useBranch();
  const [services] = useServices();
  const [clients] = useClients();
  const [enMagasin] = useProtocoles();
  /* ON TRAVAILLE SUR UN BROUILLON. Écrire à chaque frappe ferait voyager le
     protocole chez toutes les clientes pendant qu'on hésite encore. */
  const [brouillon, setBrouillon] = useState<LesProtocoles>(() => ({
    couleur: enMagasin.couleur.map((e) => ({ ...e })),
    pousse: enMagasin.pousse.map((e) => ({ ...e })),
  }));

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

  const pose = (cle: Cle, i: number, patch: Partial<EtapeProtocole>) =>
    setBrouillon((p) => ({ ...p, [cle]: p[cle].map((e, k) => (k === i ? { ...e, ...patch } : e)) }));

  const retire = (cle: Cle, i: number) =>
    setBrouillon((p) => ({ ...p, [cle]: p[cle].filter((_, k) => k !== i) }));

  const ajoute = (cle: Cle) => setBrouillon((p) => {
    const dernier = p[cle][p[cle].length - 1];
    return {
      ...p,
      [cle]: [...p[cle], {
        jours: (dernier?.jours ?? 0) + 14,
        code: choix[0]?.code ?? '',
        nom: choix[0]?.nom ?? '',
        pourquoi: '',
      }],
    };
  });

  const enregistre = (cle: Cle) => {
    /* LES ÉTAPES SE RANGENT DANS L'ORDRE DU TEMPS. Une étape à J+14 posée après
       une à J+30 ferait un protocole qui remonte le temps, et le suivi
       cocherait les mauvaises. */
    const range = [...brouillon[cle]]
      .filter((e) => e.code && e.jours > 0)
      .sort((a, b) => a.jours - b.jours);
    if (range.length === 0) { toast('Un protocole sans étape ne dit rien.'); return; }
    protocolesStore.set((p) => ({ ...p, [cle]: range }));
    setBrouillon((p) => ({ ...p, [cle]: range }));
    toast(`${TITRES[cle].titre} · ${range.length} étape${range.length > 1 ? 's' : ''} enregistrée${range.length > 1 ? 's' : ''}.`);
  };

  /* LES TÊTES QUI SUIVENT LEUR PROPRE CADENCE. Un écart survit à la doctrine :
     si la Maison décale une étape, celles-ci gardent la leur. Elles doivent
     donc se voir d'ici, sinon elles dérivent sans que personne le sache. */
  const ecarts = useMemo(() => clients
    .filter((c) => c.branchId === branch.id && !c.archived && c.ecartProtocole)
    .flatMap((c) => ([
      ...(aSonEcart(enMagasin.couleur, c.ecartProtocole?.couleur) ? [{ c, cle: 'couleur' as Cle, jours: c.ecartProtocole!.couleur! }] : []),
      ...(aSonEcart(enMagasin.pousse, c.ecartProtocole?.pousse) ? [{ c, cle: 'pousse' as Cle, jours: c.ecartProtocole!.pousse! }] : []),
    ])), [clients, branch.id, enMagasin]);

  const table = (cle: Cle) => (
    <div style={{ marginBottom: 26 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ fontFamily: 'var(--font-serif)', fontSize: 21, color: 'var(--color-indigo)' }}>
          {TITRES[cle].titre}
        </span>
        <span className="mnd-muted" style={{ fontSize: 11 }}>
          {brouillon[cle].length} étape{brouillon[cle].length > 1 ? 's' : ''} · {TITRES[cle].quand}
        </span>
        <Button variant="copper" size="sm" style={{ marginLeft: 'auto', flex: 'none' }} onClick={() => enregistre(cle)}>
          Enregistrer
        </Button>
      </div>

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
            {brouillon[cle].map((e, i) => (
              <tr key={`${cle}-${i}`}>
                <td style={{ padding: '9px 10px', borderTop: '1px solid var(--hairline)', whiteSpace: 'nowrap' }}>
                  <Input
                    inputMode="numeric"
                    value={String(e.jours)}
                    onChange={(ev) => pose(cle, i, { jours: Math.max(0, parseInt(ev.target.value.replace(/[^0-9]/g, ''), 10) || 0) })}
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
                      pose(cle, i, { code: ev.target.value, nom: t?.nom ?? e.nom });
                    }}
                  >
                    {!choix.some((x) => x.code === e.code) && <option value={e.code}>{e.nom} · absente du catalogue</option>}
                    {choix.map((x) => <option key={x.code} value={x.code}>{x.nom}</option>)}
                  </Select>
                </td>
                <td style={{ padding: '9px 10px', borderTop: '1px solid var(--hairline)' }}>
                  <Input
                    value={e.pourquoi}
                    onChange={(ev) => pose(cle, i, { pourquoi: ev.target.value })}
                    placeholder="Ce que la cliente lira sous l’étape…"
                    aria-label="Ce que la cliente lit"
                  />
                </td>
                <td style={{ padding: '9px 10px', borderTop: '1px solid var(--hairline)' }}>
                  {/* HORS FORFAIT : « Le Protocole Post-Couleur » se vend comme
                      les SOINS qui suivent une couleur. Y glisser un acte de
                      couleur changerait ce que le produit veut dire, et son
                      prix de moitié. */}
                  <button
                    type="button"
                    className={`tre-chip ${e.horsForfait ? '' : 'is-on'}`}
                    onClick={() => pose(cle, i, { horsForfait: e.horsForfait ? undefined : true })}
                  >
                    {e.horsForfait ? 'hors forfait' : 'au forfait'}
                  </button>
                </td>
                <td style={{ padding: '9px 10px', borderTop: '1px solid var(--hairline)', textAlign: 'right' }}>
                  <button
                    type="button"
                    aria-label="Retirer cette étape"
                    onClick={() => retire(cle, i)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', fontSize: 15, padding: '0 4px' }}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={() => ajoute(cle)}
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
        {table('couleur')}
        {table('pousse')}

        {/* LES ÉCARTS, s'il y en a. Rien à afficher quand toutes les têtes
            suivent la doctrine : un bloc vide ferait chercher un problème qui
            n'existe pas. */}
        {ecarts.length > 0 && (
          <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 14 }}>
            <span className="trc-microlabel">
              Têtes qui suivent leur propre cadence · {ecarts.length}
            </span>
            {ecarts.map(({ c, cle, jours }) => (
              <div key={`${c.id}-${cle}`} style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '6px 0', borderTop: '1px solid var(--hairline)' }}>
                <span style={{ fontSize: 13.5, color: 'var(--color-indigo)', flex: '1 1 180px' }}>{c.name}</span>
                <span className="mnd-muted" style={{ fontSize: 11.5 }}>
                  {TITRES[cle].titre.toLowerCase()} · J+{jours.join(' / ')}
                </span>
              </div>
            ))}
            <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 8, lineHeight: 1.55 }}>
              Leur écart survit à la doctrine : changer une étape ici ne les déplace pas. Il se pose
              et se retire depuis leur fiche, onglet Parcours.
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
