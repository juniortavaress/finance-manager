import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAccounts } from '../hooks/resources/useAccounts';
import { useCategories } from '../hooks/resources/useCategories';
import {
  checkingAccounts as filterChecking,
  creditCardAccounts as filterCreditCard,
  investmentAccounts as filterInvestment,
} from '../utils/accounts';
import { expenseCategories as filterExpense, incomeCategories as filterIncome } from '../utils/categories';
import { notifyDataChanged } from '../utils/dataChanged';
import { IconPlus } from './icons';
import TransactionModal from './modals/TransactionModal';
import TransferModal from './modals/TransferModal';

function isTypingTarget(element) {
  return element instanceof HTMLElement && (element.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName));
}

export default function QuickAddTransaction() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState(null);
  const { pathname, search } = useLocation();
  const { accounts } = useAccounts();
  const { categories } = useCategories();
  const checkingAccounts = useMemo(() => filterChecking(accounts), [accounts]);
  const creditCardAccounts = useMemo(() => filterCreditCard(accounts), [accounts]);
  const investmentAccounts = useMemo(() => filterInvestment(accounts), [accounts]);
  const expenseCategories = useMemo(() => filterExpense(categories), [categories]);
  const incomeCategories = useMemo(() => filterIncome(categories), [categories]);

  // Transacoes e Dividendos ja tem o proprio botao de adicionar no topo.
  const hideButton = pathname === '/transacoes' || pathname === '/investimentos/dividendos';

  const defaultAccountRef = useMemo(() => {
    const bankId = pathname.match(/^\/contas\/([^/]+)/)?.[1];
    if (!bankId) return '';
    const checking = checkingAccounts.find((a) => a.bank_id === bankId);
    const card = creditCardAccounts.find((a) => a.bank_id === bankId);
    if (card && new URLSearchParams(search).get('tab') === 'cartao') return `credit:${card.id}`;
    if (checking) return `checking:${checking.id}`;
    return card ? `credit:${card.id}` : '';
  }, [pathname, search, checkingAccounts, creditCardAccounts]);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') setMenuOpen(false);
      if (e.key.toLowerCase() !== 'n' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(document.activeElement) || document.querySelector('.modal-overlay.active')) return;
      e.preventDefault();
      setMenuOpen(false);
      setModal('transaction');
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  function openModal(kind) {
    setMenuOpen(false);
    setModal(kind);
  }

  function handleCreated() {
    setModal(null);
    notifyDataChanged();
  }

  return (
    <>
      {menuOpen && <div className="quick-add-scrim" onClick={() => setMenuOpen(false)} />}
      <div className={`quick-add${menuOpen ? ' open' : ''}${hideButton ? ' hidden' : ''}`}>
        <div className="quick-add-menu">
          <button type="button" onClick={() => openModal('transaction')}>
            Nova transação <kbd>N</kbd>
          </button>
          <button type="button" onClick={() => openModal('transfer')}>
            Transferir
          </button>
        </div>
        <button
          type="button"
          className="quick-add-fab"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Ações rápidas"
          aria-expanded={menuOpen}
        >
          <IconPlus />
        </button>
      </div>

      <TransactionModal
        open={modal === 'transaction'}
        defaultAccountRef={defaultAccountRef}
        checkingAccounts={checkingAccounts}
        creditCardAccounts={creditCardAccounts}
        investmentAccounts={investmentAccounts}
        expenseCategories={expenseCategories}
        incomeCategories={incomeCategories}
        onClose={() => setModal(null)}
        onCreated={handleCreated}
      />
      <TransferModal
        open={modal === 'transfer'}
        checkingAccounts={checkingAccounts}
        investmentAccounts={investmentAccounts}
        onClose={() => setModal(null)}
        onCreated={handleCreated}
      />
    </>
  );
}
