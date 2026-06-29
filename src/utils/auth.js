// SPDX-License-Identifier: CC0-1.0
// This file is released into the public domain under the CC0 1.0 Universal license.
import { EVE_CLIENT_ID, ESI_SCOPE } from '../config'
import { setCookie, getCookie, deleteCookie } from './cookies'

const SSO_AUTH_URL  = 'https://login.eveonline.com/v2/oauth/authorize'
const SSO_TOKEN_URL = 'https://login.eveonline.com/v2/oauth/token'

function redirectUri() {
  return window.location.origin + window.location.pathname
}

// PKCE helpers
function base64urlEncode(buf) {
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function generatePKCE() {
  const verifierBytes = crypto.getRandomValues(new Uint8Array(32))
  const verifier = base64urlEncode(verifierBytes)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  const challenge = base64urlEncode(new Uint8Array(digest))
  return { verifier, challenge }
}

// Decode JWT payload (no verification needed — ESI validates server-side)
function parseJwt(token) {
  const payload = token.split('.')[1]
  return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
}

// Start SSO login — redirects the browser
export async function startLogin() {
  const { verifier, challenge } = await generatePKCE()
  const state = base64urlEncode(crypto.getRandomValues(new Uint8Array(8)))
  sessionStorage.setItem('pkce_verifier', verifier)
  sessionStorage.setItem('pkce_state', state)

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: EVE_CLIENT_ID,
    redirect_uri: redirectUri(),
    scope: ESI_SCOPE,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  })
  window.location.href = `${SSO_AUTH_URL}?${params}`
}

// Exchange auth code for tokens — call after redirect back
export async function handleCallback(code, state) {
  const savedState = sessionStorage.getItem('pkce_state')
  const verifier   = sessionStorage.getItem('pkce_verifier')
  sessionStorage.removeItem('pkce_state')
  sessionStorage.removeItem('pkce_verifier')

  if (state !== savedState) throw new Error('State mismatch')

  const resp = await fetch(SSO_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: EVE_CLIENT_ID,
      code,
      redirect_uri: redirectUri(),
      code_verifier: verifier,
    }),
  })
  if (!resp.ok) throw new Error(`Token exchange failed: ${resp.status}`)
  const data = await resp.json()
  saveTokens(data)
}

function saveTokens({ access_token, refresh_token, expires_in = 1199 }) {
  setCookie('eve_access_token',  access_token,  1)
  setCookie('eve_refresh_token', refresh_token, 30)
  // Store expiry as Unix seconds
  setCookie('eve_token_expiry', String(Math.floor(Date.now() / 1000) + expires_in - 60), 1)

  // Extract character ID from JWT sub: "CHARACTER:EVE:12345678"
  const jwt = parseJwt(access_token)
  const charId = jwt.sub?.split(':')[2]
  if (charId) setCookie('eve_character_id', charId, 30)
}

export async function refreshAccessToken() {
  const refreshToken = getCookie('eve_refresh_token')
  if (!refreshToken) return false

  const resp = await fetch(SSO_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: EVE_CLIENT_ID,
      refresh_token: refreshToken,
    }),
  })
  if (!resp.ok) { logout(); return false }
  saveTokens(await resp.json())
  return true
}

export async function getValidAccessToken() {
  const expiry = Number(getCookie('eve_token_expiry') ?? 0)
  if (Date.now() / 1000 < expiry) return getCookie('eve_access_token')
  const ok = await refreshAccessToken()
  return ok ? getCookie('eve_access_token') : null
}

export function getCharacterId() {
  return getCookie('eve_character_id')
}

export function isLoggedIn() {
  return !!getCookie('eve_character_id')
}

export function logout() {
  deleteCookie('eve_access_token')
  deleteCookie('eve_refresh_token')
  deleteCookie('eve_token_expiry')
  deleteCookie('eve_character_id')
}
