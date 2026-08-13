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
  }
  // intro === 'music': widok przełącza render() (pusta plansza), muzyka gra dalej
}

function render(msg) {
  const { state } = msg;
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
  }
  if (state.phase !== 'idle') {
    $('snd-intro').pause();
    introShown = null;
  }
  // 'final' i 'gameover' — Task 10
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
  }, { once: true });
}
