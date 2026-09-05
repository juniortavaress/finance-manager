import { dashboardApi } from '../../api/resources';
import { useFetch } from '../../hooks/useFetch';
import { fmt } from '../../utils/format';
import ModalShell from './ModalShell';

export default function BalanceByBankModal({ open, onClose }) {
  const { data, loading } = useFetch(() => dashboardApi.balanceByBank(), []);
  const banks = data?.banks || [];

  return (
    <ModalShell open={open} onClose={onClose}>
      <div className="modal modal-lg">
        <div className="modal-head">
          <h2>Saldo total</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body modal-body-scroll">
          {!loading && banks.length === 0 && <div className="empty-state">Nenhum banco cadastrado.</div>}
          {banks.flatMap(({ bank, balances }) =>
            (balances || []).map((b) => (
              <div className="bank-row" key={`${bank.id}-${b.currency}`}>
                <div className="bank-id">
                  <span className="bank-chip" style={{ background: bank.color_hex }} />
                  <div>
                    <div className="bank-name">{bank.name}</div>
                    <div className="bank-sub">
                      Conta corrente{b.currency !== 'BRL' ? ` · ${b.currency}` : ''}
                    </div>
                  </div>
                </div>
                <div className="bank-val num">{fmt(b.balance, b.currency)}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </ModalShell>
  );
}
