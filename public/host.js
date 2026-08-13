import { connectGame } from '/common/ws.js';

const $ = (s) => document.querySelector(s);
let current = null; // ostatni snapshot

const game = connectGame((msg) => {
  current = msg;
  render(msg);
});
const send = (cmd) => game.send(cmd);

const STAGE_LABELS = {
  buzzers: 'PYTANIE STARTOWE',
  play: 'GRA',
  steal: 'PRZEJĘCIE',
  done: 'KONIEC RUNDY',
};

function render(msg) {
  const state = msg.state;
  const r = state.round;
  const inRound = state.phase === 'round';

  $('#stage-badge').textContent =
    state.phase === 'idle' ? 'START' :
    state.phase === 'final' ? 'FINAŁ' :
    state.phase === 'gameover' ? 'KONIEC GRY' :
    STAGE_LABELS[r.stage] + (r.playingTeam !== null ? ` — ${state.teams[r.playingTeam].name}` : '');

  $('#round-info').textContent = inRound
    // "x" literą, nie znakiem × — font Familiada nie ma glifu ×
    ? `Runda ${state.roundIndex + 1}/${state.config.rounds.length} x${r.multiplier}`
    : '';

  $('#question-card').hidden = state.phase === 'final';
  document.body.classList.toggle('final', state.phase === 'final');
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
    box.classList.toggle('active', inRound &&
      ((r.stage === 'play' && t === r.playingTeam) ||
       (r.stage === 'steal' && t === 1 - r.playingTeam)));
    box.querySelector('.btn-play').disabled = !inRound || r.stage !== 'buzzers';
    box.querySelector('.btn-strike').disabled = !inRound ||
      (r.stage !== 'buzzers' && r.stage !== 'play') ||
      (r.stage === 'play' && t !== r.playingTeam);
    box.querySelector('.btn-award').disabled = !inRound || (r.stage !== 'play' && r.stage !== 'steal');
  }

  const buzzerEl = $('#buzzer-status');
  if (!inRound || r.stage !== 'buzzers') {
    buzzerEl.textContent = '';
    buzzerEl.className = '';
  } else if (r.buzzed === null) {
    buzzerEl.textContent = 'Buzzery uzbrojone — czekam…';
    buzzerEl.className = 'armed';
  } else {
    buzzerEl.textContent = `PIERWSZA: ${state.teams[r.buzzed].name}`;
    buzzerEl.className = `buzzed team-${r.buzzed}`;
  }
  $('#btn-reset-buzzers').disabled = !inRound || r.stage !== 'buzzers';
  $('#btn-steal-fail').disabled = !inRound || r.stage !== 'steal';
  // ponowny start finału skasowałby odpowiedzi graczy; powrót z finału robi COFNIJ
  $('#btn-final').disabled = state.phase === 'final' || state.config.final.length !== 5;
  $('#btn-reset-round').disabled = !inRound;
  $('#btn-prev-round').disabled = !inRound || state.roundIndex === 0;
  // aktywna tylko na start gry (idle) i między rundami — nie wyprowadza z finału
  $('#btn-next-round').disabled = !(state.phase === 'idle' ||
    (inRound && state.roundIndex < state.config.rounds.length - 1));

  const f = state.final;
  $('#final-card').hidden = state.phase !== 'final';
  if (state.phase === 'final') {
    $('#final-sum-host').textContent = f.sum;
    $('#btn-final-cover').textContent = f.covered ? 'ODKRYJ TABLICĘ' : 'ZAKRYJ TABLICĘ';
    $('#final-questions').innerHTML = f.questions.map((q, qi) => {
      const player = (p) => {
        const entry = f.entries[p][qi];
        const otherEntry = f.entries[1 - p][qi];
        if (entry !== null) {
          const label = entry.answerIndex === null
            ? 'PUDŁO (0 pkt)'
            : `${q.answers[entry.answerIndex].text} (${q.answers[entry.answerIndex].points})`;
          return `<div class="player"><span>Gracz ${p + 1}</span><span class="chosen">${label}</span></div>`;
        }
        const buttons = q.answers.map((a, ai) => {
          const used = otherEntry && otherEntry.answerIndex === ai;
          return `<button data-q="${qi}" data-p="${p}" data-a="${ai}" class="${used ? 'used' : ''}" ${used || f.covered ? 'disabled' : ''}>${a.text} (${a.points})</button>`;
        }).join('');
        return `<div class="player"><span>Gracz ${p + 1}</span>${buttons}` +
          `<button data-q="${qi}" data-p="${p}" data-a="null" ${f.covered ? 'disabled' : ''}>PUDŁO — 0 pkt</button></div>`;
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

  // undo/redo
  const undoBtn = $('#btn-undo');
  undoBtn.disabled = !msg.undoLabel;
  undoBtn.textContent = msg.undoLabel ? `⟲ COFNIJ: ${msg.undoLabel}` : '⟲ COFNIJ';
  const redoBtn = $('#btn-redo');
  redoBtn.disabled = !msg.redoLabel;
  redoBtn.textContent = msg.redoLabel ? `⟳ PONÓW: ${msg.redoLabel}` : '⟳ PONÓW';
}

// --- akcje ---
$('#host-answers').addEventListener('click', (e) => {
  const btn = e.target.closest('button.answer');
  if (!btn) return;
  send({ type: 'reveal', index: Number(btn.dataset.index) });
});

for (const box of document.querySelectorAll('.team-box')) {
  const t = Number(box.dataset.team);
  box.querySelector('.btn-strike').onclick = () => send({ type: 'strike', team: t });
  box.querySelector('.btn-play').onclick = () => send({ type: 'choosePlayingTeam', team: t });
  box.querySelector('.btn-award').onclick = () => send({ type: 'awardSum', team: t });
}

$('#btn-reset-buzzers').onclick = () => send({ type: 'resetBuzzers' });
$('#btn-steal-fail').onclick = () => send({ type: 'stealFail' });
$('#btn-intro').onclick = () => send({ type: 'introStart' });
$('#btn-stop-music').onclick = () => send({ type: 'stopMusic' });
$('#btn-undo').onclick = () => send({ type: 'undo' });
$('#btn-redo').onclick = () => send({ type: 'redo' });
$('#btn-reset-round').onclick = () => send({ type: 'newRound', roundIndex: current.state.roundIndex });
$('#btn-prev-round').onclick = () => send({ type: 'newRound', roundIndex: current.state.roundIndex - 1 });
$('#btn-next-round').onclick = () =>
  send({ type: 'newRound', roundIndex: current.state.phase === 'round' ? current.state.roundIndex + 1 : 0 });
$('#btn-end-game').onclick = () => send({ type: 'endGame' });
$('#btn-new-game').onclick = () => {
  if (confirm('Na pewno zacząć NOWĄ GRĘ? Banki i postęp zostaną wyzerowane.')) send({ type: 'newGame' });
};
$('#btn-final').onclick = () => send({ type: 'startFinal' });

// --- skróty klawiszowe: 1-6 odkryj, Q/W = X lewa/prawa, ←/→ rundy ---
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#fix-card').hidden) {
    $('#fix-card').hidden = true;
    $('#btn-fix').setAttribute('aria-expanded', 'false');
    return;
  }
  if (e.target.tagName === 'INPUT') return;
  if (e.key >= '1' && e.key <= '6') {
    send({ type: 'reveal', index: Number(e.key) - 1 });
  } else if (e.key === 'q' || e.key === 'Q') send({ type: 'strike', team: 0 });
  else if (e.key === 'w' || e.key === 'W') send({ type: 'strike', team: 1 });
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    const phase = current?.state.phase;
    if (phase !== 'round' && phase !== 'idle') return;
    if (e.key === 'ArrowLeft') $('#btn-prev-round').click();
    else $('#btn-next-round').click();
  }
});

// --- finał i korekty ---
$('#final-questions').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const qIndex = Number(btn.dataset.q);
  const player = Number(btn.dataset.p);
  const answerIndex = btn.dataset.a === 'null' ? null : Number(btn.dataset.a);
  send({ type: 'finalSet', qIndex, player, answerIndex });
});
$('#btn-timer-15').onclick = () => send({ type: 'timerStart', seconds: 15 });
$('#btn-timer-20').onclick = () => send({ type: 'timerStart', seconds: 20 });
$('#btn-timer-stop').onclick = () => send({ type: 'timerStop' });
$('#btn-repeat').onclick = () => send({ type: 'repeatBuzzer' });
$('#btn-final-cover').onclick = () => send({ type: 'finalCover', covered: !current.state.final.covered });
$('#btn-fix').onclick = () => {
  const card = $('#fix-card');
  card.hidden = !card.hidden;
  $('#btn-fix').setAttribute('aria-expanded', String(!card.hidden));
};
document.addEventListener('click', (e) => {
  if ($('#fix-card').hidden || e.target.closest('#fix-card, #btn-fix')) return;
  $('#fix-card').hidden = true;
  $('#btn-fix').setAttribute('aria-expanded', 'false');
});
for (const row of document.querySelectorAll('#fix-card .row')) {
  const t = Number(row.dataset.team);
  row.querySelector('.btn-apply').onclick = () => {
    send({ type: 'setTeamName', team: t, name: row.querySelector('.name-input').value });
    send({ type: 'setBank', team: t, value: Number(row.querySelector('.bank-input').value) });
  };
}
