/** Small presentational primitives shared across the dashboard. */

/** Status pill. Colour buckets follow the brief: green / amber / red. */
const ESTADO_STYLES = {
  ejecucion: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  modificado: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  suspendido: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  convocatoria: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  cerrado: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  otro: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  desconocido: 'bg-slate-100 text-slate-500 ring-slate-400/20',
};

const DOT_STYLES = {
  ejecucion: 'bg-emerald-500',
  modificado: 'bg-amber-500',
  suspendido: 'bg-rose-500',
  convocatoria: 'bg-sky-500',
  cerrado: 'bg-slate-400',
  otro: 'bg-slate-400',
  desconocido: 'bg-slate-300',
};

export function EstadoBadge({ estado }) {
  const key = estado?.key ?? 'desconocido';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset whitespace-nowrap ${
        ESTADO_STYLES[key] ?? ESTADO_STYLES.otro
      }`}
      title={estado?.raw || 'Sin estado'}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOT_STYLES[key] ?? DOT_STYLES.otro}`} aria-hidden="true" />
      {estado?.label || 'Sin estado'}
    </span>
  );
}

const GROUP_STYLES = {
  calzado: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  vestuario: 'bg-emerald-50 text-emerald-800 ring-emerald-600/20',
  medias: 'bg-sky-50 text-sky-800 ring-sky-600/20',
  epp: 'bg-rose-50 text-rose-800 ring-rose-600/20',
  otro: 'bg-slate-100 text-slate-600 ring-slate-500/20',
};

/** UNSPSC category pill, coloured per business group. */
export function CategoriaBadge({ categoria, showCode = true }) {
  if (!categoria) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset whitespace-nowrap ${
        GROUP_STYLES[categoria.groupId] ?? GROUP_STYLES.otro
      }`}
      title={`UNSPSC ${categoria.code ?? '—'} · ${categoria.label}`}
    >
      {categoria.groupLabel}
      {showCode && categoria.code ? <span className="tnum opacity-60">{categoria.code}</span> : null}
    </span>
  );
}

/** Neutral location pill used next to the entity name. */
export function DeptoBadge({ children }) {
  return (
    <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-inset ring-slate-500/15 whitespace-nowrap">
      {children}
    </span>
  );
}

export function Card({ children, className = '' }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>{children}</div>
  );
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  as: Tag = 'button',
  ...rest
}) {
  const variants = {
    primary: 'bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:outline-emerald-600',
    dark: 'bg-slate-900 text-white hover:bg-slate-800 focus-visible:outline-slate-900',
    outline:
      'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-visible:outline-slate-400',
    ghost: 'text-slate-600 hover:bg-slate-100 focus-visible:outline-slate-400',
    danger: 'bg-rose-600 text-white hover:bg-rose-700 focus-visible:outline-rose-600',
  };
  const sizes = {
    sm: 'px-2.5 py-1.5 text-xs gap-1.5',
    md: 'px-3.5 py-2 text-sm gap-2',
    lg: 'px-4 py-2.5 text-sm gap-2',
  };
  return (
    <Tag
      className={`inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
        variants[variant] ?? variants.primary
      } ${sizes[size] ?? sizes.md} ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function Skeleton({ className = '', style }) {
  return <div className={`skeleton ${className}`} style={style} />;
}

/** Loading placeholder shaped like the contract table. */
export function TableSkeleton({ rows = 8, columns = 6 }) {
  const widthFor = (row, col) => {
    if (col === 1) return '22%';
    if (col === 2) return '28%';
    return `${8 + ((row + col) % 3) * 4}%`;
  };
  return (
    <div className="divide-y divide-slate-100">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-3.5">
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton key={c} className="h-4" style={{ width: widthFor(r, c) }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ title, message, action, icon: Icon }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      {Icon ? (
        <div className="rounded-full bg-slate-100 p-3">
          <Icon className="h-6 w-6 text-slate-400" aria-hidden="true" />
        </div>
      ) : null}
      <h3 className="text-base font-semibold text-slate-800">{title}</h3>
      {message ? <p className="max-w-md text-sm text-slate-500">{message}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-600 text-xs font-bold text-white">
          !
        </span>
        <div>
          <h3 className="text-sm font-semibold text-rose-900">No se pudieron obtener los datos</h3>
          <p className="mt-1 text-sm text-rose-800">{error?.message || 'Error desconocido.'}</p>
          {error?.detail && typeof error.detail === 'string' ? (
            <p className="mt-1 text-xs text-rose-700/80">{error.detail}</p>
          ) : null}
        </div>
      </div>
      {onRetry ? (
        <Button variant="danger" size="sm" onClick={onRetry} className="ml-9">
          Reintentar
        </Button>
      ) : null}
    </div>
  );
}

/** Label + control wrapper used throughout the filter sidebar. */
export function Field({ label, hint, children, htmlFor }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-xs font-semibold tracking-wide text-slate-600 uppercase">
        {label}
      </label>
      {children}
      {hint ? <p className="text-[11px] leading-snug text-slate-400">{hint}</p> : null}
    </div>
  );
}
