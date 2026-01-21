/**
 * Script to generate sample Excel files for testing
 * Run with: node scripts/generate-sample-data.js
 */

import * as XLSX from 'xlsx';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dataDir = join(__dirname, '..', 'data');

// Sample data for multiple sheets
const salesData = [
  ['Order ID', 'Date', 'Customer', 'Product', 'Category', 'Quantity', 'Amount'],
  ['ORD001', '2024-01-05', 'John Smith', 'Laptop Pro', 'Electronics', 2, 2599.98],
  ['ORD002', '2024-01-06', 'Sarah Johnson', 'Wireless Mouse', 'Electronics', 5, 149.95],
  ['ORD003', '2024-01-07', 'Michael Brown', 'Office Chair', 'Furniture', 3, 749.97],
  ['ORD004', '2024-01-08', 'Emily Davis', 'USB Hub', 'Electronics', 10, 199.90],
  ['ORD005', '2024-01-10', 'David Wilson', 'Standing Desk', 'Furniture', 1, 599.99],
  ['ORD006', '2024-01-12', 'Jessica Taylor', 'Monitor 27"', 'Electronics', 2, 699.98],
  ['ORD007', '2024-01-15', 'James Anderson', 'Keyboard', 'Electronics', 3, 239.97],
  ['ORD008', '2024-01-17', 'Amanda Martinez', 'Desk Lamp', 'Furniture', 6, 275.94],
];

const inventoryData = [
  ['Product ID', 'Product Name', 'Category', 'Stock', 'Reorder Level', 'Unit Cost', 'Unit Price'],
  ['PROD001', 'Laptop Pro', 'Electronics', 45, 20, 950, 1299.99],
  ['PROD002', 'Wireless Mouse', 'Electronics', 250, 100, 15, 29.99],
  ['PROD003', 'Office Chair', 'Furniture', 80, 30, 150, 249.99],
  ['PROD004', 'USB Hub', 'Electronics', 400, 150, 8, 19.99],
  ['PROD005', 'Standing Desk', 'Furniture', 25, 10, 350, 599.99],
  ['PROD006', 'Monitor 27"', 'Electronics', 60, 25, 200, 349.99],
  ['PROD007', 'Keyboard', 'Electronics', 180, 75, 35, 79.99],
  ['PROD008', 'Desk Lamp', 'Furniture', 300, 100, 22, 45.99],
];

const targetData = [
  ['Month', 'Region', 'Target', 'Actual', 'Variance'],
  ['January', 'North', 100000, 105000, 5000],
  ['January', 'South', 80000, 75000, -5000],
  ['January', 'East', 90000, 92000, 2000],
  ['January', 'West', 70000, 68000, -2000],
  ['February', 'North', 105000, 110000, 5000],
  ['February', 'South', 85000, 88000, 3000],
  ['February', 'East', 95000, 91000, -4000],
  ['February', 'West', 75000, 78000, 3000],
  ['March', 'North', 110000, 115000, 5000],
  ['March', 'South', 90000, 95000, 5000],
  ['March', 'East', 100000, 102000, 2000],
  ['March', 'West', 80000, 82000, 2000],
];

// Create workbook with multiple sheets
const workbook = XLSX.utils.book_new();

const salesSheet = XLSX.utils.aoa_to_sheet(salesData);
XLSX.utils.book_append_sheet(workbook, salesSheet, 'Sales');

const inventorySheet = XLSX.utils.aoa_to_sheet(inventoryData);
XLSX.utils.book_append_sheet(workbook, inventorySheet, 'Inventory');

const targetSheet = XLSX.utils.aoa_to_sheet(targetData);
XLSX.utils.book_append_sheet(workbook, targetSheet, 'Targets');

// Write the workbook
const outputPath = join(dataDir, 'sample_workbook.xlsx');
XLSX.writeFile(workbook, outputPath);

console.log(`✅ Created Excel file: ${outputPath}`);
console.log('   Sheets: Sales, Inventory, Targets');

