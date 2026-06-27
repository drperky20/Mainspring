import { lookup } from 'node:dns/promises'
import net from 'node:net'

const PRIVATE_HOST_PATTERNS = [
  /(^|\.)localhost$/i,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^::1$/i,
  /^::$/i,
  /^fc[0-9a-f]{2}:/i,
  /^fd[0-9a-f]{2}:/i,
  /^fe8[0-9a-f]:/i,
  /^fe9[0-9a-f]:/i,
  /^fea[0-9a-f]:/i,
  /^feb[0-9a-f]:/i,
]

function isPrivateHostname(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  return PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(normalized))
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map((part) => Number.parseInt(part, 10))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false
  const [first, second] = parts
  if (first === 10 || first === 127 || first === 0) return true
  if (first === 169 && second === 254) return true
  if (first === 192 && second === 168) return true
  return first === 172 && second >= 16 && second <= 31
}

function isPrivateIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase()
  if (normalized === '::1' || normalized === '::') return true
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true
  if (normalized.startsWith('fe8') || normalized.startsWith('fe9')) return true
  if (normalized.startsWith('fea') || normalized.startsWith('feb')) return true
  if (normalized.startsWith('::ffff:')) {
    return isPrivateIp(normalized.slice('::ffff:'.length))
  }
  return false
}

export function isPrivateIp(ip: string): boolean {
  const family = net.isIP(ip)
  if (family === 4) return isPrivateIpv4(ip)
  if (family === 6) return isPrivateIpv6(ip)
  return false
}

export function parsePublicHttpUrl(value: string, label = 'url'): URL {
  const trimmed = value.trim()
  if (!trimmed) throw new Error(`${label} must be a non-empty string.`)
  const url = new URL(trimmed)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${label} only supports http and https URLs.`)
  }
  if (isPrivateHostname(url.hostname) || isPrivateIp(url.hostname)) {
    throw new Error(`${label} cannot target private or local network hosts.`)
  }
  url.username = ''
  url.password = ''
  url.hash = ''
  return url
}

export async function assertPublicNetworkTarget(url: URL): Promise<void> {
  if (isPrivateHostname(url.hostname) || isPrivateIp(url.hostname)) {
    throw new Error('Private or local network targets are not allowed.')
  }

  if (net.isIP(url.hostname)) return

  const addresses = await lookup(url.hostname, { all: true, verbatim: true })
  if (addresses.length === 0) {
    throw new Error(`Unable to resolve network target ${url.hostname}.`)
  }

  for (const address of addresses) {
    if (isPrivateIp(address.address)) {
      throw new Error(`Resolved private network target ${url.hostname}.`)
    }
  }
}
