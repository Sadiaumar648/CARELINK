export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-2 p-6">
      <h1 className="text-[26px] font-semibold">{title}</h1>
      <p className="text-[15px] text-ink-muted">This screen is being built next.</p>
    </div>
  );
}
