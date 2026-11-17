'use client';
import { Ornament } from '../festive/Decorations';

/**
 * The green ornament hanging near the lights on the homepage. Secretly a switch:
 * tapping it turns "monkey mode" on or off on the family dashboard below.
 */
export function MonkeyOrnament() {
  return (
    <button type="button" className="monkey-ornament" aria-label="Green ornament"
      onClick={() => {
        window.dispatchEvent(new CustomEvent('oc:monkey'));
        document.querySelector('.family-head')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }}>
      <Ornament color="green" />
    </button>
  );
}
