import cron from 'node-cron';
import { BillingService } from '../services/billingService';

export function startBillingCron() {
  // Run every 6 hours
  cron.schedule('0 */6 * * *', async () => {
    console.log('⏰ Running Automated Subscription Billing Expiration Worker...');
    try {
      const result = await BillingService.checkSubscriptionExpirations();
      console.log(`✅ Subscription Cron completed. ${result.updatedStores} stores updated.`);
    } catch (error) {
      console.error('❌ Subscription Cron Error:', error);
    }
  });

  console.log('⏳ Automated Billing Cycle Cron Worker initialized.');
}
