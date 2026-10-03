# SECOP II · Rastreo y monitoreo de contratos de Dotación e Insumos

Aplicación web para **rastrear, filtrar y analizar** los contratos públicos
colombianos relacionados con **Dotación, Vestuario, Calzado, Insumos y Elementos de
Protección Personal (EPP)**, consultando en vivo la API de Datos Abiertos Colombia
(Socrata) sobre la vista `jbjy-vk9h` de SECOP II.

![Fuente](https://img.shields.io/badge/fuente-datos.gov.co%20·%20jbjy--vk9h-059669)
![Node](https://img.shields.io/badge/node-%E2%89%A520-0F172A)

---

## Alcance

La aplicación trabaja **únicamente con los contratos de los 2 últimos años**
(730 días), que es a la vez la ventana por defecto y el tope máximo. El dataset
completo tiene ~6,1 millones de filas y un escaneo sin límite de fechas hace
timeout, así que el alcance acotado es también lo que mantiene las respuestas en
el orden de los segundos.

---

## Qué hace

**Panel de métricas**
- Contratos encontrados, con desglose de hoy, mes actual y últimos 30 días.
- Valor total contratado en COP, con promedio y contrato de mayor cuantía.
- Entidad con mayor presupuesto contratado y departamento con más contratos.

**Filtros dinámicos**
- **Tipo de registro: adjudicados / convocados / ambos.** Es el primer filtro del
  panel y **conmuta la fuente de datos**, no filtra una columna (ver más abajo).
- Rango de fechas por presets (hoy → 2 años) o personalizado, sobre
  `fecha_de_firma` / `fecha_de_publicacion_del` o `ultima_actualizacion`.
- Selector de **regla de negocio**: `estricto` (UNSPSC **y** texto),
  `solo categoría` o `solo texto`.
- Grupos UNSPSC seleccionables, con sus 16 códigos visibles.
- Palabras clave obligatorias y ampliaciones opcionales activables una a una.
- Departamento y ciudad (la lista de ciudades se carga bajo demanda y se consolida
  al elegir varios departamentos).
- Estado del contrato, modalidad de contratación, rango de cuantía (con atajos) y
  búsqueda libre.

**Tabla interactiva**
- Ordenamiento por columnas, paginación y tamaño de página.
- Formato de moneda colombiana, badges de estado por color, badge de departamento y
  de categoría UNSPSC.
- En el modo combinado, un distintivo por fila indica si es adjudicado o convocado.
- Las etiquetas se adaptan a la vista: «Fecha de firma» / «Publicación» y «Valor
  total» / «Precio base».
- Objeto del contrato recortado con botón **Ver más** en línea.
- Acciones por fila: abrir el detalle o ir al proceso en SECOP II.

**Detalle del registro**
- Panel lateral con datos de la entidad, del proveedor, financieros, supervisor y
  ordenador del gasto, ejecución, origen de recursos y datos de pago, más una barra
  de ejecución financiera.
- En un **proceso convocado** el panel cambia: muestra el estado de la convocatoria
  (estado resumen, fase, apertura, proveedores invitados y respuestas) y explica por
  qué no hay ejecución financiera todavía.
- Botón destacado al `urlproceso` original.

**Exportación**
- CSV (UTF-8 con BOM, acentos correctos), **Excel** (SpreadsheetML con hoja
  «Contratos» y hoja «Resumen»), JSON y PDF vía impresión del navegador.
- Siempre sobre **todo el conjunto filtrado**, no solo la página visible.

**Gráficas** — evolución mensual (contratos y valor), mezcla por categoría UNSPSC,
entidades con mayor valor contratado y distribución por estado.

---

## Requisitos

- **Node.js ≥ 20** (usa `fetch` nativo). Probado con Node 22.
- Acceso a internet hacia `www.datos.gov.co`.
- Opcional pero **muy recomendado**: un *app token* de Socrata.

---

## Instalación y ejecución

```bash
npm install
cp .env.example .env      # opcional: configure SOCRATA_APP_TOKEN
npm run build             # compila la interfaz en client/dist
npm start                 # servidor en http://localhost:3001
```

Abre <http://localhost:3001>.

### Modo desarrollo

```bash
npm run dev
```

Levanta la API en `:3001` (con recarga por `--watch`) y Vite en `:5173` con proxy
de `/api` hacia la API. Use <http://localhost:5173> durante el desarrollo.

### Scripts

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | API + cliente en modo desarrollo (recarga en caliente) |
| `npm run build` | Compila el cliente en `client/dist` |
| `npm start` | Sirve la API y el cliente compilado en un solo puerto |
| `npm run check` | **Preflight contra Socrata, sin servidor**: afirma los cuatro comportamientos del dataset en los que se apoya el código |
| `npm run check:web` | Verifica que el cliente compilado se sirva bien y que el filtro por defecto devuelva datos usables |
| `npm run check:modes` | Verifica los modos de la regla de negocio y sus topes de ventana |
| `npm run check:fuentes` | Verifica el filtro convocados / adjudicados / ambos y las facetas por fuente |
| `npm run smoke` | Suite de integración contra la API local (requiere el servidor en marcha) |

---

## Estructura del proyecto

```
server/                     API (Node + Express)
  config.js                 Configuración y guardarraíles de consulta
  index.js                  Servidor, estáticos y precalentamiento de caché
  domain/
    catalog.js              Catálogo UNSPSC, palabras clave y normalizadores
    soql.js                 Construcción de SoQL (where, orden, texto libre)
    filters.js              Validación de parámetros y alcance de 2 años
    normalize.js            Mapeo de filas crudas de Socrata a la forma de la API
  socrata/client.js         Cliente HTTP: caché, reintentos, timeout, app token
  services/
    contracts.js            Búsqueda, detalle, KPIs, facets y exportación
    exporters.js            CSV, Excel (SpreadsheetML) y JSON
  routes/api.js             Rutas REST
client/                     Interfaz (React + Vite + Tailwind v4)
  src/
    App.jsx                 Orquestación de estado y datos
    lib/                    api.js, filters.js (modelo), format.js (COP/fechas)
    hooks/                  useApiResource (con aborto), useDebounced
    components/             Header, KpiCards, FilterPanel, ContractsTable,
                            ContractDetailDrawer, ChartsPanel, ExportButtons
    components/ui/          Primitivas (Badge, Button, Card, Skeleton, MultiSelect)
scripts/                    Sondeo, preflight y pruebas
docs/NOTAS-DATOS.md         Hallazgos verificados sobre el dataset
```

---

## Convocados y adjudicados: dos vistas, no dos estados

Es la decisión de diseño menos evidente del proyecto, así que conviene entenderla
antes de tocar el código.

**`jbjy-vk9h` (contratos) solo contiene contratos ya suscritos.** De los 1.393
registros del filtro de negocio a 2 años, los 1.393 tienen proveedor adjudicado y
ninguno carece de fecha de firma; entre sus estados no hay **ninguno** de
convocatoria. Un proceso que aún no se ha adjudicado no existe en esa vista.

**Los convocados viven en `p6dx-8zbt` (Procesos de contratación)** — 9.249.545
registros con `adjudicado` ("Si"/"No"), `estado_del_procedimiento` (Publicado,
Evaluación, Seleccionado, Cancelado…), `precio_base` y `valor_total_adjudicacion`.

Por eso el filtro «tipo de registro» **conmuta la fuente** en lugar de filtrar una
columna, y `server/domain/sources.js` traduce cada concepto a su nombre de campo real,
porque no coinciden entre vistas:

| Concepto | Contratos (`jbjy-vk9h`) | Procesos (`p6dx-8zbt`) |
| --- | --- | --- |
| Identificador | `id_contrato` | `id_del_proceso` |
| Fecha | `fecha_de_firma` | `fecha_de_publicacion_del` |
| Categoría UNSPSC | `codigo_de_categoria_principal` | `codigo_principal_de_categoria` |
| Texto del objeto | `objeto_del_contrato`, `descripcion_del_proceso` | `descripci_n_del_procedimiento`, `nombre_del_procedimiento` |
| Entidad | `nombre_entidad` | `entidad` |
| Estado | `estado_contrato` | `estado_del_procedimiento` |
| Valor | `valor_del_contrato` | `precio_base` |

El prefijo `V1.` del código UNSPSC aparece en **ambas** vistas, así que el mismo
`like '%<codigo>%'` sirve para las dos. Es lo único que se comporta igual.

Con el filtro de negocio y 2 años de ventana:

| Tipo de registro | Registros | Valor | Tiempo |
| --- | --- | --- | --- |
| Adjudicados | 1.393 | $445.821 M COP (valor contratado) | ~2,7 s |
| Convocados (`adjudicado = 'No'`) | 3.148 | $678.159 M COP (precio base) | ~9 s |
| Ambos | 4.543 | $1.123.981 M COP | ~10 s |

El modo **ambos** no se puede resolver con una sola consulta SoQL: son datasets
distintos. El servidor materializa los dos conjuntos y los fusiona en memoria, con un
tope de 6.000 filas por vista. Es viable porque los volúmenes son modestos.

Los **estados y las modalidades son vocabularios distintos** en cada vista, así que
las opciones de los filtros se calculan por fuente y de forma perezosa
(`/api/meta?tipoRegistro=…`); en el modo combinado se ofrece la unión.

---

## La regla de negocio

1. **Categoría UNSPSC principal** — 16 códigos agrupados en cuatro familias:
   Calzado / Botas, Vestuario / Uniformes, Medias / Ropa Interior y EPP / Seguridad
   Industrial.
2. **Filtro estricto por texto** — coincidencia de palabras clave
   (`DOTACION`, `DOTACIÓN`, `INSUMOS`, `UNIFORMES`, `CALZADO`, `VESTUARIO`,
   `ELEMENTOS DE PROTECCION`, `OVEROLES`, `EPP`) sobre `objeto_del_contrato`
   **o** `descripcion_del_proceso`.

El modo `estricto` combina ambas con `AND`. Como el `AND` de palabras clave es la
mitad restrictiva, la interfaz permite pasar a `solo categoría` o a `solo texto`.

**Cada modo tiene su propia ventana máxima, medida contra el endpoint real:**

| Modo | Qué exige | Contratos (2 años) | Ventana máxima |
| --- | --- | --- | --- |
| `estricto` *(por defecto)* | UNSPSC **y** texto | 1.393 | 730 días (2,7 s) |
| `solo categoría` | UNSPSC | 1.889 | 730 días (2,7 s) |
| `solo texto` | texto | 16.943 (a 365 d) | **90 días** (≈13 s) |

El motivo es que la restricción de categoría es también una ayuda al optimizador de
Socrata: sin ella, `upper(col) like '%…%'` acaba escaneando las 6,1 M de filas y la
consulta no termina. Por eso `solo texto` se recorta a 90 días — y el servidor lo
informa en `query.filters.windowClamped` para que la interfaz lo avise en pantalla.

**No existe un modo «amplio» (`UNSPSC OR texto`)** porque está medido que es
inviable: ese `OR` impide usar el filtro de categoría y tarda **32 s con solo 90
días** de ventana, 58 s con 180 y no termina nunca a 2 años. Un modo que devuelve
`502` de forma sistemática es peor que no ofrecerlo. Si hiciera falta, habría que
implementarlo como unión de dos consultas viables, no como un `OR` en SoQL.

---

## API

Base: `/api`. Todos los parámetros de filtro son los mismos en `/contracts`,
`/summary` y las exportaciones.

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/api/health` | Estado del servicio, alcance, si hay app token y frescura del dataset |
| `GET` | `/api/meta` | Catálogo de categorías y palabras clave + opciones de los filtros de la vista activa (`?tipoRegistro=`) |
| `GET` | `/api/contracts` | Búsqueda paginada con agregados del conjunto completo |
| `GET` | `/api/contracts/:id` | Detalle completo de un contrato |
| `GET` | `/api/summary` | KPIs y series para el tablero |
| `GET` | `/api/ciudades` | Ciudades de un departamento (bajo demanda) |
| `GET` | `/api/export.csv` · `export.xls` · `export.json` | Exportación del conjunto filtrado |
| `POST` | `/api/cache/clear` | Vacía las cachés en memoria |

### Parámetros de filtro

| Parámetro | Valores | Por defecto |
| --- | --- | --- |
| `tipoRegistro` | `adjudicados`, `convocados`, `todos` | `adjudicados` |
| `from`, `to` | `YYYY-MM-DD` | últimos 730 días |
| `dateField` | `fecha_de_firma`, `ultima_actualizacion` | `fecha_de_firma` |
| `scope` | `strict`, `category`, `keyword` | `strict` |
| `groups` | `calzado, vestuario, medias, epp` | todas |
| `extraKeywords` | palabras clave adicionales | — |
| `optionalKeywords` | `true` para activar todas las ampliaciones | `false` |
| `departamento`, `ciudad`, `estado`, `modalidad` | listas separadas por coma | — |
| `minValor`, `maxValor` | número (COP) | — |
| `q` | texto libre | — |
| `sort`, `dir` | columna permitida, `asc`/`desc` | `fecha_de_firma desc` |
| `page`, `pageSize` | entero | `1`, `25` |

Ejemplos:

```bash
# Contratos de EPP en Antioquia del último año, ordenados por valor
curl "http://localhost:3001/api/contracts?departamento=Antioquia&groups=epp\
&from=2025-10-02&to=2026-10-02&sort=valor_del_contrato&dir=desc&pageSize=10"

# Búsqueda insensible a tildes sobre entidad, proveedor o NIT
curl "http://localhost:3001/api/contracts?q=dotacion"
```

---

## Notas sobre los datos (leer antes de tocar las consultas)

Los cuatro comportamientos que más tiempo cuestan si se descubren por las malas.
El detalle completo, con la evidencia medida, está en
**[`docs/NOTAS-DATOS.md`](docs/NOTAS-DATOS.md)**.

1. **Los códigos UNSPSC llevan prefijo de versión.** `codigo_de_categoria_principal`
   vale `"V1.53111600"`, no `"53111600"`. Por eso
   `codigo_de_categoria_principal in ('53111600')` devuelve **cero filas**, y todas
   las predicciones de categoría se construyen como `like '%53111600%'` — exacto en
   la práctica, porque los códigos UNSPSC son de 8 dígitos fijos.

2. **`nit_entidad` y `codigo_entidad` son numéricos para SoQL**, aunque la cabecera
   `x-soda2-types` diga `text`. Aplicarles `upper()` o `coalesce()` aborta **toda**
   la consulta con `type-mismatch`, así que están excluidos de la búsqueda de texto
   libre y el NIT se busca con igualdad numérica.

3. **`like` acepta `_` como comodín de un carácter**, y se usa a propósito para la
   búsqueda sin tildes: como un acento cambia exactamente un carácter,
   `like '%DOTACI_N%'` cubre tanto `DOTACION` como `DOTACIÓN`. Cubre **un acento por
   palabra**; por eso el catálogo de palabras clave fija ambas grafías a mano.

4. **El dataset va rezagado.** Se publica con uno o más días de retraso, así que
   «contratos de hoy» y «de este mes» pueden ser **0 legítimamente**. La señal de
   corto plazo útil es el KPI de últimos 30 días.

5. **El coste depende críticamente del modo de la regla de negocio**, porque la
   restricción de categoría también ayuda al optimizador de Socrata. Ver la tabla
   de la sección anterior: es la razón de que existan topes de ventana por modo y
   de que no haya un modo «amplio».

6. **«Convocado» y «adjudicado» son datasets distintos**, no dos estados de una misma
   tabla. Ver la sección «Convocados y adjudicados» más arriba.

Además: `valor_del_contrato` llega como *string* y hay que coercionarlo;
`urlproceso` llega como objeto `{url: …}`; y columnas de texto usan centinelas
(`"No Definido"`, `"Sin Descripcion"`, `"UNSPECIFIED"`) que el normalizador
convierte a `null` para que la interfaz no los muestre como datos reales.

---

## Rendimiento y límites

- **Caché agresiva en memoria**: búsquedas 3 min, resumen 10 min, opciones de
  filtros 6 h. Las consultas idénticas concurrentes se colapsan en una sola
  petición a Socrata.
- **Precalentamiento al arrancar**: el resumen, la primera página y las opciones se
  calculan en segundo plano (`WARMUP_ON_START`), de forma secuencial para no
  disparar un pico de peticiones.
- **Sin app token Socrata limita por IP.** Una ráfaga de consultas sin caché produce
  timeouts y errores `502 upstream_error`. Defina `SOCRATA_APP_TOKEN` en producción
  (es gratis e inmediato en
  <https://www.datos.gov.co/profile/edit/developer_settings>). El token nunca llega
  al navegador: solo el servidor lo envía, y `/api/health` únicamente informa si
  está configurado.
- **Las ventanas fuera del tope se recortan**, no se rechazan. Cada respuesta incluye
  `query.filters` con el rango realmente consultado, para poder auditarlo.
- El cliente se divide en dos *chunks*: la interfaz inicial (≈66 kB gzip) y las
  gráficas con Recharts (≈117 kB gzip), cargadas bajo demanda.

---

## Notas del entorno de desarrollo en Windows

Esta máquina tiene tres particularidades que conviene conocer si algo falla:

1. **`curl.exe` e `Invoke-RestMethod` no funcionan** (fallan con
   `schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS`), y afecta a
   *cualquier* destino HTTPS, no solo a datos.gov.co. Node usa su propio OpenSSL, así
   que **`fetch` de Node y `npm` funcionan con normalidad**. Por eso los scripts de
   verificación están escritos en Node y no en PowerShell.

2. **La caché de npm debe vivir dentro del proyecto.** El sandbox deniega escrituras
   fuera del directorio de trabajo, y la caché por defecto (`%LOCALAPPDATA%\npm-cache`)
   provoca `EPERM`. Use:
   ```bash
   npm install --cache .npm-cache
   ```

3. **`npm run build` puede requerir permisos ampliados**, porque esbuild lanza su
   binario con *stdio* por tubería y un sandbox restrictivo lo bloquea con
   `spawn EPERM`. Si el build falla con ese error, ejecútelo fuera del sandbox o con
   acceso completo.

---

## Limitaciones conocidas

- **La interfaz no se pudo verificar renderizada en un navegador** desde el entorno
  donde se desarrolló: no había navegador ni forma de instalar un DOM simulado
  (`jsdom`). Están verificados la compilación (2.380 módulos, sin errores de
  importación ni exportación), el CSS compilado, el servido de los recursos con sus
  tipos MIME y caché, el fallback de SPA y el contrato de datos de extremo a extremo
  mediante 48 comprobaciones sobre la API. La verificación visual y de interacción
  queda pendiente de abrir <http://localhost:3001> en un navegador.
- No se incluye autenticación: la API es de solo lectura y no expone datos privados,
  pero si se publica en internet conviene restringir `/api/cache/clear` y añadir
  límite de tasa.
- La exportación se acota a `EXPORT_MAX_ROWS` (20.000) filas; por encima, el archivo
  se marca como truncado en la hoja «Resumen» y en la cabecera `X-Truncated`.

---

## Fuente

Datos Abiertos Colombia — SECOP II, vista `jbjy-vk9h`
(<https://www.datos.gov.co/Contrataci%C3%B3n/SECOP-II/jbjy-vk9h>). Los valores se
presentan tal como los reporta cada entidad; esta aplicación no los corrige ni los
interpreta.
