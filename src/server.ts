import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import app from './app';
import { connectDB } from './config/db';
import { initSocket } from './sockets/socket';
import { startBillingCron } from './jobs/billingCron';

const PORT = process.env.PORT || 5001;

async function startServer() {
  // Connect to Database
  await connectDB();

  // Create HTTP Server
  const server = http.createServer(app);

  // Initialize Socket.io Server
  initSocket(server);

  // Start Subscription Billing Cycle Cron Worker
  startBillingCron();

  // Listen on PORT
  server.listen(PORT, () => {
    console.log(`🚀 MyMall Backend running at http://localhost:${PORT}`);
    console.log(`📡 Socket.io engine initialized and listening.`);
  });
}

startServer();
