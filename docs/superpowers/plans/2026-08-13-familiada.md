# Familiada 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplikacja do prowadzenia gry Familiada: tablica na projektor (`/board`), panel prowadzącego (`/host`), buzzery (`/buzzer/1`, `/buzzer/2`) — wszystko po LAN z jednego serwera Node.

**Architecture:** Autorytatywny serwer stanu: czysta maszyna stanów gry (`server/game.js`, bez sieci/DOM) + cienki serwer WebSocket (`server/index.js`), który przyjmuje komendy JSON, aplikuje je i rozgłasza pełny snapshot stanu do wszystkich klientów. Frontend to statyczne pliki vanilla JS bez build stepu. Stan po każdej komendzie zapisywany do `state.json`.

**Tech Stack:** Node ≥ 18 (ESM, `node:test`), `express`, `ws`, `qrcode`. Frontend bez zależności.

**Spec:** `docs/superpowers/specs/2026-08-13-familiada-design.md`

## Global Constraints

- Node ≥ 18, `"type": "module"` (ESM wszędzie, także testy).
- Zależności npm: wyłącznie `express`, `ws`, `qrcode`. Frontend: zero bibliotek, zero build stepu.
- **Żadnych zasobów z sieci** (fonty, CSS, JS z CDN) — apka działa na evencie bez internetu.
- Cały tekst UI po polsku.
- Dźwięki odtwarza wyłącznie tablica (`/board`), nigdy panel hosta ani buzzery.
- Maks. 6 odpowiedzi w rundzie; finał ma dokładnie 5 pytań (albo brak sekcji `final`).
- Komendy nieprawidłowe w danym stanie serwer ignoruje (nie crashuje, nie zmienia stanu).
- Testy: `npm test` = `node --test test/`.
- Commit po każdym tasku (repo już zainicjalizowane, branch `main`).

## Design tokens (obowiązują w taskach frontendowych)

**Tablica (`/board`)** — replika TV:

```css
:root {
  --bg: #000;
  --board-bg: #07120a;        /* bardzo ciemna zieleń modułów tablicy */
  --lit: #ffd94a;             /* zapalone diody (żółty) */
  --lit-glow: rgba(255, 217, 74, 0.35);
  --unlit: #142016;           /* niezapalone diody — ledwo widoczne */
  --x-red: #ff3b30;
  font-family: 'Familiada', monospace;
}
```

- `@font-face { font-family: 'Familiada'; src: url('/assets/fonts/familiada.ttf'); }`
- Element podpisu: **siatka niezapalonych diod** na całej planszy —
  `background-image: radial-gradient(circle, var(--unlit) 1.2px, transparent 1.4px); background-size: 6px 6px;` na kontenerze planszy + `text-shadow: 0 0 12px var(--lit-glow)` na zapalonych znakach.
- Tablica NIE pokazuje treści pytania (jak w TV — prowadzący czyta na głos).
- Rozmiary czcionek w `vw`/`vh` (fullscreen na dowolnym projektorze), tekst odpowiedzi `clamp`owany.

**Panel hosta (`/host`)** — reżyserka TV:

```css
:root {
  --bg: #111318; --card: #1a1e26; --border: #2a2f3a;
  --text: #e8eaf0; --muted: #8a93a5; --accent: #ffb300; /* "on air" amber */
  --team0: #3d8bfd; /* Lewa */ --team1: #ff4d4d; /* Prawa */
  font-family: system-ui, sans-serif;
}
```

- Przyciski min. 56 px wysokości (obsługa palcem na tablecie), stany `:disabled` wyraźnie wygaszone.
- Pasek stanu gry zawsze widoczny na górze.

**Buzzer (`/buzzer/N`)** — cały ekran jest przyciskiem, tło w kolorze drużyny (`--team0`/`--team1`).

---

### Task 1: Szkielet projektu i assety

**Files:**
- Create: `package.json`, `.gitignore`
- Create: `public/assets/fonts/familiada.ttf`, `public/assets/sounds/{correct.mp3,error.mp3,brawo.wav}`, `public/assets/video/czolowka.mp4`, `public/assets/audio/intro.webm` (kopie z `Familiada-src/` i katalogu głównego)

**Interfaces:**
- Produces: ścieżki assetów `/assets/...` używane przez wszystkie strony; `npm test` i `npm start` jako standardowe komendy.

- [ ] **Step 1: package.json i .gitignore**

```json
{
  "name": "familiada2",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node server/index.js",
    "test": "node --test test/"
  },
  "dependencies": {
    "express": "^4.19.0",
    "qrcode": "^1.5.0",
    "ws": "^8.18.0"
  }
}
```

`.gitignore`:

```
node_modules/
state.json
```

- [ ] **Step 2: Instalacja zależności**

Run: `npm install`
Expected: bez błędów, powstaje `package-lock.json`.

- [ ] **Step 3: Kopia assetów pod nowe, czyste nazwy**

```bash
mkdir -p public/assets/fonts public/assets/sounds public/assets/video public/assets/audio
cp Familiada-src/font/familiada.ttf public/assets/fonts/
cp Familiada-src/sounds/correct.mp3 Familiada-src/sounds/error.mp3 Familiada-src/sounds/brawo.wav public/assets/sounds/
cp "Familiada-src/Familiada - czoêówka.-48kEC0XJvIY.mp4" public/assets/video/czolowka.mp4
cp "Familiada intro-WjaGpNT-Qbw.webm" public/assets/audio/intro.webm
```

(Uwaga: `intro.webm` to **samo audio** czołówki, `czolowka.mp4` to **samo wideo** — patrz spec.)

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .gitignore public/assets
git commit -m "chore: szkielet projektu i assety ze starej wersji"
```

---

### Task 2: Moduł pytań — walidacja i przykładowy plik

**Files:**
- Create: `server/questions.js`
- Create: `questions.json`
- Test: `test/questions.test.js`

**Interfaces:**
- Produces:
  - `validateQuestions(data) -> config` — rzuca `Error` z polskim komunikatem przy złych danych; zwraca znormalizowany obiekt `{ teams: [string, string], rounds: [{question, multiplier, answers: [{text, points}]}], final: [] | [5 × {question, answers}] }`.
  - `loadQuestions(path) -> config` — czyta plik, parsuje JSON, woła `validateQuestions`.

- [ ] **Step 1: Failing testy walidacji**

```js
// test/questions.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateQuestions } from '../server/questions.js';

const okRound = {
  question: 'Pytanie?',
  answers: [{ text: 'A', points: 30 }, { text: 'B', points: 10 }],
};

test('akceptuje poprawny config i uzupełnia domyślne', () => {
  const c = validateQuestions({ rounds: [okRound] });
  assert.deepEqual(c.teams, ['Lewa', 'Prawa']);
  assert.equal(c.rounds[0].multiplier, 1);
  assert.deepEqual(c.final, []);
});

test('odrzuca brak rund', () => {
  assert.throws(() => validateQuestions({ rounds: [] }), /rundy/i);
});

test('odrzuca > 6 odpowiedzi w rundzie', () => {
  const answers = 'ABCDEFG'.split('').map((t) => ({ text: t, points: 1 }));
  assert.throws(() => validateQuestions({ rounds: [{ question: 'Q', answers }] }), /6/);
});

test('odrzuca finał inny niż 5 pytań', () => {
  assert.throws(
    () => validateQuestions({ rounds: [okRound], final: [okRound] }),
    /5 pytań/i
  );
});

test('odrzuca odpowiedź bez punktów', () => {
  assert.throws(
    () => validateQuestions({ rounds: [{ question: 'Q', answers: [{ text: 'A' }] }] }),
    /points/i
  );
});
```

- [ ] **Step 2: Run — verify FAIL**

Run: `npm test`
Expected: FAIL — `Cannot find module '../server/questions.js'`.

- [ ] **Step 3: Implementacja**

```js
// server/questions.js
import { readFileSync } from 'node:fs';

function fail(msg) {
  throw new Error(`Błąd w pliku pytań: ${msg}`);
}

function validateAnswers(answers, where) {
  if (!Array.isArray(answers) || answers.length < 1) fail(`${where}: brak odpowiedzi`);
  if (answers.length > 6) fail(`${where}: maksymalnie 6 odpowiedzi (jest ${answers.length})`);
  return answers.map((a, i) => {
    if (typeof a?.text !== 'string' || !a.text.trim()) fail(`${where}, odpowiedź ${i + 1}: brak pola "text"`);
    if (!Number.isInteger(a.points) || a.points < 0) fail(`${where}, odpowiedź ${i + 1}: brak pola "points" (nieujemna liczba całkowita)`);
    return { text: a.text.trim(), points: a.points };
  });
}

function validateQuestion(q, where) {
  if (typeof q?.question !== 'string' || !q.question.trim()) fail(`${where}: brak pola "question"`);
  return { question: q.question.trim(), answers: validateAnswers(q.answers, where) };
}

export function validateQuestions(data) {
  if (typeof data !== 'object' || data === null) fail('oczekiwano obiektu JSON');
  const teams = data.teams ?? ['Lewa', 'Prawa'];
  if (!Array.isArray(teams) || teams.length !== 2 || teams.some((t) => typeof t !== 'string' || !t.trim())) {
    fail('"teams" musi być tablicą dwóch nazw drużyn');
  }
  if (!Array.isArray(data.rounds) || data.rounds.length === 0) fail('brak sekcji "rounds" — potrzebna co najmniej jedna runda (rundy)');
  const rounds = data.rounds.map((r, i) => {
    const q = validateQuestion(r, `runda ${i + 1}`);
    const multiplier = r.multiplier ?? 1;
    if (!Number.isInteger(multiplier) || multiplier < 1) fail(`runda ${i + 1}: "multiplier" musi być dodatnią liczbą całkowitą`);
    return { ...q, multiplier };
  });
  const finalData = data.final ?? [];
  if (!Array.isArray(finalData)) fail('"final" musi być tablicą');
  if (finalData.length !== 0 && finalData.length !== 5) fail(`finał musi mieć dokładnie 5 pytań (jest ${finalData.length})`);
  const final = finalData.map((q, i) => validateQuestion(q, `finał, pytanie ${i + 1}`));
  return { teams: teams.map((t) => t.trim()), rounds, final };
}

export function loadQuestions(path) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    fail(`nie mogę odczytać pliku ${path}`);
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    fail(`niepoprawny JSON (${e.message})`);
  }
  return validateQuestions(data);
}
```

- [ ] **Step 4: Run — verify PASS**

Run: `npm test`
Expected: wszystkie testy PASS.

- [ ] **Step 5: Przykładowy `questions.json`**

Utwórz `questions.json` na bazie starych pytań z `Familiada-src/js/questions.js`. Punkty zmyślamy (stara wersja ich nie miała): posortowane malejąco, suma w okolicach 100. Minimum: 5 rund z mnożnikami 1,1,1,2,3 + finał 5 pytań. Początek pliku dokładnie tak (resztę rund uzupełnij analogicznie ze starych pytań):

```json
{
  "teams": ["Lewa", "Prawa"],
  "rounds": [
    {
      "question": "Najlepszy język programowania",
      "multiplier": 1,
      "answers": [
        { "text": "COBOL", "points": 34 },
        { "text": "Nim", "points": 26 },
        { "text": "Javascript", "points": 18 },
        { "text": "PHP", "points": 12 },
        { "text": "Haskell", "points": 8 }
      ]
    },
    {
      "question": "Imię męskie na literę \"O\"",
      "multiplier": 1,
      "answers": [
        { "text": "Oliwia", "points": 35 },
        { "text": "Orlef", "points": 25 },
        { "text": "Oliwier", "points": 20 },
        { "text": "Pakosz", "points": 12 },
        { "text": "Onufry", "points": 6 }
      ]
    }
  ],
  "final": []
}
```

— rundy 3–5: „Co może wciągnąć na WWW?" (×1), „Co jest w kosmosie?" (×2), „Czym się kończy doktorat" (×3); finał: 5 kolejnych starych pytań (np. „Co panuje w kuchni?", „Co robią dyżurni?", „Czego brakuje na śniadaniu?", „Najlepsze na WWW", „Co można spalić?") z sekcją `final` wypełnioną analogicznie (bez `multiplier`).

Run: `node -e "import('./server/questions.js').then(m => console.log(JSON.stringify(m.loadQuestions('questions.json').teams)))"`
Expected: `["Lewa","Prawa"]`

- [ ] **Step 6: Commit**

```bash
git add server/questions.js test/questions.test.js questions.json
git commit -m "feat: walidacja pliku pytań + przykładowy questions.json"
```

---

### Task 3: Maszyna stanów — rundy (start, buzzery, odkrywanie, X-y)

**Files:**
- Create: `server/game.js`
- Test: `test/game.test.js`

**Interfaces:**
- Consumes: `config` z `validateQuestions` (Task 2).
- Produces:
  - `createGame(config) -> state` — stan początkowy:
    ```js
    {
      config,                       // znormalizowane pytania
      phase: 'idle',                // 'idle' | 'round' | 'final' | 'gameover'
      teams: [{ name, bank: 0 }, { name, bank: 0 }],
      roundIndex: null,
      round: null,
      final: null,
      intro: 'idle',                // 'idle' | 'video' | 'music' | 'off'
    }
    ```
  - `apply(state, cmd) -> event | null` — **mutuje** `state`; zwraca obiekt zdarzenia
    `{ type, ... }` (dla dźwięków/animacji na tablicy) albo `null` (zmiana cicha
    lub komenda odrzucona). Komendy: obiekty `{ type: '...', ...pola }`.
  - Kształt `state.round` (po `newRound`):
    ```js
    {
      question, multiplier,
      answers: [{ text, points, revealed: false, cheap: false }],
      stage: 'buzzers',             // 'buzzers' | 'play' | 'steal' | 'done'
      buzzed: null,                 // null | 0 | 1
      playingTeam: null,            // null | 0 | 1
      strikes: [0, 0],
      sum: 0,
      sumWinner: null,              // null | 0 | 1
    }
    ```
  - Zdarzenia z tego taska: `new-round`, `buzz`, `buzzers-reset`, `play-start`, `reveal`, `strike`, `strike-out`, `round-won`.

- [ ] **Step 1: Failing testy podstaw rundy**

```js
// test/game.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, apply } from '../server/game.js';

const CONFIG = {
  teams: ['Lewa', 'Prawa'],
  rounds: [
    {
      question: 'Q1', multiplier: 1,
      answers: [
        { text: 'A', points: 50 }, { text: 'B', points: 30 }, { text: 'C', points: 20 },
      ],
    },
    {
      question: 'Q2', multiplier: 2,
      answers: [{ text: 'D', points: 60 }, { text: 'E', points: 40 }],
    },
  ],
  final: [
    { question: 'F1', answers: [{ text: 'FA', points: 90 }, { text: 'FB', points: 60 }] },
    { question: 'F2', answers: [{ text: 'FC', points: 80 }] },
    { question: 'F3', answers: [{ text: 'FD', points: 70 }] },
    { question: 'F4', answers: [{ text: 'FE', points: 60 }] },
    { question: 'F5', answers: [{ text: 'FF', points: 50 }] },
  ],
};

function freshRound(roundIndex = 0) {
  const state = createGame(structuredClone(CONFIG));
  apply(state, { type: 'newRound', roundIndex });
  return state;
}

test('createGame: stan początkowy', () => {
  const state = createGame(structuredClone(CONFIG));
  assert.equal(state.phase, 'idle');
  assert.deepEqual(state.teams, [{ name: 'Lewa', bank: 0 }, { name: 'Prawa', bank: 0 }]);
  assert.equal(state.round, null);
});

test('newRound: wchodzi w rundę z uzbrojonymi buzzerami', () => {
  const state = freshRound(0);
  assert.equal(state.phase, 'round');
  assert.equal(state.roundIndex, 0);
  assert.equal(state.round.stage, 'buzzers');
  assert.equal(state.round.buzzed, null);
  assert.equal(state.round.answers.length, 3);
  assert.ok(state.round.answers.every((a) => !a.revealed));
});

test('newRound: odrzuca zły indeks', () => {
  const state = createGame(structuredClone(CONFIG));
  assert.equal(apply(state, { type: 'newRound', roundIndex: 99 }), null);
  assert.equal(state.phase, 'idle');
});

test('buzz: pierwszy blokuje, drugi ignorowany', () => {
  const state = freshRound(0);
  const ev = apply(state, { type: 'buzz', team: 1 });
  assert.deepEqual(ev, { type: 'buzz', team: 1 });
  assert.equal(apply(state, { type: 'buzz', team: 0 }), null);
  assert.equal(state.round.buzzed, 1);
});

test('resetBuzzers: odblokowuje', () => {
  const state = freshRound(0);
  apply(state, { type: 'buzz', team: 1 });
  apply(state, { type: 'resetBuzzers' });
  assert.equal(state.round.buzzed, null);
});

test('reveal w stage buzzers: punkty × mnożnik wpadają do sumy', () => {
  const state = freshRound(1); // multiplier 2
  const ev = apply(state, { type: 'reveal', index: 0 });
  assert.equal(ev.type, 'reveal');
  assert.equal(state.round.sum, 120);
  assert.equal(state.round.answers[0].revealed, true);
});

test('reveal: ponowny na tej samej odpowiedzi ignorowany', () => {
  const state = freshRound(0);
  apply(state, { type: 'reveal', index: 0 });
  assert.equal(apply(state, { type: 'reveal', index: 0 }), null);
  assert.equal(state.round.sum, 50);
});

test('choosePlayingTeam: przechodzi do gry', () => {
  const state = freshRound(0);
  const ev = apply(state, { type: 'choosePlayingTeam', team: 0 });
  assert.deepEqual(ev, { type: 'play-start', team: 0 });
  assert.equal(state.round.stage, 'play');
  assert.equal(state.round.playingTeam, 0);
});

test('strike: trzeci X grającej drużyny przełącza na przejęcie', () => {
  const state = freshRound(0);
  apply(state, { type: 'choosePlayingTeam', team: 0 });
  apply(state, { type: 'strike', team: 0 });
  apply(state, { type: 'strike', team: 0 });
  assert.equal(state.round.stage, 'play');
  const ev = apply(state, { type: 'strike', team: 0 });
  assert.equal(ev.type, 'strike-out');
  assert.equal(state.round.stage, 'steal');
  assert.deepEqual(state.round.strikes, [3, 0]);
});

test('strike: powyżej 3 ignorowany', () => {
  const state = freshRound(0);
  apply(state, { type: 'choosePlayingTeam', team: 0 });
  for (let i = 0; i < 3; i++) apply(state, { type: 'strike', team: 0 });
  assert.equal(apply(state, { type: 'strike', team: 0 }), null);
});

test('odkrycie wszystkiego w grze: suma automatycznie dla grających', () => {
  const state = freshRound(0);
  apply(state, { type: 'choosePlayingTeam', team: 1 });
  apply(state, { type: 'reveal', index: 0 });
  apply(state, { type: 'reveal', index: 1 });
  const ev = apply(state, { type: 'reveal', index: 2 });
  assert.equal(ev.type, 'round-won');
  assert.equal(state.round.stage, 'done');
  assert.equal(state.round.sumWinner, 1);
  assert.equal(state.teams[1].bank, 100);
});
```

- [ ] **Step 2: Run — verify FAIL**

Run: `npm test`
Expected: FAIL — `Cannot find module '../server/game.js'`.

- [ ] **Step 3: Implementacja `server/game.js`**

```js
// server/game.js
// Czysta maszyna stanów gry. apply() mutuje state i zwraca zdarzenie
// (dla dźwięków/animacji tablicy) albo null, gdy komenda jest nieprawidłowa
// w bieżącym stanie lub zmiana jest cicha.

export function createGame(config) {
  return {
    config,
    phase: 'idle',
    teams: config.teams.map((name) => ({ name, bank: 0 })),
    roundIndex: null,
    round: null,
    final: null,
    intro: 'idle',
  };
}

function isTeam(t) {
  return t === 0 || t === 1;
}

function awardSumTo(state, team) {
  state.round.sumWinner = team;
  state.teams[team].bank += state.round.sum;
  state.round.stage = 'done';
}

export function apply(state, cmd) {
  const { round } = state;
  switch (cmd.type) {
    case 'newRound': {
      const r = state.config.rounds[cmd.roundIndex];
      if (!r) return null;
      state.phase = 'round';
      state.roundIndex = cmd.roundIndex;
      state.intro = 'off';
      state.round = {
        question: r.question,
        multiplier: r.multiplier,
        answers: r.answers.map((a) => ({ ...a, revealed: false, cheap: false })),
        stage: 'buzzers',
        buzzed: null,
        playingTeam: null,
        strikes: [0, 0],
        sum: 0,
        sumWinner: null,
      };
      return { type: 'new-round' };
    }
    case 'buzz': {
      if (state.phase !== 'round' || round.stage !== 'buzzers') return null;
      if (round.buzzed !== null || !isTeam(cmd.team)) return null;
      round.buzzed = cmd.team;
      return { type: 'buzz', team: cmd.team };
    }
    case 'resetBuzzers': {
      if (state.phase !== 'round' || round.stage !== 'buzzers') return null;
      round.buzzed = null;
      return { type: 'buzzers-reset' };
    }
    case 'choosePlayingTeam': {
      if (state.phase !== 'round' || round.stage !== 'buzzers' || !isTeam(cmd.team)) return null;
      round.playingTeam = cmd.team;
      round.stage = 'play';
      return { type: 'play-start', team: cmd.team };
    }
    case 'reveal': {
      if (state.phase !== 'round') return null;
      const answer = round.answers[cmd.index];
      if (!answer || answer.revealed) return null;
      if (round.stage === 'buzzers' || round.stage === 'play') {
        answer.revealed = true;
        round.sum += answer.points * round.multiplier;
        if (round.stage === 'play' && round.answers.every((a) => a.revealed)) {
          awardSumTo(state, round.playingTeam);
          return { type: 'round-won', team: round.sumWinner };
        }
        return { type: 'reveal', index: cmd.index };
      }
      return null; // stage 'steal' i 'done' — Task 4
    }
    case 'strike': {
      if (state.phase !== 'round' || !isTeam(cmd.team)) return null;
      if (round.stage !== 'buzzers' && round.stage !== 'play') return null;
      if (round.strikes[cmd.team] >= 3) return null;
      round.strikes[cmd.team] += 1;
      if (round.stage === 'play' && cmd.team === round.playingTeam && round.strikes[cmd.team] === 3) {
        round.stage = 'steal';
        return { type: 'strike-out', team: cmd.team };
      }
      return { type: 'strike', team: cmd.team };
    }
    default:
      return null;
  }
}
```

- [ ] **Step 4: Run — verify PASS**

Run: `npm test`
Expected: wszystkie testy PASS.

- [ ] **Step 5: Commit**

```bash
git add server/game.js test/game.test.js
git commit -m "feat: maszyna stanów rundy — buzzery, odkrywanie, X-y"
```

---

### Task 4: Maszyna stanów — przejęcie, suma, tanie odkrycia, korekty

**Files:**
- Modify: `server/game.js` (rozbudowa `apply`)
- Test: `test/game.test.js` (dopisanie testów)

**Interfaces:**
- Consumes: stan i komendy z Task 3.
- Produces — nowe komendy:
  - `{ type: 'reveal', index }` w stage `steal` → przejęcie udane (suma dla drużyny przejmującej, zdarzenie `steal-success`), w stage `done` → tanie odkrycie (`cheap-reveal`, bez punktów).
  - `{ type: 'stealFail' }` — pudło przejmujących, suma dla grających (`steal-fail`).
  - `{ type: 'awardSum', team }` — ręczne przyznanie sumy (`sum-awarded`).
  - `{ type: 'hide', index }` — cofnięcie odkrycia (cicha, `null`).
  - `{ type: 'unstrike', team }` — cofnięcie X (cicha; cofa też stage `steal` → `play`).
  - `{ type: 'setBank', team, value }`, `{ type: 'setTeamName', team, name }` (ciche).

- [ ] **Step 1: Failing testy**

Dopisz do `test/game.test.js`:

```js
function playedToSteal() {
  const state = freshRound(0);
  apply(state, { type: 'choosePlayingTeam', team: 0 });
  apply(state, { type: 'reveal', index: 0 }); // sum 50
  for (let i = 0; i < 3; i++) apply(state, { type: 'strike', team: 0 });
  return state; // stage 'steal', sum 50
}

test('przejęcie udane: suma dla drużyny przeciwnej', () => {
  const state = playedToSteal();
  const ev = apply(state, { type: 'reveal', index: 1 });
  assert.equal(ev.type, 'steal-success');
  assert.equal(state.round.stage, 'done');
  assert.equal(state.round.sumWinner, 1);
  assert.equal(state.teams[1].bank, 80); // 50 + 30
  assert.equal(state.teams[0].bank, 0);
});

test('przejęcie nieudane: suma zostaje u grających', () => {
  const state = playedToSteal();
  const ev = apply(state, { type: 'stealFail' });
  assert.equal(ev.type, 'steal-fail');
  assert.equal(state.round.sumWinner, 0);
  assert.equal(state.teams[0].bank, 50);
});

test('tanie odkrycie po rundzie: bez punktów', () => {
  const state = playedToSteal();
  apply(state, { type: 'stealFail' });
  const ev = apply(state, { type: 'reveal', index: 2 });
  assert.equal(ev.type, 'cheap-reveal');
  assert.equal(state.round.answers[2].cheap, true);
  assert.equal(state.teams[0].bank, 50); // bez zmian
});

test('hide: cofa odkrycie i punkty przed rozstrzygnięciem', () => {
  const state = freshRound(0);
  apply(state, { type: 'reveal', index: 0 });
  assert.equal(apply(state, { type: 'hide', index: 0 }), null);
  assert.equal(state.round.sum, 0);
  assert.equal(state.round.answers[0].revealed, false);
});

test('hide po rozstrzygnięciu: działa tylko na tanich odkryciach', () => {
  const state = playedToSteal();
  apply(state, { type: 'stealFail' });
  apply(state, { type: 'reveal', index: 2 }); // cheap
  assert.equal(state.round.answers[2].revealed, true);
  apply(state, { type: 'hide', index: 2 });
  assert.equal(state.round.answers[2].revealed, false);
  // odkrycie punktowane z czasu gry — nietykalne po 'done'
  apply(state, { type: 'hide', index: 0 });
  assert.equal(state.round.answers[0].revealed, true);
});

test('unstrike: cofa X i wychodzi z przejęcia', () => {
  const state = playedToSteal();
  apply(state, { type: 'unstrike', team: 0 });
  assert.deepEqual(state.round.strikes, [2, 0]);
  assert.equal(state.round.stage, 'play');
});

test('awardSum: ręczne przyznanie', () => {
  const state = freshRound(0);
  apply(state, { type: 'reveal', index: 0 });
  const ev = apply(state, { type: 'awardSum', team: 1 });
  assert.equal(ev.type, 'sum-awarded');
  assert.equal(state.teams[1].bank, 50);
  assert.equal(state.round.stage, 'done');
});

test('setBank i setTeamName', () => {
  const state = createGame(structuredClone(CONFIG));
  apply(state, { type: 'setBank', team: 0, value: 123 });
  apply(state, { type: 'setTeamName', team: 1, name: 'Nerdzi' });
  assert.equal(state.teams[0].bank, 123);
  assert.equal(state.teams[1].name, 'Nerdzi');
});
```

- [ ] **Step 2: Run — verify FAIL**

Run: `npm test`
Expected: nowe testy FAIL (stare PASS).

- [ ] **Step 3: Implementacja**

W `apply` w `server/game.js` — w case `'reveal'` zastąp końcowe `return null` obsługą `steal`/`done` i dodaj nowe case'y:

```js
    case 'reveal': {
      if (state.phase !== 'round') return null;
      const answer = round.answers[cmd.index];
      if (!answer || answer.revealed) return null;
      if (round.stage === 'buzzers' || round.stage === 'play') {
        answer.revealed = true;
        round.sum += answer.points * round.multiplier;
        if (round.stage === 'play' && round.answers.every((a) => a.revealed)) {
          awardSumTo(state, round.playingTeam);
          return { type: 'round-won', team: round.sumWinner };
        }
        return { type: 'reveal', index: cmd.index };
      }
      if (round.stage === 'steal') {
        answer.revealed = true;
        round.sum += answer.points * round.multiplier;
        awardSumTo(state, 1 - round.playingTeam);
        return { type: 'steal-success', team: round.sumWinner };
      }
      // stage 'done': tanie odkrycie
      answer.revealed = true;
      answer.cheap = true;
      return { type: 'cheap-reveal', index: cmd.index };
    }
    case 'stealFail': {
      if (state.phase !== 'round' || round.stage !== 'steal') return null;
      awardSumTo(state, round.playingTeam);
      return { type: 'steal-fail', team: 1 - round.playingTeam };
    }
    case 'awardSum': {
      if (state.phase !== 'round' || round.stage === 'done' || !isTeam(cmd.team)) return null;
      awardSumTo(state, cmd.team);
      return { type: 'sum-awarded', team: cmd.team };
    }
    case 'hide': {
      if (state.phase !== 'round') return null;
      const answer = round.answers[cmd.index];
      if (!answer || !answer.revealed) return null;
      if (answer.cheap) {
        answer.revealed = false;
        answer.cheap = false;
        return null;
      }
      if (round.stage === 'done' || round.stage === 'steal') return null;
      answer.revealed = false;
      round.sum -= answer.points * round.multiplier;
      return null;
    }
    case 'unstrike': {
      if (state.phase !== 'round' || !isTeam(cmd.team)) return null;
      if (round.strikes[cmd.team] <= 0) return null;
      round.strikes[cmd.team] -= 1;
      if (round.stage === 'steal' && cmd.team === round.playingTeam) round.stage = 'play';
      return null;
    }
    case 'setBank': {
      if (!isTeam(cmd.team) || !Number.isInteger(cmd.value) || cmd.value < 0) return null;
      state.teams[cmd.team].bank = cmd.value;
      return null;
    }
    case 'setTeamName': {
      if (!isTeam(cmd.team) || typeof cmd.name !== 'string' || !cmd.name.trim()) return null;
      state.teams[cmd.team].name = cmd.name.trim();
      return null;
    }
```

- [ ] **Step 4: Run — verify PASS**

Run: `npm test`
Expected: wszystkie testy PASS.

- [ ] **Step 5: Commit**

```bash
git add server/game.js test/game.test.js
git commit -m "feat: przejęcia, przyznawanie sumy, tanie odkrycia i korekty"
```

---

### Task 5: Maszyna stanów — finał, timer, intro, koniec gry

**Files:**
- Modify: `server/game.js`
- Test: `test/game.test.js`

**Interfaces:**
- Consumes: stan z Tasków 3–4.
- Produces — kształt `state.final` (po `startFinal`):
  ```js
  {
    questions: config.final,             // 5 pytań
    entries: [ [null×5], [null×5] ],     // entries[player][q] = null | { answerIndex: number | null }
    sum: 0,
    won: false,
    timer: null,                         // null | { duration (s), startedAt (ms epoch) }
  }
  ```
  Nowe komendy:
  - `{ type: 'startFinal' }` → `final-start` (odrzucana, gdy `config.final` puste).
  - `{ type: 'finalSet', qIndex, player, answerIndex }` — `answerIndex` liczbowy = trafiona odpowiedź z ankiety (`final-reveal`), `null` = pudło (`final-miss`); odrzucana gdy wpis już istnieje albo drugi gracz użył tej samej odpowiedzi; przekroczenie 200 → `won=true` i zdarzenie `final-win`.
  - `{ type: 'finalClear', qIndex, player }` — cofnięcie wpisu (cicha, przelicza `sum` i `won`).
  - `{ type: 'timerStart', seconds, now }`, `{ type: 'timerStop' }` — `now` w ms dostarcza wywołujący (serwer da `Date.now()`, testy stałą).
  - `{ type: 'repeatBuzzer' }` → `repeat` (bez zmiany stanu — sam dźwięk).
  - `{ type: 'introStart' }` → intro `video` + zdarzenie `intro`; `{ type: 'introVideoEnded' }` → `music` (cicha); `{ type: 'stopMusic' }` → `off` (cicha).
  - `{ type: 'endGame' }` → phase `gameover`, zdarzenie `game-over`; `{ type: 'newGame' }` → pełny reset przez `createGame` (zdarzenie `new-game`). **Uwaga:** `newGame` musi zresetować pola istniejącego obiektu `state` (np. `Object.assign(state, createGame(state.config))`), bo serwer trzyma referencję.

- [ ] **Step 1: Failing testy**

Dopisz do `test/game.test.js`:

```js
function freshFinal() {
  const state = createGame(structuredClone(CONFIG));
  apply(state, { type: 'startFinal' });
  return state;
}

test('startFinal: wchodzi w finał', () => {
  const state = freshFinal();
  assert.equal(state.phase, 'final');
  assert.equal(state.final.questions.length, 5);
  assert.deepEqual(state.final.entries[0], [null, null, null, null, null]);
});

test('startFinal: odrzucany bez pytań finałowych', () => {
  const noFinal = structuredClone(CONFIG);
  noFinal.final = [];
  const state = createGame(noFinal);
  assert.equal(apply(state, { type: 'startFinal' }), null);
  assert.equal(state.phase, 'idle');
});

test('finalSet: trafienie dodaje punkty, pudło nie', () => {
  const state = freshFinal();
  const ev = apply(state, { type: 'finalSet', qIndex: 0, player: 0, answerIndex: 0 });
  assert.equal(ev.type, 'final-reveal');
  assert.equal(state.final.sum, 90);
  const miss = apply(state, { type: 'finalSet', qIndex: 1, player: 0, answerIndex: null });
  assert.equal(miss.type, 'final-miss');
  assert.equal(state.final.sum, 90);
});

test('finalSet: odrzuca duplikat odpowiedzi drugiego gracza', () => {
  const state = freshFinal();
  apply(state, { type: 'finalSet', qIndex: 0, player: 0, answerIndex: 0 });
  assert.equal(apply(state, { type: 'finalSet', qIndex: 0, player: 1, answerIndex: 0 }), null);
  const ev = apply(state, { type: 'finalSet', qIndex: 0, player: 1, answerIndex: 1 });
  assert.equal(ev.type, 'final-reveal');
});

test('finalSet: odrzuca nadpisanie istniejącego wpisu', () => {
  const state = freshFinal();
  apply(state, { type: 'finalSet', qIndex: 0, player: 0, answerIndex: 0 });
  assert.equal(apply(state, { type: 'finalSet', qIndex: 0, player: 0, answerIndex: 1 }), null);
});

test('finał: suma >= 200 daje final-win', () => {
  const state = freshFinal();
  apply(state, { type: 'finalSet', qIndex: 0, player: 0, answerIndex: 0 }); // 90
  apply(state, { type: 'finalSet', qIndex: 1, player: 0, answerIndex: 0 }); // 80 -> 170
  const ev = apply(state, { type: 'finalSet', qIndex: 2, player: 0, answerIndex: 0 }); // 70 -> 240
  assert.equal(ev.type, 'final-win');
  assert.equal(state.final.won, true);
});

test('finalClear: cofa wpis i przelicza sumę', () => {
  const state = freshFinal();
  apply(state, { type: 'finalSet', qIndex: 0, player: 0, answerIndex: 0 });
  apply(state, { type: 'finalClear', qIndex: 0, player: 0 });
  assert.equal(state.final.sum, 0);
  assert.equal(state.final.entries[0][0], null);
});

test('timer: start i stop', () => {
  const state = freshFinal();
  const ev = apply(state, { type: 'timerStart', seconds: 15, now: 1000000 });
  assert.equal(ev.type, 'timer-start');
  assert.deepEqual(state.final.timer, { duration: 15, startedAt: 1000000 });
  apply(state, { type: 'timerStop' });
  assert.equal(state.final.timer, null);
});

test('repeatBuzzer: samo zdarzenie', () => {
  const state = freshFinal();
  assert.deepEqual(apply(state, { type: 'repeatBuzzer' }), { type: 'repeat' });
});

test('intro: video -> music -> off', () => {
  const state = createGame(structuredClone(CONFIG));
  assert.deepEqual(apply(state, { type: 'introStart' }), { type: 'intro' });
  assert.equal(state.intro, 'video');
  apply(state, { type: 'introVideoEnded' });
  assert.equal(state.intro, 'music');
  apply(state, { type: 'stopMusic' });
  assert.equal(state.intro, 'off');
});

test('newRound zatrzymuje muzykę intro', () => {
  const state = createGame(structuredClone(CONFIG));
  apply(state, { type: 'introStart' });
  apply(state, { type: 'introVideoEnded' });
  apply(state, { type: 'newRound', roundIndex: 0 });
  assert.equal(state.intro, 'off');
});

test('endGame i newGame', () => {
  const state = freshRound(0);
  apply(state, { type: 'setBank', team: 0, value: 300 });
  const ev = apply(state, { type: 'endGame' });
  assert.equal(ev.type, 'game-over');
  assert.equal(state.phase, 'gameover');
  const ev2 = apply(state, { type: 'newGame' });
  assert.equal(ev2.type, 'new-game');
  assert.equal(state.phase, 'idle');
  assert.equal(state.teams[0].bank, 0);
  assert.equal(state.round, null);
});
```

- [ ] **Step 2: Run — verify FAIL**

Run: `npm test`
Expected: nowe testy FAIL.

- [ ] **Step 3: Implementacja — nowe case'y w `apply`**

```js
    case 'startFinal': {
      if (state.config.final.length !== 5) return null;
      state.phase = 'final';
      state.round = null;
      state.final = {
        questions: state.config.final,
        entries: [Array(5).fill(null), Array(5).fill(null)],
        sum: 0,
        won: false,
        timer: null,
      };
      return { type: 'final-start' };
    }
    case 'finalSet': {
      const f = state.final;
      if (state.phase !== 'final') return null;
      const { qIndex, player, answerIndex } = cmd;
      if (!isTeam(player) || !f.questions[qIndex] || f.entries[player][qIndex] !== null) return null;
      if (answerIndex !== null) {
        if (!f.questions[qIndex].answers[answerIndex]) return null;
        const other = f.entries[1 - player][qIndex];
        if (other && other.answerIndex === answerIndex) return null;
      }
      f.entries[player][qIndex] = { answerIndex };
      if (answerIndex === null) return { type: 'final-miss', qIndex, player };
      f.sum += f.questions[qIndex].answers[answerIndex].points;
      if (!f.won && f.sum >= 200) {
        f.won = true;
        return { type: 'final-win' };
      }
      return { type: 'final-reveal', qIndex, player };
    }
    case 'finalClear': {
      const f = state.final;
      if (state.phase !== 'final') return null;
      const entry = f?.entries[cmd.player]?.[cmd.qIndex];
      if (!entry) return null;
      if (entry.answerIndex !== null) {
        f.sum -= f.questions[cmd.qIndex].answers[entry.answerIndex].points;
      }
      f.entries[cmd.player][cmd.qIndex] = null;
      f.won = f.sum >= 200;
      return null;
    }
    case 'timerStart': {
      if (state.phase !== 'final' || !Number.isInteger(cmd.seconds) || cmd.seconds <= 0) return null;
      state.final.timer = { duration: cmd.seconds, startedAt: cmd.now };
      return { type: 'timer-start' };
    }
    case 'timerStop': {
      if (state.phase !== 'final' || !state.final.timer) return null;
      state.final.timer = null;
      return null;
    }
    case 'repeatBuzzer':
      return { type: 'repeat' };
    case 'introStart': {
      state.intro = 'video';
      return { type: 'intro' };
    }
    case 'introVideoEnded': {
      if (state.intro !== 'video') return null;
      state.intro = 'music';
      return null;
    }
    case 'stopMusic': {
      state.intro = 'off';
      return null;
    }
    case 'endGame': {
      state.phase = 'gameover';
      state.round = null;
      return { type: 'game-over' };
    }
    case 'newGame': {
      Object.assign(state, createGame(state.config));
      return { type: 'new-game' };
    }
```

- [ ] **Step 4: Run — verify PASS**

Run: `npm test`
Expected: wszystkie testy PASS.

- [ ] **Step 5: Commit**

```bash
git add server/game.js test/game.test.js
git commit -m "feat: finał, timer, intro i cykl życia gry"
```

---

### Task 6: Serwer — WebSocket, persystencja, QR, adresy LAN

**Files:**
- Create: `server/index.js`
- Test: `test/server.test.js`

**Interfaces:**
- Consumes: `loadQuestions` (Task 2), `createGame`/`apply` (Taski 3–5).
- Produces — **protokół WebSocket** (używany przez wszystkie strony w Taskach 7–13):
  - klient → serwer: `{ "type": "command", "cmd": { ... } }`
  - serwer → klient: `{ "type": "state", "seq": <int rosnący>, "now": <Date.now()>, "event": <event|null>, "state": <pełny stan gry> }` — wysyłany do WSZYSTKICH po każdej zastosowanej komendzie oraz (z `event: null`) zaraz po połączeniu klienta.
  - HTTP: statyczne pliki z `public/`; `GET /buzzer/1|2` → `public/buzzer.html`; `GET /qr.svg?data=<url>` → SVG kodu QR.
  - `PORT` z env (domyślnie 3000). `STATE_FILE` z env (domyślnie `state.json`) — dla testów.

- [ ] **Step 1: Failing test integracyjny**

```js
// test/server.test.js
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
```

- [ ] **Step 2: Run — verify FAIL**

Run: `npm test`
Expected: FAIL — brak `server/index.js`.

- [ ] **Step 3: Implementacja**

```js
// server/index.js
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
  app.use(express.static(PUBLIC_DIR));
  app.get('/buzzer/:team(1|2)', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'buzzer.html')));
  app.get('/qr.svg', async (req, res) => {
    const data = String(req.query.data ?? '');
    if (!data) return res.status(400).send('brak parametru data');
    res.type('image/svg+xml').send(await QRCode.toString(data, { type: 'svg', margin: 1 }));
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
      const event = apply(state, cmd);
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
```

- [ ] **Step 4: Run — verify PASS**

Run: `npm test`
Expected: wszystkie testy PASS (w tym integracyjny).

- [ ] **Step 5: Ręczny start**

Run: `npm start` (Ctrl+C po sprawdzeniu)
Expected: log z adresami `http://localhost:3000/` + adres LAN; brak crashy.
Run: `QUESTIONS_FILE=nieistnieje.json npm start`
Expected: czytelny polski komunikat błędu, exit code 1.

- [ ] **Step 6: Commit**

```bash
git add server/index.js test/server.test.js
git commit -m "feat: serwer WebSocket z persystencją, QR i adresami LAN"
```

---

### Task 7: Wspólny klient WS + strona startowa z QR

**Files:**
- Create: `public/common/ws.js`
- Create: `public/index.html`

**Interfaces:**
- Consumes: protokół WS z Task 6.
- Produces: `connectGame(onSnapshot) -> { send(cmd) }` — moduł ES używany przez board/host/buzzer:
  - `onSnapshot(msg)` wołany dla KAŻDEGO snapshotu (`msg = {seq, now, event, state}`),
  - automatyczny reconnect co 1 s (w nieskończoność),
  - `document.body` dostaje klasę `disconnected`, gdy połączenie leży (strony stylują sobie wskaźnik),
  - `send(cmd)` ignoruje wywołania przy zerwanym połączeniu.

- [ ] **Step 1: Implementacja `public/common/ws.js`**

```js
// public/common/ws.js
export function connectGame(onSnapshot) {
  let ws = null;

  function open() {
    ws = new WebSocket(`ws://${location.host}`);
    ws.onopen = () => document.body.classList.remove('disconnected');
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'state') onSnapshot(msg);
    };
    ws.onclose = () => {
      document.body.classList.add('disconnected');
      setTimeout(open, 1000);
    };
    ws.onerror = () => ws.close();
  }
  open();

  return {
    send(cmd) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'command', cmd }));
      }
    },
  };
}
```

- [ ] **Step 2: Strona startowa `public/index.html`**

Jedna strona, inline `<style>` i `<script>` (tokeny panelu hosta z sekcji Design tokens). Cztery kafle: Tablica `/board`, Panel prowadzącego `/host`, Buzzer Lewa `/buzzer/1`, Buzzer Prawa `/buzzer/2`. Każdy kafel: link z pełnym URL + `<img src="/qr.svg?data=<encodeURIComponent(pełny url)>">`.

```html
<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Familiada</title>
<style>
  :root { --bg:#111318; --card:#1a1e26; --border:#2a2f3a; --text:#e8eaf0; --muted:#8a93a5; --accent:#ffb300; }
  * { box-sizing: border-box; margin: 0; }
  body { background: var(--bg); color: var(--text); font-family: system-ui, sans-serif; min-height: 100vh; display: grid; place-content: center; gap: 24px; padding: 24px; }
  h1 { text-align: center; letter-spacing: 0.3em; color: var(--accent); font-weight: 800; }
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; max-width: 1100px; }
  a.tile { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; text-align: center; color: var(--text); text-decoration: none; display: grid; gap: 12px; }
  a.tile:hover { border-color: var(--accent); }
  .tile img { width: 160px; height: 160px; background: #fff; padding: 8px; border-radius: 8px; justify-self: center; }
  .tile .url { color: var(--muted); font-size: 13px; word-break: break-all; }
</style>
</head>
<body>
<h1>FAMILIADA</h1>
<div class="tiles" id="tiles"></div>
<script>
  const views = [
    ['Tablica (projektor)', '/board'],
    ['Panel prowadzącego', '/host'],
    ['Buzzer — drużyna lewa', '/buzzer/1'],
    ['Buzzer — drużyna prawa', '/buzzer/2'],
  ];
  document.getElementById('tiles').innerHTML = views.map(([name, path]) => {
    const url = location.origin + path;
    return `<a class="tile" href="${path}"><strong>${name}</strong>` +
      `<img src="/qr.svg?data=${encodeURIComponent(url)}" alt="QR"><span class="url">${url}</span></a>`;
  }).join('');
</script>
</body>
</html>
```

- [ ] **Step 3: Weryfikacja ręczna**

Run: `npm start`, otwórz `http://localhost:3000/`.
Expected: 4 kafle z działającymi kodami QR (obrazki się renderują), linki prowadzą na razie do 404 (strony powstaną w kolejnych taskach).

- [ ] **Step 4: Commit**

```bash
git add public/common/ws.js public/index.html
git commit -m "feat: wspólny klient WS z reconnectem i strona startowa z QR"
```

---

### Task 8: Tablica — layout repliki i render rund

**Files:**
- Create: `public/board.html`, `public/board.css`, `public/board.js`

**Interfaces:**
- Consumes: `connectGame` (Task 7), stan gry (Taski 3–5), assety (Task 1).
- Produces: struktura DOM tablicy i funkcja `render(msg)`, do której Taski 9–10 dokładają dźwięki, intro i finał. `board.js` trzyma `let lastSeq = -1` i porównuje `msg.seq`, żeby eventy obsłużyć dokładnie raz.

- [ ] **Step 1: `public/board.html`**

```html
<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="utf-8">
<title>Familiada — tablica</title>
<link rel="stylesheet" href="/board.css">
</head>
<body>
<main id="board">
  <!-- widok idle/intro -->
  <section id="view-intro">
    <video id="intro-video" src="/assets/video/czolowka.mp4" preload="auto" muted playsinline></video>
  </section>

  <!-- widok rundy -->
  <section id="view-round" hidden>
    <div class="side" id="side-0">
      <div class="bank" id="bank-0">0</div>
      <div class="team" id="team-0"></div>
      <div class="strikes" id="strikes-0"></div>
      <div class="buzzed-marker" id="buzzed-0">●</div>
    </div>
    <div class="panel">
      <ol id="answers"></ol>
      <div class="sum-row"><span>SUMA</span><span id="sum">0</span></div>
    </div>
    <div class="side" id="side-1">
      <div class="bank" id="bank-1">0</div>
      <div class="team" id="team-1"></div>
      <div class="strikes" id="strikes-1"></div>
      <div class="buzzed-marker" id="buzzed-1">●</div>
    </div>
  </section>

  <!-- widok finału (Task 10) -->
  <section id="view-final" hidden></section>

  <!-- widok końca gry (Task 10) -->
  <section id="view-gameover" hidden></section>

  <!-- overlay wielkiego X -->
  <div id="big-x" hidden>X</div>
</main>
<audio id="snd-correct" src="/assets/sounds/correct.mp3" preload="auto"></audio>
<audio id="snd-error" src="/assets/sounds/error.mp3" preload="auto"></audio>
<audio id="snd-brawo" src="/assets/sounds/brawo.wav" preload="auto"></audio>
<audio id="snd-intro" src="/assets/audio/intro.webm" preload="auto"></audio>
<script type="module" src="/board.js"></script>
</body>
</html>
```

- [ ] **Step 2: `public/board.css`** — tokeny z sekcji Design tokens, dokładnie:

```css
@font-face { font-family: 'Familiada'; src: url('/assets/fonts/familiada.ttf'); }

:root {
  --bg: #000;
  --board-bg: #07120a;
  --lit: #ffd94a;
  --lit-glow: rgba(255, 217, 74, 0.35);
  --unlit: #142016;
  --x-red: #ff3b30;
}

* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; }
body {
  background: var(--bg);
  color: var(--lit);
  font-family: 'Familiada', monospace;
  overflow: hidden;
  cursor: none;
  text-transform: uppercase;
}
body.disconnected::after {
  content: '⟳';
  position: fixed; top: 12px; right: 16px; font-size: 3vh; opacity: 0.5;
}

#board, #board > section { height: 100vh; }

/* --- intro --- */
#view-intro { display: grid; place-items: center; background: #000; }
#intro-video { width: 100vw; height: 100vh; object-fit: contain; }

/* --- runda: plansza LED --- */
#view-round {
  display: grid;
  grid-template-columns: 1fr minmax(0, 3fr) 1fr;
  align-items: center;
  gap: 2vw;
  padding: 4vh 2vw;
  background:
    radial-gradient(circle, var(--unlit) 1.2px, transparent 1.4px) 0 0 / 6px 6px,
    var(--board-bg);
}

.panel { display: grid; gap: 2.2vh; }
#answers { list-style: none; display: grid; gap: 2.2vh; }
#answers li {
  display: grid;
  grid-template-columns: 2ch 1fr 4ch;
  gap: 1.5vw;
  font-size: 5.2vh;
  line-height: 1;
  text-shadow: 0 0 12px var(--lit-glow);
  white-space: nowrap;
}
#answers li .text { overflow: hidden; }
#answers li .pts { text-align: right; }
#answers li.hidden-answer .text, #answers li.hidden-answer .pts { opacity: 0.9; }
#answers li.cheap { opacity: 0.65; }

.sum-row {
  display: flex; justify-content: flex-end; gap: 3vw;
  font-size: 6.5vh; margin-top: 3vh;
  text-shadow: 0 0 14px var(--lit-glow);
}

/* --- boki: banki, X-y, buzzer --- */
.side { display: grid; justify-items: center; gap: 2vh; align-content: center; }
.bank { font-size: 7vh; text-shadow: 0 0 14px var(--lit-glow); }
.team { font-size: 2.6vh; opacity: 0.8; }
.strikes { color: var(--x-red); font-size: 6vh; min-height: 6vh; letter-spacing: 0.2em; text-shadow: 0 0 14px rgba(255, 59, 48, 0.5); }
.buzzed-marker { font-size: 4vh; visibility: hidden; }
.side.buzzed .buzzed-marker { visibility: visible; animation: blink 0.8s step-end infinite; }
@keyframes blink { 50% { opacity: 0.2; } }

/* --- wielki X --- */
#big-x {
  position: fixed; inset: 0; display: grid; place-items: center;
  font-size: 60vh; color: var(--x-red);
  text-shadow: 0 0 40px rgba(255, 59, 48, 0.7);
  background: rgba(0, 0, 0, 0.55);
}
```

- [ ] **Step 3: `public/board.js` — render rundy**

```js
// public/board.js
import { connectGame } from '/common/ws.js';

const $ = (id) => document.getElementById(id);
let lastSeq = -1;

function show(viewId) {
  for (const s of document.querySelectorAll('#board > section')) s.hidden = s.id !== viewId;
}

// Rząd odpowiedzi: nieodkryta = numer + kreski; odkryta = tekst + punkty;
// tania (cheap) = przygaszona.
function renderRound(state) {
  const r = state.round;
  $('answers').innerHTML = r.answers
    .map((a, i) => {
      const num = i + 1;
      if (!a.revealed) {
        return `<li class="hidden-answer"><span>${num}</span><span class="text">${'-'.repeat(17)}</span><span class="pts">--</span></li>`;
      }
      return `<li class="${a.cheap ? 'cheap' : ''}"><span>${num}</span><span class="text">${a.text}</span><span class="pts">${a.points * (a.cheap ? 1 : r.multiplier)}</span></li>`;
    })
    .join('');
  $('sum').textContent = r.sum;
  for (const t of [0, 1]) {
    $(`bank-${t}`).textContent = state.teams[t].bank;
    $(`team-${t}`).textContent = state.teams[t].name;
    $(`strikes-${t}`).textContent = 'X'.repeat(r.strikes[t]);
    $(`side-${t}`).classList.toggle('buzzed', r.buzzed === t);
  }
}

function render(msg) {
  const { state } = msg;
  if (state.phase === 'round') {
    show('view-round');
    renderRound(state);
  } else if (state.phase === 'idle') {
    show('view-intro');
  }
  // 'final' i 'gameover' — Task 10
}

connectGame((msg) => {
  render(msg);
  if (msg.seq !== lastSeq && msg.event) {
    lastSeq = msg.seq;
    handleEvent(msg.event); // Task 9 — na razie pusta
  }
  lastSeq = msg.seq;
});

function handleEvent(event) {}
```

- [ ] **Step 4: Weryfikacja ręczna**

Run: `npm start`; otwórz `/board` w jednej karcie i w drugiej karcie konsolą przeglądarki wyślij komendy... — zamiast konsoli użyj krótko `node`:

```bash
node -e "
const WebSocket = (await import('ws')).default;
const ws = new WebSocket('ws://localhost:3000');
ws.on('open', () => {
  ws.send(JSON.stringify({type:'command',cmd:{type:'newRound',roundIndex:0}}));
  ws.send(JSON.stringify({type:'command',cmd:{type:'reveal',index:0}}));
  setTimeout(() => process.exit(0), 300);
});" --input-type=module
```

Expected na tablicy: plansza z widoczną siatką diod, rząd 1 odkryty (tekst + punkty, żółty z poświatą), pozostałe rzędy jako kreski, SUMA zaktualizowana, banki `0` po bokach.

- [ ] **Step 5: Commit**

```bash
git add public/board.html public/board.css public/board.js
git commit -m "feat: tablica — replika planszy LED i render rund"
```

---

### Task 9: Tablica — dźwięki, wielki X, intro

**Files:**
- Modify: `public/board.js`, `public/board.css` (drobne), `public/board.html` (bez zmian struktury)

**Interfaces:**
- Consumes: zdarzenia z maszyny stanów (Taski 3–5), elementy `<audio>` i `#big-x` (Task 8).
- Produces: kompletna obsługa `handleEvent(event)` + obsługa `state.intro`. Mapowanie dźwięków (obowiązuje też w Task 10):
  - `correct.mp3`: `reveal`, `round-won`, `steal-success`, `sum-awarded`, `final-reveal`
  - `error.mp3`: `strike`, `strike-out`, `steal-fail`, `repeat`, `final-miss`
  - `brawo.wav`: `final-win`, `game-over`
  - WebAudio beep 880 Hz / 150 ms: `buzz`; blip 440 Hz / 80 ms (cicho): `cheap-reveal`
  - wielki X (overlay 1.2 s): `strike`, `strike-out`, `steal-fail`

- [ ] **Step 1: Dźwięki i overlay w `board.js`**

```js
const audioCtx = new AudioContext();
function beep(freq, ms, gainVal = 0.3) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.frequency.value = freq;
  osc.type = 'square';
  gain.gain.value = gainVal;
  osc.connect(gain).connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + ms / 1000);
}

function play(id) {
  const el = $(id);
  el.currentTime = 0;
  el.play().catch(() => {}); // autoplay-block przed pierwszą interakcją — trudno
}

let xTimeout = null;
function flashBigX() {
  $('big-x').hidden = false;
  clearTimeout(xTimeout);
  xTimeout = setTimeout(() => { $('big-x').hidden = true; }, 1200);
}

function handleEvent(event) {
  switch (event.type) {
    case 'reveal':
    case 'round-won':
    case 'steal-success':
    case 'sum-awarded':
    case 'final-reveal':
      play('snd-correct');
      break;
    case 'strike':
    case 'strike-out':
    case 'steal-fail':
      play('snd-error');
      flashBigX();
      break;
    case 'repeat':
    case 'final-miss':
      play('snd-error');
      break;
    case 'final-win':
    case 'game-over':
      play('snd-brawo');
      break;
    case 'buzz':
      beep(880, 150);
      break;
    case 'cheap-reveal':
      beep(440, 80, 0.12);
      break;
  }
}
```

Przeglądarka blokuje audio/AudioContext przed pierwszym gestem użytkownika na stronie — obsługa: po załadowaniu tablicy pokaż na 5 s dyskretną instrukcję „kliknij, aby aktywować dźwięk" (element `<div id="audio-hint">`), a w handlerze `click` na `document` wykonaj `audioCtx.resume()` i schowaj hint.

- [ ] **Step 2: Intro w `board.js`**

Stan `state.intro` steruje widokiem idle:

```js
let introShown = null; // ostatnio zastosowany stan intro
function renderIntro(state) {
  if (state.intro === introShown) return;
  introShown = state.intro;
  const video = $('intro-video');
  const music = $('snd-intro');
  if (state.intro === 'video') {
    show('view-intro');
    video.currentTime = 0;
    video.play();
    music.currentTime = 0;
    music.play().catch(() => {});
  } else if (state.intro === 'idle') {
    show('view-intro'); // pierwsza klatka: video spauzowane na 0
    video.pause();
    video.currentTime = 0;
  } else if (state.intro === 'off') {
    music.pause();
  }
  // intro === 'music': widok przełącza render() (pusta plansza), muzyka gra dalej
}
$('intro-video').addEventListener('ended', () => game.send({ type: 'introVideoEnded' }));
```

Gdzie `game = connectGame(...)` (zmienna modułowa). „Pusta plansza" przy `intro === 'music'` i w ogóle gdy `phase === 'idle' && intro !== 'idle' && intro !== 'video'`: pokaż `#view-round` z pustymi rzędami — dodaj w `render(msg)` gałąź: jeśli `phase === 'idle'`, to `renderIntro` decyduje; jeśli `intro` to `'music'` lub `'off'`, pokaż `#view-round` wyrenderowany z zerowym stanem (6 rzędów kresek, SUMA 0, banki z `state.teams`). Zaimplementuj to jako `renderEmptyBoard(state)` — ta sama struktura co `renderRound`, ale z `'-'.repeat(17)` we wszystkich rzędach.

Integracja w `render(msg)`:

```js
function render(msg) {
  const { state } = msg;
  if (state.phase === 'round') { show('view-round'); renderRound(state); }
  else if (state.phase === 'idle') {
    if (state.intro === 'idle' || state.intro === 'video') renderIntro(state);
    else { show('view-round'); renderEmptyBoard(state); }
  }
  if (state.phase !== 'idle') { $('snd-intro').pause(); introShown = null; }
}
```

(Uwaga: `renderIntro` wywołuj tak, żeby `state.intro === 'video'` nie restartowało wideo przy każdym snapshocie — stąd strażnik `introShown`.)

- [ ] **Step 3: Weryfikacja ręczna**

`npm start`, `/board` + skrypt `node` jak w Task 8, sekwencja: `introStart` → wideo gra; po zakończeniu wideo tablica sama wysyła `introVideoEnded` i pokazuje pustą planszę, muzyka gra dalej; `stopMusic` → cisza; `newRound` → plansza rundy; `reveal` → dźwięk correct; `strike` ×3 → X-y + wielki X + error.

- [ ] **Step 4: Commit**

```bash
git add public/board.js public/board.css public/board.html
git commit -m "feat: tablica — dźwięki, wielki X i sekwencja intro"
```

---

### Task 10: Tablica — finał i koniec gry

**Files:**
- Modify: `public/board.html`, `public/board.css`, `public/board.js`

**Interfaces:**
- Consumes: `state.final` (Task 5), mapowanie dźwięków (Task 9).
- Produces: widoki `#view-final` i `#view-gameover`.

- [ ] **Step 1: Markup finału w `board.html`**

```html
  <section id="view-final" hidden>
    <div class="final-panel">
      <div id="final-rows"></div>
      <div class="final-bottom">
        <div class="sum-row"><span>SUMA</span><span id="final-sum">0</span></div>
        <div id="final-timer" hidden>15</div>
      </div>
    </div>
  </section>

  <section id="view-gameover" hidden>
    <div class="gameover-panel">
      <div class="go-team" id="go-team-0"><span class="name"></span><span class="score"></span></div>
      <div class="go-team" id="go-team-1"><span class="name"></span><span class="score"></span></div>
    </div>
  </section>
```

- [ ] **Step 2: CSS finału (dopisać do `board.css`)**

```css
#view-final {
  display: grid; place-content: center; gap: 3vh; padding: 4vh 3vw;
  background:
    radial-gradient(circle, var(--unlit) 1.2px, transparent 1.4px) 0 0 / 6px 6px,
    var(--board-bg);
}
.final-panel { display: grid; gap: 2.4vh; }
.final-row {
  display: grid;
  grid-template-columns: 1fr 4ch 1fr 4ch;
  gap: 2vw; font-size: 4.6vh; line-height: 1;
  text-shadow: 0 0 12px var(--lit-glow); white-space: nowrap;
}
.final-row .pts { text-align: right; }
.final-bottom { display: flex; justify-content: space-between; align-items: center; margin-top: 4vh; }
#final-timer { font-size: 10vh; text-shadow: 0 0 16px var(--lit-glow); }
#view-final.won { animation: won-flash 0.7s step-end infinite; }
@keyframes won-flash { 50% { filter: brightness(1.6); } }

#view-gameover {
  display: grid; place-content: center; gap: 6vh;
  background:
    radial-gradient(circle, var(--unlit) 1.2px, transparent 1.4px) 0 0 / 6px 6px,
    var(--board-bg);
}
.go-team { display: flex; gap: 4vw; font-size: 9vh; text-shadow: 0 0 14px var(--lit-glow); justify-content: space-between; }
.go-team.winner { animation: won-flash 0.7s step-end infinite; }
```

- [ ] **Step 3: Render finału w `board.js`**

```js
function finalCell(f, player, qIndex) {
  const entry = f.entries[player][qIndex];
  if (entry === null) return `<span class="text">${'-'.repeat(12)}</span><span class="pts">--</span>`;
  if (entry.answerIndex === null) return `<span class="text">${'—'.repeat(6)}</span><span class="pts">0</span>`;
  const a = f.questions[qIndex].answers[entry.answerIndex];
  return `<span class="text">${a.text}</span><span class="pts">${a.points}</span>`;
}

function renderFinal(msg) {
  const f = msg.state.final;
  $('final-rows').innerHTML = f.questions
    .map((q, i) => `<div class="final-row">${finalCell(f, 0, i)}${finalCell(f, 1, i)}</div>`)
    .join('');
  $('final-sum').textContent = f.sum;
  document.getElementById('view-final').classList.toggle('won', f.won);

  const timerEl = $('final-timer');
  if (f.timer) {
    timerEl.hidden = false;
    startTimerLoop(f.timer, msg.now);
  } else {
    timerEl.hidden = true;
    stopTimerLoop();
  }
}

let timerRAF = null;
let timerDone = false;
function startTimerLoop(timer, serverNow) {
  const offset = Date.now() - serverNow; // korekta zegara klienta
  cancelAnimationFrame(timerRAF);
  timerDone = false;
  const tick = () => {
    const elapsed = (Date.now() - offset - timer.startedAt) / 1000;
    const remaining = Math.max(0, Math.ceil(timer.duration - elapsed));
    $('final-timer').textContent = remaining;
    if (remaining === 0 && !timerDone) {
      timerDone = true;
      beep(220, 700);
    }
    if (remaining > 0) timerRAF = requestAnimationFrame(tick);
  };
  tick();
}
function stopTimerLoop() { cancelAnimationFrame(timerRAF); }
```

W `render(msg)` dodaj gałęzie:

```js
  else if (state.phase === 'final') { show('view-final'); renderFinal(msg); }
  else if (state.phase === 'gameover') { show('view-gameover'); renderGameover(state); }
```

oraz:

```js
function renderGameover(state) {
  const winner = state.teams[0].bank === state.teams[1].bank ? null
    : state.teams[0].bank > state.teams[1].bank ? 0 : 1;
  for (const t of [0, 1]) {
    const el = $(`go-team-${t}`);
    el.querySelector('.name').textContent = state.teams[t].name;
    el.querySelector('.score').textContent = state.teams[t].bank;
    el.classList.toggle('winner', winner === t);
  }
}
```

Uwaga: `startTimerLoop` restartowany przy każdym snapshocie jest OK (idempotentny), ale nie wołaj go, jeśli `timer.startedAt` się nie zmienił — trzymaj `let lastTimerStart = null` i porównuj.

- [ ] **Step 4: Weryfikacja ręczna**

Skrypt `node` (jak wcześniej): `startFinal` → plansza finału 5×2 z kreskami; `finalSet {qIndex:0, player:0, answerIndex:0}` → odkrycie + correct; `finalSet ... answerIndex:null` → `———` + error; `timerStart {seconds:15}` → odliczanie na tablicy, beep przy 0; nabij sumę ≥ 200 → miganie + brawo.

- [ ] **Step 5: Commit**

```bash
git add public/board.html public/board.css public/board.js
git commit -m "feat: tablica — widok finału z timerem i plansza końcowa"
```

---

### Task 11: Panel prowadzącego — rundy

**Files:**
- Create: `public/host.html`, `public/host.css`, `public/host.js`

**Interfaces:**
- Consumes: `connectGame` (Task 7), komendy rund (Taski 3–4), intro (Task 5).
- Produces: kompletne sterowanie rundami + skróty klawiszowe. Task 12 dołoży sekcję finału i korekt do tych samych plików.

- [ ] **Step 1: `public/host.html`**

```html
<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Familiada — panel prowadzącego</title>
<link rel="stylesheet" href="/host.css">
</head>
<body>
<header id="topbar">
  <div id="stage-badge">—</div>
  <div id="round-info"></div>
  <div class="spacer"></div>
  <button id="btn-intro">Intro</button>
  <button id="btn-stop-music">Stop muzykę</button>
</header>

<main>
  <section class="card" id="question-card">
    <h2 id="question-text">—</h2>
    <ol id="host-answers"></ol>
    <div class="row">
      <span>SUMA: <strong id="host-sum">0</strong> (×<span id="host-mult">1</span>)</span>
    </div>
  </section>

  <section class="card" id="teams-card">
    <div class="team-box" data-team="0">
      <h3 class="team-name"></h3>
      <div class="bank">Bank: <strong class="bank-value"></strong></div>
      <div class="strikes-view"></div>
      <div class="row">
        <button class="btn-strike">+ X</button>
        <button class="btn-unstrike">− X</button>
        <button class="btn-play">GRA TA DRUŻYNA</button>
      </div>
    </div>
    <div class="team-box" data-team="1"><!-- identyczna struktura jak wyżej --></div>
    <div id="buzzer-status" class="row"></div>
    <div class="row">
      <button id="btn-reset-buzzers">Uzbrój buzzery ponownie</button>
      <button id="btn-steal-fail">PRZEJĘCIE: PUDŁO</button>
    </div>
  </section>
</main>

<footer id="bottombar">
  <button id="btn-prev-round">◀ Poprzednia</button>
  <button id="btn-new-round">Nowa runda</button>
  <button id="btn-next-round">Następna ▶</button>
  <div class="spacer"></div>
  <button id="btn-final">Finał</button>
  <button id="btn-end-game">Koniec gry</button>
  <button id="btn-new-game" class="danger">Nowa gra</button>
</footer>
<script type="module" src="/host.js"></script>
</body>
</html>
```

(W `team-box[data-team="1"]` powtórz dokładnie tę samą wewnętrzną strukturę co w `data-team="0"` — host.js buduje zachowanie po `data-team`.)

- [ ] **Step 2: `public/host.css`** — tokeny z Design tokens:

```css
:root {
  --bg: #111318; --card: #1a1e26; --border: #2a2f3a;
  --text: #e8eaf0; --muted: #8a93a5; --accent: #ffb300;
  --team0: #3d8bfd; --team1: #ff4d4d;
}
* { box-sizing: border-box; margin: 0; }
body {
  background: var(--bg); color: var(--text);
  font-family: system-ui, sans-serif;
  display: grid; grid-template-rows: auto 1fr auto; min-height: 100vh;
}
body.disconnected::before {
  content: 'BRAK POŁĄCZENIA — łączę ponownie…';
  display: block; background: #7a1f1f; color: #fff; text-align: center; padding: 6px;
}
header, footer { display: flex; gap: 12px; align-items: center; padding: 12px 16px; border-block: 1px solid var(--border); }
.spacer { flex: 1; }
#stage-badge { background: var(--accent); color: #000; font-weight: 800; padding: 8px 14px; border-radius: 8px; letter-spacing: 0.06em; }
main { display: grid; grid-template-columns: 3fr 2fr; gap: 16px; padding: 16px; align-items: start; }
.card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 16px; display: grid; gap: 12px; }
button {
  min-height: 56px; padding: 8px 18px; font-size: 16px; font-weight: 600;
  background: #232836; color: var(--text); border: 1px solid var(--border); border-radius: 10px;
  cursor: pointer; touch-action: manipulation;
}
button:hover { border-color: var(--accent); }
button:disabled { opacity: 0.35; cursor: default; }
button.danger { background: #3a1717; border-color: #7a1f1f; }
.row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
#host-answers { list-style: none; display: grid; gap: 8px; padding: 0; }
#host-answers button.answer {
  width: 100%; display: grid; grid-template-columns: 2ch 1fr auto; gap: 12px;
  text-align: left; align-items: center;
}
#host-answers button.answer.revealed { background: #1d3021; border-color: #2f7a3d; }
#host-answers button.answer.cheap { opacity: 0.6; }
.team-box { border: 1px solid var(--border); border-radius: 10px; padding: 12px; display: grid; gap: 10px; }
.team-box[data-team="0"] { border-left: 6px solid var(--team0); }
.team-box[data-team="1"] { border-left: 6px solid var(--team1); }
.strikes-view { color: #ff5b52; font-size: 28px; min-height: 32px; letter-spacing: 0.2em; }
#question-text { font-size: 22px; }
@media (max-width: 900px) { main { grid-template-columns: 1fr; } }
```

- [ ] **Step 3: `public/host.js`**

```js
import { connectGame } from '/common/ws.js';

const $ = (s) => document.querySelector(s);
let current = null; // ostatni snapshot

const game = connectGame((msg) => {
  current = msg;
  render(msg.state);
});
const send = (cmd) => game.send(cmd);

const STAGE_LABELS = {
  buzzers: 'PYTANIE STARTOWE',
  play: 'GRA',
  steal: 'PRZEJĘCIE',
  done: 'KONIEC RUNDY',
};

function render(state) {
  const r = state.round;
  const inRound = state.phase === 'round';

  $('#stage-badge').textContent =
    state.phase === 'idle' ? 'START' :
    state.phase === 'final' ? 'FINAŁ' :
    state.phase === 'gameover' ? 'KONIEC GRY' :
    STAGE_LABELS[r.stage] + (r.playingTeam !== null ? ` — ${state.teams[r.playingTeam].name}` : '');

  $('#round-info').textContent = inRound
    ? `Runda ${state.roundIndex + 1}/${state.config.rounds.length} ×${r.multiplier}`
    : '';

  $('#question-text').textContent = inRound ? r.question : '—';
  $('#host-sum').textContent = inRound ? r.sum : 0;
  $('#host-mult').textContent = inRound ? r.multiplier : 1;

  $('#host-answers').innerHTML = !inRound ? '' : r.answers
    .map((a, i) =>
      `<li><button class="answer ${a.revealed ? 'revealed' : ''} ${a.cheap ? 'cheap' : ''}" data-index="${i}">` +
      `<span>${i + 1}</span><span>${a.text}</span><strong>${a.points * r.multiplier}</strong></button></li>`)
    .join('');

  for (const box of document.querySelectorAll('.team-box')) {
    const t = Number(box.dataset.team);
    box.querySelector('.team-name').textContent = state.teams[t].name;
    box.querySelector('.bank-value').textContent = state.teams[t].bank;
    box.querySelector('.strikes-view').textContent = inRound ? 'X'.repeat(r.strikes[t]) : '';
    box.querySelector('.btn-play').disabled = !inRound || r.stage !== 'buzzers';
    box.querySelector('.btn-strike').disabled = !inRound || (r.stage !== 'buzzers' && r.stage !== 'play');
    box.querySelector('.btn-unstrike').disabled = !inRound || r.strikes[t] === 0;
  }

  $('#buzzer-status').textContent = !inRound ? '' :
    r.stage !== 'buzzers' ? '' :
    r.buzzed === null ? 'Buzzery uzbrojone — czekam…' :
    `PIERWSZA: ${state.teams[r.buzzed].name}`;
  $('#btn-reset-buzzers').disabled = !inRound || r.stage !== 'buzzers';
  $('#btn-steal-fail').disabled = !inRound || r.stage !== 'steal';
  $('#btn-final').disabled = state.config.final.length !== 5;
  $('#btn-prev-round').disabled = !inRound || state.roundIndex === 0;
  $('#btn-next-round').disabled = inRound && state.roundIndex >= state.config.rounds.length - 1;
}

// --- akcje ---
$('#host-answers').addEventListener('click', (e) => {
  const btn = e.target.closest('button.answer');
  if (!btn) return;
  const i = Number(btn.dataset.index);
  const a = current.state.round.answers[i];
  send({ type: a.revealed ? 'hide' : 'reveal', index: i });
});

for (const box of document.querySelectorAll('.team-box')) {
  const t = Number(box.dataset.team);
  box.querySelector('.btn-strike').onclick = () => send({ type: 'strike', team: t });
  box.querySelector('.btn-unstrike').onclick = () => send({ type: 'unstrike', team: t });
  box.querySelector('.btn-play').onclick = () => send({ type: 'choosePlayingTeam', team: t });
}

$('#btn-reset-buzzers').onclick = () => send({ type: 'resetBuzzers' });
$('#btn-steal-fail').onclick = () => send({ type: 'stealFail' });
$('#btn-intro').onclick = () => send({ type: 'introStart' });
$('#btn-stop-music').onclick = () => send({ type: 'stopMusic' });
$('#btn-new-round').onclick = () => send({ type: 'newRound', roundIndex: current?.state.roundIndex ?? 0 });
$('#btn-prev-round').onclick = () => send({ type: 'newRound', roundIndex: current.state.roundIndex - 1 });
$('#btn-next-round').onclick = () =>
  send({ type: 'newRound', roundIndex: current.state.phase === 'round' ? current.state.roundIndex + 1 : 0 });
$('#btn-end-game').onclick = () => send({ type: 'endGame' });
$('#btn-new-game').onclick = () => {
  if (confirm('Na pewno zacząć NOWĄ GRĘ? Banki i postęp zostaną wyzerowane.')) send({ type: 'newGame' });
};
$('#btn-final').onclick = () => send({ type: 'startFinal' });

// --- skróty klawiszowe: 1-6 odkryj/schowaj, Q/W = X lewa/prawa, ←/→ rundy ---
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key >= '1' && e.key <= '6') {
    const i = Number(e.key) - 1;
    const a = current?.state.round?.answers[i];
    if (a) send({ type: a.revealed ? 'hide' : 'reveal', index: i });
  } else if (e.key === 'q' || e.key === 'Q') send({ type: 'strike', team: 0 });
  else if (e.key === 'w' || e.key === 'W') send({ type: 'strike', team: 1 });
  else if (e.key === 'ArrowLeft') $('#btn-prev-round').click();
  else if (e.key === 'ArrowRight') $('#btn-next-round').click();
});
```

- [ ] **Step 4: Weryfikacja ręczna**

`npm start`, `/host` + `/board` obok siebie: Nowa runda → tablica i panel spójne; klik odpowiedzi odkrywa na tablicy z dźwiękiem; ponowny klik chowa; `Q`/`W` dają X; „GRA TA DRUŻYNA" po buzzerach; 3 X → badge „PRZEJĘCIE"; klik odpowiedzi → suma dla przeciwników; „Nowa gra" pyta o potwierdzenie.

- [ ] **Step 5: Commit**

```bash
git add public/host.html public/host.css public/host.js
git commit -m "feat: panel prowadzącego — sterowanie rundami i skróty klawiszowe"
```

---

### Task 12: Panel prowadzącego — finał i korekty

**Files:**
- Modify: `public/host.html`, `public/host.css`, `public/host.js`

**Interfaces:**
- Consumes: komendy finału (Task 5), `state.final`.
- Produces: sekcja finału (widoczna tylko w `phase === 'final'`) i sekcja korekt (edycja banków i nazw drużyn).

- [ ] **Step 1: Markup — dopisz do `<main>` w `host.html`**

```html
  <section class="card" id="final-card" hidden>
    <div class="row">
      <button id="btn-timer-15">Start 15 s (gracz 1)</button>
      <button id="btn-timer-20">Start 20 s (gracz 2)</button>
      <button id="btn-timer-stop">Stop timera</button>
      <button id="btn-repeat" class="danger">POWTÓRZONA!</button>
      <span>SUMA FINAŁU: <strong id="final-sum-host">0</strong>/200</span>
    </div>
    <div id="final-questions"></div>
  </section>

  <section class="card" id="fix-card">
    <details>
      <summary>Korekty (banki, nazwy drużyn)</summary>
      <div class="row" data-team="0">
        <input class="name-input" maxlength="20"> <input class="bank-input" type="number" min="0">
        <button class="btn-apply">Zapisz</button>
      </div>
      <div class="row" data-team="1">
        <input class="name-input" maxlength="20"> <input class="bank-input" type="number" min="0">
        <button class="btn-apply">Zapisz</button>
      </div>
    </details>
  </section>
```

- [ ] **Step 2: CSS finału (dopisać do `host.css`)**

```css
#final-questions { display: grid; gap: 14px; }
.final-q { border: 1px solid var(--border); border-radius: 10px; padding: 12px; display: grid; gap: 8px; }
.final-q h4 { font-size: 16px; }
.final-q .players { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.final-q .player { display: grid; gap: 6px; }
.final-q .player > span { color: var(--muted); font-size: 13px; }
.final-q button { min-height: 44px; font-size: 14px; }
.final-q button.used { opacity: 0.35; text-decoration: line-through; }
.final-q button.chosen { background: #1d3021; border-color: #2f7a3d; }
input { min-height: 44px; background: #0d0f13; border: 1px solid var(--border); color: var(--text); border-radius: 8px; padding: 0 10px; font-size: 16px; }
```

- [ ] **Step 3: Logika finału w `host.js`**

Dopisz do `render(state)` na końcu:

```js
  const f = state.final;
  $('#final-card').hidden = state.phase !== 'final';
  if (state.phase === 'final') {
    $('#final-sum-host').textContent = f.sum;
    $('#final-questions').innerHTML = f.questions.map((q, qi) => {
      const player = (p) => {
        const entry = f.entries[p][qi];
        const otherEntry = f.entries[1 - p][qi];
        if (entry !== null) {
          const label = entry.answerIndex === null
            ? 'PUDŁO (0 pkt)'
            : `${q.answers[entry.answerIndex].text} (${q.answers[entry.answerIndex].points})`;
          return `<div class="player"><span>Gracz ${p + 1}</span>` +
            `<button class="chosen" data-clear data-q="${qi}" data-p="${p}">${label} — cofnij</button></div>`;
        }
        const buttons = q.answers.map((a, ai) => {
          const used = otherEntry && otherEntry.answerIndex === ai;
          return `<button data-q="${qi}" data-p="${p}" data-a="${ai}" class="${used ? 'used' : ''}" ${used ? 'disabled' : ''}>${a.text} (${a.points})</button>`;
        }).join('');
        return `<div class="player"><span>Gracz ${p + 1}</span>${buttons}` +
          `<button data-q="${qi}" data-p="${p}" data-a="null">PUDŁO — 0 pkt</button></div>`;
      };
      return `<div class="final-q"><h4>${qi + 1}. ${q.question}</h4><div class="players">${player(0)}${player(1)}</div></div>`;
    }).join('');
  }

  // korekty
  for (const row of document.querySelectorAll('#fix-card .row')) {
    const t = Number(row.dataset.team);
    if (document.activeElement?.closest('.row') !== row) {
      row.querySelector('.name-input').value = state.teams[t].name;
      row.querySelector('.bank-input').value = state.teams[t].bank;
    }
  }
```

Handlery (raz, poza render):

```js
$('#final-questions').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const qIndex = Number(btn.dataset.q);
  const player = Number(btn.dataset.p);
  if (btn.hasAttribute('data-clear')) return send({ type: 'finalClear', qIndex, player });
  const answerIndex = btn.dataset.a === 'null' ? null : Number(btn.dataset.a);
  send({ type: 'finalSet', qIndex, player, answerIndex });
});
$('#btn-timer-15').onclick = () => send({ type: 'timerStart', seconds: 15 });
$('#btn-timer-20').onclick = () => send({ type: 'timerStart', seconds: 20 });
$('#btn-timer-stop').onclick = () => send({ type: 'timerStop' });
$('#btn-repeat').onclick = () => send({ type: 'repeatBuzzer' });
for (const row of document.querySelectorAll('#fix-card .row')) {
  const t = Number(row.dataset.team);
  row.querySelector('.btn-apply').onclick = () => {
    send({ type: 'setTeamName', team: t, name: row.querySelector('.name-input').value });
    send({ type: 'setBank', team: t, value: Number(row.querySelector('.bank-input').value) });
  };
}
```

- [ ] **Step 4: Weryfikacja ręczna**

`/host` + `/board`: „Finał" → obie strony w trybie finału; klik odpowiedzi gracza 1 → odkrycie na tablicy; przy graczu 2 odpowiedź użyta przez gracza 1 wyszarzona; „POWTÓRZONA!" → brzęczyk na tablicy; timery 15/20 s odliczają na tablicy; suma ≥ 200 → animacja + brawo; korekta banku działa.

- [ ] **Step 5: Commit**

```bash
git add public/host.html public/host.css public/host.js
git commit -m "feat: panel prowadzącego — finał i korekty"
```

---

### Task 13: Buzzery

**Files:**
- Create: `public/buzzer.html` (jedna strona dla obu drużyn — numer z URL)

**Interfaces:**
- Consumes: `connectGame` (Task 7), komenda `buzz` i stan rundy (Task 3), route `/buzzer/:team` (Task 6).
- Produces: strona buzzera. Stany: `czekaj` (nieaktywny), `gotowy` (uzbrojony), `wygrany` („TY!"), `przegrany` („SPÓŹNIONY").

- [ ] **Step 1: Implementacja (inline style + script, jeden plik)**

```html
<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
<title>Familiada — buzzer</title>
<style>
  * { margin: 0; box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    display: grid; place-items: center;
    font-family: system-ui, sans-serif; font-weight: 900;
    color: #fff; text-align: center;
    user-select: none; -webkit-user-select: none; touch-action: manipulation;
    transition: background 0.15s;
  }
  body[data-state="czekaj"] { background: #23272f; color: #8a93a5; }
  body[data-state="gotowy"].team-0 { background: #3d8bfd; }
  body[data-state="gotowy"].team-1 { background: #ff4d4d; }
  body[data-state="wygrany"] { background: #1faa4a; }
  body[data-state="przegrany"] { background: #17191d; color: #555; }
  body.disconnected::before {
    content: 'ŁĄCZĘ…'; position: fixed; top: 12px; left: 0; right: 0; font-size: 16px; color: #ffb300;
  }
  #label { font-size: 14vw; line-height: 1.1; padding: 5vw; }
  #team { position: fixed; bottom: 16px; left: 0; right: 0; font-size: 16px; font-weight: 400; opacity: 0.8; }
</style>
</head>
<body data-state="czekaj">
<div id="label">CZEKAJ</div>
<div id="team"></div>
<script type="module">
  import { connectGame } from '/common/ws.js';
  const team = Number(location.pathname.split('/').pop()) - 1; // /buzzer/1 -> 0
  document.body.classList.add(`team-${team}`);

  let state = null;
  const game = connectGame((msg) => {
    state = msg.state;
    const r = state.round;
    let mode = 'czekaj';
    let label = 'CZEKAJ';
    if (state.phase === 'round' && r.stage === 'buzzers') {
      if (r.buzzed === null) { mode = 'gotowy'; label = 'NACIŚNIJ!'; }
      else if (r.buzzed === team) { mode = 'wygrany'; label = 'TY!'; }
      else { mode = 'przegrany'; label = 'SPÓŹNIONY'; }
    }
    document.body.dataset.state = mode;
    document.getElementById('label').textContent = label;
    document.getElementById('team').textContent = `Buzzer: ${state.teams[team].name}`;
  });

  document.body.addEventListener('pointerdown', () => {
    if (document.body.dataset.state === 'gotowy') {
      game.send({ type: 'buzz', team });
      if (navigator.vibrate) navigator.vibrate(80);
    }
  });

  // ekran nie może zgasnąć w trakcie gry
  try { navigator.wakeLock?.request('screen'); } catch {}
</script>
</body>
</html>
```

- [ ] **Step 2: Weryfikacja ręczna**

`/buzzer/1` + `/buzzer/2` + `/host` + `/board`: przed rundą oba „CZEKAJ"; „Nowa runda" → oba „NACIŚNIJ!" w kolorach drużyn; tap pierwszego → „TY!" (zielony) / drugi „SPÓŹNIONY", beep na tablicy, wskaźnik przy banku; „Uzbrój buzzery ponownie" → oba znów gotowe; wybór grającej drużyny → oba „CZEKAJ".

- [ ] **Step 3: Commit**

```bash
git add public/buzzer.html
git commit -m "feat: buzzery na tablety"
```

---

### Task 14: README i smoke test całości

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: wszystko powyżej.

- [ ] **Step 1: README**

Napisz `README.md` po polsku z sekcjami:
- **Uruchomienie:** `npm install`, `npm start`, otwarcie `http://localhost:3000/`; podpięcie projektora (`/board` + F11), panelu (`/host` z laptopa lub tabletu po LAN), buzzerów (`/buzzer/1`, `/buzzer/2` — QR ze strony startowej). Uwaga o firewallu (port 3000/TCP) i o tym, że wszystkie urządzenia muszą być w tej samej sieci.
- **Sterowanie:** tabela skrótów (`1`–`6`, `Q`/`W`, `←`/`→`) + opis przycisków panelu.
- **Plik pytań:** format `questions.json` (przykład z Task 2), zasady (≤ 6 odpowiedzi, finał = 5 pytań, mnożniki).
- **Dźwięk:** tablica wymaga jednego kliknięcia po otwarciu (polityka autoplay przeglądarek).
- **Awarie:** serwer można zrestartować w trakcie gry (stan wraca z `state.json`); skasowanie `state.json` = czysty start.
- **Smoke test** (checklista ręczna):
  1. `npm test` — wszystko zielone.
  2. `npm start`; otwórz `/board`, `/host`, `/buzzer/1`, `/buzzer/2` (4 karty).
  3. Intro → wideo, po nim plansza + muzyka, „Stop muzykę" ucina.
  4. Nowa runda → buzzery aktywne; tap → „TY!" + beep.
  5. Odkrycia, X-y, przejęcie, suma do banku — dźwięki i tablica spójne.
  6. Finał: timery, powtórzona, wygrana ≥ 200 → brawo.
  7. Zabij serwer (Ctrl+C), `npm start` — gra wraca w tym samym miejscu, klienci sami się łączą.
  8. „Nowa gra" → wszystko wyzerowane.

- [ ] **Step 2: Przejść smoke test**

Run: cała checklista z README ręcznie.
Expected: wszystkie punkty przechodzą; poprawki, jeśli coś nie działa (i dopiero wtedy commit).

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README z instrukcją uruchomienia i smoke testem"
```
