'use client';
import { AVATAR_COLORS, AVATARS } from '@/lib/items';
import { Avatar } from '../festive/Decorations';

const AVATAR_NAMES: Record<string, string> = {
  santa: 'Santa', mrsclaus: 'Mrs. Claus', elf: 'Elf', snowman: 'Snowman', reindeer: 'Reindeer', penguin: 'Penguin',
  polarbear: 'Polar bear', gingerbread: 'Cookie', tree: 'Tree', star: 'Star', gift: 'Present', teddy: 'Teddy',
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function AvatarPicker({ avatar, color, onChange }: { avatar: string; color: string; onChange: (avatar: string, color: string) => void }) {
  return (
    <div className="avatar-picker">
      <div className="avatar-preview"><Avatar emoji={AVATARS[avatar]} color={color} size={64} /></div>
      <div className="avatar-options">
        <div className="avatar-grid" role="radiogroup" aria-label="Avatar">
          {Object.entries(AVATARS).map(([k, e]) => (
            <button key={k} type="button" role="radio" aria-checked={avatar === k}
              className={`avatar-opt${avatar === k ? ' is-on' : ''}`} onClick={() => onChange(k, color)}>
              <span className="avatar-opt-emoji" aria-hidden="true">{e}</span><span className="avatar-opt-name">{AVATAR_NAMES[k] ?? cap(k)}</span>
            </button>
          ))}
        </div>
        <div className="color-row" role="radiogroup" aria-label="Bauble color">
          {AVATAR_COLORS.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={color === c}
              className={`color-opt${color === c ? ' is-on' : ''}`} onClick={() => onChange(avatar, c)}>
              <span className={`color-dot av-${c}`} aria-hidden="true" />{cap(c)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
