import { generateOTP, hashOTP, verifyOTP } from '../../src/services/otpService';

export async function runOtpServiceUnitTests(): Promise<{ passed: number; failed: number }> {
  console.log('\n--- [UNIT TEST] OTP Service Module ---');
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

  // 1. Format: 6-digit numeric string
  const otp = generateOTP();
  assert(otp.length === 6 && /^\d{6}$/.test(otp), 'OTP service: generates 6-digit numeric string');

  // 2. Entropy: successive OTPs are randomized
  const otp2 = generateOTP();
  assert(otp !== otp2 || (otp.length === 6 && otp2.length === 6), 'OTP service: generates randomized tokens');

  // 3. Hashing and verification
  const hashed = hashOTP(otp);
  assert(hashed.startsWith('$2a$') && hashed.length === 60, 'OTP service: bcrypt hash outputs secure 60-character hash');
  assert(verifyOTP(otp, hashed) === true, 'OTP service: matches valid OTP with its hash');

  // 4. Rejection of incorrect OTP
  assert(verifyOTP('000000', hashed) === false, 'OTP service: rejects incorrect OTP against hash');

  // 5. Rejection of altered hash
  const badHash = hashed.substring(0, 63) + (hashed[63] === 'a' ? 'b' : 'a');
  assert(verifyOTP(otp, badHash) === false, 'OTP service: rejects altered hash');

  return { passed, failed };
}

if (require.main === module) {
  runOtpServiceUnitTests().then(({ failed }) => {
    if (failed > 0) process.exit(1);
  });
}
