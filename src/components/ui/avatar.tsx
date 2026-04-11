type AvatarSize = 'sm' | 'md' | 'lg'
type AvatarColor = 'blue' | 'green' | 'purple' | 'amber' | 'brand'

interface AvatarProps {
  name: string
  size?: AvatarSize
  color?: AvatarColor
  className?: string
}

const sizeStyles: Record<AvatarSize, { width: number; height: number; fontSize: number }> = {
  sm: { width: 24, height: 24, fontSize: 10 },
  md: { width: 32, height: 32, fontSize: 12 },
  lg: { width: 44, height: 44, fontSize: 14 },
}

const colorStyles: Record<AvatarColor, { background: string; color: string }> = {
  blue: { background: '#E6F1FB', color: '#0C447C' },
  green: { background: '#EAF3DE', color: '#27500A' },
  purple: { background: '#EEEDFE', color: '#3C3489' },
  amber: { background: '#FAEEDA', color: '#633806' },
  brand: { background: '#2C3E50', color: '#FFFFFF' },
}

const colorKeys: AvatarColor[] = ['blue', 'green', 'purple', 'amber']

function hashColor(name: string): AvatarColor {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  }
  return colorKeys[hash % colorKeys.length]!
}

export function Avatar({ name, size = 'md', color, className }: AvatarProps) {
  const resolvedColor = color ?? hashColor(name)
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <div
      className={className}
      style={{
        ...sizeStyles[size],
        ...colorStyles[resolvedColor],
        borderRadius: 'var(--radius-full)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 500,
        fontFamily: 'var(--font-sans)',
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      {initials}
    </div>
  )
}
