/**
 * The AMPLITUDE → MOUTH-OPENNESS math — a pair of PURE, unit-testable functions
 * with NO Web-Audio / DOM dependency.
 *
 * VENDORED from hugmesh-matrix-ui `projects/matrix/src/app/vn/voice/openness.ts`
 * (native-federation forbids a shared cross-remote runtime import, so this
 * remote ships its own copy). Byte-faithful to the source apart from this
 * provenance note. The single scalar it produces is the platform's lip-sync
 * contract: openness 0..1, smoothed over time so the mouth eases rather than
 * chatters; viseme.ts turns it into a VN frame.
 */
export const DEFAULT_FFT_SIZE = 1024;
export const OPEN_RMS_REFERENCE = 0.18;
export const DEFAULT_SMOOTHING = 0.35;

export function frameRms(buffer: Float32Array | Uint8Array): number {
  const n = buffer.length;
  if (n === 0) {
    return 0;
  }
  let sumSquares = 0;
  if (buffer instanceof Uint8Array) {
    for (let i = 0; i < n; i++) {
      const v = (buffer[i] - 128) / 128;
      sumSquares += v * v;
    }
  } else {
    for (let i = 0; i < n; i++) {
      const v = buffer[i];
      sumSquares += v * v;
    }
  }
  return Math.sqrt(sumSquares / n);
}

export function rmsToOpenness(rms: number, reference: number = OPEN_RMS_REFERENCE): number {
  if (!Number.isFinite(rms) || rms <= 0) {
    return 0;
  }
  const ref = reference > 0 ? reference : OPEN_RMS_REFERENCE;
  const raw = rms / ref;
  return raw <= 0 ? 0 : raw >= 1 ? 1 : raw;
}

export function smoothOpenness(prev: number, target: number, smoothing: number = DEFAULT_SMOOTHING): number {
  const a = smoothing < 0 ? 0 : smoothing > 1 ? 1 : smoothing;
  const p = clamp01(prev);
  const t = clamp01(target);
  return p + a * (t - p);
}

export function nextOpenness(
  prev: number,
  buffer: Float32Array | Uint8Array,
  opts?: { reference?: number; smoothing?: number },
): number {
  const target = rmsToOpenness(frameRms(buffer), opts?.reference);
  return smoothOpenness(prev, target, opts?.smoothing);
}

function clamp01(v: number): number {
  if (!Number.isFinite(v) || v <= 0) {
    return 0;
  }
  return v >= 1 ? 1 : v;
}
