import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Button, Field, Input, Seal, Select } from '../../ds/components';
import { fmtMoney } from '../../shared/currency';
import { uid } from '../../shared/store';
import { COUNTRIES, CURRENCIES } from '../../shared/geo';
import { ACCENTS, PLANS, tenantsStore, type PlanId, type Tenant } from './data';

/* Onboarding locataire — le formulaire qui crée l'instance du salon.
   Le pays pré-remplit l'indicatif et la devise ; l'accent est la seule
   variable de thème ; le logo se téléverse en local. */

export default function Onboarding({
  onCreated,
  notify,
}: {
  onCreated: (id: string) => void;
  notify: (m: string) => void;
}) {
  const beninDefault = COUNTRIES.find((c) => c.name === 'Bénin') ?? COUNTRIES[0];

  const [nom, setNom] = useState('');
  const [ville, setVille] = useState('');
  const [proprietaire, setProprietaire] = useState('');
  const [pays, setPays] = useState(beninDefault.name);
  const [dial, setDial] = useState(beninDefault.dial);
  const [devise, setDevise] = useState(beninDefault.currency);
  const [plan, setPlan] = useState<PlanId>('maison');
  const [accent, setAccent] = useState(ACCENTS[0].hex);
  const [logo, setLogo] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const onPays = (e: ChangeEvent<HTMLSelectElement>) => {
    const name = e.target.value;
    setPays(name);
    const c = COUNTRIES.find((x) => x.name === name);
    if (c) {
      setDial(c.dial);
      setDevise(CURRENCIES.some((cur) => cur.code === c.currency) ? c.currency : 'XOF');
    }
  };

  const onLogo = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setLogo(typeof reader.result === 'string' ? reader.result : null);
    reader.readAsDataURL(file);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!nom.trim()) {
      setErreur('Le nom du salon est requis pour créer l’instance.');
      return;
    }
    setErreur(null);
    const tenant: Tenant = {
      id: uid(),
      nom: nom.trim(),
      ville: ville.trim() || '—',
      pays,
      dial,
      devise,
      accent,
      logo,
      plan,
      statut: 'essai',
      proprietaire: proprietaire.trim() || 'Direction',
    };
    tenantsStore.set((prev) => [...prev, tenant]);
    notify(`« ${tenant.nom} » est en ligne · propulsé par MND.`);
    onCreated(tenant.id);
  };

  const planChoisi = PLANS.find((p) => p.id === plan) ?? PLANS[0];
  const deviseChoisie = CURRENCIES.find((c) => c.code === devise);

  return (
    <div className="lk-page mnd-rise" style={{ ['--lk-accent' as string]: accent }}>
      <div className="mnd-eyebrow">Pro · LOKAA · Nouveau salon</div>
      <h1 className="lk-page__title">Assistant d’installation.</h1>
      <p className="lk-page__lead">
        Quatre renseignements suffisent — le nom, le pays, la devise, la couleur. L’instance est
        créée isolée, co-marquée « Propulsé par MND », prête pour l’essai.
      </p>

      <div className="lk-onb">
        <form className="lk-onb__form" onSubmit={onSubmit} noValidate>
          <div className="lk-onb__grid">
            <Field label="Nom du salon">
              <Input
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                placeholder="Ex. Studio Lumière"
              />
            </Field>
            <Field label="Propriétaire">
              <Input
                value={proprietaire}
                onChange={(e) => setProprietaire(e.target.value)}
                placeholder="Ex. Amara D."
              />
            </Field>
            <Field label="Pays">
              <Select value={pays} onChange={onPays}>
                {COUNTRIES.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Ville">
              <Input
                value={ville}
                onChange={(e) => setVille(e.target.value)}
                placeholder="Ex. Cotonou"
              />
            </Field>
            <Field label="Indicatif téléphonique">
              <Input value={dial} readOnly aria-label={`Indicatif ${dial}, déduit du pays`} />
            </Field>
            <Field label="Devise du salon">
              <Select value={devise} onChange={(e) => setDevise(e.target.value)}>
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} · {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="lk-onb__block">
            <div className="mnd-field__label">Plan d’abonnement</div>
            <div className="lk-onb__plans" role="radiogroup" aria-label="Plan d’abonnement">
              {PLANS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={plan === p.id}
                  className={`lk-onb__plan ${plan === p.id ? 'is-active' : ''}`}
                  onClick={() => setPlan(p.id)}
                >
                  <span className="lk-onb__plan-tier">{p.nom}</span>
                  <span className="lk-onb__plan-price">{fmtMoney(p.prixXof, 'XOF')} / mois</span>
                  <span className="lk-onb__plan-scope">{p.portee}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="lk-onb__block">
            <div className="mnd-field__label">Couleur d’accent · palette validée</div>
            <div className="lk-onb__swatches" role="radiogroup" aria-label="Couleur d’accent">
              {ACCENTS.map((a) => (
                <button
                  key={a.hex}
                  type="button"
                  role="radio"
                  aria-checked={accent === a.hex}
                  title={a.nom}
                  className={`lk-swatch ${accent === a.hex ? 'is-active' : ''}`}
                  style={{ background: a.hex }}
                  onClick={() => setAccent(a.hex)}
                >
                  {accent === a.hex ? <span aria-hidden="true">✓</span> : null}
                </button>
              ))}
            </div>
            <div className="lk-onb__hint">
              {ACCENTS.find((a) => a.hex === accent)?.nom} · {accent}
            </div>
          </div>

          <div className="lk-onb__block">
            <div className="mnd-field__label">Logo du salon · SVG ou PNG</div>
            <label className="lk-onb__upload">
              <input type="file" accept="image/*" onChange={onLogo} />
              {logo ? 'Remplacer le fichier' : 'Téléverser un fichier'}
            </label>
            {logo && (
              <div className="lk-onb__logopreview">
                <img src={logo} alt="Aperçu du logo téléversé" />
                <button type="button" className="lk-onb__logoclear" onClick={() => setLogo(null)}>
                  Retirer
                </button>
              </div>
            )}
          </div>

          {erreur && <div className="lk-onb__error" role="alert">{erreur}</div>}

          <div className="lk-onb__actions">
            <Button type="submit" variant="copper" size="lg">
              Créer l’instance du salon
            </Button>
          </div>
        </form>

        {/* Aperçu vivant */}
        <aside className="lk-onb__preview">
          <div className="mnd-field__label">Aperçu en direct · espace co-marqué</div>
          <div className="lk-onb__mock">
            <div className="lk-onb__mock-side">
              {logo ? (
                <img src={logo} alt="" className="lk-onb__mock-logo" />
              ) : (
                <span className="lk-mark" style={{ width: 30, height: 30, background: accent, fontSize: 15 }}>
                  {(nom.trim()[0] ?? 'V').toUpperCase()}
                </span>
              )}
              <div>
                <div className="lk-onb__mock-name">{nom.trim() || 'Votre salon'}</div>
                <div className="lk-onb__mock-sub">propulsé par MND</div>
              </div>
            </div>
            <div className="lk-onb__mock-main">
              <div className="lk-onb__mock-kpi">
                <span>Revenu mois</span>
                <strong>{fmtMoney(22480000, devise)}</strong>
              </div>
              <span className="lk-onb__mock-btn" style={{ background: accent }}>
                Encaisser
              </span>
            </div>
          </div>
          <div className="lk-onb__recap">
            <div>
              <span>Plan</span>
              <span>
                {planChoisi.nom} · {fmtMoney(planChoisi.prixXof, 'XOF')} / mois
              </span>
            </div>
            <div>
              <span>Devise</span>
              <span>
                {devise} · {deviseChoisie?.symbol ?? ''}
              </span>
            </div>
            <div>
              <span>Indicatif</span>
              <span>{dial}</span>
            </div>
            <div>
              <span>Statut initial</span>
              <span>Essai · 30 jours</span>
            </div>
          </div>
          <div className="lk-onb__seal">
            <Seal color="obsidian" size={26} />
            <span>Le sceau « Propulsé par MND » n’est pas surchargeable.</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
