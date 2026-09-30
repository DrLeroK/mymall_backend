export class Validator {
  /**
   * Validate strong password policy:
   * - Minimum 8 characters
   * - At least one uppercase letter (A-Z)
   * - At least one lowercase letter (a-z)
   * - At least one numeric digit (0-9)
   * - At least one special character (!@#$%^&*...)
   */
  static validatePassword(password: string): { isValid: boolean; message?: string } {
    if (!password || typeof password !== 'string') {
      return { isValid: false, message: 'Password is required.' };
    }

    if (password.length < 8) {
      return { isValid: false, message: 'Password must be at least 8 characters long.' };
    }

    if (!/[A-Z]/.test(password)) {
      return { isValid: false, message: 'Password must contain at least one uppercase letter (A-Z).' };
    }

    if (!/[a-z]/.test(password)) {
      return { isValid: false, message: 'Password must contain at least one lowercase letter (a-z).' };
    }

    if (!/[0-9]/.test(password)) {
      return { isValid: false, message: 'Password must contain at least one numeric digit (0-9).' };
    }

    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(password)) {
      return { isValid: false, message: 'Password must contain at least one special character (e.g. !@#$%^&*).' };
    }

    return { isValid: true };
  }

  /**
   * Validate standard email format
   */
  static validateEmail(email: string): boolean {
    if (!email || typeof email !== 'string') return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  }

  /**
   * Validate international or Ethiopian phone format (+2519..., 09..., +1...)
   */
  static validatePhone(phone: string): boolean {
    if (!phone || typeof phone !== 'string') return false;
    const phoneRegex = /^(\+?[0-9\s\-()]{7,20})$/;
    return phoneRegex.test(phone.trim());
  }

  /**
   * Validate Ethiopian mobile phone format specifically:
   * Accepts:
   * - 09xxxxxxxx or 07xxxxxxxx (10 digits)
   * - +2519xxxxxxxx or +2517xxxxxxxx
   * - 2519xxxxxxxx or 2517xxxxxxxx
   * - 9xxxxxxxx or 7xxxxxxxx (9 digits)
   */
  static validateEthiopianPhone(phone: string): boolean {
    if (!phone || typeof phone !== 'string') return false;
    const cleaned = phone.replace(/[\s\-\(\)]/g, '');
    return (
      /^0[97]\d{8}$/.test(cleaned) ||
      /^\+251[97]\d{8}$/.test(cleaned) ||
      /^251[97]\d{8}$/.test(cleaned) ||
      /^[97]\d{8}$/.test(cleaned)
    );
  }

  /**
   * Normalize an Ethiopian phone number to standard 10-digit format: 09xxxxxxxx or 07xxxxxxxx
   */
  static normalizeEthiopianPhone(phone: string): string | null {
    if (!phone || typeof phone !== 'string') return null;
    const cleaned = phone.replace(/[\s\-\(\)]/g, '');

    if (/^0[97]\d{8}$/.test(cleaned)) {
      return cleaned;
    }
    if (/^\+251[97]\d{8}$/.test(cleaned)) {
      return `0${cleaned.slice(4)}`;
    }
    if (/^251[97]\d{8}$/.test(cleaned)) {
      return `0${cleaned.slice(3)}`;
    }
    if (/^[97]\d{8}$/.test(cleaned)) {
      return `0${cleaned}`;
    }

    return null;
  }

  /**
   * Basic sanitization to prevent XSS / script injection in stored fields
   */
  static sanitizeString(input: string): string {
    if (!input || typeof input !== 'string') return '';
    return input
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .trim();
  }

  /**
   * Validate geographical GPS coordinates:
   * - Latitude: -90.0 to +90.0
   * - Longitude: -180.0 to +180.0
   */
  static validateCoordinates(latitude?: number | null, longitude?: number | null): { isValid: boolean; message?: string } {
    if (latitude === undefined || latitude === null || longitude === undefined || longitude === null) {
      return { isValid: false, message: 'Both latitude and longitude are required.' };
    }

    const lat = Number(latitude);
    const lng = Number(longitude);

    if (isNaN(lat) || isNaN(lng)) {
      return { isValid: false, message: 'Latitude and longitude must be valid numeric decimal numbers.' };
    }

    if (lat < -90 || lat > 90) {
      return { isValid: false, message: `Latitude ${lat} is out of bounds. Must be between -90 and 90 degrees.` };
    }

    if (lng < -180 || lng > 180) {
      return { isValid: false, message: `Longitude ${lng} is out of bounds. Must be between -180 and 180 degrees.` };
    }

    return { isValid: true };
  }
}
