import HID from 'node-hid'
import { FAMILY_VENDOR_IDS, REPORT_SIZE, protocolFor } from '../shared/protocol'
import type { Protocol } from '../shared/types'

export type DeviceStatus =
  | { state: 'connected'; vendorId: number; productId: number; protocol: Protocol }
  | { state: 'unsupported'; vendorId: number; productId: number; message: string }
  | { state: 'missing' }

/** Vendor-defined usage pages (0xFF00–0xFFFF) carry the configuration channel. */
const isVendorPage = (d: HID.Device) => (d.usagePage ?? 0) >= 0xff00

const hex = (n: number) => n.toString(16).padStart(4, '0')

function findConfigInterface(): { iface?: HID.Device; status: DeviceStatus } {
  const family = HID.devices().filter((d) => FAMILY_VENDOR_IDS.includes(d.vendorId))
  if (family.length === 0) return { status: { state: 'missing' } }

  // Prefer a device we know the protocol for.
  for (const d of family) {
    const protocol = protocolFor(d.vendorId, d.productId)
    if (!protocol) continue
    const iface = family.find((x) => x.vendorId === d.vendorId && x.productId === d.productId && isVendorPage(x))
    if (!iface?.path) {
      return {
        status: {
          state: 'unsupported',
          vendorId: d.vendorId,
          productId: d.productId,
          message: `Found ${hex(d.vendorId)}:${hex(d.productId)} but not its configuration interface. Is it connected by USB cable?`
        }
      }
    }
    return { iface, status: { state: 'connected', vendorId: d.vendorId, productId: d.productId, protocol } }
  }

  const d = family[0]
  return {
    status: {
      state: 'unsupported',
      vendorId: d.vendorId,
      productId: d.productId,
      message: `Keyboard ${hex(d.vendorId)}:${hex(d.productId)} isn't supported yet.`
    }
  }
}

export function deviceStatus(): DeviceStatus {
  return findConfigInterface().status
}

/** Protocol of the connected keyboard, or an error explaining why we can't write to it. */
export function connectedProtocol(): Protocol {
  const { status } = findConfigInterface()
  if (status.state === 'connected') return status.protocol
  throw new Error(status.state === 'unsupported' ? status.message : 'Keyboard not connected. Plug it in with a USB cable.')
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
    throw new Error(status.state === 'unsupported' ? status.message : 'Keyboard not connected. Plug it in with a USB cable.')
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
