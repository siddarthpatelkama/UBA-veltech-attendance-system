import { NextResponse } from 'next/server';
import crypto from 'crypto';

// Secret key - must match backend .env SECRET_KEY
// This is server-side only, never expose to client
const QR_SECRET = process.env.SECRET_KEY || 'uba_super_secret_key';

/**
 * Generate SHA256 hash for QR token validation
 */
function generateTokenHash(meetingId: string, coordinatorId: string, timeSlot: number): string {
  const payload = `${meetingId}:${coordinatorId}:${timeSlot}`;
  return crypto
    .createHash('sha256')
    .update(payload + QR_SECRET)
    .digest('hex');
}

export async function POST(request: Request) {
  try {
    const { meetingId, coordinatorId, timeSlot } = await request.json();

    if (!meetingId || !coordinatorId || timeSlot === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: meetingId, coordinatorId, timeSlot' },
        { status: 400 }
      );
    }

    const token = generateTokenHash(meetingId, coordinatorId, timeSlot);

    return NextResponse.json({ token });
  } catch (error) {
    console.error('Error generating token:', error);
    return NextResponse.json(
      { error: 'Failed to generate token' },
      { status: 500 }
    );
  }
}

