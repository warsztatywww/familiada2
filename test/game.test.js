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

test('reveal: odrzuca nienumeryczny indeks', () => {
  const state = freshRound(0);
  const result = apply(state, { type: 'reveal', index: 'map' });
  assert.equal(result, null);
  assert.ok(state.round.answers.every((a) => !a.revealed));
  assert.equal(state.round.sum, 0);
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
  apply(state, { type: 'choosePlayingTeam', team: 0 });
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

test('setBank: odrzuca wartość ujemną', () => {
  const state = createGame(structuredClone(CONFIG));
  const result = apply(state, { type: 'setBank', team: 0, value: -10 });
  assert.equal(result, null);
  assert.equal(state.teams[0].bank, 0);
});

test('setBank: odrzuca non-integer', () => {
  const state = createGame(structuredClone(CONFIG));
  const result = apply(state, { type: 'setBank', team: 0, value: 3.14 });
  assert.equal(result, null);
  assert.equal(state.teams[0].bank, 0);
});

test('setTeamName: odrzuca pusty string', () => {
  const state = createGame(structuredClone(CONFIG));
  const initialName = state.teams[0].name;
  const result = apply(state, { type: 'setTeamName', team: 0, name: '' });
  assert.equal(result, null);
  assert.equal(state.teams[0].name, initialName);
});

test('setTeamName: odrzuca non-string', () => {
  const state = createGame(structuredClone(CONFIG));
  const initialName = state.teams[0].name;
  const result = apply(state, { type: 'setTeamName', team: 0, name: 123 });
  assert.equal(result, null);
  assert.equal(state.teams[0].name, initialName);
});

test('unstrike: zwraca null gdy strikes === 0', () => {
  const state = freshRound(0);
  apply(state, { type: 'choosePlayingTeam', team: 0 });
  const result = apply(state, { type: 'unstrike', team: 0 });
  assert.equal(result, null);
  assert.equal(state.round.strikes[0], 0);
});

test('awardSum: zwraca null gdy stage === done', () => {
  const state = playedToSteal();
  apply(state, { type: 'stealFail' });
  const result = apply(state, { type: 'awardSum', team: 0 });
  assert.equal(result, null);
  assert.equal(state.teams[0].bank, 50); // bez zmian
});

test('stealFail: zwraca null gdy stage !== steal', () => {
  const state = freshRound(0);
  apply(state, { type: 'choosePlayingTeam', team: 0 });
  const result = apply(state, { type: 'stealFail' });
  assert.equal(result, null);
  assert.equal(state.round.stage, 'play'); // bez zmian
});

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

test('timerStart: odrzuca seconds === 0', () => {
  const state = freshFinal();
  const result = apply(state, { type: 'timerStart', seconds: 0, now: 1000000 });
  assert.equal(result, null);
  assert.equal(state.final.timer, null);
});

test('timerStart: odrzuca seconds < 0', () => {
  const state = freshFinal();
  const result = apply(state, { type: 'timerStart', seconds: -5, now: 1000000 });
  assert.equal(result, null);
  assert.equal(state.final.timer, null);
});

test('timerStart: odrzuca seconds nie-integer', () => {
  const state = freshFinal();
  const result = apply(state, { type: 'timerStart', seconds: 1.5, now: 1000000 });
  assert.equal(result, null);
  assert.equal(state.final.timer, null);
});

test('timerStart echuje player 1 i 2', () => {
  const s = freshFinal();
  const ev1 = apply(s, { type: 'timerStart', seconds: 15, player: 1, now: 1000 });
  assert.equal(ev1.player, 1);
  const ev2 = apply(s, { type: 'timerStart', seconds: 20, player: 2, now: 2000 });
  assert.equal(ev2.player, 2);
});

test('timerStart bez player: pole undefined, timer ustawiony', () => {
  const s = freshFinal();
  const ev = apply(s, { type: 'timerStart', seconds: 15, now: 1000 });
  assert.equal(ev.player, undefined);
  assert.deepEqual(s.final.timer, { duration: 15, startedAt: 1000 });
});

test('timerStart z nieprawidłowym player: pominięty, timer ustawiony', () => {
  const s = freshFinal();
  const ev = apply(s, { type: 'timerStart', seconds: 15, player: 5, now: 1000 });
  assert.equal(ev.player, undefined);
  assert.deepEqual(s.final.timer, { duration: 15, startedAt: 1000 });
});
