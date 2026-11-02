import React, { useEffect, useState, lazy, Suspense } from 'react'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import api from '../Taxi/shared/api/axiosInstance'

const Services = lazy(() => import('./components/Services'))
const HowItWorks = lazy(() => import('./components/HowItWorks'))
const Partners = lazy(() => import('./components/Partners'))
const FAQ = lazy(() => import('./components/FAQ'))
const Footer = lazy(() => import('./components/Footer'))

export default function LandingPage() {
  const [landingSettings, setLandingSettings] = useState(null)

  useEffect(() => {
    document.title = 'Azanto - Rides & Food Delivery'

    let metaDesc = document.querySelector('meta[name="description"]')
    if (!metaDesc) {
      metaDesc = document.createElement('meta')
      metaDesc.name = 'description'
      document.head.appendChild(metaDesc)
    }
    metaDesc.setAttribute(
      'content',
      'Azanto: book cabs, bikes, autos and parcels, or order food from restaurants near you, all in one app.'
    )

    // Hero copy, FAQs, store links and contact details are editable from the admin
    // landing-page settings; every section falls back to built-in copy without them.
    const fetchLandingSettings = async () => {
      try {
        const res = await api.get('/common/landing-page/settings')
        if (res?.success && res?.data) setLandingSettings(res.data)
      } catch (err) {
        console.error('Error loading landing page settings:', err)
      }
    }
    fetchLandingSettings()
  }, [])

  return (
    <div className="min-h-screen bg-white font-[Poppins] text-azanto-ink antialiased overflow-x-clip">
      <Navbar />
      <main>
        <Hero settings={landingSettings} />
        <Suspense fallback={null}>
          <Services />
          <HowItWorks />
          <Partners />
          <FAQ settings={landingSettings} />
        </Suspense>
      </main>
      <Suspense fallback={null}>
        <Footer settings={landingSettings} />
      </Suspense>
    </div>
  )
}
