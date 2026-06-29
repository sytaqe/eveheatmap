// SPDX-License-Identifier: CC0-1.0
// This file is released into the public domain under the CC0 1.0 Universal license.
export default function TimeSlider({
  snapshots,
  selectedIndex,
  onChange,
  mode,
  onModeChange,
  selectedHour,
  onHourChange,
}) {
  if (!snapshots.length) return null

  const label = snapshots[selectedIndex]
    ? new Date(snapshots[selectedIndex].timestamp).toLocaleString('en-GB', { timeZone: 'UTC', hour12: false })
    : '—'

  return (
    <div style={{
      padding: '8px 16px',
      background: '#0d0d1a',
      borderTop: '1px solid #1e2a3a',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
    }}>
      {/* Mode toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
        <span style={{ fontSize: 11, color: mode === 'snapshot' ? '#99aacc' : '#445' }}>Snapshot</span>
        <div
          onClick={() => onModeChange(mode === 'snapshot' ? 'hourly' : 'snapshot')}
          style={{
            width: 36,
            height: 18,
            borderRadius: 9,
            background: mode === 'hourly' ? '#3a6fcc' : '#223',
            position: 'relative',
            cursor: 'pointer',
            border: '1px solid #334',
            flexShrink: 0,
          }}
        >
          <div style={{
            position: 'absolute',
            top: 2,
            left: mode === 'hourly' ? 18 : 2,
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: '#cde',
            transition: 'left 0.15s',
          }} />
        </div>
        <span style={{ fontSize: 11, color: mode === 'hourly' ? '#99aacc' : '#445' }}>Hourly Avg</span>
      </div>

      {mode === 'snapshot' ? (
        <>
          <span style={{ fontSize: 12, color: '#556', whiteSpace: 'nowrap' }}>Time</span>
          <input
            type="range"
            min={0}
            max={snapshots.length - 1}
            value={selectedIndex}
            onChange={e => onChange(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <span style={{ fontSize: 12, color: '#99aacc', whiteSpace: 'nowrap', minWidth: 140 }}>
            {label}
          </span>
        </>
      ) : (
        <>
          <span style={{ fontSize: 12, color: '#556', whiteSpace: 'nowrap' }}>Hour</span>
          <input
            type="range"
            min={0}
            max={23}
            value={selectedHour}
            onChange={e => onHourChange(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <span style={{ fontSize: 12, color: '#99aacc', whiteSpace: 'nowrap', minWidth: 60 }}>
            {String(selectedHour).padStart(2, '0')}:00 UTC avg
          </span>
        </>
      )}
    </div>
  )
}
