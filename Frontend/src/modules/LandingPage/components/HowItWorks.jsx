import { Smartphone, MapPin, CheckCircle2, ShieldCheck, BadgeIndianRupee, Headphones, Navigation } from 'lucide-react'

const STEPS = [
  { Icon: Smartphone, title: 'Open Azanto', body: 'Sign in with your phone number in seconds.' },
  { Icon: MapPin, title: 'Choose ride or food', body: 'Set your pickup and drop, or pick a restaurant and dishes.' },
  { Icon: CheckCircle2, title: 'Track it live', body: 'Follow your driver or rider on the map until you arrive or your food does.' },
]

const PROMISES = [
  { Icon: ShieldCheck, title: 'Safety first', body: 'Verified drivers, trip sharing and an in-app SOS button.' },
  { Icon: BadgeIndianRupee, title: 'Upfront prices', body: 'See the fare or the bill before you confirm. No surprises.' },
  { Icon: Navigation, title: 'Live tracking', body: 'Real-time location for every ride and every delivery.' },
  { Icon: Headphones, title: 'Real support', body: 'Help when something goes wrong, right from the app.' },
]

export default function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-20 bg-azanto-50/50 py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-azanto-500">How it works</p>
          <h2 className="mt-3 font-[Outfit] text-4xl font-bold tracking-tight text-azanto-ink sm:text-5xl">Three taps and you're set</h2>
        </div>

        <ol className="mt-16 grid gap-6 md:grid-cols-3">
          {STEPS.map(({ Icon, title, body }, i) => (
            <li key={title} className="relative rounded-3xl bg-white p-8 shadow-[0_12px_40px_rgba(253,15,109,0.08)]">
              <span className="absolute right-6 top-5 font-[Outfit] text-6xl font-extrabold text-azanto-100">{i + 1}</span>
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-azanto-500 text-white">
                <Icon className="h-6 w-6" />
              </span>
              <h3 className="mt-6 text-xl font-semibold text-azanto-ink">{title}</h3>
              <p className="mt-2 text-gray-600">{body}</p>
            </li>
          ))}
        </ol>

        <div className="mt-20 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {PROMISES.map(({ Icon, title, body }) => (
            <div key={title} className="flex gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-azanto-600 shadow-sm">
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <h3 className="font-semibold text-azanto-ink">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-gray-600">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
