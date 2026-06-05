# Backend Server

Express server for UBA Attendance System.

## Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Firebase Admin**
   - Go to Firebase Console → Project Settings → Service Accounts
   - Click "Generate new private key"
   - Download the JSON file

3. **Setup .env File**
   - Copy `.env.example` to `.env`
   - Fill in the values:
     - `FIREBASE_SERVICE_ACCOUNT`: Full Firebase service account JSON as a single-line string
     - `SECRET_KEY`: Must match the secret key used in frontend token generation
     - `QR_SECRET`: Optional override for the QR signing secret if you do not want to use `SECRET_KEY`
     - `UBA_HEAD_EMAIL`: Comma-separated list of head/admin emails allowed into admin routes
     - `FRONTEND_URL`: Frontend origin used for redirects and CORS-related checks
     - `SENTRY_DSN`: Backend Sentry DSN for server error reporting
     - `PORT`: Optional server port override, usually set by the host platform

## Running the Server

```bash
npm start
```

Server will run on `http://localhost:5000`

## API Endpoints

### POST /mark-attendance

Marks student attendance with QR validation.

**Request Body:**
```json
{
  "token": "sha256_hash",
  "meetingId": "MEET-123",
  "coordinatorId": "COORD-456",
  "timeSlot": 123456,
  "vtuNumber": "ABC123",
  "studentName": "John Doe"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Attendance marked successfully",
  "attendanceId": "doc_id",
  "data": { ... }
}
```

## Security Features

- ✅ SHA256 token validation
- ✅ TimeSlot validation (±1 slot, 30-second window)
- ✅ Duplicate prevention (same VTU + meeting)
- ✅ Rate limiting (5 requests per 10 seconds)
- ✅ Server-side validation only

## Deployment

For  vercel deployment:
1. Set environment variables in vercel  dashboard
2. Deploy the backend folder
3. Update frontend `NEXT_PUBLIC_API_URL` to point to  vercel URL

