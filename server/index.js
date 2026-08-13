import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import QRCode from 'qrcode';
import { loadQuestions } from './questions.js';
import { createGame, apply } from './game.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

export async function startServer({ port, stateFile, questionsFile }) {
  const config = loadQuestions(questionsFile);

  let state;
  if (existsSync(stateFile)) {
    state = JSON.parse(readFileSync(stateFile, 'utf8'));
    state.config = config; // pytania zawsze świeże z pliku
  } else {
    state = createGame(config);
  }

  let seq = 0;
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
  const wss = new WebSocketServer({ server: httpServer });

  function snapshot(event) {
    return JSON.stringify({ type: 'state', seq, now: Date.now(), event, state });
  }

  wss.on('connection', (ws) => {
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
      if (cmd.type === 'timerStart') cmd.now = Date.now();
      let event;
      try {
        event = apply(state, cmd);
      } catch (e) {
        console.error('apply() rzuciło wyjątek, komenda odrzucona:', e);
        return;
      }
      const stateChanged = event !== null || wasSilentChange(cmd);
      if (!stateChanged) return;
      seq += 1;
      writeFileSync(stateFile, JSON.stringify(state));
      const data = snapshot(event);
      for (const client of wss.clients) {
        if (client.readyState === 1 /* OPEN */) client.send(data);
      }
    });
  });

  // Komendy "ciche" zmieniają stan, ale zwracają event null; mimo to trzeba
  // je rozgłosić. apply() zwraca null też dla komend odrzuconych — dla
  // prostoty rozgłaszamy każdą znaną komendę cichą bezwarunkowo (snapshot
  // idempotentny, nadmiarowy broadcast jest nieszkodliwy).
  const SILENT = new Set([
    'hide', 'unstrike', 'setBank', 'setTeamName', 'finalClear', 'timerStop',
    'introVideoEnded', 'stopMusic', 'resetBuzzers',
  ]);
  function wasSilentChange(cmd) {
    return SILENT.has(cmd.type);
  }

  await new Promise((resolve) => httpServer.listen(port, resolve));
  const actualPort = httpServer.address().port;

  return {
    port: actualPort,
    close: () =>
      new Promise((resolve) => {
        for (const c of wss.clients) c.terminate();
        httpServer.close(resolve);
      }),
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
    console.log('Familiada wystartowała. Otwórz:');
    for (const host of ['localhost', ...lanAddresses()]) {
      console.log(`  http://${host}:${srv.port}/  (start: linki + QR)`);
    }
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
