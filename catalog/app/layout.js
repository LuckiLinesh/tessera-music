import './globals.css';
import PlayerProvider from './components/PlayerProvider';
import Shell from './components/Shell';

export const metadata = {
  title: 'Tessera - a search engine for music',
  description:
    'Search recordings, artists and releases across the world. Play what is legally available, and open the rest where its owner publishes it.',
};

export const viewport = {
  themeColor: '#08080a',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <PlayerProvider>
          <Shell>{children}</Shell>
        </PlayerProvider>
      </body>
    </html>
  );
}
