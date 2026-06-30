// SPDX-License-Identifier: CC0-1.0
// This file is released into the public domain under the CC0 1.0 Universal license.
import { useState, useEffect, useMemo, useRef } from 'react'
import MapCanvas from './components/MapCanvas'
import TimeSlider from './components/TimeSlider'
import ColorScale from './components/ColorScale'
import LoginButton from './components/LoginButton'
import { handleCallback, getValidAccessToken, getCharacterId, isLoggedIn } from './utils/auth'

function parseJsonl(text) {
  return text
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line))
}

const ESI = 'https://esi.evetech.net/latest'
const BASE = import.meta.env.BASE_URL
const INTERVAL_NORMAL = 60_000
const INTERVAL_FAST   = 20_000
const FAST_DURATION   = 3 * 60_000 // 3 minutes after a position change

const COLOR_SCALE_HEIGHT = 44  // px height of the ColorScale bar
const TIME_SLIDER_HEIGHT = 44  // px height of the TimeSlider bar

function parseHash() {
  const parts = window.location.hash.replace(/^#\/?/, '').split('/')
  if (parts[0] === 'hourly') {
    const hour = parseInt(parts[1], 10)
    if (!isNaN(hour) && hour >= 0 && hour <= 23) return { mode: 'hourly', hour }
  }
  if (parts[0] === 'snapshot' && parts[1]) return { mode: 'snapshot', stem: parts[1] }
  return null
}

function stemFromFilename(filename) {
  return filename.replace('kills_', '').replace('.json', '')
}

function setHash(mode, value) {
  const hash = mode === 'hourly' ? `#/hourly/${value}` : `#/snapshot/${value}`
  window.history.replaceState(null, '', hash)
}

export default function App() {
  const [systems, setSystems] = useState([])
  const [stargates, setStargates] = useState([])
  const [regions, setRegions] = useState({})
  const [snapshots, setSnapshots] = useState([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [killData, setKillData] = useState(null)
  const [hourlyAvg, setHourlyAvg] = useState(null)
  const [sliderMode, setSliderMode] = useState('snapshot')
  const [selectedHour, setSelectedHour] = useState(0)
  const [rankingCollapsed, setRankingCollapsed] = useState(false)
  const [focusTarget, setFocusTarget] = useState(null)
  const [hoveredRankSid, setHoveredRankSid] = useState(null)
  const [killMode, setKillMode] = useState('player')
  const [loggedIn, setLoggedIn] = useState(isLoggedIn())
  const [characterName, setCharacterName] = useState(null)
  const [highlightSystemId, setHighlightSystemId] = useState(null)
  const [tracking, setTracking] = useState(false)

  // Handle OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const state = params.get('state')
    if (!code) return
    // Clean URL before async work
    window.history.replaceState({}, '', window.location.pathname)
    handleCallback(code, state)
      .then(() => setLoggedIn(true))
      .catch(err => console.error('SSO callback error:', err))
  }, [])

  // Fetch character name once after login
  useEffect(() => {
    if (!loggedIn) { setCharacterName(null); return }
    const charId = getCharacterId()
    if (!charId) return
    fetch(`${ESI}/characters/${charId}/`)
      .then(r => r.json())
      .then(d => setCharacterName(d.name))
      .catch(() => {})
  }, [loggedIn])

  // Poll character location with adaptive interval
  useEffect(() => {
    if (!loggedIn) { setHighlightSystemId(null); return }

    let timerId = null
    let fastUntil = 0
    let lastSystemId = null

    const schedule = (delay) => {
      timerId = setTimeout(tick, delay)
    }

    const tick = async () => {
      const charId = getCharacterId()
      if (!charId) return
      const token = await getValidAccessToken()
      if (!token) { setLoggedIn(false); return }
      try {
        const resp = await fetch(`${ESI}/characters/${charId}/location/?datasource=tranquility`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (resp.ok) {
          const { solar_system_id } = await resp.json()
          if (solar_system_id !== lastSystemId) {
            lastSystemId = solar_system_id
            fastUntil = Date.now() + FAST_DURATION
            setHighlightSystemId(solar_system_id ?? null)
          }
        }
      } catch (_) {}
      const interval = Date.now() < fastUntil ? INTERVAL_FAST : INTERVAL_NORMAL
      schedule(interval)
    }

    tick()
    return () => clearTimeout(timerId)
  }, [loggedIn])

  // Load SDE data
  useEffect(() => {
    Promise.all([
      fetch(`${BASE}data/mapSolarSystems.jsonl`).then(r => r.text()),
      fetch(`${BASE}data/mapStargates.jsonl`).then(r => r.text()),
      fetch(`${BASE}data/mapRegions.jsonl`).then(r => r.text()),
    ])
      .then(([sysText, sgText, regText]) => {
        setSystems(parseJsonl(sysText))
        setStargates(parseJsonl(sgText))
        const regMap = {}
        parseJsonl(regText).forEach(r => { regMap[r._key] = r.name?.en ?? String(r._key) })
        setRegions(regMap)
      })
      .catch(err => console.error('SDE load error:', err))
  }, [])

  // Load hourly averages once on startup
  useEffect(() => {
    fetch(`${BASE}data/kills/hourly_avg.json`)
      .then(r => r.json())
      .then(setHourlyAvg)
      .catch(() => setHourlyAvg(null))
  }, [])

  // Load kill snapshots index; apply hash-based initial state if present
  useEffect(() => {
    fetch(`${BASE}data/kills/index.json?t=${Date.now()}`)
      .then(r => r.json())
      .then(list => {
        setSnapshots(list)
        const parsed = parseHash()
        if (parsed?.mode === 'hourly') {
          setSliderMode('hourly')
          setSelectedHour(parsed.hour)
          setSelectedIndex(list.length - 1)
        } else if (parsed?.mode === 'snapshot') {
          const idx = list.findIndex(s => stemFromFilename(s.filename) === parsed.stem)
          if (idx >= 0) {
            setSelectedIndex(idx)
          } else {
            setSelectedIndex(list.length - 1)
            window.history.replaceState(null, '', window.location.pathname)
          }
        } else {
          setSelectedIndex(list.length - 1)
          if (window.location.hash) window.history.replaceState(null, '', window.location.pathname)
        }
      })
      .catch(() => setSnapshots([]))
  }, [])

  // Auto-refresh: poll index.json every minute from :01; once an update is found,
  // skip remaining polls until next hour's :01.
  const isAtLatestRef = useRef(false)
  useEffect(() => {
    isAtLatestRef.current = sliderMode === 'snapshot' && selectedIndex === snapshots.length - 1
  }, [sliderMode, selectedIndex, snapshots.length])

  const snapshotsLengthRef = useRef(0)
  useEffect(() => { snapshotsLengthRef.current = snapshots.length }, [snapshots.length])

  useEffect(() => {
    let timerId
    let updatedThisHour = false

    const poll = () => {
      fetch(`${BASE}data/kills/index.json?t=${Date.now()}`)
        .then(r => r.json())
        .then(list => {
          if (list.length > snapshotsLengthRef.current) {
            updatedThisHour = true
            setSnapshots(list)
            if (isAtLatestRef.current) setSelectedIndex(list.length - 1)
            fetch(`${BASE}data/kills/hourly_avg.json`)
              .then(r => r.json())
              .then(setHourlyAvg)
              .catch(() => {})
          }
        })
        .catch(() => {})
        .finally(scheduleNext)
    }

    const scheduleNext = () => {
      const now = new Date()
      let next = new Date(now)
      next.setSeconds(0, 0)
      if (updatedThisHour) {
        // Skip to next hour's :01
        next.setHours(now.getHours() + 1, 1, 0, 0)
        updatedThisHour = false
      } else {
        next.setMinutes(now.getMinutes() + 1)
        // If rolled into :00 of next hour, jump to :01
        if (next.getMinutes() === 0) next.setMinutes(1)
      }
      timerId = setTimeout(poll, next - now)
    }

    scheduleNext()
    return () => clearTimeout(timerId)
  }, [])

  // Sync state to URL hash (skip during SSO callback)
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('code')) return
    if (!snapshots.length) return
    if (sliderMode === 'hourly') {
      setHash('hourly', selectedHour)
    } else {
      const snap = snapshots[selectedIndex]
      if (snap) setHash('snapshot', stemFromFilename(snap.filename))
    }
  }, [sliderMode, selectedIndex, selectedHour, snapshots])

  // Snapshot mode: load single snapshot
  const [loadingSnapshot, setLoadingSnapshot] = useState(false)
  useEffect(() => {
    if (sliderMode !== 'snapshot') return
    if (!snapshots.length) return
    const snap = snapshots[selectedIndex]
    if (!snap) return
    setLoadingSnapshot(true)
    fetch(`${BASE}data/kills/${snap.filename}`)
      .then(r => r.json())
      .then(setKillData)
      .catch(() => setKillData(null))
      .finally(() => setLoadingSnapshot(false))
  }, [snapshots, selectedIndex, sliderMode])

  // Hourly average mode: read from pre-computed hourly_avg.json
  useEffect(() => {
    if (sliderMode !== 'hourly') return
    setKillData(hourlyAvg?.[String(selectedHour)] ?? null)
  }, [hourlyAvg, selectedHour, sliderMode])

  const top5 = useMemo(() => {
    if (sliderMode !== 'snapshot' || !killData || !systems.length) return []
    const sysNameMap = Object.fromEntries(systems.map(s => [String(s._key), s.name?.en ?? String(s._key)]))
    return Object.entries(killData)
      .map(([sid, v]) => ({
        sid,
        name: sysNameMap[sid] ?? sid,
        value: killMode === 'npc' ? (v.n ?? 0) : killMode === 'jumps' ? (v.j ?? 0) : (v.s ?? 0) + (v.p ?? 0),
      }))
      .filter(e => e.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 20)
  }, [killData, killMode, systems, sliderMode])

  const top10Regions = useMemo(() => {
    if (sliderMode !== 'hourly' || !killData || !systems.length) return []
    const regionTotals = {}
    for (const s of systems) {
      const v = killData[String(s._key)]
      if (!v || !s.regionID) continue
      const val = killMode === 'npc' ? (v.n ?? 0) : killMode === 'jumps' ? (v.j ?? 0) : (v.s ?? 0) + (v.p ?? 0)
      regionTotals[s.regionID] = (regionTotals[s.regionID] ?? 0) + val
    }
    return Object.entries(regionTotals)
      .map(([rid, value]) => ({ rid, name: regions[rid] ?? rid, value }))
      .filter(e => e.value > 0)
      .sort((a, b) => b.value - a.value)
  }, [killData, killMode, systems, regions, sliderMode])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', position: 'relative' }}>
      {(top5.length > 0 || top10Regions.length > 0) && (
        <div style={{
          position: 'absolute',
          top: COLOR_SCALE_HEIGHT + 8,
          bottom: rankingCollapsed ? 'auto' : TIME_SLIDER_HEIGHT + 4,
          right: 12,
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          background: 'rgba(0,0,0,0.6)',
          padding: '4px 8px 6px',
          borderRadius: 4,
          fontSize: 12,
          color: '#99aacc',
          fontFamily: 'monospace',
          minWidth: 180,
        }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', flexShrink: 0, marginBottom: rankingCollapsed ? 0 : 4 }}>
            <button
              onClick={() => setRankingCollapsed(c => !c)}
              style={{
                background: 'none',
                border: 'none',
                color: '#667',
                cursor: 'pointer',
                fontSize: 11,
                padding: '0 2px',
                lineHeight: 1,
              }}
            >
              {rankingCollapsed ? '▼ Rankings' : '▲ Hide'}
            </button>
          </div>
          {!rankingCollapsed && (
            <>
              {top5.length > 0 && (
                <>
                  <div style={{ color: '#667', marginBottom: 4, fontSize: 11, flexShrink: 0 }}>Top Systems</div>
                  {top5.map((e, i) => (
                    <div
                      key={e.sid}
                      onClick={() => setFocusTarget(f => ({ systemId: e.sid, seq: (f?.seq ?? 0) + 1 }))}
                      onMouseEnter={() => setHoveredRankSid(e.sid)}
                      onMouseLeave={() => setHoveredRankSid(null)}
                      style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexShrink: 0, cursor: 'pointer' }}
                    >
                      <span style={{ color: hoveredRankSid === e.sid ? '#ffffff' : '#778899' }}>{i + 1}. {e.name}</span>
                      <span style={{ color: '#ccd' }}>{Math.round(e.value).toLocaleString('en-US')}</span>
                    </div>
                  ))}
                </>
              )}
              {top10Regions.length > 0 && (
                <>
                  <div style={{ color: '#667', marginBottom: 4, fontSize: 11, flexShrink: 0 }}>Regions</div>
                  <div style={{ overflowY: 'auto', flex: 1 }}>
                    {top10Regions.map((e, i) => (
                      <div key={e.rid} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                        <span style={{ color: '#778899' }}>{i + 1}. {e.name}</span>
                        <span style={{ color: '#ccd' }}>{Math.round(e.value).toLocaleString('en-US')}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
      <ColorScale
        killMode={killMode}
        onModeChange={setKillMode}
        loginButton={
          <LoginButton
            characterName={characterName}
            onLogout={() => { setLoggedIn(false); setHighlightSystemId(null); setTracking(false) }}
          />
        }
        tracking={tracking}
        onTrackingChange={setTracking}
        canTrack={!!highlightSystemId}
      />
      <MapCanvas
        systems={systems}
        stargates={stargates}
        killData={killData}
        killMode={killMode}
        regions={regions}
        highlightSystemId={highlightSystemId}
        tracking={tracking}
        onUserInteract={() => setTracking(false)}
        focusTarget={focusTarget}
        loggedIn={loggedIn}
      />
      {loadingSnapshot && (
        <div style={{
          position: 'absolute',
          bottom: TIME_SLIDER_HEIGHT + 8,
          left: 12,
          zIndex: 10,
          background: 'rgba(0,0,0,0.6)',
          color: '#778899',
          fontSize: 12,
          fontFamily: 'monospace',
          padding: '4px 10px',
          borderRadius: 4,
          pointerEvents: 'none',
        }}>
          Loading data...
        </div>
      )}
      <TimeSlider
        snapshots={snapshots}
        selectedIndex={selectedIndex}
        onChange={setSelectedIndex}
        mode={sliderMode}
        onModeChange={setSliderMode}
        selectedHour={selectedHour}
        onHourChange={setSelectedHour}
      />
    </div>
  )
}
