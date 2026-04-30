import { useEffect, useMemo, useRef, useState } from 'react'
import type { ClientToServer, ServerToClient } from 'server/src/game/protocol.ts'
import { createGameStore } from '#/stores/game.ts'

const wsBase = import.meta.env.VITE_WS_URL ?? 'ws://localhost:3000'

export type ConnectionStatus = 'connecting' | 'open' | 'closed' | 'error'

export function useGameSocket(roomCode: string) {
  const store = useMemo(() => createGameStore(), [])
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    let cancelled = false
    let attempt = 0
    let timer: ReturnType<typeof setTimeout> | null = null

    function connect() {
      if (cancelled) return
      const ws = new WebSocket(`${wsBase}/ws/games/${roomCode}`)
      wsRef.current = ws
      setStatus('connecting')

      ws.addEventListener('open', () => {
        if (cancelled) {
          ws.close()
          return
        }
        attempt = 0
        setStatus('open')
      })

      ws.addEventListener('message', (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as ServerToClient
          store.getState().apply(msg)
        } catch {
          // ignore malformed
        }
      })

      ws.addEventListener('close', () => {
        wsRef.current = null
        setStatus('closed')
        if (cancelled) return
        // Exponential-ish backoff up to 10s.
        const delay = Math.min(10_000, 500 * 2 ** attempt++)
        timer = setTimeout(connect, delay)
      })

      ws.addEventListener('error', () => {
        setStatus('error')
      })
    }

    connect()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [roomCode, store])

  function send(msg: ClientToServer) {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify(msg))
  }

  return { store, status, send }
}
