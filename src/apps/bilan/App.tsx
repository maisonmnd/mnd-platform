import { useMemo, useState } from 'react';
import { asset } from '../../shared/asset';

/* Bilan de Séance — Le Carnet de Suivi. Panneau de réglage (masqué à l'impression)
   + le papier A4. L'ERP pré-remplit par l'URL :
   bilan.html?client=…&service=…&date=AAAA-MM-JJ&praticien=…&duree=…&next=…&num=… */

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const frDate = (iso: string): string => {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${parseInt(m[3], 10)} ${MOIS[parseInt(m[2], 10) - 1]} ${m[1]}` : iso;
};

const SERVICES = [
  'VÈKPÈ™ · Pose & structure',
  'SÍNSIN™ · Resserrage & racines',
  'FÍNFÍN™ · Soin & lavage',
  'GBÈZÀ™ · Réparation',
  'GBÈZÀ™ & SÍNSIN™',
  'ÀGBÓ™ · Purification',
  'DÒDÒ™ · Extensions',
];
const PRATICIENS = ['Yéman Ahouansou', 'Brice Ahouansou'];

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function initFromUrl() {
  const q = new URLSearchParams(window.location.search);
  const g = (k: string) => q.get(k)?.trim() || '';
  const dateParam = g('date');
  return {
    client: g('client') || 'Vioutou Raimath Bonou',
    service: g('service') || SERVICES[1],
    dateIso: /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : todayISO(),
    praticien: g('praticien') || PRATICIENS[0],
    duree: g('duree') || '2 h 30',
    next: g('next') || '',
    num: g('num') || `MND-BS-${new Date().getFullYear()}-0001`,
  };
}

type Gauge = { name: string; note: string; value: number };
const GAUGES_SEED: Gauge[] = [
  { name: 'Cuir chevelu', note: 'apaisé', value: 4 },
  { name: 'Racines', note: 'reprises', value: 3 },
  { name: 'Hydratation', note: 'bonne', value: 4 },
  { name: 'Densité & tenue', note: 'excellente', value: 5 },
];

export default function App() {
  const [init] = useState(initFromUrl);
  const [client, setClient] = useState(init.client);
  const [service, setService] = useState(init.service);
  const [dateIso, setDateIso] = useState(init.dateIso);
  const [praticien, setPraticien] = useState(init.praticien);
  const [duree, setDuree] = useState(init.duree);
  const [next, setNext] = useState(init.next);
  const [num, setNum] = useState(init.num);
  const [gauges, setGauges] = useState<Gauge[]>(GAUGES_SEED);

  /* Le service reçu par l'ERP peut ne pas figurer au catalogue par défaut : on
     l'ajoute à la liste plutôt que d'imposer autre chose. Idem pour le praticien. */
  const serviceOpts = useMemo(() => Array.from(new Set([init.service, ...SERVICES])), [init.service]);
  const praticienOpts = useMemo(() => Array.from(new Set([init.praticien, ...PRATICIENS])), [init.praticien]);

  const setGauge = (i: number, v: number) => setGauges((gs) => gs.map((g, j) => (j === i ? { ...g, value: v } : g)));

  const resume = () =>
    `Maison MND — Bilan de séance de ${client} (${service}, ${frDate(dateIso)}).`
    + (next ? ` Prochaine visite conseillée : ${next}.` : '')
    + ` Mi nyɔ́ ɖɛkpɛ.`;
  const shareWhatsApp = () => window.open(`https://wa.me/?text=${encodeURIComponent(resume())}`, '_blank', 'noopener');
  const shareEmail = () => { window.location.href = `mailto:?subject=${encodeURIComponent('Votre bilan de séance — Maison MND')}&body=${encodeURIComponent(resume())}`; };

  return (
    <>
      <header className="topbar">
        <div>
          <p className="kicker">Atelier · Le Carnet de Suivi</p>
          <h1>Prêt à remettre, expliquer, fidéliser.</h1>
        </div>
        <nav className="actions">
          <button className="btn" onClick={() => window.print()}>Imprimer / PDF</button>
          <button className="btn ghost" onClick={shareWhatsApp}>WhatsApp</button>
          <button className="btn ghost" onClick={shareEmail}>E-mail</button>
        </nav>
      </header>

      <main className="layout">
        {/* Panneau de réglage */}
        <aside className="panel" aria-label="Réglage du bilan">
          <p className="p-kicker">Réglage</p>
          <h2>Le bilan</h2>

          <div className="field">
            <label htmlFor="f-client">Nom du client</label>
            <input id="f-client" type="text" value={client} onChange={(e) => setClient(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="f-service">Service réalisé</label>
            <select id="f-service" value={service} onChange={(e) => setService(e.target.value)}>
              {serviceOpts.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-date">Date de la séance</label>
            <input id="f-date" type="date" value={dateIso} onChange={(e) => setDateIso(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="f-praticien">Praticien</label>
            <select id="f-praticien" value={praticien} onChange={(e) => setPraticien(e.target.value)}>
              {praticienOpts.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-duree">Durée</label>
            <input id="f-duree" type="text" value={duree} onChange={(e) => setDuree(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="f-next">Prochaine visite conseillée</label>
            <input id="f-next" type="text" value={next} onChange={(e) => setNext(e.target.value)} placeholder="Semaine du 31 août 2026" />
          </div>
          <div className="field">
            <label htmlFor="f-num">Numéro de bilan</label>
            <input id="f-num" type="text" value={num} onChange={(e) => setNum(e.target.value)} />
          </div>

          <p className="hint">
            Les jauges se règlent d'un clic sur le document. Les points clés et le rituel se
            modifient directement dans le texte. L'ERP pré-remplit ce panneau par le lien
            «&nbsp;?client=…&amp;service=…&nbsp;». Le panneau disparaît à l'impression&nbsp;;
            seul le papier demeure.
          </p>
        </aside>

        {/* Le document */}
        <div className="sheet-wrap">
          <article className="sheet">
            <div className="frame" aria-hidden="true" />

            <header className="maison">
              <img className="mnd-logo" src={asset('/assets/monograms/mono-indigo.png')} alt="" aria-hidden="true" />
              <div className="wordmark">MND</div>
              <p className="adresse">Maison MND · Atelier du Lock · Cotonou · Bénin</p>
              <div className="rule" aria-hidden="true" />
              <p className="doc-kicker">Le Carnet de Suivi</p>
              <h2 className="doc-title">Bilan de Séance</h2>
              <p className="decerne">établi pour</p>
              <p className="client-nom">{client}</p>
            </header>

            <div className="meta">
              <div><p className="m-label">Séance du</p><p className="m-value">{frDate(dateIso)}</p></div>
              <div><p className="m-label">Service</p><p className="m-value">{service}</p></div>
              <div><p className="m-label">Praticien</p><p className="m-value">{praticien}</p></div>
              <div><p className="m-label">Durée</p><p className="m-value">{duree}</p></div>
            </div>

            {/* État de la couronne */}
            <section className="section">
              <div className="s-head"><h3 className="s-title">L'état de la couronne</h3><div className="s-line" aria-hidden="true" /></div>
              <div className="gauges">
                {gauges.map((g, i) => (
                  <div className="gauge" key={g.name}>
                    <span className="g-name">{g.name}</span>
                    <span className="dots" role="img" aria-label={`${g.value} sur 5`}>
                      {[1, 2, 3, 4, 5].map((v) => (
                        <span key={v} className={`dot${v <= g.value ? ' on' : ''}`} onClick={() => setGauge(i, v)} />
                      ))}
                    </span>
                    <span className="g-note">{g.note}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Points clés */}
            <section className="section">
              <div className="s-head"><h3 className="s-title">Les points clés de la séance</h3><div className="s-line" aria-hidden="true" /></div>
              <ul className="points">
                {[
                  'Resserrage complet des racines sur l\'ensemble de la couronne ; la zone temporale gauche, plus fine, a été travaillée en tension douce pour préserver le bulbe.',
                  'Le cuir chevelu ne présente plus d\'irritation depuis la dernière visite — le rituel d\'apaisement recommandé a porté ses fruits.',
                  'Trois locks de la nuque ont été consolidées en prévention ; à surveiller lors de la prochaine séance, sans intervention nécessaire d\'ici là.',
                ].map((txt, i) => (
                  <li key={i}>
                    <span className="pt-dot" aria-hidden="true" />
                    <p contentEditable suppressContentEditableWarning>{txt}</p>
                  </li>
                ))}
              </ul>
            </section>

            {/* Rituel à domicile */}
            <section className="section">
              <div className="s-head"><h3 className="s-title">Le rituel à domicile</h3><div className="s-line" aria-hidden="true" /></div>
              <div className="rituel">
                {[
                  { name: 'Purifier', cadence: 'chaque semaine', txt: 'Un lavage doux par semaine, en pressant sans frotter. Rincer longuement, à l\'eau tiède.' },
                  { name: 'Nourrir', cadence: 'deux fois par semaine', txt: 'Quelques gouttes d\'huile légère sur le cuir chevelu, en massage lent du bout des doigts.' },
                  { name: 'Sceller', cadence: 'après chaque lavage', txt: 'Sécher entièrement avant de nouer. Jamais de couronne humide sous le foulard.' },
                  { name: 'Couronner', cadence: 'chaque nuit', txt: 'Foulard ou taie en satin pour la nuit — la friction du coton défait le travail des racines.' },
                ].map((t) => (
                  <div className="temps" key={t.name}>
                    <p className="t-name">{t.name} <span>{t.cadence}</span></p>
                    <p contentEditable suppressContentEditableWarning>{t.txt}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Pied */}
            <footer className="doc-foot">
              <div className="next-rdv">
                <p className="m-label">Prochaine visite conseillée</p>
                <p className="m-value">{next || '—'}</p>
                <p className="num">Bilan n° <span>{num}</span></p>
              </div>
              <div className="seal" aria-hidden="true">Les<br />Quatre<br />Temps</div>
              <div className="signature">
                <p className="sig-nom">{praticien}</p>
                <p className="sig-role">Maison MND · mi nyɔ́ ɖɛkpɛ</p>
              </div>
            </footer>
          </article>
        </div>
      </main>
    </>
  );
}
