import { cyrb53 } from '@/utils/hash';
import { digestAudioBuffer } from '@/features/fingerprint/api/fingerprint';
import { extractAddressesFromIceCandidate } from '@/utils/parsers';
import { env } from '@/lib/env';
import type {
  ClientHintsData,
  MediaCapabilities,
  NavigatorDeepDive,
  ScreenGeometry,
} from '@/types';

declare global {
  interface Window {
    webkitOfflineAudioContext?: typeof OfflineAudioContext;
  }
  interface Navigator {
    deviceMemory?: number;
    webdriver?: boolean;
    languages?: readonly string[];
    userAgentData?: {
      brands: Array<{ brand: string; version: string }>;
      mobile: boolean;
      platform: string;
      getHighEntropyValues: (hints: string[]) => Promise<Record<string, unknown>>;
    };
  }
}

const TEST_FONTS = [
  'Arial',
  'Verdana',
  'Times New Roman',
  'Courier New',
  'Georgia',
  'Palatino',
  'Garamond',
  'Bookman',
  'Comic Sans MS',
  'Trebuchet MS',
  'Impact',
  'Lucida Console',
  'Tahoma',
  'Lucida Grande',
  'MS Sans Serif',
  'Segoe UI',
  'Calibri',
  'Cambria',
  'Consolas',
  'Courier',
] as const;

/**
 * Second-stage 2D probes: emoji/CJK, paths, imageData crop, measureText metrics.
 */
export function getCanvasExtendedProbeHash(): string | number {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'Blocked';

    canvas.width = 220;
    canvas.height = 88;

    const ctx2 = ctx as CanvasRenderingContext2D & { textRendering?: string };
    if ('textRendering' in ctx2) {
      ctx2.textRendering = 'geometricPrecision';
    }
    ctx.imageSmoothingEnabled = true;
    ctx.fillStyle = '#101418';
    ctx.font = '17px system-ui, sans-serif';
    ctx.fillText('東京 测试 mixed', 4, 26);
    ctx.fillText('😀🎉 fingerprint', 4, 50);

    ctx.beginPath();
    ctx.moveTo(0, 70);
    ctx.lineTo(110, 88);
    ctx.lineTo(220, 70);
    ctx.closePath();
    const inPath = ctx.isPointInPath(60, 78);
    ctx.fillStyle = 'rgba(120,80,200,0.35)';
    ctx.fill();
    const m = ctx.measureText('mmmmmmmmmmlli');
    const metrics = [
      m.width,
      m.actualBoundingBoxAscent ?? 0,
      m.actualBoundingBoxDescent ?? 0,
      m.fontBoundingBoxAscent ?? 0,
      m.fontBoundingBoxDescent ?? 0,
    ].join('|');

    const imageData = ctx.getImageData(0, 0, 40, 40);
    let pixelSum = 0;
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      pixelSum += (d[i] ?? 0) + (d[i + 1] ?? 0) + (d[i + 2] ?? 0);
    }

    const dataUrlHash = cyrb53(canvas.toDataURL());
    const cropHash = cyrb53(Array.from(d.slice(0, 320)).join(','));
    const payload = `${dataUrlHash}|${inPath}|${metrics}|${pixelSum}|${cropHash}`;
    return cyrb53(payload);
  } catch (error) {
    console.warn('Canvas extended probe failed:', error);
    return 'Blocked';
  }
}

export function getEnhancedCanvasHash(): string | number {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) return 'Blocked';

    canvas.width = 280;
    canvas.height = 60;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.textBaseline = 'alphabetic';
    ctx.font = '11pt "Arial", sans-serif';
    ctx.fillStyle = '#f60';
    ctx.fillText('Cwm fjordbank glyphs vext quiz, 😃', 2, 15);

    ctx.font = '11pt "Georgia", serif';
    ctx.fillStyle = '#069';
    ctx.fillText('The quick brown fox jumps', 2, 30);

    ctx.font = '11pt "Courier New", monospace';
    ctx.fillStyle = '#f0f';
    ctx.fillText('Code: const x = 42;', 2, 45);

    const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
    gradient.addColorStop(0, '#ff0000');
    gradient.addColorStop(0.5, '#00ff00');
    gradient.addColorStop(1, '#0000ff');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 50, canvas.width, 10);

    ctx.fillStyle = '#f0f';
    ctx.beginPath();
    ctx.arc(140, 30, 15, 0, Math.PI * 2, true);
    ctx.fill();

    ctx.fillStyle = '#0ff';
    ctx.beginPath();
    ctx.rect(200, 15, 30, 30);
    ctx.fill();

    return cyrb53(canvas.toDataURL());
  } catch (error) {
    console.warn('Enhanced canvas fingerprinting blocked:', error);
    return 'Blocked';
  }
}

function collectWebGLProfile(gl: WebGLRenderingContext | WebGL2RenderingContext): string[] {
  const glParams: string[] = [];
  const g = gl as WebGLRenderingContext;

  const debugInfo = g.getExtension('WEBGL_debug_renderer_info');
  if (debugInfo) {
    const vendor = g.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) as string;
    const renderer = g.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as string;
    glParams.push(`vendor:${vendor}|renderer:${renderer}`);
  }

  const extensions = (g.getSupportedExtensions() ?? []).slice().sort();
  glParams.push(`extensions:${extensions.join(',')}`);

  glParams.push(`MAX_TEXTURE_SIZE:${g.getParameter(g.MAX_TEXTURE_SIZE)}`);
  glParams.push(`MAX_VIEWPORT_DIMS:${String(g.getParameter(g.MAX_VIEWPORT_DIMS))}`);
  glParams.push(`SHADING_LANGUAGE_VERSION:${g.getParameter(g.SHADING_LANGUAGE_VERSION)}`);
  glParams.push(`VERSION:${g.getParameter(g.VERSION)}`);
  glParams.push(`DEPTH_BITS:${g.getParameter(g.DEPTH_BITS)}`);
  glParams.push(`STENCIL_BITS:${g.getParameter(g.STENCIL_BITS)}`);
  glParams.push(`ALIASED_LINE_WIDTH_RANGE:${String(g.getParameter(g.ALIASED_LINE_WIDTH_RANGE))}`);
  glParams.push(`ALIASED_POINT_SIZE_RANGE:${String(g.getParameter(g.ALIASED_POINT_SIZE_RANGE))}`);
  glParams.push(`MAX_VERTEX_ATTRIBS:${g.getParameter(g.MAX_VERTEX_ATTRIBS)}`);
  glParams.push(`MAX_VARYING_VECTORS:${g.getParameter(g.MAX_VARYING_VECTORS)}`);
  glParams.push(`MAX_VERTEX_UNIFORM_VECTORS:${g.getParameter(g.MAX_VERTEX_UNIFORM_VECTORS)}`);
  glParams.push(`MAX_FRAGMENT_UNIFORM_VECTORS:${g.getParameter(g.MAX_FRAGMENT_UNIFORM_VECTORS)}`);

  if (gl instanceof WebGL2RenderingContext) {
    glParams.push('api:WebGL2');
    glParams.push(`MAX_COLOR_ATTACHMENTS:${gl.getParameter(gl.MAX_COLOR_ATTACHMENTS)}`);
    glParams.push(`SAMPLES:${gl.getParameter(gl.SAMPLES)}`);
    glParams.push(`MAX_SAMPLES:${gl.getParameter(gl.MAX_SAMPLES)}`);
    glParams.push(`MAX_3D_TEXTURE_SIZE:${gl.getParameter(gl.MAX_3D_TEXTURE_SIZE)}`);
    glParams.push(`MAX_DRAW_BUFFERS:${gl.getParameter(gl.MAX_DRAW_BUFFERS)}`);
  } else {
    glParams.push('api:WebGL1');
  }

  return glParams;
}

export function getAdvancedWebGLHash(): string | number {
  try {
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl');

    if (!gl) return 'Generic / Virtual';

    const profile = collectWebGLProfile(gl as WebGLRenderingContext);
    return cyrb53(profile.join('|'));
  } catch (error) {
    console.warn('Advanced WebGL fingerprinting blocked:', error);
    return 'Blocked';
  }
}

/**
 * Prefer FontFaceSet.check when available; fallback to width vs sans-serif baseline.
 * May false-positive on some Linux stacks; document.fonts is more reliable when present.
 */
export function detectFonts(): string[] {
  const docFonts = document.fonts;
  if (docFonts && typeof docFonts.check === 'function') {
    const out: string[] = [];
    for (const font of TEST_FONTS) {
      try {
        const quoted = `12px "${font}"`;
        const plain = `12px ${font}`;
        if (docFonts.check(quoted) || docFonts.check(plain)) {
          out.push(font);
        }
      } catch {
        /* ignore per-font errors */
      }
    }
    if (out.length > 0) {
      return [...new Set(out)];
    }
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];

  const testString = 'mmmmmmmmmmlli';
  const textSize = '72px';

  ctx.font = `${textSize} sans-serif`;
  const sansWidth = ctx.measureText(testString).width;

  const detected: string[] = [];
  for (const font of TEST_FONTS) {
    ctx.font = `${textSize} "${font}", sans-serif`;
    const w = ctx.measureText(testString).width;
    if (Math.abs(w - sansWidth) > 0.01) {
      detected.push(font);
    }
  }

  return detected;
}

export async function getEnhancedAudioHash(): Promise<string | number> {
  try {
    const AudioContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;

    if (!AudioContext) return 'N/A';

    const context = new AudioContext(2, 44100, 44100);

    const oscillator = context.createOscillator();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(1000, context.currentTime);

    const compressor = context.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-50, context.currentTime);
    compressor.knee.setValueAtTime(40, context.currentTime);
    compressor.ratio.setValueAtTime(12, context.currentTime);

    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3000, context.currentTime);
    filter.Q.setValueAtTime(1, context.currentTime);

    const gain = context.createGain();
    gain.gain.setValueAtTime(0.5, context.currentTime);

    oscillator.connect(filter);
    filter.connect(compressor);
    compressor.connect(gain);
    gain.connect(context.destination);

    oscillator.start(0);

    const buffer = await context.startRendering();
    return cyrb53(digestAudioBuffer(buffer));
  } catch (error) {
    console.warn('Enhanced audio fingerprinting blocked:', error);
    return 'Blocked';
  }
}

function measureTimingAnomaly(): boolean {
  const t0 = performance.now();
  for (let i = 0; i < 40000; i++) {
    Math.sqrt(i + 1);
  }
  const dt = performance.now() - t0;
  return dt < 0.35;
}

export function getAdvancedAutomationFlags(): Record<string, boolean> {
  const plugins = navigator.plugins?.length ?? 0;
  const mimeTypes = navigator.mimeTypes?.length ?? 0;

  return {
    webdriver: !!navigator.webdriver,
    chromeRuntime: !!(window as unknown as { chrome?: { runtime?: unknown } }).chrome?.runtime,
    noPlugins: plugins === 0,
    noMimeTypes: mimeTypes === 0,
    noLanguages: (navigator.languages?.length ?? 0) === 0,
    headlessIndicator:
      !!(window as unknown as { cdc_adoQbh7n802rd_Array?: unknown }).cdc_adoQbh7n802rd_Array ||
      !!(window as unknown as { __nightmare?: unknown }).__nightmare,
    phantomJS:
      !!(window as unknown as { callPhantom?: unknown }).callPhantom ||
      !!(window as unknown as { _phantom?: unknown })._phantom,
    noTouchPoints: (navigator.maxTouchPoints ?? 0) === 0,
    permissionsApi: typeof navigator.permissions !== 'undefined',
    timingAnomaly: measureTimingAnomaly(),
  };
}

export function getScreenGeometry(): ScreenGeometry {
  return {
    outerWidth: window.outerWidth,
    outerHeight: window.outerHeight,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    availWidth: window.screen.availWidth,
    availHeight: window.screen.availHeight,
    colorDepth: window.screen.colorDepth,
    pixelDepth: window.screen.pixelDepth,
    devicePixelRatio: window.devicePixelRatio,
    screenX: window.screenX,
    screenY: window.screenY,
    windowDifference: {
      widthDiff: window.outerWidth - window.innerWidth,
      heightDiff: window.outerHeight - window.innerHeight,
    },
  };
}

function canPlayDefinitely(el: HTMLMediaElement, type: string): boolean {
  const r = el.canPlayType(type);
  return r === 'probably' || r === 'maybe';
}

export async function getMediaCapabilities(): Promise<MediaCapabilities> {
  const capabilities: MediaCapabilities = {
    videoCodecs: [],
    audioCodecs: [],
  };

  try {
    const videoTypes = [
      'video/mp4; codecs="avc1.42E01E"',
      'video/webm; codecs="vp8, vorbis"',
      'video/webm; codecs="vp9"',
      'video/ogg; codecs="theora"',
    ];

    const audioTypes = [
      'audio/mpeg',
      'audio/ogg; codecs="vorbis"',
      'audio/webm; codecs="vorbis"',
      'audio/wav',
      'audio/aac',
    ];

    const videoEl = document.createElement('video');
    for (const type of videoTypes) {
      if (canPlayDefinitely(videoEl, type)) {
        const base = type.split(';')[0];
        if (base) capabilities.videoCodecs.push(base);
      }
    }

    const audioEl = document.createElement('audio');
    for (const type of audioTypes) {
      if (canPlayDefinitely(audioEl, type)) {
        capabilities.audioCodecs.push(type);
      }
    }

    if (typeof MediaSource !== 'undefined') {
      capabilities.mediaSourceSupported = true;
    }
  } catch (error) {
    console.warn('Media capabilities detection failed:', error);
  }

  return capabilities;
}

/**
 * WebRTC local address / host gleaning. Closes PC when done.
 * Respects env.webrtcTimeoutMs; skipped when strict=true (caller passes strict from options).
 */
export async function detectWebRTCLeaks(strict: boolean): Promise<string[]> {
  if (strict) return [];

  const RTCPeerConnectionImpl = (
    window as unknown as { RTCPeerConnection?: typeof RTCPeerConnection }
  ).RTCPeerConnection;

  if (!RTCPeerConnectionImpl) return [];

  const found = new Set<string>();
  let pc: RTCPeerConnection | null = null;

  try {
    pc = new RTCPeerConnectionImpl({ iceServers: [] });
    pc.createDataChannel('');

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const addFromCandidate = (cand: RTCIceCandidate) => {
      for (const addr of extractAddressesFromIceCandidate(cand.candidate)) {
        found.add(addr);
      }
    };

    await new Promise<void>((resolve) => {
      const maxMs = env.webrtcTimeoutMs;
      let settled = false;

      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        connection.removeEventListener('icegatheringstatechange', onGathering);
        resolve();
      };

      const onGathering = () => {
        if (connection.iceGatheringState === 'complete') {
          finish();
        }
      };

      const connection = pc as RTCPeerConnection;
      connection.addEventListener('icegatheringstatechange', onGathering);

      connection.onicecandidate = (ev: RTCPeerConnectionIceEvent) => {
        if (ev.candidate === null) {
          finish();
          return;
        }
        addFromCandidate(ev.candidate);
      };

      const timer = setTimeout(finish, maxMs);

      if (connection.iceGatheringState === 'complete') {
        finish();
      }
    });
  } catch (error) {
    console.warn('WebRTC leak detection failed:', error);
  } finally {
    try {
      pc?.close();
    } catch {
      /* ignore */
    }
  }

  return [...found];
}

export function getNavigatorDeepDive(): NavigatorDeepDive {
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
    maxTouchPoints: navigator.maxTouchPoints,
    vendor: navigator.vendor,
    language: navigator.language,
    languages: navigator.languages ? Array.from(navigator.languages) : [],
    onLine: navigator.onLine,
    cookieEnabled: navigator.cookieEnabled,
    doNotTrack: navigator.doNotTrack,
    plugins: navigator.plugins ? Array.from(navigator.plugins, (p) => p.name) : [],
  };
}

export async function getStorageEstimateLabel(): Promise<string> {
  try {
    if (!navigator.storage?.estimate) return '—';
    const e = await navigator.storage.estimate();
    if (e.quota != null && Number.isFinite(e.quota)) {
      const gb = e.quota / 1024 ** 3;
      return gb >= 1 ? `${gb.toFixed(1)} GiB quota` : `${Math.round(e.quota / (1024 ** 2))} MiB quota`;
    }
  } catch {
    /* ignore */
  }
  return '—';
}

export async function getClientHints(strict: boolean): Promise<ClientHintsData | null> {
  const ua = navigator.userAgentData;
  if (!ua?.getHighEntropyValues) {
    return ua
      ? {
          brands: ua.brands,
          mobile: ua.mobile,
          platform: ua.platform,
          highEntropy: null,
        }
      : null;
  }

  const base: ClientHintsData = {
    brands: ua.brands,
    mobile: ua.mobile,
    platform: ua.platform,
  };

  if (strict) {
    base.highEntropy = null;
    return base;
  }

  try {
    const highEntropy = await ua.getHighEntropyValues([
      'architecture',
      'bitness',
      'brands',
      'fullVersionList',
      'mobile',
      'model',
      'platform',
      'platformVersion',
      'uaFullVersion',
      'wow64',
    ]);
    return { ...base, highEntropy };
  } catch {
    return { ...base, highEntropy: null };
  }
}
