'use client';
import { AVATAR_COLORS, AVATARS } from '@/lib/items';
import { Avatar } from '../festive/Decorations';

export function AvatarPicker({ avatar, color, onChange }: { avatar: string; color: string; onChange: (avatar: string, color: string) => void }) {
  return (
    <div className="avatar-picker">
      <div className="avatar-preview"><Avatar emoji={AVATARS[avatar]} color={color} size={64} /></div>
      <div className="avatar-options">
        <div className="avatar-grid" role="radiogroup" aria-label="Avatar">
          {Object.entries(AVATARS).map(([k, e]) => (
            <button key={k} type="button" role="radio" aria-checked={avatar === k} aria-label={k}
              className={`avatar-opt${avatar === k ? ' is-on' : ''}`} onClick={() => onChange(k, color)}>{e}</button>
          ))}
        </div>
        <div className="color-row" role="radiogroup" aria-label="Bauble color">
          {AVATAR_COLORS.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={c}
              className={`color-opt av-${c}${color === c ? ' is-on' : ''}`} onClick={() => onChange(avatar, c)} />
          ))}
        </div>
      </div>
    </div>
  );
}
