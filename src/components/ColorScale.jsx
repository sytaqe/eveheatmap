// SPDX-License-Identifier: CC0-1.0
// This file is released into the public domain under the CC0 1.0 Universal license.
import { logScaleToKills, MAX_COUNTS, MAX_COUNTS_HIGH } from '../utils/colorScale'

const TICKS = [0, 25, 50, 75, 100]

const btnStyle = (active) => ({
  padding: '2px 10px',
  fontSize: 11,
  border: '1px solid #2a3a5a',
  borderRadius: 3,
  cursor: 'pointer',
  background: active ? '#1e3a6a' : 'transparent',
  color: active ? '#aaccff' : '#556',
})

export default function ColorScale({ killMode = 'player', onModeChange, loginButton, tracking = false, onTrackingChange, canTrack = false }) {
  const lo = MAX_COUNTS[killMode] ?? 50
  const hi = MAX_COUNTS_HIGH[killMode] ?? 500
  const mid = Math.log1p(lo) / Math.log1p(hi) * 100

  const stops = []
  for (let i = 0; i <= 100; i++) {
    const t = i / 100
    const tmid = mid / 100
    let r, g, b
    if (t <= tmid) {
      const u = tmid > 0 ? t / tmid : 0
      r = Math.round(u * 220)
      g = Math.round(50 - u * 20)
      b = Math.round(180 - u * 150)
    } else {
      const u = (t - tmid) / (1 - tmid)
      r = Math.round(220 + u * 35)
      g = Math.round(30 + u * 225)
      b = Math.round(30 + u * 225)
    }
    stops.push(`rgb(${r},${g},${b}) ${i}%`)
  }
  const gradient = `linear-gradient(to right, ${stops.join(', ')})`

  return (
    <div style={{
      padding: '6px 16px 4px',
      background: '#0d0d1a',
      borderBottom: '1px solid #1e2a3a',
      fontSize: 11,
      color: '#99aacc',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 3 }}>
        <div style={{ display: 'flex', gap: 4, whiteSpace: 'nowrap' }}>
          <button style={btnStyle(killMode === 'player')} onClick={() => onModeChange('player')}>Ship+Pod</button>
          <button style={btnStyle(killMode === 'npc')} onClick={() => onModeChange('npc')}>NPC</button>
          <button style={btnStyle(killMode === 'jumps')} onClick={() => onModeChange('jumps')}>Jumps</button>
        </div>
        {(loginButton || canTrack) && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            {canTrack && (
              <button
                style={btnStyle(tracking)}
                onClick={() => onTrackingChange?.(!tracking)}
              >
                Track
              </button>
            )}
            {loginButton}
          </div>
        )}
        <div style={{ position: 'relative', flex: 1 }}>
          <div style={{ height: 12, borderRadius: 2, background: gradient }} />
          {/* tick marks */}
          <div style={{ position: 'relative', height: 14, marginTop: 2 }}>
            {TICKS.map(pct => (
              <div key={pct} style={{
                position: 'absolute',
                left: `${pct}%`,
                transform: 'translateX(-50%)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 1,
              }}>
                <div style={{ width: 1, height: 4, background: '#556' }} />
                <span style={{ fontSize: 10, color: '#778', whiteSpace: 'nowrap' }}>
                  {logScaleToKills(pct, killMode)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
