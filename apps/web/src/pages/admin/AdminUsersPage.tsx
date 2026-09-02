import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { adminApi } from "../../api/admin";
import type { Role } from "../../api/types";
import { Badge } from "../../components/ui/Badge";
import { PageSpinner } from "../../components/ui/Spinner";

const ROLE_LABEL: Record<Role, string> = { CUSTOMER: "Khách hàng", ORGANIZER: "Ban tổ chức", ADMIN: "Quản trị" };

export function AdminUsersPage() {
  const qc = useQueryClient();
  const [roleFilter, setRoleFilter] = useState<Role | "">("");
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "users", roleFilter],
    queryFn: () => adminApi.users({ limit: 100, role: roleFilter || undefined }),
  });

  const lockMutation = useMutation({
    mutationFn: ({ id, isLocked }: { id: string; isLocked: boolean }) => adminApi.lockUser(id, isLocked),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
  });
  const verifyMutation = useMutation({
    mutationFn: (id: string) => adminApi.verifyOrganizer(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
  });

  const users = Array.isArray(data) ? data : (data?.data ?? []);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-ink-800">Người dùng</h2>
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as Role | "")} className="input w-44">
          <option value="">Tất cả vai trò</option>
          <option value="CUSTOMER">Khách hàng</option>
          <option value="ORGANIZER">Ban tổ chức</option>
          <option value="ADMIN">Quản trị</option>
        </select>
      </div>

      {isLoading ? (
        <PageSpinner />
      ) : (
        <div className="card mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-left text-xs uppercase text-ink-400">
              <tr>
                <th className="px-4 py-3">Tên</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Vai trò</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3 text-right">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-ink-100">
                  <td className="px-4 py-3 font-semibold text-ink-800">{u.fullName}</td>
                  <td className="px-4 py-3 text-ink-500">{u.email}</td>
                  <td className="px-4 py-3">{ROLE_LABEL[u.role]}</td>
                  <td className="px-4 py-3">
                    <Badge tone={u.isLocked ? "danger" : "success"}>{u.isLocked ? "Đã khóa" : "Hoạt động"}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {u.role === "CUSTOMER" && (
                        <button onClick={() => verifyMutation.mutate(u.id)} className="text-xs font-semibold text-brand-600 hover:underline">
                          Đặt làm Organizer
                        </button>
                      )}
                      <button
                        onClick={() => lockMutation.mutate({ id: u.id, isLocked: !u.isLocked })}
                        className="text-xs font-semibold text-ink-500 hover:underline"
                      >
                        {u.isLocked ? "Mở khóa" : "Khóa"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
