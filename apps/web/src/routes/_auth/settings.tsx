import { Link, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_auth/settings')({
  component: SettingsPage,
})

function SettingsPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <h1 className="text-3xl font-bold">Settings</h1>
      <p className="text-sm text-muted-foreground">
        Change password, delete account — TBD in the next slice.
      </p>
      <Link to="/me" className="underline text-sm">Back to profile</Link>
    </div>
  )
}
