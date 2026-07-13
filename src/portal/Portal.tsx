import { asset } from '../shared/asset';
import { Eyebrow, Seal } from '../ds/components';

/* Le portail présente les cinq sœurs — même sang, visages très distincts.
   Les liens sont surchargeables à la construction (VITE_LINK_*) : en déploiement
   séparé, chaque sœur vit sur son propre lien ; sinon, entrées locales du MPA. */

const env = import.meta.env;
const LINKS: Record<string, string | undefined> = {
  '/trone.html': env.VITE_LINK_TRONE,
  '/couronne.html': env.VITE_LINK_COURONNE,
  '/consultation.html': env.VITE_LINK_CONSULTATION,
  '/lokaa.html': env.VITE_LINK_LOKAA,
  '/certificat.html': env.VITE_LINK_CERTIFICAT,
};
const resolveHref = (local: string): string => LINKS[local] || asset(local);

const SISTERS = [
  {
    href: '/trone.html',
    cls: 'po-card--trone',
    seal: 'or' as const,
    name: 'Le Trône',
    who: 'La maison · back-office',
    desc: "L'ERP de commandement : pilotage, carnet, clients, caisse, laboratoire, finances, académie. Multi-branches, multi-devises — la branche impose sa loi à toutes les données.",
  },
  {
    href: '/couronne.html',
    cls: 'po-card--couronne',
    seal: 'copper' as const,
    name: 'Ma Couronne',
    who: 'La cliente · mobile',
    desc: 'L\'espace client où la cliente est l\'héroïne : statut de couronne, réservation en 7 temps, rituel sur-mesure, cercle de fidélité.',
  },
  {
    href: '/consultation.html',
    cls: 'po-card--consultation',
    seal: 'ivoire' as const,
    name: 'La Consultation',
    who: 'Le monde · diagnostic payant',
    desc: 'Création ou SOS Locks : huit étapes cérémonielles, paiement à l\'entrée crédité sur le premier rituel, transmission directe au Trône.',
  },
  {
    href: '/lokaa.html',
    cls: 'po-card--lokaa',
    seal: 'indigo' as const,
    name: 'LOKAA',
    who: 'Les salons · SaaS white-label',
    desc: 'Le squelette du Trône offert aux autres maisons — thème du locataire, devise par tenant, console super-admin. Propulsé par MND.',
  },
  {
    href: '/certificat.html',
    cls: 'po-card--certificat',
    seal: 'obsidian' as const,
    name: 'Certificat',
    who: 'L\'Académie · sceau officiel',
    desc: 'Le certificat scellé MND — A4 paysage, prêt à imprimer, envoyer ou encadrer.',
  },
];

export default function Portal() {
  return (
    <>
      <header className="po-hero mnd-rise">
        <Seal color="indigo" size={56} style={{ margin: '0 auto' }} />
        <Eyebrow>Maison MND · Cotonou · Édition Souveraine</Eyebrow>
        <h1>Cinq sœurs, une couronne.</h1>
        <p className="signature">mi nyɔ́ ɖɛkpɛ — « Nous sommes beaux, et nous le savons. »</p>
      </header>

      <main className="po-grid">
        {SISTERS.map((s) => (
          <a key={s.name} href={resolveHref(s.href)} className={`po-card ${s.cls}`}>
            <span className="seal">
              <Seal color={s.seal} size={40} />
            </span>
            <Eyebrow invert={s.cls.includes('trone') || s.cls.includes('consultation')}>{s.who}</Eyebrow>
            <h2>{s.name}</h2>
            <p>{s.desc}</p>
            <div className="who">Entrer →</div>
          </a>
        ))}
      </main>

      <footer className="po-foot">
        Former, soigner, transmettre — contact@mnd.bj · @maison.mnd
      </footer>
    </>
  );
}
