import { prisma } from '../../src/config/db';
import { ProductService } from '../../src/services/productService';
import { StoreService } from '../../src/services/storeService';
import { AuthService } from '../../src/services/authService';

import { ensureDefaultSubscriptionPlans } from '../helpers/seedPlans';

export async function runProductVariantsIntegrationTests(): Promise<{ passed: number; failed: number }> {
  console.log('\n--- [INTEGRATION TEST] Product Variants & Plan Limits Module ---');
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

  const ownerEmail = `prod_owner_${Date.now()}@mymall.et`;
  let ownerUser: any = null;
  let testStore: any = null;

  try {
    await ensureDefaultSubscriptionPlans();
    // 1. Create owner and 5-day trial store
    await AuthService.register({
      email: ownerEmail,
      password: 'P@ssw0rd2026!',
      name: 'Product Test Owner',
    });
    ownerUser = await prisma.user.update({
      where: { email: ownerEmail },
      data: { isEmailVerified: true, role: 'STORE_OWNER' },
    });

    testStore = await StoreService.createStore(ownerUser.id, {
      name: 'Product Limit Test Hub',
      slug: `prod-limit-test-${Date.now()}`,
      description: 'Testing variants and product limits',
    });

    // 2. Add product with multi-attribute variants
    const productWithVariants = await ProductService.createProduct(testStore.id, {
      name: 'Traditional Ethiopian Kemis Deluxe',
      slug: `kemis-deluxe-${Date.now()}`,
      costPrice: 1500,
      sellingPrice: 3500,
      stockQuantity: 40,
      hasVariants: true,
      variants: [
        { name: 'Small / White Gold Embroidery', sku: 'KEMIS-S-WHT', price: 3500, stockQuantity: 10 },
        { name: 'Medium / White Gold Embroidery', sku: 'KEMIS-M-WHT', price: 3500, stockQuantity: 15 },
        { name: 'Large / Royal Blue Tilf', sku: 'KEMIS-L-BLU', price: 3800, stockQuantity: 15 },
      ],
    });

    assert(productWithVariants?.hasVariants === true, 'Product created with hasVariants = true');
    const dbVariants = await prisma.productVariant.findMany({
      where: { productId: productWithVariants!.id },
    });
    assert(dbVariants.length === 3, 'Created 3 nested ProductVariant records in database');
    assert(Number(dbVariants[2].price) === 3800, 'Variant individual pricing correctly saved');

    // 3. Plan limit enforcement: Starter limit is 25 products
    // Bulk insert up to 25 products
    const bulkProducts = [];
    for (let i = 2; i <= 25; i++) {
      bulkProducts.push({
        storeId: testStore.id,
        name: `Filler Product ${i}`,
        slug: `filler-prod-${i}-${Date.now()}`,
        costPrice: 100,
        sellingPrice: 200,
        stockQuantity: 10,
        unit: 'pcs',
      });
    }
    await prisma.product.createMany({ data: bulkProducts });

    const totalCount = await prisma.product.count({ where: { storeId: testStore.id } });
    assert(totalCount === 25, 'Store reaches maximum 25 products on Starter plan');

    // 4. Attempt to add 26th product -> should throw 403 PLAN_LIMIT_REACHED
    let limitBlocked = false;
    let limitMessage = '';
    try {
      await ProductService.createProduct(testStore.id, {
        name: 'Product Number 26 Exceeding Limit',
        costPrice: 50,
        sellingPrice: 100,
        stockQuantity: 5,
      });
    } catch (e: any) {
      if (e.message && e.message.includes('subscription plan is full')) {
        limitBlocked = true;
        limitMessage = e.message;
      }
    }
    assert(limitBlocked === true, 'Hard limit enforcement: 26th product blocked with 403 "Your subscription plan is full"');

    // Clean up
    await prisma.product.deleteMany({ where: { storeId: testStore.id } });
    await prisma.store.delete({ where: { id: testStore.id } }).catch(() => {});
    await prisma.user.delete({ where: { email: ownerEmail } }).catch(() => {});
  } catch (err: any) {
    console.error('  ❌ [ERROR] Product variants integration test exception:', err.message);
    failed++;
  }

  return { passed, failed };
}

if (require.main === module) {
  runProductVariantsIntegrationTests().then(({ failed }) => {
    if (failed > 0) process.exit(1);
    process.exit(0);
  });
}
