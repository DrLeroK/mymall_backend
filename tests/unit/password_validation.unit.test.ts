import { validateStrongPassword } from '../../src/services/authService';

export async function runPasswordValidationUnitTests(): Promise<{ passed: number; failed: number }> {
  console.log('\n--- [UNIT TEST] Password Validation Module ---');
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

  // 1. Rejects under 8 characters
  assert(validateStrongPassword('P@ss1').isValid === false, 'Rejects passwords under 8 characters');

  // 2. Rejects missing uppercase
  assert(validateStrongPassword('p@ssw0rd2026!').isValid === false, 'Rejects password without uppercase letter');

  // 3. Rejects missing lowercase
  assert(validateStrongPassword('P@SSW0RD2026!').isValid === false, 'Rejects password without lowercase letter');

  // 4. Rejects missing numbers
  assert(validateStrongPassword('P@sswordXYZ!').isValid === false, 'Rejects password without numbers');

  // 5. Rejects missing special character
  assert(validateStrongPassword('Password2026').isValid === false, 'Rejects password without special character');

  // 6. Accepts strong standard password
  assert(validateStrongPassword('P@ssw0rd2026!').isValid === true, 'Accepts robust standard password P@ssw0rd2026!');

  // 7. Accepts strong password with various symbols
  assert(validateStrongPassword('EthioMall#2026$Secure').isValid === true, 'Accepts strong password with complex symbols');

  return { passed, failed };
}

if (require.main === module) {
  runPasswordValidationUnitTests().then(({ failed }) => {
    if (failed > 0) process.exit(1);
  });
}
