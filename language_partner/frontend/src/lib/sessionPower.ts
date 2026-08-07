import { playGoodResponseSound, playPowerCompleteSound } from "@/lib/feedbackAudio";

export type SessionPower = {
  multiplier: number;
  powerCelebrations: number;
  streakProgress: number;
};

export type SessionPowerController = {
  rejectTurn: (turnId: number) => void;
  release: () => void;
  rewardGuidedSuggestion: (suggestionId: number) => void;
  rewardTurn: (turnId: number) => void;
};

export function createSessionPower({
  active,
  publish
}: {
  active: () => boolean;
  publish: (power: SessionPower) => void;
}): SessionPowerController {
  const rewardedSuggestions = new Set<number>();
  const rewardedTurns = new Set<number>();
  let multiplier = 1;
  let powerCelebrations = 0;
  let resetTimer: ReturnType<typeof setTimeout> | null = null;
  let streakProgress = 0;

  function clearResetTimer() {
    if (resetTimer) clearTimeout(resetTimer);
    resetTimer = null;
  }

  function update() {
    if (active()) publish({ multiplier, powerCelebrations, streakProgress });
  }

  function addPower() {
    clearResetTimer();
    streakProgress = (streakProgress >= 30 ? 0 : streakProgress) + 10;
    const cycleComplete = streakProgress === 30;
    if (cycleComplete) {
      multiplier += 1;
      powerCelebrations += 1;
      playPowerCompleteSound();
      resetTimer = setTimeout(() => {
        resetTimer = null;
        if (streakProgress !== 30) return;
        streakProgress = 0;
        update();
      }, 800);
    } else {
      playGoodResponseSound();
    }
    update();
  }

  function reset() {
    if (streakProgress === 0 && multiplier === 1) return;
    clearResetTimer();
    streakProgress = 0;
    multiplier = 1;
    update();
  }

  return {
    rejectTurn(turnId) {
      if (!rewardedTurns.has(turnId)) reset();
    },
    release: clearResetTimer,
    rewardGuidedSuggestion(suggestionId) {
      if (rewardedSuggestions.has(suggestionId)) return;
      rewardedSuggestions.add(suggestionId);
      addPower();
    },
    rewardTurn(turnId) {
      if (rewardedTurns.has(turnId) || !active()) return;
      rewardedTurns.add(turnId);
      addPower();
    }
  };
}
