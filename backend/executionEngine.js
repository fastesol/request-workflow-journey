const axios = require('axios');
const _ = require('lodash');
const vm = require('vm');
const { getCachedInjectContext } = require('./authHandler');
const { resolveMappings, injectAuth, resolveDynamicVars } = require('./variableResolver');

function joinUrl(base, path) {
  if (!base) return path;
  if (!path) return base;
  return base.replace(/\/$/, '') + '/' + path.replace(/^\//, '');
}

function topologicalSort(nodes, edges) {
  const nodeIds = nodes.map((n) => n.id);
  const inDegree = {};
  const adj = {};

  for (const id of nodeIds) {
    inDegree[id] = 0;
    adj[id] = [];
  }

  for (const edge of edges || []) {
    adj[edge.source].push(edge.target);
    inDegree[edge.target] = (inDegree[edge.target] || 0) + 1;
  }

  const queue = nodeIds.filter((id) => inDegree[id] === 0);
  const order = [];

  while (queue.length > 0) {
    const current = queue.shift();
    order.push(current);
    for (const neighbor of adj[current]) {
      inDegree[neighbor]--;
      if (inDegree[neighbor] === 0) queue.push(neighbor);
    }
  }

  if (order.length !== nodeIds.length) throw new Error('Cycle detected in workflow graph');
  return order;
}

async function executeRequest(method, url, headers, body) {
  const upperMethod = (method || 'GET').toUpperCase();
  const config = { method: upperMethod, url, headers: headers || {} };

  if (['POST', 'PUT', 'PATCH'].includes(upperMethod)) {
    config.data = body || {};
  }

  let response;
  try {
    response = await axios(config);
  } catch (err) {
    const status = err.response?.status;
    const data = err.response?.data;
    const detail = data ? JSON.stringify(data) : err.message;
    console.error('[Request Error]', {
      error: detail,
      status: status ?? null,
      request: { method: upperMethod, url, headers: headers || {}, body: body ?? null },
    });
    const error = new Error(`${status ? `HTTP ${status}: ` : ''}${detail}`);
    error.status = status;
    error.responseData = data;
    error.requestInfo = { url, method: upperMethod, headers: headers || {}, body: body || null };
    throw error;
  }

  const requestInfo = {
    url: response.config.url,
    method: upperMethod,
    headers: response.config.headers || {},
    params: response.config.params || {},
    body: response.config.data ? (() => { try { return JSON.parse(response.config.data); } catch (_) { return response.config.data; } })() : null,
  };

  if (upperMethod === 'HEAD') {
    return { status: response.status, responseHeaders: response.headers, data: null, request: requestInfo };
  }

  return { status: response.status, responseHeaders: response.headers, data: response.data, request: requestInfo };
}

function executeTransformNode(node, results) {
  const script = node.transform || 'return null;';
  try {
    const fn = vm.runInNewContext(`(function(results, _) { ${script} })`, {}, { timeout: 5000 });
    const data = fn(results, _);
    return { data };
  } catch (err) {
    throw new Error(`Transform error: ${err.message}`);
  }
}

async function executeNode(node, globalConfig, mappings, results, injectContext) {
  const nodeMappings = mappings.filter((m) => m.to.nodeId === node.id);
  const { iteration } = node;

  let request = resolveMappings(node.request, nodeMappings, results, undefined);
  request = resolveDynamicVars(request);
  request = injectAuth(request, injectContext);

  const baseUrl = globalConfig?.baseUrl || '';
  const globalHeaders = globalConfig?.headers;
  if (globalHeaders && Object.keys(globalHeaders).length > 0) {
    request = { ...request, headers: { ...globalHeaders, ...(request.headers || {}) } };
  }

  const urlStr = String(request.url ?? '');
  const fullUrl = urlStr.startsWith('http') ? urlStr : joinUrl(baseUrl, urlStr);

  if (iteration) {
    return await executeIteration(node, iteration, nodeMappings, results, injectContext, baseUrl, globalHeaders);
  }

  return await executeRequest(request.method, fullUrl, request.headers, request.body);
}

function meetsStopCondition(response, stopCondition) {
  if (!stopCondition?.path) return false;
  const value = _.get(response.data, stopCondition.path);
  switch (stopCondition.check) {
    case 'not-empty': return Array.isArray(value) ? value.length > 0 : value != null && value !== '';
    case 'exists':    return value != null;
    case 'truthy':    return !!value;
    default:          return false;
  }
}

async function executeIteration(node, iteration, nodeMappings, results, injectContext, baseUrl, globalHeaders) {
  const sourceResult = results[iteration.source.nodeId];
  const sourceData = Array.isArray(sourceResult)
    ? sourceResult[sourceResult.length - 1]?.response
    : sourceResult;

  const items = _.get(sourceData, iteration.source.path);
  if (!Array.isArray(items)) throw new Error(`Iteration source at "${iteration.source.path}" is not an array`);

  const iterationResults = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const itemValue = iteration.itemPath ? _.get(item, iteration.itemPath) : item;

    let request = resolveMappings(node.request, nodeMappings, results, itemValue);
    request = resolveDynamicVars(request);
    request = injectAuth(request, injectContext);
    if (globalHeaders && Object.keys(globalHeaders).length > 0) {
      request = { ...request, headers: { ...globalHeaders, ...(request.headers || {}) } };
    }

    // Replace {{item}} in URL with the current iteration value (safe string substitute, not eval)
    const resolvedUrl = String(request.url ?? '').replace(/\{\{item\}\}/g, encodeURIComponent(itemValue));
    const fullUrl = resolvedUrl.startsWith('http') ? resolvedUrl : joinUrl(baseUrl, resolvedUrl);

    try {
      const response = await executeRequest(request.method, fullUrl, request.headers, request.body);
      const shouldStop = meetsStopCondition(response, iteration.stopCondition)
        || (iteration.stopOnSuccess && response.status >= 200 && response.status < 300);
      iterationResults.push({ index: i, item: itemValue, response, stopped: shouldStop });
      if (shouldStop) break;
    } catch (err) {
      iterationResults.push({ index: i, item: itemValue, error: err.message, request: err.requestInfo });
    }
  }

  // When the iteration stopped successfully (the "winning" item was found),
  // expose its value to downstream nodes by injecting it into the last
  // response's data under iteration.storeAs.
  if (iteration.storeAs && iterationResults.length > 0) {
    const last = iterationResults[iterationResults.length - 1];
    if (last.stopped && last.response?.data && typeof last.response.data === 'object' && !Array.isArray(last.response.data)) {
      last.response.data[iteration.storeAs] = last.item;
    }
  }

  return iterationResults;
}

async function executeWorkflow(workflow) {
  const { nodes, edges, globalConfig, mappings } = workflow;

  // Get cached token — throws if auth is configured but authenticate() was never called
  const injectContext = getCachedInjectContext(globalConfig);

  const order = topologicalSort(nodes, edges);
  const nodeMap = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const results = {};

  for (const nodeId of order) {
    const node = nodeMap[nodeId];
    if (!node) continue;

    try {
      if (node.type === 'startNode') {
        results[nodeId] = { data: {} };
      } else if (node.type === 'transformNode') {
        results[nodeId] = executeTransformNode(node, results);
      } else {
        results[nodeId] = await executeNode(node, globalConfig, mappings || [], results, injectContext);
      }
    } catch (err) {
      results[nodeId] = { error: err.message };
    }
  }

  return { success: true, results };
}

async function dispatchSingleNode(node, globalConfig, mappings, results, injectContext) {
  if (node.type === 'startNode') {
    return { data: {} };
  }
  if (node.type === 'transformNode') {
    return executeTransformNode(node, results);
  }
  return executeNode(node, globalConfig, mappings, results, injectContext);
}

module.exports = { executeWorkflow, executeSingleNode: dispatchSingleNode };
