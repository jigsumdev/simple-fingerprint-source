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
        and optionally local network candidates via WebRTC) to build a device digest. It does{' '}
        <strong>not</strong> compare your fingerprint to a global population — that would require a
        server-side cohort. Results stay in this page unless you copy them.
      </p>
      <ul>
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
