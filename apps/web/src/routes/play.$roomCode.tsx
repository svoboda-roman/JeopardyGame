import { createFileRoute } from '@tanstack/react-router'
import { useStore } from 'zustand'
import { useGameSocket } from '#/lib/game-socket.ts'

export const Route = createFileRoute('/play/$roomCode')({
  component: PlayPage,
})

function PlayPage() {
  const { roomCode } = Route.useParams()
  const { store, status, send } = useGameSocket(roomCode)
  const game = useStore(store, (s) => s.game)
  const selfId = useStore(store, (s) => s.selfPlayerId)
  const lastError = useStore(store, (s) => s.lastError)

  if (status !== 'open' || !game) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        {status === 'closed' ? 'Reconnecting…' : 'Connecting…'}
      </div>
    )
  }

  const me = game.players.find((p) => p.id === selfId)
  const buzzedPlayer = game.currentPlayerId
    ? game.players.find((p) => p.id === game.currentPlayerId)
    : null

  return (
    <div className="min-h-[100dvh] flex flex-col p-4 gap-4 max-w-md mx-auto w-full">
      <header className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          Room <span className="font-mono">{game.roomCode}</span>
        </span>
        <span className="text-sm">
          You: <strong>{me?.displayName ?? '—'}</strong> · ${me?.score ?? 0}
        </span>
      </header>

      <section className="border rounded-2xl p-3 space-y-2">
        <h2 className="text-xs uppercase tracking-wider text-muted-foreground">Players</h2>
        <ul className="grid grid-cols-2 gap-2 text-sm">
          {game.players
            .filter((p) => !p.isHost)
            .map((p) => (
              <li
                key={p.id}
                className={`rounded border px-2 py-1 ${
                  p.id === game.currentPlayerId ? 'border-primary' : ''
                }`}
              >
                <span className="block font-medium truncate">{p.displayName}</span>
                <span className="text-xs text-muted-foreground">${p.score}</span>
              </li>
            ))}
        </ul>
      </section>

      {(game.phase === 'reading' || game.phase === 'buzz_open' || game.phase === 'buzzed') &&
        game.currentQuestion && (
          <section className="border rounded-2xl p-4 space-y-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              ${game.currentQuestion.pointValue}
              {game.currentQuestion.isDailyDouble && ' · Daily Double'}
            </p>
            <p className="text-lg leading-snug">{game.currentQuestion.clue}</p>
            {buzzedPlayer && (
              <p className="text-sm text-muted-foreground">
                {buzzedPlayer.displayName} buzzed in.
              </p>
            )}
          </section>
        )}

      {game.phase === 'lobby' && (
        <p className="text-center text-sm text-muted-foreground">
          Waiting for the host to start…
        </p>
      )}
      {game.phase === 'picking' && (
        <p className="text-center text-sm text-muted-foreground">
          Host is picking the next question…
        </p>
      )}
      {game.phase === 'completed' && (
        <p className="text-center text-base font-medium">Game over.</p>
      )}

      <div className="flex-1" />

      <button
        type="button"
        aria-label="Buzz"
        onClick={() => send({ type: 'buzz' })}
        disabled={
          game.phase !== 'buzz_open' && game.phase !== 'reading'
        }
        className="w-full rounded-3xl border-4 border-primary bg-primary text-primary-foreground font-bold text-2xl py-12 active:scale-[0.97] transition-transform disabled:opacity-30"
      >
        BUZZ
      </button>

      {lastError && (
        <p className="text-center text-xs text-destructive">{lastError.message}</p>
      )}
    </div>
  )
}
