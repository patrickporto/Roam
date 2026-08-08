import { useCallback } from 'react';
import { useStore } from './store';
import { isApiAvailable } from './api';
import { TitleBar } from './components/TitleBar';
import { FeedView } from './components/feed/FeedView';
import { ProfileList } from './components/profile/ProfileList';
import { ProfilePage } from './components/profile/ProfilePage';
import { FavoritesPage } from './components/FavoritesPage';
import { TagsPage } from './components/TagsPage';

export default function App() {
  const activeTab = useStore((s) => s.activeTab);
  const selectedRoot = useStore((s) => s.selectedRoot);

  const renderContent = useCallback(() => {
    if (selectedRoot) {
      return <ProfilePage profilePath={selectedRoot} />;
    }

    switch (activeTab) {
      case 'for-you':
        return <FeedView key="foryou" scope="forYou" />;
      case 'library':
        return <ProfileList />;
      case 'favorites':
        return <FavoritesPage />;
      case 'tags':
        return <TagsPage />;
    }
  }, [activeTab, selectedRoot]);

  if (!isApiAvailable()) {
    return (
      <div className="empty-state" style={{ height: '100vh' }}>
        <p>API do Roam indisponível.</p>
        <p style={{ fontSize: 13, color: '#777' }}>
          Este app precisa rodar dentro do Electron. Use <code>npm run dev</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <TitleBar />
      <div className="app-content">{renderContent()}</div>
    </div>
  );
}
