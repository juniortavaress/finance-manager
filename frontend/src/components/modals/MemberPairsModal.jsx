import { useAuth } from '../../context/AuthContext';
import { fmt } from '../../utils/format';
import ModalShell from './ModalShell';

/**
 * Resumo dos pares (quem deve pra quem) de um membro especifico dentro do
 * grupo -- aberto ao clicar em "Quitar" na linha principal do membro. Cada
 * par tem seu proprio botao de acertar/quitar, que dispara o modal final de
 * conta+valor (SettleUpModal ou RegisterReceiptModal).
 */
export default function MemberPairsModal({ open, onClose, memberName, pairs, members, onSettle, onReceive }) {
  const { user } = useAuth();

  if (!open) return null;

  return (
    <ModalShell open={open} onClose={onClose}>
      <div className="modal">
        <div className="modal-head">
          <h2>Saldo de {memberName} no grupo</h2>
          <span className="modal-close" onClick={onClose}>
            ✕
          </span>
        </div>
        <div className="modal-body">
          {pairs.length === 0 && <div className="empty-hint">{memberName} está quites com todo mundo no grupo.</div>}
          {pairs.map((t, idx) => {
            const from = members.find((mm) => mm.user_id === t.from_user_id)?.user;
            const to = members.find((mm) => mm.user_id === t.to_user_id)?.user;
            const iAmDebtor = t.from_user_id === user?.id;
            const iAmCreditor = t.to_user_id === user?.id;
            return (
              <div className="friend-row" key={idx} style={{ cursor: 'default' }}>
                <div className="friend-left">
                  <div className="friend-name">
                    {from?.name} → {to?.name}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div className="split-val num">{fmt(t.amount)}</div>
                  {iAmDebtor && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ padding: '6px 10px', fontSize: 12, flex: 'none' }}
                      onClick={() => onSettle(t.to_user_id, t.amount, to?.name)}
                    >
                      Acertar
                    </button>
                  )}
                  {iAmCreditor && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ padding: '6px 10px', fontSize: 12, flex: 'none' }}
                      onClick={() => onReceive(t.from_user_id, t.amount, from?.name)}
                    >
                      Quitar
                    </button>
                  )}
                  {!iAmDebtor && !iAmCreditor && (
                    <span style={{ fontSize: 11.5, color: 'var(--ink-faint)' }}>entre outros membros</span>
                  )}
                </div>
              </div>
            );
          })}

          <div className="modal-actions" style={{ marginTop: 16 }}>
            <div className="btn btn-ghost" onClick={onClose}>
              Fechar
            </div>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
