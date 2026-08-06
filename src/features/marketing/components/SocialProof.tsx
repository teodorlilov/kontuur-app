const agencies = ['About Social Media', 'Agency 2', 'Agency 3', 'Agency 4', 'Agency 5']

export function SocialProof() {
  return (
    <section className="mkt-pad border-y border-line bg-sunken py-5 text-center">
      <p className="mb-3 text-caption text-text3">
        Trusted by agencies in Bulgaria and across Europe
      </p>
      <div className="flex flex-wrap justify-center gap-8">
        {agencies.map((name) => (
          <span key={name} className="text-body font-medium text-text3 opacity-60">
            {name}
          </span>
        ))}
      </div>
    </section>
  )
}
