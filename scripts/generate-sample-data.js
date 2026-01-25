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

const employeesData = [
  ['Employee ID', 'Name', 'Department', 'Role', 'Hire Date', 'Salary', 'Status'],
  ['EMP001', 'Alice Chen', 'Engineering', 'Senior Developer', '2021-03-15', 125000, 'Active'],
  ['EMP002', 'Bob Martinez', 'Sales', 'Account Executive', '2022-06-01', 85000, 'Active'],
  ['EMP003', 'Carol White', 'Marketing', 'Marketing Manager', '2020-09-20', 95000, 'Active'],
  ['EMP004', 'Daniel Kim', 'Engineering', 'DevOps Engineer', '2023-01-10', 110000, 'Active'],
  ['EMP005', 'Eva Johnson', 'HR', 'HR Specialist', '2021-11-05', 72000, 'Active'],
  ['EMP006', 'Frank Lee', 'Finance', 'Financial Analyst', '2022-04-18', 88000, 'Active'],
  ['EMP007', 'Grace Park', 'Engineering', 'Junior Developer', '2024-02-01', 75000, 'Active'],
  ['EMP008', 'Henry Zhao', 'Sales', 'Sales Director', '2019-07-22', 140000, 'Active'],
  ['EMP009', 'Ivy Brown', 'Support', 'Support Lead', '2020-12-10', 68000, 'Active'],
  ['EMP010', 'Jack Wilson', 'Engineering', 'Tech Lead', '2018-05-30', 155000, 'Active'],
];

const customersData = [
  ['Customer ID', 'Company Name', 'Contact', 'Email', 'Country', 'Industry', 'Annual Revenue', 'Status'],
  ['CUST001', 'TechCorp Inc', 'John Smith', 'john@techcorp.com', 'USA', 'Technology', 5000000, 'Active'],
  ['CUST002', 'Global Retail', 'Sarah Johnson', 'sarah@globalretail.com', 'Canada', 'Retail', 12000000, 'Active'],
  ['CUST003', 'HealthFirst', 'Michael Brown', 'michael@healthfirst.com', 'USA', 'Healthcare', 8500000, 'Active'],
  ['CUST004', 'EduLearn', 'Emily Davis', 'emily@edulearn.com', 'UK', 'Education', 2500000, 'Active'],
  ['CUST005', 'FinanceHub', 'David Wilson', 'david@financehub.com', 'USA', 'Finance', 25000000, 'Active'],
  ['CUST006', 'GreenEnergy', 'Lisa Taylor', 'lisa@greenenergy.com', 'Germany', 'Energy', 15000000, 'Active'],
  ['CUST007', 'AutoDrive', 'James Anderson', 'james@autodrive.com', 'Japan', 'Automotive', 45000000, 'Active'],
  ['CUST008', 'FoodWorks', 'Amanda Martinez', 'amanda@foodworks.com', 'Mexico', 'Food & Beverage', 6000000, 'Inactive'],
  ['CUST009', 'MediaMax', 'Robert Garcia', 'robert@mediamax.com', 'USA', 'Media', 3500000, 'Active'],
  ['CUST010', 'BuildRight', 'Jennifer Lee', 'jennifer@buildright.com', 'Australia', 'Construction', 18000000, 'Active'],
];

const expensesData = [
  ['Expense ID', 'Date', 'Category', 'Description', 'Amount', 'Department', 'Approved'],
  ['EXP001', '2024-01-05', 'Travel', 'Client visit - NYC', 1250.00, 'Sales', 'Yes'],
  ['EXP002', '2024-01-08', 'Software', 'Annual license renewal', 5400.00, 'Engineering', 'Yes'],
  ['EXP003', '2024-01-12', 'Marketing', 'Trade show booth', 8500.00, 'Marketing', 'Yes'],
  ['EXP004', '2024-01-15', 'Office Supplies', 'Q1 supplies order', 890.50, 'Operations', 'Yes'],
  ['EXP005', '2024-01-18', 'Training', 'Team certification course', 3200.00, 'Engineering', 'Yes'],
  ['EXP006', '2024-01-22', 'Travel', 'Conference attendance', 2100.00, 'Marketing', 'Yes'],
  ['EXP007', '2024-01-25', 'Equipment', 'New monitors x5', 1750.00, 'Engineering', 'Yes'],
  ['EXP008', '2024-02-01', 'Consulting', 'Security audit', 12000.00, 'Engineering', 'Pending'],
  ['EXP009', '2024-02-05', 'Marketing', 'Digital ad campaign', 15000.00, 'Marketing', 'Yes'],
  ['EXP010', '2024-02-10', 'Travel', 'Customer onboarding trip', 980.00, 'Support', 'Yes'],
];

const revenueData = [
  ['Date', 'Product Line', 'Channel', 'Units Sold', 'Revenue', 'Cost', 'Profit'],
  ['2024-01-01', 'Electronics', 'Online', 145, 43500, 29000, 14500],
  ['2024-01-01', 'Furniture', 'Retail', 32, 15800, 9500, 6300],
  ['2024-01-01', 'Electronics', 'Retail', 89, 26700, 17800, 8900],
  ['2024-01-08', 'Electronics', 'Online', 178, 53400, 35600, 17800],
  ['2024-01-08', 'Furniture', 'Online', 45, 22500, 13500, 9000],
  ['2024-01-08', 'Furniture', 'Retail', 28, 14000, 8400, 5600],
  ['2024-01-15', 'Electronics', 'Online', 201, 60300, 40200, 20100],
  ['2024-01-15', 'Electronics', 'Retail', 95, 28500, 19000, 9500],
  ['2024-01-15', 'Furniture', 'Online', 52, 26000, 15600, 10400],
  ['2024-01-22', 'Electronics', 'Online', 189, 56700, 37800, 18900],
  ['2024-01-22', 'Furniture', 'Retail', 41, 20500, 12300, 8200],
  ['2024-01-29', 'Electronics', 'Online', 215, 64500, 43000, 21500],
  ['2024-01-29', 'Furniture', 'Online', 58, 29000, 17400, 11600],
  ['2024-01-29', 'Electronics', 'Retail', 102, 30600, 20400, 10200],
];

const projectsData = [
  ['Project ID', 'Project Name', 'Client', 'Start Date', 'End Date', 'Budget', 'Spent', 'Status'],
  ['PRJ001', 'Website Redesign', 'TechCorp Inc', '2024-01-15', '2024-04-30', 75000, 45000, 'In Progress'],
  ['PRJ002', 'Mobile App v2', 'Global Retail', '2024-02-01', '2024-07-31', 150000, 62000, 'In Progress'],
  ['PRJ003', 'Data Migration', 'HealthFirst', '2023-11-01', '2024-02-28', 95000, 92000, 'Completed'],
  ['PRJ004', 'CRM Integration', 'FinanceHub', '2024-03-01', '2024-06-30', 55000, 12000, 'In Progress'],
  ['PRJ005', 'Security Upgrade', 'EduLearn', '2024-01-10', '2024-03-15', 40000, 38500, 'Completed'],
  ['PRJ006', 'Analytics Dashboard', 'MediaMax', '2024-02-15', '2024-05-31', 85000, 28000, 'In Progress'],
  ['PRJ007', 'API Development', 'AutoDrive', '2024-04-01', '2024-09-30', 120000, 0, 'Planning'],
  ['PRJ008', 'Cloud Migration', 'GreenEnergy', '2023-09-01', '2024-01-31', 200000, 195000, 'Completed'],
];

// Create workbook with multiple sheets
const workbook = XLSX.utils.book_new();

const sheets = [
  { data: salesData, name: 'Sales' },
  { data: inventoryData, name: 'Inventory' },
  { data: targetData, name: 'Targets' },
  { data: employeesData, name: 'Employees' },
  { data: customersData, name: 'Customers' },
  { data: expensesData, name: 'Expenses' },
  { data: revenueData, name: 'Revenue' },
  { data: projectsData, name: 'Projects' },
];

sheets.forEach(({ data, name }) => {
  const sheet = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(workbook, sheet, name);
});

// Write the workbook
const outputPath = join(dataDir, 'sample_workbook.xlsx');
XLSX.writeFile(workbook, outputPath);

const sheetNames = sheets.map(s => s.name).join(', ');
console.log(`Created Excel file: ${outputPath}`);
console.log(`   Sheets (${sheets.length}): ${sheetNames}`);

