import { useEffect, useState } from 'react';
import { bankLogoOverride, bankLogoUrl } from '../utils/bankLogo';

// Logo do banco; sem imagem (ou se falhar ao carregar) mostra a letra inicial na cor do banco.
export default function BankLogo({ bank, size = 48, className = 'bank-logo' }) {
  const override = bankLogoOverride(bank);
  const url = bankLogoUrl(bank);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [url]);

  const showImage = url && !failed;
  const style = {
    width: size,
    height: size,
    fontSize: Math.round(size * 0.44),
    background: showImage ? '#fff' : bank.color_hex,
  };

  return (
    <div className={className} style={style}>
      {showImage ? (
        <img
          src={url}
          alt=""
          referrerPolicy="no-referrer"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transform: override?.scale }}
          onError={() => setFailed(true)}
        />
      ) : (
        bank.name[0]
      )}
    </div>
  );
}
