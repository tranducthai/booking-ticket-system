import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { adminApi } from "../../api/admin";
import type { Role } from "../../api/types";
import { Badge } from "../../components/ui/Badge";
import { EmptyState } from "../../components/ui/EmptyState";
import { PageSpinner } from "../../components/ui/Spinner";
import { formatDateTime } from "../../lib/format";

const ROLE_LABEL: Record<Role, string> = { CUSTOMER: "Khách hàng", ORGANIZER: "Ban tổ chức", ADMIN: "Quản trị" };
const ROLE_TONE: Record<Role, "neutral" | "brand" | "warning"> = { CUSTOMER: "neutral", ORGANIZER: "brand", ADMIN: "warning" };
const TABS: { value: Role | ""; label: string }[] = [
  { value: "", label: "Tất cả" },
  { value: "CUSTOMER", label: "Khách hàng" },
  { value: "ORGANIZER", label: "Ban tổ chức" },
  { value: "ADMIN", label: "Quản trị" },
];
const PAGE_SIZE = 25;

export function AdminUsersPage() {
  const qc = useQueryClient();
  const [roleFilter, setRoleFilter] = useState<Role | "">("");
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "users", roleFilter, q, page],
    queryFn: () => adminApi.users({ page, limit: PAGE_SIZE, role: roleFilter || undefined, q: q || undefined }),
  });

  const lockMutation = useMutation({
    mutationFn: ({ id, isLocked }: { id: string; isLocked: boolean }) => adminApi.lockUser(id, isLocked),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin"] }),
  });
  const verifyMutation = useMutation({
    mutationFn: (id: string) => adminApi.verifyOrganizer(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin"] }),
  });

  const users = Array.isArray(data) ? data : (data?.data ?? []);
  const total = Array.isArray(data) ? data.length : (data?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl">Người dùng</h1>
        <p className="mt-1 text-sm text-ink-500">Tất cả tài khoản trên hệ thống — tìm kiếm, khóa/mở khóa, nâng cấp thành ban tổ chức.</p>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-ink-100">
        {TABS.map((t) => (
          <button
            key={t.label}
            onClick={() => {
              setRoleFilter(t.value);
              setPage(1);
            }}
            className={`-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm font-semibold ${
              roleFilter === t.value ? "border-brand-500 text-brand-600" : "border-transparent text-ink-500 hover:text-ink-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setQ(input.trim());
          setPage(1);
        }}
        className="flex max-w-xl gap-2"
      >
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Tìm theo email, tên, số điện thoại..." className="input" />
        <button type="submit" className="btn-secondary shrink-0">
          Tìm
        </button>
      </form>

      {isLoading ? (
        <PageSpinner />
      ) : users.length === 0 ? (
        <EmptyState title="Không tìm thấy người dùng nào" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-left text-xs uppercase text-ink-400">
              <tr>
                <th className="px-4 py-3">Người dùng</th>
                <th className="px-4 py-3">Vai trò</th>
                <th className="px-4 py-3">Ngày tham gia</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-ink-100">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-ink-800">{u.fullName}</p>
                    <p className="text-xs text-ink-400">
                      {u.email}
                      {u.phone ? ` · ${u.phone}` : ""}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={ROLE_TONE[u.role]}>{ROLE_LABEL[u.role]}</Badge>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink-500">{formatDateTime(u.createdAt)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={u.isLocked ? "danger" : "success"}>{u.isLocked ? "Đã khóa" : "Hoạt động"}</Badge>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {u.role === "CUSTOMER" && (
                      <button
                        onClick={() => confirm(`Nâng ${u.fullName} thành ban tổ chức (đối tác)?`) && verifyMutation.mutate(u.id)}
                        className="font-semibold text-brand-600 hover:underline"
                      >
                        Đặt làm đối tác
                      </button>
                    )}
                    {u.role !== "ADMIN" && (
                      <button
                        onClick={() => {
                          if (u.isLocked || confirm(`Khóa tài khoản ${u.email}? Người dùng sẽ không đăng nhập được.`)) {
                            lockMutation.mutate({ id: u.id, isLocked: !u.isLocked });
                          }
                        }}
                        className="ml-3 text-ink-500 hover:underline"
                      >
                        {u.isLocked ? "Mở khóa" : "Khóa"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="btn-ghost">
            ← Trước
          </button>
          <span className="text-ink-500">
            Trang {page}/{totalPages} · {total} tài khoản
          </span>
          <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="btn-ghost">
            Sau →
          </button>
        </div>
      )}
    </div>
  );
}
