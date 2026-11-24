import { Fragment, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useBanks } from '../hooks/resources/useBanks';
import { useAccounts } from '../hooks/resources/useAccounts';
import { checkingAccounts, sortBanks } from '../utils/accounts';
import { fmt } from '../utils/format';
import BankLogo from './BankLogo';
import { setValuesHidden, subscribePrivacy, valuesHidden } from '../utils/privacy';
import { canInstall, isStandalone, onInstallAvailabilityChange, promptInstall } from '../pwa';
import {
  IconDashboard,
  IconBank,
  IconSwap,
  IconInstallments,
  IconRepeat,
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
  IconDownload,
  IconEye,
  IconEyeOff,
} from './icons';

const NAV_GROUPS = [
  {
    label: 'Início',
    items: [
      { to: '/', label: 'Dashboard', icon: IconDashboard, end: true },
      { to: '/relatorios', label: 'Relatórios', icon: IconChart, disabled: true },
    ],
  },
  {
    label: 'Dinheiro',
    items: [
      { to: '/contas', label: 'Contas & Bancos', icon: IconBank, end: true, banks: true },
      { to: '/transacoes', label: 'Transações', icon: IconSwap },
      { to: '/recorrentes', label: 'Recorrentes', icon: IconRepeat },
      { to: '/parcelas', label: 'Parcelas', icon: IconInstallments },
    ],
  },
  {
    label: 'Investimentos',
    items: [
      { to: '/investimentos', label: 'Visão geral', icon: IconTrendUp, end: true },
      { to: '/investimentos/carteira', label: 'Carteira', icon: IconWallet, disabled: false },
      { to: '/investimentos/compras-vendas', label: 'Compras e vendas', icon: IconSwap, disabled: false },
      { to: '/investimentos/dividendos', label: 'Dividendos', icon: IconCoin, disabled: false },
      { to: '/cotacoes', label: 'Cotações', icon: IconChart },
    ],
  },
  {
    label: 'Amigos',
    items: [
      { to: '/amigos', label: 'Visão geral', icon: IconDashboard, end: true },
      { to: '/amigos/lista', label: 'Amigos', icon: IconUser },
      { to: '/amigos/grupos', label: 'Grupos', icon: IconUsers },
    ],
  },
  {
    label: 'Ajustes',
    items: [
      { install: true },
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
  const hidden = useSyncExternalStore(subscribePrivacy, valuesHidden);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { showInfo } = useToast();
  const { banks } = useBanks();
  const { accounts } = useAccounts();
  const showBanks = pathname.startsWith('/contas');
  const sortedBanks = useMemo(() => sortBanks(banks, accounts), [banks, accounts]);
  const [installable, setInstallable] = useState(canInstall());
  useEffect(() => onInstallAvailabilityChange(setInstallable), []);

  async function handleInstall() {
    // Le o estado atual do convite (nao o do render), que pode ter chegado depois.
    if (installable || canInstall()) {
      await promptInstall();
      return;
    }
    showInfo(
      'Se o Atmos já está instalado, abra-o pelo ícone do app. Senão, no navegador: menu ⋮ → "Instalar aplicativo". No iPhone: Compartilhar → "Adicionar à Tela de Início".'
    );
  }

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
            {group.items.map(({ to, label, icon: Icon, end, disabled, banks: hasBanks, install }) =>
              install ? (
                !isStandalone() && (
                  <button key="install" type="button" className="navitem navitem-button" onClick={handleInstall}>
                    <IconDownload />
                    Baixar app
                  </button>
                )
              ) : disabled ? (
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
                <Fragment key={to}>
                  <NavLink
                    to={to}
                    end={end}
                    className={({ isActive }) => `navitem${isActive ? ' active' : ''}`}
                  >
                    {({ isActive }) => (
                      <>
                        <Icon />
                        {label}
                        {isActive && (
                          <span
                            role="button"
                            tabIndex={0}
                            className={`navitem-eye${hidden ? ' on' : ''}`}
                            title={hidden ? 'Mostrar valores' : 'Ocultar valores'}
                            aria-label={hidden ? 'Mostrar valores' : 'Ocultar valores'}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setValuesHidden(!hidden);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                e.stopPropagation();
                                setValuesHidden(!hidden);
                              }
                            }}
                          >
                            {hidden ? <IconEyeOff /> : <IconEye />}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                  {hasBanks &&
                    showBanks &&
                    sortedBanks.map((bank) => {
                      const checking = checkingAccounts(accounts).find((a) => a.bank_id === bank.id);
                      return (
                        <NavLink
                          key={bank.id}
                          to={`/contas/${bank.id}`}
                          className={({ isActive }) => `navitem navitem-sub${isActive ? ' active' : ''}`}
                        >
                          <BankLogo bank={bank} size={18} className="navitem-logo" />
                          {bank.name}
                          {checking && <span className="navitem-balance num">{fmt(checking.balance, checking.currency)}</span>}
                        </NavLink>
                      );
                    })}
                </Fragment>
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
          <button className="user-menu-item" onClick={handleLogout}>
            <IconLogout />
            Sair
          </button>
        </div>
      </div>
    </div>
  );
}
