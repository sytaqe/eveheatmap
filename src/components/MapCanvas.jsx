// SPDX-License-Identifier: CC0-1.0
// This file is released into the public domain under the CC0 1.0 Universal license.
import { useMemo, useState, useRef, useEffect, useCallback } from 'react'
import { killCountToColor, MAX_COUNTS, MAX_COUNTS_HIGH } from '../utils/colorScale'

const SYSTEM_RADIUS = 2
const MIN_ZOOM = 0.05
const MAX_ZOOM = 20

export default function MapCanvas({ systems, stargates, killData, killMode = 'player', regions = {}, highlightSystemId = null, tracking = false, onUserInteract, focusTarget = null }) {
  const containerRef = useRef(null)
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 })
  const dragging = useRef(false)
  const dragStart = useRef(null)
  const [hovered, setHovered] = useState(null) // { _key, kills, r, px, py }

  const { projected, links, bounds, regionLabels = [] } = useMemo(() => {
    if (!systems.length) return { projected: [], links: [], bounds: null }

    const filtered = systems.filter(s => s.position2D)
    const coords = filtered.map(s => ({ x: s.position2D.x, y: s.position2D.y }))
    const xs = coords.map(c => c.x)
    const ys = coords.map(c => c.y)
    const minX = xs.reduce((a, b) => a < b ? a : b)
    const maxX = xs.reduce((a, b) => a > b ? a : b)
    const minY = ys.reduce((a, b) => a < b ? a : b)
    const maxY = ys.reduce((a, b) => a > b ? a : b)

    const W = 900, H = 800
    const scale = Math.min(W / (maxX - minX || 1), H / (maxY - minY || 1))

    const sysMap = new Map()
    const projected = filtered.map((s, i) => {
      const px = (coords[i].x - minX) * scale
      const py = (maxY - coords[i].y) * scale
      sysMap.set(s._key, { px, py })
      return { ...s, px, py }
    })

    const links = stargates
      .map(sg => {
        const from = sysMap.get(sg.solarSystemID)
        const to = sysMap.get(sg.destination.solarSystemID)
        if (!from || !to) return null
        return { x1: from.px, y1: from.py, x2: to.px, y2: to.py }
      })
      .filter(Boolean)

    // Compute region label positions (centroid of member systems)
    const regionAccum = new Map()
    projected.forEach(s => {
      if (!s.regionID) return
      const acc = regionAccum.get(s.regionID) ?? { sx: 0, sy: 0, n: 0 }
      acc.sx += s.px; acc.sy += s.py; acc.n++
      regionAccum.set(s.regionID, acc)
    })
    const regionLabels = Array.from(regionAccum.entries()).map(([id, acc]) => ({
      id, px: acc.sx / acc.n, py: acc.sy / acc.n,
    }))

    return { projected, links, bounds: { W, H }, regionLabels }
  }, [systems, stargates])


  // Focus on a specific system at max zoom (triggered from ranking panel)
  useEffect(() => {
    if (!focusTarget || !projected.length || !containerRef.current) return
    const sys = projected.find(s => String(s._key) === String(focusTarget.systemId))
    if (!sys) return
    const { clientWidth: vw, clientHeight: vh } = containerRef.current
    setTransform({ k: MAX_ZOOM, x: vw / 2 - sys.px * MAX_ZOOM, y: vh / 2 - sys.py * MAX_ZOOM })
  }, [focusTarget, projected])

  // Track character position at max zoom
  useEffect(() => {
    if (!tracking || !highlightSystemId || !projected.length || !containerRef.current) return
    const sys = projected.find(s => s._key === highlightSystemId)
    if (!sys) return
    const { clientWidth: vw, clientHeight: vh } = containerRef.current
    setTransform({ k: MAX_ZOOM, x: vw / 2 - sys.px * MAX_ZOOM, y: vh / 2 - sys.py * MAX_ZOOM })
  }, [tracking, highlightSystemId, projected])

  // Center map after data loads
  useEffect(() => {
    if (!bounds || !containerRef.current) return
    const { clientWidth: vw, clientHeight: vh } = containerRef.current
    setTransform({ x: (vw - bounds.W) / 2, y: (vh - bounds.H) / 2, k: 1 })
  }, [bounds])

  // Wheel zoom
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e) => {
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
      const rect = el.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      setTransform(t => {
        const newK = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, t.k * factor))
        if (newK < 12) onUserInteract?.()
        return {
          k: newK,
          x: mx - (mx - t.x) * (newK / t.k),
          y: my - (my - t.y) * (newK / t.k),
        }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Mouse drag
  const onMouseDown = (e) => {
    onUserInteract?.()
    dragging.current = true
    dragStart.current = { x: e.clientX - transform.x, y: e.clientY - transform.y }
  }
  const onMouseMove = (e) => {
    if (!dragging.current) return
    setTransform(t => ({
      ...t,
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y,
    }))
  }
  const onMouseUp = () => { dragging.current = false }

  const { k, x, y } = transform

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, overflow: 'hidden', cursor: dragging.current ? 'grabbing' : 'grab', position: 'relative' }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      {!systems.length && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#556' }}>
          Loading SDE data...
        </div>
      )}
      <svg width="100%" height="100%">
        <g transform={`translate(${x},${y}) scale(${k})`}>
          {links.map((l, i) => (
            <line
              key={i}
              x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
              stroke="#1e2a3a"
              strokeWidth={0.5 / k}
            />
          ))}
          {projected.map(s => {
            const kd = killData?.[s._key]
            const kills = kd ? (killMode === 'npc' ? (kd.n ?? 0) : killMode === 'jumps' ? (kd.j ?? 0) : (kd.s ?? 0) + (kd.p ?? 0)) : 0
            const color = killCountToColor(kills, killMode)
            const lo = MAX_COUNTS[killMode] ?? 0
            const hi = MAX_COUNTS_HIGH[killMode] ?? lo
            const radiusScale = kills <= lo ? 1
              : kills >= hi ? 2
              : 1 + Math.log1p(kills - lo) / Math.log1p(hi - lo)
            const r = SYSTEM_RADIUS * radiusScale * (1 + 2 * (k - 1) / (MAX_ZOOM - 1)) / k
            return (
              <g key={s._key}>
                <circle cx={s.px} cy={s.py} r={r} fill={color} opacity={0.85} />
                <circle
                  cx={s.px} cy={s.py} r={SYSTEM_RADIUS * 3 / k}
                  fill="transparent" stroke="none"
                  onMouseEnter={() => setHovered({ _key: s._key, kills, r, px: s.px, py: s.py })}
                  onMouseLeave={() => setHovered(h => h?._key === s._key ? null : h)}
                />
                {s._key === highlightSystemId && (
                  <circle cx={s.px} cy={s.py} r={r * 2.5} fill="none" stroke="#ffee44" strokeWidth={1.5 / k} opacity={0.9} />
                )}
                {k >= 12 && (
                  <text
                    x={s.px}
                    y={s.py - r - 1.5 / k}
                    textAnchor="middle"
                    fontSize={14 / k}
                    fill="#aabbcc"
                    fontFamily="Arial, sans-serif"
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {s.name?.en ?? s._key}
                  </text>
                )}
              </g>
            )
          })}
          {hovered && (
            <text
              x={hovered.px}
              y={hovered.py + hovered.r + 2 / k}
              textAnchor="middle"
              dominantBaseline="hanging"
              fontSize={14 / k}
              fill="#aabbcc"
              fontFamily="Arial, sans-serif"
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              {hovered.kills.toLocaleString()}
            </text>
          )}
          {k < 12 && regionLabels.map(rl => (
            <text
              key={rl.id}
              x={rl.px}
              y={rl.py}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={18 / k}
              fill="#7799bb"
              fontFamily="Arial, sans-serif"
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              {regions[rl.id] ?? ''}
            </text>
          ))}
        </g>
      </svg>
    </div>
  )
}
