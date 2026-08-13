import { useEffect, useMemo, useState } from 'react';
import { categoriesApi } from '../../api/resources';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { maskToNumber, numberToMasked } from '../../utils/currency';
import { IconTrash } from '../icons';
import CurrencyInput from '../CurrencyInput';
import ModalShell from './ModalShell';
import ConfirmDeleteModal from './ConfirmDeleteModal';

const ICON_OPTIONS = [
  '🛒', '🏠', '🚗', '💻', '🍽️', '➕', '🎬', '💰', '💼', '✨', '📁', '🐾', '👕', '🎓', '🌍', '✈️', '🎁', '⚽',
  '💊', '🏥', '❤️', '🤝', '🎮', '🎨', '🎵', '📚', '☕', '🍺', '💅', '🧘',
];
const COLOR_OPTIONS = ['#0F5C5C', '#C0912F', '#A6432C', '#7A4FE0', '#3D7A8C', '#D97757', '#8B9A97', '#1C2B29'];

/**
 * Modal unico para criar OU editar uma categoria.
 * Se `category` for passado, edita (e permite excluir); senao, cria uma nova.
 */
export default function CategoryConfigModal({ open, onClose, onSaved, category, defaultKind = 'expense' }) {
  const isEditing = !!category;
  const { categories } = useData();
  const { showSuccess, showError } = useToast();

  const [name, setName] = useState('');
  const [icon, setIcon] = useState(ICON_OPTIONS[0]);
  const [color, setColor] = useState(COLOR_OPTIONS[0]);
  const [kind, setKind] = useState('expense');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [checkingUsage, setCheckingUsage] = useState(false);
  const [usage, setUsage] = useState(null);
  const [reassignTo, setReassignTo] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setUsage(null);
    setReassignTo('');
    if (isEditing) {
      setName(category.name);
      setIcon(category.icon);
      setColor(category.color_hex);
      setKind(category.kind === 'both' ? 'expense' : category.kind);
      setBudgetAmount(category.budget_amount != null ? numberToMasked(category.budget_amount) : '');
    } else {
      setName('');
      setIcon(ICON_OPTIONS[0]);
      setColor(COLOR_OPTIONS[0]);
      setKind(defaultKind);
      setBudgetAmount('');
    }
  }, [open, isEditing, category, defaultKind]);

  if (!open) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!name.trim()) return setError('Informe o nome da categoria.');

    const budgetValue = budgetAmount ? maskToNumber(budgetAmount) : null;

    setSubmitting(true);
    try {
      if (isEditing) {
        await categoriesApi.update(category.id, { name: name.trim(), icon, color_hex: color, kind, budget_amount: budgetValue });
        showSuccess('Categoria atualizada com sucesso.');
      } else {
        await categoriesApi.create({ name: name.trim(), icon, color_hex: color, kind, budget_amount: budgetValue });
        showSuccess('Categoria criada com sucesso.');
      }
      onSaved?.();
    } catch (err) {
      const message = err.message || 'Não foi possível salvar a categoria.';
      setError(message);
      showError(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function openDeleteModal() {
    setDeleteModalOpen(true);
    setCheckingUsage(true);
    setReassignTo('');
    try {
      const res = await categoriesApi.usage(category.id);
      setUsage(res);
    } catch (err) {
      showError(err.message || 'Não foi possível verificar o uso da categoria.');
      setDeleteModalOpen(false);
    } finally {
      setCheckingUsage(false);
    }
  }

  async function handleDelete() {
    const body = usage?.total > 0 ? { reassign_to: reassignTo } : undefined;
    await categoriesApi.archive(category.id, body);
    showSuccess('Categoria excluída com sucesso.');
    setDeleteModalOpen(false);
    onSaved?.();
  }

  const reassignOptions = categories.filter(
    (c) => c.id !== category?.id && !c.archived && (c.kind === kind || c.kind === 'both')
  );

  return (
    <ModalShell open={open} onClose={onClose}>
      <div className="modal">
        <div className="modal-head">
          <h2>{isEditing ? 'Editar categoria' : 'Nova categoria'}</h2>
          <div className="modal-head-actions">
            {isEditing && (
              <button type="button" className="modal-delete-trigger" title="Excluir" onClick={openDeleteModal}>
                <IconTrash />
              </button>
            )}
            <button className="modal-close" onClick={onClose}>
              ✕
            </button>
          </div>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          {error && <div className="form-error-banner">{error}</div>}

          <div className="field">
            <div className="seg">
              <div className={`seg-opt despesa${kind === 'expense' ? ' active' : ''}`} onClick={() => setKind('expense')}>
                Despesa
              </div>
              <div className={`seg-opt receita${kind === 'income' ? ' active' : ''}`} onClick={() => setKind('income')}>
                Receita
              </div>
            </div>
          </div>

          <div className="field">
            <label>Nome</label>
            <input type="text" placeholder="Ex.: Pets, Assinaturas..." value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="field">
            <label>Ícone</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {ICON_OPTIONS.map((i) => (
                <div
                  key={i}
                  onClick={() => setIcon(i)}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 16,
                    cursor: 'pointer',
                    background: icon === i ? 'var(--teal-soft)' : 'var(--bg)',
                    border: icon === i ? '1.5px solid var(--teal)' : '1.5px solid transparent',
                  }}
                >
                  {i}
                </div>
              ))}
            </div>
          </div>

          <div className="field">
            <label>Cor</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {COLOR_OPTIONS.map((c) => (
                <div
                  key={c}
                  onClick={() => setColor(c)}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: c,
                    cursor: 'pointer',
                    border: color === c ? '2px solid var(--ink)' : '2px solid transparent',
                    boxShadow: color === c ? '0 0 0 2px var(--surface)' : 'none',
                  }}
                />
              ))}
            </div>
          </div>

          {kind === 'expense' && (
            <div className="field">
              <label>Meta mensal (opcional)</label>
              <CurrencyInput value={budgetAmount} onChange={setBudgetAmount} />
            </div>
          )}

          <div className="modal-actions">
            <div className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </div>
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? 'Salvando...' : isEditing ? 'Salvar alterações' : 'Salvar categoria'}
            </button>
          </div>
        </form>
      </div>

      {isEditing && (
        <ConfirmDeleteModal
          open={deleteModalOpen}
          onClose={() => setDeleteModalOpen(false)}
          onConfirm={handleDelete}
          title="Excluir categoria"
          loading={checkingUsage}
          confirmDisabled={usage?.total > 0 && !reassignTo}
          message={
            usage?.total > 0
              ? `Esta categoria está em uso em ${usage.total} registro(s). Escolha para onde mover antes de excluir. Esta ação não pode ser desfeita.`
              : 'Tem certeza que deseja excluir esta categoria? Esta ação não pode ser desfeita.'
          }
        >
          {usage?.total > 0 && (
            <select value={reassignTo} onChange={(e) => setReassignTo(e.target.value)}>
              <option value="">Selecione uma categoria...</option>
              {reassignOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
          )}
        </ConfirmDeleteModal>
      )}
    </ModalShell>
  );
}
