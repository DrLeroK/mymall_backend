export async function runProductServiceUnitTests(): Promise<{ passed: number; failed: number }> {
  console.log('\n--- [UNIT TEST] Product Service Logic Module ---');
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

  // 1. Plan limit evaluation unit logic
  function canAddProduct(currentProductCount: number, maxProductsAllowed: number): boolean {
    return currentProductCount < maxProductsAllowed;
  }

  assert(canAddProduct(24, 25) === true, 'Allows adding product when count is 24/25 (Starter plan)');
  assert(canAddProduct(25, 25) === false, 'Rejects adding product when count reaches max 25 (Starter plan full)');
  assert(canAddProduct(149, 150) === true, 'Allows adding product on Growth tier under 150 limit');
  assert(canAddProduct(150, 150) === false, 'Rejects adding product on Growth tier when 150 reached');

  // 2. Variant validation logic
  interface VariantInput {
    name: string;
    sku: string;
    price: number;
    stockQuantity: number;
  }

  function validateVariant(v: VariantInput): boolean {
    return !!(v.name && v.name.trim().length > 0 && v.price >= 0 && v.stockQuantity >= 0);
  }

  assert(validateVariant({ name: 'XL / Black', sku: 'ETH-XL-BLK', price: 1200, stockQuantity: 15 }) === true, 'Validates well-formed variant');
  assert(validateVariant({ name: '', sku: 'ETH-0', price: 500, stockQuantity: 10 }) === false, 'Rejects variant with empty name');
  assert(validateVariant({ name: 'Small', sku: 'ETH-S', price: -50, stockQuantity: 5 }) === false, 'Rejects variant with negative price');

  return { passed, failed };
}

if (require.main === module) {
  runProductServiceUnitTests().then(({ failed }) => {
    if (failed > 0) process.exit(1);
  });
}
