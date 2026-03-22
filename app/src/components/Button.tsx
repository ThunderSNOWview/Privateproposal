import React from 'react'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost'
  loading?: boolean
}

export function Button({ variant = 'primary', loading, children, className, ...props }: ButtonProps) {
  const baseStyles = 'px-6 py-2.5 rounded-lg font-bold transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none'
  
  const variants = {
    primary: 'bg-gradient-to-br from-[#7e51ff] to-[#b6a0ff] text-[#340090] shadow-glow-violet hover:opacity-90',
    secondary: 'bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-[#ecedf6] backdrop-blur-md',
    ghost: 'text-[#00affe] hover:bg-[#00affe]/10 border border-transparent'
  }

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${className || ''}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? (
        <div className="flex items-center gap-2 justify-center">
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          <span>{children}</span>
        </div>
      ) : children}
    </button>
  )
}
