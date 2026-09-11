import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: '추석 기차표 예매',
  description: 'DLT 데모 - 대기순번/좌석 잠금/실시간 동기화',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <div className="container">{children}</div>
      </body>
    </html>
  );
}
