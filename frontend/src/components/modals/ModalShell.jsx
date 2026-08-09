import { useEffect, useRef } from 'react';

/**
 * Wrapper compartilhado por todos os modais: overlay com fechar-ao-clicar-fora
 * (protegido contra arrastar/selecionar texto e soltar fora) e fechar com ESC.
 */
export default function ModalShell({ open, onClose, children }) {
  const mouseDownOnOverlay = useRef(false);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  function handleMouseDown(e) {
    mouseDownOnOverlay.current = e.target === e.currentTarget;
  }

  function handleMouseUp(e) {
    if (mouseDownOnOverlay.current && e.target === e.currentTarget) {
      onClose();
    }
    mouseDownOnOverlay.current = false;
  }

  return (
    <div className="modal-overlay active" onMouseDown={handleMouseDown} onMouseUp={handleMouseUp}>
      {children}
    </div>
  );
}
