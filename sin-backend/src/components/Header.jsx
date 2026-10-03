import { Activity, Database, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from './ui/index.jsx';
import { formatDate, formatRelative } from '../lib/format.js';

/**
 * Dark corporate masthead: identity, data provenance and global actions.
 */
export default function Header({ health, loading, onRefresh, children }) {
  const reachable = health?.ok;
  return (
    <header className="bg-slate-900 text-white">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 shadow-lg shadow-emerald-900/30">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-base leading-tight font-semibold tracking-tight sm:text-lg">
              Observatorio de Contratación · Dotación e Insumos
            </h1>
            <p className="mt-0.5 text-xs text-slate-400 sm:text-sm">
              Dotación · Vestuario · Calzado · Insumos · Elementos de Protección Personal
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
              <span className="inline-flex items-center gap-1">
                <Database className="h-3 w-3" aria-hidden="true" />
                datos.gov.co · vista <span className="font-mono text-slate-300">jbjy-vk9h</span>
              </span>
              {health?.socrata?.datasetLastModified ? (
                <span className="inline-flex items-center gap-1">
                  <Activity className="h-3 w-3" aria-hidden="true" />
                  dataset actualizado el {formatDate(health.socrata.datasetLastModified)}
                </span>
              ) : null}
              {health?.generatedAt ? <span>actualizado {formatRelative(health.generatedAt)}</span> : null}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset ${
              reachable
                ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/30'
                : 'bg-rose-500/15 text-rose-300 ring-rose-400/30'
            }`}
            title={
              reachable
                ? `API de Datos Abiertos disponible (${health?.socrata?.latencyMs ?? '?'} ms)`
                : health?.socrata?.error || 'Sin conexión con la API'
            }
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${reachable ? 'bg-emerald-400' : 'bg-rose-400'}`}
              aria-hidden="true"
            />
            {reachable ? 'SECOP II en línea' : 'SECOP II sin conexión'}
          </span>

          {health && health.hasAppToken === false ? (
            <span
              className="hidden rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-medium text-amber-300 ring-1 ring-inset ring-amber-400/30 sm:inline-flex"
              title="Defina SOCRATA_APP_TOKEN en el archivo .env para elevar los límites de consulta de Socrata."
            >
              Sin app token
            </span>
          ) : null}

          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
            className="text-slate-300 hover:bg-white/10 hover:text-white"
            title="Volver a consultar la API"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            Actualizar
          </Button>

          {children}
        </div>
      </div>
    </header>
  );
}
