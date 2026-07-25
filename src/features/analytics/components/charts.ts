/**
 * The single lazy-chunk boundary for every recharts-based chart. All tabs dynamic-import THIS
 * module (never the chart files directly) so the ~400KB recharts payload is bundled once, loads
 * only when a report first renders, and is shared across tabs — separate dynamic() targets would
 * each get their own copy of recharts.
 */
export { AnalyticsCharts } from './analytics-charts'
export { AudienceSection } from './audience-section'
export { FollowerTrend } from './follower-trend'
export { PostDayBreakdown } from './post-day-breakdown'
