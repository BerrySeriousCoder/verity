import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Verity · Document workspace',
  description: 'Document review grounded in original sources.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-stone-50 font-sans text-stone-800 antialiased selection:bg-emerald-100">
        {children}
      </body>
    </html>
  );
}
