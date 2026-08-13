# Zakrycie finału, globalne UNDO, uszczelnienie reguł — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zakrywanie odpowiedzi gracza 1 na tablicy w finale, globalne UNDO/REDO zamiast punktowych cofnięć oraz uszczelnienie strażników komend w maszynie stanów.

**Architecture:** Czysta maszyna stanów w `server/game.js` (funkcja `apply(state, cmd)` mutuje stan, zwraca event albo `null`), serwer WS w `server/index.js` rozgłasza pełne snapshoty. Undo/redo to nowy moduł `server/history.js` (stosy pełnych kopii stanu), wpinany w `index.js` — `apply()` nic o nim nie wie. Frontend to czyste JS bez build stepu: `public/host.js` (panel), `public/board.js` (tablica).

**Tech Stack:** Node.js ESM, `express` + `ws`, testy `node:test` (`npm test` uruchamia `node --test`), frontend vanilla JS.

**Spec:** `docs/superpowers/specs/2026-08-13-final-zakrycie-undo-walidacja-design.md`

## Global Constraints

- Komentarze w kodzie i teksty UI po polsku (styl istniejącego kodu).
- Bez nowych zależności npm; frontend bez build stepu.
- Komendy nieprawidłowe w bieżącym stanie: `apply()` zwraca `null` i nie zmienia stanu.
- Komendy „ciche" (event `null`, ale zmieniają stan) muszą być w zbiorze `SILENT` w `server/index.js`, inaczej broadcast nie pójdzie.
- Commity na `main`, prefiksy `feat:`/`fix:`/`chore:`/`docs:` po polsku.
- Po każdym tasku: `npm test` w pełni zielone.

---

### Task 1: Uszczelnienie strażników w `game.js` + przycisk „SUMA DLA NICH"

**Files:**
- Modify: `server/game.js` (case'y `choosePlayingTeam`, `strike`, `awardSum`, `introStart`, `repeatBuzzer`)
- Modify: `test/game.test.js`
- Modify: `public/host.html:32-47` (rzędy przycisków drużyn)
- Modify: `public/host.js:43-51` (disabled przycisków), `public/host.js:108-113` (handlery)

**Interfaces:**
- Consumes: istniejące `apply(state, cmd)` z `server/game.js`.
- Produces: zaostrzone strażniki — `strike` w stage `play` tylko dla `round.playingTeam`; `awardSum` tylko w stage `play`/`steal`; `choosePlayingTeam` zeruje `round.strikes`; `introStart` tylko w fazie `idle`; `repeatBuzzer` tylko w fazie `final`. Nowy przycisk `.btn-award` w każdym `.team-box` wysyła `{ type: 'awardSum', team }`.

- [ ] **Step 1: Napisz failing testy strażników**

Do `test/game.test.js` dopisz (po istniejącym teście `'choosePlayingTeam: przechodzi do gry'`):

```js
test('choosePlayingTeam: zeruje X-y z pytania startowego', () => {
  const state = freshRound(0);
  apply(state, { type: 'strike', team: 0 });
  apply(state, { type: 'strike', team: 1 });
  apply(state, { type: 'choosePlayingTeam', team: 0 });
  assert.deepEqual(state.round.strikes, [0, 0]);
});

test('strike w play: odrzucany dla drużyny niegrającej', () => {
  const state = freshRound(0);
  apply(state, { type: 'choosePlayingTeam', team: 0 });
  assert.equal(apply(state, { type: 'strike', team: 1 }), null);
  assert.deepEqual(state.round.strikes, [0, 0]);
});

test('strike w buzzers: dozwolony dla obu drużyn', () => {
  const state = freshRound(0);
  assert.equal(apply(state, { type: 'strike', team: 0 }).type, 'strike');
  assert.equal(apply(state, { type: 'strike', team: 1 }).type, 'strike');
  assert.deepEqual(state.round.strikes, [1, 1]);
});

test('awardSum: odrzucany w stage buzzers', () => {
  const state = freshRound(0);
  apply(state, { type: 'reveal', index: 0 });
  assert.equal(apply(state, { type: 'awardSum', team: 1 }), null);
  assert.equal(state.round.stage, 'buzzers');
  assert.equal(state.teams[1].bank, 0);
});

test('introStart: odrzucany poza fazą idle', () => {
  const state = freshRound(0);
  assert.equal(apply(state, { type: 'introStart' }), null);
  assert.equal(state.intro, 'off');
});

test('repeatBuzzer: odrzucany poza finałem', () => {
  const state = freshRound(0);
  assert.equal(apply(state, { type: 'repeatBuzzer' }), null);
});
```

Zaktualizuj istniejący test `'awardSum: ręczne przyznanie'` (awardSum nie działa już w `buzzers` — trzeba najpierw wybrać drużynę):

```js
test('awardSum: ręczne przyznanie', () => {
  const state = freshRound(0);
  apply(state, { type: 'choosePlayingTeam', team: 0 });
  apply(state, { type: 'reveal', index: 0 });
  const ev = apply(state, { type: 'awardSum', team: 1 });
  assert.equal(ev.type, 'sum-awarded');
  assert.equal(state.teams[1].bank, 50);
  assert.equal(state.round.stage, 'done');
});
```

- [ ] **Step 2: Uruchom testy — nowe mają failować**

Run: `npm test`
Expected: FAIL — 6 nowych testów czerwonych (m.in. `strikes` nie zerowane, `awardSum` przechodzi w buzzers, `introStart`/`repeatBuzzer` zwracają event).

- [ ] **Step 3: Zaostrz strażniki w `server/game.js`**

`choosePlayingTeam` — dodaj zerowanie X-ów:

```js
    case 'choosePlayingTeam': {
      if (state.phase !== 'round' || round.stage !== 'buzzers' || !isTeam(cmd.team)) return null;
      round.playingTeam = cmd.team;
      // X-y z pytania startowego to tylko sygnał "pudło" — gra właściwa startuje od zera
      round.strikes = [0, 0];
      round.stage = 'play';
      return { type: 'play-start', team: cmd.team };
    }
```

`strike` — w `play` tylko drużyna grająca (dodaj jedną linię po istniejącym sprawdzeniu stage):

```js
    case 'strike': {
      if (state.phase !== 'round' || !isTeam(cmd.team)) return null;
      if (round.stage !== 'buzzers' && round.stage !== 'play') return null;
      if (round.stage === 'play' && cmd.team !== round.playingTeam) return null;
      if (round.strikes[cmd.team] >= 3) return null;
```

`awardSum` — tylko `play`/`steal`:

```js
    case 'awardSum': {
      if (state.phase !== 'round' || !isTeam(cmd.team)) return null;
      if (round.stage !== 'play' && round.stage !== 'steal') return null;
      awardSumTo(state, cmd.team);
      return { type: 'sum-awarded', team: cmd.team };
    }
```

`introStart` — tylko `idle`:

```js
    case 'introStart': {
      if (state.phase !== 'idle') return null;
      state.intro = 'video';
      return { type: 'intro' };
    }
```

`repeatBuzzer` — tylko finał:

```js
    case 'repeatBuzzer':
      if (state.phase !== 'final') return null;
      return { type: 'repeat' };
```

- [ ] **Step 4: Uruchom testy — wszystkie zielone**

Run: `npm test`
Expected: PASS (całość, nie tylko nowe).

- [ ] **Step 5: Przycisk „SUMA DLA NICH" + disabled w panelu**

W `public/host.html` w obu `.team-box` (data-team="0" i data-team="1") dodaj przycisk do rzędu:

```html
      <div class="row">
        <button class="btn-strike">+ X</button>
        <button class="btn-unstrike">− X</button>
        <button class="btn-play">GRA TA DRUŻYNA</button>
        <button class="btn-award">SUMA DLA NICH</button>
      </div>
```

W `public/host.js` w pętli `for (const box of document.querySelectorAll('.team-box'))` w `render()` zastąp linię disabled `.btn-strike` i dodaj `.btn-award`:

```js
    box.querySelector('.btn-strike').disabled = !inRound ||
      (r.stage !== 'buzzers' && r.stage !== 'play') ||
      (r.stage === 'play' && t !== r.playingTeam);
    box.querySelector('.btn-award').disabled = !inRound || (r.stage !== 'play' && r.stage !== 'steal');
```

W sekcji akcji (druga pętla po `.team-box`) dodaj handler:

```js
  box.querySelector('.btn-award').onclick = () => send({ type: 'awardSum', team: t });
```

- [ ] **Step 6: Commit**

```bash
git add server/game.js test/game.test.js public/host.html public/host.js
git commit -m "feat: uszczelnienie strażników rundy + przycisk SUMA DLA NICH"
```

---

### Task 2: Zakrycie tablicy w finale (`final.covered` + `finalCover`)

**Files:**
- Modify: `server/game.js` (case `startFinal`, `finalSet`, nowy case `finalCover`)
- Modify: `server/index.js:97-100` (zbiór `SILENT`)
- Modify: `test/game.test.js`
- Modify: `public/board.js:164-170` (`finalCell`)
- Modify: `public/host.html:56-62` (rząd przycisków finału)
- Modify: `public/host.js` (render finału + handler)

**Interfaces:**
- Consumes: `apply()`, helper testowy `freshFinal()` z `test/game.test.js`, `finalCell(f, player, qIndex)` z `board.js`.
- Produces: pole `state.final.covered` (boolean), komenda `finalCover { covered: boolean }` (cicha, tylko faza `final`), `finalSet` odrzucany gdy `covered`. Przycisk `#btn-final-cover` w panelu.

- [ ] **Step 1: Napisz failing testy**

Do `test/game.test.js` (po testach finału):

```js
test('finalCover: przełącza zakrycie tylko w finale', () => {
  const state = freshFinal();
  assert.equal(state.final.covered, false);
  assert.equal(apply(state, { type: 'finalCover', covered: true }), null); // komenda cicha
  assert.equal(state.final.covered, true);
  apply(state, { type: 'finalCover', covered: false });
  assert.equal(state.final.covered, false);
});

test('finalCover: odrzucany poza finałem i bez boolean', () => {
  const state = freshRound(0);
  assert.equal(apply(state, { type: 'finalCover', covered: true }), null);
  assert.equal(state.final, null);
  const f = freshFinal();
  apply(f, { type: 'finalCover', covered: 'tak' });
  assert.equal(f.final.covered, false);
});

test('finalSet: odrzucany przy zakrytej tablicy', () => {
  const state = freshFinal();
  apply(state, { type: 'finalCover', covered: true });
  assert.equal(apply(state, { type: 'finalSet', qIndex: 0, player: 0, answerIndex: 0 }), null);
  assert.equal(state.final.sum, 0);
  assert.equal(state.final.entries[0][0], null);
});

test('covered przeżywa round-trip JSON (persystencja)', () => {
  const state = freshFinal();
  apply(state, { type: 'finalCover', covered: true });
  const restored = JSON.parse(JSON.stringify(state));
  assert.equal(restored.final.covered, true);
});
```

- [ ] **Step 2: Uruchom testy — nowe failują**

Run: `npm test`
Expected: FAIL — `state.final.covered` jest `undefined`, `finalSet` przechodzi mimo zakrycia.

- [ ] **Step 3: Implementacja w `server/game.js`**

W `startFinal` dodaj pole do obiektu finału:

```js
      state.final = {
        questions: state.config.final,
        entries: [Array(5).fill(null), Array(5).fill(null)],
        sum: 0,
        won: false,
        covered: false,
        timer: null,
      };
```

W `finalSet` rozszerz strażnik fazy (pierwsza linia po `const f`):

```js
      if (state.phase !== 'final' || f.covered) return null;
```

Nowy case (obok `finalSet`):

```js
    case 'finalCover': {
      // Zakrycie odpowiedzi na tablicy na czas wejścia gracza 2. Komenda cicha.
      if (state.phase !== 'final' || typeof cmd.covered !== 'boolean') return null;
      state.final.covered = cmd.covered;
      return null;
    }
```

W `server/index.js` dopisz `'finalCover'` do `SILENT`:

```js
  const SILENT = new Set([
    'hide', 'unstrike', 'setBank', 'setTeamName', 'finalClear', 'timerStop',
    'introVideoEnded', 'stopMusic', 'resetBuzzers', 'finalCover',
  ]);
```

Uwaga: stary `state.json` bez pola `covered` daje `undefined` → falsy — działa bez migracji.

- [ ] **Step 4: Uruchom testy — zielone**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Tablica — zakryte wiersze**

W `public/board.js` w `finalCell` dodaj warunek zakrycia:

```js
function finalCell(f, player, qIndex) {
  const entry = f.entries[player][qIndex];
  if (f.covered || entry === null) return `<span class="text">${'-'.repeat(12)}</span><span class="pts">--</span>`;
  if (entry.answerIndex === null) return `<span class="text">${'—'.repeat(6)}</span><span class="pts">0</span>`;
  const a = f.questions[qIndex].answers[entry.answerIndex];
  return `<span class="text">${a.text}</span><span class="pts">${a.points}</span>`;
}
```

SUMA finału zostaje widoczna — bez zmian w `renderFinal`.

- [ ] **Step 6: Panel — przycisk-przełącznik + wyszarzenie odpowiedzi**

W `public/host.html` do rzędu przycisków finału (za `#btn-repeat`):

```html
      <button id="btn-repeat" class="danger">POWTÓRZONA!</button>
      <button id="btn-final-cover">ZAKRYJ TABLICĘ</button>
```

W `public/host.js` w bloku `if (state.phase === 'final')` w `render()` dodaj etykietę oraz `disabled` na przyciskach odpowiedzi, gdy zakryte:

```js
    $('#btn-final-cover').textContent = f.covered ? 'ODKRYJ TABLICĘ' : 'ZAKRYJ TABLICĘ';
```

a w funkcji `player(p)` generującej przyciski odpowiedzi zamień atrybut disabled tak, by zakrycie blokowało wszystkie przyciski wpisu:

```js
        const buttons = q.answers.map((a, ai) => {
          const used = otherEntry && otherEntry.answerIndex === ai;
          return `<button data-q="${qi}" data-p="${p}" data-a="${ai}" class="${used ? 'used' : ''}" ${used || f.covered ? 'disabled' : ''}>${a.text} (${a.points})</button>`;
        }).join('');
        return `<div class="player"><span>Gracz ${p + 1}</span>${buttons}` +
          `<button data-q="${qi}" data-p="${p}" data-a="null" ${f.covered ? 'disabled' : ''}>PUDŁO — 0 pkt</button></div>`;
```

Na końcu sekcji akcji finału dodaj handler:

```js
$('#btn-final-cover').onclick = () => send({ type: 'finalCover', covered: !current.state.final.covered });
```

- [ ] **Step 7: Ręczna weryfikacja**

Run: `npm start`, otwórz `/board` i `/host`. Kliknij „Finał", wpisz 2–3 odpowiedzi gracza 1, kliknij „ZAKRYJ TABLICĘ" → wiersze na tablicy wracają do kresek, SUMA zostaje; przyciski odpowiedzi w panelu wyszarzone; „ODKRYJ TABLICĘ" przywraca wpisy bez dźwięku. Odśwież `/board` przy zakrytej tablicy → nadal zakryta.

- [ ] **Step 8: Commit**

```bash
git add server/game.js server/index.js test/game.test.js public/board.js public/host.html public/host.js
git commit -m "feat: zakrycie tablicy w finale na wejście gracza 2 (finalCover)"
```

---

### Task 3: Moduł historii `server/history.js`

**Files:**
- Create: `server/history.js`
- Test: `test/history.test.js`

**Interfaces:**
- Consumes: nic (czysty moduł bez zależności).
- Produces: `createHistory(cap = 100)` → obiekt `{ push(label, stateBefore), undo(current), redo(current), undoLabel(), redoLabel() }`; `undo`/`redo` zwracają przywrócony stan albo `null`; `undoLabel`/`redoLabel` zwracają string albo `null`. Oraz `describeCommand(cmd, stateBefore)` → polska etykieta akcji (string). Task 4 wpina oba w `index.js`.

- [ ] **Step 1: Napisz failing testy**

Utwórz `test/history.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHistory, describeCommand } from '../server/history.js';

test('undo/redo: przywraca stany i etykiety', () => {
  const h = createHistory();
  assert.equal(h.undo({ v: 9 }), null); // pusty stos
  assert.equal(h.undoLabel(), null);
  h.push('akcja A', { v: 0 });
  h.push('akcja B', { v: 1 });
  assert.equal(h.undoLabel(), 'akcja B');
  const restored = h.undo({ v: 2 });
  assert.deepEqual(restored, { v: 1 });
  assert.equal(h.redoLabel(), 'akcja B');
  const redone = h.redo(restored);
  assert.deepEqual(redone, { v: 2 });
  assert.equal(h.undoLabel(), 'akcja B');
  assert.equal(h.redoLabel(), null);
});

test('nowa akcja czyści stos redo', () => {
  const h = createHistory();
  h.push('A', { v: 0 });
  h.undo({ v: 1 });
  h.push('B', { v: 5 });
  assert.equal(h.redoLabel(), null);
  assert.equal(h.redo({ v: 9 }), null);
});

test('cap: najstarsze wpisy wypadają', () => {
  const h = createHistory(2);
  h.push('A', { v: 0 });
  h.push('B', { v: 1 });
  h.push('C', { v: 2 });
  assert.deepEqual(h.undo({}), { v: 2 });
  assert.deepEqual(h.undo({}), { v: 1 });
  assert.equal(h.undo({}), null); // wpis 'A' wypadł przez cap
});

test('describeCommand: polskie etykiety akcji', () => {
  const state = {
    teams: [{ name: 'Lewa' }, { name: 'Prawa' }],
    round: { answers: [{ text: 'COBOL' }] },
  };
  assert.equal(describeCommand({ type: 'strike', team: 0 }, state), 'X dla: Lewa');
  assert.equal(describeCommand({ type: 'reveal', index: 0 }, state), 'odkrycie: COBOL');
  assert.equal(describeCommand({ type: 'reveal', index: 5 }, state), 'odkrycie: #6');
  assert.equal(describeCommand({ type: 'newRound', roundIndex: 2 }, state), 'nowa runda 3');
  assert.equal(describeCommand({ type: 'buzz', team: 1 }, state), 'buzzer: Prawa');
  assert.equal(describeCommand({ type: 'finalCover', covered: true }, state), 'zakrycie tablicy');
  assert.equal(describeCommand({ type: 'finalSet', qIndex: 0, player: 1 }, state), 'finał: gracz 2, pyt. 1');
  assert.equal(describeCommand({ type: 'newGame' }, state), 'nowa gra');
  assert.equal(describeCommand({ type: 'cosNieznanego' }, state), 'cosNieznanego');
});
```

- [ ] **Step 2: Uruchom testy — failują (brak modułu)**

Run: `npm test`
Expected: FAIL — `Cannot find module '../server/history.js'`.

- [ ] **Step 3: Implementacja `server/history.js`**

```js
// server/history.js
// Stosy undo/redo pełnych kopii stanu gry + polskie etykiety akcji dla panelu
// hosta. Wpis na stosie undo trzyma stan SPRZED akcji `label`; undo() oddaje
// go i odkłada stan bieżący na stos redo. Kopie robi wołający (index.js).

export function createHistory(cap = 100) {
  const undoStack = []; // { label, state }
  const redoStack = [];
  return {
    push(label, stateBefore) {
      undoStack.push({ label, state: stateBefore });
      if (undoStack.length > cap) undoStack.shift();
      redoStack.length = 0;
    },
    undo(current) {
      const entry = undoStack.pop();
      if (!entry) return null;
      redoStack.push({ label: entry.label, state: current });
      return entry.state;
    },
    redo(current) {
      const entry = redoStack.pop();
      if (!entry) return null;
      undoStack.push({ label: entry.label, state: current });
      return entry.state;
    },
    undoLabel: () => undoStack.at(-1)?.label ?? null,
    redoLabel: () => redoStack.at(-1)?.label ?? null,
  };
}

export function describeCommand(cmd, state) {
  const team = () => state.teams?.[cmd.team]?.name ?? `drużyna ${cmd.team + 1}`;
  switch (cmd.type) {
    case 'newRound': return `nowa runda ${cmd.roundIndex + 1}`;
    case 'buzz': return `buzzer: ${team()}`;
    case 'resetBuzzers': return 'uzbrojenie buzzerów';
    case 'choosePlayingTeam': return `gra: ${team()}`;
    case 'reveal': return `odkrycie: ${state.round?.answers?.[cmd.index]?.text ?? `#${cmd.index + 1}`}`;
    case 'strike': return `X dla: ${team()}`;
    case 'stealFail': return 'przejęcie: pudło';
    case 'awardSum': return `suma dla: ${team()}`;
    case 'setBank': return `bank ${team()} = ${cmd.value}`;
    case 'setTeamName': return 'zmiana nazwy drużyny';
    case 'startFinal': return 'start finału';
    case 'finalSet': return `finał: gracz ${cmd.player + 1}, pyt. ${cmd.qIndex + 1}`;
    case 'finalCover': return cmd.covered ? 'zakrycie tablicy' : 'odkrycie tablicy';
    case 'timerStart': return `timer ${cmd.seconds} s`;
    case 'timerStop': return 'stop timera';
    case 'repeatBuzzer': return 'powtórzona';
    case 'introStart': return 'intro';
    case 'stopMusic': return 'stop muzyki';
    case 'endGame': return 'koniec gry';
    case 'newGame': return 'nowa gra';
    default: return cmd.type;
  }
}
```

- [ ] **Step 4: Uruchom testy — zielone**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/history.js test/history.test.js
git commit -m "feat: moduł historii undo/redo z etykietami akcji"
```

---

### Task 4: Undo/redo w serwerze (`index.js`) + etykiety w snapshocie

**Files:**
- Modify: `server/index.js` (import, obsługa `undo`/`redo`, push historii, `snapshot()`, refaktor broadcastu)
- Test: `test/server.test.js`

**Interfaces:**
- Consumes: `createHistory`, `describeCommand` z `server/history.js` (Task 3).
- Produces: snapshot WS rozszerzony o pola `undoLabel` i `redoLabel` (string albo `null`) — Task 5 czyta je w panelu. Komendy `{ type: 'undo' }` / `{ type: 'redo' }` obsługiwane w `index.js` (nie w `game.js`); broadcast po nich ma `event: null` (bez dźwięków). `introVideoEnded` nie tworzy wpisu historii.

- [ ] **Step 1: Napisz failing test integracyjny**

Do `test/server.test.js` dopisz:

```js
test('serwer: undo/redo przywraca stan i rozsyła etykiety', async () => {
  const stateFile = 'test-state-undo.json';
  rmSync(stateFile, { force: true });
  const srv = await startServer({ port: 0, stateFile, questionsFile: 'questions.json' });
  const ws = new WebSocket(`ws://127.0.0.1:${srv.port}`);
  const send = (cmd) => ws.send(JSON.stringify({ type: 'command', cmd }));
  const first = await nextMessage(ws);
  assert.equal(first.undoLabel, null);
  assert.equal(first.redoLabel, null);

  // introVideoEnded zmienia stan, ale nie tworzy wpisu historii
  send({ type: 'introStart' });
  const afterIntro = await nextMessage(ws);
  assert.equal(afterIntro.undoLabel, 'intro');
  send({ type: 'introVideoEnded' });
  const afterVideo = await nextMessage(ws);
  assert.equal(afterVideo.state.intro, 'music');
  assert.equal(afterVideo.undoLabel, 'intro'); // wierzch stosu bez zmian

  send({ type: 'newRound', roundIndex: 0 });
  const afterRound = await nextMessage(ws);
  assert.equal(afterRound.state.phase, 'round');
  assert.equal(afterRound.undoLabel, 'nowa runda 1');

  send({ type: 'undo' });
  const afterUndo = await nextMessage(ws);
  assert.equal(afterUndo.state.phase, 'idle');
  assert.equal(afterUndo.event, null); // bez dźwięków na tablicy
  assert.equal(afterUndo.undoLabel, 'intro');
  assert.equal(afterUndo.redoLabel, 'nowa runda 1');

  send({ type: 'redo' });
  const afterRedo = await nextMessage(ws);
  assert.equal(afterRedo.state.phase, 'round');
  assert.equal(afterRedo.undoLabel, 'nowa runda 1');
  assert.equal(afterRedo.redoLabel, null);

  // dwa undo opróżniają stos; trzecie jest ignorowane (bez broadcastu),
  // a kolejna komenda czyści stos redo
  send({ type: 'undo' });
  await nextMessage(ws); // powrót do idle (intro 'music')
  send({ type: 'undo' });
  await nextMessage(ws); // powrót sprzed intro
  send({ type: 'undo' }); // pusty stos — cisza
  send({ type: 'newRound', roundIndex: 0 });
  const afterR2 = await nextMessage(ws); // pierwszy broadcast po pustym undo
  assert.equal(afterR2.state.phase, 'round');
  assert.equal(afterR2.undoLabel, 'nowa runda 1');
  assert.equal(afterR2.redoLabel, null); // nowa akcja wyczyściła redo

  ws.close();
  await srv.close();
  rmSync(stateFile, { force: true });
});
```

- [ ] **Step 2: Uruchom testy — failuje**

Run: `npm test`
Expected: FAIL — snapshot nie ma `undoLabel`, komenda `undo` jest ignorowana (nieznana w `apply()`).

- [ ] **Step 3: Implementacja w `server/index.js`**

Import na górze:

```js
import { createGame, apply } from './game.js';
import { createHistory, describeCommand } from './history.js';
```

W `startServer` po utworzeniu stanu:

```js
  let seq = 0;
  const history = createHistory(100);
```

`snapshot()` z etykietami:

```js
  function snapshot(event) {
    return JSON.stringify({
      type: 'state', seq, now: Date.now(), event, state,
      undoLabel: history.undoLabel(), redoLabel: history.redoLabel(),
    });
  }
```

Wydziel wspólny broadcast (dotychczasowa końcówka handlera `message`):

```js
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
```

Handler `message` po sparsowaniu komendy — najpierw undo/redo (to operacja na historii, `apply()` ich nie zna), potem normalna ścieżka z kopią stanu sprzed akcji:

```js
      const cmd = msg.cmd;
      if (cmd.type === 'undo' || cmd.type === 'redo') {
        const restored = cmd.type === 'undo' ? history.undo(state) : history.redo(state);
        if (!restored) return;
        state = restored;
        state.config = config; // pytania zawsze świeże, jak przy wczytaniu z pliku
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
      // introVideoEnded to automat z tablicy — nie zaśmieca wierzchu stosu undo
      if (cmd.type !== 'introVideoEnded') history.push(describeCommand(cmd, before), before);
      broadcast(event);
```

Uwaga: `state` musi pozostać zadeklarowane przez `let` (już jest) — undo podmienia obiekt, a `snapshot()`/`broadcast()` czytają zmienną, nie stary obiekt.

- [ ] **Step 4: Uruchom testy — zielone**

Run: `npm test`
Expected: PASS (w tym stare testy serwera — snapshot ma nowe pola, ale stare asercje nie sprawdzają ich braku).

- [ ] **Step 5: Commit**

```bash
git add server/index.js test/server.test.js
git commit -m "feat: globalne undo/redo na serwerze + etykiety akcji w snapshocie"
```

---

### Task 5: Przyciski COFNIJ/PONÓW w panelu hosta

**Files:**
- Modify: `public/host.html:81-89` (stopka)
- Modify: `public/host.js` (sygnatura `render`, obsługa etykiet, handlery)

**Interfaces:**
- Consumes: pola `undoLabel`/`redoLabel` ze snapshotu (Task 4); komendy `{ type: 'undo' }`, `{ type: 'redo' }`.
- Produces: przyciski `#btn-undo` / `#btn-redo` w stopce panelu, z etykietą akcji do cofnięcia.

- [ ] **Step 1: Stopka w `public/host.html`**

```html
<footer id="bottombar">
  <button id="btn-undo">⟲ COFNIJ</button>
  <button id="btn-redo">⟳ PONÓW</button>
  <button id="btn-prev-round">◀ Poprzednia</button>
  <button id="btn-new-round">Nowa runda</button>
  <button id="btn-next-round">Następna ▶</button>
  <div class="spacer"></div>
  <button id="btn-final">Finał</button>
  <button id="btn-end-game">Koniec gry</button>
  <button id="btn-new-game" class="danger">Nowa gra</button>
</footer>
```

- [ ] **Step 2: `render` dostaje cały snapshot**

W `public/host.js` zmień wywołanie i sygnaturę — etykiety undo żyją obok stanu:

```js
const game = connectGame((msg) => {
  current = msg;
  render(msg);
});
```

```js
function render(msg) {
  const state = msg.state;
```

(reszta ciała `render` bez zmian — używa `state` jak dotąd). Na końcu `render` dodaj:

```js
  const undoBtn = $('#btn-undo');
  undoBtn.disabled = !msg.undoLabel;
  undoBtn.textContent = msg.undoLabel ? `⟲ COFNIJ: ${msg.undoLabel}` : '⟲ COFNIJ';
  const redoBtn = $('#btn-redo');
  redoBtn.disabled = !msg.redoLabel;
  redoBtn.textContent = msg.redoLabel ? `⟳ PONÓW: ${msg.redoLabel}` : '⟳ PONÓW';
```

W sekcji akcji:

```js
$('#btn-undo').onclick = () => send({ type: 'undo' });
$('#btn-redo').onclick = () => send({ type: 'redo' });
```

- [ ] **Step 3: Ręczna weryfikacja**

Run: `npm start`, otwórz `/host` i `/board`. Nowa runda → przycisk pokazuje „⟲ COFNIJ: nowa runda 1"; odkryj odpowiedź → „⟲ COFNIJ: odkrycie: …"; COFNIJ przywraca stan na tablicy **bez dźwięku**; PONÓW powtarza; nowa akcja wyszarza PONÓW. Przy pustych stosach oba przyciski wyszarzone.

- [ ] **Step 4: Commit**

```bash
git add public/host.html public/host.js
git commit -m "feat: przyciski COFNIJ/PONÓW z etykietą akcji na panelu hosta"
```

---

### Task 6: Usunięcie cofnięć punktowych (`hide`/`unstrike`/`finalClear`) + README

**Files:**
- Modify: `server/game.js` (usuń 3 case'y)
- Modify: `server/index.js` (zbiór `SILENT`)
- Modify: `test/game.test.js` (usuń 5 testów, dodaj 1)
- Modify: `public/host.html:32-47` (usuń `− X`)
- Modify: `public/host.js` (handlery kliknięć, skróty, render finału)
- Modify: `public/host.css:54` (selektor `.chosen`)
- Modify: `README.md` (skróty, przyciski, smoke test)

**Interfaces:**
- Consumes: globalne undo (Taski 3–5) jako zamiennik cofnięć punktowych.
- Produces: `apply()` odrzuca `hide`/`unstrike`/`finalClear` (lecą w `default` → `null`); panel bez przycisków `− X` i „— cofnij"; klik/skrót na odkrytej odpowiedzi to no-op.

- [ ] **Step 1: Zamień testy cofnięć punktowych na test odrzucania**

W `test/game.test.js` usuń w całości testy:
- `'hide: cofa odkrycie i punkty przed rozstrzygnięciem'`
- `'hide po rozstrzygnięciu: działa tylko na tanich odkryciach'`
- `'unstrike: cofa X i wychodzi z przejęcia'`
- `'unstrike: zwraca null gdy strikes === 0'`
- `'finalClear: cofa wpis i przelicza sumę'`

Dodaj test:

```js
test('usunięte komendy hide/unstrike/finalClear są odrzucane', () => {
  const state = freshRound(0);
  apply(state, { type: 'choosePlayingTeam', team: 0 });
  apply(state, { type: 'reveal', index: 0 });
  apply(state, { type: 'strike', team: 0 });
  assert.equal(apply(state, { type: 'hide', index: 0 }), null);
  assert.equal(apply(state, { type: 'unstrike', team: 0 }), null);
  assert.equal(state.round.answers[0].revealed, true);
  assert.equal(state.round.strikes[0], 1);
  const f = freshFinal();
  apply(f, { type: 'finalSet', qIndex: 0, player: 0, answerIndex: 0 });
  assert.equal(apply(f, { type: 'finalClear', qIndex: 0, player: 0 }), null);
  assert.equal(f.final.sum, 90);
});
```

- [ ] **Step 2: Uruchom testy — nowy test failuje**

Run: `npm test`
Expected: FAIL — `hide`/`unstrike`/`finalClear` wciąż zmieniają stan.

- [ ] **Step 3: Usuń komendy z `server/game.js` i `SILENT` w `server/index.js`**

Usuń w całości case'y `'hide'`, `'unstrike'`, `'finalClear'` z `apply()` (nieznane komendy trafiają w `default: return null`). W `server/index.js` odchudź `SILENT`:

```js
  const SILENT = new Set([
    'setBank', 'setTeamName', 'timerStop',
    'introVideoEnded', 'stopMusic', 'resetBuzzers', 'finalCover',
  ]);
```

- [ ] **Step 4: Uruchom testy — zielone**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Panel — usuń UI cofnięć punktowych**

`public/host.html`: usuń `<button class="btn-unstrike">− X</button>` z obu `.team-box`.

`public/host.js`:

1. W `render()` usuń linię `box.querySelector('.btn-unstrike').disabled = …`.
2. W pętli akcji usuń linię `box.querySelector('.btn-unstrike').onclick = …`.
3. Klik na liście odpowiedzi — tylko odkrywanie (serwer odrzuci ponowne):

```js
$('#host-answers').addEventListener('click', (e) => {
  const btn = e.target.closest('button.answer');
  if (!btn) return;
  send({ type: 'reveal', index: Number(btn.dataset.index) });
});
```

4. Skróty `1`–`6` — tylko odkrywanie:

```js
  if (e.key >= '1' && e.key <= '6') {
    send({ type: 'reveal', index: Number(e.key) - 1 });
  }
```

5. W renderze finału wpisany wybór to zwykła etykieta (bez „— cofnij"):

```js
        if (entry !== null) {
          const label = entry.answerIndex === null
            ? 'PUDŁO (0 pkt)'
            : `${q.answers[entry.answerIndex].text} (${q.answers[entry.answerIndex].points})`;
          return `<div class="player"><span>Gracz ${p + 1}</span><span class="chosen">${label}</span></div>`;
        }
```

6. W handlerze kliknięć finału usuń linię `if (btn.hasAttribute('data-clear')) return send({ type: 'finalClear', qIndex, player });`.

`public/host.css`: selektor `.final-q button.chosen` zamień na `.final-q .chosen` (etykieta to teraz `<span>`); dodaj `display: inline-block; padding: 0.4rem 0.6rem;` jeśli po podmianie etykieta wizualnie się rozjeżdża z przyciskami obok.

- [ ] **Step 6: README — sterowanie i smoke test**

W `README.md`:

1. Tabela skrótów, wiersz `1`–`6`: `odkryj / schowaj odpowiedź…` → `odkryj odpowiedź o danym numerze (cofanie: ⟲ COFNIJ)`.
2. Lista przycisków: wiersz `- **+ X / − X** …` zamień na:

```markdown
- **+ X** (na drużynę) — dodaje przewinienie (odpowiednik `Q`/`W`); w grze
  właściwej aktywny tylko dla drużyny grającej.
- **SUMA DLA NICH** (na drużynę) — ręczne przyznanie sumy rundy do banku.
- **⟲ COFNIJ / ⟳ PONÓW** — globalne cofnięcie ostatniej akcji (etykieta na
  przycisku mówi, co zostanie cofnięte); zastępuje dawne `− X`, chowanie
  odpowiedzi i „cofnij" w finale. Historia żyje w pamięci serwera — restart
  serwera ją czyści (gra trwa dalej).
```

3. W punkcie o sekcji finału dopisz: `**ZAKRYJ/ODKRYJ TABLICĘ** chowa odpowiedzi gracza 1 na czas wejścia gracza 2 (SUMA zostaje widoczna).`
4. Smoke test, punkt 5: `Odkrycia (`1`–`6`), X-y (`Q`/`W`), przejęcie, przyznanie sumy do banku, ⟲ COFNIJ ostatniej akcji — dźwięki i tablica spójne ze stanem panelu.`
5. Smoke test, punkt 6, dopisz na końcu: `zakrycie i odkrycie tablicy przy wejściu gracza 2.`

- [ ] **Step 7: Ręczna weryfikacja całości**

Run: `npm start`; przejdź smoke test z README (punkty 4–6): odkrycie → klik na odkrytej nic nie robi → COFNIJ chowa i oddaje punkty; 3 X → przejęcie → COFNIJ wraca do gry (dawny `unstrike`); finał: wpis → COFNIJ czyści wpis i sumę (dawny `finalClear`).

- [ ] **Step 8: Commit**

```bash
git add server/game.js server/index.js test/game.test.js public/host.html public/host.js public/host.css README.md
git commit -m "feat: globalne undo zastępuje cofnięcia punktowe (hide/unstrike/finalClear)"
```
