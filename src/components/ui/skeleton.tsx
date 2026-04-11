interface SkeletonProps {
  height?: number | string
  width?: number | string
  className?: string
  style?: React.CSSProperties
}

export function Skeleton({ height, width, className, style }: SkeletonProps) {
  return <div className={`skeleton ${className ?? ''}`} style={{ height, width, ...style }} />
}
