<?php
$files = [
    'assets/js/purchase_invoice_v2.js',
    'assets/js/purchase_order.js',
    'assets/js/purchase_order_v2.js',
    'assets/js/purchase_return.js',
    'assets/js/purchase_return_v2.js',
    'assets/js/sale_order.js',
    'assets/js/sale_return.js',
    'assets/js/quotation.js',
    'assets/js/delivery_challans.js',
    'assets/js/material_issue_notes.js',
    'assets/js/outward_gate_passes.js',
    'assets/js/inward_gate_passes.js',
    'assets/js/inventory_transfers.js',
    'assets/js/add_inventory_adjustments.js',
    'assets/js/reduce_inventory_adjustments.js',
    'assets/js/production_notes.js'
];

foreach ($files as $file) {
    if (!file_exists($file)) {
        echo "File not found: $file\n";
        continue;
    }
    
    $content = file_get_contents($file);
    
    // Pattern to find: 
    // const matches = this.inventory.filter(i => {
    //    ...
    // }).slice(0, 15);
    //
    // Since whitespace varies, we can use a regex.
    
    $pattern = '/const\s+matches\s*=\s*this\.inventory\.filter\(\s*i\s*=>\s*\{.*?(?:return\s*searchWords\.every|searchStr\.includes).*?\}\)\.slice\(\s*0\s*,\s*15\s*\)\s*;/s';
    
    $replacement = "const matches = typeof window.smartSearchFilterAndSort === 'function' ? \n                window.smartSearchFilterAndSort(this.inventory, val) : \n                this.inventory.filter(i => {\n                    const code = i.item_code || i.code || '';\n                    const name = i.item_name || i.name || '';\n                    const searchStr = `${code} ${name}`.toLowerCase();\n                    return searchWords.every(word => (typeof window.smartSearchMatchWord === 'function' ? window.smartSearchMatchWord(searchStr, word) : searchStr.includes(word)));\n                }).slice(0, 15);";
                
    if (preg_match($pattern, $content)) {
        $newContent = preg_replace($pattern, $replacement, $content);
        file_put_contents($file, $newContent);
        echo "Updated $file\n";
    } else {
        echo "Target not found in $file\n";
    }
}
