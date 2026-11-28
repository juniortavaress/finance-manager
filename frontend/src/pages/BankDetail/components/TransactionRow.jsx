import { IconPencil } from '../../../components/icons';
import { fmt, fmtDateShort } from '../../../utils/format';

export default function TransactionRow({ transaction, currency, balanceAfter, onEdit }) {
  const isIncome = transaction.type === 'income';
  const isTransfer = transaction.is_transfer;
  const category = transaction.category;

  return (
    <div className="tx-row tx-row-clickable" onClick={onEdit}>
      <div className="tx-left">
        <div className="tx-icon" style={{ background: !isTransfer && isIncome ? 'var(--teal-soft)' : 'var(--bg)' }}>
          {isTransfer ? '🔁' : transaction.group_icon || category?.icon || '📁'}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="tx-desc-line">
            <div className="tx-desc">{transaction.description}</div>
            <IconPencil className="tx-edit-icon" />
          </div>
          <div className="tx-meta">
            {category?.name} · {fmtDateShort(transaction.date)}
            {transaction.status === 'scheduled' ? ' · agendada' : ''}
          </div>
        </div>
      </div>
      <div className="tx-right">
        <div className={`tx-val num ${isTransfer ? '' : isIncome ? 'pos' : 'neg'}`}>
          {fmt(isIncome ? transaction.amount : -transaction.amount, currency)}
        </div>
        {balanceAfter !== undefined && (
          <div className="tx-meta num" title="Saldo após este lançamento">
            saldo {fmt(balanceAfter, currency)}
          </div>
        )}
      </div>
    </div>
  );
}
