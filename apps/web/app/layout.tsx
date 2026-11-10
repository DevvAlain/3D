import type { Metadata } from 'next';
import '@fontsource/be-vietnam-pro/400.css';
import '@fontsource/be-vietnam-pro/500.css';
import '@fontsource/be-vietnam-pro/600.css';
import '@fontsource/be-vietnam-pro/700.css';
import '@fontsource/playfair-display/600.css';
import '@fontsource/playfair-display/700.css';
import '@fontsource/playfair-display/800.css';
import '@fontsource/jetbrains-mono/700.css';
import '@fontsource/jetbrains-mono/800.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Xổ Số May Mắn - Đại Hội Giáo Xứ',
  description: 'Hệ thống quay số may mắn 3D cao cấp dành cho sự kiện giáo xứ',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body className="min-h-screen bg-parish-navy text-parish-cream antialiased selection:bg-parish-gold selection:text-parish-navy">
        {children}
      </body>
    </html>
  );
}
