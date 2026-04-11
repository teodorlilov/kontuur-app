'use client'

import { cn } from '@/utils/cn'

interface CardProps {
  children: React.ReactNode
  className?: string
  hover?: boolean
}

export function Card({ children, className, hover = false }: CardProps) {
  return (
    <div
      className={cn(
        hover && 'transition-[border-color,transform] duration-150 ease-out hover:-translate-y-px',
        className
      )}
      style={{
        background: 'var(--color-surface)',
        border: '0.5px solid var(--color-border-1)',
        borderRadius: 'var(--radius-lg)',
        padding: '20px 24px',
      }}
      {...(hover
        ? {
            onMouseEnter: (e: React.MouseEvent<HTMLDivElement>) => {
              e.currentTarget.style.borderColor = 'var(--color-border-2)'
            },
            onMouseLeave: (e: React.MouseEvent<HTMLDivElement>) => {
              e.currentTarget.style.borderColor = 'var(--color-border-1)'
            },
          }
        : {})}
    >
      {children}
    </div>
  )
}
