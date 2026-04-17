interface KontuurLogoProps {
  height?: number
  className?: string
}

export function KontuurLogo({ height = 80, className }: KontuurLogoProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/kontuur_logo_white.svg"
      alt="kontuur"
      style={{ height: `${height}px`, width: 'auto', maxWidth: '100%' }}
      className={className}
    />
  )
}
