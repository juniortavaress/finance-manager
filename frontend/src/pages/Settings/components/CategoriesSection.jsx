import { useMemo, useState } from 'react';
import { dashboardApi } from '../../../api/resources';
import { useFetch } from '../../../hooks/useFetch';
import { useCategories } from '../../../hooks/resources/useCategories';
import { expenseCategories as filterExpense, incomeCategories as filterIncome } from '../../../utils/categories';
import { fmt } from '../../../utils/format';
import { IconPencil } from '../../../components/icons';
import CategoryConfigModal from './CategoryConfigModal';
import Skeleton from '../../../components/Skeleton';

function CategoryGrid({ title, items, totalsById, totalsLoading, onEdit }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h3 style={{ marginBottom: 12 }}>{title}</h3>
      <div className="cat-grid">
        {items.map((c) => (
          <div className="cat-tile" key={c.id} style={{ position: 'relative' }}>
            <div className="ico" style={{ background: `${c.color_hex}22` }}>
              {c.icon}
            </div>
            <div className="cat-tile-info">
              <div className="name">{c.name}</div>
              <div className="amt num">
                {totalsLoading ? (
                  <Skeleton width={60} height={14} />
                ) : (
                  <>
                    <span className="amt-value">{fmt(totalsById[c.id] || 0)}</span>{' '}
                    <span className="amt-period">este mês</span>
                  </>
                )}
              </div>
            </div>
            <button
              title="Editar categoria"
              onClick={() => onEdit(c)}
              style={{
                position: 'absolute',
                top: 10,
                right: 10,
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
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CategoriesSection() {
  const { categories, reload: reloadCategories } = useCategories();
  const expenseCategories = useMemo(() => filterExpense(categories), [categories]);
  const incomeCategories = useMemo(() => filterIncome(categories), [categories]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [newCategoryKind, setNewCategoryKind] = useState('expense');

  const now = new Date();
  const { data: catData, loading: catLoading } = useFetch(
    () => dashboardApi.spendingByCategory(now.getFullYear(), now.getMonth() + 1),
    []
  );

  const totalsById = useMemo(() => {
    const map = {};
    (catData?.categories || []).forEach((c) => {
      map[c.id] = c.total;
    });
    return map;
  }, [catData]);

  function openNewCategory() {
    setEditingCategory(null);
    setNewCategoryKind('expense');
    setModalOpen(true);
  }

  function openEditCategory(category) {
    setEditingCategory(category);
    setModalOpen(true);
  }

  return (
    <>
      <div className="set-section-head">
        <div>
          <h2>Categorias</h2>
          <p>Organize suas receitas e despesas. O valor mostrado é o total do mês atual.</p>
        </div>
        <button type="button" className="set-btn set-btn-primary" onClick={openNewCategory}>
          + Nova categoria
        </button>
      </div>

      <CategoryGrid
        title="Despesas"
        items={expenseCategories}
        totalsById={totalsById}
        totalsLoading={catLoading}
        onEdit={openEditCategory}
      />

      <CategoryGrid
        title="Receitas"
        items={incomeCategories}
        totalsById={totalsById}
        totalsLoading={catLoading}
        onEdit={openEditCategory}
      />

      <CategoryConfigModal
        open={modalOpen}
        category={editingCategory}
        categories={categories}
        defaultKind={newCategoryKind}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          setModalOpen(false);
          reloadCategories();
        }}
      />
    </>
  );
}
