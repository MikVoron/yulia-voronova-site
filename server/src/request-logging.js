function safeRequestPath(req) {
  try { return new URL(req.url, 'http://localhost').pathname; }
  catch { return String(req.url || '').split('?')[0]; }
}

function requestSerializer(request) {
  return {
    requestId: request.id,
    method: request.method,
    url: safeRequestPath(request),
    host: request.host,
    remoteAddress: request.ip,
    remotePort: request.socket?.remotePort
  };
}

module.exports = { safeRequestPath, requestSerializer };
