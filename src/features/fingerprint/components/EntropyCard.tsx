import {
  getPlatform,
  getTimezone,
  areCookiesEnabled,
} from '@/features/fingerprint/api/fingerprint';
import type { FingerprintData } from '@/types';

interface EntropyCardProps {
  data: FingerprintData | null;
  loading: boolean;
}

export function EntropyCard({ data, loading }: EntropyCardProps) {
  if (loading) {
    return <div>Loading entropy signals…</div>;
  }

  if (!data) {
    return <div>No entropy data available</div>;
  }

  return (
    <div>
      <div>
        <span>2D Context Signature:</span> {data.environmentHash}
      </div>
      <div>
        <span>Advanced Canvas Hash:</span> {data.advancedCanvasHash ?? 'N/A'}
      </div>
      <div>
        <span>Extended canvas probes:</span> {data.canvasExtendedProbe ?? 'N/A'}
      </div>
      <div>
        <span>Oscillator Fingerprint:</span> {data.audioSignature}
      </div>
      <div>
        <span>Enhanced Audio Hash:</span> {data.enhancedAudioHash ?? 'N/A'}
      </div>
      <div>
        <span>Operating Environment:</span> {getPlatform()}
      </div>
      <div>
        <span>Temporal Locale:</span> {getTimezone()}
      </div>
      <div>
        <span>State Persistence:</span> {areCookiesEnabled() ? 'Enabled' : 'Disabled'}
      </div>
      {data.detectedFonts && data.detectedFonts.length > 0 && (
        <div>
          <span>Detected Fonts:</span> {data.detectedFonts.slice(0, 8).join(', ')}
          {data.detectedFonts.length > 8 ? '…' : ''}
        </div>
      )}
      {data.navigatorDeepDive && (
        <>
          <div>
            <span>User Agent:</span>{' '}
            {(data.navigatorDeepDive.userAgent || '').slice(0, 80)}
            {(data.navigatorDeepDive.userAgent || '').length > 80 ? '…' : ''}
          </div>
          <div>
            <span>Touch Points:</span> {data.navigatorDeepDive.maxTouchPoints ?? 0}
          </div>
          <div>
            <span>Languages:</span> {data.navigatorDeepDive.languages.join(', ') || 'N/A'}
          </div>
        </>
      )}
      {data.clientHints && (
        <div>
          <span>Client Hints:</span>{' '}
          {data.clientHints.platform ?? 'n/a'} · mobile: {String(data.clientHints.mobile)} · high-entropy:{' '}
          {data.clientHints.highEntropy ? 'yes' : 'no'}
        </div>
      )}
    </div>
  );
}
