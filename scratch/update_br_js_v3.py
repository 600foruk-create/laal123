import sys

file_path = r'C:\Users\Hamza\Desktop\1122\SOFTIFYXFINANCIALS\assets\js\bank_receipts.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix addRow
old_add_row = '''                  tr.innerHTML = `
                      <td class="row-selector" style="width: 30px; text-align:center; height: 20px;"></td>
                      <td class="br-grid-cell" style="width: 90px; position:relative;">
                          <input type="text" class="br-grid-input inv-no" value="${data.invoice_no || ''}">
                      </td>
                      <td class="br-grid-cell" style="width: 95px;"><input type="${data.invoice_date ? 'date' : 'text'}" onfocus="(this.type='date')" onblur="if(!this.value) this.type='text'" class="br-grid-input inv-date" value="${data.invoice_date || ''}"></td>
                      <td class="br-grid-cell" style="width: 140px;"><input type="text" class="br-grid-input num received-amt" value="${data.received_amount || ''}"></td>
                      <td class="br-grid-cell" style="width: 60px;"><input type="text" class="br-grid-input num wht-rate" value="${data.wht_rate || ''}"></td>
                      <td class="br-grid-cell" style="width: 85px;"><input type="text" class="br-grid-input num wht-amt" value="${data.wht_amount || ''}" readonly></td>
                      <td class="br-grid-cell" style="width: 60px;"><input type="text" class="br-grid-input num gst-rate" value="${data.gst_rate || ''}"></td>
                      <td class="br-grid-cell" style="width: 85px;"><input type="text" class="br-grid-input num gst-amt" value="${data.gst_amount || ''}" readonly></td>
                      <td class="br-grid-cell" style="width: 75px;"><input type="text" class="br-grid-input num adv-adj" value="${data.advance_adjusted || ''}"></td>
                      <td class="br-grid-cell" style="width: 75px;"><input type="text" class="br-grid-input num disc-given" value="${data.discount_given || ''}"></td>
                      <td class="br-grid-cell" style="width: auto;"><input type="text" class="br-grid-input num tot-credited" value="${data.total_credited || ''}" readonly></td>
                  `;
                  this.setupInvoiceSearch(tr);'''
                  
new_add_row = '''                  tr.innerHTML = `
                      <td class="row-selector" style="width: 30px; text-align:center; height: 20px;"></td>
                      <td class="br-grid-cell" style="width: 90px; position:relative;">
                          <input type="text" class="br-grid-input inv-no" ondblclick="window.BRModule.showPendingInvoices()" value="${data.invoice_no || ''}">
                      </td>
                      <td class="br-grid-cell" style="width: 95px;"><input type="${data.invoice_date ? 'date' : 'text'}" onfocus="(this.type='date')" onblur="if(!this.value) this.type='text'" class="br-grid-input inv-date" value="${data.invoice_date || ''}"></td>
                      <td class="br-grid-cell" style="width: 140px;"><input type="text" class="br-grid-input num received-amt" value="${data.received_amount || ''}"></td>
                      <td class="br-grid-cell" style="width: 60px;"><input type="text" class="br-grid-input num wht-rate" value="${data.wht_rate || ''}"></td>
                      <td class="br-grid-cell" style="width: 85px;"><input type="text" class="br-grid-input num wht-amt" value="${data.wht_amount || ''}" readonly></td>
                      <td class="br-grid-cell" style="width: 60px;"><input type="text" class="br-grid-input num gst-rate" value="${data.gst_rate || ''}"></td>
                      <td class="br-grid-cell" style="width: 85px;"><input type="text" class="br-grid-input num gst-amt" value="${data.gst_amount || ''}" readonly></td>
                      <td class="br-grid-cell" style="width: 75px;"><input type="text" class="br-grid-input num adv-adj" value="${data.advance_adjusted || ''}"></td>
                      <td class="br-grid-cell" style="width: 75px;"><input type="text" class="br-grid-input num disc-given" value="${data.discount_given || ''}"></td>
                      <td class="br-grid-cell" style="width: auto;"><input type="text" class="br-grid-input num tot-credited" value="${data.total_credited || ''}" readonly></td>
                  `;
                  this.setupRowInvoiceSearch(tr);'''
                  
if old_add_row in content:
    content = content.replace(old_add_row, new_add_row)
else:
    print('Failed to replace addRow')

# Remove old setupInvoiceSearch, searchInvoices, selectInvoice
start_idx = content.find('setupInvoiceSearch: function(tr) {')
end_idx = content.find('setupRowSmartSearch: function(tr) {')

if start_idx != -1 and end_idx != -1:
    old_block = content[start_idx:end_idx]
    content = content.replace(old_block, '')
else:
    print('Failed to remove old block')

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print('Success')
