import { useEffect, useRef } from 'react';

// Conta quantos ModalShells estao abertos ao mesmo tempo (ex: um modal de
// confirmacao aberto por cima de outro modal) para so destravar o scroll
// do body quando o ultimo deles fechar.
let openModalCount = 0;

/**
 * Wrapper compartilhado por todos os modais: overlay com fechar-ao-clicar-fora
 * (protegido contra arrastar/selecionar texto e soltar fora), fechar com ESC,
 * e trava o scroll da pagina por tras enquanto estiver aberto.
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

  useEffect(() => {
    if (!open) return;
    openModalCount += 1;
    document.body.style.overflow = 'hidden';
    return () => {
      openModalCount -= 1;
      if (openModalCount === 0) {
        document.body.style.overflow = '';
      }
    };
  }, [open]);

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
