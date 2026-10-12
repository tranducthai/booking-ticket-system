/** "1.200.000đ" — activity summaries are stored pre-rendered (docs/spec/14-activity-log-design.md §2). */
export const vnd = (amount: number | string | { toString(): string }) => `${new Intl.NumberFormat("vi-VN").format(Number(amount.toString()))}đ`;
