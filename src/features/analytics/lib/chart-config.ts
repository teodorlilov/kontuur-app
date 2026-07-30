export const CHART_COLORS = {
  primary: '#164430',
  secondary: '#2E9E68',
  tertiary: '#8A6116',
  reach: '#7FA588',
  follower: '#164430',
  grid: '#E7ECE7',
  label: '#8B958D',
}

export const CHART_AXIS_PROPS = {
  tick: {
    fontSize: 11,
    fill: CHART_COLORS.label,
    fontFamily: 'var(--font-sans)',
  },
  axisLine: false as const,
  tickLine: false as const,
}

export const CHART_TOOLTIP_STYLE = {
  contentStyle: {
    background: '#FFFFFF',
    border: `1px solid ${CHART_COLORS.grid}`,
    borderRadius: 10,
    boxShadow: '0 12px 32px rgba(15,21,18,0.10)',
    fontSize: 13,
    fontFamily: 'var(--font-sans)',
    padding: '8px 12px',
  },
  labelStyle: {
    color: '#0F1512',
    fontWeight: 500,
    marginBottom: 4,
  },
  itemStyle: {
    color: '#57625A',
    fontSize: 12,
  },
}

export const LINE_PROPS = {
  strokeWidth: 2,
  dot: false as const,
  activeDot: { r: 4, strokeWidth: 0 },
}
