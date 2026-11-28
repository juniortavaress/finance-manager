import { useState, useSyncExternalStore } from 'react';
import { getThemePref, setThemePref } from '../../../utils/theme';
import { setValuesHidden, subscribePrivacy, valuesHidden } from '../../../utils/privacy';

const THEMES = [
  { key: 'claro', label: 'Claro', preview: '' },
  { key: 'escuro', label: 'Escuro', preview: 'dark' },
  { key: 'auto', label: 'Automático', preview: 'auto' },
];

export default function PreferencesSection() {
  const [theme, setTheme] = useState(getThemePref);
  const hidden = useSyncExternalStore(subscribePrivacy, valuesHidden);

  function chooseTheme(key) {
    setTheme(key);
    setThemePref(key);
  }

  return (
    <>
      <div className="set-section-head">
        <div>
          <h2>Preferências</h2>
          <p>Ajuste como o Atmos aparece e se comporta para você.</p>
        </div>
      </div>

      <h3 className="set-subtitle">Aparência</h3>
      <div className="set-card">
        <div className="set-choices">
          {THEMES.map(({ key, label, preview }) => (
            <button
              key={key}
              type="button"
              className={`set-choice${theme === key ? ' active' : ''}`}
              onClick={() => chooseTheme(key)}
            >
              <span className={`set-choice-preview ${preview}`}>
                <i />
                <b />
              </span>
              {label}
            </button>
          ))}
        </div>
      </div>

      <h3 className="set-subtitle">Privacidade</h3>
      <div className="set-card">
        <div className="set-row">
          <div>
            <div className="set-row-title">Ocultar valores</div>
            <div className="set-row-sub">Troca os valores em dinheiro por •••• em todas as telas. Útil em público.</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={hidden}
            className={`set-switch${hidden ? ' on' : ''}`}
            onClick={() => setValuesHidden(!hidden)}
          >
            <span />
          </button>
        </div>
      </div>
    </>
  );
}
