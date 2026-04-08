interface KontuurLogoProps {
  height?: number
  className?: string
}

export function KontuurLogo({ height = 80, className }: KontuurLogoProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/kontuur_logo.svg"
      alt="kontuur"
      height={height}
      style={{ height: `${height}px`, width: 'auto' }}
      className={className}
    />
  )
}
