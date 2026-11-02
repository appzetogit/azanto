import { CarFront, Bike, Package, Plane, UtensilsCrossed, Store, Clock3, ArrowRight, ShieldCheck, Wallet } from 'lucide-react'

const SERVICES = [
  {
    id: 'rides',
    eyebrow: 'Azanto Rides',
    title: 'Get there, your way.',
    body: 'Cabs, bikes and autos at upfront prices, with live tracking from pickup to drop.',
    href: '/taxi/user',
    cta: 'Book a ride',
    Icon: CarFront,
    dark: false,
    features: [
      { Icon: CarFront, label: 'Cabs & autos' },
      { Icon: Bike, label: 'Bike rides' },
      { Icon: Package, label: 'Parcel delivery' },
      { Icon: Plane, label: 'Airport & rentals' },
    ],
  },
  {
    id: 'food',
    eyebrow: 'Azanto Food',
    title: 'Cravings, delivered.',
    body: 'Order from the best restaurants near you and follow your food all the way to your door.',
    href: '/food/user',
    cta: 'Order food',
    Icon: UtensilsCrossed,
    dark: true,
    features: [
      { Icon: Store, label: 'Top local restaurants' },
      { Icon: Clock3, label: 'Fast delivery' },
      { Icon: ShieldCheck, label: 'Hygiene-checked kitchens' },
      { Icon: Wallet, label: 'UPI, cards & cash' },
    ],
  },
]

export default function Services() {
  return (
    <section className="bg-white py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-azanto-500">Two services, one app</p>
          <h2 className="mt-3 font-[Outfit] text-4xl font-bold tracking-tight text-azanto-ink sm:text-5xl">
            Everything you need to move and eat
          </h2>
        </div>

        <div className="mt-16 grid gap-6 lg:grid-cols-2">
          {SERVICES.map(({ id, eyebrow, title, body, href, cta, Icon, dark, features }) => (
            <article
              key={id}
              id={id}
              className={`group relative scroll-mt-24 overflow-hidden rounded-[2rem] p-8 sm:p-10 ${
                dark ? 'bg-azanto-ink text-white' : 'bg-linear-to-br from-azanto-500 to-azanto-700 text-white'
              }`}
            >
              <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
              <span
                className={`flex h-14 w-14 items-center justify-center rounded-2xl ${
                  dark ? 'bg-azanto-500 text-white' : 'bg-white text-azanto-600'
                }`}
              >
                <Icon className="h-7 w-7" />
              </span>
              <p className="mt-8 text-sm font-semibold uppercase tracking-[0.18em] text-white/70">{eyebrow}</p>
              <h3 className="mt-2 font-[Outfit] text-3xl font-bold sm:text-4xl">{title}</h3>
              <p className="mt-4 max-w-md text-base leading-relaxed text-white/80">{body}</p>

              <ul className="mt-8 grid grid-cols-2 gap-3">
                {features.map(({ Icon: F, label }) => (
                  <li key={label} className="flex items-center gap-2.5 rounded-xl bg-white/10 px-3 py-3 text-sm font-medium">
                    <F className="h-4 w-4 shrink-0" /> {label}
                  </li>
                ))}
              </ul>

              <a
                href={href}
                className={`mt-10 inline-flex items-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold transition ${
                  dark ? 'bg-azanto-500 text-white hover:bg-azanto-600' : 'bg-white text-azanto-600 hover:bg-azanto-50'
                }`}
              >
                {cta} <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </a>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
