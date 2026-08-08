import { useStore } from '../../store';

export function TabShell() {
  const activeTab = useStore((s) => s.activeTab);
  const setActiveTab = useStore((s) => s.setActiveTab);

  return (
    <nav className="top-tabs">
      <button
        className={`top-tab ${activeTab === 'for-you' ? 'active' : ''}`}
        onClick={() => setActiveTab('for-you')}
      >
        Para Você
      </button>
      <button
        className={`top-tab ${activeTab === 'library' ? 'active' : ''}`}
        onClick={() => setActiveTab('library')}
      >
        Perfis
      </button>
      <button
        className={`top-tab ${activeTab === 'favorites' ? 'active' : ''}`}
        onClick={() => setActiveTab('favorites')}
      >
        Favoritos
      </button>
      <button
        className={`top-tab ${activeTab === 'tags' ? 'active' : ''}`}
        onClick={() => setActiveTab('tags')}
      >
        Tags
      </button>
    </nav>
  );
}
