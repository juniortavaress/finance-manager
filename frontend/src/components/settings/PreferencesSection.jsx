import { useState } from 'react';
import { getThemePref, setThemePref } from '../../utils/theme';

const THEMES = [
  { key: 'claro', label: 'Claro', preview: '' },
  { key: 'escuro', label: 'Escuro', preview: 'dark' },
  { key: 'auto', label: 'Automático', preview: 'auto' },
];

export default function PreferencesSection() {
  const [theme, setTheme] = useState(getThemePref);

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
    </>
  );
}
