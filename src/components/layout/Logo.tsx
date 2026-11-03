/** Wordmark: a tiny episode strip (canon, canon, filler, canon) next to the name. */
export function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <span aria-hidden className="flex h-5 items-stretch gap-[2px]">
        <span className="w-1.5 bg-canon" />
        <span className="w-1.5 bg-canon" />
        <span className="w-1.5 bg-filler" />
        <span className="w-1.5 bg-mixed" />
        <span className="w-1.5 bg-canon" />
      </span>
      <span className="font-[family-name:var(--font-display)] text-lg leading-none tracking-[-0.01em] uppercase">
        Filler<span className="font-medium text-muted-foreground">Finder</span>
      </span>
    </span>
  );
}
