import React from 'react';

interface TbhgnLogoProps {
  size?: number;
  className?: string;
}

/**
 * Faithful 28-32px emblem inspired by the "❖" mark in cell A1 of the TBHGN sheet,
 * rendered in Deep Navy (#13294B) and Bronze-Gold (#C59B27).
 */
export const TbhgnLogo: React.FC<TbhgnLogoProps> = ({
  size = 30,
  className = '',
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Logo Từ Băng Hà Đến Giác Ngộ"
      role="img"
    >
      <rect width="32" height="32" rx="7" fill="#13294B" />
      {/* Four-diamond ❖ motif from TBHGN sheet header */}
      <path d="M16 4.5L19.6 8.1L16 11.7L12.4 8.1L16 4.5Z" fill="#E5C158" />
      <path d="M16 20.3L19.6 23.9L16 27.5L12.4 23.9L16 20.3Z" fill="#C59B27" />
      <path d="M4.5 16L8.1 12.4L11.7 16L8.1 19.6L4.5 16Z" fill="#C59B27" />
      <path d="M20.3 16L23.9 12.4L27.5 16L23.9 19.6L20.3 16Z" fill="#E5C158" />
      <circle cx="16" cy="16" r="2.1" fill="#F8FAFC" />
    </svg>
  );
};
