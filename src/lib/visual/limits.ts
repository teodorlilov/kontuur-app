/**
 * Max parallel gpt-image-2 requests a browser fires (each holds a ~60s serverless call).
 * 6 lets a full carousel generate in one wave while keeping cost blast-radius and
 * fal/Vercel concurrency bounded. Client-safe: no fal import here.
 */
export const MAX_CONCURRENT_VISUAL_REQUESTS = 6
