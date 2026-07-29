import { ImplicitConfirmClient } from "./ImplicitConfirmClient";

export default function ImplicitConfirmPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#fbfaf9] px-6 py-10">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-xl font-bold tracking-tight text-neutral-900">Memverifikasi Tautan</h1>
        <ImplicitConfirmClient />
      </div>
    </main>
  );
}
