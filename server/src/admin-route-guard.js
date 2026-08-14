'use strict';

function isAdminRoute(url) {
  if (typeof url !== 'string') return false;
  return url === '/admin' || url.startsWith('/admin/');
}

function routePreHandlers(routeOptions) {
  const handlers = routeOptions && routeOptions.preHandler;
  if (!handlers) return [];
  return Array.isArray(handlers) ? handlers : [handlers];
}

function createAdminRouteGuard(requireAdmin) {
  if (typeof requireAdmin !== 'function') {
    throw new TypeError('createAdminRouteGuard requires the requireAdmin function');
  }

  return function enforceAdminRouteProtection(routeOptions) {
    const urls = Array.isArray(routeOptions.url) ? routeOptions.url : [routeOptions.url];
    const adminUrls = urls.filter(isAdminRoute);
    if (!adminUrls.length) return;

    if (!routePreHandlers(routeOptions).includes(requireAdmin)) {
      const methods = Array.isArray(routeOptions.method)
        ? routeOptions.method.join(',')
        : String(routeOptions.method || 'UNKNOWN');
      throw new Error(
        `Security invariant failed: ${methods} ${adminUrls.join(',')} must use requireAdmin`
      );
    }
  };
}

module.exports = { createAdminRouteGuard, isAdminRoute };
