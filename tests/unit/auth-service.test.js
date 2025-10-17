// tests/unit/auth-service.test.js
const { AuthService } = require('../../services/auth/auth-service');

describe('AuthService - Unit Tests', () => {
  let authService;

  beforeEach(() => {
    authService = new AuthService();
  });

  test('should initialize without errors', () => {
    expect(authService).toBeInstanceOf(AuthService);
  });

  test('should validate email format correctly', () => {
    expect(authService.isValidEmail('test@example.com')).toBe(true);
    expect(authService.isValidEmail('user.name@domain.co.uk')).toBe(true);
    expect(authService.isValidEmail('invalid-email')).toBe(false);
    expect(authService.isValidEmail('@domain.com')).toBe(false);
  });

  test('should validate password strength correctly', () => {
    const strongPassword = 'StrongPass123!';
    const weakPassword = 'weak';
    const noUpperCase = 'lowercase123!';
    const noLowerCase = 'UPPERCASE123!';
    const noNumbers = 'NoNumbers!';
    const noSpecial = 'NoSpecial123';
    const tooShort = 'Sh0rt!';

    expect(authService.isStrongPassword(strongPassword)).toBe(true);
    expect(authService.isStrongPassword(weakPassword)).toBe(false);
    expect(authService.isStrongPassword(noUpperCase)).toBe(false);
    expect(authService.isStrongPassword(noLowerCase)).toBe(false);
    expect(authService.isStrongPassword(noNumbers)).toBe(false);
    expect(authService.isStrongPassword(noSpecial)).toBe(false);
    expect(authService.isStrongPassword(tooShort)).toBe(false);
  });

  test('should generate JWT token structure', () => {
    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      role: 'user'
    };

    // Mock jwt.sign to return a predictable token
    const jwt = require('jsonwebtoken');
    jwt.sign = jest.fn().mockReturnValue('mock.jwt.token');

    const token = authService.generateJWT(mockUser);

    expect(token).toBe('mock.jwt.token');
  });
});
