import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { formatNumber } from '../../lib/format.js';

/**
 * Searchable checkbox dropdown used for departamento / ciudad / estado /
 * modalidad. Options carry a `contratos` count so users can see how much data
 * sits behind each choice before selecting it.
 */
export default function MultiSelect({
  options = [],
  selected = [],
  onChange,
  placeholder = 'Todos',
  searchPlaceholder = 'Buscar…',
  searchable = true,
  disabled = false,
  emptyMessage = 'Sin opciones disponibles',
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setTerm('');
  }, [open]);

  const filtered = useMemo(() => {
    const needle = term.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) => option.value.toLowerCase().includes(needle));
  }, [options, term]);

  const toggle = (value) => {
    const next = selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value];
    onChange(next);
  };

  const summary =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? selected[0]
        : `${selected.length} seleccionados`;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 ${
          selected.length
            ? 'border-emerald-300 bg-emerald-50/50 text-slate-800'
            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
        }`}
      >
        <span className="min-w-0 flex-1 truncate" title={selected.length === 1 ? selected[0] : undefined}>
          {summary}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {selected.length > 0 ? (
            <span className="tnum rounded bg-emerald-600 px-1.5 text-[10px] font-bold text-white">
              {selected.length}
            </span>
          ) : null}
          <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {open ? (
        <div className="animate-fade absolute z-40 mt-1 w-full min-w-[240px] rounded-lg border border-slate-200 bg-white shadow-xl">
          {searchable ? (
            <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
              <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
              <input
                autoFocus
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
              />
              {term ? (
                <button type="button" onClick={() => setTerm('')} aria-label="Limpiar búsqueda">
                  <X className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600" />
                </button>
              ) : null}
            </div>
          ) : null}

          <ul className="scroll-slim max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-xs text-slate-400">{emptyMessage}</li>
            ) : (
              filtered.map((option) => {
                const isSelected = selected.includes(option.value);
                return (
                  <li key={option.value}>
                    <button
                      type="button"
                      onClick={() => toggle(option.value)}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-slate-50"
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                          isSelected ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300 bg-white'
                        }`}
                      >
                        {isSelected ? <Check className="h-3 w-3 text-white" aria-hidden="true" /> : null}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-slate-700" title={option.value}>
                        {option.value}
                      </span>
                      {typeof option.contratos === 'number' ? (
                        <span className="tnum shrink-0 text-[11px] text-slate-400">
                          {formatNumber(option.contratos)}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>

          {selected.length > 0 ? (
            <div className="border-t border-slate-100 px-3 py-2">
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-xs font-medium text-rose-600 hover:text-rose-700"
              >
                Quitar selección ({selected.length})
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
