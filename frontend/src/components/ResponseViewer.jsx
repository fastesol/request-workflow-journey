import React, { useState } from 'react';

// ─── JSON tree (collapsible, no drag) ────────────────────────────────────────

function JsonNode({ data, depth = 0 }) {
  const [collapsed, setCollapsed] = useState(depth > 2);

  if (data === null || data === undefined) return <span className="json-null">null</span>;
  if (typeof data === 'boolean') return <span className="json-bool">{String(data)}</span>;
  if (typeof data === 'number') return <span className="json-number">{data}</span>;
  if (typeof data === 'string') return <span className="json-string">"{data}"</span>;

  if (Array.isArray(data)) {
    return (
      <span>
        <span className="json-expand" onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? '▶' : '▼'} [{data.length}]
        </span>
        {!collapsed && (
          <div style={{ marginLeft: 14 }}>
            {data.map((item, i) => (
              <div key={i}><span className="json-key">{i}: </span><JsonNode data={item} depth={depth + 1} /></div>
            ))}
          </div>
        )}
      </span>
    );
  }

  if (typeof data === 'object') {
    const keys = Object.keys(data);
    return (
      <span>
        <span className="json-expand" onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? '▶' : '▼'} {`{${keys.length}}`}
        </span>
        {!collapsed && (
          <div style={{ marginLeft: 14 }}>
            {keys.map((key) => (
              <div key={key} style={{ marginBottom: 1 }}>
                <span className="json-key">{key}</span>
                <span style={{ color: '#475569' }}>: </span>
                <JsonNode data={data[key]} depth={depth + 1} />
              </div>
            ))}
          </div>
        )}
      </span>
    );
  }

  return <span>{String(data)}</span>;
}

function JsonTree({ data }) {
  if (data === null || data === undefined) {
    return <span style={{ color: '#475569', fontSize: '0.75rem', fontStyle: 'italic' }}>empty</span>;
  }
  return <div className="json-tree" style={{ fontSize: '0.78rem' }}><JsonNode data={data} depth={0} /></div>;
}

// ─── Headers table ────────────────────────────────────────────────────────────

function HeadersTable({ headers }) {
  if (!headers || Object.keys(headers).length === 0) {
    return <span style={{ color: '#475569', fontSize: '0.75rem', fontStyle: 'italic' }}>none</span>;
  }
  return (
    <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
      <tbody>
        {Object.entries(headers).map(([k, v]) => (
          <tr key={k}>
            <td style={{ color: '#7dd3fc', paddingRight: 12, paddingBottom: 3, verticalAlign: 'top', whiteSpace: 'nowrap' }}>{k}</td>
            <td style={{ color: '#94a3b8', wordBreak: 'break-all' }}>{String(v)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Single result detail view ────────────────────────────────────────────────

function ResultDetail({ result }) {
  const [tab, setTab] = useState('response');

  const isError = !!result.error;
  const status = result.status;
  const req = result.request;

  const tabs = ['response', 'req-headers', 'res-headers'];
  if (req?.body) tabs.splice(1, 0, 'req-body');

  return (
    <div style={{ marginTop: 8 }}>
      {/* Mini tab bar */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 8, flexWrap: 'wrap' }}>
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '3px 10px', fontSize: '0.7rem', borderRadius: 4, cursor: 'pointer',
              background: tab === t ? '#7c3aed' : '#262a3d',
              border: `1px solid ${tab === t ? '#7c3aed' : '#3d4166'}`,
              color: tab === t ? 'white' : '#94a3b8',
            }}
          >
            {{ response: 'Response', 'req-body': 'Req Body', 'req-headers': 'Req Headers', 'res-headers': 'Res Headers' }[t]}
          </button>
        ))}
      </div>

      <div style={{ background: '#0f1117', border: '1px solid #1e2235', borderRadius: 5, padding: '8px 10px', maxHeight: 300, overflowY: 'auto' }}>
        {tab === 'response' && (
          isError
            ? <pre style={{ color: '#f87171', margin: 0, fontSize: '0.75rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{result.error}</pre>
            : <JsonTree data={result.data} />
        )}
        {tab === 'req-body' && <JsonTree data={req?.body} />}
        {tab === 'req-headers' && <HeadersTable headers={req?.headers} />}
        {tab === 'res-headers' && <HeadersTable headers={result.responseHeaders} />}
      </div>
    </div>
  );
}

// ─── Node result block ────────────────────────────────────────────────────────

function NodeResult({ nodeId, result, nodeLabel }) {
  const [expanded, setExpanded] = useState(false);
  const isArray = Array.isArray(result);
  const isError = !isArray && !!result?.error;
  const status = !isArray ? result?.status : null;
  const req = !isArray
    ? result?.request
    : (result[0]?.response?.request || result[0]?.request || null);

  return (
    <div className="response-block">
      {/* Header row — click to expand */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setExpanded(!expanded)}
      >
        <span style={{ color: '#a78bfa', fontWeight: 600, fontSize: '0.82rem', flex: 1 }}>
          {nodeLabel}
          {isArray && <span style={{ color: '#64748b', fontWeight: 400, marginLeft: 6 }}>({result.length} iterations)</span>}
        </span>

        {status && (
          <span className={`status-badge ${status >= 200 && status < 300 ? 'status-ok' : 'status-err'}`}>{status}</span>
        )}
        {isError && <span className="status-badge status-err">Error</span>}
        <span style={{ color: '#475569', fontSize: '0.72rem' }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {/* URL line */}
      {req?.url && (
        <div style={{ marginTop: 4, fontSize: '0.72rem', color: '#475569', display: 'flex', gap: 6, alignItems: 'center' }}>
          <span className={`method-badge method-${req.method}`} style={{ fontSize: '0.62rem' }}>{req.method}</span>
          <span style={{ fontFamily: 'Consolas, monospace', wordBreak: 'break-all', color: '#64748b' }}>{req.url}</span>
        </div>
      )}

      {expanded && (
        isArray ? (
          <div style={{ marginTop: 8 }}>
            {result.map((iter, i) => (
              <div key={i} style={{ marginBottom: 10, borderLeft: '2px solid #3d4166', paddingLeft: 10 }}>
                <div style={{ color: '#94a3b8', fontSize: '0.72rem', marginBottom: 4, display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span>Iteration {i + 1}</span>
                  <span style={{ color: '#60a5fa' }}>item: {JSON.stringify(iter.item)}</span>
                  {iter.stopped && <span style={{ color: '#4ade80' }}>● stopped here</span>}
                  {iter.response?.status && (
                    <span className={`status-badge ${iter.response.status >= 200 && iter.response.status < 300 ? 'status-ok' : 'status-err'}`}>
                      {iter.response.status}
                    </span>
                  )}
                </div>
                {(iter.response?.request?.url || iter.request?.url) && (
                  <div style={{ fontSize: '0.7rem', color: '#475569', fontFamily: 'Consolas, monospace', marginBottom: 4, wordBreak: 'break-all' }}>
                    {iter.response?.request?.url || iter.request?.url}
                  </div>
                )}
                {iter.response && <ResultDetail result={iter.response} />}
                {iter.error && <pre style={{ color: '#f87171', margin: 0, fontSize: '0.72rem' }}>{iter.error}</pre>}
              </div>
            ))}
          </div>
        ) : (
          <ResultDetail result={result} />
        )
      )}
    </div>
  );
}

// ─── Export helper ────────────────────────────────────────────────────────────

function buildExportPayload(results, nodeMap) {
  const nodes = Object.entries(results).map(([nodeId, result]) => {
    const label = nodeMap[nodeId]?.data?.label || nodeId;

    if (Array.isArray(result)) {
      return {
        nodeId,
        label,
        iterations: result.map((iter) => ({
          index: iter.index,
          item: iter.item,
          request: iter.response?.request || iter.request || null,
          response: iter.response
            ? { status: iter.response.status, headers: iter.response.responseHeaders, body: iter.response.data }
            : null,
          error: iter.error || null,
          stopped: iter.stopped || false,
        })),
      };
    }

    if (result?.skipped) return { nodeId, label, skipped: true };

    return {
      nodeId,
      label,
      request: result?.request || null,
      response: result?.error
        ? null
        : { status: result?.status, headers: result?.responseHeaders, body: result?.data },
      error: result?.error || null,
    };
  });

  return { exportedAt: new Date().toISOString(), nodes };
}

function exportResults(results, nodeMap) {
  const payload = buildExportPayload(results, nodeMap);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `workflow-results-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ResponseViewer({ results, nodes }) {
  if (!results || Object.keys(results).length === 0) {
    return (
      <div className="empty-state" style={{ padding: 20, minHeight: 120 }}>
        <div style={{ fontSize: '1.5rem' }}>📭</div>
        <div>No results yet. Run the workflow.</div>
      </div>
    );
  }

  const nodeMap = Object.fromEntries((nodes || []).map((n) => [n.id, n]));

  return (
    <div>
      <div style={{ padding: '8px 12px 4px', display: 'flex', justifyContent: 'flex-end' }}>
        <button
          className="btn-sm-dark"
          onClick={() => exportResults(results, nodeMap)}
          title="Export all results as JSON"
        >
          ⬇ Export Results
        </button>
      </div>
      {Object.entries(results).map(([nodeId, result]) => (
        <NodeResult
          key={nodeId}
          nodeId={nodeId}
          result={result}
          nodeLabel={nodeMap[nodeId]?.data?.label || nodeId}
        />
      ))}
    </div>
  );
}
