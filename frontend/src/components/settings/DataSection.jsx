import { useState } from 'react';
import { transactionsApi } from '../../api/resources';
import { useToast } from '../../context/ToastContext';

export default function DataSection() {
  const { showSuccess, showError } = useToast();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    if (dateFrom && dateTo && dateFrom > dateTo) return showError('A data inicial deve ser anterior à final.');
    setExporting(true);
    try {
      await transactionsApi.exportCsv({ date_from: dateFrom, date_to: dateTo });
      showSuccess('Arquivo gerado com sucesso.');
    } catch (err) {
      showError(err.message || 'Não foi possível exportar as transações.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <div className="set-section-head">
        <div>
          <h2>Meus dados</h2>
          <p>Leve suas informações com você, como backup ou para usar em uma planilha.</p>
        </div>
      </div>

      <h3 className="set-subtitle">Exportar transações</h3>
      <div className="set-card set-form">
        <div className="set-field">
          <div className="set-field-label">
            <label htmlFor="set-export-from">Período</label>
            <span>Deixe em branco para exportar tudo. O arquivo abre direto no Excel e no Google Planilhas.</span>
          </div>
          <div className="set-date-range">
            <input id="set-export-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            <span>até</span>
            <input type="date" aria-label="Data final" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>
        <div className="set-form-actions">
          <button type="button" className="set-btn set-btn-primary" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Gerando...' : 'Baixar CSV'}
          </button>
        </div>
      </div>
    </>
  );
}
