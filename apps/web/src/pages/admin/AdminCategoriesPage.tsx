import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiErrorMessage } from "../../api/client";
import { eventsApi } from "../../api/events";

function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function AdminCategoriesPage() {
  const qc = useQueryClient();
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: eventsApi.categories });
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => eventsApi.createCategory({ name, slug: slugify(name) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categories"] });
      setName("");
    },
    onError: (err) => setError(apiErrorMessage(err, "Không thể tạo danh mục.")),
  });

  return (
    <div>
      <h2 className="text-lg font-bold text-ink-800">Danh mục sự kiện</h2>

      <div className="card mt-4 p-6">
        <div className="flex flex-wrap gap-2">
          {categories?.map((c) => (
            <span key={c.id} className="badge bg-ink-100 text-ink-700">
              {c.name}
            </span>
          ))}
        </div>

        <div className="mt-5 flex gap-2 border-t border-ink-100 pt-5">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên danh mục mới" className="input" />
          <button
            onClick={() => {
              setError(null);
              mutation.mutate();
            }}
            disabled={!name || mutation.isPending}
            className="btn-primary shrink-0"
          >
            + Thêm
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
