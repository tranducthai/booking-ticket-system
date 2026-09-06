import type { OrderStatsDaily } from "../../api/types";
import { formatVnd } from "../../lib/format";

/** Hand-rolled inline SVG bar chart — no charting library in this project, and a daily-revenue trend for a dashboard doesn't need one. */
export function RevenueTrendChart({ data }: { data: OrderStatsDaily[] }) {
  if (data.length === 0) {
    return <div className="flex h-48 items-center justify-center text-sm text-ink-400">Chưa có dữ liệu doanh thu trong khoảng thời gian này.</div>;
  }

  const width = 720;
  const height = 220;
  const padding = { top: 10, right: 10, bottom: 28, left: 10 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const max = Math.max(...data.map((d) => d.revenue), 1);
  const barGap = 4;
  const barW = Math.max((chartW - barGap * (data.length - 1)) / data.length, 2);
  const labelEvery = Math.max(Math.ceil(data.length / 8), 1);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Biểu đồ doanh thu theo ngày">
      {data.map((d, i) => {
        const barH = (d.revenue / max) * chartH;
        const x = padding.left + i * (barW + barGap);
        const y = padding.top + (chartH - barH);
        return (
          <g key={d.date}>
            <rect x={x} y={y} width={barW} height={Math.max(barH, 1)} rx={2} className="fill-brand-400 hover:fill-brand-600">
              <title>
                {d.date}: {formatVnd(d.revenue)} · {d.orders} đơn
              </title>
            </rect>
            {i % labelEvery === 0 && (
              <text x={x + barW / 2} y={height - 8} textAnchor="middle" className="fill-ink-400 text-[9px]">
                {d.date.slice(5)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
