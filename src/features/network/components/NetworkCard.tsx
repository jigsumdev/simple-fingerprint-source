import type { NetworkInfo } from '@/types';

interface NetworkCardProps {
  data: NetworkInfo | null;
  loading: boolean;
}

export function NetworkCard({ data, loading }: NetworkCardProps) {
  if (loading) {
    return <div>Loading network telemetry…</div>;
  }

  if (!data) {
    return <div>No network data available</div>;
  }

  const location = [data.city, data.region].filter(Boolean).join(', ') || 'Unknown';
  const countryLine =
    data.countryCode && data.countryCode !== data.country
      ? `${data.country} (${data.countryCode})`
      : data.country;

  return (
    <div>
      <div><span>Egress IP Address:</span> {data.ip}</div>
      <div><span>Geolocation Node:</span> {location}</div>
      <div><span>Sovereign Jurisdiction:</span> {countryLine}</div>
      {data.asn != null && (
        <div>
          <span>ASN:</span> {data.asn}
          {data.organization ? ` — ${data.organization}` : ''}
        </div>
      )}
      <div><span>Transit Provider:</span> {data.isp}</div>
      <div>
        <span>Source:</span> {data.source}
      </div>
    </div>
  );
}
