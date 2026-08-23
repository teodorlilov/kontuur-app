import type { NextConfig } from 'next'

/**
 * Every remote host the browser may load an image from.
 *
 * Declared once because two places need it and they must never disagree: `images.remotePatterns`
 * (or `next/image` refuses the URL) and the CSP's `img-src` (or the browser does). `**.` is
 * next/image's multi-level wildcard; CSP spells the same thing `*.`, which is the only difference
 * between the two renderings below.
 */
const REMOTE_IMAGE_HOSTS = [
  { protocol: 'https', hostname: '*.supabase.co', pathname: '/storage/v1/object/public/**' },
  // Instagram media thumbnails in the analytics grid. Meta serves them from both CDNs and
  // rotates the subdomain per request, so the host has to be matched by wildcard.
  { protocol: 'https', hostname: '**.cdninstagram.com' },
  { protocol: 'https', hostname: '**.fbcdn.net' },
] as const

/** Supabase is reached by REST over https and by Realtime over wss, on the same host. */
const SUPABASE_HOSTS = ['https://*.supabase.co', 'wss://*.supabase.co']

/**
 * Content-Security-Policy, shipped **report-only**.
 *
 * Report-only on purpose, and it should stay that way until the reports are read: Next inlines its
 * bootstrap and hydration payload, the canvas editor pulls Google Fonts stylesheets at runtime
 * (`editorFontsHref`) and draws through blob: URLs, so an enforcing policy has several ways to
 * break a surface that no test in this repo can see. This is the defence-in-depth layer under the
 * prompt-injection fix (TECH-DEBT §8.3): fetched source text reaching a page cannot exfiltrate to
 * an origin that is not listed here.
 *
 * `unsafe-inline` on scripts is what a nonce-based policy would remove, and adding nonces means
 * middleware rewriting every response — a deliberate change to make once the report is quiet.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  // Tailwind ships a stylesheet, but React style attributes and the editor's injected font
  // stylesheets both need inline styles allowed.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  // blob: is the canvas editor exporting and previewing bitmaps it just composed.
  [
    "img-src 'self' data: blob:",
    ...REMOTE_IMAGE_HOSTS.map((host) => `https://${host.hostname.replace(/^\*\*\./, '*.')}`),
  ].join(' '),
  ["connect-src 'self'", ...SUPABASE_HOSTS].join(' '),
  // Matches X-Frame-Options: DENY below, which older browsers read instead.
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

const nextConfig: NextConfig = {
  // puppeteer-core + @sparticuz/chromium must stay external — bundling breaks @sparticuz's runtime
  // binary extraction on Vercel (the headless Chrome used for brand visual-identity extraction).
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist', 'puppeteer-core', '@sparticuz/chromium'],
  // @sparticuz reads its Chromium binary from bin/ at runtime, which Vercel's file tracing misses
  // (it isn't `require`d). Force-include it in the functions that launch the browser, otherwise the
  // binary is absent on Vercel and extraction fails with "…/@sparticuz/chromium/bin does not exist".
  outputFileTracingIncludes: {
    '/api/extract/start': ['./node_modules/@sparticuz/chromium/bin/**/*'],
    '/api/clients/[id]/visual-identity/reanalyze': ['./node_modules/@sparticuz/chromium/bin/**/*'],
  },
  images: {
    remotePatterns: [...REMOTE_IMAGE_HOSTS],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Two years and preload-eligible. Vercel terminates TLS and does not serve the
          // app over plain HTTP, so this closes the first-request window rather than
          // changing steady-state behaviour.
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          // Nothing in the app asks for any of these. Denying them by name means a future
          // dependency cannot quietly start asking on a page the user already trusts.
          {
            key: 'Permissions-Policy',
            value:
              'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
          },
          { key: 'Content-Security-Policy-Report-Only', value: CONTENT_SECURITY_POLICY },
        ],
      },
    ]
  },
}

export default nextConfig
