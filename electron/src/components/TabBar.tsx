import React from 'react';

interface Tab {
  id: number;
  url: string;
  title: string;
  active: boolean;
}

interface TabBarProps {
  tabs: Tab[];
  activeTabId: number | null;
  onSwitchTab: (id: number) => void;
  onCloseTab: (id: number) => void;
  onNewTab: () => void;
}

export default function TabBar({ tabs, activeTabId, onSwitchTab, onCloseTab, onNewTab }: TabBarProps) {
  return (
    <div className="flex items-center gap-1 h-full overflow-x-auto px-2" style={{ maxWidth: '70%' }}>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          onClick={() => onSwitchTab(tab.id)}
          className="flex items-center gap-2 px-3 h-8 rounded-lg text-xs cursor-pointer transition-colors shrink-0"
          style={{
            background: tab.id === activeTabId ? 'var(--pulse-bg)' : 'transparent',
            color: tab.id === activeTabId ? 'var(--pulse-text)' : 'var(--pulse-text-dim)',
            border: tab.id === activeTabId ? '1px solid var(--pulse-border)' : '1px solid transparent',
            maxWidth: '180px',
          }}
        >
          <span className="truncate">{tab.title || 'New Tab'}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCloseTab(tab.id);
            }}
            className="ml-1 hover:text-white transition-colors shrink-0"
            style={{ color: 'var(--pulse-text-dim)' }}
          >
            x
          </button>
        </div>
      ))}

      <button
        onClick={onNewTab}
        className="w-7 h-7 flex items-center justify-center rounded-lg text-sm transition-colors shrink-0"
        style={{
          color: 'var(--pulse-text-dim)',
          background: 'transparent',
          border: 'none',
        }}
        title="New Tab"
      >
        +
      </button>
    </div>
  );
}
