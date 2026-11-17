import React from 'react';
import { TBHGN_COLORS } from '../styles/tokens';

interface TbhgnLogoProps {
  size?: number;
  variant?: 'dark' | 'light';
  showWordmark?: boolean;
  wordmarkSubtitle?: string;
  className?: string;
}

/**
 * Original SVG Vector Emblem: "Vầng Sáng Giác Ngộ"
 * - Outer open halo arc: wholeness and wisdom
 * - Ascending luminous orb & clean rays: journey from stillness/ignorance to awakening
 * - Stylized lotus-horizon cradle: grounded simplicity without ornate clutter
 * - Small Chu Sa seal point: dignified spiritual signature
 *
 * Crisp at 24px, 32px, and 64px across both dark (Huyền Lam) and light (Ngà Thiền) surfaces.
 */
export const TbhgnLogo: React.FC<TbhgnLogoProps> = ({
  size = 32,
  variant = 'dark',
  showWordmark = false,
  wordmarkSubtitle,
  className = '',
}) => {
  const isDark = variant === 'dark';

  const bgFill = isDark ? TBHGN_COLORS.huyenLamLogoBg : TBHGN_COLORS.huyenLam;
  const frameStroke = TBHGN_COLORS.minhKim;
  const frameStrokeOpacity = isDark ? 0.65 : 0.48;
  const haloStroke = TBHGN_COLORS.kimQuang;
  const rayStroke = TBHGN_COLORS.kimQuang;
  const orbFill = TBHGN_COLORS.kimQuang;
  const horizonStroke = TBHGN_COLORS.ngaThien;
  const petalStroke = isDark ? TBHGN_COLORS.kimQuang : TBHGN_COLORS.minhKim;
  const petalStrokeOpacity = isDark ? 0.92 : 1;
  const sealFill = TBHGN_COLORS.chuSa;

  const mark = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={showWordmark ? 'shrink-0' : className}
      aria-label={showWordmark ? undefined : 'Logo Từ Băng Hà Đến Giác Ngộ (TBHGN)'}
      aria-hidden={showWordmark ? true : undefined}
      role={showWordmark ? undefined : 'img'}
    >
      <rect
        width="64"
        height="64"
        rx="15"
        fill={bgFill}
      />
      <rect
        x="1.5"
        y="1.5"
        width="61"
        height="61"
        rx="13.5"
        stroke={frameStroke}
        strokeOpacity={frameStrokeOpacity}
        strokeWidth="1.6"
      />
      {/* Open Enlightenment Halo */}
      <path
        d="M16.5 39.5A18.5 18.5 0 1 1 47.5 39.5"
        stroke={haloStroke}
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      {/* Three Balanced Rays of Awakening */}
      <path
        d="M32 10.5V14.5"
        stroke={rayStroke}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M20.2 15.6L22.8 18.4"
        stroke={rayStroke}
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      <path
        d="M43.8 15.6L41.2 18.4"
        stroke={rayStroke}
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      {/* Luminous Wisdom Disc */}
      <circle cx="32" cy="27.5" r="7.5" fill={orbFill} />
      {/* Stylized Horizon & Minimal Lotus Cradle */}
      <path
        d="M13 42.5C19.2 42.5 24.4 39.4 32 39.4C39.6 39.4 44.8 42.5 51 42.5"
        stroke={horizonStroke}
        strokeWidth="2.9"
        strokeLinecap="round"
      />
      <path
        d="M20 48.2C23.8 46.2 27.6 45.2 32 45.2C36.4 45.2 40.2 46.2 44 48.2"
        stroke={petalStroke}
        strokeOpacity={petalStrokeOpacity}
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      {/* Small Chu Sa Seal Anchor */}
      <circle cx="32" cy="52" r="2.5" fill={sealFill} />
    </svg>
  );

  if (!showWordmark) {
    return mark;
  }

  return (
    <span
      className={`inline-flex items-center gap-2.5 min-w-0 ${className}`}
      aria-label="Từ Băng Hà Đến Giác Ngộ (TBHGN)"
    >
      {mark}
      <span className="min-w-0 flex flex-col leading-tight">
        <span
          className={`text-sm font-bold whitespace-nowrap truncate ${
            isDark
              ? 'text-kim-quang tracking-[0.02em]'
              : 'text-huyen-lam tracking-tight'
          }`}
        >
          TBHGN
        </span>
        {wordmarkSubtitle && (
          <span
            className={`text-[11px] whitespace-nowrap truncate ${
              isDark ? 'text-[#E6EAF2]/85' : 'text-ink-muted'
            }`}
          >
            {wordmarkSubtitle}
          </span>
        )}
      </span>
    </span>
  );
};
