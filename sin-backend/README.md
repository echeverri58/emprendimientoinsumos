# SECOP II · Dotación e Insumos — versión SIN backend

Esta carpeta contiene la misma aplicación, pero **sin servidor**: el navegador
consulta directamente la API de Socrata en `datos.gov.co` (que permite CORS) y toda
la lógica —construcción de SoQL, filtros, fusión de las dos vistas, KPIs, gráficas y
exportación— se ejecuta en el cliente.

## Qué cambió respecto a la versión con backend

- No hay `server/`: la capa de datos vive en `src/lib/` (`socrata.js`,
  `dataservice.js`, `api.js`) y llama a `https://www.datos.gov.co/resource/*.json`.
- Los módulos puros se portaron tal cual desde el servidor: `catalog.js`,
  `sources.js`, `normalize.js`, `soql.js`, `dates.js`, `csv.js`, `cache.js`.
- La exportación (CSV / Excel / JSON) se genera en el navegador como un Blob y se
  descarga; no hay URL de servidor.
- La caché es en memoria (se pierde al recargar).

## Compilar y probar

```bash
npm install
npm run build      # genera dist/ (estático)
npm run preview    # sirve dist/ localmente para probar
```

El `dist/` resultante se puede subir tal cual a **GitHub Pages**, Netlify, o
cualquier hosting estático (usa rutas relativas).

## Límites de esta modalidad

- **Sin caché de servidor**: cada visitante consulta Socrata directamente, así que
  con muchos usuarios se puede alcanzar el límite de peticiones por IP. Se
  recomienda definir un app token (opcional): al compilar con
  `VITE_SOCRATA_APP_TOKEN=...`, se envía en cada petición. No es un secreto en
  Socrata, pero queda visible en el código del navegador.
- El conjunto filtrado se **materializa en el navegador** (hasta 6.000 filas por
  vista). Con la ventana por defecto (30 días) son pocas filas; a 2 años puede ser
  más lento que la versión con servidor.
- «Hoy / este mes / 30 días» se calculan sobre el conjunto filtrado actual, no
  sobre el alcance global (diferencia menor frente a la versión con backend).

El detalle completo de los datos (prefijo `V1.`, `nit_entidad` numérico, comodín
`_`, las dos vistas) está en el `docs/NOTAS-DATOS.md` de la carpeta raíz del
proyecto.
