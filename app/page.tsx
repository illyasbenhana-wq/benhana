import Link from 'next/link'

export default function HomePage() {
  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#e8e6df', fontFamily: '"DM Sans", sans-serif', overflow: 'hidden' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,300&family=DM+Serif+Display:ital@0;1&display=swap" rel="stylesheet" />
      <style>{`
        * { box-sizing: border-box; }
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
        .hero-word { display: inline-block; animation: fadeUp 0.6s ease forwards; opacity: 0; }
      `}</style>

      {/* Nav */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px 48px', borderBottom: '1px solid #1a1a28' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: '#4a9eff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 2L14 5V8C14 11.31 11.46 14.42 8 15C4.54 14.42 2 11.31 2 8V5L8 2Z" stroke="white" strokeWidth="1.5" strokeLinejoin="round"/></svg>
          </div>
          <span style={{ fontFamily: '"DM Serif Display", serif', fontSize: 18 }}>EthosFi</span>
        </div>
        <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
          <Link href="/dashboard" style={{ fontSize: 13, color: '#666', textDecoration: 'none' }}>Lender login</Link>
          <Link href="/apply" style={{ fontSize: 13, padding: '8px 20px', borderRadius: 8, background: '#4a9eff', color: '#000', textDecoration: 'none', fontWeight: 500 }}>Apply now</Link>
        </div>
      </nav>

      {/* Hero */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '100px 48px 80px', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#0d1f33', border: '1px solid #1a3a5c', borderRadius: 20, padding: '6px 16px', marginBottom: 40, fontSize: 12, color: '#4a9eff' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4a9eff', animation: 'float 2s ease-in-out infinite' }} />
          EU AI Act compliant · Explainable by design
        </div>

        <h1 style={{ fontFamily: '"DM Serif Display", serif', fontSize: 72, fontWeight: 400, margin: '0 0 24px', lineHeight: 1.05, letterSpacing: '-0.02em' }}>
          <span className="hero-word" style={{ animationDelay: '0.1s' }}>Credit </span>
          <span className="hero-word" style={{ animationDelay: '0.2s', color: '#4a9eff', fontStyle: 'italic' }}>scoring </span>
          <span className="hero-word" style={{ animationDelay: '0.3s' }}>that </span>
          <br />
          <span className="hero-word" style={{ animationDelay: '0.4s' }}>sees the </span>
          <span className="hero-word" style={{ animationDelay: '0.5s', color: '#1D9E75' }}>whole person.</span>
        </h1>

        <p style={{ fontSize: 20, color: '#666', maxWidth: 580, margin: '0 auto 48px', lineHeight: 1.6, fontWeight: 300 }}>
          No credit history? No problem. EthosFi uses alternative signals — rent payments, gig income, savings habits — to assess creditworthiness fairly.
        </p>

        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/apply" style={{ padding: '16px 36px', borderRadius: 12, background: '#4a9eff', color: '#000', textDecoration: 'none', fontWeight: 500, fontSize: 16 }}>
            Get your EthoScore™ →
          </Link>
          <Link href="/dashboard" style={{ padding: '16px 36px', borderRadius: 12, border: '1px solid #2a2a38', color: '#888', textDecoration: 'none', fontSize: 16 }}>
            Lender demo
          </Link>
        </div>
      </div>

      {/* Social proof bar */}
      <div style={{ borderTop: '1px solid #1a1a28', padding: '24px 48px', display: 'flex', justifyContent: 'center', gap: 64 }}>
        {[
          { stat: '74%', label: 'of users lack traditional credit' },
          { stat: '<30s', label: 'to generate a score' },
          { stat: '5', label: 'explainable factors, always' },
        ].map(s => (
          <div key={s.label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontFamily: '"DM Serif Display", serif', color: '#4a9eff' }}>{s.stat}</div>
            <div style={{ fontSize: 13, color: '#444', marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* How it works */}
      <div style={{ maxWidth: 900, margin: '60px auto', padding: '0 48px' }}>
        <h2 style={{ fontFamily: '"DM Serif Display", serif', fontSize: 42, fontWeight: 400, textAlign: 'center', marginBottom: 48 }}>How it works</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
          {[
            { n: '01', title: 'You apply', body: 'Fill in a 3-step form. No credit check. We ask about your rent history, income, and gig work.' },
            { n: '02', title: 'AI scores you', body: 'Our model analyses your alternative signals and generates an EthoScore™ with a clear explanation.' },
            { n: '03', title: 'Lender decides', body: 'The lender sees your full profile — score, factors, rationale — and makes an informed decision.' },
          ].map(s => (
            <div key={s.n} style={{ background: '#13131a', border: '1px solid #1a1a28', borderRadius: 16, padding: '28px' }}>
              <div style={{ fontSize: 11, color: '#4a9eff', letterSpacing: '0.1em', marginBottom: 16 }}>{s.n}</div>
              <h3 style={{ fontFamily: '"DM Serif Display", serif', fontSize: 24, fontWeight: 400, margin: '0 0 12px' }}>{s.title}</h3>
              <p style={{ fontSize: 14, color: '#666', lineHeight: 1.6, margin: 0 }}>{s.body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Fatima story */}
      <div style={{ maxWidth: 680, margin: '0 auto 80px', padding: '0 48px', textAlign: 'center' }}>
        <div style={{ background: '#0d1f33', border: '1px solid #1a3a5c', borderRadius: 20, padding: '40px 48px' }}>
          <p style={{ fontSize: 32, fontFamily: '"DM Serif Display", serif', fontWeight: 400, fontStyle: 'italic', color: '#ccc', margin: '0 0 24px', lineHeight: 1.3 }}>
            "I've lived here for 5 years, paid rent every month, and never missed a bill — but every bank said no."
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center' }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#1a2a3a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4a9eff', fontWeight: 500 }}>FA</div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>Fatima A.</div>
              <div style={{ fontSize: 12, color: '#555' }}>Gig worker · EthoScore™ 74 · Approved</div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ borderTop: '1px solid #1a1a28', padding: '24px 48px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: '"DM Serif Display", serif', fontSize: 14, color: '#444' }}>EthosFi-AI</span>
        <span style={{ fontSize: 12, color: '#333' }}>EU AI Act compliant · Built for fairness</span>
      </div>
    </div>
  )
}
