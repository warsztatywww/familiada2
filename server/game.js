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
