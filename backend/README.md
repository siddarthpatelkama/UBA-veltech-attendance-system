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
     - `FIREBASE_CLIENT_EMAIL`: From the downloaded JSON (client_email field)
     - `FIREBASE_PRIVATE_KEY`: From the downloaded JSON (private_key field)
     - **Important**: Replace newlines in private key with `\n`
     - `SECRET_KEY`: Must match the secret key used in frontend token generation

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

For Railway deployment:
1. Set environment variables in Railway dashboard
2. Deploy the backend folder
3. Update frontend `NEXT_PUBLIC_API_URL` to point to Railway URL

