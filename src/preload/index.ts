import { contextBridge, ipcRenderer } from 'electron'
import type { Action, LayoutId, Led, Profile, Target } from '../shared/types'
import type { DeviceStatus } from '../main/hid'

export interface RecorderKey {
  type: 'keyDown' | 'keyUp'
  code: string
  repeat: boolean
  meta: boolean
  ctrl: boolean
  alt: boolean
  shift: boolean
}

const api = {
  status: (): Promise<DeviceStatus> => ipcRenderer.invoke('device:status'),
  upload: (profile: Profile): Promise<void> => ipcRenderer.invoke('device:upload', profile),
  uploadOne: (layout: LayoutId, layer: number, target: Target, action: Action): Promise<void> =>
    ipcRenderer.invoke('device:uploadOne', layout, layer, target, action),
  setLed: (layer: number, led: Led): Promise<void> => ipcRenderer.invoke('device:led', layer, led),
  loadProfile: (): Promise<Profile | null> => ipcRenderer.invoke('profile:load'),
  saveProfile: (p: Profile): Promise<void> => ipcRenderer.invoke('profile:save', p),
  exportProfile: (p: Profile): Promise<boolean> => ipcRenderer.invoke('profile:export', p),
  importProfile: (): Promise<Profile | null> => ipcRenderer.invoke('profile:import'),
  setRecording: (on: boolean) => ipcRenderer.send('recorder:active', on),
  onRecorderKey: (cb: (k: RecorderKey) => void) => {
    const h = (_: unknown, k: RecorderKey) => cb(k)
    ipcRenderer.on('recorder:key', h)
    return () => {
      ipcRenderer.removeListener('recorder:key', h)
    }
  },
  onProgress: (cb: (p: { done: number; total: number }) => void) => {
    const h = (_: unknown, p: { done: number; total: number }) => cb(p)
    ipcRenderer.on('upload:progress', h)
    return () => {
      ipcRenderer.removeListener('upload:progress', h)
    }
  }
}

export type MiniKeyApi = typeof api
contextBridge.exposeInMainWorld('miniKey', api)
