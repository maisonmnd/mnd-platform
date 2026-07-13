import type { Tenant } from './data';

/* Petites pièces partagées entre les vues LOKAA. */

/** Cadenas — marqueur des éléments verrouillés par la Maison. */
export function Lock({ size = 11 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden="true"
      style={{ flex: '0 0 auto' }}
    >
      <rect x="4" y="10.5" width="16" height="10.5" rx="1.5" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

/** Marque du locataire — logo téléversé, sinon initiale sur l'accent. */
export function TenantMark({ tenant, size = 34 }: { tenant: Tenant; size?: number }) {
  if (tenant.logo) {
    return (
      <img
        src={tenant.logo}
        alt=""
        width={size}
        height={size}
        style={{ borderRadius: 3, objectFit: 'cover', display: 'block', flex: '0 0 auto' }}
      />
    );
  }
  return (
    <span
      className="lk-mark"
      style={{ width: size, height: size, background: tenant.accent, fontSize: Math.round(size * 0.52) }}
      aria-hidden="true"
    >
      {(tenant.nom.trim()[0] ?? 'S').toUpperCase()}
    </span>
  );
}
