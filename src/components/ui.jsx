import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { STATUS } from '../lib/status';

export function Field({ label, error, hint, className = '', children, ...props }) {
  const id = useId();
  const control = children ?? <input id={id} {...props} aria-invalid={!!error || undefined} />;
  return (
    <label className={`field ${error ? 'invalid' : ''} ${className}`} htmlFor={children ? undefined : id}>
      <span>{label}</span>
      {control}
      {error ? <small className="err">{error}</small> : hint ? <small className="hint">{hint}</small> : null}
    </label>
  );
}

export function TextArea({ label, hint, className = '', ...props }) {
  return (
    <Field label={label} hint={hint} className={className}>
      <textarea {...props} />
    </Field>
  );
}

export function StatusBadge({ status }) {
  return <span className={`badge badge-${status}`}>{STATUS[status]?.label ?? status}</span>;
}

// A message to show on the next page (e.g. after saving navigates to a new route).
let pending = null;
export const flash = (message) => { pending = message; };

export function useToast() {
  const [toast, setToast] = useState(() => (pending ? { message: pending, kind: 'info' } : null));
  const show = useCallback((message, kind = 'info') => setToast({ message, kind }), []);
  useEffect(() => { pending = null; }, []);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), toast.kind === 'error' ? 6000 : 3200);
    return () => clearTimeout(t);
  }, [toast]);
  const node = toast ? (
    <div className={`toast ${toast.kind === 'error' ? 'error' : ''}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
      {toast.message}
    </div>
  ) : null;
  return [node, show];
}

export function Menu({ label, icon, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div className="menu" ref={ref}>
      <button type="button" className="btn" aria-haspopup="menu" aria-expanded={open} aria-label={label} onClick={() => setOpen((o) => !o)}>
        {icon}
        <span className="btn-label">{label}</span>
      </button>
      {open && (
        <div className="menu-pop" role="menu" onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

/** A centred dialog over a dimmed backdrop; Escape or a backdrop click closes it. */
export function Modal({ title, onClose, children }) {
  const titleId = useId();
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId}>{title}</h2>
        {children}
      </div>
    </div>
  );
}

/** Scales an A4 page down to fit its container without affecting layout or print. */
export function ScaledPreview({ children }) {
  const outer = useRef();
  const inner = useRef();
  const [box, setBox] = useState({ scale: 1, height: 0 });
  useLayoutEffect(() => {
    const measure = () => {
      if (!outer.current || !inner.current) return;
      const scale = Math.min(1, outer.current.clientWidth / inner.current.offsetWidth);
      setBox({ scale, height: inner.current.offsetHeight * scale });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(outer.current);
    ro.observe(inner.current);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="scaler" ref={outer} style={{ height: box.height || undefined }}>
      <div className="scaler-inner" ref={inner} style={{ transform: `scale(${box.scale})` }}>
        {children}
      </div>
    </div>
  );
}
