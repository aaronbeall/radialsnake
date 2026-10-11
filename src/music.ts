/** A quiet, layered 32-bar arrangement synthesized without audio files. */
export class AmbientMusic {
  private timer?: ReturnType<typeof setInterval>;
  private nextNote = 0;
  private beat = 0;
  private voices = new Map<AudioScheduledSourceNode, GainNode>();
  private readonly bus: GainNode;
  private readonly themes = [
    [0, 4, 7, 9, 12, 9, 7, 4],
    [9, 7, 4, 2, 4, 7, 12, 9],
    [4, 2, 0, 2, 7, 4, 2, 0],
  ];
  private readonly arrangement = [0, 0, 1, 0, 2, 1, 2, 0];
  constructor(private readonly context: AudioContext) {
    this.bus = context.createGain(); this.bus.gain.value = .4;
    const soften = context.createBiquadFilter(); soften.type = 'lowpass'; soften.frequency.value = 1400;
    this.bus.connect(soften); soften.connect(context.destination);

  }
  start(): void {
    void this.context.resume();
    if (this.timer !== undefined) return;
    this.nextNote = this.context.currentTime + .08;
    const schedule = () => {
      if (this.context.state !== 'running') return;
      // Skip expired scheduling time rather than piling up notes after a stall.
      this.nextNote = Math.max(this.nextNote, this.context.currentTime);
      while (this.nextNote < this.context.currentTime + .25) {
        this.scheduleBeat(this.nextNote, this.beat % 128);
        this.nextNote += .82; this.beat++;
      }
    };
    schedule(); this.timer = setInterval(schedule, 100);
  }
  stop(): void {
    clearInterval(this.timer); this.timer = undefined;
    for (const [source, gain] of this.voices) {
      const now = this.context.currentTime;
      gain.gain.cancelAndHoldAtTime(now);
      gain.gain.linearRampToValueAtTime(0, now + .08);
      source.stop(now + .09);
    }
    this.voices.clear();
  }
  private scheduleBeat(time: number, beat: number): void {
    const phrase = Math.floor(beat / 16), bar = Math.floor(beat / 8);
    const root = [0, -3, -7, -5][bar % 4];
    const frequency = (semitones: number) => 220 * 2 ** (semitones / 12);
    // Uneven phrase spacing feels like a melody, rather than a ticking pulse.
    const positions = [0, 2, 4, 5, 7, 10, 12, 14];
    const index = positions.indexOf(beat % 16);
    if (index >= 0) {
      const pitch = this.themes[this.arrangement[phrase]][index];
      this.note(frequency(pitch), time, 3.4, .006, .45, -.12);
    }
    if (beat % 8 === 0) {
      // Slow, overlapping chords and a low sustained note support the themes without percussion.
      const chord = bar % 4 === 3 ? [0, 5, 7] : [0, bar % 4 === 1 ? 3 : 4, 7];
      for (const [i, interval] of chord.entries()) this.note(frequency(root + interval), time, 7.4, .0018, 1.4, (i - 1) * .2);
      this.note(frequency(root - 12), time, 6.4, .0022, 1.1);
    }
    if (phrase >= 2 && beat % 16 === 9) this.note(frequency(root + 16), time, 4.2, .0018, .7, .16);
  }
  private note(frequency: number, time: number, duration: number, volume: number, attack: number, pan = 0): void {
    const oscillator = this.context.createOscillator();
    oscillator.type = 'sine'; oscillator.frequency.value = frequency;
    this.voice(oscillator, time, duration, volume, attack, pan);
  }
  private voice(source: AudioScheduledSourceNode, time: number, duration: number, volume: number, attack: number, pan = 0): void {
    const gain = this.context.createGain(), panner = this.context.createStereoPanner();
    panner.pan.value = pan;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(volume, time + attack);
    gain.gain.exponentialRampToValueAtTime(.00001, time + duration);
    source.connect(gain); gain.connect(panner); panner.connect(this.bus);
    this.voices.set(source, gain);
    source.onended = () => { this.voices.delete(source); source.disconnect(); gain.disconnect(); panner.disconnect(); };
    source.start(time); source.stop(time + duration + .02);
  }
}
