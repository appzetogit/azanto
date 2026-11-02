import { Mail, Phone, MapPin } from 'lucide-react'
import { AZANTO_LOGO, BrandLockup, BrandWave } from './Brand'
import StoreBadges from './StoreBadges'

const COLUMNS = [
  {
    title: 'Services',
    links: [
      { label: 'Book a ride', href: '/taxi/user' },
      { label: 'Order food', href: '/food/user' },
    ],
  },
  {
    title: 'Partners',
    links: [
      { label: 'Drive with Azanto', href: '/taxi/driver' },
      { label: 'Restaurant partners', href: '/food/restaurant/login' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'Support', href: '/support' },
      { label: 'Terms', href: '/terms?tab=terms' },
      { label: 'Privacy', href: '/terms?tab=privacy' },
    ],
  },
]

export default function Footer({ settings }) {
  // Contact details are only shown once they are set in the admin landing settings.
  const contacts = [
    { Icon: Phone, value: settings?.contact_phone, href: settings?.contact_phone && `tel:${settings.contact_phone}` },
    { Icon: Mail, value: settings?.contact_email, href: settings?.contact_email && `mailto:${settings.contact_email}` },
    { Icon: MapPin, value: settings?.contact_address },
  ].filter((c) => c.value)

  return (
    <footer>
      {/* Download band */}
      <section className="relative overflow-hidden bg-linear-to-br from-azanto-500 via-azanto-600 to-azanto-800 py-20 text-white">
        <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="relative mx-auto flex max-w-7xl flex-col items-center gap-10 px-4 text-center sm:px-6 lg:flex-row lg:justify-between lg:text-left lg:px-8">
          <div className="max-w-xl">
            <h2 className="font-[Outfit] text-4xl font-bold sm:text-5xl">Your next ride and meal are a tap away.</h2>
            <p className="mt-4 text-lg text-white/80">Get Azanto and do both from one app.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3 lg:justify-start">
              <a href="/taxi/user" className="rounded-xl bg-white px-6 py-3.5 text-sm font-semibold text-azanto-600 hover:bg-azanto-50">
                Book a ride
              </a>
              <a href="/food/user" className="rounded-xl bg-azanto-ink px-6 py-3.5 text-sm font-semibold text-white hover:bg-black">
                Order food
              </a>
            </div>
            <StoreBadges settings={settings} tone="light" className="mt-6 justify-center lg:justify-start" />
          </div>
          <div className="rounded-[2.5rem] bg-white p-8 shadow-2xl shadow-azanto-900/30">
            <img src={AZANTO_LOGO} alt="Azanto" className="h-40 w-auto" loading="lazy" />
          </div>
        </div>
        <BrandWave className="pointer-events-none absolute inset-x-0 bottom-0 h-16 w-full" color="#17141a" />
      </section>

      <div className="bg-azanto-ink text-white">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 md:grid-cols-2 lg:grid-cols-5 lg:px-8">
          <div className="lg:col-span-2">
            <BrandLockup tone="light" />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/60">Rides and food delivery, together in one app.</p>
            {contacts.length > 0 && (
              <ul className="mt-6 space-y-3 text-sm text-white/70">
                {contacts.map(({ Icon, value, href }) => (
                  <li key={value} className="flex items-start gap-3">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-azanto-400" />
                    {href ? <a href={href} className="hover:text-white">{value}</a> : <span>{value}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-white/50">{col.title}</h3>
              <ul className="mt-4 space-y-3">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <a href={link.href} className="text-sm text-white/80 transition hover:text-azanto-400">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-white/10">
          <p className="mx-auto max-w-7xl px-4 py-6 text-sm text-white/50 sm:px-6 lg:px-8">
            © {new Date().getFullYear()} Azanto. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}
