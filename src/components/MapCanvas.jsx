// SPDX-License-Identifier: CC0-1.0
// This file is released into the public domain under the CC0 1.0 Universal license.
import { useMemo, useState, useRef, useEffect, useCallback } from 'react'
import { killCountToColor, MAX_COUNTS, MAX_COUNTS_HIGH } from '../utils/colorScale'
import { getValidAccessToken } from '../utils/auth'

const SYSTEM_RADIUS = 2
const MIN_ZOOM = 0.05
const MAX_ZOOM = 20
const ESI = 'https://esi.evetech.net/latest'

export default function MapCanvas({ systems, stargates, killData, killMode = 'player', regions = {}, highlightSystemId = null, tracking = false, onUserInteract, focusTarget = null, loggedIn = false }) {
  const containerRef = useRef(null)
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 })
  const dragging = useRef(false)
  const dragStart = useRef(null)
  const [hovered, setHovered] = useState(null) // { _key, kills, r, px, py }
  const [contextMenu, setContextMenu] = useState(null) // { systemId, name, menuX, menuY }
  const [waypointStatus, setWaypointStatus] = useState(null) // 'ok' | 'error' | null

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

  // Close context menu on Escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setContextMenu(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
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

  const handleSystemClick = (e, s) => {
    e.stopPropagation()
    const rect = containerRef.current?.getBoundingClientRect()
    const menuX = rect ? e.clientX - rect.left : e.clientX
    const menuY = rect ? e.clientY - rect.top : e.clientY
    setContextMenu({ systemId: s._key, name: s.name?.en ?? String(s._key), menuX, menuY })
    setWaypointStatus(null)
  }

  const handleSetDestination = async () => {
    if (!contextMenu) return
    const { systemId } = contextMenu
    setContextMenu(null)
    const token = await getValidAccessToken()
    if (!token) { setWaypointStatus('error'); return }
    try {
      const resp = await fetch(
        `${ESI}/ui/autopilot/waypoint/?add_to_beginning=false&clear_other_waypoints=false&destination_id=${systemId}&datasource=tranquility`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
      )
      setWaypointStatus(resp.ok ? 'ok' : 'error')
    } catch (_) {
      setWaypointStatus('error')
    }
    setTimeout(() => setWaypointStatus(null), 3000)
  }

  const { k, x, y } = transform

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, overflow: 'hidden', cursor: dragging.current ? 'grabbing' : 'grab', position: 'relative' }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onClick={() => setContextMenu(null)}
      onContextMenu={(e) => e.preventDefault()}
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
                  onContextMenu={(e) => { e.preventDefault(); handleSystemClick(e, s) }}
                  style={{ cursor: 'context-menu' }}
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

      {contextMenu && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            left: contextMenu.menuX,
            top: contextMenu.menuY,
            background: '#1a2233',
            border: '1px solid #334',
            borderRadius: 4,
            zIndex: 100,
            minWidth: 160,
            boxShadow: '0 4px 12px rgba(0,0,0,0.6)',
            fontFamily: 'Arial, sans-serif',
            fontSize: 13,
            color: '#aabbcc',
          }}
        >
          <div style={{
            padding: '6px 10px',
            borderBottom: '1px solid #334',
            color: '#667788',
            fontSize: 11,
            userSelect: 'none',
          }}>
            {contextMenu.name}
          </div>
          <div
            onClick={() => { navigator.clipboard.writeText(contextMenu.name); setContextMenu(null) }}
            style={{ padding: '7px 10px', cursor: 'pointer' }}
            onMouseEnter={e => e.currentTarget.style.background = '#243048'}
            onMouseLeave={e => e.currentTarget.style.background = ''}
          >
            Copy &ldquo;{contextMenu.name}&rdquo;
          </div>
          {loggedIn && (
            <div
              onClick={handleSetDestination}
              style={{ padding: '7px 10px', cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.background = '#243048'}
              onMouseLeave={e => e.currentTarget.style.background = ''}
            >
              Set Destination
            </div>
          )}
        </div>
      )}

      {waypointStatus && (
        <div style={{
          position: 'absolute',
          bottom: 56,
          left: '50%',
          transform: 'translateX(-50%)',
          background: waypointStatus === 'ok' ? '#1a3322' : '#331a1a',
          border: `1px solid ${waypointStatus === 'ok' ? '#336644' : '#663333'}`,
          color: waypointStatus === 'ok' ? '#66cc88' : '#cc6666',
          padding: '6px 14px',
          borderRadius: 4,
          fontSize: 13,
          fontFamily: 'Arial, sans-serif',
          zIndex: 100,
          pointerEvents: 'none',
        }}>
          {waypointStatus === 'ok' ? 'Destination set.' : 'Failed to set destination.'}
        </div>
      )}
    </div>
  )
}
