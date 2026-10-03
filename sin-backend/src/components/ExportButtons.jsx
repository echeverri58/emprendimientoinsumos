import { useState } from 'react';
import { ChevronDown, Download, FileJson, FileSpreadsheet, FileText, Loader2, Printer } from 'lucide-react';
import { Button } from './ui/index.jsx';
import { downloadExport } from '../lib/api.js';
import { formatNumber } from '../lib/format.js';

/**
 * Menú de exportación de la versión sin backend.
 *
 * CSV/Excel/JSON se generan en el navegador a partir del conjunto filtrado y se
 * descargan como Blob; PDF usa el diálogo de impresión del navegador.
 */
export default function ExportButtons({ filters, total, className = '' }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);

  const items = [
    { key: 'csv', format: 'csv', label: 'CSV (UTF-8 con BOM)', hint: 'Compatible con Excel y pandas; acentos y ñ correctos.', icon: FileText },
    { key: 'xls', format: 'xls', label: 'Excel (.xls)', hint: 'Hoja «Contratos» con filtros, más una hoja «Resumen».', icon: FileSpreadsheet },
    { key: 'json', format: 'json', label: 'JSON', hint: 'Estructura completa con metadatos de la consulta.', icon: FileJson },
    { key: 'pdf', format: null, label: 'PDF / Imprimir', hint: 'Usa el diálogo de impresión del navegador («Guardar como PDF»).', icon: Printer },
  ];

  const handle = async (item) => {
    setOpen(false);
    if (item.format === null) {
      window.print();
      return;
    }
    setBusy(item.key);
    try {
      await downloadExport(item.format, filters);
    } catch (error) {
      // El usuario puede reintentar; el error de Socrata ya es legible.
      console.error('No se pudo exportar:', error);
    } finally {
      setBusy(null);
    }
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
              const isBusy = busy === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  disabled={busy !== null}
                  onClick={() => handle(item)}
                  className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-slate-50 disabled:opacity-60"
                >
                  {isBusy ? (
                    <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-emerald-600" aria-hidden="true" />
                  ) : (
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                  )}
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-slate-800">
                      {isBusy ? 'Generando…' : item.label}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">{item.hint}</span>
                  </span>
                </button>
              );
            })}
            <p className="border-t border-slate-100 px-2.5 py-2 text-[10px] leading-snug text-slate-400">
              La exportación aplica a los <strong className="font-semibold text-slate-500">{formatNumber(total)}</strong>{' '}
              registros del filtro actual y se genera en tu navegador, directo desde datos.gov.co.
            </p>
          </div>
        </>
      ) : null}
    </div>
  );
}
