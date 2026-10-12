import { test, expect } from 'claude-code/testing'
import { formatLine } from '../hooks/register.tsx'

test('ligne complète comme la capture', () => {
  const now = Date.parse('2026-10-12T10:00:00Z')
  const line = formatLine(
    {
      context: { tokens: 98_000, window: 1_000_000, percent: 10 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: 18, resetsAt: '2026-10-12T11:18:00Z' },
        { kind: 'seven_day', percentUsed: 47 },
      ],
      cost: { usd: 0.37 },
    },
    now,
  )
  expect(line).toBe('Contexte 98 k / 1,0 M (10 %) · 5 h : 1 h 18 restantes · 18 % · 7 j 47 % · ≈ 0,37 $ (prix API)')
})

test('avant la première réponse, sans limites ni coût', () => {
  expect(formatLine({ context: { window: 200_000 }, rateLimits: [] }, 0)).toBe('Contexte — / 200 k')
})
