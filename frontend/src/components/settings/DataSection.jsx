import { useState } from 'react';
import { dataApi } from '../../api/resources';
import { useToast } from '../../context/ToastContext';

const INCLUDED = [
  'Lançamentos, contas, cartões e faturas',
  'Categorias, contas fixas e compras parceladas',
  'Investimentos, compras e vendas e proventos',
  'Amigos, grupos, despesas divididas e acertos',
];

export default function DataSection() {
  const { showSuccess, showError } = useToast();
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      await dataApi.exportAll();
      showSuccess('Arquivo gerado com sucesso.');
    } catch (err) {
      showError(err.message || 'Não foi possível exportar seus dados.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <div className="set-section-head">
        <div>
          <h2>Meus dados</h2>
          <p>Leve tudo o que você registrou com você, como backup ou para usar em outra ferramenta.</p>
        </div>
      </div>

      <h3 className="set-subtitle">Exportar tudo</h3>
      <div className="set-card">
        <div className="set-row">
          <div>
            <div className="set-row-title">Planilha com todos os seus dados</div>
            <div className="set-row-sub">
              Um arquivo do Excel com uma aba para cada assunto. Abre também no Google Planilhas.
            </div>
          </div>
          <button type="button" className="set-btn set-btn-primary" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Gerando...' : 'Baixar planilha'}
          </button>
        </div>
        <ul className="set-included">
          {INCLUDED.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </>
  );
}
