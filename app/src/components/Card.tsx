import React from 'react'

interface CardProps {
  children: React.ReactNode
  className?: string
  glow?: 'violet' | 'blue' | 'none'
}

export function Card({ children, className, glow = 'none' }: CardProps) {
  const glowStyles = {
    violet: 'shadow-glow-violet border-[#b6a0ff]/10',
    blue: 'shadow-glow-blue border-[#00affe]/10',
    none: 'border-white/5'
  }

  return (
    <div className={`bg-[#161a21]/60 backdrop-blur-xl border rounded-2xl p-6 ${glowStyles[glow]} ${className || ''}`}>
      {children}
    </div>
  )
}
