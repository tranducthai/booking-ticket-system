import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { eventsApi } from "../api/events";
import { CategoryChips } from "../components/events/CategoryChips";
import { EventCard, EventCardSkeleton } from "../components/events/EventCard";
import { EmptyState } from "../components/ui/EmptyState";
import { useFavorites } from "../hooks/useFavorites";

export function EventsPage() {
  const [params, setParams] = useSearchParams();
  const keyword = params.get("keyword") ?? "";
  const categorySlug = params.get("category") ?? undefined;
  const location = params.get("location") ?? "";
  const minPrice = params.get("gia-tu") ?? "";
  const maxPrice = params.get("gia-den") ?? "";
  const dateFrom = params.get("tu-ngay") ?? "";
  const dateTo = params.get("den-ngay") ?? "";
  const [keywordInput, setKeywordInput] = useState(keyword);
  const [filters, setFilters] = useState({ location, minPrice, maxPrice, dateFrom, dateTo });
  const [showFilters, setShowFilters] = useState(false);

  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: eventsApi.categories });
  const activeCategory = categories?.find((c) => c.slug === categorySlug);

  const { data, isLoading } = useQuery({
    queryKey: ["events", "search", keyword, activeCategory?.id, location, minPrice, maxPrice, dateFrom, dateTo],
    queryFn: () =>
      eventsApi.search({
        keyword: keyword || undefined,
        categoryId: activeCategory?.id,
        location: location || undefined,
        minPrice: minPrice ? Number(minPrice) : undefined,
        maxPrice: maxPrice ? Number(maxPrice) : undefined,
        startDateFrom: dateFrom || undefined,
        startDateTo: dateTo || undefined,
        limit: 24,
      }),
  });

  const activeFilterCount = [location, minPrice, maxPrice, dateFrom, dateTo].filter(Boolean).length;
  const favorites = useFavorites(useMemo(() => data?.data.map((e) => e.id) ?? [], [data]));

  function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    const next = new URLSearchParams(params);
    const set = (key: string, value: string) => (value.trim() ? next.set(key, value.trim()) : next.delete(key));
    set("location", filters.location);
    set("gia-tu", filters.minPrice);
    set("gia-den", filters.maxPrice);
    set("tu-ngay", filters.dateFrom);
    set("den-ngay", filters.dateTo);
    setParams(next);
  }

  function clearFilters() {
    setFilters({ location: "", minPrice: "", maxPrice: "", dateFrom: "", dateTo: "" });
    const next = new URLSearchParams(params);
    ["location", "gia-tu", "gia-den", "tu-ngay", "den-ngay"].forEach((k) => next.delete(k));
    setParams(next);
  }

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

      <div className="mt-4">
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          className="btn-secondary text-sm"
        >
          Bộ lọc {activeFilterCount > 0 ? `(${activeFilterCount})` : ""}
        </button>

        {showFilters && (
          <form onSubmit={applyFilters} className="card mt-3 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
            <input
              value={filters.location}
              onChange={(e) => setFilters({ ...filters, location: e.target.value })}
              placeholder="Địa điểm"
              className="input"
            />
            <input
              type="number"
              min={0}
              value={filters.minPrice}
              onChange={(e) => setFilters({ ...filters, minPrice: e.target.value })}
              placeholder="Giá từ (VND)"
              className="input"
            />
            <input
              type="number"
              min={0}
              value={filters.maxPrice}
              onChange={(e) => setFilters({ ...filters, maxPrice: e.target.value })}
              placeholder="Giá đến (VND)"
              className="input"
            />
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
              className="input"
            />
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
              className="input"
            />
            <div className="flex gap-2 sm:col-span-2 lg:col-span-5">
              <button type="submit" className="btn-primary">
                Áp dụng
              </button>
              <button type="button" onClick={clearFilters} className="btn-ghost">
                Xóa bộ lọc
              </button>
            </div>
          </form>
        )}
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
          : data?.data.map((e) => (
              <EventCard
                key={e.id}
                event={e}
                favorited={favorites.enabled ? favorites.isFavorited(e.id) : undefined}
                onToggleFavorite={favorites.enabled ? () => favorites.toggle(e.id) : undefined}
              />
            ))}
      </div>

      {!isLoading && data?.data.length === 0 && (
        <div className="mt-8">
          <EmptyState title="Không tìm thấy sự kiện phù hợp" description="Thử một từ khóa hoặc danh mục khác." />
        </div>
      )}
    </div>
  );
}
