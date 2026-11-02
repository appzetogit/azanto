import { CarFront, UtensilsCrossed, MapPin, Clock3, Star } from 'lucide-react'
import { AZANTO_MARK, BrandWave } from './Brand'
import StoreBadges from './StoreBadges'

export default function Hero({ settings }) {
  const title = settings?.hero_title
  const description =
    settings?.hero_description ||
    'Book a ride in seconds or get your favourite food delivered hot. Azanto brings both into one simple app.'

  return (
    <section className="relative overflow-hidden bg-linear-to-b from-azanto-50/70 via-white to-white pt-28 pb-24 sm:pt-32 lg:pb-32">
      <div className="pointer-events-none absolute -right-40 -top-40 h-[32rem] w-[32rem] rounded-full bg-azanto-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -left-32 top-1/2 h-80 w-80 rounded-full bg-azanto-100/60 blur-3xl" />

      <div className="relative mx-auto grid max-w-7xl items-center gap-16 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-azanto-200 bg-white px-4 py-1.5 text-sm font-semibold text-azanto-600 shadow-sm">
            <MapPin className="h-4 w-4" /> Rides & food, one app
          </span>

          <h1 className="mt-6 font-[Outfit] text-5xl font-extrabold leading-[1.05] tracking-tight text-azanto-ink sm:text-6xl lg:text-7xl">
            {title || (
              <>
                Ride anywhere.
                <br />
                <span className="bg-linear-to-r from-azanto-500 to-azanto-700 bg-clip-text text-transparent">Eat anything.</span>
              </>
            )}
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-gray-600">{description}</p>

          <div className="mt-10 flex flex-col gap-4 sm:flex-row">
            <a
              href="/taxi/user"
              className="inline-flex items-center justify-center gap-2.5 rounded-2xl bg-azanto-500 px-7 py-4 text-base font-semibold text-white shadow-xl shadow-azanto-500/30 transition hover:-translate-y-0.5 hover:bg-azanto-600"
            >
              <CarFront className="h-5 w-5" /> Book a ride
            </a>
            <a
              href="/food/user"
              className="inline-flex items-center justify-center gap-2.5 rounded-2xl bg-azanto-ink px-7 py-4 text-base font-semibold text-white shadow-xl shadow-black/10 transition hover:-translate-y-0.5 hover:bg-black"
            >
              <UtensilsCrossed className="h-5 w-5" /> Order food
            </a>
          </div>

          <StoreBadges settings={settings} className="mt-10" />
        </div>

        {/* Visual */}
        <div className="relative mx-auto w-full max-w-lg">
          <div className="relative aspect-square overflow-hidden rounded-[3rem] bg-linear-to-br from-azanto-500 via-azanto-600 to-azanto-800 shadow-2xl shadow-azanto-700/30">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.25),transparent_55%)]" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="rounded-[2.5rem] bg-white p-10 shadow-2xl shadow-azanto-900/40">
                <img src={AZANTO_MARK} alt="Azanto" className="h-40 w-auto sm:h-48" />
              </div>
            </div>
            <BrandWave className="absolute inset-x-0 bottom-0 h-28 w-full" color="#ffffff" />
          </div>

          <div className="absolute -left-4 top-10 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-xl sm:-left-10">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-azanto-50 text-azanto-600">
              <CarFront className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-azanto-ink">Driver arriving</p>
              <p className="flex items-center gap-1 text-xs text-gray-500">
                <Clock3 className="h-3.5 w-3.5" /> 3 min away
              </p>
            </div>
          </div>

          <div className="absolute -right-4 bottom-16 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-xl sm:-right-10">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-azanto-ink text-white">
              <UtensilsCrossed className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-azanto-ink">Order on the way</p>
              <p className="flex items-center gap-1 text-xs text-gray-500">
                <Star className="h-3.5 w-3.5 fill-azanto-500 text-azanto-500" /> Hot & fresh
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
