import { apiRequest } from './e2e_helper';
import { prisma } from '../../src/config/db';
import { hashOTP } from '../../src/services/otpService';

export async function runAuthGateE2ETests(): Promise<{ passed: number; failed: number }> {
  console.log('\n--- [E2E TEST] Authentication & Email Verification Gate Module ---');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${testName}`);
      failed++;
    }
  }

  const timestamp = Date.now();
  const testEmail = `e2e_gate_${timestamp}@mymall.et`;
  const strongPassword = 'P@ssw0rd2026!';
  const weakPassword = 'weak';

  try {
    // 1. Weak password rejection
    const weakRes = await apiRequest('POST', '/auth/register', {
      email: testEmail,
      password: weakPassword,
      name: 'Weak Pass Tester',
      otp: '123456',
    });
    assert(weakRes.status === 400, 'Rejects registration with weak password (HTTP 400)');

    // 2. Missing OTP rejection
    const missingOtpRes = await apiRequest('POST', '/auth/register', {
      email: testEmail,
      password: strongPassword,
      name: 'E2E Gate Shopper',
    });
    assert(missingOtpRes.status === 400 && missingOtpRes.data.code === 'OTP_REQUIRED', 'Rejects registration without OTP (HTTP 400 OTP_REQUIRED)');

    // 3. Request OTP for new registration
    const sendOtpRes = await apiRequest('POST', '/auth/send-otp', {
      email: testEmail,
    });
    assert(sendOtpRes.status === 200, 'POST /auth/send-otp sends verification code (HTTP 200)');

    // Verify user is NOT prematurely created in database
    const prematureUser = await prisma.user.findUnique({ where: { email: testEmail } });
    assert(prematureUser === null, 'User record is strictly NOT created prematurely before OTP verification');

    // 4. Update OTP hash in DB for predictable testing
    const otpCode = '654321';
    await prisma.emailVerification.update({
      where: { email: testEmail },
      data: { otpHash: hashOTP(otpCode) },
    });

    // 5. Verify OTP endpoint
    const verifyRes = await apiRequest('POST', '/auth/verify-otp', {
      email: testEmail,
      otp: otpCode,
    });
    assert(verifyRes.status === 200 && verifyRes.data.success === true, 'Valid OTP verifies registration code (HTTP 200)');

    // 6. Complete registration with verified OTP
    const regRes = await apiRequest('POST', '/auth/register', {
      email: testEmail,
      password: strongPassword,
      name: 'E2E Gate Shopper',
      phone: '+251911887766',
      otp: otpCode,
    });
    assert(regRes.status === 201 && regRes.data.user.isEmailVerified === true, 'Registration creates verified user and returns tokens (HTTP 201)');
    assert(!!regRes.data.tokens?.accessToken, 'Registration returns active JWT accessToken');

    // 7. Successful login after verification
    const verifiedLogin = await apiRequest('POST', '/auth/login', {
      email: testEmail,
      password: strongPassword,
    });
    assert(verifiedLogin.status === 200 && !!verifiedLogin.data.tokens?.accessToken, 'Verified user successfully logs in and receives JWT accessToken');

    // Clean up
    await prisma.emailVerification.deleteMany({ where: { email: testEmail } });
    await prisma.user.delete({ where: { email: testEmail } }).catch(() => {});
  } catch (err: any) {
    console.error('  ❌ [ERROR] Auth Gate E2E exception:', err.message);
    failed++;
  }

  return { passed, failed };
}

if (require.main === module) {
  const { startTestServer, stopTestServer } = require('./e2e_helper');
  startTestServer().then(() => {
    return runAuthGateE2ETests().then(async ({ failed }) => {
      await stopTestServer();
      process.exit(failed > 0 ? 1 : 0);
    });
  });
}
