import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { Button } from '#/components/ui/button.tsx'
import { api } from '#/lib/api.ts'

export const Route = createFileRoute('/_auth/quizzes/')({
  component: QuizzesPage,
})

function QuizzesPage() {
  const navigate = useNavigate()
  const { data, isLoading, error } = useQuery({
    queryKey: ['quizzes'],
    queryFn: async () => {
      const res = await api.quizzes.get()
      if (res.error || !res.data || 'error' in res.data) throw new Error('Failed to load quizzes')
      return res.data
    },
  })

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">My Quizzes</h1>
        <Button onClick={() => navigate({ to: '/quizzes/new' })}>New quiz</Button>
      </header>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-destructive">Could not load your quizzes.</p>}

      {data && data.items.length === 0 && (
        <div className="border rounded-2xl p-8 text-center space-y-3">
          <p className="text-muted-foreground">You don't have any quizzes yet.</p>
          <Button onClick={() => navigate({ to: '/quizzes/new' })}>Create your first quiz</Button>
        </div>
      )}

      {data && data.items.length > 0 && (
        <ul className="divide-y rounded-2xl border">
          {data.items.map((q) => (
            <li key={q.id}>
              <Link
                to="/quizzes/$quizId"
                params={{ quizId: q.id }}
                className="block px-4 py-3 hover:bg-muted/50"
              >
                <span className="font-medium">{q.title}</span>
                {q.description && (
                  <p className="text-sm text-muted-foreground line-clamp-1">{q.description}</p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
