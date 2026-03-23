import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { env } from '@/lib/env';
import type { AppState, FingerprintData, ScanOptions, ObservationPayload, ObservationResponse } from '@/types';
import { scanNetwork } from '@/features/network/api/network';
import {
  getCanvasHash,
  getAudioHash,
  getGPU,
  getLogicalProcessors,
  getSystemMemory,
  isAutomationDetected,
  getTimezone,
} from '@/features/fingerprint/api/fingerprint';
import {
  getEnhancedCanvasHash,
  getAdvancedWebGLHash,
  detectFonts,
  getEnhancedAudioHash,
  getAdvancedAutomationFlags,
  getScreenGeometry,
  getMediaCapabilities,
  detectWebRTCLeaks,
  getNavigatorDeepDive,
  getCanvasExtendedProbeHash,
  getClientHints,
  getStorageEstimateLabel,
} from '@/features/fingerprint/api/advanced-fingerprint';
import { generateFingerprintId } from '@/utils/hash';
import { withTimeout } from '@/utils/async';

interface AppStore extends AppState {
  initializeScan: (options?: ScanOptions) => Promise<void>;
  reset: () => void;
}

const initialState: AppState = {
  network: null,
  fingerprint: null,
  normalized: null,
  matchResult: null,
  observationId: null,
  coreFingerprint: null,
  extendedFingerprint: null,
  loadingNetwork: false,
  loadingFingerprint: false,
  error: null,
};

const COHORT_NOTE =
  'Uniqueness versus a global population is not measured without server-side cohort data. This digest is a local cryptographic summary of collected signals.';

function countContributingSignals(parts: unknown[]): number {
  return parts.filter((p) => p !== null && p !== undefined && p !== '').length;
}

async function submitObservation(payload: ObservationPayload): Promise<ObservationResponse | null> {
  try {
    const res = await fetch('/api/observations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.warn('Observation submission failed:', res.status);
      return null;
    }
    return await res.json() as ObservationResponse;
  } catch (e) {
    console.warn('Observation submission error:', e);
    return null;
  }
}

export const useAppStore = create<AppStore>()(
  devtools(
    (set) => ({
      ...initialState,

      initializeScan: async (options?: ScanOptions) => {
        const strict = env.strictScan || options?.strict === true;

        set({
          loadingNetwork: true,
          loadingFingerprint: true,
          error: null,
          normalized: null,
          matchResult: null,
          observationId: null,
          coreFingerprint: null,
          extendedFingerprint: null,
        });

        const tScanStart = performance.now();
        const timings: NonNullable<FingerprintData['scanTimingsMs']> = {};

        try {
          const tNet = performance.now();
          const networkInfo = await scanNetwork();
          timings.network = Math.round(performance.now() - tNet);

          set({
            network: networkInfo,
            loadingNetwork: false,
          });

          const tSync = performance.now();

          const environmentHash = getCanvasHash();
          const gpu = getGPU();
          const logicalProcessors = getLogicalProcessors();
          const systemMemory = getSystemMemory();
          const automationFlag = isAutomationDetected();
          const advancedCanvasHash = getEnhancedCanvasHash();
          const canvasExtendedProbe = getCanvasExtendedProbeHash();
          const advancedWebGLHash = getAdvancedWebGLHash();
          const detectedFonts = detectFonts();
          const automationFlags = getAdvancedAutomationFlags();
          const screenGeometry = getScreenGeometry();
          const navigatorDeepDive = getNavigatorDeepDive();

          const tAsync = performance.now();
          const [audioSignature, enhancedAudioHash, mediaCapabilities, webrtcIps, clientHints, storageEstimate] =
            await Promise.all([
              withTimeout(getAudioHash(), env.audioTimeoutMs, 'basic audio').catch(
                () => 'Blocked' as const
              ),
              withTimeout(getEnhancedAudioHash(), env.audioTimeoutMs, 'enhanced audio').catch(
                () => 'Blocked' as const
              ),
              withTimeout(getMediaCapabilities(), env.syncSignalsTimeoutMs, 'media capabilities').catch(
                () => ({ videoCodecs: [] as string[], audioCodecs: [] as string[] })
              ),
              withTimeout(detectWebRTCLeaks(strict), env.webrtcTimeoutMs, 'webrtc').catch(
                () => [] as string[]
              ),
              withTimeout(getClientHints(strict), env.syncSignalsTimeoutMs, 'client hints').catch(
                () => null
              ),
              withTimeout(getStorageEstimateLabel(), env.syncSignalsTimeoutMs, 'storage estimate').catch(
                () => '—'
              ),
            ]);

          timings.syncSignals = Math.round(performance.now() - tSync);
          timings.parallelAsync = Math.round(performance.now() - tAsync);
          timings.total = Math.round(performance.now() - tScanStart);

          const stableScreen = {
            screenWidth: screenGeometry.screenWidth,
            screenHeight: screenGeometry.screenHeight,
            colorDepth: screenGeometry.colorDepth,
            pixelDepth: screenGeometry.pixelDepth,
            devicePixelRatio: screenGeometry.devicePixelRatio,
          };

          const stableNav = {
            platform: navigatorDeepDive.platform,
            hardwareConcurrency: navigatorDeepDive.hardwareConcurrency,
            deviceMemory: navigatorDeepDive.deviceMemory,
            maxTouchPoints: navigatorDeepDive.maxTouchPoints,
            vendor: navigatorDeepDive.vendor,
            language: navigatorDeepDive.language,
            languages: navigatorDeepDive.languages,
          };

          const { timingAnomaly: _ta, chromeRuntime: _cr, ...stableAutoFlags } = automationFlags;

          const he = clientHints?.highEntropy as Record<string, unknown> | null | undefined;
          const stableHints = clientHints
            ? {
                platform: clientHints.platform,
                mobile: clientHints.mobile,
                highEntropy: he
                  ? {
                      architecture: he['architecture'],
                      bitness: he['bitness'],
                      model: he['model'],
                      platform: he['platform'],
                      platformVersion: he['platformVersion'],
                    }
                  : null,
              }
            : null;

          const idParts: unknown[] = [
            'precision-scanner-v3',
            environmentHash,
            audioSignature,
            gpu,
            logicalProcessors,
            systemMemory,
            advancedCanvasHash,
            canvasExtendedProbe,
            advancedWebGLHash,
            detectedFonts,
            enhancedAudioHash,
            stableAutoFlags,
            stableScreen,
            mediaCapabilities,
            stableNav,
            stableHints,
            automationFlag,
          ];

          const { primaryId, legacyDisplayHash } = await generateFingerprintId(...idParts);

          const contributingSignals = countContributingSignals(idParts.slice(1));

          const fingerprintData: FingerprintData = {
            primaryId,
            legacyDisplayHash,
            environmentHash,
            audioSignature,
            gpu,
            logicalProcessors,
            systemMemory,
            automationFlag,
            entropy: {
              digestBits: 256,
              contributingSignals,
              cohortNote: COHORT_NOTE,
            },
            advancedCanvasHash,
            canvasExtendedProbe,
            advancedWebGLHash,
            detectedFonts,
            enhancedAudioHash,
            automationFlags,
            screenGeometry,
            mediaCapabilities,
            webrtcIps,
            navigatorDeepDive,
            clientHints,
            storageEstimate,
            scanTimingsMs: timings,
          };

          set({
            fingerprint: fingerprintData,
            loadingFingerprint: false,
            error: null,
          });

          // Submit to backend for persistence + comparison (non-blocking UI)
          const timezone = getTimezone();
          const observationPayload: ObservationPayload = {
            fingerprint: fingerprintData,
            network: networkInfo,
            timezone,
          };

          const obsResponse = await submitObservation(observationPayload);

          if (obsResponse) {
            set({
              normalized: obsResponse.normalized,
              matchResult: obsResponse.match,
              observationId: obsResponse.observationId,
              coreFingerprint: obsResponse.coreFingerprint,
              extendedFingerprint: obsResponse.extendedFingerprint,
            });
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

          set({
            loadingNetwork: false,
            loadingFingerprint: false,
            error: errorMessage,
          });

          console.error('Scan initialization failed:', error);
        }
      },

      reset: () => {
        set(initialState);
      },
    }),
    {
      name: 'precision-scanner-store',
      enabled: env.enableDevTools,
    }
  )
);
