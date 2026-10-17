/**
 * Sound and haptics, fired on the same frame as the visual change they belong to.
 * Kept for meaningful moments only: a set done, rest over, a workout saved, a new record.
 */

let audio: AudioContext | null = null;

/** Unlocks sound. Browsers only allow audio after a tap, so App calls this on the first touch. */
export function primeSound() {
  try {
    audio ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (audio.state === 'suspended') void audio.resume();
  } catch {
    audio = null;
  }
}

function tones(notes: { f: number; at: number; len: number; vol?: number }[]) {
  if (!audio || audio.state !== 'running') return;
  const t = audio.currentTime;
  for (const n of notes) {
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = 'sine';
    o.frequency.value = n.f;
    g.gain.setValueAtTime(0.0001, t + n.at);
    g.gain.exponentialRampToValueAtTime(n.vol ?? 0.25, t + n.at + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + n.at + n.len);
    o.connect(g).connect(audio.destination);
    o.start(t + n.at);
    o.stop(t + n.at + n.len + 0.02);
  }
}

export type Sound = 'rest' | 'success' | 'record';

export function sound(kind: Sound) {
  if (kind === 'rest')
    tones([
      { f: 880, at: 0, len: 0.18 },
      { f: 880, at: 0.25, len: 0.18 },
      { f: 1320, at: 0.5, len: 0.25 },
    ]);
  else if (kind === 'success')
    tones([
      { f: 660, at: 0, len: 0.14, vol: 0.18 },
      { f: 990, at: 0.09, len: 0.22, vol: 0.18 },
    ]);
  else
    tones([
      { f: 784, at: 0, len: 0.14, vol: 0.2 },
      { f: 988, at: 0.1, len: 0.14, vol: 0.2 },
      { f: 1319, at: 0.2, len: 0.32, vol: 0.2 },
    ]);
}

export type Haptic = 'light' | 'success' | 'warning';

const PATTERN: Record<Haptic, number | number[]> = { light: 12, success: [18, 60, 28], warning: [250, 120, 250, 120, 400] };

let iosSwitch: HTMLLabelElement | null = null;
/**
 * Android: the Vibration API. iPhone (Safari 17.4+): toggling a hidden native switch gives a light
 * tap. iOS only allows it during a tap, so a timer finishing on its own cannot buzz on iPhone.
 */
export function haptic(kind: Haptic = 'light') {
  try {
    if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
      navigator.vibrate(PATTERN[kind]);
      return;
    }
    if (!iosSwitch) {
      const label = document.createElement('label');
      label.setAttribute('aria-hidden', 'true');
      label.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden;';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      input.tabIndex = -1;
      label.appendChild(input);
      document.body.appendChild(label);
      iosSwitch = label;
    }
    iosSwitch.click();
  } catch {
    /* not supported */
  }
}
