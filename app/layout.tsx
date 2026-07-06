import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'gametuoitho.space',
  description: 'Vietnamese casual gaming portal',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body className="min-h-screen bg-slate-950 text-slate-100">{children}</body>
    </html>
  );
}
