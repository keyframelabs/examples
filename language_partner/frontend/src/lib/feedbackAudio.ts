let audioContext: AudioContext | null = null;

function context() {
  if (typeof window === "undefined") return null;
  if (!window.AudioContext) return null;
  try {
    audioContext ??= new window.AudioContext();
  } catch {
    return null;
  }
  return audioContext;
}

export function primeFeedbackAudio() {
  const current = context();
  if (current?.state === "suspended") void current.resume().catch(() => undefined);
}

function playNotes(notes: readonly number[], spacing: number, duration: number) {
  const current = context();
  if (!current) return;

  const schedule = () => {
    const start = current.currentTime + 0.01;
    notes.forEach((frequency, index) => {
      const noteStart = start + index * spacing;
      const oscillator = current.createOscillator();
      const gain = current.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, noteStart);
      gain.gain.setValueAtTime(0.0001, noteStart);
      gain.gain.exponentialRampToValueAtTime(0.09, noteStart + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + duration);
      oscillator.connect(gain).connect(current.destination);
      oscillator.start(noteStart);
      oscillator.stop(noteStart + duration + 0.02);
    });
  };

  if (current.state === "suspended") {
    void current.resume().then(schedule).catch(() => undefined);
  } else {
    schedule();
  }
}

export const playGoodResponseSound = () => playNotes([659.25, 880], 0.09, 0.2);
export const playPowerCompleteSound = () => playNotes([523.25, 659.25, 783.99, 1046.5], 0.1, 0.28);
