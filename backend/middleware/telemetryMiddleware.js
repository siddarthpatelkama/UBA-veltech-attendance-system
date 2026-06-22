const { recordTelemetry } = require('../utils/telemetry');

const telemetryMiddleware = (req, res, next) => {
    // Ignore CORS preflight requests to save database space
    if (req.method === 'OPTIONS') {
        return next();
    }

    const startTime = Date.now();

    // Listen for the exact moment the server finishes sending the response
    res.on('finish', () => {
        const durationMs = Date.now() - startTime;

        // Safely extract identity from your existing auth middleware
        const vtuNumber = req.user?.vtuNumber || req.user?.email || 'unauthenticated';
        
        // Safely extract device ID from headers or body
        const deviceId = req.headers['x-device-id'] || req.body?.deviceId || 'unknown';

        // Format clean trace name (e.g., "POST /mark-attendance")
        const routePath = req.route ? req.route.path : req.path;
        const traceName = `${req.method} ${req.baseUrl || ''}${routePath}`;

        // Map HTTP status codes to standard error states
        const status = res.statusCode >= 400 ? 'error' : 'ok';

        const metadata = {
            statusCode: res.statusCode,
            userAgent: req.headers['user-agent'] || 'unknown',
            contentLength: res.get('Content-Length') || 0
        };

        recordTelemetry(traceName, durationMs, vtuNumber, deviceId, status, metadata);
    });

    next();
};

module.exports = telemetryMiddleware;