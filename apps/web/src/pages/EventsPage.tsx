import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { eventsApi } from "../api/events";
import { CategoryChips } from "../components/events/CategoryChips";
import { EventCard, EventCardSkeleton } from "../components/events/EventCard";
import { EmptyState } from "../components/ui/EmptyState";

export function EventsPage() {
  const [params, setParams] = useSearchParams();
  const keyword = params.get("keyword") ?? "";
  const categorySlug = params.get("category") ?? undefined;
  const [keywordInput, setKeywordInput] = useState(keyword);

  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: eventsApi.categories });
  const activeCategory = categories?.find((c) => c.slug === categorySlug);

  const { data, isLoading } = useQuery({
    queryKey: ["events", "search", keyword, activeCategory?.id],
    queryFn: () => eventsApi.search({ keyword: keyword || undefined, categoryId: activeCategory?.id, limit: 24 }),
  });

  const title = useMemo(() => {
    if (keyword) return `Kết quả cho "${keyword}"`;
    if (activeCategory) return activeCategory.name;
    return "Tất cả sự kiện";
  }, [keyword, activeCategory]);

  function selectCategory(slug?: string) {
    const next = new URLSearchParams(params);
    if (slug) next.set("category", slug);
    else next.delete("category");
    setParams(next);
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const next = new URLSearchParams(params);
    if (keywordInput.trim()) next.set("keyword", keywordInput.trim());
    else next.delete("keyword");
    setParams(next);
  }

  return (
    <div className="container-page py-10">
      <h1 className="text-3xl">Khám phá sự kiện</h1>

      <form onSubmit={submitSearch} className="mt-5 max-w-lg sm:hidden">
        <input value={keywordInput} onChange={(e) => setKeywordInput(e.target.value)} placeholder="Tìm sự kiện..." className="input" />
      </form>

      <div className="mt-6">
        <CategoryChips categories={categories ?? []} active={categorySlug} onSelect={selectCategory} />
      </div>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-lg font-bold text-ink-700">{title}</h2>
        {data && (
          <span className="text-sm text-ink-400">
            {data.data.length} sự kiện{data.hasMore ? "+" : ""}
          </span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {isLoading
          ? Array.from({ length: 8 }).map((_, i) => <EventCardSkeleton key={i} />)
          : data?.data.map((e) => <EventCard key={e.id} event={e} />)}
      </div>

      {!isLoading && data?.data.length === 0 && (
        <div className="mt-8">
          <EmptyState title="Không tìm thấy sự kiện phù hợp" description="Thử một từ khóa hoặc danh mục khác." />
        </div>
      )}
    </div>
  );
}
