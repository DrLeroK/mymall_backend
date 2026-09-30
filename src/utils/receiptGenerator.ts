export interface POSReceiptData {
  receiptNumber: string;
  storeName: string;
  storeAddress?: string;
  storePhone?: string;
  storeCurrency: string;
  cashierName: string;
  customerName?: string;
  date: string;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  netAmount: number;
  paymentMethod: string;
}

export function generateReceiptHTML(data: POSReceiptData): string {
  const itemRows = data.items
    .map(
      (item) => `
    <tr>
      <td style="padding: 4px 0;">${item.name} x${item.quantity}</td>
      <td style="padding: 4px 0; text-align: right;">${data.storeCurrency} ${item.subtotal.toFixed(2)}</td>
    </tr>
  `
    )
    .join('');

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <title>Receipt ${data.receiptNumber}</title>
    <style>
      body { font-family: 'Courier New', Courier, monospace; width: 300px; margin: 0 auto; padding: 15px; background: #fff; color: #000; }
      .header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 10px; margin-bottom: 10px; }
      .header h2 { margin: 0 0 5px 0; font-size: 18px; }
      .header p { margin: 2px 0; font-size: 12px; }
      .info { font-size: 12px; margin-bottom: 10px; border-bottom: 1px dashed #000; padding-bottom: 10px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      .totals { margin-top: 10px; border-top: 1px dashed #000; padding-top: 8px; font-size: 12px; }
      .totals div { display: flex; justify-content: space-between; margin-bottom: 3px; }
      .footer { text-align: center; margin-top: 15px; font-size: 11px; border-top: 1px dashed #000; padding-top: 10px; }
    </style>
  </head>
  <body>
    <div class="header">
      <h2>${data.storeName}</h2>
      ${data.storeAddress ? `<p>${data.storeAddress}</p>` : ''}
      ${data.storePhone ? `<p>Tel: ${data.storePhone}</p>` : ''}
    </div>
    
    <div class="info">
      <div>Receipt #: <strong>${data.receiptNumber}</strong></div>
      <div>Date: ${data.date}</div>
      <div>Cashier: ${data.cashierName}</div>
      ${data.customerName ? `<div>Customer: ${data.customerName}</div>` : ''}
    </div>

    <table>
      <thead>
        <tr style="border-bottom: 1px solid #000;">
          <th style="text-align: left; padding-bottom: 4px;">Item</th>
          <th style="text-align: right; padding-bottom: 4px;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
    </table>

    <div class="totals">
      <div><span>Subtotal:</span><span>${data.storeCurrency} ${data.subtotal.toFixed(2)}</span></div>
      ${data.discountAmount > 0 ? `<div><span>Discount:</span><span>-${data.storeCurrency} ${data.discountAmount.toFixed(2)}</span></div>` : ''}
      ${data.taxAmount > 0 ? `<div><span>Tax:</span><span>${data.storeCurrency} ${data.taxAmount.toFixed(2)}</span></div>` : ''}
      <div style="font-weight: bold; font-size: 14px; margin-top: 5px;">
        <span>TOTAL PAID (${data.paymentMethod}):</span>
        <span>${data.storeCurrency} ${data.netAmount.toFixed(2)}</span>
      </div>
    </div>

    <div class="footer">
      <p>Thank you for shopping with us!</p>
      <p>Powered by MyMall Multi-Tenant SaaS Platform</p>
    </div>
  </body>
  </html>
  `;
}
