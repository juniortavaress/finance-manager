import { useEffect, useState } from 'react';
import { marketDataApi } from '../../api/resources';
import { useToast } from '../../context/ToastContext';
import ModalShell from './ModalShell';

/**
 * Modal para registrar um evento societario GLOBAL de mercado (desdobramento/
 * grupamento ou incorporacao), identificado por CODIGO de ativo - nao por um
 * Asset especifico do usuario. Uma vez salvo, aplica automaticamente a
 * qualquer usuario que tenha aquele codigo na carteira, em qualquer
 * corretora onde o codigo de origem aparecer.
 */
export default function MarketCorporateEventModal({ open, onClose, onSaved }) {
  const { showSuccess, showError } = useToast();
  const [type, setType] = useState('split');
  const [targetCode, setTargetCode] = useState('');
  const [sourceCode, setSourceCode] = useState('');
  const [date, setDate] = useState('');
  const [ratio, setRatio] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isMerger = type === 'merger';

  useEffect(() => {
    if (!open) return;
    setError('');
    setType('split');
    setTargetCode('');
    setSourceCode('');
    setDate('');
    setRatio('');
    setNote('');
  }, [open]);

  if (!open) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!targetCode.trim()) return setError('Informe o código do ativo.');
    if (isMerger && !sourceCode.trim()) return setError('Informe o código de origem da incorporação.');
    if (!date) return setError('Informe a data do evento.');
    if (!ratio.trim()) return setError('Informe a proporção.');

    setSubmitting(true);
    try {
      const { market_corporate_event: created } = await marketDataApi.createCorporateEvent({
        type,
        target_code: targetCode.trim().toUpperCase(),
        source_code: isMerger ? sourceCode.trim().toUpperCase() : null,
        date,
        ratio: Number(ratio.replace(',', '.')),
        note: note.trim() || null,
      });
      showSuccess('Evento societário registrado com sucesso.');
      onSaved?.(created);
    } catch (err) {
      const message = err.message || 'Não foi possível registrar o evento.';
      setError(message);
      showError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell open={open} onClose={onClose}>
      <div className="modal">
        <div className="modal-head">
          <h2>Novo evento societário</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          {error && <div className="form-error-banner">{error}</div>}

          <div className="field">
            <label>Tipo de evento</label>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="split">Desdobramento / Grupamento</option>
              <option value="merger">Incorporação</option>
            </select>
          </div>

          <div className="field">
            <label>Código do ativo {isMerger ? '(destino)' : ''}</label>
            <input
              type="text"
              placeholder="Ex.: CPTS11"
              value={targetCode}
              onChange={(e) => setTargetCode(e.target.value.toUpperCase())}
            />
          </div>

          {isMerger && (
            <div className="field">
              <label>Código de origem</label>
              <input
                type="text"
                placeholder="Ex.: RBED11"
                value={sourceCode}
                onChange={(e) => setSourceCode(e.target.value.toUpperCase())}
              />
            </div>
          )}

          <div className="field">
            <label>Data do evento</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div className="field">
            <label>
              {isMerger
                ? 'Cada 1 cota da origem vira quantas da atual? (inclui bônus, se houver)'
                : 'Cada 1 cota antiga vira quantas novas?'}
            </label>
            <input
              type="text"
              inputMode="decimal"
              placeholder={isMerger ? 'Ex.: 1,3' : 'Ex.: 10 (ou 0,1 para grupamento)'}
              value={ratio}
              onChange={(e) => setRatio(e.target.value.replace(/[^\d,.]/g, ''))}
            />
          </div>

          {isMerger && (
            <div className="field-hint" style={{ marginBottom: 12 }}>
              O ativo de origem ficará com posição zerada e será arquivado automaticamente para todo usuário afetado.
            </div>
          )}

          <div className="field">
            <label>Nota (opcional)</label>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <div className="modal-actions">
            <div className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </div>
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? 'Salvando...' : 'Salvar evento'}
            </button>
          </div>
        </form>
      </div>
    </ModalShell>
  );
}
