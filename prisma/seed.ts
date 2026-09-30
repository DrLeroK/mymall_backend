import { PrismaClient, Role, StaffRole, StoreStatus, BillingCycle, PaymentStatus, OrderStatus, PaymentProofStatus, POSPaymentMethod, OrderType, ConversationType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting MyMall Database Seeding with Rich Ethiopian Stores & Users...');

  // 1. Common Passwords (guaranteed hashed)
  const adminPassword = await bcrypt.hash('admin123', 10);
  const ownerPassword = await bcrypt.hash('owner123', 10);
  const cashierPassword = await bcrypt.hash('cashier123', 10);
  const customerPassword = await bcrypt.hash('customer123', 10);

  // 2. Platform Super Admin
  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@mymall.com' },
    update: {
      password: adminPassword,
      name: 'Platform Super Admin',
      role: Role.SUPER_ADMIN,
      isEmailVerified: true,
    },
    create: {
      email: 'admin@mymall.com',
      password: adminPassword,
      name: 'Platform Super Admin',
      role: Role.SUPER_ADMIN,
      isEmailVerified: true,
    },
  });
  console.log('✅ Super Admin verified: admin@mymall.com / admin123');

  // 3. Subscription Plans (All 4 billing cycles + rank boosts)
  const starterPlan = await prisma.subscriptionPlan.upsert({
    where: { name: 'Starter' },
    update: {
      threeMonthsPrice: 79.99,
      sixMonthsPrice: 149.99,
      yearlyPrice: 299.99,
      searchRankBoost: 1,
    },
    create: {
      name: 'Starter',
      description: 'Ideal for small retail shops getting started online & in-store.',
      monthlyPrice: 29.99,
      threeMonthsPrice: 79.99,
      sixMonthsPrice: 149.99,
      yearlyPrice: 299.99,
      maxProducts: 50,
      maxStaff: 2,
      searchRankBoost: 1,
      analyticsLevel: 'BASIC',
      customDomainAllowed: false,
    },
  });

  const proPlan = await prisma.subscriptionPlan.upsert({
    where: { name: 'Professional' },
    update: {
      threeMonthsPrice: 219.99,
      sixMonthsPrice: 419.99,
      yearlyPrice: 799.99,
      searchRankBoost: 5,
    },
    create: {
      name: 'Professional',
      description: 'For growing brands needing high marketplace visibility, POS integration & advanced analytics.',
      monthlyPrice: 79.99,
      threeMonthsPrice: 219.99,
      sixMonthsPrice: 419.99,
      yearlyPrice: 799.99,
      maxProducts: 500,
      maxStaff: 10,
      searchRankBoost: 5,
      analyticsLevel: 'ADVANCED',
      customDomainAllowed: true,
    },
  });

  const enterprisePlan = await prisma.subscriptionPlan.upsert({
    where: { name: 'Enterprise' },
    update: {
      threeMonthsPrice: 539.99,
      sixMonthsPrice: 999.99,
      yearlyPrice: 1999.99,
      searchRankBoost: 10,
    },
    create: {
      name: 'Enterprise',
      description: 'Unlimited capacity, top search priority, multi-location POS, and 24/7 dedicated support.',
      monthlyPrice: 199.99,
      threeMonthsPrice: 539.99,
      sixMonthsPrice: 999.99,
      yearlyPrice: 1999.99,
      maxProducts: 10000,
      maxStaff: 50,
      searchRankBoost: 10,
      analyticsLevel: 'PRO',
      customDomainAllowed: true,
    },
  });

  // 4. Platform Bank Accounts (Used by store owners to pay subscription fees)
  await prisma.platformBankAccount.deleteMany();
  await prisma.platformBankAccount.createMany({
    data: [
      {
        bankName: 'Commercial Bank of Ethiopia (CBE)',
        accountName: 'MyMall Technologies PLC',
        accountNumber: '1000234567891',
        instructions: 'Please include your Store Name or Store ID in the transaction transfer reference.',
      },
      {
        bankName: 'Telebirr SuperApp',
        accountName: 'MyMall Technologies Merchant',
        accountNumber: '+251911002233',
        instructions: 'Send money to merchant number and upload receipt screenshot.',
      },
      {
        bankName: 'Awash Bank',
        accountName: 'MyMall Technologies PLC',
        accountNumber: '01420987654300',
        instructions: 'Transfer via Awash Mobile or branch deposit.',
      },
      {
        bankName: 'Bank of Abyssinia',
        accountName: 'MyMall Technologies PLC',
        accountNumber: '8877665544',
        instructions: 'Transfer via BoA mobile or branch deposit.',
      },
    ],
  });
  console.log('✅ Platform Bank Accounts seeded.');

  // 5. Demo Customers
  const customer1 = await prisma.user.upsert({
    where: { email: 'customer@example.com' },
    update: {
      password: customerPassword,
      name: 'Sophia Martinez',
      role: Role.CUSTOMER,
      isEmailVerified: true,
    },
    create: {
      email: 'customer@example.com',
      password: customerPassword,
      name: 'Sophia Martinez',
      phone: '+251-91-9876543',
      role: Role.CUSTOMER,
      isEmailVerified: true,
    },
  });

  const customer2 = await prisma.user.upsert({
    where: { email: 'customer@demo.com' },
    update: {
      password: customerPassword,
      name: 'Abebe Kebede',
      role: Role.CUSTOMER,
      isEmailVerified: true,
    },
    create: {
      email: 'customer@demo.com',
      password: customerPassword,
      name: 'Abebe Kebede',
      phone: '+251-92-3344556',
      role: Role.CUSTOMER,
      isEmailVerified: true,
    },
  });
  console.log('✅ Customers verified (customer@example.com / customer123 & customer@demo.com / customer123)');

  // 6. Define 5 Rich Diverse Ethiopian Stores
  const storesData = [
    {
      name: 'UrbanTrend Fashion',
      slug: 'urbantrend',
      tagline: 'Modern Apparel, Streetwear & Lifestyle',
      description: 'Curated contemporary streetwear, hoodies, denim, and premium footwear tailored for urban life.',
      category: 'Fashion & Apparel',
      logoUrl: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=300&q=80',
      bannerUrl: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1200&q=80',
      contactEmail: 'contact@urbantrend.com',
      contactPhone: '+251-91-1234567',
      address: 'Bole Medhanialem Mall, 2nd Floor, Addis Ababa',
      primaryColor: '#2563eb',
      secondaryColor: '#0f172a',
      accentColor: '#f59e0b',
      plan: proPlan,
      ownerEmail: 'owner@urbantrend.com',
      ownerName: 'Elena Vance',
      cashierEmail: 'cashier@urbantrend.com',
      cashierName: 'Marcus Brody',
      bankAccounts: [
        { bankName: 'Commercial Bank of Ethiopia (CBE)', accountName: 'UrbanTrend Boutique', accountNumber: '1000987654321', instructions: 'Include your Order Number in the transfer memo.' },
        { bankName: 'Telebirr', accountName: 'UrbanTrend Store', accountNumber: '+251911234567', instructions: 'Direct transfer to our Telebirr merchant phone.' }
      ],
      categories: [
        { name: 'Apparel', slug: 'apparel', description: 'Streetwear hoodies, t-shirts, and denim.' },
        { name: 'Footwear', slug: 'footwear', description: 'Sneakers, high-tops, and lifestyle boots.' },
      ],
      products: [
        {
          name: 'Oversized Vintage Hoodie',
          slug: 'oversized-vintage-hoodie',
          categorySlug: 'apparel',
          description: 'Heavyweight 450 GSM organic cotton washed-out vintage fleece hoodie with reinforced seams.',
          sku: 'UT-HD-001',
          barcode: '890123456701',
          costPrice: 28.00,
          sellingPrice: 65.00,
          compareAtPrice: 85.00,
          stockQuantity: 45,
          lowStockThreshold: 10,
          images: ['https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=800&q=80', 'https://images.unsplash.com/photo-1578587018452-892bacefd3f2?auto=format&fit=crop&w=800&q=80'],
          variants: [
            { name: 'Washed Black / M', sku: 'UT-HD-001-BM', price: 65.00, stockQuantity: 20, options: { color: 'Washed Black', size: 'M' } },
            { name: 'Washed Black / L', sku: 'UT-HD-001-BL', price: 65.00, stockQuantity: 15, options: { color: 'Washed Black', size: 'L' } },
            { name: 'Olive Green / L', sku: 'UT-HD-001-OL', price: 68.00, stockQuantity: 10, options: { color: 'Olive Green', size: 'L' } },
          ]
        },
        {
          name: 'Urban Runner Pro Sneakers',
          slug: 'urban-runner-pro-sneakers',
          categorySlug: 'footwear',
          description: 'Breathable engineered mesh running sneaker with ultra-light EVA midsole and high grip outsole.',
          sku: 'UT-SNK-002',
          barcode: '890123456702',
          costPrice: 45.00,
          sellingPrice: 98.00,
          compareAtPrice: 130.00,
          stockQuantity: 8, // Low stock item test
          lowStockThreshold: 10,
          images: ['https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=800&q=80'],
          variants: [
            { name: 'Red-White / 42', sku: 'UT-SNK-002-42', price: 98.00, stockQuantity: 3, options: { color: 'Red/White', size: '42' } },
            { name: 'Red-White / 43', sku: 'UT-SNK-002-43', price: 98.00, stockQuantity: 5, options: { color: 'Red/White', size: '43' } },
          ]
        },
        {
          name: 'Classic Minimalist Graphic Tee',
          slug: 'classic-minimalist-graphic-tee',
          categorySlug: 'apparel',
          description: '100% combed ringspun cotton graphic tee with subtle front typography and relaxed fit.',
          sku: 'UT-TEE-003',
          barcode: '890123456703',
          costPrice: 12.00,
          sellingPrice: 32.00,
          compareAtPrice: 40.00,
          stockQuantity: 85,
          lowStockThreshold: 15,
          images: ['https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=800&q=80'],
        },
        {
          name: 'Relaxed Fit Utility Cargo Pants',
          slug: 'relaxed-fit-utility-cargo-pants',
          categorySlug: 'apparel',
          description: 'Durable cotton ripstop cargo pants with adjustable ankles and 6 deep utility pockets.',
          sku: 'UT-PNT-004',
          barcode: '890123456704',
          costPrice: 30.00,
          sellingPrice: 72.00,
          compareAtPrice: 95.00,
          stockQuantity: 35,
          lowStockThreshold: 8,
          images: ['https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?auto=format&fit=crop&w=800&q=80'],
        },
      ]
    },
    {
      name: 'GadgetHub Electronics',
      slug: 'gadgethub',
      tagline: 'Premium Consumer Tech, Audio & Wearables',
      description: 'The latest genuine smart devices, noise-canceling headphones, chargers, and gaming peripherals in Ethiopia.',
      category: 'Electronics & Tech',
      logoUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=300&q=80',
      bannerUrl: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=1200&q=80',
      contactEmail: 'sales@gadgethub.et',
      contactPhone: '+251-92-2334455',
      address: 'Dembel City Center, Ground Floor, Addis Ababa',
      primaryColor: '#0ea5e9',
      secondaryColor: '#0f172a',
      accentColor: '#10b981',
      plan: enterprisePlan,
      ownerEmail: 'owner@gadgethub.com',
      ownerName: 'Tewodros Kassahun',
      cashierEmail: 'cashier@gadgethub.com',
      cashierName: 'Natnael Girma',
      bankAccounts: [
        { bankName: 'Commercial Bank of Ethiopia (CBE)', accountName: 'GadgetHub Electronics PLC', accountNumber: '1000554433221', instructions: 'State Order ID in CBE mobile app remark.' },
        { bankName: 'Telebirr', accountName: 'GadgetHub Merchant', accountNumber: '+251922334455', instructions: 'Pay via Telebirr merchant QR or phone.' }
      ],
      categories: [
        { name: 'Audio & Acoustics', slug: 'audio', description: 'Wireless ANC headphones, earbuds, and speakers.' },
        { name: 'Wearables & Accessories', slug: 'wearables', description: 'Smartwatches, fast chargers, and accessories.' },
      ],
      products: [
        {
          name: 'SoundWave ANC Wireless Headphones',
          slug: 'soundwave-anc-wireless-headphones',
          categorySlug: 'audio',
          description: 'Active Noise Cancelling over-ear headphones with 40-hour battery life and spatial audio support.',
          sku: 'GH-AUD-001',
          barcode: '890200000101',
          costPrice: 85.00,
          sellingPrice: 149.00,
          compareAtPrice: 189.00,
          stockQuantity: 24,
          lowStockThreshold: 5,
          images: ['https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=80'],
          variants: [
            { name: 'Midnight Black', sku: 'GH-AUD-001-BLK', price: 149.00, stockQuantity: 14, options: { color: 'Midnight Black' } },
            { name: 'Silver White', sku: 'GH-AUD-001-SLV', price: 149.00, stockQuantity: 10, options: { color: 'Silver White' } },
          ]
        },
        {
          name: 'Titan Smart Fitness Watch GPS',
          slug: 'titan-smart-fitness-watch-gps',
          categorySlug: 'wearables',
          description: 'AMOLED Always-On display, continuous heart rate, SpO2 monitor, 14-day battery life and built-in GPS.',
          sku: 'GH-WCH-002',
          barcode: '890200000102',
          costPrice: 60.00,
          sellingPrice: 119.00,
          compareAtPrice: 145.00,
          stockQuantity: 18,
          lowStockThreshold: 5,
          images: ['https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80'],
        },
        {
          name: '100W GaN 4-Port Fast Wall Charger',
          slug: '100w-gan-4-port-fast-wall-charger',
          categorySlug: 'wearables',
          description: 'Ultra-compact Gallium Nitride charger supporting fast charge for MacBook Pro, iPhones, and Android devices simultaneously.',
          sku: 'GH-CHG-003',
          barcode: '890200000103',
          costPrice: 22.00,
          sellingPrice: 48.00,
          compareAtPrice: 60.00,
          stockQuantity: 50,
          lowStockThreshold: 10,
          images: ['https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=800&q=80'],
        },
      ]
    },
    {
      name: 'Abyssinia Artisan & Coffee',
      slug: 'abyssinia',
      tagline: 'Authentic Ethiopian Crafts, Coffee & Heritage',
      description: 'Preserving Ethiopian cultural beauty with handwoven Habesha Kemis, clay coffee Jebenas, and single-origin Yirgacheffe roasts.',
      category: 'Ethiopian Heritage & Crafts',
      logoUrl: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=300&q=80',
      bannerUrl: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=1200&q=80',
      contactEmail: 'artisan@abyssinia.et',
      contactPhone: '+251-91-3445566',
      address: 'Piazza, Churchill Avenue, Addis Ababa',
      primaryColor: '#d97706',
      secondaryColor: '#451a03',
      accentColor: '#16a34a',
      plan: proPlan,
      ownerEmail: 'owner@abyssinia.com',
      ownerName: 'Selamawit Desta',
      cashierEmail: 'cashier@abyssinia.com',
      cashierName: 'Kaleb Worku',
      bankAccounts: [
        { bankName: 'Commercial Bank of Ethiopia (CBE)', accountName: 'Abyssinia Artisan Trading', accountNumber: '1000667788990', instructions: 'Reference order number in deposit slip.' },
        { bankName: 'Bank of Abyssinia', accountName: 'Selamawit Desta', accountNumber: '7766554433', instructions: 'Direct mobile transfer to BoA account.' }
      ],
      categories: [
        { name: 'Traditional Apparel', slug: 'traditional-apparel', description: 'Handcrafted Habesha Kemis and Shema scarves.' },
        { name: 'Specialty Coffee & Pottery', slug: 'specialty-coffee', description: 'Clay jebenas, cini cups, and freshly roasted Ethiopian beans.' },
      ],
      products: [
        {
          name: 'Handwoven Royal Habesha Kemis',
          slug: 'handwoven-royal-habesha-kemis',
          categorySlug: 'traditional-apparel',
          description: 'Exquisite 100% pure Ethiopian cotton hand-spun dress with intricate golden and emerald Tilet embroidery.',
          sku: 'ABY-KEM-001',
          barcode: '890300000101',
          costPrice: 90.00,
          sellingPrice: 195.00,
          compareAtPrice: 240.00,
          stockQuantity: 12,
          lowStockThreshold: 3,
          images: ['https://images.unsplash.com/photo-1567401893414-76b7b1e5a7a5?auto=format&fit=crop&w=800&q=80'],
          variants: [
            { name: 'Golden Tilet / Standard', sku: 'ABY-KEM-001-GLD', price: 195.00, stockQuantity: 7, options: { design: 'Golden Tilet' } },
            { name: 'Silver Tilet / Standard', sku: 'ABY-KEM-001-SLV', price: 195.00, stockQuantity: 5, options: { design: 'Silver Tilet' } },
          ]
        },
        {
          name: 'Traditional Clay Jebena & 6 Cini Cups Set',
          slug: 'traditional-clay-jebena-set',
          categorySlug: 'specialty-coffee',
          description: 'Authentic wood-fired black clay coffee pot (Jebena) accompanied by 6 matching ceramic Cini cups with traditional patterns.',
          sku: 'ABY-JEB-002',
          barcode: '890300000102',
          costPrice: 18.00,
          sellingPrice: 45.00,
          compareAtPrice: 60.00,
          stockQuantity: 30,
          lowStockThreshold: 5,
          images: ['https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=800&q=80'],
        },
        {
          name: 'Single-Origin Yirgacheffe Roast Coffee (500g)',
          slug: 'single-origin-yirgacheffe-roast-coffee',
          categorySlug: 'specialty-coffee',
          description: 'Grade 1 washed Yirgacheffe arabica beans. Bright citrus acidity, floral jasmine notes, and a clean sweet finish.',
          sku: 'ABY-COF-003',
          barcode: '890300000103',
          costPrice: 8.00,
          sellingPrice: 18.00,
          compareAtPrice: 22.00,
          stockQuantity: 90,
          lowStockThreshold: 15,
          images: ['https://images.unsplash.com/photo-1559056199-641a0ac8b55e?auto=format&fit=crop&w=800&q=80'],
        },
        {
          name: 'Pure Ethiopian Highland White Honey (1kg)',
          slug: 'pure-ethiopian-highland-white-honey',
          categorySlug: 'specialty-coffee',
          description: 'Rare organic Tigray white honey harvested from mountain blossoms. Naturally creamy texture with mild floral sweetness.',
          sku: 'ABY-HNY-004',
          barcode: '890300000104',
          costPrice: 14.00,
          sellingPrice: 28.00,
          compareAtPrice: 35.00,
          stockQuantity: 40,
          lowStockThreshold: 10,
          images: ['https://images.unsplash.com/photo-1587049352846-4a222e784d38?auto=format&fit=crop&w=800&q=80'],
        },
      ]
    },
    {
      name: 'Sheba Beauty & Organics',
      slug: 'shebabeauty',
      tagline: 'Clean Botanical Skincare & Hair Nutrition',
      description: 'Nourishing natural beauty formulated with East African Nilotica Shea butter, black seed oil, and botanical extracts.',
      category: 'Beauty & Personal Care',
      logoUrl: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=300&q=80',
      bannerUrl: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=1200&q=80',
      contactEmail: 'care@shebabeauty.et',
      contactPhone: '+251-91-5566778',
      address: 'Kazanchis, Joseph Tito Street, Addis Ababa',
      primaryColor: '#ec4899',
      secondaryColor: '#831843',
      accentColor: '#fbbf24',
      plan: proPlan,
      ownerEmail: 'owner@shebabeauty.com',
      ownerName: 'Marta Hailu',
      cashierEmail: 'cashier@shebabeauty.com',
      cashierName: 'Bethlehem Tadesse',
      bankAccounts: [
        { bankName: 'Commercial Bank of Ethiopia (CBE)', accountName: 'Sheba Beauty Naturals', accountNumber: '1000889900112', instructions: 'Send receipt confirmation via WhatsApp or app.' },
        { bankName: 'Telebirr', accountName: 'Marta Hailu', accountNumber: '+251915566778', instructions: 'Transfer directly to Telebirr phone number.' }
      ],
      categories: [
        { name: 'Face & Skin', slug: 'face-skin', description: 'Serums, toners, and organic face moisturizers.' },
        { name: 'Hair & Body', slug: 'hair-body', description: 'Raw whipped shea butter and cold-pressed hair growth oils.' },
      ],
      products: [
        {
          name: 'Pure Whipped Nilotica Shea Butter (250ml)',
          slug: 'pure-whipped-nilotica-shea-butter',
          categorySlug: 'hair-body',
          description: 'Ultra-creamy cold-whipped Nilotica shea butter infused with vanilla bean and sweet almond oil for deep moisture.',
          sku: 'SHB-BTR-001',
          barcode: '890400000101',
          costPrice: 9.00,
          sellingPrice: 24.00,
          compareAtPrice: 30.00,
          stockQuantity: 60,
          lowStockThreshold: 10,
          images: ['https://images.unsplash.com/photo-1608248597359-bbad20a1db4a?auto=format&fit=crop&w=800&q=80'],
        },
        {
          name: 'Black Seed & Argan Hair Growth Elixir',
          slug: 'black-seed-argan-hair-growth-elixir',
          categorySlug: 'hair-body',
          description: 'Potent scalp stimulation formula with 100% Ethiopian cold-pressed black seed oil, rosemary, and Moroccan argan.',
          sku: 'SHB-OIL-002',
          barcode: '890400000102',
          costPrice: 12.00,
          sellingPrice: 29.00,
          compareAtPrice: 38.00,
          stockQuantity: 45,
          lowStockThreshold: 8,
          images: ['https://images.unsplash.com/photo-1608248597359-bbad20a1db4a?auto=format&fit=crop&w=800&q=80'],
        },
        {
          name: 'Vitamin C + Hyaluronic Radiance Serum',
          slug: 'vitamin-c-hyaluronic-radiance-serum',
          categorySlug: 'face-skin',
          description: 'Lightweight fast-absorbing antioxidant serum targeting hyperpigmentation, uneven skin tone, and fine lines.',
          sku: 'SHB-SRM-003',
          barcode: '890400000103',
          costPrice: 15.00,
          sellingPrice: 36.00,
          compareAtPrice: 45.00,
          stockQuantity: 30,
          lowStockThreshold: 6,
          images: ['https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&w=800&q=80'],
        },
      ]
    },
    {
      name: 'FreshCorner Supermarket',
      slug: 'freshcorner',
      tagline: 'Highland Staples, Grains & Organic Spices',
      description: 'Your one-stop pantry for fresh Ethiopian staples: certified Magna Teff, hand-blended Berbere, cold-pressed oils and seasonings.',
      category: 'Groceries & Supermarket',
      logoUrl: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=300&q=80',
      bannerUrl: 'https://images.unsplash.com/photo-1488459716781-31db52582fe9?auto=format&fit=crop&w=1200&q=80',
      contactEmail: 'order@freshcorner.et',
      contactPhone: '+251-91-7788990',
      address: 'Sarbet, Old Airport Road, Addis Ababa',
      primaryColor: '#16a34a',
      secondaryColor: '#14532d',
      accentColor: '#f97316',
      plan: starterPlan,
      ownerEmail: 'owner@freshcorner.com',
      ownerName: 'Yonas Berhanu',
      cashierEmail: 'cashier@freshcorner.com',
      cashierName: 'Eden Negash',
      bankAccounts: [
        { bankName: 'Commercial Bank of Ethiopia (CBE)', accountName: 'FreshCorner Grocery PLC', accountNumber: '1000998877665', instructions: 'Write your Full Name or Phone in the remark.' },
        { bankName: 'Telebirr', accountName: 'FreshCorner Supermarket', accountNumber: '+251917788990', instructions: 'Pay via Telebirr merchant code.' }
      ],
      categories: [
        { name: 'Grains & Flours', slug: 'grains-flours', description: 'Certified pure white Teff, barley, and whole wheat.' },
        { name: 'Spices & Condiments', slug: 'spices-condiments', description: 'Berbere blend, Mitten Shiro, and Korerima.' },
      ],
      products: [
        {
          name: 'Certified Pure Magna White Teff (25kg)',
          slug: 'certified-pure-magna-white-teff-25kg',
          categorySlug: 'grains-flours',
          description: 'First grade high-altitude Magna white Teff from Gojjam, carefully stone-cleaned and ready for traditional injera fermentation.',
          sku: 'FC-TEF-001',
          barcode: '890500000101',
          costPrice: 42.00,
          sellingPrice: 58.00,
          compareAtPrice: 65.00,
          stockQuantity: 50,
          lowStockThreshold: 10,
          images: ['https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=800&q=80'],
        },
        {
          name: 'Handcrafted Traditional Berbere Blend (1kg)',
          slug: 'handcrafted-traditional-berbere-blend-1kg',
          categorySlug: 'spices-condiments',
          description: 'Aromatic Ethiopian spice blend sun-dried red chili, korerima (black cardamom), ginger, garlic, cloves, and sacred herbs.',
          sku: 'FC-BER-002',
          barcode: '890500000102',
          costPrice: 8.00,
          sellingPrice: 18.00,
          compareAtPrice: 24.00,
          stockQuantity: 70,
          lowStockThreshold: 15,
          images: ['https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&w=800&q=80'],
        },
        {
          name: 'Gondar Spiced Shiro Mitten Powder (1kg)',
          slug: 'gondar-spiced-shiro-mitten-powder-1kg',
          categorySlug: 'spices-condiments',
          description: 'Finely milled roasted chickpea and broad bean powder seasoned with 12 traditional aromatic spices for perfect velvety Shiro Wot.',
          sku: 'FC-SHR-003',
          barcode: '890500000103',
          costPrice: 6.00,
          sellingPrice: 15.00,
          compareAtPrice: 20.00,
          stockQuantity: 65,
          lowStockThreshold: 12,
          images: ['https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&w=800&q=80'],
        },
      ]
    },
  ];

  const subEndsAt = new Date();
  subEndsAt.setDate(subEndsAt.getDate() + 45);

  // Loop through and seed each store, its owner, cashier, bank accounts, categories, and products
  for (const s of storesData) {
    // A. Owner User
    const owner = await prisma.user.upsert({
      where: { email: s.ownerEmail },
      update: {
        password: ownerPassword,
        name: s.ownerName,
        phone: s.contactPhone,
        role: Role.STORE_OWNER,
        isEmailVerified: true,
      },
      create: {
        email: s.ownerEmail,
        password: ownerPassword,
        name: s.ownerName,
        phone: s.contactPhone,
        role: Role.STORE_OWNER,
        isEmailVerified: true,
      },
    });

    // B. Store
    const store = await prisma.store.upsert({
      where: { slug: s.slug },
      update: {
        name: s.name,
        tagline: s.tagline,
        description: s.description,
        category: s.category,
        logoUrl: s.logoUrl,
        bannerUrl: s.bannerUrl,
        contactEmail: s.contactEmail,
        contactPhone: s.contactPhone,
        address: s.address,
        currency: 'ETB',
        taxRate: 15.0,
        primaryColor: s.primaryColor,
        secondaryColor: s.secondaryColor,
        accentColor: s.accentColor,
        status: StoreStatus.ACTIVE,
        ownerId: owner.id,
        currentPlanId: s.plan.id,
        subscriptionEndsAt: subEndsAt,
      },
      create: {
        name: s.name,
        slug: s.slug,
        tagline: s.tagline,
        description: s.description,
        category: s.category,
        logoUrl: s.logoUrl,
        bannerUrl: s.bannerUrl,
        contactEmail: s.contactEmail,
        contactPhone: s.contactPhone,
        address: s.address,
        currency: 'ETB',
        taxRate: 15.0,
        primaryColor: s.primaryColor,
        secondaryColor: s.secondaryColor,
        accentColor: s.accentColor,
        status: StoreStatus.ACTIVE,
        ownerId: owner.id,
        currentPlanId: s.plan.id,
        subscriptionEndsAt: subEndsAt,
        businessHours: JSON.stringify({
          monday: '09:00 - 20:00',
          tuesday: '09:00 - 20:00',
          wednesday: '09:00 - 20:00',
          thursday: '09:00 - 20:00',
          friday: '09:00 - 21:00',
          saturday: '10:00 - 21:00',
          sunday: '11:00 - 18:00',
        }),
      },
    });

    // Attach store to owner
    await prisma.user.update({
      where: { id: owner.id },
      data: { storeId: store.id },
    });

    // C. Cashier User
    await prisma.user.upsert({
      where: { email: s.cashierEmail },
      update: {
        password: cashierPassword,
        name: s.cashierName,
        role: Role.STORE_STAFF,
        staffRole: StaffRole.CASHIER,
        storeId: store.id,
        isEmailVerified: true,
      },
      create: {
        email: s.cashierEmail,
        password: cashierPassword,
        name: s.cashierName,
        role: Role.STORE_STAFF,
        staffRole: StaffRole.CASHIER,
        storeId: store.id,
        isEmailVerified: true,
      },
    });

    // D. Store Bank Accounts
    await prisma.storeBankAccount.deleteMany({ where: { storeId: store.id } });
    await prisma.storeBankAccount.createMany({
      data: s.bankAccounts.map((b) => ({
        storeId: store.id,
        bankName: b.bankName,
        accountName: b.accountName,
        accountNumber: b.accountNumber,
        instructions: b.instructions,
      })),
    });

    // E. Store Categories
    const categoryMap = new Map<string, number>();
    for (const c of s.categories) {
      const cat = await prisma.productCategory.upsert({
        where: { storeId_slug: { storeId: store.id, slug: c.slug } },
        update: { name: c.name, description: c.description },
        create: {
          storeId: store.id,
          name: c.name,
          slug: c.slug,
          description: c.description,
        },
      });
      categoryMap.set(c.slug, cat.id);
    }

    // F. Store Products & Variants
    for (const p of s.products) {
      const categoryId = categoryMap.get(p.categorySlug);
      const createdProduct = await prisma.product.upsert({
        where: { storeId_slug: { storeId: store.id, slug: p.slug } },
        update: {
          categoryId,
          name: p.name,
          description: p.description,
          costPrice: p.costPrice,
          sellingPrice: p.sellingPrice,
          compareAtPrice: p.compareAtPrice,
          stockQuantity: p.stockQuantity,
          lowStockThreshold: p.lowStockThreshold,
          images: JSON.stringify(p.images),
        },
        create: {
          storeId: store.id,
          categoryId,
          name: p.name,
          slug: p.slug,
          description: p.description,
          sku: p.sku,
          barcode: p.barcode,
          costPrice: p.costPrice,
          sellingPrice: p.sellingPrice,
          compareAtPrice: p.compareAtPrice,
          stockQuantity: p.stockQuantity,
          lowStockThreshold: p.lowStockThreshold,
          images: JSON.stringify(p.images),
          hasVariants: Boolean(p.variants && p.variants.length > 0),
          variants: p.variants
            ? {
                create: p.variants.map((v) => ({
                  name: v.name,
                  sku: v.sku,
                  price: v.price,
                  stockQuantity: v.stockQuantity,
                  options: JSON.stringify(v.options),
                })),
              }
            : undefined,
        },
      });

      // Product Review for first product in store
      if (p === s.products[0]) {
        await prisma.review.deleteMany({ where: { productId: createdProduct.id } });
        await prisma.review.create({
          data: {
            storeId: store.id,
            productId: createdProduct.id,
            reviewerName: 'Sophia Martinez',
            reviewerEmail: 'customer@example.com',
            rating: 5,
            title: 'Exceptional craftsmanship and authentic quality',
            comment: `I ordered the ${p.name} and received it the same afternoon. Very well packaged and durable. Highly recommend!`,
            isVerifiedPurchase: true,
            isApproved: true,
          },
        });
      }
    }

    // G. Store Subscription & Active Invoice
    await prisma.storeSubscription.deleteMany({ where: { storeId: store.id } });
    await prisma.invoice.deleteMany({ where: { storeId: store.id } });
    const sub = await prisma.storeSubscription.create({
      data: {
        storeId: store.id,
        planId: s.plan.id,
        billingCycle: BillingCycle.MONTHLY,
        amount: s.plan.monthlyPrice,
        paymentMethod: 'SCREENSHOT',
        paymentProofUrl: '/uploads/screenshots/sample_subscription_proof.jpg',
        status: PaymentStatus.APPROVED,
        startDate: new Date(),
        endDate: subEndsAt,
        reviewedById: superAdmin.id,
      },
    });

    await prisma.invoice.create({
      data: {
        invoiceNumber: `INV-${store.slug.toUpperCase()}-001`,
        storeId: store.id,
        subscriptionId: sub.id,
        amount: s.plan.monthlyPrice,
        currency: 'USD',
        status: 'PAID',
      },
    });

    // H. Store Review
    await prisma.storeReview.deleteMany({ where: { storeId: store.id } });
    await prisma.storeReview.create({
      data: {
        storeId: store.id,
        reviewerName: 'Abebe Kebede',
        reviewerEmail: 'customer@demo.com',
        rating: 5,
        title: `Best experience with ${s.name}`,
        comment: `Excellent customer service and very prompt order fulfillment. I always check their catalog on MyMall.`,
        isVerifiedPurchase: true,
        isApproved: true,
      },
    });

    console.log(`✅ Seeded store: ${s.name} (${s.slug}) | Owner: ${s.ownerEmail} | Cashier: ${s.cashierEmail}`);
  }

  // 7. Site Reviews (General Platform Reviews)
  await prisma.siteReview.deleteMany();
  await prisma.siteReview.createMany({
    data: [
      {
        reviewerName: 'Dr. Michael Bekele',
        reviewerEmail: 'bekele@ethionet.et',
        rating: 5,
        title: 'Transformational Marketplace for Addis Ababa',
        comment: 'MyMall brings genuine local merchants and customers together with transparent bank transfers, Telebirr, and live GPS map deliveries.',
        isApproved: true,
      },
      {
        reviewerName: 'Hanah Yilma',
        reviewerEmail: 'hanah@gmail.com',
        rating: 5,
        title: 'Effortless and smooth shopping',
        comment: 'From boutique streetwear to fresh supermarket goods, everything arrives safely and on time. Great UI experience!',
        isApproved: true,
      },
    ],
  });

  // 8. Sample Verified Orders with Real GPS Coordinates
  const urbanStore = await prisma.store.findUnique({ where: { slug: 'urbantrend' } });
  if (urbanStore) {
    const products = await prisma.product.findMany({ where: { storeId: urbanStore.id } });
    if (products.length > 0) {
      await prisma.order.deleteMany({ where: { storeId: urbanStore.id } });

      // Delivery Order
      await prisma.order.create({
        data: {
          orderNumber: `ORD-${urbanStore.id}-SEED-1001`,
          storeId: urbanStore.id,
          customerName: 'Sophia Martinez',
          customerEmail: 'customer@example.com',
          customerPhone: '+251-91-9876543',
          orderType: OrderType.DELIVERY,
          shippingAddress: 'Bole Atlas, Near Edna Mall, Addis Ababa',
          deliveryLatitude: 9.005401,
          deliveryLongitude: 38.789123,
          deliveryInstructions: 'Blue building, 3rd floor, apartment 3B. Please call before arrival.',
          subtotal: 65.00,
          taxAmount: 9.75,
          shippingCost: 5.00,
          totalAmount: 79.75,
          status: OrderStatus.PROCESSING,
          paymentMethod: 'BANK_TRANSFER_SCREENSHOT',
          paymentProofUrl: '/uploads/screenshots/sample_bank_receipt.jpg',
          paymentProofStatus: PaymentProofStatus.VERIFIED,
          items: {
            create: [
              { productId: products[0].id, quantity: 1, unitPrice: 65.00, subtotal: 65.00 },
            ],
          },
        },
      });

      // Pickup Order
      if (products.length > 1) {
        await prisma.order.create({
          data: {
            orderNumber: `ORD-${urbanStore.id}-SEED-1002`,
            storeId: urbanStore.id,
            customerName: 'Abebe Kebede',
            customerEmail: 'customer@demo.com',
            customerPhone: '+251-92-3344556',
            orderType: OrderType.PICKUP,
            shippingAddress: 'Bole Medhanialem Mall, In-Store Pickup Counter',
            subtotal: 98.00,
            taxAmount: 14.70,
            shippingCost: 0.00,
            totalAmount: 112.70,
            status: OrderStatus.READY_FOR_PICKUP,
            paymentMethod: 'TELEBIRR',
            paymentProofStatus: PaymentProofStatus.VERIFIED,
            items: {
              create: [
                { productId: products[1].id, quantity: 1, unitPrice: 98.00, subtotal: 98.00 },
              ],
            },
          },
        });
      }
    }
  }

  // 9. Pre-seed Multi-Party Live Chat Conversations
  // Conversation A: Customer <-> Store Owner (UrbanTrend Fashion)
  if (urbanStore) {
    const chat1 = await prisma.chatConversation.create({
      data: {
        type: ConversationType.STORE_CUSTOMER,
        storeId: urbanStore.id,
        customerId: customer1.id,
        lastMessageAt: new Date(),
        messages: {
          create: [
            {
              senderId: customer1.id,
              content: 'Hello UrbanTrend! Do you have the Oversized Vintage Hoodie in Washed Black size Large in stock?',
              createdAt: new Date(Date.now() - 3600000),
            },
            {
              senderId: urbanStore.ownerId,
              content: 'Hello Sophia! Yes, we have 15 units available in size Large. You can place your order online with delivery right to Bole Atlas.',
              createdAt: new Date(Date.now() - 1800000),
            },
          ],
        },
      },
    });

    // Conversation B: Store Owner <-> Platform Admin
    await prisma.chatConversation.create({
      data: {
        type: ConversationType.ADMIN_STORE,
        storeId: urbanStore.id,
        adminId: superAdmin.id,
        lastMessageAt: new Date(),
        messages: {
          create: [
            {
              senderId: urbanStore.ownerId,
              content: 'Hi Admin support, our store subscription renewal is verified via CBE transfer proof. Thank you!',
              createdAt: new Date(Date.now() - 7200000),
            },
            {
              senderId: superAdmin.id,
              content: 'Hello Elena! We have verified your receipt and your Professional plan is active with 5x search rank boost. Let us know if you need any assistance!',
              createdAt: new Date(Date.now() - 3600000),
            },
          ],
        },
      },
    });

    // Conversation C: Customer <-> Platform Admin (Platform Support)
    await prisma.chatConversation.create({
      data: {
        type: ConversationType.ADMIN_CUSTOMER,
        customerId: customer1.id,
        adminId: superAdmin.id,
        lastMessageAt: new Date(),
        messages: {
          create: [
            {
              senderId: customer1.id,
              content: 'Hello MyMall support, is it possible to pay with Telebirr across multiple stores at the same time?',
              createdAt: new Date(Date.now() - 5400000),
            },
            {
              senderId: superAdmin.id,
              content: 'Hi Sophia! Currently each store has its direct Telebirr merchant number for safe direct settlements. You can checkout per store smoothly!',
              createdAt: new Date(Date.now() - 1200000),
            },
          ],
        },
      },
    });
  }

  console.log('🎉 MyMall Database Seeding Completed Successfully with All 5 Stores, Accounts, and Chat Threads!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
