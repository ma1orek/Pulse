import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface LogEntry {
  type: 'user' | 'agent' | 'action' | 'error';
  text: string;
  timestamp: number;
}

interface AgentPanelProps {
  log: LogEntry[];
  agentState: 'idle' | 'listening' | 'thinking' | 'speaking';
}

export default function AgentPanel({ log, agentState }: AgentPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [log]);

  const typeColors: Record<string, string> = {
    user: '#6366f1',
    agent: '#22c55e',
    action: '#eab308',
    error: '#ef4444',
  };

  const typeLabels: Record<string, string> = {
    user: 'You',
    agent: 'Pulse',
    action: 'Action',
    error: 'Error',
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="absolute right-4 top-4 bottom-24 w-72 flex flex-col rounded-xl overflow-hidden z-40"
      style={{
        background: 'rgba(19, 19, 26, 0.85)',
        backdropFilter: 'blur(12px)',
        border: '1px solid var(--pulse-border)',
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--pulse-border)' }}>
        <div
          className="w-2 h-2 rounded-full"
          style={{
            background: agentState === 'idle' ? 'var(--pulse-text-dim)' :
                        agentState === 'listening' ? '#22c55e' :
                        agentState === 'thinking' ? '#eab308' : '#6366f1',
          }}
        />
        <span className="text-sm font-medium">Pulse Agent</span>
        <span className="text-xs ml-auto" style={{ color: 'var(--pulse-text-dim)' }}>
          {agentState}
        </span>
      </div>

      {/* Log entries */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2">
        <AnimatePresence>
          {log.length === 0 ? (
            <p className="text-xs text-center py-8" style={{ color: 'var(--pulse-text-dim)' }}>
              Click the orb or type a command to start browsing with Pulse
            </p>
          ) : (
            log.map((entry, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-xs"
              >
                <span className="font-medium" style={{ color: typeColors[entry.type] }}>
                  {typeLabels[entry.type]}:
                </span>{' '}
                <span style={{ color: 'var(--pulse-text)' }}>{entry.text}</span>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
