import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore, useAllTags } from '../store';
import { getApi } from '../api';
import { FeedView } from './feed/FeedView';
import type { MediaItem, TagSummary } from '../shared/types';

function TagIcon({ size = 44 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  );
}

export function TagsPage() {
  const allTags = useAllTags();
  const selectedTagId = useStore((s) => s.selectedTagId);
  const selectTag = useStore((s) => s.selectTag);
  const setActiveTab = useStore((s) => s.setActiveTab);

  if (selectedTagId != null) {
    return <TagFeed key={selectedTagId} tagId={selectedTagId} allTags={allTags} />;
  }

  return (
    <div className="tags-page">
      <div className="section-title">Tags</div>
      {allTags.length === 0 ? (
        <div className="profile-empty fav-empty">
          <div className="fav-empty-icon">
            <TagIcon />
          </div>
          <p>Nenhuma tag criada ainda.</p>
          <p className="fav-empty-hint">
            Use o ícone de tag no feed ou nas páginas de perfil para tagear.
          </p>
          <button className="cta" onClick={() => setActiveTab('for-you')}>
            Explorar feed
          </button>
        </div>
      ) : (
        <div className="tags-grid">
          {allTags.map((t) => (
            <button key={t.id} className="tag-card" onClick={() => selectTag(t.id)}>
              <span className="tag-card-name">#{t.name}</span>
              <span className="tag-card-count">
                {t.itemCount} {t.itemCount === 1 ? 'item' : 'itens'}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TagFeed({ tagId, allTags }: { tagId: number; allTags: TagSummary[] }) {
  const selectTag = useStore((s) => s.selectTag);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const fetchingRef = useRef(false);
  // Época invalida respostas em voo quando a tag muda (mesmo padrão de useProfileMedia)
  const epochRef = useRef(0);

  const tag = allTags.find((t) => t.id === tagId);

  const loadMore = useCallback(async () => {
    if (cursor === null || fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);
    const epoch = epochRef.current;
    try {
      const page = await getApi().tags.feedPage(tagId, cursor ?? undefined);
      if (epoch !== epochRef.current || !page) return; // tag mudou durante o fetch
      setItems((prev) => (cursor === undefined ? page.items : [...prev, ...page.items]));
      setCursor(page.nextCursor);
    } catch (e) {
      console.error('[TagFeed] Failed to load tag feed page', e);
    } finally {
      fetchingRef.current = false;
      setLoading(false);
    }
  }, [tagId, cursor]);

  // Reset ao trocar de tag
  useEffect(() => {
    epochRef.current++;
    setItems([]);
    setCursor(undefined);
  }, [tagId]);

  useEffect(() => () => {
    epochRef.current++;
  }, []);

  useEffect(() => {
    if (cursor === undefined && !loading) {
      void loadMore();
    }
  }, [cursor, loading, loadMore]);

  return (
    <div className="feed-full">
      <button className="back-btn float" onClick={() => selectTag(null)}>
        ←
      </button>

      <div className="tag-feed-rail">
        {allTags.map((t) => (
          <button
            key={t.id}
            className={`fav-filter-chip ${t.id === tagId ? 'active' : ''}`}
            onClick={() => selectTag(t.id)}
          >
            #{t.name}
          </button>
        ))}
      </div>

      {items.length === 0 && !loading && cursor === null ? (
        <div className="empty-state">
          <p>Nenhum item com a tag #{tag?.name ?? tagId}.</p>
          <button className="cta" onClick={() => selectTag(null)}>
            Voltar para Tags
          </button>
        </div>
      ) : (
        <FeedView key={tagId} scope="profile" items={items} loadNext={loadMore} />
      )}
    </div>
  );
}
