import React from 'react'

interface BadgeProps {
  status: 'active' | 'closed' | 'initializing' | 'finalized'
}

export function Badge({ status }: BadgeProps) {
  const styles = {
    active: 'bg-[#b6a0ff]/10 text-[#b6a0ff] border-[#b6a0ff]/20',
    closed: 'bg-white/5 text-white/40 border-white/10',
    initializing: 'bg-[#00affe]/10 text-[#00affe] border-[#00affe]/20',
    finalized: 'bg-green-500/10 text-green-400 border-green-500/20'
  }

  const label = status.charAt(0).toUpperCase() + status.slice(1)

  return (
    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase border ${styles[status]}`}>
      {label}
    </span>
  )
}
