import { Spinner } from "../ui/Spinner";

/** Shown while EventDetailPage's useWaitingRoom hook reports `locked` — docs/spec/11-implementation-roadmap.md Phase 8b. */
export function WaitingRoomScreen({ position, queueLength }: { position?: number; queueLength?: number }) {
  return (
    <div className="container-page flex min-h-[70vh] flex-col items-center justify-center text-center">
      <Spinner className="h-10 w-10" />
      <h1 className="mt-6 text-2xl">Sự kiện đang rất được quan tâm</h1>
      <p className="mt-2 max-w-md text-ink-500">
        Chúng tôi đang xếp hàng để đảm bảo hệ thống không bị quá tải. Trang sẽ tự động vào khi đến lượt bạn — đừng tải lại trang.
      </p>
      {position !== undefined && (
        <div className="card mt-6 px-8 py-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Vị trí của bạn</p>
          <p className="mt-1 font-mono text-3xl font-extrabold text-brand-600">#{position}</p>
          {queueLength !== undefined && <p className="mt-1 text-sm text-ink-400">trong {queueLength} người đang chờ</p>}
        </div>
      )}
    </div>
  );
}
