// Input validation utilities
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function sanitizeInput(input: string): string {
  return input.trim().replace(/[<>]/g, '');
}

export function validateToken(token: string): boolean {
  // JWT tokens should have 3 parts separated by dots
  return typeof token === 'string' && token.split('.').length === 3;
}

export function getErrorMessage(code: string): string {
  const errorMap: Record<string, string> = {
    'auth/network-request-failed': 'Network error. Check your internet connection and disable AdBlock.',
    'auth/popup-blocked': 'Popup blocked. Allow popups for this site in browser settings.',
    'auth/cancelled-popup-request': 'Login cancelled. Please try again.',
    'auth/operation-not-supported-in-this-environment': 'Popups not supported. Try enabling cookies.',
    'auth/invalid-api-key': 'Configuration error. Contact support.',
    'auth/invalid-credential': 'Invalid credentials. Try again.',
    'auth/email-already-in-use': 'Email already registered.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/user-not-found': 'User not found.',
  };
  
  return errorMap[code] || `Error: ${code}`;
}
