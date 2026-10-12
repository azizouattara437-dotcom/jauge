import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Snapshot } from '../types'

const snapshot = atom({ plugin: 'jauge', key: 'snapshot' } as const, null)
const clockNow = atom({ plugin: 'jauge', key: 'now' } as const, 0)
const enabled = atom({ plugin: 'jauge', key: 'enabled' } as const, true)
const STORE_KEY = 'enabled'

const fmtTokens = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1).replace('.', ',')} M`
    : `${Math.round(n / 1000)} k`

const fmtPct = (p: number) => `${Math.round(p)} %`

const fmtLeft = (resetsAt: string | undefined, now: number) => {
  if (!resetsAt) return undefined
  const ms = Date.parse(resetsAt) - now
  if (!Number.isFinite(ms) || ms <= 0) return undefined
  const min = Math.floor(ms / 60_000)
  const d = Math.floor(min / 1440)
  const h = Math.floor((min % 1440) / 60)
  const m = min % 60
  if (d > 0) return `${d} j ${h} h`
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`
}

export type Parts = { context: string; contextPct: number; limits?: string; cost?: string }

export const parts = (u: Snapshot, now: number): Parts => {
  const { tokens, window, percent } = u.context
  const pct = percent ?? (tokens === undefined ? 0 : (tokens / window) * 100)
  const context =
    tokens === undefined
      ? `Contexte — / ${fmtTokens(window)}`
      : `Contexte ${fmtTokens(tokens)} / ${fmtTokens(window)} (${fmtPct(pct)})`
  const limits: string[] = []
  const five = u.rateLimits.find(l => l.kind === 'five_hour')
  if (five) {
    const left = fmtLeft(five.resetsAt, now)
    limits.push(left ? `5 h : ${left} restantes · ${fmtPct(five.percentUsed)}` : `5 h ${fmtPct(five.percentUsed)}`)
  }
  const week = u.rateLimits.find(l => l.kind === 'seven_day')
  if (week) limits.push(`7 j ${fmtPct(week.percentUsed)}`)
  const spend = u.rateLimits.find(l => l.kind === 'spend_limit')
  if (spend) limits.push(`plafond ${fmtPct(spend.percentUsed)}`)
  return {
    context,
    contextPct: pct,
    limits: limits.length ? limits.join(' · ') : undefined,
    cost: u.cost ? `≈ ${u.cost.usd.toFixed(2).replace('.', ',')} $ (prix API)` : undefined,
  }
}

export const formatLine = (u: Snapshot, now: number): string => {
  const p = parts(u, now)
  return [p.context, p.limits, p.cost].filter(Boolean).join(' · ')
}

const contextColor = (pct: number) => (pct >= 80 ? 'error' : pct >= 50 ? 'warning' : 'success')

let tick: { cancel: () => void } | undefined

async function refresh($: EngineInterface) {
  const u = await $.session.usage()
  await update($, snapshot, () => u)
  await update($, clockNow, () => Date.now())
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    try {
      await $.command.register({ name: 'jauge', description: 'Active ou désactive la jauge sur toutes les sessions' })
    } catch {}
    try {
      const saved = await $.store.get(STORE_KEY)
      await update($, enabled, () => saved !== false)
    } catch {}
    try {
      await refresh($)
    } catch {}
    tick?.cancel()
    tick = $.clock.every(60_000, async () => {
      const now = await $.clock.now()
      await update($, clockNow, () => now)
    })
    return r
  })

  on('session.measure', async ($, e, next) => {
    await update($, snapshot, () => ({ context: e.context, rateLimits: e.rateLimits, cost: e.cost }))
    const now = await $.clock.now()
    await update($, clockNow, () => now)
    return next(e)
  })

  on('command.run', { command: 'jauge' }, async $ => {
    const isOn = !(await read($, enabled))
    await $.store.set(STORE_KEY, isOn)
    await update($, enabled, () => isOn)
    if (isOn) await refresh($)
    return { text: isOn ? 'Jauge activée sur toutes les sessions.' : 'Jauge désactivée sur toutes les sessions.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const u = await read($, snapshot)
    if (e.props.hasSurvey || !u || !(await read($, enabled))) return next(e)
    const p = parts(u, (await read($, clockNow)) || (await $.clock.now()))
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box>
        <Text color={contextColor(p.contextPct)}>{p.context}</Text>
        {p.limits ? <Text bold> · {p.limits}</Text> : null}
        {p.cost ? <Text dimColor> · {p.cost}</Text> : null}
      </Box>
    )
  })
}
