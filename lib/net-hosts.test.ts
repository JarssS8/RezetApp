import { describe, expect, it } from 'vitest'
import { ipv4MappedToDotted, isLanOrLoopbackHost, isPrivateOrReservedHost, isReservedIPv4, stripIPv6Brackets } from './net-hosts'

describe('stripIPv6Brackets', () => {
  it('quita los corchetes de un host IPv6, deja intacto cualquier otro', () => {
    expect(stripIPv6Brackets('[::1]')).toBe('::1')
    expect(stripIPv6Brackets('localhost')).toBe('localhost')
  })
})

describe('ipv4MappedToDotted', () => {
  it('convierte una IPv4-mapped a su forma decimal', () => {
    expect(ipv4MappedToDotted('::ffff:7f00:1')).toBe('127.0.0.1')
    expect(ipv4MappedToDotted('::ffff:c0a8:114')).toBe('192.168.1.20')
  })
  it('devuelve null si no es IPv4-mapped', () => {
    expect(ipv4MappedToDotted('::1')).toBeNull()
    expect(ipv4MappedToDotted('127.0.0.1')).toBeNull()
  })
})

describe('isReservedIPv4', () => {
  it('loopback, LAN, link-local y 0.0.0.0 son reservados', () => {
    for (const ip of ['127.0.0.1', '127.55.66.77', '10.1.2.3', '172.20.5.6', '192.168.0.5', '169.254.1.1', '0.0.0.0']) {
      expect(isReservedIPv4(ip), ip).toBe(true)
    }
  })
  it('una IP pública no es reservada', () => {
    expect(isReservedIPv4('8.8.8.8')).toBe(false)
  })
})

describe('isLanOrLoopbackHost', () => {
  it('acepta localhost, 127.0.0.1, ::1, host.docker.internal y rangos LAN', () => {
    for (const h of ['localhost', '127.0.0.1', '::1', 'host.docker.internal', '10.1.2.3', '172.20.5.6', '192.168.0.5']) {
      expect(isLanOrLoopbackHost(h), h).toBe(true)
    }
  })
  it('rechaza link-local, 0.0.0.0 y un host público (no es "LAN o loopback")', () => {
    for (const h of ['169.254.169.254', '0.0.0.0', 'example.com', '8.8.8.8']) {
      expect(isLanOrLoopbackHost(h), h).toBe(false)
    }
  })
  it('resuelve IPv4-mapped-a-IPv6 (forma hexadecimal, la que produce new URL())', () => {
    expect(isLanOrLoopbackHost('::ffff:7f00:1')).toBe(true) // 127.0.0.1
    expect(isLanOrLoopbackHost('::ffff:c0a8:114')).toBe(true) // 192.168.1.20
    expect(isLanOrLoopbackHost('::ffff:a9fe:101')).toBe(false) // 169.254.1.1
  })
})

describe('isPrivateOrReservedHost', () => {
  it('bloquea nombres reservados, loopback, LAN, link-local v4/v6, ULA v6 e IPv4-mapped', () => {
    const blocked = [
      'localhost', 'sub.local', '127.0.0.1', '127.55.66.77', '::1', '10.1.2.3', '172.20.5.6', '192.168.0.5',
      '169.254.1.1', 'fe80::1', 'fc00::1', 'fd12:3456::1', '::ffff:7f00:1', '::ffff:c0a8:105', '0.0.0.0',
      'localhost.', 'LOCALHOST.', 'sub.local.',
    ]
    for (const h of blocked) expect(isPrivateOrReservedHost(h), h).toBe(true)
  })
  it('no bloquea un host público, incluida una IPv6 literal', () => {
    expect(isPrivateOrReservedHost('example.com')).toBe(false)
    expect(isPrivateOrReservedHost('example.com.')).toBe(false)
    expect(isPrivateOrReservedHost('2001:4860:4860::8888')).toBe(false)
  })
})
