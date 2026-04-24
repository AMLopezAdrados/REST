'use client';

import type { TopicNode } from '@/types/node';
import { NodeCard } from './NodeCard';

interface HierarchyLevelViewProps {
  parent: TopicNode;
  children: TopicNode[];
  onChildClick: (node: TopicNode) => void;
}

/**
 * Shared view for DOMAIN (shows clusters), CLUSTER (shows topics+convos), TOPIC (shows convos).
 * Central parent node + orbiting children using persisted positions.
 * NodeCard infers its variant from each child's depth.
 */
export function HierarchyLevelView({ parent, children, onChildClick }: HierarchyLevelViewProps) {
  return (
    <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2">
      {/* Orbital lines */}
      <svg
        className="absolute w-[2000px] h-[2000px] pointer-events-none"
        style={{ left: '-1000px', top: '-1000px' }}
      >
        <g transform="translate(1000, 1000)">
          {children.map((child) => (
            <line
              key={`line-${child.id}`}
              x1="0"
              y1="0"
              x2={child.position_x}
              y2={child.position_y}
              stroke="#D6D3D1"
              strokeWidth="1"
              strokeDasharray="4 4"
              className="opacity-30"
            />
          ))}
        </g>
      </svg>

      {/* Central parent card */}
      <div
        className="absolute z-30 w-[320px] animate-fadeIn"
        style={{ left: 0, top: 0, transform: 'translate(-50%, -50%) scale(1.05)' }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <NodeCard node={parent} onClick={() => {}} />
      </div>

      {/* Orbiting children */}
      {children.map((child, i) => (
        <div
          key={child.id}
          className="absolute z-10 w-[290px] animate-fadeIn transition-all duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
          style={{
            left: `${child.position_x}px`,
            top: `${child.position_y}px`,
            transform: 'translate(-50%, -50%)',
            transitionDelay: `${i * 50}ms`,
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <NodeCard node={child} onClick={() => onChildClick(child)} />
        </div>
      ))}

      {children.length === 0 && (
        <div className="absolute text-textLight text-sm italic" style={{ left: 0, top: '200px', transform: 'translateX(-50%)' }}>
          No items in this group yet.
        </div>
      )}
    </div>
  );
}
