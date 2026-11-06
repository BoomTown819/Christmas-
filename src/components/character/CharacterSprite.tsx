'use client';
import type { CSSProperties } from 'react';
import { ACTIVITIES, characterSrc, type Activity, type CharacterCard } from '@/lib/activities';
import { PixelArt, PROPS, SANTA } from './PixelArt';

interface Props {
  character?: CharacterCard | null;
  name?: string;
  /** Height of the character in CSS pixels (a multiple of 64 keeps pixels perfectly square). */
  size?: number;
  /** Decorative copies are hidden from screen readers and can never be clicked. */
  decorative?: boolean;
  /** Show just the character, no activity props (for tight spots like claim badges). */
  compact?: boolean;
  className?: string;
  activityOverride?: Activity;
}

/**
 * A family member's 8-bit character. If an AI-made GIF exists it plays that; otherwise the
 * still sprite is animated in the browser with pixel props for the chosen activity.
 * People without a character yet get the house pixel Santa.
 */
export function CharacterSprite({ character, name, size = 64, decorative, compact, className = '', activityOverride }: Props) {
  const activity: Activity = activityOverride ?? character?.activity ?? 'waving';
  const label = decorative ? undefined : name ? `${name}’s Christmas character, ${ACTIVITIES[activity].label.toLowerCase()}` : 'Christmas character';
  const px = size / 64; // one sprite pixel in CSS pixels
  const style = { '--px': `${px}px`, '--size': `${size}px` } as CSSProperties;
  const common = {
    className: `char ${compact ? 'char-compact' : `char-act-${activity}`} ${decorative ? 'char-decor' : ''} ${className}`,
    style,
    role: decorative ? undefined : 'img',
    'aria-label': label,
    'aria-hidden': decorative ? true : undefined,
    'data-testid': decorative ? undefined : 'character',
  } as const;

  if (character?.anim && !activityOverride) {
    return (
      <span {...common} data-anim="ai">
        <img className="char-img" src={characterSrc(character, 'gif')} alt="" width={size} height={size} draggable={false}
          style={{ imageRendering: size >= 96 ? 'pixelated' : 'auto' }} />
      </span>
    );
  }

  const figure = character
    ? <img className="char-img char-body" src={characterSrc(character, 'png')} alt="" width={size} height={size} draggable={false} />
    : <PixelArt className="char-img char-body" rows={SANTA} scale={size / 18} />;

  if (compact) return <span {...common} data-anim="css">{figure}</span>;

  const s = Math.max(2, Math.round(px * 3)); // prop pixel size
  return (
    <span {...common} data-anim="css">
      {activity === 'lights' && <PixelArt className="prop prop-lights" rows={PROPS.lights} scale={s} />}
      {activity === 'sleigh' ? <span className="char-sleigh">{figure}<PixelArt className="prop prop-sleigh" rows={PROPS.sleigh} scale={s} /></span> : figure}
      {activity === 'waving' && <PixelArt className="prop prop-sparkle" rows={PROPS.sparkle} scale={s} />}
      {activity === 'dancing' && <><PixelArt className="prop prop-note" rows={PROPS.note} scale={s} /><PixelArt className="prop prop-note2" rows={PROPS.note} scale={s} /></>}
      {activity === 'decorating' && <><PixelArt className="prop prop-tree" rows={PROPS.tree} scale={s} /><PixelArt className="prop prop-ornament" rows={PROPS.ornament} scale={s} /></>}
      {activity === 'presents' && <PixelArt className="prop prop-carry" rows={PROPS.present} scale={s} />}
      {activity === 'snowman' && <PixelArt className="prop prop-snowman" rows={PROPS.snowman} scale={s} />}
      {activity === 'cocoa' && <><PixelArt className="prop prop-mug" rows={PROPS.mug} scale={s} /><PixelArt className="prop prop-steam" rows={PROPS.steam} scale={s} /></>}
      {activity === 'wrapping' && <><PixelArt className="prop prop-wrap" rows={PROPS.presentGreen} scale={s} /><PixelArt className="prop prop-bow" rows={PROPS.bow} scale={s} /></>}
      {activity === 'candycane' && <PixelArt className="prop prop-cane" rows={PROPS.candycane} scale={s} />}
    </span>
  );
}
