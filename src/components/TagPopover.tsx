import { useEffect, useMemo, useRef, useState } from 'react';
import type { TagTargetType } from '../shared/types';
import { applyTag, unapplyTag, useAllTags, useItemTags } from '../store';

interface TagPopoverProps {
  targetType: TagTargetType;
  targetPath: string;
  onClose: () => void;
}

/**
 * Popover de tagear: chips das tags aplicadas (clique remove), input com
 * autocomplete das tags existentes (Enter ou clique aplica/cria).
 */
export function TagPopover({ targetType, targetPath, onClose }: TagPopoverProps) {
  const allTags = useAllTags();
  const applied = useItemTags(targetType, targetPath);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const suggestions = useMemo(() => {
    const appliedIds = new Set(applied.map((t) => t.id));
    const q = query.trim().toLowerCase();
    return allTags
      .filter((t) => !appliedIds.has(t.id))
      .filter((t) => !q || t.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [allTags, applied, query]);

  const apply = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setQuery('');
    void applyTag(trimmed, targetType, targetPath);
  };

  const handleEnter = () => {
    const q = query.trim();
    if (!q) return;
    // Enter aplica a primeira sugestão exata, senão cria/aplica o texto digitado
    const exact = allTags.find((t) => t.name.toLowerCase() === q.toLowerCase());
    apply(exact ? exact.name : q);
  };

  return (
    <>
      <div className="tag-popover-backdrop" onClick={onClose} />
      <div
        className="tag-popover"
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <div className="tag-popover-title">Tags</div>

        {applied.length > 0 && (
          <div className="tag-chips">
            {applied.map((t) => (
              <button
                key={t.id}
                className="tag-chip applied"
                title={`Remover tag ${t.name}`}
                onClick={() => void unapplyTag(t.id, targetType, targetPath)}
              >
                #{t.name}
                <span className="tag-chip-x">×</span>
              </button>
            ))}
          </div>
        )}

        <input
          ref={inputRef}
          className="tag-input"
          placeholder="Adicionar tag..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleEnter();
            }
          }}
        />

        {suggestions.length > 0 && (
          <div className="tag-suggestions">
            {suggestions.map((t) => (
              <button key={t.id} className="tag-chip" onClick={() => apply(t.name)}>
                #{t.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
