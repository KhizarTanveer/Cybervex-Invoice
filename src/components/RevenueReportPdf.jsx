import { Document, Image, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer';
import './InvoicePdf'; // registers the Inter font family
import { formatDate } from '../lib/dates';
import { formatMoney } from '../lib/money';

// Revenue report: monthly totals, a chart, clients and every payment, on A4.
const MM = 2.835;
const BASE = import.meta.env.BASE_URL;
const asset = (p) => new URL(`${BASE}${p}`, window.location.origin).href;

const INK = '#0a0a0a';
const BODY = '#2b2b2b';
const MUTED = '#7a7a7a';
const FAINT = '#a3a3a3';
const LINE = '#e4e4e4';
const FINAL = '#2b2b2a';
const ADVANCE = '#b4b4ae';
const CHART_H = 42 * MM;

const monthName = (key, style = 'short') =>
  new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1).toLocaleString('en-US', { month: style });
const monthLabel = (key) => `${monthName(key, 'long')} ${key.slice(0, 4)}`;

const s = StyleSheet.create({
  page: { fontFamily: 'Inter', fontSize: 8.25, lineHeight: 1.4, color: BODY, paddingTop: 14 * MM, paddingBottom: 18 * MM, paddingHorizontal: 16 * MM },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 6 * MM, borderBottomWidth: 1, borderBottomColor: INK },
  logo: { height: 10 * MM, objectFit: 'contain' },
  titleBox: { alignItems: 'flex-end' },
  title: { fontSize: 18, fontWeight: 600, color: INK, lineHeight: 1.1 },
  period: { marginTop: 1.5 * MM, fontSize: 9, color: BODY },
  meta: { marginTop: 1 * MM, fontSize: 7.5, color: MUTED },

  stats: { flexDirection: 'row', marginTop: 6 * MM, borderWidth: 1, borderColor: LINE, borderRadius: 6 },
  stat: { flex: 1, paddingVertical: 3.5 * MM, paddingHorizontal: 4 * MM },
  statBorder: { borderLeftWidth: 1, borderLeftColor: LINE },
  statLabel: { fontSize: 7.25, color: MUTED },
  statValue: { marginTop: 1 * MM, fontSize: 13, fontWeight: 600, color: INK },

  h2: { marginTop: 8 * MM, marginBottom: 3 * MM, fontSize: 10.5, fontWeight: 600, color: INK },
  note: { marginTop: -2 * MM, marginBottom: 3 * MM, fontSize: 7.5, color: MUTED },

  chart: { flexDirection: 'row', alignItems: 'flex-end', height: CHART_H, borderBottomWidth: 1, borderBottomColor: '#cfcfcf' },
  col: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: CHART_H },
  capText: { fontSize: 6, color: BODY, marginBottom: 1 * MM },
  bar: { width: 5 * MM, borderTopLeftRadius: 1.5, borderTopRightRadius: 1.5, overflow: 'hidden' },
  xRow: { flexDirection: 'row', marginTop: 1.5 * MM },
  x: { flex: 1, textAlign: 'center', fontSize: 6.75, color: MUTED },
  legend: { flexDirection: 'row', marginTop: 3 * MM },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginRight: 6 * MM, fontSize: 7, color: MUTED },
  swatch: { width: 2.2 * MM, height: 2.2 * MM, borderRadius: 1, marginRight: 1.5 * MM },

  table: { borderTopWidth: 1, borderTopColor: INK },
  tr: { flexDirection: 'row', paddingVertical: 2 * MM, borderBottomWidth: 0.75, borderBottomColor: LINE },
  th: { fontSize: 7, fontWeight: 500, color: MUTED },
  td: { fontSize: 8, color: BODY },
  strong: { fontWeight: 500, color: INK },
  sub: { fontSize: 7, color: MUTED },
  num: { textAlign: 'right' },
  totalRow: { flexDirection: 'row', paddingVertical: 2.5 * MM, borderTopWidth: 1, borderTopColor: INK },
  monthHead: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 * MM, paddingVertical: 1.5 * MM, paddingHorizontal: 2 * MM, backgroundColor: '#f4f4f3', borderRadius: 3 },
  monthHeadText: { fontSize: 7.75, fontWeight: 600, color: INK },
  empty: { paddingVertical: 4 * MM, fontSize: 8, color: MUTED },

  foot: { position: 'absolute', bottom: 9 * MM, left: 16 * MM, right: 16 * MM, fontSize: 7, color: FAINT },
  // Placed from the top: react-pdf ignores `bottom` on dynamic (render) text.
  pageNo: { position: 'absolute', top: 841.89 - 9 * MM - 9, left: 16 * MM, right: 16 * MM, textAlign: 'right', fontSize: 7, color: FAINT },
});

function Stat({ label, value, first }) {
  return (
    <View style={[s.stat, first ? null : s.statBorder]}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={s.statValue}>{value}</Text>
    </View>
  );
}

function Chart({ monthly, money }) {
  const max = Math.max(...monthly.map((m) => m.amount), 1);
  const hasAdvance = monthly.some((m) => m.advance > 0);
  return (
    <View wrap={false}>
      <View style={s.chart}>
        {monthly.map((m) => {
          const h = (m.amount / max) * (CHART_H - 6 * MM);
          const final = m.amount - m.advance;
          return (
            <View key={m.key} style={s.col}>
              {m.amount > 0 && <Text style={s.capText}>{money(m.amount)}</Text>}
              {m.amount > 0 && (
                <View style={[s.bar, { height: Math.max(h, 1.5) }]}>
                  {final > 0 && <View style={{ flexGrow: final, flexBasis: 0, backgroundColor: FINAL }} />}
                  {final > 0 && m.advance > 0 && <View style={{ height: 1, backgroundColor: '#fff' }} />}
                  {m.advance > 0 && <View style={{ flexGrow: m.advance, flexBasis: 0, backgroundColor: ADVANCE }} />}
                </View>
              )}
            </View>
          );
        })}
      </View>
      <View style={s.xRow}>
        {monthly.map((m, i) => (
          <Text key={m.key} style={s.x}>{monthName(m.key)}{i === 0 || m.key.endsWith('-01') ? ` ${m.key.slice(2, 4)}` : ''}</Text>
        ))}
      </View>
      {hasAdvance && (
        <View style={s.legend}>
          <View style={s.legendItem}><View style={[s.swatch, { backgroundColor: FINAL }]} /><Text>Full and balance payments</Text></View>
          <View style={s.legendItem}><View style={[s.swatch, { backgroundColor: ADVANCE }]} /><Text>Advance payments</Text></View>
        </View>
      )}
    </View>
  );
}

function PaymentRow({ p, money }) {
  return (
    <View style={s.tr} wrap={false}>
      <Text style={[s.td, { flex: 1.1 }]}>{formatDate(p.date)}</Text>
      <Text style={[s.td, s.strong, { flex: 2.2 }]}>{p.company}</Text>
      <View style={{ flex: 1.6 }}>
        <Text style={s.td}>{p.number}</Text>
        <Text style={s.sub}>{p.kind}</Text>
      </View>
      <Text style={[s.td, { flex: 1.3 }]}>{p.type}</Text>
      <Text style={[s.td, { flex: 1.6 }]}>{[p.method, p.reference].filter(Boolean).join(' · ') || '—'}</Text>
      <Text style={[s.td, s.num, s.strong, { flex: 1.3 }]}>{money(p.amount)}</Text>
    </View>
  );
}

export function RevenueReportDocument({ report, brand }) {
  const money = (v) => formatMoney(v, report.currency);
  const { monthly, payments, clients } = report;
  const first = report.months[0];
  const last = report.months.at(-1);
  const current = monthly.at(-1);
  const generated = formatDate(new Date().toISOString().slice(0, 10));
  const byMonth = [...monthly].reverse().filter((m) => m.payments > 0);

  return (
    <Document title={`Revenue report ${monthLabel(first)} – ${monthLabel(last)}`} author={brand.name} creator={brand.name} producer={brand.name}>
      <Page size="A4" style={s.page}>
        <View style={s.head} fixed>
          <Image style={s.logo} src={asset(`brand/cybervex-logo-${brand.logoVariant}.png`)} />
          <View style={s.titleBox}>
            <Text style={s.title}>Revenue report</Text>
            <Text style={s.period}>{monthLabel(first)} – {monthLabel(last)}</Text>
            <Text style={s.meta}>{report.currency} · generated {generated}</Text>
          </View>
        </View>

        <View style={s.stats}>
          <Stat first label={`Received, last ${report.months.length} months`} value={money(report.total)} />
          <Stat label={`${monthLabel(last)} so far`} value={money(current.amount)} />
          <Stat label="Of which advances" value={money(report.advances)} />
          <Stat label="Payments · clients" value={`${payments.length} · ${clients.filter((c) => c.payments > 0).length}`} />
        </View>

        <Text style={s.h2}>Monthly revenue</Text>
        <Text style={s.note}>Every payment counts in the month it was received, advances included</Text>
        <Chart monthly={monthly} money={money} />

        <View style={[s.table, { marginTop: 5 * MM }]} wrap={false}>
          <View style={s.tr}>
            <Text style={[s.th, { flex: 2 }]}>Month</Text>
            <Text style={[s.th, s.num, { flex: 1.4 }]}>Advances</Text>
            <Text style={[s.th, s.num, { flex: 1.4 }]}>Full and balance</Text>
            <Text style={[s.th, s.num, { flex: 1 }]}>Payments</Text>
            <Text style={[s.th, s.num, { flex: 1.5 }]}>Received</Text>
          </View>
          {monthly.map((m) => (
            <View key={m.key} style={s.tr}>
              <Text style={[s.td, { flex: 2 }]}>{monthLabel(m.key)}</Text>
              <Text style={[s.td, s.num, { flex: 1.4 }]}>{m.advance ? money(m.advance) : '—'}</Text>
              <Text style={[s.td, s.num, { flex: 1.4 }]}>{m.amount - m.advance ? money(m.amount - m.advance) : '—'}</Text>
              <Text style={[s.td, s.num, { flex: 1 }]}>{m.payments || '—'}</Text>
              <Text style={[s.td, s.num, s.strong, { flex: 1.5 }]}>{m.amount ? money(m.amount) : '—'}</Text>
            </View>
          ))}
          <View style={[s.totalRow, { borderBottomWidth: 0 }]}>
            <Text style={[s.td, s.strong, { flex: 2 }]}>Total</Text>
            <Text style={[s.td, s.num, { flex: 1.4 }]}>{money(report.advances)}</Text>
            <Text style={[s.td, s.num, { flex: 1.4 }]}>{money(report.total - report.advances)}</Text>
            <Text style={[s.td, s.num, { flex: 1 }]}>{payments.length}</Text>
            <Text style={[s.td, s.num, s.strong, { flex: 1.5 }]}>{money(report.total)}</Text>
          </View>
        </View>

        <Text style={s.h2} break>Clients</Text>
        <Text style={s.note}>Clients who paid in this period or still have an open balance</Text>
        <View style={s.table}>
          <View style={s.tr} fixed>
            <Text style={[s.th, { flex: 2.2 }]}>Client</Text>
            <Text style={[s.th, { flex: 2.4 }]}>Contact</Text>
            <Text style={[s.th, s.num, { flex: 0.9 }]}>Documents</Text>
            <Text style={[s.th, s.num, { flex: 0.9 }]}>Payments</Text>
            <Text style={[s.th, s.num, { flex: 1.4 }]}>Received</Text>
            <Text style={[s.th, s.num, { flex: 1.4 }]}>Outstanding</Text>
          </View>
          {clients.length === 0 && <Text style={s.empty}>No clients in this period</Text>}
          {clients.map((c) => (
            <View key={c.company} style={s.tr} wrap={false}>
              <Text style={[s.td, s.strong, { flex: 2.2 }]}>{c.company}</Text>
              <View style={{ flex: 2.4 }}>
                <Text style={s.td}>{c.contact || '—'}</Text>
                {c.email ? <Text style={s.sub}>{c.email}</Text> : null}
              </View>
              <Text style={[s.td, s.num, { flex: 0.9 }]}>{c.documents}</Text>
              <Text style={[s.td, s.num, { flex: 0.9 }]}>{c.payments}</Text>
              <Text style={[s.td, s.num, s.strong, { flex: 1.4 }]}>{c.received ? money(c.received) : '—'}</Text>
              <Text style={[s.td, s.num, { flex: 1.4 }]}>{c.outstanding ? money(c.outstanding) : '—'}</Text>
            </View>
          ))}
        </View>

        <Text style={s.h2}>Payments</Text>
        <Text style={s.note}>Newest first, grouped by the month received</Text>
        {payments.length === 0 && <Text style={s.empty}>No payments received in this period</Text>}
        {byMonth.map((m) => {
          const rows = payments.filter((p) => p.month === m.key);
          return (
            <View key={m.key}>
              {/* The month heading never ends a page on its own: it travels with the first payment. */}
              <View wrap={false}>
                <View style={s.monthHead}>
                  <Text style={s.monthHeadText}>{monthLabel(m.key)}</Text>
                  <Text style={s.monthHeadText}>{money(m.amount)}</Text>
                </View>
                <View style={s.tr}>
                  <Text style={[s.th, { flex: 1.1 }]}>Date</Text>
                  <Text style={[s.th, { flex: 2.2 }]}>Client</Text>
                  <Text style={[s.th, { flex: 1.6 }]}>Document</Text>
                  <Text style={[s.th, { flex: 1.3 }]}>Type</Text>
                  <Text style={[s.th, { flex: 1.6 }]}>Method · reference</Text>
                  <Text style={[s.th, s.num, { flex: 1.3 }]}>Amount</Text>
                </View>
                <PaymentRow p={rows[0]} money={money} />
              </View>
              {rows.slice(1).map((p, i) => <PaymentRow key={`${p.number}-${p.date}-${i}`} p={p} money={money} />)}
            </View>
          );
        })}

        <Text style={[s.foot, { textAlign: 'left' }]} fixed>{brand.name} · Revenue report · {report.currency}</Text>
        <Text style={s.pageNo} fixed render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
      </Page>
    </Document>
  );
}

export async function renderRevenueReportPdf(report, brand) {
  return pdf(<RevenueReportDocument report={report} brand={brand} />).toBlob();
}
