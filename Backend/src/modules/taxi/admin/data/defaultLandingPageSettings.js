// The landing-page CMS record created on first read. Both the admin and the public
// endpoint seed it, so the defaults live here once instead of drifting apart.
//
// Hero copy, contacts, socials and store links start empty: the landing page has
// its own Azanto copy and hides contact rows and store badges until an admin fills
// them in, instead of shipping someone else's phone number.
export const createDefaultLandingPageSettings = () => ({
  scope: 'default',
  video_url: '',
  logo_url: '',
  hero_title: '',
  hero_description: '',
  hero_image_url: '',
  why_us_image_url: '',
  social_links: { facebook: '', twitter: '', instagram: '', linkedin: '', youtube: '' },
  contact_email: '',
  contact_phone: '',
  contact_address: '',
  play_store_url: '',
  app_store_url: '',
  faqs: [
    {
      question: 'What can I do with Azanto?',
      answer: 'Book rides (cabs, bikes, autos, parcels, airport transfers and rentals) and order food from restaurants near you, all in one app.',
      order: 0,
    },
    {
      question: 'How do I book a ride?',
      answer: 'Sign in with your phone number, set your pickup and drop, choose a vehicle and confirm. A nearby driver is assigned right away.',
      order: 1,
    },
    {
      question: 'How do I pay?',
      answer: 'Pay with UPI, cards, wallets or cash. You always see the fare or bill before you confirm.',
      order: 2,
    },
    {
      question: 'How do I become a driver?',
      answer: 'Tap "Register as driver", fill in your details and upload your licence and vehicle documents. We verify them and get you on the road.',
      order: 3,
    },
    {
      question: 'How can my restaurant join?',
      answer: 'Tap "Partner with us" and sign in with your phone number to set up your restaurant, menu and payout details.',
      order: 4,
    },
  ],
  pages: {
    about_us: '<h1>About Azanto</h1><p>Azanto brings rides and food delivery together in one app. We connect people with verified drivers and the best local restaurants, safely and affordably.</p>',
    careers: '<h1>Careers at Azanto</h1><p>Join our team and help build how cities move and eat. We are always looking for engineers, product people, operations and support specialists.</p>',
    newsroom: '<h1>Azanto Newsroom</h1><p>Company announcements, service launches and updates from Azanto.</p>',
    terms_conditions: '<h1>Terms of Service</h1><p>By using the Azanto app or website, you agree to these Terms of Service. Azanto acts as a technology platform connecting users with third-party service providers. You must provide accurate details and use the platform lawfully.</p>',
    privacy_policy: '<h1>Privacy Policy</h1><p>We value your privacy. Azanto collects your personal information (name, contact, location) solely to match and execute rides, deliveries and orders. We do not sell your personal data to advertisers.</p>',
    refund_policy: '<h1>Refund Policy</h1><p>Refunds are processed for verified overcharges or cancelled bookings prior to partner dispatch. UPI and wallet refunds settle within 1 to 3 days, and bank cards settle in 5 to 10 days.</p>',
    cancellation_policy: '<h1>Cancellation Policy</h1><p>Users may cancel bookings free of charge before a driver accepts. Nominal cancellation charges apply once a driver is assigned or dispatch preparation has already started.</p>',
  },
});
