import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Banknote,
  Building2,
  ClipboardList,
  Copy,
  ExternalLink,
  Hash,
  Loader2,
  RefreshCw,
  UserCheck,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { Button, CategoriaBadge, DeptoBadge, EstadoBadge, Skeleton } from './ui/index.jsx';
import { api } from '../lib/api.js';
import { useEscape } from '../hooks/useApiResource.js';
import { copyToClipboard, formatCOP, formatDate, formatNumber, percent } from '../lib/format.js';

function Row({ label, value, mono = false, children }) {
  const isEmpty = value === null || value === undefined || value === '';
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <dt className="shrink-0 text-xs text-slate-500">{label}</dt>
      <dd className={`min-w-0 text-right text-xs font-medium text-slate-800 ${mono ? 'font-mono' : ''}`}>
        {children ?? (isEmpty ? <span className="font-normal text-slate-300">—</span> : value)}
      </dd>
    </div>
  );
}

function Panel({ title, icon: Icon, children }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <h3 className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5 text-xs font-bold tracking-wide text-slate-700 uppercase">
        {Icon ? <Icon className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" /> : null}
        {title}
      </h3>
      <dl className="divide-y divide-slate-50 px-4 py-2">{children}</dl>
    </section>
  );
}

/** Horizontal bar showing how much of the contract value has been paid. */
function ExecutionBar({ contrato, pagado, facturado }) {
  const pctPagado = percent(pagado, contrato);
  const pctFacturado = percent(facturado, contrato);
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-slate-600">
        <span>Ejecución financiera</span>
        <span className="tnum">{pctPagado}% pagado</span>
      </div>
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
        <div className="absolute inset-y-0 left-0 rounded-full bg-sky-300" style={{ width: `${Math.min(pctFacturado, 100)}%` }} />
        <div className="absolute inset-y-0 left-0 rounded-full bg-emerald-500" style={{ width: `${Math.min(pctPagado, 100)}%` }} />
      </div>
      <div className="mt-2 flex items-center gap-3 text-[10px] text-slate-500">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-emerald-500" /> Pagado {formatCOP(pagado)}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-sky-300" /> Facturado {formatCOP(facturado)}
        </span>
      </div>
    </div>
  );
}

/**
 * Right-hand detail drawer. The row data is shown immediately and the full
 * record (supervisor, legal representative, budget breakdown) is fetched by id
 * so the table query stays narrow.
 */
export default function ContractDetailDrawer({ contract, onClose }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEscape(Boolean(contract), onClose);

  useEffect(() => {
    setDetail(null);
    setError(null);
    setCopied(false);
  }, [contract?.id]);

  useEffect(() => {
    if (!contract?.id) return undefined;
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    api
      .contract(contract.id, contract.tipoRegistro ?? 'todos', controller.signal)
      .then((response) => {
        if (!active) return;
        setDetail(response.contract);
        setLoading(false);
      })
      .catch((err) => {
        if (!active || err?.name === 'AbortError') return;
        setError(err);
        setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [contract?.id, nonce]);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    if (!contract) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [contract]);

  const data = useMemo(() => detail ?? contract, [detail, contract]);
  const esConvocado = (data?.tipoRegistro ?? contract?.tipoRegistro) === 'convocado';

  if (!contract) return null;

  const handleCopy = async () => {
    const ok = await copyToClipboard(contract.id ?? '');
    setCopied(ok);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Detalle del registro">
      <div className="animate-fade absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />

      <div className="animate-drawer scroll-slim relative flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-slate-100 shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                {esConvocado ? (
                  <span className="inline-flex items-center rounded-md bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 ring-1 ring-inset ring-sky-600/20">
                    Convocado · sin adjudicar
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                    Adjudicado
                  </span>
                )}
                <EstadoBadge estado={data?.estado} />
                <CategoriaBadge categoria={data?.categoria} />
                {loading ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                    <Loader2 className="h-3 w-3 animate-spin" /> cargando detalle…
                  </span>
                ) : null}
              </div>
              <p className="line-clamp-3 text-sm leading-snug font-semibold text-slate-900" title={data?.objeto}>
                {data?.objeto || 'Sin objeto registrado'}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-1 font-mono">
                  <Hash className="h-3 w-3" aria-hidden="true" />
                  {data?.id ?? '—'}
                </span>
                {data?.referencia ? <span className="font-mono">Ref. {data.referencia}</span> : null}
                {data?.procesoDeCompra ? <span className="font-mono">{data.procesoDeCompra}</span> : null}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              aria-label="Cerrar detalle"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {data?.urlProceso ? (
              <Button as="a" href={data.urlProceso} target="_blank" rel="noopener noreferrer" size="sm">
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                Ver proceso en SECOP II
              </Button>
            ) : (
              <span className="text-[11px] text-slate-400">Este registro no publica una URL de proceso.</span>
            )}
            <Button variant="outline" size="sm" onClick={handleCopy}>
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              {copied ? 'Copiado' : 'Copiar ID'}
            </Button>
            {error ? (
              <Button variant="ghost" size="sm" onClick={() => setNonce((n) => n + 1)}>
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                Reintentar detalle
              </Button>
            ) : null}
          </div>

          {error ? (
            <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
              No fue posible cargar el detalle completo: {error.message} Se muestran los datos disponibles.
            </p>
          ) : null}
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 p-5">
          {esConvocado ? (
            /* Un proceso convocado todavía no tiene ejecución financiera: lo único
               que publica SECOP II es el precio base estimado. */
            <Panel title="Datos económicos del proceso" icon={Wallet}>
              <Row label="Precio base estimado" mono>
                <span className="text-sm font-bold text-slate-900">{formatCOP(data?.valores.contrato)}</span>
              </Row>
              <Row label="Valor total adjudicación" mono>{formatCOP(data?.valores.adjudicado)}</Row>
              <Row label="Número de lotes" mono>{formatNumber(data?.numeroLotes)}</Row>
              <Row label="Duración">
                {data?.duracion ? `${data.duracion} ${data.unidadDuracion ?? ''}`.trim() : null}
              </Row>
              <div className="mt-2 rounded-lg bg-sky-50 px-3 py-2 text-[11px] leading-snug text-sky-900">
                Un proceso en convocatoria no tiene valor pagado, facturado ni saldo CDP: esas cifras solo existen
                cuando el contrato se suscribe.
              </div>
            </Panel>
          ) : (
            <Panel title="Datos financieros" icon={Wallet}>
              {data ? (
                <ExecutionBar
                  contrato={data.valores.contrato}
                  pagado={data.valores.pagado}
                  facturado={data.valores.facturado}
                />
              ) : null}
              <div className="pt-2">
                <Row label="Valor del contrato" mono>
                  <span className="text-sm font-bold text-slate-900">{formatCOP(data?.valores.contrato)}</span>
                </Row>
                <Row label="Valor pagado" mono>{formatCOP(data?.valores.pagado)}</Row>
                <Row label="Valor facturado" mono>{formatCOP(data?.valores.facturado)}</Row>
                <Row label="Saldo CDP" mono>{formatCOP(data?.valores.saldoCdp)}</Row>
                <Row label="Pendiente de pago" mono>{formatCOP(data?.valores.pendientePago)}</Row>
                <Row label="Pendiente de ejecución" mono>{formatCOP(data?.valores.pendienteEjecucion)}</Row>
                <Row label="Pago adelantado" mono>{formatCOP(data?.valores.pagoAdelantado)}</Row>
                {loading && !detail ? (
                  <>
                    <div className="py-1.5"><Skeleton className="ml-auto h-4 w-32" /></div>
                    <div className="py-1.5"><Skeleton className="ml-auto h-4 w-28" /></div>
                  </>
                ) : (
                  <>
                    <Row label="Saldo de vigencia" mono>{formatCOP(data?.valores.saldoVigencia)}</Row>
                    <Row label="Valor amortizado" mono>{formatCOP(data?.valores.amortizado)}</Row>
                  </>
                )}
              </div>
            </Panel>
          )}

          {esConvocado && detail?.proceso ? (
            <Panel title="Estado de la convocatoria" icon={ClipboardList}>
              <Row label="Estado del procedimiento">{data?.estado?.raw}</Row>
              <Row label="Estado resumen">{detail.proceso.estadoResumen}</Row>
              <Row label="Fase">{detail.proceso.fase}</Row>
              <Row label="Apertura del proceso">{detail.proceso.apertura}</Row>
              <Row label="¿Adjudicado?">{detail.proceso.adjudicado ? 'Sí' : 'No'}</Row>
              <Row label="ID de adjudicación" mono>{detail.proceso.idAdjudicacion}</Row>
              <Row label="Proveedores invitados" mono>{formatNumber(detail.proceso.participantes?.invitados)}</Row>
              <Row label="Se manifestaron" mono>{formatNumber(detail.proceso.participantes?.manifestaron)}</Row>
              <Row label="Respuestas a la oferta" mono>{formatNumber(detail.proceso.participantes?.respuestas)}</Row>
            </Panel>
          ) : null}

          <Panel title="Entidad compradora" icon={Building2}>
            <Row label="Nombre">{data?.entidad.nombre}</Row>
            <Row label="NIT" mono>{data?.entidad.nit}</Row>
            <Row label="Orden">{data?.entidad.orden}</Row>
            <Row label="Sector">{data?.entidad.sector}</Row>
            {detail ? <Row label="Rama">{detail.entidad.rama}</Row> : null}
            {detail ? <Row label="Entidad centralizada">{detail.entidad.entidadCentralizada}</Row> : null}
            <Row label="Ubicación">
              <span className="inline-flex flex-wrap items-center justify-end gap-1">
                <DeptoBadge>{data?.entidad.departamento}</DeptoBadge>
                {data?.entidad.ciudad && data.entidad.ciudad !== 'No Definido' ? (
                  <span className="text-xs text-slate-600">{data.entidad.ciudad}</span>
                ) : null}
              </span>
            </Row>
          </Panel>

          <Panel title={esConvocado ? 'Proveedor' : 'Proveedor adjudicado'} icon={Users}>
            <Row label="Razón social">{data?.proveedor.nombre}</Row>
            {esConvocado ? (
              <>
                <Row label="NIT / documento" mono>{data?.proveedor.documento}</Row>
                <Row label="Departamento">{detail?.proveedor.departamento}</Row>
                <Row label="Ciudad">{detail?.proveedor.ciudad}</Row>
                <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-snug text-slate-500">
                  Mientras el proceso no se adjudique, SECOP II no publica proveedor ni representante legal.
                </div>
              </>
            ) : (
              <>
                <Row label="Tipo de documento">{data?.proveedor.tipoDocumento}</Row>
                <Row label="Documento" mono>{data?.proveedor.documento}</Row>
                {loading && !detail ? (
                  <div className="py-1.5"><Skeleton className="ml-auto h-4 w-40" /></div>
                ) : (
                  <>
                    <Row label="Representante legal">{detail?.proveedor.representanteLegal}</Row>
                    <Row label="Documento del representante" mono>
                      {detail?.proveedor.documentoRepresentante}
                    </Row>
                    <Row label="Domicilio del representante">{detail?.proveedor.domicilioRepresentante}</Row>
                  </>
                )}
                <Row label="Mipyme / Grupo">
                  {data?.proveedor.esPyme || data?.proveedor.esGrupo
                    ? [data.proveedor.esPyme ? 'Mipyme' : null, data.proveedor.esGrupo ? 'Grupo' : null]
                        .filter(Boolean)
                        .join(' · ')
                    : 'No'}
                </Row>
              </>
            )}
          </Panel>

          {!esConvocado ? (
            <Panel title="Supervisión y ordenación del gasto" icon={UserCheck}>
              {loading && !detail ? (
                <>
                  <div className="py-1.5"><Skeleton className="ml-auto h-4 w-44" /></div>
                  <div className="py-1.5"><Skeleton className="ml-auto h-4 w-36" /></div>
                </>
              ) : (
                <>
                  <Row label="Supervisor">{detail?.supervisor.nombre}</Row>
                  <Row label="Documento del supervisor" mono>{detail?.supervisor.documento}</Row>
                  <Row label="Ordenador del gasto">{detail?.ordenadorDelGasto.nombre}</Row>
                  <Row label="Documento del ordenador" mono>{detail?.ordenadorDelGasto.documento}</Row>
                  <Row label="Ordenador de pago">{detail?.ordenadorDePago.nombre}</Row>
                </>
              )}
            </Panel>
          ) : null}

          <Panel title={esConvocado ? 'Proceso y publicación' : 'Contrato y ejecución'} icon={ClipboardList}>
            <Row label="Modalidad">{data?.modalidad}</Row>
            <Row label="Tipo">{data?.tipoContrato}</Row>
            <Row label="Justificación de la modalidad">{data?.justificacionModalidad}</Row>
            <Row label={esConvocado ? 'Fecha de publicación' : 'Fecha de firma'}>{formatDate(data?.fechaFirma)}</Row>
            {esConvocado ? (
              <Row label="Última publicación">{formatDate(data?.ultimaActualizacion)}</Row>
            ) : (
              <>
                <Row label="Inicio del contrato">{formatDate(data?.fechaInicio)}</Row>
                <Row label="Fin del contrato">{formatDate(data?.fechaFin)}</Row>
                <Row label="Última actualización">{formatDate(data?.ultimaActualizacion)}</Row>
              </>
            )}
            {!esConvocado && detail ? <Row label="Duración">{detail.ejecucion.duracion}</Row> : null}
            {!esConvocado && detail ? (
              <Row label="Días adicionados" mono>{formatNumber(detail.valores.diasAdicionados)}</Row>
            ) : null}
            {!esConvocado && detail ? (
              <Row label="Condiciones de entrega">{detail.ejecucion.condicionesEntrega}</Row>
            ) : null}
            {!esConvocado && detail ? <Row label="Liquidación">{detail.ejecucion.liquidacion}</Row> : null}
            {!esConvocado && detail ? <Row label="Puede prorrogarse">{detail.ejecucion.prorrogable}</Row> : null}
          </Panel>

          {!esConvocado && detail ? (
            <Panel title="Origen de los recursos" icon={Banknote}>
              <Row label="Destino del gasto">{detail.destinoGasto}</Row>
              <Row label="Origen">{detail.origenRecursos}</Row>
              <Row label="Presupuesto General de la Nación" mono>{formatCOP(detail.valores.pgn)}</Row>
              <Row label="Recursos propios" mono>{formatCOP(detail.valores.recursosPropios)}</Row>
              <Row label="Recursos de crédito" mono>{formatCOP(detail.valores.recursosCredito)}</Row>
              <Row label="SGP" mono>{formatCOP(detail.valores.sgp)}</Row>
              <Row label="SGR" mono>{formatCOP(detail.valores.sgr)}</Row>
            </Panel>
          ) : null}

          {detail && (detail.pago.banco || detail.pago.numeroCuenta) ? (
            <Panel title="Información de pago" icon={Banknote}>
              <Row label="Banco">{detail.pago.banco}</Row>
              <Row label="Tipo de cuenta">{detail.pago.tipoCuenta}</Row>
              <Row label="Número de cuenta" mono>{detail.pago.numeroCuenta}</Row>
            </Panel>
          ) : null}

          <p className="pb-2 text-center text-[11px] text-slate-400">
            Fuente: SECOP II · Datos Abiertos Colombia · vista{' '}
            <span className="font-mono">jbjy-vk9h</span>. Los valores se publican tal como los reporta la entidad.
          </p>
        </div>
      </div>
    </div>
  );
}
