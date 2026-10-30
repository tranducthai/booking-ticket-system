import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { artistsApi } from "../api/artists";
import { apiErrorMessage } from "../api/client";
import type { ArtistDetail, ArtistPost, EventItem } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { SocialLinks } from "../components/artists/SocialLinks";
import { MembershipOffer } from "../components/artists/MembershipOffer";
import { EmptyState } from "../components/ui/EmptyState";
import { ImageField } from "../components/ui/ImageField";
import { PageSpinner } from "../components/ui/Spinner";
import { formatDateTime } from "../lib/format";
import { check } from "../lib/validation";

type Tab = "home" | "schedule" | "posts" | "memberships";
const TABS: Array<{ value: Tab; label: string }> = [
  { value: "home", label: "Trang chủ" },
  { value: "schedule", label: "Lịch diễn" },
  { value: "posts", label: "Bài đăng" },
  { value: "memberships", label: "Thẻ thành viên" },
];

/** An artist's page, Ticketbox Stars style: cover + profile, then Trang chủ / Lịch diễn / Bài đăng / Thẻ thành viên. */
export function ArtistDetailPage() {
  const { id = "" } = useParams();
  const [search, setSearch] = useSearchParams();
  const tab = (TABS.find((t) => t.value === search.get("tab"))?.value ?? "home") as Tab;
  const setTab = (t: Tab) => setSearch(t === "home" ? {} : { tab: t }, { replace: true });
  const { data: artist, isLoading } = useQuery({ queryKey: ["artist", id], queryFn: () => artistsApi.getById(id) });

  if (isLoading || !artist) return <PageSpinner />;

  return (
    <div className="pb-12">
      <ArtistHeader artist={artist} />

      <div className="container-page max-w-5xl">
        <div className="mt-6 flex gap-1 overflow-x-auto border-b border-ink-100">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm font-semibold ${
                tab === t.value ? "border-brand-500 text-brand-600" : "border-transparent text-ink-500 hover:text-ink-800"
              }`}
            >
              {t.label}
              {t.value === "posts" && artist.postCount > 0 && <span className="ml-1.5 text-xs text-ink-400">{artist.postCount}</span>}
            </button>
          ))}
        </div>

        <div className="mt-6">
          {tab === "home" && <HomeTab artist={artist} goTo={setTab} />}
          {tab === "schedule" && <ScheduleTab artist={artist} />}
          {tab === "posts" && <PostsTab artist={artist} goTo={setTab} />}
          {tab === "memberships" &&
            (artist.membershipPlan ? <MembershipOffer artist={artist} /> : <EmptyState title="Nghệ sĩ chưa mở thẻ thành viên" />)}
        </div>
      </div>
    </div>
  );
}

function ArtistHeader({ artist }: { artist: ArtistDetail }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { data: viewer } = useQuery({ queryKey: ["artist", artist.id, "viewer", isAuthenticated], queryFn: () => artistsApi.viewer(artist.id) });
  const follow = useMutation({
    mutationFn: () => (viewer?.following ? artistsApi.unfollow(artist.id) : artistsApi.follow(artist.id)),
    onSuccess: (res) => {
      qc.setQueryData(["artist", artist.id, "viewer", isAuthenticated], { ...viewer!, following: res.following });
      qc.setQueryData<ArtistDetail>(["artist", artist.id], (a) => (a ? { ...a, followerCount: res.followerCount } : a));
    },
  });

  return (
    <div>
      {/* Same as the event banner: the whole cover is shown (object-contain, nothing cropped); a blurred copy fills the sides. */}
      <div className="relative h-64 w-full overflow-hidden bg-gradient-to-br from-ink-900 via-brand-900 to-brand-600 sm:h-96">
        {artist.coverUrl ? (
          <>
            <img src={artist.coverUrl} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-2xl" />
            <img src={artist.coverUrl} alt={artist.name} className="relative h-full w-full object-contain" />
          </>
        ) : (
          artist.avatarUrl && <img src={artist.avatarUrl} alt="" aria-hidden className="h-full w-full scale-110 object-cover opacity-40 blur-2xl" />
        )}
      </div>
      {/* `relative` so the profile row paints above the (positioned) cover it overlaps. */}
      <div className="container-page relative max-w-5xl">
        <div className="-mt-14 flex flex-col gap-4 sm:-mt-16 sm:flex-row sm:items-end">
          {artist.avatarUrl ? (
            <img src={artist.avatarUrl} alt={artist.name} className="h-28 w-28 rounded-full border-4 border-white object-cover shadow sm:h-32 sm:w-32" />
          ) : (
            <span className="flex h-28 w-28 items-center justify-center rounded-full border-4 border-white bg-ink-800 text-4xl font-bold text-white shadow sm:h-32 sm:w-32">
              {artist.name[0]?.toUpperCase()}
            </span>
          )}
          <div className="flex-1 sm:pb-2">
            <div className="flex items-center gap-2">
              <h1 className="text-3xl">{artist.name}</h1>
              {artist.isVerified && (
                <span title="Đã xác minh" className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500">
                  <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5">
                    <path d="M5 13l4 4L19 7" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-ink-500">
              <strong className="text-ink-800">{artist.followerCount.toLocaleString("vi-VN")}</strong> người theo dõi ·{" "}
              <strong className="text-ink-800">{artist.upcomingEvents.length}</strong> sự kiện sắp diễn ra
            </p>
          </div>
          <div className="flex items-center gap-2 sm:pb-2">
            {/* Only ticket buyers (customers) follow artists; organizers/admins don't get the button. */}
            {viewer?.canFollow !== false && (
              <button
                onClick={() => (isAuthenticated ? follow.mutate() : navigate("/login", { state: { from: { pathname: `/artists/${artist.id}` } } }))}
                disabled={follow.isPending}
                className={viewer?.following ? "btn-secondary" : "btn-primary"}
              >
                {viewer?.following ? "✓ Đang theo dõi" : "+ Theo dõi"}
              </button>
            )}
            {artist.membershipPlan?.isActive && !viewer?.isMember && (
              <Link to="?tab=memberships" className="btn-ghost text-brand-600">
                Thẻ thành viên
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AboutCard({ artist }: { artist: ArtistDetail }) {
  return (
    <section className="card p-5">
      <h2 className="text-lg">Giới thiệu</h2>
      <p className="mt-2 whitespace-pre-line text-sm text-ink-600">{artist.bio || "Nghệ sĩ chưa cập nhật giới thiệu."}</p>
      <SocialLinks links={artist.socialLinks} className="mt-3" />
    </section>
  );
}

function HomeTab({ artist, goTo }: { artist: ArtistDetail; goTo: (t: Tab) => void }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <section className="card p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg">Sự kiện sắp diễn ra</h2>
            {artist.upcomingEvents.length > 3 && (
              <button onClick={() => goTo("schedule")} className="text-sm font-semibold text-brand-600 hover:underline">
                Xem tất cả
              </button>
            )}
          </div>
          <div className="mt-3">
            {artist.upcomingEvents.length === 0 ? (
              <p className="py-4 text-sm text-ink-500">Chưa có lịch diễn mới — theo dõi nghệ sĩ để không bỏ lỡ.</p>
            ) : (
              <div className="divide-y divide-ink-100">
                {artist.upcomingEvents.slice(0, 3).map((e) => (
                  <ScheduleRow key={e.id} event={e} />
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="card p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg">Bài đăng mới</h2>
            <button onClick={() => goTo("posts")} className="text-sm font-semibold text-brand-600 hover:underline">
              Xem tất cả
            </button>
          </div>
          <PostFeed artist={artist} limit={2} goTo={goTo} />
        </section>
      </div>

      <aside className="space-y-6">
        <AboutCard artist={artist} />
        {artist.membershipPlan?.isActive && (
          <section className="card p-5">
            <h2 className="text-lg">Thẻ thành viên</h2>
            <p className="mt-2 text-sm text-ink-600">{artist.membershipPlan.name}</p>
            <ul className="mt-2 space-y-1 text-sm text-ink-600">
              {artist.membershipPlan.discountPercent > 0 && <li>✓ Giảm {artist.membershipPlan.discountPercent}% giá vé</li>}
              {artist.membershipPlan.presaleHours > 0 && <li>✓ Mua vé sớm {artist.membershipPlan.presaleHours} giờ</li>}
              <li>✓ Xem bài đăng dành riêng cho thành viên</li>
            </ul>
            <button onClick={() => goTo("memberships")} className="btn-primary mt-4 w-full">
              Xem thẻ thành viên
            </button>
          </section>
        )}
      </aside>
    </div>
  );
}

function ScheduleTab({ artist }: { artist: ArtistDetail }) {
  const [when, setWhen] = useState<"upcoming" | "past">("upcoming");
  const list = when === "upcoming" ? artist.upcomingEvents : artist.pastEvents;
  return (
    <div>
      <div className="flex justify-center gap-8">
        {(["upcoming", "past"] as const).map((w) => (
          <button
            key={w}
            onClick={() => setWhen(w)}
            className={`border-b-2 pb-1.5 text-sm font-bold ${when === w ? "border-brand-500 text-ink-900" : "border-transparent text-ink-400 hover:text-ink-700"}`}
          >
            {w === "upcoming" ? `Sắp diễn ra (${artist.upcomingEvents.length})` : `Đã diễn ra (${artist.pastEvents.length})`}
          </button>
        ))}
      </div>
      <div className="card mt-5 divide-y divide-ink-100 px-5">
        {list.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-500">{when === "upcoming" ? "Chưa có lịch diễn sắp tới." : "Chưa có sự kiện đã diễn ra."}</p>
        ) : (
          list.map((e) => <ScheduleRow key={e.id} event={e} past={when === "past"} />)
        )}
      </div>
    </div>
  );
}

function ScheduleRow({ event: e, past }: { event: EventItem; past?: boolean }) {
  const image = e.posterUrl || e.bannerUrl;
  return (
    <div className="flex items-center gap-4 py-4">
      {image && (
        <Link to={`/events/${e.id}`} className="shrink-0">
          <img src={image} alt={e.title} className={`h-20 w-16 rounded-xl object-cover ${past ? "opacity-60 grayscale" : ""}`} />
        </Link>
      )}
      <div className="min-w-0 flex-1">
        <Link to={`/events/${e.id}`} className="line-clamp-2 font-bold text-ink-900 hover:text-brand-600">
          {e.title}
        </Link>
        <p className="mt-0.5 text-sm text-ink-500">
          {formatDateTime(e.startTime)} · {e.venueName}
          {e.province ? `, ${e.province.replace(/^(Thành phố|Tỉnh) /, "")}` : ""}
        </p>
      </div>
      {past ? (
        <span className="shrink-0 text-xs font-semibold text-ink-400">Đã diễn ra</span>
      ) : (
        <Link to={`/events/${e.id}`} className="btn-primary shrink-0 px-4 py-2 text-sm">
          Mua vé
        </Link>
      )}
    </div>
  );
}

function PostsTab({ artist, goTo }: { artist: ArtistDetail; goTo: (t: Tab) => void }) {
  const { isAuthenticated } = useAuth();
  const { data: viewer } = useQuery({ queryKey: ["artist", artist.id, "viewer", isAuthenticated], queryFn: () => artistsApi.viewer(artist.id) });
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {viewer?.canPost && <PostComposer artist={artist} />}
      <PostFeed artist={artist} goTo={goTo} />
    </div>
  );
}

function PostComposer({ artist }: { artist: ArtistDetail }) {
  const qc = useQueryClient();
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [membersOnly, setMembersOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => {
      check(!content.trim() ? "Nhập nội dung bài đăng" : null, content.length > 2000 ? "Nội dung tối đa 2000 ký tự" : null);
      return artistsApi.posts.create(artist.id, { content: content.trim(), imageUrl: imageUrl || undefined, membersOnly });
    },
    onSuccess: () => {
      setContent("");
      setImageUrl("");
      setMembersOnly(false);
      setError(null);
      void qc.invalidateQueries({ queryKey: ["artist", artist.id] });
    },
    onError: (err) => setError(apiErrorMessage(err, "Không thể đăng bài.")),
  });
  return (
    <div className="card space-y-3 p-5">
      <p className="text-sm font-semibold text-ink-700">Đăng bài trên trang của {artist.name}</p>
      <textarea value={content} onChange={(e) => setContent(e.target.value)} maxLength={2000} className="input min-h-[100px]" placeholder="Thông báo lịch diễn, hậu trường, lời cảm ơn khán giả..." />
      <ImageField label="Ảnh (tuỳ chọn)" kind="content" value={imageUrl} onChange={setImageUrl} previewClassName="max-h-64 w-full object-cover" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" checked={membersOnly} onChange={(e) => setMembersOnly(e.target.checked)} className="h-4 w-4 accent-brand-500" />
          Chỉ thành viên xem được
        </label>
        <button onClick={() => create.mutate()} disabled={create.isPending} className="btn-primary">
          {create.isPending ? "Đang đăng..." : "Đăng bài"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

function PostFeed({ artist, limit, goTo }: { artist: ArtistDetail; limit?: number; goTo: (t: Tab) => void }) {
  const qc = useQueryClient();
  const { isAuthenticated } = useAuth();
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({ queryKey: ["artist", artist.id, "posts", page, isAuthenticated], queryFn: () => artistsApi.posts.list(artist.id, page) });
  const { data: viewer } = useQuery({ queryKey: ["artist", artist.id, "viewer", isAuthenticated], queryFn: () => artistsApi.viewer(artist.id) });
  const remove = useMutation({
    mutationFn: (postId: string) => artistsApi.posts.remove(artist.id, postId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["artist", artist.id] }),
  });

  if (isLoading) return <PageSpinner />;
  const posts = limit ? (data?.data ?? []).slice(0, limit) : (data?.data ?? []);
  if (posts.length === 0) return <p className="py-6 text-center text-sm text-ink-500">Chưa có bài đăng nào.</p>;
  const pages = data ? Math.ceil(data.total / data.limit) : 1;

  return (
    <div className="mt-3 space-y-4">
      {posts.map((p) => (
        <PostCard
          key={p.id}
          post={p}
          artist={artist}
          onUnlock={() => goTo("memberships")}
          onDelete={viewer?.canPost ? () => window.confirm("Xoá bài đăng này?") && remove.mutate(p.id) : undefined}
        />
      ))}
      {!limit && pages > 1 && (
        <div className="flex justify-center gap-2">
          <button disabled={page === 1} onClick={() => setPage(page - 1)} className="btn-secondary disabled:opacity-40">
            ‹ Mới hơn
          </button>
          <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="btn-secondary disabled:opacity-40">
            Cũ hơn ›
          </button>
        </div>
      )}
    </div>
  );
}

function PostCard({ post, artist, onUnlock, onDelete }: { post: ArtistPost; artist: ArtistDetail; onUnlock: () => void; onDelete?: () => void }) {
  return (
    <article className="rounded-2xl border border-ink-100 bg-white p-4">
      <header className="flex items-center gap-3">
        {artist.avatarUrl ? (
          <img src={artist.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
        ) : (
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ink-800 font-bold text-white">{artist.name[0]?.toUpperCase()}</span>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-bold text-ink-900">{artist.name}</p>
          <p className="text-xs text-ink-400">
            {formatDateTime(post.createdAt)}
            {post.membersOnly && <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 font-semibold text-brand-600">Thành viên</span>}
          </p>
        </div>
        {onDelete && (
          <button onClick={onDelete} className="text-xs font-semibold text-ink-400 hover:text-red-600">
            Xoá
          </button>
        )}
      </header>
      {post.locked ? (
        <div className="mt-3 rounded-xl bg-ink-50 px-4 py-6 text-center">
          <p className="text-sm font-semibold text-ink-700">🔒 Bài đăng dành riêng cho thành viên</p>
          <button onClick={onUnlock} className="mt-2 text-sm font-semibold text-brand-600 hover:underline">
            Đăng ký thẻ thành viên để xem
          </button>
        </div>
      ) : (
        <>
          <p className="mt-3 whitespace-pre-line text-sm text-ink-800">{post.content}</p>
          {post.imageUrl && <img src={post.imageUrl} alt="" className="mt-3 max-h-[420px] w-full rounded-xl object-cover" />}
        </>
      )}
    </article>
  );
}
