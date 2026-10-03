# Notas sobre los datos de SECOP II (vista jbjy-vk9h)

Documento técnico para quien vaya a tocar la **capa de consultas** de esta aplicación
(`server/socrata/client.js`, `server/domain/soql.js`, `server/domain/catalog.js`,
`server/services/contracts.js`).

Todo lo que sigue está **verificado contra el endpoint en vivo**, no inferido de la
documentación de Socrata. Cada hallazgo incluye la evidencia (consulta y números
observados) y, sobre todo, su **consecuencia**: qué se rompe si se ignora. Las
consultas están escritas en SoQL tal como se enviaron.

Coordenadas de la fuente:

| Dato | Valor |
| --- | --- |
| Portal | `https://www.datos.gov.co` |
| Vista (dataset) | `jbjy-vk9h` (SECOP II) |
| Endpoint | `https://www.datos.gov.co/resource/jbjy-vk9h.json` |
| Filas totales | **6.092.927** |
| Fecha de las mediciones | 2026-10-02 (la mayoría de las ventanas se midieron sobre 30/90/365/730/1095 días terminando en esa fecha) |

> **Alcance del aplicativo.** Por decisión de producto, esta aplicación trabaja
> **únicamente con los contratos de los 2 últimos años**: 730 días es a la vez la
> ventana por defecto (`DEFAULT_WINDOW_DAYS`) y el tope máximo (`MAX_WINDOW_DAYS`).
> Los desplegables de filtros se calculan sobre ese mismo alcance
> (`FACET_WINDOW_DAYS=730`). Las mediciones de este documento que usan ventanas de
> 90 o 365 días se conservan porque fueron la evidencia que llevó a fijar esos
> topes, pero ya no son el comportamiento por defecto.

> Las cifras de este documento son fotografías de un dataset que **se actualiza a
> diario**. Para reproducirlas hay que volver a ejecutar los scripts de sondeo de la sección
> final con las fechas ajustadas al día en curso; los scripts llevan las fechas
> codificadas y por eso sus números absolutos cambian con el tiempo.

---

## Resumen: hallazgo → consecuencia

| # | Hallazgo | Consecuencia directa en el código |
| --- | --- | --- |
| (a) | `codigo_de_categoria_principal` no es un código UNSPSC limpio: lleva prefijo de versión (`"V1.53111600"`) | Toda predicción de categoría es `like '%<codigo>%'`; `in ('53111600')` devuelve **cero** filas (`buildCategoryClause`) |
| (b) | `nit_entidad` y `codigo_entidad` son **numéricos** para SoQL (aunque la cabecera diga `text`) | Se excluyen de la búsqueda de texto libre; el NIT se busca con igualdad numérica. Un solo `upper()` mal puesto aborta **toda** la consulta |
| (c) | `like` acepta `_` como comodín de un carácter | La búsqueda es insensible a acentos generando variantes con `_`; cubre **un acento por palabra**, no más |
| (d) | Dimensiones y medidas: `valor_del_contrato` llega como string, `urlproceso` como objeto, y hay valores centinela | Hay que coercionar con `Number()` / `toNumber()` y extraer la URL del objeto; los centinelas se normalizan a `null` |
| (e) | El dataset va **rezagado** respecto a la fecha actual | `contratosHoy` y `contratosMes` pueden ser 0 legítimamente; la señal corta es `contratos30d` |
| (f) | El filtro estricto cuesta ~1–3 s y una ventana sin límite hace timeout | `MAX_WINDOW_DAYS=730` (2 años) y las ventanas se **recortan** (no se rechazan) en `clampWindow()` |
| (g) | Sin app token hay límite de peticiones por IP | `SOCRATA_APP_TOKEN` en producción + caché agresiva (3 min / 10 min / 6 h) y colapso de consultas idénticas concurrentes |
| (h) | El filtro de negocio es estrecho por diseño | La UI expone un selector de alcance (`strict`, `category`, `keyword`); el `AND` de palabras clave es la mitad restrictiva |
| (i) | Cada modo de la regla de negocio tiene un coste muy distinto, y `UNSPSC OR texto` es inviable | `SCOPE_MAX_WINDOW_DAYS` acota la ventana por modo (texto → 90 días) y el modo «amplio» se **retiró** |
| (j) | `$q` (texto completo, indexado) es ~100× más rápido que `like`, pero no admite lógica booleana | Se descartó como reemplazo del modo de texto: cambiaría la cobertura de 16.943 a 2.712 contratos |
| (k) | **«Convocado» y «adjudicado» son dos datasets distintos**, no dos estados: `jbjy-vk9h` solo tiene contratos ya suscritos | El filtro «tipo de registro» conmuta la fuente; `sources.js` traduce los nombres de campo, que no coinciden entre vistas |

---

## (a) Los códigos UNSPSC llevan prefijo de versión

`codigo_de_categoria_principal` **no** es un código de 8 dígitos desnudo. Los valores
reales se ven así:

```
"V1.53111600"
"V1.80111600"
"UNSPECIFIED"
```

Valores más frecuentes en las 6.092.927 filas del dataset completo:

| Valor | Filas |
| --- | --- |
| `V1.80111600` | 2.174.225 |
| `V1.80111701` | 476.030 |
| `V1.80111620` | 315.907 |
| `UNSPECIFIED` | 82.513 |

**Evidencia.** La consulta ingenua devuelve cero filas:

```soql
$where=codigo_de_categoria_principal in ('53111600')
-- 0 filas
```

La consulta que sí funciona:

```soql
$where=codigo_de_categoria_principal like '%53111600%'
```

**Consecuencia.** Este es el *gotcha* más importante del dataset: cualquier
predicción construida con igualdad (`in (…)`, `= '53111600'`) sobre la columna de
categoría devuelve **cero contratos sin dar ningún error**. Por eso
`buildCategoryClause()` en `server/domain/soql.js` emite siempre
`like '%<codigo>%'`.

La coincidencia por subcadena es **exacta, no aproximada**: los códigos UNSPSC
están fijados a 8 dígitos, así que un código no puede ser subcadena de otro código
distinto. Lo único que `like '%<8 dígitos>%'` podría capturar de más es el sufijo
numérico de un valor con formato distinto, y hoy la columna solo contiene
`V<versión>.<8 dígitos>` y el centinela `UNSPECIFIED` (que no coincide con ningún
código). En el camino de lectura, `normalizeCode()` extrae los 8 dígitos con
`/(\d{8})/`, de modo que `"V1.53111600"` se resuelve a `53111600` y, si no hay
coincidencia (p. ej. `UNSPECIFIED`), la fila cae en el grupo «Otra / no
clasificada» en lugar de mostrar un código falso.

> Coste asociado: cada código soportado añade un predicado `like` a un `OR` de 16
> ramas (ver (f)). Añadir códigos al catálogo no es gratis.

---

## (b) `nit_entidad` y `codigo_entidad` son números para SoQL

El coordinador de consultas de Socrata tipa `nit_entidad` y `codigo_entidad` como
**números**, aunque la cabecera `x-soda2-types` de la respuesta etiquete
`nit_entidad` como `text`. Cualquier operador de texto sobre ellas **aborta la
consulta completa** (no solo ese predicado):

```soql
$where=nit_entidad > 0 and upper(nit_entidad) like '%900%'
-- query.soql.type-mismatch; Type mismatch for upper, is number

$where=nit_entidad like '%900%'
-- query.soql.type-mismatch; Type mismatch for #LIKE, is number
```

Lo mismo ocurre con `coalesce()` sobre estas columnas: el error es
`Type mismatch for coalesce, is number`.

La búsqueda de NIT, por tanto, se hace con **igualdad numérica**:

```soql
$where=nit_entidad = 900363756
```

**Consecuencia.** Ambas columnas están **deliberadamente ausentes** de
`SEARCH_FIELDS` en `server/domain/soql.js`, y el buscador de texto libre resuelve
los términos puramente numéricos con `SEARCH_NUMERIC_FIELD` (`nit_entidad = <número>`).

Dos consecuencias prácticas que conviene tener presentes:

1. **El error es total, no parcial.** Como el fallo es de *tipado de la consulta*,
   un único campo mal elegido dentro del gran `OR` de la búsqueda libre invalida la
   petición entera y el usuario ve un 502, no un resultado incompleto. Por eso la
   lista de campos es una constante probada y no se genera a partir del esquema.
   `scripts/isolate.mjs` existe justamente para aislar este tipo de error.
2. **El nombre de la columna no permite adivinar el tipo.** `codigo_proveedor`
   se comporta como **texto** (acepta `upper()`), mientras que `codigo_entidad` es
   **numérico**. La distinción hay que **probarla** contra el endpoint, nunca
   deducirla del nombre ni de la cabecera `x-soda2-types`.

Estas dos columnas son **las únicas** entre los campos buscables de la aplicación
con este problema. Todos estos aceptan `upper()` sin inconveniente:
`nombre_entidad`, `proveedor_adjudicado`, `objeto_del_contrato`,
`descripcion_del_proceso`, `id_contrato`, `referencia_del_contrato`,
`proceso_de_compra`, `documento_proveedor`, `ciudad` y `departamento` — que es
exactamente la lista de `SEARCH_FIELDS`.

---

## (c) `like` acepta `_` como comodín de un carácter (y así se resuelven los acentos)

SoQL **no** normaliza diacríticos y **no** soporta expresiones regulares. Pero su
`like` admite `_` como comodín de **un** carácter, además de `%`. Como un acento
español cambia exactamente un carácter, sustituir **una** vocal por `_` hace que un
término sin acento coincida también con el texto acentuado.

**Evidencia medida** sobre una ventana de 90 días
(`fecha_de_firma >= '2026-07-04T00:00:00.000'` hasta 2026-10-02):

| Predicado | Filas |
| --- | --- |
| `upper(objeto_del_contrato) like '%DOTACION%'` | 244 |
| `upper(objeto_del_contrato) like '%DOTACIÓN%'` | 831 |
| `upper(objeto_del_contrato) like '%DOTACI_N%'` | **1.071** |
| `upper(objeto_del_contrato) like '%D_TACION%'` | 250 |

La pareja clave es la última: `DOTACI_N` (guion bajo **en la posición acentuada**)
captura ambas grafías — 1.071 filas, muy por encima de cada variante por separado y
del orden de la suma de las dos (831 + 244 = 1.075, con los solapamientos contados
una sola vez) —, mientras que `D_TACION` (guion bajo **en la posición equivocada**,
la `O`) apenas añade nada sobre `DOTACION` (250 frente a 244): la `O` de «dotación»
nunca lleva tilde.

**Confirmación de extremo a extremo a través de la API:**

| Petición | Contratos devueltos |
| --- | --- |
| `/api/contracts?q=dotacion` | 94 |
| `/api/contracts?q=DOTACIÓN` | 94 |

**Consecuencia.** `wordPatterns()` en `server/domain/soql.js` genera, por cada
palabra, el patrón literal, su versión sin acentos y variantes con **una** vocal
reemplazada por `_`. Los `OR` resultantes se combinan con `AND` entre palabras, y
`sanitizeTerm()` elimina antes los `_` y `%` que escriba el usuario: los comodines
que llegan a SoQL son solo los que añade la aplicación, nunca los del cliente.

**Limitación, dicha sin adornos:** la técnica cubre **un acento por palabra**. Una
palabra con dos acentos (p. ej. `SEÑALIZACIÓN`) no queda cubierta del todo por las
variantes generadas. Además, `VOWELS` es `'AEIOU'`, así que la diferencia
`ñ` ↔ `n` **nunca** se resuelve con este mecanismo. Por eso la lista de palabras
clave incorporada (`KEYWORDS_REQUIRED`, `KEYWORDS_OPTIONAL` en
`server/domain/catalog.js`) codifica **a mano** ambas grafías donde importa:
`DOTACION`/`DOTACIÓN`, `ELEMENTOS DE PROTECCION`/`ELEMENTOS DE PROTECCIÓN`,
`SEÑALIZACION`/`SEÑALIZACIÓN`. Si añade una palabra clave con tilde o con `ñ` a esa
lista, añada también su variante sin acento.

---

## (d) Tipos, serialización y valores centinela

**Dimensiones.** El dataset completo tiene **6.092.927 filas**.

**`valor_del_contrato` es `number` pero se serializa como STRING en JSON.** El valor
llega como `"12129075"`, no como `12129075`.

**Consecuencia.** Cualquier aritmética en JavaScript debe coercionar antes con
`Number()`; de lo contrario `"12129075" + 1` produce concatenación de cadenas y los
totales del tablero se vuelven absurdos. En el código esto se centraliza en
`toNumber()` (`server/domain/normalize.js`), que además devuelve `0` ante valores
vacíos o no numéricos. Las sumas y promedios que hace el propio servidor
(`sum()`, `avg()`, `max()` en SoQL) no se ven afectados: el cálculo ocurre del lado
de Socrata.

**`urlproceso` es una columna de tipo `url`**, que se serializa como **objeto**, no
como cadena:

```json
{ "urlproceso": { "url": "https://community.secop.gov.co/..." } }
```

**Consecuencia.** Interpolar la columna directamente (por ejemplo `String(row.urlproceso)`)
produce `[object Object]` y rompe el enlace al proceso en la UI. `extractUrl()`
acepta ambas formas —cadena que empiece por `http`, u objeto con la propiedad
`url`— y descarta el resto. Tampoco se puede filtrar ni ordenar por esta columna
como si fuera texto.

**Valores centinela que significan «ausente».** Muchas columnas de texto usan
marcadores en lugar de nulos: `"No Definido"`, `"Sin Descripcion"`, `"No aplica"`,
`"UNSPECIFIED"` (este último, por ejemplo, en `codigo_de_categoria_principal`).

**Consecuencia.** `clean()` en `server/domain/normalize.js` los mapea a `null` para
que la UI **no los presente como dato real** — de lo contrario aparecerían
proveedores llamados «No Definido» o descripciones que dicen «Sin Descripcion».
Nótese que el `group by` del servidor **sí** cuenta esos literales como una categoría
más: en los agregados por departamento o por categoría verá un grupo «No Definido»,
y ese grupo es legítimo, no un fallo de normalización. Las listas de opciones de los
filtros solo descartan valores vacíos, de modo que «No Definido» puede aparecer
como opción seleccionable.

---

## (e) El dataset va rezagado respecto a la fecha actual

Al medir, la cabecera `x-soda2-last-modified` de la respuesta decía
**`Thu, 01 Oct 2026`**, mientras que la fecha del día era **2026-10-02**. Los
valores más recientes de `fecha_de_firma` eran **2026-09-29**.

**Consecuencia.** «Contratos firmados hoy» es legítimamente **0** muchos días, y las
tarjetas «hoy» y «este mes» del tablero leerán 0 con frecuencia. **Esto no es un
bug y no hay que "arreglarlo" relajando el filtro ni desplazando las fechas**: el
SECOP II publica con retraso y el rezago puede ser de varios días. Por la misma
razón, una prueba automática que afirme `contratosHoy > 0` será inestable.

La aplicación expone por eso un KPI de **30 días** (`contratos30d`, calculado desde
`hoy - 29` hasta hoy, ambos inclusive) como la señal de corto plazo que sí es
significativa. Cuando alguien reporte que «el tablero está en cero», la primera
comprobación es la fecha efectiva de los últimos contratos, no la caché ni el
filtro.

Como los KPI «hoy»/«mes»/«30 días» se calculan contra el alcance de negocio
**ignorando la ventana de fechas del usuario** (`buildWhere({ ...filters, from: null, to: null })`
en `buildSummary()`), siguen teniendo sentido aunque el usuario esté filtrando, por
ejemplo, el trimestre anterior.

---

## (f) Coste de consulta y por qué las ventanas se recortan

El «filtro estricto» es 16 predicados `like` de UNSPSC (`OR` entre sí) **más** una
cláusula de palabras clave con `like` sobre `objeto_del_contrato` y
`descripcion_del_proceso`. Medido contra el endpoint en vivo, contando y sumando:

| Ventana | Tiempo |
| --- | --- |
| 30 días | 0,88 s |
| 90 días | 1,24 s |
| 180 días | 1,63 s |
| 365 días | 2,04 s |
| 730 días | 2,92 s |
| 1095 días | 3,23 s |

Un escaneo **sin límite de fechas** sobre las 6,1 millones de filas **hace timeout**.

**Consecuencia.** El coste crece con la ventana y hay un punto en el que deja de ser
cuestión de segundos para convertirse en timeouts y errores 502. Por eso:

* `MAX_WINDOW_DAYS` vale **730** (2 años) por defecto, que es también
  `DEFAULT_WINDOW_DAYS`: el aplicativo está acotado a los 2 últimos años. La fila de
  730 días (2,92 s) de la tabla anterior es el peor caso real que puede pedir un
  usuario, así que el margen frente al tiempo límite de Socrata (30 s) es amplio.
* `clampWindow()` **recorta** la ventana en lugar de rechazar la petición: si el
  cliente pide 5 años, `from` se recalcula como `to - maxWindowDays` y la consulta
  se responde igual (con menos rango del pedido). Es una decisión deliberada de
  robustez, pero implica que **la UI debe mostrar el rango efectivamente
  consultado**; para eso existe `query.filters` en cada respuesta, y el usuario
  puede auditar exactamente qué se consultó.
* Tampoco se admiten ventanas futuras: `to` se limita a la fecha de hoy.

Los demás guardarraíles siguen la misma lógica: `FACET_WINDOW_DAYS=730` porque cada
opción de filtro es un `group by` de varios segundos que se cachea 6 horas, y el
`group by ciudad` **sin** el filtro de negocio tarda ~22 s sobre las 6.1M filas,
frente a menos de un segundo cuando se acota con el filtro estricto (por eso
`getCiudades()` lo aplica siempre). `EXPORT_MAX_ROWS=20000` acota la descarga, que
se arma paginando de `SOCRATA_PAGE_SIZE` en adelante.

Como la ventana de 2 años hace que la primera carga en frío encadene varias
agregaciones de ~3 s, el servidor **precalienta la caché al arrancar**
(`WARMUP_ON_START`, ver `warmDefault()`), de forma secuencial y no en paralelo para
no disparar un pico de peticiones cuando no hay app token.

Al añadir códigos UNSPSC al catálogo o palabras clave al `OR`, **mida de nuevo** con
el script `scripts/probe-window.mjs`: el número de ramas del `OR` crece de forma lineal con cada
elemento añadido.

---

## (g) Sin app token hay un límite real de peticiones

Socrata limita por **dirección IP** a los clientes no autenticados. Una suite de
pruebas que disparó **~30 consultas rápidas sin caché** provocó timeouts
**repetibles de más de 45 s**, que la API expone como `502 upstream_error`, en una
petición que contra un endpoint en reposo se resuelve en **~5 s**.

**Consecuencia.** En producción **hay que definir `SOCRATA_APP_TOKEN`** (es gratis e
inmediato en <https://www.datos.gov.co/profile/edit/developer_settings>): sube los
límites de forma sustancial. Mientras tanto, la aplicación se protege por tres vías:

1. **Caché agresiva** — búsquedas 3 min, resumen 10 min, facets 6 h
   (`CACHE_SEARCH_TTL_MS`, `CACHE_SUMMARY_TTL_MS`, `CACHE_FACETS_TTL_MS`).
2. **Colapso de consultas concurrentes** — en `server/socrata/client.js` la clave de
   caché es la **URL completa** de la petición, así que dos peticiones idénticas
   simultáneas comparten una única llamada al upstream en lugar de duplicarla.
3. **Reintentos con backoff** — ante `429`/`5xx` se reintenta respetando la
   cabecera `retry-after` cuando viene, con espera exponencial y tope de 15 s.

Conviene saber además que un `502 upstream_error` (o un `429`) en la UI suele
significar **throttling**, no un filtro mal construido: la espera máxima del cliente
es `SOCRATA_TIMEOUT_MS * (SOCRATA_RETRIES + 1)` más el backoff, es decir del orden de
un minuto con los valores por defecto. Un síntoma típico de haber agotado la cuota
es que la primera consulta tarde ~5 s y las siguientes fallen todas.

---

## (h) El filtro de negocio es estrecho por diseño: los cuatro alcances

Con una ventana de **90 días**, y combinando de distinta forma la regla UNSPSC con
la regla de texto:

| Alcance | Definición | Contratos |
| --- | --- | --- |
| `strict` | UNSPSC **AND** palabras clave | **160** |
| `category` | solo UNSPSC | **221** |
| `keyword` | solo texto | **3.622** |
| `broad` | UNSPSC **OR** palabras clave | **3.683** |

En lo que va de 2026, el alcance `strict` arroja **404 contratos** (≈ **$144 mil
millones COP** medidos sobre 365 días).

**Consecuencia.** La mitad restrictiva del `AND` son **las palabras clave**, no los
códigos de categoría: el alcance `category` (221) se desploma a 160 al exigir
además la cláusula de texto (≈ −28 %), mientras que `keyword` por sí solo ya trae
3.622 y añadir el `OR` de UNSPSC apenas lo mueve (3.683). Es decir, el universo
«temático» lo define el texto de `objeto_del_contrato` / `descripcion_del_proceso`,
y los códigos UNSPSC funcionan más como un refinamiento dentro de ese universo que
como la definición del mercado.

Por eso la UI expone un **selector de alcance** en lugar de imponer el `strict`: un
analista que necesite cobertura (por ejemplo, para no perderse contratos mal
clasificados en UNSPSC) puede cambiar de modo, y quien necesite precisión para un
informe puede quedarse en `strict` sabiendo que verá un subconjunto. Cualquier
cambio en el valor por defecto del alcance **cambia el significado de todas las
cifras publicadas**: documéntelo junto a los totales.

> **Actualización (alcance de 2 años).** Las cifras de esta sección se midieron
> sobre 90 días. Con la ventana de 2 años los totales son muy distintos:
> `strict` = 1.393, `category` = 1.889, `keyword` = 16.943 (a 365 días). La
> conclusión cualitativa se mantiene: la cláusula de texto es la restrictiva.

---

## (i) El coste depende muchísimo del modo, y `UNSPSC OR texto` es inviable

El hallazgo (f) mide el filtro **estricto**. Pero al abrir la ventana a 2 años hay
que medir cada modo por separado, porque **la restricción de categoría es también
una ayuda al optimizador**: reduce el conjunto antes de evaluar las palabras clave.
Los modos que no la llevan acaban escaneando las 6,1M de filas con
`upper(col) like '%…%'`, que no puede usar índices.

Medido con el endpoint **en reposo** y sin app token (`scripts/probe-scopes.mjs`),
contando y sumando, con el tiempo límite del servidor en 30 s:

| Modo | 90 días | 180 días | 365 días | 730 días |
| --- | --- | --- | --- | --- |
| `strict` (UNSPSC **Y** texto) | 1,1 s ✓ | 0,8 s ✓ | 1,9 s ✓ | **2,7 s ✓** |
| `category` (solo UNSPSC) | 0,7 s ✓ | 0,8 s ✓ | 1,9 s ✓ | **2,7 s ✓** |
| `keyword` (solo texto) | 3,5 s ✓ | 4,1 s ✓ | 12,1 s ✓ | **NO CABE** |
| `broad` (UNSPSC **O** texto) | **32,1 s ✗** | **58,1 s ✗** | NO CABE | NO CABE |

**Consecuencias, aplicadas en el código.**

* El modo `broad` se **retiró** de `SCOPES`. No es que fuera lento a 2 años: es que
  ya era inviable con 90 días (32 s frente a un límite de 30 s). El `OR` entre las
  dos cláusulas impide que el planificador use el filtro de categoría, así que
  escanea todo. Un modo que devuelve `502` de forma sistemática es peor que no
  ofrecerlo. Si alguien vuelve a pedirlo, hay que implementarlo como **unión de dos
  consultas** (cada una viable por separado) y fusionar en memoria, no como un `OR`
  en SoQL.
* `SCOPE_MAX_WINDOW_DAYS` acota la ventana **por modo**: 730 días para `strict` y
  `category`, y **90 días para `keyword`**. La cláusula real de `keyword` duplica las
  variantes con/sin tilde (hasta 40 `like`), así que tarda ~el doble que la medición
  simple: 180 días ronda los 27 s y no deja margen frente al límite de 30 s, por lo
  que el tope se fijó en 90 días. El servidor **recorta**
  y lo reporta en `query.filters.windowClamped` + `scopeMaxWindowDays`; la interfaz
  muestra un aviso y recorta también el rango del lado del cliente al cambiar de
  modo, para que lo que se ve coincida con lo que se consulta.
* Consecuencia práctica: el alcance de 2 años solo es plenamente utilizable en los
  modos que incluyen la categoría UNSPSC, que es justamente lo que pide la regla de
  negocio del proyecto.

---

## (j) `$q` es ~100× más rápido que `like`, pero no sirve como reemplazo

Socrata ofrece `$q`, una búsqueda de texto completo **indexada**, frente al
`upper(col) like '%…%'` que no puede usar índices. Medido a 730 días
(`scripts/probe-fulltext.mjs`):

| Consulta | Tiempo | Contratos |
| --- | --- | --- |
| `like` sobre objeto/descripción | **timeout** (>120 s) | — |
| `like` a 365 días | 110,8 s | 16.943 |
| `$q=DOTACION` | **1,46 s** | 2.712 |

La diferencia de velocidad es de dos órdenes de magnitud, así que la tentación de
usarlo es grande. **Se descartó**, por dos razones verificadas:

1. **No admite lógica booleana.** `$q=(DOTACION OR INSUMOS OR UNIFORMES)` devuelve
   **18** filas y `$q="DOTACION" OR "INSUMOS"` devuelve **0**: la sintaxis se
   tokeniza en lugar de evaluarse como expresión. Sin `OR` no se puede reproducir
   la lista de 10 palabras clave del filtro estricto.
2. **La cobertura no es equivalente.** `$q=DOTACION` devuelve 2.712 contratos donde
   `like '%DOTACION%'` devuelve 16.943 (`like` encuentra además subcadenas como
   «DOTACIONES»). Cambiar el modo de texto a `$q` reduciría el resultado a una
   sexta parte: sería una regresión silenciosa en un modo que se llama «solo
   texto», justo el que existe para no perder contratos.

Es una vía legítima si algún día se quiere un modo de búsqueda **rápida y
aproximada** con su propia etiqueta en la interfaz, pero no como sustituto del
filtro de texto actual.

---

## (k) «Convocado» y «adjudicado» no son dos estados: son dos datasets

Este es el hallazgo con más consecuencias de diseño de todo el proyecto, porque la
petición natural («quiero ver los convocados y los adjudicados») parece un filtro
sobre una columna y **no lo es**.

**`jbjy-vk9h` (contratos) solo contiene contratos ya suscritos.** Comprobado sobre
los 1.393 registros del filtro de negocio a 2 años:

| Consulta | Resultado |
| --- | --- |
| `proveedor_adjudicado is not null and != 'No Definido'` | **1.393** |
| `proveedor_adjudicado is null or = 'No Definido'` | **0** |
| `fecha_de_firma is null` | **0** |

Y el universo de estados de esa vista, sobre 2 años sin filtro de negocio, es:
`En ejecución` (1.017.245), `Modificado` (506.462), `Cerrado` (323.198),
`terminado` (210.402), `Aprobado` (42.881), `cedido` (13.673), `Suspendido` (4.355),
`Borrador` (8) y `Cancelado` (4). **No hay ningún estado de convocatoria.** Un
proceso que aún no se ha adjudicado no aparece en esta vista, y por eso el enunciado
inicial («filtrar por estado: En ejecución, Cerrado, Modificado, Convocatoria…»)
mencionaba un estado que no existe en la vista de contratos.

**Los convocados están en `p6dx-8zbt` (Procesos de contratación)**, con 9.249.545
registros y los campos que sí permiten distinguirlos:
`adjudicado` ("Si" 882.453 / "No" 8.367.092), `estado_del_procedimiento`
(Seleccionado, Publicado, Evaluación, Cancelado, Borrador, Abierto, Aprobado, En
aprobación, Suspendido), `estado_resumen` (incluye `Adjudicado`),
`id_adjudicacion`, `precio_base` y `valor_total_adjudicacion`.

**Consecuencia en el código.** El filtro «tipo de registro» es un **conmutador de
fuente**, no un valor de columna:

* `sources.js` describe las dos vistas y traduce cada concepto a su nombre de campo
  real, porque **no coinciden**: la fecha es `fecha_de_firma` frente a
  `fecha_de_publicacion_del`; la categoría es `codigo_de_categoria_principal` frente
  a `codigo_principal_de_categoria`; el texto del objeto está en
  `objeto_del_contrato`/`descripcion_del_proceso` frente a
  `descripci_n_del_procedimiento`/`nombre_del_procedimiento` (los nombres
  «objeto_del_proceso» y «descripcion_del_proceso» devuelven
  `query.soql.no-such-column`); la entidad es `nombre_entidad` frente a `entidad`;
  el valor es `valor_del_contrato` frente a `precio_base`.
* **El prefijo `V1.` del código UNSPSC también está en la vista de procesos**
  (`V1.80111500`), así que el mismo `like '%<codigo>%'` sirve en ambas. Es la única
  cosa que se comporta igual.
* «Convocado» se define como `adjudicado = 'No'`: un proceso publicado que todavía
  no se ha adjudicado.
* Con el filtro de negocio a 2 años: **1.393 contratos adjudicados** frente a
  **3.148 procesos convocados**.
* Los **estados y las modalidades son vocabularios distintos** en cada vista, así que
  las opciones de los filtros se calculan **por fuente y de forma perezosa** (`/api/meta?tipoRegistro=…`).
  Calcularlas para las dos vistas a la vez duplicaba el arranque en frío: la
  precalentamiento pasó de 84 s a la mitad al pedirlas por modo.
* El **modo combinado** no se puede resolver con una consulta SoQL: los dos conjuntos
  son de datasets distintos. Se materializan ambos y se fusionan en memoria, con un
  tope de 6.000 filas por vista. Es viable porque los volúmenes son modestos
  (4.543 registros en total a 2 años, y la fusión tarda ~10 s en frío).

**Cómo se re-verifica.** Con `scripts/probe-estado.mjs` (estados y ausencia de
proveedor en la vista de contratos, y descubrimiento de la vista de procesos) y
`scripts/probe-convocados.mjs` (volúmenes de convocados y sus estados).

> **Cuidado con los alias en `$select`.** `sum(valor_total_adjudicacion) as adjudicado`
> hace fallar la consulta con `query.soql.type-mismatch`, porque el alias colisiona
> con la columna real `adjudicado` usada en el `$where`. Costó un rato de depuración
> creer que era un problema de tipos del dato cuando era un nombre repetido.

---

## Catálogo UNSPSC soportado

Definido en `server/domain/catalog.js` (`CATEGORY_GROUPS`). Son 16 códigos, cada uno
convertido en un predicado `like '%<codigo>%'` sobre `codigo_de_categoria_principal`.

| Grupo (`id`) | Etiqueta | Código | Descripción |
| --- | --- | --- | --- |
| `calzado` | Calzado / Botas | 53111500 | Calzado para hombres |
| | | 53111600 | Calzado para mujeres |
| | | 53111800 | Calzado para bebés |
| | | 53111900 | Calzado deportivo / tenis |
| `vestuario` | Vestuario / Uniformes | 53101500 | Pantalones y shorts |
| | | 53101600 | Camisas y blusas |
| | | 53101800 | Prendas de vestir exteriores |
| | | 53102700 | Uniformes |
| `medias` | Medias / Ropa Interior | 53102400 | Medias y calcetines |
| | | 53102500 | Ropa interior |
| `epp` | EPP y Seguridad Industrial | 46181500 | Ropa de seguridad |
| | | 46181700 | Protección de manos (guantes) |
| | | 46181800 | Protección ocular y facial |
| | | 46181900 | Protección auditiva |
| | | 46182000 | Protección respiratoria |
| | | 46182100 | Protección contra caídas |

Palabras clave que satisfacen la regla de texto (`KEYWORDS_REQUIRED`, siempre
activas): `DOTACION`, `DOTACIÓN`, `INSUMOS`, `UNIFORMES`, `CALZADO`, `VESTUARIO`,
`ELEMENTOS DE PROTECCION`, `ELEMENTOS DE PROTECCIÓN`, `OVEROLES`, `EPP`. Las
opcionales (`KEYWORDS_OPTIONAL`, se activan con `optionalKeywords=true`) son de
mayor cobertura y menor precisión: `DOTACIONES`, `PROTECCION PERSONAL`,
`PROTECCIÓN PERSONAL`, `ROPA DE TRABAJO`, `ROPA DE LABOR`, `SEGURIDAD INDUSTRIAL`,
`BOTAS`, `ZAPATOS`, `GUANTES`, `CASCO`, `TAPABOCAS`, `BATA`, `CAMISETAS`,
`SEÑALIZACION`, `SEÑALIZACIÓN`.

Un `codigo_de_categoria_principal` que no esté en esta tabla (o que sea
`UNSPECIFIED`) no se pierde: `resolveCategory()` lo clasifica como
«Otra / no clasificada» conservando el valor original, de modo que la UI pueda
mostrarlo.

---

## Cómo re-verificar estos hallazgos

Los scripts de sondeo son programas Node ≥ 20 con `fetch` nativo (no usan
dependencias del proyecto). Se ejecutan con `node <ruta>` y **llevan las fechas codificadas**
(así que hay que actualizarlas antes de comparar cifras) y **no envían app token**:
ejecutarlos en ráfaga puede disparar el throttling descrito en (g).

| Script | Qué verifica |
| --- | --- |
| `scripts/probe1.mjs` | Reconocimiento inicial: campos disponibles, `count(1)` del dataset completo y el filtro UNSPSC **con igualdad** (`in (...)`) que devuelve cero filas — la evidencia del hallazgo (a). Usa el parámetro `$query=`. |
| `scripts/probe2.mjs` | La forma real de `codigo_de_categoria_principal` (`V1.…`) y la comparación `in (...)` frente a `like '%…%'` con ventana acotada; también imprime las cabeceras `x-*` de la respuesta (hallazgos (a) y (g)). |
| `scripts/probe3.mjs` | Números exactos del filtro de negocio por ventana (hoy, ayer, este mes, 30/90 días, año en curso) y los facets de los filtros. |
| `scripts/probe-window.mjs` | El **coste temporal** por ancho de ventana (30 → 1825 días) para el filtro estricto, contando y sumando, y el coste de una página ordenada: la evidencia del hallazgo (f) y la justificación de `MAX_WINDOW_DAYS`. |
| `scripts/probe-scopes.mjs` | El **coste de cada modo** (`strict` / `category` / `keyword` / `broad`) por ancho de ventana: la evidencia del hallazgo (i) y la justificación de `SCOPE_MAX_WINDOW_DAYS` y de la retirada del modo `broad`. |
| `scripts/probe-fulltext.mjs` | Compara `like` con la búsqueda indexada `$q`, y comprueba que `$q` no evalúa lógica booleana (hallazgo (j)). |
| `scripts/probe-estado.mjs` | Comprueba que la vista de contratos **no** contiene nada convocado (todos tienen proveedor y firma, ningún estado de convocatoria) y descubre la vista de procesos con sus campos (hallazgo (k)). |
| `scripts/probe-convocados.mjs` | Volúmenes reales de convocados (`adjudicado = 'No'`) frente a adjudicados, y el reparto de estados de los convocados (hallazgo (k)). |
| `scripts/probe-wildcard.mjs` | Que `_` funciona como comodín de un carácter, la tabla del hallazgo (c), el tipado numérico de `nit_entidad` y un sondeo sistemático de qué campos aceptan `upper()` (hallazgo (b)). |
| `scripts/isolate.mjs` | Aísla el error `Type mismatch for coalesce` que produce la cláusula de texto libre, comparando formas con y sin `coalesce()` y distintos conjuntos de campos. |

Además, para verificar el sistema completo y no solo los hallazgos:

| Script | Qué verifica |
| --- | --- |
| `scripts/check-api.mjs` | **Preflight sin servidor** (`npm run check`): afirma los cuatro comportamientos del dataset en los que se apoya el código — igualdad exacta devuelve 0, `like` devuelve filas, `upper(nit_entidad)` falla con `type-mismatch`, el comodín `_` cubre ambas grafías y el filtro estricto responde dentro del tiempo límite. Es lo que conviene ejecutar primero si algo deja de funcionar. |
| `scripts/smoke.mjs` | **Prueba de integración contra la API local** (requiere `node server/index.js` en marcha): salud, facets, ordenamiento y paginado estable, los cuatro alcances, filtros de categoría, texto libre con y sin tildes, rangos de cuantía, ventanas de fecha y recorte del tope, KPIs, detalle y las tres exportaciones. Va espaciado a propósito para no medir su propio throttling. |
| `scripts/check-web.mjs` | Que el cliente compilado se sirva correctamente (HTML, tipos MIME, caché inmutable, *code splitting*, fallback de SPA) y que el filtro por defecto devuelva datos utilizables de extremo a extremo. |

Para una comprobación puntual y rápida de la forma de la categoría basta una
consulta a mano:

```soql
$select=codigo_de_categoria_principal, count(1) as n
$group=codigo_de_categoria_principal
$order=n desc
$limit=25
```

Y para comprobar el tipado de una columna antes de usarla en la búsqueda libre:

```soql
$where=fecha_de_firma >= '2026-07-04T00:00:00.000' and upper(<columna>) like '%A%'
-- si responde "Type mismatch for upper, is number", la columna es numérica
```

---

## Lista de comprobación antes de tocar la capa de consultas

1. ¿La consulta nueva usa `like '%<codigo>%'` para la categoría y **nunca** `in (…)`? (a)
2. ¿Agregó `upper()` o `coalesce()` sobre `nit_entidad` o `codigo_entidad`? Si sí,
   la consulta completa fallará con `type-mismatch`. (b)
3. ¿Probó el tipo de cualquier columna **nueva** contra el endpoint en lugar de
   fiarse del nombre o de `x-soda2-types`? (b)
4. ¿Añadió una palabra clave con tilde o con `ñ`? Entonces añada también su variante
   sin acento, y recuerde que un solo `_` cubre solo un acento. (c)
5. ¿Está coercionando `Number()`/`toNumber()` antes de operar con
   `valor_del_contrato`, y usando `extractUrl()` para `urlproceso`? (d)
6. ¿La ventana de fechas sigue dentro de `MAX_WINDOW_DAYS` y refleja en la UI el
   rango **efectivo** (recortado) que se consultó? (f)
7. ¿Definió `SOCRATA_APP_TOKEN` en el entorno de producción? (g)
8. ¿Midió de nuevo el coste por ventana tras añadir códigos o palabras clave? (f)
