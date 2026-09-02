import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="container-page flex min-h-[60vh] flex-col items-center justify-center text-center">
      <p className="text-6xl font-extrabold text-brand-500">404</p>
      <h1 className="mt-3 text-2xl">Không tìm thấy trang</h1>
      <Link to="/" className="btn-primary mt-6">
        Về trang chủ
      </Link>
    </div>
  );
}
