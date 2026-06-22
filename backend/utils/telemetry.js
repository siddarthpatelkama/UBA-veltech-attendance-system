const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// The lightweight RAM bucket
let telemetryBucket = [];

const recordTelemetry = (traceName, durationMs, vtuNumber = null, deviceId = null, status = 'ok', metadata = {}) => {
    telemetryBucket.push({
        service: 'backend-render',
        trace_name: traceName,
        duration_ms: durationMs,
        vtu_number: String(vtuNumber).substring(0, 50), // Ensure text constraint
        device_id: String(deviceId).substring(0, 100),
        status: status,
        metadata: metadata
    });
};

// 5-Second Asynchronous Flush Engine
setInterval(async () => {
    if (telemetryBucket.length === 0 || !SUPABASE_URL || !SUPABASE_KEY) return;

    // Clone and clear the bucket instantly so the server thread isn't blocked
    const payload = [...telemetryBucket];
    telemetryBucket = []; 

    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/uba_telemetry`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal' // Saves bandwidth, expects no data back
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            console.error(`[Telemetry Error] Batch flush failed: ${response.status} ${response.statusText}`);
            // Push failed logs back into the new bucket to retry next cycle
            telemetryBucket = [...payload, ...telemetryBucket]; 
        }
    } catch (error) {
        console.error(`[Telemetry Error] Network failure during flush: ${error.message}`);
        telemetryBucket = [...payload, ...telemetryBucket];
    }
}, 5000);

module.exports = { recordTelemetry };