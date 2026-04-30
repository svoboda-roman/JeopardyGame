import { createFileRoute } from '@tanstack/react-router'
import { useStore } from 'zustand'
import { Button } from '#/components/ui/button.tsx'
import { useGameSocket } from '#/lib/game-socket.ts'

export const Route = createFileRoute('/host/$roomCode')({
  component: HostPage,
})

function HostPage() {
  const { roomCode } = Route.useParams()
  const { store, status, send } = useGameSocket(roomCode)
  const game = useStore(store, (s) => s.game)

  if (status !== 'open' || !game) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        {status === 'closed' ? 'Reconnecting…' : 'Connecting…'}
      </div>
    )
  }

  const buzzed = game.currentPlayerId
    ? game.players.find((p) => p.id === game.currentPlayerId)
    : null

  return (
    <div className="min-h-screen p-4 max-w-6xl mx-auto space-y-4">
      <header className="flex flex-wrap items-center gap-3 justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Room</p>
          <p className="font-mono text-2xl">{game.roomCode}</p>
        </div>
        <p className="text-sm">
          Phase: <span className="font-mono">{game.phase}</span>
        </p>
        {game.phase === 'lobby' && (
          <Button onClick={() => send({ type: 'start_game' })}>Start game</Button>
        )}
      </header>

      <section className="border rounded-2xl p-3">
        <h2 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Players</h2>
        <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-sm">
          {game.players
            .filter((p) => !p.isHost)
            .map((p) => (
              <li key={p.id} className="rounded border px-2 py-1">
                <span className="block truncate">{p.displayName}</span>
                <span className="text-xs text-muted-foreground">${p.score}</span>
              </li>
            ))}
        </ul>
      </section>

      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {game.board.map((cat) => (
          <div key={cat.ref} className="space-y-2">
            <div className="text-center font-semibold text-sm py-2 border rounded-md">
              {cat.title}
            </div>
            {cat.questions.map((q) => (
              <button
                key={q.ref}
                type="button"
                disabled={q.closed || game.phase !== 'picking'}
                onClick={() => {
                  send({ type: 'select_question', questionRef: q.ref })
                  send({ type: 'open_question' })
                }}
                className={`w-full rounded-md border py-3 font-bold ${
                  q.closed
                    ? 'opacity-30 line-through'
                    : 'hover:bg-primary hover:text-primary-foreground'
                } disabled:cursor-not-allowed`}
              >
                ${q.pointValue}
              </button>
            ))}
          </div>
        ))}
      </section>

      {(game.phase === 'reading' || game.phase === 'buzz_open' || game.phase === 'buzzed') &&
        game.currentQuestion && (
          <section className="border rounded-2xl p-4 space-y-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              ${game.currentQuestion.pointValue}
              {game.currentQuestion.isDailyDouble && ' · Daily Double'}
            </p>
            <p className="text-xl leading-snug">{game.currentQuestion.clue}</p>
            <p className="text-sm">
              <span className="text-muted-foreground">Answer: </span>
              <span className="font-medium">{game.currentQuestion.answer}</span>
            </p>
            {buzzed ? (
              <div className="space-y-2">
                <p className="text-sm">
                  <strong>{buzzed.displayName}</strong> buzzed in.
                </p>
                <div className="flex gap-2 flex-wrap">
                  <Button onClick={() => send({ type: 'judge', verdict: 'correct' })}>Correct</Button>
                  <Button
                    variant="outline"
                    onClick={() => send({ type: 'judge', verdict: 'incorrect' })}
                  >
                    Incorrect
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => send({ type: 'judge', verdict: 'no_answer' })}
                  >
                    No answer
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" onClick={() => send({ type: 'close_question' })}>
                Close question
              </Button>
            )}
          </section>
        )}

      {game.phase === 'completed' && (
        <section className="border rounded-2xl p-6 text-center space-y-2">
          <h2 className="text-2xl font-bold">Game complete</h2>
          <ol className="space-y-1 max-w-sm mx-auto">
            {[...game.players]
              .filter((p) => !p.isHost)
              .sort((a, b) => b.score - a.score)
              .map((p, i) => (
                <li key={p.id} className="flex justify-between border-b py-1">
                  <span>
                    {i + 1}. {p.displayName}
                  </span>
                  <span className="font-mono">${p.score}</span>
                </li>
              ))}
          </ol>
        </section>
      )}
    </div>
  )
}
