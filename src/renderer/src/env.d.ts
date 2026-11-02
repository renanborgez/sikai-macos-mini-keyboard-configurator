import type { MiniKeyApi } from '../../preload'

declare global {
  interface Window {
    miniKey: MiniKeyApi
  }
}
export {}
