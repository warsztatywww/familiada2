import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import WebSocket from 'ws';
import { startServer } from '../server/index.js';

function nextMessage(ws) {
  return new Promise((resolve) => ws.once('message', (d) => resolve(JSON.parse(d))));
}

test('serwer: snapshot na wejściu, broadcast po komendzie, persystencja', async () => {
  const stateFile = 'test-state.json';
  rmSync(stateFile, { force: true });

  const srv1 = await startServer({ port: 0, stateFile, questionsFile: 'questions.json' });
  const port = srv1.port;

  const a = new WebSocket(`ws://127.0.0.1:${port}`);
  const first = await nextMessage(a);
  assert.equal(first.type, 'state');
  assert.equal(first.state.phase, 'idle');

  const b = new WebSocket(`ws://127.0.0.1:${port}`);
  await nextMessage(b);

  a.send(JSON.stringify({ type: 'command', cmd: { type: 'newRound', roundIndex: 0 } }));
  const [ma, mb] = await Promise.all([nextMessage(a), nextMessage(b)]);
  assert.equal(ma.state.phase, 'round');
  assert.equal(mb.event.type, 'new-round');
  assert.equal(ma.seq, mb.seq);

  // śmieciowe wiadomości nie zabijają serwera
  a.send('to nie jest json');
  a.send(JSON.stringify({ type: 'command', cmd: { type: 'nieistnieje' } }));

  a.close();
  b.close();
  await srv1.close();

  // restart wznawia stan z pliku
  const srv2 = await startServer({ port: 0, stateFile, questionsFile: 'questions.json' });
  const c = new WebSocket(`ws://127.0.0.1:${srv2.port}`);
  const resumed = await nextMessage(c);
  assert.equal(resumed.state.phase, 'round');
  c.close();
  await srv2.close();
  rmSync(stateFile, { force: true });
});

test('serwer: uszkodzona ramka WS nie ubija procesu', async () => {
  const stateFile = 'test-state-ws-garbage.json';
  rmSync(stateFile, { force: true });

  const srv = await startServer({ port: 0, stateFile, questionsFile: 'questions.json' });
  const port = srv.port;

  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  await new Promise((resolve) => ws.once('open', resolve));
  ws.on('error', () => {}); // spodziewany błąd po uszkodzonej ramce — ma nie zabić testu ani serwera
  ws._socket.write(Buffer.from([0x77, 0x77, 0x77, 0x77, 0x77, 0x77]));

  // serwer nadal odpowiada na kolejne żądanie HTTP zamiast się wywalić
  const res = await fetch(`http://127.0.0.1:${port}/qr.svg?data=x`);
  assert.equal(res.status, 200);
  await res.text();

  ws.terminate();
  await srv.close();
  rmSync(stateFile, { force: true });
});

test('serwer: /qr.svg z niepoprawnymi (za długimi) danymi zwraca 400 i nie ubija serwera', async () => {
  const stateFile = 'test-state-qr.json';
  rmSync(stateFile, { force: true });

  const srv = await startServer({ port: 0, stateFile, questionsFile: 'questions.json' });
  const port = srv.port;

  const tooLong = 'a'.repeat(5001);
  const badRes = await fetch(`http://127.0.0.1:${port}/qr.svg?data=${tooLong}`);
  assert.equal(badRes.status, 400);
  await badRes.text();

  // serwer nadal odpowiada na kolejne, poprawne żądanie
  const goodRes = await fetch(`http://127.0.0.1:${port}/qr.svg?data=http://example.com`);
  assert.equal(goodRes.status, 200);
  const body = await goodRes.text();
  assert.match(body, /<svg/);

  await srv.close();
  rmSync(stateFile, { force: true });
});
