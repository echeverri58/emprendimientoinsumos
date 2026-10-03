import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

import express from 'express';
import compression from 'compression';
import cors from 'cors';
import 'dotenv/config';

import { config } from './config.js';
import { api } from './routes/api.js';
import { warmDefault } from './services/contracts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const clientDist = path.join(projectRoot, config.clientDist);
const hasBuild = existsSync(path.join(clientDist, 'index.html'));

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

app.use(compression());
// The browser app is normally served from this same origin (Vite proxies /api in
// dev), so CORS only matters for external consumers of the JSON API.
app.use(cors({ origin: true, methods: ['GET', 'POST', 'OPTIONS'] }));
app.use(express.json({ limit: '256kb' }));

app.use((req, res, next) => {
  const started = Date.now();
  res.on('finish', () => {
    if (!req.path.startsWith('/api')) return;
    const ms = Date.now() - started;
    console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms}ms)`);
  });
  next();
});

app.use('/api', api);

if (hasBuild) {
  app.use(
    express.static(clientDist, {
      index: false,
      setHeaders(res, filePath) {
        // Vite emits content-hashed asset filenames; HTML must never be cached.
        if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
        else res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      },
    }),
  );
  app.get('*', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(clientDist, 'index.html'));
  });
} else {
  app.get('*', (_req, res) => {
    res
      .status(503)
      .type('html')
      .send(
        `<!doctype html><html lang="es"><meta charset="utf-8">
        <title>SECOP · Falta compilar el cliente</title>
        <body style="font-family:system-ui;background:#0F172A;color:#e2e8f0;padding:3rem;line-height:1.6">
        <h1 style="color:#34d399">La interfaz aún no está compilada</h1>
        <p>El servidor de API está funcionando, pero no se encontró <code>${config.clientDist}/index.html</code>.</p>
        <p>Ejecute <code style="background:#1e293b;padding:.2rem .5rem;border-radius:6px">npm run build</code> y recargue,
        o use <code style="background:#1e293b;padding:.2rem .5rem;border-radius:6px">npm run dev</code> para el entorno de desarrollo.</p>
        <p>La API está disponible en <a style="color:#34d399" href="/api/health">/api/health</a>.</p>
        </body></html>`,
      );
  });
}

const server = app.listen(config.port, () => {
  const base = `http://localhost:${config.port}`;
  console.log('');
  console.log('  SECOP II · Rastreo de contratos de Dotación, Vestuario, Calzado, Insumos y EPP');
  console.log(`  Dataset   : ${config.socrata.domain} / ${config.socrata.dataset}`);
  console.log(`  Alcance   : últimos ${config.query.defaultWindowDays} días (tope ${config.query.maxWindowDays})`);
  console.log(`  App token : ${config.socrata.appToken ? 'configurado' : 'NO configurado (se recomienda definirlo)'}`);
  console.log(`  Interfaz  : ${hasBuild ? base : 'sin compilar (ejecute npm run build)'}`);
  console.log(`  API       : ${base}/api/health`);
  console.log('');

  if (config.warmupOnStart) {
    warmDefault()
      .then((report) => {
        const detail = report.steps
          .map((step) => `${step.name}${step.ok ? '' : ' (falló)'} ${step.ms}ms`)
          .join(' · ');
        console.log(`  Caché precalentada en ${report.ms} ms — ${detail}`);
        for (const step of report.steps) {
          if (!step.ok) console.warn(`  Aviso: no se pudo precalentar «${step.name}»: ${step.error}`);
        }
      })
      .catch((error) => console.warn(`  Aviso: el precalentamiento falló: ${error?.message}`));
  }
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`\n${signal} recibido, cerrando servidor...`);
    server.close(() => process.exit(0));
  });
}
