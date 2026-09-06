import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useFetch } from '../hooks/useFetch';
import { useToast } from '../context/ToastContext';
import { marketDataApi } from '../api/resources';
import { IconPencil, IconTrash } from '../components/icons';
import EditProfileModal from '../components/modals/EditProfileModal';
import MarketCorporateEventModal from '../components/modals/MarketCorporateEventModal';

const EVENT_TYPE_LABELS = {
  split: 'Desdobramento/Grupamento',
  merger: 'Incorporação',
};

export default function Settings() {
  const { user } = useAuth();
  const { banks, accounts } = useData();
  const { showSuccess, showError } = useToast();
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [eventModalOpen, setEventModalOpen] = useState(false);

  const cardAccounts = accounts.filter((a) => a.type === 'credit_card');

  const {
    data: eventsData,
    reload: reloadEvents,
  } = useFetch((signal) => (user?.is_admin ? marketDataApi.listCorporateEvents(signal) : Promise.resolve(null)), [user?.is_admin]);
  const events = eventsData?.market_corporate_events || [];

  async function handleRemoveEvent(id) {
    try {
      await marketDataApi.removeCorporateEvent(id);
      showSuccess('Evento removido com sucesso.');
      reloadEvents();
    } catch (err) {
      showError(err.message || 'Não foi possível remover o evento.');
    }
  }

  return (
    <div className="screen active">
      <div className="topbar">
        <h1>Configurações</h1>
      </div>
      <div className="grid grid-2">
        <div className="card">
          <h3>
            Perfil
            <button
              type="button"
              title="Editar perfil"
              onClick={() => setEditModalOpen(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 26,
                height: 26,
                borderRadius: 7,
                border: 'none',
                background: 'transparent',
                color: 'var(--ink-faint)',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg)';
                e.currentTarget.style.color = 'var(--teal)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--ink-faint)';
              }}
            >
              <IconPencil style={{ width: 13, height: 13 }} />
            </button>
          </h3>
          <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 6 }}>
            <b style={{ color: 'var(--ink)' }}>{user?.name}</b>
          </p>
          <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{user?.email}</p>
          <p style={{ fontSize: 12, color: 'var(--ink-faint)', marginTop: 10 }}>
            Moeda padrão: {user?.currency_default}
          </p>
        </div>
        <div className="card">
          <h3>Bancos e contas</h3>
          <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 10 }}>
            {banks.length} banco(s) cadastrado(s), {cardAccounts.length} cartão(ões) de crédito.
          </p>
          {banks.map((b) => (
            <div className="bank-row" key={b.id}>
              <div className="bank-id">
                <span className="bank-chip" style={{ background: b.color_hex }} />
                <div className="bank-name">{b.name}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {user?.is_admin && (
        <div className="grid grid-2" style={{ marginTop: 20 }}>
          <div className="card">
            <h3>
              Eventos societários (mercado)
              <button
                type="button"
                className="btn btn-primary"
                style={{ marginLeft: 12, padding: '4px 12px', fontSize: 12 }}
                onClick={() => setEventModalOpen(true)}
              >
                Novo evento
              </button>
            </h3>
          
            {events.length === 0 && (
              <p style={{ fontSize: 13, color: 'var(--ink-faint)' }}>Nenhum evento registrado ainda.</p>
            )}
            {events.map((ev) => (
              <div className="bank-row" key={ev.id}>
                <div className="bank-id">
                  <div className="bank-name">
                    {EVENT_TYPE_LABELS[ev.type]} — {ev.target_code}
                    {ev.source_code ? ` (origem: ${ev.source_code})` : ''}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink-faint)' }}>
                    {ev.date} · proporção {ev.ratio}
                    {ev.note ? ` · ${ev.note}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  title="Remover"
                  onClick={() => handleRemoveEvent(ev.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 26,
                    height: 26,
                    borderRadius: 7,
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--ink-faint)',
                    cursor: 'pointer',
                  }}
                >
                  <IconTrash style={{ width: 13, height: 13 }} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <EditProfileModal open={editModalOpen} onClose={() => setEditModalOpen(false)} />
      {user?.is_admin && (
        <MarketCorporateEventModal
          open={eventModalOpen}
          onClose={() => setEventModalOpen(false)}
          onSaved={() => {
            setEventModalOpen(false);
            reloadEvents();
          }}
        />
      )}
    </div>
  );
}
