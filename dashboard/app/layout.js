import './globals.css';

export const metadata = {
  title: 'MALT Monitor',
  description: 'Real-time ambience & music monitoring dashboard',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
