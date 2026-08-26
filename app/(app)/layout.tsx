import { BottomBar } from '@/components/nav/bottom-bar'
import { Toaster } from '@/components/ui/sonner'
import { requireSession } from '@/lib/auth/guards'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireSession()
  return (
    <div className="mx-auto min-h-dvh max-w-xl px-4 pb-24 pt-[max(1rem,env(safe-area-inset-top))]">
      {children}
      <BottomBar />
      <Toaster position="top-center" />
    </div>
  )
}
