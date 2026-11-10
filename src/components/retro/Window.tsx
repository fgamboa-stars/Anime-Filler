import { useEffect, useState, type ReactNode } from 'react';
import { Minus, Square, X } from 'lucide-react';
import { cn } from '@/utils/cn';

export type WindowState = 'normal' | 'minimized' | 'maximized';

interface WindowProps {
  /** File-name style caption for the title bar, e.g. "filler.stats". */
  title: string;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Render as a different element (e.g. "section" with aria-labelledby). */
  as?: 'div' | 'section' | 'figure';
  'aria-labelledby'?: string;
  'aria-label'?: string;
  /**
   * Makes the title-bar buttons work: – minimizes, □ maximizes, × also minimizes
   * (nothing is ever closed for good). Pressing a button again restores the window.
   * Without this, the controls are decoration.
   */
  controls?: { state: WindowState; onChange: (state: WindowState) => void; name: string };
}

/**
 * Retro window: a black title bar with a file-name caption and window controls,
 * over an edged body with a hard shadow. Real headings live inside the body.
 */
export function Window({ title, children, className, bodyClassName, as: Tag = 'div', controls, ...aria }: WindowProps) {
  const minimized = controls?.state === 'minimized';
  return (
    <Tag className={cn('panel flex flex-col', className)} data-state={controls?.state} {...aria}>
      <div
        aria-hidden={controls ? undefined : true}
        className="flex h-8 shrink-0 items-center justify-between gap-3 bg-primary px-3 text-primary-foreground"
      >
        {controls ? (
          // When minimized the caption is all that is left, so make it a way back in.
          <button
            type="button"
            onClick={() => minimized && controls.onChange('normal')}
            tabIndex={minimized ? 0 : -1}
            aria-hidden={minimized ? undefined : true}
            className={cn('text-label truncate text-left', minimized ? 'cursor-pointer hover:underline' : 'cursor-default')}
          >
            {title}
          </button>
        ) : (
          <span className="text-label truncate">{title}</span>
        )}
        <span className="flex gap-1.5">
          {controls ? (
            <WindowButtons {...controls} />
          ) : (
            [Minus, Square, X].map((Icon, i) => (
              <span key={i} className="flex size-4 items-center justify-center border-[1.5px] border-primary-foreground">
                <Icon className="size-2.5" strokeWidth={3.5} />
              </span>
            ))
          )}
        </span>
      </div>
      <div hidden={minimized} className={cn('min-w-0 flex-1', bodyClassName)}>
        {children}
      </div>
    </Tag>
  );
}

function WindowButtons({ state, onChange, name }: { state: WindowState; onChange: (state: WindowState) => void; name: string }) {
  const toggle = (target: WindowState) => onChange(state === target ? 'normal' : target);
  const buttons = [
    { Icon: Minus, label: state === 'minimized' ? `Restore ${name}` : `Minimize ${name}`, onClick: () => toggle('minimized') },
    { Icon: Square, label: state === 'maximized' ? `Restore ${name}` : `Maximize ${name}`, onClick: () => toggle('maximized') },
    { Icon: X, label: state === 'minimized' ? `Restore ${name}` : `Close ${name} (minimizes it)`, onClick: () => toggle('minimized') },
  ];
  return buttons.map(({ Icon, label, onClick }, i) => (
    <button
      key={i}
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex size-5 items-center justify-center border-[1.5px] border-primary-foreground transition-colors hover:bg-primary-foreground hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-foreground"
    >
      <Icon className="size-3" strokeWidth={3.5} aria-hidden />
    </button>
  ));
}

const STORAGE_PREFIX = 'aff:window:';

/** Window state remembered across visits (localStorage), per window id. */
export function useWindowState(id: string, initial: WindowState = 'normal') {
  const [state, setState] = useState<WindowState>(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_PREFIX + id);
      return saved === 'minimized' || saved === 'maximized' || saved === 'normal' ? saved : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_PREFIX + id, state);
    } catch {
      /* private mode: state lasts for this visit only */
    }
  }, [id, state]);
  return [state, setState] as const;
}
