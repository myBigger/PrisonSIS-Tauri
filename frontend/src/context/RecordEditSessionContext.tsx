import { createContext, useContext, useMemo, useState } from 'react'

export type RecordEditGuard = {
  blocking: boolean
  message?: string
  save?: () => Promise<boolean>
  discard?: () => void
}

type Ctx = {
  guard: RecordEditGuard
  setGuard: (next: RecordEditGuard) => void
}

const RecordEditSessionContext = createContext<Ctx | null>(null)

export function RecordEditSessionProvider({ children }: { children: React.ReactNode }) {
  const [guard, setGuard] = useState<RecordEditGuard>({ blocking: false })
  const value = useMemo<Ctx>(() => ({ guard, setGuard }), [guard])
  return <RecordEditSessionContext.Provider value={value}>{children}</RecordEditSessionContext.Provider>
}

export function useRecordEditSession() {
  const ctx = useContext(RecordEditSessionContext)
  if (!ctx) throw new Error('useRecordEditSession must be used within RecordEditSessionProvider')
  return ctx
}

