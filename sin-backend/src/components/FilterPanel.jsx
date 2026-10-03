import { CalendarDays, Filter, Info, Layers, MapPin, Search, Tag, Wallet, X } from 'lucide-react';
import { Button, Field } from './ui/index.jsx';
import MultiSelect from './ui/MultiSelect.jsx';
import { PRESETS, clampRangeToDays, countActiveFilters, rangeForPreset, toggleValue } from '../lib/filters.js';

/**
 * Tipos de registro.
 *
 * «Convocado» y «adjudicado» NO son dos estados de un mismo conjunto: son dos
 * vistas distintas de SECOP II. La de contratos (`jbjy-vk9h`) solo contiene
 * contratos ya suscritos —los 1.393 registros tienen proveedor y fecha de firma, y
 * no existe en ella ningún estado de convocatoria—, mientras que los procesos en
 * convocatoria están en `p6dx-8zbt`. Por eso este control conmuta la fuente de
 * datos en lugar de filtrar una columna.
 */
const TIPOS_REGISTRO = [
  {
    id: 'adjudicados',
    label: 'Adjudicados',
    badge: 'Contratos',
    hint: 'Contratos ya suscritos: tienen proveedor adjudicado y fecha de firma.',
  },
  {
    id: 'convocados',
    label: 'Convocados',
    badge: 'Procesos',
    hint: 'Procesos publicados que todavía no se han adjudicado.',
  },
  {
    id: 'todos',
    label: 'Ambos',
    badge: 'Unión',
    hint: 'Las dos vistas juntas. El servidor las consulta por separado y las fusiona.',
  },
];

/**
 * Modos de la regla de negocio.
 *
 * No se ofrece un modo «amplio» (UNSPSC **o** texto) porque está medido que es
 * inviable: el `OR` entre ambas cláusulas impide que Socrata use el filtro de
 * categoría y la consulta tarda 32 s incluso con solo 90 días de ventana. Ver
 * `scripts/probe-scopes.mjs`.
 */
const SCOPES = [
  {
    id: 'strict',
    label: 'Estricto',
    hint: 'Categoría UNSPSC Y palabras clave. Es la regla del negocio y cubre los 2 años.',
    maxDays: 730,
  },
  {
    id: 'category',
    label: 'Solo categoría',
    hint: 'Únicamente los códigos UNSPSC de dotación, vestuario, calzado y EPP. Cubre los 2 años.',
    maxDays: 730,
  },
  {
    id: 'keyword',
    label: 'Solo texto',
    hint: 'Solo coincidencias de texto. Sin el filtro de categoría la consulta escanea todo el dataset: limitado a 90 días.',
    maxDays: 90,
  },
];

const VALOR_RANGOS = [
  { label: '< $50 M', min: null, max: 50_000_000 },
  { label: '$50 M – $200 M', min: 50_000_000, max: 200_000_000 },
  { label: '$200 M – $1.000 M', min: 200_000_000, max: 1_000_000_000 },
  { label: '> $1.000 M', min: 1_000_000_000, max: null },
];

function Section({ title, icon: Icon, children, action }) {
  return (
    <div className="border-b border-slate-200 px-4 py-4 last:border-b-0">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-slate-700 uppercase">
          {Icon ? <Icon className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" /> : null}
          {title}
        </h3>
        {action}
      </div>
      {children}
    </div>
  );
}

/**
 * Left-hand filter sidebar. Every control maps 1:1 to a documented API query
 * parameter, so what the user sees is exactly what is sent to SECOP II.
 */
export default function FilterPanel({
  filters,
  onChange,
  meta,
  ciudades,
  loadingCiudades,
  onClear,
  className = '',
}) {
  const activeCount = countActiveFilters(filters);
  const categories = meta?.categories ?? [];
  const options = meta?.options ?? {};
  const requiredKeywords = meta?.keywords?.required ?? [];
  const optionalKeywords = meta?.keywords?.optional ?? [];

  const set = (patch) => onChange({ ...patch, page: 1 });

  const setPreset = (preset) => {
    if (preset === 'custom') {
      set({ preset });
      return;
    }
    set({ preset, ...rangeForPreset(preset) });
  };

  return (
    <aside className={`flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <Filter className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          Filtros
          {activeCount > 0 ? (
            <span className="tnum rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">
              {activeCount}
            </span>
          ) : null}
        </h2>
        {activeCount > 0 ? (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-rose-600"
          >
            <X className="h-3 w-3" aria-hidden="true" />
            Limpiar
          </button>
        ) : null}
      </div>

      <div className="scroll-slim max-h-[calc(100vh-9rem)] flex-1 overflow-y-auto">
        {/* ---------------- Tipo de registro ---------------- */}
        <Section
          title="Tipo de registro"
          icon={Layers}
          action={
            <span className="text-[10px] font-medium text-slate-400" title="Convocados y adjudicados viven en vistas distintas de SECOP II">
              dos vistas
            </span>
          }
        >
          <div className="grid grid-cols-3 gap-1.5">
            {TIPOS_REGISTRO.map((tipo) => {
              const activo = filters.tipoRegistro === tipo.id;
              return (
                <button
                  key={tipo.id}
                  type="button"
                  title={tipo.hint}
                  onClick={() => onChange({ ...filters, tipoRegistro: tipo.id, page: 1, estados: [], modalidades: [] })}
                  className={`rounded-lg border px-2 py-2 text-center transition-colors ${
                    activo
                      ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
                      : 'border-slate-300 bg-white text-slate-600 hover:border-emerald-400 hover:text-emerald-700'
                  }`}
                >
                  <span className="block text-xs font-semibold">{tipo.label}</span>
                  <span className={`mt-0.5 block text-[10px] ${activo ? 'text-emerald-50' : 'text-slate-400'}`}>
                    {tipo.badge}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] leading-snug text-slate-500">
            {TIPOS_REGISTRO.find((t) => t.id === filters.tipoRegistro)?.hint}
          </p>
          <p className="mt-1.5 text-[11px] leading-snug text-slate-400">
            En convocados el valor mostrado es el <strong className="font-semibold">precio base</strong> del
            proceso y la fecha es la de <strong className="font-semibold">publicación</strong>, no la de firma.
          </p>
        </Section>

        {/* ---------------- Free text ---------------- */}
        <Section title="Búsqueda libre" icon={Search}>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={filters.q}
              onChange={(e) => set({ q: e.target.value })}
              placeholder="Entidad, proveedor, objeto, NIT…"
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pr-3 pl-9 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-slate-400">
            Busca en nombre de entidad, proveedor adjudicado, objeto, descripción, identificadores y NIT. No
            distingue mayúsculas ni tildes.
          </p>
        </Section>

        {/* ---------------- Dates ---------------- */}
        <Section title="Rango de fechas" icon={CalendarDays}>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setPreset(preset.id)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  filters.preset === preset.id
                    ? 'border-emerald-600 bg-emerald-600 text-white'
                    : 'border-slate-300 bg-white text-slate-600 hover:border-emerald-400 hover:text-emerald-700'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Desde" htmlFor="filtro-desde">
              <input
                id="filtro-desde"
                type="date"
                value={filters.from}
                max={filters.to}
                onChange={(e) => set({ from: e.target.value, preset: 'custom' })}
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              />
            </Field>
            <Field label="Hasta" htmlFor="filtro-hasta">
              <input
                id="filtro-hasta"
                type="date"
                value={filters.to}
                min={filters.from}
                onChange={(e) => set({ to: e.target.value, preset: 'custom' })}
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              />
            </Field>
          </div>
          <div className="mt-3">
            <Field label="Campo de fecha" htmlFor="filtro-datefield">
              <select
                id="filtro-datefield"
                value={filters.dateField}
                onChange={(e) => set({ dateField: e.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              >
                <option value="fecha_de_firma">Fecha de firma</option>
                <option value="ultima_actualizacion">Última actualización</option>
              </select>
            </Field>
          </div>
        </Section>

        {/* ---------------- Business rule ---------------- */}
        <Section
          title="Regla de negocio"
          icon={Info}
          action={
            <span className="text-[10px] font-medium text-slate-400" title="Cómo se combinan la categoría UNSPSC y el filtro de texto">
              UNSPSC × texto
            </span>
          }
        >
          <div className="space-y-1.5">
            {SCOPES.map((scope) => (
              <label
                key={scope.id}
                className={`flex cursor-pointer gap-2.5 rounded-lg border p-2.5 transition-colors ${
                  filters.scope === scope.id
                    ? 'border-emerald-500 bg-emerald-50/60'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="scope"
                  value={scope.id}
                  checked={filters.scope === scope.id}
                  onChange={() => {
                    // Al cambiar a un modo con un tope menor, recorta el rango aquí
                    // para que la interfaz muestre lo que de verdad se consultará.
                    const next = clampRangeToDays(filters.from, filters.to, scope.maxDays);
                    onChange({
                      ...filters,
                      scope: scope.id,
                      ...next,
                      page: 1,
                      ...(next.clamped ? { preset: 'custom' } : {}),
                    });
                  }}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-emerald-600"
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                    {scope.label}
                    <span className="tnum rounded bg-slate-100 px-1 text-[10px] font-medium text-slate-500">
                      {scope.maxDays === 730 ? '2 años' : `${scope.maxDays} días`}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">{scope.hint}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-snug text-slate-400">
            El modo «Solo texto» no puede usar el filtro de categoría para reducir el conjunto, así que su
            ventana se recorta automáticamente a 90 días para que la consulta responda a tiempo.
          </p>
        </Section>

        {/* ---------------- UNSPSC groups ---------------- */}
        <Section
          title="Categoría UNSPSC"
          icon={Tag}
          action={
            filters.groups.length > 0 ? (
              <button
                type="button"
                onClick={() => set({ groups: [] })}
                className="text-[11px] font-medium text-slate-500 hover:text-emerald-700"
              >
                Todas
              </button>
            ) : null
          }
        >
          <div className="space-y-1.5">
            {categories.map((group) => {
              const checked = filters.groups.includes(group.id);
              const disabled = filters.scope === 'keyword';
              return (
                <label
                  key={group.id}
                  className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition-colors ${
                    checked ? 'border-emerald-500 bg-emerald-50/60' : 'border-slate-200 hover:bg-slate-50'
                  } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => set({ groups: toggleValue(filters.groups, group.id) })}
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-emerald-600"
                  />
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-slate-800">{group.label}</span>
                    <span className="tnum mt-0.5 block text-[10px] leading-snug text-slate-400">
                      {group.codes.map((c) => c.code).join(' · ')}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] leading-snug text-slate-400">
            {filters.groups.length === 0
              ? 'Sin selección: se consultan los 16 códigos UNSPSC del catálogo.'
              : `${filters.groups.length} de ${categories.length} grupos seleccionados.`}
            {filters.scope === 'keyword' ? ' No aplica en el modo «Solo texto».' : ''}
          </p>
        </Section>

        {/* ---------------- Keywords ---------------- */}
        <Section title="Palabras clave" icon={Tag}>
          <p className="mb-2 text-[11px] leading-snug text-slate-500">
            Obligatorias en la regla estricta:
          </p>
          <div className="mb-3 flex flex-wrap gap-1">
            {requiredKeywords.map((keyword) => (
              <span
                key={keyword}
                className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600 ring-1 ring-inset ring-slate-500/15"
              >
                {keyword}
              </span>
            ))}
          </div>
          <p className="mb-2 text-[11px] leading-snug text-slate-500">
            Ampliaciones opcionales (aumentan la cobertura):
          </p>
          <div className="flex flex-wrap gap-1">
            {optionalKeywords.map((keyword) => {
              const active = filters.extraKeywords.includes(keyword);
              const disabled = filters.scope === 'category';
              return (
                <button
                  key={keyword}
                  type="button"
                  disabled={disabled}
                  onClick={() => set({ extraKeywords: toggleValue(filters.extraKeywords, keyword) })}
                  className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] ring-1 ring-inset transition-colors ${
                    active
                      ? 'bg-emerald-600 text-white ring-emerald-600'
                      : 'bg-white text-slate-600 ring-slate-300 hover:ring-emerald-400'
                  } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                  {keyword}
                </button>
              );
            })}
          </div>
        </Section>

        {/* ---------------- Location ---------------- */}
        <Section title="Ubicación" icon={MapPin}>
          <div className="space-y-3">
            <Field label="Departamento">
              <MultiSelect
                options={options.departamentos ?? []}
                selected={filters.departamentos}
                onChange={(next) => set({ departamentos: next, ciudades: [] })}
                placeholder="Todos los departamentos"
                searchPlaceholder="Buscar departamento…"
              />
            </Field>
            <Field
              label="Ciudad / municipio"
              hint={
                filters.departamentos.length === 0
                  ? 'Seleccione primero un departamento para acotar la lista; aun así puede elegir cualquier ciudad.'
                  : undefined
              }
            >
              <MultiSelect
                options={ciudades}
                selected={filters.ciudades}
                onChange={(next) => set({ ciudades: next })}
                placeholder={loadingCiudades ? 'Cargando ciudades…' : 'Todas las ciudades'}
                searchPlaceholder="Buscar ciudad…"
                disabled={loadingCiudades && ciudades.length === 0}
                emptyMessage={loadingCiudades ? 'Cargando…' : 'Sin ciudades para este departamento'}
              />
            </Field>
          </div>
        </Section>

        {/* ---------------- Status + modality ---------------- */}
        <Section title="Estado y modalidad" icon={Filter}>
          <div className="space-y-3">
            <Field label="Estado del contrato">
              <MultiSelect
                options={options.estados ?? []}
                selected={filters.estados}
                onChange={(next) => set({ estados: next })}
                placeholder="Todos los estados"
                searchable={false}
              />
            </Field>
            <Field label="Modalidad de contratación">
              <MultiSelect
                options={options.modalidades ?? []}
                selected={filters.modalidades}
                onChange={(next) => set({ modalidades: next })}
                placeholder="Todas las modalidades"
                searchPlaceholder="Buscar modalidad…"
              />
            </Field>
          </div>
        </Section>

        {/* ---------------- Amount ---------------- */}
        <Section title="Rango de cuantía" icon={Wallet}>
          <div className="mb-3 grid grid-cols-2 gap-1.5">
            {VALOR_RANGOS.map((rango) => {
              const active = filters.minValor === rango.min && filters.maxValor === rango.max;
              return (
                <button
                  key={rango.label}
                  type="button"
                  onClick={() =>
                    set(
                      active
                        ? { minValor: null, maxValor: null }
                        : { minValor: rango.min, maxValor: rango.max },
                    )
                  }
                  className={`rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-colors ${
                    active
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : 'border-slate-300 bg-white text-slate-600 hover:border-emerald-400'
                  }`}
                >
                  {rango.label}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Mínimo (COP)" htmlFor="filtro-min">
              <input
                id="filtro-min"
                type="number"
                min="0"
                step="1000000"
                inputMode="numeric"
                value={filters.minValor ?? ''}
                onChange={(e) => set({ minValor: e.target.value === '' ? null : Number(e.target.value) })}
                placeholder="0"
                className="tnum w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              />
            </Field>
            <Field label="Máximo (COP)" htmlFor="filtro-max">
              <input
                id="filtro-max"
                type="number"
                min="0"
                step="1000000"
                inputMode="numeric"
                value={filters.maxValor ?? ''}
                onChange={(e) => set({ maxValor: e.target.value === '' ? null : Number(e.target.value) })}
                placeholder="Sin límite"
                className="tnum w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              />
            </Field>
          </div>
        </Section>

        {activeCount > 0 ? (
          <div className="px-4 py-4">
            <Button variant="outline" size="sm" className="w-full" onClick={onClear}>
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Restablecer {activeCount} {activeCount === 1 ? 'filtro' : 'filtros'}
            </Button>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
