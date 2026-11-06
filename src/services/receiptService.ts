import { StorageService } from './storageService';

export interface SubscriptionReceiptInput {
  storeName: string;
  planName: string;
  amount: number;
  currency: string;
  invoiceNumber: string;
  txRef: string;
  paymentDate: Date;
  isUpgrade?: boolean;
  ownerName?: string;
  ownerEmail?: string;
}

export interface OrderReceiptInput {
  storeName: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  items: {
    name: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }[];
  subtotal: number;
  taxAmount: number;
  shippingCost: number;
  totalAmount: number;
  currency: string;
  txRef: string;
  paymentDate: Date;
  shippingAddress?: string | null;
}

export class ReceiptService {
  /**
   * Generate official digital payment receipt document for Store SaaS Subscriptions
   */
  static async generateSubscriptionReceiptFile(data: SubscriptionReceiptInput): Promise<string> {
    const formattedDate = data.paymentDate.toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Receipt - ${data.invoiceNumber}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: #f8fafc;
      margin: 0;
      padding: 30px 15px;
      color: #0f172a;
    }
    .receipt-container {
      max-width: 650px;
      margin: 0 auto;
      background: #ffffff;
      border-radius: 20px;
      border: 1px solid #e2e8f0;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #0e7490, #0369a1);
      color: #ffffff;
      padding: 30px;
      position: relative;
    }
    .brand {
      font-size: 24px;
      font-weight: 900;
      letter-spacing: -0.5px;
    }
    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .badge-paid {
      background-color: #ecfdf5;
      color: #059669;
      border: 1px solid #a7f3d0;
    }
    .content {
      padding: 30px;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 25px;
    }
    .label {
      font-size: 11px;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }
    .value {
      font-size: 14px;
      font-weight: 600;
      color: #1e293b;
    }
    .table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 15px;
      margin-bottom: 25px;
    }
    .table th {
      text-align: left;
      font-size: 11px;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 10px;
    }
    .table td {
      padding: 12px 0;
      font-size: 14px;
      border-bottom: 1px solid #f1f5f9;
    }
    .total-card {
      background: #f8fafc;
      border-radius: 12px;
      padding: 16px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 20px;
    }
    .total-amount {
      font-size: 24px;
      font-weight: 900;
      color: #0e7490;
    }
    .footer {
      padding: 20px 30px;
      background: #f8fafc;
      border-top: 1px solid #e2e8f0;
      text-align: center;
      font-size: 12px;
      color: #64748b;
    }
    .print-btn {
      display: inline-block;
      margin: 15px 0 0;
      background: #0e7490;
      color: #ffffff;
      padding: 10px 24px;
      border-radius: 10px;
      font-weight: 700;
      font-size: 13px;
      text-decoration: none;
      border: none;
      cursor: pointer;
    }
    @media print {
      body { background: #ffffff; padding: 0; }
      .receipt-container { box-shadow: none; border: none; max-width: 100%; }
      .print-btn { display: none; }
    }
  </style>
</head>
<body>
  <div class="receipt-container">
    <div class="header">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div class="brand">MyMall</div>
          <div style="font-size: 13px; opacity: 0.9; margin-top: 4px;">SaaS Subscription Official Receipt</div>
        </div>
        <div style="text-align: right;">
          <span class="badge badge-paid">PAID & VERIFIED</span>
          <div style="font-size: 11px; margin-top: 6px; opacity: 0.9;">Chapa Instant Gateway</div>
        </div>
      </div>
    </div>

    <div class="content">
      <div class="grid">
        <div>
          <div class="label">Invoice Number</div>
          <div class="value" style="font-family: monospace;">${data.invoiceNumber}</div>
        </div>
        <div>
          <div class="label">Date & Time</div>
          <div class="value">${formattedDate}</div>
        </div>
        <div>
          <div class="label">Subscribed Store</div>
          <div class="value">${data.storeName}</div>
        </div>
        <div>
          <div class="label">Store Owner</div>
          <div class="value">${data.ownerName || 'Store Owner'} (${data.ownerEmail || 'N/A'})</div>
        </div>
        <div>
          <div class="label">Gateway Reference (txRef)</div>
          <div class="value" style="font-family: monospace; font-size: 12px;">${data.txRef}</div>
        </div>
        <div>
          <div class="label">Payment Channel</div>
          <div class="value">Chapa Online Payment</div>
        </div>
      </div>

      <table class="table">
        <thead>
          <tr>
            <th>Description</th>
            <th style="text-align: right;">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <strong>${data.planName} Plan</strong>
              <div style="font-size: 12px; color: #64748b; margin-top: 2px;">
                ${data.isUpgrade ? 'Plan Upgrade & Subscription Extension' : 'Store Subscription Activation'}
              </div>
            </td>
            <td style="text-align: right; font-weight: 700;">
              ${data.currency} ${data.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </td>
          </tr>
        </tbody>
      </table>

      <div class="total-card">
        <div>
          <div class="label" style="margin-bottom: 2px;">Total Paid</div>
          <div style="font-size: 12px; color: #64748b;">Fully cleared with Chapa</div>
        </div>
        <div class="total-amount">${data.currency} ${data.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
      </div>

      <div style="text-align: center; margin-top: 25px;">
        <button class="print-btn" onclick="window.print()">Print / Save PDF</button>
      </div>
    </div>

    <div class="footer">
      This official electronic receipt serves as legitimate proof of subscription payment on the MyMall platform.<br>
      © ${new Date().getFullYear()} MyMall Multi-Tenant SaaS. All rights reserved.
    </div>
  </div>
</body>
</html>`;

    const buffer = Buffer.from(html, 'utf-8');
    const filename = `receipt-sub-${data.invoiceNumber}-${Date.now()}.html`;
    return StorageService.uploadBuffer(buffer, filename, 'text/html; charset=utf-8', 'receipts');
  }

  /**
   * Generate official digital payment receipt document for Customer Store Orders
   */
  static async generateOrderReceiptFile(data: OrderReceiptInput): Promise<string> {
    const formattedDate = data.paymentDate.toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    const itemsRows = data.items
      .map(
        (item) => `
        <tr>
          <td>
            <strong>${item.name}</strong>
            <div style="font-size: 11px; color: #64748b;">Qty: ${item.quantity} × ${data.currency} ${item.unitPrice.toFixed(2)}</div>
          </td>
          <td style="text-align: right; font-weight: 700;">
            ${data.currency} ${item.subtotal.toFixed(2)}
          </td>
        </tr>`
      )
      .join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Order Receipt - ${data.orderNumber}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: #f8fafc;
      margin: 0;
      padding: 30px 15px;
      color: #0f172a;
    }
    .receipt-container {
      max-width: 650px;
      margin: 0 auto;
      background: #ffffff;
      border-radius: 20px;
      border: 1px solid #e2e8f0;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #0f172a, #1e293b);
      color: #ffffff;
      padding: 30px;
    }
    .brand {
      font-size: 22px;
      font-weight: 900;
    }
    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .badge-paid {
      background-color: #ecfdf5;
      color: #059669;
      border: 1px solid #a7f3d0;
    }
    .content {
      padding: 30px;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 25px;
    }
    .label {
      font-size: 11px;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }
    .value {
      font-size: 14px;
      font-weight: 600;
      color: #1e293b;
    }
    .table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 15px;
      margin-bottom: 20px;
    }
    .table th {
      text-align: left;
      font-size: 11px;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 10px;
    }
    .table td {
      padding: 12px 0;
      font-size: 14px;
      border-bottom: 1px solid #f1f5f9;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      font-size: 13px;
      padding: 6px 0;
      color: #475569;
    }
    .total-card {
      background: #f8fafc;
      border-radius: 12px;
      padding: 16px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 15px;
    }
    .total-amount {
      font-size: 24px;
      font-weight: 900;
      color: #059669;
    }
    .footer {
      padding: 20px 30px;
      background: #f8fafc;
      border-top: 1px solid #e2e8f0;
      text-align: center;
      font-size: 12px;
      color: #64748b;
    }
    .print-btn {
      display: inline-block;
      margin: 15px 0 0;
      background: #0f172a;
      color: #ffffff;
      padding: 10px 24px;
      border-radius: 10px;
      font-weight: 700;
      font-size: 13px;
      text-decoration: none;
      border: none;
      cursor: pointer;
    }
    @media print {
      body { background: #ffffff; padding: 0; }
      .receipt-container { box-shadow: none; border: none; max-width: 100%; }
      .print-btn { display: none; }
    }
  </style>
</head>
<body>
  <div class="receipt-container">
    <div class="header">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div class="brand">${data.storeName}</div>
          <div style="font-size: 13px; opacity: 0.8; margin-top: 4px;">Customer Official Order Receipt</div>
        </div>
        <div style="text-align: right;">
          <span class="badge badge-paid">PAID & VERIFIED</span>
          <div style="font-size: 11px; margin-top: 6px; opacity: 0.8;">Chapa Online Checkout</div>
        </div>
      </div>
    </div>

    <div class="content">
      <div class="grid">
        <div>
          <div class="label">Order Number</div>
          <div class="value" style="font-family: monospace;">${data.orderNumber}</div>
        </div>
        <div>
          <div class="label">Payment Date</div>
          <div class="value">${formattedDate}</div>
        </div>
        <div>
          <div class="label">Customer Name</div>
          <div class="value">${data.customerName}</div>
        </div>
        <div>
          <div class="label">Contact Info</div>
          <div class="value">${data.customerEmail} ${data.customerPhone ? '• ' + data.customerPhone : ''}</div>
        </div>
        <div>
          <div class="label">Transaction Reference</div>
          <div class="value" style="font-family: monospace; font-size: 12px;">${data.txRef}</div>
        </div>
        <div>
          <div class="label">Delivery Address</div>
          <div class="value">${data.shippingAddress || 'In-store Pickup'}</div>
        </div>
      </div>

      <table class="table">
        <thead>
          <tr>
            <th>Item Purchased</th>
            <th style="text-align: right;">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRows}
        </tbody>
      </table>

      <div style="padding: 10px 0; border-top: 1px solid #e2e8f0;">
        <div class="summary-row">
          <span>Subtotal</span>
          <span>${data.currency} ${data.subtotal.toFixed(2)}</span>
        </div>
        ${
          data.shippingCost > 0
            ? `<div class="summary-row">
                 <span>Delivery Fee</span>
                 <span>${data.currency} ${data.shippingCost.toFixed(2)}</span>
               </div>`
            : ''
        }
        ${
          data.taxAmount > 0
            ? `<div class="summary-row">
                 <span>Tax / VAT</span>
                 <span>${data.currency} ${data.taxAmount.toFixed(2)}</span>
               </div>`
            : ''
        }
      </div>

      <div class="total-card">
        <div>
          <div class="label" style="margin-bottom: 2px;">Total Amount Paid</div>
          <div style="font-size: 12px; color: #64748b;">Instant online clearance via Chapa</div>
        </div>
        <div class="total-amount">${data.currency} ${data.totalAmount.toFixed(2)}</div>
      </div>

      <div style="text-align: center; margin-top: 25px;">
        <button class="print-btn" onclick="window.print()">Print / Save PDF</button>
      </div>
    </div>

    <div class="footer">
      Thank you for shopping with ${data.storeName}! Powered by MyMall Multi-Tenant Platform.<br>
      This digital receipt confirms verified settlement of your purchase.
    </div>
  </div>
</body>
</html>`;

    const buffer = Buffer.from(html, 'utf-8');
    const filename = `receipt-order-${data.orderNumber}-${Date.now()}.html`;
    return StorageService.uploadBuffer(buffer, filename, 'text/html; charset=utf-8', 'receipts');
  }
}
