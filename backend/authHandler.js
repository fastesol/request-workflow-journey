const axios = require('axios');
const _ = require('lodash');
const crypto = require('crypto');

// In-memory token cache: configHash -> { token, tokenValue, injectContext }
const tokenCache = new Map();

function configHash(globalConfig) {
  const { baseUrl, auth } = globalConfig;
  const key = JSON.stringify({ baseUrl, url: auth.request?.url, body: auth.request?.body });
  return crypto.createHash('md5').update(key).digest('hex');
}

async function authenticate(globalConfig) {
  if (!globalConfig?.auth) throw new Error('No auth config provided');

  const { auth, baseUrl } = globalConfig;
  const { request, tokenPath, injectTo, format } = auth;
  const url = (baseUrl || '') + (request.url || '');

  let response;
  console.log('url', url);
  try {
    response = await axios({
      method: request.method || 'POST',
      url,
      data: request.body || {},
      headers: request.headers || {},
    });
    console.log('response', response.data);
  } catch (err) {
    const status = err.response?.status;
    const body = err.response?.data;
    const detail = body ? JSON.stringify(body) : err.message;
    throw new Error(`${status ? `HTTP ${status}: ` : ''}${detail}`);
  }

  const token = _.get(response.data, tokenPath);
  if (!token) throw new Error(`Token not found at path: ${tokenPath}`);

  const tokenValue = format ? format.replace('{{token}}', token) : token;
  const injectContext = {};
  _.set(injectContext, injectTo, tokenValue);

  tokenCache.set(configHash(globalConfig), { token, tokenValue, injectContext });
  return { token, tokenValue };
}

// Restores a previously issued token into cache without re-hitting the login endpoint.
// Called on frontend page reload when token exists in localStorage.
function restoreAuth(globalConfig, tokenValue) {
  if (!globalConfig?.auth) throw new Error('No auth config provided');
  const { auth } = globalConfig;

  const injectContext = {};
  _.set(injectContext, auth.injectTo, tokenValue);

  tokenCache.set(configHash(globalConfig), { token: tokenValue, tokenValue, injectContext });
}

function getCachedInjectContext(globalConfig) {
  if (!globalConfig?.auth) return {};
  const cached = tokenCache.get(configHash(globalConfig));
  return cached?.injectContext || {};
}

function clearAuthCache(globalConfig) {
  if (!globalConfig?.auth) return;
  tokenCache.delete(configHash(globalConfig));
}

function isAuthenticated(globalConfig) {
  if (!globalConfig?.auth) return true;
  return tokenCache.has(configHash(globalConfig));
}

module.exports = { authenticate, restoreAuth, getCachedInjectContext, clearAuthCache, isAuthenticated };
