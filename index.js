import { createLanListener, isLoopback, lanAddresses } from './lan-listener.js'

export const name = 'lan-access'
export const inject = ['webServer', 'webApp', 'connection', 'connection.authentication']

const route = '/_dsh-lan-access'

function json(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  }).end(JSON.stringify(body))
}

function isLocalControl(request, port) {
  const host = request.headers.host
  const localHosts = [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`]
  return request.headersDistinct.host?.length === 1 && localHosts.includes(host)
    && isLoopback(request.socket.localAddress) && isLoopback(request.socket.remoteAddress)
}

export function apply(ctx) {
  const { webServer, webApp, connection } = ctx
  let active
  let queue = Promise.resolve()
  let disposed = false

  function status() {
    return { enabled: !!active, url: active?.url ?? null, address: active?.address ?? null, addresses: lanAddresses() }
  }

  function enqueue(action) {
    const result = queue.then(action)
    queue = result.catch(() => {})
    return result
  }

  async function stop() {
    const previous = active
    if (!previous) return
    active = undefined
    try {
      previous.restore()
    } finally {
      await previous.listener.close()
    }
  }

  async function start(address) {
    if (disposed) throw new Error('插件已卸载。')
    if (active) return
    const candidate = lanAddresses().find(item => item.address === address)
    if (!candidate) throw new Error('找不到所选局域网地址，请检查网络后再试。')

    // This Web profile is owned by the local launcher. Keep its loopback listener
    // and use the same DSH HTTP handlers, source checks, and credentials on the LAN.
    const getAdvertisedUrl = webApp.getAdvertisedUrl
    const originalUrl = new URL(getAdvertisedUrl.call(webApp))
    const originalHost = originalUrl.hostname.replace(/^\[|\]$/g, '')
    const trustedHosts = connection.trustedHosts
    if (webServer.protocol !== 'http:' || !isLoopback(webServer.host)
      || !isLoopback(originalHost) || !Number.isInteger(webServer.port) || !Array.isArray(trustedHosts)) {
      throw new Error('插件需要使用 DSH 0.2.3-alpha.2 的本机 Web 服务。')
    }

    // DSH 0.2.3-alpha.2 does not expose a second HTTP listener or a public
    // runtime trust-list setter. These two integrations are version-specific.
    const listener = createLanListener({
      ...candidate, port: webServer.port, upstream: webServer.server,
      isActive: () => active?.listener === listener,
    })
    const url = `http://${listener.authority}/`
    const advertiseLan = () => url
    const addAuthority = !trustedHosts.includes(listener.authority)
    let added = false

    function restore() {
      if (webApp.getAdvertisedUrl === advertiseLan) webApp.getAdvertisedUrl = getAdvertisedUrl
      if (added) {
        const index = trustedHosts.indexOf(listener.authority)
        if (index !== -1) trustedHosts.splice(index, 1)
      }
    }

    try {
      await listener.listen()
      listener.onError(() => { void enqueue(stop) })
      if (disposed) throw new Error('插件已卸载。')
      if (addAuthority) {
        trustedHosts.push(listener.authority)
        added = true
      }
      const trusted = connection.isTrustedRequest({ headers: { host: listener.authority }, method: 'GET', url, transport: 'http' })
      if (!trusted) throw new Error('DSH 未接受所选局域网地址。')
      webApp.getAdvertisedUrl = advertiseLan
      active = { address, url, listener, restore }
    } catch (error) {
      try {
        restore()
      } finally {
        await listener.close()
      }
      if (error.code === 'EADDRINUSE') throw new Error('此局域网地址上的 DSH 端口已被占用。')
      if (error.code === 'EACCES') throw new Error('系统拒绝监听该局域网端口。')
      throw error
    }
  }

  ctx.effect(() => {
    const unregister = webServer.register({
      kind: 'exact', path: route, auth: 'required',
      async handler(request, response, peer) {
        if (peer?.principal.kind !== 'owner' || !isLocalControl(request, webServer.port)) {
          json(response, 403, { error: '请在主机的本机 DSH 页面操作。' })
          return
        }
        if (request.method === 'GET') {
          json(response, 200, status())
          return
        }
        if (request.method !== 'POST') {
          json(response, 405, { error: '不支持的请求。' })
          return
        }
        const requested = request.headers['x-dsh-lan-enabled']
        if (request.headers.origin !== `http://${request.headers.host}` || !['on', 'off'].includes(requested)) {
          json(response, 403, { error: '请求来源无效。' })
          return
        }
        try {
          await enqueue(() => requested === 'on' ? start(request.headers['x-dsh-lan-address']) : stop())
          json(response, 200, status())
        } catch (error) {
          json(response, 409, { error: error instanceof Error ? error.message : '无法切换局域网访问。' })
        }
      },
    })
    return async () => {
      disposed = true
      unregister()
      await enqueue(stop)
    }
  }, 'lan-access: local control and listener')
}
