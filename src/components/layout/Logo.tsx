import { Barcode } from '@/components/retro/Barcode';

/** Wordmark: a small barcode next to the name. */
export function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <Barcode text="filler" className="h-6 w-11 text-foreground" />
      <span className="font-[family-name:var(--font-display)] text-lg leading-none tracking-[-0.01em] uppercase">
        Filler<span className="font-medium text-muted-foreground">Finder</span>
      </span>
    </span>
  );
}
