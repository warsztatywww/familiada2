// public/board.js
import { connectGame } from '/common/ws.js';

const $ = (id) => document.getElementById(id);
let lastSeq = -1;

function show(viewId) {
  for (const s of document.querySelectorAll('#board > section')) s.hidden = s.id !== viewId;
}

// --- dźwięki i wielki X ---

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

// --- plansza rundy ---

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

// Pusta plansza — pokazywana w fazie 'idle', gdy intro gra w tle jako muzyka
// (lub zostało wyciszone), a przed rundą nie ma jeszcze danych rundy.
function renderEmptyBoard(state) {
  $('answers').innerHTML = Array.from({ length: 6 })
    .map((_, i) => `<li class="hidden-answer"><span>${i + 1}</span><span class="text">${'-'.repeat(17)}</span><span class="pts">--</span></li>`)
    .join('');
  $('sum').textContent = 0;
  for (const t of [0, 1]) {
    $(`bank-${t}`).textContent = state.teams[t].bank;
    $(`team-${t}`).textContent = state.teams[t].name;
    $(`strikes-${t}`).textContent = '';
    $(`side-${t}`).classList.remove('buzzed');
  }
}

// --- intro ---

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
    // Po odświeżeniu tablicy w trakcie 'music' snapshot startowy ląduje tu
    // bezpośrednio (bez przejścia przez 'video') — trzeba dograć muzykę.
    // Nie resetujemy currentTime: wznowienie w środku utworu jest ok, a po
    // odświeżeniu i tak zaczyna się od 0.
    if (music.paused) music.play().catch(() => {});
  }
  // widok dla 'music' przełącza render() (pusta plansza)
}

// --- finał ---

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
    if (f.timer.startedAt !== lastTimerStart) {
      lastTimerStart = f.timer.startedAt;
      startTimerLoop(f.timer, msg.now);
    }
  } else {
    timerEl.hidden = true;
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

// --- koniec gry ---

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

let lastState = null; // najnowszy state — potrzebny w handlerze kliknięcia (odblokowanie audio)
function render(msg) {
  const { state } = msg;
  lastState = state;
  if (state.phase === 'round') {
    show('view-round');
    renderRound(state);
  } else if (state.phase === 'idle') {
    // renderIntro musi zawsze dostać szansę zareagować na zmianę stanu
    // (np. 'music' -> 'off' ma wyciszyć muzykę), nawet gdy to render()
    // decyduje, który widok pokazać.
    renderIntro(state);
    if (state.intro !== 'idle' && state.intro !== 'video') {
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

const audioHint = $('audio-hint');
if (audioHint) {
  setTimeout(() => { audioHint.hidden = true; }, 5000);
  document.addEventListener('click', () => {
    audioCtx.resume();
    audioHint.hidden = true;
    // Świeży snapshot po odświeżeniu strony w trakcie intro === 'music'
    // trafia do renderIntro() zanim padnie pierwszy gest użytkownika —
    // przeglądarka blokuje wtedy music.play(); doganiamy to tutaj.
    const music = $('snd-intro');
    if (lastState?.intro === 'music' && music.paused) music.play().catch(() => {});
  }, { once: true });
}
