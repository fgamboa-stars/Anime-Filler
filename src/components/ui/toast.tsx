import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, CircleAlert } from 'lucide-react';
import { cn } from '@/utils/cn';

interface Toast {
  id: number;
  message: string;
  tone: 'success' | 'error';
}

interface ToastApi {
  show: (message: string, tone?: Toast['tone']) => void;
}

const ToastContext = createContext<ToastApi>({ show: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const show = useCallback((message: string, tone: Toast['tone'] = 'success') => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-2), { id, message, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        role="status"
        className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'animate-toast-in pointer-events-auto flex items-center gap-2.5 rounded-md border-2 border-edge bg-surface px-4 py-2.5 text-sm font-semibold text-foreground shadow-hard',
            )}
          >
            {t.tone === 'success' ? (
              <CheckCircle2 className="size-4 text-success" aria-hidden />
            ) : (
              <CircleAlert className="size-4 text-danger" aria-hidden />
            )}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  return useContext(ToastContext);
}
