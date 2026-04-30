import { Link, createFileRoute } from '@tanstack/react-router'
import { Button } from '#/components/ui/button.tsx'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 gap-6 text-center">
      <h1 className="text-4xl font-bold">JeopardyGame</h1>
      <p className="text-muted-foreground max-w-md">
        Author quizzes, host live games, buzz in. Mobile-first.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Link to="/join"><Button>Join with code</Button></Link>
        <Link to="/login"><Button variant="outline">Log in</Button></Link>
        <Link to="/register"><Button variant="outline">Register</Button></Link>
      </div>
    </div>
  )
}
