import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  IconDashboard,
  IconBank,
  IconSwap,
  IconInstallments,
  IconRepeat,
  IconGrid,
  IconTrendUp,
  IconWallet,
  IconCoin,
  IconChart,
  IconGear,
  IconUser,
  IconUsers,
  IconLogout,
  IconChevronDown,
  IconClose,
} from './icons';

const NAV_GROUPS = [
  {
    label: 'Visão geral',
    items: [
      { to: '/', label: 'Dashboard', icon: IconDashboard, end: true },
      { to: '/contas', label: 'Contas & Bancos', icon: IconBank },
    ],
  },
  {
    label: 'Movimentação',
    items: [
      { to: '/transacoes', label: 'Transações', icon: IconSwap },
      { to: '/recorrentes', label: 'Recorrentes', icon: IconRepeat },
      { to: '/parcelas', label: 'Parcelas', icon: IconInstallments },
      { to: '/categorias', label: 'Categorias', icon: IconGrid },
    ],
  },
  {
    label: 'Amigos',
    items: [
      { to: '/amigos', label: 'Visão geral', icon: IconUser, end: true },
      { to: '/amigos/lista', label: 'Amigos', icon: IconUsers },
      { to: '/amigos/grupos', label: 'Grupos', icon: IconGrid },
    ],
  },
  {
    label: 'Investimentos',
    items: [
      { to: '/investimentos', label: 'Visão geral', icon: IconTrendUp, end: true },
      { to: '/investimentos/carteira', label: 'Carteira', icon: IconWallet, disabled: false },
      { to: '/investimentos/compras-vendas', label: 'Compras e vendas', icon: IconSwap, disabled: false },
      { to: '/investimentos/dividendos', label: 'Dividendos', icon: IconCoin, disabled: false },
    ],
  },
  {
    label: 'Outros',
    items: [
      { to: '/relatorios', label: 'Relatórios', icon: IconChart, disabled: true },
      { to: '/configuracoes', label: 'Configurações', icon: IconGear },
    ],
  },
];

function initials(name) {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

export default function Sidebar({ onClose }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { showInfo } = useToast();

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="sidebar">
      <div className="brand">
        <svg className="logo" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="1" y="1" width="38" height="38" rx="10" fill="#0F5C5C" />
          <circle cx="20" cy="20" r="11.5" stroke="#EEF2F0" strokeWidth="2" />
          <circle cx="20" cy="20" r="2.6" fill="#C0912F" />
          <line x1="20" y1="20" x2="20" y2="11.3" stroke="#EEF2F0" strokeWidth="2" strokeLinecap="round" />
          <line x1="20" y1="20" x2="26" y2="23.2" stroke="#C0912F" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <div>
          <div className="wordmark">Atmos</div>
          <span className="sub">gestão financeira</span>
        </div>
        <button type="button" className="sidebar-close" onClick={onClose} aria-label="Fechar menu">
          <IconClose />
        </button>
      </div>

      <nav>
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="navgroup-label">{group.label}</div>
            {group.items.map(({ to, label, icon: Icon, end, disabled }) =>
              disabled ? (
                <div
                  key={to}
                  className="navitem disabled"
                  onClick={() => showInfo(`${label} em breve.`)}
                >
                  <Icon />
                  {label}
                  <span className="navitem-soon">em breve</span>
                </div>
              ) : (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) => `navitem${isActive ? ' active' : ''}`}
                >
                  <Icon />
                  {label}
                </NavLink>
              )
            )}
          </div>
        ))}
      </nav>

      <div className="sidebar-foot">
        <button className="user-card" onClick={() => setMenuOpen((v) => !v)}>
          <div className="user-avatar">{initials(user?.name)}</div>
          <div className="user-info">
            <div className="user-name">{user?.name}</div>
            <div className="user-email">{user?.email}</div>
          </div>
          <IconChevronDown className="chev" />
        </button>
        <div className={`user-menu${menuOpen ? ' open' : ''}`}>
          <NavLink to="/configuracoes" className="user-menu-item" onClick={() => setMenuOpen(false)}>
            <IconUser />
            Meu perfil
          </NavLink>
          <NavLink to="/configuracoes" className="user-menu-item" onClick={() => setMenuOpen(false)}>
            <IconGear />
            Configurações
          </NavLink>
          <button className="user-menu-item" onClick={handleLogout}>
            <IconLogout />
            Sair
          </button>
        </div>
      </div>
    </div>
  );
}
