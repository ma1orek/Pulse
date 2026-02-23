import React, { useState, useEffect, useCallback, useRef } from 'react';
import TabBar from './components/TabBar';
import VoiceOrb from './components/VoiceOrb';
import AgentPanel from './components/AgentPanel';

interface Tab {
  id: number;
  url: string;
  title: string;
  active: boolean;
}

type AgentState = 'idle' | 'listening' | 'thinking' | 'speaking';

interface LogEntry {
  type: 'user' | 'agent' | 'action' | 'error';
  text: string;
  timestamp: number;
}

export default function App() {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [agentState, setAgentState] = useState<AgentState>('idle');
  const [agentLog, setAgentLog] = useState<LogEntry[]>([]);
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Add log entry
  const addLog = useCallback((type: LogEntry['type'], text: string) => {
    setAgentLog(prev => [...prev.slice(-50), { type, text, timestamp: Date.now() }]);
  }, []);

  // WebSocket connection to backend
  const connectWS = useCallback(() => {
    const wsUrl = 'ws://localhost:8080/ws/user1/session1';
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setWsConnected(true);
      addLog('agent', 'Connected to Pulse backend');
    };

    ws.onmessage = async (event) => {
      // Binary data = audio response from Gemini
      if (event.data instanceof Blob) {
        const buf = await event.data.arrayBuffer();
        playAudioBuffer(buf);
        return;
      }

      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'action') {
          addLog('action', `${msg.action} ${msg.url || msg.text || ''}`);

          let result: any = { status: 'ok' };
          try {
            if (msg.action === 'navigate') {
              await window.pulse.navigate(msg.url);
              result = { status: 'ok', navigated_to: msg.url };
            } else if (msg.action === 'new_tab') {
              const tab = await window.pulse.createTab(msg.url || '');
              result = { status: 'ok', tab_id: tab.id };
            } else if (msg.action === 'close_tab') {
              if (activeTabId) await window.pulse.closeTab(activeTabId);
              result = { status: 'ok' };
            } else {
              result = await window.pulse.executeAction(msg);
            }
          } catch (err: any) {
            result = { status: 'error', message: err.message || 'Action failed' };
          }

          // Send result back to backend so Gemini gets the tool response
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'action_result', ...result }));
          }

        } else if (msg.type === 'transcript') {
          addLog('agent', msg.text);
        } else if (msg.type === 'status') {
          setAgentState(msg.state);
        } else if (msg.type === 'error') {
          addLog('error', msg.message);
        }
      } catch {
        // Ignore parse errors
      }
    };

    ws.onclose = () => {
      setWsConnected(false);
      addLog('error', 'Disconnected from backend. Reconnecting...');
      setTimeout(connectWS, 3000);
    };

    ws.onerror = () => {
      addLog('error', 'Connection error');
    };

    wsRef.current = ws;
  }, [addLog, activeTabId]);

  // Audio playback
  const playAudio = useCallback((base64: string) => {
    const bytes = atob(base64);
    const buffer = new ArrayBuffer(bytes.length);
    const view = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i++) view[i] = bytes.charCodeAt(i);
    playAudioBuffer(buffer);
  }, []);

  const playAudioBuffer = useCallback((buffer: ArrayBuffer) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({ sampleRate: 24000 });
    }
    const ctx = audioContextRef.current;
    const int16 = new Int16Array(buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768;

    const audioBuffer = ctx.createBuffer(1, float32.length, 24000);
    audioBuffer.getChannelData(0).set(float32);
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    source.start();
  }, []);

  // Send audio to backend
  const sendAudio = useCallback((pcmData: ArrayBuffer) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const header = new Uint8Array([0x01]); // 0x01 = audio
      const combined = new Uint8Array(header.length + pcmData.byteLength);
      combined.set(header);
      combined.set(new Uint8Array(pcmData), header.length);
      wsRef.current.send(combined.buffer);
    }
  }, []);

  // Send screenshot to backend
  const sendScreenshot = useCallback((base64: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const bytes = atob(base64);
      const buffer = new ArrayBuffer(bytes.length + 1);
      const view = new Uint8Array(buffer);
      view[0] = 0x02; // 0x02 = screenshot
      for (let i = 0; i < bytes.length; i++) view[i + 1] = bytes.charCodeAt(i);
      wsRef.current.send(buffer);
    }
  }, []);

  // Send text command to backend
  const sendTextCommand = useCallback((text: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'text_command', text }));
      addLog('user', text);
    }
  }, [addLog]);

  // Listen for tab events from main process
  useEffect(() => {
    window.pulse.onTabCreated((data) => {
      setTabs(prev => [...prev, { ...data, active: true }]);
      setActiveTabId(data.id);
    });

    window.pulse.onTabUpdated((data) => {
      setTabs(prev => prev.map(t => t.id === data.id ? { ...t, ...data } : t));
    });

    window.pulse.onTabSwitched((data) => {
      setActiveTabId(data.id);
      setTabs(prev => prev.map(t => ({ ...t, active: t.id === data.id })));
    });

    window.pulse.onTabClosed((data) => {
      setTabs(prev => prev.filter(t => t.id !== data.id));
    });

    // Forward screenshots to backend
    window.pulse.onScreenshotCaptured((base64) => {
      sendScreenshot(base64);
    });
  }, [sendScreenshot]);

  // Connect WebSocket on mount
  useEffect(() => {
    connectWS();
    return () => {
      wsRef.current?.close();
    };
  }, [connectWS]);

  return (
    <div className="flex flex-col h-screen" style={{ background: 'var(--pulse-bg)' }}>
      {/* Top bar: tabs + status */}
      <div className="flex items-center" style={{
        height: '44px',
        background: 'var(--pulse-surface)',
        borderBottom: '1px solid var(--pulse-border)',
        paddingLeft: '140px', // space for window controls
      }}>
        <TabBar
          tabs={tabs}
          activeTabId={activeTabId}
          onSwitchTab={(id) => window.pulse.switchTab(id)}
          onCloseTab={(id) => window.pulse.closeTab(id)}
          onNewTab={() => window.pulse.createTab('')}
        />
        <div className="ml-auto mr-3 flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: wsConnected ? 'var(--pulse-green)' : 'var(--pulse-red)' }}
          />
          <span className="text-xs" style={{ color: 'var(--pulse-text-dim)' }}>
            {wsConnected ? 'Connected' : 'Offline'}
          </span>
        </div>
      </div>

      {/* Main content area (browser view is rendered by Electron behind this) */}
      <div className="flex-1 relative">
        {/* Voice Orb - floating bottom center */}
        <VoiceOrb
          state={agentState}
          onStartListening={() => {
            setAgentState('listening');
            addLog('agent', 'Listening...');
          }}
          onStopListening={() => {
            setAgentState('idle');
          }}
          sendAudio={sendAudio}
          sendTextCommand={sendTextCommand}
        />

        {/* Agent Panel - floating right side */}
        <AgentPanel
          log={agentLog}
          agentState={agentState}
        />
      </div>
    </div>
  );
}
