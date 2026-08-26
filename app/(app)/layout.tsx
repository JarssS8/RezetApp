import { BottomBar } from '@/components/nav/bottom-bar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh max-w-xl px-4 pb-24 pt-[max(1rem,env(safe-area-inset-top))]">
      {children}
      <BottomBar />
    </div>
  )
}
