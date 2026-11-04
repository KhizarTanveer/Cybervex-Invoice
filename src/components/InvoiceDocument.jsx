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

/** The A4 invoice as HTML. Takes a view model from buildView(). */
export default function InvoiceDocument({ view }) {
  return (
    <article className="iv" aria-label={`Invoice ${view.number}`}>
      <header className="iv-head">
        <img
          className="iv-logo"
          src={`${BASE}brand/cybervex-logo-${view.logoVariant}.png`}
          alt={view.brandName}
        />
        <div className="iv-title">
          <h1>Invoice</h1>
          <p className="iv-number">{view.number}</p>
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
            <li key={sv.id}><Text part={sv} /></li>
          ))}
        </ul>
      </section>

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
