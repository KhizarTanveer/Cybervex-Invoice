import { Fragment } from 'react';

const BASE = import.meta.env.BASE_URL;

function Text({ part }) {
  return <span className={part.placeholder ? 'iv-ph' : undefined}>{part.text}</span>;
}

function Party({ title, lines }) {
  return (
    <div className="iv-party">
      <h3 className="iv-label">{title}</h3>
      {lines.map((l, i) => (
        <p key={i} className={l.strong ? 'iv-party-name' : undefined}>
          <Text part={l} />
        </p>
      ))}
    </div>
  );
}

function Schedule({ stages }) {
  return (
    <section className="iv-schedule">
      <h3 className="iv-label">Payment schedule</h3>
      <div className="iv-split" aria-hidden>
        {stages.map((st) => (
          <span key={st.key} className={`iv-split-${st.key}`} style={{ flexGrow: st.share }}>
            <i style={{ width: `${st.progress * 100}%` }} />
          </span>
        ))}
      </div>
      <ol>
        {stages.map((st) => (
          <li key={st.key} className={`iv-stage iv-stage-${st.state}`}>
            <span className="iv-step">{st.step}</span>
            <div className="iv-stage-main">
              <p className="iv-stage-title">{st.title} <span>{st.percent}</span></p>
              <p className="iv-stage-when">{st.when}</p>
            </div>
            <div className="iv-stage-amt">
              <p>{st.amount}</p>
              {st.stateLabel && <p className="iv-stage-state">{st.stateLabel}</p>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** The A4 invoice as HTML. Takes a view model from buildView(). */
export default function InvoiceDocument({ view }) {
  return (
    <article className="iv" aria-label={`${view.title} ${view.number}`}>
      <header className="iv-head">
        <img
          className="iv-logo"
          src={`${BASE}brand/cybervex-logo-${view.logoVariant}.png`}
          alt={view.brandName}
        />
        <div className="iv-title">
          <h1>{view.title}</h1>
          <p className="iv-number">{view.number}</p>
          {view.docType && <p className="iv-status iv-doctype">{view.docType}</p>}
          {view.showStatus && <p className={`iv-status iv-status-${view.status}`}>{view.statusLabel}</p>}
        </div>
      </header>

      <section className="iv-parties">
        <Party title="Billed from" lines={view.fromLines} />
        <Party title="Billed to" lines={view.toLines} />
      </section>

      <dl className="iv-meta">
        {view.meta.map((m) => (
          <div key={m.label}>
            <dt className="iv-label">{m.label}</dt>
            <dd><Text part={m} /></dd>
          </div>
        ))}
      </dl>

      {view.reference.length > 0 && (
        <dl className="iv-project">
          {view.reference.map((m) => (
            <div key={m.label}>
              <dt className="iv-label">{m.label}</dt>
              <dd><Text part={m} /></dd>
            </div>
          ))}
        </dl>
      )}

      <section className="iv-services">
        <h3 className="iv-label">Services</h3>
        <ul>
          {view.services.map((sv) => (
            <li key={sv.id}>
              <Text part={sv} />
              {sv.price && <span className="iv-svc-price">{sv.price}</span>}
            </li>
          ))}
        </ul>
      </section>

      <div className="iv-money">
        {view.schedule && <Schedule stages={view.schedule} />}
        <section className="iv-summary">
          <dl>
            {view.summary.map((r) => (
              <Fragment key={r.label}>
                <dt>{r.label}</dt>
                <dd>{r.value}</dd>
              </Fragment>
            ))}
            <dt className="iv-total">{view.total.label}</dt>
            <dd className="iv-total">{view.total.value}</dd>
            {view.after.map((r) => (
              <Fragment key={r.label}>
                <dt>{r.label}</dt>
                <dd>{r.value}</dd>
              </Fragment>
            ))}
          </dl>
          <div className="iv-due">
            <span>{view.due.label}</span>
            <strong>{view.due.value}</strong>
          </div>
        </section>
      </div>

      <section className="iv-bottom">
        <div>
          <h3 className="iv-label">Payment details</h3>
          {view.paymentDetails.map((l, i) => (
            <p key={i}><Text part={l} /></p>
          ))}
          {view.paymentInstructions && <p className="iv-pre iv-gap">{view.paymentInstructions}</p>}
        </div>
        <div>
          <h3 className="iv-label">Notes &amp; terms</h3>
          {view.termsLine && <p>{view.termsLine}</p>}
          {view.notes && <p className="iv-pre iv-gap">{view.notes}</p>}
        </div>
      </section>

      <footer className="iv-foot">
        <span>{view.tagline}</span>
        <span>{view.website}</span>
      </footer>
    </article>
  );
}
