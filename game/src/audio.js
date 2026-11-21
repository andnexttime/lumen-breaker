// Sound, synthesised live with WebAudio: no audio files, nothing fetched. Every effect
// is a short oscillator note with an envelope; the brick ping climbs in pitch with the
// combo, so a hot streak sounds hot. The context is created lazily on the first user
// gesture (browsers refuse audio before one) and M toggles mute.

export function createAudio() {
  let context = null;
  let master = null;
  let muted = false;

  function ensure() {
    if (context !== null) return true;
    try {
      const AudioContext = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.5;
      master.connect(context.destination);
    } catch {
      return false;
    }
    return true;
  }

  /** One note: an oscillator that slides from `from` Hz to `to` Hz over `seconds`. */
  function note(from, to, seconds, type, volume, delay = 0) {
    if (muted || !ensure() || context.state === 'suspended') {
      if (context !== null && context.state === 'suspended') context.resume().catch(() => {});
      return;
    }
    const start = context.currentTime + delay;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, from), start);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + seconds);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
    osc.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(start + seconds + 0.05);
  }

  return {
    /** Call from a user gesture so the browser lets audio start. */
    unlock() {
      ensure();
      if (context !== null && context.state === 'suspended') context.resume().catch(() => {});
    },
    isMuted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    paddle() {
      note(220, 330, 0.07, 'triangle', 0.35);
    },
    /** Pitch rises with the combo multiplier, 1 to 5. */
    brick(multiplier) {
      const base = 520 + 90 * (multiplier - 1);
      note(base, base * 1.5, 0.09, 'sine', 0.4);
    },
    steel() {
      note(180, 140, 0.1, 'square', 0.22);
      note(720, 900, 0.06, 'sine', 0.18, 0.02);
    },
    coreHit() {
      note(300, 90, 0.22, 'sawtooth', 0.3);
      note(1200, 1500, 0.12, 'sine', 0.25, 0.03);
    },
    power() {
      note(660, 660, 0.08, 'sine', 0.3);
      note(880, 880, 0.08, 'sine', 0.3, 0.07);
      note(1320, 1320, 0.12, 'sine', 0.3, 0.14);
    },
    life() {
      note(523, 523, 0.1, 'sine', 0.3);
      note(659, 659, 0.1, 'sine', 0.3, 0.09);
      note(784, 784, 0.16, 'sine', 0.3, 0.18);
    },
    lose() {
      note(392, 196, 0.3, 'triangle', 0.35);
      note(311, 155, 0.35, 'triangle', 0.3, 0.12);
    },
    levelClear() {
      note(523, 523, 0.1, 'triangle', 0.32);
      note(659, 659, 0.1, 'triangle', 0.32, 0.09);
      note(784, 784, 0.1, 'triangle', 0.32, 0.18);
      note(1046, 1046, 0.22, 'triangle', 0.32, 0.27);
    },
    win() {
      const melody = [523, 659, 784, 1046, 784, 1046, 1318];
      melody.forEach((freq, index) => note(freq, freq, 0.16, 'triangle', 0.3, index * 0.11));
    },
    over() {
      const melody = [392, 370, 349, 311];
      melody.forEach((freq, index) => note(freq, freq * 0.94, 0.22, 'triangle', 0.3, index * 0.16));
    },
  };
}
