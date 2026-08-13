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
