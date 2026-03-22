import { useCallback, useEffect, useState } from 'react';
import { useAppStore } from './store';
import { DeviceFingerprintPanel } from '@/components/DeviceFingerprintPanel';
import {
  ConsentBanner,
  hasStoredConsent,
} from '@/components/ConsentBanner';
import { env } from '@/lib/env';

export function App() {
  const {
    network,
    fingerprint,
    loadingNetwork,
    loadingFingerprint,
    error,
    initializeScan,
  } = useAppStore();

  const [consent, setConsent] = useState(hasStoredConsent);

  const runScan = useCallback(
    (strict: boolean) => {
      void initializeScan({ strict });
    },
    [initializeScan]
  );

  useEffect(() => {
    if (!consent) return;
    runScan(env.strictScan || localStorage.getItem('precision-scanner-strict-v1') === '1');
  }, [consent, runScan]);

  if (!consent) {
    return (
      <main>
        <header>
          <h1>Endpoint Integrity Profile</h1>
          <p>Discover how your device is seen by the web.</p>
        </header>
        <ConsentBanner onAccept={() => setConsent(true)} />
      </main>
    );
  }

  return (
    <main>
      {error && (
        <section role="alert" aria-live="assertive">
          <p>{error}</p>
          <button type="button" onClick={() => runScan(env.strictScan || localStorage.getItem('precision-scanner-strict-v1') === '1')}>
            Retry scan
          </button>
        </section>
      )}

      <DeviceFingerprintPanel
        network={network}
        fingerprint={fingerprint}
        loadingNetwork={loadingNetwork}
        loadingFingerprint={loadingFingerprint}
      />
    </main>
  );
}
