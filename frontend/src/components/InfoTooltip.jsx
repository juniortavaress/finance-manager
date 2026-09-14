import { useState } from 'react';
import { IconInfo } from './icons';

export default function InfoTooltip({ text }) {
  const [open, setOpen] = useState(false);

  return (
    <span
      className="info-tooltip"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <IconInfo className="info-tooltip-icon" />
      {open && <div className="info-tooltip-bubble">{text}</div>}
    </span>
  );
}
