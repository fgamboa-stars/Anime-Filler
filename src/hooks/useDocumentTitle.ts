import { useEffect } from 'react';

const BASE = 'Anime Filler Finder';

export function useDocumentTitle(title?: string | null) {
  useEffect(() => {
    document.title = title ? `${title} | ${BASE}` : BASE;
  }, [title]);
}
