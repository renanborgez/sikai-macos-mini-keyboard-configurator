import HID from 'node-hid'
import { REPORT_SIZE, SUPPORTED_PRODUCT_IDS, VENDOR_ID } from '../shared/protocol'

export type DeviceStatus =
  | { state: 'connected'; productId: number; product: string }
  | { state: 'unsupported'; productId: number; message: string }
  | { state: 'missing' }

const CONFIG_USAGE_PAGE = 0xff00

function findConfigInterface() {
  const all = HID.devices().filter((d) => d.vendorId === VENDOR_ID)
  if (all.length === 0) return { status: { state: 'missing' } as DeviceStatus }
  const iface = all.find((d) => d.usagePage === CONFIG_USAGE_PAGE && SUPPORTED_PRODUCT_IDS.includes(d.productId))
  if (!iface) {
    const pid = all[0].productId
    return {
      status: {
        state: 'unsupported',
        productId: pid,
        message:
          pid === 0x8890
            ? 'This keyboard uses the 1189:8890 protocol, which this app does not support yet.'
            : `Unknown product id 0x${pid.toString(16)} (no config interface found).`
      } as DeviceStatus
    }
  }
  return {
    iface,
    status: { state: 'connected', productId: iface.productId, product: iface.product ?? 'Mini keyboard' } as DeviceStatus
  }
}

export function deviceStatus(): DeviceStatus {
  return findConfigInterface().status
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Writes 64-byte messages (each starting with report ID 0x03) to the device.
 * The HID descriptor declares 64 data bytes after the report ID, so each message is padded to 65.
 */
export async function writeMessages(
  messages: Uint8Array[],
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  const { iface, status } = findConfigInterface()
  if (!iface?.path) {
    throw new Error(status.state === 'unsupported' ? status.message : 'Keyboard not connected. Plug it in with USB.')
  }
  const dev = await HID.HIDAsync.open(iface.path)
  try {
    for (let i = 0; i < messages.length; i++) {
      const buf = Buffer.alloc(REPORT_SIZE + 1)
      Buffer.from(messages[i]).copy(buf)
      await dev.write(buf)
      await sleep(4)
      if (i % 8 === 0 || i === messages.length - 1) onProgress?.(i + 1, messages.length)
    }
  } finally {
    await dev.close()
  }
}
