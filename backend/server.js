const express = require('express');
const cors = require('cors');
const { executeWorkflow, executeSingleNode } = require('./executionEngine');
const { authenticate, restoreAuth, clearAuthCache, isAuthenticated, getCachedInjectContext } = require('./authHandler');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.post('/authenticate', async (req, res) => {
  const { globalConfig } = req.body;
  if (!globalConfig?.auth) return res.status(400).json({ success: false, error: 'No auth config provided' });

  try {
    const result = await authenticate(globalConfig);
    res.json({ success: true, token: result.token });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/restore-auth', (req, res) => {
  const { globalConfig, tokenValue } = req.body;
  if (!globalConfig?.auth || !tokenValue) {
    return res.status(400).json({ success: false, error: 'globalConfig and tokenValue required' });
  }
  try {
    restoreAuth(globalConfig, tokenValue);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/auth-status', (req, res) => {
  const { globalConfig } = req.body;
  res.json({ authenticated: isAuthenticated(globalConfig) });
});

app.post('/clear-auth-cache', (req, res) => {
  clearAuthCache(req.body?.globalConfig);
  res.json({ success: true });
});

app.post('/execute-node', async (req, res) => {
  const { node, globalConfig, mappings, results } = req.body;
  if (!node) return res.status(400).json({ success: false, error: 'node required' });
  try {
    const injectContext = getCachedInjectContext(globalConfig);
    const result = await executeSingleNode(node, globalConfig, mappings || [], results || {}, injectContext);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/execute-workflow', async (req, res) => {
  const workflow = req.body;
  if (!workflow?.nodes || !Array.isArray(workflow.nodes)) {
    return res.status(400).json({ success: false, error: 'Invalid workflow: nodes array required' });
  }

  try {
    const result = await executeWorkflow(workflow);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
