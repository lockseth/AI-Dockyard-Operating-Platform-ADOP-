import { branding } from "@/lib/branding";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="text-xs font-medium uppercase tracking-widest text-neutral-500">
        {branding.statusLabel}
      </span>
      <h1 className="text-4xl font-semibold tracking-tight">
        {branding.productName}
      </h1>
      <p className="text-lg text-neutral-600 dark:text-neutral-400">
        {branding.subtitle}
      </p>
      <p className="text-sm text-neutral-400">{branding.brandedBy}</p>
    </main>
  );
}
