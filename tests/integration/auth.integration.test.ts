import { prisma } from '../../src/config/db';
import { AuthService, AuthError } from '../../src/services/authService';

export async function runAuthIntegrationTests(): Promise<{ passed: number; failed: number }> {
  console.log('\n--- [INTEGRATION TEST] Auth & Email Verification Lifecycle Module ---');
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

  const testEmail = `auth_test_${Date.now()}@mymall.et`;
  const wrongEmail = `wrong_${Date.now()}@mymall.et`;
  const testPassword = 'P@ssw0rd2026!';

  try {
    // 1. Requesting OTP sends code and does NOT create a user record in prisma.user
    const otpResult = await AuthService.requestRegistrationOtp(testEmail);
    assert(otpResult.success === true, 'requestRegistrationOtp returns success');

    const prematureUser = await prisma.user.findUnique({ where: { email: testEmail } });
    assert(prematureUser === null, 'requestRegistrationOtp strictly DOES NOT create premature user record in prisma.user');

    const verificationRecord = await prisma.emailVerification.findUnique({
      where: { email: testEmail },
    });
    assert(!!verificationRecord, 'EmailVerification record generated in database with OTP hash');

    // 2. Submitting OTP against mismatched email fails with NOT_FOUND
    let mismatchBlocked = false;
    try {
      await AuthService.verifyRegistrationOtp(wrongEmail, otpResult.otp || '123456');
    } catch (e: any) {
      if (e.code === 'NOT_FOUND' || e.statusCode === 404) {
        mismatchBlocked = true;
      }
    }
    assert(mismatchBlocked === true, 'Submitting OTP for mismatched email rejected with 404 NOT_FOUND');

    // 3. Submitting invalid OTP code fails with INVALID_OTP
    let invalidOtpBlocked = false;
    try {
      await AuthService.verifyRegistrationOtp(testEmail, '999999');
    } catch (e: any) {
      if (e.code === 'INVALID_OTP' || e.statusCode === 400) {
        invalidOtpBlocked = true;
      }
    }
    assert(invalidOtpBlocked === true, 'Submitting invalid OTP code rejected with INVALID_OTP');

    // 4. Register strictly creates the user AFTER valid OTP code and returns auth tokens
    const otpToUse = otpResult.otp || '123456';
    if (!otpResult.otp) {
      const { hashOTP } = await import('../../src/services/otpService');
      await prisma.emailVerification.update({
        where: { email: testEmail },
        data: { otpHash: hashOTP('123456') },
      });
    }

    const regResult = await AuthService.register({
      email: testEmail,
      password: testPassword,
      name: 'Auth Lifecycle Test User',
      otp: otpToUse,
    });

    assert(regResult.success === true, 'Registration succeeds after OTP verification');
    assert(regResult.user.isEmailVerified === true, 'Created user has isEmailVerified = true');
    assert(!!regResult.tokens?.accessToken, 'Registration immediately returns active JWT tokens');

    const createdUser = await prisma.user.findUnique({ where: { email: testEmail } });
    assert(!!createdUser, 'User record created in database');

    // 5. Subsequent registration attempt with same email is rejected with 409 EMAIL_EXISTS
    let duplicateBlocked = false;
    try {
      await AuthService.requestRegistrationOtp(testEmail);
    } catch (e: any) {
      if (e.code === 'EMAIL_EXISTS' || e.statusCode === 409) {
        duplicateBlocked = true;
      }
    }
    assert(duplicateBlocked === true, 'Duplicate registration attempt blocked with 409 EMAIL_EXISTS');

    // 6. User can log in with new credentials
    const loginRes = await AuthService.login(testEmail, testPassword);
    assert(!!loginRes.tokens?.accessToken, 'Verified user logs in successfully with new credentials');

    // Clean up
    await prisma.user.delete({ where: { email: testEmail } }).catch(() => {});
  } catch (err: any) {
    console.error('  ❌ [ERROR] Auth integration test exception:', err.message);
    failed++;
  }

  return { passed, failed };
}

if (require.main === module) {
  runAuthIntegrationTests().then(({ failed }) => {
    if (failed > 0) process.exit(1);
    process.exit(0);
  });
}
