const fs = require('fs');
const file = 'd:\\SOFTIFYX FINANCIAL\\SOFTIFYXFINANCIALS\\assets\\js\\sale_order.js';
let content = fs.readFileSync(file, 'utf8');

const reps = [
    ["tr.querySelector('.pieces').value = (data.pieces && parseFloat(data.pieces) !== 0) ? data.pieces : '';", "tr.querySelector('.pieces').value = (data.pieces !== null && data.pieces !== undefined && data.pieces !== '') ? parseFloat(data.pieces).toFixed(2) : '0.00';"],
    ["tr.querySelector('.qty').value = ((data.quantity || data.qty) && parseFloat(data.quantity || data.qty) !== 0) ? (data.quantity || data.qty) : '';", "tr.querySelector('.qty').value = (data.quantity || data.qty || data.quantity === 0 || data.qty === 0) ? parseFloat(data.quantity || data.qty).toFixed(2) : '0.00';"],
    ["tr.querySelector('.rate').value = (data.rate && parseFloat(data.rate) !== 0) ? data.rate : '';", "tr.querySelector('.rate').value = (data.rate !== null && data.rate !== undefined && data.rate !== '') ? parseFloat(data.rate).toFixed(2) : '0.00';"],
    ["tr.querySelector('.val-excl').value = ((data.value_excl_tax || data.val_excl_tax) && parseFloat(data.value_excl_tax || data.val_excl_tax) !== 0) ? (data.value_excl_tax || data.val_excl_tax) : '';", "tr.querySelector('.val-excl').value = (data.value_excl_tax || data.val_excl_tax || data.value_excl_tax === 0 || data.val_excl_tax === 0) ? parseFloat(data.value_excl_tax || data.val_excl_tax).toFixed(2) : '0.00';"],
    ["tr.querySelector('.tax-rate').value = (data.tax_rate && parseFloat(data.tax_rate) !== 0) ? data.tax_rate : '';", "tr.querySelector('.tax-rate').value = (data.tax_rate !== null && data.tax_rate !== undefined && data.tax_rate !== '') ? parseFloat(data.tax_rate).toFixed(2) : '0.00';"],
    ["tr.querySelector('.tax-amt').value = (data.tax_amount && parseFloat(data.tax_amount) !== 0) ? data.tax_amount : '';", "tr.querySelector('.tax-amt').value = (data.tax_amount !== null && data.tax_amount !== undefined && data.tax_amount !== '') ? parseFloat(data.tax_amount).toFixed(2) : '0.00';"],
    ["tr.querySelector('.frth-rate').value = (data.further_tax_rate && parseFloat(data.further_tax_rate) !== 0) ? data.further_tax_rate : '';", "tr.querySelector('.frth-rate').value = (data.further_tax_rate !== null && data.further_tax_rate !== undefined && data.further_tax_rate !== '') ? parseFloat(data.further_tax_rate).toFixed(2) : '0.00';"],
    ["tr.querySelector('.frth-amt').value = (data.further_tax_amount && parseFloat(data.further_tax_amount) !== 0) ? data.further_tax_amount : '';", "tr.querySelector('.frth-amt').value = (data.further_tax_amount !== null && data.further_tax_amount !== undefined && data.further_tax_amount !== '') ? parseFloat(data.further_tax_amount).toFixed(2) : '0.00';"],
    ["tr.querySelector('.val-incl').value = ((data.value_incl_tax || data.val_incl_tax) && parseFloat(data.value_incl_tax || data.val_incl_tax) !== 0) ? (data.value_incl_tax || data.val_incl_tax) : '';", "tr.querySelector('.val-incl').value = (data.value_incl_tax || data.val_incl_tax || data.value_incl_tax === 0 || data.val_incl_tax === 0) ? parseFloat(data.value_incl_tax || data.val_incl_tax).toFixed(2) : '0.00';"]
];

reps.forEach(r => content = content.replace(r[0], r[1]));

fs.writeFileSync(file, content, 'utf8');
console.log('done');
