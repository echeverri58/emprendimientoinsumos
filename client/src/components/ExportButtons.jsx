import { useMemo, useState } from 'react';
import { ChevronDown, Download, FileJson, FileSpreadsheet, FileText, Printer } from 'lucide-react';
import { Button } from './ui/index.jsx';
import { exportUrl } from '../lib/api.js';
import { formatNumber } from '../lib/format.js';

/**
 * Export menu for the currently filtered result set.
 *
 * CSV/Excel/JSON are produced by the server over the FULL filtered set (not just
 * the visible page), so the numbers match the "N contratos" counter in the table
 * header. PDF uses the browser's own print pipeline, which is the only way to get
 * a real PDF without a server-side renderer.
 */
export default function ExportButtons({ filters, total, className = '' }) {
  const [open, setOpen] = useState(false);

  const items = useMemo(
    () => [
      {
        key: 'csv',
        label: 'CSV (UTF-8 con BOM)',
        hint: 'Compatible con Excel y pandas; acentos y ñ correctos.',
        icon: FileText,
        href: exportUrl('csv', filters),
      },
      {
        key: 'xls',
        label: 'Excel (.xls)',
        hint: 'Hoja «Contratos» con filtros, más una hoja «Resumen» con el detalle de la consulta.',
        icon: FileSpreadsheet,
        href: exportUrl('xls', filters),
      },
      {
        key: 'json',
        label: 'JSON',
        hint: 'Estructura completa con metadatos de la consulta.',
        icon: FileJson,
        href: exportUrl('json', filters),
      },
      {
        key: 'pdf',
        label: 'PDF / Imprimir',
        hint: 'Usa el diálogo de impresión del navegador («Guardar como PDF»).',
        icon: Printer,
        action: 'print',
      },
    ],
    [filters],
  );

  const handle = (item) => {
    setOpen(false);
    if (item.action === 'print') window.print();
  };

  return (
    <div className={`relative ${className}`}>
      <Button variant="dark" size="sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
        Exportar
        <span className="tnum rounded bg-white/15 px-1.5 text-[10px]">{formatNumber(total)}</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </Button>

      {open ? (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="animate-fade absolute right-0 z-40 mt-1 w-80 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
            {items.map((item) => {
              const Icon = item.icon;
              const content = (
                <>
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-slate-800">{item.label}</span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">{item.hint}</span>
                  </span>
                </>
              );
              return item.href ? (
                <a
                  key={item.key}
                  href={item.href}
                  download
                  onClick={() => setOpen(false)}
                  className="flex items-start gap-2.5 rounded-lg px-2.5 py-2 transition-colors hover:bg-slate-50"
                >
                  {content}
                </a>
              ) : (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => handle(item)}
                  className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-slate-50"
                >
                  {content}
                </button>
              );
            })}
            <p className="border-t border-slate-100 px-2.5 py-2 text-[10px] leading-snug text-slate-400">
              La exportación aplica a los <strong className="font-semibold text-slate-500">{formatNumber(total)}</strong>{' '}
              registros del filtro actual, no solo a la página visible.
            </p>
          </div>
        </>
      ) : null}
    </div>
  );
}
