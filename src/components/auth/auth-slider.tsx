'use client'

import { useEffect, useRef, useState } from 'react'

const SLIDES = [
  {
    headline: ['Your clients\u2019 social presence,', 'intelligently managed.'],
    italicWord: 'intelligently',
    body: 'Research, generate, schedule and analyse \u2014 all from one place built for agencies.',
  },
  {
    headline: ['From brief to published post in', 'minutes, not hours.'],
    italicWord: 'minutes,',
    body: 'AI-powered research finds the right angles. Generation writes on-brand copy. You just approve.',
  },
  {
    headline: ['Every client, every platform,', 'one dashboard.'],
    italicWord: 'one',
    body: 'Manage multiple clients without switching tools. Content pillars, brand voice, and scheduling \u2014 all in one place.',
  },
  {
    headline: ['Analytics that tell you what\u2019s', 'actually working.'],
    italicWord: 'actually',
    body: 'Real Instagram insights per post, per client. Know what content drives reach before you generate more.',
  },
]

const INTERVAL = 4000

export function AuthSlider() {
  const [current, setCurrent] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function startTimer() {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setCurrent((c) => (c + 1) % SLIDES.length)
    }, INTERVAL)
  }

  useEffect(() => {
    startTimer()
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function goTo(n: number) {
    setCurrent(n)
    startTimer()
  }

  return (
    <div className="flex flex-col justify-end flex-1 pb-1 relative">
      <div className="min-h-[220px] relative">
        {SLIDES.map((s, i) => (
          <div
            key={i}
            className="absolute inset-0 transition-all duration-500"
            style={{
              opacity: i === current ? 1 : 0,
              transform: i === current ? 'translateY(0)' : 'translateY(10px)',
              pointerEvents: i === current ? 'auto' : 'none',
            }}
          >
            <h2
              className="mb-3 leading-snug"
              style={{
                fontFamily: 'var(--font-display, Georgia, serif)',
                fontSize: '40px',
                fontWeight: 400,
                color: '#ECE8E1',
              }}
            >
              {s.headline.map((line, li) => (
                <span key={li}>
                  {line.split(' ').map((word, wi) => (
                    <span key={wi}>
                      {word === s.italicWord
                        ? <em style={{ fontStyle: 'italic', color: '#C07B55' }}>{word}</em>
                        : word
                      }
                      {' '}
                    </span>
                  ))}
                  {li < s.headline.length - 1 && <br />}
                </span>
              ))}
            </h2>
            <p style={{ fontSize: '16px', color: 'rgba(236,232,225,0.42)', lineHeight: 1.75, maxWidth: '380px' }}>
              {s.body}
            </p>
          </div>
        ))}
      </div>

      <div className="flex gap-2 mt-6">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            aria-label={`Go to slide ${i + 1}`}
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              border: 'none',
              cursor: 'pointer',
              transition: 'background 0.3s, transform 0.3s',
              background: i === current ? '#C07B55' : 'rgba(236,232,225,0.2)',
              transform: i === current ? 'scale(1.2)' : 'scale(1)',
              padding: 0,
            }}
          />
        ))}
      </div>
    </div>
  )
}
