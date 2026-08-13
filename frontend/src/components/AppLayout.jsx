import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import { IconMenu } from './icons';

export default function AppLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileNavOpen]);

  return (
    <div className={`app-shell${mobileNavOpen ? ' mobile-nav-open' : ''}`}>
      <button
        type="button"
        className="mobile-nav-toggle"
        onClick={() => setMobileNavOpen(true)}
        aria-label="Abrir menu"
      >
        <IconMenu />
      </button>
      {mobileNavOpen && <div className="mobile-nav-overlay" onClick={() => setMobileNavOpen(false)} />}
      <Sidebar onClose={() => setMobileNavOpen(false)} />
      <main>
        <Outlet />
      </main>
    </div>
  );
}
