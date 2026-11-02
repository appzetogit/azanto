import React from 'react';
import { Download, ExternalLink, Shield, Zap, Star } from 'lucide-react';
import './LinksPage.css';
import bannerImg from '@/assets/images/links-banner.png';

const LinksPage = () => {
  const links = [
    {
      id: 'user',
      title: 'Azanto - User app',
      subtitle: 'Book rides, send parcels, and more.',
      description: 'Get where you need to go with ease. Request a ride or send packages across the city in minutes.',
      url: 'https://play.google.com/store/apps/details?id=com.Azanto.user',
      type: 'Customer App',
      icon: <Zap className="link-icon" />,
      color: '#FFB300'
    },
    {
      id: 'driver',
      title: 'Azanto Driver',
      subtitle: 'Drive and earn with Azanto.',
      description: 'Join our fleet of professional drivers. Flexible hours, great earnings, and a supportive community.',
      url: 'https://play.google.com/store/apps/details?id=com.Azanto.driver',
      type: 'Partner App',
      icon: <Shield className="link-icon" />,
      color: '#2563EB'
    }
  ];
  React.useEffect(() => {
    document.title = "Download Apps | Azanto";
  }, []);

  return (
    <div className="links-page-container">
      <nav className="links-nav">
        <div className="nav-container">
          <a href="/" className="nav-logo">
            <span className="logo-Azanto">Azanto</span>
          </a>
          <a href="/" className="back-home">Back to Home</a>
        </div>
      </nav>

      <div className="links-banner">
        <img src={bannerImg} alt="Azanto Banner" className="banner-image" />
        <div className="banner-gradient"></div>
      </div>

      <div className="links-content-wrapper">
        <header className="links-header">
          <h1 className="links-title">Download <span className="highlight">Azanto</span></h1>
          <p className="links-tagline">Choose the app that's right for you and start your journey today.</p>
        </header>


        <div className="links-grid">
          {links.map((link) => (
            <div key={link.id} className="link-card" style={{ '--accent-color': link.color }}>
              <div className="card-badge">{link.type}</div>
              <div className="card-icon-wrapper">
                {link.icon}
              </div>
              <h2 className="card-title">{link.title}</h2>
              <p className="card-subtitle">{link.subtitle}</p>
              <p className="card-description">{link.description}</p>
              
              <div className="card-features">
                <div className="feature">
                  <Star size={16} fill="currentColor" />
                  <span>Premium Service</span>
                </div>
                <div className="feature">
                  <Shield size={16} />
                  <span>Secure & Safe</span>
                </div>
              </div>

              <a 
                href={link.url} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="download-button"
              >
                <Download size={20} />
                <span>Download on Play Store</span>
                <ExternalLink size={16} className="ext-icon" />
              </a>
            </div>
          ))}
        </div>

        <footer className="links-footer">
          <p>© 2026 Azanto. All rights reserved.</p>
          <div className="footer-links">
            <a href="https://Azanto.com" target="_blank" rel="noopener noreferrer">Visit Website</a>
            <span className="dot"></span>
            <a href="/support">Support</a>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default LinksPage;
