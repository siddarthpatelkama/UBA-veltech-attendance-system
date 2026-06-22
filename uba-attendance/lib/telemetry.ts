export const recordClientTelemetry = (traceName: string, durationMs: number, status: string = 'ok', metadata: any = {}) => {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || typeof window === 'undefined') return;

    // Extract local identity if available
    const deviceId = localStorage.getItem('uba_permanent_device_id') || 'unknown';
    
    // Attempt to parse cached user for VTU, fallback if missing
    let vtuNumber = 'unknown';
    try {
        const cachedUser = localStorage.getItem('uba_user_profile');
        if (cachedUser) {
            const parsed = JSON.parse(cachedUser);
            vtuNumber = parsed.vtuNumber || parsed.email || 'unknown';
        }
    } catch(e) {}

    const payload = [{
        service: 'frontend-vercel',
        trace_name: traceName,
        duration_ms: Math.round(durationMs),
        vtu_number: vtuNumber.substring(0, 50),
        device_id: deviceId.substring(0, 100),
        status: status,
        metadata: { ...metadata, path: window.location.pathname }
    }];

    // Fire and forget using keepalive so it sends even if the user navigates away
    fetch(`${SUPABASE_URL}/rest/v1/uba_telemetry`, {
        method: 'POST',
        headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
        },
        body: JSON.stringify(payload),
        keepalive: true 
    }).catch(() => {
        // Silently swallow client-side network errors to prevent console spam for students
    });
};