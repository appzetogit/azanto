import { useState } from 'react'
import { Plus } from 'lucide-react'

const DEFAULT_FAQS = [
  {
    question: 'What can I do with Azanto?',
    answer: 'Book rides (cabs, bikes, autos, parcels, airport transfers and rentals) and order food from restaurants near you, all in one app.',
  },
  {
    question: 'How do I pay?',
    answer: 'Pay with UPI, cards, wallets or cash. You always see the fare or bill before you confirm.',
  },
  {
    question: 'How do I become a driver?',
    answer: 'Tap "Register as driver", fill in your details and upload your licence and vehicle documents. We verify them and get you on the road.',
  },
  {
    question: 'How can my restaurant join?',
    answer: 'Tap "Partner with us" and sign in with your phone number to set up your restaurant, menu and payout details.',
  },
  {
    question: 'Is my ride safe?',
    answer: 'Every driver is verified, you can share your trip live with family, and an SOS button is always one tap away.',
  },
]

export default function FAQ({ settings }) {
  const faqs = settings?.faqs?.length ? settings.faqs : DEFAULT_FAQS
  const [open, setOpen] = useState(0)

  return (
    <section id="faq" className="scroll-mt-20 bg-azanto-50/50 py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-azanto-500">FAQ</p>
          <h2 className="mt-3 font-[Outfit] text-4xl font-bold tracking-tight text-azanto-ink sm:text-5xl">Questions, answered</h2>
        </div>

        <div className="mt-12 space-y-3">
          {faqs.map((faq, i) => {
            const isOpen = open === i
            return (
              <div key={faq.question} className="overflow-hidden rounded-2xl bg-white shadow-sm">
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? -1 : i)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-6 px-6 py-5 text-left"
                >
                  <span className="text-base font-semibold text-azanto-ink">{faq.question}</span>
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition ${
                      isOpen ? 'rotate-45 bg-azanto-500 text-white' : 'bg-azanto-50 text-azanto-600'
                    }`}
                  >
                    <Plus className="h-4 w-4" />
                  </span>
                </button>
                {isOpen && <p className="px-6 pb-6 leading-relaxed text-gray-600">{faq.answer}</p>}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
