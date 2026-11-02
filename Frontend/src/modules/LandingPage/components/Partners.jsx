import { CarFront, Store, ArrowRight, Check } from 'lucide-react'

const PARTNERS = [
  {
    Icon: CarFront,
    title: 'Drive with Azanto',
    body: 'Earn on your own schedule with weekly payouts and steady trip demand.',
    points: ['Flexible hours', 'Fast onboarding', 'Transparent earnings'],
    cta: 'Register as driver',
    href: '/taxi/driver',
  },
  {
    Icon: Store,
    title: 'Grow your restaurant',
    body: 'Reach more customers nearby and manage every order from one dashboard.',
    points: ['New customers daily', 'Easy menu management', 'Regular settlements'],
    cta: 'Partner with us',
    href: '/food/restaurant/login',
  },
]

export default function Partners() {
  return (
    <section id="partners" className="scroll-mt-20 bg-white py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-azanto-500">Partners</p>
          <h2 className="mt-3 font-[Outfit] text-4xl font-bold tracking-tight text-azanto-ink sm:text-5xl">Grow with Azanto</h2>
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-2">
          {PARTNERS.map(({ Icon, title, body, points, cta, href }) => (
            <div key={title} className="flex flex-col rounded-[2rem] border border-gray-100 bg-white p-8 shadow-[0_12px_40px_rgba(23,20,26,0.06)] sm:p-10">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-azanto-50 text-azanto-600">
                <Icon className="h-7 w-7" />
              </span>
              <h3 className="mt-6 font-[Outfit] text-2xl font-bold text-azanto-ink">{title}</h3>
              <p className="mt-3 text-gray-600">{body}</p>
              <ul className="mt-6 space-y-3">
                {points.map((p) => (
                  <li key={p} className="flex items-center gap-3 text-sm font-medium text-gray-700">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-azanto-500 text-white">
                      <Check className="h-3 w-3" />
                    </span>
                    {p}
                  </li>
                ))}
              </ul>
              <a
                href={href}
                className="mt-auto inline-flex w-fit items-center gap-2 pt-8 text-sm font-semibold text-azanto-600 hover:text-azanto-700"
              >
                {cta} <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
