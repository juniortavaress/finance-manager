import { useEffect, useMemo, useState } from 'react';
import { useAccounts } from '../hooks/resources/useAccounts';
import { useCategories } from '../hooks/resources/useCategories';
import {
  checkingAccounts as filterChecking,
  creditCardAccounts as filterCreditCard,
  investmentAccounts as filterInvestment,
} from '../utils/accounts';
import { expenseCategories as filterExpense, incomeCategories as filterIncome } from '../utils/categories';
import { notifyDataChanged } from '../utils/dataChanged';
import TransactionModal from './modals/TransactionModal';

function isTypingTarget(element) {
  return element instanceof HTMLElement && (element.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName));
}

export default function QuickAddTransaction() {
  const [open, setOpen] = useState(false);
  const { accounts } = useAccounts();
  const { categories } = useCategories();
  const checkingAccounts = useMemo(() => filterChecking(accounts), [accounts]);
  const creditCardAccounts = useMemo(() => filterCreditCard(accounts), [accounts]);
  const investmentAccounts = useMemo(() => filterInvestment(accounts), [accounts]);
  const expenseCategories = useMemo(() => filterExpense(categories), [categories]);
  const incomeCategories = useMemo(() => filterIncome(categories), [categories]);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key.toLowerCase() !== 'n' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(document.activeElement) || document.querySelector('.modal-overlay.active')) return;
      e.preventDefault();
      setOpen(true);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  function handleCreated() {
    setOpen(false);
    notifyDataChanged();
  }

  return (
    <>
      <button type="button" className="quick-add-fab" onClick={() => setOpen(true)} aria-label="Nova transação">
        +<span className="quick-add-hint">Nova transação · N</span>
      </button>
      <TransactionModal
        open={open}
        checkingAccounts={checkingAccounts}
        creditCardAccounts={creditCardAccounts}
        investmentAccounts={investmentAccounts}
        expenseCategories={expenseCategories}
        incomeCategories={incomeCategories}
        onClose={() => setOpen(false)}
        onCreated={handleCreated}
      />
    </>
  );
}
