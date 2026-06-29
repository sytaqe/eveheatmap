// SPDX-License-Identifier: CC0-1.0
// This file is released into the public domain under the CC0 1.0 Universal license.
import { startLogin, logout, isLoggedIn, getCharacterId } from '../utils/auth'
import { EVE_CLIENT_ID } from '../config'

export default function LoginButton({ characterName, onLogout }) {
  const notConfigured = EVE_CLIENT_ID === 'your_client_id_here'

  if (notConfigured) return null

  if (isLoggedIn()) {
    const charId = getCharacterId()
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {charId && (
          <img
            src={`https://images.evetech.net/characters/${charId}/portrait?size=32`}
            alt=""
            width={20}
            height={20}
            style={{ borderRadius: 2, display: 'block' }}
          />
        )}
        <span style={{ fontSize: 11, color: '#99aacc' }}>
          {characterName ?? `#${charId}`}
        </span>
        <button
          onClick={() => { logout(); onLogout() }}
          style={{
            fontSize: 11, padding: '2px 8px',
            background: 'transparent', border: '1px solid #2a3a5a',
            color: '#778', borderRadius: 3, cursor: 'pointer',
          }}
        >
          Logout
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={startLogin}
      style={{
        fontSize: 11, padding: '2px 10px',
        background: '#1a3a6a', border: '1px solid #2a5aaa',
        color: '#aaccff', borderRadius: 3, cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      Login with EVE
    </button>
  )
}
