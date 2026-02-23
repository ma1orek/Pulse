interface PulseAPI {
  createTab: (url: string) => Promise<{ id: number; url: string }>;
  switchTab: (id: number) => Promise<{ success: boolean }>;
  closeTab: (id: number) => Promise<{ success: boolean }>;
  navigate: (url: string) => Promise<{ success: boolean }>;
  getTabs: () => Promise<Array<{ id: number; url: string; title: string; active: boolean }>>;
  executeAction: (action: any) => Promise<{ success: boolean; text?: string; error?: string }>;
  captureScreenshot: () => Promise<string | null>;
  onTabCreated: (cb: (data: { id: number; url: string; title: string }) => void) => void;
  onTabUpdated: (cb: (data: { id: number; url: string; title: string }) => void) => void;
  onTabSwitched: (cb: (data: { id: number }) => void) => void;
  onTabClosed: (cb: (data: { id: number }) => void) => void;
  onScreenshotCaptured: (cb: (base64: string) => void) => void;
}

declare global {
  interface Window {
    pulse: PulseAPI;
  }
}

export {};
