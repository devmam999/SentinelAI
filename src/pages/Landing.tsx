import Navbar from '../components/Navbar'
import Hero from '../components/Hero'
import Features from '../components/Features'
import HowItWorks from '../components/HowItWorks'

export default function Landing() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
      {/* Navbar stays outside the animated wrapper: it's position:fixed, and a
          transformed ancestor would break its fixed positioning on scroll. */}
      <Navbar />
      <div className="animate-fade-down">
        <Hero />
        <Features />
        <HowItWorks />
      </div>
    </div>
  )
}
