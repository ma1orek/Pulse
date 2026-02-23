import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface VoiceOrbProps {
  state: 'idle' | 'listening' | 'thinking' | 'speaking';
  onStartListening: () => void;
  onStopListening: () => void;
  sendAudio: (pcmData: ArrayBuffer) => void;
  sendTextCommand: (text: string) => void;
}

export default function VoiceOrb({
  state,
  onStartListening,
  onStopListening,
  sendAudio,
  sendTextCommand,
}: VoiceOrbProps) {
  const [showTextInput, setShowTextInput] = useState(false);
  const [textInput, setTextInput] = useState('');
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioWorkletRef = useRef<AudioWorkletNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true }
      });
      audioStreamRef.current = stream;

      const ctx = new AudioContext({ sampleRate: 16000 });
      audioCtxRef.current = ctx;

      // Use ScriptProcessorNode as fallback (simpler than AudioWorklet for hackathon)
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (e) => {
        const float32 = e.inputBuffer.getChannelData(0);
        const int16 = new Int16Array(float32.length);
        for (let i = 0; i < float32.length; i++) {
          int16[i] = Math.max(-32768, Math.min(32767, Math.floor(float32[i] * 32768)));
        }
        sendAudio(int16.buffer);
      };

      source.connect(processor);
      processor.connect(ctx.destination);
      onStartListening();
    } catch (err) {
      console.error('Failed to access microphone:', err);
    }
  }, [sendAudio, onStartListening]);

  const stopListening = useCallback(() => {
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(t => t.stop());
      audioStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    onStopListening();
  }, [onStopListening]);

  const handleOrbClick = useCallback(() => {
    if (state === 'listening') {
      stopListening();
    } else if (state === 'idle') {
      startListening();
    }
  }, [state, startListening, stopListening]);

  const handleTextSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (textInput.trim()) {
      sendTextCommand(textInput.trim());
      setTextInput('');
    }
  }, [textInput, sendTextCommand]);

  const orbColors = {
    idle: { bg: 'var(--pulse-accent)', glow: 'var(--pulse-accent-glow)' },
    listening: { bg: '#22c55e', glow: 'rgba(34, 197, 94, 0.4)' },
    thinking: { bg: '#eab308', glow: 'rgba(234, 179, 8, 0.4)' },
    speaking: { bg: '#6366f1', glow: 'rgba(99, 102, 241, 0.5)' },
  };

  const stateLabels = {
    idle: 'Click to speak',
    listening: 'Listening...',
    thinking: 'Processing...',
    speaking: 'Speaking...',
  };

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 z-50">
      {/* Text input toggle */}
      <AnimatePresence>
        {showTextInput && (
          <motion.form
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            onSubmit={handleTextSubmit}
            className="flex gap-2"
          >
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Type a command..."
              autoFocus
              className="px-4 py-2 rounded-full text-sm outline-none"
              style={{
                background: 'var(--pulse-surface)',
                border: '1px solid var(--pulse-border)',
                color: 'var(--pulse-text)',
                width: '300px',
              }}
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-full text-sm font-medium"
              style={{ background: 'var(--pulse-accent)', color: '#fff' }}
            >
              Send
            </button>
          </motion.form>
        )}
      </AnimatePresence>

      <div className="flex items-center gap-3">
        {/* Keyboard icon */}
        <button
          onClick={() => setShowTextInput(!showTextInput)}
          className="p-2 rounded-full transition-colors"
          style={{
            background: showTextInput ? 'var(--pulse-accent)' : 'var(--pulse-surface)',
            border: '1px solid var(--pulse-border)',
            color: 'var(--pulse-text)',
          }}
          title="Toggle text input"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <line x1="6" y1="8" x2="6" y2="8" />
            <line x1="10" y1="8" x2="10" y2="8" />
            <line x1="14" y1="8" x2="14" y2="8" />
            <line x1="18" y1="8" x2="18" y2="8" />
            <line x1="8" y1="12" x2="16" y2="12" />
            <line x1="6" y1="16" x2="18" y2="16" />
          </svg>
        </button>

        {/* The Orb */}
        <motion.button
          onClick={handleOrbClick}
          className="relative rounded-full flex items-center justify-center cursor-pointer"
          style={{
            width: '64px',
            height: '64px',
            background: orbColors[state].bg,
          }}
          animate={{
            boxShadow: state === 'idle'
              ? `0 0 20px ${orbColors[state].glow}`
              : state === 'listening'
              ? [
                  `0 0 20px ${orbColors[state].glow}`,
                  `0 0 50px ${orbColors[state].glow}`,
                  `0 0 20px ${orbColors[state].glow}`,
                ]
              : state === 'thinking'
              ? `0 0 30px ${orbColors[state].glow}`
              : [
                  `0 0 20px ${orbColors[state].glow}`,
                  `0 0 40px ${orbColors[state].glow}`,
                  `0 0 20px ${orbColors[state].glow}`,
                ],
            scale: state === 'listening' ? [1, 1.08, 1] : 1,
          }}
          transition={{
            duration: state === 'listening' || state === 'speaking' ? 1.5 : 0.3,
            repeat: state === 'listening' || state === 'speaking' ? Infinity : 0,
          }}
        >
          {/* Mic icon */}
          {state === 'idle' || state === 'listening' ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          ) : state === 'thinking' ? (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
            </motion.div>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
          )}
        </motion.button>
      </div>

      {/* State label */}
      <span className="text-xs" style={{ color: 'var(--pulse-text-dim)' }}>
        {stateLabels[state]}
      </span>
    </div>
  );
}
