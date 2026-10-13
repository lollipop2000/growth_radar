import { t, ui, date } from "@/lib/i18n/ru";
import Link from "next/link";
export function format(value: number | null | undefined, digits = 0) {
  return value == null
    ? "—"
    : new Intl.NumberFormat("ru-RU", { maximumFractionDigits: digits }).format(
        value,
      );
}
export function timestamp(value: Date | string | null | undefined) {
  return value
    ? new Date(value).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })
    : "—";
}
export function PeriodLinks({ path, n }: { path: string; n: number }) {
  return (
    <nav className="period-links" aria-label={t("Период")}>
      {[7, 28, 30, 90].map((v) => (
        <Link
          key={v}
          href={`${path}?period=${v}`}
          aria-current={n === v ? "page" : undefined}
        >
          {v} {t("days")}</Link>
      ))}
    </nav>
  );
}
export function Metrics({
  values,
}: {
  values: Record<string, number | null | undefined>;
}) {
  return (
    <dl className="metric-grid">
      {Object.entries(values).map(([label, value]) => (
        <div key={label}>
          <dt data-source-value={/ · Goal \d+/.test(label) ? true : undefined}>{ui(label)}</dt>
          <dd>{format(value, 2)}</dd>
        </div>
      ))}
    </dl>
  );
}
export function Trend({
  title,
  points,
}: {
  title: string;
  points: { date: string; value: number | null }[];
}) {
  const known = points.filter((p) => p.value !== null),
    max = Math.max(1, ...known.map((p) => p.value!)),
    width = 600,
    height = 100;
  return (
    <div className="trend">
      <h3>{ui(title)}</h3>
      {known.length ? (
        <svg
          viewBox={`0 0 ${width} ${height + 25}`}
          role="img"
          aria-label={`${ui(title)}: ${t("динамика по дням")}`}
        >
          <line
            x1="5"
            y1={height}
            x2={width - 5}
            y2={height}
            stroke="#bacbd7"
          />
          {points.map((p, i) =>
            p.value !== null ? (
              <circle
                key={p.date}
                cx={10 + (i * (width - 20)) / Math.max(1, points.length - 1)}
                cy={height - (p.value / max) * (height - 10)}
                r="4"
                fill="#14617e"
              >
                <title>
                  {(/^\d{4}-\d{2}$/.test(p.date)?p.date:date(p.date))}: {format(p.value, 2)}
                </title>
              </circle>
            ) : null,
          )}
          <text x="5" y={height + 20} fontSize="12">
            {(/^\d{4}-\d{2}$/.test(points[0]?.date??'')?points[0]?.date:date(points[0]?.date))}
          </text>
          <text x={width - 5} y={height + 20} textAnchor="end" fontSize="12">
            {(/^\d{4}-\d{2}$/.test(points.at(-1)?.date??'')?points.at(-1)?.date:date(points.at(-1)?.date))}
          </text>
        </svg>
      ) : (
        <p className="muted">{t("Нет данных за период.")}</p>
      )}
    </div>
  );
}
