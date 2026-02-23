import { app, BrowserWindow, ipcMain, WebContentsView } from 'electron';

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

if (require('electron-squirrel-startup')) {
  app.quit();
}

// ── Browser tab management ──────────────────────────────────────────
interface Tab {
  id: number;
  view: WebContentsView;
  url: string;
  title: string;
}

let mainWindow: BrowserWindow | null = null;
const tabs: Map<number, Tab> = new Map();
let activeTabId: number | null = null;
let nextTabId = 1;
let screenshotInterval: ReturnType<typeof setInterval> | null = null;

function getContentBounds(): Electron.Rectangle {
  if (!mainWindow) return { x: 0, y: 0, width: 800, height: 600 };
  const [width, height] = mainWindow.getContentSize();
  // Top 80px reserved for UI (TabBar + VoiceOrb area)
  return { x: 0, y: 80, width, height: height - 80 };
}

function createTab(url: string): Tab {
  const id = nextTabId++;
  const view = new WebContentsView();

  view.webContents.on('did-navigate', (_e, navUrl) => {
    const tab = tabs.get(id);
    if (tab) {
      tab.url = navUrl;
      mainWindow?.webContents.send('tab-updated', { id, url: navUrl, title: tab.title });
    }
  });

  view.webContents.on('page-title-updated', (_e, title) => {
    const tab = tabs.get(id);
    if (tab) {
      tab.title = title;
      mainWindow?.webContents.send('tab-updated', { id, url: tab.url, title });
    }
  });

  const tab: Tab = { id, view, url, title: 'New Tab' };
  tabs.set(id, tab);

  if (url) {
    const fullUrl = url.startsWith('http') ? url : `https://${url}`;
    view.webContents.loadURL(fullUrl);
  }

  switchToTab(id);
  mainWindow?.webContents.send('tab-created', { id, url, title: 'New Tab' });
  return tab;
}

function switchToTab(id: number): void {
  if (!mainWindow) return;
  const tab = tabs.get(id);
  if (!tab) return;

  // Hide all views, show the active one
  for (const [tid, t] of tabs) {
    if (tid === id) {
      if (!mainWindow.contentView.children.includes(t.view)) {
        mainWindow.contentView.addChildView(t.view);
      }
      t.view.setBounds(getContentBounds());
      t.view.setVisible(true);
    } else {
      t.view.setVisible(false);
    }
  }

  activeTabId = id;
  mainWindow.webContents.send('tab-switched', { id });
}

function closeTab(id: number): void {
  const tab = tabs.get(id);
  if (!tab || !mainWindow) return;

  mainWindow.contentView.removeChildView(tab.view);
  tab.view.webContents.close();
  tabs.delete(id);

  if (activeTabId === id) {
    const remaining = Array.from(tabs.keys());
    if (remaining.length > 0) {
      switchToTab(remaining[remaining.length - 1]);
    } else {
      activeTabId = null;
    }
  }

  mainWindow.webContents.send('tab-closed', { id });
}

async function captureActiveTab(): Promise<Buffer | null> {
  if (activeTabId === null) return null;
  const tab = tabs.get(activeTabId);
  if (!tab) return null;

  try {
    const image = await tab.view.webContents.capturePage();
    const resized = image.resize({ width: 768, height: 768 });
    return resized.toJPEG(70);
  } catch {
    return null;
  }
}

// ── IPC Handlers ────────────────────────────────────────────────────

function setupIPC(): void {
  ipcMain.handle('create-tab', (_e, url: string) => {
    const tab = createTab(url);
    return { id: tab.id, url: tab.url };
  });

  ipcMain.handle('switch-tab', (_e, id: number) => {
    switchToTab(id);
    return { success: true };
  });

  ipcMain.handle('close-tab', (_e, id: number) => {
    closeTab(id);
    return { success: true };
  });

  ipcMain.handle('navigate', (_e, url: string) => {
    if (activeTabId === null) {
      createTab(url);
    } else {
      const tab = tabs.get(activeTabId);
      if (tab) {
        const fullUrl = url.startsWith('http') ? url : `https://${url}`;
        tab.view.webContents.loadURL(fullUrl);
      }
    }
    return { success: true };
  });

  ipcMain.handle('capture-screenshot', async () => {
    const buf = await captureActiveTab();
    return buf ? buf.toString('base64') : null;
  });

  ipcMain.handle('execute-action', async (_e, action: {
    type: string;
    x?: number;
    y?: number;
    text?: string;
    direction?: string;
    amount?: number;
  }) => {
    if (activeTabId === null) return { success: false, error: 'No active tab' };
    const tab = tabs.get(activeTabId);
    if (!tab) return { success: false, error: 'Tab not found' };

    const wc = tab.view.webContents;

    switch (action.type) {
      case 'click':
        if (action.x !== undefined && action.y !== undefined) {
          wc.sendInputEvent({ type: 'mouseDown', x: action.x, y: action.y, button: 'left', clickCount: 1 });
          wc.sendInputEvent({ type: 'mouseUp', x: action.x, y: action.y, button: 'left' });
        }
        break;
      case 'type':
        if (action.text) {
          for (const char of action.text) {
            wc.sendInputEvent({ type: 'keyDown', keyCode: char });
            wc.sendInputEvent({ type: 'char', keyCode: char });
            wc.sendInputEvent({ type: 'keyUp', keyCode: char });
          }
        }
        break;
      case 'scroll':
        await wc.executeJavaScript(
          `window.scrollBy(0, ${action.direction === 'up' ? -(action.amount || 500) : (action.amount || 500)})`
        );
        break;
      case 'enter':
        wc.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
        wc.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
        break;
      case 'back':
        if (wc.canGoBack()) wc.goBack();
        break;
      case 'forward':
        if (wc.canGoForward()) wc.goForward();
        break;
      case 'extract-text':
        return {
          success: true,
          text: await wc.executeJavaScript('document.body.innerText.substring(0, 5000)')
        };
      default:
        return { success: false, error: `Unknown action: ${action.type}` };
    }

    return { success: true };
  });

  ipcMain.handle('get-tabs', () => {
    return Array.from(tabs.values()).map(t => ({
      id: t.id, url: t.url, title: t.title, active: t.id === activeTabId
    }));
  });
}

// ── Window creation ─────────────────────────────────────────────────

const createWindow = (): void => {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0a0a0f',
      symbolColor: '#ffffff',
      height: 36,
    },
    backgroundColor: '#0a0a0f',
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  // Resize browser views when window resizes
  mainWindow.on('resize', () => {
    if (activeTabId !== null) {
      const tab = tabs.get(activeTabId);
      if (tab) {
        tab.view.setBounds(getContentBounds());
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (screenshotInterval) clearInterval(screenshotInterval);
  });

  // Start screenshot capture at 1 FPS
  screenshotInterval = setInterval(async () => {
    const buf = await captureActiveTab();
    if (buf && mainWindow) {
      mainWindow.webContents.send('screenshot-captured', buf.toString('base64'));
    }
  }, 1000);

  // Open a default blank tab
  createTab('');
};

app.on('ready', () => {
  setupIPC();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
