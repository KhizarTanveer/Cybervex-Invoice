import { useMemo, useState } from 'react';
import { Download, LoaderCircle, TrendingDown, TrendingUp } from 'lucide-react';
import { formatMoney } from '../lib/money';
import { lastMonths, niceMax, receivedByMonth, revenueReport } from '../lib/revenue';

const MONTHS = 12;
const monthName = (key, style = 'short') =>
  new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1).toLocaleString('en-US', { month: style });
const year = (key) => key.slice(0, 4);

/** Short axis labels ("$2.5K"). */
function compactMoney(v, currency) {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(v);
  } catch {
    return String(v);
  }
}

/** Money received in each of the last 12 months, advances included; the current month starts from zero. */
export default function RevenueChart({ invoices, today, defaultCurrency, settings, onError }) {
  const byCurrency = useMemo(() => receivedByMonth(invoices, today), [invoices, today]);
  const months = useMemo(() => lastMonths(today, MONTHS), [today]);

  // Currencies are never added together: one chart per currency, largest first.
  const currencies = useMemo(() => {
    const sum = (m) => months.reduce((s, k) => s + (m.get(k)?.amount ?? 0), 0);
    return [...byCurrency.entries()]
      .map(([c, m]) => [c, sum(m)])
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([c]) => c);
  }, [byCurrency, months]);

  const [picked, setPicked] = useState(null);
  const currency = currencies.includes(picked) ? picked : currencies[0] ?? defaultCurrency ?? 'USD';
  const data = months.map((key) => ({ key, ...(byCurrency.get(currency)?.get(key) ?? { amount: 0, advance: 0, count: 0 }) }));
  const hasAdvance = data.some((d) => d.advance > 0);

  const [hover, setHover] = useState(null);
  const [busy, setBusy] = useState(false);

  const downloadReport = async () => {
    setBusy(true);
    try {
      const { renderRevenueReportPdf } = await import('./RevenueReportPdf');
      const report = revenueReport(invoices, today, currency, months);
      const brand = {
        name: settings?.business?.brandName || 'Cybervex Digital',
        logoVariant: settings?.logoVariant === 'silver' ? 'silver' : 'black',
      };
      const blob = await renderRevenueReportPdf(report, brand);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Revenue report ${months[0]} to ${months.at(-1)} ${currency}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
      console.error(e);
      onError?.('Could not create the report. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  const current = data.at(-1);
  const previous = data.at(-2);
  const max = niceMax(Math.max(...data.map((d) => d.amount)));
  const ticks = [max, max / 2, 0];
  const yearTotal = data.reduce((s, d) => s + d.amount, 0);
  const money = (v) => formatMoney(v, currency);

  let delta = null;
  if (previous.amount > 0) delta = Math.round(((current.amount - previous.amount) / previous.amount) * 100);

  return (
    <section className="revenue" aria-labelledby="revenue-title">
      <div className="revenue-head">
        <div>
          <h2 id="revenue-title" className="revenue-title">Monthly revenue</h2>
          <p className="revenue-sub">Payments received, advances included, counted in the month they came in</p>
        </div>
        <div className="revenue-tools">
          {currencies.length > 1 && (
            <div className="chips" role="group" aria-label="Currency">
              {currencies.map((c) => (
                <button key={c} type="button" className="chip" aria-pressed={c === currency} onClick={() => setPicked(c)}>{c}</button>
              ))}
            </div>
          )}
          <button type="button" className="btn btn-sm report-btn" onClick={downloadReport} disabled={busy}>
            {busy ? <LoaderCircle className="spin" aria-hidden /> : <Download aria-hidden />}
            {busy ? 'Preparing…' : 'Download report'}
          </button>
        </div>
      </div>

      <div className="revenue-figures">
        <div>
          <p className="revenue-label">{monthName(current.key, 'long')} {year(current.key)} · so far</p>
          <p className="revenue-hero">{money(current.amount)}</p>
          <p className="revenue-meta">
            {delta !== null ? (
              <span className={`revenue-delta ${delta < 0 ? 'down' : 'up'}`}>
                {delta < 0 ? <TrendingDown aria-hidden /> : <TrendingUp aria-hidden />}
                {delta > 0 ? '+' : ''}{delta}% vs {monthName(previous.key)}
              </span>
            ) : (
              <span>Nothing received in {monthName(previous.key)}</span>
            )}
            <span>From {current.count} document{current.count === 1 ? '' : 's'} this month</span>
            {current.advance > 0 && <span>{money(current.advance)} in advances</span>}
          </p>
        </div>
        <div className="revenue-side">
          <p className="revenue-label">Last {MONTHS} months</p>
          <p className="revenue-side-value">{money(yearTotal)}</p>
        </div>
      </div>

      {hasAdvance && (
        <ul className="revenue-legend" aria-label="Legend">
          <li><i className="sw-final" />Full and balance payments</li>
          <li><i className="sw-advance" />Advance payments</li>
        </ul>
      )}

      <div className="revenue-chart" onPointerLeave={() => setHover(null)}>
        <div className="revenue-axis" aria-hidden>
          {ticks.map((t) => <span key={t}>{compactMoney(t, currency)}</span>)}
        </div>
        <div className="revenue-plot">
          <div className="revenue-grid" aria-hidden><i /><i /><i /></div>
          {data.map((d, i) => {
            const isCurrent = i === data.length - 1;
            const h = (d.amount / max) * 100;
            return (
              <div
                key={d.key}
                className={`revenue-col ${isCurrent ? 'is-current' : ''} ${hover === i ? 'is-hover' : ''}`}
                onPointerEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                tabIndex={0}
                aria-label={`${monthName(d.key, 'long')} ${year(d.key)}: ${money(d.amount)} received${d.advance > 0 ? `, ${money(d.advance)} of it advances` : ''}`}
              >
                <div className="revenue-bar-wrap">
                  <span className="revenue-bar" style={{ height: d.amount > 0 ? `max(${h}%, 3px)` : 0 }}>
                    {d.amount - d.advance > 0 && <span className="seg-final" style={{ flexGrow: d.amount - d.advance }} />}
                    {d.advance > 0 && <span className="seg-advance" style={{ flexGrow: d.advance }} />}
                    {isCurrent && d.amount > 0 && hover === null && <span className="revenue-cap">{money(d.amount)}</span>}
                  </span>
                  {hover === i && (
                    <span className={`revenue-tip ${i > data.length - 3 ? 'left' : ''}`} role="status">
                      <b>{monthName(d.key, 'long')} {year(d.key)}</b>
                      <span>{money(d.amount)}</span>
                      {d.advance > 0 && (
                        <small className="tip-row"><i className="sw-advance" />Advance {money(d.advance)}</small>
                      )}
                      {d.advance > 0 && d.amount - d.advance > 0 && (
                        <small className="tip-row"><i className="sw-final" />Full and balance {money(d.amount - d.advance)}</small>
                      )}
                      <small>From {d.count} document{d.count === 1 ? '' : 's'}</small>
                    </span>
                  )}
                </div>
                <span className="revenue-x">
                  {monthName(d.key)}
                  {(i === 0 || d.key.endsWith('-01')) && <small>{year(d.key)}</small>}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <table className="visually-hidden">
        <caption>Payments received by month ({currency})</caption>
        <thead><tr><th>Month</th><th>Received</th><th>Of which advances</th><th>Documents</th></tr></thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.key}><td>{monthName(d.key, 'long')} {year(d.key)}</td><td>{money(d.amount)}</td><td>{money(d.advance)}</td><td>{d.count}</td></tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

