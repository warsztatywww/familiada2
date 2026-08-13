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
      if (state.phase !== 'round' || !Number.isInteger(cmd.index)) return null;
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
      if (state.phase !== 'round' || !Number.isInteger(cmd.index)) return null;
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
      const player = cmd.player === 1 || cmd.player === 2 ? cmd.player : undefined;
      return { type: 'timer-start', player };
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
    default:
      return null;
  }
}
