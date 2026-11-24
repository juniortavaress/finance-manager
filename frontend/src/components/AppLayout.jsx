import { useEffect, useState, useSyncExternalStore } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import QuickAddTransaction from './QuickAddTransaction';
import { IconMenu } from './icons';
import { subscribePrivacy, valuesHidden } from '../utils/privacy';

export default function AppLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const location = useLocation();
  // fmt() le o modo privacidade direto; remontar a tela faz todos os valores se atualizarem.
  const hidden = useSyncExternalStore(subscribePrivacy, valuesHidden);

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
      <Sidebar key={`s${hidden}`} onClose={() => setMobileNavOpen(false)} />
      <main key={`m${hidden}`}>
        <Outlet />
      </main>
      <QuickAddTransaction />
    </div>
  );
}
