import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { ensureAuthLoaded } from '#/stores/auth.ts'

export const Route = createFileRoute('/_unauth')({
  beforeLoad: async () => {
    const user = await ensureAuthLoaded()
    if (user) throw redirect({ to: '/me' })
  },
  component: UnauthLayout,
})

function UnauthLayout() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm border rounded-2xl p-6 shadow-sm bg-card">
        <Outlet />
      </div>
    </div>
  )
}
