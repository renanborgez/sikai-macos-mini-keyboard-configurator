import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { connectedProtocol, deviceStatus, writeMessages } from './hid'
import { encodeBinding, encodeLed, encodeProfile } from '../shared/protocol'
import { CAPS, getLayout } from '../shared/layouts'
import { normalizeProfile } from '../shared/profile'
import type { Action, Led, LayoutId, Profile, Target } from '../shared/types'

const profilePath = () => join(app.getPath('userData'), 'profile.json')
let busy = false

async function withDevice<T>(fn: () => Promise<T>): Promise<T> {
  if (busy) throw new Error('Another upload is in progress.')
  busy = true
  try {
    return await fn()
  } finally {
    busy = false
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 860,
    minWidth: 960,
    minHeight: 720,
    title: 'Mini Key',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#16171a',
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: true, contextIsolation: true }
  })
  // Snapshot mode (debug/docs): render a given layout without touching the saved profile.
  const snap = process.env['MINIKEY_SNAPSHOT']
  const query: Record<string, string> = snap
    ? {
        snapshot: '1',
        layout: process.env['MINIKEY_LAYOUT'] ?? '',
        side: process.env['MINIKEY_SIDE'] ?? '',
        defaults: process.env['MINIKEY_DEFAULTS'] ?? ''
      }
    : {}
  if (process.env['ELECTRON_RENDERER_URL'])
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}?${new URLSearchParams(query)}`)
  else win.loadFile(join(__dirname, '../renderer/index.html'), { query })

  // Debug: MINIKEY_SNAPSHOT=/path/out.png [MINIKEY_LAYOUT=6-1] [MINIKEY_SIDE=right] [MINIKEY_DEFAULTS=1] renders the window to a PNG and quits.
  if (snap) {
    win.webContents.once('did-finish-load', () =>
      setTimeout(async () => {
        // MINIKEY_CROP=pad captures just the keyboard drawing (used for the README model gallery).
        const rect = process.env['MINIKEY_CROP']
          ? await win.webContents.executeJavaScript(
              `(() => { const r = document.querySelector('.pad').getBoundingClientRect();
                return { x: Math.floor(r.x) - 28, y: Math.floor(r.y) - 14, width: Math.ceil(r.width) + 56, height: Math.ceil(r.height) + 28 } })()`
            )
          : undefined
        await writeFile(snap, (await win.webContents.capturePage(rect)).toPNG())
        app.quit()
      }, 1500)
    )
  }

  const progress = (done: number, total: number) => win.webContents.send('upload:progress', { done, total })

  // While the shortcut recorder is active, swallow every key (so ⌘W / ⌘Q etc. don't trigger
  // menu actions) and forward it to the renderer instead.
  let recording = false
  ipcMain.on('recorder:active', (_e, on: boolean) => (recording = on))
  // A reload must never leave the recorder swallowing keys.
  win.webContents.on('did-start-loading', () => (recording = false))

  // This window only ever shows the bundled UI.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  win.webContents.on('before-input-event', (event, input) => {
    if (!recording || (input.type !== 'keyDown' && input.type !== 'keyUp')) return
    event.preventDefault()
    win.webContents.send('recorder:key', {
      type: input.type,
      code: input.code,
      repeat: input.isAutoRepeat,
      meta: input.meta,
      ctrl: input.control,
      alt: input.alt,
      shift: input.shift
    })
  })

  ipcMain.handle('device:status', () => deviceStatus())

  // Encoding happens here, after we know which chip (protocol) is plugged in.
  ipcMain.handle('device:upload', (_e, profile: Profile) =>
    withDevice(() => writeMessages(encodeProfile(normalizeProfile(profile), connectedProtocol()), progress))
  )

  ipcMain.handle('device:uploadOne', (_e, layout: LayoutId, layer: number, target: Target, action: Action) =>
    withDevice(() => writeMessages(encodeBinding(connectedProtocol(), getLayout(layout), layer, target, action)))
  )

  ipcMain.handle('device:led', (_e, layer: number, led: Led) =>
    withDevice(() => {
      if (!CAPS[connectedProtocol()].led) throw new Error("This keyboard's lights can't be configured.")
      return writeMessages(encodeLed(layer, led))
    })
  )

  ipcMain.handle('profile:load', async () => {
    try {
      return normalizeProfile(JSON.parse(await readFile(profilePath(), 'utf8')))
    } catch {
      return null
    }
  })

  ipcMain.handle('profile:save', (_e, profile: Profile) => writeFile(profilePath(), JSON.stringify(profile, null, 2)))

  ipcMain.handle('profile:export', async (_e, profile: Profile) => {
    const r = await dialog.showSaveDialog(win, { defaultPath: 'mini-key-profile.json', filters: [{ name: 'JSON', extensions: ['json'] }] })
    if (r.canceled || !r.filePath) return false
    await writeFile(r.filePath, JSON.stringify(profile, null, 2))
    return true
  })

  ipcMain.handle('profile:import', async () => {
    const r = await dialog.showOpenDialog(win, { filters: [{ name: 'JSON', extensions: ['json'] }], properties: ['openFile'] })
    if (r.canceled || !r.filePaths[0]) return null
    return normalizeProfile(JSON.parse(await readFile(r.filePaths[0], 'utf8')))
  })
}

app.whenReady().then(() => {
  // Packaged builds get the icon from build/icon.icns; in dev, set the Dock icon explicitly.
  if (!app.isPackaged) app.dock?.setIcon(join(__dirname, '../../build/icon.png'))
  createWindow()
})
app.on('window-all-closed', () => app.quit())
