import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/theme.css';
import './styles/layout.css';
import './styles/cards.css';
import './styles/lists.css';
import './styles/modal.css';
import './styles/login.css';
import './styles/loading.css';
import './styles/toast.css';
import './styles/friends.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
