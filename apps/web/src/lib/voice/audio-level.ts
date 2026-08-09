export type AudioLevelRef = { current: number };

export function normalizeRms(samples: Uint8Array, referenceRms = 0.18): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (const sample of samples) {
    const centered = (sample - 128) / 128;
    sum += centered * centered;
  }
  return Math.min(1, Math.sqrt(sum / samples.length) / referenceRms);
}

export function smoothAudioLevel(current: number, raw: number): number {
  return current + (raw - current) * (raw > current ? 0.35 : 0.08);
}

export class AudioLevelMonitor {
  private track: MediaStreamTrack | null | undefined;
  private context?: AudioContext;
  private source?: MediaStreamAudioSourceNode;
  private analyser?: AnalyserNode;
  private frame?: number;
  private samples?: Uint8Array<ArrayBuffer>;

  public constructor(private readonly level: AudioLevelRef) {
    this.level.current = 0.12;
  }

  public setTrack(track: MediaStreamTrack | null): void {
    if (track === this.track) return;
    this.releaseGraph();
    this.track = track;
    if (!track || typeof AudioContext === "undefined") {
      this.level.current = 0.12;
      return;
    }

    try {
      this.context = new AudioContext();
      this.source = this.context.createMediaStreamSource(new MediaStream([track]));
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.6;
      this.samples = new Uint8Array(this.analyser.fftSize);
      this.source.connect(this.analyser);
      void this.context.resume().catch(() => undefined);
      this.sample();
    } catch {
      this.releaseGraph();
      this.level.current = 0.12;
    }
  }

  public dispose(): void {
    this.releaseGraph();
    this.track = undefined;
    this.level.current = 0.12;
  }

  private sample = (): void => {
    if (!this.analyser || !this.samples) return;
    this.analyser.getByteTimeDomainData(this.samples);
    this.level.current = smoothAudioLevel(this.level.current, normalizeRms(this.samples));
    this.frame = requestAnimationFrame(this.sample);
  };

  private releaseGraph(): void {
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = undefined;
    this.source?.disconnect();
    this.analyser?.disconnect();
    if (this.context) void this.context.close().catch(() => undefined);
    this.source = undefined;
    this.analyser = undefined;
    this.context = undefined;
    this.samples = undefined;
  }
}
