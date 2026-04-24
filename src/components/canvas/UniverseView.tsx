'use client';

import type { TopicNode } from '@/types/node';
import { SunCard } from './SunCard';
import { NodeCard } from './NodeCard';

interface UniverseViewProps {
  universe: TopicNode | null;
  domains: TopicNode[];
  onDomainClick: (domain: TopicNode) => void;
}

export function UniverseView({ universe, domains, onDomainClick }: UniverseViewProps) {
  // Roll up counts from domains. Each domain already represents an aggregate,
  // so we count emails in each domain bucketed by its rolled-up status.
  const actionCount = domains
    .filter((d) => d.status === 'action')
    .reduce((s, d) => s + d.email_count, 0);
  const fyiCount = domains
    .filter((d) => d.status === 'ongoing' || d.status === 'archive')
    .reduce((s, d) => s + d.email_count, 0);
  const savedCount = domains
    .filter((d) => d.status === 'saved')
    .reduce((s, d) => s + d.email_count, 0);

  return (
    <>
      {/* Orbital lines from sun to each domain */}
      <svg className="absolute inset-0 w-[5000px] h-[5000px] pointer-events-none transform -translate-x-1/2 -translate-y-1/2 left-1/2 top-1/2">
        <g transform="translate(2500, 2500)">
          {domains.map((d) => (
            <path
              key={`line-${d.id}`}
              d={`M 0 0 Q ${d.position_x / 2} ${d.position_y / 2 + 50} ${d.position_x} ${d.position_y}`}
              fill="none"
              stroke="#D6D3D1"
              strokeWidth="1.5"
              strokeDasharray="4 4"
              className="opacity-40 transition-all duration-[600ms]"
            />
          ))}
        </g>
      </svg>

      {/* Central SunCard */}
      <div className="absolute left-1/2 top-1/2 z-20">
        <SunCard
          actionCount={actionCount}
          fyiCount={fyiCount}
          savedCount={savedCount}
          aggregateSummary={universe?.aggregate_summary ?? null}
        />
      </div>

      {/* Orbiting domain cards */}
      <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2">
        {domains.map((domain) => (
          <div
            key={domain.id}
            className="absolute z-10 w-[290px] transition-all duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)] animate-fadeIn"
            style={{
              left: `${domain.position_x}px`,
              top: `${domain.position_y}px`,
              transform: 'translate(-50%, -50%)',
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <NodeCard node={domain} onClick={() => onDomainClick(domain)} variant="domain" />
          </div>
        ))}
      </div>
    </>
  );
}
