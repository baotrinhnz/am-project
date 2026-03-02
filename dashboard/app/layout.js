import './globals.css';

export const metadata = {
  title: 'Enviro+ Air Quality Monitor',
  description: 'Real-time air quality monitoring dashboard for Raspberry Pi + Enviro+',
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
