import { useState, useRef, useEffect } from 'react';
import { writeHandle } from '../game/storage.js';

interface Props {
  onLogin: (handle: string) => void;
}

export default function Login({ onLogin }: Props) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      setError('Handle required. Enter 1–20 characters.');
      return;
    }
    if (trimmed.length > 20) {
      setError('Handle too long. Maximum 20 characters.');
      return;
    }
    setError('');
    writeHandle(trimmed);
    onLogin(trimmed);
  }

  return (
    <div className="login-screen">
      <div className="section-header">
        <span className="breadcrumb-cur">IDENTIFICATION</span>
      </div>

      <p className="login-prompt">New connection. Enter your handle to continue.</p>

      <form onSubmit={handleSubmit} noValidate>
        <div className="login-row">
          <label htmlFor="handle-input">HANDLE:</label>
          <input
            id="handle-input"
            ref={inputRef}
            type="text"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            maxLength={20}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <button type="submit">[ ENTER ]</button>
        </div>

        {error && (
          <p className="error-msg" role="alert">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
