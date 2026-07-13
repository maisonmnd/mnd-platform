import { useEffect, useRef, useState } from 'react';
import { Seal } from '../../ds/components';
import Site from './Site';
import Onboarding from './Onboarding';
import Espace from './Espace';
import Console from './Console';

/* LOKAA — la sœur neutre et systématique : la surface produit SaaS.
   Quatre vues reliées par un commutateur haut :
   Site · Onboarding · Espace locataire · Console MND. */

type Vue = 'site' | 'onboarding' | 'espace' | 'console';

const VUES: { id: Vue; label: string }[] = [
  { id: 'site', label: 'Site' },
  { id: 'onboarding', label: 'Onboarding' },
  { id: 'espace', label: 'Espace locataire' },
  { id: 'console', label: 'Console MND' },
];

export default function App() {
  const [vue, setVue] = useState<Vue>('site');
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  const notify = (m: string) => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    setToast(m);
    timerRef.current = window.setTimeout(() => setToast(null), 2800);
  };
  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    []
  );

  return (
    <div className="lk-app">
      <div className="lk-ribbon">
        <span className="lk-ribbon__brand">LOKAA · plateforme multi-salons</span>
        <nav className="lk-switch" aria-label="Vues LOKAA">
          {VUES.map((v) => (
            <button
              key={v.id}
              type="button"
              className={`lk-switch__btn ${vue === v.id ? 'is-active' : ''}`}
              onClick={() => setVue(v.id)}
            >
              {v.label}
            </button>
          ))}
        </nav>
        <span className="lk-ribbon__mnd">
          Propulsé par MND
          <Seal color="copper" size={14} />
        </span>
      </div>

      {vue === 'site' && <Site onStart={() => setVue('onboarding')} />}
      {vue === 'onboarding' && (
        <Onboarding
          notify={notify}
          onCreated={(id) => {
            setTenantId(id);
            setVue('espace');
          }}
        />
      )}
      {vue === 'espace' && <Espace tenantId={tenantId} onPickTenant={setTenantId} notify={notify} />}
      {vue === 'console' && (
        <Console
          notify={notify}
          onInvite={() => setVue('onboarding')}
          onOuvrir={(id) => {
            setTenantId(id);
            setVue('espace');
          }}
        />
      )}

      {toast && (
        <div className="lk-toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
