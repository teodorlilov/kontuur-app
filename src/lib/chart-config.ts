export const CHART_COLORS = {
  primary: '#4A6FA5',
  secondary: '#1D9E75',
  tertiary: '#BA7517',
  grid: '#EAE8E3',
  label: '#9C9890',
}

export const CHART_AXIS_PROPS = {
  tick: {
    fontSize: 11,
    fill: '#9C9890',
    fontFamily: 'var(--font-sans)',
  },
  axisLine: false as const,
  tickLine: false as const,
}

export const CHART_TOOLTIP_STYLE = {
  contentStyle: {
    background: '#FFFFFF',
    border: '0.5px solid #EAE8E3',
    borderRadius: 8,
    boxShadow: '0 4px 16px rgba(26,25,24,0.08)',
    fontSize: 13,
    fontFamily: 'var(--font-sans)',
    padding: '8px 12px',
  },
  labelStyle: {
    color: '#1A1918',
    fontWeight: 500,
    marginBottom: 4,
  },
  itemStyle: {
    color: '#6B6862',
    fontSize: 12,
  },
}

export const LINE_PROPS = {
  strokeWidth: 2,
  dot: false as const,
  activeDot: { r: 4, strokeWidth: 0 },
}
