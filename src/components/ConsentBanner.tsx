import { useId, useState } from 'react';
import { env } from '@/lib/env';

const STORAGE_CONSENT = 'precision-scanner-consent-v1';
const STORAGE_STRICT = 'precision-scanner-strict-v1';

export function readStoredStrictPreference(): boolean {
  if (env.strictScan) return true;
  const v = localStorage.getItem(STORAGE_STRICT);
  if (v === null) return false;
  return v === '1';
}

export function hasStoredConsent(): boolean {
  return localStorage.getItem(STORAGE_CONSENT) === '1';
}

interface ConsentBannerProps {
  onAccept: () => void;
}

/**
 * Disclosure + opt-in before running invasive probes (WebRTC, high-entropy client hints).
 */
export function ConsentBanner({ onAccept }: ConsentBannerProps) {
  const id = useId();
  const [strictLocal, setStrictLocal] = useState(readStoredStrictPreference());

  return (
    <section
      className="consent-banner"
      role="dialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-desc`}
    >
      <h2 id={`${id}-title`}>Analysis consent</h2>
      <p id={`${id}-desc`}>
        This page collects technical signals from your browser (graphics, audio, fonts, network egress,
        and optionally local network candidates via WebRTC) to build a device digest. Scan results are{' '}
        <strong>stored server-side</strong> so the system can compare your current scan to prior
        observations and classify whether you are the same device, a different browser, or an entirely
        new visitor.
      </p>
      <ul>
        <li>
          <strong>What is stored:</strong> a normalized identity summary, core and extended fingerprint
          hashes, and the raw scan signals. Raw observations are retained for up to 90 days; exact IP
          addresses are hashed after 30 days.
        </li>
        <li>
          <strong>Full analysis</strong>: includes WebRTC candidate collection and high-entropy User-Agent
          Client Hints where the browser allows.
        </li>
        <li>
          <strong>Strict mode</strong>: skips WebRTC leak probing and high-entropy client hints (more
          privacy-preserving; less signal depth).
        </li>
      </ul>
      {env.strictScan && (
        <p>
          <strong>Strict scan is enforced</strong> by configuration (<code>VITE_STRICT_SCAN</code>).
        </p>
      )}
      <label htmlFor={`${id}-strict`}>
        <input
          id={`${id}-strict`}
          type="checkbox"
          checked={strictLocal}
          disabled={env.strictScan}
          onChange={(e) => setStrictLocal(e.target.checked)}
        />{' '}
        Enable strict mode (no WebRTC / no high-entropy hints)
      </label>
      <div>
        <button
          type="button"
          onClick={() => {
            localStorage.setItem(STORAGE_CONSENT, '1');
            localStorage.setItem(STORAGE_STRICT, strictLocal ? '1' : '0');
            onAccept();
          }}
        >
          I understand — run analysis
        </button>
      </div>
    </section>
  );
}
