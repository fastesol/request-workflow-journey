import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const DEFAULT_CONFIG = {
  baseUrl: 'https://api.example.com',
  auth: {
    type: 'bearer',
    request: {
      method: 'POST',
      url: '/auth/verify-otp',
      body: { phoneNumber: '+966564950615', code: '9876' },
    },
    tokenPath: 'token',
    injectTo: 'headers.Authorization',
    format: 'Bearer {{token}}',
  },
};

const AUTH_STORAGE_KEY = 'wfb_auth';

function saveTokenToStorage(tokenValue, configKey) {
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ tokenValue, configKey }));
  } catch (_) {}
}

function loadTokenFromStorage() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function clearTokenFromStorage() {
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch (_) {}
}

// Simple key to detect if auth config changed since token was saved
function makeConfigKey(globalConfig) {
  return `${globalConfig?.baseUrl}||${globalConfig?.auth?.request?.url}`;
}

function headersToRows(headers) {
  return Object.entries(headers || {}).map(([key, value]) => ({ key, value }));
}

export default function GlobalConfigPanel({ globalConfig, onChange }) {
  const [authEnabled, setAuthEnabled] = useState(!!globalConfig?.auth);
  const [jsonError, setJsonError] = useState('');
  const [authStatus, setAuthStatus] = useState(null); // null | 'ok' | 'error' | 'restoring'
  const [authError, setAuthError] = useState('');
  const [authenticating, setAuthenticating] = useState(false);
  const restoredRef = useRef(false);
  const [headerRows, setHeaderRows] = useState(() => headersToRows(globalConfig?.headers));
  const prevHeadersRef = useRef(globalConfig?.headers);

  useEffect(() => {
    if (globalConfig?.headers !== prevHeadersRef.current) {
      prevHeadersRef.current = globalConfig?.headers;
      setHeaderRows(headersToRows(globalConfig?.headers));
    }
  }, [globalConfig?.headers]);

  // On mount: restore token from localStorage into backend cache
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    if (!globalConfig?.auth) return;

    const saved = loadTokenFromStorage();
    if (!saved?.tokenValue) return;

    // If auth config changed since the token was saved, don't restore
    if (saved.configKey && saved.configKey !== makeConfigKey(globalConfig)) {
      clearTokenFromStorage();
      return;
    }

    setAuthStatus('restoring');
    axios.post('/restore-auth', { globalConfig, tokenValue: saved.tokenValue })
      .then(() => setAuthStatus('ok'))
      .catch(() => {
        clearTokenFromStorage();
        setAuthStatus(null);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const config = globalConfig || { baseUrl: '' };

  const update = (field, value) => onChange({ ...config, [field]: value });

  const updateHeaderRows = (rows) => {
    setHeaderRows(rows);
    const headers = {};
    rows.forEach(({ key, value }) => { if (key.trim()) headers[key.trim()] = value; });
    prevHeadersRef.current = Object.keys(headers).length > 0 ? headers : undefined;
    onChange({ ...config, headers: Object.keys(headers).length > 0 ? headers : undefined });
  };

  const updateAuth = (field, value) =>
    onChange({ ...config, auth: { ...config.auth, [field]: value } });

  const updateAuthRequest = (field, value) =>
    onChange({ ...config, auth: { ...config.auth, request: { ...(config.auth?.request || {}), [field]: value } } });

  const handleBodyChange = (raw) => {
    try {
      const parsed = JSON.parse(raw);
      setJsonError('');
      updateAuthRequest('body', parsed);
    } catch (_) {
      setJsonError('Invalid JSON');
    }
  };

  const toggleAuth = () => {
    const next = !authEnabled;
    setAuthEnabled(next);
    setAuthStatus(null);
    setAuthError('');
    if (!next) clearTokenFromStorage();
    onChange({ ...config, auth: next ? DEFAULT_CONFIG.auth : undefined });
  };

  const handleAuthenticate = async () => {
    setAuthenticating(true);
    setAuthError('');
    setAuthStatus(null);
    try {
      const res = await axios.post('/authenticate', { globalConfig: config });
      saveTokenToStorage(res.data.token, makeConfigKey(config));
      setAuthStatus('ok');
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      setAuthError(msg);
      setAuthStatus('error');
    } finally {
      setAuthenticating(false);
    }
  };

  const handleLogout = async () => {
    try {
      await axios.post('/clear-auth-cache', { globalConfig: config });
    } catch (_) {}
    clearTokenFromStorage();
    setAuthStatus(null);
    setAuthError('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <span style={{ fontSize: '0.75rem', color: '#7c3aed', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
        Global Config
      </span>

      <div>
        <label className="form-label-sm">Base URL</label>
        <input
          className="dark-input"
          value={config.baseUrl || ''}
          onChange={(e) => update('baseUrl', e.target.value)}
          placeholder="https://api.example.com"
        />
      </div>

      <hr className="section-divider" />

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <label className="form-label-sm" style={{ margin: 0 }}>Global Headers</label>
          <button
            className="btn-sm-dark"
            style={{ fontSize: '0.7rem', padding: '2px 8px' }}
            onClick={() => updateHeaderRows([...headerRows, { key: '', value: '' }])}
          >
            + Add
          </button>
        </div>
        {headerRows.length === 0 ? (
          <div style={{ color: '#475569', fontSize: '0.75rem', fontStyle: 'italic' }}>
            No global headers. Applied to every request.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {headerRows.map((row, i) => (
              <div key={i} style={{ display: 'flex', gap: 5 }}>
                <input
                  className="dark-input"
                  value={row.key}
                  onChange={(e) => {
                    const next = [...headerRows];
                    next[i] = { ...next[i], key: e.target.value };
                    updateHeaderRows(next);
                  }}
                  placeholder="Name"
                  style={{ flex: '0 0 38%' }}
                />
                <input
                  className="dark-input"
                  value={row.value}
                  onChange={(e) => {
                    const next = [...headerRows];
                    next[i] = { ...next[i], value: e.target.value };
                    updateHeaderRows(next);
                  }}
                  placeholder="Value"
                  style={{ flex: 1 }}
                />
                <button
                  className="btn-danger-sm"
                  onClick={() => updateHeaderRows(headerRows.filter((_, j) => j !== i))}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <hr className="section-divider" />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>Enable Auth</span>
        <div
          onClick={toggleAuth}
          style={{
            width: 40, height: 22, background: authEnabled ? '#7c3aed' : '#3d4166',
            borderRadius: 11, cursor: 'pointer', position: 'relative', transition: 'background 0.15s',
          }}
        >
          <div style={{
            width: 18, height: 18, background: 'white', borderRadius: '50%',
            position: 'absolute', top: 2, left: authEnabled ? 20 : 2, transition: 'left 0.15s',
          }} />
        </div>
      </div>

      {authEnabled && config.auth && (
        <>
          <div className="config-section">
            <div className="config-section-title">Auth Request</div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <div style={{ width: 80 }}>
                <label className="form-label-sm">Method</label>
                <select
                  className="dark-select"
                  value={config.auth.request?.method || 'POST'}
                  onChange={(e) => updateAuthRequest('method', e.target.value)}
                >
                  {['GET', 'POST', 'PUT'].map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label className="form-label-sm">URL</label>
                <input
                  className="dark-input"
                  value={config.auth.request?.url || ''}
                  onChange={(e) => updateAuthRequest('url', e.target.value)}
                  placeholder="/login"
                />
              </div>
            </div>

            <div style={{ marginBottom: 8 }}>
              <label className="form-label-sm">Body (JSON)</label>
              <textarea
                className="dark-textarea"
                defaultValue={JSON.stringify(config.auth.request?.body || {}, null, 2)}
                onBlur={(e) => handleBodyChange(e.target.value)}
              />
              {jsonError && <div style={{ color: '#f87171', fontSize: '0.72rem', marginTop: 2 }}>{jsonError}</div>}
            </div>

            <div style={{ marginBottom: 8 }}>
              <label className="form-label-sm">Token Path</label>
              <input
                className="dark-input"
                value={config.auth.tokenPath || ''}
                onChange={(e) => updateAuth('tokenPath', e.target.value)}
                placeholder="data.token"
              />
            </div>

            <div style={{ marginBottom: 8 }}>
              <label className="form-label-sm">Inject To</label>
              <input
                className="dark-input"
                value={config.auth.injectTo || ''}
                onChange={(e) => updateAuth('injectTo', e.target.value)}
                placeholder="headers.Authorization"
              />
            </div>

            <div>
              <label className="form-label-sm">Format</label>
              <input
                className="dark-input"
                value={config.auth.format || ''}
                onChange={(e) => updateAuth('format', e.target.value)}
                placeholder="Bearer {{token}}"
              />
            </div>
          </div>

          {/* Auth status + actions */}
          {authStatus === 'ok' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{
                background: '#14532d', border: '1px solid #166534', borderRadius: 6,
                padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span style={{ fontSize: '0.78rem', color: '#4ade80' }}>✓ Authenticated</span>
                <button
                  className="btn-danger-sm"
                  onClick={handleLogout}
                  style={{ fontSize: '0.72rem' }}
                >
                  Logout
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                className="btn-run"
                style={{ width: '100%', padding: '8px 12px' }}
                onClick={handleAuthenticate}
                disabled={authenticating || authStatus === 'restoring'}
              >
                {authenticating
                  ? <span><span className="spinner-border spinner-border-sm me-2" role="status" />Authenticating...</span>
                  : authStatus === 'restoring'
                  ? <span><span className="spinner-border spinner-border-sm me-2" role="status" />Restoring session...</span>
                  : '🔑 Authenticate'}
              </button>

              {authStatus === 'error' && (
                <div style={{
                  background: '#450a0a', border: '1px solid #7f1d1d', borderRadius: 6,
                  padding: '8px 12px', fontSize: '0.78rem', color: '#fca5a5',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'Consolas, monospace',
                }}>
                  {authError}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
