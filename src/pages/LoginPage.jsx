import { useState } from 'react';
import { LogIn } from 'lucide-react';
import { Field } from '../components/ui';
import { signIn } from '../lib/sync';

const BASE = import.meta.env.BASE_URL;

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signIn(email, password);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <img src={`${BASE}brand/cybervex-logo-black.png`} alt="Cybervex Digital" />
        <div>
          <h1>Sign in</h1>
          <p className="muted">Your invoices are saved to your account and available on every device.</p>
        </div>
        {error && <div className="callout danger" role="alert">{error}</div>}
        <Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <button type="submit" className="btn btn-primary" disabled={busy || !email || !password}>
          <LogIn aria-hidden /> {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
