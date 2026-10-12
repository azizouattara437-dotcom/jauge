export type Limit = { kind: string; percentUsed: number; resetsAt?: string }
export type Snapshot = {
  context: { tokens?: number; window: number; percent?: number }
  rateLimits: Limit[]
  cost?: { usd: number }
}

declare module 'claude-code' {
  interface PluginState {
    jauge: { snapshot: Snapshot | null; now: number; enabled: boolean }
  }
}
