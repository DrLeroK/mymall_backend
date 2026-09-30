export interface CSVProductRecord {
  name: string;
  category?: string;
  sku?: string;
  barcode?: string;
  costPrice?: number;
  sellingPrice: number;
  stockQuantity?: number;
  lowStockThreshold?: number;
  unit?: string;
  description?: string;
}

export function parseCSVProducts(csvText: string): CSVProductRecord[] {
  const lines = csvText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length <= 1) return [];

  const headerLine = lines[0];
  const headers = headerLine.split(',').map((h) => h.trim().replace(/^["']|["']$/g, '').toLowerCase());

  const records: CSVProductRecord[] = [];

  for (let i = 1; i < lines.length; i++) {
    // Regex to split by comma outside quotes
    const values = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || lines[i].split(',');
    const cleanValues = values.map((v) => v.trim().replace(/^["']|["']$/g, ''));

    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = cleanValues[idx] || '';
    });

    if (!row.name || !row.sellingprice) continue;

    records.push({
      name: row.name,
      category: row.category || undefined,
      sku: row.sku || undefined,
      barcode: row.barcode || undefined,
      costPrice: row.costprice ? parseFloat(row.costprice) : 0,
      sellingPrice: parseFloat(row.sellingprice),
      stockQuantity: row.stockquantity ? parseFloat(row.stockquantity) : 0,
      lowStockThreshold: row.lowstockthreshold ? parseFloat(row.lowstockthreshold) : 5,
      unit: row.unit || 'pcs',
      description: row.description || undefined,
    });
  }

  return records;
}

export function generateProductsCSV(products: any[]): string {
  const headers = ['id', 'name', 'category', 'sku', 'barcode', 'costPrice', 'sellingPrice', 'stockQuantity', 'unit', 'isActive'];
  const rows = products.map((p) => [
    p.id,
    `"${(p.name || '').replace(/"/g, '""')}"`,
    `"${(p.category?.name || '').replace(/"/g, '""')}"`,
    p.sku || '',
    p.barcode || '',
    p.costPrice,
    p.sellingPrice,
    p.stockQuantity,
    p.unit,
    p.isActive,
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}
