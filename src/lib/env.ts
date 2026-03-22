/**
 * Environment configuration
 * Provides type-safe access to environment variables
 */

interface EnvironmentConfig {
  apiTimeout: number;
  audioTimeoutMs: number;
  webrtcTimeoutMs: number;
  syncSignalsTimeoutMs: number;
  /** When true: no WebRTC leak probe, no getHighEntropyValues */
  strictScan: boolean;
  enableDevTools: boolean;
  isDevelopment: boolean;
  isProduction: boolean;
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = import.meta.env[key];
  return value ? parseInt(value, 10) : defaultValue;
}

function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = import.meta.env[key];
  return value ? value === 'true' : defaultValue;
}

export const env: EnvironmentConfig = {
  apiTimeout: getEnvNumber('VITE_API_TIMEOUT', 3000),
  audioTimeoutMs: getEnvNumber('VITE_AUDIO_TIMEOUT_MS', 8000),
  webrtcTimeoutMs: getEnvNumber('VITE_WEBRTC_TIMEOUT_MS', 5000),
  syncSignalsTimeoutMs: getEnvNumber('VITE_SYNC_SIGNALS_TIMEOUT_MS', 15000),
  strictScan: getEnvBoolean('VITE_STRICT_SCAN', false),
  enableDevTools: getEnvBoolean(
    'VITE_ENABLE_DEVTOOLS',
    import.meta.env.MODE === 'development'
  ),
  isDevelopment: import.meta.env.MODE === 'development',
  isProduction: import.meta.env.MODE === 'production',
};
