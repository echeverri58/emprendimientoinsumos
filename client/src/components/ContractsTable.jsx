import { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  FileSearch,
  Inbox,
} from 'lucide-react';
import { Button, CategoriaBadge, DeptoBadge, EmptyState, ErrorState, EstadoBadge, TableSkeleton } from './ui/index.jsx';
import { formatCOP, formatDateShort, formatNumber, truncate } from '../lib/format.js';

/**
 * Column definitions; `sortKey` must be whitelisted by the server's SORTABLE map
 * (the logical names are the same for both views — each source maps them to its
 * own physical column).
 */
const COLUMNS = [
  { id: 'tipo', label: 'Tipo', sortKey: null, className: 'w-[104px]' },
  { id: 'fecha', label: 'Fecha de firma', sortKey: 'fecha_de_firma', className: 'w-[104px]' },
  { id: 'entidad', label: 'Entidad compradora', sortKey: 'nombre_entidad', className: 'min-w-[220px]' },
  { id: 'objeto', label: 'Objeto', sortKey: null, className: 'min-w-[320px]' },
  { id: 'modalidad', label: 'Modalidad', sortKey: 'modalidad_de_contratacion', className: 'min-w-[170px]' },
  { id: 'proveedor', label: 'Proveedor', sortKey: 'proveedor_adjudicado', className: 'min-w-[190px]' },
  { id: 'valor', label: 'Valor total', sortKey: 'valor_del_contrato', className: 'w-[150px] text-right', align: 'right' },
  { id: 'estado', label: 'Estado', sortKey: 'estado_contrato', className: 'w-[150px]' },
  { id: 'acciones', label: 'Acciones', sortKey: null, className: 'w-[104px] text-right', align: 'right' },
];

const PAGE_SIZES = [10, 25, 50, 100];

/** Distintivo de origen: en el modo combinado hay que poder distinguir cada fila. */
function TipoBadge({ tipo }) {
  if (tipo === 'convocado') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 ring-1 ring-inset ring-sky-600/20">
        Convocado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
      Adjudicado
    </span>
  );
}

function SortHeader({ column, sort, dir, onSort }) {
  const isActive = column.sortKey && sort === column.sortKey;
  const Icon = !column.sortKey ? null : isActive ? (dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th
      scope="col"
      aria-sort={isActive ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`px-4 py-3 text-xs font-semibold tracking-wide whitespace-nowrap text-slate-600 uppercase ${
        column.align === 'right' ? 'text-right' : 'text-left'
      } ${column.className ?? ''}`}
    >
      {column.sortKey ? (
        <button
          type="button"
          onClick={() => onSort(column.sortKey, isActive && dir === 'desc' ? 'asc' : 'desc')}
          className={`inline-flex items-center gap-1.5 rounded transition-colors hover:text-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${
            isActive ? 'text-emerald-700' : ''
          } ${column.align === 'right' ? 'flex-row-reverse' : ''}`}
          title={`Ordenar por ${column.label}`}
        >
          {column.label}
          {Icon ? <Icon className="h-3 w-3 shrink-0" aria-hidden="true" /> : null}
        </button>
      ) : (
        column.label
      )}
    </th>
  );
}

/**
 * Ficha por fila para pantallas pequeñas.
 *
 * En un teléfono, deslizar una tabla de 8 columnas es una mala experiencia: aquí
 * cada contrato/proceso se muestra como una tarjeta apilable con lo esencial, y se
 * toca para abrir el detalle. Es el patrón estándar para datos densos en móvil.
 */
function MobileCard({ row, onOpen, esConvocados, esMixto }) {
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onOpen(row)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(row);
        }
      }}
      className="cursor-pointer border-b border-slate-100 px-4 py-3.5 transition-colors hover:bg-emerald-50/40 focus-visible:bg-emerald-50/40 focus-visible:outline-none"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {esMixto ? <TipoBadge tipo={row.tipoRegistro} /> : null}
          <EstadoBadge estado={row.estado} />
        </div>
        <span className="shrink-0 text-[11px] text-slate-400">
          {esConvocados ? 'Publicado' : ''} {formatDateShort(row.fechaFirma)}
        </span>
      </div>

      <h3 className="mt-2 text-sm leading-snug font-semibold text-slate-900" title={row.entidad.nombre}>
        {truncate(row.entidad.nombre, 60)}
      </h3>
      <p className="mt-0.5 text-[11px] text-slate-500">
        {row.entidad.departamento}
        {row.entidad.ciudad && row.entidad.ciudad !== 'No Definido' ? ` · ${row.entidad.ciudad}` : ''}
      </p>

      <p className="mt-1.5 line-clamp-3 text-xs leading-snug text-slate-600">{row.objeto}</p>

      <div className="mt-2.5 flex items-end justify-between gap-3 border-t border-slate-100 pt-2">
        <div className="min-w-0">
          <p className="truncate text-[11px] text-slate-500" title={row.modalidad}>
            {row.modalidad}
          </p>
          {row.proveedor.nombre && row.proveedor.nombre !== 'Sin adjudicar' ? (
            <p className="mt-0.5 truncate text-[11px] text-slate-500" title={row.proveedor.nombre}>
              {row.proveedor.nombre}
            </p>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[10px] tracking-wide text-slate-400 uppercase">
            {esConvocados ? 'Precio base' : 'Valor'}
          </p>
          <p className="tnum text-sm font-bold text-slate-900">{formatCOP(row.valores.contrato)}</p>
        </div>
      </div>
    </article>
  );
}

function Pagination({ page, totalPages, pageSize, total, onPage, onPageSize }) {
  const pages = [];
  const push = (n) => {
    if (!pages.includes(n)) pages.push(n);
  };
  push(1);
  for (let n = page - 1; n <= page + 1; n += 1) if (n > 1 && n < totalPages) push(n);
  if (totalPages > 1) push(totalPages);
  pages.sort((a, b) => a - b);

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row">
      <div className="flex items-center gap-3 text-xs text-slate-500">
        <span>
          Página <strong className="font-semibold text-slate-700">{page}</strong> de{' '}
          <strong className="font-semibold text-slate-700">{formatNumber(totalPages)}</strong> ·{' '}
          {formatNumber(total)} {total === 1 ? 'contrato' : 'contratos'}
        </span>
        <label className="hidden items-center gap-1.5 sm:flex">
          <span>Filas:</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value))}
            className="rounded border border-slate-300 bg-white px-1.5 py-1 text-xs text-slate-700 outline-none focus:border-emerald-500"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>

      <nav className="flex items-center gap-1" aria-label="Paginación">
        <Button variant="outline" size="sm" onClick={() => onPage(page - 1)} disabled={page <= 1}>
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">Anterior</span>
        </Button>
        {pages.map((n, i) => (
          <span key={n} className="flex items-center">
            {i > 0 && n - pages[i - 1] > 1 ? <span className="px-1 text-xs text-slate-400">…</span> : null}
            <button
              type="button"
              onClick={() => onPage(n)}
              aria-current={n === page ? 'page' : undefined}
              className={`tnum min-w-[30px] rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
                n === page
                  ? 'bg-slate-900 text-white'
                  : 'border border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {n}
            </button>
          </span>
        ))}
        <Button variant="outline" size="sm" onClick={() => onPage(page + 1)} disabled={page >= totalPages}>
          <span className="sr-only sm:not-sr-only">Siguiente</span>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </nav>
    </div>
  );
}

/**
 * Interactive contract table: sortable columns, inline object expansion,
 * pagination and row-level actions.
 */
export default function ContractsTable({
  data,
  loading,
  error,
  filters,
  vista,
  onSort,
  onPage,
  onPageSize,
  onOpenDetail,
  onRetry,
  onClearFilters,
  toolbar,
}) {
  const [expanded, setExpanded] = useState(() => new Set());

  // Las etiquetas de fecha y valor cambian según la vista: en un proceso convocado
  // la fecha es la de publicación y el valor es el precio base estimado.
  const columns = useMemo(() => {
    const esConvocados = vista?.tipoRegistro === 'convocados';
    const esMixto = vista?.tipoRegistro === 'todos';
    return COLUMNS
      // La columna de tipo solo aporta cuando la tabla mezcla las dos vistas.
      .filter((column) => esMixto || column.id !== 'tipo')
      .map((column) => {
        if (column.id === 'fecha') {
          return { ...column, label: esConvocados ? 'Publicación' : esMixto ? 'Fecha' : 'Fecha de firma' };
        }
        if (column.id === 'valor') {
          return { ...column, label: esConvocados ? 'Precio base' : esMixto ? 'Valor' : 'Valor total' };
        }
        if (column.id === 'proveedor') {
          return { ...column, label: esConvocados ? 'Proveedor' : 'Proveedor adjudicado' };
        }
        return column;
      });
  }, [vista]);

  const esMixto = vista?.tipoRegistro === 'todos';
  const esConvocados = vista?.tipoRegistro === 'convocados';

  const toggleExpanded = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const page = data?.page ?? filters.page;
  const pageSize = data?.pageSize ?? filters.pageSize;

  const firstIndex = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastIndex = Math.min(page * pageSize, total);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-slate-800">
            {esConvocados
              ? 'Procesos convocados (sin adjudicar)'
              : esMixto
                ? 'Contratos adjudicados y procesos convocados'
                : 'Contratos adjudicados'}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {loading && !data ? (
              'Consultando SECOP II…'
            ) : (
              <>
                Mostrando <strong className="font-semibold text-slate-700">{formatNumber(firstIndex)}</strong>–
                <strong className="font-semibold text-slate-700">{formatNumber(lastIndex)}</strong> de{' '}
                <strong className="font-semibold text-slate-700">{formatNumber(total)}</strong> ·{' '}
                {vista?.valorLabel?.toLowerCase() ?? 'valor'} acumulado{' '}
                <strong className="font-semibold text-slate-700">
                  {formatCOP(data?.aggregates?.valorTotal ?? 0)}
                </strong>
                {data?.meta?.cached ? <span className="ml-1 text-slate-400">· desde caché</span> : null}
                {data?.meta?.truncated ? (
                  <span className="ml-1 font-medium text-amber-600">
                    · fusión truncada a {formatNumber(data.meta.mergeCap)} por vista
                  </span>
                ) : null}
              </>
            )}
          </p>
        </div>
        {toolbar ? <div className="flex flex-wrap items-center gap-2">{toolbar}</div> : null}
      </div>

      {error ? (
        <div className="p-4">
          <ErrorState error={error} onRetry={onRetry} />
        </div>
      ) : loading && !data ? (
        <TableSkeleton rows={Math.min(filters.pageSize, 10)} columns={esMixto ? 8 : 7} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={esConvocados ? 'No se encontraron procesos convocados' : 'No se encontraron registros'}
          message={
            esConvocados
              ? 'Ningún proceso sin adjudicar cumple la combinación de filtros seleccionada. Pruebe ampliar el rango de fechas, cambiar la regla de negocio o quitar filtros de ubicación y cuantía.'
              : 'Ningún registro cumple la combinación de filtros seleccionada. Pruebe ampliar el rango de fechas, cambiar la regla de negocio o quitar filtros de ubicación y cuantía.'
          }
          action={
            <Button variant="outline" size="sm" onClick={onClearFilters}>
              Restablecer filtros
            </Button>
          }
        />
      ) : (
        <>
          {/* En pantallas pequeñas: tarjetas apilables, no tabla con scroll horizontal. */}
          <div className="md:hidden">
            {rows.map((row) => (
              <MobileCard
                key={row.id ?? `${row.entidad.nombre}-${row.fechaFirma}-${row.valores.contrato}`}
                row={row}
                onOpen={onOpenDetail}
                esConvocados={esConvocados}
                esMixto={esMixto}
              />
            ))}
          </div>

          <div className="scroll-slim hidden overflow-x-auto md:block">
            <table className="w-full border-collapse text-sm">
            <thead className="bg-slate-50">
              <tr className="border-b border-slate-200">
                {columns.map((column) => (
                  <SortHeader
                    key={column.id}
                    column={column}
                    sort={filters.sort}
                    dir={filters.dir}
                    onSort={onSort}
                  />
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => {
                const isOpen = expanded.has(row.id);
                return (
                  <tr
                    key={row.id ?? `${row.entidad.nombre}-${row.fechaFirma}-${row.valores.contrato}`}
                    onClick={() => onOpenDetail(row)}
                    className="cursor-pointer transition-colors hover:bg-emerald-50/40"
                  >
                    {esMixto ? (
                      <td className="px-4 py-3 align-top">
                        <TipoBadge tipo={row.tipoRegistro} />
                      </td>
                    ) : null}

                    <td className="px-4 py-3 align-top text-xs whitespace-nowrap text-slate-600">
                      {formatDateShort(row.fechaFirma)}
                    </td>

                    <td className="px-4 py-3 align-top">
                      <div className="text-xs leading-snug font-semibold text-slate-800" title={row.entidad.nombre}>
                        {truncate(row.entidad.nombre, 62)}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <DeptoBadge>{row.entidad.departamento}</DeptoBadge>
                        {row.entidad.ciudad && row.entidad.ciudad !== 'No Definido' ? (
                          <span className="text-[11px] text-slate-400">{row.entidad.ciudad}</span>
                        ) : null}
                      </div>
                    </td>

                    <td className="px-4 py-3 align-top">
                      <p className={`text-xs leading-snug text-slate-700 ${isOpen ? '' : 'line-clamp-2'}`}>
                        {isOpen ? row.objeto : truncate(row.objeto, 150)}
                      </p>
                      <div className="mt-1.5 flex items-center gap-2">
                        {row.objeto.length > 150 ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleExpanded(row.id);
                            }}
                            className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 hover:underline"
                          >
                            {isOpen ? 'Ver menos' : 'Ver más'}
                          </button>
                        ) : null}
                        <CategoriaBadge categoria={row.categoria} />
                      </div>
                    </td>

                    <td className="px-4 py-3 align-top text-xs text-slate-600" title={row.modalidad}>
                      {truncate(row.modalidad, 42)}
                    </td>

                    <td className="px-4 py-3 align-top">
                      <div className="text-xs text-slate-700" title={row.proveedor.nombre}>
                        {truncate(row.proveedor.nombre, 44)}
                      </div>
                      {row.proveedor.esPyme || row.proveedor.esGrupo ? (
                        <div className="mt-1 flex gap-1">
                          {row.proveedor.esPyme ? (
                            <span className="rounded bg-sky-50 px-1 py-0.5 text-[10px] font-medium text-sky-700">
                              Mipyme
                            </span>
                          ) : null}
                          {row.proveedor.esGrupo ? (
                            <span className="rounded bg-violet-50 px-1 py-0.5 text-[10px] font-medium text-violet-700">
                              Grupo
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </td>

                    <td className="tnum px-4 py-3 text-right align-top text-xs font-bold whitespace-nowrap text-slate-900">
                      {formatCOP(row.valores.contrato)}
                    </td>

                    <td className="px-4 py-3 align-top">
                      <EstadoBadge estado={row.estado} />
                    </td>

                    <td className="px-4 py-3 text-right align-top whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onOpenDetail(row);
                          }}
                          className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
                          title="Ver detalle del contrato"
                          aria-label={`Ver detalle del contrato ${row.id ?? ''}`}
                        >
                          <Eye className="h-4 w-4" aria-hidden="true" />
                        </button>
                        {row.urlProceso ? (
                          <a
                            href={row.urlProceso}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(event) => event.stopPropagation()}
                            className="rounded-lg p-1.5 text-emerald-600 transition-colors hover:bg-emerald-50 hover:text-emerald-700"
                            title="Abrir el proceso en SECOP II"
                            aria-label="Abrir el proceso en SECOP II"
                          >
                            <ExternalLink className="h-4 w-4" aria-hidden="true" />
                          </a>
                        ) : (
                          <span className="p-1.5 text-slate-300" title="Este registro no publica URL de proceso">
                            <FileSearch className="h-4 w-4" aria-hidden="true" />
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </>
      )}

      {!error && rows.length > 0 ? (
        <Pagination
          page={page}
          totalPages={totalPages}
          pageSize={pageSize}
          total={total}
          onPage={onPage}
          onPageSize={onPageSize}
        />
      ) : null}
    </div>
  );
}
