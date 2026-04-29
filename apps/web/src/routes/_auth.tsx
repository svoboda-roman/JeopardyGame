import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { ensureAuthLoaded } from '#/stores/auth.ts'

export const Route = createFileRoute('/_auth')({
  beforeLoad: async ({ location }) => {
    const user = await ensureAuthLoaded()
    if (!user) {
      throw redirect({ to: '/login', search: { next: location.href } })
    }
  },
  component: AuthLayout,
})

function AuthLayout() {
  return (
    <div className="min-h-screen px-4 py-6">
      <Outlet />
    </div>
  )
}
