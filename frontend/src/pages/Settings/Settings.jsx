import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useFetch } from '../../hooks/useFetch';
import { useToast } from '../../context/ToastContext';
import { marketDataApi } from '../../api/resources';
import { IconGrid, IconDownload, IconLock, IconSliders, IconTrash, IconUser, IconTrendUp } from '../../components/icons';
import CategoriesSection from './components/CategoriesSection';
import DataSection from './components/DataSection';
import PreferencesSection from './components/PreferencesSection';
import SecuritySection from './components/SecuritySection';
import { CURRENCY_OPTIONS } from '../../utils/currency';
import MarketCorporateEventModal from './components/MarketCorporateEventModal';
import { useFormError } from '../../hooks/useFormError';

const EVENT_TYPE_LABELS = {
  split: 'Desdobramento/Grupamento',
  merger: 'Incorporação',
};

function initials(name) {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

function ProfileSection({ user }) {
  const { updateUser } = useAuth();
  const { showSuccess, showError } = useToast();
  const [name, setName] = useState(user?.name || '');
  const [currencyDefault, setCurrencyDefault] = useState(user?.currency_default || 'BRL');
  const [, setError] = useFormError();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(user?.name || '');
    setCurrencyDefault(user?.currency_default || 'BRL');
  }, [user]);

  const dirty = name.trim() !== (user?.name || '') || currencyDefault !== (user?.currency_default || 'BRL');

  function discard() {
    setName(user?.name || '');
    setCurrencyDefault(user?.currency_default || 'BRL');
    setError('');
  }

  async function handleSave(e) {
    e.preventDefault();
    setError('');
    if (!name.trim()) return setError('Informe seu nome.');
    setSaving(true);
    try {
      await updateUser({ name: name.trim(), currency_default: currencyDefault });
      showSuccess('Perfil atualizado com sucesso.');
    } catch (err) {
      const message = err.message || 'Não foi possível atualizar o perfil.';
      setError(message);
      showError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="set-section-head">
        <div>
          <h2>Perfil</h2>
          <p>Seus dados de acesso e preferências da conta.</p>
        </div>
      </div>

      <div className="set-card set-profile">
        <div className="set-avatar">{initials(name || user?.name)}</div>
        <div className="set-profile-info">
          <div className="set-profile-name">{name || user?.name}</div>
          <div className="set-profile-email">{user?.email}</div>
        </div>
      </div>

      <form className="set-card set-form" onSubmit={handleSave}>

        <div className="set-field">
          <div className="set-field-label">
            <label htmlFor="set-name">Nome</label>
            <span>Como você aparece para amigos e grupos.</span>
          </div>
          <input id="set-name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="set-field">
          <div className="set-field-label">
            <label htmlFor="set-email">E-mail</label>
            <span>Usado para entrar. Não pode ser alterado.</span>
          </div>
          <input id="set-email" type="text" value={user?.email || ''} disabled />
        </div>

        <div className="set-field">
          <div className="set-field-label">
            <label htmlFor="set-currency">Moeda padrão</label>
            <span>
              Troca só o símbolo de exibição, sem converter valores. Contas com moeda própria mantêm a delas.
            </span>
          </div>
          <select id="set-currency" value={currencyDefault} onChange={(e) => setCurrencyDefault(e.target.value)}>
            {CURRENCY_OPTIONS.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        {dirty && (
          <div className="set-savebar">
            <span>Você tem alterações não salvas.</span>
            <div>
              <button type="button" className="set-btn" onClick={discard} disabled={saving}>
                Descartar
              </button>
              <button type="submit" className="set-btn set-btn-primary" disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          </div>
        )}
      </form>
    </>
  );
}

function MarketSection({ events, onNew, onRemove }) {
  return (
    <>
      <div className="set-section-head">
        <div>
          <h2>Eventos societários</h2>
          <p>Desdobramentos, grupamentos e incorporações aplicados às posições do mercado.</p>
        </div>
        <button type="button" className="set-btn set-btn-primary" onClick={onNew}>
          + Novo evento
        </button>
      </div>

      <div className="set-card set-list">
        {events.length === 0 && <div className="set-empty">Nenhum evento registrado ainda.</div>}
        {events.map((ev) => (
          <div className="set-row" key={ev.id}>
            <div>
              <div className="set-row-title">
                {EVENT_TYPE_LABELS[ev.type]} — {ev.target_code}
                {ev.source_code ? ` (origem: ${ev.source_code})` : ''}
              </div>
              <div className="set-row-sub">
                {ev.date} · proporção {ev.ratio}
                {ev.note ? ` · ${ev.note}` : ''}
              </div>
            </div>
            <button type="button" title="Remover" className="set-icon-btn" onClick={() => onRemove(ev.id)}>
              <IconTrash style={{ width: 14, height: 14 }} />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const { showSuccess, showError } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [eventModalOpen, setEventModalOpen] = useState(false);

  const { data: eventsData, reload: reloadEvents } = useFetch(
    (signal) => (user?.is_admin ? marketDataApi.listCorporateEvents(signal) : Promise.resolve(null)),
    [user?.is_admin]
  );
  const events = eventsData?.market_corporate_events || [];

  const sections = [
    { key: 'perfil', label: 'Perfil', icon: IconUser },
    { key: 'categorias', label: 'Categorias', icon: IconGrid },
    { key: 'preferencias', label: 'Preferências', icon: IconSliders },
    { key: 'dados', label: 'Meus dados', icon: IconDownload },
    { key: 'seguranca', label: 'Segurança', icon: IconLock },
    user?.is_admin && { key: 'mercado', label: 'Eventos societários', icon: IconTrendUp },
  ].filter(Boolean);

  const requested = searchParams.get('secao');
  const active = sections.some((s) => s.key === requested) ? requested : sections[0].key;

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

      <div className="set-layout">
        <nav className="set-nav" aria-label="Seções de configurações">
          {sections.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              className={`set-nav-item${active === key ? ' active' : ''}`}
              onClick={() => setSearchParams({ secao: key }, { replace: true })}
            >
              <Icon />
              {label}
            </button>
          ))}
        </nav>

        <div className="set-content">
          {active === 'perfil' && <ProfileSection user={user} />}
          {active === 'categorias' && <CategoriesSection />}
          {active === 'preferencias' && <PreferencesSection />}
          {active === 'dados' && <DataSection />}
          {active === 'seguranca' && <SecuritySection />}
          {active === 'mercado' && user?.is_admin && (
            <MarketSection events={events} onNew={() => setEventModalOpen(true)} onRemove={handleRemoveEvent} />
          )}
        </div>
      </div>

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
