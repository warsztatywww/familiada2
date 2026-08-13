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
