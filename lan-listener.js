import { createServer, Server } from 'node:http'
import { BlockList, isIPv4 } from 'node:net'
import { networkInterfaces } from 'node:os'

export function isLoopback(address) {
  if (typeof address !== 'string') return false
  const ipv4 = address.replace(/^::ffff:/i, '')
  return address === '::1' || (isIPv4(ipv4) && ipv4.startsWith('127.'))
}

function isPrivate(address) {
  const [first, second] = address.split('.').map(Number)
  return first === 10 || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
}

export function lanAddresses() {
  const addresses = new Map()
  for (const [name, records] of Object.entries(networkInterfaces())) {
    for (const record of records ?? []) {
      if (record.internal || record.family !== 'IPv4' || !isPrivate(record.address) || !record.cidr) continue
      const prefix = Number(record.cidr.split('/')[1])
      if (!Number.isInteger(prefix) || prefix < 1 || prefix > 32) continue
      addresses.set(record.address, { name, address: record.address, prefix })
    }
  }
  return [...addresses.values()]
}

function isAllowedRequest(request, authority) {
  if (request.headersDistinct.host?.length !== 1 || request.headers.host !== authority) return false
  const origin = `http://${authority}`
  if (request.headers.origin !== undefined && request.headers.origin !== origin) return false
  if (!request.url?.startsWith('/') || request.url.startsWith('//')) return false
  return new URL(request.url, origin).origin === origin
}

export function createLanListener({ address, prefix, port, upstream, isActive }) {
  if (!(upstream instanceof Server) || upstream.listenerCount('request') !== 1) {
    throw new Error('当前 DSH 版本的 Web 服务与插件不兼容。')
  }

  const authority = `${address}:${port}`
  const subnet = new BlockList()
  subnet.addSubnet(address, prefix, 'ipv4')
  const sockets = new Set()
  const server = createServer((request, response) => {
    if (isActive() && isAllowedRequest(request, authority)) {
      upstream.emit('request', request, response)
    } else {
      response.writeHead(403, { 'Cache-Control': 'no-store' }).end()
    }
  })
  server.prependListener('connection', socket => {
    const peer = socket.remoteAddress
    if (!isActive() || !isIPv4(peer) || !isPrivate(peer) || !subnet.check(peer, 'ipv4')) {
      socket.destroy()
      return
    }
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
  })
  server.on('upgrade', (request, socket, head) => {
    if (!isActive() || !isAllowedRequest(request, authority)
      || !upstream.emit('upgrade', request, socket, head)) socket.destroy()
  })
  server.on('connect', (_request, socket) => socket.destroy())

  return {
    authority,
    async listen() {
      await new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen({ host: address, port, exclusive: true }, () => {
          server.off('error', reject)
          resolve()
        })
      })
    },
    async close() {
      const closed = new Promise(resolve => server.close(() => resolve()))
      for (const socket of sockets) socket.destroy()
      await closed
    },
    onError(handler) {
      server.on('error', handler)
    },
  }
}
