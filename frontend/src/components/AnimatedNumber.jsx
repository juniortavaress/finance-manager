import { useCountUp } from '../hooks/useCountUp';
import { fmt } from '../utils/format';

export default function AnimatedNumber({ value }) {
  const animated = useCountUp(value);
  return fmt(animated);
}
