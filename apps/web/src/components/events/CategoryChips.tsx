import clsx from "clsx";
import type { Category } from "../../api/types";

export function CategoryChips({
  categories,
  active,
  onSelect,
}: {
  categories: Category[];
  active?: string;
  onSelect: (slug?: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => onSelect(undefined)}
        className={clsx(
          "rounded-full px-4 py-2 text-sm font-semibold transition-colors",
          !active ? "bg-ink-900 text-white" : "bg-white text-ink-600 ring-1 ring-inset ring-ink-200 hover:bg-ink-50",
        )}
      >
        Tất cả
      </button>
      {categories.map((c) => (
        <button
          key={c.id}
          onClick={() => onSelect(c.slug)}
          className={clsx(
            "rounded-full px-4 py-2 text-sm font-semibold transition-colors",
            active === c.slug ? "bg-ink-900 text-white" : "bg-white text-ink-600 ring-1 ring-inset ring-ink-200 hover:bg-ink-50",
          )}
        >
          {c.name}
        </button>
      ))}
    </div>
  );
}
