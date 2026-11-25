import { Document, Font, Image, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer';

// Vector PDF (selectable text) mirroring InvoiceDocument. Units are points; 1mm ≈ 2.835pt.
const MM = 2.835;
const BASE = import.meta.env.BASE_URL;
const asset = (p) => new URL(`${BASE}${p}`, window.location.origin).href;

Font.register({
  family: 'Inter',
  fonts: [
    { src: asset('fonts/Inter-Regular.ttf'), fontWeight: 400 },
    { src: asset('fonts/Inter-Medium.ttf'), fontWeight: 500 },
    { src: asset('fonts/Inter-SemiBold.ttf'), fontWeight: 600 },
    { src: asset('fonts/Inter-Bold.ttf'), fontWeight: 700 },
  ],
});
// Never hyphenate names, emails or IBANs.
Font.registerHyphenationCallback((word) => [word]);

const INK = '#0a0a0a';
const BODY = '#2b2b2b';
const MUTED = '#7a7a7a';
const LINE = '#e4e4e4';
const PH = '#a3a3a3';

const label = {
  fontSize: 6.75,
  fontWeight: 600,
  letterSpacing: 1.1,
  textTransform: 'uppercase',
  color: MUTED,
  marginBottom: 2.2 * MM,
};

const s = StyleSheet.create({
  page: {
    fontFamily: 'Inter',
    fontSize: 8.75,
    lineHeight: 1.45,
    color: BODY,
    paddingTop: 15 * MM,
    paddingBottom: 20 * MM,
    paddingHorizontal: 18 * MM,
  },
  label,
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingBottom: 7 * MM,
    borderBottomWidth: 1,
    borderBottomColor: INK,
  },
  logo: { height: 11 * MM, marginTop: 1 * MM, objectFit: 'contain' },
  titleBox: { alignItems: 'flex-end' },
  title: { fontSize: 26, lineHeight: 1, fontWeight: 600, letterSpacing: 3.6, color: INK },
  number: { marginTop: 3 * MM, fontSize: 9, fontWeight: 500, letterSpacing: 0.5, color: INK },
  status: {
    marginTop: 2.5 * MM,
    paddingTop: 1 * MM,
    paddingBottom: 0.7 * MM,
    paddingHorizontal: 2.2 * MM,
    borderWidth: 1,
    borderColor: INK,
  },
  statusText: {
    fontSize: 6.5,
    lineHeight: 1,
    fontWeight: 600,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: INK,
  },
  parties: { flexDirection: 'row', paddingTop: 7 * MM, paddingBottom: 6 * MM },
  party: { flex: 1 },
  partyName: { fontSize: 10, fontWeight: 600, color: INK, marginBottom: 1 * MM },
  grid: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: LINE },
  cell: { flex: 1, paddingVertical: 3 * MM, paddingRight: 4 * MM },
  cellNext: { paddingLeft: 4 * MM, borderLeftWidth: 1, borderLeftColor: LINE },
  cellLabel: { ...label, marginBottom: 1 * MM },
  cellValue: { color: INK, fontWeight: 500 },
  svcHead: {
    borderTopWidth: 1,
    borderTopColor: LINE,
    borderBottomWidth: 1,
    borderBottomColor: INK,
    paddingTop: 4 * MM,
    paddingBottom: 2 * MM,
  },
  th: { ...label, marginBottom: 0 },
  svcRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 2.6 * MM,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  bullet: { width: 4, height: 4, borderRadius: 2, backgroundColor: INK, marginTop: 4.6, marginLeft: 1.7, marginRight: 9 },
  svcBody: { flex: 1 },
  svcHead: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  svcName: { color: INK, fontWeight: 500 },
  // Billing tag: outlined for one-time, solid ink for monthly or yearly (matches the on-screen document).
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 4.4 * MM,
    marginLeft: 2.8 * MM,
    paddingLeft: 2 * MM,
    paddingRight: 2.2 * MM - 1.1,
    borderWidth: 0.75,
    borderColor: INK,
    borderRadius: 999,
    backgroundColor: '#fff',
  },
  tagSolid: { backgroundColor: INK },
  tagDotRing: { width: 1.3 * MM, height: 1.3 * MM, borderRadius: 999, backgroundColor: INK, marginRight: 1.3 * MM },
  tagDotSolid: { width: 1.3 * MM, height: 1.3 * MM, borderRadius: 999, backgroundColor: '#fff', marginRight: 1.3 * MM },
  tagText: { fontSize: 5.6, lineHeight: 1, fontWeight: 600, letterSpacing: 1.1, color: INK },
  svcItem: { flexDirection: 'row', marginTop: 1.4 },
  svcDash: { width: 3.6 * MM, color: MUTED },
  svcItemText: { flex: 1, color: BODY, fontSize: 8.05 },
  svcPrice: { marginLeft: 6 * MM, color: INK, fontWeight: 600 },
  per: { fontSize: 7, fontWeight: 400, color: MUTED },
  money: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 5 * MM },
  schedule: { flex: 1, marginRight: 10 * MM },
  split: { flexDirection: 'row', height: 1.6 * MM, marginBottom: 1 * MM },
  splitPart: { flexBasis: 0, backgroundColor: LINE, overflow: 'hidden' },
  splitFill: { height: '100%', backgroundColor: INK },
  stage: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 2.4 * MM,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  step: {
    width: 5.6 * MM,
    height: 5.6 * MM,
    marginRight: 3 * MM,
    borderWidth: 1,
    borderColor: INK,
    borderRadius: 2.8 * MM,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { fontSize: 6.5, lineHeight: 1, fontWeight: 600, color: INK },
  stageMain: { flex: 1 },
  stageTitle: { color: INK, fontWeight: 600 },
  stagePct: { fontWeight: 500, color: MUTED },
  stageWhen: { fontSize: 7.5, color: MUTED },
  stageAmt: { textAlign: 'right', color: INK, fontWeight: 600 },
  stageState: { textAlign: 'right', fontSize: 6.5, fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase', color: MUTED },
  summary: { marginLeft: 'auto', width: 82 * MM },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1.5 * MM },
  sumValue: { color: INK },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: LINE,
    paddingTop: 2 * MM,
    marginTop: 0.5 * MM,
    marginBottom: 1.5 * MM,
  },
  totalText: { fontWeight: 600, color: INK },
  due: {
    marginTop: 1.5 * MM,
    backgroundColor: INK,
    paddingVertical: 3.6 * MM,
    paddingHorizontal: 5 * MM,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dueLabel: { color: '#fff', lineHeight: 1, fontSize: 7, fontWeight: 600, letterSpacing: 1.3, textTransform: 'uppercase' },
  dueValue: { color: '#fff', lineHeight: 1, fontSize: 15, fontWeight: 600 },
  bottom: {
    flexDirection: 'row',
    marginTop: 8 * MM,
    paddingTop: 5 * MM,
    borderTopWidth: 1,
    borderTopColor: LINE,
  },
  bottomCol: { flex: 1 },
  receiptHero: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 6 * MM,
    padding: 6 * MM,
    borderWidth: 1,
    borderColor: INK,
  },
  receiptAmount: { fontSize: 26, lineHeight: 1, fontWeight: 600, color: INK },
  receiptPurpose: { fontSize: 8, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: INK },
  gap: { marginTop: 2 * MM },
  foot: {
    position: 'absolute',
    left: 18 * MM,
    right: 18 * MM,
    bottom: 10 * MM,
    fontSize: 7,
    letterSpacing: 0.85,
    textTransform: 'uppercase',
    color: MUTED,
  },
});

const P = ({ part, style }) => (
  <Text style={[style, part.placeholder ? { color: PH } : null]}>{part.text}</Text>
);

function Party({ title, lines, style }) {
  return (
    <View style={[s.party, style]}>
      <Text style={s.label}>{title}</Text>
      {lines.map((l, i) => <P key={i} part={l} style={l.strong ? s.partyName : null} />)}
    </View>
  );
}

function Grid({ cells }) {
  return (
    <View style={s.grid} wrap={false}>
      {cells.map((m, i) => (
        <View key={m.label} style={[s.cell, i > 0 ? s.cellNext : null]}>
          <Text style={s.cellLabel}>{m.label}</Text>
          <P part={m} style={s.cellValue} />
        </View>
      ))}
    </View>
  );
}

function Schedule({ stages }) {
  return (
    <View style={s.schedule}>
      <Text style={s.label}>Payment schedule</Text>
      <View style={s.split}>
        {stages.map((st, i) => (
          <View
            key={st.key}
            style={[s.splitPart, { flexGrow: st.share, marginLeft: i > 0 ? 1 * MM : 0 }, st.key === 'advance' ? { backgroundColor: '#bdbdbd' } : null]}
          >
            <View style={[s.splitFill, { width: `${st.progress * 100}%` }]} />
          </View>
        ))}
      </View>
      {stages.map((st) => (
        <View key={st.key} style={s.stage}>
          <View style={[s.step, st.state === 'paid' ? { backgroundColor: INK } : null]}>
            <Text style={[s.stepText, st.state === 'paid' ? { color: '#fff' } : null]}>{st.step}</Text>
          </View>
          <View style={s.stageMain}>
            <Text style={s.stageTitle}>{st.title}  <Text style={s.stagePct}>{st.percent}</Text></Text>
            <Text style={s.stageWhen}>{st.when}</Text>
          </View>
          <View>
            <Text style={s.stageAmt}>{st.amount}</Text>
            {st.stateLabel ? <Text style={[s.stageState, st.state === 'paid' ? { color: INK } : null]}>{st.stateLabel}</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

export function InvoicePdfDocument({ view }) {
  const statusBox = view.status === 'paid'
    ? { backgroundColor: INK }
    : view.status === 'draft' || view.status === 'void' ? { borderStyle: 'dashed', borderColor: MUTED } : null;
  const statusColor = view.status === 'paid' ? { color: '#fff' }
    : view.status === 'draft' || view.status === 'void' ? { color: MUTED } : null;
  return (
    <Document title={`${view.title} ${view.number}`} author={view.brandName} creator={view.brandName} producer={view.brandName}>
      <Page size="A4" style={s.page}>
        <View style={s.head}>
          <Image style={s.logo} src={asset(`brand/cybervex-logo-${view.logoVariant}.png`)} />
          <View style={s.titleBox}>
            <Text style={s.title}>{view.title.toUpperCase()}</Text>
            <Text style={s.number}>{view.number}</Text>
            {view.docType ? (
              <View style={[s.status, { backgroundColor: INK }]}>
                <Text style={[s.statusText, { color: '#fff' }]}>{view.docType}</Text>
              </View>
            ) : null}
            {view.showStatus && (
              <View style={[s.status, statusBox]}>
                <Text style={[s.statusText, statusColor]}>{view.statusLabel}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={s.parties}>
          <Party title="Billed from" lines={view.fromLines} style={{ marginRight: 6 * MM }} />
          <Party title="Billed to" lines={view.toLines} style={{ marginLeft: 6 * MM }} />
        </View>

        <Grid cells={view.meta} />
        {view.reference.length > 0 && <Grid cells={view.reference} />}

        <View style={s.svcHead} minPresenceAhead={40}>
          <Text style={s.th}>Services</Text>
        </View>
        {view.services.map((sv) => (
          <View key={sv.id} style={s.svcRow} wrap={false}>
            <View style={s.bullet} />
            <View style={s.svcBody}>
              <View style={s.svcHead}>
                <P part={sv} style={s.svcName} />
                {sv.billing ? (
                  <View style={[s.tag, sv.billing.kind !== 'once' ? s.tagSolid : null]}>
                    <View style={sv.billing.kind !== 'once' ? s.tagDotSolid : s.tagDotRing} />
                    <Text style={[s.tagText, sv.billing.kind !== 'once' ? { color: '#fff' } : null]}>{sv.billing.label.toUpperCase()}</Text>
                  </View>
                ) : null}
              </View>
              {(sv.items ?? []).map((t, k) => (
                <View key={k} style={s.svcItem}>
                  <Text style={s.svcDash}>–</Text>
                  <Text style={s.svcItemText}>{t}</Text>
                </View>
              ))}
            </View>
            {sv.price ? (
              <Text style={s.svcPrice}>
                {sv.price}
                {sv.per ? <Text style={s.per}>{` ${sv.per}`}</Text> : null}
              </Text>
            ) : null}
          </View>
        ))}

        <View style={s.money} wrap={false}>
          {view.schedule && <Schedule stages={view.schedule} />}
          <View style={s.summary}>
            {view.summary.map((r) => (
              <View key={r.label} style={s.sumRow}>
                <Text>{r.label}</Text>
                <Text style={s.sumValue}>{r.value}</Text>
              </View>
            ))}
            <View style={s.totalRow}>
              <Text style={s.totalText}>{view.total.label}</Text>
              <Text style={s.totalText}>{view.total.value}</Text>
            </View>
            {view.after.map((r) => (
              <View key={r.label} style={s.sumRow}>
                <Text>{r.label}</Text>
                <Text style={s.sumValue}>{r.value}</Text>
              </View>
            ))}
            <View style={s.due}>
              <Text style={s.dueLabel}>{view.due.label}</Text>
              <Text style={s.dueValue}>{view.due.value}</Text>
            </View>
          </View>
        </View>

        <View style={s.bottom} wrap={false}>
          <View style={[s.bottomCol, { marginRight: 6 * MM }]}>
            <Text style={s.label}>Payment details</Text>
            {view.paymentDetails.map((l, i) => <P key={i} part={l} />)}
            {view.paymentInstructions ? <Text style={s.gap}>{view.paymentInstructions}</Text> : null}
          </View>
          <View style={[s.bottomCol, { marginLeft: 6 * MM }]}>
            <Text style={s.label}>Notes &amp; terms</Text>
            {view.termsLine ? <Text>{view.termsLine}</Text> : null}
            {view.notes ? <Text style={s.gap}>{view.notes}</Text> : null}
          </View>
        </View>

        <Text style={[s.foot, { textAlign: 'left' }]} fixed>{view.tagline}</Text>
        <Text style={[s.foot, { textAlign: 'right' }]} fixed>{view.website}</Text>
      </Page>
    </Document>
  );
}

export async function renderInvoicePdf(view) {
  return pdf(<InvoicePdfDocument view={view} />).toBlob();
}

export function ReceiptPdfDocument({ receipt }) {
  return (
    <Document title={`Receipt ${receipt.number}`} author={receipt.brandName} creator={receipt.brandName} producer={receipt.brandName}>
      <Page size="A4" style={s.page}>
        <View style={s.head}>
          <Image style={s.logo} src={asset(`brand/cybervex-logo-${receipt.logoVariant}.png`)} />
          <View style={s.titleBox}>
            <Text style={s.title}>RECEIPT</Text>
            <Text style={s.number}>{receipt.number}</Text>
            <View style={[s.status, { backgroundColor: INK }]}>
              <Text style={[s.statusText, { color: '#fff' }]}>Payment received</Text>
            </View>
          </View>
        </View>

        <View style={s.parties}>
          <Party title="Received from" lines={receipt.toLines} style={{ marginRight: 6 * MM }} />
          <Party title="Received by" lines={receipt.fromLines} style={{ marginLeft: 6 * MM }} />
        </View>

        <Grid cells={receipt.meta} />

        <View style={s.receiptHero} wrap={false}>
          <View>
            <Text style={s.label}>Amount received</Text>
            <Text style={s.receiptAmount}>{receipt.amount}</Text>
          </View>
          <Text style={s.receiptPurpose}>{receipt.purpose}</Text>
        </View>

        <View style={[s.summary, { marginTop: 6 * MM }]} wrap={false}>
          {receipt.summary.map((r) => (
            <View key={r.label} style={s.sumRow}>
              <Text>{r.label}</Text>
              <Text style={s.sumValue}>{r.value}</Text>
            </View>
          ))}
          <View style={s.due}>
            <Text style={s.dueLabel}>{receipt.remaining.label}</Text>
            <Text style={s.dueValue}>{receipt.remaining.value}</Text>
          </View>
        </View>

        <View style={s.bottom} wrap={false}>
          <Text>Thank you for your payment. Please keep this receipt for your records.</Text>
        </View>

        <Text style={[s.foot, { textAlign: 'left' }]} fixed>{receipt.tagline}</Text>
        <Text style={[s.foot, { textAlign: 'right' }]} fixed>{receipt.website}</Text>
      </Page>
    </Document>
  );
}

export async function renderReceiptPdf(receipt) {
  return pdf(<ReceiptPdfDocument receipt={receipt} />).toBlob();
}
