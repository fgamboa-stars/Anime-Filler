/** Wordmark: a tiny episode strip (canon, canon, filler, canon) next to the name. */
export function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <span aria-hidden className="flex h-5 items-stretch gap-[2px]">
        <span className="w-1.5 rounded-[1px] bg-canon" />
        <span className="w-1.5 rounded-[1px] bg-canon" />
        <span className="w-1.5 rounded-[1px] bg-filler" />
        <span className="w-1.5 rounded-[1px] bg-mixed" />
        <span className="w-1.5 rounded-[1px] bg-canon" />
      </span>
      <span className="text-[17px] leading-none font-semibold tracking-[-0.03em]">
        Filler<span className="font-medium text-muted-foreground">Finder</span>
      </span>
    </span>
  );
}
