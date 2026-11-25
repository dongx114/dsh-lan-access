window.__ModuleLoader__.load({
  id: 'dsh-lan-access',
  factory(require) {
    const { createElement: h, useEffect, useState } = require('react')
    const controlPath = '/_dsh-lan-access'

    async function control(options) {
      const response = await fetch(controlPath, { cache: 'no-store', ...options })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? '无法读取局域网访问状态。')
      return result
    }

    function LanAccess({ reload, reloadLink }) {
      const [state, setState] = useState(null)
      const [address, setAddress] = useState('')
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState('')
      const enabled = state?.enabled ?? false

      useEffect(() => {
        const controller = new AbortController()
        control({ signal: controller.signal }).then(result => {
          setState(result)
          setAddress(result.address ?? result.addresses[0]?.address ?? '')
        }).catch(() => {
          if (!controller.signal.aborted) setError('无法读取开关状态，请重开设置页。')
        })
        return () => controller.abort()
      }, [])

      async function toggle() {
        setBusy(true)
        setError('')
        try {
          const result = await control({
            method: 'POST',
            headers: {
              'X-DSH-Lan-Enabled': enabled ? 'off' : 'on',
              'X-DSH-Lan-Address': address,
            },
          })
          setState(result)
          setAddress(result.address ?? result.addresses.find(item => item.address === address)?.address
            ?? result.addresses[0]?.address ?? '')
          reload()
          reloadLink()
        } catch (reason) {
          setError(reason.message || '切换失败，请重试。')
        } finally {
          setBusy(false)
        }
      }

      return h('section', { style: {
        border: '1px solid var(--dsw-alias-border-primary, #80808055)',
        borderRadius: 'var(--dsw-radius-xl, 16px)', padding: '18px 20px',
        display: 'flex', flexDirection: 'column', gap: '10px',
      } },
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' } },
        h('h3', { style: { margin: 0, fontSize: '16px', fontWeight: 500 } }, '局域网访问'),
        h('button', {
          type: 'button', role: 'switch', 'aria-label': '局域网访问', 'aria-checked': enabled,
          disabled: busy || !state || (!enabled && !address), onClick: toggle,
          style: {
            position: 'relative', width: '42px', height: '24px', flexShrink: 0, padding: 0,
            border: '1px solid var(--dsw-alias-border-primary, #80808066)', borderRadius: '999px',
            background: enabled ? 'var(--dsw-alias-interactive-primary, #4d6bfe)' : '#80808055',
            cursor: busy || !state || (!enabled && !address) ? 'default' : 'pointer',
          },
        }, h('span', { 'aria-hidden': true, style: {
          position: 'absolute', width: '16px', height: '16px', top: '3px',
          left: enabled ? '21px' : '3px', borderRadius: '50%', background: '#fff',
        } }))),
      !enabled && state?.addresses.length > 1 && h('label', null, '网卡 ',
        h('select', { value: address, disabled: busy, onChange: event => setAddress(event.target.value) },
          state.addresses.map(item => h('option', { key: item.address, value: item.address }, `${item.name} · ${item.address}`)))),
      enabled && h('code', { style: { overflowWrap: 'anywhere' } }, state.url),
      h('p', { style: { margin: 0, fontSize: '13px', color: 'var(--dsw-alias-label-secondary)' } },
        state && !address ? '未检测到可用的局域网 IPv4 地址。'
          : enabled ? '同一网段的设备可用上方登录链接或配对。请在可信网络中使用。'
            : '开启后，同一网段的设备可登录此 DSH。'),
      error && h('p', { role: 'alert', style: { margin: 0, color: 'var(--dsw-alias-state-error-primary, #e25362)' } }, error))
    }

    function LocalSettings(props) {
      const localHosts = ['127.0.0.1', 'localhost', '[::1]']
      return localHosts.includes(location.hostname) ? h(LanAccess, props) : null
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const name = 'settings.remoteConnection.extensions'
        ctx.slots.inject(name, () => ctx.slots.register({ name, id: 'dsh-lan-access', order: 100 }, LocalSettings))
      },
    }
  },
})
