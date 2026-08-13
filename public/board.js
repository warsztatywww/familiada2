// public/board.js
import { connectGame } from '/common/ws.js';

const $ = (id) => document.getElementById(id);
let lastSeq = -1;

function show(viewId) {
  for (const s of document.querySelectorAll('#board > section')) s.hidden = s.id !== viewId;
}

// --- dźwięki i wielki X ---

// Kanał SFX: krótkie efekty, mogą się nakładać (każdy własny <audio>).
function playSfx(id) {
  const el = $(id);
  el.currentTime = 0;
  el.play().catch(() => {}); // audio odblokowane bramką startową; catch na wszelki wypadek
}

// Kanał jingla: długie stingi — nowy zatrzymuje poprzedni, żeby dwa się nie zderzyły.
const JINGLES = ['jingle-break', 'jingle-prefinal', 'jingle-after1'];
function playJingle(id) {
  for (const j of JINGLES) { const el = $(j); el.pause(); el.currentTime = 0; }
  const el = $(id);
  el.currentTime = 0;
  el.play().catch(() => {});
}

function handleEvent(event) {
  switch (event.type) {
    case 'reveal':
    case 'round-won':
    case 'steal-success':
    case 'final-reveal':
    case 'cheap-reveal':
      playSfx('snd-good');
      break;
    case 'strike':
    case 'strike-out':
    case 'steal-fail':
    case 'final-miss':
      playSfx('snd-bad'); // błąd pokazują X-y w kolumnach krawędziowych matrycy
      break;
    case 'buzz':
      playSfx('snd-buzz');
      break;
    case 'repeat':
      playSfx('snd-final-repeat');
      break;
    case 'new-round':
      playJingle('jingle-break');
      break;
    case 'final-start':
      playJingle('jingle-prefinal');
      break;
    case 'timer-start':
      if (event.player === 2) playJingle('jingle-after1');
      break;
    case 'intro': {
      // Ponowne kliknięcie "Intro" w trakcie odtwarzania = replay od początku.
      if (lastState?.phase !== 'idle') break;
      const video = $('intro-video');
      const music = $('snd-intro');
      video.currentTime = 0;
      video.play().catch(() => {});
      music.currentTime = 0;
      music.play().catch(() => {});
      break;
    }
  }
}

// --- matryca znakowa ---
// Ekran to siatka modułów po jednym znaku (jak fizyczna tablica z teleturnieju):
// widok komponuje linie tekstu o stałej szerokości, a setCells zamienia każdy
// znak w komórkę <span class="cell">.

const COLS = 28;       // matryca rundy: nr(1)+odstęp(1)+tekst(22)+odstęp(1)+pkt(3)
const TEXT_W = COLS - 6;
const COLS_FINAL = 32; // finał: 2 × [tekst(12)+odstęp(1)+pkt(2)] + przerwa(2), punkty przy środku
const ROWS = 8;        // 6 odpowiedzi + pusty wiersz + SUMA

const esc = (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] ?? c);
const chars = (s) => [...s]; // spread zamiast split — polskie znaki spoza BMP też są 1 komórką

// Linia: string albo { text, cls } (klasa trafia na każdą komórkę wiersza).
// Znak █ to zakryte punkty finału — komórka-blok w pełni zaświecona (CSS).
function rowHtml(line, cols) {
  const { text, cls } = typeof line === 'string' ? { text: line, cls: '' } : line;
  return chars(text.padEnd(cols)).slice(0, cols)
    .map((c) => {
      if (c === '█') return `<span class="cell block${cls ? ` ${cls}` : ''}"></span>`;
      return `<span class="cell${cls ? ` ${cls}` : ''}">${c === ' ' ? '' : esc(c)}</span>`;
    })
    .join('');
}

function setCells(el, lines, cols) {
  el.style.setProperty('--cols', cols);
  el.innerHTML = lines.map((l) => rowHtml(l, cols)).join('');
}

// Mały wyświetlacz nad ramą (suma rundy / timer finału).
function setMini(el, value) {
  setCells(el, [String(value).padStart(3)], 3);
}

const fit = (s, w) => chars(s.toUpperCase()).slice(0, w).join('').padEnd(w);
const alignRight = (s, cols) => s.padStart(cols);
const center = (s, cols) => s.padStart(Math.floor((cols + chars(s).length) / 2));
const sumLine = (sum, cols) => alignRight(`SUMA ${String(sum).padStart(3)}`, cols);

// Kolumny błędów przy krawędziach matrycy: do trzech dużych X-ów (trzy
// wypełniają całą wysokość tablicy, pojawiają się od góry), a po nieudanym
// przejęciu jeden jeszcze większy X zamiast nich.
function renderEdges(strikes, stealFailed) {
  const modules = Array.from({ length: ROWS * 3 }, () => '<span class="cell"></span>').join('');
  for (const t of [0, 1]) {
    const xs = stealFailed === t
      ? '<div class="exlay exlay--big"><span class="ex ex-big">X</span></div>'
      : `<div class="exlay">${[0, 1, 2]
          .map((i) => `<span class="ex">${i < strikes[t] ? 'X' : ''}</span>`)
          .join('')}</div>`;
    $(`edge-${t}`).innerHTML = modules + xs;
  }
}

// --- plansza rundy ---

// Rząd odpowiedzi: nieodkryta = numer + kropkowana linia; odkryta = tekst
// + punkty (tania bez mnożnika); brak odpowiedzi (pytanie ma ich mniej niż 6)
// = pusty wiersz.
function answerLine(a, i, multiplier) {
  if (a === undefined) return '';
  if (!a || !a.revealed) return `${i + 1} ${'.'.repeat(COLS - 2)}`;
  const pts = String(a.points * (a.cheap ? 1 : multiplier)).padStart(3);
  return `${i + 1} ${fit(a.text, TEXT_W)} ${pts}`;
}

function renderBoard(answers, sum, multiplier) {
  const lines = Array.from({ length: 6 }, (_, i) => answerLine(answers[i], i, multiplier));
  lines.push('', sumLine(sum, COLS));
  setCells($('grid'), lines, COLS);
  setMini($('mini-round'), sum);
}

function renderRound(state) {
  const r = state.round;
  renderBoard(r.answers, r.sum, r.multiplier);
  renderEdges(r.strikes, r.stealFailed ?? null);
  for (const t of [0, 1]) {
    $(`bank-${t}`).textContent = state.teams[t].bank;
    $(`team-${t}`).textContent = state.teams[t].name;
    $(`side-${t}`).classList.toggle('buzzed', r.buzzed === t);
  }
}

// Pusta plansza — pokazywana w fazie 'idle', gdy intro gra w tle jako muzyka
// (lub zostało wyciszone), a przed rundą nie ma jeszcze danych rundy.
function renderEmptyBoard(state) {
  renderBoard(Array(6).fill(null), 0, 1);
  renderEdges([0, 0], null);
  for (const t of [0, 1]) {
    $(`bank-${t}`).textContent = state.teams[t].bank;
    $(`team-${t}`).textContent = state.teams[t].name;
    $(`side-${t}`).classList.remove('buzzed');
  }
}

// --- intro ---

// Po odświeżeniu tablicy w stanie 'music' wideo ładuje się od zera — dosuwamy
// je na koniec, żeby pokazać ostatnią klatkę czołówki (po naturalnym 'ended'
// wideo i tak stoi na ostatniej klatce, seek jest wtedy no-opem).
function freezeOnLastFrame(video) {
  const seek = () => { if (video.duration) video.currentTime = Math.max(0, video.duration - 0.05); };
  video.pause();
  if (video.readyState >= 1) seek();
  else video.addEventListener('loadedmetadata', seek, { once: true });
}

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
  } else if (state.intro === 'music') {
    // Wideo skończone: na tablicy zostaje ostatnia klatka, muzyka gra dalej.
    // Po odświeżeniu strony snapshot ląduje tu bez przejścia przez 'video' —
    // trzeba dograć muzykę (bez resetu currentTime; po reloadzie i tak od 0).
    show('view-intro');
    freezeOnLastFrame(video);
    if (music.paused) music.play().catch(() => {});
  }
}

// --- finał ---

const FINAL_TEXT_W = 12;

// Połówka wiersza finału: odpowiedzi na zewnątrz, punkty przy środku (jak na
// oryginalnej tablicy). Nieodkryte pole = kreski na całej szerokości i blok
// (kurtyna) zamiast punktów; brak odpowiedzi = krótkie kreski + 0.
function finalHalf(f, player, qIndex) {
  const entry = f.entries[player][qIndex];
  if (f.covered || entry === null) return { text: '-'.repeat(FINAL_TEXT_W), pts: '██' };
  if (entry.answerIndex === null) return { text: '----', pts: ' 0' };
  const a = f.questions[qIndex].answers[entry.answerIndex];
  return { text: fit(a.text, FINAL_TEXT_W).trimEnd(), pts: String(a.points).padStart(2) };
}

function finalRow(f, qIndex) {
  const l = finalHalf(f, 0, qIndex);
  const r = finalHalf(f, 1, qIndex);
  return `${l.text.padStart(FINAL_TEXT_W)} ${l.pts}  ${r.pts} ${r.text.padEnd(FINAL_TEXT_W)}`;
}

function renderFinal(msg) {
  const f = msg.state.final;
  const lines = ['', ...f.questions.map((q, i) => finalRow(f, i))];
  lines.push('', center(`SUMA ${String(f.sum).padStart(3)}`, COLS_FINAL));
  setCells($('final-grid'), lines, COLS_FINAL);
  document.getElementById('view-final').classList.toggle('won', f.won);

  // Mały wyświetlacz: odliczanie, gdy timer biegnie (pętla RAF nadpisuje go
  // co klatkę), poza tym suma finału.
  if (f.timer) {
    if (f.timer.startedAt !== lastTimerStart) {
      lastTimerStart = f.timer.startedAt;
      startTimerLoop(f.timer, msg.now);
    }
  } else {
    setMini($('mini-final'), f.sum);
    lastTimerStart = null;
    stopTimerLoop();
  }
}

let timerRAF = null;
let timerDone = false;
let lastTimerStart = null; // startedAt ostatnio uruchomionego timera — nie restartuj pętli RAF bez zmiany
function startTimerLoop(timer, serverNow) {
  const offset = Date.now() - serverNow; // korekta zegara klienta
  cancelAnimationFrame(timerRAF);
  const elapsedAtStart = (Date.now() - offset - timer.startedAt) / 1000;
  const remainingAtStart = Math.max(0, Math.ceil(timer.duration - elapsedAtStart));
  // Timer przywrócony przez undo/redo już wygasły — pokaż 0 bez dźwięku,
  // gong ma grać tylko przy naturalnym dojściu do zera na żywo.
  timerDone = remainingAtStart === 0;
  const tick = () => {
    const elapsed = (Date.now() - offset - timer.startedAt) / 1000;
    const remaining = Math.max(0, Math.ceil(timer.duration - elapsed));
    setMini($('mini-final'), remaining);
    if (remaining === 0 && !timerDone) {
      timerDone = true;
      playSfx('snd-final-time');
    }
    if (remaining > 0) timerRAF = requestAnimationFrame(tick);
  };
  tick();
}
function stopTimerLoop() { cancelAnimationFrame(timerRAF); }

// --- koniec gry ---

function renderGameover(state) {
  const winner = state.teams[0].bank === state.teams[1].bank ? null
    : state.teams[0].bank > state.teams[1].bank ? 0 : 1;
  const teamLine = (t) => ({
    text: `${fit(state.teams[t].name, COLS - 5)} ${String(state.teams[t].bank).padStart(4)}`,
    cls: winner === t ? 'win' : '',
  });
  const lines = ['', center('KONIEC GRY', COLS), '', teamLine(0), teamLine(1)];
  if (state.final) lines.push('', center(`FINAŁ ${state.final.sum}`, COLS));
  setCells($('go-grid'), lines, COLS);
  setMini($('mini-go'), state.teams[winner ?? 0].bank);
}

let lastState = null; // najnowszy state — potrzebny w handlerze kliknięcia (odblokowanie audio)
function render(msg) {
  const { state } = msg;
  lastState = state;
  if (state.phase !== 'final') {
    // Pętla RAF timera finału nie może przeżyć wyjścia z widoku finału —
    // inaczej tyka i piszczy w tle nad ukrytym #final-timer (np. po endGame
    // w trakcie odliczania).
    stopTimerLoop();
    lastTimerStart = null;
  }
  if (state.phase === 'round') {
    show('view-round');
    renderRound(state);
  } else if (state.phase === 'idle') {
    // renderIntro musi zawsze dostać szansę zareagować na zmianę stanu
    // (np. 'music' -> 'off' ma wyciszyć muzykę), nawet gdy to render()
    // decyduje, który widok pokazać.
    renderIntro(state);
    if (state.intro === 'off') {
      show('view-round');
      renderEmptyBoard(state);
    }
  } else if (state.phase === 'final') {
    show('view-final');
    renderFinal(msg);
  } else if (state.phase === 'gameover') {
    show('view-gameover');
    renderGameover(state);
  }
  if (state.phase !== 'idle') {
    $('snd-intro').pause();
    introShown = null;
  }
}

const game = connectGame((msg) => {
  render(msg);
  if (msg.seq !== lastSeq && msg.event) {
    lastSeq = msg.seq;
    handleEvent(msg.event);
  }
  lastSeq = msg.seq;
});

$('intro-video').addEventListener('ended', () => game.send({ type: 'introVideoEnded' }));

// --- odblokowanie audio po pierwszym geście użytkownika ---

// --- bramka startowa: pełny ekran + odblokowanie audio ---
// Tablica startuje z pełnoekranową nakładką i wymaga jednego kliknięcia.
// Ten gest jednocześnie wchodzi w tryb pełnoekranowy i odblokowuje audio
// (przeglądarki blokują dźwięk do pierwszej interakcji użytkownika).

$('btn-start').addEventListener('click', () => {
  document.documentElement.requestFullscreen().catch(() => {});
  $('start-gate').hidden = true;
  // Jeśli intro leci w tle, dograj/zsynchronizuj muzykę po odblokowaniu.
  const music = $('snd-intro');
  const video = $('intro-video');
  if (lastState?.phase === 'idle' && music.paused) {
    if (lastState.intro === 'video') music.currentTime = video.currentTime;
    if (lastState.intro === 'video' || lastState.intro === 'music') music.play().catch(() => {});
  }
});
