import { useCallback, useState } from 'react';
import { useToast } from '../context/ToastContext';

// Erro de formulario: guarda a mensagem e ja a mostra como toast, para nenhum
// aviso empurrar o conteudo da tela. Passar texto vazio apenas limpa o erro.
export function useFormError() {
  const { showError } = useToast();
  const [error, setErrorState] = useState('');
  const setError = useCallback(
    (message) => {
      setErrorState(message);
      if (message) showError(message);
    },
    [showError]
  );
  return [error, setError];
}
