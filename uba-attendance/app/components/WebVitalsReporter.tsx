'use client';

import { useReportWebVitals } from 'next/web-vitals';
import { recordClientTelemetry } from '@/lib/telemetry';

export function WebVitalsReporter() {
    useReportWebVitals((metric) => {
        // We only want to track major visual rendering times and server TTFB to save database space
        if (['FCP', 'LCP', 'TTFB'].includes(metric.name)) {
            recordClientTelemetry(`WebVital: ${metric.name}`, metric.value, 'ok', {
                id: metric.id,
                rating: metric.rating, // 'good', 'needs-improvement', 'poor'
            });
        }
    });

    return null; // This is a silent observer component, it renders nothing.
}