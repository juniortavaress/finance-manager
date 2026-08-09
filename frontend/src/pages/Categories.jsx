import { useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { dashboardApi } from '../api/resources';
import { useFetch } from '../hooks/useFetch';
import { fmt } from '../utils/format';
import { IconPencil } from '../components/icons';
import CategoryConfigModal from '../components/modals/CategoryConfigModal';

function CategoryGrid({ title, items, totalsById, onEdit }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h3 style={{ marginBottom: 12 }}>{title}</h3>
      <div className="cat-grid">
        {items.map((c) => (
          <div className="cat-tile" key={c.id} style={{ position: 'relative' }}>
            <div className="ico" style={{ background: `${c.color_hex}22` }}>
              {c.icon}
            </div>
            <div>
              <div className="name">{c.name}</div>
              <div className="amt num">{fmt(totalsById[c.id] || 0)} este mês</div>
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

export default function Categories() {
  const { expenseCategories, incomeCategories, reloadAll } = useData();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [newCategoryKind, setNewCategoryKind] = useState('expense');

  const now = new Date();
  const { data: catData } = useFetch(() => dashboardApi.spendingByCategory(now.getFullYear(), now.getMonth() + 1), []);

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
    <div className="screen active">
      <div className="topbar">
        <h1>Categorias</h1>
        <div
          className="period"
          style={{ background: 'var(--teal)', color: '#fff', borderColor: 'var(--teal)' }}
          onClick={openNewCategory}
        >
          + categoria
        </div>
      </div>

      <CategoryGrid
        title="Despesas"
        items={expenseCategories}
        totalsById={totalsById}
        onEdit={openEditCategory}
      />

      <CategoryGrid
        title="Receitas"
        items={incomeCategories}
        totalsById={totalsById}
        onEdit={openEditCategory}
      />

      <CategoryConfigModal
        open={modalOpen}
        category={editingCategory}
        defaultKind={newCategoryKind}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          setModalOpen(false);
          reloadAll();
        }}
      />
    </div>
  );
}
