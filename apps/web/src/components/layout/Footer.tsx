export function Footer() {
  return (
    <footer className="mt-24 border-t border-ink-100 bg-white">
      <div className="container-page grid gap-8 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <span className="text-lg font-extrabold text-ink-900">
            Ticket<span className="text-brand-500">box</span>
          </span>
          <p className="mt-3 max-w-xs text-sm text-ink-500">
            Nền tảng bán vé sự kiện trực tuyến — âm nhạc, sân khấu, thể thao, hội thảo. Đồ án minh họa kiến trúc
            microservices.
          </p>
        </div>
        <div>
          <p className="mb-3 text-sm font-bold text-ink-800">Khám phá</p>
          <ul className="space-y-2 text-sm text-ink-500">
            <li>Sự kiện sắp diễn ra</li>
            <li>Âm nhạc</li>
            <li>Sân khấu &amp; Nghệ thuật</li>
            <li>Thể thao</li>
          </ul>
        </div>
        <div>
          <p className="mb-3 text-sm font-bold text-ink-800">Dành cho ban tổ chức</p>
          <ul className="space-y-2 text-sm text-ink-500">
            <li>Tạo sự kiện</li>
            <li>Công cụ bán vé</li>
            <li>Sơ đồ chỗ ngồi</li>
          </ul>
        </div>
        <div>
          <p className="mb-3 text-sm font-bold text-ink-800">Hỗ trợ</p>
          <ul className="space-y-2 text-sm text-ink-500">
            <li>Câu hỏi thường gặp</li>
            <li>Chính sách hoàn vé</li>
            <li>Liên hệ</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-ink-100 py-5 text-center text-xs text-ink-400">
        © {new Date().getFullYear()} Ticketbox — đồ án booking-ticket-system.
      </div>
    </footer>
  );
}
