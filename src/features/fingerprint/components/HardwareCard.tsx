import { getScreenResolution, getPixelRatio } from '@/features/fingerprint/api/fingerprint';
import type { FingerprintData } from '@/types';

interface HardwareCardProps {
  data: FingerprintData | null;
  loading: boolean;
}

export function HardwareCard({ data, loading }: HardwareCardProps) {
  if (loading) {
    return <div>Loading hardware profile…</div>;
  }

  if (!data) {
    return <div>No hardware data available</div>;
  }

  const memory = typeof data.systemMemory === 'number' ? `~${data.systemMemory} GB` : data.systemMemory;
  const resolution = getScreenResolution();
  const pixelRatio = getPixelRatio();

  return (
    <div>
      <div>
        <span>Graphics Processor:</span> {data.gpu}
      </div>
      <div>
        <span>Advanced GPU Hash:</span> {data.advancedWebGLHash ?? 'N/A'}
      </div>
      <div>
        <span>Logical Processors:</span> {data.logicalProcessors}
      </div>
      <div>
        <span>System Memory:</span> {memory}
      </div>
      <div>
        <span>Display Matrix:</span> {resolution.replace('x', '×')}
      </div>
      <div>
        <span>Display Density:</span> {pixelRatio}
      </div>
      {data.screenGeometry && (
        <>
          <div>
            <span>Outer Dimensions:</span> {data.screenGeometry.outerWidth}×{data.screenGeometry.outerHeight}
          </div>
          <div>
            <span>Inner Dimensions:</span> {data.screenGeometry.innerWidth}×{data.screenGeometry.innerHeight}
          </div>
          <div>
            <span>Color Depth:</span> {data.screenGeometry.colorDepth} bits
          </div>
        </>
      )}
    </div>
  );
}
