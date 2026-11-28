/** Estado vazio de um card: icone, titulo e uma acao opcional, no centro. */
export default function EmptyState({ icon: Icon, title, actionLabel, onAction }) {
  return (
    <div className="dv-empty">
      <span className="dv-empty-icon">
        <Icon aria-hidden="true" />
      </span>
      <strong>{title}</strong>
      {/* O espaco da acao existe mesmo sem botao, para cards lado a lado ficarem alinhados. */}
      <div className="dv-empty-action">
        {onAction && (
          <button type="button" onClick={onAction}>
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}
