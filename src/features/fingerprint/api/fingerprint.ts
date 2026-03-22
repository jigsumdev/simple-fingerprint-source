import { cyrb53 } from '@/utils/hash';

declare global {
  interface Window {
    webkitOfflineAudioContext?: typeof OfflineAudioContext;
  }
  interface Navigator {
    deviceMemory?: number;
    webdriver?: boolean;
  }
}

/**
 * Multi-sample + histogram digest of an AudioBuffer (offline render).
 * More stable than a single scalar sum across engines.
 */
export function digestAudioBuffer(buffer: AudioBuffer): string {
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
  const len = ch0.length;
  const bucketCount = 32;
  const buckets = new Array<number>(bucketCount).fill(0);
  const stride = Math.max(1, Math.floor(len / 5000));

  for (let i = 0; i < len; i += stride) {
    const v = Math.abs(ch0[i] ?? 0);
    const raw = Math.floor(v * 1400);
    const b = Number.isFinite(raw) ? Math.min(bucketCount - 1, Math.max(0, raw)) : 0;
    buckets[b] = (buckets[b] ?? 0) + 1;
  }

  const head = Array.from(ch0.slice(0, 64), (x) => x.toFixed(9)).join(',');
  const tail = Array.from(ch0.slice(Math.max(0, len - 64)), (x) => x.toFixed(9)).join(',');
  const ch1Head = ch1
    ? Array.from(ch1.slice(0, 32), (x) => x.toFixed(9)).join(',')
    : '';

  return JSON.stringify({
    sr: buffer.sampleRate,
    len,
    buckets,
    head,
    tail,
    ch1Head,
  });
}

export function getCanvasHash(): string | number {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) return 'Blocked';

    canvas.width = 200;
    canvas.height = 50;

    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.font = '11pt no-real-font-123';
    ctx.fillText('Cwm fjordbank glyphs vext quiz, 😃', 2, 15);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = 'rgb(255,0,255)';
    ctx.beginPath();
    ctx.arc(50, 50, 50, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.fill();

    return cyrb53(canvas.toDataURL());
  } catch (error) {
    console.warn('Canvas fingerprinting blocked:', error);
    return 'Blocked';
  }
}

export async function getAudioHash(): Promise<string | number> {
  try {
    const AudioContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;

    if (!AudioContext) return 'N/A';

    const context = new AudioContext(1, 44100, 44100);
    const oscillator = context.createOscillator();

    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(1000, context.currentTime);

    const compressor = context.createDynamicsCompressor();
    oscillator.connect(compressor);
    compressor.connect(context.destination);
    oscillator.start(0);

    const buffer = await context.startRendering();
    return cyrb53(digestAudioBuffer(buffer));
  } catch (error) {
    console.warn('Audio fingerprinting blocked:', error);
    return 'Blocked';
  }
}

/** Extracts a short GPU model name from the full WebGL renderer string. */
export function getGPU(): string {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

    if (!gl) return 'Generic / Virtual';

    const debugInfo = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');

    if (debugInfo) {
      const renderer = (gl as WebGLRenderingContext).getParameter(
        debugInfo.UNMASKED_RENDERER_WEBGL
      ) as string;

      if (!renderer) return 'Generic / Virtual';

      const patterns = [
        /(?:GeForce|Radeon|Intel)\s+([A-Z]{2,4}\s+\d+\w*(?:\s+\w+)?)/i,
        /([A-Z]{2,4}\s+\d+\w*(?:\s+\w+)?)/,
      ];

      for (const pattern of patterns) {
        const match = renderer.match(pattern);
        if (match?.[1]) {
          return match[1].trim();
        }
      }

      const geforceMatch = renderer.match(/GeForce\s+([^()]+)/i);
      if (geforceMatch?.[1]) {
        const splitResult = geforceMatch[1].split(/[()]/);
        const model = splitResult[0]?.trim();
        if (!model) return renderer;
        const modelMatch = model.match(/([A-Z]{2,4}\s+\d+\w*(?:\s+\w+)?)/);
        if (modelMatch?.[1]) {
          return modelMatch[1].trim();
        }
        return model;
      }

      const radeonMatch = renderer.match(/Radeon\s+([^()]+)/i);
      if (radeonMatch?.[1]) {
        const splitResult = radeonMatch[1].split(/[()]/);
        const model = splitResult[0]?.trim();
        if (!model) return renderer;
        const modelMatch = model.match(/([A-Z]{2,4}\s+\d+\w*(?:\s+\w+)?)/);
        if (modelMatch?.[1]) {
          return modelMatch[1].trim();
        }
        return model;
      }

      return renderer;
    }

    return 'Generic / Virtual';
  } catch (error) {
    console.warn('GPU detection blocked:', error);
    return 'Blocked';
  }
}

export function getLogicalProcessors(): number | string {
  return navigator.hardwareConcurrency || 'N/A';
}

export function getSystemMemory(): number | string {
  return navigator.deviceMemory ?? 'N/A';
}

export function isAutomationDetected(): boolean {
  return !!navigator.webdriver;
}

export function getScreenResolution(): string {
  return `${window.screen.width}x${window.screen.height}`;
}

export function getPixelRatio(): number {
  return window.devicePixelRatio || 1;
}

export function getPlatform(): string {
  return navigator.platform || 'Unknown';
}

export function getTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function areCookiesEnabled(): boolean {
  return navigator.cookieEnabled;
}
