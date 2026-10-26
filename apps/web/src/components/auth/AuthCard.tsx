import type { ReactNode } from "react";
import { Link } from "react-router-dom";

const PERKS = ["Tìm kiếm và mua vé điện tử nhanh chóng", "Tạo và quản lí sự kiện của riêng bạn dễ dàng"];

/**
 * Shell of every sign-in style page (login, register, forgot/reset password):
 * a brand panel on the left (desktop only) and the form on the right.
 */
export function AuthCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="grid min-h-[calc(100vh-4rem)] bg-white lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-gold-400/20" />

        <Link to="/" className="relative flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-brand-600">
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden>
              <path
                d="M4 9a2.5 2.5 0 000 5v3a1.5 1.5 0 001.5 1.5h13A1.5 1.5 0 0020 16v-3a2.5 2.5 0 000-5V5.5A1.5 1.5 0 0018.5 4h-13A1.5 1.5 0 004 5.5V9Z"
                fill="currentColor"
              />
            </svg>
          </span>
          <span className="text-xl font-extrabold">EventPass</span>
        </Link>

        <div className="relative">
          <h2 className="max-w-sm text-4xl font-extrabold leading-tight !text-white">EventPass</h2>
          <ul className="mt-8 space-y-3.5">
            {PERKS.map((p) => (
              <li key={p} className="flex items-center gap-3 text-white/90">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/20">
                  <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" aria-hidden>
                    <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/60">© EventPass</p>
      </aside>

      <main className="flex items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-[420px]">
          <Link to="/" className="mb-8 flex items-center gap-2 lg:hidden">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-white">
              <svg viewBox="0 0 24 24" fill="none" className="h-4.5 w-4.5" aria-hidden>
                <path
                  d="M4 9a2.5 2.5 0 000 5v3a1.5 1.5 0 001.5 1.5h13A1.5 1.5 0 0020 16v-3a2.5 2.5 0 000-5V5.5A1.5 1.5 0 0018.5 4h-13A1.5 1.5 0 004 5.5V9Z"
                  fill="currentColor"
                />
              </svg>
            </span>
            <span className="text-lg font-extrabold text-ink-900">
              Event<span className="text-brand-500">Pass</span>
            </span>
          </Link>
          <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm text-ink-500">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
