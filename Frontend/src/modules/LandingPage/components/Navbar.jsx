import { useEffect, useState } from 'react'
import { Menu, X } from 'lucide-react'
import { BrandLockup } from './Brand'

const LINKS = [
  { name: 'Rides', href: '#rides' },
  { name: 'Food', href: '#food' },
  { name: 'How it works', href: '#how' },
  { name: 'Partners', href: '#partners' },
  { name: 'FAQ', href: '#faq' },
]

const scrollTo = (e, href) => {
  e.preventDefault()
  document.querySelector(href)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export default function Navbar() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled || open ? 'bg-white/90 shadow-[0_8px_30px_rgba(23,20,26,0.06)] backdrop-blur-xl' : 'bg-transparent'
      }`}
    >
      <nav className="mx-auto flex h-18 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <a href="/" aria-label="Azanto home">
          <BrandLockup />
        </a>

        <div className="hidden items-center gap-8 md:flex">
          {LINKS.map((link) => (
            <a
              key={link.name}
              href={link.href}
              onClick={(e) => scrollTo(e, link.href)}
              className="text-[15px] font-medium text-gray-600 transition-colors hover:text-azanto-600"
            >
              {link.name}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <a href="/food/user" className="rounded-full px-5 py-2.5 text-sm font-semibold text-azanto-ink transition hover:bg-azanto-50">
            Order food
          </a>
          <a
            href="/taxi/user"
            className="rounded-full bg-azanto-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-azanto-500/30 transition hover:bg-azanto-600"
          >
            Book a ride
          </a>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-xl p-2 text-azanto-ink md:hidden"
          aria-label={open ? 'Close menu' : 'Open menu'}
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </nav>

      {open && (
        <div className="border-t border-gray-100 bg-white px-4 pb-6 pt-2 md:hidden">
          {LINKS.map((link) => (
            <a
              key={link.name}
              href={link.href}
              onClick={(e) => {
                scrollTo(e, link.href)
                setOpen(false)
              }}
              className="block rounded-xl px-3 py-3 text-base font-medium text-gray-700 hover:bg-azanto-50"
            >
              {link.name}
            </a>
          ))}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <a href="/food/user" className="rounded-xl border border-azanto-200 py-3 text-center text-sm font-semibold text-azanto-600">
              Order food
            </a>
            <a href="/taxi/user" className="rounded-xl bg-azanto-500 py-3 text-center text-sm font-semibold text-white">
              Book a ride
            </a>
          </div>
        </div>
      )}
    </header>
  )
}
