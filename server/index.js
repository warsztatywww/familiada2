import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import QRCode from 'qrcode';
import { loadQuestions } from './questions.js';
import { createGame, apply } from './game.js';
import { createHistory, describeCommand } from './history.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const CERT_DIR = path.join(__dirname, '..', '.cert');

// Self-signed cert dla HTTPS w LAN. Telefony potrzebują secure context
// (Wake Lock API działa tylko po HTTPS) — po jednorazowej akceptacji
// ostrzeżenia przeglądarka traktuje origin jako bezpieczny.
// Cert generowany raz przy pierwszym starcie i trzymany w .cert/ (gitignore).
function loadOrCreateCert(dir) {
  const keyFile = path.join(dir, 'key.pem');
  const certFile = path.join(dir, 'cert.pem');
  if (!existsSync(keyFile) || !existsSync(certFile)) {
    mkdirSync(dir, { recursive: true });
    execFileSync('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '3650',
      '-subj', '/CN=familiada', '-keyout', keyFile, '-out', certFile,
    ], { stdio: 'ignore' });
  }
  return { key: readFileSync(keyFile), cert: readFileSync(certFile) };
}

export async function startServer({ port, httpsPort, stateFile, questionsFile }) {
  const config = loadQuestions(questionsFile);

  let state;
  let restored = false;
  if (existsSync(stateFile)) {
    try {
      state = JSON.parse(readFileSync(stateFile, 'utf8'));
      state.config = config; // pytania zawsze świeże z pliku
      restored = true;
    } catch (e) {
      console.error('state.json uszkodzony lub nieczytelny — skasuj plik albo przywróć kopię. Startuję nową grę.');
    }
  }
  if (!restored) {
    state = createGame(config);
  }

  let seq = 0;
  const history = createHistory(100);
  const app = express();
  app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));
  app.get('/buzzer/:team(1|2)', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'buzzer.html')));
  app.get('/qr.svg', async (req, res) => {
    const data = String(req.query.data ?? '');
    if (!data) return res.status(400).send('brak parametru data');
    try {
      res.type('image/svg+xml').send(await QRCode.toString(data, { type: 'svg', margin: 1 }));
    } catch {
      res.status(400).send('nieprawidłowe dane QR');
    }
  });

  const httpServer = createServer(app);
  let httpsServer = null;
  try {
    httpsServer = createHttpsServer(loadOrCreateCert(CERT_DIR), app);
  } catch (e) {
    console.error('HTTPS wyłączony (nie udało się przygotować certyfikatu — brak openssl?):', e.message);
  }

  // Jeden wspólny WebSocketServer obsługuje upgrade z HTTP i HTTPS,
  // więc broadcast po wss.clients widzi wszystkich klientów.
  const wss = new WebSocketServer({ noServer: true });
  for (const srv of [httpServer, httpsServer]) {
    srv?.on('upgrade', (req, socket, head) => {
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
    });
  }

  function snapshot(event) {
    return JSON.stringify({
      type: 'state', seq, now: Date.now(), event, state,
      undoLabel: history.undoLabel(), redoLabel: history.redoLabel(),
    });
  }

  function broadcast(event) {
    seq += 1;
    try {
      writeFileSync(stateFile, JSON.stringify(state));
    } catch (e) {
      console.error('zapis state.json nieudany:', e.message);
    }
    const data = snapshot(event);
    for (const client of wss.clients) {
      if (client.readyState === 1 /* OPEN */) client.send(data);
    }
  }

  wss.on('connection', (ws) => {
    ws.on('error', (e) => console.error('ws error:', e.message));
    ws.send(snapshot(null));
    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      if (msg?.type !== 'command' || typeof msg.cmd?.type !== 'string') return;
      const cmd = msg.cmd;
      if (cmd.type === 'undo' || cmd.type === 'redo') {
        const snap = cmd.type === 'undo' ? history.undo(state) : history.redo(state);
        if (!snap) return;
        const volume = state.volume;
        state = snap;
        state.config = config; // pytania zawsze świeże, jak przy wczytaniu z pliku
        state.volume = volume; // głośność to ustawienie sali — undo jej nie cofa
        broadcast(null);
        return;
      }
      if (cmd.type === 'timerStart') cmd.now = Date.now();
      const before = structuredClone(state);
      let event;
      try {
        event = apply(state, cmd);
      } catch (e) {
        console.error('apply() rzuciło wyjątek, komenda odrzucona:', e);
        return;
      }
      const stateChanged = event !== null || wasSilentChange(cmd);
      if (!stateChanged) return;
      // Wpis trafia na stos undo tylko przy realnej zmianie stanu — event/SILENT
      // to tylko sygnał "trzeba rozgłosić", nie dowód zmiany (np. repeatBuzzer
      // zwraca event bez ruszania stanu, drugi "stop timera" jest idempotentny).
      // Stan jest mały, więc porównanie przez JSON.stringify jest tanie.
      // introVideoEnded to automat z tablicy, setVolume to ustawienie sali —
      // żadne nie trafia na stos undo
      const realChange = JSON.stringify(state) !== JSON.stringify(before);
      const noHistory = cmd.type === 'introVideoEnded' || cmd.type === 'setVolume';
      if (!noHistory && realChange) history.push(describeCommand(cmd, before), before);
      broadcast(event);
    });
  });

  // Komendy "ciche" zmieniają stan, ale zwracają event null; mimo to trzeba
  // je rozgłosić. apply() zwraca null też dla komend odrzuconych — dla
  // prostoty rozgłaszamy każdą znaną komendę cichą bezwarunkowo (snapshot
  // idempotentny, nadmiarowy broadcast jest nieszkodliwy).
  const SILENT = new Set([
    'setBank', 'setTeamName', 'timerStop',
    'introVideoEnded', 'stopMusic', 'resetBuzzers', 'finalCover', 'setVolume',
  ]);
  function wasSilentChange(cmd) {
    return SILENT.has(cmd.type);
  }

  await new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, resolve);
  });
  const actualPort = httpServer.address().port;

  // HTTPS to udogodnienie — jak nie wystartuje (np. port zajęty), gramy dalej
  // samym HTTP zamiast ubijać cały serwer.
  if (httpsServer) {
    const ok = await new Promise((resolve) => {
      httpsServer.once('error', (e) => {
        console.error('HTTPS nie wystartował:', e.message);
        resolve(false);
      });
      httpsServer.listen(httpsPort ?? (port === 0 ? 0 : port + 1), () => resolve(true));
    });
    if (!ok) httpsServer = null;
  }

  return {
    port: actualPort,
    httpsPort: httpsServer?.address().port ?? null,
    close: async () => {
      for (const c of wss.clients) c.terminate();
      await Promise.all([httpServer, httpsServer].filter(Boolean)
        .map((s) => new Promise((resolve) => s.close(resolve))));
    },
  };
}

function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 3000);
  try {
    const srv = await startServer({
      port,
      stateFile: process.env.STATE_FILE ?? 'state.json',
      questionsFile: process.env.QUESTIONS_FILE ?? 'questions.json',
    });
    console.log('Familiada wystartowała. Otwórz (start: linki + QR):');
    for (const host of ['localhost', ...lanAddresses()]) {
      if (srv.httpsPort) console.log(`  https://${host}:${srv.httpsPort}/`);
      console.log(`  http://${host}:${srv.port}/`);
    }
    if (srv.httpsPort) {
      console.log('Wejdź po HTTPS (na telefonach działa wtedy blokada wygaszania) — przy pierwszym wejściu zaakceptuj ostrzeżenie o certyfikacie.');
    }
  } catch (e) {
    if (e.code === 'EADDRINUSE') {
      console.error(`Port ${port} zajęty — zamknij drugą instancję albo ustaw PORT=inny.`);
    } else {
      console.error(e.message);
    }
    process.exit(1);
  }
}
