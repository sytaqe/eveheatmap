// SPDX-License-Identifier: CC0-1.0
// This file is released into the public domain under the CC0 1.0 Universal license.
// Stage 1 upper bound → red
export const MAX_COUNTS = {
  player: 50,
  npc:    1000,
  jumps:  500,
}

// Stage 2 upper bound → white
export const MAX_COUNTS_HIGH = {
  player: 500,
  npc:    10000,
  jumps:  5000,
}

// Blue(0) → Red(stage1) → White(stage2) on a log scale
export function killCountToColor(count, mode = 'player') {
  const lo = MAX_COUNTS[mode] ?? 50
  const hi = MAX_COUNTS_HIGH[mode] ?? 500
  if (count <= 0) return '#1a3a5c'

  const clamped = Math.min(count, hi)
  const t = Math.log1p(clamped) / Math.log1p(hi)
  const mid = Math.log1p(lo) / Math.log1p(hi)

  let r, g, b
  if (t <= mid) {
    const u = t / mid
    r = Math.round(u * 220)
    g = Math.round(50 - u * 20)
    b = Math.round(180 - u * 150)
  } else {
    const u = (t - mid) / (1 - mid)
    r = Math.round(220 + u * 35)
    g = Math.round(30 + u * 225)
    b = Math.round(30 + u * 225)
  }
  return `rgb(${r},${g},${b})`
}

// Convert 0–100% position on the log scale back to a count (for tick labels)
// Uses MAX_COUNTS_HIGH as the full scale
export function logScaleToKills(pct, mode = 'player') {
  const hi = MAX_COUNTS_HIGH[mode] ?? 500
  const t = pct / 100
  return Math.round(Math.expm1(t * Math.log1p(hi)))
}
